-- Amplified Thinker - initial schema
-- Phase 3 of docs/implementation-sequence.md. Data model from docs/supabase-integration-plan.md.
--
-- ONE migration creates every table the project will need, deliberately: the whole
-- shape is visible at once, so relationships get designed rather than accreted.
-- Most of these tables stay empty until the phase that fills them (news in 6, blog
-- in 8). An empty table with correct policies is the cheap half of the work.
--
-- RLS is enabled in the same statement block as each CREATE TABLE, before any row
-- can exist. With no server in front of the database, RLS *is* the security model,
-- and there is no later moment that forces you back to do it.
--
-- Read order: helpers, then profiles (everything else keys off it), then content
-- tables, then user-state tables (which reference content), then policies, then
-- grants. Grants come last on purpose - see the note above them.

begin;

-- No `create extension` here on purpose. gen_random_uuid() has been core Postgres
-- since 13 and Supabase runs 15+, so requiring pgcrypto would add a statement that
-- can fail (it needs the `extensions` schema to exist) in exchange for nothing.


-- ---------------------------------------------------------------------------
-- 1. Helper functions that depend on nothing
--
-- Only functions with no table references belong here. `is_admin()` reads
-- `profiles`, so it lives further down, immediately after that table - see the
-- note there for why the ordering is forced rather than stylistic.
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest without every caller remembering to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. profiles, and the admin gate that reads it
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  is_admin     boolean not null default false,
  -- Phase 5 mirrors the theme here as a convenience. `nav.js` still reads
  -- localStorage before first paint - a DB round-trip there would flash the
  -- wrong theme on every page load - so this column is never the fast path.
  theme        text check (theme in ('light', 'dark')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 60)
);

-- ENABLE, not FORCE. FORCE would apply RLS to the table owner too, and the owner
-- is the role the Supabase SQL editor runs as - which is the one documented way
-- to grant admin. Forcing it here would lock the escape hatch the trigger below
-- deliberately leaves open.
alter table public.profiles enable row level security;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- The admin gate. SECURITY DEFINER for two reasons, both load-bearing:
--
--   1. It reads `profiles` from inside a `profiles` policy. Without DEFINER that
--      recurses infinitely, because evaluating the policy would re-enter it.
--   2. It must work for a user who can only see their own profile row.
--
-- `search_path` is pinned so a caller cannot shadow `profiles` with a table of
-- their own and hand themselves admin. STABLE lets the planner call it once per
-- statement rather than once per row.
--
-- IT MUST BE DEFINED AFTER `profiles`, AND THAT IS NOT A STYLE CHOICE.
-- `check_function_bodies` is on by default, and for a LANGUAGE SQL function that
-- means the body is fully parsed and every object it names must already exist.
-- Defined above the table, this fails with:
--
--     42P01: relation "public.profiles" does not exist
--
-- The contrast is the useful part: `handle_new_user()` below names the same table
-- and would have been perfectly happy up there, because LANGUAGE PLPGSQL bodies
-- get a syntax check only, never an object-existence check. Same reference,
-- different language, different validation rule. Do not "tidy" this back up into
-- the helpers section.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Anyone may ask; the answer is `false` unless they are actually an admin.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- `is_admin` must not be self-settable, or the admin gate is decorative.
--
-- The check is skipped when auth.uid() is null, which is the case for the
-- Supabase SQL editor and for the service_role key - that is the intended and
-- only way to grant admin. It is not a hole: an anonymous PostgREST request also
-- has a null auth.uid(), but the UPDATE policy below requires `id = auth.uid()`,
-- so RLS rejects the statement before this trigger is ever reached.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin cannot be changed by the account it belongs to'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'profile id is immutable'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- Every auth.users row gets a profile. Without this, a signed-in user has no
-- profile, is_admin() has nothing to read, and Phase 5 has to create rows
-- lazily from the client - which would need an INSERT policy on profiles.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 3. Content tables
-- ---------------------------------------------------------------------------

-- News. Populated in Phase 6 from public/news.json (21 date groups, 69 stories).
--
-- `slug` is immutable and is what shared links point at from Phase 6 onward.
-- `legacy_id` keeps the old positional `<date>-<index>` form so the 301 endpoint
-- can resolve links already shared. Positional ids are safe only while news is
-- hand-edited: once an admin UI exists, one drag silently repoints every shared
-- link for that day at a different story.
create table public.news_stories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  legacy_id    text unique,
  story_date   date not null,
  sort_order   integer not null default 0,
  title        text not null,
  source       text,
  url          text,
  summary      text,
  implications text,
  tags         text[] not null default '{}',
  -- EDITORIAL pin, admin-set, at most one site-wide. Not the same concept as
  -- user_news.pinned, which is per-user. Do not conflate them.
  pinned       boolean not null default false,
  -- Deletion is `archived`, never a hard delete, so a shared link never dies.
  status       text not null default 'draft'
                 check (status in ('draft', 'published', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.news_stories enable row level security;

create index news_stories_date_order_idx
  on public.news_stories (story_date desc, sort_order);
create index news_stories_status_idx
  on public.news_stories (status);
-- "At most one site-wide" made structural rather than conventional. Verified
-- against the current news.json, which has exactly one pinned story.
create unique index news_stories_single_pinned_idx
  on public.news_stories ((pinned)) where pinned;

create trigger news_stories_set_updated_at
  before update on public.news_stories
  for each row execute function public.set_updated_at();


create table public.blog_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.blog_categories enable row level security;

create trigger blog_categories_set_updated_at
  before update on public.blog_categories
  for each row execute function public.set_updated_at();


create table public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  excerpt      text,
  body         text,
  category_id  uuid references public.blog_categories (id) on delete set null,
  status       text not null default 'draft'
                 check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  author_id    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.blog_posts enable row level security;

create index blog_posts_published_idx
  on public.blog_posts (published_at desc) where status = 'published';
create index blog_posts_category_idx
  on public.blog_posts (category_id);

create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();


-- Replaces public/updates.json (the "What's New" list).
create table public.site_updates (
  id          uuid primary key default gen_random_uuid(),
  update_date date not null,
  -- Trusted HTML, same as announcements.text_html below. updates.json already
  -- stores anchor markup, and it is rendered unescaped today.
  body        text not null,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.site_updates enable row level security;

create index site_updates_date_idx on public.site_updates (update_date desc);

create trigger site_updates_set_updated_at
  before update on public.site_updates
  for each row execute function public.set_updated_at();


-- Replaces the hardcoded ANNOUNCEMENTS array in public/index.html.
--
-- Expiry becomes explicit. Today it is implicit and type-based
-- (EXPIRY_DAYS = { feature: 14, skill: 21 }), so items silently drop out on a
-- date nobody can see. starts_at/expires_at gives the same automatic cleanup,
-- but schedulable ahead and visible in the admin form.
--
-- Icons deliberately stay in code: each `type` maps to an inline SVG in
-- index.html. Adding an item of an existing type is pure DB work; inventing a
-- new category still needs a code change, which is correct - SVG markup is
-- presentation, not content.
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('skill', 'feature', 'story')),
  announce_date date not null,
  -- TRUSTED HTML. Inserted unescaped by the banner renderer - that is how the
  -- <b> bolding works, while every other field in that function is escaped.
  -- Acceptable only because writes are admin-only under RLS. The Phase 7 admin
  -- form should present this as an HTML field, not a plain text input.
  text_html     text not null,
  link_href     text,
  link_label    text,
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz,
  active        boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint announcements_window_ordered
    check (expires_at is null or expires_at > starts_at)
);

alter table public.announcements enable row level security;

create index announcements_window_idx
  on public.announcements (starts_at, expires_at) where active;

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. User-state tables
-- ---------------------------------------------------------------------------

-- Maps onto the shape already in localStorage, so the Phase 5 import is
-- mechanical. The two content types store different things, which is why
-- `position` is text and `visited` is text[] rather than anything narrower:
--
--   plan.html    -> position = section (a section id string, null until the
--                   first scroll), visited = section ids,
--                   state = {quizSelected, quizRevealed, quizOrder, habitOpen,
--                            cardsOpen}
--   primer.html  -> position = current (a slide INDEX, stringified), visited =
--                   slide indexes, state = {}
--
-- Each page keeps ownership of its own DOM-to-shape mapping, exactly as
-- public/progress.js does today, so the coercion lives there and not here.
-- `state` is jsonb precisely so a page gaining a field costs no migration -
-- `cardsOpen` was added by the Phase 1 accordion fix after the data model was
-- written, and this column absorbed it without anyone noticing.
create table public.skill_progress (
  user_id      uuid not null references auth.users (id) on delete cascade,
  skill_slug   text not null,
  content_type text not null check (content_type in ('primer', 'plan')),
  position     text,
  visited      text[] not null default '{}',
  state        jsonb not null default '{}'::jsonb,
  -- Phase 9's dashboards are built on these two. Completion is explicit: a plan
  -- is complete when `visited` covers all 14 sections, a primer when it covers
  -- all slides. The page decides and sets completed_at; the DB does not infer it.
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),

  primary key (user_id, skill_slug, content_type)
);

alter table public.skill_progress enable row level security;

create index skill_progress_user_idx on public.skill_progress (user_id);

create trigger skill_progress_set_updated_at
  before update on public.skill_progress
  for each row execute function public.set_updated_at();


create table public.user_news (
  user_id    uuid not null references auth.users (id) on delete cascade,
  story_id   uuid not null references public.news_stories (id) on delete cascade,
  favorited  boolean not null default false,
  -- PER-USER pin. Distinct from news_stories.pinned, which is editorial.
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, story_id)
);

alter table public.user_news enable row level security;

create index user_news_user_idx on public.user_news (user_id);

create trigger user_news_set_updated_at
  before update on public.user_news
  for each row execute function public.set_updated_at();


-- `target_id` is text rather than uuid because the target is polymorphic: a
-- news story id for target_type='news', a skill slug for target_type='skill'.
-- Skills are hand-authored HTML and have no DB row to point at.
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('news', 'skill')),
  target_id   text not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.notes enable row level security;

create index notes_user_target_idx on public.notes (user_id, target_type, target_id);

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 5. Policies
--
-- Rule of thumb used throughout: user-owned tables are `user_id = auth.uid()`
-- for everything; content tables are public-read-where-published and
-- admin-write. Every policy names its role explicitly with TO, so a policy
-- written for `authenticated` can never widen what `anon` can reach.
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------
-- Read own only. Phase 9 deferred leaderboards; if they ever arrive, they get a
-- security definer function exposing display_name, not a widened policy here.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Deliberately no INSERT policy: rows come from the on_auth_user_created
-- trigger. Deliberately no DELETE policy: deleting a profile is deleting the
-- account, which happens through auth, and the FK cascade handles the row.

create policy profiles_admin_select_all on public.profiles
  for select to authenticated
  using (public.is_admin());

-- skill_progress, user_news, notes -------------------------------------------
create policy skill_progress_own on public.skill_progress
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_news_own on public.user_news
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notes_own on public.notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- news_stories ---------------------------------------------------------------
create policy news_stories_public_read on public.news_stories
  for select to anon, authenticated
  using (status = 'published');

-- Archived stories stay readable so a shared link never dies - that is the whole
-- reason deletion is a status flag rather than a DELETE.
--
-- Be precise about what this does NOT do: it is a second permissive policy, so it
-- ORs with the one above and an unfiltered `select *` returns archived rows too.
-- Keeping them out of listings is the QUERY's job (`status=eq.published`), not
-- this policy's. Phase 6 must filter explicitly rather than assume.
create policy news_stories_archived_read on public.news_stories
  for select to anon, authenticated
  using (status = 'archived');

create policy news_stories_admin_all on public.news_stories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- blog ------------------------------------------------------------------------
create policy blog_posts_public_read on public.blog_posts
  for select to anon, authenticated
  using (status = 'published' and (published_at is null or published_at <= now()));

create policy blog_posts_admin_all on public.blog_posts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy blog_categories_public_read on public.blog_categories
  for select to anon, authenticated
  using (true);

create policy blog_categories_admin_all on public.blog_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- site_updates ----------------------------------------------------------------
create policy site_updates_public_read on public.site_updates
  for select to anon, authenticated
  using (published);

create policy site_updates_admin_all on public.site_updates
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- announcements ----------------------------------------------------------------
-- The visibility window is enforced here rather than in the client, so an item
-- scheduled for next week is not sitting in the page source today.
create policy announcements_public_read on public.announcements
  for select to anon, authenticated
  using (
    active
    and starts_at <= now()
    and (expires_at is null or expires_at > now())
  );

create policy announcements_admin_all on public.announcements
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 6. Grants
--
-- RLS restricts which ROWS a role can touch. Grants restrict which VERBS it has
-- at all. Supabase grants anon and authenticated broadly on `public` by default,
-- so a table created without a policy is protected only by RLS defaulting to
-- deny - one `create policy` typo away from a leak.
--
-- Revoking first and re-granting explicitly means anon has no INSERT, UPDATE or
-- DELETE anywhere in the schema, and no SELECT at all on user-owned tables.
-- Belt and braces on top of section 5, and the braces are the important half.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- anon: read-only, content tables only.
grant select on
  public.news_stories,
  public.blog_posts,
  public.blog_categories,
  public.site_updates,
  public.announcements
to anon;

-- authenticated: the same reads, plus full CRUD on its own state. Writes to
-- content tables are admin-only and are gated by the policies above, so the
-- grant is what an admin needs and RLS is what stops everyone else using it.
grant select on
  public.news_stories,
  public.blog_posts,
  public.blog_categories,
  public.site_updates,
  public.announcements
to authenticated;

grant insert, update, delete on
  public.news_stories,
  public.blog_posts,
  public.blog_categories,
  public.site_updates,
  public.announcements
to authenticated;

grant select, insert, update, delete on
  public.skill_progress,
  public.user_news,
  public.notes
to authenticated;

-- profiles gets SELECT and UPDATE only, matching its policies exactly. There is
-- no INSERT (the signup trigger owns that) and no DELETE (that is account
-- deletion, handled by auth and the FK cascade), so granting either would only
-- produce statements that silently affect zero rows.
grant select, update on public.profiles to authenticated;

-- Future tables must opt in the same way rather than inheriting a wide default.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

commit;
