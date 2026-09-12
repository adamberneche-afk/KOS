'use strict';
// Regression tests for tools/coverage-gaps/check.js's pure units.
//
// Not the check's main()/full run — that spawns `npm test` as a
// subprocess to collect real coverage, which would mean the test suite
// recursively running itself. Same "test the pure unit, not the
// repo-walking entry point" shape tests/tools/gas-lint-gcp.test.js's own
// header explains for exactly this reason.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  findTriggerHandlers, mergeCoverage, productionFiles, loadAllowlist, definesFunction,
} = require('../../tools/coverage-gaps/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');

function withTempFile(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gaps-test-'));
  const file = path.join(dir, 'scratch.gs');
  fs.writeFileSync(file, content, 'utf8');
  try {
    return fn(file, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── findTriggerHandlers() ────────────────────────────────────────────────

test('findTriggerHandlers: extracts a single-quoted literal handler name', () => {
  withTempFile("function setup() {\n  ScriptApp.newTrigger('myHandler').timeBased().create();\n}\n", (file) => {
    const { resolved, unresolved } = findTriggerHandlers(file, 'scratch.gs');
    assert.deepEqual(resolved.map((r) => r.name), ['myHandler']);
    assert.equal(unresolved.length, 0);
  });
});

test('findTriggerHandlers: extracts a double-quoted literal handler name (cas-ccps style)', () => {
  withTempFile('function setup() {\n  ScriptApp.newTrigger("myHandler").timeBased().create();\n}\n', (file) => {
    const { resolved } = findTriggerHandlers(file, 'scratch.gs');
    assert.deepEqual(resolved.map((r) => r.name), ['myHandler']);
  });
});

test('findTriggerHandlers: a non-literal (variable) handler name is reported as unresolved, not silently skipped', () => {
  withTempFile('function setup(h) {\n  ScriptApp.newTrigger(h.fn).timeBased().create();\n}\n', (file) => {
    const { resolved, unresolved } = findTriggerHandlers(file, 'scratch.gs');
    assert.equal(resolved.length, 0);
    assert.deepEqual(unresolved, [{ expr: 'h.fn', line: 2, file: 'scratch.gs' }]);
  });
});

test('findTriggerHandlers: multiple calls in one file are all found', () => {
  const src = "function setup() {\n" +
    "  ScriptApp.newTrigger('first').timeBased().create();\n" +
    "  ScriptApp.newTrigger('second').timeBased().create();\n}\n";
  withTempFile(src, (file) => {
    const { resolved } = findTriggerHandlers(file, 'scratch.gs');
    assert.deepEqual(resolved.map((r) => r.name), ['first', 'second']);
  });
});

test('findTriggerHandlers: a commented-out registration is ignored', () => {
  const src = "// ScriptApp.newTrigger('shouldNotCount').timeBased().create();\n" +
    "function setup() {\n  ScriptApp.newTrigger('real').timeBased().create();\n}\n";
  withTempFile(src, (file) => {
    const { resolved } = findTriggerHandlers(file, 'scratch.gs');
    assert.deepEqual(resolved.map((r) => r.name), ['real']);
  });
});

// ── definesFunction() ────────────────────────────────────────────────────

test('definesFunction: true for a real top-level function declaration', () => {
  withTempFile('function realFn() {}\n', (file) => {
    assert.equal(definesFunction(file, 'realFn'), true);
  });
});

test('definesFunction: false when only a similarly-named function exists', () => {
  withTempFile('function realFnSuffix() {}\n', (file) => {
    assert.equal(definesFunction(file, 'realFn'), false);
  });
});

test('definesFunction: false when the name only appears as a call, not a declaration', () => {
  withTempFile('function other() {\n  realFn();\n}\n', (file) => {
    assert.equal(definesFunction(file, 'realFn'), false);
  });
});

// ── mergeCoverage() ───────────────────────────────────────────────────────

function writeCoverageFile(dir, name, result) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify({ result }), 'utf8');
}

test('mergeCoverage: sums hit counts for the same function across multiple coverage files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gaps-merge-'));
  try {
    writeCoverageFile(dir, 'a.json', [
      { url: 'file:///repo/foo.gs', functions: [
        { functionName: '', ranges: [{ startOffset: 0, endOffset: 100, count: 1 }] },
        { functionName: 'covered', ranges: [{ startOffset: 0, endOffset: 10, count: 1 }] },
      ] },
    ]);
    writeCoverageFile(dir, 'b.json', [
      { url: 'file:///repo/foo.gs', functions: [
        { functionName: 'covered', ranges: [{ startOffset: 0, endOffset: 10, count: 0 }] },
        { functionName: 'neverCalled', ranges: [{ startOffset: 20, endOffset: 30, count: 0 }] },
      ] },
    ]);
    const hits = mergeCoverage(dir);
    assert.equal(hits.get('/repo/foo.gs::covered'), 1, 'hit in file a, missed in file b — still covered overall');
    assert.equal(hits.get('/repo/foo.gs::neverCalled') || 0, 0);
    assert.equal(hits.has('/repo/foo.gs::'), false, 'the whole-script "" entry must not be treated as a function');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeCoverage: ignores non-file:// URLs (node internals, etc.) without throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gaps-merge-'));
  try {
    writeCoverageFile(dir, 'a.json', [
      { url: 'node:internal/main/run_main_module', functions: [
        { functionName: 'internalFn', ranges: [{ startOffset: 0, endOffset: 10, count: 5 }] },
      ] },
    ]);
    assert.doesNotThrow(() => mergeCoverage(dir));
    assert.equal(mergeCoverage(dir).size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mergeCoverage: tolerates a malformed/unparseable coverage file rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gaps-merge-'));
  try {
    fs.writeFileSync(path.join(dir, 'broken.json'), '{not valid json', 'utf8');
    assert.doesNotThrow(() => mergeCoverage(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── productionFiles() / loadAllowlist() — real repo data ────────────────

test('productionFiles: excludes .html files, includes a known real source file', () => {
  const files = productionFiles();
  assert.ok(files.every((f) => !f.relPath.endsWith('.html')));
  assert.ok(files.some((f) => f.relPath === 'kos-personal/2_Ingestion_Sensors.gs'));
});

test('loadAllowlist: every entry in the real allowlist has a file, function, and reason', () => {
  const raw = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'tools', 'coverage-gaps', 'allowlist.json'), 'utf8'));
  raw.forEach((entry) => {
    assert.ok(entry.file, 'every allowlist entry needs a file');
    assert.ok(entry.function, 'every allowlist entry needs a function');
    assert.ok(entry.reason && entry.reason.length > 10, 'every allowlist entry needs a real reason, not a placeholder');
  });
  const set = loadAllowlist();
  assert.equal(set.size, raw.length, 'no duplicate file::function keys in the real allowlist');
});
