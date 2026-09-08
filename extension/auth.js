// The dashboard is the only place you sign in. The extension reads that session
// straight out of the dashboard's cookie — nothing is stored on this side, so
// there is no second copy to go stale and no password field in the popup.
//
// ponytail: no token handling here. An access token lasts an hour and NOTHING on
// the dashboard refreshes it in the background — no page is mounted with a
// browser client, so the cookie only gets a fresh token when a request passes
// through proxy.ts. So when the cookie is stale but its refresh token is good,
// this asks the dashboard for that request (fjPoke) instead of calling
// /auth/v1/token itself. Still one refresher, so nothing races Supabase's
// refresh-token reuse detection. Only a cookie with no refresh token at all
// shows the "session expired" card.
const SUPABASE_URL  = 'https://odrrzeqctgkrsyposkun.supabase.co';
const SUPABASE_ANON = 'sb_publishable_h344Jny4uvxnKnepiOhAjw_UgU9vgSc';
// Prod first, then the dev server. Whichever holds a live session wins, so the
// extension keeps working while you develop without editing this line twice a
// day. Both need a matching entry in host_permissions or chrome.cookies returns
// nothing for that origin.
const DASH_ORIGINS = ['https://flamjam.vercel.app', 'http://localhost:3100'];
const DASH = DASH_ORIGINS[0];   // where the Login button sends you

// @supabase/ssr writes sb-<project-ref>-auth-token, split into .0/.1/… when the
// value is over ~3KB, and prefixes the JSON with `base64-`.
const COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const fromBase64Url = (s) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );

/** The session in one origin's cookie jar, expired or not, or null. */
async function fjCookieAt(origin) {
  const parts = (await chrome.cookies.getAll({ url: origin }))
    .filter((c) => c.name === COOKIE || c.name.startsWith(`${COOKIE}.`))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!parts.length) return null;

  let raw = parts.map((c) => c.value).join('');
  try { raw = decodeURIComponent(raw); } catch {}
  try {
    if (raw.startsWith('base64-')) raw = fromBase64Url(raw.slice(7));
    const s = JSON.parse(raw);
    return s?.access_token ? s : null;
  } catch {
    return null;                                  // half-written chunks, mid-refresh
  }
}

// 60s of slack: a token that expires mid-upload fails the insert, not the fetch.
const fjLive = (s) => s.expires_at * 1000 > Date.now() + 60_000;

/** GET a gated dashboard page so ITS proxy refreshes the cookie, then re-read.
 *  Must be a gated path: proxy.ts drops the refreshed cookies on the
 *  signed-in-visits-/login redirect. Host permission is what lets the request
 *  carry the cookie and the Set-Cookie land. */
async function fjPoke(origin) {
  try {
    await fetch(`${origin}/`, { credentials: 'include', redirect: 'manual', cache: 'no-store' });
  } catch {}
  const s = await fjCookieAt(origin);
  return s && fjLive(s) ? s : null;
}

/** The dashboard's live session, or null if there is none to refresh.
 *  Needs chrome.cookies: worker.js and popup.html only. The offscreen document
 *  asks the worker for it ({ to: 'bg', t: 'session' }). */
async function fjSession() {
  let stale = null;
  for (const origin of DASH_ORIGINS) {
    const s = await fjCookieAt(origin);
    if (s && fjLive(s)) return s;
    if (s?.refresh_token && !stale) stale = origin;
  }
  return stale ? fjPoke(stale) : null;
}
