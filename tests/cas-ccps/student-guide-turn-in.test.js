'use strict';
// The student guide teaches the turn-in code (2026-11-15). The code went live
// for every lesson in both courses on 2026-11-09 (D17), while
// docs/STUDENT_QUICK_START.html still said "turn in the link to your last
// part" and "the page doesn't update by itself". These pins keep the guide on
// the live flow and its words on the page's own:
//   - the five steps, in order, and none of the retired turn-in sentences;
//   - each button the guide names is a label the page really renders
//     (13 and 71b), and the stage names are 13's STAGE_ORDER;
//   - the plain-language points the operator asked for (2026-11-15);
//   - the UX reference's student summary and pipeline name the code too.
// Text only: no script is run, so no sandbox.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const GUIDE = read('cas-ccps/docs/STUDENT_QUICK_START.html');
const UX = read('cas-ccps/docs/USER_EXPERIENCE_REFERENCE.html');
const DASH = read('cas-ccps/scripts/13_StudentDashboard.js') + read('cas-ccps/scripts/13_StudentDashboardPage.html'); // the page since audit 4.5
const TURN_IN = read('cas-ccps/scripts/71b_TurnInStudent.js');
const text = (html) => html.split(/<[^>]+>/).join('').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');
const guideText = text(GUIDE);

test('the guide walks the five-step turn-in path, in order', () => {
  const steps = ['Open the assignment', 'Write under the grey line', 'Submit for feedback',
    'Answer the one question built from your feedback',
    'Copy your turn-in code and paste it into the Canvas assignment'];
  const section = guideText.slice(guideText.indexOf('Turn It In: Your Turn-in Code'));
  let at = -1;
  steps.forEach((s) => {
    const i = section.indexOf(s);
    assert.ok(i > at, 'step out of order or missing: ' + s);
    at = i;
  });
});

test('the retired turn-in sentences are gone', () => {
  assert.doesNotMatch(guideText, /turn in the link to your last part/i);
  assert.doesNotMatch(guideText, /doesn't update by itself/i);
  assert.doesNotMatch(text(UX), /Submits the document’s link in Canvas/);
});

test('the guide says what the code means, in plain words', () => {
  assert.match(guideText, /shows you read your feedback and did something with it\. It does not say your work is good/);
  assert.match(guideText, /earn the code on a Revise card/);
  assert.match(guideText, /belongs to you and this one assignment/);
  assert.match(guideText, /stays the same if you submit again/);
  assert.match(guideText, /for your learning and your final grade/);
  assert.match(guideText, /Read the Canvas instructions first\..*whether to paste a turn-in code or a link/);
  // What a good answer does, not a sentence stem to fill in.
  ['Names the specific part', 'Says where', 'Says why'].forEach((s) => assert.ok(guideText.includes(s), s));
});

test('every button the guide names is one the page renders', () => {
  const page = DASH + TURN_IN;
  ['Send answer', 'Copy', 'Check again', 'Try again', 'Open Canvas', 'Canvas ↗', 'Checking your answer']
    .forEach((label) => {
      assert.ok(guideText.includes(label), 'the guide names ' + label);
      const inPage = page.includes(label) || page.includes(label.replace('↗', '\\u2197'));
      assert.ok(inPage, 'the page renders ' + label);
    });
  assert.ok(TURN_IN.includes('Open Canvas \\\\u2197'), 'the turn-in card has Open Canvas ↗');
});

test("the stage line's names are 13's STAGE_ORDER", () => {
  const m = DASH.match(/const STAGE_ORDER = (\[[\s\S]*?\]\]);/);
  assert.ok(m, 'STAGE_ORDER found');
  const names = JSON.parse(m[1]).map((x) => x[1]);
  assert.deepEqual(names, ['Submitted', 'In line', 'Being checked', 'Feedback ready']);
  assert.ok(guideText.includes(names.join(' → ')), 'the guide shows ' + names.join(' → '));
});

test('the UX reference names the turn-in code in the student summary and the pipeline', () => {
  const ux = text(UX);
  assert.match(ux, /takes a turn-in code for every lesson in both courses/);
  assert.match(ux, /Flow 6/);
  assert.match(ux, /never that the work is good/);
});
