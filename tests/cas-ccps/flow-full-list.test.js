'use strict';
// A Studio flow that answers several rows at once (2026-11-19, the operator:
// Studio binds a chip as a "Full list" by default, so one Ask Gemini answer
// covers several rows' prompts and comes back under a key like "WUQ-a,
// WUQ-b"). Pins: 00's flowKeyList_ tells a list of keys from one key; the
// warm-up harvest (41) sets such a return aside as NEEDS_ATTENTION with a
// FULL_LIST note, applying nothing, and its jobs are sent again one by one;
// the turn-in harvest (72) sets it aside the same way and the answers wait;
// the overnight check (34c) names it with the fix; the build spec has a
// "one row per run" row for Flows 2, 3, 4 and 6. Synthetic text only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'];
const FILES = PROJECT.files.map((f) => path.join(ROOT, f));
const plain = (o) => JSON.parse(JSON.stringify(o));

function load() {
  const env = loadGasFiles(FILES, ['flowKeyList_', 'flowFullListNote_', 'harvestWarmUpFlowReturns',
    'runTurnInCheckFlow', 'overnightHealth_', 'syncFlowBuildSpec', 'WQ_BASE_WIDTH', 'wfbFindQueueRow_',
    'TIC_RETURN_HEADERS']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('M2_ENABLED', 'true');
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  return Object.assign(env, { ss, props });
}

const rows = (ss, tab) => {
  const s = ss.getSheetByName(tab);
  return s && s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues() : [];
};

test('flowKeyList_: one key is not a list; two or more keys in any Studio list shape are', () => {
  const { exported } = load();
  const k = (v) => plain(exported.flowKeyList_(v));
  assert.deepEqual(k('WUQ-20261119-abc123def456'), []);
  assert.deepEqual(k('TIC-0123456789ab'), []);
  assert.deepEqual(k('  WUQ-1  '), [], 'surrounding space is not a second key');
  assert.deepEqual(k(''), []);
  assert.deepEqual(k(null), []);
  assert.deepEqual(k('WUQ-1, WUQ-2'), ['WUQ-1', 'WUQ-2']);
  assert.deepEqual(k('WUQ-1,WUQ-2,WUQ-3'), ['WUQ-1', 'WUQ-2', 'WUQ-3']);
  assert.deepEqual(k('WUQ-1\nWUQ-2'), ['WUQ-1', 'WUQ-2']);
  assert.deepEqual(k('["TIC-1","TIC-2"]'), ['TIC-1', 'TIC-2']);
  assert.deepEqual(k('[TIC-1]'), [], 'one key in brackets is one key');
  assert.match(exported.flowFullListNote_(['a', 'b'], 'warm-up job'),
    /^FULL_LIST: one answer for 2 warm-up jobs \(the flow bound a Full list\)\. In Studio, put Ask Gemini and its write step inside a Repeat for each/);
});

test('the warm-up harvest sets a Full-list return aside, applies nothing, and sends each job again', () => {
  const env = load();
  const { exported, ss } = env;
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('header'));
  ['Q1', 'Q2'].forEach((id) => {
    const r = new Array(exported.WQ_BASE_WIDTH).fill('');
    r[0] = id; r[3] = 'Sam Student'; r[5] = '2026-11-19';
    r[6] = JSON.stringify({ course_name: 'Sports Entertainment and Event Management', warmup_anchor: 'How does a team make money?' });
    r[8] = 'GENERATING';
    wq.appendRow(r);
  });
  const ret = ss.insertSheet('WarmUpFlowReturn');
  ret.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  ret.appendRow([new Date(), 3, 'Q1, Q2', 'WARM-UP: How does a team make money from a single game?', '', 0, '']);
  const before = rows(ss, 'WarmUpQueue').map((r) => r[8]);

  const res = plain(exported.harvestWarmUpFlowReturns());
  assert.equal(res.applied, 0);
  assert.equal(res.fullList, 1);
  const [row] = rows(ss, 'WarmUpFlowReturn');
  assert.equal(row[4], 'NEEDS_ATTENTION');
  assert.match(row[6], /^FULL_LIST: one answer for 2 warm-up jobs/);
  assert.deepEqual(rows(ss, 'WarmUpQueue').map((r) => r[8]), before, 'neither job applied or failed');
  assert.equal(ss.getSheetByName('WarmUpTextBox'), null, 'no warm-up written for either student');

  // A second harvest leaves it alone: set aside once, never retried as a key.
  assert.equal(plain(exported.harvestWarmUpFlowReturns()).fullList || 0, 0);
});

test('the turn-in harvest sets a Full-list return aside; the overnight check names it with the fix', () => {
  const env = load();
  const { exported, ss, props } = env;
  props.setProperty('TURN_IN_CODE_COURSES', '8177');
  const ret = ss.insertSheet('TurnInCheckReturn');
  ret.appendRow(exported.TIC_RETURN_HEADERS.slice());
  ret.appendRow([new Date(), 'TIC-000000000001, TIC-000000000002', 'VERDICT: ADDRESSES\nREASON: Good.', '', '', '']);
  const h = plain(exported.runTurnInCheckFlow()).harvest;
  assert.equal(h.applied, 0);
  assert.equal(h.fullList, 1);
  const [row] = rows(ss, 'TurnInCheckReturn');
  assert.equal(row[3], 'SET_ASIDE');
  assert.match(row[4], /^FULL_LIST: one answer for 2 turn-in answers/);
  assert.equal(ss.getSheetByName('TurnInCodes'), null, 'no code issued');

  // And a warm-up one, for the overnight line's per-flow counts.
  const wr = ss.insertSheet('WarmUpFlowReturn');
  wr.appendRow(['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  wr.appendRow([new Date(), 4, 'Q1, Q2', 'x', 'NEEDS_ATTENTION', 3, exported.flowFullListNote_(['Q1', 'Q2'], 'warm-up job')]);
  wr.appendRow([new Date(Date.now() - 3 * 24 * 3600 * 1000), 3, 'Q3, Q4', 'x', 'NEEDS_ATTENTION', 3, 'FULL_LIST: old']);
  const problems = plain(exported.overnightHealth_(new Date())).problems;
  const line = problems.filter((p) => /^Studio flows that answered several rows at once/.test(p));
  assert.deepEqual(line, ['Studio flows that answered several rows at once (a Full list, not a Repeat for each), ' +
    'last 24 hours: Flow 4 1, Flow 6 1. Those answers were set aside. In Studio, put Ask Gemini and its write step ' +
    'inside a Repeat for each (the FlowBuildSpec tab\'s "one row per run" rows).'], problems.join('\n'));
  assert.doesNotMatch(line[0], /TIC-|Q1/, 'counts only');
});

test('the build spec has a "one row per run" row for Flows 2, 3, 4 and 6, naming the loop\'s steps', () => {
  const { exported, ss } = load();
  exported.syncFlowBuildSpec();
  const spec = rows(ss, 'FlowBuildSpec').filter((r) => r[1] === 'gemini' && r[4] === 'one row per run');
  assert.deepEqual(spec.map((r) => r[0]), ['Flow 2', 'Flow 3', 'Flow 4', 'Flow 6']);
  spec.forEach((r) => assert.match(r[6], /Repeat for each/));
  spec.forEach((r) => assert.match(r[6], /never "Full list"/));
  assert.match(spec[0][6], /Extract \(it reads each row's own doc\)/);
  assert.match(spec[1][6], /WarmUpFlowReturn \(QueueID\)/);
  assert.match(spec[3][6], /TurnInCheckReturn \(CheckID\)/);
});
