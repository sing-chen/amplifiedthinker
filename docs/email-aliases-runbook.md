# Email aliases runbook — `contact@`, `dmarc@`, and retiring Brevo

**Written:** 2026-08-20 · **Reproduce the DNS state at any point:** `npm run verify:email`
**Baseline and restore reference:** [email-dns-baseline.md](email-dns-baseline.md) ·
**SMTP background:** [../supabase/README.md](../supabase/README.md)

Replaces `singchen@amplifiedthinker.com` with `contact@amplifiedthinker.com` as the site's contact
route, adds `dmarc@` for aggregate reports, and retires Brevo — the last vendor with exactly one
job. Auth mail on `noreply@` is already live and **this runbook does not touch it**.

⚠️ **The whole thing rests on one property: SPF, DKIM and DMARC authenticate a *domain*, not an
address.** Every alias on `amplifiedthinker.com` inherits records that already exist and pass. No
stage below adds a DNS record. Stages 6 and 7 *edit* two, and those are the only dangerous steps
here.

---

## Handoff — read this before doing anything

**This file is the state.** There is no other tracker. Whoever does a stage updates its status row
in the same sitting, in this file, and says what they observed — not "done" but what the check
printed. A stage left at `In progress` with no note is the failure mode this section exists to
prevent.

| # | Stage | Owner | Status | Notes from the person who did it |
|---|---|---|---|---|
| 0 | Confirm the starting state | Human | ✅ Done | 2026-08-20, `npm run verify:email` → **21/21, 1 warning**. The warning is the DMARC `rua` pointing at `dmarc_rua@onsecureserver.net`, which is stage 6's job and is expected here. No deviation from the state table below |
| 1 | Cloudflare inbound routes | Human | ✅ Done | 2026-08-20. Catch-all was already **Drop + Disabled** with one rule only (`singchen@`), so `noreply@` has no inbound route and the "replies bounce" claim in `supabase/README.md` is **correct** — the trap this stage checks for is not live, and nothing needed changing. `contact@` and `dmarc@` added, both Active, 3 rules total, `singchen@` untouched. **Both test messages delivered.** The header goes *Syncing* after a save; tests were run once it returned to *Enabled* |
| 2 | Resend API key | Human | ✅ Done | 2026-08-20. **AUP checked and the fork was not taken** — personal one-to-one correspondence is not prohibited; the permitted use is *replies to inbound mail*, and cold outreach from this alias would be a real violation. Key `Gmail send-as` created, Sending access, restricted to `amplifiedthinker.com`, stored. Three keys now share **one 100/day account allowance** |
| 3 | Gmail send-as for `contact@` | Human | ✅ Done | 2026-08-20. Relaying through Resend, *Treat as an alias* checked, **set as the account default**. Delivered message measured: `spf=pass` aligned, `dkim=pass header.s=resend`, `dmarc=pass` under `p=QUARANTINE`, `From:` clean with no "via". Delivered to a non-Google mailbox too. **Passes on both mechanisms — stronger than `singchen@` ever was through Brevo** |
| 4 | Move the `singchen@` send-as off Brevo | Human + Claude | ✅ Done | 2026-08-20. **Scope changed mid-stage: repointed, not deleted** — `singchen@` stays as a personal outbound identity, and retiring the vendor never required retiring the address. Both send-as entries now relay through `smtp.resend.com` on one key; *Treat as an alias* fixed on `singchen@`, which had been *"Not an alias"*; `contact@` remains default. Delivered test measured identical to `contact@`. **Brevo now relays nothing for anybody.** Gate comment, `supabase/README.md` and `recovery.md` all amended from *must stay* to *retained pending teardown*. `verify:email` still 21/21 |
| 5 | Swap the site over | Claude | ✅ Done | 2026-08-20, `4d28458`, live on both origins. 13 lines, 6 files, all `?subject=` values preserved. Resend's row in the privacy processor table widened to cover contact replies. Supabase templates pasted by hand. ⚠️ **Two pre-existing Astro collapsed-space defects found and fixed while verifying** — instances 3 and 4 of a trap a grep cannot detect. Promptly sibling **⊘ skipped by decision**, pre-launch, but still wrong at its launch |
| 6 | Repoint DMARC reports | Human | ✅ Done | 2026-08-20. `rua` now `dmarc@amplifiedthinker.com`; `p=quarantine`, `adkim=r`, `aspf=r` untouched. Gate reads **20/20, no warnings** — ⚠️ **the count drops from 21 because the warning was itself a result entry.** This file predicted "21/21 with the warning gone", which cannot happen; corrected here and in stage 7, whose target is now **16/16**. First aggregate report expected within ~24h |
| 7 | Brevo teardown **and account closure** | Human + Claude | ☐ Not started | **After a soak — see the stage.** Three parts now: 7a safe record deletions, 7b the apex SPF edit alone, 7c close the account last |

**Statuses:** ☐ Not started · ◐ In progress · ✅ Done · ⊘ Skipped (say why)

**Two levels, on purpose.** The table above is the *stage* state and is what a handoff reads first.
Inside each stage, a **Tick as you go** list carries the individual steps as `- [ ]` checkboxes —
tick them in the file as you do them, so an interrupted stage says exactly where it stopped rather
than only that it started. A stage is not ✅ in the table until every box under it is ticked or
explicitly struck out.

**The ordering is not cosmetic in two places.** Stage 1 must precede stage 3, because Gmail verifies
an alias by emailing it and nothing arrives without a route. Stage 3 must precede stage 4, because
until `contact@` provably sends, `singchen@` is the only working outbound identity there is.
Everything else can move.

**Stage 5 is the only one that touches the repo**, and it is the only one a Vercel rollback can
undo. Stages 1–4, 6 and 7 are dashboard and DNS state, invisible to git and unrecoverable by
deploy.

---

## Stage 0 — What is true before you start

Confirm rather than assume; the runbook was written against this state.

```bash
npm run verify:email
```

Expect **21/21 passing**, with one warning about DMARC reports going to a third party — that
warning is stage 6's job and should still be there. If the count is not 21, stop and read
[email-dns-baseline.md](email-dns-baseline.md); something moved since this was written.

| Thing | State today | Touched by |
|---|---|---|
| Inbound mail | Cloudflare Email Routing, apex MX, forwards to `singfenchen@gmail.com` | Stage 1 |
| `noreply@` auth mail | Supabase → Resend, live, verified by delivery | **Nothing here** |
| `singchen@` outbound | Gmail *Send mail as* → `smtp-relay.brevo.com` | Stages 3–4 |
| `singchen@` inbound | Cloudflare route → Gmail | **Kept.** See below |
| Brevo DNS records | 4 assertions in the gate, all passing | Stage 7 |
| DMARC `rua` | `dmarc_rua@onsecureserver.net` — a GoDaddy leftover nobody reads | Stage 6 |

⚠️ **"Remove `singchen@` as a contact route" is not "delete the address."** What gets deleted is the
*send-as identity* in Gmail (stage 4). The *inbound route* in Cloudflare stays, permanently. The
address is published on two live origins right now, sits in the two Supabase email templates, and
has been handed out since July; a route costs nothing and silently dropping mail from someone who
finally uses it is a worse outcome than any tidiness gained. These are two different dashboards and
conflating them is the easiest mistake in this document.

**Tick as you go**

- [x] `npm run verify:email` run — **21/21**, and the DMARC third-party warning still present
- [x] Any deviation from the state table above recorded in the handoff table

**Observed 2026-08-20:** 21/21 passed, 1 warning. Cloudflare authoritative on
`marvin`/`susan.ns.cloudflare.com`, all three inbound MX present, exactly one apex SPF record using
**2 of 10** lookups, Resend's bounce MX and `resend._domainkey` (218 chars) live, both Brevo
selectors still resolving, `p=quarantine` with `aspf=r`, and the apex still in Vercel space
(`216.198.79.1`, `64.29.17.1`). The single warning is the `rua` address — stage 6.

---

## Stage 1 — Cloudflare: inbound routes · Owner: Human

**Cloudflare dashboard → `amplifiedthinker.com` → Email** (the left-nav item has been labelled both
*Email* and *Email Routing* across redesigns; same place) **→ Routing rules.**

Custom addresses are created from the blue **+ Create routing rule** button on the *Routing rules*
tab — not from a separate "custom addresses" screen, whatever this runbook said before 2026-08-20.
Add two:

| Custom address | Action | Destination |
|---|---|---|
| `contact` | Send to an email | `singfenchen@gmail.com` |
| `dmarc` | Send to an email | `singfenchen@gmail.com` |

The destination is already a **verified** destination address, so neither of these triggers a
Cloudflare verification email. If one asks you to verify, you have typed the Gmail address wrong.

**Leave `singchen` exactly as it is.** Do not delete, disable or re-target it.

⚠️ **The page header flips from *Enabled* to *Syncing* as soon as a rule is saved.** Wait for it to
return to *Enabled* before testing. A message sent during the sync window can bounce, and the bounce
reads as an unknown-recipient error — indistinguishable from a typo in the address you just created.

⚠️ **Check the catch-all rule while you are on this screen, and record what it says in the handoff
table.** If catch-all is enabled and set to *Send to*, then `noreply@` already has an inbox —
which contradicts [../supabase/README.md](../supabase/README.md), where bouncing replies to auth
mail is a stated design decision rather than an accident. It should be **disabled**, or set to
**Drop**. If it is not, that is a pre-existing defect found by this runbook, not something stage 1
caused; fix it here and note it.

⚠️ **Turning catch-all off is itself a behaviour change.** Every address on the domain that is not
in the custom list stops being delivered and starts bouncing. That is the intended end state, but
if catch-all has been on since July then something may have been arriving through it that nobody
listed — a vendor signup at `billing@`, say. Skim the Gmail inbox for `@amplifiedthinker.com`
recipients other than `singchen@` and `noreply@` before switching it off, and add any survivors as
custom addresses in the table above.

**No DNS record changes.** The apex MX records already carry every address on the domain. If you
find yourself editing DNS in this stage, stop — you are in the wrong place.

**Verify:** send a message from any outside account to `contact@amplifiedthinker.com` and to
`dmarc@amplifiedthinker.com`. Both should land in the Gmail inbox within seconds. Inbound is now
done and nothing about outbound has changed yet.

⚠️ **This stage is the one piece of the system no gate can watch, permanently.** Routing rules live
in Cloudflare's application, not in DNS, so `npm run verify:email` cannot see them — it will keep
printing green with every custom address deleted. Meanwhile the privacy page asserts that `contact@`
is a monitored address. The only check that exists is sending a message to it, so send one after any
Cloudflare work, and treat "the gate passed" as saying nothing whatsoever about inbound.

**Tick as you go**

- [x] ~~Inbox skimmed for other `@amplifiedthinker.com` recipients before touching catch-all~~ —
      **not applicable**: catch-all was already off, so nothing was arriving at an unlisted address
      and nothing needed touching
- [x] Custom address `contact` → `singfenchen@gmail.com` created — Active
- [x] Custom address `dmarc` → `singfenchen@gmail.com` created — Active
- [x] `singchen` route left in place, untouched — still Active, 3 rules total
- [x] Catch-all checked, set to disabled or Drop, and **recorded in the handoff table**
      — **2026-08-20: already Drop *and* Disabled. No change made**
- [ ] No DNS records were edited in this stage
- [x] Test message to `contact@` arrived in Gmail — 2026-08-20
- [x] Test message to `dmarc@` arrived in Gmail — 2026-08-20

**Rollback:** delete the two custom addresses. Nothing else depends on them yet.

---

## Stage 2 — Resend: an API key for the relay · Owner: Human

**resend.com → API keys → Create API key.**

| Field | Value | Why |
|---|---|---|
| Name | `Gmail send-as` | Names the consumer, so a future rotation knows what it breaks |
| Permission | **Sending access** | Not Full access. A leaked sending key can send and nothing else |
| Domain | `amplifiedthinker.com` | Restricts it to the one verified domain |

⚠️ **A separate key from Supabase's, not a reuse.** One credential shared by two senders means
rotating it for one silently breaks the other — the precise trap Phase 4 hit with the Brevo keys.
The cost of a second key is nothing; the cost of discovering this is a dead password-reset flow.

**The key is shown once.** Put it in the password manager before leaving the page. It does not go in
`.env`, in Vercel, or anywhere under `public/` — nothing in this repo reads it. Gmail is the only
consumer.

**Two things to have checked before relying on this**, both carried over from
[../BACKLOG.md](../BACKLOG.md) and neither resolved by doing the work:

- **Resend's acceptable-use policy on human correspondence — checked 2026-08-20, and it is fine.**
  The [AUP](https://resend.com/legal/acceptable-use) is a prohibition list: spamming, phishing,
  illegal activity, restricted industries, low quality, malicious content, harassment, interference.
  It draws **no distinction** between transactional, marketing and personal mail, and says nothing
  about SMTP relays, personal mailboxes or third-party clients. Personal one-to-one correspondence
  is not prohibited.

  ⚠️ **The one clause to keep in view is *"all mail must be sent to recipients who have explicitly
  opted in"*.** This alias satisfies it in the only way that matters — it replies to people who
  wrote to `contact@` first, which is the strongest form of solicited mail there is. **Cold outreach
  from this alias would be a genuine violation.** The permitted use is replies, not sending.

  ⚠️ **The risk that remains is blast radius, not permission.** This key and Supabase's auth key
  live in the **same Resend account**, so any enforcement action lands on the account and takes
  password resets down with it. That is a reason to keep this alias's sending boring — replies to
  inbound mail, nothing bulk, no lists — and a second reason `whatsnew@` is not in this runbook.

  **If it does not permit this, the runbook forks and you should stop here rather than improvise.**
  Stages 1, 5 and 6 still stand on their own — `contact@` can be a receive-only address, with replies
  going out from Gmail's own identity, which is worse but not broken. The outbound half then needs a
  relay that is not Resend: keeping Brevo (cancels stage 7, and re-inherits the 90-day key expiry) or
  Google Workspace on the domain (paid, and makes Gmail authoritative for the mailbox rather than a
  forwarding destination) are the two realistic answers. Both are decisions, not steps; bring the
  finding back rather than picking one mid-stage.
- **The free allowance is 100/day and is now shared by three keys** — `Supabase Auth` (prod),
  `Supabase Dev`, and `Gmail send-as`. A heavy test loop against dev can exhaust the day, after which
  real password resets **and** your own correspondence both stop, each looking like an SMTP fault in
  its own right. ⚠️ **The allowance is per account, not per key**, so restricting or rotating one key
  does nothing to protect the others from it.

**Verify:** nothing to verify yet; the key is unused until stage 3.

**Tick as you go**

- [x] Resend's acceptable-use policy read, and human correspondence is permitted
      — **2026-08-20: not prohibited. Proceeding.** The fork below was not taken
- [x] Key created: name `Gmail send-as`, **Sending access**, restricted to `amplifiedthinker.com`
      — 2026-08-20. ⚠️ The API keys list shows no domain column, so the restriction cannot be
      confirmed from that screen; open the key itself to check it
- [x] Confirmed this is a **new** key, not Supabase's — 2026-08-20, `Gmail send-as` created
      alongside the existing `Supabase Auth` and `Supabase Dev`, three distinct keys
- [x] Key stored in the password manager (it is shown once) — 2026-08-20

**Rollback:** revoke the key.

---

## Stage 3 — Gmail: send as `contact@` · Owner: Human

**Gmail → gear icon → See all settings → Accounts and Import → "Send mail as:" → Add another email
address.** This opens a **popup window**; if nothing appears, it was blocked.

**First screen:**

| Field | Value |
|---|---|
| Name | `Sing Chen - Amplified Thinker` |
| Email address | `contact@amplifiedthinker.com` |
| Treat as an alias | **✅ checked** |

**The display name is a decision, not a formality — settled 2026-08-20.** It is unauthenticated:
SPF, DKIM and DMARC all act on the address and the domain and never on the name, so it changes
freely and needs no re-verification. Three things shaped the choice:

| Ruled out | Why |
|---|---|
| `Amplified Thinker` | Collides with the **Supabase sender name on `noreply@`**. A human reply and an automated password reset would look identical in the inbox, and the address is the part nobody reads |
| `Amplified Thinker` (again) | Undercuts copy that is deliberately personal — *"It reaches a person, not a ticket queue"* (`privacy.html` §14), *"answered by the person who wrote them"* (`terms.html`). Same class of drift as the *"Never a newsletter"* problem |
| `Sing Chen @ Amplified Thinker` | Works, but `@` is an RFC 5322 *special* needing quoting, **and a display name containing `@` is the classic spoofing shape** that some corporate gateways score. No gain over a hyphen, and this site's audience is specifically people behind corporate filters |

⚠️ **Commas, `@` and parentheses are all specials and all require quoting**; Gmail adds it silently,
so the trap is invisible until some other client renders it badly. `-` and `|` are valid atom
characters and need no quoting at all, which is why the chosen name uses a hyphen.

**Three senders, three visibly different names — and that is the rule, not an accident.** Asked on
2026-08-20 whether `singchen@` should also become *Sing Chen - Amplified Thinker*, the answer was
no, for the same reason `contact@` is not called *Amplified Thinker*:

| Address | Display name | Purpose |
|---|---|---|
| `contact@` | `Sing Chen - Amplified Thinker` | The site's published address |
| `singchen@` | `Sing Chen` | Personal correspondence, where site branding reads oddly |
| `noreply@` | `Amplified Thinker` | Machine mail |

⚠️ **The display name is the only part a recipient reliably sees.** Two identities sharing one name
are indistinguishable in a thread, in a Sent folder and in someone else's inbox — the address, which
is the only thing separating them, is the part nobody reads. If two senders do not need different
names, that is evidence they did not need to be two senders.

*Treat as an alias* checked means replies to mail sent to `contact@` go back out **as** `contact@`.
Unchecked is the "sending on behalf of another person" case and is not what this is. Next Step.

**Second screen — the SMTP relay:**

| Field | Value |
|---|---|
| SMTP Server | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` — the literal word, not an address, the same string for every Resend account |
| Password | the stage 2 API key |
| Secured connection | **TLS** (the radio that pairs with 587; SSL pairs with 465) |

Add Account. Gmail emails a confirmation code to `contact@` — which forwards, via stage 1, into the
inbox you are sitting in. Enter the code, or click the link in the message.

⚠️ **If no code arrives, the fault is almost certainly stage 1, not this screen.** Gmail reports
nothing useful about a verification message that had nowhere to go. Confirm the Cloudflare route
delivers before touching any SMTP field.

**Verify — by delivery, not by the settings page looking right.** Send two messages *from* the new
alias:

1. To `singfenchen@gmail.com`. Open it, **⋮ → Show original**, and read the header block.
2. To a mailbox on some other provider, if you have one. Confirms real-world acceptance rather than
   Google accepting its own.

| Check | Expected |
|---|---|
| `From:` | `contact@amplifiedthinker.com`, with **no** "via" annotation |
| `smtp.mailfrom` | `…@send.amplifiedthinker.com` — Resend's custom Return-Path |
| SPF | `pass`, and aligned |
| DKIM | `pass`, `header.s=resend` |
| DMARC | `pass` |

⚠️ **Gmail threads the sent copy with the delivered one, and *Show original* on the wrong one proves
nothing.** The sent copy begins `MIME-Version:` and has no `Received:`, `Authentication-Results:` or
`DKIM-Signature:` at all — those are added by the *receiving* server, so a copy that never reached
one cannot carry them. It still shows a correct `From:`, which is what makes it convincing. Open the
inbox copy specifically — `in:inbox subject:"..."` — and confirm the dump starts `Delivered-To:`
before reading anything else. Hit on 2026-08-20.

⚠️ **Two DKIM signatures will appear and only one of them counts.** The second is
`d=amazonses.com`, Amazon signing its own outbound. It passes, it is not yours, and it cannot align
with `header.from` — so a raw source will still show `dkim=pass` after a broken selector has taken
the real signature down. Read the selector, not the verdict.

**Set the default.** Back on *Accounts and Import*, decide whether `contact@` becomes the default
send-as address. Recommended: yes, once verified — it makes forgetting to switch identity
impossible rather than merely unlikely.

**Tick as you go**

- [x] Send-as added, **Treat as an alias** checked — 2026-08-20, confirmed via *edit info*
- [x] SMTP set to `smtp.resend.com` / `587` / `resend` / the stage 2 key / **TLS**
      — proven by delivery: the message left `a3-28.smtp-out.eu-west-1.amazonses.com`, not Google
- [x] Confirmation code received and entered — 2026-08-20, via the link rather than the code.
      ⚠️ The message carries **two** near-identical URLs: `/mail/f-` confirms, `/mail/g-` **cancels**
- [x] Test sent to `singfenchen@gmail.com`, **Show original** read — 2026-08-20
- [x] `From:` is `contact@amplifiedthinker.com` with **no** "via" annotation
- [x] `smtp.mailfrom` is `…@send.amplifiedthinker.com`
- [x] `spf=pass` · `dkim=pass` with **`header.s=resend`** (not the amazonses signature) · `dmarc=pass`
- [x] Test sent to a non-Google mailbox and delivered — 2026-08-20
- [x] Default send-as address decided — `contact@` **is now the default**. ⚠️ Mail composed from
      this account therefore leaves as `contact@` unless the identity is changed by hand, which is
      the intended behaviour but is a change to every outbound message, not only site correspondence

**Measured on the delivered message, 2026-08-20:**

| | |
|---|---|
| `From:` | `Sing Chen <contact@amplifiedthinker.com>` — no "via" |
| Sent by | `a3-28.smtp-out.eu-west-1.amazonses.com`, Message-ID rewritten to `…@eu-west-1.amazonses.com` |
| `smtp.mailfrom` | `…@send.amplifiedthinker.com` |
| SPF | `pass`, and **aligned** under `aspf=r` |
| DKIM | `pass`, `header.i=@amplifiedthinker.com`, **`header.s=resend`** |
| DKIM (second) | `pass`, `d=amazonses.com` — Amazon's own, cannot align, does not count |
| DMARC | `pass`, `p=QUARANTINE`, `header.from=amplifiedthinker.com` |

⚠️ **This alias is strictly more robust than the one it replaces.** DMARC passes here on **both**
mechanisms independently; `singchen@` through Brevo passed on **DKIM alone**, because Brevo bounced
from its own domain and SPF was never evaluated against this one. Stage 4 therefore removes a weaker
identity than the one it leaves behind — the opposite of the usual migration risk.

**Rollback:** delete the send-as entry. `singchen@` is untouched and still works; this stage adds an
identity and removes none.

---

## Stage 4 — Move the `singchen@` send-as off Brevo · Owner: Human, then Claude

**Revised 2026-08-20.** This stage originally *deleted* the `singchen@` send-as. It now **repoints**
it at Resend instead. The address stops being a published contact route at stage 5, but it stays
useful as a personal outbound identity — correspondence where `contact@` would read oddly — and
keeping it costs one settings change rather than a new key, a new record or a new verification.

⚠️ **Brevo is retired either way, which is the point.** Nothing about stage 7 changes: once this
entry relays through Resend, Brevo's SMTP key and its four DNS records are doing nothing for anybody.
Retiring the *vendor* never required retiring the *address*, and conflating the two is what made
deletion look necessary.

**Only after stage 3 has been verified by a delivered message.** That is what makes this safe: the
Resend path is already proven on `contact@`, so if the repoint misbehaves the fallback is to delete
this entry rather than to debug it.

**Gmail → Settings → Accounts and Import → "Send mail as:" → the `singchen@amplifiedthinker.com`
row → edit info.** Step through to the SMTP screen and replace the Brevo block:

| Field | Was | Becomes |
|---|---|---|
| SMTP Server | `smtp-relay.brevo.com` | `smtp.resend.com` |
| Port | `587` | `587` |
| Username | the Brevo login | `resend` |
| Password | the Brevo SMTP key | the **same** `Gmail send-as` key from stage 2 |
| Secured connection | TLS | TLS |

**No re-verification.** Gmail verifies an *address*, and this one was verified in 2026; changing the
relay underneath it does not re-open that. Expect no confirmation email, and treat one arriving as a
sign the address field was edited by mistake.

⚠️ **One key for two identities is deliberate here, and it is not the trap stage 2 warned about.**
That warning was about sharing a credential between *Supabase* and Gmail, where rotating for one
silently breaks the other and the failure is a dead password-reset flow. Both send-as entries live
in the same Gmail account and fail together, visibly, for one person. A third key would add
rotation surface for no isolation gain.

**While you are in there: the entry reads "Not an alias."** It was created with *Treat as an alias*
unchecked, so Gmail will not auto-select it when replying to mail addressed to `singchen@`. Check
the box unless there is a reason not to — `contact@` is configured the other way, and having the two
behave differently is a surprise waiting to happen.

Brevo now relays nothing for anybody. Its DNS records are still published and the gate still passes
21/21 — because records resolving is all it can measure.

**Then, Claude:** the gate's Brevo section is now saying something untrue with a green tick beside
it. [../scripts/verify-email-dns.mjs](../scripts/verify-email-dns.mjs) heads that block
*"Brevo (Gmail 'Send mail as' alias only, since the Resend switch)"* and its comments explain at
length that the records are load-bearing for an alias that no longer exists. Reword the heading and
the comment to *retained pending teardown, unused since <date>*, leaving every assertion in place.

**Two prose docs go stale at the same instant and must be amended in the same commit**, because the
soak before stage 7 could run for weeks and both currently instruct a reader to keep Brevo for a
reason that has just stopped being true:

| File | What it says now |
|---|---|
| [../supabase/README.md](../supabase/README.md) | *"Brevo's DNS records must stay"* — Gmail still relays through them |
| [../docs/recovery.md](recovery.md) | *"Brevo looks like a leftover and is not"* |

Amend both to *unused since `<date>`, retained pending teardown*; they are **deleted** at stage 7,
not now. The distinction matters: during the soak the records genuinely must stay, so the
instruction is still right and only its justification is wrong.

⚠️ **This is a docs-truth edit, not a behaviour change, and it matters because the file's whole job
is to stop someone deleting those records by mistake.** Once the stated reason is false, the next
reader either deletes them anyway or trusts a wrong explanation. Both are worse than an amber note.

**Verify:** `npm run verify:email` still prints 21/21. Nothing about the zone changed.

**Tick as you go**

- [ ] Stage 3 verified **by a delivered message** before starting this stage
- [x] `singchen@` send-as repointed to `smtp.resend.com` / `587` / `resend` / the stage 2 key / TLS
      — 2026-08-20, both rows now read *Mail is sent through: smtp.resend.com*
- [x] No confirmation email arrived (correct — the address was already verified)
- [x] *Treat as an alias* now checked, matching `contact@` — the "Not an alias." line is gone
- [x] `contact@` still the default send-as, unchanged — confirmed 2026-08-20
- [x] **Test sent from `singchen@` and delivered**, `Show original` read:
      `smtp.mailfrom` on `send.amplifiedthinker.com`, `dkim=pass header.s=resend`, `dmarc=pass`,
      out via `a3-9.smtp-out.eu-west-1.amazonses.com`. Identical authentication to `contact@`
- [x] Claude: gate heading and comment reworded to *retained pending teardown*
- [x] Claude: [../supabase/README.md](../supabase/README.md) amended
- [x] Claude: [recovery.md](recovery.md) amended
- [x] `npm run verify:email` still **21/21, 1 warning** — the zone did not change

**Rollback:** two routes, and the second is the real one.

1. Restore the Brevo SMTP block — `smtp-relay.brevo.com`, port 587, the SMTP key created
   2026-07-06. ⚠️ **That key may already be dead**: Brevo expires a key after 90 consecutive days
   without a send, and this alias has been quiet. Treat it as *probably* available, not guaranteed.
2. **Delete the entry.** `contact@` carries everything the site needs, so losing `singchen@` as an
   outbound identity is an inconvenience rather than an outage. This is why the repoint is low
   risk: the fallback does not depend on Brevo being reachable at all.

---

## Stage 5 — Swap the site over · Owner: Claude

One commit, on a branch off `main`. **13 lines across 6 files**, some carrying the address twice
(once in `href`, once as link text):

| File | Lines |
|---|---|
| [../public/privacy.html](../public/privacy.html) | 223, 404, 424, 428, 436 |
| [../public/terms.html](../public/terms.html) | 194, 219, 234, 258 |
| [../public/about.html](../public/about.html) | 243 |
| [../src/pages/sign-in.astro](../src/pages/sign-in.astro) | 181 |
| [../supabase/email-templates/confirm-signup.html](../supabase/email-templates/confirm-signup.html) | 59 |
| [../supabase/email-templates/reset-password.html](../supabase/email-templates/reset-password.html) | 44 |

Preserve each link's existing `?subject=` parameter — they are per-context (`Privacy%20question`,
`Account%20security`, `Terms%20question`) and they are the only triage the inbox gets.

**Three things that are not find-and-replace:**

1. ⚠️ **[../public/privacy.html](../public/privacy.html) is a description of the system, not
   boilerplate.** Line 223 calls the address *"a monitored address"* and names it as the controller
   contact — so `contact@` must genuinely be monitored from the moment this deploys, which stage 1
   guarantees and is the reason stage 5 comes after it.
2. ⚠️ **The Resend row in the processor table (line 377) becomes incomplete.** It reads *"Delivers
   the two account emails"*. After stage 3, Resend also carries replies you send to people who wrote
   to `contact@` — that is their correspondence passing through a processor the page does not say it
   passes through. Widen it to *"Delivers the two account emails, and carries replies sent from the
   contact address"*. Under this project's own rule that makes the page **wrong**, not stale, so it
   belongs in this commit and not a later one.
3. **The sibling Promptly site makes the same statements about the same person under the same law.**
   Check it before finalising; a contact address that disagrees between two of one person's privacy
   notices is worse than either address alone.

**The two email templates are configuration, not code.** Editing them in the repo changes nothing
live — Supabase serves them from its dashboard. **Paste both into Auth → Emails → Templates in the
prod project** (and dev, if it is current) or the sent mail keeps advertising the old address while
the site advertises the new one.

⚠️ **Two live rendering defects were found while verifying this stage, both pre-existing and both in
`sign-in.astro`.** Neither was caused by the address swap; both were caught by reading *rendered*
text rather than source:

```
try a different network, oremail me and I will sort it out directly.
Fuller answers: what is collected,what email you get,your rights.
```

That is the Astro newline-collapse trap from `CLAUDE.md`, which had already shipped twice. **A grep
for the address passes on both of these**, because the `href` is perfectly correct and the damage is
in the text node beside it. Fixed by moving the space onto the same line as the tag. This is the
concrete case for the standing rule that automated checks are never sufficient for anything visual.

**Verify:**

```bash
npm run build
```

Then, after deploy: load `/privacy/`, `/terms/`, `/about/` and `/sign-in/` on **both origins** and
click a `mailto:` link on each page — confirming the address *and* that the subject line survived.
Grep is not verification here; a correct `href` with broken markup around it still passes a grep.

**Tick as you go**

- [x] 13 lines across 6 files swapped, every `?subject=` parameter preserved — 10 `mailto:` links
      verified in a rendered browser, 7 distinct subjects intact, zero occurrences left
- [x] privacy.html — the "monitored address" claim is true of `contact@` as deployed (stage 1)
- [x] privacy.html — Resend processor row widened: *"Delivers the two account emails, and carries
      replies we send from the contact address"*, audience *"Account holders; anyone who emails us"*
- [x] ~~Promptly sibling site checked for the same statements~~ — **⊘ skipped 2026-08-20, by
      decision.** No local checkout exists, and the site is pre-launch with no users but its owner,
      so the two notices disagreeing costs nothing today. ⚠️ **It will still be wrong when Promptly
      launches** — check it as part of that launch, not as part of this runbook
- [x] `npm run build` passes
- [x] Both templates pasted into Supabase **prod** → Auth → Emails → Templates — 2026-08-20
- [x] Templates pasted into **dev** too, or dev noted as stale
- [x] Deployed, and every `mailto:` checked on `/privacy/`, `/terms/`, `/about/`, `/sign-in/`
- [x] Checked on **both origins**, not just Vercel — 2026-08-20, `4d28458`. Zero occurrences of the
      old address on either; 11 links with subjects intact; both collapsed-space defects confirmed
      gone from production. ⚠️ **Pages lagged Vercel by ~2 minutes** and served the old copy on a
      first check — that is the Actions build finishing, not a failure. Re-check rather than debug

**Rollback:** revert the commit; redeploy. The email templates need pasting back by hand — git does
not reach them.

---

## Stage 6 — Repoint DMARC aggregate reports · Owner: Human

Small, independent of every other stage, and it closes a warning the gate already prints.

**Cloudflare → DNS → records →** the `TXT` record on `_dmarc`. **Edit in place**, changing only the
`rua` address:

```
- v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
+ v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc@amplifiedthinker.com;
```

⚠️ **Change nothing else in that string.** `aspf=r` is what lets Resend's subdomain Return-Path
count toward DMARC at all — under `aspf=s` the names are compared exactly, they do not match, and
DMARC falls back to DKIM alone. The tighter setting is the one that looks safer, which is why the
gate asserts the relaxed one.

Today your only alignment-failure alarm points at a third party at GoDaddy, left over from before
the zone moved to Cloudflare. Nobody here reads it, so a broken selector would go unreported.

**Verify:** `npm run verify:email` — **20/20, no warnings**.

⚠️ **The count DROPS from 21 to 20, and that is the pass.** This runbook said "still 21/21 with the
warning gone", which is impossible: the warning is itself an entry in the results array, so clearing
it removes one. Corrected 2026-08-20 after the edit produced 20/20 and the drop looked like a lost
assertion. **Every count in this file downstream of here is one lower than it was**, which is
exactly the confusion stage 7 warns about — with the twist that here a *decrease* is the success
signal. Reports are daily XML from each receiver; expect the first within about
24 hours, and expect it to be unreadable by eye. Its value is that it arrives at all.

**Tick as you go**

- [ ] `_dmarc` TXT edited **in place**, `rua` address changed and nothing else
- [ ] `p=quarantine`, `adkim=r` and **`aspf=r`** all still present, unaltered
- [x] `npm run verify:email` — **20/20, no warnings** (not 21/21 — see above). Confirmed 2026-08-20,
      `rua=mailto:dmarc@amplifiedthinker.com`, with `p=quarantine` and `aspf=r` unaltered
- [ ] First aggregate report arrived at `dmarc@` (allow ~24 hours; it will be unreadable XML)

**Rollback:** the previous value is in the block above, and in
[email-dns-baseline.md](email-dns-baseline.md).

---

## Stage 7 — Brevo teardown · Owner: Human + Claude · **Not immediately**

**Soak first.** Leave at least a week between stage 4 and this, using `contact@` normally. Nothing
forces the wait except that these records are cheap to keep and expensive to restore under pressure.

**Three safe deletions and one dangerous edit, and they should not be one change.**

**7a — the three safe deletions.** Cloudflare → DNS → records:

```
- TXT    @                    brevo-code:27431d23f6f1d5cdb76357ed50877560
- CNAME  brevo1._domainkey    b1.amplifiedthinker-com.dkim.brevo.com
- CNAME  brevo2._domainkey    b2.amplifiedthinker-com.dkim.brevo.com
```

Nothing signs with those selectors once the send-as is gone, and no other system reads the
ownership TXT.

⚠️ **Do not touch `cf2024-1._domainkey` while you are in there.** It looks like a stray DKIM record
of the same family and it is Cloudflare's — Email Routing signs the mail it *forwards inbound*.
Deleting it breaks inbound, which is the one thing on this domain that has worked continuously since
July.

**That is now measured rather than asserted.** Gmail's send-as verification message, forwarded
through `contact@` on 2026-08-20, arrived carrying:

```
dkim=pass header.i=@amplifiedthinker.com header.s=cf2024-1 header.b=dB8LC8EV
Return-Path: <SRS0=kh8A=ng=google.com=gmail-noreply@amplifiedthinker.com>
```

Cloudflare signs each forwarded message **as this domain** with that selector, and SRS-rewrites the
Return-Path into it so SPF survives the hop. Delete the record and every forwarded message loses a
passing DKIM signature bearing your own domain — on mail you did not send and cannot inspect,
under `p=quarantine`.

**7b — the dangerous edit, separately.** The apex `TXT`:

```
- v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
+ v=spf1 include:_spf.mx.cloudflare.net ~all
```

⚠️ **This is an in-place edit to the single shared record**, the class of change
[email-dns-baseline.md](email-dns-baseline.md) singles out as the dangerous one. A malformed SPF
string is not "the bad part is ignored" — evaluation fails outright and takes Cloudflare's inbound
authorisation with it. Do it alone, so a mail failure afterwards has exactly one candidate cause.

**Why do it at all**, given it costs one lookup of ten and pressure on the budget is low: an unused
`include` still authorises Brevo to send as your domain. Removing an authorisation you no longer
rely on is the point; the lookup is incidental.

**7c — close the Brevo account. Last, and deliberately last.**

| Step | |
|---|---|
| 1 | Check nothing else lives in the account — contact lists, a second sending domain, campaign history. Its only documented job was the alias, but "documented" is not "verified", and after closure you cannot look |
| 2 | Delete the SMTP key created 2026-07-06 |
| 3 | Close the account |

⚠️ **Closure comes after 7a and 7b, not before.** While the account exists, an unexpected
dependency announces itself as a *send failure you can fix by re-enabling something*. Once it is
closed, the same dependency becomes a broken thing with a vendor you no longer have. The records go
first because they are the reversible half.

⚠️ **This needs no privacy-page change, and that is worth stating rather than assuming.** Brevo
never appears in `privacy.html` — correctly, because it only ever relayed the owner's own outbound
mail and processed no visitor data. Removing a processor normally *does* mean editing that page in
the same commit; this one is the exception, and the reason is that it was never a processor of
anyone's data but the owner's.

**Then, Claude:** delete the four Brevo `record(...)` assertions and the section heading from
[../scripts/verify-email-dns.mjs](../scripts/verify-email-dns.mjs), along with `BREVO_SPF_INCLUDE`
and `BREVO_SELECTORS`. The gate goes **20 → 16** — four assertions removed from the post-stage-6
baseline of 20, *not* from the 21 this file assumed before the DMARC warning cleared. Update
[email-dns-baseline.md](email-dns-baseline.md) with a *what stage 7 removed* block in the same shape
as its existing *What Phase 4 changed* section, and correct the four-systems table down to three.
Update [../supabase/README.md](../supabase/README.md) and [../docs/recovery.md](recovery.md), both of
which currently instruct a reader that Brevo must stay.

⚠️ **Run the gate before and after and compare the counts deliberately.** 16/16 is the pass; 16
assertions with one silently absent is what a wrong deletion looks like, and both print green.

**Then close the loop in [../BACKLOG.md](../BACKLOG.md):** candidate 1 of the vendor-consolidation
entry is complete, and *"The Brevo SMTP key behind the Gmail alias expires after 90 days of
inactivity"* is no longer a live risk — it is resolved by removal. Vendors: **7 → 6**.

**Tick as you go**

- [ ] At least a week has passed since stage 4, with `contact@` in normal use
- [ ] `npm run verify:email` run **before** touching anything, count recorded
- [ ] 7a — `brevo-code` TXT deleted
- [ ] 7a — `brevo1._domainkey` CNAME deleted
- [ ] 7a — `brevo2._domainkey` CNAME deleted
- [ ] 7a — **`cf2024-1._domainkey` left alone** (it is Cloudflare's, and inbound depends on it).
      Observed 2026-08-20: it carries a **padlock** in the dashboard, like the three inbound MX
      rows — Cloudflare manages it, so it resists casual deletion. Better protected than this
      runbook assumed, but do not treat the padlock as a reason to stop being careful
- [ ] 7b — apex SPF `include:spf.brevo.com` removed, **as its own separate change**
- [ ] 7c — Brevo account inspected for anything else (lists, domains, history) before closing
- [ ] 7c — the SMTP key created 2026-07-06 deleted
- [ ] 7c — **Brevo account closed** — last, after 7a and 7b
- [ ] 7c — confirmed no `privacy.html` change is needed (Brevo was never named there)
- [ ] Claude: four `record(...)` assertions, `BREVO_SPF_INCLUDE` and `BREVO_SELECTORS` removed
- [ ] `npm run verify:email` — **16/16**, and the count was compared deliberately against the
      post-stage-6 baseline of **20**, not against the 21 that predates the DMARC fix
- [ ] Claude: [email-dns-baseline.md](email-dns-baseline.md) updated, four-systems table now three
- [ ] Claude: [../supabase/README.md](../supabase/README.md) and [recovery.md](recovery.md) Brevo
      instructions deleted
- [ ] Claude: [../BACKLOG.md](../BACKLOG.md) — candidate 1 closed, 90-day key risk resolved,
      vendors **7 → 6**

**Rollback:** re-add the three records from the block above and restore the `include`. DKIM
propagation is not instant; assume the alias is unusable for the length of a TTL.

---

## What this runbook deliberately does not do

**`whatsnew@` is not here.** Announcement mail to a list is a different class of thing from an alias:
it needs `List-Unsubscribe`, a consent record — the `profiles_wants_updates` migration exists but
nothing consumes it — a privacy-page section describing what is sent and how to stop it, and a
decision about whether marketing reputation should share a domain with password resets. The usual
mitigation for that last one is a separate subdomain. It is its own phase, and pretending it is one
more row in stage 1 is how it would get built wrong.

**Nothing touches `noreply@` or the Supabase SMTP settings.** Auth mail works, was verified by
delivery on all three send types, and has no reason to be in this change.

**`singchen@` is not being retired at all — only demoted.** It keeps its inbound route permanently,
and from stage 4 it keeps a working outbound identity too, relaying through Resend like everything
else. What it loses is its place *on the site*: stage 5 removes it from every published page, so it
stops being the address strangers are told to use. It is not a loose end left untied; it is the
tied end.
