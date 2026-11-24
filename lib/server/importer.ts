/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { z } from 'zod';
import type { SessionUser } from '../types';
import { BY_SLUG } from '../config';
import { PROFILE_KEYS, RULE_KEYS } from '../defaults';
import { fyOf } from '../numbering';
import { audit } from './audit';
import { counterKey, refreshBillMeta, sanitize } from './docs';
import { ApiError } from './http';
import { Asset, Branch, Counter, Doc, Settings } from './models';
import { decodeImage } from './shared';
import { loadBundle, saveSettings } from './settings';

export const ImportBody = z.object({
  docs: z.array(z.any()).max(20000),
  branchMap: z.record(z.string(), z.string()),
  defaultBranchId: z.string(),
  settings: z.object({ company: z.record(z.string(), z.any()).optional(), terms: z.record(z.string(), z.array(z.string())).optional() }).optional(),
});

const okDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const asDate = (s: unknown) => { const d = new Date(String(s)); return Number.isNaN(d.getTime()) ? new Date() : d; };

/** One-time import of the documents that Stage 1 kept in the browser. Receipts are re-linked to their bills. */
export async function importLegacy(user: SessionUser, body: z.infer<typeof ImportBody>) {
  const wanted = new Set([body.defaultBranchId, ...Object.values(body.branchMap)]);
  for (const id of wanted) if (!Types.ObjectId.isValid(id) || !(await Branch.findById(id).lean())) throw new ApiError(422, 'One of the chosen branches does not exist');

  const report = { imported: 0, duplicates: 0, invalid: 0, relinked: 0, settings: 'skipped' as string };
  const idMap = new Map<string, string>();
  const numToNew = new Map<string, string>();
  const maxSeq = new Map<string, number>();
  const ordered = [...body.docs].sort((a, b) => (a?.type === 'bill' ? 0 : 1) - (b?.type === 'bill' ? 0 : 1));
  const bills: string[] = [];

  // settings first, so numbering counters use the imported rules
  const s = body.settings;
  if (s?.company) {
    try {
      const c = s.company as Record<string, any>;
      const profile: Record<string, unknown> = {};
      for (const k of PROFILE_KEYS) if (!/Id$|Ratio$|^signRatio$/.test(k) && typeof c[k] === 'string') profile[k] = c[k];
      for (const [field, kind, ratio, rk] of [['logo', 'logo', 'logoRatio', 'logoId'], ['stamp', 'stamp', 'stampRatio', 'stampId'], ['signature', 'signature', 'signRatio', 'signatureId']] as const) {
        if (typeof c[field] === 'string' && c[field].startsWith('data:image/')) {
          const { mime, buf } = decodeImage(c[field]);
          const a = await Asset.create({ kind, scope: 'global', mime, size: buf.length, ratio: Number(c[ratio]) || 1, data: buf, createdBy: user.id });
          profile[rk] = String(a._id); profile[ratio] = Number(c[ratio]) || 1;
        }
      }
      const rules: Record<string, unknown> = {};
      for (const k of RULE_KEYS) if (c[k] !== undefined) rules[k] = c[k];
      await saveSettings(user, { scope: 'global', profile: profile as never, rules: rules as never, terms: s.terms });
      report.settings = 'imported';
    } catch (e) {
      report.settings = `skipped (${e instanceof ApiError ? e.message : 'invalid data'})`;
    }
  } else if (s?.terms) {
    await saveSettings(user, { scope: 'global', terms: s.terms });
    report.settings = 'terms imported';
  }
  const rules = (await loadBundle()).global;

  for (const d of ordered) {
    const cfg = d && typeof d === 'object' ? BY_SLUG[d.type] : undefined;
    if (!cfg || !okDate(d.docDate) || typeof d.number !== 'string' || !d.number.trim()) { report.invalid++; continue; }
    const branchId = body.branchMap[String(d.branchId ?? '')] ?? body.defaultBranchId;
    const { data, items } = sanitize(cfg, d.data, d.items);
    if (cfg.slug === 'receipt') {
      const linked = idMap.get(String(d.data?.againstId ?? '')) ?? numToNew.get(String(d.data?.againstDoc ?? ''));
      if (linked) { data.againstId = linked; report.relinked++; } else delete data.againstId;
    }
    const number = d.number.trim().slice(0, 60);
    if (await Doc.findOne({ type: cfg.slug, number }).lean()) { report.duplicates++; continue; }
    const fy = typeof d.fy === 'string' && /^\d{4}-\d{2}$/.test(d.fy) ? d.fy : fyOf(d.docDate);
    const seq = Number.isInteger(d.seq) ? d.seq : parseInt(number.match(/(\d+)\s*$/)?.[1] ?? '', 10);
    const _id = new Types.ObjectId();
    const status = cfg.slug === 'bill' ? (d.status === 'Cancelled' ? 'Cancelled' : 'Unpaid') : cfg.statuses.includes(d.status) ? d.status : cfg.statuses[0];
    try {
      await Doc.collection.insertOne({
        _id, type: cfg.slug, number, ...(Number.isFinite(seq) ? { seq } : {}), fy, status, docDate: d.docDate, branchId,
        ...(d.deletedAt ? { deletedAt: asDate(d.deletedAt), deletedBy: user.id } : {}),
        createdBy: user.id, createdByName: 'Imported', updatedByName: 'Imported', rev: 1, data, items, meta: {},
        createdAt: asDate(d.createdAt), updatedAt: asDate(d.updatedAt),
      } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) { report.duplicates++; continue; }
      throw e;
    }
    idMap.set(String(d.id), String(_id));
    numToNew.set(number, String(_id));
    if (cfg.slug === 'bill') bills.push(String(_id));
    if (Number.isFinite(seq)) { const k = counterKey(cfg.slug, rules, branchId, fy, d.docDate); maxSeq.set(k, Math.max(maxSeq.get(k) ?? 0, seq)); }
    report.imported++;
  }

  for (const [k, seq] of maxSeq) {
    const cur = (await Counter.findById(k).lean()) as { seq?: number } | null;
    if (!cur) { try { await Counter.create({ _id: k, seq }); continue; } catch { /* created meanwhile */ } }
    if ((cur?.seq ?? 0) < seq) await Counter.updateOne({ _id: k }, { $set: { seq } });
  }
  for (const id of bills) await refreshBillMeta(id);
  await Settings.updateOne({ _id: 'meta' }, { $set: { rules: { importedAt: new Date().toISOString(), report } } }, { upsert: true });
  await audit(user, { action: 'import', entity: 'import', summary: `Imported ${report.imported} documents from the browser (${report.duplicates} duplicates skipped, ${report.invalid} invalid). Settings: ${report.settings}` });
  return report;
}
