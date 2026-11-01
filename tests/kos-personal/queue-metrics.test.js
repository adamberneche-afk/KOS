'use strict';
// getQueueMetrics() / logQueueMetrics() (kos-personal/3_Queue_Processor.gs).
// Their first live run (2026-10-29) found 23 STAGING_PIPELINE rows that no
// count showed: DUPLICATE, PARTITIONED and CONSOLIDATED had no bucket.
// Every status is counted now, and those three are terminal.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '4_Vector_Router.gs', '12_StudioReturnHarvest.gs',
  '20_VectorClassifySessions.gs', '22_BriefingDocs.gs', '3_Queue_Processor.gs'].map((f) => path.join(KP, f));

function setup(statuses) {
  const { exported, sandbox } = loadGasFiles(FILES, ['getQueueMetrics', 'logQueueMetrics', 'CFG']);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('INDEX_ID', ss.getId());
  const staging = ss.insertSheet(exported.CFG.STAGING_SHEET);
  staging.appendRow(['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count']);
  statuses.forEach((s, i) => staging.appendRow([new Date(), 'UID-' + i, 'SESSION_LOG', 'u', 'f' + i, s, 0]));
  return exported;
}

const ALL = ['PENDING_FLOW', 'STUDIO_ACTIVE', 'NEEDS_CURATOR', 'PROCESSED', 'INTAKE_PROCESSED', 'PARTITIONED',
  'CONSOLIDATED', 'DUPLICATE', 'DUPLICATE', 'STUDIO_TIMEOUT', 'AUDITING _LOG'];

test('getQueueMetrics: every status lands in a count; PARTITIONED/CONSOLIDATED are processed, DUPLICATE its own', () => {
  const m = setup(ALL).getQueueMetrics();
  const c = m.counts;
  assert.equal(c.processed, 4);
  assert.equal(c.duplicate, 2);
  assert.equal(c.unknown, 1);
  assert.equal(c.queued + c.active + c.needs_curator + c.processed + c.duplicate + c.failed + c.unknown, ALL.length);
  assert.equal(m.total, ALL.length - c.unknown);
});

test('logQueueMetrics: counts by status, and the finished, resolved and failed rows as terminal', () => {
  const r = setup(ALL).logQueueMetrics();
  assert.equal(r.rows, ALL.length);
  assert.equal(r.byStatus.DUPLICATE, 2);
  assert.equal(r.byStatus['AUDITING _LOG'], 1);
  assert.equal(Object.values(r.byStatus).reduce((a, b) => a + b, 0), ALL.length, 'no row uncounted');
  assert.equal(r.terminal, 7, 'PROCESSED, INTAKE_PROCESSED, PARTITIONED, CONSOLIDATED, 2 DUPLICATE, STUDIO_TIMEOUT');
});
