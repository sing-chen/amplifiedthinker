# Adding news

How a story gets from a digest into the News page. Written 2026-08-26, when Phase 6 moved news out
of a JSON file and into the `news_stories` table.

> ## ⚠️ The one thing to know before anything else
>
> **Editing the file publishes nothing. Pushing publishes nothing.**
>
> `/news/` renders from the database. `content/news.json` is an *authoring input* — the only thing
> that reads it is `scripts/build-news-seed.mjs`. A story goes live when its **SQL is run in the
> Supabase SQL editor**, and at no other moment.
>
> ⚠️ **A run that stops before that looks completely successful**: green build, clean deploy, no
> story. No gate catches it — the three `prebuild` checks read skills, redirects and encoding, and
> none of them reads news or the database. Same shape as the `skills-catalogue.json` trap: a wrong
> answer that fails no test.

---

## Why it works this way

`news_stories` is admin-write. The policy requires `public.is_admin()`, and `is_admin` can only be
set where `auth.uid()` is null — which means the dashboard SQL editor. That leaves three routes in,
and two are closed:

| route | |
|---|---|
| the anon key | refused by RLS, correctly |
| `service_role` | **refused by us** — one line of it bypasses every policy in the schema, and Phase 6 settled that it gets no home in this project |
| the dashboard SQL editor | runs as the table owner. The only one left |

So the product of this workflow is **generated SQL that a human pastes**. Nobody hand-writes rows;
the generator does. It is the same arrangement the migrations already use.

**This is an interim route with an end date.** Phase 7 ships an admin UI that writes to the table
directly, and retires both this workflow and `content/news.json`. See [the last section](#what-changes-when-phase-7-ships).

---

## Before you start

You need the Supabase dashboard open, and you need to know **which project** — see the table in
step 4. That is the only decision in this guide that is silently wrong in both directions.

Everything else is `npm` in the repo at `C:\dev\amplifiedthinker`.

---

## Step 1 — Curate

Run `/add-news` and paste the digest, or a URL. It parses the entries, shortlists, and shapes each
story into the file's schema. This half of the command was never about the file format and is
unchanged from before Phase 6.

**Ask for a shortlist rather than accepting all of them.** Most stories in a digest are worth
reading once; the News page is for the ones worth more than that.

### The duplicate check, in both directions

⚠️ **Do not skip this, and do not limit it to the last fortnight.** On 2026-08-26 a database-side
check found **two source URLs each published twice** — the Kyndryl People Readiness Report on 22 July
and again on 10 August, and a CNBC piece on AI-layoff reversals on 6 July and again on 6 August.
Both re-publications were **19 and 31 days** after the original, so the old two-week window could not
have seen either. A story worth covering is worth re-covering when it resurfaces, which is exactly
why the gap is usually *longer* than a short window.

Then check the database, which the file cannot tell you about:

```bash
npm run verify:news-dupes -- prod
```

It reads `news_stories` with the anon key — no new credential, since published stories are already
readable — and never writes. It reports one URL under two stories, a story in the file already live
under a different slug, and rows in the database that are not in the file at all.

⚠️ **The database will not catch a duplicate on its own.** The load ends `on conflict (slug) do
update`, so the same story re-added under its **original** headline silently *overwrites* the live
row, and re-added under a **reworded** headline gets a different slug and inserts a *second* one.
Neither raises anything. A duplicate story is not a duplicate slug.

---

## Step 2 — Write into `content/news.json`

Append the new stories to their date group, or add a new `{ "date": ..., "stories": [...] }` group.

> ### ⚠️ Never reorder or remove a story inside an existing date group
>
> `legacy_id` is `<date>-<array index>`, and it is what the `/news.html?story=` redirect resolves for
> **every link shared before Phase 6**. Array position is a published identifier here, not a detail
> of formatting.
>
> **Appending to the end of a group is safe.** Inserting in the middle silently repoints every
> previously shared link for that day at a **different story**, and nothing reports it.
>
> To withdraw or merge a story, see [Merging duplicates](#merging-duplicates) — it is never a
> deletion.

⚠️ **Write it with `python` or `node`, never PowerShell.** `Get-Content`/`Set-Content` and
`ConvertTo-Json` re-encode UTF-8 as CP1252 — that is how 39 mojibake characters reached `main` and
sat there for days, valid JSON with the right entry count and every check green. `npm run
verify:encoding` is a `prebuild` gate and will fail the build, but only after the damage is written.

---

## Step 3 — Check what you wrote

Dry run first. It validates the **whole file**, not just today's stories:

```bash
npm run build:news-seed
```

Three things to read in the output before going further:

1. **The story count went up** by what you added.
2. **No problems reported** — slug collisions, `legacy_id` collisions, a title that slugifies to
   nothing, more than one Featured story.
3. **The non-ASCII samples read as real text**, not as `Brené`.

Nothing is written by a dry run.

---

## Step 4 — Generate the SQL

```bash
npm run build:news-seed -- --only 2026-08-27 --write
```

That writes `supabase/seed/news_add_2026-08-27.sql`.

> ### ⚠️ Use `--only`, never a bare `--write`
>
> A bare `--write` regenerates the **whole** seed. That is right for a first load and wrong for
> every run after it: once the Phase 7 admin UI is editing stories directly, a full regeneration
> would overwrite every one of those edits **and report success**, because the statement is
> idempotent on `slug`.
>
> `--only` can only touch rows you just authored.

A `--only` date that matches nothing **exits non-zero** rather than emitting an empty file — SQL that
runs and publishes nothing is the exact failure this workflow is arranged around.

---

## Step 5 — Run it

Open the **Supabase SQL editor**, paste the generated file, run it.

> ### ⚠️ Which project depends on whether Phase 6 has merged
>
> Getting this wrong is silent in both directions. Check with `git log origin/main --oneline -1` if
> you are not sure.
>
> | when | where the SQL goes | why |
> |---|---|---|
> | **Before the Phase 6 merge** | **dev**, and nowhere else | Prod's `news_stories` is empty by design. ⚠️ **Prod needs no dashboard step at all in this window** — the story is already in `content/news.json`, so the go-live seed picks it up on its own |
> | **After the merge** | **prod** — and dev too, if you want them to match | Prod is the live site. This is the steady state |
>
> ⚠️ Do not run a partial against prod before the merge *and* let the go-live seed run. Both are
> idempotent so nothing breaks and nothing warns — but the day's stories then exist because of a step
> nobody recorded, and the go-live row count will not be the number that was predicted.

---

## Step 6 — Verify

⚠️ **Do not check `count(*)`.** A total of 81 is satisfied by 81 rows in *any* status, so it reads
as a pass on a load that silently published rows meant to be archived. Check the **split**:

```bash
npm run verify:news-dupes -- prod
```

Expect the row count, the published/archived split, `matches` against the file, and no findings. It
also confirms every archived row points at a story that is actually published.

If you would rather see it in the dashboard, the generated file carries the queries at its foot. The
load-bearing one is:

```sql
select status, count(*) from public.news_stories group by status order by status;
```

**And look at the page.** Automated checks are necessary and never sufficient for anything visual.

---

## Step 7 — Commit

⚠️ **`deploy.bat` will refuse this commit**, and that is the guard working rather than a fault.
It rejects a dirty tree outside `public/`/`docs/`, and both `content/news.json` and the generated
SQL are outside it. Commit with `git` directly.

Nothing about the commit affects what the site serves. **The deploy is incidental; step 5 was the
publication.**

---

## Merging duplicates

When the same story has been published twice, merge rather than delete.

1. **Fold the content** — summary, implications, tags — into the **earlier** publication.
2. ⚠️ **Leave both titles alone.** The slug is derived from the title and the load is idempotent on
   **slug**, so retitling does not update the row — it **inserts a second one** under a new slug and
   leaves the original published. A cosmetic rewrite manufactures the exact duplicate you are
   removing.
3. **Mark the later entry** `"status": "archived"` and `"mergedInto": "<slug of the survivor>"`.
   Leave it exactly where it is in the array.
4. Regenerate and load.

The archived row keeps its `legacy_id`, so `/news.html?story=<that id>` still resolves — it **301s to
the story it was merged into**. That is what `merged_into` is for, and why withdrawal is a status
flag rather than a `DELETE`.

The generator refuses a `mergedInto` that is not a published slug, and refuses a row that is archived
*and* Featured — that combination satisfies the single-Featured index while being invisible.

---

## Setting the Featured story

⚠️ **"Featured" is the editorial pin and it is not a reader's pin.** `news_stories.pinned` is one,
site-wide, admin-set. `user_news.pinned` is one per reader, private, set by them. They render in the
same list wearing the same icon, which is exactly where they get conflated. This workflow sets only
the first.

Set `"pinned": true` on the chosen story and remove it from whichever story had it, then
**regenerate** — the generator emits the `set pinned = false` that clears the old one. Hand-writing
an `update` instead hits `news_stories_single_pinned_idx` and rolls the whole load back, with an
error naming an index rather than the problem.

---

## When it goes wrong

| what you see | what it means |
|---|---|
| `--only matched no stories` | A typo in the date. The message lists the most recent dates in the file |
| `column news_stories.merged_into does not exist` | That project has not had migration `20260826180000` applied |
| `there is no unique or exclusion constraint matching the ON CONFLICT specification` | Something is upserting against a **partial** index. Postgres can only infer one for `ON CONFLICT` if the statement carries the index's own `WHERE`, and PostgREST does not emit one |
| A duplicate key error naming `news_stories_single_pinned_idx` | Two Featured stories. Regenerate rather than hand-editing the SQL |
| The build fails on `verify:encoding` | Something re-encoded a file. `npm run fix:encoding` repairs it |
| Everything green, story not on the site | **Step 5 did not happen.** This is the default failure of this workflow |

---

## What changes when Phase 7 ships

The admin UI writes to `news_stories` directly. At that point:

- **`content/news.json` stops being the source of truth** and becomes a frozen historical copy.
- ⚠️ **A bare `npm run build:news-seed -- --write` becomes destructive** — it would overwrite every
  story edited in the admin UI and report success.
- The file-based duplicate check **goes blind** to anything added through the UI.
  `npm run verify:news-dupes` keeps working, because it reads the table.

That drift is detectable: `verify:news-dupes` reports rows in the database that are not in the file,
which is exactly the signal that this workflow has been superseded.
