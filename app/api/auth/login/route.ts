import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { checkPassword, DUMMY_HASH, setSessionCookie, signSession, toSessionUser, tooManyAttempts } from '@/lib/server/auth';
import { User } from '@/lib/server/models';

const Body = z.object({ loginId: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

export const POST = api({ auth: 'none' }, async ({ req }) => {
  const { loginId, password } = await jsonBody(req, Body);
  const id = loginId.toLowerCase();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (tooManyAttempts(`${ip}|${id}`)) throw new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');

  const u = await User.findOne({ loginId: id }).lean();
  const ok = await checkPassword(password, (u?.passwordHash as string) ?? DUMMY_HASH);
  const wrong = new ApiError(401, 'Wrong login ID or password');
  if (!u || !u.active) { await audit(null, { action: 'login_failed', entity: 'auth', summary: `Failed sign-in for "${id}"` }, id); throw wrong; }
  if (u.lockUntil && new Date(u.lockUntil as Date).getTime() > Date.now()) throw new ApiError(423, 'Too many wrong passwords. This account is locked for a few minutes.');
  if (!ok) {
    const n = ((u.failedLogins as number) ?? 0) + 1;
    await User.updateOne({ _id: u._id }, n >= LOCK_AFTER ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } } : { $set: { failedLogins: n } });
    await audit({ id: String(u._id), name: String(u.name), role: String(u.role) } as never, { action: 'login_failed', entity: 'auth', summary: n >= LOCK_AFTER ? 'Wrong password, account locked for 15 minutes' : 'Wrong password' });
    throw wrong;
  }
  await User.updateOne({ _id: u._id }, { $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockUntil: '' } });
  const user = toSessionUser(u);
  await audit(user, { action: 'login', entity: 'auth', summary: 'Signed in' });
  const res = NextResponse.json({ user });
  setSessionCookie(res, req, await signSession({ id: user.id, role: user.role, branchId: user.branchId, sv: (u.sv as number) ?? 0 }));
  return res;
});

export const dynamic = 'force-dynamic';
