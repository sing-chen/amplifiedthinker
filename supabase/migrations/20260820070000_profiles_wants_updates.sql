-- Phase 5 follow-on - consent to site-update email.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS FOR
-- ---------------------------------------------------------------------------
--
-- On 2026-08-20 the account started offering to tell people when new skills and
-- features land. That is direct marketing by electronic mail, which under
-- Regulation 22 of PECR needs consent - and under Article 7(1) of the UK GDPR
-- the controller must be able to DEMONSTRATE that consent was given.
--
-- `public/privacy.html` section 4 already names Article 6(1)(a) as the basis and
-- section 8 already promises the reader they choose at sign-up and can change
-- their mind. This migration is what makes those sentences true. Until it is
-- applied, the pages describe something the database cannot record.
--
-- ⚠️ NO EMAIL MAY BE SENT ON THE STRENGTH OF THIS COLUMN ALONE. Two of the four
-- pieces are still missing - an unsubscribe route in the message itself, and any
-- mechanism for sending to more than one recipient. See BACKLOG.md. The Phase 4
-- finding is the one that bites here: `List-Unsubscribe` is deliberately absent
-- from the auth templates, because a reader could otherwise unsubscribe from
-- their own password reset and be suppressed silently. Update mail needs
-- unsubscribe and auth mail must never have it, so the two cannot share a
-- Resend audience, a suppression list, or a template.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
--
-- ⚠️ `default false`, and this is the whole point of the column rather than a
-- detail of it. Consent is opted INTO. A default of `true` would silently
-- enrol every account that already exists, which is exactly the thing consent
-- is supposed to prevent, and it would do so invisibly at migration time.
--
-- `not null` because a three-state consent flag is not a thing: unanswered and
-- refused have identical consequences - we do not send - so a null would only
-- create a state every caller has to remember to treat as false.
alter table public.profiles
  add column if not exists wants_updates boolean not null default false;

-- The evidence half. Article 7(1) asks the controller to demonstrate consent,
-- which means knowing WHEN as well as whether.
--
-- Null means "never expressed a preference" - true of every account created
-- before today, and distinguishable from an explicit refusal, which stamps a
-- time with `wants_updates` false. That distinction is the reason this column
-- is nullable while the one above is not.
alter table public.profiles
  add column if not exists updates_consent_at timestamptz;

comment on column public.profiles.wants_updates is
  'Consent to site-update email (UK GDPR Article 6(1)(a), PECR reg 22). '
  'Opted into at sign-up or on /account/, never assumed. Default false so a '
  'migration can never enrol anyone. Withdrawing it must not affect the '
  'confirmation and password-reset mail, which is sent on Article 6(1)(b) and '
  'is not governed by this column.';

comment on column public.profiles.updates_consent_at is
  'When wants_updates was last changed, maintained by the database rather than '
  'the client so it is usable as evidence. Null means the account has never '
  'expressed a preference either way.';

-- No new grant. `grant select, update on public.profiles to authenticated` in
-- the initial migration is table-level, so it already covers columns added
-- later - and `profiles_update_own` already scopes the update to `auth.uid()`.
--
-- ⚠️ Worth stating explicitly because the opposite is the documented trap on
-- this project: a NEW TABLE lands with no grants at all, thanks to the
-- `alter default privileges … revoke all` at the end of the first migration,
-- and looks exactly like a broken policy. A new COLUMN on an existing table is
-- the case where that does not apply. Do not add a redundant column-level
-- grant here; mixing table-level and column-level grants on one table makes
-- the effective privileges much harder to reason about later.

-- ---------------------------------------------------------------------------
-- 2. The stamp, maintained by the database
-- ---------------------------------------------------------------------------
--
-- The client sends only the boolean. It never sends the timestamp, and could
-- not usefully do so: a consent record the data subject can backdate is not
-- evidence of anything.
--
-- Fires only when the value actually CHANGES, so an unrelated profile update -
-- a name change, say - does not restamp a consent that was given months ago.
create or replace function public.profiles_stamp_updates_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.wants_updates is distinct from old.wants_updates then
    new.updates_consent_at = now();
  end if;
  return new;
end;
$$;

-- A separate trigger from `profiles_guard_privileged_columns`, not an addition
-- to it. That one REJECTS a change; this one RECORDS one. Folding them together
-- would put a raise-exception path and an assignment path in the same function
-- for no shared logic, and the guard is security-critical enough that it should
-- stay readable on its own.
--
-- Both are BEFORE UPDATE and PostgreSQL fires them in name order, so
-- `profiles_guard_privileged_columns` runs first and this never stamps a row
-- whose update is about to be rejected.
drop trigger if exists profiles_stamp_updates_consent on public.profiles;
create trigger profiles_stamp_updates_consent
  before update on public.profiles
  for each row execute function public.profiles_stamp_updates_consent();

-- ---------------------------------------------------------------------------
-- 3. Sign-up carries the answer through
-- ---------------------------------------------------------------------------
--
-- Same route `display_name` already takes: the form writes it into
-- `raw_user_meta_data`, and this trigger copies it into `profiles`. Rewritten
-- in full rather than patched, because `create or replace function` replaces
-- the whole body and the display_name logic from 20260819140000 has to survive
-- intact. ⚠️ If that migration is ever revised, this one has to be re-applied
-- after it, or the derived-name behaviour silently reverts.
--
-- ⚠️ THE CHECKBOX IS READ AS TEXT, DELIBERATELY. `->>` yields text whatever the
-- JSON type was, so a real JSON `true` gives 'true' and the string "true" also
-- gives 'true' - both intended. Anything else at all, including null, a typo, a
-- number, or the key being absent entirely, evaluates to false.
--
-- The alternative, `(… ->> 'wants_updates')::boolean`, would RAISE on malformed
-- input - and this runs inside `after insert on auth.users`, where any exception
-- rolls back the auth user too. The account would simply fail to be created,
-- with `Database error saving new user` and nothing pointing at the cause. Same
-- reasoning as the display_name migration: signup must not be breakable by a
-- metadata key.
--
-- Failing closed is also the right default for consent specifically. If we
-- cannot tell what was ticked, we did not get consent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  given    text;
  derived  text;
  wants    boolean;
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

  wants := lower(coalesce(new.raw_user_meta_data ->> 'wants_updates', '')) = 'true';

  insert into public.profiles (id, display_name, wants_updates, updates_consent_at)
  values (
    new.id,
    coalesce(given, derived, 'Reader'),
    wants,
    -- Stamped only when the form actually asked. A dashboard-created user, or
    -- any signup route that sends no such key, has expressed no preference and
    -- must not look as though it refused at a particular moment.
    case when new.raw_user_meta_data ? 'wants_updates' then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
