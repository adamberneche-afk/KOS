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
// From the store (_lhStore, Phase 3) at the top of the file.
const START = SRC.indexOf('const LH_BOOT = ');
// Up to the SCR score sync, which these tests don't run.
const END = SRC.indexOf('// ── SCR score sync');
assert.ok(START > 0 && END > START, 'LS and sync code not found in 05');
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
  vm.runInContext(CODE +
    '\nthis.__api = { LS, LH_SERVER_SYNCED_CONFIG_KEYS, LH_SERVER_SYNCED_DATA_KEYS, LH_PAGE_MEMORY_KEYS };', ctx);
  return { api: ctx.__api, store, calls, ctx };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

// Phase 2's behaviour, served (the only way the app runs since Phase 5):
// drafts in page memory, ids on log entries, and what an earlier version
// left in the browser moved to the server.
test('drafts and view state stay in page memory, and old copies are removed from the browser', () => {
  const { api, store } = served(BOOT, { lh_trip_draft: '{"name":"old"}', lh_last_view: '"deca"' }, {});
  assert.equal(store.has('lh_trip_draft'), false, 'a leftover draft is removed at load');
  assert.equal(store.has('lh_last_view'), false);
  api.LS.set('lh_trip_draft', { name: 'Field trip' });
  assert.equal(store.has('lh_trip_draft'), false, 'never written to the browser');
  assert.deepEqual(api.LS.get('lh_trip_draft'), { name: 'Field trip' });
  api.LS.set('lh_trip_draft', null);
  assert.equal(api.LS.get('lh_trip_draft', 'none'), 'none');
});

test('each log entry gets its own id as it is saved, and the log goes to the server', async () => {
  const pushes = [];
  const { api } = served(BOOT, {}, { lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't1' }; } });
  const same = '2026-10-22T10:00:00.000Z';
  api.LS.set('lh_daily_log', [{ date: same, type: 'a' }, { date: same, type: 'a' }, { id: 'keep', type: 'b' }]);
  const log = api.LS.get('lh_daily_log');
  assert.ok(log[0].id && log[1].id && log[0].id !== log[1].id, 'two entries in the same millisecond stay two');
  assert.equal(log[2].id, 'keep', 'an existing id is kept');
  await tick();
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].domain, 'daily_log');
  assert.deepEqual(pushes[0].rows.map((r) => r[0]), log.map((e) => String(e.id)));
});

test('a setting the server has never had is moved from the browser to the server', async () => {
  const saved = {};
  const { store } = served(Object.assign({}, BOOT, { config: {} }), {
    lh_journal_last: JSON.stringify({ q1: 'today' }), lh_comms_done_date: '"Thu Oct 22 2026"',
  }, { lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; } });
  await tick(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(saved.lh_journal_last)), { q1: 'today' });
  assert.equal(saved.lh_comms_done_date, 'Thu Oct 22 2026');
  assert.equal(store.size, 0, 'deleted from the browser once saved');
});

test('a log the server has never had is moved from the browser, with ids added', async () => {
  const pushes = [];
  const { api, store } = served(BOOT, { lh_wbl_hours_log: JSON.stringify([{ student: 'A', added: 2 }]) },
    { lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't1' }; } });
  await tick(); await tick();
  const log = api.LS.get('lh_wbl_hours_log');
  assert.ok(log[0].id, 'the existing entry got an id');
  const p = pushes.find((x) => x.domain === 'wbl_hours_log');
  assert.ok(p, 'pushed');
  assert.equal(p.rows[0][0], String(log[0].id));
  assert.equal(store.has('lh_wbl_hours_log'), false);
});

test('the id counters take the larger value per counter, so no id is handed out twice', async () => {
  const saved = {};
  const { api } = served(Object.assign({}, BOOT, { config: { lh_next_id: { trip: 24, ev: 40 }, lh_next_slip_id: 150 } }),
    { lh_next_id: JSON.stringify({ trip: 30, ev: 5 }), lh_next_slip_id: '210' },
    { lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; } });
  assert.deepEqual(api.LS.get('lh_next_id'), { trip: 30, ev: 40 });
  assert.equal(api.LS.get('lh_next_slip_id'), 210);
  await tick(); await tick();
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
    lh_email_bridge_url: 'read once by the retired-file page (src/00) to link the web app',
    lh_api_key: 'retired: deleted at load (Phase 1)',
    lh_deposit_reminder_force: 'read, never written',
    lh_inventory_transactions: 'read, never written',
    lh_moved_to_web_app: 'the retired-file page (src/00) marks a browser it cleared',
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

// ── Phase 3: served, the server is the only copy ─────────────────────────
// Served by the web app, the page arrives with the server's data
// (window.__LH_BOOT__, written by doGet()); LS reads and writes page memory
// and the server, never browser storage, except a one-time move of what an
// earlier version left there.
function served(boot, seed, server) {
  const store = new Map(Object.entries(seed || {}));
  const touched = [];
  const localStorage = {
    getItem: (k) => { touched.push(['get', k]); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { touched.push(['set', k]); store.set(k, String(v)); },
    removeItem: (k) => { touched.push(['remove', k]); store.delete(k); },
    key: (i) => [...store.keys()][i],
    get length() { return store.size; },
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
          Promise.resolve().then(() => { try { ok((server[name] || (() => ({ ok: true, updatedAt: 'tX' })))(...args)); } catch (e) { fail(e); } });
        };
      },
    });
    return proxy;
  }
  const listeners = {};
  const els = [];
  const document = {
    body: { prepend: (el) => els.unshift(el) },
    getElementById: (id) => els.find((e) => e.id === id) || null,
    createElement: () => {
      const el = { style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); },
        remove() { const i = els.indexOf(this); if (i !== -1) els.splice(i, 1); } };
      Object.defineProperty(el, 'innerHTML', { set() { el.children = []; }, get() { return ''; } });
      return el;
    },
  };
  const ctx = {
    console: { warn() {}, log() {}, error() {} }, setTimeout, setInterval, clearInterval, Promise, JSON, Object, Array, String,
    Number, Math, Date, Set, Uint32Array, crypto: require('crypto').webcrypto,
    localStorage, document,
    window: { __LH_BOOT__: boot, addEventListener: (n, f) => { listeners[n] = f; } },
    google: { script: { get run() { return runner(); } } },
    _showToast: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(CODE + '\nthis.__api = { LS, _lhUnsavedCount_, lhRetryUnsaved };', ctx);
  return { api: ctx.__api, store, touched, calls, listeners, els, ctx };
}
const BOOT = {
  ok: true,
  config: { lh_profile: { name: 'Server profile' } },
  data: { trips: { found: true, updatedAt: 't1', rows: [['1', JSON.stringify({ id: 1, name: 'ICDC' })]] } },
  scr: { ok: true, found: false },
};

test('served: the app reads the server\'s data and writes nothing to the browser', async () => {
  const pushes = [];
  const { api, store, touched } = served(BOOT, {}, { lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't2' }; } });
  assert.deepEqual(api.LS.get('lh_profile'), { name: 'Server profile' });
  assert.deepEqual(api.LS.get('lh_trips').map((t) => t.name), ['ICDC']);
  touched.length = 0;
  api.LS.set('lh_trips', [{ id: 1, name: 'ICDC' }, { id: 2, name: 'SLC' }]);
  await tick();
  assert.deepEqual(touched.filter(([op]) => op !== 'get'), [], 'nothing written to the browser');
  assert.equal(store.size, 0);
  assert.equal(pushes[0].expectedUpdatedAt, 't1', 'pushed against the version the page loaded');
  assert.deepEqual(api.LS.get('lh_trips').map((t) => t.name), ['ICDC', 'SLC']);
});

test('served: what an earlier version left in the browser moves to the server, then is deleted there', async () => {
  const saved = {};
  const pushes = [];
  const seed = {
    lh_keyContacts: JSON.stringify([{ name: 'only in this browser' }]), // server lacks it: moved
    lh_profile: JSON.stringify({ name: 'stale copy' }), // server has it, nothing pending: dropped
    lh_trips: JSON.stringify([{ id: 1, name: 'my edit' }, { id: 3, name: 'added here' }]), // pending: merged
    lh_sync_pending: JSON.stringify({ config: {}, data: { lh_trips: 2 } }),
    lh_data_sync_trips: JSON.stringify({ lastKnownRemoteUpdatedAt: 't0' }),
    lh_email_bridge_url: JSON.stringify('https://script.google.com/x'),
  };
  const { api, store } = served(BOOT, seed, {
    lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; },
    lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't2' }; },
  });
  assert.deepEqual(api.LS.get('lh_keyContacts'), [{ name: 'only in this browser' }]);
  assert.deepEqual(api.LS.get('lh_profile'), { name: 'Server profile' }, 'the server\'s copy wins when nothing was pending');
  assert.deepEqual(api.LS.get('lh_trips').map((t) => t.name), ['my edit', 'added here'], 'the unsaved edit merged by id');
  assert.equal(store.has('lh_profile'), false, 'dropped at once');
  assert.equal(store.has('lh_email_bridge_url'), false);
  assert.equal(store.has('lh_keyContacts'), true, 'kept until the server has it');
  await tick(); await tick();
  assert.deepEqual(saved.lh_keyContacts, [{ name: 'only in this browser' }]);
  assert.ok(pushes.some((p) => p.domain === 'trips' && p.expectedUpdatedAt === 't1'));
  assert.deepEqual([...store.keys()], [], 'everything deleted once the server accepted it, bookkeeping too');
});

test('served: a save the server refuses shows "not saved yet", retries, and leaving asks first', async () => {
  let accept = false;
  const { api, els, listeners } = served(BOOT, {}, {
    lhSaveConfig: () => (accept ? { ok: true } : { ok: false, error: 'busy' }),
  });
  api.LS.set('lh_keyContacts', [{ name: 'x' }]);
  await tick();
  assert.equal(api._lhUnsavedCount_(), 1);
  const bar = els.find((e) => e.id === 'lh-unsaved-bar');
  assert.ok(bar, 'the bar is shown');
  assert.match(bar.children[0].textContent, /1 change not saved yet/);
  const ev = { preventDefault() { ev.prevented = true; } };
  listeners.beforeunload(ev);
  assert.equal(ev.prevented, true, 'leaving the page asks first');
  accept = true;
  api.lhRetryUnsaved();
  await tick();
  assert.equal(api._lhUnsavedCount_(), 0);
  assert.equal(els.find((e) => e.id === 'lh-unsaved-bar'), undefined, 'the bar goes away');
});

test('served: a conflict is merged with the server\'s copy and pushed, not left for a reload', async () => {
  let version = 't5';
  const pushes = [];
  const { api } = served(BOOT, {}, {
    lhPushData: (b) => {
      pushes.push(b.expectedUpdatedAt);
      if (b.expectedUpdatedAt !== version) return { ok: false, conflict: true };
      version = 't6';
      return { ok: true, updatedAt: version };
    },
    lhPullData: () => ({ ok: true, found: true, updatedAt: 't5', rows: [
      ['1', JSON.stringify({ id: 1, name: 'ICDC' })], ['9', JSON.stringify({ id: 9, name: 'from another device' })]] }),
  });
  api.LS.set('lh_trips', [{ id: 1, name: 'ICDC (edited)' }]);
  await tick(); await tick(); await tick();
  assert.deepEqual(pushes, ['t1', 't5']);
  assert.deepEqual(api.LS.get('lh_trips').map((t) => t.name), ['ICDC (edited)', 'from another device']);
  assert.equal(api._lhUnsavedCount_(), 0);
});

test('served: if the server\'s data couldn\'t be read, nothing is saved over it', async () => {
  const { api, calls, store } = served({ ok: false, error: 'timeout' }, {}, {});
  assert.equal(api.LS.set('lh_trips', []), false);
  await tick();
  assert.equal(calls.length, 0, 'nothing sent to the server');
  assert.equal(store.size, 0);
});

// ── Phase 4: the standalone file's data reaches the web app by import ────
// Served, an import adds to the server's copy: records merge by id with the
// imported copy winning, counters take the larger value, SCR cells are
// queued one by one, and drafts and bookkeeping are skipped.
test('served: an import adds to the server\'s data, never replacing what the web app has', async () => {
  const pushes = [];
  const saved = {};
  const { api, ctx } = served(Object.assign({}, BOOT, {
    config: { lh_next_id: { trip: 40, ev: 3 } },
  }), {}, {
    lhPushData: (b) => { pushes.push(b); return { ok: true, updatedAt: 't2' }; },
    lhSaveConfig: (k, v) => { saved[k] = v; return { ok: true }; },
  });
  const cells = [];
  ctx._lhQueueScrScoreSync_ = (...a) => cells.push(a);
  vm.runInContext('this.__imp = lhImportIntoServer_;', ctx);
  const failed = ctx.__imp({
    lh_trips: JSON.stringify([{ id: 1, name: 'ICDC (file copy)' }, { id: 7, name: 'only in the file' }]),
    lh_next_id: JSON.stringify({ trip: 30, ev: 9 }),
    lh_scr_scores: JSON.stringify({ '8175': { '3': { s1: { '1': 2 } } } }),
    lh_trip_draft: JSON.stringify({ x: 1 }),
    lh_sync_pending: JSON.stringify({}),
    lh_data_sync_trips: JSON.stringify({}),
    lh_profile: JSON.stringify({ name: 'From the file' }),
  });
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(failed)), []);
  assert.deepEqual(api.LS.get('lh_trips').map((t) => t.name), ['ICDC (file copy)', 'only in the file']);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.lh_next_id)), { trip: 40, ev: 9 }, 'each counter the larger');
  assert.deepEqual(JSON.parse(JSON.stringify(cells)), [['8175', '3', 's1', '1', 2]], 'SCR cells queued for the server');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.lh_profile)), { name: 'From the file' });
  assert.equal(api.LS.get('lh_trip_draft', 'none'), 'none', 'a draft is not imported');
  assert.ok(pushes.some((p) => p.domain === 'trips'));
});

// ── Phase 5: the standalone file is retired ──────────────────────────────
// Opened without the server's data (as a file from disk), the page stops
// and says to use the web app, offering an export of what's left here.
function retiredPage(boot, seed) {
  const head = fs.readFileSync(path.join(LH, 'src', '00-shell-head.html'), 'utf8');
  const code = head.slice(head.indexOf('<script>') + 8, head.indexOf('</script>'));
  const store = new Map(Object.entries(seed || {}));
  const ctx = {
    window: { __LH_BOOT__: boot, stop() { ctx.stopped = true; }, confirm: () => true },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i], get length() { return store.size; },
    },
    document: { documentElement: { innerHTML: '' }, getElementById: () => null },
    JSON, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

test('the file opened from disk stops and points to the web app; served, it runs as usual', () => {
  const served_ = retiredPage({ ok: true }, {});
  assert.equal(served_.stopped, undefined);
  assert.equal(served_.window.__LH_RETIRED__, undefined);

  const file = retiredPage(undefined, {
    lh_goals: '[{"id":1}]', lh_trips: '[]',
    lh_email_bridge_url: JSON.stringify('https://script.google.com/macros/s/abc/exec'),
  });
  assert.equal(file.stopped, true, 'the rest of the page doesn\'t load');
  assert.equal(file.window.__LH_RETIRED__, true);
  const page = file.document.documentElement.innerHTML;
  assert.match(page, /LeaderHub now runs as a web app/);
  assert.match(page, /href="https:\/\/script\.google\.com\/macros\/s\/abc\/exec"/);
  assert.match(page, /3 items saved here by an earlier version/);
  assert.match(page, /Export everything/);
  assert.match(page, /id="lh-r-clear"[^>]*cursor:not-allowed" disabled>/, 'clear only after an export');

  const unsafe = retiredPage(undefined, { lh_email_bridge_url: JSON.stringify('javascript:alert(1)') });
  assert.doesNotMatch(unsafe.document.documentElement.innerHTML, /javascript:/);
  assert.match(retiredPage(undefined, {}).document.documentElement.innerHTML, /Nothing from this file is left/);
});
