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
// A finding that is a deliberate placeholder goes in allow.json by its hash,
// after a person has looked at the line. Decision on 2026-10-19: the repo
// stays public, after a scrub of the tree and its history and this check.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.clasp-build']);
const TEXT_EXT = /\.(js|gs|md|json|html|txt|csv|yml|yaml|ps1|py|sh|tsv|xml)$/i;

const KINDS = [
  // A student account: anything @ the student domain.
  { kind: 'student-email', re: /[A-Za-z0-9._%+-]+@student\.ccpsnet\.net/gi },
  // An ID-shaped address (six or more digits before the @), any domain.
  { kind: 'id-shaped-email', re: /\b\d{6,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

const hash = (s) => crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex').slice(0, 12);

function loadAllow() {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, 'allow.json'), 'utf8'));
    return new Set((a.allow || []).map((x) => x.hash));
  } catch (e) {
    return new Set();
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

function scanText(text, label, kinds, allow, out) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    kinds.forEach((k) => {
      k.re.lastIndex = 0;
      let m;
      while ((m = k.re.exec(line)) !== null) {
        const h = hash(m[0]);
        if (!allow.has(h)) out.push({ where: label + ':' + (i + 1), kind: k.kind, hash: h });
      }
    });
  });
}

function walk(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (SKIP_DIRS.has(d.name)) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, files);
    else if (TEXT_EXT.test(d.name)) files.push(p);
  });
  return files;
}

function scanTree(kinds, allow) {
  const out = [];
  walk(ROOT, []).forEach((f) => {
    if (path.resolve(f) === path.resolve(__filename)) return;
    scanText(fs.readFileSync(f, 'utf8'), path.relative(ROOT, f), kinds, allow, out);
  });
  return out;
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
    .filter((b) => TEXT_EXT.test(seen.get(b)) && !/student-data-scan\/check\.js$/.test(seen.get(b)));
  const out = [];
  blobs.forEach((b) => {
    const text = execFileSync('git', ['cat-file', 'blob', b], { cwd: ROOT, maxBuffer: 1 << 30 }).toString();
    scanText(text, seen.get(b) + '@' + b.slice(0, 8), kinds, allow, out);
  });
  return out;
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
  const findings = history ? scanHistory(kinds, allow) : scanTree(kinds, allow);
  const counts = {};
  findings.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  findings.forEach((f) => console.log(f.where + '  ' + f.kind + '  ' + f.hash));
  if (!history) {
    const logs = scanLogs();
    logs.forEach((f) => console.log(f.where + '  ' + f.kind + '  (warning)'));
    if (logs.length) console.log(logs.length + ' log call(s) print a student identifier (warnings; see README).');
  }
  console.log('student-data-scan (' + (history ? 'history' : 'working tree') + ') — ' + findings.length +
    ' finding(s)' + (findings.length ? ': ' + Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  return findings.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { scanText, hash, KINDS, loadRoster, scanLogCalls };
