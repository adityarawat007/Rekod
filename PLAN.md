# FlamJam — build plan

Drafted 22 Aug 2026. Original as a design doc:
https://claude.ai/code/artifact/35695f6f-cfa6-4ea8-b148-dca6508da56d
Status column updated 29 Aug 2026.

One-shortcut bug reporter for the Flam team. Hit `Alt+Shift+J`, describe the
bug, and the engineer gets video, console, every network call, and the device
profile — already correlated on one timeline.

| | |
|---|---|
| Surface | Chrome extension, MV3 — loaded from `extension/`, not the repo root |
| Backend | Supabase, one table |
| Access | One account per person. Email + password. Your reports, nobody else's |
| v1 target | 2 weeks, 1 engineer |

**The bet:** there is almost no hard technology here. Every headline
capability is a browser API called directly — `getDisplayMedia` +
`MediaRecorder`, a `console[level]` patch, a `fetch`/XHR patch,
`captureVisibleTab`, `WEBGL_debug_renderer_info`. The work is product design
and plumbing, which is why one person can ship it in a fortnight.

## Build order — where we are

| Step | Scope | Status |
|---|---|---|
| 01 Capture core | MV3 skeleton, MAIN-world content script, console + fetch patches, ring buffer | **Done.** `capture.js`; WebSocket frames captured too (beyond plan) |
| 02 Storage round-trip | Supabase project, SSO domain-lock, one table with RLS, presigned upload | **Done, model changed twice.** `schema.sql`; auth landed 28 Aug. Domain lock → allowlist → single-user, 29 Aug (`schema-single-user.sql`) — see below |
| 03 Viewer + sync | report page, video + log panel, `t0` arithmetic, scrubber markers | **Done.** `viewer.js` shipped the interim (zero deps, :5173) and was retired 29 Aug once `viewer/` (:3100) replaced it |
| 04 Widget polish | three states, hotkey, screenshot mode, live counters, empty states | **Done.** Reworked from the floating/draggable pill to popup buttons + on-page pill after visibility bugs |
| 05 Redaction pass | denylist, token patterns, visible "redacted" confirmation | **Done.** `redact.js`, `✓ redacted` in the composer, `test-redact.js`. Plus the 22P05 NUL / lone-surrogate fix |
| 06 Inbox, then dogfood | list view with filters, then five people use it for a week | **Filters done** in `viewer/` — search, status, project, range, Has failures, plus status triage. **Dogfood week blocked by decision**: single-user means there is nothing to dogfood together until sharing returns — now designed, see *Share links* |

Shipped outside the plan: the Jam-style dashboard (console/network tabs,
pretty-printed coloured JSON, request/response panes), the
and the `◂ Before recording` toggle for pre-buffer rows.

**Next:** run the three migrations (see `viewer/README.md`), sign up, sign the
extension in, and use it solo end to end. Sharing and Google sign-in come back
only once that loop is boring.

## Tier 1 — ship it (weeks 1–2, the actual product)

- **One-shortcut capture** — global hotkey, widget, pick screenshot or
  recording, add a sentence, send. Never more than three interactions.
- **Screen recording** — tab or window, hard-capped at 3 minutes. AV1 where
  supported, VP9 otherwise. Optional mic.
- **Retroactive console** — a rolling 5-minute buffer from page load, so the
  report contains errors from before anyone thought to press record.
  *The killer feature.*
- **Network log with bodies** — method, URL, status, duration, request and
  response payloads. 100 KB cap, JSON/text only.
- **Device & build profile** — browser, OS, viewport, DPR, GPU renderer,
  build SHA off a `<meta>` tag.
- **Timeline correlation** — click a log line, the video jumps there; scrub
  the video, the log follows. One `t0` stamp and ~20 lines of arithmetic.
  *The magic trick.*
- **Share link** — every report is a URL that renders without the extension.
  **Done 29 Aug 2026**, see *Share links* below.
- **Redaction by default** — auth headers, cookies, tokens and denylisted
  fields stripped in the content script, before the payload leaves the tab.
  *Non-negotiable.*

## Tier 2 — once people use it (weeks 3–5, earned by demand)

- **Pre-roll video** — the hard one: WebM can't be sliced without its header,
  so it needs two rotating recorders. Build only if people ask.
- **Repro steps** — passive listeners log clicks, inputs, route changes as a
  readable step list.
- **Annotate & comment** — arrows on the screenshot, comment threads on the
  report so triage happens in place.
- **Inbox & search** — filter by reporter, project, status, error text.
  Full-text search across console output.
- **Linear · Jira · Slack** — one click files the ticket with the report
  embedded.
- **Source-mapped stacks** — resolve minified traces against uploaded maps.

## Tier 3 — if it becomes load-bearing (later, not a commitment)

AI root-cause draft (label it a guess or it misleads someone) · WebGL and
device capture for our AR/3D surfaces, where our worst bugs live · mobile
webview reports from an in-app SDK on the same JSON contract · Sentry
cross-link.

## Interface — three surfaces, nothing else

Jam's real insight isn't the capture — it's that reporting a bug never feels
like filing a ticket. Bright, chunky, one obvious action per screen. If a
surface needs a tour, it's wrong.

1. **Capture widget** — injected overlay. Three states: idle, recording,
   composing. Live error and request counters always visible, so people learn
   the tool is watching before they ever press record.
2. **Report viewer** — video left, evidence right, one shared timeline.
   Coloured markers on the scrubber show where errors, warnings and failed
   requests landed.
3. **Home grid** — deliberately boring. Cards with a video frame, three status
   chips, filters that match how we actually triage. It is the only list; see
   the 29 Aug amendment below.

**Amended 28 Aug 2026.** The plan said "no dashboard, no charts, no metrics
nobody asked for" and asked for a flat inbox. Superseded by decision: the
`viewer/` app is a sidebar-shell dashboard with a KPI row, a 14-day trend, and a
by-project breakdown. The surviving discipline is that every tile and bar is a
link into a filtered inbox — no metric exists purely to be looked at.

**Amended again 29 Aug 2026 — the original plan was right.** The KPI row, the
trend and the by-project bars are deleted (`stat-tile.tsx`, `reports-trend.tsx`,
`project-bars.tsx`, `lib/trend.ts`, `lib/summary.ts`), and with them the
separate `/reports` route: it listed the same rows the dashboard already showed,
so two screens were doing one job. `/` is now the grid of recordings and the
only list. The filters survived because they are how the sidebar navigates.

Thumbnails are a frame pulled from the video itself — `preload="metadata"` and
a `#t=` fragment, no stored poster — which is why the grid caps at 60 rows
rather than 200: each card is a range request. The upgrade, when 60 is not
enough, is to grab a frame to canvas in `offscreen.js` at record time and upload
a real poster next to the video.

**Design system.** Two additions from building the dashboard: **Zest is never
a chart mark** (L 0.85 fails the lightness band; 1.55:1 on paper — UI accent
only), and **dark chart steps are re-stepped, not flipped** (`#F2385C` /
`#8B5CF6` / `#0FA372`). Both palettes were validated, not eyeballed.

Jam `#FF2D55` (one primary action per surface — if two
things are Jam-coloured, one is wrong), Zest `#FFC400`, Grape `#5B21F0`, Ink
`#1A1420`, Paper `#FFFBF5`. Severity colour is a separate language and never
borrows the accent. Bricolage Grotesque 800 for display, Instrument Sans for
body, JetBrains Mono with tabular figures wherever timestamps or counts sit in
a column. Two radii only: 100px pills, 8px panels. The recording dot pulses;
nothing else animates beyond a 120ms hover. Every empty state teaches the
shortcut — it's the only onboarding we will write.

## Limits, and why

Each number has a stated reason. Change it when the reason stops holding, not
because a bigger number sounds more generous.

| Limit | Value | Reason |
|---|---|---|
| Video length | 3 min, warn at 2:30 | Repros run 20–40s. At ten minutes the chunk array holds ~75 MB and low-end Android webviews crash. The cap is a feature. |
| Resolution | 1280px max width | Biggest file-size win, text stays legible. A 2880-wide retina capture is 4× the pixels carrying no extra information. |
| Frame rate | 10 fps | UI bugs contain almost no motion. |
| Encoding | 600 kbps, AV1 → VP9 | Browser-native, real time, free. `contentHint = 'detail'` stops the codec treating rendered text as film grain. |
| Video size | ~9–13 MB typical | Supabase caps uploads at 50 MB by default; the 3-min ceiling keeps every report under it with no config. |
| Log buffer | 5 min rolling, 5,000 max | Must exceed the video cap or the report loses the errors it was opened for. Count-only overflows in seconds against a render loop. |
| Response bodies | 100 KB, JSON/text only | Stops a media response being held in memory twice. Binary is unreadable in a report anyway. **Amended 29 Aug 2026:** the cap is now enforced by the read itself, not by slicing afterwards. `content-length` is absent on every chunked response, so the old gate passed and `.text()` read the whole stream — on `text/event-stream` it never returned, and the page's own `fetch()` never resolved. There is a 2s deadline on our copy for the same reason. |
| Screenshot | ~200 KB PNG | ~~The default action, not the fallback.~~ **Amended 29 Aug 2026:** the button is out of the popup — recording only, while the record→share loop is the thing being proven. The capture path is parked, not deleted (`worker.js` still routes `shot`, the viewer still renders existing screenshot reports), so it is one `<button>` to bring back. |
| Upload retry | once, then fail loudly | 13 MB doesn't need resumable uploads. Keep the blob in memory so the reporter can resend instead of re-recording. |
| Retention | 90 days, nightly cron | Supabase has no S3 lifecycle rules, so it's a `pg_cron` job. Date-prefixed paths make the sweep one list + remove. |

Where the size goes, same three minutes: 1440×900 · 15fps · 1 Mbps VP9 →
~22 MB (the first draft) · 1280 wide · 10fps · 600 kbps + hint → ~13 MB, often
sharper because nothing is downscaled twice · same with AV1 → ~8–9 MB.

## Decisions

**Skipped on purpose**

- **DOM session replay (rrweb).** Video is an order of magnitude lazier and
  good enough for internal repro. Revisit only if video misses something real.
- **`chrome.debugger` / CDP capture.** Fuller response bodies, but it paints a
  "DevTools is debugging this tab" banner and breaks when real DevTools opens.
  The fetch patch wins.
- **A client-side video compressor.** `MediaRecorder` already is the
  compressor. Shipping ~30 MB of ffmpeg.wasm to slowly re-encode a 13 MB file
  and lose quality is the worst trade available. Tune the encoder instead.
- **Job queue and workers.** Uploads go straight to storage from the client.
- **Roles, permissions, projects UI.** ~~Domain-locked SSO~~ ~~a `team_members`
  allowlist~~ plus a hostname-inferred project label covers a team our size.

  **Amended 29 Aug 2026.** Collapsed to single-user. No team, no allowlist, no
  invitations, no reporter field — every report carries an `owner` and every
  policy is `owner = auth.uid()` (`schema-single-user.sql`). The allowlist is
  deleted rather than disabled: bringing sharing back means an owner→team join
  and membership-following policies, which is a deliberate design, not a flag.

  The load-bearing consequence: **the extension no longer files as `anon`.**
  "Every report belongs to the signed-in user" and "anonymous clients may
  insert" cannot both hold. The popup signs in (`extension/auth.js`), and the session is
  refreshed before each upload. This also fixes the risk below by construction —
  a capture that catches someone's inbox is now visible only to the person who
  took it.

  Google sign-in is deferred, not designed out: `/auth/callback` still exchanges
  a code and the seam is marked in `sign-in.tsx`. The extension popup cannot host
  a redirect, so it will need `chrome.identity.launchWebAuthFlow`.
- **A server-side god key in the dashboard.** `viewer.js` read with
  `service_role` because it had no login. The Next.js app has one, so it uses
  the anon key and lets RLS do the work — including for signed video URLs.

**Deferred, with a trigger**

Pre-roll video → when someone asks for footage from before they pressed
record. Ticket integrations → when pasting share links becomes the complaint.
Separate log tables → when full-text search across jsonb gets slow. AI
diagnosis → when reading reports is the bottleneck. Mobile SDK → when webview
bugs outnumber browser bugs.

## Share links — designed and built 29 Aug 2026

Built as designed. `schema-share.sql`, `public.shared_report(uuid)`,
`/s/[token]`, and the Share popover in `report-header.tsx`. This answers the
open question below: sharing comes back as a **public link to one report**, and
nothing else. No accounts, no membership, no cross-account
reads. That distinction is the whole point — what `schema-single-user.sql`
deleted was the team model, and this does not bring it back.

**The constraint that shapes the design.** Two existing rules decide this
before any product thinking does:

- `revoke all on reports from anon` — an anonymous visitor has *zero* table access.
- No `service_role` key, ever. So the share page cannot read the row as admin.

And storage objects are readable only where
`(storage.foldername(name))[1] = auth.uid()`. An anonymous visitor cannot sign
a media URL. That is the actual problem; the rest is assembly.

**Shape: a token on the row, a pre-signed URL beside it.**

| Piece | What it is |
|---|---|
| `schema-share.sql` | Fourth migration. `share_token uuid` + `share_url text`, partial unique index on the token, and the column grant widened to `update (status, share_token, share_url)` |
| `public.shared_report(token uuid)` | The only thing `anon` may call. `security definer`, `set search_path = ''`, exact match on the token. Returns the report **without** `owner` or `share_token` |
| `share_url` | A signed storage URL created by the **owner** at share time, when a session that satisfies the storage policy still exists. Stored on the row |
| `/s/[token]` | Public page outside `(dash)` — no sidebar, no `StatusSelect`. Reuses `ReportView` unchanged |

`share_token is null` means private. Sharing sets it; revoking nulls it.

**Why the URL is stored rather than signed on demand.** The share page runs as
`anon`, so it cannot sign anything. The owner can. Two client calls, in order:
`createSignedUrl(video_path, 31536000)`, then `update reports set share_token,
share_url`. **Storage RLS is not touched at all** — no anon policy, no new
surface.

Rejected alternative: an anon storage policy for objects whose report is
shared. It works, but it lets anyone *list* the set of shared objects. Storing
one URL is both lazier and tighter.

**The RPC is the security boundary, so:** revoke `execute` from `public` before
granting to `anon` — Postgres grants `EXECUTE` to `PUBLIC` on every new
function, which would otherwise make this a public endpoint by accident. Never
return `owner`. Never match on anything but the full token. A v4 UUID is 122
bits, so enumeration is not the threat; a leaked function definition is.

**Trade-off, stated plainly: revoking kills the page, not the video.** Nulling
`share_token` makes `/s/<token>` 404 immediately, but the signed media URL keeps
working until it expires, and anyone who saved the raw `.webm` link keeps it.
Shipping without a fix for this is deliberate. If true revocation is ever
needed, the lever is renaming the storage object — a signed URL is bound to its
path, so a `move` invalidates it. That is an upgrade, not a rewrite.

**Two things easy to forget.** `proxy.ts` must add `/s` to its open paths or
every share link bounces to `/login`. And the share page needs
`robots: { index: false }` — nobody wants customer bug reports in Google.

**What shipped:** the migration, the RPC, `/s/[token]` with its own
`loading`/`error`/`not-found` (the dashboard's error page is worse than useless
to a recipient — its "back to inbox" link bounces them to `/login`), `noindex`
plus OG tags, the `/s/` proxy allowlist, and a Share popover with copy and
revoke. The token is validated against a UUID shape before any database call,
so a junk token costs nothing and never reaches the `uuid` parameter as a 22P02.

**`CLAUDE.md` was amended in the same commit**, as required — its invariant
said "there is no sharing", which would have taught the next reader to delete
this.

## The one real risk

This tool records colleagues' screens and their API traffic. A single capture
on the wrong tab can carry session tokens, customer data, or someone's
personal inbox into a shared link.

- **Redaction ships in v1 or the tool doesn't ship.** Strip auth headers,
  cookies and denylisted fields in the content script, before upload — not
  server-side, not later.
- **Make capture visible.** A pulsing indicator while recording, and an
  explicit list of what's attached before send. Nobody should ever be
  surprised by what a report contained.

## Open questions

- **Name.** FlamJam is a placeholder — it works, but it's derivative.
- **Retention.** 90 days proposed. Videos accumulate fast; old ones are never
  read.
- **Scope of install.** All of engineering, or design and QA too? Argues for
  screenshot mode as the low-friction default.
- **Reports filed before `schema-single-user.sql` have a null `owner`** and are
  invisible to everyone. Adopt them into one account with an `update`, or let
  them age out at 90 days?
- ~~**When does sharing come back, and in what shape?**~~ **Answered
  29 Aug 2026** — see *Share links* above. A public link to one report, via a
  token on the row and a `security definer` RPC. Still open underneath it:
  whether a shared link should ever expire on a clock, or only on revoke.
- **Staging only, or production?** Production capture is where the value is,
  and also where the PII is. Needs a call before rollout.
