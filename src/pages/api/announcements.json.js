// The live curated announcements, as JSON, for the homepage announce card.
//
// ⚠️ WHY THIS EXISTS RATHER THAN index.html QUERYING SUPABASE DIRECTLY — the
// same two sentences that head api/news/recent.json.js, and they are not
// boilerplate: privacy.html's processor table scopes Supabase to "Account
// holders", and §9 claims no third party is involved in showing you the page.
// Both stay true only while a signed-out visitor's browser talks to
// amplifiedthinker.com and nothing else. The server talks to the database;
// the guest talks to the server.
//
// ⚠️ UNLIKE recent.json, THIS RETURNS DECISIONS, NOT RAW ROWS — deliberately.
// The old ANNOUNCEMENTS array decided expiry in the browser from
// EXPIRY_DAYS; the schema made expiry explicit per row (starts_at/expires_at,
// see the announcements table comments), so "which items are live" is now a
// property of the data and the RLS read policy already answers it. Shipping
// expired rows for the card to re-filter would mean two implementations of
// one window.
//
// ⚠️ `prerender = false` — without it this serves a frozen snapshot for ever,
// which is the exact failure it exists to prevent. See ../news/index.astro.
export const prerender = false;

import { fetchLiveAnnouncements } from '../../lib/announcements-data.mjs';
import { hostnameFor } from '../../lib/news-data.mjs';

export async function GET({ request, url }) {
  let items;
  try {
    items = await fetchLiveAnnouncements(hostnameFor(request, url));
  } catch (err) {
    console.error('[announcements] /api/announcements.json could not read announcements:', err);
    // 503 and no body, matching recent.json: the card's catch() renders
    // nothing, so a database outage hides the curated items and leaves the
    // rest of the homepage untouched. A 200 with [] would look identical to
    // every reader and every monitor, which is the difference.
    return new Response(null, {
      status: 503,
      headers: { 'cache-control': 'no-store' }
    });
  }

  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Same policy as recent.json: the homepage is the most-hit page on the
      // site and announcements change less often than news, so let the CDN
      // answer nearly all of it. An admin edit shows within ~15 minutes,
      // which "no commit, no push, no deploy" comfortably survives.
      'cache-control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
    }
  });
}
