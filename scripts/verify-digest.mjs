// Checks the structured files the daily digest task writes, one per run:
//
//   npm run verify:digest -- <file.json | folder> [more ...]
//
// The `daily-workforce-digest` scheduled task (Claude desktop, not this repo)
// writes `<YYYY-MM-DD>.json` beside its readable digest. Those files live in the
// owner's Drive folder, NOT in this repo: they hold third-party summaries that
// have not been curated yet, and the repo is public. So there is no default
// path here, and none should be added — pass the folder.
//
// This is the gate between "a model wrote some JSON" and "a job builds SQL from
// it". It reads only; it never edits a digest file. The rules themselves live in
// scripts/lib/digest.mjs, shared with news-candidates.mjs.

import { statSync } from 'node:fs';
import { checkDigestFile, digestFiles, nonEmpty } from './lib/digest.mjs';

function collect(arg) {
  return statSync(arg).isFile() ? [arg] : digestFiles(arg);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: npm run verify:digest -- <file.json | folder> [more ...]');
  console.error('There is deliberately no default: the digest files live outside this public repo.');
  process.exit(2);
}

let files;
try { files = args.flatMap(collect); }
catch (e) { console.error(`cannot read ${e.path ?? args.join(' ')}: ${e.code ?? e.message}`); process.exit(2); }
if (files.length === 0) { console.error('no <YYYY-MM-DD>.json files found: not a pass'); process.exit(1); }

let failed = 0;
let total = 0;
const urlFiles = new Map();
for (const f of files) {
  const r = checkDigestFile(f);
  total += r.stories.length;
  for (const s of r.stories) if (s && nonEmpty(s.url)) {
    if (!urlFiles.has(s.url)) urlFiles.set(s.url, []);
    urlFiles.get(s.url).push(r.name);
  }
  const status = r.errors.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${r.name}  ${r.stories.length} stor${r.stories.length === 1 ? 'y' : 'ies'}`);
  for (const e of r.errors) console.log(`       error: ${e}`);
  for (const w of r.warnings) console.log(`       warn:  ${w}`);
  if (r.errors.length) failed++;
}

const repeats = [...urlFiles].filter(([, fs]) => fs.length > 1);
console.log(`\n${files.length} file(s), ${total} stories, ${failed} failed.`);
if (repeats.length) {
  // Expected, not an error: each run looks back 7 days, so neighbouring days
  // overlap. The weekly prep collapses these; this line shows how much.
  console.log(`${repeats.length} URL(s) appear in more than one file (overlapping 7-day windows).`);
}
process.exit(failed ? 1 : 0);
