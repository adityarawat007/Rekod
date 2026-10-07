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

// Which database to boot: `node … test-tenancy.ts [postgres|mongo]`. Everything
// below the fixture is shared — the same assertions run against both adapters.
const adapter = process.argv[2] ?? 'postgres';
if (adapter !== 'postgres' && adapter !== 'mongo') throw new Error(`unknown adapter "${adapter}": postgres or mongo`);

/** What differs per database: boot, raw seeding, and the few raw pokes a test
 *  needs that no repo function offers. */
type Fixture = {
  url: string;
  /** User `u<who>` owning workspace `w<who>`, written raw — no Better Auth, no plan. */
  seed(who: string): Promise<void>;
  /** A plan set behind the app's back. */
  rawPlan(userId: string, plan: string): Promise<void>;
  /** Every `processing` report becomes two days old. */
  ageProcessing(): Promise<void>;
  processingCount(): Promise<number>;
  /** Break the adapter's per-user video counter, if it has one. */
  corruptCounter?(userId: string, n: number): Promise<void>;
  close(): Promise<void>;
};

async function bootPostgres(): Promise<Fixture> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');
  const pg = await PGlite.create();
  const pgServer = new PGLiteSocketServer({ db: pg, port: 0, maxConnections: 10 } as never);
  await pgServer.start();
  const pgPort = Number((pgServer as unknown as { port: number }).port) ||
    (pgServer as unknown as { server: { address(): AddressInfo } }).server.address().port;
  const url = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
  const admin = postgres(url, { prepare: false, max: 1 });
  await migrate(drizzle(admin), { migrationsFolder: './src/lib/db/migrations' });
  return {
    url,
    async seed(who) {
      const now = new Date().toISOString();
      await admin`insert into rekod."user" (id, name, email, updated_at) values (${'u' + who}, ${who}, ${who + '@x.test'}, ${now})`;
      await admin`insert into rekod.organization (id, name, slug, created_at) values (${'w' + who}, ${who}, ${who}, ${now})`;
      await admin`insert into rekod.member (id, organization_id, user_id, role, created_at) values (${'m' + who}, ${'w' + who}, ${'u' + who}, 'owner', ${now})`;
    },
    async rawPlan(userId, plan) { await admin`update rekod."user" set plan = ${plan} where id = ${userId}`; },
    async ageProcessing() { await admin`update rekod.reports set created_at = now() - interval '2 days' where status = 'processing'`; },
    async processingCount() { return (await admin`select count(*)::int as n from rekod.reports where status = 'processing'`)[0].n; },
    async close() { await admin.end(); },
  };
}

async function bootMongo(): Promise<Fixture> {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { MongoClient } = await import('mongodb');
  const mongod = await MongoMemoryServer.create(); // standalone: no replica set needed
  const url = `${mongod.getUri()}rekod_test`;
  const client = await new MongoClient(url).connect();
  const db = client.db('rekod_test');
  return {
    url,
    async seed(who) {
      const now = new Date();
      await db.collection('user').insertOne({ _id: ('u' + who) as never, name: who, email: who + '@x.test', emailVerified: false, createdAt: now, updatedAt: now });
      await db.collection('organization').insertOne({ _id: ('w' + who) as never, name: who, slug: who, createdAt: now });
      await db.collection('member').insertOne({ _id: ('m' + who) as never, organizationId: 'w' + who, userId: 'u' + who, role: 'owner', createdAt: now });
    },
    async rawPlan(userId, plan) { await db.collection('user').updateOne({ _id: userId as never }, { $set: { plan } }); },
    async ageProcessing() { await db.collection('reports').updateMany({ status: 'processing' }, { $set: { createdAt: new Date(Date.now() - 2 * 86400e3) } }); },
    processingCount: () => db.collection('reports').countDocuments({ status: 'processing' }),
    async corruptCounter(userId, n) { await db.collection('user').updateOne({ _id: userId as never }, { $set: { readyVideos: n } }); },
    async close() { await client.close(); await mongod.stop(); },
  };
}

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

const fx = await (adapter === 'mongo' ? bootMongo : bootPostgres)();

Object.assign(process.env, {
  DATABASE_URL: fx.url,
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3100',
  S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
  S3_BUCKET: 'rekod', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's',
});

const { store } = await import('./src/lib/server/store/index.ts');
const { uuidv7 } = await import('./src/lib/db/ids.ts');
const repo = await import('./src/lib/server/reports.ts');
const { LIMITS } = await import('./src/lib/plans.ts');
const ws = await import('./src/lib/server/workspaces.ts');

// ── ids
const a1 = uuidv7(1_000), a2 = uuidv7(2_000);
assert.match(a1, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.ok(a1 < a2, 'uuidv7 sorts by time');

// ── two tenants (and a third for search, a fourth for the cap race)
for (const who of ['a', 'b', 'c', 'd']) await fx.seed(who);

// ── workspaces: each user lists their own, and free creates none
assert.deepEqual((await ws.workspacesOf('ub')).map((w) => w.id), ['wb'], "B lists A's workspace");
assert.deepEqual(await ws.workspacesLeft('ua'), { plan: 'free', left: 0 });
assert.equal(((await ws.createWorkspace('ua', 'team')) as { refused?: string }).refused, 'plan', 'free creates a second workspace');
await fx.rawPlan('ub', 'pro');
assert.equal((await ws.workspacesLeft('ub')).left, 9, 'pro owns one, may create nine more');
// The real create: a system action, which allowUserToCreateOrganization: false
// does not stop. B owns it, and A cannot see it.
const team = await ws.createWorkspace('ub', 'B team');
assert.ok('id' in team, 'pro creates a workspace');
assert.deepEqual((await ws.workspacesOf('ub')).map((w) => w.name), ['b', 'B team']);
assert.equal((await ws.workspacesLeft('ub')).left, 8);
assert.ok(!(await ws.workspacesOf('ua')).some((w) => w.id === team.id), "A lists B's new workspace");
await fx.rawPlan('ub', 'free');

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

// ── share surface: asserted by key list, so a new field is a decision
assert.deepEqual(Object.keys((await store().sharedReport(t2!))!).sort(),
  ['assets', 'createdAt', 'description', 'env', 'id', 'pageUrl', 'project', 't0', 'title', 'type', 'workspaceId'], 'store: the share row (workspaceId is dropped by reports.ts)');
const sharedNow = (await repo.sharedReport(t2!))!;
assert.deepEqual(Object.keys(sharedNow).sort(),
  ['comments', 'createdAt', 'description', 'env', 'id', 'logs', 'media', 'network', 'pageUrl', 'project', 't0', 'title', 'type'],
  'the page: no workspaceId, createdBy, shareToken or creator');
assert.ok(!JSON.stringify(sharedNow).includes('a@x.test'), 'no email on a share view with no comments');
assert.ok(!JSON.stringify(sharedNow).includes(t2!), 'the token is not echoed back');

// ── operator injection: a JSON body can put { $ne: null } where a string goes.
// Every function must answer not-found / empty / false — or refuse outright —
// and never touch another workspace's rows. B is the caller; A owns `id`.
const evil: unknown[] = [{ $ne: null }, { $gt: '' }, { $regex: '.*' }, { $in: ['wa'] }, [id], 7, true];
/** Throwing is a refusal; anything else must be empty. */
const nothing = async (what: string, f: () => Promise<unknown>) => {
  let r: unknown;
  try { r = await f(); } catch { return; }
  const empty = r == null || r === false || r === 0 || (Array.isArray(r) && !r.length) ||
    (typeof r === 'object' && Object.values(r as object).every((v) => v === 0 || (Array.isArray(v) && !v.length)));
  assert.ok(empty, `${what} answered ${JSON.stringify(r)}`);
};
// Raw shapes straight into the store: Mongo is where an object can become an
// operator. Postgres binds every value as a parameter, so there is nothing to
// interpret — and a query PGlite rejects on the wire can wedge its single
// engine (seen: a hang ~1 run in 10), so those are exercised through the repo,
// whose validators are the same on both.
const storeNothing = adapter === 'mongo' ? nothing : async () => {};
const limitBefore = (await repo.usageOf('ua'))!.limit;
const st = store();
for (const e of evil) {
  const x = e as never;
  const tag = JSON.stringify(e);
  // As the workspace: the one thing that must come from the session.
  await storeNothing(`getReport ws ${tag}`, () => st.getReport(x, id));
  await storeNothing(`listReports ws ${tag}`, () => st.listReports(x, { limit: 16 }));
  await storeNothing(`assetKeys ws ${tag}`, () => st.assetKeys(x, [id]));
  await storeNothing(`updateReport ws ${tag}`, () => st.updateReport(x, id, { title: 'pwned' }));
  await storeNothing(`completeReport ws ${tag}`, () => st.completeReport(x, id, { title: 'pwned' }));
  await storeNothing(`addComment ws ${tag}`, () => st.addComment(x, 'ub', id, 'hi'));
  await storeNothing(`getShareToken ws ${tag}`, () => st.getShareToken(x, id));
  await storeNothing(`setShareToken ws ${tag}`, () => st.setShareToken(x, id, null));
  await storeNothing(`deleteReports ws ${tag}`, () => st.deleteReports(x, [id]));
  // As the id / token / user.
  await storeNothing(`getReport id ${tag}`, () => st.getReport('wb', x));
  await storeNothing(`assetKeys ids ${tag}`, () => st.assetKeys('wb', [x]));
  await storeNothing(`deleteReports ids ${tag}`, () => st.deleteReports('wb', [x]));
  await storeNothing(`updateReport id ${tag}`, () => st.updateReport('wb', x, { title: 'pwned' }));
  await storeNothing(`completeReport id ${tag}`, () => st.completeReport('wb', x, {}));
  await storeNothing(`setShareToken id ${tag}`, () => st.setShareToken('wb', x, null));
  await storeNothing(`deleteComment id ${tag}`, () => st.deleteComment('wb', 'ub', x));
  await storeNothing(`sharedReport ${tag}`, () => st.sharedReport(x));
  await storeNothing(`commentsOf ws ${tag}`, () => st.commentsOf(x, id));
  await storeNothing(`commentsOf id ${tag}`, () => st.commentsOf('wa', x));
  await storeNothing(`usageOf ${tag}`, () => st.usageOf(x));
  await storeNothing(`setPlan ${tag}`, () => st.setPlan(x, 'pro', 9999));
  await storeNothing(`workspaceOf ${tag}`, () => st.workspaceOf(x, null));
  await storeNothing(`workspacesOf ${tag}`, () => st.workspacesOf(x));
  await storeNothing(`ownedWorkspaces ${tag}`, () => st.ownedWorkspaces(x));
  // Filters: B has no rows, A has one, so anything listed would be A's.
  await storeNothing(`listReports q ${tag}`, () => st.listReports('wb', { q: x, limit: 16 }));
  await storeNothing(`listReports after ${tag}`, () => st.listReports('wb', { after: x, limit: 16 }));
  await storeNothing(`listReports types ${tag}`, () => st.listReports('wb', { types: x, limit: 16 }));
  // The same through the public repo, whose validators coerce with RegExp.test().
  await nothing(`repo.getReport ${tag}`, () => repo.getReport('wb', x));
  await nothing(`repo.sharedReport ${tag}`, () => repo.sharedReport(x));
  await nothing(`repo.deleteReports ${tag}`, () => repo.deleteReports('wb', [x]));
  await nothing(`repo.shareTokenFor ${tag}`, () => repo.shareTokenFor('wb', x));
}
assert.equal(await repo.sharedReport([t2] as never), null, 'a token in an array is not a token');
assert.equal(await repo.getReport('wa', [id] as never), null, 'nor an id');
assert.equal((await repo.getReport('wa', id))?.title, '100% broken_login', 'A report untouched by the injections');
assert.equal((await repo.sharedReport(t2!))?.id, id, 'and still shared');
assert.equal((await repo.usageOf('ua'))!.limit, limitBefore, 'no setPlan landed on anyone');
assert.equal((await repo.usageOf('ub'))!.limit, 20);
assert.equal(objects.size, 3, 'no object was removed');

// ── workspace lookups, on both adapters
assert.equal(await store().workspaceOf('ub', team.id), team.id, 'the active workspace wins');
assert.equal(await store().workspaceOf('ub', 'wb'), 'wb', 'the personal one when it is active');
assert.equal(await store().workspaceOf('ub', null), 'wb', 'no active: the oldest membership');
assert.equal(await store().workspaceOf('ub', 'wa'), 'wb', "active but not a member: the oldest, never A's");
assert.equal(await store().workspaceOf('nobody', 'wa'), null, 'unknown user');
assert.deepEqual(await store().workspacesOf('nobody'), []);
assert.deepEqual(await ws.workspacesLeft('nobody'), { plan: 'free', left: 1 }, 'unknown user: free, nothing owned');

// ── malformed ids are not-found, not a Postgres error
assert.equal(await repo.getReport('wa', 'nope'), null);

// ── delete: files, then row
assert.equal(await repo.deleteReports('wa', [id]), 1);
assert.equal(objects.size, 0);
assert.equal(await repo.getReport('wa', id), null);

// ── posters: an optional fourth file, videos only
const withPoster = await made('wa', 'ua', repo.CreateInput.parse({ ...input, sizes: { ...sizes, poster: 5 } }));
assert.deepEqual(Object.keys(withPoster.uploads).sort(), ['logs', 'media', 'network', 'poster']);
assert.match(withPoster.uploads.poster!, /X-Amz-SignedHeaders=content-length%3Bhost/, 'the poster size is signed too');
for (const [k, body] of [['media', 'webm'], ['poster', 'webp!'], ['logs', '[]'], ['network', '[]']] as const) {
  await fetch(withPoster.uploads[k]!, { method: 'PUT', body });
}
assert.equal(await repo.completeReport('wa', withPoster.id), true);
const pl = (await repo.listReports('wa')).rows.find((r) => r.id === withPoster.id)!;
assert.match(pl.poster ?? '', /poster\.webp/, 'the list row carries a signed poster URL');
assert.match((await repo.getReport('wa', withPoster.id))!.media!.poster ?? '', /poster\.webp/, 'and so does the report page');
assert.equal((await repo.listReports('wb')).rows.length, 0, "B does not list A's poster");
assert.equal(await repo.deleteReports('wb', [withPoster.id]), 0);
assert.equal(objects.size, 4, "B's delete left the poster alone");
assert.equal(await repo.deleteReports('wa', [withPoster.id]), 1);
assert.equal(objects.size, 0, 'delete removes the poster object too');

const noPoster = await made('wa', 'ua');
assert.equal('poster' in noPoster.uploads, false, 'no poster size, no poster upload');
assert.equal(await repo.completeReport('wa', noPoster.id), true);
assert.equal((await repo.listReports('wa')).rows.find((r) => r.id === noPoster.id)!.poster, null, 'an old extension: poster is null');
await repo.deleteReports('wa', [noPoster.id]);

const shotWithPoster = await made('wa', 'ua', repo.CreateInput.parse({ t0: Date.now(), media: 'image/png', sizes: { ...sizes, poster: 5 } }));
assert.equal('poster' in shotWithPoster.uploads, false, 'a screenshot never gets a poster');
await repo.deleteReports('wa', [shotWithPoster.id]);
const bigPoster = repo.CreateInput.parse({ ...input, sizes: { ...sizes, poster: 2 ** 20 + 1 } });
const bigPosterRes = await repo.createReport('wa', 'ua', bigPoster);
assert.ok(!('refused' in bigPosterRes) && !('poster' in bigPosterRes.uploads), 'an oversize poster is dropped, the upload goes on');
objects.clear();

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
await fx.ageProcessing();
assert.ok(await repo.purgeAbandoned() > 0);
assert.equal(await fx.processingCount(), 0);
assert.equal((await repo.listReports('wa')).rows.length, readyBefore, 'ready reports survive the cleanup');

// ── search: metacharacters are literal, case is not, and nothing backtracks.
// Its own workspace, so the pages and rate tests above are not disturbed.
const find = async (q: string) => (await repo.listReports('wc', { q })).rows.map((r) => r.title);
const titled = async (title: string, type: 'screenshot' | 'video' = 'screenshot') => {
  const r = await made('wc', 'uc', repo.CreateInput.parse({ t0: Date.now(), media: type === 'video' ? 'video/webm' : 'image/png', sizes }));
  assert.equal(await repo.completeReport('wc', r.id, { title }), true);
};
const titles = ['a.b', 'axb', 'C++ (v2)', '[x] list', '^start$', 'back\\slash', '100% real_deal', 'real deal', 'a|b', 'a'.repeat(400) + '!'];
for (const t of titles) await titled(t);
assert.deepEqual(await find('a.b'), ['a.b'], '. is not any-character');
assert.deepEqual(await find('A.B'), ['a.b'], 'but case is ignored');
assert.deepEqual(await find('C++'), ['C++ (v2)']);
assert.deepEqual(await find('(v2)'), ['C++ (v2)']);
assert.deepEqual(await find('[x]'), ['[x] list'], '[x] is not a character class');
assert.deepEqual(await find('^start$'), ['^start$'], 'anchors are literal');
assert.deepEqual(await find('start'), ['^start$']);
assert.deepEqual(await find('\\'), ['back\\slash'], 'a backslash is literal');
assert.deepEqual(await find('a|b'), ['a|b'], '| is not alternation');
assert.deepEqual(await find('.*'), [], '.* matches nothing');
assert.deepEqual(await find('100%'), ['100% real_deal']);
assert.deepEqual(await find('real_d'), ['100% real_deal'], '_ is itself');
assert.deepEqual(await find('real%d'), [], '% is not a wildcard');
for (const evilQ of ['(a+)+$', '(a*)*b', '(a|aa)+$', '(.*a){25}', 'a'.repeat(400) + '(a+)+!']) {
  const t0 = performance.now();
  await find(evilQ);
  assert.ok(performance.now() - t0 < 2000, `${evilQ.slice(0, 20)} did not return promptly`);
}
assert.deepEqual(await find('a'.repeat(400) + '!'), ['a'.repeat(400) + '!'], 'a long literal still matches');

// ── sites: the project filter and the list of sites stay inside the workspace
const sited = async (project: string | null, n: number) => {
  for (let i = 0; i < n; i++) {
    const r = await made('wc', 'uc', repo.CreateInput.parse({ t0: Date.now(), media: 'image/png', project, sizes }));
    assert.equal(await repo.completeReport('wc', r.id), true);
  }
};
await sited('shop.test', 2); await sited('blog.test', 1); await sited('adm.test', 1); await sited(null, 1);
assert.deepEqual(await repo.projectsOf('wc'), [
  { project: 'shop.test', count: 2 }, { project: 'adm.test', count: 1 }, { project: 'blog.test', count: 1 },
], 'most used first, then A–Z; no null');
assert.ok(!(await repo.projectsOf('wc')).some((p) => p.project === 'app.test'), "C does not list A's site");
assert.deepEqual((await repo.projectsOf('wa')).map((p) => p.project), ['app.test'], "A's own sites only");
assert.deepEqual(await repo.projectsOf('wb'), [], 'B has no sites and sees none of C or A');
assert.equal((await repo.listReports('wc', { project: 'shop.test' })).rows.length, 2, 'the project filter lists its own');
assert.equal((await repo.listReports('wc', { project: 'Shop.test' })).rows.length, 0, 'exact match');
assert.equal((await repo.listReports('wb', { project: 'shop.test' })).rows.length, 0, "and not across workspaces");
assert.equal((await repo.listReports('wc', { project: 'app.test' })).rows.length, 0, "C cannot filter its way to A's site");
for (const e of [{ $ne: null }, { $regex: '.*' }, ['shop.test']] as never[]) {
  await storeNothing('project filter', () => repo.listReports('wc', { project: e }).then((r) => r.rows));
}
await storeNothing('projectsOf ws', () => st.projectsOf({ $ne: null } as never));

// ── the video cap under a race: concurrent completes at limit−1, one winner.
// Each round gives the user exactly one slot, then two completes fight for it.
await repo.setPlan('d@x.test', 'free', 1);
assert.equal(await repo.completeReport('wd', (await made('wd', 'ud')).id), true, 'the first one fits');
for (let round = 0; round < 5; round++) {
  const used = (await repo.usageOf('ud'))!.videos;
  await repo.setPlan('d@x.test', 'free', used + 1);
  const [r1, r2] = [await made('wd', 'ud'), await made('wd', 'ud')];
  if (process.env.TRACE) console.log('race', round);
  const won = await Promise.all([repo.completeReport('wd', r1.id), repo.completeReport('wd', r2.id)]);
  assert.equal(won.filter(Boolean).length, 1, `round ${round}: exactly one wins (${won})`);
  assert.equal((await repo.usageOf('ud'))!.videos, used + 1, `round ${round}: one slot used`);
}
// The same report completed twice at once is one slot.
const usedBefore = (await repo.usageOf('ud'))!.videos;
await repo.setPlan('d@x.test', 'free', usedBefore + 1);
const twin = await made('wd', 'ud');
// At the cap, the loser of a same-report race may hear false while the winner
// has not yet flipped the report (Postgres blocks on the row and says true;
// Mongo cannot) — but it is one slot, and only a retry is guaranteed true.
// NOTE: the rounds above pass on Postgres only because PGlite serialises
// queries. On real Postgres under READ COMMITTED, two concurrent completes of
// DIFFERENT videos at limit-1 can both succeed (pre-existing; SQL unchanged).
// Mongo's conditional $inc is strict.
const both = await Promise.all([repo.completeReport('wd', twin.id), repo.completeReport('wd', twin.id)]);
assert.ok(both.some(Boolean), 'one of a doubled complete lands');
assert.equal(await repo.completeReport('wd', twin.id), true, 'and a retry says ready');
assert.equal((await repo.usageOf('ud'))!.videos, usedBefore + 1, 'a doubled complete used one slot');
const extra = await repo.createReport('wd', 'ud', input);
assert.ok('refused' in extra && extra.refused === 'videos', 'and the cap holds afterwards');

// ── env is client-supplied: `$`-prefixed and dotted keys must round-trip on both adapters
await repo.setPlan('d@x.test', 'free', 1000);
const odd = await made('wd', 'ud');
const oddEnv = { '$ne': 'x', 'a.b': 1, nested: { '$gt': 1, 'c.d': 2 } };
assert.equal(await repo.completeReport('wd', odd.id, { env: oddEnv }), true, 'env with $ and dotted keys is accepted');
assert.deepEqual((await st.getReport('wd', odd.id))!.env, oddEnv, 'and reads back unchanged');

// ── adapters that keep a counter: drift is repaired by the cleanup job
if (fx.corruptCounter) {
  await fx.corruptCounter('ud', 500);
  await repo.setPlan('d@x.test', 'free', 50);
  const late = await made('wd', 'ud');
  assert.equal(await repo.completeReport('wd', late.id), false, 'a leaked counter blocks a complete');
  await repo.purgeAbandoned();
  const again = await made('wd', 'ud');
  assert.equal(await repo.completeReport('wd', again.id), true, 'the recount in purgeAbandoned() repaired it');
}

console.log(`tenancy ok (${adapter})`);
await fx.close();
process.exit(0);

