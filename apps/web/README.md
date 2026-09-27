# ReKod viewer

The report dashboard, and the only one — the zero-dependency `viewer.js` it
replaced was retired on 29 Aug 2026. Build step 03 of
[`../PLAN.md`](../PLAN.md) called for this.

Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui (`base-nova`, Base
UI under the hood) · Better Auth (email + password, optional Google) · Drizzle on
any Postgres · any S3-compatible bucket.

It is also the whole backend: Route Handlers for the extension (`/api/v1`),
server actions for the dashboard, and `src/lib/server` for the rules.

## Setup

**1. Services.** Any Postgres and any S3-compatible bucket. Locally, from the
repo root: `docker compose -f docker-compose.dev.yml up`, then create the bucket
once with `curl -X PUT http://localhost:8333/rekod`. For Supabase: the
transaction-pooler connection string, and the Storage S3 endpoint + access keys.

**2. Env.** `cp .env.example .env.local` and fill it in — every value is
commented there. `BETTER_AUTH_SECRET` is `openssl rand -base64 32`. For Google,
create an OAuth client (Web application) with the redirect URI
`<BETTER_AUTH_URL>/api/auth/callback/google`; leave both `GOOGLE_*` empty and
the button simply does not render.

**3. Migrate and run.**

```
pnpm install
pnpm db:migrate                     # applies src/lib/db/migrations to DATABASE_URL
pnpm dev                            # → http://localhost:3100
```

```
pnpm test         # timeline merge, pre-roll signs, and the tenancy test (no Docker needed)
pnpm typecheck
```

**4. Sign up at `/login`.** You get a personal workspace. The extension picks
up the same session from this app's cookie — there is nothing to sign into
on its side.

## Access model

**The workspace owns the data**, and `src/lib/server` is the only gate. There is
no RLS: every repo function takes the workspace first and filters on it, the
workspace comes from the session and never from the request, and ESLint forbids
importing the database anywhere else. `test-tenancy.ts` calls every one of them
as a second workspace and expects nothing back.

- `proxy.ts` only checks that a session cookie exists and bounces to `/login`
  otherwise — UX, not security.
- Pages and server actions call `requireActor()`.
- `/api/v1` accepts only `Authorization: Bearer <session cookie value>` — what
  the extension sends.
- `/s/<token>` is the one unscoped read, through an explicit column list.

Media, logs and network are files at `<workspace>/<report>/<kind>.<ext>`, uploaded
by the extension to presigned URLs and read back through presigned URLs that
expire in an hour.

## Layout

| Path | What |
|---|---|
| `src/app/(dash)/page.tsx` | **The only list.** Grid of recordings — search, project, range |
| `src/app/(dash)/reports/[id]/page.tsx` | One report — media, logs and thread from `lib/server/reports.ts` |
| `src/app/(dash)/actions.ts` | Every dashboard mutation: notes, comments, share, delete |
| `src/app/s/[token]/page.tsx` | Public share page. No session; reads through `sharedReport(token)` |
| `src/app/api/v1/reports/…` | The extension's upload: create → PUT to the bucket → complete |
| `src/app/api/auth/[...all]` | Better Auth, the Google callback included |
| `src/lib/server/` | **The tenant boundary.** Auth config, session → workspace, the scoped repo |
| `src/lib/db/` | Drizzle schema (all in the `rekod` Postgres schema) and migrations |
| `src/lib/storage/` | Presign PUT/GET, HEAD, delete — any S3-compatible bucket |
| `src/components/report-view.tsx` | Video + shared timeline + Console/Network/Steps/Device |
| `src/components/report-list.tsx` | The grid. Thumbnail is a frame from the video, no stored poster |
| `src/lib/types.ts` | **The capture contract.** Mirrors what `apps/extension/capture.js` writes |
| `src/proxy.ts` | Cookie-present gate (Next 16 renamed `middleware.ts`) |
| `src/app/auth/signout/route.ts` | POST target for both Sign out buttons |

## Colour

The palette is the plan's, not a new one: Jam `#FF2D55`, Zest `#FFC400`, Grape
`#5B21F0`, plus reserved status colours. Two things worth knowing before you
touch `globals.css`:

- **Zest is never a chart mark.** At OKLCH L 0.85 it fails the lightness band
  and hits 1.55:1 against paper. It is a UI accent only.
- **Dark chart steps are selected, not flipped.** `--chart-*` in `.dark` are
  re-stepped (`#F2385C` / `#8B5CF6` / `#0FA372`) to sit inside the dark
  lightness band on the card surface. Both sets were validated, not eyeballed.

Status colour never carries meaning alone — every chip pairs the dot with the
word, and failure counts pair the colour with an icon and a number.

## Not built yet

See [`../ROADMAP.md`](../ROADMAP.md) — its progress log lists what each phase
left for later (password reset, settings pages, extension API keys, team
workspaces).
