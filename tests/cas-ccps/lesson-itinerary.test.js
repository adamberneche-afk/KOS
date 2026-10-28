'use strict';
// The lesson doc's itinerary (meta/SPRINT_LESSON_DOCS_2026-11.md): the class
// plan the generator drafts from each lesson's own sections (55b's `plan`),
// Clover Hill's bell schedule (00), and the plan fitted to a period's minutes.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const gen = require('../../tools/cas-ccps/build-lesson-assignments.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const load = () => loadGasFiles([S('00_SharedConfig.js'), S('55b_LessonAssignmentData.js')],
  ['bellScheduleFor_', 'classMinutesFor_', 'bellBlockOf_', 'itineraryFor_', 'LESSON_ASSIGNMENTS', 'ITINERARY_MODES']).exported;
const sum = (blocks) => blocks.reduce((n, b) => n + b.minutes, 0);

test('8175: warm-up, the Hook, the task with no minutes (it takes the rest), the Checkout Slip', () => {
  const { LESSON_ASSIGNMENTS } = load();
  const p = LESSON_ASSIGNMENTS['8175-L06'].plan;
  assert.equal(p.duration, '1 Class Period');
  const b = p.days[0].blocks;
  assert.deepEqual(b.map((x) => [x.title, x.minutes, x.mode]), [
    ['Warm-up', 5, 'warmup'], ['The Hook', 10, 'listen'],
    ['Skill Development Plan (The "Soft Skills" Gap)', null, 'devices'], ['Checkout Slip', 5, 'write']]);
  assert.match(b[0].detail, /^What is a 'soft skill'\?/, 'the Bell Ringer is the warm-up');
  assert.match(b[3].detail, /bad habit/);
});

test('8177: the timed sections in order, a bulleted plan, and a lesson split by day', () => {
  const { LESSON_ASSIGNMENTS } = load();
  const m = LESSON_ASSIGNMENTS['8177-market-research-survey-design'].plan.days[0].blocks;
  assert.deepEqual(m.map((x) => [x.title, x.minutes, x.mode]), [['Warm-up', 5, 'warmup'],
    ['The "Who Cares?" Discussion', 10, 'discuss'], ['The "Bias Bootcamp"', 15, 'listen'], ['Digital Application Lab', 35, 'devices']]);
  const c = LESSON_ASSIGNMENTS['8177-chhs-school-store-company-description'].plan.days[0].blocks;
  assert.deepEqual(c.map((x) => [x.title, x.minutes]), [['Warm-up', 5], ['The Venue Context', 5],
    ['The Motivation Factor', 10], ['Management Writing Workshop', 20]], '"- **Step:** (5 mins)" lines count');
  const g = LESSON_ASSIGNMENTS['8177-game-day-takeover'].plan;
  assert.equal(g.days.length, 2);
  assert.deepEqual(g.days.map((d) => d.label), ['Day 1: The Plan', 'Day 2: The Follow-Up']);
  assert.equal(g.days[1].blocks[0].title, 'Warm-up', 'each day starts with the warm-up');
  Object.values(LESSON_ASSIGNMENTS).forEach((a) => assert.ok(a.plan.days.length, a.key + ' has a plan'));
});

test('modes: a lab is Chromebooks, a discussion is talk, instruction is listening; a Hook is never Chromebooks', () => {
  assert.equal(gen.modeOf('Digital Application Lab', 'listen'), 'devices');
  assert.equal(gen.modeOf('Brainstorming session: why does a student buy', 'listen'), 'discuss');
  assert.equal(gen.modeOf('Retail Math Crash Course', 'discuss'), 'listen');
  assert.equal(gen.modeOf('Saying Thank You', 'listen'), 'listen', 'no keyword: the fallback');
  const { LESSON_ASSIGNMENTS } = load();
  Object.values(LESSON_ASSIGNMENTS).forEach((a) => a.plan.days.forEach((d) => d.blocks
    .filter((b) => b.title === 'The Hook' && a.code === '8175').forEach((b) => assert.notEqual(b.mode, 'devices', a.key))));
});

test('the bell schedule: A every day to Sept. 4, Mon/Tue A to Nov. 20, Mon/Tue/Fri A from Nov. 23, early release, a called day', () => {
  const { bellScheduleFor_, classMinutesFor_, bellBlockOf_ } = load();
  assert.equal(bellScheduleFor_('2026-09-03'), 'A', 'a Thursday before Sept. 4');
  assert.equal(bellScheduleFor_('2026-10-27'), 'A', 'Tuesday');
  assert.equal(bellScheduleFor_('2026-10-28'), 'B', 'Wednesday');
  assert.equal(bellScheduleFor_('2026-11-20'), 'B', 'the last Friday on B');
  assert.equal(bellScheduleFor_('2026-12-04'), 'A', 'a Friday from Nov. 23');
  assert.equal(bellScheduleFor_('2026-12-03'), 'B', 'Thursday');
  assert.equal(bellScheduleFor_('2026-10-30'), 'EARLY_RELEASE');
  assert.equal(bellScheduleFor_('2026-11-05', { '2026-11-05': 'DELAY' }), 'DELAY');
  assert.equal(bellScheduleFor_('2026-11-05', { '2026-11-05': 'NONSENSE' }), 'B', 'an unknown override is ignored');
  assert.deepEqual(['1', '3-Odd', '3-Even', '4', 'HR', ''].map(bellBlockOf_), [1, 3, 3, 4, 0, 0]);
  assert.equal(classMinutesFor_('2026-10-27', '1'), 50);
  assert.equal(classMinutesFor_('2026-10-28', '3-Odd'), 95, '3rd block on B, minus lunch');
  assert.equal(classMinutesFor_('2026-10-28', 'HR'), 0);
});

test('an itinerary fits the period exactly: fixed blocks kept, the open block takes the rest, timed blocks scaled', () => {
  const { itineraryFor_, LESSON_ASSIGNMENTS } = load();
  const l06 = LESSON_ASSIGNMENTS['8175-L06'].plan.days[0].blocks;
  const b45 = itineraryFor_(l06, 45);
  assert.deepEqual(b45.map((b) => b.minutes), [5, 10, 25, 5]);
  assert.deepEqual(itineraryFor_(l06, 100).map((b) => b.minutes), [5, 10, 80, 5]);
  assert.equal(l06[2].minutes, null, 'the plan itself is not changed');
  const mr = LESSON_ASSIGNMENTS['8177-market-research-survey-design'].plan.days[0].blocks;
  const a100 = itineraryFor_(mr, 100);
  assert.equal(sum(a100), 100);
  assert.equal(a100[0].minutes, 5, 'the warm-up keeps its 5');
  const er = itineraryFor_(mr, 55);
  assert.equal(sum(er), 55);
  assert.ok(er.every((b) => b.minutes >= 5 && b.minutes % 5 === 0));
  Object.values(LESSON_ASSIGNMENTS).forEach((a) => a.plan.days.forEach((d) => [30, 45, 79, 95, 100].forEach((m) =>
    assert.equal(sum(itineraryFor_(d.blocks, m)), m, a.key + ' at ' + m))));
});
