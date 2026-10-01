-- Down-path for 20261001100000_rls_initplan_and_story_index.sql
--
-- Puts the five policies back to the bare auth.uid() form and drops the index. The
-- two forms mean the same thing, so this is only for isolating a problem the
-- rewrite caused - the bare form is what the Advisor flagged.
--
-- Destroys no data. Policies and an index only, so it stays safe indefinitely.

begin;

alter policy notes_own on public.notes
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter policy skill_progress_own on public.skill_progress
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter policy user_news_own on public.user_news
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter policy profiles_select_own on public.profiles
  using (id = auth.uid());

alter policy profiles_update_own on public.profiles
  using (id = auth.uid())
  with check (id = auth.uid());

drop index if exists public.user_news_story_idx;

commit;
