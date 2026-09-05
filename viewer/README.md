# FlamJam viewer

The report dashboard, and the only one — the zero-dependency `viewer.js` it
replaced was retired on 29 Aug 2026. Build step 03 of
[`../PLAN.md`](../PLAN.md) called for this.

Next.js 16 (App Router) · React 19 · Tailwind 4 · shadcn/ui (`base-nova`, Base
UI under the hood) · Supabase Auth — email and password.

**Single-user.** One account, its own reports, nothing shared. There is no team,
no allowlist, no invitations and no reporter label — with one owner per report
there is nothing to label.

## Setup

The migrations need the Supabase console — the app cannot run DDL for you.

**1. Run the migrations**, in order, in the SQL editor. All are re-runnable.

- [`../schema.sql`](../schema.sql) — the `reports` table and the storage bucket.
- [`../schema-dashboard.sql`](../schema-dashboard.sql) — generated
  `error_count` / `failed_count` columns so the grid can filter on failures
  without pulling a 1 MB blob per row.
- [`../schema-single-user.sql`](../schema-single-user.sql) — drops
  `team_members` and `reporter`, adds `owner`, and rewrites every policy to
  `owner = auth.uid()`.

  It also **ends anonymous filing**. "Every report belongs to the signed-in
  user" and "anyone may insert" cannot both be true, so the extension signs in
  now — see below.

  Reports filed before this migration have no `owner` and are invisible. To
  adopt them, `update reports set owner = '<uuid>' where owner is null;`

- [`../schema-share.sql`](../schema-share.sql) — share links. Adds
  `share_token` / `share_url`, and `public.shared_report(uuid)`: one
  `security definer` function that is the entire anonymous read surface, so
  `/s/<token>` works for someone with no account while `anon` keeps no grant on
  `reports` and storage RLS stays as it is.

**2. Set the URLs.** Authentication → URL Configuration → **Site URL**
`http://localhost:3100`, and add `http://localhost:3100/**` to the redirect
allowlist. Email confirmation links need it.

**3. Run it.**

```
cp .env.local.example .env.local   # already done if you cloned this working tree
npm install
npm run dev                        # → http://localhost:3100
```

```
npm test          # pure-logic checks: timeline merge, pre-roll signs, day buckets
npm run typecheck
```

**4. Sign the extension in.** Sign up at `/login`, then open the FlamJam popup
and sign in with the same address. Until you do, the popup shows the sign-in
form instead of the capture buttons, and the ⌥⇧J hotkey fails at send with
"Sign in from the FlamJam popup".

## Access model

**One account, one report space.** Signing up is the whole of authorisation —
there is nothing else to grant. Every report carries an `owner` (`auth.users.id`),
and every policy is `owner = auth.uid()`.

Two gates:

1. `proxy.ts` refreshes the session cookie and bounces anonymous requests to
   `/login`.
2. **RLS is the one that actually counts** — the first is UX. Both `reports` and
   `storage.objects` are scoped to the owner, so a hand-rolled API call against
   someone else's row returns nothing regardless of what the UI does. The
   dashboard never filters by user; it does not have to.

Media lives at `<uid>/<yyyy>/<mm>/<id>.<ext>`. The storage policy checks the
first path segment rather than `storage.objects.owner`, which is deprecated in
favour of `owner_id`. The date segments survive, so a retention sweep is still a
list + remove.

No `service_role` key anywhere in this repo — the main change from the retired
`viewer.js`, which read with the god key and had no login at all. Browser, server and
extension all use the anon/publishable key plus a real user session. Video is
signed with the reader's own session, so the storage policy gates it too.

### Google, later

Deliberately not wired up. `/auth/callback` still exchanges an OAuth code, and
`sign-in.tsx` has the seam marked, so adding it is one `signInWithOAuth` call
and one button. The extension popup cannot host a redirect, so it will need
`chrome.identity.launchWebAuthFlow` — only `fjSignIn` in `../extension/auth.js` changes.

## Layout

| Path | What |
|---|---|
| `src/app/(dash)/page.tsx` | **The only list.** Grid of recordings — search, status, project, range, Has failures |
| `src/app/(dash)/reports/[id]/page.tsx` | One report — signs the media URL, renders the viewer |
| `src/app/s/[token]/page.tsx` | Public share page. No session; reads through `shared_report(uuid)` |
| `src/components/report-view.tsx` | Video + shared timeline + Console/Network/Steps/Device |
| `src/components/report-list.tsx` | The grid. Thumbnail is a frame from the video, no stored poster |
| `src/lib/previews.ts` | Signs every thumbnail on the page in ONE `createSignedUrls` call |
| `src/lib/types.ts` | **The capture contract.** Mirrors what `extension/capture.js` writes |
| `src/proxy.ts` | Session refresh + auth gate (Next 16 renamed `middleware.ts`) |
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

- **Full-text search across console output.** The plan defers it until jsonb
  search gets slow, and it wants the GIN index `schema.sql` deliberately skipped.
- **Annotations and comment threads.** Tier 2.
- **Google sign-in.** The seam is left open; see above.
- **Teams.** Removed rather than hidden. Bringing it back means an owner→team
  join and policies that follow membership, not a feature flag.
- **Deploy.** Local only, by decision — hosting waits on the plan's open
  question about staging-vs-production capture.
