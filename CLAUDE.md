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
| [docs/recovery.md](docs/recovery.md) | Rebuilding a working state on new hardware. A copy lives in the Drive backup folder, since that is where it is needed |
| [supabase/README.md](supabase/README.md) | Applying and rolling back the schema, the two verification halves, the redirect allowlist, and the email SMTP runbook |
| [docs/email-dns-baseline.md](docs/email-dns-baseline.md) | The DNS zone as it stood before Phase 4 touched it. Cloudflare keeps no history, so this is the only restore reference there is |
| [docs/email-aliases-runbook.md](docs/email-aliases-runbook.md) | Moving the contact route to `contact@`, adding `dmarc@`, retiring Brevo. Staged, with a handoff table that **is** the state — update it in the same sitting as the work |
| [BACKLOG.md](BACKLOG.md) | Unscheduled ideas |

`docs/` is excluded from the Vercel deploy but the repo is **public** — these are public documents.

---

## Where things live

```
public/          the 19 hand-written pages, shipped byte-for-byte untouched by Astro
                 index/about/future-skills/my-people/news/search .html, skills/**,
                 nav.js, progress.js, styles.css, fuse.min.js, *.json, robots.txt, sitemap.xml
                 — including skills-catalogue.json, which is GENERATED from the plan and primer
                   pages and committed because the site serves it. ⚠️ Never hand-edit it; run
                   npm run build:catalogue. It holds counts only — display names, categories and
                   copy are editorial and deliberately stay out
                 — plus three added 2026-08-19, hand-written for the same reasons the
                   other 16 are: static content, no auth logic, identical on both origins
                   privacy.html        UK GDPR / DPA 2018. ⚠️ Says what the site ACTUALLY
                                       does — changing analytics, fonts, storage or any
                                       processor means changing this page in the same commit
                   terms.html          Scots law. Mirrors the sibling Promptly site
                   why-sign-up.html    guest vs account. Carries BOTH halves and shows one
                 — plus the Phase 5 auth stack, all plain scripts loaded by <script>:
                   supabase.min.js     vendored library, not a CDN link
                   supabase-client.js  picks dev or prod BY HOSTNAME at runtime — no env vars
                   auth.js             session state site-wide, and the nav auth control
                   pwned.js            breach check; auth surfaces ONLY, not loaded by nav.js
                   auth-pages.css      styling for /sign-in/ and /account/, same scoping rule
                   learning.js/.css    ⚠️ /learning/ ONLY, same scoping rule as the two above.
                                       Owns NO definitions — what "complete" means and what
                                       counts toward a denominator live in skills-progress.js,
                                       so this page and the Future Skills library cannot
                                       disagree about one account. Recomputing them here was a
                                       defect within a day: the library read completed_at and
                                       this read visited coverage, and one finished skill
                                       showed as COMPLETED on one page and 30% on the other
src/pages/       new Astro surfaces. sign-in.astro, account.astro and learning.astro are live;
                 blog and admin still to come. Both scaffolds were deleted 2026-08-19 —
                 auth-test.astro at 84566e4, shell-test.astro at b03e6f2, if either is
                 ever wanted back (auth-test holds RLS checks nothing has replaced)
src/layouts/     BaseLayout.astro — mirrors index.html's head so new pages match old ones
middleware.js    Vercel Edge Middleware, repo root. Serves social-preview meta tags to bots
supabase/        migrations/ (the schema's source of truth), rollback/, and README.md —
                 the apply/verify runbook plus the dashboard settings SQL cannot reach
                 email-templates/ — the two auth emails. CONFIGURATION, not code: nothing
                 reads them, Supabase serves them from its dashboard, and they are committed
                 because a rebuilt project has none of them
scripts/         backup-to-drive.ps1 (npm run backup), verify-rls.mjs (npm run verify:rls),
                 verify-email-dns.mjs (npm run verify:email) — the mail DNS gate, needs no credential
                 verify-redirects.mjs (npm run verify:redirects) — the redirect allowlist, both
                 projects, no email sent. Run it FIRST whenever an auth link lands in the wrong place
                 keepalive.mjs — one read a day, or the free project pauses itself
                 verify-build-stamp.mjs (npm run verify:stamp) — asks both origins which commit they
                 are built from. The ONLY check that distinguishes "deployed" from "quietly still
                 serving last week's build"; verify:published is differential and cannot
                 build-skills-catalogue.mjs (npm run build:catalogue) — derives plan/primer lengths
                 from the pages into public/skills-catalogue.json
                 verify-catalogue.mjs (npm run verify:catalogue) — ⚠️ wired as npm's `prebuild`, so
                 a stale catalogue FAILS `npm run build` on both origins. Deliberate: see below
                 verify-signin-return.mjs (npm run verify:signin-return) — ⚠️ also `prebuild`.
                 Proves the `?next=` sign-in redirect cannot be pointed off-site. It LIFTS the real
                 safeNext() out of sign-in.astro rather than reimplementing it, so a retyped copy
                 cannot pass while the shipped one rots. Never delete it to make a build go green
_originals/      full-resolution source images, gitignored — outside public/ on purpose
.env             gitignored; shape in .env.example. Needed ONLY by npm run verify:rls.
                 There are deliberately no Supabase env vars in Vercel or pages.yml —
                 anything that must work on both origins decides at runtime instead
```

**Two files scoped to the auth pages on purpose.** `pwned.js` and `auth-pages.css` are loaded by
`/sign-in/` and `/account/` and nowhere else. `styles.css` and `nav.js` are already paid for by all
19 pages; nothing else needs either of these, and adding them to the shared files would put weight
on every page to serve two.

**Two kinds of path that look alike.** A file you read or write needs `public/`; a URL inside a page
never does, because `public/` is stripped when served. `public/nav.js` is the file; `../../nav.js` is
how a skill page references it.

---

## Two production origins, and one of them runs no code

| Origin | |
|---|---|
| `amplifiedthinker.com` (Vercel) | Full build. Server rendering and `/api/` endpoints work |
| `sing-chen.github.io/amplifiedthinker` (GitHub Pages) | **Static files only.** No server, ever |

**Both are live today, so verify changes on both.** Client-side features work on either (Supabase JS
runs in the browser); anything server-rendered reaches Vercel only.

Pages is built by [.github/workflows/pages.yml](.github/workflows/pages.yml) with
`ASTRO_BASE=/amplifiedthinker`, since it serves from a subpath.

### The Pages origin is slated for retirement — decided 2026-08-18, not yet done

It existed because corporate networks blocked the custom domain under newly-registered-domain
policies, leaving those users no other route in. **That block lifted on 2026-08-18**, 43 days after
registration, and the origin was **never shared outside the owner's organisation** — so its entire
audience was colleagues behind that block, and is now zero.

⚠️ **This retires a published URL, not GitHub.** The repository, the git history and the Actions
workflows all stay exactly where they are. "Retiring GitHub" would be a catastrophic misreading;
what goes is `sing-chen.github.io/amplifiedthinker` as a way for the public to reach the site.

**What this means while it is still live:** keep verifying both origins, but do not deepen the
dependency. Prefer designs that get *simpler* when Pages goes, and treat "this would need a server,
so it cannot work on Pages" as a scheduling question rather than a hard constraint — retiring the
origin first is a legitimate answer. Timing, staging, and what falls away with it are in
[BACKLOG.md](BACKLOG.md).

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
  **Two more ways to fail were added deliberately on 2026-08-21**, both as npm's `prebuild`, and both
  origins build with `npm run build` so they gate *both*: `verify:catalogue` and
  `verify:signin-return`. Editing a plan's nav rail without running `npm run build:catalogue` stops
  the deploy, and so does weakening the open-redirect guard on the sign-in return. That is the
  intended behaviour —
  the alternative is `public/skills-catalogue.json` quietly reporting a wrong denominator, which
  reads as "14 of 15 is complete" and fails nothing. A failed build leaves the previous deployment
  serving, where the pages and the catalogue still agree, so the failure mode is consistent.
- ⚠️ **Never round-trip a page through PowerShell `Get-Content`/`Set-Content`.** On 2026-08-21 a
  `Set-Content -Encoding utf8` restore added a **UTF-8 BOM** and re-encoded every `·` into `Â·` —
  504 lines changed in one file, from a command whose only intent was to put the original back.
  Windows PowerShell 5.1 writes UTF-8 *with* BOM and decodes as ANSI on the way in. This is a
  separate trap from the line-endings one below it and it corrupts **content**, not just endings.
  Use `node` (`readFileSync`/`writeFileSync`, utf8) for any script that rewrites these files, and
  `git checkout -- <path>` to restore. The damage is loud in `git diff --stat` — a one-line edit
  reporting hundreds of changed lines is this, every time.
- **A new table lands with *no* grants, and that looks exactly like a broken policy.** The Phase 3
  migration ends with `alter default privileges … revoke all on tables from anon, authenticated`,
  so every future table must grant explicitly. Symptom: `permission denied for table X` even as an
  admin, with a policy that reads correctly. It is opt-in by design — add the `grant` alongside the
  `create policy`.
- **`service_role` bypasses RLS entirely.** One line with that key undoes every policy in the
  migration. It never goes in a `PUBLIC_` env var, never in anything under `public/`, and has no
  home at all until a server endpoint exists in Phase 6. `npm run verify:rls` refuses to run with it.
- **`is_admin` is settable only where `auth.uid()` is null** — the dashboard SQL editor. A trigger
  rejects the account changing its own. Do not add `force row level security` to `profiles`: it
  would apply RLS to the table owner and close that same door.
- **Astro collapses a newline between text and a tag to NOTHING, not to a space.** Breaking a line
  before `<a>` for readability ships `accept the<a>terms of use</a>` — the words run together on the
  live page and look perfectly fine in source. It has shipped twice, on `sign-in.astro` and
  `account.astro`. **Keep the space on the same line as the tag, and never re-wrap markup that ends
  in text before an element** to fit a column width. Only the `.astro` files compress; the
  hand-written pages in `public/` are served as authored.
  **Third and fourth instances, 2026-08-20, both live on `sign-in.astro` and both found by reading
  rendered output during unrelated work**: `try a different network, oremail me` and
  `what is collected,what email you get,your rights`. ⚠️ **A grep cannot find these** — the `href` is
  correct and the damage is in the text node beside it, so every source-level check passes. The
  comma case is the nastier one: a list of links separated by `,\n<a` loses every separator at once,
  and it reads as a typo rather than as a build artifact.
- **On the auth pages, check specificity against `.auth-panel`'s element selectors before assuming a
  class wins.** `.auth-panel label { display: block }` is **(0,1,1)** and beats a bare
  `.auth-check-label` (0,1,0) — which stacked a checkbox above its own label. `.auth-panel label`
  also sets `font-weight: 600` and a bottom margin, so anything that is *not* a field label has to
  reset both. Same file, `.auth-hint` carries `margin-top: -12px` to tuck a hint under the input it
  describes: reusing it anywhere that does not follow an input drags it onto whatever is above.
- **`[hidden]` is the weakest rule in the cascade, and it has cost two defects.** The browser's own
  `[hidden] { display: none }` is a UA rule, so **any** author `display` beats it — `.auth-actions`
  and `.doc-cta` both set `display: flex`, and both would render a `hidden` element in full. Any new
  component that sets `display` **and** gets toggled needs an explicit override; `auth-pages.css` and
  `why-sign-up.html` each carry one. ⚠️ **Assert computed `display`, never `element.hidden`** — the
  property was correct in both defects, which is exactly why the tests passed.
- ⚠️ **Test what the nav RENDERED, never the function that renders it.** Two defects in one
  afternoon, 2026-08-21, both in the sign-in `?next=` work, both passing every check at the time:
  1. `?next=` was wired into `nav.js`'s `paintAuthSlot` but not `auth.js`'s `renderNavAuth`. **Two
     files paint that one control** — nav.js only pre-paints, and `auth.js` owns the slot from the
     moment the stack loads. So it worked for a guest who had never signed in and for nobody else,
     which is the audience least likely to report it. `auth.js` already warns about this drift eight
     lines below the bug, where it takes the avatar letter from nav.js rather than deriving it twice.
  2. The scroll marker was computed **when the nav painted** — page load, offset 0 — so it was always
     absent by the time anyone scrolled and clicked. The `href` is an attribute frozen at paint;
     `returnParam()` recomputes on every call.

  **Both survived testing for the same reason: the function was called directly instead of the
  rendered result being read.** `returnParam()` returned the right string every time while the
  `href` never changed. So scroll, or change session state, **then read `el.getAttribute('href')`** —
  a test that calls the function proves only that the function works, which was never in doubt. Same
  category as the `[hidden]` entry above: assert the rendered outcome, not the input that should have
  produced it.
- **Anything derived from volatile state must be refreshed at ACTIVATION, not at paint.** Scroll
  position, viewport, time — a nav control painted once at load carries whatever those were at load,
  for ever. `refreshSignInHref` rebuilds the href on `mousedown`/`touchstart`/`keydown` in the
  capture phase, ⚠️ **not on `click`**: middle-click and ctrl-click never fire one, and by `click`
  the navigation is already committed. Delegated on `document`, so it survives both `auth.js`
  repainting the slot and the primer bundle wiping the nav.
- **A `<footer>` must carry `class="site-footer"` or it renders unstyled, and nothing fails.** The
  footer rules live once in `public/styles.css` (de-duplicated 2026-08-21 from ten copies). They are
  deliberately **not** a bare `footer` element selector, because `search.html`'s
  `<footer class="search-footer">` is a different band — fixed `#1B4A44` matched to its own hero,
  720px and centred — that must not be caught by them. ⚠️ **Omitting the class reproduces the
  original defect exactly** (`7fe8ea9`, which shipped `/sign-in/` and `/account/` as a bare list of
  default-styled links): correct markup, no styling, looks fine in source, found only by eye.
  ⚠️ **`search.html`'s rules are scoped under `.search-footer` and must stay scoped** — four of its
  class names are also the shared ones, so the scope (0,2,0) is what beats `styles.css` (0,1,0);
  unscoped, it silently depends on inline `<style>` coming after the `<link>` instead. **Anything
  added to the shared block must be checked against that variant** — a property it does not override
  will reach it, which is why `.footer-tagline` there resets `letter-spacing` explicitly. Responsive
  padding stays per page on purpose: the breakpoints genuinely differ (700/640/600px).
- **The privacy page is a description of the system, not boilerplate.** `public/privacy.html` names
  every processor, every device-storage key, every outbound third-party request and the legal basis
  for each. Adding analytics, a font host, a CDN, an embed, a storage key or a new table makes it
  **wrong**, not merely out of date. Change it in the same commit. The sibling Promptly site makes
  the same statements about the same person under the same law — check it before editing either.
- **Copy that states a limit is a claim about the system, and it rots like a comment.** The sign-up
  form said *"Never a newsletter."* — accurate when written, false the day the account started
  offering update email, and shown at the exact moment someone decides whether to trust the site.
  ⚠️ **Anything that promises what the site will not do belongs in the same change as whatever makes
  it untrue**: the form hint, `privacy.html` §8, `terms.html` §2 and `why-sign-up.html` all move
  together. Grep for the promise, not just the feature.
- **A short-lived surface cannot be audited against a long-lived one after the fact.** The homepage
  banner (`ANNOUNCEMENTS` in `public/index.html`) and What's New (`public/updates.json`) state the
  same dates twice, with nothing checking they agree — and the banner's `EXPIRY_DAYS` renders an item
  for only 14–21 days. Dark Mode was dated 23 July in one and 21 July in the other for a month:
  ⚠️ **the expiry did not cause the error, it made the error unfalsifiable**, because by the time
  anyone could compare the two only the permanent one was still on screen. Write the pair in the same
  sitting and take the date from the commit. `expiryDays` on an item overrides the type default.
- **Structural changes orphan `.claude/commands/`.** Both `/add-news` and `/add-skill` reference
  concrete file paths. Phase 1 broke them by adding `progress.js`; Phase 2 broke them again by moving
  everything into `public/`. Check them after any move or new shared module. **Third instance,
  2026-08-20, and a different kind:** `/add-skill` had never mentioned `updates.json` or the banner,
  though every live skill has an entry in both — a step done by hand each time and written down
  nowhere. ⚠️ **Drift is not only paths going stale; it is also steps that were never captured.** A
  command that still runs cleanly can be missing half the job.

---

## Working agreements

- **Branch per phase**, short names (`feat/…`) — Vercel builds the preview URL from the branch name.
  `main` stays deployable. Merge when the phase verifies.
- **The database has the same two states as the code, and they move together.** Work happens on the
  branch and in the **dev** Supabase project; the **prod** project stays as `main` needs it. A
  migration reaches prod in the phase's go-live step, **immediately before the merge** — early enough
  that no deployed code ever calls a function that is not there, late enough that it has been tested
  first. Never after the merge, and never "straight after". Details in
  [supabase/README.md](supabase/README.md).
- **`main` is unprotected on purpose.** `deploy.bat` pushes straight to it, so requiring PRs would
  turn every content fix into one. Solo repo.
- Ask before committing, pushing, or deploying.
- `deploy.bat "msg"` stages **everything** (`git add .`) — fine for content updates on `main`, wrong
  while developing. Use explicit git commands.
- Verification: automated checks are necessary but never sufficient for anything visual. Both Phase 1
  defects were found by a human looking at a browser, and neither was catchable by the passing test.
