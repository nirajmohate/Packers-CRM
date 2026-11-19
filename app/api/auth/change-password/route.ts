import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { checkPassword, hashPassword, passwordProblem, setSessionCookie, signSession } from '@/lib/server/auth';
import { User } from '@/lib/server/models';

const Body = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

export const POST = api({ auth: 'user', allowMustChange: true }, async ({ req, user }) => {
  const { current, next } = await jsonBody(req, Body);
  const u = await User.findById(user.id).lean();
  if (!u || !(await checkPassword(current, u.passwordHash as string))) throw new ApiError(422, 'Your current password is wrong', { current: 'Wrong password' });
  const problem = passwordProblem(next, user.loginId);
  if (problem) throw new ApiError(422, problem, { next: problem });
  if (await checkPassword(next, u.passwordHash as string)) throw new ApiError(422, 'Choose a different password', { next: 'Choose a different password' });
  const sv = ((u.sv as number) ?? 0) + 1; // signs out every other device
  await User.updateOne({ _id: user.id }, { $set: { passwordHash: await hashPassword(next), mustChangePassword: false, sv } });
  await audit(user, { action: 'password_change', entity: 'auth', summary: 'Changed own password' });
  const res = NextResponse.json({ user: { ...user, mustChangePassword: false } });
  setSessionCookie(res, req, await signSession({ id: user.id, role: user.role, branchId: user.branchId, sv }));
  return res;
});

export const dynamic = 'force-dynamic';
