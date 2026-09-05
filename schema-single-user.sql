-- Run in the Supabase SQL editor, after schema.sql and schema-dashboard.sql.
-- Safe to re-run.
--
-- Collapses the team model into a single-user one. Reports belong to the
-- account that filed them and to nobody else. There is no allowlist, no
-- membership, no shared visibility, and no reporter label — with one owner per
-- report there is nothing to label.
--
-- The consequence, stated plainly: the extension can no longer file as `anon`.
-- "Every report is associated with the logged-in user" and "anonymous clients
-- may insert" cannot both be true. The extension signs in now (popup.html).
begin;

-- ── 1. the allowlist goes ───────────────────────────────────────────────────
-- The table takes its own policies with it. Naming them here instead would
-- break the second run: `drop policy if exists ... on team_members` still
-- errors once the table is gone.
drop table if exists team_members;
-- is_team_member() itself is dropped at the end: the reports and storage
-- policies below still depend on it until they are replaced.

-- ── 2. owner replaces reporter ──────────────────────────────────────────────
-- reporter was a text email defaulting to the JWT claim, and null on every row
-- the extension filed as anon. owner is the real foreign key, so a deleted
-- account takes its reports with it.
drop index if exists reports_reporter_idx;
alter table reports drop column if exists reporter;

alter table reports
  add column if not exists owner uuid references auth.users (id) on delete cascade;
alter table reports alter column owner set default auth.uid();

-- Every list read is "my reports, newest first". One composite index serves it.
create index if not exists reports_owner_idx on reports (owner, created_at desc);

-- Reports filed before this migration have no owner and are invisible under the
-- policies below. That is deliberate: there is no honest way to guess who filed
-- an anonymous report. To adopt them into one account, run this by hand:
--   update reports set owner = '<uuid from auth.users>' where owner is null;

-- ── 3. RLS: you see exactly your own rows ───────────────────────────────────
alter table reports enable row level security;
revoke all on reports from anon, authenticated;
grant select, insert, delete on reports to authenticated;
grant update (status) on reports to authenticated;   -- triage touches status only

drop policy if exists "anon can file reports" on reports;
drop policy if exists "team can read reports" on reports;
drop policy if exists "team can retriage" on reports;

-- The subselect is load-bearing: unwrapped, auth.uid() re-evaluates per scanned row.
drop policy if exists "own reports readable" on reports;
create policy "own reports readable" on reports
  for select to authenticated using (owner = (select auth.uid()));

drop policy if exists "own reports insertable" on reports;
create policy "own reports insertable" on reports
  for insert to authenticated with check (owner = (select auth.uid()));

drop policy if exists "own reports retriage" on reports;
create policy "own reports retriage" on reports
  for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()));

drop policy if exists "own reports deletable" on reports;
create policy "own reports deletable" on reports
  for delete to authenticated using (owner = (select auth.uid()));

-- ── 4. storage follows the same rule, via the path ──────────────────────────
-- Objects live at <user-uuid>/<yyyy>/<mm>/<id>.<ext>. The first folder segment
-- is the owner, which is checkable in a policy without touching
-- storage.objects.owner (deprecated in favour of owner_id, and not worth
-- depending on). Date segments survive, so the retention sweep is still a list.
drop policy if exists "anon can upload video" on storage.objects;
drop policy if exists "team can watch video" on storage.objects;

drop policy if exists "own media readable" on storage.objects;
create policy "own media readable" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "own media uploadable" on storage.objects;
create policy "own media uploadable" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── 5. now nothing references it ────────────────────────────────────────────
drop function if exists public.is_team_member();

commit;
