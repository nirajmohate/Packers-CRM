import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import type { SessionUser } from '../types';
import { authSecret } from './env';
import { User } from './models';

export const COOKIE = 'pm_session';
const MAX_AGE = 7 * 24 * 3600;

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const checkPassword = (p: string, h: string) => bcrypt.compare(p, h);
// compared against when the login id does not exist, so timing does not reveal valid ids
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', 10);

export function passwordProblem(p: string, loginId = ''): string | null {
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

export async function signSession(u: { id: string; role: string; branchId: string | null; sv: number }) {
  return new SignJWT({ role: u.role, bid: u.branchId, sv: u.sv })
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
    return payload as { sub: string; role: string; bid: string | null; sv: number };
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
    id: String(u._id), name: String(u.name), loginId: String(u.loginId), role: u.role as 'admin' | 'manager',
    branchId: u.branchId ? String(u.branchId) : null, mustChangePassword: !!u.mustChangePassword,
  };
}

/** Reads the session cookie and checks it against the database (so disabled users and reset passwords lose access at once). */
export async function currentUser(req: NextRequest): Promise<SessionUser | null> {
  const p = await readToken(req.cookies.get(COOKIE)?.value);
  if (!p || !Types.ObjectId.isValid(p.sub)) return null;
  const u = await User.findById(p.sub).lean();
  if (!u || !u.active || (u.sv as number) !== p.sv) return null;
  if (u.role === 'manager' && !u.branchId) return null;
  return toSessionUser(u);
}

/* simple in-memory brake on login attempts per address + login id */
const attempts = new Map<string, { n: number; reset: number }>();
export function tooManyAttempts(key: string, limit = 20, windowMs = 15 * 60_000) {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || a.reset < now) { attempts.set(key, { n: 1, reset: now + windowMs }); return false; }
  a.n++;
  return a.n > limit;
}
