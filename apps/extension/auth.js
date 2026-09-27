// The dashboard is the only place you sign in. The extension reads that session
// straight out of the dashboard's cookie — nothing is stored on this side, so
// there is no second copy to go stale and no password field in the popup.
//
// The cookie is Better Auth's, and its value goes back to the dashboard as
// `Authorization: Bearer <value>` (the server's bearer plugin checks its
// signature). There is no token handling here and no refresh of any kind: a
// Better Auth session lasts a week and the dashboard extends it on use, and
// the cookie's own expiry IS the session's, so Chrome stops returning it the
// moment it is no longer good.

// Prod first, then the dev server. Whichever holds a live session wins, so the
// extension keeps working while you develop without editing this line twice a
// day. Both need a matching entry in host_permissions or chrome.cookies returns
// nothing for that origin.
const DASH_ORIGINS = ['https://rekody.vercel.app', 'http://localhost:3100'];
const DASH = DASH_ORIGINS[0];   // where the Login button sends you

// `rekod.session_token` (cookiePrefix in apps/web/src/lib/server/auth.ts).
// Over https Better Auth marks it Secure and adds the __Secure- prefix.
const COOKIES = ['__Secure-rekod.session_token', 'rekod.session_token'];

/** The cookie value, read with chrome.cookies.get().
 *
 *  NOT getAll(). Measured on this machine, for a live cookie on the dashboard's
 *  own origin: get({url, name}) returns it, while getAll({url}), getAll({domain})
 *  and getAll({name}) all return [] — no error, no warning, just an empty list
 *  that reads exactly like "you are signed out". The cookie is SameSite=Lax and
 *  an extension page is a different site, which is the likeliest reason getAll's
 *  would-this-be-sent filter drops it; the mechanism is a guess, the behaviour is
 *  not. */
async function fjRawAt(origin) {
  for (const name of COOKIES) {
    const c = await chrome.cookies.get({ url: origin, name });
    if (c?.value) return c.value;
  }
  return null;
}

/** `live` or `none`. The shape — and the `stale` state worker.js still knows
 *  how to renew — is kept from the Supabase days so the popup and the worker
 *  did not have to change; a Better Auth cookie is never stale, it is either
 *  there or gone. `session.origin` is where uploads go: the dashboard that
 *  issued it.
 *
 *  Needs chrome.cookies: worker.js and popup.html only. The offscreen document
 *  asks the worker for it ({ to: 'bg', t: 'session' }). */
async function fjSessionState() {
  for (const origin of DASH_ORIGINS) {
    const raw = await fjRawAt(origin);
    if (raw) return { state: 'live', session: { access_token: raw, origin }, origin };
  }
  return { state: 'none', session: null, origin: null };
}

/** The live session or null. Every uploader wants exactly this. */
async function fjSession() {
  return (await fjSessionState()).session;
}
