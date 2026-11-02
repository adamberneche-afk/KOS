'use strict';
// kos-personal/25_VectorDocs.gs: the VECTOR_* docs, the Registrar's Stage 2
// standard, built from the operator's own record. Two halves:
//   - the Vector Item Labeler flow's Apps Script half: every recorded item
//     batched by ID, the flow's labels harvested only for IDs in their
//     batch, an item given up on after three tries, a label row never
//     rewritten (so the operator's hand edits stay);
//   - the compiler: only items labelled to a theme as PRINCIPLE or
//     CONSTRAINT, word for word with date and session, most authoritative
//     first; OPEN decisions listed as no standard; session decisions that
//     match an open or dropped one set aside; repeats listed once; every
//     heading with its count; the operator's text above the marker never
//     touched; and the primer (24) giving each doc the room it needs and
//     cutting at a line.
// These tests play the flow's part by appending the return row a built
// flow would (FLOW_DOCTRINE rules 4 and 5).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '4_Vector_Router.gs', '6_Governance.gs',
  '22_BriefingDocs.gs', '25_VectorDocs.gs', '11_Registrar_CogRelay.gs', '12_StudioReturnHarvest.gs',
  '24_RegistrarFlows.gs'].map((f) => path.join(KP, f));
const EXPOSE = ['compileVectorDocs', 'compileVectorDocs_', 'checkVectorDocs', 'runRegistrarMicrobatch', 'CFG',
  'VD_MARKER', 'RG_STAGE2_TAB', 'runVectorItemLabeler', 'buildVectorItemBatches', 'harvestVectorItemReturns',
  'checkVectorItemBinding', 'checkVectorItemLiveness', 'installVectorItemFixture', 'runVectorItemLabelCanary',
  'VI_INPUT_TAB', 'VI_RETURN_TAB', 'VI_LABEL_TAB', 'VI_INPUT_HEADERS', 'VI_RETURN_HEADERS', 'VI_LABEL_HEADERS',
  'VI_MAX_ATTEMPTS', '_rgVectorPrimer_', 'listPersonalItems'];

const TEMPLATE = ['VECTOR: PEDAGOGY', 'Domain: Teaching, Learning & Student Outcomes', 'Core Principles',
  '[What foundational beliefs govern this domain?]', 'Key Decisions Log', '[DATE]  |  [DECISION]  |  [RATIONALE]',
  'Active Constraints', '[What limits or guardrails currently apply?]', 'Evolution Log',
  '[What changed? What was deprecated and why?]'].join('\n');

// What the flow would answer, keyed by a phrase in the item's text.
const RULES = [
  [/Warm-ups stay under five minutes/, 'PEDAGOGY', 'PRINCIPLE'],
  [/Student data never leaves/, 'SECURITY', 'PRINCIPLE'],
  [/Short prompts get more answers/, 'PEDAGOGY', 'PRINCIPLE'],
  [/six minutes/, 'GAS_DEVELOPMENT', 'CONSTRAINT'],
  [/Room 301/, 'UI', 'HOUSEKEEPING'],
  [/Whether reflections are required/, 'PEDAGOGY', 'OPEN_QUESTION'],
  [/Grade warm-ups for points each week/, 'PEDAGOGY', 'PRINCIPLE'],
  [/Exit tickets/, 'PEDAGOGY', 'PRINCIPLE'],
  [/Assigned Jordan Rivera/, 'RELATIONAL', 'PERSONAL'],
  // A labeler miss: a named person labelled PRINCIPLE. The review list catches it.
  [/Placed Marisol Okafor/, 'RELATIONAL', 'PRINCIPLE'],
];
const labelFor = (line) => {
  const r = RULES.find(([re]) => re.test(line));
  return r ? { theme: r[1], kind: r[2] } : { theme: 'NONE', kind: 'OTHER' };
};

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

  const reg = ss.insertSheet('DECISION_REGISTER');
  reg.appendRow(x.CFG.DECISION_REGISTER_HEADERS);
  reg.appendRow(['LOG-aaa_CH01#1', 'LOG-aaa_CH01', '2026-10-01', 'operator', 'Warm-ups stay under five minutes',
    'pacing', 'RESOLVED', '2026-10-11', 'Confirmed after two weeks of timing them.']);
  reg.appendRow(['LOG-aaa_CH01#2', 'LOG-aaa_CH01', '2026-10-01', 'operator', 'Grade warm-ups for points', 'x',
    'DROPPED', '2026-10-11', 'No: warm-ups are practice.']);
  reg.appendRow(['LOG-aaa_CH02#1', 'LOG-aaa_CH02', '2026-10-02', 'operator', 'Whether reflections are required', 'x',
    'OPEN', '', '']);
  reg.appendRow(['LOG-bbb_CH01#1', 'LOG-bbb_CH01', '2026-10-03', 'operator', 'Room 301 layout', 'x',
    'RESOLVED', '2026-10-04', 'Room 301 was redesigned.']);

  const actions = ss.insertSheet('ACTION_REGISTER');
  actions.appendRow(['Session_UID', 'Timestamp', 'Type', 'Item', 'Owner', 'Protected_Time_Risk']);
  actions.appendRow(['LOG-aaa_CH01', '2026-10-01 09:00:00', 'DECISION', 'Student data never leaves the district domain', 'operator', 'NO']);
  actions.appendRow(['LOG-ccc_CH01', '2026-10-06 09:00:00', 'DECISION', 'Student data never leaves the district domain', 'operator', 'NO']);
  actions.appendRow(['LOG-aaa_CH01', '2026-10-01 09:00:00', 'TASK', 'Email the principal', 'operator', 'NO']);
  actions.appendRow(['LOG-ccc_CH01', '2026-10-06 09:00:00', 'DECISION',
    'Grade warm-ups for points each week', 'operator', 'NO']);
  actions.appendRow(['LOG-ccc_CH02', '2026-10-07 09:00:00', 'DECISION', 'Warm-ups stay under five minutes', 'operator', 'NO']);
  actions.appendRow(['LOG-eee_CH01', '2026-10-03 09:00:00', 'DECISION', 'Assigned Jordan Rivera as President', 'operator', 'NO']);
  actions.appendRow(['LOG-eee_CH01', '2026-10-03 09:00:00', 'DECISION',
    'Placed Marisol Okafor in a leadership role to build a multi-year pipeline', 'operator', 'NO']);

  pivots.getBody().appendParagraph('[Session: 2026-10-02 10:00:00 | LOG-aaa_CH02]');
  pivots.getBody().appendListItem('Short prompts get more answers than long ones');
  pivots.getBody().appendListItem('Apps Script runs stop at six minutes, so sweeps are capped');
  pivots.getBody().appendParagraph('[Session: 2026-09-29 13:00:00 | FIXTURE-SR-20260929-SESSION_LOG]');
  pivots.getBody().appendListItem('A fixture lesson that must never become a standard');

  const incub = ss.insertSheet('INCUBATOR');
  incub.appendRow(['Theme', 'a', 'b', 'c', 'd', 'e', 'Status', 'Core_Fact']);
  incub.appendRow(['PEDAGOGY', '', '', '', '', '', 'PROMOTED_MANUAL', 'Necessary struggle is protected']);
  incub.appendRow(['MARKETING', '', '', '', '', '', 'PROMOTED_MANUAL', '']);

  const smp = ss.insertSheet('SMP_REGISTER');
  smp.appendRow(x.CFG.SMP_REGISTER_HEADERS);
  smp.appendRow(['SMP-002', 'Seven Bridges', 'APPROVED', 'Each cog reviews in isolation.', '2026-05-18', '2026-10-02', '', '', '']);
  smp.appendRow(['SMP-005', 'PRD as SOP', 'PENDING', 'Adopt the PRD template.', '2026-09-11', '', '', '', '']);

  const doc = (name) => {
    const it = folder.getFilesByName(name);
    return it.hasNext() ? sandbox.DocumentApp.openById(it.next().getId()) : null;
  };
  const rows = (tab) => { const s = ss.getSheetByName(tab); return s ? s.getDataRange().getValues().slice(1) : []; };
  // A built flow: answer every input row that has no return yet.
  const flowAnswersAll = (labeller) => {
    const answered = new Set(rows(x.VI_RETURN_TAB).map((r) => r[1]));
    rows(x.VI_INPUT_TAB).forEach((r) => {
      if (answered.has(r[1])) return;
      const labels = String(r[3]).split('\n').filter((l) => /^\[/.test(l)).map((l) => {
        const id = /^\[([^\]]+)\]/.exec(l)[1];
        return Object.assign({ id }, (labeller || labelFor)(l));
      });
      ss.getSheetByName(x.VI_RETURN_TAB).appendRow([new Date(), r[1], JSON.stringify({ labels })]);
    });
  };
  return { env, x, sandbox, ss, folder, doc, rows, flowAnswersAll };
}

function plantDoc(t, name, text) {
  const d = t.sandbox.DocumentApp.create(name);
  d.getBody().setText(text);
  t.sandbox.DriveApp.getFileById(d.getId()).moveTo(t.folder);
  return d;
}

// Batch, answer, harvest and compile, as the hourly trigger does.
function labelAndCompile(t, labeller) {
  t.x.runVectorItemLabeler();
  t.flowAnswersAll(labeller);
  return t.x.runVectorItemLabeler();
}

test('the tabs carry the headers the code reads them by', () => {
  const t = setup();
  t.x.buildVectorItemBatches();
  assert.deepEqual(t.ss.getSheetByName(t.x.VI_INPUT_TAB).getDataRange().getValues()[0], t.x.VI_INPUT_HEADERS);
  assert.deepEqual(t.ss.getSheetByName(t.x.VI_RETURN_TAB).getDataRange().getValues()[0], t.x.VI_RETURN_HEADERS);
  assert.deepEqual(t.ss.getSheetByName(t.x.VI_LABEL_TAB).getDataRange().getValues()[0], t.x.VI_LABEL_HEADERS);
});

test('the fixture, through the harvest: answered, harvested, and no label written', () => {
  const t = setup();
  const { batchId } = t.x.installVectorItemFixture();
  const [row] = t.rows(t.x.VI_INPUT_TAB);
  assert.equal(row[1], batchId);
  assert.equal(row[4], 'READY');
  assert.match(row[3], /^THEMES: ARCHITECTURE, .*NONE\n\nITEMS \(2\):\n\[FIXTURE:0000000000000001\] \(DECIDED, 2026-11-02\)/);
  t.flowAnswersAll(() => ({ theme: 'PEDAGOGY', kind: 'PRINCIPLE' }));
  const h = t.x.harvestVectorItemReturns();
  assert.equal(h.harvested, 1);
  assert.equal(t.rows(t.x.VI_RETURN_TAB)[0][3], 'HARVESTED');
  assert.equal(t.rows(t.x.VI_LABEL_TAB).length, 0, 'a fixture labels nothing');
  assert.equal(t.x.checkVectorItemLiveness().everAnswered, true);
  assert.equal(t.x.checkVectorItemBinding().ok, true);
});

test('every recorded item is batched once by ID; fixtures and DROPPED decisions never are', () => {
  const t = setup();
  const b = t.x.buildVectorItemBatches();
  const text = t.rows(t.x.VI_INPUT_TAB).map((r) => r[3]).join('\n');
  assert.equal(b.items, 11);
  assert.match(text, /\[SETTLED:[0-9a-f]{16}\] \(SETTLED, 2026-10-11\) Warm-ups stay under five minutes — Resolved: Confirmed/);
  assert.match(text, /\[OPEN:[0-9a-f]{16}\] \(OPEN, 2026-10-02\) Whether reflections are required/);
  assert.match(text, /\[LESSON:[0-9a-f]{16}\] \(LESSON, 2026-10-02\) Short prompts/);
  assert.doesNotMatch(text, /\((SETTLED|OPEN), [^)]*\) Grade warm-ups for points/, 'DROPPED is never an item');
  assert.doesNotMatch(text, /A fixture lesson/);
  assert.doesNotMatch(text, /Email the principal/, 'only DECISION rows from ACTION_REGISTER');
  assert.equal(t.x.buildVectorItemBatches().items, 0, 'a batch awaiting its answer is not sent again');
});

test('the harvest takes only IDs from the batch, with a known theme and kind, and never rewrites a label', () => {
  const t = setup();
  t.x.buildVectorItemBatches();
  const [input] = t.rows(t.x.VI_INPUT_TAB);
  const ids = String(input[3]).split('\n').filter((l) => /^\[/.test(l)).map((l) => /^\[([^\]]+)\]/.exec(l)[1]);
  const ret = t.ss.getSheetByName(t.x.VI_RETURN_TAB);
  ret.appendRow([new Date(), input[1], '```json\n' + JSON.stringify({ labels: [
    { id: ids[0], theme: 'PEDAGOGY', kind: 'PRINCIPLE' },
    { id: 'DECIDED:ffffffffffffffff', theme: 'PEDAGOGY', kind: 'PRINCIPLE' },
    { id: ids[1], theme: 'COOKING', kind: 'PRINCIPLE' },
    { id: ids[2], theme: 'UI', kind: 'VERY_IMPORTANT' }] }) + '\n```']);
  ret.appendRow([new Date(), 'VI-nope', '{"labels":[]}']);
  ret.appendRow([new Date(), input[1], 'Here are your labels!']);
  ret.appendRow([new Date(), input[1], JSON.stringify({ labels: [{ id: 'X:1', theme: 'UI', kind: 'OTHER' }] })]);
  const h = t.x.harvestVectorItemReturns();
  assert.deepEqual([h.harvested, h.labels, h.rejected, h.badId, h.notJson, h.notGrounded], [1, 1, 3, 1, 1, 1]);
  const status = t.rows(t.x.VI_RETURN_TAB).map((r) => r[3]);
  assert.deepEqual(status, ['HARVESTED', 'BAD_BATCH_ID', 'NOT_JSON', 'NOT_GROUNDED']);
  assert.match(t.rows(t.x.VI_RETURN_TAB)[0][4], /labelled 1; rejected 3; missing 10/);

  // The operator corrects the one label by hand; a later answer for the same item changes nothing.
  t.ss.getSheetByName(t.x.VI_LABEL_TAB).getRange(2, 5).setValue('HOUSEKEEPING');
  ret.appendRow([new Date(), input[1], JSON.stringify({ labels: [{ id: ids[0], theme: 'UI', kind: 'PRINCIPLE' }] })]);
  t.x.harvestVectorItemReturns();
  const labels = t.rows(t.x.VI_LABEL_TAB);
  assert.equal(labels.length, 1);
  assert.deepEqual([labels[0][3], labels[0][4]], ['PEDAGOGY', 'HOUSEKEEPING']);
});

test('an item sent 3 times with no label is given up on, for the operator to label by hand', () => {
  const t = setup();
  for (let i = 0; i < t.x.VI_MAX_ATTEMPTS; i++) {
    assert.equal(t.x.buildVectorItemBatches().items, 11, 'attempt ' + (i + 1));
    // No answer came, and the wait has passed: the next run sends them again.
    const s = t.ss.getSheetByName(t.x.VI_INPUT_TAB);
    for (let r = 2; r <= s.getLastRow(); r++) s.getRange(r, 1).setValue(new Date('2026-01-01T00:00:00'));
  }
  const b = t.x.buildVectorItemBatches();
  assert.deepEqual([b.givenUp, b.items], [11, 0]);
  assert.ok(t.rows(t.x.VI_LABEL_TAB).every((r) => r[4] === 'UNLABELED' && r[3] === 'NONE'));
  t.x.compileVectorDocs_();
  assert.match(t.x.checkVectorDocs().notes.join(' '), /11 item\(s\) were sent 3 times with no label/);
});

test('a theme doc holds only its PRINCIPLE and CONSTRAINT items, word for word, most authoritative first', () => {
  const t = setup();
  plantDoc(t, 'VECTOR_PEDAGOGY', TEMPLATE);
  labelAndCompile(t);
  const ped = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.doesNotMatch(ped, /What foundational beliefs/, 'the setup template is replaced');
  ['Core facts you pinned (do not contradict) (1)', 'Necessary struggle is protected',
    'Settled: decisions you resolved, with your note (1)',
    'Warm-ups stay under five minutes — Resolved: Confirmed after two weeks of timing them. (2026-10-11, LOG-aaa)',
    'Lessons and pivots from sessions (1)', 'Short prompts get more answers than long ones (2026-10-02, LOG-aaa)',
    'Unsettled: open decisions. NOT a standard; do not score drift against these (1)',
    'Whether reflections are required (2026-10-02, LOG-aaa)']
    .reduce((prev, s) => { const at = ped.indexOf(s); assert.ok(at > prev, s); return at; }, -1);

  assert.doesNotMatch(ped, /Grade warm-ups for points each week/, 'a session decision matching a DROPPED one is set aside');
  assert.doesNotMatch(ped, /Decided in sessions/, 'the session repeat of the settled decision is left to the settled one');
  assert.doesNotMatch(ped, /Room 301/, 'HOUSEKEEPING is never a standard');
  assert.match(t.doc('VECTOR_SECURITY').getBody().getText(),
    /Student data never leaves the district domain \(2026-10-06, LOG-ccc\) \(also recorded in 1 other session\)/,
    'two sessions, one line, the newest');
  assert.match(t.doc('VECTOR_GAS_DEVELOPMENT').getBody().getText(), /Apps Script runs stop at six minutes/);
  assert.doesNotMatch(t.doc('VECTOR_ARCHITECTURE').getBody().getText(), /Student data|Warm-ups/,
    'an item goes only to the theme it is labelled, not to its session\'s other themes');
});

test('a theme with no standard says so; an empty pinned fact is reported, not shown', () => {
  const t = setup();
  labelAndCompile(t);
  assert.match(t.doc('VECTOR_UI').getBody().getText(), /No recorded standard for this theme yet\. There is nothing here/);
  const check = t.x.checkVectorDocs();
  assert.match(check.notes.join(' '), /Pinned core fact\(s\) with no text, left out: MARKETING/);
  assert.equal(check.docs.length, 8, 'seven themes and governance');
});

test('VECTOR_GOVERNANCE carries the approved SMPs only', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  const gov = t.doc('VECTOR_GOVERNANCE').getBody().getText();
  assert.match(gov, /SMP-002 — Seven Bridges: Each cog reviews in isolation\. \(approved 2026-10-02\)/);
  assert.doesNotMatch(gov, /SMP-005/);
});

test('items still awaiting a label are counted in the doc, not guessed at', () => {
  const t = setup();
  t.x.compileVectorDocs_();
  assert.match(t.doc('VECTOR_PEDAGOGY').getBody().getText(), /11 of the record's items still await a label/);
});

test('the operator\'s own text above the marker is never touched; only the compiled part changes', () => {
  const t = setup();
  labelAndCompile(t);
  const body = t.doc('VECTOR_PEDAGOGY').getBody();
  const opIdx = body.paragraphs.findIndex((p) => /^OPERATOR PRINCIPLES/.test(p.text));
  body.paragraphs[opIdx + 1].text = 'Every lesson ends with students explaining their reasoning aloud.';

  t.ss.getSheetByName('ACTION_REGISTER').appendRow(['LOG-ddd_CH01', '2026-10-09 09:00:00', 'DECISION',
    'Exit tickets are three questions at most', 'operator', 'NO']);
  labelAndCompile(t);
  const text = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.match(text, /Every lesson ends with students explaining their reasoning aloud\./);
  assert.ok(text.indexOf('explaining their reasoning') < text.indexOf(t.x.VD_MARKER), 'above the marker');
  assert.match(text, /Decided in sessions \(1\)\nExit tickets are three questions at most/);
  assert.equal(text.split(t.x.VD_MARKER).length, 2, 'one marker, however many runs');
});

test('a doc with the operator\'s writing and no marker keeps all of it', () => {
  const t = setup();
  plantDoc(t, 'VECTOR_PEDAGOGY', 'My own pedagogy notes.\nStudents talk before they write.');
  t.x.compileVectorDocs_();
  const text = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.ok(text.startsWith('My own pedagogy notes.\nStudents talk before they write.'));
  assert.match(text, /Necessary struggle is protected/);
});

test('a doc whose compiled part would not change is not rewritten', () => {
  const t = setup();
  labelAndCompile(t);
  assert.equal(t.x.compileVectorDocs_().written.length, 0, 'a quiet day adds no revision');
});

test('when room runs out, whole items are dropped and every later heading still shows its count', () => {
  const t = setup();
  const actions = t.ss.getSheetByName('ACTION_REGISTER');
  for (let i = 0; i < 60; i++) {
    actions.appendRow(['LOG-big' + i + '_CH01', '2026-10-1' + (i % 10) + ' 09:00:00', 'DECISION',
      'Exit tickets rule ' + ['alpha', 'beta', 'gamma', 'delta', 'omega'].map((w) => w + i + 'x').join(' ') +
        ': ' + ('evidence before opinion, every time, in every section. ').repeat(4),
      'operator', 'NO']);
  }
  labelAndCompile(t);
  t.x.runVectorItemLabeler();
  t.flowAnswersAll();
  t.x.runVectorItemLabeler();
  const text = t.doc('VECTOR_PEDAGOGY').getBody().getText();
  assert.match(text, /Decided in sessions \(\d+\)/);
  assert.match(text, /\[\d+ more not shown: room\]/);
  assert.match(text, /Lessons and pivots from sessions \(1\)/, 'a heading after the cut still says how many');
  assert.match(text, /Unsettled: open decisions\. NOT a standard; do not score drift against these \(1\)/);
  text.split('\n').filter((l) => /^Exit tickets rule/.test(l)).forEach((l) => assert.match(l, /\(2026-10-1\d, LOG-big\d+\)$/));
});

test('the primer gives each doc the room it needs, cuts a long one at a line, and reaches Stage 2', () => {
  const t = setup();
  labelAndCompile(t);
  plantDoc(t, 'VECTOR_ZZ_LONG', Array.from({ length: 4000 }, (_, i) => 'line ' + i + ' of a long doc').join('\n'));
  const primer = t.x._rgVectorPrimer_(30000);
  assert.ok(primer.length <= 30000);
  assert.match(primer, /### VECTOR_PEDAGOGY[\s\S]*Whether reflections are required/, 'a short doc is never cut');
  assert.match(primer, /line \d+ of a long doc\n\[… cut short: this doc is longer\]/, 'cut after a whole line');

  const ledger = t.ss.insertSheet(t.x.CFG.REGISTRAR_LEDGER_SHEET);
  ledger.appendRow(['File_ID', 'File_Name', 'Current_State', 'Cog_1_JSON_Output', 'Cog_2_JSON_Output',
    'Final_Human_Translation', 'Attempt_Tracker', 'Error_Log', 'Timestamp_Intake', 'Timestamp_Finalized']);
  const draft = t.sandbox.DocumentApp.create('Unit 4 draft');
  draft.getBody().setText('A lesson on warm-ups.');
  ledger.appendRow([draft.getId(), 'Unit 4 draft', 'READY_FOR_COG_2', '{"doc_uid":""}', '', '', 0, '', '', '']);
  t.x.runRegistrarMicrobatch();
  const cell = t.ss.getSheetByName(t.x.RG_STAGE2_TAB).getDataRange().getValues()[1][3];
  assert.match(cell, /### VECTOR_PEDAGOGY[\s\S]*Warm-ups stay under five minutes — Resolved/);
  assert.match(cell, /### VECTOR_GOVERNANCE[\s\S]*SMP-002/);
});

test('the canary passes with the flow stubbed, says so, and leaves no rows behind', () => {
  const t = setup();
  const c = t.x.runVectorItemLabelCanary();
  assert.equal(c.passed, c.total);
  assert.equal(c.stubbed, true);
  assert.equal(t.rows(t.x.VI_INPUT_TAB).length, 0);
  assert.equal(t.rows(t.x.VI_RETURN_TAB).length, 0);
});

test('an item naming a person is PERSONAL and never a standard; a labeler miss is listed for review', () => {
  const t = setup();
  labelAndCompile(t);
  const rel = t.doc('VECTOR_RELATIONAL').getBody().getText();
  assert.doesNotMatch(rel, /Jordan Rivera/, 'PERSONAL is never compiled');
  assert.match(rel, /Placed Marisol Okafor/, 'the miss is compiled as labelled...');
  const notes = t.x.checkVectorDocs().notes.join(' ');
  assert.match(notes, /VECTOR_RELATIONAL DECIDED:[0-9a-f]{16}: "Placed Marisol"/, '...and listed for the operator to read');
  assert.doesNotMatch(notes, /Seven Bridges|Apps Script/);
});

test('listPersonalItems says where each PERSONAL item lives, and changes nothing', () => {
  const t = setup();
  const before = t.rows('ACTION_REGISTER').length;
  assert.equal(t.x.listPersonalItems().awaiting, 11, 'nothing labelled yet: nothing checked');
  labelAndCompile(t);
  const r = t.x.listPersonalItems();
  assert.equal(r.personal, 1);
  assert.deepEqual(r.items[0], { loc: 'ACTION_REGISTER row 7', session: 'LOG-eee', text: 'Assigned Jordan Rivera as President' });
  assert.equal(t.rows('ACTION_REGISTER').length, before);
});
