// Builds a specimen of a REAL plan page with a signed-in reader, so the notes
// panel can be seen and driven without an account.
//
//   npm run specimen:skill-notes            -> public/skills/analytical-thinking/specimen-notes.html
//   npm run specimen:skill-notes -- primer  -> the primer instead
//
// ⚠️ IT IS THE REAL PAGE, NOT A MOCK-UP OF ONE. The output is
// `plan.html` byte-for-byte apart from the substitutions listed below, so the
// panel is measured against the actual stylesheet, the actual nav rail, the
// actual tokens and the actual dark-mode block — none of which a hand-written
// harness would reproduce, and all of which are where this project's visual
// defects have historically lived.
//
// ⚠️ IT IS WRITTEN INTO public/ SO THE `../../` PATHS STILL RESOLVE, which is
// why it is named `specimen-*.html` — .gitignore already covers that pattern at
// any depth, so it cannot be committed. Delete it when finished; it is a local
// artefact and has no business being deployed.
//
// ---------------------------------------------------------------------------
// WHAT IS FAKED, AND WHAT THAT COSTS
// ---------------------------------------------------------------------------
//
// Exactly two things: `window.AmplifiedAuth`, and the PostgREST calls behind
// it. Everything else — note-editor.js, skill-notes.js, the page — is what
// ships.
//
// ⚠️ A STUB CANNOT FALSIFY AN ASSUMPTION THE PERSON WRITING IT HOLDS. That is
// not a general caution here, it is this project's own most expensive Phase 6
// defect: `saveNote()` used an upsert that could never work against a partial
// index, and it survived every browser test because the stub's `upsert` was a
// function written by the person holding the assumption. The real first
// exercise of the write path was a reader's first save.
//
// So this page proves rendering, ordering, the anchor picker, the two modes,
// dark mode and the mobile offset. It proves NOTHING about whether
// `insert`/`update`/`delete` are shaped the way PostgREST wants, and nothing
// whatever about RLS — which needs a second account, because with one owner
// "only mine" and "everything" are the same result.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIND = (process.argv[2] || 'plan').toLowerCase() === 'primer' ? 'primer' : 'plan';
const DIR = join(ROOT, 'public', 'skills', 'analytical-thinking');
const OUT = join(DIR, 'specimen-notes.html');

let src = readFileSync(join(DIR, `${KIND}.html`), 'utf8');

// ⚠️ NOTHING IS REMOVED FROM THE PAGE, AND TWO FALSE FINDINGS BOUGHT THAT RULE.
//
// The first version dropped nav.js, progress.js and exit-guard.js as "things
// that want a real session". Both of the first two are load-bearing for the
// page's OWN inline script, in a chain that is invisible until it breaks:
//
//   nav.js publishes AmplifiedNav
//     -> progress.js reads it, and only reaches its own
//        `global.AmplifiedProgress = {...}` on the last line if it does not throw
//          -> the page's inline script opens with `AmplifiedProgress.forPage()`
//             and dies there if it is missing
//               -> so `updateNav()` is never registered
//                 -> so no rail link ever gets `.active`
//                   -> so a new note cannot prefill the section the reader is on
//
// That last line is this feature's entire premise, and it presented as a defect
// in it. Nothing pointed at the cause except one console line reading
// `AmplifiedProgress is not defined`.
//
// ⚠️ So the specimen ADDS and never SUBTRACTS. A specimen that removes part of
// the page is not measuring the page.

const STUB = `
<script>
/* specimen only — see scripts/dev/build-skill-notes-specimen.mjs */
(function (w) {
  /* ⚠️ SET HERE RATHER THAN ON THE <html> TAG, and the ordering is the reason.
     nav.js runs earlier in the document and writes its own synchronous peek to
     this attribute, so an attribute in the markup would be overwritten with
     'out' before skill-notes.js ever reads it — and the panel would correctly
     refuse to appear. This runs after nav.js and before skill-notes.js.

     Nothing has to be undone to make room for it: for a guest on a skill page
     nav.js does not load the real auth stack at all, so there is no genuine
     AmplifiedAuth for this one to fight with. */
  w.document.documentElement.setAttribute('data-session', 'in');

  var ROWS = [
    { id: 'r1', anchor: 'habits',     body: 'Day 3 is the one I always skip. Put it in the calendar rather than trusting myself to remember.', created_at: '2026-08-20T09:00:00Z' },
    { id: 'r2', anchor: 'principles', body: 'The bit about tracing symptoms to their source is what I got wrong on the Q3 review.', created_at: '2026-08-21T09:00:00Z' },
    { id: 'r3', anchor: null,         body: 'Worth re-reading the whole thing before the November planning round.', created_at: '2026-08-22T09:00:00Z' },
    { id: 'r4', anchor: 'principles', body: 'Second thought on the same section, written later — these two should sit together, oldest first.', created_at: '2026-08-23T09:00:00Z' },
    { id: 'r5', anchor: 'a-section-that-no-longer-exists', body: 'An anchor pointing at a section the rail does not have. Should still render, showing the raw id.', created_at: '2026-08-24T09:00:00Z' }
  ];
  var next = 6;
  var log = function (m) { (w.SPECIMEN_LOG = w.SPECIMEN_LOG || []).push(m); };

  function thenable(get) {
    var o = {
      eq: function () { return o; },
      select: function () { return o; },
      then: function (res, rej) {
        return new Promise(function (r) { setTimeout(r, 120); })
          .then(function () { return get(); })
          .then(res, rej);
      }
    };
    return o;
  }

  w.AmplifiedAuth = {
    isSignedIn: function () { return true; },
    user: function () { return { id: 'specimen-user', email: 'reader@example.com' }; },
    onAuthChange: function (fn) { w.SPECIMEN_SIGNOUT = function () { fn(null); }; },
    client: function () {
      return {
        from: function (table) {
          return {
            // TABLE-AWARE, because progress.js shares this client and reads
            // skill_progress. A stub answering every table with note rows would
            // feed a plan's completion control five notes and produce some
            // entertaining nonsense on a page being judged by eye.
            // (No backticks in here: this whole block lives inside a template
            //  literal, and one would end the string mid-comment.)
            select: function () {
              return thenable(function () {
                log('select ' + table);
                return { data: table === 'notes' ? ROWS.slice() : [], error: null };
              });
            },
            insert: function (row) {
              return thenable(function () {
                var created = { id: 'r' + (next++), anchor: row.anchor, body: row.body, created_at: new Date().toISOString() };
                ROWS.push(created); log('insert ' + created.id);
                return { data: [created], error: null };
              });
            },
            update: function (patch) {
              return thenable(function () {
                log('update ' + JSON.stringify(patch));
                return { data: null, error: null };
              });
            },
            delete: function () {
              return thenable(function () { log('delete'); return { data: null, error: null }; });
            }
          };
        }
      };
    }
  };
})(window);
</script>`;

/* The stub, then the two note scripts, in that order.
//
// ⚠️ THE SPECIMEN LOADS THEM ITSELF BECAUSE nav.js WILL NOT. Since the guest
// cost was removed, note-editor.js and skill-notes.js are injected by nav.js
// only when `peekSession()` reports something other than 'out' — so on a page
// with no real token nav.js correctly declines, which is the behaviour being
// preserved rather than a problem to route around.
//
// Planting a valid-looking token to make nav.js inject them was the obvious
// alternative and is worse: nav.js would then also load the REAL auth stack,
// and auth.js would overwrite the stub AmplifiedAuth this whole page depends
// on. The gate itself is not what this specimen is for — it is verified
// directly, by loading a real page with and without a stored token and reading
// the request list.
*/
const ANCHOR = '<script src="../../exit-guard.js"></script>';
if (!src.includes(ANCHOR)) {
  // ⚠️ A silent no-op is the failure mode here: String.replace with no match
  // returns the original, so the specimen would build, load, and simply have no
  // notes panel — which reads as a defect in skill-notes.js.
  console.error('anchor not found in the page: ' + ANCHOR);
  console.error('the specimen would have been built WITHOUT the stub. refusing.');
  process.exit(1);
}
src = src.replace(ANCHOR, ANCHOR + '\n' + STUB +
  '\n<script src="../../note-editor.js"></script>' +
  '\n<script src="../../skill-notes.js"></script>');

writeFileSync(OUT, src, 'utf8');
console.log('specimen written: ' + OUT + '  (' + KIND + ')');
console.log('⚠️ gitignored, but it sits under public/ — delete it when finished.');
