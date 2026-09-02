// Reads live site announcements from Supabase, on the server, per request.
//
// ⚠️ SERVER ONLY — same rule as news-data.mjs beside it, for the same reason:
// the browser has its own client in public/supabase-client.js, and a second
// copy of anything is the copy that goes stale. This module exists so the
// homepage announce card can move its curated items into the database (Phase 7)
// without index.html ever talking to supabase.co — see the header of
// src/pages/api/announcements.json.js for why that boundary is load-bearing.
//
// Plain fetch against PostgREST, not supabase-js: one anonymous GET of a table
// anon is allowed to read, no session, no auth refresh. Same argument as
// news-data.mjs.
//
// ⚠️ RLS IS THE BOUNDARY, NOT THE FILTERS BELOW. `announcements_public_read`
// already scopes anon to active rows inside their [starts_at, expires_at)
// window — the query filters repeat that so the query says what it means, and
// so the row set is right even when read with a role whose policy is broader.

// The environment decision is IMPORTED, never retyped: environmentFor is the
// one blocklist rule the browser, news-data.mjs and this file must all share.
import { environmentFor } from './news-data.mjs';

// Inlined at build time by `vite.define` in astro.config.mjs — see news-data.mjs.
// eslint-disable-next-line no-undef
const PROJECTS = __SUPABASE_PROJECTS__;

/**
 * Every announcement currently inside its display window, newest first, as
 * `{ type, date, html, linkHref, linkLabel }` — exactly the fields the card
 * renders and nothing more.
 *
 * ⚠️ `html` IS TRUSTED HTML (announcements.text_html). The card inserts it
 * unescaped — that is how the <b> bolding works — which is acceptable only
 * because writes to the table are admin-only under RLS. Nothing user-authored
 * can reach this column.
 *
 * Throws on failure rather than returning []. "No announcements" and "the
 * database did not answer" look identical once they reach the page, and the
 * endpoint turns the throw into a 503 the card's catch() can tell apart from
 * a quiet week.
 */
export async function fetchLiveAnnouncements(hostname) {
  const env = environmentFor(hostname);
  const project = PROJECTS[env];
  if (!project) throw new Error(`no Supabase project configured for "${env}"`);

  const now = new Date().toISOString();
  const endpoint = `${project.url}/rest/v1/announcements` +
    '?select=type,announce_date,text_html,link_href,link_label' +
    '&active=is.true' +
    `&starts_at=lte.${encodeURIComponent(now)}` +
    `&or=${encodeURIComponent(`(expires_at.is.null,expires_at.gt.${now})`)}` +
    // announce_date desc puts newest first; sort_order breaks ties within a
    // day, matching the hand-ordered array this table replaced.
    '&order=announce_date.desc,sort_order.asc,created_at.desc';

  const res = await fetch(endpoint, {
    headers: {
      apikey: project.key,
      Authorization: `Bearer ${project.key}`,
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`announcements read failed on ${env}: HTTP ${res.status} ${await res.text()}`);
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`announcements read on ${env} returned ${typeof rows}, not an array`);

  return rows.map((row) => ({
    type: row.type,
    date: row.announce_date,
    html: row.text_html || '',
    linkHref: row.link_href || null,
    linkLabel: row.link_label || null
  }));
}
