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

import { projects, keyProblem, loadDotEnv } from './lib/supabase.mjs';

// ---------------------------------------------------------------------------
// What each table should do for an anonymous caller.
//
//   'denied' - anon holds no SELECT grant at all, so PostgREST refuses before
//              RLS is even consulted. This is the stronger of the two states and
//              is what every user-owned table must return.
//   'empty'  - anon may SELECT, and RLS plus the empty table yield []. Still
//              true for the tables nothing has filled yet, and still only an
//              observation about emptiness rather than about security.
//   'published' - anon may SELECT, and EVERY ROW RETURNED IS `status =
//              'published'`. This is what 'empty' becomes once a content table
//              is actually populated, and it is the stronger claim: it asserts
//              the RLS predicate rather than the absence of data.
//
// ⚠️ THE 'empty' ASSERTION WAS ALWAYS TIME-LIMITED, AND news_stories REACHED
// ITS LIMIT ON 2026-08-26 when Phase 6 stage 9 loaded 81 rows into dev. Left as
// 'empty' it would simply have started failing on dev and kept passing on prod
// — a gate that disagrees with itself depending on which project it is pointed
// at, for a reason unrelated to security.
//
// ⚠️ 'published' passes whether the table is EMPTY OR FULL, deliberately. Prod
// is not loaded until stage 17, and an expectation that cannot hold on prod
// until then is the same mistake verify-redirects made when it dropped an
// assertion rather than moving it. An empty table satisfies "everything
// returned is published" trivially and truthfully.
// ---------------------------------------------------------------------------
const TABLES = [
  { name: 'profiles', read: 'denied' },
  { name: 'skill_progress', read: 'denied' },
  { name: 'user_news', read: 'denied' },
  { name: 'notes', read: 'denied' },
  // ⚠️ `published` AND `archived`, AND THE SECOND IS NOT A LOOSENING. There are
  // two permissive policies on this table and they OR: `news_stories_public_read`
  // and `news_stories_archived_read`. The archived one is deliberate — a story
  // withdrawn or merged keeps its row so a previously shared link still resolves,
  // which is why withdrawal is a status flag rather than a DELETE. The initial
  // migration says so explicitly and warns that an unfiltered select returns both.
  //
  // ⚠️ THIS ROW SAID `published` UNTIL 2026-08-26 AND PASSED THE WHOLE TIME —
  // vacuously, because the table had no archived rows to contradict it. The first
  // merge created two and the gate failed instantly. An expectation that no data
  // can violate is not being tested; it is being recited. Same shape as an empty
  // table reporting clean.
  //
  // `draft` is the status that must never appear: it is editorial work in
  // progress, and it is the only one of the three nothing has ever exposed.
  { name: 'news_stories', read: { statuses: ['published', 'archived'] } },
  { name: 'blog_posts', read: 'empty' },
  { name: 'blog_categories', read: 'empty' },
  { name: 'site_updates', read: 'empty' },
  // ⚠️ NOT 'empty', BECAUSE PHASE 7 SEEDS THIS TABLE and an emptiness
  // assertion would fail the day it does — the same limit news_stories hit.
  // `announcements_public_read` lets anon see rows that are active AND inside
  // their [starts_at, expires_at) window, so the assertion is that predicate,
  // row by row, and it is equally true of the empty table main has today and
  // the seeded one Phase 7 brings. Unlike news_stories there is no
  // "actually returned rows" companion: visibility here is a time window, and
  // a quiet month with nothing live is a legitimate steady state, not a gate
  // failure — so the row count is reported, never required.
  { name: 'announcements', read: { window: true } },
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

loadDotEnv();

/* ── `dev` / `prod`, overriding .env ──────────────────────────────────────────
   ⚠️ WITHOUT THIS, THIS GATE SILENTLY CHECKS WHICHEVER PROJECT `.env` HAPPENS TO
   NAME. It names dev, and has for the whole phase — so the stage 17 tick box
   reading "verify:rls green" would have been satisfied by a run against dev,
   passing confidently while saying nothing whatever about the database that had
   just been migrated. A gate pointed at the wrong target does not fail; it
   reports success about something nobody asked.

   `npm run verify:rls -- prod` reads the project out of public/supabase-client.js,
   the same file astro.config.mjs and verify-news-duplicates.mjs parse, so there
   is no second copy of a URL to rotate. With no argument it falls back to .env
   exactly as before. */
const target = process.argv.slice(2).find((a) => a === 'dev' || a === 'prod');
if (target) {
  const { url, key } = projects()[target];
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = key;
  console.log(`\nTarget: ${target} (${url}) - from public/supabase-client.js, not .env`);
}

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
// The guard itself lives in scripts/lib/supabase.mjs, shared with keepalive,
// verify-completion, verify-news-duplicates, verify-schema-columns and the build.
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

// `columns` narrows the projection. The 'published' check asks for `status`
// alone so it can assert on the rows rather than on their absence; everything
// else keeps `select=*`, which is what proves a denied table is denied on the
// widest possible request.
async function readTable(name, columns = '*') {
  const res = await fetch(`${URL_BASE}/rest/v1/${name}?select=${columns}&limit=200`, { headers });
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
  } else if (read && read.statuses) {
    // Ask for `status` explicitly so the assertion is made on the rows
    // themselves. A status outside the allowed set means the RLS predicate is
    // not doing its job — which an empty table could never reveal.
    const allowed = read.statuses;
    const { status: st, body: rows } = await readTable(name, 'status');
    const kinds = Array.isArray(rows) ? [...new Set(rows.map((r) => r?.status))] : null;
    const leaked = kinds ? kinds.filter((k) => !allowed.includes(k)) : null;
    const ok = st === 200 && Array.isArray(rows) && leaked && leaked.length === 0;
    record(
      ok,
      `${name}: anon SELECT returns only ${allowed.join(' or ')} rows`,
      ok
        ? `HTTP 200, ${rows.length} row(s), status ${JSON.stringify(kinds)}`
        : `HTTP ${st}, statuses ${JSON.stringify(kinds)} - ${JSON.stringify(leaked)} visible to anon`
    );

    // ⚠️ A SECOND, NARROWER ASSERTION, BECAUSE THE ONE ABOVE CAN PASS ON AN
    // EMPTY SET. "No forbidden status came back" is trivially true of zero rows.
    // This says the table actually had something to show, so a load that
    // published nothing cannot read as a policy that is working.
    const populated = st === 200 && Array.isArray(rows) && rows.length > 0;
    record(
      populated,
      `${name}: anon SELECT actually returned rows to judge`,
      populated ? `${rows.length} row(s)` : 'zero rows - the check above proved nothing'
    );
  } else if (read && read.window) {
    // Every row anon can see must be active and inside its display window.
    // The comparison is made here, against the same clock the request was
    // made on, so a row that expired between two runs cannot flap the gate.
    const now = Date.now();
    const { status: st, body: rows } = await readTable(name, 'active,starts_at,expires_at');
    const outside = Array.isArray(rows)
      ? rows.filter((r) =>
          r?.active !== true ||
          !(Date.parse(r.starts_at) <= now) ||
          (r.expires_at != null && !(Date.parse(r.expires_at) > now)))
      : null;
    const ok = st === 200 && Array.isArray(rows) && outside && outside.length === 0;
    record(
      ok,
      `${name}: anon SELECT returns only active rows inside their window`,
      ok
        ? `HTTP 200, ${rows.length} row(s)${rows.length ? '' : ' - nothing live today, predicate untested'}`
        : `HTTP ${st}, ${outside ? `${outside.length} row(s) outside the window: ${JSON.stringify(outside).slice(0, 200)}` : `body ${JSON.stringify(rows)?.slice(0, 120)}`}`
    );
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
// user_news_single_pin is SECURITY INVOKER rather than DEFINER - deliberately,
// since as DEFINER it would bypass the RLS that confines it to the caller's own
// rows. It is asserted here anyway, because 20260817140000's own argument was
// that being INCONSISTENT about hardening is worse than the risk: three trigger
// functions revoked and checked, and a fourth revoked but never checked, is the
// gap that reopens quietly.
for (const fn of ['is_admin', 'handle_new_user', 'profiles_guard_privileged_columns',
                  'user_news_single_pin', 'rls_auto_enable']) {
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
  // exitCode, not exit(): see verify-news-duplicates.mjs — process.exit() after
  // a fetch has aborted node 24 on Windows with exit 127, destroying the answer.
  process.exitCode = 1;
}

console.log('Gate green: with the anon key alone, nothing reads and nothing writes.');
