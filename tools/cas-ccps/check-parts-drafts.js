#!/usr/bin/env node
'use strict';
/**
 * Checks drafted lesson parts (meta/STUDENT_WORK_PLAN_2026-10.md, Phase 3)
 * before the teacher approves them: lessons/PARTS_DRAFTS.json, or a file
 * given, in PARTS.json's shape. Each draft is built by the lesson builder
 * itself, as if it were in PARTS.json, so a draft that passes here moves to
 * PARTS.json unchanged. Nothing is written.
 *
 * Checked, per lesson: the builder's own rules (each part's marker starts a
 * paragraph of the task, a primary, every tier one of the lesson's
 * competencies, every lesson competency in some part), one part per
 * "Part n:" paragraph in order, a criterion for each of a part's
 * competencies and no other, a work file of doc, form, slides or sheet, and
 * vocabulary from the lesson's own list.
 *
 *   node tools/cas-ccps/check-parts-drafts.js [drafts.json]
 *       prints each lesson's result; exit 1 on any problem
 */

const fs = require('fs');
const path = require('path');

const LESSONS = path.join(__dirname, '..', '..', 'cas-ccps', 'curriculum', 'lessons');
const PARTS_FILE = path.join(LESSONS, 'PARTS.json');
const DRAFTS_FILE = path.join(LESSONS, 'PARTS_DRAFTS.json');
const WORK_FILES = ['doc', 'form', 'slides', 'sheet'];

/** The lessons a draft file holds: { key: def }, without "_" notes. */
function draftsIn(file) {
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('_')));
}

/** Builds every lesson with `drafts` read as part of PARTS.json. */
function buildWith(drafts) {
  const builder = require('./build-lesson-assignments.js');
  const real = fs.readFileSync;
  fs.readFileSync = function (f, ...rest) {
    if (path.resolve(String(f)) === PARTS_FILE) {
      return JSON.stringify(Object.assign(JSON.parse(real.call(fs, f, 'utf8')), drafts));
    }
    return real.call(fs, f, ...rest);
  };
  try {
    return builder.build();
  } finally {
    fs.readFileSync = real;
  }
}

/** Problems with one lesson's draft, against its built lesson (whole). */
function lessonProblems(key, def, lesson) {
  const out = [];
  if (!lesson) return ['not a lesson the builder makes'];
  const task = lesson.promptText;
  const markers = (task.match(/(^|\n\n)Part \d+:/g) || []).map((m) => m.trim());
  const mine = def.parts.map((p) => p.marker);
  if (JSON.stringify(markers) !== JSON.stringify(mine)) {
    out.push('parts ' + JSON.stringify(mine) + ' but the task has ' + JSON.stringify(markers));
  }
  const vocab = String(lesson.vocabulary || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  def.parts.forEach((p, i) => {
    const at = 'part ' + (i + 1) + ': ';
    if (!p.title) out.push(at + 'no title');
    if (WORK_FILES.indexOf(p.workFile) === -1) out.push(at + 'work file "' + p.workFile + '" is not one of ' + WORK_FILES.join(', '));
    const ids = [p.primary].concat(p.secondary || [], p.tertiary || []);
    const crit = Object.keys(p.criteria || {});
    ids.filter((id) => crit.indexOf(id) === -1).forEach((id) => out.push(at + 'no criterion for ' + id));
    crit.filter((id) => ids.indexOf(id) === -1).forEach((id) => out.push(at + 'a criterion for ' + id + ', which is not one of its tiers'));
    crit.filter((id) => !String(p.criteria[id]).trim()).forEach((id) => out.push(at + 'an empty criterion for ' + id));
    (p.vocabulary || []).filter((t) => vocab.indexOf(String(t).toLowerCase()) === -1)
      .forEach((t) => out.push(at + 'vocabulary "' + t + '" is not in the lesson\'s list'));
  });
  return out;
}

/** { ok, lessons: [{ key, parts, problems }] } for a drafts file. */
function check(file) {
  const drafts = draftsIn(file || DRAFTS_FILE);
  // One build per lesson, so one refused draft doesn't hide the rest.
  const lessons = Object.keys(drafts).map((key) => {
    let problems;
    try {
      problems = lessonProblems(key, drafts[key], buildWith({ [key]: drafts[key] }).assignments[key]);
    } catch (e) {
      problems = ['the builder refused it: ' + e.message];
    }
    return { key, parts: (drafts[key].parts || []).length, problems };
  });
  return { ok: lessons.every((l) => !l.problems.length), lessons };
}

function main() {
  const r = check(process.argv[2]);
  r.lessons.forEach((l) => {
    console.log((l.problems.length ? '✗ ' : '✓ ') + l.key + ' (' + l.parts + ' parts)');
    l.problems.forEach((p) => console.log('    ' + p));
  });
  console.log(r.lessons.filter((l) => !l.problems.length).length + ' of ' + r.lessons.length + ' lessons pass.');
  process.exit(r.ok ? 0 : 1);
}

module.exports = { check, draftsIn, DRAFTS_FILE };

if (require.main === module) main();
