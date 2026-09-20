-- ReKod migration 6 of 6 — notes and comments.
-- Run after schema.sql, schema-dashboard.sql, schema-single-user.sql,
-- schema-share.sql, schema-drop-status.sql. Re-runnable, like the other five.
--
-- Two new things on a report, and they are NOT the same thing:
--   description — one field, the author's own write-up, edited in place.
--   comments    — an append-only thread the owner adds to over time.
-- The extension collects title + description at stop-recording time; the
-- thread only ever grows on the dashboard.
--
-- No `comments` TABLE. A thread belongs to exactly one report, is read in full
-- whenever that report is read, and is written by exactly one account — so a
-- jsonb array on the row costs no join, no second policy set, no second grant,
-- and rides along inside `shared_report()` for free. A table becomes worth it
-- the day someone other than the owner may post; see the note at the bottom.
begin;

-- ── 1. the columns ──────────────────────────────────────────────────────────
-- Each element is {id, body, at, by}: id is a client uuid used as the delete
-- key and the React key, at is an ISO string, by is the author's email.
--
-- No check constraint on the shape. Only this app writes here, `authenticated`
-- is one account, and a malformed element renders as an empty comment rather
-- than breaking the page.
alter table public.reports
  add column if not exists description text,
  add column if not exists comments    jsonb not null default '[]'::jsonb;

-- `title` stays NOT NULL on purpose. It is optional in the UI now — both
-- inputs in the extension's compose card can be left blank — but the empty
-- string says that, and nothing in the dashboard has to learn a second way of
-- spelling "no title".
--
-- The grant is restated whole rather than added to, same as
-- schema-drop-status.sql did: these five columns are everything an owner may
-- update, and reading that off one line beats inferring it from three files.
-- RLS still decides WHICH rows — "own reports retriage" (badly named now, kept
-- because renaming a policy is a drop and a create for no behaviour change).
grant update (title, description, comments, share_token, share_url)
  on public.reports to authenticated;

-- ── 2. the anonymous surface widens by exactly two columns ──────────────────
-- A share recipient reads the write-up and the thread. They still cannot post:
-- `anon` has no insert or update grant on reports and gets no new function
-- here. Read-only is the whole design — a public write path into this table
-- would need its own definer function, its own rate limit and a spam story.
--
-- KNOWN, AND CHOSEN: `comments[].by` is the owner's email address, so it goes
-- to everyone holding a share link, permanently. That was the call over "no
-- author" and over a separate display name. Change it by writing a display
-- name into `by` at post time — the column list below does not need to move.
--
-- Still an explicit column list, still dropped-and-recreated rather than
-- replaced (a replace cannot change the return type, which is exactly what
-- adding these two columns does). `owner` and `share_token` stay out.
drop function if exists public.shared_report(uuid);

create function public.shared_report(token uuid)
returns table (
  id          uuid,
  title       text,
  description text,
  comments    jsonb,
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
  select r.id, r.title, r.description, r.comments, r.page_url, r.project,
         r.video_path, r.share_url, r.t0, r.logs, r.network, r.env, r.created_at
  from public.reports r
  where token is not null
    and r.share_token = token;
$$;

revoke execute on function public.shared_report(uuid) from public;
grant  execute on function public.shared_report(uuid) to anon, authenticated;

commit;

-- ── What this deliberately does not do ──────────────────────────────────────
-- No editing a posted comment, and no threading. Delete and re-post covers the
-- typo; a reply needs a second account to reply to.
--
-- ponytail: a comment is posted by rewriting the whole array from the browser,
-- so two tabs posting at the same second lose one of the two comments. One
-- account, one tab, last write wins. The upgrade when that stops holding is an
-- `add_comment(uuid, text)` definer function doing `comments || jsonb_build_
-- object(...)` server-side — atomic, and the same shape the anon-write version
-- would need anyway.
