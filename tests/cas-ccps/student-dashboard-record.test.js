'use strict';
// The Student Dashboard's record tabs (2026-10-27): Competencies (every
// competency in the student's courses, the teacher's confirmed rating, the
// evidence behind it), Warm-ups (every past warm-up with its feedback) and
// My Context (the Student Context doc by week). Each is only the signed-in
// student's own data, and the AI's suggested ratings stay teacher-only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const SD = ['00_SharedConfig.js', '63_DocHeader.js', '13_StudentDashboard.js']
  .map(f => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f));
const ME = '1234567@ccpsnet.net';
const OTHER = '7654321@ccpsnet.net';
const TEACHER = 'teacher@ccpsnet.net';

function load(viewer) {
  const env = loadGasFiles(SD, ['getMyCompetencies', 'getMyWarmUpHistory', 'getMyContext', 'LEDGER', 'SCRDL',
    'WTB_HEADERS', 'buildStudentDashboardHtml_'],
  { Session: { getActiveUser: () => ({ getEmail: () => viewer }), getEffectiveUser: () => ({ getEmail: () => viewer }),
    getScriptTimeZone: () => 'America/New_York' } });
  const { exported, sandbox } = env;
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const row = (email, configId, lesson) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = email; r[L.CONFIG_ID] = configId; r[L.FILE_ID] = 'f-' + configId;
    r[L.STUDENT_NAME] = 'S'; r[L.TEACHER_EMAIL] = TEACHER; r[L.CLASS_NAME] = '8175 Sports Marketing';
    r[L.COURSE_NAME] = lesson; r[L.STATUS] = 'ACTIVE';
    return r;
  };
  ledger.appendRow(row(ME, 'VDOE-A1', '8175 L05 Revenue'));
  ledger.appendRow(row(ME, 'VDOE-A2', '8175 L06 SWOT'));
  ledger.appendRow(row(OTHER, 'VDOE-B1', '8175 L05 Revenue'));

  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'subject', 'grade_band', 'strand', 'teacher_email', 'active']);
  reg.appendRow(['8175-2', 'Demonstrate positive work ethic', 's', '9-12', 'Personal Qualities', '', 'TRUE']);
  reg.appendRow(['8175-1', 'Demonstrate creativity and innovation', 's', '9-12', 'Personal Qualities', '', 'TRUE']);
  reg.appendRow(['8175-30', 'Explain sponsorship revenue', 's', '9-12', 'Marketing Foundations', '', 'TRUE']);
  reg.appendRow(['8175-31', 'Retired task', 's', '9-12', 'Marketing Foundations', '', 'FALSE']);
  reg.appendRow(['8177-1', 'Not my course', 's', '9-12', 'Personal Qualities', '', 'TRUE']);

  const S = exported.SCRDL;
  const log = ss.insertSheet('SCRDecisionLog');
  log.appendRow(new Array(S.ARCHIVE_STATUS + 1).fill('h'));
  const decide = (email, comp, rating, at) => {
    const r = new Array(S.ARCHIVE_STATUS + 1).fill('');
    r[S.STUDENT_EMAIL] = email; r[S.COMPETENCY_ID] = comp; r[S.FINAL_RATING] = rating;
    r[S.DECISION_TYPE] = 'CONFIRMED'; r[S.DECIDED_AT] = at; r[S.DECIDED_BY] = TEACHER;
    log.appendRow(r);
  };
  decide(ME, '8175-30', 2, new Date('2026-10-22T12:00:00'));
  decide(OTHER, '8175-1', 1, new Date('2026-10-22T12:00:00'));
  // The AI's suggestion, never shown to the student.
  const sug = ss.insertSheet('SCRSuggestions');
  sug.appendRow(['student_email', 'competency_id', 'suggested_rating']);
  sug.appendRow([ME, '8175-1', 3]);

  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id',
    'evaluated_at', 'student_file_id', 'archive_status']);
  const evidence = (email, comp, outcome, configId, at, milestone, archived) =>
    ev.appendRow(['e', email, comp, milestone || 'Explain two revenue streams', outcome, configId, new Date(at), 'f', archived || '']);
  evidence(ME, '8175-30', 'PARTIALLY_MET', 'VDOE-A1', '2026-10-15T10:00:00');
  evidence(ME, '8175-30', 'MET', 'VDOE-A1', '2026-10-19T10:00:00');
  evidence(ME, '8175-30', 'NOT_MET', 'VDOE-A2', '2026-10-21T10:00:00');
  evidence(ME, '8175-1', 'MET', 'VDOE-A2', '2026-10-21T10:00:00', 'Also shown (tertiary competency)');
  evidence(ME, '8175-2', 'MET', 'VDOE-A1', '2025-09-01T10:00:00', 'old', 'ARCHIVED — pending disposition');
  evidence(OTHER, '8175-2', 'MET', 'VDOE-B1', '2026-10-21T10:00:00');
  return Object.assign(env, { ss });
}

test('Competencies: every competency in my course, by duty area in task order, with my rating and evidence', () => {
  const { exported } = load(ME);
  const d = exported.getMyCompetencies();
  assert.equal(d.success, true, JSON.stringify(d));
  assert.equal(d.courses.length, 1, 'only courses I am in');
  const c = d.courses[0];
  assert.deepEqual([c.code, c.className, c.done, c.total], ['8175', '8175 Sports Marketing', 1, 3]);
  assert.deepEqual(c.areas.map(a => [a.name, a.items.map(i => i.id)]),
    [['Personal Qualities', ['8175-1', '8175-2']], ['Marketing Foundations', ['8175-30']]],
    'task order, and a retired competency left out');
  const byId = Object.fromEntries(c.areas.flatMap(a => a.items).map(i => [i.id, i]));
  assert.equal(byId['8175-30'].rating, 2);
  assert.equal(byId['8175-30'].ratedAt, 'Oct 22, 2026');
  assert.equal(byId['8175-1'].rating, null, 'the AI suggestion is not shown, and another student\'s rating is not mine');
  assert.deepEqual(byId['8175-30'].evidence.map(e => [e.date, e.assignment, e.outcome, e.counts]), [
    ['Oct 21', '8175 L06 SWOT', 'Not shown yet', true],
    ['Oct 19', '8175 L05 Revenue', 'Shown', true],
    ['Oct 15', '8175 L05 Revenue', 'Partly shown', false],
  ], 'newest first; one assignment counts once, at its best result');
  assert.equal(byId['8175-1'].evidence[0].milestone, 'Also shown (tertiary competency)');
  assert.deepEqual(byId['8175-2'].evidence, [], 'archived evidence and another student\'s are left out');
  assert.doesNotMatch(JSON.stringify(d), /7654321/, 'nothing of another student');
});

test('Competencies: no account, or no courses, says so', () => {
  assert.equal(load('').exported.getMyCompetencies().success, false);
  const d = load('9999999@ccpsnet.net').exported.getMyCompetencies();
  assert.deepEqual([d.success, d.courses.length], [true, 0]);
});

test('Warm-ups: every past warm-up, newest first, nothing open to answer', () => {
  const env = load(ME);
  const wq = env.ss.insertSheet('WarmUpQueue');
  wq.appendRow(new Array(21).fill('h'));
  const tb = env.ss.insertSheet('WarmUpTextBox');
  tb.appendRow(env.exported.WTB_HEADERS);
  const add = (id, date, status, feedback, scores) => {
    const r = new Array(21).fill('');
    r[0] = id; r[2] = ME; r[4] = ME; r[5] = date; r[6] = JSON.stringify({ course_name: '8175 Sports Marketing' });
    r[8] = status; r[17] = feedback || '';
    if (scores) { r[12] = scores[0]; r[13] = scores[1]; r[14] = scores[2]; r[16] = scores[0] + scores[1] + scores[2]; }
    wq.appendRow(r);
    tb.appendRow([id, date, '', 'Question for ' + date, 'My answer ' + date, new Date(date + 'T14:00:00'), '', '']);
  };
  add('Q1', '2026-10-19', 'SCORED', 'Name a price.', [6, 1, 2]);
  add('Q2', '2026-10-21', 'SCORED', 'Good use of sponsors.', [5, 1, 3]);
  add('Q3', '2999-01-05', 'DELIVERED');
  const other = new Array(21).fill(''); other[0] = 'QX'; other[2] = OTHER; other[4] = OTHER; other[5] = '2026-10-20'; other[8] = 'SCORED';
  wq.appendRow(other);
  const d = env.exported.getMyWarmUpHistory();
  assert.equal(d.success, true, JSON.stringify(d));
  assert.deepEqual(d.warmUps.map(w => w.queueId), ['Q2', 'Q1'], 'mine, before today, newest first');
  assert.equal(d.warmUps[0].feedback, 'Good use of sponsors.');
  assert.equal(d.warmUps[0].score.points, 9);
  assert.equal(d.warmUps[0].warmup, 'Question for 2026-10-21');
  assert.ok(d.warmUps.every(w => !w.canAnswer && !w.extraCredit.canReply), 'history is read-only');
});

test('My Context: my doc by week, newest first; none yet says so', () => {
  const env = load(ME);
  const doc = env.sandbox.DocumentApp.create('Context');
  const body = doc.getBody();
  body.appendParagraph('Week of October 19, 2026').setHeading('HEADING2');
  body.appendParagraph('Completed Assignments').setHeading('HEADING3');
  body.appendParagraph('Week of October 26, 2026').setHeading('HEADING2');
  body.appendParagraph('Warm-Up Reflections').setHeading('HEADING3');
  const reg = env.ss.insertSheet('StudentDocRegistry');
  reg.appendRow(['email', 'name', 'doc_id', 'doc_url', 'created', 'updated', 'had_content']);
  reg.appendRow([OTHER, 'B', 'nope', 'https://docs.google.com/document/d/nope/edit', new Date(), new Date(), 'TRUE']);
  reg.appendRow([ME, 'A', doc.getId(), 'https://docs.google.com/document/d/' + doc.getId() + '/edit', new Date(), new Date(), 'TRUE']);
  const d = env.exported.getMyContext();
  assert.equal(d.success, true, JSON.stringify(d));
  assert.deepEqual(d.context.weeks.map(w => w.label), ['Week of October 26, 2026', 'Week of October 19, 2026']);
  assert.match(d.context.docUrl, new RegExp(doc.getId()));
  assert.equal(load('9999999@ccpsnet.net').exported.getMyContext().context, null);
});

// The page: four tabs, each loaded once when first opened.
function page() {
  const html = load(ME).exported.buildStudentDashboardHtml_();
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    classList: { add() {}, remove() {} } });
  const calls = [];
  let success = null;
  const run = new Proxy({}, { get: (t, p) => {
    if (p === 'withSuccessHandler') return (cb) => { success = cb; return run; };
    if (p === 'withFailureHandler') return () => run;
    return (...a) => { calls.push(p); };
  } });
  const ctx = { document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run } }, console, setTimeout() {}, setInterval() {}, navigator: {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(html).forEach((code) => vm.runInContext(code, ctx));
  return { html, ctx, els, calls, reply: (d) => success(d) };
}

test('the record tabs: shown in the header order, each loaded once', () => {
  const { html, ctx, els, calls, reply } = page();
  for (const t of ['assignments', 'competencies', 'warmups', 'context']) {
    assert.match(html, new RegExp('role="tab" id="tab-' + t + '" data-tab="' + t + '"'));
  }
  calls.length = 0;
  ctx.showTab('competencies');
  assert.equal(els['panel-competencies'].style.display, 'block');
  assert.equal(els['panel-assignments'].style.display, 'none');
  assert.equal(els['tab-competencies'].attrs['aria-selected'], 'true');
  assert.deepEqual(calls, ['getMyCompetencies']);
  reply({ success: true, courses: [{ code: '8175', className: '8175 Sports Marketing', done: 1, total: 113, areas: [
    { name: 'Marketing Foundations', items: [
      { id: '8175-30', task: 30, text: 'Explain sponsorship revenue', rating: 2, ratedAt: 'Oct 22, 2026', evidence: [
        { date: 'Oct 19', assignment: '8175 L05 Revenue', outcome: 'Shown', counts: true, milestone: 'Explain two revenue streams' },
        { date: 'Oct 15', assignment: '8175 L05 Revenue', outcome: 'Partly shown', counts: false, milestone: '' }] },
      { id: '8175-31', task: 31, text: 'Price a ticket', rating: null, ratedAt: '', evidence: [] }] }] }] });
  const h = els['panel-competencies'].innerHTML;
  assert.match(h, /<strong>1<\/strong> of 113 competencies done/);
  assert.match(h, /Marketing Foundations <span class="rec-chip">1 of 2 rated<\/span>/);
  assert.match(h, /30\. Explain sponsorship revenue<\/span><span class="rec-chip done">2 — Without supervision<\/span>/);
  assert.match(h, /Oct 19 · 8175 L05 Revenue: <strong>Shown<\/strong> \(counts\)<br><span class="rec-milestone">Explain two revenue streams/);
  assert.match(h, /Partly shown<\/strong> \(an earlier check; your best one counts\)/);
  assert.match(h, /31\. Price a ticket<\/span><span class="rec-chip">Not rated yet/);
  ctx.toggleCompEvidence(true);
  assert.doesNotMatch(els['panel-competencies'].innerHTML, /Price a ticket/, 'the toggle hides ones with nothing yet');

  ctx.showTab('assignments');
  ctx.showTab('competencies');
  assert.deepEqual(calls, ['getMyCompetencies'], 'opened again: not loaded again');

  ctx.showTab('context');
  reply({ success: true, context: { docUrl: 'https://docs.google.com/document/d/abc/edit', lastUpdatedAt: 'Oct 26',
    weeks: [{ label: 'Week of October 26, 2026', bookmark: 'id.x1', items: [{ text: 'Warm-Up Reflections', heading: true }] },
      { label: 'Week of October 19, 2026', items: [] }] } });
  assert.match(els['panel-context'].innerHTML, /<strong>Week of October 26, 2026<\/strong>.*\(1 of 2\)/);
  assert.match(els['panel-context'].innerHTML, /href="https:\/\/docs\.google\.com\/document\/d\/abc\/edit#bookmark=id\.x1"[^>]*>Open this week ↗/);
  ctx.stepMyContext(1);
  assert.match(els['panel-context'].innerHTML, /Week of October 19, 2026.*Nothing recorded this week/);
  assert.match(els['panel-context'].innerHTML, /Open the doc ↗/);

  ctx.showTab('warmups');
  reply({ success: true, warmUps: [{ queueId: 'Q2', dateLabel: 'Wed, Oct 21', course: '8175', displayStatus: 'Checked', statusClass: 'DONE',
    textBox: true, warmup: 'Q?', answer: 'A.', feedback: 'Good use of sponsors.', late: false,
    score: { points: 9, max: 10, length: 5, lengthMax: 6, grammar: 1, grammarMax: 1, engagement: 3, engagementMax: 3, extra: 0 },
    extraCredit: { credited: false, open: false, reply: 'I would add a second sponsor next time.' } }] });
  const w = els['panel-warmups'].innerHTML;
  assert.match(w, /Warm-up · Wed, Oct 21/);
  assert.match(w, /Good use of sponsors\./);
  assert.match(w, /<b>Your reply<\/b><br>I would add a second sponsor next time\./);
  assert.doesNotMatch(w, /<textarea/, 'nothing to answer in the history');
});

// 00 can't hold the week reader (every project loads 00, and not all may
// open Docs), so each dashboard has a copy. They must read a doc the same.
test('the two week readers (07 for teachers, 13 for students) are the same code', () => {
  const fs = require('fs');
  const dir = path.join(__dirname, '..', '..', 'cas-ccps', 'scripts');
  const body = (file, name) => {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const start = src.indexOf('function ' + name + '(docId) {');
    assert.ok(start !== -1, name);
    return src.slice(start, src.indexOf('\n}\n', start))
      .replace(name, 'F').replace(/(TD|DASH)_CONTEXT_MAX_WEEKS/g, 'MAX');
  };
  assert.equal(body('07_TeacherDashboard.js', '_tdContextWeeks_'), body('13_StudentDashboard.js', '_dashContextWeeks_'));
});
