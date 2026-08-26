-- Reads back what the four Phase 6 stage-14/16 migrations were supposed to do.
--
-- ⚠️ TWO QUERIES, RUN THEM SEPARATELY. The Supabase SQL editor shows only the
-- LAST statement's result, so a file of ten `select`s runs all ten and displays
-- one — every earlier check passes or fails invisibly. That is exactly the
-- failure this file exists to prevent, and the first version of it had the bug.
-- Each block below is therefore ONE query returning one row per check.
--
-- ⚠️ AND THAT IS WHY "Success. No rows returned" IS NOT EVIDENCE. All four
-- migrations report it whether or not they did what was intended, and each is
-- wrapped in begin/commit — so one failed statement rolls the others back while
-- the error names only itself.
--
-- Every row has a verdict. Read the FAIL column, not the row count.


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK A · SCHEMA — run after the four migrations. Select and run alone.
-- ════════════════════════════════════════════════════════════════════════════

with c(ord, label, ok, detail) as (

  select 1, '#1 notes_body_length is 1-500',
    coalesce((select strpos(pg_get_constraintdef(oid), 'char_length(body) >= 1') > 0
                 and strpos(pg_get_constraintdef(oid), '500') > 0
              from pg_constraint
              where conrelid = 'public.notes'::regclass and conname = 'notes_body_length'), false),
    coalesce((select pg_get_constraintdef(oid) from pg_constraint
              where conrelid = 'public.notes'::regclass and conname = 'notes_body_length'),
             'CONSTRAINT ABSENT')

  union all
  select 2, '#3 notes index is UNIQUE and scoped to news',
    coalesce((select strpos(indexdef, 'UNIQUE') > 0
                 and strpos(indexdef, 'target_type = ''news''') > 0
              from pg_indexes
              where schemaname = 'public' and indexname = 'notes_one_per_target_idx'), false),
    coalesce((select indexdef from pg_indexes
              where schemaname = 'public' and indexname = 'notes_one_per_target_idx'),
             'INDEX ABSENT')

  union all
  select 3, '#1 redundant notes_user_target_idx is gone',
    not exists (select 1 from pg_indexes
                where schemaname = 'public' and indexname = 'notes_user_target_idx'),
    case when exists (select 1 from pg_indexes
                      where schemaname = 'public' and indexname = 'notes_user_target_idx')
         then 'still present - migration #1 did not finish' else 'dropped' end

  union all
  select 4, '#2 user_news_single_pin_idx is UNIQUE where pinned',
    coalesce((select strpos(indexdef, 'UNIQUE') > 0 and strpos(indexdef, 'pinned') > 0
              from pg_indexes
              where schemaname = 'public' and indexname = 'user_news_single_pin_idx'), false),
    coalesce((select indexdef from pg_indexes
              where schemaname = 'public' and indexname = 'user_news_single_pin_idx'),
             'INDEX ABSENT')

  union all
  select 5, '#2 user_news_single_pin() is SECURITY INVOKER',
    coalesce((select not prosecdef from pg_proc
              where pronamespace = 'public'::regnamespace
                and proname = 'user_news_single_pin'), false),
    coalesce((select case when prosecdef then 'DEFINER - bypasses the RLS that confines it'
                          else 'INVOKER' end
              from pg_proc
              where pronamespace = 'public'::regnamespace
                and proname = 'user_news_single_pin'), 'FUNCTION ABSENT')

  union all
  select 6, '#2 the trigger itself exists',
    exists (select 1 from pg_trigger
            where tgrelid = 'public.user_news'::regclass
              and tgname = 'user_news_single_pin' and not tgisinternal),
    case when exists (select 1 from pg_trigger
                      where tgrelid = 'public.user_news'::regclass
                        and tgname = 'user_news_single_pin' and not tgisinternal)
         then 'present' else 'TRIGGER ABSENT - the index would turn a silent replace into an error' end

  union all
  select 7, '#4 news_stories.merged_into exists, text, nullable',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'news_stories'
              and column_name = 'merged_into' and data_type = 'text'
              and is_nullable = 'YES'),
    coalesce((select data_type || ', nullable ' || is_nullable
              from information_schema.columns
              where table_schema = 'public' and table_name = 'news_stories'
                and column_name = 'merged_into'), 'COLUMN ABSENT')

  union all
  select 8, '#4 foreign key to news_stories(slug)',
    exists (select 1 from pg_constraint
            where conrelid = 'public.news_stories'::regclass
              and contype = 'f' and strpos(pg_get_constraintdef(oid), 'merged_into') > 0),
    coalesce((select pg_get_constraintdef(oid) from pg_constraint
              where conrelid = 'public.news_stories'::regclass
                and contype = 'f' and strpos(pg_get_constraintdef(oid), 'merged_into') > 0),
             'FOREIGN KEY ABSENT')

  union all
  select 9, '#4 check: cannot point at itself',
    exists (select 1 from pg_constraint
            where conrelid = 'public.news_stories'::regclass
              and conname = 'news_stories_merged_into_not_self'),
    coalesce((select pg_get_constraintdef(oid) from pg_constraint
              where conrelid = 'public.news_stories'::regclass
                and conname = 'news_stories_merged_into_not_self'), 'CHECK ABSENT')

  union all
  select 10, '#4 check: only archived rows carry a pointer',
    exists (select 1 from pg_constraint
            where conrelid = 'public.news_stories'::regclass
              and conname = 'news_stories_merged_into_archived_only'),
    coalesce((select pg_get_constraintdef(oid) from pg_constraint
              where conrelid = 'public.news_stories'::regclass
                and conname = 'news_stories_merged_into_archived_only'), 'CHECK ABSENT')
)
select ord           as "#",
       case when ok then 'PASS' else '>>> FAIL' end as verdict,
       label,
       detail
  from c
 order by ord;

-- EXPECT 10 rows, all PASS.
--
-- ⚠️ The two that look healthy from the site when they fail:
--   #2  the notes index without `target_type = 'news'` — behaves identically
--       today, and only surfaces when someone writes a second note on a plan.
--   #5  SECURITY DEFINER — the function would run as its owner and bypass the
--       RLS confining it to the caller's own rows, so one reader's pin could
--       clear another's.


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK B · DATA — run AFTER supabase/seed/news_seed.sql. Select and run alone.
-- ⚠️ Before the seed the table is empty and every row here fails correctly.
-- ════════════════════════════════════════════════════════════════════════════

with d(ord, label, ok, detail) as (

  select 1, 'row count and status split',
    (select count(*) = 81 from public.news_stories)
    and (select count(*) = 79 from public.news_stories where status = 'published')
    and (select count(*) = 2  from public.news_stories where status = 'archived'),
    (select coalesce(string_agg(status || ' ' || n, ', ' order by status), 'TABLE EMPTY')
       from (select status, count(*) as n from public.news_stories group by status) s)

  union all
  select 2, 'no draft rows are present',
    not exists (select 1 from public.news_stories where status = 'draft'),
    (select coalesce(count(*)::text || ' draft row(s)', '0')
       from public.news_stories where status = 'draft')

  union all
  select 3, 'slug and legacy_id are both unique across 81',
    (select count(distinct slug) = 81 and count(distinct legacy_id) = 81
       from public.news_stories),
    (select count(distinct slug) || ' slugs, ' || count(distinct legacy_id) || ' legacy_ids'
       from public.news_stories)

  union all
  select 4, 'every archived row points at a PUBLISHED story',
    (select count(*) = 2 from public.news_stories a
       join public.news_stories t on t.slug = a.merged_into
      where a.status = 'archived' and t.status = 'published'),
    (select coalesce(string_agg(a.legacy_id || ' -> ' || coalesce(t.status, 'DANGLING'), ', '
                                order by a.legacy_id), 'no archived rows')
       from public.news_stories a
       left join public.news_stories t on t.slug = a.merged_into
      where a.status = 'archived')

  union all
  select 5, 'exactly one site-wide Featured story',
    (select count(*) = 1 from public.news_stories where pinned),
    (select coalesce(string_agg(slug, ', '), 'NONE') from public.news_stories where pinned)

  union all
  select 6, 'accented titles survived the load',
    not exists (select 1 from public.news_stories
                where title ~ 'Ã|â€|Â'),
    (select coalesce(string_agg(left(title, 60), ' | '), 'no mojibake found')
       from public.news_stories where title ~ 'Ã|â€|Â')
)
select ord           as "#",
       case when ok then 'PASS' else '>>> FAIL' end as verdict,
       label,
       detail
  from d
 order by ord;

-- EXPECT 6 rows, all PASS.
--
-- ⚠️ Check #1 replaces `select count(*)`, which is satisfied by 81 rows in ANY
--    status and so reads as a pass on a load that published the archived ones.
-- ⚠️ Check #6 looks for the CP1252 signatures rather than for correct text: a
--    title reading `Brené` is valid JSON with the right row count and every
--    other check green.
--
-- ⚠️ AND CHECK #6 CAN BE DISARMED BY THE VERY FAULT IT LOOKS FOR. Its pattern is
--    written as literal mojibake, so if THIS FILE is ever re-encoded the pattern
--    becomes something else and the check quietly passes everything. That is why
--    scripts/verify-encoding.mjs builds its equivalent list with
--    String.fromCharCode and keeps its own source pure ASCII. SQL has no such
--    escape hatch, so the mitigation is procedural: this file is pasted, never
--    round-tripped through an editor that rewrites encodings, and `npm run
--    verify:encoding` covers it in the repo. If check #6 ever passes on a load
--    you have reason to doubt, read a title with your eyes before trusting it.
