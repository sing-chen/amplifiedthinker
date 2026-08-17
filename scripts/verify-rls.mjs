// Phase 3 gate: prove the security model with the anon key alone.
//
//   npm run verify:rls
//
// The plan's wording is "every table returns zero rows when signed out, verified
// by direct query, not by the UI hiding things". This is that direct query. It
// talks to PostgREST over plain fetch - no supabase-js, no dependency - because
// the point is to test the database, not the client library that usually sits in
// front of it.
//
// Reads SUPABASE_URL and SUPABASE_ANON_KEY from the environment or from a local
// .env file. Never give it the service_role key: that key bypasses RLS entirely,
// so it would pass this suite while proving nothing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// What each table should do for an anonymous caller.
//
//   'denied' - anon holds no SELECT grant at all, so PostgREST refuses before
//              RLS is even consulted. This is the stronger of the two states and
//              is what every user-owned table must return.
//   'empty'  - anon may SELECT, and RLS plus the empty table yield []. From
//              Phase 6 these tables legitimately return published rows, so this
//              assertion is time-limited in a way the 'denied' ones are not.
// ---------------------------------------------------------------------------
const TABLES = [
  { name: 'profiles', read: 'denied' },
  { name: 'skill_progress', read: 'denied' },
  { name: 'user_news', read: 'denied' },
  { name: 'notes', read: 'denied' },
  { name: 'news_stories', read: 'empty' },
  { name: 'blog_posts', read: 'empty' },
  { name: 'blog_categories', read: 'empty' },
  { name: 'site_updates', read: 'empty' },
  { name: 'announcements', read: 'empty' },
];

// Minimal bodies that would satisfy each table's NOT NULL constraints, so a
// rejection is unambiguously the security model rather than a validation error.
const WRITE_PROBES = {
  profiles: { id: '00000000-0000-0000-0000-000000000001', display_name: 'rls probe' },
  skill_progress: {
    user_id: '00000000-0000-0000-0000-000000000001',
    skill_slug: 'rls-probe',
    content_type: 'plan',
  },
  user_news: {
    user_id: '00000000-0000-0000-0000-000000000001',
    story_id: '00000000-0000-0000-0000-000000000002',
  },
  notes: {
    user_id: '00000000-0000-0000-0000-000000000001',
    target_type: 'skill',
    target_id: 'rls-probe',
    body: 'rls probe',
  },
  news_stories: { slug: 'rls-probe', story_date: '2026-01-01', title: 'rls probe' },
  blog_posts: { slug: 'rls-probe', title: 'rls probe' },
  blog_categories: { slug: 'rls-probe', name: 'rls probe' },
  site_updates: { update_date: '2026-01-01', body: 'rls probe' },
  announcements: { type: 'feature', announce_date: '2026-01-01', text_html: 'rls probe' },
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadDotEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // No .env is fine - the values may come from the real environment.
  }
}

loadDotEnv();

const URL_BASE = (process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY || '';

if (!URL_BASE || !ANON_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY.\n' +
      'Copy .env.example to .env and fill in the project URL and anon key\n' +
      '(Supabase dashboard -> Project Settings -> API).'
  );
  process.exit(2);
}

// Refuse anything that is not an anon/publishable key. This matters more than it
// looks: a privileged key bypasses RLS, so every assertion below would report a
// false PASS and the gate would certify nothing - the single worst outcome for a
// script whose entire job is proving the security model.
//
// Two key formats to recognise, and the prefix check has to come FIRST. The newer
// `sb_secret_…` keys are not JWTs, so a decode-and-inspect approach throws, lands
// in the catch, and waves them through - which is precisely backwards. Kept in
// step with keyProblem() in src/pages/auth-test.astro.
function keyProblem(key) {
  if (/^sb_secret_/i.test(key)) return 'that is a secret key';
  if (/^service_role/i.test(key)) return 'that is a service_role key';

  const parts = key.split('.');
  if (parts.length !== 3) return null; // not a JWT we can read - allow

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role && payload.role !== 'anon') {
      return `that key has role "${payload.role}", not "anon"`;
    }
  } catch {
    return null; // undecodable - allow, the assertions themselves still hold
  }
  return null;
}

const problem = keyProblem(ANON_KEY);
if (problem) {
  console.error(`Refusing to run: ${problem}.`);
  console.error('It bypasses RLS and would pass this suite while proving nothing.');
  console.error('Use the anon / publishable key from Project Settings -> API Keys.');
  process.exit(2);
}

const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
}

async function readTable(name) {
  const res = await fetch(`${URL_BASE}/rest/v1/${name}?select=*&limit=5`, { headers });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function writeTable(name) {
  const res = await fetch(`${URL_BASE}/rest/v1/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(WRITE_PROBES[name]),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

console.log(`\nPhase 3 RLS gate\n  project: ${URL_BASE}\n  key role: anon\n`);

console.log('Reads (signed out)');
for (const { name, read } of TABLES) {
  const { status, body } = await readTable(name);

  if (read === 'denied') {
    const denied = status === 401 || status === 403;
    record(denied, `${name}: anon SELECT refused`, denied ? `HTTP ${status}` : `HTTP ${status}, body ${JSON.stringify(body)?.slice(0, 120)}`);
  } else {
    const empty = status === 200 && Array.isArray(body) && body.length === 0;
    record(
      empty,
      `${name}: anon SELECT returns zero rows`,
      empty ? 'HTTP 200, []' : `HTTP ${status}, body ${JSON.stringify(body)?.slice(0, 120)}`
    );
  }
}

console.log('\nWrites (signed out) - every one must be rejected');
for (const { name } of TABLES) {
  const { status, body } = await writeTable(name);
  const rejected = status === 401 || status === 403 || status === 404 || status === 405;

  record(
    rejected,
    `${name}: anon INSERT rejected`,
    rejected ? `HTTP ${status}` : `HTTP ${status} - A ROW MAY HAVE BEEN WRITTEN. Body: ${JSON.stringify(body)?.slice(0, 200)}`
  );
}

// Functions reachable at /rest/v1/rpc/ are part of the attack surface, and every
// one of these is SECURITY DEFINER - they run as their owner, not the caller.
// Anonymous callers should not be able to invoke any of them.
//
// `is_admin` was previously asserted to return `false` here. That was a weaker
// claim: it proved the function answered harmlessly rather than that anon could
// not reach it. The 20260817140000 migration revoked anon's EXECUTE, so the
// assertion is now the stronger one. `authenticated` keeps EXECUTE, because RLS
// policy expressions are evaluated with the querying role's privileges.
console.log('\nSECURITY DEFINER functions (signed out) - all must be unreachable');
for (const fn of ['is_admin', 'handle_new_user', 'profiles_guard_privileged_columns', 'rls_auto_enable']) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* a body is not needed to judge this */
  }

  // 404 counts: rls_auto_enable only exists when the "Enable automatic RLS"
  // project setting was chosen, and a function anon cannot see is a function
  // anon cannot call.
  const unreachable = res.status === 401 || res.status === 403 || res.status === 404;
  record(
    unreachable,
    `${fn}(): not callable by anon`,
    unreachable ? `HTTP ${res.status}` : `HTTP ${res.status} - REACHABLE. Body: ${JSON.stringify(body)?.slice(0, 120)}`
  );
}

// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);

if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  - ${f.label}: ${f.detail}`);
  console.log(
    '\nThis gate is the phase. Do not merge, and do not insert any data, until it is green.'
  );
  process.exit(1);
}

console.log('Gate green: with the anon key alone, nothing reads and nothing writes.');
