// Builds a specimen page for the completion control, for judging its colours
// against the things it sits next to.
//
//   npm run specimen:completion            -> specimen-completion.html at the root
//   npm run specimen:completion -- <path>  -> somewhere else
//
// WHY IT GENERATES RATHER THAN BEING A HAND-WRITTEN PAGE. The control is drawn
// by progress.js into ten pages and only ever appears for a signed-in user at
// the end of a long plan, which makes it tedious to look at and easy to review
// from a copy that has quietly drifted. So this lifts the REAL stylesheet by
// evaluating the actual COMPLETION_CSS expression out of the source: the only
// difference from what ships is that `#completionSlot` is renamed `#slot1..N`
// so several instances can coexist on one page. If the styles change and this
// is not re-run, it is wrong in a way that is obvious rather than subtle.
//
// ⚠️ It renders the component OUT OF CONTEXT - no hero, no fourteen sections
// above it, no scroll. It answers "is this distinct from its neighbours", which
// is what it was written for. It does not answer "does this sit well at the end
// of a long read", and nothing but the real page will.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'specimen-completion.html'));

// 1. Lift COMPLETION_CSS out of progress.js by evaluating the real expression.
const src = readFileSync(join(ROOT, 'public/progress.js'), 'utf8');
const start = src.indexOf('var COMPLETION_CSS =');
const mark = "transition:none}}'";
const stop = src.indexOf(mark, start) + mark.length;
const expr = src.slice(start + 'var COMPLETION_CSS ='.length, stop);
const S = '#completionSlot ';
const D = '[data-theme="dark"] #completionSlot ';
const css = new Function('S', 'D', 'return (' + expr + ')')(S, D);

// 2. Scope-rename only. Every other byte is what the browser is served.
const scoped = [1, 2, 3, 4, 5, 6, 7, 8]
  .map((n) => css.split('#completionSlot').join('#slot' + n))
  .join('\n');

// 3. The markup render() produces, per state.
const TICK = '<span class="ac-tick" aria-hidden="true"><svg viewBox="0 0 24 24">' +
             '<polyline points="4 12.5 9.5 18 20 6.5"/></svg></span>';

const HEAD = 'Worked all the way through this learning plan?';

const unset = (id, note) =>
  `<div id="slot${id}"><div class="ac-box">` +
  `<p class="ac-head">${HEAD}</p>` +
  `<button class="ac-btn" type="button">I&rsquo;ve completed this</button>` +
  `<p class="ac-note${note.err ? ' ac-err' : ''}">${note.text}</p>` +
  `</div></div>`;

const done = (id) =>
  `<div id="slot${id}"><div class="ac-box is-done">` +
  `<p class="ac-head">${TICK}Completed 20 August</p>` +
  `<button class="ac-undo" type="button">Mark as not complete</button>` +
  `</div></div>`;

const DEFAULT_NOTE = { text: 'Only you can see this, and you can undo it at any time.' };
const ERR_NOTE = { err: true, text: 'That did not save. Check your connection and try again.' };

const neighbour =
  '<div class="next-step-card">' +
  '<p class="next-step-label">What to work on next</p>' +
  '<p class="next-step-body">Systems Thinking closes the loop with Analytical Thinking and ' +
  'Critical Thinking&hellip;</p>' +
  '<span class="next-step-btn-outline">Browse resources below &rarr;</span>' +
  '</div>';

const stage = (theme, body, label, note) =>
  `<figure class="stage">` +
  `<figcaption class="cap"><b>${label}</b>${note ? ' &middot; ' + note : ''}</figcaption>` +
  `<div class="ground"${theme === 'dark' ? ' data-theme="dark"' : ''}>${body}${neighbour}</div>` +
  `</figure>`;

const stagesA = [
  stage('light', unset(1, DEFAULT_NOTE), 'Light &middot; not complete', 'white fill, terracotta bar'),
  stage('light', done(2), 'Light &middot; complete', 'solid teal, reversed text'),
  stage('dark', unset(3, DEFAULT_NOTE), 'Dark &middot; not complete', 'surface fill, light bar'),
  stage('dark', done(4), 'Dark &middot; complete', 'mint fill, dark text'),
].join('\n');

const stagesB = [
  stage('light', unset(5, ERR_NOTE), 'Light &middot; write failed', 'state unchanged, said plainly'),
  stage('dark', unset(6, ERR_NOTE), 'Dark &middot; write failed', ''),
].join('\n');

// The primer variant, shown against the 560px card it has to sit beside.
const primerNeighbour =
  '<div class="next-step-card" style="max-width:560px">' +
  '<p class="next-step-label">Ready to go deeper?</p>' +
  '<p class="next-step-body">The Full Learning Plan covers first principles, mental models&hellip;</p>' +
  '<span class="next-step-btn-outline">Open Full Learning Plan &rarr;</span>' +
  '</div>';

const compactUnset = (id) =>
  `<div id="slot${id}"><div class="ac-box ac-compact">` +
  `<p class="ac-head">Finished this primer?</p>` +
  `<button class="ac-btn" type="button">I&rsquo;ve completed this</button>` +
  `<p class="ac-note">Only you can see this, and you can undo it at any time.</p>` +
  `</div></div>`;

const compactDone = (id) =>
  `<div id="slot${id}"><div class="ac-box ac-compact is-done">` +
  `<p class="ac-head">${TICK}Completed 20 August</p>` +
  `<button class="ac-undo" type="button">Mark as not complete</button>` +
  `</div></div>`;

const primerStage = (theme, body, label, note) =>
  `<figure class="stage">` +
  `<figcaption class="cap"><b>${label}</b>${note ? ' &middot; ' + note : ''}</figcaption>` +
  `<div class="ground"${theme === 'dark' ? ' data-theme="dark"' : ''}>${body}${primerNeighbour}</div>` +
  `</figure>`;

const stagesC = [
  primerStage('light', compactUnset(7), 'Primer &middot; not complete', '560px, matching its neighbour'),
  primerStage('dark', compactDone(8), 'Primer &middot; complete', ''),
].join('\n');

const template = join(dirname(fileURLToPath(import.meta.url)), 'completion-specimen.template.html');
const page = readFileSync(template, 'utf8')
  .replace('/*__SCOPED_CSS__*/', scoped)
  .replace('<!--__STAGES_A__-->', stagesA)
  .replace('<!--__STAGES_B__-->', stagesB)
  .replace('<!--__STAGES_C__-->', stagesC);

// A leftover placeholder means a rename went one way and not the other, which
// would otherwise ship a page with a visible /*__SCOPED_CSS__*/ in it.
const leftover = /__SCOPED_CSS__|__STAGES_[ABC]__/.test(page);
if (leftover) {
  console.error('A placeholder was not substituted. The template and this script disagree.');
  process.exit(1);
}

writeFileSync(OUT, page);
console.log(`Lifted ${css.length} bytes of shipped CSS from public/progress.js`);
console.log(`Wrote ${page.length} bytes to ${OUT}`);
