'use strict';
// Regression tests for gas-lint's Check O (no `typeof fn === "function"`
// guard for a function the file's own projects declare, rule 12) and for
// the two helpers that quiet Check F's false positives: callback
// parameters and names a file guards on purpose.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findSameProjectTypeofGuards,
  fileParamNames,
  typeofGuardedNames,
  stripCommentsAndStrings,
} = require('../../tools/gas-lint/check.js');

const P31 = 'cas-ccps/scripts/31_PacingGuideManager.js';
const P55 = 'cas-ccps/scripts/55_LessonSchedule.js';

test('Check O: a guard is an error when every project holding the file declares the function', () => {
  const found = findSameProjectTypeofGuards({ ledger: { files: [P31, P55] } });
  assert.deepEqual(found.map(g => g.name).sort(), ['plannedWarmUpUnit_', 'scheduledLessonUnit_']);
});

test('Check O: a guard is allowed when some project holding the file lacks the function', () => {
  // 31 is in the Teacher Dashboard without 55: the guard is what keeps it working there.
  const found = findSameProjectTypeofGuards({ ledger: { files: [P31, P55] }, dashboard: { files: [P31] } });
  assert.deepEqual(found, []);
});

test('Check O: the real project map has no guard left to remove', () => {
  const map = require('../../tools/gas-lint/project-map.json');
  assert.deepEqual(findSameProjectTypeofGuards(map), []);
});

test('fileParamNames: function, arrow and bare-arrow parameters, with defaults and rest', () => {
  const src = stripCommentsAndStrings([
    'function setup(name, validateFn) { validateFn(name); }',
    'const tryInstall = (label, fn = null, ...rest) => { fn(); };',
    'list.map(keyFn => keyFn(1));',
  ].join('\n'));
  const names = fileParamNames(src);
  for (const n of ['name', 'validateFn', 'label', 'fn', 'rest', 'keyFn']) assert.ok(names.has(n), n);
  assert.ok(!names.has('setup'), 'a function name is not a parameter');
});

test('typeofGuardedNames reads the guard from the raw source, either quote', () => {
  const names = typeofGuardedNames('if (typeof a_ === "function") a_();\nconst b = typeof b_ == \'function\';');
  assert.deepEqual([...names].sort(), ['a_', 'b_']);
});
