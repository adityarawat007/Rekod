-- Run in the Supabase SQL editor, after schema-delete-media.sql. Safe to re-run.
--
-- One count, not two. The viewer stopped showing warnings as their own figure
-- and their own filter (23 Sep 2026), so a console warning is an error
-- everywhere it is counted — including the card in the grid, which reads this
-- column and would otherwise be short by every warning in the report.
--
-- Nothing else changes: warnings were never a column or a flag, only rows in
-- `logs` with lvl "warn", and they still are. This is the only place the two
-- levels were ever told apart in the database.
--
-- Dropped and re-added rather than guarded, for the same reason
-- schema-dashboard.sql does it: a guarded add would silently keep the old rule.
begin;

alter table reports drop column if exists error_count;

alter table reports
  add column error_count int
    generated always as (
      jsonb_array_length(jsonb_path_query_array(
        logs, '$[*] ? (@.lvl == "error" || @.lvl == "warn")'
      ))
    ) stored;

commit;
