# Learning tracker — design brief

Requirements for the Phase 9 `/dashboard/` surface, written to be worked from in design software
rather than read as a spec. Derived by deconstructing the HTML mockup built 2026-08-20
(scratchpad `learning-tracker.html`, published as an Artifact) — **that mockup is one solution, not
the requirement.** Everything below separates what any option must satisfy from what is genuinely
open, so a range of directions can be explored without any of them being wrong by construction.

Companion docs: [supabase-integration-plan.md](supabase-integration-plan.md) for the data model,
[why-sign-up-account-copy.md](why-sign-up-account-copy.md) for how this page is sold to guests.

⚠️ **Read [design-modernisation.md](design-modernisation.md) before designing to §2's brand row.**
The type and colour system moved substantially on 2026-08-23 — one family, hierarchy from weight and
tracking, two darkened tokens — and this brief was written against the old one. §2 has been
corrected, but the *reasoning* behind each rule lives there, and a dashboard is exactly the kind of
dense numeric surface those rules were tuned on.

---

## 1. What the page is for

**One sentence:** show a signed-in learner how far through the five core skills they are, and make
the next thing to open obvious.

**Who opens it:** someone returning after days or weeks, mid-way through one or two skills. They are
not studying the page — they are orienting for ten seconds and then leaving into a plan.

**Its single job:** re-entry. Every other function (celebrating completion, reviewing saved
material) is secondary and must not crowd it out.

**What it is not.** Not a course catalogue — [future-skills.html](../public/future-skills.html)
already introduces the skills to people who have not started. Not a profile page. Not an analytics
report; the learner is not a metric being optimised.

---

## 2. Fixed constraints

Non-negotiable. A design that breaks any of these cannot ship, whatever it looks like.

### Brand and rendering

| | |
|---|---|
| **Colour** | The tokens in [public/styles.css](../public/styles.css) — deep teal `#26605B`, navy `#1F4D4A`, sage `#ACC4B6`, off-white `#EEF2EF`, terracotta `#8A4B2C`, moss `#55643A`. Use the semantic layer (`--bg-*`, `--fg-*`, `--line-*`), not raw hexes. ⚠️ Deep teal read `#2D756F` in this row until 2026-08-24; it moved in the 2026-08-23 contrast pass. Which is the argument for the semantic layer — a design working in `--fg-brand` would not have noticed |
| **Type** | **Inter, and only Inter** — one variable family across the whole site, self-hosted, weights 100–900 available. ⚠️ **This row said "Poppins for headings, Inter for body, Source Serif 4 for editorial headlines" until 2026-08-24.** All three claims are now false: the site was harmonised onto Inter on 2026-08-23 and the other two faces were retired. Differentiate headings from body with **weight, size and letter-spacing**, not with a second family. The serif is gone, so the mockup defect noted in §10 no longer has a face to be wrong about |
| **No new typefaces, and no new font host** | [privacy.html](../public/privacy.html) names every outbound third-party request. Adding a face or a host makes that page *wrong*, not out of date, and it must change in the same commit. ⚠️ **This constraint got sharper on 2026-08-23, not weaker:** the fonts are now self-hosted and the page states that *no third party is involved in showing you the page*. There is no font host left to add to — the first one added breaks a claim that currently reads as absolute |
| **Dark mode is required** | Three viewer states: explicit dark, explicit light, and unset (follow the OS). Every colour must resolve in all three — design both palettes, do not invert one |
| **Radius, spacing, shadow** | Existing scales: radius 2/4/6/10/14/pill, spacing 4→128 on the 4px grid, navy-tinted shadows |

### Platform

- **Must work with no server.** The GitHub Pages origin runs static files only, and both origins are
  live. Everything on this page is fetched client-side by the browser after load. No server
  rendering, no `/api/` dependency.
- **Data arrives late and may not arrive at all.** Progress is fetched over the network after first
  paint. Every layout needs a loading state that does not reflow violently when data lands, and a
  failure state.
- **No third-party assets.** No CDN scripts, icon fonts, or remote images. A charting library must
  be vendorable.

### Accessibility

- Contrast 4.5:1 for text, 3:1 for meaningful graphics, **in both themes**.
- ⚠️ **Colour may never be the only carrier of state.** Complete / in-progress / not-started must
  each be readable without colour — shape, label, or position.
- Every proportion shown graphically also needs its exact figure available to a screen reader.
- Keyboard focus visible on every interactive element.
- Respect `prefers-reduced-motion`; any count-up or ring-draw animation must be skippable.

---

## 3. What the data can actually support

The hard boundary on invention. Design only what these columns can produce.

**Available, per skill, per artefact** (`skill_progress` — one row per user × skill × primer|plan):

- which sections or slides have been visited (a set, not just a count)
- the last position reached
- when the row was started, and when it was last touched
- an explicit completion flag — ⚠️ **currently written by nobody.** Completion is *defined* (a plan
  is complete when every required section is visited) but not yet recorded. Either Phase 9 starts writing
  it or "finished" cannot be stated as a fact

**Also available:** saved and pinned news stories; free-text notes attached to a story or a skill.

**Not available — do not design for it:**

| Tempting element | Why it cannot exist |
|---|---|
| Streaks, "days active", activity heatmaps | Nothing records daily activity. Only *last* touched is stored |
| Time spent, reading time, pace | Never measured |
| Quiz scores as a performance metric | The knowledge check has a visible answer-reveal button. It is not a test and must not be scored |
| Leaderboards, comparison to other learners, percentiles | Explicitly deferred, and nothing meaningful exists to rank |
| Badges, levels, points, streak-breaking warnings | No source, and against the tone — see §7 |
| Recommendations ("people who read X…") | No such data, and no plan to collect it |

**Shape of the content:** 5 skills. Each has a **primer** (slide-based) and a **plan** (section-based).

⚠️ **No count here is uniform, and an earlier draft of this brief got it wrong.**
[public/skills-catalogue.json](../public/skills-catalogue.json) is the authority, and it says:

| | Analytical | Creative | Critical | Strategic | Systems |
|---|---|---|---|---|---|
| Plan sections | 14 | 14 | **15** | 14 | 14 |
| …of which required | 13 | 13 | **14** | 13 | 13 |
| Primer slides | 10 | 10 | **9** | 10 | 10 |

Critical Thinking's plan carries an extra section (Bias Field Guide). Every plan also ends with one
`optional: true` section — "Explore Further", a link list — which is **excluded from the
denominator**, or 100% would require reading a resources list and nobody would ever finish anything.

So the totals are **66 required plan sections and 49 primer slides**, not "70" and not "14 each".
Read them from the catalogue at runtime. A design or an implementation that hard-codes any of these
numbers is making the exact mistake the catalogue exists to prevent.

---

## 4. What the page must answer

Any option is judged on whether a returning learner gets these in one screen, without interaction:

1. **Where am I overall?** Some honest sense of total progress across the five skills.
2. **Which skill is in flight?** The one most recently touched, distinguishable from the rest.
3. **What is finished, what is started, what is untouched?** All five accounted for — including the
   ones never opened. An untouched skill is information, not an absence.
4. **What do I open next, and how do I get there in one click?** Every skill needs a route back in,
   deep to the right artefact.

Secondary, may sit below the fold or behind a tab:

5. What I saved from the news, and what I wrote down.

---

## 5. Component inventory

Abstracted from the mockup — these are *roles*, and the form each takes is open.

| Role | Must convey | Notes |
|---|---|---|
| **Page identity** | Whose learning, since when | Also the natural home for "last opened" |
| **Overall summary** | 2–4 aggregate figures with their proportions | Each must be a genuine ratio. Do not pad the set to fill a grid |
| **Per-skill record** ×5 | Name · progress for primer *and* plan, separately · status · date context · a way back in | The page's backbone. Primer and plan are separate records and must not be averaged into one number without also showing the parts |
| **Cross-skill comparison** | The five ranked or side by side | Answers "which am I neglecting" — a different question from any single row |
| **Saved stories** | Title, date, pinned-or-not, link | Secondary |
| **Notes** | Excerpt, what it is attached to | Secondary |
| **Account footing** | That this is kept because they are signed in | Small. Links to why-sign-up |

---

## 6. States every option must handle

The mockup only draws one of these. A range of options is only useful if each survives all six.

1. **Brand-new account** — five untouched skills, nothing saved, no notes. This is the *first* thing
   a new sign-up sees, and an empty grid of zeros is a poor welcome. Arguably the hardest state.
2. **Typical** — one or two in flight, one or two finished, one or two untouched.
3. **Everything complete** — all five done. Needs somewhere to go next, or it is a dead end.
4. **One skill only** — a single row of data and four empty. Layouts that assume a full grid fail here.
5. **Loading** — data has not arrived. Skeleton or progressive reveal, without layout jump.
6. **Failed / offline** — the fetch did not return. Say so plainly; never show zeros as if they were
   real progress.

Signed-out is **out of scope for this page** — a guest has nothing here by design and is handled by
`/why-sign-up/`. But decide whether they are redirected or shown a persuasion state, because the
answer changes the top of the page.

---

## 7. Tone

The site teaches thinking skills to adults, largely professionals. Progress here is a **record**,
not a scoreboard.

- No gamification. No congratulation for showing up, no urgency, no guilt for a gap.
- Honest about being unfinished — 30% reads as 30%, not "great start!"
- **Quiet by default.** Celebrate completion once, briefly, and let it settle into the record.
- The page is glanced at. Density is a virtue; a screen and a half of scrolling to learn one thing is not.

---

## 8. Where the options genuinely differ

The axes worth exploring. Combining them is where a *range* comes from rather than five versions of
one idea.

**A. Progress metaphor.** Rings · bars · segmented tracks, one tick per section · a checklist ·
a single continuous journey across all five. *Trade-off:* a ring gives proportion and nothing more;
segments show **which** parts are done and where you stopped, which the current mockup lost when it
moved to rings. Position may or may not matter — decide deliberately.

**B. Primary organising unit.** Skill-first (five rows) · artefact-first (primers vs plans as two
groups) · timeline-first (what you did, most recent first) · next-action-first (a queue, progress as
supporting detail).

**C. Aggregate vs detail.** Big summary above the fold with detail below · no summary at all,
letting five rows speak · summary *derived visually* from the rows rather than restated as figures.

**D. Layout skeleton.** Two-column with a sidebar · single column · card grid · dense table. The
sidebar earns its place only if what it holds deserves permanent screen space.

**E. Weight of the secondary content.** Saved stories and notes as a sidebar · as a section below ·
behind a tab · on their own page entirely, linked from here.

**F. Emphasis of the in-flight skill.** Pulled out and enlarged · sorted to the top · marked in place ·
not distinguished at all. *Note:* the mockup originally used a dedicated "resume" card and it was cut
as redundant — if an option reintroduces one, it needs a reason the rows cannot serve.

**G. Density.** Compact operational table ↔ generous editorial pacing. The site's existing pages sit
toward the editorial end; a dashboard has a legitimate reason to sit tighter. Worth testing both.

---

## 9. Checks before a direction is chosen

- [ ] Legible in light and dark, and in the unset state that follows the OS
- [ ] All six states in §6 drawn, not just the flattering one
- [ ] Every status distinguishable in greyscale
- [ ] Holds at ~375px wide, and at ~1400px without stranding a lone column
- [ ] Every figure traceable to a real column in §3
- [ ] Primer slide counts not hard-coded
- [ ] No typeface or asset host beyond what the site already loads
- [ ] A returning learner can answer all four questions in §4 without clicking

---

## 10. Reference

The 2026-08-20 mockup — https://claude.ai/code/artifact/06ee4184-2d8e-4409-9338-2bfa48bb4ced —
takes one position on every axis in §8: skill-first, two-column, ring metaphor, summary above,
secondary content in a sidebar. It is a starting point to argue with, and it carries two known
defects: it only draws the "typical" state, and it uses a serif face for headings.

⚠️ **The second defect changed shape on 2026-08-23 rather than going away.** It used to read "it
uses the serif face where Poppins belongs" — but the site now has neither face, so the mockup is
wrong against a *simpler* rule than the one it broke: everything is Inter. Anything lifted from it
needs its type re-specified from scratch, not swapped face-for-face.
