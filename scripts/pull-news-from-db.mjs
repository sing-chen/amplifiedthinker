// Pulls stories that exist in prod's `news_stories` but not in content/news.json
// into the file, at their stored position.
//
//   npm run pull:news            dry run: lists what it would add, writes nothing
//   npm run pull:news -- --write apply it
//
// Reads with the anon key only (news_stories_public_read), same as
// verify-news-duplicates.mjs. Never writes to the database.
//
// ⚠️ legacy_id is `<date>-<array index>` and is a PUBLISHED identifier, so this
// only ever APPENDS to a date group at exactly the index the row already holds.
// A row whose position is taken by a different story, or would leave a gap in
// the array, is reported as a conflict and left alone. Nothing is shifted.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, projects } from './lib/supabase.mjs';

const write = process.argv.includes('--write');
const file = join(ROOT, 'content', 'news.json');
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
const data = JSON.parse(raw.replace(/\r\n/g, '\n'));

const { url, key } = projects().prod;
const res = await fetch(
  `${url}/rest/v1/news_stories?select=*&order=story_date.asc,sort_order.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } }
);
if (!res.ok) { console.error(`prod read failed: ${res.status}`); process.exit(1); }
const rows = await res.json();
if (!rows.length) { console.error('prod returned no rows: not a pass, not a sync source.'); process.exit(1); }

const groups = new Map(data.map((g) => [g.date, g]));
const added = [];
const conflicts = [];
const unplaceable = [];

for (const r of rows) {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(r.legacy_id ?? '');
  if (!m) { unplaceable.push(r); continue; }
  const [, date, idxText] = m;
  const idx = Number(idxText);
  const group = groups.get(date);
  const at = group?.stories[idx];

  if (at) {
    // Position taken. Fine if it is this very story; a conflict if not.
    if (at.url === r.url && at.title === r.title) continue;
    if (at.url === r.url) continue; // same story, title edited in the database
    conflicts.push({ r, why: `position ${r.legacy_id} holds a different story in the file: "${at.title}"` });
    continue;
  }

  const len = group ? group.stories.length : 0;
  if (idx !== len) {
    conflicts.push({ r, why: `position ${r.legacy_id} would leave a gap (the file's group has ${len} stories)` });
    continue;
  }

  const story = {
    title: r.title, source: r.source, url: r.url,
    summary: r.summary, implications: r.implications, tags: r.tags
  };
  if (r.pinned) story.pinned = true;
  if (r.status === 'archived') story.status = 'archived';
  if (r.merged_into) story.mergedInto = r.merged_into;

  if (group) group.stories.push(story);
  else {
    const g = { date, stories: [story] };
    groups.set(date, g);
    data.push(g);
  }
  added.push(r);
}

data.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // stable; within-group order untouched

console.log(`prod: ${rows.length} rows. File: ${rows.length - added.length - conflicts.length - unplaceable.length} matched.\n`);
console.log(`Would add ${added.length}:`);
for (const r of added) console.log(`  ${r.legacy_id.padEnd(14)} ${r.status.padEnd(9)} ${r.source ?? ''} | ${r.title}`);
if (conflicts.length) {
  console.log(`\n⚠️ ${conflicts.length} conflict(s), NOT added:`);
  for (const c of conflicts) console.log(`  ${c.r.legacy_id}  "${c.r.title}"\n      ${c.why}`);
}
if (unplaceable.length) {
  console.log(`\n⚠️ ${unplaceable.length} row(s) with no usable legacy_id, NOT added:`);
  for (const r of unplaceable) console.log(`  ${r.slug}`);
}

// exitCode, not process.exit(): exiting with a fetch still winding down trips a libuv assertion on Windows.
if (!write) console.log('\nDry run. Nothing written. Re-run with --write to apply.');
else if (!added.length) {
  console.log('\nNothing to add.');
  if (conflicts.length || unplaceable.length) process.exitCode = 1;
} else {
  let out = JSON.stringify(data, null, 2) + '\n';
  if (crlf) out = out.replace(/\n/g, '\r\n');
  writeFileSync(file, out, 'utf8');
  console.log(`\nWrote ${added.length} stories to content/news.json.`);
}
