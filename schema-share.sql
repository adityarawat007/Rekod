-- Run in the Supabase SQL editor, after schema-single-user.sql. Safe to re-run.
-- Audited against supabase-postgres-best-practices v1.1.1.
--
-- Share links: one report becomes a public URL. This does NOT bring the team
-- model back. There are still no accounts but yours, no membership table, and
-- no cross-account reads — an anonymous visitor can see exactly one report and
-- only if it holds the matching token.
--
-- The design constraint, for whoever reads this next: `anon` has no grant on
-- `reports` at all (schema-single-user.sql revokes it), and there is no
-- service_role key in this codebase. So the public page cannot read the row as
-- itself and cannot read it as an admin. One security definer function is the
-- entire anonymous surface. Widening it is the whole risk.
begin;

-- ── 1. the token, and the pre-signed media URL beside it ────────────────────
-- share_token null means private. Sharing sets it, revoking nulls it.
--
-- share_url is a storage URL signed by the OWNER at share time, when a session
-- that satisfies the storage policy still exists. Storage RLS is deliberately
-- left alone: an `anon` select policy on storage.objects would also let anyone
-- LIST the set of shared objects, which is worse than storing one string.
alter table reports
  add column if not exists share_token uuid,
  add column if not exists share_url  text;

-- Partial, because the overwhelming majority of rows are private and a null is
-- not a collision. Unique, so a token identifies at most one report — the
-- function below relies on that rather than on a LIMIT.
create unique index if not exists reports_share_token_idx
  on reports (share_token) where share_token is not null;

-- Triage touched status only. Sharing is the owner writing two more columns on
-- a row they already own; the RLS update policy still restricts which rows.
grant update (status, share_token, share_url) on reports to authenticated;

-- ── 2. the only thing anon may call ─────────────────────────────────────────
-- security definer because it must see past RLS — `anon` cannot select from
-- reports and is never going to be able to.
--
-- The column list is explicit and that is load-bearing: `select *` here would
-- start leaking `owner` and `share_token` the moment either is added to the
-- return type, and a leaked share_token is a share nobody can revoke. Adding a
-- column to reports must not silently widen this function.
--
-- `status` is left out on purpose. A recipient needs the bug, not our triage.
--
-- set search_path = '' per Supabase's guidance, so every reference below is
-- schema-qualified and cannot be hijacked by a search_path shim.
-- Dropped, not `create or replace`: replacing cannot change a function's return
-- type, so the first time a column is added to the list below a re-run would
-- fail. The grants are re-applied after, because a drop takes them with it.
drop function if exists public.shared_report(uuid);

create function public.shared_report(token uuid)
returns table (
  id          uuid,
  title       text,
  page_url    text,
  project     text,
  video_path  text,
  share_url   text,
  t0          bigint,
  logs        jsonb,
  network     jsonb,
  env         jsonb,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.page_url, r.project, r.video_path, r.share_url,
         r.t0, r.logs, r.network, r.env, r.created_at
  from public.reports r
  -- `= token` already yields no rows for a null token; the guard states the
  -- intent, so nobody later "fixes" this into `is not distinct from`.
  where token is not null
    and r.share_token = token;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, which would make
-- this a public endpoint by accident rather than by decision. Revoke first,
-- then grant to exactly the two roles that should have it.
revoke execute on function public.shared_report(uuid) from public;
grant  execute on function public.shared_report(uuid) to anon, authenticated;

commit;

-- ── What this deliberately does not do ──────────────────────────────────────
-- Revoking kills the page, not the video. Nulling share_token makes /s/<token>
-- a 404 immediately, but the signed media URL keeps working until it expires,
-- and anyone who saved the raw .webm link keeps it. If true revocation is ever
-- needed the lever is renaming the storage object — a signed URL is bound to
-- its path, so a `move` invalidates it. See PLAN.md, "Share links".
--
-- No expiry column. A link lives until it is revoked or the signed URL ages
-- out. Add `share_expires_at` and an `and (r.share_expires_at is null or
-- r.share_expires_at > now())` clause above when someone actually asks.
