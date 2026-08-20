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
// It reads the same .env as verify:rls, so it points at whichever project that
// file names — dev, unless someone has deliberately repointed it. The project
// ref is printed on every run, because "I applied it to the other project" is
// the failure this is most likely to be run in the middle of.

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
];

function readEnv() {
  const fromProcess = {
    url: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  };
  if (fromProcess.url && fromProcess.key) return fromProcess;

  let text = '';
  try { text = readFileSync(join(ROOT, '.env'), 'utf8'); } catch { return fromProcess; }
  const pick = (name) => (text.match(new RegExp(`^${name}=(.*)$`, 'm')) || [])[1]?.trim();
  return {
    url: fromProcess.url || pick('PUBLIC_SUPABASE_URL') || pick('SUPABASE_URL'),
    key: fromProcess.key || pick('PUBLIC_SUPABASE_ANON_KEY') || pick('SUPABASE_ANON_KEY'),
  };
}

const { url, key } = readEnv();

if (!url || !key) {
  console.error('Missing PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. See .env.example.');
  process.exit(2);
}

// The one input that would make every check pass while proving nothing.
if (/^sb_secret_/.test(key) || /service_role/.test(key)) {
  console.error('That is a privileged key. Use the publishable/anon key — see the note at the top of this file.');
  process.exit(2);
}

async function probe({ table, column }) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const body = await res.text();

  if (res.status === 200) return { ok: true, note: 'exists, and readable by anon' };
  if (/does not exist/i.test(body)) return { ok: false, note: 'MISSING' };
  if (res.status === 401 || /42501/.test(body)) return { ok: true, note: 'exists (anon denied, as designed)' };
  return { ok: false, note: `unexpected ${res.status}: ${body.slice(0, 120)}` };
}

const ref = (url.match(/https:\/\/([^.]+)\./) || [])[1] || url;
console.log(`\nProject: ${ref}\n`);

let failed = 0;
for (const spec of EXPECTED) {
  const r = await probe(spec);
  if (!r.ok) failed++;
  const mark = r.ok ? 'ok  ' : 'FAIL';
  console.log(`${mark} ${spec.table}.${spec.column.padEnd(20)} ${r.note}${r.ok ? '' : `  (added by ${spec.since})`}`);
}

console.log(
  failed
    ? `\n${failed} column(s) missing — the migration that adds them has not been applied to ${ref}.\n`
    : `\nAll ${EXPECTED.length} columns present on ${ref}.\n`
);
process.exit(failed ? 1 : 0);
