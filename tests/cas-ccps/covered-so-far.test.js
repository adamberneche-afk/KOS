'use strict';
// 76's Covered So Far doc per course (plan L6): the lessons taught so far
// (LessonSchedule start_date on or before today), oldest first, each with its
// goals, competencies and key concepts from the lesson files (55b), then
// "Next up". Made once in the teacher folder, its ID in a Script Property,
// rewritten in place only when its text changed; made again when trashed,
// never replaced when it just can't be opened.
// Nothing about students. The rollout's step 5 (58) is tested in
// lesson-rollout.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '55b_LessonAssignmentData.js', '55_LessonSchedule.js', '76_CoveredSoFar.js'].map(S);

function load(schedule) {
  const env = loadGasFiles(FILES, ['writeCoveredSoFar_', 'refreshCoveredSoFar', 'coveredSoFarContent_']);
  const { sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const folder = sandbox.DriveApp.getRootFolder().createFolder('Teacher');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes', 'release']);
  (schedule || []).forEach((r) => ls.appendRow([r[0], r[1], '', r[2], 'CAS-' + r[1].toUpperCase(), '', r[3] || '']));
  // A Ledger with a student row: the doc never reads it.
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = new Array(27).fill('');
  row[1] = '1234567@ccpsnet.net'; row[2] = 'VDOE-A'; row[4] = 'A Student';
  ledger.appendRow(row);
  return Object.assign(env, { ss, props, folder });
}

const SCHEDULE = [
  ['8175', '8175-L06', '2026-10-08'], ['8175', '8175-L07', '2026-10-15', 'HOLD'], ['8175', '8175-L08', '2026-10-29'],
  ['8177', '8177-the-business-of-the-game', '2026-10-08'],
];
const day = (sandbox, ymd) => new sandbox.Date(ymd + 'T21:00:00');
const docText = (sandbox, id) => sandbox.DocumentApp.openById(id).getBody().getText();

test('the content: lessons taught so far with their goals, competencies and concepts, then next up', () => {
  const { exported } = load(SCHEDULE);
  const c = exported.coveredSoFarContent_('8175', '2026-10-20');
  assert.equal(c.taught, 2);
  const text = c.lines.map((l) => l.text).join('\n');
  assert.match(text, /^Covered So Far — 8175 Sports Entertainment and Event Marketing\n/);
  assert.match(text, /go no deeper than these lessons' goals and concepts/);
  assert.match(text, /Taught so far: 2 lessons, the latest starting 2026-10-15\./);
  assert.match(text, /5 earlier lessons in teaching order have no start date in LessonSchedule and are not listed/);
  // Oldest first; the latest is the one being taught; a held lesson is still taught.
  const headings = c.lines.filter((l) => l.heading === 2).map((l) => l.text);
  assert.equal(headings.length, 2);
  assert.match(headings[0], /^2026-10-08 · Lesson 6: L06 /);
  assert.match(headings[1], /^2026-10-15 · Lesson 7: L07 .*\(being taught now\)$/);
  assert.deepEqual(c.lines.filter((l) => l.heading === 1).map((l) => l.text), ['Lessons taught', 'Next up']);
  assert.match(text, /\nLearning goals:\nI can plan to grow professionally/);
  assert.ok(c.lines.some((l) => l.item && /^I can plan to grow professionally/.test(l.text)), 'goals are bullets');
  assert.match(text, /\nCompetencies assessed:\n8175-20 Demonstrate professionalism\./);
  assert.match(text, /\nNext up\n2026-10-29 · Lesson 8: L08 .*\(not taught yet\)$/);
  assert.doesNotMatch(text, /Lesson 8: L08 [^\n]*\n(Objective|Learning goals)/, 'next up has no goals: not taught yet');
});

test('a lesson\'s parts, the competencies it also touches, and next up with nothing dated after', () => {
  const { exported } = load([['8175', '8175-L01', '2026-09-02']]);
  const text = exported.coveredSoFarContent_('8175', '2026-09-03').lines.map((l) => l.text).join('\n');
  assert.match(text, /Parts: Part 1: The Timeline; Part 2: The Shift; Part 3: The Future; Part 4: The Functions/);
  assert.match(text, /Also touches competencies: 8175-11, 8175-45, 8175-47/);
  assert.doesNotMatch(text, /earlier lesson/);
  assert.match(text, /\nNext up\nLesson 2: L02 [^\n]*\(not dated yet; not taught yet\)$/);
  const before = exported.coveredSoFarContent_('8175', '2026-09-01');
  assert.equal(before.taught, 0);
  assert.match(before.lines.map((l) => l.text).join('\n'), /Nothing yet: no lesson in LessonSchedule has a start date on or before 2026-09-01\./);
});

test('one doc per course in the teacher folder, its ID in a Script Property; rewritten in place only when it changed', () => {
  const { exported, sandbox, props, folder } = load(SCHEDULE);
  const first = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  assert.deepEqual(first.map((r) => [r.course, r.taught, r.written, r.created, r.error]),
    [['8175', 2, true, true, ''], ['8177', 1, true, true, '']]);
  const id = props.getProperty('COVERED_SO_FAR_DOC_ID_8175');
  assert.ok(id && props.getProperty('COVERED_SO_FAR_DOC_ID_8177') !== id);
  const file = sandbox.DriveApp.getFileById(id);
  assert.equal(file.getParents().next().getId(), folder.getId());
  assert.match(docText(sandbox, id), /^Covered So Far — 8175 /);
  assert.equal(docText(sandbox, id).split('Covered So Far — ').length, 2, 'one title');

  // The next night, nothing changed: nothing is written.
  const same = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-21') });
  assert.deepEqual(same.map((r) => r.written), [false, false]);

  // L08 starts: the same doc, rewritten.
  const later = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-29') });
  assert.deepEqual(later.map((r) => [r.written, r.created]), [[true, false], [false, false]]);
  assert.equal(props.getProperty('COVERED_SO_FAR_DOC_ID_8175'), id);
  assert.match(docText(sandbox, id), /2026-10-29 · Lesson 8: L08 [^\n]*\(being taught now\)/);
  assert.equal(docText(sandbox, id).split('Lessons taught').length, 2, 'no leftover text from the last version');

  // The editor function rewrites both, changed or not.
  const forced = exported.refreshCoveredSoFar();
  assert.deepEqual(forced.map((r) => [r.written, r.created]), [[true, false], [true, false]]);
});

test('a trashed doc is made again; one course failing doesn\'t stop the other', () => {
  const { exported, sandbox, props } = load(SCHEDULE);
  exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  const old = props.getProperty('COVERED_SO_FAR_DOC_ID_8177');
  sandbox.DriveApp.getFileById(old).setTrashed(true);
  const res = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  assert.deepEqual(res.map((r) => [r.course, r.written, r.created]), [['8175', false, false], ['8177', true, true]]);
  assert.notEqual(props.getProperty('COVERED_SO_FAR_DOC_ID_8177'), old);

  const realCreate = sandbox.DocumentApp.create;
  props.deleteProperty('COVERED_SO_FAR_DOC_ID_8175');
  sandbox.DocumentApp.create = (title) => { if (/8175/.test(title)) throw new Error('Docs down'); return realCreate(title); };
  props.deleteProperty('COVERED_SO_FAR_DOC_ID_8177');
  const mixed = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  assert.deepEqual(mixed.map((r) => [r.course, r.written, r.error]), [['8175', false, 'Docs down'], ['8177', true, '']]);
});

test('a doc that can\'t be opened is an error, never silently replaced', () => {
  const { exported, sandbox, props } = load(SCHEDULE);
  exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  props.setProperty('COVERED_SO_FAR_DOC_ID_8175', 'gone');
  const res = exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-29') });
  assert.match(res[0].error, /COVERED_SO_FAR_DOC_ID_8175 can't be opened .*delete that Script Property/);
  assert.equal(res[0].written, false);
  assert.equal(props.getProperty('COVERED_SO_FAR_DOC_ID_8175'), 'gone', 'the property is left for the operator');
});

test('nothing about students reaches the doc', () => {
  const { exported, sandbox, props } = load(SCHEDULE);
  exported.writeCoveredSoFar_({ today: day(sandbox, '2026-10-20') });
  ['8175', '8177'].forEach((c) => {
    const text = docText(sandbox, props.getProperty('COVERED_SO_FAR_DOC_ID_' + c));
    assert.doesNotMatch(text, /@ccpsnet\.net|1234567|VDOE-|A Student/);
  });
});
