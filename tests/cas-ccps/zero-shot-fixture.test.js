'use strict';
// The zero-shot test (39c/39d, 2026-11-20): each lesson's cold answer (what a
// chatbot writes from the student-facing prompt alone) goes through Flow 2
// as a fixture row against the whole lesson's goals; checkZeroShotFixture()
// records the answers in ZeroShotResults. Pins: the answers are the
// builder's output, one per lesson, made-up text; batches pick up where the
// last left off; rows carry fixture competency IDs, never the lesson's.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const builder = require('../../tools/cas-ccps/build-zero-shot-answers');

const ROOT = path.join(__dirname, '..', '..');
const FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'].files.map((f) => path.join(ROOT, f));

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['installZeroShotFixture', 'checkZeroShotFixture', 'removeFlow2Fixture',
    'zeroShotKeys_', 'zeroShotByLesson_', 'ZERO_SHOT_ANSWERS', 'LESSON_ASSIGNMENTS', 'FI'],
  { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  return Object.assign(env, { ss, logs, x: env.exported });
}

const fiRows = (env) => env.ss.getSheetByName('FlowInput').getDataRange().getValues().slice(1)
  .filter((r) => String(r[env.x.FI.CONFIG_ID]).trim());
const out = (o, stamp) => 'Clear and organized.\n[SYSTEM: ' + stamp + ']\n[SUGGESTED_SCORE: 3]\n' +
  '[MILESTONE_OUTCOMES: ' + JSON.stringify(o) + ']';

test('39c is the builder\'s output: one cold answer per lesson, made-up text', () => {
  assert.equal(fs.readFileSync(builder.OUT, 'utf8'), builder.build(), 'run node tools/cas-ccps/build-zero-shot-answers.js');
  const env = load();
  const answers = env.x.ZERO_SHOT_ANSWERS;
  assert.deepEqual(Object.keys(answers).sort(), Object.keys(env.x.LESSON_ASSIGNMENTS).sort(), 'every lesson, nothing else');
  for (const [k, t] of Object.entries(answers)) {
    assert.ok(t.split(/\s+/).length >= 80, k + ': an answer, not a stub');
    assert.doesNotMatch(t, /\[(your|student|school|name|insert)[^\]]*\]/i, k + ': no bracketed placeholders');
    assert.doesNotMatch(t, /@[a-z0-9-]+\.[a-z]/i, k + ': no email addresses');
  }
});

test('a batch: the next lessons in order, fixture competency IDs, the lesson\'s goals; then the next batch', () => {
  const env = load();
  const keys = env.x.zeroShotKeys_();
  const FI = env.x.FI;
  const res = env.x.installZeroShotFixture(3);
  assert.equal(res.seeded, 3);
  assert.deepEqual([...res.keys], keys.slice(0, 3));
  const r = fiRows(env);
  assert.deepEqual(r.map((x) => x[FI.CONFIG_ID]), ['VDOE-FIXTURE-Z1', 'VDOE-FIXTURE-Z2', 'VDOE-FIXTURE-Z3']);
  assert.deepEqual(r.map((x) => x[FI.STAGING_ROW_REF]), ['FIXTURE-301', 'FIXTURE-302', 'FIXTURE-303']);
  assert.ok(r.every((x) => x[FI.READY_STATUS] === 'READY'));
  assert.ok(r.every((x) => x[FI.MILESTONE_1_COMPETENCY_ID] === 'FIXTURE-COMP-Z1'), 'never the lesson\'s own IDs');
  const a = env.x.LESSON_ASSIGNMENTS[keys[0]];
  assert.equal(r[0][FI.UNIT_NAME], a.unitName);
  assert.ok(String(r[0][FI.PROMPT_TEXT]).includes(a.milestones[0]), 'graded on the whole lesson\'s goals');
  const doc = env.sandbox.DocumentApp.openById(r[0][FI.STUDENT_FILE_ID]).getBody().getText();
  assert.ok(doc.includes(env.x.ZERO_SHOT_ANSWERS[keys[0]].slice(0, 60)), 'the cold answer is the response');
  const next = env.x.installZeroShotFixture(2);
  assert.deepEqual([...next.keys], keys.slice(3, 5), 'waiting rows are skipped');
  assert.equal(load().x.installZeroShotFixture(99).seeded, 25, 'at most 25 a batch');
});

test('the check records each answered lesson once, counts the waiting, and later batches skip recorded lessons', () => {
  const env = load();
  const keys = env.x.zeroShotKeys_();
  const FI = env.x.FI;
  env.x.installZeroShotFixture(3);
  const sheet = env.ss.getSheetByName('FlowInput');
  const at = (n) => 2 + n; // header, then the rows in order
  sheet.getRange(at(0), FI.GEMINI_FULL_OUTPUT + 1).setValue(out({ 1: 'MET', 2: 'MET', 3: 'MET', 4: 'MET' }, 'APPROVED'));
  sheet.getRange(at(1), FI.GEMINI_FULL_OUTPUT + 1).setValue(out({ 1: 'NOT_MET', 2: 'MET', 3: 'MET', 4: 'MET' }, 'REVISION_REQUIRED'));
  const res = env.x.checkZeroShotFixture();
  assert.equal(res.recorded, 2);
  assert.equal(res.waiting, 1);
  assert.equal(res.tally.approved, 1);
  assert.equal(res.tally.firstMet, 1);
  assert.deepEqual([...res.tally.approvedKeys], [keys[0]]);
  env.x.checkZeroShotFixture();
  const by = env.x.zeroShotByLesson_(env.ss);
  assert.deepEqual(Object.keys(by).sort(), [keys[0], keys[1]].sort(), 'replaced, not added twice');
  assert.equal(by[keys[0]].stamp, 'APPROVED');
  assert.equal(by[keys[1]].firstMet, false);
  env.x.removeFlow2Fixture();
  const again = env.x.installZeroShotFixture(2);
  assert.deepEqual([...again.keys], [keys[2], keys[3]], 'recorded lessons are not sent again');
  assert.ok(env.logs.some((l) => /APPROVED in 1, its first goal MET in 1/.test(l)));
});
