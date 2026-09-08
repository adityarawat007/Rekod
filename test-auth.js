// node test-auth.js  — the session gate, run without a browser.
// extension/auth.js is not a module (it is a classic script shared by worker.js
// and popup.html), so it is evaluated here with `chrome` and `fetch` shadowed
// by stubs. Lives at the root, like test-redact.js: Chrome ships everything
// under extension/.
const assert = require('node:assert');
const { readFileSync } = require('node:fs');

const src = readFileSync(`${__dirname}/extension/auth.js`, 'utf8');
const load = (chrome, fetch) => new Function('chrome', 'fetch', `${src}\nreturn { fjSession, DASH_ORIGINS };`)(chrome, fetch);

const NAME = 'sb-odrrzeqctgkrsyposkun-auth-token';
const at = (mins, extra = {}) => ({
  name: NAME,
  // what @supabase/ssr writes: URL-encoded, base64url, `base64-` prefixed
  value: encodeURIComponent(
    'base64-' + Buffer.from(JSON.stringify({
      access_token: `tok${mins}`, refresh_token: 'r1',
      expires_at: Math.floor(Date.now() / 1000) + mins * 60,
      user: { email: 'a@b.c' }, ...extra,
    })).toString('base64url'),
  ),
});

// jar: { origin: cookie[] }. A stub fetch may mutate it, like a Set-Cookie would.
const stub = (jar) => ({ cookies: { getAll: async ({ url }) => jar[url] ?? [] } });

(async () => {
  const [PROD, DEV] = load(stub({}), null).DASH_ORIGINS;

  // a live token is used as-is, and no request is made
  let jar = { [PROD]: [at(30)] };
  let hits = [];
  let s = await load(stub(jar), async (u) => hits.push(u)).fjSession();
  assert.equal(s.access_token, 'tok30');
  assert.deepEqual(hits, []);

  // prod holds nothing, the dev server holds the session
  jar = { [DEV]: [at(30)] };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // stale but refreshable: poke a GATED path, then re-read the refreshed cookie
  jar = { [PROD]: [at(-5)] };
  hits = [];
  s = await load(stub(jar), async (u) => { hits.push(u); jar[PROD] = [at(60)]; }).fjSession();
  assert.equal(s.access_token, 'tok60');
  assert.deepEqual(hits, [`${PROD}/`]);   // never /login — proxy.ts drops cookies there

  // the poke changed nothing (signed out server-side) — gate, do not loop
  jar = { [PROD]: [at(-5)] };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s, null);

  // no refresh token: nothing to ask for, so nothing is asked
  jar = { [PROD]: [at(-5, { refresh_token: undefined })] };
  hits = [];
  s = await load(stub(jar), async (u) => hits.push(u)).fjSession();
  assert.equal(s, null);
  assert.deepEqual(hits, []);

  // no cookie at all, and half-written chunks
  assert.equal(await load(stub({}), async () => {}).fjSession(), null);
  jar = { [PROD]: [{ name: `${NAME}.0`, value: 'base64-bm90IGpzb24' }] };
  assert.equal(await load(stub(jar), async () => {}).fjSession(), null);

  console.log('session gate ok');
})();
