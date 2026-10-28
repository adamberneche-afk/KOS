'use strict';
// 67's agenda deck (meta/SPRINT_LESSON_DOCS_2026-11.md): one per course per
// school day, a slide per itinerary block with each period's minutes, read
// from the lesson doc so the teacher's edits carry in; the plan when no doc
// exists; remade in place.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@ccpsnet.net';

// SlidesApp, as far as 67 uses it. A deck is backed by a Drive file the Docs
// mock registers, so moveTo() into the Agendas folder works.
function fakeSlides(sandbox) {
  const decks = {};
  const slideOf = (pres) => {
    const s = { ph: {} };
    s.remove = () => pres.slides.splice(pres.slides.indexOf(s), 1);
    s.getPlaceholder = (t) => {
      const p = s.ph[t] = s.ph[t] || { text: '' };
      return { asShape: () => ({ getText: () => ({ setText: (x) => { p.text = x; } }) }) };
    };
    return s;
  };
  const api = {
    PredefinedLayout: { TITLE_AND_BODY: 'TITLE_AND_BODY' },
    PlaceholderType: { TITLE: 'TITLE', BODY: 'BODY' },
    create(title) {
      const id = sandbox.DocumentApp.create(title).getId();
      const pres = { title, slides: [], getId: () => id, saveAndClose() {} };
      pres.getSlides = () => pres.slides.slice();
      pres.appendSlide = () => { const s = slideOf(pres); pres.slides.push(s); return s; };
      pres.slides.push(slideOf(pres)); // a new deck's own title slide
      decks[id] = pres;
      return pres;
    },
    openById: (id) => decks[id],
  };
  return { api, decks };
}
const slideText = (deck) => deck.slides.map((s) => [(s.ph.TITLE || {}).text || '', (s.ph.BODY || {}).text || '']);

function load() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('22_LessonContextHandler.js'), S('26_CompetencyAlignmentLog.js'),
    S('23_StudentProfileManager.js'), S('27_LessonFrameGenerator.js'), S('32_CompetencyRubricImporter.js'), S('55b_LessonAssignmentData.js'), S('66_LessonDoc.js'), S('67_AgendaDeck.js')],
  ['makeOrRefreshLessonDoc_', 'makeAgendaDeck_', 'nextAgendaDay_'],
  { Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => TEACHER }) } });
  const { sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', 'fake-admin-ss');
  props.setProperty('TEACHER_EMAIL', TEACHER);
  const ls = ss.insertSheet('LessonSchedule');
  ls.appendRow(['course', 'lesson_key', 'lesson', 'start_date', 'config_id', 'notes']);
  ls.appendRow(['8175', '8175-L06', 'L06', '2026-10-26', 'CAS-8175-L06', '']);
  ls.appendRow(['8175', '8175-L07', 'L07', '2026-10-29', 'CAS-8175-L07', '']);
  const cs = ss.insertSheet('ClassSchedule');
  cs.appendRow(['teacher_email', 'period', 'day_type', 'course_name', 'active']);
  cs.appendRow([TEACHER, '1', 'DAILY_HALF', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '3-Odd', 'ODD', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '3-Even', 'EVEN', 'Sports and Entertainment Marketing', '']);
  cs.appendRow([TEACHER, '4', 'ODD', 'Entrepreneurship 8177', '']);
  const ns = ss.insertSheet('NoSchoolDays');
  ns.appendRow(['date', 'note']);
  ns.appendRow(['2026-10-27', 'a day off for the test']);
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['student_config_id', 'student_email', 'assignment_config_id']);
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const at = (d) => new sandbox.Date(d);
  // [workspace, period, status, submitted, lastResult, firstPassed]
  [['W1', '1', 'ACTIVE', null, '', null], ['W2', '1', 'SUBMITTED', at('2026-10-27T15:00:00Z'), '', null],
    ['W3', '3-Odd', 'COMPLETE', at('2026-10-27T15:00:00Z'), 'PASSED', at('2026-10-27T16:00:00Z')],
    ['W4', '3-Odd', 'SCHEDULED', null, '', null], ['OTHER', '1', 'ACTIVE', null, '', null]].forEach(([w, p, st, sub, res, fp]) => {
    const r = new Array(27).fill('');
    r[1] = '1234567@ccpsnet.net'; r[2] = w; r[4] = 'Student'; r[8] = TEACHER; r[11] = p; r[12] = st;
    r[13] = sub || ''; r[24] = res; r[25] = fp || '';
    ledger.appendRow(r);
    sa.appendRow([w, '1234567@ccpsnet.net', w === 'OTHER' ? 'CAS-8175-L07' : 'CAS-8175-L06']);
  });
  const slides = fakeSlides(sandbox);
  sandbox.SlidesApp = slides.api;
  return Object.assign(env, { ss, decks: slides.decks });
}


test('the deck: the day, a slide per block with each period\'s minutes from the lesson doc, and before you go', () => {
  const { exported, sandbox, ss, decks } = load();
  exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  const res = exported.makeAgendaDeck_('8175', '2026-10-28');
  assert.equal(res.success, true);
  assert.equal(res.created, true);
  const deck = Object.values(decks).find((d) => d.title === 'Agenda — 8175 — Wed Oct 28');
  const s = slideText(deck);
  assert.equal(s.length, 6, 'the day, four blocks, before you go; the new deck\'s blank slide removed');
  assert.equal(s[0][0], 'Wednesday, October 28 · Schedule B');
  assert.match(s[0][1], /^L06 SKILL DEVELOPMENT PLAN/);
  assert.match(s[0][1], /• I can plan to grow professionally/);
  assert.match(s[0][1], /3rd block: Lunch \(your wave\)\./, 'period 3-Even meets on the 28th');
  assert.equal(s[1][0], '✏️ Warm-up · Warm-up');
  assert.equal(s[3][0], '💻 Chromebooks out · Skill Development Plan (The "Soft Skills" Gap)');
  assert.match(s[3][1], /^Period 1: 25 min · Period 3-Even: 75 min/, 'the doc\'s 1st B and 3rd B columns');
  assert.equal(s[5][0], 'Before you go');
  assert.match(s[5][1], /Today is the last day for this lesson\./, 'L07 starts the 29th');
  assert.equal(sandbox.DriveApp.getFileById(deck.getId()).getParents().next().getName(), 'Agendas');
  const reg = ss.getSheetByName('AgendaDecks').getDataRange().getValues();
  assert.deepEqual(reg[1].slice(0, 2), ['8175', '2026-10-28']);
});

test('the teacher\'s edit to the doc\'s itinerary carries into the deck; remaking keeps one deck and one row', () => {
  const { exported, sandbox, ss, decks } = load();
  const doc = exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  exported.makeAgendaDeck_('8175', '2026-10-28');
  const table = sandbox.DocumentApp.openById(doc.docId).getBody().paragraphs.find((p) => p.getNumRows && p.getNumRows() > 0);
  table.rows[3].cells[3].paragraphs[0].text = '20'; // the task, 1st block on B
  const again = exported.makeAgendaDeck_('8175', '2026-10-28');
  assert.equal(again.created, false);
  const deck = Object.values(decks).find((d) => d.title === 'Agenda — 8175 — Wed Oct 28');
  assert.match(slideText(deck)[3][1], /^Period 1: 20 min/);
  assert.equal(slideText(deck).length, 6, 'the old slides are replaced, not added to');
  assert.equal(ss.getSheetByName('AgendaDecks').getLastRow(), 2);
  assert.equal(Object.values(decks).length, 1);
});

test('with no lesson doc the plan is fitted to each period; a day with no class is refused; the next class day', () => {
  const { exported, decks } = load();
  const res = exported.makeAgendaDeck_('8175', '2026-10-26');
  assert.equal(res.success, true);
  const s = slideText(Object.values(decks)[0]);
  assert.equal(s[0][0], 'Monday, October 26 · Schedule A');
  assert.match(s[3][1], /^Period 1: 30 min · Period 3-Even: 80 min/);
  assert.doesNotMatch(s[5][1], /last day/);
  assert.equal(exported.makeAgendaDeck_('8175', '2026-10-27').success, false, 'a day off');
  assert.match(exported.makeAgendaDeck_('8177', '2026-10-28').error, /No 8177 lesson/);
  assert.equal(exported.nextAgendaDay_('8175', '2026-10-26'), '2026-10-28');
});
