'use strict';
// Regression tests for 30_SCRSuggestionEngine.js's exportToWorkbookGrid_().
//
// This function had no coverage, which is how its actual output shape came
// to be described wrongly in a sprint plan ("each row links to the submitted
// work, not just the evidence-snapshot text already included" — it produces
// a pivoted class x competency grid, and no evidence snapshot appears in it
// at all). These tests pin the real shape so the next reader doesn't have to
// take a description on trust.
//
// The Student Doc column is the new part: an auditor reading a competency
// rating previously had no route from the rating back to the work behind it.
//
// Loaded with 00_SharedConfig.js because the engine calls getConfig_() and
// reads LEDGER/SCRDL from there — both files are in cas-ccps:central-ledger.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

function load() {
  return loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '30_SCRSuggestionEngine.js')],
    ['exportToWorkbookGrid_'],
  );
}

function ledgerRow(opts) {
  const row = new Array(23).fill('');
  row[1] = opts.email;      // GoogleID
  row[4] = opts.name;       // StudentName
  row[6] = opts.className;  // ClassName
  return row;
}

function setUpFixture(sandbox, opts) {
  const options = opts || {};
  const D = sandbox.Date;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');

  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  ledger.appendRow(ledgerRow({ email: '1234567@ccpsnet.net', name: 'Alice', className: 'Marketing 1' }));
  ledger.appendRow(ledgerRow({ email: '2345678@ccpsnet.net', name: 'Bob', className: 'Marketing 1' }));

  const scr = ss.insertSheet('SCRDecisionLog');
  scr.appendRow(['decision_id', 'student_email', 'competency_id', 'suggested_rating',
    'final_rating', 'decision_type', 'decided_at', 'decided_by',
    'evidence_snapshot', 'archive_status']);
  scr.appendRow(['d1', '1234567@ccpsnet.net', 'COMP-8175-1', 3, 2, 'OVERRIDDEN',
    new D(2026, 1, 1), 't@ccpsnet.net', 'met:3', '']);
  scr.appendRow(['d2', '2345678@ccpsnet.net', 'COMP-8175-2', 4, 4, 'CONFIRMED',
    new D(2026, 1, 2), 't@ccpsnet.net', 'met:4', '']);

  if (options.withRegistry !== false) {
    const reg = ss.insertSheet('StudentDocRegistry');
    reg.appendRow(['student_email', 'student_name', 'doc_id', 'doc_url',
      'created_at', 'last_updated_at', 'last_run_had_content']);
    reg.appendRow(['1234567@ccpsnet.net', 'Alice', 'doc-alice',
      'https://docs.google.com/document/d/doc-alice/edit', new D(2026, 0, 1), '', '']);
    // Bob deliberately has no registry row.
  }
  return { ss };
}

function exportedGrid(sandbox, exported) {
  const res = exported.exportToWorkbookGrid_();
  assert.ok(res && res.exportSsId, 'export should return an id');
  // The created export is the most recent spreadsheet the mock made.
  const exportSs = sandbox.SpreadsheetApp.openById(res.exportSsId);
  const sheet = exportSs.getSheets()[0];
  return sheet.getDataRange().getValues();
}

test('the export is a class tab with a Student Name / Student Doc / competency grid', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const rows = exportedGrid(sandbox, exported);

  assert.equal(rows[0][0], 'Student Name');
  assert.equal(rows[0][1], 'Student Doc');
  // Competency headers are the trailing task number only, matching the
  // original workbook's format.
  assert.deepEqual(rows[0].slice(2), ['1', '2']);
});

test('each student row carries their assignment-doc link', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const rows = exportedGrid(sandbox, exported);

  const alice = rows.filter((r) => r[0] === 'Alice')[0];
  assert.ok(alice, 'Alice should appear in the grid');
  assert.equal(alice[1], 'https://docs.google.com/document/d/doc-alice/edit');
});

test('a student with no registry row gets a blank link, not a placeholder', () => {
  // "N/A" in an audit export reads as a finding about the student rather
  // than a gap in the data.
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const rows = exportedGrid(sandbox, exported);

  const bob = rows.filter((r) => r[0] === 'Bob')[0];
  assert.ok(bob, 'Bob should still appear even with no doc');
  assert.equal(bob[1], '');
});

test('ratings land in the right competency column and are the final, not suggested, value', () => {
  const { exported, sandbox } = load();
  setUpFixture(sandbox);
  const rows = exportedGrid(sandbox, exported);

  const alice = rows.filter((r) => r[0] === 'Alice')[0];
  const bob = rows.filter((r) => r[0] === 'Bob')[0];
  // Alice's decision overrode a suggested 3 down to a final 2.
  assert.equal(alice[2], 2, 'the teacher\'s final rating, not the AI suggestion');
  assert.equal(alice[3], '', 'no decision for competency 2');
  assert.equal(bob[2], '', 'no decision for competency 1');
  assert.equal(bob[3], 4);
});

test('the export still works when StudentDocRegistry does not exist', () => {
  // The registry is a Module 4 addition; a deployment that predates it must
  // still be able to produce an audit export.
  const { exported, sandbox } = load();
  setUpFixture(sandbox, { withRegistry: false });
  const rows = exportedGrid(sandbox, exported);

  assert.equal(rows[0][1], 'Student Doc');
  const alice = rows.filter((r) => r[0] === 'Alice')[0];
  assert.equal(alice[1], '');
});
