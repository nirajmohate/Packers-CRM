import { timingSafeEqual } from 'crypto';
import { api, ApiError } from '@/lib/server/http';
import { indiaDates, runReminders, type Slot } from '@/lib/server/pushJobs';

/**
 * Called by the scheduler (Vercel Cron, see vercel.json; on your own server, any cron that opens this URL).
 * It must send:  Authorization: Bearer <CRON_SECRET>   (Vercel adds this by itself when CRON_SECRET is set).
 * ?slot=morning → packing today/tomorrow + complaints over 48 h;  ?slot=evening → complaints over 48 h.
 */
export const GET = api({ auth: 'none' }, async ({ req }) => {
  const secret = process.env.CRON_SECRET || '';
  if (secret.length < 16) throw new ApiError(503, 'CRON_SECRET is not set');
  const got = Buffer.from(req.headers.get('authorization') || '');
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, 'Not allowed');
  const q = new URL(req.url).searchParams.get('slot');
  const slot: Slot = q === 'morning' || q === 'evening' ? q : indiaDates().hour < 14 ? 'morning' : 'evening';
  return await runReminders(slot);
});

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
