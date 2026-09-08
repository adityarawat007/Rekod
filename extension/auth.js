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

/** The cookie value, reassembled exactly the way @supabase/ssr's combineChunks
 *  does it: an unchunked cookie wins outright, otherwise `.0`, `.1`, … in
 *  NUMERIC order, stopping at the first gap. Both details matter — a leftover
 *  unchunked cookie joined onto the chunks is garbage, and a lexical sort puts
 *  `.10` before `.2`. Mirrored by hand; the extension has no bundler. */
async function fjRawAt(origin) {
  const jar = new Map(
    (await chrome.cookies.getAll({ url: origin })).map((c) => [c.name, c.value]),
  );
  if (jar.get(COOKIE)) return jar.get(COOKIE);
  const parts = [];
  for (let i = 0; jar.get(`${COOKIE}.${i}`); i++) parts.push(jar.get(`${COOKIE}.${i}`));
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

// The gate has now claimed "expired" for three different causes, so it says
// which one. `origin` is stripped of its port for permissions.contains(), since
// a match pattern with a port in it is invalid and throws.
const fjPattern = (origin) => { const u = new URL(origin); return `${u.protocol}//${u.hostname}/*`; };

/** One line per dashboard origin: is the host permission actually granted, what
 *  sb-* cookies are visible, and what the session in them says. */
async function fjWhy() {
  const out = [];
  for (const origin of DASH_ORIGINS) {
    const bits = [new URL(origin).host];
    try {
      bits.push(`perm=${await chrome.permissions.contains({ origins: [fjPattern(origin)] })}`);
    } catch (e) { bits.push(`perm=? (${e.message})`); }
    try {
      const all = await chrome.cookies.getAll({ url: origin });
      const mine = all.filter((c) => c.name.startsWith('sb-'));
      bits.push(`cookies=${all.length}`,
        `sb=[${mine.map((c) => `${c.name}:${c.value.length}b`).join(' ') || 'none'}]`);
      const s = await fjCookieAt(origin);
      bits.push(s
        ? `exp=${Math.round((s.expires_at * 1000 - Date.now()) / 1000)}s refresh=${!!s.refresh_token}`
        : mine.length ? 'PARSE FAILED' : 'no session cookie');
    } catch (e) { bits.push(`ERROR ${e.message}`); }
    out.push(bits.join(' '));
  }
  // Also the active tab, in case the dashboard you are signed into is not one of
  // the origins above — a preview deployment, a custom domain, another port.
  // activeTab grants this popup cookie access to that origin without listing it.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const origin = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).origin : null;
    if (origin && !DASH_ORIGINS.includes(origin)) {
      const all = await chrome.cookies.getAll({ url: origin });
      const mine = all.filter((c) => c.name.startsWith('sb-'));
      out.push(`tab ${new URL(origin).host} cookies=${all.length} ` +
        `sb=[${mine.map((c) => `${c.name}:${c.value.length}b`).join(' ') || 'none'}]`);
    }
  } catch (e) { out.push(`tab ERROR ${e.message}`); }
  return `want ${COOKIE}\n${out.join('\n')}`;
}

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
