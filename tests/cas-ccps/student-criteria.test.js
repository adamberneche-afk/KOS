'use strict';
// Each assignment's learning objectives, owned by the student: one
// "I can …" line per competency (cas-ccps/curriculum/lessons/
// STUDENT_CRITERIA.json, the operator's direction 2026-10-24,
// meta/STUDENT_WORK_PLAN_2026-10.md). The reflection questions will quote
// them ("Where in your work do you show this: “…”?"), so each must exist
// for every competency the tiers give an assignment, read as one first-person
// sentence, and carry no system words.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const LESSONS = path.join(__dirname, '..', '..', 'cas-ccps', 'curriculum', 'lessons');
const criteria = require(path.join(LESSONS, 'STUDENT_CRITERIA.json'));
const tiers = require(path.join(LESSONS, 'COMPETENCY_TIERS.json'));

const lessonKeys = (o) => Object.keys(o).filter((k) => !k.startsWith('_'));

test('one objective for every competency the tiers give an assignment, and none extra', () => {
  assert.deepEqual(lessonKeys(criteria).sort(), lessonKeys(tiers).sort());
  lessonKeys(tiers).forEach((k) => {
    const t = tiers[k];
    const ids = [t.primary].concat(t.secondary || [], t.tertiary || []);
    assert.deepEqual(Object.keys(criteria[k]).sort(), ids.slice().sort(), k);
  });
});

test('each objective is one "I can" sentence, 30 words at most, with no system words', () => {
  lessonKeys(criteria).forEach((k) => {
    Object.entries(criteria[k]).forEach(([id, text]) => {
      const where = k + ' ' + id;
      assert.match(text, /^I can /, where);
      assert.doesNotMatch(text, /(?<!-)\byou(r)?\b/i, where + ' speaks to the student, not as them'); // "thank-you" is fine
      assert.ok(text.split(/\s+/).length <= 30, where + ' is over 30 words');
      assert.doesNotMatch(text, /demonstrat|competenc|milestone|rubric|VDOE|\b\d{4}-\d+\b|\(required\)/i, where);
    });
  });
});

test('each concern names a tertiary competency of its lesson', () => {
  (criteria._concerns || []).forEach((c) => {
    assert.ok((tiers[c.lesson].tertiary || []).includes(c.competency), c.lesson + ' ' + c.competency);
    assert.ok(String(c.why).length > 10);
  });
});
