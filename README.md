# FlamJam

Personal bug reporter. A Chrome extension records a tab —
video or screenshot — with the last 5 minutes of console + network already
captured, redacts secrets, and files it to Supabase. A zero-dependency Node
viewer plays the report back next to a synced log timeline.

## Run it

**Dashboard** — the Next.js app in [`viewer/`](viewer/README.md):

```
cd viewer && npm install && npm run dev    # → http://localhost:3100
```

Needs the four migrations run once — `viewer/README.md` has the steps. Sign
up there first: the extension signs in with the same account.

**Extension:** `chrome://extensions` → Developer mode → **Load unpacked** →
[`extension/`](extension/), **not** the repo root. No build step; the source is
what ships.

Everything under the folder you point Chrome at gets read and packaged. The
repo root holds `.env.local` with the `service_role` key and `viewer/` with a
1.1 GB `node_modules`, so the extension lives in its own folder — the isolation
is the point, not the tidiness.

Sign in from the toolbar popup once — reports are owned rows, so the uploader
needs a real session. Then capture with `Alt+Shift+J` (starts/stops video), or
the popup for screenshot vs. record. The on-page widget takes over from there —
title, project, send. Video is capped at 3 minutes.

## Setup

1. Run `schema.sql` in the Supabase SQL editor (creates `reports`, the
   `reports` storage bucket, and the RLS policies).
2. Run `schema-dashboard.sql` — generated error/failure counts.
3. Run `schema-single-user.sql` — one owner per report, every policy
   `owner = auth.uid()`, and no more anonymous filing.
4. Run `schema-share.sql` — share links: `share_token` plus the one
   `security definer` function anonymous visitors may call.

Nothing in this repo needs the `service_role` key any more. The extension and
the dashboard both use the publishable key plus a real user session, and let RLS
decide. If you have a root `.env.local` left over from the interim viewer,
delete it and rotate the key.

The extension carries the publishable `anon` key plus a user session
(`extension/auth.js`), stored in `chrome.storage.local` and refreshed before it expires.
Every report is inserted with `owner = auth.uid()`, and you read back exactly
the rows you filed. That is the whole access model.

## Layout

| File | Context | Job |
|---|---|---|
| `extension/worker.js` | service worker | Only holder of `chrome.tabs`/`tabCapture`/`scripting`. Routes everything, keeps no state. Re-injects content scripts on reload. |
| `extension/offscreen.js` | offscreen doc | The durable one. Owns the log buffer, `MediaRecorder`, the blob, and the upload. Survives navigation and worker death. |
| `extension/capture.js` | MAIN world | Patches the page's `console`/`fetch`/XHR into a rolling 5-min buffer. Uploads nothing. |
| `extension/redact.js` | MAIN world | Runs before `capture.js`. Nothing leaves the tab unredacted. |
| `extension/widget.js` | ISOLATED world | Shadow-DOM widget; UI plus the MAIN↔offscreen bridge. Stateless by design. |
| `extension/popup.js` / `popup.html` | popup | One button — record this tab — or the expired card that sends you to the dashboard to log in. The widget does the rest. |
| `extension/auth.js` | worker + popup | Reads the dashboard's `sb-*-auth-token` cookie via `chrome.cookies`. The extension never signs in and never refreshes; nothing is stored on its side. |
| `viewer/` | next.js | **The dashboard.** Sidebar, one grid of recordings with video previews, filters, report viewer, triage, share links. Anon key + RLS, no god key. |
| `schema-single-user.sql` | — | Owner column, owner-scoped policies. Run after the other two. |
| `schema.sql` | — | Tables, bucket, RLS. Run once. |
| `schema-dashboard.sql` | — | Generated counts + domain-locked RLS. Run once, before `viewer/`. |
| `schema-share.sql` | — | `share_token` + `shared_report(uuid)`, the only thing `anon` may call. Run after the other three. |

## Redaction

`extension/redact.js` is the ship gate. Denylisted headers (`authorization`, `cookie`,
…), denylisted keys by name (`password`, `token`, `api_key`, `ssn`, …) in
objects *and* URL query params, and pattern matches for JWTs, Bearer tokens,
Stripe/OpenAI/GitHub/AWS keys. Emails are masked to `[email]@domain` —
`FJ_REDACT_EMAILS` flips that off. It also strips NULs and lone surrogates,
which Postgres jsonb cannot hold (PostgREST 22P05).

## Tests

```
node test-redact.js    # the ship gate
```

Both pass. No framework, no runner.

## Plan

[`PLAN.md`](PLAN.md) — the full build plan, the three feature tiers, every
hard-coded limit and why it's there, and a status column showing which of the
six build steps have landed.

## Known ceilings

- No Google sign-in yet — email and password only. The seam is left open in
  `viewer/src/app/login/sign-in.tsx` and `extension/auth.js`.
- Reports filed before `schema-single-user.sql` have a null `owner` and are
  invisible. Adopt them with an `update`, or let them age out.
- No GIN index on `logs`/`network`; add one when search ships.
- 2000 log entries per tab, 100 KB per body, 90-day retention (the cron line
  in `schema.sql` is still commented out).
