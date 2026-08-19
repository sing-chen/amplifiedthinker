# Supabase

Schema, policies, and the Phase 3 runbook. Architecture and the reasoning behind the
data model live in [../docs/supabase-integration-plan.md](../docs/supabase-integration-plan.md);
this file is only how to apply and verify it.

```
migrations/20260817120000_initial_schema.sql   every table, every policy, in one file
rollback/20260817120000_initial_schema_down.sql the hand-written down-path
```

**One project until Phase 5, two after.** There is no real user data until auth ships,
so a separate dev project buys nothing yet and costs schema-sync work on every phase.
Split at Phase 5, when real progress data starts existing.

---

## Applying the migration

The file is plain SQL wrapped in one transaction, so either path works and both end
in the same place. It is idempotent only at the level of the whole transaction: a
failure rolls back completely, so a partial schema is not a state you can reach.

### Path A — dashboard SQL editor

Fewest moving parts, and the right choice for a first application.

1. Supabase dashboard → **SQL Editor** → New query.
2. Paste the entire contents of `migrations/20260817120000_initial_schema.sql`.
3. Run. Expect `Success. No rows returned`.

Migrations apply **in filename order**, and each assumes the ones before it:

| | |
|---|---|
| `20260817120000_initial_schema.sql` | Tables, RLS, policies, the signup trigger |
| `20260817140000_harden_function_grants.sql` | Closes the 8 Advisor warnings |
| `20260819080000_delete_own_account.sql` | Phase 5 — the self-service delete control |
| `20260819120000_delete_own_account_reauth.sql` | Phase 5 — requires a recent password sign-in before that delete. `create or replace`, so it is safe whether or not the one above was applied |
| `20260819140000_display_name_not_null.sql` | Phase 5 — `profiles.display_name` becomes `not null`, and the signup trigger derives a placeholder when a signup supplies no name |

### When each project gets a migration

Both projects end up identical. **They do not get there at the same time**, and the
order is the part worth writing down.

| | |
|---|---|
| **dev** | As soon as the migration is written. It is the only place it can be tested, and an untested migration has no business in production. |
| **prod** | **In the go-live step of the phase, immediately before the merge** — not when the file is written. |

**Why not just apply it to prod early, since it is additive and inert?** Because it is
not finished. Until the feature has been exercised against a real session, the
migration may still be wrong, and applying it early means fixing it in two places for
no benefit. Prod schema should track what `main` needs, and `main` needs nothing from
a branch that has not merged.

⚠️ **The one hard ordering rule: schema leads code, by one step.** The account page
calls `delete_own_account()` by name. The moment `main` carries that code, prod must
already have the function — otherwise every account page has a button that reaches
PostgREST and comes back `PGRST202`, *function not found*, which reads as a broken
page rather than a missing migration. Apply to prod, confirm, **then** merge. Never
the other way round, and never "we'll do it straight after".

**Data fixes are not migrations and do not follow this rule at all.** A one-off
`update` to backfill existing rows applies to whichever project holds the rows that
need fixing — which is usually only one of them, because the two projects hold
different accounts by design.

### Path B — Supabase CLI

Better once there is more than one migration, and the only path that keeps the
dashboard and this repo in step automatically.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

The CLI is not a dependency in `package.json` on purpose — it is a tool, not part of
the build, and Vercel and GitHub Actions must never run it.

### Rolling back

`rollback/…_down.sql`, run the same way. **Safe only while the tables are empty**,
which is all of Phase 3 — this phase inserts no rows anywhere. From Phase 5 it
destroys real user data. A Vercel rollback restores code, never schema, which is
why this file exists at all.

---

## Dashboard settings that are not in the migration

SQL cannot reach these. All of them are Auth configuration.

### 1. Redirect allowlist — deferred here from Phase 0

**Auth → URL Configuration.** The values were settled in
[../docs/dev-workflow.md](../docs/dev-workflow.md) before the project existed,
specifically so they would not be invented under pressure now:

```
Site URL:       https://amplifiedthinker.com

Redirect URLs:  https://amplifiedthinker.com/**
                https://sing-chen.github.io/amplifiedthinker/**
                https://amplifiedthinker-git-*-singchen.vercel.app/**
                http://localhost:4321/**
```

Four lines, four reasons, none of them optional:

| Line | Why it is there |
|---|---|
| `amplifiedthinker.com` | The primary origin. |
| `sing-chen.github.io/amplifiedthinker` | **Required, not a nicety.** Some corporate networks block the custom domain under newly-registered-domain policies, and those users have no other route in. Omitting it means sign-in fails for exactly the people with no fallback. |
| `amplifiedthinker-git-*-singchen.vercel.app` | The stable per-branch preview alias. Without the wildcard, sign-in works in production and fails on every branch with no useful error. The per-commit URL cannot be listed — it changes on every push. |
| `localhost:4321` | Astro's dev server port. |

#### Testing the allowlist without sending a single email

The obvious way to check an entry is to trigger a real email and see where its link lands. That works,
and it is what proved localhost and the preview branch — but the built-in mailer allows roughly two
messages an hour, and four origins need checking. Phase 3 ran out of allowance with two entries left.

**There is a direct probe.** `/auth/v1/verify` decides the redirect *before* it validates the token,
so an obviously invalid token still exercises the allowlist:

```bash
curl -s -o /dev/null -w '%{redirect_url}\n' \
  "https://<ref>.supabase.co/auth/v1/verify?token=deliberately-invalid&type=recovery&redirect_to=<URL-ENCODED-ORIGIN>"
```

- **Allowlisted** → redirects to the origin you asked for.
- **Not allowlisted** → redirects to the **Site URL** instead. That silent substitution is the exact
  failure this configuration is prone to, so seeing it happen on demand is the point.

**Always run a known-bad control in the same batch** — something like `https://example.com/nope`. If
that one is *also* honoured, the probe is measuring nothing and the passes mean nothing. Verified in
Phase 3: the bad control fell back to `https://amplifiedthinker.com`, the four real entries did not.

What this does **not** prove is delivery or token verification. Those are properties of the mailer and
the token, not of the origin, so proving them once anywhere is enough; the per-origin question is only
ever whether the entry matches. Use one real email to prove the whole chain works, then use the probe
for every additional origin.

### 2. Email confirmation

`mailer_autoconfirm` is **false**: signup requires a confirmation email. That was left at
the project default through Phase 3, where it only affected how tedious the throwaway test
account was. Phase 4 is where it starts to matter, because from Phase 5 a real user can
trigger one.

### 3. SMTP — Phase 4

**Auth → Emails → SMTP Settings.** Replaces the built-in mailer, which allows roughly
**two messages an hour** — measured in Phase 3, where it ran out mid-verification with two
origins left to check — and which Supabase explicitly does not support for production.

The provider is **Resend**. It was not the first choice — Brevo was, and the switch happened
mid-phase for a reason worth reading before changing any of this: see *Why not Brevo* below.

#### The Resend side

**Domains → Add Domain**, `amplifiedthinker.com`, region **Ireland (eu-west-1)** to match the
Supabase project. Under Advanced options:

| Field | Value | Why |
|---|---|---|
| Custom Return-Path | `send` | Gives DMARC a second passing mechanism — see below |
| Tracking Subdomain | **blank** | Leaving it empty disables the tracking toggles entirely |
| Click tracking | **off** | Rewrites auth links. The defect that made Brevo unusable |
| Open tracking | **off** | Injects a pixel |

**Useful confirmation:** with tracking off, Resend hands you exactly **three** DNS records. A
fourth — a `CNAME` for `links` — means tracking is still on. Add the three in Cloudflare by hand
rather than using **Auto configure**, which asks for write access to the entire zone: the same zone
holding the Email Routing MX records and the apex CNAME to Vercel. Three records is not worth that
blast radius. Values and traps: [../docs/email-dns-baseline.md](../docs/email-dns-baseline.md).

⚠️ **Leave Resend's "Enable Receiving" toggle off.** It publishes an `MX` at the **apex**, where
Cloudflare Email Routing's three already live. Inbound is Cloudflare's job and it works.

**What the Custom Return-Path buys, and why it is not cosmetic.** Brevo bounced from
`gw.d.sender-sib.com`, its own domain — measured on a delivered message — so SPF was never
evaluated against `amplifiedthinker.com` and could not align with it. DMARC passed on **DKIM
alone**, which under `p=quarantine` makes one DNS record a single point of failure: rotate or
mis-publish a selector and every auth email goes to spam at once, with no partial degradation.
Resend bounces from `send.amplifiedthinker.com`, and the zone's `aspf=r` compares organisational
domains, so SPF now aligns too. Two independent mechanisms instead of one.

**The API key:** Resend → API keys → Create. Name `Supabase Auth`, permission **Sending access**
(not Full access), domain restricted to `amplifiedthinker.com`. Shown once. Least privilege for the
same reason `service_role` has no home here — a leaked sending-only key can send, and nothing else.

#### The Supabase side

**Auth → Emails → SMTP Settings.**

| Field | Value |
|---|---|
| Sender email | `noreply@amplifiedthinker.com` |
| Sender name | `Amplified Thinker` |
| Host | `smtp.resend.com` |
| Port | `587` |
| Minimum interval per user | `60` seconds (default) |
| Username | `resend` — the literal word, not an address |
| Password | the Resend API key |

The username catches people out: it is the same string for every Resend account. Resend's own SMTP
page headlines port **465**; 587 is on its supported list and is the conventional choice for
Supabase's mailer. Either works.

⚠️ **"Minimum interval per user" is a per-recipient throttle, and a suppressed send looks exactly
like a broken one.** Two auth emails to the same address inside 60 seconds and the second silently
does not arrive. Check this before suspecting the provider.

#### ⚠️ Check the port first. A wrong one reports itself as a *captcha* failure

Phase 5 lost most of a day to `585` typed instead of `587` on the dev project. Nothing listens on
585, so every send sat there until the gateway gave up at **35 seconds** and the whole signup rolled
back. The error that surfaced was not a timeout. It was:

```
captcha protection: request disallowed (timeout-or-duplicate)
```

— a precise, plausible, and completely unrelated message. The reasoning it invited was that Supabase
verifies the captcha token twice on account creation, which fitted every observation, because every
endpoint that "failed the captcha" was an endpoint that sends mail and every endpoint that passed
was one that does not. Two providers were evaluated and a server-side signup endpoint was designed
before anyone checked the port.

**Three things would have caught it, in ascending order of how obvious they should have been:**

| | |
|---|---|
| **Time the failures.** | A captcha rejection that takes 35 seconds is not a captcha rejection. The passing calls returned in ~300ms and the failing ones in ~35s; nobody looked at the clock. |
| **Ask what the failing set has in common** — and then check the *other* reading. "Creates a user" and "sends an email" partition these endpoints identically. Only one was tested. |
| **`resend.com/emails` shows whether an attempt was ever made.** Empty log = it never got out of Supabase. Ten seconds, and it was suggested but not run before the diagnosis was already fixed in mind. |

**Diagnosing a hanging auth call:** compare `/auth/v1/health` and a plain REST read (both should be
~300ms) against the failing call. If only the mail-sending endpoints are slow, it is SMTP, whatever
the error body claims. `select` on an endpoint that creates a user *without* mail — `/auth/v1/otp`
with `create_user: false` — separates the two cleanly.

**Verified working 2026-08-18 after the fix:** signup with Turnstile, through the real sign-in page,
returns in ~6 seconds with the confirmation mail sent. Turnstile was never the problem.

**Why `noreply@` rather than the existing `singchen@`:** the alias is a human identity that a
person reads and replies to; auth mail is machine mail. Pointing both at one address means
password-reset replies land in a personal inbox. Resend accepts any address on a verified domain,
so this needs no extra validation step. Note that nothing routes `noreply@` inbound — replies
bounce, which is the intent, but it is a decision rather than an oversight.

#### Why not Brevo — and why Brevo is still here

Brevo carried auth mail for a few hours on 2026-08-17 and delivered all three send types to the
inbox, DMARC passing. It was still wrong, and none of it was fixable from its settings:

| What Brevo did | Why it disqualified it |
|---|---|
| **Rewrote every link** to `…sendibt3.com/tr/cl/…` | The token is a bearer credential, travelling through a third party and into their click logs, on a URL shaped like phishing. Corporate filters that strip redirector links break auth entirely — which hits the NRD-blocked audience hardest, since they have one route in. |
| **Injected an open-tracking pixel** | Privacy cost, small spam-score cost, no benefit. |
| **Attached `List-Unsubscribe: One-Click`** to password resets | Gmail shows an Unsubscribe control on a security email. **A user can unsubscribe from their own password reset**, after which auth mail silently stops — invisible to you, and reversible only by an admin from Brevo's blocked-contacts page. |

The Transactional → Settings page offers no switch for any of them on the free tier. Supabase cannot
strip them either — it exposes no custom-header control. Confirmed as a product limitation rather
than a missed setting.

⚠️ **Brevo's DNS records must stay.** Gmail's *Send mail as* for `singchen@amplifiedthinker.com`
still relays through `smtp-relay.brevo.com` on port 587, authenticating with the SMTP key created
2026-07-06 and signing with the `brevo1`/`brevo2` selectors. That dependency is invisible from both
the Resend and Supabase dashboards. Deleting the records or that key as migration leftovers breaks
a working alias, and the failure surfaces as "my email stopped working" with nothing pointing at
the cause. `npm run verify:email` keeps asserting them under a heading that says so.

⚠️ **That Brevo key expires after 90 consecutive days of inactivity**, whatever its stated expiry —
and the alias is low-traffic. The symptom is an SMTP *authentication* failure, indistinguishable
from a wrong password. Tracked in [../BACKLOG.md](../BACKLOG.md).

#### How to confirm it actually works

Send one of each — signup, password reset, email change — and read **Show original** on the
delivered message. Gmail's SPF / DKIM / DMARC summary will not tell you: it reports provenance, not
content, and it read all-green on every Brevo message while all three defects were active.

| Check | Expected |
|---|---|
| Link target | `https://<ref>.supabase.co/auth/v1/verify?…`, not a redirector |
| Tracking pixel | absent |
| `List-Unsubscribe` | absent |
| `smtp.mailfrom` | `…@send.amplifiedthinker.com` |
| Authentication | `spf=pass`, `dkim=pass` (`header.s=resend`), `dmarc=pass` |

⚠️ **Resend's mail carries two DKIM signatures and only one counts.** The second is
`d=amazonses.com` — Amazon signing its own outbound. It passes, it is not yours, and it cannot
align with `header.from`. After a broken selector, the raw source will still show a `dkim=pass`.

**Trigger the sends from a clean `/auth-test/` URL** with no `#` fragment in the address bar.
The page builds its redirect target from `origin + pathname`, but production carries the older
`window.location.href` version until Phase 4 merges, and that produces a `##` link that supabase-js
cannot parse.

#### Then raise the rate limit

**Auth → Rate Limits → "Rate limit for sending emails".** Custom SMTP does not by itself lift
this — Supabase applies its own cap on top of the provider's, and it defaults low. Removing
the built-in mailer's ~2/hour ceiling is half the point of the phase, and it is not done until
this number moves too.

### 4. Signups are switched off — deliberately, and only until Phase 5

**Auth → Sign In / Providers → "Allow new users to sign up": off** since 2026-08-18.

Phase 4 finished its testing and nothing user-facing creates an account until Phase 5, so leaving it
on would be an open endpoint with no consumer. It is off rather than merely unused because the
`anon` key becomes public in Phase 5 — at which point `/auth/v1/signup` is callable directly, and
the HTML page is not the thing to remove.

⚠️ **Re-enable it as part of the change that protects it, not before.** An unprotected signup
endpoint drains Resend's 100/day allowance — after which real password resets stop — and lets
anyone trigger confirmation mail to strangers, whose spam complaints land on the sender reputation
this phase was built to establish. Rationale and options in
[../docs/implementation-sequence.md](../docs/implementation-sequence.md), Phase 5.

**Resolved 2026-08-18: the protection is Turnstile**, and the toggle above goes back on in the same
change that adds it — see section 5. Turning it on first, even briefly, is the gap the warning is
about.

### 5. Bot protection — Turnstile (Phase 5)

**Auth → Settings → Bot and Abuse Protection → Enable CAPTCHA protection.** Provider
**Cloudflare Turnstile**, secret key from the matching widget below.

**This needs no server endpoint**, which is the fact that decided it. Verification happens
inside GoTrue: the browser gets a token from the widget and passes it as
`options: { captchaToken }`, and Supabase checks it against Cloudflare with the secret. Signup,
sign-in and password reset are all covered. So the protection works identically on Vercel and on
the static Pages origin, and **retiring the Pages origin was not a prerequisite for Phase 5** —
that question was asked and answered rather than assumed.

Turnstile over hCaptcha for two reasons, in order: Cloudflare already runs the zone, so this adds
no eighth vendor to a site trying to reach five; and its managed mode is usually non-interactive
with no image puzzles, where hCaptcha's free tier serves them routinely and needs a cookie-based
accessibility workaround.

⚠️ **The widget script loads on the sign-in surface only, never from `nav.js`.** Putting it in the
nav would add a third-party request from `challenges.cloudflare.com` to all 16 pages for every
guest. Scoped this way, a network that blocks that host costs account creation and nothing else —
which matters here, given this site's documented history with corporate filtering.

#### Two widgets, because one project holds one secret

A Supabase project stores a single captcha secret, so one project can only ever point at one
Turnstile widget. Turnstile hostnames are FQDNs with **no wildcards**, and subdomains of a listed
hostname are included automatically.

| Widget | Hostnames | Secret goes in |
|---|---|---|
| `amplifiedthinker-prod` | `amplifiedthinker.com`, `sing-chen.github.io` | prod (`spehmrgmcdenqdftkyrt`) |
| `amplifiedthinker-dev` | `localhost`, `vercel.app` | the dev project |

⚠️ **`vercel.app` must never appear on the prod widget.** It is a public suffix, so listing it
authorises *every* site on `vercel.app` to render a challenge for our sitekey and mint tokens
against our signup endpoint. The split is what keeps that grant confined to a scratch database —
which is a second, independent reason for the dev project, beyond protecting user data.

`sing-chen.github.io` is listed rather than `github.io`: the parent would authorise every GitHub
Pages site in existence. It comes off the widget when that origin is retired.

#### The gate — a criterion a bad outcome cannot satisfy

Phase 4 finding 12 is the reason this is written as two assertions rather than one. "Signup works
in the browser" is satisfied completely by a configuration where the captcha is not enforced at
all, because the browser sends a token either way. The check has to include the negative half:

```bash
# MUST be rejected. If this creates a user, the captcha is not being enforced.
curl -s -X POST "https://<ref>.supabase.co/auth/v1/signup" \
  -H "apikey: <anon-key>" -H "Content-Type: application/json" \
  -d '{"email":"gate-probe@example.com","password":"correct-horse-battery"}'
```

Expect an error naming captcha verification. A `200` with a user object means the toggle is off,
the secret is wrong, or the provider dropdown does not match the widget — and the browser flow
will look perfectly healthy throughout.

Run the browser signup as the control in the same sitting. **Green only if both halves agree**:
one refusing without a token, one succeeding with one. Either alone proves nothing.

⚠️ `service_role` bypasses captcha exactly as it bypasses RLS. Public bug reports of "Turnstile
being bypassed on signup" are that, and they do not apply to a browser holding the anon key — but
it is the reason the probe above uses the anon key and not a key with a role claim.

### 6. Leaked-password protection — OFF, and that is not an oversight

**Auth → Password Security → *Prevent the use of leaked passwords*.**

⚠️ **This is deliberately unset, on both projects.** It is a **Pro plan** feature, confirmed
2026-08-19, and this project is not on Pro — the toggle either will not appear or will not save.
Anyone auditing these settings will find it off and reasonably assume it was missed; it was not.

**The check still happens.** [../public/pwned.js](../public/pwned.js) does it in the browser against
the same HaveIBeenPwned k-anonymity range API — only the first five characters of the password's
SHA-1 leave the page. It runs on sign-up, on the new password after a reset, and on the account
page's change-password. **Not on sign-in**, so someone whose existing password turns out to be
breached can still get in and fix it.

⚠️ **If the plan is ever upgraded, enable the setting AND remove `pwned.js`** — the browser version
is advisory and bypassable by anyone with devtools, which is an acceptable trade only while it is
the only option. `BACKLOG.md` carries the full changeover, including the `weak_password` error copy
that has to move before the file is deleted.

---

## The dev project — Phase 5

Until Phase 5 there was one project, because there was no real user data to protect and a second
project would have cost schema-sync work on every phase. Phase 5 creates real user data, so the
split earns its cost here and not before.

**Prod stays `spehmrgmcdenqdftkyrt`.** The new project is dev. Nothing in the repo names either
one: `supabase-client.js` decides at runtime by hostname, and `.env` points one machine at dev.

### Why a second project rather than a Supabase branch

The dashboard's project switcher offers **Create branch**, and it is a reasonable thing to reach for
— a branch is a real isolated database with its own credentials, and it applies the repo's
migrations automatically. It was weighed and rejected on three counts, in rising order of how
decisive they are:

1. **It needs Pro.** This org is on Free. Branching is Pro-and-above at $0.01344 per branch-hour on
   top of the $25/month plan, so a permanently-running branch is roughly **$35/month** against £0
   for a second free project. The menu offers it either way.
2. **Branches are ephemeral by design** — Supabase deletes a preview branch when its pull request is
   merged or closed. What is needed here is a practice database that outlives `feat/auth` and serves
   Phases 6 through 9, which is the opposite lifecycle.
3. ⚠️ **Each branch gets a new project URL and key, and this site has nowhere to put one.**
   `supabase-client.js` is served from `public/` exactly as written, with the values in the file,
   because there is no build step to inject them — the standing constraint from Phase 3 finding 8
   and `dev-workflow.md`. A value that changes per branch cannot be hardcoded, and the Pages origin
   has no mechanism to substitute it. This one would apply even on Pro.

Branching also assumes a pull-request workflow, which this repo deliberately does not use —
`main` is unprotected on purpose so `deploy.bat` keeps working.

**Worth revisiting if two things change**: the plan going Pro, and the workflow adopting PRs. A
branch per PR is a genuinely better model than one shared practice database, and at that point this
project becomes the thing to retire. Not before.

### The free tier's two-project cap, and the pause that comes with it

⚠️ **There was no spare slot.** The org already had two active projects — this site and a second,
unlaunched site still in development — and the free plan allows two. The slot for the dev project
comes from **pausing** the other one.

Pausing is not deletion: the database is shut down and its endpoint stops answering, but schema,
data and settings are retained and a **Resume** button brings it back in a couple of minutes. There
is a **one-year window** to do that, after which the backups expire. Paused projects do not count
against the cap, which is the property being used here.

The practical cost is that only one of the two sites can have a live backend at a time, so switching
between them is a pause-resume shuffle. Worth knowing that the other project was almost certainly
auto-pausing already — a free project pauses itself after ~7 days of low activity, which is exactly
the profile of a site in development.

⚠️ **That same auto-pause is a live risk for THIS site from Phase 5 onward, and it is not obvious.**
A paused project answers nothing: sign-in fails, progress will not load, password resets stop. And
this site generates almost no Supabase traffic by design — **guests never touch it at all**, since
progress is only saved for signed-in users. A week with few sign-ins is a week of near-zero activity,
so the live site can idle itself into an outage while looking perfectly healthy.

`.github/workflows/keepalive.yml` prevents that with one real anonymous read a day
(`npm run keepalive`, `scripts/keepalive.mjs`). It fails loudly and non-zero, because a keep-alive
that swallows its own errors is worse than none — the project pauses anyway and the green tick
disagrees.

⚠️ **GitHub disables scheduled workflows after 60 days of repository inactivity.** A quiet repo is a
quiet database, so the safeguard switches itself off in precisely the circumstances that need it.
Re-enable from the Actions tab if the repo goes dormant.

**Only prod is kept alive.** The dev project is allowed to pause; that is what makes this
arrangement work alongside the other site.

**The paid alternative was weighed and declined for now.** Pro at $25/month removes the cap, the
shuffle, and the auto-pause in one go, and makes branching viable. Logged in
[../BACKLOG.md](../BACKLOG.md) rather than taken.

### What has to be reproduced by hand, and what does not

Only the first row is free. Everything below it is dashboard work with no migration behind it,
which is the actual cost of the split.

| | How |
|---|---|
| **Project creation settings** | ⚠️ **Two of the defaults are wrong** — see below. Set them at creation. |
| Schema, RLS, policies, functions | **Free.** Replay both migrations in order — `20260817120000_initial_schema.sql`, then `20260817140000_harden_function_grants.sql`. This is what they were kept in the repo for. |
| Redirect allowlist | Two entries, below. |
| Custom SMTP | Its own Resend key, below. |
| Email rate limit | 100/hour, same as prod. |
| Signup toggle | On, once the dev Turnstile secret is in. |
| `is_admin` bootstrap | One statement, from *Granting yourself admin* above. `auth.uid()` is null in the SQL editor, which is the only place the guard trigger allows it. |
| Turnstile secret | The `amplifiedthinker-dev` widget. |

### The two creation checkboxes that must match prod

The **Security** block on Supabase's *Create a new project* screen defaults to the opposite of what
this project runs, on both boxes that matter. Set them there — a practice environment that differs
from production quietly stops being practice.

| Setting | Prod, verified in Phase 3 | Default on the creation screen |
|---|---|---|
| Enable Data API | on | on ✅ leave it |
| **Automatically expose new tables** | **off** | on ❌ **untick** |
| **Enable automatic RLS** | **on** | off ❌ **tick** |

**Why the first one bites.** The initial migration ends with
`alter default privileges … revoke all on tables from anon, authenticated`, so every new table lands
with no grants and needs an explicit `grant` beside its `create policy` — the trap already recorded
in `CLAUDE.md`. If dev auto-exposes and prod does not, a table added in Phase 6 or 7 works in dev and
fails in prod with `permission denied for table X`. **Having a working dev to compare against makes
that harder to diagnose, not easier** — it is compelling evidence for the wrong conclusion.

⚠️ **Why the second one is worse: the migration hides the divergence.** Section 4 of
`20260817140000_harden_function_grants.sql` is guarded on `rls_auto_enable` existing, and that
function only exists when *Enable automatic RLS* was chosen at creation. Apply the migration to a
project without it and the whole file still reports `Success. No rows returned`, having silently
skipped the revoke. A green result that means one thing in prod and another in dev is exactly the
class of check this project has been burned by four times.

That revoke is not cosmetic either: `rls_auto_enable()` was Phase 3 finding 10's genuine exposure —
the one function of four flagged by the Advisor that PostgREST could actually reach.

**The divergence turns out to be visible after all, and `npm run verify:rls` already shows it.**
Point `.env` at the new project and read the function block, where 401 and 404 mean different
things:

```
rls_auto_enable(): not callable by anon - HTTP 401   <- exists, refused on privileges
handle_new_user(): not callable by anon - HTTP 404   <- not exposed at all
```

A **404** is PostgREST saying it cannot see the function; that is correct for the two trigger-typed
ones. A **401** means PostgREST resolved it and refused — so the function *exists*, which only
happens when *Enable automatic RLS* was ticked. And it is 401 rather than the **400** finding 10
recorded, which is what proves section 4's revoke actually ran rather than being skipped.

So the setting and the guarded migration block are both confirmed by a check that already existed,
for free. Verified 2026-08-18: prod and dev return identical codes on all 22 assertions.

**Also leave GitHub unconnected** on that screen. It auto-deploys schema from the repo and is the
on-ramp to the branching model declined above; pasting two files once is the reviewable version.

**And check the Postgres major version** under *Advanced configuration* matches prod. A practice
database on a different version behaves differently in precisely the corners worth practising on.

### The allowlist moves rather than being copied

Previews and localhost now talk to dev, so their entries belong on dev — and leaving them on prod
would mean a laptop could drive the production database through a redirect that still resolves.

| | Site URL | Redirect URLs |
|---|---|---|
| **prod** | `https://amplifiedthinker.com` | `https://amplifiedthinker.com/**`<br>`https://sing-chen.github.io/amplifiedthinker/**` |
| **dev** | `http://localhost:4321` | `http://localhost:4321/**`<br>`https://amplifiedthinker-git-*-singchen.vercel.app/**` |

Verify each entry with the `/auth/v1/verify` probe documented above, **including the known-bad
control in the same batch**. Two entries per project is four probes and about ten seconds; it
needs no email, and Phase 3 spent a whole mail allowance learning that.

### Dev gets its own Resend key

Decided deliberately, against the cheaper option of no SMTP plus `mailer_autoconfirm`: most of the
build happens before real signups exist, and after launch the dev work needing mail is close to
none — so paying for it once, now, is worth being able to exercise the real flow.

⚠️ **A separate key, never Supabase-prod's.** One credential shared by two senders means rotating
it for one silently breaks the other — Phase 4 finding 1, in a new place. Name it `Supabase Dev`,
**Sending access** only, domain-restricted, same as prod's.

⚠️ **Both projects now draw on one Resend allowance of 100/day.** A dev test loop can exhaust it,
and the visible symptom is that *production password resets stop*. This is the single number to
watch during the phase. If it ever binds, the answer is `mailer_autoconfirm` on dev rather than a
bigger plan — dev needs accounts, not mail.

⚠️ **Supabase throttles to one email per recipient per 60 seconds** in both projects. A suppressed
send is indistinguishable from a broken one. Check this before suspecting the key, the DNS, or
anything else.

---

## The one Advisor warning that is meant to be there

**Advisors → Security** should show exactly one entry:

> `public.is_admin()` can be executed by the `authenticated` role as a `SECURITY DEFINER`
> function via `/rest/v1/rpc/is_admin`.

**Intentional. Do not "fix" it.** Two reasons:

1. **The policies need it.** Every `*_admin_all` policy calls `is_admin()`, and RLS policy
   expressions are evaluated with the querying role's privileges — so `authenticated` must hold
   `EXECUTE` or admin writes fail. `anon` was revoked in `20260817140000`, because every policy
   calling it is `to authenticated` and `anon` therefore never reaches one.
2. **Phase 7 will probably call it directly**, to decide whether to render admin nav.

It is not a leak. `is_admin()` filters on `auth.uid()`, so it only ever reports the caller's own
admin status — something they can already read from their own `profiles` row.

The standard being held here is **zero *unexplained* warnings**, not zero warnings. The eight
cleared in `20260817140000` were grants made by accident; this one is a decision with a reason
written down. If this list ever grows a second entry, that entry is signal.

**If you ever do want literal zero**, the fix is not to revoke — it is to move the function out of
the exposed schema (`create schema private; alter function public.is_admin() set schema private;`)
and recreate the six policies that reference it. Policies can call functions in unexposed schemas
perfectly well. That was weighed and deferred: it costs a migration and six policy rewrites to
remove an exposure that reveals nothing, and it would break the `/auth-test` page's check 4.

---

## Deleting accounts

Since Phase 5 an account holder can delete their own account from **Account → Delete
your account**, gated on typing their email address. That is the route for test
accounts too — it is why the control was built when it was, rather than clearing
them out of the dashboard by hand every few days.

`public.delete_own_account()` is SECURITY DEFINER and does exactly one thing:

```sql
delete from auth.users where id = auth.uid();
```

Everything else follows from foreign keys already in the schema — `profiles`,
`skill_progress`, `user_news` and `notes` all cascade. `blog_posts.author_id` is
`on delete set null`, so **a post survives its author**, which is deliberate.

**Deleting requires the password again**, and the check is enforced in the
database rather than by the page. The account panel asks for it and
re-authenticates through `signInWithPassword` — which needs a Turnstile token,
since Supabase's bot protection covers sign-in, so the widget is loaded on
`/account/` the moment the delete panel opens and never before.

⚠️ **The page asking is not the control.** The RPC is reachable directly with any
valid access token, so anyone who can read localStorage could skip every field
on the panel. The function therefore checks the JWT's **`amr`** claim — the
authentication-methods list — and refuses unless a `password` entry is less than
five minutes old.

⚠️ **`iat` would not have worked, and it is the obvious claim to reach for.** A
token refresh updates `iat`, so a stolen session refreshed a second ago looks
maximally fresh. `amr` is appended to rather than replaced, so a refresh carries
the *original* password timestamp forward — which is exactly the property needed.

**Three refusals are built in:**

- **Anonymous callers** get `28000`. Without the guard, `where id = null` matches
  nothing and reports success — worse than an error, because the caller would
  believe an account had gone.
- **A stale sign-in** gets `28000` with *"deleting an account needs a recent
  sign-in"*. ⚠️ The check **fails closed**: if the `amr` claim is missing or
  unreadable, deletion is refused rather than allowed. A token minted before this
  migration is the likely cause, and signing out and back in fixes it — which is
  what the message says.
- ⚠️ **Admins get `42501`.** `is_admin` is settable only where `auth.uid()` is null —
  this SQL editor — so an admin who deletes themselves cannot grant it back from the
  site. If they were the only admin, the site has no administrator and no route to
  appoint one. Clearing `is_admin` here first is a ten-second fix; the deletion is
  not reversible at all.

**When you still need the dashboard:** deleting somebody else's account, or your own
while you hold admin. Authentication → Users → the row's menu → Delete user. That
path cascades identically — it is the same `DELETE`.

⚠️ **A deleted user's access token stays syntactically valid until it expires.**
`auth.js` signs out immediately after the call for exactly this reason. If you delete
a user from the dashboard while they have a tab open, that tab keeps presenting a
token for an account that no longer exists, and every request fails in a way that
reads as a bug. It resolves itself when the token expires or the page reloads.

## Names, and the two places they live

⚠️ **`display_name` exists twice, in two different stores, and only one of them
is constrained.** This catches people out, so it is worth having straight.

| | Where | Constrained? | Read by |
|---|---|---|---|
| `raw_user_meta_data ->> 'display_name'` | `auth.users` — Supabase's table | **No.** Supabase owns it | The nav greeting, the avatar letter, and the **email templates** |
| `profiles.display_name` | ours | **`not null`** since `20260819140000` | Anything server-side; Phase 9's dashboard |

`public/auth.js` writes the first at `signUp()` time — the only moment that
works, since the confirmation email is rendered when the mail is triggered. The
signup trigger copies it into the second.

**So a nameless signup produces a profile with a derived name and a JWT with
none.** The dashboard's *Create new user* is exactly this case. The client-side
fallback is therefore still load-bearing and must not be removed on the strength
of the constraint.

### ⚠️ Backfilling existing accounts — and why the migration is not enough

`20260819140000_display_name_not_null.sql` backfills **`profiles.display_name`
only**. It does not touch `auth.users`, because that is Supabase's table and a
migration has no business rewriting it.

**So after that migration an account created before the name field has a derived
profile name and still no name in `raw_user_meta_data`** — which is the copy the
email templates and the nav greeting read. The visible result is emails that
open generically and a nav that falls back to the address.

**This is a data fix, not a migration**, so it belongs to whichever project
holds the affected rows rather than to both on principle. Run it *after* the
migration:

```sql
update auth.users
set raw_user_meta_data =
      coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('display_name', p.display_name)
from public.profiles p
where p.id = auth.users.id
  and coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), '') = ''
returning auth.users.email, raw_user_meta_data ->> 'display_name' as name;
```

⚠️ **The `returning` is the point.** A zero-row result means it changed nothing,
and without it that is indistinguishable from success. An earlier version of
this statement filtered on `like '%+%@gmail.com'` and silently skipped the one
account that actually needed it.

**It copies the DERIVED name**, which is a placeholder — `singfenchen@gmail.com`
becomes `Singfenchen`. To set a real one, fix `profiles.display_name` first and
then run the above, or substitute the literal:

```sql
update public.profiles set display_name = 'Sing'
where id = (select id from auth.users where email = 'you@example.com');
```

Only pre-existing accounts need any of this. Every signup since 2026-08-19
supplies a name at `signUp()` time, which lands in both stores unaided.

**The derivation, when a signup supplies no name:** the email local part before
any plus-addressing, title-cased, clipped to 60 characters —
`singfenchen+p5b@gmail.com` becomes `Singfenchen`. An address that derives to
nothing gets `Reader`. It is a placeholder so the column can be `not null`, not
a guess at anybody's name.

**Why derive rather than reject.** `not null` alone would fail the trigger,
which runs `after insert on auth.users` — so the auth user rolls back too and
the account is simply not created, with an opaque *Database error saving new
user*. That would take out the dashboard's user creation and any future OAuth
provider along with the hostile case it was aimed at.

## Granting yourself admin

`is_admin` is deliberately not self-settable — a trigger rejects any change made by
the account it belongs to, which is what stops a signed-in user from promoting
themselves. The only way in is a connection where `auth.uid()` is null, i.e. the SQL
editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Nothing consumes `is_admin` until Phase 7, so this can wait.

---

## Verifying

Two halves, because neither covers the other.

### Signed out — `npm run verify:rls`

```bash
npm run verify:rls
```

Needs `.env` (copy `.env.example`). Talks to PostgREST over plain fetch with the anon
key and asserts, table by table, that nothing reads and nothing writes. It refuses to
run if handed a `service_role` key, which would bypass RLS and report a green board
while proving nothing.

Two different passing states, and the distinction matters:

- **`denied`** — `profiles`, `skill_progress`, `user_news`, `notes`. `anon` holds no
  SELECT grant at all, so PostgREST refuses before RLS is consulted. Permanent.
- **`empty`** — the five content tables. `anon` may SELECT; the tables are empty, so
  the result is `[]`. **This assertion is time-limited**: from Phase 6, `news_stories`
  legitimately returns published rows to anonymous callers. That is the design, not a
  regression. Only the `denied` rows are an invariant.

### Signed in — `/auth-test`

`npm run dev` → <http://localhost:4321/auth-test>. The script cannot reach the
signed-in half: session handling, the signup trigger, the `is_admin` guard, and the
redirect allowlist, which only fails on a real origin in a real browser.

### ⚠️ Testing a FAILURE against Supabase — supabase-js retries, and it will fool you

Any test that asserts something fails has to defeat a retry layer that is on by
default and announces itself nowhere. In supabase-js 2.112.3:

| | |
|---|---|
| Enabled | `e.retry ?? true` — opt **out**, not opt in |
| Methods retried | `GET`, `HEAD`, `OPTIONS` only |
| Statuses retried | `520`, `503` — plus any thrown fetch error |
| Attempts | up to 3 |
| Backoff | `Math.min(1000 * 2**e, 30000)` → 1s, 2s, 4s |

Two things follow.

**DevTools "Offline" is not a usable way to test this.** Three retries is ~7 seconds
of silence. Toggling the throttle back inside that window lets the retry succeed, and
the operation completes for real — so the test reports success and looks like a bug in
your code. This wasted an hour in Phase 5.

**Rejecting one call is not enough.** Reject *every* call of that method for the rest
of the operation. `client.rest.fetch` is the patch point — `from()` reads it fresh on
each call, so patching it before the run covers every request in the sequence:

```js
const c = window.AmplifiedAuth.client();
const realFetch = c.rest.fetch;
const calls = [];
let posted = false;
c.rest.fetch = function (url, init) {
  const m = (init && init.method) || 'GET';
  calls.push(m);
  if (m === 'POST') { posted = true; return realFetch(url, init); }
  if (posted && m === 'GET') return Promise.reject(new TypeError('injected'));
  return realFetch(url, init);
};
// ... run the thing, then: c.rest.fetch = realFetch;
```

**Always assert that the failure happened**, not just that an error was reported.
Count the calls and measure the clock: four GETs after the POST and ~7000ms is what
proves the read-back was genuinely broken. Without those two numbers, a passing
failure-test says nothing.

Writes are never retried (`POST`, `PATCH`, `DELETE` are outside the safelist), so
`public/progress.js` keeps its own pending-and-reschedule. Do not remove it believing
the library covers it.

**The page takes the project URL and anon key at runtime**, in two fields, stored in
`localStorage` for that origin. It does *not* read them from the build. That is what
lets it run unchanged on all four origins — localhost, the Vercel preview,
`amplifiedthinker.com` and the Pages origin — with **no environment variables
configured anywhere**. The alternative was `PUBLIC_` vars in three build configs
(`.env`, Vercel's dashboard, and `.github/workflows/pages.yml`) for a page marked for
deletion, plus remembering to unpick all three afterwards.

Two consequences worth knowing:

- `localStorage` is per-origin, so you paste the credentials once per origin — four
  times in total, and never into a config file.
- After merge the page is live but **inert**: with no credentials baked in it does
  nothing at all for a stray visitor. It also refuses a `service_role` or `sb_secret_`
  key, mirroring the guard in `verify-rls.mjs`, because such a key would bypass RLS and
  turn every check green while proving nothing.

Run it on **both** production origins after merge, not just Vercel. Phase 1 and Phase 0
each ended with a defect that only a human looking at a browser found.

Delete `src/pages/auth-test.astro` at the end of Phase 5, once `auth.js` and
`supabase-client.js` exist and the real sign-in UI is in `nav.js`.
