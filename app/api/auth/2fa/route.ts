import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { requireRecentPassword } from '@/lib/server/recentAuth';
import { User } from '@/lib/server/models';
import { checkCode, newBackupCodes, newSecret, otpauthUri, seal, unseal } from '@/lib/server/totp';

type TF = { enabled?: boolean; secret?: string; pending?: string; lastStep?: number; backup?: string[] };

/** Two-step login status of the signed-in admin. */
export const GET = api({ auth: 'admin' }, async ({ user }) => {
  const u = await User.findById(user.id).lean();
  const tf = (u?.twoFactor ?? {}) as TF;
  return { enabled: !!tf.enabled, backupLeft: (tf.backup ?? []).length };
});

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('enable'), code: z.string().trim().max(10) }),
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('backup') }),
]);

export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  const b = await jsonBody(req, Body);
  await requireRecentPassword(req); // every change here needs the password typed again
  const u = await User.findById(user.id).lean();
  if (!u) throw new ApiError(404, 'Account not found');
  const tf = (u.twoFactor ?? {}) as TF;

  if (b.action === 'start') {
    const secret = newSecret();
    await User.updateOne({ _id: u._id }, { $set: { 'twoFactor.pending': seal(secret) } });
    return { secret: secret.replace(/(.{4})/g, '$1 ').trim(), uri: otpauthUri(secret, String(u.loginId)) };
  }
  if (b.action === 'enable') {
    if (!tf.pending) throw new ApiError(409, 'Start again: scan the new QR code first');
    const secret = unseal(tf.pending);
    const step = checkCode(secret, b.code, 0);
    if (step === null) throw new ApiError(422, 'That code is not right. Check the phone time is automatic and type the newest code.', { code: 'Wrong code' });
    const { codes, hashes } = newBackupCodes();
    await User.updateOne({ _id: u._id }, { $set: { twoFactor: { enabled: true, secret: seal(secret), lastStep: step, backup: hashes } } });
    await audit(user, { action: 'update', entity: 'auth', summary: 'Turned on two-step login (authenticator app)' });
    return { enabled: true, backupCodes: codes };
  }
  if (b.action === 'disable') {
    await User.updateOne({ _id: u._id }, { $unset: { twoFactor: '' } });
    await audit(user, { action: 'update', entity: 'auth', summary: 'Turned off two-step login' });
    return { enabled: false };
  }
  // new backup codes (the old ones stop working)
  if (!tf.enabled) throw new ApiError(409, 'Two-step login is off');
  const { codes, hashes } = newBackupCodes();
  await User.updateOne({ _id: u._id }, { $set: { 'twoFactor.backup': hashes } });
  await audit(user, { action: 'update', entity: 'auth', summary: 'Made new two-step backup codes' });
  return { enabled: true, backupCodes: codes };
});

export const dynamic = 'force-dynamic';
