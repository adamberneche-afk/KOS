'use strict';
// repostMissingFeedback (37, 2026-11-15): after the cleanup deleted the
// re-grade's comments, some submissions had no feedback at all (the re-grade
// was their first answer). Pins: only each doc's newest row is considered,
// so a row superseded by a resubmission is never posted; a doc with a
// "Feedback, " comment from this account made after the row was built is
// left alone; a dry run posts nothing; with true it posts the row's result
// formatted as the harvest does (outcomes line stripped, stamp from the
// shape check); skipRefs, malformed results, rows not harvested, fixtures
// and assignments that keep feedback in the doc are not posted; a second
// run posts nothing new; the log names rows, never a file ID.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '63_DocHeader.js', '03_QueueBridge.js', '37_FlowInputBuilder.js', '39_FlowFixtures.js'].map(S);

const pass = 'Strong work.\n[SYSTEM: APPROVED]\n[SUGGESTED_SCORE: 3]\n[MILESTONE_OUTCOMES: {"1":"MET","2":"MET"}]';
const revise = 'Add examples.\n[SYSTEM: REVISION_REQUIRED]\n[MILESTONE_OUTCOMES: {"1":"MET","2":"NOT_MET"}]';

function setup(rows, comments, opts = {}) {
  const logs = [];
  const env = loadGasFiles(FILES, ['repostMissingFeedback', 'FI', 'FI_HEADERS'],
    { Logger: { log: (m) => logs.push(String(m)) } });
  const sb = env.sandbox;
  const x = env.exported;
  const posted = [];
  sb.Drive = { Comments: {
    list(docId) {
      if (opts.unreadable === docId) throw new Error('File not found');
      return { comments: comments[docId] || [] };
    },
    create(body, docId) {
      posted.push({ docId, content: body.content });
      (comments[docId] = comments[docId] || []).push({ id: 'n' + posted.length,
        createdTime: new Date().toISOString(), content: body.content, author: { me: true } });
      return { id: 'n' + posted.length };
    },
  } };
  sb.PropertiesService.getScriptProperties().setProperty('FEEDBACK_AS_COMMENT', opts.flag || 'all');
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  sb.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (opts.decks) {
    // The Ledger names each deck's file (FileID, column 4) and its link (AdminFileURL, column 17).
    const ledger = ss.insertSheet('Ledger');
    ledger.appendRow(new Array(27).fill('h'));
    opts.decks.forEach((id) => { const r = new Array(27).fill(''); r[3] = id; r[16] = 'https://docs.google.com/presentation/d/' + id + '/edit'; ledger.appendRow(r); });
  }
  const fi = ss.insertSheet('FlowInput');
  fi.appendRow(x.FI_HEADERS);
  rows.forEach((r) => {
    const row = new Array(x.FI_HEADERS.length).fill('');
    row[x.FI.TIMESTAMP] = new Date(r.built || '2026-11-12T17:00:00Z');
    row[x.FI.STAGING_ROW_REF] = r.ref;
    row[x.FI.STUDENT_FILE_ID] = r.fileId;
    if (r.docUrl) row[x.FI.STUDENT_DOC_URL] = r.docUrl;
    row[x.FI.CONFIG_ID] = r.configId || 'CAS-TEST-L01';
    row[x.FI.MILESTONE_1] = 'First'; row[x.FI.MILESTONE_2] = 'Second';
    row[x.FI.READY_STATUS] = r.status || 'HARVESTED';
    row[x.FI.GEMINI_FULL_OUTPUT] = r.output === undefined ? pass : r.output;
    fi.appendRow(row);
  });
  return { x, logs, posted };
}

const fb = (createdTime) => ({ id: 'c', createdTime, content: 'Feedback, Nov 14\nResult: ...', author: { me: true } });

test('a dry run lists docs whose newest row has no feedback since it was built, and posts nothing', () => {
  const { x, logs, posted } = setup([
    { ref: '64', fileId: 'docA' },                                      // superseded by 66
    { ref: '66', fileId: 'docA', built: '2026-11-14T18:48:00Z' },        // has its feedback
    { ref: '65', fileId: 'docB', output: revise },                       // feedback deleted
    { ref: '70', fileId: 'docC' },                                       // only an older comment
  ], {
    docA: [fb('2026-11-14T18:50:00Z')],
    docC: [fb('2026-11-10T12:00:00Z')],
  });
  const out = x.repostMissingFeedback();
  assert.equal(out.docs, 3);
  assert.equal(out.hasFeedback, 1);
  assert.equal(out.missing, 2);
  assert.deepEqual(out.rows.map((r) => [r.ref, r.result]).sort(), [['65', 'Revise'], ['70', 'Passed']]);
  assert.equal(posted.length, 0);
  assert.ok(logs.some((l) => /DRY RUN \(nothing posted\): 3 of 3 doc\(s\) checked; 1 have feedback, 2 missing/.test(l)), logs.join('\n'));
  assert.ok(logs.every((l) => !/docA|docB|docC/.test(l)), 'no file ID in the log');
});

test('with true it posts as the harvest does, once', () => {
  const { x, posted } = setup([{ ref: '65', fileId: 'docB', output: revise }], {});
  const out = x.repostMissingFeedback(true);
  assert.equal(out.posted, 1);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].docId, 'docB');
  assert.match(posted[0].content, /^Feedback, /);
  assert.match(posted[0].content, /Revise, then submit again/);
  assert.match(posted[0].content, /Add examples\./);
  assert.ok(!/MILESTONE_OUTCOMES/.test(posted[0].content), 'outcomes line stripped');
  const again = x.repostMissingFeedback(true);
  assert.equal(again.posted, 0);
  assert.equal(again.hasFeedback, 1);
  assert.equal(posted.length, 1);
});

test('skipRefs, malformed, not harvested, fixtures, feedback in the doc and unreadable docs are not posted', () => {
  const rows = [
    { ref: '67', fileId: 'd1' },
    { ref: '68', fileId: 'd2', output: 'An answer with no outcomes line' },
    { ref: '69', fileId: 'd3', status: 'READY', output: '' },
    { ref: 'FIXTURE-1', fileId: 'd4' },
    { ref: '71', fileId: 'd5' },
  ];
  const { x, posted } = setup(rows, {}, { unreadable: 'd5' });
  const out = x.repostMissingFeedback(true, [67]);
  assert.equal(out.skipped, 1);
  assert.equal(out.malformed, 1);
  assert.equal(out.notHarvested, 1);
  assert.equal(out.unreadable, 1);
  assert.equal(out.docs, 4);
  assert.equal(posted.length, 0);

  const off = setup([{ ref: '72', fileId: 'd6' }], {}, { flag: 'off' });
  const o2 = off.x.repostMissingFeedback(true);
  assert.equal(o2.inDoc, 1);
  assert.equal(off.posted.length, 0);
});

// 2026-11-17: a Slides part's feedback is a comment on its deck, so the deck
// is looked at too, and a missing one is posted there.
test('a Slides part: feedback on the deck counts; a missing one is posted on the deck', () => {
  const rows = [{ ref: '80', fileId: 'deck1', docUrl: 'https://docs.google.com/document/d/page1/edit' }];
  const opts = { decks: ['deck1'] };
  const has = setup(rows, { deck1: [fb('2026-11-14T18:50:00Z')] }, opts);
  assert.equal(has.x.repostMissingFeedback(true).hasFeedback, 1, 'its feedback is on the deck: left alone');
  assert.equal(has.posted.length, 0);
  const missing = setup(rows, {}, opts);
  assert.equal(missing.x.repostMissingFeedback(true).posted, 1);
  assert.deepEqual(missing.posted.map((p) => p.docId), ['deck1'], 'posted on the deck, not its feedback page');
  const older = setup(rows, { page1: [fb('2026-11-14T18:50:00Z')] }, opts);
  assert.equal(older.x.repostMissingFeedback(true).hasFeedback, 1, 'feedback from before the change, on the page, still counts');
});
