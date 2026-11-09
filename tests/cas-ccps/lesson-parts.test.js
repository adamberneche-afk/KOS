'use strict';
// A lesson in parts (meta/STUDENT_WORK_PLAN_2026-10.md, Phase 3; Appendix B
// approved 2026-10-27): PARTS.json → 55b's LESSON_PARTS, one assignment per
// part with its own tiers, criteria and task.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');
const gen = require('../../tools/cas-ccps/build-lesson-assignments.js');

const S = (f) => path.join(__dirname, '..', '..', 'cas-ccps', 'scripts', f);
const KEY = '8177-market-research-survey-design';
const data = () => loadGasFiles([S('55b_LessonAssignmentData.js')], ['LESSON_ASSIGNMENTS', 'LESSON_PARTS']).exported;

test('the market research lesson is five parts, each its own assignment, in order', () => {
  const { LESSON_ASSIGNMENTS, LESSON_PARTS } = data();
  const parts = LESSON_PARTS[KEY];
  assert.deepEqual(parts.map((p) => p.key), [1, 2, 3, 4, 5].map((n) => KEY + '-P' + n));
  assert.deepEqual(LESSON_ASSIGNMENTS[KEY].partKeys, parts.map((p) => p.key));
  assert.deepEqual(parts.map((p) => p.partTitle), ['The Target Market', 'Build the Survey', 'Why These Questions Work',
    'Spot the Bias', 'Beyond the Survey']);
  parts.forEach((p, i) => {
    assert.equal(p.part, i + 1);
    assert.equal(p.partCount, 5);
    assert.equal(p.partOf, KEY);
    assert.ok(!LESSON_ASSIGNMENTS[p.key], 'a part is not a lesson');
  });
  assert.equal(parts[1].workFile, 'form');
  assert.equal(parts[1].workFileNow, 'form', 'a Google Form since 2026-11-09 (Phase 4a)');
  // Every lesson with parts lists them; the others have none (35 with parts since 2026-10-28).
  Object.keys(LESSON_ASSIGNMENTS).forEach((k) => assert.deepEqual(LESSON_ASSIGNMENTS[k].partKeys,
    LESSON_PARTS[k] ? LESSON_PARTS[k].map((p) => p.key) : undefined, k));
  assert.equal(Object.keys(LESSON_PARTS).length, 35);
  assert.ok(LESSON_PARTS['8175-L24'], 'an 8175 lesson splits too');
});

test('each part\'s tiers are Appendix B\'s, and every lesson competency is in some part', () => {
  const { LESSON_ASSIGNMENTS, LESSON_PARTS } = data();
  const parts = LESSON_PARTS[KEY];
  assert.deepEqual(parts.map((p) => p.milestoneCompetencyIds[0]), ['8177-81', '8177-83', '8177-83', '8177-2', '8177-79']);
  assert.deepEqual(parts.map((p) => p.milestoneCompetencyIds[1]), ['8177-2', '8177-18', '', '', '8177-2']);
  assert.deepEqual(parts[0].tertiaryCompetencyIds, ['8177-93']);
  const all = new Set(parts.flatMap((p) => p.competencyIds));
  LESSON_ASSIGNMENTS[KEY].competencyIds.forEach((id) => assert.ok(all.has(id), id));
  assert.match(parts[0].objectives['8177-81'], /^You pick one group \(students, parents or staff\)/, 'criteria in the student\'s words');
});

test('each part\'s task: the opening, its own paragraphs and vocabulary; Part 1 carries the background', () => {
  const { LESSON_PARTS } = data();
  const [p1, p2, p3] = LESSON_PARTS[KEY];
  assert.match(p1.promptText, /^Assignment: The Cavalier Shop Survey — Part 1 of 5: The Target Market\n\nYou are a market researcher/);
  assert.match(p1.promptText, /\nBackground:\n/);
  assert.match(p1.promptText, /\nKey Terms:\n/);
  assert.match(p1.promptText, /Use these terms accurately: market research, target market\./);
  assert.doesNotMatch(p1.promptText, /Part 2: Build the Survey/);
  assert.match(p2.promptText, /Part 1 has the background, the key terms and an example: look back at it\./);
  assert.doesNotMatch(p2.promptText, /\nBackground:\n/);
  assert.doesNotMatch(p2.promptText, /Paste your form's link into this document\./, 'removed when the part became a form (2026-11-09)');
  assert.match(p2.promptText, /Turn off email collection in the form's settings\./);
  assert.doesNotMatch(p2.promptText, /Part 3:/);
  assert.match(p3.promptText, /What your work needs to show:\n\n- For each of the three questions, you say whether it collects quantitative or qualitative data/);
  assert.match(p3.definitionOfDone, /^ASSIGNMENT: Venue Market Research & Survey Design — Part 3: Why These Questions Work/);
  assert.match(p3.definitionOfDone, /PRIMARY COMPETENCY \(Milestone 1; must be MET\)\n- 8177-83 Develop a market research project\./);
});

test('the builder refuses a part with no primary, a tier outside the lesson, or a competency no part covers', () => {
  const comps = [{ competency_id: 'X-1', competency_text: 'One.' }, { competency_id: 'X-2', competency_text: 'Two.' }];
  const a = { key: 'X', code: '8177', lessonId: 'X', unitName: 'X', courseName: 'C' };
  const md = '## Prompt\n\nAssignment: X\n\nPart 1: A.\n\nPart 2: B.\n';
  const part = (o) => Object.assign({ title: 'T', marker: 'Part 1:', primary: 'X-1', criteria: {} }, o);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ primary: '' })] }), /has no primary/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ primary: 'X-9' })] }), /X-9 is not one of the lesson's competencies/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({})] }), /no part covers X-2/);
  assert.throws(() => gen.buildParts(a, comps, md, { parts: [part({ secondary: ['X-2'] }), part({ marker: 'Part 9:' })] }), /no paragraph starts with "Part 9:"/);
  assert.equal(gen.buildParts(a, comps, md, { parts: [part({}), part({ marker: 'Part 2:', primary: 'X-2' })] }).length, 2);
});

// ── Phase 4a: a part's workType (doc by default, or form) ────────────────────
const fs = require('fs');
const LESSONS_DIR = path.join(__dirname, '..', '..', 'cas-ccps', 'curriculum', 'lessons');
const PARTS_PATH = path.join(LESSONS_DIR, 'PARTS.json');
const SURVEY_PROMPT = path.join(LESSONS_DIR, '8177', 'prompts', 'market-research-survey-design.md');

// The builder's output with PARTS.json (and, optionally, a prompt file) read
// as `edit` changes them; nothing on disk is touched.
function buildWithEdits(editParts, editPrompt) {
  const real = fs.readFileSync;
  fs.readFileSync = function (f, ...rest) {
    const at = path.resolve(String(f));
    if (at === PARTS_PATH) {
      const parts = JSON.parse(real.call(fs, f, 'utf8'));
      editParts(parts);
      return JSON.stringify(parts);
    }
    if (editPrompt && at === SURVEY_PROMPT) return editPrompt(real.call(fs, f, 'utf8'));
    return real.call(fs, f, ...rest);
  };
  try {
    return gen.dataFile(gen.build());
  } finally {
    fs.readFileSync = real;
  }
}
const LIVE_55B = () => fs.readFileSync(S('55b_LessonAssignmentData.js'), 'utf8');
const PASTE_LINE = / Paste your form's link into this document\./;

// Marked 2026-11-09: the survey part (8177 Market Research, Part 2) is the
// one form; every other part is still unset, so a doc.
const SURVEY_PART = KEY + '-P2';
test('workType: only the survey part is a form; every other part is a doc and 55b carries no template key for it', () => {
  const { LESSON_PARTS } = data();
  Object.values(LESSON_PARTS).flat().forEach((p) => {
    if (p.key === SURVEY_PART) {
      assert.equal(p.workFileNow, 'form');
      assert.equal(p.workTemplateKey, 'WORK_TEMPLATE_8177_MARKET_RESEARCH_SURVEY_DESIGN_P2');
      return;
    }
    assert.equal(p.workFileNow, 'doc', p.key);
    assert.equal(p.workTemplateKey, undefined, p.key);
  });
  const parts = JSON.parse(fs.readFileSync(PARTS_PATH, 'utf8'));
  Object.keys(parts).filter((k) => !k.startsWith('_')).forEach((k) =>
    parts[k].parts.forEach((p, i) => {
      if (k === KEY && i === 1) return;
      assert.equal(p.workType, undefined, k + ' ' + p.title + ' is marked; only the survey part is');
    }));
});

test('workType "doc" written out is the same as unset: the generated 55b is byte-identical', () => {
  const out = buildWithEdits((all) => Object.keys(all).filter((k) => !k.startsWith('_'))
    .forEach((k) => all[k].parts.forEach((p) => { if (p.workType === undefined) p.workType = 'doc'; })));
  assert.equal(out, LIVE_55B());
});

test('marking the survey part a form changes only that part: workFileNow "form" and its template key', () => {
  const out = buildWithEdits((all) => { all[KEY].parts[1].workType = 'form'; },
    (md) => md.replace(PASTE_LINE, ''));
  const vm = require('vm');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(out + '\nthis.P = LESSON_PARTS;', ctx);
  const parts = ctx.P[KEY];
  assert.equal(parts[1].workFileNow, 'form');
  assert.equal(parts[1].workTemplateKey, 'WORK_TEMPLATE_8177_MARKET_RESEARCH_SURVEY_DESIGN_P2');
  assert.doesNotMatch(parts[1].promptText, PASTE_LINE);
  [0, 2, 3, 4].forEach((i) => { assert.equal(parts[i].workFileNow, 'doc'); assert.equal(parts[i].workTemplateKey, undefined); });
  Object.keys(ctx.P).filter((k) => k !== KEY).forEach((k) => ctx.P[k].forEach((p) => assert.equal(p.workFileNow, 'doc', p.key)));
});

test('the builder refuses a form part whose task still says to paste a link, a workType not doc, form or slides, or one unlike its workFile', () => {
  // The live prompt lost the paste line when the part was marked; put it back.
  assert.throws(() => buildWithEdits(() => {},
    (md) => md.replace("Turn off email collection in the form's settings.",
      "Turn off email collection in the form's settings. Paste your form's link into this document.")),
    /part 2: a form part's task still says to paste a link into this document/);
  assert.throws(() => buildWithEdits((all) => { all[KEY].parts[1].workType = 'sheet'; delete all[KEY].parts[1].formChecks; }),
    /workType "sheet" is not one of doc, form, slides/);
  assert.throws(() => buildWithEdits((all) => { all[KEY].parts[1].workType = 'slides'; delete all[KEY].parts[1].formChecks; }),
    /part 2: workType "slides" but its workFile is "form"/);
  assert.throws(() => buildWithEdits((all) => { all[KEY].parts[0].workType = 'form'; }),
    /part 1: workType "form" but its workFile is "doc"/);
  assert.equal(gen.workTemplateKey('8175-L24-P3'), 'WORK_TEMPLATE_8175_L24_P3');
});
