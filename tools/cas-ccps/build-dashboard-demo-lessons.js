'use strict';
// Regenerates cas-ccps/scripts/13b_StudentDashboardDemoLessons.js: the
// teacher's real lessons that the Student Dashboard's demo mode shows with a
// made-up student's work (13's getDemoDashboardData, 2026-11-07).
//
// The Student Dashboard project doesn't load 55b_LessonAssignmentData.js
// (about 2 MB, and nothing else there needs it), so this copies the little
// demo mode uses: the first five approved lessons of each course in teaching
// order, each with its title, subject, warm-up anchor and milestones, plus
// the competencies those milestones name (from data/CompetencyRegistry.csv,
// with their duty area) and each course's competency count. Lesson
// definitions only, never student data.
//
// Usage: node tools/cas-ccps/build-dashboard-demo-lessons.js [--check]
//   --check: exit 1 if the file would change, without writing it.
// tests/cas-ccps/student-dashboard-demo.test.js fails when the file is out
// of date with 55b or the registry.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseCsv } = require('./sync-pacing-vocabulary');

const REPO_ROOT = path.join(__dirname, '..', '..');
const LESSONS_PATH = path.join(REPO_ROOT, 'cas-ccps', 'scripts', '55b_LessonAssignmentData.js');
const REGISTRY_PATH = path.join(REPO_ROOT, 'cas-ccps', 'data', 'CompetencyRegistry.csv');
const TARGET_PATH = path.join(REPO_ROOT, 'cas-ccps', 'scripts', '13b_StudentDashboardDemoLessons.js');
const COURSES = ['8175', '8177'];
const LESSONS_PER_COURSE = 5;

function readLessons(source) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(source + '\nthis.A = LESSON_ASSIGNMENTS; this.O = LESSON_ORDER; this.P = LESSON_PARTS;', ctx);
  return { assignments: ctx.A, order: ctx.O, parts: ctx.P };
}

function readRegistry(csv) {
  const rows = parseCsv(csv);
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (n) => h.indexOf(n);
  const out = {};
  rows.slice(1).forEach((r) => {
    const id = String(r[col('competency_id')] || '').trim();
    if (!id || out[id]) return;
    if (String(r[col('active')] || '').trim().toUpperCase() === 'FALSE') return;
    out[id] = { text: String(r[col('competency_text')] || '').trim(), area: String(r[col('strand')] || '').trim() };
  });
  return out;
}

// The lessons in parts the demo shows (Phase 4a, 2026-11-08; Slides, Phase
// 4c, 2026-11-09): for each work file type with a reader, the first lesson in
// teaching order with a part whose planned work file is that type, so the
// demo has that part's card ("Open your form", "Open your slides"; its Submit
// answers with a sample "Not yet"). Each part's title and planned work file
// (a type the demo doesn't show yet is a doc); the parts' milestones for
// their cards.
const DEMO_WORK_TYPES = ['form', 'slides'];
function workLesson(lessonSource, type) {
  const { assignments, order, parts } = readLessons(lessonSource);
  for (const code of COURSES) {
    for (const k of order[code] || []) {
      const list = parts[k];
      if (!list || !list.some((p) => p.workFile === type)) continue;
      return {
        code, key: k, lessonName: assignments[k].unitName,
        parts: list.map((p) => ({
          n: p.part, title: p.partTitle, workType: DEMO_WORK_TYPES.includes(p.workFile) ? p.workFile : 'doc',
          key: p.key, unitName: p.unitName, subject: p.subject,
          milestones: p.milestones, milestoneCompetencyIds: p.milestoneCompetencyIds,
        })),
      };
    }
  }
  return null;
}
const formLesson = (lessonSource) => workLesson(lessonSource, 'form');
const slidesLesson = (lessonSource) => workLesson(lessonSource, 'slides');

function build(lessonSource, registryCsv) {
  const { assignments, order } = readLessons(lessonSource);
  const registry = readRegistry(registryCsv);
  return COURSES.map((code) => {
    const lessons = (order[code] || []).map((k) => assignments[k])
      .filter((a) => a && a.approved && (a.milestoneCompetencyIds || []).some(Boolean))
      .slice(0, LESSONS_PER_COURSE)
      .map((a) => ({
        key: a.key,
        unitName: a.unitName,
        subject: a.subject,
        warmupAnchor: a.warmupAnchor,
        milestones: a.milestones,
        milestoneCompetencyIds: a.milestoneCompetencyIds,
      }));
    const ids = [];
    lessons.forEach((l) => l.milestoneCompetencyIds.forEach((id) => { if (id && !ids.includes(id)) ids.push(id); }));
    const competencies = ids.filter((id) => registry[id]).map((id) => ({
      id, task: Number(id.split('-')[1]) || 0, text: registry[id].text, area: registry[id].area,
    })).sort((a, b) => a.task - b.task);
    const first = lessons.length ? assignments[lessons[0].key] : null;
    return {
      code,
      courseName: first ? first.courseName : code,
      competencyTotal: Object.keys(registry).filter((id) => id.split('-')[0] === code).length,
      competencies,
      lessons,
    };
  });
}

function render(courses, partsLesson, slidesPartsLesson) {
  return [
    '// =============================================================================',
    '// FILE: 13b_StudentDashboardDemoLessons.js',
    '// BOUND TO: Student Dashboard (cas-ccps:student-dashboard)',
    '// GENERATED by tools/cas-ccps/build-dashboard-demo-lessons.js from',
    '// 55b_LessonAssignmentData.js and cas-ccps/data/CompetencyRegistry.csv.',
    '// Never hand-edit: rebuild after the lessons change.',
    '// The teacher\'s real lessons for the Student Dashboard\'s demo mode',
    '// (13\'s getDemoDashboardData): lesson definitions only, no student data.',
    '// =============================================================================',
    '',
    'const DASH_DEMO_LESSONS = ' + JSON.stringify(courses, null, 2) + ';',
    '',
    '// A lesson in parts with a form part, for the demo\'s form card (Phase 4a).',
    'const DASH_DEMO_PARTS_LESSON = ' + JSON.stringify(partsLesson || null, null, 2) + ';',
    '',
    '// A lesson in parts with a Slides part, for the demo\'s slides card (Phase 4c).',
    'const DASH_DEMO_SLIDES_LESSON = ' + JSON.stringify(slidesPartsLesson || null, null, 2) + ';',
    '',
  ].join('\n');
}

function expected() {
  const lessons = fs.readFileSync(LESSONS_PATH, 'utf8');
  return render(build(lessons, fs.readFileSync(REGISTRY_PATH, 'utf8')), formLesson(lessons), slidesLesson(lessons));
}

function main() {
  const next = expected();
  const current = fs.existsSync(TARGET_PATH) ? fs.readFileSync(TARGET_PATH, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (current !== next) {
      console.error('13b_StudentDashboardDemoLessons.js is out of date. Run: node tools/cas-ccps/build-dashboard-demo-lessons.js');
      process.exit(1);
    }
    console.log('13b_StudentDashboardDemoLessons.js matches the lesson data.');
    return;
  }
  if (current === next) { console.log('No change.'); return; }
  fs.writeFileSync(TARGET_PATH, next);
  console.log('Wrote ' + path.relative(REPO_ROOT, TARGET_PATH));
}

if (require.main === module) main();
module.exports = { build, render, expected, formLesson, slidesLesson, workLesson, TARGET_PATH };
