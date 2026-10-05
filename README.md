# rekod

Bug reports that already know what happened. A Chrome extension keeps the last
five minutes of a tab's console and network in memory; press record and that
history is attached to the video. A Next.js app plays it all back on one
timeline.

## What it does

- **Chrome extension (MV3).** Records a tab (video) or takes a screenshot, with
  the previous 5 minutes of console and network traffic already captured.
  Secrets are redacted in the page before anything leaves the tab. Nothing is
  uploaded until you press Send.
- **Web app (Next.js).** The dashboard and the whole backend. Plays the video
  and the log on one timeline, and shares a rekod by read-only link. Runs on any
  Postgres (Drizzle) and any S3-compatible bucket, with Better Auth and Google
  sign-in.

The extension has no sign-in of its own; it reads the dashboard's session
cookie.

## Repo layout

| Path | What it is |
|---|---|
| [`apps/extension/`](apps/extension/) | Vanilla JS, MV3. No build step, no dependencies: the source is what ships. |
| [`apps/web/`](apps/web/) | Next.js 16, React 19, Tailwind 4. The only pnpm workspace package. |

The two share no code. The lockfile and `node_modules` live at the repo root.

## Quick start

Requires Node, pnpm and Docker.

```sh
# 1. dependencies
pnpm install

# 2. local Postgres (:5432) and S3 (:8333)
docker compose -f docker-compose.dev.yml up

# 3. config: copy and fill in
cp apps/web/.env.example apps/web/.env.local

# 4. create the bucket once, then apply migrations
curl -X PUT http://localhost:8333/rekod
pnpm -C apps/web db:migrate

# 5. dashboard on http://localhost:3100
pnpm dev
```

In `.env.local`, set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) and
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Google is the only sign-in, so
without both nobody can log in. Google's redirect URI is
`<BETTER_AUTH_URL>/api/auth/callback/google`.

**Extension:** open `chrome://extensions`, turn on Developer mode, click
**Load unpacked** and pick [`apps/extension/`](apps/extension/). Never pick the
repo root: Chrome loads everything under the folder, and the root holds
`node_modules` and `.env` files. Sign in on the dashboard first.

## Checks

```sh
pnpm test        # timeline logic and the tenant-isolation test
pnpm typecheck
pnpm lint
pnpm build
```

CI runs exactly these. The tenancy test needs no database or bucket; it runs
against PGlite with a fake S3.

## Docs

| File | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | How the system works today: server boundary, upload flow, extension invariants. |
| [`ROADMAP.md`](ROADMAP.md) | The plan and a progress log of what has landed. |
| [`REKOD_DESIGN_SYSTEM.md`](REKOD_DESIGN_SYSTEM.md) | The UI's authority: tokens, type, components. |
| [`apps/extension/README.md`](apps/extension/README.md) | Installing and using the extension. |
