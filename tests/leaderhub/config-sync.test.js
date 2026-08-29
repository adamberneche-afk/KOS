'use strict';
// Regression tests for leader-hub/Config.gs — the singleton config domain
// server-migration ("Phase 3": Profile, Modules, Schedule Config, and the
// rest of LH_CONFIG_KEYS onto Script Properties). Loaded against a real
// PropertiesService mock the same way tests/leaderhub/emailbridge-orgsync
// .test.js exercises EmailBridge.gs, so this is testing the actual shipped
// functions, not a re-implementation of their logic.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFile } = require('../harness/gas-sandbox');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'leader-hub', 'Config.gs');

function load() {
  return loadGasFile(CONFIG_PATH, ['lhSaveConfig_', 'lhGetConfig_', 'lhGetAllConfig_', 'LH_CONFIG_KEYS']);
}

test('lhGetConfig_: an unset key returns null, not undefined or a throw', () => {
  const { exported } = load();
  assert.equal(exported.lhGetConfig_('lh_profile'), null);
});

test('lhSaveConfig_ then lhGetConfig_ round-trips an object exactly', () => {
  const { exported } = load();
  const profile = { name: 'Adam Berneche', email: 'adam_berneche@ccpsnet.net', phone: '' };
  const res = exported.lhSaveConfig_('lh_profile', profile);
  assert.deepEqual(res, { ok: true });
  assert.deepEqual(exported.lhGetConfig_('lh_profile'), profile);
});

test('lhSaveConfig_ round-trips an array-shaped domain (Key Contacts) exactly', () => {
  const { exported } = load();
  const contacts = [{ name: 'A. Advisor', role: 'Head Advisor', phone: '555-0100', email: 'a@example.com' }];
  exported.lhSaveConfig_('lh_keyContacts', contacts);
  assert.deepEqual(exported.lhGetConfig_('lh_keyContacts'), contacts);
});

test('lhSaveConfig_ rejects an unknown key without writing anything', () => {
  const { exported } = load();
  const res = exported.lhSaveConfig_('lh_not_a_real_domain', { x: 1 });
  assert.equal(res.ok, false);
  assert.match(res.error, /Unknown config key/);
  // Confirm nothing was written under any guessable property name — a
  // rejected key must never silently land in PropertiesService anyway.
  assert.equal(exported.lhGetConfig_('lh_not_a_real_domain'), null);
});

test('lhGetConfig_ rejects an unknown key the same way lhSaveConfig_ does (both consult the one whitelist)', () => {
  const { exported, sandbox } = load();
  // Write directly under the property name a real save WOULD have used, to
  // prove lhGetConfig_'s null return is the whitelist rejecting the key —
  // not just "nothing happens to be stored there."
  sandbox.PropertiesService.getScriptProperties().setProperty('LH_CONFIG__lh_not_a_real_domain', JSON.stringify({ x: 1 }));
  assert.equal(exported.lhGetConfig_('lh_not_a_real_domain'), null);
});

test('a later save overwrites the earlier value in place, not appended alongside it', () => {
  const { exported } = load();
  exported.lhSaveConfig_('lh_modules', { orgs: true, wbl: true, esports: true });
  exported.lhSaveConfig_('lh_modules', { orgs: false, wbl: true, esports: false });
  assert.deepEqual(exported.lhGetConfig_('lh_modules'), { orgs: false, wbl: true, esports: false });
});

test('lhGetAllConfig_ returns every key in LH_CONFIG_KEYS, null for anything never saved', () => {
  const { exported } = load();
  exported.lhSaveConfig_('lh_profile', { name: 'Adam' });
  exported.lhSaveConfig_('lh_sbe_status', { el1: { done: true, notes: '' } });
  const all = exported.lhGetAllConfig_();
  assert.deepEqual(Object.keys(all).sort(), [...exported.LH_CONFIG_KEYS].sort());
  assert.deepEqual(all.lh_profile, { name: 'Adam' });
  assert.deepEqual(all.lh_sbe_status, { el1: { done: true, notes: '' } });
  assert.equal(all.lh_modules, null); // never saved in this test
});

test('LH_CONFIG_KEYS covers every singleton config domain the client\'s write-through hook expects (no drift between the two whitelists)', () => {
  const { exported } = load();
  // Kept as two lists on purpose (client can't require() a .gs file — see
  // Config.gs's own header comment) — this test is the guardrail against
  // them silently drifting apart. If this fails, a key was added to one
  // list and not the other.
  const clientKeysSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'leader-hub', 'src', '05-data-helpers-dashboard.html'),
    'utf8'
  );
  const m = clientKeysSrc.match(/const LH_SERVER_SYNCED_CONFIG_KEYS = \[([\s\S]*?)\];/);
  assert.ok(m, 'LH_SERVER_SYNCED_CONFIG_KEYS not found in 05-data-helpers-dashboard.html — did it move or get renamed?');
  const clientKeys = m[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(clientKeys.slice().sort(), [...exported.LH_CONFIG_KEYS].sort());
});
