'use strict';
// Tests for cas-ccps/scripts/58_LessonRollout.js, the nightly lesson rollout.
//
// Pins: the plan is the current lesson plus lessons starting within 2 days,
// and only the current lesson and tomorrow's are released tonight; without
// ROLLOUT_AUTO_APPLY nothing is created, shared or changed (shadow); with it,
// docs for a lesson two days out are made unshared (SCHEDULED) and the
// night-before run shares them and sets them ACTIVE; failures, a stalled
// run and a stale Canvas export are PROBLEM rows; and RolloutLog holds
// counts and reason codes, never a student account or file ID.
//
// The seeder (53) and the roster import (52) have their own tests; here they
// are replaced with recorders. The intake side of deferred sharing (02) and
// the dashboards' SCHEDULED handling are tested below too.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
// The seeder (53) and roster import (52) are loaded so the sandbox matches
// the Central Ledger project (gas-lint's sandbox-scope check), then replaced
// with recorders in setup().
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js',
  '29_StudentContextAggregator.js', '31_PacingGuideManager.js', '02_Form1_IntakeAndWorkspaceGenerator.js',
  '51_CourseYearBuilder.js', '52_CanvasRosterImport.js', '53b_UnitAssignmentData.js', '53_AssignmentSeeder.js',
  '54_StudentAssignments.js', '55b_LessonAssignmentData.js', '55_LessonSchedule.js', '58_LessonRollout.js'].map(S);
const EXPOSE = ['lessonRollout_', '_lrPlan_', 'previewLessonRollout'];

const FRI = new Date(2026, 9, 16, 21, 0); // Friday 2026-10-16, 9 p.m.
// 8175: L06 started Oct 14 (current), L07 starts tomorrow, L08 on Sunday
// (two days out), L09 next week. 8177: one lesson, current.
const SCHEDULE = {
  '8175': [
    { key: '8175-L06', start: '2026-10-14' }, { key: '8175-L07', start: '2026-10-17' },
    { key: '8175-L08', start: '2026-10-18' }, { key: '8175-L09', start: '2026-10-23' },
  ],
  '8177': [{ key: '8177-handbook', start: '2026-10-08' }],
};

function setup(opts) {
  opts = opts || {};
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (opts.autoApply) props.setProperty('ROLLOUT_AUTO_APPLY', opts.autoApply);
  if (opts.configTab) ss.insertSheet('_CONFIG').getRange(1, 1, 2, 2).setValues([['Key', 'Value'], ['ROLLOUT_AUTO_APPLY', opts.configTab]]);
  sandbox._lsRows_ = () => SCHEDULE;

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  // [studentConfigId, account, status, lesson]
  (opts.students || []).forEach(([sid, account, status, lesson]) => {
    const row = new Array(23).fill('');
    row[1] = account; row[2] = sid; row[3] = 'file-' + sid; row[12] = status;
    ledger.appendRow(row);
    sandbox.recordStudentAssignment_(ss, sid, account, lesson);
  });

  const shared = [];
  const files = {};
  sandbox.DriveApp.getFileById = (id) => files[id] || (files[id] = {
    addEditor: (who) => { if (opts.shareFails) throw new Error('Drive down'); shared.push([id, who]); },
  });

  const seedCalls = [];
  sandbox.seedAssignments_ = (o) => {
    seedCalls.push(o);
    const planned = o.units.filter((k) => !(opts.alreadySeeded || []).includes(k))
      .map((k) => ({ configId: 'CAS-' + k.toUpperCase() }));
    return { apply: o.apply, planned: planned, skipped: [], written: o.apply ? planned.length : 0, message: '' };
  };
  const enrollCalls = [];
  sandbox.enrollCanvasRoster_ = (o) => {
    enrollCalls.push(o);
    const r = opts.enrollResult ? opts.enrollResult(o) : {};
    return Object.assign({ apply: o.apply, planned: [{ account: '1234567@ccpsnet.net' }], enrolled: o.apply ? 1 : 0,
      skipped: [{ account: '2345678@ccpsnet.net', reason: 'ALREADY_ENROLLED' }], failed: [],
      unmappedSections: [], timedOut: false, message: 'ok' }, r);
  };
  const exportAge = opts.exportAgeDays === undefined ? 1 : opts.exportAgeDays;
  sandbox._criFindExports_ = () => exportAge === null ? [] :
    [{ getLastUpdated: () => new Date(FRI.getTime() - exportAge * 86400000) }];

  const log = () => {
    const tab = ss.getSheetByName('RolloutLog');
    return tab ? tab.getDataRange().getValues().slice(1) : [];
  };
  return { exported, sandbox, ss, ledger, shared, seedCalls, enrollCalls, log };
}

test('the plan: the current lesson and lessons within 2 days; only the current one and tomorrow\'s release tonight', () => {
  const { exported } = setup();
  const plan = exported._lrPlan_(FRI);
  assert.deepEqual(plan['8175'].lessons.map((l) => [l.key, l.releaseNow]),
    [['8175-L06', true], ['8175-L07', true], ['8175-L08', false]]);
  assert.deepEqual(plan['8177'].lessons.map((l) => [l.key, l.releaseNow]), [['8177-handbook', true]]);
});

test('shadow (no ROLLOUT_AUTO_APPLY): only dry runs, nothing shared, every row marked SHADOW', () => {
  const { exported, seedCalls, enrollCalls, shared, ledger, log } = setup({
    students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
    alreadySeeded: ['8175-L06', '8175-L07', '8177-handbook'],
  });
  exported.lessonRollout_({ today: FRI });
  assert.ok(seedCalls.every((c) => c.apply === false));
  assert.ok(enrollCalls.every((c) => c.apply === false));
  assert.equal(shared.length, 0);
  assert.equal(ledger.getRange(2, 13).getValue(), 'SCHEDULED', 'not opened in shadow');
  const rows = log();
  assert.ok(rows.length > 0);
  assert.ok(rows.filter((r) => r[2] !== '-').every((r) => r[1] === 'SHADOW'));
  const release = rows.find((r) => r[4] === 'RELEASE');
  assert.deepEqual([release[3], release[5]], ['CAS-8175-L07', 1], 'it says what it would release');
  // L08 would be seeded tonight, so a dry-run enrollment can't see it yet.
  const l08 = rows.find((r) => r[3] === 'CAS-8175-L08' && r[4] === 'ENROLL');
  assert.match(l08[6], /isn't seeded yet/);
});

test('ROLLOUT_AUTO_APPLY for one course: docs two days out are made unshared, the current and tomorrow\'s shared', () => {
  const { exported, seedCalls, enrollCalls } = setup({ autoApply: '8175', alreadySeeded: ['8177-handbook'] });
  exported.lessonRollout_({ today: FRI });
  const applied = seedCalls.find((c) => c.apply === true);
  assert.deepEqual([...applied.units], ['8175-L06', '8175-L07', '8175-L08']);
  assert.deepEqual([...seedCalls.find((c) => c.apply === false).units], ['8177-handbook'], '8177 stays in shadow');
  assert.equal(seedCalls.length, 2);
  const byLesson = Object.fromEntries(enrollCalls.map((c) => [c.assignmentConfigId, c]));
  assert.equal(byLesson['CAS-8175-L06'].deferShare, false);
  assert.equal(byLesson['CAS-8175-L07'].deferShare, false);
  assert.equal(byLesson['CAS-8175-L08'].deferShare, true);
  assert.equal(byLesson['CAS-8175-L08'].apply, true);
  assert.equal(byLesson['CAS-8177-HANDBOOK'].apply, false);
  assert.ok(enrollCalls.every((c) => c.quiet === true && typeof c.deadline === 'number'));
});

test('the night before: SCHEDULED docs for tomorrow\'s lesson are shared and set ACTIVE; later lessons wait', () => {
  const { exported, shared, ledger, log } = setup({
    autoApply: 'all',
    students: [
      ['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07'],
      ['VDOE-B', '2345678@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L08'],
      ['VDOE-C', '3456789@ccpsnet.net', 'ACTIVE', 'CAS-8175-L07'],
    ],
  });
  exported.lessonRollout_({ today: FRI });
  assert.deepEqual(shared, [['file-VDOE-A', '1234567@ccpsnet.net']]);
  assert.deepEqual([2, 3, 4].map((r) => ledger.getRange(r, 13).getValue()), ['ACTIVE', 'SCHEDULED', 'ACTIVE']);
  const release = log().find((r) => r[4] === 'RELEASE');
  assert.deepEqual([release[1], release[3], release[5]], ['APPLY', 'CAS-8175-L07', 1]);
});

test('a doc that can\'t be shared stays SCHEDULED and is a PROBLEM', () => {
  const { exported, ledger, log } = setup({
    autoApply: 'all', shareFails: true,
    students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
  });
  exported.lessonRollout_({ today: FRI });
  assert.equal(ledger.getRange(2, 13).getValue(), 'SCHEDULED');
  assert.ok(log().some((r) => r[4] === 'PROBLEM' && /could not be shared/.test(r[6])));
});

test('failed enrollments, a stalled run, unmapped sections and a stale export are PROBLEM rows', () => {
  const { exported, log } = setup({
    autoApply: 'all', exportAgeDays: 9,
    enrollResult: (o) => o.assignmentConfigId === 'CAS-8175-L08'
      ? { failed: [{ account: '1234567@ccpsnet.net', reason: 'NO_MASTER_TEMPLATE' }], timedOut: true,
        unmappedSections: ['8175 - Block 9'] }
      : {},
  });
  const res = exported.lessonRollout_({ today: FRI });
  const problems = log().filter((r) => r[4] === 'PROBLEM').map((r) => r[6]);
  assert.ok(problems.some((p) => /enrollment failed: NO_MASTER_TEMPLATE 1/.test(p)));
  assert.ok(problems.some((p) => /time budget/.test(p)));
  assert.ok(problems.some((p) => /CanvasSectionMap/.test(p)));
  assert.ok(problems.some((p) => /9 days old/.test(p)));
  assert.equal(res.problems, problems.length);
});

test('RolloutLog never holds a student account or file ID', () => {
  const { exported, log } = setup({
    autoApply: 'all',
    students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
    enrollResult: () => ({ failed: [{ account: '7654321@ccpsnet.net', reason: 'NO_LIVE_ASSIGNMENT' }] }),
  });
  exported.lessonRollout_({ today: FRI });
  const text = JSON.stringify(log());
  assert.ok(!/@ccpsnet\.net|\d{7}|file-|VDOE-/.test(text), text);
});

test('previewLessonRollout is a dry run even with ROLLOUT_AUTO_APPLY on', () => {
  const { exported, seedCalls, enrollCalls, shared } = setup({
    autoApply: 'all', students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
  });
  exported.previewLessonRollout();
  assert.ok(seedCalls.every((c) => !c.apply) && enrollCalls.every((c) => !c.apply));
  assert.equal(shared.length, 0);
});

// ── Deferred sharing at intake (02) ──────────────────────────────────────────

test('intake with deferShare adds only the teacher and writes the Ledger row SCHEDULED', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')],
    ['shareToStudentDrive_', 'registerLedger_']);
  const calls = [];
  const file = { addEditor: (w) => calls.push(['editor', w]), addCommenter: (w) => calls.push(['commenter', w]) };
  exported.shareToStudentDrive_({}, file, '', 'teacher@ccpsnet.net');
  assert.deepEqual(calls, [['commenter', 'teacher@ccpsnet.net']]);

  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  ss.insertSheet('Ledger').appendRow(new Array(19).fill('h'));
  const cfg = { ledgerSsId: ss.getId(), tabs: { ledger: 'Ledger' } };
  exported.registerLedger_(cfg, 's@ccpsnet.net', 'S', 'VDOE-1', 'f', 'B', 'C', 'T', 't@x', 'Sub', 'Course', '3', 'u', 'SCHEDULED');
  exported.registerLedger_(cfg, 's@ccpsnet.net', 'S', 'VDOE-2', 'f', 'B', 'C', 'T', 't@x', 'Sub', 'Course', '3', 'u');
  const rows = ss.getSheetByName('Ledger').getDataRange().getValues();
  assert.deepEqual([rows[1][12], rows[2][12]], ['SCHEDULED', 'ACTIVE']);
});

// ── The CAS signal (34b) ────────────────────────────────────────────────────

test('_casSignalRollout_: counts the last day\'s PROBLEM rows and names the courses still in shadow', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('34b_CasAttentionSignal.js')],
    ['_casSignalRollout_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const now = new Date(2026, 9, 17, 7, 0);
  assert.deepEqual(exported._casSignalRollout_(now), { problems: 0, shadow: '' }, 'no tab yet is quiet');
  const tab = ss.insertSheet('RolloutLog');
  tab.appendRow(['Timestamp', 'Mode', 'Course', 'Lesson', 'Step', 'Count', 'Detail']);
  tab.appendRow([new Date(2026, 9, 15, 21), 'APPLY', '8175', 'CAS-8175-L06', 'PROBLEM', 1, 'old']);
  tab.appendRow([new Date(2026, 9, 16, 21), 'APPLY', '8175', 'CAS-8175-L07', 'PROBLEM', 1, 'x']);
  tab.appendRow([new Date(2026, 9, 16, 21), 'SHADOW', '8177', 'CAS-8177-X', 'ENROLL', 3, 'y']);
  tab.appendRow([new Date(2026, 9, 16, 21), '-', '-', '-', 'PROBLEM', 9, 'stale export']);
  assert.deepEqual(exported._casSignalRollout_(now), { problems: 2, shadow: '8177' });
});

// UX audit fix-first 6: the docs say a _CONFIG row turns the rollout on;
// before 2026-10-22 the key wasn't in SHARED_CONFIG_KEYS and was ignored.
test('ROLLOUT_AUTO_APPLY in the Ledger\'s _CONFIG tab turns the rollout on for that course', () => {
  const { exported, seedCalls } = setup({ configTab: '8175', alreadySeeded: ['8177-handbook'] });
  exported.lessonRollout_({ today: FRI });
  assert.ok(seedCalls.some((c) => c.apply === true), '8175 applies');
  const { exported: off, seedCalls: offCalls } = setup({ configTab: 'off', alreadySeeded: ['8177-handbook'] });
  off.lessonRollout_({ today: FRI });
  assert.ok(offCalls.every((c) => c.apply === false), 'off is the kill switch');
});
