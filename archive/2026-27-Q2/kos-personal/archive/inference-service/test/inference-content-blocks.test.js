'use strict';
// Regression test for extractTextOutput (src/inference.js).
//
// WHY THIS EXISTS: runInference() used to read the model's output as
// `response.content[0]?.text`. The Messages API returns `content` as a
// list of TYPED blocks, and index 0 is only the text block when nothing
// else precedes it. Thinking blocks do precede it — and on the default
// model here (claude-opus-5) thinking is on by default, with
// `display: "omitted"` meaning those blocks carry empty text rather than
// being absent. So index 0 was the thinking block, rawOutput became '',
// and the JSON.parse in runInference() failed as "Model produced invalid
// JSON" on every call. The service never noticed because
// CFG.INFERENCE_MODE defaults to STUDIO and nothing reaches this path.
//
// These cases pin the shape of the fix, not just its happy path: the
// thinking-first ordering that caused the bug, the multi-block responses
// that make "take the first text block" wrong too, and the degenerate
// inputs that must return '' instead of throwing inside an error path.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'sk-ant-test-not-used';

const { extractTextOutput } = require(path.join(__dirname, '..', 'src', 'inference.js'));

test('extractTextOutput: plain single text block', () => {
  assert.equal(extractTextOutput([{ type: 'text', text: '{"a":1}' }]), '{"a":1}');
});

test('extractTextOutput: thinking block FIRST — the exact shape that broke index 0', () => {
  const content = [
    { type: 'thinking', thinking: '' },      // display:"omitted" => empty text
    { type: 'text', text: '{"session_uid":"LOG-1"}' },
  ];
  assert.equal(extractTextOutput(content), '{"session_uid":"LOG-1"}');
  // The old expression, spelled out, to show what it actually returned:
  assert.equal(content[0].text, undefined, 'index 0 is the thinking block, and has no .text');
});

test('extractTextOutput: a summarized thinking block is still not mistaken for output', () => {
  const content = [
    { type: 'thinking', thinking: 'Let me work through the session...' },
    { type: 'text', text: '{"ok":true}' },
  ];
  assert.equal(extractTextOutput(content), '{"ok":true}');
});

test('extractTextOutput: joins several text blocks rather than truncating to the first', () => {
  // Interleaved thinking (and citations) can split one logical answer
  // across several text blocks. Taking only the first hands JSON.parse a
  // fragment, which fails in exactly the same confusing way as the
  // original bug.
  const content = [
    { type: 'thinking', thinking: '' },
    { type: 'text', text: '{"session_uid":"LOG-1",' },
    { type: 'thinking', thinking: '' },
    { type: 'text', text: '"session_summary":"done"}' },
  ];
  const out = extractTextOutput(content);
  assert.equal(out, '{"session_uid":"LOG-1","session_summary":"done"}');
  assert.doesNotThrow(() => JSON.parse(out), 'the joined output must still parse');
});

test('extractTextOutput: ignores tool_use and other non-text block types', () => {
  const content = [
    { type: 'tool_use', id: 't1', name: 'x', input: {} },
    { type: 'text', text: 'real output' },
  ];
  assert.equal(extractTextOutput(content), 'real output');
});

test('extractTextOutput: a text block with no text contributes nothing, does not throw', () => {
  assert.equal(extractTextOutput([{ type: 'text' }]), '');
});

test('extractTextOutput: thinking-only response yields empty string, not a crash', () => {
  // A refusal or a max_tokens cut can leave no text block at all. The
  // caller turns '' into its own "invalid JSON" error, which is correct —
  // what matters is that this does not throw first.
  assert.equal(extractTextOutput([{ type: 'thinking', thinking: '' }]), '');
});

test('extractTextOutput: degenerate inputs return empty string', () => {
  for (const bad of [undefined, null, '', 'a string', 42, {}]) {
    assert.equal(extractTextOutput(bad), '', `input ${JSON.stringify(bad)}`);
  }
  assert.equal(extractTextOutput([null, undefined, { type: 'text', text: 'x' }]), 'x',
    'a null entry inside the list must not throw');
});
