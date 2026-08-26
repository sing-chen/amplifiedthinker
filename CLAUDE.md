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
| [docs/dev-workflow.md](docs/dev-workflow.md) | *How work happens* — branches, previews, the deploy, environment settings, known traps |
| [docs/design-modernisation.md](docs/design-modernisation.md) | The visual system, shipped in discrete pieces. ⚠️ **Deliberately not a phase** — no schema, no go-live step, no queue position. Holds the binding type and colour rules, what is knowingly still wrong, and how design work gets verified. Read it before changing a font, a token or a weight |
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
                 — 20 until 2026-08-26, when news.html was replaced by the server-rendered
                   /news/ routes; see below
                 index/about/future-skills/my-people/search .html, skills/**,
                 nav.js, progress.js, styles.css, fuse.min.js, *.json, robots.txt
                 — ⚠️ sitemap.xml is NO LONGER HERE. It was deleted 2026-08-26 and is generated
                   per request by src/pages/sitemap.xml.js. Putting a static one back would
                   SHADOW that route, because `handle: filesystem` runs first
                 — plus news-app.css, added 2026-08-26. ⚠️ /news/ and /news/<slug> ONLY, same
                   scoping rule as auth-pages.css. It began as a near-copy of the <style> block
                   inside news.html; that page was deleted at stage 11, so this is now the ONLY
                   copy and there is nothing left to keep it in step with
                 — plus fonts.css and fonts/, the self-hosted type (2026-08-23). ⚠️ fonts.css is
                   linked by ALL 19 PAGES AND BaseLayout, which styles.css is NOT — the 10 skill
                   primer/plan pages are self-contained and deliberately skip styles.css, so the
                   @font-face rules could not live there. That asymmetry is the whole reason it
                   is a separate file. The site is Inter and only Inter; Poppins and Source
                   Serif 4 were retired the same day, and there is no third-party font request
                   left to make. Regenerating the woff2 files is a documented command inside
                   fonts.css — ⚠️ never subset without --layout-features, see the traps below
                 — including skills-catalogue.json, which is GENERATED from the plan and primer
                   pages and committed because the site serves it. ⚠️ Never hand-edit it; run
                   npm run build:catalogue. It holds counts only — display names, categories and
                   copy are editorial and deliberately stay out
                 — plus three added 2026-08-19, hand-written for the same reasons the
                   other 16 are: static content, no auth logic, nothing the build needs to touch
                   privacy.html        UK GDPR / DPA 2018. ⚠️ Says what the site ACTUALLY
                                       does — changing analytics, fonts, storage or any
                                       processor means changing this page in the same commit
                   terms.html          Scots law. Mirrors the sibling Promptly site
                   why-sign-up.html    guest vs account. Carries BOTH halves and shows one
                 — plus whats-new.html, added 2026-08-26. The What's New log, split out of
                   about.html into its own page and rebuilt as one expandable card per month
                   (most recent open), entries newest-first inside it. ⚠️ It renders
                   updates.json's `type` pill, `title` and `html` and NEVER the day — `date`
                   decides the month and the ordering only. ⚠️ `type` shares three of its keys
                   (`skill`, `feature`, `story`) and their labels with index.html's
                   ANNOUNCEMENTS/PILL_LABELS, so one update announced in both places says the
                   same word twice; `improvement` and `milestone` are this page's alone.
                   about.html keeps `id="updates"` as a pointer,
                   because every footer linked to `about.html#updates` for two months
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
                 — plus the first SERVER-RENDERED routes, added 2026-08-26 (Phase 6 stage 10).
                   ⚠️ Each declares `export const prerender = false`. WITHOUT IT the route is
                   built once at deploy time and then serves a frozen snapshot for ever — it
                   keeps working, keeps looking healthy, and quietly stops showing anything
                   published since. That is the exact failure server rendering was added to stop
                   news/index.astro     /news/ — the index
                   news/[slug].astro    /news/<slug> — one story, real text in the response body
                   news.html.js         ⚠️ REPLACED public/news.html, which was DELETED. It is a
                                        REDIRECT now: ?story=<date>-<index> resolves through the
                                        stored legacy_id and 301s to /news/<slug>. 301 not 302 on
                                        purpose — 302 leaves the query string canonical. A failed
                                        lookup returns 503 and NEVER redirects, because browsers
                                        cache 301s and the damage would outlive the outage
                   api/search-index.json.js  ⚠️ REPLACED public/search-index.json, DELETED
                                        2026-08-26. 81 of its 104 entries were a hand-maintained
                                        COPY of news that lives in the DB — and that file is the
                                        one found on main with 39 CP1252-decoded characters,
                                        valid JSON, right count, all checks green, the only
                                        symptom a result reading "Bren<e9> Brown". The other 23
                                        are editorial and live in src/data/search-static.json.
                                        ⚠️ A FAILED DB READ MUST DEGRADE, NOT 503: search.html
                                        treats a failed index fetch as fatal and disables itself,
                                        so failing hard would turn a DB outage into a dead search
                                        page — a regression caused by the fix. It serves the 23
                                        static entries and sets x-news-entries: 0
                   api/news/recent.json.js  the homepage banner's source. ⚠️ DELIBERATELY an
                                        endpoint rather than a browser query, though nav.js loads
                                        the Supabase client on every page. A signed-out visitor
                                        contacts supabase.co NEVER — createClient makes no request
                                        and auth.js reads localStorage — which is why privacy.html
                                        can say Supabase affects "Account holders" and §9 can claim
                                        no third party is involved in showing you the page. A
                                        homepage query breaks both. Keep the server between them
                   sitemap.xml.js       ⚠️ REPLACED public/sitemap.xml, which was DELETED. A
                                        static file cannot list 81 story URLs and stay right,
                                        and an incomplete sitemap fails nothing and looks
                                        exactly like a correct one — same shape as the
                                        catalogue trap. Serves the static half even if the
                                        story read fails
src/data/        search-static.json — the hand-authored half of the search index (page, primer,
                 plan, person). ⚠️ NOT under public/ and NOT served directly; the endpoint imports
                 it, so a syntax error FAILS THE BUILD rather than breaking site search silently.
                 /add-skill writes here now — editing public/search-index.json does nothing
src/lib/         news-render.mjs  ⚠️ THE MARKUP, WRITTEN ONCE AND RUN IN TWO PLACES — the server
                                  builds the first paint from it and public's client script
                                  re-renders from the same functions. A server render and a
                                  client render of one list are two implementations of one thing
                                  and they drift silently: the page looks right until JS takes
                                  over. Pure string building, no DOM and no fetch, so it runs
                                  unchanged in a serverless function and in a browser. Never
                                  import `node:` anything into it
                 news-data.mjs    the PostgREST read. SERVER ONLY. ⚠️ The project table is
                                  parsed out of public/supabase-client.js by astro.config.mjs
                                  and injected with `vite.define` — at BUILD time, because
                                  public/ is not in a Vercel serverless bundle and a readFileSync
                                  in the route would work in dev and find nothing in production.
                                  The prod/dev choice is still per request, from the request's
                                  own hostname, by the same BLOCKLIST rule the browser uses
src/components/  NewsView.astro (the reader, shared by both routes), NewsUnavailable.astro (503),
                 NewsNotFound.astro (404). ⚠️ An unreadable feed is a 503 with a page that says
                 so, never an empty list — "no stories" and "the database did not answer" look
                 identical once they reach HTML, and serving the second as the first tells a
                 crawler the feed is genuinely empty
src/scripts/     news-app.js — filter, search, keyboard nav and in-place story swapping for the
                 /news/ routes. Bundled by Astro (a module here is fine: it has no
                 document.currentScript and no inline handlers, which is what is:inline is for)
src/layouts/     BaseLayout.astro — mirrors index.html's head so new pages match old ones
                 — ⚠️ news.html is NO LONGER HERE either. It was deleted 2026-08-26 and `/news.html`
                   is now a redirecting route (src/pages/news.html.js) resolving `legacy_id` → slug.
                   A static file could not coexist with it: `handle: filesystem` runs FIRST, so the
                   static page wins every time and the endpoint never executes
(middleware.js)  DELETED 2026-08-26. It served social-preview meta tags to bots for
                 news.html?story=, because the page rendered client-side. ⚠️ Do not reintroduce it
                 without reading why it went: /news/<slug> carries real meta tags now, and the
                 middleware's matcher was `/news.html` — running BEFORE routes, it would hand a
                 crawler the old shell instead of the 301, which no `curl` test can detect
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
                 verify-build-stamp.mjs (npm run verify:stamp) — asks production which commit it is
                 are built from. The ONLY check that distinguishes "deployed" from "quietly still
                 serving last week's build"; verify:published is differential and cannot
                 build-skills-catalogue.mjs (npm run build:catalogue) — derives plan/primer lengths
                 from the pages into public/skills-catalogue.json
                 verify-catalogue.mjs (npm run verify:catalogue) — ⚠️ wired as npm's `prebuild`, so
                 a stale catalogue FAILS `npm run build`, so it cannot deploy. Deliberate: see below
                 verify-encoding.mjs (npm run verify:encoding) — ⚠️ also `prebuild`. Fails on UTF-8
                 decoded as CP1252 anywhere in the tree. `npm run fix:encoding` repairs in place.
                 Its source is deliberately pure ASCII, and its allowlist of the few files that
                 legitimately QUOTE mojibake is built with String.fromCharCode: a scanner for
                 encoding damage that stores its own patterns as literals stops matching the moment
                 something re-encodes it, and then passes everything
                 verify-signin-return.mjs (npm run verify:signin-return) — ⚠️ also `prebuild`.
                 Proves the `?next=` sign-in redirect cannot be pointed off-site. It LIFTS the real
                 safeNext() out of sign-in.astro rather than reimplementing it, so a retyped copy
                 cannot pass while the shipped one rots. Never delete it to make a build go green
_originals/      full-resolution source images, gitignored — outside public/ on purpose
.env             gitignored; shape in .env.example. Needed ONLY by npm run verify:rls.
                 There are deliberately no Supabase env vars in Vercel or pages.yml —
                 anything environment-dependent decides at runtime instead
```

**Two files scoped to the auth pages on purpose.** `pwned.js` and `auth-pages.css` are loaded by
`/sign-in/` and `/account/` and nowhere else. `styles.css` and `nav.js` are already paid for by all
18 pages; nothing else needs either of these, and adding them to the shared files would put weight
on every page to serve two.

**Two kinds of path that look alike.** A file you read or write needs `public/`; a URL inside a page
never does, because `public/` is stripped when served. `public/nav.js` is the file; `../../nav.js` is
how a skill page references it.

---

## One production origin

| Origin | |
|---|---|
| `amplifiedthinker.com` (Vercel) | Full build. Server rendering and `/api/` endpoints work |

That is the whole list. **A change is verified there and nowhere else.** Anything written before
2026-08-26 that says "both origins", "either origin" or "verify on both" is describing the world
before that date — see below.

### The GitHub Pages origin was retired on 2026-08-26

`sing-chen.github.io/amplifiedthinker` is gone. GitHub Pages is switched off for the repository and
[.github/workflows/pages.yml](.github/workflows/pages.yml) was deleted; the origin now 404s at the
root. It existed because corporate networks blocked the custom domain under newly-registered-domain
policies, leaving those users no other route in. **That block lifted on 2026-08-18**, 43 days after
registration, and the origin was **never shared outside the owner's organisation** — so its entire
audience was colleagues behind that block, and had been zero for a week when it went.

⚠️ **This retired a published URL, not GitHub.** The repository, the git history and the Actions
workflows are all exactly where they were, and `keepalive.yml` still runs daily. "Retiring GitHub"
would be a catastrophic misreading; what went is one way for the public to reach the site.

**What this means now.** There is no second origin to keep a design portable for, so "this would
need a server, so it cannot work on Pages" is no longer a constraint on anything. Server rendering
and `/api/` endpoints are available wherever they help. Two mechanisms survive the origin
deliberately and should not be torn out as dead code:

- **`ASTRO_BASE` in [astro.config.mjs](astro.config.mjs).** Nothing sets it any more, so `base`
  falls to `/`. It stays because `BaseLayout` and `sign-in.astro` route every generated URL through
  it, and unpicking that is a change to live pages with nothing to gain. ⚠️ The **Git Bash env-var
  trap below still applies** to anyone who sets it by hand.
- **The sub-path cases in `verify:signin-return`.** They were written for the Pages base and now
  read as a synthetic sub-path deployment, because they still exercise base-aware containment in the
  real `safeNext()`. Deleting them would drop open-redirect coverage the shipped code still needs.

⚠️ **Two dashboard entries outlived the origin and are not in this repo.** The Supabase prod
redirect allowlist and the `amplifiedthinker-prod` Turnstile widget both still name
`sing-chen.github.io`. Neither can be changed from here — see [supabase/README.md](supabase/README.md).

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
  `verify:signin-return`. **A third joined them on 2026-08-23: `verify:encoding`**, after mojibake
  reached `main` unnoticed. Editing a plan's nav rail without running `npm run build:catalogue` stops
  the deploy, so does weakening the open-redirect guard on the sign-in return, and so does letting a
  PowerShell round-trip re-encode any file in the tree. That is the
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
  ⚠️ **Second instance, 2026-08-23, and the warning above did not prevent it.** `search-index.json`
  was found on `main` with **39** re-encoded characters in four sequences — `Â·`, `â€”`, `â€“`, `Ã©`
  — from a `ConvertTo-Json` rewrite that bypassed the UTF-8-safe python `/add-news` documents. The
  giveaway was in the formatting, not the text: all 522 keys had two spaces after the `:`, which
  `json.dump` cannot emit. **The loud-diffstat tell does not work once the damage is committed** —
  it is only visible in the sitting that caused it, and this had been live long enough that the
  corrupted bytes *were* the baseline. Nothing else caught it: valid JSON, right entry count, all
  checks green, and the whole symptom was a search result reading `Brené Brown`.
  **So the rule is now enforced rather than written down**: `npm run verify:encoding` (a third
  `prebuild`) fails the build on any CP1252-decoded UTF-8, and
  `npm run fix:encoding` repairs it. A prose warning was not enough — it had been in this file for
  two days when the second instance shipped.
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
- **`[hidden]` is the weakest rule in the cascade, and it has now cost three defects.** The browser's
  own `[hidden] { display: none }` is a UA rule, so **any** author `display` beats it —
  `.auth-actions` and `.doc-cta` both set `display: flex`, and both would render a `hidden` element
  in full. Any new component that sets `display` **and** gets toggled needs an explicit override;
  `auth-pages.css`, `why-sign-up.html` and `exit-guard.js` each carry one. ⚠️ **Assert computed
  `display`, never `element.hidden`** — the property was correct in all three defects, which is
  exactly why the tests passed.
  **Third instance, 2026-08-24, in `exit-guard.js`, and it shipped past a check written by someone
  who had just read this entry.** The leave dialog set `signIn.hidden = true` for signed-in readers
  and showed them a **"Sign in first"** button anyway, because the file's own
  `#exitGuard a.eg-btn { display: inline-flex }` beat the UA rule. It was found by a screenshot, not
  by the test — which asserted `el.hidden`, got `true`, and would have got `true` for ever.
  ⚠️ **Knowing this trap is not the same as not falling into it.** The override now sits *above* the
  `display` rule with `!important` and a comment saying why, because the next `display` added to that
  block would otherwise reopen it silently.
- ⚠️ **On the ten skill pages the semantic tokens do NOT flip in dark mode.** `--bg-surface` is still
  `#FFFFFF` under `[data-theme="dark"]`, and so are `--fg-1`, `--line` and the rest. Dark is built as
  a **parallel `--d-*` set** — `--d-bg-surface`, `--d-fg-1`, `--d-fg-2`, `--d-fg-heading`, `--d-line`,
  `--d-teal-bg`/`--d-teal-stroke` — applied per component
  (`[data-theme="dark"] .next-step-card { background: var(--d-teal-bg) }`), not as a redefinition of
  the light tokens. **A new component styled only with semantic tokens therefore renders its LIGHT
  appearance in dark**, and nothing fails: valid CSS, correct token names, a white card on a `#142320`
  page. Found 2026-08-24 by measuring `exit-guard.js`'s dialog rather than trusting the names; every
  surface in it now carries an explicit `[data-theme="dark"]` counterpart.
  ⚠️ **The brand fill inverts, so anything sitting on it has to invert too** — `--bg-brand` becomes a
  *bright* teal in dark, and a light label on it is the same mistake as hardcoding `#FFFFFF` there.
  `--fg-on-brand` does not flip on these pages either, so say it explicitly.
  The binding colour rules live in
  [docs/design-modernisation.md](docs/design-modernisation.md) — read it before adding a token.
  ⚠️ **The other pages flip their semantic tokens, but not all of them — `--light-sage` does not.**
  A rule using it needs an explicit `[data-theme="dark"]` counterpart like any raw colour. Found
  2026-08-26: `.story-panel` was the one surface in news.html's dark block without one, so in dark
  mode it wore a near-white `#D8E4DD` outline while the panel beside it wore a faint one. Valid CSS,
  correct token name, and **only a computed-style read finds it** — it had been live for weeks.
- ⚠️ **`scrollIntoView` scrolls EVERY scrollable ancestor, the document included.** Bringing an item
  into view inside a scrolling panel also moves the whole page. On `/news/` that meant the page
  arrived **already scrolled past its own hero**, on load, before the reader touched anything — from
  a call whose only intent was to reveal the selected headline in a 320px column. Adjust the panel's
  own `scrollTop` instead, and pair it with `focus({preventScroll:true})`, because focusing an
  off-screen element scrolls the page for the same reason. ⚠️ **`news.html` has carried the identical
  call since it was written** and it is invisible there only because the panel happens to start at
  the top of a shorter page — which is what makes this a trap rather than a typo: the bug is in
  working code, and it moves the moment the code is reused somewhere taller.
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
  ⚠️ **Since 2026-08-23 the page claims something absolute:** the fonts are self-hosted, so it says
  *no third party is involved in showing you the page*. That is a stronger claim than the one it
  replaced and it is broken by the **first** font host, CDN or embed anyone adds — there is no
  longer a third-party section to append a row to.
- ⚠️ **`pyftsubset --layout-features` defaults to destructive, and the damage is invisible to every
  check that isn't a ruler.** The first subset of the Inter files named only `kern,calt,locl` and
  silently stripped **40** OpenType features, `tnum` among them. `font-variant-numeric: tabular-nums`
  was then written into 45 rules and did nothing whatsoever — the CSS was valid, and
  `getComputedStyle` read back `"tabular-nums"` exactly as authored, because the property was fine
  and the *font* had no such feature to apply. **The only check that catches it measures rendered
  width**: set "111" and "999" in the face and compare; proportional figures differ, tabular are
  identical. The full regeneration command, and why each kept feature is kept, live in
  `public/fonts.css` — subset from the original variable TTFs, never from the shipped woff2 files.
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
  ⚠️ **Since 2026-08-26 the permanent side no longer shows the day at all** — `whats-new.html` groups
  by month — so a one- or two-day disagreement is now invisible on *both* surfaces rather than one.
  The date still decides which month an entry lands in, which is the only way a wrong one shows.
- **Structural changes orphan `.claude/commands/`.** Both `/add-news` and `/add-skill` reference
  concrete file paths. Phase 1 broke them by adding `progress.js`; Phase 2 broke them again by moving
  everything into `public/`. Check them after any move or new shared module. **Third instance,
  2026-08-20, and a different kind:** `/add-skill` had never mentioned `updates.json` or the banner,
  though every live skill has an entry in both — a step done by hand each time and written down
  nowhere. ⚠️ **Drift is not only paths going stale; it is also steps that were never captured.** A
  command that still runs cleanly can be missing half the job.
  **Fourth instance, 2026-08-24, and the worst kind so far:** `/add-skill` said *"Google Fonts: use
  the same imports as the template pages"* a day after the templates stopped having any. Following
  it would have reintroduced the exact third-party request `privacy.html` now says is never made —
  ⚠️ **a stale command turning a correct legal page into a false one.** It also carried `#2D756F`
  and `Poppins Bold` in the thumbnail image prompt, baking a retired palette and a retired face into
  PNGs where nothing in this repo can inspect them. **So the check after a design change is not just
  "do the paths still resolve" but "does this command still describe the site"** — brand values,
  face names and font links copied into a command rot exactly like the catalogue does, and none of
  them fails a build.

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
- `deploy.bat "msg"` stages `public/` and `docs/`, builds, shows the diffstat, asks, then pushes.
  **Hardened 2026-08-22**, when a second long-lived branch made the old version dangerous: it was
  `git add .` + commit + push with no guards, so it swept up whatever was in the tree and pushed
  **whatever branch was checked out**. It now refuses off `main`, refuses if anything outside
  `public/`/`docs/` is dirty, and refuses if `npm run build` fails. Escapes: `--all`, `--yes`,
  `--no-build`. ⚠️ Three cmd.exe traps are written up in the file itself, all of which failed
  *silently* — most importantly `exit /b` from a doubly-nested block returning **0**, which made a
  refused push look like a successful one. Keep every failure exit at top level.
- Verification: automated checks are necessary but never sufficient for anything visual. Both Phase 1
  defects were found by a human looking at a browser, and neither was catchable by the passing test.
