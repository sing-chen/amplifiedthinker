// Turns the server-rendered news page into the master-detail reader it has
// always been: filter chips, headline search, keyboard navigation, and swapping
// stories in place instead of reloading.
//
// ⚠️ IT RE-RENDERS FROM src/lib/news-render.mjs — THE SAME FUNCTIONS THE SERVER
// USED. Nothing here builds markup of its own. That is what stops the page
// changing shape the instant JS takes over.
//
// ⚠️ EVERY HEADLINE IS A REAL LINK AND STAYS ONE. This script intercepts a
// plain left click and nothing else, so middle-click, ctrl/cmd-click and
// "open in new tab" keep working, and a reader with JS off still gets a
// perfectly good page — every story is one navigation away.
//
// The payload comes from a <script type="application/json"> the server emitted,
// not from a second fetch. The server has already read the database once; asking
// again from the browser would be a second read of the same rows, a second
// chance to disagree with the HTML around it, and a spinner for no reason.

import {
  filterBarHTML, headlineListHTML, storyHTML,
  navigableSlugs, pickDefault, matchesFilter, bucketKey, daysAgo, findPinned,
  storyPath
} from '../lib/news-render.mjs';

(function () {
  'use strict';

  var dataEl = document.getElementById('news-data');
  var layoutEl = document.getElementById('news-layout');
  var headlinePanel = document.getElementById('headline-panel');
  var storyPanel = document.getElementById('story-panel');
  var filterBar = document.getElementById('filter-bar');
  var searchInput = document.getElementById('headline-search');
  var scrollPrev = document.getElementById('filter-scroll-prev');
  var scrollNext = document.getElementById('filter-scroll-next');

  // The error page renders the shell without the layout. Bail rather than
  // throwing into a page that is already telling the reader something useful.
  if (!dataEl || !layoutEl || !headlinePanel || !storyPanel || !filterBar) return;

  var stories = [];
  try {
    stories = JSON.parse(dataEl.textContent) || [];
  } catch (e) {
    return;
  }
  if (!stories.length) return;

  var bySlug = {};
  stories.forEach(function (s) { bySlug[s.slug] = s; });

  var state = {
    tag: 'all',
    query: '',
    rawQuery: '',
    expanded: null,
    activeSlug: layoutEl.getAttribute('data-active-slug') || null,
    // The signed-in reader's own layer, published by public/news-actions.js.
    // Absent for guests, and absent until their rows load - every read of it in
    // news-render.mjs is guarded for exactly that reason.
    personal: null
  };

  /* ── the one archive group that is open ────────────────────────────────────
     Opening the group the current story lives in, and closing the rest, is what
     makes Previous/Next feel like walking a list rather than jumping around.
     Today is never a collapsible group, and the pinned story sits above them
     all, so both resolve to "nothing expanded". */
  function expandedFor(story) {
    if (!story) return null;
    var pinned = findPinned(stories);
    if (pinned && story.slug === pinned.slug) return null;
    var key = bucketKey(daysAgo(story.date));
    return key === 'Today' ? null : key;
  }

  function activeStory() {
    return state.activeSlug ? bySlug[state.activeSlug] || null : null;
  }

  /* ⚠️ NOT `el.scrollIntoView()`. That scrolls EVERY scrollable ancestor,
     the document included — so bringing a headline into view inside the panel
     also jumped the whole page past its own hero, on load, before the reader
     had touched anything. Adjusting the panel's own scrollTop is the only part
     that was ever wanted. Above 800px the panel is the scroller; below it the
     column has no max-height, both rects agree, and this correctly does
     nothing. Pair it with focus({preventScroll:true}) for the same reason —
     focusing an off-screen element scrolls the page too. */
  function revealInPanel(el) {
    if (!el) return;
    var panel = headlinePanel.getBoundingClientRect();
    var item = el.getBoundingClientRect();
    if (item.top < panel.top) headlinePanel.scrollTop -= (panel.top - item.top);
    else if (item.bottom > panel.bottom) headlinePanel.scrollTop += (item.bottom - panel.bottom);
  }

  function focusInPanel(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    revealInPanel(el);
  }

  function renderHeadlines() {
    headlinePanel.innerHTML = headlineListHTML(stories, state);
  }

  function renderStory(story) {
    if (!story) {
      storyPanel.innerHTML = storyHTML(null);
      announceStory(null);
      return;
    }
    var slugs = navigableSlugs(stories, state);
    var i = slugs.indexOf(story.slug);
    storyPanel.innerHTML = storyHTML(
      story,
      i > 0 ? slugs[i - 1] : null,
      i !== -1 && i < slugs.length - 1 ? slugs[i + 1] : null
    );
    announceStory(story);
  }

  /* ⚠️ Replacing the panel's innerHTML DESTROYS whatever the personal layer had
     painted into it — the save/pin buttons and any open note. news-actions.js
     cannot see that happen, so this says so.

     A CustomEvent rather than a direct call: news-actions.js is a plain script
     that may not have loaded, may be absent on a page that does not want it,
     and must never be something this file depends on. Same shape as
     `amplified:nav-injected`, which auth.js already listens for. */
  function announceStory(story) {
    try {
      document.dispatchEvent(new CustomEvent('amplified:story-rendered', {
        detail: { slug: story ? story.slug : null, id: story ? story.id : null }
      }));
    } catch (e) { /* a browser without CustomEvent still gets the story itself */ }
  }

  function renderFilterBar() {
    filterBar.innerHTML = filterBarHTML(stories, state);
    updateScrollArrows();
  }

  /* ── the document's own identity ───────────────────────────────────────────
     ⚠️ Swapping a story in place changes what the page IS, so the title and the
     canonical have to move with it. Leaving them behind means every story
     someone browses to reports itself as whichever one they landed on — to a
     bookmark, to the browser's history, and to anything reading the canonical.
     The og:* tags are deliberately NOT updated: no crawler runs this script, so
     changing them would only make what the page claims about itself and what a
     share preview shows disagree. The server render is the truth there. */
  var canonicalEl = document.querySelector('link[rel="canonical"]');
  var SITE = 'https://amplifiedthinker.com';

  function setDocumentIdentity(story) {
    if (story) {
      document.title = story.title + ' · News · Amplified Thinker';
      if (canonicalEl) canonicalEl.setAttribute('href', SITE + storyPath(story.slug));
    } else {
      document.title = 'News · Amplified Thinker';
      if (canonicalEl) canonicalEl.setAttribute('href', SITE + '/news/');
    }
  }

  function show(slug, opts) {
    opts = opts || {};
    var story = bySlug[slug];
    if (!story) return;

    state.activeSlug = slug;
    state.expanded = expandedFor(story);
    layoutEl.setAttribute('data-active-slug', slug);

    var hadFocusInPanel = headlinePanel.contains(document.activeElement);

    renderHeadlines();
    renderStory(story);
    setDocumentIdentity(story);
    layoutEl.classList.add('show-detail');

    if (opts.push !== false) {
      history[opts.replace ? 'replaceState' : 'pushState']({ slug: slug }, '', storyPath(slug));
    }

    if (opts.scrollIntoHeadline) {
      var el = headlinePanel.querySelector('.headline-item.active');
      // Re-rendering replaces the element the browser just focused, silently
      // dropping focus to <body> — restore it so arrow keys keep navigating
      // the list instead of falling through to native page scroll.
      if (hadFocusInPanel) focusInPanel(el);
      else revealInPanel(el);
    }
    if (opts.scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // After a filter or a search narrows the list, the open story may no longer
  // be in it. Fall back to whatever the list now starts with.
  function reconcileSelection() {
    var current = activeStory();
    if (current && matchesFilter(current, state)) {
      renderHeadlines();
      renderStory(current);
      return;
    }
    var fallback = pickDefault(stories, state);
    if (fallback) {
      show(fallback.slug, { replace: true });
    } else {
      state.activeSlug = null;
      renderHeadlines();
      renderStory(null);
    }
  }

  /* ── clicks ──────────────────────────────────────────────────────────────── */

  // ⚠️ Left button, no modifier, no target — anything else belongs to the
  // browser. Swallowing a ctrl-click would break "open in a new tab" on a page
  // whose entire purpose this stage is that its links are real.
  function isPlainClick(e) {
    return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
  }

  headlinePanel.addEventListener('click', function (e) {
    var toggle = e.target.closest('.headline-archive-toggle');
    if (toggle) {
      var key = toggle.getAttribute('data-group-toggle');
      var hadFocusInPanel = headlinePanel.contains(document.activeElement);
      state.expanded = state.expanded === key ? null : key;
      renderHeadlines();
      // Same focus restoration as show(): the button that was just activated
      // no longer exists after the re-render.
      if (hadFocusInPanel) focusInPanel(headlinePanel.querySelector('[data-group-toggle="' + key + '"]'));
      return;
    }
    var item = e.target.closest('.headline-item');
    if (!item || !isPlainClick(e)) return;
    e.preventDefault();
    show(item.getAttribute('data-slug'), { scrollIntoHeadline: true });
  });

  storyPanel.addEventListener('click', function (e) {
    var back = e.target.closest('.story-back');
    if (back && isPlainClick(e)) {
      // Mobile only — the back link is display:none above 800px. It returns to
      // the list without leaving the story, so the URL stays put.
      e.preventDefault();
      layoutEl.classList.remove('show-detail');
      headlinePanel.focus();
      return;
    }
    var nav = e.target.closest('.story-nav-btn[data-nav]');
    if (nav && isPlainClick(e)) {
      e.preventDefault();
      var slug = decodeURIComponent(nav.getAttribute('href').replace(/^\/news\//, ''));
      show(slug, { scrollIntoHeadline: true, scrollTop: true });
    }
  });

  filterBar.addEventListener('click', function (e) {
    var chip = e.target.closest('.filter-chip');
    if (!chip) return;
    state.tag = chip.getAttribute('data-tag');
    renderFilterBar();
    reconcileSelection();
  });

  /* ── search ──────────────────────────────────────────────────────────────── */

  function applySearch(value) {
    state.rawQuery = value.trim();
    state.query = state.rawQuery.toLowerCase();
    reconcileSelection();
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () { applySearch(this.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && this.value) {
        this.value = '';
        applySearch('');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        var first = focusStops()[0];
        if (first) first.focus();
      }
    });
  }

  /* ── keyboard ────────────────────────────────────────────────────────────── */

  function focusStops() {
    return Array.prototype.filter.call(
      headlinePanel.querySelectorAll('.headline-item, .headline-archive-toggle'),
      function (el) { return el.offsetParent !== null; }
    );
  }

  headlinePanel.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.classList) return;
    var isItem = target.classList.contains('headline-item');
    if (!isItem && !target.classList.contains('headline-archive-toggle')) return;

    var stops = focusStops();
    var idx = stops.indexOf(target);
    if (idx === -1) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusInPanel(stops[(idx + (e.key === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusInPanel(stops[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusInPanel(stops[stops.length - 1]);
    } else if (isItem && /^[a-z0-9]$/i.test(e.key)) {
      var ch = e.key.toLowerCase();
      var items = stops.filter(function (el) { return el.classList.contains('headline-item'); });
      var from = items.indexOf(target);
      for (var offset = 1; offset <= items.length; offset++) {
        var cand = items[(from + offset) % items.length];
        var text = (cand.textContent || '').replace(/^\d{1,2}\s+\w+:\s*/, '').trim();
        if (text.toLowerCase().indexOf(ch) === 0) {
          focusInPanel(cand);
          break;
        }
      }
    }
  });

  /* ── filter-bar overflow arrows ──────────────────────────────────────────── */

  function updateScrollArrows() {
    if (!scrollPrev || !scrollNext) return;
    var max = filterBar.scrollWidth - filterBar.clientWidth;
    scrollPrev.hidden = filterBar.scrollLeft <= 4;
    scrollNext.hidden = max <= 4 || filterBar.scrollLeft >= max - 4;
  }

  filterBar.addEventListener('scroll', updateScrollArrows);
  window.addEventListener('resize', updateScrollArrows);
  if (scrollPrev) scrollPrev.addEventListener('click', function () {
    filterBar.scrollBy({ left: -filterBar.clientWidth * 0.7, behavior: 'smooth' });
  });
  if (scrollNext) scrollNext.addEventListener('click', function () {
    filterBar.scrollBy({ left: filterBar.clientWidth * 0.7, behavior: 'smooth' });
  });

  /* ── history ─────────────────────────────────────────────────────────────── */

  // Back and forward move between stories without a reload. A path this script
  // does not recognise as a story is left to the browser.
  window.addEventListener('popstate', function () {
    var m = window.location.pathname.match(/^\/news\/([^/]+)\/?$/);
    var slug = m ? decodeURIComponent(m[1]) : null;
    if (slug && bySlug[slug]) {
      show(slug, { push: false, scrollIntoHeadline: true });
    } else if (!slug) {
      var fallback = pickDefault(stories, state);
      if (fallback) show(fallback.slug, { push: false });
    }
  });

  /* ── the personal layer ────────────────────────────────────────────
     news-actions.js owns the reader's saved/pinned set and announces it. Two
     entry points on purpose: the event for when it arrives later, and a direct
     read at startup for when it arrived first. Neither script may assume it
     loaded before the other.

     When the Saved filter is open and the reader un-saves the last story, the
     list would be left empty with a filter that can no longer match anything -
     so fall back to All stories rather than leaving them staring at nothing. */
  function adoptPersonal() {
    var p = window.AmplifiedNewsPersonal;
    state.personal = (p && p.enabled) ? p : null;
    if (state.tag === 'saved' && (!state.personal || !Object.keys(state.personal.favs).length)) {
      state.tag = 'all';
    }
    renderFilterBar();
    reconcileSelection();
  }

  document.addEventListener('amplified:news-personal', adoptPersonal);

  /* ── first paint ─────────────────────────────────────────────────────────── */

  // The server already rendered all of this. Re-rendering once on load is not
  // waste: it re-buckets the dates in the READER's timezone rather than the
  // server's, and it attaches the state the rest of this file reads.
  state.expanded = expandedFor(activeStory());
  if (window.AmplifiedNewsPersonal && window.AmplifiedNewsPersonal.enabled) {
    state.personal = window.AmplifiedNewsPersonal;
  }
  renderFilterBar();
  renderHeadlines();
  renderStory(activeStory());
  // ⚠️ `show-detail` is NOT set here, and that is the difference between the two
  // routes on a phone. Below 800px the two panels are alternatives, so `/news/`
  // opens on the list and `/news/<slug>` opens on the story — which is what
  // each URL says it is. The server sets the class for the slug route; adding
  // it here would send everyone arriving at the index straight into whichever
  // story happens to be pinned.

  revealInPanel(headlinePanel.querySelector('.headline-item.active'));
})();
