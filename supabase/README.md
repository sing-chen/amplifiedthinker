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

### 2. Email confirmation

Leave whatever the project default is for Phase 3 — it only affects how tedious the
throwaway test account is. **Phase 4 is where this gets decided properly**, by pointing
SMTP at Brevo before any real user can trigger a password reset. Supabase's built-in
mailer is rate-limited and explicitly not for production.

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
