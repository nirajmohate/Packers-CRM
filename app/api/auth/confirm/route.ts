import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { checkPassword, tooManyAttempts } from '@/lib/server/auth';
import { markPasswordConfirmed } from '@/lib/server/recentAuth';
import { User } from '@/lib/server/models';

/** "Type your password again" before a sensitive action. Valid for 10 minutes on this device. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  const { password } = await jsonBody(req, z.object({ password: z.string().min(1).max(200) }));
  if (tooManyAttempts(`confirm|${user.id}`, 10, 10 * 60_000)) throw new ApiError(429, 'Too many tries. Please wait a few minutes.');
  const u = await User.findById(user.id).lean();
  if (!u || !(await checkPassword(password, String(u.passwordHash)))) {
    await audit(user, { action: 'login_failed', entity: 'auth', summary: 'Wrong password when confirming a sensitive action' });
    throw new ApiError(422, 'Wrong password', { password: 'Wrong password' });
  }
  await markPasswordConfirmed(req);
  return { ok: true };
});

export const dynamic = 'force-dynamic';
