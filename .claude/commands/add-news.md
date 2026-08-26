---
description: Turn a pasted "Daily workforce digest" output (or a bare URL) into curated news.json entries and deploy
argument-hint: [paste the full daily digest text, paste a URL, or leave blank and paste/attach it in the next message]
---

You are helping curate the News page at [news.html](public/news.html), backed by
[news.json](public/news.json).

## File locations

**Every site file lives under `public/`** since Phase 2 introduced the Astro build — `public/news.json`,
`public/search-index.json`, `public/news.html`, and so on. Prose below names files without the prefix
for readability, but every path you actually read or write needs it. Astro copies `public/` into the
build untouched, so the served URLs are unchanged: `news.json` is still at `/news.json`.

Pushing now triggers a build. A JSON edit cannot break it, but the site no longer updates
unconditionally on push — if a deploy looks like it did nothing, check the Vercel build.

## Input

The user will paste the raw output of their "Daily workforce digest" scheduled task, either as `$ARGUMENTS` or in their next message. It's typically a numbered list of stories, each with a headline, Source link, 2-3 sentence Summary, Theme tags line, Implications line, and a Connects-to (or "Flag:") line, plus a date in the title. Treat the story count (usually 5, sometimes more), the exact title wording, and the "Connects to" vs "Flag:" label as variable, not fixed — parse structurally (numbered entry → headline/Source/Summary/Theme tags/Implications/closing line) rather than matching a specific template string.

**If the user attaches a file instead of pasting text** (e.g. a `.docx`), don't rely on plain-text extraction alone for the "Source:" line — a docx's visible text often only shows the link's display label, while the actual URL lives in the hyperlink relationship (`word/_rels/document.xml.rels`), not the run text. Plain extraction will silently hand you a label instead of a URL. To get the real URLs:
1. Unzip the docx and read `word/document.xml.rels` for `Id` → `Target` (URL) pairs.
2. In `word/document.xml`, find each `r:id="rIdN"` reference and note which paragraph/story it falls in (they appear in document order, so the Nth hyperlink usually lines up with the Nth "Source:" line — but confirm by checking surrounding text, don't assume the ordering).
3. Use the resolved `Target` as the story's `url`, never the display text.

If no digest content is present yet, ask the user to paste or attach it.

**If the input is just one or more bare URLs** (no digest formatting — headline/Source/Summary/etc. — around them), don't ask the user to reformat it into digest style. Instead, for each URL:
1. Fetch the page content (WebFetch, or the appropriate PDF/page-reading tool if it's a PDF).
2. Draft the story yourself in the same voice and length as digest entries: a headline, a 2-3 sentence summary of the actual findings/content, an "Implications" line (what it means for the workforce/skills-development audience this site serves), and 1-3 tags from the fixed vocabulary (see Step 2). Identify the true publisher as `source` (e.g. a WEF report PDF is source "World Economic Forum" regardless of where the link was shared from).
3. Show the drafted story to the user as part of the Step 1 shortlist (flag it as "drafted from URL, not digest" so they know it wasn't lifted verbatim) and let them edit or approve it before it moves to Step 2.

Treat a fetch failure (paywall, login wall, broken link) as a stop — tell the user the URL couldn't be read and ask for a summary or a different source, don't fabricate story content for a page you couldn't access.

## Step 1 — Shortlist

Parse every story in the digest. Reply with a compact numbered shortlist — headline and source only, one line each, no summaries. Ask which numbers to keep (they may say "all", "1,3,5", "cut 2 and 4", etc.). Wait for their reply before doing anything else.

## Step 1a — Duplicate check

Before converting, check for overlap in both directions and surface anything found (don't silently drop or merge without asking):

- **Within the digest itself**: two entries drawing on the same underlying report/survey (shared source + shared stat or framing), even under different headlines.
- **Against existing news.json**: read the last ~2 weeks of entries and flag any new story that reuses the same source report, same headline stat, or same core claim as something already published — not just exact `title`+`url` matches (that's only caught later, in Step 3, and only within the same date).

If you find overlap, tell the user what you found and ask whether to: keep both, cut one, or merge multiple digest entries into a single news.json story (one `source`/`url`, one combined `summary`/`implications` referencing the multiple angles — see the McKinsey HR Monitor merge from 2026-07-10 in news.json for the pattern). Don't merge or cut unilaterally.

## Step 2 — Convert selected stories

For each story the user kept, build a JSON object matching the existing schema in news.json:

```json
{
  "title": "...",
  "source": "...",
  "url": "...",
  "summary": "...",
  "implications": "...",
  "tags": ["...", "..."]
}
```

Rules:
- `title`: the headline, cleaned of any leading number.
- `source`: the publisher name as given (e.g. "CNBC", "PwC", "Deloitte Insights") — not "via LinkedIn" or aggregator names if a primary source is named.
- `url`: the linked URL from the "Source:" line.
- `summary`: the digest's existing 2-3 sentence summary, lightly trimmed if needed.
- `implications`: the digest's "Implications" line, verbatim or lightly trimmed. Rendered on the site under a "Why it matters" label. Do NOT include the "Connects to" line — that one is still dropped for scannability.
- `tags`: map the digest's "Theme tags" line onto this fixed vocabulary only — drop any tag that doesn't match, and de-dupe if a story maps to the same tag twice:
  `skills development`, `workforce transformation`, `leadership and culture`, `macro signals`, `research and insights`.
- `pinned`: optional boolean. Only present when the user has chosen to pin this story (see Step 4). Don't add it otherwise.

## Step 3 — Merge into news.json

Read [news.json](public/news.json). Determine the digest's date and convert to `YYYY-MM-DD`.

- If a group with that `date` already exists, append the new stories to its `stories` array (don't duplicate a story with the same `title`+`url` already present).
- If not, insert a new `{ "date": ..., "stories": [...] }` group. Order doesn't matter — news.html sorts newest-first on render — but keep the file's own entries in descending date order for readability when someone opens it by hand.

Show the user a short summary of what you're about to add (titles + date) before writing the file.

## Step 3a — Update search-index.json

[search.html](public/search.html) is a site-wide search page that reads [search-index.json](public/search-index.json). Each news story gets its own searchable entry there (`type: "news"`), so it must stay in sync whenever news.json changes.

Story ids are positional (`<date>-<index within that date's stories array>`), so an insertion anywhere but the end of a date's array shifts every id after it. Don't try to append/patch individual entries — regenerate **all** `type: "news"` entries from the current news.json and replace them wholesale, leaving every other entry (`page`, `primer`, `plan`, `person`) untouched.

Deliberately omit `tags` from news search entries — a story's `tags` are the same fixed theme vocabulary (skills development, workforce transformation, etc.) already exposed as filter pills on news.html. Indexing them for search would let a query like "macro signals" pull in every story tagged that way rather than ones actually about it; that filtering job belongs to the news page's pills, not search.

Run this (adjust the python invocation to whatever's available — `python`, `python3`, or `py`):

```python
import json

news = json.load(open('public/news.json', encoding='utf-8'))
idx = json.load(open('public/search-index.json', encoding='utf-8'))

idx = [e for e in idx if e.get('type') != 'news']

news_entries = []
for group in news:
    date = group['date']
    for i, s in enumerate(group.get('stories', [])):
        sid = date + '-' + str(i)
        news_entries.append({
            'id': 'news-' + sid,
            'type': 'news',
            'title': s.get('title', ''),
            'description': s.get('summary', ''),
            'url': 'news.html?story=' + sid
        })

idx.extend(news_entries)

with open('public/search-index.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(idx, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('Rebuilt', len(news_entries), 'news entries. Total index size:', len(idx))
```

If no python runtime is available, do the equivalent by hand: remove every existing `"type": "news"` object from search-index.json, then re-append one object per story across the whole news.json (not just the ones added this run), in the same shape as above.

⚠️ **Rewrite this file with python or node, never with PowerShell.** The snippet above is
UTF-8-safe on purpose — `encoding='utf-8'`, `ensure_ascii=False`, `newline='\n'`. PowerShell 5.1
decodes as ANSI on the way in and so re-encodes every non-ASCII character: `·` becomes `Â·`, `—`
becomes `â€”`, `é` becomes `Ã©`. This is not hypothetical — on 2026-08-23 this exact file was found
live on `main` with **39** such characters across four sequences, because it had been rewritten with
`ConvertTo-Json` instead of the snippet above. The JSON stayed valid and every check passed; the only
symptom was search results reading `Brené Brown`. See the PowerShell trap in
[CLAUDE.md](../../CLAUDE.md).

`npm run verify:encoding` now catches this, and it is wired as `prebuild`, so a corrupted index fails
the build rather than shipping. If it ever fires: `npm run fix:encoding`, then find
what wrote the file.

⚠️ **Expect a whole-file reformat the first time the snippet is used.** The committed file is
currently in `ConvertTo-Json`'s shape — 4-space indent, two spaces after each `:` — which
`json.dump(indent=2)` does not produce. The first correct run reformats all ~1000 lines. That is the
file converging on the documented tool, not damage; check it with `npm run verify:encoding` and
confirm the parsed entry count is unchanged rather than reading the diffstat.

## Step 4 — Pin (optional)

Ask the user whether any of the stories just added should be pinned — pinning promotes a story to a dedicated "Pinned" section at the top of news.html regardless of date, and makes it the default story shown on load. Offer the shortlist of newly-added titles, or "none."

If they pick one:
- Scan the **entire** news.json (not just the newly-added stories) for any existing story with `"pinned": true` and remove that field from it — only one story can be pinned at a time.
- Set `"pinned": true` on the chosen story.
- Show a short before/after summary (previous pinned story cleared → new one set, or "no previous pin" if none existed) before writing the file.

If they pick none, skip this step — don't touch the `pinned` field on any story.

## Step 5 — Deploy

After writing news.json, ask the user whether to deploy now. If yes, run:

```
deploy.bat "add news for <date>"
```

This stages, builds, shows a diffstat, asks for confirmation, then pushes — confirm with the user
first anyway, since it's a push to the live site, per standard practice. Don't run it unprompted.

Both files this command writes — `public/news.json` and `public/search-index.json` — are under
`public/`, so they pass the script's second guard. Two ways it can legitimately refuse: you are not
on `main`, or something outside `public/`/`docs/` is dirty. Neither is a fault in this command;
resolve the tree and re-run rather than reaching for `--all`.
