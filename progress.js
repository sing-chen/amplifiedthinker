// Shared progress persistence for skill pages (primer decks and full plans).
//
// Storage only. Each page still owns the mapping between its own DOM and the
// stored shape, because that part is genuinely page-specific. This module is
// the seam that becomes a Supabase call later, so keep page logic out of it.
//
// The storage keys match what shipped before this module existed and must not
// change — `amplified_plan_<slug>` and `amplified_primer_<slug>`. Changing the
// naming would silently orphan the progress of everyone who already has some.

(function (global) {
  'use strict';

  var PREFIX = 'amplified_';

  // Skill pages live at skills/<slug>/{plan,primer}.html at any depth, and are
  // opened over http(s) and file:// alike, so match on the tail of the path.
  var PAGE_RE = /\/skills\/([^/]+)\/(plan|primer)(?:\.html)?$/;

  function storageKey(kind, slug) {
    return PREFIX + kind + '_' + slug;
  }

  // Every operation fails silently. localStorage throws in private browsing and
  // when the quota is full, and neither is worth breaking the page over —
  // losing saved progress is recoverable, an exception mid-render is not.
  function createStore(kind, slug) {
    var key = storageKey(kind, slug);

    return {
      key: key,
      kind: kind,
      slug: slug,

      save: function (data) {
        try {
          global.localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {}
      },

      load: function () {
        try {
          var raw = global.localStorage.getItem(key);
          if (!raw) return null;
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      },

      clear: function () {
        try {
          global.localStorage.removeItem(key);
        } catch (e) {}
      }
    };
  }

  // Returned when the path is not a skill page. Keeps callers working rather
  // than throwing — same reasoning as the try/catch above.
  function createNullStore() {
    return {
      key: null,
      kind: null,
      slug: null,
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
    forPage: forPage
  };
})(window);
