// Session state for the whole site, and the auth control in the nav.
//
// Loaded by nav.js on every page, after supabase.min.js and supabase-client.js.
// Guests are the common case, so nothing here may throw on a page where
// Supabase is unreachable, unconfigured, or blocked — every path degrades to
// "signed out" and the page carries on.
//
// Mined from src/pages/auth-test.astro, the Phase 3 scaffold: session handling,
// onAuthStateChange, and the selfUrl() redirect fix all started there. That page
// is deleted at the end of Phase 5, once everything it proved lives here.
//
// ⚠️ The Turnstile widget is deliberately NOT loaded here. It belongs on the
// sign-in surface only. Loading it from the nav would add a third-party request
// to challenges.cloudflare.com on all 16 pages for every guest; scoped to one
// page, a network that blocks that host costs account creation and nothing else.

(function (global) {
  'use strict';

  var client = null;
  var session = null;
  var ready = false;
  var listeners = [];
  var adminCache = null;

  function nav() {
    return global.AmplifiedNav || null;
  }

  // This page's own URL, with any query string or fragment stripped.
  //
  // ⚠️ NEVER pass window.location.href as a redirect target. This is the Phase 4
  // defect, found by clicking a real password-reset link, and it is invisible on
  // a first test.
  //
  // After the first auth round-trip on a page, supabase-js consumes the token
  // and tidies the address bar, leaving a bare trailing '#'. That '#' travels
  // into the next redirectTo, Supabase appends its own fragment, and the result
  // is '##access_token=...'. supabase-js reads the fragment as url.split('#')[1],
  // which for a double hash is the empty string — so it parses zero parameters
  // and never sees the token.
  //
  // Nothing errors. No failed request, no console message, and the redirect
  // lands on exactly the right origin with the allowlist honoured. The only
  // symptom is that the page keeps showing the PREVIOUS session, which reads as
  // a stale render rather than a broken auth flow. Only the second auth action
  // on a page load fails, so any test that reloads between steps misses it.
  function selfUrl() {
    return global.location.origin + global.location.pathname;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](session); } catch (e) {}
    }
  }

  function setSession(next) {
    var changedUser = (next && next.user && next.user.id) !== (session && session.user && session.user.id);
    session = next || null;
    if (changedUser) adminCache = null;
    renderNavAuth();
    notify();
  }

  // ---- rendering the nav control ----------------------------------------

  // The first name captured at sign-up, or null. Accounts created before
  // 2026-08-19 have none and every caller has to cope with that.
  function displayName() {
    var meta = session && session.user && session.user.user_metadata;
    var name = meta && meta.display_name;
    return (name && String(name).trim()) || null;
  }

  function email() {
    return (session && session.user && session.user.email) || '';
  }

  // nav.js owns the slot and its CSS; this only fills it. Kept to innerHTML on
  // one element so it cannot disturb the surrounding nav, which is the file
  // every page on the site depends on.
  function renderNavAuth() {
    var slot = global.document.getElementById('snav-auth');
    if (!slot) return;

    var n = nav();
    if (!n) return;

    // ⚠️ Leave the slot exactly as found until the real session is known.
    //
    // nav.js has already painted it from the session it read out of
    // localStorage, before this library was even fetched. Blanking it here
    // would undo that and produce the flicker the deferred load exists to
    // avoid — the avatar appearing, vanishing, then reappearing.
    if (!ready) return;

    if (!session) {
      slot.innerHTML =
        '<a class="snav-auth-signin" href="' + n.root('sign-in/') + '">Sign in</a>';
      return;
    }

    // ⚠️ The letter and the tooltip come from nav.js, which already painted this
    // slot from the stored session before the library loaded. Deriving them
    // again here would let the two drift, and the symptom would be the avatar
    // changing character a moment after every page load.
    var name = displayName();

    // "Hi Sing" rather than the address. Someone reading their own dropdown
    // knows their email; what they want to see is that the site knows who they
    // are. The address falls back in for accounts with no name.
    var greeting = name ? 'Hi ' + name : email();

    slot.innerHTML =
      '<button type="button" class="snav-auth-avatar" id="snav-auth-avatar"' +
      ' aria-expanded="false" aria-haspopup="true"' +
      ' title="' + escapeAttr(n.labelFor(name, email())) + '">' +
      escapeHtml(n.initialFor(name, email())) + '</button>' +
      '<div class="snav-auth-menu" id="snav-auth-menu" hidden>' +
      '  <p class="snav-auth-email">' + escapeHtml(greeting) + '</p>' +
      '  <a href="' + n.root('account/') + '">Account</a>' +
      '  <button type="button" id="snav-auth-signout">Sign out</button>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function escapeAttr(s) { return escapeHtml(s); }

  // Delegated on document, matching how nav.js handles its own menu and theme
  // toggle. That pattern exists because the Primer page's deck bundle replaces
  // body children on init and wipes the nav; a handler bound to the button
  // itself would die with it.
  function wireNavAuth() {
    if (global.__amplifiedAuthNavInit) return;
    global.__amplifiedAuthNavInit = true;

    global.document.addEventListener('click', function (e) {
      var avatar = e.target.closest && e.target.closest('#snav-auth-avatar');
      var menu = global.document.getElementById('snav-auth-menu');

      if (avatar && menu) {
        var open = menu.hasAttribute('hidden');
        if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
        avatar.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      if (e.target.closest && e.target.closest('#snav-auth-signout')) {
        signOut();
        return;
      }

      if (menu && !menu.hasAttribute('hidden') && !e.target.closest('.snav-auth')) {
        menu.setAttribute('hidden', '');
        var a = global.document.getElementById('snav-auth-avatar');
        if (a) a.setAttribute('aria-expanded', 'false');
      }
    });

    global.document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var menu = global.document.getElementById('snav-auth-menu');
      if (menu && !menu.hasAttribute('hidden')) {
        menu.setAttribute('hidden', '');
        var a = global.document.getElementById('snav-auth-avatar');
        if (a) { a.setAttribute('aria-expanded', 'false'); a.focus(); }
      }
    });

    // nav.js re-injects the whole nav if the Primer bundle wipes it, which
    // leaves an empty auth slot behind. It announces every injection so this
    // can refill it.
    global.document.addEventListener('amplified:nav-injected', renderNavAuth);
  }

  // ---- auth actions ------------------------------------------------------

  function fail(message) {
    return Promise.resolve({ error: { message: message } });
  }

  // `displayName` rides along in raw_user_meta_data, where the Phase 3 signup
  // trigger already looks for it — `display_name`, then `full_name`, then
  // `name` — and copies it into profiles.display_name. No migration, and no
  // second write from the client, which would have needed an INSERT policy on
  // profiles that deliberately does not exist.
  //
  // It is also what makes the auth emails addressable: Supabase templates read
  // the same metadata as {{ .Data.display_name }}.
  // `wantsUpdates` is consent to site-update email, and it is sent as a real
  // boolean ALWAYS — including when it is false.
  //
  // ⚠️ Do not "tidy" this into the `if (displayName)` shape above. Omitting the
  // key when unticked and sending it when ticked would look equivalent, and is
  // not: handle_new_user() stamps `updates_consent_at` on the key's PRESENCE,
  // so an omitted key means "never asked" while `false` means "asked, and
  // declined". A declined answer is a record worth keeping — it is the evidence
  // that the box was not pre-ticked.
  function signUp(email, password, captchaToken, displayName, wantsUpdates) {
    if (!client) return fail('Sign-up is unavailable on this page right now.');

    var data = { wants_updates: Boolean(wantsUpdates) };
    if (displayName) data.display_name = String(displayName).slice(0, 60);

    return client.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: selfUrl(),
        captchaToken: captchaToken,
        data: data
      }
    });
  }

  function signIn(email, password, captchaToken) {
    if (!client) return fail('Sign-in is unavailable on this page right now.');
    return client.auth.signInWithPassword({
      email: email,
      password: password,
      options: { captchaToken: captchaToken }
    });
  }

  function resetPassword(email, captchaToken) {
    if (!client) return fail('Password reset is unavailable on this page right now.');
    return client.auth.resetPasswordForEmail(email, {
      redirectTo: selfUrl(),
      captchaToken: captchaToken
    });
  }

  // Changes the password AND ends every other session.
  //
  // ⚠️ The second half is the point, not a tidy-up. `updateUser` leaves sibling
  // refresh tokens alive, so without this the one action someone takes BECAUSE
  // they think another person has access does not remove that access — the
  // stolen laptop stays signed in until its token expires on its own. Changing
  // a password that does not evict anyone is a false sense of having acted.
  //
  // Resolves { error, othersSignedOut }. The flag exists so the page can avoid
  // claiming something that did not happen: if the revocation fails, the
  // password HAS still changed, and reporting that as a failed password change
  // would be worse than the missed revocation. So it never turns into an error
  // — it turns into different words.
  function updatePassword(password) {
    if (!client) return fail('Not connected.');
    return client.auth.updateUser({ password: password }).then(function (r) {
      if (r.error) return { error: r.error, othersSignedOut: false };

      // ⚠️ 'others' fires NO SIGNED_OUT event, per Supabase's docs — which is
      // exactly what this page needs. A global sign-out here would drop the
      // current session and bounce the user out of the page that just told
      // them it worked.
      return client.auth.signOut({ scope: 'others' }).then(
        function (o) { return { error: null, othersSignedOut: !o || !o.error }; },
        function () { return { error: null, othersSignedOut: false }; }
      );
    });
  }

  // ⚠️ `scope` is passed EXPLICITLY because supabase-js defaults it to
  // 'global' — signing out here would otherwise end the session on the user's
  // phone and every other device too. That is a reasonable default for a
  // library and a bad one for a button labelled "Sign out": leaving a shared
  // computer should not log you out of your own.
  //
  // Callers that genuinely mean everywhere pass 'global' and say so.
  function signOut(scope) {
    if (!client) return Promise.resolve();
    return client.auth.signOut({ scope: scope || 'local' });
  }

  // Proves the person at the keyboard is the account holder, immediately before
  // something irreversible. Uses the same password sign-in as the front door,
  // because Supabase has no "verify this password" endpoint — and the point is
  // the side effect: a successful call stamps a fresh `password` entry into the
  // session's `amr` claim, which is what the database checks.
  //
  // ⚠️ The captcha token is not optional. Supabase's bot protection covers
  // sign-in, so this fails with a captcha error without one — which reads as a
  // wrong password if the caller does not know to pass it.
  function reauthenticate(password, captchaToken) {
    if (!client) return fail('Not connected.');
    if (!session || !session.user || !session.user.email) {
      return fail('You need to be signed in to do that.');
    }
    return client.auth.signInWithPassword({
      email: session.user.email,
      password: password,
      options: { captchaToken: captchaToken }
    });
  }

  // Irreversible. Calls the SECURITY DEFINER function added in
  // 20260819080000_delete_own_account.sql and hardened in 20260819120000 — see
  // those files for what cascades, what survives, and why the database checks
  // the sign-in recency itself rather than trusting the page to have asked.
  // Returns { error } like every other action here.
  //
  // ⚠️ The sign-out afterwards is not tidiness. A JWT is stateless: the access
  // token in this tab stays syntactically valid until it expires, so without
  // this the browser keeps presenting a token for a user that no longer exists.
  // Every request then fails in a way that reads as a bug rather than as a
  // deleted account. The refresh token is gone with the user, so nothing can
  // renew it — the session is already dead, it just does not know yet.
  function deleteAccount() {
    if (!client) return fail('Not connected.');
    if (!session) return fail('You need to be signed in to do that.');

    return client.rpc('delete_own_account').then(function (r) {
      if (r.error) return { error: r.error };
      // ⚠️ 'global' spelled out, and NOT routed through signOut() above, which
      // defaults to 'local'. Every session belonging to this account should die
      // — though in practice they already have, since the user row is gone.
      // That is also why the failure is swallowed: this call routinely comes
      // back 403 `User from sub claim in JWT does not exist`, which is the
      // deletion having worked rather than anything going wrong.
      return client.auth.signOut({ scope: 'global' }).then(
        function () { return { error: null }; },
        function () { return { error: null }; }   // the account is gone regardless
      );
    }, function (e) {
      return { error: { message: e && e.message ? e.message : 'Could not reach the server.' } };
    });
  }

  // Nothing consumes this until Phase 7. Fetched lazily and cached per user, so
  // an ordinary page load never pays for it.
  //
  // ⚠️ A permission error here is not necessarily about admin. profiles carries
  // two permissive SELECT policies and permissive policies are OR-ed, so the
  // admin branch is evaluated for every caller — meaning a missing EXECUTE grant
  // on is_admin() breaks reading your OWN row, with error 42501 either way.
  // Phase 3 finding 12.
  function isAdmin() {
    if (!client || !session) return Promise.resolve(false);
    if (adminCache !== null) return Promise.resolve(adminCache);

    return client
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(function (r) {
        adminCache = Boolean(!r.error && r.data && r.data.is_admin);
        return adminCache;
      })
      .catch(function () { return false; });
  }

  // ---- site-update email consent -----------------------------------------
  //
  // Read from and written to `profiles`, NOT to `raw_user_meta_data`. Sign-up
  // uses the metadata route because there is no profile row yet at that point —
  // handle_new_user() copies the answer across — but once the row exists,
  // profiles is the single place that holds it. Writing both would give two
  // stores that disagree the first time one write fails, and the trigger only
  // reads metadata on INSERT, so a later metadata change would never arrive.
  //
  // ⚠️ Deliberately NOT cached, unlike isAdmin(). This value is one the reader
  // just changed and expects to see reflected; a stale cache on a consent
  // control is the kind of bug that has someone convinced they unsubscribed
  // when they did not.

  function getUpdatePreference() {
    if (!client || !session) return Promise.resolve({ error: null, wantsUpdates: false });

    return client
      .from('profiles')
      .select('wants_updates')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(function (r) {
        if (r.error) return { error: r.error, wantsUpdates: false };
        return { error: null, wantsUpdates: Boolean(r.data && r.data.wants_updates) };
      })
      .catch(function (e) {
        return { error: { message: e && e.message ? e.message : 'Could not reach the server.' }, wantsUpdates: false };
      });
  }

  // Only the boolean is sent. `updates_consent_at` is maintained by a database
  // trigger, because a consent record the data subject can set themselves is
  // not evidence of anything.
  function setUpdatePreference(wantsUpdates) {
    if (!client || !session) return Promise.resolve({ error: { message: 'You are not signed in.' } });

    return client
      .from('profiles')
      .update({ wants_updates: Boolean(wantsUpdates) })
      .eq('id', session.user.id)
      .then(function (r) { return { error: r.error || null }; })
      .catch(function (e) {
        return { error: { message: e && e.message ? e.message : 'Could not reach the server.' } };
      });
  }

  // ---- lifecycle ---------------------------------------------------------

  function onAuthChange(fn) {
    listeners.push(fn);
    if (ready) { try { fn(session); } catch (e) {} }
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function init() {
    wireNavAuth();
    renderNavAuth();

    client = global.AmplifiedSupabase ? global.AmplifiedSupabase.getClient() : null;

    if (!client) {
      // Unconfigured, blocked, or file:// — settle as signed out so callers
      // waiting on ready() are not left hanging forever.
      ready = true;
      renderNavAuth();
      notify();
      return;
    }

    client.auth.getSession().then(function (r) {
      ready = true;
      setSession(r.data ? r.data.session : null);
    }, function () {
      ready = true;
      setSession(null);
    });

    client.auth.onAuthStateChange(function (_event, next) {
      ready = true;
      setSession(next);
    });
  }

  global.AmplifiedAuth = {
    // State. `session()` is null both for a genuine guest and before the first
    // check completes, so anything that must distinguish the two waits on
    // onAuthChange rather than reading it once.
    session: function () { return session; },
    user: function () { return session ? session.user : null; },
    isReady: function () { return ready; },
    isSignedIn: function () { return Boolean(session); },
    client: function () { return client; },
    displayName: displayName,

    onAuthChange: onAuthChange,
    isAdmin: isAdmin,
    getUpdatePreference: getUpdatePreference,
    setUpdatePreference: setUpdatePreference,

    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    reauthenticate: reauthenticate,
    deleteAccount: deleteAccount,

    // Exported because every surface that redirects must use it. See the
    // comment on the function: the natural way to write this is the broken way.
    selfUrl: selfUrl
  };

  if (global.document.body) init();
  else global.document.addEventListener('DOMContentLoaded', init);
})(window);
