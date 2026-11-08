'use strict';
// Plan item L2 (2026-11-08): the intake holds back a deferred decision that
// repeats one already in DECISION_REGISTER (any status) and writes it to
// DECISION_ECHOES instead, never dropping it silently
// (kos-personal/22_BriefingDocs.gs, _decisionEcho_).
//
// Pins: an exact repeat, one differing by a trailing period, and one
// reworded above BD_ECHO_MIN_SIMILARITY are held; a different decision
// below it is recorded, and so is one that differs only by a number;
// Blocking that cites an existing Decision_ID is held (and "#1" never
// matches "#12"); held rows carry the would-be and matched IDs and are
// counted in KOS_OPEN_DECISIONS and the daily primer; a reprocessed chunk
// holds nothing back twice; nothing is held when the register is empty.
// Every decision text here is made up.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  '1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '2_Ingestion_Sensors.gs', '4_Vector_Router.gs',
  '6_Governance.gs', '12_StudioReturnHarvest.gs', '13_StudioInputBuilder.gs', '19_StagingRequeue.gs',
  '20_VectorClassifySessions.gs', '21_VectorMatrixRepair.gs', '22_BriefingDocs.gs', '23_MoralDebt.gs',
  '25_VectorDocs.gs', '27_FidelitySample.gs', '3_Queue_Processor.gs',
].map((f) => path.join(KP, f));
const EXPOSE = [
  'processIntakePayload', '_recordDeferredDecisions_', '_decisionEcho_', '_decisionNorm_',
  '_decisionWordSet_', '_decisionDice_', 'decisionEchoLine_', 'generateBriefingDocs_', 'generateDailyPrimer',
  'resolveDecision', 'CFG', 'BD_ECHO_MIN_SIMILARITY',
];

const STAGING_HEADERS = ['Timestamp', 'Payload_UID', 'Payload_Type', 'Doc_URL', 'File_ID', 'Status', 'Retry_Count'];
const NOW = new Date('2026-11-04T06:00:00');

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
  return { exported, sandbox, props, ss };
}

function rowsOf(env, name, headers) {
  const sheet = env.ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}
const register = (env) => rowsOf(env, 'DECISION_REGISTER', env.exported.CFG.DECISION_REGISTER_HEADERS);
const echoes = (env) => rowsOf(env, 'DECISION_ECHOES', env.exported.CFG.DECISION_ECHOES_HEADERS);

function intake(env, uid, decisions) {
  const payload = JSON.stringify({
    session_metadata: { session_id: 'x', session_type: 'WORKING' },
    session_summary: 'Synthetic session.',
    dynamic_state: { deferred_decisions: decisions },
  });
  const res = env.exported.processIntakePayload(payload, uid);
  assert.equal(res.status, 'SUCCESS', res.message);
}

// The 11-02 session's three decisions (synthetic wording).
const FIRST = [
  { decision: 'Decide whether the pacing guide sets the order of the weekly lesson docs', owner: 'Operator', blocking: 'Lesson docs' },
  { decision: 'Choose which calendar the rollout reads its days off from', owner: 'Operator', blocking: 'Rollout' },
  { decision: 'Confirm the family label stays on archived threads.', owner: 'Operator', blocking: 'Family signal' },
];

test('nothing is held back when the register is empty, and DECISION_ECHOES is not created', () => {
  const env = setup();
  intake(env, 'LOG-0b020000_CH01', FIRST);
  assert.equal(register(env).length, 3);
  assert.equal(env.ss.getSheetByName('DECISION_ECHOES'), null);
  assert.equal(env.exported.decisionEchoLine_(), '');
});

test('a re-ingested log: an exact repeat, a trailing-period repeat and a reworded one are held back', () => {
  const env = setup();
  intake(env, 'LOG-0b020000_CH01', FIRST);
  env.exported.resolveDecision('LOG-0b020000_CH01#2', 'settled'); // any status counts
  intake(env, 'LOG-0b040000_CH01', [
    // exact, after case and spacing
    { decision: 'decide whether the  pacing guide sets the order of the weekly lesson docs', owner: 'Operator', blocking: 'x' },
    // reworded: one word in ten changed, the rest reordered
    { decision: 'Choose which calendar the rollout takes its days off from', owner: 'Operator', blocking: 'x' },
    // the original had a trailing period
    { decision: 'Confirm the family label stays on archived threads', owner: 'Operator', blocking: 'x' },
    // new
    { decision: 'Pick a sender name for the CAS mail', owner: 'Operator', blocking: 'Gmail noise' },
  ]);

  assert.deepEqual(register(env).map((r) => r.Decision_ID),
    ['LOG-0b020000_CH01#1', 'LOG-0b020000_CH01#2', 'LOG-0b020000_CH01#3', 'LOG-0b040000_CH01#4']);
  const held = echoes(env);
  assert.deepEqual(held.map((h) => [h.Would_Be_ID, h.Matched_ID, h.Reason]), [
    ['LOG-0b040000_CH01#1', 'LOG-0b020000_CH01#1', 'text: exact'],
    ['LOG-0b040000_CH01#2', 'LOG-0b020000_CH01#2', 'text: close'],
    ['LOG-0b040000_CH01#3', 'LOG-0b020000_CH01#3', 'text: exact'],
  ]);
  assert.equal(held[0].Similarity, 1);
  assert.ok(held[1].Similarity >= env.exported.BD_ECHO_MIN_SIMILARITY && held[1].Similarity < 1);
  assert.equal(held[0].Session_UID, 'LOG-0b040000_CH01');
  assert.equal(held[1].Decision, 'Choose which calendar the rollout takes its days off from', 'the text stays in Google');
  assert.ok(held[0].Held_At);
});

test('Blocking that cites an existing Decision_ID is held back, whatever the text', () => {
  const env = setup();
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b020000_CH01', 't', [
    { decision: 'Say what the Registrar must never touch', owner: 'Operator', blocking: 'Registrar scope' },
  ]);
  const added = env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b050000_CH01', 't', [
    { decision: 'Endorse the Registrar never-touch list (#19)', owner: 'Operator', blocking: 'LOG-0b020000_CH01#1' },
    { decision: 'Endorse the turn-in pilot lessons', owner: 'Operator', blocking: 'log-0b020000_ch01#12 is not a decision here' },
  ]);
  assert.equal(added, 1, 'the one citing only a near-miss ID is recorded');
  assert.deepEqual(echoes(env).map((h) => [h.Would_Be_ID, h.Matched_ID, h.Reason]),
    [['LOG-0b050000_CH01#1', 'LOG-0b020000_CH01#1', 'blocking']]);
});

test('a primer number alone in Blocking ("#19") holds nothing back: it maps to no Decision_ID', () => {
  const env = setup();
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b020000_CH01', 't', [
    { decision: 'Say what the Registrar must never touch', owner: 'Operator', blocking: 'Registrar scope' },
  ]);
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b050000_CH01', 't', [
    { decision: 'Endorse the turn-in pilot lessons', owner: 'Operator', blocking: '#19' },
  ]);
  assert.equal(register(env).length, 2);
  assert.deepEqual(echoes(env), []);
});

test('different decisions are recorded: below the threshold, or differing only by a number', () => {
  const env = setup();
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b020000_CH01', 't', [
    { decision: 'Choose which calendar the rollout reads its days off from', owner: 'Operator', blocking: 'x' },
    { decision: 'Approve the Flow 6 rollout to period 3 next week', owner: 'Operator', blocking: 'x' },
  ]);
  env.exported._recordDeferredDecisions_(env.ss, 'LOG-0b050000_CH01', 't', [
    // shares most words, but two in ten changed: 0.80, below 0.85
    { decision: 'Choose which spreadsheet the rollout reads its lessons off from', owner: 'Operator', blocking: 'x' },
    // one word in ten, but it is a number
    { decision: 'Approve the Flow 6 rollout to period 4 next week', owner: 'Operator', blocking: 'x' },
    // short texts never "contain" one another
    { decision: 'Choose', owner: 'Operator', blocking: 'x' },
  ]);
  assert.equal(register(env).length, 5);
  assert.deepEqual(echoes(env), []);
});

test('the rule itself: normalization, the containment rule and both sides of the threshold', () => {
  const { exported: x } = setup();
  assert.equal(x._decisionNorm_('  Endorse the Registrar never-touch list (#19).  '), 'endorse the registrar never touch list 19');
  const cand = (id, text) => {
    const norm = x._decisionNorm_(text);
    return { id, norm, words: x._decisionWordSet_(norm) };
  };
  const c = [cand('A#1', 'Endorse the Registrar never-touch list')];
  const contained = x._decisionEcho_({ decision: 'Endorse the Registrar never-touch list (#19)', blocking: '#19' }, c);
  assert.equal(contained.reason, 'text: contains');
  assert.equal(contained.matchedId, 'A#1');

  const ten = 'one two three four five six seven eight nine ten';
  const at90 = x._decisionEcho_({ decision: 'one two three four five six seven eight nine eleven' }, [cand('B#1', ten)]);
  assert.equal(at90.reason, 'text: close');
  assert.equal(at90.similarity, 0.9);
  assert.equal(x._decisionEcho_({ decision: 'one two three four five six seven eight twelve eleven' }, [cand('B#1', ten)]), null,
    '0.80 is below the threshold');
  assert.equal(x._decisionEcho_({ decision: '' }, [cand('B#1', ten)]), null);
});

test('held-back decisions are counted in KOS_OPEN_DECISIONS and the daily primer, and a reprocessed chunk adds none', () => {
  const env = setup();
  intake(env, 'LOG-0b020000_CH01', FIRST);
  const repeat = FIRST.map((d) => ({ ...d, decision: d.decision.toUpperCase() }));
  intake(env, 'LOG-0b040000_CH01', repeat);
  intake(env, 'LOG-0b040000_CH01', repeat); // the same chunk again
  assert.equal(echoes(env).length, 3);
  assert.equal(register(env).length, 3);

  const line = '3 new decisions held back as repeats of open or settled ones; see DECISION_ECHOES.';
  assert.equal(env.exported.decisionEchoLine_(), line);

  env.exported.generateBriefingDocs_(env.sandbox.DriveApp.getRootFolder(), NOW);
  const docId = env.props.getProperty(env.exported.CFG.PROP.OPEN_DECISIONS_DOC_ID);
  const text = env.sandbox.DocumentApp.openById(docId).getBody().getText();
  assert.match(text, /Open decisions: 3\n3 new decisions held back as repeats of open or settled ones; see DECISION_ECHOES\./);

  const res = env.exported.generateDailyPrimer();
  assert.equal(res.success, true, res.message);
  const primer = env.sandbox.DocumentApp.openById(env.props.getProperty(env.exported.CFG.PROP.LATEST_PRIMER_DOC_ID))
    .getBody().getText();
  assert.ok(primer.split('\n').includes(line), 'one line in the primer');
});
