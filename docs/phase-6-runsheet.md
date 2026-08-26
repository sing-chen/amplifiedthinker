# Phase 6 runsheet — retiring the Pages origin, then news into the DB

**Written:** 2026-08-22 · **Drift-checked:** 2026-08-24, **2026-08-26 (Part A reconciled — read the
note under the handoff table)** · **Branch:** `feat/news-db`, cut from `main`
at `96f9b9d` and kept current by merging `main` in — eight merges so far, no divergence
**Phase definition:** [implementation-sequence.md](implementation-sequence.md) §Phase 6 ·
**Architecture:** [supabase-integration-plan.md](supabase-integration-plan.md) §Phase 6
**Migration runbook:** [../supabase/README.md](../supabase/README.md) ·
**Retirement rationale:** [../BACKLOG.md](../BACKLOG.md) §Retiring the GitHub Pages origin

Two pieces of work in one runsheet, in this order on purpose. **Part A** retires
`sing-chen.github.io/amplifiedthinker` as a published URL. **Part B** moves news out of
`public/news.json` and into the database, with server-rendered pages and permanent redirects for
every link already shared.

⚠️ **Part A is not a tidy-up that happens to come first. It is a precondition.** Four of Phase 6's
seven activities need a server, and the Pages origin has none. Worse, `pages.yml` carries a
file-existence gate that names `news.json` explicitly ([pages.yml:60](../.github/workflows/pages.yml:60))
— so the moment Part B deletes that file, the Pages build fails on `main` whether anyone planned
for it or not. The choice is retire it deliberately now, or have it break by accident later.

⚠️ **What retires is the published URL, not GitHub.** The repository, the history and the Actions
workflows stay exactly where they are. Only `sing-chen.github.io/amplifiedthinker` stops being a
public route to the site. Reading this as "move off GitHub" is a catastrophic misreading.

---

## Handoff — read this before doing anything

⚠️ **AND `feat/news-db` IS THE COPY.** This file now exists on `main` too, because Part A and the
adapter were merged there while Phase 6 is still open. **The copy on `main` is a snapshot taken at
the last merge and goes stale the moment anything is ticked here** — it already did, within minutes:
stage 7's `verify:published` box read *"owed after deploy"* on `main` while it was ticked and
evidenced on the branch.

**Read this file on `feat/news-db` until stage 17 merges the phase.** If you are on `main` and a box
looks open, check the branch before acting on it — the work may be done and recorded.

**This file is the state.** There is no other tracker. Whoever does a stage updates its status row
in the same sitting, in this file, and says what they *observed* — not "done" but what the check
printed. A stage left at `◐ In progress` with no note is the failure mode this section exists to
prevent.

| # | Stage | Owner | Status | Notes from the person who did it |
|---|---|---|---|---|
| **A** | **Retire the Pages origin** | | | |
| 0 | Baseline — what is true before you start | Claude + Human | ✅ Done | 2026-08-22, all three gates green, **no deviation from the state described below**. `verify:stamp` both origins current on `96f9b9d`, 9s apart; `verify:published` 79 files / 158 fetches / 0 not served; `verify:redirects` 12 assertions, every origin resolving to the project that owns it. ⚠️ Two findings: the `verify:published` baseline is **two-origin and cannot be retaken after stage 2**, and the Pages redirect entry must **move to `rejected`** rather than be deleted — stages 4 and 5 amended |
| 1 | Is the origin actually indexed? | Human | ✅ Done | 2026-08-22. **Not indexed anywhere.** Google: *"did not match any documents"* — the explicit empty-result page, not a thin one. Bing and DuckDuckGo return only a shared off-topic `archive.org` fallback. **Decided: delete outright, no redirect stubs.** ⏭️ The skipped stubs are **deferred, not dismissed** — see the note under stage 1 for the three signals that would reopen it, and what reopening would cost now that stage 2 has gone in |
| 2 | Stop publishing to Pages | Human + Claude | ✅ Done | 2026-08-24. Workflow disabled first, then **Unpublish site** — ⚠️ there is no "None" in the Source dropdown any more, and the order was corrected mid-stage. Pages origin **404 on all four paths checked incl. `build.json`**; apex **200 on all twelve**, spanning hand-written pages, Astro auth surfaces, a skill page, both stylesheets and the stamp. `verify:stamp`: `vercel ok c5b1ce4` / `pages FAIL HTTP 404` — expected. **Fully reversible** |
| 3 | Soak on one origin | Human | ✅ Done | 2026-08-24 08:10Z → 2026-08-26 08:11Z, **48h01m**, all five boxes ticked. Nine commits reached `main`; production serving the tip; baseline retaken at **85 files / 1 origin / 0 not served**; **no broken-link reports**, confirmed by the site owner. ⚠️ Retaking the baseline found `verify-published.mjs` **overstating its own coverage by double** — fixed. ⚠️ This row was briefly marked ✅ with every box unticked before any of it was checked — see the stage's Observed note |
| 4 | Remove Pages from code, gates and docs | Claude | ✅ Done | **Bulk shipped 2026-08-26 on `chore/retire-pages`, merged as `d7728f2` — NOT on this branch.** Checked box by box against the tree the same day, which found three gaps: `nav.js`/`progress.js`/`BaseLayout.astro` still described Pages as live (**fixed**), the Promptly sibling was unchecked (**checked by the owner, no changes needed**), and the `verify-redirects` assertion was **dropped rather than moved** — the one still open, deferred into stage 5 because only the dashboard change makes it pass. Two boxes struck out as deliberately not-done: `ASTRO_BASE` stays, and `settings.local.json` is machine-local |
| 5 | Dashboard cleanup — Supabase and Turnstile | Human | ✅ Done | 2026-08-26. Turnstile hostname removed **first**, then the Supabase entry; prod now holds **one** Redirect URL. `verify-redirects` restored to **13 assertions, green**, including `PASS rejected: sing-chen.github.io/amplifiedthinker/` — which also closed stage 4's last box. **Sign-in verified working on production** after the widget change, the only check Turnstile has. ⚠️ Found that `supabase/README.md` had listed **four** prod redirect URLs since Phase 5 when there is one — the doc contradicted the gate for weeks and nothing caught it, because a doc cannot fail a build |
| 6 | Delete `pages.yml` | Claude | ✅ Done | 2026-08-26, same branch and merge as stage 4. `keepalive.yml` correctly untouched and still scheduled |
| **B** | **News into the DB** | | | |
| 7 | The adapter decision | Claude + Human | ✅ Done | 2026-08-26, deployed as `2c9685c`. `@astrojs/vercel` 11.0.8, **`output` stays `'static'`** — ⚠️ `hybrid` was removed from Astro and `static` is what it became. Build output byte-identical with and without the adapter (88/89, the 89th a timestamp), and the live differential came back **3 changed / 0 not served**, all three the comment-only files. ⚠️ **`vercel.json`'s `outputDirectory: dist` removed** — it would have silently served stage 10's server routes as frozen static. `service_role`: **still no home** |
| 8 | Write the migration script — slugs and `legacy_id` | Claude | ✅ Done | 2026-08-26. `scripts/build-news-seed.mjs` → `supabase/seed/news_seed.sql`, **81 stories / 27 groups / 1 pinned** derived from the file, not hardcoded. **All 81 `legacy_id`s round-tripped through `middleware.js`'s own `findStory()`, 0 mismatches.** ⚠️ Emits SQL rather than inserting: the table is admin-write and `service_role` is ruled out, so the dashboard SQL editor is the only route left  **Loaded and verified in stage 9 on 2026-08-26**, which is what closes this row |
| 9 | Load dev, verify the data | Claude | ✅ Done | 2026-08-26. **81 rows on dev**, 81 distinct slugs and `legacy_id`s, one pinned matching `news.json`, statuses `["published"]` — all verified with the anon key from outside the dashboard. ⚠️ **All 81 stories compared field-by-field against the source, 0 differences**, rather than the five-title eyeball the stage asked for; em dashes read correctly in Postgres. `verify:rls` moved from `empty` to **`published`** — asserting the RLS predicate rather than the absence of data — and passes **22/22** |
| 10 | `/news` and `/news/:slug`, server-rendered | Claude | ✅ Done | 2026-08-26, committed `6f23385`. Both routes live on the branch, `prerender = false`, **81 story links in the index's response body** and the story text in `/news/<slug>`'s — no user-agent sniffing anywhere. Unknown slug **404 + noindex**; unreadable feed **503**, not an empty page. `sitemap.xml` **generated** now (100 URLs) and `public/sitemap.xml` deleted — a static file cannot list 81 URLs and stay right. Server and browser render from **one shared module**, so the two cannot drift. ⚠️ **Two defects found by measuring the rendered page, both also present in `news.html`**: `scrollIntoView` scrolled the whole document on load, and `.story-panel` kept a near-white border in dark mode. **Checked by eye by the site owner and confirmed** — screenshots were unavailable, so every other visual claim here is a measurement. ⚠️ **The cutoff for `/add-news`** once this merges: the command still succeeds and publishes nothing. Breakage map under stage 16 |
| 11 | The 301 endpoint for legacy URLs | Claude | ✅ Done | 2026-08-26. `/news.html?story=<date>-<index>` → **301** → `/news/<slug>`, resolved through the stored `legacy_id`. ⚠️ **`public/news.html` deleted and `/news.html` is a route now** — Vercel runs `handle: filesystem` before any route, so a static file at that path would have shadowed the endpoint entirely; there was no arrangement where both work. ⚠️ **`middleware.js` deleted here, not at stage 15**: its matcher is `/news.html` and it runs *before* the route, so for a social crawler it would have served the old shell **instead of the 301** — and `curl` could never have caught that. Unknown id → **404** (the old page showed the *pinned* story with a 200); failed lookup → **503, never a redirect**, because browsers cache 301s. **13 internal links** moved to `/news/`. ⚠️ **Reorder test PASSED**: with 14 August's two stories swapped on dev, the page order flipped and both redirects stayed put — `2026-08-14-0` still resolves to `ai-employment-gap`, which under the old positional scheme would by then have meant a different article |
| 12 | Switch the banner's news source | Claude | ✅ Done | 2026-08-26. Reads **`/api/news/recent.json`**, a new endpoint on our own domain. ⚠️ **The stage's own question was answered the other way, and `privacy.html` is why**: the homepage *does* load the Supabase client, but a signed-out visitor currently contacts `supabase.co` **never**, so the processor table's "Account holders" is exactly true and §9 claims *no third party is involved in showing you the page*. A browser query would have broken both, on the most-visited page. **privacy.html checked and deliberately unchanged** — the design keeps it true rather than editing it to catch up. Selection rules stayed in `index.html`; both selections computed and compared — **same three stories, same order, only the links changed**. Failure branch tested by actually breaking the fetch. ⚠️ **`news.json` is now read by nothing the site serves** |
| 13 | `search-index.json` → `/api/search-index.json` | Claude | ✅ Done | 2026-08-26. **104 entries before, 104 after**, compared against the old file read out of git: same news set, same order, `tags` still omitted, 122 non-ASCII characters both sides and no mojibake. ⚠️ **Only 78% could be derived away** — the 23 page/primer/plan/person entries are editorial and moved to `src/data/search-static.json` unchanged, extracted by script rather than retyped. ⚠️ **The comparison caught a static entry I had not planned to touch**: the News *page*'s own result still pointed at `news.html`. ⚠️ **A failed read degrades rather than 503s** — `search.html` treats a failed fetch as fatal, so an endpoint that failed hard would have turned a DB outage into a dead search page, a regression caused by the fix. Tested by injecting a failure: 23 entries, `x-news-entries: 0`, search still working. `/add-skill` **repointed, not stripped** | |
| 14 | Favourites, pins and notes | Claude | ✅ Done | 2026-08-26, committed `bfa6d4f`. Save, per-reader pin and a private note on `/news/<slug>` — plus **a read surface the stage never listed**: a Saved filter chip and a Your pins group, because a favourite you cannot go and look at is a button that reports success into a void. Note panel split into **view and edit modes** so Save has somewhere to land; Delete belongs to the note, Clear to the text, both confirmed inline rather than via `confirm()`. Limit is **500 in the database and 500 in the UI** — browsers write to PostgREST directly, so `maxlength` is a courtesy and the constraint is the control. ⚠️ **Defect found by reading the loader**: `start()` read `AmplifiedAuth` once, but nav.js appends the auth stack with `async=false` which does not delay `DOMContentLoaded` — the layer would have stayed unpainted **for signed-in readers only**. Now polls, as `progress.js` does. ⚠️ **A coarse edit deleted three functions and `node --check` stayed green.** **Four enhancements from review** followed on the same day: a `Has notes` chip, **one pin per reader** (trigger + partial unique index, `SECURITY INVOKER`), a replace prompt that names what it replaces, and **`Featured`** for the editorial pin — which until then shared an icon, a tint and the word "pinned" with the reader's own. `verify:rls` now **23/23**. ⏭️ **Two-account RLS proof deferred to stage 17** | ⚠️ First user-authored free text on the site |
| 15 | Retire `middleware.js` | Claude | ◐ **Deleted at stage 11**; verification owed | The file is gone. It was pulled forward because at stage 11 it stopped being merely redundant and started **intercepting the very URLs the 301 answers**. What remains of this stage is the go-live check: a story URL in a link-preview debugger, which needs production and so cannot happen before stage 17 | Retire, not port |
| 16 | Copy, privacy, and the obsolete command | Claude | ✅ Done | 2026-08-26. `privacy.html` gained a §3 category (**what you save and what you write**, with a caution against putting sensitive personal information in a note), a §4 contract row, and corrections at §§11/12/13. ⚠️ **§13 also gained the honest limit** — `why-sign-up.html` was already telling readers *"Privacy says so plainly"* about administrative database access, **and privacy did not say it**. `terms.html` gained §4 *"So is anything you write"* and a §5 acceptable-use line, both following the Promptly sibling, which had the precedent for every part of this. `account.astro`'s deletion copy said *"your saved items"* and now names what it destroys; the cascade was checked against the migration rather than assumed. ⚠️ **`/add-news` was REWRITTEN, not deleted** — its curation half was never about the file format. `public/news.json` **moved** to `content/news.json`: under `public/` it was a stale public copy of database content served at `/news.json` and read by nothing. Route is now author → `build:news-seed -- --only <date> --write` → the SQL editor, with `--only` existing because a full regeneration after Phase 7 would silently overwrite admin-UI edits and report success | ⚠️ Same-commit rule. `/add-news` rewritten, and the interim route written down before the merge |
| 17 | Go live — prod migration, then merge | Human + Claude | ☐ Not started | Migration **immediately before** the merge, never after |
| 18 | Announce | Human + Claude | ☐ Not started | Banner and `updates.json` in the same sitting |

**Statuses:** ☐ Not started · ◐ In progress · ✅ Done · ⊘ Skipped (say why)

### ⚠️ Reconciliation, 2026-08-26 — Part A finished without this file knowing

**Stages 4 and 6 were done on `chore/retire-pages` and merged to `main` as `d7728f2`, while this
branch sat on the soak.** This table went on reading *"☐ Not started"* for work that had already
shipped, which is the exact failure the handoff section exists to prevent — and it would have told
Wednesday's reminder, and anyone picking this up, to redo three stages. Corrected here against the
tree rather than against the commit messages.

**Two things that did not go as this runsheet instructed, both defensible, both worth knowing.**

1. ⚠️ **Stages 4 and 5 did NOT happen in the same sitting**, which Pacing says they must. Stage 5 is
   still open. The reason the gate is not red is the deviation below.
2. ⚠️ **The `verify-redirects` entry was DROPPED, not moved to `rejected`.** Stage 5 says in as many
   words: *"the assertion moves sides; it does not disappear."* It disappeared. The comment left in
   `scripts/verify-redirects.mjs` explains why, and the reasoning holds: the Supabase dashboard still
   allows that host, so asserting `rejected` would fail every run until a human opens the dashboard —
   red for a reason nobody in the repo can fix.

   **But be clear about what was traded.** The gate no longer tests that host in either direction, so
   nothing now checks the one entry stage 5 exists to remove. `sing-chen.github.io` still hosts every
   project on that GitHub account, and prod still honours a redirect to it. **Restore the assertion
   as `rejected` in the same sitting as stage 5** — that is what makes the drop temporary rather than
   permanent.

**What is genuinely left of Part A: stage 5, and nothing else.** It is two dashboard edits, ten
minutes, and it is the only remaining piece with a security dimension.

**Two levels, on purpose.** The table above is the *stage* state and is what a handoff reads first.
Inside each stage a **Tick as you go** list carries the individual steps as `- [ ]` checkboxes — tick
them in the file as you do them, so an interrupted stage says where it stopped rather than only that
it started. A stage is not ✅ in the table until every box under it is ticked or explicitly struck
out.

**Where the ordering is load-bearing:**

- **Stage 1 before stage 5.** Whether anything is indexed decides whether the origin needs redirect
  stubs for a few months or can simply be switched off. Deciding after switching it off means
  guessing.
- **Stage 3 before stage 4.** Stage 2 is reversible in two clicks; stage 4 is a commit that removes
  the Pages build from the repo. Soak while reversal is still cheap.
- **Stage 7 before 10–13.** Four surfaces need a server. Building any of them against a static
  config produces something that works in `astro dev` and 404s in production.
- **Stage 9 before 10.** Build the pages against real migrated rows, not against a shape imagined
  from the JSON.
- **Stage 17 last, and in its stated internal order.** The prod migration goes in immediately before
  the merge — early enough that no deployed code calls a table that has no rows, late enough that
  it has been proven on dev.

**Which stages git can undo.** Stages 4, 6, 8, 10–16 are commits — a Vercel rollback restores them.
Stages 2 and 5 are dashboard state, invisible to git and unrecoverable by deploy. Stage 17's
migration is **not** undoable by rollback: a Vercel rollback restores code, never schema.

---

## Pacing — where gaps are safe, and the four places they are not

**Most of this runsheet tolerates being picked up and put down.** It is written for that: the handoff
table is the state precisely so a stage can be done weeks after the one before it. What follows is
the short list of exceptions, so a gap is taken deliberately rather than discovered.

### Same sitting, no gap

| Stages | Why |
|---|---|
| **4 + 5** | Stage 4 edits the *expected* allowlist in `verify-redirects.mjs`; stage 5 changes the actual Supabase and Turnstile dashboards. A gap in **either** direction leaves the gate red. ⚠️ And `verify:redirects` is **not** a prebuild gate — it fails only when run by hand, so nothing forces the issue. A red check that no build complains about is a red check you get used to |
| **17, internally** | Prod migration → merge → verify, back to back. Minutes, not days. The migration goes in **immediately before** the merge: early enough that no deployed code calls an empty table, late enough that it has been proven on dev. "Straight after the merge" is explicitly the wrong answer |
| **18, internally** | The banner item and the `updates.json` entry state the same date twice with nothing checking they agree, and the banner expires in 14–21 days. Written apart, they drift, and the expiry makes the drift unfalsifiable |

### Gaps that are the point

- **Stage 3 is a 48-hour gap.** That is the entire stage. It exists to sit on one origin while stage
  2 is still two clicks from reversal.
- **Stage 7 deploys alone**, with nothing else riding on it, so that an adapter swap which should
  change nothing visible can be *proven* to change nothing visible.

### Gaps that cost something without breaking anything

| Gap | What it costs |
|---|---|
| Weeks between **1 and 2** | Stage 1 is point-in-time and the origin is still live and crawlable. Re-run the `site:` search rather than trusting the row |
| ⚠️ Over ~7 days between **9 and 16** | **The dev Supabase project pauses.** It is deliberately *not* kept alive — [keepalive.mjs](../scripts/keepalive.mjs) covers prod only, which is what makes the two-project free tier workable. A paused project answers nothing, and that looks exactly like a broken build. One Resume click fixes it; the cost is recognising it instead of debugging it |
| Long gaps generally | `feat/news-db` diverges from `main`. **Mitigated by merging `main` in** — nine merges as of 2026-08-26, which is what has kept this branch mergeable while `main` gained fonts, an encoding gate, a palette repaint, the exit guard, a What's New page and the whole Pages retirement. ⚠️ **The 2026-08-26 merge is the cautionary one:** two days of not looking meant Part A finished on another branch while this file still called it *"Not started"*. Merging `main` in keeps the CODE mergeable; it does not keep the HANDOFF TABLE true. Re-read the table against the tree after any merge that touches this phase's territory |
| Two months dormant | GitHub disables scheduled workflows after 60 days of repository inactivity. That is `keepalive.yml`, and it protects **prod**. The outer bound rather than a real risk, but it is the one where the safeguard switches off exactly when it is most needed |

### ⚠️ One correction to this runsheet's own instructions

Stage 16 carries the `privacy.html` edit for the notes feature built in stage 14, while citing the
same-commit rule. **The binding constraint is the same *merge*, not the same commit.** Nothing in
Part B reaches production until stage 17, and the whole branch lands at once — the rule exists so a
*deployed* site never has code and privacy page disagreeing. Stages 14 and 16 may be days apart.

The rule returns to its literal form for anything that ships straight to `main`.

### Suggested shape

**Merge Part A to `main` on its own, before starting Part B.** It is self-contained and low-risk, and
otherwise stage 2 unpublishes the origin by dashboard while stages 4 and 6's repo changes sit
unmerged on a branch — leaving `main` carrying a half-retired origin for as long as Part B takes.

Realistically: Part A is one evening (stage 2), a two-day wait, then one sitting (4 + 5 + 6) and a
merge. Part B is where longer breaks belong, subject to the dev-pause row above.

---

# Part A — Retiring the Pages origin

## Stage 0 — Baseline: what is true before you start · Owner: Claude + Human

Confirm rather than assume; everything below was written against this state.

### The repo half — verified 2026-08-22, line numbers re-checked 2026-08-23 and 2026-08-24

Every file that mentions the Pages origin, so stage 4 has a checklist rather than a grep:

⚠️ **The line numbers below drift, and one of them nearly caused real damage.** On 2026-08-23 an
unrelated change — removing the Google Fonts `<link>` block from every page's head — took one line
out of the top of twenty files, and every reference into them silently moved up by one. The row
below reading *"privacy.html:370 · GitHub listed as a processor · **Delete the row**"* pointed at
**Cloudflare's** row by the time anyone would have followed it. Deleting the wrong processor from a
privacy policy is not something any gate here would catch.

**Match on the content in the middle column, never on the line number alone.** The numbers are a
convenience for jumping; the description is the identifier. Re-check them at the start of stage 4
rather than trusting this table — anything that edits a page's `<head>` moves every one of them.

**The second drift check, 2026-08-24, found the same shift had reached the `news.json` consumer
list** — `index.html` and `news.html` had both moved up by one and nobody had noticed, because those
references are used for *reading* rather than for editing and a one-line miss just lands you next to
the right code. Harmless there, dangerous in the privacy table. **The lesson is that these numbers
go stale as a set, not individually**: when one has moved, assume all of them have, and re-run the
greps rather than spot-fixing the one that was reported.

| File | What it says | Stage 4 action |
|---|---|---|
| [.github/workflows/pages.yml](../.github/workflows/pages.yml) | The whole build-and-publish workflow | **Delete** (stage 6) |
| [astro.config.mjs:70](../astro.config.mjs:70) | `base: process.env.ASTRO_BASE \|\| '/'` | Simplify to `/`; drop the `GITHUB_SHA` arm of the stamp |
| [scripts/verify-published.mjs:26](../scripts/verify-published.mjs:26) | Two-origin byte comparison | Drop the `pages` origin |
| [scripts/verify-build-stamp.mjs:25](../scripts/verify-build-stamp.mjs:25) | Asks both origins for `build.json` | Drop the `pages` URL. ⚠️ See the note below |
| [scripts/verify-redirects.mjs:54](../scripts/verify-redirects.mjs:54) | Prod allowlist *expects* the Pages URL | ⚠️ **Move it from `allowed` to `rejected`**, do not delete — must match stage 5 |
| [scripts/verify-schema-columns.mjs:47](../scripts/verify-schema-columns.mjs:47) | Uses `sing-chen.github.io` as a prod host fixture | Repoint to `amplifiedthinker.com` |
| [scripts/verify-signin-return.mjs:40](../scripts/verify-signin-return.mjs:40) | `PAGES_ORIGIN`, a **prebuild gate** | ⚠️ **Leave the assertions.** See below |
| [public/supabase-client.js:52](../public/supabase-client.js:52) | The blocklist comment | ⚠️ **Leave the code.** See below |
| [public/privacy.html:219](../public/privacy.html:219) | "The mirror … runs no analytics at all" | **Delete the paragraph** |
| [public/privacy.html:369](../public/privacy.html:369) | GitHub listed as a processor — ⚠️ **the `<tr>` whose `<th>` reads GitHub**, not whatever sits on that line | **Delete the row** |
| [public/about.html:223](../public/about.html:223) | Comment about hiding the email on github.io | Update the comment |
| [public/nav.js:30](../public/nav.js:30), [public/progress.js:160](../public/progress.js:160) | Comments about subpath depth | Update the comments; **the logic still earns its keep on `file://`** |
| [src/layouts/BaseLayout.astro:27](../src/layouts/BaseLayout.astro:27) | `base` handling and the canonical rule | Simplify the base note; **keep canonical pointing at the apex** |
| [src/pages/sign-in.astro:683](../src/pages/sign-in.astro:683) | Same-origin hardening for a shared host | ⚠️ **Leave it.** See below |
| `CLAUDE.md`, `docs/dev-workflow.md`, `docs/implementation-sequence.md`, `BACKLOG.md`, `docs/recovery.md`, `supabase/README.md` | The two-origin framing throughout | Rewrite as a completed retirement, not deletion |

⚠️ **Three things that mention the Pages origin and must not be simplified with it.**

1. **`supabase-client.js`'s `environment()` is a blocklist, and the comment explaining why is the
   only thing standing between a future edit and every visitor writing to the dev database.** The
   origin going away removes one *example* from that comment; it removes nothing from the argument.
   Rewrite the comment to keep the reasoning and drop the dead example. Do not touch the function.
2. **`sign-in.astro`'s `safeNext()` and the `verify-signin-return.mjs` gate.** The hardening exists
   because a shared host means same-origin is not enough. Vercel preview URLs are still a shared
   host, so the guard is still doing work — and `verify-signin-return.mjs` is wired as `prebuild`,
   so weakening it fails the build on purpose. Keep every assertion; at most, rename the fixture and
   update the comment.
3. **`nav.js`'s depth detection.** It handles `file://` and subfolders, not just Pages. The Pages
   case was one caller.

**⚠️ `verify:stamp` loses half its value and keeps the important half.** It is the only check that
distinguishes "deployed" from "quietly still serving last week's build", and the Vercel half is the
half that cannot otherwise be answered without the dashboard. Do not delete the script when the
second origin goes — reduce it to one.

**Data as it actually stands** — `public/news.json` holds **23 date groups / 73 stories, exactly one
pinned**. Both planning docs say 21 groups / 69 stories, written in Phase 3. The single pinned story
satisfies `news_stories_single_pinned_idx` as-is, so the load will not trip it — but stage 8 must
derive its counts from the file rather than trusting the documented ones.

**`news.json` has five references across three files**, where the plan lists two — the banner and
`middleware.js`. Line numbers re-verified 2026-08-24:

| Reference | What it does |
|---|---|
| [public/index.html:410](../public/index.html:410) | The banner's `fetch('news.json')` |
| [public/index.html:425](../public/index.html:425) | The banner's story link, old `news.html?story=` form |
| [public/news.html:758](../public/news.html:758) | The news page itself |
| [public/news.html:516](../public/news.html:516) | The share URL, old format |
| [middleware.js:56](../middleware.js:56) | The bot-sniffing meta-tag shell |

The two the plan does not mention are `news.html` itself — replaced wholesale by stage 10 — and the
share URL, which is a one-line edit in stage 11 that is easy to miss precisely because nothing breaks
without it.

### The live half — still owed

```bash
npm run verify:stamp
```

```bash
npm run verify:published
```

```bash
npm run verify:redirects
```

Expect both origins reporting the same SHA as `origin/main`, a clean differential, and the prod
allowlist honouring both `https://amplifiedthinker.com/` and
`https://sing-chen.github.io/amplifiedthinker/`. **If the two origins disagree on SHA, stop** — find
out why before retiring one of them, because "Pages is behind" and "Pages is broken" look identical
from the outside and only one of them is safe to walk away from.

**Tick as you go**

- [x] Every Pages reference in the repo enumerated — table above, 2026-08-22
- [x] `news.json` counted: 23 groups, 73 stories, 1 pinned
- [x] The three must-not-simplify items identified and written down
- [x] `npm run verify:stamp` run, both origins agreeing with `origin/main` — 2026-08-22
- [x] `npm run verify:published` run and clean — 2026-08-22
- [x] `npm run verify:redirects` run, both entries present in prod — 2026-08-22
- [x] Any deviation recorded in the handoff table — **none**

**Observed 2026-08-22:**

`verify:stamp` — **both origins current**, expecting `96f9b9d` (`origin/main`):

| Origin | | SHA | Built | Source |
|---|---|---|---|---|
| vercel | ok | `96f9b9d` | 2026-08-21T20:03:37.159Z | vercel |
| pages | ok | `96f9b9d` | 2026-08-21T20:03:46.442Z | github |

Nine seconds apart, both on the commit `feat/news-db` branched from. The "Pages lags Vercel by
~2 minutes" judgement call did not arise here.

`verify:published` — **79 published files across two origins, 158 fetches, 0 not served.** Baseline
written to `baseline-before.json` (gitignored via `baseline-*.json`).

⚠️ **That baseline is stale twice over as of 2026-08-24, and should simply be retaken.** It is a
*two-origin* baseline, so after stage 2 a differential run reports every Pages fetch as missing —
correctly, and confusingly. And the published file set has itself changed since: `main` has gained
`fonts.css` and the self-hosted woff2 files, so the count no longer matches whatever a fresh run
reports. Retake it immediately before stage 4 rather than reasoning about which half of a diff is
the retirement and which half is four days of unrelated work.

`verify:redirects` — **gate green, 12 assertions across both projects, no email sent.**

| Project | Site URL fallback | Allowed | Rejected |
|---|---|---|---|
| **prod** `spehmrgmcdenqdftkyrt` | `https://amplifiedthinker.com/` | `amplifiedthinker.com/`, **`sing-chen.github.io/amplifiedthinker/`** | `localhost:4321/sign-in/`, the `feat-auth` preview alias, `example.com/nope` |
| **dev** `yirsvthwffoetcrgbevj` | `http://localhost:4321/` | `localhost:4321/sign-in/`, the `feat-auth` preview alias | `amplifiedthinker.com/`, `example.com/nope` |

Every origin resolves to the project that owns it, and the CONTROL assertion — an unlisted origin
falling back to the Site URL — passes on both, which is what makes the `rejected` rows meaningful
rather than vacuous.

⚠️ **This output corrects stage 4 and stage 5.** The Pages entry should **move from `allowed` to
`rejected`**, not simply be deleted. The script's own comment says the rejected lists are not
padding — after the Phase 5 split, prod must *actively refuse* origins that belong elsewhere. The
same reasoning applies to a retired origin: `sing-chen.github.io` does not stop existing, it hosts
every project on that GitHub account. Asserting that prod refuses it is strictly stronger than
neglecting to mention it, and it costs one line.

---

## Stage 1 — Is the origin actually indexed? · Owner: Human

This decides stage 5's shape, and it takes two minutes.

Search, in a logged-out browser:

```
site:sing-chen.github.io/amplifiedthinker
```

**What the answer means:**

| Result | What to do |
|---|---|
| **No results** | Delete outright. The handful of colleagues with bookmarks can be told. This is the likely outcome — see below |
| **A few results** | Publish redirect stubs for ~3 months, then delete. Stage 5 grows a step |
| **Everything indexed** | Stop and reconsider the timeline. Something is wrong with the canonical assumption |

**No results is the expected answer, and here is why** — nine of the hand-written pages carry
`rel="canonical"` pointing at `https://amplifiedthinker.com`, and
[BaseLayout.astro:43](../src/layouts/BaseLayout.astro:43) forces the same for every generated page.
Google honours a cross-origin canonical by indexing the target and dropping the duplicate. The
origin was also never shared outside the owner's organisation.

⚠️ **But `robots.txt` on that origin says `Allow: /`**, so crawling was never blocked — only
de-duplicated. Canonical is a strong hint, not a directive. That is exactly why this is a check
rather than an assumption.

**Tick as you go**

- [x] `site:` search run logged-out on **DuckDuckGo and Bing** — 2026-08-22, nothing from the host
- [x] **Google `site:` search run** — 2026-08-22, *"did not match any documents"*
- [x] Stage 5's shape decided from it — **straight deletion, no redirect stubs**
- [x] ~~Anyone with a known bookmark identified and told~~ — ⊘ **not done, and closed on the
      outcome instead.** Nobody was contacted. The origin was never shared outside one organisation
      and its audience had been zero since the NRD block lifted on 2026-08-18, so there was no list
      of people to tell. ⚠️ **Recorded as skipped rather than ticked**: what actually closes this is
      stage 3's "no broken-link reports" after the origin went dark — evidence that nobody needed
      telling, which is not the same as having told them. If a colleague surfaces a dead bookmark
      later, this box is why there was no warning

**Observed 2026-08-22 — two engines say nothing, and the third could not be asked.**

| Engine | Result |
|---|---|
| **Google** | ✅ **"Your search — `site:sing-chen.github.io/amplifiedthinker` — did not match any documents."** Zero. Not a low count; the empty-result page, offering Search Console to whoever owns the host |
| DuckDuckGo | *"No more results found"*. One unrelated `archive.org` page returned as off-topic fallback |
| Bing | *"About 1 results"* — the **same** unrelated `archive.org` page. Bing's known behaviour of returning one irrelevant result rather than zero |

DuckDuckGo is Bing-backed, so those two are **one data point, not two**: the Bing index holds
nothing from that host.

A general web search for the host name returned `amplifiedthinker.com/` and
`amplifiedthinker.com/about.html` and **no `sing-chen.github.io` URL at all**, despite the host being
named in the query. Weak corroboration that the apex is what got indexed and the canonical tags did
their job — but it is inference from a search backend that ignored the `site:` operator, not a
`site:` result.

**Decided: delete outright. No redirect stubs, in stage 5 or anywhere else.** All three engines
agree, and the one that mattered answered with the explicit no-documents page rather than a thin
result set.

**Why this was worth two minutes rather than being assumed.** The prediction was that the
cross-origin canonical tags had caused Google to index the apex and drop the duplicate — and the
result is consistent with that. But `robots.txt` on that origin says `Allow: /`, so crawling was
never blocked; canonical is a hint, not a directive, and Google is free to ignore it. "Probably
deduplicated" and "zero documents" are different claims, and only one of them justifies deleting a
public URL without a redirect.

**What this removes from the retirement:** the stub-publishing step, the three-month soak that went
with it, and the follow-up to delete the stubs afterwards. Stage 5 is unchanged and stage 6 can
delete `pages.yml` as soon as stage 3's soak is done.

⚠️ **This was a point-in-time answer, and the point has now passed.** The origin was still live and
crawlable when the search ran; it 404s from 2026-08-24. The decision stands on the evidence that
existed, and cannot be re-taken on the same terms — a `site:` search now returns nothing because the
pages are gone, not because they were never indexed.

### ⏭️ Deferred: the redirect stubs, if indexing turns out to have mattered

**Carried in from another session, 2026-08-26.** Stage 1 chose deletion over stubs because all three
engines returned nothing. That was the right call on the evidence — but it was a judgement about
*absence*, and absence is the weakest thing a search index can tell you.

**Reopen this if any of these happens:**

- Someone reports a dead `sing-chen.github.io/amplifiedthinker` link they reached from a search result
- A `site:` query on any engine starts returning that host again (a stale index can outlive the pages
  by weeks, so this is not impossible)
- Analytics or logs show referrals arriving from a search engine to the retired origin

**What reopening would mean.** GitHub Pages would have to be re-enabled to serve stubs, which undoes
stage 2 — so this is not a small change and should not be done on a hunch. The cheaper first move is
to establish that the traffic is real: one report is an anecdote, a pattern in referrers is evidence.

⚠️ **The canonical tags are the reason this is unlikely, and also the reason it is not impossible.**
Nine hand-written pages and `BaseLayout` point `rel="canonical"` at the apex, which is a strong hint —
but `robots.txt` on that origin said `Allow: /`, so crawling was never blocked, only de-duplicated,
and Google is free to ignore a canonical. Stage 1 said exactly this before the search was run; it
remains the honest summary of the residual risk.

---

## Stage 2 — Stop publishing to Pages · Owner: Human + Claude

The reversible half. Nothing is deleted here.

⚠️ **There is no "None" in the Source dropdown.** An earlier revision of this stage said to set
**Settings → Pages → Source** to *None*. GitHub has removed that option — the dropdown offers only
**GitHub Actions** and **Deploy from a branch** (confirmed 2026-08-24). The control that actually
unpublishes is the red **Unpublish site** button in the *"Your site is live at…"* box at the top of
the same page.

**Do these two things, in this order:**

1. **Actions → "Deploy to GitHub Pages" → the `⋯` menu → Disable workflow.** Stops it running and
   stops it emailing about failures.
2. **Settings → Pages → Unpublish site.** Takes the published site down. Source stays on *GitHub
   Actions*; the workflow file and every past run stay.

⚠️ **The order is load-bearing, and it is the reverse of what this stage said before.** Unpublishing
while the workflow is still enabled leaves a window in which the next push to `main` simply
re-publishes the site — quietly undoing the stage, with the runsheet ticked. Disabling first closes
that window. Doing only step 1 leaves the last build served indefinitely, which is the opposite of
retirement, so both are still required.

**Verify:** in a logged-out browser, `https://sing-chen.github.io/amplifiedthinker/` should 404
within a few minutes. Then confirm `https://amplifiedthinker.com/` is completely unaffected — the
homepage, a skill page, sign-in, and `/learning/` while signed in.

**Tick as you go**

- [x] Actions → the workflow **disabled** — ⚠️ **first**, so no push can re-publish — 2026-08-24
- [x] Settings → Pages → **Unpublish site** — ⚠️ the red button, not a Source setting — 2026-08-24
- [x] Pages URL returns 404 logged-out
- [x] `amplifiedthinker.com` verified unaffected — homepage, a skill page, `/sign-in/`, `/learning/`
- [x] `npm run verify:stamp` re-run — the Pages arm now fails, and **that is the expected result**

**Observed 2026-08-24 — the Pages origin is down and the apex is untouched.**

Four paths on the retired origin, all `404`, including `build.json` — so it is genuinely unpublished
rather than serving a stale copy:

| `sing-chen.github.io/amplifiedthinker` | |
|---|---|
| `/`, `/index.html`, `/news.html`, `/build.json` | **404** |

Twelve paths on `amplifiedthinker.com`, all `200`, spanning every kind of surface the site has —
hand-written pages, an Astro auth surface, a skill page, the JSON the banner reads, both stylesheets
and the build stamp:

| `amplifiedthinker.com` | |
|---|---|
| `/`, `/future-skills.html`, `/news.html`, `/privacy.html` | 200 |
| `/sign-in/`, `/account/`, `/learning/` | 200 |
| `/skills/analytical-thinking/plan.html` | 200 |
| `/news.json`, `/styles.css`, `/fonts.css`, `/build.json` | 200 |

`npm run verify:stamp` now reads exactly as this stage predicted:

```
expecting c5b1ce4 (origin/main)
  vercel  ok    c5b1ce4  built 2026-08-24T08:06:57.862Z  (vercel)
  pages   FAIL  HTTP 404
1 problem(s)
```

⚠️ **That `1 problem(s)` is the correct result and will stay red until stage 4 reduces the script to
one origin.** It is the only red check in the tree for the next 48 hours. Do not let it become
background noise, and do not fix it early — stage 4 is gated on the soak, not on tidiness.

**Rollback:** re-enable the workflow and run it from **Actions → Deploy to GitHub Pages → Run
workflow** (it carries `workflow_dispatch` for exactly this). A successful run re-publishes the site;
Source never moved off *GitHub Actions*, so there is nothing to set back. Roughly two minutes, and
nothing in the repo changed.

---

## Stage 3 — Soak on one origin · Owner: Human

**Minimum 48 hours.** Nothing to do but leave it alone and use the site normally.

⚠️ **This is the stage where the trade actually lands.** Until now a bad Vercel deploy or a Vercel
outage left a complete working site on the other origin, and `main` has been able to fail to deploy
since Phase 2. From here, Vercel is a single point of failure. That is a deliberate trade recorded
in `BACKLOG.md`, not a side effect — but it is worth feeling it for a couple of days while stage 2
is still two clicks from reversal.

**Clock started 2026-08-24, ~08:10Z** (stage 2 verified complete). **Earliest finish: 2026-08-26.**

**Tick as you go**

- [x] 48h elapsed with no Vercel incident — **2026-08-26 08:11Z**, 48h01m after the clock started
- [x] At least one ordinary deploy to `main` made and verified during the soak — **nine commits**,
      and `verify:stamp` confirms production serving the current tip
- [x] **Nobody reported a broken link to the old origin** — confirmed by the site owner, 2026-08-26.
      ⚠️ Not derivable from the repo; this box closes on a person's word and nothing else
- [x] `npm run verify:published` **baseline retaken** — 85 files, 1 origin, 85 fetches, 0 not served
- [x] ⚠️ **Anything committed during this stage is pushed** — `git push` before 2026-08-26 09:00Z

⚠️ **Why that last box exists.** A scheduled reminder fires on 2026-08-26 at 10:00 BST
([routine `trig_01CpuRAQ77uL4CVXCpLGwex4`](https://claude.ai/code/routines/trig_01CpuRAQ77uL4CVXCpLGwex4))
and reads this file **from `origin/feat/news-db`, not from the working copy** — it is a cloud session
and cannot see this machine. So a box ticked locally and left uncommitted, or committed and left
unpushed, is invisible to it: the run would report stage 3 as untouched and re-ask for work already
done.

It does not break anything — the reminder's instructions are the same either way — but the point of
the handoff table is that it *is* the state, and a state only half of the readers can see is not one.
**Proven rather than assumed:** a test run on 2026-08-24 read this file off the branch correctly, and
caught the prompt claiming three unticked boxes here when there are four.

**Observed 2026-08-26:**

⚠️ **This row was marked ✅ earlier the same morning with every box still unticked, and with two
"observations" that had not been observed** — "no Vercel incident, no report of a broken link" was
inference presented as fact. Corrected here. The handoff rule at the top of this file exists exactly
for that: *a stage is not ✅ until every box under it is ticked or explicitly struck out*, and the
notes column is for what a check **printed**, not for what was assumed.

**48h01m elapsed**, 2026-08-24 08:10Z → 2026-08-26 08:11Z. The margin was one minute at first
check, which is worth recording rather than rounding — a soak that has "about" elapsed has not.

**Nine commits reached `main` during the soak** and production is serving the tip:

```
expecting 2fcfd0e (origin/main)
  vercel  ok  2fcfd0e  built 2026-08-26T08:06:41Z  (vercel)
all origins current
```

⚠️ **`verify:stamp` is green again, and the reason matters.** It was red throughout the soak by
design — `pages FAIL HTTP 404` was stage 2's expected result. Stage 4 reduced the script to one
origin, so the red is gone because the *check changed*, not because anything was repaired. Do not
read this green as the retirement having been verified; the retirement is what removed the assertion.

**Baseline retaken: 85 files, 1 origin, 85 fetches, 0 not served.** A stale `baseline-after.json`
from an earlier session was deleted first, so the next `-- after` run diffs against today rather than
against a two-origin snapshot.

⚠️ **Retaking it exposed a defect in the gate itself.** `verify-published.mjs` printed *"85 published
files, two origins"* and *"170 fetches"* — both hardcoded, left behind when stage 4 removed the Pages
entry from `ORIGINS`. The loop was already correct, so the check did the right work and then
**overstated its own coverage by double**. Now derived from `Object.keys(ORIGINS).length`. A gate that
misreports what it covered is worse than one that fails, because nobody goes looking.

**No broken-link reports** — confirmed by the site owner on 2026-08-26, which closes the stage.

⚠️ **That is the weakest evidence in this runsheet, and it is still the right evidence.** The old
origin's audience was colleagues behind an NRD block that lifted on 2026-08-18, and the URL was never
shared outside one organisation — so "nobody complained" is being asked of an audience already
measured at approximately zero. It confirms nothing surprising happened; it does not prove nobody hit
a dead link and shrugged. Both the deliberate absence of redirect stubs (stage 1) and this box rest
on the same assumption about who was using that origin. If that assumption is ever falsified, both
decisions reopen together — see the deferred-stubs note under stage 1.

---

## Stage 4 — Remove Pages from code, gates and docs · Owner: Claude

One commit, or a small series. Work from the stage 0 table.

⚠️ **`privacy.html` is the part that is not housekeeping.** It names GitHub as a processor and states
that the mirror runs no analytics. Once the mirror does not exist, both statements are **wrong**, not
merely out of date — and this is a page making legal claims under UK GDPR. The
[CLAUDE.md](../CLAUDE.md) rule applies exactly: change it in the same commit. Check the sibling
Promptly site, which makes the same statements about the same person under the same law.

⚠️ **The page got stronger on 2026-08-23 and that changes this edit.** Self-hosting the fonts let it
claim, at [privacy.html:383](../public/privacy.html:383), that *no third party is involved in showing
you the page*. Removing the GitHub processor row is **consistent** with that — GitHub stops
delivering anything to a visitor — so this stage makes the page more true, not less. But note what
it means for the shape of the edit: the processor table is now the last place a third party could be
declared, and there is no third-party section left to append a row to. Delete the GitHub row; do not
soften line 383 to accommodate it.

⚠️ **Match on content, not line number.** 383 is where that sentence sits on 2026-08-24. Two
`<head>` edits have already moved every reference in this file, once dangerously.

**Order within the stage:** code and gates first, then docs, then `privacy.html` last so it is
written against what the code actually ended up doing.

**Docs get a retirement, not a deletion.** The two-origin constraint was *load-bearing and correct*
until 2026-08-18, and it shaped five phases. Rewrite the passages to say it applied and why it
stopped applying, rather than deleting them as though the project had always had one origin.

**Verify:**

```bash
npm run build
```

All three prebuild gates must still pass — `verify:catalogue`, `verify:signin-return` and
`verify:encoding`. If
`verify:signin-return` fails, an assertion was removed that should not have been.

**Tick as you go**

**Verified box by box on 2026-08-26 against the tree, not against the commit messages.**

- [x] ~~`astro.config.mjs` — `base` simplified, `GITHUB_SHA` arm dropped~~ — ⊘ **deliberately NOT
      done.** `ASTRO_BASE` stays: `BaseLayout` and `sign-in.astro` route every generated URL through
      it, and unpicking that is a change to live pages with nothing to gain. `CLAUDE.md` records this
      as a survivor of the retirement. The `GITHUB_SHA` arm of the stamp is inert and harmless
- [x] `verify-published.mjs`, `verify-build-stamp.mjs`, `verify-schema-columns.mjs` reduced to one
      origin — **0 references remaining in each**
- [x] ⚠️ `verify-redirects.mjs` — Pages entry **moved from `allowed` to `rejected`**, not deleted —
      dropped on 2026-08-26 and **restored the same day with stage 5**, once the dashboard change
      made the `rejected` assertion pass. Gate green at 13 assertions. The two-day gap in which
      nothing tested that host is recorded in the reconciliation note under the handoff table
- [x] `verify-signin-return.mjs` — **assertions kept**: 2 references retained on purpose, gate runs
      **26 passed, 0 failed**
- [x] `supabase-client.js` — **`environment()` byte-identical**, comment rewritten to keep the
      blocklist reasoning and note where the Turnstile hostname actually lives
- [x] `nav.js`, `progress.js`, `BaseLayout.astro` — comments updated 2026-08-26, **logic untouched**.
      ⚠️ These were missed by the original stage-4 pass: all three still described Pages as live
- [x] `about.html` comment updated
- [x] ⚠️ `privacy.html` — GitHub processor row **and** the mirror-analytics paragraph both removed,
      replaced with a dated note that the address was retired
- [x] **Promptly sibling checked for the same statements** — checked by the site owner 2026-08-26,
      **no changes needed**. It never named the retired origin, so the retirement did not make any
      of its claims untrue. ⚠️ Not verifiable from this repo — this box closes on a person's word
- [x] `CLAUDE.md`, `dev-workflow.md`, `implementation-sequence.md`, `BACKLOG.md`, `recovery.md`,
      `supabase/README.md` rewritten as a retirement — all six frame it historically rather than
      deleting the passages
- [x] `npm run build` passes, all three prebuild gates green
- [x] `.claude/settings.local.json` — ⊘ **left alone deliberately.** It is **gitignored and
      machine-local**, so it is not part of what this stage ships; the ten stale entries only mean a
      permission prompt that will never fire again. Cleaning it is housekeeping on one laptop, not a
      repo change

**Rollback:** `git revert`. This stage is entirely in the repo.

---

## Stage 5 — Dashboard cleanup: Supabase and Turnstile · Owner: Human

Two dashboards, neither visible to git, both currently trusting a host that no longer serves the
site. **This is the whole of what remains in Part A.**

📖 **[supabase/README.md](../supabase/README.md) §*Cleanup owed* is the authority on these two
entries** — it holds the exact dashboard paths, what each one means while it stands, and how to
verify the change. Read it rather than working from the summary here; one owner for one answer, and
that file is where a future reader of the Supabase config will look.

**Do the Turnstile one FIRST.** Not because it is quicker, but because it is the one with a
security dimension, and the reason is sharper than "that origin is retired":

⚠️ **A Turnstile hostname grant covers the hostname *and its subdomains*, and
`sing-chen.github.io` is a user-owned GitHub Pages domain.** Anything that account publishes there
in future sits inside the grant and can mint captcha tokens the production signup endpoint will
accept. That is fine while the account is the site owner's own — and stops being fine the moment it
is not. The Supabase entry, by contrast, points at a destination that is merely *dead*: a redirect
to a host serving nothing, which is untidy rather than dangerous.

Order follows blast radius, not effort.

**Verify:**

```bash
npm run verify:redirects
```

⚠️ **This passes either way now, so it proves nothing on its own.** Stage 4 *dropped* the Pages
entry from the script's expectations rather than moving it to `rejected` — see the reconciliation
note under the handoff table. So `verify:redirects` is green today with the dashboard entry still
in place, and will be green afterwards too.

**Restoring that assertion is part of this stage, not a follow-up.** Add
`https://sing-chen.github.io/amplifiedthinker/` to the prod `rejected` list in
`scripts/verify-redirects.mjs` in the same sitting, and re-run. It must now fall back to the Site
URL. That is what turns a temporary drop into a permanent, checked fact — and until it is done,
nothing anywhere tests that host in either direction.

⚠️ **Turnstile has no automated check at all.** No script in this repo can read a widget's hostname
list, so the only verification is **signing in on production** after the change. A wrong domain
list surfaces as a *captcha* failure, which [supabase/README.md](../supabase/README.md) records as
having been misdiagnosed once already — expect that shape rather than an obvious error.

**Tick as you go**

- [x] ⚠️ **Turnstile `amplifiedthinker-prod` — `sing-chen.github.io` removed from Hostnames — FIRST**
      — done 2026-08-26
- [x] Supabase prod redirect allowlist — Pages entry removed, others untouched — done 2026-08-26.
      ⚠️ **Prod turned out to hold only ONE entry**, not four; see the note below
- [x] ⚠️ `verify-redirects.mjs` — Pages URL **added to prod `rejected`**, restoring the assertion
      stage 4 dropped. Permanent, not a one-off
- [x] `npm run verify:redirects` run — **13 assertions, gate green**, including
      `PASS rejected: https://sing-chen.github.io/amplifiedthinker/`
- [x] **A real sign-in tested end to end on `amplifiedthinker.com`** — confirmed working by the site
      owner, 2026-08-26, after the hostname removal. ⚠️ The only check the Turnstile half has, and
      not scriptable: this box closes on a person having actually signed in
- [x] `supabase/README.md` §*Cleanup owed* updated to say both are done, with the date — and two
      other stale claims in the same file corrected, plus the comment in `supabase-client.js`

**Observed 2026-08-26:**

**Probed prod directly before touching the script**, using the token-free probe in
`supabase/README.md`. All five test origins fell back to the Site URL, confirming the dashboard
change had taken effect:

| Probed | Result |
|---|---|
| `sing-chen.github.io/amplifiedthinker/` | **rejected** — the change worked |
| `localhost:4321/sign-in/` · the preview alias | rejected — both belong to **dev** |
| `example.com/nope` | rejected — the control |

⚠️ **The gate found a documentation error that had stood since Phase 5.**
`supabase/README.md` listed **four** Redirect URLs for prod and said *"three of them still
current"* — but prod holds exactly one. The preview alias and `localhost` moved to **dev** when the
projects split, and prod must *actively refuse* them; `verify-redirects.mjs` has asserted that all
along. **The doc contradicted the gate for weeks and nothing caught it, because a doc cannot fail a
build.** Corrected, and split into per-project blocks so the two cannot be conflated again.

⚠️ **One probe cannot prove what it looks like it proves.** `https://amplifiedthinker.com/` is
*also* the Site URL, so an allowed result and a fallback are the same string. The `allowed`
assertion for the primary origin is unfalsifiable by this method — which is exactly why the
known-bad control matters, and why it is run in the same batch every time.

**Rollback:** re-add both entries. Immediate, but note the sign-in test — a wrong Turnstile domain
list surfaces as a captcha failure, which [supabase/README.md](../supabase/README.md) records as
having been misdiagnosed once already.

---

## Stage 6 — Delete `pages.yml` · Owner: Claude

Last, and only after the soak.

Delete [.github/workflows/pages.yml](../.github/workflows/pages.yml). **`keepalive.yml` stays** —
it exists because the free Supabase tier pauses an idle project, it outlives this origin entirely,
and the two workflows have been conflated before.

While here, the `actions/deploy-pages@v4` Node 20 deprecation logged in `BACKLOG.md` dies with this
file — close that half of the item and leave the `keepalive.yml` half open.

**Tick as you go**

**Verified box by box on 2026-08-26, after this row had been marked ✅ with all four untouched.**

- [x] `pages.yml` deleted — `.github/workflows/` now contains **only** `keepalive.yml`
- [x] `keepalive.yml` confirmed present and still scheduled — `cron: '14 6 * * *'` plus
      `workflow_dispatch`, and the GitHub API reports the workflow **`state=active`**
- [x] `BACKLOG.md` deprecation item — Pages half closed, keepalive half left open. ⚠️ **This was
      genuinely outstanding**: the entry still said *"both workflows"* and still listed
      `deploy-pages@v4` days after that workflow was deleted. Halved on 2026-08-26
- [x] `BACKLOG.md` retirement entry moved from "decided, not scheduled" to done, with the date —
      now reads **✅ DONE 2026-08-26**, with the original reasoning kept as the record of *why*

### `pages-build-deployment` shows as `state=active` — **do nothing**

The GitHub API lists a `pages-build-deployment` workflow as `state=active`. **No action is needed,
now or later.** Checked 2026-08-26:

| Check | Result |
|---|---|
| `GET /repos/sing-chen/amplifiedthinker/pages` | **404** — Pages is *disabled*, not merely unpublished |
| Runs of that workflow | **none** |
| `sing-chen.github.io/amplifiedthinker/` | **404** |

It is GitHub's own built-in Pages workflow, created automatically when Pages was enabled. It is not
in `.github/workflows/`, never was, and cannot be deleted from this repository. `state=active` means
only *"not manually disabled"* — it is a dormant registry entry, and with Pages off at the repo level
it has nothing to trigger it.

⚠️ **Do not try to disable it in the Actions tab either.** It is GitHub-managed; turning it off
achieves nothing that disabling Pages has not already achieved, and it may reappear on its own.

⚠️ **The one case where it stops being dormant:** re-enabling Pages. That is exactly what publishing
the deferred redirect stubs would require — see the deferred-stubs note under stage 1. If that ever
happens, this workflow becomes live again, which is a feature rather than a surprise.

**Rollback:** `git revert`, then redo stage 2 in reverse. Cheap in git, but the Pages source has to
be re-enabled by hand.

---

# Part B — News into the DB

## Stage 7 — The adapter decision · Owner: Claude + Human

⚠️ **This is a correction to the plan, found while writing this runsheet.**
[astro.config.mjs:59](../astro.config.mjs:59) says an SSR adapter "arrives with the blog in Phase 8,
where rendering on request is the point". That reasoning was written when Phase 6 was a sketch. It
does not survive contact with Phase 6's actual activity list: `/news/:slug` server-rendered, a 301
redirect endpoint, and `/api/search-index.json` are **three server surfaces**, and the phase's
stated purpose for the first is "real HTML for crawlers". The adapter is a Phase 6 dependency.

⚠️ **CORRECTED 2026-08-26: `hybrid` does not exist any more, and the change is smaller than this
stage originally said.** Astro 7.2.2's config schema rejects it outright —
*"The `output: \"hybrid\"` option has been removed. Use `output: \"static\"` (the default) instead,
which now behaves the same way."* Checked in `node_modules/astro/dist/core/config/schemas/base.js`,
not assumed from docs.

So `output` **does not change at all**. The only real choice is which way round the default runs:

| Mode | Default | Opt out per route |
|---|---|---|
| **`static`** *(current, and what `hybrid` became)* | prerendered | `export const prerender = false` |
| `server` | on demand | `export const prerender = true` |

**Decision: stay on `output: 'static'` and add the adapter.** This site is overwhelmingly static —
19 hand-written pages copied byte-for-byte, plus three auth surfaces — so the default should stay
prerendered and each server route should be a deliberate opt-out. Switching to `server` would invert
that and require marking every existing page, which is more edits for the same result.

**What this stage actually does, then:** add `@astrojs/vercel`, leave `output` alone, and correct the
comment that says an adapter arrives in Phase 8.

**The other thing to settle here:**
2. **Whether this is the moment `service_role` gets a home.** [CLAUDE.md](../CLAUDE.md) says it has
   no home at all until a server endpoint exists in Phase 6 — and after this stage, one does. Nothing
   in Phase 6 *needs* it: news reads are public and the personalisation writes are the user's own
   rows under RLS. Say so explicitly here, so a later stage does not reach for it out of convenience.

**Verify:** deploy the adapter change on its own, with no new routes, and confirm the 19 static pages
plus `/sign-in/`, `/account/` and `/learning/` are byte-identical and behave identically. An adapter
swap that changes nothing visible is exactly what this should be.

**Tick as you go**

- [x] ~~`server` vs `hybrid` decided~~ — ⊘ **`hybrid` was removed from Astro.** Verified against
      the installed schema, not the docs. Staying on `output: 'static'`, which is what `hybrid`
      became; reason recorded above
- [x] `@astrojs/vercel` **11.0.8** added, `astro.config.mjs` updated — `output` left on `'static'`
- [x] ⚠️ **`vercel.json`'s `outputDirectory: dist` REMOVED** — see the note below; this was the one
      real risk in the stage
- [x] `service_role` question answered in writing — **still no home in this phase**, see below
- [x] Built and verified: **all 20 hand-written pages and the three auth surfaces present**, and the
      build output is **byte-identical with and without the adapter** bar one timestamp
- [x] `npm run verify:published` clean across the adapter change — deployed as `2c9685c`,
      **85 files, 0 not served, 3 changed** and the three are the comment-only files. See below
- [x] `astro.config.mjs`'s Phase 8 comment corrected — it was wrong as written

**Observed 2026-08-26:**

**The adapter changes nothing, proven rather than asserted.** Built the tree with and without it and
hashed every file: **88 of 89 identical.** The 89th is `build.json`, whose `builtAt` moves between
any two builds — `sha`, `short`, `source` and `base` were the same. `.vercel/output/server` is
**empty**, because no route declares `prerender = false` yet, so the Build Output is currently pure
static.

⚠️ **`vercel.json` had `outputDirectory: dist`, and that had to go with this change.** The adapter
emits `.vercel/output/` — the Build Output API, with its own `config.json` and a `server/` directory
— while `outputDirectory` names a plain static folder. Both would work *today*, because there are no
functions yet. **The failure would have surfaced at stage 10** as a server route quietly serving
prerendered content: healthy-looking, and the exact failure this adapter exists to prevent. Removed
now, while the change is isolated and one variable, rather than at stage 10 as one of several.

⚠️ **`prerender = false` is now load-bearing on every DB-backed route.** Under `output: 'static'` a
route without it is built once at deploy time and then serves a frozen snapshot for ever. Written
into `astro.config.mjs` beside the setting, because that is where someone will be when it matters.

**Also corrected while here:** the site has **20** hand-written pages, not 19 — `whats-new.html`
joined on 2026-08-26. `CLAUDE.md` said 19 in two places, including the `fonts.css` note that names
the count explicitly; verified by counting the pages that link it.

**Deployed 2026-08-26 as `2c9685c`, live in ~45s. The differential is the proof this stage wanted:**

```
85 published files, 1 origin
85 fetches, 0 not served
changed: 3
  ~ vercel /nav.js
  ~ vercel /progress.js
  ~ vercel /supabase-client.js
no longer served: 0
```

**Three changed, and all three are the comment-only edits** made during stages 4 and 5 — verified
comment-only by filtering the diff *and* by `node --check` on each, before the merge. **Nothing else
moved, and nothing stopped being served.** An SSR adapter was added to the build and not one byte of
served output changed, which is exactly the claim.

**Functional spot checks, because byte-identical is not the same as working:** the homepage, both
news pages, all three auth surfaces, a skill page, `exit-guard.js`, `news.json` and `build.json` all
**200**; a nonexistent path still **404s** — that last one matters, because the adapter owns routing
now and a broken catch-all would show up here rather than in a hash. `/sign-in/` returns real markup
rather than an empty shell.

### `service_role` — the answer is still no

[CLAUDE.md](../CLAUDE.md) says it has no home until a server endpoint exists in Phase 6. One now can,
so the question is live rather than theoretical. **It still gets no home in this phase:**

- **News reads are public.** `news_stories` has a public-read policy for published rows; a server
  route reading them needs no more privilege than a browser.
- **The personalisation writes in stage 14 are the user's own rows**, governed by
  `user_id = auth.uid()` on `user_news` and `notes`. Using `service_role` there would bypass the
  policy that makes them safe — the opposite of what is wanted.

⚠️ **The reason to write this down is that stage 10–14 will each have a moment where it looks
convenient.** It is not needed, and reaching for it undoes every policy in the migration in one line.
The first genuine candidate is the contact form in `BACKLOG.md`, which is not this phase.

**Rollback:** `git revert`. Do this stage on its own commit precisely so that is true.

---

## Stage 8 — The migration script: slugs and `legacy_id` · Owner: Claude

A script in `scripts/`, not a hand-written SQL file — it has to be re-runnable against dev before it
is trusted against prod.

**What it does, per story:**

| Column | Value |
|---|---|
| `legacy_id` | `<date>-<index>` — the story's **current positional slot**, exactly as `middleware.js` parses it today |
| `slug` | `<date>-<slugified title>`, uniqueness-checked, **immutable from here on** |
| `story_date`, `sort_order` | The date group, and the position within it |
| `title`, `source`, `url`, `summary`, `implications`, `tags` | Straight across |
| `pinned` | The one editorial pin. At most one site-wide, enforced structurally |
| `status` | `published` for everything migrated |

⚠️ **`legacy_id` is the whole point of this stage and it is computed from a positional index that
stops being meaningful the moment the data lands.** Compute it from the JSON's array order, before
anything is sorted, filtered, or deduplicated. Get it wrong and every previously shared link resolves
to the wrong story — silently, with no error anywhere, which is precisely the failure the slug design
exists to prevent.

**Derive the counts from the file, and this is why.** They were 21/69 in the plan, 23/73 on
2026-08-22 and **27 groups / 81 stories / 1 pinned** when the script actually ran on 2026-08-26 —
news landed that morning. Any number written into this runsheet is a snapshot; the script reports
what it found on the day and fails loudly on a slug collision.

⚠️ **A correction to an earlier revision of this stage**, which warned that the file had been
rewritten on 2026-08-23 to repair 39 mojibaked characters. **That was `search-index.json`, not
`news.json`** — the repair landed in `0c3bb28` and touched only the search index. `news.json`'s last
change is `4d600c4`, "add news for 2026-08-19". The two files were conflated because they are edited
together by `/add-news` and both are deleted by this phase.

**It still bears on this stage, just differently.** The mojibake reached `main` through a
`ConvertTo-Json` rewrite that bypassed `/add-news`'s UTF-8-safe python, and it survived because the
JSON was valid, the entry count was right and every check was green — the whole symptom was a search
result reading `Brené Brown`. This migration reads the same kind of prose out of `news.json` and
writes it to a database, where `npm run verify:encoding` cannot follow it. **Spot-check the accented
characters in the loaded rows**, not just the counts.

**Tick as you go**

- [x] Script written, re-runnable, idempotent on `slug` — `scripts/build-news-seed.mjs`,
      `npm run build:news-seed`
- [x] `legacy_id` computed from original array order, **verified against `middleware.js`'s parse** —
      all **81 ids round-tripped through its own `findStory()`, 0 mismatches**
- [x] Slug collisions fail loudly rather than being auto-suffixed silently — and legacy-id
      collisions, and a second pinned story, all abort before anything is written
- [x] Counts reported by the script, not hardcoded — **27 groups / 81 stories / 1 pinned**
- [x] Dry-run output eyeballed against `news.json` for three spot-checked stories

**Observed 2026-08-26:**

⚠️ **The script emits SQL rather than inserting rows, and that is forced.** `news_stories` is
admin-write (`news_stories_admin_all` requires `is_admin()`), `is_admin` is settable only where
`auth.uid()` is null, and stage 7 ruled `service_role` out of this phase. That leaves the dashboard
SQL editor, which runs as the table owner — the same route the schema and the `is_admin` bootstrap
already took. The stage asked for "a script, not a hand-written SQL file"; this satisfies it, because
the SQL is **generated and re-generable** and nobody hand-writes 81 rows.

⚠️ **`supabase/seed/news_seed.sql` is committed even though it is generated**, which breaks the usual
rule for derived files. The reason is stage 16: **`news.json` is deleted there**, and once it is gone
this seed can never be regenerated. Committing it keeps the migration reproducible after its own
input disappears — and it is what stage 17 applies to prod, so prod and dev get byte-identical SQL.

**Two defects in the script's own output, both caught by reading it rather than by it failing:**

1. **Slug truncation reordered meaning.** A `reduce` capping length at 60 characters *skipped* a word
   that did not fit and then appended a later, shorter one — turning *"Without Preparing Those Who
   Remain"* into `...management-without-those`. Truncation is fine; a slug that reads as though a
   word were never there is not, and **these are immutable once shipped**. Now stops at the first
   word that does not fit.
2. **The non-ASCII preview printed a column of bare em dashes** — correct, and useless to compare
   anything against. Now prints surrounding context, and sorts accented letters ahead of punctuation
   because a mangled `é` reads as a typo while a mangled `—` reads as obvious damage.

**Encoding, as it actually stands:** 46 of 81 rows contain non-ASCII text and **none of it is
accented letters** — it is all em dashes and smart quotes. That is not a relief: `â€"` from an em
dash is exactly what mojibaked `search-index.json`. The seed carries the raw characters and the
generated SQL ends with the query to eyeball them after loading.

---

## Stage 9 — Load dev and verify the data · Owner: Claude

Dev project only (`yirsvthwffoetcrgbevj`). Prod waits for stage 17.

**Verify, by query rather than by eye:**

- Row count matches the script's report
- Every `legacy_id` is unique and every `slug` is unique
- Exactly one `pinned = true`, and it is the same story as in `news.json`
- `select` as `anon` returns the published rows — ⚠️ **and note that this is the moment
  `npm run verify:rls`'s content-table assertion changes meaning.** Until now those tables passed by
  returning `[]` *because they were empty*. From here `news_stories` legitimately serves rows. Update
  the expectation in the same stage or the gate quietly stops asserting anything.

**Tick as you go**

- [x] Loaded into dev, counts match — **81 rows**, `Content-Range: 0-0/81` as anon
- [x] `legacy_id` and `slug` uniqueness confirmed by query — **81 distinct of each**
- [x] Exactly one pinned, and it is the right story — `2026-08-25-0`, matched against `news.json`
- [x] `anon` read returns published rows and nothing in `draft` or `archived` — statuses returned:
      `["published"]`
- [x] ⚠️ `verify-rls.mjs` expectation for `news_stories` updated from "empty" to **`published`** —
      gate **22/22**, reporting `81 row(s), status ["published"]`

**Observed 2026-08-26:**

**Verified from outside the dashboard, with the anon key**, so the checks are independent of the
session that ran the load: 81 rows, 81 distinct slugs, 81 distinct `legacy_id`s, one pinned and it is
the same story `news.json` pins.

⚠️ **The encoding check was done properly rather than by eye.** The stage asked for five titles to be
eyeballed; instead **all 81 stories were compared field by field against `news.json`** — title,
summary, implications, source, url and tags — with a mojibake pattern applied to the database text.
**0 differences.** The em dashes read as `—` in the database, not `â€"`. Eyeballing five rows would
have covered 6% of the data for the one failure mode that no gate can see once the text is in
Postgres.

**The `verify:rls` change, and why it is not just a relabel.** `'empty'` asserted that a table was
unpopulated, which was never a security property — it happened to hold. `'published'` asserts the RLS
predicate itself: every row anon can see carries `status = 'published'`. ⚠️ **It passes whether the
table is empty or full, deliberately** — prod is not loaded until stage 17, and an expectation that
cannot hold there until then is the mistake `verify-redirects` made when it dropped an assertion
rather than moving sides. An empty table satisfies "everything returned is published" truthfully.

⚠️ **`readTable()` now takes a projection**, because asserting on rows needs `status` back.
Everything else still requests `select=*`, which is what makes a denied table's refusal meaningful —
it is refused on the widest request, not a narrow one.

**Rollback:** `delete from news_stories` on dev. Free, and this is why prod is not touched yet.

---

## Stage 10 — `/news` and `/news/:slug`, server-rendered · Owner: Claude

Real HTML in the response body. **No user-agent sniffing** — serving different content to Googlebot
than to people is cloaking, and the entire point of rendering on the server is that no such trick is
needed.

Match the existing `news.html` presentation closely enough that the change reads as a URL change
rather than a redesign.

⚠️ **This stage silently breaks `/add-news`, and nothing will tell you.** From here the news page
renders from the DB, so the command still succeeds, still writes `public/news.json`, and publishes
nothing. No gate reads that file. **Treat this stage as the cutoff for using it** — the full
breakage map is under stage 16.

**How it is built**

| File | |
|---|---|
| `src/lib/news-render.mjs` | The markup, **written once and run in two places** — see below |
| `src/lib/news-data.mjs` | The PostgREST read. Server only |
| `src/components/NewsView.astro` | The reader, shared by both routes |
| `src/components/NewsUnavailable.astro`, `NewsNotFound.astro` | The 503 and the 404 |
| `src/pages/news/index.astro`, `src/pages/news/[slug].astro` | Both `prerender = false` |
| `src/scripts/news-app.js` | Filter, search, keyboard, in-place swapping |
| `public/news-app.css` | Scoped to these two routes, like `auth-pages.css` |
| `src/pages/sitemap.xml.js` | Replaces the static file |

⚠️ **The server and the browser render the list from the SAME functions.** A server render and a
client render of one list are two implementations of one thing, and they drift silently — the page
looks right until the moment JS takes over and something shifts. `news-render.mjs` is pure string
building with no DOM and no fetch, so it runs unchanged in a serverless function and in a browser,
and a change to a headline row cannot land on one side only.

⚠️ **The stories are serialised into the page, not fetched again from the browser.** The server has
already read those rows; a second read would be a second answer that could disagree with the HTML
wrapped around it, plus a spinner for nothing.

⚠️ **Every headline is a real `<a>`, and stays one.** The script intercepts a plain left click and
nothing else, so middle-click, ctrl-click and open-in-new-tab keep working — on a page whose whole
purpose this stage is that its links are real. It is also what makes the archive crawlable.

⚠️ **The Supabase project table is PARSED out of `public/supabase-client.js` at build time**, by
`astro.config.mjs`, and injected via `vite.define`. Retyping the two url/key pairs into a server
module would put a second copy in the repo and the stale copy is always the one nobody looks at —
`keepalive.mjs` and `verify-redirects.mjs` already treat that file as the source of truth the same
way. It is read at BUILD time because `public/` is not in a Vercel serverless bundle: a
`readFileSync` in the route would work perfectly in dev and find nothing in production. The parse
refuses a `service_role`-shaped key rather than inlining it. The prod/dev choice is still made per
request, from the request's own hostname, by the same blocklist rule the browser uses.

**Verify:**

```bash
curl -s https://<preview>/news/2026-08-19-<slug> | grep -c "<the story's summary text>"
```

⚠️ **Vercel previews are auth-walled and the wall masks 404s** — a nonexistent path returns the same
`302` as a real one. Preview content cannot be verified by script. Capture a production baseline
before merging, and do the real `curl` verification against production at stage 17.

**Tick as you go**

- [x] `/news` index renders, most-recent first, grouped by date
- [x] `/news/:slug` renders one story with body text in the HTML source
- [x] `<link rel="canonical">` correct on both
- [x] The pinned story surfaces the way it does today
- [x] `sitemap.xml` includes the new URLs
- [x] Nav and footer correct — ⚠️ `<footer class="site-footer">`, or it renders unstyled and nothing fails
- [x] Checked by eye in both themes, desktop and mobile — **confirmed by the site owner, 2026-08-26**

**Observed, 2026-08-26 — against `astro dev` on localhost, reading the DEV project**

Measured rather than asserted from the source, everything below by fetching the route or reading
computed style off the rendered page:

| | |
|---|---|
| `/news/` | `200`, **81 headline `<a href="/news/…">` in the response body** — the whole archive is one crawl from the index, collapsed groups included, because a collapsed group is `display:none` and not absent |
| `/news/<slug>` | `200`, title / summary / *Why it matters* all in the HTML source. `og:type` `article`, canonical self-referential, `<title>` the story's own |
| unknown slug | **`404` + `noindex`**, not a `200` with an empty panel |
| feed unreadable | **`503`** and a page that says so — see the note below |
| `sitemap.xml` | **100 URLs = 19 static + 81 stories**, `/news.html` no longer among them |
| build output | `.vercel/output/functions/_render.func` with routes for `^/news/?$`, `^/news/([^/]+?)/?$` and `^/sitemap\.xml$`. **No static `/news/` directory** — so it is genuinely rendering, not a snapshot |
| behaviour | filter 81 → 32 → 20 with search stacked on top, empty-state copy, headline click / Previous / Next / back-button all moving the URL, `<title>` and canonical together |
| dark mode | every surface measured, one defect found — below |
| mobile 375px | `/news/` opens on the LIST and `/news/<slug>` on the STORY; back returns to the list without leaving the story; no horizontal scroll |
| gates | `npm run build` green (all three `prebuild` gates), `verify:rls` **22/22** |

⚠️ **A read failure is a 503 with a page that says so, not an empty feed.** "There are no stories"
and "the database did not answer" look identical once they reach HTML, and serving the second as
the first tells a crawler the feed is genuinely empty while telling the reader nothing is wrong.
The cause is logged server-side; a 503 nobody can diagnose is barely better than a lie.

⚠️ **Two defects found by measuring the rendered page, neither visible in the source.**

1. **The page arrived already scrolled past its own hero.** `scrollIntoView({block:'nearest'})`
   scrolls *every* scrollable ancestor, the document included — so bringing the active headline
   into view inside its panel jumped the whole page, on load, before the reader touched anything.
   Replaced with a helper that moves only the panel's own `scrollTop`, and
   `focus({preventScroll:true})` alongside it for the same reason. ⚠️ **The old code was copied
   verbatim from `news.html`, where it does the same thing** — masked there only because the panel
   happens to start at the top of a shorter page.
2. **The story panel kept a near-white border in dark mode.** `--light-sage` does not flip, and
   `.story-panel` was the one surface in the dark block with no override — so it wore a `#D8E4DD`
   outline while `.headline-col` beside it wore a faint one. Valid CSS, correct token name, wrong
   result, and **only a computed-style read finds it**. ⚠️ **`news.html` has the same bug and it is
   live today** — fixed in both files in the same commit.

⚠️ **The last box was closed by a human, not by a check.** Screenshots were unavailable this session
(the Browser pane was not compositing), so every claim in the table above is a *measurement* —
computed colours, computed `display`, element counts, scroll offsets. That is what caught both
defects, and it is still not the same as looking at the page. **The site owner checked it by eye
and confirmed it on 2026-08-26**, which is the only thing that could close that box: both of
Phase 1's defects were found by a human in a browser and neither was catchable by the passing test.

**What this stage changed beyond the two routes**

- ⚠️ **`public/sitemap.xml` was deleted and `sitemap.xml` is now generated per request.** A static
  file cannot list 81 story URLs and stay right: every story added after it was written is a URL
  missing from it, and an incomplete sitemap fails nothing and looks exactly like a correct one —
  the same shape as the catalogue trap, with the same answer. It serves the static half even if the
  story read fails, because a 500 tells a crawler the whole file is broken.
- **`/news.html` dropped from the sitemap in favour of `/news/`.** It becomes a 301 at stage 11 and
  pointing a crawler at a redirect whose destination is known is pure indirection. The page itself
  is untouched and still serves.
- **A skip link was added to `BaseLayout`**, which never had one — so `/sign-in/`, `/account/` and
  `/learning/` made a keyboard user tab the whole nav on every page. The hand-written pages have
  carried one since launch; `.skip-link` was already in `styles.css`.
- **`og:type` is now a `BaseLayout` prop**, so a story can be `article` rather than `website`.

**Baseline captured before merging:** `verify:published` — **85 files / 1 origin / 0 not served**.
⚠️ Two changes are expected in the after-diff and are not regressions: `/news.html` (the dark-border
fix) and `/sitemap.xml` (now generated, and no longer in `git ls-tree public/` at all).

---

## Stage 11 — The 301 endpoint · Owner: Claude

`news.html?story=<date>-<index>` → `301` → `/news/<slug>`, resolved through `legacy_id`.

**This is the stage the phase's done-when actually tests**, and the test has two halves:

```bash
curl -sI "https://amplifiedthinker.com/news.html?story=2026-08-14-0"
```

Expect a `301` to the right story. **Then reorder that day's stories and run it again** — it must
land on the *same* story.

⚠️ **The plan says to reorder "via the admin UI". That UI is Phase 7.** For this phase, reorder with
a direct `update news_stories set sort_order = …` on dev. The test is unchanged in substance; only
the mechanism differs. Do not skip it because the stated tool does not exist yet — this check is the
entire reason slugs replaced positional indexes, and it is the one thing in Phase 6 that cannot be
verified after the fact.

**Keep `news.html` as a path.** The endpoint has to answer that URL regardless, so leaving it alive
as a redirecting surface costs nothing and is the lower-risk reading of "old links keep working
forever".

**Tick as you go**

- [x] Endpoint resolves `legacy_id` → `slug` and issues a **301**, not a 302
- [x] Spot-checked against three real shared URLs from different dates
- [x] ⚠️ Reorder test: `sort_order` changed on dev, redirect re-run, **same story** — **passed 2026-08-26, evidence below**
- [x] An unknown `story=` id gives a sensible 404 or falls back to `/news`, deliberately chosen
- [x] ~~`news.html:516`'s share URL~~ — **N/A: the file is gone.** The share bar it sat in had been commented out since before this phase, so nothing was emitting the old format. ⏭️ `/news/<slug>` ships with **no share controls at all** — not a regression, but a real gap, and it belongs to whoever re-enables sharing

**Observed, 2026-08-26**

⚠️ **`public/news.html` was DELETED and `/news.html` is now a route, because there was no
arrangement in which both could exist.** Vercel runs `handle: filesystem` **before** any route, so a
static `news.html` wins every time and an endpoint at that path would never execute. The runsheet
already calls for keeping the path alive "as a redirecting surface" — this is that, and it is not a
choice between the two.

```
2026-08-14-0   301 -> /news/2026-08-14-ai-employment-gap-for-young-workers-widens-to-19
2026-08-25-0   301 -> /news/2026-08-25-the-great-flattening-is-shrinking-management-without
2026-07-02-0   301 -> /news/2026-07-02-canaries-in-the-coal-mine-six-facts-about-the-recent
/news.html     301 -> /news/
unknown id     404
```

All three land on the story `news.json` holds at that date and index, checked against the file.

⚠️ **`middleware.js` was deleted here rather than at stage 15, because by stage 11 it is not
merely redundant — it is in the way.** Its matcher is `/news.html` and it runs *before* the route,
so for a social crawler with `?story=` it would have returned the old meta-tag shell **instead of
the 301** — leaving the exact audience whose shared links this stage exists to fix parked on the
old URL. ⚠️ **`curl` would not have caught it**: no bot user-agent, no interception, a clean 301
every time. Stage 15 is now a verification-only step at go-live.

⚠️ **An unknown id is a 404, and that is an improvement on what `news.html` did.** The old page
fell back to `pickDefaultStory()`, so a mistyped or withdrawn id rendered the **pinned** story under
a URL claiming to be a different one, with a `200`. The endpoint `rewrite`s to the same not-found
page `/news/<unknown-slug>` serves, so the reader keeps the URL they clicked and gets the site's
chrome and a link back to the feed.

⚠️ **A failed lookup returns 503 and does NOT redirect.** A 301 issued during an outage would
permanently repoint a real shared link at the wrong place, and browsers cache 301s — the damage
would outlive the outage that caused it.

**13 internal links moved from `news.html` to `news/`** across nine pages plus `nav.js`,
`updates.json` and `BaseLayout` — so the site does not link to a redirect from every footer.
Verified as *rendered*, not as source: `nav.js` resolves `../../news/` → `/news/` from a skill page
two levels down. Every file is one line in, one line out in `git diff --numstat`, which is the
round-trip-damage tell. ⏭️ Two references deliberately left: `index.html`'s banner link (stage 12)
and `search-index.json` (stage 13) — both emit the old form and both now 301 correctly.

⚠️ **`/add-news` now names a file that does not exist**, so it carries a stop banner at the top
of the command. It was already publishing nothing after stage 10; what changed is that the lie is
now visible rather than silent. Fifth instance of the orphaned-command trap.

### The reorder test — owed, and it needs the dashboard

This is **the one thing in Phase 6 that cannot be verified after the fact**, and the anon key cannot
write to an admin-write table, so it is a paste into the dev SQL editor.

Before, on dev:

| `sort_order` | `legacy_id` | story |
|---|---|---|
| 0 | `2026-08-14-0` | AI Employment Gap for Young Workers Widens to 19% |
| 1 | `2026-08-14-1` | Buried in OpenAI's Own Research: No Correlation Between AI Use and Revenue per Employee |

**Swap them** (dev project, SQL editor):

```sql
update public.news_stories set sort_order = 99 where legacy_id = '2026-08-14-0';
update public.news_stories set sort_order = 0  where legacy_id = '2026-08-14-1';
update public.news_stories set sort_order = 1  where legacy_id = '2026-08-14-0';
```

Then `2026-08-14-0` **must still redirect to `…ai-employment-gap…`**, even though it is no longer
that day's first story. If it follows the position instead, positional ids were never really
retired and every link shared before this phase is a time bomb.

**Restore afterwards:**

```sql
update public.news_stories set sort_order = 99 where legacy_id = '2026-08-14-1';
update public.news_stories set sort_order = 0  where legacy_id = '2026-08-14-0';
update public.news_stories set sort_order = 1  where legacy_id = '2026-08-14-1';
```

⚠️ The detour through `99` is not superstition: `sort_order` has no unique constraint, so a direct
swap would work — but leaving both rows on the same value mid-way is exactly how a half-applied
edit becomes an ambiguous order nobody notices.

**Result — PASSED, 2026-08-26.** The swap was applied on dev and both halves were read back:

```
DISPLAY ORDER on /news/   ...buried-in-openais...      <- now first
                          ...ai-employment-gap...      <- now second

REDIRECT  2026-08-14-0 ->  ...ai-employment-gap...     <- UNMOVED
          2026-08-14-1 ->  ...buried-in-openais...     <- UNMOVED
```

⚠️ **The two halves disagreeing is the evidence, not a discrepancy.** The page order flipped, so
the reorder genuinely took effect and the `select` was not lying; the redirect did not, so it is
resolving through the stored `legacy_id` and not through position. Under the old scheme
`2026-08-14-0` would now open the OpenAI story — **a link shared weeks earlier silently pointing at
a different article, with no error anywhere.**

⚠️ **Checking the display order was not padding.** Had only the redirect been re-run, a swap that
never applied would have produced an identical PASS — the test would have proved nothing and looked
green. `sort_order` was restored afterwards.

---

## Stage 12 — Switch the banner's news source · Owner: Claude

`newsItemsHTML()` in [public/index.html:410](../public/index.html:410) currently does
`fetch('news.json')`. That file is about to stop existing, so this is **forced by the phase, not
optional**. The story link it builds is one line below, at
[:425](../public/index.html:425), and moves to the `/news/:slug` form with it.

**Visitors must see no difference.** Same three most-recent stories under 14 days old, same layout,
same behaviour — only the source and the link format change.

⚠️ **`index.html` is a hand-written page in `public/`, served as authored.** Whatever it fetches has
to be reachable by a plain `fetch` from a static page. Decide whether that is the Supabase client it
already loads, or a small JSON endpoint from stage 13 — and prefer the one that does not add a second
way of asking the same question.

**Tick as you go**

- [x] Banner reads from the DB, `news.json` no longer fetched by `index.html`
- [x] Same three stories, same order, same 14-day window as before the change
- [x] Story links use the new `/news/:slug` form
- [x] ~~Screenshotted before and after~~ — **replaced with something stronger**, see below
- [x] Behaviour with the DB unreachable is graceful: the banner hides, it does not break the homepage

**Observed, 2026-08-26**

⚠️ **THE STAGE'S OWN QUESTION WAS ANSWERED THE OTHER WAY, AND privacy.html IS WHY.** The stage
asks whether the page should use "the Supabase client it already loads". It does load it — `nav.js`
injects `supabase.min.js`, `supabase-client.js` and `auth.js` on every page — so that was available.
It was rejected:

- **A signed-out visitor currently makes NO request to `supabase.co`.** `createClient` touches no
  network and `auth.js` reads the session from `localStorage`. `privacy.html`'s processor table
  therefore says Supabase affects **"Account holders"**, and that is exactly true today.
- Querying `news_stories` from the browser would make it **"Everyone"**, on the site's most-visited
  page, before the reader has done anything — and would break the §9 claim added on 2026-08-23 with
  the self-hosted fonts: *no third party is involved in showing you the page*. That is an absolute
  claim with **no third-party section left to append a row to**.

So `/api/news/recent.json` serves it from our own domain: the server talks to Supabase, the browser
talks only to `amplifiedthinker.com`, which Vercel already covers under "Everyone". ⚠️ **`privacy.html`
was checked and deliberately NOT changed** — the design was chosen so it stays true as written,
rather than the page being edited to catch up with the code.

⚠️ **THE SELECTION RULES DID NOT MOVE.** `NEWS_MAX_AGE_DAYS` and `NEWS_MAX_COUNT` are still applied
in `index.html`; the endpoint returns rows and makes no decisions. Switching the source *and* the
rules in one change is how "visitors see no difference" becomes unprovable.

**Instead of a screenshot pair, both selections were computed and compared.** The old function was
transcribed from `index.html` as it stood and run against `news.json`; the new one run against the
endpoint:

```
BEFORE (news.json)                          AFTER (/api/news/recent.json)
2026-08-25  The "Great Flattening" ...      2026-08-25  The "Great Flattening" ...
2026-08-24  Women Hold Roughly 1 in 4 ...   2026-08-24  Women Hold Roughly 1 in 4 ...
2026-08-24  Skilled Trades Demand ...       2026-08-24  Skilled Trades Demand ...

same count ................ YES
same stories, same order .. YES
links changed by design ... YES (all three, to /news/<slug>)
```

⚠️ A screenshot pair would have shown three identical rows of truncated text and proved only that
three rows were present. This compares the actual selection, which is the thing that could have
changed. The rendered page was then read as well: seven ticker items — four curated, three stories
— with the new hrefs.

**Failure branch tested by actually breaking it**, not by reading the code: the fetch was pointed at
a path that 404s and the page reloaded. Banner still present, **four curated announcements still
rendering, zero story items, no JS errors**, hero and cards intact. Reverted immediately.

⚠️ **`news.json` is now read by nothing the site serves.** `news.html` went at stage 11 and the
banner went here; the only remaining reader is `scripts/build-news-seed.mjs`, which is a build-time
tool. The file is dead weight from this point and stage 16 deletes it.

---

## Stage 13 — `search-index.json` → `/api/search-index.json` · Owner: Claude

Assembled from the DB plus the static page and person entries. `search.html:742` changes one fetch
URL. Keep `fuse.min.js` and the search UX exactly as they are — only the index source moves.

This kills a hand-maintained file that drifts, and removes one of the manual `/add-skill`
touchpoints.

⚠️ **`search.html` has its own footer variant.** `<footer class="search-footer">` is scoped at (0,2,0)
to beat the shared rules, and four of its class names are shared ones. Nothing in this stage should
touch it — but if the page is edited at all, do not unscope those rules.

**Tick as you go**

- [x] `/api/search-index.json` returns page, person, primer, plan **and** news entries
- [x] News entries point at `/news/:slug`, not the old `news.html?story=` form
- [x] `search.html`'s fetch URL updated — one line
- [x] Search results verified by hand for a news term, a skill term and a person
- [x] `public/search-index.json` deleted, and `/add-skill` updated — ⚠️ **repointed, not stripped**: 23 of the 104 entries are still hand-maintained

**Observed, 2026-08-26**

**104 entries before, 104 after.** The old file was read out of git and compared against what the
endpoint serves:

```
by type before : {page:5, primer:5, plan:5, person:8, news:81}
by type after  : {page:5, primer:5, plan:5, person:8, news:81}

news title+summary set identical .. YES
news order preserved .............. YES
every news url is /news/<slug> .... YES
news entries carrying tags ........ 0   (omitted, as they always were)
non-ASCII: 122 before, 122 after .. mojibake patterns: none
```

⚠️ **ONLY 78% OF THAT FILE COULD BE DERIVED AWAY.** The 23 page/primer/plan/person entries carry
editorial descriptions, tags, quotes and section lists that exist nowhere else, so they moved to
`src/data/search-static.json` **unchanged**. They were extracted with a script rather than retyped:
this is the file that sat on `main` with 39 CP1252-decoded characters in it, and retyping it would
be a fresh chance at exactly that. Round trip proved identical before the old file was deleted.

⚠️ **The comparison caught one thing I had not planned to change.** A *static* entry — the News
page's own search result, `id: "news"` — still pointed at `news.html`. Every news **story** URL had
been dealt with; the entry for the news **page** had not. Fixed, and then proved to be the only
difference: a field-level diff across all 23 static entries reported **1 entry differing, 1 field**,
`"news.html"` → `"/news/"`.

**Verified in the browser, by reading rendered results rather than the index:**

| query | result |
|---|---|
| `flattening` | News → `/news/2026-08-25-the-great-flattening-…` — **no redirect in the path any more** |
| `systems thinking` | Skill Primer + Full Learning Plan, both `skills/systems-thinking/…` |
| `Bren` | Person → **`Brené Brown`**, rendered correctly — the exact string the mojibake bug corrupted |

⚠️ **THE REAL RISK IN THIS STAGE WAS TURNING AN OUTAGE INTO A DEAD SEARCH PAGE, AND IT WAS TESTED
BY CAUSING ONE.** `search.html` treats a failed index fetch as fatal: it disables the input and
shows *"Search unavailable"*. The index used to be a static file, so a database outage could not
touch search at all — so an endpoint that 503s on a failed read would have been a **regression
introduced by the change meant to stop the index drifting.** A failure was injected into the
endpoint and the page reloaded:

```
HTTP/1.1 200 OK        x-news-entries: 0        cache-control: public, max-age=30
entries: 23  {page:5, primer:5, plan:5, person:8}

search input disabled .. false        error state .. none
"systems thinking" ..... 2 results
```

Search stays alive on the static half and loses only the news entries. The `x-news-entries` header
is there so a human can tell a degraded index from a healthy one without reading function logs, and
the cache drops to 30s so a transient failure does not sit in the CDN behind a truncated index.

⚠️ **`/add-skill` was repointed rather than having the step removed.** The step does not disappear —
a new skill's primer and plan entries are still hand-written, they just live in `src/data/` now, and
editing the deleted path would silently do nothing. One thing got **louder**: a syntax error in that
file now fails `npm run build`, because the endpoint imports it, where before a trailing comma broke
site search at runtime and nothing reported it.

---

## Stage 14 — Favourites, pins and notes · Owner: Claude

The announceable half of the phase. `user_news` (favourite + per-user pin) and `notes`
(`target_type = 'news'`), both already in the schema with RLS policies scoped to `auth.uid()`.

⚠️ **`user_news.pinned` is per-user and `news_stories.pinned` is editorial, admin-set, one site-wide.
The schema warns about this in a comment because they are trivially conflated.** Two different
concepts, two different tables, one word.

⚠️ **This is the first user-authored free text the site has ever stored.** Progress rows are booleans
and timestamps; a note is whatever someone types. That has consequences beyond this stage — see
stage 16.

**Guests keep full content access.** Favourites, pins and notes are signed-in only, and the signed-out
state should invite rather than block.

**Tick as you go**

- [x] Favourite, per-user pin and note controls on `/news/:slug`
- [x] Signed-out state shows the affordance and routes to `/sign-in/?next=…`
- [x] ⚠️ The `?next=` href verified by **reading the rendered attribute after scrolling**, not by calling the function — this exact defect shipped twice
⏭️ **The two-account RLS proof has MOVED to stage 17 and is a tick box there**, not here. It is
deliberately not a box in this list as well: an item that exists in two checklists is an item that
gets ticked in one of them and read as done in both. The reasoning for the move, and the four
requests it has to make, are written up under stage 17.

- [x] `[hidden]` toggling: any new component that sets `display` carries an explicit override, and computed `display` is what gets asserted
- [x] `why-sign-up.html` — favourites and notes moved off `Soon`
- [x] Note length limited, and what happens at the limit is decided rather than discovered
- [x] **Added, not in the original list:** somewhere to SEE what was saved — see below
- [x] A signed-in pass in a real browser — **all seven confirmed by the site owner, 2026-08-26**

**The signed-in pass — what the site owner confirmed, and what it caught**

| # | check | result |
|---|---|---|
| 1 | The personal layer paints for a signed-in reader | ✅ — the poll fix holds. This one fails **only** when signed in, so nothing here could have proven it |
| 2 | ⚠️ **The pin trigger** — pin, replace, reload | ✅ exactly one pin survives. No stub can prove this; it is the database doing it |
| 3 | Note saves, edits, and comes back after a reload | ✅ **after a fix — see below** |
| 4 | The 500 boundary saves cleanly | ✅ — UI cap and `notes_body_length` agree at the edge |
| 5 | Both chips against real data after a reload | ✅ correct counts, correct stories — the only exercise of `loadPersonal`'s real two-table query |
| 6 | By eye: pressed state, `Featured` / `Your pin`, the chip rule, dark mode | ✅ — ⚠️ **the teal pressed state was unverifiable here**: this browser pane would not restyle a toggled node, and a clone of the same element proved the rule was right while the original read white. Only a human could close it |
| 7 | Sign out clears the personal layer | ✅ — nobody's saved stories survive a sign-out on a shared machine |

⚠️ **CHECK 3 FAILED FIRST TIME, AND THE MIGRATION I HAD JUST WRITTEN CAUSED IT.**

```
Could not save your note. there is no unique or exclusion
constraint matching the ON CONFLICT specification
```

`20260826160000` scoped `notes_one_per_target_idx` to `target_type = 'news'`, and **its own header
asserted that the news upsert was unaffected**: *"a partial index still serves that conflict target
for the rows it covers."* That is false. Postgres can only INFER a partial unique index for
`ON CONFLICT` if the statement carries the index's own `WHERE` predicate, and PostgREST does not
emit one — so through supabase-js a partial index cannot serve an upsert **at all**, not even for
rows inside the predicate.

`saveNote` now **updates first and inserts only if nothing matched**, catching `23505` and retrying
as an update for the two-tab race. That removes the coupling that caused this: how the client writes
no longer depends on which indexes happen to exist. An edit costs one round trip, a first note two.

⚠️ **The false comment was corrected in the migration itself, not just here** — that file is what
somebody reads when they hit this again.

⚠️ **NOTHING IN THIS REPO COULD HAVE CAUGHT IT.** `verify:rls` uses the anon key and never writes;
every browser test used a stub whose `upsert` was a function I wrote, so it answered the way I
expected rather than the way PostgREST does. **The first real write was the first real test**, which
is the argument for doing check 3 before check 5, 6 and 7 rather than after.

**Observed, 2026-08-26**

⚠️ **THE STAGE LISTED WRITE CONTROLS AND NO READ SURFACE, AND THAT IS A GAP IN THE STAGE RATHER
THAN IN THE BUILD.** A favourite you cannot go and look at is a button that reports success into a
void. Raised by the site owner while reviewing the first cut. Added:

- a **Saved** chip in the filter bar, shown only to a signed-in reader who has saved something —
  showing it to a guest advertises a filter that can only return nothing, and showing it at zero
  reads as broken rather than empty
- a **Your pins** group at the top of the headline list, never collapsed behind an archive toggle,
  because a pin is a request to keep something in sight
- un-saving the last story falls back to **All stories** rather than stranding the reader on a
  filter that can no longer match anything

⚠️ **`user_news.pinned` renders in the same list as `news_stories.pinned` and they are different
concepts** — one reader's pin versus the editorial one, one site-wide. Both wear the pin icon
because both mean "keep this in sight", but only one is visible to anyone else. The schema carries a
comment warning about this; the list is exactly where they would get conflated.

**The note panel has two modes**, which is what gives it a resting state — a single always-editing
panel has no natural end, because saving leaves you in a textarea with a Save button:

| | opens to | buttons |
|---|---|---|
| No note yet | edit | Save note *(disabled)* · Clear · Close |
| Note exists | **view** | Edit · Delete · Close |
| Editing | edit | Save note · Clear · **Cancel** |

**Save lands in view mode.** Delete belongs to the note and Clear belongs to the text, so they live
in different modes and cannot be mistaken for one another. Both ask first, **inline rather than
`confirm()`** — a browser dialog cannot be styled to match anything here — and Escape backs out of
the question. Deleting closes the panel; an empty editor left open says nothing the status line has
not already said. Save is disabled when empty **and when unchanged from what is stored**, which is
what stops the button inviting a second press after a successful save.

**The full machine was walked step by step and read back at each step**, not reasoned about:

```
painted   edit  closed  Save(disabled)              "Add a note"
opened    edit  flex    Save(disabled)
typed     edit  flex    Save                        counter 16 / 500
saved     VIEW  flex    Edit Delete Close           "View note"   "Note saved."
edit      edit  flex    Save(disabled) - unchanged
changed   edit  flex    Save
clear?    edit  flex    "Clear what you have typed?"  textarea untouched
cancel    edit  flex    toolbar restored exactly
cleared   edit  flex    Save(disabled)  "Cleared. Your saved note is unchanged until you save."
delete?   view  flex    "Delete this note permanently?"
escape    view  flex    toolbar restored
deleted   edit  CLOSED  "Add a note"   "Note deleted."   db: null
```

⚠️ **A DEFECT FOUND BY READING THE LOADER, INVISIBLE IN A SIGNED-OUT BROWSER.** `start()` read
`window.AmplifiedAuth` once and returned if absent — but nav.js appends the auth stack with
`async = false`, which preserves execution order and does **not** delay `DOMContentLoaded`, so
`auth.js` can land afterwards. The personal layer would have stayed unpainted **for signed-in
readers only**, which is the entire audience for the feature and the group least likely to report
it. `progress.js` and `learning.js` both poll for exactly this reason and say so; this now polls the
same way, short-circuiting on `data-session="out"` so guests never do.

⚠️ **`nav.js`'s sign-in href refresher now matches `[data-signin-return]` as well as its own
class.** The alternative was a second copy of that logic in `news-actions.js` — and the lesson that
function exists for is that when two files maintain one control, they drift. The rendered attribute
was read at activation: `#at=640` appears when scrolled and is gone at the top.

⚠️ **A note is the first user-authored free text this site stores**, so the limit is enforced in the
DATABASE, not the form. Signed-in browsers write to PostgREST directly, so `maxlength` is a
courtesy; `notes_body_length` is the control. 500 in both, with a comment on each saying it must
match the other.

⚠️ **`notes.target_id` has no foreign key and no shape constraint**, so a signed-in account with a
console can create rows against target_ids that point at nothing. Every such row is private to that
account. **Judged storage untidiness rather than a security hole and deliberately left open** — the
reasoning is written into the migration header so the next reader meets the decision rather than
rediscovering the gap.

### Four enhancements from review, 2026-08-26

Raised by the site owner after the first cut, and all four are the kind of thing only someone
using the feature would ask.

**A `Has notes` chip**, symmetric with `Saved`. Same rules: signed-in only, shown only when it can
return something, and its own empty state — *"no notes yet"* and *"no stories match this filter"*
are different facts. A failed notes read leaves the chip absent rather than the whole personal layer
missing: losing one filter beats losing all of them.

⚠️ **ONE PIN PER READER, AND THE REASON IS NOT TIDINESS.** With unlimited pins, Pin and Save are
the same control wearing different icons — both booleans on the same row, both taking as many
stories as you like. Made singular, each earns its place: **Save is a collection, Pin is the one
thing you are keeping in front of you.**

Enforced by a trigger **plus** a partial unique index, the same shape `news_stories_single_pinned_idx`
already uses for the editorial pin. ⚠️ **A trigger rather than unpin-then-pin from the browser**,
because that is two round trips and a failure on the second leaves the reader with **nothing**
pinned having asked to *move* a pin. ⚠️ **`SECURITY INVOKER` is load-bearing** — as `DEFINER` the
function would run as the owner and bypass RLS, leaving its own `where` clause as the only thing
keeping it off other readers' rows. Verified on dev: `SECURITY INVOKER`, trigger present, index
`(user_id) WHERE pinned`.

**Replacing a pin asks first and names what it replaces**, because the trigger clears the old one
whether or not anybody was told, and quietly discarding a choice the reader made is the thing this
site keeps deciding not to do. Titles are cut on a word boundary and stripped of their own quotes:
the first version produced a 100-character question with nested quotation marks, which is a prompt
that gets dismissed unread.

⚠️ **"FEATURED" — A COLLISION I INTRODUCED THAT MORNING AND FIXED THAT AFTERNOON.** The editorial
pin and the reader's pin wore the same icon and the same warm tint, so a signed-in reader saw two
identical-looking rows meaning different things: one everybody sees, one only they do. The schema
carries a comment saying these two are trivially conflated — and the list is exactly where it
happened. They are now separated by **word**, not only position: the editorial one is **Featured**
everywhere (group header and story badge), and **Pinned** is the reader's alone.

⏭️ **The Featured header shows for guests too, which is a deliberate change to the shared view.**
A story sitting at the top of the list with a pin icon and no explanation is a small unanswered
question on every visit; naming it answers one.

**`why-sign-up.html` makes the deeper case**, and two things in it are worth recording:

- ⚠️ **I had just made my own copy false.** *"Pin the ones that matter"* was plural on the day
  pinning became singular — caught in the same sitting, which is the only reason it was caught.
  Exactly the trap CLAUDE.md describes about copy that states a limit.
- ⚠️ **An overclaim, corrected.** The page said notes are readable by *"nobody else, not even in
  aggregate"*. `notes_own` is genuinely the ONLY policy on that table — there is no admin view, so
  no account can read another's, and that is worth saying. But whoever runs a database can reach
  what is stored in it, and the page where somebody decides whether to trust the site is the wrong
  place to overstate. It now carries both halves and points at `privacy.html`.

**Bulk note deletion parked**, in `BACKLOG.md`, as an `/account/` action rather than a per-story one
— noting that the nuclear option already works: deleting the account cascades `notes` and
`user_news` through their FKs.

**`npm run verify:rls` is 23/23**, up from 22. The new trigger function is revoked from `anon` and
`authenticated` like the other three, so it is asserted like the other three — 20260817140000's own
argument was that being *inconsistent* about hardening is worse than the risk it carries.

⚠️ **A self-inflicted defect worth recording.** A coarse range replacement deleted `paint()`,
`toggleFlag()` and `reflectFlag()` outright, and **`node --check` stayed green** — a call to a
function that no longer exists is valid syntax. Caught by a scan for called-but-undefined names,
calibrated first against three known-good files: a checker that has not been shown to pass on
working code is measuring nothing.

---

## Stage 15 — Retire `middleware.js` · Owner: Claude

⚠️ **DONE EARLY — the file was deleted at stage 11, and that was not tidying-up.**

Its only job was faking meta tags for social scrapers because the real page rendered client-side
after `fetch('news.json')`. Stage 10 made the content genuinely server-rendered, which left it
redundant. **Stage 11 made it actively harmful**: its matcher is `/news.html`, and Vercel runs
middleware *before* routes — so a crawler following a shared `?story=` link would have been handed
the old meta-tag shell **instead of the 301**, parking the exact audience this phase exists to serve
on the URL it is trying to retire.

⚠️ **Nothing would have reported that.** The redirect test is a `curl`, which carries no bot
user-agent, so every check would have passed while the behaviour was wrong for LinkedIn, Slack and
every other scraper. Same shape as the `[hidden]` and rendered-nav traps in CLAUDE.md: the test
exercised a path the failure does not live on.

**Retire, not port.** The meta tags now come from the page itself, which is the whole improvement.

**Tick as you go**

- [x] `middleware.js` deleted from the repo root — at stage 11
- [ ] A story URL checked in a link-preview debugger — title, description and image all present. ⏭️ **Needs production**: previews are auth-walled, so no scraper can reach one. This is a **stage 17 go-live check**
- [x] Nothing else in the repo referenced it — grepped; only its own header and the runsheet

---

## Stage 16 — Copy, privacy, and the obsolete command · Owner: Claude

⚠️ **`privacy.html` again, and this time it is a new category of personal data.** Stage 14 stores
free text that a user wrote. The page names every table, every storage key and the legal basis for
each, and it is now wrong until it mentions `user_news` and `notes`. Check the Promptly sibling.

**On the same-commit rule, precisely:** the binding constraint here is the same **merge**, not the
same commit. Nothing in Part B reaches production until stage 17 and the branch lands as one — the
rule exists so a *deployed* site never has code and privacy page disagreeing. So this stage may be
days after stage 14. It may not be after stage 17. See **Pacing** above.

### When `/add-news` stops working — the breakage map

Worked out 2026-08-26, before Part B started, so it is not re-derived at the point it bites.

**On `main`, it works normally right up to the stage 17 merge.** Stages 7–16 all land on
`feat/news-db`, so nothing touches `main` until then. At that merge it dies outright.

**On the branch it degrades in three steps, and the first one is the dangerous one:**

| Stage | Effect on `/add-news` |
|---|---|
| **10** — `/news` server-rendered | ⚠️ **First break, and it is SILENT.** The command still succeeds and still writes `news.json`, but the news page now renders from the DB — so **nothing it writes reaches the site.** A green run that publishes nothing |
| **11** — `news.html` becomes a redirect | ⚠️ **The command's own header now names a file that does not exist.** `public/news.html` was deleted, so the page it was written to feed is gone — but it still *runs*, because `news.json` and `search-index.json` are both still there. Not a hard break; a **visible** one, where stage 10 was invisible. A stop banner was added to the command here |
| **12** — banner switches to the DB | The homepage banner stops reading `news.json` too. Both surfaces now ignore the file the command maintains |
| **13** — `search-index.json` deleted | ❌ **First hard break.** Step 3a opens that file and gets `FileNotFoundError`. It fails **dirty**: step 3 has already written `news.json`, leaving a modified file and an unwritten index |
| **16** — `news.json` moved to `content/` | ✅ **Repaired here, not broken.** The command was REWRITTEN: curation kept, the write half repointed at `content/news.json` → generated SQL → the dashboard. See The interim route below |

⚠️ **Nothing catches the stage 10 break.** The three prebuild gates are `verify:catalogue` (skills
only), `verify:signin-return` and `verify:encoding` — **none of them reads `news.json`.** So a run
after stage 10 passes every check, commits, deploys green and publishes nothing. Same shape as the
`skills-catalogue.json` trap in CLAUDE.md: a wrong answer that fails no test.

**Treat stage 10 as the cutoff.** Add any news that is wanted *before* Part B reaches it, and do not
run `/add-news` on this branch afterwards.

⚠️ **The real gap is scheduling, not tooling.** This stage deletes the command; the admin UI that
replaces it is **Phase 7**. Between the stage 17 merge and Phase 7 shipping there is **no way to add
news at all** — so the interim route below has to be decided *before* the merge, not discovered
after it. The obvious shape is a small script inserting into `news_stories` and reusing stage 8's
slug and `legacy_id` logic rather than a second implementation of either.

⚠️ **`/add-news` is dead, not stale.** The command is written end-to-end around editing
`public/news.json` and regenerating `search-index.json` positionally. Both files are gone by the end
of this phase. This is the **fifth** instance of the orphaned-command trap and the first where the
fix is deletion rather than a path update — but news still has to be added somehow, and the admin UI
is Phase 7. **Say explicitly, in the file or in its replacement, how news gets added between this
merge and Phase 7 shipping.** A deleted command and no successor is how a phase silently removes a
working capability.

⚠️ **The fourth instance landed on 2026-08-24 and raises the bar for this stage.** `/add-skill` still
said *"Google Fonts: use the same imports as the template pages"* a day after the templates stopped
having any — following it would have reintroduced the exact third-party request `privacy.html` now
says is never made, turning a correct legal page into a false one. It also carried a retired hex
value and a retired face name into an image prompt, where nothing in this repo can inspect the
result.

So the check here is **not** "do the paths still resolve". It is **"does this command still describe
the site"** — and Phase 6 changes what the site *is* for both commands. Read them against the
finished code, not against their own file paths.

### The interim route, settled 2026-08-26

**`/add-news` was rewritten, not deleted.** Its first half — parsing a digest, shortlisting,
duplicate-checking, shaping a story — was never about `news.json` and is still exactly right. Only
its write half was dead. Deleting the whole command would have thrown away the curation to fix the
plumbing.

**The route:** author into `content/news.json` → `npm run build:news-seed -- --only <date> --write`
→ paste the generated SQL into the Supabase SQL editor.

⚠️ **`public/news.json` MOVED to `content/news.json` rather than being deleted, and the move is
the point.** Under `public/` it was a stale public copy of database content, served at `/news.json`
and read by nothing — the same shape of fault that left 39 mojibake characters live in
`search-index.json` for days. Outside `public/` it stops being published and becomes what it
actually is: an authoring input to the seed generator. `git mv`, so the history follows it.

**Why not a script that inserts the rows directly.** `news_stories` is admin-write, `is_admin` is
settable only where `auth.uid()` is null, the anon key is correctly refused by RLS, and stage 7
settled that `service_role` gets no home in this phase. The dashboard SQL editor is the only route
left, which is why the product is generated SQL a human pastes — the same arrangement the
migrations already use.

⚠️ **`--only` exists because of Phase 7, not because of convenience.** The full seed is idempotent
on `slug`, so once the admin UI is writing to `news_stories` directly, a bare `--write` regeneration
would **silently overwrite every story edited there** and report success. A partial load can only
touch rows the command just authored. Three branches were exercised when it was built: a matching
date, a typo date (exits non-zero rather than emitting an empty file — SQL that runs and publishes
nothing is the exact failure this stage exists to close), and a batch containing the Featured pin,
which needs an explicit `set pinned = false` because a one-day batch cannot see the pin it is about
to collide with. Full-seed data rows came back byte-identical after the refactor.

**And it has an end date.** Phase 7's admin UI retires both the command and `content/news.json`.
That is written at the top of the command itself, not only here.

### What the legal pages actually needed

`privacy.html` gained a §3 category (**what you save and what you write**, with a caution against
putting sensitive personal information in a note), a §4 contract row, and corrections to §11
deletion, §12 rectification and §13 security. **§13 also gained the honest limit**:
`why-sign-up.html` was already telling readers that *"whoever runs a database can always reach what
is stored in it, and Privacy says so plainly"* — and privacy did not say it. A cross-reference to a
claim the referenced page does not make is worse than no cross-reference.

**Promptly had the precedent for all of it**, which is why the backlog watch item exists: a *"What
you write — only if you sign up"* §3 paragraph carrying the same sensitive-data caution, a *"Your
content stays yours"* terms section, and an acceptable-use line about unlawful or harassing stored
content. Amplified Thinker's versions follow its structure. Nothing shared between the two sites —
controller, contact, jurisdiction, the ICO route, the age threshold, transfer safeguards — moved,
so the sibling needed no edit.

`account.astro`'s deletion copy said *"and your saved items"*, which is vaguer than what it
destroys. It now names the saved stories, the pin and the notes. The cascade was checked against
`20260819080000_delete_own_account.sql` rather than assumed: `user_news` and `notes` are both
`on delete cascade`.

**Tick as you go**

- [x] `privacy.html` — saves, pin and notes added at §3, with legal basis at §4; §§11/12/13 corrected
- [x] Promptly sibling checked — it had the precedent; nothing shared between the sites changed
- [x] `terms.html` — §4 *"So is anything you write"*, §5 acceptable-use line, stamp bumped
- [x] `why-sign-up.html` consistent with what actually shipped — chip label now reads `Has Notes`
- [x] `/add-news` **rewritten**, and the interim route written down — above, and in the command
- [x] `/add-skill` — already repointed to `src/data/search-static.json` at stage 13; re-read whole
      against the finished site (fonts, palette, `updates.json`) and it still describes it
- [x] `public/search-index.json` deleted (stage 13); `public/news.json` **moved** to `content/` —
      no longer served, which is what the box was for
- [x] Grep for the promise, not just the feature — the one that had rotted was
      `account.astro`'s *"your saved items"*, not a stated limit

---

## Stage 17 — Go live · Owner: Human + Claude

**In this order, and the order is the whole point:**

1. Final verification on the preview and on dev
2. **Apply the migrations and load the news data to prod** — immediately before the merge. Not
   after, and not "straight after". ⚠️ **FOUR MIGRATIONS, IN THIS ORDER**, all added during
   stage 14 and all already applied to dev:

   | order | file | what it does |
   |---|---|---|
   | 1 | `20260826120000_notes_body_length.sql` | a note is 1–500 characters; one note per news story |
   | 2 | `20260826140000_user_news_single_pin.sql` | one pinned story per reader (trigger + partial unique index) |
   | 3 | `20260826160000_notes_one_per_target_news_only.sql` | scopes #1's index to `target_type = 'news'` |
   | 4 | `20260826180000_news_stories_merged_into.sql` | `merged_into` on `news_stories`, so an archived story's old links reach the story it was merged into |

   ⚠️ **APPLYING A PREFIX OF THESE LEAVES A DATABASE THAT LOOKS FINE AND ENFORCES THE WRONG RULE.**
   Stopping after #1 gives prod a `notes` index bound across the whole table — which is the state
   dev was in for an hour, is invisible from the site, and only surfaces when somebody tries to
   write a second note on a plan, months later. #3 is not optional tidying; it is #1 finished. ⚠️ **And #4 must precede the news seed**, not follow it — the seed sets `merged_into`, and without the column the whole load fails on an unknown column rather than degrading.

   Each is re-runnable (`drop ... if exists` / `if not exists`) — written that way after #1 was
   applied to dev at the wrong limit and a plain `add constraint` failed with 42710, rolling back
   the whole transaction and silently taking the index with it.

   **Verify by reading the catalogue, not the success message.** DDL returns "Success. No rows
   returned" whether or not it did what was intended — and each migration is wrapped in
   `begin/commit`, so one failed statement rolls the others back while the error names only
   itself. ⚠️ **Paste [supabase/verify/phase-6-stage-17.sql](../supabase/verify/phase-6-stage-17.sql)**,
   which states the expected answer for every check and has no check whose correct result is an
   empty set. The short form:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.notes'::regclass and contype = 'c'
union all
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and tablename in ('notes', 'user_news')
union all
select proname, case when prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end
  from pg_proc where proname = 'user_news_single_pin';
```

   ⚠️ Two answers are worth actually looking at rather than counting rows: `user_news_single_pin`
   must say **`SECURITY INVOKER`** (as `DEFINER` it would bypass the RLS that confines it to the
   caller's own rows), and `notes_one_per_target_idx` must end **`WHERE (target_type = 'news')`**
3. Merge `feat/news-db` to `main`
4. `npm run verify:stamp` — confirm production is actually serving the new commit
5. The done-when, against **production**:

```bash
curl -sI "https://amplifiedthinker.com/news.html?story=2026-08-14-0"
```

6. Reorder that day's `sort_order` in prod, re-run the same `curl`, confirm it lands on the same
   story, then put the order back

⚠️ **A Vercel rollback restores code, never schema.** From the moment step 2 runs, "undo" means a
migration down-script plus a code revert, and the two are not symmetric. Read
[supabase/README.md](../supabase/README.md) before starting.

**Tick as you go**

- [ ] Preview verified; dev data correct
- [ ] **All four** prod migrations applied **in order**, catalogue read back, and news loaded — record the row count observed
- [ ] Merged to `main`
- [ ] `npm run verify:stamp` — production serving the merge commit
- [ ] ⚠️ 301 verified **on production**, against a real previously-shared URL
- [ ] ⚠️ Reorder test re-run on production, same story, order restored
- [ ] `npm run verify:rls` green with its updated expectation — ⚠️ **24/24, not 23.** The
      `news_stories` row now expects `published` **or** `archived`: it said `published` alone until
      2026-08-26 and passed vacuously, because the table had no archived row to contradict it. The
      first merge created two and it failed instantly. A second assertion was added alongside it
      that the read returned any rows at all, since "no forbidden status came back" is trivially
      true of zero
- [ ] `npm run verify:news-dupes -- prod` — run it **after** the load, not before. Beforehand it
      correctly reports an empty table as **"not a pass"**. Afterwards expect
      `81 rows: 79 published, 2 archived` and no findings
- [ ] Homepage banner checked by eye on production
- [ ] ⚠️ **The two-account RLS proof** — deferred here from stage 14. See below

### The two-account RLS proof — deferred from stage 14

**Why it is not covered by `verify:rls`.** That gate authenticates as nobody: it proves the
**anon** key reads and writes nothing. Every policy on `notes` and `user_news` applies to the
**`authenticated`** role, so the predicate that actually protects a reader's notes —
`user_id = auth.uid()` — has never been executed by any check in this repo.

⚠️ **THE APPLICATION CANNOT DETECT THIS FAILURE, BY CONSTRUCTION.** `news-actions.js` always
sends `.eq('user_id', uid)`. If the policy were `using (true)` — one word wrong — the site would
look **exactly the same**: you would see your own notes, nobody else's would appear, and everything
would feel correct. The client-side filter masks a broken policy completely. The only way to find
out is to deliberately make the request the application never makes.

⚠️ **ONE ACCOUNT CANNOT PROVE IT.** With a single owner, "returns only mine" and "returns
everything" are the same result — the test passes while measuring nothing. Same reason
`verify-redirects` insists on probing an origin that must be refused: without the negative case
there is no evidence.

Signed in as **B**, from the browser console:

| ask | must answer |
|---|---|
| `select * from notes` — no user filter | only B's rows, never A's |
| `select from notes where target_id = <a story A noted>` | empty |
| `update notes set body = 'x' where id = <A's note id>` | 0 rows changed |
| `insert into notes (user_id = A's id, …)` | rejected by `with check` |

⚠️ **The last one is the one that gets forgotten.** `using` governs what you can SEE; `with check`
governs what you can WRITE. A policy can be correct on reads and still let anyone write rows on
someone else's behalf.

⏭️ **Deferred here deliberately, and the trade is worth naming**: proving it on dev before the merge
would have been better, but it needs a second dev account nobody had. Production has two real
accounts, so it is provable there — at the cost of being **after** go-live rather than before. If
that trade ever looks wrong, the fix is one dev sign-up, not a new tool.

---

## Stage 18 — Announce · Owner: Human + Claude

Impact is 🔵 Visible + 🟢 New: story URLs change shape, and favourites/pins/notes are new. Announce
the second half.

⚠️ **The banner and `updates.json` state the same dates twice with nothing checking they agree, and
the banner expires in 14–21 days.** Dark Mode was dated a day apart in the two for a month before
anyone could notice — the expiry did not cause that error, it made it *unfalsifiable*. Write both in
the same sitting and take the date from the commit.

⚠️ **A recursion worth noticing:** stage 12 rewrote the banner's data source, and this announcement
is rendered through it. Check the banner renders the new item correctly on production rather than
assuming it, because the mechanism underneath it changed in this same phase.

**Tick as you go**

- [ ] Banner item added to `ANNOUNCEMENTS` in `index.html`
- [ ] Matching `updates.json` entry, **same date, same sitting, date taken from the commit**
- [ ] Rendered banner checked on production — the new data source works for a new item
- [ ] Phase 6 progress-log entry written in `implementation-sequence.md`
- [ ] Handoff table at the top of this file completed, with observations rather than "done"

---

## What this runsheet deliberately does not do

- **It does not build the admin UI.** News management, reordering and archiving are Phase 7. Where
  Phase 6's verification needs a reorder, it uses SQL.
- **It does not touch the blog.** Phase 8. Stage 7's adapter is a shared dependency, which is the
  only overlap.
- **It does not add a contact form.** `BACKLOG.md` notes that retiring Pages changes its architecture
  and unlocks the better version. True, and out of scope here.
- **It does not resolve the leaderboard or events-table questions** deferred out of Phase 9.
- **It does not publish redirect stubs for the retired origin.** Deferred rather than dismissed —
  the trigger conditions and what reopening would cost are under stage 1. Re-enabling Pages to serve
  stubs would undo stage 2, so it is a real change rather than a tidy-up.

---

## Everything still open, in one place

Two sessions have now contributed to this phase, so this is the list rather than the scroll:

| | What | Owner |
|---|---|---|
| ✅ **Part A** | **COMPLETE — all seven stages, 2026-08-26** | — |
| **Stages 7–18** | Part B, unstarted. Stage 7 (the adapter) blocks 10–13 | Claude + Human |
| ⏭️ Deferred | Redirect stubs, only if indexing turns out to have mattered | — |

## Part A closed — 2026-08-26

**The GitHub Pages origin is retired**, four days after stage 0's baseline. Every stage verified
against the tree or a live probe rather than taken from a commit message.

**Four things this half of the phase actually taught, none of which were in the plan:**

1. ⚠️ **A stage is not done because its surroundings look done.** Stages 3 and 4 were both marked ✅
   with every checkbox untouched, an hour apart, by trusting commit messages over the boxes recording
   the work. Checking box by box found three real gaps in stage 4 alone — three files whose comments
   still described Pages as live, and an assertion that had been dropped rather than moved.
2. ⚠️ **Two gates were quietly misreporting themselves**, and both were found by running them rather
   than reading them. `verify-published` claimed *"two origins, 170 fetches"* after the map was cut
   to one — overstating its coverage by double. `verify-redirects` had the retired host under
   neither `allowed` nor `rejected` for two days, so nothing tested it in either direction while prod
   still honoured a redirect to it.
3. ⚠️ **A doc contradicted a gate for weeks and nothing noticed, because a doc cannot fail a build.**
   `supabase/README.md` listed four prod redirect URLs where there is one. Found only because a human
   opened the dashboard and said "there's only one here".
4. **The evidence that closed two boxes was a person's word**, and could not have been anything else:
   no broken-link reports, and a working sign-in. Both are recorded as such rather than dressed up —
   and the sign-in is the *only* check the Turnstile half will ever have.

**What is deliberately still true:** `ASTRO_BASE` survives in `astro.config.mjs`, the sub-path cases
survive in `verify:signin-return`, and `nav.js`'s depth detection survives — each because the origin
was one caller, not the reason. And `verify:redirects` now asserts prod **rejects**
`sing-chen.github.io` permanently, because that hostname still fronts every project on that account.
