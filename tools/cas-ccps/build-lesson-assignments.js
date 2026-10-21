#!/usr/bin/env node
'use strict';
/**
 * Turns the teacher's own lesson docs (cas-ccps/curriculum/lessons/, verbatim
 * copies of the Drive lesson folders) into assignments, written to
 * cas-ccps/scripts/55b_LessonAssignmentData.js for 55_LessonSchedule.js and
 * 53_AssignmentSeeder.js. The operator replaced the generated pacing-guide
 * units with these lessons (2026-10-07).
 *
 *   8175: each L<NN>.md has its own student-facing "CANVAS ASSIGNMENT TEXT"
 *         (the prompt, as written), a bell ringer (the warm-up seed), the
 *         competencies it covers and a grading tip.
 *   8177: the lesson plans have no student-facing assignment. A lesson is
 *         used only once lessons/8177/prompts/<slug>.md holds a prompt the
 *         teacher approved ("status: approved"); its competencies and
 *         objectives come from the plan.
 *
 * Milestones and the definition of done follow build-unit-rubrics.js.
 *
 *   node tools/cas-ccps/build-lesson-assignments.js          write the file
 *   node tools/cas-ccps/build-lesson-assignments.js --check  exit 1 if it is out of date
 */

const fs = require('fs');
const path = require('path');
const { load, COURSES, milestones, evidenceLines, EXAMPLES_RULE, PERSONAS } = require('./build-unit-rubrics.js');

const ROOT = path.join(__dirname, '..', '..');
const LESSONS = path.join(ROOT, 'cas-ccps', 'curriculum', 'lessons');
const OUT = path.join(ROOT, 'cas-ccps', 'scripts', '55b_LessonAssignmentData.js');

const strip = (s) => String(s || '').replace(/\*\*/g, '').replace(/\\([!#*_\-.()[\]])/g, '$1').trim();

/** Lines of the section that starts at a heading matching `re`, up to the next heading of the same or higher level. */
function section(text, re) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => re.test(l));
  if (at === -1) return '';
  const level = (/^(#+)/.exec(lines[at]) || [, '###'])[1].length;
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^(#+)\s*\S/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** The text after a bold label ("**Bell Ringer (The Do Now):**") up to the next bold label or heading. */
function labelled(text, label) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.indexOf('**' + label) !== -1);
  if (at === -1) return '';
  const out = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\*\*[^*]+:\*\*\s*$/.test(lines[i].trim()) || /^#/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

/** Plain text for a prompt: markdown bold and list markers kept readable, blank runs collapsed. */
function plain(md) {
  return md.split('\n')
    .filter((l) => !/^<!-- end list -->$/.test(l.trim()))
    .map((l) => strip(l).replace(/^-\s+/, '- '))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The lesson docs used to number competencies their own way, and many numbers
// named a different competency in the state list (L16's "041: Calculate
// break-even point" was 8175-41 "Describe the marketing concept…"). Both
// courses' lessons now cite the 2025 task list, but the check stays for any
// line added later. Matching by wording picks the wrong one too often, so a
// number counts only when its state wording matches the doc's, or when
// COMPETENCY_MAP.json maps it. Any other keeps the doc's wording as a
// criterion with no ID (nothing is logged against a competency it may not
// be), and is listed in COMPETENCY_REVIEW.md for the teacher to map.
const STOP = new Set(('the a an of and or to in as it its for with on by is are be related relates ' +
  'sports entertainment event events industry industries').split(' '));
const words = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, ' ')
  .split(/\s+/).filter((w) => w && !STOP.has(w));
function sameWording(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return false;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size) >= 0.75;
}

const MAP_FILE = path.join(LESSONS, 'COMPETENCY_MAP.json');

// Competency tiers per assignment (decided 2026-10-20): a primary that must
// be MET, one or two secondaries that must be at least PARTIALLY MET, and
// tertiaries the evaluator only notes when the work shows them. An
// assignment without an entry keeps the untiered criteria.
const TIERS_FILE = path.join(LESSONS, 'COMPETENCY_TIERS.json');
const competencyTiers = () => (fs.existsSync(TIERS_FILE) ? JSON.parse(fs.readFileSync(TIERS_FILE, 'utf8')) : {});
// Keys starting with _ are notes, not assignments.

const TIER_RULE = 'PASSING RULE: APPROVED when Milestone 1 (the primary competency) is MET and Milestones 2, 3 ' +
  'and 4 are each MET or PARTIALLY MET. Tertiary competencies never affect the result.';

/** Milestones and the Definition of Done from an assignment's tiers. Throws on a tier that doesn't fit. */
function applyTiers(a, comps, t, grading, vocab) {
  const byId = {};
  comps.forEach((r) => { if (r.competency_id) byId[r.competency_id] = r; });
  const secondary = t.secondary || [];
  const tertiary = t.tertiary || [];
  const all = [t.primary].concat(secondary, tertiary);
  const where = 'COMPETENCY_TIERS.json ' + a.key + ': ';
  if (!t.primary) throw new Error(where + 'no primary');
  if (secondary.length > 2) throw new Error(where + 'more than two secondaries');
  all.forEach((id) => { if (!byId[id]) throw new Error(where + id + ' is not one of the lesson\'s competencies'); });
  if (new Set(all).size !== all.length) throw new Error(where + 'a competency is in two tiers');
  const missing = Object.keys(byId).filter((id) => all.indexOf(id) === -1);
  if (missing.length) throw new Error(where + 'no tier for ' + missing.join(', '));

  const line = (r) => r.competency_id + ' ' + r.competency_text.replace(/\.$/, '').trim() + '.';
  const ms = [
    { text: line(byId[t.primary]), id: t.primary },
    { text: line(byId[secondary[0]] || byId[t.primary]), id: secondary[0] || '' },
    secondary[1]
      ? { text: line(byId[secondary[1]]), id: secondary[1] }
      : { text: 'Uses specific examples from the student\'s own work, not general statements.', id: '' },
    { text: 'Completes every part of the task the assignment asks for.', id: '' },
  ];
  if (!secondary.length) ms[1] = { text: vocab ? 'Uses the lesson vocabulary accurately: ' + vocab + '.' :
    'Explains the reasoning behind each part, in the student\'s own words.', id: '' };
  // The student sees what the work needs to show, in the task itself.
  const plainLine = (id) => '- ' + byId[id].competency_text.replace(/\.$/, '').trim();
  // Before a closing "Submission:" part, which the Canvas cartridge drops.
  const checklist = 'What your work needs to show:\n\n' +
    [plainLine(t.primary) + ' (required)'].concat(secondary.map(plainLine)).join('\n') +
    (tertiary.length ? '\n\nYou can also show (not required):\n\n' + tertiary.map(plainLine).join('\n') : '');
  const task = String(a.promptText || '').trim();
  const sub = task.search(/\n\nSubmission:\s*\n/);
  a.promptText = sub === -1 ? task + '\n\n' + checklist : task.slice(0, sub) + '\n\n' + checklist + task.slice(sub);
  a.milestones = ms.map((m) => m.text);
  a.milestoneCompetencyIds = ms.map((m) => m.id);
  a.tertiaryCompetencyIds = tertiary.slice();

  const block = (ids) => ids.flatMap((id) => ['- ' + line(byId[id]), ...evidenceLines(byId[id])]);
  return [
    'ASSIGNMENT: ' + a.unitName,
    'COURSE: ' + a.courseName,
    'COMPETENCIES ASSESSED: ' + [t.primary].concat(secondary).join(', '),
    '',
    'THE TASK (what the student was asked to do)',
    String(a.promptText || '').trim(),
    '',
    'PRIMARY COMPETENCY (Milestone 1; must be MET)',
    ...block([t.primary]),
    '',
    'SECONDARY COMPETENCIES (must be at least PARTIALLY MET)',
    ...(secondary.length ? block(secondary) : ['- None for this assignment.']),
    '',
    'TERTIARY COMPETENCIES (never required; name any the work clearly shows under ALSO SHOWN)',
    ...(tertiary.length ? tertiary.map((id) => '- ' + line(byId[id])) : ['- None for this assignment.']),
    ...(gradable(grading) ? ['', 'TEACHER GRADING NOTES', gradable(grading)] : []),
    '',
    TIER_RULE,
    '',
    'PASSING STANDARD',
    'The work does every part of the task the assignment asks for, in the student\'s own words' +
      (vocab ? ', using the lesson vocabulary accurately (' + vocab + ')' : '') + '. ' +
      'Specific examples, not general statements. ' + EXAMPLES_RULE,
  ].join('\n');
}
const competencyMap = () => (fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : {});
const review = [];

function rubricFor(code, num, docText, rubrics, where) {
  const mapped = (competencyMap()[code] || {})[String(num)];
  const id = mapped || (code + '-' + num);
  const r = rubrics[id];
  if (r && (mapped || sameWording(docText, r.competency_text))) return r;
  review.push({ code, num, docText, stateText: r ? r.competency_text : '(no such competency)', where });
  return { competency_id: '', competency_text: docText, demonstration_indicators: [] };
}

function reviewFile() {
  const byNum = {};
  review.forEach((x) => {
    const k = x.code + '|' + x.num + '|' + x.docText;
    (byNum[k] = byNum[k] || Object.assign({ lessons: [] }, x)).lessons.push(x.where);
  });
  const rows = Object.values(byNum).sort((a, b) => (a.code - b.code) || (a.num - b.num));
  return [
    '# Lesson competency numbers to review',
    '',
    '_Generated by `tools/cas-ccps/build-lesson-assignments.js`. Do not edit; map numbers in `COMPETENCY_MAP.json`._',
    '',
    'These lesson docs cite a competency number whose state wording (CompetencyRubrics.json) does not match',
    'the doc\'s. Each is used as a rubric criterion in the doc\'s own words, with no competency ID, so nothing',
    'is logged against a competency it may not be. To track one, add its correct ID to `COMPETENCY_MAP.json`,',
    'e.g. `{ "8175": { "46": "8175-56" } }`, and re-run the generator.',
    '',
    '| Course | Doc number | Doc wording | State wording for that number | Lessons |',
    '|---|---|---|---|---|',
    ...rows.map((x) => '| ' + x.code + ' | ' + x.num + ' | ' + x.docText.replace(/\|/g, '/') + ' | ' +
      x.stateText.replace(/\|/g, '/') + ' | ' + x.lessons.join(', ') + ' |'),
    '',
  ].join('\n');
}

/**
 * The teacher's grading notes, less what Flow 2 can't see. It reads only the
 * student's doc, so a note about work done elsewhere (L07's "reply to two
 * classmates" on the discussion board) would fail every student; that part
 * is graded by the teacher in Canvas.
 */
const ELSEWHERE = /peer repl|repl(y|ies) to .*classmates|classmates'? posts/i;

function gradable(grading) {
  const lines = String(grading || '').split('\n');
  const kept = lines.filter((l) => !ELSEWHERE.test(l));
  const note = kept.length < lines.length
    ? ['', 'Peer replies are graded by the teacher outside this document. Do not look for them here or count their absence.']
    : [];
  return kept.concat(note).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function definitionOfDone(a, comps, grading, vocab) {
  return [
    'ASSIGNMENT: ' + a.unitName,
    'COURSE: ' + a.courseName,
    'COMPETENCIES ASSESSED: ' + (comps.map((r) => r.competency_id).filter(Boolean).join(', ') || '(see criteria)'),
    '',
    // What the student was asked to do, word for word, so the criteria are
    // judged against the task (2026-10-20).
    'THE TASK (what the student was asked to do)',
    String(a.promptText || '').trim(),
    '',
    'CRITERIA',
    ...comps.flatMap((r) => [
      '- ' + (r.competency_id ? r.competency_id + ' ' : '') + String(r.competency_text).replace(/\.$/, '') + '.',
      ...evidenceLines(r),
    ]),
    ...(gradable(grading) ? ['', 'TEACHER GRADING NOTES', gradable(grading)] : []),
    '',
    'PASSING STANDARD',
    'The work passes when it does every part of the task the assignment asks for, in the student\'s own words, ' +
      'and that work shows each competency listed in at least one specific way' +
      (vocab ? ', using the lesson vocabulary accurately (' + vocab + ')' : '') + '. ' +
      'Specific examples, not general statements. Work that skips a part of the task, or restates the prompt ' +
      'without doing it, does not pass. ' + EXAMPLES_RULE,
  ].join('\n');
}

function lesson8175(file, rubrics) {
  const text = fs.readFileSync(path.join(LESSONS, '8175', file), 'utf8');
  const num = /^L(\d+)\.md$/.exec(file)[1];
  const heading = /^##\s*LESSON\s*\d+:\s*(.+)$/m.exec(text);
  if (!heading) throw new Error('8175 ' + file + ': no "## LESSON NN:" heading');
  const title = strip(heading[1]);
  const comps = [];
  const compSection = section(text, /COMPETENCY ALIGNMENT/);
  compSection.split('\n').forEach((l) => {
    const m = /^\s*-\s*\*\*(\d{3}):\*\*\s*(.+)$/.exec(l);
    if (m) comps.push(rubricFor('8175', Number(m[1]), strip(m[2]), rubrics, 'L' + num));
  });
  if (!comps.length) throw new Error('8175 ' + file + ': no competencies');
  comps.splice(0, comps.length, ...uniq(comps));
  const canvas = section(text, /CANVAS ASSIGNMENT TEXT/);
  if (!canvas.trim()) throw new Error('8175 ' + file + ': no CANVAS ASSIGNMENT TEXT');
  const promptText = plain(canvas);
  const bell = strip(labelled(text, 'Bell Ringer')).replace(/^"|"$/g, '');
  const grading = plain(labelled(text, 'Quick Grading Tip'));
  const description = plain(labelled(canvas, 'Description'));
  const a = {
    key: '8175-L' + num, code: '8175', lessonId: 'L' + num,
    unitName: 'L' + num + ' ' + title,
    subject: 'Marketing (CTE)', courseName: '8175 ' + COURSES[8175], tier: 'Tier 1 Core', persona: PERSONAS[8175],
    objective: description.split('\n\n')[0] || title,
    warmupAnchor: bell,
    vocabulary: '',
    competencyIds: comps.map((r) => r.competency_id).filter(Boolean),
    approved: true,
    source: 'lessons/8175/' + file,
  };
  Object.assign(a, milestones(comps, title, ''));
  a.promptText = promptText;
  const tiers8175 = competencyTiers()[a.key];
  a.definitionOfDone = tiers8175 ? applyTiers(a, comps, tiers8175, grading, '') : definitionOfDone(a, comps, grading, '');
  return a;
}

/** Drops a repeat: the same ID, or (with no ID) the same wording ("107 & 108" share one line). */
const uniq = (comps) => comps.filter((r, i) => comps.findIndex((x) =>
  (r.competency_id ? x.competency_id === r.competency_id : !x.competency_id && x.competency_text === r.competency_text)) === i);

const slug = (s) => String(s).toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The student-facing support an 8177 prompt file can carry ahead of the task,
// in plain classroom language: what the student needs to know to do it.
const SUPPORT = [['Background', /^## Background/], ['Key Terms', /^## Key terms/i], ['Example', /^## Example/]];

/**
 * The prompt a student sees: the assignment title, then Background, Key
 * Terms and Example when the file has them, then the task under "Your Task:".
 * Each heading stands alone so Canvas shows it as a heading.
 */
function studentPrompt(p) {
  const task = section(p, /^## Prompt/).trim();
  const parts = SUPPORT.map(([h, re]) => [h, section(p, re).trim()]).filter(([, body]) => body);
  if (!parts.length) return task;
  const paras = task.split(/\n{2,}/);
  const title = /^Assignment:/.test(paras[0]) ? paras.shift() : '';
  return [title, ...parts.map(([h, body]) => h + ':\n\n' + body), 'Your Task:\n\n' + paras.join('\n\n')]
    .filter(Boolean).join('\n\n');
}

function lesson8177(file, rubrics) {
  const text = fs.readFileSync(path.join(LESSONS, '8177', file), 'utf8');
  const s = file.replace(/\.md$/, '');
  const promptFile = path.join(LESSONS, '8177', 'prompts', s + '.md');
  if (!fs.existsSync(promptFile)) return null;
  const p = fs.readFileSync(promptFile, 'utf8');
  if (!/status:\s*approved/.test(p)) return null;
  const heading = /^#\s*(?:\*\*)?Lesson Plan:\s*(.+?)(?:\*\*)?\s*$/m.exec(text);
  const title = strip(heading ? heading[1] : s);
  const comps = [];
  section(text, /Competency Alignment/i).split('\n').forEach((l) => {
    const m = /^\s*-\s*\*\*Competenc(?:y|ies)\s+([\d\s&,and]+):\*\*\s*(.+)$/i.exec(l);
    if (!m) return;
    m[1].split(/[^\d]+/).filter(Boolean).forEach((n) => comps.push(rubricFor('8177', Number(n), strip(m[2]), rubrics, s)));
  });
  if (!comps.length) throw new Error('8177 ' + file + ': no competencies');
  comps.splice(0, comps.length, ...uniq(comps));
  const objectives = plain(section(text, /Learning Objectives/i));
  const prompt = studentPrompt(p);
  const warm = section(p, /^## Warm-up/).trim();
  const vocab = section(p, /^## Vocabulary/).trim();
  const a = {
    key: '8177-' + s, code: '8177', lessonId: s.toUpperCase(),
    unitName: title,
    subject: 'Marketing (CTE)', courseName: '8177 ' + COURSES[8177], tier: 'Tier 1 Core', persona: PERSONAS[8177],
    objective: objectives.replace(/^By the end of this lesson, students will be able to:\s*/i, '').split('\n')[0] || title,
    warmupAnchor: warm,
    vocabulary: vocab,
    competencyIds: comps.map((r) => r.competency_id).filter(Boolean),
    approved: true,
    source: 'lessons/8177/' + file,
  };
  Object.assign(a, milestones(comps, title, vocab));
  a.promptText = prompt;
  const tiers8177 = competencyTiers()[a.key];
  a.definitionOfDone = tiers8177 ? applyTiers(a, comps, tiers8177, '', vocab) : definitionOfDone(a, comps, '', vocab);
  return a;
}

function build() {
  review.length = 0;
  const { rubrics } = load();
  const out = {};
  const order = { 8175: [], 8177: [] };
  const d75 = path.join(LESSONS, '8175');
  if (fs.existsSync(d75)) {
    fs.readdirSync(d75).filter((f) => /^L\d+\.md$/.test(f)).sort().forEach((f) => {
      const a = lesson8175(f, rubrics);
      out[a.key] = a; order[8175].push(a.key);
    });
  }
  // 8177: the pacing guide's order where it names the lesson, then the rest alphabetically.
  const d77 = path.join(LESSONS, '8177');
  if (fs.existsSync(d77)) {
    const files = fs.readdirSync(d77).filter((f) => /\.md$/.test(f) && f === f.toLowerCase());
    const guide = fs.existsSync(path.join(d77, 'PACING_GUIDE.md')) ? fs.readFileSync(path.join(d77, 'PACING_GUIDE.md'), 'utf8') : '';
    const named = [];
    guide.replace(/Lesson:\*?\s*\*\*([^*]+)\*\*/g, (_, n) => { named.push(slug(n.replace(/\(.*?\)/g, ''))); return _; });
    const rank = (f) => { const i = named.findIndex((n) => f.replace(/\.md$/, '').indexOf(n) === 0 || n.indexOf(f.replace(/\.md$/, '')) === 0); return i === -1 ? 999 : i; };
    files.sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b)).forEach((f) => {
      const a = lesson8177(f, rubrics);
      if (a) { out[a.key] = a; order[8177].push(a.key); }
    });
  }
  return { assignments: out, order, review: reviewFile() };
}

function dataFile(b) {
  return [
    '/**',
    ' * 55b_LessonAssignmentData.js — CAS-CCPS',
    ' * BOUND TO: Central Ledger (cas-ccps:central-ledger) AND the Teacher Dashboard',
    ' *   (cas-ccps:teacher-dashboard), where 65_LessonDrafts.js starts the lesson',
    ' *   editor from it.',
    ' *',
    ' * Generated by tools/cas-ccps/build-lesson-assignments.js from the teacher\'s',
    ' * lesson docs (cas-ccps/curriculum/lessons/). Edit those, not this file.',
    ' * Keyed "<course>-<lesson>"; read by 55_LessonSchedule.js and 53_AssignmentSeeder.js.',
    ' */',
    '',
    'const LESSON_ASSIGNMENTS = ' + JSON.stringify(b.assignments, null, 2) + ';',
    '',
    '// Each course\'s lessons in teaching order: LessonSchedule is seeded in this order.',
    'const LESSON_ORDER = ' + JSON.stringify(b.order, null, 2) + ';',
    '',
  ].join('\n');
}

const REVIEW_FILE = path.join(LESSONS, 'COMPETENCY_REVIEW.md');

function main() {
  const b0 = build();
  const text = dataFile(b0);
  const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  const haveReview = fs.existsSync(REVIEW_FILE) ? fs.readFileSync(REVIEW_FILE, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (have !== text || haveReview !== b0.review) {
      console.error('55b_LessonAssignmentData.js or COMPETENCY_REVIEW.md is out of date. Run: node tools/cas-ccps/build-lesson-assignments.js');
      process.exit(1);
    }
    console.log('55b_LessonAssignmentData.js up to date.');
    return;
  }
  if (have !== text) fs.writeFileSync(OUT, text);
  if (haveReview !== b0.review) fs.writeFileSync(REVIEW_FILE, b0.review);
  const b = b0;
  console.log('Wrote ' + path.relative(ROOT, OUT) + ': ' + b.order[8175].length + ' 8175 lesson(s), ' +
    b.order[8177].length + ' 8177 lesson(s) with an approved prompt.');
}

if (require.main === module) main();
module.exports = { build, dataFile, slug, studentPrompt };
