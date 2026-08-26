-- Phase 6 stage 14: at most one pinned story PER READER.
--
-- ⚠️ THIS IS WHAT MAKES "PIN" DIFFERENT FROM "SAVE". With unlimited pins the
-- two controls are the same control wearing different icons: both are a boolean
-- on the same row, both take as many stories as you like. Made singular, each
-- earns its place — Save is a collection, Pin is the one thing you are keeping
-- in front of you.
--
-- ⚠️ `user_news.pinned` IS NOT `news_stories.pinned`. This constrains the
-- per-reader pin. The editorial one — one site-wide, admin-set, surfaced as
-- "Featured" — is a different column on a different table and already has its
-- own `news_stories_single_pinned_idx`. The two are deliberately given the same
-- SHAPE of guarantee here, because "at most one" is the property both need and
-- structural is how the schema already states it.

begin;

/* Clears the previous pin as part of the same statement that sets the new one.
   ⚠️ A TRIGGER RATHER THAN LEAVING IT TO THE CLIENT, and the reason is the
   failure mode: unpin-then-pin from the browser is two round trips, and if the
   second fails the reader is left with NOTHING pinned having asked to move a
   pin. Here it cannot half-apply.

   ⚠️ SECURITY INVOKER — the default, and load-bearing. As DEFINER this would
   run as the owner and bypass RLS entirely, so a bug in the WHERE clause could
   reach another reader's rows. As INVOKER the `user_news_own` policy still
   applies, which means the statement below is confined to the caller's own rows
   by the same rule everything else is.

   Terminates: the inner UPDATE sets `pinned = false`, so the recursive fire
   takes the `if` false and stops. */
create or replace function public.user_news_single_pin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pinned then
    update public.user_news
       set pinned = false
     where user_id = new.user_id
       and story_id <> new.story_id
       and pinned;
  end if;
  return new;
end;
$$;

-- Same hardening the other trigger functions got in 20260817140000: nothing
-- should be able to call this through /rest/v1/rpc/. The trigger keeps working
-- because the trigger mechanism does not check EXECUTE on the invoking role.
revoke all on function public.user_news_single_pin() from public, anon, authenticated;

create trigger user_news_single_pin
  before insert or update of pinned on public.user_news
  for each row execute function public.user_news_single_pin();

-- The structural guarantee. The trigger keeps the data correct; this makes it
-- impossible for the data to be otherwise, including from the SQL editor.
create unique index if not exists user_news_single_pin_idx
  on public.user_news (user_id) where pinned;

commit;
