'use strict';
// Why a session has no VECTOR_MATRIX row (2026-10-23). The primer's Data
// Quality block named two sessions with no Vector State row, and neither
// requeueStagingBatch() nor the classify backfill picked either up. Pins:
// explainUnclassifiedSessions() gives each counted session its state and
// the call that fixes it; the block no longer counts a copy of content
// another session has classified, or a copy archived as DUPLICATE; and
// resetUnrebuildableRows() classifies again a named session whose parts
// finished but whose row is gone.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '2_Ingestion_Sensors.gs', '4_Vector_Router.gs',
  '12_StudioReturnHarvest.gs', '13_StudioInputBuilder.gs', '19_StagingRequeue.gs', '20_VectorClassifySessions.gs',
  '21_VectorMatrixRepair.gs'].map((f) => path.join(KP, f));
const EXPOSE = ['explainUnclassifiedSessions', '_vcsSessionsWithoutRow_', '_vcsMatrixSessions_', 'resetUnrebuildableRows', 'CFG'];
const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  sandbox.DriveApp._registerFolder(rawFolder);
  props.setProperty('ID_00_RAW_EXHAUST', rawFolder.id);
  const staging = ss.insertSheet(exported.CFG.STAGING_SHEET);
  staging.appendRow(STAGING_HEADERS);
  const archive = ss.insertSheet('STAGING_ARCHIVE');
  archive.appendRow(['Archived_At'].concat(STAGING_HEADERS));
  const curator = ss.insertSheet('CuratorInput');
  curator.appendRow(['Timestamp', 'Payload_UID', 'Payload_Type', 'File_ID', 'SourceText', 'Status']);
  const log = ss.insertSheet(exported.CFG.SESSION_LOG_SHEET);
  log.appendRow(['Session_UID', 'Timestamp', 'Type', 'Stage', 'Version', 'Note']);
  const matrix = ss.insertSheet(exported.CFG.VECTOR_MATRIX_SHEET);
  matrix.appendRow(['Session_UID', 'Timestamp', 'ARCHITECTURE']);

  const day = (d) => new Date('2026-09-' + String(d).padStart(2, '0'));
  const env = { exported, sandbox, ss, staging, archive, curator, log, matrix };
  env.live = (uid, d, type, status) => staging.appendRow([day(d), uid, type || 'SESSION_LOG', 'u', 'f-' + uid, status || 'PROCESSED', 0]);
  env.gone = (uid, d, type, status) => archive.appendRow([new Date(), day(d), uid, type || 'SESSION_LOG', 'u', 'f-' + uid, status || 'PROCESSED', 0]);
  env.source = (uid) => curator.appendRow([new Date(), uid, 'SESSION_LOG', 'f-' + uid, 'text ' + uid, 'READY']);
  env.curated = (uid) => log.appendRow([uid, new Date(), 'SESSION_LOG', 'CURATOR', 'v8', 'processed']);
  return env;
}

// One session per state the report knows.
function seed(env) {
  const { live, gone, source, curated, matrix } = env;
  live('LOG-ready_CH01', 1); source('LOG-ready_CH01'); curated('LOG-ready_CH01');
  live('LOG-fail_CH01', 2); source('LOG-fail_CH01'); curated('LOG-fail_CH01');
  live('LOG-fail_VC01of01', 2, 'VECTOR_CLASSIFY', 'FAILED_PARSE');
  live('LOG-slow_CH01', 3); source('LOG-slow_CH01'); curated('LOG-slow_CH01');
  live('LOG-slow_VC01of01', 3, 'VECTOR_CLASSIFY', 'STUDIO_TIMEOUT');
  gone('LOG-d0ed0ed0_CH01', 4); source('LOG-d0ed0ed0_CH01'); curated('LOG-d0ed0ed0_CH01');
  gone('LOG-d0ed0ed0_VC01of01', 4, 'VECTOR_CLASSIFY', 'PROCESSED');
  // A failed part the old "Archive finished and failed rows" moved.
  live('LOG-a1a1a1a1_CH01', 8); source('LOG-a1a1a1a1_CH01'); curated('LOG-a1a1a1a1_CH01');
  gone('LOG-a1a1a1a1_VC01of01', 8, 'VECTOR_CLASSIFY', 'FAILED_PARSE');
  live('LOG-gone_CH01', 5); curated('LOG-gone_CH01'); // no CuratorInput text
  curated('LOG-lost_CH01');                            // no staging rows at all
  // The 2026-10-06 shape: a copy of classified content, its chunks archived.
  matrix.appendRow(['LOG-1789058964096-edd1075a', new Date(), 0.5]);
  gone('LOG-1789059068989-edd1075a_CH01', 6); source('LOG-1789059068989-edd1075a_CH01');
  curated('LOG-1789059068989-edd1075a_CH01');
  // A copy archived as DUPLICATE is resolved.
  gone('LOG-dup_CH01', 7, 'SESSION_LOG', 'DUPLICATE'); curated('LOG-dup_CH01');
}

test('explainUnclassifiedSessions: each counted session gets its state and the call that fixes it', () => {
  const env = setup();
  seed(env);
  const byUid = Object.fromEntries(env.exported.explainUnclassifiedSessions().map((e) => [e.sessionUid, e]));

  assert.deepEqual(Object.fromEntries(Object.entries(byUid).map(([k, e]) => [k, e.state])), {
    'LOG-ready': 'READY', 'LOG-fail': 'PART_FAILED', 'LOG-slow': 'PART_TIMED_OUT', 'LOG-d0ed0ed0': 'PARTS_DONE_NO_ROW',
    'LOG-a1a1a1a1': 'PARTS_DONE_NO_ROW', 'LOG-gone': 'TEXT_INCOMPLETE', 'LOG-lost': 'NOT_IN_STAGING', 'LOG-1789059068989-edd1075a': 'DUPLICATE_COPY',
  });
  assert.match(byUid['LOG-fail'].detail,
    /requeueStagingRows\(\{apply: true, uids: \['LOG-fail_VC01of01'\], statuses: \['FAILED_PARSE'\]\}\)/);
  assert.match(byUid['LOG-slow'].detail, /requeueStagingRows\(\{apply: true, uids: \['LOG-slow_VC01of01'\]\}\)/);
  assert.match(byUid['LOG-d0ed0ed0'].detail, /resetUnrebuildableRows\(\{apply: true, uids: \['LOG-d0ed0ed0'\]\}\)/);
  assert.match(byUid['LOG-a1a1a1a1'].detail, /archived \(FAILED_PARSE\), so no requeue reaches them/);
  assert.match(byUid['LOG-ready'].detail, /queueVectorClassifyBackfillBatch\(\)/);
  assert.equal(byUid['LOG-1789059068989-edd1075a'].counted, false);
  assert.equal(byUid['LOG-dup'], undefined, 'a copy archived as DUPLICATE is not listed');
  assert.equal(env.staging.getLastRow(), 1 + 7, 'read-only: nothing queued');
});

test('the Data Quality count leaves out copies of classified content and archived duplicates', () => {
  const env = setup();
  seed(env);
  const inMatrix = env.exported._vcsMatrixSessions_(env.ss);
  const counted = env.exported._vcsSessionsWithoutRow_(env.ss, inMatrix, {}).filter((s) => !s.twinOf).map((s) => s.sessionUid);
  assert.deepEqual(counted.sort(), ['LOG-a1a1a1a1', 'LOG-d0ed0ed0', 'LOG-fail', 'LOG-gone', 'LOG-lost', 'LOG-ready', 'LOG-slow']);
});

test('resetUnrebuildableRows: a named session whose parts finished but has no row is classified again', () => {
  const env = setup();
  seed(env);
  const r = env.exported.resetUnrebuildableRows({ apply: true, uids: ['LOG-d0ed0ed0'] });

  assert.deepEqual(r.requeued, ['LOG-d0ed0ed0'], JSON.stringify(r));
  const liveRows = env.staging.getRange(2, 1, env.staging.getLastRow() - 1, 7).getValues();
  const part = liveRows.find((row) => row[1] === 'LOG-d0ed0ed0_VC01of01');
  assert.ok(part && part[5] === 'PENDING_FLOW', 'a new part is queued');
  assert.equal(env.sandbox.DocumentApp.openById(part[4]).getBody().getText(), 'text LOG-d0ed0ed0_CH01');
  const archived = env.archive.getRange(2, 1, env.archive.getLastRow() - 1, 8).getValues()
    .filter((row) => row[2] === 'LOG-d0ed0ed0_VC01of01').map((row) => row[6]);
  assert.deepEqual(archived, ['SUPERSEDED'], 'the old finished part no longer counts');

  const again = Object.fromEntries(env.exported.explainUnclassifiedSessions().map((e) => [e.sessionUid, e.state]));
  assert.equal(again['LOG-d0ed0ed0'], 'IN_FLIGHT');
});
