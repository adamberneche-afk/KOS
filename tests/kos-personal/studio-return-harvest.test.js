'use strict';
// Regression tests for kos-personal/12_StudioReturnHarvest.gs — the Apps
// Script harvest that replaces the two blocked custom Studio steps.
//
// The custom steps could not be tested end to end from here at all (they run
// inside a Workspace Add-on runtime), and they are now dead code on this
// account regardless. What matters is that the port preserved their contracts
// EXACTLY, because three of the differences look cosmetic and are not:
//
//   1. The Curator contract RE-SERIALIZES (JSON.stringify) because it merges
//      the Auditor pass in. The Classification contract writes the ORIGINAL,
//      unstripped text — the fence is stripped only for the copy being
//      validated — because re-serializing risks reformatting floats or key
//      order differently from what the model produced, for no benefit.
//   2. A malformed Auditor pass is a FULL failure. Dropping the audit and
//      writing an un-audited result would paper over exactly what
//      CURATOR_PROMPT.md's rule against a fabricated sign-off forbids.
//   3. On any failure, NOTHING is written — not the doc, not the staging row.
//      KOS's spec wants the staleness guard to own retries, which is the
//      opposite of cas-ccps's Flow 2 behaviour.
//
// The load-bearing new behaviour is the doc-written breadcrumb. Once the doc
// body is overwritten the original source text is gone, so a retry would
// re-run inference against a document that is already JSON. The custom step
// could only flag that and hope someone noticed; this can resume.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '12_StudioReturnHarvest.gs'),
];

const EXPOSE = [
  'harvestStudioReturns', 'checkStudioReturns', 'checkStudioFlowLiveness',
  '_srPrepareDocText_', '_srStripJsonFence_', '_srFindStagingRow_',
  '_srIsDocWritten_', '_srMarkDocWritten_', '_srClearDocWritten_',
  'SR_COLS', 'SR_SHEET', 'SR_CURATOR_TYPES', 'SR_MAX_ATTEMPTS',
  'CFG', '_getSystemAsset', '_getOrCreateSheet',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// ── The two output contracts ─────────────────────────────────────────────────

test('curator output: fence stripped, Auditor merged under auditor_sign_off', () => {
  const { exported } = load();
  const out = exported._srPrepareDocText_(
    'SESSION_LOG', '```json\n{"summary":"s","themes":["UI"]}\n```', '{"verdict":"PASS"}');
  assert.equal(out.ok, true, out.error);
  const parsed = JSON.parse(out.text);
  assert.equal(parsed.summary, 's');
  // CURATOR_PROMPT.md Rule 8 / Section 4: ONE top-level key holding the
  // Auditor output verbatim, never a second JSON object appended after.
  assert.deepEqual(parsed.auditor_sign_off, { verdict: 'PASS' });
});

test('curator output with no Auditor pass carries no auditor_sign_off key', () => {
  const { exported } = load();
  const out = exported._srPrepareDocText_('SESSION_LOG', '{"summary":"s"}', '');
  assert.equal(out.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(out.text), 'auditor_sign_off'), false,
    'an absent audit must not become a present-but-empty sign-off');
});

test('a malformed Auditor pass fails the whole write rather than dropping the audit', () => {
  const { exported } = load();
  const out = exported._srPrepareDocText_('SESSION_LOG', '{"summary":"s"}', 'not json');
  assert.equal(out.ok, false);
  assert.match(out.error, /^AUDITOR_JSON_PARSE_FAILED/);
});

test('classification output is written VERBATIM, fence and all', () => {
  const { exported } = load();
  // The difference that looks like a bug and is not: the fence is stripped
  // only to validate. Re-serializing here would risk reformatting floats or
  // key order away from what the model produced, and there is nothing to
  // merge, so there is no reason to reconstruct it.
  const raw = '```json\n[{"theme":"UI","score":1.50}]\n```';
  const out = exported._srPrepareDocText_('VECTOR_CLASSIFY', raw, '');
  assert.equal(out.ok, true);
  assert.equal(out.text, raw);
});

test('classification output must parse to an Array', () => {
  const { exported } = load();
  const out = exported._srPrepareDocText_('VECTOR_CLASSIFY', '{"theme":"UI"}', '');
  assert.equal(out.ok, false);
  assert.equal(out.error, 'CLASSIFICATION_JSON_NOT_ARRAY');
});

test('unparseable primary output fails with a contract-specific code', () => {
  const { exported } = load();
  assert.match(exported._srPrepareDocText_('SESSION_LOG', '{oops', '').error,
    /^CURATOR_JSON_PARSE_FAILED/);
  assert.match(exported._srPrepareDocText_('VECTOR_CLASSIFY', '{oops', '').error,
    /^CLASSIFICATION_JSON_PARSE_FAILED/);
});

test('empty model output is rejected before either contract runs', () => {
  const { exported } = load();
  assert.equal(exported._srPrepareDocText_('SESSION_LOG', '   ', '').ok, false);
});

test('every curator payload type routes to the curator contract', () => {
  const { exported } = load();
  // A type falling through to the classification contract would demand an
  // Array and reject a perfectly good Curator object, so this pins the list.
  exported.SR_CURATOR_TYPES.forEach((type) => {
    const out = exported._srPrepareDocText_(type, '{"summary":"s"}', '{"verdict":"PASS"}');
    assert.equal(out.ok, true, type + ' did not use the curator contract: ' + out.error);
    assert.ok(JSON.parse(out.text).auditor_sign_off, type + ' dropped the audit');
  });
});

// ── Fence stripping ──────────────────────────────────────────────────────────

test('fence stripping handles the shapes a real response arrives in', () => {
  const { exported } = load();
  const s = exported._srStripJsonFence_;
  assert.equal(s('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(s('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(s('{"a":1}'), '{"a":1}', 'unfenced text passes through untouched');
  assert.equal(s('  {"a":1}  '), '{"a":1}');
  assert.equal(s(null), '');
  // A fence-like sequence INSIDE the JSON must not truncate it.
  assert.equal(s('```json\n{"code":"x"}\n```'), '{"code":"x"}');
});

// ── The full harvest, against the sandbox ────────────────────────────────────

// Everything here is built SANDBOX-SIDE on purpose. The harness passes any
// value returned through `exported` via crossRealmSafe(), which flattens a
// live FakeSpreadsheet into a plain object — so calling the exported
// _getSystemAsset()/_getOrCreateSheet() and then using the result gives you
// something with no getSheetByName(). Tabs are created with insertSheet plus
// explicit headers, matching what _getOrCreateSheet writes, the same way
// every other kos-personal test sets up its index spreadsheet.
const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type',
  'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const RETURN_HEADERS = ['Returned_At', 'Payload_UID', 'Payload_Type',
  'Primary_JSON', 'Auditor_JSON', 'Harvest_Status', 'Attempts', 'Error'];

function indexSpreadsheet(exported, sandbox) {
  const props = sandbox.PropertiesService.getScriptProperties();
  const existing = props.getProperty('INDEX_ID');
  if (existing) return sandbox.SpreadsheetApp.openById(existing);
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  return ss;
}

function tab(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.appendRow(headers);
  return sheet;
}

// The source document is created here too, so its real mock id is what lands
// in the staging row's File_ID: a hand-written id would make the doc write
// throw and quietly turn every success case into a failure case.
function seed(exported, sandbox, opts) {
  const o = opts || {};
  const ss = indexSpreadsheet(exported, sandbox);
  const staging = tab(ss, exported.CFG.STAGING_SHEET, STAGING_HEADERS);
  const returns = tab(ss, exported.SR_SHEET, RETURN_HEADERS);
  const uid = o.uid || 'UID-1';

  const doc = sandbox.DocumentApp.create('source doc for ' + uid);
  doc.getBody().setText(o.docText || 'ORIGINAL SOURCE TEXT');
  const fileId = doc.getId();

  if (o.skipStaging !== true) {
    staging.appendRow([new sandbox.Date(), uid, o.type || 'SESSION_LOG',
      'https://docs.google.com/document/d/' + fileId, fileId,
      o.status || 'STUDIO_ACTIVE', 0]);
  }
  if (o.skipReturn !== true) {
    returns.appendRow([new sandbox.Date(), uid, o.type || 'SESSION_LOG',
      o.primary === undefined ? '{"summary":"s"}' : o.primary,
      o.auditor === undefined ? '' : o.auditor, '', 0, '']);
  }
  return { ss: ss, staging: staging, returns: returns, uid: uid, fileId: fileId, doc: doc };
}

// Reads the staging row's Status straight off the sheet, rather than through
// the exported _srFindStagingRow_ — same crossRealm reason as above, and it
// keeps the assertion about the sheet's real contents.
function stagingStatus(ctx) {
  const rows = ctx.staging.getDataRange().getValues();
  const row = rows.slice(1).find((r) => String(r[1]).trim() === ctx.uid);
  return row ? String(row[5]).trim() : null;
}

test('harvest: applies a return, marks FLOW_COMPLETE, and replaces the doc body', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { auditor: '{"verdict":"PASS"}' });

  const result = exported.harvestStudioReturns();
  assert.equal(result.applied, 1, JSON.stringify(result));

  assert.equal(stagingStatus(ctx), 'FLOW_COMPLETE');

  const body = sandbox.DocumentApp.openById(ctx.fileId).getBody().getText();
  assert.ok(body.indexOf('auditor_sign_off') !== -1, 'the merged JSON was written: ' + body);
  assert.equal(body.indexOf('ORIGINAL SOURCE TEXT'), -1, 'the source text was replaced');
});

test('harvest: marks the return row HARVESTED, so a second pass skips it', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox);
  exported.harvestStudioReturns();
  const second = exported.harvestStudioReturns();
  assert.equal(second.applied, 0);
  assert.equal(second.skipped, 1);
});

test('harvest: a duplicate return is consumed WITHOUT re-writing the doc', () => {
  const { exported, sandbox } = load();
  // Genuinely reachable: the staleness guard can reset a row whose return is
  // still queued, the Turnstile re-releases it, and a second Flow run returns
  // later. Re-writing would clobber a good result with an older one.
  const ctx = seed(exported, sandbox);
  exported.harvestStudioReturns();
  const bodyAfterFirst = sandbox.DocumentApp.openById(ctx.fileId).getBody().getText();

  ctx.returns.appendRow([new Date(), ctx.uid, 'SESSION_LOG',
    '{"summary":"a stale second result"}', '', '', 0, '']);
  const result = exported.harvestStudioReturns();
  assert.equal(result.applied, 1, 'the duplicate is consumed, not left to retry forever');
  assert.equal(sandbox.DocumentApp.openById(ctx.fileId).getBody().getText(), bodyAfterFirst,
    'the doc body must not change on a duplicate return');
});

test('harvest: NOTHING is touched when the output is malformed', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { primary: '{not json' });

  exported.harvestStudioReturns();

  // KOS's spec: leave the staging row alone so the staleness guard retries.
  assert.equal(stagingStatus(ctx), 'STUDIO_ACTIVE');
  assert.equal(sandbox.DocumentApp.openById(ctx.fileId).getBody().getText(), 'ORIGINAL SOURCE TEXT');
});

test('harvest: gives up on the RETURN row after SR_MAX_ATTEMPTS, staging still untouched', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { primary: '{not json' });
  for (let i = 0; i < exported.SR_MAX_ATTEMPTS; i++) exported.harvestStudioReturns();

  const report = exported.checkStudioReturns();
  assert.equal(report.failed, 1, JSON.stringify(report));
  // The separation that keeps this file from fighting the Turnstile: giving
  // up on a return row never means giving up on the payload.
  assert.equal(stagingStatus(ctx), 'STUDIO_ACTIVE');
});

test('harvest: a return with no matching staging row fails without writing anything', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, { skipStaging: true });
  const result = exported.harvestStudioReturns();
  assert.equal(result.applied, 0);
  assert.equal(result.failed, 1);
});

test('harvest: a row missing its Payload_UID fails immediately, not after 3 tries', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox, { skipReturn: true });
  ctx.returns.appendRow([new Date(), '', 'SESSION_LOG', '{"a":1}', '', '', 0, '']);
  exported.harvestStudioReturns();
  assert.equal(exported.checkStudioReturns().failed, 1);
});

test('harvest: empty return tab is a no-op', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox, { skipStaging: true, skipReturn: true });
  assert.deepEqual(exported.harvestStudioReturns(),
    { applied: 0, skipped: 0, failed: 0, attention: 0, pruned: 0 });
});

// ── The breadcrumb ───────────────────────────────────────────────────────────

test('breadcrumb: a pre-set breadcrumb makes the harvest skip the doc write', () => {
  const { exported, sandbox } = load();
  // Simulates a crash between the doc write and the staging mark. The doc
  // already holds the answer; re-writing is unnecessary and re-inferring
  // would be actively wrong, since the source text is gone.
  const ctx = seed(exported, sandbox, { docText: 'ALREADY THE MODEL OUTPUT' });
  exported._srMarkDocWritten_(ctx.uid);

  const result = exported.harvestStudioReturns();
  assert.equal(result.applied, 1);
  assert.equal(sandbox.DocumentApp.openById(ctx.fileId).getBody().getText(),
    'ALREADY THE MODEL OUTPUT', 'the doc write was skipped, as the breadcrumb asked');
  assert.equal(stagingStatus(ctx), 'FLOW_COMPLETE', 'and the staging mark still completed');
});

test('breadcrumb: cleared once the staging mark succeeds', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox);
  exported.harvestStudioReturns();
  assert.equal(exported._srIsDocWritten_(ctx.uid), false,
    'a breadcrumb left behind would make a future re-run of this UID skip a needed doc write');
});

// ── Liveness ─────────────────────────────────────────────────────────────────

test('liveness: reports plainly that no Flow has ever written back', () => {
  const { exported, sandbox } = load();
  // The whole point of this report. A Studio Flow that matched zero rows
  // reports a green "Run Completed", so the Flow UI cannot answer this.
  seed(exported, sandbox, { skipReturn: true });
  const report = exported.checkStudioFlowLiveness();
  assert.equal(report.flowEverReturned, false);
  assert.equal(report.released, 1);
  assert.equal(report.awaitingReturn.length, 1);
});

test('liveness: a return row is the evidence that flips it', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox);
  const report = exported.checkStudioFlowLiveness();
  assert.equal(report.flowEverReturned, true);
  assert.equal(report.awaitingReturn.length, 0, 'this UID has a return, so it is not awaiting one');
});

test('liveness: counts FLOW_COMPLETE rows separately from released ones', () => {
  const { exported, sandbox } = load();
  seed(exported, sandbox);
  exported.harvestStudioReturns();
  const report = exported.checkStudioFlowLiveness();
  assert.equal(report.completed, 1);
  assert.equal(report.released, 0, 'a completed row is no longer awaiting inference');
});

test('checkStudioReturns: read-only — it never writes', () => {
  const { exported, sandbox } = load();
  const ctx = seed(exported, sandbox);
  const before = ctx.returns.getDataRange().getValues();
  exported.checkStudioReturns();
  assert.deepEqual(ctx.returns.getDataRange().getValues(), before);
  assert.equal(stagingStatus(ctx), 'STUDIO_ACTIVE');
});
