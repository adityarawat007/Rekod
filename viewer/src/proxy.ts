import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Refreshes the session cookie and gates everything except /login and the
// OAuth callback. Without this the access token expires mid-session and reads
// start coming back empty instead of erroring, which is worse.
//
// getClaims(), not getUser(): this runs on EVERY request, RSC navigations
// included, and getUser() is a round trip to the auth server each time — it was
// costing ~870ms before Next rendered a byte, which no loading.tsx can hide.
// The project signs with ES256, so getClaims() verifies the signature locally
// against a JWKS that auth-js caches at module scope. Same guarantee: a forged
// or expired cookie fails verification.
// Next 16: this file is `proxy.ts`, not `middleware.ts` — the old convention is
// deprecated and the export is renamed with it.
export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims.sub;

  // A refresh token that no longer exists server-side is retried on every
  // request forever. Drop the cookie so the next load is a clean anon one.
  const settle = (r: NextResponse) => {
    if (error?.code?.startsWith('refresh_token') || /refresh token/i.test(error?.message ?? '')) {
      for (const c of req.cookies.getAll()) {
        if (c.name.startsWith('sb-')) r.cookies.delete(c.name);
      }
    }
    return r;
  };
  // /s/<token> is the public share page. Without it here every share link
  // bounces a recipient who has no account to /login, which is the whole point
  // of the feature defeated. The token is the credential; RLS is not involved,
  // because the page reads through a security definer function.
  const path = req.nextUrl.pathname;
  const open = path.startsWith('/login') || path.startsWith('/auth') || path.startsWith('/s/');

  if (!signedIn && !open) {
    const to = req.nextUrl.clone();
    to.pathname = '/login';
    to.searchParams.set('next', req.nextUrl.pathname);
    return settle(NextResponse.redirect(to));
  }
  if (signedIn && path === '/login') {
    const to = req.nextUrl.clone();
    to.pathname = '/';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return settle(res);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp)$).*)'],
};
