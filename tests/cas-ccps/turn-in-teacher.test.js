'use strict';
// The turn-in code, stage 3: the teacher's side (meta/TURN_IN_CODE_PLAN_2026-11.md,
// D17; cas-ccps/scripts/73_TurnInTeacherPanel.js and 74_TurnInCanvasCheck.js).
// The Teacher Dashboard's Turn-in codes panel: the review queue, the grant
// and the overrule (a reason, How = GRANT), the per-assignment openings; and
// the Canvas check: file names, the code in the HTML, every outcome, matching
// by SIS ID only (never the name in a file name), the upload CSV, the run
// log, the guards, and the switch having no say over the panel. Loaded as
// the whole Teacher Dashboard project, the scope it runs in (FLOW_DOCTRINE
// rule 12). Synthetic data only: made-up names and IDs.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, FakeDriveFolder, FakeDriveFile, fakeZipBlob } = require('../harness/gas-sandbox');
const projectMap = require('../../tools/gas-lint/project-map.json');
const allow = require('../../tools/gas-lint/webapp-public-allow.json');

const ROOT = path.join(__dirname, '..', '..');
const FILES = projectMap['cas-ccps:teacher-dashboard'].files.map((f) => path.join(ROOT, f));
const plain = (x) => JSON.parse(JSON.stringify(x));

const DOMAIN = 'ccpsnet.net';
const TEACHER = 'teacher@' + DOMAIN;
const OTHER_TEACHER = 'teacher2@' + DOMAIN;
// SIS IDs (the school's 7-digit pattern) and the accounts 52 makes of them.
const ID = { jane: '0000001', rick: '0000002', pat: '0000003', max: '0000004', lia: '0000005', kay: '0000006', zed: '0000007' };
const acct = (k) => ID[k] + '@' + DOMAIN;
const C8177 = '8177 Sports Entertainment and Event Management';
const L05 = 'CAS-8177-L05';
const COLUMN = 'Lesson 5 Market Research Turn-in (2201)';

function terms() {
  const now = new Date();
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const yy = String(start % 100).padStart(2, '0') + String((start + 1) % 100).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const day = 24 * 60 * 60 * 1000;
  return { mp2: yy + '_MP2', ends: yy + '_MP1=' + ymd(new Date(now.getTime() - 30 * day)) + ',' + yy + '_MP2=' + ymd(new Date(now.getTime() + 30 * day)) };
}

const EXPOSE = ['LEDGER', 'getTurnInPanelData', 'turnInPanelIssueForCheck', 'turnInPanelGrant', 'turnInPanelOpenAssignment',
  'turnInPanelCloseAssignment', 'getTurnInCanvasFiles', 'getTurnInCanvasColumns', 'runTurnInCanvasCheckFromPanel',
  'runTurnInCanvasCheck', 'grantTurnInCode', 'openTurnInForAssignment', 'closeTurnInForAssignment',
  'tccParseFileName_', 'tccIsSubmissionEntry_', 'tccHtmlText_', 'tccFindCodes_', 'tccParseExport_', 'tccMatchRoster_',
  'tccUploadCsv_', 'tccBestColumn_', 'turnInMakeCode_', 'TCC_FILES_MAX', 'TCC_RUN_HEADERS', 'buildDashboardHtml_'];

const code = (exported, lesson, random) => exported.turnInMakeCode_('8177', lesson, random);
// A code with its check character changed: well-formed, but it doesn't check out.
const typo = (c) => c.slice(0, -1) + (c.slice(-1) === 'A' ? 'B' : 'A');

const page = (body) => '<html><head><title>x</title></head><body><h1>Lesson 5 Market Research Turn-in: Made Up Name</h1>' +
  '<div class="box"><p>' + body + '</p></div></body></html>';

function exportCsv(opts) {
  opts = opts || {};
  const lines = [
    'Student,ID,SIS User ID,SIS Login ID,Integration ID,Section,Unit 1 Quiz (2100),' + COLUMN + ',Current Score',
  ];
  if (opts.points !== false) lines.push('    Points Possible,,,,,,10,' + (opts.points === null ? '' : '5') + ',');
  lines.push(
    '"Doe, Jane",101,' + ID.jane + ',' + ID.jane + ',,8177 - Block 3,9,,90',
    '"Roe, Rick",102,' + ID.rick + ',' + ID.rick + ',,8177 - Block 3,8,,80',
    '"Poe, Pat",103,' + ID.pat + ',' + ID.pat + ',,8177 - Block 3,7,,70',
    '"Moe, Max",104,' + ID.max + ',' + ID.max + ',,8177 - Block 5,6,,60',
    '"Loe, Lia",105,' + ID.lia + ',' + ID.lia + ',,8177 - Block 5,5,,50',
    // No SIS User ID: matched through Canvas's ID column.
    '"Kay, Kim",1006,,' + ID.kay + ',,8177 - Block 5,4,,40',
    '"Student, Test",107,,,,8177 - Block 3,,,',
    // A row with no ID at all (a note Canvas adds) is left out of the upload.
    ',,,,,,Manual Posting,,',
  );
  return lines.join('\n');
}

function load(opts) {
  opts = opts || {};
  const T = terms();
  const state = { who: TEACHER };
  const session = {
    getActiveUser: () => ({ getEmail: () => state.who }),
    getEffectiveUser: () => ({ getEmail: () => TEACHER }),
    getScriptTimeZone: () => 'America/New_York',
  };
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE, { Session: session });
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('MARKING_PERIOD_ENDS', T.ends);
  if (opts.switch !== undefined) props.setProperty('TURN_IN_CODE_COURSES', opts.switch);

  // A created spreadsheet is a Drive file too, as in real Drive (the report
  // is moved into the teacher's folder).
  const create = sandbox.SpreadsheetApp.create;
  sandbox.SpreadsheetApp.create = (name) => {
    const made = create(name);
    sandbox.DriveApp._registerFile(new FakeDriveFile(made.getId(), name, 'application/vnd.google-apps.spreadsheet'));
    return made;
  };

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (who, configId, name, teacher) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = who; r[L.CONFIG_ID] = configId; r[L.FILE_ID] = 'f-' + configId;
    r[L.STUDENT_NAME] = name; r[L.CLASS_NAME] = C8177; r[L.SUBJECT] = C8177; r[L.COURSE_NAME] = 'Lesson';
    r[L.TEACHER_EMAIL] = teacher || TEACHER; r[L.PERIOD] = '3'; r[L.STATUS] = 'COMPLETE'; r[L.LAST_RESULT] = 'NEEDS_REVISION';
    r[L.ACADEMIC_YEAR] = T.mp2;
    ledger.appendRow(r);
  };
  // The Ledger's names, deliberately unlike the export's or the file names'.
  row(acct('jane'), 'W-JANE-5', 'Student One');
  row(acct('rick'), 'W-RICK-5', 'Student Two');
  row(acct('pat'), 'W-PAT-5', 'Student Three');
  row(acct('pat'), 'W-PAT-7', 'Student Three');
  row(acct('max'), 'W-MAX-5', 'Student Four');
  row(acct('lia'), 'W-LIA-5', 'Student Five');
  row(acct('kay'), 'W-KAY-5', 'Student Six');
  row(acct('zed'), 'W-ZED-5', 'Not Mine', OTHER_TEACHER);

  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  [['W-JANE-5', 'jane', L05], ['W-RICK-5', 'rick', L05], ['W-PAT-5', 'pat', L05], ['W-PAT-7', 'pat', 'CAS-8177-L07'],
    ['W-MAX-5', 'max', L05], ['W-LIA-5', 'lia', L05], ['W-KAY-5', 'kay', 'CAS-8177-L05-P2'], ['W-ZED-5', 'zed', L05]]
    .forEach((r) => sa.appendRow([r[0], acct(r[1]), r[2], new Date()]));

  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson', 'start_date', 'config_id']);
  ls.appendRow(['8177', 'Lesson 5: Market Research', '2026-10-01', L05]);
  ls.appendRow(['8177', 'Lesson 7: Sponsorship', '2026-10-15', 'CAS-8177-L07']);

  // Codes: Jane's and Kay's (a part of L05) for L05, Pat's for L07.
  const codes = {
    jane: code(exported, '05', '7Q4KM2X'),
    kay: code(exported, '05', 'HJKMNPQ'),
    pat7: code(exported, '07', 'RSTVWXY'),
    lia: code(exported, '05', 'ABCDEFG'),
  };
  const tc = ss.insertSheet('TurnInCodes');
  tc.appendRow(['Code', 'GoogleID', 'AssignmentID', 'StudentConfigID', 'Course', 'Lesson', 'IssuedAt', 'How', 'GrantReason']);
  tc.appendRow([codes.jane, acct('jane'), L05, 'W-JANE-5', '8177', 'L05', new Date().toISOString(), 'CHECK', '']);
  tc.appendRow([codes.kay, acct('kay'), 'CAS-8177-L05-P2', 'W-KAY-5', '8177', 'L05', new Date().toISOString(), 'CHECK', '']);
  tc.appendRow([codes.pat7, acct('pat'), 'CAS-8177-L07', 'W-PAT-7', '8177', 'L07', new Date().toISOString(), 'CHECK', '']);

  const checks = ss.insertSheet('TurnInChecks');
  checks.appendRow(['CheckID', 'SubmittedAt', 'GoogleID', 'StudentConfigID', 'StudentFileID', 'AssignmentID', 'Course', 'Kind',
    'Milestone', 'Question', 'Answer', 'Status', 'Reason', 'DecidedAt']);
  const check = (id, who, ws, status, reason) => checks.appendRow([id, new Date().toISOString(), acct(who), ws, 'f-' + ws, L05, '8177',
    'NOT_YET', '8177-83 Develop a market research project.', 'What will you change?', 'I will add a survey of fans to section two.',
    status, reason, new Date().toISOString()]);
  check('TIC-OLD', 'max', 'W-MAX-5', 'NOT_YET', 'An older answer, since replaced.');
  check('TIC-MAX', 'max', 'W-MAX-5', 'CHECK_FAILED', 'No verdict from the check after 3 tries.');
  check('TIC-LIA', 'lia', 'W-LIA-5', 'NOT_YET', 'Say where in your document.');
  check('TIC-JANE', 'jane', 'W-JANE-5', 'CHECK_FAILED', 'No verdict.'); // has a code: not listed
  check('TIC-ZED', 'zed', 'W-ZED-5', 'CHECK_FAILED', 'No verdict.');    // another teacher's student

  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());
  const addFile = (id, name, setUp) => {
    const f = new FakeDriveFile(id, name, 'text/plain');
    setUp(f);
    folder.addFile(f);
    sandbox.DriveApp._registerFile(f);
    return f;
  };
  return { exported, sandbox, ss, props, state, L, codes, folder, addFile,
    tab: (name) => { const s = ss.getSheetByName(name); return s ? s.getDataRange().getValues() : null; } };
}

// The ZIP for the run: one entry per case, named the way Canvas names them.
function standardZip(env) {
  const c = env.codes;
  return [
    { name: 'doejane_' + ID.jane + '_text.html', text: page('My code is ' + c.jane) },
    // Names swapped in the file names: the SIS ID decides.
    { name: 'doejane_LATE_' + ID.rick + '_text.html', text: page('Here: ' + c.jane) },
    { name: 'poepat_' + ID.pat + '_text.html', text: page(c.pat7) },
    { name: 'moemax_' + ID.max + '_text.html', text: page('I forgot the code, sorry.') },
    { name: 'loelia_' + ID.lia + '_text.html', text: page(typo(c.lia)) },
    { name: 'kaykim_1006_text.html', text: page(c.kay) },
    { name: 'nobody_0000099_text.html', text: page(c.jane) },
    { name: 'roerick_' + ID.rick + '_31337_essay.docx', text: 'binary' },
    { name: 'blank_' + ID.max + '_text.html', unreadable: true },
    { name: '__MACOSX/._doejane_' + ID.jane + '_text.html', text: 'junk' },
  ];
}

function withFiles(env, entries, csv) {
  env.addFile('zip-1', 'submissions.zip', (f) => { f._blob = fakeZipBlob(entries); });
  env.addFile('csv-1', '2026-11-08T1200_Grades-8177_Sports.csv', (f) => { f._content = csv === undefined ? exportCsv() : csv; });
  env.addFile('notes-1', 'Notes.txt', (f) => { f._content = 'x'; });
}

const run = (env, extra) => plain(env.exported.runTurnInCanvasCheckFromPanel(Object.assign({
  assignmentId: L05, column: COLUMN, zipId: 'zip-1', exportId: 'csv-1' }, extra || {})));

// ── File names ─────────────────────────────────────────────────────────────

test('file names: the SIS ID with or without LATE_, other file types are not text entries, and the name is never returned', () => {
  const { exported } = load();
  assert.deepEqual(plain(exported.tccParseFileName_('doejane_' + ID.jane + '_text.html')), { text: true, sisId: ID.jane });
  assert.deepEqual(plain(exported.tccParseFileName_('doejane_LATE_' + ID.jane + '_text.html')), { text: true, sisId: ID.jane });
  assert.deepEqual(plain(exported.tccParseFileName_('folder/doe_jane_LATE_' + ID.jane + '_text.html')), { text: true, sisId: ID.jane });
  assert.deepEqual(plain(exported.tccParseFileName_('doejane_' + ID.jane + '_55501_essay.docx')), { text: false, sisId: ID.jane });
  assert.deepEqual(plain(exported.tccParseFileName_('doejane_LATE_' + ID.jane + '_55501_essay.pdf')), { text: false, sisId: ID.jane });
  assert.deepEqual(plain(exported.tccParseFileName_('readme.txt')), { text: false, sisId: '' });
  assert.equal(exported.tccIsSubmissionEntry_('__MACOSX/._doejane_1_text.html'), false);
  assert.equal(exported.tccIsSubmissionEntry_('folder/'), false);
  assert.equal(exported.tccIsSubmissionEntry_('.DS_Store'), false);
  assert.equal(exported.tccIsSubmissionEntry_('doejane_' + ID.jane + '_text.html'), true);
});

// ── The HTML and the code ──────────────────────────────────────────────────

test('the text: tags stripped, entities decoded, the heading kept apart and never searched for a code', () => {
  const env = load();
  const c = env.codes.jane;
  const t = plain(env.exported.tccHtmlText_('<h1>Lesson 5 &amp; more: Doe Jane ' + c + '</h1><script>var x = "' + c + '";</script>' +
    '<div><p>My&nbsp;code&#58; <b>CAS</b>&#x2D;8177</p></div>'));
  assert.equal(t.heading, 'Lesson 5 & more: Doe Jane ' + c);
  assert.equal(t.body, 'My code: CAS -8177');
  assert.deepEqual(plain(env.exported.tccFindCodes_(t.body)), { codes: [], invalid: 1 });
});

test('finding the code: spacing, case, O for 0 and I or L for 1, a bad check character, and two codes', () => {
  const env = load();
  const f = (s) => plain(env.exported.tccFindCodes_(s));
  const c = env.codes.jane; // CAS-8177-L05-7Q4K-M2X?
  assert.deepEqual(f('my code is ' + c + '.'), { codes: [c], invalid: 0 });
  assert.deepEqual(f(c.toLowerCase()), { codes: [c], invalid: 0 });
  assert.deepEqual(f(c.replace(/-/g, ' ')), { codes: [c], invalid: 0 });
  assert.deepEqual(f(c.replace(/-/g, '')), { codes: [c], invalid: 0 });
  assert.deepEqual(f(c.replace(/-/g, ' – ')), { codes: [c], invalid: 0 });
  assert.deepEqual(f('CAS 8177 L 05 7Q4K M2X' + c.slice(-1) + ' thanks'), { codes: [c], invalid: 0 });
  // Zeros and ones typed as letters.
  const z = env.exported.turnInMakeCode_('8177', '05', '10A0B1C');
  const typed = z.replace('-L05-', '-LO5-').replace(/-10A0-/, '-IOAO-').replace(/-B1/, '-Bl');
  assert.notEqual(typed, z);
  assert.deepEqual(f(typed), { codes: [z], invalid: 0 });
  // A typo in the code.
  assert.deepEqual(f(typo(c)), { codes: [], invalid: 1 });
  // Two codes: both found, in order; the first valid one is the one used.
  assert.deepEqual(f(typo(c) + ' sorry, I meant ' + env.codes.kay + ' or ' + c), { codes: [env.codes.kay, c], invalid: 1 });
  // Words that only contain CAS are not codes.
  assert.deepEqual(f('In this case, the casino'), { codes: [], invalid: 0 });
});

// ── The export ─────────────────────────────────────────────────────────────

test('the export: identity columns, the Points Possible row, the assignment columns and their points', () => {
  const env = load();
  const exp = plain(env.exported.tccParseExport_(exportCsv()));
  assert.equal(exp.ok, true);
  assert.deepEqual(exp.identity.map((i) => exp.header[i]), ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Section']);
  assert.equal(exp.pointsRow, 1);
  assert.equal(exp.students.length, 7, 'every row with an ID, the Test Student too');
  assert.deepEqual(exp.columns.map((c) => [c.header, c.title, c.points]),
    [['Unit 1 Quiz (2100)', 'Unit 1 Quiz', 10], [COLUMN, 'Lesson 5 Market Research Turn-in', 5]]);
  assert.equal(plain(env.exported.tccParseExport_('Name,Score\nA,1')).ok, false);
  assert.equal(env.exported.tccBestColumn_(exp.columns, 'Lesson 5: Market Research', L05), COLUMN);
  assert.equal(env.exported.tccBestColumn_(exp.columns, 'Unit 1 Quiz', 'CAS-8177-L01'), 'Unit 1 Quiz (2100)');
  assert.equal(env.exported.tccBestColumn_(exp.columns, 'Something else', 'CAS-8177-L09'), '');
});

test('matching: SIS User ID first, then Canvas\'s ID; no row, or rows that disagree, is no match', () => {
  const env = load();
  const exp = env.exported.tccParseExport_(exportCsv());
  const m = (id) => plain(env.exported.tccMatchRoster_(exp, id));
  assert.deepEqual([m(ID.jane).ok, m(ID.jane).via, m(ID.jane).account], [true, 'SIS User ID', acct('jane')]);
  assert.deepEqual([m('1006').ok, m('1006').via, m('1006').account], [true, 'ID', acct('kay')]);
  assert.deepEqual(m('0000099'), { ok: false, why: 'NOT_FOUND' });
  // An ID that is one student's SIS User ID and another's Canvas ID.
  const clash = env.exported.tccParseExport_(exportCsv() + '\n"Clash, Cy",' + ID.jane + ',,9999999,,8177 - Block 3,,,');
  assert.deepEqual(plain(env.exported.tccMatchRoster_(clash, ID.jane)), { ok: false, why: 'INCONSISTENT' });
});

// ── The whole run ──────────────────────────────────────────────────────────

test('the Canvas check: every outcome, matched by SIS ID only, the report and the upload file', () => {
  const env = load();
  withFiles(env, standardZip(env));
  const res = run(env);
  assert.equal(res.success, true, res.error);
  assert.equal(res.files, 9, 'the __MACOSX copy is skipped');
  assert.deepEqual(res.counts, { VALID: 2, NO_CODE: 1, OTHER_STUDENTS_CODE: 1, WRONG_ASSIGNMENT: 1, INVALID_CODE: 1,
    NOT_ON_ROSTER: 1, NOT_TEXT_ENTRY: 1, UNREADABLE: 1 });
  const by = {};
  res.rows.forEach((r) => { (by[r.outcome] = by[r.outcome] || []).push(r.student); });
  // Jane's own file, and Kay's through Canvas's ID column (a part of L05).
  assert.deepEqual(by.VALID.sort(), ['Student One', 'Student Six']);
  // The file named for Jane but carrying Rick's SIS ID is Rick's, with Jane's code.
  assert.deepEqual(by.OTHER_STUDENTS_CODE, ['Student Two']);
  assert.deepEqual(by.WRONG_ASSIGNMENT, ['Student Three']);
  assert.deepEqual(by.NO_CODE, ['Student Four']);
  assert.deepEqual(by.INVALID_CODE, ['Student Five']);
  assert.deepEqual(by.NOT_ON_ROSTER, ['SIS ID 0000099']);
  assert.deepEqual(by.NOT_TEXT_ENTRY, ['Student Two']);
  assert.deepEqual(by.UNREADABLE, ['Student Four']);
  assert.match(res.rows.find((r) => r.outcome === 'WRONG_ASSIGNMENT').note, /CAS-8177-L07/);
  assert.match(res.rows.find((r) => r.outcome === 'INVALID_CODE').note, /check character/);
  assert.deepEqual(res.warnings, []);

  // Names from file names appear nowhere: not in the result, the report, the
  // upload file or the run log.
  const report = env.sandbox.SpreadsheetApp._registry.get(res.reportUrl.split('/d/')[1].split('/')[0]);
  const reportText = JSON.stringify(report.getSheets()[0].getDataRange().getValues());
  const upload = env.folder.files.find((f) => /^Turn-in upload — CAS-8177-L05 — .*\.csv$/.test(f.name));
  const runs = env.tab('TurnInCanvasRuns');
  for (const text of [JSON.stringify(res), reportText, upload._content, JSON.stringify(runs)]) {
    for (const fileName of ['doejane', 'poepat', 'moemax', 'loelia', 'kaykim', 'nobody', 'roerick']) {
      assert.ok(!text.toLowerCase().includes(fileName), fileName);
    }
  }
  assert.match(reportText, /Student One/);
  assert.ok(env.folder.files.some((f) => f.id === report.getId()), 'the report is in the teacher\'s folder');

  // The upload file: identity columns verbatim, the chosen column verbatim,
  // the Points Possible row, full points for VALID rows only, blank elsewhere.
  assert.equal(upload._content, [
    'Student,ID,SIS User ID,SIS Login ID,Section,' + COLUMN,
    '    Points Possible,,,,,5',
    '"Doe, Jane",101,' + ID.jane + ',' + ID.jane + ',8177 - Block 3,5',
    '"Roe, Rick",102,' + ID.rick + ',' + ID.rick + ',8177 - Block 3,',
    '"Poe, Pat",103,' + ID.pat + ',' + ID.pat + ',8177 - Block 3,',
    '"Moe, Max",104,' + ID.max + ',' + ID.max + ',8177 - Block 5,',
    '"Loe, Lia",105,' + ID.lia + ',' + ID.lia + ',8177 - Block 5,',
    '"Kay, Kim",1006,,' + ID.kay + ',8177 - Block 5,5',
    '"Student, Test",107,,,8177 - Block 3,',
    '',
  ].join('\n'));
  assert.equal(upload.mimeType, 'text/csv');

  // One audit row: who, when, which assignment, the counts. No student data.
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0], env.exported.TCC_RUN_HEADERS);
  assert.deepEqual(runs[1].slice(1), [TEACHER, L05, COLUMN, '9', '2', '1', '1', '1', '1', '1', '1', '1', '']);
  // The retention schedule (57, another project) counts the same tab.
  const retention = require('fs').readFileSync(path.join(ROOT, 'cas-ccps/scripts/57_RetentionSchedule.js'), 'utf8');
  assert.match(retention, /label: "TurnInCanvasRuns", tier: RETENTION_TIER_RECORD[^}]*ledger\("TurnInCanvasRuns"\), dateCol: "RunAt"/);
});

test('a heading that names a different assignment is a warning, not a block', () => {
  const env = load();
  withFiles(env, [{ name: 'doejane_' + ID.jane + '_text.html',
    text: '<h2>Unit 9 Something Else: Name</h2><div>' + env.codes.jane + '</div>' }]);
  const res = run(env);
  assert.equal(res.counts.VALID, 1);
  assert.equal(res.warnings.length, 1);
  assert.match(res.warnings[0], /names a different assignment/);
});

test('no Points Possible for the column: the panel asks for the points, then uses them', () => {
  const env = load();
  withFiles(env, standardZip(env), exportCsv({ points: false }));
  const first = run(env);
  assert.equal(first.success, false);
  assert.equal(first.needPoints, true);
  assert.equal(env.ss.getSheetByName('TurnInCanvasRuns'), null, 'nothing is logged');
  const res = run(env, { points: '2' });
  assert.equal(res.success, true);
  const upload = env.folder.files.find((f) => /^Turn-in upload/.test(f.name));
  const lines = upload._content.split('\n');
  assert.equal(lines.length, 9, 'no Points Possible row to copy');
  assert.equal(lines[1], '"Doe, Jane",101,' + ID.jane + ',' + ID.jane + ',8177 - Block 3,2');
});

test('the run refuses a wrong assignment ID, a column the export lacks, and files the folder doesn\'t offer', () => {
  const env = load();
  withFiles(env, standardZip(env));
  assert.match(run(env, { assignmentId: 'L05' }).error, /CAS assignment/);
  assert.match(run(env, { column: 'Nope (1)' }).error, /column/);
  assert.match(run(env, { zipId: 'csv-1' }).error, /ZIP/);
  assert.match(run(env, { exportId: 'notes-1' }).error, /export/);
  assert.match(run(env, { zipId: 'somewhere-else' }).error, /ZIP/);
});

test('a ZIP over the cap is read up to the cap and says so', () => {
  const env = load();
  const max = env.exported.TCC_FILES_MAX;
  const entries = [];
  for (let i = 0; i < max + 5; i++) entries.push({ name: 'x_' + ID.max + '_text.html', text: page('none') });
  withFiles(env, entries);
  const res = run(env);
  assert.equal(res.files, max);
  assert.match(res.warnings[0], new RegExp('More than ' + max));
  assert.equal(env.tab('TurnInCanvasRuns')[1][13], 'YES');
});

test('the panel lists the newest ZIPs and exports, and preselects the gradebook column', () => {
  const env = load();
  withFiles(env, standardZip(env));
  const files = plain(env.exported.getTurnInCanvasFiles());
  assert.equal(files.success, true);
  assert.deepEqual(files.zips.map((f) => f.id), ['zip-1']);
  assert.deepEqual(files.exports.map((f) => f.id), ['csv-1']);
  assert.ok(files.assignments.some((a) => a.id === L05 && a.name === 'Lesson 5: Market Research'));
  const cols = plain(env.exported.getTurnInCanvasColumns('csv-1', L05));
  assert.equal(cols.preselect, COLUMN);
  assert.equal(cols.hasPointsRow, true);
});

test('from the editor: the newest files, the assignment from TURN_IN_CANVAS_ASSIGNMENT', () => {
  const env = load();
  withFiles(env, standardZip(env));
  env.props.setProperty('TURN_IN_CANVAS_ASSIGNMENT', L05);
  const res = plain(env.exported.runTurnInCanvasCheck());
  assert.equal(res.success, true, res.error);
  assert.equal(res.column, COLUMN, 'the best-matching column');
  assert.equal(res.counts.VALID, 2);
});

// ── The panel: queue, grant, overrides ─────────────────────────────────────

test('the review queue: failed checks of the teacher\'s students without a code, and the not-yet answers', () => {
  const env = load({ switch: '8177' });
  const d = plain(env.exported.getTurnInPanelData());
  assert.equal(d.success, true);
  assert.equal(d.studentsSeeCodes, true);
  assert.deepEqual(d.queue.map((q) => [q.checkId, q.status]), [['TIC-MAX', 'CHECK_FAILED'], ['TIC-LIA', 'NOT_YET']]);
  const q = d.queue[0];
  assert.deepEqual([q.name, q.period, q.course, q.assignmentId, q.assignmentName],
    ['Student Four', '3', '8177', L05, 'Lesson 5: Market Research']);
  assert.match(q.answer, /survey of fans/);
  assert.match(q.reason, /No verdict/);
  assert.ok(!d.students.some((s) => s.name === 'Not Mine'), 'another teacher\'s student is not listed');
  const pat = d.students.find((s) => s.name === 'Student Three');
  assert.deepEqual(pat.items.map((i) => [i.assignmentId, i.code]), [[L05, ''], ['CAS-8177-L07', env.codes.pat7]]);
  assert.deepEqual(d.assignments.map((a) => a.id), [L05, 'CAS-8177-L05-P2', 'CAS-8177-L07']);
});

test('issuing a code from the queue needs a reason, records How = GRANT and the reason, and empties the item', () => {
  const env = load();
  for (const reason of ['', '  ', 'ok']) {
    assert.match(plain(env.exported.turnInPanelIssueForCheck('TIC-MAX', reason)).error, /needs a reason/);
  }
  assert.equal(env.tab('TurnInCodes').length, 4, 'nothing issued without a reason');
  const res = plain(env.exported.turnInPanelIssueForCheck('TIC-MAX', 'The check was down on Tuesday.'));
  assert.equal(res.success, true);
  assert.equal(res.already, false);
  assert.match(res.code, /^CAS-8177-L05-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  const row = env.tab('TurnInCodes').find((r) => r[0] === res.code);
  assert.deepEqual([row[1], row[2], row[3], row[7], row[8]], [acct('max'), L05, 'W-MAX-5', 'GRANT', 'The check was down on Tuesday.']);
  // The check row is left as it was; the queue no longer lists the answer.
  assert.equal(env.tab('TurnInChecks').find((r) => r[0] === 'TIC-MAX')[11], 'CHECK_FAILED');
  assert.deepEqual(plain(env.exported.getTurnInPanelData()).queue.map((q) => q.checkId), ['TIC-LIA']);
  // Again: the same code, already issued.
  const again = plain(env.exported.turnInPanelIssueForCheck('TIC-MAX', 'Twice.'));
  assert.deepEqual([again.code, again.already], [res.code, true]);
  // Overruling a NOT_YET verdict is the same grant.
  const lia = plain(env.exported.turnInPanelIssueForCheck('TIC-LIA', 'Their answer does address it.'));
  assert.equal(lia.success, true);
  assert.equal(env.tab('TurnInCodes').find((r) => r[0] === lia.code)[7], 'GRANT');
  // Another teacher's student, or an unknown answer: refused.
  assert.match(plain(env.exported.turnInPanelIssueForCheck('TIC-ZED', 'A reason.')).error, /one of your students/);
  assert.match(plain(env.exported.turnInPanelIssueForCheck('TIC-NOPE', 'A reason.')).error, /isn't in the TurnInChecks tab/);
});

test('giving a code: one student and assignment, with a reason; with the switch off too', () => {
  const env = load(); // the switch is off
  const d = plain(env.exported.getTurnInPanelData());
  assert.equal(d.success, true, 'the panel works with the switch off');
  assert.equal(d.studentsSeeCodes, false);
  assert.match(plain(env.exported.turnInPanelGrant(acct('rick'), 'W-RICK-5', '')).error, /needs a reason/);
  const res = plain(env.exported.turnInPanelGrant(acct('rick'), 'W-RICK-5', 'Absent for the outage.'));
  assert.equal(res.success, true);
  const row = env.tab('TurnInCodes').find((r) => r[0] === res.code);
  assert.deepEqual([row[1], row[2], row[7], row[8]], [acct('rick'), L05, 'GRANT', 'Absent for the outage.']);
  assert.match(plain(env.exported.turnInPanelGrant(acct('zed'), 'W-ZED-5', 'A reason.')).error, /isn't one of your students/);
  assert.match(plain(env.exported.turnInPanelGrant(acct('rick'), 'W-JANE-5', 'A reason.')).error, /isn't one of your students/);
});

test('opening and closing an assignment from the panel: a reason, a known assignment, an optional date', () => {
  const env = load();
  assert.match(plain(env.exported.turnInPanelOpenAssignment(L05, '')).error, /needs a reason/);
  assert.match(plain(env.exported.turnInPanelOpenAssignment('CAS-9999-L01', 'A reason.')).error, /one of your assignments/);
  assert.match(plain(env.exported.turnInPanelOpenAssignment(L05, 'A reason.', 'not a date')).error, /until must be a date/);
  const open = plain(env.exported.turnInPanelOpenAssignment(L05.toLowerCase(), 'Lesson ran across the marking period.', ''));
  assert.deepEqual([open.success, open.key, open.until], [true, L05, '']);
  const d = plain(env.exported.getTurnInPanelData());
  assert.deepEqual(d.overrides.map((o) => [o.key, o.name, o.reason, o.until]),
    [[L05, 'Lesson 5: Market Research', 'Lesson ran across the marking period.', '']]);
  assert.match(plain(env.exported.turnInPanelCloseAssignment(L05, '')).error, /needs a reason/);
  const closed = plain(env.exported.turnInPanelCloseAssignment(L05, 'Done.'));
  assert.deepEqual([closed.success, closed.closed], [true, 1]);
  assert.deepEqual(plain(env.exported.getTurnInPanelData()).overrides, []);
});

// ── Who can call ───────────────────────────────────────────────────────────

test('every panel function refuses anyone but the teacher, and none is on the public allowlist', () => {
  const env = load();
  withFiles(env, standardZip(env));
  env.state.who = acct('jane');
  const calls = [
    () => env.exported.getTurnInPanelData(),
    () => env.exported.turnInPanelIssueForCheck('TIC-MAX', 'Let me in.'),
    () => env.exported.turnInPanelGrant(acct('jane'), 'W-JANE-5', 'Let me in.'),
    () => env.exported.turnInPanelOpenAssignment(L05, 'Let me in.'),
    () => env.exported.turnInPanelCloseAssignment(L05, 'Let me in.'),
    () => env.exported.getTurnInCanvasFiles(),
    () => env.exported.getTurnInCanvasColumns('csv-1', L05),
    () => env.exported.runTurnInCanvasCheckFromPanel({ assignmentId: L05, column: COLUMN, zipId: 'zip-1', exportId: 'csv-1' }),
  ];
  calls.forEach((call) => assert.deepEqual(plain(call()), { success: false, error: 'Not authorized.' }));
  assert.equal(env.tab('TurnInCodes').length, 4);
  assert.equal(env.ss.getSheetByName('TurnInOverrides'), null);
  assert.equal(env.ss.getSheetByName('TurnInCanvasRuns'), null);
  // The editor functions: the script's owner only.
  assert.throws(() => env.exported.runTurnInCanvasCheck(), /Not authorized/);
  assert.throws(() => env.exported.grantTurnInCode(acct('jane'), 'W-JANE-5', 'Let me in.'), /Not authorized/);
  assert.throws(() => env.exported.openTurnInForAssignment(L05, 'Let me in.'), /Not authorized/);
  const listed = Object.keys(allow['cas-ccps:teacher-dashboard'] || {});
  for (const name of ['getTurnInPanelData', 'turnInPanelIssueForCheck', 'turnInPanelGrant', 'turnInPanelOpenAssignment',
    'turnInPanelCloseAssignment', 'getTurnInCanvasFiles', 'getTurnInCanvasColumns', 'runTurnInCanvasCheckFromPanel',
    'runTurnInCanvasCheck', 'getMyTurnInState', 'submitTurnInAnswer']) {
    assert.ok(!listed.includes(name), name);
  }
  // The student functions aren't in the Teacher Dashboard project at all.
  assert.ok(!projectMap['cas-ccps:teacher-dashboard'].files.some((f) => /71b_TurnInStudent/.test(f)));
});

// ── The page ───────────────────────────────────────────────────────────────

test('the dashboard has the Turn-in codes button and panel, and the panel calls only the guarded functions', () => {
  const env = load();
  const html = env.exported.buildDashboardHtml_();
  assert.match(html, /<button id="turnin-btn" onclick="openTurnInPanel\(\)" aria-haspopup="dialog"><span aria-hidden="true">🎟<\/span> Turn-in codes<\/button>/);
  assert.match(html, /id="turnin-modal-backdrop"[\s\S]*role="dialog" aria-modal="true" aria-labelledby="turnin-modal-title"/);
  assert.match(html, /<div id="tic-live" class="tic-sr" role="status" aria-live="polite">/);
  const start = html.indexOf('// ── Turn-in codes (73_TurnInTeacherPanel.js');
  const block = html.slice(start, html.indexOf('function openParentReportModal()'));
  assert.ok(start > 0);
  const called = [...new Set([...block.matchAll(/\.(getTurnIn\w+|turnInPanel\w+|runTurnIn\w+)\(/g)].map((m) => m[1]))].sort();
  assert.deepEqual(called, ['getTurnInCanvasColumns', 'getTurnInCanvasFiles', 'getTurnInPanelData', 'runTurnInCanvasCheckFromPanel',
    'turnInPanelCloseAssignment', 'turnInPanelGrant', 'turnInPanelIssueForCheck', 'turnInPanelOpenAssignment']);
  assert.ok(!/issue all|Issue all/.test(block), 'no bulk issue');
  assert.match(block, /delete the ZIP/);
  assert.match(block, /Canvas leaves a grade as it is when the cell is blank/);
});
