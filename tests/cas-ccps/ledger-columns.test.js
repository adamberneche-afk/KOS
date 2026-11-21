'use strict';
// The Ledger's columns are declared once, in 00_SharedConfig.js (structure
// audit 3.1, 2026-11-21): LEDGER's indexes and LEDGER_HEADERS' names must
// stay in step, and no other file may keep its own copy of the indexes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const x = loadGasFiles([path.join(SCRIPTS, '00_SharedConfig.js')],
  ['LEDGER', 'LEDGER_HEADERS', 'LEDGER_BASE_WIDTH', 'LEDGER_COL_COUNT', 'LEDGER_LATER_HEADERS']).exported;

// Each LEDGER key and the header it names.
const NAMES = {
  TIMESTAMP: 'Timestamp', GOOGLE_ID: 'GoogleID', CONFIG_ID: 'ConfigID', FILE_ID: 'FileID',
  STUDENT_NAME: 'StudentName', BLOCK: 'Block', CLASS_NAME: 'ClassName', TEACHER_NAME: 'TeacherName',
  TEACHER_EMAIL: 'TeacherEmail', SUBJECT: 'Subject', COURSE_NAME: 'CourseName', PERIOD: 'Period',
  STATUS: 'Status', SUBMISSION_TS: 'SubmissionTS', NOTES: 'Notes', LAST_EVAL: 'LastEval',
  ADMIN_FILE_URL: 'AdminFileURL', STUDENT_FILE_URL: 'StudentFileURL', ACADEMIC_YEAR: 'AcademicYear',
  TURN_IN_SUGGESTED_SCORE: 'SuggestedScore', TURN_IN_FINAL_SCORE: 'FinalScore',
  TURN_IN_SCORE_DECIDED_BY: 'ScoreDecidedBy', TURN_IN_SCORE_DECIDED_AT: 'ScoreDecidedAt',
  CHECK_COUNT: 'CheckCount', LAST_RESULT: 'LastResult', FIRST_PASSED_AT: 'FirstPassedAt',
  LAST_SUGGESTED_SCORE: 'LastSuggestedScore',
};

test('every LEDGER index names its header in LEDGER_HEADERS, and every header has an index', () => {
  assert.deepEqual(Object.keys(x.LEDGER).sort(), Object.keys(NAMES).sort());
  for (const [k, h] of Object.entries(NAMES)) assert.equal(x.LEDGER_HEADERS[x.LEDGER[k]], h, k);
  assert.equal(x.LEDGER_COL_COUNT, x.LEDGER_HEADERS.length);
  assert.equal(x.LEDGER_HEADERS[x.LEDGER_BASE_WIDTH - 1], 'AcademicYear', 'the setup-era width ends at AcademicYear');
  assert.deepEqual([...x.LEDGER_LATER_HEADERS], x.LEDGER_HEADERS.slice(x.LEDGER_BASE_WIDTH));
});

test('no script keeps its own copy of the Ledger\'s column indexes', () => {
  const copies = [];
  for (const f of fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.js') && n !== '00_SharedConfig.js')) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    const m = src.match(/^const (L|LD|LD\d+)_(GOOGLE_ID|CONFIG_ID|FILE_ID|STATUS|TEACHER_EMAIL|PERIOD|TERM)\s*=\s*\d+/m);
    if (m) copies.push(f + ': ' + m[0]);
    if (/"AdminFileURL"\s*,\s*"StudentFileURL"/.test(src)) copies.push(f + ': a header list');
  }
  assert.deepEqual(copies, [], 'use 00_SharedConfig.js\'s LEDGER and LEDGER_HEADERS');
});
