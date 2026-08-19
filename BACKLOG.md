# Amplified Thinker — Project Backlog

Ideas and future enhancements. Not prioritised — review periodically and promote to active work when ready.

---

## Enhancements

### A "why sign up" page, comparing an account with browsing as a guest
**Status:** Idea · Not started · Raised 2026-08-19 during Phase 5
**Relates to:** [src/pages/account.astro](src/pages/account.astro), `public/` (a new page),
[src/pages/sign-in.astro](src/pages/sign-in.astro), [public/progress.js](public/progress.js)

A page setting out plainly what an account gives you against what you get as a guest.

**Why it now has a job to do.** Phase 5 removed guest progress entirely, so for the first time there
is a real difference to explain — and the argument currently exists only as a one-line notice that
appears *after* someone has lost something. This page is where it belongs before that.

The copy from the account page's *Your progress* panel, removed on 2026-08-19, moves here:

> Progress saves to your account automatically as you work through a primer or a plan, and follows
> you to any device you sign in on.

That sentence was doing nothing where it was — telling someone who had already signed up why signing
up was worth it. As the spine of a comparison page it is the whole point.

| | Guest | Account |
|---|---|---|
| Read everything | yes | yes |
| Resume where you left off | no | yes |
| Quiz answers and open sections kept | no | yes |
| Same position on another device | no | yes |
| Theme remembered | yes, on this device | yes |
| Email required | no | yes |

⚠️ **The honest column is the guest one.** Everything on the site is readable without an account and
the page must say so first — a comparison that opens by listing what is withheld reads as a paywall,
which this is not. Two other things belong on it: nothing is stored about a guest's reading at all,
and the only email an account ever sends is a confirmation or a password reset.

**Where it is linked from:** the sign-up form, the guest "not being saved" notice on skill pages, and
probably the nav. Sequence it with the launch announcement — the announcement and this page are
making the same argument to the same people at the same moment.

### Emailing the user when their account is deleted
**Status:** ❌ **Declined 2026-08-19** — re-authentication was built instead · Raised 2026-08-19
**Relates to:** [supabase/migrations/20260819080000_delete_own_account.sql](supabase/migrations/20260819080000_delete_own_account.sql),
[supabase/README.md](supabase/README.md)

Send a "your account has been deleted" confirmation when someone deletes their account.

✅ **Declined, and the reasoning is the useful part.** Three arguments against, any one
of which would be enough:

1. ⚠️ **The retention paradox.** The mail goes to an address just erased at its owner's
   request. Sending it means holding that address past the deletion — and if the send is
   asynchronous, holding it in a queue. The page promises *"We keep no copy."*
2. **Nothing to act on.** These emails exist so a victim can respond. A password change
   can be undone by a reset; a deletion cannot be undone at all. It notifies someone of a
   loss from an account that no longer exists to help them.
3. **Wrong threat model.** Someone at an unlocked browser who could delete the account
   could already read everything and change the password. The email does not close that.

**What was built instead, on 2026-08-19: re-authentication before deletion.** Password
required, checked server-side against the JWT `amr` claim so the page cannot be bypassed.
It closes the actual exposure, adds no vendor, no secret and no runtime, and processes
nobody's address after erasure. See `20260819120000_delete_own_account_reauth.sql`.

⚠️ **The same exposure existed on password change** and was closed the same day — the
account page now requires the current password too. See *Requiring the current password to
change it*, below.

**But point 2 above cuts the other way for password change, and that is the difference.**
A deletion notification tells someone about a loss they cannot undo, from an account that
no longer exists. A password-change notification tells someone about a takeover they
**can** undo, by resetting from a mailbox they still control. So the argument that
declined this one is an argument *for* the other: see *A "your password was changed"
notification email*.

Kept below for the day the answer changes.

⚠️ **Supabase will not do this.** Its template set is fixed — confirm signup, invite, magic link,
change email, reset password, reauthentication — and there is no deletion event to hang one on. This
has to be built.

**Three routes, none free:**

| | What it costs |
|---|---|
| Vercel `/api` endpoint calling Resend | An Astro adapter and a server build, works on one origin only, and puts `service_role` in the project — the thing CLAUDE.md says has no home until Phase 6 |
| Supabase Edge Function | A Deno runtime, a CLI deploy step, and a second place to look when mail stops |
| ⚠️ `pg_net` from an `after delete` trigger | Stays in the database, but the **Resend API key then lives in Supabase Vault** — the first secret this project stores server-side, and a new thing to rotate |

**Worth arguing about before building.** The usual case for the email is detecting an unauthorised
deletion — but deleting already needs a live session *and* typing the address, so the window it
closes is narrow, and the mail arrives after the account is unrecoverable. It also spends the shared
Resend allowance of 100/day, which auth mail depends on.

**Better sequenced with Phase 6**, when a server endpoint exists for other reasons and the marginal
cost is one function rather than a whole architecture. If it is wanted sooner, `pg_net` is the route
that does not require retiring the Pages origin first.

### Authoring the auth email templates
**Status:** ⚠️ **Gap in the plan, not a backlog idea** · Found 2026-08-19
**Relates to:** [docs/implementation-sequence.md](docs/implementation-sequence.md),
[supabase/README.md](supabase/README.md)

**No phase owns the content of the auth emails.** Phase 4 covered deliverability exhaustively — SPF,
DKIM, DMARC, the Brevo header injection, SMTP — and touched the templates only to confirm that
Brevo's tracking headers appeared on them. Nobody has written the emails themselves, so **Supabase's
defaults are what real users will receive**: unbranded, addressed to nobody, and titled things like
*Confirm Your Signup*.

Two templates are live today: **Confirm signup** and **Reset password**. Both are edited in the
dashboard, so neither is in the repo and neither survives a project rebuild — the same class of
problem as the redirect allowlist.

What they need:

- The first name, now collected at sign-up. `{{ .Data.display_name }}` reads the metadata `auth.js`
  passes. ⚠️ **It is empty for every account created before 2026-08-19**, so the template must have a
  fallback rather than greeting nobody.
- Site branding, a plain-English subject, and a sender name that matches the site.
- ⚠️ **No open or click tracking**, and no `List-Unsubscribe` — Phase 4 finding: a user can otherwise
  unsubscribe from their own password reset and be suppressed silently.
- The templates should be **copied into the repo** as reference files even though Supabase serves
  them from the dashboard, so a rebuild has something to restore from.

**Natural home: before the launch announcement.** Signups can technically open without it, but the
confirmation email is the first thing a new account holder ever receives from the site.

### Privacy and cookies page, and the sign-up link to it
**Status:** Idea · Not started · Raised 2026-08-18 during Phase 5
**Relates to:** `public/` (a new page), [src/pages/sign-in.astro](src/pages/sign-in.astro),
[supabase/migrations/20260817120000_initial_schema.sql](supabase/migrations/20260817120000_initial_schema.sql)

A privacy and cookies page, matching the one on the sibling site, **linked from the account-creation
panel** — that is the moment someone is being asked to hand over personal data, and the only moment
the link is genuinely useful rather than decorative.

⚠️ **No link until the page exists.** A dead link on the sign-up form is worse than no link at all,
and worse than usual here: it appears exactly where someone is deciding whether to trust the site.

**What actually has to be described, which is more than it looks.** Phase 5 is the first time this
site holds personal data at all, so this stopped being boilerplate on 2026-08-18:

| What is stored | Where | Note |
|---|---|---|
| Email address | Supabase `auth.users` | The account identifier |
| First name | `auth.users` metadata → `profiles.display_name` | Collected at sign-up to address account email |
| Learning progress | `skill_progress` | Position, coverage, quiz answers, per skill |
| Theme preference | localStorage, and `profiles.theme` | Never leaves the device for guests |

**Cookies and local storage, precisely.** The page must not claim "we use no cookies" — check before
writing:

- **Supabase auth token** — localStorage, not a cookie, but the same disclosure obligation. Strictly
  necessary for a signed-in session.
- **Theme preference** — localStorage. Set for guests too, before any account exists.
- **Vercel Web Analytics** (`/_vercel/insights/script.js`) — on **every** page. This is the one that
  needs checking rather than assuming: it is cookieless by design, but it is still analytics, and
  whether it needs consent depends on what it collects, not on whether it uses a cookie.
- **Cloudflare Turnstile** — on `/sign-in/` only, and it does set storage on `challenges.cloudflare.com`.

✅ **One thing that is already true and worth stating plainly:** guests have nothing stored about
their reading at all. Phase 5 removed guest progress writing entirely, so an anonymous visitor's
localStorage holds a theme preference and nothing else. That is a stronger position than most sites
can claim and it should be said rather than buried.

✅ **Account deletion is built, as of 2026-08-19** — the page can describe the right because the site
honours it. Account → *Delete your account*, gated on typing the address, immediate and irreversible.
`public.delete_own_account()` in migration `20260819080000`; `on delete cascade` does the rest.

The page still has to be accurate about the two things deletion does *not* remove: a blog post keeps
its text with `author_id` set null, and mail already delivered is in the recipient's inbox and
outside anyone's reach.

**Natural home: alongside the launch announcement**, since that is when the first real accounts are
created. It does not block Phase 5 — signups can open before the page exists, though that is a
judgement worth making deliberately rather than by omission.

### Completion tracking and progress metrics — the data model is already right
**Status:** Idea · **Natural home: Phase 9 (Dashboards)** · Raised 2026-08-18 during Phase 5
**Relates to:** [supabase/migrations/20260817120000_initial_schema.sql](supabase/migrations/20260817120000_initial_schema.sql),
[public/progress.js](public/progress.js), [src/pages/account.astro](src/pages/account.astro)

Let users mark a primer or plan **complete**, and show percentage progress from the resumption point
until they do — then chart it.

**The question raised with it was how to distinguish someone *reviewing* a plan they have finished
from someone *jumping around* inside one they have not. The schema already answers this**, and it is
worth writing down before anyone redesigns it:

| Column | Meaning | Behaviour |
|---|---|---|
| `visited` | **Coverage.** What has been seen | Monotonic union. Never shrinks |
| `position` | **Resumption point.** Where to reopen | Volatile. Carries no progress meaning |
| `completed_at` | **Completion.** Explicit, user-set | Null until the user says so |

Because coverage is a union that never shrinks and completion is an explicit flag, **neither case can
corrupt the metric**: revisiting cannot reduce a percentage or un-complete a plan, and jumping around
before finishing cannot either. So the two situations do not need distinguishing in the *data* at
all — only in the *display*, and that is one null check at render time:

- `completed_at` null → "68% complete · last in Habits"
- `completed_at` set → "Completed 3 September · last reviewed in Habits"

**Completion is explicit — an actual control the user presses, not an inference.** Confirmed
2026-08-18. Inferring it from `visited` covering every section makes a fast scroll count as
finishing, and leaves someone who genuinely worked through it but skipped Resources permanently at
93%. The schema comment already said the page decides and the DB does not infer; that stands.

So Phase 9 needs a real CTA on each plan and primer — *"I've completed this"* — writing
`completed_at`, and a way to undo it.

**The percentage is coverage: `visited.length / total`.** Four of twelve is 33%.

✅ **The denominator is now recorded, as of 2026-08-18.** Every save writes `total` into `state` —
`sectionIds.length` on plans, `TOTAL` on primers. This was done during Phase 5 rather than deferred,
because **the counts are not uniform and never were**: the critical-thinking primer has 9 slides
where the others have 10, and its plan has 15 sections where analytical-thinking has 14. A single
hardcoded divisor in Phase 9 would have been quietly wrong for some skills and right for others.
Recording it per row also survives content edits — a row written today stays interpretable even if
the plan gains a section next year.

⚠️ **Know what the percentage actually measures.** `visited` is populated by the scroll handler as
sections pass through the viewport, so it is *coverage by scrolling*, not by reading. Someone who
scrolls to the bottom is at 100% having read nothing. That is tolerable for a resume-position hint
and misleading as an achievement number — which is the strongest argument for the explicit
completion CTA carrying the real meaning, and the percentage being presented as "how far through",
not "how much you have learned".

### A larger quiz bank per skill, with an optional extra round
**Status:** Idea · Not started · Raised 2026-08-18
**Relates to:** `public/skills/*/plan.html`, a new table

Each plan ships five knowledge-check questions hard-coded in its HTML. Offer a bank per skill and let
users request more questions.

**This is mostly a content project, not an engineering one.** The build is a table plus a fetch; the
cost is authoring and quality-checking questions for every skill, and it scales with the library
rather than being done once. Sequence it behind the completion tracking above, which needs no new
content at all.

Notes for whoever picks it up:
- ⚠️ **A new table lands with no grants.** The Phase 3 migration ends with
  `alter default privileges … revoke all on tables from anon, authenticated`, so the `grant` goes in
  alongside the `create policy` or it presents as a broken policy.
- Questions are public content, so `anon` SELECT is appropriate — unlike the answer *state*, which is
  per-user and already covered by `skill_progress`.
- ⚠️ `quizSelected` in the stored snapshot is a **DOM index**, valid only against the question set
  the page rendered. Serving a variable set from a table breaks that assumption, which is fine for
  an extra round scored in the moment and **not** fine if extra rounds are ever persisted. Decide
  which before building.

### ~~Requiring the current password to change it, and where that form belongs~~
**Status:** ✅ **Done 2026-08-19, in Phase 5** · Raised 2026-08-18 during Phase 5
**Relates to:** [src/pages/account.astro](src/pages/account.astro), [public/auth.js](public/auth.js)

The account page carried a permanently-open *Change your password* form, which read oddly on a
settings page. Two separate things were tangled in that observation, and the second was the important
one:

1. **Placement.** A change-password form sitting open by default is unusual; it normally sits behind
   an action or on its own page. Cosmetic.
2. ⚠️ **It did not ask for the current password.** Supabase's `updateUser({ password })` accepts the
   session alone, so anyone reaching an unlocked browser could change the password and lock the owner
   out of their own account — no email, no confirmation, nothing to undo it with. That is a security
   property, not a layout preference, and it is why this entry existed at all.

**Both are now done.** (1) was fixed when the account page was restructured into disclosure sections.
(2) was pulled forward and fixed on 2026-08-19 rather than left here, because building the deletion
control put a *password-gated* action on the same panel as an *ungated* one — and the ungated one
protected the more valuable outcome. Deleting destroys the data and ends the intruder's access with
it; changing the password keeps the account, locks the owner out, and hands over the recovery route.
`auth.reauthenticate()` already existed for deletion, which turned this from a feature into a
twenty-line reuse.

**What is deliberately still open:** *"deciding what happens to other sessions afterwards."*
Changing the password does **not** sign out other devices, because Supabase's `updateUser` does not
revoke sibling refresh tokens. Someone changing their password after a laptop is stolen has not
locked that laptop out. See the new entry below.

### ~~Changing the password does not sign out other devices~~
**Status:** ✅ **Done 2026-08-19, in Phase 5** · Raised the same day
**Relates to:** [public/auth.js](public/auth.js), [src/pages/account.astro](src/pages/account.astro)

`updateUser({ password })` changed the password and left every **other** refresh token alive, so the
one action people take *because* they think someone else has access did not remove that access.

**Done automatically, not as a checkbox.** `auth.updatePassword()` now calls
`signOut({ scope: 'others' })` after a successful change, in both places a password is set — the
account page and the post-reset form. `others` fires no `SIGNED_OUT` event, which is what keeps the
current session alive on the page that just reported success.

⚠️ **The failure is reported as different words, never as an error.** The password HAS changed by
that point, so a failed revocation must not surface as a failed password change. The page says
either *"and any other devices have been signed out"* or *"Other devices could not be signed out
just now"* — claiming eviction that did not happen is the sentence someone acts on when they think
an account has been taken.

**⚠️ A pre-existing bug fell out of this and is also fixed.** supabase-js defaults `signOut()` to
`scope: 'global'` — confirmed in the vendored bundle as `async signOut(e={scope:'global'})`. Every
sign-out on this site was therefore signing the user out of **every device**: leaving a shared
computer also logged you out on your phone. Scope is now explicit everywhere — `local` for the
button, `others` on password change, `global` spelled out in `deleteAccount()` where it is meant.

### Offer "send it again" on the password-reset panel too
**Status:** Idea · Not started · Raised 2026-08-19 during Phase 5, from live use
**Relates to:** [src/pages/sign-in.astro](src/pages/sign-in.astro)

The *Check your email* panel after a password reset offers **no way to ask for another one**. It
replaces the form, so the only route back is navigating to `/sign-in/` and clicking *Forgotten your
password?* a second time. Sign-up has a resend button on the same panel; reset does not.

**Not an oversight in the code so much as a gap in the thinking** — the resend button was added on
2026-08-19 after four dead confirmation links in one morning, and it was wired for the case that
prompted it and no further. A reset email can go missing exactly as easily.

⚠️ **The objection this has to answer is already recorded, and it is not "why bother".** It is that a
*pressable* button is a trap: an email was just sent to get you to this panel, so the first press
lands inside Supabase's 60-second per-recipient throttle, where the send is silently swallowed and
looks identical to a failure. **The countdown is what makes the button safe**, and any version of
this must start already counting down, exactly as sign-up does.

**⚠️ It is not two arguments to `showSent()`.** The existing handler calls
`auth.resend({ type: 'signup' })`, and **Supabase's resend endpoint does not support recovery** — a
reset has to call `resetPasswordForEmail()` again. So the panel needs to know which kind of wait it
is on, and the handler needs to branch.

**And the copy has to carry the warning sign-up already carries** — *"Use the newest email, older
links stop working"* — because issuing a new reset link **invalidates the previous one**. Someone
who resends and then opens the older email gets a dead link, which is precisely the failure this
whole area exists to prevent.

**Why it was not done at the time:** raised while verifying the live deploy, alongside a real defect
on the same panel. The defect was fixed straight away; this is a behaviour change and belongs on a
branch with its own testing rather than in a hotfix.

### A "your password was changed" notification email
**Status:** Idea · **Natural home: Phase 6**, when a server-side sending path exists · Raised 2026-08-19 during Phase 5
**Relates to:** [supabase/email-templates/](supabase/email-templates/), `auth.users` trigger, Resend

**The gap is the password CHANGING, not the reset being requested.** The reset-request mail already
covers the other direction — `reset-password.html` says *"Didn't ask for this? Ignore this email.
Your password has not changed and will not change unless the link above is used"* — so someone who
did not ask is already warned and has to do nothing.

Nothing at all is sent when the password actually changes. A change from the account page is
completely silent, and that is the message that reaches someone whose account has **already** been
taken.

⚠️ **It must be sent server-side.** If the page sends it, an attacker who has just changed the
password simply does not — the notification becomes optional for exactly the person it exists to
report on. Same reasoning that put the deletion re-auth check in the database rather than trusting
the form to have asked.

**Why Supabase's templates cannot do this.** They style mail **Supabase Auth itself sends**, and
there is no password-changed event among them. This needs:

1. A trigger on `auth.users` watching `encrypted_password` for a change.
2. `pg_net` (or an Edge Function) posting to Resend, with the API key in **Supabase Vault**.
3. A template in `supabase/email-templates/`, matching the two already there.

⚠️ **A trigger on `auth.users` that raises can break authentication itself.** There is already one
(`handle_new_user`), so the shape is established — but this one must fail silent and never block the
password change it is reporting on. A notification that can prevent a password change is worse than
no notification.

**The "if this wasn't you" action has to be real, and here it is** — *reset your password now*. It
works because **the mailbox owner always wins**: they can reset and take the account straight back,
with no support queue and no intervention from the site owner. ⚠️ That is only true while there is
no way to change an account's email address. See the entry below.

**Why Phase 6 and not now.** `CLAUDE.md` records that the Resend credential has no home until a
server endpoint exists, and this is the first real reason to want one. Building it now means a Vault
secret and an `auth.users` trigger invented in isolation, ahead of the phase that decides how
server-side secrets are handled here.

**While it does not exist**, the compensating control is that the account page requires the current
password before changing it — so a silent change needs the password, not just an open tab.

### ⚠️ If an email-change feature is ever built, it must notify the OLD address first
**Status:** Constraint on future work · **Not a feature request** · Raised 2026-08-19 during Phase 5
**Relates to:** any future email-change UI, [public/auth.js](public/auth.js)

**There is deliberately no UI for changing an account's email address, and that absence is currently
a security property rather than a missing feature.** It is what makes account takeover recoverable:
whoever holds the mailbox can always reset the password and take the account back.

⚠️ **Building email-change without this safeguard makes takeover permanent.** The attack is an
ordering problem, not a bug:

1. Attacker reaches a signed-in session and changes the **address** first.
2. Password reset now emails the attacker.
3. The real owner's mailbox is worth nothing. There is no self-service route back at all.

**So whenever that feature is built, all of these, not a subset:**

- ⚠️ **Notify the OLD address**, always, and before the change takes effect. This is the whole
  entry — the new address learning about it is worthless, since the attacker owns it.
- Require the current password, as the change-password form already does.
- Require confirmation from the new address before the change takes effect, so a typo cannot strand
  an account at an address nobody holds.
- Give the old address a way to reverse it — a revert link, valid well beyond the usual link
  lifetime, since the owner may not read that mailbox for days.
- Sign out other sessions, as password change now does.

**Supabase sends a "Change Email Address" template** which is currently left at its default and
unused, noted in `supabase/email-templates/README.md`. ⚠️ Check what that template actually does
about the old address before assuming Supabase covers any of the above — *Secure email change* is a
project setting that can be off, and with it off only the new address is notified.

### Move the breach check server-side, if the Supabase plan is ever upgraded
**Status:** ⏸ **Blocked on plan tier — Pro and above** · Raised 2026-08-19 during Phase 5
**Relates to:** [public/pwned.js](public/pwned.js), Supabase → Authentication → Password Security

**Confirmed 2026-08-19: Supabase's "Prevent the use of leaked passwords" is Pro plan and above.**
This project is not on Pro, so the check was built client-side instead — see
[public/pwned.js](public/pwned.js). Same corpus, same k-anonymity API, no plan required.

**⚠️ Do this the moment the plan is upgraded, and only then.** The client-side version is advisory:
it runs in the browser and devtools defeats it. That is an acceptable trade for a control that
defends a user against their own password choice, but the server-side version additionally stops a
scripted client, and there is no reason to keep the weaker one once the stronger is available.

**When it happens:**

1. Dashboard → **Authentication** → the **Password Security** section → *Prevent the use of leaked
   passwords*. ⚠️ The path has moved before — the docs still describe *Auth → Providers → Email* —
   so navigate by the setting name rather than the route.
2. ⚠️ **Both projects.** Dev and prod each carry their own copy, like the email templates. One
   protected and one not is invisible until it matters.
3. Delete `public/pwned.js` and its two `<script>` tags, and the `breachedMessage()` helper on both
   auth pages.
4. ⚠️ **Handle the `weak_password` error code before deleting anything.** Supabase's own message is
   surfaced raw by both forms today. It is blunt, and it reads as an accusation or as "this site was
   breached" — neither of which is true. `pwned.js` has the copy that gets this right; move it,
   do not lose it.
5. Record it in [supabase/README.md](supabase/README.md) under the dashboard settings that no
   migration captures.

**One thing the server-side version does NOT bring:** it checks on signup and password change, not
on sign-in — same as the client-side one, and for the same good reason. Someone whose existing
password turns out to be breached must still be able to get in, because signing in is how they reach
the form that fixes it.

### Refusing passwords: previously used, or previously breached
**Status:** ✅ **Resolved 2026-08-19** — breach checking built, password history rejected
**Relates to:** [public/pwned.js](public/pwned.js), [src/pages/account.astro](src/pages/account.astro)

The question was whether changing or resetting a password should refuse one the account has used
before, or used within some window. Two different things sit under that, and they pull opposite ways.

**Already done:** the new password cannot be the one currently in use. Checked on the page, and
Supabase rejects it independently. That is the cheap, uncontroversial part and it is in.

⚠️ **Password history is NOT recommended, and this is a reversal of the intuition rather than a
scheduling call.** Three reasons, in order of weight:

1. **It is against current guidance.** NIST SP 800-63B tells verifiers **not** to impose
   composition rules or routine rotation, and to reserve forced change for *evidence of compromise*.
   History requirements are part of the same family — the practice they exist to support is the one
   the guidance dropped. ⚠️ Confirm the current wording against the live document before acting on
   this entry; it is cited here from memory and the 800-63 revisions move.
2. **It reliably makes passwords worse.** Told they cannot reuse, people increment — `Summer2025!`
   becomes `Summer2026!`. The rule is satisfied and the password is guessable from the last one.
3. **It means storing more password hashes.** A history table is a second copy of exactly the
   material that matters most in a breach, kept for an account's lifetime, to enforce a rule the
   standards no longer ask for. The blast radius grows and the security does not.

**Done instead — new passwords are checked against known-breached ones.** Same instinct, aimed at the
question that has an answer: not *"has this person used it before"* but *"is this password already on
a list attackers hold"*. Supabase's own setting turned out to be **Pro plan only**, so
[public/pwned.js](public/pwned.js) does it in the browser against the same HaveIBeenPwned
k-anonymity API. Built 2026-08-19; the entry above covers moving it server-side if the plan changes.

**And the thing people usually mean when they ask this**: they are picturing an account someone else
has reached. The control for that is the entry above — signing other devices out — not history.

### Clear all progress for a skill, deliberately
**Status:** Idea · **Natural home: Phase 9**, alongside completion tracking · The dangerous half was
fixed 2026-08-18 · Raised 2026-08-18 during Phase 5
**Relates to:** `public/skills/*/plan.html`, `public/skills/*/primer.html`, [public/progress.js](public/progress.js)

Users should be able to wipe their progress for a skill and start again, from a **persistent
control** — not only from the resume banner, which appears just when there is progress *and* the
banner has not been dismissed. With a clear warning that it cannot be undone.

**Sequenced into Phase 9 with the completion tracking above**, because the two are one family of
controls rather than two features. Once a plan can be marked complete, a user needs *clear progress*,
*mark complete* and *mark incomplete* in the same place, and they need to read as three deliberate
choices about the same thing. Building the clear control on its own now would mean placing it twice.

**A path already exists, and Phase 5 quietly made it dangerous.** The resume banner's *Start over*
button calls `store.clear()`. Before Phase 5 that removed one localStorage key in one browser —
annoying, and you could just work through it again. Afterwards it **deletes the account's row on
every device, permanently, on one click.** Same button, same click, far bigger consequence.

✅ **A confirmation was added to all ten pages on 2026-08-18**, guarded on `store.mode() === 'account'`
so guests are not asked about data they do not have. That closes the data-loss risk.

**What is left is the feature proper:**
- The persistent control itself, and where it lives — on the page, on the account page, or both.
- A styled dialog instead of `window.confirm()`. The native prompt was chosen because these are ten
  hand-written pages with no dialog component, and building one into each is disproportionate for a
  rarely-used confirmation — but it is not what the rest of the site looks like.
- Probably a single "clear progress for this skill" control per skill, rather than one per primer and
  one per plan, since a user thinking "start this skill again" means both. Note that this crosses the
  `skill_progress` primary key, which is per `(skill_slug, content_type)` — one user action, two rows.
- ⚠️ Decide what clearing does to `completed_at`. Wiping progress on a plan someone finished months
  ago probably should not silently un-finish it, and probably should not silently keep it either.
  This is the case that makes *clear* and *mark incomplete* genuinely different actions.

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

### Bump the GitHub Actions off deprecated Node 20 — **both** workflows
**Status:** Idea · Not started · Noticed 2026-08-17 during Phase 3 · **Widened 2026-08-19**
**Relates to:** [.github/workflows/pages.yml](.github/workflows/pages.yml),
[.github/workflows/keepalive.yml](.github/workflows/keepalive.yml)

Both workflows emit this. Pages names one action; the keep-alive names two:

> Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on
> Node.js 24: `actions/checkout@v4`, `actions/setup-node@v4`

**Nothing is broken.** GitHub force-runs them on Node 24, so both work today. This is a pin ageing
out, not a current fault. The deprecation was announced 2025-09-19 and is still only a warning.

⚠️ **Two different things are called "Node 20" here, and only one of them is this entry.**

| | What it is | Affected? |
|---|---|---|
| The action's **own runtime** — `runs: using: node20` inside `checkout@v4`, `setup-node@v4`, `deploy-pages@v4` | What the annotation is about. Fixed only by bumping the action version. | ✅ **This entry** |
| `with: node-version: '20'` in `keepalive.yml` | The Node that runs **our** script. Nothing to do with the warning. | ❌ Separate, below |

**Action:** bump to `@v5` of each — `checkout`, `setup-node`, `deploy-pages`, `configure-pages`,
`upload-pages-artifact` — or whichever version targets a supported runtime. ⚠️ **Do all of them in
one pass:** the annotation names only the actions that tripped it, not everything sharing the
runtime, so fixing the named ones just reveals the next.

**⚠️ The 2026-08-18 note that this "dies with the workflow" is now only half true.** That reasoning
was about `pages.yml`, which goes when the GitHub origin is retired. **`keepalive.yml` is not going
anywhere** — it exists because the free Supabase tier pauses an idle project, so it outlives the
Pages origin and lasts until the project moves to a paid plan. Treat the two workflows separately
from here.

**Why `pages.yml` was worth tracking at all:** it is the only thing publishing
`sing-chen.github.io/amplifiedthinker`, which *was* a load-bearing origin — corporate networks
blocked the custom domain under newly-registered-domain policies and those users had no other route
in. That block lifted, the audience is now zero, and the urgency with it: an origin nobody uses
failing to publish is not an incident.

**The keep-alive is the opposite case.** It is not user-facing at all, and its failure is silent —
the job goes red in an inbox, the database pauses a week later, and the first anyone knows is that
**sign-in stops working on the live site**. Low urgency, but the consequence is larger than the one
this entry was originally written about.

### Align `node-version` across the two workflows
**Status:** Idea · Not started · Noticed 2026-08-19 during Phase 5
**Relates to:** [.github/workflows/keepalive.yml](.github/workflows/keepalive.yml),
[.github/workflows/pages.yml](.github/workflows/pages.yml)

`keepalive.yml` pins `node-version: '20'`; `pages.yml` uses `22`. ⚠️ **This is not what the
deprecation annotation above is about** — this is the Node that runs *our* code, and the two
workflows simply disagree for no reason anyone recorded.

**Nothing is at risk today.** `scripts/keepalive.mjs` uses only node builtins and global `fetch`,
both of which have been stable since Node 18. But Node 20 reached end of life in 2026, so it is a
pin that will eventually stop being offered by the runner.

Bump `keepalive.yml` to `22` to match. One line, and it removes a difference that otherwise invites
the question of whether it was deliberate.

**Related, and separately worth knowing:** the same workflow run failed at `actions/deploy-pages@v4`
with a `503` and a `429`, which was a transient GitHub Pages outage rather than anything in this
repo. Recorded in the Phase 3 progress log so a future red X is not misread as this deprecation.

### Vendor consolidation, retiring the GitHub origin, and the contact form
**Status:** Reviewed 2026-08-18. Vendor moves **deferred**; the Pages retirement is **decided but
unscheduled** · Revisit in a future phase
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

#### Retiring the GitHub Pages origin — **decided, not scheduled**

Unlike the two candidates above, this one is settled in principle: **the Pages origin will be
retired.** What is deferred is when and how, not whether. `CLAUDE.md`, `dev-workflow.md` and the
cross-cutting constraint in the implementation sequence all now say so.

⚠️ **What retires is the published URL, not GitHub.** The repository, the git history and the
Actions workflows stay. Only `sing-chen.github.io/amplifiedthinker` stops being a public route to
the site. Anyone reading this as "move off GitHub" has misread it.

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

### Supabase Pro — declined for now, with four things riding on it
**Status:** Considered 2026-08-18 during Phase 5 · **Declined, free path taken** · Revisit at launch
**Relates to:** [supabase/README.md](supabase/README.md),
[.github/workflows/keepalive.yml](.github/workflows/keepalive.yml),
[public/pwned.js](public/pwned.js)

Phase 5 needed a second Supabase project and found the free tier's **two active projects** already
spent — this site, plus a second unlaunched site still in development. That surfaced separate costs
of staying free, all of which $25/month would remove at once:

| | The free workaround taken instead |
|---|---|
| No slot for a dev project | **Pause** the other project. Reversible for a year, but only one of the two sites can have a live backend at a time. |
| ⚠️ **The live database auto-pauses after ~7 days of low activity** | `keepalive.yml`, one real anonymous read a day. |
| Branching unavailable (Pro-only, plus ~$9.70/mo per branch) | A second project instead — see *Why a second project rather than a Supabase branch* in the Supabase README. |
| **Leaked-password protection is Pro-only** — added 2026-08-19 | [`public/pwned.js`](public/pwned.js) does the same check in the browser. Advisory rather than enforced; see *Move the breach check server-side* above for the changeover. |

**The middle row is the one that would actually hurt, and it is easy to miss.** A paused project
answers nothing — sign-in fails, progress will not load, password resets stop. This site generates
almost no Supabase traffic by design, because **guests never touch it at all** once Phase 5 removes
guest progress. A quiet week is therefore an outage waiting to happen on a site that looks entirely
healthy from the outside.

⚠️ **The keep-alive has a known hole:** GitHub disables scheduled workflows after 60 days of
repository inactivity. A dormant repo is a dormant database, so the safeguard turns itself off
exactly when it matters. Documented in the workflow rather than solved.

**Revisit when any of these becomes true:** the site has enough signed-in users that an outage is
felt by someone other than the owner; the second site launches and both need live backends at once;
or the workflow adopts pull requests, at which point branching is a better model than a shared dev
project and the second project becomes the thing to retire.

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

### De-duplicate the footer CSS — seven copies of the same rules
**Status:** Idea · Not started · Raised 2026-08-19 during Phase 5
**Relates to:** [public/styles.css](public/styles.css), the 16 hand-written pages,
[src/layouts/BaseLayout.astro](src/layouts/BaseLayout.astro)

The footer rules — `footer`, `.fi`, `.footer-inner`, `.footer-tagline`, `.footer-nav`,
`.footer-sep`, `.fn` — exist **seven times**: inline in five hand-written pages, again in
`search.html` under different class names, and now in `BaseLayout.astro`.

**How it surfaced:** the Astro layout was written with the footer *markup* copied across and the
CSS left behind, so `/sign-in/` and `/account/` shipped a bare list of default-styled links.
⚠️ **Nothing could have caught it** — no build step, no check, and each page looked fine in
isolation. It reached production and was found by eye.

**Why it was not fixed properly at the time.** The obvious move is to lift the rules into
`styles.css`, which everything already loads. But `footer { … }` is an **element selector**, and
`search.html` has a `<footer class="search-footer">` with a different structure and its own rules.
A shared element selector would restyle a page that was not part of the change.

**So the real fix needs all 16 pages in one pass:** settle on one footer structure, move the rules
to `styles.css`, delete the six inline copies, and reconcile `search.html` — either by giving it
the standard markup or by keeping `.search-footer` as a documented deliberate variant.

⚠️ **Until then, `BaseLayout.astro`'s copy is verbatim from `index.html` and must stay that way.**
Two copies that drift are worse than two that are identical, because the difference will show up as
a footer that looks subtly wrong on new pages only.

**Worth pairing with:** the same question applies to any other rules the hand-written pages
duplicate inline. Nobody has counted.

### Re-verify the signed-in security rules — the old checks are in git
**Status:** Note for Phase 7 · Raised 2026-08-19 when `auth-test.astro` was deleted
**Relates to:** [scripts/verify-rls.mjs](scripts/verify-rls.mjs), Phase 6 and Phase 7

**There is now no automated check that a signed-in user can only reach their own data.**
`npm run verify:rls` covers the **signed-out** half only — it proves an anonymous caller is refused.
The signed-in half lived in `src/pages/auth-test.astro`, deleted at Phase 5 step 33.

**Nothing is broken.** The rules themselves are in the schema and were verified when written. What is
gone is the tool for re-checking them after a change.

⚠️ **This matters from Phase 6 onward**, which adds news, saved items and notes, and Phase 7, which
adds the admin portal. Both rest on exactly these policies, and a mistake in one is silent — the site
keeps working and simply shows someone more than it should.

**Do not rewrite them from scratch.** The seven checks are preserved in the last commit that held the
file:

```
git show 84566e4:src/pages/auth-test.astro
```

They cover: reading your own profile; `profiles` returning only your row (and *all* rows for an
admin); **being unable to make yourself an admin**; `is_admin()` agreeing with the stored row; your
own progress round-tripping; **being unable to write someone else's row**; and the content tables
refusing writes from a non-admin while accepting them from an admin.

**Two pieces of reasoning in there worth keeping**, both of which took a wrong version first:

- The escalation check flips `is_admin` to the **opposite** of its current value, so it is always a
  real change. Writing `true` unconditionally is a no-op for an admin and reports a false pass.
- The content-table check proves the gate in **both** directions. ⚠️ *A gate that only ever refuses
  has not been shown to be a gate.*

**When it is rebuilt**, it does not need to be a page. Those checks only need a live session, which
any signed-in page already has — so a script pasted into the browser console would do, with no new
public surface and no second copy of the client setup.

### Delete `shell-test.astro` when the blog ships
**Status:** Idea · Not started · Noticed 2026-08-19 during Phase 5 step 33
**Relates to:** [src/pages/shell-test.astro](src/pages/shell-test.astro)

The Phase 2 scaffold, still live at `/shell-test/` on production. Its own header says to delete it
once the first real Astro surface exists — **and that has now happened twice over**, in `/sign-in/`
and `/account/`, which prove the same thing while also being useful.

Left in place at step 33 because that step named one page and deleting a second unasked is not what
"delete the old test page" meant. ⚠️ Unlike `auth-test.astro`, it pulls **no third-party script** and
holds no credentials field, so there is no reason to hurry.

Its stated trigger is Phase 8's blog. Either take it then, or take it now — it is `noindex`, linked
from nowhere, and nothing depends on it.
