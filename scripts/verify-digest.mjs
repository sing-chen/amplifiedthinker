// Checks the structured files the daily digest task writes, one per run:
//
//   npm run verify:digest -- <file.json | folder> [more ...]
//
// The `daily-workforce-digest` scheduled task (Claude desktop, not this repo)
// writes `<YYYY-MM-DD>.json` beside its readable digest. Those files live in the
// owner's Drive folder, NOT in this repo: they hold third-party summaries that
// have not been curated yet, and the repo is public. So there is no default
// path here, and none should be added — pass the folder.
//
// This is the gate between "a model wrote some JSON" and "a job builds SQL from
// it". It reads only; it never edits a digest file.
//
// ⚠️ TAGS ARE CHECKED AGAINST THE SITE'S OWN LIST, imported from
// src/lib/news-render.mjs, not a copy. Before 2026-11-19 the digest used its own
// seven-tag vocabulary and /add-news dropped whatever did not match, so stories
// quietly lost tags on every load. A retyped list here would drift the same way.
//
// ⚠️ An empty `stories` array is VALID. The file's existence is the signal that
// the run happened; "found nothing that qualified" and "did not run" must not
// look the same to the weekly job.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { THEME_ORDER } from '../src/lib/news-render.mjs';

const TAGS = new Set(THEME_ORDER);
const STORY_KEYS = ['title', 'source', 'url', 'published', 'summary', 'implications', 'tags', 'connects_to'];
const REQUIRED = ['title', 'source', 'url', 'published', 'summary', 'implications'];
const TOP_KEYS = ['digest_date', 'window', 'stories', 'note'];

// CP1252-decoded UTF-8, built from char codes for the reason verify-encoding.mjs
// gives: a list of mojibake stored as mojibake stops matching once re-encoded.
const S = (...c) => String.fromCharCode(...c);
const MOJIBAKE = [S(0xc2, 0xb7), S(0xe2, 0x20ac), S(0xc3, 0xa9), S(0xc3, 0xa8), S(0xc2, 0xa0)];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
  && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

function checkFile(path) {
  const errors = [];
  const warnings = [];
  const name = basename(path);
  const fileDate = name.replace(/\.json$/, '');
  if (!isDate(fileDate)) errors.push(`file name is not <YYYY-MM-DD>.json`);

  const raw = readFileSync(path);
  if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    errors.push('starts with a UTF-8 BOM: something other than the Write tool wrote it (PowerShell?)');
  }
  const text = raw.toString('utf8');
  for (const m of MOJIBAKE) {
    if (text.includes(m)) { errors.push(`contains CP1252-decoded UTF-8 (${JSON.stringify(m)})`); break; }
  }

  let doc;
  try { doc = JSON.parse(text.replace(/^﻿/, '')); }
  catch (e) { errors.push(`not valid JSON: ${e.message}`); return { name, errors, warnings, stories: [] }; }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('top level must be an object');
    return { name, errors, warnings, stories: [] };
  }
  for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) warnings.push(`unknown top-level key "${k}"`);

  if (doc.digest_date !== fileDate) errors.push(`digest_date ${JSON.stringify(doc.digest_date)} does not match the file name`);
  const w = doc.window;
  if (!w || !isDate(w.from) || !isDate(w.to)) errors.push('window must be { from, to } as YYYY-MM-DD');
  else if (w.from > w.to) errors.push(`window.from ${w.from} is after window.to ${w.to}`);

  if (!Array.isArray(doc.stories)) {
    errors.push('stories must be an array (empty is fine)');
    return { name, errors, warnings, stories: [] };
  }

  const seenUrls = new Set();
  doc.stories.forEach((s, i) => {
    const at = `story ${i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`${at}: not an object`); return; }
    for (const k of Object.keys(s)) if (!STORY_KEYS.includes(k)) warnings.push(`${at}: unknown key "${k}"`);
    for (const k of REQUIRED) if (!nonEmpty(s[k])) errors.push(`${at}: "${k}" is missing or empty`);

    if (nonEmpty(s.url)) {
      let u = null;
      try { u = new URL(s.url); } catch { errors.push(`${at}: url does not parse`); }
      if (u && !/^https?:$/.test(u.protocol)) errors.push(`${at}: url is not http(s)`);
      if (seenUrls.has(s.url)) errors.push(`${at}: url repeats an earlier story in this file`);
      seenUrls.add(s.url);
    }
    if (nonEmpty(s.published)) {
      if (!isDate(s.published)) errors.push(`${at}: published ${JSON.stringify(s.published)} is not YYYY-MM-DD`);
      else {
        if (isDate(fileDate) && s.published > fileDate) errors.push(`${at}: published ${s.published} is after the digest date`);
        if (w && isDate(w.from) && s.published < w.from) warnings.push(`${at}: published ${s.published} is before the window`);
      }
    }
    if (!Array.isArray(s.tags) || s.tags.length === 0) errors.push(`${at}: tags must be a non-empty array`);
    else {
      const bad = s.tags.filter((t) => !TAGS.has(t));
      if (bad.length) errors.push(`${at}: tags not in the site's list: ${bad.map((t) => JSON.stringify(t)).join(', ')}`);
      if (new Set(s.tags).size !== s.tags.length) errors.push(`${at}: duplicate tag`);
    }
    if ('connects_to' in s && s.connects_to !== null && typeof s.connects_to !== 'string') {
      errors.push(`${at}: connects_to must be a string or null`);
    }
  });

  return { name, errors, warnings, stories: doc.stories };
}

function collect(arg) {
  const st = statSync(arg);
  if (st.isFile()) return [arg];
  return readdirSync(arg).filter((f) => f.endsWith('.json')).sort().map((f) => join(arg, f));
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: npm run verify:digest -- <file.json | folder> [more ...]');
  console.error('There is deliberately no default: the digest files live outside this public repo.');
  process.exit(2);
}

let files;
try { files = args.flatMap(collect); }
catch (e) { console.error(`cannot read ${e.path ?? args.join(' ')}: ${e.code ?? e.message}`); process.exit(2); }
if (files.length === 0) { console.error('no .json files found: not a pass'); process.exit(1); }

let failed = 0;
let total = 0;
const urlFiles = new Map();
for (const f of files) {
  const r = checkFile(f);
  total += r.stories.length;
  for (const s of r.stories) if (s && nonEmpty(s.url)) {
    if (!urlFiles.has(s.url)) urlFiles.set(s.url, []);
    urlFiles.get(s.url).push(r.name);
  }
  const status = r.errors.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${r.name}  ${r.stories.length} stor${r.stories.length === 1 ? 'y' : 'ies'}`);
  for (const e of r.errors) console.log(`       error: ${e}`);
  for (const w of r.warnings) console.log(`       warn:  ${w}`);
  if (r.errors.length) failed++;
}

const repeats = [...urlFiles].filter(([, fs]) => fs.length > 1);
console.log(`\n${files.length} file(s), ${total} stories, ${failed} failed.`);
if (repeats.length) {
  // Expected, not an error: each run looks back 7 days, so neighbouring days
  // overlap. The weekly job collapses these; this line shows how much.
  console.log(`${repeats.length} URL(s) appear in more than one file (overlapping 7-day windows).`);
}
process.exit(failed ? 1 : 0);
