# ReKod

A Chrome extension (MV3) that records a tab with the last 5 minutes of console
and network already captured, and a Next.js dashboard that plays it back on one
timeline. Backend is Supabase — one table, one bucket, RLS.

Read [`PLAN.md`](PLAN.md) for what is built and what was deliberately skipped.
Every "skipped" entry has a stated reason; check it before proposing the thing.

## Two packages, not a monorepo

| | |
|---|---|
| [`extension/`](extension/) | Vanilla JS, MV3. **No build step — the source is what ships.** No `package.json`, no dependencies. |
| [`viewer/`](viewer/) | Next.js 16 + React 19 + Tailwind 4. The only thing with dependencies. |

They share no code and cannot: the extension has no bundler, so it cannot
import from `viewer/`. Workspace tooling would manage exactly one package.
Reconsider only if the extension grows a build step.

## Invariants

**Chrome loads *everything* under the folder you point it at.** That is why the
extension lives in `extension/` and not at the repo root — the root holds
`viewer/node_modules` (1.1 GB) and, historically, a `service_role` key. Never
put a secret, a lockfile, or a dependency tree inside `extension/`. Load
unpacked from `extension/`, never from the root.

**No `service_role` key anywhere.** The extension and the dashboard both use the
publishable key plus a real user session and let RLS decide. If a task seems to
need the god key, the RLS policy is wrong — fix that instead.

**Single-user, plus public share links.** One account, its own reports. Every
`reports` row has an `owner` and every policy is `owner = auth.uid()`. There is
no team, no allowlist, no membership, and no reporter field — removed on
purpose, not hidden (see the 29 Aug amendment in `PLAN.md`).

Sharing is *not* the team model returning. **Every report now carries a
`share_token` from birth** (`schema-share-default.sql` defaults the column) and
is readable at `/s/<token>` by anyone holding it, through exactly one
`security definer` function — `public.shared_report(uuid)`, the whole anonymous
surface. `anon` still has no grant on `reports` and storage RLS is untouched:
the recipient plays a URL the **owner** signed at share time and stored in
`share_url` — signed the first time the link is copied, because only a session
that satisfies the storage policy can sign one. `?view=media` on that URL drops
the log pane; it is a render flag on the same page, not a second permission.
**There is no revoke.** The control is gone, deliberately; `update reports set
share_token = null` in the SQL editor is the only way back to private.
Widening the function is the entire risk; its explicit column
list is what keeps `owner` and `share_token` from leaking, so never make it
`select *`.

**Comments are the owner's, and a share link is still read-only.** A report
carries a `description` (one editable field) and `comments` (an append-only
jsonb array, `{id, body, at, by}`). Both ride inside `shared_report`, so a
recipient reads the thread and cannot post to it — `anon` has no write grant
and gets no second function. `by` is the owner's email, which means every share
link carries it; that was a decision, not an oversight. There is no comments
table: one thread, one report, one writer.

**The extension is authenticated, but it never signs in.** It cannot file as
`anon`. `extension/auth.js` reads the dashboard's `sb-*-auth-token` cookie via
`chrome.cookies` — from the first origin in `DASH_ORIGINS` that has a live one
(prod, then the dev server), and every origin listed there needs a matching
`host_permissions` entry. One session, owned by the dashboard, no copy in
`chrome.storage`.

**No live token is two states, not one, and `fjSessionState()` is what tells
them apart.** A Supabase access token lasts an hour and only the dashboard may
refresh it, so an hour after the last dashboard visit a fully signed-in user has
a *stale* cookie: aged-out access token, refresh token good for weeks. That is
not signed out, and the popup must not say it is — `stale` reads "needs a
refresh" and opens `/`, `none` reads "not signed in" and opens `/login`. A
cookie that is present but unparseable is `stale` too: that is `@supabase/ssr`
caught mid-write. `fjSession()` still returns only the live session, because
every uploader wants exactly that.

**The extension makes no network request of its own, and that is load-bearing.**
Not `/auth/v1/token` (two refreshers race Supabase's reuse detection), and not a
GET of the dashboard to make *it* refresh either: `proxy.ts` answers any
refresh-token error by deleting every `sb-*` cookie, and an extension-initiated
fetch applies that `Set-Cookie` — so a "harmless" poke signs the user out for
real. `test-auth.js` passes a `fetch` that throws, to keep it that way.

**A background tab is not that, and `fjRenew()` in `worker.js` is the one
sanctioned way to renew.** It opens the stale origin with
`chrome.tabs.create({ active: false })`, waits for `status === 'complete'`, reads
the cookie again and closes the tab. The distinction is the whole point: a real
navigation is precisely the case `proxy.ts`'s cookie deletion exists for, so if
the refresh token genuinely is spent, landing on `/login` and clearing the
cookie is the *correct* outcome — the popup then says "not signed in", which is
by then true. One renewal at a time (`renewing`), because the popup and an
in-flight upload can both ask at once and two tabs would be two refreshes of one
token. Renewal is routed through `fjLiveSession()`, which every caller reaches
by asking the worker for `{ to: 'bg', t: 'session' }` — so the popup and the
uploader share one implementation. A `none` session is never renewed: there is
no refresh token to spend.

**Read cookies with `chrome.cookies.get()`, never `getAll()`.** Measured here on
a live cookie at the dashboard's own origin, with `<all_urls>` granted:
`get({url, name})` returns it, while `getAll({url})`, `getAll({domain})` and
`getAll({name})` all return `[]` — no error, no warning, an empty list that is
indistinguishable from being signed out. The cookie is `SameSite=Lax` and an
extension page is a different site, which is the likeliest reason getAll's
would-this-be-sent filter drops it. `@supabase/ssr`'s own get-based adapter
works the same way, chunk "hints" included. The cost is that `get()` needs the
exact name, so every chunk is another call. `test-auth.js` stubs `get` and
leaves `getAll` undefined, so going back to it throws.

`fjRawAt()` also mirrors `combineChunks` by hand: an unchunked cookie wins
outright, otherwise `.0`, `.1`, … in NUMERIC order, stopping at the first gap.
Joining a leftover unchunked cookie onto the chunks decodes to garbage, which
the parser reports as an expired session.

**There is no pre-roll UI.** The extension still buffers the five minutes
before you press record — that is the product — but the viewer stopped
announcing which rows came from it: no toggle, no `REC` tick on the track, no
hatched rows. What remains is the clock, and `stamp()` still writes `−0:12`,
because without the sign that row and the one twelve seconds after record read
identically. Do not re-add the chrome.

**Recordings are silent, and sound is switched off rather than absent.**
`const AUDIO = false` at the top of `extension/offscreen.js` is the whole
control: with it false nothing asks for audio, no graph is built, no `,opus`
reaches the mime string, and every line behaves as it did before audio existed.
Flipping it to true brings back tab audio plus an optional mic — the popup's
mic switch (`<label class="toggle">` in `popup.html` and the commented block in
`popup.js`, which must be uncommented **together**: `popup.js` reads `#mic` at
load) and the mute in `report-view.tsx` come back with it. `test-capture.js`
runs the audio assertions against a copy of the file with the flag flipped, so
the dormant path stays checked; it also asserts the shipped state asks for no
audio at all. Do not delete the flag or the test flips silently stop testing
anything.

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

**`extension/redact.js` is the ship gate.** It runs before `capture.js` in the
MAIN world. Nothing leaves the tab unredacted. Changing it means running
`node test-redact.js`.

**A landed upload opens its own report in a background tab.** `offscreen.js` has no
`chrome.tabs`, so it asks the worker — `{ to: 'bg', t: 'open', path }` — and
only the path travels: the origin is `DASH`, from `auth.js`, so no message can
name where a tab opens. `active: false` — nothing is torn away from whatever
was being reported on. It fires after the insert returns, never before, because
a tab onto a row that was never written is a 404 that reads as data loss.

**In the UI the thing is called a ReKod.** Every user-facing label — the grid,
the sidebar, the delete and share controls, the extension's composer — says
ReKod / ReKods. The code, the database and these notes still say report: the
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

**The capture contract is mirrored, not shared.** `viewer/src/lib/types.ts`
describes exactly what `extension/capture.js` writes. Change one side and you
must change the other by hand.

## Migrations

SQL is applied by hand in the Supabase console; the app never runs DDL. Order
matters and all three are re-runnable:

`schema.sql` → `schema-dashboard.sql` → `schema-single-user.sql` →
`schema-share.sql` → `schema-drop-status.sql` → `schema-comments.sql` →
`schema-share-default.sql` → `schema-delete-media.sql` →
`schema-error-count-warn.sql`

The third supersedes parts of the first two; the fourth only adds; the fifth
only removes; the sixth adds `description` and `comments` and re-creates
`shared_report` around them; the seventh gives `share_token` a default; the
eighth lets an owner delete their own storage objects; the ninth folds
`lvl = "warn"` into `error_count`, because the viewer counts a warning as an
error and the card reads that column. **Warnings are not stored apart from
errors** — they never were: one `logs` array, one `lvl` field, and now one
count. There is no warn column to drop. **There is no triage status.** Reports are not handed to anyone —
single-user killed the team and a share link is read-only — so "new / triaging /
fixed" was a state only its own author ever read. The column, its grant, the
chip, the select and the filter are deleted, not hidden. Adding a migration means a new
file, never editing an applied one.

## Checks

```
node test-redact.js              # the ship gate
node test-auth.js                # the session gate: live / stale+poke / dead
node test-capture.js             # silent by default, the dormant audio graph, one capture at a time
cd viewer && npm test            # timeline merge, pre-roll signs, timeline uids
cd viewer && npm run typecheck
cd viewer && npm run build
```

`viewer/` uses **pnpm**; `pnpm dev` serves :3100 (pinned with `-p`, because
`extension/auth.js` lists that origin). The two `NEXT_PUBLIC_SUPABASE_*` values
come from `lib/supabase/env.ts`, which throws a named error when they are
missing — never read `process.env` for them directly, or a missing var becomes a
blank 500 from `proxy.ts` on every route, static ones included. `npm run lint` is clean — no warnings, no
errors. Keep it that way.

## The dashboard streams

Every route under `viewer/src/app/(dash)/` has a `loading.tsx`, and the segment
shares one `error.tsx` and one `not-found.tsx`. A page is a **static shell plus
a Suspense'd async child** — never an `async` component that awaits before
returning its layout, which blocks first paint on a database round trip. The
skeletons live together in `components/skeletons.tsx` so they stay the same
shape as what replaces them; `loading.tsx` and the in-page fallback share the
same one.

Supabase reads on this side go through `cache()`d functions
(`supabaseServer`, `navData`, `getReport`) so a layout and a page asking for the
same rows make one query. Pass a *promise* to two children rather than fetching
twice — see `(dash)/page.tsx`, where the count and the grid share one.

**There is one list, and it is the home page.** `/` is the grid of recordings,
filtered by search params; there is no separate inbox route. **The card carries
no error count and there is no `Has errors` filter** — both deleted 23 Sep 2026,
which is also why the grid no longer selects `error_count` / `failed_count`. A
count on a card nobody has opened is a verdict, and a wrong one: the counts live
in the log pane of the report, next to the rows they count. **The card shows
its title only when the report has one** — both of the extension's compose
inputs are optional, so an untitled card renders no placeholder line at all. A
title is filled in later on the report page, where it and the description are
edited in place — under the player, in the scrolling left column, with the log pane
holding the full viewport height on the right. `ReportView` takes that column's
contents as `children`, so the owner's page passes editable fields and the
share page passes the same thing flat and read-only. The header above it is a
bar with nothing but the way back and the Share button: **the page, the
project, the clock and the machine all live in the log pane's `Info` tab**,
which is the first tab and the default. Do not re-add any of them to the
header — one place to look was the point. Search therefore covers `title` and `description`, not just the title. Thumbnails come
from `lib/previews.ts`, which signs every path in the page with ONE
`createSignedUrls` call — never one per row.

**Deleting a report deletes its object first, then the row** — see
`components/delete-reports.tsx`. Both orders can orphan a `.webm` if the second
half fails; this one never leaves a report you can open and cannot watch. There
is no trigger and no cascade: a database trigger cannot call the storage API,
and touching `storage.objects` from SQL would bypass the policy that makes this
safe.

A failed query `throw`s; it does not render its own error card. `error.tsx`
owns that, including the missing-migration hint — which matches PostgREST's
"does not exist" rather than one column name, because the column it used to
sniff for is no longer selected by anything.

**A screenshot report renders no transport.** `ReportView` hides the play
button, the scrubber and the clock when `media.kind !== 'video'`: there is no
playhead to move on a still image. The log pane is unchanged.

**The recording has no duration until the player asks for it.** `offscreen.js`
pipes MediaRecorder chunks straight into a Blob, so the webm carries no duration
in its header and Chrome reports `Infinity` — and paints the scrubber pinned to
the far right, which read as "already finished". `report-view.tsx` probes for it
(`currentTime = 1e101`, then `durationchange` puts it back at 0) and ignores
`timeupdate` while the probe is in flight. Fixing it in the extension instead
would need a bundler in `extension/`, and would leave every recording already in
the bucket unplayable. There is ONE transport, the custom one: the native
`controls` scrubbed only the video while the track spans the rolling buffer too,
and the two disagreed about where the start is.

**`proxy.ts` uses `getClaims()`, never `getUser()`.** It runs on every request,
RSC navigations included; `getUser()` is a ~370ms round trip to the auth server
each time and was the real cause of sluggish routing. The project signs with
ES256, so `getClaims()` verifies locally against a module-cached JWKS. Same
guarantee — a forged or expired token fails verification. Applies to
`navData()` too, and to anything else that runs per request.

**The dashboard is light only, for now.** `ThemeProvider` passes
`forcedTheme="light"`; the `.dark` block in `globals.css` and
`theme-toggle.tsx` are both still there and both inert, and `<ThemeToggle />`
is commented out in `app-sidebar.tsx` rather than deleted. Dark comes back by
dropping the prop and uncommenting that one line — the dark palette was
validated rather than eyeballed (see `PLAN.md`), so re-deriving it is the
expensive part, not re-enabling it. The extension's composer card is light for
the same reason; **the on-page pill and the crop tip stay near-black on
purpose** — they sit on somebody else's page and have to read as an instrument
against any background.

`components/ui/` is shadcn (`base-nova` style, Base UI underneath, so the slot
prop is `render`, not `asChild`). Compose those primitives — do not hand-roll a
nav or a raw `<button>`. `hooks/use-mobile.ts` is edited from shadcn's version;
re-running `shadcn add sidebar` reverts it.

## Next.js 16 is not the Next.js you know

`viewer/AGENTS.md` is auto-written by `next dev` and says so. The authoritative
docs ship in `viewer/node_modules/next/dist/docs/` — 452 files. Read those
rather than recalling Next 14/15 conventions. Notably: `middleware.ts` is now
`proxy.ts` and exports `proxy`.
