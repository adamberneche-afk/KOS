'use strict';
// The warm-up context A/B test (41b): one student per period and course with
// two weeks of Student Context; arm A is Flow 3's prompt as built today, arm B
// adds the context; the harvest never delivers either; the results tab pairs
// them blind with the automatic checks.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js',
  '80_WarmUpPoints.js', '24_WarmUpBridge.js', '25_WarmUpWriter.js', '40_FlowPrompts.js', '41_WarmUpFlowBridge.js', '41b_WarmUpContextFixture.js',
  '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js', '68_LessonParts.js', '03_QueueBridge.js'].map((f) => path.join(CC, f));
const EXPOSE = ['previewWarmUpContextFixture', 'installWarmUpContextFixture', 'checkWarmUpContextFixture',
  'removeWarmUpContextFixture', 'harvestWarmUpFlowReturns', 'wcfScore_', 'LEDGER', 'WQ', 'WQ_BASE_WIDTH', 'WFB_FLOW3_HEADERS',
  'WFB_RETURN_HEADERS', 'WCF_HEADERS', 'WCF', 'WCF_PREFIX', 'TABS'];
const DAY = 24 * 60 * 60 * 1000;

function setUp() {
  const env = loadGasFiles(FILES, EXPOSE);
  const { exported: x, sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', 'teacher@example.com');
  const L = x.LEDGER;
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const reg = ss.insertSheet('StudentDocRegistry');
  reg.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url', 'created_at', 'last_updated_at', 'last_run_had_content']);
  const wq = ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(x.WQ_BASE_WIDTH).fill('h'));
  const now = Date.now();
  const student = (email, period, cls, weeks) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = email; r[L.CLASS_NAME] = cls; r[L.PERIOD] = period; r[L.ACADEMIC_YEAR] = '2627_MP2';
    ledger.appendRow(r);
    const doc = sandbox.DocumentApp.create('Context');
    const body = doc.getBody();
    for (let w = 1; w <= weeks; w++) {
      body.appendParagraph('Week of November ' + (w * 7) + ', 2026').setHeading('HEADING2');
      body.appendParagraph('What you said when you submitted').setHeading('HEADING3');
      body.appendParagraph('I chose the stadium sponsorship because my uncle runs a gym, week ' + w + '.');
    }
    reg.appendRow([email, 'S', doc.getId(), '', new Date(now - 21 * DAY), new Date(now - 1 * DAY), 'TRUE']);
    const q = new Array(x.WQ_BASE_WIDTH).fill('');
    q[x.WQ.QUEUE_ID] = 'WUQ-' + email; q[x.WQ.STUDENT_EMAIL] = email; q[x.WQ.GOOGLE_ID] = email; q[x.WQ.STUDENT_NAME] = 'Avery Demo';
    q[x.WQ.LESSON_DATE] = '2026-11-20'; q[x.WQ.STATUS] = 'DELIVERED';
    q[x.WQ.LESSON_CTX_SNAP] = JSON.stringify({ course_name: cls, warmup_anchor: 'Think about a sponsor you would pick and describe why.', objective: 'Explain sponsorship' });
    q[x.WQ.STUDENT_PROFILE_SNAP] = JSON.stringify({ student_name: 'Avery Demo' });
    wq.appendRow(q);
  };
  student('1000001@ccpsnet.net', '1', '8175 Sports Marketing', 2);
  student('1000002@ccpsnet.net', '2', '8177 Sports Management', 3);
  student('1000003@ccpsnet.net', '2', '8177 Sports Management', 1); // one week: doesn't qualify
  return Object.assign(env, { ss });
}

const rows = (ss, tab) => { const s = ss.getSheetByName(tab); return s ? s.getDataRange().getValues().slice(1) : []; };

test('install: one student per period and course, two Flow 3 jobs each; only B carries the context', () => {
  const env = setUp();
  const { exported: x, ss } = env;
  const pv = x.previewWarmUpContextFixture();
  assert.deepEqual(JSON.parse(JSON.stringify(pv)), { groups: 2, picked: 2 });
  assert.equal(rows(ss, 'Flow3Input').length, 0, 'the preview writes nothing');
  const r = x.installWarmUpContextFixture();
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { students: 2, jobs: 4 });
  const jobs = rows(ss, 'Flow3Input');
  const prompt = x.WFB_FLOW3_HEADERS.length - 1;
  assert.ok(jobs.every((j) => String(j[1]).indexOf(x.WCF_PREFIX) === 0 && j[2] === 'READY'));
  const a = jobs.filter((j) => /-A$/.test(j[1])), b = jobs.filter((j) => /-B$/.test(j[1]));
  assert.equal(a.length, 2);
  assert.ok(a.every((j) => !/WEEKLY RECORD/.test(j[prompt])), 'A is the prompt as today');
  assert.ok(b.every((j) => /STUDENT'S WEEKLY RECORD[\s\S]*uncle runs a gym[\s\S]*Never mention a score/.test(j[prompt])), 'B adds the context and its rule');
  assert.ok(b.every((j, i) => String(j[prompt]).indexOf(String(a[i][prompt])) === 0), 'B starts with A exactly');
  const res = rows(ss, 'WarmUpContextResults');
  assert.equal(res.length, 2);
  assert.ok(res.every((row) => row[x.WCF.LEFT_IS] === 'A' || row[x.WCF.LEFT_IS] === 'B'));
  assert.ok(!res.some((row) => row[x.WCF.STUDENT] === '1000003@ccpsnet.net'), 'one week of context does not qualify');
});

test('the harvest never delivers a fixture answer; check pairs them blind and flags; remove cleans up', () => {
  const env = setUp();
  const { exported: x, ss } = env;
  x.installWarmUpContextFixture();
  const ret = ss.getSheetByName(x.TABS.warmUpFlowReturn) || ss.insertSheet(x.TABS.warmUpFlowReturn);
  if (ret.getLastRow() === 0) ret.appendRow(x.WFB_RETURN_HEADERS);
  rows(ss, 'Flow3Input').forEach((j) => {
    const b = /-B$/.test(j[1]);
    ret.appendRow([new Date(), 3, j[1], b ? 'WARM-UP: Your uncle runs a gym: which sponsor fits it, and why? You scored 8/10 last time.'
      : 'WARM-UP: Which sponsor would you pick for a stadium, and why?', '', 0, '']);
  });
  const before = JSON.stringify(rows(ss, 'WarmUpQueue'));
  x.harvestWarmUpFlowReturns();
  assert.equal(JSON.stringify(rows(ss, 'WarmUpQueue')), before, 'no WarmUpQueue row changed');
  assert.ok(rows(ss, x.TABS.warmUpFlowReturn).every((r) => r[4] === ''), 'the harvest left them alone');
  const c = x.checkWarmUpContextFixture();
  assert.deepEqual(JSON.parse(JSON.stringify(c)), { done: 2, pending: 0, contextUsed: 2, safetyFlags: 2 });
  const res = rows(ss, 'WarmUpContextResults')[0];
  const bText = res[x.WCF.LEFT_IS] === 'B' ? res[x.WCF.LEFT] : res[x.WCF.RIGHT];
  assert.match(bText, /uncle runs a gym/);
  assert.match(res[x.WCF.CONTEXT_USED], /uncle/);
  assert.match(res[x.WCF.SAFETY], /scored|8\/10/);
  assert.equal(res[x.WCF.SHAPE_A], 'OK');
  assert.ok(rows(ss, x.TABS.warmUpFlowReturn).every((r) => r[4] === 'HARVESTED'));
  assert.ok(rows(ss, 'Flow3Input').every((j) => j[2] === 'CONSUMED'));
  x.removeWarmUpContextFixture();
  assert.equal(rows(ss, 'Flow3Input').length, 0);
  assert.equal(rows(ss, x.TABS.warmUpFlowReturn).length, 0);
  assert.equal(rows(ss, 'WarmUpContextResults').length, 2, 'the results stay');
});

test('checkFlowBinding treats a fixture return with no queue row as a test leftover, like a canary\'s', () => {
  const { exported: x } = loadGasFiles(FILES, ['_wfbIsCanaryLeftover_', 'WCF_PREFIX', 'WFB_RET']);
  const row = []; row[x.WFB_RET.QUEUE_ID] = x.WCF_PREFIX + '20261123-1-B';
  assert.equal(x._wfbIsCanaryLeftover_(row, {}), true);
  const live = []; live[x.WFB_RET.QUEUE_ID] = 'WUQ-123';
  assert.equal(x._wfbIsCanaryLeftover_(live, {}), false);
});
