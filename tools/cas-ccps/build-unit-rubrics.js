#!/usr/bin/env node
'use strict';
/**
 * Writes one assignment rubric per pacing-guide unit and course into
 * cas-ccps/curriculum/unit-rubrics/, for the Rubric Upload Form (Studio
 * Flow 1 turns the pasted rubric into a TeacherMatrix draft, which the
 * teacher confirms; see 05_TeacherIntakePipeline.js and FLOW_1_SYSTEM_PROMPT
 * in 15_StudioFlowPrompts.js).
 *
 * Sources: curriculum/PacingGuide_CAS_Context.json (units, objectives,
 * competency IDs per course), data/CompetencyRubrics.json (demonstration
 * standards and indicators) and each unit's lesson card
 * (curriculum/lesson-cards/): the planned work product, the course's role,
 * what students do, the course's "goes deeper on" extension and the
 * VOCABULARY table. The assignment is the work the lessons planned, judged
 * against the unit's competencies; it used to be a generic "pick an
 * organization" prompt that ignored the cards (operator, 2026-10-06). The
 * pacing guide's key_vocabulary column also holds card table labels such as
 * "What students do", so it isn't used. A unit a course doesn't take
 * ("8175 only" / "8177 only", or no competency IDs for it) gets no file.
 *
 *   node tools/cas-ccps/build-unit-rubrics.js          write the files
 *   node tools/cas-ccps/build-unit-rubrics.js --check  exit 1 if any is out of date
 */

const fs = require('fs');
const path = require('path');
const { loadDecks, findCard, cardVocabulary, cardRow, cardExtension } = require('./lesson-cards.js');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'cas-ccps', 'curriculum', 'unit-rubrics');
const COURSES = {
  8175: 'Sports Entertainment and Event Marketing',
  8177: 'Sports Entertainment and Event Management',
};

function load() {
  const pacing = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/curriculum/PacingGuide_CAS_Context.json'), 'utf8')).pacing_guide;
  const rubricList = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps/data/CompetencyRubrics.json'), 'utf8')).competency_rubrics;
  const rubrics = {};
  Object.values(rubricList).forEach((r) => { rubrics[r.competency_id] = r; });
  return { pacing, rubrics };
}

function ids(list) {
  return String(list || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * The rubric for one unit and course, or null when the course doesn't take
 * the unit: { file, doc, title, objective, rubricText, promptText }.
 * build-canvas-cartridge.js uses promptText for the Canvas assignments.
 */
function unitRubric(unit, code, rubrics, decks) {
  const other = code === '8175' ? '8177' : '8175';
  if (String(unit.overlap_type || '').trim() === other + ' only') return null;
  const compIds = ids(unit['competency_ids_' + code]);
  if (!compIds.length) return null;
  const missing = compIds.filter((id) => !rubrics[id]);
  if (missing.length) throw new Error(unit.lesson_unit_id + ' ' + code + ': no rubric for ' + missing.join(', '));

  // Group by duty area so a unit with many competencies reads as a few criteria.
  const groups = [];
  compIds.forEach((id) => {
    const r = rubrics[id];
    let g = groups.find((x) => x.duty === r.duty_area);
    if (!g) { g = { duty: r.duty_area, items: [] }; groups.push(g); }
    g.items.push(r);
  });

  const title = unit.lesson_unit_id + ' ' + unit.lesson_unit_name + ' (' + code + ')';
  const card = findCard(decks || loadDecks(), unit);
  const vocab = cardVocabulary(card).join(', ');
  const objective = String(unit['objective_' + code] || '').trim();
  const workProduct = cardRow(card, 'Work product');
  // Stage 0 cards have one shared "Role context" row instead of a row per course.
  const role = cardRow(card, code + ' role') || cardRow(card, 'Role context');
  const activity = cardRow(card, 'What students do');
  const deeper = cardExtension(card, code);
  if (!workProduct) throw new Error(unit.lesson_unit_id + ': the lesson card has no "Work product" row');

  const rubricText = [
    'ASSIGNMENT: ' + unit.lesson_unit_name + ' (' + unit.lesson_unit_id + ')',
    'COURSE: ' + code + ' ' + COURSES[code],
    'UNIT OBJECTIVE: ' + objective,
    'PLANNED WORK PRODUCT: ' + workProduct,
    ...(role ? ['COURSE ROLE: ' + role] : []),
    'COMPETENCIES ASSESSED: ' + compIds.join(', '),
    '',
    'CRITERIA',
    ...groups.flatMap((g, gi) => [
      '',
      'Criterion ' + (gi + 1) + ': ' + g.duty,
      ...g.items.flatMap((r) => {
        const text = r.competency_text.replace(/\.$/, '').trim();
        const standard = String(r.demonstration_standard || '').replace(/\.$/, '').trim();
        return [
        '- ' + r.competency_id + ' ' + text + '.' +
          (standard && standard.toLowerCase() !== text.toLowerCase() ? ' Standard: ' + standard + '.' : ''),
        ...(r.demonstration_indicators || []).map((ind) => '    * Evidence of ' + ind),
        ];
      }),
    ]),
    '',
    'PASSING STANDARD',
    'The work passes when the planned work product shows evidence for every competency listed above, in the ' +
      'student\'s own words, applied to the class conglomerate (its divisions, school store, events and esports ' +
      'program) or a real organization in sports, entertainment or events' +
      (vocab ? ', and uses the unit vocabulary accurately (' + vocab + ')' : '') + '. ' +
      'Each criterion needs specific examples, not general statements. Work that restates definitions ' +
      'without applying them, or leaves any listed competency without evidence, does not pass.',
  ].join('\n');

  const promptText = [
    unit.lesson_unit_name + ' (' + unit.lesson_unit_id + ')',
    '',
    objective,
    '',
    'What you will make: ' + workProduct,
    ...(role ? ['', 'Your role: ' + role] : []),
    ...(activity ? ['', 'The work: ' + activity] : []),
    ...(deeper.length ? ['', 'Go deeper:', '', ...deeper.map((d) => '- ' + d)] : []),
    '',
    'Your work must show evidence of each of these:',
    '',
    ...groups.flatMap((g) => g.items.map((r) => '- ' + r.competency_text.replace(/\.$/, '') + '.')),
    ...(vocab ? ['', 'Use these terms accurately: ' + vocab + '.'] : []),
    '',
    'Write your response in the response zone below.',
  ].join('\n');

  const doc = [
    '# ' + title,
    '',
    '_Generated by `tools/cas-ccps/build-unit-rubrics.js` from the pacing guide, CompetencyRubrics.json and the ' +
      'unit\'s lesson card. ' +
      'Edit the generator or the data, not this file._',
    '',
    'Rubric Upload Form fields:',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Subject | Marketing (CTE) |',
    '| Course Name | ' + code + ' ' + COURSES[code] + ' |',
    '| Academic Tier | Tier 1 Core |',
    '| Paste Evaluation Rubric | the block under "Rubric" below |',
    '| Assignment Prompt Template Link | a Google Doc holding the block under "Prompt template" below |',
    '',
    'Unit dates in the pacing guide: ' + unit.approx_start + ' to ' + unit.approx_end + '.',
    '',
    '## Rubric',
    '',
    '```',
    rubricText,
    '```',
    '',
    '## Prompt template',
    '',
    '```',
    promptText,
    '```',
    '',
  ].join('\n');
  const assignment = {
    unitId: unit.lesson_unit_id,
    code: code,
    unitName: unit.lesson_unit_id + ' ' + unit.lesson_unit_name,
    subject: 'Marketing (CTE)',
    courseName: code + ' ' + COURSES[code],
    tier: 'Tier 1 Core',
    persona: PERSONAS[code],
    start: unit.approx_start,
    end: unit.approx_end,
    ...milestones(compIds.map((id) => rubrics[id]), workProduct, vocab),
    definitionOfDone: rubricText,
    promptText: promptText,
  };
  return { file: unit.lesson_unit_id + '_' + code + '.md', doc, title, objective, rubricText, promptText, assignment };
}

// The TeacherMatrix persona Flow 2 evaluates in (Flow 1 used to write one per rubric).
const PERSONAS = {
  8175: 'A sports and entertainment marketing director coaching a junior team member: specific, encouraging, and strict about evidence.',
  8177: 'A sports and entertainment management executive coaching a junior manager: specific, encouraging, and strict about evidence.',
};

/**
 * Four TeacherMatrix milestones from a unit's competencies, in order: one
 * competency each when there are four or fewer (the rest are the work
 * product and the vocabulary), or the list split into four runs. Each
 * milestone's competency ID is its first competency's.
 */
function milestones(comps, workProduct, vocab) {
  const line = (r) => r.competency_id + ' ' + r.competency_text.replace(/\.$/, '').trim() + '.';
  const out = [];
  if (comps.length <= 4) {
    comps.forEach((r) => out.push({ text: line(r), id: r.competency_id }));
    const extra = [
      'The planned work product is complete and applied to the class conglomerate: ' + workProduct,
      vocab ? 'Uses the unit vocabulary accurately: ' + vocab + '.' : 'Uses specific examples, not general statements.',
      'Uses specific examples, not general statements.',
    ];
    while (out.length < 4) out.push({ text: extra[out.length - comps.length], id: '' });
  } else {
    for (let i = 0; i < 4; i++) {
      const run = comps.slice(Math.floor(i * comps.length / 4), Math.floor((i + 1) * comps.length / 4));
      out.push({ text: run.map(line).join(' '), id: run[0].competency_id });
    }
  }
  return { milestones: out.map((m) => m.text), milestoneCompetencyIds: out.map((m) => m.id) };
}

function all() {
  const { pacing, rubrics } = load();
  const decks = loadDecks();
  const out = [];
  pacing.forEach((unit) => {
    Object.keys(COURSES).forEach((code) => {
      const r = unitRubric(unit, code, rubrics, decks);
      if (r) out.push(r);
    });
  });
  return out;
}

/** { "<unit>_<course>.md": markdown } */
function build() {
  const out = {};
  all().forEach((r) => { out[r.file] = r.doc; });
  return out;
}

// The same assignments for 53_AssignmentSeeder.js, which writes them to the
// TeacherMatrix without Studio Flow 1.
const DATA_PATH = path.join(ROOT, 'cas-ccps', 'scripts', '53b_UnitAssignmentData.js');

/** The text of 53b_UnitAssignmentData.js. */
function buildData() {
  const assignments = {};
  all().forEach((r) => { assignments[r.assignment.unitId + '_' + r.assignment.code] = r.assignment; });
  return [
    '/**',
    ' * 53b_UnitAssignmentData.js — CAS-CCPS',
    ' * BOUND TO: Central Ledger (cas-ccps:central-ledger)',
    ' *',
    ' * Generated by tools/cas-ccps/build-unit-rubrics.js, from the same sources',
    ' * as curriculum/unit-rubrics/. Edit the generator or the data, not this file.',
    ' * Keyed "<unit>_<course>"; read by 53_AssignmentSeeder.js.',
    ' */',
    '',
    'const UNIT_ASSIGNMENTS = ' + JSON.stringify(assignments, null, 2) + ';',
    '',
  ].join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const files = build();
  const stale = [];
  if (!check) fs.mkdirSync(OUT_DIR, { recursive: true });
  Object.keys(files).forEach((name) => {
    const p = path.join(OUT_DIR, name);
    const have = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (have === files[name]) return;
    if (check) stale.push(name); else fs.writeFileSync(p, files[name]);
  });
  const extra = fs.existsSync(OUT_DIR)
    ? fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md' && !files[f]) : [];
  const data = buildData();
  const haveData = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, 'utf8') : null;
  if (haveData !== data) {
    if (check) stale.push(path.relative(ROOT, DATA_PATH)); else fs.writeFileSync(DATA_PATH, data);
  }
  if (check) {
    if (stale.length || extra.length) {
      console.error('unit-rubrics out of date: ' + stale.concat(extra.map((f) => f + ' (no longer generated)')).join(', '));
      console.error('Run: node tools/cas-ccps/build-unit-rubrics.js');
      process.exit(1);
    }
    console.log('unit-rubrics up to date (' + Object.keys(files).length + ' files).');
  } else {
    extra.forEach((f) => fs.unlinkSync(path.join(OUT_DIR, f)));
    console.log('Wrote ' + Object.keys(files).length + ' unit rubric(s) to ' + path.relative(ROOT, OUT_DIR) +
      ' and ' + path.relative(ROOT, DATA_PATH) + '.');
  }
}

if (require.main === module) main();
module.exports = { build, buildData, unitRubric, load, COURSES };
