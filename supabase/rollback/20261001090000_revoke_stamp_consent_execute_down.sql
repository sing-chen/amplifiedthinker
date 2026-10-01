-- Down-path for 20261001090000_revoke_stamp_consent_execute.sql
--
-- Restores the grants the function was created with, which is the state the
-- Supabase Advisor flagged. Only run this to isolate a problem the revoke caused -
-- it is not a state worth returning to otherwise.
--
-- Destroys no data. It touches privileges only, so it stays safe indefinitely.

begin;

grant execute on function public.profiles_stamp_updates_consent() to anon, authenticated;

commit;
