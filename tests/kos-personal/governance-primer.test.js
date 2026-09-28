'use strict';
// Regression tests for kos-personal/6_Governance.gs's _writeLatestPrimer_()
// / _clearDocBody_().
//
// generateDailyPrimer failed every morning from 2026-09-18 with "Can't
// remove the last paragraph in a document section": _clearDocBody_()
// removed children from the END, and real Docs refuses to remove a
// body's final element. The harness's FakeDocBody now enforces that rule
// (and throws on asParagraph() of a list item), so these tests fail
// against the old code the same way production did.
//
// KOS_LATEST_PRIMER is also a notebook and RTP-gem source held by file
// ID, so the tests pin that the ID survives a trashed doc and a transient
// error, and only changes when the doc is really gone.

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

const VECTOR_EMPTY = { success: false, vectors: [] };
const SHADOW_EMPTY = { success: false, questions: [] };
// The real primer's shape: its last elements are list items.
const VECTOR_FULL = { success: true, vectors: [{ name: 'Craft', score: 0.5 }] };
const SHADOW_FULL = {
  success: true, engine_mode: 'SHADOW',
  questions: [{ label: 'Q1', status: 'OPEN', confidence: 0.4, inferred: '' }],
};

function write(exported, sandbox, dateStr, vision, vectorState, shadowState) {
  exported._writeLatestPrimer_(
    sandbox.DriveApp.getRootFolder(), dateStr, 1, vision,
    vectorState || VECTOR_EMPTY, shadowState || SHADOW_EMPTY
  );
  return sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.CFG.PROP.LATEST_PRIMER_DOC_ID);
}

test('_clearDocBody_: a body whose last child is a paragraph collapses to one empty paragraph', () => {
  const { exported, sandbox } = load();
  const body = sandbox.DocumentApp.create('scratch').getBody();
  body.appendParagraph('old line one');
  body.appendParagraph('old line two');
  body.appendParagraph('old line three');

  exported._clearDocBody_(body);

  assert.equal(body.getNumChildren(), 1, 'a Body can never have zero children');
  assert.equal(body.getChild(0).getType(), 'PARAGRAPH');
  assert.equal(body.getChild(0).getText(), '');
});

test('_clearDocBody_: handles list items first and last', () => {
  const { exported, sandbox } = load();
  const body = sandbox.DocumentApp.create('scratch').getBody();
  body.appendListItem('first item');
  body.appendParagraph('middle');
  body.appendListItem('last item');

  exported._clearDocBody_(body);

  assert.equal(body.getNumChildren(), 1);
  assert.equal(body.getChild(0).getType(), 'PARAGRAPH');
  assert.equal(body.getText(), '');
});

test('_writeLatestPrimer_: a second run reuses the same doc ID and leaves no leftover content', () => {
  const { exported, sandbox } = load();

  const firstId = write(exported, sandbox, '2026-09-10', 'first vision', VECTOR_FULL, SHADOW_FULL);
  assert.ok(firstId, 'expected the doc ID to be stored after the first run');

  const secondId = write(exported, sandbox, '2026-09-11', 'second vision', VECTOR_FULL, SHADOW_FULL);
  assert.equal(secondId, firstId, 'the doc ID must never change between runs');

  const body = sandbox.DocumentApp.openById(firstId).getBody();
  assert.match(body.getText(), /second vision/);
  assert.doesNotMatch(body.getText(), /first vision/);
  assert.equal(body.getChild(0).getText(), 'DAILY PRIMER — 2026-09-11',
    'the doc should open on its heading, not a blank line');
});

test('_writeLatestPrimer_: a trashed doc is restored, not replaced', () => {
  const { exported, sandbox } = load();
  const id = write(exported, sandbox, '2026-09-10', 'first vision');
  sandbox.DriveApp.getFileById(id).setTrashed(true);

  const after = write(exported, sandbox, '2026-09-11', 'second vision');

  assert.equal(after, id);
  assert.equal(sandbox.DriveApp.getFileById(id).isTrashed(), false);
  assert.match(sandbox.DocumentApp.openById(id).getBody().getText(), /second vision/);
});

test('_writeLatestPrimer_: a transient Docs error throws and keeps the stored ID', () => {
  const { exported, sandbox } = load();
  const id = write(exported, sandbox, '2026-09-10', 'first vision');
  const docCount = sandbox.DocumentApp._docs.size;

  const realOpen = sandbox.DocumentApp.openById;
  sandbox.DocumentApp.openById = () => { throw new Error('Service Documents failed while accessing document'); };
  try {
    assert.throws(() => write(exported, sandbox, '2026-09-11', 'second vision'), /Service Documents failed/);
  } finally {
    sandbox.DocumentApp.openById = realOpen;
  }

  assert.equal(sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.CFG.PROP.LATEST_PRIMER_DOC_ID), id);
  assert.equal(sandbox.DocumentApp._docs.size, docCount, 'no replacement doc may be created');
});

test('_writeLatestPrimer_: a doc that is really gone is recreated under a new ID', () => {
  const { exported, sandbox } = load();
  const id = write(exported, sandbox, '2026-09-10', 'first vision');
  sandbox.DocumentApp._docs.delete(id);
  sandbox.DriveApp._files.delete(id);

  const after = write(exported, sandbox, '2026-09-11', 'second vision');

  assert.notEqual(after, id);
  assert.match(sandbox.DocumentApp.openById(after).getBody().getText(), /second vision/);
});
