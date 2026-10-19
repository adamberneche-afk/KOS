'use strict';
// SMP-019 (decision #3, 2026-10-19): the moral debt counter. +1 per PROCEED
// in a log's CLOSEOUT Alignment block, halving every 7 days; the primer
// states it, and says when MUSE is due (3.0 unless changed).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '23_MoralDebt.gs'].map((f) => path.join(KP, f));

function load() {
  const env = loadGasFiles(FILES, ['_countProceeds_', 'recordMoralDebt_', 'moralDebtValue_', 'moralDebtLine_']);
  return Object.assign(env, { props: env.sandbox.PropertiesService.getScriptProperties() });
}

const log = (pauses) => [
  'KOS SESSION LOG — 2026-10-19 — topic', '',
  '[🧠 RTP — EXCHANGE 1]', 'OPERATOR: should we PROCEED with the build?', 'RTP: A) PROCEED B) REDESIGN C) DEFER',
  'DECISION: none', '',
  '[🧠 RTP — CLOSEOUT]', 'Decisions made:', '- none', 'Next steps:', '- PROCEED to the build (owner: operator)',
  'Alignment:', '- Status at close: YELLOW', '- Thresholds crossed:', ...pauses,
  '- Relational check-in this session: no',
].join('\n');

test('only PROCEED answers in the closeout\'s Alignment block count', () => {
  const { exported } = load();
  assert.equal(exported._countProceeds_(log(['  - A: PROCEED — evening build', '  - C: REDESIGN — solo plan',
    '  - B: PROCEED — third systems session'])), 2);
  assert.equal(exported._countProceeds_(log(['  none'])), 0);
  assert.equal(exported._countProceeds_('no closeout here PROCEED'), 0);
});

test('the counter halves every 7 days: overrides on days 0, 3 and 6 total about 2.3', () => {
  const { exported, props } = load();
  const day = (n) => new Date(Date.UTC(2026, 9, 19 + n, 12));
  [0, 3, 6].forEach((d) => exported.recordMoralDebt_(log(['  - A: PROCEED — x']), day(d)));
  assert.equal(exported.moralDebtValue_(props, day(6)).toFixed(1), '2.3');
  // A week later, half.
  assert.ok(Math.abs(exported.moralDebtValue_(props, day(13)) * 2 - exported.moralDebtValue_(props, day(6))) < 1e-9);
  assert.match(exported.moralDebtLine_(props, day(6)), /^Moral debt: 2\.3 \(MUSE suggests alternatives at 3\.0\)/);
});

test('at the threshold the primer says MUSE is due; the threshold is adjustable', () => {
  const { exported, props } = load();
  const now = new Date(Date.UTC(2026, 9, 19, 12));
  exported.recordMoralDebt_(log(['  - A: PROCEED — x', '  - B: PROCEED — y', '  - D: PROCEED — z']), now);
  assert.match(exported.moralDebtLine_(props, now), /^Moral debt: 3\.0 \(at or above 3\.0: MUSE suggests alternatives/);
  props.setProperty('MORAL_DEBT_MUSE_AT', '4');
  assert.match(exported.moralDebtLine_(props, now), /MUSE suggests alternatives at 4\.0\)/);
});
