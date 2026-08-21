# Implementation sequence

**Status:** In progress — Phases 0, 1, 2, 3, 4, 5 and **9 live on both origins**. Phase 5 merged as
`947fb19`; seven post-release defects were found by hand the same day and all fixed.

**Phase 9 shipped out of order (`ef7c58c`, 2026-08-21).** It was scheduled last on the assumption
that it needed data from 6, 7 and 8; it does not — Phase 5 alone produces everything it reads. It
required no migration, which makes it the first phase since 3 where code and schema did not have
to move together. 6, 7 and 8 are unaffected and still to come.

**`feat/legal-pages` is merged and live on both origins.** It carried the three legal pages, the
sign-up consent checkbox and account toggle, the document modal, and migration
`20260820070000_profiles_wants_updates`, applied to prod before the merge. A same-day audit of the
privacy and terms pages against the system they describe found and fixed six more issues (`e671790`).

**Phase 5 is complete.** The last open item was the announcement, and it resolved on 2026-08-20 to
*there is no announcement* — a What's New entry, a homepage banner item (`c27d53d`), and the guest
notice `progress.js` was already showing. See "Announcement planning" under Phase 5 for why.

⚠️ **No update email may be sent yet**, whatever the consent column says: the unsubscribe route and
any multi-recipient sender are unbuilt. See BACKLOG.md ·
**Last updated:** 2026-08-20

⚠️ **The step-by-step runsheet for Phase 5 is not in this repo** — it is an artifact, *Phase 5
Runsheet*, and it carries the click paths, who does each step, and the live-cutover order. This
document holds the reasoning and the findings; that one holds the sequence.

The phased breakdown of activities, with rationale for each. Companion to:

- [supabase-integration-plan.md](supabase-integration-plan.md) — *what* gets built: architecture, data model, decisions.
- [dev-workflow.md](dev-workflow.md) — *how work happens*: branches, previews, environments.

This document is the middle layer: the order of work and why that order. Granular steps within
each activity get worked out as each phase starts.

---

## Impact key

Each phase is marked for whether it changes what people see. Two columns, because admin and
visitor experience diverge sharply — most of the admin portal is invisible to visitors.

| Marker | Meaning |
|---|---|
| ⚪ **None** | No user-facing code touched. Pure foundation. |
| 🟡 **Silent** | User-facing code changed, intended effect is *zero* perceptible difference. Regression risk only, nothing to announce. |
| 🔵 **Visible** | Users notice a difference, but it isn't new functionality. |
| 🟢 **New** | New functionality or experience. Banner-worthy. |

| Phase | Status | Visitor | Admin | Announce? | Depends on |
|---|---|---|---|---|---|
| 0 — Branch + environment setup | ✅ **Done** (allowlist deferred to 3) | ⚪ None | ⚪ None | No | — |
| 1 — Progress module extraction | ✅ **Done — live** | 🟡 Silent | ⚪ None | No | — |
| 2 — Astro shell | ✅ **Done — live** | 🟡 Silent | 🔵 Visible | No | 0 |
| 3 — Supabase schema + RLS | ✅ **Done — live** | ⚪ None | ⚪ None | No | 0 |
| 4 — Email | ✅ **Done — live** | ⚪ None | ⚪ None | No | 3 |
| 5 — Auth + progress sync | ✅ **Done — live** | 🟢 **New** + 🔵 regression | 🟢 New | ✅ Banner + What's New, **no announcement** | 1, 3, 4 |
| 6 — News into the DB | ☐ Not started | 🔵 Visible + 🟢 New | 🟡 Silent | **Yes** | 2, 3, 5 |
| 7 — Admin portal + banner | ☐ Not started | ⚪ None | 🟢 **New** | No | 6 |
| 8 — Blog | ☐ Not started | 🟢 **New** | 🟢 New | **Yes** | 7 |
| 9 — Your learning | ✅ **Done — live** | 🟢 **New** | ⚪ None | ✅ Banner + What's New | 5 (not 6–8) |

**Phases 0–4 are entirely invisible to visitors** — roughly half the work, shippable to production
without a single announcement. That is deliberate: it front-loads risk into changes nobody sees.

---

## Cross-cutting constraint: two production origins

Phase 0 established that the site has **two supported production origins**, not one:

| Origin | Runs code? |
|---|---|
| `amplifiedthinker.com` (Vercel) | Yes — server rendering and `/api/` endpoints |
| `sing-chen.github.io/amplifiedthinker` (Pages) | **No** — static files only |

The GitHub origin exists because some corporate networks blocked the custom domain under
newly-registered-domain policies, leaving those users no alternative route.

**⚠️ This constraint now has an end date, and that changes how to design against it.** The block
lifted on 2026-08-18, and the Pages URL was never shared outside the owner's organisation — so the
origin's audience is zero and **it is slated for retirement**. It has not been retired yet, and both
origins are live, so changes are still verified on both. What retires is the published URL; the
repository, the history and the Actions workflows stay on GitHub.

**The consequence for every phase from 6 onward, while it lasts:** anything requiring a server is
unavailable to that audience. Client-side features carry over fine — auth, progress sync, favourites,
pins, notes, and client-rendered dashboards all work on static hosting because Supabase JS runs in
the browser. What cannot: the server-rendered blog (8), the admin portal (7 — no loss, it is
admin-only), `/api/` endpoints and legacy-URL 301s (6), and `middleware.js` social previews.

**How to weigh it now.** Prefer a client-side or prerendered implementation where it is the better
design anyway, and never deepen the dependency. But "this needs a server, so Pages cannot have it"
has become a **scheduling** question rather than a veto — retiring the origin ahead of the feature is
a legitimate answer, and is the reason the proposed contact form (Phase 7) changed shape. Do not
contort a feature to serve an origin nobody uses.

Full capability matrix in [dev-workflow.md](dev-workflow.md); staging and consequences in
[../BACKLOG.md](../BACKLOG.md).

---

## Progress log

### Phase 9 — done, merged, live on both origins (2026-08-21)

Merged as `ef7c58c`, out of order: it was scheduled last because it visualises data that only
exists once 5–8 have been running, but Phase 5 alone produces everything it needs. Nothing from
6, 7 or 8 was required. `npm run verify:stamp` reports both origins on `ef7c58c`.

**No migration.** The phase reads `skill_progress` and the generated catalogue and writes nothing,
so prod needed nothing applied before or after the merge — the first phase since 3 where the
database and the code did not have to move together.

#### The finding worth reading: a second definition of "complete" contradicted the first inside a day

`skills-progress.js` already existed, and its header says why: *"It owns no definitions. What 'in
progress' means, what counts toward a denominator, and how a date is formatted all live in
skills-progress.js so this page and **the dashboard** cannot disagree about the same account."*
It named this page, before this page existed.

It was not found, and the logic was written again. The two definitions then disagreed exactly as
predicted, and the reader saw it before any check did:

| | Future Skills library | The new page |
|---|---|---|
| Reads | `completed_at` | coverage of `state.visited` |
| Creative Thinking | **COMPLETED** | **30%** primer, **8%** plan |

Both were reading one row. The pages write `completed_at` when a reader presses the control at the
end — which is *not* the same question as "has every section been visited", because a page can be
finished without every section being individually registered. ⚠️ **Coverage is a floor, not a
measure.** The library also renders a complete artefact as 100% regardless of coverage
(`done ? 100 : percent`), and that rule had to be copied too, not just the source of truth.

**Two things made this findable only by a human.** The page was verified against synthetic rows
that happened to be self-consistent — coverage complete *and* `completed_at` set — so the fixture
could not expose the disagreement. And the site had no check that two surfaces agree about one
account; it still has none.

**Worth carrying forward:** grep for an existing module before writing a definition, and treat a
comment naming a surface that does not exist yet as a live instruction rather than a note. The
cost here was small because the contradiction was loud. A subtler one — a percentage differing by
three — would have shipped.

#### A safety net that quietly deleted the feature it was protecting

Scroll-triggered animation was built with `IntersectionObserver`. The observer never fires in the
agent's browser (see the 2026-08-19 finding below — the pane never composites), which read as
"broken", so a **3-second deadline** was added to reveal every section regardless of position.

That is not a fallback for a scroll trigger, it is its removal. On a real page all three sections
hit the deadline within three seconds of load, so everything below the fold animated unseen and
scrolling revealed charts that had already finished. The feature was gone and only the net was left.

⚠️ **A fallback that ignores the input a feature is keyed on cannot stand in for that feature.**
The replacement is scroll-driven too: the observer stays primary, and a passive scroll/resize
listener measures `getBoundingClientRect` against the viewport into the same idempotent `fire()`.

**And the throttle had to stop being `requestAnimationFrame`** — the conventional choice, and
wrong here. rAF does not run in a tab that is never composited and is paused outright in a
backgrounded one, so an rAF-throttled reveal never fires there. First attempt animated *nothing*,
including sections in plain view. It is a 100ms timer now; one `getBoundingClientRect` per waiting
section does not need the frame clock.

**The same reasoning applied to the count-up**, which must never leave a wrong number on screen:
it writes the final value *first*, then animates over it, so a stalled frame loop leaves the truth
rather than a legend reading 0 beside a ring showing 45%.

#### The design assumed an event model the schema does not have

The Claude Design bundle had eight modules. Four shipped; **three were cut for lack of data, not
effort**, and one for lack of any source at all:

| Cut | Needs |
|---|---|
| Sections read this week | a timestamp per section |
| Sections read over time, with range buttons | the same |
| Activity heatmap, "longest run of active days" | a row per active day |
| Self-rated confidence, out of five | a rating control that stores — the plans' Self-Reflection captures nothing |

`skill_progress` holds **one `updated_at` per row** and no per-section timestamp, so no time series
is derivable at all. Building any of them means an events table first, and it starts empty.
Recorded in [dashboard-design-brief.md](dashboard-design-brief.md) §3 so the next attempt does not
re-derive it.

#### Both the design and the brief stated a denominator that does not exist

The design said "All 70 sections" and "14 sections each". `public/skills-catalogue.json` says the
plans are **14, 14, 15, 14, 14**, and once the optional Explore Further is excluded, **13, 13, 14,
13, 13 — 66, not 70**, and never uniform. The design brief written earlier in the same work
repeated "14 sections" as fact; it was wrong too, and is now corrected.

⚠️ **Both numbers on the page are computed at runtime**, including the legend that would otherwise
read "14 sections each" and be false for four skills out of five. The catalogue exists precisely to
stop a number being written down twice.

#### Three copy dependencies fired at once, and one of them said so in advance

Shipping this made three statements untrue, all of them claims about what an account does:

- `terms.html` §1 — *"Creating an account adds one thing"*.
- `why-sign-up.html` — the tracker sat under **Soon**, *"not counted as reasons to sign up today"*,
  understating an account on the page where someone decides whether to trust the site.
- `future-skills.html` — the guest note, *"An account just means you don't have to find your place
  again"*, which **carried a comment instructing that it be changed in the commit that made it
  untrue**. That worked: the note was found by grepping for the feature, and the instruction was
  already there waiting.

All three moved in the same commit. The `future-skills.html` comment was re-armed for notes and
saved news, and `why-sign-up.html` gained one saying that when the last `Soon` row goes, the CSS,
the legend and the paragraph introducing it go with it.

`privacy.html` was checked and deliberately left alone: no new processor, storage key, outbound
request or purpose, and §3 already describes this exact data.

#### The name was wrong twice before it was right

"Learning Dashboard" was the working title; "dashboard" is operational-monitoring register the site
does not otherwise use. It was then built as **"Your progress"** — and that failed a question worth
keeping: *progress at what?* The site will not stay five skills, and once a blog and saved news
exist, "progress" has several plausible referents.

Shipped as **"Your learning"** at `/learning/`, renamed before launch so no redirect was needed —
files, CSS class prefix and keyframes included, because `dashboard.js` serving `/learning/` is
legacy on day one. ⚠️ "Your progress" survives where it describes **the record** rather than the
page — privacy §3, terms §8, the sign-in page — and those were deliberately not renamed.

#### One defect the phase created in a file it barely touched

`/learning/` showed its **read-failure panel to every signed-out visitor**. `nav.js` loads the auth
stack for a session-less visitor only on an allowlist of paths — `/sign-in` and `/account` — so
`AmplifiedAuth` never arrived, the six-second bound expired, and the page could not tell "signed
out" from "something broke". ⚠️ **Any new surface that renders a signed-out state has to be added
to `pageNeedsAuth()`**, and there is a comment there saying so now.

**Still unverified at merge, and only a human can close it:** that the sweep, the column growth and
the count-up actually *play* on scroll, and that `/learning/` and the library agree for a real
signed-in account. Everything structural about the animations was verified — classes attach,
animation names and durations resolve, final values are correct even when the frame loop never runs
— but nothing was ever seen moving.

---

### Phase 4 — done, merged, live on both origins (2026-08-18)

Merged as `f5297ab`. **Configuration only — nothing a visitor sees changed**, and the standing gate
confirms it: 66/66 files byte-identical against the git blobs on `amplifiedthinker.com` *and*
`sing-chen.github.io/amplifiedthinker`, 0 differing, 0 missing on either. The only deployed code
change sits inside `/auth-test/`, the scaffold Phase 5 deletes.

**The phase changed provider halfway through.** Brevo was configured, verified, documented — and
replaced the same day by Resend, for reasons that had nothing to do with whether it delivered.
Findings 12 onward are that story, and it is the one worth reading if you read none of the others.

| Built | |
|---|---|
| `scripts/verify-email-dns.mjs` (`npm run verify:email`) | 21 assertions, queried against a public resolver rather than the machine's — a local cache will serve the record you just replaced and tell you the change worked. |
| `docs/email-dns-baseline.md` | The zone as it stood before anything changed. Cloudflare keeps no DNS history, so this file is the only restore reference that exists. |
| `supabase/README.md` — the SMTP runbook | Resend setup, the Supabase fields, and *Why not Brevo* kept on the record rather than quietly rewritten. |
| `src/pages/auth-test.astro` | `selfUrl()` — the double-hash redirect fix, found by clicking a real link. |

| Done on the day | |
|---|---|
| **One record edited**: the apex SPF TXT | Brevo's `include` added *inside* the existing string. A second `v=spf1` record is a permerror that takes inbound authorisation down with it. |
| **Three records added**: `send` MX + SPF, `resend._domainkey` | Nothing existing touched, so there is no prior value to restore if it is backed out. |
| Supabase SMTP pointed at Resend; rate limit 30 → 100/hour | Sending-only API key, scoped to the domain. |
| **All three send types verified from raw source** | Signup, password reset, and both halves of an email change — not from a dashboard, and not from Gmail's authentication summary, which was green throughout the Brevo configuration that had to be abandoned. |
| Inbound mail re-tested by delivery | The single thing this phase touched that already worked. |
| mail-tester: SpamAssassin **0.1** against a −5 spam threshold | The content-and-reputation half that raw source cannot show. |
| Cleanup | Orphaned Brevo key deleted, with the Gmail alias sent from either side of the deletion to prove which key went. All test users removed. |
| Signup switched **off** in Supabase | Nothing user-facing creates an account until Phase 5, and the `anon` key becomes public in that phase. Re-enabling it is now a Phase 5 activity with a precondition. |

**Findings, in the order they were learned.** The first four came from capturing the DNS zone before
touching it; the rest came from delivered mail, a clicked link, and a raw source read line by line:

1. **Brevo SMTP credentials exist — and Supabase still needs its own.** The question was framed as
   either/or: either a key exists, or Brevo is only doing domain authentication and one must be
   created. The answer is both halves at once. A key named **"Gmail Send As"** was created
   2026-07-06, four minutes before Gmail's *Send mail as* confirmation for
   `singchen@amplifiedthinker.com` — so "sent from Gmail, masked" means **Gmail relaying through
   Brevo's SMTP**, and outbound through Brevo has been working since July. But that key's value is
   shown once and Gmail will not display it back, so it is unusable here, and sharing one key across
   two senders would make a rotation for one silently break the other. Supabase gets a second key.

   **The evidence was in the mailbox, not the dashboard.** The Brevo alert, the Gmail confirmation,
   and messages actually sent from the alias each date and corroborate the others. Worth remembering
   that account history is a queryable record when a dashboard is not to hand.

   **Then confirmed directly**, because the above was still inference: Gmail → Settings → Accounts
   and Import shows the alias as *"Mail is sent through: smtp-relay.brevo.com, secured connection on
   port 587 using TLS"*. So Brevo outbound has been working since July **through the exact host and
   port Supabase will use** — which is a materially better starting position than "an SMTP key
   exists", and it settles the relay values without trusting recollection.

2. **MX and A cannot collide; the SPF TXT is where the three systems actually meet.** Cloudflare
   Email Routing owns inbound (`MX`, an SPF include), Brevo owns outbound (DKIM selectors, an SPF
   include), Vercel owns the website (`A`, `CNAME`) and publishes no MX at all. So the coexistence
   question, asked about MX versus Vercel, was safe by record type. The genuine hazard is the one
   record two of them share: **a domain may have only one SPF record, and a second one beginning
   `v=spf1` is a permanent error that fails SPF outright — including Cloudflare's inbound
   authorisation.** "Add a record" is both the obvious way to add Brevo and the wrong one. The gate
   asserts the single-record property first.

3. **DKIM and DMARC are verifiable from DNS; alignment is not.** Both selectors resolve to live RSA
   keys and DMARC is a real `p=quarantine` — a misaligned send goes to spam rather than merely
   scoring badly. What DNS cannot say is what Brevo puts in the `Return-Path` for this account,
   which decides whether SPF *aligns* or only DKIM does. That is a header on a delivered message,
   so it gets read from one rather than argued from documentation — the same move as finding 12 in
   Phase 3, which cost three assertions from docs before anyone ran the test.

4. **Cloudflare is authoritative DNS, not GoDaddy.** `recovery.md` had GoDaddy against "DNS for
   `amplifiedthinker.com`". It is the registrar; the zone is Cloudflare's. A record changed at
   GoDaddy would do nothing — a bad thing to learn while trying to fix mail under pressure.
   Corrected.

5. **The obvious pre-flight test produces no evidence at all, and the giveaway is an absence.** The
   plan says to verify alignment *before* the first real send. The cheap-looking way to do that is
   to send one message from the Gmail alias to your own Gmail and read its `Authentication-Results`.
   That test is void: Gmail sees the recipient is the sending account, matches the `Message-ID`
   against the Sent copy, and delivers internally. *Show original* then renders the **sent** copy —
   no `Received`, no `Authentication-Results`, no `Return-Path`, no `DKIM-Signature`, and
   "Delivered after 0 seconds".

   **The absence is the signal, and it is a quiet one.** There is no error and no failed check —
   just a header block that starts at `MIME-Version:`. Had the summary table shown a PASS it would
   have been believed. Plus-addressing does not rescue it either, since the mailbox is the same.
   Same shape as finding 13 in Phase 3: a check that cannot fail is not a check, and here it could
   not even report.

   **What it cost, and what it did not.** It cost nothing except the instinct to retry it slightly
   differently, which is the trap worth naming. It did not move the risk: DKIM keys are published
   and live, DMARC is known, and **DMARC passes on DKIM alone**, so SPF alignment is a second route
   to the same verdict rather than a prerequisite. The faithful test is Supabase-via-Brevo to a
   mailbox that is not the sender's, which is the phase's "done when" anyway — and it is safe to
   reach for it directly, because the first real send goes to a test inbox. *That* is what "before
   the first real send" is protecting: a user receiving it, not us.

6. **The first real send through Brevo passed everything, including the part that matters.**
   Supabase → Brevo → Gmail, signup confirmation to a plus-addressed inbox on 2026-08-17:

   | | |
   |---|---|
   | SPF | PASS, IP `77.32.148.23` (inside Brevo's `77.32.128.0/18`) |
   | DKIM | PASS, **`d=amplifiedthinker.com`** — aligned, so DMARC passes on this alone |
   | DMARC | PASS |
   | From | `Amplified Thinker <noreply@amplifiedthinker.com>` |
   | Placement | **`INBOX`**, no `CATEGORY_PROMOTIONS`, marked Important |
   | Latency | 2 seconds, no greylisting |

   **Placement is the assertion, not authentication.** Three PASSes are necessary and say nothing
   about which tab a message lands in; the phase's rationale is inbox-versus-spam. This delivery is
   admissible evidence where the earlier self-send was not, because it went to a different address
   and arrived from outside, so Gmail applied real filtering to it.

   The confirmation link was then clicked and landed on `/auth-test` rather than the bare Site URL —
   worth checking explicitly, because the silent substitution of the Site URL is the exact failure
   Phase 3's probe existed to catch, and it looks like success.

7. **A real password-reset click found a defect that only exists on the *second* auth round-trip,
   and it fails without erroring.** The reset email arrived, DMARC-clean, in the inbox, and its link
   redirected to exactly the right origin and path — the allowlist honoured, the mail perfect. The
   page then showed the *previous* session, as though nothing had happened.

   The address bar had **two** hash marks: `/auth-test##access_token=…`.

   `auth-test` passed `window.location.href` as its redirect target. After the first auth
   round-trip, supabase-js consumes the token and tidies the URL, leaving a bare trailing `#`. That
   `#` then travels into the next `redirectTo`, Supabase appends its own fragment, and the result is
   a double hash. supabase-js reads the fragment as `url.split('#')[1]`, which for `##…` is the
   **empty string** — so it parses zero parameters and never sees the token:

   ```
   #access_token=TOKEN   ->  split('#')[1] = "access_token=TOKEN"   ->  parsed
   ##access_token=TOKEN  ->  split('#')[1] = ""                     ->  nothing
   ```

   **Nothing errors anywhere.** No failed request, no console message, no bad redirect. The only
   symptom is a stale-looking session panel, which reads as a rendering quirk rather than a broken
   auth flow. Fixed with a `selfUrl()` helper that rebuilds the target from `origin + pathname`.

   **Three things worth carrying into Phase 5.** First, `auth.js` will do this same redirect and
   `window.location.href` is the natural way to write it — the comment sits at the fix so it is read
   at the moment it matters. Second, the bug is invisible on a first test: a fresh page works
   perfectly, and only a *second* auth action on the same page fails, so any verification that
   reloads between steps would miss it entirely. Third, and most in keeping with Phases 1 and 3:
   every automated signal here was green. This came from a human clicking a link and noticing the
   name on the session line was the wrong one.

8. **The SPF record this phase changed turns out not to be the one doing the work — and the header
   said so.** The question left open at finding 3 was what Brevo puts in the `Return-Path`, because
   that decides whether SPF aligns. A delivered message answers it:

   ```
   smtp.mailfrom = bounces-…@gw.d.sender-sib.com
   dkim=pass  header.i=@amplifiedthinker.com  header.s=brevo2
   dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE)
   ```

   The envelope sender is Brevo's own bounce domain, so **SPF is never evaluated against
   `amplifiedthinker.com` at all** — and it cannot align either, `sender-sib.com` and
   `amplifiedthinker.com` being different organisational domains. The `include:spf.brevo.com` added
   during this phase is **inert for the current flow**. Kept regardless: Brevo documents it, it costs
   one lookup of ten, and it becomes load-bearing the moment a custom Return-Path on this domain is
   configured. But it is precaution, and the gate now says so rather than showing a green line that
   implies SPF is what carries this mail.

   **DMARC is passing on DKIM alone, which makes DKIM a single point of failure.** Not a degradation
   if a selector breaks — total failure, under `p=quarantine`, with no second mechanism beneath it.
   Every auth email would go to spam. That is worth knowing before Phase 5, and it is the strongest
   argument for eventually getting SPF to align rather than merely to exist.

   **The method is the point, and it is the third time this project has paid off.** The recommendation
   to add the include was made from Brevo's documentation and was reasonable; the header shows it does
   nothing here. Phase 3 finding 12 flipped two of four Advisor verdicts by testing them; finding 14
   found the allowlist was probeable without email. Same shape: the documented answer and the measured
   answer differed, and only one of them was written down.

9. **The gate raised a false alarm about the website within the hour, and the fix is a lesson about
   what a check is allowed to assert.** The "apex A records still point at Vercel" assertion pinned
   two exact addresses, captured at baseline. Forty minutes later it went red: `64.29.17.1` had
   become `64.29.17.65`. Nothing in the zone had changed — the apex is a CNAME that Cloudflare
   flattens, and Vercel rotates within its anycast `/24`s. The next run returned `.1` again.

   Both origins were serving `200` throughout, so the only damage was to the gate's credibility —
   which is the actual cost. **A check that fails for reasons unrelated to what it claims to watch
   trains you to ignore a red line, and it will be red for a real reason exactly once.** The
   assertion now matches the `/24` prefix, which is the thing that would genuinely change if the
   apex stopped pointing at Vercel.

   Notable that this surfaced during a phase editing that same zone by hand: a spurious "the website
   records moved" is precisely the alarm most likely to be believed and acted on at the wrong moment.

10. **Brevo rewrites auth links, injects a tracking pixel, and attaches a one-click unsubscribe to
    password-reset-class mail — and none of it is visible in Gmail's authentication summary.** Found
    by reading the full raw source of a message whose summary table had already been read and passed.

    ```
    <a href="https://bbgagihj.r.bh.d.sendibt3.com/tr/cl/CrxdO_mBR2li...">Confirm email address</a>
    <img style="display:none" src="https://bbgagihj.r.bh.d.sendibt3.com/tr/op/m2WEwix2...">
    List-Unsubscribe-Post: List-Unsubscribe=One-Click
    ```

    Three defaults, all wrong for authentication mail, in rising order of severity:

    | | Why it is wrong here |
    |---|---|
    | **Open tracking** | An analytics beacon in transactional mail. Minor privacy and spam-score cost. |
    | **Click tracking** | The confirmation link does not point at Supabase. **A bearer token now passes through a third party and into their click logs**, on a URL shaped exactly like phishing. Corporate filters that strip redirector links would break auth outright — landing hardest on the NRD-blocked audience, who already reach the site by only one route. |
    | **`List-Unsubscribe`, one-click** | Gmail renders an Unsubscribe control beside the sender. **A user can unsubscribe from their own password reset**, and may then be suppressed — after which auth mail silently stops, unrecoverably, with the user unaware of what they did. |

    **Confirmed on both the signup and recovery templates**, so it is account-wide rather than one
    template's quirk — every future Supabase template inherits it too. And the recovery sample makes
    the worst case concrete rather than predicted: Gmail renders an Unsubscribe control beside a
    *password reset*, with the reset token routed through the click tracker.

    **Provably Brevo's doing, not Supabase's**, which is what locates the fix. The DKIM `h=` list is
    `…:list-unsubscribe:x-csa-complaints:list-unsubscribe-post:…` — those headers sit *inside*
    Brevo's own signature, so Brevo added them before signing. Nothing in the Supabase templates
    needs changing; all three are Brevo transactional settings.

    **Why this is the phase's most useful finding, and how close it came to being missed.** Every
    signal that had been checked was green: SPF, DKIM, DMARC, inbox placement, a link that worked
    when clicked. The authentication summary Gmail offers — the thing this phase was designed
    around — reports on *provenance* and says nothing about *content*, and the content is where the
    real risk was. Delivery had been proven; safety had not, and the two had been treated as one.

    The precedent now runs to four phases: Phase 1's accordion defects, Phase 3's findings 12 and
    13, Phase 4's double-hash redirect, and this. **Every one was found by a human reading real
    output, and every one had a green board above it.**

11. **DMARC aggregate reports go to a GoDaddy address nobody reads** —
   `rua=mailto:dmarc_rua@onsecureserver.net`, left behind from before the zone moved. The one
   channel that would report an alignment failure points at a third party. Non-blocking, and the
   gate warns rather than fails on it.

12. **Finding 10 had no fix, and that made it a procurement decision rather than a bug.** The
    natural next step after finding 10 was to go and turn the three settings off. They are not
    there. Brevo's Transactional → Settings exposes only "Anonymous email tracking"; the
    Configuration and Senders panels offer nothing relevant; and Supabase cannot compensate, having
    no custom-header control. Confirmed as a documented product limitation rather than a panel not
    yet found.

    **So the provider changed mid-phase**, four hours after being configured, verified, and written
    up. Auth mail moved to Resend; Brevo kept the Gmail alias it was already doing.

    **The uncomfortable part is that Brevo worked.** All three send types reached the inbox in about
    two seconds, DMARC-passing, marked Important, no Promotions tab. Judged on delivery — which is
    how the phase's "done when" was originally written — it passed everything. It was still the
    wrong provider, because the mail it delivered carried a bearer token through a third party's
    click logs and offered a one-click unsubscribe on a password reset.

    **The lesson is about what a success criterion is allowed to measure.** "Arrives in the inbox"
    is observable, cheap, and was the stated goal; it was also satisfied completely by a
    configuration that had to be abandoned. A criterion that a bad outcome can satisfy is not a
    criterion. This is the same failure as finding 9's false alarm, inverted: there, a check went red
    for a reason unrelated to its claim; here, a check went green for one.

13. **The replacement closed a single point of failure the old one had made permanent — using a
    setting that was already on the zone by accident.** Finding 8 established that DMARC passed on
    DKIM alone, because Brevo bounced from its own domain and SPF could never align. Resend's
    **Custom Return-Path** puts the envelope sender on `send.amplifiedthinker.com`. Measured on a
    delivered message:

    ```
    smtp.mailfrom = …@send.amplifiedthinker.com
    spf=pass   (54.240.3.9)
    dkim=pass  header.i=@amplifiedthinker.com  header.s=resend
    dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE)
    ```

    SPF now **aligns**, so DMARC has two independent passing mechanisms where it had one. A broken
    selector is a degradation again rather than an outage.

    **It works only because of `aspf=r`, which nobody chose for this reason.** Relaxed alignment
    compares organisational domains, so `send.amplifiedthinker.com` matches a `From:` of
    `amplifiedthinker.com`. Under `aspf=s` the names would be compared exactly, and the entire
    benefit would vanish — while the record looked *stricter*, and therefore safer, to anyone
    tidying it. The gate now asserts `aspf=r` for exactly that reason. **A pre-existing setting can
    be load-bearing for a decision taken long after it, and nothing in the record says so.**

    ⚠️ **Resend's mail carries two DKIM signatures and only one counts.** The second is
    `d=amazonses.com` — Amazon signing its own outbound. It passes, it is not ours, and it cannot
    align with `header.from`. A raw source read after a broken selector will still show a
    `dkim=pass`.

14. **The switch added records instead of editing one, and that asymmetry is the whole risk story of
    this phase.** The Brevo step edited the apex SPF TXT in place — a shared record, where a mistake
    is a permerror that takes Cloudflare's inbound authorisation down with it. The Resend step added
    three hostnames nothing else uses. Both are "add a DNS record" in the dashboard; they are not
    the same class of change, and backing them out is not the same job either. There is no prior
    value to restore for the Resend records, only three names to delete.

    **Two offers declined, both of which would have re-introduced apex risk for convenience.**
    Resend's **Auto configure** wanted write access to the whole zone — the one holding the Email
    Routing MX records and the apex CNAME to Vercel — to save typing three records. Its **Enable
    Receiving** toggle publishes an `MX` at the apex, where Cloudflare's three already live. Both are
    reasonable features and both were wrong here; the gate warns on the first and the baseline
    documents the second.

    Cloudflare also suggested proxying the DNS records for "security and performance". Following it
    would put Cloudflare in front of Vercel for the production site — an unrelated change to how
    both origins serve, surfaced as a recommendation in the middle of a mail task.

15. **An independent scorer confirmed the alignment claim, and its two complaints are both things to
    leave alone.** mail-tester on 2026-08-18: SpamAssassin **0.1** against a −5 spam threshold, all
    six authentication checks green, 22 of 23 blocklists clean.

    The line worth having is **`DKIM_VALID_AU` — "valid DKIM signature from author's domain"**.
    SpamAssassin reached the alignment verdict from the message itself, where finding 13 reached it
    by reasoning about `aspf=r` and organisational domains. Two methods, one answer, and neither
    borrowed from the other.

    **Both amber items are correct as they stand, which is the more useful thing to record:**

    | Flag | Why it stays |
    |---|---|
    | *No `List-Unsubscribe` header* | Its absence is what finding 12 changed provider to achieve. mail-tester assumes bulk mail; acting on this would put an unsubscribe control back on a password reset. |
    | *Yellow listed in Hostkarma* | Mixed reputation is what a shared SES IP always looks like — Amazon sends everyone's mail from it. Not actionable without a dedicated IP, and the same IP scored *Very Good (+4)* on Mailspike in the same report. |

    **A tool that grades you against the wrong genre will penalise correct decisions.** The score is
    worth having for the half raw source cannot show — encoding, formatting, broken links, IP
    reputation — and not for its arithmetic. A 10/10 reachable only by adding an unsubscribe link to
    a security email is a worse result than this one.

16. **Two smaller things, recorded because neither is worth acting on now and both will look
    unfamiliar later.**

    **The email-change confirmation sent to the *old* address is worded as a routine confirmation.**
    Supabase's secure email change sends two messages, and both must be clicked, so the protection
    is real and ignoring the message defeats the change. But the one arriving at the address being
    taken away reads *"Confirm your new email address"* rather than warning that the account's email
    is being changed. In a hijacked-session scenario, the legitimate owner receives something that
    reads like housekeeping. A template wording fix for Phase 5, not a defect in the mail path.

    **The browser reports a clock skew of exactly 3600 seconds** against gotrue's token timestamps.
    Random drift does not land on a round hour — this is timezone or DST handling, not a wandering
    clock. Harmless while gotrue only warns; worth remembering when Phase 6 puts token validation on
    a server, where time comparisons stop being advisory.

### Phase 3 — done, merged, live on both origins (2026-08-17)

Merged as `2173242`. **The 16 existing pages are untouched: 66/66 byte-identical against the git
blobs on `amplifiedthinker.com` *and* `sing-chen.github.io/amplifiedthinker`, 0 differing, 0 missing
on either** — the same gate Phase 2 used, re-run as a regression check. The only site-visible
addition is `/auth-test/`, a throwaway scaffold marked for deletion at the end of Phase 5.

**Database verified independently of the merge**, which is the useful property: 9 tables, RLS enabled
in the same block as each `create table`, 17 policies, the signed-out gate at 22/22, and the admin
gate exercised in both directions signed in. None of that depended on any deploy.

| Built | |
|---|---|
| `supabase/migrations/20260817120000_initial_schema.sql` | All 9 tables, RLS enabled in the same block as each `create table`, every policy, `is_admin()`, the `is_admin` guard trigger, a signup trigger, and the grant narrowing. One transaction. |
| `supabase/rollback/…_down.sql` | The hand-written down-path. A Vercel rollback restores code, never schema. |
| `scripts/verify-rls.mjs` (`npm run verify:rls`) | The signed-out gate, over plain fetch against PostgREST — no client library between the assertion and the database. |
| `src/pages/auth-test.astro` | The signed-in half. Throwaway; delete at the end of Phase 5. |
| `supabase/README.md` | Apply, roll back, verify, and the dashboard settings SQL cannot reach. |

| Done on the day | |
|---|---|
| Project `spehmrgmcdenqdftkyrt` created, EU | One project. The dev/prod split stays a Phase 5 activity. *Automatically expose new tables* off and *Enable automatic RLS* on, both verified afterwards by creating a probe table and asking what it inherited. |
| Both migrations applied | The first failed once on ordering (finding 9) and rolled back whole. |
| Redirect allowlist set, all four entries | Phase 0's last open activity, closed. |
| **Signed-out gate: 22/22** | The phase's written "done when". |
| **Signed-in checks: 8 PASS non-admin, 9 PASS admin** | The admin gate exercised in both directions, which no automated check could have done. |
| Preview origin verified | Sign-in plus a password-reset redirect landing back on the branch URL — the wildcard entry proven by behaviour rather than by reading the pattern. |

| Merged and verified | |
|---|---|
| Merged to `main`, live on both origins | 66/66 byte-identical on each. |
| Both production origins exercised | Connect, sign in, and the full check suite passing on `amplifiedthinker.com` and `sing-chen.github.io/amplifiedthinker`. |
| **All four allowlist entries verified** | Two by real email links (localhost, preview), two by direct probe of `/auth/v1/verify` once the mailer rate limit bit — with a deliberately unlisted control confirming the probe discriminates. See finding 14. |

**One deploy failed and it was not ours.** The Pages run for `d09475b` failed at
`actions/deploy-pages@v4` with `503 … is githubstatus.com reporting a Pages outage?`, plus a `429`
fetching the action itself. The identical workflow had succeeded three minutes earlier. Impact was
nil: that commit touched only `docs/dev-workflow.md`, which sits outside `public/` and `src/`, so the
build output was byte-identical to what had already published. Worth checking *what a failed deploy
would have shipped* before treating a red X as an incident.

**Findings from building against the real code rather than the plan:**

1. **The data model's localStorage example is one field stale, and the schema absorbed it for
   free.** `supabase-integration-plan.md` documents plan state as
   `{quizSelected, quizRevealed, quizOrder, habitOpen}`. The live page also saves `cardsOpen`,
   added by Phase 1's accordion fix *after* the model was written. Because `state` is `jsonb`,
   this cost nothing — the column that was chosen for flexibility had already been vindicated
   before it existed. Recorded rather than corrected upstream, because the drift is the point.
2. **`position` and `visited` are not the same type across content types.** `plan.html` stores
   section-id *strings*; `primer.html` stores slide-index *numbers* (`new Set([0])`). Chosen:
   `text` / `text[]`, with the coercion left in each page's mapping layer — exactly where
   `progress.js` already draws that line ("each page still owns the mapping between its own DOM
   and the stored shape"). The alternative, two columns or a wider type, would have moved
   page-specific knowledge into the schema.
3. **`force row level security` was written, then removed — it would have locked the one
   documented way to grant admin.** FORCE applies RLS to the table owner, which is the role the
   dashboard SQL editor runs as, and the `is_admin` guard trigger deliberately leaves a hole for
   exactly that connection. Plain `enable` is correct here; the near-miss is noted in the
   migration so nobody "hardens" it back.
4. **Grants are the second layer, and the more reliable one.** Supabase grants `anon` broadly on
   `public` by default, so a table whose policy is subtly wrong is protected only by RLS
   defaulting to deny. The migration revokes and re-grants explicitly: `anon` ends with no
   INSERT/UPDATE/DELETE anywhere and no SELECT at all on the four user-owned tables. The plan
   called for this in one line ("restrict what `anon` is granted"); it is worth the section it got.
5. **"At most one pinned story" made structural.** The data model describes the editorial pin as
   at most one site-wide. `news.json` was checked — exactly one — so it became a partial unique
   index rather than a convention Phase 7's admin UI would have to remember.
6. **The Vercel scope is `singchen`**, recovered from preview URLs in
   `.claude/settings.local.json`. `dev-workflow.md` carried it as `<your-scope>`; the allowlist
   line is now concrete.
7. **`is:inline` held.** The new page builds and, checked in a browser at both `/auth-test` and
   `/auth-test/`, `nav.js` resolves links correctly from either. No `type="module"` in the
   output. Verified rather than assumed, since this is the trap Phase 2 recorded.
8. **The test page was rewritten to take credentials at runtime, and that is a small version of a
   standing constraint.** It first read `PUBLIC_` env vars at build time — which works locally and
   is silently useless everywhere else, because `.github/workflows/pages.yml` passes only
   `ASTRO_BASE` and Vercel had no variables set. Verifying the deployed origins would have needed
   the same two values configured in **three** build configs, for a page marked for deletion at the
   end of Phase 5. It now takes them in two fields backed by `localStorage`, so it runs unchanged on
   all four origins with no build config anywhere, refuses a `service_role` or `sb_secret_` key
   (which would bypass RLS and turn every check green while proving nothing), and is inert for a
   stray visitor after merge. **The general form is worth carrying: anything that must work on both
   production origins should decide at runtime, because only one of them has a build you control.**
   That is the same conclusion `supabase-client.js`'s hostname switch reaches from the other
   direction.

9. **The migration failed on its first real run, on ordering — and the failure mode is worth
   knowing.** `is_admin()` sat in a "helper functions" section at the top, 40 lines above the
   `profiles` table it reads, which errored with `42P01: relation "public.profiles" does not
   exist`. The cause is that `check_function_bodies` is on by default and a **`LANGUAGE sql`**
   body is fully parsed at `create function` time, so every object it names must already exist.
   The instructive part is the contrast sitting ten lines below it: `handle_new_user()` names the
   *same table* and would have been perfectly happy in that position, because **`LANGUAGE plpgsql`**
   bodies get a syntax check only, never an object-existence check. Same reference, same schema,
   different language, different rule. Fixed by moving `is_admin()` to immediately after
   `profiles`, with the reason recorded inline so it does not get tidied back. An audit of every
   other definition-versus-reference pair in the file came back clean, and `is_admin()` was the
   only `LANGUAGE sql` function in it — so this was a single-instance bug, not a pattern.

   **Cost of the transaction design: zero.** The failure rolled back whole, the database was
   untouched, and the retry was a re-paste. That is the property the one-transaction shape was
   chosen for, tested by accident on the first attempt.

10. **The Supabase Advisor found 9 warnings the migration should not have left, and one of them was
    live rather than theoretical.** Eight were mine: `set_updated_at` missing the pinned
    `search_path` the other three functions had, and four `SECURITY DEFINER` functions granted
    `EXECUTE` to `anon` and `authenticated`. Cleared in a **second migration**
    (`20260817140000_harden_function_grants.sql`) rather than by editing the first — an applied
    migration is history, and editing it means the file stops describing the database that exists.
    The "all tables in one migration" principle is intact; this one creates no tables.

    **Testing the warnings rather than trusting them changed two of the four verdicts.** Probing
    each function over RPC before applying the fix:

    | Function | Returns | Probe | Reality |
    |---|---|---|---|
    | `handle_new_user()` | `trigger` | 404 | **Never reachable.** PostgREST does not expose functions returning `trigger`, whoever holds `EXECUTE`. The Advisor's "callable via `/rest/v1/rpc/…`" was not true. |
    | `profiles_guard_privileged_columns()` | `trigger` | 404 | Same. |
    | `is_admin()` | `boolean` | 200 `false` | Reachable, and harmless — it filters on `auth.uid()`, null for anon, so it could only ever answer `false`. Revoked as least privilege, not as a fix. |
    | `rls_auto_enable()` | `event_trigger` | **400** | **Genuinely reachable** — PostgREST resolved it and got as far as failing to serialise the return type. The one I was least inclined to touch, being Supabase's own, was the only live exposure. |

    The asymmetry is the part worth keeping: a `trigger` return type is invisible to PostgREST, an
    `event_trigger` return type is not. Not predictable from the warning text, and it is the
    difference between a theoretical finding and a real one.

11. **`is_admin()`'s gate assertion got stronger by accident.** It used to assert the function
    *returns false* for an anonymous caller. Once `anon` lost `EXECUTE`, that assertion had to
    become *cannot call it at all* — which is what should have been asserted from the start. The
    weaker version proved the answer was harmless; the stronger one proves the door is shut.
    `authenticated` keeps `EXECUTE`, because RLS policy expressions are evaluated with the querying
    role's privileges, so a role must hold `EXECUTE` on any function its policies call.

    Gate is now **22/22**, up from 19, with the three added checks all covering the RPC surface.

12. **The last Advisor warning was tested rather than argued, and the test found something bigger
    than the warning.** The claim — that `authenticated` needs `EXECUTE` on `is_admin()` because RLS
    policy expressions are evaluated with the querying role's privileges — was asserted three times
    from documentation before anyone ran it. Revoking the grant with a live session confirmed it
    immediately, so the warning is permanent and the note in `supabase/README.md` stands.

    **But the failure was not where it was predicted, and that is the finding.** The expectation was
    that admin *writes* would break. What actually broke was reading your **own** profile row:

    ```
    FAIL  profiles: own row exists    permission denied for function is_admin
    FAIL  profiles: select * ...      permission denied for function is_admin
    ```

    `profiles` carries two permissive SELECT policies, and permissive policies are **OR-ed** — so
    evaluating the set evaluates the admin one too, for every caller. A function the role cannot
    execute therefore does not disable the admin branch, it **errors the whole read for everyone**.

    **Carry this into Phase 7:** adding an admin policy to an existing table can break ordinary
    users' access to it if the function grants are wrong, and the symptom is a permission error on a
    table whose own policies read perfectly.

13. **The check written to detect this could not have detected it — it passed either way.** Check 7
    asserted only `Boolean(error)`, and "permission denied for function is_admin" carries error code
    `42501`, exactly as an RLS refusal does. So the check designed as the experiment's signal was
    blind to the experiment, and the answer arrived from the three checks it had been assumed would
    be uninformative. Now asserts *why* the write was refused (`row-level security` in the message),
    not merely that it was.

    A second cascade in the same run: check 1's failed read left `is_admin` null, which the page
    read as `false`, so check 3 confidently reported `tried false -> true` about a value it never
    obtained. The suite now aborts when it cannot read its own profile rather than emitting a board
    of derived nonsense.

    **The general lesson, and it applies to every check in this phase:** a test that passes on *any*
    error is not testing what it claims. Both of these were written to fail closed and did — while
    saying nothing true.

14. **The allowlist can be tested without sending any email, and finding that out late cost the
    phase its whole mail allowance.** Verification was designed around real emails: sign up on one
    origin, then a password-reset link on each of the others. That works, and it proved localhost and
    the preview branch — but the built-in mailer allows roughly two messages an hour, and the third
    request silently did nothing, with the last two origins still unverified.

    `/auth/v1/verify` decides its redirect **before** validating the token, so an obviously invalid
    token still exercises the allowlist. Allowlisted origins are honoured; unlisted ones are silently
    swapped for the Site URL — which is the exact failure mode the whole exercise exists to catch, now
    reproducible on demand instead of by waiting on an inbox.

    **The control is what makes it evidence.** Probing a deliberately unlisted origin in the same
    batch returned the Site URL, so "honoured" means something rather than being the endpoint's
    default. Without that control the four passes would have proved nothing.

    **The general shape, which is the part worth carrying:** the expensive, rate-limited, human-in-
    the-loop test was verifying two things at once — that mail works, and that this origin matches.
    Only the first needs an inbox, and only once. Once separated, the per-origin half became a
    scriptable probe that runs in two seconds. Look for that split before building a slow verification
    loop, not after exhausting it.

**One assertion in the gate is time-limited, and the script says so.** "Every table returns zero
rows when signed out" is true for the content tables only while they are empty — from Phase 6,
`news_stories` returns published rows to anonymous callers by design. The durable invariant is the
other half: `profiles`, `skill_progress`, `user_news` and `notes` are refused outright, because
`anon` holds no grant on them at all. The script distinguishes the two so a future green board
still means something.

### Phase 1 — done, merged, live (2026-08-17)

Shipped in `ed7a00b`, with follow-up fixes in `e067d8c` and `11c6be1`. Net −72 lines on the
refactor itself; 10 duplicated implementations became one.

- `progress.js` at the repo root, loaded by all 10 skill pages after `nav.js`. Owns storage only:
  key naming, JSON, and the fail-silent try/catch. Pages keep their own DOM↔shape mapping.
- Storage keys unchanged, and now derived from the URL rather than hardcoded per page — 10
  constants removed.
- Verified byte-identical output by seeding a known payload, reloading, and re-saving against both
  the old and new code, including the pre-existing quirk where `section` is `null` until the first
  scroll. Restore, resume, reset and save-on-navigate all exercised across all 10 pages.

**Two defects surfaced by manual verification, both pre-existing rather than caused by the
refactor, both now fixed:**

1. Principles & Models accordions never persisted — `toggleAccordion()` didn't save and
   `restoreState()` only handled `habitOpen`. Now tracked by id, with page defaults captured
   separately so reset returns to a first-visit state rather than blank.
2. `updateNav()` guarded both branches of its visited toggle with `s !== activeId`, so a link
   that became active kept a stale `visited` class. With `.visited` declared after `.active` at
   equal specificity, the current section rendered as visited. Fixed with a single `toggle`, plus
   rail states redesigned so shape distinguishes them: empty ring / solid fill / fill with halo.

**Worth carrying forward:** neither defect was catchable by the byte-identical payload test, which
by design only proved the refactor changed nothing. Both came from a human looking at a real
browser. Later phases should not treat automated verification as sufficient for anything visual.

### Phase 2 — done, merged, live on both origins (2026-08-17)

Merged as `a68a6a3`. **Verified in production against the git blobs: all 66 tracked files in `public/`
byte-identical on `amplifiedthinker.com` *and* `sing-chen.github.io/amplifiedthinker` — 0 mismatched
on either.** The generated Astro page carries `/amplifiedthinker/` asset prefixes on Pages and bare `/`
on Vercel, with canonical pointing at the custom domain from both.

**`middleware.js` survived the framework build**, which was the phase's biggest unknown. Root-level
Vercel Edge Middleware still fires under an Astro build, and all three cases are correct:

| Request | Result |
|---|---|
| LinkedInBot UA + `?story=` | ✅ share shell, correct title |
| Normal browser UA | ✅ real news page |
| Bot UA, no `story` param | ✅ real news page |

**No Pages downtime.** Pages kept serving its previous deployment through the merge and swapped when
the Actions run finished — the earlier probe showing the old build was CDN lag, not an outage. The
legacy `pages build and deployment` correctly stopped firing once the source moved to Actions.

**Two process findings worth carrying:**

1. **`workflow_dispatch` needs the workflow file on the default branch** before GitHub will show a
   "Run workflow" button, so the intended verify-before-merge sequence was impossible until the file
   landed on `main` (`9c01355`, pushed with `[skip ci]` so the run it would otherwise trigger — and
   fail, since `main` had no `package.json` yet — never started).
2. **The `github-pages` environment blocks non-default branches from deploying.** The dispatch against
   the branch failed at `deploy` while `build` passed, which still proved `npm ci`, the Astro build and
   the artifact upload on CI. The remaining unknown — serving under a subpath — was verified locally by
   staging the build under a directory named `amplifiedthinker`, which needed no rule changes.

**Near-miss worth recording:** the first production verification compared served bytes against the
*working tree* and reported 25 of 28 text files mismatching, with all 3 binaries passing. That pattern
is a line-ending artifact — `core.autocrlf=true` means the working tree is CRLF while every origin
serves the LF blob. Comparing against `git show HEAD:<path>` gave 66/66. Phase 1's line-ending lesson
resurfacing in a new disguise, and it briefly looked like a disaster.

### Phase 2 — build notes (superseded by the entry above)

Branch `feat/astro-shell`, commit `b03e6f2`. Astro 7.2.2, `output: 'static'`, no adapter. All 16 pages
moved into `public/` as pure renames — git recorded every one at 100% similarity, zero content lines
changed.

**The gate passed, and more convincingly than planned.** The sequence said "diff all 16 preview pages
against live". Instead every one of the **66 files in `public/` was compared byte-for-byte against
`dist/`: 66 identical, 0 differing, 0 missing**, with the only addition being the new Astro page. That
covers binaries and JSON too, not just the 16 HTML pages, and it runs in seconds rather than by eye.
Re-verified under both build variants. The skill pages still load `progress.js`, derive the correct
storage key, and retain all 38 inline `onclick` handlers — the specific thing Astro would have broken
had those pages been converted rather than copied.

**Design decisions worth keeping visible:**

- **Static output, no adapter.** Both origins consume one identical build, which is what keeps the
  GitHub origin cheap. The SSR adapter waits for Phase 8, where rendering on request is the actual
  requirement rather than a default.
- **`base` is env-driven**, because Vercel serves from `/` and Pages from `/amplifiedthinker/`.
  Layouts read `import.meta.env.BASE_URL`; canonical strips the prefix so the Pages build still points
  at `amplifiedthinker.com`, matching what the existing pages do.
- **`_originals/` moved out of `images/`.** Inside `public/`, Astro would have published 6 MB of
  full-resolution sources verbatim on any local build.

**Two blockers, neither of them code:**

1. ~~npm cannot install in the Google Drive working copy~~ — **resolved.** `EBADF` after 2m32s,
   twice, against 13s on local disk. Deployment was never affected (Vercel and Actions build on Linux
   from a clean checkout), but local development was fully blocked — which removes the fastest
   feedback loop exactly when the project gains a build that can fail. The working copy moved to
   `C:\dev\amplifiedthinker`, verified with `npm ci` in 7s, a clean build, the 66/66 gate, and
   `npm run dev` serving both old and new pages. `_originals/` and `.claude/settings.local.json` were
   gitignored and existed only in the Drive copy, so both were carried over by hand.
   See [dev-workflow.md](dev-workflow.md).
2. **GitHub Pages needs its source switched to "GitHub Actions"** before this merges, or the second
   production origin 404s the moment the repo root loses `index.html`.

**Unverifiable until production: `middleware.js`.** Vercel's preview wall masks 404s — a nonexistent
path returns the same `302` as a real one — so nothing about preview *content* can be checked by
script, and a bot-UA request cannot reach the middleware at all. A production baseline was captured
before merging, to be re-run immediately after with rollback ready.

### Phase 0 — done (2026-08-17), one activity deferred to Phase 3

Ran as a deliberate pass after Phase 1 rather than before it. Mostly verification, which is the
point — the value was in what turned out not to be true.

- **Production branch confirmed by behaviour, not by setting.** `main`-only commits are live on
  `amplifiedthinker.com`; the two feature branches only ever produced preview URLs.
- **Previews confirmed working**, behind Vercel Authentication (proven during Phase 1).
- **Supabase redirect allowlist — deferred to Phase 3.** There is no project to configure yet. The
  exact values are settled in [dev-workflow.md](dev-workflow.md) so they don't get invented later
  under pressure. This is the only Phase 0 activity not closed.
- **Branch protection — decided against.** `deploy.bat` pushes straight to `main`, so requiring pull
  requests would turn every content update into a PR. On a solo repo the protection guards against
  nobody. Recorded as a decision rather than left open.

**The finding — and it reshapes the architecture: there are two supported production origins.**
`sing-chen.github.io/amplifiedthinker` is serving the full site, rebuilt from `main` — it already
carries the Phase 1 `progress.js`. It had been assumed to be a stale artifact. It is not:

> Some corporate networks block `amplifiedthinker.com` under newly-registered-domain policies. Those
> users have been given the GitHub URL and can reach it. **Retiring Pages would cut off an audience
> segment with no other route in.**

That single fact changes three things this plan had wrong:

1. **`about.html`'s hostname sniff was live behaviour, not dead code** — and it was firing on Vercel
   previews and localhost too, so every preview of that page showed the LinkedIn-only contact block.
   A preview lying about production, in the phase whose whole purpose is making previews trustworthy.
   **Removed entirely rather than corrected:** one contact block, email shown on every origin. The
   hidden-email behaviour turned out to be exactly backwards, since NRD-blocked users often cannot
   reach the custom domain and were the segment least able to get in touch any other way. Bonus: with
   no runtime check to un-hide it, the block now renders with JavaScript disabled.
2. **Phase 2 grows.** Moving the 16 pages into `public/` leaves Pages with no `index.html` at the repo
   root, so the GitHub origin breaks at merge. It needs a GitHub Actions workflow building Astro in
   static mode — two build targets from one repo. Recorded in the Phase 2 table below.
3. **Phase 5's environment switch was designed backwards.** `isProd = hostname is amplifiedthinker.com`
   would classify the Pages origin as non-production, so after the dev/prod database split every
   NRD-blocked user would read and write the *dev* database — progress appearing to save, then
   missing. The rule is now to blocklist non-production (previews, localhost) rather than allowlist
   production. See [dev-workflow.md](dev-workflow.md).

Capability differs by origin: Pages serves files but runs no code, so client-side features (auth,
progress sync, favourites, notes) work there while server-rendered surfaces (blog, admin, `/api/`,
301 redirects, `middleware.js`) cannot. Full matrix in [dev-workflow.md](dev-workflow.md).

**Worth carrying forward:** Phase 1's lesson was that automated checks miss visual defects. Phase 0's
is the mirror image, twice over. First, *"we don't use that any more"* is a claim to test with `curl`,
not accept — the appendix had hedged it as "if a second origin is still live" for weeks. Second, once
the origin was confirmed live, asking *why* it was live mattered more than confirming *that* it was:
the answer turned a tidy-up task into an architectural constraint, and caught a data-corruption bug
five phases before it could bite.

---

## Phase 0 — Branch and environment setup ✅ DONE

**Impact:** ⚪ None · ⚪ None · **Closed 2026-08-17** — outcome in the Progress log above.

**Why first:** everything below assumes previews work and production is insulated. Half a day
here prevents a class of bug that looks like broken code but is actually broken configuration —
the worst kind to debug, because the code is fine.

| Activity | What it does, and why |
|---|---|
| Confirm Vercel production branch is `main` | Establishes the safety model everything else relies on. Verify rather than assume. **✅ Verified by behaviour.** |
| Verify a throwaway branch gets a preview URL | Proves previews work *before* you need them under pressure. **✅ Proven during Phase 1.** |
| Add Supabase redirect allowlist entries, including the preview wildcard | Prevents sign-in failing silently on every branch. Cheap now, confusing later. **→ Deferred to Phase 3** — no project exists yet; values pre-agreed in `dev-workflow.md`. |
| Agree branch naming; optionally protect `main` | Removes the "did I just push to production" question. **✅ Naming settled (`feat/…`, short, one per phase); protection decided against — it would break `deploy.bat`.** |
| Audit which origins actually serve the site | Every live origin is an auth surface and a preview-fidelity risk. **✅ Found the GitHub Pages origin live *and load-bearing* — it serves users whose networks block the custom domain. `about.html` fixed so previews match production; Phase 2 and Phase 5 both re-scoped as a result.** |

**Done when:** a throwaway branch deploys to a preview URL you can open in a browser — **met**, and
previews now render the same contact block production does.

See [dev-workflow.md](dev-workflow.md) for the specific settings and values.

---

## Phase 1 — Extract progress into a shared module ✅ DONE

**Impact:** 🟡 Silent · ⚪ None · **Shipped 2026-08-17** — outcome in the Progress log above.

**Why first among the real work:** the progress code is copy-pasted into all 10 skill pages.
Adding Supabase to 10 copies means making the same edit ten times and getting it subtly wrong
twice. Extract once, and Phase 5 becomes a one-file change.

**Why it's safe to do now:** no Supabase, no Astro, no dependency on any decision below. It is a
pure refactor with an exact-match test, so it can ship to production on its own.

| Activity | What it does, and why |
|---|---|
| Write `progress.js` covering both shapes | One module handling plan (`{section, visited, quiz…, habitOpen}`) and primer (`{current, visited}`). Follows the `nav.js` pattern — runtime-loaded, no build, works at any depth. Lives at the repo root alongside `nav.js`; it moves into `public/` in Phase 2 with everything else. |
| Replace the inline block in all 10 skill pages | Removes 10 duplicated implementations, leaves a script tag. This is the actual deliverable. |
| Verify byte-identical localStorage payloads | The gate. Proves nothing changed for anyone who already has progress saved. |

**Done when:** progress saves and restores identically on all 10 pages, and stored JSON matches
pre-refactor output exactly.

**Note for later phases — line endings.** `core.autocrlf=true`, so the repo stores LF and the
working tree gets CRLF on checkout. Working-tree files can still be found with either ending
(anything written by a tool since the last checkout may be LF), and that inconsistency is enough
to break a naive string match. Any script that rewrites these files should normalise to LF for
matching and restore the file's existing ending on write. Verify by diff size: a correct run
touches tens of lines, a line-ending accident touches thousands.

---

## Phase 2 — Astro shell ✅ DONE

**Impact:** 🟡 Silent (visitor) · 🔵 Visible (admin) · **Shipped 2026-08-17** — outcome in the Progress log above.

**Why now:** every new surface needs somewhere to live. Doing this before any feature means
features get built once, in their final home, rather than built twice.

**Why it's the riskiest phase:** it changes `main` from "cannot fail to deploy" to "a build error
blocks everything, including the 16 existing pages." Nothing after this is as sharp a change in
failure mode.

| Activity | What it does, and why |
|---|---|
| Add Astro; move all 16 pages into `public/` | Files in `public/` ship byte-for-byte untouched, so the existing site is unaffected. Zero page conversions — that is the point. |
| Commit `vercel.json` with the build config | Keeps build settings in the branch rather than the Vercel dashboard, so `main` keeps deploying as static until merge. This is what makes the cutover reversible. |
| Diff all 16 preview pages against live | The gate. Any difference means stop and investigate. |
| Add a base layout loading `nav.js` and `styles.css` | New pages inherit the existing nav and design tokens for free, which is why the split causes no visual drift. |
| Update `.claude/launch.json` to `npm run dev` | Local dev keeps working; `python -m http.server` cannot run Astro. Now version-controlled, so this change is reviewable rather than a silent local edit. |
| Add a GitHub Actions workflow building Astro to static, published to Pages | **Added by Phase 0's finding, and non-optional.** Moving the 16 pages into `public/` leaves Pages with no `index.html` at the repo root, so the GitHub origin 404s at merge — cutting off users whose networks block the custom domain. Two build targets from one repo: Vercel gets the dynamic build, Pages a prerendered snapshot. |
| Verify all 16 pages on **both** origins, not just the preview | The gate now has two halves. A Vercel-only check would have passed while the GitHub origin was dark. |

**Done when:** all 16 pages are byte-identical on the preview URL **and still served by the GitHub
Pages origin**, and a new blank Astro page renders with correct nav and styling.

**Rollback:** Vercel retains previous deployments — promote the last good one from the dashboard.
Instant, and no git revert needed first.

---

## Phase 3 — Supabase schema and RLS ✅ DONE

**Impact:** ⚪ None · ⚪ None — no site code touched beyond one throwaway test page.

**Why RLS from the very first migration:** with no server in front of the database, RLS *is* the
security model. Tables created open and locked down later are how data leaks, because there is no
natural moment that forces you back to do it.

| Activity | What it does, and why |
|---|---|
| **Create the Supabase project** | **✅ Done** — `spehmrgmcdenqdftkyrt`, EU, one project. The dev/prod split stays a Phase 5 activity, because there is no real user data to protect until then. |
| Create all tables in one migration | The whole shape is visible at once, so relationships get designed rather than accreted. **✅ Applied** — 9 tables in one transaction. A second migration follows it, creating no tables, that tightens function grants. |
| Enable RLS and write policies before inserting any row | Removes any window where data exists unprotected. **✅ Verified** — `enable row level security` sits in the same block as each `create table`, and `pg_tables` confirms all 9 `true` with 17 policies. Grants to `anon` are revoked and re-granted explicitly on top. |
| Add `is_admin()` and the profile-column trigger | Creates the admin gate, and ensures users cannot grant it to themselves. **✅ Proven in both directions** — a non-admin is refused, an admin is permitted, and an admin cannot demote themselves either, since the trigger checks for any change rather than for escalation. |
| Add the Supabase redirect allowlist, including the preview wildcard | **Deferred here from Phase 0**, which could not do it with no project to configure. **✅ Set and behaviourally verified** on localhost and the preview branch; the two production origins follow the merge. |
| Prove auth end to end on one throwaway page | Validates the whole chain — signup, session, policy enforcement — before it touches a real page. **✅ Done** — and it earned its place: it caught two defects in its own checks that a green board had been hiding (findings 12 and 13). |

**Done when:** using only the anon key, every table returns zero rows when signed out — verified
by direct query, not by the UI hiding things. `npm run verify:rls` is that direct query.

**Read the gate precisely.** It has two passing states and only one of them is permanent: the four
user-owned tables are *refused* (`anon` holds no grant), while the five content tables merely
return `[]` *because they are empty*. From Phase 6 the latter legitimately serve published rows.
The script separates them so the assertion does not quietly become meaningless.

**Rollback:** `supabase/rollback/…_down.sql`, and it is genuinely cheap only during this phase —
no row is inserted anywhere in Phase 3. From Phase 5 it destroys real user data. Note that a
Vercel rollback restores *code*, never schema.

---

## Phase 4 — Email ✅ DONE

**Impact:** ⚪ None · ⚪ None — configuration only; no user can trigger an auth email until Phase 5.

**Why before auth ships:** the first password reset that lands in spam is unrecoverable as a
first impression, and you find out from the user who *doesn't* tell you. Sequencing this ahead of
real users is the entire point.

**The risk profile differs from Phase 3, and is worse in one way.** Phase 3's migrations were single
transactions that rolled back whole, so a mistake cost nothing. This phase edits a live DNS zone,
where changes propagate on a TTL and a wrong record breaks inbound mail that works today. The zone
was captured before anything changed: [email-dns-baseline.md](email-dns-baseline.md), re-checkable
with `npm run verify:email`.

| Activity | What it does, and why |
|---|---|
| Confirm whether Brevo SMTP credentials actually exist | The brief assumed they do. The described setup — Gmail sending, masked — suggests Brevo may only be providing domain authentication, in which case an SMTP key must be created. Resolve before building on the assumption. **✅ Resolved — and neither way the plan framed it.** A key exists *and* a second one is still needed; see finding 1. |
| Confirm Cloudflare MX and Vercel records coexist | Both need records on the same DNS zone. Inbound reportedly works today, so this is a check rather than a change. **✅ Confirmed, and the real collision point identified** — not MX versus A, which cannot contend, but the single shared SPF TXT. See finding 2. |
| Verify DKIM and DMARC alignment | Determines inbox versus spam. Do this before the first real send, not after. **✅ Settled from a delivered header, not from DNS** — DNS proved the keys publish and DMARC is `p=quarantine`; only a real message could say what the `Return-Path` was. Under Brevo it aligned on DKIM alone (finding 8); under Resend both mechanisms align (finding 13). |
| Add Brevo to the SPF record | ✅ The one record this phase *edited*. An `include` added inside the existing TXT, never a second record. Left in place — Brevo still relays the Gmail alias. |
| Create a second Brevo SMTP key, for Supabase | ✅ Created, used for four hours, orphaned by the switch, and **deleted 2026-08-18**. The `Gmail Send As` key remains; the alias was sent from before and after the deletion to prove which one went. |
| Point Supabase Auth SMTP at Brevo | ✅ Done, and **reversed** — see finding 12. Superseded by the row below. |
| Raise the Supabase auth email rate limit | ✅ 30/hour → 100/hour. Custom SMTP does not lift it by itself — Supabase caps on top of the provider. |
| Turn off Brevo click tracking, open tracking and the unsubscribe header | ❌ **Impossible, not merely undone.** Added mid-phase by finding 10; no setting exists for any of the three. This row is what forced the provider change. |
| Move auth mail to Resend | ✅ Three DNS records **added** on `send` and `resend._domainkey`, no existing record touched. Tracking off at domain level. Runbook in [../supabase/README.md](../supabase/README.md). |
| Point Supabase Auth SMTP at Resend | ✅ `smtp.resend.com:587`, sending-only API key scoped to the domain. |
| Extend `npm run verify:email` to cover Resend | ✅ 16 → 21 assertions, including SPF alignment and a three-state check that fails on *partial* configuration. |
| Score the message on content, not just headers | ✅ mail-tester, 2026-08-18. SpamAssassin **0.1** against a −5 spam threshold; SPF, DKIM, DMARC and rDNS all green; 22 of 23 blocklists clean. The two amber items are both correct as they stand — see below. |

**Done when:** a test signup, password reset, and email change all arrive in a real inbox — **and
land in the inbox rather than spam**, which is the phase's actual rationale.

**Revised twice, because each version was insufficient in a way the previous one could not see.**

*First revision.* Delivery was proven — all three types inbox-placed and DMARC-passing — while the
mail itself still carried a click-tracked token and a one-click unsubscribe. So the condition also
required that **the confirmation link points at `<ref>.supabase.co` rather than a tracking domain**.
Arriving safely is not the same as arriving.

*Second revision.* That check passes trivially if you only read the link. The condition now requires
reading the **whole raw source** of all three types: link target, absence of a tracking pixel,
absence of `List-Unsubscribe`, and `smtp.mailfrom` on the sending domain. Each was added after
something invisible to the previous version turned out to be there.

**✅ Met on 2026-08-18.** Signup, password reset, and both halves of an email change — all delivered
via Resend, all raw-source clean on every criterion, `spf=pass` `dkim=pass` `dmarc=pass` with SPF
now aligning.

**The findings, the day's record, and the merge details are in the progress log above** — see
*Phase 4 — done, merged, live on both origins (2026-08-18)*.

---

## Phase 5 — Auth and progress sync ✅ DONE

**Impact:** 🟢 New + 🔵 one regression (visitor) · 🟢 New (admin) — **the announcement that needed
most thought, and turned out not to be needed.** Resolved 2026-08-20; see "Announcement planning".

**Why this is the payoff phase:** it is the point where the original problem — progress trapped in
one browser on one device — actually goes away.

| Activity | What it does, and why |
|---|---|
| Build `auth.js` and `supabase-client.js`; vendor `supabase.min.js` | Client foundation. Vendoring matches the existing `fuse.min.js` convention so static pages work without a bundler. |
| Add sign-in UI to `nav.js` | One edit puts auth state on every page, because the nav is injected from a single source. |
| Switch `progress.js` to Supabase for signed-in users | The actual feature. ⚠️ Guests do **not** keep working as before — see "Guests lose progress entirely" below. |
| ~~Build the one-time localStorage import~~ | **Dropped 2026-08-18, after being built and passing its tests.** Old keys are left inert instead. Reasoning below — read it before rebuilding this. |
| Keep theme in localStorage; sync to profile as a convenience | A DB round-trip before first paint would flash the wrong theme on every page load. **No migration needed** — `profiles.theme` already exists, added in Phase 3 precisely so this phase would not need one. |
| Split into dev and prod Supabase projects | Real user data now exists. This is the moment that split earns its cost — not before. The existing project (`spehmrgmcdenqdftkyrt`) stays as prod; the new one is dev. **✅ Decided: split first, before any client code writes a row, and dev gets its own Resend key.** Runbook in [../supabase/README.md](../supabase/README.md). |
| **Decide how open signup is protected, before re-enabling it** | **Signup is currently switched off** in Supabase → Authentication (2026-08-18), because Phase 4 finished testing and nothing user-facing needs it until this phase. Turning it back on is a Phase 5 decision with a cost attached — see below. **✅ Decided: Cloudflare Turnstile, on the sign-in surface only.** |
| **Delete `src/pages/auth-test.astro`** | **Carried forward from Phase 3**, and recorded here rather than only in that phase's log, because this is the list someone doing Phase 5 will actually read. It is a scaffold, and once `auth.js` and the real sign-in UI exist it is a second, diverging implementation of client setup. **Mine it before deleting it:** it holds working patterns for session handling, `onAuthStateChange`, the signup-trigger check, and RLS assertions that both admin and non-admin paths were verified against. **Mining done** — `selfUrl()` and the session handling are in `auth.js`. Deletion is still outstanding. |

**Eight activities were added across 2026-08-19 and 20 that the plan above never named.** None was scope creep
for its own sake — the first was needed to stop maintaining test accounts by hand, and each one made
the next visible. Full accounts are in the progress log below.

| Added activity | Why it was not in the plan |
|---|---|
| **Account deletion**, password-gated, via `SECURITY DEFINER` | Written to clear test accounts from the site rather than the SQL editor. Brings two of the phase's three migrations. |
| **A required first name**, form and `not null` | The nav greeting and both emails need something to address. Backfilled in **two** places — templates read `raw_user_meta_data`, the site reads `profiles`. |
| **The two auth email templates** | Phase 4 shipped working mail; nothing had styled it. ⚠️ Configuration, not code — per project, and invisible when missing on one. |
| ⚠️ **Two silent link defects fixed** | A reset link signed you in without showing the password form; a spent confirmation link did the same. Both looked like success. |
| **Current password required to change it**, and other devices signed out | Was on the backlog. Building the delete control put a gated action beside an ungated one, and the ungated one protected more. |
| **Breached-password refusal** (`public/pwned.js`) | Supabase's own version needs the Pro plan. Same corpus, done in the browser. |
| **The privacy, terms and why-sign-up pages** | ⚠️ **Announcement-blocking, and no phase owned them.** This is the first phase to hold personal data, and the sign-up form asks for a name and an address with nothing on the site saying what happens to either. Two backlog entries specified them; both turned out incomplete. |
| **Consent to site-update email** — a third migration, a checkbox and a toggle | ⚠️ **Nothing planned this either.** Offering to tell people when new skills land turns "no marketing" into direct marketing under PECR reg 22, which needs recorded, withdrawable consent. It also **reverses** the "no consent checkbox on the sign-up form" decision taken three commits earlier, and correctly — that argument was *"nothing here is optional processing"*, and this is. |

**Done when:** a signed-in user works through a plan on one device, opens a second device, and
resumes from the same place. **Test both directions** — the failure mode here is silent truncation,
not an error.

*(Originally: "signs in, accepts the import, opens a second device". The import was dropped, so the
criterion no longer mentions it — the multi-device round trip is the feature and always was.)*

### Three decisions taken before any client code, 2026-08-18

The phase opened with three things the plan named but did not settle. Each was resolved first,
because each decides what the code has to contain.

**1. Signup protection: Cloudflare Turnstile — and it needs no server, which was the real
question.** The worry was that native captcha support might require an endpoint, which on a
static origin would have forced the Pages retirement into the middle of this phase. It does not:
GoTrue verifies the token itself, the dashboard holds the secret, the client passes
`options: { captchaToken }`, and signup, sign-in and password reset are all covered. **So the
Pages retirement stays unscheduled and this phase does not touch it** — the scheduling question
was asked and came back "no need", which is the cheapest possible answer.

Turnstile over hCaptcha on user impact first and vendor count second: managed mode is usually
non-interactive with no image puzzles, where hCaptcha's free tier serves them routinely and needs
a cookie-based accessibility workaround; and Cloudflare already runs the zone, so no eighth vendor.

**The widget loads on the sign-in surface only, never from `nav.js`.** In the nav it would add a
`challenges.cloudflare.com` request to all 19 pages for every guest. Scoped this way a network
blocking that host costs account creation and nothing else — which is not hypothetical here.

**One project holds one captcha secret**, and Turnstile hostnames take no wildcards, so covering
previews from a single widget would mean listing `vercel.app` — a public suffix, authorising every
site on it to mint tokens for our sitekey. That is a second and independent argument for the split
below, arriving from a direction nobody was looking in.

**2. The dev/prod split: first, and dev gets its own Resend key.** Before any client code writes a
row, because the phase's whole dev loop needs somewhere that is not the production database — and
because a Vercel rollback restores code, never database state.

Only the schema is free to reproduce, replayed from the two migration files. The allowlist, SMTP,
the rate limit, the signup toggle, the `is_admin` bootstrap and the Turnstile secret are all
dashboard work with nothing behind them. The cheaper option — no SMTP in dev, `mailer_autoconfirm`
on — was weighed and declined: most of the build happens before real signups exist, and after
launch the dev work needing mail is close to none, so paying once is worth exercising the real flow.

⚠️ **The price is a coupling to watch: both projects now draw on one Resend allowance of 100/day,
and exhausting it stops production password resets.** If it ever binds, the answer is
`mailer_autoconfirm` on dev — dev needs accounts, not mail.

The allowlist **moves** rather than being copied: localhost and the preview wildcard belong to dev
now, and leaving them on prod would let a laptop drive the production database through a redirect
that still resolves.

**3. The merge rule: last-write-wins for sync, union for the one-time import.** The done-when names
silent truncation without saying what happens when both sides hold progress for the same skill.

For ordinary multi-device use the rule is a **whole-row snapshot, last write wins** — because every
device fetches the row on load and resumes from it, so device 2 continues device 1 and `visited`
accumulates naturally with no special handling. Sequence and timing decide it, and nothing is lost
because no device ever writes state it did not first read.

⚠️ **Guarded by an `updated_at` precondition.** A tab left open for two days holds a stale snapshot
and will happily write it over a newer one on the next save. The guard is what makes "snapshot"
mean the snapshot rather than whichever HTTP request landed last.

**The exception is the single write not derived from remote: the one-time import.** That progress
accrued while signed out, so it has no place in the sequence at all — there is no timestamp putting
it before or after anything. Applied as a snapshot it overwrites a real account; discarded it is
the truncation. So the import alone merges as a union: `visited` unions, `quizSelected` merges per
question with remote winning a genuine conflict, `quizRevealed` ORs, `habitOpen`/`cardsOpen` union,
`started_at` earliest, `completed_at` earliest non-null, and nothing is ever deleted. It runs once,
and with guest progress removed the collision can never be created again — so the code really is
disposable, as the plan assumed.

> **Superseded 2026-08-18.** The import was built to this design, passed its tests, and was then
> deleted — see "The one-time import was built, tested, and dropped" below. The rules above are kept
> because they are correct and because anyone tempted to rebuild it should start from them rather
> than from scratch. Nothing in the shipped code implements them.

**Two things about the quiz that reading the code changed.** `quizSelected` *looks* unmergeable,
because `quizOrder` shuffles each question — merging an answer from a differently-shuffled device
would appear to turn a correct answer wrong, silently. It is safe: `applyQuizOrder` only sets CSS
`order`, the DOM sequence never changes, and both `quizSelected` and `kcAnswers` index into the DOM.
The value means the same thing on every device.

`quizOrder` itself is the opposite. It must be taken **whole per question, never blended
element-wise** — a blend of two permutations is not a permutation, so two options land on one
visual slot and one disappears from the page. Neither of these is visible from the data model; both
came from reading `plan.html`.

**Order of operations matters more than the rule.** Read local, read remote, merge, upsert, **read
back and verify**, and only then clear the keys. Clearing on an unconfirmed write is where silent
truncation actually comes from — not from choosing the wrong side of a merge.

### The day lost to a wrong SMTP port, 2026-08-18

Worth recording in full while it is fresh, because the failure mode is the most misleading this
project has produced and the reasoning error is one anybody would repeat.

**Symptom:** every attempt to create an account failed with
`captcha protection: request disallowed (timeout-or-duplicate)`.

**Actual cause:** the dev project's SMTP port was `585`, not `587`. Nothing listens there, so the
confirmation mail hung until the gateway gave up at 35 seconds and the whole signup rolled back.

**Why it read as a captcha problem.** The error names the captcha, names a specific captcha failure
mode, and is entirely accurate about what Cloudflare reported — the token genuinely had been
redeemed once already. Nothing about it points at mail.

**Why the investigation went wrong, which is the part worth keeping.** A table was built of which
endpoints accepted a token and which did not:

| | Creates a user? | Sends an email? | Captcha |
|---|---|---|---|
| Sign-in | no | no | ✅ |
| Password reset, unknown address | no | no | ✅ |
| Magic link, `create_user: false` | no | no | ✅ |
| Magic link, `create_user: true` | **yes** | **yes** | ❌ |
| Signup | **yes** | **yes** | ❌ |

**Two columns partition those rows identically, and only one was tested.** "Creates a user" was
picked, and it led to a coherent, well-evidenced, wrong conclusion: that Supabase double-verifies
the token on account creation. hCaptcha was evaluated as a second provider, magic-link signup was
designed as a workaround, and a Vercel server endpoint with `service_role` was proposed — all to
route around a defect that did not exist.

**What would have caught it:**

1. **Timing.** Passing calls returned in ~300ms, failing ones in ~35s. A captcha rejection does not
   take 35 seconds. The clock was never looked at, and it was the whole answer.
2. **Testing the alternative reading** of the table rather than the first one that fitted.
3. **The provider's own send log.** `resend.com/emails` empty means nothing ever left Supabase.

**The general form, and it has a precedent here.** Phase 4 finding 9 recorded a check going red for
a reason unrelated to what it watched; finding 12 recorded one going green for a reason unrelated to
what it claimed. This is the third variant: **a subsystem failing and reporting itself accurately in
the vocabulary of a different subsystem.** Every measurement taken was correct. The interpretation
put on the set was not, and no amount of further measurement of the *same* kind would have corrected
it — only asking what else the pattern could mean.

**Cost:** most of a day, an hCaptcha account that has to be deleted, a leaked hCaptcha secret to
rotate, and a throwaway probe page. **Recovered in full:** Turnstile works exactly as designed,
signup included, so the phase's original plan stands untouched — no server endpoint, no early
`service_role`, no second captcha vendor, no invite-only launch.

Operational detail and a diagnosis procedure are in
[../supabase/README.md](../supabase/README.md), under the SMTP runbook.

### supabase-js retries silently, and it made a failure test report success, 2026-08-18

Found while testing the one-time import, which was dropped shortly afterwards. **The finding outlives
it** — it applies to every failure test written against Supabase from here on, including
`progress.js`'s own write path.

**Symptom.** A test that was meant to fail reported success. With DevTools set to Offline, the
operation completed. A deterministic replacement — reject the read-back, keep everything else working
— *also* reported success, and correctly went on to do the irreversible step.

**Cause.** supabase-js 2.112.3 retries REST requests, on by default, and nothing says so:

```
retryEnabled = e.retry ?? true          // opt out, not opt in
f = ['GET','HEAD','OPTIONS']            // only these methods
d = [520, 503]                          // ...and only these statuses
u = e => Math.min(1000 * 2**e, 30000)   // backoff: 1s, 2s, 4s
```

The injected read-back rejection was retried once, the retry succeeded, the row was genuinely
confirmed, and clearing the keys was the *right* answer. The test was defeated, not the code.

It also explains the offline run. Three retries at 1s + 2s + 4s is **about seven seconds of silence**
with the panel reading "Adding…". Toggling the throttle back within that window lets the retry
succeed and the import complete legitimately. The test procedure contained a race that no amount of
care in the click order would have removed, because the thing being waited on was invisible.

**The test that works.** Reject *every* GET once the POST has gone out. Retry cannot rescue what
never succeeds:

```
calls: [GET, POST, GET, GET, GET, GET]     read-back plus its three retries
ms:    7165                                 the backoff, made visible
ok:    false
keySurvived: true                           ← the property under test
```

**Two consequences that happen to favour the design, and are worth not breaking.**

- **POST is never retried.** The import's write and progress.js's upsert get no silent second
  chances, so a network failure at the irreversible step fails immediately and the device keeps its
  keys. progress.js's own `pending`-and-reschedule is therefore the *only* retry on writes — do not
  remove it on the assumption the library covers it.
- **Reads are retried.** Robustness lands exactly on the import's read-back, which is the check
  that should survive a blip rather than fail closed and re-offer.

**The general form.** Phase 4 finding 9: a check going red for a reason unrelated to what it watched.
Finding 12: one going green for a reason unrelated to what it claimed. The SMTP port: a subsystem
failing in another subsystem's vocabulary. This is the fourth variant and the sharpest — **an
invisible resilience layer that makes negative tests lie.** A passing failure-test is worth exactly
as much scepticism as a failing success-test, and neither had been given any here.

**Rule taken from it.** Any test that asserts a failure must first prove the failure actually
happened — count the calls, measure the clock. "It reported an error" is not evidence that the thing
you broke is the thing that broke.

### The password reset link logged you in instead, 2026-08-19

**Symptom.** Following a reset link from a real email landed on the **home page, signed in**, with no
password form anywhere. Nothing errored. The only visible sign that anything had happened was the
avatar appearing in the nav — which looks like a successful sign-in, because it is one.

**The wrong suspect, and why it was worth ruling out first.** This is exactly the shape the redirect
allowlist produces: an origin that is not on the list is not rejected, it is silently swapped for the
project's Site URL. Dev's Site URL *is* `http://localhost:4321/` — the home page. The symptom and the
known trap matched perfectly. `npm run verify:redirects` came back green on both projects in seconds,
including `http://localhost:4321/sign-in/` on dev, which is the entire reason that script exists.
**A cheap gate that rules out the plausible cause is worth as much as one that finds a real fault**;
without it the next hour goes into the dashboard.

**Cause — listener registration order, and it could never have gone the other way.**

A recovery link genuinely establishes a session. It has to: `updateUser({ password })` is an
authenticated call. So the page held a session plus a flag meaning "this is a reset, not a sign-in" —
and the flag was set by a listener that could not win.

- `auth.js` subscribes to `onAuthStateChange` inside its own `init()`.
- `sign-in.astro` subscribed afterwards, in `start()`.
- **supabase-js notifies subscribers in registration order.**

So `settle()` ran first, every time, saw a session, found `recovering === false`, and executed
`window.location.replace(HOME)`. The `PASSWORD_RECOVERY` handler then fired into a page that was
already navigating away. Not a flaky race — a race with a fixed winner, which is why it reproduced
on every attempt and looked like deliberate behaviour.

**Fix.** Read the intent out of the URL fragment *synchronously*, next to the `linkError` block, and
seed `recovering` from that instead of from an event:

```js
var arrivedForRecovery = (function () {
  var hash = window.location.hash || '';
  if (hash.indexOf('type=recovery') === -1) return false;
  ...
})();
```

Registering our listener earlier would only have narrowed the race. The answer is in the address bar
before any listener exists, so the question does not have to be asked of the event stream at all.

⚠️ **Unlike `linkError`, this must not clear the fragment.** The access and refresh tokens live in
that same fragment and supabase-js has not read them yet.

The `PASSWORD_RECOVERY` listener stays as a backstop, with a warning attached: **under the PKCE flow
the token returns as `?code=` and there is no `type=recovery` to read**, at which point that listener
becomes load-bearing again and brings its race back with it. This project runs the implicit flow only
because no `flowType` is set in `supabase-client.js` — an unstated default is holding the fix up.

**Known limitation, not yet addressed.** supabase-js strips the fragment once it has consumed the
tokens, so **reloading the "Choose a new password" page loses the recovery intent** and bounces to
home with the password unchanged. Same surprise, different route. The fix is a `sessionStorage` flag
set when `arrivedForRecovery` is true and cleared when the password saves — survives a reload, not a
new tab.

**Two things worth carrying forward.**

1. **This was security-relevant, not cosmetic.** A reset link functioned as a passwordless login and
   left the old password working. No worse than what a reset link already grants, but it is not what
   the email promises, and someone who suspected their account was compromised would have believed
   they had changed it.
2. **The test that catches it already existed and was not run.** `supabase/email-templates/README.md`
   step 5 — *"Sign out, request a reset, and follow that link. `/sign-in/` should show Choose a new
   password."* Written correctly, before the bug. ⚠️ The step that actually proves it is the one
   *after*: **sign in with the OLD password and be refused.** Reaching the form is not evidence the
   password changed.

**The general form.** Phase 4's double-hash defect and this one are the same animal: *auth appears to
work, and silently does not.* Both produce a plausible-looking page, no console output, no failed
request. Both were found only by a human following a real emailed link. Neither was reachable by any
automated check the repo had. **Every auth path in this phase must be walked by hand, from a real
inbox, at least once — and the assertion must be about state that changed, not about what rendered.**

### The same redirect then ate the dead-link panel, 2026-08-19

Found within the hour, while working through the test scenarios written *for the entry above*. Same
branch, second victim — which is the finding, not the bug.

**Symptom.** Following a **spent signup confirmation link** — one already used minutes earlier — went
straight to the home page, signed in. No "that link no longer works", no indication anything had been
rejected. A dead link that appeared to succeed.

**Cause.** The link genuinely failed. Supabase returned
`#error=access_denied&error_code=otp_expired`, the synchronous `linkError` read caught it correctly,
and `showLinkError()` un-hid the panel. Then `settle()` reached the next branch, found the session
still live from having used the link the first time, and ran `window.location.replace(HOME)`. The
panel existed for microseconds.

**The state that makes it reachable is the ordinary one.** The usual reason a confirmation link is
spent is that you just used it — so you are almost always still signed in when you click it again.
The failing path is the common path; the passing one requires signing out first.

**Fix.** Two parts:

- `settle()` now treats a dead link as **outranking** the signed-in redirect, and shows nothing
  underneath — the sign-in form would invite someone to re-request what they already have.
- `showLinkError()` takes the session, because the copy has to change. *"Start again below and a
  fresh link will be sent"* is wrong for someone already signed in. Signed in they get *"You are
  already signed in, so there is nothing you need to do"* and a **Continue to the site** button.

**⚠️ This variant was worse to ship than the one above.** A dead link that visibly does nothing
teaches people the link is dead. A dead link that appears to work teaches them **expired links are
fine** — so the next person to click one from an old thread, or a forwarded confirmation email, has
no reason to think anything is off. A silent failure that trains the wrong belief is worse than a
loud one.

**The finding, which is about `settle()` rather than about links.**

That one branch — *has a session → go home* — has now silently destroyed **two** states that existed
to be read: the recovery form, and this panel. Both were added to the page after the redirect was
written, and both were written as if the redirect would not fire. The rule for this page from here:

> **Every state that must be READ has to be checked before the signed-in redirect.** The redirect is
> the default, not a step in a sequence — anything that needs the visitor's attention must claim it
> first, or it will be shown and destroyed in the same tick.

Phase 7's banner editor and Phase 9's dashboards both add panels to authenticated surfaces. This is
the trap they will hit.

**And a testing note, since this was caught by a real run and not by mine.** The scenario had been
written as *"let a confirmation link expire (or reuse one), follow it"* with **no starting state
named**. Signed out it passes; signed in it fails. ⚠️ **An auth test scenario that does not state
whether a session exists is testing whichever half the author happened to imagine.** Every scenario
in this phase now says which.

**Verified**, including the signed-in case — by fabricating a session in `localStorage` with a
future `expires_at`, so `getSession()` resolves it without a network call. Worth keeping in the
toolkit: it exercises signed-in branches with no account, no email, and no credentials in the repo.

| State | Result |
|---|---|
| Link error, no session | dead-link panel **+ sign-in form**, "Start again below" |
| Link error, session | dead-link panel only, "already signed in" copy, no redirect |
| No link error, session | redirects to home — the control, unchanged |

### The weaker gate was on the more valuable action, 2026-08-19

Noticed while writing test scenarios, not while writing the feature — which is the point of writing
them out.

The account page ended up with two consequential controls side by side, and they asked for different
things:

| Action | Current password? |
|---|---|
| Delete your account | ✅ yes, plus a server-side `amr` recency check |
| Change password | ❌ no — new password only |

**The gate was on the wrong one.** Deleting destroys the data and ends the intruder's access along
with it. Changing the password **keeps** the account, locks the owner out, and hands over the
recovery route — whoever holds the mailbox holds everything, and a password change is what stops the
real owner's mailbox from mattering. Three clicks from any unlocked signed-in tab.

It also quietly undercut the emailed reset flow. That path proves control of an inbox; the signed-in
path proved only that a tab was left open. **When two routes reach the same place, the security of
the pair is the security of the weaker one** — building the strong one is wasted if the weak one is
still open.

**Fixed by reuse, not by building.** `auth.reauthenticate()` already existed for the deletion
control, so this was a form field, a Turnstile widget and an ordering rule. ⚠️ The ordering rule is
the whole thing: `updateUser({ password })` needs only a valid session, so re-authentication has to
happen **first and fail closed**. Calling it afterwards would leave a check that runs after the
change it was meant to prevent.

**One refactor came with it.** `signInWithPassword` is captcha-protected and a Turnstile widget binds
to a single container, so two panels need two widgets. The machinery was made a factory rather than
copied: it carries three separate traps — single-use tokens, reset-before-execute, and the 30s stall
— and a hand-copied second version drifts from the first at the earliest fix. The api.js script is
still loaded once and shared; only the render is per-panel.

**Two things this dragged into the light**, both now in `BACKLOG.md`:

- **Changing the password does not sign out other devices.** Supabase leaves sibling refresh tokens
  alive, so the action people take *because* someone else has access does not remove that access.
- **Password history was considered and rejected** — NIST guidance moved against rotation and
  history rules, they push people into predictable increments, and a history table is a second copy
  of the most sensitive material in the system. **Checking against breached-password lists is the
  version of that instinct which survives.**

⚠️ **A copy trap worth generalising.** The deletion panel said the password was *"the only thing on
the site that asks for it again"*. True when written, false the moment this shipped. **Copy that
names how rare something is has a dependency on everything else that might join it**, and nothing
will fail when it does.

### Breached-password checking, built in the browser because the server version costs a plan, 2026-08-19

Grew out of the question *"should we refuse a password the account has used before?"* — and the
useful answer was to refuse a different set of passwords entirely.

**Password history was considered and rejected.** Three reasons, and only the third is about this
project: NIST guidance moved away from rotation and history rules; the rule reliably makes passwords
*worse*, because people increment (`Summer2025!` → `Summer2026!`) and satisfy it with something
guessable from the last one; and a history table is a second copy of the most sensitive material in
the system, kept for an account's lifetime, to enforce a rule the standards dropped. ⚠️ The NIST
citation is from memory — check it against the live document before relying on it.

**The question that does have an answer** is not *"has this person used it before"* but *"is this
password already on a list attackers hold"*. Supabase has exactly that setting — **and it is Pro plan
and above**, confirmed against the docs. So it was built in the browser instead:
[`public/pwned.js`](../public/pwned.js), same corpus, same k-anonymity range API.

**⚠️ It is advisory, not enforced, and the reason that is acceptable here is about WHO it protects.**
It runs in the page, so devtools defeats it. That would be disqualifying for a control defending the
site against a hostile user — but this one defends a user against their own password choice, and
nobody bypasses a control in order to attack themselves. The Supabase setting is still better,
because it also stops a scripted client; `BACKLOG.md` carries the changeover.

**It fails OPEN, and that is the opposite of the Turnstile decision on the same forms.** Network
blocked, HTTP error, timeout, insecure context — all resolve `checked: false`, which means *the
question was not answered*, never *the password is fine*. An ad blocker or corporate proxy must not
be able to stop someone creating an account. Turnstile on the same submit fails **closed**, because
it guards the site rather than the user. **Two checks, one form, opposite failure modes, both
correct** — worth understanding before "fixing" either to match the other.

**Three placement rules, each with a reason that is not obvious:**

- **Never on sign-in.** Someone whose existing password turns out to be breached must be able to get
  in, because signing in is how they reach the form that fixes it. Refusing them at the door locks
  them out of the only remedy.
- **Before re-authentication, on the account page.** The breach check needs no session and no
  captcha token, so a password that is going to be refused is refused without spending a single-use
  Turnstile token on it — and without making someone prove themselves only to be told to start over.
- **After re-authentication would have been wrong for the *other* check.** `updateUser` needs only a
  session, so the password proof has to run first and fail closed. Ordering carries meaning in both
  directions on that one handler.

**Verified end to end on dev**, real Supabase, real Turnstile, real HaveIBeenPwned:

| | |
|---|---|
| `password123` at sign-up | refused. **One** outbound request, `range/CBFDA`. Zero `/auth/v1/signup` calls, no account, no email, no captcha token spent |
| Strong password at sign-up | `range/48D15`, then the signup POST to the dev project with the right `redirect_to`. Account created, mail delivered, confirmed, signed in |
| Sign-in with a breached password | works, as it must. Zero HaveIBeenPwned requests on that path |
| Reset flow and change-password | both refuse a breached password |

The two prefixes differing is the check responding to the password rather than answering from cache
— worth asserting rather than assuming, since a cached pass would look identical in the UI.

⚠️ **The privacy property was measured, not trusted.** `fetch` was intercepted and the real URL read
back: `https://api.pwnedpasswords.com/range/CBFDA`, `credentials: omit`, `referrerPolicy:
no-referrer`. The test asserts specifically that the *rest* of the hash does not appear in the URL.
**Never replace this with an API that takes a whole password or a whole hash**, however much simpler
it looks — that is the version of this feature that must not exist.

**A method note.** The browser pane was not displayed, so the page was not compositing frames and
synthetic mouse clicks silently did nothing — the first `computer` click reported success and
changed no state. Driving the DOM directly worked. ⚠️ **A UI tool reporting that it clicked is not
evidence that anything received the click**; assert on state afterwards, every time. Nothing about
this change touches hit targets, so DOM-level driving proves what was needed here — but a change to
layout or z-order would need real input.

### `signOut()` defaults to signing out every device, 2026-08-19

Found while implementing the opposite feature. Reading the docs for `signOut({ scope: 'others' })`
turned up the default for the plain call, and the default is not the one anybody assumes.

**In the vendored bundle:**

```js
async signOut(e={scope:`global`})
```

**So every sign-out on this site was a global sign-out.** Clicking *Sign out* on a work laptop ended
the session on the user's phone as well. `public/auth.js` called `client.auth.signOut()` with no
arguments, in the nav menu and on the account page, from the moment the control existed.

**Why nobody would notice.** It is invisible unless you are signed in on two devices *and* happen to
return to the second one afterwards, and even then it reads as an ordinary expired session rather
than as something the site did. There is no error, no log line, and the action the user took did
appear to work.

**Fix.** Scope is now passed explicitly at every call site, and the wrapper defaults to `local`:

| Caller | Scope | Why |
|---|---|---|
| Nav menu and account *Sign out* | `local` | Leaving a shared computer must not log you out of your own phone |
| `updatePassword()` | `others` | The point of the feature — evict everyone else, keep the person doing it |
| `deleteAccount()` | `global` | Every session for this account should die. Spelled out rather than inherited |

⚠️ **The general form, and it is the third library-default trap in this phase.** `retry ?? true` on
REST calls made a failure test report success. Turnstile tokens being single-use turned a spent token
into what looked like a captcha fault. Now `scope: 'global'`. **A sensible-looking default is the
hardest kind of bug to see, because nothing in the calling code is wrong** — the line reads exactly
as intended and means something else. Rule taken from it: for any library call where a wrong default
would be *silent*, pass the argument explicitly even when it matches the default, and say why.

**And note what found it: reading the reference for a neighbouring option.** Not a test, not a
symptom, not a review. Three of this phase's defects came out of reading documentation for something
adjacent to the thing being built.

### ⚠️ The agent's browser never composites, so nothing animated can be measured, 2026-08-19

**Cost: several rounds of reporting correct CSS as broken.** Worth writing down because the failure
is confident and consistent rather than obviously flaky, and it will recur on every future phase that
touches a transition, an animation, or a screenshot.

**The measurement.** In the pane the agent drives, `document.hidden === true` and
`requestAnimationFrame` fires **0 times per second**. The page is a live DOM that is never painted.

**What that breaks, and how it looks:**

| | Symptom |
|---|---|
| **CSS transitions** | Start and never progress. Every transitioned property reads back **frozen at its start value**, indefinitely — `getAnimations()` showed 6 still "running" two seconds after a 0.2s transition. |
| **Screenshots** | Time out: *"the Browser pane is not displayed, so the page is not compositing frames."* |
| **Synthetic mouse clicks** | Report success and change nothing. |
| **Viewport size** | `innerWidth` reads **0** until `resize_window` forces a size. Every width-derived measurement is meaningless until then — and they look like real numbers, not like zeros. Added 2026-08-20. |
| **Scrolling** | **Inert.** `window.scrollTo(0, 400)` leaves `scrollY` at 0, top level *and* inside an iframe, on a document that is genuinely scrollable. `scrollIntoView()` likewise. Added 2026-08-20. |

⚠️ **Two more surfaced on 2026-08-20 and both nearly produced a fix for a bug that did not exist.**
`pageScrollsX` reported `true` on `terms.html` — with `innerWidth: 0`, so the page was being measured
against a zero-width viewport. And the modal's `#s8` links appeared not to scroll to their section,
which was written up, coded around, and only then tested properly: **scrolling does not work in the
pane at all**, so the original reading was not evidence of anything. The code stayed in as belt and
braces, labelled in the source as unverified rather than as a fix.

**Why it fooled the diagnosis for so long.** The frozen values are not obviously invalid — they are
the *previous* state, so a dot that had just become `visited` reported the `active` styling it was
transitioning away from. That reads as "the CSS is applying to the wrong element", which is a
plausible bug with a plausible cause, and sent the investigation into specificity, duplicate rules,
stale element references and `--var` resolution. All were fine.

**What settled it, and should have been step one:** enumerating the CSS rules that actually matched
the element, via `document.styleSheets` and `Element.matches(selectorText)`. That is static — it does
not depend on rendering at all — and showed the correct single rule on each element immediately.

**The rules taken from it:**

> ⚠️ **Disable transitions before measuring anything that transitions.** Inject
> `.thing { transition: none !important }`, then read. Otherwise `getComputedStyle` reports the
> value the element is moving *away from*.
>
> ⚠️ **To ask "is this rule applying?", read the CSSOM, not computed style.** Matched-rule
> enumeration is immune to compositing; computed style is not.
>
> ⚠️ **A visual check is not available in this environment.** Not "slower" — unavailable. Anything
> whose correctness is about how it *looks* is a human's job, which is what CLAUDE.md already says
> and this is the mechanical reason why.
>
> ⚠️ **Check `innerWidth` before believing any layout measurement.** A zero viewport produces
> plausible-looking numbers rather than obvious zeros. `resize_window` first, always.
>
> ⚠️ **Anything about paint, size or scroll needs a human.** Added 2026-08-20, after the fifth
> instance. The three categories are now known; treat a reading in any of them as a prompt to ask
> a person, not as a result.

**This is the third measurement artifact of the phase, and they share a shape**: supabase-js retries
made a failure test report success; `element.hidden` reported an element hidden while it rendered;
now transitions report a state the element has left. **Every one produced an accurate reading of the
wrong thing.** The instrument was working; it was answering a different question than the one being
asked. The habit that catches all three is to ask what else the reading could mean before acting on
the first interpretation that fits.

### ⚠️ The signed-in-with-history state is unreachable by any check in this repo, 2026-08-19

**Three defects reached production and were found by a human using the site within the hour.** None
was caught by anything automated, and the reason is the same each time — worth stating as a property
of the test surface rather than as three separate misses.

| Defect | Why every check missed it |
|---|---|
| Resend button visible on the reset panel | Asserted `element.hidden === true` — the **property**, which was correct. `display: flex` outranked the browser's `[hidden]`, so it rendered anyway. Nothing asked what was being *painted*. |
| **Resume blanked the primer deck** | The banner only exists for **a signed-in account with saved progress**. Guests never see it; a stubbed store never reaches the handler; a fabricated session cannot produce it, because the row is read from Supabase. |
| Reset confirmation flashing past | Needed a real `USER_UPDATED` event from a real `updateUser`, on a page holding a live session. |

**The general form.** Every mode available to an automated check on this project — guest, stubbed
store, fabricated session — passes *through* the signed-in-with-history state without touching it:

- **Guest**: `progress.js` neither reads nor writes since this phase. There is no banner, no restore,
  no resume, nothing to click.
- **Stubbed store**: whatever the stub returns is what gets tested. The stub is written from the same
  understanding that wrote the bug, so it agrees with it.
- **Fabricated session**: `localStorage` can hold a session `getSession()` accepts, which is genuinely
  useful and was used repeatedly today. ⚠️ **But it cannot fabricate a ROW.** The access token is not
  real, so PostgREST rejects it, and every code path gated on returned data is skipped.

**So the deciding question for any Phase 5+ feature is: does this path need data that only exists
because a real person used the site before?** If yes, no check in this repo reaches it. That is not
a gap to be closed by writing more tests of the same kinds — all three kinds share the blind spot.

**What actually covers it**, in order of cost:

1. **A real account that has already used the site**, driven by hand. It is what found all three.
2. A seeded account on the **dev** project with rows written by a real session, kept for testing.
   ⚠️ Not built. It would have caught the resume bug and nothing else so far.

**Sharpens what `CLAUDE.md` already says.** *"Automated checks are necessary but never sufficient for
anything visual."* True, and this is narrower and more actionable: **anything gated on saved progress
is only exercised by signing in and using the site**, visual or not. The resume bug was a
`ReferenceError`, not a visual defect at all.

⚠️ **Phase 9 is built entirely on this state.** Dashboards, completion tracking and progress
percentages are, by definition, features about data a returning user has accumulated. Every one of
them lives in the region no check here can reach. Plan the seeded-account fixture before that phase,
not during it.

> **This came true on 2026-08-21, and the fixture had still not been built.** Phase 9 was verified
> against hand-written rows instead — which were self-consistent, coverage complete *and*
> `completed_at` set together, because that is the shape you write when you already believe the two
> agree. A real account had the opposite shape: `completed_at` set with three slides of coverage.
> The page reported **30%** for a skill the library called **COMPLETED**, and the owner found it by
> looking, exactly as this entry said. See the Phase 9 log at the top.
>
> ⚠️ **The sharper version of the lesson: a fixture you author cannot disagree with you.** It
> encodes the same assumption as the code under test, so the one class of bug it can never surface
> is a wrong assumption — which is the class that reaches production. The seeded account is still
> not built, and is now overdue rather than pending.

**One thing that did work, and is worth keeping.** All three fixes were verified against
**production itself** afterwards — fetching the served file and matching on the changed line, and
`npm run verify:published -- after` for the fingerprint. Checking what an origin actually serves is
cheap, needs no session, and is the one form of verification that cannot be fooled by a stub.

### Guests lose progress entirely, not just the banner

**Scope correction, 2026-08-18.** The plan says guests keep working exactly as today except for the
resume banner. The intent is larger: **guest progress tracking is removed**, which is the reason to
sign up. The banner is the visible symptom; quiz answers, accordion states and position also stop
surviving a reload.

⚠️ **The deploy that stops writing guest progress must not clear what is already stored.** Clearing
eagerly would destroy saved progress with our own hand, to the people least likely to notice. So old
`amplified_*` entries are left exactly where they are.

**The break is clean in both directions: progress.js no longer READS localStorage either.** Decided
2026-08-18, after the alternative had been built. Reading them would resurrect a position that can
never advance again — the page offers to resume somewhere, then refuses to remember anything after
it, which is a worse experience than a clean start and harder to explain. The old entries are inert:
never read, never written, never deleted.

#### The one-time import was built, tested, and dropped

A `progress-import.js` merged the device's keys into the account on sign-in: union merge, quiz order
and answer resolved as a pair per question, read-back verification before clearing, offered from a
panel on `/sign-in/` and `/account/`. It worked. Every merge rule and the irreversible window were
tested and passed.

**It was deleted anyway, and the reasoning is worth keeping** because the same shape will recur:

1. **The audience is nobody, and shrinking.** Only visitors who saved progress *before* this deploy
   can ever have a key. Guests can no longer create one, so the population is fixed on the day of
   the deploy and only goes down.
2. **The prompt could not be got right.** It reappeared on every load of `/sign-in/` or `/account/`
   while a key existed, because a mis-click must not be able to strand data permanently. Fixing the
   nag needed a snooze key, which needed its own cleanup. Making it silent and automatic removed
   the nag but left 250 lines of merge logic serving that same audience of nobody.
3. **Passing tests are not a reason to ship.** The work was sound; the question is whether the thing
   should exist. Those are separate, and sunk effort argues for neither.

⚠️ **If you rebuild it, the quiz rules are already written down above and they are right.**
`quizSelected` is a DOM index and is device-independent; `quizOrder` is purely visual and must be
taken whole per question. Do not re-derive them.

**A correction against my own working, because it is the instructive part.** Mid-build I decided
`quizSelected` indexed *into* the permutation, concluded that resolving the two fields independently
would point an answer at an option the person never chose, and rewrote the merge so each question
took one side's pair whole. That was wrong — `applyQuizOrder` only sets CSS `order`, and
`querySelectorAll` returns DOM order regardless, exactly as this document already recorded from the
first reading of `plan.html`. The "fix" was also strictly worse: it discarded a device's answer
whenever the account held an order for that question.

The lesson is not about quizzes. **A conclusion already reached by reading the code, and written
down, was overridden by a fresher-feeling re-derivation that never went back to the source.** The
document was right and was not consulted. Nothing shipped, because the module was deleted for
unrelated reasons — but the near-miss is the reason this paragraph exists.

The consequence to own in the announcement: anyone with progress saved before the deploy starts from
zero, and is never told the old position existed. That is a deliberate trade for a simpler codebase,
not an oversight.

### Signup becomes publicly callable in this phase, and the page is not the surface

Through Phase 4, `/auth-test` was live on both production origins and inert: it takes the Supabase
URL and `anon` key in two runtime fields, and neither is committed or set as an env var anywhere.
The project ref is discoverable — it is in these docs, in a public repo, and in every auth email
header — but the ref alone calls nothing.

**This phase publishes the key, because that is what the key is for.** It ships in the browser on
every page that talks to Supabase. From that moment `/auth/v1/signup` is callable with `curl`, and
**deleting `auth-test.astro` closes nothing** — it would only remove a friendlier UI for an endpoint
that is already open. The controls are all Supabase-side.

| Exposure | Severity |
|---|---|
| Junk accounts | RLS confines each to its own rows. Clutter, not a breach. |
| Email quota exhausted | Resend's free tier is 100/day. A script drains it in a minute, after which **real password resets stop** — the Phase 4 failure mode arriving by a different route. |
| **Signups using other people's addresses** | The serious one. Confirmation mail goes to strangers who mark it spam, spending the sender reputation Phase 4 exists to build. `p=quarantine` means the damage lands on every subsequent auth email. |

**So the activity is a decision, not a toggle.** CAPTCHA on the auth endpoints (Supabase supports
hCaptcha and Turnstile) is the conventional answer; the email rate limit set in Phase 4 is a
backstop rather than a defence, since it caps volume without distinguishing who caused it. Whatever
is chosen, it belongs in the same change that re-enables signup — retrofitting it means running open
for however long the gap is.

### The legal pages, and what a sibling site settled that this one could not, 2026-08-19

Built on `feat/legal-pages`: `public/privacy.html`, `public/terms.html`, `public/why-sign-up.html`,
hand-written in `public/` alongside the other 16. **Announcement-blocking**, and the reason is
narrow: Phase 5 is the first time this site holds personal data, and the sign-up form asks for a
name and an address with nothing on the site saying what happens to either.

**Two backlog entries specified the work. Both were wrong in ways only writing the page exposed.**
That is the finding worth keeping — not the pages themselves.

#### The sibling site answered what this repo could not

Promptly (`G:\My Drive\…\websites\promptly`, `dist/privacy/`, `dist/terms/`) is run by the same
person under the same law, and its legal pages are considerably more rigorous than the backlog entry
that specified ours. Reading it settled two facts that were about to become a blocking question —
**Scots law and Scottish courts**, and the **UK GDPR / DPA 2018** framing — and surfaced four
omissions that were not optional:

| Missing | Why it mattered |
|---|---|
| **Server logs** | Providers keep IP, user-agent, timestamps and paths. The draft said guests leave no trace anywhere. ⚠️ **Wrong, and wrong in the direction that matters** — the reassuring direction. |
| **An Article 6 legal basis table** | Contract can only be relied on where there *is* one, so it cannot cover anyone reading the site without an account. Those purposes run on legitimate interests and have to say so. |
| **International transfers** | Accounts and mail in Ireland; hosting, DNS and the bot check global, including the US. Article 46 safeguards. |
| **Rights, and the ICO** | Including the honest limit for guests: we cannot tell which log entries are theirs, and Article 11 does not require collecting more data in order to find out. |

⚠️ **The lesson is about backlog entries, not about privacy law.** Both entries were written months
of thinking ahead of the page and read as complete — one carried a full table of what was stored, the
other a full cookie inventory. Neither was complete, and neither *looked* incomplete. **A checklist
written before the work does not become the work.**

#### Two things were checked rather than assumed, and both changed the page

1. **There is no cookie banner, and the page argues it rather than asserting it.** PECR governs
   storing *anything* on a device, not cookies specifically — so the question is never "is it a
   cookie?" but "what is stored, and is it necessary?". Everything this site writes is either
   strictly necessary or a setting the reader chose. **Vercel Web Analytics stores nothing on the
   device at all**, which is why the regulations are not engaged by it: no cookie, no browser
   storage, visitors told apart by a request hash discarded after 24 hours. The backlog flagged this
   as the one to check rather than assume, and checking it is what turned an assertion into an
   argument.
2. ⚠️ **Google Fonts was absent from the inventory entirely.** All 19 pages pull two typefaces from
   `fonts.googleapis.com`, disclosing the visitor's IP to Google on every page view, account or not.
   **It is the one third party every visitor touches** — more reach than Supabase, Resend or
   Turnstile — and it was in neither backlog entry. Named on the page rather than omitted;
   self-hosting logged.

**One promise had to be reconciled rather than repeated.** The sign-up form says the only mail is
confirmation and reset. A privacy notice that changes materially has to reach account holders, and
Promptly promises exactly that. Both pages now name that notice as the single exception and say it
is not marketing, so the form's promise stays true instead of quietly becoming false.

#### Two wiring patterns carried across, and one deliberately not

✅ **Deep links into a form mode.** `/sign-in/#sign-up` and `/sign-in/#forgot` now open on the right
form. Promptly's comment names the failure precisely: without it the deep links are **cosmetic** —
every one lands on the sign-in form and the reader, who has already decided, has to find the mode
themselves. We had that defect the moment the why-sign-up CTA existed.

The hash seeds `mode`; `settle()` already calls `setMode(mode)` when it shows the form, and that one
call is what keeps every `hidden`/`required` pair in step. ⚠️ **A `hashchange` listener was added on
top, which Promptly does not have** — the seed fires only on load, so changing the hash on an open
page left the form contradicting the address bar. Guarded to exact matches *and* to the form panel
being the visible one, **because Supabase writes and clears that same hash during recovery**; a loose
listener would repaint the form underneath the recovery panel. Verified that clearing the hash leaves
the mode alone.

✅ **Both audiences in one static file.** `why-sign-up.html` carries a guest half and a signed-in
half and shows one. Promptly's reasoning is the load-bearing part: **a static page cannot tell a
visitor with no account from one who is simply not signed in on this device.** Guest is the default
in the markup, so the page still reads correctly if the script never runs.

⚠️ **It costs a guest nothing, and that was verified rather than assumed.** `nav.js` loads the auth
stack only on a peeked session or on `/sign-in/` and `/account/` (`nav.js:613`), so `supabase.min.js`
is never fetched for the audience the page is written for. Confirmed in the network log.

❌ **Not carried: Promptly puts no terms or privacy link on its sign-up form**, footer only. This site
links both from the sign-up panel, because that is the moment the data is handed over and the account
page arrives after the decision. No consent checkbox either — nothing there is optional processing,
so a tickbox would be theatre in front of the one action the page exists for.

#### The `[hidden]` trap caught the same way twice, and was seen coming the second time

`.doc-cta` sets `display: flex`, which outranks the browser's own `[hidden]` rule — so the guest CTA
would have stayed fully visible while `hidden` was set on it. **Identical to the resend button that
shipped with its countdown painted over it.** A scoped `[hidden] { display: none !important }` was
written *before* testing this time, and the test asserts computed `display`, not the property.

⚠️ **One measurement was nearly chased as a bug.** `pageScrollsX` reported `true` on `terms.html`
with `innerWidth: 0` — the browser pane reports a zero viewport when it is not displayed, so every
width-derived reading is meaningless until `resize_window` forces one. Same root cause as the frozen
transitions. **Check `innerWidth` before believing any layout measurement from that pane.**

#### What was left open

**No self-serve export.** Promptly satisfies the Article 20 portability right with a download button;
this site promises a manual response within one month instead. Honest and lawful, but it is a
standing obligation on a person rather than a feature — one query and one JSON file would retire it.
Logged, and a natural fit with Phase 9, which is already building on the same table.

### The account grew a promise, and the promise grew a schema, 2026-08-20

Nine commits on `feat/legal-pages` after the pages themselves. The through-line is one decision:
**the account now offers to tell people when new skills and features land.** Everything else followed
from it, including a migration nobody planned.

#### Saying it turned "no marketing" into direct marketing

The pages had said the only mail was confirmation and reset. Offering update mail makes it **direct
marketing by electronic mail under PECR reg 22**, which needs consent — and Article 7(1) requires the
controller to be able to *demonstrate* it. So the copy change could not ship alone:

| Changed | |
|---|---|
| `privacy.html` §4 | A consent row (Article 6(1)(a)), and a **separate legal-obligation row** for policy-change notices — those are not marketing and must not be switchable off with the rest |
| `privacy.html` §8 | Rewritten into three kinds of mail: always-sent, opt-in, and the policy notice |
| `terms.html` §2 | The same, under *Your account* |
| The sign-up hint | ⚠️ Said **"Never a newsletter."** True when written, false the moment this shipped |

⚠️ **That hint is the finding worth keeping.** It was accurate, load-bearing, and became a lie —
a reassurance shown at the exact moment someone decides whether to trust the site. **Copy that states
a limit is a claim about the system, and it rots the same way a comment does.** It now reads
*"Anything else is opt-in"*, and carries a note to change `privacy.html` §8 in the same commit.

#### The migration nobody planned: `20260820070000_profiles_wants_updates`

`wants_updates boolean not null default false`, plus `updates_consent_at`.

- ⚠️ **`default false` is the point of the column, not a detail of it.** `true` would silently enrol
  every existing account at migration time — the exact thing consent exists to prevent, done
  invisibly and in bulk.
- **The timestamp is stamped by a trigger, never by the client.** A consent record the data subject
  can set themselves is not evidence of anything.
- **`handle_new_user()` reads the metadata key as TEXT and compares to `'true'`.** `::boolean` would
  raise on malformed input, and that trigger runs `after insert on auth.users` — any exception rolls
  back the auth user, so a bad key would make signup fail with an opaque *"Database error saving new
  user"*. Same reasoning the display_name migration gives. **Failing closed is also correct for
  consent specifically: if we cannot tell what was ticked, we did not get consent.**
- ✅ **No new grant, and that is worth stating because the documented trap is the opposite case.**
  `grant select, update on public.profiles` is table-level and already covers columns added later. A
  new *table* lands with no grants and looks like a broken policy; a new *column* does not.

**The checkbox reverses an argument made three commits earlier, and correctly.** The terms links were
added with a comment saying no consent checkbox belonged on that form, because *"nothing here is
optional processing"*. That was right. Update mail **is** optional processing, so it is the one thing
on the form that does need a tick — unticked, separate from the terms line (bundling it would make
consent a condition of the service, which Article 7(4) forbids), and reset on every mode change.

**The toggle is deliberately not inside a disclosure**, unlike change-password and delete. Article
7(3): withdrawing must be as easy as giving. Someone who came to stop the email should not have to
work out which heading hides the control.

⚠️ **Still unsendable, and the pages say so.** The unsubscribe link and any multi-recipient mechanism
do not exist. The Phase 4 constraint is the sharp one: `List-Unsubscribe` is deliberately absent from
the auth templates, because a reader could otherwise unsubscribe from their own password reset and be
suppressed silently. **Update mail needs it and auth mail must never have it, so they cannot share a
Resend audience, a suppression list, or a template.**

#### `verify:schema` — proving a migration landed with the anon key alone

`npm run verify:schema`. PostgREST parses the `select` list **before** checking privileges, so the
two failures are distinguishable from outside: `400 does not exist` versus `401 42501 permission
denied`. **The 401 is a pass** — `profiles` grants SELECT to `authenticated` only, so that is exactly
what an anonymous caller should get. It checks *existence* and treats "you may not look at this" as
proof there is something to look at.

⚠️ **It then crashed on a network that intercepts TLS**, immediately after a migration had applied
*successfully* — and the stack trace read as "the migration failed". Node ships its own CA bundle and
ignores the Windows trust store, so a corporate proxy's root is trusted by Windows and not by Node.
The fix is `--use-system-ca`, **never `NODE_TLS_REJECT_UNAUTHORIZED=0`**, which would remove the
symptom and the guarantee together on a script whose whole job is to make a trustworthy statement.
Written up in [dev-workflow.md](dev-workflow.md); it affects all four `verify:*` scripts.

#### The modal, and why it does not contradict the rule against modals

Leaving the form mid-signup to read a 3,200-word notice means coming back to empty fields and a spent
captcha token. Terms and privacy now open in a **native `<dialog>`**.

`account.astro` argues against modals — *"a focus trap, scroll lock, Escape handling, backdrop clicks
and focus return; five things to get right"*. **`showModal()` supplies four of the five.** Only the
backdrop click is hand-written. The argument was against *hand-rolled* modals and still stands.

⚠️ **An iframe, not a copy of the text.** A second copy of a privacy notice is a second thing to keep
true — and the copy people actually read while signing up would be the one that silently went stale.
`?embed=1` tells the real page to drop its own nav and footer, and **the param goes before any
fragment** or it lands inside it and the page never sees it.

**Then it nested inside itself.** `privacy.html` links to `/sign-in/`, so a reader could reach the
sign-up form *inside* the modal and open a second modal within the first, each layer holding a live
copy of the form. ✅ **Fixed by deciding what the surface is rather than special-casing the loop:** it
is a reader, not a browser. Fragments scroll; the sibling document swaps in; `mailto:` passes through;
**everything else opens a new tab and closes the modal.** Recursion is then impossible *by
construction* — the frame can only ever hold `privacy.html` or `terms.html` — which is a stronger
guarantee than a depth counter and needs no state.

#### Three defects found by looking, and a fourth found by looking harder

| | |
|---|---|
| Checkbox stacked above its label | `.auth-panel label { display: block }` is **(0,1,1)**; `.auth-check-label` was (0,1,0) and lost. **Third cascade collision on these pages** |
| Terms line rendered on top of the button | `.auth-hint` carries `margin-top: -12px` to tuck under a *field*. This is the one hint that follows a *button* |
| `the<a>terms of use</a>` | ⚠️ **Astro's HTML compressor collapses a newline between text and an element to nothing, not to a space.** Shipped twice, looked fine in source both times |
| `#s8` links "not scrolling" | Not a defect. **Scrolling is inert in the agent's browser**, so the reading meant nothing — see the compositing finding above |

**All four were found by a human looking at a screenshot.** That is now the settled property of this
project rather than a recurring surprise: automated checks here confirm structure and state, and say
nothing about what is painted.

#### A date was wrong for a month, and the expiry is what hid it

Adding the accounts banner item on 2026-08-20 surfaced an unrelated defect: Dark Mode was dated
**23 July** in `index.html`'s `ANNOUNCEMENTS` and **21 July** in `updates.json`. `a137d18`, the
site-level toggle, says 21 — so the banner was the wrong copy, and had been since it was written.

**The date is one fact stored in two files with nothing checking they agree**, which is ordinary
duplication. What makes it worth recording is the *reason it survived*: an item is only rendered
while it is inside `EXPIRY_DAYS`, so a wrong date is visible for a fortnight and then disappears —
and the What's New list it disagrees with is permanent. By the time anyone could compare the two,
only one of them was still on screen. **The expiry did not cause the error; it made the error
unfalsifiable.**

⚠️ **Generalises to anything with a display window.** A short-lived surface cannot be audited against
a long-lived one after the fact, so the check has to happen at write time or not at all. The note now
sitting above `ANNOUNCEMENTS` says to write the pair in one sitting and to take the date from the
commit rather than from memory.

Both remaining pairs were checked at the same time and match: Systems Thinking (17 Jul), Strategic
Synthesis (13 Aug).

**A related gap, found while checking and fixed in the same sitting:**
[`.claude/commands/add-skill.md`](../.claude/commands/add-skill.md) never mentioned `updates.json` or
the banner at all, yet both live skills have entries in both — done by hand each time, unrecorded.
That is not what caused this defect (Dark Mode is a feature and never went through `add-skill`), but
it is the same shape, and it is the one place a *skill* would repeat it. Now step 5d. This is the
third time `.claude/commands/` has drifted from the site; see the standing trap in `CLAUDE.md`.

### Announcement planning — resolved 2026-08-20, and the answer was that there is no announcement

Kept in full below because the reasoning is what produced the answer, and because the *shape* of the
answer is reusable: the thing this section was planning for turned out to be already built, in three
places, none of which was an announcement.

**What shipped instead**, and it is the whole of it:

| | |
|---|---|
| A What's New entry | `updates.json`, 2026-08-20. Says accounts exist, links all three pages |
| A banner item | `index.html`, `expiryDays: 35`, links `why-sign-up.html` |
| The guest notice | `progress.js` `showGuestNotice()` — already live since the Phase 5 merge |

**The regression argument dissolved on inspection.** Everything below is right that guests losing the
resume banner is the one place existing behaviour gets worse, and right that it needs saying. What it
assumes is that an *announcement* is the thing that says it. But `progress.js` already tells a guest,
at the moment they do something that would have been saved, that it was not — which beats any
announcement, because it reaches the person while they care rather than when we happen to publish.
An announcement reaches whoever visits the homepage that fortnight; the notice reaches exactly the
people who would have felt the loss, at the moment of loss.

⚠️ **The generalisation worth keeping: "we must tell people" is not the same as "we must publish a
notice."** In-product, at the moment of consequence, usually wins. Check what the code already says
before writing prose to say it.

**On release notes, considered and declined.** The change is big enough to want more than a headline,
which is what makes the question tempting. But the depth already exists as `why-sign-up.html` — that
page *is* this change's release notes, written as something a reader wants rather than a version log.
A release-notes format would be a third surface repeating it, maintained forever, read by nobody, and
competing with the page that does the job better. The one real asymmetry — the 2026-08-20 What's New
entry runs four sentences where every other entry runs one — is not a defect. Four things genuinely
shipped together, and splitting them into four same-dated entries would read worse.

---

Original planning, preserved:

This is the only place in the whole plan where existing behaviour gets *worse* for someone:
guests **lose the resume banner** they get for free today. It is intentional — it is the reason to
sign in — but existing regular visitors will feel it.

Frame the announcement as "your progress now follows you everywhere, sign in to keep it" rather
than letting people discover the banner silently vanished.

⚠️ **There is no longer a migration path, so the announcement carries the whole of the softening.**
The one-time import was dropped, which means a returning visitor loses the banner *and* whatever
position it was offering, with nothing offering to claim it. Say that plainly. Do not imply anything
is recoverable by signing in, because it is not.

✅ **The argument no longer has to fit in the announcement, as of 2026-08-19.** `why-sign-up.html`
now makes it in full — guest against account, in one table, opening with what a guest keeps rather
than what they lose. Link to it rather than restating it, and let the announcement do the one thing
the page cannot: acknowledge that something people had is gone.

⚠️ **Do not announce before `feat/legal-pages` is merged.** The announcement drives people to a
sign-up form that asks for a name and an email address; the pages saying what happens to both are on
that branch. The order is the whole point — a dead privacy link on the sign-up form is worse than no
link at all, and it appears exactly where someone is deciding whether to trust the site. *(Satisfied:
merged as `947fb19` on 2026-08-20, before either the banner item or the What's New entry shipped.)*

---

## Phase 6 — News into the DB

**Impact:** 🔵 Visible + 🟢 New (visitor) · 🟡 Silent (admin) — **announce the favourites and notes.**

**Why before the admin portal:** it gives the admin UI something real to manage, and forces the
URL problem to be solved while the data set is small, known, and fully under your control.

| Activity | What it does, and why |
|---|---|
| Migrate 21 date groups / 69 stories, generating slugs | Populates `legacy_id` so every existing shared link stays resolvable. |
| Build `/news` and `/news/:slug`, server-rendered | Real HTML for crawlers. No user-agent sniffing — serving different content to Googlebot than to users is cloaking. |
| Add the 301 redirect endpoint for legacy URLs | Old links keep working forever and consolidate SEO value onto the new URL. |
| Switch the banner's news source to the DB | **Forced by this phase** — `news.json` no longer exists, so the `fetch('news.json')` in `index.html`'s `newsItemsHTML()` must change. Visitors should see no difference. |
| Add favourite, pin, and notes for signed-in users | First personalisation feature on real content. |
| Retire `middleware.js` | Its only job was faking meta tags for social scrapers. Real server rendering makes it redundant — retire rather than port. |
| Move `search-index.json` to `/api/search-index.json` | Kills a hand-maintained file that drifts, and removes one of the six manual add-skill touchpoints. |

**Done when:** an old shared URL 301s correctly — **and still does after you reorder that day's
stories in the database.** That second check is the entire reason slugs replaced positional
indexes.

---

## Phase 7 — Admin portal and banner

**Impact:** ⚪ None (visitor) · 🟢 New (admin) — nothing visitor-facing, nothing to announce.

**Why after news:** the CRUD screens get built against a schema already proven by a real
migration, rather than against a schema that only exists in theory.

| Activity | What it does, and why |
|---|---|
| `/admin` shell gated by `is_admin()` | Entry point. Access enforced in RLS, not by hiding buttons — a non-admin who finds the page still cannot write. |
| Blog post and category CRUD | The core reason the database exists. |
| News management: edit, reorder, archive | Replaces the `add-news` skill. Archive rather than delete, so shared links never die. |
| Banner CRUD over the `announcements` table | Moves the hardcoded `ANNOUNCEMENTS` array in `index.html` into the DB. Deliberately like-for-like — visitors see an identical banner. ⚠️ The table needs `expiry_days` **nullable per row**, not just a type default: an item can override it (accounts got 35). And moving this to the DB does **not** retire the date-drift trap — `updates.json` stays a file, so the pair still has to be written together. |
| Site config: What's New, skill card states | Removes the remaining hand-edited JSON and HTML toggles. |

**Done when:** a signed-in non-admin attempting a direct write to `blog_posts` from the browser
console is rejected by the database. Separately: the banner looks indistinguishable before and
after, and a new announcement added through the admin UI appears on a hard refresh with no deploy.

### On the banner

The whole gain here is on the admin side. Banner content becomes a database edit served on the
next page load — no commit, no push, no deploy. Rendering stays client-side, which costs nothing
in SEO terms because banner content is supplementary rather than primary. See "The announcement
banner" in [supabase-integration-plan.md](supabase-integration-plan.md) for the expiry, icon, and
trusted-HTML decisions.

---

## Phase 8 — Blog

**Impact:** 🟢 New · 🟢 New — **announce.** A whole new content section.

**Why last of the content work:** it depends on the admin portal existing, and it is the only
genuinely new content type rather than a migration of something that already exists.

| Activity | What it does, and why |
|---|---|
| `/blog` index and `/blog/:slug`, rendered on request | Publishing is instant — no rebuild wait, which is the reason this isn't a build-time approach. |
| Category and recency views | The discovery surfaces the content is for. |
| Confirm sitemap and search index pick posts up | Should be automatic from the Phase 6 endpoints. Verify rather than assume. |

**Done when:** `curl` on a published post returns the body text in the HTML, not just meta tags.

---

## Phase 9 — Your learning ✅ DONE

**Impact:** 🟢 New (visitor) · ⚪ None (admin) · **Shipped 2026-08-21** as `ef7c58c` — outcome in
the Progress log above.

**"Why last" turned out to be wrong.** The reasoning was that it visualises data only produced once
Phases 5 to 8 have been running, and that building it earlier means designing charts against empty
tables. Half of that held: Phase 5 alone produces everything this page reads, and nothing from 6, 7
or 8 was needed. What *was* true is the empty-table problem — it simply applies to a different set
of charts than expected, and those were cut rather than faked. See the Progress log.

| Activity | What it does, and why | Outcome |
|---|---|---|
| Completion and progress views over `skill_progress` | The five skills, primer and plan tracked separately. | ✅ Built. ⚠️ Derives nothing itself — `skills-progress.js` owns every definition, after a second copy contradicted the library within a day. |
| Charting library, vendored or via Astro | Was assumed necessary. | ❌ **Not used.** Hand-written SVG and CSS over the site's own tokens: two arc rings, a stacked donut, five stacked columns. None of them needed a library, and one would have shipped to every reader of one page. |
| `started_at` / `completed_at` | Why those columns exist from Phase 3. | ✅ `completed_at` is now the authority for "complete". `started_at` is still written by nobody and is unused here. |
| Saved items view — favourites, pins, notes | Favourites, pins and notes in one place. | ⏭ **Deferred to Phase 6/7.** Nothing writes `user_news` or `notes` yet, so the view would be three empty panels. `why-sign-up.html` still marks both `Soon`. |

**Time-series and activity views are blocked on a schema change, not on effort.** `skill_progress`
holds one `updated_at` per row and no per-section timestamp, so "read this week", any weekly trend
and any activity heatmap are not derivable. They need an events table — one row per section first
seen — and it starts empty on the day it ships. Self-rated confidence needs a control that does not
exist on any plan page. All four are specified in
[dashboard-design-brief.md](dashboard-design-brief.md) §3.

**Deferred: leaderboards.** The schema supports them — `profiles.display_name` plus a
`security definer` function — but there is nothing meaningful to rank yet. The only scoreable
artifact today is a 5-question knowledge check with a visible answer-reveal button.
