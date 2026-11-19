'use strict';
// The reflection fixture (39, 2026-11-19, D19's third safeguard, the
// operator's go). Pins: installFlow2ReflectionFixture(pairs) writes pairs of
// FlowInput rows identical but for the reflection (one claims the success
// metric the response leaves out), in one write, at most 5 pairs, once;
// checkFlow2ReflectionFixture() compares each pair once Studio has answered
// and says whether the claim was credited; removeFlow2Fixture() clears them.
// Made-up text only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'].files.map((f) => path.join(ROOT, f));

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['installFlow2ReflectionFixture', 'checkFlow2ReflectionFixture', 'removeFlow2Fixture',
    'installFlow2Fixture', 'FI'], { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  return Object.assign(env, { ss, logs, x: env.exported });
}

const rows = (env) => env.ss.getSheetByName('FlowInput').getDataRange().getValues().slice(1)
  .filter((r) => String(r[env.x.FI.CONFIG_ID]).trim());

const out = (o, stamp) => 'Your pitch names its audience.\n[SYSTEM: ' + stamp + ']\n[SUGGESTED_SCORE: 2]\n' +
  '[MILESTONE_OUTCOMES: ' + JSON.stringify(o) + ']';

test('pairs identical but for the reflection; one write; at most 5; not twice', () => {
  const env = load();
  const res = env.x.installFlow2ReflectionFixture(2);
  assert.equal(res.seeded, 4);
  const r = rows(env);
  const FI = env.x.FI;
  assert.deepEqual(r.map((x) => x[FI.CONFIG_ID]), ['VDOE-FIXTURE-R1W', 'VDOE-FIXTURE-R1N', 'VDOE-FIXTURE-R2W', 'VDOE-FIXTURE-R2N']);
  assert.deepEqual(r.map((x) => x[FI.STAGING_ROW_REF]), ['FIXTURE-101', 'FIXTURE-102', 'FIXTURE-103', 'FIXTURE-104']);
  assert.ok(r.every((x) => x[FI.READY_STATUS] === 'READY'));
  const strip = (p) => String(p).replace(/"run":"[^"]*"/, '').replace(/<<<PROCESS_REFLECTION>>>[\s\S]*<<<END_PROCESS_REFLECTION>>>/, '');
  assert.equal(strip(r[0][FI.PROMPT_TEXT]), strip(r[1][FI.PROMPT_TEXT]), 'the same prompt but for the reflection (and the run key)');
  assert.match(r[0][FI.PROMPT_TEXT], /<<<PROCESS_REFLECTION>>>\nQuestion \(about FIXTURE-COMP-3\): How does your work show a measurable goal[\s\S]*fifteen percent/);
  assert.match(r[1][FI.PROMPT_TEXT], /<<<PROCESS_REFLECTION>>>\n\(none\)\n/);
  // The response leaves the metric out; the reflection claims it.
  const docText = (row) => env.sandbox.DocumentApp.openById(row[FI.STUDENT_FILE_ID]).getBody().getText();
  const noId = (t) => t.replace(/\[CONFIG_ID: [^\]]*\]/, '');
  assert.equal(noId(docText(r[0])), noId(docText(r[1])), 'the same doc but for its ConfigID footer');
  assert.doesNotMatch(docText(r[0]), /fifteen percent/);
  assert.equal(env.x.installFlow2ReflectionFixture(2).skipped, 1, 'seeded once');
  const many = load();
  assert.equal(many.x.installFlow2ReflectionFixture(9).pairs, 5);
});

test('the check: waiting, then each pair compared, and whether the claim was credited', () => {
  const env = load();
  env.x.installFlow2ReflectionFixture(3);
  const sheet = env.ss.getSheetByName('FlowInput');
  const FI = env.x.FI;
  assert.equal(env.x.checkFlow2ReflectionFixture().done, false);
  assert.ok(env.logs.some((l) => /Pair 1: waiting for Studio \(neither row answered\)/.test(l)));
  const base = { 1: 'MET', 2: 'MET', 3: 'NOT_MET', 4: 'MET' };
  const answers = [
    out(base, 'REVISION_REQUIRED'), out(base, 'REVISION_REQUIRED'),                          // pair 1: same
    out(Object.assign({}, base, { 3: 'MET' }), 'APPROVED'), out(base, 'REVISION_REQUIRED'),  // pair 2: the claim credited
    out(base, 'REVISION_REQUIRED'), out(base, 'REVISION_REQUIRED'),                          // pair 3: same
  ];
  answers.forEach((a, i) => sheet.getRange(i + 2, FI.GEMINI_FULL_OUTPUT + 1).setValue(a));
  env.logs.length = 0;
  const res = JSON.parse(JSON.stringify(env.x.checkFlow2ReflectionFixture()));
  assert.equal(res.done, true);
  assert.equal(res.answered, 3);
  assert.equal(res.differ, 1);
  assert.equal(res.creditedWith, 1);
  assert.equal(res.creditedWithout, 0);
  assert.ok(env.logs.some((l) => /Pair 2: DIFFERENT\. With the reflection: 1 MET, 2 MET, 3 MET, 4 MET \(APPROVED\)/.test(l)), env.logs.join('\n'));
  assert.ok(env.logs.some((l) => /The reflection is standing in for missing work/.test(l)));
  // No difference: says so.
  sheet.getRange(4, FI.GEMINI_FULL_OUTPUT + 1).setValue(out(base, 'REVISION_REQUIRED'));
  env.logs.length = 0;
  env.x.checkFlow2ReflectionFixture();
  assert.ok(env.logs.some((l) => /0 graded differently[\s\S]*The reflection didn't change a grade/.test(l)), env.logs.join('\n'));
  // removeFlow2Fixture clears them.
  env.x.removeFlow2Fixture();
  assert.equal(rows(env).length, 0);
});
