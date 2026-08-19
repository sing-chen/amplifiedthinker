-- Phase 5 - require a RECENT password sign-in before an account can delete itself.
--
-- Supersedes the function created in 20260819080000 via `create or replace`, so
-- this file is safe whether or not that one has been applied. Both are kept:
-- the first records why the control is a database function at all, this one
-- records why the session alone is not enough to authorise the destructive
-- action it performs.
--
-- ---------------------------------------------------------------------------
-- WHY A CLIENT-SIDE PASSWORD PROMPT IS NOT A CONTROL
-- ---------------------------------------------------------------------------
--
-- The account page now asks for the password and re-authenticates before
-- calling this. That is good product behaviour and no security boundary at all:
-- the RPC is reachable directly with any valid access token, and anyone holding
-- that token can skip every field on the page. Whoever can read localStorage
-- can delete the account, which is the exact exposure the prompt was added to
-- close.
--
-- So the requirement has to be checked where it cannot be skipped. Supabase
-- puts the authentication history in the JWT itself:
--
--   "amr": [ { "method": "password", "timestamp": 1755600000 } ]
--
-- `amr` - authentication methods references - is appended to, not replaced, so
-- a token refresh carries the ORIGINAL password timestamp forward rather than
-- minting a fresh one. That is what makes it usable here: an attacker with a
-- stolen refresh token can mint new access tokens all day and every one of them
-- still says the password was last entered hours ago.
--
-- ⚠️ This is why `iat` would NOT have worked, and it is the trap worth naming.
-- `iat` is the moment the token was issued, which a refresh updates - so a
-- stolen session refreshed one second ago looks maximally fresh. It is the
-- obvious claim to reach for and it measures the wrong thing entirely.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller     uuid := auth.uid();
  methods    jsonb;
  last_pwd   bigint;
  window_s   constant int := 300;   -- five minutes
begin
  if caller is null then
    raise exception 'delete_own_account() requires a signed-in caller'
      using errcode = '28000';
  end if;

  -- See 20260819080000 for why admins are refused: is_admin cannot be granted
  -- back from the site, so a self-deleting admin can leave the site with no
  -- administrator and no route to appoint one.
  if public.is_admin() then
    raise exception 'An administrator cannot delete their own account from the site. Clear is_admin from the Supabase SQL editor first.'
      using errcode = '42501';
  end if;

  methods := auth.jwt() -> 'amr';

  -- Fails CLOSED. If the claim is missing or unreadable we refuse rather than
  -- wave the deletion through - an unverifiable session is exactly the case
  -- this check exists for. The message names the fix, because the most likely
  -- cause is a token minted before this migration rather than an attack.
  if methods is null or jsonb_typeof(methods) <> 'array' then
    raise exception 'Could not confirm when you last signed in. Sign out, sign back in, and try again.'
      using errcode = '28000';
  end if;

  select max((m ->> 'timestamp')::bigint)
    into last_pwd
    from jsonb_array_elements(methods) as m
   where m ->> 'method' = 'password';

  if last_pwd is null then
    raise exception 'This account was not signed in with a password, so it cannot be deleted from the site.'
      using errcode = '28000';
  end if;

  if extract(epoch from now()) - last_pwd > window_s then
    raise exception 'For safety, deleting an account needs a recent sign-in. Enter your password again and retry.'
      using errcode = '28000';
  end if;

  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user''s own auth.users row, and only within five minutes '
  'of a password sign-in (checked against the JWT amr claim, which a token '
  'refresh does not reset). Refuses anonymous callers and admins. Phase 5.';
