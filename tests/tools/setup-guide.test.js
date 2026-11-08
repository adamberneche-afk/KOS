'use strict';
// tools/setup-guide/build.js (packaging step 2): the reference half of the
// CAS setup guide, generated from the code. The committed file must match
// what the code produces (the drift gate CI also runs), and the extractors
// resolve what they can and list the rest as not resolved, never guessing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const sg = require('../../tools/setup-guide/build.js');

const ROOT = path.join(__dirname, '..', '..');
const BUILD = path.join(ROOT, 'tools', 'setup-guide', 'build.js');

function project(files) {
  return sg.loadProject(Object.keys(files), (rel) => files[rel]);
}

test('the committed SETUP_GUIDE_REFERENCE.md is what the code produces', () => {
  const committed = fs.readFileSync(path.join(ROOT, sg.OUT_REL), 'utf8');
  assert.equal(committed, sg.buildReference(), 'stale: run node tools/setup-guide/build.js');
});

test('--check exits 0 on the committed file and 1 on a stale or missing one', () => {
  const ok = cp.spawnSync(process.execPath, [BUILD, '--check'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-guide-'));
  const stale = path.join(dir, 'ref.md');
  fs.writeFileSync(stale, '# old\n');
  const bad = cp.spawnSync(process.execPath, [BUILD, '--check', '--out', stale], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /stale/);
  const missing = cp.spawnSync(process.execPath, [BUILD, '--check', '--out', path.join(dir, 'none.md')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /missing/);
  // Writing to --out produces exactly what --check then accepts.
  const out = path.join(dir, 'fresh.md');
  assert.equal(cp.spawnSync(process.execPath, [BUILD, '--out', out]).status, 0);
  assert.equal(cp.spawnSync(process.execPath, [BUILD, '--check', '--out', out]).status, 0);
});

test('Script Properties: literals, constants, helpers, lists and defaults resolve; a built key is listed as not resolved', () => {
  const p = project({
    'a.js': [
      'const MY_KEY = "FROM_CONST";',
      'const PREFIX_KEY = "PART_" + 1;',
      'const KEYS = ["LIST_A", "LIST_B"];',
      'function readProp_(key, fallback) { const v = PropertiesService.getScriptProperties().getProperty(key); return v || fallback; }',
      'function a() {',
      '  const props = PropertiesService.getScriptProperties();',
      '  const x = props.getProperty("DIRECT") || "dflt";',
      '  const y = props.getProperty(MY_KEY);',
      '  const z = readProp_("VIA_HELPER", 5);',
      '  KEYS.forEach(function (k) { props.getProperty(k); });',
      '  const built = props.getProperty("CHECKPOINT_" + x);',
      '  const partial = props.getProperty(PREFIX_KEY);',
      '  // props.getProperty("IN_A_COMMENT")',
      '  props.setProperty("DIRECT", "1");',
      '}',
    ].join('\n'),
  });
  const s = sg.scanProperties(p);
  const keys = [...s.keys.keys()].sort();
  assert.deepEqual(keys, ['DIRECT', 'FROM_CONST', 'LIST_A', 'LIST_B', 'VIA_HELPER']);
  assert.deepEqual([...s.keys.get('DIRECT').defaults], ['"dflt"']);
  assert.deepEqual([...s.keys.get('VIA_HELPER').defaults], ['5']);
  assert.ok([...s.keys.get('FROM_CONST').reads][0].includes('MY_KEY'));
  assert.ok(s.writes.has('DIRECT'));
  assert.ok(!s.writes.has('FROM_CONST'));
  const exprs = s.unresolved.map((u) => u.expr).sort();
  assert.deepEqual(exprs, ['getProperty("CHECKPOINT_" + x)', 'getProperty(PREFIX_KEY)']);
});

test('triggers: handler and schedule from literals, constants and per-entry lists; a parameter is not resolved', () => {
  const p = project({
    't.js': [
      'const FN = "fromConst";',
      'function installA() { ScriptApp.newTrigger("nightly").timeBased().atHour(3).nearMinute(15).everyDays(1).create(); }',
      'function installB() { ScriptApp.newTrigger(FN).timeBased().everyMinutes(10).create(); }',
      'function installC_() {',
      '  const hs = [{ fn: "first", hour: 2 }, { fn: "second", hour: 4 }];',
      '  for (const h of hs) { ScriptApp.newTrigger(h.fn).timeBased().atHour(h.hour).everyDays(1).create(); }',
      '}',
      'function installC() { installC_(); }',
      'function weekly() { ScriptApp.newTrigger("fri").timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(5).create(); }',
      'function byParam(fn) { ScriptApp.newTrigger(fn).timeBased().everyMinutes(5).create(); }',
    ].join('\n'),
  });
  const t = sg.scanTriggers(p);
  const by = {};
  t.triggers.forEach((x) => { by[x.handler] = x; });
  assert.equal(by.nightly.schedule, 'daily, about 03:15');
  assert.equal(by.nightly.installer, 'installA');
  assert.equal(by.fromConst.schedule, 'every 10 min');
  assert.equal(by.first.schedule, 'daily, about 02:00');
  assert.equal(by.second.schedule, 'daily, about 04:00');
  assert.equal(by.second.installer, 'installC_');
  assert.equal(by.fri.schedule, 'Fridays, about 05:00');
  assert.deepEqual(t.unresolved.map((u) => u.expr), ['newTrigger(fn)']);
});

test('the reference prints no library, Drive or script ID, and names the per-install library as a gap', () => {
  const text = sg.buildReference();
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps', 'clasp', 'manifests', 'unified-manual.appsscript.json'), 'utf8'));
  manifest.dependencies.libraries.forEach((l) => assert.ok(!text.includes(l.libraryId), 'library ID printed'));
  // Nothing the release check (L1) would flag: Drive IDs, links, secrets.
  const rc = require('../../tools/release-check/check.js');
  text.split('\n').forEach((line, i) => assert.deepEqual(rc.scanLine(line).map((f) => f.rule), [], 'line ' + (i + 1)));
  assert.match(text, /Library: `CentralLedger`, version \d+/);
  assert.match(text, /\*\*Per-install values in the manifests:\*\*/);
});

test('the reference covers every cas-ccps project, its web app settings, and every declared flow check', () => {
  const text = sg.buildReference();
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'gas-lint', 'project-map.json'), 'utf8'));
  Object.keys(map).filter((k) => k.startsWith('cas-ccps:')).forEach((k) => {
    assert.ok(text.includes('### `' + k.slice('cas-ccps:'.length) + '`'), k);
  });
  assert.match(text, /executes as `USER_DEPLOYING`, access `DOMAIN`/);
  const flows = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'gas-lint', 'flow-map.json'), 'utf8')).flowSurfaces;
  Object.entries(flows).filter(([k]) => k.startsWith('cas-ccps:')).forEach(([, s]) => {
    [s.canary, s.binding, s.liveness].forEach((fn) => assert.ok(text.includes('`' + fn + '()`'), fn));
  });
  assert.doesNotMatch(text, /\(\) MISSING/, 'a declared flow check is missing from its project');
  // The Ledger cycle's jobs and the installers hidden behind a public wrapper.
  assert.match(text, /\*\*The Ledger cycle\*\* \(`LC_JOBS`\)/);
  assert.match(text, /`installWarmUpTriggers_\(\)` \(run via `installWarmUpTriggers\(\)`\)/);
});

test('claspType reads what a project is bound to', () => {
  assert.equal(sg.claspType('Central Ledger spreadsheet'), 'sheets');
  assert.equal(sg.claspType('Master Student Template Google Doc (container-bound)'), 'docs');
  assert.equal(sg.claspType('Standalone web app'), 'standalone');
  assert.equal(sg.claspType('something else'), '(not resolved)');
});
