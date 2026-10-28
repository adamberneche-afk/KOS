'use strict';
// Regression tests for 29_StudentContextAggregator.js's student-ID
// validation and its per-teacher redaction boundary (Finding 2 / "this
// month" test coverage). The redaction boundary matters most: the file's
// own "FIXED (FERPA leak)" comment above getAllStudentDocsForTeacher_
// records that this function used to return every student in the district
// to any authorized teacher — these tests pin that fix down permanently.
//
// Loaded together with 00_SharedConfig.js because _studentEmailDomain_()
// calls getConfig_() — both files are bound to the same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const AGGREGATOR_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '29_StudentContextAggregator.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, AGGREGATOR_PATH],
    ['buildValidatedStudentRoster_', 'getAllStudentDocsForTeacher_', 'getStudentDocForViewer_', '_studentIdPattern_'],
  );
}

// Ledger row layout this file actually reads (see its own [1]/[4]/[8]
// index comments): [1]=GoogleID, [4]=StudentName, [8]=TeacherEmail.
// Only those three columns are populated here; everything else this test
// doesn't touch is left blank, matching the file's own tolerance for
// sparse rows (String(row[n] || "")).
function ledgerRow({ googleId, name, teacherEmail }) {
  const row = new Array(9).fill('');
  row[1] = googleId;
  row[4] = name;
  row[8] = teacherEmail;
  return row;
}

function setUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(9).fill('header'));
  ledger.appendRow(ledgerRow({ googleId: '1234567@ccpsnet.net', name: 'Alice', teacherEmail: 'teacherA@ccpsnet.net' }));
  ledger.appendRow(ledgerRow({ googleId: '2345678@ccpsnet.net', name: 'Bob', teacherEmail: 'teacherB@ccpsnet.net' }));
  // Malformed GoogleID (5 digits, not the required 7) — must never reach
  // the roster or any teacher's doc list, no matter whose class it's in.
  ledger.appendRow(ledgerRow({ googleId: '12345@ccpsnet.net', name: 'Malformed', teacherEmail: 'teacherA@ccpsnet.net' }));

  const registry = ss.insertSheet('StudentDocRegistry');
  registry.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at', 'last_updated_at', 'last_run_had_content']);
  registry.appendRow(['1234567@ccpsnet.net', 'Alice', 'doc-alice', 'https://docs.google.com/document/d/doc-alice/edit', new Date(), '', '']);
  registry.appendRow(['2345678@ccpsnet.net', 'Bob', 'doc-bob', 'https://docs.google.com/document/d/doc-bob/edit', new Date(), '', '']);

  return { ss, ledger, registry };
}

// ── ID validation ────────────────────────────────────────────────────────

test('_studentIdPattern_: accepts exactly 7 digits @ the configured district domain', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const pattern = exported._studentIdPattern_();
  assert.equal(pattern.test('1234567@ccpsnet.net'), true);
  assert.equal(pattern.test('123456@ccpsnet.net'), false);   // 6 digits
  assert.equal(pattern.test('12345678@ccpsnet.net'), false); // 8 digits
  assert.equal(pattern.test('1234567@gmail.com'), false);    // wrong domain
  assert.equal(pattern.test('notanumber@ccpsnet.net'), false);
});

test('buildValidatedStudentRoster_: excludes malformed GoogleIDs, keeps valid ones', () => {
  const { exported, sandbox } = load();
  const { ledger } = setUpFixture(sandbox);

  const roster = exported.buildValidatedStudentRoster_(ledger);
  assert.equal(roster.size, 2);
  assert.equal(roster.get('1234567@ccpsnet.net'), 'Alice');
  assert.equal(roster.get('2345678@ccpsnet.net'), 'Bob');
  assert.equal(roster.has('12345@ccpsnet.net'), false);
});

// ── The redaction boundary — FERPA fix regression ───────────────────────────

test('getAllStudentDocsForTeacher_: a teacher sees only their own students, never another teacher\'s', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  const teacherAResults = exported.getAllStudentDocsForTeacher_('teacherA@ccpsnet.net');
  assert.equal(teacherAResults.length, 1);
  assert.equal(teacherAResults[0].email, '1234567@ccpsnet.net');

  const teacherBResults = exported.getAllStudentDocsForTeacher_('teacherB@ccpsnet.net');
  assert.equal(teacherBResults.length, 1);
  assert.equal(teacherBResults[0].email, '2345678@ccpsnet.net');
});

test('getAllStudentDocsForTeacher_: an unrecognized teacher email sees nobody, not everybody', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.deepEqual(exported.getAllStudentDocsForTeacher_('stranger@ccpsnet.net'), []);
});

test('getAllStudentDocsForTeacher_: no teacher identity at all -> empty, never the full roster', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.deepEqual(exported.getAllStudentDocsForTeacher_(''), []);
  assert.deepEqual(exported.getAllStudentDocsForTeacher_(undefined), []);
});

test('getStudentDocForViewer_: a student sees only their own doc info', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  const own = exported.getStudentDocForViewer_('2345678@ccpsnet.net');
  assert.equal(own.docId, 'doc-bob');
});

test('getStudentDocForViewer_: a viewer with no registry row gets null, never someone else\'s doc', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  assert.equal(exported.getStudentDocForViewer_('9999999@ccpsnet.net'), null);
});

// ── Text-box warm-ups and baseline answers (2026-10-24) ─────────────────────
// Every warm-up since 2026-10-19 is answered in the Student Dashboard's text
// box, which this record never read; baseline answers (41, D6) go under
// their own heading.

function loadWithWarmUps() {
  const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
  return loadGasFiles(
    [SHARED_CONFIG_PATH, path.join(CC, '24_WarmUpBridge.js'), path.join(CC, '41_WarmUpFlowBridge.js'), AGGREGATOR_PATH],
    ['getWeeklyTextBoxWarmUps_', 'mergeWarmUpMaps_', 'appendWeeklySection_'],
    { Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => 'teacher@ccpsnet.net' }) } },
  );
}

function warmUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('h'));
  const tb = ss.insertSheet('WarmUpTextBox');
  tb.appendRow(['queue_id', 'lesson_date', 'bridge_text', 'warmup_text', 'response_text', 'submitted_at', 'reply_text', 'replied_at']);
  const add = (id, email, date, archetype, question, answer, savedAt) => {
    const r = new Array(21).fill('');
    r[0] = id; r[4] = email; r[5] = date; r[8] = 'SCORED'; r[19] = archetype;
    wq.appendRow(r);
    tb.appendRow([id, date, '', question, answer, savedAt, '', '']);
  };
  const recent = new Date(Date.now() - 2 * 86400000);
  add('Q1', '1234567@CCPSNET.net', '2026-10-21', 'BASELINE 8175-14', 'How do you keep track of time?', 'I use a planner and my coach reminds me.', recent);
  add('Q2', '1234567@ccpsnet.net', '2026-10-22', 'PARADOX', 'Why pay $5 for water?', 'Because it is the only water there.', recent);
  add('Q3', '1234567@ccpsnet.net', '2026-10-01', 'BRIDGE', 'Old question', 'Old answer', new Date(Date.now() - 20 * 86400000));
  add('Q4', '2345678@ccpsnet.net', '2026-10-22', 'BASELINE 8175-3', 'Started alone?', '', recent); // blank: not shown
  return ss;
}

test('getWeeklyTextBoxWarmUps_: this week\'s answered text-box warm-ups, with the baseline skill named', () => {
  const { exported, sandbox } = loadWithWarmUps();
  const ss = warmUpFixture(sandbox);
  const cfg = { tabs: { warmUpQueue: 'WarmUpQueue', warmUpTextBox: 'WarmUpTextBox' } };
  const map = exported.getWeeklyTextBoxWarmUps_(ss, cfg, new Date(Date.now() - 7 * 86400000));
  const mine = map.get('1234567@ccpsnet.net');
  assert.equal(mine.length, 2, 'the 20-day-old one is outside the week');
  assert.deepEqual(mine.map((w) => w.baseline), ['Manage time and resources', '']);
  assert.equal(mine[0].question, 'How do you keep track of time?');
  assert.equal(map.has('2345678@ccpsnet.net'), false, 'a blank answer is not shown');

  const merged = exported.mergeWarmUpMaps_(new Map([['1234567@ccpsnet.net', []]]), map);
  assert.equal(merged.get('1234567@ccpsnet.net').length, 2, 'matched to the roster\'s spelling');
});

test('appendWeeklySection_: baseline answers go under "How They Work", lesson ones under "Warm-Up Reflections"', () => {
  const { exported, sandbox } = loadWithWarmUps();
  const doc = sandbox.DocumentApp.create('Student Context');
  const now = new Date();
  exported.appendWeeklySection_(doc.getId(), now, [], [
    { lessonUnitId: 'Warm-up for 2026-10-21', response: 'I use a planner.', timestamp: now, question: 'How do you keep track?', baseline: 'Manage time and resources' },
    { lessonUnitId: 'Warm-up for 2026-10-22', response: 'Only water there.', timestamp: now, question: 'Why pay $5?', baseline: '' },
  ]);
  const text = sandbox.DocumentApp.openById(doc.getId()).getBody().getText();
  const how = text.indexOf('How They Work (baseline warm-ups)');
  const refl = text.indexOf('Warm-Up Reflections');
  assert.ok(how !== -1 && refl > how);
  assert.ok(text.indexOf('Manage time and resources') > how && text.indexOf('Manage time and resources') < refl);
  assert.ok(text.indexOf('Asked: How do you keep track?') !== -1 && text.indexOf('I use a planner.') !== -1);
  assert.ok(text.indexOf('Only water there.') > refl);
});

// 2026-10-28: each week's heading gets a bookmark, the dashboards' link
// straight to that week; addContextWeekBookmarks() adds one to older weeks.
test('appendWeeklySection_: the week heading is bookmarked', () => {
  const { exported, sandbox } = loadWithWarmUps();
  const doc = sandbox.DocumentApp.create('Student Context');
  exported.appendWeeklySection_(doc.getId(), new Date(2026, 9, 26), [], []);
  const marks = doc.getBookmarks();
  assert.equal(marks.length, 1);
  assert.equal(marks[0].getPosition().element.getText(), 'Week of October 26, 2026');
});

test('addContextWeekBookmarks: bookmarks each older week once; a re-run adds nothing', () => {
  const { exported, sandbox } = loadGasFiles([SHARED_CONFIG_PATH, AGGREGATOR_PATH], ['addContextWeekBookmarks']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const doc = sandbox.DocumentApp.create('Context');
  const body = doc.getBody();
  body.appendParagraph('STUDENT CONTEXT RECORD').setHeading('HEADING1');
  const w1 = body.appendParagraph('Week of October 19, 2026').setHeading('HEADING2');
  body.appendParagraph('Completed Assignments').setHeading('HEADING3');
  const w2 = body.appendParagraph('Week of October 26, 2026').setHeading('HEADING2');
  doc.addBookmark(doc.newPosition(w2, 0));
  const reg = ss.insertSheet('StudentDocRegistry');
  reg.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at', 'last_updated_at', 'last_run_had_content']);
  reg.appendRow(['1234567@ccpsnet.net', 'A', doc.getId(), 'u', new Date(), '', '']);
  reg.appendRow(['2345678@ccpsnet.net', 'B', 'missing-doc', 'u', new Date(), '', '']);
  const out = exported.addContextWeekBookmarks();
  assert.deepEqual({ docs: out.docs, added: out.added, failed: out.failed }, { docs: 1, added: 1, failed: 1 });
  assert.deepEqual(doc.getBookmarks().map((b) => b.getPosition().element), [w2, w1]);
  assert.equal(exported.addContextWeekBookmarks().added, 0);
});

// ── The Run-menu entry points (2026-10-27) ──────────────────────────────────
// The installer and tab creator end in "_", hidden from the editor's Run
// dropdown, so the weekly trigger was never installed and no doc existed.

function loadRun() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, AGGREGATOR_PATH],
    ['setupStudentContextDocs', 'previewStudentContextDocs', 'buildStudentContextDocsNow', 'runWeeklyStudentAggregation_'],
    { Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => 'teacher@ccpsnet.net' }) } },
  );
}

function runFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(9).fill('header'));
  ledger.appendRow(ledgerRow({ googleId: '1234567@ccpsnet.net', name: 'Alice', teacherEmail: 'teacher@ccpsnet.net' }));
  ledger.appendRow(ledgerRow({ googleId: '2345678@ccpsnet.net', name: 'Bob', teacherEmail: 'teacher@ccpsnet.net' }));
  return ss;
}

test('setupStudentContextDocs: makes both tabs and the weekly trigger, once', () => {
  const { exported, sandbox } = loadRun();
  const ss = runFixture(sandbox);
  assert.equal(exported.setupStudentContextDocs().triggerInstalled, true);
  exported.setupStudentContextDocs();
  assert.ok(ss.getSheetByName('StudentDocRegistry') && ss.getSheetByName('WarmUpResponses'));
  const handlers = sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction());
  assert.deepEqual(handlers, ['runWeeklyStudentAggregation_']);
});

test('preview changes nothing; a run makes a doc only for a student with something this week; a re-run adds nothing', () => {
  const { exported, sandbox } = loadRun();
  const ss = runFixture(sandbox);
  assert.match(exported.previewStudentContextDocs().error, /setupStudentContextDocs/);
  exported.setupStudentContextDocs();
  const wur = ss.getSheetByName('WarmUpResponses');
  wur.appendRow([new sandbox.Date(Date.now() - 86400000), '1234567', 'L07', 'I would ask my manager first.']);

  const preview = exported.previewStudentContextDocs();
  assert.equal(preview.dryRun, true);
  assert.equal(preview.created, 1);
  assert.equal(preview.noContent, 1);
  assert.equal(ss.getSheetByName('StudentDocRegistry').getLastRow(), 1, 'preview made no doc');

  const run = exported.buildStudentContextDocsNow();
  assert.equal(run.created, 1);
  const reg = ss.getSheetByName('StudentDocRegistry').getDataRange().getValues();
  assert.equal(reg.length, 2);
  assert.equal(reg[1][0], '1234567@ccpsnet.net');

  const again = exported.buildStudentContextDocsNow();
  assert.equal(again.created + again.updated, 0, 'nothing new since the last section, so no second week');

  wur.appendRow([new sandbox.Date(Date.now() + 1000), '1234567', 'L08', 'A newer answer.']);
  assert.equal(exported.buildStudentContextDocsNow().updated, 1, 'only what is new');
});
