import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { User } from '@/lib/server/models';
import { userOut } from '@/lib/server/out';
import { branchFor } from '@/lib/server/shared';

const Patch = z.object({
  name: z.string().trim().min(2).max(80), active: z.boolean(), role: z.enum(['admin', 'manager']), branchId: z.string().nullable(), unlock: z.boolean(),
}).partial();

export const PATCH = api({ auth: 'admin' }, async ({ req, user, params }) => {
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'User not found');
  const cur = await User.findById(params.id).lean();
  if (!cur) throw new ApiError(404, 'User not found');
  const p = await jsonBody(req, Patch);
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
  if (p.unlock) { set.failedLogins = 0; unset.lockUntil = ''; }
  const sessionAffected = p.active === false || p.role !== undefined || p.branchId !== undefined;
  await User.updateOne({ _id: params.id }, { $set: set, ...(sessionAffected ? { $inc: { sv: 1 } } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  await audit(user, { action: 'update', entity: 'user', entityId: params.id, summary: `Updated ${cur.loginId}`, changes: Object.entries(set).filter(([k]) => !['failedLogins'].includes(k)).map(([k, v]) => ({ field: k, from: String((cur as Record<string, unknown>)[k] ?? ''), to: String(v ?? '') })) });
  return { user: userOut((await User.findById(params.id).lean()) as Record<string, unknown>) };
});

export const dynamic = 'force-dynamic';
