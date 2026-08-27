-- Rollback for 20260827090000_notes_anchor.sql
--
-- ⚠️ THIS DESTROYS WHAT EVERY SKILL NOTE IS ABOUT. Dropping `anchor` erases the
-- section each note was written against, for every reader at once, and it is
-- recoverable from nowhere else — the body does not repeat it and no other
-- column implies it. The notes themselves survive; what they point at does not.
--
-- Before running this on prod, consider whether you want to keep the column and
-- simply stop reading it. Rolling back the CODE does not require rolling back
-- the SCHEMA: an unread column is inert, and a nullable one costs a row nothing.
-- Dropping it is a decision about data, not about deployment.
--
-- If it must go, export first:
--
--   select id, user_id, target_id, anchor, created_at
--   from public.notes
--   where target_type = 'skill' and anchor is not null;

begin;

-- ---------------------------------------------------------------------------
-- 1. The index
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dropping this returns the skill half of the table to having NO index on
-- (user_id, target_id) — see section 2 of the forward migration for how it came
-- to be missing in the first place. That is only correct if the code reading
-- skill notes is going away in the same rollback. If it is not, leave this index
-- alone: it is unique to nothing, constrains nothing, and rolling back a feature
-- while keeping a plain index costs a little write throughput and no
-- correctness.
drop index if exists public.notes_skill_target_idx;

-- ---------------------------------------------------------------------------
-- 2. The column
-- ---------------------------------------------------------------------------
--
-- The constraint goes with the column automatically, but it is dropped first so
-- this file reads in the reverse order of the one it undoes.
alter table public.notes
  drop constraint if exists notes_anchor_length;

alter table public.notes
  drop column if exists anchor;

commit;
