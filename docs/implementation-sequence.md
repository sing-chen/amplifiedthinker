# Implementation sequence

**Status:** In progress — Phases 0, 1, 2 and 3 live. Phase 4 (Email) is next ·
**Last updated:** 2026-08-17

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
| 2 — Astro shell | ✅ **Done — live** | 🟡 Silent | 🔵 Visible | No | 0 |
| 3 — Supabase schema + RLS | ✅ **Done — live** | ⚪ None | ⚪ None | No | 0 |
| 4 — Email | ☐ Not started | ⚪ None | ⚪ None | No | 3 |
| 5 — Auth + progress sync | ☐ Not started | 🟢 **New** + 🔵 regression | 🟢 New | **Yes — the big one** | 1, 3, 4 |
| 6 — News into the DB | ☐ Not started | 🔵 Visible + 🟢 New | 🟡 Silent | **Yes** | 2, 3, 5 |
| 7 — Admin portal + banner | ☐ Not started | ⚪ None | 🟢 **New** | No | 6 |
| 8 — Blog | ☐ Not started | 🟢 **New** | 🟢 New | **Yes** | 7 |
| 9 — Dashboards | ☐ Not started | 🟢 **New** | ⚪ None | **Yes** | 5 |

**Phases 0–4 are entirely invisible to visitors** — roughly half the work, shippable to production
without a single announcement. That is deliberate: it front-loads risk into changes nobody sees.

---

## Cross-cutting constraint: two production origins

Phase 0 established that the site has **two supported production origins**, not one:

| Origin | Runs code? |
|---|---|
| `amplifiedthinker.com` (Vercel) | Yes — server rendering and `/api/` endpoints |
| `sing-chen.github.io/amplifiedthinker` (Pages) | **No** — static files only |

The GitHub origin exists because some corporate networks block the custom domain under
newly-registered-domain policies. Those users have no alternative route, so the origin is
load-bearing rather than legacy.

**The consequence for every phase from 6 onward:** anything requiring a server is unavailable to that
audience. Client-side features carry over fine — auth, progress sync, favourites, pins, notes, and
client-rendered dashboards all work on static hosting because Supabase JS runs in the browser. What
cannot: the server-rendered blog (8), the admin portal (7 — no loss, it is admin-only), `/api/`
endpoints and legacy-URL 301s (6), and `middleware.js` social previews.

Where a feature matters to that audience, prefer a client-side or prerendered implementation over a
server-rendered one. Where it does not, note the gap rather than silently shipping a broken page.
Full capability matrix in [dev-workflow.md](dev-workflow.md); the constraint may lift around
October 2026 as NRD filters age out, so avoid designs that assume it is permanent.

---

## Progress log

### Phase 3 — done, merged, live on both origins (2026-08-17)

Merged as `2173242`. **The 16 existing pages are untouched: 66/66 byte-identical against the git
blobs on `amplifiedthinker.com` *and* `sing-chen.github.io/amplifiedthinker`, 0 differing, 0 missing
on either** — the same gate Phase 2 used, re-run as a regression check. The only site-visible
addition is `/auth-test/`, a throwaway scaffold marked for deletion at the end of Phase 5.

**Database verified independently of the merge**, which is the useful property: 9 tables, RLS enabled
in the same block as each `create table`, 17 policies, the signed-out gate at 22/22, and the admin
gate exercised in both directions signed in. None of that depended on any deploy.

| Built | |
|---|---|
| `supabase/migrations/20260817120000_initial_schema.sql` | All 9 tables, RLS enabled in the same block as each `create table`, every policy, `is_admin()`, the `is_admin` guard trigger, a signup trigger, and the grant narrowing. One transaction. |
| `supabase/rollback/…_down.sql` | The hand-written down-path. A Vercel rollback restores code, never schema. |
| `scripts/verify-rls.mjs` (`npm run verify:rls`) | The signed-out gate, over plain fetch against PostgREST — no client library between the assertion and the database. |
| `src/pages/auth-test.astro` | The signed-in half. Throwaway; delete at the end of Phase 5. |
| `supabase/README.md` | Apply, roll back, verify, and the dashboard settings SQL cannot reach. |

| Done on the day | |
|---|---|
| Project `spehmrgmcdenqdftkyrt` created, EU | One project. The dev/prod split stays a Phase 5 activity. *Automatically expose new tables* off and *Enable automatic RLS* on, both verified afterwards by creating a probe table and asking what it inherited. |
| Both migrations applied | The first failed once on ordering (finding 9) and rolled back whole. |
| Redirect allowlist set, all four entries | Phase 0's last open activity, closed. |
| **Signed-out gate: 22/22** | The phase's written "done when". |
| **Signed-in checks: 8 PASS non-admin, 9 PASS admin** | The admin gate exercised in both directions, which no automated check could have done. |
| Preview origin verified | Sign-in plus a password-reset redirect landing back on the branch URL — the wildcard entry proven by behaviour rather than by reading the pattern. |

| Merged and verified | |
|---|---|
| Merged to `main`, live on both origins | 66/66 byte-identical on each. |
| Both production origins exercised | Connect, sign in, and the full check suite passing on `amplifiedthinker.com` and `sing-chen.github.io/amplifiedthinker`. |
| **All four allowlist entries verified** | Two by real email links (localhost, preview), two by direct probe of `/auth/v1/verify` once the mailer rate limit bit — with a deliberately unlisted control confirming the probe discriminates. See finding 14. |

**One deploy failed and it was not ours.** The Pages run for `d09475b` failed at
`actions/deploy-pages@v4` with `503 … is githubstatus.com reporting a Pages outage?`, plus a `429`
fetching the action itself. The identical workflow had succeeded three minutes earlier. Impact was
nil: that commit touched only `docs/dev-workflow.md`, which sits outside `public/` and `src/`, so the
build output was byte-identical to what had already published. Worth checking *what a failed deploy
would have shipped* before treating a red X as an incident.

**Findings from building against the real code rather than the plan:**

1. **The data model's localStorage example is one field stale, and the schema absorbed it for
   free.** `supabase-integration-plan.md` documents plan state as
   `{quizSelected, quizRevealed, quizOrder, habitOpen}`. The live page also saves `cardsOpen`,
   added by Phase 1's accordion fix *after* the model was written. Because `state` is `jsonb`,
   this cost nothing — the column that was chosen for flexibility had already been vindicated
   before it existed. Recorded rather than corrected upstream, because the drift is the point.
2. **`position` and `visited` are not the same type across content types.** `plan.html` stores
   section-id *strings*; `primer.html` stores slide-index *numbers* (`new Set([0])`). Chosen:
   `text` / `text[]`, with the coercion left in each page's mapping layer — exactly where
   `progress.js` already draws that line ("each page still owns the mapping between its own DOM
   and the stored shape"). The alternative, two columns or a wider type, would have moved
   page-specific knowledge into the schema.
3. **`force row level security` was written, then removed — it would have locked the one
   documented way to grant admin.** FORCE applies RLS to the table owner, which is the role the
   dashboard SQL editor runs as, and the `is_admin` guard trigger deliberately leaves a hole for
   exactly that connection. Plain `enable` is correct here; the near-miss is noted in the
   migration so nobody "hardens" it back.
4. **Grants are the second layer, and the more reliable one.** Supabase grants `anon` broadly on
   `public` by default, so a table whose policy is subtly wrong is protected only by RLS
   defaulting to deny. The migration revokes and re-grants explicitly: `anon` ends with no
   INSERT/UPDATE/DELETE anywhere and no SELECT at all on the four user-owned tables. The plan
   called for this in one line ("restrict what `anon` is granted"); it is worth the section it got.
5. **"At most one pinned story" made structural.** The data model describes the editorial pin as
   at most one site-wide. `news.json` was checked — exactly one — so it became a partial unique
   index rather than a convention Phase 7's admin UI would have to remember.
6. **The Vercel scope is `singchen`**, recovered from preview URLs in
   `.claude/settings.local.json`. `dev-workflow.md` carried it as `<your-scope>`; the allowlist
   line is now concrete.
7. **`is:inline` held.** The new page builds and, checked in a browser at both `/auth-test` and
   `/auth-test/`, `nav.js` resolves links correctly from either. No `type="module"` in the
   output. Verified rather than assumed, since this is the trap Phase 2 recorded.
8. **The test page was rewritten to take credentials at runtime, and that is a small version of a
   standing constraint.** It first read `PUBLIC_` env vars at build time — which works locally and
   is silently useless everywhere else, because `.github/workflows/pages.yml` passes only
   `ASTRO_BASE` and Vercel had no variables set. Verifying the deployed origins would have needed
   the same two values configured in **three** build configs, for a page marked for deletion at the
   end of Phase 5. It now takes them in two fields backed by `localStorage`, so it runs unchanged on
   all four origins with no build config anywhere, refuses a `service_role` or `sb_secret_` key
   (which would bypass RLS and turn every check green while proving nothing), and is inert for a
   stray visitor after merge. **The general form is worth carrying: anything that must work on both
   production origins should decide at runtime, because only one of them has a build you control.**
   That is the same conclusion `supabase-client.js`'s hostname switch reaches from the other
   direction.

9. **The migration failed on its first real run, on ordering — and the failure mode is worth
   knowing.** `is_admin()` sat in a "helper functions" section at the top, 40 lines above the
   `profiles` table it reads, which errored with `42P01: relation "public.profiles" does not
   exist`. The cause is that `check_function_bodies` is on by default and a **`LANGUAGE sql`**
   body is fully parsed at `create function` time, so every object it names must already exist.
   The instructive part is the contrast sitting ten lines below it: `handle_new_user()` names the
   *same table* and would have been perfectly happy in that position, because **`LANGUAGE plpgsql`**
   bodies get a syntax check only, never an object-existence check. Same reference, same schema,
   different language, different rule. Fixed by moving `is_admin()` to immediately after
   `profiles`, with the reason recorded inline so it does not get tidied back. An audit of every
   other definition-versus-reference pair in the file came back clean, and `is_admin()` was the
   only `LANGUAGE sql` function in it — so this was a single-instance bug, not a pattern.

   **Cost of the transaction design: zero.** The failure rolled back whole, the database was
   untouched, and the retry was a re-paste. That is the property the one-transaction shape was
   chosen for, tested by accident on the first attempt.

10. **The Supabase Advisor found 9 warnings the migration should not have left, and one of them was
    live rather than theoretical.** Eight were mine: `set_updated_at` missing the pinned
    `search_path` the other three functions had, and four `SECURITY DEFINER` functions granted
    `EXECUTE` to `anon` and `authenticated`. Cleared in a **second migration**
    (`20260817140000_harden_function_grants.sql`) rather than by editing the first — an applied
    migration is history, and editing it means the file stops describing the database that exists.
    The "all tables in one migration" principle is intact; this one creates no tables.

    **Testing the warnings rather than trusting them changed two of the four verdicts.** Probing
    each function over RPC before applying the fix:

    | Function | Returns | Probe | Reality |
    |---|---|---|---|
    | `handle_new_user()` | `trigger` | 404 | **Never reachable.** PostgREST does not expose functions returning `trigger`, whoever holds `EXECUTE`. The Advisor's "callable via `/rest/v1/rpc/…`" was not true. |
    | `profiles_guard_privileged_columns()` | `trigger` | 404 | Same. |
    | `is_admin()` | `boolean` | 200 `false` | Reachable, and harmless — it filters on `auth.uid()`, null for anon, so it could only ever answer `false`. Revoked as least privilege, not as a fix. |
    | `rls_auto_enable()` | `event_trigger` | **400** | **Genuinely reachable** — PostgREST resolved it and got as far as failing to serialise the return type. The one I was least inclined to touch, being Supabase's own, was the only live exposure. |

    The asymmetry is the part worth keeping: a `trigger` return type is invisible to PostgREST, an
    `event_trigger` return type is not. Not predictable from the warning text, and it is the
    difference between a theoretical finding and a real one.

11. **`is_admin()`'s gate assertion got stronger by accident.** It used to assert the function
    *returns false* for an anonymous caller. Once `anon` lost `EXECUTE`, that assertion had to
    become *cannot call it at all* — which is what should have been asserted from the start. The
    weaker version proved the answer was harmless; the stronger one proves the door is shut.
    `authenticated` keeps `EXECUTE`, because RLS policy expressions are evaluated with the querying
    role's privileges, so a role must hold `EXECUTE` on any function its policies call.

    Gate is now **22/22**, up from 19, with the three added checks all covering the RPC surface.

12. **The last Advisor warning was tested rather than argued, and the test found something bigger
    than the warning.** The claim — that `authenticated` needs `EXECUTE` on `is_admin()` because RLS
    policy expressions are evaluated with the querying role's privileges — was asserted three times
    from documentation before anyone ran it. Revoking the grant with a live session confirmed it
    immediately, so the warning is permanent and the note in `supabase/README.md` stands.

    **But the failure was not where it was predicted, and that is the finding.** The expectation was
    that admin *writes* would break. What actually broke was reading your **own** profile row:

    ```
    FAIL  profiles: own row exists    permission denied for function is_admin
    FAIL  profiles: select * ...      permission denied for function is_admin
    ```

    `profiles` carries two permissive SELECT policies, and permissive policies are **OR-ed** — so
    evaluating the set evaluates the admin one too, for every caller. A function the role cannot
    execute therefore does not disable the admin branch, it **errors the whole read for everyone**.

    **Carry this into Phase 7:** adding an admin policy to an existing table can break ordinary
    users' access to it if the function grants are wrong, and the symptom is a permission error on a
    table whose own policies read perfectly.

13. **The check written to detect this could not have detected it — it passed either way.** Check 7
    asserted only `Boolean(error)`, and "permission denied for function is_admin" carries error code
    `42501`, exactly as an RLS refusal does. So the check designed as the experiment's signal was
    blind to the experiment, and the answer arrived from the three checks it had been assumed would
    be uninformative. Now asserts *why* the write was refused (`row-level security` in the message),
    not merely that it was.

    A second cascade in the same run: check 1's failed read left `is_admin` null, which the page
    read as `false`, so check 3 confidently reported `tried false -> true` about a value it never
    obtained. The suite now aborts when it cannot read its own profile rather than emitting a board
    of derived nonsense.

    **The general lesson, and it applies to every check in this phase:** a test that passes on *any*
    error is not testing what it claims. Both of these were written to fail closed and did — while
    saying nothing true.

14. **The allowlist can be tested without sending any email, and finding that out late cost the
    phase its whole mail allowance.** Verification was designed around real emails: sign up on one
    origin, then a password-reset link on each of the others. That works, and it proved localhost and
    the preview branch — but the built-in mailer allows roughly two messages an hour, and the third
    request silently did nothing, with the last two origins still unverified.

    `/auth/v1/verify` decides its redirect **before** validating the token, so an obviously invalid
    token still exercises the allowlist. Allowlisted origins are honoured; unlisted ones are silently
    swapped for the Site URL — which is the exact failure mode the whole exercise exists to catch, now
    reproducible on demand instead of by waiting on an inbox.

    **The control is what makes it evidence.** Probing a deliberately unlisted origin in the same
    batch returned the Site URL, so "honoured" means something rather than being the endpoint's
    default. Without that control the four passes would have proved nothing.

    **The general shape, which is the part worth carrying:** the expensive, rate-limited, human-in-
    the-loop test was verifying two things at once — that mail works, and that this origin matches.
    Only the first needs an inbox, and only once. Once separated, the per-origin half became a
    scriptable probe that runs in two seconds. Look for that split before building a slow verification
    loop, not after exhausting it.

**One assertion in the gate is time-limited, and the script says so.** "Every table returns zero
rows when signed out" is true for the content tables only while they are empty — from Phase 6,
`news_stories` returns published rows to anonymous callers by design. The durable invariant is the
other half: `profiles`, `skill_progress`, `user_news` and `notes` are refused outright, because
`anon` holds no grant on them at all. The script distinguishes the two so a future green board
still means something.

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

### Phase 2 — done, merged, live on both origins (2026-08-17)

Merged as `a68a6a3`. **Verified in production against the git blobs: all 66 tracked files in `public/`
byte-identical on `amplifiedthinker.com` *and* `sing-chen.github.io/amplifiedthinker` — 0 mismatched
on either.** The generated Astro page carries `/amplifiedthinker/` asset prefixes on Pages and bare `/`
on Vercel, with canonical pointing at the custom domain from both.

**`middleware.js` survived the framework build**, which was the phase's biggest unknown. Root-level
Vercel Edge Middleware still fires under an Astro build, and all three cases are correct:

| Request | Result |
|---|---|
| LinkedInBot UA + `?story=` | ✅ share shell, correct title |
| Normal browser UA | ✅ real news page |
| Bot UA, no `story` param | ✅ real news page |

**No Pages downtime.** Pages kept serving its previous deployment through the merge and swapped when
the Actions run finished — the earlier probe showing the old build was CDN lag, not an outage. The
legacy `pages build and deployment` correctly stopped firing once the source moved to Actions.

**Two process findings worth carrying:**

1. **`workflow_dispatch` needs the workflow file on the default branch** before GitHub will show a
   "Run workflow" button, so the intended verify-before-merge sequence was impossible until the file
   landed on `main` (`9c01355`, pushed with `[skip ci]` so the run it would otherwise trigger — and
   fail, since `main` had no `package.json` yet — never started).
2. **The `github-pages` environment blocks non-default branches from deploying.** The dispatch against
   the branch failed at `deploy` while `build` passed, which still proved `npm ci`, the Astro build and
   the artifact upload on CI. The remaining unknown — serving under a subpath — was verified locally by
   staging the build under a directory named `amplifiedthinker`, which needed no rule changes.

**Near-miss worth recording:** the first production verification compared served bytes against the
*working tree* and reported 25 of 28 text files mismatching, with all 3 binaries passing. That pattern
is a line-ending artifact — `core.autocrlf=true` means the working tree is CRLF while every origin
serves the LF blob. Comparing against `git show HEAD:<path>` gave 66/66. Phase 1's line-ending lesson
resurfacing in a new disguise, and it briefly looked like a disaster.

### Phase 2 — build notes (superseded by the entry above)

Branch `feat/astro-shell`, commit `b03e6f2`. Astro 7.2.2, `output: 'static'`, no adapter. All 16 pages
moved into `public/` as pure renames — git recorded every one at 100% similarity, zero content lines
changed.

**The gate passed, and more convincingly than planned.** The sequence said "diff all 16 preview pages
against live". Instead every one of the **66 files in `public/` was compared byte-for-byte against
`dist/`: 66 identical, 0 differing, 0 missing**, with the only addition being the new Astro page. That
covers binaries and JSON too, not just the 16 HTML pages, and it runs in seconds rather than by eye.
Re-verified under both build variants. The skill pages still load `progress.js`, derive the correct
storage key, and retain all 38 inline `onclick` handlers — the specific thing Astro would have broken
had those pages been converted rather than copied.

**Design decisions worth keeping visible:**

- **Static output, no adapter.** Both origins consume one identical build, which is what keeps the
  GitHub origin cheap. The SSR adapter waits for Phase 8, where rendering on request is the actual
  requirement rather than a default.
- **`base` is env-driven**, because Vercel serves from `/` and Pages from `/amplifiedthinker/`.
  Layouts read `import.meta.env.BASE_URL`; canonical strips the prefix so the Pages build still points
  at `amplifiedthinker.com`, matching what the existing pages do.
- **`_originals/` moved out of `images/`.** Inside `public/`, Astro would have published 6 MB of
  full-resolution sources verbatim on any local build.

**Two blockers, neither of them code:**

1. ~~npm cannot install in the Google Drive working copy~~ — **resolved.** `EBADF` after 2m32s,
   twice, against 13s on local disk. Deployment was never affected (Vercel and Actions build on Linux
   from a clean checkout), but local development was fully blocked — which removes the fastest
   feedback loop exactly when the project gains a build that can fail. The working copy moved to
   `C:\dev\amplifiedthinker`, verified with `npm ci` in 7s, a clean build, the 66/66 gate, and
   `npm run dev` serving both old and new pages. `_originals/` and `.claude/settings.local.json` were
   gitignored and existed only in the Drive copy, so both were carried over by hand.
   See [dev-workflow.md](dev-workflow.md).
2. **GitHub Pages needs its source switched to "GitHub Actions"** before this merges, or the second
   production origin 404s the moment the repo root loses `index.html`.

**Unverifiable until production: `middleware.js`.** Vercel's preview wall masks 404s — a nonexistent
path returns the same `302` as a real one — so nothing about preview *content* can be checked by
script, and a bot-UA request cannot reach the middleware at all. A production baseline was captured
before merging, to be re-run immediately after with rollback ready.

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

**The finding — and it reshapes the architecture: there are two supported production origins.**
`sing-chen.github.io/amplifiedthinker` is serving the full site, rebuilt from `main` — it already
carries the Phase 1 `progress.js`. It had been assumed to be a stale artifact. It is not:

> Some corporate networks block `amplifiedthinker.com` under newly-registered-domain policies. Those
> users have been given the GitHub URL and can reach it. **Retiring Pages would cut off an audience
> segment with no other route in.**

That single fact changes three things this plan had wrong:

1. **`about.html`'s hostname sniff was live behaviour, not dead code** — and it was firing on Vercel
   previews and localhost too, so every preview of that page showed the LinkedIn-only contact block.
   A preview lying about production, in the phase whose whole purpose is making previews trustworthy.
   **Removed entirely rather than corrected:** one contact block, email shown on every origin. The
   hidden-email behaviour turned out to be exactly backwards, since NRD-blocked users often cannot
   reach the custom domain and were the segment least able to get in touch any other way. Bonus: with
   no runtime check to un-hide it, the block now renders with JavaScript disabled.
2. **Phase 2 grows.** Moving the 16 pages into `public/` leaves Pages with no `index.html` at the repo
   root, so the GitHub origin breaks at merge. It needs a GitHub Actions workflow building Astro in
   static mode — two build targets from one repo. Recorded in the Phase 2 table below.
3. **Phase 5's environment switch was designed backwards.** `isProd = hostname is amplifiedthinker.com`
   would classify the Pages origin as non-production, so after the dev/prod database split every
   NRD-blocked user would read and write the *dev* database — progress appearing to save, then
   missing. The rule is now to blocklist non-production (previews, localhost) rather than allowlist
   production. See [dev-workflow.md](dev-workflow.md).

Capability differs by origin: Pages serves files but runs no code, so client-side features (auth,
progress sync, favourites, notes) work there while server-rendered surfaces (blog, admin, `/api/`,
301 redirects, `middleware.js`) cannot. Full matrix in [dev-workflow.md](dev-workflow.md).

**Worth carrying forward:** Phase 1's lesson was that automated checks miss visual defects. Phase 0's
is the mirror image, twice over. First, *"we don't use that any more"* is a claim to test with `curl`,
not accept — the appendix had hedged it as "if a second origin is still live" for weeks. Second, once
the origin was confirmed live, asking *why* it was live mattered more than confirming *that* it was:
the answer turned a tidy-up task into an architectural constraint, and caught a data-corruption bug
five phases before it could bite.

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
| Audit which origins actually serve the site | Every live origin is an auth surface and a preview-fidelity risk. **✅ Found the GitHub Pages origin live *and load-bearing* — it serves users whose networks block the custom domain. `about.html` fixed so previews match production; Phase 2 and Phase 5 both re-scoped as a result.** |

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

## Phase 2 — Astro shell ✅ DONE

**Impact:** 🟡 Silent (visitor) · 🔵 Visible (admin) · **Shipped 2026-08-17** — outcome in the Progress log above.

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
| Add a GitHub Actions workflow building Astro to static, published to Pages | **Added by Phase 0's finding, and non-optional.** Moving the 16 pages into `public/` leaves Pages with no `index.html` at the repo root, so the GitHub origin 404s at merge — cutting off users whose networks block the custom domain. Two build targets from one repo: Vercel gets the dynamic build, Pages a prerendered snapshot. |
| Verify all 16 pages on **both** origins, not just the preview | The gate now has two halves. A Vercel-only check would have passed while the GitHub origin was dark. |

**Done when:** all 16 pages are byte-identical on the preview URL **and still served by the GitHub
Pages origin**, and a new blank Astro page renders with correct nav and styling.

**Rollback:** Vercel retains previous deployments — promote the last good one from the dashboard.
Instant, and no git revert needed first.

---

## Phase 3 — Supabase schema and RLS ✅ DONE

**Impact:** ⚪ None · ⚪ None — no site code touched beyond one throwaway test page.

**Why RLS from the very first migration:** with no server in front of the database, RLS *is* the
security model. Tables created open and locked down later are how data leaks, because there is no
natural moment that forces you back to do it.

| Activity | What it does, and why |
|---|---|
| **Create the Supabase project** | **✅ Done** — `spehmrgmcdenqdftkyrt`, EU, one project. The dev/prod split stays a Phase 5 activity, because there is no real user data to protect until then. |
| Create all tables in one migration | The whole shape is visible at once, so relationships get designed rather than accreted. **✅ Applied** — 9 tables in one transaction. A second migration follows it, creating no tables, that tightens function grants. |
| Enable RLS and write policies before inserting any row | Removes any window where data exists unprotected. **✅ Verified** — `enable row level security` sits in the same block as each `create table`, and `pg_tables` confirms all 9 `true` with 17 policies. Grants to `anon` are revoked and re-granted explicitly on top. |
| Add `is_admin()` and the profile-column trigger | Creates the admin gate, and ensures users cannot grant it to themselves. **✅ Proven in both directions** — a non-admin is refused, an admin is permitted, and an admin cannot demote themselves either, since the trigger checks for any change rather than for escalation. |
| Add the Supabase redirect allowlist, including the preview wildcard | **Deferred here from Phase 0**, which could not do it with no project to configure. **✅ Set and behaviourally verified** on localhost and the preview branch; the two production origins follow the merge. |
| Prove auth end to end on one throwaway page | Validates the whole chain — signup, session, policy enforcement — before it touches a real page. **✅ Done** — and it earned its place: it caught two defects in its own checks that a green board had been hiding (findings 12 and 13). |

**Done when:** using only the anon key, every table returns zero rows when signed out — verified
by direct query, not by the UI hiding things. `npm run verify:rls` is that direct query.

**Read the gate precisely.** It has two passing states and only one of them is permanent: the four
user-owned tables are *refused* (`anon` holds no grant), while the five content tables merely
return `[]` *because they are empty*. From Phase 6 the latter legitimately serve published rows.
The script separates them so the assertion does not quietly become meaningless.

**Rollback:** `supabase/rollback/…_down.sql`, and it is genuinely cheap only during this phase —
no row is inserted anywhere in Phase 3. From Phase 5 it destroys real user data. Note that a
Vercel rollback restores *code*, never schema.

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
