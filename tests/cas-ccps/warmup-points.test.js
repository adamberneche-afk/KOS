'use strict';
// Warm-up points (80_WarmUpPoints.js, 80b_WarmUpPointsPanel.js): every
// delivered warm-up whose day has passed is worth 10, unscored counts 0,
// extra credit is counted apart; the teacher sees every student by term, a
// student sees only their own total per term, and the Warm-ups tab shows no
// per-warm-up score.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js',
  '80_WarmUpPoints.js', '07_TeacherDashboard.js', '80b_WarmUpPointsPanel.js'].map(S);
const EXPOSE = ['warmUpPointsTally_', 'studentWarmUpPoints_', 'warmUpPointsPayload_', 'getWarmUpPoints', 'buildDashboardHtml_', 'LEDGER'];
const TEACHER = 'teacher@example.com'; // the sandbox's default Session user
const A = 'a@ccpsnet.net';
const B = 'b@ccpsnet.net';
const NOW = new Date('2026-11-20T15:00:00Z'); // marking period 2 of 2026-27 (00's default table)

// A WarmUpRegistry row: [warmup_id, queue_id, lesson_id, lesson_date, email,
// name, teacher, doc_id, doc_url, generated_at, total, extra_credit, term, checked].
const reg = (email, name, date, total, ec, term, teacher) =>
  ['W', 'Q', 'L', date, email, name, teacher || TEACHER, '', '', '', total, ec, term || '', ''];

function setUp(viewer) {
  const env = loadGasFiles(FILES, EXPOSE, viewer ? { Session: {
    getActiveUser: () => ({ getEmail: () => viewer }), getEffectiveUser: () => ({ getEmail: () => viewer }),
    getScriptTimeZone: () => 'America/New_York' } } : undefined);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow(new Array(14).fill('h'));
  [
    reg(A, 'Avery', '2026-10-20', 9, 0, '2627_MP1'),
    reg(A, 'Avery', '2026-10-22', 11, 1, '2627_MP1'),  // 10 plus extra credit
    reg(A, 'Avery', '2026-11-17', 9, 1, ''),           // no term: its date's (MP2); 8 plus extra credit
    reg(A, 'Avery', '2026-11-18', '', '', '2627_MP2'), // delivered, never answered: 0 of 10
    reg(A, 'Avery', '2026-11-20', 7, 0, '2627_MP2'),   // today: not counted yet
    reg(B, 'Blake', '2026-11-17', 6, 0, '2627_MP2'),
    reg(B, 'Blake', '2026-11-18', 5, 0, '2627_MP2', 'someone@else.net'), // another teacher's
    reg(B, 'Blake', '2025-11-18', 10, 0, '2526_MP2'),  // last school year
  ].forEach((r) => wr.appendRow(r));
  const L = env.exported.LEDGER;
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const lrow = (email, cls, period) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = email; r[L.CLASS_NAME] = cls; r[L.PERIOD] = period; r[L.ACADEMIC_YEAR] = '2627_MP2';
    return r;
  };
  ledger.appendRow(lrow(A, '8175 Sports Marketing', '3'));
  ledger.appendRow(lrow(B, '8177 Sports Management', '5'));
  return Object.assign(env, { ss });
}

test('the tally: delivered warm-ups whose day has passed, out of 10; extra credit apart; unscored is 0', () => {
  const env = setUp();
  const rows = env.ss.getSheetByName('WarmUpRegistry').getDataRange().getValues().slice(1);
  const t = env.exported.warmUpPointsTally_(rows, { today: '2026-11-20', teacherEmail: TEACHER, schoolYear: '2026-27',
    termOf: (d) => (d <= '2026-10-30' ? '2627_MP1' : '2627_MP2') });
  assert.deepEqual(t.terms, ['2627_MP1', '2627_MP2']);
  assert.deepEqual(JSON.parse(JSON.stringify(t.students[A].terms)), {
    '2627_MP1': { delivered: 2, scored: 2, earned: 19, extra: 1 },
    '2627_MP2': { delivered: 2, scored: 1, earned: 8, extra: 1 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(t.students[B].terms)), { '2627_MP2': { delivered: 1, scored: 1, earned: 6, extra: 0 } },
    'another teacher\'s row and last year\'s are left out');
});

test('a student sees their own total per term, earned plus extra credit, the current term first', () => {
  const env = setUp();
  const pts = env.exported.studentWarmUpPoints_(env.ss, { tabs: { warmUpRegistry: 'WarmUpRegistry' } }, A.toUpperCase(), NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(pts)), [
    { term: '2627_MP2', label: 'Marking period 2, 2026–27', current: true, points: 9 },
    { term: '2627_MP1', label: 'Marking period 1, 2026–27', current: false, points: 20 },
  ]);
  const none = env.exported.studentWarmUpPoints_(env.ss, { tabs: { warmUpRegistry: 'WarmUpRegistry' } }, 'new@ccpsnet.net', NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(none)), [{ term: '2627_MP2', label: 'Marking period 2, 2026–27', current: true, points: 0 }],
    'a student with none yet still sees this term, at 0');
});

test('the teacher\'s payload: every student by term, with course and period from the Ledger', () => {
  const env = setUp();
  const cfg = { teacherEmail: TEACHER, tabs: { warmUpRegistry: 'WarmUpRegistry', ledger: 'Ledger' } };
  const d = JSON.parse(JSON.stringify(env.exported.warmUpPointsPayload_(env.ss, cfg, NOW)));
  assert.equal(d.success, true);
  assert.equal(d.currentTerm, '2627_MP2');
  assert.deepEqual(d.terms.map((t) => t.term), ['2627_MP1', '2627_MP2']);
  assert.deepEqual(d.students.map((s) => [s.name, s.courses, s.periods]), [['Avery', ['8175'], ['3']], ['Blake', ['8177'], ['5']]]);
  assert.deepEqual(d.students[0].terms['2627_MP2'], { delivered: 2, scored: 1, earned: 8, extra: 1, possible: 20, percent: 40 });
  assert.equal(JSON.stringify(d).indexOf('@'), -1, 'no email addresses in the payload');
});

test('getWarmUpPoints answers only the teacher', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(setUp(A).exported.getWarmUpPoints())), { success: false, error: 'Not authorized.' });
  assert.equal(setUp().exported.getWarmUpPoints().success, true);
});

// The panel's client code, run against the payload.
function panel(env) {
  const html = env.exported.buildDashboardHtml_({ teacherEmail: TEACHER });
  assert.match(html, /id="warmup-points-btn"[^>]*onclick="openWarmUpPoints\(\)"/, 'More ▾ opens the panel');
  assert.match(html, /id="wup-modal-backdrop"/);
  const script = /<script>\s*let _wup = null;[\s\S]*?<\/script>/.exec(html)[0].replace(/^<script>|<\/script>$/g, '');
  const body = { innerHTML: '' };
  const ctx = vm.createContext({ document: { getElementById: () => body },
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') });
  vm.runInContext(script + '\n;globalThis.show = function (d, term, course) { _wup = d; _wupTerm = term; _wupCourse = course || ""; renderWarmUpPoints(); };', ctx);
  return { show: (d, term, course) => { ctx.show(d, term, course); return body.innerHTML; } };
}

test('the panel: points out of the possible, the percentage and the class total; whole year and course filters', () => {
  const env = setUp();
  const cfg = { teacherEmail: TEACHER, tabs: { warmUpRegistry: 'WarmUpRegistry', ledger: 'Ledger' } };
  const d = JSON.parse(JSON.stringify(env.exported.warmUpPointsPayload_(env.ss, cfg, NOW)));
  const p = panel(env);
  const mp2 = p.show(d, '2627_MP2');
  assert.match(mp2, /Avery<\/td><td[^>]*>3<\/td><td[^>]*>8 \/ 20<\/td><td[^>]*>40%<\/td><td[^>]*>1 of 2<\/td><td[^>]*>\+1<\/td>/);
  assert.match(mp2, /Blake<\/td><td[^>]*>5<\/td><td[^>]*>6 \/ 10<\/td><td[^>]*>60%/);
  assert.match(mp2, /Class<\/td><td><\/td><td[^>]*>14 \/ 30<\/td><td[^>]*>47%/);
  assert.match(p.show(d, '*'), /Avery<\/td><td[^>]*>3<\/td><td[^>]*>27 \/ 40<\/td><td[^>]*>68%/, 'whole school year sums the terms');
  const only8177 = p.show(d, '2627_MP2', '8177');
  assert.ok(!/Avery/.test(only8177) && /Blake/.test(only8177), 'the course filter');
  assert.match(p.show(d, '2627_MP1', '8177'), /No warm-ups delivered/);
});

test('the Warm-ups tab shows the points by term above the past warm-ups', () => {
  const page = require('fs').readFileSync(S('13_StudentDashboardPage.html'), 'utf8');
  const fn = /function renderWarmUpHistory\(d\) \{[\s\S]*?\n\}\n/.exec(page)[0];
  const ctx = vm.createContext({ esc: (s) => String(s), _wuPrevious: (w) => '<div>' + w.queueId + '</div>' });
  vm.runInContext(fn, ctx);
  const html = ctx.renderWarmUpHistory({ points: [
    { term: '2627_MP2', label: 'Marking period 2, 2026–27', current: true, points: 9 },
    { term: '2627_MP1', label: 'Marking period 1, 2026–27', current: false, points: 20 }], warmUps: [{ queueId: 'Q1' }] });
  assert.match(html, /Your warm-up points[\s\S]*<b>9 points<\/b> · this marking period[\s\S]*<b>20 points<\/b> · Marking period 1/);
  assert.match(html, /Q1/);
  assert.match(ctx.renderWarmUpHistory({ points: [], warmUps: [] }), /No past warm-ups yet/);
});

test('the term report (25) uses the same tally: extra credit is no longer counted in the points as well', () => {
  const env = loadGasFiles(['00_SharedConfig.js', '00c_CentralLedgerShared.js', '00d_TeacherDashboardShared.js', '00e_StudentDashboardShared.js',
    '80_WarmUpPoints.js', '22_LessonContextHandler.js', '25_WarmUpWriter.js'].map(S), ['generateWarmUpReport']);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('CURRENT_TERM', '2627_MP2');
  props.setProperty('MARKING_PERIOD_ENDS', '2627_MP1=2026-10-30,2627_MP2=2099-01-22');
  const wr = ss.insertSheet('WarmUpRegistry');
  wr.appendRow(new Array(14).fill('h'));
  wr.appendRow(reg(A, 'Avery', '2026-11-17', 9, 1, '2627_MP2'));
  wr.appendRow(reg(A, 'Avery', '2026-11-18', '', '', '2627_MP2'));
  const r = env.exported.generateWarmUpReport();
  const text = env.sandbox.DocumentApp.openById(r.docId).getBody().getText();
  assert.match(text, /Avery {3}8\/20 pts \(40%\) \(\+1 EC\) {3}1\/2 completed \(50%\)/);
});
