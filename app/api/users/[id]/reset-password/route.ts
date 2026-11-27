import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { endSessions, hashPassword, passwordProblem } from '@/lib/server/auth';
import { User } from '@/lib/server/models';
import { mayManage } from '@/lib/server/userAccess';
import { requireRecentPassword } from '@/lib/server/recentAuth';

const Body = z.object({ password: z.string().min(1, 'Type a password').max(200) });

/**
 * Sets the password typed in: the admin for any account, a branch owner for their branch's Team account
 * (mayManage below). Every device of that account is signed out.
 */
export const POST = api({ auth: 'user' }, async ({ req, user, params }) => {
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'User not found');
  const cur = await User.findById(params.id).lean();
  if (!cur) throw new ApiError(404, 'User not found');
  mayManage(user, cur as Record<string, unknown>);
  await requireRecentPassword(req); // your own password typed again before setting someone else's
  const { password } = await jsonBody(req, Body);
  const pw = password;
  const problem = passwordProblem(pw, cur.loginId as string);
  if (problem) throw new ApiError(422, problem, { password: problem });
  await User.updateOne({ _id: params.id }, { $set: { passwordHash: await hashPassword(pw), mustChangePassword: false, failedLogins: 0 }, $unset: { lockUntil: '' }, $inc: { sv: 1 } });
  await endSessions({ userId: params.id }, user.name);
  await audit(user, { action: 'password_reset', entity: 'user', entityId: params.id, summary: `Set a new password for ${cur.loginId}${cur.role === 'team' ? ' (Team account: every phone signed in is signed out)' : ''}` });
  return { ok: true };
});

export const dynamic = 'force-dynamic';
