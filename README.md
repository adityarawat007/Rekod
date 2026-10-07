<p align="center">
  <img src="docs/banner.png" alt="" width="100%">
</p>

<h1 align="center">
  <img src="apps/web/public/rekod-mark.svg" alt="" width="40" align="absmiddle">
  rekod
</h1>

<p align="center">
  <b>Bug reports that already know what happened.</b><br>
  Record a tab and rekod brings the five minutes before it: console, network and video on one timeline.
</p>

<p align="center">
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="apps/extension/README.md">Extension</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="REKOD_DESIGN_SYSTEM.md">Design system</a>
</p>

<p align="center">
  <img src="docs/screenshots/extension-popup-light.png" alt="The rekod extension popup" width="280">
</p>

---

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

## Self-hosting

rekod is a Next.js app plus a database plus a bucket. There is no separate API
server, and no Docker image for the app itself yet (a production compose file is
Phase 4 in [`ROADMAP.md`](ROADMAP.md)); today you run `pnpm dev` locally or
deploy `apps/web` to Vercel (or any host that runs Next.js).

### 1. What you need

| | |
|---|---|
| Node 24 | What CI uses. |
| pnpm | `corepack enable`; the version is pinned in `package.json`. |
| A database | Postgres (any) or MongoDB 6+. Docker gives you one locally. |
| An S3-compatible bucket | Private. Docker gives you SeaweedFS locally. |
| A Google OAuth client | Google is the only sign-in. Without it nobody can log in. |
| Chrome | For the extension. |

### 2. Local quickstart

```sh
git clone <this repo> && cd rekod
corepack enable
pnpm install

# Postgres on :5432, S3 (SeaweedFS) on :8333. Add `--profile mongo` for MongoDB on :27017.
docker compose -f docker-compose.dev.yml up -d

# The bucket must exist; SeaweedFS runs with auth off, so any key pair works.
curl -X PUT http://localhost:8333/rekod

cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`. The local defaults already match the compose file;
you fill in three things:

- `BETTER_AUTH_SECRET`: `openssl rand -base64 32` (32 characters minimum).
- `BETTER_AUTH_URL`: `http://localhost:3100`, already set.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: in the
  [Google Cloud console](https://console.cloud.google.com/apis/credentials)
  create an **OAuth client ID** of type *Web application* with the authorized
  redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`, i.e.
  `http://localhost:3100/api/auth/callback/google` here.

Then apply the migrations (Postgres only) and start the app:

```sh
pnpm -C apps/web db:migrate
pnpm dev                                # http://localhost:3100
```

Open <http://localhost:3100> and sign in with Google. Every user gets a personal
workspace on first sign-in. `GET /api/health` answers 200 when the database is
reachable.

### 3. Choose your database

The scheme of `DATABASE_URL` picks the adapter; nothing else changes. There is no
migration between the two, so pick before you have data. Design in
[`ADAPTERS.md`](ADAPTERS.md).

| | `DATABASE_URL` | Setup |
|---|---|---|
| Postgres | `postgres://…` | `pnpm -C apps/web db:migrate`, run by hand, again after each upgrade that adds a migration. Tables live in the `rekod` schema, never `public`. Any host works: Supabase (use the transaction pooler, port 6543), Neon, RDS, or your own. |
| MongoDB 6+ | `mongodb://…` or `mongodb+srv://…` | None: collections and indexes are created on first use. Atlas or a single standalone `mongod` is enough; no replica set needed. |

### 4. Choose your storage

Any S3-compatible bucket. Recordings, logs and screenshots go straight from the
extension to the bucket by presigned URL, and the dashboard signs a fresh read
URL per visit, so the bucket stays **private**. Set all five:

| Variable | |
|---|---|
| `S3_ENDPOINT` | Full URL, e.g. `https://<account>.r2.cloudflarestorage.com` |
| `S3_REGION` | Defaults to `us-east-1`. Must match the bucket's region or signatures fail. |
| `S3_BUCKET` | Created beforehand; the app does not create it. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Server-side only. Never `NEXT_PUBLIC_`. |

| Provider | `S3_ENDPOINT` / `S3_REGION` |
|---|---|
| AWS S3 | `https://s3.<region>.amazonaws.com` / the bucket's region |
| Cloudflare R2 | `https://<account>.r2.cloudflarestorage.com` / `auto` |
| MinIO | your server's URL / `us-east-1` |
| Supabase | `https://<ref>.supabase.co/storage/v1/s3` / the region on Storage → S3 Connection |
| GCS | `https://storage.googleapis.com` / `auto`, with an Interoperability **HMAC** key as the two keys |

**Bucket CORS is not needed today.** Media is read through `<video>`/`<img>`
without `crossOrigin`, the log files are fetched server-side, and the
extension's PUTs skip CORS through its `host_permissions`. Add a rule only if
you later fetch bucket objects from browser JavaScript:

```json
[{
  "AllowedOrigins": ["https://rekod.example.com"],
  "AllowedMethods": ["GET", "PUT", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

(S3 and R2 take that JSON as is; GCS and MinIO have their own CORS commands with
the same fields.) The extension's own uploads are covered by its
`host_permissions`, not by CORS; see step 6.

### 5. Deploy to production

Vercel is the documented path.

1. Import the repo, set **Root Directory** to `apps/web`. The build is
   `pnpm build`, which re-zips the extension first and then runs `next build`.
2. Add the environment variables below, with `BETTER_AUTH_URL` set to the
   production origin. Add `<that origin>/api/auth/callback/google` as a redirect
   URI on the Google client.
3. Run `pnpm -C apps/web db:migrate` once against the production database
   (Postgres), from your machine.
4. In [`apps/web/vercel.json`](apps/web/vercel.json), change `regions` (shipped as
   `["icn1"]`, Seoul) to the Vercel region **next to your database**. Every page
   and upload makes several round trips; a mismatch multiplies each of them.

| Variable | Required | |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://` or `mongodb://` |
| `BETTER_AUTH_SECRET` | yes | 32+ characters |
| `BETTER_AUTH_URL` | yes | The public origin, no trailing path |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes, to sign in | Both or nobody can log in |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | yes | |
| `S3_REGION` | no | Default `us-east-1` |
| `CRON_SECRET` | recommended | 16+ characters. Unset, the cleanup job refuses every caller. |
| `DISABLE_SIGNUP` | no | `true`: nobody new can sign up |
| `ALLOWED_EMAIL_DOMAINS` | no | Comma-separated, e.g. `yourorg.com`. Empty: any domain. |
| `MIN_EXTENSION_VERSION` | no | e.g. `0.3.2`. Older extensions get "please update". Unset: any version. |
| `STORAGE_DRIVER` | no | Only `s3` exists |

**Cleanup cron.** `vercel.json` schedules `GET /api/cron/cleanup` daily at 04:00
UTC, and Vercel sends `Authorization: Bearer $CRON_SECRET`. It deletes uploads
nobody finished (older than a day), files included. Off Vercel, call it from any
scheduler: `curl -H "Authorization: Bearer $CRON_SECRET" https://rekod.example.com/api/cron/cleanup`.

### 6. Point the extension at your server

The extension has no sign-in; it reads your dashboard's session cookie, and only
for origins it is told about. Two edits in `apps/extension/`:

1. [`auth.js`](apps/extension/auth.js): put your origin first in `DASH_ORIGINS`.
   The first entry is also where the popup's Log in button goes.

   ```js
   const DASH_ORIGINS = ['https://rekod.example.com', 'http://localhost:3100'];
   ```

2. [`manifest.json`](apps/extension/manifest.json): add a `host_permissions`
   entry for **every** origin in `DASH_ORIGINS` (`"https://rekod.example.com/*"`;
   `http://localhost/*` is already there and covers any port) **and** for your
   bucket's origin (`"https://<account>.r2.cloudflarestorage.com/*"`).
   `*.supabase.co`, `storage.googleapis.com` and localhost are already listed.
   Without the dashboard entry you look signed out; without the bucket entry the
   upload fails with a CORS error.

Then rebuild the zip the dashboard serves, and load the extension:

```sh
pnpm ext:zip      # rewrites apps/web/public/rekod-extension.zip; commit the result
```

`pnpm build` also re-zips, and `pnpm test` fails if the committed zip is stale,
so commit it with your edit. Bump `version` in `manifest.json` if you hand the
zip to others. To install, either load [`apps/extension/`](apps/extension/)
directly or download the zip from your dashboard's landing page and:

1. Unzip it and keep the `rekod-extension` folder somewhere permanent.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click **Load unpacked** and pick that folder (never the repo root: Chrome
   loads everything under it, `node_modules` and `.env` files included).

Sign in on the dashboard first, then click the toolbar icon.

### 7. Plans and admin

Every user has a plan and a video limit (screenshots do not count): `free` is 20
videos, `pro` is 200 and may own up to 10 workspaces. The script reads
`apps/web/.env.local`, so it acts on that `DATABASE_URL`:

```sh
pnpm set-plan you@example.com pro        # the plan's default limit
pnpm set-plan you@example.com free 50    # or any number
```

### 8. Troubleshooting

| Symptom | Cause |
|---|---|
| `/login` says sign-in is not set up | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` missing or empty. Google's `redirect_uri_mismatch` means the redirect URI differs from `<BETTER_AUTH_URL>/api/auth/callback/google`. |
| A page fails with "Missing or invalid server env: …" | The named variable is unset or malformed. Env is read on first request, not at build. |
| Error mentioning `does not exist` | Migrations not run on that database (Postgres). |
| Upload fails with a CORS or "Failed to fetch" error | The bucket's origin is missing from `host_permissions` in the extension's `manifest.json`. The bucket needs no CORS rule for this. |
| Upload or playback returns `SignatureDoesNotMatch` | `S3_REGION` or `S3_ENDPOINT` does not match the bucket; or the keys are wrong. |
| Extension says you are signed out | Your origin is not in `DASH_ORIGINS`, has no `host_permissions` entry, or you are not signed in on that exact origin (`localhost` is not `127.0.0.1`). Reload the extension after editing. |
| Extension says "please update" | `MIN_EXTENSION_VERSION` is higher than the installed `manifest.json` version. |
| Cleanup cron returns 401 | `CRON_SECRET` is unset, so the job refuses every caller. |
| Every request fails with "Missing or invalid server env: CRON_SECRET" | `CRON_SECRET` is set but shorter than 16 characters; `serverEnv()` rejects it. |

## Checks

```sh
pnpm test        # timeline logic and the tenant-isolation test, on both databases
pnpm typecheck
pnpm lint
pnpm build
```

CI runs exactly these. The tenancy test needs no database or bucket; it runs
against PGlite and an in-memory MongoDB with a fake S3.

## Docs

| File | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | How the system works today: server boundary, upload flow, extension invariants. |
| [`ADAPTERS.md`](ADAPTERS.md) | The Postgres / MongoDB adapter design. |
| [`ROADMAP.md`](ROADMAP.md) | The plan and a progress log of what has landed. |
| [`REKOD_DESIGN_SYSTEM.md`](REKOD_DESIGN_SYSTEM.md) | The UI's authority: tokens, type, components. |
| [`apps/extension/README.md`](apps/extension/README.md) | Installing and using the extension. |
