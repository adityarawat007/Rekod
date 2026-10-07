# Pluggable adapters: Postgres or MongoDB, any bucket

Plan for letting a self-hoster choose the database by config. **Postgres stays
the default and keeps working exactly as today** — same schema, same
migrations, same queries, same `DATABASE_URL`. MongoDB is an extra adapter
picked by the URL's scheme. Nothing else changes for an existing install.

Branch: `feat/pluggable-adapters`. **Phases 0-5 are done** (see "Deviations"). Opus plans and reviews each phase; Sonnet
implements. A phase is done only when `pnpm typecheck && pnpm lint && pnpm test
&& pnpm build` pass.

## Prior art

- **Payload CMS** — `db-postgres` (Drizzle) and `db-mongodb` (Mongoose) both
  implement one `BaseDatabaseAdapter`; `config.db` picks one. The seam is the
  app's own operations, not a generic query builder.
- **Better Auth** — `drizzleAdapter` / `mongodbAdapter`. Auth is solved by
  swapping one line.
- **Strapi** — dropped MongoDB in v4: a minority of users, ~20% slower on every
  feature. Lesson: **a feature is not done until it works on both adapters and
  the tenancy test passes on both.**

## Shape

```
src/lib/server/store/
  types.ts    Store interface — one method per database operation
  index.ts    store(): picks the adapter from DATABASE_URL's scheme, lazily
  pg.ts       today's Drizzle code, moved, unchanged in behavior
  mongo.ts    the MongoDB adapter
src/lib/storage/
  types.ts    BlobStore interface
  s3.ts       the S3 adapter (unchanged behavior)
  index.ts    registry + lazy blob(), STORAGE_DRIVER (default s3)
```

- `postgres://` / `postgresql://` → `pg.ts`. `mongodb://` / `mongodb+srv://` →
  `mongo.ts`. Anything else fails with a message naming both.
- **Adding an adapter = one file implementing `Store` + one line in the
  registry in `index.ts`.** Same for `BlobStore`. No other file changes.
- `lib/server/reports.ts`, `workspaces.ts`, `session.ts`, `health.ts` keep their
  exported API byte-for-byte; callers (pages, actions, routes, scripts) do not
  change. They keep the business logic — zod input, plan limits, presigning,
  delete-objects-before-rows — and call `store()` for data.
- `auth.ts` gets Better Auth's database and options from `authParts()` in `store/index.ts`, which loads the adapter, awaits its `init()` (Mongo: indexes, so a failure surfaces before Better Auth starts) and then returns `authAdapter()` and `authOptions()`.
- The tenant rule does not move: every `Store` method that touches workspace
  data takes `ws` first and puts it in its filter.
- ESLint: `noDb` also forbids `mongodb` and `**/server/store*` outside
  `src/lib/server/`.

### The `Store` interface (data only, no business rules)

```ts
health(): Promise<void>
authAdapter(): BetterAuthOptions['database']
listReports(ws, { q?, types?, after?, limit }): ListRowRaw[]   // incl. media key
getReport(ws, id): (BaseRow & { shareToken, creator, assets }) | null
sharedReport(token): (BaseRow & { assets }) | null              // ready only, explicit fields
commentsOf(reportId): CommentRaw[]
usageOf(userId): { plan, limit, videos, lastHour } | null
setPlan(email, plan, videos): boolean
insertReport(report, assets): void
completeReport(ws, id, set): boolean      // video cap enforced INSIDE the adapter
updateReport(ws, id, fields): boolean
assetKeys(ws, ids): string[]
deleteReports(ws, ids): number
abandoned(olderThan: Date, batch): { id, ws }[]
addComment(ws, userId, reportId, body): CommentRaw | null
deleteComment(ws, userId, commentId): boolean
getShareToken(ws, id): string | null | undefined   // undefined = no such report
setShareToken(ws, id, token | null): boolean
workspaceOf(userId, active): string | null
workspacesOf(userId): Workspace[]
ownedWorkspaces(userId): { plan, owned }
```

Exact types are settled in Phase 1 from the current return shapes.

## MongoDB data model

| Collection | Document | Indexes |
|---|---|---|
| `reports` | `_id` = UUIDv7 string; today's columns camelCased; `assets: [{kind, mimeType, storageKey}]` embedded | `{workspaceId:1, status:1, _id:-1}`, `{createdBy:1, type:1, status:1}`, `{createdBy:1, createdAt:-1}`, `{shareToken:1}` unique + partial (string only), `{status:1, createdAt:1}` |
| `comments` | `{_id, reportId, workspaceId, authorId, body, createdAt, deletedAt}` | `{reportId:1, createdAt:1}` |
| Better Auth's | created by its adapter | created by its adapter |

No migrations. `createIndex` runs once per process on first use (idempotent).

### Where MongoDB differs

1. **Paging** — UUIDv7 strings sort by time: `{_id: {$lt: after}}`, `sort({_id: -1})`.
2. **Search** — `$regex` over an escaped string, `$options: 'i'`, on title or
   description. Same literal `%`/`_` behaviour as `likeable()`.
3. **Video cap, atomically** — Postgres does it in one UPDATE. MongoDB has no
   cross-collection conditional write without a replica set, so the user doc
   carries `readyVideos`:
   `findOneAndUpdate({_id: user, $expr: {$lt: ['$readyVideos', '$videoLimit']}}, {$inc: {readyVideos: 1}})`,
   then flip the report `processing → ready`; if the flip matches nothing,
   `$inc: -1`. Deleting a ready video `$inc: -1`. Already-ready → idempotent
   `true`. `purgeAbandoned()` also recounts `readyVideos` for touched users
   (repairs drift from a crash between the two writes). Missing
   `videoLimit` = `PLANS.free.videos`.
4. **workspaceOf** — fetch the user's memberships (a handful), sort in JS:
   active first, then oldest.
5. **Ids** — settled by the Phase 0 spike (Better Auth's Mongo adapter may store
   ObjectIds; our references are strings).

## Phases

| # | Who | Work | Done when |
|---|---|---|---|
| 0 | Opus | **Spike.** Better Auth `mongodbAdapter` + `organization` + `bearer` against `mongodb-memory-server`: user create hook, org create as system action, session lookup, id types. | Findings written under "Phase 0 findings" below. |
| 1 | Sonnet | **Store seam + `pg.ts`.** Move every Drizzle call out of `reports.ts`, `workspaces.ts`, `session.ts`, `health.ts`, `auth.ts` into `store/pg.ts` behind `Store`. Zero behavior change. Also the `BlobStore` type over the existing S3 code. ESLint rule extended. | All checks pass; `test-tenancy.ts` unchanged and green. |
| 2 | Sonnet | **`mongo.ts`.** Implement `Store` per the data model above; `mongodb` driver (not Mongoose); registry line. | Typecheck + lint + build green. |
| 3 | Sonnet | **Tenancy test on both.** `test-tenancy.ts` runs the same assertions against PGlite and `mongodb-memory-server`, selected by argv. `pnpm test` runs both. Plus a cap race test: two concurrent `completeReport` at limit−1 → exactly one wins, on both. | Green on both. |
| 4 | Sonnet | **Security + CI** (from the research below): see "Phase 4". | CI green on the branch. |
| 5 | Sonnet | **Docs.** `.env.example` Mongo example, `docker-compose.dev.yml` `mongo` service (profile, off by default), README self-host section, CLAUDE.md: the two-adapter rule. | Reviewed by Opus. |

Out of scope: data migration between adapters; Mongoose; a native GCS adapter
(GCS works today through its S3 interoperability endpoint).

## Phase 0 findings

Better Auth 1.7.6 on MongoDB: **go**, no blockers (spike: sign-up, the
personal-workspace hook as a system action, org plugin incl. the refused user
create, Bearer with `requireSignature`, extra user fields surviving updates).

- `import { mongodbAdapter } from 'better-auth/adapters/mongodb'` (re-exports
  `@better-auth/mongo-adapter`, already in the lockfile). New deps: `mongodb`
  (^7), and `mongodb-memory-server` (dev).
- **Ids: `advanced.database.generateId: () => uuidv7()`, Mongo only.** Unset →
  ObjectId; `'uuid'` → BSON Binary. Both break string lookups
  (`member.find({userId: '<string>'})` → 0). A function → plain strings
  everywhere, matching our `workspaceId` / `createdBy`. Never `'uuid'`.
- **`mongodbAdapter(db, { client, transaction: false })`.** With a client,
  transactions default on and a standalone `mongod` refuses the first sign-up.
  Our cap design needs no replica set either.
- **The adapter creates no indexes** — three concurrent same-email sign-ups made
  three users. Our first-use `ensureIndexes()` must also create Better Auth's:
  `user.email` unique; `session.token` unique, `session.userId`;
  `account {providerId, accountId}` unique, `account.userId`;
  `organization.slug` unique; `member {organizationId, userId}` unique,
  `member.userId`; `verification.identifier`; `invitation.organizationId`,
  `invitation.email`. Collections are singular (`user`, `member`, …).
- Extra user fields live on the doc as written (`plan`, `videoLimit` — pick
  camelCase in Mongo); Better Auth's `$set` leaves them alone.
- A throwing `user.create.after` leaves the user without a workspace on both
  databases (no rollback). Already true for Postgres; unchanged.

## Phase 4: security and CI

Surveyed: Payload (DB matrix by env var — the model for us), Better Auth
(Postgres + Mongo in one test job, zizmor, SHA-pinned actions, `alls-green`,
dependabot cooldowns, SECURITY.md), cal.com (integration tests on a real
Postgres, `security-audit.yml` failing on critical), Documenso (minimal).
The repo is **public**, so CodeQL, dependency review and Scorecard are free.

**Runs on every push to any branch and on every PR** (`.github/workflows/ci.yml`):

| Job | What |
|---|---|
| `check` | typecheck, lint, build (unchanged) |
| `test` | matrix `adapter: [postgres, mongo]` → `pnpm test:<adapter>`. Both are in-process (PGlite, `mongodb-memory-server`), so no service containers. `fail-fast: false`. |
| `audit` | `pnpm audit --prod --audit-level=high` — fails on high/critical in shipped deps |
| `secrets` | gitleaks over the pushed range |
| `ci` | `re-actors/alls-green` over the above — the one required check for branch protection |

**`.github/workflows/security.yml`** — CodeQL `javascript-typescript` on push,
PR and weekly; `actions/dependency-review-action` on PRs (fails on high,
license deny-list GPL/AGPL); zizmor when `.github/**` changes (SARIF upload);
OpenSSF Scorecard weekly on main.

**Hardening, every workflow** (Better Auth / Payload practice): top-level
`permissions: {}` with per-job grants; every third-party action pinned to a
full commit SHA with a `# vX.Y.Z` comment (resolve with `gh api`); checkout
with `persist-credentials: false`; `timeout-minutes` on every job;
`concurrency` that cancels superseded PR runs but never a push to main.

**Repo files** — `.github/dependabot.yml` (npm at root + github-actions,
weekly, minor/patch grouped, 7-day cooldown); `SECURITY.md` (private GitHub
advisories, 72h acknowledgement, 90-day disclosure, latest version only).

**Security tests added to the suite** (beyond the existing tenancy test, run on both adapters):
- NoSQL operator injection: every repo function given `{ $ne: null }`-shaped
  or non-string ids/tokens/queries returns not-found/empty, never another
  workspace's rows.
- Search escaping: regex metacharacters and `%`/`_` match literally; a
  pathological pattern returns promptly (no ReDoS).
- Share surface: `sharedReport()` result has no `workspaceId`, `createdBy`,
  `shareToken`, or email — asserted by key list on both adapters.
- Video cap race: concurrent completes at limit−1 → exactly one succeeds.

Manual still (no test harness by design): `redact.js` — see CLAUDE.md.

## Deviations from the plan (as built)

- **`store()` is a lazy, typed forwarder** (one line per method, like
  `blob()`; no Proxy, which would trap `then`). Adapters load with `import()` on
  first use, so every call is async-forwarded; callers still write `store().x()`.
- **`authParts()`** (database + options) replaces `store().authAdapter()` for
  Better Auth, and **`auth()` is async** because of it.
- **`recountVideos`** is a `Store` method; the cleanup purge uses it to repair
  `readyVideos` drift on Mongo.
- **Same-report race on Mongo:** two concurrent completes of the *same* report
  take one slot. Below the cap both say `true`. At the cap the loser can hear
  `false` while the winner has not yet flipped the report; only a retry is
  guaranteed `true` (Postgres blocks on the row, so it says `true` at once).
- **Cap race across different videos:** on Mongo the conditional `$inc` is
  strict: exactly one of two completes at limit-1 wins. On real Postgres under
  READ COMMITTED, two concurrent completes of *different* videos at limit-1 can
  both succeed. That is pre-existing, not changed by this branch, and the SQL
  was left alone. The test passes on Postgres only because PGlite serialises
  queries; it is not a guarantee about Postgres.
- **Injection tests run on Mongo and at repo level on Postgres only**: Postgres
  binds parameters, so there is nothing below the repo to test, and sending raw
  rejected wire values at PGlite intermittently wedges its single engine.
- **Storage** got the same registry as the DB (`STORAGE_DRIVER`, default `s3`).
- **Phase 5:** `.env.example`, a `mongo` compose profile, README "Choose your
  database", CLAUDE.md. `shadcn` moved to devDependencies and `next` bumped to
  16.3.8 so `pnpm audit --prod --audit-level=high` passes; `source-map-js` and
  `sharp` are pinned by `overrides` in `pnpm-workspace.yaml`.
