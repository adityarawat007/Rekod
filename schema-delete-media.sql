-- ReKod migration 8 of 8 — let an owner delete their own media.
-- Run after the other seven. Re-runnable.
--
-- `delete on reports` has been granted since schema-single-user.sql, and the
-- "own reports deletable" policy still decides which rows. Storage never got
-- the matching policy: the bucket has select and insert for `authenticated`
-- and nothing else, so deleting a report removed the row and left the .webm
-- behind — invisible, unreachable, and still billed for.
--
-- The rule is the one the other two storage policies use, and for the same
-- reason: objects live at <user-uuid>/<yyyy>/<mm>/<id>.<ext>, so the first
-- path segment is the owner and checking it needs no join and no dependence on
-- storage.objects.owner (deprecated in favour of owner_id).
--
-- The subselect is load-bearing: unwrapped, auth.uid() re-evaluates per row.
drop policy if exists "own media deletable" on storage.objects;
create policy "own media deletable" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ── What this deliberately does not do ──────────────────────────────────────
-- No cascade, and no trigger that deletes the object when the row goes. A
-- database trigger cannot call the storage API, and doing it from SQL against
-- storage.objects would bypass the very policy above. The dashboard removes
-- the object and then the row, in that order, and a failure at either step is
-- reported rather than retried — see components/delete-reports.tsx.
--
-- A share link dies with the row regardless: `shared_report()` finds nothing,
-- so /s/<token> 404s even while a signed media URL someone saved still works
-- until it expires. That is the same caveat sharing has always carried.
