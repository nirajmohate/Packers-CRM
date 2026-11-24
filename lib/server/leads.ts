import { Types } from 'mongoose';
import { z } from 'zod';
import type { SessionUser } from '../types';
import { LEAD_FIELDS, LEAD_STATUSES, type Lead as LeadOut } from '../leads';
import { canSee, isBranchUser } from '../roles';
import { normalize } from '../validate';
import { ApiError } from './http';
import { audit } from './audit';
import { Branch, Lead } from './models';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Only the admin and branch owners work with leads; the Team account never does. */
export function mayUseLeads(user: SessionUser) {
  if (!canSee(user, 'customers')) throw new ApiError(403, 'Your account cannot open customers');
}

// no control characters (keeps exports, PDFs and the audit log clean)
const text = (max: number) => z.string().max(max * 2).transform((s) => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max));
const date = z.string().trim().refine((s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s), 'Use a valid date');

export const LeadBody = z.object({
  name: text(80),
  email: z.string().trim().max(120).transform((s) => normalize('email', s)).refine((s) => s === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s), 'Enter a valid email'),
  phone: z.string().trim().max(20).transform((s) => normalize('phone', s)).refine((s) => s === '' || /^\+?[\d\s-]{6,16}$/.test(s), 'Enter a valid mobile number'),
  leadDate: date, moveDate: date, followUpDate: date,
  fromCity: text(60), toCity: text(60), fromAddress: text(300), toAddress: text(300),
  leadSource: text(40), leadType: text(20), shiftingType: text(40), itemType: text(40),
  status: z.enum(LEAD_STATUSES),
  remarks: text(1000),
  branchId: z.string().trim().max(40),
}).partial().strict();

export const leadOut = (l: Rec): LeadOut => ({
  id: String(l._id), branchId: String(l.branchId),
  ...(Object.fromEntries(LEAD_FIELDS.map((k) => [k, String(l[k] ?? '')])) as Record<(typeof LEAD_FIELDS)[number], string>),
  docs: Array.isArray(l.docs) ? l.docs.slice(-20).map((d: Rec) => ({ type: String(d.type), id: String(d.id), number: String(d.number) })) : [],
  createdByName: String(l.createdByName ?? ''), createdAt: new Date(l.createdAt ?? Date.now()).toISOString(), updatedAt: new Date(l.updatedAt ?? Date.now()).toISOString(),
});

/** Branch owners always get their own branch; the admin must pick an active branch. */
export async function leadBranch(user: SessionUser, wanted?: string) {
  const id = isBranchUser(user) ? user.branchId! : String(wanted ?? '');
  const b = Types.ObjectId.isValid(id) ? await Branch.findById(id).lean() : null;
  if (!b || (b as Rec).active === false) throw new ApiError(422, 'Please choose an active branch', { branchId: 'Choose a branch' });
  return id;
}

/** Loads a lead the user may touch (a branch owner only sees their own branch's leads). */
export async function loadLead(user: SessionUser, id: string): Promise<Rec> {
  mayUseLeads(user);
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Customer not found');
  const l = (await Lead.findById(id).lean()) as Rec | null;
  if (!l || (isBranchUser(user) && l.branchId !== user.branchId)) throw new ApiError(404, 'Customer not found');
  return l;
}

const LABEL: Record<string, string> = {
  name: 'Name', email: 'Email', phone: 'Mobile', leadDate: 'Date', moveDate: 'Shifting date', followUpDate: 'Follow-up date', fromCity: 'From', toCity: 'To',
  fromAddress: 'From address', toAddress: 'To address', leadSource: 'Lead source', leadType: 'Lead type', shiftingType: 'Shifting type', itemType: 'Item type',
  status: 'Status', remarks: 'Remarks', branchId: 'Branch',
};
export const leadChanges = (before: Rec, after: Rec) => Object.keys(after)
  .filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''))
  .map((k) => ({ field: LABEL[k] ?? k, from: String(before[k] ?? '').slice(0, 160), to: String(after[k] ?? '').slice(0, 160) }));

/** Order of progress: a document never moves a lead backwards (e.g. a quotation after it was already converted). */
const RANK: Record<string, number> = { 'Lead generated': 0, Contacted: 1, 'Not responded': 1, 'Follow-up': 2, Lost: 2, 'Quotation sent': 3, Converted: 4 };

/**
 * Called after a document is made from a lead (?lead=ID). Records the document on the lead and moves its status
 * forward: a quotation → "Quotation sent", a bill → "Converted". The lead must be in the same branch as the document.
 * Never throws: the document is already saved.
 */
export async function linkLeadToDoc(user: SessionUser, leadId: unknown, doc: { id: string; type: string; number: string; branchId: string }) {
  try {
    if (!canSee(user, 'customers') || typeof leadId !== 'string' || !Types.ObjectId.isValid(leadId)) return;
    const l = (await Lead.findById(leadId).lean()) as Rec | null;
    if (!l || l.branchId !== doc.branchId) return;
    const next = doc.type === 'bill' ? 'Converted' : doc.type === 'quotation' ? 'Quotation sent' : '';
    const $set: Rec = { updatedByName: user.name };
    if (next && (RANK[next] ?? 0) > (RANK[l.status] ?? 0)) $set.status = next;
    await Lead.updateOne({ _id: leadId }, { $set, $push: { docs: { $each: [{ type: doc.type, id: doc.id, number: doc.number }], $slice: -50 } } });
    if ($set.status) await audit(user, { action: 'update', entity: 'lead', entityId: leadId, branchId: doc.branchId, summary: `Customer ${l.name || l.phone} is now "${$set.status}" (${doc.number})`, changes: [{ field: 'Status', from: l.status, to: $set.status }] });
  } catch (e) {
    console.error('[leads] could not link document', e);
  }
}
