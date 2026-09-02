// Answers one question: is .env pointing at a reachable project, with a key of
// the right kind?
//
//   npm run check:conn
//
// Deliberately separate from verify:rls. That script asserts the security model
// and only means anything once the schema exists; this one runs before it, and
// its whole job is to make a later failure attributable. If the gate fails after
// this passes, the problem is the schema or the policies - not the credentials.
//
// It earns its keep again at Phase 5, when dev and prod projects both exist and
// "which one is this machine pointing at?" becomes a question worth asking before
// every run.
//
// Never prints the key.

import { keyProblem, loadDotEnv } from './lib/supabase.mjs';

loadDotEnv();

const url = (process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in.');
  process.exit(2);
}

// The same guard every other script uses, read back as a label for the report.
function keyKind(k) {
  const problem = keyProblem(k);
  if (problem) return { label: `WRONG KEY - ${problem}, it bypasses RLS`, ok: false };
  if (/^sb_publishable_/i.test(k)) return { label: 'publishable', ok: true };
  if (k.split('.').length === 3) return { label: 'legacy JWT, role "anon"', ok: true };
  return { label: 'unrecognised format', ok: true };
}

const kind = keyKind(key);
const headers = { apikey: key, Authorization: `Bearer ${key}` };

console.log(`\nproject : ${url}`);
console.log(`key     : ${key.length} chars, ${kind.label}`);

if (!kind.ok) {
  console.error('\nRefusing to continue - use the publishable / anon key.');
  process.exit(2);
}

// Two probes, chosen because between them they separate "credentials wrong" from
// "schema not there yet", which is the distinction this script exists to draw.
//
// NOT the /rest/v1/ root: under the new key system that endpoint answers only to
// a secret key, so a publishable key gets a 401 that looks exactly like a bad
// credential and is nothing of the sort. Querying a table PostgREST cannot find
// is the honest test - a 404 there means the key was accepted and the lookup ran.
let failed = false;

try {
  const auth = await fetch(`${url}/auth/v1/settings`, { headers });
  const ok = auth.status === 200;
  console.log(`auth API: HTTP ${auth.status}${ok ? '  reachable, key accepted' : '  <-- key or URL is wrong'}`);
  if (!ok) failed = true;
} catch (e) {
  console.log(`auth API: network error - ${e.message}`);
  failed = true;
}

try {
  const probe = await fetch(`${url}/rest/v1/definitely_not_a_table?select=*`, { headers });
  const body = await probe.json().catch(() => ({}));

  if (probe.status === 404 && body.code === 'PGRST205') {
    console.log('rest API: HTTP 404 PGRST205  reachable; that table does not exist, which is the expected answer');
  } else if (probe.status === 401) {
    console.log('rest API: HTTP 401  key rejected  <-- check the key');
    failed = true;
  } else {
    console.log(`rest API: HTTP ${probe.status}  ${JSON.stringify(body).slice(0, 120)}`);
  }
} catch (e) {
  console.log(`rest API: network error - ${e.message}`);
  failed = true;
}

// Whether the schema is there at all - context, never a pass/fail. A project
// rebuilt from scratch answers 404 here until the migrations are applied.
try {
  const res = await fetch(`${url}/rest/v1/news_stories?select=id&limit=1`, { headers });
  console.log(
    res.status === 404
      ? '\nschema  : not applied yet (news_stories not found) - apply supabase/migrations/ first'
      : `\nschema  : applied (news_stories responds HTTP ${res.status})`
  );
} catch {
  /* already reported above */
}

console.log(failed ? '\nSomething is wrong with the connection.' : '\nConnection good.');
// exitCode, not exit(): see verify-news-duplicates.mjs — process.exit() after a
// fetch has aborted node 24 on Windows with exit 127, destroying the answer.
process.exitCode = failed ? 1 : 0;
