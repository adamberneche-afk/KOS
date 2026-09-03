'use strict';
// Regression tests for runLeaderHubConnectionCheck (07_TeacherDashboard.js) —
// the D1 integration's diagnostic.
//
// WHY THIS IS NOT A FIXTURE, which is what the rest of this session built.
// Every flow in this repo has a queue, so a fixture row gives it something to
// latch onto. D1 has no queue: leader-hub's browser POSTs an OAuth ID token
// and gets JSON back synchronously. There is nothing to seed. What there is,
// is four independent causes that all surface in leader-hub as the same
// opaque error:
//
//   1. LEADER_HUB_OAUTH_CLIENT_ID unset
//   2. TEACHER_EMAIL unset or not matching the signed-in teacher
//   3. the token is fine but the source tabs are empty, so every action
//      returns an empty payload — which leader-hub cannot distinguish from a
//      rejection
//   4. the /exec URL leader-hub stores points at an older deployment
//
// The check covers 1-3 from inside the script and says explicitly that 4 is
// unknowable from there. The tests below are mostly about case 3 and about
// the honesty of case 4, because those are the two a naive "does it work?"
// check would get wrong: it would either call an empty deployment healthy, or
// claim to have verified something it cannot see.
//
// The FERPA property is also pinned: getRoster is the first of the three
// actions to return student name, email and period, and this check runs from
// a Run dropdown into an execution log.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('07_TeacherDashboard.js')];

const EXPOSE = [
  'runLeaderHubConnectionCheck', '_lhcHasRows_', '_lhcCount_', '_lhcDescribe_',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

const TEACHER = 'teacher@ccpsnet.net';

// Builds an admin/ledger spreadsheet with the three tabs the API reads. `rows`
// controls whether each carries data, so case 3 can be driven directly.
function setUp(sandbox, opts) {
  const o = opts || {};
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  if (o.teacherEmail !== null) props.setProperty('TEACHER_EMAIL', o.teacherEmail || TEACHER);
  if (o.clientId !== null) props.setProperty('LEADER_HUB_OAUTH_CLIENT_ID', o.clientId || 'fake.apps.googleusercontent.com');
  return ss;
}

// ── The pure helpers, which carry the case-3 judgement ───────────────────────

test('a handler that succeeded but returned nothing is NOT counted as data', () => {
  const { exported } = load();
  // The distinction the whole check turns on. "success: true, 0 rows" reads
  // to leader-hub exactly like a rejection, so calling it healthy here would
  // send someone to debug OAuth for an empty tab.
  assert.equal(exported._lhcHasRows_({ success: true, units: [] }), false);
  assert.equal(exported._lhcHasRows_({ success: true, units: [{ id: 'u1' }] }), true);
});

test('an explicitly failed handler is not counted as data', () => {
  const { exported } = load();
  assert.equal(exported._lhcHasRows_({ success: false, message: 'tab missing' }), false);
  assert.equal(exported._lhcHasRows_(null), false);
});

test('the empty case explains why leader-hub cannot tell it apart from a rejection', () => {
  const { exported } = load();
  const detail = exported._lhcDescribe_({ success: true, rows: [] }, 'competency row');
  assert.match(detail, /source tab is empty/);
  assert.match(detail, /cannot tell an empty payload from a rejection/,
    'the actionable half of the message: ' + detail);
});

test('a failed handler surfaces its own message rather than a generic one', () => {
  const { exported } = load();
  assert.match(exported._lhcDescribe_({ success: false, message: 'No PacingGuide tab' }, 'unit'),
    /No PacingGuide tab/);
});

test('the row count is found whichever key the handler names its array', () => {
  const { exported } = load();
  // The three handlers each name their payload differently, and this check
  // should not need to know which — a key-name assumption here would silently
  // report 0 for one of them.
  assert.equal(exported._lhcCount_({ success: true, units: [1, 2, 3] }), 3);
  assert.equal(exported._lhcCount_({ success: true, competencies: [1] }), 1);
  assert.equal(exported._lhcCount_({ success: true, students: [1, 2] }), 2);
  assert.equal(exported._lhcCount_({ success: true }), 0);
});

test('pluralisation does not produce "1 students"', () => {
  const { exported } = load();
  assert.match(exported._lhcDescribe_({ success: true, students: [1] }, 'student'),
    /1 student returned/);
  assert.match(exported._lhcDescribe_({ success: true, students: [1, 2] }, 'student'),
    /2 students returned/);
});

// ── The check itself ─────────────────────────────────────────────────────────

test('an unset OAuth client ID is reported, and named as district-wide', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { clientId: null });
  const result = exported.runLeaderHubConnectionCheck();
  const check = result.checks.find((c) => /OAUTH_CLIENT_ID/.test(c.name));
  assert.equal(check.ok, false);
  // Worth saying explicitly: an operator seeing "not configured" per teacher
  // would try to register one per deployment.
  assert.match(check.detail, /once for the whole district, not per teacher/);
});

test('an unset TEACHER_EMAIL is reported as failing closed', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, { teacherEmail: null });
  const result = exported.runLeaderHubConnectionCheck();
  const check = result.checks.find((c) => /TEACHER_EMAIL/.test(c.name));
  assert.equal(check.ok, false);
  assert.match(check.detail, /fails closed/,
    'a blank teacherEmail rejects every request rather than accepting any');
});

test('all three actions are exercised, so a partial outage is visible', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.runLeaderHubConnectionCheck();
  ['getPacingGuide', 'getCompetencyRegistry', 'getRoster'].forEach((action) => {
    assert.ok(result.checks.some((c) => c.name.indexOf(action) !== -1),
      action + ' is not checked — a single-action failure would be invisible');
  });
});

test('empty source tabs fail the check rather than passing it', () => {
  const { exported, sandbox } = load();
  // Case 3, driven end to end: both properties set, so authorization is fine,
  // and nothing to return. A naive "did it throw?" check would call this
  // healthy and send someone to debug OAuth.
  setUp(sandbox);
  const result = exported.runLeaderHubConnectionCheck();
  const dataChecks = result.checks.filter((c) => /returns data/.test(c.name));
  assert.equal(dataChecks.length, 3);
  dataChecks.forEach((c) => {
    assert.equal(c.ok, false, c.name + ' should fail on an empty deployment');
  });
});

test('the roster check reports a count and never a name or an email', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  // FERPA: getRoster is the first of the three actions to return student PII,
  // and this check writes to an execution log. Seed a roster that WOULD leak
  // if the detail string carried rows rather than a count.
  const roster = ss.insertSheet('Roster');
  roster.appendRow(['StudentName', 'StudentEmail', 'Period']);
  roster.appendRow(['Jane Student', '1234567@ccpsnet.net', '3']);

  const result = exported.runLeaderHubConnectionCheck();
  const blob = JSON.stringify(result);
  assert.ok(blob.indexOf('Jane Student') === -1, 'a student name reached the report');
  assert.ok(blob.indexOf('1234567@ccpsnet.net') === -1, 'a student email reached the report');
  const check = result.checks.find((c) => c.name.indexOf('getRoster') !== -1);
  assert.match(check.detail, /count only/);
});

test('the check never throws, whatever the handlers do', () => {
  const { exported, sandbox } = load();
  // No tabs at all, no properties. A diagnostic that dies on a broken
  // deployment is useless precisely when it is needed.
  const ss = sandbox.SpreadsheetApp.create('Empty');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', ss.getId());

  const result = exported.runLeaderHubConnectionCheck();
  assert.equal(result.total, result.checks.length);
  assert.ok(result.passed < result.total);
});

test('the check is read-only — it consumes nothing and writes nothing', () => {
  const { exported, sandbox } = load();
  const ss = setUp(sandbox);
  const before = ss.getSheets().map((s) => [s.getName(), s.getLastRow()]);
  exported.runLeaderHubConnectionCheck();
  const after = ss.getSheets().map((s) => [s.getName(), s.getLastRow()]);
  assert.deepEqual(after, before, 'safe to run against a live deployment at any time');
});

test('it does not claim to have verified the deployment URL', () => {
  const { exported, sandbox } = load();
  setUp(sandbox);
  const result = exported.runLeaderHubConnectionCheck();
  // The one cause it genuinely cannot see: nothing in this script knows what
  // /exec URL leader-hub has stored, and a redeploy issues a new one. Claiming
  // otherwise would be the worst outcome — an operator trusting a green
  // report while leader-hub calls a dead URL.
  assert.ok(!result.checks.some((c) => /URL|exec|deployment/i.test(c.name)),
    'there must be no check implying the URL was verified');
});
