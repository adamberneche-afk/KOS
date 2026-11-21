'use strict';
// 67's agenda (archive/2026-27-Q1/meta/SPRINT_LESSON_DOCS_2026-11.md; one
// slide a day since 2026-11-19, the operator, with every course that meets
// on it): one deck per school year, a slide per day newest first, everything on it (the plan with each
// period's minutes, read from the lesson doc so the teacher's edits carry in,
// the bell schedule, what's due and the announcements, the learning
// targets); remade in place, keeping the teacher's speaker notes.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const TEACHER = 'teacher@ccpsnet.net';

// SlidesApp, as far as 67 uses it. A deck is backed by a Drive file the Docs
// mock registers, so moveTo() into the Agendas folder works. A slide keeps
// its shapes' text and its speaker notes.
function fakeSlides(sandbox) {
  const decks = {};
  let n = 0;
  const textOf = (initial) => {
    const t = { s: initial || '' };
    const style = { setFontFamily() { return style; }, setFontSize() { return style; }, setBold() { return style; },
      setItalic() { return style; }, setForegroundColor() { return style; } };
    return Object.assign(t, {
      asString: () => t.s, setText: (x) => { t.s = String(x); },
      getRange: () => ({ getTextStyle: () => style }),
      getParagraphStyle: () => ({ setParagraphAlignment() {} }),
    });
  };
  const slideOf = (pres) => {
    const s = { id: 'slide-' + (++n), boxes: [], rects: 0, notes: textOf('') };
    s.getObjectId = () => s.id;
    s.remove = () => pres.slides.splice(pres.slides.indexOf(s), 1);
    s.insertShape = () => { s.rects++; return { getFill: () => ({ setSolidFill() {} }), getBorder: () => ({ setTransparent() {} }) }; };
    s.insertTextBox = (text) => {
      const t = textOf(text);
      s.boxes.push(t);
      return { getText: () => t, getAutofit: () => ({ disableAutofit() {} }), setContentAlignment() {} };
    };
    s.getNotesPage = () => ({ getSpeakerNotesShape: () => ({ getText: () => s.notes }) });
    s.text = () => s.boxes.map((b) => b.s).join('\n');
    return s;
  };
  const api = {
    PredefinedLayout: { BLANK: 'BLANK' },
    ShapeType: { RECTANGLE: 'RECTANGLE' },
    ContentAlignment: { MIDDLE: 'MIDDLE', TOP: 'TOP' },
    ParagraphAlignment: { START: 'START', CENTER: 'CENTER', END: 'END' },
    create(title) {
      const id = sandbox.DocumentApp.create(title).getId();
      const pres = { title, slides: [], getId: () => id, saveAndClose() {} };
      pres.getSlides = () => pres.slides.slice();
      pres.insertSlide = (i) => { const s = slideOf(pres); pres.slides.splice(i, 0, s); return s; };
      pres.slides.push(slideOf(pres)); // a new deck's own title slide
      decks[id] = pres;
      return pres;
    },
    openById: (id) => decks[id],
  };
  return { api, decks };
}

function load() {
  const env = loadGasFiles([S('00_SharedConfig.js'), S('00c_CentralLedgerShared.js'), S('00d_TeacherDashboardShared.js'), S('00e_StudentDashboardShared.js'), S('22_LessonContextHandler.js'), S('26_CompetencyAlignmentLog.js'),
    S('23_StudentProfileManager.js'), S('27_LessonFrameGenerator.js'), S('32_CompetencyRubricImporter.js'), S('55b_LessonAssignmentData.js'), S('66_LessonDoc.js'), S('67_AgendaDeck.js'), S('68_LessonParts.js')],
  ['makeOrRefreshLessonDoc_', 'makeAgendaDeck_', 'nextAgendaDay_', 'agendaSlideSpec_'],
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



const yearDeck = (decks) => Object.values(decks).find((d) => d.title === 'Agenda — 2026–27');

test('one deck a year, one slide a day: the plan with each period\'s minutes from the lesson doc, the bell, targets, notes', () => {
  const { exported, sandbox, ss, decks } = load();
  exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  const res = exported.makeAgendaDeck_('8175', '2026-10-28');
  assert.equal(res.success, true);
  assert.equal(res.created, true);
  const deck = yearDeck(decks);
  assert.ok(deck, 'the teacher\'s deck for the school year');
  assert.equal(deck.slides.length, 1, 'the new deck\'s blank slide removed');
  const t = deck.slides[0].text();
  assert.match(t, /^L06 · SKILL DEVELOPMENT PLAN/m);
  assert.match(t, /Wednesday, October 28/);
  assert.match(t, /^Schedule B$/m);
  assert.match(t, /^Day 2 of 2 · last day$/m, 'Oct 26 and 28 (27 is off); L07 starts the 29th');
  assert.match(t, /^P1\nP3-Even$/m, 'a minutes column per period meeting');
  assert.match(t, /Skill Development Plan \(The "Soft Skills" Gap\)/);
  assert.match(t, /^25\n75$/m, 'the doc\'s 1st B and 3rd B columns for the task');
  assert.match(t, /1st {2}8:30–9:15 {2}· P1/);
  assert.match(t, /CM\/HR 9:20–9:45\n2nd/, 'in the day\'s order');
  assert.match(t, /Lunch waves: A 11:30/, 'the 3rd block meets');
  assert.match(t, /^Learning targets$/m);
  assert.match(t, /I can plan to grow professionally/);
  const notes = deck.slides[0].notes.asString();
  assert.match(notes, /^L06 SKILL DEVELOPMENT PLAN.*: today's plan, in detail:\n• Warm-up/);
  assert.match(notes, /YOUR NOTES \(kept when this slide is remade\):\nHow did today go\?/);
  assert.match(res.deckUrl, /#slide=id\.slide-\d+$/, 'the link opens at the day');
  assert.equal(sandbox.DriveApp.getFileById(deck.getId()).getParents().next().getName(), 'Agendas');
  const reg = ss.getSheetByName('AgendaDecks').getDataRange().getValues();
  assert.equal(reg[0][5], 'slide_id');
  assert.deepEqual([reg[1][0], reg[1][1], reg[1][5]], ['all', '2026-10-28', deck.slides[0].id]);
  assert.deepEqual(res.courses, ['8175'], 'only 8175 is dated: its own layout');
});

test('a new day goes on top of the same deck; remaking a day replaces its slide and keeps the teacher\'s notes', () => {
  const { exported, sandbox, ss, decks } = load();
  const doc = exported.makeOrRefreshLessonDoc_('8175-L06', { today: new sandbox.Date('2026-10-26T12:00:00Z') });
  exported.makeAgendaDeck_('8175', '2026-10-26');
  exported.makeAgendaDeck_('8175', '2026-10-28');
  const deck = yearDeck(decks);
  assert.equal(Object.values(decks).length, 1, 'no new file a day');
  assert.deepEqual(deck.slides.map((s) => /Monday|Wednesday/.exec(s.text())[0]), ['Wednesday', 'Monday'], 'newest first');
  // The teacher writes how the 28th went, and edits the doc's itinerary.
  deck.slides[0].notes.setText(deck.slides[0].notes.asString().replace(/How did today go\?.*$/s, 'The task ran 10 minutes long.'));
  const table = sandbox.DocumentApp.openById(doc.docId).getBody().paragraphs.find((p) => p.getNumRows && p.getNumRows() > 0);
  table.rows[3].cells[3].paragraphs[0].text = '20'; // the task, 1st block on B
  const again = exported.makeAgendaDeck_('8175', '2026-10-28');
  assert.equal(again.created, false);
  assert.equal(deck.slides.length, 2, 'replaced, not added');
  assert.match(deck.slides[0].text(), /Wednesday/, 'in the same place');
  assert.match(deck.slides[0].text(), /^20\n/m, 'the doc\'s edit carries in');
  assert.match(deck.slides[0].notes.asString(), /YOUR NOTES \(kept when this slide is remade\):\nThe task ran 10 minutes long\.$/);
  assert.equal(ss.getSheetByName('AgendaDecks').getLastRow(), 3, 'one row per day');
});

test('announcements and what\'s due: by date range and course; the plan fitted with no doc; days refused; next class day', () => {
  const { exported, ss, decks } = load();
  const ann = ss.insertSheet('AgendaAnnouncements');
  ann.appendRow(['from', 'to', 'course', 'text']);
  ann.appendRow(['2026-10-26', '2026-10-30', 'all', 'Spirit week: wear green Friday.']);
  ann.appendRow(['2026-10-26', '', '8175', 'Only on the 26th.']);
  ann.appendRow(['2026-10-26', '2026-10-30', '8177', 'Not this course.']);
  const res = exported.makeAgendaDeck_('8175', '2026-10-26');
  assert.equal(res.success, true);
  const t = yearDeck(decks).slides[0].text();
  assert.match(t, /Monday, October 26/);
  assert.match(t, /^Schedule A$/m);
  assert.match(t, /^30\n80$/m, 'the plan fitted to period 1 and 3-Even on A');
  assert.match(t, /• L06 SKILL DEVELOPMENT PLAN.* is due Wed, Oct 28, 11:59 p\.m\./, 'the school day before L07 starts');
  assert.match(t, /• Spirit week: wear green Friday\./);
  assert.match(t, /• Only on the 26th\./);
  assert.doesNotMatch(t, /Not this course/);
  const due = exported.makeAgendaDeck_('8175', '2026-10-28');
  assert.match(yearDeck(decks).slides[0].text(), /• Due tonight, 11:59 p\.m\.: L06 SKILL DEVELOPMENT PLAN/);
  assert.doesNotMatch(yearDeck(decks).slides[0].text(), /Only on the 26th/);
  assert.equal(due.success, true);
  assert.equal(exported.makeAgendaDeck_('8175', '2026-10-27').success, false, 'a day off');
  assert.match(exported.makeAgendaDeck_('8177', '2026-10-28').error, /No 8177 lesson/);
  assert.equal(exported.nextAgendaDay_('8175', '2026-10-26'), '2026-10-28');
});

test('the layout: every box inside the slide, text sized to fit, the long title on two lines', () => {
  const { exported } = load();
  const d = {
    lessonNo: 'L11', unitName: 'CHHS BRAND AUDIT (INTERNAL ANALYSIS)', courseName: '8175 Sports Entertainment and Event Marketing',
    dateLabel: 'Monday, November 23', scheduleLabel: 'Schedule A', day: { n: 2, of: 3 }, lastDay: false,
    rows: [{ mode: 'warmup', title: 'Warm-up' }, { mode: 'discuss', title: 'The Hook' },
      { mode: 'devices', title: 'CHHS Brand Audit (The Home Field Advantage)' }, { mode: 'write', title: 'Checkout Slip' }],
    periods: [{ period: '1', minutes: [5, 10, 30, 5] }, { period: '3-Odd', minutes: [5, 10, 80, 5] }],
    bell: [{ text: '1st  8:30–9:20  · P1', mine: true }, { text: '2nd  9:25–11:05', mine: false }],
    announcements: ['A '.repeat(600)], due: [], goals: ['I can ' + 'do a thing '.repeat(20), 'I can b', 'I can c'],
  };
  const spec = exported.agendaSlideSpec_(d);
  assert.equal(spec.width, 720);
  assert.equal(spec.height, 405);
  spec.elements.forEach((e) => {
    assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.w <= 720.5 && e.y + e.h <= 405.5, JSON.stringify(e).slice(0, 80));
  });
  const texts = spec.elements.filter((e) => e.kind === 'text');
  const sizes = texts.flatMap((e) => e.paras.flat().map((r) => r.size));
  assert.ok(Math.min(...sizes) >= 8.5, 'nothing smaller than 8.5 pt');
  const ann = texts.find((e) => /^• A A/.test(e.paras[0][0].t));
  assert.match(ann.paras[0][0].t, /…$/, 'a long announcement is cut, not spilled');
  const long = texts.find((e) => /CHHS Brand Audit \(The Home Field Advantage\)/.test(e.paras[0][0].t));
  assert.ok(long, 'the long title whole, on two lines');
  assert.equal(long.paras.length, 1, 'no mode line under a two-line title');
});

test('the renderer draws the same spec: a box per element, in points', () => {
  const { specHtml, sampleData, loadSpec } = require('../../tools/cas-ccps/render-agenda-slide.js');
  const x = loadSpec();
  const spec = x.agendaSlideSpec_(sampleData(x, '8177-product-pitch-financial-analysis', '2026-11-19', ['4'], ['Picture day Friday.']));
  const html = specHtml(spec);
  assert.equal((html.match(/class="[rt]"/g) || []).length, spec.elements.length);
  assert.match(html, /width:720pt;height:405pt/);
  assert.match(html, /Picture day Friday\./);
  assert.match(html, /4th {2}1:30–3:00 {2}· P4/, 'Schedule B on a Thursday; period 4 marked');
});


test('both courses on the same slide: a column each, the bell marking each course\'s periods; either course\'s button makes the one slide', () => {
  const { exported, ss, decks } = load();
  ss.getSheetByName('LessonSchedule').appendRow(['8177', '8177-product-pitch-financial-analysis', 'L06', '2026-10-26', '', '']);
  const res = exported.makeAgendaDeck_('8175', '2026-10-29'); // odd: 8175 P1 and P3-Odd, 8177 P4
  assert.equal(res.success, true);
  assert.deepEqual(res.courses, ['8175', '8177']);
  const deck = yearDeck(decks);
  assert.equal(deck.slides.length, 1);
  const t = deck.slides[0].text();
  assert.match(t, /^Thursday, October 29$/m);
  assert.match(t, /^8175\s+Day 1/m);
  assert.match(t, /^8177\s+Day \d+/m);
  assert.match(t, /The Venue Buyer's Product Pitch/);
  assert.match(t, /· 8175 P1/);
  assert.match(t, /· 8175 P3-Odd/);
  assert.match(t, /· 8177 P4/);
  assert.equal((t.match(/^Learning targets$/gm) || []).length, 2, 'each course\'s own');
  assert.match(deck.slides[0].notes.asString(), /^8175 · L07 .*: today's plan, in detail:[\s\S]*\n8177 · L06 The Venue Buyer's Product Pitch: today's plan/m);
  const again = exported.makeAgendaDeck_('8177', '2026-10-29');
  assert.equal(again.created, false, 'the same day\'s slide');
  assert.equal(deck.slides.length, 1);
  assert.match(exported.makeAgendaDeck_('8177', '2026-10-28').error, /No 8177 period meets on 2026-10-28/, 'period 4 meets odd days');
});
