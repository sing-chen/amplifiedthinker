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
| 9 | The tiles go quiet — hue at four signal points, never as fill | 2026-08-28 | `82e5f5a` |
| 10 | The Amplitude hero, with the announce card | 2026-08-28 | `058fdad` |
| 11 | The two-tone wordmark | 2026-08-28 | `1b987ba` |
| 12 | Asymmetric tiles — Future Skills leads | 2026-09-28 | `929d473` |
| 13 | Coming-soon affordance, label contrast, type floor, field edges | 2026-09-28 | `a3d2178` |
| 14 | Home: the announce card never empties, a larger and shorter intro | 2026-09-28 | `80e8307` |
| 15 | The footer leaves charcoal for pine, darker than the page in dark | 2026-09-28 | this commit |
| — | **Next** | — | **unassigned — see Candidates** |

Pieces 9–11 were built on `feat/amplitude` and merged to `main` on 2026-08-28. ⚠️ Remaining
verification at merge time: `npm run verify:stamp` against the deploy, and the production eye
pass on amplifiedthinker.com — both themes, the entrance on a real phone.

Measured outcomes, not estimates:

```
fonts       266 KB over 10 third-party requests  ->  157 KB over 2 same-origin
contrast    205 failing elements                 ->  52 (all judgment calls, see below)
            -> piece 13 closed the two recorded ones; no text judgment call remains
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

**7. The type floor (piece 13, 2026-09-28).** On phones, running body copy is never under **15px**.
Nothing, at any width, is under **11px** — labels, eyebrows, pills, badges, table headers included.
The floor only ever raises: weights stay where rule 1 puts them, and tracking follows rule 2's ramp
for the new size. ⚠️ **"Body" is decided by what the reader is reading, not by the element.** The News
headline rows are body (the page is read by them); contents lists, form hints, card titles,
citations and diagram labels are not, and stayed below 15px by the owner's decision.

**8. Text fields: 16px on phones, and an edge you can see.** Every text field is **16px** at phone
width, because iOS zooms into anything smaller on focus and stays zoomed. Every field's border is
**`--fg-2`** (`--d-fg-2` on the skill pages), which clears the **3:1** a field boundary needs
(WCAG 1.4.11) in both themes. The faint `--line`/`rgba(…,.18)` edges it replaced measured about
1.4–1.6:1. A new field takes both, or it is the failure this rule exists to stop.

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
| ~~Remaining AA contrast items~~ | ~~52 elements~~ | ✅ **Closed by piece 13, 2026-09-28, `a3d2178`.** The two recorded judgment calls are gone: the coming-soon dimming (`.scard.cs .ssum`, last measured 1.95:1) was replaced by a real affordance, and the announce card's clay (accepted at ~3.4:1, re-measured at 3.18:1) was lightened to 4.93:1. A site-wide scan after it found no text below threshold. Row kept because the reasoning stands: the fix for the dimming was a design decision, not a darker grey |
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
- ✅ **~~Design a real "coming soon" affordance~~ — DONE in piece 13, 2026-09-28.** Retires the last text-contrast failure by removing the
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

## The Amplitude pieces — 9, 10 and 11 (`feat/amplitude`, merge pending)

The homepage redesign, planned here before the first edit and now built. All three pieces were
designed as LIVE SPECIMENS first — an assembled homepage mock and an argued proposal, iterated on
sight with real content — so the decisions below were taken looking at the thing, not at a
description of it. The specimens remain the reference for every visual question this section
leaves open.

**Revised the same day, after the production eye pass:** the canvas waveform — the hero's and the
three tile motifs — was removed at `main` within hours of shipping. The owner's call, and the right
one: the interaction's appeal was novelty, and ornament that needs novelty to justify itself fails
this document's own restraint rules. What was removed removes cleanly — the wave engine, the motif
engine, and the four canvases; what stays is everything structural: the two-weight headline, the
glass card (still over the lamp and the light field), the entrance, and the quiet tiles, whose CTAs
now share one baseline via `flex:1` on the description. The hero became content-height, and the
explore section moved up to close the gap. ⚠️ **Two consequences for the record below:** the
"first getComputedStyle colour consumer" note in piece 9 is REPEALED — nothing reads computed
colour again, and the token-sweep checklist's answer returns to *nothing does*; and the
`document.hidden` lesson now applies to the lamp's loop rather than the wave's.

The announce card was then **re-frosted lighter** in the same sitting: with the wave gone the dark
glass merged into the pine, so the pane became white-tinted glass with a lit top edge and a
`brightness(1.08)` lift, and a second sage glow sits in the hero behind the card's region — the
environmental light the wave used to provide. ⚠️ **Recorded judgment call:** the lighter ground
costs the clay accents contrast — the mark and link read **~3.4:1** on the frosted pane (11px/13.5px,
lightened one step to `#E29A6F` to claw some back; the no-blur fallback reads ~4.9:1). Owner-approved
material trade, same register as the coming-soon dimming. ✅ **Superseded by piece 13 (2026-09-28):**
re-measured at 3.18:1 against the lightest pane pixels at 1280, below what was accepted, and
lightened to `#F0C5A6` (4.93:1 there, 5.45:1+ on phones) on the owner's decision.

**What building them taught, beyond the plan:**

- **The range-edit discipline earned its keep in the other direction.** A script that spliced the
  announcement code used an end-anchor (`'  }'`) that matched *inside* a nested close two lines
  early, truncating `escapeHTML`. `node --check` on every extracted inline script caught it before
  the build did — the check the news-actions incident mandated, doing its job on the first big
  range edit since.
- **The card's grid binding measured exact**: 0.0px deviation at both edges against the headline
  and CTA rows, at the first rendered check. Binding alignment structurally beats tuning it.
- **`document.hidden` gates the wave's rAF loop**, so a tab loaded in the background draws nothing
  until its first `visibilitychange` — correct behaviour that *looks* like a broken canvas to any
  headless check. A rendered assertion on the wave must run in a visible tab or force a draw first.

### Piece 9 — the three tiles become quiet surfaces

`public/index.html` only. The pastel section cards invert the colour rule this document fixed —
the loudest colour on the page used as FILL — so the re-cut moves each surface's hue to four
signal points (hairline border, eyebrow, CTA, motif) on a quiet card, and restructures the
hierarchy into the site's reading order: hue eyebrow → editorial-light headline (380, 420 dark)
→ body → action. The section label sentence is promoted word-for-word to an editorial headline
under an "Explore" kicker.

- **Light hues are written as the tokens they are** — skills `var(--deep-teal)`, people
  `var(--moss)`, news `var(--terracotta)` — never fresh literals (rule 6 above). The dark hues
  are the page's existing dark-mode literals (`#7FC4B8` / `#9BB577` / `#C97A4A`), now named once
  and scoped to the section rather than scattered per property.
- **Each tile carries the hero's waveform in miniature** — a per-tile canvas in the tile's hue,
  resting quiet, amplifying on hover/focus, decaying after. One engine, ~40 lines.
- ⚠️ **SYSTEM CHANGE: the motif engine reads its colour with `getComputedStyle`.** The
  token-sweep checklist above asks "does any JS read getComputedStyle" and the answer has always
  been *nothing does*. From this piece on, something does — future sweeps must account for it or
  their "no consumer" step verifies a stale assumption.
- Verification: computed-style sweep in BOTH themes with transitions killed first; hover/focus
  states by eye (unreachable by `querySelectorAll`); reduced-motion renders the motifs static;
  no horizontal overflow at 375/768/1100; a human looks at it.

### Piece 10 — the Amplitude hero, with the announce card

`public/index.html` **and `public/privacy.html` in the same commit** (see below). Replaces the
hero and RETIRES the announcement banner as a surface: the two-weight headline ("AI is raising
the floor." at 200 / "Raise your ceiling." at 800), a live canvas waveform, a cursor lamp, and
the announcements as a smoked-glass card right of the headline, its edges grid-bound to the
headline row and the CTA row. `ANNOUNCEMENTS`, the expiry rules, the month-label reasoning and
the `/api/news/recent.json` fetch all survive — only the item template and the container change.

Decisions already taken, in the specimens, on sight:

- **Autoplay ends.** The carousel was the one element on the site moving without being asked.
  Items beyond the newest are seen on request via a stepper; a tabular count states the depth;
  What's New remains the permanent record. The frame is FIXED — every item padded to the
  tallest, so nothing bleeds into the window and the card never resizes while stepping.
- **The hero eyebrow goes, and "About me" leaves the hero.** The two-weight headline becomes
  the site's first words; About stays in the nav and the footer.
- **The weight system gains endpoints 200 and 800.** ⚠️ The hero takes NO dark +40 compensation
  — it is a fixed pine world in both themes, so there is nothing to compensate for. Recorded so
  nobody "fixes" it.
- **The entrance is the motion doctrine's ONE exception** — a ~1.3s arrival, once per session,
  fully settled after; `prefers-reduced-motion` skips it entirely and the design must be
  complete without it. ⚠️ The session guard is a **new sessionStorage key**, and privacy.html
  names every key this site sets — it changes in the SAME commit, with the standing
  cross-check against the sibling Promptly site.
- **The glass card is the site's first translucent surface.** Smoked, not clear — tint + blur +
  saturate + darken, so text contrast stays stable whatever passes beneath. Near-solid fallback
  where `backdrop-filter` is unsupported; fully solid under `prefers-reduced-transparency`.
  Glass is admitted ONLY where something real passes beneath it — the wave's crests graze the
  card's corner with an amplitude MEASURED against the card's rect on every resize, never
  hardcoded — which is also why the tiles stay matte.
- ⚠️ **Copy joins the promise list**: "Hand-built. Private. Free." rots like every other claim —
  grep for it when anything makes it untrue. The meta and og descriptions get reviewed against
  the new headline in the same sitting.
- ✅ **`.claude/commands` re-read and updated in the same sitting** — `/add-skill` documented the
  announcement-banner step, and the surface it feeds was renamed and relocated. Its wording now
  describes the card (including the four-line clamp replacing the single-line ellipsis rule), and
  `/add-news`'s one banner reference moved with it. The sixth instance of command drift, headed
  off rather than logged.

### Piece 11 — the nav wordmark, two-tone (already on the branch)

`public/nav.js`, 9 lines, repaints all 19 pages + BaseLayout: "Amplified" at 700 against
"Thinker" at 300/62% — the weight-spread gesture applied to the site's own name — with the
15px-appropriate −.01em from the tracking ramp. The 300 weight is available because fonts.css
retains the full 100–900 range. ⚠️ The frosted-glass nav bar from the specimen is NOT part of
this piece; it is a separate decision with its own fallback stack, and it has not been taken.

---

## Piece 12 — asymmetric tiles (landed 2026-09-28, `929d473`)

`public/index.html` only, CSS plus nothing else. Prompted by a `taste-skill` audit on 2026-09-28,
whose clearest finding was the three equal tiles: identical height, side by side, all text on
white. Piece 9 made them quiet; this makes them unequal, because they are. Future Skills is the
site's main route in, so the layout now says so.

- **Desktop:** Future Skills takes a `1.45fr` column and both rows; My People and News stack
  beside it on `1fr 1fr` rows, so the pair always matches the lead tile's height exactly.
- **The lead title goes poster-size** — `clamp(34px,3.4vw,44px)`, `-.035em` from the tracking
  ramp — and **stays editorial-light** (380, 420 dark). Size leads here, not weight; rule 1 above.
- **The space between the description and the CTA is left open on purpose.** It is the cost of
  the asymmetry, and it was paid rather than filled.
- **≤900px:** the lead tile spans the full width over the other two; the title steps down to
  `clamp(26px,4vw,32px)`. **≤700px:** one column.

⚠️ **Two fillers for that space were built and rejected on sight — do not re-propose them without
a new reason:**

- **A list of the live skills.** Worked on desktop, but added height to an already long column on
  mobile, and it made the homepage a second copy of editorial data that `/add-skill` would have
  had to keep in step — the command-drift trap in [CLAUDE.md](../CLAUDE.md).
- **A hover gesture** — two hairlines, a "ceiling" rising on hover to echo the headline. It
  respected the motion doctrine (moves only when asked) and was still the owner's no. Same
  verdict as the tile waveforms removed in the Amplitude revision: ornament that has to justify
  itself.

Verification: tile heights and gaps measured at 1280, 920 (narrowest two-column width), 768 and
375, dark mode at 375, no horizontal overflow at any of them. ✅ Production eye pass done the
same day, after `verify:stamp` confirmed `929d473` was live: 1280 in both themes (544 / 260 / 260,
title 420 in dark) and 375 in light, no overflow.

---

## Piece 13 — the review's colour and type decisions (landed 2026-09-28, `a3d2178`)

Came out of a site-wide accessibility review run with the vendored `ui-ux-pro-max` skill. Everything
the review found that had one right answer shipped as three accessibility batches the same day;
what it found that touched **this document's rules** came back to the owner as four decisions, and
this piece is those decisions plus four follow-ups. Reviewed before merge on a before/after page of
37 screenshot pairs with the measured ratios beside each.

| Decision | What shipped | Measured |
|---|---|---|
| Coming soon | The whole-card `opacity:.68` is gone. Full-contrast text, a solid badge (`--fg-1` on `--bg-sunken`), a dashed `--line-strong` card, no hover. Still not clickable; screen readers still hear "Coming soon" | summary 1.95 → 7.11 (light), 1.60 → 5.90 (dark) |
| My People names | The photo gradient starts higher and ends deeper (.94); standard tiles 200 → 250px on phones so names clear faces | worst name 5.76 → 7.47, at the 5th-percentile photo pixel |
| Labels, by rule 4 | Four bugs: primer active rail number, plan example label, systems-thinking "Balancing" in dark, the dark Full Learning Plan card's lost fill. About a dozen near-misses across plans, primers, search, News, Future Skills, Learning and the home card | 1.26 → 8.02, 1.80 → 5.25, 2.48 → 10.15; every near-miss ≥ 4.5 |
| Type floor | Rule 7 above | 22 pages, no horizontal scroll at 320/390/1280 |
| Follow-ups | Announce-card clay `#E29A6F` → `#F0C5A6`; News headline rows 15px on phones; rule 8 above | clay 3.38 → 4.93; field edges 1.4–1.6 → 4.6–6.7 |

**What it taught:**

- ⚠️ **A recorded judgment call can drift out from under its own record.** The clay was accepted at
  "~3.4:1" and measured 3.18:1 a month later — the frosted pane had been lightened after the number
  was written. A ratio in this document is a measurement with a date, not a property of the colour;
  re-measure before leaning on one.
- ⚠️ **The first review number was already stale too.** Brené Brown's name was reported at 1.8:1; by
  the time the fix ran, the owner's own commit that morning had lifted it to 5.76:1. Measure at fix
  time, and say which number the before/after is against.
- **Several "contrast" items were really the parallel-token trap again.** "Balancing" was an inline
  `var(--deep-teal)` with no dark counterpart, and the dark Full Learning Plan card lost its fill to a
  later `[data-theme="dark"] .lcard` of equal specificity. Neither is a colour choice; both are the
  failure CLAUDE.md already describes, found by measuring rather than reading.
- **Raising sizes moves layout, so the floor needed three layout fixes:** plan habit rows stack their
  label above the value under 480px, the sign-up summary box grows, and the Creative Thinking plan's
  SCAMPER grid (clipped on phones before this piece) now wraps.

Exempt and left as they are: disabled Previous controls (WCAG exempts inactive controls), decorative
separators, the decorative quote mark on My People, and the nav wordmark's "Thinker" at 4.48:1
(logos are exempt, and the two-tone wordmark is piece 11's recorded choice).

---

## Piece 14 — the announce card's empty state, and the hero intro (landed 2026-09-28, `80e8307`)

`public/index.html` only. From a second `taste-skill` pass on the homepage, same day as piece 12.

- **The announce card no longer empties.** Every curated announcement had expired by 17 September
  and the newest story was 18 days old, past the 14-day window, so the card hid itself and the
  right half of the desktop hero was bare pine. Found by reading the dates, not by looking: the
  specimens and every check since always had something fresh to show. Now, when no curated item
  survives and no story is inside the window, the single newest story shows as **"Latest story"**
  with its full date. It states its age instead of passing as new. The window, the cap and the
  expiry rules are unchanged; a failed or empty feed still hides the card.
- **The intro is `clamp(15px,1.25vw,17px)`**, was `clamp(14px,1.1vw,16.5px)`. It read 14px at
  1280, smaller than the 15px phones get under rule 7. Now 16px at 1280 and 17px from 1360.
- **The intro is 26 words, was 32**: *"The skills that have always set people apart, as primers and
  plans you can finish. Plus the people and news worth your time. Hand-built. Private. Free."*
  Five lines to four on a phone. "Hand-built. Private. Free." is unchanged and stays on the promise
  list (piece 10). The em-dash here and the one in the Future Skills tile went at the owner's call.
  ⚠️ CLAUDE.md's rule still stands: `taste-skill`'s em-dash ban is no reason to rewrite editorial
  copy on its own.

Checked and deliberately left: the lead tile's open space (piece 12), the tile eyebrows (piece 9),
the lamp and entrance (piece 10), and the card's grid binding, which leaves a short single item
with empty glass below it. Normal-length items fill it. The footer's `--charcoal` against the
pine page was raised as a site-wide decision and is not part of this piece.

---

## Piece 15 — the footer ground (2026-09-28)

`public/styles.css` only, reaching the 12 surfaces that carry `.site-footer`: the eight hand-written
pages and, through BaseLayout, sign-in, account, learning and News. Raised by piece 14's review and
decided by the owner from a four-way comparison on two pages in both themes.

- **New token `--bg-footer`: `#122E2A` light, `#0E1917` dark.** The footer was `--charcoal`, the
  only neutral grey on a green site, and in dark it sat LIGHTER than the page (1.26:1 above
  `#142320`), so every page ended on a paler band. Light now takes the hero's deepest pine stop, so
  the homepage starts and ends on the same colour. Dark now sits below the page.
- ⚠️ **`--charcoal` did not move and must not.** It is also `--fg-1`, the light body text colour.
  That is why the footer has a token of its own rather than a new value for the old one.
- **No text colour changed.** The smallest footer text (55% white) measures 5.42:1 light and
  6.10:1 dark, up from 5.08:1. The nav's `#1B4A44` was rejected for this: it drops that text to
  4.26:1, and it would need brightening.
- `search.html`'s `.search-footer` keeps its own fixed `#1B4A44`, matched to its own hero. Checked
  unchanged in both themes.

Verification: computed background and the lowest text contrast read on all 12 pages plus Search,
in both themes. Production eye pass still owed.

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
