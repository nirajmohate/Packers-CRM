import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { Branch } from '@/lib/server/models';
import { branchOut } from '@/lib/server/out';

const BranchBody = z.object({
  name: z.string().trim().min(2).max(60),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, '2 to 5 letters or digits'),
  city: z.string().trim().max(60).default(''),
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(20).default(''),
  phone2: z.string().trim().max(20).default(''),
});

export const GET = api({ auth: 'user' }, async ({ user }) => {
  const rows = user.role === 'admin' ? await Branch.find({}).sort({ name: 1 }).lean() : await Branch.find({ _id: user.branchId }).lean();
  return { branches: rows.map(branchOut) };
});

export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  const b = await jsonBody(req, BranchBody);
  if (await Branch.findOne({ code: b.code }).lean()) throw new ApiError(409, 'This branch code is already used', { code: 'Already used' });
  const row = (await Branch.create({ ...b, active: true })).toObject();
  await audit(user, { action: 'create', entity: 'branch', entityId: String(row._id), summary: `Created branch ${b.name} (${b.code})` });
  return { branch: branchOut(row) };
});

export const dynamic = 'force-dynamic';
