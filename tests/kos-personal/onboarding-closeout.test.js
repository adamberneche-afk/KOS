'use strict';
// The 21-day onboarding had no end state: _advanceOnboardingDay() stops
// the counter at the cap, so the primer read "Onboarding Day 21 of 21"
// indefinitely. closeOutOnboarding() (5_Error_And_Utilities.gs) records
// the close; the primer, the session-context block and the web app read
// it through _onboardingStatusLine_().

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];

function load(props) {
  const loaded = loadGasFiles(FILES,
    ['previewOnboardingCloseOut', 'closeOutOnboarding', '_onboardingStatusLine_', 'CFG']);
  const { exported, sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const p = sandbox.PropertiesService.getScriptProperties();
  p.setProperty('INDEX_ID', ss.getId());
  Object.entries(props || {}).forEach(([k, v]) => p.setProperty(k, v));
  return Object.assign({ ss, props: p }, loaded);
}

const ARMED_DAY_21 = {
  CORE_THESIS_VERIFIED: 'true',
  KOS_ONBOARDING_DAY: '21',
  KOS_ONBOARDING_START: '2026-09-14T12:00:00.000Z',
};

function trackerRows(ss) {
  const t = ss.getSheetByName('ONBOARDING_TRACKER');
  return t ? t.getDataRange().getValues().slice(1) : []; // below the header
}

test('the preview changes nothing; the close-out records the date and a tracker row', () => {
  const { exported, ss, props } = load(ARMED_DAY_21);
  const preview = exported.previewOnboardingCloseOut();
  assert.equal(preview.ok, true);
  assert.equal(preview.changed, false);
  assert.match(preview.message, /^PREVIEW/);
  assert.equal(props.getProperty('KOS_ONBOARDING_CLOSED'), null);
  assert.equal(trackerRows(ss).length, 0);

  const r = exported.closeOutOnboarding();
  assert.equal(r.changed, true);
  const closed = props.getProperty('KOS_ONBOARDING_CLOSED');
  assert.match(closed, /^\d{4}-\d{2}-\d{2}$/);
  const rows = trackerRows(ss);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 21);
  assert.equal(rows[0][2], 'ONBOARDING_CLOSED');
  assert.match(rows[0][3], /started 2026-09-14/);
  assert.equal(exported._onboardingStatusLine_(props), 'Onboarding: complete (closed ' + closed + ')');
});

test('a second close-out reports the existing date and writes nothing', () => {
  const { exported, ss, props } = load(Object.assign({ KOS_ONBOARDING_CLOSED: '2026-10-13' }, ARMED_DAY_21));
  const r = exported.closeOutOnboarding();
  assert.equal(r.ok, true);
  assert.equal(r.changed, false);
  assert.match(r.message, /already closed on 2026-10-13/);
  assert.equal(props.getProperty('KOS_ONBOARDING_CLOSED'), '2026-10-13');
  assert.equal(trackerRows(ss).length, 0);
});

test('refuses before day 21 and when the engine is cold', () => {
  const early = load(Object.assign({}, ARMED_DAY_21, { KOS_ONBOARDING_DAY: '12' }));
  const r1 = early.exported.closeOutOnboarding();
  assert.equal(r1.ok, false);
  assert.match(r1.message, /day 12 of 21/);
  assert.equal(early.props.getProperty('KOS_ONBOARDING_CLOSED'), null);

  const cold = load({ KOS_ONBOARDING_DAY: '21' });
  const r2 = cold.exported.closeOutOnboarding();
  assert.equal(r2.ok, false);
  assert.match(r2.message, /not armed/);
});

test('the status line reads the day count until the close-out', () => {
  const { exported, props } = load(ARMED_DAY_21);
  assert.equal(exported._onboardingStatusLine_(props), 'Onboarding Day 21 of 21');
});
