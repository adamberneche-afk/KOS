'use strict';
// tools/cas-ccps/import-lesson-drafts.js, the mechanical half of a lesson
// draft's import (meta/LESSON_AUTHORING_PLAN_2026-10.md, phase 1). Each test
// runs on a copy of cas-ccps/ and tools/cas-ccps/ in a temp folder, so the
// repo's own lessons, 55b and cartridges are never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');
const HEADERS = ['draft_id', 'kind', 'course', 'lesson_key', 'status', 'submitted_by', 'created_at', 'updated_at',
  'fields_json', 'original_json', 'reason', 'missing', 'proposal_json', 'proposal_note', 'pr_url', 'review_note'];

const made = [];
test.after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function copy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ld-import-'));
  made.push(dir);
  fs.cpSync(path.join(REPO, 'cas-ccps'), path.join(dir, 'cas-ccps'), { recursive: true });
  fs.cpSync(path.join(REPO, 'tools', 'cas-ccps'), path.join(dir, 'tools', 'cas-ccps'), { recursive: true });
  return dir;
}

// The lesson's fields as 65 reads them, from the generated data.
function current(dir, key) {
  const vm = require('vm');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'cas-ccps/scripts/55b_LessonAssignmentData.js'), 'utf8') +
    ';this.LA=LESSON_ASSIGNMENTS;', ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'cas-ccps/scripts/65_LessonDrafts.js'), 'utf8') +
    ';this.lesson=_ldLesson_;', ctx);
  return JSON.parse(JSON.stringify(ctx.lesson(key).current));
}

function draftsFile(dir, drafts) {
  const rows = [HEADERS].concat(drafts.map((d) => HEADERS.map((h) => {
    if (h === 'fields_json') return JSON.stringify(d.fields);
    if (h === 'original_json') return JSON.stringify(d.original);
    return d[h] !== undefined ? d[h] : '';
  })));
  const file = path.join(dir, 'drafts.json');
  fs.writeFileSync(file, JSON.stringify(rows));
  return file;
}

function run(dir, args) {
  const r = spawnSync(process.execPath, [path.join(dir, 'tools/cas-ccps/import-lesson-drafts.js'), ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout ? JSON.parse(r.stdout || 'null') : null, err: r.stderr };
}

const draft = (over) => Object.assign({ kind: 'EDIT', status: 'SUBMITTED', submitted_by: 'teacher@example.com' }, over);

test('check: every SUBMITTED draft re-checked with 65\'s rules; others left alone', () => {
  const dir = copy();
  const cur = current(dir, '8175-L04');
  const file = draftsFile(dir, [
    draft({ draft_id: 'LD-1', course: '8175', lesson_key: '8175-L04', reason: '', fields: cur, original: cur }),
    draft({ draft_id: 'LD-2', course: '8175', lesson_key: '8175-L04', reason: 'Anchor',
      fields: Object.assign({}, cur, { warmupAnchor: 'New anchor?' }), original: cur }),
    draft({ draft_id: 'LD-3', status: 'DRAFT', course: '8175', lesson_key: '8175-L04', reason: '', fields: {}, original: cur }),
  ]);
  const r = run(dir, ['check', file]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.map((x) => x.draftId), ['LD-1', 'LD-2']);
  assert.ok(r.out[0].issues.some((x) => /Say why/.test(x)));
  assert.ok(r.out[0].issues.includes('Nothing is changed from the current lesson.'));
  assert.deepEqual(r.out[1].issues, []);
});

test('apply (8175): the warm-up, a new competency line and the tiers are written, rebuilt and matched; a re-run changes nothing', () => {
  const dir = copy();
  const cur = current(dir, '8175-L04');
  const fields = Object.assign({}, cur, {
    warmupAnchor: 'Which athlete rebuilt their brand after a mistake, and how did they do it?',
    competencyIds: cur.competencyIds.concat(['8175-106']),
    secondary: ['8175-105'], tertiary: ['8175-57', '8175-86', '8175-2', '8175-106'],
  });
  const file = draftsFile(dir, [draft({ draft_id: 'LD-9', course: '8175', lesson_key: '8175-L04',
    reason: 'Sharper anchor and the SWOT task', fields, original: cur })]);
  const r = run(dir, ['apply', file, 'LD-9']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.hand, []);
  assert.deepEqual(r.out.fields, {
    warmupAnchor: 'matches the draft', competencyIds: 'matches the draft',
    secondary: 'matches the draft', tertiary: 'matches the draft',
  });
  assert.equal(r.out.proposal.fields.warmupAnchor, fields.warmupAnchor);

  const md = fs.readFileSync(path.join(dir, 'cas-ccps/curriculum/lessons/8175/L04.md'), 'utf8');
  assert.match(md, /\*\*Bell Ringer \(The Do Now\):\*\*\n\n"Which athlete rebuilt their brand after a mistake, and how did they do it\?"\n\n\*\*The Hook/);
  assert.match(md, /\n {2}- \*\*106:\*\* /);
  const tiers = JSON.parse(fs.readFileSync(path.join(dir, 'cas-ccps/curriculum/lessons/COMPETENCY_TIERS.json'), 'utf8'));
  assert.deepEqual(tiers['8175-L04'].secondary, ['8175-105']);
  assert.match(tiers['8175-L04'].why, /Edited from the dashboard \(LD-9\): Sharper anchor and the SWOT task\.$/);
  // The builders' own checks pass on the result.
  execFileSync(process.execPath, [path.join(dir, 'tools/cas-ccps/build-lesson-assignments.js'), '--check'], { cwd: dir });

  const snapshot = () => ['cas-ccps/curriculum/lessons/8175/L04.md', 'cas-ccps/curriculum/lessons/COMPETENCY_TIERS.json',
    'cas-ccps/scripts/55b_LessonAssignmentData.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const before = snapshot();
  const again = run(dir, ['apply', file, 'LD-9']);
  assert.equal(again.code, 0, again.err);
  assert.deepEqual(snapshot(), before, 'idempotent');
  assert.equal(run(dir, ['verify', file, 'LD-9']).out.fields.warmupAnchor, 'matches the draft');
});

test('apply (8177): vocabulary and objective written; the student task is left for the session and named', () => {
  const dir = copy();
  const cur = current(dir, '8177-the-front-lines');
  const fields = Object.assign({}, cur, {
    vocabulary: 'selling process, open-ended question, feature, benefit, objection, service recovery, upsell',
    objective: '1.  Outline the six steps of the selling process.',
    promptText: cur.promptText + '\n\nPart 4: Name one upsell you could offer.',
  });
  const file = draftsFile(dir, [draft({ draft_id: 'LD-7', course: '8177', lesson_key: '8177-the-front-lines',
    reason: 'Upsell practice', fields, original: cur })]);
  const r = run(dir, ['apply', file, 'LD-7']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.fields.vocabulary, 'matches the draft');
  assert.equal(r.out.fields.objective, 'matches the draft');
  assert.equal(r.out.fields.promptText, 'not built yet');
  assert.deepEqual(r.out.hand.map((h) => h.field), ['promptText']);
  assert.match(r.out.hand[0].why, /prompts\/the-front-lines\.md/);
  const p = fs.readFileSync(path.join(dir, 'cas-ccps/curriculum/lessons/8177/prompts/the-front-lines.md'), 'utf8');
  assert.match(p, /## Vocabulary\n\nselling process, .*upsell\n/);
});

test('8175 vocabulary and objective have no home of their own, so they are named for the session', () => {
  const dir = copy();
  const cur = current(dir, '8175-L04');
  const fields = Object.assign({}, cur, { vocabulary: 'brand, reputation', objective: 'Analyze a public figure\'s brand.' });
  const file = draftsFile(dir, [draft({ draft_id: 'LD-5', course: '8175', lesson_key: '8175-L04', reason: 'Terms', fields, original: cur })]);
  const r = run(dir, ['apply', file, 'LD-5']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.out.hand.map((h) => h.field).sort(), ['objective', 'vocabulary']);
  assert.equal(r.out.fields.vocabulary, 'not built yet');
});

test('an incomplete draft, an accepted one or a missing one is not imported', () => {
  const dir = copy();
  const cur = current(dir, '8175-L04');
  const file = draftsFile(dir, [
    draft({ draft_id: 'LD-1', course: '8175', lesson_key: '8175-L04', reason: '', fields: cur, original: cur }),
    draft({ draft_id: 'LD-2', status: 'ACCEPTED', course: '8175', lesson_key: '8175-L04', reason: 'x',
      fields: Object.assign({}, cur, { warmupAnchor: 'x?' }), original: cur }),
  ]);
  const before = fs.readFileSync(path.join(dir, 'cas-ccps/curriculum/lessons/8175/L04.md'), 'utf8');
  const r = run(dir, ['apply', file, 'LD-1']);
  assert.equal(r.out.imported, false);
  assert.ok(r.out.issues.length > 0);
  assert.match(run(dir, ['apply', file, 'LD-2']).err, /ACCEPTED; only a SUBMITTED draft/);
  assert.match(run(dir, ['apply', file, 'LD-404']).err, /No draft LD-404/);
  assert.equal(fs.readFileSync(path.join(dir, 'cas-ccps/curriculum/lessons/8175/L04.md'), 'utf8'), before);
});
