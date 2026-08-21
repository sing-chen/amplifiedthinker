/* Amplified Thinker — the personal layer on the Future Skills page.
 *
 * Renders a signed-in reader's own primer and plan progress onto the skill
 * cards. A guest never loads this file: the bootstrap in future-skills.html
 * checks data-session first, so the guest page ships exactly as it always has.
 *
 * ⚠️ THE PERSONAL LAYER IS ADDITIVE OR IT IS NOT WORTH HAVING. No empty slots,
 * no greyed-out meters, no "sign in to see this" repeated down nine cards. If
 * anything here fails — no catalogue, no session, a query that errors — the page
 * is left exactly as the guest sees it. Every failure path returns silently.
 *
 * It owns no definitions. What "in progress" means, what counts toward a
 * denominator, and how a date is formatted all live in skills-progress.js so
 * this page and the dashboard cannot disagree about the same account.
 *
 * ⚠️ CSS is injected from here rather than linked, following progress.js's
 * COMPLETION_CSS. A stylesheet <link> in the page would be fetched by every
 * guest for markup they never receive.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  var M = null;   // AmplifiedSkillsProgress, resolved at run time

  /* ── motion ─────────────────────────────────────────────────────────────
     Decided 2026-08-20, and the reasoning matters more than the numbers.

     NOTHING ANIMATES ON LOAD OR ON SCROLL. The skill list sits well below the
     fold, so a load-triggered animation finishes before anyone scrolls to it —
     a nice animation nobody sees is a slow page load with extra steps. Rings
     and bars render at their real values from the first paint.

     EXPANDING A CARD IS THE ONLY TRIGGER.

     The pulse OVERLAPS the sweep rather than following it. A sweep ends on an
     ease-out that decelerates into its target; a pulse starting after it
     finishes re-accelerates from a standstill, so the eye reads two gestures
     with two endings. Starting at ~85% makes it the landing rather than an
     appendix.
  ─────────────────────────────────────────────────────────────────────── */
  var RING_MS = 1350;
  var BAR_MS = 1200;
  var PULSE_AT = 0.85;          // fraction of RING_MS at which the pulse starts

  function reducedMotion() {
    try {
      return global.matchMedia &&
             global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /* ── ring geometry ─────────────────────────────────────────────────────── */
  var R = 15.5;                       // radius in the 40x40 viewBox
  var C = 2 * Math.PI * R;            // circumference, the dasharray length

  function offsetFor(percent) {
    var p = Math.max(0, Math.min(100, percent || 0));
    return C * (1 - p / 100);
  }

  /* ── the stylesheet ────────────────────────────────────────────────────── */
  var CSS = [
    /* Header rings. Sit between the header content and the chevron. */
    '.sprog{display:flex;align-items:center;gap:14px;margin-left:auto;padding-left:14px;flex-shrink:0}',
    '.sring{position:relative;width:44px;height:44px;flex-shrink:0}',
    /* ⚠️ DIRECT CHILD, not a descendant. As `.sring svg` this was (0,2,0) and
       matched EVERY svg in the ring — including the completion check inside
       .sr-fig, which it blew up to 44px and rotated -90deg. The result read as
       a slash through the ring rather than a tick, and looked like a deliberate
       "not available" symbol. Same shape as the .auth-panel label trap in
       CLAUDE.md: an element selector quietly outranking a class. */
    '.sring > svg{width:44px;height:44px;transform:rotate(-90deg);display:block}',
    '.sring .sr-track{fill:none;stroke:var(--light-sage,#DCE7E3);stroke-width:3.2}',
    '.sring .sr-arc{fill:none;stroke:var(--mid-teal,#3E7F72);stroke-width:3.2;stroke-linecap:round;' +
      'stroke-dasharray:' + C.toFixed(3) + ';stroke-dashoffset:' + C.toFixed(3) + '}',
    '.sring.is-anim .sr-arc{transition:stroke-dashoffset ' + RING_MS + 'ms cubic-bezier(.22,.75,.28,1)}',
    /* The figure sits in the middle, un-rotated. */
    '.sr-fig{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font-family:\'Poppins\',sans-serif;font-size:10px;font-weight:600;color:var(--fg-brand,#1F6F5C);' +
      'font-variant-numeric:tabular-nums;letter-spacing:-.02em}',
    '.sr-label{font-family:\'Poppins\',sans-serif;font-size:9px;font-weight:600;letter-spacing:.07em;' +
      'text-transform:uppercase;color:var(--text-muted,#5A6B66);text-align:center;margin-top:2px;display:block}',
    '.sring-wrap{display:flex;flex-direction:column;align-items:center}',
    /* Complete: a check, never "100%". A percentage on a finished thing invites
       the reader to work out what the missing 7% was. */
    '.sring.is-done .sr-arc{stroke:var(--fg-brand,#1F6F5C)}',
    '.sr-fig .sr-check{width:15px;height:15px;display:block;transform:none}',
    '.sr-check polyline{fill:none;stroke:var(--fg-brand,#1F6F5C);stroke-width:2.8;' +
      'stroke-linecap:round;stroke-linejoin:round}',
    /* A completed ring still SWEEPS — the gesture is the same for every card,
       and skipping it on the finished ones makes them read as inert. What the
       check must not do is sit there during the sweep, which looked like the
       arc was drawing itself around an already-final answer. It is held back
       and lands with the pulse instead. */
    '.sr-fig .sr-check{transition:opacity 200ms ease,transform 260ms cubic-bezier(.34,1.5,.64,1)}',
    '.sring.is-sweeping .sr-check{opacity:0;transform:scale(.55)}',
    /* The pulse. Scale is reduced deliberately — at full strength beside a
       sweep it reads as a bounce rather than a landing. */
    '@keyframes sr-pulse{0%{transform:scale(1)}45%{transform:scale(1.055)}100%{transform:scale(1)}}',
    '.sring.is-pulse{animation:sr-pulse 420ms cubic-bezier(.34,1.4,.64,1)}',

    /* Completed skill header — soft tint, filled icon tile, check by the name.
       ⚠️ It must read as SETTLED, NOT AS LOUD. The card that deserves the eye is
       the one in progress, because it is the one with something to do. An
       inverted header was mocked up and rejected on exactly this. The test for
       any future change: a completed card sitting directly above an in-progress
       one — if the finished one wins, it is wrong. */
    '.scard.sk-done .sheader{background:linear-gradient(90deg,rgba(31,111,92,.055),rgba(31,111,92,.015) 60%,transparent)}',
    '.scard.sk-done .skill-icon{background:var(--fg-brand,#1F6F5C)}',
    '.scard.sk-done .skill-icon svg{stroke:#fff}',
    '.sname-check{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;' +
      'border-radius:50%;background:var(--fg-brand,#1F6F5C);margin-left:7px;vertical-align:middle}',
    '.sname-check svg{width:9px;height:9px;transform:none}',

    /* The status pill, repurposed. On an AVAILABLE card "Available Now" is a
       fact the reader already has — the card is open, the launch buttons are
       there. For a signed-in reader the same slot can carry something they do
       not know, which is where THEY are.
       ⚠️ This costs nothing on the other axis. A "coming soon" card carries a
       zero-width status rail, no chevron and no body, so availability is
       already encoded structurally and the badge is free. Guests keep
       "Available Now" untouched. */
    '.sstatus.ss-ns{background:rgba(20,60,50,.07);color:#43554F}',
    '.sstatus.ss-ip{background:rgba(62,127,114,.16);color:#14584A}',
    '.sstatus.ss-done{background:var(--fg-brand,#1F6F5C);color:#fff}',
    '[data-theme="dark"] .sstatus.ss-ns{background:rgba(255,255,255,.08);color:#B6C7C1}',
    '[data-theme="dark"] .sstatus.ss-ip{background:rgba(143,207,195,.16);color:#8FCFC3}',
    '[data-theme="dark"] .sstatus.ss-done{background:#8FCFC3;color:#12211E}',
    '.sname-check polyline{fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}',

    /* Launch cards gain state. The description gives way to a date and a resume
       point ONLY on artefacts that have been started — a not-started card keeps
       the guest text, because at that point it is still the useful thing to say. */
    // ⚠️ #14584A, not --fg-brand. At 10px on the warm-cream launch card the
    // brand teal measures 3.93:1 — under AA for normal text, and this label is
    // as small as text gets on the page.
    '.lc-state{display:flex;align-items:center;gap:7px;margin-bottom:7px;font-family:\'Poppins\',sans-serif;' +
      'font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#14584A}',
    '.lc-dot{width:6px;height:6px;border-radius:50%;background:var(--mid-teal,#3E7F72);flex-shrink:0}',
    '.lcard.lc-done .lc-dot{background:var(--fg-brand,#1F6F5C)}',
    '.lc-meta{font-family:\'Inter\',sans-serif;font-size:12.5px;line-height:1.5;color:var(--text-muted,#5A6B66);margin-bottom:9px}',
    '.lc-meta strong{color:var(--fg-1,#2C3E3A);font-weight:600}',
    '.lc-bar{height:4px;border-radius:99px;background:var(--light-sage,#DCE7E3);overflow:hidden;margin-bottom:10px}',
    '.lc-fill{height:100%;width:0;border-radius:99px;background:var(--mid-teal,#3E7F72)}',
    '.lc-bar.is-anim .lc-fill{transition:width ' + BAR_MS + 'ms cubic-bezier(.22,.75,.28,1)}',
    '.lcard.lc-done .lc-fill{background:var(--fg-brand,#1F6F5C)}',

    /* ⚠️ THE PLAN CARD IS DARK. `.lcard.primary` has a --deep-teal background,
       so brand-teal text on it composites to 1.0:1 — literally invisible, not
       merely low contrast. Measured, not guessed. The page already carries this
       exact set of overrides for its own .lctype/.lcdesc/.lccta; anything new
       dropped into a launch card needs them too, and this is the second time
       that has had to be discovered rather than remembered. */
    '.lcard.primary .lc-state{color:#E3F0EA}',
    '.lcard.primary .lc-dot{background:#C6DDD3}',
    '.lcard.primary .lc-meta{color:rgba(255,255,255,.86)}',
    '.lcard.primary .lc-meta strong{color:#fff}',
    '.lcard.primary .lc-bar{background:rgba(255,255,255,.2)}',
    '.lcard.primary .lc-fill{background:#C6DDD3}',
    '.lcard.primary.lc-done .lc-dot,.lcard.primary.lc-done .lc-fill{background:#fff}',

    /* Summary strip, top of the Library, signed in only. A shortcut, not a
       stats dump — if it starts growing figures the dashboard also shows, it has
       become the wrong component. */
    '.lib-summary{display:none;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 28px;padding:14px 18px;' +
      'border:1px solid var(--line,#D8E2DE);border-radius:12px;background:var(--light-sage,#DCE7E3)}',
    'html[data-session="in"] .lib-summary.is-ready{display:flex}',
    '.ls-counts{font-family:\'Inter\',sans-serif;font-size:13.5px;color:var(--fg-1,#2C3E3A)}',
    '.ls-counts strong{font-family:\'Poppins\',sans-serif;font-weight:600}',
    '.ls-resume{margin-left:auto;font-family:\'Inter\',sans-serif;font-size:13.5px}',
    // Darker than --fg-brand on purpose: the strip's own --light-sage ground
    // put the brand teal at 4.13:1, just under AA for normal text.
    '.ls-resume a{color:#14584A;font-weight:600;text-decoration:underline;text-underline-offset:2px}',

    /* Dark mode. Tokens differ per surface on this page, so these are explicit. */
    '[data-theme="dark"] .sring .sr-track{stroke:rgba(255,255,255,.12)}',
    '[data-theme="dark"] .sring .sr-arc{stroke:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .sring.is-done .sr-arc{stroke:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .sr-fig{color:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .sr-label{color:var(--d-fg-2,#9DB2AC)}',
    '[data-theme="dark"] .sr-check polyline{stroke:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .scard.sk-done .sheader{background:linear-gradient(90deg,rgba(143,207,195,.09),rgba(143,207,195,.02) 60%,transparent)}',
    '[data-theme="dark"] .scard.sk-done .skill-icon{background:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .scard.sk-done .skill-icon svg{stroke:#12211E}',
    '[data-theme="dark"] .sname-check{background:var(--d-teal-stroke,#8FCFC3)}',
    '[data-theme="dark"] .sname-check polyline{stroke:#12211E}',
    /* ⚠️ In dark mode the NON-primary launch card is #33231A — a warm brown, not
       a neutral surface. The teal and muted-grey tokens that work everywhere
       else on this page fail against it (2.42:1 measured). These follow the
       terracotta family the page already uses for that card. */
    '[data-theme="dark"] .lc-state{color:#EFD3BB}',
    '[data-theme="dark"] .lc-dot,[data-theme="dark"] .lcard.lc-done .lc-dot{background:#EFD3BB}',
    '[data-theme="dark"] .lc-meta{color:rgba(255,255,255,.84)}',
    '[data-theme="dark"] .lc-meta strong{color:#fff}',
    '[data-theme="dark"] .lc-bar{background:rgba(255,255,255,.16)}',
    '[data-theme="dark"] .lc-fill,[data-theme="dark"] .lcard.lc-done .lc-fill{background:#EFD3BB}',
    '[data-theme="dark"] .lib-summary{background:var(--d-bg-surface,#1B2E29);border-color:var(--d-line,#2C433D)}',
    '[data-theme="dark"] .ls-counts{color:var(--d-fg-1,#C7D6D1)}',
    '[data-theme="dark"] .ls-counts strong{color:var(--d-fg-heading,#E6EFEC)}',
    '[data-theme="dark"] .ls-resume a{color:var(--d-teal-stroke,#8FCFC3)}',

    /* ⚠️ Reduced motion is NOT a faster sweep. It renders the final value
       instantly — the page already carries a prefers-reduced-motion block and
       this joins it rather than inventing a second policy. */
    '@media (prefers-reduced-motion: reduce){',
    '  .sring.is-anim .sr-arc{transition:none}',
    '  .lc-bar.is-anim .lc-fill{transition:none}',
    '  .sring.is-pulse{animation:none}',
    '}',

    '@media (max-width:700px){',
    '  .sprog{gap:10px;padding-left:8px}',
    '  .sring,.sring svg{width:38px;height:38px}',
    '  .ls-resume{margin-left:0;width:100%}',
    '}'
  ].join('\n');

  function injectCss() {
    if (doc.getElementById('fs-progress-css')) return;
    var s = doc.createElement('style');
    s.id = 'fs-progress-css';
    s.textContent = CSS;
    doc.head.appendChild(s);
  }

  /* ── small builders ────────────────────────────────────────────────────── */

  function svgEl(name, attrs) {
    var el = doc.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    }
    return el;
  }

  function checkSvg(cls) {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    if (cls) svg.setAttribute('class', cls);
    svg.appendChild(svgEl('polyline', { points: '4 12.5 9.5 18 20 6.5' }));
    return svg;
  }

  // One ring: track, arc, and the figure in the middle.
  function buildRing(label, artefact) {
    var done = artefact.status === M.STATUS.COMPLETE;

    var wrap = doc.createElement('div');
    wrap.className = 'sring-wrap';

    var ring = doc.createElement('div');
    ring.className = 'sring' + (done ? ' is-done' : '');

    var svg = svgEl('svg', { viewBox: '0 0 40 40', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { class: 'sr-track', cx: 20, cy: 20, r: R }));
    var arc = svgEl('circle', { class: 'sr-arc', cx: 20, cy: 20, r: R });
    // ⚠️ Rendered at its REAL value here, not at zero. Nothing animates on load.
    arc.style.strokeDashoffset = offsetFor(done ? 100 : artefact.percent);
    svg.appendChild(arc);
    ring.appendChild(svg);

    var fig = doc.createElement('div');
    fig.className = 'sr-fig';
    if (done) fig.appendChild(checkSvg('sr-check'));
    else fig.textContent = (artefact.percent || 0) + '%';
    ring.appendChild(fig);

    wrap.appendChild(ring);

    var cap = doc.createElement('span');
    cap.className = 'sr-label';
    cap.textContent = label;
    wrap.appendChild(cap);

    // The accessible version of the same fact. The visual is aria-hidden, so
    // this is the only thing a screen reader gets — it must say what the ring
    // means, not what it looks like.
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label',
      label + ': ' + (done ? 'complete' : artefact.percent + ' per cent, ' +
      artefact.covered + ' of ' + artefact.total));

    // Kept for the animation pass, so it never re-reads the DOM to find them.
    wrap._arc = arc;
    wrap._fig = fig;
    wrap._ring = ring;
    wrap._target = done ? 100 : (artefact.percent || 0);
    wrap._done = done;
    return wrap;
  }

  /* ── rendering one card ────────────────────────────────────────────────── */

  function slugFromCard(card) {
    var a = card.querySelector('.lcard[href*="/skills/"], .lcard[href^="skills/"]');
    if (!a) return null;
    var m = a.getAttribute('href').match(/skills\/([^/]+)\//);
    return m ? m[1] : null;
  }

  function renderLaunchCard(el, artefact, kindLabel) {
    if (!el || !artefact || !artefact.known) return null;
    if (artefact.status === M.STATUS.NOT_STARTED) return null;   // keep the guest text

    var done = artefact.status === M.STATUS.COMPLETE;
    if (done) el.classList.add('lc-done');

    var state = doc.createElement('div');
    state.className = 'lc-state';
    var dot = doc.createElement('span');
    dot.className = 'lc-dot';
    state.appendChild(dot);
    state.appendChild(doc.createTextNode(done ? 'Completed' : 'In progress'));

    var meta = doc.createElement('div');
    meta.className = 'lc-meta';
    if (done) {
      var d = M.formatDate(artefact.completedAt);
      meta.innerHTML = 'Completed <strong>' + esc(d) + '</strong>';
      if (artefact.resume) {
        meta.innerHTML += '. Last reviewed in <strong>' + esc(artefact.resume.name) + '</strong>';
      }
    } else {
      meta.innerHTML = '<strong>' + artefact.covered + ' of ' + artefact.total + '</strong> ' +
        (kindLabel === 'Primer' ? 'slides' : 'sections');
      if (artefact.resume) {
        meta.innerHTML += ' · you left off in <strong>' + esc(artefact.resume.name) + '</strong>';
      }
    }

    var bar = doc.createElement('div');
    bar.className = 'lc-bar';
    var fill = doc.createElement('div');
    fill.className = 'lc-fill';
    // Real value at first paint, same rule as the rings.
    fill.style.width = (done ? 100 : artefact.percent) + '%';
    bar.appendChild(fill);

    // ⚠️ The description is REPLACED, not hidden, and only here. Leaving both
    // would put a generic sentence above a specific one saying the same thing.
    var desc = el.querySelector('.lcdesc');
    if (desc) desc.remove();

    var type = el.querySelector('.lctype');
    if (type && type.nextSibling) {
      el.insertBefore(state, type.nextSibling);
      el.insertBefore(meta, state.nextSibling);
      el.insertBefore(bar, meta.nextSibling);
    } else {
      el.appendChild(state); el.appendChild(meta); el.appendChild(bar);
    }

    // Resuming should say so on the button too.
    var cta = el.querySelector('.lccta');
    if (cta && cta.firstChild && cta.firstChild.nodeType === 3 && !done) {
      cta.firstChild.nodeValue = 'Resume ' + (kindLabel === 'Primer' ? 'primer' : 'plan');
    }

    bar._fill = fill;
    bar._target = done ? 100 : (artefact.percent || 0);
    return bar;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderCard(card, pair) {
    var header = card.querySelector('.sheader');
    var shc = card.querySelector('.shc');
    if (!header || !shc || !pair) return;

    // ⚠️ A "coming soon" card carries no chevron, no body, no click handler and
    // no tabindex — availability is already encoded structurally, so there is
    // nothing to gate on here beyond the absence of a body. Do not re-solve it.
    if (!card.querySelector('.sbody')) return;

    var rings = doc.createElement('div');
    rings.className = 'sprog';
    var primerRing = buildRing('Primer', pair.primer);
    var planRing = buildRing('Plan', pair.plan);
    rings.appendChild(primerRing);
    rings.appendChild(planRing);

    var toggle = header.querySelector('.stoggle');
    if (toggle) header.insertBefore(rings, toggle);
    else header.appendChild(rings);

    /* The status pill now says where the READER is, not that the skill exists.
       ⚠️ Rolled up from both artefacts, and it is a CONJUNCTION, never an
       average: complete only when both are, in progress the moment either has
       been touched. A finished primer beside an untouched plan is a started
       skill, not a half-finished one. */
    var badge = shc.querySelector('.sstatus');
    if (badge) {
      var both = pair.primer.status === M.STATUS.COMPLETE && pair.plan.status === M.STATUS.COMPLETE;
      var any = pair.primer.status !== M.STATUS.NOT_STARTED || pair.plan.status !== M.STATUS.NOT_STARTED;
      badge.classList.remove('ss-avail');
      if (both) { badge.classList.add('ss-done'); badge.textContent = 'Complete'; }
      else if (any) { badge.classList.add('ss-ip'); badge.textContent = 'In progress'; }
      else { badge.classList.add('ss-ns'); badge.textContent = 'Not started'; }
    }

    /* A skill counts as complete only when BOTH artefacts are.
       ⚠️ The two rings are deliberately never averaged, and this is not an
       average — it is a conjunction. A finished primer beside an untouched plan
       is not "half done"; it is a started skill. */
    if (pair.primer.status === M.STATUS.COMPLETE && pair.plan.status === M.STATUS.COMPLETE) {
      card.classList.add('sk-done');
      var name = shc.querySelector('.sname');
      if (name && !name.querySelector('.sname-check')) {
        var badge = doc.createElement('span');
        badge.className = 'sname-check';
        badge.setAttribute('aria-label', 'Complete');
        badge.appendChild(checkSvg());
        name.appendChild(badge);
      }
    }

    var cards = card.querySelectorAll('.lcard');
    var bars = [];
    for (var i = 0; i < cards.length; i++) {
      var href = cards[i].getAttribute('href') || '';
      var isPrimer = /primer\.html/.test(href);
      var bar = renderLaunchCard(cards[i], isPrimer ? pair.primer : pair.plan,
                                 isPrimer ? 'Primer' : 'Plan');
      if (bar) bars.push(bar);
    }

    card._rings = [primerRing, planRing];
    card._bars = bars;
  }

  /* ── the animation, and the three traps it has to avoid ─────────────────
     1. The remove-class / read offsetWidth / re-add trick DOES NOT restart a
        transitioned property. Removing the class does not snap the value back,
        it TRANSITIONS back — so at the moment you re-add it the value is still
        at the old target and nothing happens. The transition has to be
        suppressed while the value is reset, then re-enabled before the target
        is re-applied, with a style read after each step.
     2. Scope the suppression PER CARD. One shared "no transitions" class let a
        bar reset collapse a ring transition already in flight, which looked
        exactly like the ring animation never firing.
     3. Restarting a transition twice inside one frame leaves it stuck at its
        start value — an empty ring beside a figure reading 46%. A fast
        double-click on the chevron is enough. So requests are collapsed and
        kicked off on the next frame.
  ─────────────────────────────────────────────────────────────────────── */

  function restartRing(wrap) {
    var arc = wrap._arc;
    arc.style.transition = 'none';                 // suppress
    arc.style.strokeDashoffset = C;                // reset to empty
    void arc.getBoundingClientRect();              // style read — trap 1
    wrap._ring.classList.add('is-anim');
    arc.style.transition = '';                     // re-enable from CSS
    void arc.getBoundingClientRect();              // style read — trap 1
    arc.style.strokeDashoffset = offsetFor(wrap._target);
  }

  function restartBar(bar) {
    var fill = bar._fill;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.getBoundingClientRect();
    bar.classList.add('is-anim');
    fill.style.transition = '';
    void fill.getBoundingClientRect();
    fill.style.width = bar._target + '%';
  }

  // ⚠️ The figure is EASED over the same duration, not read back from the live
  // stroke-dashoffset each frame. Reading it back guarantees the number and the
  // arc cannot drift, but costs a forced style read per ring per frame — fine
  // for a prototype, wrong at nine cards and eighteen rings.
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(wrap) {
    if (wrap._done) return;                        // a check does not count up
    var target = wrap._target;
    var start = null;
    if (wrap._raf) global.cancelAnimationFrame(wrap._raf);
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / RING_MS);
      wrap._fig.textContent = Math.round(easeOutCubic(t) * target) + '%';
      if (t < 1) wrap._raf = global.requestAnimationFrame(step);
      else wrap._raf = null;
    }
    wrap._raf = global.requestAnimationFrame(step);
  }

  function animateCard(card) {
    if (!card._rings) return;

    if (reducedMotion()) {
      // Final values, instantly. Never a faster sweep.
      for (var r = 0; r < card._rings.length; r++) {
        var w = card._rings[r];
        w._arc.style.strokeDashoffset = offsetFor(w._target);
        if (!w._done) w._fig.textContent = w._target + '%';
      }
      for (var b = 0; b < card._bars.length; b++) {
        card._bars[b]._fill.style.width = card._bars[b]._target + '%';
      }
      // The check is never hidden under reduced motion — there is no sweep for
      // it to be held back from.
      for (var c = 0; c < card._rings.length; c++) {
        card._rings[c]._ring.classList.remove('is-sweeping');
      }
      return;
    }

    // Trap 3: collapse repeats, and kick off on the NEXT frame.
    if (card._pending) global.cancelAnimationFrame(card._pending);
    if (card._pulseTimer) global.clearTimeout(card._pulseTimer);

    card._pending = global.requestAnimationFrame(function () {
      card._pending = null;
      for (var i = 0; i < card._rings.length; i++) {
        var w = card._rings[i];
        // Hold the check back so the arc is not drawing itself around an
        // answer that is already on screen.
        if (w._done) w._ring.classList.add('is-sweeping');
        restartRing(w);
        countUp(w);
        w._ring.classList.remove('is-pulse');
      }
      for (var j = 0; j < card._bars.length; j++) restartBar(card._bars[j]);

      // The landing, overlapping the last 200ms of the sweep — and the moment
      // the check arrives on a completed ring.
      card._pulseTimer = global.setTimeout(function () {
        for (var k = 0; k < card._rings.length; k++) {
          var ring = card._rings[k]._ring;
          ring.classList.remove('is-sweeping');
          ring.classList.remove('is-pulse');
          void ring.getBoundingClientRect();
          ring.classList.add('is-pulse');
        }
      }, Math.round(RING_MS * PULSE_AT));
    });
  }

  /* ── the summary strip ─────────────────────────────────────────────────── */

  function renderSummary(summary) {
    var host = doc.querySelector('.lib-guest-note');
    if (!host || !host.parentNode) return;

    var strip = doc.createElement('div');
    strip.className = 'lib-summary';

    var counts = doc.createElement('div');
    counts.className = 'ls-counts';
    var bits = [];
    if (summary.complete) bits.push('<strong>' + summary.complete + '</strong> completed');
    if (summary.started) bits.push('<strong>' + summary.started + '</strong> in progress');
    if (!bits.length) {
      counts.innerHTML = 'Nothing started yet — your progress will show here as you go.';
    } else {
      counts.innerHTML = bits.join(' · ') + ' of <strong>' + summary.artefacts +
                         '</strong> primers and plans';
    }
    strip.appendChild(counts);

    /* ⚠️ NO RESUME SHORTCUT HERE, and this reverses the original design.
       "Pick up where you left off" has to choose ONE artefact, and the only
       basis available is `updated_at` — most recently touched. With several
       plans in progress that is a guess about intent dressed up as a
       convenience, and a wrong guess is worse than no link: it sends someone
       into the thing they were not thinking about.
       The reader already has a per-skill answer one chevron away, where the
       resume point is stated next to the skill it belongs to and they choose.
       `summarise()` still computes inFlight — the dashboard may have a surface
       where a single next step IS the point. It is not this one. */

    host.parentNode.insertBefore(strip, host.nextSibling);
    strip.classList.add('is-ready');
  }

  /* ── wiring ────────────────────────────────────────────────────────────── */

  function wireExpansion(card) {
    var header = card.querySelector('.sheader');
    if (!header) return;
    // The page's own toggleSkill() runs from the inline onclick. This listens
    // alongside it rather than replacing it — the expansion behaviour is the
    // page's, and this only reacts to the result.
    header.addEventListener('click', function () { maybeAnimate(card); });
    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') maybeAnimate(card);
    });
  }

  function maybeAnimate(card) {
    // Read the state AFTER the page's own handler has flipped it. A frame is
    // enough; the class is set synchronously by toggleSkill().
    global.requestAnimationFrame(function () {
      var header = card.querySelector('.sheader');
      var open = header && header.getAttribute('aria-expanded') === 'true';
      if (open) animateCard(card);
    });
  }

  var painted = false;

  function paint(data) {
    if (!data || !data.progress) return;

    /* ⚠️ ONCE ONLY. onAuthChange fires on more than signing in — a token
       refresh fires it too, and Supabase refreshes on a timer. Without this
       guard a session left open long enough repaints and every card ends up
       with two sets of rings, appended one after the other. Reproduced by
       accident while debugging: four rings on a two-artefact card. */
    if (painted) return;
    painted = true;

    injectCss();

    var cards = doc.querySelectorAll('.scard');
    for (var i = 0; i < cards.length; i++) {
      var slug = slugFromCard(cards[i]);
      if (!slug || !data.progress[slug]) continue;
      renderCard(cards[i], data.progress[slug]);
      wireExpansion(cards[i]);
    }

    renderSummary(data.summary);
  }

  /* ── start ─────────────────────────────────────────────────────────────
     Polls for AmplifiedAuth because nav.js appends the auth stack with defer,
     so it lands after this file has run. Bounded: if the stack never arrives —
     blocked host, offline, a CSP — we simply stop, and the page stays exactly
     as a guest sees it. Same shape as progress.js's whenAuth.
  ─────────────────────────────────────────────────────────────────────── */
  function start() {
    var waited = 0;
    (function poll() {
      var auth = global.AmplifiedAuth;
      if (auth) {
        auth.onAuthChange(function (session) {
          if (!session) return;               // guest, or a stale token resolved
          M = global.AmplifiedSkillsProgress;
          if (!M) return;
          M.load({}).then(function (data) {
            if (data) { try { paint(data); } catch (e) { /* leave the guest page */ } }
          });
        });
        return;
      }
      waited += 60;
      if (waited > 6000) return;
      global.setTimeout(poll, 60);
    })();
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
