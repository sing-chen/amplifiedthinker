(function () {
  'use strict';

  var NAV_H = 56;   // px — site nav bar height
  var SKILL_H = 40; // px — skill context bar height

  /* ── Depth detection (works on file://, http://, and GitHub Pages subfolders)
     Strategy: compare the directory of the current PAGE against the directory
     of THIS SCRIPT. nav.js always lives at the site root. The page may be
     0, 1, or 2 levels deep relative to that root.
     We count how many directory segments the page path has beyond the script's
     directory, then build relative "../" prefixes accordingly.
  ─────────────────────────────────────────────────────────────────────────── */
  function getDirSegments(url) {
    // Strip protocol+host, strip filename, split on /
    var path = url.replace(/^[a-z]+:\/\/[^\/]*/i, ''); // remove protocol+host (or "null" on file://)
    path = path.replace(/^null/i, '');                  // file:// origin is "null" in some browsers
    var dir = path.replace(/\/[^\/]*$/, '');             // strip filename
    return dir.replace(/^\//, '').split('/').filter(Boolean);
  }

  var scriptSrc  = (document.currentScript || {}).src || '';
  var pageSrc    = window.location.href;

  var scriptSegs = getDirSegments(scriptSrc); // e.g. [] for root nav.js
  var pageSegs   = getDirSegments(pageSrc);   // e.g. ['skills','analytical-thinking'] for skill pages

  // How many levels deeper is the page than the script?
  var depth = Math.max(0, pageSegs.length - scriptSegs.length);

  function root(path) {
    if (depth === 0) return './' + path;
    var prefix = [];
    for (var i = 0; i < depth; i++) prefix.push('..');
    return prefix.join('/') + '/' + path;
  }

  /* ── Active page detection ───────────────────────────────────────────── */
  var pathname = window.location.pathname;

  var activePage = (function () {
    if (/future-skills/i.test(pathname))             return 'future-skills';
    if (/my-people/i.test(pathname))                 return 'my-people';
    if (/\/news/i.test(pathname))                    return 'news';
    if (/about/i.test(pathname))                     return 'about';
    if (/\/search/i.test(pathname))                  return 'search';
    if (/\/skills\//i.test(pathname))                return 'skill';
    return 'home';
  })();

  /* ── Skill context ───────────────────────────────────────────────────── */
  var skillSlug = '';
  var skillName = '';
  var isPrimer  = false;
  var isPlan    = false;

  if (activePage === 'skill') {
    var m = pathname.match(/skills\/([^\/]+)/i);
    skillSlug = m ? m[1] : '';
    var names = { 'analytical-thinking': 'Analytical Thinking', 'critical-thinking': 'Critical Thinking', 'creative-thinking': 'Creative Thinking', 'systems-thinking': 'Systems Thinking' };
    skillName = names[skillSlug] || skillSlug.replace(/-/g, ' ');
    var pageFile = pathname.split('/').pop() || '';
    isPrimer  = /^primer/i.test(pageFile);
    isPlan    = /^plan/i.test(pageFile);
  }

  /* ── CSS ─────────────────────────────────────────────────────────────── */
  var totalOffset = NAV_H + (activePage === 'skill' && skillSlug ? SKILL_H : 0);

  var css = [
    ':root { --site-nav-h: ' + NAV_H + 'px; --site-total-offset: ' + totalOffset + 'px; }',

    /* Site nav bar */
    '#site-nav {',
    '  position: fixed; top: 0; left: 0; right: 0; z-index: 9000;',
    '  height: var(--site-nav-h);',
    '  background: #1B4A44;',
    '  display: flex; align-items: center;',
    '  padding: 0 32px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.07);',
    '  font-family: "Inter", system-ui, sans-serif;',
    '  -webkit-font-smoothing: antialiased;',
    '  box-sizing: border-box;',
    '}',
    '#site-nav a { text-decoration: none; }',
    '.snav-brand { margin-right: auto; line-height: 1; text-decoration: none; display: flex; align-items: center; gap: 0px; }',
    '.snav-brand-logo { display: block; width: 75px; height: 75px; object-fit: contain; flex-shrink: 0; }',
    '.snav-brand-text { display: flex; flex-direction: column; gap: 2px; }',
    '.snav-brand-name {',
    '  font-family: "Poppins", sans-serif;',
    '  font-size: 15px; font-weight: 600; color: #fff;',
    '  display: block; line-height: 1.2;',
    '}',
    '.snav-brand-tag { font-size: 12px; color: #ACC4B6; letter-spacing: 0.01em; }',
    '.snav-links { display: flex; gap: 2px; list-style: none; margin: 0; padding: 0; }',
    '.snav-links a {',
    '  font-size: 13px; font-weight: 500;',
    '  color: rgba(255,255,255,0.88);',
    '  padding: 5px 12px; border-radius: 5px;',
    '  transition: color 0.15s, background 0.15s;',
    '  white-space: nowrap;',
    '}',
    '.snav-links a:hover { color: #fff; background: rgba(255,255,255,0.08); }',
    '.snav-links a.snav-active { color: #1B4A44; background: #ACC4B6; }',

    /* Search icon button */
    '.snav-search {',
    '  display: flex;',
    '  align-items: center; justify-content: center;',
    '  width: 34px; height: 34px;',
    '  background: none; border: none; border-radius: 5px;',
    '  color: rgba(255,255,255,0.75); cursor: pointer; padding: 0;',
    '  margin-left: 4px; flex-shrink: 0;',
    '  text-decoration: none;',
    '  transition: background 0.15s, color 0.15s;',
    '}',
    '.snav-search:hover { background: rgba(255,255,255,0.08); color: #fff; }',
    '.snav-search.snav-search-active { color: #ACC4B6; }',
    '.snav-search svg {',
    '  width: 18px; height: 18px;',
    '  stroke: currentColor; fill: none;',
    '  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
    '}',

    /* Mobile menu toggle (hidden on desktop) */
    '.snav-toggle {',
    '  display: none;',
    '  align-items: center; justify-content: center;',
    '  width: 36px; height: 36px;',
    '  background: none; border: none; border-radius: 5px;',
    '  color: #fff; cursor: pointer; padding: 0;',
    '  margin-left: 8px; flex-shrink: 0;',
    '  transition: background 0.15s;',
    '}',
    '.snav-toggle:hover { background: rgba(255,255,255,0.08); }',
    '.snav-toggle svg {',
    '  width: 22px; height: 22px;',
    '  stroke: currentColor; fill: none;',
    '  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
    '}',
    '.snav-toggle .snav-icon-close { display: none; }',
    '#site-nav.menu-open .snav-toggle .snav-icon-menu  { display: none; }',
    '#site-nav.menu-open .snav-toggle .snav-icon-close { display: block; }',

    /* Skill context bar */
    '#site-skill-bar {',
    '  position: fixed; top: var(--site-nav-h); left: 0; right: 0; z-index: 8999;',
    '  height: ' + SKILL_H + 'px;',
    '  background: #16403B;',
    '  display: flex; align-items: center;',
    '  padding: 0 32px; gap: 16px;',
    '  font-family: "Inter", system-ui, sans-serif;',
    '  font-size: 12px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.06);',
    '  box-sizing: border-box;',
    '}',
    '.ssb-crumb { color: rgba(255,255,255,0.72); display: flex; align-items: center; gap: 8px; min-width: 0; }',
    '.ssb-crumb a { color: #ACC4B6; text-decoration: none; }',
    '.ssb-crumb a:hover { color: #C4D8CC; }',
    '.ssb-crumb-back { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }',
    '.ssb-back-icon {',
    '  display: none;',
    '  width: 14px; height: 14px; flex-shrink: 0;',
    '  stroke: currentColor; fill: none;',
    '  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
    '}',
    '.ssb-crumb-sep { color: rgba(255,255,255,0.35); flex-shrink: 0; }',
    '.ssb-crumb-current {',
    '  color: rgba(255,255,255,0.88);',
    '  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
    '}',
    '.ssb-spacer { flex: 1; }',
    '.ssb-switcher { display: flex; gap: 6px; }',
    '.ssb-btn {',
    '  font-size: 11.5px; font-weight: 500;',
    '  padding: 4px 12px; border-radius: 4px;',
    '  color: #ACC4B6;',
    '  border: 1px solid rgba(172,196,182,0.3);',
    '  background: transparent;',
    '  text-decoration: none;',
    '  transition: background 0.15s, color 0.15s, border-color 0.15s;',
    '  white-space: nowrap;',
    '}',
    '.ssb-btn:hover { background: rgba(172,196,182,0.1); border-color: rgba(172,196,182,0.5); color: #C4D8CC; }',
    '.ssb-btn.ssb-btn-active { background: #2D756F; border-color: transparent; color: #fff; }',

    /* Focus styles for injected nav elements */
    '#site-nav a:focus-visible, .ssb-btn:focus-visible, .snav-toggle:focus-visible, .snav-search:focus-visible {',
    '  outline: 2px solid #ACC4B6;',
    '  outline-offset: 3px;',
    '  border-radius: 4px;',
    '}',

    /* ── Mobile (≤768px): collapse site nav into a toggleable menu ────── */
    '@media (max-width: 768px) {',
    '  #site-nav { padding: 0 16px; }',
    '  .snav-brand-tag { display: none; }',
    '  .snav-brand-logo { width: 36px; height: 36px; }',
    '  .snav-toggle { display: flex; }',
    '  .snav-links {',
    '    display: none;',
    '    position: absolute;',
    '    top: 100%; left: 0; right: 0;',
    '    flex-direction: column;',
    '    gap: 2px;',
    '    background: #1B4A44;',
    '    padding: 8px 16px 16px;',
    '    border-bottom: 1px solid rgba(255,255,255,0.08);',
    '    box-shadow: 0 8px 20px rgba(0,0,0,0.2);',
    '  }',
    '  #site-nav.menu-open .snav-links { display: flex; }',
    '  .snav-links a {',
    '    display: block;',
    '    padding: 12px 10px;',
    '    font-size: 15px;',
    '    border-radius: 6px;',
    '  }',
    '',
    '  /* Skill context bar: collapse "Future Skills" to a back-chevron,',
    '     drop the separator, ellipsize a long current-skill name, and',
    '     tighten the switcher so everything fits on one 40px-tall row. */',
    '  #site-skill-bar { padding: 0 16px; gap: 8px; }',
    '  .ssb-crumb-label { display: none; }',
    '  .ssb-back-icon { display: block; }',
    '  .ssb-crumb-back {',
    '    /* expand tap target to ~34px without shifting surrounding layout */',
    '    padding: 12px 10px;',
    '    margin: -12px -10px;',
    '  }',
    '  .ssb-crumb-sep { display: none; }',
    '  .ssb-switcher { gap: 4px; }',
    '  .ssb-btn { padding: 4px 8px; font-size: 11px; }',
    '}',
  ].join('\n');

  /* ── Build nav HTML ──────────────────────────────────────────────────── */
  function link(href, label, key) {
    var cls = activePage === key ? ' class="snav-active"' : '';
    return '<li><a href="' + root(href) + '"' + cls + '>' + label + '</a></li>';
  }

  var searchActiveCls = activePage === 'search' ? ' snav-search-active' : '';
  var navHTML = [
    '<nav id="site-nav" role="navigation" aria-label="Site navigation">',
    '  <a href="' + root('index.html') + '" class="snav-brand">',
    '    <img src="' + root('images/amplified_site_logo.png') + '" alt="Amplified Thinker" class="snav-brand-logo" width="36" height="36">',
    '    <span class="snav-brand-text">',
    '      <span class="snav-brand-name">Amplified Thinker</span>',
    '      <span class="snav-brand-tag">Built for a world that keeps changing.</span>',
    '    </span>',
    '  </a>',
    '  <ul class="snav-links" id="snav-links">',
    link('index.html',         'Home',          'home'),
    link('future-skills.html', 'Future Skills', 'future-skills'),
    link('my-people.html',     'My People',     'my-people'),
    link('news.html',          'News',          'news'),
    link('about.html',         'About',         'about'),
    '  </ul>',
    '  <a href="' + root('search.html') + '" class="snav-search' + searchActiveCls + '" aria-label="Search">',
    '    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>',
    '  </a>',
    '  <button type="button" id="snav-toggle" class="snav-toggle" aria-expanded="false" aria-controls="snav-links" aria-label="Open menu">',
    '    <svg class="snav-icon-menu" viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
    '    <svg class="snav-icon-close" viewBox="0 0 24 24" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>',
    '  </button>',
    '</nav>',
  ].join('');

  var skillBarHTML = '';
  if (activePage === 'skill' && skillSlug) {
    var primerHref = root('skills/' + skillSlug + '/primer.html');
    var planHref   = root('skills/' + skillSlug + '/plan.html');
    var primerCls  = isPrimer ? ' ssb-btn-active' : '';
    var planCls    = isPlan   ? ' ssb-btn-active' : '';
    skillBarHTML = [
      '<div id="site-skill-bar">',
      '  <div class="ssb-crumb">',
      '    <a href="' + root('future-skills.html') + '" class="ssb-crumb-back" aria-label="Back to Future Skills">',
      '      <svg class="ssb-back-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
      '      <span class="ssb-crumb-label">Future Skills</span>',
      '    </a>',
      '    <span class="ssb-crumb-sep">›</span>',
      '    <span class="ssb-crumb-current">' + skillName + '</span>',
      '  </div>',
      '  <div class="ssb-spacer"></div>',
      '  <div class="ssb-switcher">',
      '    <a href="' + primerHref + '" class="ssb-btn' + primerCls + '">Primer</a>',
      '    <a href="' + planHref   + '" class="ssb-btn' + planCls   + '">Full Plan</a>',
      '  </div>',
      '</div>',
    ].join('');
  }

  /* ── Inject nav into DOM ─────────────────────────────────────────────── */
  function buildNavElements() {
    var styleEl = document.createElement('style');
    styleEl.id = 'site-nav-styles';
    styleEl.textContent = css;

    var wrapper = document.createElement('div');
    wrapper.innerHTML = navHTML + skillBarHTML;

    return { styleEl: styleEl, nodes: Array.from(wrapper.childNodes) };
  }

  function applyLayoutFixes() {
    // Body offset
    document.body.style.paddingTop = totalOffset + 'px';

    // Plan: shift fixed left nav-rail down
    var rail = document.querySelector('.nav-rail');
    if (rail) {
      rail.style.top       = totalOffset + 'px';
      rail.style.height    = 'calc(100vh - ' + totalOffset + 'px)';
      rail.style.minHeight = 'calc(100vh - ' + totalOffset + 'px)';
    }

    // Primer: deck-stage height is set by CSS override in the file itself,
    // but also set the custom property in case the bundle reads it
    document.documentElement.style.setProperty('--deck-offset', totalOffset + 'px');
  }

  function injectFavicon() {
    if (!document.querySelector('link[rel="icon"]')) {
      var favicon = document.createElement('link');
      favicon.rel  = 'icon';
      favicon.type = 'image/png';
      favicon.href = root('images/favicon.png');
      document.head.appendChild(favicon);
    }
  }

  function injectNav() {
    // Inject styles into <head> if not already present
    if (!document.getElementById('site-nav-styles')) {
      var built = buildNavElements();
      injectFavicon();
      document.head.appendChild(built.styleEl);

      // Prepend nav nodes to body
      var ref = document.body.firstChild;
      built.nodes.forEach(function (node) {
        document.body.insertBefore(node, ref);
      });
    }
    applyLayoutFixes();
  }

  /* ── Guard against the Primer bundle wiping the nav ─────────────────────
     The deck-stage bundler replaces body children on initialisation.
     A MutationObserver watches for #site-nav being removed and re-injects.
  ─────────────────────────────────────────────────────────────────────── */
  function watchForWipe() {
    if (typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].removedNodes.length > 0) {
          if (!document.getElementById('site-nav')) {
            observer.disconnect();
            // Brief delay lets the bundle finish its DOM replacement
            setTimeout(function () {
              injectNav();
              watchForWipe(); // re-attach observer after re-inject
            }, 50);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true });
  }

  /* ── Mobile menu toggle ──────────────────────────────────────────────
     Delegated on document/window so it keeps working even if the Primer
     bundle wipes and re-inserts #site-nav.
  ─────────────────────────────────────────────────────────────────────── */
  function setupMobileMenu() {
    if (window.__snavMenuInit) return;
    window.__snavMenuInit = true;

    function closeMenu(nav) {
      nav.classList.remove('menu-open');
      var toggle = document.getElementById('snav-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
    }

    document.addEventListener('click', function (e) {
      var nav = document.getElementById('site-nav');
      if (!nav) return;

      var toggle = e.target.closest('#snav-toggle');
      if (toggle) {
        var isOpen = nav.classList.toggle('menu-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        return;
      }

      if (nav.classList.contains('menu-open')) {
        // Close on link click, or on any click outside the nav
        if (e.target.closest('.snav-links a') || !nav.contains(e.target)) {
          closeMenu(nav);
        }
      }
    });

    document.addEventListener('keydown', function (e) {
      var nav = document.getElementById('site-nav');
      if (!nav || !nav.classList.contains('menu-open')) return;
      if (e.key === 'Escape') {
        closeMenu(nav);
        var toggle = document.getElementById('snav-toggle');
        if (toggle) toggle.focus();
      }
    });

    // If the viewport grows past the breakpoint while open, reset state
    window.addEventListener('resize', function () {
      var nav = document.getElementById('site-nav');
      if (nav && window.innerWidth > 768 && nav.classList.contains('menu-open')) {
        closeMenu(nav);
      }
    });
  }

  /* ── Entry point ─────────────────────────────────────────────────────── */
  function init() {
    injectNav();
    setupMobileMenu();
    // Only watch for wipe on the Primer page (has deck-stage)
    if (activePage === 'skill' && isPrimer) {
      watchForWipe();
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();