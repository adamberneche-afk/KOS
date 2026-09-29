'use strict';
// leader-hub/src/05-data-helpers-dashboard.html: a load must never overwrite
// an edit the server hasn't accepted. The boot refresh used to replace
// localStorage with the server's copy unconditionally, so a save that failed
// (a setting past Script Properties' 9KB limit, a conflict, a dropped
// connection) was silently undone the next time the app loaded.
//
// Runs the page's real sync code, cut from the source by its own
// declarations (not line numbers), against a fake google.script.run.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'src', '05-data-helpers-dashboard.html'), 'utf8');
const START = SRC.indexOf('const LH_SERVER_SYNCED_CONFIG_KEYS = [');
const REFRESH = SRC.indexOf('async function lhRefreshDataDomainsFromServer_() {');
const END = SRC.indexOf('\n}\n', REFRESH) + 3;
assert.ok(START > 0 && REFRESH > START && END > REFRESH, 'sync code not found in 05-data-helpers-dashboard.html');
const CODE = SRC.slice(START, END);

// `server` answers each google.script.run call by name.
function load(server) {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const calls = [];
  function runner() {
    let ok = () => {}, fail = () => {};
    let proxy = null;
    const api = {
      withSuccessHandler(fn) { ok = fn; return proxy; },
      withFailureHandler(fn) { fail = fn; return proxy; },
    };
    proxy = new Proxy(api, {
      get(target, name) {
        if (name in target) return target[name];
        return (...args) => {
          calls.push({ name, args });
          Promise.resolve().then(() => {
            try { ok(server[name](...args)); } catch (e) { fail(e); }
          });
        };
      },
    });
    return proxy;
  }
  const ctx = {
    console: { warn() {}, log() {} }, setTimeout, Promise, JSON, Object, Array, String, Number,
    localStorage,
    LS: { get: (k, d) => { const v = store.get(k); return v == null ? d : JSON.parse(v); } },
    google: { script: { get run() { return runner(); } } },
    _showToast: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(CODE + '\nthis.__api = { _lhSyncConfigKeyToServer_, lhRefreshConfigFromServer_, _lhSyncDataKeyToServer_, lhRefreshDataDomainsFromServer_, _lhMergeById_, _lhPendingKeys_ };', ctx);
  return { api: ctx.__api, store, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('a setting the server refused stays on this device through the next load, and is pushed again', async () => {
  let saved = null;
  const server = {
    lhSaveConfig: () => ({ ok: false, error: 'too large to save' }),
    lhGetAllConfig: () => ({ lh_keyContacts: [{ name: 'old server copy' }] }),
  };
  const { api, store, calls } = load(server);
  store.set('lh_keyContacts', JSON.stringify([{ name: 'my new edit' }]));
  api._lhSyncConfigKeyToServer_('lh_keyContacts', [{ name: 'my new edit' }]);
  await tick();
  assert.deepEqual(api._lhPendingKeys_('config'), ['lh_keyContacts']);

  // Next load: the server now accepts the save.
  server.lhSaveConfig = (k, v) => { saved = v; return { ok: true }; };
  await api.lhRefreshConfigFromServer_();
  await tick();

  assert.deepEqual(JSON.parse(store.get('lh_keyContacts')), [{ name: 'my new edit' }], 'not overwritten');
  assert.deepEqual(saved, [{ name: 'my new edit' }], 'pushed again');
  assert.deepEqual(api._lhPendingKeys_('config'), [], 'cleared once the server accepts it');
  assert.ok(calls.some((c) => c.name === 'lhGetAllConfig'));
});

test('a setting with nothing pending takes the server\'s copy on load, as before', async () => {
  const { api, store } = load({ lhGetAllConfig: () => ({ lh_keyContacts: [{ name: 'from another device' }] }) });
  store.set('lh_keyContacts', JSON.stringify([{ name: 'stale' }]));
  await api.lhRefreshConfigFromServer_();
  assert.deepEqual(JSON.parse(store.get('lh_keyContacts')), [{ name: 'from another device' }]);
});

test('two quick saves of one data domain push one after the other, not into a conflict', async () => {
  let updatedAt = 't0';
  const pushes = [];
  const server = {
    lhPushData: (body) => {
      pushes.push(body.expectedUpdatedAt);
      if (body.expectedUpdatedAt !== updatedAt) return { ok: false, conflict: true };
      updatedAt = 't' + pushes.length;
      return { ok: true, updatedAt };
    },
  };
  const { api, store } = load(server);
  store.set('lh_data_sync_trips', JSON.stringify({ lastKnownRemoteUpdatedAt: 't0' }));
  const a = api._lhSyncDataKeyToServer_('lh_trips', [{ id: 1 }]);
  const b = api._lhSyncDataKeyToServer_('lh_trips', [{ id: 1 }, { id: 2 }]);
  await a; await b; await tick();

  // The first save is superseded by the second before it runs; the second
  // pushes with the right version.
  assert.deepEqual(pushes, ['t0']);
  assert.deepEqual(api._lhPendingKeys_('data'), []);
});

test('a data edit that conflicted is merged with the server\'s copy on load, not replaced by it', async () => {
  let pushed = null;
  const server = {
    lhPushData: () => ({ ok: false, conflict: true }),
    lhPullData: (body) => body.domain === 'trips'
      ? { ok: true, found: true, updatedAt: 't9', rows: [
        ['1', JSON.stringify({ id: 1, name: 'server edit of 1' })],
        ['3', JSON.stringify({ id: 3, name: 'added on another device' })]] }
      : { ok: true, found: false },
  };
  const { api, store } = load(server);
  const mine = [{ id: 1, name: 'my edit of 1' }, { id: 2, name: 'added here' }];
  store.set('lh_trips', JSON.stringify(mine));
  api._lhSyncDataKeyToServer_('lh_trips', mine);
  await tick();
  assert.deepEqual(api._lhPendingKeys_('data'), ['lh_trips']);

  server.lhPushData = (body) => { pushed = body; return { ok: true, updatedAt: 't10' }; };
  await api.lhRefreshDataDomainsFromServer_();
  await tick();

  const merged = JSON.parse(store.get('lh_trips'));
  assert.deepEqual(merged.map((r) => r.name), ['my edit of 1', 'added on another device', 'added here']);
  assert.equal(pushed.expectedUpdatedAt, 't9', 'the merge is pushed against the server\'s current version');
  assert.deepEqual(api._lhPendingKeys_('data'), []);
});
