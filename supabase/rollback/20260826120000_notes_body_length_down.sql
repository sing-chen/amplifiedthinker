-- Reverses 20260826120000_notes_body_length.sql.
--
-- ⚠️ Nothing here reads, changes or deletes a note. Constraints and indexes
-- only — rolling back widens what is allowed and restores the index the
-- migration retired.
--
-- ⚠️ It does NOT restore rows that a failed insert never created. If the app
-- has been live under the constraint, a note somebody tried to save at 600
-- characters was refused at the time and is not recoverable here or anywhere.

begin;

-- ⚠️ RECREATED FIRST, because the migration dropped it as REDUNDANT rather
-- than as unwanted: it only became redundant once the unique index existed, so
-- undoing that has to give it back or the rollback leaves `notes` with no index
-- on (user_id, target_type, target_id) at all — which is worse than the state
-- before the migration ran, and is the shape of rollback that quietly degrades
-- a table instead of restoring it.
create index if not exists notes_user_target_idx
  on public.notes (user_id, target_type, target_id);

drop index if exists public.notes_one_per_target_idx;

alter table public.notes
  drop constraint if exists notes_body_length;

commit;
