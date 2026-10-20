'use strict';
// Splitting one period into two groups that meet on alternate days
// (2026-10-19: period 3 became "3-Odd" and "3-Even", two cross-listed Canvas
// sections). A text period label works through the queue builder's period
// matching (24); applyPeriodRelabel() (52) moves students already enrolled
// to their section's new period; retireOffDayWarmUps() (24) sets warm-ups
// queued for a day the student's period doesn't meet to NOT_MEETING, and
// 34c leaves them out of its counts.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'owner.teacher@ccpsnet.net';
const MKT = 'Sports Entertainment and Event Marketing';
const MGT = 'Sports Entertainment and Event Management';

const SCHEDULE = [
  [TEACHER, '1', 'DAILY', MGT, 'TRUE'],
  [TEACHER, '1', 'DAILY', MKT, 'TRUE'],
  [TEACHER, '3-Odd', 'ODD', MGT, 'TRUE'],
  [TEACHER, '3-Odd', 'ODD', MKT, 'TRUE'],
  [TEACHER, '3-Even', 'EVEN', MGT, 'TRUE'],
  [TEACHER, '3-Even', 'EVEN', MKT, 'TRUE'],
];

function ledgerRow(account, period, course, status) {
  return [new Date(), account, 'VDOE-' + account.slice(0, 7), 'file-' + account.slice(0, 7), 'Student', period,
    course, 'Mr. Owner', TEACHER, course, course, period, status || 'ACTIVE', '', '', '', '', '', '2026-27'];
}

test('a text period label matches in the queue builder: meeting periods, enrolled students, the lesson key', () => {
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('22_LessonContextHandler.js'),
    S('23_StudentProfileManager.js'), S('24_WarmUpBridge.js')],
  ['getPeriodsForDay_', 'getEnrolledStudents_', 'lessonPeriodKey_', 'sharedPeriods_']);
  const schedule = [['teacher_email', 'period', 'day_type', 'course_name', 'active']].concat(SCHEDULE);
  const periods = (t) => [...new Set(exported.getPeriodsForDay_(schedule, TEACHER, t).map((p) => p.period))];
  assert.deepEqual(periods('ODD'), ['1', '3-Odd']);
  // A retired row with a typed FALSE (Sheets stores the boolean false) is skipped; a blank one is active.
  const retired = schedule.concat([[TEACHER, '3', 'DAILY', MGT, false], [TEACHER, '5', 'DAILY', MGT, '']]);
  assert.deepEqual([...new Set(exported.getPeriodsForDay_(retired, TEACHER, 'ODD').map((p) => p.period))],
    ['1', '3-Odd', '5']);
  assert.deepEqual(periods('EVEN'), ['1', '3-Even']);

  const ledger = [new Array(19).fill('h'),
    ledgerRow('1000001@ccpsnet.net', '3-Odd', MKT), ledgerRow('1000002@ccpsnet.net', '3-Even', MKT)];
  assert.deepEqual(exported.getEnrolledStudents_(ledger, TEACHER, '3-Odd', '2026-27', '8175').map((s) => s.email),
    ['1000001@ccpsnet.net']);
  const shared = exported.sharedPeriods_(exported.getPeriodsForDay_(schedule, TEACHER, 'ODD'));
  assert.equal(exported.lessonPeriodKey_('3-Odd', MKT, shared.has('3-Odd')), '3-Odd (8175)');
});

const GRADEBOOK = [
  'Student,ID,SIS User ID,SIS Login ID,Section,Current Score',
  '"A, One",1,S1,1000001,SPORTS MARKETING ODD [74-C8175H-P03],90',
  '"B, Two",2,S2,1000002,SPORTS MARKETING EVEN [74-C8175H-P03],80',
  '"C, Three",3,S3,1000003,SPORTS MANAGEMENT [74-C8177H-P01],70',
].join('\n');

// A plain export: Canvas can't tell period 3's odd-day and even-day groups apart.
const PLAIN_GRADEBOOK = [
  'Student,ID,SIS User ID,SIS Login ID,Section,Current Score',
  '"A, One",1,S1,1000001,SPORTS MARKETING [74-C8175H-P03],90',
  '"B, Two",2,S2,1000002,SPORTS MARKETING [74-C8175H-P03],80',
  '"C, Three",3,S3,1000003,SPORTS MANAGEMENT [74-C8177H-P01],70',
].join('\n');

function rosterSetup(opts) {
  opts = opts || {};
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('29_StudentContextAggregator.js'),
    S('02_Form1_IntakeAndWorkspaceGenerator.js'), S('51_CourseYearBuilder.js'), S('52_CanvasRosterImport.js'),
    S('54_StudentAssignments.js')], ['previewPeriodRelabel', 'applyPeriodRelabel', 'previewPeriodOverrideSeed',
    'seedPeriodOverrides']);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('CURRENT_TERM', '2026-27');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());
  folder.addFile({ getName: () => '2026-10-19_Grades-8175.csv', getLastUpdated: () => new Date(),
    getBlob: () => ({ getDataAsString: () => opts.gradebook || GRADEBOOK }) });
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(19).fill('h'));
  const p3 = opts.relabeled ? ['3-Odd', '3-Even'] : ['3', '3'];
  ledger.appendRow(ledgerRow('1000001@ccpsnet.net', p3[0], MKT));
  ledger.appendRow(ledgerRow('1000002@ccpsnet.net', p3[1], MKT));
  ledger.appendRow(ledgerRow('1000003@ccpsnet.net', '1', MGT));
  ledger.appendRow(ledgerRow('1000009@ccpsnet.net', '3', MKT)); // left the course
  const map = ss.insertSheet('CanvasSectionMap');
  map.appendRow(['canvas_section', 'period']);
  map.appendRow(['SPORTS MARKETING ODD [74-C8175H-P03]', '3-Odd']);
  map.appendRow(['SPORTS MARKETING EVEN [74-C8175H-P03]', '3-Even']);
  map.appendRow(['SPORTS MANAGEMENT [74-C8177H-P01]', '1']);
  if (opts.overrides) {
    const o = ss.insertSheet('PeriodOverride');
    o.appendRow(['student_account', 'period']);
    opts.overrides.forEach((r) => o.appendRow(r));
  }
  return { exported, ledger, ss, sandbox };
}

test('applyPeriodRelabel moves enrolled students to their section\'s new period; a preview changes nothing', () => {
  const { exported, ledger } = rosterSetup();
  const periods = () => ledger.getRange(2, 1, 4, 12).getValues().map((r) => [r[5], r[11]]);

  const preview = exported.previewPeriodRelabel();
  assert.equal(preview.changed, 2);
  assert.deepEqual(preview.moves, { '3 → 3-Odd': 1, '3 → 3-Even': 1 });
  assert.equal(preview.notInCanvas, 1);
  assert.deepEqual(periods(), [['3', '3'], ['3', '3'], ['1', '1'], ['3', '3']]);

  const applied = exported.applyPeriodRelabel();
  assert.equal(applied.changed, 2);
  assert.deepEqual(periods(), [['3-Odd', '3-Odd'], ['3-Even', '3-Even'], ['1', '1'], ['3', '3']]);
  assert.equal(exported.applyPeriodRelabel().changed, 0, 'a second run changes nothing');
});

test('seedPeriodOverrides lists the students whose Ledger period their section code doesn\'t give; counts only', () => {
  const { exported, ss, sandbox } = rosterSetup({ relabeled: true });
  const logs = [];
  sandbox.Logger.log = (m) => logs.push(String(m));
  const preview = exported.previewPeriodOverrideSeed();
  assert.equal(preview.added, 2);
  assert.deepEqual(preview.byPeriod, { '3-Even': 1, '3-Odd': 1 });
  assert.equal(ss.getSheetByName('PeriodOverride'), null, 'a preview writes nothing');

  exported.seedPeriodOverrides();
  const tab = ss.getSheetByName('PeriodOverride');
  assert.deepEqual(tab.getRange(1, 1, tab.getLastRow(), 2).getValues(), [
    ['student_account', 'period'], ['1000001@ccpsnet.net', '3-Odd'], ['1000002@ccpsnet.net', '3-Even']]);
  const again = exported.seedPeriodOverrides();
  assert.deepEqual([again.added, again.alreadyListed, again.disagree], [0, 2, 0], 'a second run adds nothing');
  assert.ok(!logs.some((l) => /@ccpsnet\.net|1000001/.test(l)), logs.join('\n'));
});

test('a row already in PeriodOverride is never changed by the seed', () => {
  const { exported, ss } = rosterSetup({ relabeled: true, overrides: [['1000001@ccpsnet.net', '3-Even']] });
  const r = exported.seedPeriodOverrides();
  assert.deepEqual([r.added, r.disagree], [1, 1]);
  const tab = ss.getSheetByName('PeriodOverride');
  assert.deepEqual(tab.getRange(2, 1, 2, 2).getValues(),
    [['1000001@ccpsnet.net', '3-Even'], ['1000002@ccpsnet.net', '3-Even']]);
});

test('with PeriodOverride, a plain export no longer moves period 3 back to "3"', () => {
  const unguarded = rosterSetup({ relabeled: true, gradebook: PLAIN_GRADEBOOK });
  assert.deepEqual(unguarded.exported.previewPeriodRelabel().moves, { '3-Odd → 3': 1, '3-Even → 3': 1 },
    'the hazard the tab removes');

  const { exported, ledger } = rosterSetup({ relabeled: true, gradebook: PLAIN_GRADEBOOK,
    overrides: [['1000001@ccpsnet.net', '3-Odd'], [' 1000002@CCPSNET.NET ', '3-Even']] });
  const r = exported.applyPeriodRelabel();
  assert.deepEqual([r.changed, r.unchanged], [0, 3]);
  assert.deepEqual(ledger.getRange(2, 12, 2, 1).getValues(), [['3-Odd'], ['3-Even']]);
});

function retireSetup() {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('22_LessonContextHandler.js'),
    S('23_StudentProfileManager.js'), S('24_WarmUpBridge.js')],
  ['previewOffDayWarmUps', 'retireOffDayWarmUps', 'WQ24_COL_COUNT', 'WQ24_STATUS', 'WTB_HEADERS', 'WTB']);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('CURRENT_TERM', '2026-27');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const cs = ss.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  SCHEDULE.forEach((r) => cs.appendRow(r));
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(19).fill('h'));
  ledger.appendRow(ledgerRow('1000001@ccpsnet.net', '3-Odd', MKT));
  ledger.appendRow(ledgerRow('1000002@ccpsnet.net', '3-Even', MKT));
  ledger.appendRow(ledgerRow('1000003@ccpsnet.net', '1', MGT));
  ledger.appendRow(ledgerRow('1000004@ccpsnet.net', '7', MGT)); // not in ClassSchedule
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('h'));
  const tb = ss.insertSheet('WarmUpTextBox');
  tb.appendRow(exported.WTB_HEADERS);
  let n = 0;
  const queue = (account, date, status, answer) => {
    const row = new Array(exported.WQ24_COL_COUNT).fill('');
    row[0] = 'Q' + (++n); row[4] = account; row[5] = date; row[8] = status;
    wq.appendRow(row);
    if (answer !== undefined) {
      const t = new Array(exported.WTB_HEADERS.length).fill('');
      t[exported.WTB.QUEUE_ID] = row[0]; t[exported.WTB.RESPONSE] = answer;
      tb.appendRow(t);
    }
  };
  // Mon Oct 19 is ODD, Tue Oct 20 EVEN.
  queue('1000001@ccpsnet.net', '2026-10-19', 'DELIVERED', '');       // 3-Odd on an odd day: keep
  queue('1000002@ccpsnet.net', '2026-10-19', 'DELIVERED', '');       // 3-Even on an odd day: retire
  queue('1000001@ccpsnet.net', '2026-10-20', 'PENDING');             // 3-Odd on an even day: retire
  queue('1000001@ccpsnet.net', '2026-10-20', 'DELIVERED', 'An answer'); // 3-Odd off day, answered: keep
  queue('1000003@ccpsnet.net', '2026-10-20', 'DELIVERED', '');       // period 1 is DAILY: keep
  queue('1000004@ccpsnet.net', '2026-10-20', 'DELIVERED', '');       // unknown period: leave
  queue('1000002@ccpsnet.net', '2026-10-15', 'SCORED');              // already scored: not checked
  return { exported, wq };
}

test('retireOffDayWarmUps sets off-day warm-ups NOT_MEETING, keeps answered and DAILY ones', () => {
  const { exported, wq } = retireSetup();
  const statuses = () => wq.getRange(2, exported.WQ24_STATUS + 1, 7, 1).getValues().map((r) => r[0]);
  const preview = exported.previewOffDayWarmUps();
  assert.deepEqual([preview.checked, preview.retired, preview.answeredKept, preview.unknownPeriod], [6, 2, 1, 1]);
  assert.equal(statuses()[1], 'DELIVERED', 'a preview changes nothing');

  exported.retireOffDayWarmUps();
  assert.deepEqual(statuses(),
    ['DELIVERED', 'NOT_MEETING', 'NOT_MEETING', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'SCORED']);
  assert.equal(exported.retireOffDayWarmUps().retired, 0, 'a second run changes nothing');
});

test('34c leaves NOT_MEETING warm-ups out of today\'s count', () => {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('34c_OvernightHealth.js'),
    S('43_DeployVersionMarker_CentralLedger.js')], ['overnightHealth_']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  const now = new Date('2026-10-19T10:00:00Z');
  ['M2_STAGE1_LAST_RUN', 'M2_STAGE1B_LAST_RUN', 'M2_STAGE2_LAST_RUN', 'M2_STAGE3_LAST_RUN']
    .forEach((k) => props.setProperty(k, new Date(now.getTime() - 3 * 3600 * 1000).toISOString()));
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(['queue_id', 'lesson_id', 'student_email', 'student_name', 'google_id', 'lesson_date',
    'lesson_context_snapshot', 'student_profile_snapshot', 'status']);
  wq.appendRow(['Q1', 'L', 's', 'S', 's', '2026-10-19', '{}', '{}', 'DELIVERED']);
  wq.appendRow(['Q2', 'L', 's', 'S', 's', '2026-10-19', '{}', '{}', 'NOT_MEETING']);
  const h = env.exported.overnightHealth_(now);
  assert.deepEqual(h.problems, []);
  assert.match(h.allClear, /Today's warm-ups: 1 of 1 delivered/);
});
