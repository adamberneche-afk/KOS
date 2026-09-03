'use strict';
// Regression tests for gas-lint's Checks J and K — the two doctrine rules
// that are about the TESTS rather than about the GAS source.
//
// Check J (FLOW_DOCTRINE.md rule 4 for existence, rule 5 for the consumer): a
// fixture must be read back, and read back by the code that reads it in
// production. A fixture asserted only against itself is self-consistent by
// construction — the test re-derives the expected shape from the same code
// that wrote it — so a fixture whose shape its consumer cannot read passes.
// Five of this repo's six fixtures had exactly that defect and none of them
// produced an error anywhere. Rule 4 was prose in five places while that was
// true.
//
// Check K (rule 12): a sandbox must load the scope its code runs in. GAS
// concatenates every file bound to a project into one global scope, so a
// function's collaborators are in scope in production whether or not a test
// loaded them. installFlow2Fixture() seeded an empty PromptText for weeks
// because the test loaded neither 15b nor 40 and _fiBuildPromptText_ returns
// "" instead of throwing when they are missing. The tests below reconstruct
// that exact file list and assert the analysis catches it — a check for this
// class of bug is worth nothing unless it would have caught the one that
// happened.
//
// findSandboxLoads, findDeclRefs and findScopeGaps are the units. The checks
// themselves walk the whole test tree, so asserting on their output directly
// would fail whenever a test legitimately changed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  findSandboxLoads,
  isToolTest,
  findDeclRefs,
  findScopeGaps,
  projectForBasenames,
  listTestFiles,
  FIXTURE_CONSUMER_ROLES,
  stripCommentsAndStrings,
} = require('../../tools/gas-lint/check.js');

const REPO_ROOT = path.join(__dirname, '..', '..');
const FLOW_MAP = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tools', 'gas-lint', 'flow-map.json'), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ── findSandboxLoads ─────────────────────────────────────────────────────────

test('reads an inline loadGasFiles call', () => {
  const src = `
    const { exported } = loadGasFiles(['/a/00_SharedConfig.js'], ['getConfig_']);
  `;
  const loads = findSandboxLoads(src);
  assert.equal(loads.length, 1);
  assert.deepEqual(loads[0].files, ['00_SharedConfig.js']);
  assert.deepEqual(loads[0].expose, ['getConfig_']);
});

test('expands FILES and EXPOSE constants, which is how every test here writes it', () => {
  // Not one test file in this repo passes both arguments inline, so an
  // analysis that only read literals would report zero loads everywhere and
  // pass for lack of findings — the way Check D once did.
  const src = `
    const S = (f) => path.join(__dirname, 'scripts', f);
    const FILES = [S('00_SharedConfig.js'), S('37_FlowInputBuilder.js')];
    const EXPOSE = ['buildFlowInputRows', 'FI'];
    function load() { return loadGasFiles(FILES, EXPOSE); }
  `;
  const [load] = findSandboxLoads(src);
  assert.deepEqual(load.files, ['00_SharedConfig.js', '37_FlowInputBuilder.js']);
  assert.deepEqual(load.expose, ['buildFlowInputRows', 'FI']);
});

test('a concatenated file list is read too', () => {
  const src = `
    const FILES = [S('00_SharedConfig.js')];
    loadGasFiles(FILES.concat([S('40_FlowPrompts.js')]), ['x']);
  `;
  const [load] = findSandboxLoads(src);
  assert.deepEqual(load.files.sort(), ['00_SharedConfig.js', '40_FlowPrompts.js']);
});

test('a filename mentioned in a comment is NOT counted as loaded', () => {
  // The failure that would make Check K claim coverage it does not have:
  // every test file in this repo discusses its own dependencies in prose
  // above the file list, often naming the very file it is missing.
  const src = `
    // 40_FlowPrompts.js holds substituteFlowPrompt_ and is deliberately absent.
    const FILES = [S('37_FlowInputBuilder.js')];
    loadGasFiles(FILES, ['x']);
  `;
  const [load] = findSandboxLoads(src);
  assert.deepEqual(load.files, ['37_FlowInputBuilder.js']);
});

test('both .js and .gs extensions resolve', () => {
  const src = `loadGasFiles([path.join(LH, 'EmailBridge.gs'), S('00_SharedConfig.js')], ['a']);`;
  const [load] = findSandboxLoads(src);
  assert.deepEqual(load.files.sort(), ['00_SharedConfig.js', 'EmailBridge.gs']);
});

test('several sandboxes in one file are reported separately', () => {
  const src = `
    loadGasFiles([S('a.js')], ['one']);
    loadGasFiles([S('b.js')], ['two']);
  `;
  assert.equal(findSandboxLoads(src).length, 2);
  assert.deepEqual(findSandboxLoads(src).map(l => l.expose[0]), ['one', 'two']);
});

test('a file with no sandbox at all yields nothing', () => {
  assert.deepEqual(findSandboxLoads('const x = 1;\n'), []);
});

// ── findDeclRefs ─────────────────────────────────────────────────────────────

test('collects the identifiers each top-level declaration references', () => {
  const rel = 'cas-ccps/scripts/37_FlowInputBuilder.js';
  const refs = findDeclRefs(rel);
  assert.ok(refs.harvestFlowInputResults, 'the harvest is a top-level declaration');
  assert.ok(refs.harvestFlowInputResults.has('_parseFlow2Response_'),
    'and it reaches 15c\'s parser');
});

test('constants count as references, not just calls', () => {
  // Half of the PromptText incident was a missing CONST: _fiBuildPromptText_
  // needs both substituteFlowPrompt_() and FLOW_2_SYSTEM_PROMPT, and a
  // call-shaped pattern would have found only the first while the fixture
  // still seeded an empty prompt.
  const refs = findDeclRefs('cas-ccps/scripts/37_FlowInputBuilder.js');
  assert.ok(refs._fiBuildPromptText_.has('FLOW_2_SYSTEM_PROMPT'));
  assert.ok(refs._fiBuildPromptText_.has('substituteFlowPrompt_'));
});

// ── findScopeGaps: the incident, reconstructed ───────────────────────────────

const HISTORICAL_FIXTURE_SCOPE = [
  '00_SharedConfig.js', '22_LessonContextHandler.js', '24_WarmUpBridge.js',
  '25_WarmUpWriter.js', '37_FlowInputBuilder.js', '39_FlowFixtures.js',
  '41_WarmUpFlowBridge.js',
];

test('the historical fixture sandbox is reported as having a hole', () => {
  const gaps = findScopeGaps('cas-ccps:central-ledger', HISTORICAL_FIXTURE_SCOPE,
    ['installFlowFixtures', 'installFlow2Fixture', 'installWarmUpFixtures']);
  const names = gaps.map(g => g.name);
  assert.ok(names.indexOf('substituteFlowPrompt_') !== -1,
    'the function half of the empty-PromptText bug: ' + names.join(', '));
  assert.ok(names.indexOf('FLOW_2_SYSTEM_PROMPT') !== -1,
    'the constant half: ' + names.join(', '));
  gaps.filter(g => g.name === 'substituteFlowPrompt_').forEach((g) => {
    assert.match(g.declaredIn, /40_FlowPrompts\.js$/, 'and names the file to add');
    assert.equal(g.via, '_fiBuildPromptText_', 'and the function that needed it');
  });
});

test('adding the two files closes it', () => {
  const gaps = findScopeGaps('cas-ccps:central-ledger',
    HISTORICAL_FIXTURE_SCOPE.concat(['15b_StudioFlowPrompts_Flow2_Revised.js', '40_FlowPrompts.js']),
    ['installFlowFixtures', 'installFlow2Fixture', 'installWarmUpFixtures']);
  assert.deepEqual(gaps.map(g => g.name), []);
});

test('reachability is what keeps this quiet — an unexercised collaborator is not a gap', () => {
  // Without the reachability filter the same analysis reports every
  // collaborator of every loaded file: nine findings on this one sandbox,
  // none of them reachable from what the test drives. A check that noisy gets
  // muted, which is worse than not having it.
  const noEntryPoints = findScopeGaps('cas-ccps:central-ledger',
    HISTORICAL_FIXTURE_SCOPE, []);
  assert.deepEqual(noEntryPoints, [],
    'nothing exposed means nothing exercised means nothing to report');

  // 22_LessonContextHandler.js reaches generateLessonFrame_ in 27, which the
  // fixture sandbox does not load and the fixtures never call.
  const withFixtures = findScopeGaps('cas-ccps:central-ledger',
    HISTORICAL_FIXTURE_SCOPE, ['installFlow2Fixture']);
  assert.ok(withFixtures.every(g => g.name !== 'generateLessonFrame_'),
    'reported a collaborator the test never reaches');
});

test('an allowed name is not reported', () => {
  const gaps = findScopeGaps('cas-ccps:central-ledger', HISTORICAL_FIXTURE_SCOPE,
    ['installFlow2Fixture'], new Set(['substituteFlowPrompt_', 'FLOW_2_SYSTEM_PROMPT']));
  assert.deepEqual(gaps.map(g => g.name), [],
    'sandboxScope.allow in flow-map.json is the documented escape hatch');
});

test('an unknown project is not a crash', () => {
  assert.deepEqual(findScopeGaps('cas-ccps:nonexistent', ['a.js'], ['b']), []);
});

// ── The repo holds the property, not just the check ──────────────────────────

test('every sandbox in the test tree is closed over what it exercises', () => {
  // The same property Check K enforces, asserted here so `npm test` alone
  // catches a narrowed sandbox even when nobody runs the linter.
  const allow = (FLOW_MAP.sandboxScope && FLOW_MAP.sandboxScope.allow) || {};
  const found = [];
  for (const testFile of listTestFiles()) {
    // Skipped for the same reason Check K skips it: this very file contains
    // literal loadGasFiles(...) snippets as test input, and analysing those
    // as real sandboxes produced seven findings against a project they never
    // load.
    if (isToolTest(testFile)) continue;
    const allowed = new Set(((allow[testFile] || {}).names) || []);
    for (const load of findSandboxLoads(read(testFile))) {
      if (!load.files.length) continue;
      const project = projectForBasenames(load.files);
      if (!project) continue;
      for (const gap of findScopeGaps(project, load.files, load.expose, allowed)) {
        found.push(`${testFile}: ${gap.via}() needs ${gap.name} from ${gap.declaredIn}`);
      }
    }
  }
  assert.deepEqual(found, [], 'sandbox scope gaps:\n' + found.join('\n'));
});

test('every declared fixture is driven through one of its flow\'s consumers', () => {
  // Check J's property. tests/tools/ is excluded on purpose: the files in
  // here quote flow-map.json's function names as strings, so counting them
  // would let every surface pass on the strength of the linter's own tests.
  const testFiles = listTestFiles().filter(f => !isToolTest(f));
  const src = {};
  for (const f of testFiles) src[f] = stripCommentsAndStrings(read(f), { keepStrings: true });
  const mentions = (file, name) => new RegExp('\\b' + name + '\\b').test(src[file]);

  for (const [surface, def] of Object.entries(FLOW_MAP.flowSurfaces || {})) {
    if (!def.fixture) continue;
    const installing = testFiles.filter(f => mentions(f, def.fixture));
    assert.ok(installing.length, surface + ': ' + def.fixture + '() is exercised by no test');

    const consumers = FIXTURE_CONSUMER_ROLES.map(r => def[r]).filter(Boolean);
    if (!consumers.length) continue;
    const driven = installing.filter(f => consumers.some(fn => mentions(f, fn)));
    assert.ok(driven.length,
      surface + ': ' + def.fixture + '() is never driven through any of ' +
      consumers.join(', ') + ' — see meta/FLOW_DOCTRINE.md rule 5');
  }
});

test('the canary is deliberately not counted as a fixture consumer', () => {
  // A canary stubs the Flow and seeds its own row, so naming it would satisfy
  // Check J without ever reading the fixture. Pinned because the list is
  // short enough to "helpfully" extend.
  assert.deepEqual(FIXTURE_CONSUMER_ROLES,
    ['materialize', 'harvest', 'binding', 'liveness']);
});

test('the Flow 2 fixture is driven through the harvest specifically', () => {
  // The gap Check J found on its first run. The column-level tests above it
  // all passed while the fixture pointed at a document the harvest could not
  // open — verified by injection, since only the harvest tests failed.
  const src = read('tests/cas-ccps/flow-fixtures.test.js');
  assert.match(src, /exported\.harvestFlowInputResults\(\)/);
  assert.match(src, /ERROR_EMPTY_OUTPUT/,
    'including the Flow-fired-but-returned-nothing case');
});

test('tests/tools/ really does name fixture functions, so the exclusion is load-bearing', () => {
  const own = read('tests/tools/gas-lint-flow-map.test.js') + read(__filename.slice(REPO_ROOT.length + 1));
  const fixtures = Object.values(FLOW_MAP.flowSurfaces || {})
    .map(d => d.fixture).filter(Boolean);
  assert.ok(fixtures.some(fn => own.indexOf(fn) !== -1),
    'if this ever stops being true the exclusion can go, but do not assume it');
});

test('a tools test is recognised as one, and a system test is not', () => {
  assert.equal(isToolTest('tests/tools/gas-lint-test-scope.test.js'), true);
  assert.equal(isToolTest('tests/cas-ccps/flow-fixtures.test.js'), false);
  assert.equal(isToolTest('tests/leaderhub/flow-ops.test.js'), false);
});
