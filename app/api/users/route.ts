import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem, randomPassword } from '@/lib/server/auth';
import { User } from '@/lib/server/models';
import { branchFor } from '@/lib/server/shared';
import { userOut } from '@/lib/server/out';
import { oneTeamPerBranch } from '@/lib/server/userAccess';

/** Admin: every user. Branch owner: only the Team account of their own branch. Team: nobody. */
export const GET = api({ auth: 'user' }, async ({ user }) => {
  if (user.role === 'team') throw new ApiError(403, 'Your account cannot manage users');
  const q = user.role === 'admin' ? {} : { role: 'team', branchId: user.branchId };
  return { users: (await User.find(q).sort({ name: 1 }).lean()).map(userOut) };
});

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  loginId: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Use 3 to 60 letters, numbers or . _ - @'),
  role: z.enum(['admin', 'manager', 'team']),
  branchId: z.string().nullable().optional(),
  password: z.string().max(200).optional(),
});

/** Creates a user. If no password is given, a random temporary one is returned once. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  if (user.role === 'team') throw new ApiError(403, 'Your account cannot manage users');
  const b = await jsonBody(req, Body);
  // a branch owner can only make the Team account of their own branch
  if (user.role === 'manager' && b.role !== 'team') throw new ApiError(403, 'You can only create the Team account of your branch');
  const role = b.role;
  const branchId = user.role === 'manager' ? user.branchId : await branchFor(role, b.branchId);
  if (await User.findOne({ loginId: b.loginId }).lean()) throw new ApiError(409, 'This login ID is already used', { loginId: 'Already used' });
  if (role === 'team') await oneTeamPerBranch(branchId);
  const temp = b.password ? null : randomPassword();
  const password = b.password ?? temp!;
  const problem = passwordProblem(password, b.loginId);
  if (problem) throw new ApiError(422, problem, { password: problem });
  // the team account is shared by several executives, so it does not ask for a new password at first sign-in
  const row = (await User.create({ name: b.name, loginId: b.loginId, passwordHash: await hashPassword(password), role, branchId, active: true, mustChangePassword: role !== 'team', sv: 0 })).toObject();
  await audit(user, { action: 'create', entity: 'user', entityId: String(row._id), branchId: branchId ?? undefined, summary: `Created ${role === 'team' ? 'Team' : role} account ${b.loginId}` });
  return { user: userOut(row), tempPassword: temp };
});

export const dynamic = 'force-dynamic';
