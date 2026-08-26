-- Reverses 20260826160000_notes_one_per_target_news_only.sql: puts the index
-- back the way 20260826120000 created it, unique across the whole table.
--
-- ⚠️ THIS ONE CAN FAIL, AND THAT IS THE POINT OF SAYING SO HERE. If any reader
-- has more than one note against the same `target_type = 'skill'` target — which
-- is exactly what the forward migration exists to permit — recreating the
-- unbounded index raises a duplicate key error and the transaction rolls back.
--
-- That is correct behaviour, not a bug in this file: the rollback is refusing to
-- destroy notes in order to satisfy a constraint. If it happens, the choice is a
-- real one and belongs to a human — delete the extra notes deliberately, or stay
-- on the partial index. Do not "fix" this script by adding a delete.

begin;

drop index if exists public.notes_one_per_target_idx;

create unique index notes_one_per_target_idx
  on public.notes (user_id, target_type, target_id);

commit;
