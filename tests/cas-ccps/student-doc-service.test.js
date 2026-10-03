'use strict';
// The student doc's menu (01_StudentDoc_ContainerScript.js) runs as the
// student. It used to open the Ledger and append to the Admin sheet's
// ReviewQueue itself, which only worked if every student could read every
// student's Ledger rows and edit the Admin spreadsheet. It now asks the
// Student Dashboard web app (13_StudentDashboard.js, which runs as the
// admin) through doPost(), which answers only for the signed-in student's
// own row. A submit carries only that there is writing to evaluate, never the
// writing, and nothing stores it in ReviewQueue.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const SCRIPTS = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');

const FakeContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(text) {
    // setMimeType returns plain data so the result can cross the sandbox's
    // realm boundary (see gas-sandbox.js crossRealmSafe).
    return { setMimeType(mime) { return { text, mime }; } };
  },
};

function sessionAs(email) {
  return {
    getActiveUser() { return { getEmail() { return email; } }; },
    getEffectiveUser() { return { getEmail() { return 'admin@ccpsnet.net'; } }; },
    getScriptTimeZone() { return 'America/New_York'; },
  };
}

function ledgerRow(googleId, configId, fileId, status) {
  const row = new Array(23).fill('');
  row[0] = new Date().toISOString();
  row[1] = googleId;
  row[2] = configId;
  row[3] = fileId;
  row[7] = 'Ms. Teacher';
  row[10] = 'Marketing';
  row[12] = status || 'ACTIVE';
  row[18] = '2025-26';
  return row;
}

function loadService(signedInAs) {
  const loaded = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '13_StudentDashboard.js')],
    ['doPost', 'handleStudentDocRequest_'],
    { ContentService: FakeContentService, Session: sessionAs(signedInAs) });
  const { sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  ledger.appendRow(ledgerRow('amy@ccpsnet.net', 'CFG-A', 'file-a', 'COMPLETE'));
  ledger.appendRow(ledgerRow('ben@ccpsnet.net', 'CFG-B', 'file-b', 'ACTIVE'));
  const queue = ss.insertSheet('ReviewQueue');
  queue.appendRow(['Timestamp', 'GoogleID', 'FileID', 'ConfigID', 'Text', 'Status', 'Notes']);
  return Object.assign({ ss, ledger, queue }, loaded);
}

function post(exported, body) {
  const out = exported.doPost({ postData: { contents: JSON.stringify(body) } });
  assert.equal(out.mime, 'application/json');
  return JSON.parse(out.text);
}

test('doPost status: the signed-in student gets their own row', () => {
  const { exported } = loadService('Amy@ccpsnet.net');
  const res = post(exported, { action: 'status', fileId: 'file-a', configId: 'CFG-A' });
  assert.equal(res.ok, true);
  assert.equal(res.info.status, 'COMPLETE');
  assert.equal(res.info.unitCode, 'Marketing');
  assert.equal(res.info.teacherName, 'Ms. Teacher');
});

test('doPost status: another student\'s doc is NOT_REGISTERED, whatever the body claims', () => {
  const { exported } = loadService('amy@ccpsnet.net');
  const res = post(exported, {
    action: 'status', fileId: 'file-b', configId: 'CFG-B', googleId: 'ben@ccpsnet.net',
  });
  assert.deepEqual(res, { ok: false, error: 'NOT_REGISTERED' });
});

test('doPost submit: queues the work under the signed-in account, without the writing', () => {
  const { exported, queue } = loadService('ben@ccpsnet.net');
  const res = post(exported, {
    action: 'submit', fileId: 'file-b', configId: 'CFG-B', hasText: true, googleId: 'amy@ccpsnet.net',
  });
  assert.equal(res.ok, true);
  const rows = queue.getDataRange().getValues().slice(1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].slice(1, 6), ['ben@ccpsnet.net', 'file-b', 'CFG-B', '', 'PENDING']);
});

test('doPost submit: a doc made before the fix sends its text; it is checked, then never stored', () => {
  const { exported, queue } = loadService('ben@ccpsnet.net');
  assert.equal(post(exported, { action: 'submit', fileId: 'file-b', configId: 'CFG-B', text: '   ' }).error, 'EMPTY');
  assert.equal(post(exported, { action: 'submit', fileId: 'file-b', configId: 'CFG-B' }).error, 'EMPTY');
  const res = post(exported, { action: 'submit', fileId: 'file-b', configId: 'CFG-B', text: 'My whole essay.' });
  assert.equal(res.ok, true);
  const rows = queue.getDataRange().getValues().slice(1);
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes('My whole essay'), 'the student\'s writing must not reach ReviewQueue');
});

test('doPost submit: refuses someone else\'s doc and queues nothing', () => {
  const { exported, queue } = loadService('ben@ccpsnet.net');
  const res = post(exported, { action: 'submit', fileId: 'file-a', configId: 'CFG-A', text: 'x' });
  assert.equal(res.error, 'NOT_REGISTERED');
  assert.equal(queue.getLastRow(), 1);
});

test('doPost: no signed-in user, an unknown action, or a malformed body is refused', () => {
  assert.equal(post(loadService('').exported, { action: 'status', fileId: 'f', configId: 'c' }).error, 'NO_USER');
  const { exported } = loadService('amy@ccpsnet.net');
  assert.equal(post(exported, { action: 'delete', fileId: 'file-a', configId: 'CFG-A' }).error, 'BAD_ACTION');
  assert.equal(JSON.parse(exported.doPost({ postData: { contents: 'not json' } }).text).error, 'BAD_REQUEST');
});

// ── The doc side ───────────────────────────────────────────────────────────

function loadDocScript(docText, reply) {
  const calls = [];
  const loaded = loadGasFiles(
    [path.join(SCRIPTS, '00_SharedConfig.js'), path.join(SCRIPTS, '01_StudentDoc_ContainerScript.js')],
    ['readSystemIds', 'validateRoster_', 'submitToQueue_'],
    {
      UrlFetchApp: {
        fetch(url, opts) {
          calls.push({ url, opts });
          if (reply instanceof Error) throw reply;
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify(reply) };
        },
      },
    });
  const { sandbox } = loaded;
  sandbox.ScriptApp.getOAuthToken = () => 'student-token';
  const doc = sandbox.DocumentApp.create('Student doc');
  doc.getBody().setText(docText);
  sandbox.DocumentApp.getActiveDocument = () => doc;
  // Any direct spreadsheet access from the doc would need student access
  // to the Ledger, which is the thing being removed.
  sandbox.SpreadsheetApp.openById = () => { throw new Error('the doc must not open a spreadsheet'); };
  return Object.assign({ calls }, loaded);
}

const URL = 'https://script.google.com/a/macros/ccpsnet.net/s/DASH/exec';

test('readSystemIds: finds the service URL in the stamped system block, then the dashboard line', () => {
  assert.deepEqual(loadDocScript('...[SYS_LEDGER_SS_ID:l][SYS_ADMIN_SS_ID:a][SYS_DASHBOARD_URL:' + URL + ']', {})
    .exported.readSystemIds(), { serviceUrl: URL });
  assert.deepEqual(loadDocScript('Your assignment dashboard: ' + URL + ' — bookmark this.', {})
    .exported.readSystemIds(), { serviceUrl: URL });
  assert.equal(loadDocScript('no markers here', {}).exported.readSystemIds(), null);
});

test('validateRoster_: asks the web app with the student\'s token, never the Ledger', () => {
  const { exported, calls } = loadDocScript('', { ok: true, info: { status: 'ACTIVE' } });
  const res = exported.validateRoster_({ serviceUrl: URL }, 'amy@ccpsnet.net', 'file-a', 'CFG-A');
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, URL);
  assert.equal(calls[0].opts.method, 'post');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer student-token');
  assert.deepEqual(JSON.parse(calls[0].opts.payload), { action: 'status', fileId: 'file-a', configId: 'CFG-A' });
});

test('validateRoster_: an unreachable service is reported as such, not as an unknown account', () => {
  const { exported } = loadDocScript('', new Error('DNS error'));
  assert.equal(exported.validateRoster_({ serviceUrl: URL }, 'amy', 'f', 'c').error, 'UNREACHABLE');
});

test('submitToQueue_: sends that there is writing, never the writing', () => {
  const { exported, calls } = loadDocScript('', { ok: true });
  exported.submitToQueue_({ serviceUrl: URL }, 'amy', 'file-a', 'CFG-A');
  assert.deepEqual(JSON.parse(calls[0].opts.payload),
    { action: 'submit', fileId: 'file-a', configId: 'CFG-A', hasText: true });
});

test('submitToQueue_: throws when the service refuses', () => {
  const { exported } = loadDocScript('', { ok: false, error: 'NOT_REGISTERED' });
  assert.throws(() => exported.submitToQueue_({ serviceUrl: URL }, 'amy', 'f', 'c'), /NOT_REGISTERED/);
});
