# Amplified Thinker: Supabase, Auth, and Admin Portal

**Status:** In progress — Phase 1 complete and live · **Last updated:** 2026-08-17

Per-phase status and outcomes live in [implementation-sequence.md](implementation-sequence.md).
This document holds the architecture and data model, which have not changed since baselining.

Supersedes the original handoff brief (`supabase-integration-brief.md`), which was written
without access to this repo. Corrections to it are in the appendix, since several of its
conclusions were right and worth keeping.

Companion documents:

- [implementation-sequence.md](implementation-sequence.md) — the phased activity breakdown with rationale for each step. **The detailed version of the Phases section below.**
- [dev-workflow.md](dev-workflow.md) — branches, preview deployments, and per-environment configuration.

---

## Context

The site is 16 hand-written HTML pages on Vercel with no build step. All user state lives in `localStorage`, which is per-browser and per-device — so progress through a learning plan on a laptop is invisible on a phone. That's the problem driving this work.

The goal is a two-tier site:

- **Guests** get all content, exactly as today, with no saved state.
- **Signed-in users** get device-agnostic progress, completion tracking with start and finish dates, favourited and pinned news, notes on news stories and courses, and dashboards over their own data.

Behind that sits a third tier: an **admin portal** so blog and news content is managed through the UI rather than by editing HTML files, running SQL, or hand-maintaining JSON.

### Decisions taken

| Decision | Choice |
|---|---|
| Architecture | **New surfaces in Astro; the 16 existing pages stay untouched in `public/`.** Retrofit later, one page at a time. |
| Blog rendering | **Rendered from the DB on request.** Publish is instant. |
| News content | **Moves into the DB** with immutable slugs, managed via admin UI. Replaces the `add-news` skill. |
| Existing localStorage progress | **Offer a one-time import** on first login, then clear it. Theme stays local. |
| Admin portal scope | **Blog + site config.** Skill primers and plans stay hand-authored HTML. |
| Announcement banner | **Both sources move to the DB**, configurable from the admin UI with no deploy. |
| Search | **Keep Fuse.js.** Only change where its index comes from. |

---

## Architecture

The project becomes an **Astro project with all 16 existing pages in `public/`**. Astro ships everything in `public/` byte-for-byte untouched, so the current site keeps working exactly as it does today, while new surfaces — `/blog`, `/admin`, `/dashboard` — are built properly in `src/`.

This gives one project, one deploy, and no two-codebase problem. Retrofitting an old page later is "move the file from `public/` to `src/pages/`, convert it" — one at a time, whenever it's worth doing, with no cutover.

```
public/            index.html, about.html, future-skills.html, my-people.html,
                   news.html, search.html, skills/**, nav.js, styles.css,
                   fuse.min.js, images/**          ← untouched, served as-is
src/pages/         blog/, admin/, dashboard/       ← new, Astro
src/pages/api/     server endpoints
```

### What is shared, and how

- **Nav.** [nav.js](../nav.js) injects the entire nav at runtime and self-computes its path prefix (`nav.js:37`). The Astro base layout loads the same file with a plain `<script>` tag, so old and new pages get an identical nav for free. This is why the split doesn't cause visual drift.
- **Design tokens.** New pages import the same [styles.css](../styles.css) from `public/`.
- **Auth and progress.** Runtime modules in `public/` (below), loaded by both old and new pages.

### Two consequences to accept

- **A build error now blocks deployment of everything**, including the old pages. Today nothing can fail because nothing is built.
- **Local dev changes.** `.claude/launch.json` runs `python -m http.server 8139`, which cannot run Astro or server endpoints. It becomes `npm run dev` (or `vercel dev`). No user-facing impact whatsoever — this only affects working on the site.

### And one constraint discovered in Phase 0: there are two production origins

This document originally assumed a single origin. It does not have one.
`sing-chen.github.io/amplifiedthinker` is live, rebuilt from `main`, and **load-bearing** — some
corporate networks block `amplifiedthinker.com` under newly-registered-domain policies, and those
users have no other route in.

GitHub Pages serves files but runs no code, so the Astro split has a second dimension beyond
old-page/new-page: **client-side or prerendered, versus server-rendered.** The former reaches both
audiences; the latter reaches only Vercel. Auth, progress sync, favourites, notes and client-rendered
dashboards are all fine, because Supabase JS runs in the browser. The server-rendered blog, `/api/`
endpoints and legacy-URL redirects are not.

Practical rule for every phase below: **prefer client-side or prerendered where the feature matters to
that audience.** Capability matrix, the Phase 2 dual-build requirement, and the environment-switch
trap this creates are all in [dev-workflow.md](dev-workflow.md).

### Shared runtime modules

These live in `public/` and follow the `nav.js` pattern — runtime-loaded, no build, working at any nesting depth. Old pages and new pages both consume them:

| File | Responsibility |
|---|---|
| `supabase-client.js` | Creates the client from the public URL + anon key. Single instance. |
| `auth.js` | Session state, sign-in/out, `onAuthChange`, admin check. |
| `progress.js` | ✅ **Built in Phase 1.** Currently at the repo root, `localStorage`-backed, loaded by all 10 skill pages. Storage keys derive from the URL path. Phase 5 switches its backend to Supabase for signed-in users; it moves into `public/` in Phase 2. |

Vendor `supabase.min.js` into the repo alongside [fuse.min.js](../fuse.min.js) so the old static pages can use it without a bundler.

`nav.js` gains the auth UI — sign-in button, avatar, dashboard link. Because it injects into all 16 pages from one source (`nav.js:380`), signed-in state appears site-wide from a single edit.

---

## Data model

### Ownership and roles

```
profiles          id (FK auth.users), display_name, avatar_url, is_admin, created_at
```

`is_admin` gates the whole admin portal, so it must not be self-settable. Users may update their own profile, but a trigger rejects any change to `is_admin`; that column is set only from the Supabase dashboard. Policies check it via a `security definer` function with a pinned `search_path`:

```sql
create function is_admin() returns boolean
  language sql security definer set search_path = public stable
as $$ select coalesce((select is_admin from profiles where id = auth.uid()), false) $$;
```

### User state

```
skill_progress    user_id, skill_slug, content_type ('primer'|'plan'),
                  position, visited[], state jsonb,
                  started_at, completed_at, updated_at
                  PK (user_id, skill_slug, content_type)

user_news         user_id, story_id, favorited, pinned, created_at
                  PK (user_id, story_id)

notes             id, user_id, target_type ('news'|'skill'), target_id,
                  body, created_at, updated_at
```

`skill_progress` maps directly onto the shape already in `localStorage`, so the import is mechanical:

```js
// plan.html  → position=section, visited, state={quizSelected,quizRevealed,quizOrder,habitOpen}
{ section, visited[], quizSelected, quizRevealed, quizOrder, habitOpen[] }  // :3064

// primer.html → position=current, visited, state={}
{ current, visited[] }                                                      // :1078
```

`started_at` and `completed_at` are new and are what the dashboards are built on. Define completion explicitly: a plan is complete when `visited` covers all 14 sections; a primer when it covers all slides.

### Content

```
news_stories      id, slug, legacy_id, story_date, sort_order, title, source,
                  url, summary, implications, tags[], pinned, status,
                  created_at, updated_at

blog_posts        id, slug, title, excerpt, body, category_id, status,
                  published_at, author_id, created_at, updated_at
blog_categories   id, slug, name, sort_order

site_updates      id, update_date, body, published        -- replaces updates.json

announcements     id, type ('skill'|'feature'|'story'), announce_date,
                  text_html, link_href, link_label,
                  starts_at, expires_at, active, sort_order,
                  created_at, updated_at                  -- replaces the hardcoded
                                                          -- ANNOUNCEMENTS array in index.html
```

Note `news.json`'s existing `pinned` flag is **editorial** — admin-set, at most one site-wide. That's `news_stories.pinned`, and it is a different concept from `user_news.pinned`, which is per-user. Don't conflate them.

### News URLs: why slugs, not the current format

Story URLs today are `news.html?story=<date>-<index>`, where the index is the story's **positional slot** in that day's array — parsed by splitting on the last dash (`middleware.js:20`).

That format is safe only while news is hand-edited. The moment an admin UI exists, reordering is a drag away and deleting is one click — and either silently repoints every previously shared link for that day at a *different story*. Someone clicks a three-week-old LinkedIn post and lands on the wrong article, with no error anywhere.

So:

- Each story gets an **immutable `slug`**, auto-generated from the title, editable, uniqueness-checked: `/news/2026-08-14-ai-adoption-stalls`.
- The 69 migrated stories keep their original `<date>-<index>` in `legacy_id`, and a server endpoint **301-redirects** old URLs to the slug URL.
- Deletion is a `status = 'archived'` flag, never a hard delete, so a shared link never dies.

For site management: reorder and delete freely, nothing breaks. For readers: shared links become readable, old links work forever, and the 301 consolidates SEO value onto the new URL.

### The announcement banner

The rotating banner on the home page draws from two sources today, and both become DB-backed:

- A hardcoded `ANNOUNCEMENTS` array at `index.html:310` — editable only by editing that file and deploying.
- The three most recent news stories under 14 days old, from `fetch('news.json')` at `index.html:380`.

The goal is that banner content becomes a DB edit served on the next page load: no commit, no push, no deploy.

**Expiry becomes explicit.** Today it's implicit and type-based — `EXPIRY_DAYS = { feature: 14, skill: 21 }` at `index.html:332` — so items silently drop out. Replace this with `starts_at` / `expires_at` columns, defaulted per type in the admin form. Same automatic cleanup, but items can be scheduled ahead and the disappearance date is visible rather than inferred.

**Icons stay in code.** Each `type` maps to an inline SVG at `index.html:334`. Adding items of existing types is pure DB work, as intended; inventing a new category still needs a code change to add its icon. Keep it that way — SVG markup is presentation, not content, and a DB field means hand-editing SVG in a textarea.

**`text_html` is trusted HTML.** It is inserted unescaped at `index.html:366` — that's how `<b>` bolding works — while everything else in that function is escaped. Acceptable because writes are admin-only under RLS, but the admin form should present it as an HTML field rather than a plain text input.

**Rendering stays client-side.** `index.html` remains a static file in `public/` and the banner already renders from a fetch, so only the URL changes. Banner content is supplementary rather than primary, so client-side rendering costs nothing in SEO terms here — unlike the blog, where it would.

### RLS

Enabled on every table in the first migration, before any data exists.

| Tables | Policy |
|---|---|
| `skill_progress`, `user_news`, `notes` | `user_id = auth.uid()` for all operations |
| `profiles` | Read own; update own; `is_admin` protected by trigger |
| `news_stories`, `blog_posts`, `blog_categories`, `site_updates`, `announcements` | Public read where published; write only where `is_admin()` |

Two things beyond table policies:

- **The `service_role` key must never reach the browser.** It bypasses RLS entirely. Its only home is a server endpoint's environment variables.
- Restrict what `anon` is granted on the `public` schema, not just what the policies allow.

---

## Search

Keep [fuse.min.js](../fuse.min.js) and the existing search UX unchanged. Only the index source changes: `search-index.json` becomes `/api/search-index.json`, assembled from the DB plus the static page and person entries. `search.html:719` changes one fetch URL.

The win is maintenance, not capability. The current index is 92 hand-maintained entries that `.claude/commands/add-skill.md` explicitly documents as manual, so it drifts. Generating it removes that entire class of staleness — and one of the six manual touchpoints from the add-skill workflow.

Capability gains are limited by scope: skill primers and plans stay hand-authored HTML, so their content isn't in the DB and still can't be full-text searched. Client-side fuzzy search also beats Postgres full-text search on typo tolerance for short queries, and has no per-keystroke round-trip. Revisit only if the corpus grows past a few hundred entries. What the DB unlocks later is *filtered* search for signed-in users — "only things I've favourited," "only skills I haven't finished."

---

## Phases

### Impact key

Each phase is marked for whether it changes what people see. Two columns, because admin and
visitor experience diverge sharply here — most of the admin portal is invisible to visitors.

| Marker | Meaning |
|---|---|
| ⚪ **None** | No user-facing code touched. Pure foundation. |
| 🟡 **Silent** | User-facing code changed, intended effect is *zero* perceptible difference. Regression risk only, nothing to announce. |
| 🔵 **Visible** | Users notice a difference, but it isn't new functionality. |
| 🟢 **New** | New functionality or experience. Banner-worthy. |

| Phase | Visitor | Admin | Announce? |
|---|---|---|---|
| 1 — Progress module extraction | 🟡 Silent | ⚪ None | No |
| 2 — Astro shell | 🟡 Silent | 🔵 Visible *(dev workflow changes)* | No |
| 3 — Supabase schema + RLS | ⚪ None | ⚪ None | No |
| 4 — Email | ⚪ None | ⚪ None | No |
| 5 — Auth + progress sync | 🟢 **New** + 🔵 one regression | 🟢 New | **Yes — the big one** |
| 6 — News into DB | 🔵 Visible + 🟢 New | 🟡 Silent | **Yes — favourites/notes** |
| 7 — Admin portal + banner | ⚪ None | 🟢 **New** | No |
| 8 — Blog | 🟢 **New** | 🟢 New | **Yes** |
| 9 — Dashboards | 🟢 **New** | ⚪ None | **Yes** |

Phases 1–4 are entirely invisible to visitors — roughly half the work, shippable to production
without a single announcement. That is deliberate: it front-loads the risk into changes nobody sees.

### Phase 1 — Extract progress into a shared module

**Impact:** 🟡 Silent (visitor) · ⚪ None (admin)

No Supabase, no Astro, no visible change. Move the duplicated progress code out of all 10 skill pages into `public/progress.js`, keeping `localStorage` as the backend.

Files: `progress.js` (new), and the script blocks in `skills/*/plan.html` (~line 3050) and `skills/*/primer.html` (~line 1015).

Deliberately first. Bolting Supabase onto 10 copy-pasted implementations means making the same edit ten times and getting it slightly wrong twice. After this, Phase 5 is a one-file change.

### Phase 2 — Astro shell

**Impact:** 🟡 Silent (visitor) · 🔵 Visible (admin — local dev command changes, and `main` gains the ability to fail a build)

Introduce Astro with all existing pages moved into `public/`. No page conversions. Confirm every one of the 16 pages still serves identically, then add a base layout that loads `nav.js` and `styles.css` so new pages match.

### Phase 3 — Supabase project, schema, RLS

**Impact:** ⚪ None · ⚪ None — no site code touched beyond one throwaway test page.

All tables, all policies, `is_admin()` and the profile trigger. Prove auth end to end on one throwaway page before touching the real site.

### Phase 4 — Email

**Impact:** ⚪ None · ⚪ None — configuration only, and no user can trigger an auth email until Phase 5.

Point Supabase Auth SMTP at Brevo; verify DKIM and DMARC **before** any real user can trigger a password reset.

Two things to confirm first:
- The brief describes outbound mail as *sent from Gmail, masked* to look like the custom domain. That isn't the same as Brevo being the SMTP relay. If Brevo only provides domain authentication, there are no existing SMTP credentials and a Brevo SMTP key must be created.
- Cloudflare Email Routing requires Cloudflare to be authoritative DNS for `amplifiedthinker.com`, while Vercel needs its own records on the same zone. Inbound reportedly works today, so this is presumably already fine — confirm before changing DNS.

### Phase 5 — Auth and progress sync

**Impact:** 🟢 New + 🔵 one regression (visitor) · 🟢 New (admin) — **announce this one.**

Sign-in/out UI in `nav.js`, plus `auth.js` and `supabase-client.js`. Switch `progress.js` to Supabase for signed-in users.

This is the phase needing the most communication planning. Sign-in appears in the nav on every
page and progress starts following users across devices — but guests **lose the resume banner**,
which they get for free today. That is the only place in this plan where existing behaviour gets
*worse* for anyone. It is intentional, and it is the reason to sign in, but it should be framed as
"your progress now follows you everywhere" rather than letting people discover the banner
silently vanished. The one-time import prompt softens it by offering a migration path at exactly
the moment someone signs in.

**The one-time import.** On first login, scan `localStorage` for `amplified_plan_<slug>` and `amplified_primer_<slug>` across the five live slugs. If anything is found, prompt before merging, then clear the keys. This code is disposable — mark it for deletion in a few months.

**Theme stays in `localStorage`.** `nav.js:8` reads it before first paint; a DB round-trip there gives every visitor a flash of the wrong theme on every page load. For signed-in users, sync it to `profiles` as a convenience, but keep local as the fast path. Removing localStorage means *progress* state, not theme.

Guests keep full content access and lose the resume banner. That's the intended trade — it's the reason to sign in.

### Phase 6 — News into the DB

**Impact:** 🔵 Visible + 🟢 New (visitor) · 🟡 Silent (admin) — **announce the favourites/notes half.**

Migrate the 21 date groups / 69 stories from [news.json](../news.json), generating slugs and populating `legacy_id`. Build `/news` and `/news/:slug` in Astro, plus the 301 redirect endpoint for legacy URLs. Add favourite, pin, and notes for signed-in users.

- **Visible:** story URLs change from `news.html?story=2026-08-14-0` to `/news/2026-08-14-<slug>`. Old links 301, so nothing breaks, but shared links look different from here on.
- **New:** favourite, pin, and notes on stories — worth announcing in its own right.

**Banner, first half.** The banner's news source must switch from `fetch('news.json')` (`index.html:380`) to the DB, because `news.json` no longer exists. Forced by this phase, not optional. Visitors should see no difference.

`middleware.js` fetches `/news.json` and will break — but once news is genuinely server-rendered, its bot-sniffing shell has nothing left to do. Retire it rather than porting it.

`search-index.json` becomes `/api/search-index.json`.

### Phase 7 — Admin portal and banner

**Impact:** ⚪ None (visitor) · 🟢 New (admin) — everything here sits behind `is_admin()`.

`/admin` pages for blog CRUD, categories, news, and site config (What's New, skill card states). Access gated by `is_admin()` — enforced in RLS, not just hidden in the UI. A non-admin loading the page must still be unable to write.

**Banner, second half.** The hardcoded `ANNOUNCEMENTS` array at `index.html:310` moves into the `announcements` table with an admin CRUD screen. Deliberately a like-for-like swap — visitors should see an identical banner. The entire gain is on the admin side: banner content becomes a DB edit served on the next page load, with no commit, no push, and no deploy. See "The announcement banner" under Data model for the expiry, icon, and trusted-HTML decisions.

### Phase 8 — Blog

**Impact:** 🟢 New · 🟢 New — **announce.** A whole new content section.

Public blog index and posts, rendered from the DB on request so publishing is instant. Categories and most-recent ordering. Sitemap and search index pick posts up automatically from the Phase 6 endpoints.

### Phase 9 — Dashboards

**Impact:** 🟢 New (visitor) · ⚪ None (admin) — **announce.**

Progress and completion visuals over `skill_progress`. A charting library, vendored or imported through Astro.

**Deferred:** leaderboards. The model supports them later — `profiles.display_name` plus a `security definer` function — but there's nothing meaningful to rank yet. The only scoreable artifact is a 5-question knowledge check with a visible answer-reveal button.

---

## Verification

- **Phase 1:** load all 10 skill pages, advance sections, reload, confirm the resume banner restores identically. `localStorage` payloads must be byte-identical before and after the refactor.
- **Phase 2:** diff every one of the 16 pages served through Astro against the current live site. They must be identical.
- **Phase 3:** with the anon key alone, confirm `select` on every table returns zero rows when signed out.
- **Phase 5:** the critical test is a user with existing local progress signing in for the first time, then opening the site on a second device. Progress must merge, never truncate. Test both directions.
- **Phase 6:** `curl -I` an existing shared story URL (`/news.html?story=2026-08-14-0`) and confirm a 301 to the slug URL. Then reorder stories in that day via the admin UI and re-run it — it must still land on the same story.
- **Phase 7:** sign in as a non-admin and attempt a write to `blog_posts` directly via the client. It must fail at the database, not just be hidden.
- **Phase 7 (banner):** screenshot the home page banner before and after the swap — they must be indistinguishable. Then add an announcement in the admin UI and confirm it appears on a hard refresh with no deploy.
- **Phase 8:** `curl` a blog post and confirm the body text is in the response, not just meta tags.

---

## Appendix: corrections to the original brief

Its reasoning on RLS, on not rendering the blog client-side, and on email sequencing was sound. What it got wrong, having been written without the repo:

1. **Progress tracking was described as unbuilt, and the next step as "blocked" on defining a learning library item.** It's shipped and working on all 10 skill pages. Items are `skills/<slug>/{primer,plan}` — flat, no nesting. Progress is *both* resumable position and completion. All three of its open questions were already answered in code.

2. **"The real work is extracting the repeated header, nav, and footer."** Already done — `nav.js` injects the nav into all 16 pages from one source, and no page contains nav markup. The footer is duplicated, but across only the 6 root pages; the 10 skill pages have none.

3. **"A `.html` file becomes `.astro` by renaming it."** Each `plan.html` carries ~49 inline `onclick=` handlers (~240 total). Astro bundles `<script>` as scoped modules by default, which breaks all of them. This is why those pages stay in `public/` — the cost is real, and this plan defers it indefinitely rather than paying it up front.

4. **Option A (markdown in the repo + Astro) is the wrong shape for the goal** — it means publishing by editing files in git, which is what the admin portal exists to replace. Option B (DB pulled at build time) works but makes publishing wait on a rebuild.

5. **§4's "database view or `security definer` function"** should drop the view half. Supabase's linter flags `security_definer_view` as an error for views in API-exposed schemas.

6. **§6's account-linking claim is imprecise.** The failure isn't that GitHub "often" withholds verified emails. It's that users with private email settings get `<id>+<user>@users.noreply.github.com`, which can never match an email/password signup — so a duplicate account is guaranteed, not occasional. Verify current linking behaviour against Supabase docs before launch.

7. **Contact email already exists** — `singchen@amplifiedthinker.com` is live on `about.html:235`.

8. **The `github.io` "fallback" is not a fallback — it is a second supported production origin.**
   `about.html` sniffed the hostname and hid the contact email on any non-`amplifiedthinker.com` host.
   Phase 0 confirmed `https://sing-chen.github.io/amplifiedthinker/` **is serving the full site**,
   rebuilt from `main` (it already carries the Phase 1 `progress.js`) — and, more importantly, *why*:
   some corporate networks block the custom domain under newly-registered-domain policies, so those
   users reach the site only through the GitHub URL.

   This is the most consequential correction in this appendix, because it invalidates a design
   decision elsewhere in this document rather than merely a fact. **The plan assumed one production
   origin.** Three things follow:

   - `about.html` was hiding the contact email from precisely the audience least able to reach any
     other route. **Resolved 2026-08-17:** the test now blocklists `*.github.io` rather than
     allowlisting the custom domain, so previews and localhost match production. Whether the email
     should be shown on the GitHub origin too is an open content decision.
   - **Phase 2 must build for two targets.** Pages serves the repo root; moving pages into `public/`
     breaks it. It needs a GitHub Actions static build.
   - **Phase 5's hostname-based environment switch was backwards.** Allowlisting the custom domain as
     production would send NRD-blocked users to the *dev* Supabase project once the databases split —
     silent data loss for real users. Blocklist non-production instead.

   Capability matrix and the October 2026 re-test date are in
   [dev-workflow.md](dev-workflow.md). *(The matching stale reference in
   `.claude/commands/add-skill.md` was corrected on 2026-08-17, when that file was brought under
   version control.)*
