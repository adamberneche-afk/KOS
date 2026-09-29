'use strict';
// The co-advisor share code, "<orgId>@<bridge /exec URL>": the page's own
// _parseOrgShareCode_() (leader-hub/src/11-...html), run from source.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function fnSource(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + ' not found');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'src',
  '11-journal-cron-settings-and-sync.html'), 'utf8');
// eslint-disable-next-line no-new-func
const parse = new Function(fnSource(SRC, '_parseOrgShareCode_') + '; return _parseOrgShareCode_;')();

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
