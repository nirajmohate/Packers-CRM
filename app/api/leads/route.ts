import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Lead } from '@/lib/server/models';
import { LeadBody, leadBranch, leadOut, mayUseLeads } from '@/lib/server/leads';
import { isBranchUser } from '@/lib/roles';
import { todayISO } from '@/lib/format';

const MAX = 5000;

/** Leads of the user's branch (branch owner) or of all / one branch (admin). Team accounts get 403. */
export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  mayUseLeads(user);
  const q = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  if (isBranchUser(user)) filter.branchId = user.branchId;
  else if (q.get('branch')) filter.branchId = String(q.get('branch')).slice(0, 40);
  const rows = (await Lead.find(filter).sort({ leadDate: -1, createdAt: -1 }).limit(MAX).lean()) as Record<string, unknown>[];
  return { leads: rows.map((r: Record<string, unknown>) => leadOut(r)), capped: rows.length === MAX };
});

export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  mayUseLeads(user);
  const b = await jsonBody(req, LeadBody);
  if (!b.name && !b.phone) throw new ApiError(422, 'Enter the customer name or mobile number', { name: 'Name or mobile is needed' });
  const branchId = await leadBranch(user, b.branchId);
  const { branchId: _ignored, ...fields } = b; // eslint-disable-line @typescript-eslint/no-unused-vars
  const made = await Lead.create({ ...fields, leadDate: fields.leadDate || todayISO(), status: fields.status || 'Lead generated', branchId, createdBy: user.id, createdByName: user.name, updatedByName: user.name });
  await audit(user, { action: 'create', entity: 'lead', entityId: String(made._id), branchId, summary: `Added customer ${b.name || b.phone} (${made.status})` });
  return { lead: leadOut(made.toObject()) };
});

export const dynamic = 'force-dynamic';
