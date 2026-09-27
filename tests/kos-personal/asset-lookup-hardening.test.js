'use strict';
// Regression tests for kos-personal's name-based Drive lookups:
// _findSystemAssetByName_() and its three callers, _getSystemAsset(),
// setupRoutingProperties() and _registerDocPointers().
//
// All three used to take the FIRST item with a matching name. A "Copy of"
// folder, a backup, or something shared with this account could silently
// become the live asset, and every later write would go there. A missing ID
// at least fails loudly; a wrong one doesn't. These pin the replacement
// rules: the trash doesn't count, duplicates are refused unless exactly one
// sits inside the system's own folder tree, and a stored ID that still
// works is never replaced by a name match.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];
const EXPOSE = ['CFG', '_findSystemAssetByName_', '_getSystemAsset', 'setupRoutingProperties',
  '_registerDocPointers'];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// A folder DriveApp's flat name search can see, under `parent`.
function folder(sandbox, parent, name) {
  const f = parent.createFolder(name);
  sandbox.DriveApp._registerFolder(f);
  return f;
}

function seedRoot(sandbox, exported) {
  const root = folder(sandbox, sandbox.DriveApp.getRootFolder(), exported.CFG.SYSTEM_NAME);
  sandbox.PropertiesService.getScriptProperties().setProperty('ID_ROOT_SYSTEM_FOLDER', root.getId());
  return root;
}

const props = (sandbox) => sandbox.PropertiesService.getScriptProperties();

// ── _findSystemAssetByName_ ──────────────────────────────────────────────

test('a single match is returned', () => {
  const { exported, sandbox } = load();
  const f = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  assert.deepEqual(exported._findSystemAssetByName_('04_Council_Logs', true), { id: f.getId() });
});

test('nothing by that name is reported as not found', () => {
  const { exported } = load();
  const r = exported._findSystemAssetByName_('04_Council_Logs', true);
  assert.equal(r.notFound, true);
  assert.equal(r.id, undefined);
});

test('a trashed item does not count, so a trashed duplicate is not ambiguity', () => {
  const { exported, sandbox } = load();
  const live = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs').setTrashed(true);
  assert.deepEqual(exported._findSystemAssetByName_('04_Council_Logs', true), { id: live.getId() });
});

test('two live matches with no way to tell them apart are refused, not guessed', () => {
  const { exported, sandbox } = load();
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  const r = exported._findSystemAssetByName_('04_Council_Logs', true);
  assert.equal(r.id, undefined);
  assert.equal(r.notFound, false);
  assert.match(r.error, /2 items named "04_Council_Logs".*refusing to guess/);
});

test('among duplicates, the single one inside the system folder tree wins', () => {
  const { exported, sandbox } = load();
  const root = seedRoot(sandbox, exported);
  const logs = folder(sandbox, root, '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs'); // a backup elsewhere
  assert.deepEqual(exported._findSystemAssetByName_('04_Council_Logs', true), { id: logs.getId() });
});

test('duplicates that are both inside the system tree are still refused', () => {
  const { exported, sandbox } = load();
  const root = seedRoot(sandbox, exported);
  folder(sandbox, root, '04_Council_Logs');
  folder(sandbox, folder(sandbox, root, 'archive'), '04_Council_Logs');
  assert.match(exported._findSystemAssetByName_('04_Council_Logs', true).error, /refusing to guess/);
});

test('a search scoped to one folder only looks there', () => {
  const { exported, sandbox } = load();
  const home = folder(sandbox, sandbox.DriveApp.getRootFolder(), '03.1_CURRENT_STATE');
  const doc = sandbox.DocumentApp.create('CURRENT_STATE');
  sandbox.DriveApp.getFileById(doc.getId()).moveTo(home);
  sandbox.DocumentApp.create('CURRENT_STATE'); // same name, elsewhere in Drive
  assert.deepEqual(exported._findSystemAssetByName_('CURRENT_STATE', false, home), { id: doc.getId() });
});

// ── _getSystemAsset ──────────────────────────────────────────────────────

test('_getSystemAsset: a broken ID plus two candidates throws and leaves the property alone', () => {
  const { exported, sandbox } = load();
  props(sandbox).setProperty('ID_04_COUNCIL_LOGS', 'deleted-folder-id');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');

  assert.throws(() => exported._getSystemAsset('04_Council_Logs', 'ID_04_COUNCIL_LOGS', true),
    /ID_04_COUNCIL_LOGS.*refusing to guess/);
  assert.equal(props(sandbox).getProperty('ID_04_COUNCIL_LOGS'), 'deleted-folder-id',
    'a guess must never be written back');
});

test('_getSystemAsset: a broken ID with one live candidate is re-found and saved', () => {
  const { exported, sandbox } = load();
  props(sandbox).setProperty('ID_04_COUNCIL_LOGS', 'deleted-folder-id');
  const logs = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');

  // (Return values cross the sandbox boundary without their methods, so
  // the saved property is the thing to check.)
  assert.doesNotThrow(() => exported._getSystemAsset('04_Council_Logs', 'ID_04_COUNCIL_LOGS', true));
  assert.equal(props(sandbox).getProperty('ID_04_COUNCIL_LOGS'), logs.getId());
});

test('_getSystemAsset: nothing to find keeps the original, actionable message', () => {
  const { exported } = load();
  assert.throws(() => exported._getSystemAsset('04_Council_Logs', 'ID_04_COUNCIL_LOGS', true),
    /Asset not found: "04_Council_Logs"\. Run deployFullSystem\(\) first\./);
});

// ── setupRoutingProperties ───────────────────────────────────────────────

test('setupRoutingProperties: a working ID is kept even when a same-named copy exists', () => {
  const { exported, sandbox } = load();
  const real = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), 'Copy of stuff').createFolder('04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs'); // a flat-search duplicate
  props(sandbox).setProperty('ID_04_COUNCIL_LOGS', real.getId());

  const r = exported.setupRoutingProperties();
  assert.equal(props(sandbox).getProperty('ID_04_COUNCIL_LOGS'), real.getId());
  assert.ok(r.kept >= 1);
  assert.ok(!r.ambiguous.includes('ID_04_COUNCIL_LOGS'));
});

test('setupRoutingProperties: a trashed stored ID is replaced by the one live match', () => {
  const { exported, sandbox } = load();
  const old = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  old.setTrashed(true);
  const live = folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  props(sandbox).setProperty('ID_04_COUNCIL_LOGS', old.getId());

  exported.setupRoutingProperties();
  assert.equal(props(sandbox).getProperty('ID_04_COUNCIL_LOGS'), live.getId());
});

test('setupRoutingProperties: ambiguous names are reported and left unset, not guessed', () => {
  const { exported, sandbox } = load();
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');
  folder(sandbox, sandbox.DriveApp.getRootFolder(), '04_Council_Logs');

  const r = exported.setupRoutingProperties();
  assert.ok(r.ambiguous.includes('ID_04_COUNCIL_LOGS'));
  assert.equal(props(sandbox).getProperty('ID_04_COUNCIL_LOGS'), null);
});

// ── _registerDocPointers ─────────────────────────────────────────────────

test('_registerDocPointers: two same-named docs in the folder are not guessed between', () => {
  const { exported, sandbox } = load();
  const f031 = folder(sandbox, sandbox.DriveApp.getRootFolder(), '03.1_CURRENT_STATE');
  const f032 = folder(sandbox, sandbox.DriveApp.getRootFolder(), '03.2_PIVOTS_AND_LESSONS');
  [0, 1].forEach(() => {
    const d = sandbox.DocumentApp.create('CURRENT_STATE');
    sandbox.DriveApp.getFileById(d.getId()).moveTo(f031);
  });
  const pivots = sandbox.DocumentApp.create('PIVOTS_AND_LESSONS_V1.0');
  sandbox.DriveApp.getFileById(pivots.getId()).moveTo(f032);

  exported._registerDocPointers({ f03_1: f031, f03_2: f032 });
  assert.equal(props(sandbox).getProperty('ID_CURRENT_STATE'), null);
  assert.equal(props(sandbox).getProperty('ID_PIVOTS_AND_LESSONS'), pivots.getId());
});
