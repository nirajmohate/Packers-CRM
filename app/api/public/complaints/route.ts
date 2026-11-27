import { timingSafeEqual } from 'crypto';
import { api, ApiError } from '@/lib/server/http';
import { tooManyAttempts } from '@/lib/server/auth';
import { receiveComplaint } from '@/lib/server/complaints';

/*
 * The cloudpackers.com complaint form sends a copy of each complaint here (server to server, see website/crm-complaint-hook.php).
 * It must send the secret COMPLAINT_KEY (set the same value in Vercel and in the PHP file) in the "X-CRM-Key" header.
 */
const ipOf = (h: Headers) => (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'local';

function keyOk(sent: string | null) {
  const want = process.env.COMPLAINT_KEY ?? '';
  if (want.length < 24) throw new ApiError(503, 'Complaints are not set up yet (COMPLAINT_KEY is missing in the server settings)');
  const a = Buffer.from(String(sent ?? ''));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = api({ auth: 'none' }, async ({ req }) => {
  if (tooManyAttempts(`complaint|${ipOf(req.headers)}`, 40, 10 * 60_000)) throw new ApiError(429, 'Too many complaints from this address. Please try later.');
  if (!keyOk(req.headers.get('x-crm-key'))) throw new ApiError(401, 'Wrong key');
  const text = await req.text();
  if (text.length > 30_000) throw new ApiError(413, 'Too large');
  let input: Record<string, unknown> = {};
  const type = req.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) input = JSON.parse(text || '{}');
    else input = Object.fromEntries(new URLSearchParams(text));
  } catch { throw new ApiError(400, 'Could not read the complaint'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'Could not read the complaint');
  const r = await receiveComplaint(input as Record<string, unknown>);
  return { ok: true, ref: r.ref, duplicate: r.duplicate };
});

export const dynamic = 'force-dynamic';
