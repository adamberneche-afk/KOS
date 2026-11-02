'use strict';
// kos-personal/25_VectorDocs.gs: the VECTOR_* docs, the Registrar's Stage 2
// standard, compiled every morning from the operator's own record with no
// model call. Pins: a session's items go to the themes VECTOR_MATRIX scores
// it for; DROPPED decisions are left out and OPEN ones are marked as no
// standard; the most authoritative items come first; the setup template is
// replaced, but the operator's own text above the marker is never touched;
// a theme with no evidence says it has none; an unchanged doc is not
// rewritten; VECTOR_GOVERNANCE carries only APPROVED SMPs; and the
// compiled docs reach the Stage 2 cell (24_RegistrarFlows.gs).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '4_Vector_Router.gs', '6_Governance.gs',
  '22_BriefingDocs.gs', '25_VectorDocs.gs', '11_Registrar_CogRelay.gs', '12_StudioReturnHarvest.gs',
  '24_RegistrarFlows.gs'].map((f) => path.join(KP, f));
const EXPOSE = ['compileVectorDocs', 'compileVectorDocs_', 'checkVectorDocs', 'runRegistrarMicrobatch', 'CFG',
  'VD_MARKER', 'RG_STAGE2_TAB'];

const TEMPLATE = ['VECTOR: PEDAGOGY', 'Domain: Teaching, Learning & Student Outcomes', 'Core Principles',
  '[What foundational beliefs govern this domain?]', 'Key Decisions Log', '[DATE]  |  [DECISION]  |  [RATIONALE]',
  'Active Constraints', '[What limits or guardrails currently apply?]', 'Evolution Log',
  '[What changed? What was deprecated and why?]'].join('\n');

function setup() {
  const env = loadGasFiles(FILES, EXPOSE);
  const { exported: x, sandbox } = env;
  const props = sandbox.PropertiesService.getScriptProperties();
  const ss = sandbox.SpreadsheetApp.create(x.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  props.setProperty('INDEX_ID', ss.getId());
  const folder = sandbox.DriveApp.getRootFolder().createFolder('05_Vector_Repository');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('ID_05_VECTOR_REPOSITORY', folder.getId());
  const pivots = sandbox.DocumentApp.create('PIVOTS_AND_LESSONS');
  props.setProperty('ID_PIVOTS_AND_LESSONS', pivots.getId());

  const matrix = ss.insertSheet('VECTOR_MATRIX');
  matrix.appendRow(['Session_UID', 'Timestamp', 'ARCHITECTURE', 'UI', 'SECURITY', 'PEDAGOGY', 'GAS_DEVELOPMENT',
    'RELATIONAL', 'DOMAIN_COMPLIANCE', 'INCUBATOR_SIGNALS', 'CHECKSUM']);
  // A: pedagogy and architecture. B: security only (its top theme, under the minimum).
  matrix.appendRow(['LOG-aaa', '2026-10-01', 0.4, 0, 0, 0.6, 0, 0, 0, 0, 'x']);
  matrix.appendRow(['LOG-bbb', '2026-10-05', 0, 0, 0.1, 0, 0, 0, 0, 0, 'x']);

  const reg = ss.insertSheet('DECISION_REGISTER');
  reg.appendRow(x.CFG.DECISION_REGISTER_HEADERS);
  reg.appendRow(['LOG-aaa_CH01#1', 'LOG-aaa_CH01', '2026-10-01', 'operator', 'Warm-ups stay under five minutes',
    'pacing', 'RESOLVED', '2026-10-11', 'Confirmed after two weeks of timing them.']);
  reg.appendRow(['LOG-aaa_CH01#2', 'LOG-aaa_CH01', '2026-10-01', 'operator', 'Grade warm-ups for points', 'x',
    'DROPPED', '2026-10-11', 'No: warm-ups are practice.']);
  reg.appendRow(['LOG-aaa_CH02#1', 'LOG-aaa_CH02', '2026-10-02', 'operator', 'Whether reflections are required', 'x',
    'OPEN', '', '']);
  reg.appendRow(['LOG-zzz_CH01#1', 'LOG-zzz_CH01', '2026-10-03', 'operator', 'Unscored session decision', 'x',
    'RESOLVED', '2026-10-04', 'n']);

  const actions = ss.insertSheet('ACTION_REGISTER');
  actions.appendRow(['Session_UID', 'Timestamp', 'Type', 'Item', 'Owner', 'Protected_Time_Risk']);
  actions.appendRow(['LOG-aaa_CH01', '2026-10-01 09:00:00', 'DECISION', 'Student data never leaves the district domain', 'operator', 'NO']);
  actions.appendRow(['LOG-aaa_CH01', '2026-10-01 09:00:00', 'TASK', 'Email the principal', 'operator', 'NO']);
  actions.appendRow(['LOG-bbb_CH01', '2026-10-05 09:00:00', 'DECISION', 'Rotate the shared drive passwords each term', 'operator', 'NO']);

  pivots.getBody().appendParagraph('[Session: 2026-10-02 10:00:00 | LOG-aaa_CH02]');
  pivots.getBody().appendListItem('Short prompts get more answers than long ones');

  const incub = ss.insertSheet('INCUBATOR');
  incub.appendRow(['Theme', 'a', 'b', 'c', 'd', 'e', 'Status', 'Core_Fact']);
  incub.appendRow(['PEDAGOGY', '', '', '', '', '', 'PROMOTED_MANUAL', 'Necessary struggle is protected']);

  const smp = ss.insertSheet('SMP_REGISTER');
  smp.appendRow(x.CFG.SMP_REGISTER_HEADERS);
  smp.appendRow(['SMP-002', 'Seven Bridges', 'APPROVED', 'Each cog reviews in isolation.', '2026-05-18', '2026-10-02', '', '', '']);
  smp.appendRow(['SMP-005', 'PRD as SOP', 'PENDING', 'Adopt the PRD template.', '2026-09-11', '', '', '', '']);

  const doc = (name) => {
    const it = folder.getFilesByName(name);
    return it.hasNext() ? sandbox.DocumentApp.openById(it.next().getId()) : null;
  };
  return { env, x, sandbox, ss, folder, doc };
}

function plantTemplate(t, name, text) {
  const d = t.sandbox.DocumentApp.create(name);
  d.getBody().setText(text);
  t.sandbox.DriveApp.getFileById(d.getId()).moveTo(t.folder);
  return d;
}

test('items go to the themes their session is scored for, most authoritative first, with date and session', () => {
  const t = setup();
  plantTemplate(t, 'VECTOR_PEDAGOGY', TEMPLATE);
  const r = t.x.compileVectorDocs_();
  assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
  assert.equal(r.unattributedSessions, 1, 'LOG-zzz has no VECTOR_MATRIX row: counted, not guessed');

  const ped = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.doesNotMatch(ped, /What foundational beliefs/, 'the setup template is replaced');
  const order = ['Necessary struggle is protected', 'Warm-ups stay under five minutes — Resolved: Confirmed',
    'Student data never leaves', 'Short prompts get more answers', 'Whether reflections are required'];
  order.reduce((prev, s) => {
    const at = ped.indexOf(s);
    assert.ok(at > prev, s + ' in order');
    return at;
  }, -1);
  assert.match(ped, /Warm-ups stay under five minutes[^\n]*\(2026-10-11, LOG-aaa\)/);
  assert.match(ped, /Unsettled: open decisions\. NOT a standard/);
  assert.doesNotMatch(ped, /Grade warm-ups for points/, 'DROPPED is left out');
  assert.doesNotMatch(ped, /Email the principal/, 'only DECISION rows from ACTION_REGISTER');
  assert.doesNotMatch(ped, /Rotate the shared drive/, 'LOG-bbb is not a pedagogy session');
  assert.doesNotMatch(ped, /Unscored session decision/);

  assert.match(t.doc('VECTOR_ARCHITECTURE').getBody().getText(), /Student data never leaves/, 'LOG-aaa scores 0.4 there too');
  assert.match(t.doc('VECTOR_SECURITY').getBody().getText(), /Rotate the shared drive/, 'its top theme, though under the minimum');
});

test('a theme with no evidence says there is no standard, never that a draft is on standard', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  const ui = t.doc('VECTOR_UI').getBody().getText();
  assert.match(ui, /No recorded evidence for this theme yet\. There is no standard here/);
});

test('VECTOR_GOVERNANCE carries the approved SMPs only', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  const gov = t.doc('VECTOR_GOVERNANCE').getBody().getText();
  assert.match(gov, /SMP-002 — Seven Bridges: Each cog reviews in isolation\. \(approved 2026-10-02\)/);
  assert.doesNotMatch(gov, /SMP-005/);
});

test('the operator\'s own text above the marker is never touched; only the compiled part changes', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  const body = t.doc('VECTOR_PEDAGOGY').getBody();
  // The operator writes a principle under OPERATOR PRINCIPLES.
  const opIdx = body.paragraphs.findIndex((p) => /^OPERATOR PRINCIPLES/.test(p.text));
  body.paragraphs[opIdx + 1].text = 'Every lesson ends with students explaining their reasoning aloud.';

  t.ss.getSheetByName('ACTION_REGISTER').appendRow(['LOG-aaa_CH03', '2026-10-09 09:00:00', 'DECISION',
    'Exit tickets are three questions at most', 'operator', 'NO']);
  const r = t.x.compileVectorDocs_();
  assert.ok(r.written.includes('VECTOR_PEDAGOGY'));
  const text = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.match(text, /Every lesson ends with students explaining their reasoning aloud\./);
  assert.ok(text.indexOf('explaining their reasoning') < text.indexOf(t.x.VD_MARKER), 'above the marker');
  assert.match(text, /Exit tickets are three questions at most/);
  assert.equal(text.split(t.x.VD_MARKER).length, 2, 'one marker, however many runs');
});

test('a doc with the operator\'s writing and no marker keeps all of it', () => {
  const t = setup();
  plantTemplate(t, 'VECTOR_PEDAGOGY', 'My own pedagogy notes.\nStudents talk before they write.');
  t.x.compileVectorDocs_();
  const text = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.ok(text.startsWith('My own pedagogy notes.\nStudents talk before they write.'));
  assert.match(text, /Necessary struggle is protected/);
});

test('a doc whose compiled part would not change is not rewritten', () => {
  const t = setup();
  const first = t.x.compileVectorDocs_();
  assert.ok(first.written.length >= 8);
  const second = t.x.compileVectorDocs_();
  assert.equal(second.written.length, 0, 'a quiet day adds no revision: ' + second.written.join(', '));
  const check = t.x.checkVectorDocs();
  assert.ok(check.lastRun && check.docs.every((d) => d.compiled && !d.templateOnly));
});

test('the compiled docs reach Stage 2\'s cell under the primer heading', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  const ledger = t.ss.insertSheet(t.x.CFG.REGISTRAR_LEDGER_SHEET);
  ledger.appendRow(['File_ID', 'File_Name', 'Current_State', 'Cog_1_JSON_Output', 'Cog_2_JSON_Output',
    'Final_Human_Translation', 'Attempt_Tracker', 'Error_Log', 'Timestamp_Intake', 'Timestamp_Finalized']);
  const draft = t.sandbox.DocumentApp.create('Unit 4 draft');
  draft.getBody().setText('A lesson on warm-ups.');
  ledger.appendRow([draft.getId(), 'Unit 4 draft', 'READY_FOR_COG_2', '{"doc_uid":""}', '', '', 0, '', '', '']);
  t.x.runRegistrarMicrobatch();
  const cell = t.ss.getSheetByName(t.x.RG_STAGE2_TAB).getDataRange().getValues()[1][3];
  assert.match(cell, /MASTER VECTOR PRIMER[^\n]*\n### VECTOR_ARCHITECTURE/);
  assert.match(cell, /### VECTOR_PEDAGOGY[\s\S]*Warm-ups stay under five minutes/);
  assert.match(cell, /### VECTOR_GOVERNANCE[\s\S]*SMP-002/);
});
