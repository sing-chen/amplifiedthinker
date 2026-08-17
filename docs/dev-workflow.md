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
                https://sing-chen.github.io/amplifiedthinker/**
                https://amplifiedthinker-git-*-<your-scope>.vercel.app/**
                http://localhost:4321/**
```

Without the wildcard line, sign-in works in production and fails on every preview branch with no
useful error. This is the failure mode the original brief flagged as a possibility; the branch
workflow makes it a certainty rather than a risk.

`https://sing-chen.github.io/amplifiedthinker/**` is **required, not optional** — see "The GitHub
Pages origin" below. Users blocked from the custom domain by corporate NRD policies reach the site
only there, so omitting it means sign-in fails for the people with no fallback.

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
build-time values. Switch on hostname — but **switch on what is *not* production**, not on the
custom domain:

```js
// Production is every real origin, and there are two of them. Non-production is the short,
// known list: Vercel previews and localhost.
var isPreview = /\.vercel\.app$/.test(window.location.hostname) ||
                /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
var isProd = !isPreview;
```

⚠️ **Do not write `isProd = /amplifiedthinker\.com$/.test(hostname)`.** It looks correct and is the
shape `about.html` originally used, but it classifies the Pages origin as non-production — so once
Phase 5 splits dev and prod projects, every NRD-blocked user would silently read and write the *dev*
database. Their progress would appear to save and then be missing from the real site. Allowlisting
production means every new production origin is a bug waiting to happen; blocklisting non-production
fails safe, because a forgotten preview host reading production data is far less damaging than a real
user writing to a scratch database.

The anon key is public by design and RLS is the actual security boundary, so both keys sitting
in source is not a leak, even though it looks like one. The `service_role` key is a different
matter entirely and must never appear in any file under `public/`.

---

## GitHub

### The GitHub Pages origin — a supported second home, not a mirror to retire

`https://sing-chen.github.io/amplifiedthinker/` **is live and actively rebuilding from `main`.**
Confirmed in Phase 0: it serves the full site and already carries the Phase 1 `progress.js`.

**It must stay live.** Some corporate networks block `amplifiedthinker.com` under
newly-registered-domain (NRD) policies — security filtering that blocks domains registered within
the last 30–90 days. Users on those networks have been given the GitHub URL and can reach it.
Retiring Pages would cut off an audience segment that has no other route in.

So this is not a stale artifact. It is a **second supported origin with different capabilities**, and
that has to be designed for rather than tidied away.

#### What each origin can serve

| | `amplifiedthinker.com` (Vercel) | `sing-chen.github.io/amplifiedthinker` (Pages) |
|---|---|---|
| The 16 static pages | ✅ | ✅ |
| `nav.js`, `styles.css`, `progress.js` | ✅ | ✅ |
| Client-side auth + progress sync (Phase 5) | ✅ | ✅ — Supabase JS is client-side |
| Favourites, pins, notes (Phase 6) | ✅ | ✅ — same reason |
| Dashboards (Phase 9) | ✅ | ✅ if the charts render client-side |
| Server-rendered blog (Phase 8) | ✅ | ❌ **static hosting only** |
| Admin portal (Phase 7) | ✅ | ❌ |
| `/api/` endpoints, legacy-URL 301s (Phase 6) | ✅ | ❌ |
| `middleware.js` social-preview meta tags | ✅ | ❌ — never ran there |
| Vercel Analytics (`/_vercel/insights/script.js`) | ✅ | ❌ — 404s, injected by Vercel at serve time |

The dividing line is **anything needing a server**. Pages serves files; it does not run code.

⚠️ **Analytics blind spot.** Because Vercel Analytics only exists on Vercel, traffic to the GitHub
origin is invisible in the dashboard. The NRD-blocked audience is therefore **undercounted by an
unknown amount** — which matters when judging how much that origin is worth supporting. Any decision
about retiring it should not rest on Vercel traffic numbers, because those numbers exclude it by
construction.

#### What this means for Phase 2

Phase 2 currently plans to move the 16 pages into `public/`. **That breaks Pages**, which serves the
repo root and would find no `index.html`. The fix is a GitHub Actions workflow that builds Astro in
static output mode and publishes to Pages, giving two build targets from one repo:

- **Vercel** — the full dynamic build. Publishing a blog post is instant.
- **Pages** — a prerendered static snapshot. Content appears on the next Actions run, and
  server-only surfaces are absent by definition.

This is real added scope for Phase 2, and it is better paid there than discovered at merge.

#### Two things to decide as the work progresses

- **The contact email is currently hidden on Pages** (`about.html`). Since those users often *cannot*
  reach the custom domain, they are the segment least able to get in touch by any other route.
  Consider showing the full contact block on both origins.
- **NRD blocks age out.** `amplifiedthinker.com` was registered 2026-07-06, so it is roughly six
  weeks old; most NRD filters release domains at 30–90 days. Re-test corporate access around
  **October 2026**. If the block has lifted, the dual-target build becomes optional rather than
  required — so avoid architecture that assumes Pages must be supported forever.

#### `.vercelignore` does not apply here — and never provided privacy

`.vercelignore` keeps `docs/` off `amplifiedthinker.com` (verified: `404` on Vercel). GitHub Pages
has no equivalent file, so the same paths return `200` there:

```
docs/dev-workflow.md      →  amplifiedthinker.com: 404      github.io: 200
```

**This is not a leak.** The repository is public, so every file in `docs/` is already readable at
`github.com/sing-chen/amplifiedthinker` and via `raw.githubusercontent.com` regardless of either
config. `.vercelignore` was only ever keeping planning docs out of the *website's* URL space, not
making them private. Write these docs as public documents, because they are.

A Jekyll `_config.yml` with `exclude: [docs, deploy.bat]` would restore parity, but it is deliberately
**not** being added: it changes the Pages build for a load-bearing origin that an audience has no
fallback from, in exchange for hiding files that stay public on `github.com` anyway. Non-zero risk for
near-zero gain.

#### Allowlist consequence

The Pages origin **must** be added to the Supabase redirect allowlist in Phase 3, or sign-in fails
for exactly the users who have no alternative origin.

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
