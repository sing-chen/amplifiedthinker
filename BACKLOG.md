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

### Vendor consolidation, retiring the GitHub origin, and the contact form
**Status:** Reviewed 2026-08-18, **deliberately deferred** · Revisit in a future phase
**Relates to:** [CLAUDE.md](CLAUDE.md), [docs/dev-workflow.md](docs/dev-workflow.md),
[docs/implementation-sequence.md](docs/implementation-sequence.md)

**Nothing here has been done.** The whole topic was talked through and parked; this entry exists so
the reasoning survives rather than being re-derived. Seven vendors sit behind the site today:
GitHub, Vercel, Cloudflare, Supabase, Resend, Brevo, GoDaddy.

**The realistic floor is five**, not fewer. Supabase, Cloudflare, GitHub and Vercel each do something
nothing else here can, and Resend exists because Supabase's built-in mailer allows ~2 messages an
hour and is unsupported for production. Two are removable.

#### Candidate 1 — Brevo → Resend (the strongest one)

Brevo's only remaining job is relaying the Gmail *Send mail as* alias for
`singchen@amplifiedthinker.com`. Resend already has the domain verified, so this is one SMTP setting
in Gmail: `smtp.resend.com` / 587 / `resend` / an API key.

- ⚠️ **Use a *separate* API key**, not Supabase's. One credential shared by two senders means
  rotating it for one silently breaks the other — the exact trap Phase 4 finding 1 identified with
  the Brevo keys.
- ⚠️ **Check Resend's acceptable-use policy covers human correspondence.** It is built for
  application mail; a personal relay is an unusual use and was never confirmed as permitted.
- It also retires the *"key expires after 90 days of inactivity"* risk logged below.

#### Candidate 2 — GoDaddy → Cloudflare registrar

GoDaddy is **registrar only**. Cloudflare already runs the zone and inbound routing, sells
registrations at cost, and would end the "which one is DNS?" confusion permanently — a confusion
that already put a wrong entry in `recovery.md`.

⚠️ **This one closes your own escape hatch, so decide it rather than tidy it.** Today, if Cloudflare
locked the account, nameservers could be repointed from GoDaddy. Consolidate and the only recourse
is Cloudflare's support queue, for the one asset that cannot be rebuilt. Do it alongside hardware-key
2FA on Cloudflare, and note the 60-day transfer lock after registration or any contact change.

#### Not a candidate — Vercel

Cloudflare Pages could host this, but it means an Astro adapter swap, rewriting `middleware.js`,
losing per-branch preview URLs, and re-proving the deployment. One vendor saved, a working system
disturbed, during the phases that finally ship user-visible features.

#### Retiring the GitHub Pages origin

**The NRD block on `amplifiedthinker.com` lifted on 2026-08-18**, 43 days after registration —
within the 30–90 day range `dev-workflow.md` predicted, and ahead of its October re-test date.
Decisively, **the GitHub origin was never shared outside the owner's organisation**, so its entire
audience was colleagues behind that block. That audience is now zero.

This retires a framing that runs through `CLAUDE.md`, the cross-cutting constraint in the
implementation sequence, and the capability matrix in `dev-workflow.md` — the origin was
*load-bearing, not legacy*, and it stopped being so on a specific date for a specific reason. Worth
writing up as a retirement rather than deleting the paragraphs as though it never applied.

**What falls away with it:** the two-origin constraint gating Phases 6–8, `ASTRO_BASE` and the MSYS2
trap that mangled it, double verification of the 66-file gate, two redirect-allowlist entries, and
the `actions/deploy-pages` item logged above.

⚠️ **What is given up: Vercel becomes a single point of failure.** A bad deploy or an outage
currently leaves a complete working site on the other origin, and `main` has been able to fail to
deploy since Phase 2. Rollbacks are fast and the risk is low — but this is a deliberate trade, not a
side effect of the NRD news.

**Retirement shape:** publish redirect stubs for a few months, then delete the workflow. The stubs
are for *search indexing*, not for people — the origin is public with a `sitemap.xml`, so crawlers
may have found it without anyone sharing it. Check `site:sing-chen.github.io/amplifiedthinker`
first; if nothing is indexed, deleting outright is fine and the handful of colleagues with bookmarks
can simply be told.

#### What retirement unlocks: the contact form

A form was proposed to replace reliance on `mailto:` links, which open device-specific mail clients
and do nothing on a machine with none configured. Submissions become rows in a new table; signed-in
users need no name or email field; anonymous users may stay anonymous, told plainly that no reply is
possible.

**It does not reduce vendor count and does not remove inbound email.** Cloudflare Email Routing is
part of a vendor being kept, and replies to your replies still have to land somewhere. If anything
the form makes inbound *more* load-bearing.

**Inbound stays on Cloudflare.** Resend's *Enable Receiving* toggle is tempting and wrong: it
delivers to a **webhook, not a mailbox**, so it trades Gmail's threading, search, spam filtering and
mobile app for building an email client — and it reintroduces the apex MX conflict with Email
Routing.

**Retiring Pages changes the form's architecture, and reverses the earlier recommendation.** While
the static origin was load-bearing, anything server-side had to be a Supabase Edge Function, and the
pragmatic choice was an `anon` INSERT policy. With a single origin that runs code, the form should
post to a Vercel `/api/contact` endpoint which verifies Turnstile, inserts with `service_role`, and
sends the notification through Resend. That means **the table needs no `anon` grants at all** —
which removes the whole problem that a public `anon` key lets anyone POST rows straight to PostgREST
without touching the page. It also puts `service_role` exactly where CLAUDE.md says its only home is.

⚠️ **The `mailto:` link stays regardless.** Phase 0 deliberately made the contact block render with
JavaScript disabled, after removing per-origin branching that showed the wrong thing on previews. A
form needs JS; keeping the address is preserving a property that was deliberately won.

⚠️ **The new table lands with no grants.** The Phase 3 migration ends with
`alter default privileges … revoke all on tables from anon, authenticated`. The `grant` goes in
alongside the `create policy`, or it presents as a broken policy.

**Natural home: Phase 7**, alongside the admin portal that would read the messages. The Supabase
dashboard is a serviceable inbox until then.

#### The coupling all of this creates

Consolidating puts **three consumers on one Resend allowance of 100/day**: auth mail, contact
notifications, and personal replies from the alias. Exhausting it breaks password resets *and* the
ability to reply *and* the notification that a message arrived. It will not bind at this volume, and
Turnstile makes notifications self-limiting — but it is the concrete price of the tidier picture,
and it is the single number to watch.

### The Brevo SMTP key behind the Gmail alias expires after 90 days of *inactivity*
**Status:** Live risk · Noticed 2026-08-17 during Phase 4 · Rescoped 2026-08-18
**Relates to:** [supabase/README.md](supabase/README.md), Gmail → Settings → Accounts and Import

⚠️ **This no longer concerns auth mail.** Supabase moved to Resend on 2026-08-18, and Resend's API
keys have no inactivity expiry. What remains is the key created 2026-07-06, which Gmail's *Send mail
as* uses to relay `singchen@amplifiedthinker.com` through `smtp-relay.brevo.com`.

Brevo expires an SMTP key after **90 consecutive days without a send**, whatever its stated expiry
date. That alias is low-traffic by nature — it is a personal address on a personal site — so ninety
quiet days is entirely plausible.

**The failure mode is quiet and the symptom misleads.** Sending from the alias starts failing, and
the error reads as an SMTP *authentication* failure — indistinguishable from a wrong password, with
a configuration that looks correct. Gmail will not explain that a key aged out.

**Why it is lower stakes than it was:** it now breaks one person's outbound alias rather than every
user's password reset. Worth knowing, not worth scheduling.

Options, none urgent: send something from the alias each quarter, or simply remember that this is
the first thing to check when the alias stops working and nothing was changed.

---

## Content

*Nothing logged yet.*

---

## Accessibility / Performance

*Nothing logged yet.*

---

*Last updated: 18 August 2026*
