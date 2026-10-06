'use strict';
// leader-hub/src/10-command-engine-ai-and-widgets.html retires last spring's
// built-in sample deadlines (Synergy 2-week updates, a field-trip form, WBL,
// SBE and E-Sports dates). On a saved list they sat at the top of the
// dashboard as "198d OVERDUE" (seen live 2026-10-06).
//
// Pins: a saved copy is dropped only while it keeps its original date, so a
// deadline the operator re-dated survives; PLC meetings and everything else
// are untouched; and the retired dates are all in the past school year.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractLines } = require('../harness/extract-lines');
const { runInSandbox } = require('../harness/vm-run');

const F10 = path.join(__dirname, '..', '..', 'leader-hub', 'src', '10-command-engine-ai-and-widgets.html');

function load() {
  const lines = fs.readFileSync(F10, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('const RETIRED_DEFAULT_DEADLINES')) + 1;
  // findIndex is 0-based, so it is the 1-based number of the line before `let DEADLINES`.
  const end = lines.findIndex((l, i) => i >= start && l.startsWith('let DEADLINES'));
  const src = extractLines(F10, start, end, ['const RETIRED_DEFAULT_DEADLINES', 'function dropRetiredDefaultDeadlines(']);
  return runInSandbox(src, {}, ['RETIRED_DEFAULT_DEADLINES', 'dropRetiredDefaultDeadlines']);
}

test('drops a retired built-in that still has its original date, and nothing else', () => {
  const { dropRetiredDefaultDeadlines } = load();
  const saved = [
    { id: 'dl_syn1', date: '2026-03-21' },
    { id: 'dl_syn2', date: '2026-04-04' },
    { id: 'dl5', date: '2026-04-22' },
    { id: 'dl_syn3', date: '2026-10-17' },          // re-dated by the operator: kept
    { id: 'dl_plc_mar', date: '2026-03-19' },       // attendance record: kept
    { id: 'cal_q1_end', date: '2026-10-30' },
    { id: 'deca_icdc', date: '2027-04-17' },
    { id: 'u_123', date: '2026-04-04' },            // hand-entered: kept
  ];
  assert.deepEqual(dropRetiredDefaultDeadlines(saved).map((d) => d.id),
    ['dl_syn3', 'dl_plc_mar', 'cal_q1_end', 'deca_icdc', 'u_123']);
  assert.deepEqual(dropRetiredDefaultDeadlines(null), []);
  assert.deepEqual(dropRetiredDefaultDeadlines([null, { id: 'x' }]).map((d) => d && d.id), [null, 'x'],
    'an entry it doesn\'t recognize is left alone');
});

test('every retired date belongs to the 2025-26 school year', () => {
  const { RETIRED_DEFAULT_DEADLINES } = load();
  Object.values(RETIRED_DEFAULT_DEADLINES).forEach((d) => assert.ok(d >= '2025-08-01' && d < '2026-07-01', d));
});

test('the built-in list no longer seeds a retired deadline', () => {
  const src = fs.readFileSync(F10, 'utf8');
  const literal = src.slice(src.indexOf("let DEADLINES = LS.get('lh_deadlines', ["), src.indexOf('function daysUntil('));
  ['dl_syn1', 'dl_syn4', "id:'dl5'", "id:'dl2'", "id:'dl3'", "id:'dl4'"].forEach((id) =>
    assert.ok(!literal.includes(id.startsWith('id:') ? id : "id:'" + id + "'"), id + ' is still a default'));
});
