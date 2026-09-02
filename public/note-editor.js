// The note editor, written once and mounted anywhere.
//
// ⚠️ THIS FILE EXISTS SO THERE IS ONE ANSWER TO "WHAT IS A NOTE". Notes on a
// news story and notes on a plan section are the same feature pointed at a
// different thing, and a second implementation is how two surfaces end up
// disagreeing about what Clear means, whether Save closes, or how long a note
// may be. Same argument `news-render.mjs` makes about list markup, and the same
// one `skills-progress.js` makes about what "complete" means — both of which
// were written after a duplicate definition had already contradicted the
// original.
//
// ⚠️ WHAT IS SHARED IS THE EDITOR, NOT THE CONTAINER. A story has at most one
// note; a plan has many. So this file owns a single note's view/edit lifecycle
// and knows nothing about lists, story ids, skill slugs, or where the thing it
// edits is stored. The surface owns all of that and hands in two callbacks.
//
// ⚠️ EVERY QUERY IS SCOPED TO THE INSTANCE'S OWN ROOT, and every listener is
// attached to it rather than to `document`. The news implementation this was
// lifted from used document-level selectors and a single delegated click
// handler, which is correct when exactly one editor can exist and silently
// wrong the moment two can — the second instance would drive the first. Ids are
// generated per instance for the same reason. Nothing in news-app.css or the
// skill styles targets an id, so this costs no CSS.
//
// Loaded by /news/ and by the ten primer and plan pages. It touches no network,
// reads no session and renders nothing on its own.

(function (global) {
  'use strict';

  var doc = global.document;

  // ⚠️ MUST MATCH `notes_body_length` in 20260826120000_notes_body_length.sql.
  // The database is the real limit — signed-in browsers write to PostgREST
  // directly, so this number is the courtesy and not the control. Raising one
  // without the other means a note that types fine and then fails to save.
  //
  // ⚠️ AND IT IS 500 ON BOTH SURFACES DELIBERATELY. Raising it for plans was
  // considered and rejected: a plan does not need a longer note, it needs more
  // of them, and two limits would be two definitions of a note.
  var MAX = 500;
  var WARN_AT = 450;

  var seq = 0;

  // nav.js owns the one escaper — see AmplifiedNav.escapeHtml. Every page
  // this file is mounted on loads nav.js first; the dev specimen inlines it.
  function esc(s) { return global.AmplifiedNav.escapeHtml(s); }

  /* ── the two modes, and why there are two ─────────────────────────────────
     A single always-editing panel has no natural end: saving leaves you in a
     textarea with a Save button, so the only way out is to notice that the
     toolbar button toggles it. Splitting view from edit gives Save somewhere to
     LAND.

         no note yet  ->  edit (empty)   Save note (disabled) · Clear · Close
         note exists  ->  view           Edit · Delete · Close
         editing      ->  edit           Save note · Clear · Cancel

     `Delete` and `Close` are both optional — see `deletable` and `closable`.
     A list surface drops Close from every saved note, because the list's own
     container owns that action and three of them are three ways to do one
     thing.

     ⚠️ DELETE BELONGS TO THE NOTE, CLEAR BELONGS TO THE TEXT, so they live in
     different modes and cannot be mistaken for one another. You delete a thing
     you have; you clear what you are typing. Both are irreversible in the sense
     that matters to the reader, so both ask first.
  */

  function create(opts) {
    opts = opts || {};

    var mount = opts.mount;
    if (!mount) return null;

    var prefix = opts.prefix || 'note';
    var btn = opts.btnClass || (prefix + '-action-btn');
    var max = opts.max || MAX;
    var warnAt = opts.warnAt || WARN_AT;
    var deletable = opts.deletable !== false;

    /* ⚠️ CLOSE BELONGS TO THE CONTAINER, NOT TO THE NOTE, and which of those is
       true depends on the surface. On /news/ the editor IS the panel: one note,
       and Close dismisses the thing you opened. In a list of notes on a plan it
       is meaningless — every note grew its own Close, all three did exactly what
       the panel's own Close does, and the reader had four controls for one
       action.

       So the list passes `closable: false` for saved notes and keeps it for a
       DRAFT, where backing out has a real meaning: discard the note you have not
       saved. That button says "Cancel" there rather than "Close", because it
       cancels a new note instead of closing anything. */
    var closable = opts.closable !== false;
    var closeLabel = opts.closeLabel || 'Close';

    /* ⚠️ THE STATUS LINE IS OPTIONAL BECAUSE ONE SURFACE ALREADY HAS ONE.
       /news/ puts status in `.story-action-status` up in the actions row, where
       it is `role="status" aria-live="polite"` and also reports Save and Pin —
       so an editor rendering a second one would give that panel two live
       regions saying different things. It passes `inlineStatus: false` and
       takes the text through `onStatus` instead. A surface with nowhere else to
       put it (a list of notes on a plan) lets the editor render its own. */
    var inlineStatus = opts.inlineStatus !== false;
    function statusHTML() {
      return inlineStatus
        ? '<p class="' + prefix + '-note-status" data-note-status role="status" aria-live="polite"></p>'
        : '';
    }

    // The stored note. `body` is what is in the database; the textarea holds
    // what is being typed, and the two are compared to decide whether Save has
    // anything to do.
    var body = opts.body || '';
    var mode = body ? 'view' : 'edit';

    /* ⚠️ THE STATUS LINE IS HELD HERE, NOT IN THE DOM, AND THAT IS A FIX RATHER
       THAN A STYLE CHOICE. On /news/, saving a note updates the published
       personal set, which re-renders the list, which re-renders the story panel
       and replaces this markup — wiping "Note saved." before anyone could read
       it. The save worked and the reader was told nothing, which is the worst of
       both. Kept in a variable and re-applied after every render.

       A surface that destroys and rebuilds the whole instance (which /news/
       does) seeds it back in through `opts.status`. */
    var status = opts.status || '';

    var id = prefix + '-note-body-' + (++seq);
    var root = doc.createElement('div');
    root.className = prefix + '-note';
    root.setAttribute('data-note-editor', '');

    /* ── markup ────────────────────────────────────────────────────────────── */

    function toolbarHTML() {
      if (mode === 'view') {
        return '<button type="button" class="' + btn + '" data-action="edit">Edit</button>' +
          (deletable
            ? '<button type="button" class="' + btn + '" data-action="delete">Delete</button>'
            : '') +
          (closable
            ? '<button type="button" class="' + btn + '" data-action="close">' + esc(closeLabel) + '</button>'
            : '');
      }
      /* The third button is Cancel when there is a stored note to go back TO,
         and Close/Cancel when there is not — those are different actions, which
         is why they carry different `data-action` values rather than one button
         that behaves two ways. */
      return '<button type="button" class="' + btn + ' is-primary" data-action="save" disabled>' +
          esc(opts.saveLabel || 'Save note') + '</button>' +
        '<button type="button" class="' + btn + '" data-action="clear">Clear</button>' +
        (body
          ? '<button type="button" class="' + btn + '" data-action="cancel">Cancel</button>'
          : (closable
              ? '<button type="button" class="' + btn + '" data-action="close">' + esc(closeLabel) + '</button>'
              : ''));
    }

    function footHTML(withCount) {
      return '<div class="' + prefix + '-note-foot">' +
        '<span class="' + prefix + '-note-count"' + (withCount ? ' data-note-count' : '') + '></span>' +
        '<span class="' + prefix + '-note-actions" data-note-toolbar>' + toolbarHTML() + '</span>' +
      '</div>';
    }

    function innerHTML() {
      if (mode === 'view') {
        // ⚠️ `esc()` INTO A TEXT CONTEXT IS THE ONLY RENDER PATH A NOTE HAS.
        // A note is private today, which is what makes a stored payload
        // self-XSS rather than stored XSS — and that stops being true the
        // moment anything renders notes across users, which Phase 7's admin UI
        // would. Any second render path needs escaping on purpose, not by luck.
        return '<div class="' + prefix + '-note-read" data-note-read>' + esc(body) + '</div>' +
          footHTML(false) +
          statusHTML();
      }
      return '<label class="' + prefix + '-note-label" for="' + id + '">' +
          esc(opts.label || 'Your note') + '</label>' +
        '<textarea id="' + id + '" class="' + prefix + '-note-input" rows="4" maxlength="' + max + '"' +
          ' placeholder="' + esc(opts.placeholder || 'Only you can see this.') + '">' + esc(body) + '</textarea>' +
        (opts.extraEditHTML || '') +
        footHTML(true) +
        statusHTML();
    }

    /* ── the pieces, found through the root and never through `document` ───── */

    function q(sel) { return root.querySelector(sel); }
    function input() { return root.querySelector('#' + id) || root.querySelector('textarea'); }
    function toolbar() { return q('[data-note-toolbar]'); }

    function setStatus(text) {
      status = text || '';
      var el = q('[data-note-status]');
      if (el) el.textContent = status;
      if (opts.onStatus) opts.onStatus(status);
    }

    function updateCount() {
      var ta = input();
      var el = q('[data-note-count]');
      if (!ta) return;
      if (el) {
        var used = ta.value.length;
        el.textContent = used + ' / ' + max;
        // The limit is stated rather than discovered: the counter is visible
        // from the first keystroke and turns colour before it bites, so nobody
        // writes past the cap and finds out only when saving fails.
        el.classList.toggle('is-near', used >= warnAt);
      }
      refreshSaveEnabled();
    }

    /* SAVE IS DISABLED WHEN THERE IS NOTHING TO SAVE — empty, or identical to
       what is already stored. The second half is the one that matters: without
       it the button stays live after a successful save and invites the reader to
       press it again, which is what made an always-open panel feel like it had
       no end. A disabled control that explains itself beats an enabled one that
       does nothing. */
    function refreshSaveEnabled() {
      var b = q('[data-action="save"]');
      var ta = input();
      if (!b || !ta) return;
      var value = ta.value.trim();
      var changed = value !== (body || '').trim();
      if (opts.extraChanged && opts.extraChanged(root)) changed = true;
      b.disabled = !value || !changed;
    }

    function render() {
      root.setAttribute('data-mode', mode);
      root.innerHTML = innerHTML();
      if (mode === 'edit') updateCount();
      // Re-applied after every render, which is the whole point of holding it.
      var el = q('[data-note-status]');
      if (el) el.textContent = status;
    }

    function setMode(next, focus) {
      mode = next;
      render();
      if (mode === 'edit' && focus !== false) {
        var ta = input();
        // ⚠️ preventScroll, because focusing an element that is off-screen
        // scrolls every scrollable ancestor including the document — the exact
        // trap `scrollIntoView` was removed from /news/ for.
        if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }
      }
    }

    /* ── inline confirmation, not confirm() ────────────────────────────────────
       A browser dialog cannot be styled to match anything here, and this site
       has already thought hard about leave prompts once. The toolbar is replaced
       in place with the question and two answers, so the reader stays where they
       are and Cancel or Escape puts it back exactly as it was. */
    function askConfirm(question, confirmLabel, action) {
      var bar = toolbar();
      if (!bar) return;
      bar.setAttribute('data-restore', bar.innerHTML);
      bar.innerHTML = '<span class="' + prefix + '-note-confirm">' + esc(question) + '</span>' +
        '<button type="button" class="' + btn + ' is-danger" data-action="confirm-yes" data-confirm="' + esc(action) + '">' +
          esc(confirmLabel) + '</button>' +
        '<button type="button" class="' + btn + '" data-action="confirm-no">Cancel</button>';
      var yes = bar.querySelector('[data-action="confirm-yes"]');
      if (yes) { try { yes.focus({ preventScroll: true }); } catch (e) { yes.focus(); } }
    }

    function cancelConfirm() {
      var bar = toolbar();
      if (!bar || !bar.hasAttribute('data-restore')) return false;
      bar.innerHTML = bar.getAttribute('data-restore');
      bar.removeAttribute('data-restore');
      refreshSaveEnabled();
      return true;
    }

    /* ── actions ───────────────────────────────────────────────────────────── */

    function doSave() {
      var ta = input();
      if (!ta) return;
      var value = ta.value.trim();
      if (!value) return;                  // the button is disabled; belt and braces
      var extra = opts.readExtra ? opts.readExtra(root) : undefined;
      setStatus(opts.savingText || 'Saving...');
      Promise.resolve(opts.onSave(value, extra)).then(function () {
        body = value;
        /* ⚠️ SAVING LANDS IN VIEW, AND THE SURFACE DECIDES WHETHER TO CLOSE.
           Landing in an editor after a successful save leaves the reader looking
           at something they have finished with. Setting view mode BEFORE any
           close is what makes re-opening show the note rather than an editor. */
        setMode('view');
        setStatus(opts.savedText || 'Note saved.');
        if (opts.onSaved) opts.onSaved(value, extra);
      }).catch(function (err) {
        setStatus('Could not save your note. ' + (err && err.message ? err.message : ''));
      });
    }

    function doDelete() {
      setStatus('Deleting...');
      Promise.resolve(opts.onDelete()).then(function () {
        body = '';
        // DELETING RETURNS AN EMPTY EDITOR, and the surface decides whether to
        // close it. An empty editor left open after a delete says nothing the
        // status line has not already said, and reads as though something failed
        // to happen — so /news/ closes. A list surface removes the row instead.
        setMode('edit', false);
        setStatus(opts.deletedText || 'Note deleted.');
        if (opts.onDeleted) opts.onDeleted();
      }).catch(function (err) {
        setStatus('Could not delete your note. ' + (err && err.message ? err.message : ''));
      });
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!b || !root.contains(b)) return;
      var action = b.getAttribute('data-action');

      if (action === 'edit') { setMode('edit'); setStatus(''); return; }
      if (action === 'close') { setStatus(''); if (opts.onClose) opts.onClose(); return; }
      if (action === 'cancel') {
        // Back to the stored note, discarding whatever was typed.
        setMode('view');
        setStatus('');
        return;
      }
      if (action === 'clear') {
        return askConfirm('Clear what you have typed? This cannot be undone.', 'Yes, clear', 'clear');
      }
      if (action === 'delete') {
        return askConfirm('Delete this note permanently? It cannot be restored.', 'Yes, delete', 'delete');
      }
      if (action === 'confirm-no') { cancelConfirm(); return; }
      if (action === 'confirm-yes') {
        var which = b.getAttribute('data-confirm');
        cancelConfirm();
        if (which === 'clear') {
          var ta = input();
          if (ta) {
            ta.value = '';
            try { ta.focus({ preventScroll: true }); } catch (err) { ta.focus(); }
            updateCount();
          }
          // CLEAR DOES NOT TOUCH THE DATABASE. It empties the box; the stored
          // note is untouched until Save. Saying so stops "clear" reading as a
          // quieter word for "delete".
          setStatus('Cleared. Your saved note is unchanged until you save.');
          return;
        }
        if (which === 'delete') return doDelete();
        return;
      }
      if (action === 'save') return doSave();
    });

    root.addEventListener('input', function (e) {
      if (e.target === input()) updateCount();
      else if (opts.extraChanged) refreshSaveEnabled();
    });

    root.addEventListener('change', function () {
      if (opts.extraChanged) refreshSaveEnabled();
    });

    // Escape backs out of a confirmation before it backs out of anything else.
    // Bound to the root rather than the document so one editor's Escape cannot
    // cancel another's confirmation.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (cancelConfirm()) e.stopPropagation();
    });

    render();
    mount.appendChild(root);

    return {
      el: root,
      mode: function () { return mode; },
      setMode: setMode,
      body: function () { return body; },
      setBody: function (b) { body = b || ''; setMode(body ? 'view' : 'edit', false); },
      status: function () { return status; },
      setStatus: setStatus,
      focus: function () {
        var ta = input();
        if (ta) { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }
      },
      destroy: function () {
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  global.AmplifiedNoteEditor = { MAX: MAX, WARN_AT: WARN_AT, create: create, esc: esc };
})(window);
