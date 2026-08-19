-- Phase 5 - profiles.display_name becomes NOT NULL.
--
-- ---------------------------------------------------------------------------
-- WHY THE TRIGGER CHANGES TOO, AND WHY IT DERIVES RATHER THAN REJECTS
-- ---------------------------------------------------------------------------
--
-- `not null` on its own would have made every nameless signup FAIL. The trigger
-- runs `after insert on auth.users`, so a constraint violation inside it rolls
-- back the auth user as well - the account is not created at all, and the
-- caller gets an opaque `Database error saving new user`.
--
-- That is defensible for a hostile direct-API signup and wrong for three things
-- that are not hostile:
--
--   1. ⚠️ The dashboard's *Create new user*, which sets no metadata at all. That
--      is a workflow in active use for test accounts, and it would simply stop.
--   2. Any future auth method that does not populate display_name - OAuth being
--      the obvious one, deferred but not ruled out. Signup would break entirely
--      on the day it was added, for a reason nothing points at.
--   3. A form change that renames the metadata key. The failure would be total
--      rather than cosmetic.
--
-- So the trigger derives a name when none was given, and the column is NOT NULL
-- because it can now always be satisfied. The guarantee asked for - the
-- database will not hold a nameless profile - is delivered either way; this way
-- nothing else breaks to get it.
--
-- ⚠️ WHAT THIS DOES NOT DO, and it is the part most likely to be misread.
--
-- The nav greeting and the email templates read `raw_user_meta_data`, which is
-- on auth.users and is NOT what this constrains. A dashboard-created user still
-- has no name IN THE JWT, so the client-side fallback stays load-bearing. The
-- two are different stores and this migration only closes one of them. Reading
-- profiles on every page load would fix that and is not worth a database
-- round-trip before first paint - the same reasoning that keeps the theme in
-- localStorage.

-- ---------------------------------------------------------------------------
-- 1. Backfill, before the constraint - it cannot be added while nulls exist
-- ---------------------------------------------------------------------------
--
-- Only touches nulls, so it is safe to re-run and safe to run either side of
-- any manual backfill that sets real names.

update public.profiles p
set display_name = coalesce(
  nullif(left(initcap(split_part(split_part(coalesce(u.email, ''), '@', 1), '+', 1)), 60), ''),
  'Reader'
)
from auth.users u
where u.id = p.id
  and p.display_name is null;

-- Any profile whose user row has since vanished, or whose address derived to
-- nothing. Belt and braces: the constraint below must not be able to fail.
update public.profiles
set display_name = 'Reader'
where display_name is null;

-- ---------------------------------------------------------------------------
-- 2. The trigger, which is what keeps the constraint satisfiable
-- ---------------------------------------------------------------------------

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
  -- What the sign-up form sent, if anything. public/auth.js writes the first
  -- of these; the other two are what other providers conventionally use.
  given := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    ''
  )), '');

  -- The local part of the address, before any plus-addressing, title-cased and
  -- clipped to the 60 characters the CHECK constraint allows.
  --
  -- A placeholder, not a guess at somebody's name: it exists so the column can
  -- be NOT NULL without any legitimate signup failing. `singfenchen+p5b@…`
  -- gives `Singfenchen`, which is recognisably the account rather than a
  -- pretence at knowing who they are.
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
-- 3. The constraint
-- ---------------------------------------------------------------------------

alter table public.profiles
  alter column display_name set not null;

-- The length CHECK from the first migration is now redundant in its null branch
-- but stays as written: it also enforces the 1..60 range, which this does not.
comment on column public.profiles.display_name is
  'Always present. Supplied by the sign-up form via raw_user_meta_data, or '
  'derived from the email local part by handle_new_user() when a signup '
  'provides none. Distinct from auth.users.raw_user_meta_data, which is what '
  'the nav greeting and the email templates read and which this does NOT '
  'constrain.';
