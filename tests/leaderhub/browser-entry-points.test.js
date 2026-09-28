'use strict';
// Regression tests for the public, owner-only functions in leader-hub/Code.gs
// that the page calls through google.script.run.
//
// Why these exist: Apps Script never exposes a function ending in "_" to
// google.script.run. The page used to call eight such functions directly
// (settings, data, SCR scores, the AI/email bridge, the horizon list), so
// every one of those calls threw in the browser and none of that sync ever
// reached the server (confirmed live with ?diag=1, 2026-09-28).
//
// What these pin:
//   - Each public entry point does exactly what its "_" implementation does
//     for the owner.
//   - Each one refuses anyone else, and an unset OWNER_EMAIL, before doing
//     anything. Being public means any signed-in domain user can call it
//     from any page this script serves, so doGet()'s check isn't enough.
//   - Every name the built page calls is one of these, and each starts with
//     the owner check, so a new call can't slip in unguarded.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { findGoogleScriptRunCalls } = require('../../tools/gas-lint/check.js');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = ['Code.gs', 'EmailBridge.gs', 'Config.gs', 'Data.gs', 'SCR.gs'].map((f) => path.join(LH, f));
const ENTRY_POINTS = ['lhApiCall', 'lhGetHorizonItems', 'lhGetAllConfig', 'lhSaveConfig',
  'lhPushData', 'lhPullData', 'lhGetScrScores', 'lhSaveScrScores'];
const OWNER = 'owner@ccpsnet.net';

function load(viewer, ownerEmail) {
  const loaded = loadGasFiles(FILES, ENTRY_POINTS.concat(['lhGetConfig_']), {
    Session: { getActiveUser() { return { getEmail() { return viewer; } }; } },
  });
  if (ownerEmail !== null) {
    loaded.sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', ownerEmail || OWNER);
  }
  return loaded;
}

test('the owner gets the same results the "_" implementations give', () => {
  const { exported } = load(OWNER);
  assert.deepEqual(exported.lhSaveConfig('lh_profile', { name: 'Adam' }), { ok: true });
  assert.deepEqual(exported.lhGetAllConfig().lh_profile, { name: 'Adam' });
  assert.deepEqual(exported.lhSaveConfig('not_a_key', 1), { ok: false, error: 'Unknown config key: not_a_key' });
  assert.deepEqual(exported.lhPullData({ domain: 'trips' }), { ok: true, found: false });
  const pushed = exported.lhPushData({ domain: 'trips', headers: ['Id', 'RecordJSON'], rows: [['1', '{"id":1}']] });
  assert.equal(pushed.ok, true);
  assert.deepEqual(exported.lhPullData({ domain: 'trips' }).rows, [['1', '{"id":1}']]);
  assert.deepEqual(exported.lhGetScrScores(), { ok: true, found: false });
  assert.deepEqual(exported.lhSaveScrScores([]), { ok: true, saved: 0 });
});

test('the owner check ignores letter case, like doGet()\'s', () => {
  const { exported } = load('Owner@CCPSnet.net');
  assert.deepEqual(exported.lhPullData({ domain: 'trips' }), { ok: true, found: false });
});

test('anyone else is refused by every entry point', () => {
  const { exported } = load('someone@ccpsnet.net');
  ENTRY_POINTS.forEach((name) => {
    assert.throws(() => exported[name]('lh_profile', { name: 'x' }), /Not authorized/, name);
  });
});

test('a refused save writes nothing', () => {
  const { exported, sandbox } = load('someone@ccpsnet.net');
  assert.throws(() => exported.lhSaveConfig('lh_profile', { name: 'intruder' }), /Not authorized/);
  assert.equal(exported.lhGetConfig_('lh_profile'), null);
  assert.equal(sandbox.PropertiesService.getScriptProperties().getProperty('LH_CONFIG__lh_profile'), null);
});

test('with OWNER_EMAIL unset, nobody gets through', () => {
  const { exported } = load(OWNER, null);
  ENTRY_POINTS.forEach((name) => assert.throws(() => exported[name](), /Not authorized/, name));
});

test('a viewer the script can\'t identify is refused', () => {
  const { exported } = load('');
  ENTRY_POINTS.forEach((name) => assert.throws(() => exported[name](), /Not authorized/, name));
});

test('the built page calls only these entry points, and each one checks the owner first', () => {
  const rel = 'leader-hub/student-leader-hub.html';
  const html = fs.readFileSync(path.join(LH, 'student-leader-hub.html'), 'utf8');
  const called = [...new Set(findGoogleScriptRunCalls(rel, html).calls.map((c) => c.name))].sort();
  assert.deepEqual(called, ENTRY_POINTS.slice().sort());
  const code = fs.readFileSync(path.join(LH, 'Code.gs'), 'utf8');
  called.forEach((name) => {
    const at = code.indexOf('function ' + name + '(');
    assert.ok(at !== -1, name + ' is declared in Code.gs');
    const body = code.slice(code.indexOf('{', at) + 1).trimStart();
    assert.ok(body.startsWith('_lhRequireOwner_();'), name + ' checks the owner before anything else');
  });
});

// Editor-run maintenance functions are public too, so any page this web app
// serves can reach them through google.script.run. The ones that change
// shared state are owner-only.
test('editor-only functions that change shared state refuse anyone but the owner', () => {
  const MUTATING = ['repairAiQueueSchema', 'installAiFlowFixtures', 'removeAiFlowFixtures',
    'runAiFlowCanary', 'cleanUpAiFlowCanary', 'syncAiPromptsToSheet', 'installDeployVersionReportTrigger'];
  const files = FILES.concat(['AiPrompts.gs', 'FlowOps.gs', 'DeployVersionMarker.gs', 'DeployVersionReport.gs']
    .map((f) => path.join(LH, f)));
  const { exported, sandbox } = loadGasFiles(files, MUTATING, {
    Session: { getActiveUser() { return { getEmail() { return 'someone@ccpsnet.net'; } }; } },
  });
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', OWNER);
  MUTATING.forEach((name) => assert.throws(() => exported[name](), /Not authorized/, name));
});
