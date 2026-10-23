'use strict';
// checkCasServerSignIn() (leader-hub/Diagnostics.gs, 2026-10-23): whether
// Apps Script's own OpenID token could sign LeaderHub in to CAS server to
// server, with no Cloud Console OAuth client. Pins: owner-only; no token
// says the openid scope is the fix; a token's aud and email are reported,
// verified at tokeninfo like CAS's _verifyLeaderHubToken_, and sent to CAS
// once when its URL is set; the token itself is never logged.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = ['Code.gs', 'EmailBridge.gs', 'Diagnostics.gs', 'DeployVersionMarker.gs', 'Data.gs', 'Config.gs', 'SCR.gs']
  .map((f) => path.join(LH, f));
const OWNER = 'owner@ccpsnet.net';
const AUD = '1234567890-abc.apps.googleusercontent.com';

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = b64u({ alg: 'RS256' }) + '.' +
  b64u({ aud: AUD, iss: 'https://accounts.google.com', email: OWNER, email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 3600 }) + '.signature-part';

function load(viewer, opts) {
  const o = opts || {};
  const logs = [];
  const calls = [];
  const loaded = loadGasFiles(FILES, ['checkCasServerSignIn', 'lhSaveConfig_'], {
    Session: { getActiveUser() { return { getEmail() { return viewer; } }; } },
    ScriptApp: { getIdentityToken() { if (o.tokenThrows) throw new Error('no scope'); return o.token || ''; } },
    UrlFetchApp: {
      fetch(url, params) {
        calls.push({ url, params });
        if (/tokeninfo/.test(url)) {
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ aud: AUD, email: OWNER, email_verified: 'true' }) };
        }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(o.casAnswer || { success: true, units: [1, 2, 3] }) };
      },
    },
    console: { log: (m) => logs.push(String(m)), warn() {}, error() {} },
  });
  loaded.sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', OWNER);
  return Object.assign(loaded, { logs, calls });
}

test('checkCasServerSignIn: owner only', () => {
  const { exported } = load('someone@ccpsnet.net', { token: TOKEN });
  assert.throws(() => exported.checkCasServerSignIn(), /Not authorized/);
});

test('checkCasServerSignIn: no token names the openid scope and calls nothing', () => {
  const { exported, logs, calls } = load(OWNER, { token: '' });
  const r = exported.checkCasServerSignIn();
  assert.equal(r.token, false);
  assert.match(logs.join('\n'), /needs the "openid" scope/);
  assert.equal(calls.length, 0);
});

test('checkCasServerSignIn: reports the claims, verifies at tokeninfo, calls CAS once, never logs the token', () => {
  const env = load(OWNER, { token: TOKEN });
  env.exported.lhSaveConfig_('lh_cas_ccps_api_url', 'https://script.google.com/macros/s/X/exec');
  const r = env.exported.checkCasServerSignIn();

  assert.equal(r.claims.aud, AUD);
  assert.equal(r.claims.email, OWNER);
  assert.equal(r.verified.code, 200);
  assert.deepEqual(r.cas, { code: 200, success: true, message: '', units: 3 });
  const cas = env.calls.filter((c) => !/tokeninfo/.test(c.url));
  assert.equal(cas.length, 1);
  assert.deepEqual(JSON.parse(cas[0].params.payload), { idToken: TOKEN, action: 'getPacingGuide' });
  const text = env.logs.join('\n');
  assert.ok(text.includes('set LEADER_HUB_OAUTH_CLIENT_ID to ' + AUD), 'names the aud CAS must hold');
  assert.ok(!text.includes(TOKEN) && !text.includes('signature-part'), 'the token is never logged');
});

test('checkCasServerSignIn: a refusal from CAS is reported with its message', () => {
  const env = load(OWNER, { token: TOKEN, casAnswer: { success: false, message: 'Token audience mismatch.' } });
  env.exported.lhSaveConfig_('lh_cas_ccps_api_url', 'https://script.google.com/macros/s/X/exec');
  const r = env.exported.checkCasServerSignIn();
  assert.equal(r.cas.success, false);
  assert.match(env.logs.join('\n'), /refused: Token audience mismatch\./);
});
