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
    '_retentionCutoff_', 'checkRetentionSchedule', 'previewRetentionDisposition', 'applyRetentionDisposition',
    '_retentionApprovalCode_'
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
  CompetencyEvidence: 'CompetencyEvidence', SCRDecisionLog: 'SCRDecisionLog', EvaluationLog: 'EvaluationLog',
  ParentReportLog: 'ParentReportLog', PartUnlocks: 'PartUnlocks',
  WarmUpQueue: 'WarmUpQueue', ReflectionLog: 'ReflectionLog', StudentProfiles: 'StudentProfiles', WarmUpRegistry: 'WarmUpRegistry',
  WarmUpTextBox: 'WarmUpTextBox',
  WarmUpResponses: 'WarmUpResponses', SCRSuggestions: 'SCRSuggestions', FlowInput: 'FlowInput',
  Flow3Input: 'Flow3Input', Flow4Input: 'Flow4Input', Flow5Input: 'Flow5Input',
  ReviewQueue: 'ReviewQueue', STAGING_PIPELINE: 'STAGING_PIPELINE',
};
const RECORD = ['Ledger', 'StudentAssignments', 'StudentDocRegistry', 'CompetencyEvidence', 'SCRDecisionLog', 'EvaluationLog', 'ReflectionLog',
  'ParentReportLog', 'PartUnlocks'];

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

// 2026-10-21: a renamed date header made every row "no readable date"
// without saying why. The check names the header it looked for.
test('a tab whose date header is missing is named, and its rows are not counted as undated', () => {
  const { exported, ss } = load();
  const f4 = ss.insertSheet('Flow4Input');
  f4.appendRow(['When', 'QueueID', 'Status']);
  f4.appendRow([new Date(2010, 0, 15), 'q1', 'CONSUMED']);
  f4.appendRow([new Date(), 'q2', 'READY']);
  const r = byLabel(exported.checkRetentionSchedule());
  assert.equal(r.Flow4Input.missingDateColumn, 'Timestamp');
  assert.deepEqual([r.Flow4Input.rows, r.Flow4Input.past, r.Flow4Input.undated], [2, 0, 0]);
  const p = byLabel(exported.previewRetentionDisposition().results);
  assert.equal(p.Flow4Input.disposable, 0, 'undecided, never disposable');
});

test('previewRetentionDisposition: removable rows and their Docs, rows waiting on the archive pass, and nothing deleted', () => {
  const { exported, ss } = load();
  const old = new Date(2010, 0, 15);
  const recent = new Date();
  const scr = ss.insertSheet('SCRDecisionLog');
  scr.appendRow(['decision_id', 'student_email', 'competency_id', 'suggested', 'final', 'type',
    'decided_at', 'decided_by', 'evidence', 'archive_status']);
  scr.appendRow(['d1', 's1@x.net', 'C1', 2, 2, 'CONFIRMED', old, 't', '', 'ARCHIVED — pending disposition review']);
  scr.appendRow(['d2', 's2@x.net', 'C1', 2, 3, 'OVERRIDDEN', old, 't', '', '']);
  scr.appendRow(['d3', 's3@x.net', 'C1', 2, 2, 'CONFIRMED', recent, 't', '', '']);

  // StudentDocRegistry: no archive marker, so past is removable; its Doc goes with it.
  const sdr = ss.insertSheet('StudentDocRegistry');
  sdr.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at']);
  sdr.appendRow(['s1@x.net', 'S One', 'DOC-OLD', 'u', old]);
  sdr.appendRow(['s2@x.net', 'S Two', '', 'u', old]);
  sdr.appendRow(['s3@x.net', 'S Three', 'DOC-NEW', 'u', recent]);
  sdr.appendRow(['s4@x.net', 'S Four', 'DOC-X', 'u', 'not a date']);

  const before = [scr, sdr].map((t) => t.getDataRange().getValues().map((r) => r.slice()));
  const out = exported.previewRetentionDisposition();
  const r = byLabel(out.results);
  assert.deepEqual([r.SCRDecisionLog.disposable, r.SCRDecisionLog.awaitingArchive], [1, 1]);
  assert.deepEqual([r.StudentDocRegistry.disposable, r.StudentDocRegistry.linkedDocs,
    r.StudentDocRegistry.undated], [2, 1, 1]);
  assert.deepEqual(out.totals, { disposable: 3, linkedDocs: 1, awaitingArchive: 1, undecided: 1 });
  assert.deepEqual([scr, sdr].map((t) => t.getDataRange().getValues()), before, 'nothing written');
});

// The disposition itself (D3, 2026-10-28): only what the operator approved.
function dispositionFixture() {
  const env = load();
  const { ss, sandbox } = env;
  const old = new Date(2010, 0, 15);
  const sdr = ss.insertSheet('StudentDocRegistry');
  sdr.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at']);
  sdr.appendRow(['s1@x.net', 'S One', 'DOC-OLD', 'u', old]);
  sdr.appendRow(['s2@x.net', 'S Two', '', 'u', old]);
  sdr.appendRow(['s3@x.net', 'S Three', 'DOC-NEW', 'u', new Date()]);
  sdr.appendRow(['s5@x.net', 'S Five', 'DOC-GONE', 'u', old]); // its Doc can't be found
  const trashed = [];
  ['DOC-OLD', 'DOC-NEW'].forEach((id) => sandbox.DriveApp._files.set(id, { setTrashed: (t) => { if (t) trashed.push(id); } }));
  return Object.assign(env, { sdr, trashed, old });
}

test('applyRetentionDisposition: refused without the approval code from the report; nothing removed', () => {
  const { exported, sdr, props, trashed } = dispositionFixture();
  assert.match(exported.applyRetentionDisposition().error, /no pending disposition/);
  const report = exported.previewRetentionDisposition();
  assert.match(report.approvalCode, /^D-[0-9A-F]{8}$/);
  assert.match(exported.applyRetentionDisposition().error, new RegExp('Set RETENTION_DISPOSITION_APPROVE to ' + report.approvalCode));
  props.setProperty('RETENTION_DISPOSITION_APPROVE', 'D-00000000');
  assert.equal(exported.applyRetentionDisposition().ok, false, 'a wrong code');
  assert.equal(sdr.getLastRow(), 5);
  assert.deepEqual(trashed, []);
});

test('applyRetentionDisposition: removes the approved rows, trashes their Docs, keeps a row whose Doc fails, logs counts', () => {
  const { exported, sdr, props, trashed, ss } = dispositionFixture();
  const report = exported.previewRetentionDisposition();
  props.setProperty('RETENTION_DISPOSITION_APPROVE', report.approvalCode);
  const res = exported.applyRetentionDisposition();
  assert.deepEqual([res.ok, res.removed, res.docsTrashed, res.keptDocFailed, res.done], [true, 2, 1, 1, false]);
  assert.deepEqual(trashed, ['DOC-OLD'], 'the recent row\'s Doc is untouched');
  assert.deepEqual(sdr.getDataRange().getValues().slice(1).map((r) => r[0]), ['s3@x.net', 's5@x.net'],
    'the recent row stays, and so does the row whose Doc could not be trashed');
  const log = ss.getSheetByName('DispositionLog').getDataRange().getValues();
  assert.deepEqual(log[0], ['RanAt', 'ApprovalCode', 'Record', 'Cutoff', 'RowsRemoved', 'DocsTrashed', 'KeptDocFailed', 'Done']);
  assert.deepEqual(log[1].slice(1), [report.approvalCode, 'StudentDocRegistry', log[1][3], 2, 1, 1, 'no']);
  assert.equal(props.getProperty('RETENTION_DISPOSITION_APPROVE'), report.approvalCode, 'not done: the approval stays');
  assert.ok(!JSON.stringify(log).includes('s1@x.net'), 'counts only');
});

test('applyRetentionDisposition: only the rows the report named; a row past its period since then is left (Docket IV)', () => {
  const env = dispositionFixture();
  const { exported, sdr, props, old, ss } = env;
  sdr.deleteRow(5); // no undeletable Doc this time
  const report = exported.previewRetentionDisposition();
  props.setProperty('RETENTION_DISPOSITION_APPROVE', report.approvalCode);
  const list = ss.getSheetByName('DispositionPending').getDataRange().getValues();
  assert.deepEqual(list[0], ['Record', 'RowKey']);
  assert.equal(list.length, 3, 'one fingerprint per approved row');
  assert.ok(!JSON.stringify(list).includes('s1@x.net'), 'fingerprints only, no row content');
  sdr.appendRow(['s6@x.net', 'S Six', '', 'u', old]); // past, added after the report
  const res = exported.applyRetentionDisposition();
  assert.deepEqual([res.ok, res.removed, res.notApproved, res.done], [true, 2, 1, true]);
  assert.deepEqual(sdr.getDataRange().getValues().slice(1).map((r) => r[0]), ['s3@x.net', 's6@x.net'],
    'the row the report never named is still there');
  assert.equal(props.getProperty('RETENTION_DISPOSITION_APPROVE'), null, 'cleared when done');
  assert.equal(props.getProperty('RETENTION_DISPOSITION_PENDING'), null);
  assert.equal(ss.getSheetByName('DispositionPending').getLastRow(), 0, 'the list is cleared too');
});

test('applyRetentionDisposition: a row changed since the report is left; an edited list of rows is refused whole', () => {
  const env = dispositionFixture();
  const { exported, sdr, props, ss } = env;
  sdr.deleteRow(5);
  let report = exported.previewRetentionDisposition();
  props.setProperty('RETENTION_DISPOSITION_APPROVE', report.approvalCode);
  sdr.getRange(3, 2).setValue('S Two, renamed'); // the second old row changes after the report
  let res = exported.applyRetentionDisposition();
  assert.deepEqual([res.removed, res.notApproved], [1, 1]);
  assert.deepEqual(sdr.getDataRange().getValues().slice(1).map((r) => r[0]), ['s2@x.net', 's3@x.net']);

  report = exported.previewRetentionDisposition();
  props.setProperty('RETENTION_DISPOSITION_APPROVE', report.approvalCode);
  const list = ss.getSheetByName('DispositionPending');
  list.appendRow(['StudentDocRegistry', 'f'.repeat(64)]); // someone adds a row to the list
  assert.match(exported.applyRetentionDisposition().error, /doesn't match the report/);
  assert.equal(sdr.getLastRow(), 3, 'refused whole: nothing removed');
});

test('applyRetentionDisposition: a stale approval is refused', () => {
  const env = dispositionFixture();
  const { exported, sdr, props } = env;
  sdr.deleteRow(5);
  exported.previewRetentionDisposition();
  const pending = JSON.parse(props.getProperty('RETENTION_DISPOSITION_PENDING'));
  pending.at = '2026-01-02';
  props.setProperty('RETENTION_DISPOSITION_PENDING', JSON.stringify(pending));
  props.setProperty('RETENTION_DISPOSITION_APPROVE', exported._retentionApprovalCode_(JSON.stringify(pending)));
  assert.match(exported.applyRetentionDisposition().error, /over 7 days old/);
  assert.equal(sdr.getLastRow(), 4, 'a stale approval removes nothing');
});
