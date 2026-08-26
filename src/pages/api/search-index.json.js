// The search index: the hand-authored page/primer/plan/person entries, plus
// every published news story, assembled per request.
//
// ⚠️ THIS REPLACED public/search-index.json, WHICH WAS DELETED. 81 of that
// file's 104 entries were a hand-maintained copy of data that lives in the
// database — a title and a summary retyped into a second place, kept in step
// by remembering to. That file is the one that sat on `main` with **39
// CP1252-decoded characters** in it: valid JSON, correct entry count, every
// check green, and the entire symptom was a search result reading
// `Bren<e9> Brown`. Deriving the news half is what stops that category of
// drift, not a better habit.
//
// ⚠️ THE 23 NON-NEWS ENTRIES ARE STILL HAND-AUTHORED, and they had to be: the
// descriptions, tags, quotes and section lists are editorial. They moved to
// `src/data/search-static.json` unchanged — extracted programmatically rather
// than retyped, because retyping the file that has already been mojibaked once
// is asking for it a second time.
//
// ⚠️ `prerender = false` — see the note in ../news/index.astro.
export const prerender = false;

import staticEntries from '../../data/search-static.json';
import { fetchPublishedStories, hostnameFor } from '../../lib/news-data.mjs';

export async function GET({ request, url }) {
  let stories = [];
  let newsOk = true;

  try {
    stories = await fetchPublishedStories(hostnameFor(request, url));
  } catch (err) {
    // ⚠️ DEGRADE, DO NOT FAIL. `search.html` treats a failed fetch as fatal —
    // it disables the input and shows "Search unavailable". Before this stage
    // the index was a static file, so a database outage could not touch search
    // at all; turning that into a dead search page would be a REGRESSION
    // introduced by the very change meant to stop the index drifting.
    // Losing the news entries degrades search; losing the response kills it.
    console.error('[search] news entries omitted from the index:', err);
    newsOk = false;
  }

  // ⚠️ Only the four fields the old file carried for news. `tags` is omitted
  // deliberately and always was: a story's tags are the same fixed five-theme
  // vocabulary, so indexing them makes every story in a theme match a search
  // for that theme and drowns the skill pages that are actually about it.
  //
  // `url` is the new `/news/<slug>` form. The old entries pointed at
  // `news.html?story=…`, which still resolves — through a 301 — so this
  // removes a redirect rather than adding one.
  const newsEntries = stories.map((s) => ({
    id: `news-${s.slug}`,
    type: 'news',
    title: s.title,
    description: s.summary || '',
    url: `/news/${encodeURIComponent(s.slug)}`
  }));

  // Static first, then news — the order the file had. Fuse scores rather than
  // orders, so this changes no ranking; it removes one variable from "did the
  // results change".
  const body = staticEntries.concat(newsEntries);

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Short and honest when the news half is missing, so a transient failure
      // does not sit in the CDN with a truncated index behind it.
      'cache-control': newsOk
        ? 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600'
        : 'public, max-age=30',
      // So a human debugging "why did my story not come up" can see whether
      // the news half made it, without reading the function logs.
      'x-news-entries': String(newsEntries.length)
    }
  });
}
