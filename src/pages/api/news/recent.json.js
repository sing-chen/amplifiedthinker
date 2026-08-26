// The most recent published stories, as JSON, for the homepage banner.
//
// ⚠️ WHY THIS EXISTS RATHER THAN index.html QUERYING SUPABASE DIRECTLY. The
// homepage already loads the Supabase client — nav.js injects it on every page
// — so the browser *could* ask the database itself. It must not, and the reason
// is in privacy.html rather than in any technical limit:
//
//   - The processor table says Supabase affects "Account holders". Today that
//     is exactly true: `createClient` makes no request, and auth.js reads the
//     session from localStorage, so a signed-out visitor never contacts
//     supabase.co at all. A banner query would make that row wrong for the
//     site's most-visited page, before the reader has done anything.
//   - §9 has claimed since 2026-08-23, when the fonts were self-hosted, that
//     "no third party is involved in showing you the page". That is a stronger
//     claim than the one it replaced and there is no third-party section left
//     to append a row to. A homepage fetch to supabase.co is the first thing
//     that breaks it.
//
// So the server talks to Supabase and the guest's browser talks only to
// amplifiedthinker.com — which Vercel already covers under "Everyone". It also
// means the CDN absorbs homepage traffic instead of a free-tier project.
//
// ⚠️ IT RETURNS ROWS, NOT DECISIONS. The 14-day window and the three-story cap
// live in index.html and STAY THERE. Moving the selection rules into this file
// while switching the source would change two things at once, and the stage's
// bar is that visitors see no difference — which is far easier to hold when
// the only thing that moved is where the data came from.
//
// ⚠️ `prerender = false` — see the note in ../../news/index.astro.
export const prerender = false;

import { fetchPublishedStories, hostnameFor } from '../../../lib/news-data.mjs';

// Enough for the banner to apply its own window and cap without ever running
// short, and small enough that the homepage is not downloading an archive.
// ⚠️ Not the same number as NEWS_MAX_COUNT, deliberately: this is a headroom
// figure, and tying it to the page's cap would mean a change there silently
// starving this.
const LIMIT = 20;

export async function GET({ request, url }) {
  let stories;
  try {
    stories = await fetchPublishedStories(hostnameFor(request, url));
  } catch (err) {
    console.error('[news] /api/news/recent.json could not read news_stories:', err);
    // ⚠️ 503 and no body. The banner's catch() already renders nothing, so a
    // failure here hides the news items and leaves the curated announcements
    // and the rest of the homepage untouched — which is the graceful behaviour
    // the stage asks for. Returning `[]` with a 200 would look identical to the
    // reader and identical to every monitor, which is the difference.
    return new Response(null, {
      status: 503,
      headers: { 'cache-control': 'no-store' }
    });
  }

  // Only what the banner renders. It shows a date, a title and a link; sending
  // summaries and implications would be several KB per story of text nothing
  // on that page displays.
  const body = stories.slice(0, LIMIT).map((s) => ({
    slug: s.slug,
    date: s.date,
    title: s.title
  }));

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The homepage is the most-hit page on the site and news changes a few
      // times a week, so let the CDN answer nearly all of it.
      'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
    }
  });
}
