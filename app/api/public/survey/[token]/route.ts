import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/server/http';
import { tooManyAttempts } from '@/lib/server/auth';
import { publicInfo, publicSubmit, tokenOk } from '@/lib/server/surveyLinks';

/*
 * Customer survey form, opened with a one-time link. No login: the link is the only key.
 * The link is random (256 bits), stored only as a hash, works once, expires after 7 days and can be cancelled.
 * Requests are limited per address so the form cannot be used to hammer the server.
 */
const ipOf = (h: Headers) => (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
const MAX_BODY = 200_000;

export const GET = api({ auth: 'none' }, async ({ req, params }) => {
  if (tooManyAttempts(`survey-get|${ipOf(req.headers)}`, 60, 10 * 60_000)) throw new ApiError(429, 'Too many requests. Please wait a few minutes.');
  if (!tokenOk(params.token)) throw new ApiError(410, 'This link is not valid. Please ask the company for a new link.', undefined, 'link_gone');
  const res = NextResponse.json(await publicInfo(params.token), { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  return res;
});

export const POST = api({ auth: 'none' }, async ({ req, params }) => {
  const ip = ipOf(req.headers);
  if (tooManyAttempts(`survey-post|${ip}`, 15, 10 * 60_000)) throw new ApiError(429, 'Too many requests. Please wait a few minutes.');
  if (!tokenOk(params.token)) throw new ApiError(410, 'This link is not valid. Please ask the company for a new link.', undefined, 'link_gone');
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY) throw new ApiError(413, 'Too much data in the form');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new ApiError(413, 'Too much data in the form');
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new ApiError(400, 'Request body must be JSON'); }
  return publicSubmit(params.token, (body && typeof body === 'object' ? body : {}) as Record<string, unknown>);
});

export const dynamic = 'force-dynamic';
