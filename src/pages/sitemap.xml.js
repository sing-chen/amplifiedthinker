// The sitemap, generated per request.
//
// ⚠️ THIS REPLACES public/sitemap.xml, WHICH WAS DELETED IN THE SAME COMMIT.
// A static file cannot list 81 story URLs and stay right — every story added
// after it was written is a URL missing from it, and a sitemap that is merely
// incomplete fails nothing, reports nothing, and looks exactly like a correct
// one. That is the same shape as the skills-catalogue trap, and the answer here
// is the same: derive it rather than maintain it.
//
// ⚠️ `prerender = false`, for the reason every DB-backed route in this build
// carries it: prerendered, this would be a snapshot of the story list as it
// stood at deploy time, which is precisely the staleness it exists to end.
export const prerender = false;

import { fetchPublishedStories, hostnameFor } from '../lib/news-data.mjs';

const SITE = 'https://amplifiedthinker.com';

// The hand-written pages, carried over verbatim from public/sitemap.xml with
// one change: `/news.html` is now `/news/`. The old URL becomes a 301 at
// stage 11 of Phase 6, and pointing a crawler at a redirect when the
// destination is known is pure indirection.
const STATIC_PAGES = [
  ['/', '1.0'],
  ['/future-skills.html', '0.9'],
  ['/news/', '0.8'],
  ['/my-people.html', '0.7'],
  ['/about.html', '0.6'],
  ['/skills/analytical-thinking/primer.html', '0.8'],
  ['/skills/analytical-thinking/plan.html', '0.8'],
  ['/skills/critical-thinking/primer.html', '0.8'],
  ['/skills/critical-thinking/plan.html', '0.8'],
  ['/skills/creative-thinking/primer.html', '0.8'],
  ['/skills/creative-thinking/plan.html', '0.8'],
  ['/skills/systems-thinking/primer.html', '0.8'],
  ['/skills/systems-thinking/plan.html', '0.8'],
  ['/skills/strategic-synthesis/primer.html', '0.8'],
  ['/skills/strategic-synthesis/plan.html', '0.8'],
  ['/why-sign-up.html', '0.5'],
  ['/whats-new.html', '0.4'],
  ['/privacy.html', '0.3'],
  ['/terms.html', '0.3'],
];

function escapeXML(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

function entry(loc, priority, lastmod) {
  return '  <url>\n' +
    `    <loc>${escapeXML(SITE + loc)}</loc>\n` +
    (lastmod ? `    <lastmod>${escapeXML(lastmod)}</lastmod>\n` : '') +
    `    <priority>${priority}</priority>\n` +
    '  </url>';
}

export async function GET({ request, url }) {
  let stories = [];
  let ok = true;
  try {
    stories = await fetchPublishedStories(hostnameFor(request, url));
  } catch {
    // ⚠️ Still serve the static half rather than 500. A sitemap missing its
    // story URLs for one fetch is a crawl that finds slightly less; a 500 is a
    // crawler told the whole file is broken. The failure is not silent either
    // way — the pages themselves answer 503 when the same read fails.
    ok = false;
  }

  const urls = STATIC_PAGES.map(([loc, priority]) => entry(loc, priority))
    .concat(stories.map((s) => entry(`/news/${encodeURIComponent(s.slug)}`, '0.5', s.date)));

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n';

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      // Short when the story list is missing, so a transient read failure does
      // not sit in a CDN for an hour.
      'cache-control': ok ? 'public, max-age=600, s-maxage=3600' : 'public, max-age=60',
    },
  });
}
