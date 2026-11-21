#!/usr/bin/env node
'use strict';
// Student-data scan. Fails when the repo holds something shaped like
// student data, and says where without ever printing what: each finding is
// a path, a line, a kind and a short hash of the match, so the run's own
// output (CI logs, an agent session) never carries the data.
//
//   node tools/student-data-scan/check.js              the working tree (CI)
//   node tools/student-data-scan/check.js --history    every blob in git history
//   node tools/student-data-scan/check.js --roster <file>
//       also matches the full names in a roster CSV kept outside the repo
//       (a Canvas export: a "Student" column, "Last, First"). Run this on the
//       operator's own machine only; the names are never printed or stored.
//
// Office and zip files (.xlsx .docx .pptx .od* .imscc .zip ...) are
// unpacked in memory and their text members scanned the same way, reported
// as path!member:line. A container that can't be opened is a finding. Any
// other file the scan doesn't read is counted in a closing "not read" line.
//
// A finding that is a deliberate placeholder goes in allow.json by its hash,
// after a person has looked at the line. Decision on 2026-10-19: the repo
// stays public, after a scrub of the tree and its history and this check.
//
// Staff addresses (since 2026-11-07): a name-shaped address at the district
// domain (first_last@, first.last@) is a staff-email finding unless
// staff-allow.json lists it. That file names the addresses that may stay
// (the operator's own, synthetic test ones) in plain text, with a reason.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.clasp-build']);
const TEXT_EXT = /\.(js|gs|md|json|html|txt|csv|yml|yaml|ps1|py|sh|tsv|xml)$/i;
// Zip containers: unpacked in memory, their text members scanned.
const ZIP_EXT = /\.(xlsx|xlsm|docx|pptx|odt|ods|odp|imscc|zip)$/i;
// Members of a container that are read as text (as well as TEXT_EXT).
const MEMBER_TEXT_EXT = /\.(xml|html|htm|txt|csv|json|md|rels)$/i;
const MEMBER_CAP = 20 * 1024 * 1024; // bytes uncompressed; a larger member is skipped with a warning
const MAX_DEPTH = 3; // zips inside zips

const KINDS = [
  // A student account: anything @ the student domain.
  { kind: 'student-email', re: /[A-Za-z0-9._%+-]+@student\.ccpsnet\.net/gi },
  // An ID-shaped address (six or more digits before the @), any domain.
  { kind: 'id-shaped-email', re: /\b\d{6,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // A district staff account: a name-shaped local part (two runs of letters
  // joined by _ or .) directly at the district domain, so a student address
  // (@student.ccpsnet.net) and a role or test one (teacher@, admin@) do not
  // match. Colleagues' names and addresses don't belong in this repo either.
  { kind: 'staff-email', re: /\b[A-Za-z]{2,}(?:[._][A-Za-z]{2,})+@ccpsnet\.net\b/gi },
];

const hash = (s) => crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex').slice(0, 12);

function loadAllow() {
  let set;
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, 'allow.json'), 'utf8'));
    set = new Set((a.allow || []).map((x) => x.hash));
  } catch (e) {
    set = new Set();
  }
  loadStaffAllow().forEach((h) => set.add(h));
  return set;
}

// staff-allow.json: {addresses: [{address, why}]}. Each listed address is
// allowed by its hash, the same way allow.json's entries are.
function loadStaffAllow(file = path.join(__dirname, 'staff-allow.json')) {
  try {
    const a = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (a.addresses || []).filter((x) => x && x.address).map((x) => hash(x.address));
  } catch (e) {
    return [];
  }
}

function loadRoster(file) {
  if (!file) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const col = header.indexOf('student');
  if (col === -1) throw new Error('roster: no "Student" column');
  const names = new Set();
  lines.slice(1).forEach((line) => {
    const m = line.match(/^"([^"]*)"/) || [null, line.split(',')[col]];
    const raw = String(m[1] || '').trim();
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    const full = parts.length === 2 ? parts[1] + ' ' + parts[0] : raw;
    if (!raw || /^test student$|points possible/i.test(full)) return;
    if (full.split(/\s+/).length >= 2) names.add(full.toLowerCase());
  });
  return [...names].map((n) => ({
    kind: 'roster-name',
    re: new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'gi'),
  }));
}

// `seen`, when given, collects every match (lowercased, allowlisted or not)
// and suppresses a match that contains one already seen: the tag-stripped
// pass over a container member then adds only what the raw pass could not
// see. Matched text stays in memory and is never printed.
function scanText(text, label, kinds, allow, out, seen) {
  const lines = text.split(/\r?\n/);
  const found = [];
  lines.forEach((line, i) => {
    kinds.forEach((k) => {
      k.re.lastIndex = 0;
      let m;
      while ((m = k.re.exec(line)) !== null) {
        const t = m[0].toLowerCase();
        found.push(t);
        if (seen && [...seen].some((x) => t.includes(x))) continue;
        const h = hash(m[0]);
        if (!allow.has(h)) out.push({ where: label + ':' + (i + 1), kind: k.kind, hash: h });
      }
    });
  });
  if (seen) found.forEach((t) => seen.add(t));
}

// ---- zip containers ---------------------------------------------------------
// The reader is tools/lib/zip.js (moved there 2026-11-21, structure audit
// 3.9): zip64, bounds-checked, ZipError with a short reason, never file
// content, when a container can't be opened.

const { ZipError, crc32, zipEntries, zipRead } = require('../lib/zip.js');

// Block-level tags become line breaks; every other tag is dropped, so text
// split across runs (<w:r>, <a:r>, <text:span>, a shared string's <r>) is
// joined again.
const BLOCK_TAG = /^(?:p|si|c|row|tr|td|th|li|div|br|h[1-6]?|title|tc|table-cell|cell|line-break)$/i;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function stripTags(xml) {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<\/?([A-Za-z_][\w.:-]*)[^>]*>/g, (_, name) => (BLOCK_TAG.test(name.replace(/^.*:/, '')) ? '\n' : ''))
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, x, n) => {
      if (d || x) { try { return String.fromCodePoint(parseInt(d || x, d ? 10 : 16)); } catch (e) { return m; } }
      const v = ENTITIES[n.toLowerCase()];
      return v === undefined ? m : v;
    });
}

const bytesHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

// Scans one zip container. Findings go to `out`. A container (or a text
// member of one) that can't be opened is a finding, kind
// unreadable-container, hashed by the container's bytes so a person can
// allowlist a known one. An over-cap member goes to `warnings`.
function scanContainer(buf, label, kinds, allow, out, warnings, depth = 0) {
  const unreadable = (where, err) => {
    if (!(err instanceof ZipError) && !(err instanceof RangeError)) throw err;
    const h = bytesHash(buf);
    if (!allow.has(h)) out.push({ where, kind: 'unreadable-container', hash: h, note: err.message });
  };
  let entries;
  try {
    entries = zipEntries(buf);
  } catch (err) {
    return unreadable(label, err);
  }
  entries.forEach((e) => {
    if (e.name.endsWith('/')) return;
    const isText = MEMBER_TEXT_EXT.test(e.name) || TEXT_EXT.test(e.name);
    const isZip = !isText && ZIP_EXT.test(e.name) && depth < MAX_DEPTH;
    if (!isText && !isZip) return;
    const where = label + '!' + e.name;
    let data;
    try {
      data = zipRead(buf, e, MEMBER_CAP);
    } catch (err) {
      return unreadable(where, err);
    }
    if (data === null) return warnings.push({ where, kind: 'member-over-20MB' });
    if (isZip) return scanContainer(data, where, kinds, allow, out, warnings, depth + 1);
    const text = data.toString('utf8');
    const seen = new Set();
    scanText(text, where, kinds, allow, out, seen);
    if (/\.(xml|rels|html?)$/i.test(e.name)) scanText(stripTags(text), where + '#text', kinds, allow, out, seen);
  });
}

// Files the scan neither reads nor unpacks, counted by extension.
function extOf(name) {
  const b = path.basename(name);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i).toLowerCase() : '(no extension)';
}

function formatNotRead(counts) {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return 'not read: ' + (e.length ? e.map(([k, v]) => k + ' ' + v).join(', ') : 'nothing');
}

function walk(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (SKIP_DIRS.has(d.name)) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, files);
    else if (d.isFile()) files.push(p);
  });
  return files;
}

function scanTree(kinds, allow, root = ROOT) {
  const out = [];
  const warnings = [];
  const notRead = {};
  walk(root, []).forEach((f) => {
    if (path.resolve(f) === path.resolve(__filename)) return;
    const label = path.relative(root, f).split(path.sep).join('/');
    if (TEXT_EXT.test(f)) scanText(fs.readFileSync(f, 'utf8'), label, kinds, allow, out);
    else if (ZIP_EXT.test(f)) scanContainer(fs.readFileSync(f), label, kinds, allow, out, warnings);
    else notRead[extOf(f)] = (notRead[extOf(f)] || 0) + 1;
  });
  return { findings: out, warnings, notRead };
}

function scanHistory(kinds, allow) {
  const git = (args, input) => execFileSync('git', args, { cwd: ROOT, input, maxBuffer: 1 << 30 }).toString();
  const seen = new Map(); // blob -> first path
  git(['rev-list', '--all', '--objects']).split('\n').forEach((l) => {
    const sp = l.indexOf(' ');
    if (sp > 0 && !seen.has(l.slice(0, sp))) seen.set(l.slice(0, sp), l.slice(sp + 1));
  });
  const blobs = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], [...seen.keys()].join('\n'))
    .split('\n').filter((l) => l.endsWith(' blob')).map((l) => l.split(' ')[0])
    .filter((b) => !/student-data-scan\/check\.js$/.test(seen.get(b)));
  const out = [];
  const warnings = [];
  const notRead = {};
  blobs.forEach((b) => {
    const name = seen.get(b);
    const isText = TEXT_EXT.test(name);
    if (!isText && !ZIP_EXT.test(name)) {
      notRead[extOf(name)] = (notRead[extOf(name)] || 0) + 1;
      return;
    }
    const buf = execFileSync('git', ['cat-file', 'blob', b], { cwd: ROOT, maxBuffer: 1 << 30 });
    const label = name + '@' + b.slice(0, 8);
    if (isText) scanText(buf.toString(), label, kinds, allow, out);
    else scanContainer(buf, label, kinds, allow, out, warnings);
  });
  return { findings: out, warnings, notRead };
}

// Log lines that print a student identifier. The operator pastes Apps
// Script logs into sessions, so a Logger.log / console.* call in
// cas-ccps/scripts must not pass a student's address, Google ID, SIS login
// or name. Only these unambiguous variable names count: a plain `email`
// is as often a teacher's, so it is not matched (a known gap; read the
// call). String literals are blanked first, so wording never matches.
// Warnings only: they do not change the exit status.
const LOG_IDENT_RE = /(?:^|[^\w$.])(?:studentEmail|studentName|studentGoogleId|googleId|sisLogin)\b|\.(?:studentEmail|studentName|googleId|sisLogin)\b|\bstudent\.(?:email|name)\b/;
const LOG_CALL_RE = /\b(?:Logger\.log|console\.(?:log|warn|error|info))\s*\(/g;

function scanLogCalls(src, label, out) {
  LOG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = LOG_CALL_RE.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const args = src.slice(m.index + m[0].length, i - 1)
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    if (LOG_IDENT_RE.test(args)) {
      out.push({ where: label + ':' + (src.slice(0, m.index).split('\n').length), kind: 'log-identifier' });
    }
  }
  return out;
}

function scanLogs() {
  const dir = path.join(ROOT, 'cas-ccps', 'scripts');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).filter((f) => /\.(js|gs)$/.test(f)).sort().forEach((f) => {
    scanLogCalls(fs.readFileSync(path.join(dir, f), 'utf8'), path.join('cas-ccps', 'scripts', f), out);
  });
  return out;
}

function main(argv) {
  const ri = argv.indexOf('--roster');
  const kinds = KINDS.concat(loadRoster(ri !== -1 ? argv[ri + 1] : ''));
  const allow = loadAllow();
  const history = argv.includes('--history');
  const { findings, warnings, notRead } = history ? scanHistory(kinds, allow) : scanTree(kinds, allow);
  const counts = {};
  findings.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  findings.forEach((f) => console.log(f.where + '  ' + f.kind + '  ' + f.hash + (f.note ? '  (' + f.note + ')' : '')));
  warnings.forEach((w) => console.log(w.where + '  ' + w.kind + '  (warning: not read)'));
  if (!history) {
    const logs = scanLogs();
    logs.forEach((f) => console.log(f.where + '  ' + f.kind + '  (warning)'));
    if (logs.length) console.log(logs.length + ' log call(s) print a student identifier (warnings; see README).');
  }
  console.log('student-data-scan (' + (history ? 'history' : 'working tree') + ') — ' + findings.length +
    ' finding(s)' + (findings.length ? ': ' + Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  console.log(formatNotRead(notRead) + (history ? ' (blobs)' : ''));
  return findings.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = {
  scanText, hash, KINDS, loadRoster, scanLogCalls, loadAllow, loadStaffAllow,
  scanContainer, zipEntries, zipRead, ZipError, stripTags, scanTree, formatNotRead, crc32, MEMBER_CAP, TEXT_EXT, ZIP_EXT, MEMBER_TEXT_EXT,
};
