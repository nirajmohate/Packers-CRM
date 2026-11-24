import { Types } from 'mongoose';
import { TEAM_TYPES } from '@/lib/roles';
import { api, ApiError } from '@/lib/server/http';
import { Audit, Doc } from '@/lib/server/models';
import type { AuditEntry } from '@/lib/types';

const out = (a: Record<string, unknown>): AuditEntry => ({
  id: String(a._id), at: new Date(a.at as string).toISOString(), userId: a.userId as string | undefined, userName: String(a.userName ?? ''), role: String(a.role ?? ''),
  action: String(a.action), entity: String(a.entity), entityId: a.entityId as string | undefined, docType: a.docType as string | undefined, docNumber: a.docNumber as string | undefined,
  branchId: a.branchId as string | undefined, summary: String(a.summary ?? ''), changes: (a.changes as AuditEntry['changes']) ?? [],
});

export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  const q = req.nextUrl.searchParams;
  const docId = q.get('docId');
  if (docId) {
    // anyone may read the history of a document they are allowed to see (deleted ones included)
    if (!Types.ObjectId.isValid(docId)) throw new ApiError(404, 'Document not found');
    const d = await Doc.findOne({ _id: docId, ...(user.role !== 'admin' ? { branchId: user.branchId } : {}), ...(user.role === 'team' ? { type: { $in: TEAM_TYPES } } : {}) }).lean();
    if (!d) throw new ApiError(404, 'Document not found');
    return { entries: (await Audit.find({ entityId: docId }).sort({ at: -1 }).limit(100).lean()).map(out) };
  }
  if (user.role !== 'admin') throw new ApiError(403, 'Only the admin can open the audit log');
  const f: Record<string, unknown> = {};
  for (const k of ['action', 'entity', 'docType', 'userId', 'branchId', 'role'] as const) if (q.get(k)) f[k] = q.get(k);
  const from = q.get('from'), to = q.get('to');
  if (from || to) f.at = { ...(from ? { $gte: new Date(from + 'T00:00:00') } : {}), ...(to ? { $lte: new Date(to + 'T23:59:59.999') } : {}) };
  if (q.get('q')) f.$or = [{ summary: { $regex: String(q.get('q')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { docNumber: { $regex: String(q.get('q')).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
  const skip = Math.max(parseInt(q.get('skip') || '0', 10) || 0, 0);
  const [rows, total] = await Promise.all([Audit.find(f).sort({ at: -1 }).skip(skip).limit(51).lean(), skip ? Promise.resolve(-1) : Audit.countDocuments(f)]);
  return { entries: rows.slice(0, 50).map(out), hasMore: rows.length > 50, total };
});

export const dynamic = 'force-dynamic';
