'use strict';
// The drafted lesson parts awaiting approval (lessons/PARTS_DRAFTS.json): every
// draft builds with the lesson builder as if it were in PARTS.json, none is
// already approved, and the teacher's review copy is current.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { check, draftsIn, DRAFTS_FILE } = require('../../tools/cas-ccps/check-parts-drafts.js');

const ROOT = path.join(__dirname, '..', '..');
const PARTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/lessons/PARTS.json'), 'utf8'));

test('every drafted lesson builds and passes the draft checks', () => {
  const r = check();
  const bad = r.lessons.filter((l) => l.problems.length).map((l) => l.key + ': ' + l.problems.join('; '));
  assert.deepEqual(bad, []);
  assert.ok(r.lessons.length > 0);
});

test('no draft is a lesson already approved in PARTS.json', () => {
  const both = Object.keys(draftsIn(DRAFTS_FILE)).filter((k) => PARTS[k]);
  assert.deepEqual(both, []);
});

test('each draft carries its status, why and concerns for the teacher', () => {
  Object.entries(draftsIn(DRAFTS_FILE)).forEach(([k, d]) => {
    assert.match(d.status, /^draft \d+, \d{4}-\d{2}-\d{2}$/, k);
    assert.ok(String(d.why).length > 40, k);
    assert.ok(Array.isArray(d.concerns), k);
  });
});

test('the checker names what is wrong with a broken draft', () => {
  const key = '8177-market-research-survey-design';
  const def = JSON.parse(JSON.stringify(PARTS[key]));
  delete def.parts[1].criteria['8177-18'];
  def.parts[0].vocabulary.push('not a lesson term');
  def.parts[2].workFile = 'canva';
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parts-')), 'd.json');
  fs.writeFileSync(file, JSON.stringify({ [key]: def }));
  const problems = check(file).lessons[0].problems;
  assert.ok(problems.includes('part 2: no criterion for 8177-18'), problems.join('\n'));
  assert.ok(problems.some((p) => /part 1: vocabulary "not a lesson term"/.test(p)));
  assert.ok(problems.some((p) => /part 3: work file "canva"/.test(p)));
  def.parts.pop();
  fs.writeFileSync(file, JSON.stringify({ [key]: def }));
  assert.match(check(file).lessons[0].problems.join('\n'), /the builder refused it: .*no part covers 8177-79/);
});

test('the review copy (meta/LESSON_PARTS_DRAFTS_2026-10.md) matches the drafts', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/cas-ccps/render-parts-drafts.js'), '--check'], { cwd: ROOT });
});
