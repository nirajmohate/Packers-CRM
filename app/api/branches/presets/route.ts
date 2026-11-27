import { api } from '@/lib/server/http';
import { requireRecentPassword } from '@/lib/server/recentAuth';
import { audit } from '@/lib/server/audit';
import { Branch, Doc, Lead, Settings, User } from '@/lib/server/models';
import { BRANCH_PRESETS, COMPANY_EMAIL, type BranchPreset } from '@/lib/branchPresets';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** Works out what "Set up the 17 branches" would do, without changing anything. */
async function plan() {
  const rows = (await Branch.find({}).lean()) as Rec[];
  const used = new Set<string>();
  const items = BRANCH_PRESETS.map((p: BranchPreset) => {
    const names = [p.name, ...(p.match ?? [])].map(norm);
    const hit = rows.find((b) => !used.has(String(b._id)) && b.code === p.code) ?? rows.find((b) => !used.has(String(b._id)) && (names.includes(norm(b.name)) || names.includes(norm(b.city))));
    if (hit) used.add(String(hit._id));
    const codeTaken = !hit && rows.some((b) => b.code === p.code);
    return { preset: p, existing: hit ? { id: String(hit._id), name: String(hit.name), code: String(hit.code), active: hit.active !== false } : null, codeTaken };
  });
  // branches that are not one of the 17: emptied ones are deleted, the rest switched off (their data stays)
  const others = await Promise.all(rows.filter((b) => !used.has(String(b._id))).map(async (b) => {
    const id = String(b._id);
    const [docs, users, leads] = await Promise.all([Doc.countDocuments({ branchId: id }), User.countDocuments({ branchId: id }), Lead.countDocuments({ branchId: id })]);
    return { id, name: String(b.name), code: String(b.code), active: b.active !== false, docs, users, leads, action: docs || users || leads ? 'switch off' : 'delete' };
  }));
  return { items, others };
}

export const GET = api({ auth: 'admin' }, async () => {
  const p = await plan();
  return {
    add: p.items.filter((i) => !i.existing).map((i) => ({ name: i.preset.name, code: i.codeTaken ? `${i.preset.code}?` : i.preset.code })),
    update: p.items.filter((i) => i.existing).map((i) => ({ name: i.existing!.name, as: i.preset.name, code: i.existing!.code })),
    others: p.others.map((o) => ({ name: o.name, code: o.code, action: o.action, docs: o.docs })),
  };
});

export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  await requireRecentPassword(req);
  const p = await plan();
  let added = 0;
  let updated = 0;
  for (const i of p.items) {
    const { preset } = i;
    const contact = { city: preset.city, address: preset.address, phone: preset.phone, phone2: preset.phone2 ?? '' };
    if (i.existing) {
      // keep its name and code (document numbers use the code); refresh the contact details; switch it on
      await Branch.updateOne({ _id: i.existing.id }, { $set: { ...contact, active: true } });
      updated++;
    } else {
      let code = preset.code;
      for (let n = 2; await Branch.exists({ code }); n++) code = `${preset.code.slice(0, 4)}${n}`;
      await Branch.create({ name: preset.name, code, ...contact, active: true });
      added++;
    }
  }
  let off = 0;
  let removed = 0;
  for (const o of p.others) {
    if (o.action === 'delete') { await Branch.deleteOne({ _id: o.id }); await Settings.deleteOne({ _id: `branch:${o.id}` }); removed++; }
    else if (o.active) { await Branch.updateOne({ _id: o.id }, { $set: { active: false } }); off++; }
  }
  // the company email printed on every PDF (same for all branches), only when none is saved yet
  await Settings.updateOne({ _id: 'global', $or: [{ 'profile.email': { $exists: false } }, { 'profile.email': '' }] }, { $set: { 'profile.email': COMPANY_EMAIL } }).catch(() => undefined);
  await audit(user, { action: 'update', entity: 'branch', summary: `Set up the ${BRANCH_PRESETS.length} Cloud Packers branches: ${added} added, ${updated} updated, ${off} switched off, ${removed} deleted` });
  return { added, updated, off, removed };
});

export const dynamic = 'force-dynamic';
