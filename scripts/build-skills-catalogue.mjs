// Derives public/skills-catalogue.json from the plan and primer pages.
//
//   npm run build:catalogue           -> writes the catalogue
//   npm run verify:catalogue          -> regenerates and fails if it has drifted
//
// WHY THIS IS GENERATED AND NOT DECLARED. To render "0 of 13" for a skill nobody
// has opened, a page needs every plan and primer length — and the database cannot
// supply it, because a skill_progress row springs into existence only when someone
// opens the page. So every surface needs all five skills accounted for INCLUDING
// the untouched ones, from something that is not per-user state.
//
// ⚠️ A `skills` table was proposed for this and rejected. A row saying "14" does
// not MAKE it 14 — the nav rail does — so the row is an assertion about some HTML
// that can silently disagree with it, and the disagreement would then live in a
// database rather than in the repo where git diff and review would show it. It
// also splits something atomic: adding a skill is one commit today, and binding
// it to a data change in two Supabase projects introduces a stale row reporting a
// wrong denominator with nothing failing.
//
// So: derive the counts, and pair it with a check, in the shape the repo already
// trusts for verify:redirects and verify:email. A content edit that outgrows the
// catalogue then fails loudly instead of quietly reporting "14 of 15" as complete.
//
// ⚠️ EDITORIAL fields are deliberately NOT here — display name, category,
// ordering, status, summary copy. Those are decisions, not facts about a page,
// and their natural home is a table alongside an admin UI. The counts stay
// derived even then.
//
// ⚠️ NO TIMESTAMP IN THE OUTPUT. A generated-at field would make every
// regeneration produce a diff, so the check could no longer compare content and
// would churn the file on every run. The git history is the timestamp.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REL = 'public/skills-catalogue.json';

// ⚠️ The five skills with pages, in the order future-skills.html lists them.
// A sixth skill means adding it here AND to that page — /add-skill covers both.
export const SKILLS = [
  'analytical-thinking',
  'creative-thinking',
  'critical-thinking',
  'strategic-synthesis',
  'systems-thinking',
];

function read(skill, kind) {
  const p = join(ROOT, 'public/skills', skill, `${kind}.html`);
  if (!existsSync(p)) throw new Error(`missing ${kind}.html for ${skill}`);
  return readFileSync(p, 'utf8');
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- plans ---------------------------------------------------------------
// <a class="nav-link" href="#x" data-section="x" [data-optional]>
//   <span class="nav-dot"></span>07 · Behavioral Indicators</a>
//
// The nav rail IS the source of truth: progress.js writes state.total from
// navLinks.length, and the scroll handler marks the same data-section values.
// Reading anything else would describe a different list from the one recorded.
function parsePlan(html, skill) {
  const re = /<a\s+class="nav-link"[^>]*data-section="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g;
  const sections = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, id, attrs, inner] = m;
    const label = decode(inner);
    // "07 · Behavioral Indicators" -> "Behavioral Indicators"
    const name = label.replace(/^\s*\d+\s*·\s*/, '');
    sections.push({ id, name, optional: /\bdata-optional\b/.test(attrs) });
  }
  if (!sections.length) throw new Error(`${skill}: no plan sections found`);

  const optional = sections.filter((s) => s.optional);
  if (optional.length !== 1) {
    throw new Error(
      `${skill}: expected exactly 1 data-optional section, found ${optional.length}` +
      (optional.length ? ` (${optional.map((s) => s.id).join(', ')})` : '') +
      `\n  Explore Further is the only section excluded from the denominator.` +
      `\n  If that has genuinely changed, update this check with the reasoning.`
    );
  }
  // ⚠️ Optional sections are excluded from the denominator, not from the list.
  // The last COUNTED section must still be one a reader scrolls past, or nobody
  // can reach 100% — the reason Explore Further being last was a latent bug.
  if (!sections[sections.length - 1].optional) {
    throw new Error(
      `${skill}: the last section is not the optional one.` +
      `\n  Excluding a section in the middle leaves a trailing counted section` +
      `\n  that may never cross the active line, making 100% unreachable.`
    );
  }

  return {
    total: sections.length,
    counted: sections.length - optional.length,
    sections,
  };
}

// ---- primers -------------------------------------------------------------
// <button class="nav-link" data-slide="3"><span class="nav-num">04</span>
//   <span>The Outcome</span><span class="nav-dot"></span></button>
function parsePrimer(html, skill) {
  const re = /<button\s+class="nav-link[^"]*"\s+data-slide="(\d+)"[^>]*>([\s\S]*?)<\/button>/g;
  const slides = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, idx, inner] = m;
    // Drop the leading <span class="nav-num">NN</span> before decoding.
    const name = decode(inner.replace(/<span class="nav-num">[\s\S]*?<\/span>/, ''));
    slides.push({ index: Number(idx), name });
  }
  if (!slides.length) throw new Error(`${skill}: no primer slides found`);

  // Cross-check the rail against the deck itself. These are two independent
  // lists in the same file and nothing but this keeps them in step.
  const stageCount = (html.match(/<div class="slide [^"]*" data-index="\d+"/g) || []).length;
  if (stageCount !== slides.length) {
    throw new Error(
      `${skill}: primer rail lists ${slides.length} slides but the deck has ${stageCount}.` +
      `\n  One of the two was edited without the other.`
    );
  }
  slides.forEach((s, i) => {
    if (s.index !== i) throw new Error(`${skill}: primer slide ${i} has data-slide="${s.index}"`);
  });

  // ⚠️ No optional slides. `visited` means "advanced to" for a primer and
  // "stopped on" for a plan — a real divergence, recorded so it is a decision
  // rather than a surprise. Both surfaces must agree on it.
  return { total: slides.length, counted: slides.length, slides };
}

export function buildCatalogue() {
  const skills = {};
  for (const skill of SKILLS) {
    skills[skill] = {
      plan: parsePlan(read(skill, 'plan'), skill),
      primer: parsePrimer(read(skill, 'primer'), skill),
    };
  }
  return { version: 1, skills };
}

// ---- CLI -----------------------------------------------------------------
// Only when run directly. verify-catalogue.mjs imports buildCatalogue() and
// must not have the file written out from under the comparison it is making.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let catalogue;
  try {
    catalogue = buildCatalogue();
  } catch (e) {
    console.error(`\ncatalogue build failed:\n  ${e.message}\n`);
    process.exitCode = 1;
  }
  if (catalogue) {
    // LF, and a trailing newline. The repo stores LF (core.autocrlf=true) and
    // every origin serves LF; writing CRLF here would show a diff on every
    // machine that touched it.
    const json = JSON.stringify(catalogue, null, 2).replace(/\r\n/g, '\n') + '\n';
    writeFileSync(join(ROOT, OUT_REL), json);
    console.log(`wrote ${OUT_REL}\n`);
    for (const [skill, s] of Object.entries(catalogue.skills)) {
      console.log(
        `  ${skill.padEnd(20)} primer ${String(s.primer.total).padStart(2)}` +
        `   plan ${s.plan.counted} of ${s.plan.total}` +
        `   (optional: ${s.plan.sections.filter((x) => x.optional).map((x) => x.id).join(', ')})`
      );
    }
  }
}
