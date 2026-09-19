'use strict';
// Regression test for 6_Governance.gs's applyMutation() — the confused-
// deputy gap this account's own audit ledger flagged: onGovernanceEdit()
// reads Target_Doc_ID/Alt_Doc_ID straight from an operator-editable
// Blackboard cell with only a non-blank check, then applyMutation() opened
// and find/replaced whatever doc that ID named using this script's own
// full-Drive-scoped identity — no check that the ID was ever one of this
// system's own documents. A typo or a bad-faith cell entry could mutate
// any Doc ID the script's identity has edit access to.
//
// _isWithinSystemFolderTree_() (5_Error_And_Utilities.gs) closes the gap by
// walking the target's parent-folder chain up to CFG.SYSTEM_NAME's own
// root folder — every doc kos-personal itself creates is moved under that
// root (see every DocumentApp.create() call site across this project, each
// followed by a .moveTo()), so tree membership is this system's own
// definition of "a document we own."
//
// Loads 1_Config_And_Deploy.gs (CFG + folder-tree shape), 5_Error_And_
// Utilities.gs (_getSystemAsset/_isWithinSystemFolderTree_), and
// 6_Governance.gs (applyMutation itself) — same three-file combination
// auto-council-check.test.js already uses for this project's other
// 6_Governance.gs coverage.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
  path.join(KP, '6_Governance.gs'),
];
const EXPOSE = ['applyMutation', 'CFG', '_isWithinSystemFolderTree_'];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

// Builds the system's own root folder (named CFG.SYSTEM_NAME, exactly as
// _buildFolderTree() creates it) and caches its ID the same way
// deployFullSystem()'s _registerAllProperties() does, so
// _isWithinSystemFolderTree_() resolves it via the fast cached path
// instead of a name search.
function seedSystemRoot(sandbox, exported) {
  const root = sandbox.DriveApp.getRootFolder().createFolder(exported.CFG.SYSTEM_NAME);
  sandbox.DriveApp._registerFolder(root);
  sandbox.PropertiesService.getScriptProperties()
    .setProperty('ID_ROOT_SYSTEM_FOLDER', root.getId());
  return root;
}

function docWithTag(sandbox, folder, tag, initialText) {
  const doc = sandbox.DocumentApp.create('governed doc');
  doc.getBody().setText(initialText != null ? initialText : (tag + ' body'));
  sandbox.DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}

test('applyMutation: a doc directly inside the system root is mutated normally', () => {
  const { exported, sandbox } = load();
  const root = seedSystemRoot(sandbox, exported);
  const doc = docWithTag(sandbox, root, '{{TAG}}');

  const ok = exported.applyMutation(doc.getId(), '{{TAG}}', 'new payload');

  assert.equal(ok, true);
  assert.match(doc.getBody().getText(), /new payload/);
});

test('applyMutation: a doc several silo folders deep under the system root is still recognized as owned', () => {
  const { exported, sandbox } = load();
  const root = seedSystemRoot(sandbox, exported);
  const silo = root.createFolder('04_Council_Logs').createFolder('04_1_ARCHITECT_SILO');
  const doc = docWithTag(sandbox, silo, '{{TAG}}');

  const ok = exported.applyMutation(doc.getId(), '{{TAG}}', 'deployed deep');

  assert.equal(ok, true);
  assert.match(doc.getBody().getText(), /deployed deep/);
});

test('applyMutation: a doc outside the system folder tree entirely is refused, and left unmutated', () => {
  const { exported, sandbox } = load();
  seedSystemRoot(sandbox, exported); // root exists, but the target doc is never placed under it
  const outsiderFolder = sandbox.DriveApp.getRootFolder().createFolder('Some Unrelated Folder');
  const doc = docWithTag(sandbox, outsiderFolder, '{{TAG}}', 'original body');

  assert.throws(
    () => exported.applyMutation(doc.getId(), '{{TAG}}', 'attacker payload'),
    /not inside this system's own folder tree/
  );
  assert.equal(doc.getBody().getText(), 'original body',
    'a refused mutation must leave the target doc completely untouched');
});

test('applyMutation: a doc left sitting in Drive root (never moved into the system tree) is refused', () => {
  // DocumentApp.create() always lands a new doc in root first; a doc that
  // was never followed by a moveTo() (or was later moved back out) must
  // not be treated as owned just because the system root also lives there.
  const { exported, sandbox } = load();
  seedSystemRoot(sandbox, exported);
  const doc = sandbox.DocumentApp.create('never filed');
  doc.getBody().setText('original body');

  assert.throws(
    () => exported.applyMutation(doc.getId(), 'anything', 'attacker payload'),
    /not inside this system's own folder tree/
  );
});

test('applyMutation: a nonexistent doc ID is refused via the ownership check, not a raw Drive "not found" crash', () => {
  const { exported, sandbox } = load();
  seedSystemRoot(sandbox, exported);

  assert.throws(
    () => exported.applyMutation('this-id-does-not-exist', 'anything', 'payload'),
    /not inside this system's own folder tree/
  );
});

test('applyMutation: still rejects blank docId/searchTag before ever reaching the ownership check', () => {
  const { exported } = load();
  assert.throws(() => exported.applyMutation('', 'tag', 'payload'), /Missing docId or searchTag/);
  assert.throws(() => exported.applyMutation('some-id', '', 'payload'), /Missing docId or searchTag/);
});

test('_isWithinSystemFolderTree_: true for the system root folder\'s own direct and nested children, false otherwise', () => {
  const { exported, sandbox } = load();
  const root = seedSystemRoot(sandbox, exported);
  const nested = root.createFolder('a').createFolder('b');
  const insideDoc = docWithTag(sandbox, nested, 'x');
  const outsideDoc = docWithTag(sandbox, sandbox.DriveApp.getRootFolder().createFolder('elsewhere'), 'x');

  assert.equal(exported._isWithinSystemFolderTree_(insideDoc.getId()), true);
  assert.equal(exported._isWithinSystemFolderTree_(outsideDoc.getId()), false);
});
