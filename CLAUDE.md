# FlamJam

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

Sharing is *not* the team model returning. A report with a non-null
`share_token` is readable at `/s/<token>` by anyone, through exactly one
`security definer` function — `public.shared_report(uuid)`, the whole anonymous
surface. `anon` still has no grant on `reports` and storage RLS is untouched:
the recipient plays a URL the **owner** signed at share time and stored in
`share_url`. Widening that function is the entire risk; its explicit column
list is what keeps `owner` and `share_token` from leaking, so never make it
`select *`.

**The extension is authenticated, but it never signs in.** It cannot file as
`anon`. `extension/auth.js` reads the dashboard's `sb-*-auth-token` cookie via
`chrome.cookies` — one session, owned by the dashboard, no copy in
`chrome.storage`. Expired cookie means the popup shows the expired card and
sends you to `/login`; the extension deliberately never refreshes (two
refreshers race Supabase's reuse detection).

**`extension/redact.js` is the ship gate.** It runs before `capture.js` in the
MAIN world. Nothing leaves the tab unredacted. Changing it means running
`node test-redact.js`.

**The capture contract is mirrored, not shared.** `viewer/src/lib/types.ts`
describes exactly what `extension/capture.js` writes. Change one side and you
must change the other by hand.

## Migrations

SQL is applied by hand in the Supabase console; the app never runs DDL. Order
matters and all three are re-runnable:

`schema.sql` → `schema-dashboard.sql` → `schema-single-user.sql` →
`schema-share.sql`

The third supersedes parts of the first two; the fourth only adds. Adding a migration means a new
file, never editing an applied one.

## Checks

```
node test-redact.js              # the ship gate
cd viewer && npm test            # timeline merge, pre-roll signs, timeline uids
cd viewer && npm run typecheck
cd viewer && npm run build
```

`viewer/` uses **pnpm**; `pnpm dev` serves :3100 (pinned with `-p`, because
`extension/auth.js` hardcodes that origin). `npm run lint` is clean — three
warnings in `report-view.tsx`, no errors. Keep it that way.

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
filtered by search params; there is no separate inbox route. Thumbnails come
from `lib/previews.ts`, which signs every path in the page with ONE
`createSignedUrls` call — never one per row.

A failed query `throw`s; it does not render its own error card. `error.tsx`
owns that, including the "run schema-dashboard.sql" hint.

**`proxy.ts` uses `getClaims()`, never `getUser()`.** It runs on every request,
RSC navigations included; `getUser()` is a ~370ms round trip to the auth server
each time and was the real cause of sluggish routing. The project signs with
ES256, so `getClaims()` verifies locally against a module-cached JWKS. Same
guarantee — a forged or expired token fails verification. Applies to
`navData()` too, and to anything else that runs per request.

`components/ui/` is shadcn (`base-nova` style, Base UI underneath, so the slot
prop is `render`, not `asChild`). Compose those primitives — do not hand-roll a
nav or a raw `<button>`. `hooks/use-mobile.ts` is edited from shadcn's version;
re-running `shadcn add sidebar` reverts it.

## Next.js 16 is not the Next.js you know

`viewer/AGENTS.md` is auto-written by `next dev` and says so. The authoritative
docs ship in `viewer/node_modules/next/dist/docs/` — 452 files. Read those
rather than recalling Next 14/15 conventions. Notably: `middleware.ts` is now
`proxy.ts` and exports `proxy`.
