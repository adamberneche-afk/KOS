'use strict';
// What runs Flow 2 (39b, 2026-11-16). Pins:
//   StudioConfig: installStudioConfig() seeds the 11-13 to 11-15 history
//   once; recordStudioChange() needs a flow and a step and only appends;
//   confirmStudioConfig() resets the staleness warning; showSetupStatus's
//   line asks for a record, a model for Flow 2's Ask Gemini, or a check
//   after STUDIO_CONFIG_STALE_DAYS; studioModelAt_ picks the model in effect.
//   The drift probe: installing it adds one daily trigger and seeds a PROBE
//   row READY with a run line; the harvest leaves an answered probe alone;
//   the next run records it (stamp, outcomes, shape, length band, run
//   check, model, versions), clears it and seeds the next; a model or shape
//   change with the same code and prompt is PLATFORM, and the overnight
//   line says so; an unanswered probe is NO_ANSWER and said; the fixture
//   tools leave the probe alone; removeFlow2DriftProbe() clears it all.
//   Made-up fixtures only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '63_DocHeader.js', '03_QueueBridge.js', '04_Form2_TurnInGate.js',
  '15b_StudioFlowPrompts_Flow2_Revised.js', '15c_Flow2DirectEvaluationService.js', '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js',
  '43_DeployVersionMarker_CentralLedger.js', '68_LessonParts.js', '40_FlowPrompts.js', '54_StudentAssignments.js',
  '55b_LessonAssignmentData.js', '25_WarmUpWriter.js', '41_WarmUpFlowBridge.js', '35_FlowPreflightAndCanary.js',
  '39_FlowFixtures.js', '39b_Flow2Provenance.js', '64_LedgerCycle.js'].map(S);

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 16, 15, 0, 0);

function pinClock(sandbox, ms) {
  const clock = { ms };
  const RealDate = sandbox.Date;
  sandbox.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(clock.ms); }
    static now() { return clock.ms; }
    static [Symbol.hasInstance](x) { return x instanceof RealDate || (x && typeof x.getTime === 'function'); }
  };
  return clock;
}

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['installStudioConfig', 'recordStudioChange', 'confirmStudioConfig',
    'studioConfigLine_', 'studioConfigRows_', 'studioModelAt_', 'installFlow2DriftProbe', 'runFlow2DriftProbe',
    'removeFlow2DriftProbe', 'flow2DriftLine_', 'harvestFlowInputResults', 'removeFlow2Fixture',
    'flow2FixtureRows_', '_drShape_', 'FI', 'FI_HEADERS', 'STUDIO_CONFIG_HISTORY'],
  { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const clock = pinClock(sb, NOW);
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  sb.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const fi = ss.insertSheet('FlowInput');
  fi.appendRow(env.exported.FI_HEADERS);
  return { sb, x: env.exported, ss, fi, clock, logs };
}

test('StudioConfig: the history once, changes appended, the model in effect, the staleness line', () => {
  const t = load();
  assert.match(t.x.studioConfigLine_(t.ss), /no record of Flow 2/);
  assert.equal(t.x.installStudioConfig().seeded, t.x.STUDIO_CONFIG_HISTORY.length);
  assert.equal(t.x.installStudioConfig().seeded, 0, 'seeded once');
  assert.match(t.x.studioConfigLine_(t.ss), /names no model/);
  assert.throws(() => t.x.recordStudioChange({ model: 'x' }), /flow, step/);
  t.x.recordStudioChange({ flow: 'Flow 2', step: 'Ask Gemini', model: 'model-a', from: '2026-11-13T13:00:00-05:00' });
  t.x.recordStudioChange({ flow: 'Flow 2', step: 'Ask Gemini', model: 'model-b', from: '2026-11-16T09:00:00-05:00' });
  const rows = t.x.studioConfigRows_(t.ss);
  assert.equal(t.x.studioModelAt_(rows, Date.parse('2026-11-14T12:00:00Z')), 'model-a');
  assert.equal(t.x.studioModelAt_(rows, NOW), 'model-b');
  assert.equal(t.x.studioModelAt_(rows, Date.parse('2026-11-01T12:00:00Z')), '');
  assert.equal(t.x.studioConfigLine_(t.ss), '', 'fresh, with a model');
  t.clock.ms += 15 * DAY;
  assert.match(t.x.studioConfigLine_(t.ss, new t.sb.Date()), /15 days old/);
  t.x.confirmStudioConfig();
  assert.equal(t.x.studioConfigLine_(t.ss, new t.sb.Date()), '');
});

function answerProbe(t, model, extra) {
  const v = t.fi.getDataRange().getValues();
  const i = v.findIndex((r) => String(r[t.x.FI.STAGING_ROW_REF]) === 'PROBE');
  const sent = /"run":"([^"]*)","prompt":"([^"]*)"/.exec(v[i][t.x.FI.PROMPT_TEXT]);
  const out = '1. OVERALL ASSESSMENT\nGood.\n2. MILESTONE BREAKDOWN\nMILESTONE 1 -- MET\nYes.\n' +
    (extra || '') + '[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]\n' +
    '[RUN_INFO: ' + JSON.stringify({ run: sent[1], prompt: sent[2], model }) + ']\n' +
    '[MILESTONE_OUTCOMES: {"1":"MET","2":"MET","3":"MET","4":"MET"}]';
  t.fi.getRange(i + 1, t.x.FI.GEMINI_FULL_OUTPUT + 1).setValue(out);
  t.fi.getRange(i + 1, t.x.FI.READY_STATUS + 1).setValue('EVALUATED');
}
const drift = (t) => t.ss.getSheetByName('Flow2Drift').getDataRange().getValues();
const probes = (t) => t.fi.getDataRange().getValues().filter((r) => String(r[t.x.FI.STAGING_ROW_REF]) === 'PROBE');

test('the probe: seeded READY daily, left alone by the harvest, recorded, compared, reseeded', () => {
  const t = load();
  t.x.installFlow2DriftProbe();
  t.x.installFlow2DriftProbe();
  const trig = t.sb.ScriptApp.getProjectTriggers().filter((g) => g.getHandlerFunction() === 'runFlow2DriftProbe');
  assert.equal(trig.length, 1, 'one daily trigger');
  assert.equal(probes(t).length, 1, 'one probe at a time');
  assert.equal(probes(t)[0][t.x.FI.READY_STATUS], 'READY');
  assert.equal(t.x.flow2FixtureRows_(t.ss), 0, 'the probe is not a leftover fixture');

  answerProbe(t, 'model-a');
  t.x.harvestFlowInputResults();
  assert.equal(probes(t)[0][t.x.FI.READY_STATUS], 'EVALUATED', 'the harvest leaves it for the probe');

  t.clock.ms += DAY;
  t.x.runFlow2DriftProbe();
  let d = drift(t);
  assert.equal(d.length, 2);
  const [, , status, stamp, outcomes, shape, length, runCheck, model] = d[1];
  assert.equal(status, 'ANSWERED');
  assert.equal(stamp, 'APPROVED');
  assert.equal(outcomes, 'MET,MET,MET,MET');
  assert.match(shape, /^1\.OA 2\.MB \| -- \| S,SC,R,O$/);
  assert.equal(length % 250, 0);
  assert.equal(runCheck, 'OK');
  assert.equal(model, 'model-a');
  assert.equal(probes(t).length, 1, 'the next probe');
  assert.equal(t.x.flow2DriftLine_(t.ss, new t.sb.Date()), '');

  // Same code and prompt, another model and shape: a platform change.
  answerProbe(t, 'model-b', '3a. YOUR PROCESS\nKeep going.\n');
  t.clock.ms += DAY;
  t.x.runFlow2DriftProbe();
  d = drift(t);
  assert.match(String(d[2][11]), /model, shape \(PLATFORM\)/);
  assert.match(t.x.flow2DriftLine_(t.ss, new t.sb.Date()), /changed with no change of ours \(model, shape/);
  t.clock.ms += 4 * DAY;
  assert.equal(t.x.flow2DriftLine_(t.ss, new t.sb.Date()), '', 'the warning ages out');

  // Unanswered: said at once.
  t.x.runFlow2DriftProbe();
  assert.equal(drift(t)[3][2], 'NO_ANSWER');
  assert.match(t.x.flow2DriftLine_(t.ss, new t.sb.Date()), /no answer on its last run/);
  assert.ok(t.logs.every((l) => !/fixture-probe@|FIXTURE RESPONSE/.test(l)), 'no addresses or text in the log');
});

test('the fixture tools leave the probe; removeFlow2DriftProbe clears it and its trigger', () => {
  const t = load();
  t.x.installFlow2DriftProbe();
  t.x.removeFlow2Fixture();
  assert.equal(probes(t).length, 1);
  assert.equal(t.x.removeFlow2DriftProbe().cleared, 1);
  assert.equal(probes(t).length, 0);
  assert.equal(t.sb.ScriptApp.getProjectTriggers().filter((g) => g.getHandlerFunction() === 'runFlow2DriftProbe').length, 0);
});

test('shape: numbering and milestone label styles are told apart', () => {
  const t = load();
  assert.match(t.x._drShape_('OVERALL ASSESSMENT\nMILESTONE 1 -- [MET]\n'), /^OA \| --\[\] \| $/);
  assert.match(t.x._drShape_('1. OVERALL ASSESSMENT\nMILESTONE 1 -- MET. Good\n'), /^1\.OA \| --\. \| $/);
});
