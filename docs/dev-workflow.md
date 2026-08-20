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
 ├─ feat/auth                      (Phase 5 — fast-forwarded to main at tip 947fb19)
 ├─ feat/legal-pages               (privacy, terms, why-sign-up — fast-forwarded at tip 38809fa, 2026-08-20)
 └─ …
```

⚠️ **`feat/legal-pages` is the first branch that is not a phase.** *(Merged 2026-08-20.)* It was
announcement-blocking work that no phase owned: Phase 5 made the site hold personal data, and the
sign-up form asks for a name and an address with nothing saying what happens to either. The
one-branch-per-phase rule is about merge boundaries, not about refusing to branch for anything else —
the test is whether the work is independently verifiable, and this is.

⚠️ **Both branches merged fast-forward, so neither has a merge commit.** "Merged as X" throughout
these docs means X was the branch *tip*, not a merge — `git log --merges` shows Phases 0, 2, 3 and 4
and stops. Don't read that gap as Phase 5 being unmerged.

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

**Phase 2 measured how total the blackout is: the wall masks 404s.** A path that does not exist on the
deployment returns the same `302` as one that does, so curl cannot distinguish a working build from a
broken one, a missing page from a present one, or a redirect from a render:

```
/about.html                       302   (exists)
/definitely-not-a-real-path-xyz   302   (does not exist)
```

Two consequences worth planning around, both of which bit in Phase 2:

- **Preview verification is entirely manual.** Automated checks confirm only that *a* deployment
  exists at the alias. Everything about its content needs a signed-in browser.
- **Server-side behaviour cannot be previewed at all.** `middleware.js` is the live example: its
  bot-UA response is unreachable behind the wall, so the first real test is production. Where that
  matters, capture a production baseline *before* merging and re-run it immediately after, with
  Vercel's instant rollback as the safety net.

This is the strongest argument for turning on Protection Bypass for Automation when server-side
surfaces arrive in Phase 6.

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
                https://amplifiedthinker-git-*-singchen.vercel.app/**
                http://localhost:4321/**
```

The scope was `<your-scope>` here until Phase 3 resolved it to `singchen` from the preview URLs
already recorded in `.claude/settings.local.json`.

Without the wildcard line, sign-in works in production and fails on every preview branch with no
useful error. This is the failure mode the original brief flagged as a possibility; the branch
workflow makes it a certainty rather than a risk.

`https://sing-chen.github.io/amplifiedthinker/**` is **required, not optional** — see "The GitHub
Pages origin" below. Users blocked from the custom domain by corporate NRD policies reach the site
only there, so omitting it means sign-in fails for the people with no fallback.

⚠️ **Phase 0's one blocked activity, now carried by Phase 3.** The values were settled here in
advance precisely so they would not be invented under pressure later, and Phase 3 spent them
unchanged. Applying them is still a dashboard action — see
[../supabase/README.md](../supabase/README.md), which holds the runbook and the reason each of the
four lines exists.

**Since Phase 5 the allowlist is split across the two projects**, and each must actively *refuse*
what belongs to the other: dev owns `localhost` and the preview alias, prod owns the two live
origins. Otherwise a laptop can drive the production database through a redirect that resolves.

#### ⚠️ Prove it with `npm run verify:redirects`, and run it FIRST

```bash
npm run verify:redirects
```

Both projects, every origin, **no email sent** — `/auth/v1/verify` decides its redirect *before* it
validates the token, so a deliberately invalid token still exercises the allowlist.

**Run it before investigating any auth link that lands in the wrong place.** A misconfigured
allowlist and an application bug produce the identical symptom — the visitor ends up on the home
page — and this tells the two apart in seconds. On 2026-08-19 it came back green and sent the search
straight at the page code, where the fault actually was.

⚠️ **Every batch also probes an origin that must NOT be allowed.** If that one is honoured too, the
probe is measuring nothing and the passes mean nothing.

### One Supabase project until Phase 5, two after

**You do not need a separate dev project yet.** Until Phase 5 puts auth into production there is
no real user data to protect, so one project is simpler and avoids schema-sync work on every
phase. Split into dev and prod projects *at* Phase 5, when real progress data starts existing —
not before. Paying that cost up front buys nothing.

**Phase 5 decided the shape: the split happens first, before any client code writes a row**, and
dev gets its own Resend key rather than running without mail. Prod stays `spehmrgmcdenqdftkyrt`.
Nothing in the repo names either project — the hostname switch below picks one at runtime, and
`.env` points one machine at dev. Full runbook, including the two Turnstile widgets, in
[../supabase/README.md](../supabase/README.md).

⚠️ **The allowlist moves rather than being copied.** Localhost and the preview wildcard belong to
dev from that point on; leaving them on prod would let a laptop drive the production database
through a redirect that still resolves.

⚠️ **Both projects then share one Resend allowance of 100/day**, and exhausting it stops
*production* password resets. It is the number to watch during the phase.

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

### Local config: `.env`

Phase 3 added a gitignored `.env` (shape in `.env.example`) holding `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY`. Astro's `PUBLIC_` prefix is what exposes a value to the browser;
anything without it stays server-side.

**Only `npm run verify:rls` depends on it.** That is deliberate, and it is the reason there are no
Supabase environment variables in Vercel's dashboard or in
[.github/workflows/pages.yml](../.github/workflows/pages.yml) either.

The alternative was tried on paper and rejected. Making `/auth-test` read build-time values would
have meant the same two variables configured in **three** places — `.env`, Vercel scoped to Preview
and Production, and the Pages workflow — for a page explicitly marked for deletion at the end of
Phase 5, plus remembering to unpick all three afterwards. The page takes its credentials at runtime
instead, so it runs unchanged on every origin with no build config at all.

This is the same instinct as the hostname switch above, arriving at the same answer from the other
direction: **anything that has to work on both production origins should decide at runtime, because
only one of them has a build you control.** Pages builds from a workflow, Vercel from a dashboard,
and keeping a value in step across both is a standing cost. `.env` is for the things with a shell
around them, and after the Phase 5 dev/prod split it is how one machine points at the dev project
without editing tracked code.

---

## GitHub

### The GitHub Pages origin — a supported second home, not a mirror to retire

> ⚠️ **SUPERSEDED IN PART, 2026-08-18. The retirement decision reverses this section's conclusion,
> not its content.** The NRD block described below **lifted on 2026-08-18**, 43 days after
> registration, and the origin was never shared outside the owner's organisation — so the audience
> that could only reach the site this way is now zero, and the origin is slated for retirement.
> The decision, and what falls away with it, are in [../CLAUDE.md](../CLAUDE.md) and
> [../BACKLOG.md](../BACKLOG.md).
>
> **What still holds:** the origin is live today, so **keep verifying both**. The capability table
> below is still correct and still governs what can be built. What no longer holds is "it must stay
> live" as a permanent constraint — treat "this cannot work on Pages" as a scheduling question, and
> prefer designs that get simpler when the origin goes.

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

#### Resolved: the contact block is now identical on both origins

The email used to be hidden on the GitHub origin. That was backwards — those users often *cannot*
reach the custom domain, making them the segment least able to get in touch any other way.
**Resolved 2026-08-17:** the hostname branching and the LinkedIn-only variant were both removed, so
`about.html` serves one contact block everywhere. It now also renders with JavaScript disabled, since
nothing has to un-hide it.

**The wider lesson: `about.html` was the only page that varied by origin, and it varied the wrong
way.** Treat per-origin branching as a smell. If the two origins must differ, the difference belongs
in the build (Phase 2's static-vs-dynamic split), not in a runtime hostname check that nobody
revisits.

#### Resolved: the NRD block lifted, and the Pages origin is slated for retirement

`amplifiedthinker.com` was registered 2026-07-06. The re-test was pencilled in for October 2026, on
the basis that most NRD filters release domains at 30–90 days. **It lifted early: corporate access
was confirmed working on 2026-08-18**, at 43 days.

That alone would make the dual-target build optional. What makes retirement the decision is a second
fact: **the Pages URL was never shared outside the owner's organisation.** Its entire audience was
colleagues behind that block, so the audience is now zero rather than merely small — and there is no
unknown population to strand.

⚠️ **What retires is the published URL, not GitHub.** The repo, the history and the Actions
workflows stay. Only `sing-chen.github.io/amplifiedthinker` stops being a way for the public to
reach the site.

**Not yet done, and both origins are still live** — so the capability matrix above still applies and
changes still get verified on both. The advice this section used to give still holds, more strongly:
avoid architecture that assumes Pages must be supported forever. Add to it that "this needs a server,
so Pages cannot have it" is now a **scheduling** question — retiring the origin first is a legitimate
answer where it was not before.

⚠️ **What is given up, and it is not the NRD audience.** A bad deploy or a Vercel outage currently
leaves a complete, working site on the other origin, and `main` has been able to fail to deploy since
Phase 2. Retirement makes Vercel a single point of failure. Low risk, fast rollbacks — but a
deliberate trade rather than a consequence of the NRD news.

Staging, the search-indexing question, and everything that falls away with the workflow are in
[../BACKLOG.md](../BACKLOG.md).

#### `.vercelignore` does not apply here — and never provided privacy

⚠️ **Superseded by Phase 2, confirmed at the Phase 3 merge (2026-08-17).** The asymmetry below no
longer exists — `docs/` is `404` on **both** origins:

```
docs/dev-workflow.md      →  amplifiedthinker.com: 404      github.io: 404
```

Nothing was done to achieve that. Pages used to serve the repository root, which is why it published
`docs/`; since Phase 2 it serves the Actions build output in `dist/`, and `docs/` sits outside
`public/` so it was never copied there. **Parity arrived as a side effect of a change made for an
entirely different reason**, which is worth noticing twice over: the `_config.yml` deliberation below
is now moot, and a documented fact about production quietly stopped being true a phase before anyone
re-tested it.

The original reasoning, kept because the conclusion still holds:

`.vercelignore` keeps `docs/` off `amplifiedthinker.com` (verified: `404` on Vercel). GitHub Pages
had no equivalent file, so the same paths returned `200` there.

**This is not a leak.** The repository is public, so every file in `docs/` is already readable at
`github.com/sing-chen/amplifiedthinker` and via `raw.githubusercontent.com` regardless of either
config. `.vercelignore` was only ever keeping planning docs out of the *website's* URL space, not
making them private. Write these docs as public documents, because they are.

A Jekyll `_config.yml` with `exclude: [docs, deploy.bat]` would have restored parity, and was
deliberately **not** added: it would have changed the Pages build for a load-bearing origin that an
audience has no fallback from, in exchange for hiding files that stay public on `github.com` anyway.
Non-zero risk for near-zero gain — and, as it turned out, for a gap that closed itself. Declining to
act on a low-value item was the right call twice: once on the merits, and once because the premise
expired.

#### Deploying to Pages requires the branch to be allowed in the environment

The `github-pages` environment enforces **deployment branch protection**, and by default only the
default branch may deploy. Dispatching the workflow against a feature branch fails at the `deploy`
job with:

```
Branch "feat/astro-shell" is not allowed to deploy to github-pages
due to environment protection rules.
```

The `build` job still runs, so a dispatch against a branch remains a genuinely useful check — it
proves `npm ci`, the Astro build and the artifact upload all work on CI, which is most of the risk.
Only the publish step is gated.

To verify a branch end to end on the live Pages URL, allow it at **Settings → Environments →
github-pages → Deployment branches**. Worth removing again afterwards, since the rule's default is
the safer posture.

#### ⚠️ Comparing served bytes: compare against the git blob, never the working tree

`core.autocrlf=true`, so the repository stores LF and the working tree gets CRLF on checkout. CI builds
from a clean checkout, so **every origin serves LF**. Comparing a served file against the local
working-tree copy therefore fails on every text file while every binary passes:

```
about.html   MISMATCH      images/favicon.png   ok
nav.js       MISMATCH      images/og-cover.png  ok
…25 text files mismatching, 3 images matching…
```

That pattern — all text differing, all binaries identical — is the signature of a line-ending
artifact, not a deployment fault. Phase 2's first verification pass produced exactly this and looked
briefly like a catastrophe.

Compare against the blob instead, which is what was actually deployed:

```bash
git show "HEAD:public/$rel" | sha256sum        # authoritative
curl -s "https://amplifiedthinker.com/$rel" | sha256sum
```

Re-run that way, all 66 files matched on both origins. Same lesson as Phase 1, in a new disguise: any
comparison touching these files has to decide what it does about line endings *before* it reports a
difference.

#### Testing the Pages base path without deploying

Most of what a Pages deployment would prove can be checked locally, which is faster and needs no
environment changes. Build with the Pages base, then stage the output under a directory of the same
name so the served URL space matches:

```bash
ASTRO_BASE=/amplifiedthinker npm run build
mkdir -p /tmp/pages-sim && cp -r dist /tmp/pages-sim/amplifiedthinker
cd /tmp/pages-sim && python -m http.server 8141
# → http://localhost:8141/amplifiedthinker/
```

Phase 2 used this to confirm every path resolves, assets load, and `nav.js` computes the right prefix
under the subpath. **On Windows, set `ASTRO_BASE` from PowerShell, not Git Bash** — MSYS2 rewrites
leading-slash values into Windows paths, so `/amplifiedthinker` silently became
`C:/Program Files/Git/amplifiedthinker` and the build emitted mangled URLs.

#### Why `nav.js` survives the subpath, and what would break it

`nav.js` computes its link prefix by comparing the page's directory segments against **its own
`document.currentScript.src`** (`public/nav.js:37-52`) rather than assuming a fixed depth. That is
why it already worked on the Pages subpath before Astro existed, and why it handles Astro's
directory-style URLs (`/sign-in/`, `/account/`, later `/blog/some-post/`) at any depth with no
changes.

It has one hard dependency: `document.currentScript` must be non-null, which means the script tag
must not be bundled as a module. Any Astro `<script>` loading `nav.js` therefore needs `is:inline`,
or every nav link resolves from the wrong depth. Recorded in `src/layouts/BaseLayout.astro` too.

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

### Where the working copy lives — `C:\dev\amplifiedthinker`, not Google Drive

**Resolved in Phase 2.** The working copy moved to `C:\dev\amplifiedthinker`. Open that path, not the
Drive one. Verified there: `npm ci` in 7s, `npm run build` clean, the byte-identical gate passing
66/66, and `npm run dev` serving both the new Astro page and the old static pages on port 4321.

The Drive copy at `G:\My Drive\01. Personal\Personal Projects\websites\amplified thinker` was left in
place rather than deleted. It is a stale checkout — do not commit from it.

#### Why the move was necessary

**`npm install` fails in Google Drive.** Measured in Phase 2:

| Location | Result |
|---|---|
| `G:\My Drive\…` (Google Drive) | ❌ `EBADF: bad file descriptor` after **2m32s**, twice, cleanly reproduced |
| Local disk (`C:\…`) | ✅ 201 packages in **13s** |

Google Drive's virtual filesystem cannot survive the thousands of small file operations npm performs;
it holds handles open and returns `ENOTEMPTY` / `EBADF` mid-install. There is no ignore mechanism in
Drive for Desktop to exclude `node_modules`, so this cannot be configured away.

**What this does and does not block:**

- **Deployment is unaffected.** Vercel and GitHub Actions both install and build on Linux runners
  from a clean checkout. They never see Drive. Phase 2 ships regardless.
- **Local development is fully blocked.** No `npm run dev`, no local `npm run build`, so no way to
  verify a build before pushing. That removes the fastest feedback loop precisely when the project
  has just acquired a build step that can fail.

Git and GitHub were already the source of truth and the backup, so Drive sync was redundant for the
code — and from Phase 2 onward actively harmful, since it would also try to sync `node_modules` and
`dist` on every build.

#### Backing up to Drive — `npm run backup`

Moving off Drive removed a backup, so [scripts/backup-to-drive.ps1](../scripts/backup-to-drive.ps1)
puts one back. It is **not** a mirror of the working copy, deliberately:

| Not backed up | Why |
|---|---|
| `node_modules/`, `dist/`, `.astro/` | Build artifacts. Syncing them is what made Drive unusable in the first place, and `npm ci` rebuilds them in 7s. |
| `.git/` as a directory tree | Thousands of small, frequently-rewritten files — the exact pattern Drive corrupts. A half-synced `.git` is worse than no backup. |
| Tracked source, as files | Already on GitHub in realtime, on every push. |

| Backed up | Why |
|---|---|
| Full history as **one** `.bundle` file | Drive syncs single large files reliably. `git bundle --all` captures every branch and tag, including commits not yet pushed. ~17 MB. |
| `_originals/` | Gitignored, so it exists nowhere else. |
| `.claude/settings.local.json` | Untracked. |

The script verifies the bundle before replacing the previous one, so a corrupt run cannot destroy a
good backup. It also warns about the two things a bundle *cannot* capture — **uncommitted changes to
tracked files** — and about any newly ignored path it doesn't know to back up, which is the standing
trap: ignored files are invisible to `git status`, so the usual "is it pushed?" check does not cover
them.

The script also copies [recovery.md](recovery.md) into the backup folder on every run, so the
step-by-step restore instructions are readable on a machine that has nothing installed — the only
situation in which they are needed. **[docs/recovery.md](recovery.md) is the full guide;** what follows
is the short version.

**Restore, tested rather than assumed** — cloning from the bundle produced an identical HEAD and tree
with a clean `fsck`:

```bash
git clone https://github.com/sing-chen/amplifiedthinker.git C:\dev\amplifiedthinker
# then copy _originals/ and .claude/settings.local.json out of the backup folder
npm ci
```

Only fall back to `git clone amplifiedthinker.bundle` if GitHub itself is unavailable.

To run it on a schedule, register a Task Scheduler job (it is not scheduled by default — the honest
default is manual, since GitHub already covers the code):

```powershell
schtasks /Create /SC DAILY /ST 18:00 /TN "amplifiedthinker backup" /TR "powershell -ExecutionPolicy Bypass -File C:\dev\amplifiedthinker\scripts\backup-to-drive.ps1"
```

⚠️ **The script is ASCII-only on purpose.** Windows PowerShell 5.1 reads a BOM-less `.ps1` as ANSI, so
an em-dash in a comment becomes mojibake and breaks the parse. It also avoids `2>&1` on any git call,
because 5.1 wraps a native command's stderr in `ErrorRecord`s — which turned `git bundle verify`
printing "is okay" into a terminating error. Both cost a debug cycle; don't reintroduce either.

#### What had to be carried over by hand

Two things were gitignored and therefore existed *only* in the Drive copy. Both were copied to
`C:\dev\amplifiedthinker`:

| Item | Note |
|---|---|
| `_originals/` | 6 MB of full-resolution source images, 9 files. Not in the repository — would have been lost outright. |
| `.claude/settings.local.json` | Untracked local Claude Code settings. |

⚠️ **If the Drive copy is ever deleted, check for new ignored files first.** Anything matching
`.gitignore` is invisible to `git status` and to any "is it pushed?" check, so the usual safety net
does not apply. `_originals/` is the standing example: keeping a copy in Google Drive is arguably its
correct home, since it is source material rather than code and genuinely benefits from backup.

Claude Code also keys project memory to the working-copy path, so memory starts empty at the new
location until moved.

---

### ⚠️ TLS interception breaks every `verify:*` script, and it looks like a code fault

**Symptom**, on a network you have not used before — typically a corporate one:

```
[TypeError: fetch failed] { [cause]: Error: unable to verify the first certificate
  code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }
```

**Cause: Node ships its own CA bundle and ignores the Windows trust store.** A proxy,
VPN or antivirus doing HTTPS inspection presents a certificate signed by a root Windows
trusts and Node does not. Nothing is wrong with the script, the credentials, or the
thing being checked — the same command passes from a different network on the same
machine, with the same Node version, minutes apart. First hit on 2026-08-20, on
`verify:schema`, immediately after a migration had been applied *successfully*; the
crash read as "the migration failed" and it had not.

**Fix — trust what Windows already trusts:**

```bash
node --use-system-ca scripts/verify-schema-columns.mjs
```

or `$env:NODE_OPTIONS = "--use-system-ca"` for the session. Needs Node ≥ 22.15, which
is why the flag is **not** baked into the npm scripts: an older Node rejects the unknown
flag before running a line, trading a clear failure for an obscure one.

⚠️ **Never `NODE_TLS_REJECT_UNAUTHORIZED=0`.** It disables certificate verification for
the whole process — on scripts whose entire purpose is to make a trustworthy statement
about a remote database. It would make the symptom disappear and the guarantee with it.

**Affects all four**: `verify:rls`, `verify:email`, `verify:redirects`, `verify:schema`.
Only `verify:schema` catches it and prints this advice; the others still fail raw.

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
