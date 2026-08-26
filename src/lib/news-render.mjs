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
const NOTE_ICON_PATH = '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><polyline points="14 4 14 10 20 10"/>';
const STAR_ICON_PATH = '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>';

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

/* `state.personal` is the signed-in reader's own layer:
     { enabled, favs: {slug:1}, pins: {slug:1} }
   It is absent for guests and for anyone whose rows have not loaded yet, so
   every read of it is guarded. ⚠️ `personal.pins` is `user_news.pinned` — one
   reader's pin. It is NOT `news_stories.pinned`, which is editorial, admin-set
   and one site-wide. The two are different tables and different concepts, and
   this file renders both in the same list, which is exactly where they would
   get conflated. */
export function matchesFilter(story, state) {
  if (state.tag === 'saved') {
    if (!state.personal || !state.personal.favs[story.slug]) return false;
  } else if (state.tag === 'noted') {
    if (!state.personal || !state.personal.noted[story.slug]) return false;
  } else if (state.tag && state.tag !== 'all' && (story.tags || []).indexOf(state.tag) === -1) {
    return false;
  }
  if (state.query && (story.title || '').toLowerCase().indexOf(state.query) === -1) return false;
  return true;
}

// The reader's own pins, in date order, minus the editorial one — which already
// sits at the very top and must not appear twice.
export function userPinned(stories, state) {
  if (!state.personal) return [];
  const editorial = findPinned(stories);
  return stories.filter((s) =>
    state.personal.pins[s.slug] &&
    matchesFilter(s, state) &&
    !(editorial && s.slug === editorial.slug));
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
  const mine = userPinned(stories, state);
  const mineSet = {};
  mine.forEach((s) => { mineSet[s.slug] = 1; });

  // ⚠️ THE SAME ORDER headlineListHTML PAINTS: editorial pin, the reader's own
  // pins, then everything else newest-first. Previous/Next walks this list, so
  // if the two ever disagree the buttons skip stories the reader can see and
  // visit ones they cannot.
  const slugs = [];
  if (pinned && matchesFilter(pinned, state)) slugs.push(pinned.slug);
  mine.forEach((s) => slugs.push(s.slug));
  stories.forEach((s) => {
    if (pinned && s.slug === pinned.slug) return;
    if (mineSet[s.slug]) return;
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
  // ⚠️ Both personal chips appear only for a signed-in reader, and only when
  // they can return something. Showing either to a guest would advertise a
  // filter that can only ever come back empty, and showing one at zero would
  // look broken rather than empty.
  const personal = [];
  if (state.personal && state.personal.enabled) {
    if (Object.keys(state.personal.favs).length) {
      personal.push({ key: 'saved', label: 'Saved', path: STAR_ICON_PATH });
    }
    if (Object.keys(state.personal.noted).length) {
      personal.push({ key: 'noted', label: 'Has notes', path: NOTE_ICON_PATH });
    }
  }

  const render = (c) => {
    let cls = 'filter-chip' + (c.key === (state.tag || 'all') ? ' active' : '');
    if (THEMED_TAGS[c.key]) cls += ' themed ' + themeClass(c.key);
    return '<button type="button" class="' + cls + '" data-tag="' + escapeHTML(c.key) + '">' +
      icon(c.path) + escapeHTML(c.label) + '</button>';
  };

  /* ⚠️ TWO KINDS OF FILTER, READING AS ONE ROW OF EQUALS. `All stories`,
     `Saved` and `Has notes` narrow by YOUR RELATIONSHIP to a story; the rest
     narrow by SUBJECT. Undifferentiated, the row invites the reading that Saved
     is a theme like any other — and therefore that Saved and Skills Development
     might combine, which they cannot: choosing one replaces the other.

     A rule rather than a second row: the bar scrolls horizontally below 800px,
     and a second row would either scroll independently of the first or wrap
     unpredictably. */
  const scope = [{ key: 'all', label: 'All stories', path: ALL_ICON_PATH }].concat(personal);
  const themes = THEME_ORDER.filter((t) => inUse[t]).map((t) => ({
    key: t, label: THEME_LABELS[t] || titleCase(t), path: THEME_ICON_PATHS[t]
  }));

  return scope.map(render).join('') +
    (themes.length ? '<span class="filter-sep" role="separator" aria-orientation="vertical"></span>' : '') +
    themes.map(render).join('');
}

// ⚠️ An <a>, not a <button>. Every headline is now a real URL a crawler can
// follow and a reader can middle-click — which is the whole reason this stage
// exists. The client script intercepts a plain left-click and swaps the panel
// in place; anything else is left to the browser.
function headlineHTML(story, activeSlug, mine) {
  // ⚠️ `story.pinned` is the EDITORIAL pin; `mine` is this reader's. Both get
  // the pin icon and the warm tint because both mean "kept in sight", but they
  // come from different tables and only one of them is visible to anyone else.
  const isPinned = Boolean(story.pinned || mine);
  const cls = 'headline-item' +
    (story.slug === activeSlug ? ' active' : '') +
    (isPinned ? ' pinned' : '');
  const prefix =
    (isPinned ? '<span class="headline-pin-icon">' + icon(PIN_ICON_PATH) + '</span>' : '') +
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

  /* ⚠️ THE EDITORIAL PIN IS LABELLED "Featured" AND THE READER'S IS "Your pins",
     because until 2026-08-26 both wore the same icon and the same warm tint and
     a signed-in reader saw two identical-looking rows meaning different things:
     one everybody sees, one only they do. The schema warns that these two are
     trivially conflated; the list is exactly where it happened. Separating them
     by WORD rather than only by position is what makes them unmistakable.

     The header shows for guests too. A story sitting at the top of the list
     with a pin icon and no explanation is a small unanswered question on every
     visit; naming it answers it. */
  const pinned = findPinned(stories);
  const pinnedVisible = pinned && matchesFilter(pinned, state);

  /* ⚠️ WHEN THE READER PINS THE FEATURED STORY, IT APPEARS ONCE, NOT TWICE.
     `userPinned()` already excludes the editorial story, so the row was never
     duplicated — but the reader was left looking for a pin that had apparently
     not taken. One row, one header, both facts stated.

     Featured is transient and a pin is durable: the REASON to pin the featured
     story is that it will stop being featured. So the row stays in this group
     while both are true and drops into the reader's own group by itself the
     moment the editorial pick moves on — nothing to remember, and no special
     case to re-render. It falls out of the ordering. */
  const alsoMine = Boolean(pinned && state.personal && state.personal.pins[pinned.slug]);
  const featuredLabel = alsoMine ? 'Featured · pinned by you' : 'Featured';

  let html = pinnedVisible
    ? '<div class="headline-group-header">' + featuredLabel + '</div>' +
      headlineHTML(pinned, activeSlug, alsoMine)
    : '';

  // The reader's own pins, lifted out of their date buckets into one group at
  // the top — which is what makes pinning visibly DO something. Never collapsed
  // behind an archive toggle: a pin is a request to keep something in sight.
  const mine = userPinned(stories, state);
  const mineSet = {};
  mine.forEach((s) => { mineSet[s.slug] = 1; });
  // Singular: `user_news_single_pin_idx` makes more than one impossible, so a
  // plural header would describe a state the database refuses to hold.
  const pinsHTML = mine.length
    ? '<div class="headline-group-header">Your pin</div>' +
      mine.map((s) => headlineHTML(s, activeSlug, true)).join('')
    : '';

  const buckets = { Today: '', Yesterday: '', 'This Week': '', Older: '' };
  const counts = { Today: 0, Yesterday: 0, 'This Week': 0, Older: 0 };

  stories.forEach((s) => {
    if (pinned && s.slug === pinned.slug) return;
    if (mineSet[s.slug]) return;          // already shown under Your pins
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

  if (pinnedVisible && (pinsHTML || rest)) html += '<div class="headline-divider"></div>';
  html += pinsHTML;
  if (pinsHTML && rest) html += '<div class="headline-divider"></div>';
  html += rest;

  if (html) return html;
  // ⚠️ The Saved filter needs its own empty state. "No stories match this
  // filter yet" reads as a fault when the honest answer is that the reader has
  // not saved anything, and it is the only filter whose emptiness is the
  // reader's own doing rather than the feed's.
  if (state.tag === 'saved') {
    return '<p class="empty-state">Nothing saved yet. Open a story and choose Save to keep it here.</p>';
  }
  if (state.tag === 'noted') {
    return '<p class="empty-state">No notes yet. Open a story and add one \u2014 only you can see it.</p>';
  }
  return '<p class="empty-state">No stories match this filter yet.</p>';
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
    // "Featured", not "Pinned story" — see the note in headlineListHTML. This
    // badge is the editorial pin; the reader's own pin is shown by the Pin
    // button's own pressed state, and the two must not use one word.
    html += '<div class="story-pinned-badge">' + icon(PIN_ICON_PATH) + 'Featured</div>';
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
  html += actionsHTML(story);
  return html;
}

/* ── the personal layer's slot ────────────────────────────────────────────────
   ⚠️ THE SERVER RENDERS THE SIGNED-OUT STATE, ALWAYS, AND THAT IS DELIBERATE.
   It has no session to read — the browser holds it — so the honest first paint
   is the guest one, and `news-actions.js` takes the slot over the moment
   `AmplifiedAuth` is ready. This is the same arrangement nav.js and auth.js
   already use for the nav auth control: one side pre-paints, the other owns it.

   ⚠️ It also means a crawler and a signed-out reader see identical HTML, which
   is what keeps this page free of anything resembling cloaking.

   `data-story-id` is the uuid `user_news.story_id` references. It is here
   rather than fetched again because the row it keys is per-reader, and RLS —
   not the absence of the id — is what stops anyone writing against someone
   else's. */
function actionsHTML(story) {
  return '<div class="story-actions" data-story-id="' + escapeHTML(story.id || '') + '"' +
    ' data-story-slug="' + escapeHTML(story.slug) + '">' +
    '<div class="story-actions-slot" data-actions-slot>' +
    '<p class="story-actions-invite">Save this story, pin it to the top of your feed, or keep a private note on it.</p>' +
    // ⚠️ `data-signin-return` opts this link into nav.js's activation-time href
    // refresh. The `?next=` MUST be computed when the link is activated, not
    // when it is painted: this panel is painted at load with the scroll offset
    // at 0, and a reader who scrolls and then clicks would otherwise be sent
    // back to the top of a page they were partway down. The href below is the
    // safe fallback if that never fires — it signs them in, it just forgets
    // where they were.
    '<a class="story-action-btn story-action-signin" href="/sign-in/" data-signin-return>Sign in</a>' +
    '</div></div>';
}
