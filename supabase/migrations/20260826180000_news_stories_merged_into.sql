-- `merged_into`: where an archived story's old links should land.
--
-- ⚠️ WHY A COLUMN RATHER THAN INFERRING IT. Two stories were found on
-- 2026-08-26 to have been published twice each, weeks apart, under different
-- headlines but against the SAME source URL — so the obvious shortcut was to
-- resolve an archived story to whichever published row shares its `url`. That
-- works today and is wrong as a rule: it couples redirect behaviour to URL
-- equality, which is a coincidence of how these two duplicates happened to be
-- found rather than a statement anyone made. A story withdrawn for any other
-- reason has no URL twin, and would resolve to nothing while looking correct.
--
-- ⚠️ THIS IS WHAT KEEPS A MERGE FROM BREAKING LINKS. `legacy_id` is
-- `<date>-<array index>`, so a duplicate CANNOT simply be deleted from
-- content/news.json — removing an entry renumbers every story after it in that
-- date group and silently repoints every link previously shared for them. The
-- duplicate therefore stays exactly where it is and becomes `archived`; this
-- column is how `/news.html?story=<its legacy_id>` still reaches a real story.
--
-- The foreign key is the point: it makes a dangling pointer impossible at the
-- database rather than merely unlikely. `on delete set null` because losing the
-- target should degrade the redirect to a 404, never block the delete.
--
-- Nothing is required to set it. A story can be archived without being merged.

begin;

alter table public.news_stories
  add column if not exists merged_into text
    references public.news_stories (slug) on delete set null;

-- ⚠️ A row pointing at itself would make the 301 endpoint redirect to the URL it
-- was just asked about, which browsers cache. `slug` is stable, so this is
-- checkable and worth checking.
alter table public.news_stories
  drop constraint if exists news_stories_merged_into_not_self;
alter table public.news_stories
  add constraint news_stories_merged_into_not_self
    check (merged_into is null or merged_into <> slug);

-- Only archived rows are merged away. A published story with a pointer would
-- appear in the feed AND redirect old links elsewhere, which is incoherent.
alter table public.news_stories
  drop constraint if exists news_stories_merged_into_archived_only;
alter table public.news_stories
  add constraint news_stories_merged_into_archived_only
    check (merged_into is null or status = 'archived');

comment on column public.news_stories.merged_into is
  'Slug of the story this one was merged into. Set only on archived rows; the '
  '301 endpoint follows it so a previously shared link reaches the surviving '
  'story instead of 404ing.';

commit;
