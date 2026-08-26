-- Reverses 20260826180000_news_stories_merged_into.sql.
--
-- ⚠️ THIS DISCARDS DATA, AND SILENTLY. Dropping the column throws away every
-- recorded merge pointer, so any previously shared link to an archived story
-- stops resolving to its survivor and starts returning 404 instead. Nothing
-- errors: the endpoint simply finds no pointer and behaves as it did before the
-- column existed.
--
-- Before running this, record what is in it — there is no other copy in the
-- database, and content/news.json's `mergedInto` is the only place it could be
-- reconstructed from:
--
--   select slug, merged_into from public.news_stories where merged_into is not null;

begin;

alter table public.news_stories
  drop constraint if exists news_stories_merged_into_archived_only;
alter table public.news_stories
  drop constraint if exists news_stories_merged_into_not_self;

alter table public.news_stories
  drop column if exists merged_into;

commit;
