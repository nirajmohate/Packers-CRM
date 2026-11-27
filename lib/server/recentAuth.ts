import type { NextRequest } from 'next/server';
import { ApiError } from './http';
import { currentSid, sidHashOf } from './auth';
import { Session } from './models';

/* ---------- password typed again for a sensitive action ("are you really you?") ---------- */
const CONFIRM_MS = 10 * 60_000;

/** Throws 428 "confirm_password" unless the password was typed again on this device in the last 10 minutes. */
export async function requireRecentPassword(req: NextRequest) {
  const sid = await currentSid(req);
  const s = sid ? ((await Session.findOne({ sidHash: sidHashOf(sid) }).lean()) as { confirmedAt?: Date } | null) : null;
  if (!s?.confirmedAt || Date.now() - new Date(s.confirmedAt).getTime() > CONFIRM_MS) {
    throw new ApiError(428, 'Please type your password again to continue', undefined, 'confirm_password');
  }
}
export async function markPasswordConfirmed(req: NextRequest) {
  const sid = await currentSid(req);
  if (sid) await Session.updateOne({ sidHash: sidHashOf(sid) }, { $set: { confirmedAt: new Date() } });
}

