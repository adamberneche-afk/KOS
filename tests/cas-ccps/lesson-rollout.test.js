'use strict';
// Tests for cas-ccps/scripts/58_LessonRollout.js, the nightly lesson rollout.
//
// Pins: the plan is the current lesson plus lessons starting within 2 days,
// and only the current lesson and tomorrow's are released tonight; without
// ROLLOUT_AUTO_APPLY nothing is created, shared or changed (shadow); with it,
// docs for a lesson two days out are made unshared (SCHEDULED) and the
// night-before run shares them and sets them ACTIVE; failures and a stale
// Canvas export are PROBLEM rows, a step the time budget stopped is a
// CONTINUES row with what is left; the signal counts only what remains
// (rolloutDayStatus_, plan L3); and RolloutLog holds counts and reason
// codes, never a student account or file ID.
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
  '54_StudentAssignments.js', '55b_LessonAssignmentData.js', '55_LessonSchedule.js', '58_LessonRollout.js', '32_CompetencyRubricImporter.js', '66_LessonDoc.js', '67_AgendaDeck.js', '68_LessonParts.js', '63_DocHeader.js', '76_CoveredSoFar.js'].map(S);
const EXPOSE = ['lessonRollout_', '_lrPlan_', 'previewLessonRollout', 'runLessonRollout', 'runLessonRolloutCatchUp',
  '_lrEnrollOrder_', 'ROLLOUT_CATCHUP_MAX', 'ROLLOUT_TIME_BUDGET_MS', 'ROLLOUT_DOCS_RESERVE_MS',
  'rolloutDayStatus_', 'rolloutSignalLines_', 'rolloutFinishedLine_'];

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
  sandbox._lsRows_ = () => opts.schedule || SCHEDULE;

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

test('failed enrollments, unmapped sections and a stale export are PROBLEM rows; the time budget is not', () => {
  const { exported, log } = setup({
    autoApply: 'all', exportAgeDays: 9,
    enrollResult: (o) => o.assignmentConfigId === 'CAS-8175-L08'
      ? { failed: [{ account: '1234567@ccpsnet.net', reason: 'NO_MASTER_TEMPLATE' }], timedOut: true, left: 5,
        unmappedSections: ['8175 - Block 9'] }
      : {},
  });
  const res = exported.lessonRollout_({ today: FRI });
  const problems = log().filter((r) => r[4] === 'PROBLEM').map((r) => r[6]);
  assert.ok(problems.some((p) => /enrollment failed: NO_MASTER_TEMPLATE 1/.test(p)));
  assert.ok(!problems.some((p) => /time budget/.test(p)), 'a stop at the time budget is not a problem');
  assert.ok(problems.some((p) => /CanvasSectionMap/.test(p)));
  assert.ok(problems.some((p) => /9 days old/.test(p)));
  assert.equal(res.problems, problems.length);
});

// Plan L3 (2026-11-08): "57 problems" were mostly runs that hit the budget.
test('a run that hits the time budget logs CONTINUES with what is left, never PROBLEM', () => {
  const { exported, log } = setup({
    autoApply: 'all',
    enrollResult: (o) => o.assignmentConfigId === 'CAS-8175-L06' ? { timedOut: true, left: 12 } : {},
  });
  const res = exported.lessonRollout_({ today: FRI });
  const cont = log().filter((r) => r[4] === 'CONTINUES');
  assert.deepEqual(cont.map((r) => [r[3], r[5]]), [['CAS-8175-L06', 12]]);
  assert.match(cont[0][6], /12 student doc\(s\) left to make; the next run continues/);
  // (The sandbox's lesson-doc rows are PROBLEMs of their own; none is the budget.)
  assert.ok(!log().some((r) => r[4] === 'PROBLEM' && /time budget|not reached|continues/.test(r[6])));
  assert.equal(res.problems, log().filter((r) => r[4] === 'PROBLEM').length, 'CONTINUES isn\'t counted');
  assert.equal(res.unfinished, true, 'a catch-up still follows');
  const stamps = new Set(log().map((r) => new Date(r[0]).getTime()));
  assert.equal(stamps.size, 1, 'every row of a run carries the run\'s start time');
});

test('a release stopped by the time budget counts the docs it didn\'t reach', () => {
  const { exported, sandbox, log } = setup({
    autoApply: 'all',
    students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07'],
      ['VDOE-B', '2345678@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
  });
  const realNow = Date.now;
  const start = realNow();
  // The clock passes the budget once the run has started (the release is its first step).
  let calls = 0;
  sandbox.Date.now = () => (calls++ < 1 ? start : start + exported.ROLLOUT_TIME_BUDGET_MS + 1000);
  try { exported.lessonRollout_({ today: FRI }); } finally { sandbox.Date.now = realNow; }
  const row = log().find((r) => r[4] === 'CONTINUES' && /^release/.test(r[6]));
  assert.ok(row, JSON.stringify(log()));
  assert.equal(row[5], 2);
  assert.ok(!log().some((r) => r[4] === 'PROBLEM' && /time budget|not reached/.test(r[6])));
});

test('a catch-up run doesn\'t check the Canvas export again; the nightly run does', () => {
  const env = setup({ autoApply: 'all', exportAgeDays: 9 });
  env.exported.lessonRollout_({ today: FRI, catchUp: true });
  assert.ok(!env.log().some((r) => /Canvas export/.test(r[6])));
  env.exported.lessonRollout_({ today: FRI });
  assert.equal(env.log().filter((r) => /Canvas export/.test(r[6])).length, 1);
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

test('_casSignalRollout_: what remains of the last day, and the courses still in shadow', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('34b_CasAttentionSignal.js'), S('58_LessonRollout.js')],
    ['_casSignalRollout_']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const now = new Date(2026, 9, 17, 7, 0);
  const quiet = exported._casSignalRollout_(now);
  assert.deepEqual([quiet.status.runs, quiet.status.problems, quiet.shadow], [0, 0, ''], 'no tab yet is quiet');
  const tab = ss.insertSheet('RolloutLog');
  tab.appendRow(['Timestamp', 'Mode', 'Course', 'Lesson', 'Step', 'Count', 'Detail']);
  tab.appendRow([new Date(2026, 9, 15, 21), 'APPLY', '8175', 'CAS-8175-L06', 'PROBLEM', 1, 'enrollment failed: OLD 1']);
  tab.appendRow([new Date(2026, 9, 16, 21), 'APPLY', '8175', 'CAS-8175-L07', 'PROBLEM', 1, 'enrollment failed: NO_MASTER_TEMPLATE 1']);
  tab.appendRow([new Date(2026, 9, 16, 21), 'SHADOW', '8177', 'CAS-8177-X', 'ENROLL', 3, 'y']);
  tab.appendRow([new Date(2026, 9, 16, 21), '-', '-', '-', 'PROBLEM', 9, 'the newest Canvas export is 9 days old; export a fresh one']);
  const ro = exported._casSignalRollout_(now);
  assert.equal(ro.shadow, '8177');
  assert.equal(ro.status.problems, 1, 'the day before is out of the window; the export is a note, not a problem');
  assert.match(ro.status.exportNote, /9 days old/);
});

// ── What the signal counts (58's rolloutDayStatus_, plan L3) ────────────────

const NOW = new Date(2026, 9, 17, 7, 0);
const AT = (h, m) => new Date(2026, 9, 16, h, m || 0); // Friday evening's runs
const STEP = (t, lesson, step, count, detail, mode) =>
  [t, mode || 'APPLY', lesson === '-' ? '-' : lesson.split('-')[1], lesson, step, count, detail || ''];
function status(rows) {
  const { exported } = setup();
  return exported.rolloutDayStatus_(rows, NOW, 24 * 3600 * 1000);
}

test('a continuation a later run finished counts zero, and the day reads "finished"', () => {
  const { exported } = setup();
  const st = status([
    STEP(AT(21), 'CAS-8175-L06', 'ENROLL', 20, 'enrolled (shared now)'),
    STEP(AT(21), 'CAS-8175-L06', 'CONTINUES', 12, 'enrollment stopped at the time budget: 12 student doc(s) left to make; the next run continues'),
    STEP(AT(21), 'CAS-8175-L07', 'CONTINUES', 0, 'enrollment not reached: time budget used; the next run continues'),
    STEP(AT(21, 8), 'CAS-8175-L06', 'ENROLL', 12, 'enrolled (shared now)'),
    STEP(AT(21, 8), 'CAS-8175-L07', 'ENROLL', 30, 'enrolled (shared now)'),
  ]);
  assert.deepEqual([st.runs, st.problems, st.unfinished, st.left], [2, 0, false, 0]);
  assert.deepEqual(exported.rolloutSignalLines_(st), []);
  assert.equal(exported.rolloutFinishedLine_(st), 'Lesson rollout: finished (2 runs)');
});

test('a day that didn\'t finish reports what is left, not problems', () => {
  const { exported } = setup();
  const st = status([
    STEP(AT(21), 'CAS-8175-L06', 'CONTINUES', 30, 'enrollment stopped at the time budget: 30 student doc(s) left to make; the next run continues'),
    STEP(AT(21, 8), 'CAS-8175-L06', 'ENROLL', 18, 'enrolled (shared now)'),
    STEP(AT(21, 8), 'CAS-8175-L06', 'CONTINUES', 12, 'enrollment stopped at the time budget: 12 student doc(s) left to make; the next run continues'),
    STEP(AT(21, 8), 'CAS-8175-L08', 'CONTINUES', 0, 'enrollment not reached: time budget used; the next run continues'),
  ]);
  assert.deepEqual([st.problems, st.unfinished, st.left, st.notReached], [0, true, 12, 1]);
  assert.deepEqual(exported.rolloutSignalLines_(st), ['Lesson rollout didn\'t finish: 12 docs left and 1 step not reached; ' +
    'the next run continues (runLessonRollout() from the editor does the same)']);
  assert.equal(exported.rolloutFinishedLine_(st), '');
});

test('a real problem counts until a later run clears it, and once however many runs repeat it', () => {
  const { exported } = setup();
  const failing = (t) => [STEP(t, 'CAS-8175-L06', 'ENROLL', 0, 'enrolled (shared now)'),
    STEP(t, 'CAS-8175-L06', 'PROBLEM', 1, 'enrollment failed: NO_MASTER_TEMPLATE 1')];
  let st = status(failing(AT(21)).concat(failing(AT(21, 8)), failing(AT(21, 16))));
  assert.equal(st.problems, 1, 'the same problem in three runs is one problem');
  assert.deepEqual(exported.rolloutSignalLines_(st), ['Lesson rollout: 1 problem needs you (see the RolloutLog tab)']);
  st = status(failing(AT(21)).concat([STEP(AT(21, 8), 'CAS-8175-L06', 'ENROLL', 1, 'enrolled (shared now)')]));
  assert.equal(st.problems, 0, 'cleared by a later run that did the step');
  // A run-wide failure clears when the day's latest run doesn't repeat it.
  st = status([STEP(AT(21), '-', 'PROBLEM', 0, 'release failed: Drive down'), STEP(AT(21, 8), 'CAS-8175-L06', 'ENROLL', 1, 'x')]);
  assert.equal(st.problems, 0);
  st = status([STEP(AT(21, 8), 'CAS-8175-L06', 'ENROLL', 1, 'x'), STEP(AT(21, 8), '-', 'PROBLEM', 0, 'release failed: Drive down')]);
  assert.equal(st.problems, 1);
});

test('the stale-export note is said once, however many runs logged it, and never counted', () => {
  const { exported } = setup();
  const st = status([AT(21), AT(21, 8), AT(21, 16)].map((t) =>
    STEP(t, '-', 'PROBLEM', 9, 'the newest Canvas export is 9 days old; export a fresh one')));
  assert.equal(st.problems, 0);
  const lines = exported.rolloutSignalLines_(st);
  assert.deepEqual(lines, ['Lesson rollout: the newest Canvas export is 9 days old; export a fresh one']);
});

test('rows logged before CONTINUES (PROBLEM "...the next run continues") are read as continuations', () => {
  const { exported } = setup();
  // 11-02's shape: each run's budget stops as PROBLEM rows with per-row timestamps.
  const t = (h, m, s) => new Date(2026, 9, 16, h, m, s);
  let st = status([
    STEP(t(21, 0, 5), 'CAS-8175-L06', 'RELEASE', 20, 'shared and opened'),
    STEP(t(21, 0, 5), 'CAS-8175-L06', 'PROBLEM', 0, 'release stopped at the time budget; the next run continues'),
    STEP(t(21, 3, 40), 'CAS-8175-L07', 'PROBLEM', 0, 'enrollment not reached: time budget used; the next run continues'),
    [t(21, 4, 30), 'APPLY', '8175', '-', 'PROBLEM', 0, 'agenda not reached: time budget used; make it from 📅 Lessons'],
    STEP(t(21, 10, 0), 'CAS-8175-L06', 'RELEASE', 30, 'shared and opened'),
    STEP(t(21, 11, 0), 'CAS-8175-L07', 'ENROLL', 30, 'enrolled (shared now)'),
  ]);
  assert.deepEqual([st.problems, st.unfinished, st.notReached], [0, true, 1], 'only the agenda is still not reached');
  assert.match(exported.rolloutSignalLines_(st)[0], /didn't finish: 1 step not reached/);
});

test('a dry run\'s (SHADOW) continuations never say the day didn\'t finish', () => {
  const st = status([STEP(AT(21), 'CAS-8175-L08', 'CONTINUES', 0, 'enrollment not reached: time budget used; the next run continues', 'SHADOW')]);
  assert.deepEqual([st.unfinished, st.problems], [false, 0]);
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

// ── A lesson in parts (68, 2026-10-27) ──────────────────────────────────────
const PARTS_LESSON = '8177-market-research-survey-design';
const PART = (n) => 'CAS-' + PARTS_LESSON.toUpperCase() + '-P' + n;
const PARTS_SCHEDULE = { '8175': [], '8177': [{ key: PARTS_LESSON, start: '2026-10-16' }] };

test('a lesson in parts seeds and enrolls each part; Part 1 is shared on release night, the rest wait unshared', () => {
  const { exported, seedCalls, enrollCalls, shared, ledger } = setup({
    autoApply: 'all', schedule: PARTS_SCHEDULE,
    students: [['VDOE-A1', '1234567@ccpsnet.net', 'SCHEDULED', PART(1)], ['VDOE-A2', '1234567@ccpsnet.net', 'SCHEDULED', PART(2)]],
  });
  exported.lessonRollout_({ today: FRI });
  assert.deepEqual([...seedCalls.find((c) => c.apply).units], [1, 2, 3, 4, 5].map((n) => PARTS_LESSON + '-P' + n));
  const byPart = Object.fromEntries(enrollCalls.map((c) => [c.assignmentConfigId, c.deferShare]));
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => byPart[PART(n)]), [false, true, true, true, true]);
  assert.equal(byPart['CAS-' + PARTS_LESSON.toUpperCase()], undefined, 'the whole lesson is not enrolled');
  assert.deepEqual(shared, [['file-VDOE-A1', '1234567@ccpsnet.net']], 'Part 1 released; Part 2 stays locked');
  assert.deepEqual([2, 3].map((r) => ledger.getRange(r, 13).getValue()), ['ACTIVE', 'SCHEDULED']);
});

test('a lesson students already have whole is never split under them', () => {
  const { exported, seedCalls } = setup({
    autoApply: 'all', schedule: PARTS_SCHEDULE,
    students: [['VDOE-W', '1234567@ccpsnet.net', 'ACTIVE', 'CAS-' + PARTS_LESSON.toUpperCase()]],
  });
  exported.lessonRollout_({ today: FRI });
  assert.deepEqual([...seedCalls.find((c) => c.apply).units], [PARTS_LESSON]);
});

// A lesson held in LessonSchedule's release column (55, 2026-10-28).
const HELD = {
  '8175': [
    { key: '8175-L06', start: '2026-10-14' }, { key: '8175-L07', start: '2026-10-17', hold: true },
    { key: '8175-L08', start: '2026-10-18' },
  ],
  '8177': [{ key: '8177-handbook', start: '2026-10-08', hold: true }],
};

test('a held lesson is planned as held: not seeded, enrolled or released, and logged HOLD', () => {
  const { exported, seedCalls, enrollCalls, shared, ledger, log } = setup({
    autoApply: 'all', schedule: HELD,
    students: [['VDOE-A', '1234567@ccpsnet.net', 'SCHEDULED', 'CAS-8175-L07']],
  });
  const plan = exported._lrPlan_(FRI);
  assert.deepEqual(plan['8175'].lessons.map((l) => l.key), ['8175-L06', '8175-L08']);
  assert.deepEqual(plan['8175'].held.map((l) => l.key), ['8175-L07']);
  assert.deepEqual(plan['8177'].lessons.map((l) => l.key), [], 'a course with only a held lesson stays in the plan');
  exported.lessonRollout_({ today: FRI });
  const units = seedCalls.flatMap((c) => [...c.units]);
  assert.ok(!units.includes('8175-L07') && !units.includes('8177-handbook'));
  assert.ok(!enrollCalls.some((c) => c.assignmentConfigId === 'CAS-8175-L07' || c.assignmentConfigId === 'CAS-8177-HANDBOOK'));
  assert.deepEqual(shared, [], 'its SCHEDULED docs are not shared');
  assert.equal(ledger.getRange(2, 13).getValue(), 'SCHEDULED');
  const holds = log().filter((r) => r[4] === 'HOLD').map((r) => [r[1], r[2], r[3]]);
  assert.deepEqual(holds, [['APPLY', '8175', 'CAS-8175-L07'], ['APPLY', '8177', 'CAS-8177-HANDBOOK']]);
});

// ── Catching up (2026-10-29) ─────────────────────────────────────────────────
// A run made about 20 docs; on 10-27 and 10-28 one 8175 lesson used every
// run and 8177's current lesson got none.

test('enrollment order: tonight\'s releases first, the courses taking turns', () => {
  const { exported } = setup();
  const plan = {
    '8175': { lessons: [{ key: '8175-L10', releaseNow: true }, { key: '8175-L11', releaseNow: false }], held: [] },
    '8177': { lessons: [{ key: '8177-x', releaseNow: true, parts: [{ key: '8177-x-P1', n: 1 }, { key: '8177-x-P2', n: 2 }] }], held: [] },
  };
  assert.deepEqual(exported._lrEnrollOrder_(plan).map((t) => [t.key, t.releaseNow]),
    [['8175-L10', true], ['8177-x-P1', true], ['8175-L11', false], ['8177-x-P2', false]]);
});

test('each lesson gets a share of the time left; the lesson docs keep a reserve', () => {
  const { exported, enrollCalls } = setup({ autoApply: 'all' });
  const before = Date.now();
  exported.lessonRollout_({ today: FRI });
  const end = before + exported.ROLLOUT_TIME_BUDGET_MS - exported.ROLLOUT_DOCS_RESERVE_MS;
  assert.equal(enrollCalls.length, 4);
  assert.deepEqual(enrollCalls.map((c) => c.assignmentConfigId),
    ['CAS-8175-L06', 'CAS-8177-HANDBOOK', 'CAS-8175-L07', 'CAS-8175-L08'], '8177 is not behind every 8175 lesson');
  const first = enrollCalls[0].deadline - before;
  assert.ok(first <= (end - before) / 4 + 1000, 'the first of four gets about a quarter: ' + first);
  assert.ok(enrollCalls.every((c) => c.deadline <= end + 1000));
});

function catchUps(sandbox) {
  return sandbox.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'runLessonRolloutCatchUp');
}

test('a run that stops short schedules one catch-up; the catch-up removes its trigger and schedules the next', () => {
  const { exported, sandbox } = setup({ autoApply: 'all', enrollResult: () => ({ timedOut: true }) });
  const res = exported.runLessonRollout();
  assert.equal(res.unfinished, true);
  assert.equal(catchUps(sandbox).length, 1);
  assert.ok(catchUps(sandbox)[0].__calls.some((c) => c.method === 'after'));
  exported.runLessonRollout();
  assert.equal(catchUps(sandbox).length, 1, 'never two pending');

  const first = catchUps(sandbox)[0];
  exported.runLessonRolloutCatchUp();
  assert.equal(catchUps(sandbox).length, 1);
  assert.notEqual(catchUps(sandbox)[0], first, 'its own trigger removed, a new one made');
  const props = sandbox.PropertiesService.getScriptProperties();
  assert.equal(JSON.parse(props.getProperty('ROLLOUT_CATCHUP')).count, 2);
  assert.equal(props.getProperty('ROLLOUT_BUSY_UNTIL'), null, 'the busy mark is cleared');
});

test('catch-ups stop at the daily cap; a run that finishes clears the count', () => {
  const env = setup({ autoApply: 'all', enrollResult: () => ({ timedOut: true }) });
  const props = env.sandbox.PropertiesService.getScriptProperties();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  props.setProperty('ROLLOUT_CATCHUP', JSON.stringify({ day, count: env.exported.ROLLOUT_CATCHUP_MAX }));
  env.exported.runLessonRollout();
  assert.equal(catchUps(env.sandbox).length, 0);

  const ok = setup({ autoApply: 'all' });
  const p2 = ok.sandbox.PropertiesService.getScriptProperties();
  p2.setProperty('ROLLOUT_CATCHUP', JSON.stringify({ day, count: 3 }));
  assert.equal(ok.exported.runLessonRollout().unfinished, false);
  assert.equal(p2.getProperty('ROLLOUT_CATCHUP'), null);
  assert.equal(catchUps(ok.sandbox).length, 0);
});

test('a run while another is going does nothing but schedule a catch-up; a preview never schedules one', () => {
  const env = setup({ autoApply: 'all', enrollResult: () => ({ timedOut: true }) });
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ROLLOUT_BUSY_UNTIL', String(Date.now() + 60000));
  const res = env.exported.runLessonRollout();
  assert.equal(res.busy, true);
  assert.equal(env.enrollCalls.length, 0);
  assert.equal(catchUps(env.sandbox).length, 1);

  const pv = setup({ autoApply: 'all', enrollResult: () => ({ timedOut: true }) });
  assert.equal(pv.exported.previewLessonRollout().unfinished, false);
  assert.equal(catchUps(pv.sandbox).length, 0);
});


// ── Step 5: the Covered So Far docs (76, plan L6) ────────────────────────────

test('each run but a preview keeps the Covered So Far docs current; a failure is a PROBLEM row, never a stopped run', () => {
  const { exported, sandbox, log } = setup({ autoApply: '8175' });
  const calls = [];
  sandbox.writeCoveredSoFar_ = (o) => {
    calls.push(o);
    return [{ course: '8175', taught: 3, written: true, created: true, error: '' },
      { course: '8177', taught: 1, written: false, created: false, error: '' }];
  };
  exported.lessonRollout_({ today: FRI });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].today.getTime(), FRI.getTime());
  const covered = log().filter((r) => r[4] === 'COVERED_SO_FAR');
  assert.deepEqual(covered.map((r) => [r[1], r[2], r[5], r[6]]),
    [['APPLY', '8175', 3, 'doc made: 3 lesson(s) taught so far']], 'an unchanged doc logs nothing');

  exported.previewLessonRollout();
  assert.equal(calls.length, 1, 'a preview writes no doc');

  sandbox.writeCoveredSoFar_ = () => [{ course: '8177', taught: 0, written: false, created: false, error: 'Docs down' }];
  const res = exported.lessonRollout_({ today: FRI });
  const problem = res.rows.find((r) => r[4] === 'PROBLEM' && /^Covered So Far/.test(r[6]));
  assert.deepEqual([problem[1], problem[2], problem[6]], ['SHADOW', '8177', 'Covered So Far doc not written: Docs down']);
  assert.ok(res.rows.some((r) => r[4] === 'RELEASE' || r[4] === 'ENROLL'), 'the rest of the run went ahead');

  sandbox.writeCoveredSoFar_ = () => { throw new Error('boom'); };
  const thrown = exported.lessonRollout_({ today: FRI });
  assert.ok(thrown.rows.some((r) => r[4] === 'PROBLEM' && r[6] === 'Covered So Far docs failed: boom'));
});
