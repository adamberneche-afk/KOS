'use strict';
// Regression test for the date-coercion bug cas-ccps/README.md's changelog
// calls out directly: "LessonContext's lesson_date column was silently
// getting [Sheets-coerced to a real Date]" — a String() cast on a coerced
// Date cell produces a non-"YYYY-MM-DD" string that never matches the
// plain "YYYY-MM-DD" strings written elsewhere, silently and permanently
// breaking every lookup keyed on that column.
//
// _normalizeLessonDateCell_ (22_LessonContextHandler.js) is the fix, and
// it's exactly the function 25_WarmUpWriter.js's own comments point to as
// "the one remaining raw String() cast on a lesson_date cell in the
// pipeline" before this existed — this pins that fix down at its actual
// source so it can never silently regress again.
//
// Loaded together with 23_StudentProfileManager.js because
// _normalizeLessonDateCell_ calls formatDateYMD_(), which lives there —
// both files are bound to the same GAS project (cas-ccps:central-ledger,
// see tools/gas-lint/project-map.json), so this mirrors how the real
// project actually runs.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LESSON_CONTEXT_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '22_LessonContextHandler.js');
const STUDENT_PROFILE_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', '23_StudentProfileManager.js');

function load() {
  return loadGasFiles(
    [STUDENT_PROFILE_PATH, LESSON_CONTEXT_PATH],
    ['_normalizeLessonDateCell_'],
  );
}

test('_normalizeLessonDateCell_: a real Date cell (Sheets coercion) normalizes to YYYY-MM-DD', () => {
  const { exported, sandbox } = load();
  // Must be the vm context's OWN Date constructor, not this test file's —
  // `value instanceof Date` inside the sandbox checks against the
  // sandbox's own Date global, which is a different realm than a Date
  // built in this file. A cross-realm Date would fail that check and
  // silently fall through to the buggy String() path this test exists to
  // catch, passing for the wrong reason.
  const d = new sandbox.Date(2026, 2, 5); // March 5, 2026 (local) — month is 0-based
  assert.equal(exported._normalizeLessonDateCell_(d), '2026-03-05');
});

test('_normalizeLessonDateCell_: a plain "YYYY-MM-DD" string cell passes through unchanged', () => {
  const { exported } = load();
  assert.equal(exported._normalizeLessonDateCell_('2026-03-05'), '2026-03-05');
});

test('_normalizeLessonDateCell_: a Date cell and the matching plain-string cell normalize IDENTICALLY', () => {
  const { exported, sandbox } = load();
  // This is the actual bug: before the fix, a bare String(dateCell) call
  // produced something like "Thu Mar 05 2026 00:00:00 GMT-...", which never
  // equals the "2026-03-05" string written by another code path for the
  // same calendar date — breaking every lookup that compares the two.
  const coerced = exported._normalizeLessonDateCell_(new sandbox.Date(2026, 2, 5));
  const plain = exported._normalizeLessonDateCell_('2026-03-05');
  assert.equal(coerced, plain);
});

test('_normalizeLessonDateCell_: single-digit month/day are zero-padded', () => {
  const { exported, sandbox } = load();
  const d = new sandbox.Date(2026, 0, 7); // January 7, 2026
  assert.equal(exported._normalizeLessonDateCell_(d), '2026-01-07');
});

test('_normalizeLessonDateCell_: blank/undefined cell normalizes to an empty string, not "undefined"', () => {
  const { exported } = load();
  assert.equal(exported._normalizeLessonDateCell_(''), '');
  assert.equal(exported._normalizeLessonDateCell_(undefined), '');
  assert.equal(exported._normalizeLessonDateCell_(null), '');
});
