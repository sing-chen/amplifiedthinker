# Amplified Thinker — Project Backlog

Ideas and future enhancements. Not prioritised — review periodically and promote to active work when ready.

---

## Enhancements

### Downloadable skill pages (primer + plan)
**Status:** Idea · Not started  
**Relates to:** `skills/analytical-thinking/primer.html`, `skills/analytical-thinking/plan.html`, `future-skills.html`

Explore offering downloadable versions of each skill's primer and plan for offline use, printing, or annotation.

Key decisions to make before building:
- **Format:** Pre-generated PDF (via headless Chrome print CLI, committed to repo) is recommended for the plan; print-optimised CSS (`@media print`) may be sufficient for the lighter primer
- **Knowledge check in PDF:** Show answers at end of section, or reflection-only? (Self-serve context suggests showing answers is more useful)
- **Placement:** Download link on the skill card in `future-skills.html` (low-prominence, below primary CTAs) and/or within the plan/primer page itself (left rail or end of content column)
- **Interactive → static conversions needed:**
  - Quiz (5 questions, scored) → static questions with written answer space + answers block
  - Habit builder accordions → fully expanded checklist grid
  - Prev/next nav → table of contents
- **Maintenance:** At 15–20 skills, pre-generating one PDF per skill manually is tractable; revisit if the library scales beyond that

---

## Infrastructure / Architecture

The Supabase, auth, and admin portal work is planned in detail and already under way — it is
tracked in `docs/`, not here:

- `docs/supabase-integration-plan.md` — architecture, data model, decisions
- `docs/implementation-sequence.md` — phased plan, current status, progress log
- `docs/dev-workflow.md` — branches, previews, environments

Log new infrastructure *ideas* here; anything already committed to that plan belongs in the docs
above, so status lives in one place.

### Bump `actions/deploy-pages` off deprecated Node 20
**Status:** Idea · Not started · Noticed 2026-08-17 during Phase 3
**Relates to:** [.github/workflows/pages.yml](.github/workflows/pages.yml)

The Pages workflow emits this on every run:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on
> Node.js 24: `actions/deploy-pages@v4`

**Nothing is broken.** GitHub is force-running it on Node 24, so it works today. This is about the
version pin ageing out, not a current fault.

**Why it is worth tracking rather than ignoring:** this workflow is the only thing publishing
`sing-chen.github.io/amplifiedthinker`, which is a *load-bearing* production origin — some corporate
networks block the custom domain under newly-registered-domain policies, and those users have no
other route in. A silent deprecation becoming a hard failure there takes down an audience segment
with no fallback, and the failure would surface as a red X in an inbox rather than as a broken page
anyone would notice.

Action: bump to `actions/deploy-pages@v5` when it exists, or whichever version targets a supported
runtime. Check `actions/checkout`, `actions/setup-node`, `actions/configure-pages` and
`actions/upload-pages-artifact` in the same pass — the warning names only the action that tripped it,
not everything on the same runtime.

**Related, and separately worth knowing:** the same workflow run failed at `actions/deploy-pages@v4`
with a `503` and a `429`, which was a transient GitHub Pages outage rather than anything in this
repo. Recorded in the Phase 3 progress log so a future red X is not misread as this deprecation.

---

## Content

*Nothing logged yet.*

---

## Accessibility / Performance

*Nothing logged yet.*

---

*Last updated: 17 August 2026*
