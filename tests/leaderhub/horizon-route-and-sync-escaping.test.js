'use strict';
// LeaderHub's two security items (2026-11-15).
//
// 1. doGet() answered `?api=horizon` before its owner check, so any account
//    in the domain got JSON from it. The route is gone, so the request now
//    meets the owner check like every other GET. (The Gmail horizon source
//    behind it was retired 2026-11-23, with lhGetHorizonItems.)
// 2. Values that come from another account (an org pulled from a shared
//    bridge) or from mail (horizon and deadline items) reached the page in
//    four places without escaping: a horizon item's id in an attribute and in
//    onclick handlers, a deadline's role in onclick, a deadline's id in an id
//    attribute, and an org id in the org tabs and the Add-result button. Each
//    now goes through escH() or escJsAttr(). These pins read the fragments
//    the page is built from (leader-hub/src/), and the built page must match
//    (tools/leaderhub-build --check).
// The org-sync allowlist itself is tested in org-sync-relay.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const SRC = (f) => fs.readFileSync(path.join(LH, 'src', f), 'utf8');

function doGetAs(viewer) {
  const html = [];
  const out = (content) => ({ content, setTitle() { return this; }, setXFrameOptionsMode() { return this; }, getContent() { return content; } });
  const loaded = loadGasFiles(['Data.gs', 'Config.gs', 'SCR.gs', 'DeployVersionMarker.gs', 'Code.gs', 'EmailBridge.gs', 'Diagnostics.gs'].map((f) => path.join(LH, f)), ['doGet'], {
    Session: { getActiveUser() { return { getEmail() { return viewer; } }; }, getScriptTimeZone() { return 'America/New_York'; } },
    HtmlService: {
      createHtmlOutput(c) { html.push(c); return out(c); },
      createHtmlOutputFromFile() { return out('<html></html>'); },
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput() { throw new Error('JSON was served'); } },
  });
  loaded.sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', 'owner@ccpsnet.net');
  // The raw function (no cross-realm copy): its output carries methods.
  return { res: loaded.sandbox.__exported.doGet({ parameter: { api: 'horizon' } }), html };
}

test('?api=horizon from an account that is not the owner gets the owner check, not JSON', () => {
  const { res } = doGetAs('student1@ccpsnet.net');
  assert.match(res.content, /Not authorized/);
});

test('the horizon GET handler is gone from the bridge', () => {
  const code = fs.readFileSync(path.join(LH, 'Code.gs'), 'utf8');
  const bridge = fs.readFileSync(path.join(LH, 'EmailBridge.gs'), 'utf8');
  assert.doesNotMatch(code, /e\.parameter\.api === 'horizon'/);
  assert.doesNotMatch(bridge, /function emailBridgeGetHorizonItems_/);
  assert.doesNotMatch(code + bridge, /lhGetHorizonItems|scanHorizonLabel_|markConsumed/, 'the Gmail horizon source is retired');
});

test('a horizon item\'s id and text are escaped wherever the page writes them', () => {
  const src = SRC('10-command-engine-ai-and-widgets.html');
  const start = src.indexOf('el.innerHTML=HORIZON[h].map(item=>');
  const block = src.slice(start, src.indexOf(".join('')", start));
  assert.ok(start !== -1 && block.length > 100, 'the horizon renderer is found');
  assert.doesNotMatch(block, /\$\{item\.id\}/, 'no raw id');
  assert.doesNotMatch(block, /\$\{item\.text\}|\(item\.text\|\|''\)\.replace/, 'no raw or quote-only text');
  assert.match(block, /data-hid="\$\{escH\(item\.id\)\}"/);
  assert.equal((block.match(/horizonToggle\('\$\{h\}','\$\{escJsAttr\(item\.id\)\}'\)/g) || []).length, 3);
  assert.match(block, /horizonDelete\('\$\{h\}','\$\{escJsAttr\(item\.id\)\}'\)/);
});

test('a deadline\'s role and id are escaped in the deadline list', () => {
  const src = SRC('10-command-engine-ai-and-widgets.html');
  assert.doesNotMatch(src, /showView\('\$\{target\}'\)/, 'the role from a mail item never reaches onclick raw');
  assert.equal((src.match(/showView\('\$\{escJsAttr\(target\)\}'\)/g) || []).length, 2);
  assert.match(src, /id="dltimer-\$\{escH\(dl\.id\)\}"/);
});

test('an org id from a share code or a pull is escaped in the org tabs and the Add-result button', () => {
  const src = SRC('07-events-email-members-goals.html');
  assert.doesNotMatch(src, /id="orgtab-\$\{id\}"/);
  assert.doesNotMatch(src, /addOrgResult\('\$\{orgId\}'\)/);
  assert.match(src, /id="orgtab-\$\{escH\(id\)\}" onclick="setOrgTab\('\$\{escJsAttr\(id\)\}',this\)">\$\{escH\(o\.icon\|\|'🧩'\)\} \$\{escH\(o\.name\)\}/);
  assert.match(src, /addOrgResult\('\$\{escJsAttr\(orgId\)\}'\)/);
});
