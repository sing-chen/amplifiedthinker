// Proves the sign-in return-to-page redirect cannot be pointed off-site.
//
//   npm run verify:signin-return
//
// ⚠️ WHY THIS IS A BUILD GATE and not a one-off check. `?next=` is
// attacker-controlled by definition — it comes from the URL bar. A link like
//   /sign-in/?next=https://evil.example
// genuinely originates from this domain, shows the real sign-in form, and hands
// the reader over the moment they authenticate. It is a phishing primitive, and
// the guard against it is twenty lines that look obviously correct while being
// subtly wrong (see the protocol-relative case below). Twenty lines nobody
// re-tests is exactly where this bug lives.
//
// ⚠️ It LIFTS THE REAL FUNCTION SOURCE out of sign-in.astro and evaluates it,
// rather than reimplementing it here. A retyped copy would pass for ever while
// the shipped one rotted — which for an open-redirect guard is worse than
// having no test at all.
//
// No network, no credential, no browser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'src/pages/sign-in.astro'), 'utf8');

const start = SRC.indexOf('function safeNext()');
const endMark = '\n      }';
const end = SRC.indexOf(endMark, start) + endMark.length;
if (start < 0 || end < start) {
  console.error('\ncould not find safeNext() in src/pages/sign-in.astro.');
  console.error('If it was renamed or removed, this check must be updated to match —');
  console.error('do NOT delete it: the redirect it guards is still there.\n');
  process.exit(1);
}
const fnSrc = SRC.slice(start, end);

// The only thing the function touches besides its own logic.
const ORIGIN = 'https://amplifiedthinker.com';
const PAGES_ORIGIN = 'https://sing-chen.github.io';

function makeSafeNext(origin, pathname) {
  const SITE_BASE = pathname.replace(/sign-in\/?$/, '');
  const window = { location: { origin, pathname, search: '' } };
  // eslint-disable-next-line no-new-func
  const factory = new Function('window', 'SITE_BASE', 'URL', 'URLSearchParams',
    fnSrc + '; return safeNext;');
  return (next) => {
    window.location.search = next === null ? '' : '?next=' + encodeURIComponent(next);
    return factory(window, SITE_BASE, URL, URLSearchParams)();
  };
}

const cases = [
  // [input, expected, why]
  ['/future-skills.html', '/future-skills.html', 'ordinary page'],
  ['/skills/analytical-thinking/plan.html#summary', '/skills/analytical-thinking/plan.html#summary', 'path with hash'],
  ['/news.html?q=ai', '/news.html?q=ai', 'path with query'],
  // The scroll marker rides inside `next` as a synthetic fragment. It must
  // survive validation untouched, or the reader lands at the top of the page.
  ['/future-skills.html#at=1240', '/future-skills.html#at=1240', 'scroll marker preserved'],
  // Junk in the marker is harmless: nav.js only acts on /^#at=(\d+)$/, so this
  // is carried through and then ignored rather than being executed.
  ['/future-skills.html#at=<script>', '/future-skills.html#at=%3Cscript%3E', 'marker junk is inert'],
  [null, null, 'absent'],
  ['', null, 'empty'],

  // --- the attacks ---
  ['https://evil.example', null, 'absolute URL'],
  ['http://evil.example/x', null, 'absolute URL, http'],
  ['//evil.example', null, 'PROTOCOL-RELATIVE — the classic miss'],
  ['//evil.example/path', null, 'protocol-relative with path'],
  ['/\\evil.example', null, 'backslash'],
  ['/\\/evil.example', null, 'backslash variant'],
  ['\\\\evil.example', null, 'double backslash'],
  ['javascript:alert(1)', null, 'javascript scheme'],
  ['data:text/html,<script>', null, 'data scheme'],
  ['   /future-skills.html', null, 'leading whitespace'],
  ['/sign-in/', null, 'loop'],
  ['/sign-in', null, 'loop, no slash'],
  ['relative.html', null, 'relative, not site-absolute'],
  ['../../etc', null, 'traversal, not absolute'],
];

let pass = 0, fail = 0;
console.log('origin: amplifiedthinker.com   base: /\n');
const vercel = makeSafeNext(ORIGIN, '/sign-in/');
for (const [input, expected, why] of cases) {
  let got;
  try { got = vercel(input); } catch (e) { got = 'THREW ' + e.message; }
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${String(JSON.stringify(input)).padEnd(38)} -> ${JSON.stringify(got).padEnd(46)} ${why}`);
}

// ⚠️ A SYNTHETIC SUB-PATH DEPLOYMENT, and deliberately kept after the origin it
// was written for went away. These cases came from GitHub Pages, which hosted
// every project of this account at one origin — so a same-origin check alone was
// not enough there. That origin was retired on 2026-08-26 and `ASTRO_BASE` is
// now never set, but `safeNext()` still contains its base-awareness, and this is
// the only thing testing it. Deleting these because "we don't deploy there any
// more" would drop open-redirect coverage for code that still ships.
console.log('\norigin: sub-path deployment   base: /amplifiedthinker/\n');
const pages = makeSafeNext(PAGES_ORIGIN, '/amplifiedthinker/sign-in/');
const pagesCases = [
  ['/amplifiedthinker/future-skills.html', '/amplifiedthinker/future-skills.html', 'this site'],
  ['/some-other-project/index.html', null, 'ANOTHER PROJECT, same origin'],
  ['/', null, 'origin root, outside the site base'],
  ['//sing-chen.github.io/other', null, 'protocol-relative to same host'],
  ['/amplifiedthinker/sign-in/', null, 'loop'],
];
for (const [input, expected, why] of pagesCases) {
  let got;
  try { got = pages(input); } catch (e) { got = 'THREW ' + e.message; }
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${String(JSON.stringify(input)).padEnd(38)} -> ${JSON.stringify(got).padEnd(46)} ${why}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.error('\n⚠️  The sign-in return redirect accepts something it should not.');
  console.error('   Any FAIL above where an off-site value came back non-null is an');
  console.error('   OPEN REDIRECT. Do not ship it.\n');
}
process.exitCode = fail ? 1 : 0;
