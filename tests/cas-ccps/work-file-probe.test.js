'use strict';
// The Phase 4 design check (70_WorkFileProbe.js): what Apps Script reads back
// from a Form, a Slides deck and a Sheet. Live answers come from the operator's
// run; these tests pin what each reader captures and how an answer is
// recorded, against small fakes of FormApp, SlidesApp, SpreadsheetApp and
// Drive, so the probe can't report YES for something it didn't read.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const NAMES = ['_wfpReadForm_', '_wfpReadSlides_', '_wfpReadSheet_', '_wfpRevisions_', '_wfpCopy_', '_wfpRun_', '_wfpRow_'];
const load = (extra) => loadGasFiles([S('00_SharedConfig.js'), S('70_WorkFileProbe.js')], NAMES, extra || {}).exported;

// ── Fakes ───────────────────────────────────────────────────────────────────
const choice = (v) => ({ getValue: () => v });
function fakeForm({ checkboxGetter }) {
  const checkbox = { getChoices: () => ['Price', 'Seats', 'Food', 'Parking'].map(choice) };
  if (checkboxGetter) checkbox.getValidation = checkboxGetter;
  const items = [
    { getType: () => 'CHECKBOX', getTitle: () => 'Which two?', asCheckboxItem: () => checkbox },
    { getType: () => 'SCALE', getTitle: () => 'Come back?', asScaleItem: () => ({
      getLowerBound: () => 1, getUpperBound: () => 5, getLeftLabel: () => 'Not likely', getRightLabel: () => 'Very likely' }) },
    { getType: () => 'TEXT', getTitle: () => 'What change?' },
  ];
  return {
    getDescription: () => 'A survey.', collectsEmail: () => false, isPublished: () => true,
    getItems: () => items,
    getResponses: () => { throw new Error('the reader must never read responses'); },
  };
}

const textOf = (s) => ({ getText: () => ({ asString: () => s }) });
function fakeDeck() {
  const slide = (placeholders, shapes, notes, images) => ({
    getPlaceholder: (t) => placeholders[t] ? { asShape: () => textOf(placeholders[t]) } : null,
    getShapes: () => shapes.map(textOf),
    getNotesPage: () => ({ getSpeakerNotesShape: () => textOf(notes) }),
    getImages: () => new Array(images).fill({}),
    getSheetsCharts: () => [],
  });
  return {
    deck: { getSlides: () => [
      slide({ CT: 'Our Brand Board' }, ['Our Brand Board', ''], '', 0),
      slide({ T: 'Target customer' }, ['Target customer', 'Families within 20 minutes.'], 'Say why families.', 0),
      slide({}, [], '', 1),
    ] },
  };
}

function fakeSheet() {
  const cell = (r, c) => ({ getA1Notation: () => String.fromCharCode(64 + c) + r });
  const tab = (name, a1, formulas, charts) => ({
    getName: () => name,
    getDataRange: () => ({ getA1Notation: () => a1, getFormulas: () => formulas }),
    getRange: cell,
    getCharts: () => charts,
  });
  const chart = {
    getOptions: () => ({ get: (k) => (k === 'title' ? 'Cost by item' : null) }),
    modify: () => ({ getChartType: () => 'COLUMN' }),
    getRanges: () => [{ getA1Notation: () => 'A1:B4' }],
  };
  return { getSheets: () => [
    tab('Budget', 'A1:B6', [['', ''], ['', ''], ['', ''], ['', ''], ['', '=SUM(B2:B4)'], ['', '']], [chart]),
    tab('Notes', 'A1', [['']], []),
  ] };
}

// ── Readers ─────────────────────────────────────────────────────────────────
test('Form reader: types, choices, scale ends and labels, email setting; never the responses', () => {
  const { _wfpReadForm_ } = load();
  const r = _wfpReadForm_(fakeForm({}));
  assert.equal(r.description, 'A survey.');
  assert.equal(r.collectsEmail, false);
  assert.equal(r.published, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.items)), [
    { type: 'CHECKBOX', title: 'Which two?', choices: ['Price', 'Seats', 'Food', 'Parking'] },
    { type: 'SCALE', title: 'Come back?', scale: [1, 5, 'Not likely', 'Very likely'] },
    { type: 'TEXT', title: 'What change?' },
  ]);
});

test('Form reader: "select up to two" is reported unreadable unless a getter returns something', () => {
  const { _wfpReadForm_ } = load();
  const none = _wfpReadForm_(fakeForm({}));
  assert.equal(none.checkboxValidation.readable, false);
  assert.match(none.checkboxValidation.detail, /no getValidation/);
  const empty = _wfpReadForm_(fakeForm({ checkboxGetter: () => null }));
  assert.equal(empty.checkboxValidation.readable, false);
  const some = _wfpReadForm_(fakeForm({ checkboxGetter: () => ({ max: 2 }) }));
  assert.equal(some.checkboxValidation.readable, true);
});

test('Slides reader: titles from either title placeholder, text, notes, images, charts', () => {
  const { deck } = fakeDeck();
  const { _wfpReadSlides_ } = load({ SlidesApp: { PlaceholderType: { CENTERED_TITLE: 'CT', TITLE: 'T' } } });
  const r = _wfpReadSlides_(deck);
  assert.deepEqual(r.map((s) => s.title), ['Our Brand Board', 'Target customer', '']);
  assert.match(r[1].text, /Families within 20 minutes/);
  assert.equal(r[1].notes, 'Say why families.');
  assert.deepEqual(r.map((s) => s.images), [0, 0, 1]);
  assert.deepEqual(r.map((s) => s.charts), [0, 0, 0]);
});

test('Sheets reader: tabs, filled range, formulas only where there is one, chart title, type and range', () => {
  const { _wfpReadSheet_ } = load();
  const r = _wfpReadSheet_(fakeSheet());
  assert.deepEqual(r.map((t) => t.name), ['Budget', 'Notes']);
  assert.equal(r[0].range, 'A1:B6');
  assert.deepEqual(r[0].formulas, ['B5: =SUM(B2:B4)']);
  assert.deepEqual(JSON.parse(JSON.stringify(r[0].charts)), [{ title: 'Cost by item', type: 'COLUMN', ranges: 'A1:B4' }]);
  assert.deepEqual(r[1].formulas, []);
});

// ── Recording answers ───────────────────────────────────────────────────────
test('revisions: listed, and an edit that adds one; a Drive error is a NO with its message', () => {
  let n = 1;
  const ok = load({ Drive: { Revisions: { list: () => ({ revisions: new Array(n).fill({}) }) } } });
  const rows = ok._wfpRevisions_('Form', 'id', () => { n = 2; });
  assert.deepEqual(rows.map((r) => [r[1], r[2]]), [['Drive lists its revisions', 'YES'], ['An edit shows as a new revision', 'YES']]);

  const bad = load({ Drive: { Revisions: { list: () => { throw new Error('This file does not support revisions'); } } } });
  const r2 = bad._wfpRevisions_('Form', 'id', () => {});
  assert.equal(r2.length, 1);
  assert.equal(r2[0][2], 'NO');
  assert.match(r2[0][3], /does not support revisions/);
});

test('a copy is YES only when it reads back the same; a probe that throws is one NO row', () => {
  const { _wfpCopy_, _wfpRun_ } = load();
  const file = { getName: () => 'x', makeCopy: () => ({ getId: () => 'copy' }) };
  assert.equal(_wfpCopy_('Sheet', file, {}, () => 'same', 'same')[0][2], 'YES');
  const diff = _wfpCopy_('Sheet', file, {}, () => 'other', 'same')[0];
  assert.equal(diff[2], 'NO');
  assert.match(diff[3], /copy differs/);
  const stopped = _wfpRun_('Slides', () => { throw new Error('no access'); });
  assert.deepEqual(stopped, [['Slides', 'Probe ran', 'NO', 'Stopped: no access']]);
});
