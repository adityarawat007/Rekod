-- Step 02 of the plan. Run in the Supabase SQL editor.
-- Audited against supabase-postgres-best-practices v1.1.1.

create table reports (
  id          uuid primary key,                          -- client-generated; also the share-link slug.
                                                         -- Not bigint identity on purpose: sequential ids
                                                         -- would let anyone enumerate other people's reports.
  reporter    text default auth.jwt() ->> 'email',        -- dropped by schema-single-user.sql
  title       text not null,
  page_url    text,
  project     text,
  video_path  text,
  t0          bigint not null,                            -- epoch ms. NOT timestamptz: this is the origin for
                                                          -- client-side (entry.t - t0) arithmetic against epoch
                                                          -- values inside logs/network. created_at is the
                                                          -- human-readable timestamp.
  logs        jsonb not null default '[]',
  network     jsonb not null default '[]',
  env         jsonb not null default '{}',
  status      text not null default 'new' check (status in ('new','triaging','fixed')),
  created_at  timestamptz not null default now()
);

create index reports_created_idx  on reports (created_at desc);
create index reports_project_idx  on reports (project);
create index reports_reporter_idx on reports (reporter);   -- dropped with the column

-- ponytail: no GIN index on logs/network yet. A GIN index on 1 MB jsonb columns
-- taxes every insert for a full-text search feature that doesn't exist until tier 2.
-- Add `create index reports_logs_gin on reports using gin (logs)` when search ships.

insert into storage.buckets (id, name, public) values ('reports', 'reports', false);

-- ── access ──────────────────────────────────────────────────────────────────
-- The publishable key ships inside the extension, so treat `anon` as public.
-- anon may WRITE reports. It may not read them back.

alter table reports enable row level security;
revoke all on reports from anon, authenticated;

grant insert on reports to anon;
create policy "anon can file reports" on reports
  for insert to anon with check (true);

grant select on reports to authenticated;
grant update (status) on reports to authenticated;         -- triage touches status and nothing else
create policy "team can read reports" on reports
  for select to authenticated using (true);
create policy "team can retriage" on reports
  for update to authenticated using (true) with check (true);

create policy "anon can upload video" on storage.objects
  for insert to anon with check (bucket_id = 'reports');
create policy "team can watch video" on storage.objects
  for select to authenticated using (bucket_id = 'reports');

-- Once Google SSO lands, tighten both `using (true)` clauses to the domain.
-- The subselect matters: unwrapped, auth.jwt() is re-evaluated for every row scanned.
--   using ((select auth.jwt()) ->> 'email' like '%@example.com')

-- Retention: 90 days. Objects need a companion sweep; date-prefixed paths make it a list + remove.
-- select cron.schedule('rekod-retention', '0 3 * * *',
--   $$delete from reports where created_at < now() - interval '90 days'$$);
