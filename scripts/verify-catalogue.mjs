// Fails if public/skills-catalogue.json has drifted from the pages it describes.
//
//   npm run verify:catalogue
//
// ⚠️ THIS IS THE HALF THAT MAKES THE CATALOGUE SAFE. Generating counts is only
// better than declaring them if something notices when the generated copy stops
// matching. Without this, editing a plan and forgetting to re-run the build
// leaves a committed file quietly reporting "14 of 15" as complete — the exact
// failure a `skills` table was rejected for.
//
// Same shape as verify:redirects and verify:email: no credential, no network,
// exit 1 on drift with the fix printed.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildCatalogue, SKILLS } from './build-skills-catalogue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REL = 'public/skills-catalogue.json';
const OUT = join(ROOT, OUT_REL);

let fresh;
try {
  fresh = buildCatalogue();
} catch (e) {
  console.error(`\nThe pages themselves are inconsistent — the catalogue cannot be built:\n`);
  console.error(`  ${e.message}\n`);
  process.exit(1);
}

if (!existsSync(OUT)) {
  console.error(`\n${OUT_REL} does not exist.\n\n  Fix:  npm run build:catalogue\n`);
  process.exit(1);
}

let committed;
try {
  committed = JSON.parse(readFileSync(OUT, 'utf8'));
} catch (e) {
  console.error(`\n${OUT_REL} is not valid JSON: ${e.message}\n\n  Fix:  npm run build:catalogue\n`);
  process.exit(1);
}

// Compare the parsed values, not the bytes. ⚠️ core.autocrlf=true means the
// working tree is CRLF while the repo stores LF, so a byte comparison would
// fail on every machine for a reason that has nothing to do with drift — the
// trap that already cost this project time in verify:published.
const a = JSON.stringify(fresh);
const b = JSON.stringify(committed);

if (a === b) {
  console.log(`${OUT_REL} is current\n`);
  for (const skill of SKILLS) {
    const s = fresh.skills[skill];
    console.log(
      `  ${skill.padEnd(20)} primer ${String(s.primer.total).padStart(2)}` +
      `   plan ${s.plan.counted} of ${s.plan.total}`
    );
  }
  process.exit(0);
}

// ---- report what moved ---------------------------------------------------
console.error(`\n${OUT_REL} has DRIFTED from the pages.\n`);

const differences = [];
for (const skill of SKILLS) {
  const f = fresh.skills[skill];
  const c = committed.skills && committed.skills[skill];
  if (!c) { differences.push(`  ${skill}: missing from the catalogue entirely`); continue; }

  for (const kind of ['plan', 'primer']) {
    const fk = f[kind], ck = c[kind] || {};
    if (fk.total !== ck.total) {
      differences.push(`  ${skill} ${kind}: total ${ck.total} -> ${fk.total}`);
    }
    if (fk.counted !== ck.counted) {
      differences.push(`  ${skill} ${kind}: counted ${ck.counted} -> ${fk.counted}` +
                       `   ⚠️ this is the denominator a percentage divides by`);
    }
    const fList = (fk.sections || fk.slides || []).map((x) => x.id ?? x.index).join(',');
    const cList = (ck.sections || ck.slides || []).map((x) => x.id ?? x.index).join(',');
    if (fList !== cList) differences.push(`  ${skill} ${kind}: the list of items changed`);
    else {
      // Same items — check the labels, which is what a resume point renders.
      const fN = (fk.sections || fk.slides).map((x) => x.name);
      const cN = (ck.sections || ck.slides).map((x) => x.name);
      fN.forEach((n, i) => {
        if (n !== cN[i]) differences.push(`  ${skill} ${kind}: "${cN[i]}" -> "${n}"`);
      });
    }
  }
}

for (const skill of Object.keys(committed.skills || {})) {
  if (!SKILLS.includes(skill)) differences.push(`  ${skill}: in the catalogue but not in SKILLS`);
}

console.error(differences.length ? differences.join('\n')
                                 : '  (structure differs — regenerate to see it)');
console.error(`\n  Fix:  npm run build:catalogue`);
console.error(`  Then review the diff — a changed denominator changes what "complete" means.\n`);
process.exit(1);
