-- Down-path for 20260819140000_display_name_not_null.sql
--
-- Drops the constraint and restores the trigger to the version in
-- 20260817120000, which stores NULL when a signup supplies no name.
--
-- ⚠️ Does NOT undo the backfill. Rows that were null and are now 'Reader' or a
-- derived local part stay as they are - there is no record of which they were,
-- and inventing one by re-nulling anything matching the derivation would also
-- null real names that happen to look derived. Deliberate: a rollback should
-- not destroy data to restore a shape.

alter table public.profiles
  alter column display_name drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on column public.profiles.display_name is null;
