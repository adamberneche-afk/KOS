'use strict';
// Regression tests for cas-ccps/scripts/41_WarmUpFlowBridge.js — the port
// that takes Flows 3, 4 and 5 off the five blocked custom Studio steps.
//
// WHAT THESE ARE ACTUALLY GUARDING. Three of the five steps were duplicating
// Apps Script that already existed in this project, so the port reuses it
// rather than copying it. The two substantial ports —
// SelectWarmUpArchetypeStep's decision logic and CreateWarmUpDocStep's
// document construction — both carry choices that look arbitrary and are not,
// and a plausible "cleanup" of any of them changes what a student receives or
// silently breaks the next flow:
//
//   1. The archetype EVALUATION ORDER is PROVOCATION → PARADOX → CONCRETE
//      SCENARIO → BRIDGE, which is NOT the order the spec's decision table
//      lists them in. The spec states the evaluation order separately, in
//      prose, and that is the one that governs.
//   2. "No persistent gaps" means no single gap tag recurs across 2+ of the
//      evaluation_signals entries — an interpretive reading the original step
//      flagged as its own.
//   3. The Zone 1/2 marker strings are load-bearing, not formatting.
//      evaluateWarmUpDoc_() locates the prompt and the response by searching
//      for them, so Flow 4 reads an empty response the moment one changes.
//
// The tests below therefore pin behaviour, not implementation: same inputs,
// same archetype, same markers.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = [
  path.join(CC, '00_SharedConfig.js'),
  path.join(CC, '25_WarmUpWriter.js'),
  path.join(CC, '41_WarmUpFlowBridge.js'),
];

const EXPOSE = [
  'wfbSelectArchetype_', 'wfbBuildFlow3Fields_', 'wfbNormalizeArchetypeName_',
  'wfbUnionIndicatorTags_', 'wfbHasPersistentGap_', 'wfbFormatCompetencyTexts_',
  'wfbFormatList_', 'wfbFormatEvaluationSignals_', 'wfbStripFence_',
  'wfbNormalizeDateIso_', 'wfbFormatReadableDate_',
  'WFB_ARCHETYPES', 'WFB_TRIGGER_STATUS', 'WFB_PROFILE_SNAP', 'WFB_RET',
  'WFB_RETURN_HEADERS', 'WFB_FLOW3_HEADERS', 'WFB_FLOW4_HEADERS', 'WFB_FLOW5_HEADERS',
  'WFB_INPUT_TABS',
  'RESPONSE_ZONE_MARKER', 'WQ25_COL_COUNT', 'WQ25_QUEUE_ID', 'WQ25_STATUS',
  'WQ25_LESSON_CTX_SNAP', 'WQ25_BRIDGE_OUTPUT',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// ── Archetype selection ──────────────────────────────────────────────────────

test('a high-confidence shadow-matrix entry overrides the decision table', () => {
  const { exported } = load();
  const archetype = exported.wfbSelectArchetype_({}, {
    unit_current: 'U1',
    shadow_matrix: { U1: { cross_confidence: 0.9, best_archetype: 'PARADOX' } },
    // Decision-table inputs that would otherwise pick PROVOCATION — the
    // override has to win, or the shadow matrix is decorative.
    avg_engagement_score: 3, extra_credit_count: 2, evaluation_signals: [],
  });
  assert.equal(archetype, 'PARADOX');
});

test('the override threshold is a floor, not a ceiling', () => {
  const { exported } = load();
  const at = (c) => exported.wfbSelectArchetype_({}, {
    unit_current: 'U1',
    shadow_matrix: { U1: { cross_confidence: c, best_archetype: 'PARADOX' } },
    competency_gaps: ['g1'],
  });
  assert.equal(at(0.75), 'PARADOX', '0.75 exactly must override');
  assert.equal(at(0.74), 'BRIDGE', 'below it, the decision table decides');
});

test('a free-text shadow archetype is normalized, spaces and casing included', () => {
  const { exported } = load();
  const n = exported.wfbNormalizeArchetypeName_;
  // 23_StudentProfileManager.js writes this as free text, and the HTML spec's
  // prose spells it "CONCRETE SCENARIO" with a space.
  assert.equal(n('concrete scenario'), 'CONCRETE_SCENARIO');
  assert.equal(n('CONCRETE'), 'CONCRETE_SCENARIO');
  assert.equal(n('paradox'), 'PARADOX');
  assert.equal(n('PROVOCATION'), 'PROVOCATION');
  assert.equal(n('something new'), 'BRIDGE', 'an unrecognized value falls back to BRIDGE');
});

test('a low within-unit confidence forces BRIDGE (early in a unit)', () => {
  const { exported } = load();
  assert.equal(exported.wfbSelectArchetype_({}, {
    unit_current: 'U1',
    shadow_matrix: { U1: { within_confidence: 0.2 } },
    avg_engagement_score: 3, extra_credit_count: 5, evaluation_signals: [],
  }), 'BRIDGE');
});

test('PROVOCATION is evaluated FIRST, ahead of the table listing order', () => {
  const { exported } = load();
  // Engaged, has extra credit, no gap recurring across entries. This student
  // also satisfies the PARADOX row, so a reordering of the checks would
  // return PARADOX and quietly change what they receive.
  const archetype = exported.wfbSelectArchetype_({}, {
    avg_engagement_score: 3,
    extra_credit_count: 1,
    evaluation_signals: [
      { indicators: { strengths: ['analysis'], gaps: ['application'] } },
      { indicators: { strengths: ['critical_thinking'], gaps: ['recall'] } },
    ],
  });
  assert.equal(archetype, 'PROVOCATION');
});

test('a persistent gap disqualifies PROVOCATION and PARADOX takes over', () => {
  const { exported } = load();
  // Same student, except 'application' now recurs across two entries.
  const archetype = exported.wfbSelectArchetype_({}, {
    avg_engagement_score: 3,
    extra_credit_count: 1,
    evaluation_signals: [
      { indicators: { strengths: ['analysis'], gaps: ['application'] } },
      { indicators: { strengths: ['critical_thinking'], gaps: ['application'] } },
    ],
  });
  assert.equal(archetype, 'PARADOX');
});

test('"persistent" means recurring across entries, not repeated within one', () => {
  const { exported } = load();
  const h = exported.wfbHasPersistentGap_;
  assert.equal(h([{ indicators: { gaps: ['application', 'application'] } }]), true,
    'two occurrences count even inside one entry — the counter is per tag, not per entry');
  assert.equal(h([
    { indicators: { gaps: ['application'] } },
    { indicators: { gaps: ['recall'] } },
  ]), false, 'two different tags in two entries is not persistence');
  assert.equal(h([]), false);
});

test('CONCRETE SCENARIO needs the mirror-image signal profile of PARADOX', () => {
  const { exported } = load();
  assert.equal(exported.wfbSelectArchetype_({}, {
    avg_engagement_score: 2.0, // below PARADOX's 2.5, above this row's 1.5
    evaluation_signals: [{ indicators: { strengths: ['application'], gaps: ['analysis'] } }],
  }), 'CONCRETE_SCENARIO');
});

test('any remaining competency gap falls to BRIDGE', () => {
  const { exported } = load();
  assert.equal(exported.wfbSelectArchetype_({}, {
    avg_engagement_score: 0, competency_gaps: ['c1', 'c2'], evaluation_signals: [],
  }), 'BRIDGE');
});

test('a brand-new student with no history gets BRIDGE', () => {
  const { exported } = load();
  // The spec states this outcome directly. It arrives via the gaps check,
  // because a new student has every competency technically outstanding.
  assert.equal(exported.wfbSelectArchetype_({}, { competency_gaps: ['c1'] }), 'BRIDGE');
});

test('the fallback tail is reachable and never returns BRIDGE', () => {
  const { exported } = load();
  // No gaps at all AND none of the three conditions matched — the rare case
  // the spec's fallback wording does not quite anticipate, since BRIDGE is
  // excluded by definition once gaps.length === 0.
  assert.equal(exported.wfbSelectArchetype_({}, {
    competency_gaps: [], avg_engagement_score: 0,
    evaluation_signals: [{ indicators: { gaps: ['recall'] } }],
  }), 'CONCRETE_SCENARIO');
  assert.equal(exported.wfbSelectArchetype_({}, {
    competency_gaps: [], avg_engagement_score: 0, evaluation_signals: [],
  }), 'PARADOX');
});

// ── Flow 3 field materialization ─────────────────────────────────────────────

test('Mode A when a warm-up anchor exists, Mode B when it does not', () => {
  const { exported } = load();
  assert.equal(exported.wfbBuildFlow3Fields_({ warmup_anchor: 'text' }, {}).mode, 'A');
  assert.equal(exported.wfbBuildFlow3Fields_({ warmup_anchor: '' }, {}).mode, 'B');
  assert.equal(exported.wfbBuildFlow3Fields_({}, {}).mode, 'B', 'absent is Mode B');
  assert.equal(exported.wfbBuildFlow3Fields_({ warmup_anchor: null }, {}).mode, 'B');
});

test('firstName is the first whitespace-delimited token of the student name', () => {
  const { exported } = load();
  const f = (n) => exported.wfbBuildFlow3Fields_({}, { student_name: n }).firstName;
  assert.equal(f('Ada Lovelace'), 'Ada');
  assert.equal(f('  Ada   Lovelace '), 'Ada');
  assert.equal(f(''), '');
  assert.equal(f(undefined), '');
});

test('totalCompetencies is addressed + gaps, both counted', () => {
  const { exported } = load();
  const fields = exported.wfbBuildFlow3Fields_({}, {
    competencies_addressed: ['a', 'b'], competency_gaps: ['c'],
  });
  assert.equal(fields.competenciesAddressedCount, '2');
  assert.equal(fields.totalCompetencies, '3');
});

test('every materialized field is a string, since the sheet stores literals', () => {
  const { exported } = load();
  const fields = exported.wfbBuildFlow3Fields_(
    { pacing_stage: 3 }, { avg_engagement_score: 2.5, extra_credit_count: 1 });
  Object.keys(fields).forEach((k) => {
    assert.equal(typeof fields[k], 'string', k + ' is ' + typeof fields[k]);
  });
  assert.equal(fields.pacingStage, '3');
  assert.equal(fields.avgEngagementScore, '2.5');
});

test('competency rubrics are preferred over the older texts array', () => {
  const { exported } = load();
  // Both shapes appear in a live snapshot depending on when Script 32's
  // addRubricsToSnapshot_ last succeeded.
  assert.match(exported.wfbFormatCompetencyTexts_({
    competency_rubrics: [{ id: 'R1', text: 'rubric' }],
    competency_texts: [{ id: 'T1', text: 'older' }],
  }), /R1: rubric/);
  assert.match(exported.wfbFormatCompetencyTexts_({
    competency_texts: [{ id: 'T1', text: 'older' }],
  }), /T1: older/);
  assert.equal(exported.wfbFormatCompetencyTexts_({}), '');
});

test('empty lists format as prose, not as an empty string', () => {
  const { exported } = load();
  // These land directly in a prompt, so "None" reads correctly where "" would
  // leave a dangling label.
  assert.equal(exported.wfbFormatList_([]), 'None');
  assert.equal(exported.wfbFormatList_(undefined), 'None');
  assert.equal(exported.wfbFormatList_(['a', 'b']), 'a, b');
  assert.equal(exported.wfbFormatEvaluationSignals_([]), 'No prior evaluation history.');
});

test('evaluation signals format with both indicator lists inline', () => {
  const { exported } = load();
  const out = exported.wfbFormatEvaluationSignals_([
    { date: '2026-01-01', note: 'n', indicators: { strengths: ['s'], gaps: [] } },
  ]);
  assert.match(out, /2026-01-01: n \(strengths: s; gaps: None\)/);
});

// ── Shared helpers ───────────────────────────────────────────────────────────

test('fence stripping survives the shapes Gemini actually returns', () => {
  const { exported } = load();
  const s = exported.wfbStripFence_;
  assert.equal(s('```json\n{"grammar":2}\n```'), '{"grammar":2}');
  assert.equal(s('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(s('{"a":1}'), '{"a":1}');
  assert.equal(s(null), '');
});

test('an unparseable date degrades to the raw string rather than throwing', () => {
  const { exported } = load();
  // A Sheets Date cell's handed-back shape is not guaranteed, and a thrown
  // error here would fail a whole warm-up doc over a formatting detail.
  assert.equal(exported.wfbNormalizeDateIso_('not a date'), 'not a date');
  assert.equal(exported.wfbFormatReadableDate_('not a date'), null);
  assert.equal(exported.wfbNormalizeDateIso_('2026-03-04'), '2026-03-04');
});

// ── Schema and wiring invariants ─────────────────────────────────────────────

test('the profile snapshot column is named, and matches the writer', () => {
  const { exported } = load();
  // 24_WarmUpBridge.js:60 declares WQ24_STUDENT_PROFILE_SNAP = 7 and is the
  // code that writes it. 25_WarmUpWriter.js's WQ25_* constants skip 7, so
  // this port names it rather than computing LESSON_CTX_SNAP + 1.
  assert.equal(exported.WFB_PROFILE_SNAP, 7);
  assert.equal(exported.WQ25_LESSON_CTX_SNAP, 6, 'and it sits right after the lesson snapshot');
});

test('each flow triggers off an EXISTING WarmUpQueue status, not a new one', () => {
  const { exported } = load();
  // The whole reason Scripts 23/24/25 needed no edits. A new intermediate
  // status would have meant touching all three.
  assert.deepEqual(exported.WFB_TRIGGER_STATUS,
    { 3: 'PENDING', 4: 'PENDING_EVAL', 5: 'PENDING_BRIDGE' });
});

test('the return tab is one shape for all three flows', () => {
  const { exported } = load();
  assert.deepEqual(exported.WFB_RETURN_HEADERS,
    ['Timestamp', 'Flow', 'QueueID', 'RawOutput', 'HarvestStatus', 'Attempts', 'Error']);
  // Index constants and header order must agree, or a native "add row" step
  // configured from the headers writes into the wrong cells.
  Object.keys(exported.WFB_RET).forEach((key) => {
    const idx = exported.WFB_RET[key];
    assert.ok(idx >= 0 && idx < exported.WFB_RETURN_HEADERS.length, key + ' out of range');
  });
  assert.equal(exported.WFB_RET.FLOW, 1);
  assert.equal(exported.WFB_RET.QUEUE_ID, 2);
});

test('every input tab starts Timestamp / QueueID / Status', () => {
  const { exported } = load();
  // buildWarmUpFlowInputs' idempotence check reads column 2 for the QueueID
  // and wfbConsumeInputRow_ writes column 3, for every flow, so the three
  // tabs have to agree on that prefix even though the rest differs.
  [exported.WFB_FLOW3_HEADERS, exported.WFB_FLOW4_HEADERS, exported.WFB_FLOW5_HEADERS]
    .forEach((headers) => {
      assert.deepEqual(headers.slice(0, 3), ['Timestamp', 'QueueID', 'Status']);
    });
  assert.deepEqual(exported.WFB_INPUT_TABS, { 3: 'Flow3Input', 4: 'Flow4Input', 5: 'Flow5Input' });
});

test('every input tab ends with PromptText, so the prompt is the last column', () => {
  const { exported } = load();
  // Appended last on purpose, matching 37_FlowInputBuilder.js's FlowInput:
  // appending is safe, inserting shifts every later field silently.
  [exported.WFB_FLOW3_HEADERS, exported.WFB_FLOW4_HEADERS, exported.WFB_FLOW5_HEADERS]
    .forEach((headers) => {
      assert.equal(headers[headers.length - 1], 'PromptText');
    });
});

test('the response-zone marker the doc writes is the one Flow 4 searches for', () => {
  const { exported } = load();
  // Not a style detail: wfbCreateWarmUpDoc_ stamps RESPONSE_ZONE_MARKER and
  // evaluateWarmUpDoc_ finds the student's response by indexOf on it. This
  // asserts they are literally the same constant, not two equal strings that
  // could drift apart.
  assert.equal(exported.RESPONSE_ZONE_MARKER, '── YOUR RESPONSE ──');
});

test('Flow 3 headers cover every field wfbBuildFlow3Fields_ produces', () => {
  const { exported } = load();
  // A field computed but never written is a placeholder that reaches Gemini
  // unfilled. Compared case-insensitively because the headers are TitleCase
  // and the field keys are camelCase.
  const headers = exported.WFB_FLOW3_HEADERS.map((h) => h.toLowerCase());
  Object.keys(exported.wfbBuildFlow3Fields_({}, {})).forEach((key) => {
    assert.ok(headers.indexOf(key.toLowerCase()) !== -1,
      'field "' + key + '" has no column in WFB_FLOW3_HEADERS');
  });
});
