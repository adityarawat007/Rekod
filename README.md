# ReKod

Personal bug reporter. A Chrome extension records a tab —
video or screenshot — with the last 5 minutes of console + network already
captured, redacts secrets, and uploads it to your own server — a Next.js app
on any Postgres and any S3-compatible bucket — which plays it back next to a
synced log timeline. See [`ROADMAP.md`](ROADMAP.md) for where this is going.

## Run it

**Dashboard** — the Next.js app in [`apps/web/`](apps/web/README.md):

```
pnpm install && pnpm dev                  # → http://localhost:3100
```

Needs Postgres, a bucket, `.env.local` and `pnpm -C apps/web db:migrate` once —
[`apps/web/README.md`](apps/web/README.md) has the steps. Sign up there first:
the extension uses the same session.

**Extension:** `chrome://extensions` → Developer mode → **Load unpacked** →
[`apps/extension/`](apps/extension/), **not** the repo root. No build step; the source is
what ships.

Everything under the folder you point Chrome at gets read and packaged. The
repo root holds `.env` files and a 1.1 GB `node_modules`, so the extension lives in its own folder — the isolation
is the point, not the tidiness.

Sign in on the dashboard once — the extension reads that session from its
cookie, so there is nothing to sign into on the extension's side. Then capture with `Alt+Shift+J` (starts/stops video), or
the popup for screenshot vs. record. The on-page widget takes over from there —
title, project, send. Video is capped at 3 minutes.

## Layout

| File | Context | Job |
|---|---|---|
| `apps/extension/worker.js` | service worker | Only holder of `chrome.tabs`/`tabCapture`/`scripting`. Routes everything, keeps no state. Re-injects content scripts on reload. |
| `apps/extension/offscreen.js` | offscreen doc | The durable one. Owns the log buffer, `MediaRecorder`, the blob, and the upload. Survives navigation and worker death. |
| `apps/extension/capture.js` | MAIN world | Patches the page's `console`/`fetch`/XHR into a rolling 5-min buffer. Uploads nothing. |
| `apps/extension/redact.js` | MAIN world | Runs before `capture.js`. Nothing leaves the tab unredacted. |
| `apps/extension/widget.js` | ISOLATED world | Shadow-DOM widget; UI plus the MAIN↔offscreen bridge. Stateless by design. |
| `apps/extension/popup.js` / `popup.html` | popup | One button — record this tab — or the expired card that sends you to the dashboard to log in. The widget does the rest. |
| `apps/extension/auth.js` | worker + popup | Reads the dashboard's `rekod.session_token` cookie via `chrome.cookies`; the uploader sends it back as a Bearer. The extension never signs in; nothing is stored on its side. |
| `apps/web/` | next.js | **The dashboard and the backend.** Grid, report viewer, share links, auth, the upload API. Every query scoped by workspace in `src/lib/server`. |

## Redaction

`apps/extension/redact.js` is the ship gate. Denylisted headers (`authorization`, `cookie`,
…), denylisted keys by name (`password`, `token`, `api_key`, `ssn`, …) in
objects *and* URL query params, and pattern matches for JWTs, Bearer tokens,
Stripe/OpenAI/GitHub/AWS keys. Emails are masked to `[email]@domain` —
`FJ_REDACT_EMAILS` flips that off. It also strips NULs and lone surrogates,
which Postgres jsonb cannot hold (PostgREST 22P05).

## Tests

```
pnpm test    # apps/web: timeline logic and the tenant-isolation test
```

No framework, no runner. The extension has no automated tests.

## Plan

[`PLAN.md`](PLAN.md) — the full build plan, the three feature tiers, every
hard-coded limit and why it's there, and a status column showing which of the
six build steps have landed.

## Known ceilings

- 2000 log entries per tab, 100 KB per body.
- No retention job yet (ROADMAP Phase 4); a report whose upload never completed
  stays `processing` and unlisted until then.
