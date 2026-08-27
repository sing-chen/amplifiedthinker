// Proves `notes_own` actually scopes skill notes — the check the application
// cannot perform on itself.
//
// PASTE THIS INTO THE BROWSER CONSOLE on a plan or primer page, signed in.
// It is not imported by anything and never ships; it uses the page's own
// Supabase client, so it needs no credentials of its own.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A PROBE AND NOT A TEST
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE SITE CANNOT DETECT A BROKEN POLICY HERE, AND WOULD LOOK PERFECT WITH
// ONE. skill-notes.js always sends `.eq('user_id', uid)`. If `notes_own` were
// `using (true)`, every page would behave EXACTLY as it does now — your notes
// visible, nobody else's on screen, everything feeling right — because the
// client filter masks it completely. `npm run verify:rls` cannot see it either:
// it never authenticates. The only way to know is to deliberately make the
// request the application never makes, from a SECOND account.
//
// ⚠️ AND ONE ACCOUNT CANNOT DO IT. With a single owner, "only mine" and
// "everything" return the same rows, so every probe passes for the wrong
// reason.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE MISTAKE THIS IS SHAPED TO AVOID
// ─────────────────────────────────────────────────────────────────────────────
//
// Phase 6 ran this proof and reported five probes, four conclusive and one not.
// Probe 5 said `user_news` returned "0 rows, 0 someone else's" — and account A
// had never saved a story, so empty was the answer either way. It was written
// down as a PASS in a table of five and was nearly accepted.
//
// So this probe refuses to run unless there is something to find:
//
//   1. account A writes a note and CONFIRMS IT EXISTS from its own session
//   2. it prints A's user id and the note's id, which step 2 needs
//   3. account B looks for A's SPECIFIC user id and A's SPECIFIC note id,
//      never merely for "not mine"
//   4. a CONTROL probe that must SUCCEED runs in the same batch, so "found
//      nothing" can be told apart from "the request itself is broken"
//   5. account A checks afterwards that its note is untouched, because an RLS
//      refusal on UPDATE/DELETE is SILENT — zero rows and no error, which looks
//      identical to a write that simply matched nothing
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO RUN IT
// ─────────────────────────────────────────────────────────────────────────────
//
//   As account A, on a plan page:      await NotesProbe.seed()
//                                      -> copy the printed ownerId and noteId
//
//   Sign out. Sign in as account B, same page:
//                                      await NotesProbe.probe('<ownerId>', '<noteId>')
//
//   Sign out. Back as account A:       await NotesProbe.confirmIntact('<noteId>')
//
//   Either account, to tidy up:        await NotesProbe.cleanup()
//
// ⚠️ RUN IT AGAINST DEV. It writes real rows.

(function (w) {
  'use strict';

  var MARK = 'RLS PROBE — safe to delete';

  function sb() {
    var a = w.AmplifiedAuth;
    if (!a || !a.isSignedIn()) throw new Error('not signed in on this page');
    return a.client();
  }
  function uid() { return w.AmplifiedAuth.user().id; }

  function targetId() {
    var m = /\/skills\/([a-z0-9-]+)\/(plan|primer)(?:\.html)?$/i.exec(w.location.pathname);
    if (!m) throw new Error('run this on a plan or primer page');
    return m[1].toLowerCase() + ':' + m[2].toLowerCase();
  }

  function line(ok, label, detail) {
    var tag = ok === null ? '  ?  ' : (ok ? ' PASS' : ' FAIL');
    console.log(tag + '  ' + label + (detail ? '\n        ' + detail : ''));
    return ok;
  }

  async function seed() {
    var c = sb(), me = uid(), t = targetId();
    var ins = await c.from('notes')
      .insert({ user_id: me, target_type: 'skill', target_id: t, anchor: null, body: MARK })
      .select('id,body');
    if (ins.error) throw ins.error;
    var noteId = ins.data[0].id;

    // ⚠️ CONFIRMED FROM A's OWN SESSION, and this is the step Phase 6 skipped.
    // Without it, everything account B reports later is consistent with the row
    // never having existed.
    var back = await c.from('notes').select('id,body,user_id').eq('id', noteId);
    if (back.error) throw back.error;
    var found = back.data && back.data.length === 1;

    console.log('\n─ seed, as account A ─────────────────────────────────────');
    line(found, 'the note exists and A can read it', found ? 'body: ' + back.data[0].body : 'NOT FOUND — stop here, the probe would be meaningless');
    if (!found) throw new Error('seed failed');

    console.log('\n  ownerId : ' + me);
    console.log('  noteId  : ' + noteId);
    console.log('\n  Sign out, sign in as B, then run:');
    console.log("  await NotesProbe.probe('" + me + "', '" + noteId + "')\n");
    return { ownerId: me, noteId: noteId };
  }

  async function probe(ownerId, noteId) {
    if (!ownerId || !noteId) throw new Error('pass the ownerId and noteId printed by seed()');
    var c = sb(), me = uid(), t = targetId();
    if (me === ownerId) throw new Error('still signed in as account A — sign in as the SECOND account');

    var results = [];
    console.log('\n─ probe, as account B ────────────────────────────────────');
    console.log('  B  = ' + me);
    console.log('  A  = ' + ownerId + '\n');

    // 0. CONTROL. B writes and reads its own note. If this fails, every "found
    //    nothing" below is uninformative — a probe that cannot succeed is not
    //    measuring anything. Same argument as the control entry in
    //    verify-redirects.
    var mine = await c.from('notes')
      .insert({ user_id: me, target_type: 'skill', target_id: t, anchor: null, body: MARK })
      .select('id');
    var controlOk = !mine.error && mine.data && mine.data.length === 1;
    results.push(line(controlOk, 'CONTROL: B can write and read its own note',
      controlOk ? '' : 'the probe itself is broken — fix this before reading anything below'));
    if (!controlOk) return console.error('control failed:', mine.error);

    // 1. The request the app NEVER makes: no user_id filter at all.
    var all = await c.from('notes').select('id,user_id,body');
    var leaked = (all.data || []).filter(function (r) { return r.user_id === ownerId; });
    results.push(line(!all.error && leaked.length === 0,
      'unfiltered select returns none of A\'s rows',
      'rows visible: ' + ((all.data || []).length) + ', of which A\'s: ' + leaked.length));

    // 2. Asking for A's rows BY NAME. "not mine" is not the question.
    var byOwner = await c.from('notes').select('id').eq('user_id', ownerId);
    results.push(line(!byOwner.error && (byOwner.data || []).length === 0,
      'select where user_id = A returns nothing',
      'rows: ' + ((byOwner.data || []).length)));

    // 3. Asking for the exact row.
    var byId = await c.from('notes').select('id,body').eq('id', noteId);
    results.push(line(!byId.error && (byId.data || []).length === 0,
      'select where id = A\'s note returns nothing',
      'rows: ' + ((byId.data || []).length)));

    // 4/5. ⚠️ WRITES ARE REFUSED SILENTLY. RLS does not error on UPDATE or
    //      DELETE — the row simply falls outside `using`, so zero rows match and
    //      the call reports success. Asserting "no error" here would pass on a
    //      policy that allowed the write. Count the rows, and have A confirm.
    var upd = await c.from('notes').update({ body: 'OVERWRITTEN BY B' }).eq('id', noteId).select('id');
    results.push(line(!upd.error && (upd.data || []).length === 0,
      'update of A\'s note affects 0 rows',
      'rows affected: ' + ((upd.data || []).length) + (upd.error ? ' (error: ' + upd.error.code + ')' : '')));

    var del = await c.from('notes').delete().eq('id', noteId).select('id');
    results.push(line(!del.error && (del.data || []).length === 0,
      'delete of A\'s note affects 0 rows',
      'rows affected: ' + ((del.data || []).length)));

    // 6. INSERT is the one that DOES error, because `with check` rejects it.
    var forge = await c.from('notes')
      .insert({ user_id: ownerId, target_type: 'skill', target_id: t, anchor: null, body: 'FORGED BY B' })
      .select('id');
    var refused = Boolean(forge.error);
    results.push(line(refused, 'insert with user_id = A is refused',
      refused ? 'error ' + forge.error.code + ': ' + forge.error.message : 'IT SUCCEEDED — with check is not doing its job'));

    var passed = results.filter(Boolean).length;
    console.log('\n  ' + passed + ' / ' + results.length + ' passed');
    console.log('\n  ⚠️ NOT DONE YET. The update and delete above are only proven');
    console.log('     by A finding its note unchanged. Sign back in as A and run:');
    console.log("     await NotesProbe.confirmIntact('" + noteId + "')\n");
    return passed === results.length;
  }

  async function confirmIntact(noteId) {
    var c = sb();
    var r = await c.from('notes').select('id,body').eq('id', noteId);
    console.log('\n─ confirm, as account A ──────────────────────────────────');
    var row = r.data && r.data[0];
    var ok = Boolean(row) && row.body === MARK;
    line(ok, 'A\'s note still exists with its original body',
      row ? 'body: ' + row.body : 'GONE — B\'s delete took effect');
    if (row && row.body !== MARK) console.error('body was changed by B');
    return ok;
  }

  async function cleanup() {
    var c = sb();
    var r = await c.from('notes').delete().eq('user_id', uid()).eq('body', MARK).select('id');
    console.log('removed ' + ((r.data || []).length) + ' probe row(s) for this account');
    console.log('⚠️ run this as BOTH accounts — each can only delete its own.');
  }

  w.NotesProbe = { seed: seed, probe: probe, confirmIntact: confirmIntact, cleanup: cleanup };
  console.log('NotesProbe ready — start with: await NotesProbe.seed()');
})(window);
