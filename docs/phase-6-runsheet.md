# Phase 6 runsheet — retiring the Pages origin, then news into the DB

**Written:** 2026-08-22 · **Branch:** `feat/news-db`, off `main` at `96f9b9d`
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

**This file is the state.** There is no other tracker. Whoever does a stage updates its status row
in the same sitting, in this file, and says what they *observed* — not "done" but what the check
printed. A stage left at `◐ In progress` with no note is the failure mode this section exists to
prevent.

| # | Stage | Owner | Status | Notes from the person who did it |
|---|---|---|---|---|
| **A** | **Retire the Pages origin** | | | |
| 0 | Baseline — what is true before you start | Claude + Human | ✅ Done | 2026-08-22, all three gates green, **no deviation from the state described below**. `verify:stamp` both origins current on `96f9b9d`, 9s apart; `verify:published` 79 files / 158 fetches / 0 not served; `verify:redirects` 12 assertions, every origin resolving to the project that owns it. ⚠️ Two findings: the `verify:published` baseline is **two-origin and cannot be retaken after stage 2**, and the Pages redirect entry must **move to `rejected`** rather than be deleted — stages 4 and 5 amended |
| 1 | Is the origin actually indexed? | Human | ✅ Done | 2026-08-22. **Not indexed anywhere.** Google: *"did not match any documents"* — the explicit empty-result page, not a thin one. Bing and DuckDuckGo return only a shared off-topic `archive.org` fallback. **Decided: delete outright, no redirect stubs**, which removes the stub step and its 3-month soak from stage 5. ⚠️ Point-in-time — re-run if Part A stalls for weeks |
| 2 | Stop publishing to Pages | Human + Claude | ☐ Not started | Disable the workflow and unset the Pages source. **Fully reversible** |
| 3 | Soak on one origin | Human | ☐ Not started | Vercel becomes a single point of failure here. Minimum 48h before stage 4 |
| 4 | Remove Pages from code, gates and docs | Claude | ☐ Not started | ⚠️ Includes `privacy.html` — the GitHub processor row and the analytics claim |
| 5 | Dashboard cleanup — Supabase and Turnstile | Human | ☐ Not started | Two dashboards, invisible to git |
| 6 | Delete `pages.yml` | Claude | ☐ Not started | **After the soak, not with stage 4** |
| **B** | **News into the DB** | | | |
| 7 | The adapter decision | Claude + Human | ☐ Not started | ⚠️ **The plan puts this in Phase 8 and the plan is wrong.** Blocks 9–13 |
| 8 | Write the migration script — slugs and `legacy_id` | Claude | ☐ Not started | Derive counts from the file; the documented 21/69 is stale |
| 9 | Load dev, verify the data | Claude | ☐ Not started | Dev project only. Prod waits for stage 16 |
| 10 | `/news` and `/news/:slug`, server-rendered | Claude | ☐ Not started | |
| 11 | The 301 endpoint for legacy URLs | Claude | ☐ Not started | This is the one the done-when tests |
| 12 | Switch the banner's news source | Claude | ☐ Not started | Forced by the phase. Visitors must see no difference |
| 13 | `search-index.json` → `/api/search-index.json` | Claude | ☐ Not started | |
| 14 | Favourites, pins and notes | Claude | ☐ Not started | ⚠️ First user-authored free text on the site |
| 15 | Retire `middleware.js` | Claude | ☐ Not started | Retire, not port |
| 16 | Copy, privacy, and the obsolete command | Claude | ☐ Not started | ⚠️ Same-commit rule. `/add-news` dies here |
| 17 | Go live — prod migration, then merge | Human + Claude | ☐ Not started | Migration **immediately before** the merge, never after |
| 18 | Announce | Human + Claude | ☐ Not started | Banner and `updates.json` in the same sitting |

**Statuses:** ☐ Not started · ◐ In progress · ✅ Done · ⊘ Skipped (say why)

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
| Long gaps generally | `feat/news-db` diverges from `main`. The design-depth stash is a live example of what "leave it for now" costs — it was never committed, so the stash is the only copy |
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

### The repo half — verified 2026-08-22, line numbers re-checked 2026-08-23

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

**The four `news.json` consumers**, which is one more than the plan lists:
[public/index.html:411](../public/index.html:411) (banner fetch) and
[:426](../public/index.html:426) (story link), [public/news.html:759](../public/news.html:759)
(the page itself), [public/news.html:517](../public/news.html:517) (the share URL, still in the old
format), and [middleware.js:56](../middleware.js:56).

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

⚠️ **That baseline is a two-origin baseline, and it is the last one that can ever be taken.** From
stage 2 onward there is one origin, so a differential run against this file will report every Pages
fetch as missing — correctly, and confusingly. Either retake the baseline after stage 2, or read
the first post-retirement diff knowing that half its findings are the retirement itself.

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
- [ ] Anyone with a known bookmark identified and told

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

⚠️ **This is a point-in-time answer with a short shelf life.** The origin is still live and still
crawlable as this is written. If Part A stalls for weeks, re-run the search before stage 2 rather
than trusting this row.

---

## Stage 2 — Stop publishing to Pages · Owner: Human + Claude

The reversible half. Nothing is deleted here.

**GitHub → the `amplifiedthinker` repository → Settings → Pages → Build and deployment.**
Set **Source** to **None**. That unpublishes the site; the workflow file and every past run stay.

Then disable the workflow so it stops running and stops emailing about failures:
**Actions → Deploy to GitHub Pages → the `⋯` menu → Disable workflow.**

⚠️ **Do both.** Setting the source to None without disabling the workflow leaves it building on every
push to `main` and failing at `actions/deploy-pages`, which produces a red X in an inbox for a thing
that is working as intended. Disabling the workflow without unsetting the source leaves the last
build published indefinitely, which is the opposite of retirement.

**Verify:** in a logged-out browser, `https://sing-chen.github.io/amplifiedthinker/` should 404
within a few minutes. Then confirm `https://amplifiedthinker.com/` is completely unaffected — the
homepage, a skill page, sign-in, and `/learning/` while signed in.

**Tick as you go**

- [ ] Settings → Pages → Source set to **None**
- [ ] Actions → the workflow **disabled**
- [ ] Pages URL returns 404 logged-out
- [ ] `amplifiedthinker.com` verified unaffected — homepage, a skill page, `/sign-in/`, `/learning/`
- [ ] `npm run verify:stamp` re-run — the Pages arm now fails, and **that is the expected result**

**Rollback:** set Source back to **GitHub Actions**, re-enable the workflow, re-run it. Roughly two
minutes, and nothing in the repo changed.

---

## Stage 3 — Soak on one origin · Owner: Human

**Minimum 48 hours.** Nothing to do but leave it alone and use the site normally.

⚠️ **This is the stage where the trade actually lands.** Until now a bad Vercel deploy or a Vercel
outage left a complete working site on the other origin, and `main` has been able to fail to deploy
since Phase 2. From here, Vercel is a single point of failure. That is a deliberate trade recorded
in `BACKLOG.md`, not a side effect — but it is worth feeling it for a couple of days while stage 2
is still two clicks from reversal.

**Tick as you go**

- [ ] 48h elapsed with no Vercel incident
- [ ] At least one ordinary deploy to `main` made and verified during the soak
- [ ] Nobody reported a broken link to the old origin

**Observed:** _(dates, and anything that came up)_

---

## Stage 4 — Remove Pages from code, gates and docs · Owner: Claude

One commit, or a small series. Work from the stage 0 table.

⚠️ **`privacy.html` is the part that is not housekeeping.** It names GitHub as a processor and states
that the mirror runs no analytics. Once the mirror does not exist, both statements are **wrong**, not
merely out of date — and this is a page making legal claims under UK GDPR. The
[CLAUDE.md](../CLAUDE.md) rule applies exactly: change it in the same commit. Check the sibling
Promptly site, which makes the same statements about the same person under the same law.

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

- [ ] `astro.config.mjs` — `base` simplified, `GITHUB_SHA` arm dropped from the stamp
- [ ] `verify-published.mjs`, `verify-build-stamp.mjs`, `verify-schema-columns.mjs` reduced to one origin
- [ ] `verify-redirects.mjs` — ⚠️ Pages entry **moved from `allowed` to `rejected`** in prod, not deleted
- [ ] `verify-signin-return.mjs` — **assertions kept**, fixture/comment updated only
- [ ] `supabase-client.js` — **`environment()` untouched**, comment rewritten to keep the reasoning
- [ ] `nav.js`, `progress.js`, `BaseLayout.astro` — comments updated, logic untouched
- [ ] `about.html` comment updated
- [ ] ⚠️ `privacy.html` — GitHub processor row **and** the mirror-analytics paragraph both removed
- [ ] Promptly sibling checked for the same statements
- [ ] `CLAUDE.md`, `dev-workflow.md`, `implementation-sequence.md`, `BACKLOG.md`, `recovery.md`, `supabase/README.md` rewritten as a retirement
- [ ] `npm run build` passes, all three prebuild gates green
- [ ] `.claude/settings.local.json` — stale `sing-chen.github.io` curl permissions cleaned up

**Rollback:** `git revert`. This stage is entirely in the repo.

---

## Stage 5 — Dashboard cleanup: Supabase and Turnstile · Owner: Human

Two dashboards, neither visible to git, both currently trusting a host that no longer serves the
site.

**Supabase → project `spehmrgmcdenqdftkyrt` (prod) → Authentication → URL Configuration →
Redirect URLs.** Remove `https://sing-chen.github.io/amplifiedthinker/**`. Leave every other entry.

**Cloudflare → Turnstile → widget `amplifiedthinker-prod` → Domains.** Remove
`sing-chen.github.io`, leaving `amplifiedthinker.com`.

⚠️ **The Turnstile one matters more than it looks.** `sing-chen.github.io` hosts *every* project of
that GitHub account at one origin. Leaving it on the widget's domain list means any page published
by any repo on that account can mint captcha tokens the production signup endpoint will accept.
Retiring the site's use of the origin does not remove the origin, so this entry is the one piece of
stage 5 that is a small security improvement rather than tidiness.

**Verify:**

```bash
npm run verify:redirects
```

It must now show the Pages URL **rejected** by prod and falling back to the Site URL. This only
passes if stage 4's edit to the expected list and this dashboard change agree — which is the point
of doing them close together.

⚠️ **The assertion moves sides; it does not disappear.** Before stage 5 the gate proves prod
*accepts* `https://sing-chen.github.io/amplifiedthinker/` (verified 2026-08-22). After it, the gate
must prove prod *refuses* it. Deleting the line instead would leave the shared GitHub origin
untested against production auth for ever — and it is a host that keeps existing after the site
stops using it.

**Tick as you go**

- [ ] Supabase prod redirect allowlist — Pages entry removed, others untouched
- [ ] Turnstile `amplifiedthinker-prod` — `sing-chen.github.io` removed from Domains
- [ ] `npm run verify:redirects` run — Pages URL now rejected, `amplifiedthinker.com` still allowed
- [ ] A real sign-in tested end to end on `amplifiedthinker.com` after the widget change

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

- [ ] `pages.yml` deleted
- [ ] `keepalive.yml` confirmed present and still scheduled
- [ ] `BACKLOG.md` deprecation item — Pages half closed, keepalive half left open
- [ ] `BACKLOG.md` retirement entry moved from "decided, not scheduled" to done, with the date

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

Nothing about this is difficult — `output: 'static'` becomes `output: 'server'` or `'hybrid'`, and
`@astrojs/vercel` gets added. What matters is that it is decided and done *before* stages 10–13
rather than discovered halfway through one of them.

**Two things to settle here:**

1. **`server` or `hybrid`.** The 19 hand-written pages in `public/` are copied byte-for-byte and are
   unaffected either way. The question is only whether the handful of `src/pages/` surfaces default
   to prerendered or to on-demand. `hybrid` — prerender by default, opt in per route — keeps
   `/sign-in/`, `/account/` and `/learning/` exactly as fast as they are today and makes each server
   route a deliberate choice.
2. **Whether this is the moment `service_role` gets a home.** [CLAUDE.md](../CLAUDE.md) says it has
   no home at all until a server endpoint exists in Phase 6 — and after this stage, one does. Nothing
   in Phase 6 *needs* it: news reads are public and the personalisation writes are the user's own
   rows under RLS. Say so explicitly here, so a later stage does not reach for it out of convenience.

**Verify:** deploy the adapter change on its own, with no new routes, and confirm the 19 static pages
plus `/sign-in/`, `/account/` and `/learning/` are byte-identical and behave identically. An adapter
swap that changes nothing visible is exactly what this should be.

**Tick as you go**

- [ ] `server` vs `hybrid` decided, with the reason written down
- [ ] `@astrojs/vercel` added, `astro.config.mjs` updated
- [ ] `service_role` question answered in writing — expected answer is "still no home in this phase"
- [ ] Deployed alone and verified: the 19 pages and the three auth surfaces unchanged
- [ ] `npm run verify:published` clean across the adapter change
- [ ] `astro.config.mjs`'s Phase 8 comment corrected — it is wrong as written

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

**Derive the counts from the file.** Expect 23 groups / 73 stories / 1 pinned as of 2026-08-22 — but note the file was rewritten
on 2026-08-23 to repair 39 mojibaked characters, so re-count rather than trusting this; and
have the script report what it found and fail loudly if a title slugifies to a collision.

**Tick as you go**

- [ ] Script written, re-runnable, idempotent on `slug`
- [ ] `legacy_id` computed from original array order, verified against `middleware.js`'s parse
- [ ] Slug collisions fail loudly rather than being auto-suffixed silently
- [ ] Counts reported by the script, not hardcoded
- [ ] Dry-run output eyeballed against `news.json` for three spot-checked stories

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

- [ ] Loaded into dev, counts match
- [ ] `legacy_id` and `slug` uniqueness confirmed by query
- [ ] Exactly one pinned, and it is the right story
- [ ] `anon` read returns published rows and nothing in `draft` or `archived`
- [ ] ⚠️ `verify-rls.mjs` expectation for `news_stories` updated from "empty" to "serves published rows"

**Rollback:** `delete from news_stories` on dev. Free, and this is why prod is not touched yet.

---

## Stage 10 — `/news` and `/news/:slug`, server-rendered · Owner: Claude

Real HTML in the response body. **No user-agent sniffing** — serving different content to Googlebot
than to people is cloaking, and the entire point of rendering on the server is that no such trick is
needed.

Match the existing `news.html` presentation closely enough that the change reads as a URL change
rather than a redesign.

**Verify:**

```bash
curl -s https://<preview>/news/2026-08-19-<slug> | grep -c "<the story's summary text>"
```

⚠️ **Vercel previews are auth-walled and the wall masks 404s** — a nonexistent path returns the same
`302` as a real one. Preview content cannot be verified by script. Capture a production baseline
before merging, and do the real `curl` verification against production at stage 17.

**Tick as you go**

- [ ] `/news` index renders, most-recent first, grouped by date
- [ ] `/news/:slug` renders one story with body text in the HTML source
- [ ] `<link rel="canonical">` correct on both
- [ ] The pinned story surfaces the way it does today
- [ ] `sitemap.xml` includes the new URLs
- [ ] Nav and footer correct — ⚠️ `<footer class="site-footer">`, or it renders unstyled and nothing fails
- [ ] Checked by eye in both themes, desktop and mobile

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

- [ ] Endpoint resolves `legacy_id` → `slug` and issues a **301**, not a 302
- [ ] Spot-checked against three real shared URLs from different dates
- [ ] ⚠️ Reorder test: `sort_order` changed on dev, redirect re-run, **same story**
- [ ] An unknown `story=` id gives a sensible 404 or falls back to `/news`, deliberately chosen
- [ ] `news.html:517`'s share URL updated to emit the new format

---

## Stage 12 — Switch the banner's news source · Owner: Claude

`newsItemsHTML()` in [public/index.html:411](../public/index.html:411) currently does
`fetch('news.json')`. That file is about to stop existing, so this is **forced by the phase, not
optional**.

**Visitors must see no difference.** Same three most-recent stories under 14 days old, same layout,
same behaviour — only the source and the link format change.

⚠️ **`index.html` is a hand-written page in `public/`, served as authored.** Whatever it fetches has
to be reachable by a plain `fetch` from a static page. Decide whether that is the Supabase client it
already loads, or a small JSON endpoint from stage 13 — and prefer the one that does not add a second
way of asking the same question.

**Tick as you go**

- [ ] Banner reads from the DB, `news.json` no longer fetched by `index.html`
- [ ] Same three stories, same order, same 14-day window as before the change
- [ ] Story links use the new `/news/:slug` form
- [ ] Screenshotted before and after — indistinguishable
- [ ] Behaviour with the DB unreachable is graceful: the banner hides, it does not break the homepage

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

- [ ] `/api/search-index.json` returns page, person, primer, plan **and** news entries
- [ ] News entries point at `/news/:slug`, not the old `news.html?story=` form
- [ ] `search.html`'s fetch URL updated — one line
- [ ] Search results verified by hand for a news term, a skill term and a person
- [ ] `public/search-index.json` deleted, and `/add-skill` updated to stop maintaining it

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

- [ ] Favourite, per-user pin and note controls on `/news/:slug`
- [ ] Signed-out state shows the affordance and routes to `/sign-in/?next=…`
- [ ] ⚠️ The `?next=` href verified by **reading the rendered attribute after scrolling**, not by calling the function — this exact defect shipped twice
- [ ] RLS proven: a second account cannot read or write the first account's notes, tested from the browser console
- [ ] `[hidden]` toggling: any new component that sets `display` carries an explicit override, and computed `display` is what gets asserted
- [ ] `why-sign-up.html` — favourites and notes moved off `Soon`
- [ ] Note length limited, and what happens at the limit is decided rather than discovered

---

## Stage 15 — Retire `middleware.js` · Owner: Claude

Its only job was faking meta tags for social scrapers because the real page rendered client-side
after `fetch('news.json')`. Stage 10 makes the content genuinely server-rendered, so there is nothing
left for it to do.

**Retire, not port.** Confirm the social preview is still correct after deletion — the meta tags now
come from the page itself, which is the whole improvement.

**Tick as you go**

- [ ] `middleware.js` deleted from the repo root
- [ ] A story URL checked in a link-preview debugger — title, description and image all present
- [ ] Nothing else in the repo referenced it

---

## Stage 16 — Copy, privacy, and the obsolete command · Owner: Claude

⚠️ **`privacy.html` again, and this time it is a new category of personal data.** Stage 14 stores
free text that a user wrote. The page names every table, every storage key and the legal basis for
each, and it is now wrong until it mentions `user_news` and `notes`. Check the Promptly sibling.

**On the same-commit rule, precisely:** the binding constraint here is the same **merge**, not the
same commit. Nothing in Part B reaches production until stage 17 and the branch lands as one — the
rule exists so a *deployed* site never has code and privacy page disagreeing. So this stage may be
days after stage 14. It may not be after stage 17. See **Pacing** above.

⚠️ **`/add-news` is dead, not stale.** The command is written end-to-end around editing
`public/news.json` and regenerating `search-index.json` positionally. Both files are gone by the end
of this phase. This is the fourth instance of the orphaned-command trap and the first where the fix
is deletion rather than a path update — but news still has to be added somehow, and the admin UI is
Phase 7. **Say explicitly, in the file or in its replacement, how news gets added between this merge
and Phase 7 shipping.** A deleted command and no successor is how a phase silently removes a working
capability.

**Tick as you go**

- [ ] `privacy.html` — `user_news` and `notes` added, with legal basis
- [ ] Promptly sibling checked
- [ ] `terms.html` — user-authored content needs an acceptable-use line where it had none
- [ ] `why-sign-up.html` consistent with what actually shipped
- [ ] `/add-news` deleted or rewritten, **and the interim route for adding news written down**
- [ ] `/add-skill` — the `search-index.json` step removed
- [ ] `public/news.json` and `public/search-index.json` deleted
- [ ] Grep for the promise, not just the feature: any copy stating a limit that stage 14 makes untrue

---

## Stage 17 — Go live · Owner: Human + Claude

**In this order, and the order is the whole point:**

1. Final verification on the preview and on dev
2. **Apply the migration and load the news data to prod** — immediately before the merge. Not after,
   and not "straight after"
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
- [ ] Prod migration applied and news loaded — record the row count observed
- [ ] Merged to `main`
- [ ] `npm run verify:stamp` — production serving the merge commit
- [ ] ⚠️ 301 verified **on production**, against a real previously-shared URL
- [ ] ⚠️ Reorder test re-run on production, same story, order restored
- [ ] `npm run verify:rls` green with its updated expectation
- [ ] Homepage banner checked by eye on production

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
