'use strict';
// The co-advisor share code, "<orgId>@<bridge /exec URL>": the page's own
// _parseOrgShareCode_() (leader-hub/src/11-...html), run from source.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { cutDeclarations } = require('../harness/cut-declarations');

const SRC_FILE = path.join(__dirname, '..', '..', 'leader-hub', 'src', '11-journal-cron-settings-and-sync.html');
// eslint-disable-next-line no-new-func
const parse = new Function(cutDeclarations(SRC_FILE, ['_parseOrgShareCode_']) + '; return _parseOrgShareCode_;')();

test('a share code gives back the org id and the sharing advisor\'s bridge', () => {
  assert.deepEqual(parse('  FBLA@https://script.google.com/a/macros/ccpsnet.net/s/AKfyc_1/exec \n'),
    { orgId: 'fbla', bridgeUrl: 'https://script.google.com/a/macros/ccpsnet.net/s/AKfyc_1/exec' });
});

test('anything else is not a share code', () => {
  for (const bad of ['', 'fbla', 'fbla@https://example.com/exec', 'fb la@https://script.google.com/macros/s/X/exec',
    'fbla@http://script.google.com/macros/s/X/exec']) {
    assert.equal(parse(bad), null, bad);
  }
});
