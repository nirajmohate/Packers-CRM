/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import type { AuditChange, Company, DocRecord, ModuleConfig, Row, SessionUser } from '../types';
import { BY_SLUG } from '../config';
import { billInfo } from '../ledger';
import { fyOf, formatNumber } from '../numbering';
import { cleanData, validateDoc } from '../validateDoc';
import { audit } from './audit';
import { ApiError } from './http';
import { Branch, Counter, Doc } from './models';
import { loadBundle } from './settings';

type Rec = Record<string, any>;
const live = { deletedAt: { $exists: false } };
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : undefined);
const DAY = 86_400_000;
export const TRASH_DAYS = 30;

export const docOut = (d: Rec): DocRecord => ({
  id: String(d._id), type: d.type, number: d.number, seq: d.seq, fy: d.fy, status: d.status, docDate: d.docDate,
  branchId: d.branchId, deletedAt: iso(d.deletedAt), createdAt: iso(d.createdAt) as string, updatedAt: iso(d.updatedAt) as string,
  rev: d.rev, createdByName: d.createdByName, updatedByName: d.updatedByName, data: d.data ?? {}, items: d.items ?? [],
});

const scopeOf = (u: SessionUser): Rec => (u.role === 'manager' ? { branchId: u.branchId } : {});
const validDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const bad = (msg: string, fields: Record<string, string>) => new ApiError(422, msg, fields);

async function loadDoc(user: SessionUser, id: string, deleted = false): Promise<Rec> {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Document not found');
  const d = await Doc.findOne({ _id: id, ...scopeOf(user), ...(deleted ? { deletedAt: { $exists: true } } : live) }).lean();
  if (!d) throw new ApiError(404, 'Document not found');
  return d as Rec;
}

/* ---------- cleaning what the browser sends ---------- */
const MONEY_KEYS = ['discount', 'discountType', 'gstRate', 'gstMode', 'roundOff', 'advance'];
export function sanitize(cfg: ModuleConfig, rawData: unknown, rawItems: unknown) {
  const keys = new Set([...cfg.sections.flatMap((s) => s.fields.map((f) => f.key)), 'terms', ...(cfg.money ? MONEY_KEYS : [])]);
  const data: Record<string, string> = {};
  if (rawData && typeof rawData === 'object') {
    for (const [k, v] of Object.entries(rawData as Rec)) {
      if (!keys.has(k) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      data[k] = String(v).slice(0, k === 'body' || k === 'terms' ? 20000 : 2000);
    }
  }
  const items: Row[] = [];
  if (cfg.columns && Array.isArray(rawItems)) {
    for (const r of rawItems.slice(0, 300)) {
      if (!r || typeof r !== 'object') continue;
      const row: Row = {};
      for (const c of cfg.columns) { const v = (r as Rec)[c.key]; row[c.key] = typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, 500) : ''; }
      items.push(row);
    }
  }
  return { data: cleanData(cfg, data), items };
}

/* ---------- numbering ---------- */
async function nextSeq(key: string): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const r = (await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { returnDocument: 'after' }).lean()) as Rec | null;
    if (r) return r.seq;
    try { await Counter.create({ _id: key, seq: 0 }); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
  }
  throw new ApiError(503, 'Numbering is busy, please try again');
}
export const counterKey = (slug: string, rules: Pick<Company, 'numberPerBranch' | 'numberFyReset'>, branchId: string, fy: string) =>
  `${slug}|${rules.numberPerBranch ? branchId : '-'}|${rules.numberFyReset ? fy : '-'}`;

export async function previewNumber(user: SessionUser, type: string, branchId: string | undefined, date: string) {
  const cfg = BY_SLUG[type];
  if (!cfg) throw new ApiError(400, 'Unknown document type');
  if (!validDate(date)) throw new ApiError(400, 'Invalid date');
  const bid = user.role === 'manager' ? user.branchId! : branchId;
  const branch = bid && Types.ObjectId.isValid(bid) ? ((await Branch.findById(bid).lean()) as Rec | null) : null;
  if (!branch) throw new ApiError(400, 'Choose a branch');
  const rules = (await loadBundle()).global;
  const fy = fyOf(date);
  const c = (await Counter.findById(counterKey(cfg.slug, rules, String(branch._id), fy)).lean()) as Rec | null;
  return { number: formatNumber(rules.numberFormat, { prefix: cfg.prefix, br: branch.code, fy, seq: (c?.seq ?? 0) + 1 }) };
}

/* ---------- bills and their receipts ---------- */
async function receiptsOf(billId: string, excludeId?: string): Promise<Rec[]> {
  const list = (await Doc.find({ type: 'receipt', 'data.againstId': billId, ...live }).lean()) as Rec[];
  return excludeId ? list.filter((r) => String(r._id) !== excludeId) : list;
}

/** Keeps a small summary on each bill so unpaid old bills can be found without loading everything. */
export async function refreshBillMeta(billId: string | undefined | null) {
  if (!billId || !Types.ObjectId.isValid(billId)) return;
  const bill = (await Doc.findById(billId).lean()) as Rec | null;
  if (!bill || bill.type !== 'bill') return;
  const rec = docOut(bill);
  const info = billInfo(rec, [rec, ...(await receiptsOf(billId)).map(docOut)], '');
  const cancelled = info.status === 'Cancelled';
  await Doc.updateOne({ _id: billId }, { $set: { meta: { total: info.calc.total, paid: info.calc.paid, balance: cancelled ? 0 : info.calc.balance, status: info.status } } });
}

async function billBalanceFor(againstId: string, branchId: string, excludeReceiptId?: string): Promise<number> {
  const fail = (m: string) => bad('Please fix the highlighted fields', { againstId: m });
  if (!Types.ObjectId.isValid(againstId)) throw fail('Bill not found');
  const bill = (await Doc.findOne({ _id: againstId, type: 'bill', branchId, ...live }).lean()) as Rec | null;
  if (!bill) throw fail('Bill not found in this branch');
  if (bill.status === 'Cancelled') throw fail('This bill is cancelled');
  const rec = docOut(bill);
  return billInfo(rec, [rec, ...(await receiptsOf(againstId, excludeReceiptId)).map(docOut)], '', excludeReceiptId).calc.balance;
}

/* ---------- validation shared by create and update ---------- */
async function validated(cfg: ModuleConfig, input: Rec, branchId: string, self?: Rec) {
  const { data, items } = sanitize(cfg, input.data, input.items);
  if (!validDate(input.docDate)) throw bad('Please fix the highlighted fields', { docDate: 'Pick a valid date' });
  const selfId = self ? String(self._id) : undefined;
  let billBalance: number | null = null;
  if (cfg.slug === 'receipt' && data.againstId) billBalance = await billBalanceFor(data.againstId, branchId, selfId);
  let receivedBefore = 0;
  if (cfg.slug === 'bill' && selfId) receivedBefore = (await receiptsOf(selfId)).reduce((a, r) => a + (parseFloat(r.data?.amount) || 0), 0);
  const errs = validateDoc(cfg, data, items, { docDate: input.docDate, number: 'AUTO', docs: [], selfId, home: '', billBalance, receivedBefore });
  delete errs.number;
  if (Object.keys(errs).length) throw bad('Please fix the highlighted fields', errs);
  if (cfg.slug === 'receipt' && data.againstId) {
    const bill = (await Doc.findById(data.againstId).lean()) as Rec | null;
    data.againstDoc = bill?.number ?? data.againstDoc;
  }
  return { data, items };
}

/* ---------- create ---------- */
export async function createDoc(user: SessionUser, input: Rec) {
  const cfg = BY_SLUG[String(input.type)];
  if (!cfg) throw new ApiError(400, 'Unknown document type');
  const branchId = user.role === 'manager' ? user.branchId! : String(input.branchId ?? '');
  const branch = Types.ObjectId.isValid(branchId) ? ((await Branch.findById(branchId).lean()) as Rec | null) : null;
  if (!branch || branch.active === false) throw bad('Please choose an active branch', { branchId: 'Choose a branch' });
  const { data, items } = await validated(cfg, input, branchId);
  const status = cfg.slug === 'bill' ? 'Unpaid' : cfg.statuses.includes(input.status) ? input.status : cfg.statuses[0];
  const rules = (await loadBundle()).global;
  const fy = fyOf(input.docDate);
  const base = { type: cfg.slug, status, docDate: input.docDate, branchId, createdBy: user.id, createdByName: user.name, updatedByName: user.name, rev: 1, data, items, meta: {} };

  let created: Rec | null = null;
  const manual = typeof input.number === 'string' ? input.number.trim().slice(0, 60) : '';
  if (manual) {
    try { created = (await Doc.create({ ...base, number: manual, fy })).toObject(); } catch (e) {
      if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'This number is already used', { number: 'This number is already used' });
      throw e;
    }
  } else {
    for (let i = 0; i < 25 && !created; i++) {
      const seq = await nextSeq(counterKey(cfg.slug, rules, branchId, fy));
      const number = formatNumber(rules.numberFormat, { prefix: cfg.prefix, br: branch.code, fy, seq });
      try { created = (await Doc.create({ ...base, number, seq, fy })).toObject(); } catch (e) { if ((e as { code?: number }).code !== 11000) throw e; }
    }
    if (!created) throw new ApiError(503, 'Could not assign a document number, please try again');
  }
  const made = created as Rec;
  if (cfg.slug === 'bill') await refreshBillMeta(String(made._id));
  if (cfg.slug === 'receipt') await refreshBillMeta(data.againstId);
  await audit(user, { action: 'create', entity: 'doc', entityId: String(made._id), docType: cfg.slug, docNumber: made.number, branchId, summary: `Created ${cfg.title} ${made.number}` });
  return docOut((await Doc.findById(made._id).lean()) as Rec);
}

/* ---------- update ---------- */
const cut = (s: string) => (s.length > 160 ? s.slice(0, 157) + '…' : s);
function diffDoc(cfg: ModuleConfig, before: Rec, after: { number: string; status: string; docDate: string; data: Record<string, string>; items: Row[] }): AuditChange[] {
  const out: AuditChange[] = [];
  const push = (field: string, a: unknown, b: unknown) => { const x = String(a ?? ''), y = String(b ?? ''); if (x !== y) out.push({ field, from: cut(x), to: cut(y) }); };
  push('Number', before.number, after.number);
  push('Status', before.status, after.status);
  push('Date', before.docDate, after.docDate);
  const labels = new Map(cfg.sections.flatMap((s) => s.fields).map((f) => [f.key, f.label]));
  const bd = before.data ?? {};
  for (const k of new Set([...Object.keys(bd), ...Object.keys(after.data)])) push(labels.get(k) ?? k, bd[k], after.data[k]);
  const bi: Row[] = before.items ?? [];
  const n = Math.max(bi.length, after.items.length);
  if (bi.length !== after.items.length) push('Items', `${bi.length} rows`, `${after.items.length} rows`);
  for (let i = 0; i < n; i++) {
    for (const c of cfg.columns ?? []) push(`Item ${i + 1}: ${c.label}`, bi[i]?.[c.key], after.items[i]?.[c.key]);
  }
  return out;
}

export async function updateDoc(user: SessionUser, id: string, input: Rec) {
  const cur = await loadDoc(user, id);
  const cfg = BY_SLUG[cur.type];
  if (!cfg) throw new ApiError(400, 'Unknown document type');
  if (typeof input.rev === 'number' && input.rev !== cur.rev)
    throw new ApiError(409, 'Someone else changed this document. Reload it and try again.', undefined, 'conflict');
  const { data, items } = await validated(cfg, input, cur.branchId, cur);
  let number = cur.number;
  const want = typeof input.number === 'string' ? input.number.trim().slice(0, 60) : '';
  if (want && want !== cur.number) number = want;
  const status = cfg.slug === 'bill' ? cur.status : cfg.statuses.includes(input.status) ? input.status : cur.status;
  const next = { number, status, docDate: input.docDate as string, data, items };
  const changes = diffDoc(cfg, cur, next);
  try {
    const res = await Doc.updateOne({ _id: id, rev: cur.rev }, { $set: { ...next, fy: number === cur.number ? cur.fy : fyOf(next.docDate), updatedByName: user.name }, $inc: { rev: 1 }, ...(number !== cur.number ? { $unset: { seq: '' } } : {}) });
    if (res.matchedCount === 0) throw new ApiError(409, 'Someone else changed this document. Reload it and try again.', undefined, 'conflict');
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw new ApiError(409, 'This number is already used', { number: 'This number is already used' });
    throw e;
  }
  if (cfg.slug === 'bill') {
    if (number !== cur.number) await Doc.updateMany({ type: 'receipt', 'data.againstId': id }, { $set: { 'data.againstDoc': number } });
    await refreshBillMeta(id);
  }
  if (cfg.slug === 'receipt') { await refreshBillMeta(cur.data?.againstId); if (data.againstId !== cur.data?.againstId) await refreshBillMeta(data.againstId); }
  await audit(user, { action: 'update', entity: 'doc', entityId: id, docType: cfg.slug, docNumber: number, branchId: cur.branchId, summary: `Edited ${cfg.title} ${number}`, changes });
  return docOut((await Doc.findById(id).lean()) as Rec);
}

export async function setStatus(user: SessionUser, id: string, status: string) {
  const cur = await loadDoc(user, id);
  const cfg = BY_SLUG[cur.type];
  let next = status;
  if (cfg.slug === 'bill') {
    if (status === 'Cancelled') next = 'Cancelled';
    else if (cur.status === 'Cancelled') next = 'Unpaid';
    else throw new ApiError(400, 'A bill\'s status follows its payments');
  } else if (!cfg.statuses.includes(status)) throw new ApiError(400, 'Unknown status');
  if (next === cur.status) return docOut(cur);
  await Doc.updateOne({ _id: id }, { $set: { status: next, updatedByName: user.name }, $inc: { rev: 1 } });
  if (cfg.slug === 'bill') await refreshBillMeta(id);
  await audit(user, { action: 'status', entity: 'doc', entityId: id, docType: cfg.slug, docNumber: cur.number, branchId: cur.branchId, summary: `${cfg.title} ${cur.number}: ${cur.status} to ${next}`, changes: [{ field: 'Status', from: cur.status, to: next }] });
  return docOut((await Doc.findById(id).lean()) as Rec);
}

/* ---------- delete / restore / purge ---------- */
export async function softDelete(user: SessionUser, id: string) {
  const cur = await loadDoc(user, id);
  await Doc.updateOne({ _id: id }, { $set: { deletedAt: new Date(), deletedBy: user.id, updatedByName: user.name }, $inc: { rev: 1 } });
  if (cur.type === 'receipt') await refreshBillMeta(cur.data?.againstId);
  await audit(user, { action: 'delete', entity: 'doc', entityId: id, docType: cur.type, docNumber: cur.number, branchId: cur.branchId, summary: `Moved ${BY_SLUG[cur.type]?.title} ${cur.number} to the recycle bin` });
}

export async function restoreDoc(user: SessionUser, id: string) {
  const cur = await loadDoc(user, id, true);
  await Doc.updateOne({ _id: id }, { $unset: { deletedAt: '', deletedBy: '' }, $set: { updatedByName: user.name }, $inc: { rev: 1 } });
  if (cur.type === 'receipt') await refreshBillMeta(cur.data?.againstId);
  if (cur.type === 'bill') await refreshBillMeta(id);
  await audit(user, { action: 'restore', entity: 'doc', entityId: id, docType: cur.type, docNumber: cur.number, branchId: cur.branchId, summary: `Restored ${BY_SLUG[cur.type]?.title} ${cur.number}` });
  return docOut((await Doc.findById(id).lean()) as Rec);
}

export async function purgeDoc(user: SessionUser, id: string) {
  const cur = await loadDoc(user, id, true);
  await Doc.deleteOne({ _id: id });
  await audit(user, { action: 'purge', entity: 'doc', entityId: id, docType: cur.type, docNumber: cur.number, branchId: cur.branchId, summary: `Permanently deleted ${BY_SLUG[cur.type]?.title} ${cur.number}` });
}

export async function emptyTrash(user: SessionUser, olderThanDays = 0) {
  const q: Rec = { deletedAt: olderThanDays ? { $lt: new Date(Date.now() - olderThanDays * DAY) } : { $exists: true } };
  const n = await Doc.countDocuments(q);
  if (n) {
    await Doc.deleteMany(q);
    await audit(user, { action: 'purge', entity: 'doc', summary: olderThanDays ? `Removed ${n} documents deleted more than ${olderThanDays} days ago` : `Emptied the recycle bin (${n} documents)` });
  }
  return n;
}

/* ---------- reading ---------- */
export async function listDocs(user: SessionUser, opts: { since: string; branchId?: string }) {
  if (!validDate(opts.since)) throw new ApiError(400, 'Invalid date');
  const base: Rec = { ...scopeOf(user), ...live };
  if (user.role === 'admin' && opts.branchId && Types.ObjectId.isValid(opts.branchId)) base.branchId = opts.branchId;
  const inWindow = (await Doc.find({ ...base, docDate: { $gte: opts.since } }).sort({ docDate: -1, createdAt: -1 }).limit(60_000).lean()) as Rec[];
  // unpaid bills older than the window (and their receipts) are always included so balances stay correct
  const olderBills = (await Doc.find({ ...base, type: 'bill', docDate: { $lt: opts.since }, 'meta.balance': { $gt: 0 }, status: { $ne: 'Cancelled' } }).lean()) as Rec[];
  const ids = olderBills.map((b) => String(b._id));
  const olderReceipts = ids.length ? ((await Doc.find({ ...base, type: 'receipt', 'data.againstId': { $in: ids }, docDate: { $lt: opts.since } }).lean()) as Rec[]) : [];
  return [...inWindow, ...olderBills, ...olderReceipts].map(docOut);
}

export async function listTrash(user: SessionUser) {
  if (user.role === 'admin') await emptyTrash(user, TRASH_DAYS);
  const since = new Date(Date.now() - TRASH_DAYS * DAY);
  const rows = (await Doc.find({ ...scopeOf(user), deletedAt: { $gte: since } }).sort({ deletedAt: -1 }).limit(500).lean()) as Rec[];
  return rows.map(docOut);
}

export async function getDoc(user: SessionUser, id: string) {
  return docOut(await loadDoc(user, id));
}
