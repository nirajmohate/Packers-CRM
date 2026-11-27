import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { areaOfPath, canSee, canUseType } from './lib/roles';

// '/s' is the customer survey form opened from a one-time link, '/p' a customer's PDF link (no login; the API checks the link)
const PUBLIC = ['/login', '/setup', '/offline.html', '/s', '/p'];

/** Page gate only: sends signed-out visitors to the login page. The API checks every request against the database. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  const secret = process.env.AUTH_SECRET;
  let role: string | null = null;
  const token = req.cookies.get('pm_session')?.value;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
      role = String(payload.role);
    } catch { role = null; }
  }
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  // pages a role may not use go back to the dashboard (the API refuses the data anyway)
  if (pathname === '/change-password' && role !== 'admin') return NextResponse.redirect(new URL('/', req.url)); // only the admin changes passwords
  const who = { role };
  const area = areaOfPath(pathname);
  if (area && !canSee(who, area)) return NextResponse.redirect(new URL('/', req.url));
  if (pathname.startsWith('/admin') && !area) return NextResponse.redirect(new URL('/', req.url));
  const doc = pathname.match(/^\/docs\/([a-z]+)/);
  if (doc && !canUseType(who, doc[1])) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|icon-.*|apple-touch-icon.png|manifest.webmanifest|sw.js|logo.jpg|clients/).*)'],
};
