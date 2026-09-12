'use strict';
// Regression tests for kos-personal/7_WebApp.gs's caller checks — an
// external product review found doGet() and doPost() had NO caller check
// at all: any signed-in Google account could load the operator UI, and
// anyone who found the deployment URL could POST fabricated COG_EXHAUST
// verdicts. Fixed with _isAuthorizedOwner_() (doGet, Session.getActiveUser()
// vs. CFG.PROP.OWNER_EMAIL — same pattern as leader-hub's Code.gs) and
// _isAuthorizedWebhookCall_() (doPost, a `?secret=` query param vs.
// CFG.PROP.WEBHOOK_SHARED_SECRET, since a Cog agent posting a verdict
// isn't an interactive Google sign-in the way doGet()'s caller is).
//
// Both are tested directly rather than through doGet()/doPost() themselves
// — this harness deliberately leaves HtmlService/ContentService unmocked
// (see gas-sandbox.js's own header), so calling either entry point here
// throws ReferenceError by design. Splitting the check into its own named
// function (matching how doGet()'s owner gate is already separate from
// doGet() itself) keeps the auth logic testable without those globals.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '7_WebApp.gs'),
];
const EXPOSE = ['_isAuthorizedOwner_', '_isAuthorizedWebhookCall_', 'CFG'];

function load(extraGlobals) {
  return loadGasFiles(FILES, EXPOSE, extraGlobals);
}

function sessionAs(email) {
  return { Session: { getActiveUser() { return { getEmail() { return email; } }; } } };
}

// ── _isAuthorizedOwner_() — doGet()'s gate ──────────────────────────────

test('_isAuthorizedOwner_: fails closed when OWNER_EMAIL is not set, even for the deploying account', () => {
  const { exported, sandbox } = load(sessionAs('adam@ccpsnet.net'));
  // No KOS_OWNER_EMAIL property set at all.
  assert.equal(exported._isAuthorizedOwner_(), false);
});

test('_isAuthorizedOwner_: true when the viewer matches OWNER_EMAIL', () => {
  const { exported, sandbox } = load(sessionAs('adam@ccpsnet.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.OWNER_EMAIL, 'adam@ccpsnet.net'
  );
  assert.equal(exported._isAuthorizedOwner_(), true);
});

test('_isAuthorizedOwner_: matches case-insensitively', () => {
  const { exported, sandbox } = load(sessionAs('Adam@CCPSNET.net'));
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.OWNER_EMAIL, 'adam@ccpsnet.net'
  );
  assert.equal(exported._isAuthorizedOwner_(), true);
});

test('_isAuthorizedOwner_: false when the viewer is a different Google account', () => {
  const { exported, sandbox } = load(sessionAs('someone.else@gmail.com'));
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.OWNER_EMAIL, 'adam@ccpsnet.net'
  );
  assert.equal(exported._isAuthorizedOwner_(), false);
});

// ── _isAuthorizedWebhookCall_() — doPost()'s gate ───────────────────────

test('_isAuthorizedWebhookCall_: fails closed when WEBHOOK_SHARED_SECRET is not set', () => {
  const { exported } = load();
  assert.equal(exported._isAuthorizedWebhookCall_({ parameter: { secret: 'anything' } }), false);
});

test('_isAuthorizedWebhookCall_: true when the `?secret=` param matches', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.WEBHOOK_SHARED_SECRET, 'topsecret123'
  );
  assert.equal(exported._isAuthorizedWebhookCall_({ parameter: { secret: 'topsecret123' } }), true);
});

test('_isAuthorizedWebhookCall_: false when the `?secret=` param is missing or wrong', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.WEBHOOK_SHARED_SECRET, 'topsecret123'
  );
  assert.equal(exported._isAuthorizedWebhookCall_({ parameter: { secret: 'wrong' } }), false);
  assert.equal(exported._isAuthorizedWebhookCall_({ parameter: {} }), false);
});

test('_isAuthorizedWebhookCall_: false, not a throw, on a malformed event object', () => {
  const { exported, sandbox } = load();
  sandbox.PropertiesService.getScriptProperties().setProperty(
    exported.CFG.PROP.WEBHOOK_SHARED_SECRET, 'topsecret123'
  );
  assert.doesNotThrow(() => exported._isAuthorizedWebhookCall_(null));
  assert.equal(exported._isAuthorizedWebhookCall_(null), false);
  assert.equal(exported._isAuthorizedWebhookCall_(undefined), false);
  assert.equal(exported._isAuthorizedWebhookCall_({}), false);
});
