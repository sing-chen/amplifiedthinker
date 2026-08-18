// Phase 4 gate: prove the mail configuration from DNS alone.
//
//   npm run verify:email
//
// Phase 3's gate could roll back. This one cannot: it watches a live DNS zone
// where a wrong record breaks inbound mail that works today, and where the fix
// takes as long as the TTL to arrive. So this script is a *baseline capture*
// first and an assertion suite second - run it before touching Cloudflare, and
// again after, and diff the two.
//
// It queries a public resolver rather than the machine's, because a local cache
// will happily serve the record you just replaced and tell you the change did
// not work.
//
// Nothing here needs a credential. Every fact it checks is public by
// construction, which is the point: this is the half of Phase 4 that can be
// verified without logging in to anything.

import { Resolver } from 'node:dns/promises';

// slice(2) matters on Windows: argv[0] is the node executable, whose path
// contains dots, so a naive "first argument with a dot in it" picks up
// C:\Program Files\nodejs\node.exe and tries to resolve it as a hostname.
const DOMAIN = process.argv.slice(2).find((a) => !a.startsWith('-')) || 'amplifiedthinker.com';

// 1.1.1.1 first, 8.8.8.8 as fallback. Deliberately not the system resolver:
// the whole reason to run this after a DNS edit is to see past a stale cache.
const RESOLVERS = ['1.1.1.1', '8.8.8.8'];

// ---------------------------------------------------------------------------
// What must be true, and why each one is here.
//
//   Cloudflare Email Routing owns inbound: the MX records and the SPF include.
//   Resend owns auth mail: everything under send.<domain>, plus one DKIM
//     selector at the apex.
//   Brevo owns the Gmail "Send mail as" alias, and nothing else any more.
//   Vercel owns the website: the apex A records and the www CNAME.
//
// Four systems, one zone, and exactly one record shared between them - the apex
// SPF TXT. That record is the whole risk surface of this phase, and Resend
// deliberately does not touch it.
// ---------------------------------------------------------------------------
const CLOUDFLARE_MX = ['route1.mx.cloudflare.net', 'route2.mx.cloudflare.net', 'route3.mx.cloudflare.net'];
const CLOUDFLARE_SPF_INCLUDE = '_spf.mx.cloudflare.net';
const BREVO_SPF_INCLUDE = 'spf.brevo.com';
const BREVO_SELECTORS = ['brevo1', 'brevo2'];

// Resend puts its bounce handling on a subdomain and signs from the apex. That
// split is the whole reason for the switch: the Return-Path lands on
// send.<domain>, whose organisational domain is <domain>, so SPF *aligns* for
// DMARC. Brevo bounced from gw.d.sender-sib.com, which never could - measured on
// a delivered message, and the reason DMARC passed on DKIM alone.
//
// Matched by shape rather than by value. The MX host carries an AWS region
// (feedback-smtp.eu-west-1.amazonses.com and friends) chosen when the domain is
// added, and pinning the exact string would make this gate fail if the domain is
// ever recreated in another region - a failure about nothing, which is how a
// check earns the right to be ignored. See the VERCEL_A_PREFIXES note.
const RESEND_SUBDOMAIN = 'send';
const RESEND_SELECTOR = 'resend';
const RESEND_MX_PREFIX = 'feedback-smtp.';
const RESEND_MX_SUFFIX = '.amazonses.com';
const RESEND_SPF_INCLUDE = 'amazonses.com';
// Vercel's anycast /24s, matched as PREFIXES rather than exact addresses.
//
// The apex holds a CNAME to Vercel that Cloudflare flattens, so a resolver
// answers with whichever addresses Vercel is currently handing out - and the
// last octet does move. Pinning them exactly (64.29.17.1, 216.198.79.1) made
// this gate report a zone change forty minutes later when nothing had changed
// but Vercel's rotation. A check that fails for reasons unrelated to what it
// claims to watch is worse than no check: it trains you to ignore a red line
// on the one run where it means something.
const VERCEL_A_PREFIXES = ['64.29.17.', '216.198.79.'];

const resolver = new Resolver();
resolver.setServers(RESOLVERS);

// ---------------------------------------------------------------------------
// Lookups. Every one returns a value rather than throwing, because "this record
// does not exist" is an answer the assertions need to reason about, not an
// error that should abort the capture half.
// ---------------------------------------------------------------------------

async function lookup(kind, name) {
  try {
    switch (kind) {
      case 'TXT': return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''));
      case 'MX': return (await resolver.resolveMx(name)).map((r) => ({ ...r, exchange: r.exchange.toLowerCase() }));
      case 'NS': return (await resolver.resolveNs(name)).map((h) => h.toLowerCase());
      case 'A': return await resolver.resolve4(name);
      case 'AAAA': return await resolver.resolve6(name);
      case 'CNAME': return (await resolver.resolveCname(name)).map((h) => h.toLowerCase());
      default: return [];
    }
  } catch (err) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') return [];
    throw err;
  }
}

// SPF costs a DNS lookup per include/a/mx/ptr/exists/redirect, and more than ten
// is a permanent error - which fails *open* on most receivers, so it does not
// announce itself. Counted rather than eyeballed because the count is recursive
// and Brevo's include is not the only thing that spends from the budget.
async function countSpfLookups(record, depth = 0, seen = new Set()) {
  if (depth > 5) return 0;
  let n = 0;
  for (const term of record.split(/\s+/)) {
    // The lookahead is load-bearing. Without it `a` matches the leading "a" of
    // `~all` - which every SPF record ends with, and nested records add more -
    // so a zone using one include reported three lookups. Wrong in the safe
    // direction here, but it is a counter against a hard limit of 10, and one
    // that over-counts will eventually fail a record that is actually fine.
    const m = /^[+~?-]?(include|redirect|exists|a|mx|ptr)(?=$|[:=/])(?:[:=]([^/\s]+))?/i.exec(term);
    if (!m) continue;
    n += 1;
    const [, mech, arg] = m;
    if (/^(include|redirect)$/i.test(mech) && arg && !seen.has(arg)) {
      seen.add(arg);
      const nested = (await lookup('TXT', arg)).filter((t) => /^v=spf1\b/i.test(t));
      if (nested[0]) n += await countSpfLookups(nested[0], depth + 1, seen);
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

console.log(`\nPhase 4 email DNS gate\n  domain:   ${DOMAIN}\n  resolver: ${RESOLVERS.join(', ')}\n  captured: ${new Date().toISOString()}\n`);

const ns = await lookup('NS', DOMAIN);
const mx = await lookup('MX', DOMAIN);
const apexTxt = await lookup('TXT', DOMAIN);
const apexA = await lookup('A', DOMAIN);
const wwwCname = await lookup('CNAME', `www.${DOMAIN}`);
const dmarcTxt = await lookup('TXT', `_dmarc.${DOMAIN}`);

const dkim = {};
for (const sel of BREVO_SELECTORS) {
  const host = `${sel}._domainkey.${DOMAIN}`;
  dkim[sel] = { cname: await lookup('CNAME', host), txt: await lookup('TXT', host) };
}

const sendHost = `${RESEND_SUBDOMAIN}.${DOMAIN}`;
const sendMx = await lookup('MX', sendHost);
const sendTxt = await lookup('TXT', sendHost);
const resendDkimHost = `${RESEND_SELECTOR}._domainkey.${DOMAIN}`;
const resendDkimTxt = await lookup('TXT', resendDkimHost);

console.log('Records as they stand');
console.log(`  NS            ${ns.join(', ') || '(none)'}`);
console.log(`  A    @        ${apexA.join(', ') || '(none)'}`);
console.log(`  CNAME www     ${wwwCname.join(', ') || '(none)'}`);
for (const r of mx) console.log(`  MX   ${String(r.priority).padEnd(4)}     ${r.exchange}`);
for (const t of apexTxt) console.log(`  TXT  @        ${t}`);
for (const t of dmarcTxt) console.log(`  TXT  _dmarc   ${t}`);
for (const sel of BREVO_SELECTORS) {
  const { cname, txt } = dkim[sel];
  if (cname.length) console.log(`  CNAME ${sel}._domainkey  -> ${cname.join(', ')}`);
  for (const t of txt) console.log(`  TXT   ${sel}._domainkey  ${t.slice(0, 60)}... (${t.length} chars)`);
}
for (const r of sendMx) console.log(`  MX   ${String(r.priority).padEnd(4)}     ${r.exchange}   (on ${sendHost})`);
for (const t of sendTxt) console.log(`  TXT  ${RESEND_SUBDOMAIN}     ${t}`);
for (const t of resendDkimTxt) console.log(`  TXT   ${RESEND_SELECTOR}._domainkey  ${t.slice(0, 60)}... (${t.length} chars)`);

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
}
function warn(label, detail) {
  results.push({ ok: true, warn: true, label, detail });
  console.log(`  WARN  ${label}${detail ? ` - ${detail}` : ''}`);
}

const spfRecords = apexTxt.filter((t) => /^v=spf1\b/i.test(t));
const spf = spfRecords[0] || '';

console.log('\nInbound - Cloudflare Email Routing (works today; must not regress)');

record(
  ns.every((h) => h.endsWith('.ns.cloudflare.com')) && ns.length > 0,
  'Cloudflare is authoritative for the zone',
  ns.join(', ') || 'no NS records'
);

for (const host of CLOUDFLARE_MX) {
  record(mx.some((r) => r.exchange === host), `MX present: ${host}`, mx.length ? undefined : 'NO MX RECORDS AT ALL - inbound mail is dead');
}

record(
  spf.includes(CLOUDFLARE_SPF_INCLUDE),
  `SPF still includes ${CLOUDFLARE_SPF_INCLUDE}`,
  spf.includes(CLOUDFLARE_SPF_INCLUDE) ? undefined : 'removing this breaks Email Routing forwarding'
);

console.log('\nThe shared record - one SPF TXT, three systems');

// The single highest-value assertion in the file. Two TXT records both starting
// v=spf1 is a permerror: not "the second one is ignored" but "SPF evaluation
// fails outright", taking Cloudflare's inbound authorisation down with it. It is
// also the most natural mistake to make here, because "add a record" is the
// obvious way to add Brevo and it is the wrong one. Brevo must be a new include
// inside the existing string.
record(
  spfRecords.length === 1,
  'exactly one SPF record at the apex',
  spfRecords.length === 1 ? spf : `found ${spfRecords.length} - ${spfRecords.length === 0 ? 'no SPF at all' : 'PERMERROR: SPF fails entirely, for inbound too'}`
);

if (spf) {
  const lookups = await countSpfLookups(spf);
  record(lookups <= 10, `SPF DNS lookups within the limit of 10`, `${lookups} used`);
}

console.log('\nOutbound - Resend (Supabase auth mail)');

// Three states, not two, and the middle one is the dangerous one.
//
//   nothing published  -> Resend is not set up yet. A warning, because that is a
//                         true statement about an unfinished phase, not a fault.
//   all three present  -> pass.
//   some present       -> FAIL, loudly. A published DKIM key with no Return-Path
//                         SPF, or an SPF record with no key, is a domain that
//                         sends mail which authenticates half way. Under
//                         p=quarantine that is not degraded delivery, it is the
//                         spam folder - and it is the state the zone passes
//                         through while records are being pasted in one at a
//                         time, so it is worth being able to see.
const resendRecordsFound = [sendMx.length > 0, sendTxt.length > 0, resendDkimTxt.length > 0].filter(Boolean).length;

if (resendRecordsFound === 0) {
  warn(
    'Resend is not configured on this zone yet',
    `no records at ${sendHost} or ${resendDkimHost} - Phase 4 is not finished`
  );
} else {
  record(
    sendMx.some((r) => r.exchange.startsWith(RESEND_MX_PREFIX) && r.exchange.endsWith(RESEND_MX_SUFFIX)),
    `MX on ${sendHost} points at Resend's bounce handler`,
    sendMx.map((r) => r.exchange).join(', ') || 'none - bounces and complaints have nowhere to go'
  );

  // This subdomain MX cannot fight with Cloudflare Email Routing's. They answer
  // for different names: route*.mx.cloudflare.net is the MX for the apex, this
  // one is the MX for send.<domain>. The plan's third question was whether the
  // two mail systems could share a zone; this is the same answer one level down.
  record(
    mx.some((r) => CLOUDFLARE_MX.includes(r.exchange)),
    'apex MX is still Cloudflare, unaffected by the subdomain MX',
    'inbound and outbound answer for different names'
  );

  const sendSpfRecords = sendTxt.filter((t) => /^v=spf1\b/i.test(t));
  record(
    sendSpfRecords.length === 1 && sendSpfRecords[0].includes(RESEND_SPF_INCLUDE),
    `exactly one SPF record on ${sendHost}, including ${RESEND_SPF_INCLUDE}`,
    sendSpfRecords.length === 1 ? sendSpfRecords[0] : `found ${sendSpfRecords.length}`
  );

  const resendKey = resendDkimTxt.find((t) => /(^|;)\s*p=[A-Za-z0-9+/]/.test(t));
  record(
    Boolean(resendKey),
    `DKIM ${RESEND_SELECTOR}._domainkey publishes a key`,
    resendKey ? `${resendKey.length} chars` : 'no key - every auth email will fail DMARC under p=quarantine'
  );

  // The mistake this catches is the exact one the Brevo step invited: Resend's
  // SPF belongs on the subdomain, and the instinct is to fold it into the SPF
  // record you already know about. Doing that spends an apex lookup, authorises
  // Amazon SES to send as the bare domain, and still does not help - the
  // Return-Path is on send.<domain>, so that is where the record is read.
  if (spf.includes(RESEND_SPF_INCLUDE)) {
    warn(
      `apex SPF also includes ${RESEND_SPF_INCLUDE}`,
      'Resend reads the record on the subdomain; this one is redundant and widens what may send as the bare domain'
    );
  }
}

console.log('\nOutbound - Brevo (Gmail "Send mail as" alias only, since the Resend switch)');

record(
  apexTxt.some((t) => /^brevo-code:/i.test(t)),
  'Brevo domain-ownership TXT present',
  apexTxt.find((t) => /^brevo-code:/i.test(t))
);

// These carried the auth mail before the Resend switch, and still carry the
// Gmail "Send mail as" alias, which relays through Brevo's SMTP. Kept asserted
// for that reason alone - deleting them because "we moved to Resend" would break
// a working alias whose dependency on this zone is invisible from the Resend
// dashboard. Measured while Brevo was carrying auth mail: dkim=pass
// header.i=@amplifiedthinker.com header.s=brevo2, DMARC passing on DKIM alone.
for (const sel of BREVO_SELECTORS) {
  const { cname, txt } = dkim[sel];
  const key = txt.find((t) => /(^|;)\s*p=[A-Za-z0-9+/]/.test(t));
  record(
    cname.some((h) => h.endsWith('.dkim.brevo.com')) && Boolean(key),
    `DKIM ${sel}._domainkey resolves to a published key`,
    key ? `via ${cname.join(', ')}` : 'CNAME present but no key resolved - Brevo has not published it'
  );
}

// Precaution, not the load-bearing record - and that was measured rather than
// assumed. A delivered message shows
// smtp.mailfrom=bounces-…@gw.d.sender-sib.com, so SPF is evaluated against
// Brevo's own bounce domain and never against this one. This include therefore
// does nothing for the current flow, and cannot align for DMARC either, since
// sender-sib.com and amplifiedthinker.com are different organisational domains.
//
// Kept anyway: Brevo documents it, it costs one lookup of ten, and it becomes
// load-bearing the moment a custom Return-Path on this domain is configured.
// Stated here so nobody later reads a green line as proof that SPF is what
// carries this mail. DKIM is. See the DMARC section below.
record(
  spf.includes(BREVO_SPF_INCLUDE),
  `SPF includes ${BREVO_SPF_INCLUDE} (precautionary - see comment)`,
  spf.includes(BREVO_SPF_INCLUDE)
    ? 'inert while Brevo uses its own Return-Path; DKIM is what aligns'
    : `not present - edit the existing TXT to: v=spf1 include:${CLOUDFLARE_SPF_INCLUDE} include:${BREVO_SPF_INCLUDE} ~all`
);

console.log('\nDMARC');

record(dmarcTxt.filter((t) => /^v=DMARC1/i.test(t)).length === 1, 'exactly one DMARC record', dmarcTxt[0]);

const dmarc = dmarcTxt.find((t) => /^v=DMARC1/i.test(t)) || '';
const policy = /\bp=([a-z]+)/i.exec(dmarc)?.[1];
if (policy) {
  // p=none would mean failures still land; p=quarantine or reject means a
  // misaligned send goes to spam or nowhere - which is exactly the outcome this
  // phase exists to prevent, so it is worth stating out loud rather than
  // discovering from a user who never got their password reset.
  record(true, `policy is p=${policy}`, policy === 'none' ? 'failures still deliver' : 'a misaligned send WILL be quarantined or rejected');
}
// Relaxed SPF alignment is what makes the Resend arrangement work at all, and it
// was already set here before Phase 4 - by luck rather than by design, so it is
// worth asserting before something tidies it.
//
// Resend's Return-Path is on send.<domain>. Under aspf=r, DMARC compares
// *organisational* domains: send.amplifiedthinker.com and amplifiedthinker.com
// match, so SPF aligns and DMARC has two passing mechanisms. Under aspf=s it
// would compare the names exactly, they would not match, and DMARC would fall
// back to DKIM alone - which is the single point of failure the switch was
// partly meant to remove. The tighter setting is the one that looks safer.
if (dmarc) {
  const aspf = /\baspf=([rs])/i.exec(dmarc)?.[1]?.toLowerCase() || 'r';
  record(
    aspf === 'r',
    'SPF alignment is relaxed (aspf=r)',
    aspf === 'r'
      ? `${sendHost} aligns with ${DOMAIN}, so SPF counts toward DMARC`
      : 'aspf=s - a Return-Path on a subdomain will NOT align; DMARC falls back to DKIM alone'
  );
}

const rua = /\brua=mailto:([^;,\s]+)/i.exec(dmarc)?.[1];
if (rua && !rua.endsWith(`@${DOMAIN}`)) {
  warn('DMARC aggregate reports go to a third party', `${rua} - you are not receiving them`);
}

console.log('\nWebsite records on the same zone (edited by hand this phase - confirm untouched)');

record(
  apexA.length > 0 && apexA.every((ip) => VERCEL_A_PREFIXES.some((p) => ip.startsWith(p))),
  'apex resolves into Vercel address space',
  apexA.join(', ') || 'none'
);
record(
  wwwCname.some((h) => h.endsWith('.vercel-dns-017.com') || h.includes('vercel')),
  'www still CNAMEs to Vercel',
  wwwCname.join(', ') || 'none'
);

// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
const warned = results.filter((r) => r.warn);
console.log(
  `\n${results.length - failed.length}/${results.length} passed` +
    (warned.length ? `, ${warned.length} warning${warned.length === 1 ? '' : 's'}` : '') +
    (failed.length ? `\n\nFailed:\n${failed.map((r) => `  - ${r.label}`).join('\n')}` : '') +
    '\n'
);
process.exit(failed.length ? 1 : 0);
