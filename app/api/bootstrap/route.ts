import { api } from '@/lib/server/http';
import { listDocs } from '@/lib/server/docs';
import { Branch } from '@/lib/server/models';
import { branchOut } from '@/lib/server/out';
import { bundleFor, loadBundle } from '@/lib/server/settings';
import { defaultSince } from '@/lib/server/shared';

/** Everything the app needs right after sign-in, in one request. */
export const GET = api({ auth: 'user', allowMustChange: true }, async ({ req, user }) => {
  if (user.mustChangePassword) return { user };
  const since = req.nextUrl.searchParams.get('since') || defaultSince();
  const [branches, settings, docs] = await Promise.all([
    user.role === 'admin' ? Branch.find({}).sort({ name: 1 }).lean() : Branch.find({ _id: user.branchId }).lean(),
    loadBundle(),
    listDocs(user, { since }),
  ]);
  return { user, branches: branches.map(branchOut), settings: bundleFor(user, settings), docs, since };
});

export const dynamic = 'force-dynamic';
