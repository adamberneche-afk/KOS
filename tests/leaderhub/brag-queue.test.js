'use strict';
// Regression tests for leader-hub/EmailBridge.gs's Brag Queue — the
// Gmail-scope-narrowing follow-up ("scope down to read only and use a
// trigger to send an execution log to my email for drafts"). createBragDraft_()
// used to call GmailApp.createDraft(to, subject, text) directly (needing
// gmail.compose); it now only appends a row, and sendBragQueue() — installed
// on its own 5-minute trigger via installBragQueueTrigger() — is what
// actually emails the drafted content, to the OWNER's own inbox via
// MailApp (script.send_mail — no Gmail Drafts access at all), never to the
// row's own "To" address directly.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
const FILES = [
  path.join(LH, 'Code.gs'),
  path.join(LH, 'EmailBridge.gs'),
];
const EXPOSE = [
  'createBragDraft_', 'sendBragQueue', 'installBragQueueTrigger',
  'BRAG_QUEUE_HEADERS', 'BRAGQ_COL', 'BRAG_QUEUE_MAX_ATTEMPTS',
];

function load(extraGlobals) {
  return loadGasFiles(FILES, EXPOSE, extraGlobals);
}

function setOwner(sandbox, email) {
  sandbox.PropertiesService.getScriptProperties().setProperty('OWNER_EMAIL', email);
}

// Reads the queue back via the sandbox's own SpreadsheetApp mock rather than
// through _getBragQueueSheet_()'s return value — an exposed GAS function's
// return value crosses the vm boundary structurally cloned (same reason
// tests/kos-personal/preflight.test.js's indexSpreadsheet() helper goes
// through sandbox.SpreadsheetApp directly), which drops a mock Sheet
// object's methods entirely.
function queueRows(sandbox, exported) {
  const id = sandbox.PropertiesService.getScriptProperties().getProperty('BRAG_QUEUE_SHEET_ID');
  if (!id) return [];
  const ss = sandbox.SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('Brag_Queue');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  return sheet.getRange(2, 1, lastRow - 1, exported.BRAG_QUEUE_HEADERS.length).getValues();
}

// ── createBragDraft_() — queues, never calls GmailApp ───────────────────────

test('createBragDraft_: queues a PENDING row instead of creating a Gmail draft', () => {
  const { exported, sandbox } = load();
  const res = exported.createBragDraft_({ to: 'parent@example.com', subject: 'Weekly Wins', body: 'Great week!' });
  assert.equal(res.ok, true);

  const rows = queueRows(sandbox, exported);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row[exported.BRAGQ_COL.TO], 'parent@example.com');
  assert.equal(row[exported.BRAGQ_COL.SUBJECT], 'Weekly Wins');
  assert.equal(row[exported.BRAGQ_COL.BODY], 'Great week!');
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'PENDING');
  assert.equal(row[exported.BRAGQ_COL.ATTEMPTS], 0);
});

test('createBragDraft_: falls back to defaults for a missing subject/body', () => {
  const { exported, sandbox } = load();
  exported.createBragDraft_({ to: 'x@example.com' });
  const row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.SUBJECT], 'Weekly Wins');
  assert.equal(row[exported.BRAGQ_COL.BODY], '(No content)');
});

// ── sendBragQueue() — drains PENDING rows to the OWNER via MailApp ──────────

test('sendBragQueue: fails closed (no send attempted) when OWNER_EMAIL is unset', () => {
  const { exported, sandbox } = load();
  exported.createBragDraft_({ to: 'parent@example.com', subject: 'S', body: 'B' });
  exported.sendBragQueue();

  assert.equal(sandbox.MailApp.getSentMessages().length, 0);
  const row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'PENDING', 'row must be left untouched, not silently dropped');
});

test('sendBragQueue: emails the OWNER, not the row\'s own "To" address', () => {
  const { exported, sandbox } = load();
  setOwner(sandbox, 'adam@ccpsnet.net');
  exported.createBragDraft_({ to: 'parent@example.com', subject: 'Weekly Wins', body: 'Great week!' });
  exported.sendBragQueue();

  const sent = sandbox.MailApp.getSentMessages();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'adam@ccpsnet.net');
  assert.match(sent[0].subject, /Weekly Wins/);
  assert.match(sent[0].body, /Intended recipient: parent@example\.com/);
  assert.match(sent[0].body, /Great week!/);

  const row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'SENT');
});

test('sendBragQueue: a row already SENT is not resent', () => {
  const { exported, sandbox } = load();
  setOwner(sandbox, 'adam@ccpsnet.net');
  exported.createBragDraft_({ to: 'a@example.com', subject: 'S1', body: 'B1' });
  exported.sendBragQueue();
  exported.sendBragQueue(); // second drain pass — nothing new to do

  assert.equal(sandbox.MailApp.getSentMessages().length, 1);
});

test('sendBragQueue: multiple PENDING rows each get their own email', () => {
  const { exported, sandbox } = load();
  setOwner(sandbox, 'adam@ccpsnet.net');
  exported.createBragDraft_({ to: 'a@example.com', subject: 'S1', body: 'B1' });
  exported.createBragDraft_({ to: 'b@example.com', subject: 'S2', body: 'B2' });
  exported.sendBragQueue();

  const sent = sandbox.MailApp.getSentMessages();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map((m) => m.to), ['adam@ccpsnet.net', 'adam@ccpsnet.net']);
});

test('sendBragQueue: a send failure increments Attempts and retries on the next pass, without throwing', () => {
  const { exported, sandbox } = load();
  setOwner(sandbox, 'adam@ccpsnet.net');
  exported.createBragDraft_({ to: 'a@example.com', subject: 'S', body: 'B' });

  const realSend = sandbox.MailApp.sendEmail;
  sandbox.MailApp.sendEmail = () => { throw new Error('quota exceeded'); };
  assert.doesNotThrow(() => exported.sendBragQueue());

  let row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'PENDING', 'still retryable — not yet at BRAG_QUEUE_MAX_ATTEMPTS');
  assert.equal(row[exported.BRAGQ_COL.ATTEMPTS], 1);
  assert.match(String(row[exported.BRAGQ_COL.ERROR]), /quota exceeded/);

  sandbox.MailApp.sendEmail = realSend;
  exported.sendBragQueue();
  row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'SENT', 'recovers once the transient failure clears');
});

test('sendBragQueue: a row is marked terminal FAILED after BRAG_QUEUE_MAX_ATTEMPTS, not retried forever', () => {
  const { exported, sandbox } = load();
  setOwner(sandbox, 'adam@ccpsnet.net');
  exported.createBragDraft_({ to: 'a@example.com', subject: 'S', body: 'B' });
  sandbox.MailApp.sendEmail = () => { throw new Error('permanent failure'); };

  for (let i = 0; i < exported.BRAG_QUEUE_MAX_ATTEMPTS; i++) exported.sendBragQueue();

  const row = queueRows(sandbox, exported)[0];
  assert.equal(row[exported.BRAGQ_COL.STATUS], 'FAILED');
  assert.equal(row[exported.BRAGQ_COL.ATTEMPTS], exported.BRAG_QUEUE_MAX_ATTEMPTS);

  // One more pass must not touch it again — it's terminal now.
  exported.sendBragQueue();
  const rowAfter = queueRows(sandbox, exported)[0];
  assert.equal(rowAfter[exported.BRAGQ_COL.ATTEMPTS], exported.BRAG_QUEUE_MAX_ATTEMPTS);
});

// ── installBragQueueTrigger() — idempotent, same shape as the deploy-report
//    installer this file's own header points to ─────────────────────────────

test('installBragQueueTrigger: installs exactly one 5-minute trigger', () => {
  const { exported, sandbox } = load();
  exported.installBragQueueTrigger();

  const triggers = sandbox.ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendBragQueue');
  assert.equal(triggers.length, 1);
  assert.deepEqual(triggers[0].__calls, [
    { method: 'timeBased', args: [] },
    { method: 'everyMinutes', args: [5] },
  ]);
});

test('installBragQueueTrigger: re-running collapses back to one trigger, not two', () => {
  const { exported, sandbox } = load();
  exported.installBragQueueTrigger();
  exported.installBragQueueTrigger();

  const triggers = sandbox.ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendBragQueue');
  assert.equal(triggers.length, 1);
});
