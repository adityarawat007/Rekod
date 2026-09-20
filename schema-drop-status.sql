-- ReKod migration 5 of 5 — drop triage status.
-- Run after schema.sql, schema-dashboard.sql, schema-single-user.sql,
-- schema-share.sql. Re-runnable, like the other four.
--
-- Single-user removed the team; sharing is a read-only link. Nobody hands a
-- report to anyone, so "new / triaging / fixed" was a state only its own author
-- ever read. `public.shared_report` never returned it, so the anonymous surface
-- does not change shape here.

-- ── 1. the column ───────────────────────────────────────────────────────────
-- Dropping a column drops its column-level grants with it, and the check
-- constraint and default go the same way. `if exists` is what makes this
-- re-runnable.
alter table public.reports drop column if exists status;

-- ── 2. the grant that named it ──────────────────────────────────────────────
-- schema-share.sql granted `update (status, share_token, share_url)`. The
-- status part is gone with the column; restate the remainder so the grant is
-- readable in one place rather than inferred from a dropped column. Sharing is
-- still the only thing an owner may update, and RLS still decides which rows.
grant update (share_token, share_url) on public.reports to authenticated;

-- ── 3. what deliberately does NOT change ────────────────────────────────────
-- `reports_created_idx`, `reports_project_idx` — never covered status.
-- `public.shared_report(uuid)` — its explicit column list never included it.
-- Storage RLS — untouched, as always.
