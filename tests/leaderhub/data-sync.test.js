'use strict';
// Regression tests for leader-hub/Data.gs — the row-shaped data domain
// server-migration ("Phase 5+": Trips, Trip Archive, DECA Results, and
// whichever domains later phases add to LH_DATA_TABS). Loaded against real
// PropertiesService/SpreadsheetApp mocks, same convention as
// tests/leaderhub/emailbridge-orgsync.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFile } = require('../harness/gas-sandbox');

const DATA_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'Data.gs');

function load() {
  return loadGasFile(DATA_PATH, ['lhPushData_', 'lhPullData_', 'LH_DATA_TABS']);
}

test('lhPullData_: a domain never pushed comes back as found:false, not an error', () => {
  const { exported } = load();
  assert.deepEqual(exported.lhPullData_({ domain: 'trips' }), { ok: true, found: false });
});

test('lhPushData_: first push for a domain succeeds and returns an updatedAt', () => {
  const { exported } = load();
  const res = exported.lhPushData_({
    domain: 'trips',
    headers: ['Id', 'RecordJSON'],
    rows: [['1', JSON.stringify({ id: 1, name: 'DECA SLC' })]],
    updatedBy: 'adam@example.com',
  });
  assert.equal(res.ok, true);
  assert.ok(res.updatedAt);
});

test('push then pull round-trips rows exactly', () => {
  const { exported } = load();
  const rows = [
    ['1', JSON.stringify({ id: 1, name: 'DECA SLC', date: '2026-03-01' })],
    ['2', JSON.stringify({ id: 2, name: 'ICDC', date: '2026-04-25' })],
  ];
  exported.lhPushData_({ domain: 'trips', headers: ['Id', 'RecordJSON'], rows, updatedBy: 'adam@example.com' });
  const pulled = exported.lhPullData_({ domain: 'trips' });
  assert.equal(pulled.found, true);
  assert.deepEqual(pulled.headers, ['Id', 'RecordJSON']);
  assert.deepEqual(pulled.rows, rows);
  assert.equal(pulled.updatedBy, 'adam@example.com');
});

test('a stale push (missing expectedUpdatedAt against an existing domain) is rejected as a conflict and writes nothing', () => {
  const { exported } = load();
  exported.lhPushData_({ domain: 'trips', headers: ['Id', 'RecordJSON'], rows: [['1', '{"id":1}']], updatedBy: 'a' });
  const res = exported.lhPushData_({ domain: 'trips', headers: ['Id', 'RecordJSON'], rows: [['1', '{"id":1,"tampered":true}']], updatedBy: 'b' });
  assert.equal(res.ok, false);
  assert.equal(res.conflict, true);
  const pulled = exported.lhPullData_({ domain: 'trips' });
  assert.deepEqual(pulled.rows, [['1', '{"id":1}']]); // unchanged — the conflicting push wrote nothing
});

test('a push with the correct expectedUpdatedAt succeeds and overwrites in place', () => {
  const { exported } = load();
  const first = exported.lhPushData_({ domain: 'trips', headers: ['Id', 'RecordJSON'], rows: [['1', '{"id":1}']], updatedBy: 'a' });
  const second = exported.lhPushData_({
    domain: 'trips', headers: ['Id', 'RecordJSON'], rows: [['1', '{"id":1,"name":"updated"}']],
    expectedUpdatedAt: first.updatedAt, updatedBy: 'a',
  });
  assert.equal(second.ok, true);
  const pulled = exported.lhPullData_({ domain: 'trips' });
  assert.deepEqual(pulled.rows, [['1', '{"id":1,"name":"updated"}']]);
});

test('repeated pushes update one meta row instead of appending duplicates', () => {
  const { exported, sandbox } = load();
  let prev = exported.lhPushData_({ domain: 'trips', headers: ['Id'], rows: [['1']], updatedBy: 'a' });
  for (let i = 0; i < 3; i++) {
    prev = exported.lhPushData_({ domain: 'trips', headers: ['Id'], rows: [['1']], expectedUpdatedAt: prev.updatedAt, updatedBy: 'a' });
  }
  const metaSheet = sandbox.SpreadsheetApp._registry.values().next().value.getSheetByName('_lh_data_meta');
  const metaRows = metaSheet.getDataRange().getValues().filter((r) => r[0] === 'trips');
  assert.equal(metaRows.length, 1);
});

test('two independent domains never collide on each other\'s tabs', () => {
  const { exported } = load();
  exported.lhPushData_({ domain: 'trips', headers: ['Id'], rows: [['1']], updatedBy: 'a' });
  exported.lhPushData_({ domain: 'trip_archive', headers: ['Id'], rows: [['99']], updatedBy: 'a' });
  assert.deepEqual(exported.lhPullData_({ domain: 'trips' }).rows, [['1']]);
  assert.deepEqual(exported.lhPullData_({ domain: 'trip_archive' }).rows, [['99']]);
});

test('a ragged row (narrower than the header width) is normalized, not thrown on', () => {
  const { exported } = load();
  const res = exported.lhPushData_({
    domain: 'deca_results',
    headers: ['Id', 'RecordJSON', 'Extra'],
    rows: [['1', '{"id":1}']], // missing the 3rd column
    updatedBy: 'a',
  });
  assert.equal(res.ok, true);
  const pulled = exported.lhPullData_({ domain: 'deca_results' });
  assert.deepEqual(pulled.rows, [['1', '{"id":1}', '']]);
});

test('lhPushData_ rejects a domain not in LH_DATA_TABS without writing anything', () => {
  const { exported } = load();
  const res = exported.lhPushData_({ domain: 'not_a_real_domain', headers: ['Id'], rows: [['1']] });
  assert.equal(res.ok, false);
  assert.match(res.error, /Unknown data domain/);
  assert.deepEqual(exported.lhPullData_({ domain: 'not_a_real_domain' }), { ok: false, error: 'Unknown data domain: not_a_real_domain' });
});

test('LH_DATA_TABS covers every row-shaped domain the client\'s write-through hook expects (no drift between the two whitelists)', () => {
  const { exported } = load();
  const clientSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'leader-hub', 'src', '05-data-helpers-dashboard.html'),
    'utf8'
  );
  const m = clientSrc.match(/const LH_SERVER_SYNCED_DATA_KEYS = \{([\s\S]*?)\};/);
  assert.ok(m, 'LH_SERVER_SYNCED_DATA_KEYS not found in 05-data-helpers-dashboard.html — did it move or get renamed?');
  const domains = [...m[1].matchAll(/:\s*'([^']+)'/g)].map((mm) => mm[1]);
  assert.deepEqual(domains.slice().sort(), [...exported.LH_DATA_TABS].sort());
});
