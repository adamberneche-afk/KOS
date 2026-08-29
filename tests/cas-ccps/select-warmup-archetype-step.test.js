'use strict';
// Regression tests for cas-ccps/studio-steps/SelectWarmUpArchetypeStep.gs —
// Flow 3's pre-processing step: archetype selection + Mode A/B + prompt
// variable formatting.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles, makeStudioEvent } = require('../harness/gas-sandbox');

const SHARED_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'StepsShared.gs');
const STEP_PATH = path.join(__dirname, '..', '..', 'cas-ccps', 'studio-steps', 'SelectWarmUpArchetypeStep.gs');

function load(exposeNames) {
  return loadGasFiles([SHARED_PATH, STEP_PATH], exposeNames);
}

function makeArchetypeEvent(lesson, profile) {
  return makeStudioEvent({
    lessonContextSnapshotJson: JSON.stringify(lesson),
    studentProfileSnapshotJson: JSON.stringify(profile),
  });
}

const BASE_LESSON = { course_name: 'Sports Marketing', objective: 'obj', activity: 'act', vocabulary: 'voc', prior_connection: 'prior' };

test('onSelectWarmUpArchetypeExecute: shadow matrix cross_confidence >= 0.75 overrides the decision table', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const lesson = { ...BASE_LESSON };
  const profile = {
    student_name: 'Alice Smith',
    unit_current: 'unit-1',
    shadow_matrix: { 'unit-1': { cross_confidence: 0.9, best_archetype: 'PROVOCATION' } },
    // Decision-table signals that would otherwise select something else entirely.
    avg_engagement_score: 0,
    competency_gaps: ['x'],
  };
  const result = exported.onSelectWarmUpArchetypeExecute(makeArchetypeEvent(lesson, profile));
  assert.equal(result.variables.selectionStatus.stringValues[0], 'OK');
  assert.equal(result.variables.archetype.stringValues[0], 'PROVOCATION');
  assert.equal(result.variables.firstName.stringValues[0], 'Alice');
});

test('onSelectWarmUpArchetypeExecute: within_confidence < 0.3 (early-unit) forces BRIDGE regardless of cross_confidence', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const lesson = { ...BASE_LESSON };
  const profile = {
    student_name: 'Bob',
    unit_current: 'unit-1',
    // cross_confidence deliberately below its own threshold so this test
    // isolates the within_confidence override, not the cross_confidence one.
    shadow_matrix: { 'unit-1': { cross_confidence: 0.1, within_confidence: 0.1, best_archetype: 'PARADOX' } },
  };
  const result = exported.onSelectWarmUpArchetypeExecute(makeArchetypeEvent(lesson, profile));
  assert.equal(result.variables.archetype.stringValues[0], 'BRIDGE');
});

test('onSelectWarmUpArchetypeExecute: decision table -- high engagement + extra credit + no persistent gap -> PROVOCATION', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const lesson = { ...BASE_LESSON };
  const profile = {
    student_name: 'Cara',
    avg_engagement_score: 2.5,
    extra_credit_count: 1,
    evaluation_signals: [{ date: '2026-01-01', indicators: { strengths: [], gaps: [] } }],
  };
  const result = exported.onSelectWarmUpArchetypeExecute(makeArchetypeEvent(lesson, profile));
  assert.equal(result.variables.archetype.stringValues[0], 'PROVOCATION');
});

test('onSelectWarmUpArchetypeExecute: decision table -- a gap tag recurring in 2+ signals blocks PROVOCATION (persistent gap)', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const lesson = { ...BASE_LESSON };
  const profile = {
    student_name: 'Dana',
    avg_engagement_score: 2.5,
    extra_credit_count: 1,
    competency_gaps: ['g1'],
    evaluation_signals: [
      { date: '2026-01-01', indicators: { strengths: [], gaps: ['analysis'] } },
      { date: '2026-01-08', indicators: { strengths: [], gaps: ['analysis'] } },
    ],
  };
  const result = exported.onSelectWarmUpArchetypeExecute(makeArchetypeEvent(lesson, profile));
  // PROVOCATION is blocked (persistent gap); falls through to BRIDGE
  // since competency_gaps is non-empty.
  assert.equal(result.variables.archetype.stringValues[0], 'BRIDGE');
});

test('onSelectWarmUpArchetypeExecute: brand-new student (no signals, no gaps) falls back to PARADOX per the fixed fallback order', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const lesson = { ...BASE_LESSON };
  const profile = { student_name: 'Evan', competency_gaps: [], evaluation_signals: [] };
  const result = exported.onSelectWarmUpArchetypeExecute(makeArchetypeEvent(lesson, profile));
  assert.equal(result.variables.archetype.stringValues[0], 'PARADOX');
});

test('onSelectWarmUpArchetypeExecute: warmup_anchor present -> Mode A; absent -> Mode B', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const withAnchor = exported.onSelectWarmUpArchetypeExecute(
    makeArchetypeEvent({ ...BASE_LESSON, warmup_anchor: 'anchor text' }, { student_name: 'Fay' })
  );
  assert.equal(withAnchor.variables.mode.stringValues[0], 'A');
  assert.equal(withAnchor.variables.warmupAnchor.stringValues[0], 'anchor text');

  const noAnchor = exported.onSelectWarmUpArchetypeExecute(
    makeArchetypeEvent({ ...BASE_LESSON }, { student_name: 'Gus' })
  );
  assert.equal(noAnchor.variables.mode.stringValues[0], 'B');
});

test('onSelectWarmUpArchetypeExecute: malformed lesson snapshot -> LESSON_SNAPSHOT_PARSE_FAILED, all fields empty', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const event = makeStudioEvent({ lessonContextSnapshotJson: 'not json', studentProfileSnapshotJson: '{}' });
  const result = exported.onSelectWarmUpArchetypeExecute(event);
  assert.equal(result.variables.selectionStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
  assert.equal(result.variables.archetype.stringValues[0], '');
});

test('onSelectWarmUpArchetypeExecute: malformed profile snapshot -> PROFILE_SNAPSHOT_PARSE_FAILED', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const event = makeStudioEvent({ lessonContextSnapshotJson: '{}', studentProfileSnapshotJson: 'not json' });
  const result = exported.onSelectWarmUpArchetypeExecute(event);
  assert.equal(result.variables.selectionStatus.stringValues[0], 'PROFILE_SNAPSHOT_PARSE_FAILED');
});

test('onSelectWarmUpArchetypeExecute: an unmapped input never throws uncaught (fails closed)', () => {
  const { exported } = load(['onSelectWarmUpArchetypeExecute']);
  const event = makeStudioEvent({ lessonContextSnapshotJson: null, studentProfileSnapshotJson: null });
  const result = exported.onSelectWarmUpArchetypeExecute(event);
  // Both inputs default to "" via inStr_, and "" fails JSON.parse.
  assert.equal(result.variables.selectionStatus.stringValues[0], 'LESSON_SNAPSHOT_PARSE_FAILED');
});
