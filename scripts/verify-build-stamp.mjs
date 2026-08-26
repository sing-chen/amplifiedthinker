// Asks production which commit it is built from.
//
//   npm run verify:stamp              -> compares production against origin/main
//   npm run verify:stamp -- <sha>     -> compares production against that commit
//
// ⚠️ This answers the one question `npm run verify:published` cannot. That check
// is differential -- it hashes served bytes before and after a change -- so a
// commit touching only docs, BACKLOG.md, or anything outside `public/` produces
// byte-identical output whether the build SUCCEEDED or FAILED. A failed Vercel
// build leaves the previous deployment serving: hashes match, the site is up, and
// nothing distinguishes "deployed" from "still running last week's build".
//
// Needs no credential -- build.json is a public file on a public site, and the
// repository is public, so the SHA discloses nothing that is not already out.
//
// ⚠️ It also sidesteps the line-endings trap entirely: this compares a JSON VALUE
// against a git SHA, never served bytes against the working tree, so the reason
// verify-published refuses to read the tree does not apply here.

import { execSync } from 'node:child_process';

// One origin since 2026-08-26. The GitHub Pages origin was retired that day and
// its entry removed from here — it 404s now, and a check that reports a failure
// nobody intends to fix is a check people learn to ignore. The shape stays a map
// because the multi-origin case is the reason this script exists at all.
const ORIGINS = {
  vercel: 'https://amplifiedthinker.com/build.json',
};

function expectedSha() {
  const arg = process.argv[2];
  if (arg && /^[0-9a-f]{7,40}$/i.test(arg)) return arg.toLowerCase();
  try {
    // origin/main, not HEAD: this checks what production should be built from,
    // and a local branch is by definition not that.
    return execSync('git rev-parse origin/main', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function readStamp(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    try {
      return { stamp: JSON.parse(text) };
    } catch {
      // A 200 that is not JSON means an SPA fallback or an error page served
      // with the wrong status -- report it as absent, never as a mismatch.
      return { error: 'not JSON (no stamp deployed?)' };
    }
  } catch (e) {
    return { error: e.message };
  }
}

const want = expectedSha();
console.log(want ? `expecting ${want.slice(0, 7)} (origin/main)\n` : 'no expected SHA available\n');

let failures = 0;
const seen = [];

for (const [name, url] of Object.entries(ORIGINS)) {
  const { stamp, error } = await readStamp(url);
  if (error) {
    console.log(`  ${name.padEnd(7)} FAIL  ${error}`);
    failures++;
    continue;
  }
  const sha = (stamp.sha || '').toLowerCase();
  seen.push({ name, sha, stamp });
  const match = want ? sha.startsWith(want) || want.startsWith(sha) : null;
  const verdict = want === null ? 'INFO' : match ? 'ok  ' : 'STALE';
  if (want !== null && !match) failures++;
  console.log(
    `  ${name.padEnd(7)} ${verdict}  ${stamp.short || '???????'}  ` +
      `built ${stamp.builtAt || '?'}  (${stamp.source || '?'})`
  );
}

// Origins disagreeing is its own finding, separate from either being stale --
// when there were two, Pages lagged Vercel by ~2 minutes on a build still
// finishing, and this turned that judgement call into a fact. Kept against
// ORIGINS growing again; with one entry it simply never fires.
if (seen.length > 1 && seen.some((s) => s.sha !== seen[0].sha)) {
  console.log('\n  ⚠️  the origins are built from DIFFERENT commits');
  console.log('      one may still be building -- re-run before concluding.');
}

console.log(failures ? `\n${failures} problem(s)` : '\nall origins current');
process.exitCode = failures ? 1 : 0;
