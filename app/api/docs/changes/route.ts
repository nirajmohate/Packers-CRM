import { api } from '@/lib/server/http';
import { listChanges } from '@/lib/server/docs';
import { Branch } from '@/lib/server/models';
import { branchOut } from '@/lib/server/out';
import { bundleFor, loadBundle } from '@/lib/server/settings';

const OVERLAP_MS = 60_000; // re-send the last minute too, so a save that finished during the last sync is never missed
const MAX_AGE_MS = 6 * 60 * 60_000; // after a long gap a full reload is simpler and just as fast

/** Only the documents that changed after `after` (an ISO time the server gave in the previous sync). */
export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  const syncAt = new Date();
  const raw = req.nextUrl.searchParams.get('after') ?? '';
  const after = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(raw) ? new Date(raw) : null;
  if (!after || Number.isNaN(after.getTime()) || syncAt.getTime() - after.getTime() > MAX_AGE_MS || after.getTime() > syncAt.getTime() + 60_000) {
    return { full: true };
  }
  const [changes, branches, settings] = await Promise.all([
    listChanges(user, new Date(after.getTime() - OVERLAP_MS)),
    user.role === 'admin' ? Branch.find({}).sort({ name: 1 }).lean() : Branch.find({ _id: user.branchId }).lean(),
    loadBundle(),
  ]);
  if (changes.full) return { full: true };
  return { full: false, user, docs: changes.docs, removed: changes.removed, branches: branches.map(branchOut), settings: bundleFor(user, settings), syncAt: syncAt.toISOString() };
});

export const dynamic = 'force-dynamic';
