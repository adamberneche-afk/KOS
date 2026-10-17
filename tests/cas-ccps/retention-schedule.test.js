'use strict';
// cas-ccps/scripts/57_RetentionSchedule.js and _retentionCutoff_() (00):
// the retention schedule the operator adopted on 2026-10-13 (pending the
// district records officer's confirmation against GS-21). Records are kept
// N whole school years after the year ends (August start); the five
// archive passes use the same cutoff. Loads all of cas-ccps:central-ledger
// (tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const projectMap = require('../../tools/gas-lint/project-map.json');

const ROOT = path.join(__dirname, '..', '..');
const FILES = (projectMap.projects || projectMap)['cas-ccps:central-ledger'].files.map((f) => path.join(ROOT, f));

function load() {
  const env = loadGasFiles(FILES, [
    '_retentionCutoff_', 'checkRetentionSchedule'
  ]);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  return Object.assign(env, { ss, props });
}

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

test('_retentionCutoff_: whole school years after the year ends, August start', () => {
  const { exported } = load();
  // 2026-10-13: 2025-26 has ended. Five years after it, 2020-21 and earlier are past.
  assert.equal(ymd(exported._retentionCutoff_(5, new Date(2026, 9, 13))), '2021-08-01');
  assert.equal(ymd(exported._retentionCutoff_(1, new Date(2026, 9, 13))), '2025-08-01');
  // 2026-07-15: 2025-26 hasn't ended, so the last ended year is 2024-25.
  assert.equal(ymd(exported._retentionCutoff_(5, new Date(2026, 6, 15))), '2020-08-01');
  // The first of August starts the new count.
  assert.equal(ymd(exported._retentionCutoff_(1, new Date(2026, 7, 1))), '2025-08-01');
});

const TAB_NAMES = {
  Ledger: 'Ledger', StudentAssignments: 'StudentAssignments', StudentDocRegistry: 'StudentDocRegistry',
  CompetencyEvidence: 'CompetencyEvidence', SCRDecisionLog: 'SCRDecisionLog', ParentReportLog: 'ParentReportLog',
  WarmUpQueue: 'WarmUpQueue', StudentProfiles: 'StudentProfiles', WarmUpRegistry: 'WarmUpRegistry',
  WarmUpTextBox: 'WarmUpTextBox',
  WarmUpResponses: 'WarmUpResponses', SCRSuggestions: 'SCRSuggestions', FlowInput: 'FlowInput',
  Flow3Input: 'Flow3Input', Flow4Input: 'Flow4Input', Flow5Input: 'Flow5Input',
  ReviewQueue: 'ReviewQueue', STAGING_PIPELINE: 'STAGING_PIPELINE',
};
const RECORD = ['Ledger', 'StudentAssignments', 'StudentDocRegistry', 'CompetencyEvidence', 'SCRDecisionLog', 'ParentReportLog'];

function byLabel(results) {
  const r = {};
  results.forEach((x) => { r[x.label] = x; });
  return r;
}

test('the tiers: records 5 years, WarmUpQueue and other working data 1 year; each finds its tab', () => {
  const { exported, ss, props } = load();
  Object.values(TAB_NAMES).forEach((n) => ss.insertSheet(n));
  const r = byLabel(exported.checkRetentionSchedule());
  assert.deepEqual(Object.keys(r).sort(), Object.keys(TAB_NAMES).sort());
  Object.keys(TAB_NAMES).forEach((l) => {
    assert.equal(r[l].found, true, l + ' finds its tab under the default config');
    const record = RECORD.indexOf(l) !== -1;
    assert.equal(r[l].tier, record ? 'RECORD' : 'WORKING', l);
    assert.equal(r[l].years, record ? 5 : 1, l);
  });
  // A confirmed period is a Script Property, not a code change.
  props.setProperty('WORKING_DATA_RETENTION_YEARS', '3');
  props.setProperty('SCR_RETENTION_YEARS', '6');
  const r2 = byLabel(exported.checkRetentionSchedule());
  assert.equal(r2.FlowInput.years, 3);
  assert.equal(r2.WarmUpQueue.years, 1, 'WarmUpQueue keeps its own property');
  assert.equal(r2.SCRDecisionLog.years, 6);
});

test('checkRetentionSchedule: counts past, archived and undated rows, and changes nothing', () => {
  const env = load();
  const { exported, ss } = env;
  const old = new Date(2010, 0, 15);
  const recent = new Date();

  // SCRDecisionLog: one past and archived, one past not yet archived, one kept, one undated.
  const scr = ss.insertSheet('SCRDecisionLog');
  scr.appendRow(['decision_id', 'student_email', 'competency_id', 'suggested', 'final', 'type',
    'decided_at', 'decided_by', 'evidence', 'archive_status']);
  scr.appendRow(['d1', 's1@x.net', 'C1', 2, 2, 'CONFIRMED', old, 't', '', 'ARCHIVED — pending disposition review']);
  scr.appendRow(['d2', 's2@x.net', 'C1', 2, 3, 'OVERRIDDEN', old, 't', '', '']);
  scr.appendRow(['d3', 's3@x.net', 'C1', 2, 2, 'CONFIRMED', recent, 't', '', '']);
  scr.appendRow(['d4', 's4@x.net', 'C1', 2, 2, 'CONFIRMED', '', 't', '', '']);

  // Flow4Input, read by its Timestamp header.
  const f4 = ss.insertSheet('Flow4Input');
  f4.appendRow(['Timestamp', 'QueueID', 'Status', 'OriginalPromptText', 'ResponseText']);
  f4.appendRow([old, 'q1', 'CONSUMED', '', 'text']);
  f4.appendRow([recent, 'q2', 'READY', '', 'text']);

  const before = scr.getDataRange().getValues().map((r) => r.slice());
  const r = byLabel(exported.checkRetentionSchedule());

  assert.deepEqual([r.SCRDecisionLog.rows, r.SCRDecisionLog.past, r.SCRDecisionLog.pastArchived,
    r.SCRDecisionLog.undated], [4, 2, 1, 1]);
  assert.deepEqual([r.Flow4Input.rows, r.Flow4Input.past, r.Flow4Input.pastArchived], [2, 1, 0]);
  assert.equal(r.Ledger.found, false, 'a missing tab is reported, not counted as zero');
  assert.deepEqual(scr.getDataRange().getValues(), before, 'nothing written');
});
