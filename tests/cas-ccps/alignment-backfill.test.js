'use strict';
// Regression tests for the alignment-log safety net:
// 22_LessonContextHandler.js's runAlignmentLogBackfill_() (every 5 minutes)
// and 26_CompetencyAlignmentLog.js's logAlignmentForLesson_().
//
// What these pin:
//   - A lesson S26 can't log is not retried forever. Each failed attempt is
//     counted in error_notes; after LC_BACKFILL_MAX_ATTEMPTS, or at once when
//     retrying can't help, the row becomes ERROR with a note saying why.
//   - A lock-busy stand-down isn't counted as an attempt.
//   - A write that fails part way leaves no AlignmentLog rows behind, so the
//     retry can't double-count the lesson's competencies.
//   - Each failure is logged once, not once by S26 and again by the caller.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const PATHS = ['00_SharedConfig.js', '22_LessonContextHandler.js', '26_CompetencyAlignmentLog.js']
  .map((f) => path.join(SCRIPTS, f));
const EXPORTS = ['runAlignmentLogBackfill_', 'logAlignmentForLesson_'];

const LC_HEADERS = [
  'lesson_id', 'teacher_email', 'submitted_at', 'lesson_date',
  'period_or_class', 'activity_description', 'learning_objective',
  'key_vocabulary', 'prior_lesson_connection', 'competency_ids',
  'status', 'alignment_logged_at', 'error_notes', 'term',
];
const STATUS = 10;
const NOTES = 12;

function lessonRow(id, competencyIds, notes) {
  return [id, 'teacher@ccpsnet.net', new Date(), '2026-09-28', '3', 'Pitch practice',
    'Students will pitch.', 'pitch', '', competencyIds, 'RECEIVED', '', notes || '', '2026-27 S1'];
}

function setUp(opts) {
  const options = opts || {};
  const logs = [];
  const lockState = { busy: false };
  const { exported, sandbox } = loadGasFiles(PATHS, EXPORTS, {
    Logger: { log: (m) => logs.push(String(m)) },
    LockService: {
      getDocumentLock() {
        return {
          waitLock() { if (lockState.busy) throw new Error('Lock timeout'); },
          releaseLock() {},
        };
      },
    },
  });
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');

  const lc = ss.insertSheet('LessonContext');
  lc.appendRow(LC_HEADERS);
  (options.lessons || []).forEach((r) => lc.appendRow(r));

  let al = null;
  if (options.withAlignmentLog !== false) {
    al = ss.insertSheet('AlignmentLog');
    al.appendRow(['log_id', 'lesson_id', 'logged_at', 'lesson_date', 'teacher_email',
      'learning_objective', 'competency_id', 'competency_text', 'strand']);
  }
  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  reg.appendRow(['8175-1', 'Communicate', 'Marketing', '9-12', 'Communication', '', 'TRUE']);
  reg.appendRow(['8175-2', 'Analyze a market', 'Marketing', '9-12', 'Research', '', 'TRUE']);

  return { exported, ss, lc, al, logs, lockState };
}

function cell(sheet, row, col) {
  return sheet.getDataRange().getValues()[row][col];
}

function alignmentRows(al) {
  return al.getDataRange().getValues().slice(1);
}

test('a lesson with no competency_ids is stopped on the first run, not retried every 5 minutes', () => {
  const { exported, lc, al, logs } = setUp({ lessons: [lessonRow('LES-1', '')] });
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'ERROR');
  assert.match(cell(lc, 1, NOTES), /^Alignment logging stopped after 1 attempt\(s\): No competency_ids/);
  assert.match(cell(lc, 1, NOTES), /set status back to RECEIVED to retry/);
  assert.equal(alignmentRows(al).length, 0);

  const logged = logs.length;
  exported.runAlignmentLogBackfill_();
  assert.equal(logs.length, logged, 'a stopped row is not picked up again');
});

test('a failure that might clear is retried up to the limit, then stopped', () => {
  const { exported, ss, lc } = setUp({ lessons: [lessonRow('LES-1', '8175-1')], withAlignmentLog: false });
  for (let n = 1; n <= 5; n++) {
    exported.runAlignmentLogBackfill_();
    assert.equal(cell(lc, 1, STATUS), 'RECEIVED');
    assert.equal(cell(lc, 1, NOTES), 'Alignment logging deferred (attempt ' + n + ' of 6): AlignmentLog tab not found.');
  }
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'ERROR');
  assert.match(cell(lc, 1, NOTES), /^Alignment logging stopped after 6 attempt\(s\): AlignmentLog tab not found\./);

  // The operator fixes the cause and sets the row back to RECEIVED.
  const al = ss.insertSheet('AlignmentLog');
  al.appendRow(['log_id', 'lesson_id', 'logged_at', 'lesson_date', 'teacher_email',
    'learning_objective', 'competency_id', 'competency_text', 'strand']);
  lc.getRange(2, STATUS + 1).setValue('RECEIVED');
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'ALIGNMENT_LOGGED');
  assert.equal(alignmentRows(al).length, 1);
});

test('the direct path\'s deferred note counts as attempt 0, and success clears it', () => {
  const { exported, lc, al } = setUp({
    lessons: [lessonRow('LES-1', '8175-1,8175-2', 'Alignment logging deferred: System busy — try again in a moment.')],
  });
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'ALIGNMENT_LOGGED');
  assert.equal(Object.prototype.toString.call(cell(lc, 1, 11)), '[object Date]', 'alignment_logged_at is set');
  assert.equal(cell(lc, 1, NOTES), '');
  assert.deepEqual(alignmentRows(al).map((r) => r[6]), ['8175-1', '8175-2']);
});

test('a note that isn\'t the backfill\'s own is left alone on success', () => {
  const { exported, lc } = setUp({ lessons: [lessonRow('LES-1', '8175-1', 'Teacher asked to re-check')] });
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'ALIGNMENT_LOGGED');
  assert.equal(cell(lc, 1, NOTES), 'Teacher asked to re-check');
});

test('a lock-busy stand-down is not counted as an attempt', () => {
  const { exported, lc, lockState } = setUp({
    lessons: [lessonRow('LES-1', '8175-1', 'Alignment logging deferred (attempt 5 of 6): x')],
  });
  lockState.busy = true;
  exported.runAlignmentLogBackfill_();
  assert.equal(cell(lc, 1, STATUS), 'RECEIVED');
  assert.equal(cell(lc, 1, NOTES), 'Alignment logging deferred (attempt 5 of 6): x');
});

// Real Sheets can fail on any write call. Make the second appendRow and any
// setValues on AlignmentLog fail once, whichever the code uses.
function failOneAlignmentWrite(al) {
  let failNext = true;
  const realAppend = al.appendRow.bind(al);
  let appends = 0;
  al.appendRow = (row) => {
    appends++;
    if (failNext && appends === 2) { failNext = false; throw new Error('Service error'); }
    return realAppend(row);
  };
  const realGetRange = al.getRange.bind(al);
  al.getRange = (...args) => {
    const range = realGetRange(...args);
    const realSet = range.setValues.bind(range);
    range.setValues = (v) => {
      if (failNext) { failNext = false; throw new Error('Service error'); }
      return realSet(v);
    };
    return range;
  };
}

test('a write that fails part way leaves no AlignmentLog rows, so the retry can\'t double-count', () => {
  const { exported, lc, al } = setUp({ lessons: [lessonRow('LES-1', '8175-1,8175-2')] });
  failOneAlignmentWrite(al);

  exported.runAlignmentLogBackfill_();
  assert.equal(alignmentRows(al).length, 0, 'nothing written by the failed attempt');
  assert.equal(cell(lc, 1, STATUS), 'RECEIVED');
  assert.match(cell(lc, 1, NOTES), /attempt 1 of 6\): Could not write AlignmentLog rows: Service error/);

  exported.runAlignmentLogBackfill_();
  assert.deepEqual(alignmentRows(al).map((r) => r[6]), ['8175-1', '8175-2']);
  assert.equal(cell(lc, 1, STATUS), 'ALIGNMENT_LOGGED');
});

test('each failure is logged once', () => {
  const { exported, al, logs } = setUp({ lessons: [lessonRow('LES-1', '8175-1,8175-2')] });
  failOneAlignmentWrite(al);
  exported.runAlignmentLogBackfill_();
  assert.equal(logs.filter((m) => /LES-1/.test(m)).length, 1, logs.join('\n'));
});

test('logAlignmentForLesson_ flags the failures retrying can\'t fix', () => {
  const { exported, lockState } = setUp({ lessons: [lessonRow('LES-1', ' , ')] });
  assert.equal(exported.logAlignmentForLesson_('LES-1').retry, false);
  assert.equal(exported.logAlignmentForLesson_('LES-404').retry, false);
  lockState.busy = true;
  const busy = exported.logAlignmentForLesson_('LES-1');
  assert.equal(busy.busy, true);
  assert.equal(busy.success, false);
});
