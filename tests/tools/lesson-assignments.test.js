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

test('a competency number whose state wording differs keeps the doc\'s words and no ID', () => {
  const a = built.assignments['8177-employee-handbook-operations'];
  assert.ok(!a.competencyIds.includes('8177-85'), '8177-85 is "Identify the components of a budget", not venue management');
  assert.match(a.definitionOfDone, /- Explain the components of venue management/);
  assert.match(built.review, /\| 8177 \| 85 \| Explain the components of venue management/);
  const l16 = built.assignments['8175-L16'];
  assert.ok(!l16.competencyIds.includes('8175-41'), 'L16 "041: Calculate break-even point" is not 8175-41');
});

test('the data file loads as Apps Script', () => {
  const c = {};
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'cas-ccps/scripts/55b_LessonAssignmentData.js'), 'utf8') +
    ';this.A = LESSON_ASSIGNMENTS; this.O = LESSON_ORDER;', c);
  assert.equal(c.O['8175'].length, 36);
});
