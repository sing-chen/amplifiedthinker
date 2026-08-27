# Email DNS baseline — captured before Phase 4 changed anything

**Captured:** 2026-08-17T16:07Z, from `1.1.1.1` · **Zone:** `amplifiedthinker.com` ·
**Reproduce:** `npm run verify:email`

Phase 3's migrations were one transaction each, so a mistake rolled back whole and cost nothing.
This phase edits a live DNS zone instead: changes propagate on a TTL, and a wrong record breaks
inbound mail that works today. **This file is the restore reference.** It is what the zone looked
like before Phase 4 touched it.

---

## The zone as captured

**Two views of the apex, and the difference matters for restoring.** The zone holds a *CNAME* at
the apex; Cloudflare flattens it and answers with A records, so a DNS query and the dashboard
disagree about what is there. The dashboard is the thing you would edit.

```
--- as the dashboard holds it (edit here) ---
CNAME @        d2e54156c088cecf.vercel-dns-017.com   [DNS only]
CNAME www      d2e54156c088cecf.vercel-dns-017.com   [DNS only]

--- as the world resolves it (what npm run verify:email sees) ---
A    @         64.29.17.x, 216.198.79.x      <- flattened from the CNAME above, not editable
AAAA @         (none)
MX   22       route3.mx.cloudflare.net
MX   27       route1.mx.cloudflare.net
MX   66       route2.mx.cloudflare.net
TXT  @        brevo-code:27431d23f6f1d5cdb76357ed50877560
TXT  @        v=spf1 include:_spf.mx.cloudflare.net ~all
TXT  _dmarc   v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;
CNAME brevo1._domainkey  ->  b1.amplifiedthinker-com.dkim.brevo.com
CNAME brevo2._domainkey  ->  b2.amplifiedthinker-com.dkim.brevo.com
TXT  cf2024-1._domainkey  v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0B...
```

⚠️ **`cf2024-1._domainkey` is Cloudflare's, not Brevo's.** Email Routing signs the messages it
*forwards* inbound. Unrelated to outbound sending, and not to be tidied away as a stray DKIM record.

The three `MX` rows carry padlocks in the dashboard: Cloudflare manages them on Email Routing's
behalf. That is a useful property here — the records most dangerous to break are the ones hardest
to edit by accident.

---

## What Phase 4 changed

**One record edited in place**, on 2026-08-17, when Brevo was still going to carry auth mail:

```
- TXT  @   v=spf1 include:_spf.mx.cloudflare.net ~all
+ TXT  @   v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
```

Verified immediately after with `npm run verify:email`: **16/16**, still exactly one SPF record,
2 of 10 lookups used, and every inbound and website record unchanged. Propagation was effectively
instant rather than TTL-bound.

**Three records added**, on 2026-08-18, moving Supabase auth mail from Brevo to Resend:

```
+ TXT  resend._domainkey   p=MIGfMA0GCSqG...XtOyjtQIDAQAB      (218 chars)
+ MX   send            10  feedback-smtp.eu-west-1.amazonses.com
+ TXT  send                v=spf1 include:amazonses.com ~all
```

Verified with `npm run verify:email`: **21/21**. The apex SPF record was *not* touched — Resend
reads the one on `send`, because that is where its Return-Path lives.

⚠️ **The edit is the dangerous one; the additions are not.** Nothing existing was modified for
Resend, so there is no prior value to restore — backing the switch out means deleting three
hostnames that nothing else uses. This is why the Brevo SPF edit is written up at length above and
these three get a code block: an in-place edit to a shared record is a different class of change
from three new names, even though the dashboard presents them identically.

## What stage 7 removed — 2026-08-27

Brevo is gone: records deleted, apex SPF include removed, SMTP key deleted, **account closed**. It
had relayed nothing since 2026-08-20, when both Gmail *Send mail as* identities were repointed at
Resend.

```
- TXT    @                    brevo-code:27431d23f6f1d5cdb76357ed50877560
- CNAME  brevo1._domainkey    b1.amplifiedthinker-com.dkim.brevo.com
- CNAME  brevo2._domainkey    b2.amplifiedthinker-com.dkim.brevo.com

- TXT    @   v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
+ TXT    @   v=spf1 include:_spf.mx.cloudflare.net ~all
```

Gate before: **20/20**. Gate after, with the four Brevo assertions removed: **16/16**. SPF lookups
went **2 → 1**. Every inbound, Resend, DMARC and website assertion unchanged throughout.

⚠️ **The three deletions and the SPF edit were done as separate changes, deliberately.** Deleting a
record nothing reads is reversible and dull; editing the shared apex string is neither. Bundled,
a mail failure afterwards would have had two candidate causes.

⚠️ **Those three records carried a 1 hr TTL where the rest of the zone is Auto.** `1.1.1.1` — the
resolver the gate queries — can keep serving a deleted record for that long, so a green Brevo
section immediately after deletion proves nothing. Confirm from the Cloudflare record list, which
is authoritative and instant.

**Restoring Brevo is no longer a rollback, it is a rebuild.** The account is closed, so the DKIM
selectors above cannot be re-published — those hostnames point at a Brevo tenant that no longer
exists. Anything needing an SMTP relay for this domain now goes through Resend, which is what both
send-as identities already use.

---

**Two records the apex must never acquire.** Resend offers both, and both would break something
that works:

| Tempting | What it breaks |
|---|---|
| `include:amazonses.com` on the apex SPF | Nothing immediately — which is the problem. It spends an apex lookup, authorises SES to send as the bare domain, and does not help, because Resend's Return-Path is on `send`. The gate warns rather than fails. |
| Resend's **Enable Receiving** toggle | Publishes an `MX` **at the apex**, where Cloudflare Email Routing's three already live. Two systems claiming inbound for one name. Left off; inbound is Cloudflare's and works. |

---

## Three systems, one zone, and no record shared any more

⚠️ **This said FOUR systems until 2026-08-27.** Brevo was the fourth and it is gone — see *What
stage 7 removed* below. The table now describes the zone as it stands.

The plan asked whether Cloudflare's MX records and Vercel's records can coexist. They can, and the
reason is worth stating precisely, because it also identifies the only place they *can* collide:

| System | Owns | Record types |
|---|---|---|
| **Cloudflare Email Routing** | Inbound mail | `MX` at the apex, an SPF `include`, and `cf2024-1._domainkey` |
| **Resend** | Supabase auth mail **and both Gmail send-as identities** | `MX` + SPF `TXT` on `send`, `resend._domainkey` TXT |
| **Vercel** | The website | `A` at the apex, `CNAME` at `www` |

MX and A are different record types answering different questions, so Vercel and Email Routing
never contend — Vercel publishes no MX and wants none. Resend and Email Routing both publish MX,
but for *different names* — `send.amplifiedthinker.com` against the apex — which is the same
answer one level down.

**The apex SPF TXT is no longer shared.** It was, while Cloudflare and Brevo each needed a piece of
it; now only Cloudflare's `include` is in it, and Resend deliberately sits outside on `send`. The
single-record hazard below has not gone away — it is one edit from returning the moment a second
sender is authorised.

⚠️ **`cf2024-1._domainkey` is Cloudflare's and is load-bearing.** Email Routing signs every message
it *forwards inbound* as this domain with that selector — measured on a real delivered message,
2026-08-20: `dkim=pass header.i=@amplifiedthinker.com header.s=cf2024-1`. It sits in the record list
looking exactly like a stray DKIM entry of the Brevo family. It carries a padlock, which helps.
Deleting it degrades every forwarded message under `p=quarantine`.

⚠️ **"Add a record" is the wrong instinct and the natural one.** Two TXT records both beginning
`v=spf1` is not "the second is ignored" — it is a **permanent error**, and SPF evaluation fails
outright, taking Cloudflare's inbound authorisation down with it. A second sender goes in as another
`include` **inside the existing string**, edited in place — that is how Brevo went in during Phase 4
and how anything else would. `npm run verify:email` asserts the single-record property for exactly
this reason.

---

## Restoring

Cloudflare keeps no DNS history, so restoration is by hand from the block above. In practice one
record is at risk:

```
Name:  @  (amplifiedthinker.com)
Type:  TXT
Value: v=spf1 include:_spf.mx.cloudflare.net ~all
```

⚠️ **Do not try to restore the apex by adding A records.** They are flattened output; the zone has
a CNAME there. Adding A records alongside it produces a conflict the dashboard will reject, and the
gate would keep passing throughout because it only ever sees the resolved answer.

⚠️ **The apex addresses are written as `64.29.17.x` on purpose — the last octet moves.** Vercel
rotates within its anycast `/24`s, and the same query returned `.1`, then `.65`, then `.1` again
inside an hour. The gate matches the `/24` prefix rather than the address for that reason. Anything
comparing exact apex IPs against this file will report a change that never happened.

Re-run `npm run verify:email` after any edit. It queries `1.1.1.1` rather than the machine's
resolver, deliberately: a local cache will serve the record you just replaced and tell you the
change worked when it did not.

---

## What the capture settled

**Cloudflare is authoritative DNS, not GoDaddy.** `docs/recovery.md` listed GoDaddy against "DNS for
`amplifiedthinker.com`". GoDaddy is the **registrar**; the nameservers are Cloudflare's and the zone
lives there. A DNS change made at GoDaddy would have no effect, which is a bad thing to discover
while trying to fix mail. Corrected in `recovery.md`.

**Inbound mail is confirmed working, by evidence rather than by report.** Beyond the MX records
resolving, a Gmail confirmation message addressed to `singchen@amplifiedthinker.com` on 2026-07-06
was forwarded through and is in the Gmail mailbox. Email Routing works end to end.

**And confirmed again by delivery after the SPF edit**, on 2026-08-18. The gate proves the records
resolve; only a message proves forwarding still happens. Editing the apex SPF was the single change
this phase made to something that already worked, so it is the single thing worth re-testing by
delivery rather than by record. Adding an `include` can only widen what is authorised — but that is
a reason to expect the test to pass, not a reason to skip it.

**DKIM is already published and live.** Both Brevo selectors resolve through to real RSA keys. This
was set up when the Brevo account was created and needs no work in Phase 4.

**DMARC is `p=quarantine`.** Not `p=none`. A send that fails alignment does not merely get a
demerit — it goes to spam, which is the precise outcome this phase exists to prevent.

**`aspf=r` turned out to matter far more than it looked.** It was on the zone before Phase 4, set
by whoever wrote the record originally rather than by design. Relaxed alignment compares
*organisational* domains, so a Return-Path on `send.amplifiedthinker.com` aligns with a
`From:` of `amplifiedthinker.com`. That single letter is what lets Resend's subdomain Return-Path
count toward DMARC at all. Under `aspf=s` the names would be compared exactly, they would not
match, and DMARC would fall back to DKIM alone — the arrangement Brevo forced. The gate asserts
`aspf=r` for that reason: the tighter setting is the one that looks safer.

Measured on delivered mail, both before and after the switch:

| | Brevo (2026-08-17) | Resend (2026-08-18) |
|---|---|---|
| `smtp.mailfrom` | `bounces-…@gw.d.sender-sib.com` | `…@send.amplifiedthinker.com` |
| SPF | never evaluated against this domain | `pass`, and **aligned** |
| DKIM | `pass`, `header.s=brevo2` | `pass`, `header.s=resend` |
| DMARC rests on | DKIM alone | either mechanism |

⚠️ **Resend's mail carries two DKIM signatures and only one of them counts.** The second is
`d=amazonses.com`, Amazon signing its own outbound. It passes, it is not yours, and it cannot align
with `header.from`. A future raw source will still show a `dkim=pass` after a broken selector has
taken the real one down.

⚠️ **DMARC aggregate reports go to `dmarc_rua@onsecureserver.net`** — a GoDaddy address, left behind
from before the zone moved to Cloudflare. Nobody here reads them, so the one feedback channel that
would report an alignment failure is pointed at a third party. Worth redirecting; not blocking.
