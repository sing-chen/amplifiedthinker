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

    // The second half of the same argument. This notice fires at the moment a
    // save did not happen, which is the most persuasive moment there is — and
    // also the moment someone is most entitled to ask what an account would
    // actually cost them. Sending them straight to the form answers only the
    // first question. `root()` again, because ten pages sit at three depths and
    // the Pages origin adds a subpath on top of that.
    var whyHref = nav && nav.root ? nav.root('why-sign-up.html') : '/why-sign-up.html';

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
        'Sign in</a> and they follow you to every device, or read ' +
        '<a href="' + whyHref + '" style="color: var(--teal); text-decoration: underline;">' +
        'what an account gets you</a> first.' +
      '</div>' +
      '<button class="resume-banner-btn dismiss" type="button" ' +
      'id="guestSaveNoticeDismiss">Dismiss</button>';

    anchor.parentNode.insertBefore(el, anchor);

    var btn = doc.getElementById('guestSaveNoticeDismiss');
    if (btn) btn.addEventListener('click', function () { el.remove(); });
  }

  /* ── the completion control ────────────────────────────────────────────── */

  // ⚠️ More UI in a storage module, and the argument is the one made above the
  // guest notice: the alternative is thirty-odd lines and a stylesheet pasted
  // into ten hand-written pages that already carry ~240 inline handlers each.
  //
  // It renders into whatever the page offers as `#completionSlot`, and does
  // NOTHING AT ALL when there isn't one. That is deliberate — it means the ten
  // pages can be fitted one at a time, and a page that has not been fitted is
  // unchanged rather than broken.
  //
  // Completion is the one thing here the user states rather than the page
  // inferring it. The schema has said so since Phase 3, and the reason is that
  // `visited` is coverage by scrolling: inferring completion from it would make
  // a fast scroll count as finishing.

  // ⚠️ EVERY RULE IS SCOPED UNDER THE ID, AND THAT IS NOT TIDINESS.
  //
  // This stylesheet is injected into ten hand-written pages, each with its own
  // <style> block and its own element selectors. `.section p` is (0,1,1) and
  // beats a bare `.ac-note` at (0,1,0) — which it duly did: the note rendered
  // in the body colour in both themes, and looked deliberate. An id prefix is
  // (1,1,0), so these rules win without anyone having to audit ten stylesheets
  // first, or re-audit them when a page gains a rule.
  //
  // Same family as the `.auth-panel label` defect in CLAUDE.md. The tell is
  // identical: nothing errors, and the wrong result looks like a design choice.
  var S = '#completionSlot ';
  var D = '[data-theme="dark"] #completionSlot ';

  /* The colour system, in one sentence: the TERRACOTTA LEFT BAR identifies the
     component and never changes; the FILL carries the state.

     It has to be legible against its neighbours, not merely pretty. The plan's
     Summary already ends with `.next-step-card` — light-sage fill, teal left
     bar — so the first version of this, a pale sage tint, read as a washed-out
     copy of the card directly beneath it. Terracotta is the page's emphasis
     accent (the hero bar, root-cause step numbers) and belongs to no other
     component here; `--cream` is the even-section striping and `--amber` is the
     overuse-warning colour, so both were unavailable for different reasons.

     Done is an INVERSION rather than another tint — solid fill, reversed text —
     because the two states have to be distinguishable at a glance, not only by
     reading them. */
  var COMPLETION_CSS =
    '#completionSlot{margin:40px 0 0}' +
    // A guest gets an empty slot, and an empty slot must take no space —
    // otherwise the page carries a 40px gap explained by nothing.
    '#completionSlot:empty{display:none;margin:0}' +

    /* ── the primer variant ───────────────────────────────────────────────
       ⚠️ THE REASON IS WIDTH, not height. `--content-max` is NOT declared on
       the primers, so the shared rule falls back to 780px — while the slide's
       own `.next-step-card` is 560px. Left alone the control renders 220px
       wider than everything beside it, on the one page type whose layout is
       fixed enough to make that obvious.

       The tighter padding is a smaller gain than it looks, and the measurement
       is worth recording so nobody re-derives it: in situ the compact box saves
       about 10px against the full one, because at 560px the head and note wrap
       onto more lines and eat most of what the padding gives back.

       And DO NOT justify this by "a slide should not scroll". At a 720px
       viewport, nine of the ten slides on an untouched primer already overflow,
       by up to 96px — measured on analytical-thinking before any anchor was
       added. Slides scrolling at laptop heights is a pre-existing property of
       the decks, not something this control introduces or fixes. */
    S + '.ac-box.ac-compact{max-width:560px;padding:16px 20px}' +
    S + '.ac-box.ac-compact .ac-btn{margin-top:12px;padding:8px 16px}' +
    S + '.ac-box.ac-compact .ac-note{margin-top:8px}' +

    /* ── unset ── */
    S + '.ac-box{background:#FFFFFF;border:1px solid rgba(138,75,44,.22);' +
      'border-left:4px solid var(--terracotta,#8A4B2C);' +
      'border-radius:0 var(--radius,8px) var(--radius,8px) 0;' +
      'padding:22px 26px;max-width:var(--content-max,780px)}' +
    S + '.ac-head{display:flex;align-items:center;gap:10px;font-family:Poppins,sans-serif;' +
      'font-size:15px;font-weight:600;color:var(--navy,#1F4D4A);line-height:1.4;margin:0}' +
    S + '.ac-tick{width:20px;height:20px;border-radius:50%;background:var(--deep-teal,#2D756F);' +
      'display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}' +
    S + '.ac-tick svg{width:11px;height:11px;fill:none;stroke:#fff;stroke-width:3;' +
      'stroke-linecap:round;stroke-linejoin:round}' +
    S + '.ac-btn{margin-top:14px;font-family:Poppins,sans-serif;font-size:13px;font-weight:600;' +
      'color:#fff;background:var(--deep-teal,#2D756F);border:0;border-radius:6px;' +
      'padding:10px 20px;cursor:pointer;transition:background .15s}' +
    S + '.ac-btn:hover:not(:disabled){background:var(--teal,#5BA79F)}' +
    S + '.ac-btn:disabled{opacity:.6;cursor:default}' +
    S + '.ac-undo{margin-top:12px;display:inline-block;font-family:Poppins,sans-serif;' +
      'font-size:12.5px;font-weight:600;color:var(--deep-teal,#2D756F);background:none;' +
      'border:0;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    S + '.ac-undo:disabled{opacity:.6;cursor:default}' +
    // ⚠️ NOT --warm-gray. That is #8B8A85, which is 3.46:1 on this white card —
    // under AA for 13px text. It reads as the obvious "muted text" choice and
    // is used as such elsewhere, but not on a ground this light. --text-muted
    // is the site-wide token for exactly this job; the skill pages do not
    // declare it, so the fallback carries its value and reaches 6.9:1.
    S + '.ac-note{margin:10px 0 0;font-family:Inter,sans-serif;font-size:13px;line-height:1.6;' +
      'color:var(--text-muted,#4A5C55)}' +
    S + '.ac-note a{color:var(--deep-teal,#2D756F)}' +
    S + '.ac-note.ac-err{color:var(--terracotta,#8A4B2C)}' +

    /* ── done: inverted ── */
    S + '.ac-box.is-done{background:var(--deep-teal,#2D756F);border-color:var(--deep-teal,#2D756F);' +
      'border-left-color:var(--terracotta,#8A4B2C)}' +
    S + '.ac-box.is-done .ac-head{color:var(--off-white,#EEF2EF)}' +
    S + '.ac-box.is-done .ac-note{color:rgba(238,242,239,.80)}' +
    S + '.ac-box.is-done .ac-note a,' + S + '.ac-box.is-done .ac-undo{color:var(--off-white,#EEF2EF)}' +
    S + '.ac-box.is-done .ac-tick{background:var(--off-white,#EEF2EF)}' +
    S + '.ac-box.is-done .ac-tick svg{stroke:var(--deep-teal,#2D756F)}' +

    /* ── dark ── */
    // ⚠️ NOT --d-bg-surface. That is #1B2E29, and `.next-step-card` sits at
    // #1C332E directly beneath this — within five points on every channel, so
    // the two read as one continuous block and only the bar colours tell them
    // apart. --d-terra-bg is the hero's own surface on these pages, so it is an
    // established background rather than an invented one, and it pairs with the
    // terracotta bar instead of competing with the neighbour's teal.
    D + '.ac-box{background:var(--d-terra-bg,#33231A);' +
      'border-color:rgba(232,201,174,.22);' +
      'border-left-color:var(--d-terra-stroke,#E8C9AE)}' +
    D + '.ac-head{color:var(--d-fg-heading,#DCEAE3)}' +
    D + '.ac-note{color:var(--d-fg-2,#9BAAA3)}' +
    D + '.ac-note.ac-err{color:var(--d-terra-stroke,#E8C9AE)}' +
    D + '.ac-tick{background:var(--d-teal-stroke,#8FCFC3)}' +
    D + '.ac-tick svg{stroke:var(--d-bg-page,#142320)}' +
    D + '.ac-btn{background:var(--d-teal-stroke,#8FCFC3);color:var(--d-bg-page,#142320)}' +
    D + '.ac-btn:hover:not(:disabled){background:var(--sage,#ACC4B6)}' +
    D + '.ac-undo,' + D + '.ac-note a{color:var(--d-fg-brand,#ACC4B6)}' +

    // Dark inverts the other way: a light fill on a dark page, so the state
    // change is the same gesture rather than the same colour.
    D + '.ac-box.is-done{background:var(--d-teal-stroke,#8FCFC3);' +
      'border-color:var(--d-teal-stroke,#8FCFC3);' +
      'border-left-color:var(--d-terra-stroke,#E8C9AE)}' +
    D + '.ac-box.is-done .ac-head{color:var(--d-bg-page,#142320)}' +
    D + '.ac-box.is-done .ac-note{color:rgba(20,35,32,.78)}' +
    D + '.ac-box.is-done .ac-note a,' + D + '.ac-box.is-done .ac-undo{' +
      'color:var(--d-bg-page,#142320)}' +
    D + '.ac-box.is-done .ac-tick{background:var(--d-bg-page,#142320)}' +
    D + '.ac-box.is-done .ac-tick svg{stroke:var(--d-teal-stroke,#8FCFC3)}' +

    '@media(prefers-reduced-motion:reduce){' + S + '.ac-btn{transition:none}}';

  // The only interpolated value is a date this file formatted itself, so this
  // is belt and braces rather than a live defence — but the alternative is a
  // reader having to prove that, every time they read the template.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var cssDone = false;

  function injectCompletionCss(doc) {
    if (cssDone) return;
    cssDone = true;
    var s = doc.createElement('style');
    s.id = 'amplified-completion-css';
    s.textContent = COMPLETION_CSS;
    doc.head.appendChild(s);
  }

  // "12 August", or "12 August 2025" once the year stops being obvious. A bare
  // year on something finished last week reads as clutter; omitting it on
  // something finished two years ago reads as wrong.
  function completionDate(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var opts = { day: 'numeric', month: 'long' };
      if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
      return d.toLocaleDateString('en-GB', opts);
    } catch (e) { return ''; }
  }

  var TICK = '<span class="ac-tick" aria-hidden="true"><svg viewBox="0 0 24 24">' +
             '<polyline points="4 12.5 9.5 18 20 6.5"/></svg></span>';

  function mountCompletion(store) {
    var doc = global.document;

    function attach() {
      var slot = doc.getElementById('completionSlot');
      if (!slot) return;                      // page not fitted yet — do nothing
      injectCompletionCss(doc);

      var isPrimer = store.kind === 'primer';

      // A plan is worked through; a ten-minute deck is finished. "Worked all the
      // way through this primer" overstates what it asks of someone, and the
      // slide has no room for the longer line anyway.
      var prompt = isPrimer
        ? 'Finished this primer?'
        : 'Worked all the way through this learning plan?';

      // Narrower and tighter, so the last slide does not start scrolling.
      var boxClass = isPrimer ? 'ac-box ac-compact' : 'ac-box';

      var busy = false;

      function render(msg, isErr) {
        // ⚠️ GUESTS SEE NOTHING HERE, AND THAT IS THE POINT.
        //
        // The first version showed the button and answered a guest who pressed
        // it. Two things are wrong with that. Marking complete would do nothing
        // even for the current session, because this file keeps nothing at all
        // for a guest — so the button is a promise it cannot keep.
        //
        // Worse, the END OF A PLAN IS THE WEAKEST MOMENT TO ASK. A guest has no
        // stored progress, so signing up there rescues nothing; the honest
        // version of the offer is "make an account, and note that none of what
        // you just read was recorded". The guest notice above already asks, at
        // the first save that did not happen — early, while there is still a
        // read ahead of them to be worth saving. Asking twice is worse than
        // asking once, and asking last is worse than asking first.
        if (store.mode() !== 'account') { slot.innerHTML = ''; return; }

        var done = store.completedAt();

        if (done) {
          slot.innerHTML =
            '<div class="' + boxClass + ' is-done">' +
              '<p class="ac-head">' + TICK + 'Completed ' +
                escapeHtml(completionDate(done)) + '</p>' +
              '<button class="ac-undo" type="button" id="acUndo">' +
                'Mark as not complete</button>' +
              (msg ? '<p class="ac-note' + (isErr ? ' ac-err' : '') + '">' +
                     msg + '</p>' : '') +
            '</div>';
          wire(doc.getElementById('acUndo'), false);
          return;
        }

        slot.innerHTML =
          '<div class="' + boxClass + '">' +
            '<p class="ac-head">' + prompt + '</p>' +
            '<button class="ac-btn" type="button" id="acDone">' +
              'I’ve completed this</button>' +
            '<p class="ac-note' + (isErr ? ' ac-err' : '') + '">' +
              (msg || 'Only you can see this, and you can undo it at any time.') +
            '</p>' +
          '</div>';
        wire(doc.getElementById('acDone'), true);
      }

      function wire(btn, value) {
        if (!btn) return;
        btn.addEventListener('click', function () {
          if (busy) return;

          // No guest branch: render() never draws a button for one. The guard
          // inside store.setComplete() stays as the backstop for any other
          // caller, but nothing here can reach it.
          busy = true;
          btn.disabled = true;
          store.setComplete(value, function (ok) {
            busy = false;
            if (ok) { render(); return; }
            // Leave the state as it was and say so. Silently doing nothing is
            // the one outcome that would make someone press it twice.
            render('That did not save. Check your connection and try again.', true);
          });
        });
      }

      // ready() gives the authoritative completedAt in account mode and null
      // for a guest, so this is the first moment either state can be drawn.
      store.ready(function () { render(); });
    }

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', attach);
    } else {
      attach();
    }
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

    // The completion timestamp, or null. Deliberately NOT part of `snapshot`:
    // everything in there is page state that round-trips through `state` jsonb,
    // and this is a column the page never authors. Keeping them separate is
    // what stops a page's save from ever carrying a completion value with it.
    var completedAt = null;

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
        .select('state, updated_at, completed_at')
        .eq('skill_slug', slug)
        .eq('content_type', kind)
        .maybeSingle()
        .then(function (r) {
          if (r.error || !r.data) { fireReady(null); return; }
          updatedAt = r.data.updated_at;
          completedAt = r.data.completed_at || null;
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

      /* ── the "Start over" confirmation ───────────────────────────────────
         ⚠️ THE WORDING IS A CLAIM ABOUT WHAT clear() DOES, so it lives next to
         clear() rather than in ten pages.

         It was previously ten copies of "this permanently deletes your saved
         progress… It cannot be undone." That was true when clear() was a hard
         DELETE. The moment clear() started preserving `completed_at`, every one
         of those copies became an overstatement — the page threatening to
         destroy something it now deliberately keeps.

         Exactly the rot CLAUDE.md describes: copy that states a limit is a claim
         about the system, and it goes stale like a comment. One implementation
         cannot drift from the behaviour it describes; ten can, and did. */
      confirmClear: function () {
        // A guest has nothing stored to lose, so nothing to warn about.
        if (mode !== 'account') return true;

        var msg = 'Start over? This clears your place and your answers for this ' +
                  (kind === 'primer' ? 'primer' : 'plan') +
                  ', on every device you sign in on.';

        msg += completedAt
          ? ' The date you completed it is kept.'
          : ' It cannot be undone.';

        return global.confirm(msg);
      },

      /* ── completion ──────────────────────────────────────────────────────
         `completed_at` is the one column the DATABASE holds and the PAGE never
         authors. The schema is explicit that completion is decided deliberately
         and never inferred from coverage, so this is its only writer. */
      completedAt: function () { return completedAt; },

      // ⚠️ Written IMMEDIATELY, not through the debounce. Every other write in
      // this file is a side effect of scrolling and can afford to wait 800ms;
      // this one is a button press, and a button that does nothing for most of
      // a second reads as broken.
      //
      // It also touches no other column. `toRow()` omits `completed_at` for the
      // mirror-image reason, so an ordinary save can never carry a completion
      // value and this can never carry a half-initialised DOM.
      setComplete: function (done, cb) {
        function finish(ok) { if (cb) { try { cb(ok); } catch (e) {} } }

        if (mode !== 'account') { showGuestNotice(); finish(false); return; }
        var c = client();
        if (!c) { finish(false); return; }

        var value = done ? new Date().toISOString() : null;

        // Upsert, not update: someone can reach the end of a plan and press
        // this before any scroll has created the row. On conflict PostgREST
        // updates only the columns in the payload, so state and visited survive.
        var row = withUser({
          skill_slug: slug,
          content_type: kind,
          completed_at: value
        });
        if (!row) { finish(false); return; }

        c.from(TABLE)
          .upsert(row, { onConflict: 'user_id,skill_slug,content_type' })
          .select('updated_at')
          .maybeSingle()
          .then(function (r) {
            if (r.error) { finish(false); return; }
            completedAt = value;
            // The row just moved under flush()'s guarded update. Take the new
            // baseline, or the next ordinary save writes against a stale one
            // and falls back to an unguarded upsert for no reason.
            if (r.data && r.data.updated_at) updatedAt = r.data.updated_at;
            finish(true);
          }, function () { finish(false); });
      },

      // "Start from top" / dismissing the resume banner. Deletes the account's
      // row. It does NOT touch localStorage — nothing in this file does.
      clear: function () {
        snapshot = null;
        pending = null;
        syncedJson = null;

        if (mode !== 'account') return;
        var c = client();
        if (!c) return;

        // ⚠️ "Start over" is about re-reading, not about undoing an achievement.
        // A plain delete takes `completed_at` with it, so someone re-reading a
        // plan they finished in March would silently lose the fact that they
        // finished it — and nothing would tell them. When there is a completion
        // worth keeping, blank the progress columns and leave the row standing.
        //
        // The hard delete stays right when there is nothing to preserve. A
        // deliberate "clear everything for this skill" is a different feature
        // (see BACKLOG.md) and that one WOULD remove the completion.
        if (completedAt) {
          c.from(TABLE)
            .update({ state: {}, visited: [], position: null })
            .eq('skill_slug', slug)
            .eq('content_type', kind)
            .select('updated_at')
            .maybeSingle()
            .then(function (r) {
              updatedAt = (r && r.data && r.data.updated_at) || null;
            }, function () {});
          return;
        }

        c.from(TABLE)
          .delete()
          .eq('skill_slug', slug)
          .eq('content_type', kind)
          .then(function () { updatedAt = null; completedAt = null; }, function () {});
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
    var store = createStore(match[2], match[1]);
    // Self-mounting on purpose: ten pages already call forPage(), and none of
    // them should have to learn a second call to get the control.
    mountCompletion(store);
    return store;
  }

  global.AmplifiedProgress = {
    storageKey: storageKey,
    create: createStore,
    forPage: forPage,

    mode: function () { return mode; },
    whenAuth: whenAuth
  };
})(window);
