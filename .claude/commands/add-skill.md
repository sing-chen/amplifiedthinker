---
description: Build primer.html and plan.html for a new Amplified future skill, matching the existing template pages exactly
argument-hint: [Skill Name] (optionally with source notes, e.g. "Systems Thinking — from the Future Skills Development Plan doc")
---

You are helping build two pages for the Amplified Thinker future skills learning hub — a static HTML site at amplifiedthinker.com, deployed on Vercel from GitHub. The site teaches workplace-relevant future skills grounded in the WEF Core Skills 2030 framework.

The two pages to build:
- `primer.html` — a slide-deck format skill introduction (typically 8–10 slides)
- `plan.html` — a full scrolling learning plan (typically 14 sections with a fixed left nav rail)

The skill to build is: **$ARGUMENTS**

---

## FILE LOCATIONS — read this before editing anything

Phase 2 introduced an Astro build. **Every site file now lives under `public/`**, which Astro copies
into the build untouched. Served URLs are unchanged, so this creates two kinds of path that look
identical but are not:

| Kind | Example | Needs `public/`? |
|---|---|---|
| A file you read or write | `public/skills/[slug]/plan.html`, `public/nav.js`, `public/search-index.json` | **Yes** |
| A URL inside a page's HTML | `../../nav.js`, `<img src="skills/[slug]/video-thumbnail.png">`, `url` values in `search-index.json` | **No — never** |

Adding `public/` to a URL inside a page breaks it at runtime; omitting it from a file path writes to
the wrong place, or fails. The instructions below are already correct on both counts — follow them
literally rather than normalising them.

New Astro-built pages live in `src/pages/`, but skill pages are **not** among them: they stay
hand-authored in `public/`, because each `plan.html` carries ~49 inline `onclick` handlers that
Astro's default script bundling would break.

---

## STEP 1 — READ THE TEMPLATES

Canonical reference pages: [public/skills/creative-thinking/primer.html](public/skills/creative-thinking/primer.html), [public/skills/creative-thinking/plan.html](public/skills/creative-thinking/plan.html). Read both in full before doing anything else — they are the patterns to match exactly, not starting points to improve on.

If the user attaches or names different/additional reference pages in their message, read those instead (or in addition) and treat them as canonical for this build. If two reference pages disagree on a component pattern, stop and ask the user which one to follow rather than guessing.

Pay attention to:
- Design tokens (colour palette, typography, spacing)
- Component patterns (cards, callouts, accordions, evidence filter grids, ladders, scenario columns, indicator panels, knowledge check questions, habit-day accordions, progression stages, resource tables)
- CSS conventions (class naming, custom properties, alternating section backgrounds, ghost numerals, mobile media queries)
- JS patterns (scroll spy, accordion toggles, knowledge check reveal, habit-day toggle, Prev/Next nav)
- Accessibility patterns (aria-expanded, aria-controls, aria-current, focus-visible, prefers-reduced-motion, skip links, live regions)
- nav.js integration (skill bar, breadcrumb, Primer/Full Plan switcher)

Note: different skills will not always use the same sections or components. A mental model diagram in one skill may be a Ladder of Inference; in another it may be something entirely different. Match the component *style*, not the content.

---

## STEP 2 — IDENTIFY THE SKILL

**Source material** (use whichever applies):

**Option A** — If the skill appears in the Future Skills Development Plan document, and the user has attached/named it or it's findable in project files, use:
- The WEF taxonomy definition as a starting reference (not a verbatim quote — reframe it in Amplified's voice)
- The learning outcomes as a framework for content generation
- The out-of-scope list as a boundary reference
- Do NOT use the document's overview text or resource links directly — these were written for a different format and tone

If you can't locate the document, say so and ask the user to attach it or confirm you should proceed under Option B.

**Option B** — If the skill does NOT appear in the document, or the document entry is thin:
- Propose your own definition following the exact pattern of definitions in the template pages: one disciplined sentence naming the skill, what it requires, and what it produces
- Flag clearly that this is a proposed definition and ask for approval before proceeding

---

## STEP 3 — CONTENT PLANNING (required before any build)

Before writing a single line of HTML, produce a structured content plan covering both files. Present this as a document, not as running prose. **Wait for explicit approval before proceeding to build.**

The plan must include:

**Primer (slide deck)**
- Proposed slide count and titles
- For each slide: one-sentence description of what it covers
- Which slide carries the definition (always the "outcome" or equivalent dark slide)
- Whether the primer includes a mental model slide, and if so, what model and how it will be visualised
- What the "in practice" scenario will be (the before/after comparison)
- What the summary pull-quote will be

**Plan (scrolling learning plan)**
- Proposed section list (14 is the current default — flag any additions or omissions and why; if you change the default here, it applies to the whole plan, don't restate a different number elsewhere)
- For each section: one-sentence description of what it covers
- Principles (or equivalent): how many, what they are named, and whether they default open or collapsed (principles default collapsed; single model card defaults open)
- Mental model(s): name, source attribution, and how it will be visualised (diagram type, scenario it will be applied to)
- 5-Day Habit Builder: the worked example thread (what scenario runs across all five days — must be different from the primer's in-practice scenario)
- Knowledge Check: proposed question types (2 conceptual / 2 applied / 1 synthesis is the default)
- Progression Path: three stage names and their tag classes (tag-structural, tag-analytical, tag-growth)
- Explore Further: proposed resource list (minimum 5, maximum 8 — verify all links before including)
- Any structural departures from the standard 14-section plan, with rationale

**Shared decisions**
- Relationship cards: which other skills does this skill relate to, and what is the boundary statement for each? (check [public/skills/](public/skills/) for the current roster)
- Out-of-scope items: what is explicitly excluded, and why?
- AI-context notes: which principles or sections warrant an AI-specific callout, and what angle each takes

---

## STEP 4 — BUILD

Once the content plan is approved, build both files.

**Build rules:**

1. Copy CSS and JS patterns from the template pages exactly. Do not invent new class names, component structures, or JS patterns unless the content genuinely requires something the templates don't have — and if so, flag it before using it.

2. File references:
   - nav.js: referenced as `../../nav.js` (two levels up from `skills/[skill-slug]/`)
   - progress.js: referenced as `../../progress.js`, on the line immediately after nav.js.
     **Required on both primer.html and plan.html.** Progress persistence lives in this shared
     module; without the tag, `AmplifiedProgress` is undefined and the page's entire inline
     script throws on load. The storage key is derived from the URL path, so no per-page
     constant is needed — the served URL `/skills/[skill-slug]/plan.html` yields
     `amplified_plan_[skill-slug]`. Note that is the **URL**, not the file path: `public/` is
     stripped when served, so the key is unaffected by the Phase 2 move.
   - Google Fonts: use the same imports as the template pages
   - No external JS dependencies beyond what the templates already use

3. Principles in plan.html default to COLLAPSED (`aria-expanded="false"`, no `open` class, label reads "Expand"). The single mental model card defaults to OPEN (`aria-expanded="true"`, `open` class, label reads "Collapse"). No extra wiring is needed for either: the page reads its open/closed defaults from the DOM at load and "reset progress" returns the cards to exactly that state.

4. Knowledge check answer key: store correct answers as 0-indexed integers. The reveal button appears only after all questions are answered. Correct options get class `correct`; selected-but-wrong options get class `incorrect`. Each question has an explanation block that appears on reveal.

5. Habit-day accordions default to COLLAPSED. Each day's header toggles its body via `toggleDay(this)`.

6. The 5-Day Habit Builder must use a different scenario from the primer's in-practice slide.

7. Screenshot validation is not automatic here — flag any sections where visual QA is particularly recommended (dense layouts, new diagram types, mobile stacking) so the user knows to check them in a browser.

8. Do not include video embed markup or its JS in primer.html — that's added separately as a later step (the `video-thumbnail.png` convention seen in existing skill folders is unrelated groundwork, not something to wire up here).

9. Folder path: files go into `public/skills/[skill-slug]/` where slug is hyphenated lowercase (e.g. `creative-thinking`).

---

## STEP 5 — AFTER BUILD

Once both files are built (and, if you ran a browser check, verified working), perform the two site-integration updates below without waiting to be asked again — they're a standard, expected part of shipping a new skill, not optional extras. Do NOT commit or deploy anything; that still needs explicit confirmation. If either edit runs into something unexpected (e.g. `nav.js` or `future-skills.html` don't match the shape described below because the site structure has changed), stop and ask rather than guessing.

**5a. Register the skill in nav.js**

Add `'[skill-slug]': '[Skill Name]'` to the `names` map in [nav.js](public/nav.js) (currently around line 60) — a one-line addition to the existing object literal.

**5b. Flip the skill's card in [public/future-skills.html](public/future-skills.html) from "coming soon" to available**

Find the skill's existing `<!-- [SKILL NAME] -->` card block (search by its `id="s-[slug]"`). It currently looks like the other not-yet-live cards: `<div class="scard cs" ...>` with a plain `<div class="sheader">` (no click handler) and `<div class="sstatus ss-soon">Coming soon</div>`, and nothing after the `.shc` div.

Rewrite that block to match the structure of an already-live card (e.g. `id="s-creative"` — read it first for the exact markup):
- `<div class="scard active" id="s-[slug]" ...>` (drop `cs`, add `active`)
- `<div class="sheader" onclick="toggleSkill('s-[slug]')" aria-expanded="false" aria-controls="sb-[slug]" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' ')toggleSkill('s-[slug]')">`
- Keep the existing `sstatus-strip`, `skill-icon`, `skill-pills`, `sname`, and `ssum` content as-is
- `<div class="sstatus ss-avail">Available Now</div>` (replaces `ss-soon`/"Coming soon")
- Add `<div class="stoggle" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></div>` right after the `.shc` div closes
- Add a new `<div class="sbody" id="sb-[slug]">` sibling containing:
  - `.sdef` — `.sdef-inner` with an `.sthumb` (`<img src="skills/[slug]/video-thumbnail.png" alt="[Skill Name] skill thumbnail" width="140" height="79" loading="lazy">`) and `.sdtext` (the skill's one-sentence definition, quoted) — plus `.swhat` with two paragraphs: one on the cost of not having the skill, one on what it produces (draw these from the plan's Overview/Snapshot content, don't invent new phrasing)
  - `.slaunch` → `.lcards` with two `.lcard` links to `skills/[slug]/primer.html` and `skills/[slug]/plan.html` (the second gets `class="lcard primary"`), matching the copy pattern (type, one-line description, time estimate, CTA) used by the other live cards exactly

Note the video-thumbnail.png referenced here won't exist yet (per Step 4's build rule 8, video is added later) — the `<img>` will show broken until that file is added. That's expected and matches how this site's build sequence already works; don't skip the `<img>` tag to avoid it unless the user says otherwise.

**5c. Add the skill to search-index.json**

[search-index.json](public/search-index.json) is a hand-maintained file that [search.html](public/search.html) fetches directly — it is NOT auto-generated from the skill pages, so a new skill is invisible to site search until it has an entry here. Add two entries (one `"type": "primer"`, one `"type": "plan"`) immediately after the pattern used by an existing skill (e.g. search for `"cr-primer"` / `"cr-plan"` and follow that shape exactly):
- `id`: a short two-letter-ish prefix + `-primer` / `-plan` (e.g. `st-primer`)
- `skill`, `title`, `description`: reuse the primer/plan's own `<title>`/meta description content, don't rephrase
- `tags`: the skill name, each mental model name, key named frameworks/authors, plus `"primer"` or leave off for plan, and the skill's category (e.g. `"cognitive"`)
- `slides` (primer) or `sections` (plan): the exact nav-rail labels from the built page, in order
- `url`: `skills/[slug]/primer.html` or `skills/[slug]/plan.html` — a URL, so **no `public/` prefix**

After editing, validate the file is still well-formed JSON before moving on (a trailing comma or missed brace here breaks site search entirely, not just this skill's entry).

**5e. Generate the video-thumbnail image prompt**

Give the user a ready-to-run image-generation prompt for `public/skills/[slug]/video-thumbnail.png`, in the same `@Create image` format used for every prior skill. Keep every brand token below identical, word-for-word, across skills — only the visual metaphor and the two text placeholders change. Do NOT invent new colors, change the palette's hex values, or alter the text/layout instructions; brand consistency across thumbnails matters more than novelty here.

Template (fill in the two bracketed parts only):

```
@Create image Abstract flat-vector illustration representing [SKILL NAME lowercase]: [ONE-OR-TWO-SENTENCE VISUAL METAPHOR — see guidance below]. Organic sage green (#ACC4B6) background. Primary structural shapes in deep teal (#2D756F) and teal (#5BA79F). Terracotta (#C77B5F) and amber (#D9A05B) used as accent shapes/color, roughly 25-35% of the composition. Bold geometric sans-serif text (Poppins Bold style) positioned in the left third: small all-caps label "AMPLIFIED THINKER · FUTURE SKILLS" in deep teal (#2D756F), with large headline text "[SKILL NAME UPPERCASE]" below it in charcoal (#2D3330) for maximum contrast. Clean geometric flat-vector style. Professional, modern, not corporate. 16:9 widescreen composition. No play button icons, no logos.
```

Guidance for the visual metaphor: draw it from the skill's own content, not a generic stand-in — specifically, from whichever mental model or first principle best captures the skill's core motion or shape (e.g. Creative Thinking used scattering shapes converging toward one, drawn from its Divergent–Convergent model; Systems Thinking used interconnected nodes with looping arrows and one emphasized node, drawn from Feedback Loops and Leverage Points). Pick something concrete and drawable — shapes, arrows, nodes, layers — not an abstract description of the skill's definition.

Tell the user to save the generated image as `public/skills/[slug]/video-thumbnail.png` once created, matching the filename convention of the other live skills.

**5f. Generate the primer video prompt**

Give the user a ready-to-run video-generation prompt for the primer's overview video, in the same one-paragraph format used for every prior skill. Keep the framing sentence and closing instruction fixed, word-for-word — only the list of practices in the middle changes per skill.

Template (fill in only the bracketed list):

```
A short video walkthrough of [Skill Name] in the context of professional knowledge work, covering what [skill name lowercase] looks like in practice: [4-5 comma-separated clauses — see guidance below]. Use the attached guides for the design system.
```

Guidance for the practice list: pull the clauses directly from this build's own First Principles and Mental Models sections — do not invent new practices or restate the skill's definition. Each clause should name one concrete, doable action (a technique, a model applied, a habit), in the same order the plan builds them (foundational habit first, models in the order they appear, ending on whatever closes the loop — narrowing, converging, or checking the result). Match the original's rhythm: each clause is a gerund phrase ("separating X from Y," "reframing Z by naming and reversing...," "using the [Model Name] to..."), not a full sentence, chained with commas and a final "and" before the last one.

Reference — the Creative Thinking prompt this pattern is drawn from:
"A short video walkthrough of Creative Thinking in the context of professional knowledge work, covering what creative thinking looks like in practice: separating idea generation from idea evaluation, reframing a stuck problem by naming and reversing the assumption behind it, borrowing structure from unrelated domains rather than recombining within the same one, running a structured ideation technique like SCAMPER to force volume rather than waiting for inspiration, and using the Divergent–Convergent Cycle to narrow a wide set of options down to one worth pursuing. Use the attached guides for the design system."

This prompt doesn't produce a file to save — it's fed into the user's own video-generation tool. Once they have the resulting video and its ID, that's the trigger to come back and wire the video embed markup into the primer's slide 1 (see Step 4 build rule 8 — that markup was deliberately left out at build time and still needs adding).

**5g. Report a commit log entry**

Report (don't create) a commit log entry in conventional commit format covering all touched files:

```
feat: add [Skill Name] primer and learning plan

- public/skills/[slug]/primer.html: [X]-slide primer covering [key topics]
- public/skills/[slug]/plan.html: 14-section learning plan with [key structural notes]
- public/nav.js, public/future-skills.html: register and activate the [Skill Name] card
- public/search-index.json: add primer/plan entries so the skill surfaces in site search
```

Don't commit or deploy unprompted — ask first, per standard practice on this site.
