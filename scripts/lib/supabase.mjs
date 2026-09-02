// The one place a Node script learns which Supabase projects exist, which key
// is safe to use, and what .env holds. Until 2026-09-02 this was seven copies
// of a parser for public/supabase-client.js in three shapes, three copies of
// loadDotEnv and three of keyProblem — the copy that goes stale is always the
// one nobody looks at, and two of the parsers accepted an `anonKey:` field the
// file has never had.
//
// ⚠️ IT RUNS THE REAL FILE, IT DOES NOT PATTERN-MATCH IT. public/supabase-client.js
// is a browser IIFE hung off `window`; evaluating it against a stub window and
// asking its own config() for each hostname exercises the actual environment()
// rule, so this cannot drift from the file's syntax or from its blocklist the
// way a regex can. The stub carries only what the file touches at load:
// location and console. (verify-schema-columns.mjs did this first.)
//
// Node only. Nothing under public/ or src/ may import this.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = join(ROOT, 'public', 'supabase-client.js');

// A hostname the file's own environment() resolves to each project.
const HOST_FOR = { prod: 'amplifiedthinker.com', dev: 'localhost' };

/** The project the browser would use at `hostname`: `{ url, key, turnstileSiteKey }`. */
export function configFor(hostname) {
  const stub = {
    location: { hostname, protocol: 'https:' },
    console: { warn() {} },
  };
  new Function('window', readFileSync(CLIENT, 'utf8'))(stub);
  const cfg = stub.AmplifiedSupabase && stub.AmplifiedSupabase.config();
  if (!cfg || !cfg.url || !cfg.key) throw new Error(`public/supabase-client.js gave no project for "${hostname}"`);
  return cfg;
}

/** Both projects, keyed `prod` and `dev`, each `{ url, key, turnstileSiteKey }`. */
export function projects() {
  return { prod: configFor(HOST_FOR.prod), dev: configFor(HOST_FOR.dev) };
}

/** The `<ref>` in `https://<ref>.supabase.co`, or null. */
export function projectRef(url) {
  const m = String(url || '').match(/^https?:\/\/([^./]+)\./);
  return m ? m[1] : null;
}

// Refuse anything that is not an anon/publishable key. A privileged key
// bypasses RLS, so every assertion a gate makes with it is a false PASS, and
// in keepalive it would be a privileged key committed to a public repo.
//
// ⚠️ The prefix checks come FIRST. The newer `sb_secret_…` keys are not JWTs,
// so a decode-and-inspect approach throws, lands in the catch, and waves them
// through — precisely backwards.
export function keyProblem(key) {
  const k = String(key || '');
  if (/^sb_secret_/i.test(k)) return 'that is a secret key';
  if (/^service_role/i.test(k)) return 'that is a service_role key';

  const parts = k.split('.');
  if (parts.length !== 3) return null; // not a JWT we can read - allow

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role && payload.role !== 'anon') {
      return `that key has role "${payload.role}", not "anon"`;
    }
  } catch {
    return null; // undecodable - allow, the assertions themselves still hold
  }
  return null;
}

// Populates process.env from ROOT/.env for any name not already set. No .env
// is fine - the values may come from the real environment.
export function loadDotEnv() {
  try {
    const text = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    // nothing to load
  }
}
