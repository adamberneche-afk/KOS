'use strict';
// The Registrar's two Studio flows (D14, 2026-11-01): 24_RegistrarFlows.gs
// with 11_Registrar_CogRelay.gs. Release writes a flat input row with the
// draft's text (no flow reads Drive); a flow answers by adding a
// REGISTRAR_RETURN row; runRegistrarProcessor harvests it into the ledger
// and validates it in the same pass. These tests play the flow's part by
// appending the return row a built flow would, and drive the fixture
// through every consumer (FLOW_DOCTRINE rules 4 and 5).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '11_Registrar_CogRelay.gs',
  '12_StudioReturnHarvest.gs', '24_RegistrarFlows.gs'].map((f) => path.join(KP, f));
const EXPOSE = ['runRegistrarMicrobatch', 'runRegistrarProcessor', 'harvestRegistrarReturns',
  'installRegistrarFlowFixture', 'removeRegistrarFlowFixtures', 'checkRegistrarFlowBinding',
  'checkRegistrarFlowLiveness', 'runRegistrarFlowCanary', 'CFG', 'RG_STAGE1_TAB', 'RG_STAGE2_TAB',
  'RG_RETURN_TAB', 'RG_INPUT_HEADERS', 'RG_RETURN_HEADERS', 'RG_CELL_MAX'];

const STAGE1_OK = JSON.stringify({ doc_uid: '', intervention_triage: { human_intervention_required: false },
  architect_data: { topic: 'ticket pricing for a ballpark promoter' }, muse_data: {}, developer_data: {},
  aligner_data: {}, rtp_data: {} });
const STAGE2_OK = JSON.stringify({ schema_1_valid: true, dissonance_delta_score: 0.2, action_command: 'NO_ACTION_REQUIRED' });

function load() {
  const env = loadGasFiles(FILES, EXPOSE);
  const { exported, sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  const ledger = ss.insertSheet(exported.CFG.REGISTRAR_LEDGER_SHEET);
  ledger.appendRow(['File_ID', 'File_Name', 'Current_State', 'Cog_1_JSON_Output', 'Cog_2_JSON_Output',
    'Final_Human_Translation', 'Attempt_Tracker', 'Error_Log', 'Timestamp_Intake', 'Timestamp_Finalized']);
  return Object.assign(env, { ss, ledger, x: exported });
}

function queueDraft(env, text, opts) {
  const o = opts || {};
  const doc = env.sandbox.DocumentApp.create(o.name || 'Unit 3 draft');
  doc.getBody().setText(text);
  if (o.mime) env.sandbox.DriveApp.getFileById(doc.getId()).mimeType = o.mime;
  env.ledger.appendRow([doc.getId(), o.name || 'Unit 3 draft', 'QUEUED_FOR_COG_1', '', '', '', 0, '', '', '']);
  return doc.getId();
}

const rows = (sheet) => sheet.getDataRange().getValues();
const ledgerRow = (env, fileId) => rows(env.ledger).find((r) => r[0] === fileId);
const inputRows = (env, tab) => { const s = env.ss.getSheetByName(tab); return s ? rows(s).slice(1) : []; };
// What a built flow's last step does: add a row to REGISTRAR_RETURN.
// The tab exists by then: runRegistrarProcessor makes it on its first pass.
const flowAnswers = (env, releaseId, output) => {
  if (!env.ss.getSheetByName(env.x.RG_RETURN_TAB)) env.x.harvestRegistrarReturns();
  env.ss.getSheetByName(env.x.RG_RETURN_TAB).appendRow([new Date(), releaseId, output]);
};

test('the fixture, end to end: released with its text, answered, harvested, validated, never routed', () => {
  const env = load();
  const { fileId } = env.x.installRegistrarFlowFixture();
  env.x.runRegistrarProcessor(); // the first pass makes the three tabs, headers and all
  assert.deepEqual(rows(env.ss.getSheetByName(env.x.RG_STAGE1_TAB))[0], env.x.RG_INPUT_HEADERS);
  assert.deepEqual(rows(env.ss.getSheetByName(env.x.RG_STAGE2_TAB))[0], env.x.RG_INPUT_HEADERS);
  assert.deepEqual(rows(env.ss.getSheetByName(env.x.RG_RETURN_TAB))[0], env.x.RG_RETURN_HEADERS);

  env.x.runRegistrarMicrobatch();
  assert.equal(ledgerRow(env, fileId)[2], 'COG_1_ACTIVE');
  const [in1] = inputRows(env, env.x.RG_STAGE1_TAB);
  assert.match(in1[1], new RegExp('^' + fileId + '\\|1\\|\\d+$'));
  assert.match(in1[3], /minor-league ballpark/, 'the draft\'s text, so the flow reads no Drive');
  assert.equal(in1[4], 'READY');

  flowAnswers(env, in1[1], '```json\n' + STAGE1_OK + '\n```');
  env.x.runRegistrarProcessor();
  assert.equal(ledgerRow(env, fileId)[2], 'READY_FOR_COG_2', 'harvested and validated in one pass');
  assert.equal(ledgerRow(env, fileId)[3], STAGE1_OK, 'the fence is stripped');

  env.x.runRegistrarMicrobatch();
  const [in2] = inputRows(env, env.x.RG_STAGE2_TAB);
  assert.match(in2[3], /^SOURCE DOCUMENT \(the curriculum draft\):\n/);
  assert.match(in2[3], /STAGE 1 OUTPUT TO VERIFY[^\n]*\n\{"doc_uid"/);
  assert.match(in2[3], /MASTER VECTOR PRIMER[^\n]*\n\(No VECTOR_\* docs/);

  flowAnswers(env, in2[1], STAGE2_OK);
  env.x.runRegistrarProcessor();
  assert.equal(ledgerRow(env, fileId)[2], 'READY_FOR_TRANSLATION');
  env.x.runRegistrarProcessor();
  const done = ledgerRow(env, fileId);
  assert.equal(done[2], 'COMPLETELY_ROUTED');
  assert.equal(done[5], '(fixture: not routed)');

  assert.equal(env.x.checkRegistrarFlowLiveness().everAnswered, true);
  assert.equal(env.x.checkRegistrarFlowBinding().ok, true);
  env.x.removeRegistrarFlowFixtures();
  assert.equal(rows(env.ledger).length, 1);
});

test('an answer to an old release is set aside, never applied', () => {
  const env = load();
  const fileId = queueDraft(env, 'Draft about ticket pricing.');
  env.x.runRegistrarMicrobatch();
  flowAnswers(env, fileId + '|1|123', STAGE1_OK);
  const out = env.x.harvestRegistrarReturns();
  assert.equal(out.stale, 1);
  assert.equal(ledgerRow(env, fileId)[2], 'COG_1_ACTIVE');
  assert.equal(rows(env.ss.getSheetByName(env.x.RG_RETURN_TAB))[1][3], 'STALE');
});

test('a Stage 1 answer that shares nothing with the draft bounces it back, counted', () => {
  const env = load();
  const draft = ('The bullpen catcher logs every warm-up pitch in the Riverhawks scorebook, and the ' +
    'groundskeeper drags the infield between innings. ').repeat(6);
  const fileId = queueDraft(env, draft);
  env.x.runRegistrarMicrobatch();
  const [in1] = inputRows(env, env.x.RG_STAGE1_TAB);
  flowAnswers(env, in1[1], JSON.stringify({ doc_uid: '', intervention_triage: {}, architect_data: { x: 'photosynthesis chlorophyll' },
    muse_data: {}, developer_data: {}, aligner_data: {}, rtp_data: {} }));
  const out = env.x.harvestRegistrarReturns();
  assert.equal(out.notGrounded, 1);
  const r = ledgerRow(env, fileId);
  assert.equal(r[2], 'QUEUED_FOR_COG_1');
  assert.equal(r[6], 1);
  assert.match(r[7], /not grounded/);
});

test('an answer saying it could not read its source is not grounded, however short', () => {
  const env = load();
  const fileId = queueDraft(env, 'Short draft.');
  env.x.runRegistrarMicrobatch();
  const [in1] = inputRows(env, env.x.RG_STAGE1_TAB);
  flowAnswers(env, in1[1], 'I was unable to access the document. ' + STAGE1_OK);
  assert.equal(env.x.harvestRegistrarReturns().notGrounded, 1, 'the phrase list is 12\'s SR_NON_ACCESS_PHRASES');
  assert.equal(ledgerRow(env, fileId)[2], 'QUEUED_FOR_COG_1');
});

test('a file that is not a Google Doc fails at once, with what to do, and is never released', () => {
  const env = load();
  const fileId = queueDraft(env, 'x', { mime: 'application/pdf', name: 'scan.pdf' });
  env.x.runRegistrarMicrobatch();
  const r = ledgerRow(env, fileId);
  assert.equal(r[2], 'CRITICAL_FAILURE');
  assert.match(r[7], /not a Google Doc.*Save as Google Docs/);
  assert.equal(inputRows(env, env.x.RG_STAGE1_TAB).length, 0);
});

test('a Release_ID bound to the wrong column is marked, and the binding check says so', () => {
  const env = load();
  queueDraft(env, 'Draft.');
  env.x.runRegistrarMicrobatch();
  flowAnswers(env, 'Draft.', STAGE1_OK);
  assert.equal(env.x.harvestRegistrarReturns().badId, 1);
  const b = env.x.checkRegistrarFlowBinding();
  assert.equal(b.ok, false);
  assert.equal(b.badReleaseId, 1);
});

test('liveness: input rows with no answer yet, and no flow has ever answered', () => {
  const env = load();
  queueDraft(env, 'Draft.');
  env.x.runRegistrarMicrobatch();
  const l = env.x.checkRegistrarFlowLiveness();
  assert.equal(l.everAnswered, false);
  assert.equal(l.stages[1].inputs, 1);
  assert.equal(l.stages[1].answered, 0);
});

test('the primer: VECTOR_* docs by name, others left out, and the cell stays under the limit', () => {
  const env = load();
  const { sandbox } = env;
  const folder = sandbox.DriveApp.getRootFolder().createFolder('05_Vector_Repository');
  sandbox.DriveApp._registerFolder(folder);
  sandbox.PropertiesService.getScriptProperties().setProperty('ID_05_VECTOR_REPOSITORY', folder.getId());
  [['VECTOR_STUDENT_AGENCY', 'Choice and voice. '.repeat(2000)], ['VECTOR_ASSESSMENT', 'Evidence over points.'],
    ['NOTES', 'not a vector doc']].forEach(([name, body]) => {
    const d = sandbox.DocumentApp.create(name);
    d.getBody().setText(body);
    sandbox.DriveApp.getFileById(d.getId()).moveTo(folder);
  });
  const fileId = queueDraft(env, 'Ballpark draft. '.repeat(3000));
  env.ledger.getRange(2, 3, 1, 2).setValues([['READY_FOR_COG_2', STAGE1_OK]]);
  env.x.runRegistrarMicrobatch();
  const [in2] = inputRows(env, env.x.RG_STAGE2_TAB);
  const cell = in2[3];
  assert.ok(cell.length <= env.x.RG_CELL_MAX, cell.length + ' characters');
  assert.ok(cell.indexOf('### VECTOR_ASSESSMENT') < cell.indexOf('### VECTOR_STUDENT_AGENCY'), 'by name');
  assert.match(cell, /cut short: this doc is longer/);
  assert.doesNotMatch(cell, /not a vector doc/);
  assert.equal(ledgerRow(env, fileId)[2], 'COG_2_ACTIVE');
});

test('the canary passes with the flow stubbed, says so, and leaves no fixture behind', () => {
  const env = load();
  const c = env.x.runRegistrarFlowCanary();
  assert.equal(c.passed, c.total);
  assert.ok(c.steps.some((s) => /STUBBED/.test(s.name)));
  assert.equal(rows(env.ledger).length, 1);
});
