// node --experimental-strip-types test-logic.ts
// Guards the pure logic the pages lean on: timeline merge, pre-roll signs, and
// the zero-filled day buckets. Not a render test — `next build` type-checks that.
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { offset, stamp, clock, ms, urlParts, httpUrl, trackPct, reindent, toCurl, uaSummary } from './src/lib/format.ts';
import { timeline, isConsole, isError, netFailed } from './src/lib/types.ts';
import type { Entry, NetEntry } from './src/lib/types.ts';
import { olderThan } from './src/lib/version.ts';
import { reportMarkdown } from './src/lib/report-markdown.ts';

const T0 = 1700000000000;

// ── timeline: logs and network are separate columns, merged by time ─────────
const logs = [
  { kind: 'console', lvl: 'log', msg: 'boot', t: T0 - 4000, seq: 1 },
  { kind: 'console', lvl: 'error', msg: 'boom', t: T0 + 2000, seq: 4 },
] as Entry[];
const network = [
  { kind: 'net', method: 'POST', url: 'https://api.example/v2/render', status: 500, rtype: 'fetch', t: T0 + 1000, seq: 3 },
  { kind: 'net', method: 'GET', url: 'https://api.example/ok', status: 200, rtype: 'fetch', t: T0 - 1000, seq: 2 },
] as NetEntry[];

const merged = timeline({ logs, network });
assert.deepStrictEqual(merged.map((e) => e.seq), [1, 2, 3, 4], 'merged in time order');
assert.strictEqual(merged.filter(isError).length, 2, 'a 500 and an error log both count as errors');
assert.ok(netFailed({ status: 500 } as NetEntry));
assert.ok(!netFailed({ status: 304 } as NetEntry), '304 is not a failure');
// status 0 is ambiguous and the flag is what disambiguates it
assert.ok(netFailed({ status: 0 } as NetEntry), 'active status 0 = the fetch threw');
assert.ok(
  !netFailed({ status: 0, passive: true } as NetEntry),
  'passive status 0 = cross-origin status not exposed, NOT a failure',
);
assert.ok(
  netFailed({ status: 404, passive: true } as NetEntry),
  'a passive row with a real status is still judged on that status',
);

// ── the timeline track: a percentage that cannot leave its container ───────
assert.strictEqual(Math.round(trackPct(0, -4, 10)), 29, 'pre-roll shifts the origin right');
assert.strictEqual(trackPct(-4, -4, 10), 0);
assert.strictEqual(trackPct(10, -4, 10), 100);
// the reported bug: the video outlives the last log entry, so `now` overshoots
assert.strictEqual(trackPct(9, 0, 5), 100, 'clamped, not 180%');
assert.strictEqual(trackPct(-9, 0, 5), 0, 'and not negative');
assert.strictEqual(trackPct(1, 5, 5), 0, 'an empty span is 0, never NaN');
assert.ok(!Number.isNaN(trackPct(1, 5, 1)), 'an inverted span is not NaN either');

// ── truncated bodies: still readable, still byte-faithful ────────────────
// the reported bug: capture.js cuts at 4 KB, so JSON.parse fails and the viewer
// printed one unbroken line.
assert.strictEqual(reindent('{"a":1,"b":[2,3]}'), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
assert.strictEqual(reindent('{"a":{"b":1'), '{\n  "a": {\n    "b": 1', 'a cut payload indents as far as it got');
// braces and commas inside a string must not move the indent, escapes included
assert.strictEqual(reindent('{"a":"x,y{z"}'), '{\n  "a": "x,y{z"\n}');
assert.strictEqual(reindent('{"a":"he said \\"hi\\", ok"}'), '{\n  "a": "he said \\"hi\\", ok"\n}');
// nothing outside whitespace is invented or lost
const raw = '{"u":"https://x.test/a?b=1","n":-2.5e3,"t":true}';
assert.strictEqual(reindent(raw).replace(/\s+/g, ''), raw.replace(/\s+/g, ''));

// ── pre-roll: the sign is information, not decoration ──────────────────────
assert.strictEqual(offset(T0 - 4000, T0), -4);
assert.strictEqual(stamp(-4), '−0:04', 'pre-roll rows read as negative');
assert.strictEqual(stamp(75), '1:15');
assert.strictEqual(clock(-75), '1:15', 'clock is unsigned; stamp adds the sign');

// ── formatting ─────────────────────────────────────────────────────────────
assert.strictEqual(ms(8200), '8.2s');
assert.strictEqual(ms(240), '240ms');
assert.strictEqual(ms(undefined), '');
assert.deepStrictEqual(urlParts('https://api.example/v2/render?token=x'), { name: 'render?token=x', host: 'api.example' });
assert.deepStrictEqual(urlParts('https://api.example/'), { name: '/', host: 'api.example' }, 'no path is /');
assert.deepStrictEqual(urlParts('not a url'), { name: 'not a url', host: '' }, 'unparseable passes through');

// ── timeline: uid is unique even when seq repeats across a navigation ──────
// capture.js restarts seq at 1 on every page load while the offscreen buffer
// spans navigations, so a real report contains duplicate seq values. uid is
// what the viewer keys and selects on; a collision there duplicated React keys
// and expanded two network rows at once.
const crossNav = timeline({
  logs: [
    { kind: 'console', lvl: 'error', msg: 'before nav', t: T0, seq: 1 },
    { kind: 'console', lvl: 'error', msg: 'after nav', t: T0 + 5000, seq: 1 },
  ] as Entry[],
  network: [
    { kind: 'net', url: 'https://a.test', status: 200, rtype: 'fetch', t: T0 + 1, seq: 1 },
  ] as NetEntry[],
});
assert.strictEqual(crossNav.length, 3);
assert.strictEqual(new Set(crossNav.map((e) => e.seq)).size, 1, 'seq really does collide');
assert.deepStrictEqual(crossNav.map((e) => e.uid), [0, 1, 2], 'uid is unique and in timeline order');
assert.ok(isConsole(crossNav[0]) && crossNav[0].msg === 'before nav',
  'ordering is still by time, not by uid');

// ── httpUrl: an href never takes a captured URL unfiltered ────────────────
// page_url is whatever the reported page was, and redact.js does not restrict
// the scheme. The share page hands this href to people who are not the owner,
// so `javascript:` would let a report's author run script in their session.
assert.strictEqual(httpUrl('https://app.example/x?y=1'), 'https://app.example/x?y=1');
assert.strictEqual(httpUrl('http://localhost:3000/'), 'http://localhost:3000/');
assert.strictEqual(httpUrl('javascript:alert(1)'), null, 'javascript: is not linkable');
assert.strictEqual(httpUrl(' javascript:alert(1)'), null, 'leading space is trimmed by URL, still caught');
assert.strictEqual(httpUrl('JavaScript:alert(1)'), null, 'scheme match is case-insensitive');
assert.strictEqual(httpUrl('data:text/html,<script>x</script>'), null, 'data: is not linkable');
assert.strictEqual(httpUrl('blob:https://a/b'), null, 'blob: is not linkable');
assert.strictEqual(httpUrl('not a url'), null);
assert.strictEqual(httpUrl(null), null);
assert.strictEqual(httpUrl(''), null);

// ── login redirect: ?next must stay on this origin ────────────────────────
// The login page is public, so `?next=` is attacker-controlled: sign in on the
// real site, get bounced to a fake one. Mirrors the guard in sign-in.tsx.
const safeNext = (raw: string) =>
  raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
assert.strictEqual(safeNext('/reports/abc'), '/reports/abc');
assert.strictEqual(safeNext('https://evil.example'), '/', 'absolute URL is refused');
assert.strictEqual(safeNext('//evil.example'), '/', 'protocol-relative is refused');
assert.strictEqual(safeNext('/\\evil.example'), '/', 'backslash form is refused');

// ── Copy cURL: captured strings are data, never shell syntax ──────────────
assert.strictEqual(
  toCurl({ url: 'https://api.example/ok' }),
  "curl 'https://api.example/ok'",
  'a plain GET needs no -X',
);
assert.strictEqual(
  toCurl({
    url: 'https://api.example/v2/render?q=a b',
    method: 'POST',
    reqHeaders: { 'content-type': 'application/json' },
    reqBody: '{"a":1}',
  }),
  "curl 'https://api.example/v2/render?q=a b' \\\n  -X POST \\\n  -H 'content-type: application/json' \\\n  --data-raw '{\"a\":1}'",
);
// the reason the quoting exists: a captured value must not become a command
const hostile = toCurl({ url: "https://x.test/a'$(id)'b", reqBody: "it's; rm -rf /" });
assert.strictEqual(
  hostile,
  "curl 'https://x.test/a'\\''$(id)'\\''b' \\\n  --data-raw 'it'\\''s; rm -rf /'",
  "every ' closes and reopens the quote, so nothing escapes it",
);

// ── UA summary: the specific token wins, or it says nothing ──────────────
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
assert.deepStrictEqual(uaSummary(CHROME_MAC), { browser: 'Chrome 141', os: 'macOS', apple: true });
// Chrome's UA also contains "Safari/537.36"; Edge's contains both.
assert.strictEqual(uaSummary(CHROME_MAC + ' Edg/141.0.0.0')?.browser, 'Edge 141');
assert.strictEqual(
  uaSummary('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.2 Safari/605.1.15')?.browser,
  'Safari 18',
  'Safari version comes from Version/, not Safari/',
);
assert.strictEqual(uaSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0')?.os, 'Windows');
assert.deepStrictEqual(uaSummary(''), null, 'no UA is no claim');
assert.deepStrictEqual(uaSummary('something entirely unknown'), { browser: null, os: null, apple: false });

// ── Copy as Markdown ────────────────────────────────────────────────────────
{
  const many = Array.from({ length: 7 }, (_, i) => ({ kind: 'console', lvl: 'error', msg: `bad ${i}\nstack line`, t: T0 + i * 1000, seq: 10 + i }));
  const entries = [
    { kind: 'console', lvl: 'error', msg: 'early `x`', t: T0 - 12000, seq: 1 },
    ...many,
    { kind: 'console', lvl: 'warn', msg: 'only a warning', t: T0, seq: 30 },
    ...network,
    { kind: 'net', method: 'GET', url: 'wss://x/s', status: 0, rtype: 'ws', ev: 'frame', t: T0, seq: 31 },
  ] as Entry[];
  const base = {
    title: 'Cart breaks', project: 'shop.example', link: 'https://r.test/c/tok', pageUrl: 'https://shop.example/cart',
    createdAt: '2026-10-08T14:03:59.000Z', description: 'Click pay.', t0: T0,
    env: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', viewport: '1440x900', dpr: 2, build: 'abc123' },
    entries,
  };
  const md = reportMarkdown(base);
  assert.ok(md.startsWith('## Cart breaks\n'));
  for (const s of ['https://r.test/c/tok', 'Page: https://shop.example/cart', '2026-10-08 14:03 UTC', 'Chrome 130', 'Window: 1440x900 @2x', 'Build: abc123', 'Click pay.']) assert.ok(md.includes(s), s);
  assert.ok(md.includes("`−0:12` early 'x'"), 'pre-roll sign kept, backticks defused');
  assert.equal(md.split('\n').filter((l) => /^- `[−\d]/.test(l)).length, 5, 'top five errors');
  assert.ok(md.includes('…and 3 more'));
  assert.ok(!md.includes('stack line') && !md.includes('only a warning'), 'first line only, warnings left out');
  assert.ok(md.includes('`POST https://api.example/v2/render` → 500'));
  assert.ok(!md.includes('/ok') && !md.includes('wss://'), 'a 200 and a socket frame are not failures');
  const bare = reportMarkdown({ ...base, title: '', description: null, env: {}, entries: [], pageUrl: null });
  assert.equal(bare, '## shop.example\n\n- Rekod: https://r.test/c/tok\n- When: 2026-10-08 14:03 UTC\n', 'empty sections and rows are omitted');
}

// ── the extension version gate ──────────────────────────────────────────────
assert.equal(olderThan('0.2.0', '0.3.0'), true);
assert.equal(olderThan('0.10.0', '0.9.9'), false, 'numeric, not string, order');
assert.equal(olderThan('0.3', '0.3.0'), false, 'a missing part is 0');
assert.equal(olderThan('0.3.0', '0.3.0'), false, 'the minimum itself passes');
assert.equal(olderThan(null, '0.1.0'), true, 'no header is too old');
assert.equal(olderThan('1.0-beta', '0.1.0'), true, 'garbage is too old');

// ── the downloadable zip matches the extension it was built from ────────────
// `pnpm ext:zip` writes both; a manifest bump without a re-run fails here.
{
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const release = JSON.parse(readFileSync(new URL('./src/lib/extension-release.json', import.meta.url), 'utf8'));
  assert.equal(release.version, manifest.version, 'public/rekod-extension.zip is stale: run `pnpm ext:zip`');
  assert.ok(existsSync(new URL('./public/rekod-extension.zip', import.meta.url)), 'public/rekod-extension.zip is missing: run `pnpm ext:zip`');
  // Byte-for-byte: any edit under apps/extension/ without a re-run fails here.
  const check = spawnSync(process.execPath, [fileURLToPath(new URL('./scripts/ext-zip.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr.trim() || 'public/rekod-extension.zip is stale: run `pnpm ext:zip`');
}

console.log('viewer logic ok');
