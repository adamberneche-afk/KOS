'use strict';
// Regression tests for 39_FlowFixtures.js — persistent dummy data parked at
// every flow's trigger condition, so a flow can be built and Test Run in
// Studio's UI against something real.
//
// What matters here, in priority order:
//   1. Every flow gets a row at the RIGHT status. A fixture parked at the
//      wrong status is worse than none — the flow silently never fires and
//      you debug the flow instead of the fixture.
//   2. Idempotency. These are meant to be re-run as live flows consume them,
//      so a second run must not duplicate.
//   3. Removal is exact. It must clear fixtures and nothing else — this runs
//      against a spreadsheet holding real student rows.
//   4. The namespaces stay separate from 35_FlowPreflightAndCanary.js's
//      canary markers, so neither one's cleanup can eat the other's rows.
//
// Loaded with the central-ledger files the fixtures reference: 00_SharedConfig.js
// (getConfig_/LEDGER), 24_WarmUpBridge.js (WQ24_* constants),
// 37_FlowInputBuilder.js (FI, _fiEnsureTab_) and the fixtures themselves.
// 22_LessonContextHandler.js comes along because 24_WarmUpBridge.js calls its
// _normalizeLessonDateCell_ — same one GAS project, see
// tools/gas-lint/project-map.json.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [
  S('00_SharedConfig.js'), S('22_LessonContextHandler.js'), S('24_WarmUpBridge.js'),
  S('37_FlowInputBuilder.js'), S('39_FlowFixtures.js'),
];

function load() {
  return loadGasFiles(FILES, [
    'installFlowFixtures', 'installFlow1Fixture', 'installFlow2Fixture',
    'installWarmUpFixtures', 'checkFlowFixtures', 'removeFlowFixtures',
    'FI', 'WQ24_QUEUE_ID', 'WQ24_STATUS', 'WQ24_LESSON_CTX_SNAP',
    'WQ24_STUDENT_PROFILE_SNAP', 'WQ24_RESPONSE_TEXT', 'WQ24_COL_COUNT',
    'FX_QUEUE_PREFIX', 'FX_CONFIG_PREFIX', 'FX_TEACHER_EMAIL', 'FX_STUDENT_EMAIL',
  ]);
}

function setUp(sandbox, opts = {}) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (opts.adminRootFolderId !== null) {
    props.setProperty('ADMIN_ROOT_FOLDER_ID', opts.adminRootFolderId || 'fake-root-folder');
  }
  ss.insertSheet('RubricQueue').appendRow([
    'Timestamp', 'TeacherEmail', 'TeacherName', 'Subject', 'CourseName',
    'Tier', 'RubricText', 'PromptTemplateID', 'TeacherMatrixSsId', 'Status']);
  if (opts.warmUpQueue !== false) {
    ss.insertSheet('WarmUpQueue').appendRow(new Array(21).fill('header'));
  }
  // SpreadsheetApp.create() doesn't self-register for openById() in this
  // harness the way the real API does — bridge it so the fixtures' own
  // scratch-spreadsheet creation resolves.
  const realCreate = sandbox.SpreadsheetApp.create;
  sandbox.SpreadsheetApp.create = function (name) {
    const created = realCreate.call(sandbox.SpreadsheetApp, name);
    sandbox.SpreadsheetApp._registry.set(created.getId(), created);
    return created;
  };
  return ss;
}

// ── Every flow gets a row at the right status ────────────────────────────────

test('installFlowFixtures: seeds all five flows, each at its own trigger status', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  const result = exported.installFlowFixtures();
  assert.equal(result.seeded, 5, 'Flow 1 + Flow 2 + three warm-up rows');

  // Flow 1 — RubricQueue, PENDING_EXTRACTION (status is column 10, index 9).
  const rq = ss.getSheetByName('RubricQueue').getDataRange().getValues();
  const rqRow = rq.find((r) => String(r[1]).trim() === exported.FX_TEACHER_EMAIL);
  assert.ok(rqRow, 'a RubricQueue fixture row exists');
  assert.equal(rqRow[9], 'PENDING_EXTRACTION');

  // Flow 2 — FlowInput, READY.
  const fi = ss.getSheetByName('FlowInput').getDataRange().getValues();
  const fiRow = fi.find((r) => String(r[exported.FI.STUDENT_EMAIL]).trim() === exported.FX_STUDENT_EMAIL);
  assert.ok(fiRow, 'a FlowInput fixture row exists');
  assert.equal(fiRow[exported.FI.READY_STATUS], 'READY');

  // Flows 5/3/4 — WarmUpQueue, one row at each watched status. The real
  // machine is PENDING_BRIDGE -> PENDING -> DELIVERED -> PENDING_EVAL -> SCORED,
  // and Flow 4 triggers on PENDING_EVAL (not DELIVERED — that hop belongs to
  // 25_WarmUpWriter.js), so all three Studio-watched statuses must be present
  // at once or one of the three flows has nothing to build against.
  const wq = ss.getSheetByName('WarmUpQueue').getDataRange().getValues();
  const statusOf = (suffix) => {
    const row = wq.find((r) =>
      String(r[exported.WQ24_QUEUE_ID]).trim() === exported.FX_QUEUE_PREFIX + suffix);
    return row ? String(row[exported.WQ24_STATUS]).trim() : null;
  };
  assert.equal(statusOf('F5'), 'PENDING_BRIDGE');
  assert.equal(statusOf('F3'), 'PENDING');
  assert.equal(statusOf('F4'), 'PENDING_EVAL');
});

test('installFlow2Fixture: the FlowInput row is fully populated, so every Studio chip resolves', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();

  const fi = ss.getSheetByName('FlowInput').getDataRange().getValues();
  const row = fi[fi.length - 1];
  const FI = exported.FI;

  // The whole point of the fixture: no blanks in anything Ask Gemini reads,
  // because a blank chip is indistinguishable from a broken binding.
  [
    FI.STUDENT_FILE_ID, FI.CONFIG_ID, FI.TEACHER_EMAIL, FI.STUDENT_EMAIL,
    FI.STUDENT_DOC_URL, FI.UNIT_NAME, FI.TIER, FI.PERSONA,
    FI.MILESTONE_1, FI.MILESTONE_2, FI.MILESTONE_3, FI.MILESTONE_4,
    FI.DEFINITION_OF_DONE,
    FI.MILESTONE_1_COMPETENCY_ID, FI.MILESTONE_2_COMPETENCY_ID,
    FI.MILESTONE_3_COMPETENCY_ID, FI.MILESTONE_4_COMPETENCY_ID,
    FI.READY_STATUS,
  ].forEach((idx) => {
    assert.ok(String(row[idx]).trim().length > 0, 'column ' + idx + ' must not be blank');
  });

  assert.match(String(row[FI.STUDENT_DOC_URL]), /^https:\/\/docs\.google\.com\/document\/d\/.+\/edit$/);
  assert.equal(row[FI.GEMINI_FULL_OUTPUT], '', 'left empty — Studio writes this');
  // Non-numeric on purpose: _fiMarkStagingComplete_ then finds no matching
  // STAGING_PIPELINE row and says so, rather than completing a real one.
  assert.ok(Number.isNaN(parseInt(row[FI.STAGING_ROW_REF], 10)));
});

test('installWarmUpFixtures: snapshots are valid JSON carrying the keys the flows read', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();

  const wq = ss.getSheetByName('WarmUpQueue').getDataRange().getValues();
  const rowFor = (suffix) => wq.find((r) =>
    String(r[exported.WQ24_QUEUE_ID]).trim() === exported.FX_QUEUE_PREFIX + suffix);

  // Flow 3 reads lesson_context_snapshot + student_profile_snapshot and
  // resolves the doc folder from admin_root_folder_id.
  const f3 = rowFor('F3');
  const ctx = JSON.parse(f3[exported.WQ24_LESSON_CTX_SNAP]);
  const profile = JSON.parse(f3[exported.WQ24_STUDENT_PROFILE_SNAP]);
  ['lesson_id', 'objective', 'competency_ids', 'course_name', 'admin_root_folder_id',
   'pacing_prior_connection'].forEach((k) => {
    assert.ok(k in ctx, 'lesson context must carry ' + k);
  });
  ['student_email', 'competency_gaps', 'warmup_scores', 'shadow_matrix'].forEach((k) => {
    assert.ok(k in profile, 'profile must carry ' + k);
  });

  // Flow 5's row is the RETURNING-student case — the prior-response fields
  // are exactly what makes buildWarmUpQueues() start a row at PENDING_BRIDGE.
  const f5ctx = JSON.parse(rowFor('F5')[exported.WQ24_LESSON_CTX_SNAP]);
  assert.ok(f5ctx.flow5_prior_response, 'Flow 5 needs a prior response to bridge from');
  assert.ok(f5ctx.flow5_prior_date);
  assert.ok('flow5_prior_score' in f5ctx);
  assert.equal('flow5_prior_response' in ctx, false,
    'the Flow 3 row is the first-week case and must NOT carry prior-response data');

  // Flow 4 reads response_text off the trigger row, not from the doc.
  assert.ok(String(rowFor('F4')[exported.WQ24_RESPONSE_TEXT]).trim().length > 0);
});

test('installWarmUpFixtures: reports cleanly when the WarmUpQueue tab does not exist', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { warmUpQueue: false });

  const result = exported.installWarmUpFixtures();
  assert.equal(result.seeded, 0);
  assert.match(result.error, /WarmUpQueue/);
});

// ── Idempotency: fixtures are meant to be re-run ─────────────────────────────

test('installFlowFixtures: a second run seeds nothing and duplicates nothing', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  exported.installFlowFixtures();
  const second = exported.installFlowFixtures();

  assert.equal(second.seeded, 0);
  // skipped counts ROWS, symmetric with seeded — 1 + 1 + 3, not one per flow.
  assert.equal(second.skipped, 5, 'every already-present row is reported, not one per flow');

  const count = (tab, idx, needle) => ss.getSheetByName(tab).getDataRange().getValues()
    .filter((r) => String(r[idx]).trim() === needle).length;
  assert.equal(count('RubricQueue', 1, exported.FX_TEACHER_EMAIL), 1);
  assert.equal(count('FlowInput', exported.FI.STUDENT_EMAIL, exported.FX_STUDENT_EMAIL), 1);
  assert.equal(count('WarmUpQueue', exported.WQ24_QUEUE_ID, exported.FX_QUEUE_PREFIX + 'F3'), 1);
});

// ── checkFlowFixtures ────────────────────────────────────────────────────────

test('checkFlowFixtures: reports 5 of 5 ready once seeded, 0 of 5 before', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);

  const before = exported.checkFlowFixtures();
  assert.equal(before.ready, 0);
  assert.equal(before.total, 5);

  exported.installFlowFixtures();
  const after = exported.checkFlowFixtures();
  assert.equal(after.ready, 5);
});

test('checkFlowFixtures: a consumed fixture reads as not-ready, and says why', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlowFixtures();

  // Simulate a live Flow 5 having advanced its fixture, which is what
  // success looks like from the flow's side.
  const wq = ss.getSheetByName('WarmUpQueue');
  const data = wq.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][exported.WQ24_QUEUE_ID]).trim() === exported.FX_QUEUE_PREFIX + 'F5') {
      wq.getRange(i + 1, exported.WQ24_STATUS + 1).setValue('PENDING');
    }
  }

  const report = exported.checkFlowFixtures();
  assert.equal(report.ready, 4);
  const f5 = report.report.find((r) => r.label.indexOf('Flow 5') === 0);
  assert.equal(f5.ok, false);
  assert.match(f5.detail, /already consumed it/,
    'must explain that a consumed fixture is a pass for the flow, not a failure');
});

// ── Removal is exact ─────────────────────────────────────────────────────────

test('removeFlowFixtures: clears every fixture row and leaves real rows untouched', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);

  // Real rows that must survive, in every tab the remover touches.
  ss.getSheetByName('RubricQueue').appendRow([
    new Date(), 'real.teacher@ccpsnet.net', 'Real Teacher', 'CTE', 'Real Course',
    'Tier 1 Core', 'Real rubric text', 'real-template-id', 'real-matrix-id',
    'PENDING_EXTRACTION']);
  const realWq = new Array(21).fill('');
  realWq[exported.WQ24_QUEUE_ID] = 'WUQ-REAL-1';
  realWq[exported.WQ24_STATUS] = 'PENDING';
  ss.getSheetByName('WarmUpQueue').appendRow(realWq);

  exported.installFlowFixtures();
  const result = exported.removeFlowFixtures();

  assert.equal(result.cleared, 5);

  const gone = (tab, idx, needle) => ss.getSheetByName(tab).getDataRange().getValues()
    .every((r) => String(r[idx]).trim() !== needle);
  assert.ok(gone('RubricQueue', 1, exported.FX_TEACHER_EMAIL));
  assert.ok(gone('FlowInput', exported.FI.STUDENT_EMAIL, exported.FX_STUDENT_EMAIL));
  assert.ok(gone('WarmUpQueue', exported.WQ24_QUEUE_ID, exported.FX_QUEUE_PREFIX + 'F5'));

  const survives = (tab, idx, needle) => ss.getSheetByName(tab).getDataRange().getValues()
    .some((r) => String(r[idx]).trim() === needle);
  assert.ok(survives('RubricQueue', 1, 'real.teacher@ccpsnet.net'), 'real rubric row survives');
  assert.ok(survives('WarmUpQueue', exported.WQ24_QUEUE_ID, 'WUQ-REAL-1'), 'real queue row survives');
});

test('removeFlowFixtures: trashes the scratch files the fixtures created', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  exported.installFlowFixtures();

  const result = exported.removeFlowFixtures();
  // Flow 1's prompt template + its scratch TeacherMatrix, and Flow 2's
  // student doc. Flow 3's own doc column is empty until a live flow fills it.
  assert.ok(result.trashed >= 3, 'trashed ' + result.trashed + ', expected at least 3');
});

test('removeFlowFixtures: on a spreadsheet with no fixtures, clears nothing and does not throw', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.removeFlowFixtures();
  assert.equal(result.cleared, 0);
});

// ── Namespace separation from the canaries ───────────────────────────────────

test('fixture markers never collide with the canary markers in file 35', () => {
  const { exported } = load();
  // 35_FlowPreflightAndCanary.js uses VDOE-CANARY-* and canary-test+*@example.invalid.
  // If either namespace ever overlapped, one cleanup could eat the other's rows.
  assert.equal(exported.FX_CONFIG_PREFIX.indexOf('CANARY'), -1);
  assert.equal(exported.FX_QUEUE_PREFIX.indexOf('CANARY'), -1);
  assert.equal(exported.FX_TEACHER_EMAIL.indexOf('canary'), -1);
  assert.equal(exported.FX_STUDENT_EMAIL.indexOf('canary'), -1);
  // And both stay inside the reserved, non-deliverable TLD.
  assert.ok(exported.FX_TEACHER_EMAIL.endsWith('@example.invalid'));
  assert.ok(exported.FX_STUDENT_EMAIL.endsWith('@example.invalid'));
});
