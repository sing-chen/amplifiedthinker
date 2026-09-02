// Private notes on a primer or a plan.
//
// ⚠️ THE TEN SKILL PAGES ONLY. Same scoping rule news-actions.js, learning.js,
// auth-pages.css and news-app.css follow: styles.css and nav.js are already
// paid for by every page, and nothing else on the site needs a word of this.
//
// ⚠️ THE EDITOR IS NOT IN HERE. note-editor.js owns what a note is — the two
// modes, the counter, the disabled-Save rule, the confirmations. This file owns
// everything about a PLAN: which rows belong to this page, what a note may be
// about, what order they read in, and the control that opens the panel. The
// split exists because notes on a story and notes on a plan are one feature,
// and a second implementation is how two surfaces end up disagreeing.
//
// ⚠️ MANY NOTES PER PLAN, NOT ONE PER SECTION, and the reason is how people
// actually read one. The reader is in step 7 when the thought about step 3
// arrives; sending them back to step 3 to write it down interrupts the reading
// to file the note, and the note is the thing that gets abandoned. So a note is
// written wherever the reader is and OPTIONALLY says what it is about.
//
// ⚠️ GUESTS SEE NOTHING AT ALL — not a prompt, not a greyed control. A guest
// already meets the nav sign-in control and the "not being saved" notice on
// this very page; a third ask here would tip the page from honest into nagging,
// and this one would be asking at the moment somebody is trying to read. That
// also means this file adds NOTHING to nav.js's `pageNeedsAuth()` allowlist:
// that list is for surfaces which render a signed-out state and would otherwise
// mistake "signed out" for "something broke". This renders no signed-out state.

(function (global) {
  'use strict';

  var doc = global.document;

  /* ⚠️ THE PAGE TELLS US WHAT IT IS; NOTHING IS HARDCODED PER SKILL. Ten pages
     would otherwise need ten values kept in step with their own paths, which is
     the drift `/add-skill` has already suffered five times. */
  var route = /\/skills\/([a-z0-9-]+)\/(plan|primer)(?:\.html)?$/i.exec(global.location.pathname);
  if (!route) return;

  var SKILL = route[1].toLowerCase();
  var KIND = route[2].toLowerCase();

  /* ⚠️ `target_id` HAS TO CARRY THE ARTEFACT, NOT JUST THE SKILL, because one
     skill has both a primer and a plan. `skill_progress` solved the same
     problem with a separate `content_type` column; `notes` is polymorphic and
     has only the one text column, so the value carries it. */
  var TARGET_ID = SKILL + ':' + KIND;
  var TARGET_TYPE = 'skill';

  function auth() { return global.AmplifiedAuth || null; }
  function client() { var a = auth(); return a ? a.client() : null; }
  function userId() { var a = auth(); var u = a && a.user(); return u ? u.id : null; }
  function esc(s) {
    var E = global.AmplifiedNoteEditor;
    if (E && E.esc) return E.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── what a note may be about ──────────────────────────────────────────────
     ⚠️ THE NAV RAIL IS THE SOURCE OF TRUTH, and it is the same one
     build-skills-catalogue.mjs uses, for the same reason: `progress.js` writes
     `state.total` from `navLinks.length` and the scroll handler marks the same
     values, so reading anything else would describe a different list from the
     one actually recorded. It gives three things at once — the vocabulary of
     anchors, their labels, and the ORDER, which is what the list reads in. */
  function anchors() {
    var attr = KIND === 'plan' ? 'data-section' : 'data-slide';
    var out = [];
    var links = doc.querySelectorAll('.nav-link[' + attr + ']');
    for (var i = 0; i < links.length; i++) {
      var el = links[i];
      var label = '';
      var spans = el.querySelectorAll('span');
      for (var j = 0; j < spans.length; j++) {
        var t = (spans[j].textContent || '').trim();
        // Skip the number and the dot; the label is the first span with words.
        if (t && !/^\d+$/.test(t) && !spans[j].className) { label = t; break; }
      }
      if (!label) {
        // Plans put "01 · Skill Snapshot" in the link text itself.
        label = (el.textContent || '').trim().replace(/^\d+\s*[·.\-]\s*/, '');
      }
      out.push({ id: String(el.getAttribute(attr)), label: label, order: i });
    }
    return out;
  }

  /* ⚠️ DERIVED LAZILY, AND THE EAGER VERSION WAS A REAL DEFECT RATHER THAN a
     tidier alternative. These scripts are loaded at the TOP of <body>, above
     the nav rail markup they read — so computing the list at module load
     queried a DOM that had no `.nav-link` in it yet and got nothing.

     ⚠️ NOTHING FAILED. `anchors()` returned an empty array, `ORDER` and `LABEL`
     stayed empty, and the panel then rendered perfectly: every note present,
     every chip showing its raw anchor id instead of a section name, the list in
     whatever order the database happened to return, and the About picker
     offering "the plan as a whole" and no sections whatever. A page that looks
     built and is silently missing its whole vocabulary.

     Cached only once it actually finds links, so an early call cannot poison
     it. The rail is static markup, so one successful read is enough. */
  var ANCHORS = null, ORDER = {}, LABEL = {};

  function rail() {
    if (ANCHORS && ANCHORS.length) return ANCHORS;
    var found = anchors();
    if (!found.length) return found;      // do not cache an empty answer
    ANCHORS = found;
    ORDER = {}; LABEL = {};
    ANCHORS.forEach(function (a) { ORDER[a.id] = a.order; LABEL[a.id] = a.label; });
    return ANCHORS;
  }

  // Where the reader is now, so a new note starts out pointing at it.
  function currentAnchor() {
    var attr = KIND === 'plan' ? 'data-section' : 'data-slide';
    var active = doc.querySelector('.nav-link.active[' + attr + ']');
    return active ? String(active.getAttribute(attr)) : null;
  }

  /* ⚠️ ORDER IS THE PLAN'S, NOT THE CLOCK'S, AND NOT ALPHABETICAL. A plan is
     read front to back and its notes accumulate that way, so the list reads as
     marginalia down the document. Anchors sort by their position in the rail;
     notes with no anchor are about the plan as a whole and sit at the end,
     where they read as a summary rather than as an orphan at the top. Within
     one anchor, oldest first — the order the thoughts arrived. */
  function sortNotes(rows) {
    rail();
    return rows.slice().sort(function (a, b) {
      var ao = a.anchor != null && ORDER[a.anchor] != null ? ORDER[a.anchor] : Infinity;
      var bo = b.anchor != null && ORDER[b.anchor] != null ? ORDER[b.anchor] : Infinity;
      if (ao !== bo) return ao - bo;
      return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    });
  }

  /* ── the data layer ────────────────────────────────────────────────────────
     ⚠️ RLS IS THE ONLY THING SCOPING THESE ROWS, AND THIS FILE CANNOT DETECT A
     BROKEN POLICY. Every request below carries `.eq('user_id', uid)`, so if
     `notes_own` were `using (true)` the page would look EXACTLY the same — your
     notes visible, nobody else's showing up, everything feeling right. The
     client filter masks it completely, and `npm run verify:rls` never
     authenticates so it cannot see it either. Proving it means deliberately
     making the request this file never makes, from a SECOND account. The filter
     stays regardless: it is defence in depth, not the boundary. */
  function loadNotes() {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.resolve(null);
    return sb.from('notes')
      .select('id,anchor,body,created_at')
      .eq('user_id', uid)
      .eq('target_type', TARGET_TYPE)
      .eq('target_id', TARGET_ID)
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data || [];
      });
  }

  function insertNote(bodyText, anchor) {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.reject(new Error('signed out'));
    return sb.from('notes')
      .insert({
        user_id: uid,
        target_type: TARGET_TYPE,
        target_id: TARGET_ID,
        anchor: anchor || null,
        body: bodyText
      })
      .select('id,anchor,body,created_at')
      .then(function (r) {
        if (r.error) throw r.error;
        return (r.data && r.data[0]) || null;
      });
  }

  /* ⚠️ ADDRESSED BY `id`, NOT BY A CONFLICT TARGET. news-actions.js writes a
     story's single note with update-then-insert against
     (user_id, target_type, target_id) because a story has exactly one. A plan
     has many, so that triple does not identify a row here — and
     `notes_one_per_target_idx` is scoped `where target_type = 'news'` precisely
     so it does not. `notes.id` is the primary key and is what an edit means. */
  function updateNote(id, bodyText, anchor) {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.reject(new Error('signed out'));
    return sb.from('notes')
      .update({ body: bodyText, anchor: anchor || null })
      .eq('id', id).eq('user_id', uid)
      .then(function (r) { if (r.error) throw r.error; });
  }

  function deleteNote(id) {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.reject(new Error('signed out'));
    return sb.from('notes')
      .delete()
      .eq('id', id).eq('user_id', uid)
      .then(function (r) { if (r.error) throw r.error; });
  }

  /* ── styles ────────────────────────────────────────────────────────────────
     Injected rather than added to a stylesheet, which is exactly what
     progress.js already does and for the same reason: the ten primer and plan
     pages are self-contained and deliberately do NOT link styles.css, so there
     is no shared sheet to put this in. Adding one would mean editing ten files
     and keeping them in step for ever.

     ⚠️ EVERY SELECTOR CARRIES ITS OWN `[data-theme="dark"]` COUNTERPART, and
     that is not belt-and-braces. On these ten pages the semantic tokens do NOT
     flip: `--bg-surface` is still #FFFFFF under `[data-theme="dark"]`, and so
     are `--fg-1` and `--line`. Dark is a parallel `--d-*` set applied per
     component. A panel styled only with semantic tokens renders its LIGHT
     appearance on a dark page — valid CSS, correct token names, a white card on
     a #142320 page, and nothing fails.

     ⚠️ AND THE SPECIFICITY IS DELIBERATE. These rules land in ten pages that
     each have their own <style> block full of element selectors; `.section p`
     is (0,1,1) and would beat a bare class. Everything here is scoped under
     `#skn-root`, which wins without anyone having to audit ten stylesheets. */
  var CSS = [
    '#skn-root{position:fixed;right:20px;bottom:20px;z-index:60;font-family:var(--font-body,inherit)}',
    '#skn-root *{box-sizing:border-box}',

    /* The launcher */
    '#skn-open{display:inline-flex;align-items:center;gap:8px;padding:11px 18px;border-radius:var(--radius-pill,999px);',
      'border:1px solid var(--deep-teal,#26605B);background:var(--deep-teal,#26605B);color:var(--off-white,#F7F5F0);',
      'font-family:var(--font-display,inherit);font-size:13px;font-weight:600;letter-spacing:.02em;cursor:pointer;',
      'box-shadow:0 6px 18px rgba(0,0,0,.18);transition:background .15s,border-color .15s,transform .15s}',
    '#skn-open:hover{background:#1B4A44;border-color:#1B4A44}',
    '#skn-open:focus-visible{outline:2px solid var(--teal,#5BA79F);outline-offset:3px}',
    '#skn-open svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '#skn-count{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;',
      'border-radius:999px;background:var(--off-white,#F7F5F0);color:var(--deep-teal,#26605B);font-size:11px;font-weight:700}',
    '#skn-count[hidden]{display:none !important}',

    /* The panel */
    '#skn-panel{position:absolute;right:0;bottom:calc(100% + 12px);width:min(430px,calc(100vw - 40px));',
      'max-height:min(70vh,620px);display:flex;flex-direction:column;background:#FFFFFF;',
      'border:1px solid rgba(31,77,74,.18);border-radius:var(--radius-lg,10px);box-shadow:0 18px 44px rgba(0,0,0,.22)}',
    /* ⚠️ !important AND ABOVE THE display RULE. `[hidden]{display:none}` is a UA
       rule, so the `display:flex` two lines up beats it — the exact shape that
       has cost this project three defects, the third of which shipped past a
       check written by someone who had just read the warning. Assert computed
       `display`, never `.hidden`. */
    '#skn-panel[hidden]{display:none !important}',

    '#skn-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;',
      'border-bottom:1px solid rgba(31,77,74,.12)}',
    '#skn-head h2{margin:0;font-family:var(--font-display,inherit);font-size:14px;font-weight:650;',
      'letter-spacing:.02em;color:var(--deep-teal,#26605B)}',
    '#skn-head .skn-sub{display:block;font-family:var(--font-body,inherit);font-size:11.5px;font-weight:400;',
      'letter-spacing:0;color:#5A6B68;margin-top:2px}',

    '#skn-body{overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:14px}',
    '#skn-status{margin:0;padding:0 16px;font-size:12.5px;line-height:1.5;color:#5A6B68;min-height:0}',
    '#skn-status:empty{display:none}',
    '#skn-foot{padding:12px 16px;border-top:1px solid rgba(31,77,74,.12)}',

    '.skn-empty{margin:0;font-size:13px;line-height:1.6;color:#5A6B68}',
    '.skn-item{border:1px solid rgba(31,77,74,.14);border-radius:var(--radius,8px);padding:10px 12px;background:#FBFCFB}',
    '.skn-where{display:inline-flex;align-items:center;gap:5px;margin-bottom:8px;padding:3px 9px;border-radius:999px;',
      'background:#EEF2EF;color:var(--deep-teal,#26605B);font-family:var(--font-display,inherit);',
      'font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase}',
    '.skn-where.is-whole{background:transparent;border:1px dashed rgba(31,77,74,.3);color:#5A6B68}',

    /* The editor's own classes, prefixed `skn`. Same shapes as news-app.css,
       written here because these pages have no stylesheet to share. */
    '.skn-note{display:flex;flex-direction:column;gap:8px}',
    '.skn-note-label{font-family:var(--font-display,inherit);font-size:10.5px;font-weight:650;',
      'letter-spacing:.1em;text-transform:uppercase;color:var(--deep-teal,#26605B)}',
    '.skn-note-input{width:100%;padding:9px 11px;border:1px solid rgba(31,77,74,.2);border-radius:var(--radius,8px);',
      'font-family:var(--font-body,inherit);font-size:13.5px;line-height:1.6;color:#1B2B29;background:#FFFFFF;resize:vertical}',
    '.skn-note-input:focus-visible,.skn-note-input:focus{outline:2px solid var(--teal,#5BA79F);outline-offset:1px}',
    '.skn-note-read{font-family:var(--font-body,inherit);font-size:13.5px;line-height:1.65;color:#1B2B29;',
      'white-space:pre-wrap;overflow-wrap:anywhere}',
    '.skn-note-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
    '.skn-note-count{font-size:11.5px;color:#5A6B68}',
    '.skn-note-count.is-near{color:#8A4A28;font-weight:600}',
    '.skn-note-actions{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.skn-note-confirm{font-size:12.5px;line-height:1.5;color:#1B2B29;margin-right:2px}',
    '.skn-note-status{margin:0;font-size:12px;color:#5A6B68}',
    '.skn-note-status:empty{display:none}',
    '.skn-about{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:#5A6B68}',
    /* ⚠️ THE GAP HAS TO BE ON THE LABEL, NOT ONLY ON .skn-about. The <select> is
       INSIDE the <label>, so `.skn-about` has exactly one flex child and its
       `gap` never applies to anything — the word "About" and the control butt
       together, and the select's focus ring then draws straight over the text.
       A gap on a flex container with one child is not a gap. */
    '.skn-about label{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.skn-about select{font-family:var(--font-body,inherit);font-size:12.5px;padding:5px 8px;',
      'border:1px solid rgba(31,77,74,.2);border-radius:var(--radius-sm,4px);background:#FFFFFF;color:#1B2B29;max-width:230px}',
    // Its own focus ring, offset clear of the label beside it, rather than
    // whatever the platform draws tight against the border.
    '.skn-about select:focus-visible{outline:2px solid var(--teal,#5BA79F);outline-offset:2px}',

    '.skn-btn{display:inline-flex;align-items:center;gap:5px;font-family:var(--font-display,inherit);font-size:11.5px;',
      'font-weight:600;letter-spacing:.02em;padding:6px 12px;border-radius:999px;border:1px solid rgba(31,77,74,.22);',
      'background:#FFFFFF;color:var(--deep-teal,#26605B);cursor:pointer}',
    '.skn-btn:hover{background:#F2F6F4;border-color:rgba(31,77,74,.4)}',
    '.skn-btn:focus-visible{outline:2px solid var(--teal,#5BA79F);outline-offset:2px}',
    '.skn-btn:disabled{opacity:.45;cursor:default}',
    '.skn-btn:disabled:hover{background:#FFFFFF;border-color:rgba(31,77,74,.22)}',
    '.skn-btn.is-primary{background:var(--deep-teal,#26605B);border-color:var(--deep-teal,#26605B);color:var(--off-white,#F7F5F0)}',
    '.skn-btn.is-primary:hover{background:#1B4A44;border-color:#1B4A44}',
    '.skn-btn.is-primary:disabled:hover{background:var(--deep-teal,#26605B);border-color:var(--deep-teal,#26605B)}',
    '.skn-btn.is-danger{background:#8A4A28;border-color:#8A4A28;color:#F7F5F0}',
    '.skn-btn.is-danger:hover{background:#6B3820;border-color:#6B3820}',

    /* ── dark ────────────────────────────────────────────────────────────── */
    '[data-theme="dark"] #skn-open{background:var(--d-teal-bg,#1C332E);border-color:var(--d-teal-stroke,#8FCFC3);color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] #skn-open:hover{background:#24443C;border-color:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] #skn-count{background:var(--d-teal-stroke,#8FCFC3);color:#0E1917}',
    '[data-theme="dark"] #skn-panel{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,rgba(255,255,255,.12));',
      'box-shadow:0 18px 44px rgba(0,0,0,.5)}',
    '[data-theme="dark"] #skn-head{border-bottom-color:var(--d-line,rgba(255,255,255,.12))}',
    '[data-theme="dark"] #skn-head h2{color:var(--d-fg-heading,#DCEAE3)}',
    '[data-theme="dark"] #skn-head .skn-sub{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] #skn-status{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] #skn-foot{border-top-color:var(--d-line,rgba(255,255,255,.12))}',
    '[data-theme="dark"] .skn-empty{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] .skn-item{background:var(--d-bg-sunken,#0E1917);border-color:var(--d-line,rgba(255,255,255,.12))}',
    '[data-theme="dark"] .skn-where{background:var(--d-teal-bg,#1C332E);color:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .skn-where.is-whole{background:transparent;border-color:var(--d-line,rgba(255,255,255,.2));color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] .skn-note-label{color:var(--d-fg-brand,#ACC4B6)}',
    '[data-theme="dark"] .skn-note-input{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,rgba(255,255,255,.12));color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] .skn-note-read{color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] .skn-note-count{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] .skn-note-count.is-near{color:var(--d-terra-stroke,#E8C9AE)}',
    '[data-theme="dark"] .skn-note-confirm{color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] .skn-note-status{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] .skn-about{color:var(--d-fg-2,#9BAAA3)}',
    '[data-theme="dark"] .skn-about select{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,rgba(255,255,255,.12));color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] .skn-btn{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,rgba(255,255,255,.12));color:var(--d-fg-1,#E7EDE9)}',
    '[data-theme="dark"] .skn-btn:hover{background:#24403A;border-color:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .skn-btn:disabled:hover{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,rgba(255,255,255,.12))}',
    '[data-theme="dark"] .skn-btn.is-primary{background:var(--d-teal-stroke,#8FCFC3);border-color:var(--d-teal-stroke,#8FCFC3);color:#0E1917}',
    '[data-theme="dark"] .skn-btn.is-primary:hover{background:#A7DBD0;border-color:#A7DBD0}',
    '[data-theme="dark"] .skn-btn.is-primary:disabled:hover{background:var(--d-teal-stroke,#8FCFC3);border-color:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .skn-btn.is-danger{background:var(--d-terra-stroke,#E8C9AE);border-color:var(--d-terra-stroke,#E8C9AE);color:#241A12}',
    '[data-theme="dark"] .skn-btn.is-danger:hover{background:#F0D8C2;border-color:#F0D8C2}',

    /* ⚠️ THE MOBILE RAIL IS A BOTTOM TOOLBAR, so the launcher has to sit above
       it or it lands on top of Prev/Next. The offset is MEASURED from the rail
       at runtime rather than guessed, because the rail's height depends on its
       own padding and on the reader's font size. */
    '@media (max-width:768px){#skn-root{right:14px;bottom:calc(var(--skn-rail-h,56px) + 14px)}',
      '#skn-panel{width:calc(100vw - 28px)}}',

    '@media (prefers-reduced-motion:reduce){#skn-open{transition:none}}'
  ].join('');

  function injectCss() {
    if (doc.getElementById('skn-css')) return;
    var s = doc.createElement('style');
    s.id = 'skn-css';
    s.textContent = CSS;
    doc.head.appendChild(s);
  }

  /* ── the furniture ─────────────────────────────────────────────────────── */

  var NOTE_ICON = '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><polyline points="14 4 14 10 20 10"/>';

  var root = null;
  var rows = [];
  var editors = [];
  var statusText = '';

  function el(tag, attrs, html) {
    var n = doc.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    injectCss();
    root = el('div', { id: 'skn-root' });
    root.innerHTML =
      '<div id="skn-panel" role="dialog" aria-modal="false" aria-labelledby="skn-title" hidden>' +
        '<div id="skn-head">' +
          '<h2 id="skn-title">Your notes' +
            '<span class="skn-sub">Private to you. Only you can see them.</span>' +
          '</h2>' +
          '<button type="button" class="skn-btn" data-skn="close">Close</button>' +
        '</div>' +
        '<p id="skn-status" role="status" aria-live="polite"></p>' +
        '<div id="skn-body"></div>' +
        '<div id="skn-foot">' +
          '<button type="button" class="skn-btn is-primary" data-skn="add">Add a note</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" id="skn-open" aria-expanded="false" aria-controls="skn-panel">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + NOTE_ICON + '</svg>' +
        '<span>Notes</span>' +
        '<span id="skn-count" hidden>0</span>' +
      '</button>';
    doc.body.appendChild(root);

    root.querySelector('[data-skn="close"]').addEventListener('click', function () { open(false); });
    root.querySelector('[data-skn="add"]').addEventListener('click', addDraft);
    root.querySelector('#skn-open').addEventListener('click', function () {
      open(root.querySelector('#skn-panel').hasAttribute('hidden'));
    });

    /* Escape closes the panel — but note-editor.js calls stopPropagation when
       it cancels one of its own confirmations, so the first Escape backs out of
       "Delete this note permanently?" and only the second closes the panel.
       That ordering is the whole reason the editor binds to its own root. */
    wireDocument();
    measureRail();
  }

  // Document-level listeners are registered ONCE, not per build(): teardown()
  // on sign-out nulls `root` but cannot unregister a closure it never kept, so
  // a second build() after signing back in used to stack a second pair, and
  // Escape pressed while signed out threw on the null root.
  var documentWired = false;
  function wireDocument() {
    if (documentWired) return;
    documentWired = true;
    doc.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !root) return;
      if (!root.querySelector('#skn-panel').hasAttribute('hidden')) open(false);
    });
    global.addEventListener('resize', measureRail, { passive: true });
  }

  /* Measured, not assumed. On a wide viewport the rail is a left column and
     contributes nothing; below 768px it is a full-width bottom toolbar and the
     launcher has to clear it. */
  function measureRail() {
    var rail = doc.querySelector('.nav-rail');
    if (!rail || !root) return;
    var docked = global.innerWidth <= 768;
    root.style.setProperty('--skn-rail-h', docked ? rail.offsetHeight + 'px' : '0px');
  }

  function setStatus(text) {
    statusText = text || '';
    var s = root && root.querySelector('#skn-status');
    if (s) s.textContent = statusText;
  }

  function open(yes) {
    var panel = root.querySelector('#skn-panel');
    var btn = root.querySelector('#skn-open');
    if (yes) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', yes ? 'true' : 'false');
    if (yes) {
      setStatus('');
      var first = panel.querySelector('.skn-btn, textarea');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    } else {
      btn.focus({ preventScroll: true });
    }
  }

  function setCount(n) {
    var c = root && root.querySelector('#skn-count');
    if (!c) return;
    c.textContent = String(n);
    if (n > 0) c.removeAttribute('hidden'); else c.setAttribute('hidden', '');
  }

  /* ── the anchor picker ─────────────────────────────────────────────────── */

  function aboutHTML(selected) {
    var opts = ['<option value="">The ' + (KIND === 'plan' ? 'plan' : 'primer') + ' as a whole</option>'];
    rail().forEach(function (a) {
      var sel = String(selected) === a.id ? ' selected' : '';
      opts.push('<option value="' + esc(a.id) + '"' + sel + '>' + esc(a.label || a.id) + '</option>');
    });
    return '<div class="skn-about"><label>About<select data-skn-about>' + opts.join('') + '</select></label></div>';
  }

  function readAbout(scope) {
    var sel = scope.querySelector('[data-skn-about]');
    return sel ? (sel.value || null) : null;
  }

  function whereChip(anchor) {
    if (anchor == null || anchor === '') {
      return '<span class="skn-where is-whole">The ' + (KIND === 'plan' ? 'plan' : 'primer') + '</span>';
    }
    rail();
    var label = LABEL[anchor];
    // ⚠️ AN ANCHOR CAN OUTLIVE THE SECTION IT NAMES. A plan that is re-edited
    // may drop a section, leaving notes pointing at an id the rail no longer
    // has. The note is still the reader's and must still be readable, so it
    // renders the raw id rather than disappearing.
    return '<span class="skn-where">' + esc(label || anchor) + '</span>';
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  function clearEditors() {
    editors.forEach(function (e) { if (e && e.destroy) e.destroy(); });
    editors = [];
  }

  function render() {
    var body = root.querySelector('#skn-body');
    if (!body) return;
    clearEditors();
    body.innerHTML = '';
    setCount(rows.length);

    if (!rows.length) {
      body.appendChild(el('p', { class: 'skn-empty' },
        'No notes on this ' + (KIND === 'plan' ? 'plan' : 'primer') + ' yet. ' +
        'Write one wherever you are — you can say which section it is about, or leave it about the whole thing.'));
      setStatus(statusText);
      return;
    }

    sortNotes(rows).forEach(function (row) {
      var item = el('div', { class: 'skn-item' }, whereChip(row.anchor));
      body.appendChild(item);
      mountEditorFor(row, item);
    });
    setStatus(statusText);
  }

  function mountEditorFor(row, item) {
    var E = global.AmplifiedNoteEditor;
    if (!E) return;
    var ed = E.create({
      mount: item,
      prefix: 'skn',
      btnClass: 'skn-btn',
      body: row.body || '',
      label: 'Your note',
      // ⚠️ NO PER-NOTE CLOSE HERE. The panel's own Close is the only one that
      // means anything in a list — a Close on each note was three buttons doing
      // what the header button already did.
      closable: false,
      // The panel has one `role="status"` region already; a second per note
      // would give a list of ten notes ten live regions.
      inlineStatus: false,
      onStatus: setStatus,
      extraEditHTML: aboutHTML(row.anchor),
      readExtra: readAbout,
      // Changing only the section, with the text untouched, is still a change
      // worth saving — without this the Save button would stay disabled.
      extraChanged: function (scope) {
        var next = readAbout(scope);
        return (next || null) !== (row.anchor || null);
      },
      onSave: function (bodyText, anchor) { return updateNote(row.id, bodyText, anchor); },
      onDelete: function () { return deleteNote(row.id); },
      onSaved: function (bodyText, anchor) {
        var moved = (anchor || null) !== (row.anchor || null);
        row.body = bodyText;
        row.anchor = anchor || null;
        // Only repaint when the note has to MOVE. A repaint destroys every
        // editor in the list, including any other one mid-edit.
        if (moved) { setStatus('Note saved, and moved to ' + plainWhere(row.anchor) + '.'); render(); }
      },
      onDeleted: function () {
        rows = rows.filter(function (r) { return r.id !== row.id; });
        render();
      },
      onClose: function () { open(false); }
    });
    editors.push(ed);
  }

  function plainWhere(anchor) {
    if (!anchor) return 'the ' + (KIND === 'plan' ? 'plan' : 'primer') + ' as a whole';
    rail();
    return LABEL[anchor] || anchor;
  }

  /* A draft is a note that does not exist yet. It is deliberately NOT a row
     with an empty body — `notes_body_length` requires at least one character,
     so an empty row could not be stored, and a row holding nothing is not a
     note anyway. */
  function addDraft() {
    var E = global.AmplifiedNoteEditor;
    var body = root.querySelector('#skn-body');
    if (!E || !body) return;

    var here = currentAnchor();
    var item = el('div', { class: 'skn-item' }, whereChip(here));
    if (rows.length) body.insertBefore(item, body.firstChild);
    else { body.innerHTML = ''; body.appendChild(item); }

    var draft = E.create({
      mount: item,
      prefix: 'skn',
      btnClass: 'skn-btn',
      body: '',
      label: 'New note',
      deletable: false,
      // Backing out of a DRAFT does mean something — it discards a note that
      // was never saved — so the button stays. "Cancel", not "Close": it
      // cancels the new note rather than closing the panel, which is what the
      // same button does on /news/.
      closeLabel: 'Cancel',
      inlineStatus: false,
      onStatus: setStatus,
      // Starts pointing at wherever the reader is, which is the whole design:
      // the note is written where the thought happened and says what it is
      // about only if that is useful.
      extraEditHTML: aboutHTML(here),
      readExtra: readAbout,
      onSave: function (bodyText, anchor) {
        return insertNote(bodyText, anchor).then(function (created) {
          if (created) rows.push(created);
        });
      },
      onSaved: function () { setStatus('Note saved.'); render(); },
      onClose: function () {
        draft.destroy();
        if (item.parentNode) item.parentNode.removeChild(item);
        if (!rows.length) render();
      }
    });
    editors.push(draft);
    draft.focus();
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */

  /* ⚠️ POLL FOR `AmplifiedAuth`; DO NOT READ IT ONCE AND GIVE UP. nav.js appends
     the auth stack with `async = false`, which preserves execution order but
     does NOT delay DOMContentLoaded — so auth.js can land after this file has
     run. Reading the global once would leave the panel permanently absent for
     SIGNED-IN READERS ONLY, which is the entire audience for it and the one
     least likely to report it. progress.js, learning.js and news-actions.js all
     poll for exactly this reason and all say so. */
  var POLL_MS = 60;
  var POLL_LIMIT_MS = 6000;

  function whenAuthReady(fn) {
    // ⚠️ Match 'out' EXPLICITLY. nav.js publishes 'unknown' as-is, and a
    // `!== 'in'` test would treat it as a guest. For a genuine guest nav.js
    // never loads the auth stack at all, so this also avoids six seconds of
    // pointless polling on every guest page view.
    if (doc.documentElement.getAttribute('data-session') === 'out') return;
    var waited = 0;
    (function poll() {
      if (auth()) { fn(auth()); return; }
      waited += POLL_MS;
      if (waited > POLL_LIMIT_MS) return;
      global.setTimeout(poll, POLL_MS);
    })();
  }

  function teardown() {
    clearEditors();
    rows = [];
    statusText = '';
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
  }

  function paint() {
    loadNotes().then(function (data) {
      if (data == null) return;
      rows = data;
      if (!root) build();
      render();
    }).catch(function (err) {
      // ⚠️ A FAILED READ MUST NOT LOOK LIKE "NO NOTES". If the panel is already
      // up, say so; if it is not, leave the page exactly as a guest sees it
      // rather than offering an empty list that quietly claims the reader has
      // written nothing.
      if (!root) return;
      rows = [];
      render();
      setStatus('Could not load your notes. ' + (err && err.message ? err.message : ''));
    });
  }

  function start() {
    whenAuthReady(function (a) {
      a.onAuthChange(function (session) {
        /* ⚠️ SIGNING OUT MUST REMOVE THE PANEL, NOT JUST STOP UPDATING IT. The
           page is not reloaded, so one reader's private notes would otherwise
           stay on screen in front of whoever is at that browser next. That
           exact defect shipped once on the Future Skills page and is worth not
           repeating. */
        if (session) paint(); else teardown();
      });
      // No trailing paint(): onAuthChange() calls back at once when the answer
      // is already known, so that was a second identical load every time.
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
