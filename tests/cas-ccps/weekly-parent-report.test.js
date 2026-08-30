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
];

const EXPORTS = [
  'generateWeeklyParentReports',
  'sendWeeklyParentReport',
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
  assert.match(body, /with your teacher for review/);
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
  assert.match(body, /score: 3/);
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
  assert.match(exported.renderWeeklyParentReportText_(report), /score: 0/);
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

// ── Recipient capture and dedup ──────────────────────────────────────────

test('sending records the address it actually sent to', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', finalScore: 3,
      }),
    ],
  });

  const res = exported.sendWeeklyParentReport(
    '1234567@ccpsnet.net', 'parent@example.com', fx.now);
  assert.equal(res.success, true);

  const sent = sandbox.MailApp.getSentMessages();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'parent@example.com');

  // The log must agree with what MailApp was actually handed. This is the
  // point of sending through the app rather than a hand-addressed draft:
  // without it there is no record of whose parent received a child's scores.
  const log = fx.ss.getSheetByName('ParentReportLog');
  const rows = log.getDataRange().getValues();
  assert.equal(rows.length, 2, 'header + one row');
  assert.equal(rows[1][1], '1234567@ccpsnet.net');
  assert.equal(rows[1][5], 'parent@example.com');
  assert.ok(rows[1][7], 'sent_at must be stamped on success');
});

test('a second send for the same student and week is refused', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', finalScore: 3,
      }),
    ],
  });

  assert.equal(exported.sendWeeklyParentReport(
    '1234567@ccpsnet.net', 'parent@example.com', fx.now).success, true);
  const second = exported.sendWeeklyParentReport(
    '1234567@ccpsnet.net', 'parent@example.com', fx.now);

  assert.equal(second.success, false);
  assert.match(second.error, /already sent/i);
  assert.equal(sandbox.MailApp.getSentMessages().length, 1,
    'a duplicate request must not reach the parent');
});

test('a malformed recipient address is refused before anything is sent', () => {
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, { timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice' }),
    ],
  });
  const res = exported.sendWeeklyParentReport('1234567@ccpsnet.net', 'not-an-address', fx.now);
  assert.equal(res.success, false);
  assert.equal(sandbox.MailApp.getSentMessages().length, 0);
});

test('an off-domain recipient is accepted — that is the point of this path', () => {
  // Every other outbound surface in cas-ccps rejects off-domain addresses.
  // This one must not, or the feature cannot work; the safety comes from
  // who can trigger it and what it may contain, not from a domain check.
  const { exported, sandbox } = load();
  const fx = setUpFixture(sandbox, exported, {
    ledgerRows: [
      (sb, ts) => ledgerRow(sb, {
        timestamp: ts, googleId: '1234567@ccpsnet.net', name: 'Alice', finalScore: 3,
      }),
    ],
  });
  const res = exported.sendWeeklyParentReport(
    '1234567@ccpsnet.net', 'someone@gmail.com', fx.now);
  assert.equal(res.success, true);
  assert.equal(sandbox.MailApp.getSentMessages()[0].to, 'someone@gmail.com');
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
  assert.equal(rows[1][5], '', 'recipient_address is unknown until a teacher sends');
  assert.equal(rows[1][7], '', 'sent_at must be empty');
});

test('the weekly trigger is idempotent within a week', () => {
  const { exported, sandbox } = load();
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
