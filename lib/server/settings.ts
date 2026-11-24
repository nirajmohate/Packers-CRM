import { z } from 'zod';
import { Types } from 'mongoose';
import type { Company, CompanyProfile, SessionUser, SettingsBundle } from '../types';
import { DEFAULT_COMPANY, PROFILE_KEYS, RULE_KEYS } from '../defaults';
import { effectiveCompany } from '../settingsFn';
import { BY_SLUG } from '../config';
import { hasSeqToken, OLD_DEFAULT_FORMAT } from '../numbering';
import { validateValue } from '../validate';
import { audit } from './audit';
import { ApiError } from './http';
import { Asset, Branch, Settings } from './models';

type Rec = Record<string, unknown>;

export async function loadBundle(): Promise<SettingsBundle> {
  const rows = (await Settings.find({}).lean()) as Rec[];
  const bundle: SettingsBundle = { global: { ...DEFAULT_COMPANY }, branch: {}, terms: { global: {}, branch: {} } };
  for (const r of rows) {
    const id = String(r._id);
    if (id === 'global') {
      bundle.global = { ...DEFAULT_COMPANY, ...(r.profile as Rec), ...(r.rules as Rec) } as Company;
      // settings saved with the old default number style switch to the new daily style (QTN/DEL/23-11-26/01)
      if (bundle.global.numberFormat === OLD_DEFAULT_FORMAT) bundle.global.numberFormat = DEFAULT_COMPANY.numberFormat;
      bundle.terms.global = (r.terms as Record<string, string[]>) ?? {};
    } else if (id.startsWith('branch:')) {
      const b = id.slice(7);
      bundle.branch[b] = (r.profile as Partial<CompanyProfile>) ?? {};
      bundle.terms.branch[b] = (r.terms as Record<string, string[]>) ?? {};
    }
  }
  return bundle;
}

/** Managers only ever receive the settings that apply to their own branch, already merged. */
export function bundleFor(user: SessionUser, b: SettingsBundle): SettingsBundle {
  if (user.role === 'admin') return b;
  const bid = user.branchId;
  const terms: Record<string, string[]> = { ...b.terms.global, ...((bid && b.terms.branch[bid]) || {}) };
  return { global: effectiveCompany(b, bid), branch: {}, terms: { global: terms, branch: {} } };
}

const str = (max: number) => z.string().trim().max(max);
const Profile = z.object({
  name: str(120), tagline: str(120), contactPerson: str(80), address: str(400), state: str(60), phone: str(20), email: str(120),
  gstin: str(15), pan: str(10), bankName: str(80), accountName: str(120), accountNo: str(30), ifsc: str(11), upi: str(80),
  logoId: str(40), logoRatio: z.number().min(0.05).max(20), stampId: str(40), stampRatio: z.number().min(0.05).max(20),
  signatureId: str(40), signRatio: z.number().min(0.05).max(20),
}).partial();
const Rules = z.object({
  numberFormat: str(80), numberPerBranch: z.boolean(), numberFyReset: z.boolean(), pdfStamp: z.boolean(), pdfQr: z.boolean(), pdfWatermark: z.boolean(),
}).partial();
export const SettingsUpdate = z.object({
  scope: z.string().min(1).max(40),
  profile: Profile.optional(),
  rules: Rules.optional(),
  /** slug -> lines. null clears a branch override (or resets the company default). */
  terms: z.record(z.string(), z.array(z.string().max(500)).max(30).nullable()).optional(),
});

function checkProfile(p: Record<string, unknown>) {
  const f: Record<string, string> = {};
  const v = (k: string, kind: Parameters<typeof validateValue>[0]) => { const m = typeof p[k] === 'string' ? validateValue(kind, p[k] as string) : ''; if (m) f[k] = m; };
  v('gstin', 'gstin'); v('pan', 'pan'); v('ifsc', 'ifsc'); v('upi', 'upi'); v('email', 'email'); v('phone', 'phone');
  if (Object.keys(f).length) throw new ApiError(422, 'Please fix the highlighted fields', f);
}

export async function saveSettings(user: SessionUser, input: z.infer<typeof SettingsUpdate>) {
  const { scope } = input;
  const isGlobal = scope === 'global';
  if (!isGlobal && !Types.ObjectId.isValid(scope)) throw new ApiError(400, 'Unknown scope');
  if (!isGlobal && !(await Branch.findById(scope).lean())) throw new ApiError(404, 'Branch not found');
  const id = isGlobal ? 'global' : `branch:${scope}`;
  const cur = ((await Settings.findById(id).lean()) as Rec | null) ?? { profile: {}, rules: {}, terms: {} };

  const profile = { ...(cur.profile as Rec) };
  const oldAssets = new Set<string>();
  if (input.profile) {
    checkProfile(input.profile);
    for (const k of PROFILE_KEYS) {
      if (!(k in input.profile)) continue;
      const val = (input.profile as Rec)[k];
      if (isGlobal) profile[k] = val;
      else if (val === '' || val === 0 || val === null) delete profile[k]; // empty = inherit the company default
      else profile[k] = val;
    }
    for (const [idKey, ratioKey] of [['logoId', 'logoRatio'], ['stampId', 'stampRatio'], ['signatureId', 'signRatio']] as const) {
      if (!(idKey in input.profile)) continue;
      const before = (cur.profile as Rec)[idKey];
      const after = profile[idKey];
      if (after) {
        if (!Types.ObjectId.isValid(String(after))) throw new ApiError(422, 'Unknown image', { [idKey]: 'Unknown image' });
        const a = (await Asset.findById(String(after)).lean()) as Rec | null;
        if (!a || a.scope !== scope) throw new ApiError(422, 'Unknown image', { [idKey]: 'Upload the image again' });
        if (!(ratioKey in input.profile)) profile[ratioKey] = a.ratio;
      } else delete profile[ratioKey];
      if (before && before !== after) oldAssets.add(String(before));
    }
  }

  const rules = { ...(cur.rules as Rec) };
  if (input.rules) {
    if (!isGlobal) throw new ApiError(400, 'Numbering and PDF defaults are company-wide');
    const merged = { ...DEFAULT_COMPANY, ...rules, ...input.rules } as Company;
    if (!hasSeqToken(merged.numberFormat)) throw new ApiError(422, 'Please fix the highlighted fields', { numberFormat: 'The format must contain {NNNN} for the running number' });
    if (merged.numberPerBranch && !merged.numberFormat.includes('{BR}')) throw new ApiError(422, 'Please fix the highlighted fields', { numberFormat: 'With separate numbers per branch the format must contain {BR}, or two branches would clash' });
    for (const k of RULE_KEYS) if (k in input.rules) rules[k] = (input.rules as Rec)[k];
  }

  const terms = { ...(cur.terms as Record<string, string[]>) };
  if (input.terms) {
    for (const [slug, lines] of Object.entries(input.terms)) {
      if (!BY_SLUG[slug]) continue;
      if (lines === null) delete terms[slug];
      else terms[slug] = lines.map((l) => l.trim()).filter(Boolean);
    }
  }

  await Settings.updateOne({ _id: id }, { $set: { profile, rules, terms, updatedBy: user.id } }, { upsert: true });
  for (const a of oldAssets) if (Types.ObjectId.isValid(a)) await Asset.deleteOne({ _id: a });
  // uploaded but never saved images for this scope are removed after a while
  const keep = ['logoId', 'stampId', 'signatureId'].map((k) => String(profile[k] ?? '')).filter(Boolean);
  const stale = (await Asset.find({ scope, createdAt: { $lt: new Date(Date.now() - 10 * 60_000) } }).select('_id').lean()) as Rec[];
  for (const a of stale) if (!keep.includes(String(a._id))) await Asset.deleteOne({ _id: a._id });
  await audit(user, {
    action: 'update', entity: 'settings', entityId: id, branchId: isGlobal ? undefined : scope,
    summary: isGlobal ? 'Updated company settings' : 'Updated branch settings',
    changes: Object.keys(input.profile ?? {}).filter((k) => !/Id$|Ratio$|^signRatio$/.test(k)).map((k) => ({ field: k, from: String((cur.profile as Rec)[k] ?? ''), to: /account|upi|ifsc/i.test(k) ? '(changed)' : String((profile as Rec)[k] ?? '') })),
  });
}
