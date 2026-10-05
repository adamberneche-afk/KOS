'use strict';
// Tests for Phase 1 of the RTP notebook plan: kos-personal/22_BriefingDocs.gs,
// the primer's Data Quality block (_primerDataQuality_), and
// generateDailyPrimer()'s fail-before-writing order (6_Governance.gs).
//
// Pins: deferred decisions land in DECISION_REGISTER as OPEN, once per
// decision however often a chunk is reprocessed, and the CURRENT_STATE
// backfill gives them the same IDs; a resolved decision leaves
// KOS_OPEN_DECISIONS; each briefing doc keeps its file ID across runs; a
// doc whose read fails keeps its old content and stamp while the others
// are written; Core facts use the exact heading ALIGNMENT Threshold D
// looks for; the Data Quality block flags duplicates, an unrebuilt matrix
// and unclassified sessions; and a failed Vector State read leaves
// KOS_LATEST_PRIMER untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  '1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '2_Ingestion_Sensors.gs', '4_Vector_Router.gs',
  '6_Governance.gs', '12_StudioReturnHarvest.gs', '13_StudioInputBuilder.gs', '19_StagingRequeue.gs',
  '20_VectorClassifySessions.gs', '21_VectorMatrixRepair.gs', '22_BriefingDocs.gs', '3_Queue_Processor.gs',
].map((f) => path.join(KP, f));
const EXPOSE = [
  'processIntakePayload', '_recordDeferredDecisions_', 'resolveDecision',
  'previewDecisionRegisterBackfill', 'applyDecisionRegisterBackfill',
  'generateBriefingDocs_', 'generateDailyPrimer', '_primerDataQuality_', 'getVectorState', 'CFG',
];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const NOW = new Date('2026-10-04T06:00:00');

function setup() {
  const { exported, sandbox } = loadGasFiles(FILES, EXPOSE);
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const stateDoc = sandbox.DocumentApp.create('CURRENT_STATE');
  const pivotDoc = sandbox.DocumentApp.create('PIVOTS_AND_LESSONS');
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('ID_CURRENT_STATE', stateDoc.getId());
  props.setProperty('ID_PIVOTS_AND_LESSONS', pivotDoc.getId());
  props.setProperty('ID_03_1_CURRENT_STATE', sandbox.DriveApp.getRootFolder().getId());
  props.setProperty('IDENTITY_KEY', 'k');
  props.setProperty(exported.CFG.PROP.THESIS_VERIFIED, 'true');
  ss.insertSheet(exported.CFG.STAGING_SHEET).appendRow(STAGING_HEADERS);
  return { exported, sandbox, props, ss, stateDoc };
}

function register(env) {
  const sheet = env.ss.getSheetByName('DECISION_REGISTER');
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const H = env.exported.CFG.DECISION_REGISTER_HEADERS;
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, H.length).getValues()
    .map((r) => Object.fromEntries(H.map((h, i) => [h, r[i]])));
}

function docText(env, propKey) {
  const id = env.props.getProperty(env.exported.CFG.PROP[propKey]);
  return id ? env.sandbox.DocumentApp.openById(id).getBody().getText() : null;
}

function sessionLog(env, uid, ts, summary) {
  let sheet = env.ss.getSheetByName('SESSION_LOG');
  if (!sheet) {
    sheet = env.ss.insertSheet('SESSION_LOG');
    sheet.appendRow(['Session_UID', 'Timestamp', 'Session_Type', 'Cold_Start', 'RTP_Version', 'Session_Summary']);
  }
  sheet.appendRow([uid, ts, 'WORKING', 'false', '5.8', summary]);
}

const DECISIONS = [
  { decision: 'Pick a notebook host', owner: 'Operator', blocking: 'Phase 2' },
  { decision: 'Choose Gem or skill', owner: 'Architect', blocking: 'Router V6.0' },
];

// ── DECISION_REGISTER ─────────────────────────────────────────────────

test('the intake records each deferred decision as OPEN, once, however often the chunk is reprocessed', () => {
  const env = setup();
  const payload = JSON.stringify({
    session_metadata: { session_id: 'x', session_type: 'WORKING' },
    session_summary: 'Planned the notebook.',
    dynamic_state: { deferred_decisions: DECISIONS },
  });
  assert.equal(env.exported.processIntakePayload(payload, 'LOG-1a2b3c4d_CH01').status, 'SUCCESS');
  assert.equal(env.exported.processIntakePayload(payload, 'LOG-1a2b3c4d_CH01').status, 'SUCCESS');

  const rows = register(env);
  assert.deepEqual(rows.map((r) => r.Decision_ID), ['LOG-1a2b3c4d_CH01#1', 'LOG-1a2b3c4d_CH01#2']);
  assert.deepEqual(rows.map((r) => r.Status), ['OPEN', 'OPEN']);
  assert.equal(rows[1].Owner, 'Architect');
  assert.equal(rows[1].Blocking, 'Router V6.0');
});

test('the CURRENT_STATE backfill reads the intake\'s own format, under the same IDs, and a dry run writes nothing', () => {
  const env = setup();
  // What processIntakePayload has been appending to CURRENT_STATE.
  const body = env.stateDoc.getBody();
  body.appendParagraph('\n[State Sync: 2026-09-12 10:00:00 | LOG-aaaaaaaa_CH01]');
  body.appendParagraph('NEXT STEPS:');
  body.appendListItem('Write the PRD');
  body.appendParagraph('DEFERRED (LOG-aaaaaaaa_CH01):');
  body.appendListItem('[Operator] Pick a notebook host — Blocking: Phase 2');
  body.appendListItem('[unassigned] Decide on skills — Blocking: unknown');
  body.appendParagraph('\n[State Sync: 2026-09-13 09:00:00 | LOG-bbbbbbbb_CH02]');
  body.appendParagraph('DEFERRED (LOG-bbbbbbbb_CH02):');
  body.appendListItem('free text with no owner');

  const dry = env.exported.previewDecisionRegisterBackfill();
  assert.equal(dry.added, 3);
  assert.deepEqual(register(env), [], 'a dry run must not write');

  // One of them already came in through the intake.
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-aaaaaaaa_CH01', 't', [DECISIONS[0]]);
  const res = env.exported.applyDecisionRegisterBackfill();
  assert.equal(res.added, 2);
  assert.equal(res.already, 1);

  const rows = register(env);
  assert.deepEqual(rows.map((r) => r.Decision_ID),
    ['LOG-aaaaaaaa_CH01#1', 'LOG-aaaaaaaa_CH01#2', 'LOG-bbbbbbbb_CH02#1']);
  assert.equal(rows[1].Decision, 'Decide on skills');
  assert.equal(rows[1].Recorded_At, '2026-09-12 10:00:00');
  assert.equal(rows[2].Decision, 'free text with no owner');

  assert.equal(env.exported.applyDecisionRegisterBackfill().added, 0, 'a second apply adds nothing');
});

test('a resolved decision leaves KOS_OPEN_DECISIONS', () => {
  const env = setup();
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-1a2b3c4d_CH01', '2026-09-20 08:00:00', DECISIONS);
  const folder = env.sandbox.DriveApp.getRootFolder();

  env.exported.generateBriefingDocs_(folder, NOW);
  assert.match(docText(env, 'OPEN_DECISIONS_DOC_ID'), /Open decisions: 2/);

  assert.equal(env.exported.resolveDecision('LOG-1a2b3c4d_CH01#1', 'School account').success, true);
  assert.equal(env.exported.resolveDecision('nope').success, false);
  assert.equal(env.exported.resolveDecision('LOG-1a2b3c4d_CH01#2', '', 'MAYBE').success, false);
  env.exported.generateBriefingDocs_(folder, NOW);

  const text = docText(env, 'OPEN_DECISIONS_DOC_ID');
  assert.match(text, /Open decisions: 1/);
  assert.doesNotMatch(text, /Pick a notebook host/);
  assert.match(text, /\[Architect\] Choose Gem or skill — Blocking: Router V6\.0 \(LOG-1a2b3c4d_CH01#2/);
  assert.equal(register(env)[0].Status, 'RESOLVED');
  assert.equal(register(env)[0].Resolution_Note, 'School account');
});

// ── Briefing docs ─────────────────────────────────────────────────────

test('each briefing doc opens on its title and stamp, and keeps its file ID across runs', () => {
  const env = setup();
  const folder = env.sandbox.DriveApp.getRootFolder();
  const first = env.exported.generateBriefingDocs_(folder, NOW);
  assert.deepEqual(first.failed, []);
  assert.deepEqual(first.written, ['KOS_RECENT_SESSIONS', 'KOS_OPEN_DECISIONS', 'KOS_CORE_FACTS']);
  const ids = ['RECENT_SESSIONS_DOC_ID', 'OPEN_DECISIONS_DOC_ID', 'CORE_FACTS_DOC_ID']
    .map((k) => env.props.getProperty(env.exported.CFG.PROP[k]));

  env.exported.generateBriefingDocs_(folder, new Date('2026-10-05T06:00:00'));
  const again = ['RECENT_SESSIONS_DOC_ID', 'OPEN_DECISIONS_DOC_ID', 'CORE_FACTS_DOC_ID']
    .map((k) => env.props.getProperty(env.exported.CFG.PROP[k]));
  assert.deepEqual(again, ids, 'a notebook source holds each doc by ID; the ID must never change');

  const body = env.sandbox.DocumentApp.openById(ids[2]).getBody();
  assert.equal(body.getChild(0).getText(), 'CORE FACTS — 2026-10-05');
  assert.match(body.getChild(1).getText(), /^Generated at: 2026-10-05 06:00 \(America\/New_York\) by generateBriefingDocs\./);
  assert.equal(body.getText().match(/Generated at:/g).length, 1, 'the old stamp is gone');
  assert.equal(body.getChild(2).getText(), 'Notebook source: KOS_CORE_FACTS.');
  assert.equal(body.getText().match(/Notebook source:/g).length, 1, 'a rewrite leaves one source line');
});

test('KOS_RECENT_SESSIONS: newest sessions first, chunks grouped, older sessions only when a decision is open', () => {
  const env = setup();
  for (let d = 1; d <= 7; d++) {
    sessionLog(env, 'LOG-0000000' + d + '_CH01', new Date('2026-09-0' + d + 'T10:00:00'), 'Session ' + d + ' part one.');
  }
  sessionLog(env, 'LOG-00000007_CH02', new Date('2026-09-07T11:00:00'), 'Session 7 part two.');
  env.ss.getSheetByName('SESSION_LOG').appendRow(['LOG-00000008', new Date(), 'SENSOR_INTAKE', '', '', '2 chunk(s) created']);
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-00000001_CH01', 't', [DECISIONS[0]]);

  env.exported.generateBriefingDocs_(env.sandbox.DriveApp.getRootFolder(), NOW);
  const text = docText(env, 'RECENT_SESSIONS_DOC_ID');

  const order = ['LOG-00000007', 'LOG-00000006', 'LOG-00000005', 'LOG-00000004', 'LOG-00000003']
    .map((u) => text.indexOf(u + ' ('));
  assert.ok(order.every((p, i) => p > -1 && (i === 0 || p > order[i - 1])), 'the five newest, newest first');
  assert.match(text, /Session 7 part one\. Session 7 part two\./);
  assert.match(text, /Chunks processed: 2\./);
  assert.doesNotMatch(text, /LOG-00000002 \(/, 'an older session with nothing open is left out');
  assert.match(text, /Older sessions with open decisions\nLOG-00000001 \(2026-09-01\)/);
  assert.match(text, /LOG-00000001_CH01#1: Pick a notebook host/);
  assert.doesNotMatch(text, /LOG-00000008/, 'the intake\'s own SENSOR_INTAKE row is not a session');
});

test('KOS_CORE_FACTS uses the heading Threshold D looks for, and says so when nothing is pinned', () => {
  const env = setup();
  const folder = env.sandbox.DriveApp.getRootFolder();
  env.exported.generateBriefingDocs_(folder, NOW);
  let text = docText(env, 'CORE_FACTS_DOC_ID');
  assert.match(text, /CORE FACTS \(Operator-Pinned — Do Not Contradict\)\nNone pinned yet\./);

  const inc = env.ss.insertSheet('INCUBATOR');
  inc.appendRow(['Theme', 'First_Detected', 'Last_Touched', 'Session_Count', 'Cumulative_Score', 'Raw_Score_Log', 'Status', 'Core_Fact']);
  inc.appendRow(['FAMILY', '', '', 1, 1, '[]', 'PROMOTED_MANUAL', 'Evenings are family time']);
  inc.appendRow(['NOISE', '', '', 1, 1, '[]', 'INCUBATING', '']);
  env.props.setProperty(env.exported.CFG.PROP.RELATIONAL_TARGETS, 'Partner, Students');
  env.exported.generateBriefingDocs_(folder, NOW);
  text = docText(env, 'CORE_FACTS_DOC_ID');
  assert.match(text, /1\. \[FAMILY\] Evenings are family time/);
  assert.doesNotMatch(text, /NOISE/);
  assert.match(text, /RELATIONAL TARGETS \(Protect These Relationships\)\n1\. Partner\n2\. Students/);
});

test('a doc whose read fails keeps its old content and stamp; the others are still written', () => {
  const env = setup();
  const folder = env.sandbox.DriveApp.getRootFolder();
  env.exported.generateBriefingDocs_(folder, NOW);
  const before = docText(env, 'CORE_FACTS_DOC_ID');

  // The INCUBATOR read fails: KOS_CORE_FACTS must not say "None pinned".
  const realGet = env.ss.getSheetByName.bind(env.ss);
  env.ss.getSheetByName = (n) => { if (n === 'INCUBATOR') throw new Error('Service Spreadsheets failed'); return realGet(n); };
  const res = env.exported.generateBriefingDocs_(folder, new Date('2026-10-05T06:00:00'));

  assert.deepEqual(res.written, ['KOS_RECENT_SESSIONS', 'KOS_OPEN_DECISIONS']);
  assert.equal(res.failed[0].doc, 'KOS_CORE_FACTS');
  assert.equal(docText(env, 'CORE_FACTS_DOC_ID'), before, 'the failed doc is left exactly as it was');
  assert.match(docText(env, 'OPEN_DECISIONS_DOC_ID'), /Generated at: 2026-10-05/);
  assert.ok(register(env).length === 0);
  const errors = env.ss.getSheetByName('ERROR_LOG');
  assert.ok(errors && errors.getLastRow() > 1, 'the failure is in ERROR_LOG');
});

// ── Primer: Data Quality and fail-before-write ───────────────────────

function stage(env, uid, status) {
  env.ss.getSheetByName('STAGING_PIPELINE').appendRow([new Date('2026-09-10'), uid,
    uid.includes('_VC') ? 'VECTOR_CLASSIFY' : 'SESSION_LOG', 'u', 'f-' + uid, status, 0]);
}

function matrix(env, uids) {
  const m = env.ss.insertSheet('VECTOR_MATRIX');
  m.appendRow(['Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'INCUBATOR_SIGNALS', 'CHECKSUM']);
  uids.forEach((u) => m.appendRow([u, new Date('2026-09-10'), 0.5, 0.2, 0, '']));
}

test('Data Quality flags duplicates, an unrebuilt matrix and unclassified sessions', () => {
  const env = setup();
  matrix(env, ['LOG-00000001', 'LOG-1789000000001-aaaaaaaa']);
  stage(env, 'LOG-1789000000001-aaaaaaaa_CH01', 'PROCESSED');
  stage(env, 'LOG-1789000000002-aaaaaaaa_CH01', 'PROCESSED');   // same log pasted twice
  sessionLog(env, 'LOG-00000001_CH01', new Date('2026-09-10'), 's');
  sessionLog(env, 'LOG-00000002_CH01', new Date('2026-09-11'), 's');  // processed, never classified
  sessionLog(env, 'LOG-1789000000002-aaaaaaaa_CH01', new Date('2026-09-11'), 'dup copy');

  const q = env.exported._primerDataQuality_(env.exported.getVectorState());
  const text = q.lines.map((l) => l.text).join('\n');
  assert.equal(q.flagged, true);
  assert.match(text, /^Status: FLAGGED/);
  assert.match(text, /FLAG: 1 duplicate session group\(s\) are counted more than once/);
  assert.match(text, /FLAG: VECTOR_MATRIX has not been rebuilt/);
  assert.match(text, /FLAG: 1 processed session\(s\) have no Vector State row yet/,
    'the duplicate copy is reported as a duplicate, not as unclassified');
  assert.match(text, /VECTOR_MATRIX sessions: 2/);
  assert.match(text, /Last classify backfill batch: never/);
});

test('Data Quality reads OK once the repairs have run and every session is classified', () => {
  const env = setup();
  matrix(env, ['LOG-00000001']);
  sessionLog(env, 'LOG-00000001_CH01', new Date('2026-09-10'), 's');
  env.props.setProperty(env.exported.CFG.PROP.VM_LAST_REDERIVE_AT, '2026-10-04T05:00:00.000Z');
  env.props.setProperty(env.exported.CFG.PROP.VC_LAST_BACKFILL_AT, '2026-10-03T12:00:00.000Z');

  const q = env.exported._primerDataQuality_(env.exported.getVectorState());
  const text = q.lines.map((l) => l.text).join('\n');
  assert.equal(q.flagged, false);
  assert.match(text, /^Status: OK/);
  assert.match(text, /Matrix last rebuilt from classify parts: 2026-10-04/);
  assert.match(text, /Last classify backfill batch: 2026-10-03/);
});

test('Data Quality flags a matrix rebuild that is part-way through, and rows it could not rebuild', () => {
  const env = setup();
  matrix(env, ['LOG-00000001']);
  sessionLog(env, 'LOG-00000001_CH01', new Date('2026-09-10'), 's');
  env.props.setProperty(env.exported.CFG.PROP.VM_REDERIVE_DONE, JSON.stringify(['LOG-00000001']));
  env.props.setProperty(env.exported.CFG.PROP.VM_REDERIVE_KEPT, '7');
  const text = env.exported._primerDataQuality_(env.exported.getVectorState()).lines.map((l) => l.text).join('\n');
  assert.match(text, /FLAG: the VECTOR_MATRIX rebuild is part-way through \(1 session\(s\) rebuilt so far\)/);
  assert.match(text, /FLAG: 7 VECTOR_MATRIX row\(s\) could not be rebuilt/);
});

test('generateDailyPrimer: a failed Vector State read leaves KOS_LATEST_PRIMER and its stamp untouched', () => {
  const env = setup();
  const first = env.exported.generateDailyPrimer();
  assert.equal(first.success, true, first.message);
  const id = env.props.getProperty(env.exported.CFG.PROP.LATEST_PRIMER_DOC_ID);
  const before = env.sandbox.DocumentApp.openById(id).getBody().getText();
  assert.match(before, /^DAILY PRIMER — \d{4}-\d{2}-\d{2}\nGenerated at: /);
  assert.match(before, /Data Quality\nStatus: OK/);
  assert.ok(env.props.getProperty(env.exported.CFG.PROP.CORE_FACTS_DOC_ID), 'the briefing docs are written too');

  const realGet = env.ss.getSheetByName.bind(env.ss);
  env.ss.getSheetByName = (n) => { if (n === 'VECTOR_MATRIX') throw new Error('Service Spreadsheets failed'); return realGet(n); };
  const res = env.exported.generateDailyPrimer();

  assert.equal(res.success, false);
  assert.equal(env.sandbox.DocumentApp.openById(id).getBody().getText(), before);
});
