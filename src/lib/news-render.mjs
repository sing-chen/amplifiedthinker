// The news page's markup, written ONCE and run in two places: the server
// renders the first paint from it, and public/news-app.js re-renders from the
// same functions as the reader filters, searches and clicks.
//
// ⚠️ THAT SHARING IS THE POINT, NOT A CONVENIENCE. A server render and a client
// render of the same list are two implementations of one thing, and they drift
// silently — the page looks right until the moment JS takes over and something
// shifts. Keeping both on these functions means a change to a headline row
// cannot land on one side only.
//
// Everything here is a pure string builder with no DOM and no fetch, so it runs
// unchanged in a serverless function and in a browser. Do not import anything
// from `node:` into this file.

export const THEME_ORDER = [
  'skills development', 'workforce transformation',
  'leadership and culture', 'macro signals', 'research and insights'
];

export const THEME_LABELS = {
  'skills development': 'Skills Development',
  'workforce transformation': 'Workforce Transformation',
  'leadership and culture': 'Leadership & Culture',
  'macro signals': 'Macro Signals',
  'research and insights': 'Research & Insights'
};

// Membership test only — the tints themselves live in news-app.css so dark mode
// can override them. A tag outside this set still renders, with the neutral
// fallback baked into .story-tag.
export const THEMED_TAGS = {
  'skills development': 1,
  'workforce transformation': 1,
  'leadership and culture': 1,
  'macro signals': 1,
  'research and insights': 1
};

const THEME_ICON_PATHS = {
  'skills development': '<path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z"/>',
  'workforce transformation': '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'leadership and culture': '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  'macro signals': '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>',
  'research and insights': '<path d="M9 2v6L3.5 18a2 2 0 0 0 1.8 3h13.4a2 2 0 0 0 1.8-3L15 8V2"/><path d="M9 2h6"/>'
};
const ALL_ICON_PATH = '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
const PIN_ICON_PATH = '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z"/><circle cx="12" cy="9" r="2.5"/>';
const CHEVRON_ICON_PATH = '<polyline points="6 9 12 15 18 9"/>';

const TITLE_CASE_LOWER = { and: 1, or: 1, of: 1, the: 1, in: 1, on: 1 };

export const ARCHIVE_CUTOFF_DAYS = 7;
export const BUCKET_ORDER = ['Today', 'Yesterday', 'This Week', 'Older'];

export function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export function titleCase(s) {
  return String(s).split(' ').map(function (w, i) {
    if (i > 0 && TITLE_CASE_LOWER[w.toLowerCase()]) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

export function themeClass(tag) {
  return 'theme-' + String(tag).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function icon(paths) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
}

/* ── dates ───────────────────────────────────────────────────────────────────
   ⚠️ `'T00:00:00'` with NO timezone suffix is deliberate: it parses as LOCAL
   midnight, which is what "how many days ago" means to the reader. Appending
   'Z' would shift the date by a day for anyone west of UTC and quietly file
   today's stories under Yesterday. Same construction news.html has always used.

   The server necessarily formats these in UTC, so a story can land in a
   different bucket server-side than it does for a reader several timezones
   away. The client re-renders the list on load from the same functions, which
   corrects it — that correction is one of the reasons this module is shared. */
export function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export function fmtDatePrefix(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return String(d.getDate()).padStart(2, '0') + ' ' + d.toLocaleDateString('en-US', { month: 'short' });
}

export function daysAgo(iso, now) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return null;
  const today = now ? new Date(now) : new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - d) / 86400000);
}

export function bucketKey(days) {
  if (days === null) return 'Older';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < ARCHIVE_CUTOFF_DAYS) return 'This Week';
  return 'Older';
}

/* ── URLs ────────────────────────────────────────────────────────────────────
   Always root-absolute. A headline row is a real <a> now, and the page it sits
   on can be `/news/` or `/news/<slug>` — a relative href would resolve from a
   different place on each. */
export function storyPath(slug) {
  return '/news/' + encodeURIComponent(slug);
}

/* ── selection ───────────────────────────────────────────────────────────── */

export function matchesFilter(story, state) {
  if (state.tag && state.tag !== 'all' && (story.tags || []).indexOf(state.tag) === -1) return false;
  if (state.query && (story.title || '').toLowerCase().indexOf(state.query) === -1) return false;
  return true;
}

export function findPinned(stories) {
  for (let i = 0; i < stories.length; i++) if (stories[i].pinned) return stories[i];
  return null;
}

// The reading order the Previous/Next buttons walk: the pinned story first,
// then everything else newest-first. `stories` is already sorted by the query.
export function navigableSlugs(stories, state) {
  if (state.query) return stories.filter((s) => matchesFilter(s, state)).map((s) => s.slug);
  const pinned = findPinned(stories);
  const slugs = [];
  if (pinned && matchesFilter(pinned, state)) slugs.push(pinned.slug);
  stories.forEach((s) => {
    if (pinned && s.slug === pinned.slug) return;
    if (matchesFilter(s, state)) slugs.push(s.slug);
  });
  return slugs;
}

export function pickDefault(stories, state) {
  const pinned = findPinned(stories);
  if (pinned && matchesFilter(pinned, state)) return pinned;
  const visible = stories.filter((s) => matchesFilter(s, state));
  return visible[0] || stories[0] || null;
}

/* ── markup ──────────────────────────────────────────────────────────────── */

export function filterBarHTML(stories, state) {
  const inUse = {};
  stories.forEach((s) => (s.tags || []).forEach((t) => { inUse[t] = true; }));
  const chips = [{ key: 'all', label: 'All stories', path: ALL_ICON_PATH }].concat(
    THEME_ORDER.filter((t) => inUse[t]).map((t) => ({
      key: t, label: THEME_LABELS[t] || titleCase(t), path: THEME_ICON_PATHS[t]
    }))
  );
  return chips.map((c) => {
    let cls = 'filter-chip' + (c.key === (state.tag || 'all') ? ' active' : '');
    if (THEMED_TAGS[c.key]) cls += ' themed ' + themeClass(c.key);
    return '<button type="button" class="' + cls + '" data-tag="' + escapeHTML(c.key) + '">' +
      icon(c.path) + escapeHTML(c.label) + '</button>';
  }).join('');
}

// ⚠️ An <a>, not a <button>. Every headline is now a real URL a crawler can
// follow and a reader can middle-click — which is the whole reason this stage
// exists. The client script intercepts a plain left-click and swaps the panel
// in place; anything else is left to the browser.
function headlineHTML(story, activeSlug) {
  const cls = 'headline-item' +
    (story.slug === activeSlug ? ' active' : '') +
    (story.pinned ? ' pinned' : '');
  const prefix =
    (story.pinned ? '<span class="headline-pin-icon">' + icon(PIN_ICON_PATH) + '</span>' : '') +
    '<span class="headline-date-prefix">' + escapeHTML(fmtDatePrefix(story.date)) + ':</span> ';
  return '<a class="' + cls + '" href="' + escapeHTML(storyPath(story.slug)) + '"' +
    ' data-slug="' + escapeHTML(story.slug) + '"' +
    (story.slug === activeSlug ? ' aria-current="page"' : '') + '>' +
    prefix + escapeHTML(story.title || '') + '</a>';
}

// `state.expanded` is the one archive group open, or null. Collapsed groups keep
// their links IN THE DOM behind `display:none` — hidden from the reader, still
// followed by a crawler, which is what makes the whole archive discoverable
// from one page.
export function headlineListHTML(stories, state) {
  const activeSlug = state.activeSlug || null;

  if (state.query) {
    const matches = stories.filter((s) => matchesFilter(s, state));
    if (!matches.length) {
      return '<p class="empty-state">No headlines match &ldquo;' + escapeHTML(state.rawQuery || state.query) + '&rdquo;.</p>';
    }
    return matches.map((s) => headlineHTML(s, activeSlug)).join('');
  }

  const pinned = findPinned(stories);
  const pinnedVisible = pinned && matchesFilter(pinned, state);
  let html = pinnedVisible ? headlineHTML(pinned, activeSlug) : '';

  const buckets = { Today: '', Yesterday: '', 'This Week': '', Older: '' };
  const counts = { Today: 0, Yesterday: 0, 'This Week': 0, Older: 0 };

  stories.forEach((s) => {
    if (pinned && s.slug === pinned.slug) return;
    if (!matchesFilter(s, state)) return;
    const key = bucketKey(daysAgo(s.date, state.now));
    buckets[key] += headlineHTML(s, activeSlug);
    counts[key]++;
  });

  let rest = '';
  BUCKET_ORDER.forEach((key) => {
    if (!counts[key]) return;
    if (key === 'Today') {
      rest += '<div class="headline-group-header">Today</div>' + buckets[key];
      return;
    }
    const expanded = state.expanded === key;
    const label = key === 'Older' ? 'Older stories' : key;
    rest += '<div class="headline-archive' + (expanded ? ' expanded' : '') + '">' +
      '<button type="button" class="headline-archive-toggle" data-group-toggle="' + key + '"' +
      ' aria-expanded="' + (expanded ? 'true' : 'false') + '">' +
      escapeHTML(label) + ' (' + counts[key] + ')' + icon(CHEVRON_ICON_PATH) + '</button>' +
      '<div class="headline-archive-body">' + buckets[key] + '</div>' +
      '</div>';
  });

  if (pinnedVisible && rest) html += '<div class="headline-divider"></div>';
  html += rest;

  return html || '<p class="empty-state">No stories match this filter yet.</p>';
}

export function storyHTML(story, prevSlug, nextSlug) {
  if (!story) return '<p class="empty-state">No stories match this filter yet.</p>';

  const primaryTag = (story.tags || [])[0];
  const accent = (primaryTag && THEMED_TAGS[primaryTag]) ? ' ' + themeClass(primaryTag) : '';

  let html = '';
  html += '<a class="story-back" href="/news/">&lsaquo; All headlines</a>';
  html += '<div class="story-toprow">';
  html += '<div class="story-meta">';
  html += '<div class="story-source">' + escapeHTML(fmtDateLong(story.date)) + '</div>';
  if (story.pinned) {
    html += '<div class="story-pinned-badge">' + icon(PIN_ICON_PATH) + 'Pinned story</div>';
  }
  html += '</div>';
  html += '<nav class="story-nav" aria-label="Story navigation">';
  html += prevSlug
    ? '<a class="story-nav-btn" data-nav="prev" href="' + escapeHTML(storyPath(prevSlug)) + '">&lsaquo; Previous</a>'
    : '<span class="story-nav-btn is-disabled" aria-disabled="true">&lsaquo; Previous</span>';
  html += nextSlug
    ? '<a class="story-nav-btn" data-nav="next" href="' + escapeHTML(storyPath(nextSlug)) + '">Next &rsaquo;</a>'
    : '<span class="story-nav-btn is-disabled" aria-disabled="true">Next &rsaquo;</span>';
  html += '</nav>';
  html += '</div>';
  html += '<h2 class="story-title">' + escapeHTML(story.title || '') + '</h2>';
  html += '<p class="story-summary">' + escapeHTML(story.summary || '') + '</p>';
  if (story.implications) {
    html += '<div class="story-implications"><span class="story-implications-label">Why it matters</span><p>' +
      escapeHTML(story.implications) + '</p></div>';
  }
  if (story.url) {
    html += '<a class="story-source-link' + accent + '" href="' + escapeHTML(story.url) +
      '" target="_blank" rel="noopener noreferrer">Read at ' + escapeHTML(story.source || 'source') +
      ' <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></a>';
  }
  html += '<div class="story-tags">';
  (story.tags || []).forEach((t) => {
    html += '<span class="story-tag' + (THEMED_TAGS[t] ? ' ' + themeClass(t) : '') + '">' +
      escapeHTML(THEME_LABELS[t] || titleCase(t)) + '</span>';
  });
  html += '</div>';
  return html;
}
