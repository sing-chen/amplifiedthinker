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
| 1 | Cloudflare inbound routes | Human | ☐ Not started | |
| 2 | Resend API key | Human | ☐ Not started | |
| 3 | Gmail send-as for `contact@` | Human | ☐ Not started | |
| 4 | Retire the `singchen@` send-as | Human + Claude | ☐ Not started | |
| 5 | Swap the site over | Claude | ☐ Not started | |
| 6 | Repoint DMARC reports | Human | ☐ Not started | |
| 7 | Brevo teardown | Human + Claude | ☐ Not started | **After a soak — see the stage** |

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

- [ ] `npm run verify:email` run — **21/21**, and the DMARC third-party warning still present
- [ ] Any deviation from the state table above recorded in the handoff table

---

## Stage 1 — Cloudflare: inbound routes · Owner: Human

**Cloudflare dashboard → `amplifiedthinker.com` → Email** (the left-nav item has been labelled both
*Email* and *Email Routing* across redesigns; same place) **→ Routing rules.**

Under **Custom addresses → Create address**, add two:

| Custom address | Action | Destination |
|---|---|---|
| `contact` | Send to an email | `singfenchen@gmail.com` |
| `dmarc` | Send to an email | `singfenchen@gmail.com` |

The destination is already a **verified** destination address, so neither of these triggers a
Cloudflare verification email. If one asks you to verify, you have typed the Gmail address wrong.

**Leave `singchen` exactly as it is.** Do not delete, disable or re-target it.

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

- [ ] Inbox skimmed for other `@amplifiedthinker.com` recipients before touching catch-all
- [ ] Custom address `contact` → `singfenchen@gmail.com` created
- [ ] Custom address `dmarc` → `singfenchen@gmail.com` created
- [ ] `singchen` route left in place, untouched
- [ ] Catch-all checked, set to disabled or Drop, and **recorded in the handoff table**
- [ ] No DNS records were edited in this stage
- [ ] Test message to `contact@` arrived in Gmail
- [ ] Test message to `dmarc@` arrived in Gmail

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

- **Resend's acceptable-use policy on human correspondence.** It is built for application mail. A
  personal reply relay is an unusual use and has never been confirmed as permitted. Read the AUP
  once, now, rather than after an account action.

  **If it does not permit this, the runbook forks and you should stop here rather than improvise.**
  Stages 1, 5 and 6 still stand on their own — `contact@` can be a receive-only address, with replies
  going out from Gmail's own identity, which is worse but not broken. The outbound half then needs a
  relay that is not Resend: keeping Brevo (cancels stage 7, and re-inherits the 90-day key expiry) or
  Google Workspace on the domain (paid, and makes Gmail authoritative for the mailbox rather than a
  forwarding destination) are the two realistic answers. Both are decisions, not steps; bring the
  finding back rather than picking one mid-stage.
- **The free allowance is 100/day and is now shared three ways** — Supabase auth mail, and your own
  outbound replies. A heavy test loop on auth can exhaust the day and your correspondence stops with
  it, looking like an SMTP fault.

**Verify:** nothing to verify yet; the key is unused until stage 3.

**Tick as you go**

- [ ] Resend's acceptable-use policy read, and human correspondence is permitted
      — **if not, stop here** and take the fork above rather than improvising
- [ ] Key created: name `Gmail send-as`, **Sending access**, restricted to `amplifiedthinker.com`
- [ ] Confirmed this is a **new** key, not Supabase's
- [ ] Key stored in the password manager (it is shown once)

**Rollback:** revoke the key.

---

## Stage 3 — Gmail: send as `contact@` · Owner: Human

**Gmail → gear icon → See all settings → Accounts and Import → "Send mail as:" → Add another email
address.** This opens a **popup window**; if nothing appears, it was blocked.

**First screen:**

| Field | Value |
|---|---|
| Name | `Sing Chen` |
| Email address | `contact@amplifiedthinker.com` |
| Treat as an alias | **✅ checked** |

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

⚠️ **Two DKIM signatures will appear and only one of them counts.** The second is
`d=amazonses.com`, Amazon signing its own outbound. It passes, it is not yours, and it cannot align
with `header.from` — so a raw source will still show `dkim=pass` after a broken selector has taken
the real signature down. Read the selector, not the verdict.

**Set the default.** Back on *Accounts and Import*, decide whether `contact@` becomes the default
send-as address. Recommended: yes, once verified — it makes forgetting to switch identity
impossible rather than merely unlikely.

**Tick as you go**

- [ ] Send-as added, **Treat as an alias** checked
- [ ] SMTP set to `smtp.resend.com` / `587` / `resend` / the stage 2 key / **TLS**
- [ ] Confirmation code received and entered
- [ ] Test sent to `singfenchen@gmail.com`, **Show original** read
- [ ] `From:` is `contact@amplifiedthinker.com` with **no** "via" annotation
- [ ] `smtp.mailfrom` is `…@send.amplifiedthinker.com`
- [ ] `spf=pass` · `dkim=pass` with **`header.s=resend`** (not the amazonses signature) · `dmarc=pass`
- [ ] Test sent to a non-Google mailbox and delivered
- [ ] Default send-as address decided

**Rollback:** delete the send-as entry. `singchen@` is untouched and still works; this stage adds an
identity and removes none.

---

## Stage 4 — Retire the `singchen@` send-as · Owner: Human, then Claude

**Only after stage 3 has been verified by a delivered message.** Deleting the working identity
before the new one is proven leaves you with no outbound alias at all.

**Gmail → Accounts and Import → "Send mail as:" → the `singchen@amplifiedthinker.com` row → delete.**

That is the entire human step. Brevo now relays nothing for anybody. Its DNS records are still
published and the gate still passes 21/21 — because records resolving is all it can measure.

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
- [ ] `singchen@` send-as row deleted in Gmail
- [ ] Claude: gate heading and comment reworded to *retained pending teardown*
- [ ] Claude: [../supabase/README.md](../supabase/README.md) amended
- [ ] Claude: [recovery.md](recovery.md) amended
- [ ] `npm run verify:email` still **21/21** — the zone did not change

**Rollback:** re-create the send-as entry with the Brevo SMTP settings from
[../supabase/README.md](../supabase/README.md) — host `smtp-relay.brevo.com`, port 587, the SMTP key
created 2026-07-06. ⚠️ **That key may already be dead**: Brevo expires a key after 90 consecutive
days without a send, and the alias has been quiet. Treat this rollback as *probably* available
rather than guaranteed, which is another reason not to reach stage 4 before stage 3 passes.

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

**Verify:**

```bash
npm run build
```

Then, after deploy: load `/privacy/`, `/terms/`, `/about/` and `/sign-in/` on **both origins** and
click a `mailto:` link on each page — confirming the address *and* that the subject line survived.
Grep is not verification here; a correct `href` with broken markup around it still passes a grep.

**Tick as you go**

- [ ] 13 lines across 6 files swapped, every `?subject=` parameter preserved
- [ ] privacy.html:223 — the "monitored address" claim is true of `contact@` as deployed
- [ ] privacy.html:377 — Resend processor row widened to cover contact replies
- [ ] Promptly sibling site checked for the same statements
- [ ] `npm run build` passes
- [ ] Both templates pasted into Supabase **prod** → Auth → Emails → Templates
- [ ] Templates pasted into **dev** too, or dev noted as stale
- [ ] Deployed, and a `mailto:` clicked on `/privacy/`, `/terms/`, `/about/`, `/sign-in/`
- [ ] Checked on **both origins**, not just Vercel

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

**Verify:** `npm run verify:email` — still 21/21, and the *"DMARC aggregate reports go to a third
party"* warning is **gone**. Reports are daily XML from each receiver; expect the first within about
24 hours, and expect it to be unreadable by eye. Its value is that it arrives at all.

**Tick as you go**

- [ ] `_dmarc` TXT edited **in place**, `rua` address changed and nothing else
- [ ] `p=quarantine`, `adkim=r` and **`aspf=r`** all still present, unaltered
- [ ] `npm run verify:email` — **21/21**, and the third-party warning is **gone**
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

**Then, Claude:** delete the four Brevo `record(...)` assertions and the section heading from
[../scripts/verify-email-dns.mjs](../scripts/verify-email-dns.mjs), along with `BREVO_SPF_INCLUDE`
and `BREVO_SELECTORS`. The gate goes **21 → 17**. Update
[email-dns-baseline.md](email-dns-baseline.md) with a *what stage 7 removed* block in the same shape
as its existing *What Phase 4 changed* section, and correct the four-systems table down to three.
Update [../supabase/README.md](../supabase/README.md) and [../docs/recovery.md](recovery.md), both of
which currently instruct a reader that Brevo must stay.

⚠️ **Run the gate before and after and compare the counts deliberately.** 17/17 is the pass; 17
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
- [ ] 7a — **`cf2024-1._domainkey` left alone** (it is Cloudflare's, and inbound depends on it)
- [ ] 7b — apex SPF `include:spf.brevo.com` removed, **as its own separate change**
- [ ] Claude: four `record(...)` assertions, `BREVO_SPF_INCLUDE` and `BREVO_SELECTORS` removed
- [ ] `npm run verify:email` — **17/17**, and the count was compared deliberately against 21
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

**`singchen@` keeps its inbound route forever.** It is not a loose end left untied; it is the tied
end.
