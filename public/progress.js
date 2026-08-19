// Shared progress persistence for skill pages (primer decks and full plans).
//
// Storage only. Each page still owns the mapping between its own DOM and the
// stored shape, because that part is genuinely page-specific. This module is
// the seam where that shape meets storage — keep page logic out of it.
//
// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5 CHANGED WHAT "STORAGE" MEANS HERE. Read this before touching it.
//
// Before: localStorage, for everybody, synchronously.
// Now:    Supabase, for signed-in users, asynchronously — and NOTHING AT ALL
//         for guests, which is the whole reason to sign up.
//
// "Nothing at all" is literal, and it is a clean break in both directions:
// this file no longer reads localStorage either. A guest gets no saved position,
// no restored quiz answers and no resume banner, whether or not something is
// still sitting in their browser from before.
//
// Two consequences, and each is a trap if you miss it.
//
// 1. `load()` can no longer answer, so it always returns null. A network read
//    cannot be made synchronous. Pages take the authoritative snapshot from
//    `ready(cb)`, which fires exactly once per page load in both modes and
//    hands guests null. `ready` is the API; `load` survives only so an old
//    caller cannot throw.
//
// 2. ⚠️ NOTHING TOUCHES EXISTING GUEST KEYS. Old `amplified_*` entries are inert
//    from here on — never read, never written, never deleted. Deleting them
//    would mean this phase destroying saved progress with its own hand, which
//    is the one outcome it must not produce; reading them would resurrect a
//    frozen position that can never advance again. They are left where they are
//    and ignored.
//
//    A one-time import that merged them into the account on sign-in was built
//    and tested, then dropped on 2026-08-18 — see docs/implementation-sequence.md,
//    "Guests lose progress entirely". Do not rebuild it without re-reading that.
// ─────────────────────────────────────────────────────────────────────────────
//
// The storage keys below match what shipped before this module existed. Nothing
// reads them any more, but the naming is kept so the old entries stay
// recognisable to a human looking at a browser.

(function (global) {
  'use strict';

  var PREFIX = 'amplified_';

  // Skill pages live at skills/<slug>/{plan,primer}.html at any depth, and are
  // opened over http(s) and file:// alike, so match on the tail of the path.
  var PAGE_RE = /\/skills\/([^/]+)\/(plan|primer)(?:\.html)?$/;

  // Long enough that dragging through a plan does not fire a write per section,
  // short enough that a normal read-then-leave still lands. The pagehide flush
  // below covers what falls inside the window.
  var DEBOUNCE_MS = 800;

  var TABLE = 'skill_progress';

  // Kept as the name of the old key, not as a live storage path. There is no
  // localRead, no localWrite and no localRemove in this file by design — see the
  // header. If you find yourself adding one back, that is the moment to go and
  // read why it went.
  function storageKey(kind, slug) {
    return PREFIX + kind + '_' + slug;
  }

  /* ── which mode are we in ──────────────────────────────────────────────── */

  // nav.js already reads the stored session synchronously, before any library
  // is fetched, so the nav can paint the right control on first paint. Reuse
  // that answer rather than writing a second copy of the same parser.
  //
  // If nav.js is not present the answer is 'out' — local only, nothing lost.
  // Every skill page loads nav.js immediately above this file, so in practice
  // that branch is for pages that have no nav at all.
  function peek() {
    var nav = global.AmplifiedNav;
    if (!nav || typeof nav.peekSession !== 'function') return { state: 'out' };
    return nav.peekSession();
  }

  // 'guest'   — settled, no account, nothing is saved.
  // 'pending' — a session probably exists; waiting on the library to confirm.
  // 'account' — settled, signed in, syncing.
  var mode = peek().state === 'out' ? 'guest' : 'pending';

  var authWaiters = [];
  var authSession = null;

  function settleAuth(session) {
    authSession = session || null;
    mode = authSession ? 'account' : 'guest';
    var waiting = authWaiters;
    authWaiters = [];
    for (var i = 0; i < waiting.length; i++) {
      try { waiting[i](authSession); } catch (e) {}
    }
  }

  // Polls for the global because nav.js appends the auth stack with `defer`, so
  // it lands after this file has run. Bounded: if the stack never arrives —
  // blocked host, offline, a CSP — we settle as a guest rather than leaving the
  // page waiting forever with no progress restored.
  function whenAuth(fn) {
    if (mode !== 'pending') { fn(authSession); return; }
    authWaiters.push(fn);
    if (authWaiters.length > 1) return;

    var waited = 0;
    (function poll() {
      var auth = global.AmplifiedAuth;
      if (auth) {
        auth.onAuthChange(function (session) {
          if (mode === 'pending') settleAuth(session);
        });
        return;
      }
      waited += 60;
      if (waited > 6000) { settleAuth(null); return; }
      global.setTimeout(poll, 60);
    })();
  }

  /* ── telling a guest that nothing is being kept ────────────────────────── */

  // ⚠️ Yes, this is UI in a storage module, and that is a real objection. Two
  // things outweigh it. The notice has to fire at the exact moment a save would
  // have happened and did not, which is a fact only this file knows; and the
  // alternative is the same twenty lines pasted into ten hand-written pages
  // that already carry ~240 inline handlers each. One implementation that can
  // be corrected once beats ten that drift.
  //
  // It is deliberately NOT shown on page load. A guest who reads a page and
  // leaves has lost nothing and should not be nagged. It appears the first time
  // this page tries to save something — a quiz answer, an opened accordion, a
  // new section reached — because that is the moment the loss becomes real, and
  // it is the honest argument for signing up rather than a banner ad for it.
  //
  // Dismissal is in-memory only. Remembering it would mean writing localStorage,
  // which is the one thing this file has just stopped doing; and since it needs
  // a fresh page load AND a fresh interaction to reappear, it cannot nag.
  var noticeShown = false;

  function showGuestNotice() {
    if (noticeShown) return;
    noticeShown = true;

    var doc = global.document;
    var anchor = doc.getElementById('resumeBanner');
    if (!anchor || !anchor.parentNode) return;   // not a page that has the slot

    var nav = global.AmplifiedNav;
    var href = nav && nav.root ? nav.root('sign-in/') : '/sign-in/';

    // Reuses the resume banner's own classes, so it inherits that styling from
    // each page's stylesheet and adds no CSS to ten files. The two can never
    // collide: the banner only appears with restored progress, which a guest
    // no longer has.
    var el = doc.createElement('div');
    el.className = 'resume-banner';
    el.id = 'guestSaveNotice';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');

    // The inline colour is the one concession. `.resume-banner-text a` is not
    // styled on any of these pages, and a default blue link on the charcoal
    // panel is close to unreadable.
    el.innerHTML =
      '<div class="resume-banner-text">' +
        '<strong>Not being saved</strong>' +
        'Your place and your answers are only kept when you are signed in. ' +
        '<a href="' + href + '" style="color: var(--teal); text-decoration: underline;">' +
        'Sign in</a> and they follow you to every device.' +
      '</div>' +
      '<button class="resume-banner-btn dismiss" type="button" ' +
      'id="guestSaveNoticeDismiss">Dismiss</button>';

    anchor.parentNode.insertBefore(el, anchor);

    var btn = doc.getElementById('guestSaveNoticeDismiss');
    if (btn) btn.addEventListener('click', function () { el.remove(); });
  }

  /* ── remote layer ──────────────────────────────────────────────────────── */

  function client() {
    var auth = global.AmplifiedAuth;
    return auth ? auth.client() : null;
  }

  // Returns null rather than an unowned row if the session has gone, so a caller
  // cannot accidentally send an insert that can only be rejected.
  function withUser(row) {
    if (!authSession || !authSession.user) return null;
    var copy = {};
    for (var k in row) if (Object.prototype.hasOwnProperty.call(row, k)) copy[k] = row[k];
    copy.user_id = authSession.user.id;
    return copy;
  }

  // The row carries the page's snapshot verbatim in `state`, and ALSO fills
  // `position` and `visited` from it.
  //
  // That duplication is on purpose. `state` is what this file reads back, so a
  // snapshot round-trips byte-for-byte and no page shape has to survive a
  // mapping — plan `visited` holds section ids, primer `visited` holds slide
  // numbers, and a text[] column would quietly turn the second into strings.
  // The two columns exist for Phase 9's dashboards, which need to query across
  // users without opening every jsonb blob.
  //
  // `completed_at` is written by nobody yet. The schema says the page decides
  // completion and no page computes it today, so it is left untouched — an
  // upsert that omits a column keeps whatever is already there.
  //
  // ⚠️ `user_id` is NOT here, and every INSERT path has to add it. The column is
  // `not null` with no default, so an insert without it fails on the constraint
  // before RLS is even consulted — and the `with check (user_id = auth.uid())`
  // policy would reject it anyway. UPDATE does not need it: the row already has
  // one, and RLS confines the update to rows that are already ours.
  function toRow(kind, slug, data) {
    var position = null;
    if (kind === 'plan' && data.section != null) position = String(data.section);
    if (kind === 'primer' && data.current != null) position = String(data.current);

    return {
      skill_slug: slug,
      content_type: kind,
      position: position,
      visited: (data.visited || []).map(String),
      state: data
    };
  }

  /* ── the store ─────────────────────────────────────────────────────────── */

  function createStore(kind, slug) {
    var key = storageKey(kind, slug);

    var readyFns = [];
    var settled = false;
    var snapshot = null;      // what ready() delivered, or the last thing saved

    var pending = null;       // snapshot awaiting a write
    var timer = null;
    var syncedJson = null;    // what the server last confirmed it holds
    var updatedAt = null;     // the row's updated_at, our write precondition
    var inFlight = false;

    function fireReady(data) {
      settled = true;
      snapshot = data;
      var fns = readyFns;
      readyFns = [];
      for (var i = 0; i < fns.length; i++) {
        try { fns[i](data); } catch (e) {}
      }
    }

    // ── reading ──

    function loadRemote() {
      var c = client();
      if (!c) { fireReady(null); return; }

      // No user_id filter: RLS scopes every row to the caller, and the policy
      // is the thing under test. A filter here would mask a broken policy by
      // making a leak impossible to observe from this page.
      c.from(TABLE)
        .select('state, updated_at')
        .eq('skill_slug', slug)
        .eq('content_type', kind)
        .maybeSingle()
        .then(function (r) {
          if (r.error || !r.data) { fireReady(null); return; }
          updatedAt = r.data.updated_at;
          syncedJson = JSON.stringify(r.data.state);
          fireReady(r.data.state || null);
        }, function () { fireReady(null); });
    }

    // ── writing ──

    function schedule() {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(flush, DEBOUNCE_MS);
    }

    function flush() {
      if (timer) { global.clearTimeout(timer); timer = null; }
      if (inFlight || pending === null) return;

      var data = pending;
      var json = JSON.stringify(data);

      // Skip identical snapshots. This is not only a saving: it is what stops a
      // tab left open for hours from clobbering a newer device the moment a
      // stray scroll event fires a save with nothing actually changed.
      if (json === syncedJson) { pending = null; return; }

      var c = client();
      if (!c) return;

      inFlight = true;
      pending = null;
      var row = toRow(kind, slug, data);
      var insertRow = withUser(row);
      if (!insertRow) { failed(); return; }

      function done(newUpdatedAt) {
        inFlight = false;
        syncedJson = json;
        updatedAt = newUpdatedAt || null;
        if (pending !== null) schedule();
      }

      function failed() {
        inFlight = false;
        // Keep the snapshot so the next save, or the pagehide flush, retries.
        if (pending === null) pending = data;
      }

      // First write of the page load: we do not know the row's updated_at, so
      // there is nothing to guard against. Upsert creates it or takes it over.
      if (updatedAt === null) {
        c.from(TABLE)
          .upsert(insertRow, { onConflict: 'user_id,skill_slug,content_type' })
          .select('updated_at')
          .maybeSingle()
          .then(function (r) {
            if (r.error) { failed(); return; }
            done(r.data && r.data.updated_at);
          }, failed);
        return;
      }

      // Afterwards, write only if the row is still the one we read. Another
      // device may have written in between; last-write-wins is the rule, so a
      // miss is not an error — it means re-reading the baseline and writing
      // again. The guard's job is to make that second write *deliberate*.
      c.from(TABLE)
        .update(row)
        .eq('skill_slug', slug)
        .eq('content_type', kind)
        .eq('updated_at', updatedAt)
        .select('updated_at')
        .maybeSingle()
        .then(function (r) {
          if (r.error) { failed(); return; }
          if (r.data) { done(r.data.updated_at); return; }

          // Nothing matched. Fall back to an unguarded upsert rather than
          // retrying the guard: a timestamptz that fails to round-trip through
          // the filter would otherwise mean this device silently stops saving,
          // which is far worse than the stale write the guard prevents.
          c.from(TABLE)
            .upsert(insertRow, { onConflict: 'user_id,skill_slug,content_type' })
            .select('updated_at')
            .maybeSingle()
            .then(function (r2) {
              if (r2.error) { failed(); return; }
              done(r2.data && r2.data.updated_at);
            }, failed);
        }, failed);
    }

    // A page dismissed or closed inside the debounce window would otherwise
    // lose its last change. supabase-js cannot set `keepalive`, so the flush
    // goes straight to PostgREST — the one place in the site that does.
    function flushOnHide() {
      if (mode !== 'account' || pending === null) return;

      var json = JSON.stringify(pending);
      if (json === syncedJson) { pending = null; return; }

      var cfg = global.AmplifiedSupabase && global.AmplifiedSupabase.config();
      var token = authSession && authSession.access_token;
      if (!cfg || !token) return;

      var row = toRow(kind, slug, pending);
      row.user_id = authSession.user.id;   // no ON CONFLICT target without it

      try {
        global.fetch(cfg.url + '/rest/v1/' + TABLE +
                     '?on_conflict=user_id,skill_slug,content_type', {
          method: 'POST',
          keepalive: true,
          headers: {
            'apikey': cfg.key,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify([row])
        });
        syncedJson = json;
        pending = null;
      } catch (e) {}
    }

    // `visibilitychange` rather than `unload`: it is the only one that fires
    // reliably when a mobile browser is backgrounded, which is the case where
    // the tab may never get another chance to run.
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState === 'hidden') flushOnHide();
    });
    global.addEventListener('pagehide', flushOnHide);

    // ── public surface ──

    var store = {
      key: key,
      kind: kind,
      slug: slug,

      mode: function () { return mode; },

      // The authoritative snapshot, once. Fires in both modes, always
      // asynchronously in account mode and on a microtask for guests, so a page
      // never has to care which one it got.
      ready: function (fn) {
        if (settled) { global.setTimeout(function () { fn(snapshot); }, 0); return; }
        readyFns.push(fn);
        if (readyFns.length > 1) return;

        whenAuth(function (session) {
          // Guests get null, always. Not "null unless something is in
          // localStorage" — a frozen position that can never advance again is
          // worse than a clean start, because the page would offer to resume
          // somewhere and then refuse to remember anything after it.
          if (!session) { fireReady(null); return; }
          loadRemote();
        });
      },

      // ⚠️ Writes are dead until ready() has fired. A page registers its scroll
      // handler before it restores, so saves genuinely do arrive first — and one
      // of them would set the row's baseline from a half-initialised DOM, then
      // race the read that was about to overwrite that DOM anyway. Dropping them
      // costs nothing: ready() is followed by a restore, and the next real
      // interaction saves the restored state.
      save: function (data) {
        snapshot = data;

        // Nothing before ready() counts as the user losing anything — those are
        // the page initialising itself, not work being done.
        if (!settled) return;

        if (mode !== 'account') { showGuestNotice(); return; }

        pending = data;
        schedule();
      },

      // Vestigial. Every caller was moved to ready(); this stays so that a page
      // or bookmarklet still calling it gets null rather than an exception.
      load: function () { return null; },

      // "Start from top" / dismissing the resume banner. Deletes the account's
      // row. It does NOT touch localStorage — nothing in this file does.
      clear: function () {
        snapshot = null;
        pending = null;
        syncedJson = null;

        if (mode !== 'account') return;
        var c = client();
        if (!c) return;
        c.from(TABLE)
          .delete()
          .eq('skill_slug', slug)
          .eq('content_type', kind)
          .then(function () { updatedAt = null; }, function () {});
      }
    };

    return store;
  }

  // Returned when the path is not a skill page. Keeps callers working rather
  // than throwing — same reasoning as the try/catch above.
  function createNullStore() {
    return {
      key: null,
      kind: null,
      slug: null,
      mode: function () { return mode; },
      ready: function (fn) { global.setTimeout(function () { fn(null); }, 0); },
      save: function () {},
      load: function () { return null; },
      clear: function () {}
    };
  }

  function forPage() {
    var match = PAGE_RE.exec(global.location.pathname);
    if (!match) return createNullStore();
    return createStore(match[2], match[1]);
  }

  global.AmplifiedProgress = {
    storageKey: storageKey,
    create: createStore,
    forPage: forPage,

    mode: function () { return mode; },
    whenAuth: whenAuth
  };
})(window);
