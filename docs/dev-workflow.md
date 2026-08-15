# Dev workflow: branches, previews, and environments

**Status:** Agreed, not yet set up · **Date:** 2026-08-15

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

### 4. Scope environment variables

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

**Nothing is required.** Optionally, add branch protection on `main` (Settings → Branches) to
block accidental direct pushes.

⚠️ **`deploy.bat` runs `git add . && git commit && git push`.** It pushes whatever branch is
checked out, so it is branch-safe — but it commits *everything* indiscriminately, including
half-finished work and any local scratch files. Use explicit git commands while developing and
keep `deploy.bat` for content updates on `main`.

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
