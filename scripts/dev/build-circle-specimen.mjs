// Builds a before/after side-by-side for the decorative-circle scroll fix.
//
//   npm run specimen:circles                -> analytical-thinking
//   npm run specimen:circles -- <skill>     -> any of the five
//
// ⚠️ OPEN IT THROUGH THE DEV SERVER, not as a file:// path:
//   http://localhost:4321/specimen-circles.html
// Unlike specimen-completion.html this one embeds the REAL pages in iframes, so
// it needs the same origin to read each deck's scroll position. A file:// copy
// renders but every measurement reads zero.
//
// WHY IT GENERATES RATHER THAN BEING HAND-WRITTEN. The fix is invisible in a
// screenshot -- the geometry is deliberately unchanged, and the only difference
// is whether a panel CAN scroll. Judging that from memory against a deployed
// page is exactly the kind of check that passes because nobody could see the
// baseline. So this reconstructs the pre-fix page from git and runs the two
// side by side, with the measurement on screen.
//
// The "before" copy is written NEXT TO the real primer, not at the repo root,
// because the pages use relative paths (../../nav.js, video-thumbnail.png).
// Moved anywhere else they load a different site. Both outputs match the
// gitignored `specimen-*.html` pattern, at any depth.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// The merge that shipped the completion control -- the last commit before the
// circles were wrapped. Resolved through git rather than pinned by hash where
// possible, so this keeps working as history moves.
const FIX_COMMIT = 'HEAD';
const skill = process.argv[2] || 'analytical-thinking';
const SKILLS = ['analytical-thinking', 'creative-thinking', 'critical-thinking',
                'strategic-synthesis', 'systems-thinking'];
if (!SKILLS.includes(skill)) {
  console.error(`unknown skill "${skill}". One of:\n  ${SKILLS.join('\n  ')}`);
  process.exit(2);
}

const REL = `public/skills/${skill}/primer.html`;

// Find the commit that introduced .slide-bg, and take the file from its parent.
let beforeRef;
try {
  const log = execFileSync('git',
    ['log', '--format=%H', '-S', 'slide-bg', '--', REL],
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  if (!log.length) throw new Error('no commit in history introduces .slide-bg');
  beforeRef = log[log.length - 1] + '^';
} catch (e) {
  console.error(`could not locate the pre-fix revision: ${e.message}`);
  process.exit(1);
}

const before = execFileSync('git', ['show', `${beforeRef}:${REL}`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

if (before.includes('slide-bg')) {
  console.error('the "before" copy already contains .slide-bg -- wrong revision');
  process.exit(1);
}

const beforePath = join(ROOT, 'public/skills', skill, 'specimen-circles-before.html');
writeFileSync(beforePath, before);

const AFFECTED = [
  { n: 2, where: 'bottom-left',  depth: 70, tint: 'teal'  },
  { n: 4, where: 'bottom-left',  depth: 40, tint: 'amber' },
  { n: 5, where: 'bottom-right', depth: 80, tint: 'teal'  },
];

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Circle scroll fix — before / after — ${skill}</title>
<style>
  :root { --ink:#12211E; --paper:#F7F9F8; --line:#D8E2DE; --bad:#B4472E; --good:#1F6F5C; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:'Inter',system-ui,sans-serif; background:var(--paper); color:var(--ink); }
  header { padding:20px 24px 14px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 6px; font-size:18px; }
  p.sub { margin:0; font-size:13px; color:#4A5D58; max-width:80ch; line-height:1.55; }
  .bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 24px; border-bottom:1px solid var(--line); }
  button { font:inherit; font-size:13px; padding:6px 12px; border:1px solid var(--line);
           border-radius:6px; background:#fff; cursor:pointer; }
  button:hover { background:#EDF3F1; }
  button.on { background:#1F6F5C; color:#fff; border-color:#1F6F5C; }
  .spacer { flex:1; }
  .panes { display:flex; gap:20px; padding:20px 24px 40px; }
  .pane { flex:1; min-width:0; }
  .cap { display:flex; align-items:baseline; gap:10px; margin-bottom:8px; }
  .cap h2 { margin:0; font-size:14px; }
  .verdict { font-size:12px; font-variant-numeric:tabular-nums; padding:2px 8px; border-radius:99px; }
  .verdict.bad { background:#F7E4DE; color:var(--bad); }
  .verdict.good { background:#DDEFE8; color:var(--good); }
  /* The frames run at a real 1280x1000 and are scaled down, so the layout under
     test is identical to a desktop window rather than a narrow reflow of it. */
  .shell { position:relative; width:100%; padding-top:78.125%; border:1px solid var(--line);
           border-radius:8px; overflow:hidden; background:#fff; }
  iframe { position:absolute; top:0; left:0; width:1280px; height:1000px; border:0;
           transform-origin: 0 0; }
  .note { margin:10px 0 0; font-size:12px; color:#4A5D58; line-height:1.5; }
  code { background:#EDF3F1; padding:1px 4px; border-radius:3px; font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>Decorative-circle scroll fix — <em>${skill}</em></h1>
  <p class="sub">Both panes are the real page at a real 1280&times;1000, scaled to fit. The geometry is
  meant to be <strong>identical</strong> — the circle should still be cut off by the slide's bottom
  edge in both. The difference is whether the panel can scroll. Press <strong>Scroll both to the
  bottom</strong>: the left pane jumps and reveals a blank strip with the circle's edge floating in
  it; the right pane must not move at all.</p>
</header>

<div class="bar">
  ${AFFECTED.map((s) => `<button data-slide="${s.n}">Slide ${s.n} — ${s.where}, ${s.depth}px, ${s.tint}</button>`).join('\n  ')}
  <span class="spacer"></span>
  <button id="scroll">Scroll both to the bottom</button>
  <button id="reset">Reset scroll</button>
  <button id="theme">Dark mode</button>
</div>

<div class="panes">
  <div class="pane">
    <div class="cap"><h2>Before — ${beforeRef}</h2><span class="verdict bad" id="v-before">—</span></div>
    <div class="shell"><iframe id="f-before" src="/skills/${skill}/specimen-circles-before.html"></iframe></div>
    <p class="note">Circles sit directly in <code>.slide</code>, which is <code>overflow-y:auto</code>.
    A negative <code>bottom</code> makes the panel scrollable by exactly that offset.</p>
  </div>
  <div class="pane">
    <div class="cap"><h2>After — working tree</h2><span class="verdict good" id="v-after">—</span></div>
    <div class="shell"><iframe id="f-after" src="/skills/${skill}/primer.html"></iframe></div>
    <p class="note">Circles sit in <code>.slide-bg</code> (<code>position:absolute; inset:0;
    overflow:hidden</code>) — same coordinates, same paint order, outside the scrollable
    overflow region.</p>
  </div>
</div>

<script>
  var AFFECTED = ${JSON.stringify(AFFECTED.map((s) => s.n))};
  var frames = { before: document.getElementById('f-before'), after: document.getElementById('f-after') };
  var verdicts = { before: document.getElementById('v-before'), after: document.getElementById('v-after') };
  var current = AFFECTED[0];
  var dark = false;

  // Scale each 1280x1000 frame into whatever width the pane got.
  function fit() {
    Object.keys(frames).forEach(function (k) {
      var shell = frames[k].parentElement;
      frames[k].style.transform = 'scale(' + (shell.clientWidth / 1280) + ')';
    });
  }
  addEventListener('resize', fit);

  function doc(k) { try { return frames[k].contentDocument; } catch (e) { return null; } }

  function show(n) {
    current = n;
    [].forEach.call(document.querySelectorAll('[data-slide]'), function (b) {
      b.classList.toggle('on', +b.dataset.slide === n);
    });
    Object.keys(frames).forEach(function (k) {
      var d = doc(k); if (!d) return;
      var slides = [].slice.call(d.querySelectorAll('.slide'));
      slides.forEach(function (s) { s.classList.remove('active'); s.scrollTop = 0; });
      if (slides[n - 1]) slides[n - 1].classList.add('active');
    });
    measure();
  }

  function measure() {
    Object.keys(frames).forEach(function (k) {
      var d = doc(k); if (!d) return;
      var a = d.querySelector('.slide.active'); if (!a) return;
      var over = a.scrollHeight - a.clientHeight;
      var el = verdicts[k];
      el.textContent = over > 0 ? ('scrollable by ' + over + 'px') : 'not scrollable';
      el.className = 'verdict ' + (over > 0 ? 'bad' : 'good');
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-slide]');
    if (b) return show(+b.dataset.slide);

    if (e.target.id === 'scroll') {
      Object.keys(frames).forEach(function (k) {
        var d = doc(k); if (!d) return;
        var a = d.querySelector('.slide.active'); if (a) a.scrollTop = 9999;
      });
      return;
    }
    if (e.target.id === 'reset') {
      Object.keys(frames).forEach(function (k) {
        var d = doc(k); if (!d) return;
        var a = d.querySelector('.slide.active'); if (a) a.scrollTop = 0;
      });
      return;
    }
    if (e.target.id === 'theme') {
      dark = !dark;
      e.target.classList.toggle('on', dark);
      e.target.textContent = dark ? 'Light mode' : 'Dark mode';
      Object.keys(frames).forEach(function (k) {
        var d = doc(k); if (!d) return;
        d.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      });
    }
  });

  var loaded = 0;
  Object.keys(frames).forEach(function (k) {
    frames[k].addEventListener('load', function () {
      if (++loaded === 2) { fit(); setTimeout(function () { show(current); }, 300); }
    });
  });
  fit();
</script>
</body>
</html>
`;

const outPath = join(ROOT, 'public/specimen-circles.html');
writeFileSync(outPath, page);

console.log(`before: ${beforeRef}`);
console.log(`  wrote public/skills/${skill}/specimen-circles-before.html`);
console.log(`  wrote public/specimen-circles.html`);
console.log(`\nOpen  http://localhost:4321/specimen-circles.html`);
console.log('(through the dev server -- file:// renders but measures nothing)');
