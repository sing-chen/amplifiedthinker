// The weekly news prep: turns a week of digest files into one numbered list of
// candidate stories, with what is already published taken out.
//
//   npm run news:candidates -- <news-digests folder>
//       [--since YYYY-MM-DD]   first digest date to read (default: 6 days ago, so 7 days with today)
//       [--until YYYY-MM-DD]   last digest date to read (default: today)
//       [--check-urls]         fetch every candidate URL and report what answered
//       [--json <file>]        also write the result as JSON, for the step that publishes
//
// ⚠️ IT READS AND NEVER WRITES. Not content/news.json, not the database, not the
// digest files. Its only outputs are stdout and the --json file. The decision of
// what to publish stays with a person; this collects the evidence for it.
//
// What it does, in order:
//   1. Checks every digest file in the range with the same rules as
//      verify:digest. A file that fails is reported and its stories left out.
//      A day with NO file is reported too: it means the run did not happen,
//      which an empty file (nothing qualified) does not.
//   2. Collapses the overlap. Each digest looks back 7 days, so one story turns
//      up on several days. Kept once, from the newest digest that had it.
//   3. Takes out what is already published, by URL, against BOTH
//      content/news.json and prod's news_stories. The file alone is not the
//      whole picture: stories reach the table without passing through it.
//   4. Flags headlines that look like an earlier story or another candidate.
//      ⚠️ That is a prompt to look, not a verdict. The same report under a new
//      URL, or a new report under similar words, both need a person to judge.
//
// ⚠️ If prod cannot be read, the report says the database was NOT checked and
// the exit code is 1. "No duplicates found" from a check that never ran is the
// failure every news script here is arranged against.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projects, keyProblem } from './lib/supabase.mjs';
import { normUrl, overlap } from './lib/news-match.mjs';
import { checkDigestFile, digestFiles, isDate } from './lib/digest.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEWS_FILE = join(REPO, 'content', 'news.json');
const SIMILAR = 0.5;

/* ── arguments ────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (name) => argv.includes(name);
const folder = argv.find((a, i) => !a.startsWith('--') && !['--since', '--until', '--json'].includes(argv[i - 1]));

const localDate = (d) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return localDate(d); };

const until = opt('--until') ?? localDate(new Date());
const since = opt('--since') ?? addDays(until, -6);
const jsonOut = opt('--json');

if (!folder) {
  console.error('usage: npm run news:candidates -- <news-digests folder> [--since D] [--until D] [--check-urls] [--json file]');
  console.error('There is deliberately no default folder: the digest files live outside this public repo.');
  process.exit(2);
}
if (!existsSync(folder)) { console.error(`no such folder: ${folder}`); process.exit(2); }
if (!isDate(since) || !isDate(until) || since > until) {
  console.error(`bad date range: --since ${since} --until ${until}`);
  process.exit(2);
}

const { url: dbUrl, key } = projects().prod;
const keyIssue = keyProblem(key);
if (keyIssue) { console.error(`Refusing to run: ${keyIssue}. That is not a publishable key.`); process.exit(2); }

/* ── 1. the digest files in range ─────────────────────────────────────────── */

const days = [];
for (let d = since; d <= until; d = addDays(d, 1)) days.push(d);

// Days before the folder's first file predate saving altogether: reported
// apart, so a backfill does not read as a week of failed runs.
const first = digestFiles(folder)[0]?.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1] ?? null;
const digests = [];
const missing = [];
const beforeFirst = [];
for (const d of days) {
  const path = join(folder, `${d}.json`);
  if (!existsSync(path)) { (first && d < first ? beforeFirst : missing).push(d); continue; }
  digests.push(checkDigestFile(path));
}
const invalid = digests.filter((r) => r.errors.length);

/* ── 2. collapse the overlap, newest digest wins ──────────────────────────── */

const byUrl = new Map();
for (const r of digests) {
  if (r.errors.length) continue;
  for (const s of r.stories) {
    const k = normUrl(s.url);
    const prev = byUrl.get(k);
    if (prev) { prev.seen_in.push(r.date); prev.story = s; prev.digest = r.date; }
    else byUrl.set(k, { key: k, story: s, digest: r.date, seen_in: [r.date] });
  }
}
const pooled = [...byUrl.values()];

/* ── 3. what is already published ─────────────────────────────────────────── */

const fileRows = [];
for (const g of JSON.parse(readFileSync(NEWS_FILE, 'utf8'))) {
  for (const st of g.stories ?? []) {
    fileRows.push({ where: 'content/news.json', date: g.date, title: st.title ?? '', url: st.url ?? '', status: st.status ?? 'published' });
  }
}

// ⚠️ process.exitCode from here on, never process.exit(): after a fetch, exit()
// aborts node on Windows with a libuv assertion and the process reports 127.
// verify-news-duplicates.mjs has the measurement.
async function main() {
  let dbRows = [];
  let dbError = null;
  try {
    const res = await fetch(`${dbUrl}/rest/v1/news_stories?select=slug,story_date,title,url,status&limit=5000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) dbError = `PostgREST answered ${res.status}`;
    else {
      dbRows = (await res.json()).map((r) => ({ where: 'prod', date: r.story_date, title: r.title ?? '', url: r.url ?? '', status: r.status, slug: r.slug }));
      if (dbRows.length === 0) dbError = 'news_stories returned no rows, so nothing could be compared';
    }
  } catch (e) {
    dbError = e.name === 'TimeoutError' ? 'timed out' : (e.message || String(e));
  }

  const prior = [...fileRows, ...dbRows];
  const priorByUrl = new Map();
  for (const p of prior) {
    const k = normUrl(p.url);
    if (!k) continue;
    if (!priorByUrl.has(k)) priorByUrl.set(k, []);
    priorByUrl.get(k).push(p);
  }

  const candidates = [];
  const alreadyPublished = [];
  for (const c of pooled) {
    const hits = priorByUrl.get(c.key);
    if (hits) { alreadyPublished.push({ ...c, published_as: hits }); continue; }
    const similar = prior
      .map((p) => ({ ...p, score: overlap(c.story.title, p.title) }))
      .filter((p) => p.score >= SIMILAR)
      .sort((a, b) => b.score - a.score);
    // Several prior rows can be one story (file + prod); show each title once.
    const seen = new Set();
    c.similar_to = similar.filter((p) => !seen.has(p.title) && seen.add(p.title)).slice(0, 2);
    candidates.push(c);
  }
  candidates.sort((a, b) => (b.story.published ?? '').localeCompare(a.story.published ?? ''));
  candidates.forEach((c, i) => { c.n = i + 1; });

  for (const c of candidates) {
    c.like_candidates = candidates
      .filter((o) => o !== c && overlap(c.story.title, o.story.title) >= SIMILAR)
      .map((o) => o.n);
  }

  /* ── optional: does each URL answer? ──────────────────────────────────── */
  if (flag('--check-urls')) {
    for (const c of candidates) {
      try {
        const res = await fetch(c.story.url, {
          redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8' },
          signal: AbortSignal.timeout(15000),
        });
        const finalHost = new URL(res.url).hostname.replace(/^www\./, '');
        const startHost = new URL(c.story.url).hostname.replace(/^www\./, '');
        c.url_check = { status: res.status, ok: res.ok, moved_to: finalHost !== startHost ? res.url : null };
        res.body?.cancel?.();
      } catch (e) {
        c.url_check = { status: null, ok: false, error: e.name === 'TimeoutError' ? 'timed out' : (e.cause?.code ?? e.message) };
      }
    }
  }

  /* ── report ───────────────────────────────────────────────────────────── */
  const line = (s = '') => console.log(s);
  line(`News candidates, digests ${since} to ${until}`);
  line(`  ${digests.length} digest file(s) read, ${invalid.length} failed the check, ${missing.length} day(s) with no file`);
  if (missing.length) line(`  ⚠️ no file (the run did not happen): ${missing.join(', ')}`);
  if (beforeFirst.length) line(`  before the first saved digest (${first}), so not read: ${beforeFirst[0]} to ${beforeFirst.at(-1)}`);
  for (const r of invalid) {
    line(`  ⚠️ ${r.name} failed the digest check and was left out:`);
    for (const e of r.errors.slice(0, 5)) line(`       ${e}`);
  }
  for (const r of digests) if (!r.errors.length && r.stories.length === 0) {
    line(`  ${r.name}: nothing qualified${r.note ? ` (${r.note})` : ''}`);
  }
  line(dbError
    ? `  ⚠️ PROD NOT CHECKED: ${dbError}. Only content/news.json was compared, so a story added outside it would not be caught.`
    : `  checked against content/news.json (${fileRows.length}) and prod (${dbRows.length} rows)`);
  line(`  ${pooled.length} distinct stories after collapsing repeats; ${alreadyPublished.length} already published; ${candidates.length} new`);
  line();

  for (const c of candidates) {
    const s = c.story;
    line(`${c.n}. ${s.title}`);
    line(`   ${s.source} · published ${s.published} · in ${c.seen_in.length} digest(s), latest ${c.digest}`);
    line(`   ${s.url}`);
    line(`   tags: ${s.tags.join(', ')}`);
    if (c.url_check) {
      const u = c.url_check;
      line(`   url: ${u.ok ? `ok (${u.status})` : `⚠️ ${u.status ?? u.error}`}${u.moved_to ? ` → moved to ${u.moved_to}` : ''}`);
    }
    for (const p of c.similar_to) line(`   ⚠️ looks like ${p.where} ${p.date}: "${p.title}" (${Math.round(p.score * 100)}%)`);
    if (c.like_candidates.length) line(`   ⚠️ looks like candidate ${c.like_candidates.join(', ')}`);
    line();
  }
  if (!candidates.length) line('No new candidates.\n');

  if (alreadyPublished.length) {
    line('Already published, left out:');
    for (const c of alreadyPublished) {
      const p = c.published_as[0];
      line(`   - ${c.story.title}  (${p.where} ${p.date}${p.status !== 'published' ? `, ${p.status}` : ''})`);
    }
    line();
  }

  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify({
      generated_at: new Date().toISOString(),
      range: { since, until },
      digests: digests.map((r) => ({ date: r.date, ok: !r.errors.length, stories: r.stories.length, note: r.note, errors: r.errors })),
      missing_days: missing,
      before_first_digest: beforeFirst,
      db: { checked: !dbError, rows: dbRows.length, error: dbError },
      candidates: candidates.map((c) => ({
        n: c.n, digest: c.digest, seen_in: c.seen_in, story: c.story,
        similar_to: c.similar_to.map(({ where, date, title, score }) => ({ where, date, title, score })),
        like_candidates: c.like_candidates, url_check: c.url_check ?? null,
      })),
      already_published: alreadyPublished.map((c) => ({ title: c.story.title, url: c.story.url, as: c.published_as.map(({ where, date, title, status }) => ({ where, date, title, status })) })),
    }, null, 2) + '\n', 'utf8');
    line(`Wrote ${jsonOut}`);
  }

  if (dbError || invalid.length) process.exitCode = 1;
}

main();
