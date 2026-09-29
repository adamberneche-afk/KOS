'use strict';
// sendDailyErrorReport() (5_Error_And_Utilities.gs) had no size limit on
// the digest body. MailApp refuses a body over ~200KB and throws, and a
// failed send marked nothing reported, so the backlog grew, every later
// digest failed the same way, and archiveErrorLog() (which only sweeps
// reported rows) could never shrink ERROR_LOG again.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = [
  path.join(KP, '1_Config_And_Deploy.gs'),
  path.join(KP, '5_Error_And_Utilities.gs'),
];

const MAILAPP_BODY_LIMIT = 200 * 1024;

function load() {
  const loaded = loadGasFiles(FILES, ['sendDailyErrorReport', 'CFG']);
  const { exported, sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create(exported.CFG.INDEX_NAME);
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('INDEX_ID', ss.getId());
  props.setProperty('KOS_ADMIN_EMAIL', 'admin@example.com');
  // Real MailApp throws on an oversize body; the default mock doesn't.
  const send = sandbox.MailApp.sendEmail;
  sandbox.MailApp.sendEmail = function (to, subject, body) {
    if (Buffer.byteLength(String(body), 'utf8') > MAILAPP_BODY_LIMIT) {
      throw new Error('Argument too large: body');
    }
    return send.apply(this, arguments);
  };
  return Object.assign({ ss }, loaded);
}

function seed(exported, ss, n, msgChars) {
  const sheet = ss.insertSheet(exported.CFG.ERROR_LOG_SHEET);
  sheet.appendRow(['Timestamp', 'Context', 'Message', 'Stack', 'Reported_At']);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push([new Date().toISOString(), 'ctx' + (i % 7), 'boom ' + i + ' ' + 'x'.repeat(msgChars), 'at f (x.gs:1)', '']);
  }
  sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  return sheet;
}

test('sendDailyErrorReport: a backlog too big for one email still sends, and every row is marked reported', () => {
  const { exported, sandbox, ss } = load();
  const sheet = seed(exported, ss, 3000, 400);

  const result = exported.sendDailyErrorReport();

  assert.equal(result.sent, true, 'the digest must go out: ' + result.reason);
  assert.equal(result.count, 3000);
  const [mail] = sandbox.MailApp.getSentMessages();
  assert.ok(Buffer.byteLength(mail.body, 'utf8') < MAILAPP_BODY_LIMIT);
  assert.match(mail.body, /left out to keep this email under/);
  const reported = sheet.getRange(2, 5, 3000, 1).getValues().filter((r) => r[0] !== '');
  assert.equal(reported.length, 3000,
    'every row is marked, or archiveErrorLog() can never sweep the backlog');
});

test('sendDailyErrorReport: one huge message is clipped, not sent whole', () => {
  const { exported, sandbox, ss } = load();
  seed(exported, ss, 1, 45000);

  exported.sendDailyErrorReport();

  const [mail] = sandbox.MailApp.getSentMessages();
  assert.ok(mail.body.length < 5000, 'body was ' + mail.body.length + ' chars');
  assert.match(mail.body, /\[\.\.\.truncated\.\.\.\]/);
});

test('sendDailyErrorReport: a small digest lists every error and leaves already-reported rows alone', () => {
  const { exported, sandbox, ss } = load();
  const sheet = seed(exported, ss, 3, 10);
  sheet.getRange(3, 5).setValue('2026-09-01 08:00:00');

  const result = exported.sendDailyErrorReport();

  assert.equal(result.count, 2);
  const [mail] = sandbox.MailApp.getSentMessages();
  assert.match(mail.body, /boom 0 /);
  assert.match(mail.body, /boom 2 /);
  assert.doesNotMatch(mail.body, /boom 1 /);
  assert.doesNotMatch(mail.body, /left out/);
  assert.equal(sheet.getRange(3, 5).getValue(), '2026-09-01 08:00:00');
});
