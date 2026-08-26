-- Phase 6 stage 14: bound the length of a note, and give a story at most one
-- note per person.
--
-- ⚠️ WHY THIS IS A MIGRATION AND NOT A `maxlength` ATTRIBUTE. Notes are the
-- first user-authored free text this site has ever stored — every other user
-- row is a boolean, a timestamp or a slug the page chose. `body` is `text`,
-- which in Postgres is unbounded, and the only thing standing between that and
-- a megabyte of pasted content would be an attribute in a form that the person
-- writing to the table does not have to use. Signed-in browsers write to this
-- table DIRECTLY through PostgREST, so "the UI limits it" is not a limit at
-- all; it is a suggestion to anyone with a console open.
--
-- 500 characters is roughly 80-90 words — a paragraph, which is what a note on
-- a news story is for. The UI carries the same 500 and shows a counter from the
-- first keystroke, so the constraint is the backstop rather than the error
-- message.
--
-- ⚠️ THIS BOUNDS THE SIZE OF A NOTE, NOT THE NUMBER OF THEM. `notes.target_id`
-- is text with no foreign key — the column is polymorphic by design (a story
-- uuid for 'news', a skill slug for 'skill') — so a signed-in account with a
-- console can still create rows against target_ids that point at nothing. Every
-- such row is private to that account and readable by nobody else, so this was
-- judged storage untidiness rather than a security hole and deliberately left
-- open. If it ever matters, the fix is a check constraint on the SHAPE of
-- target_id (uuid for 'news', slug for 'skill'); a real FK is impossible while
-- the column stays polymorphic.

-- ⚠️ WRITTEN TO BE RE-RUNNABLE, AND THAT IS NOT DECORATION. This migration was
-- applied to DEV at a limit of 2000 before the number was settled at 500, so a
-- plain `add constraint` fails there with 42710 (already exists) and rolls the
-- whole transaction back — taking the index with it. Dropping first means dev
-- and prod can be given the IDENTICAL file, rather than prod getting this and
-- dev getting a one-off correction that exists nowhere in the repo. A migration
-- that only works on a virgin database is a migration that gets patched by hand.

begin;

alter table public.notes
  drop constraint if exists notes_body_length;

alter table public.notes
  add constraint notes_body_length
  check (char_length(body) between 1 and 500);

-- ⚠️ ONE NOTE PER PERSON PER TARGET, made structural. Without it the natural
-- "save" implementation — insert a row — silently accumulates a new note every
-- time someone edits theirs, and the page shows whichever the query happened to
-- return first. The unique index is what lets the client `upsert` on a stable
-- conflict target instead of read-then-branch, which is the same shape
-- skill_progress already uses (`onConflict: user_id,skill_slug,content_type`).
--
-- It is deliberately narrower than the schema's polymorphic design allows: a
-- note is per (person, kind, thing), and nothing in Phase 6 or Phase 7 wants
-- two notes on one story by one person. If threaded notes are ever wanted this
-- is the line to drop, and dropping it is cheap.
create unique index if not exists notes_one_per_target_idx
  on public.notes (user_id, target_type, target_id);

-- ⚠️ AND THE OLD INDEX IS NOW DEAD WEIGHT. The initial schema created
-- `notes_user_target_idx` on (user_id, target_type, target_id) — the SAME
-- columns in the SAME order as the unique index above. A unique index serves
-- every lookup a plain one on identical columns can, so keeping both means
-- paying to maintain a second B-tree on every insert, update and delete for no
-- read it can answer faster.
--
-- It is dropped HERE rather than left for later because the redundancy is
-- created by this migration: before it, that index was the only way to find a
-- person's notes on a thing. A duplicate nobody introduced deliberately is a
-- duplicate nobody removes.
drop index if exists public.notes_user_target_idx;

commit;
