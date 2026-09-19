'use strict';
// Regression test for 02_Form1_IntakeAndWorkspaceGenerator.js's Google
// account validation — the intake grant-point gap this account's own audit
// ledger flagged: _studentIdPattern_() (defined in
// 29_StudentContextAggregator.js, same shared GAS project) already existed
// and was used correctly on the read/reporting side, but was never applied
// at this file's onFormSubmit_Intake(), the one call site that actually
// calls addEditor()/addViewer() with the submitted string. A typo or a
// bad-faith form entry there shared the class folder and student doc with
// an unrelated Google account while the real student was locked out.
//
// Loaded together with 00_SharedConfig.js (real getConfig_(), same
// convention as student-context-aggregator.test.js) and
// 29_StudentContextAggregator.js (real _studentIdPattern_()/
// _studentEmailDomain_()) — all three bound to the same GAS project
// (cas-ccps:central-ledger, tools/gas-lint/project-map.json), so this
// exercises the real validator, not a stand-in for it.
//
// Asserting "did the gate block it" without building out the full
// intake→template→Drive-share happy path (a much larger fixture than this
// one gate needs): SpreadsheetApp.openById() is the very next real API
// call after the gate, inside fetchAssignment_() — spying on it is a
// stable, natural boundary for "did onFormSubmit_Intake return before or
// after the new check," without coupling the test to Logger message text.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SHARED_CONFIG_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '00_SharedConfig.js');
const AGGREGATOR_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '29_StudentContextAggregator.js');
const INTAKE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '02_Form1_IntakeAndWorkspaceGenerator.js');

function load() {
  return loadGasFiles(
    [SHARED_CONFIG_PATH, AGGREGATOR_PATH, INTAKE_PATH],
    ['onFormSubmit_Intake'],
  );
}

// Real getConfig_() just needs its two required Script Properties set — no
// MatrixRegistry tab is created on the fake ledger spreadsheet, so a
// googleId that clears the new validation gate falls through to
// fetchAssignment_()'s own "tab not found" rejection instead, a real,
// later code path — which is exactly how this test tells "the gate let it
// through" apart from "the gate blocked it," via the openById spy below.
function setUpFixture(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const openByIdCalls = [];
  const realOpenById = sandbox.SpreadsheetApp.openById;
  sandbox.SpreadsheetApp.openById = (id) => { openByIdCalls.push(id); return realOpenById(id); };
  return { ss, openByIdCalls };
}

function makeEvent(overrides = {}) {
  const namedValues = {
    'Student Google Account': ['1234567@ccpsnet.net'],
    'Student Full Name': ['Alice Example'],
    'Block': ['A'],
    'Class Name': ['Intro to CS'],
    'Subject': ['CS'],
    'Course Name': ['Intro to CS'],
    'Period': ['3'],
    'Teacher Name': ['Ms. Teacher'],
    'Teacher Email': ['teacher@ccpsnet.net'],
    'Assignment Config ID': ['CFG-1'],
    ...overrides,
  };
  return { namedValues };
}

test('onFormSubmit_Intake: a well-formed 7-digit@domain googleId clears the new gate (reaches fetchAssignment_, not rejected by it)', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['1234567@ccpsnet.net'] }));

  assert.equal(openByIdCalls.length, 1, 'a well-formed id must reach fetchAssignment_, which opens the ledger spreadsheet');
});

test('onFormSubmit_Intake: a malformed googleId (wrong digit count) is rejected before fetchAssignment_/any Drive-sharing logic runs', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['12345@ccpsnet.net'] }));

  assert.equal(openByIdCalls.length, 0, 'a malformed id must be rejected before ever calling fetchAssignment_');
});

test('onFormSubmit_Intake: a googleId at the wrong domain is rejected the same way', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['1234567@gmail.com'] }));

  assert.equal(openByIdCalls.length, 0);
});

test('onFormSubmit_Intake: a non-email googleId (e.g. a pasted display name) is rejected, never reaches addEditor/addViewer', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['John Smith'] }));

  assert.equal(openByIdCalls.length, 0);
});

test('onFormSubmit_Intake: the pre-existing "missing required fields" rejection still fires first for a genuinely blank googleId, not the new check', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  // If this threw (e.g. from calling _studentIdPattern_().test(undefined)
  // before the blank check), the test itself would fail with that
  // exception rather than reaching the assertion below - the ordering
  // being wrong is caught either way.
  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': [''] }));

  assert.equal(openByIdCalls.length, 0);
});
