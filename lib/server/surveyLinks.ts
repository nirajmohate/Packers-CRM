/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomBytes } from 'crypto';
import { Types } from 'mongoose';
import type { Row, SessionUser } from '../types';
import { HOUSEHOLD, PUBLIC_SURVEY_COLUMNS, PUBLIC_SURVEY_FIELDS } from '../config';
import { cftOf } from '../catalog';
import { audit } from './audit';
import { createDoc, getDoc, setStatus, updateDoc } from './docs';
import { ApiError } from './http';
import { Branch, SurveyLink } from './models';
import { loadBundle } from './settings';
import { effectiveCompany } from '../settingsFn';

type Rec = Record<string, any>;
export const LINK_DAYS = 7;
const DAY = 86_400_000;

/** 32 random bytes, URL safe. Only its SHA-256 is stored. */
const newToken = () => randomBytes(32).toString('base64url');
const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');
/** Rejects anything that is not exactly a token we could have made (also stops odd input reaching the database). */
export const tokenOk = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

const short = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export type LinkState = 'open' | 'used' | 'expired' | 'cancelled';
const stateOf = (l: Rec): LinkState => (l.revokedAt ? 'cancelled' : l.usedAt ? 'used' : new Date(l.expiresAt).getTime() < Date.now() ? 'expired' : 'open');
export const linkOut = (l: Rec) => ({
  id: String(l._id), branchId: l.branchId, createdByName: l.createdByName ?? '', createdAt: new Date(l.createdAt).toISOString(),
  expiresAt: new Date(l.expiresAt).toISOString(), state: stateOf(l), customerName: l.prefill?.customerName ?? '', customerPhone: l.prefill?.customerPhone ?? '',
  docId: l.docId ?? '', docNumber: l.docNumber ?? '',
});

/* ---------- staff side (signed in) ---------- */
export async function createLink(user: SessionUser, body: Rec) {
  const branchId = user.role !== 'admin' ? user.branchId! : short(body.branchId, 40);
  const branch = Types.ObjectId.isValid(branchId) ? ((await Branch.findById(branchId).lean()) as Rec | null) : null;
  if (!branch || branch.active === false) throw new ApiError(422, 'Choose a branch for this survey', { branchId: 'Choose a branch' });
  const phone = short(body.customerPhone, 20).replace(/[^\d+]/g, '');
  const prefill = { customerName: short(body.customerName, 120), customerPhone: phone };
  const token = newToken();
  // the survey appears in the Survey List straight away as "Link sent"; it becomes "Filled by customer" when they send the form
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // date in India
  const doc = await createDoc(user, { type: 'survey', branchId, status: 'Link sent', docDate: today, data: { ...(prefill.customerName ? { customerName: prefill.customerName } : {}), ...(prefill.customerPhone ? { customerPhone: prefill.customerPhone } : {}) }, items: [] });
  const link = (await SurveyLink.create({
    tokenHash: hashOf(token), branchId, createdBy: user.id, createdByName: user.name, prefill, expiresAt: new Date(Date.now() + LINK_DAYS * DAY),
    docId: doc.id, docNumber: doc.number,
  })).toObject() as Rec;
  await audit(user, { action: 'create', entity: 'doc', entityId: String(link._id), docType: 'survey', branchId, summary: `Created a survey link${prefill.customerName ? ' for ' + prefill.customerName : ''}` });
  // the secret goes back to the staff member once and is never stored
  return { link: linkOut(link), path: `/s/${token}`, doc };
}

export async function listLinks(user: SessionUser, branch?: string | null) {
  const q: Rec = user.role !== 'admin' ? { branchId: user.branchId } : branch && Types.ObjectId.isValid(branch) ? { branchId: branch } : {};
  return ((await SurveyLink.find(q).sort({ createdAt: -1 }).limit(30).lean()) as Rec[]).map(linkOut);
}

export async function cancelLink(user: SessionUser, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Link not found');
  const l = (await SurveyLink.findOne({ _id: id, ...(user.role !== 'admin' ? { branchId: user.branchId } : {}) }).lean()) as Rec | null;
  if (!l) throw new ApiError(404, 'Link not found');
  if (l.usedAt) throw new ApiError(400, 'This link was already used, there is nothing to cancel');
  await SurveyLink.updateOne({ _id: id }, { $set: { revokedAt: new Date() } });
  // its survey (still waiting for the customer) is marked Cancelled
  if (l.docId) {
    try { const d = await getDoc(user, l.docId); if (d.status === 'Link sent') await setStatus(user, l.docId, 'Cancelled'); } catch { /* survey deleted meanwhile */ }
  }
  await audit(user, { action: 'delete', entity: 'doc', entityId: id, docType: 'survey', branchId: l.branchId, summary: 'Cancelled a survey link' });
}

/* ---------- customer side (no login, only the link) ---------- */
const GONE = 'This link has expired or was already used. Please ask the company for a new link.';

async function openLink(token: string): Promise<Rec> {
  const l = (await SurveyLink.findOne({ tokenHash: hashOf(token) }).lean()) as Rec | null;
  if (!l || stateOf(l) !== 'open') throw new ApiError(410, GONE, undefined, 'link_gone');
  return l;
}

/** What the customer's page needs: company name and contact, branch, and the name/phone the staff typed in. Nothing else. */
export async function publicInfo(token: string) {
  const l = await openLink(token);
  const [branch, bundle] = await Promise.all([Branch.findById(l.branchId).lean() as Promise<Rec | null>, loadBundle()]);
  const co = effectiveCompany(bundle as any, l.branchId);
  return {
    company: { name: co.name, phone: branch?.phone || co.phone, email: co.email, address: branch?.address || co.address },
    branchName: branch?.name ?? '', prefill: l.prefill ?? {}, expiresAt: new Date(l.expiresAt).toISOString(),
  };
}

export async function publicSubmit(token: string, body: Rec) {
  const l = await openLink(token);
  // only the fields a customer may fill; everything else is dropped
  const data: Record<string, string> = {};
  const raw = body?.data && typeof body.data === 'object' ? body.data : {};
  for (const k of PUBLIC_SURVEY_FIELDS) if (typeof raw[k] === 'string') data[k] = raw[k].slice(0, 2000);
  const items: Row[] = (Array.isArray(body?.items) ? body.items : []).slice(0, 150).map((r: Rec) => {
    const row: Row = {};
    for (const c of PUBLIC_SURVEY_COLUMNS) row[c] = typeof r?.[c] === 'string' || typeof r?.[c] === 'number' ? String(r[c]).slice(0, 200) : '';
    // volume filled from the standard list when the name matches; staff can change it later
    const hh = HOUSEHOLD.find((h) => h.name.toLowerCase() === (row.description || '').trim().toLowerCase());
    const cft = hh?.cft ?? cftOf(row.description || '');
    row.cft = cft ? String(cft) : '';
    return row;
  });
  // a customer must at least say who they are (the only required boxes in the whole app)
  if (!(data.customerName ?? '').trim() || !(data.customerPhone ?? '').trim())
    throw new ApiError(422, 'Please fill your name and mobile number', { ...(!(data.customerName ?? '').trim() ? { customerName: 'Required' } : {}), ...(!(data.customerPhone ?? '').trim() ? { customerPhone: 'Required' } : {}) });
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // date in India
  const who: SessionUser = { id: 'survey-link', name: 'Customer (survey link)', role: 'manager', branchId: l.branchId, loginId: '', mustChangePassword: false } as SessionUser;

  // claim the link first so two quick submits cannot create two surveys; given back if saving fails
  const claim = await SurveyLink.updateOne({ _id: l._id, usedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (claim.modifiedCount !== 1) throw new ApiError(410, GONE, undefined, 'link_gone');
  try {
    // fill in the survey made when the link was sent (it keeps its number, date and anything staff added);
    // if staff deleted it meanwhile, a new survey is made instead
    let existing = null;
    if (l.docId) { try { existing = await getDoc(who, l.docId); } catch { existing = null; } }
    const doc = existing
      ? await updateDoc(who, existing.id, { number: existing.number, docDate: existing.docDate, status: 'Filled by customer', data: { ...existing.data, ...data }, items: items.length ? items : existing.items })
      : await createDoc(who, { type: 'survey', status: 'Filled by customer', docDate: today, data, items });
    await SurveyLink.updateOne({ _id: l._id }, { $set: { docId: doc.id, docNumber: doc.number } });
    return { number: doc.number };
  } catch (e) {
    await SurveyLink.updateOne({ _id: l._id }, { $unset: { usedAt: '' } });
    throw e;
  }
}
