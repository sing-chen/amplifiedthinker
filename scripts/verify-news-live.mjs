// The last step of /add-news: proves the stories just added are LIVE, not just
// written down.
//
//   npm run verify:news-live -- <YYYY-MM-DD> [<YYYY-MM-DD> ...]
//
// For every story content/news.json holds under those dates it checks, in order:
//   1. prod's news_stories has a row with that date and title, status published.
//      Missing means the SQL was never run (or ran against dev). ⚠️ This is the
//      failure /add-news is arranged around: writing the file publishes NOTHING,
//      and a run that stops before the SQL looks entirely successful.
//   2. https://amplifiedthinker.com/news/<slug> answers 200, its <title> carries
//      the story's title exactly (so a mojibake title fails here, not by eye),
//      and its canonical link points at itself.
//   3. The slug is linked from /news/, listed in /sitemap.xml, and present in
//      /api/search-index.json.
//
// ⚠️ A CONTROL RUNS FIRST: a slug that cannot exist must answer 404. If it does
// not (an auth wall, a catch-all, a cached page), a 200 proves nothing, so the
// run stops there rather than reporting the stories as live.
//
// Reads only. The slug is taken from prod, never recomputed here: the slug rule
// lives in build-news-seed.mjs, and a second copy of it would drift.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { projects, keyProblem } from './lib/supabase.mjs';
import { isDate } from './lib/digest.mjs';
import { overlap } from './lib/news-match.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://amplifiedthinker.com';

// --file <path> reads another copy of news.json. For testing this script's
// failure paths without touching the real file; /add-news never passes it.
const argv = process.argv.slice(2);
const fileAt = argv.indexOf('--file');
const newsFile = fileAt >= 0 ? argv[fileAt + 1] : join(REPO, 'content', 'news.json');
const dates = argv.filter((a, i) => !a.startsWith('--') && !(fileAt >= 0 && i === fileAt + 1));
if (!dates.length || !dates.every(isDate)) {
  console.error('usage: npm run verify:news-live -- <YYYY-MM-DD> [<YYYY-MM-DD> ...]');
  process.exit(2);
}

const { url: dbUrl, key } = projects().prod;
const keyIssue = keyProblem(key);
if (keyIssue) { console.error(`Refusing to run: ${keyIssue}. That is not a publishable key.`); process.exit(2); }

const groups = JSON.parse(readFileSync(newsFile, 'utf8'));
const expected = [];
for (const g of groups) {
  if (!dates.includes(g.date)) continue;
  for (const st of g.stories ?? []) {
    if ((st.status ?? 'published') === 'published') expected.push({ date: g.date, title: st.title });
  }
}

const decode = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function get(path) {
  const res = await fetch(ORIGIN + path, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

// ⚠️ process.exitCode only, never process.exit() after a fetch: on Windows that
// aborts node with a libuv assertion and the process reports 127.
async function main() {
  const fail = [];
  const line = (s = '') => console.log(s);

  if (!expected.length) {
    line(`content/news.json has no published stories for ${dates.join(', ')}. Nothing to check, which is not a pass.`);
    process.exitCode = 1;
    return;
  }

  // ── control ──
  const control = await get(`/news/${dates[0]}-verify-news-live-control-slug-that-cannot-exist`);
  if (control.status !== 404) {
    line(`⚠️ CONTROL FAILED: a slug that cannot exist answered ${control.status}, not 404.`);
    line('   A 200 from this origin proves nothing right now, so no story was checked.');
    process.exitCode = 1;
    return;
  }
  line(`control: a slug that cannot exist answers 404, so a 200 means something`);

  // ── 1. prod rows ──
  const res = await fetch(`${dbUrl}/rest/v1/news_stories?select=slug,story_date,title,status&story_date=in.(${dates.join(',')})`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    line(`⚠️ PROD NOT READ: PostgREST answered ${res.status}. Nothing is proven live.`);
    process.exitCode = 1;
    return;
  }
  const rows = await res.json();

  // ── 3. the shared surfaces, fetched once ──
  const [index, sitemap, search] = await Promise.all([get('/news/'), get('/sitemap.xml'), get('/api/search-index.json')]);
  const searchEntries = search.headers.get('x-news-entries');
  if (searchEntries === '0') fail.push('search index served its static half only (x-news-entries: 0): the DB read failed there');

  line(`checking ${expected.length} stor${expected.length === 1 ? 'y' : 'ies'} for ${dates.join(', ')} on ${ORIGIN}`);
  line();

  for (const e of expected) {
    const problems = [];
    const row = rows.find((r) => r.story_date === e.date && r.title === e.title);
    const nearly = !row && rows.find((r) => r.story_date === e.date && overlap(r.title, e.title) >= 0.5);
    if (nearly) {
      problems.push(`prod has this story under a different title: "${nearly.title}". The file and prod disagree (an edit after the SQL ran, or an encoding fault on one side)`);
    } else if (!row) {
      problems.push('NOT IN PROD: no row with this date and title. The SQL has not been run on prod');
    } else if (row.status !== 'published') {
      problems.push(`in prod but status is "${row.status}", so the site does not show it`);
    } else {
      const path = `/news/${row.slug}`;
      const page = await get(path);
      if (page.status !== 200) problems.push(`${path} answered ${page.status}`);
      else {
        const title = decode(page.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
        if (!title.startsWith(e.title)) problems.push(`page <title> does not carry the story title: "${title}"`);
        const canon = page.text.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
        if (canon !== ORIGIN + path) problems.push(`canonical is ${canon ?? 'missing'}, not ${ORIGIN + path}`);
      }
      if (!index.text.includes(`/news/${row.slug}`)) problems.push('not linked from /news/');
      if (!sitemap.text.includes(ORIGIN + path)) problems.push('not in /sitemap.xml');
      if (!search.text.includes(row.slug)) problems.push('not in /api/search-index.json');
    }
    line(`${problems.length ? '✗' : '✓'} ${e.date}  ${e.title}`);
    if (row) line(`    ${ORIGIN}/news/${row.slug}`);
    for (const p of problems) line(`    ⚠️ ${p}`);
    if (problems.length) fail.push(e.title);
  }

  // Rows in prod for these dates that the file does not have: published
  // outside /add-news, or the file was edited after the SQL ran.
  const extra = rows.filter((r) => !expected.some((e) => e.date === r.story_date && e.title === r.title));
  if (extra.length) {
    line();
    line(`note: prod has ${extra.length} row(s) for these dates that content/news.json does not:`);
    for (const r of extra) line(`    ${r.story_date}  ${r.title}  (${r.status})`);
  }

  line();
  if (fail.length) {
    line(`NOT LIVE: ${fail.length} problem(s). Do not report these stories as published.`);
    process.exitCode = 1;
  } else {
    line(`LIVE: all ${expected.length} on the page, the index, the sitemap and search.`);
  }
}

main();
