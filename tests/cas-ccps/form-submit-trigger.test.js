'use strict';
// 18_FormSubmitDispatcher.js: installFormSubmitTrigger() puts
// dispatchFormSubmit on the Central Ledger's form submissions, once. Before
// 2026-11-08 it was added by hand in the Triggers panel (the setup guide's
// gap 3). The dispatcher's own work (Form 1 intake) is tested with 02.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

function load() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('18_FormSubmitDispatcher.js')], ['installFormSubmitTrigger']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return env;
}

test('installFormSubmitTrigger installs dispatchFormSubmit on form submit, on the Ledger, once', () => {
  const env = load();
  const first = env.exported.installFormSubmitTrigger();
  const again = env.exported.installFormSubmitTrigger();
  assert.equal(first.installed, true);
  assert.equal(again.installed, false);
  const triggers = env.sandbox.ScriptApp.getProjectTriggers();
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].getHandlerFunction(), 'dispatchFormSubmit');
  assert.equal(triggers[0].getEventType(), 'ON_FORM_SUBMIT');
  assert.ok(triggers[0].__calls.some((c) => c.method === 'forSpreadsheet'));
});

test('a time trigger for dispatchFormSubmit does not count as the form-submit trigger', () => {
  const env = load();
  env.sandbox.ScriptApp.newTrigger('dispatchFormSubmit').timeBased().everyMinutes(1).create();
  assert.equal(env.exported.installFormSubmitTrigger().installed, true);
  assert.deepEqual(env.sandbox.ScriptApp.getProjectTriggers().map((t) => t.getEventType()), ['CLOCK', 'ON_FORM_SUBMIT']);
});
