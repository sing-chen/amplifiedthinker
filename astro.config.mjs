import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Writes dist/build.json so either origin can be asked which commit it is built
// from, over plain HTTP, with no dashboard and no credential.
//
// ⚠️ This exists because `npm run verify:published` cannot answer that question.
// That check is DIFFERENTIAL — it hashes the served bytes before and after a
// change. A commit touching only BACKLOG.md, a doc, or anything else outside
// `public/` produces byte-identical output whether the build succeeded or failed,
// and a failed Vercel build leaves the PREVIOUS deployment serving. Hashes match,
// the site looks healthy, and nothing distinguishes "deployed" from "quietly still
// running last week's build". Hit for real on 2026-08-20 and again on 2026-08-21.
//
// ⚠️ Generated into the build output and NEVER committed — `dist/` is gitignored.
// A checked-in build.json goes stale on the next push and then it does not merely
// fail to help, it lies, which is worse than having no stamp at all.
//
// The SHA comes from whichever CI is running; the two origins expose it under
// different names, which is the only fiddly part:
//   Vercel        VERCEL_GIT_COMMIT_SHA
//   GitHub Pages  GITHUB_SHA
// Locally there is no CI variable, so it shells out to git — and if even that
// fails (a tarball with no .git), the stamp still writes with sha null rather
// than failing the build. A missing stamp would break the deploy over a
// diagnostic, which inverts the point of it.
function buildStamp() {
  return {
    name: 'build-stamp',
    hooks: {
      'astro:build:done': ({ dir }) => {
        let sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null;
        let source = sha ? (process.env.VERCEL_GIT_COMMIT_SHA ? 'vercel' : 'github') : 'local';
        if (!sha) {
          try {
            sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
          } catch { sha = null; source = 'unknown'; }
        }
        const stamp = {
          sha,
          short: sha ? sha.slice(0, 7) : null,
          source,
          base: process.env.ASTRO_BASE || '/',
          builtAt: new Date().toISOString(),
        };
        writeFileSync(new URL('build.json', dir), JSON.stringify(stamp, null, 2) + '\n');
        console.log(`build stamp: ${stamp.short || 'unknown'} (${source})`);
      },
    },
  };
}

// The 20 existing hand-written pages live in `public/` and are copied into the build
// byte-for-byte untouched. Nothing about them is processed, bundled, or rewritten —
// that is the whole reason for the split. New surfaces (blog, admin, dashboard) get
// built properly from `src/pages/`.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ `output` STAYS 'static' EVEN THOUGH THIS BUILD NOW HAS AN SSR ADAPTER.
// That reads like a contradiction and is not. Read this before changing it.
//
// This comment used to say an adapter "arrives with the blog in Phase 8, where
// rendering on request is the point." That was written when Phase 6 was a
// sketch, and it did not survive the phase's actual activity list: `/news/:slug`
// rendered for crawlers, the 301 endpoint that resolves `legacy_id`, and
// `/api/search-index.json` are three SERVER surfaces. The adapter is a Phase 6
// dependency, and it is added here (stage 7) on its own commit.
//
// In Astro 5+ `output: 'static'` no longer means "no server". It means
// PRERENDER BY DEFAULT, and any route can opt out with:
//
//     export const prerender = false;
//
// `output: 'hybrid'` — which is what that used to be called — was REMOVED. The
// schema rejects it by name: "The `output: "hybrid"` option has been removed.
// Use `output: "static"` (the default) instead, which now behaves the same way."
//
// So the choice here is only which way round the default runs, and 'static' is
// right for this site: 20 hand-written pages plus three auth surfaces are all
// prerendered, and each server route is a deliberate opt-out rather than
// everything being on-demand and needing to be marked back. Switching to
// 'server' would invert that and mean editing every existing page for the same
// end state.
//
// ⚠️ A NEW ROUTE THAT READS THE DATABASE MUST DECLARE `prerender = false`.
// Without it the route is built once at deploy time and then serves a frozen
// snapshot — which looks perfectly healthy and is the exact failure
// server-rendering was added to prevent.
// ─────────────────────────────────────────────────────────────────────────────
//
// `base` reads an env var that nothing now sets, so it falls to '/'. It stays
// because BaseLayout and sign-in.astro route every generated URL through it; see
// the ASTRO_BASE note in CLAUDE.md for why unpicking it has nothing to gain.
export default defineConfig({
  site: process.env.ASTRO_SITE || 'https://amplifiedthinker.com',
  base: process.env.ASTRO_BASE || '/',
  output: 'static',
  adapter: vercel(),
  devToolbar: { enabled: false },
  integrations: [buildStamp()],
});
