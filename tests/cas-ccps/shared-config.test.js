'use strict';
// Regression tests for 00_SharedConfig.js's getConfig_() — specifically its
// missing-property failure path (Finding 2 / "this month" test coverage).
// getConfig_() is the single chokepoint every cas-ccps script reads its IDs
// through ("Replaces all PASTE_..._HERE hardcoded constants across the
// codebase" — this file's own header comment); if its required-property
// check ever silently stopped throwing, every script downstream would fail
// with a much more confusing error deep inside a SpreadsheetApp.openById("")
// call instead of the clear message this test pins down.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFile, FakeSheet } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');

function load(exposeNames = ['getConfig_']) {
  return loadGasFile(SHARED_CONFIG_PATH, exposeNames);
}

test('getConfig_: throws a clear, actionable error when required properties are entirely missing', () => {
  const { exported } = load();
  assert.throws(
    () => exported.getConfig_(),
    (err) => {
      assert.match(err.message, /Missing: ADMIN_SS_ID, CENTRAL_LEDGER_SS_ID/);
      assert.match(err.message, /setup wizard/i);
      return true;
    },
  );
});

test('getConfig_: throws naming only the specific properties that are actually missing', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  // CENTRAL_LEDGER_SS_ID deliberately left unset.

  assert.throws(
    () => exported.getConfig_(),
    (err) => {
      assert.match(err.message, /Missing: CENTRAL_LEDGER_SS_ID/);
      assert.doesNotMatch(err.message, /ADMIN_SS_ID/);
      return true;
    },
  );
});

test('getConfig_: succeeds once both required properties are set, with optional ones defaulting cleanly', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'fake-ledger-ss');

  const cfg = exported.getConfig_();
  assert.equal(cfg.adminSsId, 'fake-admin-ss');
  assert.equal(cfg.ledgerSsId, 'fake-ledger-ss');
  // Never configured — must default to "", never throw or return undefined.
  assert.equal(cfg.adminNotifyEmail, '');
  assert.equal(cfg.teacherEmail, '');
  // Documented fallback default (see this file's own STUDENT_EMAIL_DOMAIN
  // comment) — a district that has never set the override property must
  // still get a working domain, not a blank one.
  assert.equal(cfg.studentEmailDomain, 'ccpsnet.net');
  assert.equal(cfg.tabs.ledger, 'Ledger');
  assert.equal(cfg.tabs.scrSuggestions, 'SCRSuggestions');
});

test('getConfig_: an explicitly configured STUDENT_EMAIL_DOMAIN overrides the "ccpsnet.net" default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'fake-ledger-ss');
  sandbox.PropertiesService.getScriptProperties().setProperty('STUDENT_EMAIL_DOMAIN', 'otherdistrict.k12.us');

  const cfg = exported.getConfig_();
  assert.equal(cfg.studentEmailDomain, 'otherdistrict.k12.us');
});

// ── LEDGER column-index map (Finding 8 / header-index fix) ─────────────────
// registerLedger_ (02_Form1_IntakeAndWorkspaceGenerator.js) is the single
// place new Ledger rows are actually written — this pins LEDGER's indices
// to that real column order so 13_StudentDashboard.js/07_TeacherDashboard.js
// (both now reading LEDGER.* instead of magic numbers) can never silently
// drift out of sync with what's actually written to the sheet.

test('LEDGER: matches registerLedger_\'s real column order exactly', () => {
  const { exported } = load(['LEDGER']);
  assert.deepEqual(exported.LEDGER, {
    TIMESTAMP: 0,
    GOOGLE_ID: 1,
    CONFIG_ID: 2,
    FILE_ID: 3,
    STUDENT_NAME: 4,
    BLOCK: 5,
    CLASS_NAME: 6,
    TEACHER_NAME: 7,
    TEACHER_EMAIL: 8,
    SUBJECT: 9,
    COURSE_NAME: 10,
    PERIOD: 11,
    STATUS: 12,
    SUBMISSION_TS: 13,
    NOTES: 14,
    LAST_EVAL: 15,
    ADMIN_FILE_URL: 16,
    STUDENT_FILE_URL: 17,
    ACADEMIC_YEAR: 18,
    TURN_IN_SUGGESTED_SCORE: 19,
    TURN_IN_FINAL_SCORE: 20,
    TURN_IN_SCORE_DECIDED_BY: 21,
    TURN_IN_SCORE_DECIDED_AT: 22,
  });
});

test('LEDGER: every value is a unique, non-negative integer (no accidental collision)', () => {
  const { exported } = load(['LEDGER']);
  const values = Object.values(exported.LEDGER);
  assert.deepEqual(values, [...new Set(values)], 'LEDGER must not assign the same column index twice');
  values.forEach((v) => assert.ok(Number.isInteger(v) && v >= 0, `${v} must be a non-negative integer`));
});

test('LEDGER_COL_COUNT: one past the highest LEDGER index (bounds every getRange() call that uses it)', () => {
  const { exported } = load(['LEDGER', 'LEDGER_COL_COUNT']);
  const maxIndex = Math.max(...Object.values(exported.LEDGER));
  assert.equal(exported.LEDGER_COL_COUNT, maxIndex + 1);
});

// ── getCompetencyTextMap_ — CacheService layer (Finding 6 / "this quarter"
//    scaling fix) ────────────────────────────────────────────────────────────

function makeRegistrySheet(rows) {
  const sheet = new FakeSheet('CompetencyRegistry');
  sheet.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  rows.forEach((r) => sheet.appendRow(r));
  return sheet;
}

test('getCompetencyTextMap_: builds id -> text from the registry sheet on a cache miss', () => {
  const { exported } = load(['getCompetencyTextMap_']);
  const sheet = makeRegistrySheet([
    ['COMP-1', 'Can identify a target market', 'Marketing', '9-12', 'Strand A', '', 'TRUE'],
    ['COMP-2', 'Can build a pricing strategy', 'Marketing', '9-12', 'Strand B', '', 'TRUE'],
  ]);
  const map = exported.getCompetencyTextMap_(sheet);
  assert.deepEqual(map, {
    'COMP-1': 'Can identify a target market',
    'COMP-2': 'Can build a pricing strategy',
  });
});

test('getCompetencyTextMap_: a cache hit returns the cached map without re-reading the sheet', () => {
  const { exported, sandbox } = load(['getCompetencyTextMap_']);
  const sheet = makeRegistrySheet([['COMP-1', 'Original text', '', '', '', '', 'TRUE']]);

  const first = exported.getCompetencyTextMap_(sheet);
  assert.equal(first['COMP-1'], 'Original text');

  // Mutate the sheet directly, bypassing the cache-invalidation path
  // (22b_CompetencyRegistryImporter.js's real re-import flow) on purpose —
  // this is exactly what proves the second call is served from cache: if
  // it read the sheet again, it would see this new value instead.
  sheet.rows[1][1] = 'Changed after first call';

  const second = exported.getCompetencyTextMap_(sheet);
  assert.equal(second['COMP-1'], 'Original text', 'a cache hit must not re-read the sheet');

  // Cross-check via the raw sandbox cache too, confirming the put() actually
  // happened under the documented key.
  const cached = sandbox.CacheService.getScriptCache().get('competency_registry_text_map_v1');
  assert.ok(cached, 'expected a cache entry under the documented key');
});

test('getCompetencyTextMap_: removing the cache entry (simulating a re-import) forces a fresh read', () => {
  const { exported, sandbox } = load(['getCompetencyTextMap_']);
  const sheet = makeRegistrySheet([['COMP-1', 'Original text', '', '', '', '', 'TRUE']]);

  exported.getCompetencyTextMap_(sheet); // populate the cache
  sheet.rows[1][1] = 'Updated after re-import';
  sandbox.CacheService.getScriptCache().remove('competency_registry_text_map_v1'); // what importCompetencyRegistry() does

  const afterInvalidation = exported.getCompetencyTextMap_(sheet);
  assert.equal(afterInvalidation['COMP-1'], 'Updated after re-import');
});

test('getCompetencyTextMap_: a missing registry sheet returns an empty map, never throws', () => {
  const { exported } = load(['getCompetencyTextMap_']);
  assert.deepEqual(exported.getCompetencyTextMap_(null), {});
});
