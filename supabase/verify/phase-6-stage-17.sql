-- Reads back what the four Phase 6 stage-14/16 migrations were supposed to do.
--
-- Run it in the Supabase SQL editor AFTER applying all four, against the same
-- project you applied them to. It only reads catalogue tables.
--
-- ⚠️ DDL RETURNS "Success. No rows returned" WHETHER OR NOT IT DID WHAT WAS
-- INTENDED, and each of these migrations is wrapped in begin/commit — so one
-- failed statement rolls back the others while the error names only itself.
-- That already happened once on dev: a 42710 on a constraint took the index
-- with it, and the message mentioned the constraint alone. Reading the
-- catalogue is the only way to know which of the four actually landed.
--
-- Every answer below is stated. A query returning nothing is a FAILURE, not a
-- pass — there is no check here whose correct result is an empty set.


-- ── 1 · 20260826120000 — a note is 1–500 characters ─────────────────────────
-- EXPECT exactly one row:
--   notes_body_length | CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500)))
-- ⚠️ If it says 2000, an older version of this migration was applied. Re-run it;
--    it drops the constraint before adding it, so it is safe.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.notes'::regclass
   and contype = 'c';


-- ── 2 · indexes on notes and user_news ──────────────────────────────────────
-- EXPECT exactly these three, and NOT notes_user_target_idx:
--
--   notes      notes_one_per_target_idx    UNIQUE ... (user_id, target_type, target_id)
--                                          WHERE (target_type = 'news'::text)   <-- #3 did this
--   user_news  user_news_pkey              PRIMARY KEY ... (user_id, story_id)
--   user_news  user_news_single_pin_idx    UNIQUE ... (user_id) WHERE pinned    <-- #2 did this
--
-- ⚠️ TWO FAILURES HIDE HERE AND BOTH LOOK HEALTHY:
--   · notes_one_per_target_idx present but WITHOUT the WHERE clause means #3 did
--     not run. The site behaves identically; the damage appears months later
--     when someone tries to write a second note on a plan.
--   · notes_user_target_idx still present means #1 did not finish. Harmless to
--     reads, but it is a second B-tree maintained on every write for nothing.
select tablename, indexname, indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('notes', 'user_news')
 order by tablename, indexname;


-- ── 3 · 20260826140000 — the single-pin trigger ─────────────────────────────
-- EXPECT one row: user_news_single_pin | INVOKER
-- ⚠️ `DEFINER` IS A SECURITY FAILURE, NOT A STYLE ONE. As DEFINER the function
--    runs as its owner and bypasses the RLS that confines it to the caller's own
--    rows — so one reader's pin could clear another's.
select proname,
       case when prosecdef then 'DEFINER  <-- WRONG' else 'INVOKER' end as security
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'user_news_single_pin';

-- EXPECT one row: user_news_single_pin
-- The index above is the structural guarantee; this is what keeps the data
-- correct in the first place. The index without the trigger turns a silent
-- replace into an error the reader sees.
select tgname
  from pg_trigger
 where tgrelid = 'public.user_news'::regclass
   and not tgisinternal;


-- ── 4 · 20260826180000 — merged_into on news_stories ────────────────────────
-- EXPECT one row: merged_into | text | YES
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'news_stories'
   and column_name = 'merged_into';

-- EXPECT three rows — one foreign key and two checks:
--   news_stories_merged_into_fkey            FOREIGN KEY (merged_into)
--                                              REFERENCES news_stories(slug) ON DELETE SET NULL
--   news_stories_merged_into_not_self        CHECK (merged_into IS NULL OR merged_into <> slug)
--   news_stories_merged_into_archived_only   CHECK (merged_into IS NULL OR status = 'archived')
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.news_stories'::regclass
   and conname like '%merged_into%'
 order by conname;


-- ── 5 · after the news seed, not before ─────────────────────────────────────
-- ⚠️ RUN THIS ONLY ONCE supabase/seed/news_seed.sql HAS BEEN APPLIED. Before
--    that the table is empty and every row below is legitimately absent.
--
-- EXPECT exactly:  archived   2
--                  published 79
-- and NO 'draft' row.
-- ⚠️ Do not substitute `select count(*)` — 81 is satisfied by 81 rows in any
--    status, so it reads as a pass on a load that published the archived ones.
select status, count(*)
  from public.news_stories
 group by status
 order by status;

-- EXPECT 2 rows, both with target_status = 'published'.
-- An empty result means the merge pointers did not land: those two stories are
-- then invisible in the feed AND unreachable by their old links, which is the
-- one outcome archiving exists to prevent.
select a.legacy_id, a.merged_into, t.status as target_status
  from public.news_stories a
  join public.news_stories t on t.slug = a.merged_into
 where a.status = 'archived'
 order by a.legacy_id;

-- EXPECT 1 row — exactly one site-wide Featured story.
select slug from public.news_stories where pinned;

-- EXPECT a handful of rows, all reading as correct accented text.
-- ⚠️ Eyeball these. `Brené` here means the load carried CP1252-decoded UTF-8,
--    which is valid JSON, the right row count, and every other check green.
select title
  from public.news_stories
 where title ~ '[^[:ascii:]]'
 limit 5;
