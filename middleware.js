// Serves crawlers (LinkedIn/Twitter/Facebook/etc.) a prerendered meta-tag shell
// for shared news story links, since news.html renders stories client-side
// after fetch('news.json') and crawlers don't execute JS.
//
// The story `id` format (`<date>-<index>`, split on the LAST '-' since ISO
// dates contain dashes) mirrors buildFlatStories() in news.html — keep both
// in sync if that convention ever changes.

export const config = { matcher: '/news.html' };

const BOT_RE = /facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Pinterest|redditbot/i;

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function findStory(digests, id) {
  var lastDash = id.lastIndexOf('-');
  if (lastDash === -1) return null;
  var date = id.slice(0, lastDash);
  var index = Number(id.slice(lastDash + 1));
  var group = (digests || []).filter(function (g) { return g.date === date; })[0];
  if (!group || !group.stories || !group.stories[index]) return null;
  return group.stories[index];
}

function renderShareShell(story, id) {
  var title = escapeHTML(story.title || '') + ' · Amplified Thinker';
  var description = escapeHTML(story.summary || '');
  var url = 'https://amplifiedthinker.com/news.html?story=' + encodeURIComponent(id);

  return '<!DOCTYPE html><html><head>' +
    '<meta charset="UTF-8">' +
    '<title>' + title + '</title>' +
    '<meta property="og:type" content="article">' +
    '<meta property="og:site_name" content="Amplified Thinker">' +
    '<meta property="og:title" content="' + title + '">' +
    '<meta property="og:description" content="' + description + '">' +
    '<meta property="og:url" content="' + url + '">' +
    '<meta property="og:image" content="https://amplifiedthinker.com/images/og-cover.png">' +
    '<meta property="og:image:width" content="1200">' +
    '<meta property="og:image:height" content="630">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:image" content="https://amplifiedthinker.com/images/og-cover.png">' +
    '<meta http-equiv="refresh" content="0; url=' + url + '">' +
    '</head><body></body></html>';
}

export default async function middleware(req) {
  var ua = req.headers.get('user-agent') || '';
  var storyId = new URL(req.url).searchParams.get('story');
  if (!BOT_RE.test(ua) || !storyId) return;

  var newsRes = await fetch(new URL('/news.json', req.url));
  if (!newsRes.ok) return;
  var digests = await newsRes.json();
  var story = findStory(digests, storyId);
  if (!story) return;

  return new Response(renderShareShell(story, storyId), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  });
}
