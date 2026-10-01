-- Clear the Advisor's auth_rls_initplan warnings (5) and the one unindexed foreign
-- key that matters (user_news.story_id). Found by the performance Advisor on
-- 2026-10-01.
--
-- 1. auth_rls_initplan. A policy that calls auth.uid() bare has it re-evaluated for
--    every row it considers. Written as (select auth.uid()) the planner treats it as
--    an InitPlan and evaluates it once per statement. The meaning is identical -
--    auth.uid() is stable within a statement - so this changes no one's access.
--
--    ALTER POLICY rather than drop and recreate: it changes only the expressions, so
--    the role list, the command and the permissive flag cannot be got wrong in the
--    retyping, and there is no instant at which the table has no policy.
--
--    These five guard the user-owned tables, which grow with signed-in readers.
--    notes is the first free text on the site and RLS is the only thing scoping it,
--    so after applying this run `npm run verify:rls` AND the second-account check:
--    the app always sends .eq('user_id', uid), so a broken policy would look
--    exactly like a working one from inside the site.
--
-- 2. user_news.story_id. The primary key is (user_id, story_id), which cannot serve
--    a lookup by story_id alone. This is what a story delete's cascade and any
--    "who saved this story" query would scan. The other two unindexed foreign keys
--    (blog_posts.author_id, news_stories.merged_into) are on tables too small, or a
--    column too rarely read, to be worth an index yet.
--
-- Deliberately NOT done: the 7 multiple_permissive_policies warnings. Merging
-- policies can widen or narrow access if one is retyped wrongly, and nothing here is
-- large enough for the saving to show. Revisit news_stories if it grows.

begin;

alter policy notes_own on public.notes
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy skill_progress_own on public.skill_progress
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy user_news_own on public.user_news
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()));

alter policy profiles_update_own on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create index if not exists user_news_story_idx on public.user_news (story_id);

commit;
