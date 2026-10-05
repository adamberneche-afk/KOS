#!/usr/bin/env node
'use strict';
// notebook-codebase — writes the repo as a set of Markdown sources for a
// Gemini notebook ("KOS Codebase"), so the code and its docs can be asked
// about in plain language. Output: meta/notebook-codebase/*.md.
//
//   node tools/notebook-codebase/build.js           write the sources
//   node tools/notebook-codebase/build.js --check   exit 1 if any is stale
//
// WHY A SCRIPT. cas-ccps/docs/notebooklm-sources/ was converted by hand and
// its README says it goes stale silently; this repo's answer to that is a
// generator (tools/kos-personal/build-notebook-personas.js and others).
// The output is committed so it arrives in the zip of main the operator
// downloads, but it is NOT held to staleness by npm test: it would make
// every code change fail CI until regenerated. Each source carries a
// content fingerprint instead, and the INDEX lists them, so a notebook copy
// can be compared with the repo, and --check says which are stale.
//
// HOW THE SOURCES ARE CUT. A notebook retrieves passages, not whole files,
// so every file is its own section whose heading names the source and the
// path ("## KOS_CODE_CAS_CCPS_SOURCE · cas-ccps/scripts/07_TeacherDashboard.js").
// A retrieved passage then always says where it came from. Each source also
// carries "Notebook source: {NAME}." near the top: retrieval matches text,
// not titles (rtp-core-router/notebook-plan/05_TEST_LOG.md), so a search
// for the source name finds it. Sources stay far below the 500,000-word
// per-source cap; answers get vaguer as a source grows.
//
// WHAT IS LEFT OUT, and why, is listed in the INDEX: generated builds (the
// built leader-hub page, clasp build folders), archives, data files
// (JSON/CSV, Office files, cartridges), lockfiles and the persona docs,
// which already live in the RTP notebook. No student data is in the repo by
// design (cas-ccps/docs/FERPA_DATA_MAP.md); rosters stay in Drive.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'meta', 'notebook-codebase');
const WORD_CAP = 500000;       // Gemini notebook per-source cap
const WORD_TARGET = 200000;    // above this, warn: split the source

const ALWAYS_EXCLUDE = [
  /(^|\/)(archive|archived)\//,
  /(^|\/)node_modules\//,
  /package-lock\.json$/,
  /^leader-hub\/student-leader-hub\.html$/,   // built from leader-hub/src/
  /^cas-ccps\/\.clasp-build\//,
  /^meta\/notebook-codebase\//,                // this tool's own output
  /^kos-personal\/rtp-core-router\/PERSONA_.*\.md$/,                 // in the RTP notebook
  /^kos-personal\/rtp-core-router\/notebook-sources\/PERSONA_.*\.md$/,
  /^kos-personal\/rtp-core-router\/notebook-sources\/cores\//,
  // Four cas-ccps guides have hand-made Markdown versions in
  // docs/notebooklm-sources/; their HTML would be a duplicate.
  /^cas-ccps\/docs\/(12_TeacherQuickStartGuide|TEACHER_REFERENCE_GUIDE|STUDENT_QUICK_START|USER_EXPERIENCE_REFERENCE)\.html$/,
];
const TEXT_EXT = /\.(gs|js|mjs|html|md|py|sql|yml|yaml|ps1|sh)$/;

// HTML under a docs/ folder is a written guide, not page source: it is
// converted to plain text and filed with the docs.
const htmlDoc = (p) => /(^|\/)docs\/[^/]+\.html$/.test(p);
const md = (p) => /\.md$/.test(p) || htmlDoc(p);
const code = (p) => !md(p);
// cas-ccps/scripts is too large for one source: split by file number.
const casNum = (p) => { const m = /^cas-ccps\/scripts\/(\d+)/.exec(p); return m ? parseInt(m[1], 10) : -1; };
const history = (p) => /(^|\/)(CHANGELOG|HISTORY)\.md$/.test(p);

// Order matters only for the INDEX; each file goes to the first source
// whose test it passes.
const SOURCES = [
  { name: 'KOS_CODE_HISTORY', title: 'Change history (may describe superseded behavior)',
    test: (p) => history(p) },
  { name: 'KOS_CODE_KOS_PERSONAL_SOURCE', title: 'kos-personal: Apps Script source and the inference service',
    test: (p) => p.startsWith('kos-personal/') && code(p) },
  { name: 'KOS_CODE_KOS_PERSONAL_DOCS', title: 'kos-personal: docs, prompts, the RTP router and notebook plan',
    test: (p) => p.startsWith('kos-personal/') && md(p) },
  { name: 'KOS_CODE_CAS_CCPS_SOURCE_A', title: 'cas-ccps: Apps Script source, scripts 00 to 29',
    test: (p) => p.startsWith('cas-ccps/scripts/') && code(p) && casNum(p) < 30 },
  { name: 'KOS_CODE_CAS_CCPS_SOURCE_B', title: 'cas-ccps: Apps Script source, scripts 30 and up, Studio steps, forms and templates',
    test: (p) => p.startsWith('cas-ccps/') && code(p) },
  { name: 'KOS_CODE_CAS_CCPS_CURRICULUM', title: 'cas-ccps: unit rubrics and lesson cards',
    test: (p) => /^cas-ccps\/curriculum\/(unit-rubrics|lesson-cards)\//.test(p) && md(p) },
  { name: 'KOS_CODE_CAS_CCPS_DOCS', title: 'cas-ccps: docs and guides',
    test: (p) => p.startsWith('cas-ccps/') && md(p) },
  { name: 'KOS_CODE_LEADER_HUB_SOURCE', title: 'leader-hub: Apps Script and page source',
    test: (p) => p.startsWith('leader-hub/') && code(p) },
  { name: 'KOS_CODE_LEADER_HUB_DOCS', title: 'leader-hub: docs',
    test: (p) => p.startsWith('leader-hub/') && md(p) },
  { name: 'KOS_CODE_TOOLS', title: 'Repo tools, CI workflows and scripts',
    test: (p) => /^(tools|scripts|shared|\.github)\//.test(p) || /^[^/]+$/.test(p) && code(p) },
  { name: 'KOS_CODE_TESTS', title: 'Tests and the GAS sandbox harness',
    test: (p) => p.startsWith('tests/') },
  { name: 'KOS_CODE_META', title: 'Repo-wide docs: handoffs, process, Drive curation',
    test: (p) => /^(meta|drive-curation)\//.test(p) || /^[^/]+\.md$/.test(p) },
];

function listFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((p) => TEXT_EXT.test(p))
    .filter((p) => !ALWAYS_EXCLUDE.some((re) => re.test(p)))
    .sort();
}

function lang(p) {
  const ext = path.extname(p).slice(1);
  return { gs: 'javascript', js: 'javascript', mjs: 'javascript', yml: 'yaml', ps1: 'powershell' }[ext] || ext;
}

// A fence longer than any backtick run inside the file.
function fence(text) {
  const runs = text.match(/`{3,}/g) || [];
  return '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)));
}

// Markdown files are embedded as Markdown, with their headings pushed two
// levels down so they sit under the file's own "##" section. Lines inside
// fenced code blocks are left alone.
function demote(text) {
  let open = null;
  return text.split('\n').map((line) => {
    const f = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!open) open = f[2];
      else if (f[2][0] === open[0] && f[2].length >= open.length) open = null;
      return line;
    }
    if (!open && /^#{1,4} /.test(line)) return '##' + line;
    return line;
  }).join('\n');
}

// Repeats a replacement until the text stops changing, so a removal can't
// leave behind a fragment that forms a new match (e.g. "<scr<script>ipt>").
function untilStable(text, re, rep) {
  let prev;
  do { prev = text; text = text.replace(re, rep); } while (text !== prev);
  return text;
}

// Just enough HTML-to-Markdown for the styled guides: drop styles and
// scripts, keep headings, list items, table cells and paragraph breaks.
// Every tag is removed (repeatedly, until none is left), and so is any
// stray "<" after that: in well-formed HTML a literal "<" in text is
// written "&lt;", which the entity step below turns back into "<".
function htmlToText(html) {
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', rarr: '→', larr: '←', hellip: '…', middot: '·' };
  let text = untilStable(html, /<(style|script|head|svg)\b[\s\S]*?<\/\1\s*>/gi, '');
  text = untilStable(text, /<!--[\s\S]*?-->/g, '');
  text = text
    .replace(/<h([1-4])[^>]*>/gi, (m, n) => '\n\n' + '#'.repeat(Number(n)) + ' ')
    .replace(/<\/h[1-4]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/ul|\/ol|\/table|\/section|\/pre|\/blockquote)[^>]*>/gi, '\n');
  text = untilStable(text, /<[^>]*>/g, '').replace(/</g, '');
  return text
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#'
      ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : (ent[e.toLowerCase()] !== undefined ? ent[e.toLowerCase()] : m))
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const words = (s) => (s.match(/\S+/g) || []).length;

function build() {
  const files = listFiles();
  const groups = SOURCES.map((s) => ({ ...s, files: [] }));
  const unassigned = [];
  files.forEach((p) => {
    const g = groups.find((s) => s.test(p));
    if (g) g.files.push(p); else unassigned.push(p);
  });

  const outputs = {};
  const summary = [];
  groups.forEach((g) => {
    const hash = crypto.createHash('sha256');
    const parts = [];
    g.files.forEach((p) => {
      const text = fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '');
      hash.update(p + '\0' + text + '\0');
      const body = htmlDoc(p) ? demote(htmlToText(text)) : md(p) ? demote(text) : (() => { const f = fence(text); return f + lang(p) + '\n' + text + '\n' + f; })();
      parts.push('## ' + g.name + ' · ' + p + '\n\nFile: `' + p + '`\n\n' + body + '\n');
    });
    const fingerprint = hash.digest('hex').slice(0, 12);
    const head = '# ' + g.name + ' — ' + g.title + '\n\n' +
      'Notebook source: ' + g.name + '.\n\n' +
      'Generated by `tools/notebook-codebase/build.js` from ' + g.files.length + ' repo file(s). ' +
      'Content fingerprint: `' + fingerprint + '`. Do not edit; regenerate.\n' +
      (g.name === 'KOS_CODE_HISTORY'
        ? '\nThese are change logs: they record what was true when each entry was written. ' +
          'Where they disagree with the current source or docs, the current files win.\n'
        : '') + '\n';
    const text = head + parts.join('\n');
    outputs[g.name + '.md'] = text;
    summary.push({ name: g.name, title: g.title, files: g.files, words: words(text), fingerprint });
  });

  outputs['KOS_CODE_00_INDEX.md'] = indexDoc(summary, unassigned);
  return { outputs, summary, unassigned };
}

function indexDoc(summary, unassigned) {
  const rows = summary.map((s) =>
    '| `' + s.name + '` | ' + s.title + ' | ' + s.files.length + ' | ' + s.words.toLocaleString('en-US') + ' | `' + s.fingerprint + '` |');
  const lists = summary.map((s) =>
    '## KOS_CODE_00_INDEX · ' + s.name + '\n\n' + s.files.map((p) => '- `' + p + '`').join('\n') + '\n');
  return '# KOS_CODE_00_INDEX — the KOS repo as notebook sources\n\n' +
    'Notebook source: KOS_CODE_00_INDEX.\n\n' +
    'This notebook holds the KOS repository (github.com/adamberneche-afk/KOS): three Google Apps Script ' +
    'systems on one school account, kos-personal (the Knowledge Operating System), cas-ccps (the CAS ' +
    'course system) and leader-hub (LeaderHub), plus the tools and tests that check them. ' +
    'Each source below is one slice of the repo. Every section heading names its source and the file path, ' +
    'so a cited passage says which file it came from. The repo on GitHub is the source of truth: these are ' +
    'generated copies, and the fingerprints below show whether a notebook copy matches the repo.\n\n' +
    '## KOS_CODE_00_INDEX · Sources\n\n' +
    '| Source | Covers | Files | Words | Fingerprint |\n|---|---|---|---|---|\n' + rows.join('\n') + '\n\n' +
    '## KOS_CODE_00_INDEX · Left out\n\n' +
    '- Archived and superseded files (`archive/`, `archived/`).\n' +
    '- Generated builds: `leader-hub/student-leader-hub.html` (built from `leader-hub/src/`), `cas-ccps/.clasp-build/`.\n' +
    '- Data and binary files: JSON, CSV, Office documents, Canvas cartridges, lockfiles.\n' +
    '- The persona docs (`PERSONA_*_V5_1.md` and their notebook editions), which are sources in the RTP notebook.\n' +
    '- No student data: the repo holds none by design (`cas-ccps/docs/FERPA_DATA_MAP.md`).\n' +
    (unassigned.length ? '- Unassigned (no source matched): ' + unassigned.map((p) => '`' + p + '`').join(', ') + '\n' : '') +
    '\n' + lists.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const { outputs, summary } = build();
  let stale = 0;
  if (!check) fs.mkdirSync(OUT_DIR, { recursive: true });
  Object.keys(outputs).sort().forEach((file) => {
    const target = path.join(OUT_DIR, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === outputs[file]) return;
    stale++;
    if (check) console.log('stale: meta/notebook-codebase/' + file);
    else fs.writeFileSync(target, outputs[file]);
  });
  if (!check) {
    const wanted = new Set(Object.keys(outputs));
    fs.readdirSync(OUT_DIR).filter((f) => /^KOS_CODE_.*\.md$/.test(f) && !wanted.has(f))
      .forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
  }
  summary.forEach((s) => {
    const flag = s.words > WORD_CAP ? '  OVER THE 500,000-WORD CAP' : s.words > WORD_TARGET ? '  (large: consider splitting)' : '';
    console.log(s.name.padEnd(30) + String(s.files.length).padStart(4) + ' files ' +
      s.words.toLocaleString('en-US').padStart(9) + ' words' + flag);
  });
  if (check) {
    console.log(stale ? stale + ' source(s) stale. Run node tools/notebook-codebase/build.js' : 'All sources current.');
    process.exit(stale ? 1 : 0);
  }
  console.log((stale ? 'Wrote ' + stale : 'No changes to') + ' source(s) in meta/notebook-codebase/.');
}

module.exports = { build, demote, fence, htmlToText, SOURCES, WORD_CAP };
if (require.main === module) main();
