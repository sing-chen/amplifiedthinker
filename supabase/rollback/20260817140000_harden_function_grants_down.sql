-- Down-path for 20260817140000_harden_function_grants.sql
--
-- Restores the grants as the first migration left them, which is the state the
-- Supabase Advisor flagged with 8 warnings. Only run this to isolate a problem
-- the hardening caused - it is not a state worth returning to otherwise.
--
-- Destroys no data. Unlike the first migration's down-path, this one stays safe
-- indefinitely: it touches privileges only.

begin;

-- The migration set this to ''. There was no prior setting, so DEFAULT (unset)
-- is the honest reversal - which is also what the Advisor warned about.
alter function public.set_updated_at() reset search_path;

grant execute on function public.handle_new_user() to anon, authenticated;
grant execute on function public.profiles_guard_privileged_columns() to anon, authenticated;
grant execute on function public.is_admin() to anon;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'grant execute on function public.rls_auto_enable() to anon, authenticated';
  end if;
end
$$;

commit;
