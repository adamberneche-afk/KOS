'use strict';
// The Student Dashboard's Competencies tab (F17, approved 2026-11-14):
// every competency with the teacher's rating as its number and words, the
// latest evidence in the cards' words, the student's "I can" words, where
// it is practiced, sorts, and progress this marking period and this year.
// Only the signed-in student's own.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const { extractInlineScripts } = require('../../tools/html-lint/check.js');

const ROOT = path.join(__dirname, '..', '..');
const SD_FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:student-dashboard'].files
  .map((f) => path.join(ROOT, f));
const ME = 'amy@ccpsnet.net';
const OTHER = 'bo@ccpsnet.net';
const TEACHER = 'teacher@ccpsnet.net';
const C8175 = '8175 Sports Entertainment and Event Marketing';
const plain = (v) => JSON.parse(JSON.stringify(v));

function setUp(viewer) {
  const session = {
    getActiveUser: () => ({ getEmail: () => viewer || ME }),
    getEffectiveUser: () => ({ getEmail: () => TEACHER }),
    getScriptTimeZone: () => 'America/New_York',
  };
  const env = loadGasFiles(SD_FILES, ['getMyCompetencies', 'getStudentDashboardData', 'buildStudentDashboardHtml_', 'LEDGER',
    'DASH_LESSON_INFO', 'getDemoDashboardData'], { Session: session });
  const { exported, sandbox } = env;
  const L = exported.LEDGER;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', TEACHER);
  props.setProperty('MARKING_PERIOD_ENDS', '2627_MP1=2026-10-30,2627_MP2=2099-12-31');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['StudentConfigID', 'GoogleID', 'AssignmentConfigID', 'RecordedAt']);
  const row = (who, id, assignment, term, status, lastResult) => {
    const r = new Array(27).fill('');
    r[L.TIMESTAMP] = new Date(); r[L.GOOGLE_ID] = who; r[L.CONFIG_ID] = id; r[L.FILE_ID] = 'f-' + id;
    r[L.STUDENT_NAME] = 'Student'; r[L.TEACHER_EMAIL] = TEACHER; r[L.COURSE_NAME] = 'Lesson ' + id; r[L.CLASS_NAME] = C8175;
    r[L.BLOCK] = '1'; r[L.PERIOD] = '1'; r[L.STATUS] = status || 'ACTIVE'; r[L.LAST_RESULT] = lastResult || ''; r[L.ACADEMIC_YEAR] = term;
    ledger.appendRow(r);
    sa.appendRow([id, who, assignment, new Date()]);
  };
  row(ME, 'W-L01', 'CAS-8175-L01', '2627_MP1', 'COMPLETE', 'PASSED');
  row(ME, 'W-L03', 'CAS-8175-L03', '2627_MP2', 'COMPLETE', 'NEEDS_REVISION');
  row(ME, 'W-L05', 'CAS-8175-L05', '2627_MP2');
  row(OTHER, 'B-L03', 'CAS-8175-L03', '2627_MP2', 'COMPLETE', 'PASSED');
  const reg = ss.insertSheet('CompetencyRegistry');
  reg.appendRow(['competency_id', 'competency_text', 'strand', 'active']);
  const info = exported.DASH_LESSON_INFO;
  const l01 = info['8175-L01'].iCan[0].id;
  const l03 = info['8175-L03'].iCan[0].id;
  for (const [id, area] of [[l01, 'Overview'], [l03, 'Branding'], ['8175-31', 'Student organization'], ['8175-2', 'Personal qualities']]) {
    reg.appendRow([id, 'Text of ' + id, area, 'TRUE']);
  }
  const ev = ss.insertSheet('CompetencyEvidence');
  ev.appendRow(['evidence_id', 'student_email', 'competency_id', 'milestone_text', 'outcome', 'config_id', 'evaluated_at', 'student_file_id', 'archive_status']);
  ev.appendRow(['e1', ME, l01, 'm', 'MET', 'W-L01', new Date('2026-10-10T10:00:00'), 'f-W-L01', '']);
  ev.appendRow(['e2', ME, l03, 'm', 'NOT_MET', 'W-L03', new Date('2026-11-05T10:00:00'), 'f-W-L03', '']);
  ev.appendRow(['e3', OTHER, l03, 'm', 'MET', 'B-L03', new Date('2026-11-05T10:00:00'), 'f-B-L03', '']);
  return Object.assign(env, { ss, l01, l03 });
}

function page(exported) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, innerHTML: '', textContent: '', options: [], attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild() {}, classList: { add() {}, remove() {} } });
  const ctx = {
    document: { getElementById: el, addEventListener() {}, querySelectorAll: () => [] },
    google: { script: { run: new Proxy({}, { get: () => function () { return this; } }) } },
    console, setTimeout() {}, setInterval() {}, navigator: {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  extractInlineScripts(exported.buildStudentDashboardHtml_()).forEach((code) => vm.runInContext(code, ctx));
  return { ctx, els };
}

function itemOf(d, id) {
  for (const c of d.courses) for (const a of c.areas) for (const it of a.items) if (it.id === id) return it;
  return null;
}

test('the data: each competency\'s lessons with the student\'s words, its evidence\'s lesson and date, the term start', () => {
  const env = setUp();
  const d = plain(env.exported.getMyCompetencies());
  assert.equal(d.success, true, d.error);
  assert.equal(d.term, '2627_MP2');
  assert.equal(d.termStart, new Date(2026, 9, 31).getTime(), 'the day after MP1 ends');
  const it = itemOf(d, env.l03);
  assert.ok(it.lessons.some((l) => l.key === '8175-L03' && l.no === 'L03' && /^I can /.test(l.text)));
  assert.equal(it.evidence.length, 1, 'only the student\'s own evidence');
  assert.equal(it.evidence[0].lessonKey, '8175-L03');
  assert.ok(it.evidence[0].atMs > 0);
  // Q26 (on hold): a competency no lesson names has no lessons, and nothing special.
  const unmeasured = itemOf(d, '8175-31');
  assert.deepEqual(unmeasured.lessons, []);
  assert.equal(unmeasured.rating, null);
});

test('the tab: rating as number and words, latest evidence lighter, words, where practiced, progress, recent and next', () => {
  const env = setUp();
  const dash = plain(env.exported.getStudentDashboardData());
  const comp = plain(env.exported.getMyCompetencies());
  itemOf(comp, env.l01).rating = 2;
  itemOf(comp, env.l01).ratedAt = 'Oct 20, 2026';
  const { ctx } = page(env.exported);
  ctx.render(dash);
  const h = ctx.renderCompetencyTab(comp);
  assert.match(h, /<span class="rec-chip done">2 — Without supervision<\/span><span class="rec-latest">Latest: Shown<\/span>/);
  assert.match(h, /<span class="rec-chip">Not rated yet<\/span><span class="rec-latest">Latest: Not shown yet<\/span>/,
    'not rated yet, with the latest evidence words in a lighter style');
  assert.match(h, /<strong>In your words:<\/strong><ul class="rec-ican"><li><span class="lesson-chip">L03<\/span>I can /);
  // This term's lesson links to its card with its status; a closed-term one is a plain reference.
  assert.match(h, /<a href="#card-W-L03" onclick="return jumpToCard\('card-W-L03'\)"><span class="lesson-chip">L03<\/span>[^<]*<\/a> · Revise/);
  assert.match(h, /<li><span class="lesson-chip">L01<\/span>[^<]*· an earlier marking period<\/li>/);
  assert.doesNotMatch(h, /jumpToCard\('card-W-L01'\)/);
  assert.match(h, /Shown <span class="nw">this marking period 0<\/span> · <span class="nw">this year 1<\/span>/, 'L01 was shown in MP1; each count kept on one line');
  assert.match(h, /<h3>Recently shown<\/h3><ul><li>/);
  assert.match(h, /<h3>Next to practice<\/h3><ul><li><a href="#card-W-L03"/, 'from the lessons still to finish, in assigned order');
  const next = h.slice(h.indexOf('<h3>Next to practice</h3>'), h.indexOf('</ul>', h.indexOf('<h3>Next to practice</h3>')));
  assert.ok(next.length > 0 && !/8175-31|Student organization/.test(next), 'no unmeasured competency in Next to practice');
  assert.doesNotMatch(h, /rank|average|classmates|your class/i, 'no comparison or ranking');
});

test('sorts: by area (default), by rating, by most recent evidence; kept while the tab re-renders', () => {
  const env = setUp();
  const comp = plain(env.exported.getMyCompetencies());
  itemOf(comp, env.l03).rating = 4;
  itemOf(comp, env.l01).rating = 2;
  const { ctx } = page(env.exported);
  const order = (html) => { const h = html.slice(html.indexOf('class="rec-area')); return [env.l01, env.l03].sort((a, b) => h.indexOf('Text of ' + a) - h.indexOf('Text of ' + b)); };
  let h = ctx.renderCompetencyTab(comp);
  assert.match(h, /<select id="comp-sort" onchange="setCompSort\(this.value\)"><option value="area" selected>By area/);
  assert.match(h, /class="rec-area"><summary>/);
  vm.runInContext('_compSort = "rating"', ctx);
  h = ctx.renderCompetencyTab(comp);
  assert.deepEqual(order(h), [env.l01, env.l03], '2 before 4');
  assert.match(h, /rec-flat/);
  vm.runInContext('_compSort = "recent"', ctx);
  h = ctx.renderCompetencyTab(comp);
  assert.deepEqual(order(h), [env.l03, env.l01], 'Nov 5 before Oct 10');
});

test('demo: the tab has the lessons and the term start, opening nothing', () => {
  const env = setUp(TEACHER);
  const d = plain(env.exported.getDemoDashboardData());
  const c = d.tabs.competencies;
  assert.ok(c.term && c.termStart > 0);
  const items = c.courses.flatMap((x) => x.areas.flatMap((a) => a.items));
  assert.ok(items.some((it) => it.lessons.length && it.evidence.some((e) => e.lessonKey)));
});

// ── The Review panel (F17, SDV-N8) ─────────────────────────────────────────

const review = require('../../tools/cas-ccps/build-dashboard-review.js');
const fs = require('fs');

test('the review lookup (13d) is current, small, and reads both plan formats', () => {
  assert.equal(fs.readFileSync(review.TARGET_PATH, 'utf8'), review.expected(), 'run: node tools/cas-ccps/build-dashboard-review.js');
  assert.ok(fs.statSync(review.TARGET_PATH).size < 64 * 1024);
  assert.doesNotMatch(fs.readFileSync(review.TARGET_PATH, 'utf8'), /source: Google Doc|docs\.google\.com/, 'no Drive source lines');
  assert.deepEqual(review.recapsFromPlan([
    '  - **039:** Explain marketing as it relates to the industries (How marketing changed from the Trade Era to the Collaboration Era).',
    '  - **Competency 11:** Demonstrate big-picture thinking (Understanding how a font (or color) choice matters).',
    '  - **012:** Demonstrate career- and life-management skills.',
    '  - **Eras:** Did they list the 7 eras correctly?',
  ].join('\n'), '8175'), {
    '8175-39': 'How marketing changed from the Trade Era to the Collaboration Era',
    '8175-11': 'Understanding how a font (or color) choice matters',
  });
});

test('Review: a button with aria-expanded; the recap, key terms and linked videos per lesson; Covered So Far only when set up', () => {
  const env = setUp();
  const comp = plain(env.exported.getMyCompetencies());
  const it = itemOf(comp, env.l01);
  assert.ok(it.lessons.some((l) => l.recap), 'a recap from the lesson plan');
  assert.equal(comp.courses[0].coveredUrl, '', 'not set up on this project: no link');
  const { ctx } = page(env.exported);
  // A video link and a key-term list, as 13d carries them when the lesson has them.
  it.lessons[0].terms = 'era, marketing concept';
  it.lessons[0].watch = [{ title: 'The eras', url: 'https://www.youtube.com/watch?v=x' }, { title: 'Bad', url: 'javascript:alert(1)' }];
  let h = ctx.renderCompetencyTab(comp);
  const btn = new RegExp('<button type="button" class="parts-toggle" id="rv-' + env.l01 + '-b" data-comp="' + env.l01 + '" aria-expanded="false" aria-controls="rv-' + env.l01 + '" onclick="toggleReview\\(this\\)">Review</button>');
  assert.match(h, btn);
  assert.match(h, new RegExp('<div class="rv" id="rv-' + env.l01 + '" role="region" aria-label="Review" hidden>'));
  assert.match(h, /<strong>Key terms:<\/strong> era, marketing concept/);
  assert.match(h, /<a href="https:\/\/www\.youtube\.com\/watch\?v=x" target="_blank" rel="noopener">Watch: The eras ↗<\/a>/);
  assert.doesNotMatch(h, /javascript:|Watch: Bad/, 'only https links');
  assert.doesNotMatch(h, /covered so far/i);
  assert.doesNotMatch(h, /practice question|Quiz/i, 'no practice question');
  vm.runInContext('_reviewOpen[' + JSON.stringify(env.l01) + '] = true', ctx);
  h = ctx.renderCompetencyTab(comp);
  assert.match(h, new RegExp('data-comp="' + env.l01 + '" aria-expanded="true"'));
  // Set up and shared by the operator: the course's doc.
  env.sandbox.PropertiesService.getScriptProperties().setProperty('COVERED_SO_FAR_DOC_ID_8175', 'fake_covered_doc_id_for_test');
  const set = plain(env.exported.getMyCompetencies());
  assert.equal(set.courses[0].coveredUrl, 'https://docs.google.com/document/d/' + 'fake_covered_doc_id_for_test' + '/edit');
  assert.match(ctx.renderCompetencyTab(set), /What your class has covered so far ↗/);
});
