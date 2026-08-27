// Builds a specimen page for the note editor, so its state machine can be
// exercised without a session, a database, or a news story.
//
//   npm run specimen:note-editor            -> specimen-note-editor.html at the root
//   npm run specimen:note-editor -- <path>  -> somewhere else
//
// WHY THIS EXISTS. `public/note-editor.js` only ever appears for a signed-in
// reader, behind a button, on a story they have opened — so every check of it
// costs a sign-in, and the parts most worth checking (Save disabled when
// nothing changed, Clear not touching the stored note, Escape backing out of a
// confirmation) are the parts nobody clicks through twice. This page puts four
// editors in four starting states on one screen.
//
// ⚠️ IT LOADS THE REAL FILE WITH A REAL <script src>, and that is the whole
// design. Nothing here reimplements a mode, a label or a rule. Same argument
// `verify-signin-return.mjs` makes about lifting the shipped `safeNext()`
// rather than retyping it: a copy passes while the original rots.
//
// ⚠️ WHAT IT DOES NOT TEST, SAID PLAINLY. `onSave` and `onDelete` here are
// stubs that resolve. They prove the editor calls them and reacts correctly to
// what they return; they prove NOTHING about PostgREST. That distinction is not
// pedantry on this project — Phase 6's worst defect was an upsert that could
// never work, and it survived every browser test because the stub's `upsert`
// was a function written by the person holding the assumption. The write path
// lives in news-actions.js and skill-notes.js and is unchanged by this page.
//
// ⚠️ AND IT RENDERS OUT OF CONTEXT. No story panel, no plan, no scroll. It
// answers "does the editor behave", not "does it sit well where it goes".
//
// ⚠️ HOW TO READ COLOURS OFF THIS PAGE, BECAUSE THE OBVIOUS WAY LIES.
// Flipping `data-theme` and reading `getComputedStyle` in the same script gives
// STALE values for anything whose dark appearance comes only from a custom
// property resolving differently. Measured here on the first run: after setting
// dark, `.story-note-read` reported its dark background correctly while
// `.story-action-btn` reported white — in the same loop, on the same element
// tree. The difference is that the note body has a real
// `[data-theme="dark"] .story-note-read` selector, which forces a match
// recalculation, and the button has none: it is `background: var(--bg-surface)`
// and nothing else, so only the variable changes.
//
// That produced a confident, wrong reading of "the buttons keep their light
// appearance in dark mode", which is a defect this project has genuinely had
// elsewhere and would have been believed. TAKE A SCREENSHOT. If a number is
// needed, read a custom property off `:root` first in the same call, which
// forces the recalculation — or set the theme in one call and measure in the
// next.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'specimen-note-editor.html'));

// The real files, read rather than copied. Inlined instead of linked so the
// page works from file:// with no server.
const editorJs = readFileSync(join(ROOT, 'public/note-editor.js'), 'utf8');
const newsCss = readFileSync(join(ROOT, 'public/news-app.css'), 'utf8');

// ⚠️ styles.css IS NOT OPTIONAL HERE, AND LEAVING IT OUT PRODUCED A FALSE
// FINDING ON THIS PAGE'S FIRST RUN. news-app.css uses the semantic tokens but
// defines none of them — `--bg-page`, `--fg-1` and the `[data-theme="dark"]`
// block all live in styles.css, which /news/ loads through BaseLayout. Without
// it every `var(--…)` fell back to nothing, and the dark-mode check read back a
// transparent background and dark text: exactly what a real dark-mode defect
// looks like. A specimen missing a stylesheet the real page has does not
// under-report, it MIS-reports.
const baseCss = readFileSync(join(ROOT, 'public/styles.css'), 'utf8');

const CASES = [
  { id: 'empty', title: 'No note yet', body: '', note: 'Opens in EDIT. Save is disabled until something is typed. The third button says Close, not Cancel, because there is nothing to go back to.' },
  { id: 'saved', title: 'Note already saved', body: 'Analytical thinking is the one I keep coming back to. The bit about tracing symptoms to their source is what I got wrong on the Q3 review.', note: 'Opens in VIEW. Edit / Delete / Close. Pressing Edit and changing nothing leaves Save disabled.' },
  { id: 'long', title: 'Near the limit', body: 'x'.repeat(455), note: 'The counter should already be in its is-near colour at 455, and the textarea should refuse the 501st character.' },
  { id: 'nodelete', title: 'Delete withheld', body: 'A note on a surface that removes the row itself instead of offering Delete.', note: 'deletable:false — view mode shows Edit and Close only.' }
];

const html = `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Specimen — note editor</title>
<style>${baseCss}</style>
<style>${newsCss}</style>
<style>
  body{font-family:var(--font-body,system-ui);background:var(--bg-page,#F7F5F0);color:var(--fg-heading,#1B2B29);margin:0;padding:32px}
  .wrap{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:28px}
  .case{border:1px solid rgba(31,77,74,.18);border-radius:10px;padding:18px 20px;background:var(--bg-surface,#fff)}
  .case h2{font-size:15px;margin:0 0 4px}
  .case .why{font-size:13px;line-height:1.5;color:var(--text-muted,#5A6B68);margin:0 0 14px}
  .log{font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;margin-top:10px;color:var(--text-muted,#5A6B68)}
  .bar{position:sticky;top:0;background:var(--bg-page,#F7F5F0);padding:8px 0 16px;z-index:2}
  .bar button{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid rgba(31,77,74,.3);background:#fff;cursor:pointer}
</style>
</head>
<body>
<div class="wrap">
  <div class="bar">
    <button type="button" id="themeBtn">Toggle dark</button>
    <button type="button" id="failBtn">Make saving fail</button>
  </div>
${CASES.map(c => `  <section class="case">
    <h2>${c.title}</h2>
    <p class="why">${c.note}</p>
    <div id="mount-${c.id}"></div>
    <p class="log" id="log-${c.id}">no calls yet</p>
  </section>`).join('\n')}
</div>

<script>${editorJs}</script>
<script>
  var failing = false;
  var CASES = ${JSON.stringify(CASES.map(({ id, body }) => ({ id, body })))};

  function log(id, msg) {
    var el = document.getElementById('log-' + id);
    el.textContent = (el.textContent === 'no calls yet' ? '' : el.textContent + '\\n') + msg;
  }

  function settle(id, verb, value) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (failing) { log(id, verb + ' -> REJECTED (simulated)'); reject(new Error('simulated failure')); return; }
        log(id, verb + ' -> ok' + (value ? ' (' + value.length + ' chars)' : ''));
        resolve();
      }, 200);
    });
  }

  CASES.forEach(function (c) {
    window.AmplifiedNoteEditor.create({
      mount: document.getElementById('mount-' + c.id),
      prefix: 'story',
      body: c.body,
      deletable: c.id !== 'nodelete',
      onSave: function (b) { return settle(c.id, 'onSave', b); },
      onDelete: function () { return settle(c.id, 'onDelete'); },
      onClose: function () { log(c.id, 'onClose'); },
      onSaved: function () { log(c.id, 'onSaved'); },
      onDeleted: function () { log(c.id, 'onDeleted'); }
    });
  });

  document.getElementById('themeBtn').addEventListener('click', function () {
    var el = document.documentElement;
    el.setAttribute('data-theme', el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  document.getElementById('failBtn').addEventListener('click', function (e) {
    failing = !failing;
    e.target.textContent = failing ? 'Saving WILL fail' : 'Make saving fail';
  });
</script>
</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log('specimen written: ' + OUT);
