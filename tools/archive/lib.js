'use strict';
/**
 * tools/archive/lib.js
 * ====================
 * The archive's data and rules, shared by build.js and search.js.
 *
 *   archive/quarters.json  the school quarters (dates, title, plan, summary)
 *   archive/catalog.jsonl  one record per archived file (hand-kept)
 *   archive/entries.jsonl  one record per history-log entry (generated)
 *
 * A record's `filed_on` decides its quarter: a full date must fall inside
 * the quarter, a month must overlap it, and null needs a `filed_by` note.
 * A record whose id ends in `/` is a folder: it covers every file under
 * it (retired code, kept together).
 * Node built-ins only.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ARCHIVE = 'archive';
const KINDS = ['handoff', 'plan', 'audit', 'replaced', 'history'];
const KIND_TITLES = {
  handoff: 'Handoffs',
  plan: 'Plans, sprints and specs',
  audit: 'Audits and reviews',
  replaced: 'Replaced versions and retired guides',
  history: 'History logs (older entries)',
};
// Files build.js writes; never catalogued.
const GENERATED = ['INDEX.md', 'by-system.md', 'by-pr.md', 'entries.jsonl'];
const DATA = ['catalog.jsonl', 'quarters.json'];
const REQUIRED = ['id', 'original_path', 'quarter', 'kind', 'system', 'filed_by', 'archived', 'summary'];
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

function read(rel, root) {
  return fs.readFileSync(path.join(root || REPO_ROOT, rel), 'utf8');
}

function loadQuarters(root) {
  return JSON.parse(read(path.join(ARCHIVE, 'quarters.json'), root)).quarters;
}

function readJsonl(rel, root) {
  const p = path.join(root || REPO_ROOT, rel);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(rel + ' line ' + (i + 1) + ': ' + e.message); }
    });
}

function loadCatalog(root) { return readJsonl(path.join(ARCHIVE, 'catalog.jsonl'), root); }

// The quarter a full date or a month falls in, or the quarters a month
// overlaps. Open ends (null) are unbounded.
// A missing start or end is not open-ended: the quarters are in order, so
// a missing start is bounded by the quarter before (its end, else its
// start) and a missing end by the quarter after (its start, else its end).
// Only the first quarter's start and the last one's end are unbounded.
function quartersFor(date, quarters) {
  if (!date || !DATE_RE.test(date)) return [];
  const lo = date.length === 7 ? date + '-01' : date;
  const hi = date.length === 7 ? date + '-31' : date;
  const bounds = quarters.map((q, i) => {
    const prev = quarters[i - 1];
    const next = quarters[i + 1];
    const start = q.start || (prev ? (prev.end ? nextDay(prev.end) : prev.start) : null);
    const end = q.end || (next ? (next.start ? prevDay(next.start) : next.end) : null);
    return { id: q.id, start, end };
  });
  return bounds.filter((q) => (!q.start || hi >= q.start) && (!q.end || lo <= q.end)).map((q) => q.id);
}

function shiftDay(d, n) {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const nextDay = (d) => shiftDay(d, 1);
const prevDay = (d) => shiftDay(d, -1);

// GitHub's heading anchors: lower case, punctuation dropped (letters,
// digits, spaces, hyphens and underscores kept), spaces to hyphens, a
// repeat gets -1, -2...
function slugger() {
  const seen = {};
  return (text) => {
    let s = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    if (seen[s] === undefined) { seen[s] = 0; return s; }
    seen[s] += 1;
    return s + '-' + seen[s];
  };
}

// A log's entries: a heading is an entry when no heading before it (after
// the title) is at a higher level, so `## Round 3`'s `###` subsections stay
// inside it while a changelog's top-level `###` entries count. An undated
// entry keeps `date: null` and the nearest dated entry above it as `near`.
function parseEntries(text) {
  const lines = text.split('\n');
  const slug = slugger();
  const heads = [];
  lines.forEach((l, i) => {
    const m = /^(#{1,6})\s+(.*)$/.exec(l);
    if (m) heads.push({ line: i, level: m[1].length, title: m[2].trim(), anchor: slug(m[2]) });
  });
  const entries = [];
  let minLevel = Infinity;
  heads.forEach((h) => {
    if (h.level === 1) return;
    if (h.level <= minLevel) { minLevel = h.level; }
    if (h.level === minLevel) entries.push(h);
  });
  let near = null;
  return entries.map((h, k) => {
    const end = k + 1 < entries.length ? entries[k + 1].line : lines.length;
    const body = lines.slice(h.line, end).join('\n');
    const dates = h.title.match(/\d{4}-\d{2}-\d{2}/g);
    const date = dates ? dates.sort()[0] : null;
    const rec = { title: h.title, anchor: h.anchor, line: h.line + 1, lines: end - h.line, date, near: date ? null : near, body };
    if (date) near = date;
    return rec;
  });
}

// `#123`-style references with two to four digits: PR numbers, mostly.
// The RTP's decision numbers share the form; a reader can tell them apart.
function prRefs(text) {
  const out = new Set();
  (text.match(/(?<![\w&#])#(\d{2,4})\b/g) || []).forEach((m) => out.add(Number(m.slice(1))));
  return [...out].sort((a, b) => a - b);
}

function filePath(rec) { return path.join(ARCHIVE, rec.id); }
const isFolder = (rec) => rec.id.endsWith('/');

// The record covering an archived file: its own, or a folder record above it.
function coveringRecord(file, catalog) {
  return catalog.find((r) => (isFolder(r) ? file.startsWith(r.id) : r.id === file));
}

// The history logs that roll over when a plan of record is replaced, and
// the order their entries run in.
const LIVE_LOGS = [
  { path: 'cas-ccps/HISTORY.md', order: 'oldest-first' },
  { path: 'kos-personal/CHANGELOG.md', order: 'newest-first' },
  { path: 'leader-hub/HISTORY.md', order: 'oldest-first' },
];

// Every catalogued file under archive/<quarter>/, generated and data files
// left out.
function archivedFiles(quarters, root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root || REPO_ROOT, rel);
    fs.readdirSync(abs, { withFileTypes: true }).forEach((d) => {
      const r = path.join(rel, d.name);
      if (d.isDirectory()) walk(r);
      else if (!(GENERATED.includes(d.name) && path.dirname(r).split(path.sep).length <= 2)) out.push(r);
    });
  };
  quarters.forEach((q) => {
    if (fs.existsSync(path.join(root || REPO_ROOT, ARCHIVE, q.id))) walk(path.join(ARCHIVE, q.id));
  });
  return out.map((p) => p.split(path.sep).slice(1).join('/'));
}

module.exports = {
  REPO_ROOT, ARCHIVE, KINDS, KIND_TITLES, GENERATED, DATA, REQUIRED, DATE_RE,
  read, readJsonl, loadQuarters, loadCatalog, quartersFor, slugger, parseEntries, prRefs, filePath, archivedFiles,
  isFolder, coveringRecord, LIVE_LOGS,
};
