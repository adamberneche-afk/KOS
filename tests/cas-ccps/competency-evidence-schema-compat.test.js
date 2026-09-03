'use strict';
// Regression test for the exact risk the Studio Steps review flagged:
// CompetencyEvidence has two independent writers in two different GAS
// projects — cas-ccps/studio-steps/CommitStudentEvaluationStep.gs (the
// real Studio Flow 2 write step) and
// cas-ccps/scripts/15c_Flow2DirectEvaluationService.js's
// writeCompetencyEvidenceFromFlow2_() (the manual/dev-testing
// DIRECT_GEMINI bridge, in cas-ccps:central-ledger) — and its one
// reader, 30_SCRSuggestionEngine.js's aggregateEvidence_(), resolves
// columns by header NAME, not position. Before Step 3's schema
// reconciliation, the two writers disagreed on column count (3 vs 8),
// so whichever ran first would seed a header the other writer's
// positional row-array didn't match, silently misaligning every column
// downstream (a 15c-seeded header would read the new step's
// evidence_id as student_email). This test loads all three files —
// both writers, and the real reader — and proves the aggregation comes
// out correct regardless of which writer touches the tab first.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const STUDIO_SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STUDIO_STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'CommitStudentEvaluationStep.gs');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const FLOW2_PROMPT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15b_StudioFlowPrompts_Flow2_Revised.js');
const TURNIN_GATE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '04_Form2_TurnInGate.js');
const SERVICE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '15c_Flow2DirectEvaluationService.js');
const SCR_ENGINE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '30_SCRSuggestionEngine.js');

// Two independent sandboxes, one shared fake spreadsheet registry
// object -- each loadGasFiles() call builds its own vm context (its own
// SpreadsheetApp mock instance), so the same underlying FakeSpreadsheet
// must be registered into BOTH sandboxes' registries by hand for them
// to actually operate on one shared tab, the same way two real,
// separate GAS projects would both open the same real spreadsheet ID.
function loadBothWriters() {
  const studio = loadGasFiles([STUDIO_SHARED_PATH, STUDIO_STEP_PATH], ['writeCompetencyEvidence_']);
  const central = loadGasFiles(
    [SHARED_CONFIG_PATH, FLOW2_PROMPT_PATH, TURNIN_GATE_PATH, SERVICE_PATH, SCR_ENGINE_PATH],
    ['writeCompetencyEvidenceFromFlow2_', 'aggregateEvidence_'],
    { console },
  );
  return { studio, central };
}

function shareSpreadsheet(studio, central, ss) {
  studio.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  central.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  // 15c's writeCompetencyEvidenceFromFlow2_ resolves the ledger via
  // getConfig_() (00_SharedConfig.js), which requires these two Script
  // Properties to be set -- same fixture setup
  // tests/cas-ccps/flow2-direct-evaluation.test.js's own
  // setUpLedgerFixture() already uses for this exact function.
  central.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  central.sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
}

test('CompetencyEvidence: the Studio step writes first, then 15c writes -- aggregateEvidence_ still reads both correctly', () => {
  const { studio, central } = loadBothWriters();
  const ss = studio.sandbox.SpreadsheetApp.create('Central Ledger');
  shareSpreadsheet(studio, central, ss);

  studio.exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC', 'alice@example.com', 'file-alice',
    { '1': 'CAS-1' }, { '1': 'M1 text' }, { '1': 'MET' }
  );
  central.exported.writeCompetencyEvidenceFromFlow2_(
    'bob@example.com', 'VDOE-DEF', 'file-bob',
    { '1': 'CAS-1' }, { '1': 'M1 text' }, { '1': 'NOT_MET' }
  );

  // aggregateEvidence_ returns Map<"email|||competencyId", {metCount,notMetCount,partialCount}>.
  const aggregates = central.exported.aggregateEvidence_(ss.getSheetByName('CompetencyEvidence'));
  assert.deepEqual(aggregates.get('alice@example.com|||CAS-1'), { metCount: 1, notMetCount: 0, partialCount: 0 });
  assert.deepEqual(aggregates.get('bob@example.com|||CAS-1'), { metCount: 0, notMetCount: 1, partialCount: 0 });
});

test('CompetencyEvidence: 15c writes first, then the Studio step writes -- aggregateEvidence_ still reads both correctly', () => {
  const { studio, central } = loadBothWriters();
  const ss = studio.sandbox.SpreadsheetApp.create('Central Ledger');
  shareSpreadsheet(studio, central, ss);
  // 15c's writer does NOT auto-create a missing tab (only the Studio
  // step does); pre-create it the way Step 4's setup-script fix
  // eventually will, so this test isolates the "15c seeds the header
  // first" question it's actually about.
  ss.insertSheet('CompetencyEvidence');

  central.exported.writeCompetencyEvidenceFromFlow2_(
    'bob@example.com', 'VDOE-DEF', 'file-bob',
    { '1': 'CAS-1' }, { '1': 'M1 text' }, { '1': 'MET' }
  );
  studio.exported.writeCompetencyEvidence_(
    ss.getId(), 'VDOE-ABC', 'alice@example.com', 'file-alice',
    { '1': 'CAS-1' }, { '1': 'M1 text' }, { '1': 'PARTIALLY_MET' }
  );

  const aggregates = central.exported.aggregateEvidence_(ss.getSheetByName('CompetencyEvidence'));
  assert.deepEqual(aggregates.get('bob@example.com|||CAS-1'), { metCount: 1, notMetCount: 0, partialCount: 0 });
  assert.deepEqual(aggregates.get('alice@example.com|||CAS-1'), { metCount: 0, notMetCount: 0, partialCount: 1 });
});

test('CompetencyEvidence: both writers seed byte-identical headers, so neither reformats the other\'s header row', () => {
  const { studio, central } = loadBothWriters();

  const ssStudioFirst = studio.sandbox.SpreadsheetApp.create('Ledger A');
  shareSpreadsheet(studio, central, ssStudioFirst);
  studio.exported.writeCompetencyEvidence_(
    ssStudioFirst.getId(), 'CFG', 'a@example.com', 'file-a', { '1': 'C1' }, { '1': 'T1' }, { '1': 'MET' }
  );
  const headerFromStudio = ssStudioFirst.getSheetByName('CompetencyEvidence').getRange(1, 1, 1, 9).getValues()[0];

  const ss15cFirst = central.sandbox.SpreadsheetApp.create('Ledger B');
  shareSpreadsheet(studio, central, ss15cFirst);
  // 15c's writer does NOT auto-create a missing tab (only the Studio
  // step does -- see this project's plan on why that's intentional);
  // pre-create it here the way Step 4's setup-script fix eventually
  // will, so this test isolates the header-seeding question this test
  // is actually about.
  ss15cFirst.insertSheet('CompetencyEvidence');
  central.exported.writeCompetencyEvidenceFromFlow2_(
    'b@example.com', 'CFG', 'file-b', { '1': 'C1' }, { '1': 'T1' }, { '1': 'MET' }
  );
  const headerFrom15c = ss15cFirst.getSheetByName('CompetencyEvidence').getRange(1, 1, 1, 9).getValues()[0];

  assert.deepEqual(headerFromStudio, headerFrom15c);
  assert.deepEqual(headerFromStudio, [
    'evidence_id', 'student_email', 'competency_id', 'milestone_text',
    'outcome', 'config_id', 'evaluated_at', 'student_file_id', 'archive_status',
  ]);
});

test('CompetencyEvidence: both writers leave archive_status blank on a fresh row (roadmap 2.2)', () => {
  const { studio, central } = loadBothWriters();
  const ss = studio.sandbox.SpreadsheetApp.create('Central Ledger');
  shareSpreadsheet(studio, central, ss);

  studio.exported.writeCompetencyEvidence_(
    ss.getId(), 'CFG', 'a@example.com', 'file-a', { '1': 'C1' }, { '1': 'T1' }, { '1': 'MET' }
  );
  central.exported.writeCompetencyEvidenceFromFlow2_(
    'b@example.com', 'CFG', 'file-b', { '1': 'C1' }, { '1': 'T1' }, { '1': 'MET' }
  );

  const rows = ss.getSheetByName('CompetencyEvidence').getRange(2, 1, 2, 9).getValues();
  rows.forEach((row) => assert.equal(row[8], ''));
});
