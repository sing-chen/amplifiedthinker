// Learning learning — reads skill_progress and the generated catalogue, and
// renders what the two of them can honestly say together.
//
// Loaded by /learning/ and nowhere else, like auth-pages.css and pwned.js.
// A plain script, never a module: see the nav.js note in BaseLayout.astro.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THIS FILE OWNS NO DEFINITIONS. What "complete" means, what counts toward a
// denominator, and how a date is formatted all live in skills-progress.js, so
// this page and the Future Skills library cannot disagree about the same
// account. Call AmplifiedSkillsProgress.derive(); never recompute.
//
// The first cut of this file DID recompute, and it was wrong within a day: it
// read coverage out of `visited` and called an artefact finished when coverage
// reached the total. The library meanwhile reads `completed_at`, which the
// primer and plan pages write when a reader reaches the end. Those are not the
// same question. A reader who finished Creative Thinking saw "COMPLETED" on one
// page and "30%" on the other, from one row, on the same afternoon.
//
// Two consequences of `completed_at` being the authority, and both matter here:
//
//   1. A COMPLETE artefact renders as 100%, whatever `covered` says. Coverage
//      is a floor, not a measure — a page can finish without every section
//      being individually registered. future-skills-progress.js does exactly
//      this (`done ? 100 : percent`) and the two must not drift.
//   2. `visited` lives at `row.state.visited`, NOT the `visited` column. The
//      column is written too, but the model reads state, and one file reading
//      each is how they diverge again.
// ─────────────────────────────────────────────────────────────────────────────
//
// WHAT THIS PAGE MAY NOT SHOW. `skill_progress` holds one `updated_at` for the
// whole row and no per-section timestamp, so "sections read this week", weekly
// trends and activity heatmaps are not derivable — not hard, impossible. Self-
// rated confidence does not exist at all. All four were in the design and all
// four were cut for that reason. See docs/learning-design-brief.md §3.

(function (global) {
  'use strict';

  var doc = global.document;
  var TABLE = 'skill_progress';

  function el(id) { return doc.getElementById(id); }
  function model() { return global.AmplifiedSkillsProgress; }

  function root(path) {
    var nav = global.AmplifiedNav;
    return nav && nav.root ? nav.root(path) : '/' + path;
  }

  /* Slug → display name. MOVED to skills-progress.js on 2026-08-27, when the
     account Notes tab needed the same answer and would otherwise have been the
     third copy. Delegated rather than deleted so this file keeps reading the
     same way, and falls back if the module is unavailable — the surrounding
     code already copes with a missing model. */
  function nameFor(slug) {
    var m = model();
    if (m && m.nameFor) return m.nameFor(slug);
    var words = String(slug).split('-');
    var first = words[0] || '';
    return [first.charAt(0).toUpperCase() + first.slice(1)]
      .concat(words.slice(1))
      .join(' ');
  }

  function show(which) {
    ['learn-loading', 'learn-signed-out', 'learn-error', 'learn-empty', 'learn-main']
      .forEach(function (id) {
        var node = el(id);
        if (node) node.hidden = (id !== 'learn-' + which);
      });
  }

  /* ── the view model ──────────────────────────────────────────────────────
     Everything below takes a derived artefact from skills-progress.js and only
     decides how to DISPLAY it. No completion logic lives here. */

  // ⚠️ The one rule this page must copy rather than invent: a finished artefact
  // shows as full. `covered` can sit well below `total` on a row whose
  // completed_at is set, and rendering that raw is the exact defect this file
  // was rewritten to fix.
  function shownCovered(a) {
    var done = a.status === model().STATUS.COMPLETE;
    return done && a.total != null ? a.total : a.covered;
  }
  function shownPercent(a) {
    var done = a.status === model().STATUS.COMPLETE;
    return done ? 100 : (a.percent || 0);
  }

  function view(slug, kind, a) {
    var M = model();
    var done = a.status === M.STATUS.COMPLETE;
    var started = a.status === M.STATUS.IN_PROGRESS;

    return {
      kind: kind,
      name: nameFor(slug),
      done: done,
      started: started,
      status: done ? 'done' : (started ? 'doing' : 'idle'),
      covered: shownCovered(a),
      total: a.total,
      pct: shownPercent(a),
      // completedAt when finished, updated_at otherwise — the same choice the
      // library makes, so one row never carries two different dates.
      when: done
        ? (a.completedAt ? 'Finished ' + M.formatDate(a.completedAt) : 'Finished')
        : (a.updatedAt ? 'Read ' + M.formatDate(a.updatedAt) : 'Not opened yet'),
      // No fragment. The page restores its own position from the same table via
      // progress.js, and a competing #hash would fight that restore.
      href: root('skills/' + slug + '/' + (kind === 'plan' ? 'plan.html' : 'primer.html'))
    };
  }

  function buildRows(progress) {
    return Object.keys(progress).sort().map(function (slug) {
      return {
        slug: slug,
        name: nameFor(slug),
        primer: view(slug, 'primer', progress[slug].primer),
        plan: view(slug, 'plan', progress[slug].plan)
      };
    });
  }

  function totals(rows) {
    var t = { planRead: 0, planTotal: 0, plansDone: 0, primersDone: 0,
              inStarted: 0, notOpened: 0, anything: false, pct: 0 };

    rows.forEach(function (s) {
      if (s.plan.total == null) return;   // a skill the catalogue does not describe

      t.planTotal += s.plan.total;
      t.planRead += s.plan.covered;
      if (s.plan.done) t.plansDone++;
      if (s.primer.done) t.primersDone++;
      if (s.plan.done || s.plan.started || s.primer.done || s.primer.started) t.anything = true;

      var remaining = s.plan.total - s.plan.covered;
      if (s.plan.started) t.inStarted += remaining; else t.notOpened += remaining;
    });

    t.pct = t.planTotal > 0 ? Math.round((t.planRead / t.planTotal) * 100) : 0;
    return t;
  }

  /* ── rendering ─────────────────────────────────────────────────────────── */

  // nav.js owns the one escaper — see AmplifiedNav.escapeHtml.
  function esc(s) { return global.AmplifiedNav.escapeHtml(s); }

  // "Review" once finished, "Resume" mid-way, "Start" when untouched — the verb
  // is the state, so the row still reads correctly in greyscale. Filled for the
  // two that mean "go and do it"; outline for the secondary Review.
  function verb(p) { return p.done ? 'Review' : (p.started ? 'Resume' : 'Start'); }

  // 48px ring, r=15 → circumference 94.25. A finished ring swaps the percentage
  // for a tick: "100%" and a checkmark say the same thing, and the tick says it
  // without being read.
  var RING_R = 15;
  var RING_C = 2 * Math.PI * RING_R;

  function ring(p) {
    var len = (p.pct / 100) * RING_C;
    var label = p.total == null
      ? (p.done ? 'complete' : p.pct + ' per cent')
      : (p.done ? 'complete' : p.pct + ' per cent, ' + p.covered + ' of ' + p.total);

    return '<svg class="learn-ring" viewBox="0 0 40 40" role="img" aria-label="' + esc(label) + '">' +
      '<circle class="ring-track" cx="20" cy="20" r="' + RING_R + '"></circle>' +
      '<circle class="ring-value' + (p.done ? '' : ' doing') + '" cx="20" cy="20" r="' + RING_R + '" ' +
        'stroke-dasharray="' + len.toFixed(2) + ' ' + RING_C.toFixed(2) + '" ' +
        'style="--sweep:' + len.toFixed(2) + '" ' +
        'transform="rotate(-90 20 20)"></circle>' +
      (p.done
        ? '<path class="ring-tick" d="M14.5 20.2l3.7 3.7 7.3-7.6"></path>'
        : '<text class="ring-pct" x="20" y="23.4">' + p.pct + '%</text>') +
    '</svg>';
  }

  function cell(p, label) {
    return '<td class="learn-cell" data-label="' + esc(label) + '">' +
      '<div class="learn-cell-inner">' +
        ring(p) +
        '<span class="learn-status">' +
          '<span class="learn-dot ' + p.status + '" aria-hidden="true"></span>' +
          '<span class="learn-when">' + esc(p.when) + '</span>' +
        '</span>' +
        '<a class="learn-act' + (p.done ? ' quiet' : '') + '" href="' + esc(p.href) + '">' +
          verb(p) +
          '<span class="sr-only"> ' + esc(label.toLowerCase() + ', ' + p.name) + '</span>' +
        '</a>' +
      '</div>' +
    '</td>';
  }

  function renderTable(rows) {
    el('learn-table-body').innerHTML = rows.map(function (s) {
      return '<tr>' +
        '<th scope="row" class="learn-skill">' + esc(s.name) + '</th>' +
        cell(s.primer, 'Primer') +
        cell(s.plan, 'Plan') +
      '</tr>';
    }).join('');
  }

  // Two arcs on one ring: read, then the rest of any plan already started.
  // The remainder is the track, which is "not opened".
  //
  // ⚠️ The `doing` arc carries BOTH a --sweep (for the reveal animation, which
  // ends at stroke-dashoffset 0) and a resting offset that would position it
  // after the read arc. Those are the same property, so they cannot both be
  // static — the arc is rotated into place with `transform` instead.
  function renderDonut(t) {
    var r = 68;
    var c = 2 * Math.PI * r;
    var readLen = t.planTotal ? (t.planRead / t.planTotal) * c : 0;
    var doingLen = t.planTotal ? (t.inStarted / t.planTotal) * c : 0;
    var doingDeg = t.planTotal ? (t.planRead / t.planTotal) * 360 : 0;

    el('learn-donut').innerHTML =
      '<circle class="seg-track" cx="95" cy="95" r="' + r + '"></circle>' +
      '<circle class="seg-doing" cx="95" cy="95" r="' + r + '" ' +
        'stroke-dasharray="' + doingLen.toFixed(2) + ' ' + (c - doingLen).toFixed(2) + '" ' +
        'style="--sweep:' + doingLen.toFixed(2) + '" ' +
        'transform="rotate(' + (doingDeg - 90).toFixed(2) + ' 95 95)"></circle>' +
      '<circle class="seg-read" cx="95" cy="95" r="' + r + '" ' +
        'stroke-dasharray="' + readLen.toFixed(2) + ' ' + (c - readLen).toFixed(2) + '" ' +
        'style="--sweep:' + readLen.toFixed(2) + '" ' +
        'transform="rotate(-90 95 95)"></circle>' +
      '<text class="donut-pct" id="learn-donut-pct" x="95" y="95">0%</text>' +
      '<text class="donut-cap" x="95" y="122">read</text>';

    el('learn-donut').setAttribute('aria-label',
      t.pct + ' per cent of plan sections read: ' + t.planRead + ' read, ' +
      t.inStarted + ' remaining in plans you have started, ' +
      t.notOpened + ' in plans not opened.');

    // The real denominator, not a number written into the markup — see the
    // catalogue note at the top of this file.
    var total = el('learn-state-total');
    if (total) total.textContent = t.planTotal;
  }

  // One segment: an animated fill, and a number that sits still on top of it.
  //
  // ⚠️ The number is dropped below a threshold rather than clipped. A segment
  // two sections tall is about 25px, and a 13px digit centred in less than that
  // is either overflowing its own colour or sliced in half. The figure is not
  // lost — the bar's aria-label always carries both counts, and the table above
  // states every one of them in full.
  var LABEL_MIN_PCT = 13;

  function seg(cls, pct, value) {
    return '<span class="seg ' + cls + '" style="height:' + pct + '%">' +
      '<i class="seg-fill"></i>' +
      (pct >= LABEL_MIN_PCT ? '<b class="seg-label">' + value + '</b>' : '') +
    '</span>';
  }

  // One column per skill, filling from the bottom. Segment ORDER in the DOM is
  // top-to-bottom because the column is a flex column justified to flex-end —
  // so "in progress" is written before "read", and read ends up at the floor.
  //
  // ⚠️ Only two segments are ever drawn, not the design's three. A started plan's
  // unread sections are all "in progress" and an unopened plan's are all "not
  // opened"; nothing in skill_progress can put a third state inside ONE plan.
  // The legend still carries all three because all three appear across the row.
  function renderBars(rows) {
    var drawn = rows.filter(function (s) { return s.plan.total != null; });

    el('learn-bars').innerHTML = drawn.map(function (s) {
      var p = s.plan;
      var readPct = p.pct;
      var unread = p.total - p.covered;
      var unreadPct = 100 - readPct;

      // The remainder is amber on a plan already started and bare track on one
      // never opened — the same distinction the donut makes. A bare track still
      // gets a segment element rather than being left to the container's
      // background, because it has to carry its own number.
      var restClass = p.started && !p.done ? 's-doing' : 's-idle';

      return '<div class="learn-vcol">' +
        '<div class="learn-vbar" role="img" aria-label="' + esc(s.name) + ': ' +
          p.covered + ' of ' + p.total + ' sections read' +
          (p.done ? ', complete' : (p.started ? ', the rest in progress' : ', not opened')) + '">' +
          (unread > 0 ? seg(restClass, unreadPct, unread) : '') +
          (p.covered > 0 ? seg('s-read', readPct, p.covered) : '') +
        '</div>' +
        '<div class="learn-vname">' + esc(s.name) + '</div>' +
      '</div>';
    }).join('');

    // ⚠️ NOT "14 sections each". The plans are 13, 13, 14, 13, 13 once the
    // optional Explore Further is excluded, so a single flat number would be
    // false for four of the five. Stated as a range, and computed — if a plan
    // is re-cut this line follows it.
    var totals = drawn.map(function (s) { return s.plan.total; });
    var lo = Math.min.apply(null, totals);
    var hi = Math.max.apply(null, totals);
    var note = el('learn-bars-note');
    if (note) {
      note.textContent = lo === hi
        ? lo + ' sections each'
        : lo + '–' + hi + ' sections per plan';
    }
  }

  // Overall completion reads as a ring, built from the same RING_R/RING_C the
  // row rings use — one geometry, one sweep, one set of proportions. The text
  // starts at 0% because armMotion() counts it up; countUp writes the real
  // figure first, so a stalled frame loop still leaves the truth on screen.
  function renderTiles(t) {
    var len = (t.pct / 100) * RING_C;
    var host = el('learn-tile-ring');

    host.innerHTML =
      '<circle class="ring-track" cx="20" cy="20" r="' + RING_R + '"></circle>' +
      '<circle class="ring-value" cx="20" cy="20" r="' + RING_R + '" ' +
        'stroke-dasharray="' + len.toFixed(2) + ' ' + RING_C.toFixed(2) + '" ' +
        'style="--sweep:' + len.toFixed(2) + '" ' +
        'transform="rotate(-90 20 20)"></circle>' +
      '<text class="ring-pct" id="learn-pct" x="20" y="20">0%</text>';

    host.setAttribute('aria-label',
      t.pct + ' per cent complete, ' + t.planRead + ' of ' + t.planTotal + ' sections read.');

    el('learn-read-of').textContent = t.planRead + ' of ' + t.planTotal + ' sections';
    el('learn-plans-done').textContent = t.plansDone;
    el('learn-primers-done').textContent = t.primersDone;
  }

  function render(progress) {
    var rows = buildRows(progress);
    var t = totals(rows);

    // Nothing opened at all is its own state. A grid of zeros is a poor first
    // thing for a new account to meet, and it answers no question.
    if (!t.anything) { show('empty'); return; }

    renderTiles(t);
    renderTable(rows);
    renderDonut(t);
    renderBars(rows);
    show('main');

    // After show('main'), never before: an observer set on a display:none
    // subtree never reports an intersection, so every animation would be armed
    // against a section that can never be seen and nothing would ever run.
    armMotion(t);
    wireCollapse();
  }

  /* ── the collapsible skills section ────────────────────────────────────── */

  function wireCollapse() {
    var btn = el('learn-skills-toggle');
    var body = el('learn-skills-body');
    if (!btn || !body || btn.__wired) return;
    btn.__wired = true;

    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      body.hidden = open;
    });
  }

  /* ── motion ──────────────────────────────────────────────────────────────
     One observer, one job: add `.is-in` the first time a section is on screen,
     and start any count-up that section owns. The CSS holds every animation
     behind that class, so this is the only place motion begins. */

  var reduced = global.matchMedia &&
                global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function countUp(node, to, suffix) {
    if (!node) return;

    var end = to + (suffix || '');

    // ⚠️ THE FINAL VALUE GOES IN FIRST, BEFORE ANY ANIMATION.
    // A stalled count-up does not degrade to "no animation", it degrades to a
    // legend reading 0 next to a ring showing 45% — a wrong number, which is
    // worse than a still one. requestAnimationFrame does not run in a tab that
    // is never composited, and is throttled hard in a backgrounded one.
    // Writing the answer first means every failure leaves the truth on screen;
    // the first frame below overwrites it within ~16ms when rAF is healthy, so
    // nobody sees the jump.
    node.textContent = end;
    if (reduced) return;

    var dur = 900;
    var start = null;
    var done = false;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      // Same easing curve as the ring sweep, so the number and the arc arrive
      // together rather than one trailing the other.
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = Math.round(to * eased) + (suffix || '');
      if (p < 1) { global.requestAnimationFrame(step); return; }
      done = true;
    }
    global.requestAnimationFrame(step);

    // And a backstop for the case where rAF starts and then stops — a tab
    // backgrounded mid-count would otherwise freeze on whatever partial number
    // it had reached, which is the same lie in a subtler form.
    global.setTimeout(function () { if (!done) node.textContent = end; }, dur + 600);
  }

  /* ⚠️ NO BLIND TIMER HERE, AND THAT IS THE POINT.
     An earlier cut revealed every section on a 3-second deadline as a safety
     net. It was worse than the problem: on any real page all three sections hit
     the deadline within three seconds of load, so everything below the fold
     animated while nobody was looking at it, and scrolling revealed charts that
     had already finished. The feature was gone and only the safety net was
     left. A fallback that ignores scroll position cannot stand in for something
     whose entire purpose is scroll position.

     So the fallback is scroll-driven too. IntersectionObserver stays the
     primary — it is cheaper and it catches reflows that fire no scroll event —
     but a passive, rAF-throttled scroll/resize check runs alongside it against
     the same idempotent fire(). Whichever notices first wins. If the observer
     never reports at all, scrolling still works; and anything already on screen
     at load is caught by the initial measurement below. */

  var pending = [];
  var watching = false;
  var ticking = false;

  // A section counts as "in view" once a fifth of it is showing, capped so a
  // section taller than the viewport does not have to be impossibly visible.
  function inView(node) {
    var vh = global.innerHeight || doc.documentElement.clientHeight || 0;

    // ⚠️ A zero-height viewport is not "nothing is visible", it is "we cannot
    // tell" — it happens in a pane that is never displayed. Guessing "hidden"
    // there leaves the charts in their pre-animation state, which is blank.
    if (!vh) return true;

    var r = node.getBoundingClientRect();
    if (!r.height && !r.width) return false;        // not laid out yet

    var shown = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    if (shown <= 0) return false;
    return shown >= Math.min(r.height * 0.2, vh * 0.25);
  }

  function sweep() {
    ticking = false;
    for (var i = pending.length - 1; i >= 0; i--) {
      if (inView(pending[i].node)) {
        var item = pending[i];
        pending.splice(i, 1);
        item.fire();
      }
    }
    if (!pending.length) stopWatching();
  }

  // ⚠️ Throttled on a TIMER, not requestAnimationFrame. rAF is the usual choice
  // for scroll work and it is wrong here: it does not run at all in a tab that
  // is never composited, and it is paused outright in a backgrounded one — so
  // an rAF-throttled reveal simply never fires there, leaving the pre-animation
  // state, which is a blank chart. The work is one getBoundingClientRect per
  // waiting section, cheap enough that 100ms of coalescing is ample and the
  // frame clock buys nothing.
  function onScroll() {
    if (ticking) return;
    ticking = true;
    global.setTimeout(sweep, 100);
  }

  function startWatching() {
    if (watching) return;
    watching = true;
    global.addEventListener('scroll', onScroll, { passive: true });
    global.addEventListener('resize', onScroll, { passive: true });
  }

  function stopWatching() {
    if (!watching) return;
    watching = false;
    global.removeEventListener('scroll', onScroll);
    global.removeEventListener('resize', onScroll);
  }

  function onReveal(section, run) {
    if (!section) return;

    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      section.classList.add('is-in');
      if (run) run();
    }

    if ('IntersectionObserver' in global) {
      var io = new global.IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          io.disconnect();
          fire();
          return;
        }
      }, { threshold: 0.2, rootMargin: '0px 0px -40px 0px' });
      io.observe(section);
    }

    pending.push({ node: section, fire: fire });
    startWatching();

    // One measurement straight after this turn of the event loop, so anything
    // already on screen when the data lands animates now rather than waiting
    // for a scroll that may never come. Deferred, not immediate: layout has
    // just changed underneath us and the rects are not settled yet.
    global.setTimeout(onScroll, 0);
  }

  function armMotion(t) {
    // The tiles are above every .learn-section and have no wrapper of their own,
    // so #learn-tiles is what carries `.is-in` for the overall-completion ring.
    onReveal(el('learn-tiles'), function () {
      countUp(el('learn-pct'), t.pct, '%');
    });

    onReveal(el('learn-skills-section'));

    onReveal(el('learn-state-section'), function () {
      countUp(el('learn-donut-pct'), t.pct, '%');
      countUp(el('learn-key-read'), t.planRead);
      countUp(el('learn-key-doing'), t.inStarted);
      countUp(el('learn-key-idle'), t.notOpened);
    });

    onReveal(el('learn-bars-section'));
  }

  /* ── loading ─────────────────────────────────────────────────────────────
     The catalogue and the rows are fetched here rather than through
     AmplifiedSkillsProgress.load(), for one reason: that helper resolves to
     null for a guest AND for every failure alike, because the library page is
     additive and has no error state to show. This page is not additive — it is
     nothing but this data — so it has to be able to tell "you have read
     nothing" from "we could not find out". The DERIVATION still comes from the
     shared model; only the two fetches are local. */

  function fetchCatalogue() {
    return global.fetch(root('skills-catalogue.json'), { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('catalogue ' + r.status);
        return r.json();
      });
  }

  // ⚠️ Selects `state`, not the `visited` column, and `completed_at` — the same
  // columns skills-progress.js reads, because it is what parses this row.
  //
  // No user_id filter. RLS scopes every row to the caller, and the policy is
  // the thing worth being able to observe. A filter here would mask a broken
  // policy by making a leak impossible to see from this page — the same
  // reasoning as progress.js and skills-progress.js, and it must stay the same
  // in all three.
  function fetchRows(client) {
    return client.from(TABLE)
      .select('skill_slug, content_type, state, completed_at, updated_at')
      .then(function (r) {
        if (r.error) throw new Error(r.error.message || 'read failed');
        return r.data || [];
      });
  }

  function load(auth) {
    var client = auth.client();
    if (!client) { show('error'); return; }

    Promise.all([fetchCatalogue(), fetchRows(client)])
      .then(function (both) { render(model().derive(both[0], both[1])); })
      .catch(function (e) {
        // Never render zeros on a failed read: "you have done nothing" and "we
        // could not find out" are different sentences, and only one of them is
        // honest here.
        if (global.console && console.warn) console.warn('[learning]', e);
        show('error');
      });
  }

  // Waits for BOTH globals. nav.js appends the auth stack with defer, and
  // skills-progress.js is a sibling <script> on this page — neither has
  // necessarily run when this file does. Bounded like progress.js: if they
  // never arrive we say so rather than leaving a spinner up for ever.
  var waited = 0;
  (function start() {
    var auth = global.AmplifiedAuth;
    if (!auth || !model()) {
      waited += 60;
      if (waited > 6000) { show('error'); return; }
      global.setTimeout(start, 60);
      return;
    }

    auth.onAuthChange(function (session) {
      if (!session) { show('signed-out'); return; }
      load(auth);
    });
  })();
})(window);
