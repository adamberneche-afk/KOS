'use strict';
// tests/harness/cut-declarations.js (structure audit 3.11): tests cut the code
// they run by name, on the LeaderHub build's lexer, never by line number.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cd = require('../harness/cut-declarations');

const SAMPLE = [
  "const A = { s: '}{', r: /[}{]/g, t: `${ '}' }` };",
  'function f(x) {',
  "  const inner = '}';",
  '  return x + 1;',
  '}',
  'async function g() { return 2; }',
  'let B = [1, 2]',
  '  .map((n) => n * 2)',
  'var C = 3',
].join('\n');

test('a declaration runs to its real end: braces in strings, regexes and templates do not count', () => {
  assert.equal(cd.declarationSource(SAMPLE, 'A'), "const A = { s: '}{', r: /[}{]/g, t: `${ '}' }` };");
  assert.equal(cd.declarationSource(SAMPLE, 'f'), "function f(x) {\n  const inner = '}';\n  return x + 1;\n}");
  assert.equal(cd.declarationSource(SAMPLE, 'g'), 'async function g() { return 2; }');
});

test('a statement without a semicolon ends at the line end, unless the next line continues it', () => {
  assert.equal(cd.declarationSource(SAMPLE, 'B'), 'let B = [1, 2]\n  .map((n) => n * 2)');
  assert.equal(cd.declarationSource(SAMPLE, 'C'), 'var C = 3');
});

test('a missing or twice-declared name throws instead of cutting the wrong code', () => {
  assert.throws(() => cd.declarationSource(SAMPLE, 'nope'), /no declaration of nope/);
  assert.throws(() => cd.declarationSource('function h(){}\nfunction h(){}', 'h'), /declared 2 times/);
});

test('cutDeclarations, cutSpan and cutStatement on a file; an .html file reads only its scripts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-'));
  const file = path.join(dir, 'page.html');
  fs.writeFileSync(file, "<p>Don't { open</p><script>\nconst X = 1;\nfunction y() { return X; }\nel.innerHTML = [1].map(n => `<b>${n}</b>`).join('');\n</script>");
  assert.equal(cd.cutDeclarations(file, ['y', 'X']), 'function y() { return X; }\nconst X = 1;');
  assert.equal(cd.cutSpan(file, 'X', 'y'), 'const X = 1;\nfunction y() { return X; }');
  assert.equal(cd.cutStatement(file, 'el.innerHTML = '), "el.innerHTML = [1].map(n => `<b>${n}</b>`).join('');");
  assert.throws(() => cd.cutStatement(file, 'missing text'), /is not in/);
  const spaced = path.join(dir, 'spaced.html');
  fs.writeFileSync(spaced, '<script>\nconst P = 1;\n</script >\n<p>const Q = 2;</p>\n<SCRIPT type="x">const R = 3;</SCRIPT\n>');
  assert.deepEqual(cd.listDeclarations(cd.scriptText(fs.readFileSync(spaced, 'utf8'), spaced)).map((d) => d.name), ['P', 'R'],
    'an end tag with a space or a newline before > still ends the script; markup between scripts is not read');
});

test('a LeaderHub fragment is read as part of the assembled page', () => {
  const f = path.join(__dirname, '..', '..', 'leader-hub', 'src', '06-tasks-trips-and-modals-core.html');
  assert.match(cd.cutDeclarations(f, ['escH']), /^function escH\(str\) \{[\s\S]*\}$/);
});

test('no test cuts source by line number any more', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'harness', 'extract-lines.js')));
});
