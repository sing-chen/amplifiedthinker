-- Harden function privileges - clears all 9 Supabase Advisor security warnings.
--
-- A SECOND migration rather than an edit to 20260817120000, because that one is
-- already applied. An applied migration is history: editing it means the file no
-- longer describes the database that exists, and anyone rebuilding from scratch
-- gets something different from production. The "all tables in one migration"
-- principle is untouched - this creates no tables.
--
-- What the Advisor found, and what is actually true of each:
--
--   set_updated_at            mutable search_path. Real, and an inconsistency on
--                             my part: three of four functions pinned it. Low
--                             severity - SECURITY INVOKER, so there is no
--                             privilege to escalate, and now() is in pg_catalog
--                             which is searched first regardless - but being
--                             inconsistent about it is worse than the risk.
--
--   handle_new_user           SECURITY DEFINER, reachable at /rest/v1/rpc/.
--   profiles_guard_privileg…  Both are TRIGGER functions. Postgres refuses to run
--                             a trigger function outside a trigger, so neither is
--                             exploitable today - but nothing should be able to
--                             call them, and the triggers keep working because
--                             the trigger mechanism does not check EXECUTE on the
--                             invoking role.
--
--   is_admin                  Granted to anon and authenticated. `authenticated`
--                             genuinely needs it: RLS policy expressions are
--                             evaluated with the querying role's privileges, so
--                             a role must hold EXECUTE on a function its policies
--                             call. `anon` does not - every policy calling
--                             is_admin() is `to authenticated`. Never a leak
--                             either way, since it filters on auth.uid(), which
--                             is null for anon, so it could only ever return
--                             false. This is least privilege, not a fix.
--
--   rls_auto_enable           Supabase's own, created by the "Enable automatic
--                             RLS" project setting. Same reasoning - an event
--                             trigger does not fire through an RPC grant.
--
-- The point of getting to zero is not that warning nine matters. It is that nine
-- warnings you have decided to ignore is how you miss warning ten.

begin;

-- ---------------------------------------------------------------------------
-- 1. Pin the last mutable search_path
-- ---------------------------------------------------------------------------

-- Empty rather than `public`, which is the stronger form and correct here:
-- this function references no schema-qualified object at all. `now()` resolves
-- because pg_catalog is implicitly searched first unless named explicitly.
alter function public.set_updated_at() set search_path = '';


-- ---------------------------------------------------------------------------
-- 2. Trigger functions: callable by nobody
-- ---------------------------------------------------------------------------

-- Revoking EXECUTE does NOT break the triggers. A trigger fires through the
-- trigger mechanism, which does not consult EXECUTE on the role running the
-- statement - only direct calls are affected, and there should be none.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.profiles_guard_privileged_columns() from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. is_admin(): authenticated only
-- ---------------------------------------------------------------------------

-- Keep authenticated - policies need it. Drop anon, which never reaches a policy
-- that calls it.
--
-- If a future policy is ever written `to anon` using is_admin(), it will fail
-- with a permission error rather than silently returning false. That is the
-- better failure: loud, at the point of the mistake.
revoke execute on function public.is_admin() from anon;


-- ---------------------------------------------------------------------------
-- 4. Supabase's automatic-RLS event trigger function
-- ---------------------------------------------------------------------------

-- Guarded, because this function only exists when the "Enable automatic RLS"
-- project setting was chosen at creation. Applying this migration to a project
-- without it must not fail.
--
-- Note this is a Supabase-managed object. If they recreate it the grants may come
-- back, and the Advisor will say so - which is the system working.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

commit;
