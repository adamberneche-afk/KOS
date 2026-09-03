'use strict';
// Regression tests for the automatic CompetencyEvidence retention archival
// added in 30_SCRSuggestionEngine.js (KOS/CAS roadmap synthesis 2.2 —
// "explicit archive/hibernate state"). Extends the exact SCR_RETENTION_YEARS/
// LEDGER_RETENTION_YEARS pattern (tests/cas-ccps/ledger-retention.test.js is
// the direct template) to the one FERPA-scoped tab that had no archival
// mechanism at all. Unlike Ledger, CompetencyEvidence gets its own dedicated
// archive_status column (no pre-existing status lifecycle to reuse) and is
// resolved by header name, not position, matching aggregateEvidence_()'s
// own established convention for this specific tab.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const SCR_ENGINE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '30_SCRSuggestionEngine.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, SCR_ENGINE_PATH],
    [
      '_competencyEvidenceRetentionYears_',
      '_archiveExpiredCompetencyEvidence_',
      '_countCompetencyEvidencePastRetentionUnarchived_',
      'aggregateEvidence_',
      'reactivateCompetencyEvidence',
    ],
    { console },
  );
}

const HEADER = [
  'evidence_id', 'student_email', 'competency_id', 'milestone_text',
  'outcome', 'config_id', 'evaluated_at', 'student_file_id', 'archive_status',
];

function evidenceRow({ email = 'student@example.com', compId = 'CAS-1', outcome = 'MET', evaluatedAt, archiveStatus = '' }) {
  return ['EVD-1', email, compId, 'milestone text', outcome, 'CFG', evaluatedAt, 'file-1', archiveStatus];
}

function setUpFixture(sandbox, rows) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const sheet = ss.insertSheet('CompetencyEvidence');
  sheet.appendRow(HEADER);
  rows.forEach((r) => sheet.appendRow(evidenceRow(r)));
  return { ss, sheet };
}

function yearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d;
}

test('_competencyEvidenceRetentionYears_: defaults to 5 when unset, same unconfirmed default as the other two', () => {
  const { exported } = load();
  assert.equal(exported._competencyEvidenceRetentionYears_(), 5);
});

test('_competencyEvidenceRetentionYears_: an explicitly configured value overrides the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('COMPETENCY_EVIDENCE_RETENTION_YEARS', '3');
  assert.equal(exported._competencyEvidenceRetentionYears_(), 3);
});

test('_competencyEvidenceRetentionYears_: a garbage or non-positive property value falls back to the default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('COMPETENCY_EVIDENCE_RETENTION_YEARS', 'nope');
  assert.equal(exported._competencyEvidenceRetentionYears_(), 5);
  sandbox.PropertiesService.getScriptProperties().setProperty('COMPETENCY_EVIDENCE_RETENTION_YEARS', '0');
  assert.equal(exported._competencyEvidenceRetentionYears_(), 5);
});

test('_archiveExpiredCompetencyEvidence_: archives an old row past retention', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [
    { evaluatedAt: yearsAgo(6) },
    { evaluatedAt: yearsAgo(7) },
  ]);

  const result = exported._archiveExpiredCompetencyEvidence_();
  assert.equal(result.archived, 2);
  assert.equal(result.checked, 2);

  const rows = sheet.getRange(2, 1, 2, 9).getValues();
  rows.forEach((row) => assert.equal(row[8], 'ARCHIVED'));
});

test('_archiveExpiredCompetencyEvidence_: leaves a recent row (within the retention window) untouched', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ evaluatedAt: yearsAgo(1) }]);

  const result = exported._archiveExpiredCompetencyEvidence_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, 9).getValues()[0];
  assert.equal(row[8], '');
});

test('_archiveExpiredCompetencyEvidence_: an already-ARCHIVED row is left alone (not re-processed)', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ evaluatedAt: yearsAgo(10), archiveStatus: 'ARCHIVED' }]);

  const result = exported._archiveExpiredCompetencyEvidence_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, 9).getValues()[0];
  assert.equal(row[8], 'ARCHIVED');
});

test('_archiveExpiredCompetencyEvidence_: a blank evaluated_at is skipped, never treated as ageless-and-archivable', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [{ evaluatedAt: '' }]);

  const result = exported._archiveExpiredCompetencyEvidence_();
  assert.equal(result.archived, 0);

  const row = sheet.getRange(2, 1, 1, 9).getValues()[0];
  assert.equal(row[8], '');
});

test('_archiveExpiredCompetencyEvidence_: a missing CompetencyEvidence tab returns zeros rather than throwing', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Empty Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  assert.deepEqual(exported._archiveExpiredCompetencyEvidence_(), { archived: 0, checked: 0 });
});

test('_archiveExpiredCompetencyEvidence_: self-heals a pre-2.2 sheet missing the archive_status column', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  // Pre-2.2 shape: only the original 8 columns, header and one old row.
  const sheet = ss.insertSheet('CompetencyEvidence');
  sheet.appendRow(HEADER.slice(0, 8));
  sheet.appendRow(['EVD-1', 'student@example.com', 'CAS-1', 'text', 'MET', 'CFG', yearsAgo(6), 'file-1']);

  const result = exported._archiveExpiredCompetencyEvidence_();
  assert.equal(result.archived, 1);
  assert.equal(sheet.getRange(1, 9).getValue(), 'archive_status');
  assert.equal(sheet.getRange(2, 9).getValue(), 'ARCHIVED');
});

test('_countCompetencyEvidencePastRetentionUnarchived_: mirrors _archiveExpiredCompetencyEvidence_ as a read-only check', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox, [
    { evaluatedAt: yearsAgo(6) },
    { evaluatedAt: yearsAgo(1) },
  ]);

  assert.equal(exported._countCompetencyEvidencePastRetentionUnarchived_(), 1);
  exported._archiveExpiredCompetencyEvidence_();
  assert.equal(exported._countCompetencyEvidencePastRetentionUnarchived_(), 0);
});

test('aggregateEvidence_: excludes archived rows from SCR suggestion aggregation', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [
    { email: 'alice@example.com', outcome: 'MET' },
    { email: 'alice@example.com', outcome: 'NOT_MET', archiveStatus: 'ARCHIVED' },
  ]);

  const aggregates = exported.aggregateEvidence_(sheet);
  // Only the active MET row counts -- the archived NOT_MET row must not
  // pull the aggregate toward NOT_MET.
  assert.deepEqual(aggregates.get('alice@example.com|||CAS-1'), { metCount: 1, notMetCount: 0, partialCount: 0 });
});

test('reactivateCompetencyEvidence: clears archive_status for a matching student, prompted via the UI', () => {
  const { exported, sandbox } = load();
  const { sheet } = setUpFixture(sandbox, [
    { email: 'alice@example.com', archiveStatus: 'ARCHIVED' },
    { email: 'alice@example.com', archiveStatus: '' }, // not archived -- must stay untouched
    { email: 'bob@example.com', archiveStatus: 'ARCHIVED' }, // different student -- must stay untouched
  ]);

  // makeUiMock's alert() defaults to Button.OK for every button set,
  // which would read as "No" on the YES_NO confirm below -- override
  // both prompt() and alert() on the sandbox's own getUi() object so
  // reactivateCompetencyEvidence()'s two UI calls resolve the way a
  // human clicking through "OK" then "Yes" actually would.
  const ui = sandbox.SpreadsheetApp.getUi();
  ui.prompt = () => ({ getSelectedButton: () => ui.Button.OK, getResponseText: () => 'alice@example.com' });
  ui.alert = () => ui.Button.YES;

  exported.reactivateCompetencyEvidence();

  const rows = sheet.getRange(2, 1, 3, 9).getValues();
  assert.equal(rows[0][8], ''); // alice's archived row -- reactivated
  assert.equal(rows[1][8], ''); // alice's already-active row -- untouched
  assert.equal(rows[2][8], 'ARCHIVED'); // bob's row -- untouched
});
