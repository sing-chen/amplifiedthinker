// What the two auth surfaces share that is neither styling nor the breach
// check: the password-reveal button, and the "is this password already in a
// breach" question asked before a password is CHOSEN.
//
// Loaded ONLY by /sign-in/ and /account/, next to auth-pages.css and pwned.js,
// and for the same reason those two are scoped: nothing else on the site has a
// password field, and a script every page pays for should be one every page
// uses. Until 2026-09-02 both pages carried this verbatim in their inline
// scripts, which is the arrangement that lets one copy be fixed and the other
// forgotten.
//
// Loads in <head> with the other two, and depends on nothing at parse time:
// the click handler is delegated on document, and breachedMessage() looks
// window.AmplifiedPwned up when it is called, not when this file runs.

(function (global) {
  'use strict';

  // ---- reveal a password field ------------------------------------------
  //
  // A typo in a password field is invisible. On sign-up it is worse than
  // invisible: the account is created with a password the person cannot
  // reproduce, and the only way back is a reset email.
  //
  // Delegated on document rather than bound per button, so it needs no
  // ordering against the auth stack (which nav.js appends with defer) and
  // keeps working if a panel is re-rendered.
  global.document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.auth-pw-toggle');
    if (!btn) return;

    var input = global.document.getElementById(btn.getAttribute('data-pw-for'));
    if (!input) return;

    var reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    btn.textContent = reveal ? 'Hide' : 'Show';
    // A toggle button keeps ONE accessible name and reports state through
    // aria-pressed; swapping the label as well read as "Hide password, pressed".
    btn.setAttribute('aria-pressed', reveal ? 'true' : 'false');

    // Clicking the button takes focus off the field. Put it back, caret at
    // the end, so someone mid-way through typing is not interrupted.
    var pos = input.value.length;
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (err) {}
  });

  // ---- the breach question ----------------------------------------------
  //
  // Runs only where a password is CHOSEN — sign-up, the new password after a
  // reset, and the change-password form. Never on sign-in: someone whose
  // existing password turns out to be on a list needs to get in so they can
  // change it, and refusing them at the door would lock them out of the only
  // fix.
  //
  // Resolves null to proceed, or a message to show and stop. See
  // public/pwned.js for why it fails open.
  function breachedMessage(password) {
    var p = global.AmplifiedPwned;
    if (!p) return Promise.resolve(null);
    return p.check(password).then(function (r) {
      return r.breached ? p.message(r) : null;
    });
  }

  // ---- a Turnstile widget -------------------------------------------------
  //
  // One widget per container element, returned as { render, fresh }. Both
  // auth pages had this verbatim until 2026-09-02, three traps and all:
  //
  // ⚠️ A Turnstile token is single-use AND expires after about 5 minutes.
  // Solving the challenge on page load looks tidy and is wrong: someone who
  // takes their time over the form submits a token that has already aged
  // out, and Supabase rejects it with
  //     captcha protection: request disallowed (timeout-or-duplicate)
  // which reads like a broken captcha rather than a stale one. So the widget
  // is rendered with `execution: 'execute'` — it does nothing until asked —
  // and fresh() fetches a token at the moment of submit, so every attempt
  // gets its own.
  //
  // ⚠️ RESET ONLY AFTER A PREVIOUS SOLVE. turnstile.reset() on a widget that
  // has never executed leaves it in a state where the next execute() yields a
  // token Cloudflare rejects as `timeout-or-duplicate` — which reads as "your
  // captcha is broken" and cost an hour of looking at token lifetimes. reset()
  // re-arms a spent widget; it does not initialise a fresh one.
  //
  // ⚠️ AND A 30s STALL BOUND. If an interactive challenge is shown, the
  // visitor may simply not finish it; fresh() resolves null rather than
  // leaving a submit button disabled for ever. It never rejects: the caller
  // shows a message either way.
  //
  // Depends on window.turnstile (the page decides when to load api.js) and on
  // AmplifiedSupabase.config() for the site key, both looked up at call time.
  function turnstile(selector) {
    var id = null;
    var pending = null;
    var solved = false;

    function deliver(token) {
      if (token) solved = true;
      if (pending) { var fn = pending; pending = null; fn(token); }
    }

    function render() {
      if (id !== null || !global.turnstile) return;
      var cfg = global.AmplifiedSupabase && global.AmplifiedSupabase.config();
      if (!cfg || !cfg.turnstileSiteKey || /_PENDING$/.test(cfg.turnstileSiteKey)) return;

      id = global.turnstile.render(selector, {
        sitekey: cfg.turnstileSiteKey,
        theme: global.document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        // Show nothing unless a challenge is actually required. Managed mode
        // resolves silently for most visitors, but Turnstile still reserves a
        // 73px box for a widget it never draws — measured, and it left a
        // visible hole between the password field and the button.
        appearance: 'interaction-only',
        execution: 'execute',
        callback: deliver,
        'expired-callback': function () { deliver(null); },
        'timeout-callback': function () { deliver(null); },
        'error-callback': function () { deliver(null); }
      });
    }

    function fresh() {
      return new Promise(function (resolve) {
        if (!global.turnstile || id === null) { resolve(null); return; }
        pending = resolve;
        try {
          if (solved) global.turnstile.reset(id);
          global.turnstile.execute(id);
        } catch (e) { pending = null; resolve(null); return; }
        global.setTimeout(function () {
          if (pending) { pending = null; resolve(null); }
        }, 30000);
      });
    }

    return { render: render, fresh: fresh };
  }

  // ---- what the backend said, in our words ------------------------------
  //
  // Supabase's messages are accurate and written for developers: "Invalid
  // login credentials", "User already registered", "captcha protection:
  // request disallowed (timeout-or-duplicate)". Until 2026-09-02 they reached
  // the status line verbatim. Each known one maps to a sentence a reader can
  // act on; anything unrecognised falls through as the backend wrote it,
  // because a wrong translation is worse than an ugly true one.
  var PLAIN = [
    [/invalid login credentials/i, 'That email and password do not match. Check both, or reset your password below.'],
    [/user already registered|already been registered/i, 'There is already an account for that email. Sign in instead, or reset the password if you have forgotten it.'],
    [/email not confirmed/i, 'That account has not confirmed its email yet. Use the link in the email you were sent, or ask for it again below.'],
    [/rate limit|too many requests/i, 'Too many attempts in a short time. Wait a few minutes and try again.'],
    [/captcha/i, 'The security check did not complete. Try again, and if it keeps failing, reload the page.'],
    [/new password should be different/i, 'That is the password you already have. Choose a different one.'],
    [/password should be at least|password is too short/i, 'Passwords are at least 8 characters.'],
    [/failed to fetch|network|load failed/i, 'Could not reach the server. Check your connection and try again.']
  ];
  function plainError(message) {
    var text = String(message || '');
    for (var i = 0; i < PLAIN.length; i++) if (PLAIN[i][0].test(text)) return PLAIN[i][1];
    return text || 'Something went wrong. Try again.';
  }

  global.AmplifiedAuthPages = { breachedMessage: breachedMessage, turnstile: turnstile, plainError: plainError };
})(window);
