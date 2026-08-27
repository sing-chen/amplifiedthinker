/* Amplified Thinker — what a reader's progress MEANS.
 *
 * One query, one vocabulary. This file answers "where is this person, in this
 * primer or plan" and nothing else: it owns no DOM, draws nothing, and decides
 * no layout.
 *
 * ⚠️ WHY IT IS ITS OWN FILE. Two surfaces show the same account the same facts —
 * the Future Skills page and, later, the dashboard. If "In progress" has a floor
 * on one and not the other, or one counts Explore Further and the other does not,
 * the same account reads as two different states depending on which page is open.
 * That is not a bug anyone reports; it is a site that feels untrustworthy. So the
 * definitions live here and both surfaces import them.
 *
 * ⚠️ `visited` DOES NOT MEAN THE SAME THING ON BOTH ARTEFACTS, and it never will.
 * A plan marks a section when scrolling SETTLES on it — "stopped on". A primer
 * marks a slide when the reader advances to it — "advanced to". A deck has no
 * pass-through to guard against, so there was nothing to settle. The divergence
 * is real, deliberate, and recorded in BACKLOG.md; it is written down here
 * because this is the file that would otherwise quietly paper over it.
 *
 * Loaded only for signed-in readers. A guest never fetches it.
 */
(function (global) {
  'use strict';

  var TABLE = 'skill_progress';
  var CATALOGUE_URL = 'skills-catalogue.json';

  /* ── the vocabulary ─────────────────────────────────────────────────────
     Three states, and the order of these tests is the definition.

       complete     completed_at is set. ⚠️ NOTHING ELSE MAKES SOMETHING
                    COMPLETE. Coverage reaching 100% does not, because a fast
                    scroll would then count as finishing; and completion does
                    not require full coverage, because someone who worked
                    through a plan but skipped a section is finished and should
                    not be stranded at 93% for ever. It is a control the reader
                    presses. Decided 2026-08-18, and this is where it is enforced.

       not-started  no row at all, or a row covering nothing. The two are the
                    same thing to a reader and must render identically — a row
                    can exist with zero coverage because opening a page writes
                    one before anything is seen.

       in-progress  everything else. ⚠️ No floor, on either artefact. A floor
                    ("at least 2 sections") was considered and rejected: it
                    would have to be justified per artefact, and the two count
                    different things, so any floor makes the surfaces disagree
                    about the same account — the exact failure this file exists
                    to prevent.
  ─────────────────────────────────────────────────────────────────────── */
  var COMPLETE = 'complete';
  var IN_PROGRESS = 'in-progress';
  var NOT_STARTED = 'not-started';

  function client() {
    var auth = global.AmplifiedAuth;
    return auth ? auth.client() : null;
  }

  /* ── one date format, everywhere ────────────────────────────────────────
     DD Mmm YYYY, including same-year dates. Settled 2026-08-21 after a rail
     badge overflowed its pill on a long-form date.
     ⚠️ progress.js carries its own copy of this for the completion control,
     because that file is loaded on the ten skill pages where this one is not.
     They must produce identical output — a completion showing "21 Aug 2026" on
     one surface and "21 August 2026" on another is the same class of
     inconsistency this module exists to prevent. If either changes, change both. */
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatDate(iso) {
    try {
      // ⚠️ The falsy check is not redundant with the isNaN below it:
      // new Date(null) is the epoch, not an invalid date, and would render
      // "01 Jan 1970" rather than nothing.
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var dd = d.getDate();
      return (dd < 10 ? '0' : '') + dd + ' ' +
             MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
    } catch (e) { return ''; }
  }

  /* ── the catalogue ──────────────────────────────────────────────────────
     Derived from the pages by npm run build:catalogue and served as a static
     file. ⚠️ It is fetched rather than inlined because the DATABASE CANNOT
     ANSWER THIS: a skill_progress row springs into existence only when someone
     opens a page, so nothing in Supabase knows the length of a plan nobody has
     started — and every surface has to account for the untouched skills too.
  ─────────────────────────────────────────────────────────────────────── */
  var cataloguePromise = null;

  function loadCatalogue(base) {
    if (cataloguePromise) return cataloguePromise;
    var url = (base || '') + CATALOGUE_URL;
    cataloguePromise = fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('catalogue ' + r.status);
        return r.json();
      })
      .catch(function () {
        // ⚠️ Resolve to null, never reject. A missing catalogue must degrade to
        // "show the guest page" — the personal layer is additive or it is not
        // worth having, and a thrown error here would take the whole page's
        // script with it.
        return null;
      });
    return cataloguePromise;
  }

  /* ── deriving one artefact ─────────────────────────────────────────────── */

  // The sections or slides that COUNT. Explore Further is declared optional in
  // the markup and excluded here.
  // ⚠️ Excluded from the DENOMINATOR ONLY. It stays in `visited`, and it stays
  // in the row's own `state.total`. Record all fourteen; divide by thirteen.
  function countedIds(entry, kind) {
    if (!entry) return null;
    if (kind === 'plan') {
      return (entry.sections || [])
        .filter(function (s) { return !s.optional; })
        .map(function (s) { return s.id; });
    }
    return (entry.slides || []).map(function (s) { return s.index; });
  }

  function labelFor(entry, kind, key) {
    if (!entry) return null;
    var list = kind === 'plan' ? (entry.sections || []) : (entry.slides || []);
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var id = kind === 'plan' ? item.id : item.index;
      // Loose compare on purpose: a primer index survives JSON as a number but
      // has been seen as a string in older rows.
      /* eslint-disable-next-line eqeqeq */
      if (id == key) return item.name;
    }
    return null;
  }

  function deriveOne(entry, kind, row) {
    var counted = countedIds(entry, kind);

    // No catalogue entry — the skill has pages we know nothing about. Report
    // what the row itself claims rather than inventing a denominator.
    if (!counted) {
      return {
        status: row && row.completed_at ? COMPLETE : (row ? IN_PROGRESS : NOT_STARTED),
        covered: 0, total: null, percent: null,
        completedAt: (row && row.completed_at) || null,
        updatedAt: (row && row.updated_at) || null,
        resume: null, known: false
      };
    }

    var state = (row && row.state) || null;
    var visited = (state && state.visited) || [];

    /* ⚠️ Intersect with the catalogue rather than trusting visited.length.
       A row written before a section was renamed or removed holds ids that no
       longer exist. Counting them produces coverage ABOVE the denominator —
       "15 of 13" — from data that is not wrong so much as out of date. The
       intersection makes stale entries simply stop counting, which is the
       honest reading: they refer to content that is not there any more. */
    var seen = {};
    for (var i = 0; i < visited.length; i++) seen[String(visited[i])] = true;

    var covered = 0;
    for (var j = 0; j < counted.length; j++) {
      if (seen[String(counted[j])]) covered++;
    }

    var total = counted.length;
    var percent = total > 0 ? Math.round((covered / total) * 100) : 0;
    if (percent > 100) percent = 100;   // belt and braces; the intersection caps it
    if (percent < 0) percent = 0;

    var completedAt = (row && row.completed_at) || null;
    var status = completedAt ? COMPLETE : (covered > 0 ? IN_PROGRESS : NOT_STARTED);

    /* The resume point. `position` on a plan is the section id last settled on;
       on a primer it is the slide index the reader stopped at.
       ⚠️ It carries NO progress meaning — it is volatile and can move backwards
       when someone re-reads. Never derive coverage from it. */
    var key = state ? (kind === 'plan' ? state.section : state.current) : null;
    var resume = null;
    if (key !== null && key !== undefined && key !== '') {
      var name = labelFor(entry, kind, key);
      if (name) resume = { key: key, name: name };
    }

    return {
      status: status,
      covered: covered,
      total: total,
      percent: percent,
      completedAt: completedAt,
      updatedAt: (row && row.updated_at) || null,
      resume: resume,
      known: true
    };
  }

  /* ── deriving everything ───────────────────────────────────────────────── */

  /* Slug → display name. Derived rather than mapped, so a sixth skill needs no
     edit here. Sentence case ("Systems thinking"), matching the site's own
     headings.

     ⚠️ IT LIVES HERE BECAUSE TWO SURFACES NEEDED IT AND A THIRD WAS ABOUT TO
     WRITE ITS OWN. It began inside learning.js; the account Notes tab wanted the
     same answer, and this file's whole reason for existing is that
     `skills-progress.js` owns the definitions so two pages cannot disagree about
     one account. A display name is a smaller thing to disagree about than
     "complete" — but the disagreement is the same shape, and the second copy is
     always the cheap one to write. */
  function nameFor(slug) {
    var words = String(slug).split('-');
    var first = words[0] || '';
    return [first.charAt(0).toUpperCase() + first.slice(1)]
      .concat(words.slice(1))
      .join(' ');
  }

  function derive(catalogue, rows) {
    var out = {};
    if (!catalogue || !catalogue.skills) return out;

    var index = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      index[r.skill_slug + '\u0000' + r.content_type] = r;
    }

    for (var slug in catalogue.skills) {
      if (!Object.prototype.hasOwnProperty.call(catalogue.skills, slug)) continue;
      var entry = catalogue.skills[slug];
      out[slug] = {
        primer: deriveOne(entry.primer, 'primer', index[slug + '\u0000primer']),
        plan: deriveOne(entry.plan, 'plan', index[slug + '\u0000plan'])
      };
    }
    return out;
  }

  /* ── summary across skills, for the top of the Library ─────────────────── */

  // ⚠️ Counts ARTEFACTS, not skills. A skill with a finished primer and an
  // untouched plan is not "half complete" — averaging the two is exactly the
  // thing the design rejected when it kept the two rings separate. Whatever
  // renders this must not recombine them either.
  function summarise(progress) {
    var s = { skills: 0, started: 0, complete: 0, artefacts: 0, inFlight: null };
    var newest = null;

    for (var slug in progress) {
      if (!Object.prototype.hasOwnProperty.call(progress, slug)) continue;
      s.skills++;
      var pair = progress[slug];
      var kinds = ['primer', 'plan'];
      for (var i = 0; i < kinds.length; i++) {
        var a = pair[kinds[i]];
        s.artefacts++;
        if (a.status === COMPLETE) s.complete++;
        else if (a.status === IN_PROGRESS) s.started++;

        // The resume shortcut points at the most recently TOUCHED unfinished
        // artefact. updated_at, never completed_at or started_at: it is the only
        // one written by the server on every save. started_at and completed_at
        // come from different clocks and can disagree by seconds in either
        // direction — see the clock-skew note in BACKLOG.md.
        if (a.status === IN_PROGRESS && a.updatedAt) {
          if (!newest || a.updatedAt > newest.updatedAt) {
            newest = { slug: slug, kind: kinds[i], updatedAt: a.updatedAt, artefact: a };
          }
        }
      }
    }
    s.inFlight = newest;
    return s;
  }

  /* ── the one query ─────────────────────────────────────────────────────── */

  function loadRows() {
    var c = client();
    if (!c) return Promise.resolve([]);

    // ⚠️ No user_id filter. RLS scopes every row to the caller, and the policy is
    // the thing worth being able to observe. A filter here would mask a broken
    // policy by making a leak impossible to see from this page. Same reasoning
    // as progress.js, and it must stay the same in both.
    return c.from(TABLE)
      .select('skill_slug, content_type, state, completed_at, updated_at')
      .then(function (r) {
        if (r.error || !r.data) return [];
        return r.data;
      }, function () { return []; });
  }

  /* ── notes, counted per artefact ─────────────────────────────────────────
     A skill note's target_id is `<slug>:<primer|plan>`. ⚠️ THE PARSE LIVES
     HERE for the same reason nameFor does: the account Notes tab already
     derives kind from this string, and the Future Skills page is the second
     surface to want it. Two copies of "what does this id mean" is exactly the
     shape of disagreement this file exists to prevent.

     ⚠️ It is a COUNT, not a flag. The one-note-per-target unique index is
     scoped to news only — a plan can hold a note per section, which is what
     the `anchor` column is for. */
  // rows -> { slug: { primer: n, plan: n } }. Pure; anything unrecognised is
  // ignored rather than guessed at.
  function countNotes(rows) {
    var out = {};
    for (var i = 0; i < (rows || []).length; i++) {
      var bits = String((rows[i] && rows[i].target_id) || '').split(':');
      var slug = bits[0], kind = bits[1];
      if (!slug || (kind !== 'primer' && kind !== 'plan')) continue;
      if (!out[slug]) out[slug] = { primer: 0, plan: 0 };
      out[slug][kind]++;
    }
    return out;
  }

  /* ⚠️ SELECTS target_id AND NOTHING ELSE. A note body runs to 500 characters
     and forty of them would be a payload fetched to be counted and thrown
     away. PostgREST cannot group, so the counting happens above.
     ⚠️ Resolves to {} on any failure, never rejects — a page that cannot count
     notes must still show progress. */
  function loadNoteCounts() {
    var c = client();
    if (!c) return Promise.resolve({});

    // No user_id filter, same reasoning as loadRows: RLS is the boundary and a
    // client-side filter would mask a broken policy.
    return c.from('notes')
      .select('target_id')
      .eq('target_type', 'skill')
      .then(function (r) {
        if (r.error || !r.data) return {};
        return countNotes(r.data);
      }, function () { return {}; });
  }

  // Resolves to null for a guest, or when anything at all goes wrong. Callers
  // render the guest page in both cases — there is deliberately no error state
  // to design, because the personal layer is additive.
  function load(options) {
    var base = (options && options.base) || '';
    return Promise.all([loadCatalogue(base), loadRows()])
      .then(function (parts) {
        var catalogue = parts[0];
        if (!catalogue) return null;
        var progress = derive(catalogue, parts[1]);
        return {
          catalogue: catalogue,
          progress: progress,
          summary: summarise(progress)
        };
      })
      .catch(function () { return null; });
  }

  global.AmplifiedSkillsProgress = {
    load: load,
    // Exposed for the surfaces to share, and for tests to drive without a
    // network: derive(catalogue, rows) is pure.
    derive: derive,
    nameFor: nameFor,
    // ⚠️ Notes are NOT folded into load(). Only the Future Skills page needs
    // them today, and adding a second query to the shared loader would make
    // every surface pay for it — including the ones that never render a note.
    loadNoteCounts: loadNoteCounts,
    countNotes: countNotes,
    formatDate: formatDate,
    summarise: summarise,
    deriveOne: deriveOne,
    STATUS: { COMPLETE: COMPLETE, IN_PROGRESS: IN_PROGRESS, NOT_STARTED: NOT_STARTED }
  };
})(window);
