-- PARTIAL load for public.news_stories, GENERATED from content/news.json.
--
--   npm run build:news-seed -- --only 2026-09-07 --write
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
-- Generated from 3 stories for 2026-09-07, out of 93 in the file.
--
-- ⚠️ PARTIAL. This touches ONLY the rows listed below. It is not a
-- replacement for supabase/seed/news_seed.sql and does not reconcile
-- anything it omits.

insert into public.news_stories
  (slug, legacy_id, story_date, sort_order, title, source, url, summary, implications, tags, pinned, status)
values
  ('2026-09-07-10-levers-for-shaping-generative-ai-that-truly-improves', '2026-09-07-0', '2026-09-07'::date, 0, '10 Levers for Shaping Generative AI That Truly Improves Worker Performance', 'MIT Sloan Ideas Made to Matter', 'https://mitsloan.mit.edu/ideas-made-to-matter/10-levers-shaping-generative-ai-truly-improves-worker-performance', 'Draws on Humans in the Loop, from the MIT Working Group on Generative AI and the Work of the Future, built on interviews at more than 20 companies across healthcare, retail, finance and manufacturing. It sets out three operating principles — gather evidence before scaling, one size does not fit all, and learn when to trust — alongside seven outcomes including minimising drudgery, promoting learning, preserving teamwork and continuing to invest in domain expertise. The researchers warn specifically against “mental offloading”, where workers bypass the learning a task would otherwise have produced.', 'Deployment decisions are also learning-design decisions: a rollout that strips out the effortful part of a task removes the mechanism that built the judgment needed to tell when the output is wrong. Capability builders should name which work deliberately stays manual in the areas where domain expertise is the differentiator, and treat evidence-before-scaling as a precondition rather than a post-hoc review. Note the framing is September coverage; the underlying report dates from April 2026.', ARRAY['skills development', 'workforce transformation', 'research and insights']::text[], false, 'published'),
  ('2026-09-07-steady-as-she-goes-remote-work-benefits-daily-goal-progress', '2026-09-07-1', '2026-09-07'::date, 1, 'Steady as She Goes: Remote Work Benefits Daily Goal Progress Through Reduced Energy Variability', 'Organization Science', 'https://pubsonline.informs.org/doi/10.1287/orsc.2025.20962', 'Hourly energy sampling of 219 hybrid employees across five consecutive workdays — 4,812 observations — found roughly 33% less energy variability on work-from-home days than on office days. The predictive variable is variability rather than mean energy level: each one-percentage-point reduction in variability was associated with 26% higher daily goal progress. Offices introduce more varied, unpredictable stimuli, fragmenting the steady energy profile that sustained cognitive work depends on.', 'Gives the return-to-office argument a measurable mechanism rather than another headcount-level correlation — and the mechanism points at scheduling rather than location policy. The design question becomes which work goes on which day: work needing sustained cognitive traction belongs on the lowest-interruption day, while office days earn their cost through the collaborative work that actually benefits from varied stimuli.', ARRAY['leadership and culture', 'workforce transformation', 'research and insights']::text[], false, 'published'),
  ('2026-09-07-the-four-essential-elements-of-successful-situations', '2026-09-07-2', '2026-09-07'::date, 2, 'The Four Essential Elements of Successful Situations', 'Knowledge at Wharton', 'https://knowledge.wharton.upenn.edu/article/the-four-essential-elements-of-successful-situations/', 'An excerpt from Angela Duckworth’s Situated that moves past grit toward what she calls situational agency. The argument is that effort has a multiplier and the multiplier is environmental — some ways of trying are structurally better than others — and that four levers sit within an individual’s control: arranging your space, selecting your peers, attracting mentors, and choosing your culture.', 'A counterweight to development models that locate capability entirely in the individual or entirely in the organisation, naming four environmental levers a person can pull without waiting for a programme to arrive. Worth pairing with any resilience or self-discipline intervention, which typically asks people to try harder inside a situation nobody has thought to examine.', ARRAY['skills development', 'leadership and culture']::text[], false, 'published')
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
 where slug in ('2026-09-07-10-levers-for-shaping-generative-ai-that-truly-improves', '2026-09-07-steady-as-she-goes-remote-work-benefits-daily-goal-progress', '2026-09-07-the-four-essential-elements-of-successful-situations') and merged_into is not null;

-- Verification, to run in the same sitting:
--   select count(*) from public.news_stories
--     where story_date in ('2026-09-07');  -- expect 3
--   select count(*) from public.news_stories where pinned;           -- expect at most 1
--   select title from public.news_stories where title ~ '[^[:ascii:]]' limit 5;
--     -- eyeball these: accented text must read correctly, not as mojibake
