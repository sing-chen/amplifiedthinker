// Reads published news stories from Supabase, on the server, per request.
//
// ⚠️ SERVER ONLY. Never import this from anything that reaches the browser —
// not because the key is secret (it is the same publishable key every page
// already ships) but because the browser has its own client in
// public/supabase-client.js and a second one would be a second thing to keep
// current.
//
// It talks to PostgREST over plain `fetch` rather than through supabase-js.
// There is no session to manage here and no auth to refresh: this is one
// anonymous GET of a table anon is allowed to read. Pulling the library into
// the serverless bundle to make it would be weight for nothing.
//
// ⚠️ RLS IS THE BOUNDARY, NOT THE `status=eq.published` FILTER BELOW. The
// filter is there so the query says what it means; `news_stories_public_read`
// is what actually stops a draft being served, and `npm run verify:rls`
// asserts that predicate rather than the absence of rows.

import { THEME_ORDER } from './news-render.mjs';

// Inlined at build time by `vite.define` in astro.config.mjs, which parses
// public/supabase-client.js so there is only ever one copy of the table.
// eslint-disable-next-line no-undef
const PROJECTS = __SUPABASE_PROJECTS__;

const COLUMNS = [
  // ⚠️ `id` is the uuid `user_news.story_id` is a FK to, so favourites and
  // per-user pins cannot work without it. It is not secret — RLS, not
  // obscurity, is what governs who may write a row against it.
  'id',
  'slug', 'legacy_id', 'story_date', 'sort_order', 'title',
  'source', 'url', 'summary', 'implications', 'tags', 'pinned'
].join(',');

/* ⚠️ BLOCKLIST NON-PRODUCTION, exactly as public/supabase-client.js does, and
   for the same reason spelled out there: allowlisting production means every
   new production origin is a bug waiting to happen, while a forgotten preview
   host reading production data is the mild failure rather than the bad one.
   Keep the two rules identical — a server that resolved `dev` while the browser
   on the same page resolved `prod` would be the worst of both. */
export function environmentFor(hostname) {
  const host = String(hostname || '');
  const isNonProd = /\.vercel\.app$/.test(host) ||
                    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
  return isNonProd ? 'dev' : 'prod';
}

// Vercel puts the real request host in `x-forwarded-host`; `Astro.url` can carry
// the internal one. Prefer the header and fall back, so localhost dev still
// resolves to the dev project.
export function hostnameFor(request, url) {
  const forwarded = request && request.headers ? request.headers.get('x-forwarded-host') : null;
  const raw = forwarded || (request && request.headers ? request.headers.get('host') : null) || (url && url.hostname) || '';
  return String(raw).split(',')[0].trim().replace(/:\d+$/, '');
}

function normalise(row) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  return {
    id: row.id,
    slug: row.slug,
    legacyId: row.legacy_id || null,
    date: row.story_date,
    sortOrder: row.sort_order,
    title: row.title || '',
    source: row.source || null,
    url: row.url || null,
    summary: row.summary || null,
    implications: row.implications || null,
    // Tags drive the filter chips and the tints. Order them the way the filter
    // bar does so the FIRST one — which picks the source-link accent colour —
    // is stable, rather than depending on the order they were typed in.
    tags: tags.slice().sort((a, b) => {
      const ia = THEME_ORDER.indexOf(a), ib = THEME_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }),
    pinned: row.pinned === true
  };
}

/**
 * The slug a legacy `<date>-<index>` id points at, or null.
 *
 * ⚠️ THIS IS THE WHOLE REASON SLUGS REPLACED POSITIONAL IDS. `legacy_id` is
 * stored, immutable and unique; the position it was derived from is not. Once
 * an admin UI can reorder a day's stories, `2026-08-14-0` stops describing
 * whichever story is first and keeps describing the one it was minted for —
 * but only because this resolves through the stored column rather than
 * recomputing the position.
 *
 * One row, one column: a redirect should not read the whole table.
 */
export async function slugForLegacyId(hostname, legacyId) {
  const env = environmentFor(hostname);
  const project = PROJECTS[env];
  if (!project) throw new Error(`no Supabase project configured for "${env}"`);

  // ⚠️ NOT FILTERED TO `published`, AND THAT IS THE POINT. An archived story is
  // one that was merged into another or withdrawn — its row is deliberately
  // kept so that a link shared before Phase 6 still resolves, which is the
  // stated reason `news_stories` withdraws by status rather than by DELETE.
  // Filtering here would 404 exactly the links the archive exists to protect.
  const endpoint = `${project.url}/rest/v1/news_stories` +
    `?select=slug,status,merged_into&legacy_id=eq.${encodeURIComponent(legacyId)}&limit=1`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`legacy_id lookup failed on ${env}: HTTP ${res.status} ${await res.text()}`);
  }

  const rows = await res.json();
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) return null;

  /* ⚠️ A MERGED STORY SENDS THE READER TO THE ONE IT WAS MERGED INTO, not to
     itself. Two stories were found on 2026-08-26 to have been published twice
     each, weeks apart, under different headlines against the same source URL.
     Merging them means one row is archived — and the archived slug is NOT a
     page anyone can read, because `/news/<slug>` renders from the published
     list. Landing an old link there would be a 404 dressed as a redirect.

     ⚠️ FOLLOWED EXACTLY ONE STEP, AND THE GUARD IS UPSTREAM, NOT HERE. The
     database gives a foreign key to `slug`, a check that a row cannot point at
     itself, and a check that only archived rows carry a pointer. It does NOT
     enforce that the TARGET is published — a check constraint cannot read
     another row — so a chain of archived rows is possible as far as Postgres is
     concerned. `build-news-seed.mjs` rejects any `mergedInto` that is not a
     published slug, which is what actually prevents one. Following a single
     step therefore cannot loop in practice, and refusing to chain here means a
     bad pointer degrades to a 404 rather than to a redirect loop. */
  if (row.status === 'archived' && row.merged_into) return row.merged_into;

  // Archived with nowhere to go — withdrawn rather than merged. Its own slug is
  // not renderable, so this is a 404, and that is the honest answer.
  if (row.status === 'archived') return null;

  return row.slug;
}

/**
 * Every published story, newest first, with the pinned one still in date order
 * — the renderer lifts it to the top itself so both sides agree about where it
 * belongs.
 *
 * Throws on failure rather than returning []. An empty list and a broken
 * database look identical once they reach the page, and "the news feed is
 * empty" is a far worse thing to serve silently than an error.
 */
export async function fetchPublishedStories(hostname) {
  const env = environmentFor(hostname);
  const project = PROJECTS[env];
  if (!project) throw new Error(`no Supabase project configured for "${env}"`);

  const endpoint = `${project.url}/rest/v1/news_stories` +
    `?select=${COLUMNS}` +
    `&status=eq.published` +
    `&order=story_date.desc,sort_order.asc`;

  const res = await fetch(endpoint, {
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`news_stories read failed on ${env}: HTTP ${res.status} ${await res.text()}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`news_stories read on ${env} returned ${typeof rows}, not an array`);
  return rows.map(normalise);
}
