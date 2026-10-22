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
// From the store (_lhStore, Phase 3) at the top of the file.
const START = SRC.indexOf('const LH_BOOT = ');
// Up to the SCR score sync, which these tests don't run.
const END = SRC.indexOf('// ── SCR score sync');
assert.ok(START > 0 && END > START, 'LS and sync code not found in 05');
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
  vm.runInContext(CODE + '\nthis.__api = { _lhSyncConfigKeyToServer_, _lhSyncDataKeyToServer_, _lhMergeById_, _lhPendingKeys_, _lhStore };', ctx);
  return { api: ctx.__api, store, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

// The boot refresh these tests also covered is gone (no browser storage,
// Phase 5, 2026-10-22): the page arrives with the server's data. A refused
// save retried, the server's copy on load, and a conflict merged are now
// tested served, in no-browser-storage.test.js.



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
  const { api } = load(server);
  api._lhStore.setItem('lh_data_sync_trips', JSON.stringify({ lastKnownRemoteUpdatedAt: 't0' }));
  const a = api._lhSyncDataKeyToServer_('lh_trips', [{ id: 1 }]);
  const b = api._lhSyncDataKeyToServer_('lh_trips', [{ id: 1 }, { id: 2 }]);
  await a; await b; await tick();

  // The first save is superseded by the second before it runs; the second
  // pushes with the right version.
  assert.deepEqual(pushes, ['t0']);
  assert.deepEqual(api._lhPendingKeys_('data'), []);
});

