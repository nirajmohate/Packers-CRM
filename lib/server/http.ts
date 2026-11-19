import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import type { SessionUser } from '../types';
import { connectDb } from './db';
import { currentUser } from './auth';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public code?: string) { super(message); }
}

export interface Ctx { req: NextRequest; user: SessionUser; params: Record<string, string> }
type Opts = { auth?: 'user' | 'admin' | 'none'; allowMustChange?: boolean };

/** Rejects state-changing requests that were started by another website. */
function originGuard(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    let ok = false;
    try { ok = new URL(origin).host === host; } catch { ok = false; }
    if (!ok) throw new ApiError(403, 'Request blocked (different origin)');
  } else if (req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError(403, 'Request blocked (cross-site)');
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, fields: e.fields, code: e.code }, { status: e.status, headers: { 'Cache-Control': 'no-store' } });
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) {
      const x = i as unknown as { code: string; minimum?: number; maximum?: number; input?: unknown; message: string };
      fields[i.path.join('.') || '_'] =
        x.code === 'too_small' ? (x.minimum === 1 ? 'Required' : `Must be at least ${x.minimum} characters`)
        : x.code === 'too_big' ? `Too long (at most ${x.maximum})`
        : x.code === 'invalid_type' ? (x.input === undefined ? 'Required' : 'Invalid value')
        : x.message;
    }
    return NextResponse.json({ error: 'Please check the highlighted fields', fields }, { status: 400 });
  }
  const code = (e as { code?: number })?.code;
  if (code === 11000) return NextResponse.json({ error: 'That value is already in use' }, { status: 409 });
  console.error('[api]', e);
  const msg = e instanceof Error && /AUTH_SECRET|ECONNREFUSED|selection timed out|MONGODB/i.test(e.message) ? e.message : 'Something went wrong on the server';
  return NextResponse.json({ error: msg }, { status: 500 });
}

export function api(opts: Opts, fn: (c: Ctx) => Promise<unknown>) {
  return async (req: NextRequest, rc: { params: Record<string, string> }) => {
    try {
      originGuard(req);
      await connectDb();
      let user = null as unknown as SessionUser;
      if (opts.auth !== 'none') {
        const u = await currentUser(req);
        if (!u) throw new ApiError(401, 'Please sign in', undefined, 'unauthenticated');
        if (u.mustChangePassword && !opts.allowMustChange) throw new ApiError(403, 'Please change your password first', undefined, 'must_change_password');
        if (opts.auth === 'admin' && u.role !== 'admin') throw new ApiError(403, 'Only the admin can do this');
        user = u;
      }
      const out = await fn({ req, user, params: rc?.params ?? {} });
      if (out instanceof NextResponse) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function jsonBody<T>(req: NextRequest, schema: { parse: (v: unknown) => T }): Promise<T> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new ApiError(400, 'Request body must be JSON'); }
  return schema.parse(raw);
}
