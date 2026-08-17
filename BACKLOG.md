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

---

## Content

*Nothing logged yet.*

---

## Accessibility / Performance

*Nothing logged yet.*

---

*Last updated: August 2026*
