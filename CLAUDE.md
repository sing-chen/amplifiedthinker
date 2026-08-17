# Amplified Thinker

Personal site teaching workplace future skills, grounded in the WEF Core Skills 2030 framework.
Hand-written HTML/CSS/vanilla JS, now wrapped in an Astro build.

**Working copy: `C:\dev\amplifiedthinker`.** Not the Google Drive path — npm cannot install there
(`EBADF` after 2m32s, reproduced; 7s here). A stale checkout may still exist in Drive; never commit
from it.

---

## Read these before planning work

The project has a written architecture and a phased plan. Read them rather than re-deriving:

| Doc | What it holds |
|---|---|
| [docs/supabase-integration-plan.md](docs/supabase-integration-plan.md) | *What* gets built — architecture, data model, RLS design, decisions taken |
| [docs/implementation-sequence.md](docs/implementation-sequence.md) | *In what order and why* — phase status, and a progress log of what each phase actually taught |
| [docs/dev-workflow.md](docs/dev-workflow.md) | *How work happens* — branches, previews, both origins, environment settings, known traps |
| [BACKLOG.md](BACKLOG.md) | Unscheduled ideas |

`docs/` is excluded from the Vercel deploy but the repo is **public** — these are public documents.

---

## Where things live

```
public/          the 16 hand-written pages, shipped byte-for-byte untouched by Astro
                 index/about/future-skills/my-people/news/search .html, skills/**,
                 nav.js, progress.js, styles.css, fuse.min.js, *.json, robots.txt, sitemap.xml
src/pages/       new Astro surfaces (blog, admin, dashboard — mostly still to come)
src/layouts/     BaseLayout.astro — mirrors index.html's head so new pages match old ones
middleware.js    Vercel Edge Middleware, repo root. Serves social-preview meta tags to bots
_originals/      full-resolution source images, gitignored — outside public/ on purpose
```

**Two kinds of path that look alike.** A file you read or write needs `public/`; a URL inside a page
never does, because `public/` is stripped when served. `public/nav.js` is the file; `../../nav.js` is
how a skill page references it.

---

## Two production origins, and one of them runs no code

| Origin | |
|---|---|
| `amplifiedthinker.com` (Vercel) | Full build. Server rendering and `/api/` endpoints work |
| `sing-chen.github.io/amplifiedthinker` (GitHub Pages) | **Static files only.** No server, ever |

The GitHub origin is **load-bearing, not legacy**: some corporate networks block the custom domain
under newly-registered-domain policies, and those users have no other route in. Verify changes on
both. Client-side features work on both (Supabase JS runs in the browser); anything server-rendered
reaches Vercel only.

Pages is built by [.github/workflows/pages.yml](.github/workflows/pages.yml) with
`ASTRO_BASE=/amplifiedthinker`, since it serves from a subpath.

---

## Traps that have already cost time

- **Line endings.** `core.autocrlf=true`: the repo stores LF, the working tree is CRLF, and every
  origin serves LF. Comparing served bytes against the working tree fails on *every* text file while
  binaries pass — that signature is the artifact, not a bug. Compare against `git show HEAD:<path>`.
  Any script rewriting these files should normalise to LF for matching and restore on write.
- **Use PowerShell for env vars, not Git Bash.** MSYS2 rewrote `ASTRO_BASE=/amplifiedthinker` into
  `C:/Program Files/Git/amplifiedthinker` and the build silently emitted mangled URLs.
- **Vercel previews are auth-walled, and the wall masks 404s** — a nonexistent path returns the same
  `302` as a real one. Preview content cannot be verified by script; server-side behaviour cannot be
  previewed at all. Capture a production baseline before merging anything server-side.
- **`is:inline` on every Astro `<script>`.** `nav.js` derives its link prefix from
  `document.currentScript.src`; bundled as a module that is `null` and every nav link breaks. The
  skill pages also carry ~240 inline `onclick` handlers, which is why they stay in `public/`.
- **`main` can now fail to deploy.** Before Phase 2 nothing was built, so nothing could fail.
- **Structural changes orphan `.claude/commands/`.** Both `/add-news` and `/add-skill` reference
  concrete file paths. Phase 1 broke them by adding `progress.js`; Phase 2 broke them again by moving
  everything into `public/`. Check them after any move or new shared module.

---

## Working agreements

- **Branch per phase**, short names (`feat/…`) — Vercel builds the preview URL from the branch name.
  `main` stays deployable. Merge when the phase verifies.
- **`main` is unprotected on purpose.** `deploy.bat` pushes straight to it, so requiring PRs would
  turn every content fix into one. Solo repo.
- Ask before committing, pushing, or deploying.
- `deploy.bat "msg"` stages **everything** (`git add .`) — fine for content updates on `main`, wrong
  while developing. Use explicit git commands.
- Verification: automated checks are necessary but never sufficient for anything visual. Both Phase 1
  defects were found by a human looking at a browser, and neither was catchable by the passing test.
