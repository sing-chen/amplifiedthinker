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

SQL cannot reach these. Both are Auth configuration.

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
