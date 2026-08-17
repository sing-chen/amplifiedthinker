# Dev workflow: branches, previews, and environments

**Status:** In use — Phase 0 complete except the Supabase allowlist · **Last updated:** 2026-08-17

The Supabase and environment-variable sections are still untested, since no Supabase project
exists yet. Everything about branches, previews and merging has now been exercised for real.

Companion documents:

- [supabase-integration-plan.md](supabase-integration-plan.md) — *what* gets built: architecture, data model, decisions.
- [implementation-sequence.md](implementation-sequence.md) — *in what order*, and why.

This one covers *how work happens* while building it.

---

## The principle

`main` stays deployable to production at every moment. All work happens on branches, each of
which gets its own live URL to test against before anything merges.

This matters more than usual here because of Phase 2. Today the site cannot fail to deploy —
there is no build step, so a bad commit produces a broken page but never a broken *deployment*.
Once Astro is introduced, a build error blocks everything, including the 16 existing pages. The
branch workflow is what keeps that risk off production.

---

## Branch strategy

**One branch per phase, merged when that phase verifies.** Each phase in the plan is
independently valuable and independently testable, which makes it a natural branch boundary.
Long-lived integration branches drift from `main` and turn merges into archaeology.

```
main                          ← always deployable, always what production runs
 ├─ feat/progress-module           (Phase 1)
 ├─ feat/astro-shell               (Phase 2)
 ├─ feat/supabase-schema           (Phase 3)
 ├─ feat/auth-progress-sync        (Phase 5)
 └─ …
```

**Keep branch names short and slash-free where possible.** Vercel builds the preview URL from
the branch name, converting `/` to `-`, so `feat/astro-shell` becomes `…-git-feat-astro-shell-…`.
Long names get truncated at the DNS label limit, which makes the URL harder to predict and to
match against the Supabase allowlist.

---

## Vercel

Preview deployments are **on by default** — every branch push already gets its own live URL with
no configuration. Four things to check or change:

### 1. Confirm the production branch

Settings → Git → Production Branch should be `main`. Everything else assumes only `main` reaches
production.

**Verified empirically in Phase 0**, which is better evidence than reading the setting: after Phase 1
merged, `https://amplifiedthinker.com/progress.js` returned 200 and the plan pages carried the halo
CSS from `11c6be1` — both `main`-only commits. Pushes to `main` reach production, and the two feature
branches produced `…-git-<branch>-…` preview URLs rather than touching it.

### 2. Use the stable branch alias, not the per-commit URL

Each branch deployment gets two URLs:

```
amplifiedthinker-<commit-hash>-<scope>.vercel.app     ← changes every push
amplifiedthinker-git-<branch>-<scope>.vercel.app      ← stable per branch
```

Always use the **stable alias**. The per-commit URL can't be allowlisted in Supabase because it
changes on every push.

### 3. Put build config in `vercel.json`, not the dashboard

**This is the one that makes Phase 2 safe.**

Dashboard build settings are project-wide and apply to production the moment they are saved. A
`vercel.json` committed on a branch affects only that branch's deployments. So the Astro build
can be proven on a preview while `main` continues deploying as plain static files, and the
cutover happens at merge — reviewable, and revertable with `git revert`.

Never change the Framework Preset in the dashboard to accomplish something a branch file can do.

### 4. Previews are behind Vercel Authentication by default

Preview URLs return `302 → vercel.com/sso-api` for anyone not signed in to the Vercel account.
In a normal browser session this is invisible — you are already signed in, so the preview just
works. It does mean:

- Preview links cannot be shared with anyone outside the Vercel account.
- Automated checks (curl, scripted browsers, an agent verifying a deploy) get the login wall
  rather than the page, so verification on previews has to be done by hand.

Leave it on unless that becomes a real cost. If it does, Settings → Deployment Protection offers
**Protection Bypass for Automation**, which issues a secret to append as
`?x-vercel-protection-bypass=<secret>` — preferable to disabling protection outright, which makes
every unfinished branch publicly reachable by URL.

Production is unaffected either way.

### 5. Scope environment variables

Settings → Environment Variables. Each variable has Production / Preview / Development
checkboxes. Preview needs its own values so branch testing never writes to production data.

---

## Supabase

### Redirect allowlist — the one that silently breaks previews

Auth → URL Configuration:

```
Site URL:       https://amplifiedthinker.com

Redirect URLs:  https://amplifiedthinker.com/**
                https://amplifiedthinker-git-*-<your-scope>.vercel.app/**
                http://localhost:4321/**
```

Without the wildcard line, sign-in works in production and fails on every preview branch with no
useful error. This is the failure mode the original brief flagged as a possibility; the branch
workflow makes it a certainty rather than a risk.

Add `https://sing-chen.github.io/amplifiedthinker/**` **only if the Pages mirror is kept** — see
"The GitHub Pages mirror" below. Retiring it is the cheaper option precisely because it removes an
allowlist entry rather than adding one.

⚠️ **This is Phase 0's one blocked activity.** There is no Supabase project yet, so there is nothing
to configure. It moves into Phase 3, where the project gets created — recorded here so the values
are settled in advance rather than invented under pressure.

### One Supabase project until Phase 5, two after

**You do not need a separate dev project yet.** Until Phase 5 puts auth into production there is
no real user data to protect, so one project is simpler and avoids schema-sync work on every
phase. Split into dev and prod projects *at* Phase 5, when real progress data starts existing —
not before. Paying that cost up front buys nothing.

### How config varies per environment with no build step

`supabase-client.js` lives in `public/` and is loaded by static pages that cannot receive
build-time values. Switch on hostname — the same pattern `about.html:239` already uses:

```js
var isProd = /(^|\.)amplifiedthinker\.com$/.test(window.location.hostname);
```

The anon key is public by design and RLS is the actual security boundary, so both keys sitting
in source is not a leak, even though it looks like one. The `service_role` key is a different
matter entirely and must never appear in any file under `public/`.

---

## GitHub

### The GitHub Pages mirror — a second live copy of the site

`https://sing-chen.github.io/amplifiedthinker/` **is live and actively rebuilding from `main`.**
Confirmed in Phase 0: it serves the full site and already carries the Phase 1 `progress.js`. This
was assumed dead and is not.

It is harmless today — every page's `<link rel="canonical">` and `robots.txt` sitemap already point
at `amplifiedthinker.com`, so search engines are told which origin is authoritative. It stops being
harmless later:

- **Phase 2 breaks it.** Once the 16 pages move into `public/`, Pages serves the repo root and finds
  no `index.html`. The mirror would start 404ing with no warning and no owner.
- **Phase 5 has to account for it.** A second origin is a second Supabase redirect-allowlist entry
  and a second surface where a session can be established. Fewer origins is strictly safer.
- **`middleware.js` never ran there**, so shared news links from the mirror have always had broken
  social previews.

**Recommendation: retire it** (Settings → Pages → Source: None). One origin, one place auth can
happen, and nothing silently rotting after Phase 2. If it is kept instead, it must be added to the
Supabase redirect allowlist in Phase 3 and the Astro config given a Pages-compatible output path.

### Branch protection — check `deploy.bat` before enabling it

**Nothing is required.** Branch protection on `main` (Settings → Branches) sounds like free safety
but conflicts with how content updates ship here:

⚠️ **`deploy.bat` runs `git add . && git commit && git push` directly to whatever branch is checked
out.** Turning on *Require a pull request before merging* makes that fail on `main`, so every typo
fix becomes a PR. On a solo repo, the protection buys little — there is no one else to guard against —
and the cost lands on the workflow used most often.

**Recommendation: leave `main` unprotected**, and rely on the branch-per-phase habit plus explicit
git commands for feature work. Revisit if anyone else ever gets push access.

### `deploy.bat` commits everything

Separately from the branch question: `deploy.bat` stages with `git add .`, so it commits
*everything* in the working tree — half-finished work, local scratch files, anything untracked. It
pushes whatever branch is checked out, so it is branch-*safe*, just not selective. Use explicit git
commands while developing and keep `deploy.bat` for content updates on `main`.

---

## VS Code

No extension or configuration is required; the built-in Git panel handles branch switching. Two
things change during the work:

- `.claude/launch.json` moves from `python -m http.server 8139` to `npm run dev` in Phase 2.
- Optional: the GitHub Pull Requests extension, if you want review flow in-editor rather than in
  the browser.

---

## Local dev, per phase

| Phase | Command | Why |
|---|---|---|
| 1 | `python -m http.server 8139` | Unchanged — no Astro yet. |
| 2+ | `npm run dev` | Astro's dev server, port 4321. |
| 6+ | `vercel dev` | Only when testing `/api/` endpoints, which `npm run dev` cannot fully run. |

---

## Day to day

Starting a phase:

```
git checkout main
git pull
git checkout -b feat/astro-shell
```

Working: commit normally, push when you want a preview URL.

```
git add <specific files>
git commit -m "..."
git push -u origin feat/astro-shell
```

Vercel builds automatically. Open the stable alias, run that phase's verification steps from the
plan, then merge:

```
git checkout main
git merge feat/astro-shell
git push
```

Production deploys on that push.

---

## When production breaks

Vercel retains previous deployments. Deployments → find the last good one → Promote to
Production. This is instant and does not require a git revert first — fix forward afterwards at
your own pace.

For anything schema-related, note that a Vercel rollback restores *code*, not database state.
Migrations need their own down-path, which matters from Phase 3 onward.
