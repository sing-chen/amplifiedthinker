// Builds a specimen of the REAL Future Skills page as a signed-in reader with
// notes, so the note counts can be seen and judged without an account.
//
//   npm run specimen:library-notes   -> public/specimen-library-notes.html
//
// ⚠️ IT NO LONGER CARRIES THE LAYER ITSELF. It began as a mock-up: the notes
// rendering lived in an overlay here and was proposed before it existed. That
// overlay was removed the moment the design was accepted and the real code
// landed in future-skills-progress.js — a specimen that keeps its own copy of a
// shipped feature is a page that can pass while the real one is broken, which
// is the exact opposite of what it is for. What remains is data, and the five
// cases below are the reason to keep it.
//
// ⚠️ IT IS THE REAL PAGE. The output is future-skills.html byte-for-byte apart
// from one injected stub, and it loads the REAL nav.js, styles.css,
// skills-progress.js and future-skills-progress.js. So the rings, the status
// pills, the launch cards, the summary strip, the four launch-card colour
// contexts and the whole dark-mode block are what ships — none of which a
// hand-written mock-up reproduces, and all of which are where this project's
// visual defects have actually lived.
//
// ⚠️ It is written into public/ so the page's relative paths still resolve, and
// named specimen-*.html because .gitignore already covers that pattern at any
// depth. Delete it when finished — it has no business being deployed.
//
// ---------------------------------------------------------------------------
// WHAT IS FAKED, AND WHAT THAT COSTS
// ---------------------------------------------------------------------------
//
// One thing: `window.AmplifiedAuth`, and the two PostgREST reads behind it.
// The catalogue is fetched for real, so every section name, slide count and
// denominator on screen is the live one.
//
// So this page proves LAYOUT, WORDING, COLOUR and the empty cases. It proves
// nothing about the notes query itself — same limit as the skill-notes
// specimen, and for the same reason: a stub cannot falsify an assumption held
// by the person who wrote the stub.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'public', 'future-skills.html');
const OUT = join(ROOT, 'public', 'specimen-library-notes.html');

let src = readFileSync(SRC, 'utf8');

/* The five cases on the page, and why each one is there. Every row is a
   deliberate edge, not filler — the empty and singular cases are the ones a
   mock-up normally forgets and the ones most likely to look wrong.

     analytical-thinking   both artefacts touched, notes on both. The ordinary case.
     creative-thinking     primer started with notes, plan untouched with none.
     critical-thinking     both COMPLETE and NO notes — proves nothing renders at zero.
     strategic-synthesis   exactly ONE note. "1 note", not "1 notes".
     systems-thinking      a note on an artefact that is NOT STARTED. ⚠️ The
                           launch card has no personal layer at all in that
                           state (renderLaunchCard returns early to keep the
                           guest text), so the per-card count has nowhere to go.
                           This is the case the footer line exists to catch. */
const STUB = `
<script>
/* specimen only — see scripts/dev/build-library-notes-specimen.mjs */
(function (w) {
  var doc = w.document;

  /* ⚠️ SET HERE, NOT ON THE <html> TAG. nav.js runs on the line above and
     writes its own synchronous localStorage peek to this attribute, so a value
     in the markup would be overwritten with 'out' before the page's bootstrap
     reads it — and the bootstrap would correctly decline to load either
     progress file. This runs after nav.js and before the bootstrap.

     Nothing has to be undone to make room for it: with no real token nav.js
     does not load the auth stack, so there is no genuine AmplifiedAuth for this
     stub to fight with. */
  doc.documentElement.setAttribute('data-session', 'in');

  // slug -> { plan: takeN|'all', primer: takeN|'all', completePlan: bool, ... }
  var PROGRESS = {
    'analytical-thinking': { primer: { take: 'all', complete: true }, plan: { take: 7, at: 'models' } },
    'creative-thinking':   { primer: { take: 4 } },
    'critical-thinking':   { primer: { take: 'all', complete: true }, plan: { take: 'all', complete: true } },
    'strategic-synthesis': { plan: { take: 3, at: 'principles' } },
    // A row that exists with nothing covered — opening a page writes one. It
    // derives as NOT STARTED, which is the point of this case.
    'systems-thinking':    { plan: { take: 0 } }
  };

  var NOTES = [
    'analytical-thinking:plan', 'analytical-thinking:plan', 'analytical-thinking:plan',
    'analytical-thinking:primer',
    'creative-thinking:primer', 'creative-thinking:primer',
    'strategic-synthesis:plan',
    'systems-thinking:plan'
  ];

  // The catalogue is fetched for real, so the visited arrays below are built
  // from the ACTUAL section ids and slide indices. A hardcoded list would drift
  // from the pages and quietly show wrong denominators.
  var cat = fetch('skills-catalogue.json').then(function (r) { return r.json(); });

  function rowsFrom(catalogue) {
    var rows = [];
    Object.keys(PROGRESS).forEach(function (slug) {
      var entry = catalogue.skills[slug];
      if (!entry) return;
      ['primer', 'plan'].forEach(function (kind) {
        var want = PROGRESS[slug][kind];
        if (!want) return;
        var ids = kind === 'plan'
          ? (entry.plan.sections || []).filter(function (s) { return !s.optional; })
              .map(function (s) { return s.id; })
          : (entry.primer.slides || []).map(function (s) { return s.index; });
        var n = want.take === 'all' ? ids.length : want.take;
        var state = { visited: ids.slice(0, n).map(String) };
        if (kind === 'plan' && want.at) state.section = want.at;
        if (kind === 'primer' && n) state.current = ids[n - 1];
        rows.push({
          skill_slug: slug,
          content_type: kind,
          state: state,
          completed_at: want.complete ? '2026-08-14T10:00:00Z' : null,
          updated_at: '2026-08-25T10:00:00Z'
        });
      });
    });
    return rows;
  }

  function thenable(get) {
    var o = {
      eq: function () { return o; },
      select: function () { return o; },
      then: function (res, rej) {
        return cat.then(function (c) { return get(c); }).then(res, rej);
      }
    };
    return o;
  }

  w.AmplifiedAuth = {
    isSignedIn: function () { return true; },
    user: function () { return { id: 'specimen-user', email: 'reader@example.com' }; },
    onAuthChange: function (fn) {
      // Held so the specimen bar can fire a sign-out and prove the layer tears
      // down — a leftover personal layer is a disclosure bug, not a cosmetic one.
      w.SPECIMEN_SIGNOUT = function () { fn(null); };
      fn({ user: { id: 'specimen-user' } });
    },
    client: function () {
      return {
        from: function (table) {
          return {
            // TABLE-AWARE. A stub answering every table with the same rows
            // would feed the notes count into skill_progress and produce
            // nonsense on a page being judged by eye.
            select: function () {
              return thenable(function (c) {
                if (table === 'notes') {
                  return { data: NOTES.map(function (t, i) {
                    return { id: 'n' + i, target_id: t };
                  }), error: null };
                }
                if (table === 'skill_progress') return { data: rowsFrom(c), error: null };
                return { data: [], error: null };
              });
            }
          };
        }
      };
    }
  };
})(window);
</script>`;


/* The specimen's own controls. Deliberately fixed-position and visually unlike
   the site, so nothing here can be mistaken for part of the design under
   review. */
const BAR = `
<style>
  #specbar{position:fixed;right:14px;bottom:14px;z-index:9999;width:270px;
    font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
    background:#101c1a;color:#cfe3dd;border:1px solid #2b4741;border-radius:10px;
    padding:12px 13px;box-shadow:0 8px 28px rgba(0,0,0,.35)}
  #specbar h4{margin:0 0 8px;font:600 12px/1 ui-monospace,monospace;color:#8FCFC3;letter-spacing:.04em}
  #specbar button{font:inherit;margin:0 5px 5px 0;padding:5px 8px;cursor:pointer;
    background:#1d3330;color:#cfe3dd;border:1px solid #2b4741;border-radius:6px}
  #specbar button:hover{background:#264541}
  #specbar dl{margin:9px 0 0;padding-top:8px;border-top:1px solid #2b4741}
  #specbar dt{color:#8FCFC3;margin-top:6px}
  #specbar dd{margin:0;color:#9ab5ae}
</style>
<div id="specbar">
  <h4>SPECIMEN — notes on the library</h4>
  <button onclick="specExpand()">expand all</button>
  <button onclick="specTheme()">dark / light</button>
  <button onclick="SPECIMEN_SIGNOUT()">sign out</button>
  <dl>
    <dt>Analytical</dt><dd>notes on both artefacts</dd>
    <dt>Creative</dt><dd>notes on the primer, none on the untouched plan</dd>
    <dt>Critical</dt><dd>both complete, NO notes — renders nothing</dd>
    <dt>Strategic</dt><dd>exactly one — "1 note"</dd>
    <dt>Systems</dt><dd>a note on a NOT STARTED plan — only the footer line can show it</dd>
  </dl>
</div>
<script>
  function specExpand() {
    document.querySelectorAll('.scard').forEach(function (c) {
      if (c.querySelector('.sbody') && !c.classList.contains('open') && c.id) toggleSkill(c.id);
    });
  }
  function specTheme() {
    var el = document.documentElement;
    el.setAttribute('data-theme', el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }
</script>`;

// ⚠️ A silent no-op is the failure mode of String.replace with no match: the
// specimen would build, load, and simply show the guest page — which reads as a
// defect in the proposal rather than in this script.
const ANCHOR = '<script src="nav.js"></script>';
if (!src.includes(ANCHOR)) {
  console.error('anchor not found: ' + ANCHOR);
  console.error('the specimen would have been built WITHOUT the stub. refusing.');
  process.exit(1);
}
src = src.replace(ANCHOR, ANCHOR + '\n' + STUB);

const END = '</body>';
if (!src.includes(END)) {
  console.error('no </body> in the page. refusing.');
  process.exit(1);
}
src = src.replace(END, BAR + '\n' + END);

writeFileSync(OUT, src, 'utf8');
console.log('specimen written: ' + OUT);
console.log('open http://localhost:4321/specimen-library-notes.html');
console.log('⚠️ gitignored, but it sits under public/ — delete it when finished.');
