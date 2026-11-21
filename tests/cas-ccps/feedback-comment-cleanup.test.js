'use strict';
// removeFeedbackCommentsPosted (37, 2026-11-15): undo a burst of feedback
// comments after a Studio Test run re-graded every FlowInput row. Pins: it
// is a dry run unless the third argument is true; it touches only comments
// this account posted, inside the window, whose text starts "Feedback, ";
// each doc is checked once (two rows on one doc), fixture rows are skipped,
// a form part's snapshot doc is the one checked; it pages through comments;
// a doc it can't read is counted, not fatal; a bad or over-long window
// throws; the log names rows, never a file ID.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js', '63_DocHeader.js', '03_QueueBridge.js', '32_CompetencyRubricImporter.js', '37_FlowInputBuilder.js', '39_FlowFixtures.js'].map(S);
const FROM = '2026-11-15T14:34:00-05:00';
const TO = '2026-11-15T15:05:00-05:00';
const IN = '2026-11-15T19:40:00.000Z';   // 2:40 PM in New York
const BEFORE = '2026-11-15T19:00:00.000Z'; // 2:00 PM

function setup(docs, opts = {}) {
  const logs = [];
  const env = loadGasFiles(FILES, ['removeFeedbackCommentsPosted', 'FI', 'FI_HEADERS'],
    { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const removed = [];
  const listCalls = [];
  sb.Drive = { Comments: {
    list(docId, o) {
      listCalls.push({ docId, o });
      if (opts.unreadable === docId) throw new Error('File not found');
      const all = docs[docId] || [];
      const size = opts.pageSize || all.length || 1;
      const start = o.pageToken ? Number(o.pageToken) : 0;
      const next = start + size < all.length ? String(start + size) : undefined;
      return { comments: all.slice(start, start + size), nextPageToken: next };
    },
    remove(docId, id) { if (opts.failRemove === id) throw new Error('nope'); removed.push(docId + '/' + id); },
  } };
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  sb.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  const fi = ss.insertSheet('FlowInput');
  const x = env.exported;
  fi.appendRow(x.FI_HEADERS);
  (opts.rows || []).forEach((r) => {
    const row = new Array(x.FI_HEADERS.length).fill('');
    row[x.FI.STAGING_ROW_REF] = r.ref || '5';
    row[x.FI.STUDENT_FILE_ID] = r.fileId;
    row[x.FI.CONFIG_ID] = r.configId || 'CAS-TEST-L01';
    row[x.FI.STUDENT_EMAIL] = 'student@example.invalid';
    row[x.FI.STUDENT_DOC_URL] = r.url || '';
    fi.appendRow(row);
  });
  return { x, logs, removed, listCalls };
}

const c = (id, createdTime, content, me = true) => ({ id, createdTime, content, author: { me } });

test('a dry run finds only this account\'s feedback comments in the window, and deletes nothing', () => {
  const docs = { docA: [
    c('1', IN, 'Feedback, Nov 15, 2:40 PM\nResult: ...'),
    c('2', BEFORE, 'Feedback, Nov 15, 2:00 PM\nResult: ...'),           // before the window
    c('3', IN, 'Feedback, but written by a teacher', false),             // someone else's
    c('4', IN, 'Your reflection (Nov 15). This is for you...'),          // not feedback
  ] };
  const { x, logs, removed } = setup(docs, { rows: [{ fileId: 'docA' }] });
  const out = x.removeFeedbackCommentsPosted(FROM, TO);
  assert.equal(out.found, 1);
  assert.equal(out.deleted, 0);
  assert.deepEqual(removed, []);
  assert.ok(logs.some((l) => /DRY RUN \(nothing deleted\): 1 of 1 doc\(s\) checked, 1 feedback comment/.test(l)), logs.join('\n'));
  assert.ok(logs.every((l) => !/docA/.test(l)), 'no file ID in the log');
});

test('with true it deletes them; each doc once; fixtures skipped; the snapshot doc is the one checked', () => {
  const docs = {
    docA: [c('1', IN, 'Feedback, a'), c('2', IN, 'Feedback, b')],
    snap: [c('9', IN, 'Feedback, form part')],
    fixtureDoc: [c('7', IN, 'Feedback, fixture')],
  };
  const { x, removed, listCalls } = setup(docs, { rows: [
    { fileId: 'docA' }, { fileId: 'docA', configId: 'CAS-TEST-L02' },
    { fileId: 'formFile', url: 'https://docs.google.com/document/d/snap/edit' },
    { fileId: 'fixtureDoc', ref: 'FIXTURE-2' },
  ] });
  const out = x.removeFeedbackCommentsPosted(FROM, TO, true);
  assert.deepEqual(removed.sort(), ['docA/1', 'docA/2', 'snap/9']);
  assert.equal(out.deleted, 3);
  assert.equal(out.docs, 2);
  assert.deepEqual(listCalls.map((l) => l.docId).sort(), ['docA', 'snap']);
  assert.match(listCalls[0].o.fields, /author\(me\)/);
});

test('it pages through comments, counts an unreadable doc and a failed delete, and keeps going', () => {
  const docs = { docA: [c('1', BEFORE, 'Feedback, old'), c('2', IN, 'Feedback, x'), c('3', IN, 'Feedback, y')], docC: [c('5', IN, 'Feedback, z')] };
  const { x, removed } = setup(docs, { pageSize: 1, unreadable: 'docB', failRemove: '3',
    rows: [{ fileId: 'docA' }, { fileId: 'docB' }, { fileId: 'docC' }] });
  const out = x.removeFeedbackCommentsPosted(FROM, TO, true);
  assert.equal(out.found, 3);
  assert.equal(out.deleted, 2);
  assert.equal(out.failed, 1);
  assert.equal(out.unreadable, 1);
  assert.deepEqual(removed.sort(), ['docA/2', 'docC/5']);
});

test('a missing, backwards or over-long window throws before touching anything', () => {
  const { x, listCalls } = setup({}, { rows: [{ fileId: 'docA' }] });
  assert.throws(() => x.removeFeedbackCommentsPosted('', TO), /give a start and end time/);
  assert.throws(() => x.removeFeedbackCommentsPosted(TO, FROM), /give a start and end time/);
  assert.throws(() => x.removeFeedbackCommentsPosted('2026-11-14T00:00:00-05:00', TO), /over a day/);
  assert.equal(listCalls.length, 0);
});
