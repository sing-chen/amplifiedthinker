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

  global.AmplifiedAuthPages = { breachedMessage: breachedMessage };
})(window);
