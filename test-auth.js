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

// what @supabase/ssr writes: URL-encoded, base64url, `base64-` prefixed
const value = (mins, extra = {}) => encodeURIComponent(
  'base64-' + Buffer.from(JSON.stringify({
    access_token: `tok${mins}`, refresh_token: 'r1',
    expires_at: Math.floor(Date.now() / 1000) + mins * 60,
    user: { email: 'a@b.c' }, ...extra,
  })).toString('base64url'),
);
const at = (mins, extra = {}) => ({ name: NAME, value: value(mins, extra) });
/** The same cookie split across `.0`, `.1`, … the way createChunks does. */
const chunked = (mins, n) => {
  const v = value(mins), size = Math.ceil(v.length / n);
  return Array.from({ length: n }, (_, i) => ({
    name: `${NAME}.${i}`, value: v.slice(i * size, (i + 1) * size),
  }));
};

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

  // a chunked session is reassembled, and the jar order does not matter
  jar = { [PROD]: chunked(30, 3).reverse() };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // 12 chunks: `.10` must not sort before `.2`
  jar = { [PROD]: chunked(30, 12) };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // combineChunks: an unchunked cookie WINS, it is never joined onto leftover
  // chunks. Joining them is garbage in, expired card out.
  jar = { [PROD]: [at(30), ...chunked(-99, 2)] };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // a gap ends the chunks, so `.2` after a missing `.1` is ignored, not appended
  jar = { [PROD]: [...chunked(30, 2), { name: `${NAME}.4`, value: 'junk' }] };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // neighbouring auth-js keys are not chunks of the session
  jar = { [PROD]: [at(30), { name: `${NAME}-user`, value: 'x' }, { name: `${NAME}-code-verifier`, value: 'y' }] };
  s = await load(stub(jar), async () => {}).fjSession();
  assert.equal(s.access_token, 'tok30');

  // no cookie at all, and half-written chunks
  assert.equal(await load(stub({}), async () => {}).fjSession(), null);
  jar = { [PROD]: [{ name: `${NAME}.0`, value: 'base64-bm90IGpzb24' }] };
  assert.equal(await load(stub(jar), async () => {}).fjSession(), null);

  console.log('session gate ok');
})();
