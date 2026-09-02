// Compares content/news.json against what is actually published in
// `news_stories`, and reports the three ways they can disagree.
//
//   npm run verify:news-dupes            -> checks prod
//   npm run verify:news-dupes -- dev     -> checks dev
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ WHY THIS EXISTS, WHEN /add-news ALREADY HAS A DUPLICATE CHECK.
//
// It has TWO, and both read the FILE:
//
//   Step 1a          semantic — same source report, same stat, same claim
//   build-news-seed  identity — slug and legacy_id collisions
//
// That was complete while `content/news.json` was the only way a story could
// exist. ⚠️ IT STOPS BEING COMPLETE THE DAY PHASE 7'S ADMIN UI SHIPS, because
// from then on a story can reach `news_stories` WITHOUT EVER TOUCHING THE FILE
// — and every check above is blind to it. The failure is not that the file is
// stale; it is that a check reading it still reports "no duplicates" in a
// confident voice while missing a whole category of them.
//
// ⚠️ AND THE DATABASE WILL NOT CATCH IT EITHER. The generated load ends
// `on conflict (slug) do update`, so a story re-added under its ORIGINAL
// headline silently OVERWRITES the existing row and reports success, while the
// same story re-added under a REWORDED headline gets a different slug and
// inserts a SECOND row. Neither raises anything. `slug` is unique, and a
// duplicate story is not a duplicate slug.
//
// So this reads the table. It needs no new credential: `news_stories_public_read`
// already exposes `status = 'published'` to the anon key, which is the same key
// every visitor's browser holds. It NEVER writes.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projects, keyProblem } from './lib/supabase.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO, 'content', 'news.json');

const target = process.argv.slice(2).find((a) => a === 'dev' || a === 'prod') ?? 'prod';

/* ── the project, from the file the browser uses ────────────────────────────
   ⚠️ NOT retyped here. scripts/lib/supabase.mjs runs the real file, so a
   second copy of a URL and a key — the one nothing reads on a normal day — can
   never exist to go stale. */
const { url, key } = projects()[target];

// ⚠️ A secret here would be a secret in a repo that is PUBLIC. The publishable
// key is meant to ship to browsers; a `service_role` one is not, and would also
// bypass the RLS this check relies on being in force.
const keyIssue = keyProblem(key);
if (keyIssue) {
  console.error(`\nRefusing to run: ${keyIssue}. That is not a publishable key.\n`);
  process.exit(2);
}

/* ── normalising, so "the same story" survives cosmetic differences ───────── */

function normUrl(u) {
  if (!u) return '';
  try {
    const p = new URL(String(u));
    return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return String(u).trim().toLowerCase().replace(/\/+$/, '');
  }
}

// Title comparison is deliberately crude and deliberately NOT the primary
// signal — it exists to catch a reworded headline over the same URL, which the
// URL check already finds, and to give the report something readable to print.
function words(t) {
  return new Set(
    String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3)
  );
}
function overlap(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return hit / Math.min(A.size, B.size);
}

/* ── read both sides ──────────────────────────────────────────────────────── */

const groups = JSON.parse(readFileSync(SOURCE, 'utf8'));
const fileRows = [];
for (const g of groups) {
  (g.stories ?? []).forEach((st, i) => {
    fileRows.push({ legacyId: `${g.date}-${i}`, date: g.date, title: st.title ?? '', url: st.url ?? null });
  });
}

/* ── ⚠️ EVERYTHING PAST THE FETCH SETS `process.exitCode` AND RETURNS ─────────
   It must never call `process.exit()`. Calling it after a fetch ABORTS node 24
   on Windows:

     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src/win/async.c:94

   and the process then exits **127** — so a clean run and a failing one both
   report "command not found" to anything reading the code, and the check's
   answer is destroyed rather than merely decorated.

   Measured, not guessed: fetch + process.exit() gives 127; fetch +
   process.exitCode gives the code asked for. `Connection: close` does not help.
   ⚠️ The two `process.exit(2)` calls ABOVE run before any fetch, which is the
   whole difference, and they are fine as they are.

   That is also why this is a function: top-level `return` is not allowed in an
   ES module, so without one every early exit would have to be an `else`. */
async function main() {

// ⚠️ EVERY STATUS, NOT JUST `published`. Reading only the published rows would
// make an archived story indistinguishable from one that never loaded — and
// after a merge, "the row is archived" and "the row is missing" are the two
// outcomes it most matters to tell apart.
const BASE = 'slug,legacy_id,story_date,title,url,status';
const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' };
const ask = (cols) => fetch(`${url}/rest/v1/news_stories?select=${cols}&limit=2000`, { headers });

let res = await ask(`${BASE},merged_into`);
let hasMergedInto = true;

/* ⚠️ FALL BACK RATHER THAN 400 AT THE ONE MOMENT THIS IS MOST USED. Asking for
   `merged_into` against a project that has not had 20260826180000 applied is a
   PostgREST 42703, and the raw message names a column rather than the problem.
   Stage 17 runs this against prod immediately BEFORE applying the migrations,
   which is precisely when it would have been unreadable. */
if (res.status === 400 && /merged_into/.test(await res.clone().text())) {
  hasMergedInto = false;
  res = await ask(BASE);
}

if (!res.ok) {
  console.error(`\n${target}: PostgREST answered ${res.status} — ${(await res.text()).slice(0, 200)}\n`);
  process.exitCode = 2;
  return;
}

const allRows = await res.json();

// ⚠️ A CONTROL, NOT A FORMALITY. An empty table makes every comparison below
// pass — no duplicates, no drift, all green — which is exactly the wrong answer
// to report confidently. Prod's table IS empty until the Phase 6 merge.
if (allRows.length === 0) {
  console.log(`\n${target}: news_stories is empty. Nothing to compare against.`);
  console.log(`Not a pass: with no rows, every check below would report clean.\n`);
  return;
}

// Duplicate detection is about what a READER can see, so it runs on the
// published set. An archived duplicate is the resolved state, not a finding.
const dbRows = allRows.filter((r) => r.status === 'published');
const dbArchived = allRows.filter((r) => r.status === 'archived');
const other = allRows.filter((r) => r.status !== 'published' && r.status !== 'archived');

console.log(`\n${target} — ${allRows.length} rows: ${dbRows.length} published, ${dbArchived.length} archived` +
  `${other.length ? `, ${other.length} in another status` : ''}`);
console.log(`content/news.json holds ${fileRows.length} stories` +
  `${fileRows.length === allRows.length ? ' — matches' : ' — ⚠️ DOES NOT MATCH THE ROW COUNT'}\n`);

const byUrl = new Map();
for (const r of dbRows) if (r.url) {
  const k = normUrl(r.url);
  if (!byUrl.has(k)) byUrl.set(k, []);
  byUrl.get(k).push(r);
}
// ⚠️ FROM `allRows`, NOT `dbRows`. Check 2 uses this to decide whether a story
// in the file is a NEW addition. Built from the published rows only, the two
// archived stories would not be found — so each would be reported as a fresh
// duplicate of the very story it was merged into, turning a completed merge
// into two permanent false positives.
const dbByLegacy = new Map(allRows.map((r) => [r.legacy_id, r]));

let problems = 0, warnings = 0;

if (fileRows.length !== allRows.length) {
  warnings++;
  console.log(`  ⚠️ ${fileRows.length} stories in the file, ${allRows.length} rows in the database.`);
  console.log(`    Normal mid-workflow: a story authored but not loaded yet. Not normal after a load.\n`);
}

if (other.length) {
  problems++;
  console.log(`  ⚠️ ${other.length} row(s) in an unexpected status — the seed only ever emits`);
  console.log(`    'published' or 'archived', so a 'draft' here was not put there by it:`);
  for (const r of other.slice(0, 5)) console.log(`      ${r.legacy_id}  ${r.status}  ${r.slug}`);
  console.log('');
}

/* ── 1. the same URL published more than once, in the database itself ─────── */
for (const [k, rows] of byUrl) {
  if (rows.length > 1) {
    problems++;
    console.log(`  DUPLICATE IN THE DATABASE — one URL, ${rows.length} stories`);
    console.log(`    ${k}`);
    for (const r of rows) console.log(`      ${r.story_date}  ${r.slug}\n        ${r.title}`);
    console.log('');
  }
}

/* ── 2. a story in the file whose URL is already live under another id ───────
   ⚠️ ONLY FOR ROWS NOT YET PUBLISHED. Without that guard every pair found by
   check 1 is reported again once from each side, so two real duplicates print
   as six findings and the count stops meaning anything. Calibrated against the
   control below: with the file and the database identical, this must fire zero
   times, because nothing in the file is new. */
for (const f of fileRows) {
  if (!f.url) continue;
  if (dbByLegacy.has(f.legacyId)) continue;   // already live: not an addition
  const hits = (byUrl.get(normUrl(f.url)) ?? []).filter((r) => r.legacy_id !== f.legacyId);
  for (const r of hits) {
    problems++;
    console.log(`  ALREADY PUBLISHED under a different story — ${f.legacyId}`);
    console.log(`    file: ${f.title}`);
    console.log(`    db:   ${r.slug}  (${r.story_date})`);
    console.log(`          ${r.title}`);
    console.log(`    same URL: ${normUrl(f.url)}`);
    console.log(`    ⚠️ The load would INSERT a second row: different title, different slug.\n`);
  }
}

/* ── 2b. every archived row must lead somewhere ────────────────────────────
   ⚠️ THIS IS WHAT PROVES A MERGE ACTUALLY LANDED. An archived row with a null
   or dangling `merged_into` is invisible in the feed AND unreachable by its old
   link — the story has simply vanished, which is the one outcome archiving
   exists to prevent. It looks identical to a clean merge from every other
   angle: right row count, right statuses, no duplicates. */
const publishedSlugs = new Set(dbRows.map((r) => r.slug));
if (!hasMergedInto && dbArchived.length) {
  warnings++;
  console.log(`  ⚠️ ${dbArchived.length} archived row(s), but this project has no \`merged_into\` column.`);
  console.log(`    Migration 20260826180000 has not been applied here, so every old link to an`);
  console.log(`    archived story is a 404 — the merges are loaded but not wired up.\n`);
}
for (const r of hasMergedInto ? dbArchived : []) {
  if (!r.merged_into) {
    warnings++;
    console.log(`  ⚠️ archived with no merged_into — ${r.legacy_id}  ${r.slug}`);
    console.log(`    Withdrawn rather than merged, so /news.html?story=${r.legacy_id} is a 404.\n`);
  } else if (!publishedSlugs.has(r.merged_into)) {
    problems++;
    console.log(`  BROKEN MERGE POINTER — ${r.legacy_id}`);
    console.log(`    merged_into: ${r.merged_into}`);
    console.log(`    ⚠️ Not a published slug. The old link redirects nowhere.\n`);
  }
}

/* ── 3. drift — the condition Phase 7 creates ─────────────────────────────── */
const fileLegacy = new Set(fileRows.map((f) => f.legacyId));
// allRows: a story added by the admin UI could land in EITHER status, and an
// archived one absent from the file is drift just the same.
const onlyDb = allRows.filter((r) => !fileLegacy.has(r.legacy_id));
if (onlyDb.length) {
  warnings++;
  console.log(`  ⚠️ ${onlyDb.length} published stor${onlyDb.length === 1 ? 'y is' : 'ies are'} NOT in content/news.json.`);
  console.log(`    This is what Phase 7's admin UI creates, and it is the point at which`);
  console.log(`    step 1a's file-based duplicate check goes blind. It is also the point at`);
  console.log(`    which a full \`build:news-seed --write\` would overwrite them.\n`);
  for (const r of onlyDb.slice(0, 10)) console.log(`      ${r.story_date}  ${r.slug}`);
  if (onlyDb.length > 10) console.log(`      ... and ${onlyDb.length - 10} more`);
  console.log('');
}

/* ── 4. the file says something different from what is live ──────────────── */
let edited = 0;
for (const f of fileRows) {
  const r = dbByLegacy.get(f.legacyId);
  if (!r) continue;
  if (r.title !== f.title || normUrl(r.url) !== normUrl(f.url)) {
    if (edited === 0) console.log(`  ⚠️ Live rows whose title or URL differs from the file:\n`);
    edited++; warnings++;
    console.log(`      ${f.legacyId}  ${r.slug}`);
    console.log(`        file: ${f.title}`);
    console.log(`        db:   ${r.title}`);
    if (overlap(f.title, r.title) > 0.6) console.log(`        (same story, reworded — a reload would overwrite the live text)`);
    console.log('');
  }
}

/* ── report ───────────────────────────────────────────────────────────────── */
if (!problems && !warnings) {
  console.log(`  No duplicates, no drift. The file and ${target} agree.\n`);
} else {
  console.log(`  ${problems} problem(s), ${warnings} warning(s).\n`);
}

process.exitCode = problems ? 1 : 0;

}

await main();
