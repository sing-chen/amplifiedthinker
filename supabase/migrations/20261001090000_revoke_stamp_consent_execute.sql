-- Revoke EXECUTE on profiles_stamp_updates_consent() - clears 2 Supabase Advisor
-- security warnings (anon_ and authenticated_security_definer_function_executable).
--
-- Same fix 20260817140000 applied to handle_new_user() and
-- profiles_guard_privileged_columns(), for a function that migration could not
-- cover: this one was added by 20260820070000, three days later, with the default
-- grants still in place. Found by the Advisor on 2026-10-01.
--
-- It is a BEFORE UPDATE trigger function: it stamps updates_consent_at when
-- wants_updates changes, reading only NEW and OLD. Postgres refuses to run a
-- trigger function outside a trigger, so the RPC route at
-- /rest/v1/rpc/profiles_stamp_updates_consent was never exploitable - this is
-- least privilege, not a fix for a leak.
--
-- Revoking EXECUTE does NOT break the trigger. A trigger fires through the
-- trigger mechanism, which does not consult EXECUTE on the role running the
-- statement - only direct calls are affected, and there should be none.
--
-- The other three Advisor findings are deliberately left alone:
--   is_admin()           authenticated needs it - RLS policies call it.
--   delete_own_account() the intended entry point; it acts only on auth.uid() and
--                        is gated on a recent password sign-in.
--   leaked password protection is a dashboard setting, not SQL.

begin;

revoke all on function public.profiles_stamp_updates_consent() from public, anon, authenticated;

commit;
