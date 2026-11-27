import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { deviceOf } from '@/lib/server/audit';
import { readTicket, tooManyAttempts } from '@/lib/server/auth';
import { finishLogin, isLocked, recordFailure } from '@/lib/server/loginFlow';
import { User } from '@/lib/server/models';
import { checkCode, hashBackup, unseal } from '@/lib/server/totp';

const Body = z.object({ ticket: z.string().max(2000), code: z.string().trim().min(6).max(20) });

/** Second step of sign-in: the 6-digit code from the authenticator app, or one of the backup codes. */
export const POST = api({ auth: 'none' }, async ({ req }) => {
  const { ticket, code } = await jsonBody(req, Body);
  const t = await readTicket(ticket);
  if (!t) throw new ApiError(401, 'This sign-in took too long. Please type your password again.', undefined, 'ticket_expired');
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';
  if (tooManyAttempts(`code|${ip}|${t.userId}`)) throw new ApiError(429, 'Too many attempts. Please wait a few minutes and try again.');
  const u = await User.findById(t.userId).lean();
  const tf = (u?.twoFactor ?? {}) as { enabled?: boolean; secret?: string; lastStep?: number; backup?: string[] };
  if (!u || !u.active || Number(u.sv ?? 0) !== t.sv || !tf.enabled || !tf.secret) throw new ApiError(401, 'Please sign in again.', undefined, 'ticket_expired');
  if (isLocked(u)) throw new ApiError(423, 'Too many wrong tries. This account is locked for a few minutes.');

  let step: number | null = null;
  try { step = checkCode(unseal(tf.secret), code, tf.lastStep ?? 0); } catch { step = null; } // AUTH_SECRET changed: only backup codes work
  if (step !== null) {
    await User.updateOne({ _id: u._id }, { $set: { 'twoFactor.lastStep': step } });
    return finishLogin(req, u, ' with two-step code');
  }
  const h = hashBackup(code);
  if ((tf.backup ?? []).includes(h)) {
    await User.updateOne({ _id: u._id }, { $pull: { 'twoFactor.backup': h } }); // each backup code works once
    return finishLogin(req, u, ` with a backup code (${(tf.backup ?? []).length - 1} left)`);
  }
  await recordFailure(u, `Wrong two-step code · ${deviceOf(req.headers)}`);
  throw new ApiError(401, 'Wrong code. Check the 6-digit code in your authenticator app.');
});

export const dynamic = 'force-dynamic';
