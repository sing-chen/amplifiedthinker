-- Down-path for 20260817120000_initial_schema.sql
--
-- The Supabase CLI has no native `migration down`, and a Vercel rollback restores
-- code but not database state (docs/dev-workflow.md). So the down-path is written
-- by hand and kept next to the migration rather than reconstructed under pressure.
--
-- SAFE ONLY WHILE THE TABLES ARE EMPTY, which is the whole of Phase 3 - no row is
-- inserted anywhere in this phase. From Phase 5 onward this file DESTROYS REAL
-- USER DATA and must not be run without a backup. It is kept for the window in
-- which it is genuinely cheap: the schema is new, wrong, and holds nothing.
--
-- Deliberately does NOT touch auth.users. Dropping the schema should not delete
-- accounts; if the intent is a clean slate, delete the users from the Auth
-- dashboard separately and knowingly.

begin;

drop trigger if exists on_auth_user_created on auth.users;

-- Tables, children before parents. CASCADE would be shorter and would also drop
-- anything added later that depends on these, silently. Named order fails loudly
-- instead, which is what you want when undoing something.
drop table if exists public.notes;
drop table if exists public.user_news;
drop table if exists public.skill_progress;

drop table if exists public.announcements;
drop table if exists public.site_updates;
drop table if exists public.blog_posts;
drop table if exists public.blog_categories;
drop table if exists public.news_stories;

drop table if exists public.profiles;

drop function if exists public.handle_new_user();
drop function if exists public.profiles_guard_privileged_columns();
drop function if exists public.is_admin();
drop function if exists public.set_updated_at();

-- Restores the default-privilege posture the migration narrowed. Without this,
-- a re-applied migration inherits the revoke and every new table lands with no
-- grants at all - which looks exactly like a broken policy.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

commit;
