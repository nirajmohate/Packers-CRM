import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem, randomPassword } from '@/lib/server/auth';
import { User } from '@/lib/server/models';
import { mayManage } from '@/lib/server/userAccess';

const Body = z.object({ password: z.string().max(200).optional() });

/** Sets a new temporary password, signs the person out everywhere, and forces a change at next login. */
export const POST = api({ auth: 'user' }, async ({ req, user, params }) => {
  if (!Types.ObjectId.isValid(params.id)) throw new ApiError(404, 'User not found');
  const cur = await User.findById(params.id).lean();
  if (!cur) throw new ApiError(404, 'User not found');
  mayManage(user, cur as Record<string, unknown>);
  const { password } = await jsonBody(req, Body);
  const temp = password ? null : randomPassword();
  const pw = password ?? temp!;
  const problem = passwordProblem(pw, cur.loginId as string);
  if (problem) throw new ApiError(422, problem, { password: problem });
  await User.updateOne({ _id: params.id }, { $set: { passwordHash: await hashPassword(pw), mustChangePassword: params.id !== user.id && cur.role !== 'team', failedLogins: 0 }, $unset: { lockUntil: '' }, $inc: { sv: 1 } });
  await audit(user, { action: 'password_reset', entity: 'user', entityId: params.id, summary: `Reset password for ${cur.loginId}${cur.role === 'team' ? ' (Team account: every phone signed in is signed out)' : ''}` });
  return { tempPassword: temp };
});

export const dynamic = 'force-dynamic';
