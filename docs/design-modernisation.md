# Site design modernisation

**What this document is for.** The site's visual system is being modernised in discrete,
independently shippable pieces. This is where each piece is planned before it starts and what it
taught is recorded after it lands — the role [implementation-sequence.md](implementation-sequence.md)
plays for the numbered phases.

⚠️ **It exists because four changes shipped without it.** Between 2026-08-23 and 2026-08-24 the type
system, the palette, tabular figures and a documentation sweep all reached `main` with no plan, no
runsheet and no record beyond their commit messages. The commit messages were good, which is exactly
why the gap took a day to notice: nothing was lost, but nothing was *findable* either, and the fifth
change had nowhere to be argued about before it started.

**This is deliberately not a phase.** The numbered phases build features against a schema and have a
go-live step that touches production data. Design work touches no data, ships behind no migration,
and has no ordering constraint beyond "one thing at a time". Giving it a number would imply a queue
position it does not have.

---

## Status

| # | Piece | Landed | Commits |
|---|---|---|---|
| 1 | Route every `font-family` through tokens | 2026-08-23 | `897d7f9` |
| 2 | Self-host Inter, drop the Google Fonts request | 2026-08-23 | `78d9347` |
| 3 | Retire Poppins and Source Serif 4 — the site is Inter | 2026-08-23 | `6d7029e`, `5de3be1` |
| 4 | WCAG AA contrast pass | 2026-08-23 | `1b83276`, `474a55e` |
| 5 | Tabular figures, and the re-subset that made them real | 2026-08-23 | `b4c3cfa` |
| 6 | Bring docs and auth email templates back in step | 2026-08-24 | `a7619ea` |
| 7 | Retire the 52 `--teal` `rgba()` longhands — a verified no-op | 2026-08-24 | `1835753` |
| 8 | Retire the 88 old-palette `rgba()` longhands — a real repaint | 2026-08-24 | `e82d1af` |
| — | **Next** | — | **unassigned — see Candidates** |

Measured outcomes, not estimates:

```
fonts       266 KB over 10 third-party requests  ->  157 KB over 2 same-origin
contrast    205 failing elements                 ->  52 (all judgment calls, see below)
families    2 typefaces + a serif                ->  1 variable family, 100-900
auth mail   white-on-teal 5.40:1                 ->  7.22:1  (AA -> AAA)
```

---

## The rules that came out of this, and are now binding

These are decisions, not preferences. Reversing one is a conversation, not a refactor.

**1. One family. Hierarchy comes from weight, size and tracking — never from a second face.**
Two typefaces were doing two jobs and one now does both. What used to be *a 400-weight serif against
a 700-weight geometric sans* is now a weight spread that has to be kept deliberately wide:

```
editorial runs LIGHT    380 title (420 dark), 400 section headline
display   runs HEAVY    700 hero, 650 section head, 600 card title
```

⚠️ **Setting an editorial headline to 600 does not make it bolder — it reclassifies it as display.**
The gap between the two ends *is* the gesture. The title sits at 380 rather than 400 specifically so
it stays lighter than the 400 headline beneath it; flattening them leaves size as the only
distinction and the editorial voice disappears.

⚠️ **Dark mode carries a +40 weight compensation** on the same roles. Light-on-dark thins strokes
optically, so an identical number reads lighter against a dark ground. It is not a style choice and
it moves whenever the light value moves.

**2. Tracking ramps with size.** Inter is spaced for interface text — correct at 11px, conspicuously
loose at 72px. 329 declarations run from `-.006em` at 13px to `-.04em` above 56px. This single
correction is most of the visible difference between "the fonts changed" and "the site looks
different", and it is the opposite of what Poppins needed.

**3. Figures and badges are exempt from the weight and tracking ramps — 58 rules.** Tightening
numerals hurts legibility, and `59/100` or a step number is not a headline. They are *not* exempt
from the family: they are Inter like everything else, with `tabular-nums` where digits align in a
row or change in place.

**4. Colour decisions are made from usage shape, not from the failing number.** When a token fails
as text, count what else it does before darkening it:

| Token | Colour | Fills / borders | Decision |
|---|---|---|---|
| `--warm-gray` | 60 | 1 | pure text — darken it, nothing to break |
| `--deep-teal` | 218 | 62 | text colour that also fills — darken it |
| `--teal` | 103 | 174 | **a fill misused as text — stop using it as text** |

`--teal` was the worst offender at 2.49:1 and darkening it would have been the obvious fix and the
wrong one. Repainting every rule, card edge, icon fill and focus ring on the site to solve a text
problem is a bad trade. 119 rules moved to `--fg-brand`, which already means *brand colour, safe to
read* and is theme-aware.

**5. No new typefaces and no new font host — and that constraint got sharper, not weaker.**
[privacy.html](../public/privacy.html) now states that **no third party is involved in showing you
the page**. That is an absolute claim, and the *first* font host, CDN or embed anyone adds breaks
it. There is no third-party section left to append a row to. See
[dashboard-design-brief.md](dashboard-design-brief.md) §2, which carries the same constraint for new
surfaces.

**6. Replace literals alongside the token they are.** A bare `#2D756F` *is* `--deep-teal` written
longhand. 63 were replaced with the token definitions in `474a55e`; leaving them behind splits one
colour into two that drift independently.

---

## Traps this work produced

Each of these cost real time. The first three are also in [CLAUDE.md](../CLAUDE.md); they are
repeated here with the reasoning that did not fit there.

- ⚠️ **`pyftsubset --layout-features` defaults to destructive.** The first subset named only
  `kern,calt,locl` and silently stripped **40** OpenType features, `tnum` among them.
  `font-variant-numeric: tabular-nums` was then written into 45 rules and changed **not one pixel**.
  Nothing surfaced it: the CSS was valid, the font loaded, and `getComputedStyle` read back
  `"tabular-nums"` exactly as authored. The property *was* being honoured — the feature it asks for
  was not in the file. **Only rendered width catches this.** Set `111` and `999` and compare;
  proportional differ (43.48 / 70.08), tabular are identical (77.34 / 77.34). The command and the
  justification for every kept feature live in [public/fonts.css](../public/fonts.css).
- ⚠️ **The tokens live in ELEVEN `:root` blocks, not one.** The 10 skill pages do not link
  `styles.css` — they carry their own `:root` and hold two thirds of all declarations between them.
  A `var()` with no definition in scope falls back to the browser default, so missing them would
  have silently unstyled the deepest content on the site. **Any new token has to land in all eleven**,
  and the same asymmetry is why `@font-face` could not live in `styles.css` and needed
  [public/fonts.css](../public/fonts.css) instead — a file linked by all 19 pages *and* BaseLayout.
- ⚠️ **A single-class component rule loses to a two-class descendant rule from the page's prose
  styles.** Two of the four structural contrast failures were this exact shape. `.doc-toc-label` is a
  `<p>` inside `.doc-body`, so `.doc-body p` (0,2,0) beat it (0,1,0) on **colour and font-size** — the
  "Contents" label had never once rendered as designed. `.doc-btn` had it worse: `.doc-body a` set
  `color:var(--teal)` and won, so the primary call to action on why-sign-up rendered teal on
  deep-teal at **1.92:1** — the least readable thing on the site was the button asking you to sign
  up. **Anything named `.doc-*` that sets colour or size needs `.doc-body` in front of it.**
- ⚠️ **Light mode hides contrast bugs that dark mode exposes.** `.doc-toc-label` passed in light
  (navy on off-white) and failed at 1.72:1 in dark. Sweep both themes or the sweep is half a sweep.
- ⚠️ **A comment that states a value is a claim about the code and rots exactly like a selector.**
  `5de3be1` had to correct twelve files' comments naming the old weights, and the
  `--font-display`/`--font-body` comment still described its commit-1 purpose — true when written,
  false the moment the tokens were repointed at Inter.
- ⚠️ **A literal is only a safe refactor if the token it spells out has not moved since.** This one
  was got wrong *in this document*, which is why it is here: the `rgba()` longhands were first
  written up as "cosmetic drift" and "mechanical, low risk", on the reasoning that none of them is a
  text colour. That reasoning was sound and the conclusion did not follow. 52 of them spell out
  `--teal`, which never moved, and are genuinely inert. 88 spell out tokens that **did** move, so
  replacing those repaints the site. **Before calling a literal-to-token sweep mechanical, diff the
  literal against the token's value today** — same-value is a refactor, different-value is a design
  change, and the two look identical in the source.
- ⚠️ **Brand values copied into a command or a template rot where no gate can see them.**
  `/add-skill` carried `#2D756F` and `Poppins Bold` into a thumbnail image prompt, so the values end
  up baked inside a PNG. The auth email templates carried the old teal into mail. Neither fails a
  build, and neither is visible in a diff of the site.

---

## Knowingly still wrong

Recorded so these read as decisions rather than oversights. Each has a reason it was not done.

| Item | Size | Why it is still open |
|---|---|---|
| Remaining AA contrast items | **52 elements** | Judgment calls, not bugs. Chiefly the deliberate "coming soon" dimming — `.scard.cs .ssum` at **2.24:1** — where the low contrast *is* the signal that the item is not ready. Fixing it means designing a different affordance, not picking a darker grey |
| ~~Old-palette `rgba()` longhands~~ | ~~88~~ | ✅ **Done 2026-08-24, `e82d1af`.** The site now holds **no old-palette literal in any notation**, so the next palette move is a token edit rather than a hunt. Row kept because the reasoning is the general lesson — these were *not* cosmetic, and calling them so is the mistake recorded in the traps above |
| ~~`--teal` `rgba()` longhands~~ | ~~52~~ | ✅ **Done 2026-08-24, `1835753`.** Verified inert across 201,380 comparisons. Row kept rather than deleted because *why* it was separable — `--teal` never moved — is the reasoning the remaining 88 turn on |
| Thumbnail prompt terracotta | 1 value | `#C77B5F` was the real token until `2f92728` (2026-07-20) replaced it with `#8A4B2C`. Correcting the prompt alone makes skill eleven's artwork diverge from the ten already shipped — it needs one regeneration pass over the whole set, which is its own piece of work |
| Prod auth email templates | 2 files | Pasted into both dev and prod, and **proven by a real send on dev only**. A localhost sign-up resolves to the dev project ([supabase-client.js:61](../public/supabase-client.js:61)), so the dev send cannot distinguish "both pasted" from "one forgotten". A password reset on `amplifiedthinker.com` closes it |

---

## Candidates for the next piece

Not a queue. Listed with what each would actually cost, so the choice is informed.

- ✅ **~~Retire the `rgba()` longhands~~ — DONE 2026-08-24, as two pieces (`1835753`, `e82d1af`).**
  Kept here because the *reasoning* is the reusable part, and because the first version of this entry
  got it wrong: it read "mechanical, low risk, least interesting, highest leverage". ⚠️ **The first
  half of that was false.** A longhand is only a refactor if the token it spells out has not moved
  since — and that is what split one job into two:

  | | Count | Token | Repainting it | |
  |---|---|---|---|---|
  | `rgba(91,167,159,…)` | 52 | `--teal`, never moved | **true no-op** | `1835753` |
  | `rgba(45,117,111,…)` | 83 | deep-teal, moved to `#26605B` | **a real repaint** | `e82d1af` |
  | `rgba(139,138,133,…)` | 5 | warm-gray, moved to `#6E6D68` | **a real repaint** | `e82d1af` |

  Both replaced with `color-mix(in srgb, var(--token) N%, transparent)` — not a new dependency, the
  plan pages already used `color-mix`. ⚠️ **The `--token-rgb: 38,96,91` + `rgba(var(…),.35)`
  alternative was rejected** despite wider support: it creates a second token holding the same colour
  in a different notation, which is the exact drift being eliminated.

  **Outcome: the site holds no old-palette literal in any notation.** The next palette move is a
  token edit, not a hunt — which matters because `474a55e` had already replaced 63 literals
  alongside the token definitions and still missed these 140.

  **Piece one measured 0 differing** across 201,380 comparisons. **Piece two measured 331 changed
  element-properties**, all of them the exact token move with alpha preserved — 331 rather than 88
  because one rule paints many elements, and one `color` cascades into `border-color`,
  `outline-color` and `text-decoration-color`, which all default to `currentColor`. Only five of its
  28 rules were perceptible; the coming-soon summary text was much the largest (Δ35) and the only one
  affecting legibility, improving **2.24:1 → 2.85:1**. Still failing AA, so it did not close that
  item — and since the dimming is deliberate signalling, it was reviewed by eye for whether the
  cards still read as not-ready.

  ⚠️ **Both pieces needed three checks before a single edit**, and any future token-to-literal sweep
  needs the equivalent: is the token redefined under `[data-theme="dark"]` (an override makes a
  "no-op" a visual change); is the token in scope in every file that uses the literal, remembering
  the **eleven** `:root` blocks; and does any JS read `getComputedStyle` (nothing here does, so the
  changed serialization has no consumer).

  ⚠️ **And the sweep has two blind spots — neither piece was fully covered by measurement.**
  `:hover`/`:focus` rules are never triggered (15 in piece two alone), and
  `::-webkit-scrollbar-thumb` is unreachable by `querySelectorAll` (10 more). Both were verified by
  reading source and by eye instead. **Any claim of "N comparisons, 0 differing" silently excludes
  every interactive state**, and should say so.
- **Design a real "coming soon" affordance.** Retires the last text-contrast failure by removing the
  reason for it — a badge, a reduced-opacity *card* rather than reduced-opacity *text*, or moving
  unbuilt skills out of the list entirely. Closes an accessibility item with a design decision.
- **Regenerate the ten video thumbnails** on the current palette. Unblocks correcting `/add-skill`'s
  prompt, which is otherwise permanently pinned to a July colour.
- **Spacing and radius scales.** Nothing has been done here; the existing scales are inherited rather
  than designed. Would need the same token-then-repoint discipline the type work used.
- **Depth, layering and motion.** The abandoned `explore/design-depth` branch explored this and was
  deleted 2026-08-24 — it survives only in the Drive git bundle. ⚠️ Its two documented traps are
  worth reading before anything similar is attempted: `nav.js` owns `data-theme` and overwrites a
  manually-set attribute, and a stray `*/` silently deleted a `#site-nav` rule with nothing erroring.
- **An ambient gradient field behind the page** — the blurred colour wash, as seen on the reference
  page that prompted it. **Assessed 2026-08-28 against `future-skills.html` at `a3f6fb1`; not
  attempted.** The layer is the cheap half: roughly fifteen lines, no markup change at all, if the
  ground moves to `<html>` so `body` can go transparent and carry the wash on a `body::before` at
  `z-index:-1` — which is what lets every section stay untouched. ⚠️ **Leave the ground on `body` and
  it paints straight over the wash.**

  ⚠️ **The expensive half is that only one section can show it.** The page is six full-bleed bands
  and five paint an opaque background, so a fixed layer behind them is visible through **25.4% of the
  page height** and nothing else — measured, not estimated:

  | Band | Background | Share of height | Shows it |
  |---|---|---|---|
  | `.hero` | `#1B4A44` | 7.7% | no |
  | `.why` | *none* | **25.4%** | **yes** |
  | `.chart-section` | `var(--bg-surface)` | 13.0% | no |
  | `.intro` | `#EEF4F0` | 17.4% | no |
  | `.library-wrap` | `var(--bg-surface)` | 29.5% | no |
  | `.site-footer` | `var(--charcoal)` | 3.0% | no |

  So the real cost is opening five bands up — translucent backgrounds plus `backdrop-filter` — which
  is a different and much larger piece of work than "add a layer", and it lands on the **largest**
  band on the page (`.library-wrap`, 29.5%).

  ⚠️ **Two bands can never take it, so this can never be a full-page treatment.** `.hero` and
  `.site-footer` both carry light text on dark grounds; making either translucent puts white type
  over a pale wash. That is a contrast failure, not a style choice, and the effect has to stop at
  their edges by design.

  ⚠️ **It also drags in `.intro`'s hardcoded `#EEF4F0`**, which is the same one-line fix the ground
  work needs — light-mode only, because `[data-theme="dark"] .intro` already points at
  `var(--bg-sunken)`.

  A three-pane specimen (current / wash only / wash + bands opened, embedding the real page in
  iframes) is on the unmerged `explore/ambient-field` branch, with a copy and a written-up finding in
  the Drive backup's `discovery/` folder. ⚠️ **Open it through the dev server, never as `file://`** —
  relative `<link>` hrefs do not resolve there, `styles.css` never loads, every `var(--bg-*)`
  collapses to transparent, and all three panes render an unstyled page. That artifact reads as a
  *finding* — "the bands ARE transparent" — and it produced exactly that wrong answer on the first
  measurement.

⚠️ **Pick one and finish it.** The reason six pieces shipped cleanly is that each was independently
verifiable and independently revertible. "Modernise the design" is not a piece of work; "the site is
Inter" is.

---

## How design work gets verified here

Automated checks are necessary and never sufficient — but the reverse is also true, and both halves
of this were learned the hard way.

**1. Prove a no-op is a no-op.** `897d7f9` was deliberately inert and was *verified* inert rather
than assumed: computed `font-family` tallied for every element on all 22 pages, before and after —
**10,091 elements, 0 differing.** A refactor that claims to change nothing should be made to prove
it.

**2. Assert the RENDERED result, never the input that should have produced it.** The `tnum` failure
passed every check that read CSS or computed style, because both were correct. Measure width,
sample pixels, read `getAttribute`. This is the same category as the `[hidden]` and `returnParam()`
defects in [CLAUDE.md](../CLAUDE.md).

**3. Sweep both themes, and set the theme the way the site does.** `nav.js` owns `data-theme` and
overwrites a manually-set attribute — which once produced a bogus "11 dark contrast failures" that
were really 4. Use `localStorage.setItem('theme','dark')` and reload.

**4. Read paint-only properties across a frame boundary.** Reading them in the same tick as a theme
switch returns the *previous* value. That cost one false bug report.

**5. ⚠️ Normalise the colour before comparing computed values — never hash the raw string.** Modern
CSS colour functions serialize in their own notation, and the same colour has more than one spelling:

```
rgba(91, 167, 159, 0.4)                        <- what a literal computes to
color(srgb 0.356863 0.654902 0.623529 / 0.4)   <- what color-mix() computes to
```

Identical colour — `0.356863 x 255 = 91`. In `1835753` a string hash reported **11 of 22 pages
changed** when nothing had. Convert to one canonical form first. ⚠️ And when converting, remember
those channels are **0–1 floats, not 0–255**: misreading them as bytes once invented a "mystery grey
`#777978`" that did not exist.

**6. ⚠️ Kill transitions before sampling, or you measure a value mid-flight.** Setting `data-theme`
does not swap colours instantly — anything with a `transition` on an affected property animates, and
**CSS interpolates colour in `oklab`**, so a sample taken during the 200ms reads as
`oklab(0.67709 -0.0762886 -0.00899804 / 0.25)` and matches nothing on either side. This survived
rule 4 above: the value was stable across a frame boundary, it was just the wrong one. In `1835753`
it left `index.html` as the last apparently-changed page after the serialization fix, because
`.scard` carries `transition: border-color .2s` and `index.html:139` sets that border in dark. Inject
this into the frame before switching theme:

```css
*, *::before, *::after { transition: none !important; animation: none !important }
```

**7. A human looks at it.** The 350-weight title passed every automated check and read thin to the
only instrument that matters. Both Phase 1 defects were found the same way. ⚠️ **The exception that
proves the rule:** a verified no-op like `1835753` is the one case where there is nothing for a human
to see, which is precisely why it has to be proved by measurement instead.
