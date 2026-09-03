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
  S('25_WarmUpWriter.js'), S('37_FlowInputBuilder.js'), S('39_FlowFixtures.js'),
  S('41_WarmUpFlowBridge.js'),
  // 15b holds FLOW_2_SYSTEM_PROMPT and 40 holds substituteFlowPrompt_. Both
  // are bound to cas-ccps:central-ledger alongside everything above, so they
  // are in scope in production — but this sandbox was loading neither, and
  // _fiBuildPromptText_ degrades to "" when they are missing rather than
  // throwing. The result was a fixture seeding an empty PromptText while the
  // tests looked green. Load the real scope, so the tests see what Studio
  // would.
  S('15b_StudioFlowPrompts_Flow2_Revised.js'), S('40_FlowPrompts.js'),
];

function load() {
  return loadGasFiles(FILES, [
    'installFlowFixtures', 'installFlow1Fixture', 'installFlow2Fixture',
    '_fiFindTeacherMatrixRow_',
    'installWarmUpFixtures', 'checkFlowFixtures', 'removeFlowFixtures',
    'FI', 'WQ24_QUEUE_ID', 'WQ24_STATUS', 'WQ24_LESSON_CTX_SNAP',
    'WQ24_STUDENT_PROFILE_SNAP', 'WQ24_RESPONSE_TEXT', 'WQ24_COL_COUNT',
    'FX_QUEUE_PREFIX', 'FX_CONFIG_PREFIX', 'FX_TEACHER_EMAIL', 'FX_STUDENT_EMAIL',
    // 41_WarmUpFlowBridge.js — the fixtures exist to feed it, so the
    // end-to-end tests at the bottom of this file drive it directly.
    'buildWarmUpFlowInputs', 'wfbBuildFlow3Fields_', 'evaluateWarmUpDoc_',
    'WQ24_DOC_ID', 'WQ24_WORD_COUNT_SCORE', 'WFB_INPUT_TABS',
    'WFB_FLOW3_HEADERS', 'WFB_FLOW4_HEADERS', 'WFB_FLOW5_HEADERS',
    'RESPONSE_ZONE_MARKER',
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

// ── The fixtures against 41_WarmUpFlowBridge.js ──────────────────────────────
//
// The whole point of the warm-up fixtures is that Flows 3, 4 and 5 have
// something to match. Seeding a WarmUpQueue row at the right STATUS is not
// enough for that — the bridge also has to be able to materialize an input
// row from it, and each flow needs different things present before it can:
//
//   Flow 5  a flow5_prior_response inside the lesson snapshot
//   Flow 3  BOTH snapshots, parseable, with the folder-path fields
//   Flow 4  a real Doc_ID whose document carries the zone markers
//
// Flow 4 is the one that silently didn't work: a status-only row makes
// wfbBuildFlow4Row_ log "no Doc_ID — skipped" and write nothing, so the flow
// had nothing to latch onto while the fixture looked installed.

test('the fixtures materialize an input row for all three flows', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  exported.installWarmUpFixtures();

  const built = exported.buildWarmUpFlowInputs();
  assert.equal(built.flow5, 1, 'Flow 5: ' + JSON.stringify(built));
  assert.equal(built.flow3, 1, 'Flow 3: ' + JSON.stringify(built));
  assert.equal(built.flow4, 1, 'Flow 4 — a status-only fixture would be 0 here: ' +
    JSON.stringify(built));
});

test('materializing twice does not duplicate — two docs per student would follow', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  exported.installWarmUpFixtures();
  exported.buildWarmUpFlowInputs();
  const second = exported.buildWarmUpFlowInputs();
  assert.equal(second.flow3 + second.flow4 + second.flow5, 0);
  assert.equal(second.skipped, 3);
});

test('the Flow 4 fixture brings a real document, with extractable zones', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();

  const rows = ss.getSheetByName('WarmUpQueue').getDataRange().getValues();
  const f4 = rows.find((r) => String(r[exported.WQ24_QUEUE_ID]).indexOf('F4') !== -1);
  assert.ok(f4, 'the F4 fixture row exists');
  const docId = String(f4[exported.WQ24_DOC_ID] || '').trim();
  assert.ok(docId, 'and carries a Doc_ID — without one Flow 4 materializes nothing');

  // The assertion that matters: the reader the bridge actually uses can find
  // both zones. Marker strings copied from the reader rather than retyped.
  const extracted = exported.evaluateWarmUpDoc_(docId, 'WUQ-FIXTURE-F4');
  assert.equal(extracted.error, null, JSON.stringify(extracted));
  assert.match(extracted.promptText, /FIXTURE PROMPT/);
  assert.ok(extracted.responseText.length > 20, 'response: ' + extracted.responseText);
  assert.ok(extracted.wordCount > 5);
});

test('the Flow 4 fixture carries a word-count score, so its total is not blank-scored', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();
  const rows = ss.getSheetByName('WarmUpQueue').getDataRange().getValues();
  const f4 = rows.find((r) => String(r[exported.WQ24_QUEUE_ID]).indexOf('F4') !== -1);
  // The harvest reads this cell rather than recomputing it, so a 0 here would
  // score a plausible response as if it had been left empty — reading as a
  // scoring bug rather than a fixture gap.
  assert.ok(Number(f4[exported.WQ24_WORD_COUNT_SCORE]) > 0);
});

test('the seeded profile drives a real archetype branch, not the fallback tail', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();

  const rows = ss.getSheetByName('WarmUpQueue').getDataRange().getValues();
  const f3 = rows.find((r) => String(r[exported.WQ24_QUEUE_ID]).indexOf('F3') !== -1);
  const lesson = JSON.parse(String(f3[exported.WQ24_LESSON_CTX_SNAP]));
  const profile = JSON.parse(String(f3[exported.WQ24_STUDENT_PROFILE_SNAP]));

  // evaluation_signals must be the OBJECT shape. As a plain string array this
  // silently produced "- : (strengths: None; gaps: None)" in the prompt and
  // fell through to a gaps-based BRIDGE, so the fixture exercised nothing.
  assert.equal(typeof profile.evaluation_signals[0], 'object');
  assert.ok(profile.evaluation_signals[0].indicators.strengths.length > 0);

  const fields = exported.wfbBuildFlow3Fields_(lesson, profile);
  assert.equal(fields.archetype, 'CONCRETE_SCENARIO',
    'application strong + analysis gap + engagement 2 should reach this row');
  assert.equal(fields.mode, 'A', 'the fixture snapshot carries a warmup_anchor');
  assert.match(fields.evaluationSignals, /strengths: application/);
  assert.ok(fields.evaluationSignals.indexOf('strengths: None') === -1,
    'a string-array signal would render as None here');
});

test('removeFlowFixtures clears the bridge tabs too', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();
  exported.buildWarmUpFlowInputs();

  const before = [3, 4, 5].map((f) =>
    ss.getSheetByName(exported.WFB_INPUT_TABS[f]).getLastRow());
  assert.deepEqual(before, [2, 2, 2], 'one materialized row per flow');

  exported.removeFlowFixtures();

  // Left behind, these input rows point at queue rows that no longer exist,
  // and every later harvest pass reports them as failures forever.
  [3, 4, 5].forEach((f) => {
    const values = ss.getSheetByName(exported.WFB_INPUT_TABS[f]).getDataRange().getValues();
    const live = values.slice(1).filter((r) => String(r[1]).trim() !== '');
    assert.deepEqual(live, [], 'Flow ' + f + ' input tab still holds ' + JSON.stringify(live));
  });
});

test('a Flow 5 fixture with no prior response materializes nothing, by design', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installWarmUpFixtures();

  // Strip the prior response the way a first-time student's row would lack
  // it. The bridge must not hand Flow 5 a job with nothing to bridge from.
  const sheet = ss.getSheetByName('WarmUpQueue');
  const rows = sheet.getDataRange().getValues();
  const idx = rows.findIndex((r) => String(r[exported.WQ24_QUEUE_ID]).indexOf('F5') !== -1);
  const ctx = JSON.parse(String(rows[idx][exported.WQ24_LESSON_CTX_SNAP]));
  delete ctx.flow5_prior_response;
  sheet.getRange(idx + 1, exported.WQ24_LESSON_CTX_SNAP + 1).setValue(JSON.stringify(ctx));

  const built = exported.buildWarmUpFlowInputs();
  assert.equal(built.flow5, 0);
});

// ── The Flow 2 fixture, checked against its consumers ────────────────────────
//
// Three different things read a FlowInput row, and a fixture only proves
// something if all three can use it: Studio's Flow (the row's chips plus the
// student doc it points at), harvestFlowInputResults() (37_FlowInputBuilder.js),
// and the pure parse/write functions in 15c that the harvest reuses.
//
// The gap found by this pass was in the document, not the row: the fixture's
// student doc carried the response marker but NOT the "[CONFIG_ID: …]" footer.
// Flow 2's Extract step reads the response as the text BETWEEN those two
// delimiters (15b's Step 1 note), so a doc with no footer gives it no end
// delimiter — and the failure reads as "the doc was empty".

test('the Flow 2 fixture fills every FlowInput column', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();

  const row = ss.getSheetByName('FlowInput').getDataRange().getValues()[1];
  const FI = exported.FI;
  // GEMINI_FULL_OUTPUT is the one deliberate blank — it is where the Flow
  // writes its answer. Everything else empty means a chip resolves to nothing.
  const expectedBlank = ['GEMINI_FULL_OUTPUT'];
  Object.keys(FI).forEach((key) => {
    const value = String(row[FI[key]] === undefined ? '' : row[FI[key]]).trim();
    if (expectedBlank.indexOf(key) !== -1) {
      assert.equal(value, '', key + ' should start empty');
    } else {
      assert.ok(value.length > 0, 'FI.' + key + ' is empty — its @trigger chip ' +
        'would resolve to nothing in Studio');
    }
  });
});

test('the fixture doc carries BOTH delimiters the Extract step reads between', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow2Fixture();

  const text = sandbox.DocumentApp.openById(result.studentFileId).getBody().getText();
  const startIdx = text.indexOf('── YOUR RESPONSE BEGINS HERE ──');
  const endIdx = text.indexOf('[CONFIG_ID:');
  assert.ok(startIdx !== -1, 'response marker present');
  assert.ok(endIdx !== -1, 'CONFIG_ID footer present — this is what was missing');
  assert.ok(endIdx > startIdx, 'and the footer comes after the response, or the ' +
    'extracted range would be empty or inverted');

  const between = text.substring(startIdx + '── YOUR RESPONSE BEGINS HERE ──'.length, endIdx);
  assert.ok(between.trim().length > 40,
    'the text an Extract step would pull: ' + JSON.stringify(between.trim().slice(0, 60)));
});

test('the fixture doc\'s ConfigID footer matches the row, and parses', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow2Fixture();
  const text = sandbox.DocumentApp.openById(result.studentFileId).getBody().getText();

  // Script 01's fallback pulls the ConfigID out of the body with this exact
  // pattern, so a fixture ConfigID that doesn't satisfy the character class
  // would be invisible to it.
  const m = text.match(/\[CONFIG_ID:\s*([A-Z0-9\-]+)\]/);
  assert.ok(m, 'the footer matches the reader\'s regex');
  assert.equal(m[1], result.configId, 'and names this fixture\'s own ConfigID');
});

test('the fixture also carries the feedback zone, so a re-run has somewhere to write', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow2Fixture();
  const text = sandbox.DocumentApp.openById(result.studentFileId).getBody().getText();
  // 04_Form2_TurnInGate.js locates the feedback zone by findText('── FEEDBACK ──').
  assert.ok(text.indexOf('── FEEDBACK ──') !== -1);
  assert.ok(text.indexOf('── END FEEDBACK ──') !== -1);
});

test('PROMPT_TEXT has every placeholder filled except STUDENT_TEXT', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();

  const row = ss.getSheetByName('FlowInput').getDataRange().getValues()[1];
  const promptText = String(row[exported.FI.PROMPT_TEXT]);
  assert.ok(promptText.length > 1000, 'the pre-substituted prompt is present');

  // {{STUDENT_TEXT}} is left standing DELIBERATELY: student response text must
  // stay in the student's own Doc as the record of origin and must not be
  // copied into the central Ledger (FERPA), so Studio's Extract step fills it
  // at run time. Any OTHER surviving placeholder means a chip resolved to
  // nothing and the model gets a literal "{{...}}" in its instructions.
  const left = [...new Set(promptText.match(/\{\{[A-Z_0-9]+\}\}/g) || [])];
  assert.deepEqual(left, ['{{STUDENT_TEXT}}'],
    'unfilled placeholders: ' + left.join(' '));
});

test('PROMPT_TEXT actually contains the fixture rubric, not just its shape', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();
  const row = ss.getSheetByName('FlowInput').getDataRange().getValues()[1];
  const promptText = String(row[exported.FI.PROMPT_TEXT]);
  // Substituting the wrong variable names would leave the prompt structurally
  // valid and semantically empty — the failure mode this whole pass is about.
  assert.ok(promptText.indexOf(String(row[exported.FI.UNIT_NAME])) !== -1, 'unit name');
  assert.ok(promptText.indexOf(String(row[exported.FI.MILESTONE_1])) !== -1, 'milestone 1');
  assert.ok(promptText.indexOf(String(row[exported.FI.MILESTONE_4])) !== -1, 'milestone 4');
  assert.ok(promptText.indexOf(String(row[exported.FI.DEFINITION_OF_DONE])) !== -1, 'DoD');
  assert.ok(promptText.indexOf(String(row[exported.FI.PERSONA])) !== -1, 'persona');
});

test('every milestone has a competency ID, or the evidence write has nothing to key on', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();
  const row = ss.getSheetByName('FlowInput').getDataRange().getValues()[1];
  const FI = exported.FI;
  [FI.MILESTONE_1_COMPETENCY_ID, FI.MILESTONE_2_COMPETENCY_ID,
   FI.MILESTONE_3_COMPETENCY_ID, FI.MILESTONE_4_COMPETENCY_ID].forEach((col, i) => {
    assert.ok(String(row[col]).trim().length > 0,
      'milestone ' + (i + 1) + ' has no competency ID — writeCompetencyEvidenceFromFlow2_ ' +
      'would drop its evidence row');
  });
});

test('StagingRowRef is non-numeric, so the harvest cannot complete a real row', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow2Fixture();
  const row = ss.getSheetByName('FlowInput').getDataRange().getValues()[1];
  // The safety property: a numeric ref would point the harvest's
  // _fiMarkStagingComplete_ at whatever real STAGING_PIPELINE row happened to
  // sit at that index. The literal 'FIXTURE' can match nothing.
  const ref = String(row[exported.FI.STAGING_ROW_REF]).trim();
  assert.equal(ref, 'FIXTURE');
  assert.ok(isNaN(parseInt(ref, 10)), 'and parseInt cannot turn it into a row number');
});

// ── The Flow 1 fixture, checked against its consumers ────────────────────────
//
// Flow 1 is the one flow verified live end to end, which makes its fixture the
// one most likely to be trusted without checking. Four things read what it
// seeds: Flow 1 itself (the RubricQueue row plus the prompt-template doc),
// 08_TeacherConfirmationStep.js (the DRAFT rows Flow 1 writes into the
// TeacherMatrix), 37_FlowInputBuilder.js (that same matrix, for Flow 2), and
// 10_AdminRecoveryPanel.js's stuck-row watchdog.
//
// The scratch TeacherMatrix is the load-bearing part. It is indexed BY
// POSITION by two separate readers with two separate constants — TM08 in
// 08_TeacherConfirmationStep.js (which that step's own header calls the
// authoritative source) and FI_TM_COLUMNS_ in 37_FlowInputBuilder.js — so a
// header order that merely looks right silently feeds Flow 2 the wrong
// fields.

// TM08 / FI_TM_COLUMNS_, as a name→index map, for comparing against the
// fixture's header row. Spelled out here rather than imported because the
// point is to catch a change on either side.
const TEACHER_MATRIX_ORDER = [
  'ConfigID', 'UnitName', 'Tier', 'Persona',
  'Milestone1', 'Milestone2', 'Milestone3', 'Milestone4',
  'DefinitionOfDone', 'InstructorEmail', 'Created', 'Status',
  'PromptTemplateID', 'Subject', 'CourseName',
  'Milestone1CompetencyId', 'Milestone2CompetencyId',
  'Milestone3CompetencyId', 'Milestone4CompetencyId', 'LessonUnitId',
];

const RUBRIC_QUEUE_ORDER = [
  'Timestamp', 'TeacherEmail', 'TeacherName', 'Subject',
  'CourseName', 'Tier', 'RubricText', 'PromptTemplateID',
  'TeacherMatrixSsId', 'Status',
];

test('the Flow 1 fixture row matches the RubricQueue column order exactly', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow1Fixture();

  const row = ss.getSheetByName('RubricQueue').getDataRange().getValues()[1];
  assert.equal(row.length >= RUBRIC_QUEUE_ORDER.length, true,
    'the fixture writes at least as many columns as the schema has');
  // The order 16_UnifiedManualSetup.js's header row and
  // 05_TeacherIntakePipeline.js's queueRow array both use. Status LAST, at 9 —
  // 05's own RQ05 constant used to say 8, which is corrected now but is
  // exactly why this is pinned positionally rather than by name.
  assert.equal(String(row[1]).trim(), 'fixture-teacher@example.invalid', 'TeacherEmail at 1');
  assert.ok(String(row[6]).indexOf('FIXTURE RUBRIC') === 0, 'RubricText at 6');
  assert.ok(String(row[7]).trim().length > 0, 'PromptTemplateID at 7');
  assert.ok(String(row[8]).trim().length > 0, 'TeacherMatrixSsId at 8');
  assert.equal(String(row[9]).trim(), 'PENDING_EXTRACTION', 'Status at 9, not 8');
});

test('PENDING_EXTRACTION is the status the real writer and the watchdog use', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow1Fixture();
  const row = ss.getSheetByName('RubricQueue').getDataRange().getValues()[1];
  // 05_TeacherIntakePipeline.js writes this literal, and
  // 10_AdminRecoveryPanel.js alerts on rows stuck in it for 2 hours. A
  // fixture in any other state is invisible to both.
  assert.equal(String(row[9]).trim(), 'PENDING_EXTRACTION');
});

test('the scratch TeacherMatrix header order matches TM08 and FI_TM_COLUMNS_', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow1Fixture();

  const matrix = sandbox.SpreadsheetApp.openById(result.matrixSsId)
    .getSheetByName('TeacherMatrix');
  assert.ok(matrix, 'the scratch matrix has a TeacherMatrix tab, which is what readers open by name');
  const headers = matrix.getDataRange().getValues()[0].map((h) => String(h).trim());
  assert.deepEqual(headers, TEACHER_MATRIX_ORDER);
});

test('37_FlowInputBuilder can actually read the scratch matrix row it seeds', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow1Fixture();

  // The end-to-end assertion, rather than a header comparison: hand the real
  // reader the real fixture and check the fields come back populated. A
  // one-column shift would return blanks here while the headers still looked
  // plausible.
  const row = exported._fiFindTeacherMatrixRow_(result.matrixSsId, 'VDOE-FIXTURE-F1');
  assert.ok(row, 'the reader finds the seeded ConfigID');
  ['unitName', 'tier', 'persona', 'milestone1', 'milestone2', 'milestone3',
   'milestone4', 'dod', 'milestone1CompetencyId', 'milestone4CompetencyId']
    .forEach((field) => {
      assert.ok(String(row[field] || '').trim().length > 0,
        'matrixRow.' + field + ' came back empty — the columns are shifted');
    });
});

test('the seeded matrix row is LIVE, so it is usable rather than pending review', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow1Fixture();
  const values = sandbox.SpreadsheetApp.openById(result.matrixSsId)
    .getSheetByName('TeacherMatrix').getDataRange().getValues();
  // 08_TeacherConfirmationStep.js scans for DRAFT rows to send for review and
  // flips them to REVIEW_SENT. A fixture row at DRAFT would get swept into
  // that flow and mail a fixture teacher; LIVE keeps it inert and readable.
  assert.equal(String(values[1][TEACHER_MATRIX_ORDER.indexOf('Status')]).trim(), 'LIVE');
});

test('the prompt-template doc Flow 1 step 1 reads is real and non-empty', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.installFlow1Fixture();
  // Flow 1's Step 1 is a native "Drive — read prompt template" against
  // PromptTemplateID. A fabricated id makes that step fail before Gemini
  // is ever reached.
  const body = sandbox.DocumentApp.openById(result.templateDocId).getBody().getText();
  assert.match(body, /FIXTURE ASSIGNMENT PROMPT/);
  assert.ok(body.length > 100);
});

test('the rubric text carries all four milestones plus a done condition', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow1Fixture();
  const rubricText = String(ss.getSheetByName('RubricQueue').getDataRange().getValues()[1][6]);
  // Flow 1's job is to extract four milestones, a definition of done and a
  // persona from this text. Vague rubric text would make Gemini's output
  // thin and the fixture would test the prompt's tolerance rather than the
  // flow's wiring.
  ['(1)', '(2)', '(3)', '(4)'].forEach((marker) => {
    assert.ok(rubricText.indexOf(marker) !== -1, 'rubric text is missing ' + marker);
  });
  assert.match(rubricText, /complete when/i, 'and states a completion condition');
});

test('the fixture is idempotent — a second install does not double the row', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  exported.installFlow1Fixture();
  const again = exported.installFlow1Fixture();
  assert.equal(again.seeded, 0);
  assert.equal(again.skipped, 1);
  assert.equal(ss.getSheetByName('RubricQueue').getLastRow(), 2, 'header + one fixture row');
});
