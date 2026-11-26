import { api } from '@/lib/server/http';
import { listDocs } from '@/lib/server/docs';
import { Branch } from '@/lib/server/models';
import { branchOut } from '@/lib/server/out';
import { bundleFor, loadBundle } from '@/lib/server/settings';
import { defaultSince } from '@/lib/server/shared';
import { retireSetupHeadOffice } from '@/lib/server/headOffice';

/** Everything the app needs right after sign-in, in one request. */
export const GET = api({ auth: 'user', allowMustChange: true }, async ({ req, user }) => {
  if (user.mustChangePassword) return { user };
  const since = req.nextUrl.searchParams.get('since') || defaultSince();
  if (user.role === 'admin') await retireSetupHeadOffice(user);
  const syncAt = new Date(); // taken before reading, so nothing saved during the read is missed by the next quick sync
  const [branches, settings, docs] = await Promise.all([
    user.role === 'admin' ? Branch.find({}).sort({ name: 1 }).lean() : Branch.find({ _id: user.branchId }).lean(),
    loadBundle(),
    listDocs(user, { since }),
  ]);
  return { user, branches: branches.map(branchOut), settings: bundleFor(user, settings), docs, since, syncAt: syncAt.toISOString() };
});

export const dynamic = 'force-dynamic';
