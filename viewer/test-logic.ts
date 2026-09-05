// node --experimental-strip-types test-logic.ts
// Guards the pure logic the pages lean on: timeline merge, pre-roll signs, and
// the zero-filled day buckets. Not a render test — `next build` type-checks that.
import assert from 'node:assert';
import { offset, stamp, clock, ms, shortUrl } from './src/lib/format.ts';
import { timeline, isConsole, isError, netFailed, isScreenshot } from './src/lib/types.ts';
import type { Entry, NetEntry } from './src/lib/types.ts';

const T0 = 1700000000000;

// ── timeline: logs and network are separate columns, merged by time ─────────
const logs = [
  { kind: 'console', lvl: 'log', msg: 'boot', t: T0 - 4000, seq: 1 },
  { kind: 'console', lvl: 'error', msg: 'boom', t: T0 + 2000, seq: 4 },
] as Entry[];
const network = [
  { kind: 'net', method: 'POST', url: 'https://api.flam/v2/render', status: 500, rtype: 'fetch', t: T0 + 1000, seq: 3 },
  { kind: 'net', method: 'GET', url: 'https://api.flam/ok', status: 200, rtype: 'fetch', t: T0 - 1000, seq: 2 },
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

// ── pre-roll: the sign is information, not decoration ──────────────────────
assert.strictEqual(offset(T0 - 4000, T0), -4);
assert.strictEqual(stamp(-4), '−0:04', 'pre-roll rows read as negative');
assert.strictEqual(stamp(75), '1:15');
assert.strictEqual(clock(-75), '1:15', 'clock is unsigned; stamp adds the sign');

// ── formatting ─────────────────────────────────────────────────────────────
assert.strictEqual(ms(8200), '8.2s');
assert.strictEqual(ms(240), '240ms');
assert.strictEqual(ms(undefined), '');
assert.strictEqual(shortUrl('https://api.flam/v2/render?token=x'), 'render');
assert.strictEqual(shortUrl('https://api.flam/'), 'api.flam', 'no path falls back to host');
assert.strictEqual(shortUrl('not a url'), 'not a url', 'unparseable passes through');
assert.ok(isScreenshot('2026/08/x.png'));
assert.ok(!isScreenshot('2026/08/x.webm'));
assert.ok(!isScreenshot(null));

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

console.log('viewer logic ok');
