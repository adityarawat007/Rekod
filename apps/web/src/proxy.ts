import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { serverEnv } from './lib/env';
import { olderThan } from './lib/version';

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
 *  - /api/cron: Vercel's scheduler, which authenticates by CRON_SECRET itself
 *  - /api/health (excluded by the matcher, it never runs this at all)
 */
const OPEN = ['/login', '/api/auth', '/api/v1', '/api/cron', '/s/'];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // The kill switch for old extensions: every /api/v1 call carries the
  // extension's version, and one below MIN_EXTENSION_VERSION is told to update
  // instead of served. `message` is shown as is, by every version that has
  // this header — which is why it shipped before anything needed it.
  const min = path.startsWith('/api/v1') && serverEnv().MIN_EXTENSION_VERSION;
  if (min && olderThan(req.headers.get('x-rekod-version'), min)) {
    return NextResponse.json({
      error: 'outdated',
      message: 'This version of ReKod is out of date. Update it from chrome://extensions, then try again.',
    }, { status: 426 });
  }

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
