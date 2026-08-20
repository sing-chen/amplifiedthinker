-- Rollback for 20260820070000_profiles_wants_updates.sql
--
-- ⚠️ THIS DESTROYS CONSENT RECORDS. Dropping the two columns erases both who
-- opted in and when, and neither is recoverable from anywhere else - the
-- checkbox answer exists in `auth.users.raw_user_meta_data` only for accounts
-- created after the form shipped, and not at all for anyone who changed their
-- mind on /account/ afterwards.
--
-- Before running this on prod, consider whether you actually want to keep the
-- columns and simply stop reading them. Rolling back the CODE does not require
-- rolling back the SCHEMA: an unread column is inert, while a dropped one takes
-- the evidence of consent with it.
--
-- If it must go, export first:
--
--   select id, wants_updates, updates_consent_at
--   from public.profiles
--   where updates_consent_at is not null;

-- ---------------------------------------------------------------------------
-- 1. Put handle_new_user() back as 20260819140000 left it
-- ---------------------------------------------------------------------------
--
-- Restored in full rather than by re-running that migration, so this file is
-- self-contained. It must run BEFORE the columns are dropped: a function body
-- naming a column that no longer exists would fail on next invocation - which
-- is to say, on the next signup, not here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  given    text;
  derived  text;
begin
  given := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  derived := nullif(
    left(initcap(split_part(split_part(coalesce(new.email, ''), '@', 1), '+', 1)), 60),
    ''
  );

  insert into public.profiles (id, display_name)
  values (new.id, coalesce(given, derived, 'Reader'))
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The stamp trigger and its function
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_stamp_updates_consent on public.profiles;
drop function if exists public.profiles_stamp_updates_consent();

-- ---------------------------------------------------------------------------
-- 3. The columns
-- ---------------------------------------------------------------------------

alter table public.profiles drop column if exists updates_consent_at;
alter table public.profiles drop column if exists wants_updates;
