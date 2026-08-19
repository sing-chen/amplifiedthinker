-- Down-path for 20260819120000_delete_own_account_reauth.sql
--
-- Restores the function to the version created in 20260819080000 - anonymous
-- callers and admins refused, no recency requirement. Destroys no data.
--
-- ⚠️ Running this WEAKENS a control rather than reverting a change. It leaves
-- the account page still asking for a password, so the site looks like it
-- re-authenticates while the database no longer requires it - and anyone
-- holding an access token can call the RPC directly with no password at all.
-- Only run it to isolate a problem the recency check itself caused, and put it
-- back afterwards.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'delete_own_account() requires a signed-in caller'
      using errcode = '28000';
  end if;

  if public.is_admin() then
    raise exception 'An administrator cannot delete their own account from the site. Clear is_admin from the Supabase SQL editor first.'
      using errcode = '42501';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
