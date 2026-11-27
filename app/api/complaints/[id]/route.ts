import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Branch, Complaint } from '@/lib/server/models';
import { complaintOut, mayUseComplaints } from '@/lib/server/complaints';
import { COMPLAINT_STATUSES } from '@/lib/complaints';

const Body = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  note: z.string().max(1000).optional(),
  branchId: z.string().max(40).optional(), // admin: forward to a branch
}).strict();

/** Change status, add a note, or (admin) forward to a branch. Every change goes into the complaint's history and the audit log. */
export const PATCH = api({ auth: 'user' }, async ({ req, user, params }) => {
  mayUseComplaints(user);
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'Complaint not found');
  const c = (await Complaint.findById(params.id).lean()) as Record<string, unknown> | null;
  if (!c || (user.role !== 'admin' && c.branchId !== user.branchId)) throw new ApiError(404, 'Complaint not found');
  const b = await jsonBody(req, Body);
  const note = (b.note ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim();
  const now = new Date();
  const events: { at: string; byName: string; action: string; note?: string }[] = [];
  const $set: Record<string, unknown> = {};

  if (b.branchId !== undefined) {
    if (user.role !== 'admin') throw new ApiError(403, 'Only the admin can forward a complaint');
    const br = Types.ObjectId.isValid(b.branchId) ? ((await Branch.findById(b.branchId).lean()) as Record<string, unknown> | null) : null;
    if (!br) throw new ApiError(422, 'Choose a branch', { branchId: 'Choose a branch' });
    if (b.branchId !== c.branchId) {
      $set.branchId = b.branchId;
      if (!b.status && (c.status === 'New' || !c.branchId)) $set.status = 'Forwarded';
      events.push({ at: now.toISOString(), byName: user.name, action: `Forwarded to ${br.name}` });
    }
  }
  if (b.status && b.status !== c.status) {
    $set.status = b.status;
    events.push({ at: now.toISOString(), byName: user.name, action: `Status: ${c.status} → ${b.status}` });
  }
  if (note) {
    if (events.length) events[events.length - 1].note = note;
    else events.push({ at: now.toISOString(), byName: user.name, action: 'Note', note });
  }
  if (!events.length) return { complaint: complaintOut(c) };
  $set.lastActionAt = now; // restarts the 48-hour reminder
  await Complaint.updateOne({ _id: params.id }, { $set, $push: { history: { $each: events, $slice: -100 } } });
  await audit(user, { action: 'update', entity: 'complaint', entityId: params.id, branchId: String($set.branchId ?? c.branchId ?? '') || undefined, summary: `Complaint ${c.ref}: ${events.map((e) => e.action).join('; ')}${note ? ` (${note.slice(0, 120)})` : ''}` });
  return { complaint: complaintOut((await Complaint.findById(params.id).lean()) as Record<string, unknown>) };
});

export const dynamic = 'force-dynamic';
