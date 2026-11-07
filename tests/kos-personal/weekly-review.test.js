'use strict';
// kos-personal/26_WeeklyReview.gs: the Monday mail of the Sunday build
// review. A fresh KOS_WEEKLY_REVIEW doc is mailed as written; a stale or
// missing one is never passed off as this week's: the mail says the Sunday
// run didn't produce one.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const KP = path.join(__dirname, '..', '..', 'kos-personal');
const FILES = ['1_Config_And_Deploy.gs', '5_Error_And_Utilities.gs', '26_WeeklyReview.gs'].map((f) => path.join(KP, f));

function setup() {
  const env = loadGasFiles(FILES, ['sendWeeklyReview']);
  env.sandbox.PropertiesService.getScriptProperties().setProperty('KOS_ADMIN_EMAIL', 'operator@example.org');
  const plant = (text, hoursAgo) => {
    const d = env.sandbox.DocumentApp.create('KOS_WEEKLY_REVIEW');
    d.getBody().setText(text);
    env.sandbox.DriveApp.getFileById(d.getId()).lastUpdated = new Date(Date.now() - hoursAgo * 3600000);
    return d;
  };
  return { x: env.exported, sandbox: env.sandbox, plant, sent: () => env.sandbox.MailApp.getSentMessages() };
}

test('a review written last night is mailed as written, the newest one if there are two', () => {
  const t = setup();
  t.plant('LAST WEEK', 24 * 7 + 11);
  t.plant('KOS weekly review — week of 2026-11-02\nNeeds you: 1', 11);
  const r = t.x.sendWeeklyReview();
  assert.deepEqual([r.sent, r.fresh], [true, true]);
  const [m] = t.sent();
  assert.equal(m.to, 'operator@example.org');
  assert.match(m.subject, /^KOS weekly review — \d{4}-\d{2}-\d{2}$/);
  assert.match(m.body, /week of 2026-11-02\nNeeds you: 1/);
  assert.doesNotMatch(m.body, /LAST WEEK/);
});

test('a stale review is not passed off as this week\'s', () => {
  const t = setup();
  t.plant('LAST WEEK', 24 * 7 + 11);
  const r = t.x.sendWeeklyReview();
  assert.deepEqual([r.sent, r.fresh], [true, false]);
  const [m] = t.sent();
  assert.match(m.subject, /not produced this week/);
  assert.match(m.body, /The Sunday review did not arrive\. The last KOS_WEEKLY_REVIEW was written: \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(m.body, /LAST WEEK/);
});

test('no review at all says so, and names where the week\'s decisions are', () => {
  const t = setup();
  const r = t.x.sendWeeklyReview();
  assert.equal(r.fresh, false);
  const [m] = t.sent();
  assert.match(m.body, /written: never/);
  assert.match(m.body, /From the RTP session logs/);
});
