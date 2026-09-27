# ReKod: Open-Source Rebuild Roadmap

Sep 27, 2026 · @Adi

> Status and issues found while executing live in [Progress log](#progress-log) at the bottom.
> Until Phase 2 is done, `CLAUDE.md` still describes the running system; where the two
> disagree, this file is the target and `CLAUDE.md` is the present.

## Summary

ReKod moves off Supabase-only features so anyone can self-host it with one `docker compose up`, while our org keeps running it on Supabase Postgres throughout. The rebuild runs in six phases: foundations, auth (email + Google), core reports, workspaces, open-source launch, then billing.

Decisions already made:

| Area | Decision |
| --- | --- |
| License | AGPLv3 for the whole repo. An `/ee` folder under a commercial license holds the paid features: team workspaces, integrations and billing |
| Backend | Next.js is the backend: Route Handlers, Server Actions, and a `lib/server` core layer. No separate API server for now |
| Database | Any Postgres through `DATABASE_URL`, with Drizzle for schema and migrations |
| Auth | Better Auth: email + password and Google sign-in, organization plugin for workspaces, API key plugin for the extension |
| Access control | No RLS. Every query goes through a scoped data layer that requires a `workspace_id`, backed by tenant isolation tests |
| Storage | Any S3-compatible bucket with presigned upload/download URLs. Supabase Storage works through its S3 endpoint |
| Ownership | The workspace owns all data. Every user gets a personal workspace at signup |
| Extension | Stays vanilla JS, no build step. Talks to any server URL using a revocable API token instead of the dashboard cookie |

## Free vs paid

Everything one person needs is free; anything a team needs is paid. This is the same split Cal.com used: single-player features in the open core, multi-player features in `ee/`.

| Feature | Plan |
| --- | --- |
| Recording, screenshots, console and network capture, rolling 5-minute buffer | Free |
| Redaction, including custom redaction rules | Free |
| Personal workspace with unlimited reports and comments | Free |
| Read-only share links | Free |
| Email + password and Google sign-in, extension API tokens | Free |
| Self-hosting with Docker | Free |
| Creating team workspaces, invites, roles | Paid |
| Jira, Linear, GitHub and Slack integrations | Paid |
| Webhooks | Paid |
| SSO and audit log (later) | Paid |

How the gate works:

- **One check in the core.** `lib/server` asks `features.has(workspaceId, "team_workspaces" | "integrations" | "webhooks")` before any paid action. With no `ee/` code or no license, it returns false.
- **Workspace creation.** Better Auth's organization plugin takes `allowUserToCreateOrganization` as a function; it calls the same check, so users without a license keep only their personal workspace.
- **Self-hosted unlock.** A `REKOD_LICENSE_KEY` env value: a signed license (organization, seats, expiry) verified offline against a public key shipped in the app. No phone-home.
- **Hosted unlock.** The workspace's Stripe subscription (Phase 5) answers the same check.
- **Locked, not hidden.** Paid screens show an upgrade card instead of disappearing, and nothing free ever breaks when a license expires.
- **Clean separation.** The core never imports from `ee/`. At startup, `ee/index.ts` registers integrations and team features into a plugin registry if the folder exists, so deleting `ee/` still leaves a building, working AGPL app.
- **Our org.** We issue ourselves a free license key.
- **Be upfront.** The README lists exactly which features are paid, so nobody discovers it after setup.

## Target architecture

One Next.js app is the whole backend. The browser and the extension never touch the database directly; every read and write goes through `lib/server`, which always scopes by workspace.

```
 Browser (dashboard) ──session cookie──┐
                                       ├──▶ Next.js (apps/web)
 Extension ─────Bearer rk_… ───────────┘      Server Actions · /api/v1 · /api/auth
                                                        │
                                                   lib/server  (scoped by workspace_id)
                                                   │        │
                                               Postgres   lib/storage ──presign──▶ S3 bucket
                                                                                     ▲
 Extension ────────────── PUT video / logs via presigned URL ─────────────────────────┘
```

The server only signs upload URLs. The extension sends video and log files straight to the bucket, so large files never pass through Next.js.

Folder layout:

| Path | Holds |
| --- | --- |
| `apps/web/src/app/(dashboard)` | Pages and Server Actions |
| `apps/web/src/app/api/auth/[...all]` | Better Auth handler |
| `apps/web/src/app/api/v1` | REST endpoints for the extension and integrations |
| `apps/web/src/lib/server` | Business logic and the scoped repos. The only code that imports `db` |
| `apps/web/src/lib/db` | Drizzle schema and migrations |
| `apps/web/src/lib/storage` | S3 client wrapper: presign upload, presign download, delete |
| `apps/extension` | Vanilla JS extension, unchanged build-free setup |
| `ee/` | Billing, later. Commercial license |

What gets rewritten vs kept:

- **Kept:** the extension's capture, rolling buffer and `redact.js`; the dashboard UI, player and timeline components; Tailwind and shadcn.
- **Rewritten:** every Supabase client call (auth, queries, storage) moves into `lib/server`; the extension's login and upload code; the share function becomes a server route.
- **Removed:** RLS policies, the security definer function, `@supabase/*` packages.

## Authentication

Better Auth handles two sign-in methods, email + password and Google, and both end in the same session cookie and the same `user` row. The extension never uses that cookie; it gets its own API token.

### Setup

- Better Auth config: `emailAndPassword: { enabled: true }` and `socialProviders.google` with `clientId` and `clientSecret` from env.
- Google Cloud Console: create an OAuth client (Web application). Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`. Scopes: `openid`, `email`, `profile` only.
- Env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Google is optional for self-hosters. The "Continue with Google" button only renders when `GOOGLE_CLIENT_ID` is set, so an instance without it still works with email + password.

### Google sign-in flow

1. User clicks **Continue with Google** on `/login` or `/signup`. The client calls `authClient.signIn.social({ provider: "google", callbackURL: "/reports" })`.
2. Better Auth redirects to Google with a state parameter (CSRF protection).
3. User approves; Google redirects to `/api/auth/callback/google`.
4. Better Auth checks the state, exchanges the code, and reads the verified email, name and avatar.
5. New user: it creates a `user` row and an `account` row (`providerId = google`). Returning user: it finds the existing account.
6. It sets the session cookie (httpOnly, Secure, SameSite=Lax) and redirects to `/reports`.

### Rules that apply to both methods

- **Personal workspace on signup.** A `databaseHooks.user.create.after` hook creates a workspace named after the user and adds them as `owner`. Every user always has at least one workspace.
- **Account linking.** If someone signed up with email + password and later clicks Google with the same email, link the Google account to the existing user instead of creating a duplicate. Enable `account.accountLinking` with `trustedProviders: ["google"]`, because Google verifies emails.
- **Signup controls for self-hosters.** `DISABLE_SIGNUP=true` allows only invited users. `ALLOWED_EMAIL_DOMAINS=yourorg.com` rejects other emails in a `user.create.before` hook, for both methods. For our org, set this to our domain.
- **Email verification.** Required only when SMTP is configured. Without SMTP, email + password works unverified, which is fine for internal instances.
- **Invites.** An invite link sends the person to signup; after either method, they land in the invited workspace as well as their personal one.

### Extension connect flow

1. First run: the extension asks for the server URL (default: our hosted URL later). It requests permission for that origin with `chrome.permissions.request`.
2. It opens `{server}/extension/connect` in a tab. The user signs in there with either method if needed.
3. The page shows "Connect Chrome extension to {workspace}?" with a workspace picker. On approve, the server creates an API key (Better Auth API key plugin) scoped to that user + workspace, and stores only its hash.
4. The page hands the key to the extension with `chrome.runtime.sendMessage` via `externally_connectable`; if that origin isn't allowed, it shows the key once for the user to paste.
5. The extension saves the server URL and key in `chrome.storage.local` and sends `Authorization: Bearer rk_...` on every `/api/v1` call.
6. Settings > Devices lists keys with name and last-used time; revoking one logs that extension out immediately.

## Database schema

All users share the same tables, and every tenant table carries `workspace_id` from day one. Every table has a UUIDv7 `id`, `created_at` and `updated_at`; soft-deleted tables add `deleted_at`.

| Table | Key columns | Owner | Phase |
| --- | --- | --- | --- |
| `user`, `session`, `account`, `verification` | Managed by Better Auth. `account` holds one row per sign-in method (credential, google) | Better Auth | 1 |
| `organization` (workspace) | name, slug, logo | Better Auth org plugin | 1 |
| `member` | organization\_id, user\_id, role (owner / admin / member) | Better Auth org plugin | 1 |
| `apikey` | user\_id, workspace\_id (in metadata), key hash, name, last\_used\_at | Better Auth API key plugin | 1 |
| `reports` | workspace\_id, created\_by, title, description, type (video / screenshot), page\_url, browser, os, viewport, duration\_ms, status (processing / ready / failed), deleted\_at | ReKod | 2 |
| `report_assets` | report\_id, workspace\_id, kind (video / screenshot / logs / network / thumbnail), storage\_key, size\_bytes, mime\_type | ReKod | 2 |
| `comments` | report\_id, workspace\_id, author\_id, body, timestamp\_ms, edited\_at, deleted\_at | ReKod | 2 |
| `share_links` | report\_id, workspace\_id, token\_hash, created\_by, expires\_at, revoked\_at, view\_count | ReKod | 2 |
| `invitation` | organization\_id, email, role, status, expires\_at, inviter\_id | Better Auth org plugin | 3 |
| `integrations` | workspace\_id, provider (github / linear / jira / slack), config (encrypted), created\_by | ReKod | 3 |
| `report_exports` | report\_id, integration\_id, external\_url | ReKod | 3 |
| `webhooks` | workspace\_id, url, secret, events, enabled | ReKod | 3 |
| `subscriptions` | workspace\_id, stripe\_customer\_id, stripe\_subscription\_id, plan, status, seats, current\_period\_end | `/ee` | 5 |
| `usage` | workspace\_id, month, reports\_count, storage\_bytes | `/ee` | 5 |
| `audit_log` | workspace\_id, actor\_id, action, target, metadata | `/ee` | Later |

Indexes:

- `reports (workspace_id, created_at DESC) WHERE deleted_at IS NULL` for the dashboard list.
- `comments (report_id, created_at)` for the report page.
- Unique on `share_links (token_hash)` and on the API key hash.
- `member (user_id)` for the workspace switcher.

Logs and network requests move out of JSON columns into `report_assets` files (`kind = logs / network`). The report row stays small; the player fetches those files through presigned URLs.

Tables for paid features (`invitation`, `integrations`, `report_exports`, `webhooks`, `subscriptions`, `usage`) still ship in the core migrations, so turning on a license never needs a schema change. Only the code that uses them lives in `ee/`.

## Route map

The dashboard mutates data through Server Actions; the extension and future integrations use `/api/v1`. Both call the same functions in `lib/server`, so rules live in one place.

### Pages

| Route | Purpose | Access | Phase |
| --- | --- | --- | --- |
| `/login`, `/signup` | Email + password form and Continue with Google | Public | 1 |
| `/forgot-password`, `/reset-password` | Password reset (only when SMTP is set) | Public | 1 |
| `/extension/connect` | Approve the extension and issue its API key | Signed in | 1 |
| `/settings/profile` | Name, avatar, linked sign-in methods | Signed in | 1 |
| `/settings/devices` | Extension API keys, revoke | Signed in | 1 |
| `/reports` | Report list for the active workspace | Member | 2 |
| `/reports/[id]` | Player, timeline, comments, share controls | Member | 2 |
| `/s/[token]` | Read-only shared report | Anyone with the link | 2 |
| `/settings/workspace` | Name, slug, retention days, delete workspace | Owner / admin | 3 |
| `/settings/members` | Members, roles, invites | Owner / admin | 3 |
| `/invite/[id]` | Accept an invite, then sign in or sign up | Public | 3 |
| `/settings/integrations` | GitHub, Linear, Jira, Slack, webhooks | Owner / admin | 3 |
| `/settings/billing` | Plan, seats, Stripe portal | Owner | 5 |

### API routes

| Method + route | Purpose | Auth | Phase |
| --- | --- | --- | --- |
| `GET /api/health` | Health check for Docker | None | 0 |
| `* /api/auth/[...all]` | Better Auth, including `/callback/google` | Better Auth | 1 |
| `GET /api/v1/config` | Instance config: Google enabled, signup open | None | 1 |
| `GET /api/v1/me` | Token check: user + workspace for the extension | API key | 1 |
| `POST /api/v1/reports` | Create a report in `processing` state and return presigned upload URLs | API key | 2 |
| `POST /api/v1/reports/[id]/complete` | Confirm uploads finished; set status to `ready` | API key | 2 |
| `GET /api/v1/reports`, `GET /api/v1/reports/[id]` | List and read, for integrations | API key or session | 2 |
| `PATCH`, `DELETE /api/v1/reports/[id]` | Edit title and description, soft-delete | API key or session | 2 |
| `GET`, `POST /api/v1/reports/[id]/comments` | Read and add comments | API key or session | 2 |
| `POST`, `DELETE /api/v1/reports/[id]/share` | Create or revoke a share link | API key or session | 2 |
| `POST /api/v1/reports/[id]/export` | Send a report to a connected issue tracker | Session | 3 |
| `POST /api/cron/retention` | Delete reports and files past retention | Cron secret | 4 |
| `POST /api/webhooks/stripe` | Stripe subscription events | Stripe signature | 5 |

## Roadmap by phase

Each phase ends with a working app our org can keep using, so there is no big-bang cutover. Phases 1 and 2 are the rewrite; after Phase 2 no Supabase-specific code remains.

### Phase 0: Foundations

- [x] Turn the repo into a pnpm workspace: `apps/web`, `apps/extension`.
- [x] Add Drizzle ~~and pull the current Supabase schema~~ (`drizzle-kit pull`) as the baseline migration.
- [x] Create `lib/server`, `lib/db` and `lib/storage`. Point storage at Supabase Storage's S3 endpoint for now.
- [x] Add `docker-compose.dev.yml` with Postgres and SeaweedFS for local development.
- [x] Validate env with zod and write `.env.example`.
- [x] CI: typecheck, lint, tests. ESLint rule: only `lib/server` may import `db`.
- [x] Add `GET /api/health`.

**Done when:** the same code runs against local Docker Postgres and our Supabase Postgres, and CI is green.

### Phase 1: Auth (email + Google)

- [x] Install Better Auth with the Drizzle adapter; generate its tables.
- [x] Enable email + password and Google, account linking with Google trusted, and the personal-workspace hook.
- [~] Add the organization and API key plugins. _(organization done; API key deferred with the extension connect flow)_
- [x] Add `DISABLE_SIGNUP` and `ALLOWED_EMAIL_DOMAINS` checks.
- [~] Build `/login`, `/signup`, password reset, `/settings/profile`, `/settings/devices`. _(`/login` with sign-up toggle + Google done; rest deferred)_
- [~] Extension: server URL setting, `/extension/connect` flow, bearer token on every call. _(bearer on every call done — the session cookie's value; connect flow deferred)_
- [-] ~~Migrate our org's users:~~ _(skipped: hard cutover, everyone signs up fresh)_ import each email as a Better Auth `user`, then everyone signs in with Google once so the account links by email. Anyone without Google does a password reset.

**Done when:** our team signs in with Google, the extension works through its token, and no Supabase Auth call remains.

### Phase 2: Core reports rewrite

- [x] Create `reports`, `report_assets`, `comments`, `share_links` with `workspace_id`.
- [-] ~~One-time migration script:~~ _(skipped: nobody uses the old data — hard cutover)_ move each old report into its owner's personal workspace, write JSON logs and network data to storage files, and split JSON comments into `comments` rows.
- [x] New upload flow: create report, presigned uploads, `complete` endpoint, `processing` / `ready` / `failed` status.
- [x] Rewrite every dashboard query as a scoped repo call; mutations as Server Actions.
- [x] Share links: hashed token, expiry, revoke, `/s/[token]` page.
- [x] Tenant isolation tests: user A cannot read, edit, comment on or share user B's report.
- [x] Remove `@supabase/*` packages, RLS policies and the security definer function.

**Done when:** every existing report plays correctly, isolation tests pass in CI, and a search for `supabase` in the code finds nothing.

### Phase 3: Team workspaces and integrations (paid)

All of this phase lives in `ee/`. Start by creating the folder with its commercial license, the `features.has` check, the plugin registry and offline license-key verification.

- [ ] Workspace switcher, `/settings/members`, invites, `/invite/[id]`.
- [ ] Role matrix: owner manages billing and deletion; admin manages members and integrations; member creates and comments.
- [ ] Create our org's shared workspace; let users move reports from their personal workspace into it.
- [ ] Per-workspace redaction rules (extra headers, query params, CSS selectors) that the extension fetches on connect.
- [ ] Export to GitHub Issues, Linear and Jira; generic webhooks.

**Done when:** our whole team works in one shared workspace and can send a report to our issue tracker.

### Phase 4: Open-source launch

- [ ] Production `docker-compose.yml`: app, Postgres, optional SeaweedFS. Migrations run on boot.
- [ ] Publish the image to GHCR with tagged releases and migration notes.
- [ ] Retention setting and `/api/cron/retention` cleanup job.
- [ ] Publish the extension to the Chrome Web Store with the server URL setting.
- [ ] README with demo GIF, AGPLv3 `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` with a disclosure email.
- [ ] Self-hosting guide, including Google OAuth setup and pointing at Supabase, Neon or RDS.
- [ ] Security pass: dependency audit, rate limits on auth and upload routes, review of share and API key routes.

**Done when:** someone following only the README goes from a fresh server to a working instance in under 10 minutes.

### Phase 5: Billing (`/ee`)

- [ ] Connect `features.has` to Stripe, so a hosted subscription unlocks the same paid features as a self-hosted license key.
- [ ] Add a `billing.getPlan(workspaceId)` interface that returns unlimited when no `STRIPE_SECRET_KEY` is set.
- [ ] Stripe through the Better Auth Stripe plugin: `subscriptions`, `usage`, `/settings/billing`, `/api/webhooks/stripe`.
- [ ] Enforce plan limits (seats, reports per month, storage) inside `lib/server`.
- [ ] Launch the hosted version.

**Done when:** the free core has no usage limits when self-hosted, and paid features unlock by license key or subscription, and the hosted version enforces plans.

## Security and risks

The biggest risk after dropping RLS is a query that forgets its workspace filter, so the scoped repos and isolation tests are not optional.

| Risk | Mitigation |
| --- | --- |
| A query leaks another workspace's data | Only `lib/server` imports `db`; every repo requires `workspaceId`; isolation tests in CI |
| Leaked extension token | Tokens stored hashed, shown once, revocable in Settings > Devices, last-used time visible |
| Guessable share links | 32-byte random tokens, hashed in the database, optional expiry, revoke button |
| Sensitive data in recordings | `redact.js` runs before upload; per-workspace redaction rules in Phase 3 |
| Google account takeover through linking | Link only for Google, which verifies emails; never auto-link unverified providers |
| Old signed URLs keep working | Short expiry (for example 15 minutes) on every presigned download |
| Brute force on login and uploads | Better Auth rate limiting plus per-token limits on `/api/v1` |
| Migration loses old reports | Run the Phase 2 script on a database copy first; keep the Supabase project read-only for 30 days after cutover |
| Self-hosters on outdated versions | Tagged releases, a security advisory channel, and `SECURITY.md` |

## Progress log

_Updated as each phase lands._

### Phase 0 — 27 Sep 2026 (code done, two checks outstanding)

Landed:
- `viewer/` → `apps/web/`, `extension/` → `apps/extension/`. Root `package.json` + `pnpm-workspace.yaml`
  list only `apps/web`; the extension stays package-free. `package-lock.json` deleted (pnpm only).
- Drizzle + postgres-js in `src/lib/db` (`prepare: false`, so the Supabase transaction pooler works).
  All new tables go in a `rekod` Postgres schema — see issue 2.
- `src/lib/env.ts` (zod, validated lazily on first use), `src/lib/storage` (aws4fetch presign PUT/GET + delete,
  path-style), `src/lib/server/health.ts`, `GET /api/health` (exempt from `proxy.ts`; 503 `{ok:false}` when
  Postgres is down, cause logged, never echoed).
- `docker-compose.dev.yml` (Postgres 17 + SeaweedFS S3 on :8333), `apps/web/.env.example`.
- ESLint `no-restricted-imports`: only `src/lib/server` / `src/lib/db` may import `@/lib/db`. Verified it fires.
- `.github/workflows/ci.yml`: typecheck, lint, all tests, build. `typecheck` now runs `next typegen` first.
- Local: typecheck, lint, `pnpm test` (all four suites) and build all green; `next start` + dead DB → health 503,
  dashboard still redirects to `/login` as before.

Outstanding:
- **`drizzle-kit pull` not run** — needs our Supabase `DATABASE_URL`. See issue 1 for why it should not be a migration.
- **Not run against real Postgres.** No Docker on the dev machine; `docker compose -f docker-compose.dev.yml up`
  then `curl localhost:3100/api/health` → `{"ok":true}` closes it. CI goes green on first push.

### Issues found

1. **The legacy schema can't be a runnable baseline.** `public.reports` references `auth.users`, and its
   policies call `auth.uid()` — neither exists on plain Postgres, so a pulled baseline fails on Docker, which
   is the opposite of Phase 0's "done when". Plan: pull it once into a read-only reference for the Phase 2
   copy script, but not into `migrations/`. Drizzle manages only the `rekod` schema (`schemaFilter`).
2. **Dropping RLS on Supabase exposes `public` tables.** Supabase's Data API serves `public` to the publishable
   key that ships in the extension. A new table there with RLS off is world-readable. Hence the `rekod` schema,
   which also avoids a name clash between the new `reports` and the live legacy one.
3. **Phases 1 and 2 can't be cut over separately.** Every dashboard read and every extension upload today is
   authorised by a Supabase JWT via RLS (`owner = auth.uid()`). Phase 1's "no Supabase Auth call remains" leaves
   nothing to satisfy those policies until Phase 2 replaces them, so reports would be unreadable and uploads
   would fail in between. Proposal: build Better Auth *alongside* Supabase Auth in Phase 1 (new routes, extension
   token, `/api/v1/me`), and make the switch-off the last step of Phase 2.
4. **`externally_connectable` needs origins at build time**, in the manifest. A self-hoster's URL can't be listed,
   so for them the "paste the key" fallback would be the main path. Better: after `chrome.permissions.request`
   grants the origin, the extension injects a tiny script into `/extension/connect` (`chrome.scripting`) that
   receives the key through `postMessage`. That works for any server, with no paste.
5. **Hashed share tokens can't be shown twice.** Today the owner copies a report's link whenever they like; with
   only a hash stored, the link exists once, at creation. Either "copy" mints a new link each time (old ones stay
   valid until revoked), or the token is stored encrypted instead of hashed.
6. **Supabase S3 access keys bypass storage RLS.** That's inherent to "no RLS", but they are the new god key:
   server env only, never `NEXT_PUBLIC_`.
7. **Deploy + local paths moved.** If Vercel builds this, its Root Directory must change `viewer` → `apps/web`, or
   the next deploy fails. Chrome's unpacked extension must be re-loaded from `apps/extension/`.
8. **Root `.env.local` still holds `SUPABASE_SERVICE_KEY`** (gitignored, never committed). Nothing reads it, and
   CLAUDE.md forbids it: delete the file and rotate the key.


### Phases 1 + 2 — 27 Sep 2026 (one hard cutover)

Decided with @Adi: nobody is using the old system, so no side-by-side run and no data migration; the
extension keeps its current behaviour except that uploads go through S3; share links stay copyable.

Landed:
- **Better Auth** (`src/lib/server/auth.ts`): email + password, Google when `GOOGLE_CLIENT_*` are set, linking
  trusted for Google only, organization plugin (users cannot create workspaces yet), bearer plugin with
  `requireSignature`, cookie prefix `rekod`, 5-min signed cookie cache. Personal workspace on sign-up.
  `DISABLE_SIGNUP` / `ALLOWED_EMAIL_DOMAINS` in `user.create.before`.
- **Schema** (`src/lib/db/schema.ts`, migration `0000_init`): Better Auth tables + `reports`, `report_assets`,
  `comments`, all in the `rekod` Postgres schema. UUIDv7 ids and share tokens minted in the app, so it runs
  on any Postgres (no pgcrypto).
- **Scoped repo** (`src/lib/server/reports.ts`): every function takes the workspace first. Server actions in
  `(dash)/actions.ts`; `/api/v1/reports` + `/api/v1/reports/[id]/complete` for the extension.
- **Upload flow:** create (`processing`) → presigned PUTs of media, `logs.json`, `network.json` straight to the
  bucket → complete HEADs every object and flips to `ready` (409 with what is missing otherwise).
- **Share links:** plain 32-byte token from birth, **same link on every copy**, "Stop sharing" revokes, the next
  copy mints a new one. `?view=media` skips fetching the logs.
- **Extension:** `auth.js` reads `rekod.session_token` (`__Secure-` over https); `offscreen.js` `upload()` does
  the three steps with the cookie value as Bearer. Popup, widget, worker unchanged.
- **Removed:** `@supabase/*`, `lib/supabase`, `lib/previews.ts`, `/auth/callback`, all nine `schema*.sql`,
  `NEXT_PUBLIC_SUPABASE_*`. No Supabase-specific code remains (it is still a valid Postgres/S3 host).
- **Checks:** `test-tenancy.ts` (PGlite + fake S3, no Docker) calls every repo function as a second workspace.
  A throwaway end-to-end run against `next start` passed: sign-up, domain allowlist, personal workspace,
  Bearer-only API (cookie-only, forged and malformed all refused), 409 before upload, complete, grid, search,
  report page reading logs from storage, cross-tenant 404, share + `?view=media`, sign-out killing the token.

Deferred, on purpose:
- Password reset + email verification (need SMTP), `/settings/profile`, `/settings/devices`, `/signup` as
  its own route (the login page toggles), `/api/v1/config` + `/api/v1/me`, the rest of `/api/v1` (list,
  PATCH, DELETE, comments, share — no consumer yet), API key plugin + `/extension/connect`. The extension's
  dead `stale` renewal in `worker.js` goes with that rework.
- Soft-delete of reports: kept hard delete (objects, then row), so a deleted recording is actually gone.

Not verified yet:
- ~~Against our real Supabase Postgres + Storage S3~~ — **verified 27 Sep**: migration applied (10 tables in
  `rekod`, `anon`/`authenticated` have no access to the schema), bucket `rekod` private (unsigned GET → 403),
  and the full flow passed live against `next start`: sign-up, personal workspace, Bearer create, 3 presigned
  PUTs, complete, grid, logs read back, signed media plays, share link, cross-user block, sign-out kills the
  token. Test users and files were deleted afterwards.
- Google sign-in: the redirect to Google with the right `redirect_uri` is verified; the consent screen and
  callback need a human in a browser.
- In a real Chrome: the cookie read and the bucket PUT from the offscreen document (the logic is unit-tested
  through stubs; the extension's own tests were removed from the root on request).
- Server actions (notes, comments, share, delete) only through the repo tests, not by clicking.

### Issues found (1 + 2)

9. **A presigned PUT cannot cap size.** A client holding the URL can upload any size. Fine for one trusted
   extension; before Phase 4, switch to presigned POST with a `content-length-range` policy, or check size in
   `/complete`.
10. **Processing rows accumulate** if an upload never completes. Unlisted and harmless; the Phase 4 retention job
    should delete them (and their objects) after a day.
11. **The bucket's origin needs a `host_permissions` entry** or the extension's PUT hits CORS. `*.supabase.co` is
    already there; a self-hosted bucket needs its own — part of the Phase 1 extension rework.
12. **Extension and root tests were removed** (27 Sep, on request) — `redact.js`, the session read and the upload
    now have no automated check.
