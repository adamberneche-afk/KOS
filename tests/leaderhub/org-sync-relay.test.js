'use strict';
// Co-advisor Organization Sync across two LeaderHub deployments.
//
// Each advisor runs their own deployment, and the page's google.script.run
// only reaches the deployment serving it, so a co-advisor's push/pull used
// to land in their own, empty spreadsheet. lhOrgSyncCall_() (EmailBridge.gs)
// now relays those calls to the sharing advisor's bridge with the
// co-advisor's own OAuth token, where doPost()'s same-domain lock admits
// them. These tests run two real sandboxes: the owner's bridge, and a
// co-advisor's deployment whose UrlFetchApp hands the request to the
// owner's real doPost().

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = ['Data.gs', 'Code.gs', 'EmailBridge.gs'].map((f) => path.join(LH, f));
const OWNER_URL = 'https://script.google.com/a/macros/ccpsnet.net/s/OWNERDEPLOY/exec';
const COADV_URL = 'https://script.google.com/a/macros/ccpsnet.net/s/COADVDEPLOY/exec';

const FakeContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(text) { return { setMimeType() { return { text }; } }; },
};

function deployment(ownerEmail, viewer, ownUrl, urlFetch) {
  const loaded = loadGasFiles(FILES, ['lhOrgSyncCall_', 'lhOrgSyncCall', 'doPost', 'pushOrgSync_', 'pullOrgSync_'], {
    ContentService: FakeContentService,
    Session: {
      getActiveUser() { return { getEmail() { return viewer.email; } }; },
      getEffectiveUser() { return { getEmail() { return ownerEmail; } }; },
      getScriptTimeZone() { return 'America/New_York'; },
    },
    UrlFetchApp: urlFetch || { fetch() { throw new Error('no network in this deployment'); } },
  });
  loaded.sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', ownerEmail);
  loaded.sandbox.ScriptApp.getService = () => ({ getUrl: () => ownUrl });
  loaded.sandbox.ScriptApp.getOAuthToken = () => 'token-of-' + viewer.email;
  return loaded;
}

function pair() {
  // Whoever is calling the owner's doPost at the moment.
  const ownerViewer = { email: 'owner@ccpsnet.net' };
  const owner = deployment('owner@ccpsnet.net', ownerViewer, OWNER_URL);
  const calls = [];
  const coadv = deployment('coadv@ccpsnet.net', { email: 'coadv@ccpsnet.net' }, COADV_URL, {
    fetch(url, opts) {
      calls.push({ url, opts });
      assert.equal(url, OWNER_URL);
      ownerViewer.email = opts.headers.Authorization.replace('Bearer token-of-', '');
      const out = owner.sandbox.__exported.doPost({ postData: { contents: opts.payload } });
      ownerViewer.email = 'owner@ccpsnet.net';
      return { getResponseCode: () => 200, getContentText: () => out.text };
    },
  });
  return { owner, coadv, calls };
}

const ORG = {
  orgId: 'fbla', orgName: 'FBLA', config: { levels: ['Regional'] },
  rosterHeaders: ['Name'], rosterRows: [['Bob']], resultHeaders: ['Event'], resultRows: [],
  updatedBy: 'owner@ccpsnet.net',
};

test('the owner\'s own push runs locally and returns the URL a share code needs', () => {
  const { owner } = pair();
  const res = owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);
  assert.equal(res.ok, true);
  assert.equal(res.bridgeUrl, OWNER_URL);
  assert.equal(owner.exported.lhOrgSyncCall_(OWNER_URL, 'pullOrgSync', { orgId: 'fbla' }).found, true,
    'its own URL is treated as local too');
});

test('a co-advisor pulls the owner\'s org from the owner\'s bridge, as themselves', () => {
  const { owner, coadv, calls } = pair();
  owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);

  const pulled = coadv.exported.lhOrgSyncCall(OWNER_URL, 'pullOrgSync', { orgId: 'fbla' });

  assert.equal(pulled.ok, true);
  assert.equal(pulled.found, true);
  assert.deepEqual(pulled.rosterRows, [['Bob']]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer token-of-coadv@ccpsnet.net');
  assert.equal(JSON.parse(calls[0].opts.payload).action, 'pullOrgSync');
  assert.equal(coadv.exported.pullOrgSync_({ orgId: 'fbla' }).found, false,
    'nothing was read from, or written to, the co-advisor\'s own bridge');
});

test('a co-advisor\'s push lands in the owner\'s bridge', () => {
  const { owner, coadv } = pair();
  const first = owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);
  const res = coadv.exported.lhOrgSyncCall(OWNER_URL, 'pushOrgSync',
    Object.assign({}, ORG, { rosterRows: [['Bob'], ['Cara']], updatedBy: 'coadv@ccpsnet.net', expectedUpdatedAt: first.updatedAt }));
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(owner.exported.pullOrgSync_({ orgId: 'fbla' }).rosterRows, [['Bob'], ['Cara']]);
});

test('someone outside the owner\'s domain is still refused by the owner\'s bridge', () => {
  const ownerViewer = { email: 'owner@ccpsnet.net' };
  const owner = deployment('owner@ccpsnet.net', ownerViewer, OWNER_URL);
  owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);
  ownerViewer.email = 'someone@gmail.com';
  const out = owner.exported.doPost({ postData: { contents: JSON.stringify({ action: 'pullOrgSync', orgId: 'fbla' }) } });
  assert.equal(JSON.parse(out.text).error, 'Not authorized.');
});

test('only org-sync actions relay, and only to an Apps Script web app URL', () => {
  const { coadv, calls } = pair();
  assert.match(coadv.exported.lhOrgSyncCall(OWNER_URL, 'bragEmail', {}).error, /Not an organization sync action/);
  assert.match(coadv.exported.lhOrgSyncCall('https://evil.example/exec', 'pullOrgSync', { orgId: 'x' }).error,
    /not an Apps Script web app URL/);
  assert.match(coadv.exported.lhOrgSyncCall('https://script.google.com.evil.example/macros/s/X/exec', 'pullOrgSync', {}).error,
    /not an Apps Script web app URL/);
  assert.equal(calls.length, 0);
});

test('an HTTP refusal from the other bridge is reported, not thrown', () => {
  const coadv = deployment('coadv@ccpsnet.net', { email: 'coadv@ccpsnet.net' }, COADV_URL, {
    fetch() { return { getResponseCode: () => 403, getContentText: () => 'denied' }; },
  });
  assert.match(coadv.exported.lhOrgSyncCall_(OWNER_URL, 'pullOrgSync', { orgId: 'x' }).error, /HTTP 403/);
});

test('the relay entry point is owner-gated on the calling deployment', () => {
  const stranger = deployment('coadv@ccpsnet.net', { email: 'someone@ccpsnet.net' }, COADV_URL);
  assert.throws(() => stranger.exported.lhOrgSyncCall(OWNER_URL, 'pullOrgSync', {}), /Not authorized/);
});

// ── Who may push and pull (2026-11-15) ─────────────────────────────────────
// The domain lock let any account in the domain, students included, pull or
// overwrite an org whose id it guessed. ORG_SYNC_CO_ADVISORS names the
// co-advisors; setting it turns enforcement on. Unset, an unlisted caller is
// let through as before but counted, never named.

function postAs(owner, viewer, email, payload) {
  viewer.email = email;
  const out = owner.exported.doPost({ postData: { contents: JSON.stringify(payload) } });
  viewer.email = 'owner@ccpsnet.net';
  return JSON.parse(out.text);
}

function ownerWithOrg() {
  const viewer = { email: 'owner@ccpsnet.net' };
  const owner = deployment('owner@ccpsnet.net', viewer, OWNER_URL);
  const logs = [];
  owner.sandbox.Logger = { log: (m) => logs.push(String(m)) };
  owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);
  return { owner, viewer, logs, props: owner.sandbox.PropertiesService.getScriptProperties() };
}

test('unset: a same-domain account that is not the owner still pulls, and is counted but never named', () => {
  const { owner, viewer, logs, props } = ownerWithOrg();
  const res = postAs(owner, viewer, 'student1@ccpsnet.net', { action: 'pullOrgSync', orgId: 'fbla' });
  assert.equal(res.ok, true, 'warn-only until the owner sets ORG_SYNC_CO_ADVISORS');
  const seen = JSON.parse(props.getProperty('ORG_SYNC_UNLISTED_CALLS'));
  assert.equal(seen.count, 1);
  assert.match(logs.join('\n'), /pullOrgSync by an account that is not the owner/);
  assert.doesNotMatch(logs.join('\n') + JSON.stringify(seen), /student1/, 'the account is never recorded');
  postAs(owner, viewer, 'owner@ccpsnet.net', { action: 'pullOrgSync', orgId: 'fbla' });
  assert.equal(JSON.parse(props.getProperty('ORG_SYNC_UNLISTED_CALLS')).count, 1, 'the owner is never counted');
});

test('set: a listed co-advisor pulls and pushes through the relay; anyone else in the domain is refused', () => {
  const { owner, coadv } = pair();
  owner.sandbox.PropertiesService.getScriptProperties().setProperty('ORG_SYNC_CO_ADVISORS', 'CoAdv@ccpsnet.net, other@ccpsnet.net');
  const first = owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG);
  const pulled = coadv.exported.lhOrgSyncCall(OWNER_URL, 'pullOrgSync', { orgId: 'fbla' });
  assert.equal(pulled.ok, true, JSON.stringify(pulled));
  const pushed = coadv.exported.lhOrgSyncCall(OWNER_URL, 'pushOrgSync',
    Object.assign({}, ORG, { rosterRows: [['Bob'], ['Cara']], expectedUpdatedAt: first.updatedAt }));
  assert.equal(pushed.ok, true, JSON.stringify(pushed));
  assert.equal(owner.sandbox.PropertiesService.getScriptProperties().getProperty('ORG_SYNC_UNLISTED_CALLS'), null);
});

test('set: a student in the domain can neither read nor overwrite an org', () => {
  const { owner, viewer, props } = ownerWithOrg();
  props.setProperty('ORG_SYNC_CO_ADVISORS', 'coadv@ccpsnet.net');
  const read = postAs(owner, viewer, 'student1@ccpsnet.net', { action: 'pullOrgSync', orgId: 'fbla' });
  assert.equal(read.ok, false);
  assert.match(read.error, /^Not authorized/);
  assert.equal(read.rosterRows, undefined, 'no roster in the refusal');
  const before = owner.exported.pullOrgSync_({ orgId: 'fbla' });
  const write = postAs(owner, viewer, 'student1@ccpsnet.net',
    Object.assign({}, ORG, { action: 'pushOrgSync', rosterRows: [['Mallory']], expectedUpdatedAt: before.updatedAt }));
  assert.equal(write.ok, false);
  assert.deepEqual(owner.exported.pullOrgSync_({ orgId: 'fbla' }).rosterRows, [['Bob']], 'nothing written');
  assert.equal(postAs(owner, viewer, 'owner@ccpsnet.net', { action: 'pullOrgSync', orgId: 'fbla' }).ok, true,
    'the owner is always allowed');
});

test('"none": the owner alone; a co-advisor\'s relay is refused, the owner\'s own page still syncs', () => {
  const { owner, coadv } = pair();
  owner.sandbox.PropertiesService.getScriptProperties().setProperty('ORG_SYNC_CO_ADVISORS', 'none');
  assert.equal(owner.exported.lhOrgSyncCall_('', 'pushOrgSync', ORG).ok, true, 'local: never through doPost');
  const pulled = coadv.exported.lhOrgSyncCall(OWNER_URL, 'pullOrgSync', { orgId: 'fbla' });
  assert.equal(pulled.ok, false);
  assert.match(pulled.error, /add you as a co-advisor/);
});
