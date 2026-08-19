// Proves each project's redirect allowlist, without sending a single email.
//
//   npm run verify:redirects
//
// WHY THIS EXISTS. The redirect allowlist fails in the worst possible way: an
// origin that is not on it is not rejected, it is silently swapped for the
// project's Site URL. Sign-in appears to work, the email arrives, the link is
// valid - and the user lands on the wrong site. Nothing errors anywhere.
//
// Phase 3 verified this with real password-reset emails and ran out of mail
// allowance with two origins unchecked. The cheap route, found afterwards:
// /auth/v1/verify decides its redirect BEFORE validating the token, so a
// deliberately invalid token still exercises the allowlist. Seconds, no inbox.
//
// ⚠️ THE CONTROL IS WHAT MAKES IT EVIDENCE. Every batch also probes an origin
// that must NOT be allowed. If that one is honoured too, the probe is measuring
// nothing and the passes mean nothing. Phase 3 finding 14.
//
// ⚠️ Do not reach for curl here. In this project's Git Bash it fails TLS to
// supabase.co with exit 35, and with `-s -o /dev/null` that looks exactly like
// an empty answer rather than a failed connection - a whole table of blank
// results that reads as data. node's fetch has no such trouble.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = join(ROOT, 'public', 'supabase-client.js');

// Same single source of truth as keepalive.mjs: the file the browser reads.
function projects() {
  const source = readFileSync(CLIENT, 'utf8');
  const out = {};
  for (const env of ['prod', 'dev']) {
    const block = source.match(new RegExp(`${env}:\\s*\\{([\\s\\S]*?)\\n {4}\\}`));
    if (!block) throw new Error(`could not find the ${env} block in public/supabase-client.js`);
    const url = block[1].match(/url:\s*'([^']+)'/);
    if (!url) throw new Error(`no url in the ${env} block`);
    out[env] = url[1];
  }
  return out;
}

// `allowed` must be honoured; `rejected` must fall back to the Site URL.
//
// The rejected lists are not padding. After the Phase 5 split, localhost and the
// preview alias belong to DEV - so prod must actively refuse them, or a laptop
// can still drive the production database through a redirect that resolves.
const EXPECTED = {
  prod: {
    allowed: [
      'https://amplifiedthinker.com/',
      'https://sing-chen.github.io/amplifiedthinker/'
    ],
    rejected: [
      'http://localhost:4321/sign-in/',
      'https://amplifiedthinker-git-feat-auth-singchen.vercel.app/',
      'https://example.com/nope'
    ]
  },
  dev: {
    allowed: [
      'http://localhost:4321/sign-in/',
      'https://amplifiedthinker-git-feat-auth-singchen.vercel.app/'
    ],
    rejected: [
      'https://amplifiedthinker.com/',
      'https://example.com/nope'
    ]
  }
};

async function askFor(projectUrl, origin) {
  const target =
    `${projectUrl}/auth/v1/verify` +
    `?token=deliberately-invalid&type=recovery&redirect_to=${encodeURIComponent(origin)}`;

  const res = await fetch(target, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (!location) {
    throw new Error(`no Location header (HTTP ${res.status}) — the endpoint did not redirect at all`);
  }
  return location;
}

// The token is invalid on purpose, so every answer carries an error fragment.
// Compare only origin + path, which is the part the allowlist decides.
function base(u) {
  try {
    const parsed = new URL(u);
    return parsed.origin + parsed.pathname;
  } catch {
    return u;
  }
}

let failures = 0;

function report(ok, label, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

async function checkProject(env, projectUrl) {
  console.log(`\n${env.toUpperCase()}  ${projectUrl}`);

  // Establish what "rejected" looks like for this project, rather than assuming
  // it. The fallback is the Site URL, which differs between the two projects and
  // is exactly the sort of value that gets changed without anyone updating a
  // hardcoded expectation here.
  const control = 'https://example.invalid/control';
  const siteUrl = base(await askFor(projectUrl, control));
  console.log(`  Site URL fallback, measured: ${siteUrl}`);

  if (base(control) === siteUrl) {
    report(false, 'CONTROL: an obviously unlisted origin was honoured',
           'every other result below is meaningless - the probe is not discriminating');
    return;
  }
  report(true, 'CONTROL: unlisted origin falls back to the Site URL', siteUrl);

  for (const origin of EXPECTED[env].allowed) {
    const got = base(await askFor(projectUrl, origin));
    report(got === base(origin), `allowed:  ${origin}`,
           got === base(origin) ? null : `honoured as ${got} — NOT on the allowlist`);
  }

  for (const origin of EXPECTED[env].rejected) {
    const got = base(await askFor(projectUrl, origin));
    report(got === siteUrl, `rejected: ${origin}`,
           got === siteUrl ? null : `HONOURED as ${got} — it should not be`);
  }
}

async function main() {
  const p = projects();
  console.log('Redirect allowlist gate — no email sent');
  for (const env of ['prod', 'dev']) {
    await checkProject(env, p[env]);
  }
  console.log(
    failures === 0
      ? '\nGate green: every origin resolves to the project that owns it.'
      : `\n${failures} FAILED.`
  );
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nverify:redirects could not run — ${err.message}`);
  process.exitCode = 1;
});
