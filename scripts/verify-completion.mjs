// Proves the completion write path against the DEV project, as a signed-in user.
//
//   TEST_EMAIL=… TEST_PASSWORD=… npm run verify:completion
//
// WHY THIS EXISTS AND WHY IT IS NOT verify:rls. That gate proves the security
// model with the anon key alone, and deliberately refuses a privileged one. It
// therefore cannot reach any of the assertions below, every one of which needs
// `auth.uid()` to be somebody.
//
// Two of these are load-bearing assumptions in public/progress.js that were
// taken from documentation rather than from observation:
//
//   * an upsert carrying ONLY completed_at must leave state, visited and
//     position untouched. If PostgREST replaced the row instead, pressing
//     "I've completed this" would silently wipe someone's progress.
//   * clear() must keep completed_at when there is one. If it did not,
//     re-reading a plan finished in March would quietly erase the fact that it
//     was finished, and nothing would say so.
//
// The dashboard will depend on both, which is why this is a script and not a
// one-off look in a browser.
//
// ⚠️ IT WRITES AND DELETES skill_progress ROWS FOR THE ACCOUNT IT SIGNS IN AS.
// That is why it refuses to run against production - see PROD_REF below. It
// also uses a slug no real skill has, so it can never touch real progress even
// on the project it is allowed to run against.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A slug with no page behind it. Real progress is never in range.
const PROBE_SLUG = 'zzz-verify-completion-probe';
const PROBE_KIND = 'plan';

// From public/supabase-client.js. Kept here as a REF rather than a full URL so
// the check still fires if the URL is given with a trailing slash or a
// different scheme.
const PROD_REF = 'spehmrgmcdenqdftkyrt';

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
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

if (!URL_BASE || !ANON_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY.\n' +
      'Copy .env.example to .env and fill in the project URL and anon key.'
  );
  process.exit(2);
}

if (!EMAIL || !PASSWORD) {
  console.error(
    'Missing TEST_EMAIL / TEST_PASSWORD.\n\n' +
      'This gate signs in, so it needs an account on the DEV project. Pass them\n' +
      'for the one run rather than storing them:\n\n' +
      '  TEST_EMAIL=you@example.com TEST_PASSWORD=… npm run verify:completion\n'
  );
  process.exit(2);
}

// ⚠️ THE PRODUCTION GUARD. Everything below writes and deletes rows for the
// account it signs in as. Against production that would be someone's real
// reading history, and the account most likely to be to hand is the owner's.
// Refusing is not caution, it is the difference between a test and an incident.
if (URL_BASE.includes(PROD_REF)) {
  console.error(
    'Refusing to run: that is the PRODUCTION project.\n\n' +
      'This gate writes and deletes skill_progress rows for the account it signs\n' +
      'in as. Point SUPABASE_URL at the dev project and run it again.'
  );
  process.exit(2);
}

// Same reasoning as verify:rls, and the same ordering trap: the prefix check has
// to come before the JWT decode, because sb_secret_… keys are not JWTs and would
// otherwise fall through the catch and be waved past. A privileged key here
// bypasses RLS, so assertion 5 would report a false PASS.
function keyProblem(key) {
  if (/^sb_secret_/i.test(key)) return 'that is a secret key';
  if (/^service_role/i.test(key)) return 'that is a service_role key';
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role && payload.role !== 'anon') {
      return `that key has role "${payload.role}", not "anon"`;
    }
  } catch {
    return null;
  }
  return null;
}

const problem = keyProblem(ANON_KEY);
if (problem) {
  console.error(`Refusing to run: ${problem}. This gate must run as a real user, not above RLS.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------

const results = [];
function record(ok, label, detail) {
  results.push({ ok, label, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
}

const anonHeaders = { apikey: ANON_KEY, 'Content-Type': 'application/json' };

async function signIn() {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    console.error(
      `\nSign-in failed (HTTP ${res.status}): ${body?.error_description || body?.msg || 'no token'}\n` +
        'The account must exist on the dev project and be confirmed - dev has\n' +
        'mailer_autoconfirm false, so a fresh signup needs its email clicking first.'
    );
    process.exit(2);
  }
  return { token: body.access_token, userId: body.user?.id };
}

const { token, userId } = await signIn();
const auth = { ...anonHeaders, Authorization: `Bearer ${token}` };

const ROW = `${URL_BASE}/rest/v1/skill_progress`;
const FILTER = `skill_slug=eq.${PROBE_SLUG}&content_type=eq.${PROBE_KIND}`;

async function readProbe() {
  const res = await fetch(`${ROW}?${FILTER}&select=*`, { headers: auth });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function deleteProbe() {
  await fetch(`${ROW}?${FILTER}`, { method: 'DELETE', headers: auth });
}

// Start from nothing, whatever a previous run left behind.
await deleteProbe();

console.log(`\nSigned in as ${EMAIL} on ${URL_BASE.replace(/^https?:\/\//, '')}`);
console.log(`Probe row: ${PROBE_SLUG} / ${PROBE_KIND}\n`);

// ---------------------------------------------------------------------------
// 2. Upsert creates the row when there is none.
//    Someone can reach the end of a plan and press the button before a single
//    scroll has created anything.
// ---------------------------------------------------------------------------
console.log('Creating a completion with no existing row');
{
  const stamp = new Date().toISOString();
  const res = await fetch(`${ROW}?on_conflict=user_id,skill_slug,content_type`, {
    method: 'POST',
    headers: { ...auth, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: userId,
      skill_slug: PROBE_SLUG,
      content_type: PROBE_KIND,
      completed_at: stamp,
    }),
  });
  const row = await readProbe();
  record(res.ok && !!row, 'upsert creates the row', `HTTP ${res.status}`);
  record(!!row && !!row.completed_at, 'completed_at is set', row ? String(row.completed_at) : 'no row');
  record(!!row && !!row.started_at, 'started_at defaulted', row ? String(row.started_at) : 'no row');
}

// ---------------------------------------------------------------------------
// 1. THE LOAD-BEARING ONE. An upsert carrying only completed_at must leave the
//    progress columns alone. If this fails, the control as written destroys
//    progress every time it is pressed.
// ---------------------------------------------------------------------------
console.log('\nCompleting a row that already holds progress');
{
  await deleteProbe();

  const visited = ['snapshot', 'overview', 'objectives'];
  const state = { section: 'objectives', visited, total: 13, quizRevealed: true };

  await fetch(`${ROW}?on_conflict=user_id,skill_slug,content_type`, {
    method: 'POST',
    headers: { ...auth, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      skill_slug: PROBE_SLUG,
      content_type: PROBE_KIND,
      position: 'objectives',
      visited,
      state,
    }),
  });

  const before = await readProbe();

  await fetch(`${ROW}?on_conflict=user_id,skill_slug,content_type`, {
    method: 'POST',
    headers: { ...auth, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId,
      skill_slug: PROBE_SLUG,
      content_type: PROBE_KIND,
      completed_at: new Date().toISOString(),
    }),
  });

  const after = await readProbe();

  record(!!after?.completed_at, 'completed_at written', after ? String(after.completed_at) : 'no row');
  record(
    JSON.stringify(after?.visited) === JSON.stringify(before?.visited),
    'visited survives the completion write',
    `before ${JSON.stringify(before?.visited)} / after ${JSON.stringify(after?.visited)}`
  );
  record(
    JSON.stringify(after?.state) === JSON.stringify(before?.state),
    'state survives the completion write',
    after?.state ? `total=${after.state.total}` : 'missing'
  );
  record(after?.position === before?.position, 'position survives the completion write',
    `${before?.position} -> ${after?.position}`);
}

// ---------------------------------------------------------------------------
// 3. Undo.
// ---------------------------------------------------------------------------
console.log('\nUndoing a completion');
{
  const res = await fetch(`${ROW}?${FILTER}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ completed_at: null }),
  });
  const row = await readProbe();
  record(res.ok && row?.completed_at === null, 'completed_at clears to null',
    `HTTP ${res.status}, value ${JSON.stringify(row?.completed_at)}`);
  record(JSON.stringify(row?.visited) !== '[]' && !!row?.visited?.length,
    'undo leaves progress alone', `visited ${JSON.stringify(row?.visited)}`);
}

// ---------------------------------------------------------------------------
// 4. THE OTHER LOAD-BEARING ONE. clear() blanks progress but keeps the
//    completion, so "Start over" is about re-reading rather than about undoing
//    an achievement.
// ---------------------------------------------------------------------------
console.log('\n"Start over" on a completed plan');
{
  await fetch(`${ROW}?${FILTER}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ completed_at: new Date().toISOString() }),
  });

  const res = await fetch(`${ROW}?${FILTER}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ state: {}, visited: [], position: null }),
  });
  const row = await readProbe();

  record(res.ok, 'progress columns blanked', `HTTP ${res.status}`);
  record(!!row?.completed_at, 'completed_at SURVIVES starting over',
    row ? String(row.completed_at) : 'no row');
  record(JSON.stringify(row?.visited) === '[]', 'visited emptied',
    JSON.stringify(row?.visited));
  record(row?.position === null, 'position cleared', JSON.stringify(row?.position));
}

// ---------------------------------------------------------------------------
// 5. Nothing above widened RLS. A second identity must not see this row, and
//    the anon key must not reach it at all.
// ---------------------------------------------------------------------------
console.log('\nRLS still holds');
{
  const res = await fetch(`${ROW}?${FILTER}&select=*`, { headers: anonHeaders });
  const denied = res.status === 401 || res.status === 403 ||
    (res.ok && Array.isArray(await res.clone().json().catch(() => null)) === true &&
      (await res.json().catch(() => [])).length === 0);
  record(denied, 'anon cannot read the row', `HTTP ${res.status}`);

  const forged = await fetch(`${ROW}?on_conflict=user_id,skill_slug,content_type`, {
    method: 'POST',
    headers: { ...auth, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: '00000000-0000-0000-0000-000000000001',
      skill_slug: PROBE_SLUG + '-forged',
      content_type: PROBE_KIND,
      completed_at: new Date().toISOString(),
    }),
  });
  record(!forged.ok, 'cannot complete a row for another user_id', `HTTP ${forged.status}`);
}

// ---------------------------------------------------------------------------

await deleteProbe();
await fetch(`${ROW}?skill_slug=eq.${PROBE_SLUG}-forged&content_type=eq.${PROBE_KIND}`, {
  method: 'DELETE', headers: auth,
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);

if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  - ${f.label}: ${f.detail}`);
  console.log(
    '\nIf either "survives" assertion failed, the completion control as written in\n' +
      'public/progress.js destroys data. Do not ship it.'
  );
  process.exit(1);
}

console.log('Green: completion writes are surgical, and starting over keeps the record.');
