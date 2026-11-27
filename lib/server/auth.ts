import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import type { SessionUser } from '../types';
import { authSecret } from './env';
import { createHash, randomBytes } from 'crypto';
import { Session, User } from './models';

export const COOKIE = 'pm_session';
const MAX_AGE = 7 * 24 * 3600;

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);
// compared against when the login id does not exist, so timing does not reveal valid ids
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

export function passwordProblem(p: string, loginId = ''): string | null {
  if (p !== p.trim()) return 'Password cannot start or end with a space';
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Password needs at least one letter and one number';
  if (loginId && p.toLowerCase() === loginId.toLowerCase()) return 'Password cannot be the same as the login ID';
  return null;
}

export const randomPassword = (): string => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const pw = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return /\d/.test(pw) && /[A-Za-z]/.test(pw) ? pw : randomPassword();
};

const hashSid = (sid: string) => createHash('sha256').update(sid).digest('hex');

/** Where a request comes from, for the device list: browser, system, IP and (on Vercel) the city. */
export function deviceInfo(h: Headers) {
  const ua = h.get('user-agent') || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const model = (/Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(ua)?.[1] ?? '').replace(/[^\w .-]/g, '').slice(0, 40);
  const ip = ((h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || '').slice(0, 45).replace(/[^0-9a-fA-F.:]/g, '');
  const dec = (v: string | null) => { try { return v ? decodeURIComponent(v).replace(/[^\p{L}\p{N} .,'-]/gu, '').slice(0, 60) : ''; } catch { return ''; } };
  const place = [dec(h.get('x-vercel-ip-city')), dec(h.get('x-vercel-ip-country-region')), dec(h.get('x-vercel-ip-country'))].filter(Boolean).join(', ');
  return { browser, os, device: model && model !== 'K' ? model : os, ip, place };
}

/** Records a new signed-in device and returns its secret id (goes into the cookie). */
export async function startSession(userId: string, h: Headers) {
  return (await startSessionRecord(userId, h)).sid;
}
/** Same, also returning the device record id (for alerts). */
export async function startSessionRecord(userId: string, h: Headers) {
  const sid = randomBytes(24).toString('base64url');
  const row = await Session.create({ userId, sidHash: hashSid(sid), ...deviceInfo(h), lastSeenAt: new Date(), expiresAt: new Date(Date.now() + MAX_AGE * 1000) });
  return { sid, id: String(row._id) };
}

/* ---------- two-step login ticket (between password and code, 5 minutes) ---------- */
export async function signTicket(userId: string, sv: number) {
  return new SignJWT({ p: '2fa', sv }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('5m').sign(authSecret());
}
export async function readTicket(t: string) {
  try {
    const { payload } = await jwtVerify(String(t ?? ''), authSecret(), { algorithms: ['HS256'] });
    return payload.p === '2fa' && typeof payload.sub === 'string' ? { userId: payload.sub, sv: Number(payload.sv) } : null;
  } catch { return null; }
}

/** Signs out devices: one (by its record id), or all of a user's devices except, optionally, one. */
export async function endSessions(filter: { userId: string; id?: string; exceptSid?: string }, byName: string) {
  const q: Record<string, unknown> = { userId: filter.userId, revokedAt: { $exists: false } };
  if (filter.id) q._id = filter.id;
  if (filter.exceptSid) q.sidHash = { $ne: hashSid(filter.exceptSid) };
  const r = await Session.updateMany(q, { $set: { revokedAt: new Date(), revokedByName: byName, expiresAt: new Date() } });
  return r.modifiedCount;
}

export async function signSession(u: { id: string; role: string; branchId: string | null; sv: number; sid: string }) {
  return new SignJWT({ role: u.role, bid: u.branchId, sv: u.sv, sid: u.sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(u.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(authSecret());
}

export async function readToken(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: ['HS256'] });
    return payload as { sub: string; role: string; bid: string | null; sv: number; sid?: string };
  } catch { return null; }
}

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string) {
  const secure = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export function toSessionUser(u: Record<string, unknown>): SessionUser {
  return {
    id: String(u._id), name: String(u.name), loginId: String(u.loginId), role: u.role as 'admin' | 'manager' | 'team',
    branchId: u.branchId ? String(u.branchId) : null, mustChangePassword: false, // the admin sets every password; nobody is forced to change it
  };
}

/** Reads the session cookie and checks it against the database (so disabled users and reset passwords lose access at once). */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const p = await readToken(req.cookies.get(COOKIE)?.value);
  if (!p || !Types.ObjectId.isValid(p.sub)) return null;
  // every sign-in is a device record; a cookie from before device tracking (no sid) must sign in again
  if (typeof p.sid !== 'string' || p.sid.length < 20) return null;
  const [u, s] = await Promise.all([User.findById(p.sub).lean(), Session.findOne({ sidHash: hashSid(p.sid) }).lean()]);
  if (!u || !u.active || (u.sv as number) !== p.sv) return null;
  if (!s || String(s.userId) !== p.sub || s.revokedAt || new Date(s.expiresAt as Date).getTime() < Date.now()) return null; // signed out from the device list
  // branch owners and the team must belong to a branch; anything else is refused
  if (u.role !== 'admin' && (!u.branchId || !['manager', 'team'].includes(String(u.role)))) return null;
  // "last active" for the device list, written at most every 5 minutes
  if (!s.lastSeenAt || Date.now() - new Date(s.lastSeenAt as Date).getTime() > 5 * 60_000) void Session.updateOne({ _id: s._id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
  return toSessionUser(u);
}

/** The secret device id of this request (to mark "this device" and to keep it when signing out the others). */
export async function currentSid(req: NextRequest) {
  return (await readToken(req.cookies.get(COOKIE)?.value))?.sid ?? null;
}
export const sidHashOf = hashSid;

/* simple in-memory brake on login attempts per address + login id */
const attempts = new Map<string, { n: number; reset: number }>();
export function tooManyAttempts(key: string, limit = 20, windowMs = 15 * 60_000) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k); // keep memory small
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + windowMs }); return false; }
  a.n++;
  return a.n > limit;
}
