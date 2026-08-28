(function () {
  'use strict';

  /* ── Theme (light/dark) ──────────────────────────────────────────────
     Applied as early as possible (top of this IIFE, before nav injection)
     to minimize flash-of-wrong-theme. Explicit user choice (localStorage)
     wins; otherwise falls back to the OS/browser's prefers-color-scheme. */
  var THEME_KEY = 'theme';

  function getStoredTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function getPreferredTheme() {
    var stored = getStoredTheme();
    if (stored === 'light' || stored === 'dark') return stored;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }

  document.documentElement.setAttribute('data-theme', getPreferredTheme());

  var NAV_H = 56;   // px — site nav bar height
  var SKILL_H = 40; // px — skill context bar height

  /* ── Depth detection (works on file://, http://, and any sub-path deployment)
     ⚠️ Kept after the GitHub Pages origin was retired on 2026-08-26. Pages was
     one caller, not the reason: this also carries `file://` and the ten skill
     pages sitting at three different depths. Do not flatten it to a leading
     slash on the grounds that there is one origin now.
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
    var names = { 'analytical-thinking': 'Analytical Thinking', 'critical-thinking': 'Critical Thinking', 'creative-thinking': 'Creative Thinking', 'systems-thinking': 'Systems Thinking', 'strategic-synthesis': 'Strategic Synthesis & Decision-Making' };
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
    '  font-family: var(--font-body);',
    '  -webkit-font-smoothing: antialiased;',
    '  box-sizing: border-box;',
    '}',
    '#site-nav a { text-decoration: none; }',
    '.snav-brand { margin-right: auto; line-height: 1; text-decoration: none; display: flex; align-items: center; gap: 0px; }',
    '.snav-brand-logo { display: block; width: 75px; height: 75px; object-fit: contain; flex-shrink: 0; }',
    '.snav-brand-text { display: flex; flex-direction: column; gap: 2px; }',
    /* Two-tone wordmark: "Amplified" heavy against "Thinker" light — the
       site's weight-spread gesture applied to its own name. The 700/300 pair
       needs the variable font's full weight range, which fonts.css retains.
       The nav is a fixed dark band in both themes, so the dimmed colour is a
       literal on purpose, like every other colour in this bar. */
    '.snav-brand-name {',
    '  font-family: var(--font-display);',
    '  font-size: 15px; font-weight: 700; color: #fff;',
    '  letter-spacing: -0.01em;',
    '  display: block; line-height: 1.2;',
    '}',
    '.snav-brand-thin { font-weight: 300; color: rgba(238,242,239,0.62); }',
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

    /* Theme (light/dark) toggle */
    '.snav-theme-toggle {',
    '  display: flex;',
    '  align-items: center; justify-content: center;',
    '  width: 34px; height: 34px;',
    '  background: none; border: none; border-radius: 5px;',
    '  color: rgba(255,255,255,0.75); cursor: pointer; padding: 0;',
    '  margin-left: 4px; flex-shrink: 0;',
    '  transition: background 0.15s, color 0.15s;',
    '}',
    '.snav-theme-toggle:hover { background: rgba(255,255,255,0.08); color: #fff; }',
    '.snav-theme-toggle svg {',
    '  width: 18px; height: 18px;',
    '  stroke: currentColor; fill: none;',
    '  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;',
    '}',
    '.snav-theme-icon-sun { display: none; }',
    '[data-theme="dark"] .snav-theme-icon-moon { display: none; }',
    '[data-theme="dark"] .snav-theme-icon-sun { display: block; }',

    /* Auth control (filled in by auth.js; empty and inert for guests until
       the session check settles, and permanently empty if Supabase is
       unreachable — the nav must never depend on it) */
    '.snav-auth {',
    '  position: relative;',
    '  display: flex; align-items: center; justify-content: center;',
    '  min-width: 34px; height: 34px;',
    '  margin-left: 4px; flex-shrink: 0;',
    '}',
    /* Outlined rather than plain text, borrowing the skill bar's .ssb-btn
       language. As a bare link it read as a nav item that had drifted past the
       search and theme icons; as a button the separation becomes the point —
       it is an action, not a destination, and it sits where account controls
       are looked for. */
    '.snav-auth-signin {',
    '  font-size: 12.5px; font-weight: 500;',
    '  color: #ACC4B6;',
    '  padding: 5px 12px; border-radius: 5px;',
    '  border: 1px solid rgba(172,196,182,0.35);',
    '  white-space: nowrap;',
    '  transition: color 0.15s, background 0.15s, border-color 0.15s;',
    '}',
    '.snav-auth-signin:hover {',
    '  color: #C4D8CC; background: rgba(172,196,182,0.12);',
    '  border-color: rgba(172,196,182,0.6);',
    '}',
    /* ⚠️ Warm cream, and NOT sage — the swap is the point.
       The avatar used #ACC4B6 on #1B4A44, which is character-for-character the
       same pair as `.snav-links a.snav-active` above: the pill marking which
       page you are on. Two different meanings wearing one colour, eight pixels
       apart. Nothing was broken; it just quietly read as another nav item.
       --warm-cream is the only token in the palette that is not a cool green,
       so it separates from every other thing in this bar by hue rather than by
       shade. 7.2:1 against the bar, 6.9:1 for the letter on it. */
    '.snav-auth-avatar {',
    '  width: 30px; height: 30px; border-radius: 50%;',
    '  background: #EAD9C8; color: #1F4D4A;',
    '  border: none; cursor: pointer; padding: 0;',
    '  font-family: var(--font-body);',
    '  font-size: 13px; font-weight: 600;',
    '  display: flex; align-items: center; justify-content: center;',
    '}',
    '.snav-auth-avatar:hover { background: #DFC9B4; }',
    '.snav-auth-menu {',
    '  position: absolute; top: calc(100% + 8px); right: 0;',
    '  min-width: 200px; z-index: 9001;',
    '  background: #1B4A44;',
    '  border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;',
    '  padding: 8px;',
    '  box-shadow: 0 8px 20px rgba(0,0,0,0.25);',
    '  display: flex; flex-direction: column; gap: 2px;',
    '}',
    /* display:flex above would otherwise defeat the hidden attribute */
    '.snav-auth-menu[hidden] { display: none; }',
    '.snav-auth-email {',
    '  margin: 0 0 6px; padding: 4px 8px;',
    '  font-size: 11.5px; color: rgba(255,255,255,0.6);',
    '  word-break: break-all;',
    '}',
    '.snav-auth-menu a, .snav-auth-menu button {',
    '  font-family: var(--font-body);',
    '  font-size: 13px; font-weight: 500;',
    '  color: rgba(255,255,255,0.88);',
    '  background: none; border: none;',
    '  text-align: left; padding: 8px; border-radius: 5px;',
    '  cursor: pointer;',
    '}',
    '.snav-auth-menu a:hover, .snav-auth-menu button:hover {',
    '  background: rgba(255,255,255,0.08); color: #fff;',
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
    '  font-family: var(--font-body);',
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
    '.ssb-btn.ssb-btn-active { background: #26605B; border-color: transparent; color: #fff; }',

    /* Focus styles for injected nav elements */
    '#site-nav a:focus-visible, .ssb-btn:focus-visible, .snav-toggle:focus-visible, .snav-search:focus-visible, .snav-auth-avatar:focus-visible, .snav-auth-menu button:focus-visible {',
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
    '      <span class="snav-brand-name">Amplified <span class="snav-brand-thin">Thinker</span></span>',
    '      <span class="snav-brand-tag">Built for a world that keeps changing.</span>',
    '    </span>',
    '  </a>',
    '  <ul class="snav-links" id="snav-links">',
    link('index.html',         'Home',          'home'),
    link('future-skills.html', 'Future Skills', 'future-skills'),
    link('my-people.html',     'My People',     'my-people'),
    link('news/',          'News',          'news'),
    link('about.html',         'About',         'about'),
    '  </ul>',
    '  <a href="' + root('search.html') + '" class="snav-search' + searchActiveCls + '" aria-label="Search">',
    '    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>',
    '  </a>',
    '  <button type="button" id="snav-theme-toggle" class="snav-theme-toggle" aria-label="Switch to dark mode" aria-pressed="false">',
    '    <svg class="snav-theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    '    <svg class="snav-theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/></svg>',
    '  </button>',
    '  <div class="snav-auth" id="snav-auth"></div>',
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
    syncThemeToggleUI();

    // The auth slot is injected empty; auth.js fills it. Announce every
    // injection rather than only the first, because watchForWipe() re-injects
    // the whole nav after the Primer bundle replaces the body — which leaves a
    // fresh, empty slot behind that nothing else would ever refill.
    try {
      document.dispatchEvent(new CustomEvent('amplified:nav-injected'));
    } catch (e) { /* pre-CustomEvent browsers simply keep the guest nav */ }
  }

  /* ── Auth stack ───────────────────────────────────────────────────────
     Loaded from here so all 16 pages get auth from one edit, which is the
     same reason the nav itself is injected rather than copied.

     ⚠️ THE LIBRARY IS 53 KB GZIPPED AND MOST VISITORS NEVER NEED IT. From
     Phase 5 a guest gets no saved progress, so a signed-out visitor has no use
     for Supabase on ANY page, including the skill pages. Downloading it for
     them is 53 KB with a guaranteed benefit of zero.

     So the session is peeked at in localStorage first — synchronously, with no
     library — and the stack is fetched only when it can actually do something.
     That also means the nav renders the RIGHT state immediately rather than
     sitting blank while an async check completes. Same instinct as the theme
     being applied at the top of this file: decide before first paint.
  ─────────────────────────────────────────────────────────────────────── */

  // 'out'     — no session stored. Render the sign-in link, download nothing.
  // 'in'      — a live session. Render the avatar now, then load to refresh.
  // 'unknown' — something is there but cannot be trusted: unreadable, expired,
  //             or a shape this code does not recognise. Load the library and
  //             let it decide, which is exactly the old unconditional
  //             behaviour. This is the fallback that makes the optimisation
  //             safe — the worst case is no better than before, never broken.
  function peekSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!/^sb-.+-auth-token$/.test(key)) continue;

        var raw = localStorage.getItem(key);
        if (!raw) continue;

        // supabase-js stores this base64-prefixed in newer versions, plain JSON
        // in older ones. Handle both rather than pinning to one, since the
        // library updates independently of this file.
        if (raw.indexOf('base64-') === 0) {
          raw = decodeURIComponent(escape(atob(raw.slice(7))));
        }

        var data = JSON.parse(raw);
        var expires = data && data.expires_at;
        var email = data && data.user && data.user.email;
        if (!expires || !email) return { state: 'unknown' };

        // An expired access token does NOT mean signed out — supabase-js can
        // refresh it. Hand over rather than guessing.
        if (expires * 1000 <= Date.now()) return { state: 'unknown' };

        // The name is optional and every caller must cope without it: accounts
        // created before 2026-08-19 have none, and the stored session shape is
        // the library's rather than ours.
        var meta = data.user.user_metadata || {};
        return { state: 'in', email: email, name: meta.display_name || null };
      }
      return { state: 'out' };
    } catch (e) {
      return { state: 'unknown' };
    }
  }

  // The sign-in and account pages need the library whatever the session says:
  // one is how you get a session, the other is how you change it.
  // Pages that must load the auth stack even for a visitor with no stored
  // session, because they have something to say to a guest. Without this the
  // stack never arrives, `window.AmplifiedAuth` never appears, and the page
  // cannot tell "signed out" from "something broke" — /learning/ showed its
  // read-failure panel to every guest until it was added here (2026-08-21).
  // ⚠️ Any new surface that renders a signed-out state belongs in this list.
  function pageNeedsAuth() {
    return /\/(sign-in|account|learning)(\/|$)/i.test(pathname);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* The avatar letter and its tooltip, defined ONCE and exported.
     auth.js repaints the same slot a moment later from the real session; if the
     two disagreed about which letter to draw, the avatar would visibly change
     character on every page load. Same rule, one place. */
  function initialFor(name, email) {
    var source = (name && name.trim()) || email || '';
    return source ? source.trim().charAt(0).toUpperCase() : '?';
  }

  function labelFor(name, email) {
    return (name && name.trim()) || email || '';
  }

  /* Where the reader should be put back after signing in.
     ⚠️ A PATH, NEVER A URL, and that is the whole safety argument on this side.
     `location.pathname` already carries the origin's own base — `/` on Vercel,
     `/amplifiedthinker/` on Pages — so one form is correct on both, and what
     reaches the sign-in page has no scheme and no host in it at all. Sending an
     absolute URL would mean the receiving end had to strip one, and stripping is
     how open redirects get written.

     Nothing is added from the auth pages themselves: /sign-in/ would loop, and
     the nav shows no "Sign in" link on /account/ anyway.

     ⚠️ The receiving end does NOT trust this. It re-validates from scratch —
     anyone can type a `next` of their choosing, so this function being careful
     is a convenience, not a control. See safeNext() in sign-in.astro. */
  function returnParam() {
    try {
      if (pageNeedsAuth()) return '';

      /* ⚠️ A LEFTOVER MARKER IS NOT A REAL ANCHOR. `#at=1240` is ours, and it
         can still be in the address bar — restoreScroll leaves it alone on the
         skill pages, and anyone can type one. Treating it as the reader's own
         anchor would carry a stale offset forward for ever, and on a skill page
         it would smuggle a marker onto a page that deliberately has none.
         Ours is discarded; a genuine anchor still wins over a fresh offset. */
      var hash = window.location.hash || '';
      if (/^#at=\d+$/.test(hash)) hash = '';

      var here = window.location.pathname + window.location.search +
                 (hash || scrollMark());
      if (!here || here.charAt(0) !== '/') return '';
      return '?next=' + encodeURIComponent(here);
    } catch (e) { return ''; }
  }

  /* How far down the page the reader was, as a synthetic fragment — `#at=1240`.
     Carried inside `next`, so it needs no new URL parameter and no new device
     storage: a hash is already part of what safeNext() validates on the way
     back, and adding a sessionStorage key would mean changing privacy.html,
     which names every key this site sets.

     ⚠️ NOT ON THE SKILL PAGES. Plans and primers already restore position from
     skill_progress and show the "Welcome back" banner, and that mechanism is
     strictly better than a pixel offset — it knows which SECTION the reader was
     in, not merely how far down. Two restores would race, and this session
     already spent real time stopping that banner asking twice.

     ⚠️ A REAL HASH ALWAYS WINS. If the page already has one, the reader
     navigated to an anchor and that is a better description of where they are
     than any offset. Hence the `||` above rather than appending both.

     ⚠️ It is APPROXIMATE BY NATURE and that is accepted, not overlooked.
     Signing in adds the summary strip and the rings on Future Skills, so the
     content the offset was measured against moves down by roughly 60-80px. It
     lands near, not exactly — which is still far better than the top. */
  function scrollMark() {
    if (activePage === 'skill') return '';
    var y = Math.round(window.pageYOffset || document.documentElement.scrollTop || 0);
    // Below this it is indistinguishable from the top and not worth the noise
    // in the address bar.
    if (!isFinite(y) || y < 80) return '';
    return '#at=' + y;
  }

  /* ⚠️ THE HREF IS BAKED AT PAINT TIME, AND THE NAV PAINTS AT PAGE LOAD —
     when the scroll offset is still 0, so the marker computed there is always
     absent. The reader then scrolls, clicks a link that has not changed since,
     and lands at the top.

     This is precisely why the offset worked when tested in isolation and not in
     the page: calling returnParam() recomputes, reading the rendered href does
     not. Any future test of this must read the ATTRIBUTE after scrolling, never
     call the function.

     So the href is refreshed immediately before activation. Capture phase, and
     on mousedown/touchstart/keydown rather than click, so it is already correct
     by the time any navigation begins — including middle-click and
     ctrl-click, which never fire a plain `click`. */
  function refreshSignInHref(e) {
    try {
      var t = e.target;
      /* ⚠️ TWO SELECTORS, ONE REFRESHER. `[data-signin-return]` lets any surface
         opt a sign-in link into this without a second copy of the logic living
         somewhere else — /news/<slug> uses it. The lesson this whole function
         exists for is that when two files maintain one control they drift, so
         the answer to a third caller is a wider selector, not another handler. */
      var a = t && t.closest ? t.closest('.snav-auth-signin, [data-signin-return]') : null;
      if (!a) return;
      a.setAttribute('href', root('sign-in/') + returnParam());
    } catch (err) { /* leave the existing href — it still signs them in */ }
  }

  function watchSignInActivation() {
    document.addEventListener('mousedown', refreshSignInHref, true);
    document.addEventListener('touchstart', refreshSignInHref, { capture: true, passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') refreshSignInHref(e);
    }, true);
  }

  /* The other half: land, scroll, and clean up after ourselves. */
  function restoreScroll() {
    try {
      if (activePage === 'skill') return;
      var m = /^#at=(\d+)$/.exec(window.location.hash || '');
      if (!m) return;

      var y = parseInt(m[1], 10);
      if (!isFinite(y) || y <= 0) return;

      // ⚠️ Strip the marker BEFORE scrolling, and with replaceState so it does
      // not become a history entry. Left in place it would survive a reload,
      // re-scrolling a reader who had deliberately gone back to the top, and it
      // would be carried into anything they bookmarked or shared.
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search
      );

      // Next frame: the personal layer paints after this and changes the
      // document height, so scrolling immediately can clamp against a page that
      // is still short. This does not chase the layout — one honest attempt.
      window.requestAnimationFrame(function () {
        window.scrollTo(0, y);
      });
    } catch (e) { /* a failed restore is not worth breaking the nav over */ }
  }

  // Paints the slot before any network request. auth.js re-renders the same
  // markup once loaded, adding the dropdown — so nothing moves when it arrives.
  function paintAuthSlot(peek) {
    var slot = document.getElementById('snav-auth');
    if (!slot) return;

    if (peek.state === 'out') {
      slot.innerHTML = '<a class="snav-auth-signin" href="' +
        root('sign-in/') + returnParam() + '">Sign in</a>';
    } else if (peek.state === 'in') {
      slot.innerHTML =
        '<button type="button" class="snav-auth-avatar" id="snav-auth-avatar"' +
        ' aria-expanded="false" aria-haspopup="true"' +
        ' title="' + escapeHtml(labelFor(peek.name, peek.email)) + '">' +
        escapeHtml(initialFor(peek.name, peek.email)) + '</button>';
    }
    // 'unknown' leaves the slot empty on purpose: showing the wrong state and
    // correcting it a moment later is worse than showing nothing briefly.
  }

  /* ⚠️ `async = false` on a dynamically inserted script is what preserves
     EXECUTION ORDER — it does not make the load blocking. Without it the three
     files race, and supabase-client.js can run before window.supabase exists.

     These are classic scripts on purpose. Nothing here may become a module:
     nav.js derives its own link prefix from document.currentScript.src, which
     is null for a module, and every nav link on the site would then resolve
     from the wrong depth. The same trap is why every Astro <script> needs
     is:inline. See docs/dev-workflow.md. */
  function loadAuthStack() {
    if (window.__amplifiedAuthStack) return;
    window.__amplifiedAuthStack = true;

    ['supabase.min.js', 'supabase-client.js', 'auth.js'].forEach(function (file) {
      var s = document.createElement('script');
      s.src = root(file);
      s.async = false;
      s.defer = true;
      document.head.appendChild(s);
    });
  }

  /* ⚠️ THE NOTE STACK LOADS THE SAME WAY AND FOR THE SAME REASON — so that a
     guest downloads nothing they can never use.

     These two were static <script> tags on the ten primer and plan pages to
     begin with, which worked and cost every guest 51 KB per page view for a
     feature that refuses to render without a session. That is the opposite of
     the rule the rest of the site follows: the auth stack is injected on a
     peeked session, and pwned.js and auth-pages.css are scoped to two pages
     precisely so nothing else pays for them.

     ⚠️ NOT ADDED TO `pageNeedsAuth()`, deliberately. That list is for surfaces
     which render a SIGNED-OUT state and would otherwise mistake "signed out"
     for "something broke" — /learning/ shipped that defect once. skill-notes.js
     renders nothing whatever for a guest, so it wants the plain session gate
     and not the allowlist. */
  function isSkillArtefact() {
    return /\/skills\/[a-z0-9-]+\/(plan|primer)(\.html)?$/i.test(window.location.pathname);
  }

  function loadNoteStack() {
    if (window.__amplifiedNoteStack) return;
    window.__amplifiedNoteStack = true;

    // ⚠️ Same `async = false` discipline as the auth stack, and it is
    // load-bearing here too: note-editor.js publishes window.AmplifiedNoteEditor
    // and skill-notes.js reads it. Without this the two race and the panel can
    // come up with no editor in it.
    ['note-editor.js', 'skill-notes.js'].forEach(function (file) {
      var s = document.createElement('script');
      s.src = root(file);
      s.async = false;
      s.defer = true;
      document.head.appendChild(s);
    });
  }

  function setupAuth() {
    var peek = peekSession();

    /* Publish the peeked state so a page can render a guest-only or
       account-only element with NO FLASH. peekSession() is synchronous
       localStorage, and nav.js is loaded from the head of every page, so this
       lands before the body is parsed — CSS can decide at first paint rather
       than an element appearing and then being hidden.

       ⚠️ 'unknown' is published as-is, never collapsed to 'out'. Same rule
       paintAuthSlot follows two functions down: showing the wrong state and
       correcting it a moment later is worse than showing nothing briefly. A
       page keying off this must therefore match the state it wants EXPLICITLY
       — `:not([data-session="in"])` would catch 'unknown' too and show a guest
       prompt to someone who is signed in.

       auth.js overwrites this with the authoritative answer once the real
       session resolves; the peek is optimistic and a stale token reads 'in'. */
    document.documentElement.setAttribute('data-session', peek.state);

    paintAuthSlot(peek);

    // Re-paint after a nav re-injection, so a signed-in avatar survives the
    // Primer bundle wiping the body. auth.js takes this over once loaded.
    document.addEventListener('amplified:nav-injected', function () {
      if (!window.AmplifiedAuth) paintAuthSlot(peek);
    });

    if (peek.state !== 'out' || pageNeedsAuth()) loadAuthStack();

    /* ⚠️ 'unknown' MUST LOAD IT, which is why this matches 'out' rather than
       testing for 'in'. A stale token peeks as 'in' and a first-load race peeks
       as 'unknown'; treating 'unknown' as a guest would leave a signed-in
       reader with no notes control at all, silently, on the one page they went
       looking for it. Erring the other way costs a guest-who-looked-signed-in
       two script downloads and nothing else. */
    if (peek.state !== 'out' && isSkillArtefact()) loadNoteStack();
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

  /* ── Theme toggle button ──────────────────────────────────────────────
     Delegated on document so it keeps working if the Primer bundle wipes
     and re-inserts #site-nav (same pattern as the mobile menu below). */
  function syncThemeToggleUI() {
    var btn = document.getElementById('snav-theme-toggle');
    if (!btn) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  function setupThemeToggle() {
    syncThemeToggleUI();
    if (window.__snavThemeInit) return;
    window.__snavThemeInit = true;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('#snav-theme-toggle');
      if (!btn) return;
      var current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
      syncThemeToggleUI();
    });
  }

  /* ── Shared with the auth stack ───────────────────────────────────────
     root() is the only thing auth.js needs and cannot compute for itself:
     the prefix comes from THIS script's own src, and a second script asking
     document.currentScript gets its own location instead. Exporting it is
     what lets the sign-in link resolve correctly under the Pages subpath.

     peekSession() is exported for progress.js, which loads immediately below
     this file on every skill page and needs the same answer for the same
     reason: decide synchronously, before the library exists. A second copy of
     the parser is a second thing to keep in step with supabase-js's storage
     format, and the format has already changed once. */
  window.AmplifiedNav = {
    root: root,
    depth: depth,
    peekSession: peekSession,
    initialFor: initialFor,
    labelFor: labelFor,
    // ⚠️ Exported because auth.js REPAINTS THIS SLOT and would otherwise build
    // the sign-in link without it. Same rule as initialFor/labelFor above: the
    // two files paint the same control, so anything about it is defined once
    // here and read there.
    returnParam: returnParam
  };

  /* ── Entry point ─────────────────────────────────────────────────────── */
  function init() {
    injectNav();
    setupMobileMenu();
    setupThemeToggle();
    // Only watch for wipe on the Primer page (has deck-stage)
    if (activePage === 'skill' && isPrimer) {
      watchForWipe();
    }
    // Last, and never before the nav exists: auth is additive to a nav that
    // must work identically without it.
    setupAuth();

    // After setupAuth, so the auth stack is already being fetched — the scroll
    // is restored while it loads rather than after it.
    restoreScroll();

    // Delegated, so it survives auth.js repainting the slot and the primer
    // bundle wiping the nav — neither of which this has to know about.
    watchSignInActivation();
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();