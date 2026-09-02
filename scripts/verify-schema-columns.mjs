// Did the migration actually land? Answered with the anon key alone.
//
//   npm run verify:schema
//
// ---------------------------------------------------------------------------
// WHY THIS WORKS WITHOUT A PRIVILEGED KEY, which is the whole trick
// ---------------------------------------------------------------------------
//
// PostgREST parses the `select` list BEFORE it checks privileges, so the two
// failures are distinguishable from outside:
//
//   400 + "column … does not exist"   -> the column is not there
//   401 + 42501 "permission denied"   -> the column IS there, and anon simply
//                                        holds no grant on the table
//
// That second case is a PASS here. `profiles` grants SELECT to `authenticated`
// only, so 42501 is exactly what an anonymous caller should get — the same
// signal `npm run verify:rls` asserts as the strong state. This script is not
// checking access; it is checking EXISTENCE, and it treats "you may not look at
// this" as proof that there is something to look at.
//
// ⚠️ Never give this the service_role key. It would still pass, and it would
// stop telling you anything about the grants at the same time.
//
// ---------------------------------------------------------------------------
// WHERE THE CREDENTIALS COME FROM, AND WHY NOT .env
// ---------------------------------------------------------------------------
//
// From `public/supabase-client.js`, by RUNNING it — twice, with a fake hostname
// each time — and asking it for its own config. Not from .env, and not from a
// second copy of the URLs pasted into this file.
//
// Three reasons, and the third is the one that matters:
//
//   1. .env names ONE project. Checking prod would mean editing it, which is
//      how you end up verifying dev twice and believing you checked both.
//   2. The URL and publishable key are public by design — they ship in the
//      browser on every page — so there is no secret to protect here.
//   3. ⚠️ It verifies the project the DEPLOYED CODE WILL ACTUALLY TALK TO,
//      including the hostname mapping. A pasted URL would still pass if
//      `environment()` were changed to send production traffic somewhere else.
//      That mapping is the exact thing supabase-client.js warns is a bug
//      waiting to happen, so it is worth exercising rather than assuming.

const HOSTS = [
  { label: 'prod', host: 'amplifiedthinker.com', note: 'what amplifiedthinker.com uses' },
  // ⚠️ Kept after the Pages origin was retired on 2026-08-26. It is no longer a
  // real host, and that is exactly what makes it the right case: it stands for
  // ANY host not on the blocklist, which must map to prod. Replacing it with a
  // second real hostname would test the blocklist's known entries twice and its
  // fail-safe default not at all.
  { label: 'prod', host: 'not-on-the-blocklist.example', note: 'any unlisted host must be prod' },
  { label: 'dev',  host: 'localhost',           note: 'what localhost and previews use' },
];

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// What each migration added, so a run says which one is missing rather than
// just which column. Add a row here whenever a migration adds a column.
const EXPECTED = [
  { table: 'profiles', column: 'id',                 since: 'initial_schema' },
  { table: 'profiles', column: 'display_name',       since: 'initial_schema' },
  { table: 'profiles', column: 'wants_updates',      since: '20260820070000_profiles_wants_updates' },
  { table: 'profiles', column: 'updates_consent_at', since: '20260820070000_profiles_wants_updates' },

  // ⚠️ EXPECT THIS TO FAIL ON PROD UNTIL THE NOTES-ON-SKILLS GO-LIVE, AND THAT
  // IS THE CHECK WORKING. dev is migrated first and prod immediately before the
  // merge, so between those two moments the honest answer is "dev yes, prod
  // no". A row added here only after prod is migrated would make this script
  // agree with whatever happened to be true, which is not a check.
  { table: 'notes',    column: 'anchor',             since: '20260827090000_notes_anchor' },
];

const clientSrc = readFileSync(join(ROOT, 'public', 'supabase-client.js'), 'utf8');

// Runs the real file against a stub `window`. It only touches `location` and
// `console`, and returns null rather than throwing when it cannot build a
// client — so nothing here needs a browser.
function configFor(hostname) {
  const stub = {
    location: { hostname, protocol: 'https:' },
    console: { warn() {} },
  };
  new Function('window', clientSrc)(stub);
  return stub.AmplifiedSupabase.config();
}

// ---------------------------------------------------------------------------
// TLS interception, which is an environment problem wearing a code problem's
// clothes.
//
// Node ships its OWN CA bundle and ignores the Windows trust store. A corporate
// proxy, VPN or AV doing HTTPS inspection presents a certificate signed by a
// root that Windows trusts and Node does not, so every fetch here dies with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE — as an unhandled rejection and a stack
// trace, which reads as "the script is broken" rather than "you are on a
// different network than last time".
//
// ⚠️ THE FIX IS NEVER NODE_TLS_REJECT_UNAUTHORIZED=0. That disables
// certificate checking for the whole process, on a script whose entire job is
// to make a trustworthy statement about a remote database. `--use-system-ca`
// tells Node to trust what Windows already trusts, which is the actual intent.
//
// Not added to the npm script by default: the flag needs Node >= 22.15, and an
// older Node fails on the unknown flag before it runs a line — trading a clear
// error for an obscure one.
function tlsAdvice(err) {
  const code = err?.cause?.code || err?.code || '';
  if (!/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|LEAF_SIGNATURE/i.test(code)) return null;
  return [
    '',
    `TLS could not be verified (${code}).`,
    '',
    'Something is inspecting HTTPS between you and Supabase — a corporate proxy,',
    'VPN or antivirus. Its root CA is trusted by Windows; Node uses its own bundle',
    'and does not see it. Re-run trusting the system store:',
    '',
    '  node --use-system-ca scripts/verify-schema-columns.mjs',
    '',
    'or for the whole session:',
    '',
    '  $env:NODE_OPTIONS = "--use-system-ca"',
    '',
    'The same applies to verify:rls, verify:email and verify:redirects.',
    'Do NOT set NODE_TLS_REJECT_UNAUTHORIZED=0 — it switches off the check these',
    'scripts exist to make.',
    '',
  ].join('\n');
}

async function probe({ table, column }, url, key) {
  let res;
  try {
    res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  } catch (err) {
    const advice = tlsAdvice(err);
    // A TLS failure is environmental and stops the run: rethrow so the top
    // level reports it and sets the exit code. Never process.exit() here —
    // after a fetch that has aborted node 24 on Windows with exit 127 (see
    // verify-news-duplicates.mjs), which would turn "cannot verify" into
    // "command not found".
    if (advice) throw new Error(advice);
    return { ok: false, note: `network error: ${err?.cause?.code || err.message}` };
  }
  const body = await res.text();

  if (res.status === 200) return { ok: true, note: 'exists, and readable by anon' };
  if (/does not exist/i.test(body)) return { ok: false, note: 'MISSING' };
  if (res.status === 401 || /42501/.test(body)) return { ok: true, note: 'exists (anon denied, as designed)' };
  return { ok: false, note: `unexpected ${res.status}: ${body.slice(0, 120)}` };
}

// One check per distinct project, but reported per hostname, so the output
// answers "is the site I am about to deploy going to find these columns?"
// rather than "does some project have them".
const seen = new Map();
const results = [];

for (const entry of HOSTS) {
  const cfg = configFor(entry.host);

  if (/^sb_secret_/.test(cfg.key) || /service_role/.test(cfg.key)) {
    console.error(`\n${entry.host} resolves to a privileged key. Stopping — see the note at the top of this file.\n`);
    process.exit(2);
  }

  const ref = (cfg.url.match(/https:\/\/([^.]+)\./) || [])[1] || cfg.url;

  if (!seen.has(ref)) {
    const rows = [];
    for (const spec of EXPECTED) rows.push([spec, await probe(spec, cfg.url, cfg.key)]);
    seen.set(ref, rows);
  }
  results.push({ ...entry, ref, rows: seen.get(ref) });
}

let anyMissing = false;
let prodMissing = false;

for (const r of results) {
  const missing = r.rows.filter(([, res]) => !res.ok);
  if (missing.length) {
    anyMissing = true;
    if (r.label === 'prod') prodMissing = true;
  }

  console.log(`\n${r.host}  ->  ${r.ref}  (${r.label}, ${r.note})`);
  for (const [spec, res] of r.rows) {
    console.log(`  ${res.ok ? 'ok  ' : 'FAIL'} ${spec.table}.${spec.column.padEnd(20)} ${res.ok ? res.note : `MISSING — added by ${spec.since}`}`);
  }
}

// ⚠️ The merge gate is about PROD, not about "everything passed". Dev is
// allowed to be ahead — that is the normal state while a phase is in progress.
// Prod being behind is the one that breaks a deploy, because the moment `main`
// carries code naming a column, prod has to already have it.
console.log(
  prodMissing
    ? '\n❌ NOT SAFE TO MERGE — production is missing columns the code will name.\n' +
      '   Apply the migration to prod first: schema leads code by one step.\n'
    : anyMissing
      ? '\n⚠️  Production has everything. A non-production project is behind, which is\n' +
        '   normal mid-phase and does not block a merge.\n'
      : '\n✅ Every project has every column. Safe to merge on this check.\n'
);

// exitCode, not exit(): see verify-news-duplicates.mjs — process.exit() after a
// fetch has aborted node 24 on Windows with exit 127, which would make "not
// safe to merge" and "safe" report the same code.
process.exitCode = prodMissing ? 1 : 0;
