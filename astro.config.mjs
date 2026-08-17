import { defineConfig } from 'astro/config';

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
});
