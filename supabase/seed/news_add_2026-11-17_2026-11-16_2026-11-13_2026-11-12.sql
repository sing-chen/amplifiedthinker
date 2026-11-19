-- PARTIAL load for public.news_stories, GENERATED from content/news.json.
--
--   npm run build:news-seed -- --only 2026-11-17 --only 2026-11-16 --only 2026-11-13 --only 2026-11-12 --write
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
-- Generated from 4 stories for 2026-11-17, 2026-11-16, 2026-11-13, 2026-11-12, out of 128 in the file.
--
-- ⚠️ PARTIAL. This touches ONLY the rows listed below. It is not a
-- replacement for supabase/seed/news_seed.sql and does not reconcile
-- anything it omits.

insert into public.news_stories
  (slug, legacy_id, story_date, sort_order, title, source, url, summary, implications, tags, pinned, status)
values
  ('2026-11-17-lse-and-protiviti-ai-saves-a-fifth-of-the-week-but', '2026-11-17-0', '2026-11-17'::date, 0, 'LSE and Protiviti: AI saves a fifth of the week, but performance tracks resilience and willingness to learn, not AI use', 'The Inclusion Initiative at the London School of Economics, with Protiviti', 'https://www.protiviti.com/gl-en/press-release-ai-at-work-lse-protiviti-research', 'The third annual LSE Inclusion Initiative report, ‘Beyond the Technology: Who Really Captures AI’s Gains at Work’, surveyed 3,001 professionals worldwide (March–May 2026). AI users say they save about 19% of their working week but put 72% of that time back into more work, a pattern the authors call ‘workload creep’, and 48% worry about being judged for not using AI enough. Self-rated performance showed no consistent link to AI adoption, training or access; it tracked conscientiousness, resilience, confidence in solving problems and willingness to learn.', 'Decide on purpose where your saved hours go: protect some for learning or deeper work instead of letting them fill up with more of the same tasks. Don’t treat visible AI use as your performance story; the traits that predicted performance here — resilience, problem-solving confidence, willingness to learn — are the ones to build and show.', ARRAY['skills development', 'workforce transformation', 'research and insights']::text[], false, 'published'),
  ('2026-11-16-gartners-2027-workforce-risks-capability-quietly-lost-change', '2026-11-16-0', '2026-11-16'::date, 0, 'Gartner’s 2027 workforce risks: capability quietly lost, change fatigue, and rewards that miss what people need', 'Gartner', 'https://www.gartner.com/en/newsroom/press-releases/2026-11-16-gartner-unveils-top-enterprise-risks-set-to-redefine-workforces-in-2027', 'At its HR Symposium in Sydney, Gartner named four risks for 2027: leadership misalignment (68% of CHROs say over 10% of their leaders are misaligned on strategy), capability lost through premature AI-driven cuts (it predicts 30% of people replaced by AI will be rehired by 2029, often at higher cost), change fatigue that wears down engagement, and rewards that do not fit what employees need. Gartner says employees experience change as the combined weight of shifting priorities rather than as separate initiatives, and that intent to stay and performance both rose 17% when rewards felt relevant to people’s needs.', 'Use these risks to read your own environment: if priorities keep shifting and leaders give different answers, write down for yourself how your daily work connects to the bigger picture, because Gartner names losing that link as a main cause of disengagement. Keep a record of the knowledge only you hold; Gartner’s point that lost capability is less visible than cost savings is a reason to make yours visible.', ARRAY['research and insights', 'workforce transformation', 'leadership and culture']::text[], false, 'published'),
  ('2026-11-13-likely-means-different-things-to-different-people-three', '2026-11-13-0', '2026-11-13'::date, 0, '‘Likely’ means different things to different people: three decision styles emerge when probabilities come in words versus numbers', 'The University of Tokyo', 'https://www.u-tokyo.ac.jp/focus/en/press/z0508_00485.html', 'University of Tokyo researchers asked 138 people (48 with autism spectrum disorder) to recommend a treatment based on a doctor’s statement of its chance of success, given either as a number or in words such as ‘likely’. Three decision styles emerged: one driven mainly by the positive or negative framing of the words, one driven by the numbers people inferred from them, and a mixed group. The authors conclude that communicating uncertainty is not just a matter of choosing clear words, and that speakers should check how their meaning was understood. The study appeared in Psychonomic Bulletin & Review.', 'When you give a forecast or risk estimate, put a number next to the word (‘likely — about 70%’), because your listeners may be reacting to the tone of the word rather than the odds. When you are the one deciding, turn others’ vague probability words into numbers before you act on them.', ARRAY['skills development', 'research and insights']::text[], false, 'published'),
  ('2026-11-12-habit-not-curiosity-drives-hidden-shadow-ai-use-at-work-and', '2026-11-12-0', '2026-11-12'::date, 0, 'Habit, not curiosity, drives hidden ‘shadow AI’ use at work, and policy without training makes concealment worse', 'arXiv (Old Dominion University and Texas A&M University)', 'https://arxiv.org/abs/2611.16931', 'A survey of 510 employed generative-AI users found that habit explained the most variance in unsanctioned AI use, while curiosity-driven exploration added little once usage habits were accounted for. About a fifth of respondents concealed their AI use, and concealment was highest where employers had an AI policy but no training (31%) and lowest where they trained without a policy (14%). An open climate for experimentation and knowledge sharing, plus perceived professional support, were linked to less concealment. It is a cross-sectional preprint, so it cannot show cause and effect.', 'If your AI use has become automatic, check whether it is also invisible: hidden use cuts you off from the feedback and shared learning that build real skill. When you choose teams or employers, treat an open climate for experimenting and sharing what works as a sign of a place where you will develop faster.', ARRAY['workforce transformation', 'skills development', 'research and insights']::text[], false, 'published')
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
 where slug in ('2026-11-17-lse-and-protiviti-ai-saves-a-fifth-of-the-week-but', '2026-11-16-gartners-2027-workforce-risks-capability-quietly-lost-change', '2026-11-13-likely-means-different-things-to-different-people-three', '2026-11-12-habit-not-curiosity-drives-hidden-shadow-ai-use-at-work-and') and merged_into is not null;

-- Verification, to run in the same sitting:
--   select count(*) from public.news_stories
--     where story_date in ('2026-11-17', '2026-11-16', '2026-11-13', '2026-11-12');  -- expect 4
--   select count(*) from public.news_stories where pinned;           -- expect at most 1
--   select title from public.news_stories where title ~ '[^[:ascii:]]' limit 5;
--     -- eyeball these: accented text must read correctly, not as mojibake
