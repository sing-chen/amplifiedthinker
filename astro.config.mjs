import { defineConfig } from 'astro/config';
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

// The 16 existing hand-written pages live in `public/` and are copied into the build
// byte-for-byte untouched. Nothing about them is processed, bundled, or rewritten —
// that is the whole reason for the split. New surfaces (blog, admin, dashboard) get
// built properly from `src/pages/`.
//
// `output` stays static for Phase 2. No adapter, so Vercel and GitHub Pages consume
// an identical build, which is what keeps the second origin cheap to support. An SSR
// adapter arrives with the blog in Phase 8, where rendering on request is the point.
//
// `base` is driven by an env var because the two origins serve from different paths:
// Vercel serves from `/`, GitHub Pages from `/amplifiedthinker/`. The existing pages
// don't care — they use relative links throughout — but anything generated from
// `src/` must respect it, so layouts read `import.meta.env.BASE_URL` rather than
// hardcoding `/`.
export default defineConfig({
  site: process.env.ASTRO_SITE || 'https://amplifiedthinker.com',
  base: process.env.ASTRO_BASE || '/',
  output: 'static',
  devToolbar: { enabled: false },
  integrations: [buildStamp()],
});
