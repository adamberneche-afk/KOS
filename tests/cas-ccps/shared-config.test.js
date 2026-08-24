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
const { loadGasFile } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');

function load() {
  return loadGasFile(SHARED_CONFIG_PATH, ['getConfig_']);
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
