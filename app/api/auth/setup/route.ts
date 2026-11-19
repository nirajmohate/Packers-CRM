import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { hashPassword, passwordProblem, setSessionCookie, signSession, toSessionUser } from '@/lib/server/auth';
import { Branch, Settings, User } from '@/lib/server/models';

export const GET = api({ auth: 'none' }, async () => ({ needsSetup: (await User.countDocuments()) === 0 }));

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  loginId: z.string().trim().toLowerCase().regex(/^[a-z0-9._@-]{3,60}$/, 'Use 3 to 60 letters, numbers or . _ - @'),
  password: z.string().min(1).max(200),
  companyName: z.string().trim().max(120).optional(),
  branchName: z.string().trim().min(2).max(60).default('Head Office'),
  branchCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,5}$/, '2 to 5 letters or digits').default('HO'),
});

/** First run only: creates the admin, a first branch, and signs the admin in. */
export const POST = api({ auth: 'none' }, async ({ req }) => {
  if ((await User.countDocuments()) > 0) throw new ApiError(403, 'Setup is already done. Please sign in.');
  const b = await jsonBody(req, Body);
  const problem = passwordProblem(b.password, b.loginId);
  if (problem) throw new ApiError(422, problem, { password: problem });
  if (!(await Branch.countDocuments())) await Branch.create({ name: b.branchName, code: b.branchCode, city: '', address: '', phone: '' });
  if (b.companyName) await Settings.updateOne({ _id: 'global' }, { $set: { 'profile.name': b.companyName } }, { upsert: true });
  const u = await User.create({ name: b.name, loginId: b.loginId, passwordHash: await hashPassword(b.password), role: 'admin', branchId: null, active: true, mustChangePassword: false, sv: 0, lastLoginAt: new Date() });
  const user = toSessionUser(u.toObject());
  await audit(user, { action: 'create', entity: 'user', entityId: user.id, summary: `First-run setup: created admin ${b.loginId}` });
  const res = NextResponse.json({ user });
  setSessionCookie(res, req, await signSession({ id: user.id, role: 'admin', branchId: null, sv: 0 }));
  return res;
});

export const dynamic = 'force-dynamic';
