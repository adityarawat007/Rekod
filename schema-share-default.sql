-- ReKod migration 7 of 7 — every report is shareable from birth.
-- Run after the other six. Re-runnable.
--
-- The Share button used to MINT a token on first click, so a report was
-- private until someone decided otherwise. That is now the default: the row
-- arrives with a token and the button only copies. The link is a uuid v4, so
-- holding one is still the whole credential, and `public.shared_report(uuid)`
-- is still the entire anonymous surface.
--
-- Stated plainly, because it is a real change in posture: from here on EVERY
-- recording is readable by anyone who has its link, from the moment it is
-- filed. Nothing is published — a token nobody has been given reaches nobody —
-- but there is no longer a per-report decision in front of that.
begin;

-- The column stays nullable. Nothing writes null today, and leaving it that
-- way keeps "private again" a one-line update rather than a migration.
alter table public.reports alter column share_token set default gen_random_uuid();

-- Backfill. Idempotent: after the first run there is nothing null to fill.
-- gen_random_uuid() is evaluated per row, so this cannot collide on the unique
-- index the way a single scalar would.
update public.reports set share_token = gen_random_uuid() where share_token is null;

commit;

-- ── What this deliberately does not do ──────────────────────────────────────
-- No revoke. The dashboard's revoke control is gone with this change, so there
-- is no supported way back to private; `update reports set share_token = null`
-- in the SQL editor still works and still 404s the page immediately.
--
-- share_url is NOT filled here. It is a storage URL that only a session
-- satisfying the storage policy can sign, which the database is not — the
-- dashboard signs it the first time the link is copied and stores it then.
