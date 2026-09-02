// Every note you have written, in one place, on /account/#notes.
//
// ⚠️ /account/ ONLY, the same scoping rule pwned.js, auth-pages.css,
// skill-notes.js, learning.js and news-app.css all follow.
//
// ⚠️ IT DOES NOT OWN WHAT A NOTE IS. note-editor.js owns the two modes, the
// counter, the disabled-Save rule and the confirmations; this file owns the
// LIST — which rows exist, what each one is attached to, and what a name for
// that thing is. Third surface, one editor. The whole point of lifting the
// editor out of news-actions.js was that this file would otherwise be the place
// a second definition of "a note" appeared.
//
// ⚠️ THIS IS THE THIRD RENDER PATH FOR USER-AUTHORED TEXT, and it is still a
// SAME-USER path: `notes_own` scopes every row to `auth.uid()`, so what renders
// here is only ever what the reader typed themselves. That is what keeps a
// stored payload self-XSS rather than stored XSS, and it stops being true the
// moment anything renders notes ACROSS users — Phase 7's admin UI is exactly
// that. Escaping here is note-editor.js's `esc()` into a text node, on purpose
// rather than by luck.
//
// ⚠️ WHY THIS IS NOT ON /learning/. That page answers "how far through am I",
// which is progress. A note is not progress — it is the one thing an account
// holds that the READER made rather than the site. Putting it there would have
// made the dashboard a junk drawer and buried the notes under charts.

(function (global) {
  'use strict';

  var doc = global.document;

  // /account/ and /account/index.html, and nothing else.
  if (!/\/account(\/|\/index\.html)?$/.test(global.location.pathname)) return;

  function auth() { return global.AmplifiedAuth || null; }
  function client() { var a = auth(); return a ? a.client() : null; }
  function userId() { var a = auth(); var u = a && a.user(); return u ? u.id : null; }
  function editorLib() { return global.AmplifiedNoteEditor || null; }
  // nav.js owns the one escaper — see AmplifiedNav.escapeHtml.
  function esc(s) { return global.AmplifiedNav.escapeHtml(s); }

  var state = { notes: [], stories: {}, catalogue: null, editors: [], picked: {}, status: '', filter: 'all' };

  var FILTERS = [
    { key: 'all',    label: 'All' },
    { key: 'plan',   label: 'Plans' },
    { key: 'primer', label: 'Primers' },
    { key: 'news',   label: 'News' }
  ];

  // What the table is currently showing. Everything that acts on "the notes" —
  // select-all, the counts, the empty state — goes through this rather than
  // state.notes, or it would act on rows nobody can see.
  function visibleNotes() {
    if (state.filter === 'all') return state.notes.slice();
    return state.notes.filter(function (n) { return kindOf(n) === state.filter; });
  }

  function countFor(key) {
    if (key === 'all') return state.notes.length;
    return state.notes.filter(function (n) { return kindOf(n) === key; }).length;
  }

  /* ⚠️ CHANGING THE FILTER CLEARS THE SELECTION, DELIBERATELY. Without that, a
     note could be ticked, filtered out of view, and then deleted by a bulk
     action whose confirmation counted it — the reader would be told "3 notes"
     while looking at two. Deleting something invisible is the one outcome this
     table must not produce, and clearing is the cheapest way to guarantee it. */
  function setFilter(key) {
    if (state.filter === key) return;
    state.filter = key;
    state.picked = {};
    cancelRowDelete();
    cancelBulk();
    closeEditor();
    render();
  }

  /* ── loading ───────────────────────────────────────────────────────────────
     Two reads, because a note's target is polymorphic and only one kind of
     target has a row to join to. `target_id` is a story uuid for 'news' and a
     `<slug>:<kind>` string for 'skill'; skills are hand-authored HTML and have
     no database row at all, which is why `target_id` is text in the first place.

     ⚠️ RLS IS THE ONLY THING SCOPING THE FIRST READ, and this file cannot
     detect a broken policy any more than the others can — it filters by
     `user_id` like every other caller, so a policy of `using (true)` would look
     identical. It is proved from outside, by
     scripts/dev/two-account-notes-probe.js, from a second account. */
  function loadNotes() {
    var sb = client(), uid = userId();
    if (!sb || !uid) return Promise.resolve(null);
    return sb.from('notes')
      .select('id,target_type,target_id,anchor,body,created_at,updated_at')
      .eq('user_id', uid)
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }

  /* Titles and slugs for the news notes. `news_stories` is publicly readable,
     so this needs no special privilege — and it is a separate request rather
     than a PostgREST embed because `notes.target_id` is text with no foreign
     key to join on. */
  function loadStories(ids) {
    var sb = client();
    if (!sb || !ids.length) return Promise.resolve({});
    return sb.from('news_stories')
      .select('id,slug,title,status')
      .in('id', ids)
      .then(function (r) {
        if (r.error) throw r.error;
        var out = {};
        (r.data || []).forEach(function (s) { out[s.id] = s; });
        return out;
      });
  }

  /* ── naming what a note is attached to ─────────────────────────────────────
     A slug is words joined by hyphens, and this page shows them in TITLE CASE:
     it is a table of LINKS to named artefacts, and the site titles those
     "Analytical Thinking" — the plan page's own <title> does. /learning/ shows
     the same slugs in sentence case for its prose headings, and that is a
     deliberate divergence rather than drift.

     Until 2026-09-02 this said the derivation came from skills-progress.js.
     It never did: /account/ does not load that module, so the "fallback" was
     the only path that ever ran, and the two agreed by coincidence. One honest
     function beats a dependency the page does not have. */
  function skillName(slug) {
    return String(slug).split('-').map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(' ');
  }

  /* The catalogue names every plan section and every primer slide. It is a
     static file the site already serves, generated from the pages' own nav rails
     by scripts/build-skills-catalogue.mjs \u2014 precisely so a surface that is not
     one of those pages can still say what a note is about.

     \u26a0\ufe0f AN EARLIER VERSION OF THIS FILE ASSERTED THE OPPOSITE and rendered raw
     anchors, so a note read "6" or "habits" rather than "Model: MECE" or
     "5-Day Habit Builder". The claim that the name lived only in the nav rail
     was written without opening the catalogue. "Not available here" is a
     checkable statement, not an assumption. */
  function loadCatalogue() {
    return fetch('../skills-catalogue.json', { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });   // names degrade to ids; nothing breaks
  }

  /* What the note is about WITHIN the plan or primer:
     - the named section or slide, resolved through the catalogue
     - "General" when there is no anchor, because a note about the whole thing is
       a real answer and an empty cell reads as missing data
     - the raw anchor if the catalogue cannot be read, or if the section has
       since been removed, which keeps a stale note readable rather than blank */
  function anchorLabel(note) {
    if (note.target_type !== 'skill') return '';
    if (note.anchor == null || note.anchor === '') return 'General';

    var parts = String(note.target_id).split(':');
    var entry = state.catalogue && state.catalogue.skills && state.catalogue.skills[parts[0]];
    if (entry) {
      if (parts[1] === 'primer' && entry.primer && entry.primer.slides) {
        var slide = entry.primer.slides.filter(function (s) {
          return String(s.index) === String(note.anchor);
        })[0];
        if (slide && slide.name) return slide.name;
      } else if (entry.plan && entry.plan.sections) {
        var sec = entry.plan.sections.filter(function (s) {
          return String(s.id) === String(note.anchor);
        })[0];
        if (sec && sec.name) return sec.name;
      }
    }
    return note.anchor;
  }

  function targetLabel(note) {
    if (note.target_type === 'skill') {
      var parts = String(note.target_id).split(':');
      var kind = parts[1] === 'primer' ? 'Primer' : 'Plan';
      return skillName(parts[0]) + ' \u00b7 ' + kind;
    }
    var story = state.stories[note.target_id];
    // ⚠️ A NOTE CAN OUTLIVE WHAT IT IS ABOUT. A story may be archived, or the
    // read may have failed. The note is still the reader's and must still be
    // readable and deletable, so it renders under an honest placeholder rather
    // than disappearing from a list that claims to hold everything.
    return story ? story.title : 'A news story';
  }

  function targetHref(note) {
    if (note.target_type === 'skill') {
      var parts = String(note.target_id).split(':');
      var kind = parts[1] === 'primer' ? 'primer' : 'plan';
      var url = '../skills/' + parts[0] + '/' + kind + '.html';
      return note.anchor ? url + '#' + note.anchor : url;
    }
    var story = state.stories[note.target_id];
    return story && story.slug ? '../news/' + story.slug : null;
  }

  function recency(n) { return n.updated_at || n.created_at || ''; }

  /* ── writes ────────────────────────────────────────────────────────────── */

  function updateNote(id, body) {
    var sb = client(), uid = userId();
    return sb.from('notes').update({ body: body }).eq('id', id).eq('user_id', uid)
      .then(function (r) { if (r.error) throw r.error; });
  }

  function deleteNotes(ids) {
    var sb = client(), uid = userId();
    return sb.from('notes').delete().in('id', ids).eq('user_id', uid).select('id')
      .then(function (r) {
        if (r.error) throw r.error;
        return (r.data || []).length;
      });
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  function el(id) { return doc.getElementById(id); }

  function setStatus(text) {
    state.status = text || '';
    var s = el('acct-notes-status');
    if (s) s.textContent = state.status;
  }

  function setCount(n) {
    var c = el('acct-tab-notes-count');
    if (!c) return;
    c.textContent = String(n);
    if (n > 0) c.removeAttribute('hidden'); else c.setAttribute('hidden', '');
  }

  function pickedIds() {
    return Object.keys(state.picked).filter(function (k) { return state.picked[k]; });
  }

  function refreshBulk() {
    var bar = el('acct-notes-bulk');
    var n = pickedIds().length;
    if (!bar) return;
    if (n) bar.removeAttribute('hidden'); else bar.setAttribute('hidden', '');
    var label = el('acct-notes-bulk-count');
    if (label) label.textContent = n === 1 ? '1 note selected' : n + ' notes selected';
  }

  function clearEditors() {
    state.editors.forEach(function (e) { if (e && e.destroy) e.destroy(); });
    state.editors = [];
  }

  /* ⚠️ A REAL <table>, NOT A GRID OF DIVS. These are records with the same
     fields in every row, which is what a table is for — and it is the only
     option that gives a screen reader the column a cell belongs to without
     hand-written ARIA. The layout could be done with CSS grid; the SEMANTICS
     could not.

     ⚠️ THE ROW IS A SUMMARY AND THE EDITOR IS NOT IN IT. A reader can have
     dozens of notes, so every row carrying a full editor would be both enormous
     and pointless. The row shows the note; pressing Edit expands one editing row
     beneath it, full width, and that is the only place note-editor.js is
     mounted here. `deletable:false` and `closable:false` because deletion and
     dismissal belong to the table, which owns the selection and the bulk
     action too — so there is exactly one delete-confirmation implementation on
     this surface rather than the table's and the editor's side by side. */
  var ICON_EDIT = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
  var ICON_DELETE = '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';

  function icon(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + paths + '</svg>';
  }

  // news | primer | plan — three kinds, three chips.
  function kindOf(note) {
    if (note.target_type !== 'skill') return 'news';
    return String(note.target_id).split(':')[1] === 'primer' ? 'primer' : 'plan';
  }

  function render() {
    var root = el('acct-notes-root');
    if (!root) return;
    clearEditors();
    setCount(state.notes.length);

    if (!state.notes.length) {
      root.innerHTML =
        '<p class="auth-muted">You have not written any notes yet. ' +
        'You can write one on any <a href="../future-skills.html">plan or primer</a>, ' +
        'or on a <a href="../news/">news story</a>.</p>' +
        '<p class="auth-status" id="acct-notes-status" role="status" aria-live="polite"></p>';
      setStatus(state.status);
      return;
    }

    /* ⚠️ THE FILTER ROW IS RENDERED EVEN WHEN A KIND IS EMPTY, with the chip
       disabled rather than removed. Chips appearing and vanishing as notes are
       deleted moves everything else on the row underneath the pointer, and a
       reader cannot tell "I have no primer notes" from "primers are not a thing
       here" when the chip is simply absent. */
    var html = '<div class="acct-filter" role="group" aria-label="Filter notes by where they were written">' +
      FILTERS.map(function (f) {
        var n = countFor(f.key);
        var on = state.filter === f.key;
        // ⚠️ The kind class carries the SAME colour the Where column uses for
        // that kind. A filter and the chips it filters to must be the same
        // colour or the pairing has to be learned rather than seen.
        return '<button type="button" class="acct-filter-chip is-' + f.key +
          (on ? ' is-active' : '') + '"' +
          ' data-filter="' + f.key + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
          (n === 0 && f.key !== 'all' ? ' disabled' : '') + '>' +
          esc(f.label) + '<span class="acct-filter-count">' + n + '</span></button>';
      }).join('') +
    '</div>';

    html +=
      '<div class="acct-notes-bulk" id="acct-notes-bulk" hidden>' +
        '<span class="acct-notes-bulk-count" id="acct-notes-bulk-count"></span>' +
        '<button type="button" class="auth-btn auth-btn-danger-quiet" data-acct="bulk-delete">Delete selected</button>' +
        '<button type="button" class="auth-btn auth-btn-quiet" data-acct="bulk-clear">Clear selection</button>' +
      '</div>' +
      '<p class="auth-status" id="acct-notes-status" role="status" aria-live="polite"></p>' +
      /* Scrolls inside its own container rather than widening the page — the
         same wrapper why-sign-up.html's comparison table uses. */
      '<div class="acct-notes-wrap">' +
      '<table class="acct-notes-table">' +
        '<thead><tr>' +
          '<th scope="col" class="acct-col-pick">' +
            '<input type="checkbox" class="acct-note-pick" data-pick-all aria-label="Select all notes">' +
          '</th>' +
          '<th scope="col" class="acct-col-kind">Where</th>' +
          '<th scope="col" class="acct-col-topic">Topic</th>' +
          '<th scope="col" class="acct-col-note">Note</th>' +
          '<th scope="col" class="acct-col-act"><span class="acct-sr">Actions</span></th>' +
        '</tr></thead><tbody>';

    // Newest first: the account page is a place to find a note, and the one you
    // wrote last is the one you are most likely looking for. (Per-plan order is
    // the PLAN's own sequence, which is a different question asked in a
    // different place — see skill-notes.js.)
    visibleNotes().sort(function (a, b) {
      return String(recency(b)).localeCompare(String(recency(a)));
    }).forEach(function (n) {
      var kind = kindOf(n);
      var href = targetHref(n);
      var topic = esc(targetLabel(n));
      html +=
        '<tr class="acct-note-row" data-note="' + esc(n.id) + '">' +
          '<td class="acct-col-pick">' +
            '<input type="checkbox" class="acct-note-pick" data-pick="' + esc(n.id) + '"' +
            ' aria-label="Select this note">' +
          '</td>' +
          '<td class="acct-col-kind"><span class="acct-chip is-' + kind + '">' + kind + '</span></td>' +
          '<td class="acct-col-topic">' +
            (href ? '<a href="' + esc(href) + '">' + topic + '</a>' : topic) +
            (anchorLabel(n) ? '<span class="acct-topic-sub">' + esc(anchorLabel(n)) + '</span>' : '') +
          '</td>' +
          // ⚠️ esc() into a text position. This is a render path for
          // user-authored text and it escapes on purpose, not by luck.
          '<td class="acct-col-note">' + esc(n.body) + '</td>' +
          /* ⚠️ BOTH `title` AND `aria-label`, and they are not redundant.
             `title` is the tooltip a mouse user gets and is ignored or read
             inconsistently by screen readers; `aria-label` is the accessible
             name and is never shown. An icon button needs both, and they should
             say the same thing — which is why they are written together here
             rather than one being added later. */
          '<td class="acct-col-act">' +
            '<button type="button" class="acct-icon-btn" data-row="edit"' +
              ' title="Edit this note" aria-label="Edit this note">' +
              icon(ICON_EDIT) + '</button>' +
            '<button type="button" class="acct-icon-btn is-danger" data-row="delete"' +
              ' title="Delete this note" aria-label="Delete this note">' +
              icon(ICON_DELETE) + '</button>' +
          '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';

    /* A filter that matches nothing says so, rather than showing an empty
       table with headings over it. Only reachable if a note is deleted down to
       zero while its filter is active — the chips are disabled at zero — so it
       is a small case, and an unexplained empty grid is a bad way to meet it. */
    if (!visibleNotes().length) {
      html = html.replace('<div class="acct-notes-wrap">',
        '<p class="auth-muted">No notes on a ' +
        (state.filter === 'news' ? 'news story' : state.filter) +
        ' yet. <button type="button" class="auth-link" data-filter="all">Show all notes</button></p>' +
        '<div class="acct-notes-wrap" hidden>');
    }

    root.innerHTML = html;
    setStatus(state.status);
    refreshBulk();
    syncPicks();
  }

  // Restores checkbox state after a repaint, so a selection survives one note
  // being edited or deleted.
  function syncPicks() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-pick]'), function (box) {
      var on = Boolean(state.picked[box.getAttribute('data-pick')]);
      box.checked = on;
      var row = box.closest ? box.closest('.acct-note-row') : null;
      if (row) row.classList.toggle('is-selected', on);
    });
  }

  function rowFor(id) { return doc.querySelector('.acct-note-row[data-note="' + cssEscape(id) + '"]'); }
  function noteFor(id) {
    return state.notes.filter(function (n) { return n.id === id; })[0] || null;
  }

  /* ── editing one row ─────────────────────────────────────────────────────── */

  function closeEditor() {
    clearEditors();
    var open = doc.querySelector('.acct-note-editing');
    if (open) open.parentNode.removeChild(open);
    Array.prototype.forEach.call(doc.querySelectorAll('.acct-note-row[hidden]'), function (r) {
      r.removeAttribute('hidden');
    });
  }

  /* ⚠️ OPENS IN EDIT, NOT VIEW, AND THAT IS THE WHOLE REASON THERE IS NO READ
     CONTROL ON A ROW. The Note column already shows the note in full, so a
     reading mode here would reveal something the reader is looking at. The only
     thing the pencil adds is the ability to change it. */
  function openEditor(id) {
    var E = editorLib();
    var row = rowFor(id);
    var n = noteFor(id);
    if (!E || !row || !n) return;

    // One at a time. Two open editors in a table is two textareas competing for
    // the same column width, and a save in one repainting the other.
    closeEditor();

    var tr = doc.createElement('tr');
    tr.className = 'acct-note-editing';
    tr.innerHTML = '<td colspan="5"><div class="acct-note-editing-inner"></div></td>';
    row.setAttribute('hidden', '');
    row.parentNode.insertBefore(tr, row.nextSibling);

    var ed = E.create({
      mount: tr.querySelector('.acct-note-editing-inner'),
      prefix: 'acct',
      btnClass: 'auth-btn auth-btn-quiet',
      body: n.body || '',
      label: 'Your note',
      // The panel carries one live region; a table of notes must not carry one
      // per row.
      inlineStatus: false,
      onStatus: setStatus,
      deletable: false,
      closable: true,
      closeLabel: 'Cancel',
      onSave: function (body) { return updateNote(n.id, body); },
      onSaved: function (body) {
        n.body = body;
        state.status = 'Note saved.';
        render();
      },
      onClose: function () { closeEditor(); }
    });
    /* ⚠️ REQUIRED. note-editor.js opens in VIEW whenever it is given a body,
       which is right where it was written — a note beside a story you are
       reading — and wrong here, where the row is opened by a pencil. Without
       this the reader presses Edit and gets the note they can already see. */
    ed.setMode('edit');
    state.editors.push(ed);
  }

  function cssEscape(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ── bulk delete ───────────────────────────────────────────────────────────
     ⚠️ CONFIRMED INLINE AND BY COUNT, never by a bare "are you sure". Deleting
     several things at once is the one action where the reader most needs to be
     told HOW MANY, because the selection is the part they might have got wrong.
     Cancel is the primary button and the destructive one is quiet — the same
     inversion account.astro already uses for "Start over?" and for deletion. */
  function askBulkDelete() {
    var bar = el('acct-notes-bulk');
    if (!bar || bar.hasAttribute('data-restore')) return;
    var n = pickedIds().length;
    bar.setAttribute('data-restore', bar.innerHTML);
    bar.innerHTML =
      '<span class="acct-note-confirm">Delete ' +
        (n === 1 ? 'this note' : 'these ' + n + ' notes') +
        ' permanently? This cannot be undone.</span>' +
      '<button type="button" class="auth-btn" data-acct="bulk-no">Cancel</button>' +
      '<button type="button" class="auth-btn auth-btn-danger-quiet" data-acct="bulk-yes">' +
        'Yes, delete' + (n === 1 ? '' : ' ' + n) + '</button>';
    var no = bar.querySelector('[data-acct="bulk-no"]');
    if (no) { try { no.focus({ preventScroll: true }); } catch (e) { no.focus(); } }
  }

  /* ⚠️ ONE NOTE'S DELETE ASKS TOO, and it asks IN THE ROW rather than in a
     dialog. The row is where the reader is looking and it is the only place that
     can show WHICH note is about to go — a confirmation floating elsewhere on a
     table of thirty rows is asking about something the reader has to take on
     trust. Cancel is the primary and the destructive one is quiet, matching the
     bulk prompt below and account.astro's own deletion panel. */
  function askRowDelete(id) {
    closeEditor();
    cancelRowDelete();
    var row = rowFor(id);
    if (!row) return;
    var tr = doc.createElement('tr');
    tr.className = 'acct-note-confirming';
    tr.innerHTML = '<td colspan="5">' +
      '<span class="acct-note-confirm">Delete this note permanently? It cannot be restored.</span>' +
      '<span class="acct-note-confirm-actions">' +
        '<button type="button" class="auth-btn" data-acct="row-no">Cancel</button>' +
        '<button type="button" class="auth-btn auth-btn-danger-quiet" data-acct="row-yes" data-id="' +
          esc(id) + '">Yes, delete</button>' +
      '</span></td>';
    row.parentNode.insertBefore(tr, row.nextSibling);
    row.classList.add('is-confirming');
    var no = tr.querySelector('[data-acct="row-no"]');
    if (no) { try { no.focus({ preventScroll: true }); } catch (e) { no.focus(); } }
  }

  function cancelRowDelete() {
    var open = doc.querySelector('.acct-note-confirming');
    if (!open) return false;
    open.parentNode.removeChild(open);
    Array.prototype.forEach.call(doc.querySelectorAll('.acct-note-row.is-confirming'), function (r) {
      r.classList.remove('is-confirming');
    });
    return true;
  }

  function doRowDelete(id) {
    setStatus('Deleting…');
    deleteNotes([id]).then(function () {
      state.notes = state.notes.filter(function (n) { return n.id !== id; });
      delete state.picked[id];
      state.status = 'Note deleted.';
      render();
    }).catch(function (err) {
      setStatus('Could not delete. ' + (err && err.message ? err.message : ''));
    });
  }

  function cancelBulk() {
    var bar = el('acct-notes-bulk');
    if (!bar || !bar.hasAttribute('data-restore')) return false;
    bar.innerHTML = bar.getAttribute('data-restore');
    bar.removeAttribute('data-restore');
    refreshBulk();
    return true;
  }

  function doBulkDelete() {
    var ids = pickedIds();
    if (!ids.length) return;
    setStatus('Deleting\u2026');
    deleteNotes(ids).then(function (removed) {
      state.notes = state.notes.filter(function (n) { return ids.indexOf(n.id) < 0; });
      state.picked = {};
      render();
      setStatus(removed === 1 ? 'Note deleted.' : removed + ' notes deleted.');
    }).catch(function (err) {
      cancelBulk();
      setStatus('Could not delete. ' + (err && err.message ? err.message : ''));
    });
  }

  /* ── events ────────────────────────────────────────────────────────────── */

  doc.addEventListener('change', function (e) {
    var box = e.target;
    if (!box || !box.getAttribute) return;

    if (box.hasAttribute('data-pick-all')) {
      // ⚠️ VISIBLE notes, not all notes. Under a filter, "select all" means what
      // is on screen — ticking hidden rows would arm a bulk delete for notes the
      // reader never saw.
      var on = box.checked;
      visibleNotes().forEach(function (n) { state.picked[n.id] = on; });
      syncPicks();
      cancelBulk();
      refreshBulk();
      return;
    }

    if (!box.getAttribute('data-pick')) return;
    state.picked[box.getAttribute('data-pick')] = box.checked;
    var row = box.closest ? box.closest('.acct-note-row') : null;
    if (row) row.classList.toggle('is-selected', box.checked);
    // The header box reflects the rows rather than driving them once a single
    // row has been touched — a "select all" that stays ticked while rows are
    // unticked is claiming something untrue.
    var all = doc.querySelector('[data-pick-all]');
    var shown = visibleNotes().length;
    if (all) all.checked = shown > 0 && pickedIds().length === shown;
    cancelBulk();
    refreshBulk();
  });

  doc.addEventListener('click', function (e) {
    var chip = e.target.closest ? e.target.closest('[data-filter]') : null;
    if (chip && !chip.disabled) return setFilter(chip.getAttribute('data-filter'));

    // Row actions next — an icon button inside a row, not a panel control.
    var rowBtn = e.target.closest ? e.target.closest('[data-row]') : null;
    if (rowBtn) {
      var tr = rowBtn.closest('.acct-note-row');
      if (!tr) return;
      var id = tr.getAttribute('data-note');
      var act = rowBtn.getAttribute('data-row');
      if (act === 'edit') return openEditor(id);
      if (act === 'delete') return askRowDelete(id);
      return;
    }

    var b = e.target.closest ? e.target.closest('[data-acct]') : null;
    if (!b) return;
    var what = b.getAttribute('data-acct');
    if (what === 'row-no') return void cancelRowDelete();
    if (what === 'row-yes') {
      var target = b.getAttribute('data-id');
      cancelRowDelete();
      return doRowDelete(target);
    }
    if (what === 'bulk-delete') return askBulkDelete();
    if (what === 'bulk-no') return void cancelBulk();
    if (what === 'bulk-yes') { cancelBulk(); return doBulkDelete(); }
    if (what === 'bulk-clear') {
      state.picked = {};
      // syncPicks() unticks the boxes AND clears .is-selected on the rows. A
      // hand-rolled version here once targeted `.acct-note-item`, a class
      // nothing renders, so every row stayed highlighted after "Clear".
      syncPicks();
      cancelBulk();
      refreshBulk();
    }
  });

  // Escape backs out of whichever thing is open, innermost first: a delete
  // prompt, then a bulk prompt, then an open editor.
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (cancelRowDelete() || cancelBulk()) { e.stopPropagation(); return; }
    if (doc.querySelector('.acct-note-editing')) { closeEditor(); e.stopPropagation(); }
  });

  /* ── lifecycle ─────────────────────────────────────────────────────────── */

  /* ⚠️ POLL FOR AmplifiedAuth. nav.js appends the auth stack with async=false,
     which preserves order but does not delay DOMContentLoaded, so auth.js can
     land after this file has run. progress.js, learning.js, news-actions.js and
     skill-notes.js all poll for the same reason.

     ⚠️ NO `data-session="out"` SHORT-CIRCUIT HERE, unlike skill-notes.js. This
     page IS on nav.js's `pageNeedsAuth()` allowlist — it has something to say to
     a signed-out visitor and renders a signed-out state of its own — so the auth
     stack always arrives and the poll always resolves. */
  function whenAuthReady(fn) {
    // AmplifiedNav.whenAuth calls back from auth.js's own load event, or with
    // null if the stack fails to arrive — in which case /account/ shows its
    // signed-out panel from auth.js's absence, and there is nothing to paint.
    var nav = global.AmplifiedNav;
    if (!nav || typeof nav.whenAuth !== 'function') return;
    nav.whenAuth(function (a) { if (a) fn(a); });
  }

  function paint() {
    loadNotes().then(function (notes) {
      if (notes == null) return;
      state.notes = notes;
      var storyIds = notes
        .filter(function (n) { return n.target_type === 'news'; })
        .map(function (n) { return n.target_id; });
      // Both in flight together: neither answer depends on the other, and the
      // catalogue is a static file that will usually be in cache anyway.
      // ⚠️ The catalogue resolves to null rather than rejecting when it fails,
      // so a missing one costs section NAMES and never the notes themselves.
      return Promise.all([loadStories(storyIds), loadCatalogue()])
        .then(function (both) {
          state.stories = both[0];
          state.catalogue = both[1];
          render();
        });
    }).catch(function (err) {
      /* ⚠️ A FAILED READ MUST NOT RENDER AS "no notes". An empty list and a
         broken database look identical once they reach HTML, and telling
         somebody they have written nothing when the truth is that we could not
         look is the worse of the two. */
      var root = el('acct-notes-root');
      if (root) {
        root.innerHTML = '<p class="auth-status bad">Could not load your notes. ' +
          esc(err && err.message ? err.message : '') + '</p>';
      }
      setCount(0);
    });
  }

  function teardown() {
    clearEditors();
    state.notes = [];
    state.stories = {};
    state.picked = {};
    var root = el('acct-notes-root');
    // Somebody else's private text must not survive a sign-out on a shared
    // machine. The page reveals its signed-out panel separately; this makes sure
    // the notes themselves are gone from the DOM either way.
    if (root) root.innerHTML = '';
    setCount(0);
  }

  function start() {
    whenAuthReady(function (a) {
      // onAuthChange() calls back at once when the answer is already known, so
      // there is no separate "already signed in" load to make — it was a second
      // identical fetch and render on every page open.
      a.onAuthChange(function (session) {
        if (session) paint(); else teardown();
      });
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
