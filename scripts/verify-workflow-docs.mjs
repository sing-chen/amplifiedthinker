// Fails if the two news-workflow documents drift out of step with each other,
// or out of step with the repo they describe.
//
//   npm run verify:workflow-docs     report and exit 1 on drift
//
// .claude/commands/add-news.md and docs/adding-news.md are the same process
// written twice: one for an agent to execute, one for a person to read. The
// command file says so in its own header -- "Keep the two in step; they
// describe one process." Nothing enforced that, and on 2026-09-12 a single
// /add-news run turned up three separate drifts:
//
//   1. the command's duplicate-check code block said `verify:news-dupes -- dev`
//      while the prose directly under it said prod is the one to check. The
//      block is what gets copied.
//   2. the command sequenced pinning AFTER the step that generates and hands
//      over the SQL. The pin is baked into that SQL, so following the order as
//      written costs a regeneration, a second load, and leaves the wrong story
//      Featured on the live site in between.
//   3. "all 81+ rows" and "the stage 17 first load", against 100 rows and a
//      build stage that had outlived its meaning.
//
// None of these broke a build, and none of them was visible except to someone
// running the workflow and noticing the document was wrong. That is the same
// shape of defect as the skills-catalogue trap and the CP1252 trap: a wrong
// answer that fails no test. So it is gated here too.
//
// Same shape as verify:encoding and verify:catalogue: no credential, no
// network, no dependence on a usable git checkout (this runs as prebuild on
// Vercel), exit 1 with the fix printed.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The declared pair. Adding a third file here is the right move only if it is
// genuinely the same process written a third time.
const PAIR = ['.claude/commands/add-news.md', 'docs/adding-news.md'];

// Numbers that are deliberately historical -- a statement about what was true
// at a past migration, not a claim about the repo now. Add to this only when
// the surrounding prose is explicitly past-tense about a dated event.
const HISTORICAL_COUNTS = new Set([]);

const problems = [];
const fail = (file, line, msg, fix) =>
  problems.push({ file, line, msg, fix });

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const read = (rel) => {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    fail(rel, 0, 'file is missing', `Expected one half of the news-workflow pair at ${rel}.`);
    return null;
  }
  return readFileSync(abs, 'utf8');
};

const docs = Object.fromEntries(PAIR.map((p) => [p, read(p)]));
if (PAIR.some((p) => docs[p] === null)) {
  report();
}

// --- package.json scripts -------------------------------------------------
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const SCRIPTS = new Set(Object.keys(pkg.scripts || {}));

// --- 1. every `npm run <script>` referenced actually exists ---------------
// Catches a renamed or deleted script silently orphaning its documentation.
for (const [file, text] of Object.entries(docs)) {
  for (const m of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
    if (!SCRIPTS.has(m[1])) {
      fail(
        file,
        lineOf(text, m.index),
        `references \`npm run ${m[1]}\`, which is not in package.json`,
        `Either the script was renamed (update the doc) or the doc is ahead of the code (add it).`,
      );
    }
  }
}

// --- 2. the pair agrees on the arguments it passes to a shared script -----
// This is drift #1 above: same command, different flag, in two documents that
// claim to describe one process.
const invocations = {};
for (const [file, text] of Object.entries(docs)) {
  for (const m of text.matchAll(/npm run ([a-z][a-z0-9:-]*) -- (--only |)([a-z0-9<>YMD-]+)/gi)) {
    const [, script, flag, arg] = m;
    if (flag) continue; // `--only <date>` takes a placeholder, not a fixed value
    (invocations[script] ||= []).push({ file, arg, line: lineOf(text, m.index) });
  }
}
for (const [script, uses] of Object.entries(invocations)) {
  const args = new Set(uses.map((u) => u.arg));
  if (args.size > 1) {
    for (const u of uses) {
      fail(
        u.file,
        u.line,
        `\`npm run ${script} -- ${u.arg}\` disagrees with the other document`,
        `The pair uses: ${[...args].map((a) => `\`${a}\``).join(' vs ')}. Pick one and change both.`,
      );
    }
  }
}

// --- 3. markdown links resolve -------------------------------------------
// Relative links must point at something that exists; anchors must match a
// heading in the same file. Deliberate mentions of DELETED files live in
// backticks, not links, so they are correctly ignored here.
const slug = (h) =>
  h
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

for (const [file, text] of Object.entries(docs)) {
  const headings = new Set(
    [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])),
  );
  for (const m of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = m[1];
    const line = lineOf(text, m.index);
    if (target.startsWith('http')) continue;
    if (target.startsWith('#')) {
      if (!headings.has(target.slice(1))) {
        fail(file, line, `anchor link \`${target}\` matches no heading in this file`, `Check the heading text, or the link.`);
      }
      continue;
    }
    // Links are written relative to the repo root in these two files.
    const clean = target.split('#')[0];
    if (!existsSync(resolve(ROOT, clean))) {
      fail(file, line, `links to \`${clean}\`, which does not exist`, `The file moved or was deleted. Point the link at where it lives now.`);
    }
  }
}

// --- 4. row-count claims match content/news.json --------------------------
// Drift #3 above. A doc that tells you to expect 81 rows against a table
// holding 100 teaches you to read a real mismatch as a pass.
const NEWS = join(ROOT, 'content/news.json');
if (existsSync(NEWS)) {
  const groups = JSON.parse(readFileSync(NEWS, 'utf8'));
  const total = groups.reduce((n, g) => n + (g.stories?.length || 0), 0);
  for (const [file, text] of Object.entries(docs)) {
    for (const m of text.matchAll(/\b(\d{2,4})\+? (rows|stories|news entries)\b/g)) {
      const n = Number(m[1]);
      if (n !== total && !HISTORICAL_COUNTS.has(n)) {
        fail(
          file,
          lineOf(text, m.index),
          `claims "${m[0]}" but content/news.json holds ${total} stories`,
          `Update the number, or add it to HISTORICAL_COUNTS in this script if it is deliberately about a past migration.`,
        );
      }
    }
  }
}

// --- 5. pinning is sequenced before the step that generates the SQL -------
// Drift #2 above, and the only one of the three with a live-site consequence.
const cmd = docs[PAIR[0]];
const stepHeads = [...cmd.matchAll(/^## Step [^\n]*$/gm)].map((m) => ({
  text: m[0],
  index: m.index,
}));
// Position is what the previous check reads, but a reader follows the
// numbers. Both have to agree, or a renumbering that nobody moved sends
// someone through the steps in an order the file does not actually have.
// A lettered step (`Step 1a`) is a sub-step: it legitimately repeats the
// number it hangs off, so it is exempt from the duplicate rule but not from
// the ordering one.
const numbered = stepHeads
  .map((h) => {
    const m = h.text.match(/^## Step (\d+)([a-z]?)/);
    return m ? { ...h, n: Number(m[1]), sub: Boolean(m[2]) } : null;
  })
  .filter(Boolean);
for (let i = 1; i < numbered.length; i++) {
  if (numbered[i].n < numbered[i - 1].n) {
    fail(
      PAIR[0],
      lineOf(cmd, numbered[i].index),
      `step numbering goes backwards: "${numbered[i - 1].text.trim()}" is followed by "${numbered[i].text.trim()}"`,
      `Renumber so the steps ascend in the order they appear.`,
    );
  } else if (numbered[i].n === numbered[i - 1].n && !numbered[i].sub && !numbered[i - 1].sub) {
    fail(
      PAIR[0],
      lineOf(cmd, numbered[i].index),
      `two steps share the number ${numbered[i].n}`,
      `Renumber so each step is reached once.`,
    );
  }
}

const pin = stepHeads.find((h) => /\bPin\b/i.test(h.text));
const sql = stepHeads.find((h) => /Generate the SQL/i.test(h.text));
if (!pin || !sql) {
  fail(
    PAIR[0],
    0,
    `could not find both a "Pin" step and a "Generate the SQL" step`,
    `This check guards their order. If a step was renamed, update the patterns in this script.`,
  );
} else if (pin.index > sql.index) {
  fail(
    PAIR[0],
    lineOf(cmd, pin.index),
    `the Pin step comes after the step that generates the SQL`,
    `The pin is baked into the generated SQL. Decided afterwards it costs a regeneration and a second load, and the wrong story sits Featured on the live site in between. Move Pin above it.`,
  );
}

report();

function report() {
  if (!problems.length) {
    console.log(`\nnews workflow docs in step across ${PAIR.length} files`);
    process.exit(0);
  }
  console.error(`\n${problems.length} problem(s) in the news workflow docs:\n`);
  for (const p of problems) {
    console.error(`  ${p.file}${p.line ? `:${p.line}` : ''}`);
    console.error(`    ${p.msg}`);
    console.error(`    -> ${p.fix}\n`);
  }
  console.error(
    'These two files are one process written twice. When they disagree, the\n' +
      'person following either one is being told something untrue.\n',
  );
  process.exit(1);
}
