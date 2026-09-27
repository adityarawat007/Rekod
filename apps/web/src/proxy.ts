import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

/**
 * An optimistic gate: is there a session cookie at all? It does not verify
 * one — that is a database (or signed-cookie-cache) read, and this runs on
 * every request, RSC navigations included. requireActor() in lib/server does
 * the real check wherever data is read or written; a forged cookie gets past
 * here and is sent to /login from there.
 *
 * Open without a cookie:
 *  - /login, and /api/auth (Better Auth's own routes, the Google callback too)
 *  - /api/v1: the extension's API, which authenticates by Bearer itself
 *  - /s/<token>: the share page — the token is the credential
 *  - /api/health (excluded by the matcher, it never runs this at all)
 */
const OPEN = ['/login', '/api/auth', '/api/v1', '/s/'];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const open = OPEN.some((p) => path.startsWith(p));
  const signedIn = !!getSessionCookie(req, { cookiePrefix: 'rekod' });

  if (!signedIn && !open) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.search = '';
    to.searchParams.set('next', path);
    return NextResponse.redirect(to);
  }
  // No "signed in, so leave /login" bounce here: a cookie whose session has
  // expired passes this check, requireActor() sends it to /login, and this
  // would send it straight back — a loop. The login page checks for real.
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
