# Phase 5 kickoff prompt

Paste the block below into a new session. Written 2026-08-18, immediately after Phase 4 merged;
check `git log` and the Phase 4 progress-log entry if much time has passed, since the state
described here is what makes the prompt useful.

---

```
Start Phase 5 (Auth and progress sync) of the Supabase integration on C:\dev\amplifiedthinker.

READ FIRST
- CLAUDE.md
- docs/implementation-sequence.md — the Phase 5 section AND the Phase 4 progress-log entry.
  Several of Phase 4's 16 findings bear directly on this phase, particularly 7 (the double-hash
  redirect) and 12 (a success criterion that a bad outcome could satisfy).
- docs/dev-workflow.md — branches, previews, both origins, known traps
- docs/supabase-integration-plan.md — architecture and the data model
- supabase/README.md — the migration runbook, the redirect allowlist, and the SMTP setup
- BACKLOG.md — the vendor-consolidation entry. Most of it is deferred; the Pages retirement in it
  is decided but unscheduled, and that distinction matters for question 1 below.

STATE
Phases 0-4 are done and live on both origins. main is clean at 1e50cfc. Supabase project
spehmrgmcdenqdftkyrt (EU) holds the full schema, RLS on every table, 17 policies, both gates
passing. Auth email goes out through Resend, verified by delivery on all three send types.

This is the payoff phase and the first one visitors will feel.

THREE THINGS TO RESOLVE, IN ORDER, BEFORE WRITING CLIENT CODE

1. How signup is protected. It is currently switched OFF in Supabase, deliberately, and turning it
   back on belongs in the same change that protects it. This phase publishes the anon key, so
   /auth/v1/signup becomes callable with curl and the sign-in page is not the surface to control.
   Supabase supports hCaptcha and Turnstile natively - establish whether that integration needs a
   server endpoint.

   If it does, do NOT contort the design around static hosting. The GitHub Pages origin is slated
   for retirement: its audience is zero, and retiring it ahead of this phase is a legitimate answer.
   Weigh that against doing it mid-phase. Resolve this first either way - it decides what the
   sign-up UI has to contain.

2. When the dev/prod project split happens, and what it costs. None of Phase 3's dashboard settings
   or Phase 4's SMTP configuration is in the migration - the redirect allowlist, custom SMTP, the
   rate limit, the signup toggle and the is_admin bootstrap all have to be reproduced by hand in a
   new project. Decide whether dev needs working email at all before paying for that twice.

3. The merge rule for the one-time localStorage import. The done-when names silent truncation as the
   failure mode but does not define what happens when local and remote both hold progress for the
   same skill. Decide the rule before building the prompt around it.

WHAT PHASE 4 ESTABLISHED THAT THIS PHASE NEEDS
- auth.js will write the same redirect that broke in Phase 4, and window.location.href is the
  natural way to write it. Read the selfUrl() comment in src/pages/auth-test.astro before writing
  any redirect. The bug is invisible on a first test and only appears on a second auth action.
- Resend's free tier is 100/day. That is now the binding email limit, not Supabase's 100/hour.
- Supabase throttles to one email per recipient per 60 seconds. A suppressed send looks identical
  to a broken one - check this before suspecting anything else.
- Only singfenchen@gmail.com remains in auth.users, and it is NOT an admin. is_admin can only be
  set where auth.uid() is null, i.e. the dashboard SQL editor.
- src/pages/auth-test.astro is live on both origins. Mine it before deleting it: it holds working
  patterns for session handling, onAuthStateChange, the signup-trigger check, and RLS assertions
  proven against both admin and non-admin paths.

CONSTRAINTS
- Both production origins are still live, so changes are verified on both. But the Pages origin is
  slated for retirement and its audience is zero, so do not deepen the dependency on it, and treat
  "this needs a server, so Pages cannot have it" as a scheduling question rather than a veto.
  Retiring the published URL does not touch the repo, the history, or the Actions workflows.
- The nav.js edit is the highest-risk change here: one file, all 16 pages, and it derives its link
  prefix from document.currentScript.src - which is null if a script is bundled as a module.
  Every Astro <script> needs is:inline.
- Guests must keep working exactly as they do today, except for the resume banner.

RISK PROFILE - different from Phase 4, and worse
Phase 4 was configuration: reversible by not merging, invisible to visitors. This phase ships code
to all 16 pages, publishes the anon key, opens signup, and creates real user data for the first
time. A Vercel rollback restores code, never database state.

WORKING AGREEMENTS
Branch feat/auth off main. Ask before committing, pushing, or deploying. Do not use deploy.bat.
Automated checks are necessary but never sufficient for anything visual - both Phase 1 defects, two
Phase 3 defects, and Phase 4's double-hash redirect were all found by a human looking at real
output, every one of them with a green board above it.

DONE WHEN
A user with existing local progress signs in, accepts the import, opens a second device, and sees
the same state. Test both directions.

Also plan the announcement. This is the only place in the whole plan where existing behaviour gets
worse for someone: guests lose the resume banner they get for free today.
```

---

## Why it is ordered this way

**Signup protection comes first because it can invalidate work, not merely add to it.** If
Supabase's CAPTCHA integration needs a server endpoint, that changes what the sign-up UI *is*, not
what gets bolted onto it afterwards — and it forces a decision about whether to retire the Pages
origin first. Everything else in the phase can be built on top of that answer; none of it can be
built around a missing one.

**Findings 7 and 12 are named individually** rather than "read the findings". Finding 7 is a bug the
phase will reintroduce if nobody reads the comment at the fix — `auth.js` performs the same redirect
and the natural way to write it is the broken way. Finding 12 is the lesson that a success criterion
can be fully satisfied by a bad outcome, which matters here because "the progress appears on the
second device" would pass just as happily if the import silently truncated.
