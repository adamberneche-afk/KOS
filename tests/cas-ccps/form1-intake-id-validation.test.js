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

// ── Rejections reach a person ────────────────────────────────────────────
// Both rejections used to end at Logger.log, which only the script owner's
// execution log shows: no student doc, no word to the teacher, and the
// student simply never appeared.

function mailTo(sandbox) {
  return sandbox.MailApp.getSentMessages();
}

test('onFormSubmit_Intake: an invalid account emails the teacher on the form, with the reason and the fix', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['12345@ccpsnet.net'] }));

  const sent = mailTo(sandbox);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'teacher@ccpsnet.net');
  assert.match(sent[0].subject, /Registration Failed — Alice Example/);
  assert.match(sent[0].body, /12345@ccpsnet\.net/);
  assert.match(sent[0].body, /7 digits @ccpsnet\.net/);
  assert.match(sent[0].body, /resubmit/);
});

test('onFormSubmit_Intake: the admin is copied too, but only once when admin and teacher are the same person', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const props = sandbox.PropertiesService.getScriptProperties();

  props.setProperty('ADMIN_NOTIFY_EMAIL', 'admin@ccpsnet.net');
  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['John Smith'] }));
  assert.deepEqual(mailTo(sandbox).map((m) => m.to), ['teacher@ccpsnet.net', 'admin@ccpsnet.net']);

  const second = load();
  setUpFixture(second.sandbox);
  second.sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_NOTIFY_EMAIL', 'Teacher@ccpsnet.net');
  second.exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['John Smith'] }));
  assert.deepEqual(mailTo(second.sandbox).map((m) => m.to), ['teacher@ccpsnet.net']);
});

test('onFormSubmit_Intake: an assignment ID with no LIVE assignment emails the teacher instead of vanishing', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);

  // Valid account, so it clears the ID gate and fetchAssignment_ returns
  // null (the fixture has no MatrixRegistry tab).
  exported.onFormSubmit_Intake(makeEvent({ 'Assignment Config ID': ['CFG-TYPO'] }));

  const sent = mailTo(sandbox);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'teacher@ccpsnet.net');
  assert.match(sent[0].body, /No LIVE assignment has Assignment Config ID "CFG-TYPO"/);
  assert.match(sent[0].body, /Teacher Matrix/);
});

test('onFormSubmit_Intake: a rejection writes no Ledger row', () => {
  const { exported, sandbox } = load();
  const { ss } = setUpFixture(sandbox);
  const ledger = ss.insertSheet('Ledger');
  const before = ledger.getLastRow();

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['someone.else@gmail.com'] }));

  // The account may belong to someone else, and the Ledger is what other
  // scripts share documents from.
  assert.equal(ledger.getLastRow(), before);
});

test('onFormSubmit_Intake: a failing or impossible email never throws out of the trigger', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  sandbox.MailApp.sendEmail = () => { throw new Error('Service invoked too many times: email'); };
  assert.doesNotThrow(() =>
    exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['12345@ccpsnet.net'] })));

  const second = load();
  setUpFixture(second.sandbox);
  assert.doesNotThrow(() =>
    second.exported.onFormSubmit_Intake(makeEvent({
      'Student Google Account': ['12345@ccpsnet.net'], 'Teacher Email': [''],
    })));
  assert.equal(mailTo(second.sandbox).length, 0);
});

test('onFormSubmit_Intake: a valid account typed in capitals is accepted, not rejected', () => {
  const { exported, sandbox } = load();
  const { openByIdCalls } = setUpFixture(sandbox);

  exported.onFormSubmit_Intake(makeEvent({ 'Student Google Account': ['1234567@CCPSNET.NET'] }));

  assert.equal(openByIdCalls.length, 1, 'a capitalized but valid account must clear the ID gate');
  assert.doesNotMatch(mailTo(sandbox).map((m) => m.body).join('\n'), /not a district student account/);
});
