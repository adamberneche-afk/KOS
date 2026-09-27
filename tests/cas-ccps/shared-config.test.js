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

test('getConfig_: throws a clear, actionable error when the Ledger ID can\'t be found anywhere', () => {
  const { exported } = load();
  // Only CENTRAL_LEDGER_SS_ID is required now: ADMIN_SS_ID defaults to it
  // (every installer sets the two to the same spreadsheet), so naming
  // ADMIN_SS_ID here would send an operator to set a redundant property.
  assert.throws(
    () => exported.getConfig_(),
    (err) => {
      assert.match(err.message, /Missing: CENTRAL_LEDGER_SS_ID/);
      assert.doesNotMatch(err.message, /ADMIN_SS_ID/);
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
  assert.equal(cfg.tabs.competencyEvidence, 'CompetencyEvidence');
});

test('getConfig_: an explicitly configured STUDENT_EMAIL_DOMAIN overrides the "ccpsnet.net" default', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'fake-ledger-ss');
  sandbox.PropertiesService.getScriptProperties().setProperty('STUDENT_EMAIL_DOMAIN', 'otherdistrict.k12.us');

  const cfg = exported.getConfig_();
  assert.equal(cfg.studentEmailDomain, 'otherdistrict.k12.us');
});

// ── Where getConfig_() finds each value ──────────────────────────────────
// Script Properties first (so nothing configured today changes), then the
// Ledger ID from the attached spreadsheet, then district-wide keys from
// the Central Ledger's _CONFIG tab.

const RESOLUTION_EXPORTS = ['getConfig_', 'seedLedgerConfigTab', 'showConfigSources', 'refreshSharedConfig',
  'SHARED_CONFIG_KEYS', 'SHARED_CONFIG_CACHE_PREFIX'];

function makeLedger(sandbox, rows) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  ss.insertSheet('Ledger');
  if (rows) {
    const tab = ss.insertSheet('_CONFIG');
    tab.appendRow(['Key', 'Value']);
    rows.forEach((r) => tab.appendRow(r));
  }
  return ss;
}

function attach(sandbox, ss) {
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => ss;
}

test('getConfig_: a Script Property always beats the Ledger tab', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [['ADMIN_NOTIFY_EMAIL', 'from-tab@ccpsnet.net']]);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('ADMIN_NOTIFY_EMAIL', 'from-property@ccpsnet.net');

  assert.equal(exported.getConfig_().adminNotifyEmail, 'from-property@ccpsnet.net');
});

test('getConfig_: the Ledger works out its own ID from the SYSTEM_ROLE row on its _CONFIG tab', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [['SYSTEM_ROLE', 'CENTRAL_LEDGER']]);
  attach(sandbox, ledger);

  const cfg = exported.getConfig_();
  assert.equal(cfg.ledgerSsId, ledger.getId());
  assert.equal(cfg.adminSsId, ledger.getId(), 'ADMIN_SS_ID defaults to the Ledger');
});

test('getConfig_: a teacher\'s cloned sheet finds the Ledger through its own _CONFIG tab', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, []);
  const matrix = sandbox.SpreadsheetApp.create('Teacher Matrix');
  const tab = matrix.insertSheet('_CONFIG');
  tab.appendRow(['Key', 'Value']);
  tab.appendRow(['CENTRAL_LEDGER_SS_ID', ledger.getId()]);
  attach(sandbox, matrix);

  assert.equal(exported.getConfig_().ledgerSsId, ledger.getId());
});

test('getConfig_: an attached sheet with no _CONFIG tab is not mistaken for the Ledger', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  attach(sandbox, sandbox.SpreadsheetApp.create('Some other sheet'));
  assert.throws(() => exported.getConfig_(), /Missing: CENTRAL_LEDGER_SS_ID/);
});

test('getConfig_: district-wide keys come from the Ledger tab when no property sets them', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [
    ['SYSTEM_ROLE', 'CENTRAL_LEDGER'],
    ['ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net'],
    ['STUDENT_DASHBOARD_URL', 'https://script.google.com/macros/s/student/exec'],
    ['LEADER_HUB_OAUTH_CLIENT_ID', 'client.apps.googleusercontent.com'],
    ['MASTER_STUDENT_TEMPLATE_ID', 'template-doc-id'],
  ]);
  attach(sandbox, ledger);

  const cfg = exported.getConfig_();
  assert.equal(cfg.adminNotifyEmail, 'admin@ccpsnet.net');
  assert.equal(cfg.studentDashboardUrl, 'https://script.google.com/macros/s/student/exec');
  assert.equal(cfg.leaderHubOauthClientId, 'client.apps.googleusercontent.com');
  assert.equal(cfg.masterStudentTemplateId, 'template-doc-id');
});

test('getConfig_: per-teacher values and secrets are never read from the shared tab', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  // TEACHER_EMAIL gates the Teacher Dashboard. Taken from a shared tab, it
  // would let one address into every dashboard that hadn't set its own.
  const ledger = makeLedger(sandbox, [
    ['SYSTEM_ROLE', 'CENTRAL_LEDGER'],
    ['TEACHER_EMAIL', 'intruder@ccpsnet.net'],
    ['TEACHER_DASHBOARD_URL', 'https://example.invalid/exec'],
    ['TEACHER_MATRIX_SS_ID', 'someone-elses-matrix'],
  ]);
  attach(sandbox, ledger);

  const cfg = exported.getConfig_();
  assert.equal(cfg.teacherEmail, '');
  assert.equal(cfg.teacherDashboardUrl, '');
  assert.equal(cfg.teacherMatrixSsId, '');
  // M2_ENABLED: seven files read it straight from Script Properties.
  ['TEACHER_EMAIL', 'TEACHER_DASHBOARD_URL', 'DEPLOY_DRIFT_GITHUB_TOKEN', 'DIRECT_GEMINI_API_KEY', 'M2_ENABLED']
    .forEach((k) => assert.ok(!exported.SHARED_CONFIG_KEYS.includes(k), k + ' must not be shareable'));
});

test('getConfig_: a blank Script Property falls through to the tab instead of hiding it', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  // The setup wizard writes "" placeholders for exactly these keys.
  const ledger = makeLedger(sandbox, [['MASTER_STUDENT_TEMPLATE_ID', 'template-doc-id']]);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('MASTER_STUDENT_TEMPLATE_ID', '');

  assert.equal(exported.getConfig_().masterStudentTemplateId, 'template-doc-id');
});

test('getConfig_: a Ledger that can\'t be opened leaves defaults in place, and the failure isn\'t cached', () => {
  // e.g. a simple trigger, which can't open other files. Caching that miss
  // would hide the shared values from the same person's next full run.
  const first = load(RESOLUTION_EXPORTS);
  first.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', 'unopenable-ledger');
  let opens = 0;
  first.sandbox.SpreadsheetApp.openById = () => { opens++; throw new Error('You do not have permission'); };

  const cfg = first.exported.getConfig_();
  assert.equal(cfg.adminNotifyEmail, '');
  assert.equal(cfg.studentEmailDomain, 'ccpsnet.net');
  first.exported.getConfig_();
  assert.equal(opens, 1, 'within one execution the failed read is not repeated');
  assert.equal(first.sandbox.CacheService.getScriptCache()
    .get(first.exported.SHARED_CONFIG_CACHE_PREFIX + 'unopenable-ledger'), null,
  'a failed read must not be cached for later executions');
});

test('getConfig_: the tab is read once and then served from the cache', () => {
  const first = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(first.sandbox, [['ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net']]);
  first.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  let opens = 0;
  const realOpen = first.sandbox.SpreadsheetApp.openById;
  first.sandbox.SpreadsheetApp.openById = (id) => { opens++; return realOpen(id); };

  first.exported.getConfig_();
  first.exported.getConfig_();
  assert.equal(opens, 1);
  const cached = first.sandbox.CacheService.getScriptCache()
    .get(first.exported.SHARED_CONFIG_CACHE_PREFIX + ledger.getId());
  assert.deepEqual(JSON.parse(cached), { ADMIN_NOTIFY_EMAIL: 'admin@ccpsnet.net' });
});

test('seedLedgerConfigTab: creates the tab, marks the Ledger, copies shared keys, never overwrites', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, null);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net');
  props.setProperty('ADMIN_ROOT_FOLDER_ID', 'root-folder');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  props.setProperty('DEPLOY_DRIFT_GITHUB_TOKEN', 'ghp_secret');

  const first = exported.seedLedgerConfigTab();
  assert.deepEqual(first.added.sort(), ['ADMIN_NOTIFY_EMAIL', 'ADMIN_ROOT_FOLDER_ID', 'SYSTEM_ROLE']);
  const rows = ledger.getSheetByName('_CONFIG').getDataRange().getValues();
  const keys = rows.map((r) => r[0]);
  assert.ok(!keys.includes('TEACHER_EMAIL'), 'per-teacher values stay out of the shared tab');
  assert.ok(!keys.includes('DEPLOY_DRIFT_GITHUB_TOKEN'), 'secrets stay out of the shared tab');

  // A second project with a different admin address: reported, not written.
  props.setProperty('ADMIN_NOTIFY_EMAIL', 'someone-else@ccpsnet.net');
  const second = exported.seedLedgerConfigTab();
  assert.deepEqual(second.added, []);
  assert.equal(second.conflicts.length, 1);
  assert.match(second.conflicts[0], /ADMIN_NOTIFY_EMAIL/);
  const after = ledger.getSheetByName('_CONFIG').getDataRange().getValues();
  assert.equal(after.find((r) => r[0] === 'ADMIN_NOTIFY_EMAIL')[1], 'admin@ccpsnet.net');
});

test('seedLedgerConfigTab: refuses a spreadsheet that isn\'t the Ledger', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const notLedger = sandbox.SpreadsheetApp.create('Teacher Matrix');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', notLedger.getId());

  assert.throws(() => exported.seedLedgerConfigTab(), /no Ledger tab/);
  assert.equal(notLedger.getSheetByName('_CONFIG'), null, 'nothing written');
});

test('seedLedgerConfigTab: surrounding spaces in a property are not a conflict', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [['ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net']]);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('ADMIN_NOTIFY_EMAIL', ' admin@ccpsnet.net ');

  assert.deepEqual(exported.seedLedgerConfigTab().conflicts, []);
});

test('seedLedgerConfigTab then getConfig_: a project with only the Ledger ID gets the shared values', () => {
  const seeder = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(seeder.sandbox, null);
  const props = seeder.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  props.setProperty('STUDENT_DASHBOARD_URL', 'https://script.google.com/macros/s/student/exec');
  seeder.exported.seedLedgerConfigTab();

  // Same sandbox stands in for a second project: drop everything but the ID.
  props.deleteProperty('STUDENT_DASHBOARD_URL');
  assert.equal(seeder.exported.getConfig_().studentDashboardUrl,
    'https://script.google.com/macros/s/student/exec');
});

test('refreshSharedConfig: an edit to the tab is picked up now, not after the cache expires', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [
    ['SYSTEM_ROLE', 'CENTRAL_LEDGER'],
    ['ADMIN_NOTIFY_EMAIL', 'old@ccpsnet.net'],
  ]);
  attach(sandbox, ledger);
  assert.equal(exported.getConfig_().adminNotifyEmail, 'old@ccpsnet.net'); // now cached

  const tab = ledger.getSheetByName('_CONFIG');
  tab.rows.find((r) => r[0] === 'ADMIN_NOTIFY_EMAIL')[1] = 'new@ccpsnet.net';
  assert.equal(exported.getConfig_().adminNotifyEmail, 'old@ccpsnet.net', 'still cached before the refresh');

  const report = exported.refreshSharedConfig();
  assert.equal(report.ADMIN_NOTIFY_EMAIL.value, 'new@ccpsnet.net');
  assert.equal(exported.getConfig_().adminNotifyEmail, 'new@ccpsnet.net');
});

test('refreshSharedConfig: works in a project found through CENTRAL_LEDGER_SS_ID too', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [['STUDENT_DASHBOARD_URL', 'https://old.example/exec']]);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ledger.getId());
  exported.getConfig_();
  ledger.getSheetByName('_CONFIG').rows.find((r) => r[0] === 'STUDENT_DASHBOARD_URL')[1] = 'https://new.example/exec';

  assert.equal(exported.refreshSharedConfig().STUDENT_DASHBOARD_URL.value, 'https://new.example/exec');
});

test('showConfigSources: says where each value came from', () => {
  const { exported, sandbox } = load(RESOLUTION_EXPORTS);
  const ledger = makeLedger(sandbox, [
    ['SYSTEM_ROLE', 'CENTRAL_LEDGER'],
    ['ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net'],
  ]);
  attach(sandbox, ledger);
  sandbox.PropertiesService.getScriptProperties().setProperty('STUDENT_EMAIL_DOMAIN', 'ccpsnet.net');

  const r = exported.showConfigSources();
  assert.match(r.CENTRAL_LEDGER_SS_ID.source, /marked CENTRAL_LEDGER/);
  assert.match(r.ADMIN_SS_ID.source, /same as CENTRAL_LEDGER_SS_ID/);
  assert.match(r.ADMIN_NOTIFY_EMAIL.source, /Central Ledger _CONFIG tab/);
  assert.equal(r.STUDENT_EMAIL_DOMAIN.source, 'Script Property');
  assert.match(r.MASTER_STUDENT_TEMPLATE_ID.source, /not set/);
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
