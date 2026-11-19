import { NextResponse } from 'next/server';
import { api } from '@/lib/server/http';
import { audit } from '@/lib/server/audit';
import { clearSessionCookie, currentUser } from '@/lib/server/auth';

export const POST = api({ auth: 'none' }, async ({ req }) => {
  const u = await currentUser(req);
  if (u) await audit(u, { action: 'logout', entity: 'auth', summary: 'Signed out' });
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});

export const dynamic = 'force-dynamic';
