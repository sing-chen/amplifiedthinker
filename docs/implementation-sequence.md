# Implementation sequence

**Status:** In progress — Phases 0 and 1 complete; Phase 2 unblocked · **Last updated:** 2026-08-17

The phased breakdown of activities, with rationale for each. Companion to:

- [supabase-integration-plan.md](supabase-integration-plan.md) — *what* gets built: architecture, data model, decisions.
- [dev-workflow.md](dev-workflow.md) — *how work happens*: branches, previews, environments.

This document is the middle layer: the order of work and why that order. Granular steps within
each activity get worked out as each phase starts.

---

## Impact key

Each phase is marked for whether it changes what people see. Two columns, because admin and
visitor experience diverge sharply — most of the admin portal is invisible to visitors.

| Marker | Meaning |
|---|---|
| ⚪ **None** | No user-facing code touched. Pure foundation. |
| 🟡 **Silent** | User-facing code changed, intended effect is *zero* perceptible difference. Regression risk only, nothing to announce. |
| 🔵 **Visible** | Users notice a difference, but it isn't new functionality. |
| 🟢 **New** | New functionality or experience. Banner-worthy. |

| Phase | Status | Visitor | Admin | Announce? | Depends on |
|---|---|---|---|---|---|
| 0 — Branch + environment setup | ✅ **Done** (allowlist deferred to 3) | ⚪ None | ⚪ None | No | — |
| 1 — Progress module extraction | ✅ **Done — live** | 🟡 Silent | ⚪ None | No | — |
| 2 — Astro shell | ☐ Not started | 🟡 Silent | 🔵 Visible | No | 0 |
| 3 — Supabase schema + RLS | ☐ Not started | ⚪ None | ⚪ None | No | 0 |
| 4 — Email | ☐ Not started | ⚪ None | ⚪ None | No | 3 |
| 5 — Auth + progress sync | ☐ Not started | 🟢 **New** + 🔵 regression | 🟢 New | **Yes — the big one** | 1, 3, 4 |
| 6 — News into the DB | ☐ Not started | 🔵 Visible + 🟢 New | 🟡 Silent | **Yes** | 2, 3, 5 |
| 7 — Admin portal + banner | ☐ Not started | ⚪ None | 🟢 **New** | No | 6 |
| 8 — Blog | ☐ Not started | 🟢 **New** | 🟢 New | **Yes** | 7 |
| 9 — Dashboards | ☐ Not started | 🟢 **New** | ⚪ None | **Yes** | 5 |

**Phases 0–4 are entirely invisible to visitors** — roughly half the work, shippable to production
without a single announcement. That is deliberate: it front-loads risk into changes nobody sees.

---

## Progress log

### Phase 1 — done, merged, live (2026-08-17)

Shipped in `ed7a00b`, with follow-up fixes in `e067d8c` and `11c6be1`. Net −72 lines on the
refactor itself; 10 duplicated implementations became one.

- `progress.js` at the repo root, loaded by all 10 skill pages after `nav.js`. Owns storage only:
  key naming, JSON, and the fail-silent try/catch. Pages keep their own DOM↔shape mapping.
- Storage keys unchanged, and now derived from the URL rather than hardcoded per page — 10
  constants removed.
- Verified byte-identical output by seeding a known payload, reloading, and re-saving against both
  the old and new code, including the pre-existing quirk where `section` is `null` until the first
  scroll. Restore, resume, reset and save-on-navigate all exercised across all 10 pages.

**Two defects surfaced by manual verification, both pre-existing rather than caused by the
refactor, both now fixed:**

1. Principles & Models accordions never persisted — `toggleAccordion()` didn't save and
   `restoreState()` only handled `habitOpen`. Now tracked by id, with page defaults captured
   separately so reset returns to a first-visit state rather than blank.
2. `updateNav()` guarded both branches of its visited toggle with `s !== activeId`, so a link
   that became active kept a stale `visited` class. With `.visited` declared after `.active` at
   equal specificity, the current section rendered as visited. Fixed with a single `toggle`, plus
   rail states redesigned so shape distinguishes them: empty ring / solid fill / fill with halo.

**Worth carrying forward:** neither defect was catchable by the byte-identical payload test, which
by design only proved the refactor changed nothing. Both came from a human looking at a real
browser. Later phases should not treat automated verification as sufficient for anything visual.

### Phase 0 — done (2026-08-17), one activity deferred to Phase 3

Ran as a deliberate pass after Phase 1 rather than before it. Mostly verification, which is the
point — the value was in what turned out not to be true.

- **Production branch confirmed by behaviour, not by setting.** `main`-only commits are live on
  `amplifiedthinker.com`; the two feature branches only ever produced preview URLs.
- **Previews confirmed working**, behind Vercel Authentication (proven during Phase 1).
- **Supabase redirect allowlist — deferred to Phase 3.** There is no project to configure yet. The
  exact values are settled in [dev-workflow.md](dev-workflow.md) so they don't get invented later
  under pressure. This is the only Phase 0 activity not closed.
- **Branch protection — decided against.** `deploy.bat` pushes straight to `main`, so requiring pull
  requests would turn every content update into a PR. On a solo repo the protection guards against
  nobody. Recorded as a decision rather than left open.

**The finding: a second copy of the site is live.** `sing-chen.github.io/amplifiedthinker` is serving
the full site, rebuilt from `main` — it already carries the Phase 1 `progress.js`. It had been assumed
dead. Two consequences: the hostname sniff in `about.html` was live behaviour rather than dead code,
and Phase 2 would have broken that origin silently, since moving pages into `public/` leaves Pages
with no `index.html` at the repo root.

Fixed the half that was mine to fix: the sniff now blocklists `*.github.io` instead of allowlisting
the custom domain, so **previews and localhost render what production renders.** Previously every
preview of `about.html` showed the LinkedIn-only contact block — a preview lying about production,
in the phase whose whole purpose is making previews trustworthy. Retiring the mirror is a GitHub
account setting and remains open.

**Worth carrying forward:** Phase 1's lesson was that automated checks miss visual defects. Phase 0's
is the mirror image — *"we don't use that any more"* is a claim to test with `curl`, not accept. The
appendix had hedged this as "if a second origin is still live" for weeks; one request settled it.

---

## Phase 0 — Branch and environment setup ✅ DONE

**Impact:** ⚪ None · ⚪ None · **Closed 2026-08-17** — outcome in the Progress log above.

**Why first:** everything below assumes previews work and production is insulated. Half a day
here prevents a class of bug that looks like broken code but is actually broken configuration —
the worst kind to debug, because the code is fine.

| Activity | What it does, and why |
|---|---|
| Confirm Vercel production branch is `main` | Establishes the safety model everything else relies on. Verify rather than assume. **✅ Verified by behaviour.** |
| Verify a throwaway branch gets a preview URL | Proves previews work *before* you need them under pressure. **✅ Proven during Phase 1.** |
| Add Supabase redirect allowlist entries, including the preview wildcard | Prevents sign-in failing silently on every branch. Cheap now, confusing later. **→ Deferred to Phase 3** — no project exists yet; values pre-agreed in `dev-workflow.md`. |
| Agree branch naming; optionally protect `main` | Removes the "did I just push to production" question. **✅ Naming settled (`feat/…`, short, one per phase); protection decided against — it would break `deploy.bat`.** |
| Audit which origins actually serve the site | Every live origin is an auth surface and a preview-fidelity risk. **✅ Found the Pages mirror live; `about.html` fixed so previews match production.** |

**Done when:** a throwaway branch deploys to a preview URL you can open in a browser — **met**, and
previews now render the same contact block production does.

See [dev-workflow.md](dev-workflow.md) for the specific settings and values.

---

## Phase 1 — Extract progress into a shared module ✅ DONE

**Impact:** 🟡 Silent · ⚪ None · **Shipped 2026-08-17** — outcome in the Progress log above.

**Why first among the real work:** the progress code is copy-pasted into all 10 skill pages.
Adding Supabase to 10 copies means making the same edit ten times and getting it subtly wrong
twice. Extract once, and Phase 5 becomes a one-file change.

**Why it's safe to do now:** no Supabase, no Astro, no dependency on any decision below. It is a
pure refactor with an exact-match test, so it can ship to production on its own.

| Activity | What it does, and why |
|---|---|
| Write `progress.js` covering both shapes | One module handling plan (`{section, visited, quiz…, habitOpen}`) and primer (`{current, visited}`). Follows the `nav.js` pattern — runtime-loaded, no build, works at any depth. Lives at the repo root alongside `nav.js`; it moves into `public/` in Phase 2 with everything else. |
| Replace the inline block in all 10 skill pages | Removes 10 duplicated implementations, leaves a script tag. This is the actual deliverable. |
| Verify byte-identical localStorage payloads | The gate. Proves nothing changed for anyone who already has progress saved. |

**Done when:** progress saves and restores identically on all 10 pages, and stored JSON matches
pre-refactor output exactly.

**Note for later phases — line endings.** `core.autocrlf=true`, so the repo stores LF and the
working tree gets CRLF on checkout. Working-tree files can still be found with either ending
(anything written by a tool since the last checkout may be LF), and that inconsistency is enough
to break a naive string match. Any script that rewrites these files should normalise to LF for
matching and restore the file's existing ending on write. Verify by diff size: a correct run
touches tens of lines, a line-ending accident touches thousands.

---

## Phase 2 — Astro shell

**Impact:** 🟡 Silent (visitor) · 🔵 Visible (admin — dev command changes, `main` can now fail a build)

**Why now:** every new surface needs somewhere to live. Doing this before any feature means
features get built once, in their final home, rather than built twice.

**Why it's the riskiest phase:** it changes `main` from "cannot fail to deploy" to "a build error
blocks everything, including the 16 existing pages." Nothing after this is as sharp a change in
failure mode.

| Activity | What it does, and why |
|---|---|
| Add Astro; move all 16 pages into `public/` | Files in `public/` ship byte-for-byte untouched, so the existing site is unaffected. Zero page conversions — that is the point. |
| Commit `vercel.json` with the build config | Keeps build settings in the branch rather than the Vercel dashboard, so `main` keeps deploying as static until merge. This is what makes the cutover reversible. |
| Diff all 16 preview pages against live | The gate. Any difference means stop and investigate. |
| Add a base layout loading `nav.js` and `styles.css` | New pages inherit the existing nav and design tokens for free, which is why the split causes no visual drift. |
| Update `.claude/launch.json` to `npm run dev` | Local dev keeps working; `python -m http.server` cannot run Astro. Now version-controlled, so this change is reviewable rather than a silent local edit. |
| Settle the GitHub Pages mirror **before** merging | Phase 0 found it live. Moving the 16 pages into `public/` leaves Pages with no `index.html` at the repo root, so the mirror starts 404ing at merge. Retire it deliberately or give Astro a Pages-compatible output — do not discover this afterwards. |

**Done when:** all 16 pages are byte-identical on the preview URL, and a new blank Astro page
renders with correct nav and styling.

**Rollback:** Vercel retains previous deployments — promote the last good one from the dashboard.
Instant, and no git revert needed first.

---

## Phase 3 — Supabase schema and RLS

**Impact:** ⚪ None · ⚪ None — no site code touched beyond one throwaway test page.

**Why RLS from the very first migration:** with no server in front of the database, RLS *is* the
security model. Tables created open and locked down later are how data leaks, because there is no
natural moment that forces you back to do it.

| Activity | What it does, and why |
|---|---|
| Create all tables in one migration | The whole shape is visible at once, so relationships get designed rather than accreted. |
| Enable RLS and write policies before inserting any row | Removes any window where data exists unprotected. |
| Add `is_admin()` and the profile-column trigger | Creates the admin gate, and ensures users cannot grant it to themselves. |
| Prove auth end to end on one throwaway page | Validates the whole chain — signup, session, policy enforcement — before it touches a real page. |

**Done when:** using only the anon key, every table returns zero rows when signed out — verified
by direct query, not by the UI hiding things.

---

## Phase 4 — Email

**Impact:** ⚪ None · ⚪ None — configuration only; no user can trigger an auth email until Phase 5.

**Why before auth ships:** the first password reset that lands in spam is unrecoverable as a
first impression, and you find out from the user who *doesn't* tell you. Sequencing this ahead of
real users is the entire point.

| Activity | What it does, and why |
|---|---|
| Confirm whether Brevo SMTP credentials actually exist | The brief assumed they do. The described setup — Gmail sending, masked — suggests Brevo may only be providing domain authentication, in which case an SMTP key must be created. Resolve before building on the assumption. |
| Point Supabase Auth SMTP at Brevo | Replaces the built-in mailer, which is rate-limited and explicitly not for production use. |
| Verify DKIM and DMARC alignment | Determines inbox versus spam. Do this before the first real send, not after. |
| Confirm Cloudflare MX and Vercel records coexist | Both need records on the same DNS zone. Inbound reportedly works today, so this is a check rather than a change. |

**Done when:** a test signup, password reset, and email change all arrive in a real inbox.

---

## Phase 5 — Auth and progress sync

**Impact:** 🟢 New + 🔵 one regression (visitor) · 🟢 New (admin) — **the announcement that needs most thought.**

**Why this is the payoff phase:** it is the point where the original problem — progress trapped in
one browser on one device — actually goes away.

| Activity | What it does, and why |
|---|---|
| Build `auth.js` and `supabase-client.js`; vendor `supabase.min.js` | Client foundation. Vendoring matches the existing `fuse.min.js` convention so static pages work without a bundler. |
| Add sign-in UI to `nav.js` | One edit puts auth state on all 16 pages, because the nav is injected from a single source. |
| Switch `progress.js` to Supabase for signed-in users | The actual feature. Guests keep working exactly as before. |
| Build the one-time localStorage import | Prompts before merging existing progress, then clears the keys. Disposable code — mark it for deletion in a few months. |
| Keep theme in localStorage; sync to profile as a convenience | A DB round-trip before first paint would flash the wrong theme on every page load. |
| Split into dev and prod Supabase projects | Real user data now exists. This is the moment that split earns its cost — not before. |

**Done when:** a user with existing local progress signs in, accepts the import, opens a second
device, and sees the same state. **Test both directions** — the failure mode here is silent
truncation, not an error.

### Announcement planning

This is the only place in the whole plan where existing behaviour gets *worse* for someone:
guests **lose the resume banner** they get for free today. It is intentional — it is the reason to
sign in — but existing regular visitors will feel it.

Frame the announcement as "your progress now follows you everywhere, sign in to keep it" rather
than letting people discover the banner silently vanished. The one-time import prompt softens it
by offering a migration path at exactly the moment someone signs in.

---

## Phase 6 — News into the DB

**Impact:** 🔵 Visible + 🟢 New (visitor) · 🟡 Silent (admin) — **announce the favourites and notes.**

**Why before the admin portal:** it gives the admin UI something real to manage, and forces the
URL problem to be solved while the data set is small, known, and fully under your control.

| Activity | What it does, and why |
|---|---|
| Migrate 21 date groups / 69 stories, generating slugs | Populates `legacy_id` so every existing shared link stays resolvable. |
| Build `/news` and `/news/:slug`, server-rendered | Real HTML for crawlers. No user-agent sniffing — serving different content to Googlebot than to users is cloaking. |
| Add the 301 redirect endpoint for legacy URLs | Old links keep working forever and consolidate SEO value onto the new URL. |
| Switch the banner's news source to the DB | **Forced by this phase** — `news.json` no longer exists, so `index.html:380` must change. Visitors should see no difference. |
| Add favourite, pin, and notes for signed-in users | First personalisation feature on real content. |
| Retire `middleware.js` | Its only job was faking meta tags for social scrapers. Real server rendering makes it redundant — retire rather than port. |
| Move `search-index.json` to `/api/search-index.json` | Kills a hand-maintained file that drifts, and removes one of the six manual add-skill touchpoints. |

**Done when:** an old shared URL 301s correctly — **and still does after you reorder that day's
stories in the database.** That second check is the entire reason slugs replaced positional
indexes.

---

## Phase 7 — Admin portal and banner

**Impact:** ⚪ None (visitor) · 🟢 New (admin) — nothing visitor-facing, nothing to announce.

**Why after news:** the CRUD screens get built against a schema already proven by a real
migration, rather than against a schema that only exists in theory.

| Activity | What it does, and why |
|---|---|
| `/admin` shell gated by `is_admin()` | Entry point. Access enforced in RLS, not by hiding buttons — a non-admin who finds the page still cannot write. |
| Blog post and category CRUD | The core reason the database exists. |
| News management: edit, reorder, archive | Replaces the `add-news` skill. Archive rather than delete, so shared links never die. |
| Banner CRUD over the `announcements` table | Moves the hardcoded array at `index.html:310` into the DB. Deliberately like-for-like — visitors see an identical banner. |
| Site config: What's New, skill card states | Removes the remaining hand-edited JSON and HTML toggles. |

**Done when:** a signed-in non-admin attempting a direct write to `blog_posts` from the browser
console is rejected by the database. Separately: the banner looks indistinguishable before and
after, and a new announcement added through the admin UI appears on a hard refresh with no deploy.

### On the banner

The whole gain here is on the admin side. Banner content becomes a database edit served on the
next page load — no commit, no push, no deploy. Rendering stays client-side, which costs nothing
in SEO terms because banner content is supplementary rather than primary. See "The announcement
banner" in [supabase-integration-plan.md](supabase-integration-plan.md) for the expiry, icon, and
trusted-HTML decisions.

---

## Phase 8 — Blog

**Impact:** 🟢 New · 🟢 New — **announce.** A whole new content section.

**Why last of the content work:** it depends on the admin portal existing, and it is the only
genuinely new content type rather than a migration of something that already exists.

| Activity | What it does, and why |
|---|---|
| `/blog` index and `/blog/:slug`, rendered on request | Publishing is instant — no rebuild wait, which is the reason this isn't a build-time approach. |
| Category and recency views | The discovery surfaces the content is for. |
| Confirm sitemap and search index pick posts up | Should be automatic from the Phase 6 endpoints. Verify rather than assume. |

**Done when:** `curl` on a published post returns the body text in the HTML, not just meta tags.

---

## Phase 9 — Dashboards

**Impact:** 🟢 New (visitor) · ⚪ None (admin) — **announce.**

**Why last:** it visualises data that only exists once Phases 5 to 8 have been running long
enough to produce any. Building it earlier would mean designing charts against empty tables.

| Activity | What it does, and why |
|---|---|
| Completion and progress views over `skill_progress` | Uses `started_at` and `completed_at`, which is why those columns exist from Phase 3. |
| Saved items view | Favourites, pins, and notes in one place. |

**Deferred: leaderboards.** The schema supports them — `profiles.display_name` plus a
`security definer` function — but there is nothing meaningful to rank yet. The only scoreable
artifact today is a 5-question knowledge check with a visible answer-reveal button.
