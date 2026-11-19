import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Branch, Doc, Settings, User } from '@/lib/server/models';
import { branchOut } from '@/lib/server/out';

const Patch = z.object({
  name: z.string().trim().min(2).max(60), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, '2 to 5 letters or digits'),
  city: z.string().trim().max(60), address: z.string().trim().max(300), phone: z.string().trim().max(20), active: z.boolean(),
}).partial();

async function find(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Branch not found');
  const b = await Branch.findById(id).lean();
  if (!b) throw new ApiError(404, 'Branch not found');
  return b;
}

export const PATCH = api({ auth: 'admin' }, async ({ req, user, params }) => {
  const cur = await find(params.id);
  const p = await jsonBody(req, Patch);
  if (p.code && p.code !== cur.code && (await Branch.findOne({ code: p.code }).lean())) throw new ApiError(409, 'This branch code is already used', { code: 'Already used' });
  if (p.active === false) {
    const managers = await User.countDocuments({ branchId: params.id, active: true });
    if (managers) throw new ApiError(409, `${managers} active manager(s) still belong to this branch. Move or deactivate them first.`);
  }
  await Branch.updateOne({ _id: params.id }, { $set: p });
  await audit(user, { action: 'update', entity: 'branch', entityId: params.id, summary: `Updated branch ${cur.name}`, changes: Object.entries(p).filter(([k, v]) => String((cur as Record<string, unknown>)[k] ?? '') !== String(v)).map(([k, v]) => ({ field: k, from: String((cur as Record<string, unknown>)[k] ?? ''), to: String(v) })) });
  return { branch: branchOut((await Branch.findById(params.id).lean()) as Record<string, unknown>) };
});

export const DELETE = api({ auth: 'admin' }, async ({ user, params }) => {
  const cur = await find(params.id);
  if ((await Doc.countDocuments({ branchId: params.id })) > 0 || (await User.countDocuments({ branchId: params.id })) > 0)
    throw new ApiError(409, 'This branch has documents or managers, so it can only be deactivated.');
  await Branch.deleteOne({ _id: params.id });
  await Settings.deleteOne({ _id: `branch:${params.id}` });
  await audit(user, { action: 'delete', entity: 'branch', entityId: params.id, summary: `Deleted branch ${cur.name}` });
});

export const dynamic = 'force-dynamic';
