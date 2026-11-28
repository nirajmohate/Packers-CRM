import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { currentSid, sidHashOf } from '@/lib/server/auth';
import { audit } from '@/lib/server/audit';
import { PushSub, Session } from '@/lib/server/models';
import { isPushEndpoint, pushConfigured, vapidPublicKey } from '@/lib/server/webpush';
import type { SessionUser } from '@/lib/types';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Phone notifications are for the admin and branch owners (TSM). */
function mayUsePush(user: SessionUser) {
  if (user.role !== 'admin' && user.role !== 'manager') throw new ApiError(403, 'Notifications are for the admin and branch owners');
}

/** Is it set up on the server, and the public key the phone needs to subscribe. */
export const GET = api({ auth: 'user' }, async ({ user }) => {
  mayUsePush(user);
  return { configured: pushConfigured(), publicKey: pushConfigured() ? vapidPublicKey() : '' };
});

const b64u = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+=*$/);
const SubBody = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: b64u(80, 100), auth: b64u(16, 32) }) });

/** Turn notifications on for this device. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  mayUsePush(user);
  if (!pushConfigured()) throw new ApiError(503, 'Notifications are not set up on the server yet (VAPID keys missing)');
  const b = await jsonBody(req, SubBody);
  if (!isPushEndpoint(b.endpoint)) throw new ApiError(400, 'This browser’s notification service is not supported');
  const sid = await currentSid(req);
  if (!sid) throw new ApiError(401, 'Please sign in again');
  const sidHash = sidHashOf(sid);
  const s = (await Session.findOne({ sidHash }).select('device browser os').lean()) as Rec | null;
  const device = [s?.device, s?.browser].filter(Boolean).join(' · ').slice(0, 80);
  await PushSub.updateOne(
    { endpoint: b.endpoint },
    { $set: { userId: user.id, sidHash, p256dh: b.keys.p256dh, auth: b.keys.auth, device, fails: 0 } },
    { upsert: true },
  );
  // keep at most 10 phones per person
  const extra = (await PushSub.find({ userId: user.id }).sort({ updatedAt: -1 }).skip(10).select('_id').lean()) as Rec[];
  if (extra.length) await PushSub.deleteMany({ _id: { $in: extra.map((x) => x._id) } });
  await audit(user, { action: 'update', entity: 'auth', summary: `Turned on phone notifications${device ? ` (${device})` : ''}` });
  return { ok: true };
});

/** Turn notifications off for this device. */
export const DELETE = api({ auth: 'user' }, async ({ req, user }) => {
  const b = await jsonBody(req, z.object({ endpoint: z.string().max(1000) }));
  await PushSub.deleteOne({ endpoint: b.endpoint, userId: user.id });
  return { ok: true };
});

export const dynamic = 'force-dynamic';
