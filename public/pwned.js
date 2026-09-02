// Refuses passwords that already appear in a public breach corpus.
//
// Loaded ONLY by the two auth surfaces — /sign-in/ and /account/ — not from
// nav.js. It has no reader on the other 17 pages, and this is the same call
// auth-pages.css makes for the same reason.
//
// ── Why this exists in the page at all ────────────────────────────────────
//
// Supabase has a server-side version of exactly this ("Prevent the use of
// leaked passwords", HaveIBeenPwned). It is **Pro plan and above**, confirmed
// 2026-08-19, and this project is not on Pro. See BACKLOG.md — if the plan is
// ever upgraded, that toggle supersedes this file and this file should go.
//
// ⚠️ THIS IS ADVISORY, NOT ENFORCED, and the distinction must not be blurred in
// any copy written around it. It runs in the browser, so devtools defeats it in
// seconds. That is acceptable here and would not be in most places, because of
// WHO it protects: this control defends a user against their own password
// choice, not the site against a hostile user. Nobody bypasses it in order to
// attack themselves. A server-side check would additionally stop a scripted
// client — which is why the Supabase setting is still the better answer, and
// why the backlog entry stays open rather than being closed by this file.
//
// ── The privacy property, which is the whole reason this is safe to do ────
//
// The password never leaves the browser, and neither does its full hash. Only
// the FIRST FIVE characters of the SHA-1 are sent; the API answers with every
// suffix it holds under that prefix — typically several hundred — and the
// comparison happens here. This is HaveIBeenPwned's k-anonymity range API and
// it is the only form of this check that may ever be built.
//
// ⚠️ Never replace this with an endpoint that takes a whole password or a whole
// hash, however much simpler the API looks. There is no version of "send the
// user's password to a third party to see if it is any good" that is
// acceptable, and the simpler-looking APIs are exactly that.
//
// SHA-1 is used because that is what the corpus is indexed by. It is not being
// relied on for security here — nothing is stored, and a preimage attack on a
// hash we transmit five characters of has nothing to win.
(function (global) {
  'use strict';

  var ENDPOINT = 'https://api.pwnedpasswords.com/range/';

  // Short on purpose. This sits in front of the submit button on sign-up, so
  // the cost of a slow answer is paid by someone waiting to create an account.
  // Better to give up and let them through than to hold the form.
  var TIMEOUT_MS = 3500;

  function hex(buffer) {
    var view = new Uint8Array(buffer);
    var out = '';
    for (var i = 0; i < view.length; i++) {
      out += (view[i] < 16 ? '0' : '') + view[i].toString(16);
    }
    return out.toUpperCase();
  }

  function sha1(text) {
    // ⚠️ crypto.subtle exists only in a SECURE CONTEXT. Both production origins
    // are https and localhost counts as secure, so this holds everywhere the
    // site actually runs — but it is absent over plain http on a LAN address,
    // which is how someone testing from a phone on the same network would hit
    // it. That path fails open, like every other failure here.
    if (!global.crypto || !global.crypto.subtle || !global.TextEncoder) {
      return Promise.reject(new Error('no subtle crypto'));
    }
    return global.crypto.subtle
      .digest('SHA-1', new global.TextEncoder().encode(text))
      .then(hex);
  }

  function fetchRange(prefix) {
    var controller = global.AbortController ? new global.AbortController() : null;
    var timer = global.setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT_MS);

    return global.fetch(ENDPOINT + prefix, {
      // No credentials, no referrer. Nothing about this request should carry
      // anything identifying — the point is that the far end learns only that
      // *somebody* asked about a five-character prefix.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      global.clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    }, function (err) {
      global.clearTimeout(timer);
      throw err;
    });
  }

  /**
   * Resolves { checked, breached, count }.
   *
   * ⚠️ `checked: false` means THE QUESTION WAS NOT ANSWERED — offline, blocked,
   * timed out, insecure context. It is never a pass. Callers must treat it as
   * "carry on" rather than "this password is fine", and must not tell the user
   * anything reassuring about a check that did not run.
   *
   * This fails OPEN by design. The alternative is that an ad blocker, a
   * corporate proxy or a flaky connection stops someone creating an account at
   * all — a certain harm, traded against a probabilistic one. The site already
   * makes the opposite trade for Turnstile, deliberately: that one guards the
   * site against abuse and must fail closed. This one guards the user, and the
   * user is not helped by being locked out.
   */
  function check(password) {
    var miss = { checked: false, breached: false, count: 0 };
    if (!password || !global.fetch) return Promise.resolve(miss);

    return sha1(password).then(function (digest) {
      var prefix = digest.slice(0, 5);
      var suffix = digest.slice(5);

      return fetchRange(prefix).then(function (body) {
        var lines = body.split('\n');
        for (var i = 0; i < lines.length; i++) {
          var parts = lines[i].split(':');
          if (parts[0] && parts[0].trim().toUpperCase() === suffix) {
            return {
              checked: true,
              breached: true,
              count: parseInt(parts[1], 10) || 0
            };
          }
        }
        return { checked: true, breached: false, count: 0 };
      });
    }).then(null, function () { return miss; });
  }

  /**
   * The sentence shown when `breached` is true.
   *
   * ⚠️ The load-bearing half is "not about this site". Someone told their
   * password is compromised while creating an account will reasonably assume
   * the site is telling them IT has been breached, or is accusing them of
   * something. Neither is true, and the correct reading — this password is on a
   * public list, wherever it leaked from — is the one that gets it changed
   * everywhere else too.
   *
   * The count is included because scale is what makes it land: "found in a
   * breach" sounds theoretical, "seen 4,700 times" does not.
   *
   * ⚠️ "NEVER SENT ANYWHERE" IS HERE RATHER THAN ON THE FORM, AND THAT IS A
   * DELIBERATE MOVE, NOT A DELETION. The sign-up form used to carry "Checked
   * against passwords exposed in known breaches. It never leaves your browser."
   * as standing help text, which spent a line pre-empting a question nobody has
   * yet — most passwords are not breached and most readers never see this
   * message at all.
   *
   * But the moment someone IS told their password is on a public list, "so you
   * sent my password somewhere to find that out?" is the immediate and
   * reasonable next thought, and it is alarming. Answering it in the rejection
   * puts the answer where the question actually arises. privacy.html §7
   * documents the k-anonymity mechanism in full for anyone who wants it.
   */
  function message(result) {
    var scale = result.count > 1
      ? ' It has turned up ' + result.count.toLocaleString() + ' times.'
      : '';
    return 'This password has appeared in a public data breach, so it is ' +
           'already on lists that attackers try.' + scale +
           ' Nothing has happened to this site or your account, and your ' +
           'password was never sent anywhere — the check runs inside your ' +
           'browser. Please pick a different one, and change it anywhere else ' +
           'you have used it.';
  }

  global.AmplifiedPwned = { check: check, message: message };
})(window);
