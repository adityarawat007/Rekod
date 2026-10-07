# ReKod

A Chrome extension (MV3) that records a tab with the last 5 minutes of console
and network already captured, and a Next.js app that plays it back on one
timeline — and is the whole backend. Any Postgres (Drizzle), any S3-compatible
bucket, Better Auth. No Supabase-specific code: Supabase is just one place to
host the Postgres and the bucket.

[`ROADMAP.md`](ROADMAP.md) is the plan and its progress log says what has landed.
[`PLAN.md`](PLAN.md) is the pre-rebuild history — its "skipped" reasons still
hold for the extension and the viewer UI; its Supabase/RLS parts are gone.

## A pnpm workspace with one package

| | |
|---|---|
| [`apps/extension/`](apps/extension/) | Vanilla JS, MV3. **No build step — the source is what ships.** No `package.json`, no dependencies, and **not** listed in `pnpm-workspace.yaml`. |
| [`apps/web/`](apps/web/) | Next.js 16 + React 19 + Tailwind 4. The only workspace package. |

They share no code and cannot: the extension has no bundler, so it cannot
import from `apps/web/`. The lockfile and `node_modules` live at the repo root.

## The server

**`src/lib/server` is the tenant boundary, and there is nothing behind it.** No
RLS. Every function in `lib/server/reports.ts` takes the workspace id first and
puts it in its WHERE clause; the workspace always comes from the session
(`requireActor()` / `apiActor()` in `lib/server/session.ts`), never from what a
caller sent. **Only `src/lib/server` may import `@/lib/db`** — an ESLint rule.
Add a repo function there rather than querying from a page. A new repo function
means a new cross-tenant assertion in `apps/web/test-tenancy.ts`.

**Two databases, one `Store`.** `lib/server/store/` holds the seam
([`ADAPTERS.md`](ADAPTERS.md) is the design). `store()` returns a lazy facade
over the adapter that `DATABASE_URL`'s scheme picks (`postgres(ql)://` →
`pg.ts`, `mongodb(+srv)://` → `mongo.ts`); each adapter is `import()`ed on first
use, so an install never loads the other's driver. `reports.ts`, `workspaces.ts`,
`session.ts` and `health.ts` keep the business rules (zod, plan limits,
presigning, delete-objects-first) and call `store()` for data. **The rule: a new
query is a method on `Store` (`store/types.ts`) implemented in `pg.ts` AND
`mongo.ts`, plus a tenancy assertion that runs on both** (`test-tenancy.ts
<adapter>`); every method that touches workspace data takes `ws` first. ESLint
keeps `@/lib/db`, `mongodb` and `server/store*` inside `src/lib/server`.
Adding an adapter is one file plus one registry line.

Mongo specifics: Better Auth runs with `advanced.database.generateId: uuidv7`
(an unset id is an ObjectId, `'uuid'` is BSON Binary; both break string
lookups) and `transaction: false` (a standalone `mongod` refuses transactions).
`ensureIndexes()` runs once per process and creates ours **and Better Auth's**,
which its adapter never does (without them concurrent sign-ups duplicate a
user). There are no migrations. The video cap is a `readyVideos` counter on the
user doc, `$inc`ed conditionally, then the report flips `processing → ready`
(undone if the flip matches nothing); `recountVideos` repairs drift and runs
from the cleanup purge. Because `database` is loaded lazily, **`auth()` is
async** — `await auth()`.

**Storage is a registry too.** `lib/storage/types.ts` is `BlobStore`,
`s3.ts` the only adapter, `index.ts` the lazy `blob()` chooser
(`STORAGE_DRIVER`, default `s3`). Callers use `blob().presignUpload(…)` etc.
A new bucket API is one file plus one entry.

**Every table lives in the `rekod` Postgres schema, never `public`.** On
Supabase, `public` is served to the publishable key by the Data API, and with no
RLS a table there would be world-readable.

**`serverEnv()` in `lib/env.ts` is read on first use, not at import**, so a
build needs no env and a missing value fails with its name. Never read
`process.env` directly. `auth()` and `db()` are lazy for the same reason.

**The workspace owns the data.** Better Auth's organization plugin *is* the
workspace (`organization`, `member`); the UI never says "organization". Every
user gets a personal one in `databaseHooks.user.create.after`, created as a
system action so it works while `allowUserToCreateOrganization` is false. A
second workspace is Pro: `createWorkspace()` in `lib/server/workspaces.ts`
checks `PLANS[plan].workspaces` against owned memberships, then creates as a
system action too, so the plugin's own create endpoint stays shut. Switching
is `setActiveOrganization` from a server action, which is why `nextCookies()`
is the last Better Auth plugin. The acting workspace is the session's
active one if the user is still a member of it, else their oldest membership.

**Two ways in, one session.** The dashboard uses Better Auth's cookie
(`rekod.session_token`, `__Secure-` prefixed over https — `cookiePrefix` is
`rekod` and `apps/extension/auth.js` reads it by that exact name). `/api/v1`
accepts **only** `Authorization: Bearer <that cookie's value>` via the bearer
plugin with `requireSignature` — a cookie-only POST is refused, which is the
whole CSRF story for the API. **Google is the only sign-in** (1 Oct 2026):
`emailAndPassword` is `enabled: false` in the server config, not merely hidden
on `/login`, so `/sign-up/email` refuses too. Without both `GOOGLE_CLIENT_*`
nobody can sign in, and `/login` says so. Google verifies the address, which is
also what keeps one-person-one-account honest for the plan limits. Bringing
passwords back needs SMTP first (verification, reset). `DISABLE_SIGNUP` /
`ALLOWED_EMAIL_DOMAINS` are enforced in `user.create.before`.

**`proxy.ts` only checks that a session cookie exists.** It runs on every
request; the real check is `requireActor()`, which reads Better Auth's 5-minute
signed cookie cache rather than the database. It does **not** bounce a signed-in
user off `/login` — an expired cookie passes the proxy, `requireActor()` sends
it to `/login`, and a bounce would send it straight back. The login page makes
that check itself.

**An upload is three steps, the bytes never touch the server, and the first two
run while the composer is open.** The moment a recording stops (or a screenshot
is cropped), `preupload()` in `offscreen.js` calls `POST /api/v1/reports` (just
`t0`, duration, media type) — which creates the row in `processing` and returns
one presigned PUT per file — and PUTs the media, `logs.json` and `network.json`
straight to the bucket. A video also sends a `poster.webp` (its first frame, ≤640px,
made in the offscreen document with a 3s bound; `sizes.poster` is optional, so old
extensions and failed posters upload without one, and a screenshot never has one) —
the grid shows it as an `<img>` instead of pulling the webm for a frame. Send only calls `POST /api/v1/reports/<id>/complete`
with the title, description and page, which names the row and flips it to
`ready` in one UPDATE. If the background upload failed, Send retries it whole
once. Discard calls `DELETE /api/v1/reports/<id>`. The logs are taken at the end
of the capture, not when Send is pressed. It does **not** HEAD the files or record sizes:
the extension calls it only after every PUT answered 200, and those checks cost
~1s. Create is two plain inserts, not a transaction, for the same reason.

**Every database round trip is the latency budget.** The Supabase project is in
Seoul (`ap-northeast-2`); from a laptop each query is ~150ms, so the dev server
is slow for a reason that production does not share: an upload there is ~4s, most of it Better
Auth's Bearer session lookup (~550ms, several queries) plus the workspace
lookup. `apps/web/vercel.json` pins functions to `icn1` (Seoul) so production
queries are same-region. Move the database, move that line with it; a mismatch
multiplies every page and every upload. **Logs and network are files, not columns**: five minutes of
them does not fit a serverless request body. Only `ready` reports are listed or
shareable. Keys are `<workspace>/<report>/<kind>.<ext>` (`poster.webp` among them). Presigning is a local
HMAC, so signing one URL per row costs nothing.

**A plan is a person's, and its limit is a number on the user row.**
`user.plan` + `user.video_limit` (not Better Auth fields — undeclared on
purpose, so sign-up cannot set them). `lib/plans.ts` holds each plan's default;
`setPlan()` / `pnpm set-plan <email> <plan> [videos]` copies it onto the row,
or sets any number by hand. Only `ready` videos count; screenshots do not.
`createReport()` refuses early (limit, 30 creates/hour, per-file size) and
`completeReport()` re-checks the limit inside its one UPDATE. The size cap is
the exact `Content-Length` signed into each presigned PUT. `/api/v1/me` is the
extension's pre-capture check and fails open; the server is the real gate.
Every refusal carries a `message` for people (and optionally a `path`), which
the extension shows as is — a new rule is a server change, not an extension
release. `X-ReKod-Version` + `MIN_EXTENSION_VERSION` is the kill switch for old
installs. `/api/cron/cleanup` (daily, `CRON_SECRET`) purges `processing` rows
older than a day, with their files.

**The S3 keys and `BETTER_AUTH_SECRET` are the god keys now.** Server env only,
never `NEXT_PUBLIC_`. Supabase's S3 access keys bypass its storage RLS.

**Share links are copyable forever and revocable.** Every report is born with a
`share_token` — a random v4 UUID (122 bits; tokens minted before 1 Oct 2026 are
64 hex and still valid), stored **plain**, not hashed, precisely so the owner
can copy the same link any number of times. "Stop sharing" nulls it; the next
copy mints a new one. **The link carries the token, never the report id**: the
id is time-ordered and cannot be revoked. `/c/<token>` (with DevTools) and
`/v/<token>` (video only) both read through `sharedReport()`, the one unscoped
read: explicit columns, so the workspace, the creator and the token never reach
the page — never widen it to `select *`. The page signs its own media URL per
visit (an hour). `/v/` drops the log pane **and skips fetching the log files**;
it is a render choice on one token, not a second permission — anyone holding a
`/v/` link can type `/c/`. Old `/s/<token>[?view=media]` links redirect. A share
link is read-only: no action accepts a token.

**The grid is paged by id.** `listReports()` returns 16 rows (a full 4×4 first screen) and a `next`
cursor — the last id — and keysets on `id < after`, newest first. Ids are
UUIDv7 minted at create, so id order is creation order; a timestamp cursor
would drop Postgres's microseconds in a JS Date and skip rows. Page one renders
on the server; the rest come through `moreReports()` as the sentinel nears.

**Comments are rows, and `by` is the author's email** — which means every share
link with a comment carries it; a decision, not an oversight. Soft-deleted, and
only by their author.

**Deleting a report deletes its objects first, then the row** — see
`deleteReports()` in `lib/server/reports.ts`. Both orders can orphan a file if
the second half fails; this one never leaves a report you can open and cannot
watch. Hard delete, not soft: a deleted recording should be gone.

## Invariants

**Chrome loads *everything* under the folder you point it at.** That is why the
extension lives in `apps/extension/` and not at the repo root — the root holds
`node_modules` (1.1 GB) and `.env` files. Never put a secret, a lockfile, or a
dependency tree inside `apps/extension/`. Load unpacked from `apps/extension/`,
never from the root.

**The extension is authenticated, but it never signs in.** `auth.js` reads the
dashboard's session cookie via `chrome.cookies` — from the first origin in
`DASH_ORIGINS` that has one (prod, then the dev server), and every origin listed
there needs a matching `host_permissions` entry — and hands the raw value to the
uploader, which sends it as a Bearer to **that same origin**. One session, owned
by the dashboard, no copy in `chrome.storage`. A Better Auth cookie is never
stale: its expiry is the session's, so it is there or gone, and
`fjSessionState()` answers `live` or `none`. `worker.js` still carries the
Supabase-era `stale` renewal (`fjRenew`, a background tab); it is unreachable
now and was left alone on purpose — the extension is next in line for its own
rework (the connect flow and API keys in ROADMAP Phase 1). The bucket's origin
needs a `host_permissions` entry too, or the PUT hits CORS: `*.supabase.co` is
listed for our org's bucket.

**Read cookies with `chrome.cookies.get()`, never `getAll()`.** Measured here on
a live cookie at the dashboard's own origin, with `<all_urls>` granted:
`get({url, name})` returns it, while `getAll({url})`, `getAll({domain})` and
`getAll({name})` all return `[]` — no error, no warning, an empty list that is
indistinguishable from being signed out. The cookie is `SameSite=Lax` and an
extension page is a different site, which is the likeliest reason getAll's
would-this-be-sent filter drops it. Reading the session is reading a cookie,
nothing else — `auth.js` makes no request.

**There is no pre-roll UI.** The extension still buffers the five minutes
before you press record — that is the product — but the viewer stopped
announcing which rows came from it: no toggle, no `REC` tick on the track, no
hatched rows. What remains is the clock, and `stamp()` still writes `−0:12`,
because without the sign that row and the one twelve seconds after record read
identically. Do not re-add the chrome.

**Recordings are silent, and sound is switched off rather than absent.**
`const AUDIO = false` at the top of `apps/extension/offscreen.js` is the whole
control: with it false nothing asks for audio, no graph is built, no `,opus`
reaches the mime string, and every line behaves as it did before audio existed.
Flipping it to true brings back tab audio plus an optional mic — the popup's
mic switch (`<label class="toggle">` in `popup.html` and the commented block in
`popup.js`, which must be uncommented **together**: `popup.js` reads `#mic` at
load) and the mute in `components/report/player.tsx` come back with it. Nothing tests the
dormant path any more (the root test files were removed 27 Sep 2026), so
flipping the flag means checking the audio by hand. Do not delete the flag.

What that dormant code knows, and why it is not obvious: capturing a tab's
audio takes it **away from the speakers**, so the tab source is connected to
`ctx.destination` as well as to the recording. The mic is mixed through a
`MediaStreamDestination` and is **never** connected to `ctx.destination` —
that is a feedback loop. The mic setting lives in `chrome.storage.local.fjMic`,
read by `worker.js`, because the hotkey never opens the popup. And the
permission is granted on `popup.html?mic=1` opened in a **tab**: an offscreen
document has no window to prompt from and a popup is closed by the prompt
taking focus. Do not add a second page for that.

**A screenshot is captured first and cropped second, and that order is the
whole design.** `captureVisibleTab` takes the entire visible tab *before* the
widget shows its selection sheet — the other way round and the dimmed overlay
is in the picture. The sheet is drawn over the live page, sends back a
rectangle in CSS pixels plus `innerWidth`, and `cropShot` scales by
`bitmap.width / vw` rather than `devicePixelRatio`, because page zoom makes
those two disagree. A click with no drag means the whole tab. Escape and a
`pagehide` both discard: the picture belongs to the page it was taken on.

**There are two capture buttons and one `rec`.** The screenshot is back in the
popup (23 Sep 2026, reversing the 29 Aug parking), and the second surface makes
"two captures at once" reachable in one click. `offscreen.js` refuses it, next
to the state it protects: `state?` answers per tab, so a recording in another
tab reads as idle to any caller that asks first.

**`state?` hands back the last state, not a name for it.** A widget is
re-injected on every navigation and asks what is in flight; answering `rec` for
a capture that was really waiting to be written up put a stop button over the
composer — and stopping a screenshot composed a video with no video in it. The
answer is whatever `toTab` last sent, but only while `rec` is set.

**`apps/extension/redact.js` is the ship gate.** It runs before `capture.js` in the
MAIN world. Nothing leaves the tab unredacted. Its tests were removed with the
other root test files on 27 Sep 2026, so a change to it is checked by hand —
record a page with a bearer header and a `password` field and read the report.

**A landed upload opens its own report in a background tab.** `offscreen.js` has no
`chrome.tabs`, so it asks the worker — `{ to: 'bg', t: 'open', origin, path }`.
The origin is the session's — the dashboard the upload went to, so a dev-server
session opens the dev server, where the report actually is — and the worker
accepts it only if it is in `DASH_ORIGINS`, falling back to `DASH`. No message
can open anywhere else. `active: false` — nothing is torn away from whatever
was being reported on. It fires after the insert returns, never before, because
a tab onto a row that was never written is a 404 that reads as data loss.

**In the UI the product is ReKod and the thing is a rekod** (4 Oct 2026,
`REKOD_DESIGN_SYSTEM.md` §0, replacing "Rekod everywhere"): ReKod in prose,
rekod / rekods lowercase mid-sentence, capitalised only to start a label
("Rekods" tab, "Delete rekod"). The wordmark is lowercase "rekod".
`X-ReKod-Version` is protocol, not copy. The code, the database and these notes still say report: the
table is `reports`, the route is `/reports/[id]`, and renaming those buys
nothing. Keep the two apart; do not rename the column.

**Capture runs in every frame; the UI runs in one.** `all_frames` +
`match_about_blank` are on both content scripts, because the socket that matters
is usually opened by a widget in an iframe and each frame has its own
`window.WebSocket` to patch. What that costs is guarded in two places:
`widget.js` renders nothing unless `window.top === window` (subframes only
relay logs, which is the half only an ISOLATED-world script can do), and
`worker.js` addresses tab messages to `{ frameId: 0 }`. Remove either and an
iframe-heavy page grows one pill per frame.

**WebRTC data channels are logged as sockets**, `rtype: 'ws'` with `method:
'RTC'` — the same shape in a report, so no new type and no viewer branch. The
SDP and the ICE candidates are deliberately never captured: they carry the
machine's local and public IP addresses, and a share link is a public URL. The
ICE server list is captured by reading `.urls` and nothing else, because
`username` and `credential` sit beside it and `credential` is **not** in
`redact.js`'s key denylist.

**The capture contract is mirrored, not shared.** `apps/web/src/lib/types.ts`
describes exactly what `apps/extension/capture.js` writes. Change one side and you
must change the other by hand.

## Migrations

Drizzle. `src/lib/db/schema.ts` is the source; `pnpm -C apps/web db:generate`
writes SQL into `src/lib/db/migrations/`, and `db:migrate` applies it to
`DATABASE_URL`. Both are run by hand — the app never runs DDL (Phase 4 adds
migrate-on-boot for Docker). Adding a migration means a new generated file,
never editing an applied one. The Better Auth tables were generated by
`npx @better-auth/cli generate` and moved into the `rekod` schema; regenerate
and diff when adding a Better Auth plugin rather than hand-editing fields.

Ids are UUIDv7 (`lib/db/ids.ts`) and share tokens are random, both minted in
the app rather than by a Postgres default, so the migrations need no extension
and run on any Postgres.

**There is no triage status.** `reports.status` is *upload* state —
processing / ready / failed — not new / triaging / fixed. A share link is
read-only, so triage was a state only its own author ever read. **Warnings are
not stored apart from errors**: one logs file, one `lvl` field.

The old Supabase tables (`public.reports`, its bucket, its policies) were not
migrated and are not read by anything. They are still in that project until
someone drops them.

## Checks

```
pnpm test                        # apps/web: timeline merge, pre-roll signs, and the tenancy test on both adapters
pnpm test:postgres / test:mongo  # one adapter each (PGlite / mongodb-memory-server)
pnpm typecheck                   # runs `next typegen` first — PageProps is generated, a clean tree has none
pnpm lint
pnpm build
```

CI (`.github/workflows/ci.yml`) is one job, one check, on every push and PR:
these four, then `pnpm audit --prod --audit-level=high`. `pnpm test` covers both
adapters. Deliberately simple (8 Oct 2026): no security workflow, no Dependabot. Local Postgres + S3:
`docker compose -f docker-compose.dev.yml up`, then `apps/web/.env.example`.

`test-tenancy.ts` needs neither: given `postgres` it runs the real repo, the real postgres-js
client and the real migrations against PGlite (Postgres in WASM) behind
`@electric-sql/pglite-socket`, with a fake S3 in-process, under
`--conditions=react-server` so `import 'server-only'` resolves. That is also why
`lib/db`, `lib/env`, `lib/storage` and `lib/server` import each other by
**relative path with `.ts`** — node's type stripping does not read tsconfig
paths. PGlite multiplexes connections into one engine, so concurrent queries
from a pool can interleave there; the test is sequential. Real Postgres has no
such problem. Given `mongo` it runs the same assertions against
`mongodb-memory-server`.

`apps/web/` uses **pnpm**; `pnpm dev` serves :3100 (pinned with `-p`, because
`apps/extension/auth.js` lists that origin). `pnpm lint` is clean — no warnings,
no errors. Keep it that way.

## The dashboard streams

Every route under `apps/web/src/app/(dash)/` has a `loading.tsx`, and the segment
shares one error component and one `not-found.tsx`. There is no sidebar: the
64px header (`components/shell/app-header.tsx` — wordmark, the Rekods tab, the
workspace chip, the theme toggle, the account menu) lives in
`(dash)/rekod/layout.tsx`, not `(dash)/layout.tsx`: **the report page has no
app header** — it has its own bar, and the DevTools pane holds the viewport
height. `rekod/error.tsx` re-exports the shared one so an error on the list keeps
the header. A page is a **static shell plus
a Suspense'd async child** — never an `async` component that awaits before
returning its layout, which blocks first paint on a database round trip. The
skeletons live together in `components/skeletons.tsx` so they stay the same
shape as what replaces them; `loading.tsx` and the in-page fallback share the
same one.

Reads on this side go through `cache()`d functions (`currentActor`, `getReport`) so a layout and a page asking for the same rows make one query.
Mutations are server actions in `(dash)/actions.ts`; each re-derives the actor
and validates its input, because an action is a public POST endpoint. When two children need the same rows, pass
them one *promise* rather than fetching twice.

**There is one list.** `/rekod` (`app/(dash)/rekod/`) is the grid of recordings,
filtered by search params; there is no separate inbox route. **The card carries
no error count and there is no `Has errors` filter** — both deleted 23 Sep 2026,
which is also why the grid no longer selects `error_count` / `failed_count`. A
count on a card nobody has opened is a verdict, and a wrong one: the counts live
in the log pane of the report, next to the rows they count. **A card's first line is
its title, or the site when there is none** — both of the extension's compose
inputs are optional, and a card with no text under its thumbnail broke the
grid's rhythm (1 Oct 2026, reversing "no line at all"). Never a placeholder
like "Untitled". A title is filled in later on the report page, where it and
the description are edited in place — above the player (`heading` on
`ReportView`), at `h1` size, never display size, in the scrolling left
column, with the DevTools pane (`components/report/devtools-pane.tsx`) holding the full viewport
height on the right. `ReportView` takes that column's
contents as `children`, so the owner's page passes editable fields and the
share page passes the same thing flat and read-only. The header above it is a
bar with nothing but the way back ("All rekods" — no wordmark), the ⋯ menu
(delete) and the Share button:
**the page, the project, the clock and the machine all live in the DevTools
pane's `Info` tab**, which leaves out a row that was not captured rather than
dashing it,
which is the first tab and the default. Do not re-add any of them to the
header — one place to look was the point. Search covers `title` and
`description`, not just the title, and treats `%` and `_` literally.

A failed query `throw`s; it does not render its own error card. `error.tsx`
owns that, including the missing-migration hint, which matches Postgres's
"does not exist".

**A not-found report still answers 200.** `loading.tsx` streams the shell, so
the status is committed before `notFound()` runs; the body is the not-found
page. That was true before the rebuild too. Test for the content, not the code.

**A screenshot report renders no transport.** `ReportView` hides the play
button, the scrubber and the clock when `media.kind !== 'video'`: there is no
playhead to move on a still image. The log pane is unchanged.

**The recording has no duration until the player asks for it.** `offscreen.js`
pipes MediaRecorder chunks straight into a Blob, so the webm carries no duration
in its header and Chrome reports `Infinity` — and paints the scrubber pinned to
the far right, which read as "already finished". `components/report/player.tsx` probes for it
(`currentTime = 1e101`, then `durationchange` puts it back at 0) and ignores
`timeupdate` while the probe is in flight. Fixing it in the extension instead
would need a bundler in `apps/extension/`, and would leave every recording already in
the bucket unplayable. There is ONE transport, the custom one: the native
`controls` scrubbed only the video while the track spans the rolling buffer too,
and the two disagreed about where the start is.

**`REKOD_DESIGN_SYSTEM.md` is the UI's authority** (v1.2, 4 Oct 2026). Midnight
ink, electric-blue primary, pink for highlight, Inter Tight + IBM Plex Mono,
radius 0, no shadows, no gradients in the app (only the login welcome panel and
the popup's top band), no outer frame, no display-size titles, a text-only
wordmark. Its tokens are copied verbatim into `src/styles/tokens.css` (the only
file with hex, with `marketing.css`); `globals.css` maps shadcn's colours onto
them and zeroes every radius and shadow utility in `@theme`. Two spec names
collide with shadcn's: the spec's text `--muted` is Tailwind's
`text-muted-foreground`, and the spec's pink `--accent` is `bg-pink` /
`text-pink` (Tailwind's `accent` stays the neutral menu hover). Focus is one
global `:focus-visible` outline in `globals.css`, not per-component rings.

**Light and dark both ship.** `ThemeProvider` follows the system with
`attribute="data-theme"`, and `ThemeToggle` (38×38, in the header) stores an
override per browser. `tokens.css` also keys dark on `prefers-color-scheme`
for the moment before next-themes runs.

The extension's `popup.html` and `widget.js` carry the same token values by
hand. **The on-page pill and the crop tip are `--chrome` midnight on
purpose** — they sit on somebody else's page and have to read as an
instrument against any background. The widget loads no webfont (host CSP).

Components are grouped by surface: `components/report/` (the report page),
`components/home/` (the grid and its filters), `components/shell/` (header,
frame, brand, workspace switcher, account menu), `components/theme/`; `skeletons.tsx` stays at the
root because it mirrors all of them.

`components/ui/` is shadcn (`base-nova` style, Base UI underneath, so the slot
prop is `render`, not `asChild`). Compose those primitives — do not hand-roll a
nav or a raw `<button>`. The primitives were restyled in place (button
variants per §6.4 incl. `destructive-solid` for confirm dialogs, 38px inputs,
no zoom/slide entrances); re-running `shadcn add` on one reverts it. `components/ui/combobox.tsx` is
hand-restyled the same way — never `shadcn add combobox`.

## Next.js 16 is not the Next.js you know

`apps/web/AGENTS.md` is auto-written by `next dev` and says so. The authoritative
docs ship in `apps/web/node_modules/next/dist/docs/` — 452 files. Read those
rather than recalling Next 14/15 conventions. Notably: `middleware.ts` is now
`proxy.ts` and exports `proxy`.
