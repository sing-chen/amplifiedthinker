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

#### The Brevo side

The account is **Amplified Thinker**, and the domain is already authenticated: the
`brevo-code` TXT and both `brevo1`/`brevo2._domainkey` CNAMEs resolve. Nothing about domain
authentication needs doing. See [../docs/email-dns-baseline.md](../docs/email-dns-baseline.md).

⚠️ **An SMTP key already exists, and Supabase must not use it.** The key created on
2026-07-06 is named **"Gmail Send As"** and is in use by Gmail's *Send mail as* feature for
the `singchen@amplifiedthinker.com` alias. Two reasons it cannot be reused:

1. **Its value is not recoverable.** Brevo shows an SMTP key once, at creation. Gmail stores
   it and will not display it back.
2. **Sharing one key couples two unrelated senders.** Revoking or rotating it for Supabase
   would silently break Gmail's alias sending, and vice versa — a failure that surfaces as
   "my email stopped working" with nothing pointing at the cause.

Create a **second** key at <https://app.brevo.com/settings/keys/smtp>, named for its use
(`Supabase Auth`), **Standard** variant, **No expiration**. Copy the value immediately; it is
shown once.

⚠️ **"No expiration" is not the same as never expiring.** Brevo expires any SMTP key after **90
consecutive days of inactivity**, whatever its expiry date. Choosing no fixed expiry removes one
of the two clocks; it cannot remove that one.

**The symptom, because it does not look like what it is:** auth mail stops, and the Supabase auth
logs report an SMTP *authentication* failure — indistinguishable from a wrong password, with a
configuration that reads as correct. If auth email breaks after a quiet period and nothing was
changed, check the key before anything else. Tracked in [../BACKLOG.md](../BACKLOG.md).

**The relay values are already proven on this domain.** Gmail → Settings → Accounts and Import
shows the alias sending *"through smtp-relay.brevo.com, secured connection on port 587 using
TLS"* — so that host and port have been carrying real mail for this domain since July, rather
than being copied out of Brevo's documentation. The SMTP **login** (of the form
`<id>@smtp-brevo.com`) is on the Brevo SMTP page; take it from there.

#### The Supabase side

| Field | Value |
|---|---|
| Sender email | `noreply@amplifiedthinker.com` |
| Sender name | `Amplified Thinker` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | the Brevo SMTP login |
| Password | the **new** `Supabase Auth` key |

**Why `noreply@` rather than the existing `singchen@`:** the alias is a human identity that a
person reads and replies to; auth mail is machine mail. Pointing both at one address means
password-reset replies land in a personal inbox. Brevo accepts any address on an
authenticated domain, so this needs no extra validation step. Note that nothing routes
`noreply@` inbound — replies bounce, which is the intent, but it is a decision rather than an
oversight.

#### Turn off Brevo's marketing features — they are on by default and wrong for auth mail

**Brevo → Transactional → Settings.** Three defaults apply to transactional sends and all three
should be off. Verified present in a real Supabase confirmation email on 2026-08-17:

| Setting | What it does to an auth email |
|---|---|
| **Click tracking** | Rewrites the confirmation link to `…sendibt3.com/tr/cl/…`. The token — a bearer credential — travels through a third party and into their click logs, on a URL shaped like phishing. Corporate filters that strip redirector links break auth entirely, which hits the NRD-blocked audience hardest since they have one route in. |
| **Open tracking** | Injects a hidden `<img>` beacon. Privacy cost, small spam-score cost, no benefit. |
| **`List-Unsubscribe` header** | Gmail shows an Unsubscribe control next to the sender. **A user can unsubscribe from their own password reset** and may then be suppressed, after which auth mail silently stops — unrecoverable by them, and invisible to you. |

**How to confirm it is fixed:** send one signup, open *Show original*, and check the confirm link
points at `https://<ref>.supabase.co/auth/v1/verify?…` rather than a tracking domain. Gmail's SPF /
DKIM / DMARC summary will not tell you — it reports provenance, not content, and it read all-green
while every one of these was active.

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
