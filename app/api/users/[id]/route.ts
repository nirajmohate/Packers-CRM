import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { User } from '@/lib/server/models';
import { endSessions } from '@/lib/server/auth';
import { userOut } from '@/lib/server/out';
import { branchFor } from '@/lib/server/shared';
import { mayManage, oneTeamPerBranch } from '@/lib/server/userAccess';
import { requireRecentPassword } from '@/lib/server/recentAuth';

const Patch = z.object({
  name: z.string().trim().min(2).max(80), active: z.boolean(), role: z.enum(['admin', 'manager', 'team']), branchId: z.string().nullable(), unlock: z.boolean(),
}).partial();

export const PATCH = api({ auth: 'user' }, async ({ req, user, params }) => {
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'User not found');
  const cur = await User.findById(params.id).lean();
  if (!cur) throw new ApiError(404, 'User not found');
  mayManage(user, cur as Record<string, unknown>);
  const p = await jsonBody(req, Patch);
  // only real changes count: the edit form sends role and branch even when they stay the same
  const roleChanged = p.role !== undefined && p.role !== cur.role;
  const branchChanged = p.branchId !== undefined && (p.branchId ?? null) !== ((cur.branchId as string | null) ?? null) && (p.role ?? cur.role) !== 'admin';
  if (!roleChanged) delete p.role;
  if (!branchChanged) delete p.branchId;
  // switching an account off or moving it is sensitive: password typed again first
  if (p.active === false || roleChanged || branchChanged) await requireRecentPassword(req);
  // a branch owner may rename, switch on/off and unlock their Team account, nothing else
  if (user.role !== 'admin' && (p.role !== undefined || p.branchId !== undefined)) throw new ApiError(403, 'Only the admin can change a role or branch');
  const self = params.id === user.id;
  const role = p.role ?? (cur.role as string);
  if (self && (p.active === false || (p.role && p.role !== 'admin'))) throw new ApiError(409, 'You cannot deactivate or demote your own account');
  const losingAdmin = cur.role === 'admin' && cur.active !== false && (p.active === false || role !== 'admin');
  if (losingAdmin && (await User.countDocuments({ role: 'admin', active: true })) <= 1) throw new ApiError(409, 'At least one active admin is required');

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (p.name) set.name = p.name;
  if (p.active !== undefined) set.active = p.active;
  if (p.role) set.role = p.role;
  if (p.role || p.branchId !== undefined) set.branchId = await branchFor(role, p.branchId !== undefined ? p.branchId : (cur.branchId as string | null));
  if (role === 'team' && (p.role || p.branchId !== undefined)) await oneTeamPerBranch((set.branchId as string | null) ?? null, params.id);
  if (p.unlock) { set.failedLogins = 0; unset.lockUntil = ''; }
  const sessionAffected = p.active === false || p.role !== undefined || p.branchId !== undefined;
  await User.updateOne({ _id: params.id }, { $set: set, ...(sessionAffected ? { $inc: { sv: 1 } } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  if (sessionAffected) await endSessions({ userId: params.id }, user.name);
  await audit(user, { action: 'update', entity: 'user', entityId: params.id, summary: `Updated ${cur.loginId}`, changes: Object.entries(set).filter(([k]) => !['failedLogins'].includes(k)).map(([k, v]) => ({ field: k, from: String((cur as Record<string, unknown>)[k] ?? ''), to: String(v ?? '') })) });
  return { user: userOut((await User.findById(params.id).lean()) as Record<string, unknown>) };
});

export const dynamic = 'force-dynamic';
