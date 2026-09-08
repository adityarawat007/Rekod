// node test-auth.js  — the session gate, run without a browser.
// extension/auth.js is not a module (it is a classic script shared by worker.js
// and popup.html), so it is evaluated here with `chrome` and `fetch` shadowed
// by stubs. Lives at the root, like test-redact.js: Chrome ships everything
// under extension/.
const assert = require('node:assert');
const { readFileSync } = require('node:fs');

const src = readFileSync(`${__dirname}/extension/auth.js`, 'utf8');
// `fetch` is passed in only to fail loudly. The extension must make no request
// of its own: proxy.ts answers a refresh-token error by deleting every sb-*
// cookie, and an extension fetch applies that Set-Cookie, so a "harmless" GET
// of the dashboard can sign the user out. Read the cookie, nothing else.
const load = (chrome) => new Function('chrome', 'fetch',
  `${src}\nreturn { fjSession, DASH_ORIGINS };`,
)(chrome, () => { throw new Error('auth.js must not make network requests'); });

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
  const [PROD, DEV] = load(stub({})).DASH_ORIGINS;

  // a live token is used as-is
  let jar = { [PROD]: [at(30)] };
  let s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // prod holds nothing, the dev server holds the session
  jar = { [DEV]: [at(30)] };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // prod is stale, the dev server is live — expiry decides, not order
  jar = { [PROD]: [at(-5)], [DEV]: [at(30)] };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // expired, and 30s out: the 60s of slack means neither is handed to an upload
  for (const mins of [-5, 0.5]) {
    jar = { [PROD]: [at(mins)] };
    assert.equal(await load(stub(jar)).fjSession(), null, `${mins}m should not count as live`);
  }

  // a chunked session is reassembled, and the jar order does not matter
  jar = { [PROD]: chunked(30, 3).reverse() };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // 12 chunks: `.10` must not sort before `.2`
  jar = { [PROD]: chunked(30, 12) };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // combineChunks: an unchunked cookie WINS, it is never joined onto leftover
  // chunks. Joining them is garbage in, expired card out.
  jar = { [PROD]: [at(30), ...chunked(-99, 2)] };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // a gap ends the chunks, so `.2` after a missing `.1` is ignored, not appended
  jar = { [PROD]: [...chunked(30, 2), { name: `${NAME}.4`, value: 'junk' }] };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // neighbouring auth-js keys are not chunks of the session
  jar = { [PROD]: [at(30), { name: `${NAME}-user`, value: 'x' }, { name: `${NAME}-code-verifier`, value: 'y' }] };
  s = await load(stub(jar)).fjSession();
  assert.equal(s.access_token, 'tok30');

  // no cookie at all, and half-written chunks
  assert.equal(await load(stub({})).fjSession(), null);
  jar = { [PROD]: [{ name: `${NAME}.0`, value: 'base64-bm90IGpzb24' }] };
  assert.equal(await load(stub(jar)).fjSession(), null);

  console.log('session gate ok');
})();
