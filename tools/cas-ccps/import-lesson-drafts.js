#!/usr/bin/env node
'use strict';
/**
 * The mechanical half of a lesson-draft import (meta/LESSON_AUTHORING_PLAN_2026-10.md,
 * phase 1; the session's steps are in cas-ccps/docs/LESSON_IMPORT_PROCEDURE.md).
 * A draft comes from the Central Ledger's LessonDrafts tab (65_LessonDrafts.js),
 * exported to JSON by the session: the raw rows (header first) or an array of
 * objects keyed by header.
 *
 *   node tools/cas-ccps/import-lesson-drafts.js check  <drafts.json>
 *       every SUBMITTED draft re-checked with 65's own rules (_ldCheck_): what
 *       is missing, per draft. Changes nothing.
 *   node tools/cas-ccps/import-lesson-drafts.js apply  <drafts.json> <draft_id>
 *       writes the fields that have one home in the repo, rebuilds 55b and the
 *       cartridges, and reports, field by field, whether the built lesson now
 *       matches the draft. Safe to run again after hand edits.
 *   node tools/cas-ccps/import-lesson-drafts.js verify <drafts.json> <draft_id>
 *       rebuilds and compares, with no edits.
 *
 * Written by apply: the tiers (COMPETENCY_TIERS.json, with the reason added to
 * "why"), a competency line added or removed in the lesson's alignment list,
 * the warm-up anchor (8175: the Bell Ringer; 8177: the prompt file's
 * "## Warm-up"), and for 8177 the vocabulary ("## Vocabulary") and the
 * objective (the first Learning Objectives line). Left for the session, and
 * named in the report: the student task (8175: the CANVAS ASSIGNMENT TEXT
 * section; 8177: the prompt file's Prompt, Background, Key terms and Example),
 * an 8175 objective (the first paragraph of the task's Description), 8175
 * vocabulary (no home), and a competency on a line shared with others.
 *
 * The report's "proposal" holds the built value of every field the draft
 * changes, for the session to write back as the draft's proposal_json.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LESSONS = path.join(ROOT, 'cas-ccps', 'curriculum', 'lessons');
const TIERS_FILE = path.join(LESSONS, 'COMPETENCY_TIERS.json');
const DATA_55B = path.join(ROOT, 'cas-ccps', 'scripts', '55b_LessonAssignmentData.js');
const DRAFTS_GS = path.join(ROOT, 'cas-ccps', 'scripts', '65_LessonDrafts.js');
const RUBRICS = path.join(ROOT, 'cas-ccps', 'data', 'CompetencyRubrics.json');
const FIELDS = ['promptText', 'warmupAnchor', 'objective', 'vocabulary', 'competencyIds', 'primary', 'secondary', 'tertiary'];

class Fatal extends Error {}

// ── Drafts ───────────────────────────────────────────────────────────────────

function readDrafts(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(raw) && Array.isArray(raw[0])
    ? raw.slice(1).map((r) => Object.fromEntries(raw[0].map((h, i) => [String(h).trim(), r[i]])))
    : (Array.isArray(raw) ? raw : raw.values || []);
  return rows.filter((r) => String(r.draft_id || '').trim()).map((r) => {
    const json = (v) => { try { return JSON.parse(String(v || '')) || null; } catch (e) { return null; } };
    return {
      draftId: String(r.draft_id).trim(), kind: String(r.kind || '').trim(), course: String(r.course || '').trim(),
      lessonKey: String(r.lesson_key || '').trim(), status: String(r.status || '').trim(),
      fields: json(r.fields_json) || {}, original: json(r.original_json), reason: String(r.reason || ''),
      reviewNote: String(r.review_note || ''),
    };
  });
}

// ── 65's own check, run as written ───────────────────────────────────────────

function context() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(DATA_55B, 'utf8') + '\n;this.LESSON_ASSIGNMENTS = LESSON_ASSIGNMENTS;', ctx);
  vm.runInContext(fs.readFileSync(DRAFTS_GS, 'utf8') +
    '\n;this._ldCheck_ = _ldCheck_; this._ldLesson_ = _ldLesson_; this._ldCleanFields_ = _ldCleanFields_;', ctx);
  return ctx;
}

function catalog(course) {
  const all = JSON.parse(fs.readFileSync(RUBRICS, 'utf8')).competency_rubrics.filter((r) => String(r.course) === String(course));
  const byId = {};
  const list = all.map((r) => {
    const item = { id: r.competency_id, task: r.task_number, text: r.competency_text };
    byId[item.id] = item;
    return item;
  });
  return { available: true, list, byId };
}

// Checked against the lesson as the draft found it (original_json), so a
// second apply, after the first has rebuilt 55b, still sees the change.
function checkDraft(ctx, d) {
  const lesson = ctx._ldLesson_(d.lessonKey);
  if (lesson && d.original) lesson.current = Object.assign({}, lesson.current, d.original);
  const fields = ctx._ldCleanFields_(d.fields);
  return { lesson, fields, issues: ctx._ldCheck_(lesson, fields, d.reason, catalog(d.course)).issues };
}

// ── Writing the fields that have one home ────────────────────────────────────

function sectionRange(lines, re) {
  const at = lines.findIndex((l) => re.test(l));
  if (at === -1) return null;
  const level = (/^(#+)/.exec(lines[at]) || [, '##'])[1].length;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^(#+)\s*\S/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return { at, end };
}

/** Replaces a "## Heading" section's body, keeping one blank line each side. */
function setSection(text, re, body) {
  const lines = text.split('\n');
  const r = sectionRange(lines, re);
  if (!r) return null;
  const tail = lines.slice(r.end);
  const out = [...lines.slice(0, r.at + 1), '', ...String(body).trim().split('\n'), ...(tail.length ? [''] : []), ...tail].join('\n');
  return text.endsWith('\n') && !out.endsWith('\n') ? out + '\n' : out;
}

/** Replaces the text under a bold label ("**Bell Ringer (The Do Now):**") up to the next label or heading. */
function setLabelled(text, label, body) {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.indexOf('**' + label) !== -1);
  if (at === -1) return null;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\*\*[^*]+:\*\*\s*$/.test(lines[i].trim()) || /^#/.test(lines[i])) { end = i; break; }
  }
  return [...lines.slice(0, at + 1), '', body, '', ...lines.slice(end)].join('\n');
}

/** Competency lines: { ids per line, index } in the lesson's alignment section. */
function competencyLines(lines, course) {
  const r = sectionRange(lines, course === '8175' ? /COMPETENCY ALIGNMENT/ : /Competency Alignment/i);
  if (!r) return null;
  const out = [];
  for (let i = r.at + 1; i < r.end; i++) {
    const m = course === '8175'
      ? /^(\s*)-\s*\*\*(\d{3}):\*\*/.exec(lines[i])
      : /^(\s*)-\s*\*\*Competenc(?:y|ies)\s+([\d\s&,and]+):\*\*/i.exec(lines[i]);
    if (!m) continue;
    const nums = course === '8175' ? [Number(m[2])] : m[2].split(/[^\d]+/).filter(Boolean).map(Number);
    out.push({ index: i, indent: m[1], ids: nums.map((n) => course + '-' + n) });
  }
  return { range: r, items: out };
}

function lessonFile(key) {
  const [course, ...rest] = key.split('-');
  const name = rest.join('-');
  return course === '8175'
    ? { course, lesson: path.join(LESSONS, '8175', name + '.md'), prompt: null }
    : { course, lesson: path.join(LESSONS, '8177', name + '.md'), prompt: path.join(LESSONS, '8177', 'prompts', name + '.md') };
}

function apply(d, current, fields, report) {
  const files = lessonFile(d.lessonKey);
  const course = files.course;
  const changed = (k) => JSON.stringify(norm(fields[k])) !== JSON.stringify(norm(current[k]));
  const rubricText = Object.fromEntries(catalog(course).list.map((c) => [c.id, c.text]));
  let lesson = fs.readFileSync(files.lesson, 'utf8');
  let prompt = files.prompt ? fs.readFileSync(files.prompt, 'utf8') : null;

  // Competencies: add a line per new one, remove a line that holds only a dropped one.
  if (changed('competencyIds')) {
    const lines = lesson.split('\n');
    const cl = competencyLines(lines, course);
    if (!cl || !cl.items.length) report.hand.push({ field: 'competencyIds', why: 'the alignment list was not found' });
    else {
      const listed = cl.items.flatMap((x) => x.ids);
      const drop = listed.filter((id) => fields.competencyIds.indexOf(id) === -1);
      const add = fields.competencyIds.filter((id) => listed.indexOf(id) === -1);
      const shared = drop.filter((id) => cl.items.find((x) => x.ids.indexOf(id) !== -1).ids.length > 1);
      shared.forEach((id) => report.hand.push({ field: 'competencyIds', why: id + ' shares a line with another competency; edit that line by hand' }));
      const removeAt = cl.items.filter((x) => x.ids.length === 1 && drop.indexOf(x.ids[0]) !== -1).map((x) => x.index);
      const last = cl.items[cl.items.length - 1];
      const newLines = add.map((id) => {
        const n = id.split('-')[1];
        const text = String(rubricText[id] || '').replace(/\.?\s*$/, '.');
        return course === '8175'
          ? last.indent + '- **' + n.padStart(3, '0') + ':** ' + text
          : last.indent + '- **Competency ' + n + ':** ' + text;
      });
      const out = [];
      lines.forEach((l, i) => {
        if (removeAt.indexOf(i) === -1) out.push(l);
        if (i === last.index) out.push(...newLines);
      });
      lesson = out.join('\n');
      report.applied.push('competencyIds' + (add.length ? ' +' + add.join(',') : '') + (removeAt.length ? ' -' + drop.filter((x) => shared.indexOf(x) === -1).join(',') : ''));
    }
  }

  // Warm-up anchor.
  if (changed('warmupAnchor')) {
    if (course === '8175') {
      const next = setLabelled(lesson, 'Bell Ringer', '"' + fields.warmupAnchor.replace(/^"|"$/g, '') + '"');
      if (next === null) report.hand.push({ field: 'warmupAnchor', why: 'no Bell Ringer label in ' + rel(files.lesson) });
      else { lesson = next; report.applied.push('warmupAnchor'); }
    } else {
      const next = setSection(prompt, /^## Warm-up/, fields.warmupAnchor);
      if (next === null) report.hand.push({ field: 'warmupAnchor', why: 'no "## Warm-up" in ' + rel(files.prompt) });
      else { prompt = next; report.applied.push('warmupAnchor'); }
    }
  }

  // Vocabulary: 8177 only.
  if (changed('vocabulary')) {
    if (course === '8175') report.hand.push({ field: 'vocabulary', why: '8175 lessons have no vocabulary field; add the terms to the student task instead' });
    else {
      const next = setSection(prompt, /^## Vocabulary/, fields.vocabulary);
      if (next === null) report.hand.push({ field: 'vocabulary', why: 'no "## Vocabulary" in ' + rel(files.prompt) });
      else { prompt = next; report.applied.push('vocabulary'); }
    }
  }

  // Objective: 8177's first Learning Objectives line; 8175's is part of the task.
  if (changed('objective')) {
    if (course === '8175') report.hand.push({ field: 'objective', why: "8175's objective is the first paragraph of the task's Description; edit it there" });
    else {
      const lines = lesson.split('\n');
      const r = sectionRange(lines, /Learning Objectives/i);
      const first = r ? lines.findIndex((l, i) => i > r.at && i < r.end && l.trim() && !/^By the end of this lesson/i.test(l.trim())) : -1;
      if (first === -1) report.hand.push({ field: 'objective', why: 'no Learning Objectives line in ' + rel(files.lesson) });
      else { lines[first] = fields.objective; lesson = lines.join('\n'); report.applied.push('objective'); }
    }
  }

  if (changed('promptText')) {
    report.hand.push({ field: 'promptText', why: course === '8175'
      ? 'map the task into the CANVAS ASSIGNMENT TEXT section of ' + rel(files.lesson)
      : 'map the task into the Prompt, Background, Key terms and Example sections of ' + rel(files.prompt) });
  }

  // Tiers.
  if (['primary', 'secondary', 'tertiary', 'competencyIds'].some(changed)) {
    const tiers = JSON.parse(fs.readFileSync(TIERS_FILE, 'utf8'));
    const old = tiers[d.lessonKey] || {};
    const stamp = 'Edited from the dashboard (' + d.draftId + '): ' + d.reason.trim().replace(/\.?$/, '.');
    tiers[d.lessonKey] = {
      primary: fields.primary, secondary: fields.secondary, tertiary: fields.tertiary,
      why: old.why && old.why.indexOf(d.draftId) === -1 ? old.why + ' ' + stamp : (old.why || stamp),
    };
    fs.writeFileSync(TIERS_FILE, JSON.stringify(tiers, null, 2) + '\n');
    report.applied.push('tiers');
  }

  fs.writeFileSync(files.lesson, lesson);
  if (prompt !== null) fs.writeFileSync(files.prompt, prompt);
}

// ── Build and compare ────────────────────────────────────────────────────────

function rebuild() {
  for (const tool of ['build-lesson-assignments.js', 'build-canvas-cartridge.js']) {
    execFileSync(process.execPath, [path.join(__dirname, tool)], { cwd: ROOT, stdio: 'pipe' });
  }
}

function compare(ctx0, d, fields, report) {
  const ctx = context(); // 55b as rebuilt
  const built = ctx._ldLesson_(d.lessonKey).current;
  const before = Object.assign({}, ctx0._ldLesson_(d.lessonKey).current, d.original || {});
  report.proposal = { fields: {} };
  report.fields = {};
  FIELDS.forEach((k) => {
    const draftChanged = JSON.stringify(norm(fields[k])) !== JSON.stringify(norm(before[k]));
    const builtChanged = JSON.stringify(norm(built[k])) !== JSON.stringify(norm(before[k]));
    if (!draftChanged && !builtChanged) return;
    report.fields[k] = JSON.stringify(norm(built[k])) === JSON.stringify(norm(fields[k])) ? 'matches the draft'
      : builtChanged ? 'built, differs from the draft' : 'not built yet';
    report.proposal.fields[k] = built[k];
  });
}

const norm = (v) => (Array.isArray(v) ? v.slice().sort() : String(v === undefined || v === null ? '' : v).trim());
const rel = (p) => path.relative(ROOT, p);

// ── Main ─────────────────────────────────────────────────────────────────────

function main(argv) {
  const [cmd, file, id] = argv;
  if (!cmd || !file || ['check', 'apply', 'verify'].indexOf(cmd) === -1) {
    throw new Fatal('usage: import-lesson-drafts.js check|apply|verify <drafts.json> [<draft_id>]');
  }
  const drafts = readDrafts(file);
  const ctx = context();
  if (cmd === 'check') {
    return drafts.filter((d) => d.status === 'SUBMITTED')
      .map((d) => ({ draftId: d.draftId, lessonKey: d.lessonKey, issues: checkDraft(ctx, d).issues }));
  }
  const d = drafts.find((x) => x.draftId === id);
  if (!d) throw new Fatal('No draft ' + id + ' in ' + file + '.');
  if (d.kind !== 'EDIT') throw new Fatal(d.draftId + ' is a ' + d.kind + ' draft; this tool imports edits (phase 1).');
  if (['SUBMITTED', 'PROPOSED', 'RETURNED'].indexOf(d.status) === -1) {
    throw new Fatal(d.draftId + ' is ' + d.status + '; only a SUBMITTED draft (or one being revised) is imported.');
  }
  const c = checkDraft(ctx, d);
  if (c.issues.length) return { draftId: d.draftId, imported: false, issues: c.issues };
  const report = { draftId: d.draftId, lessonKey: d.lessonKey, applied: [], hand: [] };
  if (cmd === 'apply') apply(d, c.lesson.current, c.fields, report);
  rebuild();
  compare(ctx, d, c.fields, report);
  return report;
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n');
  } catch (e) {
    process.stderr.write((e instanceof Fatal ? e.message : e.stack) + '\n');
    process.exit(1);
  }
}

module.exports = { main, readDrafts, setSection, setLabelled, competencyLines };
