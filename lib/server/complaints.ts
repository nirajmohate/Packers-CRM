import { createHash, randomBytes } from 'crypto';
import type { SessionUser } from '../types';
import { normNumber, suggestBranch, type Complaint as ComplaintOut } from '../complaints';
import { canSee } from '../roles';
import { ApiError } from './http';
import { Branch, Complaint, Doc, Lead } from './models';
import { sendSecurityMessage } from './notify';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Admin and branch owners only (no Team account). */
export function mayUseComplaints(user: SessionUser) {
  if (!canSee(user, 'complaints')) throw new ApiError(403, 'Your account cannot open complaints');
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The website form may name its fields in different ways; these are the names we understand. */
const FIELDS: Record<string, string[]> = {
  name: ['name', 'full_name', 'fullname', 'customer_name', 'your_name', 'cname'],
  phone: ['phone', 'mobile', 'mobile_no', 'mobileno', 'contact', 'contact_no', 'phone_number', 'phone_no', 'number', 'mob'],
  email: ['email', 'email_id', 'emailid', 'mail', 'your_email'],
  refNumber: ['invoice', 'invoice_no', 'invoice_number', 'bill_no', 'bill_number', 'consignment', 'consignment_no', 'consignment_number', 'lr_no', 'lr_number', 'order_no', 'quotation_no', 'booking_id', 'booking_no', 'reference', 'ref_no', 'docket_no'],
  location: ['location', 'city', 'address', 'area', 'from', 'from_city', 'your_location', 'branch'],
  subject: ['subject', 'complaint_type', 'type', 'category', 'issue'],
  message: ['message', 'complaint', 'comments', 'comment', 'details', 'description', 'msg', 'your_complaint', 'your_message'],
};
const SKIP = /^(key|secret|password|pass|token|g-recaptcha-response|recaptcha|captcha|submit|csrf.*|_.*)$/i;

export function readFields(input: Rec) {
  const lower: Rec = {};
  for (const [k, v] of Object.entries(input ?? {})) if (typeof v === 'string' || typeof v === 'number') lower[k.toLowerCase().trim().replace(/[\s-]+/g, '_')] = String(v);
  const pick = (names: string[]) => names.map((n) => lower[n]).find((v) => v && v.trim()) ?? '';
  const used = new Set(Object.values(FIELDS).flat());
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(lower)) {
    if (used.has(k) || SKIP.test(k) || !v.trim() || Object.keys(extra).length >= 25) continue;
    extra[clean(k, 40)] = clean(v, 500);
  }
  return {
    name: clean(pick(FIELDS.name), 100), phone: clean(pick(FIELDS.phone), 30), email: clean(pick(FIELDS.email), 120).toLowerCase(),
    refNumber: clean(pick(FIELDS.refNumber), 60), location: clean(pick(FIELDS.location), 300), subject: clean(pick(FIELDS.subject), 150),
    message: clean(pick(FIELDS.message), 4000), extra,
  };
}

type Signal = { branchId: string; kind: 'number' | 'mobile' | 'email' | 'name'; label: string; docId?: string; docType?: string };

/**
 * Finds the branch a complaint belongs to, from (strongest first): a bill / quotation / LR number,
 * the mobile number, the email, the name. If the strongest kind found points to exactly one branch,
 * the complaint goes there; if it points to several branches or nothing matches, it goes to the admin.
 */
async function findBranch(f: ReturnType<typeof readFields>): Promise<{ branchId: string | null; matchedBy: string; docId: string; docType: string }> {
  const signals: Signal[] = [];
  const live = { deletedAt: { $exists: false } };
  // numbers: the number box, plus anything in the message that looks like a document number (has a "/")
  const nums = new Set<string>();
  if (f.refNumber) nums.add(normNumber(f.refNumber));
  for (const m of f.message.match(/[A-Za-z]{2,5}\s*\/\s*[A-Za-z0-9-]+\s*\/\s*[\w-]+(?:\s*\/\s*[\w-]+)?/g) ?? []) nums.add(normNumber(m));
  const list = [...nums].filter((n) => n.length >= 3).slice(0, 10);
  if (list.length) {
    const docs = (await Doc.find({ ...live, number: { $in: list.map((n) => new RegExp(`^${esc(n)}$`, 'i')) } }).select('branchId number type').limit(20).lean()) as Rec[];
    for (const d of docs) signals.push({ branchId: String(d.branchId), kind: 'number', label: `${String(d.type)} number ${d.number}`, docId: String(d._id), docType: String(d.type) });
  }
  const digits = f.phone.replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    const re = new RegExp(`${digits.split('').join('\\D*')}\\D*$`); // also finds "+91 98765 43210"
    const [docs, leads] = await Promise.all([
      Doc.find({ ...live, 'data.customerPhone': re }).select('branchId number type').sort({ createdAt: -1 }).limit(20).lean() as Promise<Rec[]>,
      Lead.find({ phone: re }).select('branchId').limit(20).lean() as Promise<Rec[]>,
    ]);
    for (const d of docs) signals.push({ branchId: String(d.branchId), kind: 'mobile', label: `mobile number (${d.number})`, docId: String(d._id), docType: String(d.type) });
    for (const l of leads) signals.push({ branchId: String(l.branchId), kind: 'mobile', label: 'mobile number (customer list)' });
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) {
    const re = new RegExp(`^${esc(f.email)}$`, 'i');
    const [docs, leads] = await Promise.all([
      Doc.find({ ...live, 'data.customerEmail': re }).select('branchId number type').limit(20).lean() as Promise<Rec[]>,
      Lead.find({ email: re }).select('branchId').limit(20).lean() as Promise<Rec[]>,
    ]);
    for (const d of docs) signals.push({ branchId: String(d.branchId), kind: 'email', label: `email (${d.number})`, docId: String(d._id), docType: String(d.type) });
    for (const l of leads) signals.push({ branchId: String(l.branchId), kind: 'email', label: 'email (customer list)' });
  }
  const name = f.name.replace(/\s+/g, ' ');
  if (name.length >= 4 && !signals.length) {
    const re = new RegExp(`^\\s*${esc(name).replace(/ /g, '\\s+')}\\s*$`, 'i');
    const [docs, leads] = await Promise.all([
      Doc.find({ ...live, 'data.customerName': re }).select('branchId number type').limit(20).lean() as Promise<Rec[]>,
      Lead.find({ name: re }).select('branchId').limit(20).lean() as Promise<Rec[]>,
    ]);
    for (const d of docs) signals.push({ branchId: String(d.branchId), kind: 'name', label: `name (${d.number})`, docId: String(d._id), docType: String(d.type) });
    for (const l of leads) signals.push({ branchId: String(l.branchId), kind: 'name', label: 'name (customer list)' });
  }
  // strongest kind first; mobile and email count together
  const tiers: Signal['kind'][][] = [['number'], ['mobile', 'email'], ['name']];
  for (const kinds of tiers) {
    const hits = signals.filter((s) => kinds.includes(s.kind));
    if (!hits.length) continue;
    const branches = new Set(hits.map((s) => s.branchId));
    if (branches.size === 1) { const d = hits.find((h) => h.docId); return { branchId: hits[0].branchId, matchedBy: hits[0].label, docId: d?.docId ?? '', docType: d?.docType ?? '' }; }
    return { branchId: null, matchedBy: `unclear: ${kinds.join(' / ')} matches ${branches.size} branches`, docId: '', docType: '' };
  }
  return { branchId: null, matchedBy: '', docId: '', docType: '' };
}

const newRef = () => {
  const d = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(2, 10).replace(/-/g, '');
  return `CMP-${d}-${randomBytes(3).toString('hex').toUpperCase()}`;
};

/** Saves a complaint sent by the website and routes it. Duplicates (same sender and text within 10 minutes) are ignored. */
export async function receiveComplaint(input: Rec) {
  const f = readFields(input);
  if (!f.message && !f.subject) throw new ApiError(422, 'The complaint text is empty');
  if (!f.phone && !f.email && !f.name) throw new ApiError(422, 'No name, mobile or email');
  const dupKey = createHash('sha256').update(`${f.phone}|${f.email}|${f.message.slice(0, 300)}`).digest('hex');
  const dup = (await Complaint.findOne({ dupKey, createdAt: { $gt: new Date(Date.now() - 10 * 60_000) } }).lean()) as Rec | null;
  if (dup) return { ref: String(dup.ref), duplicate: true };

  const [match, branches] = await Promise.all([findBranch(f), Branch.find({ active: { $ne: false } }).select('name city').lean() as Promise<Rec[]>]);
  const suggested = match.branchId ? null : suggestBranch(f.location || f.message.slice(0, 300), branches.map((b) => ({ id: String(b._id), name: String(b.name), city: String(b.city ?? '') })));
  const bName = (id: string | null) => branches.find((b) => String(b._id) === id)?.name ?? '';
  const now = new Date();
  const history = [{ at: now.toISOString(), byName: 'Website', action: 'Complaint received from the website form' }];
  if (match.branchId) history.push({ at: now.toISOString(), byName: 'CRM', action: `Sent to ${bName(match.branchId)} automatically (matched ${match.matchedBy})` });
  else history.push({ at: now.toISOString(), byName: 'CRM', action: `Waiting for the admin${match.matchedBy ? ` (${match.matchedBy})` : ' (no match found)'}${suggested ? `. Location suggests ${bName(suggested)}` : ''}` });

  let ref = newRef();
  for (let i = 0; i < 5 && (await Complaint.exists({ ref })); i++) ref = newRef();
  await Complaint.create({ ...f, ref, dupKey, branchId: match.branchId, suggestedBranchId: suggested, matchedBy: match.matchedBy, matchedDocId: match.docId, matchedDocType: match.docType, status: match.branchId ? 'Forwarded' : 'New', lastActionAt: now, history });
  void sendSecurityMessage(`New complaint ${ref}${match.branchId ? ` → ${bName(match.branchId)}` : ' (needs forwarding)'}`,
    `From: ${f.name || '-'} · ${f.phone || '-'} · ${f.email || '-'}\nNumber: ${f.refNumber || '-'}\nLocation: ${f.location || '-'}\n\n${f.subject ? f.subject + '\n' : ''}${f.message.slice(0, 800)}`);
  return { ref, duplicate: false };
}

export const complaintOut = (c: Rec): ComplaintOut => ({
  id: String(c._id), ref: String(c.ref), name: String(c.name ?? ''), phone: String(c.phone ?? ''), email: String(c.email ?? ''), refNumber: String(c.refNumber ?? ''),
  location: String(c.location ?? ''), subject: String(c.subject ?? ''), message: String(c.message ?? ''), extra: (c.extra ?? {}) as Record<string, string>,
  branchId: c.branchId ? String(c.branchId) : null, suggestedBranchId: c.suggestedBranchId ? String(c.suggestedBranchId) : null,
  matchedBy: String(c.matchedBy ?? ''), matchedDocId: String(c.matchedDocId ?? ''), matchedDocType: String(c.matchedDocType ?? ''), status: String(c.status ?? 'New'),
  lastActionAt: new Date(c.lastActionAt ?? c.createdAt).toISOString(), createdAt: new Date(c.createdAt).toISOString(),
  history: (Array.isArray(c.history) ? c.history : []).slice(-60).map((h: Rec) => ({ at: String(h.at), byName: String(h.byName ?? ''), action: String(h.action ?? ''), ...(h.note ? { note: String(h.note) } : {}) })),
});
