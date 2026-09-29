'use strict';
// The audit gate (_isAuditFailure_, 5_Error_And_Utilities.gs) and the
// hollow pass it now rejects. The rebuilt Curator flow's second fixture run
// (2026-09-29) came back PASSED with an empty trace_log, on an output with
// a next step, three pivots and an action item whose owner the transcript
// never names. The gate read only status and unverified_claims_count, so
// the row went through as audited. The third run (after the gate learned to
// reject an empty trace) came back PASSED with four format checks and no
// accuracy check at all, so the gate now requires an ACCURACY entry.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');

// The Curator output from that run, trimmed to the fields the gate reads.
const CURATOR = {
  session_summary: 'The session addressed the Studio integration challenges.',
  dynamic_state: {
    next_steps: ['Implement Apps Script write-back to STUDIO_RETURN tab'],
    deferred_decisions: [],
    pivots_and_lessons: ['Custom-step path blocked on current account',
      'Write-back logic moved to Apps Script', 'Partial state recovery enabled via doc-written breadcrumbs'],
  },
  vector_weights: null,
  cog_registry: { cog_verdicts: [] },
  action_exhaust: [{ type: 'DECISION', item: 'Transition write-back mechanism to Apps Script harvest', owner: 'Developer' }],
  alignment_report: { relational_status_at_closeout: 'GREEN' },
  alignment_observations: {
    admin_ghost_signal: null, relational_signal: null, necessary_struggle_signal: null,
    prime_directive_signal: null, temporal_signal: null,
    confidence_deltas: { admin_ghost: 0, relational_targets: 0, necessary_struggle: 0, prime_directive: 0, temporal_constraints: 0 },
  },
};
const HOLLOW = { status: 'PASSED', unverified_claims_count: 0, trace_log: [] };
const TRACED = { status: 'PASSED', unverified_claims_count: 0,
  trace_log: [{ json_claim: 'next step', source_evidence: 'transcript line', verdict: 'VERIFIED', kind: 'ACCURACY' }] };
// The third fixture run's sign-off, verbatim apart from the kind field it
// didn't have yet.
const FORMAT_ONLY = { status: 'PASSED', unverified_claims_count: 0, trace_log: [
  { json_claim: 'vector_weights is null', source_evidence: 'The field vector_weights is exactly null as required.', verdict: 'VERIFIED' },
  { json_claim: 'alignment_observations completeness', source_evidence: 'All five signal fields and all five confidence_deltas are present.', verdict: 'VERIFIED' },
  { json_claim: 'relational_status_at_closeout value', source_evidence: "The value 'GREEN' is present.", verdict: 'VERIFIED' },
  { json_claim: 'confidence_deltas range', source_evidence: 'All values are 0.0.', verdict: 'VERIFIED' },
] };

function gate() {
  return loadGasFiles(['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs'].map((f) => path.join(KP, f)),
    ['_isAuditFailure_']).exported._isAuditFailure_;
}

test('a PASSED with an empty trace_log on a Curator output with claims is a failed audit', () => {
  assert.equal(gate()(HOLLOW, CURATOR), true);
});

test('a PASSED that checked a claim against the transcript still passes', () => {
  assert.equal(gate()(TRACED, CURATOR), false);
  const lower = { status: 'PASSED', unverified_claims_count: 0,
    trace_log: [Object.assign({}, TRACED.trace_log[0], { kind: ' accuracy ' })] };
  assert.equal(gate()(lower, CURATOR), false, 'kind is read case- and space-insensitively');
});

test('format checks alone are not an audit', () => {
  assert.equal(gate()(FORMAT_ONLY, CURATOR), true);
  const tagged = { status: 'PASSED', unverified_claims_count: 0,
    trace_log: FORMAT_ONLY.trace_log.map((e) => Object.assign({ kind: 'FORMAT' }, e)) };
  assert.equal(gate()(tagged, CURATOR), true, 'FORMAT entries only');
});

test('an empty trace_log is fine when the Curator output had nothing to check', () => {
  const empty = Object.assign({}, CURATOR, {
    dynamic_state: { next_steps: [], deferred_decisions: [], pivots_and_lessons: [] },
    action_exhaust: [],
  });
  assert.equal(gate()(HOLLOW, empty), false);
  assert.equal(gate()({ status: 'PASSED', unverified_claims_count: 0 }, empty), false, 'trace_log missing');
});

test('a non-null alignment signal counts as a claim to check', () => {
  const quiet = Object.assign({}, CURATOR, {
    dynamic_state: {}, action_exhaust: [],
    alignment_observations: Object.assign({}, CURATOR.alignment_observations, { relational_signal: 'Protected family dinner' }),
  });
  assert.equal(gate()(HOLLOW, quiet), true);
});

test('the old rules still hold', () => {
  const g = gate();
  assert.equal(g({ status: 'FAILED', unverified_claims_count: 1, trace_log: [{}] }, CURATOR), true);
  assert.equal(g({ status: 'PASSED', unverified_claims_count: 2, trace_log: [{}] }, CURATOR), true);
  assert.equal(g(null, CURATOR), false, 'no audit step wired in');
  assert.equal(g(HOLLOW), false, 'without the payload a hollow pass cannot be told apart');
});

test('processInferenceQueue sends a hollow pass back for a retry and logs why', () => {
  const { exported, sandbox } = loadGasFiles(
    ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '4_Vector_Router.gs', '12_StudioReturnHarvest.gs',
      '20_VectorClassifySessions.gs', '3_Queue_Processor.gs'].map((f) => path.join(KP, f)),
    ['processInferenceQueue', '_getOrCreateSheet']);
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('IDENTITY_KEY', 'k');
  props.setProperty('CORE_THESIS_VERIFIED', 'true');
  exported._getOrCreateSheet(ss, 'STAGING_PIPELINE');
  exported._getOrCreateSheet(ss, 'STUDIO_RETURN');
  const doc = sandbox.DocumentApp.create('d');
  ss.getSheetByName('STAGING_PIPELINE').appendRow(['t', 'LOG-1_CH01', 'SESSION_LOG', 'u', doc.getId(), 'FLOW_COMPLETE', 0]);
  ss.getSheetByName('STUDIO_RETURN').appendRow(['t', 'LOG-1_CH01', 'SESSION_LOG',
    JSON.stringify(Object.assign({ auditor_sign_off: HOLLOW }, CURATOR)), '', 'HARVESTED', 1, '']);

  exported.processInferenceQueue();

  const staging = ss.getSheetByName('STAGING_PIPELINE');
  assert.equal(staging.getRange(2, 6).getValue(), 'PENDING_FLOW');
  assert.equal(staging.getRange(2, 7).getValue(), 1);
  const log = ss.getSheetByName('AUDIT_LOG');
  assert.ok(log, 'AUDIT_LOG was written');
  assert.equal(log.getRange(2, 5).getValue(), 'PASSED (HOLLOW: no ACCURACY check)');
});
