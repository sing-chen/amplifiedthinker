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
    if (/about/i.test(pathname))                     return 'about';
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
    var names = { 'analytical-thinking': 'Analytical Thinking' };
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
    '  font-family: "DM Sans", "Inter", system-ui, sans-serif;',
    '  -webkit-font-smoothing: antialiased;',
    '  box-sizing: border-box;',
    '}',
    '#site-nav a { text-decoration: none; }',
    '.snav-brand { margin-right: auto; line-height: 1; text-decoration: none; display: flex; align-items: center; gap: 0px; }',
    '.snav-brand-logo { display: block; width: 75px; height: 75px; object-fit: contain; flex-shrink: 0; }',
    '.snav-brand-text { display: flex; flex-direction: column; gap: 2px; }',
    '.snav-brand-name {',
    '  font-family: "Lora", Georgia, serif;',
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

    /* Skill context bar */
    '#site-skill-bar {',
    '  position: fixed; top: var(--site-nav-h); left: 0; right: 0; z-index: 8999;',
    '  height: ' + SKILL_H + 'px;',
    '  background: #16403B;',
    '  display: flex; align-items: center;',
    '  padding: 0 32px; gap: 16px;',
    '  font-family: "DM Sans", "Inter", system-ui, sans-serif;',
    '  font-size: 12px;',
    '  border-bottom: 1px solid rgba(255,255,255,0.06);',
    '  box-sizing: border-box;',
    '}',
    '.ssb-crumb { color: rgba(255,255,255,0.72); display: flex; align-items: center; gap: 8px; }',
    '.ssb-crumb a { color: #ACC4B6; text-decoration: none; }',
    '.ssb-crumb a:hover { color: #C4D8CC; }',
    '.ssb-crumb-sep { color: rgba(255,255,255,0.35); }',
    '.ssb-crumb-current { color: rgba(255,255,255,0.88); }',
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
    '#site-nav a:focus-visible, .ssb-btn:focus-visible {',
    '  outline: 2px solid #ACC4B6;',
    '  outline-offset: 3px;',
    '  border-radius: 4px;',
    '}',
  ].join('\n');

  /* ── Build nav HTML ──────────────────────────────────────────────────── */
  function link(href, label, key) {
    var cls = activePage === key ? ' class="snav-active"' : '';
    return '<li><a href="' + root(href) + '"' + cls + '>' + label + '</a></li>';
  }

  var navHTML = [
    '<nav id="site-nav" role="navigation" aria-label="Site navigation">',
    '  <a href="' + root('index.html') + '" class="snav-brand">',
    '    <img src="' + root('images/amplified_site_logo.png') + '" alt="Amplified" class="snav-brand-logo" width="36" height="36">',
    '    <span class="snav-brand-text">',
    '      <span class="snav-brand-name">Amplified</span>',
    '      <span class="snav-brand-tag">Build the capability that keeps compounding.</span>',
    '    </span>',
    '  </a>',
    '  <ul class="snav-links">',
    link('index.html',         'Home',          'home'),
    link('future-skills.html', 'Future Skills', 'future-skills'),
    link('about.html',         'About',         'about'),
    '  </ul>',
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
      '    <a href="' + root('future-skills.html') + '">Future Skills</a>',
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

  function injectNav() {
    // Inject styles into <head> if not already present
    if (!document.getElementById('site-nav-styles')) {
      var built = buildNavElements();
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

  /* ── Entry point ─────────────────────────────────────────────────────── */
  function init() {
    injectNav();
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