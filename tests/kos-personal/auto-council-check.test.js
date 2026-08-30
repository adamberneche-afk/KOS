'use strict';
// Regression tests for autoCouncilCheck() (6_Governance.gs) — the 2-hourly
// time-driven trigger that fires a council review once
// CFG.COUNCIL_AUTO_TRIGGER_SESSIONS new sessions have accumulated.
//
// WHY THIS FILE EXISTS (CHANGELOG.md Round 14): this trigger used to call
// triggerCouncilSimulation(), which generated a doc telling ONE model to
// role-play ARCHITECT/AUDITOR/MUSE together in a single pass — exactly the
// cross-contamination BRIDGE_FIDELITY_001 declares VOID. That function's own
// comment claimed it was "superseded, kept only for reference" while this
// live, default-enabled trigger was its sole caller. The council surface had
// zero test coverage, which is how that contradiction survived.
//
// The re-fire test below guards the subtler half of the fix. autoCouncilCheck
// anchors its session count on SEVEN_BRIDGES_LAST_RUN specifically because
// that is the property triggerSevenBridgesReview() advances on success.
// Anchoring on a property the callee never writes (as the old
// COUNCIL_LAST_RUN pairing would) leaves the counter permanently above
// threshold — minting a fresh council ID and stimulus doc every 2 hours,
// forever.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'kos-personal', '1_Config_And_Deploy.gs');
const UTILS_PATH  = path.join(__dirname, '..', '..', 'kos-personal', '5_Error_And_Utilities.gs');
const GOV_PATH    = path.join(__dirname, '..', '..', 'kos-personal', '6_Governance.gs');

function load() {
  return loadGasFiles(
    [CONFIG_PATH, UTILS_PATH, GOV_PATH],
    ['autoCouncilCheck', 'triggerSevenBridgesReview', 'CFG']
  );
}

// Seeds the full set of pointers/properties both the trigger and its callee
// need: the ledger spreadsheet + SESSION_LOG rows for the session count, and
// the three Drive pointers triggerSevenBridgesReview() resolves.
function setUp(sandbox, sessionCount) {
  const props = sandbox.PropertiesService.getScriptProperties();

  const ss = sandbox.SpreadsheetApp.create('BRAIN_TRUST_INDEX');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());

  // Passes _coldEngineGate — autoCouncilCheck is TIER_1, its callee TIER_2.
  props.setProperty('IDENTITY_KEY', 'fake-identity-key');
  props.setProperty('CORE_THESIS_VERIFIED', 'true');

  // SESSION_LOG: col B is the Timestamp autoCouncilCheck counts.
  const sessionLog = ss.insertSheet('SESSION_LOG');
  sessionLog.appendRow(['Session_UID', 'Timestamp', 'Session_Type']);
  for (let i = 0; i < sessionCount; i++) {
    sessionLog.appendRow(['S' + i, new Date(), 'WORKING']);
  }

  // The two source docs and the destination folder the stimulus needs.
  const stateDoc = sandbox.DocumentApp.create('CURRENT_STATE');
  stateDoc.getBody().setText('Recent session summary text.');
  const pivotDoc = sandbox.DocumentApp.create('PIVOTS_AND_LESSONS');
  pivotDoc.getBody().setText('Active constraints and pivots.');

  const exhaust = sandbox.DriveApp.getRootFolder().createFolder('03.4_RAW_EXHAUST');
  sandbox.DriveApp._registerFolder(exhaust);

  props.setProperty('ID_CURRENT_STATE', stateDoc.getId());
  props.setProperty('ID_PIVOTS_AND_LESSONS', pivotDoc.getId());
  props.setProperty('ID_00_RAW_EXHAUST', exhaust.getId());

  return { ss, props, stateDoc };
}

// Stimulus docs are the ones named 'CE: SEVEN_BRIDGES_STIMULUS_…'; the two
// source docs created in setUp share the same registry.
function stimulusDocs(sandbox) {
  return [...sandbox.DocumentApp._docs.values()]
    .filter((d) => d.title && d.title.indexOf('SEVEN_BRIDGES_STIMULUS') !== -1);
}

test('autoCouncilCheck: below the session threshold, generates nothing', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, exported.CFG.COUNCIL_AUTO_TRIGGER_SESSIONS - 1);

  exported.autoCouncilCheck();

  assert.equal(stimulusDocs(sandbox).length, 0);
});

test('autoCouncilCheck: at the threshold, generates a sequestered Seven Bridges stimulus', () => {
  const { exported, sandbox } = load();
  setUp(sandbox, exported.CFG.COUNCIL_AUTO_TRIGGER_SESSIONS);

  exported.autoCouncilCheck();

  const docs = stimulusDocs(sandbox);
  assert.equal(docs.length, 1, 'exactly one stimulus generated');

  const text = docs[0].getBody().getText();
  // The governing law must travel with the document — it is the only thing
  // standing between the operator and a contaminated review.
  assert.match(text, /BRIDGE_FIDELITY_001/);
  assert.match(text, /verdict produced with knowledge of another cog's verdict is VOID/);
  assert.match(text, /separate Gemini Gem conversation per cog/);
  // A fresh SB_-prefixed council ID ties the fan-out back together.
  assert.match(text, /Council ID: SB_\d+/);

  // And the shared-context instruction the deleted generator used must not
  // appear anywhere in what the automatic path now produces.
  assert.doesNotMatch(text, /Act as ARCHITECT, AUDITOR, and MUSE/);
});

test('autoCouncilCheck: a fired review advances the anchor, so ongoing CURRENT_STATE edits do not re-fire it', () => {
  const { exported, sandbox } = load();
  const { props, stateDoc } = setUp(sandbox, exported.CFG.COUNCIL_AUTO_TRIGGER_SESSIONS);

  exported.autoCouncilCheck();
  assert.equal(stimulusDocs(sandbox).length, 1);
  assert.ok(props.getProperty('SEVEN_BRIDGES_LAST_RUN'), 'callee advanced the shared anchor');

  // CURRENT_STATE keeps getting edited — that is simply what happens as
  // sessions land, and it is what makes this the real regression case. The
  // callee's own stasis guard is NOT what protects us here: it passes freely
  // once the state doc moves. The only thing standing between this and a new
  // council every 2 hours forever is the session counter having been reset,
  // which only happens because the anchor is a property the callee writes.
  //
  // Anchor the count on anything the callee never writes (the old
  // COUNCIL_LAST_RUN pairing) and this tick mints a second council ID.
  sandbox.DriveApp.getFileById(stateDoc.getId()).lastUpdated =
    new Date(Date.now() + 60 * 1000);

  exported.autoCouncilCheck();
  assert.equal(stimulusDocs(sandbox).length, 1, 'no second stimulus, no second council ID');
});

test('autoCouncilCheck: past the threshold but with CURRENT_STATE unchanged, the callee declines and it is logged', () => {
  const { exported, sandbox } = load();
  const { props, stateDoc } = setUp(sandbox, exported.CFG.COUNCIL_AUTO_TRIGGER_SESSIONS);

  // Thread the needle so this actually reaches the callee: the anchor must
  // sit BEFORE the session timestamps (so all 5 still count as new and the
  // threshold is met) but AFTER CURRENT_STATE's last edit (so the callee's
  // stasis guard declines). Anchor it after the sessions and the trigger
  // returns early on the count instead, never exercising the no-op path.
  const anchorMs = Date.now() - 30 * 60 * 1000;
  props.setProperty('SEVEN_BRIDGES_LAST_RUN', String(anchorMs));
  sandbox.DriveApp.getFileById(stateDoc.getId()).lastUpdated =
    new Date(anchorMs - 30 * 60 * 1000);

  // Capture the trigger's own logging — on an unattended 2-hourly trigger
  // the log line IS the observable outcome, and a declined run that logs
  // nothing is the failure mode the `!result.success` bug used to cause.
  const logs = [];
  const realLog = sandbox.console.log;
  sandbox.console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    exported.autoCouncilCheck();
  } finally {
    sandbox.console.log = realLog;
  }

  assert.equal(stimulusDocs(sandbox).length, 0, 'no-op path generates nothing');
  assert.ok(
    logs.some((l) => /firing Seven Bridges review/.test(l)),
    'the threshold was actually met — the callee was reached, not skipped'
  );
  assert.ok(
    logs.some((l) => /declined/.test(l)),
    'a declined run is logged, not silently swallowed as success'
  );
});

test('the shared-context generator is gone — not merely uncalled', () => {
  const { exported, sandbox } = load();

  // Deleting only the call sites would have left this reachable: every
  // top-level GAS function is callable via google.script.run regardless of
  // what invokes it internally (see 7_WebApp.gs's own note on shared
  // execution scope). Neutralizing it meant deleting the body.
  assert.equal(typeof sandbox.triggerCouncilSimulation, 'undefined');
  assert.equal(typeof exported.triggerCouncilSimulation, 'undefined');
});
