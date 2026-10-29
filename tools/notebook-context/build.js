#!/usr/bin/env node
'use strict';
// notebook-context — writes the "KOS Context" Gemini notebook: why KOS
// exists, each system's North Star, the value proposition and how the
// systems measure up to it, how they are built, and where the work is
// going. A companion to tools/notebook-codebase/ (the code itself).
// Output: meta/notebook-context/KOS_CONTEXT_*.md.
//
//   node tools/notebook-context/build.js           write the sources
//   node tools/notebook-context/build.js --check   exit 1 if any differs from disk
//
// Unlike the codebase notebook, this one is chosen by hand: SOURCES below
// names every file, and a missing one stops the build. The first source
// is meta/notebook-context/GUIDE.md, written for the notebook (what KOS
// is, the North Stars, the value proposition by audience, which sources
// are dated); edit it there, never in the output. The rest are copies,
// one section per file headed by its path, the same shape as the codebase
// notebook (its htmlToText and demote), so an answer says which document
// it came from. The output is not committed (.gitignore), like the
// codebase notebook's.

const fs = require('fs');
const path = require('path');
const { demote, htmlToText } = require('../notebook-codebase/build.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'meta', 'notebook-context');
const GUIDE = 'meta/notebook-context/GUIDE.md';
const GUIDE_NAME = 'KOS_CONTEXT_00_GUIDE';
const WORD_TARGET = 200000;

const SOURCES = [
  { name: 'KOS_CONTEXT_NORTH_STAR', title: 'What each system is for, in its own words', files: [
    'kos-personal/KOS_WHITE_PAPER.md',
    'cas-ccps/docs/PLATFORM_DOCUMENTATION.html',
    'cas-ccps/docs/CAS_ContextualGates_DesignPrinciples.html',
    'leader-hub/LEADERHUB_PRINCIPLES.md',
  ] },
  { name: 'KOS_CONTEXT_FOUNDATIONS', title: 'The Economics of Depth: the thesis under the whole project, and its assumptions audit', files: [
    'drive-curation/Economics_of_Depth_White_Paper.md',
    'drive-curation/Assumptions_Deep_Dive_v2.md',
  ] },
  { name: 'KOS_CONTEXT_VALUE', title: 'Value proposition, the case for change, and how the systems measure up', files: [
    'meta/CODEBASE_REVIEW.md',
    'cas-ccps/docs/IMPACT_DASHBOARD.html',
    'meta/PRD_CAS_RESEARCH_PIVOT.md',
    'meta/PRODUCT_EXPERIENCE_GAP_AUDIT.md',
    'meta/UX_AUDIT_2026-10-22.md',
  ] },
  { name: 'KOS_CONTEXT_SYSTEMS', title: 'How the three systems are built and fit together', files: [
    'README.md',
    'kos-personal/README.md',
    'cas-ccps/README.md',
    'cas-ccps/docs/SYSTEM_ARCHITECTURE.html',
    'leader-hub/README.md',
    'meta/FLOW_DOCTRINE.md',
  ] },
  { name: 'KOS_CONTEXT_DIRECTION', title: 'Where the work stands and where it is going', files: [
    'meta/PLAN_2026-11.md',
    'meta/PLAN_2026-10.md',
    'meta/HANDOFF_2026-10-29.md',
    'meta/BACKLOG.md',
    'meta/CAS_DESIGN_THREADS_2026-10-16.md',
    'meta/CAS_COGNITIVE_EXHAUST_2026-10-16.md',
    'meta/COURSE_BUILDER_PLAN_2026-10.md',
    'meta/LESSON_AUTHORING_PLAN_2026-10.md',
  ] },
];

const words = (s) => (s.match(/\S+/g) || []).length;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n').trim();

function build() {
  const missing = SOURCES.flatMap((s) => s.files).concat(GUIDE).filter((p) => !fs.existsSync(path.join(ROOT, p)));
  if (missing.length) throw new Error('notebook-context: missing ' + missing.join(', ') + ' (update SOURCES)');
  const outputs = {};
  const summary = [];
  outputs[GUIDE_NAME + '.md'] = read(GUIDE) + '\n';
  summary.push({ name: GUIDE_NAME, files: [GUIDE], words: words(outputs[GUIDE_NAME + '.md']) });
  for (const s of SOURCES) {
    const parts = s.files.map((p) => {
      const body = demote(p.endsWith('.html') ? htmlToText(read(p)) : read(p));
      return '## ' + s.name + ' · ' + p + '\n\nFile: `' + p + '`\n\n' + body + '\n';
    });
    // "point-in-time" is one of doc-currency's superseded markers: the copies
    // are checked once, where they live, not again here (the guide's copy
    // carries no marker, so it is checked).
    const text = '# ' + s.name + ' — ' + s.title + '\n\nNotebook source: ' + s.name + '.\n\n' +
      'A point-in-time copy, made by `tools/notebook-context/build.js`, of ' + s.files.length + ' repo file(s), ' +
      'each its own section headed by its path. Read `' + GUIDE_NAME + '` first: it says which of these are ' +
      'current and which are dated. Do not edit; regenerate.\n\n' + parts.join('\n');
    outputs[s.name + '.md'] = text;
    summary.push({ name: s.name, files: s.files, words: words(text) });
  }
  return { outputs, summary };
}

function main() {
  const check = process.argv.includes('--check');
  const { outputs, summary } = build();
  let stale = 0;
  Object.keys(outputs).sort().forEach((file) => {
    const target = path.join(OUT_DIR, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === outputs[file]) return;
    stale++;
    if (check) console.log('stale: meta/notebook-context/' + file);
    else fs.writeFileSync(target, outputs[file]);
  });
  if (!check) {
    fs.readdirSync(OUT_DIR).filter((f) => /^KOS_CONTEXT_.*\.md$/.test(f) && !outputs[f])
      .forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
  }
  summary.forEach((s) => {
    console.log(s.name.padEnd(26) + String(s.files.length).padStart(3) + ' files ' +
      s.words.toLocaleString('en-US').padStart(8) + ' words' + (s.words > WORD_TARGET ? '  (large: consider splitting)' : ''));
  });
  if (check) {
    console.log(stale ? stale + ' source(s) stale. Run node tools/notebook-context/build.js' : 'All sources current.');
    process.exit(stale ? 1 : 0);
  }
  console.log((stale ? 'Wrote ' + stale : 'No changes to') + ' source(s) in meta/notebook-context/.');
}

module.exports = { build, SOURCES, GUIDE, GUIDE_NAME, WORD_TARGET };

if (require.main === module) main();
