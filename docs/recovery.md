# Recovery guide — getting back to a working state on new hardware

**Read this on a fresh machine with nothing installed.** It assumes no tools, no cloned repo, and no
memory of how any of this was set up.

A copy is kept in the Google Drive backup folder
(`…\websites\amplifiedthinker-backup\recovery.md`) so it is readable when the local machine is gone —
which is the only time it matters. `npm run backup` refreshes that copy, so the version in Drive
tracks this one.

**Time to a working state: about 15 minutes**, most of it waiting on installers.

---

## 1. Where everything actually lives

Recovery is easy because almost nothing depends on the local machine. Know which is which before you
start:

| Thing | Lives where | At risk if the machine dies? |
|---|---|---|
| All tracked source and full git history | **GitHub** — `github.com/sing-chen/amplifiedthinker` | No |
| Full history as a single file | `amplifiedthinker-backup\amplifiedthinker.bundle` | No |
| `_originals/` — 9 full-resolution source images | **Drive backup only.** Gitignored, so *not* on GitHub | Yes, if Drive is also lost |
| `.claude\settings.local.json` | Drive backup only | Yes, if Drive is also lost |
| `node_modules/`, `dist/`, `.astro/` | Nowhere — rebuilt in ~10s | No, by design |
| Account access (GitHub, Vercel, GoDaddy, Supabase) | Your password manager | See §6 |

The live site is unaffected by any of this. Vercel and GitHub Pages both build from GitHub, so
**production keeps running whether or not you have a working machine.**

---

## 2. Install prerequisites

| Tool | Why | Note |
|---|---|---|
| [Git for Windows](https://git-scm.com/download/win) | Clone the repo | Accept the default "Checkout Windows-style" — see §5 |
| [Node.js 22 LTS or newer](https://nodejs.org) | Astro build. CI uses Node 22 | Includes npm |
| [Google Drive for Desktop](https://www.google.com/drive/download/) | Reach the backup folder | Only needed to restore `_originals/` |
| [VS Code](https://code.visualstudio.com) | Editing | Optional |
| [Claude Code](https://claude.com/claude-code) | How this project is normally worked on | Optional |

Verify before continuing:

```bash
git --version
node --version
npm --version
```

---

## 3. Clone the repository

⚠️ **Clone to local disk. Never into Google Drive, OneDrive, or any synced folder.** `npm install`
fails there — `EBADF: bad file descriptor` after about 2m30s, reproducibly, because Drive's virtual
filesystem cannot survive the number of small file operations npm performs. The same install takes 7
seconds on local disk. This is the reason the working copy is at `C:\dev` at all. See §7.

```bash
git clone https://github.com/sing-chen/amplifiedthinker.git C:\dev\amplifiedthinker
```

Then set your git identity, which a fresh install will not have:

```bash
git config --global user.name "sing-chen"
git config --global user.email "singfenchen@gmail.com"
```

**If GitHub is unavailable**, restore from the bundle instead — it contains every branch and tag:

```bash
git clone "G:\My Drive\01. Personal\Personal Projects\websites\amplifiedthinker-backup\amplifiedthinker.bundle" C:\dev\amplifiedthinker
```

A bundle clone leaves `origin` pointing at the bundle file. Repoint it once GitHub is back:

```bash
git remote set-url origin https://github.com/sing-chen/amplifiedthinker.git
git fetch origin
```

---

## 4. Restore the two things GitHub does not have

Both are gitignored, so cloning does **not** bring them back. From
`…\websites\amplifiedthinker-backup\`:

```powershell
Copy-Item -Recurse "G:\My Drive\01. Personal\Personal Projects\websites\amplifiedthinker-backup\_originals" "C:\dev\amplifiedthinker\_originals"
Copy-Item "G:\My Drive\01. Personal\Personal Projects\websites\amplifiedthinker-backup\.claude\settings.local.json" "C:\dev\amplifiedthinker\.claude\settings.local.json"
```

`_originals/` is the only genuinely irreplaceable content — full-resolution versions of the profile
photo and site logo. It must sit at the repo root, **outside `public/`**: Astro copies `public/`
into the build verbatim, so originals placed inside it get published.

`settings.local.json` is only local Claude Code settings. If it is missing, carry on — nothing breaks.

---

## 5. Install dependencies and build

```bash
cd C:\dev\amplifiedthinker
npm ci
npm run build
```

`npm ci` installs exactly what `package-lock.json` pins, which is what CI and Vercel install. Use it
rather than `npm install`, which can quietly resolve different versions.

Expect roughly 200 packages in under 15 seconds, and a build finishing in about a second. A single
`esbuild` postinstall warning from npm is normal and harmless.

**Check line endings match expectations**, because several verification steps depend on it:

```bash
git config core.autocrlf          # expect: true
git ls-files --eol public/nav.js  # expect: i/lf w/crlf
```

The repository stores LF; the Windows working tree gets CRLF on checkout. That is correct and
intended. It matters because comparing served bytes against working-tree files will fail on *every*
text file while binaries pass — a line-ending artifact, not a fault. Compare against
`git show HEAD:<path>` instead.

---

## 6. Verify you are actually back

Run all four. The third is the one that proves the build is sound.

**1. Dev server serves both old and new pages**

```bash
npm run dev
```

Then open `http://localhost:4321/index.html` (a hand-written page) and
`http://localhost:4321/shell-test/` (an Astro-generated one). Both should render with identical nav,
fonts, and theme toggle.

**2. The build produced the whole site**

```bash
ls dist/index.html dist/nav.js dist/skills/analytical-thinking/plan.html
```

**3. Every existing page is byte-identical in the build** — the project's standing gate

```bash
while IFS= read -r f; do
  rel="${f#public/}"
  if [ ! -f "dist/$rel" ]; then echo "MISSING: $rel";
  elif ! cmp -s "$f" "dist/$rel"; then echo "DIFFERS: $rel"; fi
done < <(find public -type f)
echo "done — no output above means all files identical"
```

Run this in Git Bash. Silence is success: all 66 files should match.

**4. Both live origins are healthy** (they never went down, but confirm)

```bash
curl.exe -s -o /dev/null -w "vercel: %{http_code}\n" https://amplifiedthinker.com/about.html
curl.exe -s -o /dev/null -w "pages:  %{http_code}\n" https://sing-chen.github.io/amplifiedthinker/about.html
```

Then take a fresh backup, which also confirms the backup path still works:

```bash
npm run backup
```

---

## 7. What is *not* in any backup

Code recovery is not the same as operational recovery. These live only in your password manager or
with the provider, and no script here can restore them:

| Access | Needed for | Notes |
|---|---|---|
| GitHub account | Pushing; triggering both deploys | Set up a PAT or credential manager on the new machine |
| Vercel account | Production deploys, rollbacks, env vars, Deployment Protection | Signed in via GitHub |
| GoDaddy | **Registrar only** for `amplifiedthinker.com` | Holds the domain and the nameserver delegation — *not* the DNS records |
| Cloudflare | **DNS zone** for `amplifiedthinker.com`, and inbound Email Routing | `marvin`/`susan.ns.cloudflare.com` are authoritative. A DNS change made at GoDaddy has no effect |
| Supabase | Database, auth, RLS — from Phase 3 onward | See below |
| Resend | **Supabase auth email** — from Phase 4 onward | Domain `amplifiedthinker.com`, region eu-west-1, Return-Path on `send`. API keys are shown once; a replacement is created and pasted into Supabase Auth → SMTP, nothing else uses it |
| Brevo | **The Gmail "Send mail as" alias only** — it carried auth mail for four hours on 2026-08-17 and no longer does | Account "Amplified Thinker". The key created 2026-07-06 is what Gmail authenticates with; its value is not recoverable, and replacing it means updating Gmail → Settings → Accounts and Import |

⚠️ **Brevo looks like a leftover and is not.** Auth mail moved to Resend, but `singchen@amplifiedthinker.com`
still sends through `smtp-relay.brevo.com` and signs with the `brevo1`/`brevo2` DKIM records on the
Cloudflare zone. Neither the Resend nor the Supabase dashboard shows that dependency. Cancelling the
Brevo account, or deleting those DNS records, breaks the alias — and the symptom is "my email
stopped working" with nothing pointing at the cause.

⚠️ **DNS records are not backed up by anything.** Cloudflare keeps no history, so the only copy
of the zone as it stood before Phase 4 is [email-dns-baseline.md](email-dns-baseline.md).
`npm run verify:email` re-checks it against the live zone.

**Supabase credentials, since Phase 3 landed.** The project URL and `anon` key are public by design —
they ship in the browser and RLS is the security boundary — so losing them costs nothing and they
are not worth backing up.

The **`service_role` key is the opposite, and must never be committed**: it bypasses RLS entirely, so
one line carrying it undoes every policy in the schema. It currently has **no home at all**. There
are deliberately no Supabase environment variables in Vercel or the Pages workflow, because anything
that must work on both origins decides at runtime instead — so the key exists only in the Supabase
dashboard until Phase 6 adds a server endpoint that needs it. Losing local access does not lose it;
losing the Supabase account does.

**Database contents are not covered by this guide at all.** A git bundle backs up code, not Postgres.
From Phase 5, when real user progress exists, that needs its own backup with its own restore test —
and a Vercel rollback restores code, never database state.

---

## 8. Why the working copy must stay off Drive

Worth restating, because putting it back in Drive is the obvious-looking mistake:

- **Measured, twice:** `npm install` in `G:\My Drive\…` fails with `EBADF` after 2m32s. On local disk
  it succeeds in 7–13s.
- **Not configurable away.** Drive for Desktop has no per-folder ignore mechanism, so `node_modules`
  cannot be excluded from sync.
- **Nothing is gained.** Git and GitHub already provide versioning and offsite backup for the code,
  and `npm run backup` covers the few files they do not.

Drive's correct role here is **backup destination, not working directory** — which is exactly what
`scripts/backup-to-drive.ps1` uses it for.

---

## 9. Then pick the work back up

The project's context is committed, so nothing needs reconstructing from memory:

- [CLAUDE.md](../CLAUDE.md) — orientation, file layout, known traps. Loads automatically in Claude Code.
- [docs/implementation-sequence.md](implementation-sequence.md) — phase status and what each phase taught.
- [docs/supabase-integration-plan.md](supabase-integration-plan.md) — architecture and data model.
- [docs/dev-workflow.md](dev-workflow.md) — branches, previews, both origins, environment settings.

Claude Code keys its project memory to the working-copy path, so a session at a new path starts with
empty memory. That is fine — `CLAUDE.md` is version-controlled and carries the same context
deliberately, so recovery does not depend on anything outside the repository.
