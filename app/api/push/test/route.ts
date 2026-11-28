import { api, ApiError } from '@/lib/server/http';
import { currentSid, sidHashOf, tooManyAttempts } from '@/lib/server/auth';
import { PushSub } from '@/lib/server/models';
import { deliver } from '@/lib/server/pushJobs';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sends a test notification to this device. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  if (user.role !== 'admin' && user.role !== 'manager') throw new ApiError(403, 'Notifications are for the admin and branch owners');
  if (tooManyAttempts(`push-test:${user.id}`, 10, 10 * 60_000)) throw new ApiError(429, 'Too many tests. Try again in a few minutes.');
  const sid = await currentSid(req);
  const subs = (await PushSub.find({ userId: user.id, sidHash: sid ? sidHashOf(sid) : '-' }).lean()) as Rec[];
  if (!subs.length) throw new ApiError(404, 'Notifications are not on for this device');
  const sent = await deliver(subs, { title: 'Cloud Packers CRM', body: 'Notifications are working on this phone.', url: '/', tag: 'test' });
  if (!sent) throw new ApiError(502, 'The phone’s notification service did not accept the message. Turn notifications off and on again.');
  return { ok: true, sent };
});

export const dynamic = 'force-dynamic';
