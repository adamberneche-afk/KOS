'use strict';
// The Student Dashboard's Warm-ups card (13_StudentDashboard.js): a student
// sees their own warm-up docs from the last two weeks, newest first, with a
// status that matches WarmUpQueue (25_WarmUpWriter.js, 41_WarmUpFlowBridge.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function wqRow({ googleId, date, status, docId, course = 'Sports Marketing' }) {
  const row = new Array(21).fill('');
  row[0] = 'WQ-' + Math.random().toString(36).slice(2, 8);
  row[4] = googleId;
  row[5] = date;
  row[6] = JSON.stringify({ course_name: course });
  row[8] = status;
  row[9] = docId || '';
  return row;
}

function load(rows) {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('13_StudentDashboard.js')],
    ['getStudentWarmUps_', 'resolveWarmUpStatus_', 'buildStudentDashboardHtml_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  rows.forEach((r) => wq.appendRow(r));
  return { exported, ss };
}

const CFG = { tabs: { warmUpQueue: 'WarmUpQueue' } };
// Noon in New York, so the date is the same in the script's zone and UTC.
const NOW = new Date('2026-10-21T16:00:00Z');

test('getStudentWarmUps_: only the student\'s own delivered docs, last two weeks, newest first', () => {
  const me = 'student@ccpsnet.net';
  const { exported, ss } = load([
    wqRow({ googleId: me, date: '2026-10-20', status: 'SCORED', docId: 'doc-mon' }),
    wqRow({ googleId: 'Student@CCPSNET.net', date: '2026-10-21', status: 'DELIVERED', docId: 'doc-wed' }),
    wqRow({ googleId: 'other@ccpsnet.net', date: '2026-10-21', status: 'DELIVERED', docId: 'doc-other' }),
    wqRow({ googleId: me, date: '2026-10-22', status: 'PENDING' }),            // no doc yet
    wqRow({ googleId: me, date: '2026-10-01', status: 'SCORED', docId: 'doc-old' }), // older than 14 days
    wqRow({ googleId: me, date: new Date('2026-10-19T04:00:00Z'), status: 'INCOMPLETE', docId: 'doc-sun' }),
  ]);
  const list = exported.getStudentWarmUps_(ss, CFG, me, NOW);
  assert.deepEqual(list.map((w) => [w.lessonDate, w.statusClass, w.isToday]), [
    ['2026-10-21', 'NEEDS_ACTION', true],
    ['2026-10-20', 'DONE', false],
    ['2026-10-19', 'NOT_STARTED', false],
  ]);
  assert.equal(list[0].dateLabel, 'Wed, Oct 21');
  assert.equal(list[0].course, 'Sports Marketing');
  assert.equal(list[0].docUrl, 'https://docs.google.com/document/d/doc-wed/edit');
  assert.ok(!JSON.stringify(list).includes('doc-other'));
});

test('getStudentWarmUps_: no WarmUpQueue tab, or an empty one, is no card', () => {
  const { exported, ss } = load([]);
  assert.deepEqual(exported.getStudentWarmUps_(ss, CFG, 'a@ccpsnet.net', NOW), []);
  assert.deepEqual(exported.getStudentWarmUps_(ss, { tabs: { warmUpQueue: 'Missing' } }, 'a@ccpsnet.net', NOW), []);
});

test('resolveWarmUpStatus_: a delivered warm-up is due on its day, then waits for the nightly check', () => {
  const r = exported => [exported.resolveWarmUpStatus_('DELIVERED', '2026-10-21', '2026-10-21').statusClass,
    exported.resolveWarmUpStatus_('DELIVERED', '2026-10-20', '2026-10-21').statusClass,
    exported.resolveWarmUpStatus_('PENDING_EVAL', '2026-10-20', '2026-10-21').statusClass,
    exported.resolveWarmUpStatus_('EVAL_ERROR', '2026-10-20', '2026-10-21').statusClass];
  assert.deepEqual(r(load([]).exported), ['NEEDS_ACTION', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS']);
});

test('every inline <script> the student dashboard serves parses as valid JS', () => {
  const html = load([]).exported.buildStudentDashboardHtml_();
  assert.ok(html.includes('function renderWarmUps('));
  extractInlineScripts(html).forEach((code, i) => {
    assert.doesNotThrow(() => new vm.Script(code, { filename: `student-dashboard-inline-${i}.js` }));
  });
});
