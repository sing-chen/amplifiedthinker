-- Seed: the hardcoded ANNOUNCEMENTS array from public/index.html, moved into
-- the `announcements` table (Phase 7). This file is the array's successor and
-- its archive: values and per-item reasoning both survive here.
--
-- ⚠️ CONTENT, NOT SCHEMA. This is not a migration and does not belong in
-- supabase/migrations/ — the table it fills shipped in the initial schema.
-- Apply it once per project (dev while the phase is on its branch, prod in the
-- go-live step immediately before the merge), in the dashboard SQL editor,
-- exactly like a migration.
--
-- ⚠️ IDEMPOTENT BY PRIMARY KEY, AND THAT IS THE SAFETY. The uuids are fixed,
-- so a second run inserts nothing (`on conflict do nothing`) — and never
-- overwrites a row an admin has since edited. Same argument as the news
-- seed's `--only` guard: a seed that can touch rows it did not just author is
-- how admin edits get silently reverted.
--
-- HOW EXPIRY WAS TRANSLATED. The array's rule was
--   visible while daysSince(date) <= expiryDays   (type defaults 14/21)
-- with daysSince rounding to whole days at the viewer's local midnight. So an
-- item's last visible day was date + expiryDays, and it vanished at the next
-- midnight. Here that becomes
--   starts_at  = date at 00:00 UTC
--   expires_at = (date + expiryDays + 1 days) at 00:00 UTC
-- which matches the old behaviour to within the UK's one-hour summer-time
-- offset — the read policy compares against now() in UTC.
--
-- ⚠️ THE DATE-DRIFT TRAP FOLLOWS THE DATA. `announce_date` is the same fact
-- as the matching updates.json entry's date, now in a table and a file with
-- nothing checking they agree. Write the pair in one sitting; take the date
-- from the commit.

begin;

insert into public.announcements
  (id, type, announce_date, text_html, link_href, link_label, starts_at, expires_at, active, sort_order)
values
  -- 21 days rather than the 14-day feature default: a thing an account does
  -- on pages guests read too, so it is worth the longer run.
  ('2bbb6fa6-deb2-479d-8f20-b7cd8b04301c', 'feature', '2026-08-27',
   '<b>Notes on a primer or plan</b> — capture a thought against the section you are reading, and find everything you have written on your account page.',
   'future-skills.html', 'Go to Future Skills',
   '2026-08-27T00:00:00Z', '2026-09-18T00:00:00Z', true, 0),

  -- Date from the merge commit ee680a5, not the day it was written. 21 days
  -- on the same reasoning as above; not the 35 the Accounts item took — that
  -- changed how the whole site works, this adds to it.
  ('1062fdbc-5c5a-4332-90d3-cb09a525b98d', 'feature', '2026-08-26',
   '<b>Keep the news that matters</b> — save any story, pin one to the top of your own list, and write a private note against it.',
   'news/', 'Go to News',
   '2026-08-26T00:00:00Z', '2026-09-17T00:00:00Z', true, 0),

  -- Two items share 2026-08-21; sort_order preserves the array's order.
  ('f7a68c4a-bc95-4c40-a819-3c2e0c117633', 'feature', '2026-08-21',
   '<b>Your learning</b> — one page showing how far you are through every skill, primer and plan tracked separately.',
   'learning/', 'Take a look',
   '2026-08-21T00:00:00Z', '2026-09-05T00:00:00Z', true, 0),

  ('baa491f2-fff5-4501-a930-7bc987f0dba2', 'feature', '2026-08-21',
   '<b>Mark a plan complete</b> when you have actually worked through it — your call, not the page''s.',
   'future-skills.html', 'Browse the library',
   '2026-08-21T00:00:00Z', '2026-09-05T00:00:00Z', true, 1),

  -- 35 days: Accounts changed how the site works rather than adding another
  -- thing to it, so it stays up long enough for an occasional reader to meet
  -- it once.
  ('c3d7d1a2-4295-4cb3-bdcc-a386d6440fee', 'feature', '2026-08-20',
   '<b>Accounts</b> have landed — sign in and your place and your answers follow you to every device.',
   'why-sign-up.html', 'Why sign up',
   '2026-08-20T00:00:00Z', '2026-09-25T00:00:00Z', true, 0),

  ('41d414ca-3e45-45ff-9b9d-abde8207d79f', 'skill', '2026-08-13',
   '<b>Strategic Synthesis &amp; Decision-Making</b> just joined the library — turn conflicting, incomplete inputs into one defensible call.',
   'future-skills.html#s-strategic', 'Explore it',
   '2026-08-13T00:00:00Z', '2026-09-04T00:00:00Z', true, 0),

  -- Already expired when seeded — kept because the table is now the history
  -- of what was announced, and an inert row costs nothing.
  ('d0ab367f-333f-4945-b430-8247c090c4d6', 'skill', '2026-07-17',
   '<b>Systems Thinking</b> just joined the library — see interdependencies and feedback loops before they surface.',
   'future-skills.html#s-systems', 'Explore it',
   '2026-07-17T00:00:00Z', '2026-08-08T00:00:00Z', true, 0),

  -- Also expired. No link — the toggle is in the nav on every page.
  ('38f5b186-43b1-412b-b9e3-187166eb3ee8', 'feature', '2026-07-21',
   '<b>Dark Mode</b> has landed — toggle it anytime from the nav bar.',
   null, null,
   '2026-07-21T00:00:00Z', '2026-08-05T00:00:00Z', true, 0)

on conflict (id) do nothing;

commit;

-- Verify (should return 6 rows today, 2026-09-01 — the two July items are
-- past their window):
--   select announce_date, type, left(text_html, 40)
--   from public.announcements
--   where active and starts_at <= now() and (expires_at is null or expires_at > now())
--   order by announce_date desc, sort_order;
