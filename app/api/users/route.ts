import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem, randomPassword } from '@/lib/server/auth';
import { User } from '@/lib/server/models';
import { branchFor } from '@/lib/server/shared';
import { userOut } from '@/lib/server/out';

export const GET = api({ auth: 'admin' }, async () => ({ users: (await User.find({}).sort({ name: 1 }).lean()).map(userOut) }));

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  loginId: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Use 3 to 60 letters, numbers or . _ - @'),
  role: z.enum(['admin', 'manager']),
  branchId: z.string().nullable().optional(),
  password: z.string().max(200).optional(),
});

/** Creates a user. If no password is given, a random temporary one is returned once. */
export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  const b = await jsonBody(req, Body);
  if (await User.findOne({ loginId: b.loginId }).lean()) throw new ApiError(409, 'This login ID is already used', { loginId: 'Already used' });
  const branchId = await branchFor(b.role, b.branchId);
  const temp = b.password ? null : randomPassword();
  const password = b.password ?? temp!;
  const problem = passwordProblem(password, b.loginId);
  if (problem) throw new ApiError(422, problem, { password: problem });
  const row = (await User.create({ name: b.name, loginId: b.loginId, passwordHash: await hashPassword(password), role: b.role, branchId, active: true, mustChangePassword: true, sv: 0 })).toObject();
  await audit(user, { action: 'create', entity: 'user', entityId: String(row._id), branchId: branchId ?? undefined, summary: `Created ${b.role} ${b.loginId}` });
  return { user: userOut(row), tempPassword: temp };
});

export const dynamic = 'force-dynamic';
