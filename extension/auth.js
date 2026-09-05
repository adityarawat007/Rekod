// The dashboard is the only place you sign in. The extension reads that session
// straight out of the dashboard's cookie — nothing is stored on this side, so
// there is no second copy to go stale and no password field in the popup.
//
// ponytail: no refresh here. An expired cookie shows the "session expired" card
// and sends you to the dashboard, which refreshes it on load. Refreshing from
// two places races Supabase's refresh-token reuse detection and logs you out of
// both.
const SUPABASE_URL  = 'https://odrrzeqctgkrsyposkun.supabase.co';
const SUPABASE_ANON = 'sb_publishable_h344Jny4uvxnKnepiOhAjw_UgU9vgSc';
const DASH = 'http://localhost:3100';

// @supabase/ssr writes sb-<project-ref>-auth-token, split into .0/.1/… when the
// value is over ~3KB, and prefixes the JSON with `base64-`.
const COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const fromBase64Url = (s) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  );

/** The dashboard's live session, or null if absent or expired.
 *  Needs chrome.cookies: worker.js and popup.html only. The offscreen document
 *  asks the worker for it ({ to: 'bg', t: 'session' }). */
async function fjSession() {
  const parts = (await chrome.cookies.getAll({ url: DASH }))
    .filter((c) => c.name === COOKIE || c.name.startsWith(`${COOKIE}.`))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!parts.length) return null;

  let raw = parts.map((c) => c.value).join('');
  try { raw = decodeURIComponent(raw); } catch {}
  try {
    if (raw.startsWith('base64-')) raw = fromBase64Url(raw.slice(7));
    const s = JSON.parse(raw);
    // 60s of slack: a token that expires mid-upload fails the insert, not the fetch.
    return s?.access_token && s.expires_at * 1000 > Date.now() + 60_000 ? s : null;
  } catch {
    return null;                                  // half-written chunks, mid-refresh
  }
}
