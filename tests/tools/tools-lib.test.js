'use strict';
// tools/lib (structure audit 3.9): the helpers the tools share instead of
// copying. zip (one reader, one writer), js-source (the comment stripper),
// repo (root, tracked files, project map), prompt-constants.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zip = require('../../tools/lib/zip.js');
const js = require('../../tools/lib/js-source.js');
const repo = require('../../tools/lib/repo.js');
const pc = require('../../tools/lib/prompt-constants.js');

test('zip: what writeZip writes, readZip and zipEntries read back, byte for byte', () => {
  const buf = zip.writeZip([['a.txt', 'hello'], ['dir/b.xml', Buffer.from('<x/>')]]);
  assert.deepEqual(Object.fromEntries(Object.entries(zip.readZip(buf)).map(([k, v]) => [k, v.toString()])),
    { 'a.txt': 'hello', 'dir/b.xml': '<x/>' });
  assert.deepEqual(zip.zipEntries(buf).map((e) => e.name), ['a.txt', 'dir/b.xml']);
  assert.deepEqual(zip.writeZip([['a.txt', 'hello']]), zip.writeZip([['a.txt', 'hello']]), 'deterministic');
});

test('zip: a member over the cap reads as null; a damaged or foreign file throws ZipError', () => {
  const buf = zip.writeZip([['big.txt', 'x'.repeat(5000)]]);
  assert.equal(zip.zipRead(buf, zip.zipEntries(buf)[0], 100), null);
  assert.throws(() => zip.zipEntries(Buffer.from('not a zip at all, just text here')), zip.ZipError);
  const bad = Buffer.from(buf); bad[40] ^= 0xff; // inside the deflated data
  assert.throws(() => zip.readZip(bad), zip.ZipError);
});

test('zip: crc32 is the standard one', () => {
  assert.equal(zip.crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('js-source: comments, strings and regex literals blanked, length and lines kept', () => {
  const src = "const a = 'x // not a comment'; // gone\nconst r = /{2,4}/g; /* gone\n too */ f();";
  const out = js.stripCommentsAndStrings(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.doesNotMatch(out, /gone|not a comment|\{2,4\}/);
  assert.match(out, /f\(\);/);
  assert.equal(js.lineAt(src, src.indexOf('f();')), 3);
  assert.ok(js.ALLOWLIST.has('SpreadsheetApp') && js.ALLOWLIST.has('if'));
});

test('js-source: gas-lint still exports the same functions', () => {
  const gl = require('../../tools/gas-lint/check.js');
  assert.equal(gl.stripCommentsAndStrings, js.stripCommentsAndStrings);
});

test('repo: ROOT is the repo, trackedFiles lists tracked files, projectMap is the map', () => {
  assert.ok(fs.existsSync(path.join(repo.ROOT, 'package.json')));
  assert.ok(repo.trackedFiles().includes('tools/lib/repo.js') || repo.trackedFiles().includes('package.json'));
  assert.ok(repo.projectMap()['cas-ccps:central-ledger'].files.length > 10);
});

test('prompt-constants: replaces one named constant, escapes, and never reads $ as a pattern', () => {
  const src = 'const A = `\nold\n`.trim();\nconst B = `\nkeep\n`.trim();';
  const out = pc.replaceTemplateConstant(src, 'A', 'new `tick` ${x} $& $1', 'f.js');
  assert.match(out, /const A = `\nnew \\`tick\\` \\\$\{x\} \$& \$1\n`\.trim\(\);/);
  assert.match(out, /const B = `\nkeep\n`\.trim\(\);/);
  assert.throws(() => pc.replaceTemplateConstant(src, 'C', 'x', 'f.js'), /f\.js: could not find "const C/);
});
