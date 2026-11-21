'use strict';
// Turn-in stage 5, the lesson report (69c): per lesson, counts only, and the
// three patterns flagged only when they hold in two sections of five or more
// students. Made-up accounts and files only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const CC = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
const FILES = ['00_SharedConfig.js', '55b_LessonAssignmentData.js', '68_LessonParts.js', '69c_LessonReport.js'].map((f) => path.join(CC, f));
const x = loadGasFiles(FILES, ['lessonReportRows_', 'lrLessonOf_', 'lrSheetRow_']).exported;

const DAY = 24 * 3600 * 1000;
const T0 = Date.UTC(2026, 10, 10, 15);

// n students in a period on one assignment, each with a file; outcomes(i)
// gives student i's checks of the first goal, in order.
function section(inp, period, assignmentId, goal, n, outcomes, opts = {}) {
  for (let i = 0; i < n; i++) {
    const acct = `s${period}-${assignmentId}-${i}@example.invalid`;
    const cid = `VDOE-T-${period}-${assignmentId}-${i}`;
    const fid = `file-${period}-${assignmentId}-${i}`;
    inp.files.push({ fileId: fid, configId: cid, account: acct, period: String(period) });
    inp.assignments[cid] = assignmentId;
    if (opts.submitted !== undefined && i >= opts.submitted) continue;
    (outcomes(i) || []).forEach((o, j) => inp.evidence.push({ fileId: fid, competencyId: goal, outcome: o, at: T0 + j * DAY }));
    if (opts.words !== undefined) inp.reflections.push({ fileId: fid, words: opts.words });
    if (opts.codes && i < opts.codes) inp.codes.push({ account: acct, assignmentId, at: T0 + DAY });
  }
}
const empty = () => ({ files: [], assignments: {}, evidence: [], reflections: [], codes: [], zeroShot: {} });

test('an assignment ID names its lesson and part', () => {
  assert.deepEqual({ ...x.lrLessonOf_('CAS-8175-L24-P2') }, { key: '8175-L24', part: 2 });
  assert.deepEqual({ ...x.lrLessonOf_('cas-8175-l02') }, { key: '8175-L02', part: 0 });
  assert.equal(x.lrLessonOf_('CAS-S1-U1-8175'), null);
});

test('too easy: first goal met on the first check with thin reflections, in two sections, is flagged', () => {
  const inp = empty();
  section(inp, 1, 'CAS-8175-L02', '8175-107', 6, () => ['MET'], { words: 5 });
  section(inp, 3, 'CAS-8175-L02', '8175-107', 6, () => ['MET'], { words: 8 });
  inp.zeroShot['8175-L02'] = { stamp: 'APPROVED', firstMet: true };
  const [r] = x.lessonReportRows_(inp);
  assert.equal(r.key, '8175-L02');
  assert.equal(r.assigned, 12);
  assert.equal(r.firstMet, 12);
  assert.deepEqual([...r.flags], ['B']);
  assert.deepEqual([...r.heldIn.B], ['1', '3']);
  assert.equal(r.zeroShot, 'PASSED cold');
  const row = x.lrSheetRow_(r);
  assert.equal(row[8], '12 of 12 (100%)');
  assert.equal(row[15], 'B: P1, P3');
});

test('a pattern in one section only is shown where it held, not flagged; small sections don\'t count', () => {
  const inp = empty();
  section(inp, 1, 'CAS-8175-L02', '8175-107', 6, () => ['MET'], { words: 5 });
  section(inp, 3, 'CAS-8175-L02', '8175-107', 6, () => ['NOT_MET', 'MET'], { words: 40 });
  section(inp, 5, 'CAS-8175-L02', '8175-107', 3, () => ['MET'], { words: 5 });
  const [r] = x.lessonReportRows_(inp);
  assert.deepEqual([...r.flags], []);
  assert.deepEqual([...r.heldIn.B], ['1']);
  assert.equal(r.sections, 2, 'period 5 has 3 students');
  assert.equal(r.everMet, 15);
});

test('unclear: many codes, few first goals ever met, each part on its own goal', () => {
  const inp = empty();
  for (const p of [2, 4]) {
    section(inp, p, 'CAS-8175-L24-P2', '8175-96', 6, (i) => (i === 0 ? ['NOT_MET', 'MET'] : ['NOT_MET', 'PARTIALLY_MET']), { codes: 5, words: 30 });
  }
  // Evidence for another competency on the same files doesn't count.
  inp.evidence.push({ fileId: 'file-2-CAS-8175-L24-P2-1', competencyId: '8175-94', outcome: 'MET', at: T0 });
  const [r] = x.lessonReportRows_(inp);
  assert.equal(r.key, '8175-L24');
  assert.equal(r.everMet, 2);
  assert.equal(r.codes, 10);
  assert.deepEqual([...r.flags], ['A']);
});

test('friction: few submissions; codes count only once codes were on', () => {
  const inp = empty();
  section(inp, 1, 'CAS-8175-L02', '8175-107', 8, () => ['MET'], { submitted: 2, words: 30 });
  section(inp, 2, 'CAS-8175-L02', '8175-107', 8, () => ['MET'], { submitted: 3, words: 30 });
  const [before] = x.lessonReportRows_(inp);
  assert.equal(before.codes, null, 'no code issued at all: codes off');
  assert.deepEqual([...before.flags], ['C']);
  assert.equal(x.lrSheetRow_(before)[12], 'codes off');
  assert.equal(x.lrSheetRow_(before)[6], '5 of 16 (31%)');
});

test('a workspace with no known assignment, or a fixture, is left out', () => {
  const inp = empty();
  inp.files.push({ fileId: 'f', configId: 'VDOE-FIXTURE-Z1', account: 'fixture-student@example.invalid', period: '1' });
  inp.files.push({ fileId: 'g', configId: 'VDOE-X', account: 'a@example.invalid', period: '1' });
  inp.assignments['VDOE-X'] = 'CAS-S1-U1-8175';
  assert.deepEqual([...x.lessonReportRows_(inp)], []);
});
