/* The two-account RLS proof for `notes` and `user_news`.
 * Deferred out of Phase 6 stage 14 and owed at stage 17.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ WHY NO AUTOMATED CHECK IN THIS REPO CAN STAND IN FOR THIS.
 *
 * `npm run verify:rls` authenticates as nobody: it proves the ANON key reads
 * and writes nothing. Every policy on `notes` and `user_news` applies to the
 * `authenticated` role, so the predicate that actually protects a reader's
 * notes — `user_id = auth.uid()` — has never been executed by any check here.
 *
 * ⚠️ AND THE APPLICATION CANNOT DETECT THE FAILURE, BY CONSTRUCTION.
 * `news-actions.js` always sends `.eq('user_id', uid)`. If the policy were
 * `using (true)` — one word wrong — the site would look EXACTLY the same: your
 * notes visible, nobody else's showing up, everything feeling correct. The
 * client-side filter masks a broken policy completely. The only way to find out
 * is to deliberately make the request the application never makes.
 *
 * ⚠️ AND ONE ACCOUNT CANNOT PROVE IT. With a single owner, "returns only mine"
 * and "returns everything" are the same result — the test passes while
 * measuring nothing. Same reason verify-redirects insists on probing an origin
 * that must be refused: without the negative case there is no evidence.
 *
 * ⚠️ `using` GOVERNS WHAT YOU CAN SEE; `with check` GOVERNS WHAT YOU CAN WRITE.
 * A policy can be correct on reads and still let anyone write rows on someone
 * else's behalf. Probe 4 is the one that gets forgotten.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * HOW TO RUN
 *   1. Sign in as account A on https://amplifiedthinker.com/news/
 *      Make sure A has at least one note saved against a story.
 *      Open the browser console and paste PART ONE. Copy what it prints.
 *   2. Sign out. Sign in as account B, same page, console.
 *      Paste PART TWO, with A's values filled into the three constants.
 *
 * Both parts must run on a page where the auth stack loads — a /news/ page
 * while signed in does. `window.AmplifiedAuth` must exist; if it is undefined,
 * you are on a page that does not load it, or the session did not restore.
 */


/* ════════════════════════════════════════════════════════════════════════════
 * PART ONE — as account A. Captures what B will try to reach.
 * ════════════════════════════════════════════════════════════════════════════ */

(async () => {
  const sb = window.AmplifiedAuth.client();
  const uid = window.AmplifiedAuth.user().id;

  const { data, error } = await sb.from('notes').select('id,target_id,body');
  if (error) return console.error('read failed:', error);
  if (!data.length) return console.warn('Account A has no notes. Write one first, then re-run.');

  const n = data[0];
  console.log('Paste these into PART TWO:\n');
  console.log(`const A_UID    = '${uid}';`);
  console.log(`const A_NOTE   = '${n.id}';`);
  console.log(`const A_TARGET = '${n.target_id}';`);
  console.log(`const A_BODY   = ${JSON.stringify(n.body)};`);
  console.log(`\n(A has ${data.length} note(s).)`);
})();


/* ════════════════════════════════════════════════════════════════════════════
 * PART TWO — as account B. Every probe must be refused.
 * ════════════════════════════════════════════════════════════════════════════ */

(async () => {
  // ── paste from PART ONE ──
  const A_UID    = 'PASTE';
  const A_NOTE   = 'PASTE';
  const A_TARGET = 'PASTE';
  const A_BODY   = 'PASTE';
  // ─────────────────────────

  const sb = window.AmplifiedAuth.client();
  const B  = window.AmplifiedAuth.user().id;
  const out = [];
  const add = (n, label, ok, detail) => out.push({ '#': n, verdict: ok ? 'PASS' : '>>> FAIL', label, detail });

  if (B === A_UID) {
    return console.error('You are signed in as A. This proves nothing — sign in as the OTHER account.');
  }

  // 1 · SELECT with no user filter — the request the app never makes.
  const r1 = await sb.from('notes').select('id,user_id');
  const foreign = (r1.data || []).filter((r) => r.user_id !== B);
  add(1, 'select * from notes returns only B\'s rows',
      !r1.error && foreign.length === 0,
      r1.error ? r1.error.message : `${(r1.data || []).length} row(s), ${foreign.length} belonging to someone else`);

  // 2 · Reach for a story A noted, by target.
  const r2 = await sb.from('notes').select('id').eq('target_id', A_TARGET);
  add(2, 'A\'s note is invisible when addressed directly',
      !r2.error && (r2.data || []).every((r) => !r.id || r.id !== A_NOTE),
      r2.error ? r2.error.message : `${(r2.data || []).length} row(s) returned`);

  // 3 · UPDATE A's note.
  //     ⚠️ WRITES A'S OWN BODY BACK, NOT 'x'. If the policy IS broken this
  //     probe succeeds — and a probe that proves a security hole by corrupting
  //     someone's data is a bad probe. Setting the value it already has makes
  //     the failure case harmless and still reports 1 row changed.
  const r3 = await sb.from('notes').update({ body: A_BODY }).eq('id', A_NOTE).select('id');
  add(3, 'cannot UPDATE A\'s note (0 rows changed)',
      !r3.error && (r3.data || []).length === 0,
      r3.error ? `refused: ${r3.error.message}` : `${(r3.data || []).length} row(s) changed`);

  // 4 · INSERT a row on A's behalf. `with check`, not `using`.
  const r4 = await sb.from('notes')
    .insert({ user_id: A_UID, target_type: 'news', target_id: A_TARGET, body: 'rls probe' })
    .select('id');
  add(4, 'cannot INSERT a note as A (with check)',
      Boolean(r4.error) || (r4.data || []).length === 0,
      r4.error ? `refused: ${r4.error.message}` : `>>> INSERTED ${r4.data[0].id} — DELETE THIS ROW`);

  // 5 · Same question for user_news, which nothing else here covers.
  const r5 = await sb.from('user_news').select('user_id,story_id');
  const foreignUN = (r5.data || []).filter((r) => r.user_id !== B);
  add(5, 'user_news returns only B\'s rows',
      !r5.error && foreignUN.length === 0,
      r5.error ? r5.error.message : `${(r5.data || []).length} row(s), ${foreignUN.length} belonging to someone else`);

  console.table(out);

  // Probe 4 leaves a row behind ONLY if it should not have succeeded. Try to
  // clear it, and say so loudly if it cannot be cleared either.
  if (!r4.error && (r4.data || []).length) {
    const del = await sb.from('notes').delete().eq('id', r4.data[0].id).select('id');
    console.error(del.error || !(del.data || []).length
      ? `⚠️ Could not clean up ${r4.data[0].id} — delete it from the SQL editor.`
      : `Cleaned up the row probe 4 should never have created.`);
  }

  const failed = out.filter((r) => r.verdict !== 'PASS');
  console.log(failed.length
    ? `⚠️ ${failed.length} probe(s) FAILED — RLS is not confining rows to their owner.`
    : 'All probes refused. RLS is confining rows to their owner on both tables.');
})();
