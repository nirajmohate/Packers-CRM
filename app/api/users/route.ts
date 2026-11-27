import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { requireRecentPassword } from '@/lib/server/recentAuth';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem } from '@/lib/server/auth';
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
  password: z.string().min(1, 'Type a password').max(200),
});

/**
 * Creates a user with the login ID and password typed in. The admin creates any account;
 * a branch owner creates only the Team account of their own branch (one per branch).
 */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  if (user.role === 'team') throw new ApiError(403, 'Your account cannot manage users');
  const b = await jsonBody(req, Body);
  if (user.role === 'manager' && b.role !== 'team') throw new ApiError(403, 'You can only create the Team account of your branch');
  await requireRecentPassword(req); // password typed again before making an account
  const role = b.role;
  const branchId = user.role === 'manager' ? user.branchId : await branchFor(role, b.branchId);
  if (await User.findOne({ loginId: b.loginId }).lean()) throw new ApiError(409, 'This login ID is already used', { loginId: 'Already used' });
  if (role === 'team') await oneTeamPerBranch(branchId);
  const password = b.password;
  const problem = passwordProblem(password, b.loginId);
  if (problem) throw new ApiError(422, problem, { password: problem });
  // the team account is shared by several executives, so it does not ask for a new password at first sign-in
  const row = (await User.create({ name: b.name, loginId: b.loginId, passwordHash: await hashPassword(password), role, branchId, active: true, mustChangePassword: false, sv: 0 })).toObject();
  await audit(user, { action: 'create', entity: 'user', entityId: String(row._id), branchId: branchId ?? undefined, summary: `Created ${role === 'team' ? 'Team' : role} account ${b.loginId}` });
  return { user: userOut(row) };
});

export const dynamic = 'force-dynamic';
