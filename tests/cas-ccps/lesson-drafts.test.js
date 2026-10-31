'use strict';
// Lesson editing from the Teacher Dashboard, phase 1 (65_LessonDrafts.js,
// meta/LESSON_AUTHORING_PLAN_2026-10.md): the editor starts from the
// lesson's generated data (55b) with its tiers read back, cross-references
// the course's VDOE tasks (the CompetencyRubrics tab), saves drafts to the
// LessonDrafts tab, submits only a complete draft whose tiers pass the
// builder's rules, and lets only the submitter accept or return a proposal.
//
// All files below are in cas-ccps:teacher-dashboard
// (tools/gas-lint/project-map.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const FILES = ['00_SharedConfig.js', '07_TeacherDashboard.js', '32_CompetencyRubricImporter.js',
  '55b_LessonAssignmentData.js', '65_LessonDrafts.js'].map(S);
const EXPOSE = ['getLessonEditor', 'getNewLessonEditor', 'listLessonDrafts', 'saveLessonDraft', 'submitLessonDraft',
  'reviewLessonProposal', 'withdrawLessonDraft', 'LD_HEADERS', 'LD', '_ldSafePrUrl_'];
const TEACHER = 'teacher@example.com'; // the sandbox's default Session user

// 8175-L04 lists 8175-2, -56, -86, -105, -57; primary 56, secondary 105 and 2,
// tertiary 57 and 86 (COMPETENCY_TIERS.json).
// 8175-33 (the CTSO task) is in no lesson: it is covered through DECA.
const RUBRIC_IDS = ['8175-2', '8175-33', '8175-56', '8175-57', '8175-86', '8175-105', '8175-106'];

function setUp(opts) {
  const o = opts || {};
  const env = loadGasFiles(FILES, EXPOSE);
  const ss = env.sandbox.SpreadsheetApp.create('Central Ledger');
  env.sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = env.sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', o.teacher || TEACHER);
  if (!o.noRubrics) {
    const cr = ss.insertSheet('CompetencyRubrics');
    cr.appendRow(['competency_id', 'course', 'task_number', 'duty_area', 'competency_text',
      'demonstration_standard', 'demonstration_indicators', 'skill_questions']);
    RUBRIC_IDS.forEach((id) => cr.appendRow([id, '8175', Number(id.split('-')[1]), 'Duty ' + id,
      'Task text ' + id, 'Standard ' + id, JSON.stringify(['indicator ' + id]), JSON.stringify(['question ' + id + '?'])]));
  }
  return Object.assign(env, { ss });
}

function editedFields(env, changes) {
  const cur = env.exported.getLessonEditor('8175-L04').lesson.current;
  return Object.assign({}, cur, changes);
}

const tab = (env) => env.ss.getSheetByName('LessonDrafts');
const rowOf = (env, id) => {
  const H = env.exported.LD_HEADERS;
  const r = tab(env).getDataRange().getValues().find((x) => x[0] === id);
  const o = {};
  H.forEach((h, i) => { o[h] = r[i]; });
  return o;
};

test('only the configured teacher can use the editor', () => {
  const env = setUp({ teacher: 'someone.else@example.com' });
  assert.deepEqual(env.exported.getLessonEditor('8175-L04'), { success: false, error: 'Not authorized.' });
  assert.equal(env.exported.saveLessonDraft({ lessonKey: '8175-L04', fields: {}, reason: 'x' }).success, false);
  assert.equal(env.ss.getSheetByName('LessonDrafts'), null);
});

test('the editor starts from the generated lesson, tiers read back, with the VDOE tasks and coverage', () => {
  const env = setUp();
  const ed = env.exported.getLessonEditor('8175-L04');
  assert.equal(ed.success, true);
  assert.equal(ed.lesson.course, '8175');
  const c = ed.lesson.current;
  assert.equal(c.primary, '8175-56');
  assert.deepEqual(c.secondary, ['8175-105', '8175-2']);
  assert.deepEqual([...c.tertiary].sort(), ['8175-57', '8175-86']);
  assert.match(c.promptText, /Personal Brand Analysis/);
  assert.ok(c.warmupAnchor.length > 20);
  assert.equal(ed.catalogAvailable, true);
  assert.deepEqual(ed.catalog.map((x) => x.id), RUBRIC_IDS);
  assert.deepEqual(ed.catalog[2].indicators, ['indicator 8175-56']);
  assert.deepEqual(ed.uncovered, ['8175-33'], 'the course tasks no lesson lists');
  assert.equal(ed.draft, null);
  assert.equal(env.exported.getLessonEditor('8175-L99').success, false);
});

test('saving keeps one open draft per lesson and reports what is still missing', () => {
  const env = setUp();
  const first = env.exported.saveLessonDraft({ lessonKey: '8175-L04', fields: editedFields(env, {}), reason: '' });
  assert.equal(first.success, true);
  assert.equal(first.draft.status, 'DRAFT');
  assert.ok(first.draft.issues.includes('Nothing is changed from the current lesson.'));
  assert.ok(first.draft.issues.some((x) => /Say why/.test(x)));
  assert.equal(first.draft.canSubmit, false);
  const again = env.exported.saveLessonDraft({ lessonKey: '8175-L04',
    fields: editedFields(env, { warmupAnchor: 'A sharper anchor question?' }), reason: 'Clearer warm-up' });
  assert.equal(again.draft.draftId, first.draft.draftId, 'the same draft is updated');
  assert.deepEqual(again.draft.issues, []);
  assert.equal(again.draft.canSubmit, true);
  assert.equal(tab(env).getLastRow(), 2);
  const row = rowOf(env, first.draft.draftId);
  assert.equal(row.kind, 'EDIT');
  assert.equal(row.submitted_by, TEACHER);
  assert.equal(JSON.parse(row.original_json).primary, '8175-56');
  assert.equal(env.exported.listLessonDrafts().drafts.length, 1);
  assert.equal(env.exported.getLessonEditor('8175-L04').draft.draftId, first.draft.draftId);
});

test('the tier rules the builder enforces stop a submit, each named', () => {
  const env = setUp();
  const bad = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'Tiers', fields: editedFields(env, {
    competencyIds: ['8175-2', '8175-56', '8175-86', '8175-105', '8175-57', '8177-3', '8175-999'],
    primary: '8175-106', secondary: ['8175-105', '8175-2', '8175-86'], tertiary: ['8175-57', '8175-2'],
  }) });
  const out = env.exported.submitLessonDraft(bad.draft.draftId);
  assert.equal(out.success, false);
  const all = out.issues.join('\n');
  assert.match(all, /8177-3 is not a 8175 task/);
  assert.match(all, /8175-999 is not in the VDOE task list/);
  assert.match(all, /primary competency 8175-106 isn't one the lesson lists/);
  assert.match(all, /Choose 1 or 2 secondary/);
  assert.match(all, /8175-2 has two tiers/);
  assert.match(all, /8175-999 has no tier/);
  assert.equal(rowOf(env, bad.draft.draftId).status, 'DRAFT');
  assert.match(rowOf(env, bad.draft.draftId).missing, /has no tier/);
});

test('a complete draft is submitted, then can\'t be edited until it is returned', () => {
  const env = setUp();
  const d = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'New secondary',
    fields: editedFields(env, { secondary: ['8175-105'], tertiary: ['8175-57', '8175-86', '8175-2'] }) }).draft;
  const sub = env.exported.submitLessonDraft(d.draftId);
  assert.equal(sub.success, true);
  assert.equal(sub.draft.status, 'SUBMITTED');
  assert.equal(env.exported.submitLessonDraft(d.draftId).success, false, 'not twice');
  const locked = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'x', fields: editedFields(env, {}) });
  assert.match(locked.error, /SUBMITTED; it can't change/);
  assert.match(env.exported.withdrawLessonDraft(d.draftId).error, /SUBMITTED draft can't be withdrawn/);
});

test('only the submitter reviews a proposal; returning needs a note; a returned draft is editable again', () => {
  const env = setUp();
  const d = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'Anchor',
    fields: editedFields(env, { warmupAnchor: 'Which public figure rebuilt their brand, and how?' }) }).draft;
  env.exported.submitLessonDraft(d.draftId);
  assert.match(env.exported.reviewLessonProposal(d.draftId, true).error, /no proposal/);
  // The import writes the proposal back.
  const H = env.exported.LD;
  const at = tab(env).getDataRange().getValues().findIndex((x) => x[0] === d.draftId) + 1;
  tab(env).getRange(at, H.STATUS + 1).setValue('PROPOSED');
  tab(env).getRange(at, H.PROPOSAL_JSON + 1).setValue(JSON.stringify({ fields: { warmupAnchor: 'Which public figure rebuilt their brand?' } }));
  tab(env).getRange(at, H.PR_URL + 1).setValue('https://github.com/example/pull/1');

  const view = env.exported.getLessonEditor('8175-L04').draft;
  assert.equal(view.canReview, true);
  assert.equal(view.prUrl, 'https://github.com/example/pull/1');
  assert.match(env.exported.reviewLessonProposal(d.draftId, false, '').error, /Say what to change/);
  const back = env.exported.reviewLessonProposal(d.draftId, false, 'Keep "and how"');
  assert.equal(back.draft.status, 'RETURNED');
  assert.equal(back.draft.canEdit, true);
  const edited = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'Anchor, again',
    fields: editedFields(env, { warmupAnchor: 'Which public figure rebuilt their brand, and how did they do it?' }) });
  assert.equal(edited.draft.status, 'DRAFT');
  assert.equal(edited.draft.draftId, d.draftId);

  // Another account can't review, even as the configured teacher.
  tab(env).getRange(at, H.STATUS + 1).setValue('PROPOSED');
  tab(env).getRange(at, H.SUBMITTED_BY + 1).setValue('co.teacher@example.com');
  assert.match(env.exported.reviewLessonProposal(d.draftId, true).error, /Only the account that submitted/);
  tab(env).getRange(at, H.SUBMITTED_BY + 1).setValue(TEACHER);
  assert.equal(env.exported.reviewLessonProposal(d.draftId, true).draft.status, 'ACCEPTED');
});

test('an email address in any field is refused; a draft is withdrawn, not deleted', () => {
  const env = setUp();
  const out = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'x',
    fields: editedFields(env, { objective: 'Ask student.name@school.org about it' }) });
  assert.equal(out.success, false);
  assert.match(out.error, /email address/);
  const d = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'x',
    fields: editedFields(env, { vocabulary: 'brand, reputation' }) }).draft;
  assert.equal(env.exported.withdrawLessonDraft(d.draftId).success, true);
  assert.equal(rowOf(env, d.draftId).status, 'WITHDRAWN');
  assert.equal(env.exported.listLessonDrafts().drafts.length, 0);
  assert.equal(env.exported.getLessonEditor('8175-L04').draft, null);
});

test('with no CompetencyRubrics tab the editor still works, and says the VDOE list is unavailable', () => {
  const env = setUp({ noRubrics: true });
  const ed = env.exported.getLessonEditor('8175-L04');
  assert.equal(ed.catalogAvailable, false);
  assert.deepEqual(ed.catalog, []);
  const d = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'x',
    fields: editedFields(env, { vocabulary: 'brand' }) }).draft;
  assert.deepEqual(d.issues, [], 'course prefix is still checked; the VDOE list is skipped');
});

// The builder writes a checklist from the tiers into the student task. The
// editor shows the task without it, so a tier edit isn't a task edit.
test('the student task is shown without the generated tier checklist', () => {
  const env = setUp();
  const c = env.exported.getLessonEditor('8175-L04').lesson.current;
  assert.doesNotMatch(c.promptText, /What your work needs to show|You can also show/);
  assert.match(c.promptText, /\n\nSubmission:\n\nSubmit your responses/);
  const d = env.exported.saveLessonDraft({ lessonKey: '8175-L04', reason: 'Tiers only',
    fields: editedFields(env, { secondary: ['8175-105'], tertiary: ['8175-57', '8175-86', '8175-2'] }) }).draft;
  assert.deepEqual(d.issues, []);
  assert.equal(d.fields.promptText, c.promptText);
});

// Phase 2: new lessons. A NEW draft starts empty, takes the next free 8175
// lesson number or an 8177 key from its title, and needs every field.
const NEW_FIELDS = {
  title: 'Sponsorship Pitch', objective: 'Build a sponsorship pitch for a local event.',
  activity: 'Pairs research a local business and draft a pitch.', promptText: 'Write a one-page sponsorship pitch.',
  warmupAnchor: 'What would make a business pay to put its name on a stadium?', vocabulary: 'sponsorship, activation',
  competencyIds: ['8175-56', '8175-105', '8175-2'], primary: '8175-56', secondary: ['8175-105'], tertiary: ['8175-2'],
};

test('a new 8175 lesson takes the next free number, and is submitted only when complete', () => {
  const env = setUp();
  const ed = env.exported.getNewLessonEditor('8175');
  assert.equal(ed.isNew, true);
  assert.equal(ed.lesson.current.title, '');
  assert.ok(ed.catalog.length > 0);
  assert.equal(env.exported.getNewLessonEditor('9999').success, false);

  const empty = env.exported.saveLessonDraft({ kind: 'NEW', course: '8175', fields: {} }).draft;
  assert.equal(empty.kind, 'NEW');
  assert.equal(empty.lessonKey, '8175-L37', 'L36 is the last 8175 lesson');
  const all = empty.issues.join('\n');
  ['Title', 'Objective', 'Activity', 'Warm-up anchor', 'Vocabulary'].forEach((f) => assert.match(all, new RegExp(f + ' is empty')));
  assert.match(all, /student task, or a brief/);
  assert.equal(env.exported.submitLessonDraft(empty.draftId).success, false);

  const full = env.exported.saveLessonDraft({ kind: 'NEW', course: '8175', draftId: empty.draftId, fields: NEW_FIELDS }).draft;
  assert.equal(full.draftId, empty.draftId);
  assert.equal(full.lessonKey, '8175-L37', 'the number is kept');
  assert.deepEqual(full.issues, []);
  // A second new lesson takes the next number.
  assert.equal(env.exported.saveLessonDraft({ kind: 'NEW', course: '8175', fields: {} }).draft.lessonKey, '8175-L38');
  assert.equal(env.exported.submitLessonDraft(full.draftId).draft.status, 'SUBMITTED');
  const listed = env.exported.listLessonDrafts().drafts.find((d) => d.draftId === full.draftId);
  assert.equal(listed.lesson, 'Sponsorship Pitch (new)');
  const reopened = env.exported.getLessonEditor(full.draftId);
  assert.equal(reopened.isNew, true);
  assert.equal(reopened.draft.status, 'SUBMITTED');
});

test('a new 8177 lesson is keyed by its title; a brief can stand in for the task; a taken key is named', () => {
  const env = setUp();
  const f = Object.assign({}, NEW_FIELDS, { title: 'The Front Lines', promptText: '', brief: 'Role-play a sale.',
    competencyIds: [], primary: '', secondary: [], tertiary: [] });
  const d = env.exported.saveLessonDraft({ kind: 'NEW', course: '8177', fields: f }).draft;
  assert.equal(d.lessonKey, '8177-the-front-lines');
  assert.ok(d.issues.some((x) => /already exists; give the new one another title/.test(x)));
  assert.ok(!d.issues.some((x) => /student task, or a brief/.test(x)), 'a brief stands in for the task');
  const renamed = env.exported.saveLessonDraft({ kind: 'NEW', course: '8177', draftId: d.draftId,
    fields: Object.assign({}, f, { title: 'Ticket Tiers & Pricing' }) }).draft;
  assert.equal(renamed.lessonKey, '8177-ticket-tiers-pricing');
  assert.ok(!renamed.issues.some((x) => /already exists/.test(x)));
});

test('a PR link is shown only when it is an https://github.com/ address (Docket IV)', () => {
  const { exported } = loadGasFiles(FILES, ['_ldSafePrUrl_']);
  assert.equal(exported._ldSafePrUrl_('https://github.com/o/r/pull/12'), 'https://github.com/o/r/pull/12');
  assert.equal(exported._ldSafePrUrl_('javascript:alert(1)'), '');
  assert.equal(exported._ldSafePrUrl_('http://github.com/o/r/pull/12'), '', 'not https');
  assert.equal(exported._ldSafePrUrl_('https://evil.example/pull/12'), '');
  assert.equal(exported._ldSafePrUrl_('https://github.com/o" onmouseover="x'), '');
  assert.equal(exported._ldSafePrUrl_(''), '');
});
