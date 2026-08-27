-- Notes on primers and plans: what a note is about, and an index for finding it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
-- ---------------------------------------------------------------------------
--
-- Phase 6 shipped notes on news stories. `notes` was polymorphic from the
-- first migration — `target_type in ('news', 'skill')` with `target_id` as text
-- — so storing a note against a plan needs no new table and no new policy.
-- Two things are missing, and only two.
--
-- See BACKLOG.md, "Notes on primers and plans", for the shape this serves and
-- why it is many notes per plan rather than one per section.

begin;

-- ---------------------------------------------------------------------------
-- 1. What the note is about
-- ---------------------------------------------------------------------------
--
-- ⚠️ NULLABLE, AND THAT IS THE FEATURE RATHER THAN A CONCESSION. The recorded
-- reasoning is about how people actually read a plan: the reader is in step 7
-- when the thought about step 3 arrives, and sending them back to step 3 to
-- file it interrupts the reading — so the note is the thing that gets
-- abandoned. A note is therefore written wherever the reader is and OPTIONALLY
-- says what it is about. Null means "about the plan as a whole", which is a
-- real answer and not a missing one.
--
-- ⚠️ IT CANNOT BE FOLDED INTO `target_id`, and this was considered. Appending
-- the section to the target — 'analytical-thinking:plan:habits' — would make
-- the unique index one-note-per-section again, which is the exact constraint
-- 20260826160000 was written to lift, and it would leave a note about the plan
-- as a whole with nowhere to live.
--
-- 64 characters because the value is a section id from the page's own nav rail
-- ('habits', 'principles') or a primer slide index as text. The longest today
-- is 11. The bound exists for the same reason `notes_body_length` does: signed-
-- in browsers write to PostgREST directly, so a limit in the UI is a suggestion
-- to anyone with a console open.
alter table public.notes
  drop constraint if exists notes_anchor_length;

alter table public.notes
  add column if not exists anchor text;

alter table public.notes
  add constraint notes_anchor_length
  check (anchor is null or char_length(anchor) between 1 and 64);

-- ⚠️ DELIBERATELY NOT CONSTRAINED TO `target_type = 'skill'`, though a news note
-- always carries null and the constraint would have been one line. That is the
-- mistake 20260826160000 exists to undo, in the same table, three days ago: a
-- rule reasoned about for one half of a polymorphic table and written across the
-- whole of it, silently binding a half nobody had designed yet. An anchor on a
-- news row is meaningless, but nothing can reach one accidentally and no reader
-- is harmed by a column being null, so the correct amount of structure here is
-- none. Do not tighten it without a use that is being broken.
comment on column public.notes.anchor is
  'Optional pointer to WHERE in the target the note is about: a section id from '
  'a plan nav rail, or a primer slide index as text. Null means the note is '
  'about the target as a whole, which is a real answer. Always null on '
  'target_type = ''news'', which has no sub-structure to point at.';

-- No new grant. `grant select, insert, update, delete on public.notes to
-- authenticated` in the initial migration is table-level, so it already covers
-- columns added later, and `notes_own` already scopes every one of them to
-- `auth.uid()`.
--
-- ⚠️ Worth saying out loud because the opposite is this project's documented
-- trap: a NEW TABLE lands with no grants at all and looks exactly like a broken
-- policy. A new COLUMN on an existing table is the case where that does not
-- apply. Do not add a column-level grant here — mixing table-level and
-- column-level grants on one table makes the effective privileges much harder
-- to reason about later. Same note as 20260820070000.

-- ---------------------------------------------------------------------------
-- 2. The index the skill half lost, and nothing noticed
-- ---------------------------------------------------------------------------
--
-- ⚠️ THERE IS CURRENTLY NO INDEX SERVING `target_type = 'skill'` LOOKUPS, AND
-- THAT IS THE RESULT OF TWO CORRECT DECISIONS MEETING.
--
-- The initial schema created `notes_user_target_idx` on
-- (user_id, target_type, target_id). 20260826120000 created a UNIQUE index on
-- exactly those columns and dropped the plain one as dead weight — right at the
-- time, since a unique index serves every lookup a plain one on identical
-- columns can, and keeping both means maintaining a second B-tree for no read
-- it can answer faster.
--
-- Then 20260826160000 scoped that unique index to `where target_type = 'news'`.
-- A partial index cannot serve a lookup outside its predicate, so the skill half
-- of the table came out of that migration with no index at all.
--
-- ⚠️ NOTHING COULD HAVE CAUGHT IT, WHICH IS WHY IT IS WORTH THE PARAGRAPHS.
-- No check went red, no query got slower, and no reader saw anything — because
-- nothing has ever written a `target_type = 'skill'` row. The cost of an
-- unindexed lookup is invisible at zero rows, stays invisible at five, and
-- arrives as a sequential scan per page load with no error attached. The feature
-- this migration serves is the first thing that would ever have queried it.
--
-- `target_type` is absent from the index columns on purpose: the partial
-- predicate already fixes it to one value, so carrying it in the key would store
-- the same byte on every row for nothing. Postgres will still use this for the
-- client's `.eq('target_type','skill')`, because equality with a literal proves
-- the predicate.
--
-- ⚠️ AND `anchor` IS DELIBERATELY NOT IN IT. The list is ordered by the PLAN's
-- own section sequence, which is the nav rail's order and lives in the page, not
-- in the database — so the sort happens in the client and an index on `anchor`
-- would serve an ORDER BY nobody issues. Do not add one to "help the ordering";
-- alphabetical anchor order is not plan order and never was.
create index if not exists notes_skill_target_idx
  on public.notes (user_id, target_id)
  where target_type = 'skill';

-- ---------------------------------------------------------------------------
-- 3. One thing this deliberately does NOT add
-- ---------------------------------------------------------------------------
--
-- There is no cap on the NUMBER of notes against one target. 20260826120000
-- looked at that question and left it open, judging a runaway to be storage
-- untidiness rather than a security hole, since every row is private to the
-- account that wrote it and readable by nobody else.
--
-- ⚠️ THAT JUDGEMENT WAS MADE UNDER A CONDITION THIS MIGRATION REMOVES, so it is
-- restated rather than inherited. At the time, `notes_one_per_target_idx` was
-- unique across the whole table, so the only way to accumulate rows was a
-- console. Many-per-target is now the intended design for the skill half, which
-- means the growth path runs through the ordinary UI for the first time.
--
-- Still not capped, and the reasoning is unchanged in substance: the rows are
-- private, the body is bounded at 500 characters, and a cap needs a trigger
-- (a check constraint cannot count rows in its own table). A reader who writes
-- two hundred notes on a plan is using the feature. If it ever matters, the
-- lever is a trigger counting rows per (user_id, target_type, target_id), and
-- the number should come from something observed rather than guessed.

commit;
