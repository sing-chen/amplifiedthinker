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

  // ⚠️ THE LENGTH LIMIT IS DELIBERATELY NOT RESTATED HERE. It lives in
  // note-editor.js, which has to match `notes_body_length` in
  // 20260826120000_notes_body_length.sql — and a number written down in two
  // files is a number that will eventually disagree with itself.

  /* ⚠️ THE ICONS ARE NOT DRAWN HERE. news-render.mjs emits the three paths
     once, as <symbol>s in a hidden sprite inside the actions panel it paints,
     and this file references them by id. The paths used to be retyped in this
     file, which is how the server's Featured pin and the reader's Pin button
     could have drifted apart without anything failing. */
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#na-icon-' + name + '"/></svg>';
  }

  // nav.js owns the one escaper — see AmplifiedNav.escapeHtml.
  function esc(s) { return global.AmplifiedNav.escapeHtml(s); }

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

    // ⚠️ ONLY THE COLUMN THAT CHANGED. The upsert merges into an existing row,
    // so an omitted column keeps its stored value and a new row takes the
    // column default (false). Sending both flags from the cache used to clobber
    // the other one whenever the cache was stale — after a failed read, a Save
    // click would upsert {favorited: true, pinned: false} over a real pin.
    var row = { user_id: uid, story_id: storyId };
    if (patch.favorited != null) row.favorited = patch.favorited;
    if (patch.pinned != null) row.pinned = patch.pinned;
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

    /* ⚠️ UPDATE FIRST, INSERT ONLY IF NOTHING MATCHED — DELIBERATELY NOT UPSERT.
       This used `.upsert(..., { onConflict: 'user_id,target_type,target_id' })`
       and broke the moment `notes_one_per_target_idx` was scoped to
       `where target_type = 'news'`:

           there is no unique or exclusion constraint matching
           the ON CONFLICT specification

       Postgres can only INFER a PARTIAL unique index for ON CONFLICT if the
       statement carries the index's own WHERE predicate, and PostgREST does not
       emit one. So a partial index cannot serve an upsert through this client at
       all — not for the rows it covers, not ever.

       Doing it in two steps also removes the coupling that caused this: the way
       the client writes no longer depends on which indexes happen to exist. An
       edit costs one round trip, a first note costs two.

       The index still does its job. It is what stops two tabs both finding
       nothing and both inserting — the second insert is rejected, and the retry
       below turns that into the update it should always have been. */
    return sb.from('notes')
      .update({ body: body })
      .eq('user_id', uid).eq('target_type', 'news').eq('target_id', storyId)
      .select('id')
      .then(function (r) {
        if (r.error) throw r.error;
        if (r.data && r.data.length) return r;

        return sb.from('notes')
          .insert({ user_id: uid, target_type: 'news', target_id: storyId, body: body })
          .then(function (ins) {
            if (!ins.error) return ins;
            // 23505: someone else got there between the update and the insert.
            // The row exists now, so the write that was wanted is an update.
            if (String(ins.error.code) !== '23505') throw ins.error;
            return sb.from('notes')
              .update({ body: body })
              .eq('user_id', uid).eq('target_type', 'news').eq('target_id', storyId)
              .then(function (again) { if (again.error) throw again.error; return again; });
          });
      });
  }

  /* ── markup ──────────────────────────────────────────────────────────────── */

  /* ⚠️ THE GUEST MARKUP IS NOT WRITTEN HERE EITHER. The server paints it
     into the slot (news-render.mjs actionsHTML) before this file runs, and
     news-app.js repaints it from the same function on every story swap; this
     file captures the first paint and hands it back on sign-out. A retyped
     copy lived here until 2026-09-02 — identical that day, and a drift away
     from being a different invite for guests who had signed out. */
  var guestMarkup = null;
  function rememberGuestMarkup() {
    var target = slot();
    if (guestMarkup === null && target && !target.querySelector('[data-action]')) guestMarkup = target.innerHTML;
  }
  function guestHTML() { return guestMarkup || ''; }

  /* ── the note panel ───────────────────────────────────────────────────────
     ⚠️ THE EDITOR LIVES IN note-editor.js AND IS NOT REIMPLEMENTED HERE. The
     two modes, the counter, the disabled-Save rule, the inline confirmations
     for Clear and Delete, and Escape backing out of one were all written on
     this page first and were lifted out wholesale when notes reached primers
     and plans. Copying them would have been the cheaper edit and is exactly how
     two surfaces end up disagreeing about what Clear means.

     What stays here is everything about a STORY: which row to write, the
     favourite and pin flags beside it, the published personal set, and the
     button that opens the panel. The editor knows none of that. */

  function signedInHTML(state) {
    return '' +
      '<div class="story-actions-row">' +
        '<button type="button" class="story-action-btn" data-action="favorite"' +
          ' aria-pressed="' + (state.favorited ? 'true' : 'false') + '">' +
          icon('star') + '<span data-label>' + (state.favorited ? 'Saved' : 'Save') + '</span>' +
        '</button>' +
        '<button type="button" class="story-action-btn" data-action="pin"' +
          ' aria-pressed="' + (state.pinned ? 'true' : 'false') + '">' +
          icon('pin') + '<span data-label>' + (state.pinned ? 'Pinned' : 'Pin') + '</span>' +
        '</button>' +
        '<button type="button" class="story-action-btn" data-action="note"' +
          ' aria-expanded="false">' +
          icon('note') + '<span data-label>' + noteButtonLabel(state) + '</span>' +
        '</button>' +
        '<span class="story-action-status" role="status" aria-live="polite"></span>' +
      '</div>' +
      /* ⚠️ AN EMPTY, UNCLASSED WRAPPER, AND BOTH HALVES OF THAT MATTER.
         Empty because note-editor.js appends its own root here rather than
         being handed markup. Unclassed because `.story-note` sets
         `display: flex` and the editor's own root carries that class — putting
         it on the wrapper too would nest one inside the other, and would put a
         `display` on the element that gets `hidden` toggled. That is the trap
         this file's CSS block already carries an `!important` override for; the
         wrapper having no display rule means it does not depend on it. */
      '<div data-note-mount hidden></div>';
  }

  function noteButtonLabel(state) {
    return state.note ? 'View note' : 'Add a note';
  }

  /* ── painting ────────────────────────────────────────────────────────────── */

  /* ⚠️ THE STATUS LINE HAS TO SURVIVE A REPAINT, AND IT DID NOT.
     Saving a note updates the published personal set, which re-renders the
     list, which re-renders the story panel, which calls paint() and replaces
     this slot's HTML — wiping "Note saved." before anyone could read it. The
     save worked and the reader was told nothing, which is the worst of both.

     Held here rather than in the DOM, and re-applied after every paint. Cleared
     when the story changes, so a message about one story can never surface
     against another. */
  var statusText = '';

  function setStatus(text) {
    statusText = text || '';
    var el = doc.querySelector('.story-action-status');
    if (el) el.textContent = statusText;
  }

  /* ── the editor instance ──────────────────────────────────────────────────
     One at a time, because a story has one note and only one story is open. It
     is destroyed and rebuilt on every paint, which is why the status text is
     seeded back in through `opts.status` rather than living inside it. */
  var editor = null;

  function mountEditor(storyId, state) {
    var mount = doc.querySelector('[data-note-mount]');
    if (!mount || !global.AmplifiedNoteEditor) return;
    if (editor) editor.destroy();

    editor = global.AmplifiedNoteEditor.create({
      mount: mount,
      prefix: 'story',
      body: state.note || '',
      status: statusText,
      // The row already has a `role="status"` live region that reports Save and
      // Pin too. A second one inside the panel would announce over it.
      inlineStatus: false,
      onStatus: setStatus,
      onSave: function (bodyText) { return saveNote(storyId, bodyText); },
      onDelete: function () { return saveNote(storyId, ''); },
      onSaved: function (bodyText) {
        var st = cache[storyId] || {};
        st.note = bodyText;
        cache[storyId] = st;
        updatePersonal(box2Slug(), 'noted', true);
        /* ⚠️ SAVING CLOSES THE PANEL. Landing in view mode was already better
           than staying in an editor, but it still left the reader looking at
           something they had finished with and had to dismiss themselves. The
           status line says it saved and the toolbar button now says "View
           note", so it is one click away if they want it. The editor has
           already set view mode, which is what makes that click open the note
           rather than an editor. */
        openNote(false);
        setNoteLabel('View note');
      },
      onDeleted: function () {
        var st = cache[storyId] || {};
        st.note = '';
        cache[storyId] = st;
        updatePersonal(box2Slug(), 'noted', false);
        // DELETING CLOSES THE PANEL. An empty editor left open after a delete
        // says nothing the status line has not already said, and reads as
        // though something failed to happen.
        openNote(false);
        setNoteLabel('Add a note');
      },
      onClose: function () { openNote(false); }
    });
  }

  function setNoteLabel(text) {
    var lbl = doc.querySelector('[data-action="note"] [data-label]');
    if (lbl) lbl.textContent = text;
  }

  function openNote(open) {
    var mount = doc.querySelector('[data-note-mount]');
    var btn = doc.querySelector('[data-action="note"]');
    if (!mount || !btn) return;
    if (open) mount.removeAttribute('hidden'); else mount.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // The slug of whatever story is open, read at call time rather than captured:
  // a save can resolve after the reader has moved on.
  function box2Slug() {
    var box = container();
    return box ? box.getAttribute('data-story-slug') : null;
  }

  function paint() {
    var box = container();
    var target = slot();
    if (!box || !target) return;
    rememberGuestMarkup();

    var storyId = box.getAttribute('data-story-id');
    // A message belongs to the story it was raised on. Moving on discards it.
    if (storyId !== currentId) statusText = '';
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
      mountEditor(storyId, state);
      if (state.degraded) setStatus('Could not load your saved state.');
      else if (statusText) setStatus(statusText);   // survive the repaint
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
      // No backend text: "new row violates row-level security policy" is not
      // something a reader can act on. The button has already been reverted.
      setStatus('Could not save that. Check your connection and try again.');
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

  /* ⚠️ THE PIN PROMPT CANNOT USE THE EDITOR'S CONFIRMATION, and that is a
     property of what it replaces rather than a duplication to tidy away.
     note-editor.js replaces its own toolbar in place, which does not exist
     unless the note panel is open — and a pin is confirmed from the actions
     row, with the panel shut. This one replaces that row instead. The two look
     alike and are anchored to different things. */
  function askPinConfirm(question, confirmLabel) {
    var row = doc.querySelector('.story-actions-row');
    if (!row) return;
    row.setAttribute('data-restore', row.innerHTML);
    row.innerHTML = '<span class="story-note-confirm">' + esc(question) + '</span>' +
      '<button type="button" class="story-action-btn is-danger" data-action="pin-replace-yes">' +
        esc(confirmLabel) + '</button>' +
      '<button type="button" class="story-action-btn" data-action="pin-replace-no">Cancel</button>';
    // The safe option takes focus, so Enter cannot replace a pin unread —
    // the same rule progress.js and exit-guard.js apply to their confirmations.
    var no = row.querySelector('[data-action="pin-replace-no"]');
    if (no) no.focus();
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

    if (action === 'favorite') return toggleFlag(btn, 'favorited');
    if (action === 'pin') return requestPin(btn);

    if (action === 'note') {
      var mount = doc.querySelector('[data-note-mount]');
      if (!mount) return;
      var opening = mount.hasAttribute('hidden');
      openNote(opening);
      /* ⚠️ THE MODE IS NOT RESET ON OPEN, AND IT USED TO BE. The editor already
         holds the right one — `view` when a note exists, `edit` when it does
         not, and `view` after a save. Re-deriving it here would discard an edit
         in progress every time the panel was toggled shut and open again. */
      if (opening && editor) editor.focus();
      return;
    }

    if (action === 'pin-replace-no') { cancelPinConfirm(); return; }
    if (action === 'pin-replace-yes') {
      cancelPinConfirm();
      var pinBtn = doc.querySelector('[data-action="pin"]');
      if (pinBtn) toggleFlag(pinBtn, 'pinned');
      return;
    }

    /* Everything the note panel does — Edit, Save, Clear, Delete, Cancel,
       Close, and both confirmations — is handled by note-editor.js on its own
       root. Those actions never reach here, and adding a branch for one would
       mean two handlers racing for the same click. */
  });

  // Escape backs out of the PIN confirmation. The note editor cancels its own
  // on its own root, so this no longer has a note case to handle.
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (cancelPinConfirm()) e.stopPropagation();
  });

  /* ── lifecycle ───────────────────────────────────────────────────────────── */

  // news-app.js replaces the whole story panel when the reader swaps stories,
  // taking this slot with it. It announces the swap; repaint from that rather
  // than polling or observing the DOM.
  doc.addEventListener('amplified:story-rendered', paint);

  /* ⚠️ WAIT FOR `AmplifiedAuth`; DO NOT READ IT ONCE AND GIVE UP.
     nav.js appends the auth stack with `async = false`, which preserves
     execution order but does NOT delay DOMContentLoaded — so auth.js can land
     after this file has run and after DOMContentLoaded has fired. Reading the
     global once and returning would have left the personal layer permanently
     unpainted **for signed-in readers only**, which is the audience the whole
     feature is for and the one least likely to report it as a bug.
     AmplifiedNav.whenAuth is the wait: nav.js owns the <script> tag, so it
     calls back from the tag's load event. (This file polled every 60ms for
     six seconds until 2026-09-02, as did seven others.) */
  function whenAuthReady(fn) {
    /* ⚠️ nav.js publishes its synchronous peek on <html data-session>, and
       'unknown' is published AS-IS rather than collapsed to 'out'. So match
       'out' EXPLICITLY: a `!== 'in'` test would treat 'unknown' as a guest and
       show the sign-in invite to someone who is signed in. For a genuine guest
       nav.js never loads the auth stack at all, so short-circuiting here also
       avoids six seconds of pointless polling on every guest page view. */
    var nav = global.AmplifiedNav;
    if (!nav || typeof nav.whenAuth !== 'function') return;
    // Called with null for a guest whose page never loads the stack, and on a
    // failed load: either way the guest markup stands.
    nav.whenAuth(function (a) { if (a) fn(a); });
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
      // No trailing paint()/loadPersonal(): onAuthChange() calls back at once
      // when the answer is already known, and the server has already painted
      // the guest state for the case where it is not.
    });
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
