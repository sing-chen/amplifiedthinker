// Fails if any tracked text file contains UTF-8 bytes that were decoded as CP1252.
//
//   npm run verify:encoding     report and exit 1 on damage
//   npm run fix:encoding        repair in place, then report
//
// ⚠️ THIS IS THE HALF THAT MAKES THE POWERSHELL TRAP SURVIVABLE. CLAUDE.md has
// warned since 2026-08-21 never to round-trip these files through PowerShell
// Get-Content/Set-Content, and the warning did not hold: on 2026-08-23
// public/search-index.json was found with 39 mojibaked characters live on main,
// in four separate sequences, having been rewritten by ConvertTo-Json instead of
// the UTF-8-safe python that /add-news documents.
//
// It went unnoticed because every automated check passed. The JSON was still
// valid, the entry count was still right, the diff was clean once committed, and
// the damage was three characters wide in a 1000-line file. Only a person reading
// a search result would ever see "Brené Brown". That is precisely the shape of
// defect this repo already gates the build on elsewhere, so it is gated here too.
//
// Same shape as verify:catalogue, verify:redirects and verify:email: no
// credential, no network, exit 1 with the fix printed.
//
// ⚠️ Source below is deliberately pure ASCII. A scanner for encoding damage must
// not depend on non-ASCII literals surviving whatever writes it — the first
// draft of this logic silently stopped matching when its own character class was
// mangled, which is the bug it exists to catch.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');

// Roots worth scanning. Deliberately a fixed list rather than `git ls-files`:
// this runs as prebuild on Vercel, and must not depend on a usable git
// checkout in the build image.
const ROOTS = ['public', 'src', 'docs', 'scripts', 'supabase', '.claude'];
const ROOT_FILES = ['CLAUDE.md', 'BACKLOG.md', 'README.md'];

// ⚠️ 'worktrees' matters: .claude/worktrees/<name> IS a full checkout of this
// repo, so walking into it would rescan everything under a second root.
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', '.astro', '.vercel', '_originals', 'worktrees',
]);
const SKIP_EXT = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf|eot|pdf|zip|mp4|webm)$/i;

// Sequences that are legitimately present and must not be flagged.
// Keyed by repo-relative path (forward slashes), value is the set of allowed
// mojibake strings. Keep this as tight as possible: exempting a whole file would
// let real damage through, so each entry names the exact sequence.
// Written as escapes, not literals, for the same reason the scanner is: an
// allowlist of mojibake that is itself stored as mojibake stops matching the
// moment anything re-encodes this file, and then it silently allows everything.
const S = (...codes) => String.fromCharCode(...codes);
const MOJIBAKE = {
  middot: S(0xc2, 0xb7),        // U+00B7  .
  emdash: S(0xe2, 0x20ac, 0x201d), // U+2014  --
  endash: S(0xe2, 0x20ac, 0x201c), // U+2013  -
  eacute: S(0xc3, 0xa9),        // U+00E9  e-acute
};

// ⚠️ These three are PROSE that quotes the corruption in order to warn about
// it, so the sequences below are intentional. None of them is served to a
// browser — the exemption covers documentation only, never anything in
// public/. If a served file needs an entry here, something is wrong.
const DOCS_THAT_QUOTE_IT = Object.values(MOJIBAKE);
const ALLOW = {
  'CLAUDE.md': DOCS_THAT_QUOTE_IT,
  '.claude/commands/add-news.md': DOCS_THAT_QUOTE_IT,
  '.claude/commands/add-skill.md': DOCS_THAT_QUOTE_IT,
};

// CP1252 renderings of bytes 0x80-0x9F, which have no Latin-1 equivalent.
const CP1252_HIGH = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

const decoder = new TextDecoder('utf-8', { fatal: true });

// The byte a character would have been, if this text is CP1252-decoded UTF-8.
function toByte(ch) {
  if (ch === undefined) return undefined;
  const c = ch.codePointAt(0);
  if (c >= 0x80 && c <= 0xff) return c;
  return CP1252_HIGH.get(c);
}

// A UTF-8 lead byte: C2-DF (2-byte), E0-EF (3-byte), F0-F4 (4-byte).
const isLead = (c) => c !== undefined && c >= 0xc2 && c <= 0xf4;

function scan(s) {
  const hits = [];
  for (let i = 0; i < s.length; i++) {
    const lead = s.codePointAt(i);
    if (!isLead(lead)) continue;
    const len = lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : 4;
    const bytes = [];
    for (let k = 0; k < len; k++) {
      const b = toByte(s[i + k]);
      if (b === undefined) break;
      bytes.push(b);
    }
    if (bytes.length !== len) continue;
    let fixed;
    // A fatal decode is what keeps this precise: a genuine accented character
    // followed by ordinary text does not form a valid UTF-8 sequence, so it is
    // skipped rather than "repaired" into something else.
    try { fixed = decoder.decode(Uint8Array.from(bytes)); } catch { continue; }
    hits.push({ index: i, raw: s.slice(i, i + len), fixed });
    i += len - 1;
  }
  return hits;
}

function repair(s, hits) {
  let out = '', last = 0;
  for (const h of hits) {
    out += s.slice(last, h.index) + h.fixed;
    last = h.index + h.raw.length;
  }
  return out + s.slice(last);
}

function walk(dir, acc) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, acc);
    } else if (e.isFile() && !SKIP_EXT.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = [];
for (const r of ROOTS) walk(join(ROOT, r), files);
for (const f of ROOT_FILES) {
  const p = join(ROOT, f);
  try { if (statSync(p).isFile()) files.push(p); } catch { /* not present */ }
}

const cp = (ch) => 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');

let damaged = 0, repaired = 0, scanned = 0;
const report = [];

for (const full of files) {
  const rel = relative(ROOT, full).split(sep).join('/');
  let s;
  try { s = readFileSync(full, 'utf8'); } catch { continue; }
  if (s.indexOf(String.fromCharCode(0)) !== -1) continue; // binary
  scanned++;

  const allowed = ALLOW[rel] || [];
  const hits = scan(s).filter((h) => !allowed.includes(h.raw));
  if (!hits.length) continue;

  damaged++;
  const by = new Map();
  for (const h of hits) {
    const line = s.slice(0, h.index).split('\n').length;
    const key = h.raw;
    if (!by.has(key)) by.set(key, { fixed: h.fixed, lines: [] });
    by.get(key).lines.push(line);
  }

  report.push(`  ${rel}`);
  for (const [raw, { fixed, lines }] of by) {
    const from = [...raw].map(cp).join(' ');
    const shown = lines.slice(0, 8).join(', ') + (lines.length > 8 ? ', ...' : '');
    report.push(`      ${from}  ->  ${cp(fixed)} ${JSON.stringify(fixed)}` +
                `   x${lines.length}   line ${shown}`);
  }

  if (FIX) {
    // ⚠️ node, utf8, no BOM. Writing this back through PowerShell is what
    // caused the damage in the first place.
    writeFileSync(full, repair(s, scan(s).filter((h) => !allowed.includes(h.raw))), 'utf8');
    repaired += hits.length;
    report.push(`      REPAIRED ${hits.length}`);
  }
}

if (!damaged) {
  console.log(`encoding clean across ${scanned} text files\n`);
  process.exit(0);
}

if (FIX) {
  console.log(`\nRepaired ${repaired} character(s) in ${damaged} file(s):\n`);
  console.log(report.join('\n'));
  console.log(`\n  ⚠️ Review the diff before committing. Expect ONLY character-level`);
  console.log(`     changes — if git reports whole lines moving, something else ran.\n`);
  process.exit(0);
}

console.error(`\nUTF-8 text has been decoded as CP1252 (mojibake) in ${damaged} file(s):\n`);
console.error(report.join('\n'));
console.error(`\n  Fix:  npm run fix:encoding`);
console.error(`\n  Then find what wrote the file. This is almost always a PowerShell`);
console.error(`  round-trip — Get-Content/Set-Content, or ConvertTo-Json. Use node`);
console.error(`  (readFileSync/writeFileSync, utf8) instead, per CLAUDE.md.\n`);
process.exit(1);
