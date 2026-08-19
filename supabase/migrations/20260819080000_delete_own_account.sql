-- Phase 5 - let an account holder delete their own account, from the site.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS A DATABASE FUNCTION AND NOT A SERVER ENDPOINT
-- ---------------------------------------------------------------------------
--
-- Deleting a user is normally done with Supabase's Admin API, which needs the
-- `service_role` key. That key bypasses RLS entirely, so it cannot go anywhere
-- near the browser (CLAUDE.md), and this project has no server to hold it: the
-- Astro build is `output: 'static'` with no adapter, and one of the two
-- production origins is GitHub Pages, which runs no code at all.
--
-- The three ways out, and why this one:
--
--   Vercel /api endpoint   Needs an adapter and a server build, works on one
--                          origin only, and lands `service_role` in the project
--                          two phases before the plan says it may exist.
--   Supabase Edge Function Works on both origins, but adds a Deno runtime, a
--                          CLI deploy step, and a second place to look when
--                          something breaks.
--   SECURITY DEFINER fn    This. No new runtime, no new key, no new deploy
--                          target, callable over PostgREST from either origin,
--                          and it lives in the migration alongside everything
--                          else - so a rebuild from source reproduces it.
--
-- The pattern is already established here: `public.is_admin()` in the first
-- migration is SECURITY DEFINER for the same reason - it needs privileges the
-- caller does not have, scoped to one specific question.
--
-- ---------------------------------------------------------------------------
-- WHAT IT DELETES, AND WHAT SURVIVES
-- ---------------------------------------------------------------------------
--
-- One statement, against `auth.users`. Everything else follows from the foreign
-- keys already in the schema, which is why this migration adds no delete logic
-- of its own - inventing a second cascade by hand is how the two drift.
--
--   profiles        on delete cascade    gone
--   skill_progress  on delete cascade    gone
--   user_news       on delete cascade    gone
--   notes           on delete cascade    gone
--   blog_posts      author_id -> profiles, ON DELETE SET NULL
--                                        KEPT, and correctly so: deleting an
--                                        author must not delete their writing.
--
-- ⚠️ If a future table holds user-owned rows, it needs `on delete cascade` on
-- its `auth.users` reference or its rows outlive the account silently. That is
-- the same opt-in discipline as the grants: the schema is the only thing that
-- makes this function complete, and nothing here will fail if it is forgotten.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
-- `auth` is on the path because the function names auth.users. Setting the path
-- explicitly is what stops a caller shadowing `users` with a table of their own
-- in a schema they control.
set search_path = public, auth
as $$
declare
  caller uuid := auth.uid();
begin
  -- Anonymous callers. `delete ... where id = null` would match nothing and
  -- report success, which is a worse answer than an error - the caller would
  -- believe an account had been removed.
  if caller is null then
    raise exception 'delete_own_account() requires a signed-in caller'
      using errcode = '28000';
  end if;

  -- ⚠️ Admins are refused, deliberately.
  --
  -- `is_admin` is settable only where auth.uid() is null - the dashboard SQL
  -- editor - and a trigger rejects an account changing its own. So an admin who
  -- deletes themselves cannot grant it back from the site, and if they are the
  -- only admin the site has no administrator and no route to appoint one
  -- without opening the dashboard.
  --
  -- Recovering from the refusal is easy and deliberate: clear is_admin from the
  -- SQL editor, then delete. Recovering from the deletion is not.
  if public.is_admin() then
    raise exception 'An administrator cannot delete their own account from the site. Clear is_admin from the Supabase SQL editor first.'
      using errcode = '42501';
  end if;

  delete from auth.users where id = caller;
end;
$$;

-- Same shape as is_admin(): closed to everyone, then opened to exactly who needs
-- it. `anon` is NOT granted - an anonymous caller has no account to delete, and
-- the null guard above is the second lock rather than the only one.
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

comment on function public.delete_own_account() is
  'Deletes the calling user''s own auth.users row. Everything user-owned '
  'follows by cascade; blog_posts.author_id is set null and the post survives. '
  'Refuses anonymous callers and admins. Phase 5.';
