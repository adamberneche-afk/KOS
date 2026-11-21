'use strict';
// gas-lint's second-copy check (CLAUDE.md "Keeping debt down", 2026-11-21):
// a function body of 5+ lines, identical but for comments and whitespace, in
// two files of one system is an error unless second-copy-allow.json names the
// pair with why.

const test = require('node:test');
const assert = require('node:assert/strict');
const { findSecondCopies } = require('../../tools/gas-lint/check.js');
const allow = require('../../tools/gas-lint/second-copy-allow.json');

const BODY = (name, comment) => `function ${name}(ss, name, headers) {\n  ${comment || ''}\n  let sheet = ss.getSheetByName(name);\n  if (!sheet) {\n    sheet = ss.insertSheet(name);\n  }\n  return sheet;\n}\n`;

test('the same body under two names in two files is one group', () => {
  const groups = findSecondCopies([
    { file: 'a/71.js', code: BODY('_turnInSheet_', '// the tabs') },
    { file: 'a/72.js', code: BODY('_ticTab_') },
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].map((x) => x.name).sort(), ['_ticTab_', '_turnInSheet_']);
});

test('a short body, a body that differs, or two copies in one file are not reported', () => {
  assert.deepEqual(findSecondCopies([
    { file: 'a.js', code: 'function f() {\n  return 1;\n}\n' },
    { file: 'b.js', code: 'function g() {\n  return 1;\n}\n' },
  ]), []);
  assert.deepEqual(findSecondCopies([
    { file: 'a.js', code: BODY('f') },
    { file: 'b.js', code: BODY('g').replace('insertSheet', 'insertSheetAt') },
  ]), []);
  assert.deepEqual(findSecondCopies([{ file: 'a.js', code: BODY('f') + BODY('g') }]), []);
});

test('a string that differs is a different body (strings are compared, comments are not)', () => {
  assert.deepEqual(findSecondCopies([
    { file: 'a.js', code: BODY('f').replace('getSheetByName(name)', 'getSheetByName("A")') },
    { file: 'b.js', code: BODY('g').replace('getSheetByName(name)', 'getSheetByName("B")') },
  ]), []);
});

test('every allowed pair says why', () => {
  allow.allow.forEach((a) => {
    assert.ok(a.copies.length >= 2, JSON.stringify(a));
    assert.ok(String(a.why || '').length > 30, a.copies.join(' & '));
  });
});
