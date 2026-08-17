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

One record, on 2026-08-17:

```
- TXT  @   v=spf1 include:_spf.mx.cloudflare.net ~all
+ TXT  @   v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
```

Verified immediately after with `npm run verify:email`: **16/16**, still exactly one SPF record,
2 of 10 lookups used, and every inbound and website record unchanged. Propagation was effectively
instant rather than TTL-bound.

**The one record Phase 4 changes is the SPF TXT.** Everything else above is captured so that a
mistake is recognisable, not because it is expected to move.

---

## Three systems, one zone, and only one record shared

The plan asked whether Cloudflare's MX records and Vercel's records can coexist. They can, and the
reason is worth stating precisely, because it also identifies the only place they *can* collide:

| System | Owns | Record types |
|---|---|---|
| **Cloudflare Email Routing** | Inbound mail | `MX`, and an SPF `include` |
| **Brevo** | Outbound mail | `brevo-code` TXT, `brevo1`/`brevo2._domainkey` CNAMEs, and an SPF `include` |
| **Vercel** | The website | `A` at the apex, `CNAME` at `www` |

MX and A are different record types answering different questions, so Vercel and Email Routing
never contend — Vercel publishes no MX and wants none. **The single shared record is the SPF TXT**,
which both mail systems need a piece of, and a domain may have only one of.

⚠️ **This makes "add a record" the wrong instinct and the natural one.** Two TXT records both
beginning `v=spf1` is not "the second is ignored" — it is a **permanent error**, and SPF evaluation
fails outright, taking Cloudflare's inbound authorisation down with it. Brevo goes in as a new
`include` **inside the existing string**, edited in place. `npm run verify:email` asserts the
single-record property for exactly this reason.

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

**DKIM is already published and live.** Both Brevo selectors resolve through to real RSA keys. This
was set up when the Brevo account was created and needs no work in Phase 4.

**DMARC is `p=quarantine`.** Not `p=none`. A send that fails alignment does not merely get a
demerit — it goes to spam, which is the precise outcome this phase exists to prevent. Alignment is
relaxed (`adkim=r; aspf=r`), so DKIM signed as `d=amplifiedthinker.com` aligns and DMARC passes on
the DKIM half alone.

⚠️ **DMARC aggregate reports go to `dmarc_rua@onsecureserver.net`** — a GoDaddy address, left behind
from before the zone moved to Cloudflare. Nobody here reads them, so the one feedback channel that
would report an alignment failure is pointed at a third party. Worth redirecting; not blocking.
