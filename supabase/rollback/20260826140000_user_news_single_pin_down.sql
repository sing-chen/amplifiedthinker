-- Reverses 20260826140000_user_news_single_pin.sql.
--
-- ⚠️ IT DOES NOT RESTORE PINS THE TRIGGER CLEARED. Every time a reader pinned a
-- second story, the first was set to `pinned = false` and that is not recorded
-- anywhere. Rolling back re-permits many pins per reader; it cannot recover the
-- ones that were replaced while the rule was in force.
--
-- ⚠️ Order matters. The index must go before the trigger, or a rollback run on
-- a live database could leave the trigger clearing pins that the index no longer
-- requires to be unique — briefly enforcing a rule nothing asks for.

begin;

drop index if exists public.user_news_single_pin_idx;

drop trigger if exists user_news_single_pin on public.user_news;

drop function if exists public.user_news_single_pin();

commit;
