-- Run in the Supabase SQL editor, before starting viewer/. Safe to re-run.
-- Two changes the Next.js dashboard needs.
--
-- Wrapped in a transaction on purpose: section 1 drops the count columns before
-- re-adding them, so a failure partway through must not leave the table without
-- them. Either the whole file applies or none of it does.
begin;

-- ── 1. counts, so the inbox never pulls a 1 MB blob to render a list ────────
-- schema.sql called this out: "no per-row error counts — that means pulling
-- every logs blob. Add a generated column if the list ever needs them." It does.
--
-- jsonb_path_query_array is IMMUTABLE (only the _tz variants are STABLE), which
-- is what lets these be `stored` generated columns rather than a view or trigger.
-- Re-runnable by design: the columns are dropped and re-added rather than
-- guarded with `if not exists`, because the first cut of failed_count had the
-- wrong rule and a guarded add would silently keep it.
--
-- What counts as a failure: status >= 400 anywhere, plus status == 0 on an
-- ACTIVE row only. `passive: true` marks a PerformanceObserver resource-timing
-- row (capture.js:185), where a cross-origin response reports responseStatus 0
-- meaning "not exposed" — not "failed". A thrown fetch (capture.js:86) and a
-- websocket error (capture.js:157) also write 0, carry no passive flag, and are
-- real failures. Counting passive zeros turned 26 cached CSS files into 26
-- "failures" on a report with no actual errors.
alter table reports
  drop column if exists error_count,
  drop column if exists failed_count;

alter table reports
  add column error_count int
    generated always as (
      jsonb_array_length(jsonb_path_query_array(logs, '$[*] ? (@.lvl == "error")'))
    ) stored,
  add column failed_count int
    generated always as (
      jsonb_array_length(jsonb_path_query_array(
        network,
        '$[*] ? (@.status >= 400 || (@.status == 0 && !exists(@.passive)))'
      ))
    ) stored;

create index if not exists reports_failed_idx on reports (failed_count) where failed_count > 0;

-- ── 2. domain-lock the reads now that Google SSO is in front of them ────────
-- Replaces the `using (true)` placeholders schema.sql shipped with. The
-- subselect is load-bearing: unwrapped, auth.jwt() re-evaluates per scanned row.
drop policy if exists "team can read reports" on reports;
create policy "team can read reports" on reports
  for select to authenticated
  using ((select auth.jwt()) ->> 'email' like '%@example.com');

drop policy if exists "team can retriage" on reports;
create policy "team can retriage" on reports
  for update to authenticated
  using ((select auth.jwt()) ->> 'email' like '%@example.com')
  with check ((select auth.jwt()) ->> 'email' like '%@example.com');

drop policy if exists "team can watch video" on storage.objects;
create policy "team can watch video" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and (select auth.jwt()) ->> 'email' like '%@example.com'
  );

-- Superseded: section 2's domain-lock policies and the `reporter` column are
-- both replaced by schema-single-user.sql, which must run after this file.

commit;
