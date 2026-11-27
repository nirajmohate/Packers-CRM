import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit, deviceOf } from '@/lib/server/audit';
import { checkPassword, DUMMY_HASH, signTicket, tooManyAttempts } from '@/lib/server/auth';
import { finishLogin, isLocked, recordFailure } from '@/lib/server/loginFlow';
import { User } from '@/lib/server/models';

const Body = z.object({ loginId: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });

export const POST = api({ auth: 'none' }, async ({ req }) => {
  const { loginId, password } = await jsonBody(req, Body);
  const id = loginId.toLowerCase();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (tooManyAttempts(`${ip}|${id}`)) throw new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');

  const u = await User.findOne({ loginId: id }).lean();
  const ok = await checkPassword(password, (u?.passwordHash as string) ?? DUMMY_HASH);
  const wrong = new ApiError(401, 'Wrong login ID or password');
  if (!u || !u.active) { await audit(null, { action: 'login_failed', entity: 'auth', summary: `Failed sign-in for "${id}" · ${deviceOf(req.headers)}` }, id); throw wrong; }
  if (isLocked(u)) throw new ApiError(423, 'Too many wrong tries. This account is locked for a few minutes.');
  if (!ok) { await recordFailure(u, `Wrong password · ${deviceOf(req.headers)}`); throw wrong; }

  // two-step login: the password was right; now the 6-digit code from the authenticator app is needed
  if ((u.twoFactor as { enabled?: boolean } | undefined)?.enabled) {
    return NextResponse.json({ twoFactor: true, ticket: await signTicket(String(u._id), Number(u.sv ?? 0)) });
  }
  return finishLogin(req, u);
});

export const dynamic = 'force-dynamic';
