'use strict';
// List answers in warm-ups (the operator's decision, 2026-11-01: option B).
// The word-count score gives a correct bare list 0 of 6 (25's
// WORD_COUNT_THRESHOLDS: under 15 words scores 0), so instead of scoring
// lists differently, a warm-up that asks for a list also asks for a reason:
// "List ... Then pick one and explain why." A full answer then reaches the
// word count on its own, and the scoring rule stays the same for every
// warm-up. Pinned here for the lesson anchors (55b, from each lesson's
// "## Warm-up") and for Flow 3's two generation prompts (40, from the spec).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

// An anchor that asks for several things, and an anchor that also asks for
// reasoning about them.
const ASKS_FOR_A_LIST = /\blist\b|\bname (two|three|four|five|as many)\b|\bas many\b/i;
const ASKS_FOR_A_REASON = /\bwhy\b|\bexplain\b|whose fault|which would go down|what would go wrong/i;

test('every warm-up anchor that asks for a list also asks for a reason', () => {
  const { LESSON_ASSIGNMENTS } = loadGasFiles([S('55b_LessonAssignmentData.js')], ['LESSON_ASSIGNMENTS']).exported;
  const lists = Object.keys(LESSON_ASSIGNMENTS).filter((k) => ASKS_FOR_A_LIST.test(LESSON_ASSIGNMENTS[k].warmupAnchor || ''));
  assert.ok(lists.length >= 9, 'the list-style anchors are still found (' + lists.length + ')');
  const bare = lists.filter((k) => !ASKS_FOR_A_REASON.test(LESSON_ASSIGNMENTS[k].warmupAnchor));
  assert.deepEqual(bare, [], 'list anchors with no reason asked: ' + bare.join(', '));
});

test('Flow 3 keeps a list anchor\'s reason (Mode A) and asks for one with any list it writes (Mode B)', () => {
  const p = loadGasFiles([S('40_FlowPrompts.js')], ['FLOW_3_PROMPT_MODE_A', 'FLOW_3_PROMPT_MODE_B']).exported;
  assert.match(p.FLOW_3_PROMPT_MODE_A, /If the anchor asks for a list and then asks the student to pick one and explain why, keep both parts\./);
  assert.match(p.FLOW_3_PROMPT_MODE_B, /If it asks for several things \(ways, reasons, examples\), it also asks which one matters most and why/);
});
