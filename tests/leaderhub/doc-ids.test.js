'use strict';
// The release gate (L1, 2026-11-20): LeaderHub's code holds no Google Doc
// ID. Each lesson plan's doc and the blackout-dates doc come from the
// LeaderHub Data spreadsheet's doc_ids tab (Data.gs lhDocIds_), sent with
// the page; the page fills each plan's docId at load and links the
// blackout doc only when it has one. Made-up IDs only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const { cutDeclarations } = require('../harness/cut-declarations');
const fnSource = (file, name) => cutDeclarations(file, [name]);
const FAKE = 'Fake' + 'DocIdForTests'.repeat(3);

test('lhDocIds_ reads the doc_ids tab as { key: docId }, {} without it', () => {
  const ctx = { LH_DOC_IDS_TAB: 'doc_ids' };
  vm.runInNewContext(fnSource(path.join(LH, 'Data.gs'), 'lhDocIds_') + '\nthis.lhDocIds_ = lhDocIds_;', ctx);
  const sheet = { getLastRow: () => 4, getRange: () => ({ getValues: () => [['lp_8177_01', FAKE], ['blackout_dates', FAKE + 'b'], ['', 'x']] }) };
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.lhDocIds_({ getSheetByName: (n) => (n === 'doc_ids' ? sheet : null) }))),
    { lp_8177_01: FAKE, blackout_dates: FAKE + 'b' });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.lhDocIds_({ getSheetByName: () => null }))), {});
});

test('the page links the blackout doc from the server, or shows the label alone', () => {
  const run = (boot) => {
    const ctx = { LH_BOOT: boot };
    vm.runInNewContext(fnSource(path.join(LH, 'src', '05-data-helpers-dashboard.html'), 'lhDocLink') + '\nthis.f = lhDocLink;', ctx);
    return ctx.f('blackout_dates', 'Official Blackout Dates');
  };
  assert.match(run({ docIds: { blackout_dates: FAKE } }), new RegExp('/d/' + FAKE + '/edit".*>Official Blackout Dates</a>'));
  assert.equal(run({ docIds: {} }), 'Official Blackout Dates');
  assert.equal(run(null), 'Official Blackout Dates');
});

test('no lesson plan carries a doc ID in the code; each gets one at load', () => {
  const src = fs.readFileSync(path.join(LH, 'src', '09-wbl-lessonplans-procurement-finance-esports.html'), 'utf8');
  assert.doesNotMatch(src, /docId\s*:\s*'[A-Za-z0-9_-]{25,}'/);
  assert.match(src, /lp\.docId = ids\[lp\.id\] \|\| \('missing_' \+ lp\.id\)/);
});
