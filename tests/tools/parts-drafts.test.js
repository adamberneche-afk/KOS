'use strict';
// Lessons in parts: every approved lesson (lessons/PARTS.json) and any draft
// awaiting approval (lessons/PARTS_DRAFTS.json) passes the draft checks with
// the lesson builder, no draft is already approved, and the teacher's copy
// (meta/LESSON_PARTS_2026-10.md) is current.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { check, draftsIn, DRAFTS_FILE } = require('../../tools/cas-ccps/check-parts-drafts.js');

const ROOT = path.join(__dirname, '..', '..');
const PARTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/lessons/PARTS.json'), 'utf8'));

const PARTS_FILE = path.join(ROOT, 'cas-ccps/curriculum/lessons/PARTS.json');
const failing = (r) => r.lessons.filter((l) => l.problems.length).map((l) => l.key + ': ' + l.problems.join('; '));

test('every approved lesson in parts passes the draft checks (one part per marker, a criterion per tier, ...)', () => {
  const r = check(PARTS_FILE);
  assert.deepEqual(failing(r), []);
  assert.equal(r.lessons.length, 35);
});

test('every draft awaiting approval builds and passes the draft checks', () => {
  assert.deepEqual(failing(check()), []);
});

test('no draft is a lesson already approved in PARTS.json', () => {
  const both = Object.keys(draftsIn(DRAFTS_FILE)).filter((k) => PARTS[k]);
  assert.deepEqual(both, []);
});

test('each draft carries its status, why and concerns; each approved lesson its approval', () => {
  Object.entries(draftsIn(DRAFTS_FILE)).forEach(([k, d]) => {
    assert.match(d.status, /^draft \d+, \d{4}-\d{2}-\d{2}$/, k);
    assert.ok(String(d.why).length > 40, k);
    assert.ok(Array.isArray(d.concerns), k);
  });
  Object.entries(draftsIn(PARTS_FILE)).forEach(([k, d]) => assert.match(String(d.approved), /^\d{4}-\d{2}-\d{2}/, k));
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

test('the teacher\'s copy (meta/LESSON_PARTS_2026-10.md) matches PARTS.json and the drafts', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'tools/cas-ccps/render-parts-drafts.js'), '--check'], { cwd: ROOT });
});
