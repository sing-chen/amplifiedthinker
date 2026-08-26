-- Scopes `notes_one_per_target_idx` to news stories.
--
-- ⚠️ A SECOND MIGRATION RATHER THAN AN EDIT TO 20260826120000, which created
-- that index and is already applied to dev. An applied migration is history:
-- editing it means the file no longer describes the database that exists, and
-- anyone rebuilding from scratch gets something different from what is running.
-- Same principle 20260817140000 was written under.
--
-- ⚠️ WHY THE ORIGINAL WAS TOO BROAD, AND IT WAS ACCIDENTAL REACH RATHER THAN A
-- CHANGE OF MIND. "One note per person per thing" was reasoned about entirely in
-- terms of NEWS STORIES: a story is short, a note on it is a single reaction,
-- and one row per story is what lets the client upsert on a stable conflict
-- target instead of read-then-branch. `notes` is polymorphic, so writing the
-- index across the whole table silently bound `target_type = 'skill'` as well —
-- a half of the table nobody had designed yet.
--
-- ⚠️ AND IT BOUND IT WRONG. Notes on primers and plans need to be MANY per plan,
-- because of how people actually read one: the reader is in step 7 when the
-- thought about step 3 arrives, and sending them back to step 3 to write it down
-- interrupts the reading to file the note — the note is the thing that gets
-- abandoned. With `target_id` set to a plan, the old index permits exactly one.
-- See BACKLOG.md §Notes on primers and plans.
--
-- ⚠️ THIS BREAKS ANY `ON CONFLICT (user_id, target_type, target_id)` UPSERT,
-- AND AN EARLIER VERSION OF THIS COMMENT CLAIMED IT DID NOT. It said "a partial
-- index still serves that conflict target for the rows it covers". That is
-- false. Postgres can only INFER a partial unique index for ON CONFLICT if the
-- statement carries the index's own WHERE predicate, and PostgREST does not
-- emit one — so through supabase-js a partial index cannot serve an upsert at
-- all, not even for rows inside the predicate. The symptom is immediate and
-- clear:
--
--     there is no unique or exclusion constraint matching
--     the ON CONFLICT specification
--
-- `public/news-actions.js` was changed in the same sitting to update-then-insert
-- instead, which is why this index no longer has a client depending on its
-- inferability. ⚠️ Do not reintroduce an upsert against it.
--
-- `user_news` is unaffected: its upsert conflicts on `(user_id, story_id)`,
-- which is the PRIMARY KEY and not partial.
--
-- The 500-character `notes_body_length` is untouched and applies to both halves;
-- a plan does not need a longer note, it needs more of them.

begin;

drop index if exists public.notes_one_per_target_idx;

create unique index notes_one_per_target_idx
  on public.notes (user_id, target_type, target_id)
  where target_type = 'news';

commit;
