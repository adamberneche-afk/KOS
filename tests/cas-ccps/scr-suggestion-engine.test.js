'use strict';
// Regression tests for 30_SCRSuggestionEngine.js's two highest-risk pieces
// flagged by the external product review (Finding 2 / "this month" test
// coverage): THE RULE (computeSuggestion_, aggregateEvidence_). The
// confirm/override lifecycle is the Teacher Dashboard's now (07's
// teacherConfirmScrRating/teacherOverrideScrRating, teacher-dashboard-scr-review.test.js);
// 30's own uncalled copies were deleted 2026-11-07.
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
    ['computeSuggestion_', 'aggregateEvidence_', 'createSCRTabs_'],
    {
      Session: {
        getActiveUser() { return { getEmail() { return 'teacher@ccpsnet.net'; } }; },
        getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
        getScriptTimeZone() { return 'America/New_York'; },
      },
    },
  );
}

// ── THE RULE (computeSuggestion_) — restated in the file's own header: the
//    average of the 3 best pieces (MET = 2, PARTIALLY_MET = 3, NOT_MET = 4),
//    rounded to the nearest rating. Counts are pieces: one per assignment,
//    at its best outcome (aggregateEvidence_ below). ───────────────────────

test('computeSuggestion_: fewer than 3 pieces -> INSUFFICIENT_EVIDENCE', () => {
  const { exported } = load();
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 1, notMetCount: 1, partialCount: 0 }),
    { suggestedRating: null, status: 'INSUFFICIENT_EVIDENCE' },
  );
});

test('computeSuggestion_: averages only the 3 best pieces, so earlier misses do not count against them', () => {
  const { exported } = load();
  assert.deepEqual(
    exported.computeSuggestion_({ metCount: 3, notMetCount: 5, partialCount: 2 }),
    { suggestedRating: 2, status: 'SUGGESTED' },
  );
});

test('computeSuggestion_: rounds the average to the nearest rating', () => {
  const { exported } = load();
  const cases = [
    [{ metCount: 2, partialCount: 1, notMetCount: 0 }, 2], // 2.33
    [{ metCount: 1, partialCount: 2, notMetCount: 0 }, 3], // 2.67
    [{ metCount: 2, partialCount: 0, notMetCount: 1 }, 3], // 2.67
    [{ metCount: 1, partialCount: 1, notMetCount: 1 }, 3], // 3
    [{ metCount: 0, partialCount: 3, notMetCount: 0 }, 3], // 3
    [{ metCount: 0, partialCount: 2, notMetCount: 1 }, 3], // 3.33
    [{ metCount: 1, partialCount: 0, notMetCount: 2 }, 3], // 3.33
    [{ metCount: 0, partialCount: 1, notMetCount: 2 }, 4], // 3.67
    [{ metCount: 0, partialCount: 0, notMetCount: 3 }, 4], // 4
  ];
  for (const [counts, rating] of cases) {
    assert.deepEqual(exported.computeSuggestion_(counts), { suggestedRating: rating, status: 'SUGGESTED' },
      JSON.stringify(counts));
  }
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

// ── Pieces of evidence: one per assignment, at its best outcome ────────────
// Every Submit for Feedback writes CompetencyEvidence rows, so drafts of one
// assignment must not count as separate evidence.

function evidenceSheet(sandbox, rows) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const sheet = ss.insertSheet('CompetencyEvidence');
  sheet.appendRow(['student_email', 'competency_id', 'outcome', 'config_id', 'evaluated_at', 'student_file_id', 'archive_status']);
  rows.forEach(([email, comp, outcome, configId, fileId]) =>
    sheet.appendRow([email, comp, outcome, configId || '', '2026-10-14', fileId || '', '']));
  return sheet;
}

test('aggregateEvidence_: three missed drafts and a passing fourth of ONE assignment are one MET piece', () => {
  const { exported, sandbox } = load();
  const sheet = evidenceSheet(sandbox, [
    ['amy@ccpsnet.net', 'C1', 'NOT_MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'NOT_MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'PARTIALLY_MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-1'],
  ]);
  const counts = exported.aggregateEvidence_(sheet).get('amy@ccpsnet.net|||C1');
  assert.deepEqual(counts, { metCount: 1, notMetCount: 0, partialCount: 0 });
  assert.equal(exported.computeSuggestion_(counts).status, 'INSUFFICIENT_EVIDENCE');
});

test('aggregateEvidence_: three passing checks of one assignment are not enough for a rating', () => {
  const { exported, sandbox } = load();
  const sheet = evidenceSheet(sandbox, [
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-1'],
  ]);
  assert.deepEqual(exported.aggregateEvidence_(sheet).get('amy@ccpsnet.net|||C1'),
    { metCount: 1, notMetCount: 0, partialCount: 0 });
});

test('aggregateEvidence_: separate assignments are separate pieces; a competency and a student are kept apart', () => {
  const { exported, sandbox } = load();
  const sheet = evidenceSheet(sandbox, [
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-1'],
    ['amy@ccpsnet.net', 'C1', 'NOT_MET', 'VDOE-2'],
    ['amy@ccpsnet.net', 'C1', 'PARTIALLY_MET', 'VDOE-3'],
    ['amy@ccpsnet.net', 'C1', 'MET', 'VDOE-4'],
    ['amy@ccpsnet.net', 'C2', 'NOT_MET', 'VDOE-1'],
    ['ben@ccpsnet.net', 'C1', 'NOT_MET', 'VDOE-9'],
  ]);
  const agg = exported.aggregateEvidence_(sheet);
  const amy = agg.get('amy@ccpsnet.net|||C1');
  assert.deepEqual(amy, { metCount: 2, notMetCount: 1, partialCount: 1 });
  // Best three: MET, MET, PARTIALLY_MET = 2.33 -> 2.
  assert.equal(exported.computeSuggestion_(amy).suggestedRating, 2);
  assert.deepEqual(agg.get('amy@ccpsnet.net|||C2'), { metCount: 0, notMetCount: 1, partialCount: 0 });
  assert.deepEqual(agg.get('ben@ccpsnet.net|||C1'), { metCount: 0, notMetCount: 1, partialCount: 0 });
});

test('aggregateEvidence_: falls back to the doc ID, then counts a row with neither on its own', () => {
  const { exported, sandbox } = load();
  const sheet = evidenceSheet(sandbox, [
    ['amy@ccpsnet.net', 'C1', 'NOT_MET', '', 'doc-1'],
    ['amy@ccpsnet.net', 'C1', 'MET', '', 'doc-1'],
    ['amy@ccpsnet.net', 'C1', 'MET', '', ''],
    ['amy@ccpsnet.net', 'C1', 'NOT_MET', '', ''],
  ]);
  assert.deepEqual(exported.aggregateEvidence_(sheet).get('amy@ccpsnet.net|||C1'),
    { metCount: 2, notMetCount: 1, partialCount: 0 });
});

// P0-05: the missing-columns guard returned `result` before its declaration,
// so it threw a ReferenceError instead of returning nothing.
test('aggregateEvidence_: a tab missing a required column returns an empty map and says why', () => {
  const { exported, sandbox } = load();
  const logs = [];
  sandbox.Logger.log = (m) => logs.push(String(m));
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const sheet = ss.insertSheet('CompetencyEvidence');
  sheet.appendRow(['evidence_id', 'student_email', 'competency_id']); // no outcome column
  sheet.appendRow(['E1', 'amy@ccpsnet.net', 'C1']);
  const agg = exported.aggregateEvidence_(sheet);
  assert.equal(agg.size, 0);
  assert.ok(logs.some((l) => /missing required columns/.test(l)), logs.join('\n'));
});

// ── The Run-menu entry points (2026-10-27) ──────────────────────────────────
// createSCRTabs_() and installSCRTrigger_() end in "_", hidden from the
// editor's Run dropdown, so the weekly run may never have been installed.

test('setupCompetencySuggestions, then preview writes nothing and a run writes one suggestion per pair', () => {
  const { sandbox } = load();
  const vm = require('vm');
  const run = (name) => vm.runInContext(name + '()', sandbox);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  assert.match(run('previewCompetencySuggestions').error, /CompetencyEvidence/);
  assert.equal(run('setupCompetencySuggestions').triggerInstalled, true);
  run('setupCompetencySuggestions');
  assert.deepEqual(sandbox.ScriptApp.getProjectTriggers().map((t) => t.getHandlerFunction()),
    ['runWeeklySCRSuggestionUpdate_']);

  const ev = ss.getSheetByName('CompetencyEvidence');
  ['CFG-1', 'CFG-2', 'CFG-3'].forEach((c, i) =>
    ev.appendRow(['E' + i, '1234567@ccpsnet.net', '8175-3', 'm', 'MET', c, '2026-10-20', 'F' + i, '']));

  const preview = run('previewCompetencySuggestions');
  assert.equal(preview.dryRun, true);
  assert.equal(preview.newRows, 1);
  assert.equal(ss.getSheetByName('SCRSuggestions').getLastRow(), 1, 'preview wrote nothing');

  assert.equal(run('buildCompetencySuggestionsNow').newRows, 1);
  assert.equal(ss.getSheetByName('SCRSuggestions').getLastRow(), 2);
  assert.equal(run('buildCompetencySuggestionsNow').unchanged, 1, 'a re-run rewrites nothing');
});
