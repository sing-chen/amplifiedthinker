// Contextual leave prompt for skill pages (primer decks and full plans).
//
//   <script src="../../exit-guard.js"></script>   — AFTER nav.js and progress.js
//
// Tells a reader what leaving this page costs them, at the moment they try to
// leave it. Two different facts, because there are two different readers:
//
//   guest    nothing on this page is being kept — not their place, not their
//            answers — so leaving means starting from the top next time. They
//            get a real choice, including the option to stay.
//   account  their place is already saved. Nothing is at risk; the prompt
//            exists so a signed-in reader is told that rather than simply
//            dropped out of the page.
//
// ─────────────────────────────────────────────────────────────────────────────
// THREE THINGS THIS FILE DELIBERATELY DOES NOT DO. Read before extending it.
//
// 1. ⚠️ IT DERIVES NOTHING ABOUT PROGRESS. Guest-vs-account is read live from
//    `AmplifiedProgress.mode()`, which already owns that answer for the whole
//    site. It is not recomputed here, and no section count is quoted. A second
//    implementation of "how far are they" is exactly the defect CLAUDE.md
//    records against learning.js: two readers of the same account disagreed
//    within a day. If this prompt ever needs a number, progress.js hands it
//    over — this file does not count anything itself.
//
// 2. ⚠️ NO `beforeunload`. It cannot be used to say any of the above. Every
//    browser replaced custom text with a fixed generic string in 2016, so a
//    closing tab can only ever raise "Leave site? Changes you may have made
//    will not be saved" — wrong for a signed-in reader, whose work IS saved,
//    and uninformative for a guest. Registering one would also suppress the
//    browser's own back-forward cache. Tab close, reload and the URL bar are
//    therefore NOT covered, and cannot be. This is a browser limit, not an
//    omission to fix later.
//
// 3. It never blocks. Every path out of the dialog leads somewhere, Escape
//    included, and the prompt fires at most once per page load per reader.
//    A guard that argues twice is a guard people learn to click through.
//
// ── why a native <dialog> ──
// progress.js's confirmClear() argues against hand-rolled modals on these ten
// pages, and it is right: focus trap, scroll lock, Escape, backdrop clicks and
// focus return, hand-written ten times over, is an accessibility REGRESSION
// against the browser's own dialog. That argument is about hand-rolled modals.
// `<dialog>` + `showModal()` gets every one of those from the browser, so the
// objection does not apply — but it is the reason this file must never be
// "improved" into a positioned <div>.
// ─────────────────────────────────────────────────────────────────────────────

(function (global) {
  'use strict';

  var doc = global.document;

  // Same shape progress.js matches on, and for the same reason: ten pages at
  // three depths, opened over http(s) and file:// alike.
  var PAGE_RE = /\/skills\/([^/]+)\/(plan|primer)(?:\.html)?$/;
  if (!PAGE_RE.test(global.location.pathname)) return;

  // Native dialog only. Every target browser has had it for years; anywhere it
  // is missing, the reader simply navigates as they always did. A fallback
  // would mean the hand-rolled modal this file exists to avoid.
  if (typeof doc.createElement('dialog').showModal !== 'function') return;

  /* ── the engagement gate ───────────────────────────────────────────────────
     Someone who lands on the wrong page and leaves in four seconds has nothing
     to lose and no reason to be stopped. Three independent signals arm the
     prompt, and any one is enough.

     ⚠️ THE THIRD ONE IS NOT OPTIONAL, AND MEASURING IS HOW IT WAS FOUND. The
     five PRIMERS ARE FIXED-VIEWPORT SLIDE DECKS: `scrollHeight - clientHeight`
     is exactly 0, so the scroll signal can never fire on half the pages this
     file runs on. A reader ten slides into a primer had produced no scroll and
     no prompt, and the only thing still covering them was the timer. Interaction
     covers what scroll cannot.

     Interaction deliberately EXCLUDES clicks on links that leave the page —
     otherwise the exit click would arm the gate a moment before being judged by
     it, and someone who landed and immediately left would be stopped, which is
     the one reader this gate exists to leave alone. */
  var ENGAGE_MS = 20000;
  var ENGAGE_FRACTION = 0.10;
  var ENGAGE_MAX_PX = 1200;

  var engaged = false;
  function engage() { engaged = true; }

  global.setTimeout(engage, ENGAGE_MS);

  // ⚠️ A FRACTION ALONE IS THE WRONG MEASURE, AND THE NUMBERS SHOW WHY. These
  // plans are long: `scrollHeight - clientHeight` on the Systems Thinking plan
  // is ~70,000px, so 10% is SEVEN THOUSAND PIXELS of scrolling before the gate
  // would arm — while 10% of a short page is a few hundred. The same rule meant
  // completely different amounts of reading depending on which page you opened.
  //
  // Capping it fixes both ends: a proportion of a short page, an absolute
  // screenful-or-so of a long one. Whichever comes first is enough, because the
  // question is only "has this person started reading", not "how far in".
  global.addEventListener('scroll', function onScroll() {
    if (engaged) { global.removeEventListener('scroll', onScroll); return; }
    var el = doc.documentElement;
    var reach = el.scrollHeight - el.clientHeight;
    if (reach <= 0) return;                       // fixed-viewport primer deck
    var threshold = Math.min(reach * ENGAGE_FRACTION, ENGAGE_MAX_PX);
    if ((global.scrollY || el.scrollTop) >= threshold) engage();
  }, { passive: true });

  /* ── who is reading ────────────────────────────────────────────────────────
     `mode` stays null until progress.js settles the question. Null means "not
     known yet", and the prompt stays silent — telling a reader their place is
     saved before knowing whether it is would be worse than saying nothing. */
  var progress = global.AmplifiedProgress;

  /* Read LIVE from progress.js, never cached here. Signing out from the nav
     does not reload the page, so a value captured once would keep telling a
     now-signed-out reader "your place is saved" for the rest of the visit.
     progress.js reports 'pending' until the stack settles, which is this
     file's null. */
  function mode() {
    if (!progress || typeof progress.mode !== 'function') return null;
    var m = progress.mode();
    return m === 'account' || m === 'guest' ? m : null;
  }

  // The SAME store the page is using — forPage() is cached, so this neither
  // builds a second one nor mounts a second completion control. Asking it is how
  // this file avoids ever deciding for itself what "finished" means.
  var store = progress && typeof progress.forPage === 'function' ? progress.forPage() : null;

  function isComplete() {
    return Boolean(store && typeof store.completedAt === 'function' && store.completedAt());
  }

  /* ── state ─────────────────────────────────────────────────────────────── */

  var asked = false;      // has the prompt been shown at least once
  var leaving = false;    // we are performing the navigation ourselves
  var dialog = null;
  var pendingGo = null;   // what to do if they choose to leave

  /* ── how often to ask, and why the two readers differ ──────────────────────
     A guest is asked EVERY time they try to leave. The convention for
     unsaved-work guards — documents, mail drafts, form wizards, `beforeunload`
     itself — is to warn on every attempt, because acknowledging a risk once
     does not make it stop existing. Their place is still unsaved on the second
     attempt and on the tenth.

     A signed-in reader is asked ONCE per page load. Nothing is at risk, so the
     prompt is a courtesy, and a courtesy that repeats is friction. Repeating it
     would also be the textbook route to warning fatigue: a reader trained to
     dismiss this without reading is a reader who will dismiss the guest version
     without reading too.

     ⚠️ Neither is asked once the item is marked complete. There is nothing left
     to finish, so the invitation is empty and the warning is moot. `completedAt`
     comes from the page's own store — this file does not decide what finished
     means. In practice it is only ever set for a signed-in reader, because a
     guest's completion is not written down anywhere; that asymmetry is correct
     rather than an oversight. */
  function shouldAsk() {
    if (isComplete()) return false;
    return mode() === 'guest' ? true : !asked;
  }

  function ready() {
    return engaged && !leaving && mode() !== null && shouldAsk();
  }

  /* ── the dialog ────────────────────────────────────────────────────────── */

  // Styles are injected rather than shipped as an eleventh stylesheet link.
  // Same reasoning progress.js gives for showGuestNotice(): ten hand-written
  // pages, and a <link> in each is ten places for one of them to be forgotten.
  // Every value is a semantic token already defined on these pages, so the
  // dialog follows the theme without knowing anything about it — do not
  // hardcode a colour here, least of all #FFFFFF on a brand fill, which flips
  // to a bright teal in dark mode.
  function injectStyles() {
    if (doc.getElementById('exitGuardStyles')) return;
    var css =
      // Wide enough that three buttons sit on one row at the default text size
      // without shrinking to nothing. Measured, not guessed: at 30rem the row
      // was 8px over and wrapped.
      '#exitGuard{border:0;padding:0;background:transparent;max-width:min(34rem,calc(100vw - 2rem))}' +
      '#exitGuard::backdrop{background:rgba(31,77,74,.45)}' +
      '#exitGuard .eg-card{background:var(--bg-surface,#fff);color:var(--fg-1,#2D3330);' +
        'border:1px solid var(--line,rgba(45,51,48,.14));border-radius:var(--radius-lg,10px);' +
        'box-shadow:var(--shadow-lg,0 20px 48px rgba(31,77,74,.12));' +
        'padding:var(--space-6,32px);font-family:var(--font-body,system-ui,sans-serif)}' +
      '#exitGuard h2{margin:0 0 var(--space-3,12px);font-family:var(--font-display,inherit);' +
        'font-size:1.25rem;line-height:1.25;color:var(--fg-heading,#1F4D4A)}' +
      '#exitGuard p{margin:0 0 var(--space-5,24px);font-size:.95rem;line-height:1.55;' +
        'color:var(--fg-2,#6E6D68)}' +
      // ⚠️ `nowrap`, and the buttons shrink rather than stack. With wrapping on,
      // three controls at this width broke across two rows and the dialog read
      // as two separate decisions — "Leave / Sign in" above "Stay" — which is
      // not the choice being offered. Below 420px they stack deliberately.
      '#exitGuard .eg-actions{display:flex;flex-wrap:nowrap;gap:var(--space-2,8px);' +
        'justify-content:flex-end;align-items:center}' +

      // ⚠️ [hidden] IS THE WEAKEST RULE IN THE CASCADE AND THIS BLOCK IS WHY.
      // The browser's own `[hidden]{display:none}` is a UA rule, so the author
      // `display:inline-flex` below beats it — and a signed-in reader was shown
      // a "Sign in first" button, because `el.hidden = true` was set and had no
      // effect. Third instance of this in the repo after `.auth-actions` and
      // `.doc-cta`. It must come BEFORE the display rule and stay `!important`,
      // or the next `display` added here reopens it.
      '#exitGuard [hidden]{display:none !important}' +

      '#exitGuard button,#exitGuard a.eg-btn{font:inherit;font-size:.875rem;font-weight:600;' +
        'border-radius:var(--radius-md,6px);padding:.625rem .9rem;cursor:pointer;' +
        'white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;' +
        'justify-content:center;border:1px solid transparent}' +

      // Every option is a real button. "Leave" was transparent with no border,
      // so it rendered as plain text beside two buttons — a control that does
      // not look clickable next to controls that do reads as a label, and the
      // one genuinely irreversible choice here is the worst one to disguise.
      // It stays the quietest of the three; quiet is not invisible.
      '#exitGuard .eg-go{background:transparent;color:var(--fg-2,#6E6D68);' +
        'border-color:var(--line-strong,rgba(45,51,48,.24))}' +
      '#exitGuard .eg-go:hover{color:var(--fg-1,#2D3330);' +
        'border-color:var(--fg-2,#6E6D68)}' +
      '#exitGuard .eg-stay{background:var(--bg-brand,#26605B);color:var(--fg-on-brand,#EEF2EF)}' +
      // ⚠️ `a.eg-signin`, not `.eg-signin`. The shared rule above is
      // `#exitGuard a.eg-btn` — (1,1,1) — and it sets `border:1px solid
      // transparent`. A bare `.eg-signin` is (1,1,0) and LOSES, so the outline
      // silently disappeared and the button rendered as bare text on a panel.
      // Caught by reading computed borderColor, which came back rgba(0,0,0,0)
      // while the CSS above looked perfectly correct. Same family as the
      // `.auth-panel label` trap in CLAUDE.md: check specificity against the
      // element selectors before assuming a class wins.
      '#exitGuard a.eg-signin{background:transparent;color:var(--fg-brand,#26605B);' +
        'border-color:var(--fg-brand,#26605B)}' +
      '#exitGuard button:focus-visible,#exitGuard a.eg-btn:focus-visible{' +
        'outline:2px solid var(--fg-brand,#26605B);outline-offset:2px}' +
      '@media (max-width:420px){#exitGuard .eg-actions{flex-direction:column-reverse}' +
        '#exitGuard .eg-actions>*{justify-content:center;width:100%}}' +

      /* ⚠️ ON THESE TEN PAGES THE SEMANTIC TOKENS DO NOT FLIP IN DARK MODE.
         `--bg-surface` is still #FFFFFF under [data-theme="dark"]; so is
         `--fg-1`. Dark is built as a PARALLEL `--d-*` set applied per component
         (`[data-theme="dark"] .next-step-card { background: var(--d-teal-bg) }`
         and so on), not as a redefinition of the light tokens.

         So a new component that only uses semantic tokens renders its LIGHT
         appearance in dark — this dialog came back as a white card on a #142320
         page, measured rather than guessed. Every surface below therefore needs
         an explicit dark counterpart. Do not "simplify" these away.

         ⚠️ Note `.eg-stay` in particular: the brand fill inverts to a BRIGHT
         teal in dark, so its label has to go dark with it. A light label on that
         button is the exact mistake recorded against hardcoding #FFFFFF on a
         brand fill. */
      '[data-theme="dark"] #exitGuard::backdrop{background:rgba(0,0,0,.6)}' +
      '[data-theme="dark"] #exitGuard .eg-card{background:var(--d-bg-surface,#1B2E29);' +
        'color:var(--d-fg-1,#E7EDE9);border-color:var(--d-line,rgba(255,255,255,.12))}' +
      '[data-theme="dark"] #exitGuard h2{color:var(--d-fg-heading,#DCEAE3)}' +
      '[data-theme="dark"] #exitGuard p{color:var(--d-fg-2,#9BAAA3)}' +
      '[data-theme="dark"] #exitGuard .eg-stay{background:var(--d-teal-stroke,#8FCFC3);' +
        'color:var(--d-bg-page,#142320)}' +
      '[data-theme="dark"] #exitGuard a.eg-signin{color:var(--d-teal-stroke,#8FCFC3);' +
        'border-color:var(--d-teal-stroke,#8FCFC3)}' +
      '[data-theme="dark"] #exitGuard .eg-go{color:var(--d-fg-2,#9BAAA3);' +
        'border-color:var(--d-line,rgba(255,255,255,.12))}' +
      '[data-theme="dark"] #exitGuard .eg-go:hover{color:var(--d-fg-1,#E7EDE9);' +
        'border-color:var(--d-fg-2,#9BAAA3)}';
    var style = doc.createElement('style');
    style.id = 'exitGuardStyles';
    style.textContent = css;
    doc.head.appendChild(style);
  }

  function build() {
    if (dialog) return dialog;
    injectStyles();

    dialog = doc.createElement('dialog');
    dialog.id = 'exitGuard';
    dialog.innerHTML =
      '<div class="eg-card">' +
        '<h2 id="egTitle"></h2>' +
        '<p id="egBody"></p>' +
        '<div class="eg-actions">' +
          '<button type="button" class="eg-go" id="egGo"></button>' +
          '<a class="eg-btn eg-signin" id="egSignIn" hidden>Sign in first</a>' +
          '<button type="button" class="eg-stay" id="egStay">Stay on this page</button>' +
        '</div>' +
      '</div>';
    dialog.setAttribute('aria-labelledby', 'egTitle');
    dialog.setAttribute('aria-describedby', 'egBody');
    doc.body.appendChild(dialog);

    dialog.querySelector('#egStay').addEventListener('click', function () {
      pendingGo = null;
      dialog.close();
    });

    dialog.querySelector('#egGo').addEventListener('click', function () {
      var go = pendingGo;
      pendingGo = null;
      leaving = true;
      dialog.close();
      if (go) go();
    });

    // Signing in IS leaving, chosen deliberately. Close the dialog and let the
    // link navigate on its own — `leaving` stops the back trap and any later
    // handler treating this as an exit to be questioned a second time.
    dialog.querySelector('#egSignIn').addEventListener('click', function () {
      pendingGo = null;
      leaving = true;
      dialog.close();
    });

    // ⚠️ Escape closes a native dialog without firing either button, so
    // "cancel" must mean STAY rather than falling through to the navigation.
    // Dismissing a warning is not consent to the thing it warned about.
    dialog.addEventListener('cancel', function () { pendingGo = null; });

    return dialog;
  }

  /* ⚠️ THE GUEST COPY OFFERS BEFORE IT WARNS, AND THE ORDER IS THE POINT.
     progress.js's showGuestNotice() has already said "not being saved" once, at
     the first save that did not happen — early, cheap to shrug off, and purely
     informational. This is not that message again. It fires when the reader has
     something to lose and an actual decision in front of them, and for someone
     near the end the best outcome is not an account, it is FINISHING.

     So the invitation comes first and the consequence second. An earlier draft
     led with "Leave now and your next visit starts from the top", which argued
     for signing in while the emphasised button argued for staying — the copy and
     the default action pulling opposite ways. If this text is ever rewritten,
     keep it agreeing with whichever button is primary. */
  var COPY = {
    guest: {
      title: 'Leave without keeping your place?',
      body: 'Nothing here is being kept while you are signed out — not where ' +
            'you have got to, not your answers. If you are close to the end, a ' +
            'few more minutes finishes it. Otherwise your next visit starts ' +
            'from the top.',
      go: 'Leave anyway'
    },
    account: {
      title: 'Your place is saved',
      body: 'You are signed in, so where you have got to on this page is ' +
            'already saved. Come back whenever you like and you will pick up ' +
            'from here.',
      // ⚠️ NOT "Continue". Next to "Stay on this page", that reads equally as
      // "continue leaving" and "continue reading" — the two opposite things this
      // dialog exists to separate. A leave button says leave.
      go: 'Leave the page'
    }
  };

  function open(onLeave) {
    var d = build();
    var who = mode();
    var copy = COPY[who];

    d.querySelector('#egTitle').textContent = copy.title;
    d.querySelector('#egBody').textContent = copy.body;
    d.querySelector('#egGo').textContent = copy.go;

    // ⚠️ Built HERE, on activation, never once at page load. `returnParam()`
    // encodes the current scroll position, so an href frozen at paint sends the
    // reader back to offset 0 — the exact defect CLAUDE.md records twice
    // against the nav's own sign-in control.
    var signIn = d.querySelector('#egSignIn');
    if (who === 'guest') {
      var nav = global.AmplifiedNav;
      var href = nav && nav.root ? nav.root('sign-in/') : '/sign-in/';
      if (nav && nav.returnParam) href += nav.returnParam();
      signIn.setAttribute('href', href);
      signIn.hidden = false;
    } else {
      signIn.hidden = true;
    }

    pendingGo = onLeave;
    asked = true;
    d.showModal();

    // ⚠️ FOCUS THE SAFE OPTION, EXPLICITLY. A native dialog focuses the first
    // focusable descendant, and in this layout that is "Leave anyway" — the
    // buttons sit in DOM order Leave · Sign in · Stay so that flex-end puts the
    // primary on the right. Left alone, opening the dialog and pressing Enter
    // leaves the page: the guard would hand its own default to the one outcome
    // it exists to make deliberate. Measured, not assumed — activeElement came
    // back as `egGo`.
    var stay = d.querySelector('#egStay');
    if (stay) stay.focus();
  }

  /* ── links that leave the page ─────────────────────────────────────────── */

  // In-page movement is not leaving: the nav rail, Prev/Next, the skip link and
  // every other `#anchor` resolve to this same document. They are excluded by
  // comparing the resolved path, not by listing classes — a class list would go
  // stale the first time a page grew a new control, and fail open.
  function isSamePage(url) {
    return url.origin === global.location.origin &&
           url.pathname === global.location.pathname &&
           url.search === global.location.search;
  }

  // The anchor this event would leave the page by, or null. Shared by the click
  // handler and the engagement gate so the two can never disagree about what
  // counts as leaving — one definition, per the rule at the top of this file.
  function exitAnchorFor(target) {
    var a = target && target.closest ? target.closest('a[href]') : null;
    if (!a) return null;
    if (a.target && a.target !== '_self') return null;   // opens elsewhere
    if (a.hasAttribute('download')) return null;

    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#') return null;
    if (/^(javascript|mailto|tel|sms):/i.test(raw)) return null;

    var url;
    try { url = new global.URL(a.href, global.location.href); } catch (err) { return null; }
    return isSamePage(url) ? null : a;
  }

  doc.addEventListener('click', function (e) {
    // A modified click opens a new tab or window, so this page is not going
    // anywhere and there is nothing to warn about.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey) return;

    // ⚠️ NEVER GUARD THE DIALOG'S OWN CONTROLS. "Sign in first" is an ordinary
    // link that leaves the page, so `exitAnchorFor()` matches it like any other
    // — and this handler was cancelling the click and trying to re-open a
    // dialog that was already open, so the button did nothing at all. The guard
    // was blocking its own way out. Anything inside the dialog has already been
    // through the question and must be allowed to act on the answer.
    if (dialog && dialog.contains(e.target)) return;

    if (!ready()) return;

    var a = exitAnchorFor(e.target);
    if (!a) return;

    e.preventDefault();
    open(function () { global.location.href = a.href; });
  }, true);

  /* ── the back button ───────────────────────────────────────────────────────
     ⚠️ THIS IS THE FRAGILE HALF, and it is fragile by nature rather than by
     implementation. A page cannot observe a back press; it can only push a
     spare history entry and notice that entry being popped. Consequences worth
     knowing before touching it:

       · The FORWARD button cannot be covered at all. Forward only exists after
         a back, and the guard consumes the entry a forward press would return
         to. Asked for, not deliverable.
       · A reader who presses back and chooses to stay has spent one back press
         doing nothing. That is the cost of the pattern.
       · It is armed only once engaged, so a quick in-and-out leaves history
         untouched and back behaves exactly as normal.

     If this ever reads as hostile in use, delete this block. The link half above
     carries most of the value and none of this. */
  var trapped = false;

  // Whether the gate has already been spent is ready()'s job — the caller below
  // checks it before arming. (This line once named an undeclared `spent`, which
  // threw a ReferenceError from the capture-phase listener on every click and
  // keypress, so the trap never armed at all. node --check cannot see that.)
  function armBackTrap() {
    if (trapped || !engaged) return;
    trapped = true;
    try { global.history.pushState({ exitGuard: 1 }, ''); } catch (err) { trapped = false; }
  }

  // One listener, two jobs. Interacting with the page counts as engagement —
  // the only signal a fixed-viewport primer deck can produce — EXCEPT on a link
  // that leaves, which must not arm the gate that is about to judge it. The
  // back trap then arms lazily off the same signal, so history is only touched
  // for a reader who is actually reading.
  ['pointerdown', 'keydown'].forEach(function (evt) {
    doc.addEventListener(evt, function (e) {
      if (!engaged && !exitAnchorFor(e.target)) engage();
      if (ready()) armBackTrap();
    }, true);
  });

  global.addEventListener('popstate', function () {
    if (!trapped) return;
    trapped = false;

    if (!ready()) return;   // spent, or leaving on purpose: let it go

    // Put the entry back so the page stays put while the question is asked.
    try { global.history.pushState({ exitGuard: 1 }, ''); trapped = true; } catch (err) {}

    open(function () {
      trapped = false;
      // Two entries to unwind: the one just re-pushed, and the original.
      global.history.go(-2);
    });
  });
})(window);
