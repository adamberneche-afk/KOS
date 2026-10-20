'use strict';
// tools/cas-ccps/build-lesson-assignments.js: the teacher's lesson docs
// (cas-ccps/curriculum/lessons/) as assignments. Pins: the committed data file
// and review list match the generator; an 8175 prompt is the lesson's own
// Canvas assignment text and its warm-up the bell ringer; an 8177 lesson is
// used only with a teacher-approved prompt; a competency number whose state
// wording doesn't match the doc's carries no ID.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const gen = require('../../tools/cas-ccps/build-lesson-assignments.js');

const ROOT = path.join(__dirname, '..', '..');
const built = gen.build();

test('the committed 55b data file and COMPETENCY_REVIEW.md match the generator', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, 'cas-ccps/scripts/55b_LessonAssignmentData.js'), 'utf8'),
    gen.dataFile(built), 'run: node tools/cas-ccps/build-lesson-assignments.js');
  assert.equal(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/lessons/COMPETENCY_REVIEW.md'), 'utf8'),
    built.review);
});

test('8175 Lesson 06: the prompt is the lesson\'s Canvas text and the warm-up its bell ringer', () => {
  const a = built.assignments['8175-L06'];
  assert.match(a.promptText, /^Title: Assignment: Skill Development Plan/);
  assert.match(a.promptText, /Write a 100-word plan/);
  assert.doesNotMatch(a.promptText, /Bell Ringer|Grading Tip|\*\*/, 'teacher-only sections and markdown stay out');
  assert.match(a.warmupAnchor, /^What is a 'soft skill'\?/);
  assert.deepEqual(a.milestoneCompetencyIds, ['8175-5', '8175-20', '8175-21', '8175-112']);
  assert.match(a.definitionOfDone, /TEACHER GRADING NOTES/);
});

test('all 36 8175 lessons are in order, and every one has a prompt and a warm-up', () => {
  assert.equal(built.order[8175].length, 36);
  assert.equal(built.order[8175][0], '8175-L01');
  built.order[8175].forEach((k) => {
    const a = built.assignments[k];
    assert.ok(a.promptText.length > 100 && a.warmupAnchor, k);
    assert.equal(a.milestones.length, 4, k);
  });
});

test('8177: only lessons with an approved prompt; Employee Handbook uses the approved one', () => {
  const keys = built.order[8177];
  assert.ok(keys.includes('8177-employee-handbook-operations'));
  keys.forEach((k) => assert.ok(fs.existsSync(path.join(ROOT, 'cas-ccps/curriculum/lessons/8177/prompts',
    k.replace(/^8177-/, '') + '.md')), k + ' has no approved prompt'));
  const a = built.assignments['8177-employee-handbook-operations'];
  assert.match(a.promptText, /^Assignment: The Cavalier Shop Operations Brief/);
  assert.match(a.warmupAnchor, /Starbucks in Richmond/);
});

test('8177: Background, Key Terms and Example come before the task, under plain headings', () => {
  const t = built.assignments['8177-employee-handbook-operations'].promptText;
  const at = (h) => t.indexOf('\n\n' + h + ':\n\n');
  assert.ok(at('Background') > 0 && at('Background') < at('Key Terms') && at('Key Terms') < at('Example') &&
    at('Example') < at('Your Task'), 'title, Background, Key Terms, Example, Your Task');
  assert.match(t, /Step 1, Safety: unlock the doors/, 'the handbook students never had is in the prompt');
  assert.match(t.slice(at('Your Task')), /Part 1: The Team/);
  assert.equal(gen.studentPrompt('## Prompt\n\nAssignment: X\n\nDo it.\n'), 'Assignment: X\n\nDo it.',
    'a prompt file with no support sections is used as written');
});

test('8177: a draft prompt file is not used', () => {
  assert.equal(built.order[8177].length, 31, 'every 8177 prompt is approved');
  const file = path.join(ROOT, 'cas-ccps/curriculum/lessons/8177/prompts/product-pitch-financial-analysis.md');
  const read = fs.readFileSync;
  fs.readFileSync = function (f, ...rest) {
    const s = read.call(fs, f, ...rest);
    return path.resolve(String(f)) === file ? String(s).replace(/status:\s*approved/, 'status: draft') : s;
  };
  try {
    assert.ok(!gen.build().order[8177].includes('8177-product-pitch-financial-analysis'));
  } finally {
    fs.readFileSync = read;
    gen.build();
  }
});

test('a competency number whose state wording differs keeps the doc\'s words and no ID', () => {
  const file = path.join(ROOT, 'cas-ccps/curriculum/lessons/8175/L16.md');
  const read = fs.readFileSync;
  fs.readFileSync = function (f, ...rest) {
    // L16's tiers name 8175-19, which this test removes; tiers aren't under test here.
    if (/COMPETENCY_TIERS\.json$/.test(String(f))) return '{}';
    const s = read.call(fs, f, ...rest);
    return path.resolve(String(f)) === file
      ? String(s).replace(/\*\*019:\*\* [^\n]*/, '**041:** Calculate break-even point.') : s;
  };
  try {
    const b = gen.build();
    const l16 = b.assignments['8175-L16'];
    assert.ok(!l16.competencyIds.includes('8175-41'), '"041: Calculate break-even point" is not 8175-41');
    assert.match(l16.definitionOfDone, /- Calculate break-even point/);
    assert.match(b.review, /\| 8175 \| 41 \| Calculate break-even point/);
  } finally {
    fs.readFileSync = read;
    gen.build();
  }
});

test('8175: lesson competencies cite the 2025 state task list', () => {
  assert.deepEqual(built.assignments['8175-L16'].competencyIds, ['8175-40', '8175-66', '8175-67', '8175-19', '8175-95', '8175-97', '8175-101']);
  assert.match(built.assignments['8175-L16'].definitionOfDone, /- 8175-66 Explain pricing and the factors/);
  assert.doesNotMatch(built.review, /\| 8175 \|/, 'no 8175 number is left to review');
});

test('8177: lesson competencies cite the 2025 state task list', () => {
  const a = built.assignments['8177-employee-handbook-operations'];
  assert.deepEqual(a.competencyIds, ['8177-4', '8177-5', '8177-10', '8177-14', '8177-20', '8177-25', '8177-45', '8177-58', '8177-72', '8177-73', '8177-95']);
  assert.match(a.definitionOfDone, /- 8177-45 Explain facilities management/);
  assert.doesNotMatch(built.review, /\| 8177 \|/, 'no 8177 number is left to review');
});

test('the data file loads as Apps Script', () => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'cas-ccps/scripts/55b_LessonAssignmentData.js'), 'utf8') +
    ';this.A = LESSON_ASSIGNMENTS; this.O = LESSON_ORDER;', c);
  assert.equal(c.O['8175'].length, 36);
});
