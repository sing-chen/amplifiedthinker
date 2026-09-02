// Keeps the PRODUCTION Supabase project awake.
//
//   npm run keepalive
//
// Run daily by .github/workflows/keepalive.yml. This exists because of a
// free-tier property that only becomes dangerous once Phase 5 ships:
//
//   Supabase pauses a free project after roughly 7 days of low activity. A
//   paused project answers nothing - sign-in fails, saved progress will not
//   load, and password resets stop - until somebody notices and clicks Resume.
//
// The trap is that this site generates almost no Supabase traffic by design.
// Guests never touch it at all: from Phase 5, progress is only saved for
// signed-in users, so a week with few sign-ins is a week of near-zero activity.
// A live site can therefore idle itself into an outage while looking perfectly
// healthy, which is the exact failure shape this project keeps running into.
//
// This is a genuine read of a real table, not a synthetic ping, so it counts as
// activity for the same reason a visitor would.
//
// The DEV project is deliberately NOT kept alive. It is allowed to pause; that
// is what makes the two-project free tier workable alongside another site.

import { projects, keyProblem } from './lib/supabase.mjs';

// The credentials come out of the file the browser already uses, via
// scripts/lib/supabase.mjs, rather than being repeated here. They are public
// by design, so there is nothing to hide - the reason for reading the file is
// that two copies drift. The key guard lives in the same module: this script
// runs unattended in CI, and a privileged key committed to a public repo is
// the one mistake with no cheap recovery.
function prodConfig() { return projects().prod; }

async function main() {
  const { url, key } = prodConfig();

  const problem = keyProblem(key);
  if (problem) {
    throw new Error(`refusing to run: ${problem}. It must never reach CI.`);
  }

  // news_stories is granted to anon by the Phase 3 migration, so this is a real
  // query an ordinary visitor could make. It returns [] today and published
  // rows from Phase 6 - either is a success here, because what is being
  // asserted is that the database answered at all.
  const endpoint = `${url}/rest/v1/news_stories?select=id&limit=1`;

  const started = Date.now();
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  const ms = Date.now() - started;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} after ${ms}ms — ${body.slice(0, 300)}`);
  }

  await res.json();
  console.log(`ok — ${url} answered in ${ms}ms`);
}

// Fail loudly and with a non-zero exit code. A keep-alive that swallows its own
// errors is worse than no keep-alive: the project pauses anyway, and the green
// tick says otherwise. GitHub emails on a failed scheduled run, which is the
// only notification this has.
// `process.exitCode = 1` rather than `process.exit(1)`: node then unwinds
// normally once the socket from the failed fetch has closed. Calling exit()
// while that handle is still open crashes the runtime on Windows with a libuv
// assertion, which produces exit code 127 and a stack trace instead of the
// clean, readable failure this is supposed to give.
main().catch((err) => {
  console.error(`KEEPALIVE FAILED — ${err.message}`);
  console.error(
    'If this is a connection error, check whether the project is already paused ' +
    'at supabase.com/dashboard and click Resume.'
  );
  process.exitCode = 1;
});
