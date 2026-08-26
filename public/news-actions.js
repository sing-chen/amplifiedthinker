// Favourites, per-reader pins and private notes on /news/<slug>.
//
// ⚠️ /news/ AND /news/<slug> ONLY, the same scoping rule auth-pages.css,
// learning.js and news-app.css follow. styles.css and nav.js are already paid
// for by every page; nothing else needs a word of this.
//
// ⚠️ THE SERVER PAINTS THE SIGNED-OUT STATE AND THIS FILE OWNS THE SLOT.
// The server has no session to read, so its honest first paint is the guest
// one; this takes over as soon as AmplifiedAuth is ready. Exactly the
// arrangement nav.js and auth.js already use for the nav auth control.
//
// ⚠️ `user_news.pinned` IS NOT `news_stories.pinned`. This file only ever
// touches the first: a pin belonging to one reader, invisible to everyone
// else. The editorial pin — one site-wide, admin-set, the one that lifts a
// story to the top of the headline list — is a different column on a different
// table and is not writable from here. The schema carries a comment about this
// because the two are trivially conflated, and conflating them would mean a
// reader appearing to re-pin the site's front page.

(function (global) {
  'use strict';

  var doc = global.document;

  // Same route test the rest of the news stack uses.
  if (!/^\/news(\/|$)/.test(global.location.pathname)) return;

  // ⚠️ MUST MATCH `notes_body_length` in 20260826120000_notes_body_length.sql.
  // The database is the real limit — browsers write to PostgREST directly, so
  // this number is the courtesy, not the control. Raising one without the other
  // means a note that types fine and then fails to save.
  var NOTE_MAX = 500;
  var NOTE_WARN_AT = 450;

  var STAR = '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';
  var PIN = '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5"/>';
  var NOTE = '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><polyline points="14 4 14 10 20 10"/>';

  function icon(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function auth() { return global.AmplifiedAuth || null; }
  function client() { var a = auth(); return a ? a.client() : null; }
  function userId() { var a = auth(); var u = a && a.user(); return u ? u.id : null; }

  /* ── state, per story ─────────────────────────────────────────────────────
     Cached by story uuid so walking Previous/Next through a day's stories does
     not re-read the same rows. Cleared on sign-out, because it is somebody's
     personal data and must not survive into the next session on a shared
     machine. */
  var cache = {};
  var currentId = null;

  function slot() { return doc.querySelector('[data-actions-slot]'); }
  function container() { return doc.querySelector('.story-actions'); }


  /* THE READER'S WHOLE PERSONAL SET, published for the list to render.

     The per-story controls need one story's row; the Saved chip and the "Your
     pins" group need EVERY row. So this loads them once and hands them to
     news-app.js as slugs, because the renderer works in slugs while user_news
     keys on the story uuid - translating here means the renderer never has to
     know a uuid exists.

     A CustomEvent and a global rather than a direct call: news-app.js is a
     bundled module and this is a classic script. Neither may depend on the
     other having loaded, and the global is what lets whichever arrives second
     catch up without a race. */
  function idToSlug() {
    var el = doc.getElementById('news-data');
    var map = {};
    if (!el) return map;
    try {
      JSON.parse(el.textContent).forEach(function (s) { if (s.id) map[s.id] = s.slug; });
    } catch (e) { /* the list will simply have no personal layer */ }
    return map;
  }

  function publishPersonal(favs, pins, noted) {
    global.AmplifiedNewsPersonal = { enabled: true, favs: favs, pins: pins, noted: noted };
    try {
      doc.dispatchEvent(new CustomEvent('amplified:news-personal'));
    } catch (e) { /* the controls still work; only the list ordering misses out */ }
  }

  function clearPersonal() {
    global.AmplifiedNewsPersonal = { enabled: false, favs: {}, pins: {}, noted: {} };
    try { doc.dispatchEvent(new CustomEvent('amplified:news-personal')); } catch (e) {}
  }

  function loadPersonal() {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return;

    var map = idToSlug();
    // Two tables, two reads. `notes` is polymorphic - `target_id` is text with
    // no FK - so there is nothing to join on even if one query were wanted.
    //
    // Only rows that are actually set count. A user_news row exists as soon as
    // EITHER flag has ever been toggled, so `favorited = false` rows are common
    // and must not read as saved.
    Promise.all([
      sb.from('user_news').select('story_id,favorited,pinned').eq('user_id', uid),
      sb.from('notes').select('target_id').eq('user_id', uid).eq('target_type', 'news')
    ]).then(function (res) {
      var un = res[0], nt = res[1];
      if (un.error || !Array.isArray(un.data)) return;
      var favs = {}, pins = {}, noted = {};
      un.data.forEach(function (r) {
        var slug = map[r.story_id];
        if (!slug) return;              // a story that is no longer published
        if (r.favorited) favs[slug] = 1;
        if (r.pinned) pins[slug] = 1;
      });
      // A failed notes read leaves the Has notes chip absent rather than the
      // whole personal layer missing: losing one filter beats losing all of it.
      if (!nt.error && Array.isArray(nt.data)) {
        nt.data.forEach(function (r) {
          var slug = map[r.target_id];
          if (slug) noted[slug] = 1;
        });
      }
      publishPersonal(favs, pins, noted);
    });
  }

  // Keep the published set in step with a toggle, so pinning a story visibly
  // lifts it to the top of the list rather than waiting for a reload.
  function updatePersonal(slug, field, on) {
    var p = global.AmplifiedNewsPersonal;
    if (!p || !p.enabled || !slug) return;
    var bag = field === 'favorited' ? p.favs : (field === 'noted' ? p.noted : p.pins);
    if (on) bag[slug] = 1; else delete bag[slug];

    // ⚠️ ONE PIN PER READER, mirrored in the published set. The database
    // enforces this with a trigger and a partial unique index, but the list
    // renders from THIS object - so without clearing the old entry here the
    // reader would briefly see two stories under "Your pins" and only find out
    // which one really stuck by reloading.
    if (field === 'pinned' && on) {
      Object.keys(p.pins).forEach(function (k) { if (k !== slug) delete p.pins[k]; });
    }
    try { doc.dispatchEvent(new CustomEvent('amplified:news-personal')); } catch (e) {}
  }

  // Which story the reader currently has pinned, if any. Used to NAME it in the
  // replace prompt rather than asking about "your pinned story" in the abstract.
  function currentPinSlug(exceptSlug) {
    var p = global.AmplifiedNewsPersonal;
    if (!p || !p.enabled) return null;
    var keys = Object.keys(p.pins).filter(function (k) { return k !== exceptSlug; });
    return keys.length ? keys[0] : null;
  }

  /* Shortened to something scannable. Headlines here run past 100 characters
     and a prompt the reader has to READ to answer is a prompt they will dismiss
     unread. Cut on a word boundary, never mid-word.

     Straight quotes are stripped rather than escaped: several titles carry
     their own, and wrapping one in the prompt's curly quotes produced a nest
     that read as a typo. */
  var TITLE_CAP = 58;

  function titleForSlug(slug) {
    var el = doc.getElementById('news-data');
    if (!el || !slug) return null;
    var title = null;
    try {
      var hit = JSON.parse(el.textContent).filter(function (s) { return s.slug === slug; })[0];
      title = hit ? hit.title : null;
    } catch (e) { return null; }
    if (!title) return null;

    title = title.replace(/["“”]/g, '').trim();
    if (title.length <= TITLE_CAP) return title;
    var cut = title.slice(0, TITLE_CAP);
    var space = cut.lastIndexOf(' ');
    return (space > 20 ? cut.slice(0, space) : cut).replace(/[\s—–,;:.]+$/, '') + '…';
  }

  /* ── reads ───────────────────────────────────────────────────────────────── */

  function loadState(storyId) {
    if (cache[storyId]) return Promise.resolve(cache[storyId]);

    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.resolve(null);

    // Two reads rather than a join: they are different tables with different
    // shapes, and `notes` is polymorphic — `target_id` is text, so there is no
    // FK to join on in the first place.
    return Promise.all([
      sb.from('user_news').select('favorited,pinned')
        .eq('user_id', uid).eq('story_id', storyId).maybeSingle(),
      sb.from('notes').select('id,body')
        .eq('user_id', uid).eq('target_type', 'news').eq('target_id', storyId).maybeSingle()
    ]).then(function (res) {
      var un = res[0] && res[0].data;
      var nt = res[1] && res[1].data;
      var state = {
        favorited: Boolean(un && un.favorited),
        pinned: Boolean(un && un.pinned),
        noteId: nt ? nt.id : null,
        note: nt ? nt.body : ''
      };
      cache[storyId] = state;
      return state;
    }).catch(function () {
      // A failed read must not remove the controls — it shows them in their
      // default state and lets the write report any real problem. Hiding them
      // would make a transient hiccup look like a feature that does not exist.
      return { favorited: false, pinned: false, noteId: null, note: '', degraded: true };
    });
  }

  /* ── writes ──────────────────────────────────────────────────────────────── */

  // ⚠️ `user_id` is NOT optional on an insert: the column is `not null` with no
  // default, so it fails the constraint before RLS is consulted — and
  // `with check (user_id = auth.uid())` would reject it anyway. Same rule
  // progress.js documents for skill_progress.
  function saveFlags(storyId, patch) {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.reject(new Error('signed out'));

    var state = cache[storyId] || { favorited: false, pinned: false };
    var row = {
      user_id: uid,
      story_id: storyId,
      favorited: patch.favorited != null ? patch.favorited : state.favorited,
      pinned: patch.pinned != null ? patch.pinned : state.pinned
    };
    return sb.from('user_news').upsert(row, { onConflict: 'user_id,story_id' })
      .then(function (r) { if (r.error) throw r.error; return r; });
  }

  function saveNote(storyId, body) {
    var sb = client();
    var uid = userId();
    if (!sb || !uid) return Promise.reject(new Error('signed out'));

    if (!body) {
      // ⚠️ An empty note is a DELETE, not an empty row. `notes_body_length`
      // requires at least one character, so saving '' would be refused by the
      // database — and a row holding nothing is not a note anyway.
      return sb.from('notes').delete()
        .eq('user_id', uid).eq('target_type', 'news').eq('target_id', storyId)
        .then(function (r) { if (r.error) throw r.error; });
    }

    // Upserts on `notes_one_per_target_idx`, which is why that index exists:
    // without it every save would insert another row and the page would show
    // whichever one came back first.
    return sb.from('notes').upsert(
      { user_id: uid, target_type: 'news', target_id: storyId, body: body },
      { onConflict: 'user_id,target_type,target_id' }
    ).then(function (r) { if (r.error) throw r.error; });
  }

  /* ── markup ──────────────────────────────────────────────────────────────── */

  function guestHTML() {
    return '<p class="story-actions-invite">Save this story, pin it to the top of your feed, or keep a private note on it.</p>' +
      '<a class="story-action-btn story-action-signin" href="/sign-in/" data-signin-return>Sign in</a>';
  }

  /* ── the note panel has TWO MODES, and that is what gives it a resting state ──
     A single always-editing panel has no natural end: saving leaves you in a
     textarea with a Save button, so the only way out is to notice that the
     toolbar button toggles it. Splitting view from edit means Save has
     somewhere to LAND.

         no note yet  ->  edit (empty)   Save note (disabled) · Close
         note exists  ->  view           Edit · Delete · Close
         editing      ->  edit           Save note · Clear · Cancel

     ⚠️ DELETE BELONGS TO THE NOTE, CLEAR BELONGS TO THE TEXT, so they live in
     different modes and cannot be mistaken for one another. You delete a thing
     you have; you clear what you are typing. Both are irreversible in the sense
     that matters to the reader, so both ask first. */

  function noteToolbarHTML(mode, state) {
    if (mode === 'view') {
      return '<button type="button" class="story-action-btn" data-action="note-edit">Edit</button>' +
             '<button type="button" class="story-action-btn" data-action="note-delete">Delete</button>' +
             '<button type="button" class="story-action-btn" data-action="note-close">Close</button>';
    }
    var hasSaved = Boolean(state.note);
    return '<button type="button" class="story-action-btn is-primary" data-action="note-save" disabled>Save note</button>' +
           '<button type="button" class="story-action-btn" data-action="note-clear">Clear</button>' +
           '<button type="button" class="story-action-btn" data-action="' +
             (hasSaved ? 'note-cancel' : 'note-close') + '">' +
             (hasSaved ? 'Cancel' : 'Close') + '</button>';
  }

  function notePanelHTML(mode, state) {
    if (mode === 'view') {
      return '<div class="story-note-read" data-note-read>' + esc(state.note) + '</div>' +
             '<div class="story-note-foot">' +
               '<span class="story-note-count"></span>' +
               '<span class="story-note-actions" data-note-toolbar>' + noteToolbarHTML('view', state) + '</span>' +
             '</div>';
    }
    return '<label class="story-note-label" for="story-note-body">Your note</label>' +
      '<textarea id="story-note-body" class="story-note-input" rows="4" maxlength="' + NOTE_MAX + '"' +
        ' placeholder="Only you can see this.">' + esc(state.note) + '</textarea>' +
      '<div class="story-note-foot">' +
        '<span class="story-note-count" data-note-count></span>' +
        '<span class="story-note-actions" data-note-toolbar>' + noteToolbarHTML('edit', state) + '</span>' +
      '</div>';
  }

  function signedInHTML(state) {
    var hasNote = Boolean(state.note);
    return '' +
      '<div class="story-actions-row">' +
        '<button type="button" class="story-action-btn" data-action="favorite"' +
          ' aria-pressed="' + (state.favorited ? 'true' : 'false') + '">' +
          icon(STAR) + '<span data-label>' + (state.favorited ? 'Saved' : 'Save') + '</span>' +
        '</button>' +
        '<button type="button" class="story-action-btn" data-action="pin"' +
          ' aria-pressed="' + (state.pinned ? 'true' : 'false') + '">' +
          icon(PIN) + '<span data-label>' + (state.pinned ? 'Pinned' : 'Pin') + '</span>' +
        '</button>' +
        '<button type="button" class="story-action-btn" data-action="note"' +
          ' aria-expanded="false">' +
          icon(NOTE) + '<span data-label>' + noteButtonLabel(state) + '</span>' +
        '</button>' +
        '<span class="story-action-status" role="status" aria-live="polite"></span>' +
      '</div>' +
      '<div class="story-note" data-note-panel data-mode="' + (hasNote ? 'view' : 'edit') + '" hidden>' +
        notePanelHTML(hasNote ? 'view' : 'edit', state) +
      '</div>';
  }

  function noteButtonLabel(state) {
    return state.note ? 'View note' : 'Add a note';
  }

  /* ── painting ────────────────────────────────────────────────────────────── */

  function setStatus(text) {
    var el = doc.querySelector('.story-action-status');
    if (el) el.textContent = text || '';
  }

  function updateCount(ta) {
    var el = doc.querySelector('[data-note-count]');
    if (!el || !ta) return;
    var used = ta.value.length;
    el.textContent = used + ' / ' + NOTE_MAX;
    // The limit is stated rather than discovered: the counter is visible from
    // the first keystroke and turns colour before it bites, so nobody writes
    // past 500 and finds out only when saving fails.
    el.classList.toggle('is-near', used >= NOTE_WARN_AT);
    refreshSaveEnabled(ta);
  }

  /* SAVE IS DISABLED WHEN THERE IS NOTHING TO SAVE - empty, or identical to
     what is already stored. The second half is the one that matters: without it
     the button stays live after a successful save and invites the reader to
     press it again, which is what made the old always-open panel feel like it
     had no end. A disabled control that explains itself beats an enabled one
     that does nothing. */
  function refreshSaveEnabled(ta) {
    var btn = doc.querySelector('[data-action="note-save"]');
    if (!btn || !ta) return;
    var box = container();
    var state = (box && cache[box.getAttribute('data-story-id')]) || { note: '' };
    var value = ta.value.trim();
    btn.disabled = !value || value === (state.note || '').trim();
  }

  function panel() { return doc.querySelector('[data-note-panel]'); }

  function setNoteMode(mode) {
    var p = panel();
    var box = container();
    if (!p || !box) return;
    var state = cache[box.getAttribute('data-story-id')] || { note: '' };
    p.setAttribute('data-mode', mode);
    p.innerHTML = notePanelHTML(mode, state);
    if (mode === 'edit') {
      var ta = doc.getElementById('story-note-body');
      if (ta) { ta.focus(); updateCount(ta); }
    }
  }

  function openNote(open) {
    var p = panel();
    var btn = doc.querySelector('[data-action="note"]');
    if (!p || !btn) return;
    if (open) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* INLINE CONFIRMATION, NOT confirm(). A browser dialog cannot be styled to
     match anything here, and this site already thought hard about leave
     prompts once. The toolbar is replaced in place with the question and two
     answers, so the reader stays where they are and Cancel or Escape puts it
     back exactly as it was. */
  function askConfirm(question, confirmLabel, action) {
    var bar = doc.querySelector('[data-note-toolbar]');
    if (!bar) return;
    bar.setAttribute('data-restore', bar.innerHTML);
    bar.innerHTML = '<span class="story-note-confirm">' + esc(question) + '</span>' +
      '<button type="button" class="story-action-btn is-danger" data-action="confirm-yes" data-confirm="' + esc(action) + '">' +
        esc(confirmLabel) + '</button>' +
      '<button type="button" class="story-action-btn" data-action="confirm-no">Cancel</button>';
    var yes = bar.querySelector('[data-action="confirm-yes"]');
    if (yes) yes.focus();
  }

  function cancelConfirm() {
    var bar = doc.querySelector('[data-note-toolbar]');
    if (!bar || !bar.hasAttribute('data-restore')) return false;
    bar.innerHTML = bar.getAttribute('data-restore');
    bar.removeAttribute('data-restore');
    var ta = doc.getElementById('story-note-body');
    if (ta) refreshSaveEnabled(ta);
    return true;
  }

  // The slug of whatever story is open, read at call time rather than captured:
  // a save can resolve after the reader has moved on.
  function box2Slug() {
    var box = container();
    return box ? box.getAttribute('data-story-slug') : null;
  }

  function doDelete(storyId) {
    setStatus('Deleting...');
    saveNote(storyId, '').then(function () {
      var st = cache[storyId] || {};
      st.note = '';
      cache[storyId] = st;
      updatePersonal(box2Slug(), 'noted', false);
      // DELETING CLOSES THE PANEL. An empty editor left open after a delete
      // says nothing the status line has not already said, and reads as though
      // something failed to happen.
      openNote(false);
      setNoteMode('edit');
      var lbl = doc.querySelector('[data-action="note"] [data-label]');
      if (lbl) lbl.textContent = 'Add a note';
      setStatus('Note deleted.');
    }).catch(function (err) {
      setStatus('Could not delete your note. ' + (err && err.message ? err.message : ''));
    });
  }

  function paint() {
    var box = container();
    var target = slot();
    if (!box || !target) return;

    var storyId = box.getAttribute('data-story-id');
    currentId = storyId;

    var a = auth();
    if (!a || !a.isSignedIn()) {
      target.innerHTML = guestHTML();
      return;
    }
    if (!storyId) return;   // nothing to key a row against; leave the invite up

    loadState(storyId).then(function (state) {
      // The reader may have moved on while that was in flight. Painting the
      // previous story's note over the current one would be worse than not
      // painting at all.
      var stillHere = container();
      if (!state || !stillHere || stillHere.getAttribute('data-story-id') !== storyId) return;
      var target2 = slot();
      if (!target2) return;
      target2.innerHTML = signedInHTML(state);
      updateCount(doc.getElementById('story-note-body'));
      if (state.degraded) setStatus('Could not load your saved state.');
    });
  }

  /* Optimistic, then reconciled. A toggle that waits for a round trip feels
     broken on a slow connection; one that never reconciles lies. The published
     personal set moves with it both ways, so pinning visibly lifts the story to
     the top of the list and a failed write puts it back. */
  function toggleFlag(btn, field) {
    var box = container();
    if (!box) return;
    var storyId = box.getAttribute('data-story-id');
    var slug = box.getAttribute('data-story-slug');
    var state = cache[storyId] || { favorited: false, pinned: false, noteId: null, note: '' };
    var next = !state[field];

    var patch = {};
    patch[field] = next;
    state[field] = next;
    cache[storyId] = state;
    reflectFlag(btn, field, next);
    updatePersonal(slug, field, next);
    setStatus('');

    saveFlags(storyId, patch).catch(function (err) {
      state[field] = !next;
      cache[storyId] = state;
      reflectFlag(btn, field, !next);
      updatePersonal(slug, field, !next);
      setStatus('Could not save that. ' + (err && err.message ? err.message : ''));
    });
  }

  /* ⚠️ PINNING SOMETHING ELSE REPLACES YOUR PIN, SO IT ASKS FIRST AND NAMES
     WHAT IT WILL REPLACE. The database enforces one pin per reader with a
     trigger, which means the old pin is cleared whether or not anybody was
     told - and silently discarding a choice the reader made is exactly the
     kind of quiet loss this site keeps deciding not to do.

     Unpinning never asks: it takes nothing away that is not the thing being
     acted on. */
  function requestPin(btn) {
    var box = container();
    if (!box) return;
    var slug = box.getAttribute('data-story-slug');
    var state = cache[box.getAttribute('data-story-id')] || {};

    if (state.pinned) return toggleFlag(btn, 'pinned');   // unpinning

    var current = currentPinSlug(slug);
    if (!current) return toggleFlag(btn, 'pinned');       // nothing to replace

    var title = titleForSlug(current);
    askPinConfirm(
      title
        ? 'Replace your pinned story? \u201c' + title + '\u201d is pinned now.'
        : 'Replace your pinned story?',
      'Yes, replace'
    );
  }

  /* The pin prompt cannot reuse askConfirm(): that one replaces the NOTE
     toolbar, which does not exist unless the note panel is open. This one
     replaces the actions row itself. */
  function askPinConfirm(question, confirmLabel) {
    var row = doc.querySelector('.story-actions-row');
    if (!row) return;
    row.setAttribute('data-restore', row.innerHTML);
    row.innerHTML = '<span class="story-note-confirm">' + esc(question) + '</span>' +
      '<button type="button" class="story-action-btn is-danger" data-action="pin-replace-yes">' +
        esc(confirmLabel) + '</button>' +
      '<button type="button" class="story-action-btn" data-action="pin-replace-no">Cancel</button>';
    var yes = row.querySelector('[data-action="pin-replace-yes"]');
    if (yes) yes.focus();
  }

  function cancelPinConfirm() {
    var row = doc.querySelector('.story-actions-row');
    if (!row || !row.hasAttribute('data-restore')) return false;
    row.innerHTML = row.getAttribute('data-restore');
    row.removeAttribute('data-restore');
    return true;
  }

  function reflectFlag(btn, field, on) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = btn.querySelector('[data-label]');
    if (!label) return;
    if (field === 'favorited') label.textContent = on ? 'Saved' : 'Save';
    if (field === 'pinned') label.textContent = on ? 'Pinned' : 'Pin';
  }

  doc.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn || !container() || !container().contains(btn)) return;

    var action = btn.getAttribute('data-action');
    var box = container();
    var storyId = box.getAttribute('data-story-id');

    if (action === 'favorite') return toggleFlag(btn, 'favorited');
    if (action === 'pin') return requestPin(btn);

    if (action === 'note') {
      var p = panel();
      if (!p) return;
      var opening = p.hasAttribute('hidden');
      openNote(opening);
      if (opening) {
        var st = cache[storyId] || { note: '' };
        setNoteMode(st.note ? 'view' : 'edit');
      }
      return;
    }

    if (action === 'note-edit') return setNoteMode('edit');
    if (action === 'note-close') { openNote(false); setStatus(''); return; }

    if (action === 'note-cancel') {
      // Back to the stored note, discarding whatever was typed.
      setNoteMode('view');
      setStatus('');
      return;
    }

    if (action === 'note-clear') {
      return askConfirm('Clear what you have typed? This cannot be undone.', 'Yes, clear', 'clear');
    }
    if (action === 'note-delete') {
      return askConfirm('Delete this note permanently? It cannot be restored.', 'Yes, delete', 'delete');
    }
    if (action === 'pin-replace-no') { cancelPinConfirm(); return; }
    if (action === 'pin-replace-yes') {
      cancelPinConfirm();
      var pinBtn = doc.querySelector('[data-action="pin"]');
      if (pinBtn) toggleFlag(pinBtn, 'pinned');
      return;
    }
    if (action === 'confirm-no') { cancelConfirm(); return; }

    if (action === 'confirm-yes') {
      var which = btn.getAttribute('data-confirm');
      cancelConfirm();
      if (which === 'clear') {
        var ta = doc.getElementById('story-note-body');
        if (ta) { ta.value = ''; ta.focus(); updateCount(ta); }
        // CLEAR DOES NOT TOUCH THE DATABASE. It empties the box; the stored
        // note is untouched until Save. Saying so stops "clear" reading as a
        // quieter word for "delete".
        setStatus('Cleared. Your saved note is unchanged until you save.');
        return;
      }
      if (which === 'delete') return doDelete(storyId);
      return;
    }

    if (action === 'note-save') {
      var input = doc.getElementById('story-note-body');
      if (!input) return;
      var body = input.value.trim();
      if (!body) return;                    // the button is disabled; belt and braces
      setStatus('Saving...');
      saveNote(storyId, body).then(function () {
        var st = cache[storyId] || {};
        st.note = body;
        cache[storyId] = st;
        updatePersonal(box2Slug(), 'noted', true);
        // Save LANDS in view mode, which is what stops the save-again loop.
        setNoteMode('view');
        var lbl = doc.querySelector('[data-action="note"] [data-label]');
        if (lbl) lbl.textContent = 'View note';
        setStatus('Note saved.');
      }).catch(function (err) {
        setStatus('Could not save your note. ' + (err && err.message ? err.message : ''));
      });
      return;
    }
  });

  // Escape backs out of a confirmation before it backs out of anything else.
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (cancelConfirm() || cancelPinConfirm()) e.stopPropagation();
  });

  doc.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'story-note-body') updateCount(e.target);
  });

  /* ── lifecycle ───────────────────────────────────────────────────────────── */

  // news-app.js replaces the whole story panel when the reader swaps stories,
  // taking this slot with it. It announces the swap; repaint from that rather
  // than polling or observing the DOM.
  doc.addEventListener('amplified:story-rendered', paint);

  /* ⚠️ POLL FOR `AmplifiedAuth`; DO NOT READ IT ONCE AND GIVE UP.
     nav.js appends the auth stack with `async = false`, which preserves
     execution order but does NOT delay DOMContentLoaded — so auth.js can land
     after this file has run and after DOMContentLoaded has fired. Reading the
     global once and returning would have left the personal layer permanently
     unpainted **for signed-in readers only**, which is the audience the whole
     feature is for and the one least likely to report it as a bug. progress.js
     and learning.js both poll for exactly this reason and say so.

     Bounded, so a blocked host or a CSP settles as a guest rather than leaving
     the page waiting for ever. */
  var POLL_MS = 60;
  var POLL_LIMIT_MS = 6000;

  function whenAuthReady(fn) {
    /* ⚠️ nav.js publishes its synchronous peek on <html data-session>, and
       'unknown' is published AS-IS rather than collapsed to 'out'. So match
       'out' EXPLICITLY: a `!== 'in'` test would treat 'unknown' as a guest and
       show the sign-in invite to someone who is signed in. For a genuine guest
       nav.js never loads the auth stack at all, so short-circuiting here also
       avoids six seconds of pointless polling on every guest page view. */
    if (doc.documentElement.getAttribute('data-session') === 'out') return;

    var waited = 0;
    (function poll() {
      if (auth()) { fn(auth()); return; }
      waited += POLL_MS;
      if (waited > POLL_LIMIT_MS) return;   // guest markup stands
      global.setTimeout(poll, POLL_MS);
    })();
  }

  function start() {
    whenAuthReady(function (a) {
      a.onAuthChange(function (session) {
        // Someone else's favourites must not survive a sign-out on a shared
        // machine, and a sign-in must not show the previous reader's note.
        cache = {};
        if (session) loadPersonal(); else clearPersonal();
        paint();
      });
      paint();
      if (a.isSignedIn()) loadPersonal();
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
