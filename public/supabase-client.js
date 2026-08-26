// Creates the one Supabase client the site shares, and decides which project
// it points at.
//
// Loaded as a plain <script> by pages that have no build step, so everything
// here is decided at RUNTIME. That is the standing constraint this project
// keeps rediscovering: only one of the two production origins has a build you
// control, so anything that must work on both has to decide in the browser.
//
// The URL and publishable key below are PUBLIC BY DESIGN. They ship in the
// browser on every page that talks to Supabase, and RLS is the actual security
// boundary — see docs/dev-workflow.md. Committing them is not a leak.
//
// The service_role key is a completely different matter. It bypasses RLS
// entirely, so one line with it undoes every policy in the Phase 3 migration.
// It never belongs in any file under public/, including this one.
//
// VENDORED LIBRARY: public/supabase.min.js is @supabase/supabase-js 2.112.3,
// the UMD build, taken byte-for-byte from
//   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js
// It is deliberately unmodified, so it can be re-fetched and compared. Updating
// it is a deliberate act: download the new version, re-run the gates, and change
// the number here. Same convention as fuse.min.js.

(function (global) {
  'use strict';

  // Each environment carries its Turnstile sitekey alongside its project,
  // because the two are a pair: a Supabase project stores exactly one captcha
  // secret, so it can only ever verify tokens from one widget. Splitting them
  // across files is how they drift.
  var PROJECTS = {
    prod: {
      url: 'https://spehmrgmcdenqdftkyrt.supabase.co',
      key: 'sb_publishable_6dH7WjyaE3Unj_q7C4PhIw_1ebh8auC',
      // Widget `amplifiedthinker-prod`: amplifiedthinker.com — and still
      // sing-chen.github.io, which was retired on 2026-08-26. ⚠️ That hostname
      // is listed in the CLOUDFLARE DASHBOARD, not here, so removing it is a
      // manual step nothing in this repo can do or verify. Tracked in
      // supabase/README.md alongside the redirect allowlist.
      // Never vercel.app — that is a public suffix, and listing it would let any
      // site on it mint tokens for our signup endpoint.
      turnstileSiteKey: '0x4AAAAAAET7pUAhEavY48Lf'
    },
    dev: {
      url: 'https://yirsvthwffoetcrgbevj.supabase.co',
      key: 'sb_publishable_Oxo00-UqR2kMLkJbP54z1w_mNYwXhJY',
      // Widget `amplifiedthinker-dev`: localhost, vercel.app.
      turnstileSiteKey: '0x4AAAAAAET7OHjubdQvZFl8'
    }
  };

  // ⚠️ BLOCKLIST NON-PRODUCTION. Do not rewrite this as
  // `isProd = /amplifiedthinker\.com$/.test(hostname)`.
  //
  // It looks correct and it is the shape about.html originally used, but it
  // classified the GitHub Pages origin as non-production — so every user who
  // reached the site there would have read and written the DEV database. Their
  // progress would appear to save and then be missing from the real site.
  //
  // ⚠️ THAT ORIGIN WAS RETIRED ON 2026-08-26, AND THE RULE DOES NOT RELAX WITH
  // IT. The example is gone; the reasoning is not. Allowlisting production
  // means every new production origin is a bug waiting to happen. Blocklisting
  // non-production fails safe: a forgotten preview host reading production data
  // is far less damaging than a real user writing to a scratch database. Phase 0
  // caught this five phases before it could bite, and the next origin — a custom
  // domain, a staging host — arrives with the same trap already disarmed.
  function environment() {
    var host = global.location.hostname;
    var isNonProd = /\.vercel\.app$/.test(host) ||
                    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
    return isNonProd ? 'dev' : 'prod';
  }

  function config() {
    return PROJECTS[environment()];
  }

  function isConfigured(cfg) {
    return Boolean(cfg) && /^https:\/\//.test(cfg.url) && !/_PENDING$/.test(cfg.key);
  }

  var client = null;
  var warned = false;

  function warnOnce(message) {
    if (warned) return;
    warned = true;
    try { global.console.warn('[amplified] ' + message); } catch (e) {}
  }

  // Returns null rather than throwing whenever a client cannot be built. Every
  // caller treats null as "signed out, no sync" and falls back to the guest
  // path, which is the same fail-silent contract progress.js has always had:
  // losing sync is recoverable, an exception mid-render is not.
  function getClient() {
    if (client) return client;

    // Auth cannot work over file:// at all — there is no allowlistable origin
    // and storage is opaque — so do not create a client that could only ever
    // fail. Skill pages are genuinely opened this way; see progress.js.
    if (!/^https?:$/.test(global.location.protocol)) return null;

    var cfg = config();
    if (!isConfigured(cfg)) {
      warnOnce('the ' + environment() + ' Supabase project is not configured yet, ' +
               'so this page is running signed-out. See supabase/README.md.');
      return null;
    }

    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      warnOnce('supabase.min.js has not loaded, so no client could be created.');
      return null;
    }

    try {
      client = global.supabase.createClient(cfg.url, cfg.key);
    } catch (e) {
      warnOnce('could not create the Supabase client: ' + e.message);
      return null;
    }

    return client;
  }

  global.AmplifiedSupabase = {
    environment: environment,
    config: config,
    getClient: getClient,
    isConfigured: function () { return isConfigured(config()); }
  };
})(window);
