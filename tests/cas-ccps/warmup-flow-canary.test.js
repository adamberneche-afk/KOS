'use strict';
// runWarmUpFlowCanary() (41): the warm-up flows' Apps Script half with Studio
// stubbed. Since Flow 5 was merged into Flow 3 (2026-11-01) it checks that a
// row left at PENDING_BRIDGE becomes a Flow 3 input carrying the student's
// last answer, and that Flow 3's answer splits into the lead-in and the
// warm-up. No test ran the canary before.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '22_LessonContextHandler.js', '23_StudentProfileManager.js', '24_WarmUpBridge.js',
  '25_WarmUpWriter.js', '37_FlowInputBuilder.js', '68_LessonParts.js', '03_QueueBridge.js', '40_FlowPrompts.js',
  '41_WarmUpFlowBridge.js'].map((f) => path.join(CC, f));

test('the warm-up canary passes every step, Flow 3\'s lead-in included', () => {
  const { exported, sandbox } = loadGasFiles(FILES, ['runWarmUpFlowCanary']);
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  ss.insertSheet('WarmUpQueue').appendRow(new Array(21).fill('h'));
  const r = exported.runWarmUpFlowCanary();
  assert.deepEqual(r.steps.filter((s) => !s.pass), []);
  assert.ok(r.steps.some((s) => /PENDING_BRIDGE row becomes a Flow 3 input/.test(s.name)));
  assert.ok(r.steps.some((s) => /splits into the lead-in/.test(s.name)));
  const left = ss.getSheetByName('WarmUpQueue').getDataRange().getValues().slice(1);
  assert.deepEqual(left, [], 'the canary removes its own rows');
});
