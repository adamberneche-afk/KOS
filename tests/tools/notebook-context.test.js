'use strict';
// tools/notebook-context/build.js writes the "KOS Context" notebook
// (meta/notebook-context/). These checks run it in memory against the real
// repo: every source names itself and attributes every section to its
// file, every listed file exists, and the hand-written guide stays in step
// with the list (it names every source, and every repo path it cites is
// real), so a renamed or retired doc fails here instead of going stale in
// the notebook.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, SOURCES, GUIDE, GUIDE_NAME } = require('../../tools/notebook-context/build.js');

const ROOT = path.join(__dirname, '..', '..');
const result = build();

test('every source names itself, and every section heading names its source and file', () => {
  const names = Object.keys(result.outputs).map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual(names.sort(), [GUIDE_NAME].concat(SOURCES.map((s) => s.name)).sort());
  for (const s of SOURCES) {
    const text = result.outputs[s.name + '.md'];
    assert.ok(text.includes('Notebook source: ' + s.name + '.'), s.name);
    const headings = text.split('\n').filter((l) => /^## /.test(l));
    assert.deepEqual(headings, s.files.map((p) => '## ' + s.name + ' · ' + p), s.name + ': one section per file, in order');
  }
});

test('the guide is GUIDE.md, carries its source line, and names every source', () => {
  const guide = result.outputs[GUIDE_NAME + '.md'];
  assert.equal(guide, fs.readFileSync(path.join(ROOT, GUIDE), 'utf8').replace(/\r\n/g, '\n').trim() + '\n');
  assert.ok(guide.includes('Notebook source: ' + GUIDE_NAME + '.'));
  for (const s of SOURCES) assert.ok(guide.includes('`' + s.name + '`'), 'the guide should describe ' + s.name);
});

test('every repo path the guide cites exists', () => {
  const guide = fs.readFileSync(path.join(ROOT, GUIDE), 'utf8');
  const cited = [...new Set((guide.match(/`((?:meta|cas-ccps|kos-personal|leader-hub|drive-curation|tools)\/[^`\s]+\.(?:md|html|js))`/g) || [])
    .map((m) => m.slice(1, -1)))];
  assert.ok(cited.length > 10, 'the guide cites its sources by path');
  for (const p of cited) assert.ok(fs.existsSync(path.join(ROOT, p)), 'GUIDE.md cites ' + p + ', which does not exist');
});

test('HTML sources are converted to text', () => {
  // Only the sections copied from .html files: the Markdown docs mention
  // <script> in prose.
  for (const s of SOURCES) {
    const sections = result.outputs[s.name + '.md'].split(/\n(?=## )/)
      .filter((sec) => /^## \S+ · \S+\.html$/m.test(sec.split('\n')[0]));
    for (const sec of sections) {
      const head = sec.split('\n')[0];
      assert.doesNotMatch(sec, /<\/?(div|span|section|script|style)\b/i, head);
      assert.doesNotMatch(sec, /&(rsquo|ldquo|rdquo|nbsp|amp);/, head);
    }
    if (s.files.some((p) => p.endsWith('.html'))) assert.ok(sections.length, s.name + ' has its HTML sections');
  }
});

test('the build is deterministic', () => {
  assert.deepEqual(build().outputs, result.outputs);
});
