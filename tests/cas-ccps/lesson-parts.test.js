'use strict';
// A lesson in parts (meta/STUDENT_WORK_PLAN_2026-10.md, Phase 3; Appendix B
// approved 2026-10-27): PARTS.json → 55b's LESSON_PARTS, one assignment per
// part with its own tiers, criteria and task.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const gen = require('../../tools/cas-ccps/build-lesson-assignments.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const KEY = '8177-market-research-survey-design';
const data = () => loadGasFiles([S('55b_LessonAssignmentData.js')], ['LESSON_ASSIGNMENTS', 'LESSON_PARTS']).exported;

test('the market research lesson is five parts, each its own assignment, in order', () => {
  const { LESSON_ASSIGNMENTS, LESSON_PARTS } = data();
  const parts = LESSON_PARTS[KEY];
  assert.deepEqual(parts.map((p) => p.key), [1, 2, 3, 4, 5].map((n) => KEY + '-P' + n));
  assert.deepEqual(LESSON_ASSIGNMENTS[KEY].partKeys, parts.map((p) => p.key));
  assert.deepEqual(parts.map((p) => p.partTitle), ['The Target Market', 'Build the Survey', 'Why These Questions Work',
    'Spot the Bias', 'Beyond the Survey']);
  parts.forEach((p, i) => {
    assert.equal(p.part, i + 1);
    assert.equal(p.partCount, 5);
    assert.equal(p.partOf, KEY);
    assert.ok(!LESSON_ASSIGNMENTS[p.key], 'a part is not a lesson');
  });
  assert.equal(parts[1].workFile, 'form');
  assert.equal(parts[1].workFileNow, 'doc', 'a doc with the form link until Phase 4');
  // Every lesson with parts lists them; the others have none (35 with parts since 2026-10-28).
  Object.keys(LESSON_ASSIGNMENTS).forEach((k) => assert.deepEqual(LESSON_ASSIGNMENTS[k].partKeys,
    LESSON_PARTS[k] ? LESSON_PARTS[k].map((p) => p.key) : undefined, k));
  assert.equal(Object.keys(LESSON_PARTS).length, 35);
  assert.ok(LESSON_PARTS['8175-L24'], 'an 8175 lesson splits too');
});

test('each part\'s tiers are Appendix B\'s, and every lesson competency is in some part', () => {
  const { LESSON_ASSIGNMENTS, LESSON_PARTS } = data();
  const parts = LESSON_PARTS[KEY];
  assert.deepEqual(parts.map((p) => p.milestoneCompetencyIds[0]), ['8177-81', '8177-83', '8177-83', '8177-2', '8177-79']);
  assert.deepEqual(parts.map((p) => p.milestoneCompetencyIds[1]), ['8177-2', '8177-18', '', '', '8177-2']);
  assert.deepEqual(parts[0].tertiaryCompetencyIds, ['8177-93']);
  const all = new Set(parts.flatMap((p) => p.competencyIds));
  LESSON_ASSIGNMENTS[KEY].competencyIds.forEach((id) => assert.ok(all.has(id), id));
  assert.match(parts[0].objectives['8177-81'], /^You pick one group \(students, parents or staff\)/, 'criteria in the student\'s words');
});

test('each part\'s task: the opening, its own paragraphs and vocabulary; Part 1 carries the background', () => {
  const { LESSON_PARTS } = data();
  const [p1, p2, p3] = LESSON_PARTS[KEY];
  assert.match(p1.promptText, /^Assignment: The Cavalier Shop Survey — Part 1 of 5: The Target Market\n\nYou are a market researcher/);
  assert.match(p1.promptText, /\nBackground:\n/);
  assert.match(p1.promptText, /\nKey Terms:\n/);
  assert.match(p1.promptText, /Use these terms accurately: market research, target market\./);
  assert.doesNotMatch(p1.promptText, /Part 2: Build the Survey/);
  assert.match(p2.promptText, /Part 1 has the background, the key terms and an example: look back at it\./);
  assert.doesNotMatch(p2.promptText, /\nBackground:\n/);
  assert.match(p2.promptText, /Paste your form's link into this document\./, 'kept until Forms are work files (Phase 4)');
  assert.doesNotMatch(p2.promptText, /Part 3:/);
  assert.match(p3.promptText, /What your work needs to show:\n\n- For each of the three questions, you say whether it collects quantitative or qualitative data/);
  assert.match(p3.definitionOfDone, /^ASSIGNMENT: Venue Market Research & Survey Design — Part 3: Why These Questions Work/);
  assert.match(p3.definitionOfDone, /PRIMARY COMPETENCY \(Milestone 1; must be MET\)\n- 8177-83 Develop a market research project\./);
});

test('the builder refuses a part with no primary, a tier outside the lesson, or a competency no part covers', () => {
  const comps = [{ competency_id: 'X-1', competency_text: 'One.' }, { competency_id: 'X-2', competency_text: 'Two.' }];
  const a = { key: 'X', code: '8177', lessonId: 'X', unitName: 'X', courseName: 'C' };
  const md = '## Prompt\n\nAssignment: X\n\nPart 1: A.\n\nPart 2: B.\n';
  const part = (o) => Object.assign({ title: 'T', marker: 'Part 1:', primary: 'X-1', criteria: {} }, o);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ primary: '' })] }), /has no primary/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ primary: 'X-9' })] }), /X-9 is not one of the lesson's competencies/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({})] }), /no part covers X-2/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ secondary: ['X-2'] }), part({ marker: 'Part 9:' })] }), /no paragraph starts with "Part 9:"/);
  assert.equal(gen.buildParts(a, comps, md, { parts: [part({}), part({ marker: 'Part 2:', primary: 'X-2' })] }).length, 2);
});
