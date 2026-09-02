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

// The production project REF, parsed out of public/supabase-client.js — the one
// copy of that table, which keepalive.mjs and astro.config.mjs read the same way.
// A ref rather than a full URL, so the guard still fires if SUPABASE_URL is given
// with a trailing slash or a different scheme. If the parse fails the guard
// refuses to run rather than guessing: a rotated project would otherwise pass
// straight through the one check that keeps this off real reading history.
const PROD_REF = (() => {
  const source = readFileSync(join(ROOT, 'public', 'supabase-client.js'), 'utf8');
  const block = source.match(/prod:\s*\{([\s\S]*?)\n {4}\}/);
  const url = block && block[1].match(/url:\s*'https:\/\/([^.']+)\./);
  if (!url) {
    console.error('Could not read the prod project ref out of public/supabase-client.js; refusing to run.');
    process.exit(2);
  }
  return url[1];
})();

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
// ⚠️ A TOKEN, NOT A PASSWORD, IS THE PRIMARY PATH — and captcha is why.
// The dev project enforces Turnstile on its auth endpoints, so a scripted
// password sign-in is rejected with "no captcha_token found" no matter how
// correct the credentials are. There is no honest way around that from a
// script: the captcha exists precisely to prove a browser was involved.
//
// So do not fight it. This gate needs an authenticated SESSION, and never
// needed a password to get one. Sign in normally in a browser and hand it the
// resulting access token. That is better on every axis: it sidesteps captcha,
// it is short-lived rather than permanent, and no password goes near a shell
// history or an environment variable.
const TOKEN = process.env.TEST_ACCESS_TOKEN || '';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';

if (!URL_BASE || !ANON_KEY) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY.\n' +
      'Copy .env.example to .env and fill in the project URL and anon key.'
  );
  process.exit(2);
}

if (!TOKEN && !(EMAIL && PASSWORD)) {
  console.error([
    'Missing TEST_ACCESS_TOKEN.',
    '',
    'This gate runs as a real signed-in user, so it needs that user\'s session.',
    'The dev project enforces a captcha on sign-in, so a scripted email and',
    'password cannot satisfy it - only a browser can.',
    '',
    '  1. Sign in at http://localhost:4321/sign-in/   (localhost = the dev project)',
    '  2. In the browser console, run:',
    '       AmplifiedAuth.session().access_token',
    '  3. Copy the value, then:',
    '',
    '     PowerShell',
    '       $env:TEST_ACCESS_TOKEN = "eyJ..."',
    '       npm run verify:completion',
    '       Remove-Item Env:TEST_ACCESS_TOKEN',
    '',
    '     bash / zsh',
    '       TEST_ACCESS_TOKEN=eyJ... npm run verify:completion',
    '',
    'The token lasts about an hour. On a 401, fetch a fresh one.',
  ].join('\n'));
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

// The `sub` claim is the user id. This decodes without verifying, which is
// correct here: the token is ours, the server verifies it on every request
// below, and a forged one would simply fail those.
function userIdFromToken(jwt) {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.sub || null;
  } catch {
    return null;
  }
}

async function signIn() {
  if (TOKEN) {
    const id = userIdFromToken(TOKEN);
    if (!id) {
      console.error('\nTEST_ACCESS_TOKEN is not a readable JWT. Copy the whole value.');
      return null;
    }
    return { token: TOKEN, userId: id };
  }

  // Fallback, kept because it costs nothing and a project with no captcha can
  // still use it. On the dev project it will fail - and it says why, rather
  // than leaving the reader to conclude their password is wrong.
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || !body.access_token) {
    const why = body?.error_description || body?.msg || 'no token';
    console.error(`\nSign-in failed (HTTP ${res.status}): ${why}`);
    if (/captcha/i.test(why)) {
      console.error([
        '',
        'That is the project\'s captcha, not your credentials. A scripted sign-in',
        'cannot satisfy one - that is what it is for. Use TEST_ACCESS_TOKEN: run',
        'this gate with nothing set and it prints the three steps.',
      ].join('\n'));
    }
    return null;
  }
  return { token: body.access_token, userId: body.user?.id };
}

const session = await signIn();
if (!session) {
  // ⚠️ NOT process.exit(). Calling it while a fetch is still settling crashed
  // Node on Windows with an assertion in src/win/async.c - a libuv handle being
  // closed twice. Setting exitCode and returning lets the loop drain first.
  process.exitCode = 2;
} else {
  await run(session);
}

async function run({ token, userId }) {
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

console.log(`\nSigned in as ${EMAIL || '(the session behind TEST_ACCESS_TOKEN)'} on ${URL_BASE.replace(/^https?:\/\//, '')}`);
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
  process.exitCode = 1;
    return;
  }

  console.log('Green: completion writes are surgical, and starting over keeps the record.');
}
