import { NextResponse } from 'next/server';
import { api } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { clearSessionCookie, currentSid, currentUser, endSessions, sidHashOf } from '@/lib/server/auth';
import { Session } from '@/lib/server/models';

export const POST = api({ auth: 'none' }, async ({ req }) => {
  const u = await currentUser(req);
  if (u) {
    const sid = await currentSid(req);
    const s = sid ? ((await Session.findOne({ sidHash: sidHashOf(sid) }).lean()) as { _id: unknown } | null) : null;
    if (s) await endSessions({ userId: u.id, id: String(s._id) }, u.name);
    await audit(u, { action: 'logout', entity: 'auth', summary: 'Signed out' });
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});

export const dynamic = 'force-dynamic';
