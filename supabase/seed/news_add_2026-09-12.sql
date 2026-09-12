-- PARTIAL load for public.news_stories, GENERATED from content/news.json.
--
--   npm run build:news-seed -- --only 2026-09-12 --write
--
-- ⚠️ DO NOT HAND-EDIT. Regenerate instead; this file is an output.
--
-- Run it in the Supabase SQL editor, which executes as the table owner. The
-- anon key is refused by RLS (correctly) and `service_role` is deliberately
-- unavailable to this project — see the header of scripts/build-news-seed.mjs.
--
-- ⚠️ IDEMPOTENT ON `slug`: re-running updates in place instead of duplicating.
-- `slug` is the immutable public identifier from here on; `legacy_id` is the
-- OLD positional `<date>-<index>` form that shared links still point at, and it
-- is what the 301 endpoint resolves.
--
-- Generated from 2 stories for 2026-09-12, out of 100 in the file.
--
-- ⚠️ PARTIAL. This touches ONLY the rows listed below. It is not a
-- replacement for supabase/seed/news_seed.sql and does not reconcile
-- anything it omits.

insert into public.news_stories
  (slug, legacy_id, story_date, sort_order, title, source, url, summary, implications, tags, pinned, status)
values
  ('2026-09-12-when-ai-disruption-never-ends', '2026-09-12-0', '2026-09-12'::date, 0, 'When AI Disruption Never Ends', 'MIT Sloan Management Review', 'https://sloanreview.mit.edu/article/when-ai-disruption-never-ends/', 'Rory McDonald and Will Drover argue AI has produced perpetual rather than episodic disruption, which breaks conventional change management built on the assumption that transitions eventually conclude. They set out three “steady-state disruption” practices: permanent AI infrastructure instead of rolling pilots, split cadences for initiatives moving at different speeds, and embedded learning held as standing capacity. Their core claim is that optimising for speed alone produces organisational fatigue and loses to organisations built for endurance.', 'If you have been waiting for tooling to stabilise before investing in depth, stop — there is no settling point to wait for, so build learning into your weekly cadence rather than treating it as a project with an end date. Notice too whether your organisation runs everything at one urgent tempo; that is the pattern the authors identify as the fatigue driver, and it is worth naming when you scope your own work.', ARRAY['workforce transformation', 'leadership and culture']::text[], false, 'published'),
  ('2026-09-12-right-sizing-ai-at-work-workforce-transformation-and-human', '2026-09-12-1', '2026-09-12'::date, 1, 'Right-Sizing AI at Work: Workforce Transformation and Human-Machine Partnerships in Ireland', 'Trinity College Dublin', 'https://www.tcd.ie/news_events/top-stories/featured/new-research-from-technology-ireland-digital-skillnet-/', 'Survey research from the Centre for Sociology of Humans and Machines, a joint centre at Trinity College Dublin and TU Dublin led by Taha Yasseri, finds AI’s effect on Irish workplaces is currently task and workflow transformation rather than large-scale job elimination. 47.4% of workers use AI tools daily, 64.7% describe themselves as confident and 69% feel prepared to adapt their skills — but the study identifies a clear gap between that confidence and participation in formal training. Workers increasingly occupy review, verification, coordination and judgement roles over AI-supported output, which the researchers say calls for structured, role-specific skills development rather than general AI literacy.', 'Self-taught confidence is not the same as verified competence — if your AI-assisted work has never been checked against a standard, you are inside the gap this study measures, so seek role-specific practice and real feedback rather than more tool exposure. Recognise too that the task mix is shifting toward verification and judgement: the skill that pays is the domain depth that lets you spot a plausible-but-wrong answer.', ARRAY['research and insights', 'workforce transformation', 'skills development']::text[], false, 'published')
on conflict (slug) do update set
  legacy_id    = excluded.legacy_id,
  story_date   = excluded.story_date,
  sort_order   = excluded.sort_order,
  title        = excluded.title,
  source       = excluded.source,
  url          = excluded.url,
  summary      = excluded.summary,
  implications = excluded.implications,
  tags         = excluded.tags,
  pinned       = excluded.pinned,
  status       = excluded.status;

-- Nothing in this batch is merged away; clear any pointer left by a
-- previous run so the file stays the source of truth.
update public.news_stories set merged_into = null
 where slug in ('2026-09-12-when-ai-disruption-never-ends', '2026-09-12-right-sizing-ai-at-work-workforce-transformation-and-human') and merged_into is not null;

-- Verification, to run in the same sitting:
--   select count(*) from public.news_stories
--     where story_date in ('2026-09-12');  -- expect 2
--   select count(*) from public.news_stories where pinned;           -- expect at most 1
--   select title from public.news_stories where title ~ '[^[:ascii:]]' limit 5;
--     -- eyeball these: accented text must read correctly, not as mojibake
