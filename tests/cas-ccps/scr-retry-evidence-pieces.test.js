'use strict';
// 30b_SCRRetryRemediation.js's retry eligibility counts evidence the same
// way Script 30's suggestions do: one piece per assignment and competency,
// at its best outcome. Students resubmit drafts for feedback as often as
// they like (the Student Dashboard's Submit for Feedback), and each check
// writes CompetencyEvidence rows, so counting rows let drafts unlock a retry.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function evidence(rows) {
  const { exported, sandbox } = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '30_SCRSuggestionEngine.js'),
      path.join(SCRIPTS, '30b_SCRRetryRemediation.js')],
    ['aggregateEvidenceForStudentAcrossCompetencies_']);
  const sheet = sandbox.SpreadsheetApp.create('Central Ledger').insertSheet('CompetencyEvidence');
  sheet.appendRow(['student_email', 'competency_id', 'outcome', 'config_id', 'evaluated_at',
    'student_file_id', 'archive_status', 'evidence_role']);
  rows.forEach(([comp, outcome, configId, role]) =>
    sheet.appendRow(['amy@ccpsnet.net', comp, outcome, configId, '2026-10-14', '', '', role]));
  return (comps, role) =>
    exported.aggregateEvidenceForStudentAcrossCompetencies_(sheet, 'amy@ccpsnet.net', comps, role);
}

test('retry evidence: drafts of one assignment count once, at their best outcome', () => {
  const count = evidence([
    ['S1', 'NOT_MET', 'VDOE-1', 'SECONDARY'],
    ['S1', 'MET', 'VDOE-1', 'SECONDARY'],
    ['S1', 'MET', 'VDOE-1', 'SECONDARY'],
    ['S1', 'MET', 'VDOE-2', 'SECONDARY'],
  ]);
  assert.deepEqual(count(['S1'], 'SECONDARY'), { metCount: 2, notMetCount: 0, partialCount: 0 });
});

test('retry evidence: one assignment evidencing two linked secondaries is a piece for each', () => {
  const count = evidence([
    ['S1', 'MET', 'VDOE-1', 'SECONDARY'],
    ['S2', 'MET', 'VDOE-1', 'SECONDARY'],
    ['P1', 'NOT_MET', 'VDOE-1', 'PRIMARY'],
  ]);
  assert.deepEqual(count(['S1', 'S2'], 'SECONDARY'), { metCount: 2, notMetCount: 0, partialCount: 0 });
  assert.deepEqual(count(['P1'], 'PRIMARY'), { metCount: 0, notMetCount: 1, partialCount: 0 });
});
