---
description: Turn a pasted "Daily workforce digest" output (or a bare URL) into news stories, and emit the SQL that loads them
argument-hint: [paste the full daily digest text, paste a URL, or leave blank and paste/attach it in the next message]
---

You are helping curate the News page — `/news/` and `/news/<slug>`, server-rendered from the
`news_stories` table — with [content/news.json](content/news.json) as the authoring file.

## ⚠️ How news actually gets published now, and why this changed

**Phase 6 moved news into the database.** `public/news.html` and `public/search-index.json` were
deleted; `/news/` renders from `news_stories`, the homepage banner reads `/api/news/recent.json`,
and site search reads `/api/search-index.json`. Nothing serves a JSON file of stories any more.

**`content/news.json` is no longer served either.** It moved out of `public/` on 2026-08-26 for
that reason — under `public/` it was a public, stale copy of database content, which is the exact
shape of the fault that left 39 mojibake characters live in `search-index.json` for days. It is an
authoring input now, and the only thing that reads it is `scripts/build-news-seed.mjs`.

⚠️ **SO WRITING THE FILE NO LONGER PUBLISHES ANYTHING.** Editing `content/news.json` and pushing
changes nothing a reader can see. The change reaches the site only when the generated SQL is run in
the Supabase SQL editor. **A run of this command that stops after step 3 has published nothing and
will still look entirely successful** — green build, clean deploy, no story. Step 4 is the step
that publishes.

⚠️ **AND NO GATE CATCHES THAT.** The three `prebuild` checks are `verify:catalogue`,
`verify:signin-return` and `verify:encoding`; none of them reads `content/news.json` or the
database. Same shape as the `skills-catalogue.json` trap in CLAUDE.md — a wrong answer that fails
no test.

### Why SQL and not a script that just inserts the rows

`news_stories` is admin-write: the policy requires `public.is_admin()`, and `is_admin` can only be
set where `auth.uid()` is null — the dashboard SQL editor. The anon key is refused by RLS,
correctly, and `service_role` was deliberately refused a home in this project because one line of it
bypasses every policy in the schema. The SQL editor is the only route left, so this command's
product is generated SQL that a human pastes. Nobody hand-writes the rows; the generator does.

### This is the interim route, and it has an end date

**Phase 7 ships an admin UI** that writes to `news_stories` directly. On that day this command and
`content/news.json` both retire, and the file becomes a frozen historical copy.

⚠️ **DO NOT RUN A FULL `--write` REGENERATION AFTER PHASE 7 SHIPS.** `supabase/seed/news_seed.sql`
is idempotent on `slug`, so it would silently overwrite every story the admin UI had edited, report
success, and look fine. That is why step 4 uses `--only`: a partial load can only touch rows this
command just authored.

## File locations

Site files live under `public/`; `content/news.json` deliberately does not. Prose below names files
without a prefix for readability, but every path you read or write needs the real one.

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
- **Against existing content/news.json**: read the entries and flag any new story that reuses the same source report, same headline stat, or same core claim as something already published — not just exact `title`+`url` matches (that's only caught later, in Step 3, and only within the same date).

  ⚠️ **Do not limit this to the last two weeks.** It used to say that, and the window was the bug: on 2026-08-26 a database-side check found **two source URLs each published twice** — the Kyndryl People Readiness Report on 22 July and again on 10 August, and a CNBC piece on AI-layoff reversals on 6 July and again on 6 August. Both re-publications were **17 and 31 days** after the original, so a two-week read could not have seen either. A story worth covering is worth re-covering when it resurfaces, which is exactly why the gap between the two runs is usually *longer* than the window.

- **Against the database itself** — ⚠️ **the file is not the whole picture and will get worse**:

```bash
npm run verify:news-dupes -- dev
```

  Use `dev` before the Phase 6 merge and `prod` after it. It reads `news_stories` with the anon key
  (`news_stories_public_read` already allows it, so there is no new credential) and never writes.
  It reports three things: one URL published under two stories, a story in the file whose URL is
  already live under a different slug, and rows in the database that are **not in the file at all**.

  ⚠️ **That third one is why it exists.** Once Phase 7's admin UI ships, a story can reach
  `news_stories` without ever touching `content/news.json` — and every file-based check above goes
  blind while still reporting "no duplicates" confidently. **The database will not catch it either**:
  the load ends `on conflict (slug) do update`, so the same story re-added under its original
  headline silently *overwrites* the live row, and re-added under a reworded headline gets a
  different slug and inserts a *second* one. Neither raises anything. A duplicate story is not a
  duplicate slug.

  ⚠️ **An empty table is reported as "not a pass", not as clean** — prod's is empty until the merge,
  and with no rows every comparison would come back green.

If you find overlap, tell the user what you found and ask whether to: keep both, cut one, or merge multiple digest entries into a single news.json story (one `source`/`url`, one combined `summary`/`implications` referencing the multiple angles — see the McKinsey HR Monitor merge from 2026-07-10 in content/news.json for the pattern). Don't merge or cut unilaterally.

## Step 2 — Convert selected stories

For each story the user kept, build a JSON object matching the existing schema in content/news.json:

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

## Step 3 — Merge into content/news.json

Read [content/news.json](content/news.json). Determine the digest's date and convert to
`YYYY-MM-DD`.

- If a group with that `date` already exists, append the new stories to its `stories` array (don't
  duplicate a story with the same `title`+`url` already present).
- If not, insert a new `{ "date": ..., "stories": [...] }` group. Keep the file in descending date
  order — the generator does not care, but a human opening it does.

⚠️ **NEVER REORDER OR REMOVE A STORY INSIDE AN EXISTING DATE GROUP.** `legacy_id` is
`<date>-<array index>`, and it is what the `/news.html?story=` 301 endpoint resolves for every link
shared before Phase 6. Array position is not a detail of formatting here; it is a published
identifier. Appending to the end of a group is safe. Inserting in the middle silently repoints every
previously shared link for that day at a **different story**, and nothing reports it.

⚠️ **Write it with a UTF-8-safe tool** — `python` or `node`, never PowerShell
`Get-Content`/`Set-Content` or `ConvertTo-Json`. That is how 39 characters of mojibake reached
`main` in the first place. `npm run verify:encoding` is a `prebuild` gate and will fail the build,
but only after the damage is written.

Show the user a short summary of what you're about to add (titles + date) before writing the file.

## Step 4 — Generate the SQL and load it — ⚠️ **this is the step that publishes**

Dry run first. It validates the whole file, not just today's stories, and prints what it found:

```bash
npm run build:news-seed
```

Check three things in that output before going further: the story count went up by what you added,
there are **no problems reported**, and the non-ASCII sample lines read as real text rather than
mojibake.

Then emit **only** the day you just authored:

```bash
npm run build:news-seed -- --only <YYYY-MM-DD> --write
```

That writes `supabase/seed/news_add_<date>.sql`. ⚠️ **Use `--only`, not a bare `--write`.** A bare
`--write` regenerates all 81+ rows, which is right for the stage 17 first load and wrong for every
run after it — see the Phase 7 warning above. A `--only` date that matches nothing exits non-zero
rather than emitting an empty file, because SQL that runs and publishes nothing is the failure this
whole command is arranged around.

**Then hand it to the user to run**, in the Supabase SQL editor. **You cannot run it** — the anon
key is refused by RLS, correctly, and there is no service key. Say plainly that the story is not
live until they do, and paste the verification queries from the foot of the generated file so they
can confirm the row count themselves rather than trusting "Success. No rows returned".

⚠️ **WHICH PROJECT DEPENDS ON WHETHER PHASE 6 HAS MERGED, AND GETTING IT WRONG IS SILENT BOTH
WAYS.** Check `git log origin/main --oneline -1` if unsure.

| when | where the SQL goes | why |
|---|---|---|
| **Before the stage 17 merge** | **dev**, and nowhere else | Prod is still serving the old site and its `news_stories` is empty by design. Loading a single day into prod would put one story on a page nothing links to yet. ⚠️ **Prod needs no dashboard step at all in this window** — the story is already in `content/news.json`, so stage 17's full seed picks it up on its own |
| **After the stage 17 merge** | **prod** — and dev too, if you want them to match | Prod is the live site. This is the steady state |

⚠️ **Do not run a partial against prod before the merge and then also let stage 17's full seed
run.** Both are idempotent on `slug`, so nothing breaks and nothing warns — but the day's stories
then exist because of a step nobody recorded, and the row count in the stage 17 checklist will not
be the number that stage predicted.

## Step 5 — Pin (optional)

Ask whether any story just added should be **Featured** — the site-wide editorial pin, shown in its
own band at the top of `/news/` and used as the default story on load. Offer the newly-added titles,
or "none".

⚠️ **"Featured" is the editorial pin and it is not the reader's pin.** `news_stories.pinned` is
one, site-wide, admin-set. `user_news.pinned` is one per reader, private, and set by the reader.
They render in the same list wearing the same icon, which is exactly where they get conflated. This
command sets only the first.

Set `"pinned": true` on the chosen story in `content/news.json` and remove it from whichever story
had it. Do not hand-write an `update` statement: **regenerate the SQL after changing the file** —
the generator emits the `set pinned = false` that clears the old one, and a partial load without it
hits `news_stories_single_pinned_idx` and rolls the whole thing back with an error naming an index
rather than the problem.

If they pick none, leave every `pinned` field alone.

## Step 6 — Commit

`content/news.json` and the generated SQL are both outside `public/`, so **`deploy.bat` will refuse
this commit** — its second guard rejects a dirty tree outside `public/`/`docs/`. That is the guard
working, not a fault here. Commit with `git` directly, and ask the user first as always.

Nothing about this commit affects what the site serves. The deploy is incidental; the SQL in step 4
is the publication.
