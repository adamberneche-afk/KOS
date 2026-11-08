#!/usr/bin/env node
'use strict';
// Release check (plan item L1, approved 2026-11-08). Before any part of this
// repo is published it must hold no Drive IDs or Docs links (no allowlist),
// no tracked manifests or exports, no student-data patterns, no secrets, and
// a LICENSE in every public unit. This check reports all five over the
// tracked tree, and says where without ever printing a value: an ID or link
// is shown redacted, `docs.google.com/document/d/…(44)`.
//
//   node tools/release-check/check.js                  tracked tree, warn-only
//   node tools/release-check/check.js --gate           exit 1 on any failing finding
//   RELEASE_CHECK_GATE=1 node tools/release-check/check.js    the same, from the env
//   node tools/release-check/check.js --staged         staged files only (the pre-commit hook)
//   node tools/release-check/check.js --history        also count matches in git history (counts only)
//   node tools/release-check/check.js --report <file>  also write the audit as Markdown
//
// Warn-only is the default until the operator has read the audit
// (meta/RELEASE_AUDIT_2026-11-08.md) and says to turn the gate on.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sds = require('../student-data-scan/check.js');

const ROOT = path.join(__dirname, '..', '..');

// ---- content rules -----------------------------------------------------------
// Each rule's regex has two named groups: `pre`, the part that is printed,
// and `id`, the value, which is only ever printed as …(its length).
const ID = '[A-Za-z0-9_-]';
const CONTENT_RULES = [
  {
    rule: 'docs-link', bucket: 'drive',
    re: new RegExp('(?<pre>docs\\.google\\.com/(?:document|spreadsheets|presentation|forms|drawings)/(?:u/\\d+/)?d/(?:e/)?)(?<id>' + ID + '{20,})', 'g'),
  },
  {
    rule: 'drive-link', bucket: 'drive',
    re: new RegExp('(?<pre>drive\\.google\\.com/(?:file/(?:u/\\d+/)?d/|drive/(?:u/\\d+/)?folders/|(?:open|uc)\\?(?:[^\\s"\'<>]*?&)?id=))(?<id>' + ID + '{20,})', 'g'),
  },
  {
    rule: 'forms-short-link', bucket: 'drive',
    re: new RegExp('(?<pre>forms\\.gle/)(?<id>[A-Za-z0-9]{10,})', 'g'),
  },
  {
    // A Drive ID in code, where it is plainly labelled as one: a getter
    // (getFileById('…'), SpreadsheetApp.openById('…')) with a literal.
    rule: 'drive-id-call', bucket: 'drive',
    re: new RegExp('(?<pre>\\b(?:getFileById|getFolderById|openById)\\s*\\(\\s*)(?<q>[\'"`])(?<id>' + ID + '{25,44})\\k<q>', 'g'),
  },
  {
    // A web app on a Workspace domain: script.google.com/a/macros/<domain>/s/<id>.
    // The domain is redacted too.
    rule: 'script-url-domain', bucket: 'script',
    re: new RegExp('(?<pre>script\\.google\\.com/a/macros/)(?<dom>[A-Za-z0-9.-]+)/s/(?<id>' + ID + '{20,})', 'g'),
  },
  {
    rule: 'script-url', bucket: 'script',
    re: new RegExp('(?<pre>script\\.google\\.com/macros/s/)(?<id>' + ID + '{20,})', 'g'),
  },
  {
    rule: 'script-project-link', bucket: 'script',
    re: new RegExp('(?<pre>script\\.google\\.com/(?:home/projects/|d/))(?<id>' + ID + '{20,})', 'g'),
  },
  // Secrets in file contents. secrets-doctor (scripts/secrets-doctor.mjs)
  // checks that the repo's Actions secrets are *configured*; nothing else
  // here reads file contents for a credential, so these few
  // high-confidence shapes are not a duplicate of it.
  { rule: 'private-key', bucket: 'secret', re: /(?<pre>-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----)(?<id>)/g },
  { rule: 'google-api-key', bucket: 'secret', re: /(?<pre>)(?<id>AIza[0-9A-Za-z_-]{35})/g },
  { rule: 'google-oauth-secret', bucket: 'secret', re: /(?<pre>)(?<id>GOCSPX-[A-Za-z0-9_-]{20,})/g },
  { rule: 'github-token', bucket: 'secret', re: /(?<pre>)(?<id>\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{50,})/g },
  { rule: 'stripe-live-key', bucket: 'secret', re: /(?<pre>)(?<id>\b[sr]k_live_[A-Za-z0-9]{20,})/g },
  { rule: 'aws-access-key', bucket: 'secret', re: /(?<pre>)(?<id>\bAKIA[0-9A-Z]{16}\b)/g },
  { rule: 'slack-token', bucket: 'secret', re: /(?<pre>)(?<id>\bxox[abposr]-[A-Za-z0-9-]{10,})/g },
  { rule: 'anthropic-key', bucket: 'secret', re: /(?<pre>)(?<id>\bsk-ant-[A-Za-z0-9_-]{20,})/g },
];

// A literal assigned to a name labelled as an ID: FOO_ID = '…', fooId: "…",
// "scriptId": "…". A script or deployment name goes to the script bucket
// (25–100 characters); any other name is a Drive ID only at Drive's own
// length (25–44). A look-alike (a hex hash, a snake_case word) is skipped.
const LABELLED_RE = new RegExp(
  '(?<pre>\\b(?<name>[A-Za-z_$][\\w$]*?(?:_ID|_Id|Id|ID))[\'"]?\\s*[:=]\\s*)(?<q>[\'"`])(?<id>' + ID + '{25,100})\\k<q>', 'g');

// A Drive or script ID is random base64url: it has upper- and lower-case
// letters. A hex hash, a slug (THE-4-PS-OF-…) or a snake_case name does not.
function lookAlike(v) {
  return /^[0-9a-f]+$/i.test(v) || !/[a-z]/.test(v) || !/[A-Z]/.test(v);
}

function labelled(line, push) {
  LABELLED_RE.lastIndex = 0;
  let m;
  while ((m = LABELLED_RE.exec(line)) !== null) {
    const { name, id } = m.groups;
    if (lookAlike(id)) continue;
    const isScript = /script|deploy/i.test(name);
    if (!isScript && id.length > 44) continue;
    push({
      rule: isScript ? 'script-id-labelled' : 'drive-id-labelled',
      bucket: isScript ? 'script' : 'drive',
      shown: name + ' = …(' + id.length + ')',
    });
  }
}

function redact(rule, g) {
  const n = g.id ? '…(' + g.id.length + ')' : '';
  if (rule.bucket === 'secret') return rule.rule + (n ? ' ' + n : '');
  if (g.dom !== undefined) return g.pre + '<domain>/s/' + n;
  return g.pre + n;
}

// Every content finding on one line of text: [{rule, bucket, shown}].
function scanLine(line) {
  const out = [];
  const push = (f) => out.push(f);
  CONTENT_RULES.forEach((r) => {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(line)) !== null) {
      if (r.rule === 'drive-id-call' && lookAlike(m.groups.id)) continue;
      push({ rule: r.rule, bucket: r.bucket, shown: redact(r, m.groups) });
    }
  });
  labelled(line, push);
  return out;
}

// Student-data patterns: student-data-scan's own kinds and allowlist.
// Findings carry its 12-character hash, never the match.
let STUDENT_ALLOW = null;
function scanText(text, label, out) {
  text.split(/\r?\n/).forEach((line, i) => {
    scanLine(line).forEach((f) => out.push(Object.assign({ where: label + ':' + (i + 1) }, f)));
  });
  if (!STUDENT_ALLOW) STUDENT_ALLOW = sds.loadAllow();
  const sd = [];
  sds.scanText(text, label, sds.KINDS, STUDENT_ALLOW, sd);
  sd.forEach((f) => out.push({ where: f.where, rule: f.kind, bucket: 'student-data', shown: 'hash ' + f.hash }));
  return out;
}

// ---- tracked files: exports and manifests -------------------------------------
// An export is data taken out of a system and committed: a spreadsheet or
// tabular file (.csv .tsv .xlsx .xlsm .xls .ods), a Canvas course export
// (.imscc), a file named as a catalog, inventory, export, dump, gradebook,
// roster or snapshot, or a JSON file shaped like a Drive listing (three or
// more "mimeType" keys). An Apps Script manifest (appsscript.json) is source:
// it goes in the "probably fine" bucket. An Office document or PDF is not an
// export by this definition; it is listed for review, since the content
// rules read inside .docx/.pptx but a person decides whether it ships.
const EXPORT_EXT = /\.(csv|tsv|xlsx|xlsm|xls|ods|imscc)$/i;
const EXPORT_NAME = /(catalog|inventory|export|dump|gradebook|roster|snapshot)/i;
const DOC_EXT = /\.(docx|doc|pptx|ppt|odt|odp|pdf)$/i;

function classifyFile(p, readText) {
  const base = path.posix.basename(p);
  if (/(^|\.)appsscript\.json$/i.test(base)) return { rule: 'apps-script-manifest', bucket: 'probably-fine' };
  if (EXPORT_EXT.test(base)) return { rule: 'export-file', bucket: 'export' };
  if (/\.(json|csv|txt)$/i.test(base) && EXPORT_NAME.test(base)) return { rule: 'export-named', bucket: 'export' };
  if (/\.json$/i.test(base)) {
    const t = readText();
    if (t && (t.match(/"mimeType"\s*:/g) || []).length >= 3) return { rule: 'drive-listing-json', bucket: 'export' };
  }
  if (DOC_EXT.test(base)) return { rule: 'office-document', bucket: 'review' };
  return null;
}

// ---- LICENSE per published unit ------------------------------------------------
const UNITS = ['.', 'cas-ccps', 'leader-hub', 'kos-personal'];
function licenseFindings(tracked) {
  const set = new Set(tracked);
  return UNITS.map((u) => {
    const has = [...set].some((f) => {
      const dir = path.posix.dirname(f);
      return (dir === u || (u === '.' && dir === '.')) && /^(LICEN[CS]E|COPYING)(\.\w+)?$/i.test(path.posix.basename(f));
    });
    return { unit: u === '.' ? '(root)' : u, has };
  });
}

// ---- running it ----------------------------------------------------------------
const git = (args, opts = {}) => execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 1 << 30 }, opts));

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function scanBuffer(buf, label, out) {
  if (sds.ZIP_EXT.test(label)) return scanZip(buf, label, out, 0);
  if (isBinary(buf)) return out;
  return scanText(buf.toString('utf8'), label, out);
}

function scanZip(buf, label, out, depth) {
  let entries;
  try {
    entries = sds.zipEntries(buf);
  } catch (e) {
    out.push({ where: label, rule: 'unreadable-container', bucket: 'review', shown: '' });
    return out;
  }
  entries.forEach((e) => {
    if (e.name.endsWith('/')) return;
    const isText = sds.MEMBER_TEXT_EXT.test(e.name) || sds.TEXT_EXT.test(e.name);
    const isZip = !isText && sds.ZIP_EXT.test(e.name) && depth < 3;
    if (!isText && !isZip) return;
    let data;
    try {
      data = sds.zipRead(buf, e, sds.MEMBER_CAP);
    } catch (err) {
      out.push({ where: label + '!' + e.name, rule: 'unreadable-container', bucket: 'review', shown: '' });
      return;
    }
    if (data === null) return;
    if (isZip) scanZip(data, label + '!' + e.name, out, depth + 1);
    else scanText(data.toString('utf8'), label + '!' + e.name, out);
  });
  return out;
}

function trackedFiles() {
  return git(['ls-files', '-z']).toString().split('\0').filter(Boolean);
}

function stagedFiles() {
  return git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']).toString().split('\0').filter(Boolean);
}

// Where a finding's path belongs, for the per-folder counts.
function topFolder(where) {
  const p = where.split(/[:!@]/)[0];
  const i = p.indexOf('/');
  return i === -1 ? '(root)' : p.slice(0, i);
}

// The tool's own files and tests hold the patterns (as regexes), never a value.
const SELF = /^(tools\/release-check\/|tests\/tools\/release-check)/;

function scanFiles(files, read) {
  const findings = [];
  files.forEach((f) => {
    if (SELF.test(f)) return;
    let buf = null;
    const get = () => {
      if (buf === null) { try { buf = read(f); } catch (e) { buf = Buffer.alloc(0); } }
      return buf;
    };
    const c = classifyFile(f, () => (isBinary(get()) ? '' : get().toString('utf8')));
    if (c) findings.push(Object.assign({ where: f, shown: '' }, c));
    const b = get();
    if (b.length) scanBuffer(b, f, findings);
  });
  return findings;
}

// History: added lines in every commit's patch, counts only.
function scanHistory() {
  let log;
  try {
    log = git(['log', '--all', '-p', '--no-color', '--unified=0', '--format=@@commit %H'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    return null;
  }
  const counts = {};
  const commits = {};
  let commit = '';
  let file = '';
  log.split('\n').forEach((line) => {
    if (line.startsWith('@@commit ')) { commit = line.slice(9); return; }
    if (line.startsWith('+++ ')) { file = line.slice(6); return; }
    if (!line.startsWith('+') || SELF.test(file)) return;
    scanLine(line.slice(1)).forEach((f) => {
      counts[f.rule] = (counts[f.rule] || 0) + 1;
      (commits[f.rule] = commits[f.rule] || new Set()).add(commit);
    });
  });
  const total = Number(git(['rev-list', '--all', '--count']).toString().trim());
  return {
    total,
    rules: Object.keys(counts).sort().map((r) => ({ rule: r, lines: counts[r], commits: commits[r].size })),
  };
}

const FAILING = new Set(['drive', 'script', 'export', 'secret', 'student-data', 'license']);
const BUCKET_ORDER = ['drive', 'script', 'export', 'license', 'secret', 'student-data', 'review', 'probably-fine'];
const BUCKET_TITLE = {
  drive: 'Drive IDs and Docs links',
  script: 'Apps Script web-app URLs and script/deployment IDs (reported separately; the operator decides)',
  export: 'Tracked exports and data files',
  license: 'LICENSE per published unit',
  secret: 'Secrets',
  'student-data': 'Student-data patterns (student-data-scan)',
  review: 'For review (not failing): Office documents and PDFs, unreadable containers',
  'probably-fine': 'Probably fine (not failing): Apps Script manifests',
};

function summarize(findings) {
  const byRule = {};
  const byFolder = {};
  findings.forEach((f) => {
    byRule[f.bucket + '/' + f.rule] = (byRule[f.bucket + '/' + f.rule] || 0) + 1;
    const k = topFolder(f.where);
    byFolder[k] = byFolder[k] || {};
    byFolder[k][f.bucket] = (byFolder[k][f.bucket] || 0) + 1;
  });
  return { byRule, byFolder };
}

function gateOn(argv, env) {
  return argv.includes('--gate') || /^(1|on|true)$/i.test(String(env.RELEASE_CHECK_GATE || ''));
}

function run({ argv = [], env = process.env, files, read, log = console.log } = {}) {
  const staged = argv.includes('--staged');
  const tracked = files || (staged ? stagedFiles() : trackedFiles());
  const reader = read || (staged
    ? (f) => git(['show', ':' + f], { stdio: ['ignore', 'pipe', 'ignore'] })
    : (f) => fs.readFileSync(path.join(ROOT, f)));
  const findings = scanFiles(tracked, reader);
  if (!staged) {
    licenseFindings(files || tracked).forEach((l) => {
      if (!l.has) findings.push({ where: l.unit === '(root)' ? 'LICENSE' : l.unit + '/LICENSE', rule: 'license-missing', bucket: 'license', shown: '' });
    });
  }
  const failing = findings.filter((f) => FAILING.has(f.bucket));
  BUCKET_ORDER.forEach((b) => findings.filter((f) => f.bucket === b)
    .forEach((f) => log(f.where + '  ' + f.rule + (f.shown ? '  ' + f.shown : ''))));
  const { byRule } = summarize(findings);
  const gate = gateOn(argv, env);
  log('release-check (' + (staged ? 'staged' : 'tracked tree') + ', ' + (gate ? 'GATE ON' : 'warn-only') + ') — ' +
    failing.length + ' failing finding(s), ' + (findings.length - failing.length) + ' for review: ' +
    (Object.entries(byRule).map(([k, v]) => k + ' ' + v).join(', ') || 'none'));
  let history = null;
  if (argv.includes('--history')) {
    history = scanHistory();
    if (history) log('history (' + history.total + ' commits, added lines): ' +
      (history.rules.map((r) => r.rule + ' ' + r.lines + ' in ' + r.commits + ' commits').join(', ') || 'none'));
    else log('history: not available');
  }
  const ri = argv.indexOf('--report');
  if (ri !== -1 && argv[ri + 1]) {
    fs.writeFileSync(path.resolve(argv[ri + 1]), renderReport(findings, history, licenseFindings(files || tracked)));
  }
  if (!gate && failing.length) log('Warn-only: exit 0. Turn the gate on with --gate or RELEASE_CHECK_GATE=1 (tools/release-check/README.md).');
  return { code: gate && failing.length ? 1 : 0, findings, history };
}

function renderReport(findings, history, licenses) {
  const { byRule, byFolder } = summarize(findings);
  const L = [];
  L.push('## Counts per rule', '', '| Bucket | Rule | Findings |', '|---|---|---|');
  Object.keys(byRule).sort((a, b) => BUCKET_ORDER.indexOf(a.split('/')[0]) - BUCKET_ORDER.indexOf(b.split('/')[0]) || (a < b ? -1 : 1))
    .forEach((k) => L.push('| ' + k.split('/')[0] + ' | `' + k.split('/')[1] + '` | ' + byRule[k] + ' |'));
  L.push('', '## Counts per top-level folder', '', '| Folder | ' + BUCKET_ORDER.join(' | ') + ' |', '|---|' + BUCKET_ORDER.map(() => '---').join('|') + '|');
  Object.keys(byFolder).sort().forEach((k) => L.push('| ' + k + ' | ' + BUCKET_ORDER.map((b) => byFolder[k][b] || 0).join(' | ') + ' |'));
  L.push('', '## LICENSE per published unit', '', '| Unit | LICENSE |', '|---|---|');
  licenses.forEach((l) => L.push('| ' + l.unit + ' | ' + (l.has ? 'present' : '**missing**') + ' |'));
  L.push('| Mothership | another repo: not checked here |');
  if (history) {
    L.push('', '## Git history (counts only)', '', history.total + ' commits on all refs; lines added in their patches. No paths or values.', '',
      '| Rule | Added lines | Commits |', '|---|---|---|');
    history.rules.forEach((r) => L.push('| `' + r.rule + '` | ' + r.lines + ' | ' + r.commits + ' |'));
  }
  L.push('', '## Findings by bucket', '', 'Each line is `path:line rule redacted-form`. A value is never printed, only its length.');
  BUCKET_ORDER.forEach((b) => {
    const fs_ = findings.filter((f) => f.bucket === b);
    if (!fs_.length) return;
    L.push('', '### ' + BUCKET_TITLE[b] + ' (' + fs_.length + ')', '', '```');
    fs_.forEach((f) => L.push(f.where + '  ' + f.rule + (f.shown ? '  ' + f.shown : '')));
    L.push('```');
  });
  return L.join('\n') + '\n';
}

if (require.main === module) process.exitCode = run({ argv: process.argv.slice(2) }).code;
module.exports = { scanLine, scanText, classifyFile, licenseFindings, run, gateOn, renderReport, topFolder, CONTENT_RULES };
