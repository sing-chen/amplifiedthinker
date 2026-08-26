// /news.html — now a redirecting surface, not a page.
//
// Every news link ever shared points here: `news.html?story=<date>-<index>`.
// Those ids are POSITIONAL — `buildFlatStories()` minted them as the story's
// index within its date group — and the whole point of Phase 6 is that a
// position is not an identity. This resolves them through the stored,
// immutable `legacy_id` column instead, so reordering a day's stories cannot
// silently repoint a shared link at a different article.
//
// ⚠️ WHY THIS REPLACED public/news.html RATHER THAN SITTING BESIDE IT. Vercel
// runs `handle: filesystem` BEFORE any route, so a static news.html would win
// every time and this file would never execute. There is no arrangement where
// both exist and the redirect works. The runsheet calls for keeping the path
// alive as a redirecting surface, and this is that.
//
// ⚠️ `prerender = false` — it reads the database on every request.
export const prerender = false;

import { slugForLegacyId, hostnameFor } from '../lib/news-data.mjs';
import { storyPath } from '../lib/news-render.mjs';

// ⚠️ 301, NOT 302, AND THE DIFFERENCE IS NOT COSMETIC. A 302 says "look here
// again next time", so search engines keep the old URL as canonical and every
// share keeps pointing at a query string. A 301 is what actually moves the
// link's identity to the slug — which is the point of the stage.
const PERMANENT = 301;

export async function GET({ request, url, rewrite }) {
  const story = url.searchParams.get('story');

  // No `story` at all — someone typed the old path, or followed an internal
  // link that has not been updated. The index is exactly where they wanted.
  if (!story) {
    return new Response(null, {
      status: PERMANENT,
      headers: { location: '/news/', 'cache-control': 'public, max-age=3600' }
    });
  }

  let slug = null;
  try {
    slug = await slugForLegacyId(hostnameFor(request, url), story);
  } catch (err) {
    // ⚠️ A LOOKUP FAILURE MUST NOT REDIRECT. Sending a 301 on a failed read
    // would permanently repoint a real shared link at the wrong place, and a
    // 301 is cached by browsers — it would outlive the outage that caused it.
    // 503 says "ask again", which is the truth.
    console.error(`[news] legacy redirect could not resolve "${story}":`, err);
    return new Response('The news feed is temporarily unavailable.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }

  if (slug) {
    return new Response(null, {
      status: PERMANENT,
      headers: {
        location: storyPath(slug),
        // A resolved legacy id never changes what it points at, so this is
        // safe to cache hard. It is the failure paths above that must not be.
        'cache-control': 'public, max-age=86400'
      }
    });
  }

  // ⚠️ AN UNKNOWN id IS A 404, DELIBERATELY, AND IT IS AN IMPROVEMENT ON WHAT
  // news.html DID. The old page fell back to `pickDefaultStory()` — so a
  // mistyped or withdrawn id rendered the PINNED story under a URL claiming to
  // be a different one, with a 200. Showing the wrong article and calling it
  // right is worse than saying it is not here. All 81 published ids were
  // round-tripped through middleware.js's own parser at stage 8, so this path
  // means "never existed", not "we failed to import it".
  //
  // `rewrite` rather than a redirect to a 404 page: the reader keeps the URL
  // they clicked and gets the same not-found page /news/<unknown-slug> serves,
  // with the site's nav, footer and a link back to the feed. Bouncing them to
  // a different URL first would put a 302 in front of a 404 for no gain.
  return rewrite('/news/__unknown__');
}
