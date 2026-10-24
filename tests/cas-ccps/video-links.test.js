'use strict';
// A lesson's video links (2026-10-24, curriculum/lessons/VIDEO_LINKS.json):
// a new student doc makes the task's address a link (02), and
// previewVideoLinkRefresh / applyVideoLinkRefresh (53) add the link to docs
// already made, under the task's "Watch" line, never in the student's
// writing, and only once.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const URL = 'https://example.org/watch?v=soft-skills';
const TASK = 'The Task:\n\n- Watch: Watch the provided videos regarding skills in the modern workplace.\n' +
  '- Plan: Write a 100-word plan.\n\nWhat your work needs to show:\n\n- I can make a plan';

// Every paragraph of a doc, inside tables too.
function paragraphs(container) {
  const out = [];
  for (let i = 0; i < container.getNumChildren(); i++) {
    const c = container.getChild(i);
    if (c.getType() === 'TABLE') {
      for (let r = 0; r < c.getNumRows(); r++) {
        for (let k = 0; k < c.getRow(r).getNumCells(); k++) out.push(...paragraphs(c.getRow(r).getCell(k)));
      }
    } else out.push(c);
  }
  return out;
}

test('a new doc makes an address in the task a link (the URL only, not its ")")', () => {
  const { exported, sandbox } = loadGasFiles(
    [S('00_SharedConfig.js'), S('63_DocHeader.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')], ['stampDocument_']);
  const doc = sandbox.DocumentApp.create('L06 — student');
  exported.stampDocument_(doc.getId(), 'CAS-8175-L06', 'A Student', 'B2', 'Sports Marketing', 'Teacher', '3',
    'L06 SKILL DEVELOPMENT PLAN', TASK.replace('modern workplace.\n', 'modern workplace.\n- Video: Soft skills (' + URL + ')\n'),
    'ledger-id', 'admin-id', 'https://example.test/exec');
  const p = paragraphs(sandbox.DocumentApp.openById(doc.getId()).getBody()).find((x) => x.getText().indexOf('Video: Soft skills') !== -1);
  assert.ok(p, 'the video line is in the doc');
  assert.deepEqual(p.links, [{ text: URL, url: URL }]);
});

// videos: what the generator would put on LESSON_ASSIGNMENTS["8175-L06"]. The
// harness hands tests a copy of a constant, so a small script loaded after
// 55b sets it inside the sandbox instead.
function loadRefresh(videos) {
  const files = ['00_SharedConfig.js', '63_DocHeader.js', '02_Form1_IntakeAndWorkspaceGenerator.js', '53b_UnitAssignmentData.js',
    '53_AssignmentSeeder.js', '54_StudentAssignments.js', '55_LessonSchedule.js', '55b_LessonAssignmentData.js'].map(S);
  if (videos) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-links-'));
    const f = path.join(dir, 'set-videos.js');
    fs.writeFileSync(f, 'LESSON_ASSIGNMENTS["8175-L06"].videos = ' + JSON.stringify(videos) + ';\n');
    files.push(f);
  }
  const loaded = loadGasFiles(files, ['previewVideoLinkRefresh', 'applyVideoLinkRefresh', 'stampDocument_']);
  const { sandbox, exported } = loaded;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  sandbox.PropertiesService.getScriptProperties().setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  sandbox.PropertiesService.getScriptProperties().setProperty('ADMIN_SS_ID', ss.getId());
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(19).fill('header'));
  const sa = ss.insertSheet('StudentAssignments');
  sa.appendRow(['student_config_id', 'google_id', 'assignment_config_id', 'recorded_at']);
  const docs = [];
  const enroll = (studentConfig, lessonConfig, response) => {
    const doc = sandbox.DocumentApp.create('doc ' + studentConfig);
    exported.stampDocument_(doc.getId(), studentConfig, 'A Student', 'B2', 'Sports Marketing', 'Teacher', '3',
      'L06', TASK, 'ledger-id', 'admin-id', 'https://example.test/exec');
    if (response) sandbox.DocumentApp.openById(doc.getId()).getBody().appendParagraph(response);
    const row = new Array(19).fill('');
    row[2] = studentConfig; row[3] = doc.getId(); row[12] = 'ACTIVE';
    ledger.appendRow(row);
    sa.appendRow([studentConfig, 'student@ccpsnet.net', lessonConfig, new Date()]);
    docs.push(doc.getId());
    return doc.getId();
  };
  return { exported, sandbox, enroll, docs };
}

test('docs already made: nothing to do until a lesson has a link', () => {
  const { exported } = loadRefresh();
  assert.match(exported.previewVideoLinkRefresh().message, /No lesson has a video link yet/);
});

test('docs already made: the preview counts, apply adds the link under "Watch" once, never in the student\'s writing', () => {
  const { exported, sandbox, enroll } = loadRefresh([{ title: 'Soft skills', url: URL }]);
  const id = enroll('VDOE-AAA111-2026', 'CAS-8175-L06', 'Watch me: my own plan is to practice patience.');
  enroll('VDOE-BBB222-2026', 'CAS-8175-L07'); // another lesson: untouched

  const before = sandbox.DocumentApp.openById(id).getBody().getText();
  assert.deepEqual(JSON.parse(JSON.stringify(exported.previewVideoLinkRefresh().lessons)),
    { '8175-L06': { added: 1, alreadyHas: 0, noWatchLine: 0, unreadable: 0 } });
  assert.equal(sandbox.DocumentApp.openById(id).getBody().getText(), before, 'the preview changes nothing');

  exported.applyVideoLinkRefresh();
  const ps = paragraphs(sandbox.DocumentApp.openById(id).getBody());
  const watch = ps.findIndex((p) => /^Watch: Watch the provided videos/.test(p.getText()));
  assert.equal(ps[watch + 1].getText(), 'Video: Soft skills (' + URL + ')');
  assert.deepEqual(ps[watch + 1].links, [{ text: URL, url: URL }]);
  assert.equal(ps.filter((p) => p.getText().indexOf(URL) !== -1).length, 1, 'only under the task, not the student\'s "Watch me"');

  assert.deepEqual(JSON.parse(JSON.stringify(exported.applyVideoLinkRefresh().lessons)),
    { '8175-L06': { added: 0, alreadyHas: 1, noWatchLine: 0, unreadable: 0 } }, 'running it again changes nothing');
});
