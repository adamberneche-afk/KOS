'use strict';
// Regression tests for 36_WeeklyParentReport.js.
//
// The first two tests are the reason this file exists. This is the only
// code path in cas-ccps that sends student data outside the school's
// Workspace domain, and the rule that makes that acceptable is narrow: only
// values a teacher actually decided may leave. The system already settled
// the narrower version of that question in
// 01_StudentDoc_ContainerScript.js's PENDING_TEACHER_REVIEW branch, which
// shows the *student* no number at all because "nothing is final until the
// teacher confirms or overrides it." These tests pin the same rule for the
// parent-facing path the way student-context-aggregator.test.js pins its
// own FERPA redaction fix — permanently, and by behaviour rather than by
// comment.
//
// Loaded alongside 00_SharedConfig.js (for getConfig_, LEDGER, SCRDL) and
// 29_StudentContextAggregator.js (for getWeeklyAssignments_ and
// _studentIdPattern_), matching how those three sit in one GAS project
// scope — see tools/gas-lint/project-map.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = [
  path.join(SCRIPTS, '00_SharedConfig.js'),
  path.join(SCRIPTS, '29_StudentContextAggregator.js'),
  path.join(SCRIPTS, '36_WeeklyParentReport.js'),
  // Lesson titles and competency text (55b is in both of 36's projects).
  path.join(SCRIPTS, '55b_LessonAssignmentData.js'),
];

const EXPORTS = ['_parentReportsPastFor_', 
  'generateWeeklyParentReports',
  'recordParentReportCopied',
  'weeklyParentReportSubject_',
  'buildWeeklyParentReport_',
  'renderWeeklyParentReportText_',
  'runWeeklyParentReportPrep',
  'installWeeklyParentReportTrigger',
  '_archiveExpiredParentReports_',
  '_countParentReportsPastRetentionUnarchived_',
  '_weekWindow_',
  'PARENT_REPORT_LOG_HEADERS',
];

function load() {
  return loadGasFiles(PATHS, EXPORTS);
}

// A Ledger row wide enough to include the turn-in review columns (20-23),
// which is the whole point here: suggestedScore and finalScore live there
// and the distinction between them is what these tests are about.
function ledgerRow(sandbox, opts) {
  const row = new Array(23).fill('');
  row[0] = opts.timestamp;                              // Timestamp
  row[1] = opts.googleId;                               // GoogleID
  row[2] = opts.configId || 'CFG-1';                    // ConfigID
  row[4] = opts.name || '';                             // StudentName
  row[8] = opts.teacherEmail || 'teacher@ccpsnet.net';  // TeacherEmail
  row[10] = opts.courseName || 'Marketing';             // CourseName
  row[12] = opts.status || 'SUBMITTED';                 // Status
  row[13] = opts.submissionTs === undefined ? opts.timestamp : opts.submissionTs;
  row[19] = opts.suggestedScore === undefined ? '' : opts.suggestedScore;
  row[20] = opts.finalScore === undefined ? '' : opts.finalScore;
  row[21] = opts.decidedBy || '';
  row[22] = opts.decidedAt || '';
  return row;
}

function scrRow(opts) {
  return [
    opts.decisionId || 'dec-1',
    opts.studentEmail,
    opts.competencyId,
    opts.suggestedRating === undefined ? '' : opts.suggestedRating,
    opts.finalRating === undefined ? '' : opts.finalRating,
    opts.decisionType || 'CONFIRMED',
    opts.decidedAt || null,
    opts.decidedBy || 'teacher@ccpsnet.net',
    opts.evidence || '',
    opts.archiveStatus || '',
  ];
}

// Builds a fixture inside the week the sandbox's own "now" falls in, so the
// week window under test always contains the rows.
function setUpFixture(sandbox, exported, opts) {
  const options = opts || {};
  const D = sandbox.Date;
  const now = new D(2026, 2, 4, 12, 0, 0);   // Wed 4 Mar 2026
  const inWeek = new D(2026, 2, 3, 9, 0, 0); // Tue 3 Mar 2026

  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  // Reports are scoped to the dashboard's own teacher (access policy).
  props.setProperty('TEACHER_EMAIL', (opts && opts.teacherEmail) || 'teacher@ccpsnet.net');

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  (options.ledgerRows || []).forEach((r) => ledger.appendRow(r(sandbox, inWeek)));

  const scr = ss.insertSheet('SCRDecisionLog');
  scr.appendRow([
    'decision_id', 'student_email', 'competency_id', 'suggested_rating',
    'final_rating', 'decision_type', 'decided_at', 'decided_by',
    'evidence_snapshot', 'archive_status',
  ]);
  (options.scrRows || []).forEach((r) => scr.appendRow(r));

  return { ss, ledger, scr, now, inWeek };
}

// ── The disclosure rule ──────────────────────────────────────────────────

test('an item with only a suggested score prints no number and counts as pending', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        // The AI proposed 4. No teacher has acted on it.
        suggestedScore: 4,
      }),
    ],
  });

  const out = exported.generateWeeklyParentReports(fx.now);
  assert.equal(out.reports.length, 1);
  const report = out.reports[0];

  assert.equal(report.thisWeek.length, 1);
  assert.equal(report.thisWeek[0].score, null,
    'a suggested-only item must carry no score for the renderer to print');
  assert.equal(report.confirmedCount, 0);
  assert.equal(report.pendingCount, 1);

  const body = exported.renderWeeklyParentReportText_(report);
  assert.ok(!/\b4\b/.test(body.split('Week of')[1] || body),
    'the suggested value 4 must not appear anywhere in the rendered body');
  assert.match(body, /Turned in; waiting for feedback/, 'the item says where the work stands instead');
});

test('an item with a confirmed score prints that number', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        suggestedScore: 4, finalScore: 3, decidedBy: 'teacher@ccpsnet.net',
      }),
    ],
  });

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  assert.equal(report.thisWeek[0].score, 3);
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.pendingCount, 0);

  const body = exported.renderWeeklyParentReportText_(report);
  assert.match(body, /Teacher's score: 3 out of 5/);
  // The teacher overrode 4 down to 3. Only the decision may be shown.
  assert.ok(!/score: 4/.test(body), 'the overridden suggestion must not appear');
});

test('a confirmed score of zero is reported as a score, not as pending', () => {
  // `cell || null` would turn a real 0 into "awaiting review" — the exact
  // slip _turnInScoreOrNull_ exists to prevent, and the one that would
  // misinform a parent in the direction that matters.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', finalScore: 0,
      }),
    ],
  });

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  assert.equal(report.thisWeek[0].score, 0);
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.pendingCount, 0);
  assert.match(exported.renderWeeklyParentReportText_(report), /Teacher's score: 0 out of 5/);
});

test('work assigned this week but never submitted still appears', () => {
  // getWeeklyAssignments_ falls back to Timestamp when SubmissionTS is
  // blank. Without that, unsubmitted work would be invisible — which is
  // precisely what a parent most needs to see.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        status: 'PENDING', submissionTs: '',
      }),
    ],
  });

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  assert.equal(report.thisWeek.length, 1);
  assert.equal(report.thisWeek[0].status, 'PENDING');
  assert.equal(report.thisWeek[0].score, null);
  assert.equal(report.pendingCount, 1);
  const body = exported.renderWeeklyParentReportText_(report);
  assert.match(body, /Marketing \([^)]*\): Not turned in yet/);
  assert.match(body, /WHAT TO DO THIS WEEK\n  Ask Alice to finish: Marketing\./);
});

// ── The competency section ───────────────────────────────────────────────

test('only SCRDecisionLog feeds the progress section, and archived rows are excluded', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
    scrRows: [
      scrRow({ decisionId: 'd1', studentEmail: '1234567@ccpsnet.net', competencyId: 'COMP-A',
        finalRating: 2, decidedAt: new D(2026, 1, 1) }),
      // Past retention — restricted pending disposition, so not for a parent.
      scrRow({ decisionId: 'd2', studentEmail: '1234567@ccpsnet.net', competencyId: 'COMP-B',
        finalRating: 5, decidedAt: new D(2026, 1, 1),
        archiveStatus: 'ARCHIVED — pending disposition review' }),
      // A decision row with no final_rating is not a decision.
      scrRow({ decisionId: 'd3', studentEmail: '1234567@ccpsnet.net', competencyId: 'COMP-C',
        suggestedRating: 3, finalRating: '', decidedAt: new D(2026, 1, 1) }),
    ],
  });

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  const ids = report.progress.map((p) => p.competencyId);
  assert.deepEqual(ids, ['COMP-A']);

  const body = exported.renderWeeklyParentReportText_(report);
  assert.match(body, /COMP-A: 2/);
  assert.ok(!/COMP-B/.test(body), 'an archived decision must not reach a parent');
  assert.ok(!/COMP-C/.test(body), 'a row with no final rating is not a decision');
});

test('the latest decision per competency wins', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
    scrRows: [
      scrRow({ decisionId: 'd1', studentEmail: '1234567@ccpsnet.net', competencyId: 'COMP-A',
        finalRating: 4, decidedAt: new D(2026, 0, 5) }),
      scrRow({ decisionId: 'd2', studentEmail: '1234567@ccpsnet.net', competencyId: 'COMP-A',
        finalRating: 2, decidedAt: new D(2026, 1, 20) }),
    ],
  });

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  assert.equal(report.progress.length, 1);
  assert.equal(report.progress[0].rating, 2);
});

test('the progress section is labelled cumulative, not weekly', () => {
  // SCRSuggestions/SCRDecisionLog have no week dimension — Script 30
  // deliberately never windows. A parent reading a term-long rating as this
  // week's result is the misreading this label exists to prevent.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });
  const body = exported.renderWeeklyParentReportText_(
    exported.generateWeeklyParentReports(fx.now).reports[0]);
  assert.match(body, /PROGRESS SO FAR THIS TERM/);
  assert.match(body, /not just this week/);
});

// ── Copied, not sent (D1, 2026-10-23) ─────────────────────────────────────

test('copying a report records when and by whom, never a recipient, and sends nothing', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice Smith', finalScore: 3 }),
    ],
  });

  const res = exported.recordParentReportCopied('1234567@ccpsnet.net', fx.now);
  assert.equal(res.success, true);
  assert.equal(sandbox.MailApp.getSentMessages().length, 0, 'KOS never emails a family');

  const rows = fx.ss.getSheetByName('ParentReportLog').getDataRange().getValues();
  assert.deepEqual(rows[0].slice(5, 9), ['recipient_address', 'generated_at', 'copied_at', 'copied_by']);
  assert.equal(rows.length, 2, 'header + one row');
  assert.equal(rows[1][1], '1234567@ccpsnet.net');
  assert.equal(rows[1][5], '', 'the teacher chooses the recipients; they are not recorded');
  assert.ok(rows[1][7], 'copied_at is stamped');
  assert.deepEqual(rows[0].slice(12, 14), ['report_subject', 'report_text']);
  assert.match(rows[1][12], /Alice/, 'the subject as copied');
  assert.match(rows[1][13], /Alice/, 'the report text as copied');
});

test('copying again updates the same row, and a prepared row is reused', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('PARENT_REPORT_PREP', 'all');
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [(sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' })],
  });
  exported.runWeeklyParentReportPrep(fx.now);
  exported.recordParentReportCopied('1234567@ccpsnet.net', fx.now);
  exported.recordParentReportCopied('1234567@ccpsnet.net', new sandbox.Date(fx.now.getTime() + 60000));
  const rows = fx.ss.getSheetByName('ParentReportLog').getDataRange().getValues();
  assert.equal(rows.length, 2, 'one row per student per week');
  assert.ok(rows[1][7], 'copied_at is set on the prepared row');
});

test('the text the dashboard copied is kept; past weeks come back newest first, this week and archived rows left out', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [(sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' })],
  });
  exported.recordParentReportCopied('1234567@ccpsnet.net', fx.now, { subject: 'S now', text: 'T now' });
  const sheet = fx.ss.getSheetByName('ParentReportLog');
  const D = (y, m, d) => new sandbox.Date(y, m, d);
  const add = (ws, text, archived) => sheet.appendRow(['id', '1234567@ccpsnet.net', 'Alice', ws, D(2026, 0, 1), '', ws, ws, 't',
    0, 0, archived || '', 'S ' + text, text]);
  add(D(2026, 1, 9), 'feb 9');
  add(D(2026, 1, 23), 'feb 23');
  add(D(2026, 1, 16), 'archived', 'ARCHIVED — pending disposition review');
  sheet.appendRow(['id', '1234567@ccpsnet.net', 'Alice', D(2026, 1, 2), '', '', D(2026, 1, 2), '', '', 0, 0, '', '', '']);
  const rows = sheet.getDataRange().getValues();
  assert.deepEqual(rows[1].slice(12, 14), ['S now', 'T now']);
  const past = exported._parentReportsPastFor_({ ledgerSsId: fx.ss.getId(), tabs: { parentReportLog: 'ParentReportLog' } },
    '1234567@ccpsnet.net', rows[1][3]);
  assert.deepEqual(past.map((p) => p.text), ['feb 23', 'feb 9'], 'not this week, not archived, not a row never copied');
  assert.equal(past[0].subject, 'S feb 23');
});

test('a student with no report this week cannot be recorded as copied', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [(sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' })],
  });
  assert.equal(exported.recordParentReportCopied('7654321@ccpsnet.net', fx.now).success, false);
});

// ── Prepare-only paths never send ────────────────────────────────────────

test('generateWeeklyParentReports sends nothing', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });
  exported.generateWeeklyParentReports(fx.now);
  assert.equal(sandbox.MailApp.getSentMessages().length, 0);
});

test('the weekly trigger prepares rows with no recipient and no sent_at', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('PARENT_REPORT_PREP', 'all');
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });

  const res = exported.runWeeklyParentReportPrep(fx.now);
  assert.equal(res.prepared, 1);
  assert.equal(sandbox.MailApp.getSentMessages().length, 0,
    'nothing on a timer may ever email a parent');

  const rows = fx.ss.getSheetByName('ParentReportLog').getDataRange().getValues();
  assert.equal(rows[1][5], '', 'recipient_address is never recorded');
  assert.equal(rows[1][7], '', 'copied_at is empty until the teacher copies it');
});

test('the weekly trigger is idempotent within a week', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('PARENT_REPORT_PREP', 'all');
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });
  exported.runWeeklyParentReportPrep(fx.now);
  const second = exported.runWeeklyParentReportPrep(fx.now);
  assert.equal(second.prepared, 0);
  assert.equal(fx.ss.getSheetByName('ParentReportLog').getDataRange().getValues().length, 2);
});

test('the weekly trigger prepares nothing while ⚙ Settings has it off, and only the courses it is on for', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', courseName: 'Sports and Entertainment Marketing' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '2345678@ccpsnet.net', name: 'Bob', courseName: 'Entrepreneurship 8177' }),
    ],
  });
  const res = exported.runWeeklyParentReportPrep(fx.now);
  assert.equal(res.prepared, 0);
  assert.equal(res.off, true);
  assert.equal(fx.ss.getSheetByName('ParentReportLog'), null, 'off writes nothing, not even the tab');

  sandbox.PropertiesService.getScriptProperties().setProperty('PARENT_REPORT_PREP', '8177');
  assert.equal(exported.runWeeklyParentReportPrep(fx.now).prepared, 1);
  const rows = fx.ss.getSheetByName('ParentReportLog').getDataRange().getValues();
  assert.deepEqual(rows.slice(1).map((r) => r[1]), ['2345678@ccpsnet.net'], 'only the 8177 student');
});

// ── Excluded students ────────────────────────────────────────────────────

test('students failing the ID pattern are counted, not silently dropped', () => {
  // _studentIdPattern_ skips anything not matching ^\d{7}@ccpsnet\.net$.
  // In the aggregator that is a skipped row; here it is a family that never
  // hears from the school, so the count has to surface.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '12345@ccpsnet.net', name: 'Malformed' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: 'transfer@elsewhere.org', name: 'Transfer' }),
    ],
  });

  const out = exported.generateWeeklyParentReports(fx.now);
  assert.equal(out.reports.length, 1);
  assert.equal(out.excludedStudentCount, 2);
});

// ── Week window ──────────────────────────────────────────────────────────

test('the week window is a Monday-to-Sunday calendar week', () => {
  // A rolling "last 7 days" would give two teachers sending on different
  // days overlapping windows for the same child, and would make "week of
  // the 3rd" mean something different depending on when it was run.
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const wed = exported._weekWindow_(new D(2026, 2, 4, 12, 0, 0));  // Wed 4 Mar
  const fri = exported._weekWindow_(new D(2026, 2, 6, 18, 0, 0));  // Fri 6 Mar
  const sun = exported._weekWindow_(new D(2026, 2, 8, 23, 0, 0));  // Sun 8 Mar

  assert.equal(new Date(wed.start).getDate(), 2, 'week starts Monday 2 Mar');
  assert.equal(new Date(wed.start).getTime(), new Date(fri.start).getTime());
  assert.equal(new Date(sun.start).getTime(), new Date(wed.start).getTime(),
    'Sunday belongs to the week that began the preceding Monday');
  assert.equal(new Date(wed.end).getDate(), 8, 'week ends Sunday 8 Mar');
});

// ── Retention ────────────────────────────────────────────────────────────

test('the archiver marks expired rows and the counter agrees', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });

  const log = fx.ss.insertSheet('ParentReportLog');
  log.appendRow(exported.PARENT_REPORT_LOG_HEADERS);
  const old = new D(2015, 0, 1);
  const recent = new D(2026, 1, 1);
  log.appendRow(['r1', '1234567@ccpsnet.net', 'Alice', old, old, 'p@example.com', old, old, 't@ccpsnet.net', 1, 0, '']);
  log.appendRow(['r2', '2345678@ccpsnet.net', 'Bob', recent, recent, 'q@example.com', recent, recent, 't@ccpsnet.net', 1, 0, '']);

  assert.equal(exported._countParentReportsPastRetentionUnarchived_(), 1,
    'the expired row is visible before the archiver runs');

  const res = exported._archiveExpiredParentReports_();
  assert.equal(res.archived, 1);
  assert.equal(exported._countParentReportsPastRetentionUnarchived_(), 0,
    'a nonzero count after archiving would mean archival itself failed');

  const rows = log.getDataRange().getValues();
  assert.match(String(rows[1][11]), /pending disposition review/,
    'a disclosure record uses the legal-hold marker, not the reversible one');
  assert.equal(rows[2][11], '', 'the in-window row is untouched');
});

// ── Trigger installation ─────────────────────────────────────────────────

test('the trigger is installed on a fixed weekday, not a rolling interval', () => {
  const { exported, sandbox } = load();
  const res = exported.installWeeklyParentReportTrigger();
  assert.equal(res.installed, true);

  const triggers = sandbox.ScriptApp.getProjectTriggers();
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].getHandlerFunction(), 'runWeeklyParentReportPrep');

  const methods = triggers[0].__calls.map((c) => c.method);
  assert.ok(methods.includes('onWeekDay'),
    'a parent report must land on a predictable day');
  assert.ok(!methods.includes('everyDays'),
    'everyDays(7) drifts relative to the calendar week — see the two existing weekly triggers');
});

test('installing twice does not create a second trigger', () => {
  const { exported, sandbox } = load();
  exported.installWeeklyParentReportTrigger();
  const second = exported.installWeeklyParentReportTrigger();
  assert.equal(second.installed, false);
  assert.equal(sandbox.ScriptApp.getProjectTriggers().length, 1);
});

// ── Access policy: the teacher's own students, this school year ─────────────

test('a teacher\'s reports cover only their own students, courses and decisions', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '7654321@ccpsnet.net', name: 'Bob',
        teacherEmail: 'other.teacher@ccpsnet.net' }),
      // Alice in another teacher's course: not this teacher's to report.
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        configId: 'CFG-OTHER', courseName: 'Chemistry', teacherEmail: 'other.teacher@ccpsnet.net' }),
    ],
    scrRows: [
      scrRow({ studentEmail: '1234567@ccpsnet.net', competencyId: 'MKT-1', finalRating: 2 }),
      scrRow({ decisionId: 'dec-2', studentEmail: '1234567@ccpsnet.net', competencyId: 'CHEM-1',
        finalRating: 1, decidedBy: 'other.teacher@ccpsnet.net' }),
    ],
  });

  const out = exported.generateWeeklyParentReports(fx.now);

  assert.deepEqual(out.reports.map((r) => r.studentEmail), ['1234567@ccpsnet.net']);
  const text = exported.renderWeeklyParentReportText_(out.reports[0]);
  assert.doesNotMatch(text, /Chemistry|CHEM-1/);
});

test('with no TEACHER_EMAIL configured there is nobody to scope to, so no reports', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [(sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' })],
  });
  sandbox.PropertiesService.getScriptProperties().deleteProperty('TEACHER_EMAIL');
  assert.equal(exported.generateWeeklyParentReports(fx.now).reports.length, 0);
});

// ── What the report says (the UX audit's preconditions, 2026-10-23) ─────────

test('every rostered student gets a report, with nothing due this week said plainly', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
      // Bob's only work is from the week before.
      (sb) => ledgerRow(sb, { timestamp: new sb.Date(2026, 1, 24, 9), googleId: '2345678@ccpsnet.net', name: 'Bob Jones' }),
    ],
  });
  const out = exported.generateWeeklyParentReports(fx.now);
  assert.deepEqual(out.reports.map((r) => r.studentName), ['Alice', 'Bob Jones']);
  const bob = exported.renderWeeklyParentReportText_(out.reports[1]);
  assert.match(bob, /Weekly progress for Bob\n/);
  assert.match(bob, /Nothing was due or turned in this week\./);
  assert.match(bob, /Nothing is outstanding/);
});

test('items carry the lesson title and their real status; competencies their text', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => { const r = ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        configId: 'VDOE-AAA-1' }); r[23] = 2; r[24] = 'NEEDS_REVISION'; return r.concat(['', '']); },
      (sb, ts) => { const r = ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice',
        configId: 'VDOE-AAA-2' }); r[23] = 1; r[24] = 'PASSED'; r[25] = ts; return r.concat(['']); },
    ],
    scrRows: [scrRow({ studentEmail: '1234567@ccpsnet.net', competencyId: '8175-39', finalRating: 2, decidedAt: new D(2026, 2, 2) })],
  });
  const sa = fx.ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  sa.appendRow(['VDOE-AAA-1', '1234567@ccpsnet.net', 'CAS-8175-L01', new D()]);
  sa.appendRow(['VDOE-AAA-2', '1234567@ccpsnet.net', 'CAS-8175-L02', new D()]);

  const report = exported.generateWeeklyParentReports(fx.now).reports[0];
  const body = exported.renderWeeklyParentReportText_(report);
  assert.match(body, /The Seven Eras of Marketing \(Timeline Analysis\) \([^)]*\): Revising: feedback given, not passing yet/);
  assert.match(body, /: Passed: met the standard/);
  assert.match(body, /Ask Alice to finish: The Seven Eras of Marketing/);
  assert.match(body, /Explain marketing as it relates to the sports, entertainment, and event industries \[8175-39\]: 2 \(without supervision\)/);
  assert.match(body, /1 to 5 competency scale, where 1 is the highest/);
});

test('8177 items and the parts of a lesson carry their assignment title too, not the unit name', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', configId: 'VDOE-AAA-1' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', configId: 'VDOE-AAA-2' }),
    ],
    scrRows: [],
  });
  const sa = fx.ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  sa.appendRow(['VDOE-AAA-1', '1234567@ccpsnet.net', 'CAS-8177-THE-FRONT-LINES', new D()]);
  sa.appendRow(['VDOE-AAA-2', '1234567@ccpsnet.net', 'CAS-8177-THE-TICKET-OFFICE-P2', new D()]);
  const body = exported.renderWeeklyParentReportText_(exported.generateWeeklyParentReports(fx.now).reports[0]);
  assert.doesNotMatch(body, /The Front Lines \(Customer Service & Sales\)/, 'not the lesson\'s unit name');
  assert.match(body, /The Sales Management Playbook — Part 2 of 4: The Sales Contest/);
  assert.doesNotMatch(body, /Assignment: /, 'the label word is dropped');
});

test('progress is the current marking period only, named in words', () => {
  const { exported, sandbox } = load();
  const D = sandbox.Date;
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [(sb) => ledgerRow(sb, { timestamp: new sb.Date(2026, 9, 20, 9), googleId: '1234567@ccpsnet.net', name: 'Alice' })],
    scrRows: [
      scrRow({ decisionId: 'a', studentEmail: '1234567@ccpsnet.net', competencyId: 'NOW-1', finalRating: 3, decidedAt: new D(2026, 9, 5) }),
      scrRow({ decisionId: 'b', studentEmail: '1234567@ccpsnet.net', competencyId: 'LASTYEAR-1', finalRating: 1, decidedAt: new D(2026, 4, 5) }),
    ],
  });
  // Wed 21 Oct 2026: marking period 1 of 2026-27 (00's default table, from August).
  const report = exported.generateWeeklyParentReports(new D(2026, 9, 21, 12)).reports[0];
  assert.deepEqual(report.progress.map((p) => p.competencyId), ['NOW-1']);
  assert.match(exported.renderWeeklyParentReportText_(report), /PROGRESS SO FAR, MARKING PERIOD 1, 2026–27/);
});

test('the subject and greeting use the first name, never the account; the teacher signs it', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice Smith' }),
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '2345678@ccpsnet.net', name: '' }),
    ],
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('TEACHER_NAME', 'Ms. Rivera');
  const [noName, alice] = exported.generateWeeklyParentReports(fx.now).reports
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  assert.match(exported.weeklyParentReportSubject_(alice), /^Weekly progress for Alice, week of March 2$/);
  assert.doesNotMatch(exported.weeklyParentReportSubject_(noName), /@|\d{7}/);
  const body = exported.renderWeeklyParentReportText_(noName);
  assert.match(body, /Weekly progress for your student/);
  assert.doesNotMatch(body, /2345678/);
  assert.match(exported.renderWeeklyParentReportText_(alice), /Ms\. Rivera, teacher@ccpsnet\.net$/);
});
