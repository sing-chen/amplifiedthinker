// Turns content/news.json into a re-runnable SQL seed for public.news_stories.
//
//   npm run build:news-seed             -> dry run: reports and prints samples
//   npm run build:news-seed -- --write  -> writes supabase/seed/news_seed.sql
//   npm run build:news-seed -- --only 2026-08-27 --write
//                                       -> writes supabase/seed/news_add_2026-08-27.sql,
//                                          containing just that day's stories
//
// ⚠️ `content/news.json` IS NO LONGER SERVED. It sat at `public/news.json` until
// 2026-08-26, where the site fetched it directly. The site reads `news_stories`
// now, so leaving it under `public/` published a stale public copy of database
// content — the same shape of fault that put 39 mojibake characters into
// `search-index.json` and left them live for days. It is an AUTHORING INPUT to
// this script and nothing else.
//
// ⚠️ AND IT STOPS BEING THE SOURCE OF TRUTH THE DAY PHASE 7'S ADMIN UI SHIPS.
// From that point the database is edited directly, this file is a frozen
// historical copy, and a full `--write` regeneration would UPDATE IN PLACE over
// whatever was edited there — silently, because the statement is idempotent on
// `slug` and reports success either way. `--only` exists so the interim route
// never emits a row it did not just author. See .claude/commands/add-news.md.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ WHY THIS EMITS SQL INSTEAD OF INSERTING ROWS ITSELF.
//
// `news_stories` is admin-write: `news_stories_admin_all` requires
// `public.is_admin()`, and `is_admin` can only be set where `auth.uid()` is null
// — the dashboard SQL editor. So there are exactly three ways to load this data:
//
//   1. the anon key            — refused by RLS, correctly
//   2. `service_role`          — REFUSED BY US. Phase 6 stage 7 settled that it
//                                gets no home in this phase, and one line of it
//                                bypasses every policy in the migration
//   3. the dashboard SQL editor — runs as the table owner, which is how the
//                                schema and the `is_admin` bootstrap already
//                                got in
//
// Three is the only one left standing, so this script's product is SQL that a
// human pastes, exactly like `supabase/migrations/`. The stage asked for "a
// script, not a hand-written SQL file" and this satisfies it: the SQL is
// GENERATED and re-generable, and nobody hand-writes 81 rows.
//
// ⚠️ THE OUTPUT IS IDEMPOTENT ON `slug`. Re-running the SQL updates in place
// rather than duplicating, so dev can be reloaded freely and prod gets the same
// statement at stage 17.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO, 'content', 'news.json');
const OUT_DIR = join(REPO, 'supabase', 'seed');

const write = process.argv.includes('--write');

/* ── `--only <date>`, repeatable ───────────────────────────────────────────
   ⚠️ NARROWS WHAT IS EMITTED, NEVER WHAT IS CHECKED. Every validation below
   runs across ALL rows and only the final VALUES list is filtered — because the
   thing most likely to be wrong about a story added today is that its slug
   collides with one from two years ago, and a check that only looked at today
   could not possibly see it. */
const onlyDates = [];
for (let i = 0; i < process.argv.length - 1; i++) {
  if (process.argv[i] === '--only') onlyDates.push(process.argv[i + 1]);
}
const partial = onlyDates.length > 0;
const OUT = join(OUT_DIR, partial ? 'news_add_' + onlyDates.join('_') + '.sql' : 'news_seed.sql');

/* ── slugs ────────────────────────────────────────────────────────────────────
   `<date>-<slugified title>`, and IMMUTABLE once it ships: a slug is what a
   shared link points at from here on, so regenerating one silently breaks every
   link to that story. Accents are folded to ASCII because this is a URL — the
   TITLE keeps them, and that is the thing to spot-check after loading. */
function slugifyTitle(title) {
  return String(title)
    .normalize('NFKD')                  // é -> e + combining accent
    .replace(/[̀-ͯ]/g, '')    // drop the accents
    .replace(/[''’‘]/g, '')             // possessives close up: "AI's" -> "ais"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    // ⚠️ STOP at the first word that does not fit — do NOT skip it and carry on.
    // A `reduce` that keeps going produces slugs that read as if a word were
    // never there: "...shrinking-management-without-those" from a title reading
    // "Without Preparing Those Who Remain", because "preparing" pushed past the
    // cap and "those" still fitted. Truncation is fine; silent reordering of
    // meaning is not, and these slugs are immutable once shipped.
    .reduce((acc, word) => {
      if (acc.done) return acc;
      const next = acc.text ? `${acc.text}-${word}` : word;
      if (next.length > 60) return { text: acc.text, done: true };
      return { text: next, done: false };
    }, { text: '', done: false }).text;
}

/* ── SQL literals ─────────────────────────────────────────────────────────── */

function sqlText(v) {
  if (v === null || v === undefined || v === '') return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}

// `ARRAY[...]::text[]` rather than a '{...}' literal: the brace form needs its
// own quoting rules for commas and braces inside values, and tags are editorial
// free text. One escaping rule beats two.
function sqlTextArray(list) {
  const arr = Array.isArray(list) ? list.filter((t) => t !== null && t !== '') : [];
  if (!arr.length) return `'{}'::text[]`;
  return `ARRAY[${arr.map(sqlText).join(', ')}]::text[]`;
}

/* ── read and transform ───────────────────────────────────────────────────── */

const groups = JSON.parse(readFileSync(SOURCE, 'utf8'));
if (!Array.isArray(groups)) {
  console.error('content/news.json is not an array of date groups — aborting.');
  process.exit(1);
}

const rows = [];
const problems = [];

for (const group of groups) {
  const date = group.date;
  const stories = Array.isArray(group.stories) ? group.stories : [];

  stories.forEach((story, index) => {
    // ⚠️ `index` IS THE ARRAY POSITION IN THE FILE, AND NOTHING ELSE.
    // `news.html`'s buildFlatStories() builds `group.date + '-' + i` the same
    // way, and `middleware.js` parses it by splitting on the LAST '-'. This is
    // the only value in this script that cannot be recomputed later: get it
    // wrong and every previously shared link resolves to a DIFFERENT story,
    // silently. Do not sort, filter or dedupe before this point.
    const legacyId = `${date}-${index}`;
    const titleSlug = slugifyTitle(story.title);

    if (!titleSlug) problems.push(`${legacyId}: title slugifies to nothing — ${JSON.stringify(story.title)}`);

    rows.push({
      legacyId,
      slug: `${date}-${titleSlug}`,
      storyDate: date,
      sortOrder: index,
      title: story.title ?? '',
      source: story.source ?? null,
      url: story.url ?? null,
      summary: story.summary ?? null,
      implications: story.implications ?? null,
      tags: story.tags ?? [],
      pinned: story.pinned === true
    });
  });
}

/* ── the checks that must fail loudly ─────────────────────────────────────── */

const bySlug = new Map();
for (const r of rows) {
  if (bySlug.has(r.slug)) {
    problems.push(`slug collision: ${r.slug}\n    ${bySlug.get(r.slug).legacyId} — ${bySlug.get(r.slug).title}\n    ${r.legacyId} — ${r.title}`);
  }
  bySlug.set(r.slug, r);
}

const byLegacy = new Map();
for (const r of rows) {
  if (byLegacy.has(r.legacyId)) problems.push(`legacy_id collision: ${r.legacyId} — two stories share a date+index, which should be impossible`);
  byLegacy.set(r.legacyId, r);
}

const pinned = rows.filter((r) => r.pinned);
// The schema enforces this with a partial unique index, so a second pin would
// fail the INSERT rather than land quietly. Catching it here says WHICH two.
if (pinned.length > 1) {
  problems.push(`${pinned.length} pinned stories, but at most one is allowed site-wide:\n    ` +
    pinned.map((r) => `${r.legacyId} — ${r.title}`).join('\n    '));
}

/* ── report, always, from the file rather than from memory ────────────────── */

console.log(`\nsource: content/news.json`);
console.log(`  ${groups.length} date groups`);
console.log(`  ${rows.length} stories`);
console.log(`  ${pinned.length} pinned${pinned.length ? ` — ${pinned[0].legacyId} "${pinned[0].title}"` : ''}`);
console.log(`  ${groups[groups.length - 1]?.date} .. ${groups[0]?.date}`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) — nothing written:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

/* ── samples, so a human can eyeball the mapping ──────────────────────────── */

const samples = [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]];
console.log(`\nsamples — check these against news.json by eye:`);
for (const r of samples) {
  console.log(`\n  legacy_id  ${r.legacyId}`);
  console.log(`  slug       ${r.slug}`);
  console.log(`  date/order ${r.storyDate} / ${r.sortOrder}`);
  console.log(`  title      ${r.title}`);
  console.log(`  tags       ${JSON.stringify(r.tags)}`);
}

// ⚠️ Accented characters survive into the TITLE and SUMMARY, not the slug. This
// migration carries prose out of a JSON file and into a database, where
// `npm run verify:encoding` cannot follow it — so print what is there now, to be
// compared against the rows after loading. `Brené Brown` reaching the DB as
// `Brené Brown` is the failure this exists to catch.
// Show CONTEXT, not the bare character. An earlier version printed the first
// non-ASCII token and produced a column of lone em dashes — technically correct
// and useless to compare anything against. Letters are listed before
// punctuation because a mangled `é` is the tell that reads as a typo, while a
// mangled `—` reads as obvious damage.
const nonAscii = (s) => /[^\x00-\x7F]/.test(s);
const withText = rows.map((r) => ({ r, text: `${r.title} ${r.summary ?? ''}` })).filter((x) => nonAscii(x.text));
const letters = withText.filter((x) => /[À-ÿ]/.test(x.text));
const rest = withText.filter((x) => !/[À-ÿ]/.test(x.text));

console.log(`\n${withText.length} row(s) contain non-ASCII text — ${letters.length} with accented letters.`);
console.log(`Compare these against the loaded rows; mojibake is the failure this catches:`);
for (const { r, text } of [...letters, ...rest].slice(0, 5)) {
  const m = text.match(/.{0,28}[^\x00-\x7F].{0,28}/);
  console.log(`  ${r.legacyId}  …${(m?.[0] ?? '').trim()}…`);
}

/* ── emit ─────────────────────────────────────────────────────────────────── */

if (!write) {
  console.log(`\nDry run. Nothing written. Re-run with --write to emit ${OUT.replace(REPO, '.')}\n`);
  process.exit(0);
}

/* ── the emitted subset ──────────────────────────────────────────────── */

const emit = partial ? rows.filter((r) => onlyDates.includes(r.storyDate)) : rows;

// ⚠️ A --only DATE THAT MATCHES NOTHING IS A TYPO, NOT AN EMPTY DAY. Emitting a
// zero-row file would produce SQL that runs, succeeds, and publishes nothing —
// exactly the failure this whole stage exists to close.
if (partial && emit.length === 0) {
  console.error(`\n--only matched no stories: ${onlyDates.join(', ')}`);
  console.error(`Most recent dates in content/news.json: ${[...new Set(groups.map((g) => g.date))].sort().slice(-3).reverse().join(', ')}\n`);
  process.exit(1);
}

const emitPinned = emit.filter((r) => r.pinned);

// ⚠️ A PARTIAL BATCH CANNOT SEE THE PIN IT IS ABOUT TO COLLIDE WITH. The full
// seed carries every row, so `pinned = excluded.pinned` unpins the old one in
// the same statement. A one-day batch does not contain the old one, so the
// insert would hit `news_stories_single_pinned_idx` and roll back — with an
// error naming an index rather than the problem. Clear it first, explicitly.
const clearPin = emitPinned.length
  ? 'update public.news_stories set pinned = false\n' +
    ' where pinned and slug <> ' + sqlText(emitPinned[0].slug) + ';\n\n'
  : '';

const values = emit.map((r) =>
  `  (${sqlText(r.slug)}, ${sqlText(r.legacyId)}, ${sqlText(r.storyDate)}::date, ${r.sortOrder}, ` +
  `${sqlText(r.title)}, ${sqlText(r.source)}, ${sqlText(r.url)}, ${sqlText(r.summary)}, ` +
  `${sqlText(r.implications)}, ${sqlTextArray(r.tags)}, ${r.pinned}, 'published')`
).join(',\n');

const sql = `-- ${partial ? 'PARTIAL load' : 'Seed'} for public.news_stories, GENERATED from content/news.json.
--
--   npm run build:news-seed --${partial ? ` --only ${onlyDates.join(' --only ')} --write` : ' --write'}
--
-- ⚠️ DO NOT HAND-EDIT. Regenerate instead; this file is an output.
--
-- Run it in the Supabase SQL editor, which executes as the table owner. The
-- anon key is refused by RLS (correctly) and \`service_role\` is deliberately
-- unavailable to this project — see the header of scripts/build-news-seed.mjs.
--
-- ⚠️ IDEMPOTENT ON \`slug\`: re-running updates in place instead of duplicating.
-- \`slug\` is the immutable public identifier from here on; \`legacy_id\` is the
-- OLD positional \`<date>-<index>\` form that shared links still point at, and it
-- is what the 301 endpoint resolves.
--
-- Generated from ${emit.length} stor${emit.length === 1 ? 'y' : 'ies'}${partial ? ` for ${onlyDates.join(', ')}, out of ${rows.length} in the file` : ` across ${groups.length} date groups`}.
${partial ? `--\n-- \u26a0\ufe0f PARTIAL. This touches ONLY the rows listed below. It is not a\n-- replacement for supabase/seed/news_seed.sql and does not reconcile\n-- anything it omits.\n` : ''}
${clearPin}insert into public.news_stories
  (slug, legacy_id, story_date, sort_order, title, source, url, summary, implications, tags, pinned, status)
values
${values}
on conflict (slug) do update set
  legacy_id    = excluded.legacy_id,
  story_date   = excluded.story_date,
  sort_order   = excluded.sort_order,
  title        = excluded.title,
  source       = excluded.source,
  url          = excluded.url,
  summary      = excluded.summary,
  implications = excluded.implications,
  tags         = excluded.tags,
  pinned       = excluded.pinned,
  status       = excluded.status;

-- Verification, to run in the same sitting:
${partial ? `--   select count(*) from public.news_stories
--     where story_date in (${onlyDates.map((d) => `'${d}'`).join(', ')});  -- expect ${emit.length}
--   select count(*) from public.news_stories where pinned;           -- expect at most 1`
 : `--   select count(*) from public.news_stories;                        -- expect ${rows.length}
--   select count(distinct slug), count(distinct legacy_id)
--     from public.news_stories;                                      -- both ${rows.length}
--   select count(*) from public.news_stories where pinned;           -- expect ${pinned.length}`}
--   select title from public.news_stories where title ~ '[^[:ascii:]]' limit 5;
--     -- eyeball these: accented text must read correctly, not as mojibake
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, sql, 'utf8');
console.log(`\nWrote ${OUT.replace(REPO, '.')} — ${emit.length} rows, ${sql.length} bytes\n`);
