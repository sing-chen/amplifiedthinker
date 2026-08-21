// Asks both live origins which commit they are built from.
//
//   npm run verify:stamp              -> compares both origins against origin/main
//   npm run verify:stamp -- <sha>     -> compares both origins against that commit
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

const ORIGINS = {
  vercel: 'https://amplifiedthinker.com/build.json',
  // ⚠️ Pages serves from a subpath, so the stamp is NOT at the domain root.
  pages: 'https://sing-chen.github.io/amplifiedthinker/build.json',
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

// The two origins disagreeing is its own finding, separate from either being
// stale: Pages has lagged Vercel by ~2 minutes before, diagnosed by hand as a
// build still finishing. This turns that judgement call into a fact.
if (seen.length === 2 && seen[0].sha !== seen[1].sha) {
  console.log('\n  ⚠️  the two origins are built from DIFFERENT commits');
  console.log('      Pages has lagged Vercel by ~2 min before -- re-run before concluding.');
}

console.log(failures ? `\n${failures} problem(s)` : '\nboth origins current');
process.exitCode = failures ? 1 : 0;
