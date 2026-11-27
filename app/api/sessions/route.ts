import { Types } from 'mongoose';
import { api, ApiError } from '@/lib/server/http';
import { currentSid, sidHashOf } from '@/lib/server/auth';
import { Session, User } from '@/lib/server/models';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Signed-in devices, like "Login activity" in Instagram.
 * ?branch=<id>  the branch owner(s) and Team account of a branch (admin; a branch owner only for their own branch)
 * ?branch=admins  the admin accounts (admin only)
 * ?branch=all  every account (admin only)
 */
export const GET = api({ auth: 'user' }, async ({ req, user }) => {
  if (user.role === 'team') throw new ApiError(403, 'Your account cannot see devices');
  const want = String(req.nextUrl.searchParams.get('branch') ?? '').slice(0, 40);
  let filter: Rec;
  if (user.role === 'admin') {
    if (want === 'all') filter = {};
    else if (want === 'admins') filter = { role: 'admin' };
    else if (Types.ObjectId.isValid(want)) filter = { branchId: want, role: { $in: ['manager', 'team'] } };
    else throw new ApiError(422, 'Choose a branch');
  } else {
    filter = { branchId: user.branchId, role: { $in: ['manager', 'team'] } };
  }
  const users = (await User.find(filter).sort({ role: 1, name: 1 }).lean()) as Rec[];
  const ids = users.map((u) => String(u._id));
  const now = new Date();
  const rows = ids.length ? ((await Session.find({ userId: { $in: ids }, revokedAt: { $exists: false }, expiresAt: { $gt: now } }).sort({ lastSeenAt: -1 }).limit(1000).lean()) as Rec[]) : [];
  const sid = await currentSid(req);
  const mine = sid ? sidHashOf(sid) : '';
  return {
    users: users.map((u) => ({
      id: String(u._id), name: String(u.name), loginId: String(u.loginId), role: String(u.role), active: !!u.active, branchId: u.branchId ? String(u.branchId) : null,
      sessions: rows.filter((s) => s.userId === String(u._id)).map((s) => ({
        id: String(s._id), device: String(s.device ?? ''), browser: String(s.browser ?? ''), os: String(s.os ?? ''), ip: String(s.ip ?? ''), place: String(s.place ?? ''),
        signedInAt: new Date(s.createdAt).toISOString(), lastSeenAt: new Date(s.lastSeenAt ?? s.createdAt).toISOString(), current: s.sidHash === mine,
      })),
    })),
  };
});

export const dynamic = 'force-dynamic';
