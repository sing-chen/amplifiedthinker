// Fingerprints every published file on every live origin.
//
//   npm run verify:published          -> writes baseline-before.json
//   npm run verify:published -- after -> writes baseline-after.json and diffs
//
// Runsheet step 27 (before the merge) and step 31 (after).
//
// ⚠️ This hashes what the ORIGINS SERVE against each other across time. It
// deliberately does NOT compare against the working tree: core.autocrlf=true
// means the repo stores LF, the working tree is CRLF, and every origin serves
// LF -- so a working-tree comparison fails on every text file while binaries
// pass. That signature is the artifact, not a bug.
//
// The file list comes from `git ls-tree origin/main -- public/`, which is what
// production is built from right now.

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// One origin since 2026-08-26, when the GitHub Pages origin was retired. Its
// entry is gone rather than commented out: this check fetches every published
// path from every origin, so a dead entry would turn one 404 into hundreds.
const ORIGINS = {
  vercel: 'https://amplifiedthinker.com'
};

const mode = process.argv[2] === 'after' ? 'after' : 'before';

function publishedPaths() {
  const out = execSync('git ls-tree -r origin/main --name-only -- public/', {
    cwd: REPO, encoding: 'utf8'
  });
  return out.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    // public/ is stripped when served -- the file is public/nav.js, the URL is /nav.js
    .map((p) => p.replace(/^public\//, '/'));
}

async function fingerprint(base, path) {
  try {
    const res = await fetch(base + path, { redirect: 'follow' });
    if (!res.ok) return { status: res.status, hash: null };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, hash: createHash('sha256').update(buf).digest('hex').slice(0, 16), bytes: buf.length };
  } catch (e) {
    return { status: 'ERR', hash: null, error: e.message };
  }
}

const paths = publishedPaths();

// ⚠️ DERIVED FROM ORIGINS, NEVER HARDCODED. Both of these lines said "two" and
// `* 2` until 2026-08-26, written when there were two origins and left behind
// when the Pages entry was removed from the map above. The loop was already
// correct, so the check did the right work and then OVERSTATED IT BY DOUBLE —
// "170 fetches, 0 not served" for 85 real ones. A gate that misreports its own
// coverage is worse than one that fails, because nobody goes looking.
const originCount = Object.keys(ORIGINS).length;
const originLabel = `${originCount} origin${originCount === 1 ? '' : 's'}`;

console.log(`${paths.length} published files, ${originLabel}\n`);

const record = { takenAt: new Date().toISOString(), mode, files: {} };
let failures = 0;

for (const path of paths) {
  record.files[path] = {};
  for (const [name, base] of Object.entries(ORIGINS)) {
    const r = await fingerprint(base, path);
    record.files[path][name] = r;
    if (r.status !== 200) {
      failures++;
      console.log(`  MISSING  ${name}  ${path}  -> ${r.status}${r.error ? ' ' + r.error : ''}`);
    }
  }
}

const file = join(REPO, `baseline-${mode}.json`);
writeFileSync(file, JSON.stringify(record, null, 2));
console.log(`\n${paths.length * originCount} fetches, ${failures} not served. Written to ${file}`);

// ── Compare, when running "after" ─────────────────────────────────────────
if (mode === 'after') {
  if (!existsSync(join(REPO,'baseline-before.json'))) {
    console.log('\nNo baseline-before.json to compare against.');
    process.exit(0);
  }
  const before = JSON.parse(readFileSync(join(REPO,'baseline-before.json'), 'utf8'));
  const changed = [];
  const vanished = [];

  for (const [path, origins] of Object.entries(before.files)) {
    for (const name of Object.keys(ORIGINS)) {
      const a = origins[name], b = record.files[path]?.[name];
      if (!b || b.status !== 200) { vanished.push(`${name} ${path}`); continue; }
      if (a.status === 200 && a.hash !== b.hash) changed.push(`${name} ${path}`);
    }
  }

  console.log('\n── Against the pre-merge baseline ──');
  console.log(`changed: ${changed.length}`);
  changed.forEach((c) => console.log(`  ~ ${c}`));
  console.log(`no longer served: ${vanished.length}`);
  vanished.forEach((v) => console.log(`  ! ${v}`));

  // ⚠️ Change is EXPECTED here, not alarming: this phase edits nav.js,
  // progress.js and all ten skill pages. What matters is that the list matches
  // what the branch actually touched, and that nothing has stopped being served.
  console.log('\nExpected to change: nav.js, progress.js, and the 10 skill pages.');
  console.log('Anything else on that list, or anything at all in "no longer served", is a problem.');
}
