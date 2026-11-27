import { Types } from 'mongoose';
import { z } from 'zod';
import { api, ApiError, jsonBody } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { currentSid, endSessions } from '@/lib/server/auth';
import { Session, User } from '@/lib/server/models';
import { mayManage } from '@/lib/server/userAccess';

const Body = z.object({ userId: z.string().max(40), sessionId: z.string().max(40).optional() }).strict();

/** Signs out one device (sessionId) or every device of an account except the one making the request. */
export const POST = api({ auth: 'user' }, async ({ req, user }) => {
  if (user.role === 'team') throw new ApiError(403, 'Your account cannot sign out devices');
  const b = await jsonBody(req, Body);
  if (!Types.ObjectId.isValid(b.userId) || (b.sessionId && !Types.ObjectId.isValid(b.sessionId))) throw new ApiError(404, 'Not found');
  const target = (await User.findById(b.userId).lean()) as Record<string, unknown> | null;
  if (!target) throw new ApiError(404, 'Account not found');
  if (b.userId !== user.id) mayManage(user, target); // own devices: always allowed
  let label = 'every other device';
  if (b.sessionId) {
    const s = (await Session.findOne({ _id: b.sessionId, userId: b.userId }).lean()) as Record<string, unknown> | null;
    if (!s) throw new ApiError(404, 'This device is already signed out');
    label = [s.device, s.browser, s.place || s.ip].filter(Boolean).join(' · ');
  }
  const sid = await currentSid(req);
  const n = await endSessions({ userId: b.userId, id: b.sessionId, exceptSid: b.sessionId ? undefined : sid ?? undefined }, user.name);
  await audit(user, { action: 'logout', entity: 'auth', branchId: target.branchId ? String(target.branchId) : undefined, summary: `Signed out ${target.name} (${target.loginId}) on ${b.sessionId ? label : `${n} device(s)`}` });
  return { ended: n };
});

export const dynamic = 'force-dynamic';
