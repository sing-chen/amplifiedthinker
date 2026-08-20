# `why-sign-up.html` — account-half copy, draft

Draft prose for the **account** half of [public/why-sign-up.html](../public/why-sign-up.html),
written 2026-08-20 alongside the Phase 9 learning-tracker mockup.

**Not shipped.** This is a draft sitting next to the page it is for, so the wording can be argued
with before it becomes HTML. The live page already carries both halves; this replaces only the
account half of it.

---

## The copy

### Your progress, kept

With an account, the site remembers where you got to. Every plan section you read and every primer
slide you see is saved as you go, so you can close the tab mid-section and pick up in the same
place — on your phone, on a work laptop, months later.

That record becomes your learning tracker. One page shows how far through each of the five skills
you are, which ones you've finished, and which you started and left. Not a score, and nothing anyone
else can see — just an honest picture of what you've covered, so the next thing to do is obvious.

You can also keep the news you want to come back to. Save a story, pin the ones that matter, and
write a note against a story or a plan section while the thought is fresh.

Signed out, none of this is kept. The site works fully as a guest — every page, every plan, all of
it free to read — but nothing is written down, so each visit starts from the top.

---

## What every claim above rests on

Written deliberately so that nothing here promises something the schema cannot produce. If the copy
changes, check the claim still has a column behind it.

| Claim | Where it comes from |
|---|---|
| "saved as you go" | `skill_progress` upsert on a debounce, plus the `pagehide` flush — `public/progress.js` |
| "pick up in the same place" | `skill_progress.position`, restored via `ready()` |
| "on your phone, on a work laptop" | the row is keyed on `user_id`, not a device |
| "how far through each of the five skills" | `visited[]` against 14 plan sections / the primer's slide count |
| "which ones you've finished" | `completed_at` — ⚠️ **written by nobody yet.** No page computes completion today |
| "nothing anyone else can see" | RLS: every policy on `skill_progress` scopes to `auth.uid()` |
| "save a story, pin the ones that matter" | `user_news.favorited` / `.pinned` |
| "write a note" | `notes`, `target_type` of `'news'` or `'skill'` |
| "signed out, none of this is kept" | literal — `progress.js` reads and writes nothing for guests |

## Three things to settle before this ships

1. **The guest half has to agree with this one.** Both halves live on the same page and make
   opposing arguments about the same facts; a change to one that is not mirrored in the other reads
   as the site contradicting itself.

2. **`completed_at` is unwritten.** "Which ones you've finished" is the one claim with no live
   source. Either Phase 9 starts writing it — the plan defines completion as `visited` covering all
   14 sections — or that clause comes out.

3. **Check the privacy page.** [public/privacy.html](../public/privacy.html) is a description of the
   system, not boilerplate. This copy introduces no new processor, storage key or outbound request,
   so on the face of it nothing there changes — but confirm rather than assume, and remember the
   sibling Promptly site makes the same statements about the same person under the same law.
