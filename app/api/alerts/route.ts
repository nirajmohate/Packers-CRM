import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { endSessions } from '@/lib/server/auth';
import { SecurityAlert } from '@/lib/server/models';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Unanswered security alerts (new device on an admin account), newest first. Admin only. */
export const GET = api({ auth: 'admin' }, async () => {
  const rows = (await SecurityAlert.find({ answer: { $exists: false } }).sort({ createdAt: -1 }).limit(20).lean()) as Rec[];
  return { alerts: rows.map((a) => ({ id: String(a._id), kind: String(a.kind), userName: String(a.userName ?? ''), loginId: String(a.loginId ?? ''), device: String(a.device ?? ''), place: String(a.place ?? ''), ip: String(a.ip ?? ''), at: new Date(a.createdAt).toISOString() })) };
});

/** "Yes, it was me" or "No, sign it out" (signs that device out at once). */
export const POST = api({ auth: 'admin' }, async ({ req, user }) => {
  const b = await jsonBody(req, z.object({ id: z.string().max(40), answer: z.enum(['me', 'not-me']) }));
  if (!Types.ObjectId.isValid(b.id)) throw new ApiError(404, 'Alert not found');
  const a = (await SecurityAlert.findById(b.id).lean()) as Rec | null;
  if (!a) throw new ApiError(404, 'Alert not found');
  await SecurityAlert.updateOne({ _id: b.id }, { $set: { answer: b.answer, answeredByName: user.name, answeredAt: new Date() } });
  let ended = 0;
  if (b.answer === 'not-me' && a.userId && a.sessionId && Types.ObjectId.isValid(String(a.sessionId))) ended = await endSessions({ userId: String(a.userId), id: String(a.sessionId) }, user.name);
  await audit(user, { action: 'update', entity: 'auth', summary: b.answer === 'me' ? `Confirmed new device for ${a.loginId}: ${a.device}` : `Reported NOT ME for ${a.loginId} on ${a.device} (${a.place || a.ip}); device signed out` });
  return { ok: true, ended };
});

export const dynamic = 'force-dynamic';
