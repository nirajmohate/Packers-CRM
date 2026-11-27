import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Lead } from '@/lib/server/models';
import { LeadBody, leadBranch, leadChanges, leadOut, loadLead } from '@/lib/server/leads';
import { isAdmin } from '@/lib/roles';

export const PATCH = api({ auth: 'user' }, async ({ req, user, params }) => {
  const cur = await loadLead(user, params.id);
  const b = await jsonBody(req, LeadBody);
  const { branchId, ...fields } = b;
  const $set: Record<string, unknown> = { ...fields, updatedByName: user.name };
  // only the admin can move a customer to another branch
  if (branchId && branchId !== cur.branchId && isAdmin(user)) $set.branchId = await leadBranch(user, branchId);
  const changes = leadChanges(cur, { ...fields, ...($set.branchId ? { branchId: $set.branchId } : {}) });
  if (changes.length) {
    await Lead.updateOne({ _id: params.id }, { $set });
    await audit(user, { action: 'update', entity: 'lead', entityId: params.id, branchId: String($set.branchId ?? cur.branchId), summary: `Updated customer ${fields.name ?? cur.name ?? cur.phone}`, changes });
  }
  return { lead: leadOut((await Lead.findById(params.id).lean()) as Record<string, unknown>) };
});

export const DELETE = api({ auth: 'user' }, async ({ user, params }) => {
  if (user.role === 'team') throw new ApiError(403, 'Only the branch owner or admin can delete a customer');
  const cur = await loadLead(user, params.id);
  await Lead.deleteOne({ _id: params.id });
  await audit(user, { action: 'delete', entity: 'lead', entityId: params.id, branchId: cur.branchId, summary: `Deleted customer ${cur.name || cur.phone} (${cur.status})` });
  return { ok: true };
});

export const dynamic = 'force-dynamic';
