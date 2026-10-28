'use strict';
// FEEDBACK_AS_COMMENT (00_SharedConfig.js): Flow 2 feedback goes on the
// student's doc as a comment instead of into the doc, so the doc holds only
// the assignment and the student's work. Off by default. The harvest side
// (37) is covered in flow-input-builder.test.js; this file covers the flag,
// the doc intake builds (02), backprop's post-processing (03) and the
// Student Dashboard's wording (13).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);

// The flag is read through getConfig_'s resolution, which needs a Ledger.
function setFlag(sandbox, value) {
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  if (value !== undefined) props.setProperty('FEEDBACK_AS_COMMENT', value);
}

test('feedbackAsCommentFor_: off by default, "all" for every course, or one course by code', () => {
  const cases = [
    [undefined, 'CAS-8175-L06', false],
    ['off', 'CAS-8175-L06', false],
    ['all', 'CAS-8175-L06', true],
    ['all', 'VDOE-ABC123-2026', true],
    ['8175', 'CAS-8175-L06', true],
    ['8175', 'CAS-8177-L06', false],
    // A workspace ID with no Ledger row and no course name: no course.
    ['8175', 'VDOE-ABC123-2026', false],
  ];
  for (const [flag, configId, expected] of cases) {
    const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js')], ['feedbackAsCommentFor_']);
    setFlag(sandbox, flag);
    assert.equal(exported.feedbackAsCommentFor_(configId), expected, flag + ' / ' + configId);
  }
});

// A student's ConfigID is a workspace ID (02's generateConfigId_), so a
// one-course value finds the course in a course name or the Ledger row.
// Before 2026-10-22 it read the course from the ConfigID only, and a value
// of "8175" reached no student.
function ledgerRow(configId, className) {
  const row = new Array(23).fill('');
  row[2] = configId; row[6] = className; row[9] = className; row[10] = className;
  return row;
}

test('feedbackAsCommentFor_: a workspace ID takes its course from a course name or its Ledger row', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js')], ['feedbackAsCommentFor_', 'feedbackAsCommentChecker_']);
  setFlag(sandbox, '8175');
  const ss = sandbox.SpreadsheetApp.openById(sandbox.PropertiesService.getScriptProperties().getProperty('CENTRAL_LEDGER_SS_ID'));
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  ledger.appendRow(ledgerRow('VDOE-AAAAAA-2026', 'Sports and Entertainment Marketing'));
  ledger.appendRow(ledgerRow('VDOE-BBBBBB-2026', 'Entrepreneurship 8177'));
  ledger.appendRow(ledgerRow('VDOE-CCCCCC-2026', ''));

  assert.equal(exported.feedbackAsCommentFor_('VDOE-AAAAAA-2026'), true, 'Marketing is 8175');
  assert.equal(exported.feedbackAsCommentFor_('VDOE-BBBBBB-2026'), false);
  assert.equal(exported.feedbackAsCommentFor_('VDOE-CCCCCC-2026'), false, 'a row naming no course');
  assert.equal(exported.feedbackAsCommentFor_('VDOE-ZZZZZZ-2026'), false, 'no Ledger row');
  // Intake stamps the doc before its Ledger row exists: the class decides.
  assert.equal(exported.feedbackAsCommentFor_('VDOE-NEWNEW-2026', 'Sports Marketing'), true);
  assert.equal(exported.feedbackAsCommentFor_('VDOE-NEWNEW-2026', 'Entrepreneurship'), false);

  // The checker reads the Ledger once for a loop, and not at all for "off" or "all".
  let reads = 0;
  const getRange = ledger.getRange.bind(ledger);
  ledger.getRange = (...a) => { reads++; return getRange(...a); };
  const check = exported.feedbackAsCommentChecker_();
  assert.deepEqual(['VDOE-AAAAAA-2026', 'VDOE-BBBBBB-2026', 'VDOE-AAAAAA-2026'].map((id) => check(id)), [true, false, true]);
  assert.equal(reads, 1);
  sandbox.PropertiesService.getScriptProperties().setProperty('FEEDBACK_AS_COMMENT', 'all');
  reads = 0;
  assert.equal(exported.feedbackAsCommentChecker_()('VDOE-ZZZZZZ-2026'), true);
  assert.equal(reads, 0);
});

function stamp(flag, configId, prompt) {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('63_DocHeader.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')], ['stampDocument_']);
  setFlag(sandbox, flag);
  const doc = sandbox.DocumentApp.create('Lesson 06 — student');
  exported.stampDocument_(doc.getId(), configId, 'A Student', 'B2', 'Sports Marketing', 'Teacher',
    '3', 'L06 SKILL DEVELOPMENT PLAN', prompt || 'Write your plan.', 'ledger-id', 'admin-id', 'https://example.test/exec');
  const d = sandbox.DocumentApp.openById(doc.getId());
  return { text: d.getBody().getText(), header: d.getHeader(), footer: d.getFooter(), sandbox, id: doc.getId() };
}

test('stampDocument_: who, what, the dashboard link and the feedback status are in a small grey page header', () => {
  const { header } = stamp('all', 'CAS-8175-L06');
  assert.equal(header.getNumChildren(), 2);
  const [line1, line2] = [header.getChild(0), header.getChild(1)];
  assert.equal(line1.getText(),
    'A Student  ·  Sports Marketing — Teacher  ·  Block B2  ·  Period 3  ·  L06 SKILL DEVELOPMENT PLAN  ·  Your dashboard');
  assert.deepEqual(line1.links, [{ text: 'Your dashboard', url: 'https://example.test/exec' }]);
  assert.match(line2.getText(), /^Feedback: not submitted yet/);
  for (const p of [line1, line2]) {
    assert.equal(p.fontSize, 8);
    assert.equal(p.color, '#5f6368');
  }
});

test('stampDocument_: with the flag on, the body is the assignment and the response space only', () => {
  const { text } = stamp('all', 'CAS-8175-L06');
  for (const gone of ['📊 FEEDBACK', '── FEEDBACK ──', '[No feedback yet.', '── END FEEDBACK ──',
    'Student: A Student', 'Your assignment dashboard:', '📋 ASSIGNMENT', '━━━']) {
    assert.ok(!text.includes(gone), gone + ' should be gone');
  }
  const at = (x) => text.indexOf(x);
  assert.ok(at('L06 SKILL DEVELOPMENT PLAN') !== -1 && at('L06 SKILL DEVELOPMENT PLAN') < at('Write your plan.'));
  assert.ok(at('Write your plan.') < at('── YOUR RESPONSE BEGINS HERE ──'));
  assert.ok(at('── YOUR RESPONSE BEGINS HERE ──') < at('[CONFIG_ID: CAS-8175-L06]'));
  assert.ok(text.includes('[SYS_DASHBOARD_URL:https://example.test/exec]'), 'the menu still finds the dashboard');
});

// 2026-10-22: the student's writing space at 10 pt, set on the paragraphs
// so the empty writing space keeps its size. Since 2026-10-24 the assignment
// is in a table at 9 pt.
test('stampDocument_: the assignment is 9 pt in its table and the student\'s writing space 10 pt', () => {
  for (const flag of ['all', undefined]) {
    const { sandbox, id } = stamp(flag, 'CAS-8175-L06');
    const body = sandbox.DocumentApp.openById(id).getBody();
    const paras = Array.from({ length: body.getNumChildren() }, (_, i) => body.getChild(i));
    const size = (p) => p.getAttributes().FONT_SIZE;
    const at = (t) => paras.findIndex((p) => p.getType() !== 'TABLE' && p.getText() === t);
    const marker = at('── YOUR RESPONSE BEGINS HERE ──');
    const table = paras.find((p) => p.getType() === 'TABLE');
    assert.equal(table.getCell(1, 0).getChild(0).getText(), 'Write your plan.');
    assert.equal(size(table.getCell(1, 0).getChild(0)), 9, flag + ': the assignment');
    assert.equal(paras[marker + 1].getText(), '');
    assert.equal(size(paras[marker + 1]), 10, flag + ': the writing space');
    if (!flag) {
      assert.equal(size(paras[at('── END FEEDBACK ──')]), 8, 'the feedback zone, whose size 37 copies');
    }
  }
});

// 2026-10-22: the operator asked for tabs to move between the assignment
// and the response. The work stays in one tab (every reader of the
// response reads the first tab), so headings make the Docs outline and two
// links jump between them, both above the response marker.
test('stampDocument_: headings and two jump links move between the assignment and the response', () => {
  for (const flag of ['all', undefined]) {
    const { sandbox, id } = stamp(flag, 'CAS-8175-L06');
    const doc = sandbox.DocumentApp.openById(id);
    const body = doc.getBody();
    const paras = Array.from({ length: body.getNumChildren() }, (_, i) => body.getChild(i));
    const at = (t) => paras.findIndex((p) => p.getText() === t);
    const title = paras[at('L06 SKILL DEVELOPMENT PLAN')];
    const heading = paras[at('Your response')];
    assert.equal(title.getHeading(), 'HEADING1');
    assert.equal(heading.getHeading(), 'HEADING2');

    const follow = (label) => {
      const p = paras.find((x) => (x.links || []).some((l) => l.text === label));
      assert.ok(p, flag + ': a link labelled ' + label);
      const url = p.links.find((l) => l.text === label).url;
      assert.match(url, /^#bookmark=/);
      return { from: paras.indexOf(p), to: doc.getBookmark(url.slice('#bookmark='.length)).position.element };
    };
    const down = follow('↓ Go to your response');
    const up = follow('↑ Back to the assignment');
    assert.equal(down.to, heading);
    assert.equal(up.to, title);
    const marker = at('── YOUR RESPONSE BEGINS HERE ──');
    assert.ok(down.from < marker && up.from < marker, 'no link inside the response zone');
    const table = paras.findIndex((p) => p.getType() === 'TABLE');
    assert.ok(table > down.from && table < at('Your response'), 'the assignment table sits between the two links');
    assert.match(paras[up.from].getText(), /^Write your answer under the grey line below\./);
  }
});

test('stampDocument_: the response a student writes is read the same with the new lines', () => {
  const { sandbox, id } = stamp('all', 'CAS-8175-L06');
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('63_DocHeader.js'), S('13_StudentDashboard.js')],
    ['dashExtractResponse_']);
  const body = sandbox.DocumentApp.openById(id).getBody();
  const paras = Array.from({ length: body.getNumChildren() }, (_, i) => body.getChild(i));
  const marker = paras.findIndex((p) => p.getText() === '── YOUR RESPONSE BEGINS HERE ──');
  paras[marker + 1].setText('My plan is to practice every day.');
  assert.equal(exported.dashExtractResponse_(body.getText()), 'My plan is to practice every day.');
});

test('stampDocument_: with the flag off, the feedback zone is built as before', () => {
  const { text } = stamp(undefined, 'CAS-8175-L06');
  const at = (s) => text.indexOf(s);
  assert.ok(at('── FEEDBACK ──') !== -1 && at('── FEEDBACK ──') < at('[No feedback yet.'));
  assert.ok(at('[No feedback yet.') < at('── END FEEDBACK ──'));
  assert.ok(at('── END FEEDBACK ──') < at('── YOUR RESPONSE BEGINS HERE ──'));
  assert.ok(text.includes('Your feedback will appear here.'), 'not "at the end of this document"');
});

test('setDocFeedbackStatus_: checking stays grey; a result is color-coded and says where the feedback is', () => {
  const { sandbox, id } = stamp('all', 'CAS-8175-L06');
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('63_DocHeader.js')], ['setDocFeedbackStatus_'], { DocumentApp: sandbox.DocumentApp });
  const line = () => sandbox.DocumentApp.openById(id).getHeader().getChild(1);
  assert.equal(exported.setDocFeedbackStatus_(id, 'CHECKING', {}), true);
  assert.match(line().getText(), /^Feedback: submitted .*, waiting for feedback\.$/);
  assert.equal(line().color, '#5f6368');
  exported.setDocFeedbackStatus_(id, 'REVISE', { inComments: true });
  assert.match(line().getText(), /^Feedback: ✏️ Revise, then submit again \(.*\)\. Read the comment on this doc first\.$/);
  assert.equal(line().color, '#b06000');
  exported.setDocFeedbackStatus_(id, 'PASSED', { inComments: false });
  assert.match(line().getText(), /See the Feedback section below\.$/);
  assert.equal(line().color, '#137333');
  assert.equal(line().fontSize, 8);
});

test('setDocFeedbackStatus_: a doc made before the header is left alone', () => {
  const { exported, sandbox } = loadGasFiles([S('00_SharedConfig.js'), S('63_DocHeader.js')], ['setDocFeedbackStatus_']);
  const doc = sandbox.DocumentApp.create('Older doc');
  doc.getBody().setText('Assignment\n── YOUR RESPONSE BEGINS HERE ──\nMy plan.');
  assert.equal(exported.setDocFeedbackStatus_(doc.getId(), 'PASSED', {}), false);
  assert.equal(doc.getHeader(), null);
  assert.equal(exported.setDocFeedbackStatus_('missing-doc', 'PASSED', {}), false);
});

test('processCompletedEvaluation_: with the flag on, nothing is added to the doc', () => {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('03_QueueBridge.js')], ['processCompletedEvaluation_']);
  setFlag(sandbox, '8175');
  const doc = sandbox.DocumentApp.create('Student doc');
  doc.getBody().setText('Assignment\n── YOUR RESPONSE BEGINS HERE ──\nMy plan.\n[CONFIG_ID: CAS-8175-L06]');
  const before = doc.getBody().getText();
  exported.processCompletedEvaluation_(doc.getId(), 'CAS-8175-L06');
  assert.equal(sandbox.DocumentApp.openById(doc.getId()).getBody().getText(), before);
});

test('resolveStudentStatus_: an evaluated assignment points to Comments only when feedback is a comment', () => {
  const { exported } = loadGasFiles(
    [S('00_SharedConfig.js'), S('13_StudentDashboard.js')], ['resolveStudentStatus_']);
  assert.equal(exported.resolveStudentStatus_('COMPLETE', undefined, true),
    'Feedback is ready: open your document and click Comments');
  assert.equal(exported.resolveStudentStatus_('COMPLETE', undefined, false),
    'Feedback is ready: check your document');
});

// The Teacher Dashboard's ⚙ Settings (07, 2026-10-27; was 💬 Feedback)
// writes one shared row per setting.
function loadTeacher(viewer) {
  const loaded = loadGasFiles([S('00_SharedConfig.js'), S('07_TeacherDashboard.js'), S('29_StudentContextAggregator.js'),
    S('36_WeeklyParentReport.js')],
    ['getSettings', 'setSettingForCourse', 'setMarkingPeriodEnds', 'pivotFlagFor_', 'feedbackAsCommentFor_'],
    { Session: { getActiveUser: () => ({ getEmail: () => viewer }), getScriptTimeZone: () => 'America/New_York' } });
  const { sandbox } = loaded;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(23).fill('header'));
  // Real Ledger rows: workspace IDs, the course in the class name (52
  // writes the Canvas course name), one row naming no course.
  [['VDOE-AAAAAA-2026', 'Sports and Entertainment Marketing'], ['VDOE-BBBBBB-2026', 'Entrepreneurship 8177'],
    ['VDOE-CCCCCC-2026', 'Sports and Entertainment Marketing'], ['VDOE-DDDDDD-2026', '']]
    .forEach(([id, name]) => ledger.appendRow(ledgerRow(id, name)));
  const config = (key) => {
    const tab = ss.getSheetByName('_CONFIG');
    return tab ? tab.getDataRange().getValues().filter((r) => r[0] === (key || 'FEEDBACK_AS_COMMENT')).map((r) => r[1]) : [];
  };
  return Object.assign({ ss, config }, loaded);
}
const setting = (res, key) => res.settings.find((s) => s.key === key);

test('⚙ Settings: each feature per course, written as one _CONFIG row, "all" when every course is on', () => {
  const { exported, config } = loadTeacher('Teacher@ccpsnet.net');
  let res = exported.getSettings();
  assert.deepEqual(res.courses, ['8175', '8177']);
  assert.deepEqual(res.settings.map((s) => s.key), ['FEEDBACK_AS_COMMENT', 'WARMUP_TEXT_BOX', 'ROLLOUT_AUTO_APPLY',
    'REFLECTION_ON_SUBMIT', 'PIVOT_ARCHETYPE_LOCK', 'PARENT_REPORT_PREP']);
  assert.deepEqual(setting(res, 'FEEDBACK_AS_COMMENT').courses.map((c) => [c.code, c.on]), [['8175', false], ['8177', false]]);
  assert.equal(setting(res, 'FEEDBACK_AS_COMMENT').value, 'off', 'the live value is sent for the panel');

  res = exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '8175', true);
  assert.deepEqual(config(), ['8175']);
  assert.deepEqual(setting(res, 'FEEDBACK_AS_COMMENT').courses.map((c) => c.on), [true, false], 'read back at once here');
  exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '8177', true);
  assert.deepEqual(config(), ['all'], 'still one row');
  exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '8175', false);
  assert.deepEqual(config(), ['8177']);
  exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '8177', false);
  assert.deepEqual(config(), ['off']);

  exported.setSettingForCourse('ROLLOUT_AUTO_APPLY', '8177', true);
  assert.deepEqual(config('ROLLOUT_AUTO_APPLY'), ['8177']);
  assert.equal(exported.pivotFlagFor_('ROLLOUT_AUTO_APPLY', '8177'), true);
  assert.equal(exported.pivotFlagFor_('ROLLOUT_AUTO_APPLY', '8175'), false);
});

test('⚙ Settings: a listed course with no assignments yet is kept, and a list turns on each course in it', () => {
  const { exported, config, sandbox, ss } = loadTeacher('teacher@ccpsnet.net');
  const tab = ss.insertSheet('_CONFIG');
  tab.appendRow(['Key', 'Value']);
  tab.appendRow(['REFLECTION_ON_SUBMIT', '8179']);
  exported.setSettingForCourse('REFLECTION_ON_SUBMIT', '8175', true);
  assert.deepEqual(config('REFLECTION_ON_SUBMIT'), ['8175,8179']);
  assert.equal(exported.pivotFlagFor_('REFLECTION_ON_SUBMIT', '8175'), true);
  assert.equal(exported.pivotFlagFor_('REFLECTION_ON_SUBMIT', '8179'), true);
  assert.equal(exported.pivotFlagFor_('REFLECTION_ON_SUBMIT', '8177'), false);
  assert.equal(exported.pivotFlagFor_('REFLECTION_ON_SUBMIT', null), false, 'a course-wide action needs "all"');
  exported.setSettingForCourse('REFLECTION_ON_SUBMIT', '8177', true);
  assert.deepEqual(config('REFLECTION_ON_SUBMIT'), ['8175,8177,8179'], 'not "all": 8179 is listed but not known');
  sandbox.PropertiesService.getScriptProperties().setProperty('FEEDBACK_AS_COMMENT', '8175,8177');
  assert.equal(exported.feedbackAsCommentFor_('CAS-8177-L01', ''), true, 'feedback placement reads a list too');
});

test('⚙ Settings: Parent reports ready on Fridays adds the Friday 5 a.m. job here when on for any course, and removes it when off for all', () => {
  const { exported, config, sandbox } = loadTeacher('teacher@ccpsnet.net');
  const jobs = () => sandbox.ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'runWeeklyParentReportPrep');
  exported.setSettingForCourse('PARENT_REPORT_PREP', '8175', true);
  assert.deepEqual(config('PARENT_REPORT_PREP'), ['8175']);
  assert.equal(jobs().length, 1);
  assert.deepEqual(jobs()[0].__calls.map((c) => c.method), ['timeBased', 'onWeekDay', 'atHour']);
  exported.setSettingForCourse('PARENT_REPORT_PREP', '8177', true);
  assert.equal(jobs().length, 1, 'never a second job');
  exported.setSettingForCourse('PARENT_REPORT_PREP', '8175', false);
  assert.equal(jobs().length, 1, 'still on for 8177');
  exported.setSettingForCourse('PARENT_REPORT_PREP', '8177', false);
  assert.deepEqual(config('PARENT_REPORT_PREP'), ['off']);
  assert.equal(jobs().length, 0);
});

test('⚙ Settings: each change is a SettingsLog row, and an unchanged value writes none', () => {
  const { exported, ss } = loadTeacher('teacher@ccpsnet.net');
  exported.setSettingForCourse('WARMUP_TEXT_BOX', '8175', true);
  exported.setSettingForCourse('WARMUP_TEXT_BOX', '8175', true);
  const res = exported.setSettingForCourse('WARMUP_TEXT_BOX', '8175', false);
  const rows = ss.getSheetByName('SettingsLog').getDataRange().getValues();
  assert.deepEqual(rows[0], ['Timestamp', 'ChangedBy', 'Setting', 'From', 'To']);
  assert.deepEqual(rows.slice(1).map((r) => r.slice(1)), [
    ['teacher@ccpsnet.net', 'WARMUP_TEXT_BOX', 'off', '8175'],
    ['teacher@ccpsnet.net', 'WARMUP_TEXT_BOX', '8175', 'off'],
  ]);
  assert.deepEqual(res.log.map((l) => [l.key, l.from, l.to]), [['WARMUP_TEXT_BOX', '8175', 'off'], ['WARMUP_TEXT_BOX', 'off', '8175']],
    'newest first for the panel');
});

test('⚙ Settings: the marking period dates, the district calendar until changed, a broken date refused', () => {
  const { exported, config } = loadTeacher('teacher@ccpsnet.net');
  let mp = exported.getSettings().markingPeriods;
  assert.equal(mp.isDefault, true);
  assert.deepEqual(mp.ends.map((e) => e.term), ['2627_MP1', '2627_MP2', '2627_MP3', '2627_MP4']);
  const ends = mp.ends.map((e) => ({ term: e.term, end: e.end }));
  ends[0].end = '2026-11-02';
  const res = exported.setMarkingPeriodEnds(ends);
  assert.equal(res.success, true);
  assert.equal(res.markingPeriods.isDefault, false);
  assert.match(config('MARKING_PERIOD_ENDS')[0], /^2627_MP1=2026-11-02,2627_MP2=2027-01-22,/);
  ends[1].end = '2027-1-2';
  assert.match(exported.setMarkingPeriodEnds(ends).error, /whole date/);
  ends[1].end = '2026-11-02';
  assert.match(exported.setMarkingPeriodEnds(ends).error, /same day/);
});

test('⚙ Settings: only the authorized teacher, and only a known setting and course', () => {
  const other = loadTeacher('student@ccpsnet.net');
  assert.equal(other.exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '8175', true).success, false);
  assert.equal(other.exported.getSettings().success, false);
  assert.equal(other.exported.setMarkingPeriodEnds([]).success, false);
  assert.deepEqual(other.config(), []);
  const teacher = loadTeacher('teacher@ccpsnet.net');
  assert.match(teacher.exported.setSettingForCourse('FEEDBACK_AS_COMMENT', '9999', true).error, /Unknown course/);
  assert.match(teacher.exported.setSettingForCourse('M2_ENABLED', '8175', true).error, /Unknown setting/);
});

test('⚙ Settings: says when a Script Property overrides the tab here', () => {
  const { exported, sandbox } = loadTeacher('teacher@ccpsnet.net');
  sandbox.PropertiesService.getScriptProperties().setProperty('FEEDBACK_AS_COMMENT', 'all');
  assert.equal(setting(exported.getSettings(), 'FEEDBACK_AS_COMMENT').overriddenHere, true);
  assert.equal(setting(exported.getSettings(), 'WARMUP_TEXT_BOX').overriddenHere, false);
});

// UX audit fix-first 3 (2026-10-22): the doc no longer ends on the 1pt white
// system block, so Ctrl+End or a click below the text lands on a visible line.
test('stampDocument_: the doc ends on a visible note, after the system block, with room to write', () => {
  const { text } = stamp('all', 'CAS-8175-L06');
  const lines = text.split('\n');
  assert.match(lines[lines.length - 1], /Nothing below this is checked/);
  assert.ok(text.indexOf('[SYS_DASHBOARD_URL:') < text.lastIndexOf('Nothing below this'));
  const marker = lines.indexOf('── YOUR RESPONSE BEGINS HERE ──');
  const cfg = lines.findIndex((l) => l.startsWith('[CONFIG_ID:'));
  assert.ok(cfg - marker - 1 >= 6, 'at least six empty writing lines');
});

// 2026-10-24, the operator's layout: the code moves to the page footer, and
// the "[CONFIG_ID:" end marker every reader (and Studio's Flow 2) stops at
// stays in the body, hidden in the white 1pt system line.
test('stampDocument_: the code is in the footer; the end marker is hidden with the system IDs', () => {
  const { sandbox, id, footer, text } = stamp('all', 'VDOE-ABC123-2026');
  const body = sandbox.DocumentApp.openById(id).getBody();
  const paras = Array.from({ length: body.getNumChildren() }, (_, i) => body.getChild(i));
  const hidden = paras.find((p) => p.getType() !== 'TABLE' && p.getText().startsWith('[CONFIG_ID: VDOE-ABC123-2026]'));
  assert.ok(hidden, 'one line holds the end marker');
  assert.equal(hidden.getText(), '[CONFIG_ID: VDOE-ABC123-2026][SYS_LEDGER_SS_ID:ledger-id][SYS_ADMIN_SS_ID:admin-id]' +
    '[SYS_DASHBOARD_URL:https://example.test/exec]');
  assert.equal(hidden.fontSize, 1);
  assert.equal(hidden.color, '#ffffff');
  assert.ok(!text.includes('Do not delete this line'), 'no visible code line');
  assert.equal(footer.getText().trim(), 'Assignment code: VDOE-ABC123-2026');
  const { exported } = loadGasFiles([S('00_SharedConfig.js'), S('63_DocHeader.js'), S('13_StudentDashboard.js')],
    ['dashExtractResponse_']);
  const written = text.replace('── YOUR RESPONSE BEGINS HERE ──\n', '── YOUR RESPONSE BEGINS HERE ──\nMy answer here.\n');
  assert.equal(exported.dashExtractResponse_(written).trim(), 'My answer here.', 'the response still ends at the hidden marker');
});

test('stampDocument_: the assignment table: the task with headings and bullets, then the objectives as a checklist', () => {
  const prompt = 'Title: Assignment: Plan\n\nDescription:\n\nEmployers want *soft* skills.\n\nThe Task:\n\n- Watch the videos.\n- Write a plan.\n\n' +
    'What your work needs to show:\n\n- I can plan to grow professionally (required)\n- I can write clearly\n\n' +
    'You can also show:\n\n- I can show a strong work ethic\n\nSubmission:\n\nSubmit your plan as a Text Entry.';
  const { sandbox, id } = stamp('all', 'CAS-8175-L06', prompt);
  const body = sandbox.DocumentApp.openById(id).getBody();
  const table = Array.from({ length: body.getNumChildren() }, (_, i) => body.getChild(i)).find((p) => p.getType() === 'TABLE');
  assert.equal(table.getNumRows(), 4);
  assert.equal(table.getCell(0, 0).getText(), 'The assignment');
  assert.equal(table.getCell(0, 0).getBackgroundColor(), '#e8eaed');
  assert.equal(table.getCell(2, 0).getText(), 'What your work needs to show');
  assert.equal(table.getCell(2, 0).getBackgroundColor(), '#d2e3fc');
  const kids = (c) => Array.from({ length: c.getNumChildren() }, (_, i) => c.getChild(i));
  const task = kids(table.getCell(1, 0));
  assert.deepEqual(task.map((p) => [p.getType(), p.getText()]), [
    ['PARAGRAPH', 'Description'], ['PARAGRAPH', 'Employers want soft skills.'], ['PARAGRAPH', 'The Task'],
    ['LIST_ITEM', 'Watch the videos.'], ['LIST_ITEM', 'Write a plan.']]);
  assert.deepEqual(kids(table.getCell(3, 0)).map((p) => p.getText()), [
    '☐ I can plan to grow professionally (required)', '☐ I can write clearly', 'You can also show',
    '☐ I can show a strong work ethic']);
  assert.ok(!table.getText().includes('Submission'), 'the Canvas submission line stays out');
  assert.ok(!table.getText().includes('Title:'), 'the Canvas title line stays out');
});
