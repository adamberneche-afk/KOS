'use strict';
// leader-hub without browser storage, Phase 2 (2026-10-22,
// meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md). The rest of the data
// goes to the server: small state as config keys, the member roster and the
// id-less logs as data domains (each entry gets an id as it is saved), and
// drafts and view state in page memory only. A key the server has never had
// is pushed once from this browser.
//
// Runs the page's real LS and sync code, cut from 05 by its declarations,
// against a fake google.script.run, as sync-pending.test.js does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const SRC = fs.readFileSync(path.join(LH, 'src', '05-data-helpers-dashboard.html'), 'utf8');
const START = SRC.indexOf('const LH_PAGE_MEMORY_KEYS = [');
const REFRESH = SRC.indexOf('async function lhRefreshDataDomainsFromServer_() {');
const END = SRC.indexOf('\n}\n', REFRESH) + 3;
assert.ok(START > 0 && REFRESH > START && END > REFRESH, 'LS and sync code not found in 05');
const CODE = SRC.slice(START, END);

function load(server, seed) {
  const store = new Map(Object.entries(seed || {}));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const calls = [];
  function runner() {
    let ok = () => {}, fail = () => {};
    let proxy = null;
    const api = { withSuccessHandler(fn) { ok = fn; return proxy; }, withFailureHandler(fn) { fail = fn; return proxy; } };
    proxy = new Proxy(api, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          calls.push({ name, args });
          Promise.resolve().then(() => { try { ok(server[name](...args)); } catch (e) { fail(e); } });
        };
      },
    });
    return proxy;
  }
  const ctx = {
    console: { warn() {}, log() {}, error() {} }, setTimeout, Promise, JSON, Object, Array, String, Number, Math, Date,
    Uint32Array, crypto: require('crypto').webcrypto,
    localStorage, document: { getElementById: () => null },
    google: { script: { get run() { return runner(); } } },
    _showToast: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext('let _lsWriteFailWarned = false; let _lsReadFailWarned = false;\n' + CODE +
    '\nthis.__api = { LS, lhRefreshConfigFromServer_, lhRefreshDataDomainsFromServer_, LH_SERVER_SYNCED_CONFIG_KEYS, LH_SERVER_SYNCED_DATA_KEYS, LH_PAGE_MEMORY_KEYS };', ctx);
  return { api: ctx.__api, store, calls, ctx };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('drafts and view state stay in page memory, and old copies are removed from the browser', () => {
  const { api, store } = load({}, { lh_trip_draft: '{"name":"old"}', lh_last_view: '"deca"', lh_goals: '[]' });
  assert.equal(store.has('lh_trip_draft'), false, 'a leftover draft is removed at load');
  assert.equal(store.has('lh_last_view'), false);
  assert.equal(store.has('lh_goals'), true, 'other keys are untouched');
  api.LS.set('lh_trip_draft', { name: 'Field trip' });
  assert.equal(store.has('lh_trip_draft'), false, 'never written to the browser');
  assert.deepEqual(api.LS.get('lh_trip_draft'), { name: 'Field trip' });
  api.LS.set('lh_trip_draft', null);
  assert.equal(api.LS.get('lh_trip_draft', 'none'), 'none');
});

test('each log entry gets its own id as it is saved, and the log goes to the server', async () => {
  const pushes = [];
  const { api, store } = load({ lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't1' }; } });
  const same = '2026-10-22T10:00:00.000Z';
  api.LS.set('lh_daily_log', [{ date: same, type: 'a' }, { date: same, type: 'a' }, { id: 'keep', type: 'b' }]);
  const log = JSON.parse(store.get('lh_daily_log'));
  assert.ok(log[0].id && log[1].id && log[0].id !== log[1].id, 'two entries in the same millisecond stay two');
  assert.equal(log[2].id, 'keep', 'an existing id is kept');
  await tick();
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].domain, 'daily_log');
  assert.deepEqual(pushes[0].rows.map((r) => r[0]), log.map((e) => String(e.id)));
});

test('a setting the server has never had is pushed once from this browser', async () => {
  const saved = {};
  const { api } = load({
    lhGetAllConfig: () => ({}),
    lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; },
  }, { lh_journal_last: JSON.stringify({ q1: 'today' }), lh_comms_done_date: '"Thu Oct 22 2026"' });
  await api.lhRefreshConfigFromServer_();
  await tick();
  assert.deepEqual(saved.lh_journal_last, { q1: 'today' });
  assert.equal(saved.lh_comms_done_date, 'Thu Oct 22 2026');
  assert.ok(!('lh_profile' in saved), 'nothing pushed for a key this browser doesn\'t have');
});

test('a log the server has never had is pushed from this browser, with ids added', async () => {
  const pushes = [];
  const { api, store } = load({
    lhPullData: () => ({ ok: true, found: false }),
    lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't1' }; },
  }, { lh_wbl_hours_log: JSON.stringify([{ student: 'A', added: 2 }]) });
  await api.lhRefreshDataDomainsFromServer_();
  await tick();
  const log = JSON.parse(store.get('lh_wbl_hours_log'));
  assert.ok(log[0].id, 'the existing entry got an id');
  const p = pushes.find((x) => x.domain === 'wbl_hours_log');
  assert.ok(p, 'pushed');
  assert.equal(p.rows[0][0], String(log[0].id));
  assert.ok(!pushes.some((x) => x.domain === 'trips'), 'nothing pushed for a domain this browser has no data for');
});

test('the id counters take the larger value per counter, so no id is handed out twice', async () => {
  const saved = {};
  const { api, ctx } = load({
    lhGetAllConfig: () => ({ lh_next_id: { trip: 24, ev: 40 }, lh_next_slip_id: 150 }),
    lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; },
  });
  vm.runInContext('var nextId = { trip: 30, ev: 5 }; var nextSlipId = 210;', ctx);
  await api.lhRefreshConfigFromServer_();
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.nextId)), { trip: 30, ev: 40 });
  assert.equal(ctx.nextSlipId, 210);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.lh_next_id)), { trip: 30, ev: 40 }, 'this browser was ahead, so it is pushed back');
  assert.equal(saved.lh_next_slip_id, 210);
});

// Every lh_* key the app uses is accounted for: on the server, in page
// memory, or one of the few named exceptions with its reason.
test('every lh_* key is on the server, in page memory, or a named exception', () => {
  const { api } = load({});
  const config = fs.readFileSync(path.join(LH, 'Config.gs'), 'utf8');
  const data = fs.readFileSync(path.join(LH, 'Data.gs'), 'utf8');
  const EXCEPTIONS = {
    lh_scr_scores: 'SCR.gs, per cell',
    lh_sync_pending: 'sync bookkeeping (Phase 3)',
    lh_email_bridge_url: 'the standalone file only (Phase 5)',
    lh_api_key: 'retired: deleted at load (Phase 1)',
    lh_deposit_reminder_force: 'read, never written',
    lh_inventory_transactions: 'read, never written',
  };
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(LH, 'src'))) {
    const src = fs.readFileSync(path.join(LH, 'src', f), 'utf8');
    for (const m of src.matchAll(/['"](lh_[A-Za-z0-9_]+)['"]/g)) keys.add(m[1]);
  }
  const dataKeys = Object.keys(api.LH_SERVER_SYNCED_DATA_KEYS);
  const unaccounted = [...keys].filter((k) => !k.startsWith('lh_data_sync_') &&
    !api.LH_SERVER_SYNCED_CONFIG_KEYS.includes(k) && !dataKeys.includes(k) &&
    !api.LH_PAGE_MEMORY_KEYS.includes(k) && !(k in EXCEPTIONS));
  assert.deepEqual(unaccounted, []);
  for (const k of api.LH_SERVER_SYNCED_CONFIG_KEYS) assert.ok(config.includes("'" + k + "'"), k + ' is in Config.gs');
  for (const d of Object.values(api.LH_SERVER_SYNCED_DATA_KEYS)) assert.ok(data.includes("'" + d + "'"), d + ' is in Data.gs');
});
