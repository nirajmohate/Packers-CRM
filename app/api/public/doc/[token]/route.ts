import { NextResponse } from 'next/server';
import { api, ApiError } from '@/lib/server/http';
import { tooManyAttempts } from '@/lib/server/auth';
import { publicDocBundle } from '@/lib/server/docs';
import { readShareToken } from '@/lib/server/shareLinks';

/*
 * A customer opens a document PDF from a link sent on WhatsApp / email. No login: the signed link is the key,
 * it opens only that one document (read-only), expires after 90 days and stops working when the document is deleted.
 */
const ipOf = (h: Headers) => (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'local';

export const GET = api({ auth: 'none' }, async ({ req, params }) => {
  if (tooManyAttempts(`doc-link|${ipOf(req.headers)}`, 60, 10 * 60_000)) throw new ApiError(429, 'Too many requests. Please wait a few minutes.');
  const id = readShareToken(params.token);
  if (!id) throw new ApiError(410, 'This link is not valid or has expired. Please ask the company for a new link.', undefined, 'link_gone');
  return NextResponse.json(await publicDocBundle(id), { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } });
});

export const dynamic = 'force-dynamic';
