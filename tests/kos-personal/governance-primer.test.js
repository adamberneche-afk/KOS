'use strict';
// Regression tests for kos-personal/6_Governance.gs's _writeLatestPrimer_()
// / _clearDocBody_() — the incident diagnosis flagged Body.clear() as a
// known Apps Script gotcha: it can throw "Can't remove the last paragraph
// in a document section" depending on the document's current state,
// separate from (and unrelated to) the STAGING_PIPELINE incident itself.
//
// This harness's DocumentApp mock never reproduces that real GAS
// exception — FakeDocBody.clear() always succeeds (see gas-sandbox.js's
// own comment on getNumChildren()/getChild()/removeChild()) — so these
// tests can't be a red-then-green reproduction of the actual throw. What
// they do verify: _writeLatestPrimer_() no longer calls body.clear() at
// all on the re-use path, and _clearDocBody_()'s own remove-down-to-one
// -then-clear-its-text workaround leaves a body with exactly the newly
// written content, no leftover paragraphs from a previous run.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '6_Governance.gs'),
];
const EXPOSE = ['_writeLatestPrimer_', '_clearDocBody_', 'CFG'];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

const VECTOR_STATE = { success: false, vectors: [] };
const SHADOW_STATE = { success: false, questions: [] };

test('_clearDocBody_: collapses a multi-paragraph body to a single empty paragraph', () => {
  const { exported, sandbox } = load();
  const doc = sandbox.DocumentApp.create('scratch');
  const body = doc.getBody();
  body.appendParagraph('old line one');
  body.appendParagraph('old line two');
  body.appendParagraph('old line three');
  assert.equal(body.getNumChildren(), 3);

  exported._clearDocBody_(body);

  assert.equal(body.getNumChildren(), 1, 'exactly one paragraph must survive — a Body can never have zero');
  assert.equal(body.getChild(0).getText(), '');
});

test('_writeLatestPrimer_: re-using an existing doc leaves no leftover content from the previous run', () => {
  const { exported, sandbox } = load();

  // First run creates KOS_LATEST_PRIMER fresh.
  exported._writeLatestPrimer_(
    sandbox.DriveApp.getRootFolder(), '2026-09-10', 1,
    'first vision', VECTOR_STATE, SHADOW_STATE
  );
  const storedId = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.CFG.PROP.LATEST_PRIMER_DOC_ID);
  assert.ok(storedId, 'expected the doc ID to be stored after the first run');
  const firstRunText = sandbox.DocumentApp.openById(storedId).getBody().getText();
  assert.match(firstRunText, /first vision/);

  // Second run re-uses the same doc via _clearDocBody_() rather than
  // creating a new one — the whole point of LATEST_PRIMER_DOC_ID.
  exported._writeLatestPrimer_(
    sandbox.DriveApp.getRootFolder(), '2026-09-11', 2,
    'second vision', VECTOR_STATE, SHADOW_STATE
  );
  const secondRunDoc = sandbox.DocumentApp.openById(storedId);
  const secondRunText = secondRunDoc.getBody().getText();

  assert.match(secondRunText, /second vision/);
  assert.doesNotMatch(secondRunText, /first vision/,
    'the previous run\'s content must not survive alongside the new content');
});
