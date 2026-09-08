// The dashboard is the only place you sign in. The extension reads that session
// straight out of the dashboard's cookie — nothing is stored on this side, so
// there is no second copy to go stale and no password field in the popup.
//
// ponytail: no token handling here, and no refresh of any kind. An expired
// cookie shows the expired card and sends you to the dashboard, which refreshes
// it on load. Two things this deliberately does NOT do:
//   - call /auth/v1/token itself — two refreshers race Supabase's reuse
//     detection and log you out of both.
//   - GET the dashboard to make IT refresh. Tried, reverted: proxy.ts answers
//     any refresh-token error by deleting every sb-* cookie, and an
//     extension-initiated fetch applies that Set-Cookie, so the poke can log
//     you out for real. Bring it back only with proxy.ts fixed to scope that
//     deletion to real navigations.
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

/** The cookie value, read with chrome.cookies.get().
 *
 *  NOT getAll(). Measured on this machine, for a live cookie on the dashboard's
 *  own origin: get({url, name}) returns it, while getAll({url}), getAll({domain})
 *  and getAll({name}) all return [] — no error, no warning, just an empty list
 *  that reads exactly like "you are signed out". The cookie is SameSite=Lax and
 *  an extension page is a different site, which is the likeliest reason getAll's
 *  would-this-be-sent filter drops it; the mechanism is a guess, the behaviour is
 *  not. @supabase/ssr's own get-based adapter does the same thing for the same
 *  reason, chunk "hints" included.
 *
 *  ponytail: get() needs the exact name, which is the whole cost — every chunk
 *  is one more call. Fine at 2 or 3; if a session ever needs dozens of chunks,
 *  that is the ceiling and getAll is not the way around it.
 *
 *  Assembly mirrors @supabase/ssr's combineChunks: an unchunked cookie wins
 *  outright, otherwise `.0`, `.1`, … in NUMERIC order, stopping at the first
 *  gap. Joining a leftover unchunked cookie onto the chunks decodes to garbage. */
async function fjRawAt(origin) {
  const one = async (name) => (await chrome.cookies.get({ url: origin, name }))?.value || null;
  const whole = await one(COOKIE);
  if (whole) return whole;
  const parts = [];
  for (let i = 0; ; i++) {
    const part = await one(`${COOKIE}.${i}`);
    if (!part) break;
    parts.push(part);
  }
  return parts.length ? parts.join('') : null;
}

/** The session in one origin's cookie jar, expired or not, or null. */
async function fjCookieAt(origin) {
  let raw = await fjRawAt(origin);
  if (!raw) return null;
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

/** The dashboard's live session, or null if absent or expired everywhere.
 *  Needs chrome.cookies: worker.js and popup.html only. The offscreen document
 *  asks the worker for it ({ to: 'bg', t: 'session' }). */
async function fjSession() {
  for (const origin of DASH_ORIGINS) {
    const s = await fjCookieAt(origin);
    if (s && fjLive(s)) return s;
  }
  return null;
}
