'use strict';
// Regression tests for 30_SCRSuggestionEngine.js's two highest-risk pieces
// flagged by the external product review (Finding 2 / "this month" test
// coverage): THE THRESHOLD RULE (computeSuggestion_) and the
// suggest -> confirm/override lifecycle (recordConfirmation_/recordOverride_,
// via the shared recordDecision_).
//
// Loaded together with 00_SharedConfig.js because 30_SCRSuggestionEngine.js
// calls getConfig_() — both files are bound to the same GAS project
// (cas-ccps:central-ledger, see tools/gas-lint/project-map.json), so this
// mirrors how they actually run, not an artificial single-file slice.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const SCR_ENGINE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '30_SCRSuggestionEngine.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, SCR_ENGINE_PATH],
    ['computeSuggestion_', 'recordConfirmation_', 'recordOverride_', 'createSCRTabs_'],
  );
}

// A fresh SCRSuggestions/SCRDecisionLog pair, with the Ledger's required
// Script Properties already set so getConfig_() doesn't throw, and one
// SUGGESTED row ready for a teacher decision. Mirrors gas-sandbox.js's own
// documented pattern of reaching into `sandbox` directly to set up state
// the public API doesn't expose.
function setUpSuggestionsFixture(sandbox, { suggestedRating = 3, status = 'SUGGESTED' } = {}) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const suggestions = ss.insertSheet('SCRSuggestions');
  suggestions.appendRow(['student_email', 'competency_id', 'suggested_rating',
    'met_count', 'not_met_count', 'partial_count', 'status', 'last_computed_at',
    'confirmed_rating', 'confirmed_at', 'confirmed_by']);
  suggestions.appendRow([
    'student@ccpsnet.net', 'CAS-M5-1',
    suggestedRating === null ? '' : suggestedRating,
    2, 0, 1, status, new Date(), '', '', '',
  ]);

  const decisionLog = ss.insertSheet('SCRDecisionLog');
  decisionLog.appendRow(['decision_id', 'student_email', 'competency_id', 'suggested_rating',
    'final_rating', 'decision_type', 'decided_at', 'decided_by', 'evidence_snapshot', 'archive_status']);

  return { ss, suggestions, decisionLog };
}

// ── THE THRESHOLD RULE (computeSuggestion_) — restated in the file's own
//    header comment as a locked design decision; these pin down every
//    branch exactly as specified there. ─────────────────────────────────────

test('computeSuggestion_: fewer than 3 total evidence rows -> INSUFFICIENT_EVIDENCE', () => {
  const { exported } = load();
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 1, notMetCount: 1, partialCount: 0 }),
    { suggestedRating: null, status: 'INSUFFICIENT_EVIDENCE' },
  );
});

test('computeSuggestion_: 3+ NOT_MET -> suggest 4, regardless of other counts', () => {
  const { exported } = load();
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 5, notMetCount: 3, partialCount: 2 }),
    { suggestedRating: 4, status: 'SUGGESTED' },
  );
});

test('computeSuggestion_: 3+ MET and zero NOT_MET -> suggest 2', () => {
  const { exported } = load();
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 3, notMetCount: 0, partialCount: 1 }),
    { suggestedRating: 2, status: 'SUGGESTED' },
  );
});

test('computeSuggestion_: mixed evidence that clears neither the 4 nor the 2 rule -> suggest 3', () => {
  const { exported } = load();
  // 3 MET but 1 NOT_MET present — fails the "notMetCount === 0" requirement
  // for a 2, and notMetCount is below the threshold for a 4 — falls through
  // to the default middle suggestion.
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 3, notMetCount: 1, partialCount: 0 }),
    { suggestedRating: 3, status: 'SUGGESTED' },
  );
});

test('computeSuggestion_: never auto-suggests 1 or 5 across a wide sweep of count combinations', () => {
  const { exported } = load();
  for (let met = 0; met <= 6; met++) {
    for (let notMet = 0; notMet <= 6; notMet++) {
      for (let partial = 0; partial <= 6; partial++) {
        const result = exported.computeSuggestion_({ metCount: met, notMetCount: notMet, partialCount: partial });
        assert.notEqual(result.suggestedRating, 1);
        assert.notEqual(result.suggestedRating, 5);
      }
    }
  }
});

// ── The suggest -> confirm/override lifecycle ───────────────────────────────

test('recordConfirmation_: confirms a SUGGESTED row as-is and freezes it', () => {
  const { exported, sandbox } = load();
  const { suggestions, decisionLog } = setUpSuggestionsFixture(sandbox, { suggestedRating: 3 });

  const result = exported.recordConfirmation_('student@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  assert.equal(result.success, true);
  assert.equal(result.finalRating, 3);

  const row = suggestions.getRange(2, 1, 1, 11).getValues()[0];
  assert.equal(row[6], 'CONFIRMED');   // STATUS
  assert.equal(row[8], 3);             // CONFIRMED_RATING

  const logRow = decisionLog.getRange(2, 1, 1, 10).getValues()[0];
  assert.equal(logRow[5], 'CONFIRMED'); // DECISION_TYPE
  assert.equal(logRow[4], 3);           // FINAL_RATING
});

test('recordOverride_: rejects a rating outside 1-5 without touching any sheet', () => {
  const { exported, sandbox } = load();
  const { suggestions } = setUpSuggestionsFixture(sandbox, { suggestedRating: 3 });

  const result = exported.recordOverride_('student@ccpsnet.net', 'CAS-M5-1', 7, 'teacher@ccpsnet.net');
  assert.equal(result.success, false);
  assert.match(result.error, /integer from 1 to 5/);

  // Untouched — still SUGGESTED, not silently frozen by a rejected call.
  const row = suggestions.getRange(2, 1, 1, 11).getValues()[0];
  assert.equal(row[6], 'SUGGESTED');
});

test('recordOverride_: a teacher may override to 1 or 5 even though the system never suggests them', () => {
  const { exported, sandbox } = load();
  setUpSuggestionsFixture(sandbox, { suggestedRating: 3 });

  const result = exported.recordOverride_('student@ccpsnet.net', 'CAS-M5-1', 1, 'teacher@ccpsnet.net');
  assert.equal(result.success, true);
  assert.equal(result.finalRating, 1);
  assert.equal(result.decisionType, 'OVERRIDDEN');
});

test('recordConfirmation_: cannot confirm an INSUFFICIENT_EVIDENCE row (nothing to confirm)', () => {
  const { exported, sandbox } = load();
  setUpSuggestionsFixture(sandbox, { suggestedRating: null, status: 'INSUFFICIENT_EVIDENCE' });

  const result = exported.recordConfirmation_('student@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  assert.equal(result.success, false);
  assert.match(result.error, /no suggestion to confirm/);
});

test('a pair already CONFIRMED or OVERRIDDEN is frozen — a second decision is rejected', () => {
  const { exported, sandbox } = load();
  setUpSuggestionsFixture(sandbox, { suggestedRating: 3, status: 'CONFIRMED' });

  const result = exported.recordConfirmation_('student@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  assert.equal(result.success, false);
  assert.match(result.error, /already been decided \(CONFIRMED\)/);
});

test('recordDecision_ (via recordConfirmation_): no matching suggestion row -> a clear error, not a throw', () => {
  const { exported, sandbox } = load();
  setUpSuggestionsFixture(sandbox, { suggestedRating: 3 });

  const result = exported.recordConfirmation_('nobody@ccpsnet.net', 'CAS-M5-1', 'teacher@ccpsnet.net');
  assert.equal(result.success, false);
  assert.match(result.error, /No suggestion row found/);
});

// ── createSCRTabs_ — the tab-creation gap the Studio Steps review found:
//    a fresh deployment had no code path creating CompetencyEvidence,
//    SCRSuggestions, or SCRDecisionLog until this function existed
//    (SCRSuggestions/SCRDecisionLog), and CompetencyEvidence was added
//    to it in Step 4 of that adoption so an admin doesn't have to wait
//    for Flow 2's own lazy self-creation to pass preflight. ─────────────────

test('createSCRTabs_: creates all three tabs, with headers matching each real writer exactly', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  exported.createSCRTabs_();

  const evidence = ss.getSheetByName('CompetencyEvidence');
  assert.ok(evidence);
  assert.deepEqual(evidence.getRange(1, 1, 1, 8).getValues()[0], [
    'evidence_id', 'student_email', 'competency_id', 'milestone_text',
    'outcome', 'config_id', 'evaluated_at', 'student_file_id',
  ]);

  const suggestions = ss.getSheetByName('SCRSuggestions');
  assert.ok(suggestions);
  assert.deepEqual(suggestions.getRange(1, 1, 1, 11).getValues()[0], [
    'student_email', 'competency_id', 'suggested_rating',
    'met_count', 'not_met_count', 'partial_count',
    'status', 'last_computed_at',
    'confirmed_rating', 'confirmed_at', 'confirmed_by',
  ]);

  const decisionLog = ss.getSheetByName('SCRDecisionLog');
  assert.ok(decisionLog);
  assert.deepEqual(decisionLog.getRange(1, 1, 1, 10).getValues()[0], [
    'decision_id', 'student_email', 'competency_id', 'suggested_rating',
    'final_rating', 'decision_type', 'decided_at', 'decided_by',
    'evidence_snapshot', 'archive_status',
  ]);
});

test('createSCRTabs_: safe to re-run -- skips a tab that already has real data rather than clobbering it', () => {
  const { exported, sandbox } = load();
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const evidence = ss.insertSheet('CompetencyEvidence');
  evidence.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id', 'evaluated_at', 'student_file_id']);
  evidence.appendRow(['EVD-REAL', 'student@ccpsnet.net', 'CAS-1', 'text', 'MET', 'CFG', new Date(), 'file-1']);

  exported.createSCRTabs_();

  assert.equal(evidence.getLastRow(), 2, 'the existing real row must survive a re-run untouched');
  assert.ok(ss.getSheetByName('SCRSuggestions'), 'the two tabs that did NOT already exist still get created');
  assert.ok(ss.getSheetByName('SCRDecisionLog'));
});
