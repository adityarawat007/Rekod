// The tenant boundary. With no RLS, src/lib/server/reports.ts's `ws` argument
// is the only thing between a query and another workspace's rows — so every
// exported function is called here as workspace B against A's report.
//
// Real Postgres semantics without Docker: PGlite (Postgres in WASM) behind a
// socket, driven by the same postgres-js client the app uses, migrated by the
// same SQL. S3 is a 20-line in-process fake. Run with --conditions=react-server
// so `import 'server-only'` resolves to its empty build.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// ── fake S3: PUT stores, GET/HEAD read, DELETE removes. Signatures unchecked.
const objects = new Map<string, Buffer>();
const s3 = createServer(async (req, res) => {
  const key = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
  if (req.method === 'PUT') {
    const parts: Buffer[] = [];
    for await (const p of req) parts.push(p as Buffer);
    objects.set(key, Buffer.concat(parts));
    return res.end();
  }
  const body = objects.get(key);
  if (req.method === 'DELETE') { objects.delete(key); res.statusCode = 204; return res.end(); }
  if (!body) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
});
await new Promise<void>((r) => s3.listen(0, '127.0.0.1', r));
const s3Port = (s3.address() as AddressInfo).port;

const pg = await PGlite.create();
const pgServer = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 10 } as never);
await pgServer.start();
const pgPort = Number((pgServer as unknown as { port: number }).port) ||
  (pgServer as unknown as { server: { address(): AddressInfo } }).server.address().port;

Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`,
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3100',
  S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
  S3_BUCKET: 'rekod', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
});

const admin = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
await migrate(drizzle(admin), { migrationsFolder: './src/lib/db/migrations' });

const { uuidv7 } = await import('./src/lib/db/ids.ts');
const repo = await import('./src/lib/server/reports.ts');
const { LIMITS } = await import('./src/lib/plans.ts');
const ws = await import('./src/lib/server/workspaces.ts');

// ── ids
const a1 = uuidv7(1_000), a2 = uuidv7(2_000);
assert.match(a1, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.ok(a1 < a2, 'uuidv7 sorts by time');

// ── two tenants
const now = new Date().toISOString();
for (const who of ['a', 'b']) {
  await admin`insert into rekod."user" (id, name, email, updated_at) values (${'u' + who}, ${who}, ${who + '@x.test'}, ${now})`;
  await admin`insert into rekod.organization (id, name, slug, created_at) values (${'w' + who}, ${who}, ${who}, ${now})`;
  await admin`insert into rekod.member (id, organization_id, user_id, role, created_at) values (${'m' + who}, ${'w' + who}, ${'u' + who}, 'owner', ${now})`;
}

// ── workspaces: each user lists their own, and free creates none
assert.deepEqual((await ws.workspacesOf('ub')).map((w) => w.id), ['wb'], "B lists A's workspace");
assert.deepEqual(await ws.workspacesLeft('ua'), { plan: 'free', left: 0 });
assert.equal(((await ws.createWorkspace('ua', 'team')) as { refused?: string }).refused, 'plan', 'free creates a second workspace');
await admin`update rekod."user" set plan = 'pro' where id = 'ub'`;
assert.equal((await ws.workspacesLeft('ub')).left, 9, 'pro owns one, may create nine more');
// The real create: a system action, which allowUserToCreateOrganization: false
// does not stop. B owns it, and A cannot see it.
const team = await ws.createWorkspace('ub', 'B team');
assert.ok('id' in team, 'pro creates a workspace');
assert.deepEqual((await ws.workspacesOf('ub')).map((w) => w.name), ['b', 'B team']);
assert.equal((await ws.workspacesLeft('ub')).left, 8);
assert.ok(!(await ws.workspacesOf('ua')).some((w) => w.id === team.id), "A lists B's new workspace");
await admin`update rekod."user" set plan = 'free' where id = 'ub'`;

// ── A files a report through the same path the extension uses
// The extension creates with only what it knows at stop; the title comes with /complete.
const sizes = { media: 4, logs: 60, network: 2 };
const input = repo.CreateInput.parse({ t0: Date.now(), media: 'video/webm', project: 'app.test', sizes });
/** A create that must succeed. */
const made = async (ws: string, u: string, i = input) => {
  const r = await repo.createReport(ws, u, i);
  if ('refused' in r) throw new Error(`refused: ${r.message}`);
  return r;
};
const { id, uploads } = await made('wa', 'ua');
assert.deepEqual(Object.keys(uploads).sort(), ['logs', 'media', 'network']);
assert.match(uploads.media!, /X-Amz-Signature=/);
assert.match(uploads.media!, /X-Amz-SignedHeaders=content-length%3Bhost/, 'the size is signed into the URL');

assert.equal((await repo.listReports('wa')).rows.length, 0, 'processing reports are not listed');

await fetch(uploads.media!, { method: 'PUT', body: 'webm' });
await fetch(uploads.logs!, { method: 'PUT', body: JSON.stringify([{ kind: 'console', lvl: 'error', msg: 'x', t: 1, seq: 1 }]) });
await fetch(uploads.network!, { method: 'PUT', body: '[]' });

// ── B cannot touch any of it
assert.equal(await repo.completeReport('wb', id), false, 'B completes A');
assert.equal((await repo.listReports('wa')).rows.length, 0, "B's complete did not flip A's report");
assert.equal(await repo.completeReport('wb', id, { title: 'pwned' }), false, 'B names A');
assert.equal(await repo.completeReport('wa', id, { title: '100% broken_login', env: { host: 'app.test' } }), true);
assert.equal(await repo.getReport('wb', id), null, 'B reads A');
assert.equal((await repo.listReports('wb')).rows.length, 0, 'B lists A');
assert.equal((await repo.listReports('wb', { types: ['video'] })).rows.length, 0, 'B lists A by type');
assert.equal((await repo.listReports('wa', { types: ['video'] })).rows.length, 1, 'the type filter keeps a video');
assert.equal((await repo.listReports('wa', { types: ['screenshot'] })).rows.length, 0, 'and drops it for screenshots');
assert.equal(await repo.updateReport('wb', id, { title: 'pwned' }), false, 'B edits A');
assert.equal(await repo.addComment('wb', 'ub', id, 'hi'), null, 'B comments on A');
assert.equal(await repo.shareTokenFor('wb', id), null, 'B shares A');
assert.equal(await repo.revokeShare('wb', id), false, 'B revokes A');
assert.equal(await repo.deleteReports('wb', [id]), 0, 'B deletes A');
assert.equal(objects.size, 3, "B's delete left A's files alone");

// ── A can, and the data survived B's attempts
const mine = await repo.getReport('wa', id);
assert.equal(mine?.title, '100% broken_login');
assert.equal(mine?.creator?.email, 'a@x.test', 'the byline names the creator');
assert.equal(mine?.logs.length, 1);
assert.match(mine!.media!.url, /video\.webm/);
assert.equal((await repo.listReports('wa')).rows.length, 1);

// ── search treats % and _ literally
assert.equal((await repo.listReports('wa', { q: '100%' })).rows.length, 1);
assert.equal((await repo.listReports('wa', { q: '1%0' })).rows.length, 0, '% is not a wildcard');
assert.equal((await repo.listReports('wa', { q: 'k_n' })).rows.length, 0, '_ is not a wildcard');

// ── comments: only in-workspace, only your own to delete
const c = await repo.addComment('wa', 'ua', id, 'first');
assert.equal(c?.by, 'a@x.test');
assert.equal(await repo.deleteComment('wb', 'ub', c!.id), false, 'B deletes A comment');
assert.equal((await repo.getReport('wa', id))!.comments.length, 1);
assert.equal(await repo.deleteComment('wa', 'ua', c!.id), true);
assert.equal((await repo.getReport('wa', id))!.comments.length, 0);

// ── share: same link every copy, dead after revoke, fresh after that
const t1 = await repo.shareTokenFor('wa', id);
assert.match(t1!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a share token is a v4 UUID');
assert.equal(await repo.sharedReport(id), null, "the report's own id is not a share link");
assert.equal(await repo.shareTokenFor('wa', id), t1, 'copying twice gives the same link');
const shared = await repo.sharedReport(t1!);
assert.equal(shared?.id, id);
assert.ok(!('workspaceId' in shared!) && !('shareToken' in shared!), 'share view leaks no tenancy fields');
assert.equal((await repo.sharedReport(t1!, false))!.logs.length, 0, '/v/ skips the logs');
assert.equal(await repo.sharedReport('0'.repeat(64)), null);
assert.equal(await repo.sharedReport('not-a-token'), null);
await repo.revokeShare('wa', id);
assert.equal(await repo.sharedReport(t1!), null, 'revoked link is dead');
const t2 = await repo.shareTokenFor('wa', id);
assert.ok(t2 && t2 !== t1, 'next copy mints a new link');

// ── malformed ids are not-found, not a Postgres error
assert.equal(await repo.getReport('wa', 'nope'), null);

// ── delete: files, then row
assert.equal(await repo.deleteReports('wa', [id]), 1);
assert.equal(objects.size, 0);
assert.equal(await repo.getReport('wa', id), null);

// ── plans: the video limit is per user, from the user row
const refusal = async (ws: string, u: string, i: typeof input) => {
  const r = await repo.createReport(ws, u, i);
  return 'refused' in r ? r.refused : null;
};
assert.equal(await repo.setPlan('A@X.test', 'free', 3), true, 'setPlan matches the email case-insensitively');
assert.equal(await repo.setPlan('nobody@x.test', 'pro'), false);
assert.deepEqual((({ plan, limit, videos }) => ({ plan, limit, videos }))((await repo.usageOf('ua'))!),
  { plan: 'free', limit: 3, videos: 0 });
assert.equal((await repo.usageOf('ub'))!.limit, 20, 'a new user gets the free plan');

const racer = await made('wa', 'ua');            // created under the limit, completed over it
for (let i = 0; i < 3; i++) assert.equal(await repo.completeReport('wa', (await made('wa', 'ua')).id), true);
assert.equal((await repo.usageOf('ua'))!.videos, 3);
assert.equal(await refusal('wa', 'ua', input), 'videos', 'create refuses a video over the limit');
assert.equal(await repo.completeReport('wa', racer.id), false, 'complete refuses one that raced past create');
const png = repo.CreateInput.parse({ t0: Date.now(), media: 'image/png', sizes });
assert.equal(await refusal('wa', 'ua', png), null, 'screenshots are not counted');
assert.equal(await refusal('wb', 'ub', input), null, "A's limit is not B's");
const last = (await repo.listReports('wa')).rows[0].id;
assert.equal(await repo.completeReport('wa', last), true, 'a retried complete still succeeds');
await repo.deleteReports('wa', [last]);
assert.equal(await refusal('wa', 'ua', input), null, 'deleting one frees a slot');
await repo.setPlan('a@x.test', 'pro');
assert.equal((await repo.usageOf('ua'))!.limit, 200, 'a plan brings its own limit');
assert.equal(await repo.completeReport('wa', racer.id), true, 'and the raced one can land now');

// ── sizes: over the limit, or media with no size, is refused before a row exists
const big = repo.CreateInput.parse({ t0: Date.now(), media: 'video/webm', sizes: { ...sizes, media: LIMITS.bytes.video + 1 } });
assert.equal(await refusal('wb', 'ub', big), 'size');
assert.equal(await refusal('wb', 'ub', repo.CreateInput.parse({ t0: Date.now(), media: 'video/webm', sizes: { logs: 1, network: 1 } })), 'size');
assert.equal(await refusal('wb', 'ub', repo.CreateInput.parse({ t0: Date.now(), media: 'video/webm', sizes: { ...sizes, logs: LIMITS.bytes.logs + 1 } })), 'size');

// ── pages: newest first, no overlap, no gap, and the cursor stays in its workspace
const pngSizes = { ...sizes };
const before = (await repo.listReports('wb')).rows.length;
for (let i = 0; i < repo.PAGE_SIZE + 2 - before; i++) {
  await repo.completeReport('wb', (await made('wb', 'ub', repo.CreateInput.parse({ t0: Date.now(), media: 'image/png', sizes: pngSizes }))).id);
}
const p1 = await repo.listReports('wb');
assert.equal(p1.rows.length, repo.PAGE_SIZE);
assert.ok(p1.next, 'a full page has a next cursor');
const p2 = await repo.listReports('wb', { after: p1.next! });
assert.equal(p2.rows.length, 2);
assert.equal(p2.next, null, 'the last page has none');
const all = [...p1.rows, ...p2.rows].map((r) => r.id);
assert.equal(new Set(all).size, all.length, 'pages do not overlap');
assert.deepEqual(all, [...all].sort().reverse(), 'newest first');
assert.equal((await repo.listReports('wa', { after: p1.next! })).rows.some((r) => all.includes(r.id)), false, "B's cursor in A's workspace lists none of B");

// ── rate: creates per hour, finished or not
let n = (await repo.usageOf('ub'))!.lastHour;
while (n < LIMITS.createsPerHour) { await made('wb', 'ub', png); n++; }
assert.equal(await refusal('wb', 'ub', png), 'rate');
assert.equal(await refusal('wa', 'ua', png), null, "B's rate is not A's");

// ── cleanup: abandoned processing rows go, with their files; ready ones stay
const readyBefore = (await repo.listReports('wa')).rows.length;
assert.equal(await repo.purgeAbandoned(), 0, 'nothing is abandoned yet');
await admin`update rekod.reports set created_at = now() - interval '2 days' where status = 'processing'`;
assert.ok(await repo.purgeAbandoned() > 0);
assert.equal((await admin`select count(*)::int as n from rekod.reports where status = 'processing'`)[0].n, 0);
assert.equal((await repo.listReports('wa')).rows.length, readyBefore, 'ready reports survive the cleanup');

console.log('tenancy ok');
await admin.end();
process.exit(0);
