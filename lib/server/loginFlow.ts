import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { audit, deviceOf } from './audit';
import { deviceInfo, setSessionCookie, signSession, startSessionRecord, toSessionUser } from './auth';
import { SecurityAlert, User } from './models';
import { sendSecurityMessage } from './notify';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;

/** A wrong password or wrong code: counts towards the 15-minute lock. */
export async function recordFailure(u: Rec, why: string) {
  const n = ((u.failedLogins as number) ?? 0) + 1;
  await User.updateOne({ _id: u._id }, n >= LOCK_AFTER ? { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } } : { $set: { failedLogins: n } });
  await audit({ id: String(u._id), name: String(u.name), role: String(u.role) } as never, { action: 'login_failed', entity: 'auth', summary: n >= LOCK_AFTER ? `${why}, account locked for 15 minutes` : why });
}

export const isLocked = (u: Rec) => !!u.lockUntil && new Date(u.lockUntil as Date).getTime() > Date.now();

/** Password (and code, when two-step login is on) are right: start the device session, spot a new device, set the cookie. */
export async function finishLogin(req: NextRequest, u: Rec, extra = '') {
  const info = deviceInfo(req.headers);
  const fp = createHash('sha256').update(`${String(u._id)}|${info.os}|${info.browser}|${info.device}`).digest('hex').slice(0, 32);
  const known: string[] = Array.isArray(u.knownDevices) ? u.knownDevices : [];
  const isNew = !known.includes(fp);
  await User.updateOne({ _id: u._id }, {
    $set: { failedLogins: 0, lastLoginAt: new Date() }, $unset: { lockUntil: '' },
    ...(isNew ? { $push: { knownDevices: { $each: [fp], $slice: -40 } } } : {}),
  });
  const user = toSessionUser(u);
  const { sid, id: sessionId } = await startSessionRecord(user.id, req.headers);
  await audit(user, { action: 'login', entity: 'auth', branchId: user.branchId ?? undefined, summary: `Signed in${user.role === 'team' ? ' (Team account)' : ''}${extra} · ${deviceOf(req.headers)}${isNew ? ' · new device' : ''}` });

  // an admin account opened on a device it never used before (not the very first sign-in): tell the admin
  if (isNew && known.length > 0 && u.role === 'admin') {
    await SecurityAlert.create({ kind: 'new_device', userId: user.id, userName: user.name, loginId: String(u.loginId), sessionId, device: `${info.device} · ${info.browser}`, place: info.place, ip: info.ip });
    const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    void sendSecurityMessage(
      `New sign-in to admin account ${String(u.loginId)}`,
      `Cloud Packers CRM: the admin account "${String(u.loginId)}" (${user.name}) was just opened on a new device.\n\nDevice: ${info.device} · ${info.browser} (${info.os})\nPlace: ${info.place || 'unknown'}\nIP: ${info.ip || 'unknown'}\nTime: ${when}\n\nWas this you? If not: open the CRM → Branches → Admin logged-in devices → Sign out that device, then change the password.`,
    );
  }
  const res = NextResponse.json({ user });
  setSessionCookie(res, req, await signSession({ id: user.id, role: user.role, branchId: user.branchId, sv: Number(u.sv ?? 0), sid }));
  return res;
}
