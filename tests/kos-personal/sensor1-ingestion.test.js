'use strict';
// Regression tests for kos-personal/2_Ingestion_Sensors.gs's incident
// diagnosis #4/#5 fixes:
//   - _groupLinesForArchiveWrite_() / _archiveRawLog_() — the shared,
//     line-safe, bounded-write replacement for both sensor1_scan
//     InboundSessions() and submitSessionLog()'s old duplicated
//     create->setText(wholeText)->saveAndClose() archive write, which
//     could throw "Too many changes applied before saving document" on
//     a large log.
//   - sensor1_scanInboundSessions()'s new per-run file cap, pacing, and
//     quarantine-after-N-failures escalation — previously unbounded and
//     unescalated, "by far the largest source of ERROR_LOG volume" per
//     the incident diagnosis.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '20_VectorClassifySessions.gs'), // VECTOR_CLASSIFY session parts
  path.join(KP, '2_Ingestion_Sensors.gs'),
];
const EXPOSE = [
  'sensor1_scanInboundSessions', 'submitSessionLog', 'submitExternalData', 'archiveStagingPipeline',
  '_groupLinesForArchiveWrite_', '_archiveRawLog_',
  '_recordSensor1Failure_', '_clearSensor1Failure_', '_chunkAndQueue',
  'CFG',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// ── _groupLinesForArchiveWrite_() — the reconstruction guarantee ───────────

test('_groupLinesForArchiveWrite_: groups.join("\\n") reconstructs the exact original text', () => {
  const { exported } = load();
  const rawText = Array.from({ length: 50 }, (_, i) => 'line ' + i + ' '.repeat(20)).join('\n');
  const groups = exported._groupLinesForArchiveWrite_(rawText, 200);
  assert.ok(groups.length > 1, 'expected more than one group at this small maxChars');
  assert.equal(groups.join('\n'), rawText);
});

test('_groupLinesForArchiveWrite_: a single line longer than maxChars becomes its own group, not split mid-line', () => {
  const { exported } = load();
  // Long line first, with nothing already pending ahead of it, so it
  // triggers its own immediate flush rather than joining a shorter line
  // that was already accumulating — isolates the "one oversized line"
  // case from the general grouping behavior.
  const longLine = 'x'.repeat(500);
  const rawText = longLine + '\nshort after';
  const groups = exported._groupLinesForArchiveWrite_(rawText, 50);
  assert.equal(groups[0], longLine, 'the long line must appear whole, not split mid-line');
  assert.equal(groups.join('\n'), rawText);
});

test('_groupLinesForArchiveWrite_: empty text reconstructs to empty text', () => {
  const { exported } = load();
  const groups = exported._groupLinesForArchiveWrite_('', 200);
  assert.equal(groups.join('\n'), '');
});

// ── _archiveRawLog_() ───────────────────────────────────────────────────────

test('_archiveRawLog_: writes a new doc whose text exactly matches the input', () => {
  const { exported, sandbox } = load();
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  const rawText = 'session line one\nsession line two\nsession line three';

  const wrote = exported._archiveRawLog_(rawFolder, '[RAW]_test-uuid', rawText);

  assert.equal(wrote, true);
  const files = rawFolder.getFiles();
  assert.ok(files.hasNext());
  const file = files.next();
  assert.equal(file.getName(), '[RAW]_test-uuid');
  const doc = sandbox.DocumentApp.openById(file.getId());
  assert.equal(doc.getBody().getText(), rawText);
  assert.equal(file.sharingAccess, 'PRIVATE');
  assert.equal(file.sharingPermission, 'EDIT');
});

test('_archiveRawLog_: a large multi-line log still reconstructs exactly, across several flush groups', () => {
  const { exported, sandbox } = load();
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  // Small ARCHIVE_WRITE_CHUNK_CHARS forces several groups/flushes for a
  // log that would otherwise fit in one — exercises the multi-group path,
  // not just the single-group fast path.
  sandbox.__exported.CFG.ARCHIVE_WRITE_CHUNK_CHARS = 40;
  sandbox.__exported.CFG.ARCHIVE_WRITE_FLUSH_EVERY = 2;

  const rawText = Array.from({ length: 30 }, (_, i) => 'session log line number ' + i).join('\n');
  exported._archiveRawLog_(rawFolder, '[RAW]_multi', rawText);

  const file = rawFolder.getFiles().next();
  const doc = sandbox.DocumentApp.openById(file.getId());
  assert.equal(doc.getBody().getText(), rawText);
});

// _archiveRawLog_() used to commit its batches with DocumentApp.flush(), a
// method DocumentApp does not have — only SpreadsheetApp does. It passed
// every test because the sandbox defined one anyway, while production threw
// "DocumentApp.flush is not a function" 57 times and, on writes too small to
// reach the first commit, the "Too many changes applied before saving
// document" error the batching existed to prevent 180 more. Google's own
// text for that one prescribes the fix: save in smaller batches using
// Document.saveAndClose(), then reopen.
test('sandbox: DocumentApp does not fabricate a flush() the real API lacks', () => {
  const { sandbox } = load();
  assert.equal(typeof sandbox.DocumentApp.flush, 'undefined',
    'a mock that invents a method cannot fail the one test that would catch its use');
  assert.equal(typeof sandbox.SpreadsheetApp.flush, 'function',
    'SpreadsheetApp.flush() is real and must stay');
});

test('_archiveRawLog_: commits with saveAndClose()+reopen between batches, not a non-existent flush', () => {
  const { exported, sandbox } = load();
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  sandbox.__exported.CFG.ARCHIVE_WRITE_CHUNK_CHARS = 40;
  sandbox.__exported.CFG.ARCHIVE_WRITE_FLUSH_EVERY = 2;

  let saves = 0;
  const realOpen = sandbox.DocumentApp.openById;
  const instrument = (doc) => {
    if (!doc._saveInstrumented) {
      const realSave = doc.saveAndClose.bind(doc);
      doc.saveAndClose = () => { saves++; return realSave(); };
      doc._saveInstrumented = true;
    }
    return doc;
  };
  const realCreate = sandbox.DocumentApp.create;
  sandbox.DocumentApp.create = (t) => instrument(realCreate.call(sandbox.DocumentApp, t));
  sandbox.DocumentApp.openById = (id) => instrument(realOpen.call(sandbox.DocumentApp, id));

  const rawText = Array.from({ length: 30 }, (_, i) => 'session log line number ' + i).join('\n');
  exported._archiveRawLog_(rawFolder, '[RAW]_commits', rawText);

  sandbox.DocumentApp.create = realCreate;
  sandbox.DocumentApp.openById = realOpen;

  assert.ok(saves > 1,
    'a multi-batch write commits mid-write, not only once at the end (saves=' + saves + ')');
  const file = rawFolder.getFiles().next();
  assert.equal(sandbox.DocumentApp.openById(file.getId()).getBody().getText(), rawText,
    'and the reopened handle still reconstructs the text exactly');
});

test('_archiveRawLog_: a no-op (returns false, writes nothing new) if the name already exists', () => {
  const { exported, sandbox } = load();
  const rawFolder = sandbox.DriveApp.getRootFolder().createFolder('RAW_EXHAUST');
  exported._archiveRawLog_(rawFolder, '[RAW]_dup', 'first write');

  const wroteAgain = exported._archiveRawLog_(rawFolder, '[RAW]_dup', 'second write — must not land');

  assert.equal(wroteAgain, false);
  assert.equal(rawFolder.files.length, 1, 'must not create a second file with the same name');
  const doc = sandbox.DocumentApp.openById(rawFolder.getFiles().next().getId());
  assert.equal(doc.getBody().getText(), 'first write');
});

// ── _recordSensor1Failure_() / _clearSensor1Failure_() ─────────────────────

test('_recordSensor1Failure_: increments independently per file ID', () => {
  const { exported } = load();
  assert.equal(exported._recordSensor1Failure_('file-A'), 1);
  assert.equal(exported._recordSensor1Failure_('file-A'), 2);
  assert.equal(exported._recordSensor1Failure_('file-B'), 1);
  assert.equal(exported._recordSensor1Failure_('file-A'), 3);
});

test('_clearSensor1Failure_: resets that file ID back to a fresh count on the next failure', () => {
  const { exported } = load();
  exported._recordSensor1Failure_('file-C');
  exported._recordSensor1Failure_('file-C');
  exported._clearSensor1Failure_('file-C');
  assert.equal(exported._recordSensor1Failure_('file-C'), 1);
});

test('_clearSensor1Failure_: clearing an ID with no recorded failures is a harmless no-op', () => {
  const { exported } = load();
  assert.doesNotThrow(() => exported._clearSensor1Failure_('never-failed'));
});

// ── sensor1_scanInboundSessions() — batch cap, pacing, quarantine ──────────

function setUpSensor1(sandbox) {
  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const inbound = sandbox.DriveApp.getRootFolder().createFolder('03.5_INBOUND_SESSIONS');
  const rawExhaust = sandbox.DriveApp.getRootFolder().createFolder('03.4_RAW_EXHAUST');
  sandbox.DriveApp._registerFolder(inbound);
  sandbox.DriveApp._registerFolder(rawExhaust);

  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('ID_03_5_INBOUND_SESSIONS', inbound.getId());
  props.setProperty('ID_00_RAW_EXHAUST', rawExhaust.getId());
  return { ss, inbound, rawExhaust };
}

// A real, processable inbound doc — long enough to clear the >= 50 char
// near-empty guard, unique enough per call to clear the dedup guard.
function addInboundDoc(sandbox, inbound, name, text) {
  const doc = sandbox.DocumentApp.create(name);
  doc.getBody().setText(text || ('session content for ' + name + ' '.repeat(10)));
  const file = sandbox.DriveApp.getFileById(doc.getId());
  inbound.addFile(file);
  file._parent = inbound;
  return file;
}

test('sensor1_scanInboundSessions: stops at SENSOR1_MAX_FILES_PER_RUN, leaving the rest for the next run', () => {
  const { exported, sandbox } = load();
  const { inbound } = setUpSensor1(sandbox);
  sandbox.__exported.CFG.SENSOR1_MAX_FILES_PER_RUN = 2;
  sandbox.__exported.CFG.SENSOR1_PACING_MS = 0; // keep the test fast — sleep is a no-op anyway

  addInboundDoc(sandbox, inbound, 'doc-1');
  addInboundDoc(sandbox, inbound, 'doc-2');
  addInboundDoc(sandbox, inbound, 'doc-3');

  exported.sensor1_scanInboundSessions();

  // Exactly the cap's worth left the inbound folder (moved to _PROCESSED);
  // the rest stayed put for the next run to pick up.
  assert.equal(inbound.files.length, 1, 'one file should remain unprocessed after hitting the cap');
});

test('sensor1_scanInboundSessions: quarantines a file after SENSOR1_QUARANTINE_THRESHOLD failed runs, not before', () => {
  const { exported, sandbox } = load();
  const { inbound } = setUpSensor1(sandbox);
  sandbox.__exported.CFG.SENSOR1_QUARANTINE_THRESHOLD = 2;
  sandbox.__exported.CFG.SENSOR1_PACING_MS = 0;

  // A file with a real, fully-functional Drive entry (so moveTo() etc.
  // still work normally) but whose matching Document has been removed —
  // DocumentApp.openById() then throws "Document not found", simulating
  // the real "Service Documents failed" failure mode without needing to
  // reproduce Drive's actual rate limit.
  const doc = sandbox.DocumentApp.create('broken-doc');
  const file = sandbox.DriveApp.getFileById(doc.getId());
  file.moveTo(inbound);
  sandbox.DocumentApp._docs.delete(doc.getId());

  exported.sensor1_scanInboundSessions(); // failure #1 — not yet quarantined
  assert.equal(inbound.files.length, 1, 'still in inbound after one failure (below threshold)');

  exported.sensor1_scanInboundSessions(); // failure #2 — hits the threshold
  assert.equal(inbound.files.length, 0, 'moved out of inbound once the threshold is reached');
});

// ── Intake never loses a chunk ──────────────────────────────────────────────
// A chunk that failed to create used to be logged and skipped while the
// inbound file still moved to _PROCESSED; the duplicate check then refused
// the log for good. Now nothing is queued, the file stays, and the next run
// retries it.

function stagingRows(ss) {
  const sheet = ss.getSheetByName('STAGING_PIPELINE');
  return sheet ? sheet.rows.slice(1) : [];
}

test('sensor1_scanInboundSessions: a chunk that fails to create leaves the log in inbound, nothing queued', () => {
  const { exported, sandbox } = load();
  const { ss, inbound } = setUpSensor1(sandbox);
  sandbox.__exported.CFG.SENSOR1_PACING_MS = 0;
  addInboundDoc(sandbox, inbound, 'doc-chunkfail',
    'A real session log with enough words in it to clear the near-empty guard easily.');

  const realCreate = sandbox.DocumentApp.create;
  sandbox.DocumentApp.create = (name) => {
    if (/^\[CHUNK_/.test(name)) throw new Error('Service Documents failed');
    return realCreate.call(sandbox.DocumentApp, name);
  };
  try {
    exported.sensor1_scanInboundSessions();
  } finally {
    sandbox.DocumentApp.create = realCreate;
  }

  assert.equal(inbound.files.length, 1, 'the log stays in inbound for the next run');
  assert.equal(stagingRows(ss).filter((r) => /_CH\d+$/.test(r[1])).length, 0, 'no chunk was queued');

  // The next run, with Docs healthy again, processes it in full.
  exported.sensor1_scanInboundSessions();
  assert.equal(inbound.files.length, 0);
  assert.ok(stagingRows(ss).some((r) => /_CH01$/.test(r[1])), 'the chunk is queued on the retry');
});

test('_chunkAndQueue: a later chunk failing trashes the chunk docs already made', () => {
  const { exported, sandbox } = load();
  const { ss, rawExhaust } = setUpSensor1(sandbox);
  const staging = ss.insertSheet('STAGING_PIPELINE');
  staging.appendRow(['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count']);
  const delim = sandbox.__exported.CFG.DELIMITER;
  const big = sandbox.__exported.CFG.MAX_CHUNK_SIZE;
  const text = delim + ' one] ' + 'a'.repeat(big - 50) + '\n\n' + delim + ' two] ' + 'b'.repeat(big - 50);

  const realCreate = sandbox.DocumentApp.create;
  sandbox.DocumentApp.create = (name) => {
    if (/^\[CHUNK_02\]/.test(name)) throw new Error('Service Documents failed');
    return realCreate.call(sandbox.DocumentApp, name);
  };
  try {
    assert.throws(() => exported._chunkAndQueue(text, 'SESSION_LOG', 'LOG-abc', rawExhaust, staging, ss),
      /chunk 2 of 2.*Nothing was queued/);
  } finally {
    sandbox.DocumentApp.create = realCreate;
  }

  assert.equal(staging.getLastRow(), 1, 'no staging rows');
  const first = [...sandbox.DriveApp._files.values()].find((f) => /^\[CHUNK_01\]_LOG-abc/.test(f.name));
  assert.ok(first && first.isTrashed(), 'chunk 1 is trashed, not left orphaned');
});

// ── Duplicate guards read STAGING_ARCHIVE too ──────────────────────────────
// archiveStagingPipeline() moves finished rows to STAGING_ARCHIVE, and the
// guards used to read STAGING_PIPELINE alone, so an archived log could be
// ingested a second time.

function archiveEverything(exported, ss, status) {
  const staging = ss.getSheetByName('STAGING_PIPELINE');
  for (let r = 2; r <= staging.getLastRow(); r++) staging.getRange(r, 6).setValue(status);
  exported.archiveStagingPipeline();
  assert.equal(staging.getLastRow(), 1, 'every row should have been archived');
}

const LOG_TEXT = 'A full session log, long enough to clear the near-empty guard. '.repeat(3);

test('submitSessionLog: a log whose rows were archived as processed is still a duplicate', () => {
  const { exported, sandbox } = load();
  const { ss } = setUpSensor1(sandbox);
  assert.equal(exported.submitSessionLog(LOG_TEXT).success, true);
  archiveEverything(exported, ss, 'PROCESSED');

  const again = exported.submitSessionLog(LOG_TEXT);

  assert.equal(again.duplicate, true);
  assert.equal(stagingRows(ss).length, 0, 'nothing re-queued');
});

test('submitSessionLog: a log archived as failed can be resubmitted', () => {
  const { exported, sandbox } = load();
  const { ss } = setUpSensor1(sandbox);
  assert.equal(exported.submitSessionLog(LOG_TEXT).success, true);
  archiveEverything(exported, ss, 'FAILED_PARSE');

  assert.equal(exported.submitSessionLog(LOG_TEXT).success, true);
});

test('sensor1_scanInboundSessions: skips an inbound log whose rows were archived', () => {
  const { exported, sandbox } = load();
  const { ss, inbound } = setUpSensor1(sandbox);
  sandbox.__exported.CFG.SENSOR1_PACING_MS = 0;
  assert.equal(exported.submitSessionLog(LOG_TEXT).success, true);
  archiveEverything(exported, ss, 'PROCESSED');
  addInboundDoc(sandbox, inbound, 'same-log', LOG_TEXT);

  exported.sensor1_scanInboundSessions();

  assert.equal(stagingRows(ss).length, 0, 'the archived log must not be queued again');
  assert.equal(inbound.files.length, 0, 'the duplicate still leaves inbound');
});

test('submitExternalData: content whose row was archived is still a duplicate', () => {
  const { exported, sandbox } = load();
  const { ss } = setUpSensor1(sandbox);
  const text = 'External article body that is long enough to queue.';
  assert.equal(exported.submitExternalData(text, 'Article').success, true);
  archiveEverything(exported, ss, 'PROCESSED');

  assert.equal(exported.submitExternalData(text, 'Article').duplicate, true);
});
