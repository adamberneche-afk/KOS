// =============================================================================
// FILE: 65_LessonDrafts.js
// BOUND TO: Teacher Dashboard standalone web app (cas-ccps:teacher-dashboard)
//
// PURPOSE: lesson editing from the Teacher Dashboard, phase 1 of
// meta/LESSON_AUTHORING_PLAN_2026-10.md (decided 2026-10-21). The teacher
// edits a lesson's fields in the 📅 Lessons panel; each edit is a draft row
// in the Central Ledger's LessonDrafts tab. Nothing here changes a lesson:
// an import (an agent session, by hand or on the evening Routine) turns a
// SUBMITTED draft into repo files on a branch, writes a proposal back, and
// the teacher who submitted it accepts it or returns it. Only an accepted
// draft is merged and pushed.
//
//   DRAFT -> SUBMITTED -> PROPOSED -> ACCEPTED -> MERGED
//                ^            |
//                +- RETURNED <+        (and WITHDRAWN, from DRAFT or RETURNED)
//
// The lesson's current fields come from LESSON_ASSIGNMENTS (55b, the same
// generated file the Central Ledger runs on, so the form starts from what
// students get). Its tiers are read back from the milestones: the first
// milestone competency is the primary, the rest the secondary, and
// tertiaryCompetencyIds the tertiary (true of all 67 lessons, 2026-10-21).
// The student task is shown without the checklist the builder adds from the
// tiers ("What your work needs to show:", before "Submission:"), so a tier
// edit doesn't read as a task edit; the builder writes it back.
// The VDOE cross-reference is the CompetencyRubrics tab (32's
// _loadAllRubrics_): each task's text, duty area, demonstration standard,
// indicators and skill questions.
//
// A draft is submitted only when every required field is filled and the
// tiers pass the builder's own rules (build-lesson-assignments.js): the
// primary and 1-2 secondaries are competencies the lesson lists, every
// listed competency has a tier, and each is a task of the lesson's course.
// The import checks the same again.
//
// NEW LESSONS (phase 2, 2026-10-21): a NEW draft starts empty, for one
// course. It needs a title, objective, activity, the student task or a brief
// for it, a warm-up anchor, vocabulary, and competencies with a tier each; it
// takes the next free 8175 lesson number, or an 8177 key made from its title
// as the builder makes one. The import writes the lesson files.
//
// ACCESS: teacher-only (_isAuthorizedTeacher_, 07); a proposal is reviewed
// only by the account that submitted the draft. FERPA: lesson text is
// teacher-level; a field that holds an email address is refused, and the
// import runs the student-data scan.
// =============================================================================

const LD_TAB = "LessonDrafts";
const LD_HEADERS = [
  "draft_id", "kind", "course", "lesson_key", "status", "submitted_by", "created_at", "updated_at",
  "fields_json", "original_json", "reason", "missing", "proposal_json", "proposal_note", "pr_url", "review_note",
];
const LD = {};
LD_HEADERS.forEach(function (h, i) { LD[h.toUpperCase()] = i; });

const LD_TEXT_FIELDS = ["promptText", "warmupAnchor", "objective", "vocabulary", "title", "activity", "brief"];
const LD_NEW_REQUIRED = ["title", "objective", "activity", "warmupAnchor", "vocabulary"];
const LD_COURSES = ["8175", "8177"];
const LD_REQUIRED_TEXT = ["promptText", "warmupAnchor", "objective"];
const LD_FIELD_LABELS = {
  promptText: "Student task", warmupAnchor: "Warm-up anchor", objective: "Objective", vocabulary: "Vocabulary",
  competencyIds: "Competencies", primary: "Primary competency", secondary: "Secondary competencies",
  tertiary: "Tertiary competencies", title: "Title", activity: "Activity (what students do in class)",
  brief: "Brief for the student task (if you leave the task for the import to draft)",
};
const LD_EDIT_FIELDS = ["promptText", "warmupAnchor", "objective", "vocabulary", "competencyIds", "primary",
  "secondary", "tertiary"];
const LD_MAX_TEXT = 20000;
const LD_EDITABLE = ["DRAFT", "RETURNED"];
const LD_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// ── Reads ────────────────────────────────────────────────────────────────────

/** The editor for one lesson: its current fields, the course's VDOE tasks, coverage, and its open draft. */
function getLessonEditor(lessonKey) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  let key = String(lessonKey || "").trim();
  if (/^LD-/.test(key)) { // a draft's id: a NEW draft opens as itself, an edit as its lesson
    const d = _ldFind_(cfg, key);
    if (!d) return { success: false, error: "No draft " + key + "." };
    if (d.kind === "NEW") return _ldNewEditor_(d.course, d);
    key = d.lessonKey;
  }
  const lesson = _ldLesson_(key);
  if (!lesson) return { success: false, error: "No lesson " + key + " in this deployment's lesson data." };
  const catalog = _ldCatalog_(lesson.course);
  const open = _ldRows_(cfg).filter(function (d) {
    return d.lessonKey === key && ["MERGED", "WITHDRAWN"].indexOf(d.status) === -1;
  }).pop() || null;
  return {
    success: true,
    lesson: lesson,
    catalog: catalog.list,
    catalogAvailable: catalog.available,
    uncovered: _ldUncovered_(lesson.course, catalog.list),
    draft: open ? _ldView_(open, catalog) : null,
    labels: LD_FIELD_LABELS,
  };
}

/** An empty editor for a new lesson in one course. */
function getNewLessonEditor(course) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  if (LD_COURSES.indexOf(String(course)) === -1) return { success: false, error: "No course " + course + "." };
  return _ldNewEditor_(String(course), null);
}

function _ldNewEditor_(course, d) {
  const catalog = _ldCatalog_(course);
  return {
    success: true, isNew: true,
    lesson: { key: d ? d.lessonKey : "", course: course, title: d && d.fields.title ? d.fields.title : "New " + course + " lesson",
      source: "", current: _ldEmpty_() },
    catalog: catalog.list, catalogAvailable: catalog.available, uncovered: _ldUncovered_(course, catalog.list),
    draft: d ? _ldView_(d, catalog) : null, labels: LD_FIELD_LABELS,
  };
}

/** Every draft not withdrawn, newest first, as summaries for the panel. */
function listLessonDrafts() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const drafts = _ldRows_(cfg).filter(function (d) { return d.status !== "WITHDRAWN"; })
    .sort(function (a, b) { return a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0; })
    .map(function (d) {
      const l = _ldLesson_(d.lessonKey);
      const name = d.kind === "NEW" ? (d.fields.title || "Untitled") + " (new)" : (l ? l.title : d.lessonKey);
      return { draftId: d.draftId, kind: d.kind, lessonKey: d.lessonKey, lesson: name, course: d.course,
        status: d.status, updatedAt: d.updatedAt, prUrl: d.prUrl, missing: d.missing };
    });
  return { success: true, drafts: drafts };
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Saves the form as a DRAFT (a new one, or the lesson's open DRAFT or
 * RETURNED one). payload: { lessonKey, fields, reason }. Returns the draft,
 * with what is still missing; saving never needs it complete.
 */
function saveLessonDraft(payload) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  const p = payload || {};
  if (p.kind === "NEW") return _ldSaveNew_(cfg, p);
  const lesson = _ldLesson_(String(p.lessonKey || "").trim());
  if (!lesson) return { success: false, error: "No lesson " + p.lessonKey + " in this deployment's lesson data." };
  const fields = _ldCleanFields_(p.fields || {});
  const email = _ldEmailIn_(fields, p.reason);
  if (email) return { success: false, error: email };
  return _ldWithLock_(function () {
    const sheet = _ldSheet_(cfg);
    const rows = _ldRows_(cfg);
    const now = new Date();
    let d = rows.filter(function (r) {
      return r.lessonKey === lesson.key && ["MERGED", "WITHDRAWN"].indexOf(r.status) === -1;
    }).pop();
    if (d && LD_EDITABLE.indexOf(d.status) === -1) {
      return { success: false, error: "This lesson's draft is " + d.status + "; it can't change until the import " +
        "and your review are done." };
    }
    const catalog = _ldCatalog_(lesson.course);
    const check = _ldCheck_(lesson, fields, String(p.reason || ""), catalog);
    const values = {
      kind: "EDIT", course: lesson.course, lesson_key: lesson.key, status: "DRAFT",
      submitted_by: Session.getActiveUser().getEmail(), updated_at: now,
      fields_json: JSON.stringify(fields), original_json: JSON.stringify(lesson.current),
      reason: sheetSafeText_(String(p.reason || "").trim()), missing: check.issues.join("; "),
    };
    if (!d) {
      values.draft_id = "LD-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" +
        Math.floor(Math.random() * 1e4);
      values.created_at = now;
      sheet.appendRow(LD_HEADERS.map(function (h) { return values[h] !== undefined ? values[h] : ""; }));
    } else {
      _ldWrite_(sheet, d.sheetRow, values);
    }
    SpreadsheetApp.flush();
    const saved = _ldRows_(cfg).filter(function (r) { return r.lessonKey === lesson.key; }).pop();
    return { success: true, draft: _ldView_(saved, catalog) };
  });
}

// A NEW draft is found by its id (an 8177 key follows the title, so it can
// change between saves).
function _ldSaveNew_(cfg, p) {
  const course = String(p.course || "").trim();
  if (LD_COURSES.indexOf(course) === -1) return { success: false, error: "No course " + course + "." };
  const fields = _ldCleanFields_(p.fields || {});
  const email = _ldEmailIn_(fields, p.reason);
  if (email) return { success: false, error: email };
  return _ldWithLock_(function () {
    const sheet = _ldSheet_(cfg);
    const rows = _ldRows_(cfg);
    const now = new Date();
    let d = null;
    if (p.draftId) {
      d = rows.filter(function (r) { return r.draftId === String(p.draftId).trim(); })[0] || null;
      if (!d || d.kind !== "NEW") return { success: false, error: "No new-lesson draft " + p.draftId + "." };
      if (LD_EDITABLE.indexOf(d.status) === -1) {
        return { success: false, error: "This draft is " + d.status + "; it can't change until the import and your review are done." };
      }
    }
    const others = rows.filter(function (r) { return !d || r.draftId !== d.draftId; });
    const key = _ldNewKey_(course, fields.title, d ? d.lessonKey : "", others);
    const values = {
      kind: "NEW", course: course, lesson_key: key, status: "DRAFT",
      submitted_by: Session.getActiveUser().getEmail(), updated_at: now,
      fields_json: JSON.stringify(fields), original_json: "{}",
      reason: sheetSafeText_(String(p.reason || "").trim()),
      missing: _ldCheckNew_(course, key, fields, _ldCatalog_(course), others).issues.join("; "),
    };
    let id = d ? d.draftId : "";
    if (!d) {
      id = "LD-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss") + "-" + Math.floor(Math.random() * 1e4);
      values.draft_id = id;
      values.created_at = now;
      sheet.appendRow(LD_HEADERS.map(function (h) { return values[h] !== undefined ? values[h] : ""; }));
    } else {
      _ldWrite_(sheet, d.sheetRow, values);
    }
    SpreadsheetApp.flush();
    return { success: true, draft: _ldView_(_ldFind_(cfg, id), _ldCatalog_(course)) };
  });
}

// 8175: the next lesson number no lesson or open draft has. 8177: the
// builder's slug of the title (lessons/8177/<slug>.md).
function _ldNewKey_(course, title, keep, otherDrafts) {
  const open = otherDrafts.filter(function (r) { return ["MERGED", "WITHDRAWN"].indexOf(r.status) === -1; })
    .map(function (r) { return r.lessonKey; });
  if (course === "8175") {
    if (keep) return keep;
    let n = 0;
    Object.keys(LESSON_ASSIGNMENTS).concat(open).forEach(function (k) {
      const m = /^8175-L(\d+)$/.exec(k);
      if (m) n = Math.max(n, Number(m[1]));
    });
    return "8175-L" + String(n + 1).padStart(2, "0");
  }
  const slug = String(title || "").toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return "8177-" + (slug || "untitled");
}

/** SUBMITTED, but only with every required field and tiers that pass; otherwise the list of what to fix. */
function submitLessonDraft(draftId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _ldWithLock_(function () {
    const d = _ldFind_(cfg, draftId);
    if (!d) return { success: false, error: "No draft " + draftId + "." };
    if (d.status !== "DRAFT") return { success: false, error: "Only a saved draft can be submitted (this one is " + d.status + ")." };
    const catalog = _ldCatalog_(d.course);
    const check = _ldCheckDraft_(d, catalog, _ldRows_(cfg));
    const sheet = _ldSheet_(cfg);
    _ldWrite_(sheet, d.sheetRow, { missing: check.issues.join("; "), updated_at: new Date() });
    if (check.issues.length) {
      SpreadsheetApp.flush();
      return { success: false, error: "Not submitted. Fix these first.", issues: check.issues,
        draft: _ldView_(_ldFind_(cfg, draftId), catalog) };
    }
    _ldWrite_(sheet, d.sheetRow, { status: "SUBMITTED" });
    SpreadsheetApp.flush();
    return { success: true, draft: _ldView_(_ldFind_(cfg, draftId), catalog) };
  });
}

/** The submitter's review of a PROPOSED draft: accept it, or return it with a note. */
function reviewLessonProposal(draftId, accept, note) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _ldWithLock_(function () {
    const d = _ldFind_(cfg, draftId);
    if (!d) return { success: false, error: "No draft " + draftId + "." };
    if (d.status !== "PROPOSED") return { success: false, error: "There is no proposal to review (the draft is " + d.status + ")." };
    const me = String(Session.getActiveUser().getEmail() || "").toLowerCase();
    if (me !== d.submittedBy.toLowerCase()) {
      return { success: false, error: "Only the account that submitted this draft can review its proposal." };
    }
    const text = String(note || "").trim();
    if (!accept && !text) return { success: false, error: "Say what to change when you return a proposal." };
    if (LD_EMAIL_RE.test(text)) return { success: false, error: "The note holds an email address; leave it out." };
    _ldWrite_(_ldSheet_(cfg), d.sheetRow, {
      status: accept ? "ACCEPTED" : "RETURNED", review_note: sheetSafeText_(text), updated_at: new Date(),
    });
    SpreadsheetApp.flush();
    return { success: true, draft: _ldView_(_ldFind_(cfg, draftId), _ldCatalog_(d.course)) };
  });
}

/** Withdraws a DRAFT or RETURNED draft; the row stays, marked WITHDRAWN. */
function withdrawLessonDraft(draftId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
  return _ldWithLock_(function () {
    const d = _ldFind_(cfg, draftId);
    if (!d) return { success: false, error: "No draft " + draftId + "." };
    if (LD_EDITABLE.indexOf(d.status) === -1) return { success: false, error: "A " + d.status + " draft can't be withdrawn here." };
    _ldWrite_(_ldSheet_(cfg), d.sheetRow, { status: "WITHDRAWN", updated_at: new Date() });
    SpreadsheetApp.flush();
    return { success: true };
  });
}

// ── The required-field and tier check (the import repeats it) ────────────────

/** { issues: [] }: what stops a draft being submitted, in the teacher's words. */
function _ldCheck_(lesson, fields, reason, catalog) {
  const issues = [];
  if (!lesson) return { issues: ["The lesson isn't in this deployment's lesson data."] };
  const f = fields || {};
  LD_REQUIRED_TEXT.forEach(function (k) {
    if (!String(f[k] || "").trim()) issues.push(LD_FIELD_LABELS[k] + " is empty.");
  });
  if (!String(reason || "").trim()) issues.push("Say why the lesson is changing (Reason).");
  const changed = LD_EDIT_FIELDS.filter(function (k) {
    return JSON.stringify(_ldNorm_(f[k])) !== JSON.stringify(_ldNorm_(lesson.current[k]));
  });
  if (!changed.length) issues.push("Nothing is changed from the current lesson.");

  return { issues: issues.concat(_ldTierIssues_(lesson.course, f, catalog))
    .filter(function (x, i, a) { return a.indexOf(x) === i; }) };
}

/** Required fields for a NEW draft, its key, and the same competency and tier rules. */
function _ldCheckNew_(course, key, fields, catalog, otherDrafts) {
  const f = fields || {};
  const issues = [];
  LD_NEW_REQUIRED.forEach(function (k) {
    if (!String(f[k] || "").trim()) issues.push(LD_FIELD_LABELS[k].replace(/ \(.*$/, "") + " is empty.");
  });
  if (!String(f.promptText || "").trim() && !String(f.brief || "").trim()) {
    issues.push("Write the student task, or a brief for the import to draft it from.");
  }
  if (typeof LESSON_ASSIGNMENTS !== "undefined" && LESSON_ASSIGNMENTS[key]) {
    issues.push("A lesson " + key + " already exists; give the new one another title.");
  }
  if (key === "8177-untitled") issues.push("Title is empty.");
  (otherDrafts || []).forEach(function (r) {
    if (r.lessonKey === key && ["MERGED", "WITHDRAWN"].indexOf(r.status) === -1) {
      issues.push("Another open draft is for " + key + "; give this one another title.");
    }
  });
  return { issues: issues.concat(_ldTierIssues_(course, f, catalog)).filter(function (x, i, a) { return a.indexOf(x) === i; }) };
}

/** The check that fits the draft's kind. */
function _ldCheckDraft_(d, catalog, rows) {
  if (d.kind === "NEW") {
    return _ldCheckNew_(d.course, d.lessonKey, d.fields, catalog,
      (rows || []).filter(function (r) { return r.draftId !== d.draftId; }));
  }
  return _ldCheck_(_ldLesson_(d.lessonKey), d.fields, d.reason, catalog);
}

/** The builder's competency and tier rules, in the teacher's words. */
function _ldTierIssues_(course, f, catalog) {
  const issues = [];
  const ids = f.competencyIds || [];
  if (!ids.length) issues.push("Pick at least one competency.");
  const seen = {};
  ids.forEach(function (id) {
    if (seen[id]) issues.push(id + " is listed twice.");
    seen[id] = true;
    if (id.indexOf(course + "-") !== 0) issues.push(id + " is not a " + course + " task.");
    else if (catalog.available && !catalog.byId[id]) issues.push(id + " is not in the VDOE task list (CompetencyRubrics).");
  });
  const inLesson = function (id) { return ids.indexOf(id) !== -1; };
  if (!f.primary) issues.push("Choose a primary competency.");
  else if (!inLesson(f.primary)) issues.push("The primary competency " + f.primary + " isn't one the lesson lists.");
  const sec = f.secondary || [];
  if (sec.length < 1 || sec.length > 2) issues.push("Choose 1 or 2 secondary competencies.");
  sec.forEach(function (id) {
    if (!inLesson(id)) issues.push("The secondary competency " + id + " isn't one the lesson lists.");
    if (id === f.primary) issues.push(id + " can't be both primary and secondary.");
  });
  const ter = f.tertiary || [];
  ter.forEach(function (id) {
    if (!inLesson(id)) issues.push("The tertiary competency " + id + " isn't one the lesson lists.");
    if (id === f.primary || sec.indexOf(id) !== -1) issues.push(id + " has two tiers.");
  });
  ids.forEach(function (id) {
    if (id !== f.primary && sec.indexOf(id) === -1 && ter.indexOf(id) === -1) issues.push(id + " has no tier.");
  });
  LD_TEXT_FIELDS.forEach(function (k) {
    if (String(f[k] || "").length > LD_MAX_TEXT) issues.push(LD_FIELD_LABELS[k] + " is longer than " + LD_MAX_TEXT + " characters.");
  });
  return issues;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A lesson from LESSON_ASSIGNMENTS (55b), with its editable fields and tiers. */
function _ldLesson_(key) {
  const a = (typeof LESSON_ASSIGNMENTS !== "undefined" && LESSON_ASSIGNMENTS[key]) || null;
  if (!a) return null;
  const tiered = (a.milestoneCompetencyIds || []).filter(Boolean);
  return {
    key: a.key, course: String(a.code), title: a.unitName, source: a.source, approved: !!a.approved,
    current: {
      promptText: _ldTaskText_(a.promptText), warmupAnchor: String(a.warmupAnchor || ""),
      // An 8177 objective is its plan's first numbered line; shown without the number.
      objective: String(a.objective || "").replace(/^\d+\.\s+/, ""), vocabulary: String(a.vocabulary || ""),
      competencyIds: (a.competencyIds || []).slice(),
      primary: tiered[0] || "", secondary: tiered.slice(1), tertiary: (a.tertiaryCompetencyIds || []).slice(),
    },
  };
}

function _ldEmpty_() {
  return { promptText: "", warmupAnchor: "", objective: "", vocabulary: "", title: "", activity: "", brief: "",
    competencyIds: [], primary: "", secondary: [], tertiary: [] };
}

/** A built student task without the generated tier checklist. */
function _ldTaskText_(promptText) {
  return String(promptText || "")
    .replace(/\n\nWhat your work needs to show:\n\n[\s\S]*?(?=\n\nSubmission:\s*\n|$)/, "").trim();
}

/** The course's VDOE tasks from the CompetencyRubrics tab, in task order. */
function _ldCatalog_(course) {
  let all = null;
  try { all = _loadAllRubrics_(); } catch (e) { all = null; }
  const list = [];
  const byId = {};
  Object.keys(all || {}).forEach(function (id) {
    const r = all[id];
    if (String(r.course) !== String(course) && id.indexOf(course + "-") !== 0) return;
    const item = { id: id, task: r.task_number, text: r.competency_text, dutyArea: r.duty_area,
      standard: r.demonstration_standard, indicators: r.demonstration_indicators || [],
      questions: r.skill_questions || [] };
    list.push(item);
    byId[id] = item;
  });
  list.sort(function (a, b) { return (a.task || 0) - (b.task || 0); });
  return { available: !!all, list: list, byId: byId };
}

/** The course's tasks no lesson lists (the coverage view). */
function _ldUncovered_(course, catalogList) {
  const covered = {};
  Object.keys(typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS : {}).forEach(function (k) {
    const a = LESSON_ASSIGNMENTS[k];
    if (String(a.code) === String(course)) (a.competencyIds || []).forEach(function (id) { covered[id] = true; });
  });
  return catalogList.filter(function (c) { return !covered[c.id]; }).map(function (c) { return c.id; });
}

function _ldCleanFields_(f) {
  const out = {};
  LD_TEXT_FIELDS.forEach(function (k) { out[k] = String(f[k] === undefined || f[k] === null ? "" : f[k]).replace(/\r\n/g, "\n").trim(); });
  const list = function (v) {
    return (Array.isArray(v) ? v : String(v || "").split(","))
      .map(function (x) { return String(x).trim(); }).filter(Boolean);
  };
  out.competencyIds = list(f.competencyIds);
  out.primary = String(f.primary || "").trim();
  out.secondary = list(f.secondary);
  out.tertiary = list(f.tertiary);
  return out;
}

function _ldEmailIn_(fields, reason) {
  const texts = LD_TEXT_FIELDS.map(function (k) { return fields[k]; }).concat([reason]);
  return texts.some(function (t) { return LD_EMAIL_RE.test(String(t || "")); })
    ? "A field holds an email address. Lesson text never names a student or their account; remove it and save again."
    : "";
}

function _ldNorm_(v) {
  if (Array.isArray(v)) return v.slice().sort();
  return String(v === undefined || v === null ? "" : v).trim();
}

function _ldSheet_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let sheet = ss.getSheetByName(LD_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LD_TAB);
    sheet.getRange(1, 1, 1, LD_HEADERS.length).setValues([LD_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _ldRows_(cfg) {
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(LD_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, LD_HEADERS.length).getValues().map(function (r, i) {
    const json = function (v) { try { return JSON.parse(String(v || "")) || null; } catch (e) { return null; } };
    const when = function (v) {
      const t = sheetTimestampMs_(v);
      return isNaN(t) ? "" : new Date(t).toISOString();
    };
    return {
      sheetRow: i + 2, draftId: String(r[LD.DRAFT_ID]).trim(), kind: String(r[LD.KIND]).trim(),
      course: String(r[LD.COURSE]).trim(), lessonKey: String(r[LD.LESSON_KEY]).trim(),
      status: String(r[LD.STATUS]).trim(), submittedBy: String(r[LD.SUBMITTED_BY]).trim(),
      createdAt: when(r[LD.CREATED_AT]), updatedAt: when(r[LD.UPDATED_AT]),
      fields: json(r[LD.FIELDS_JSON]) || {}, original: json(r[LD.ORIGINAL_JSON]) || {},
      reason: String(r[LD.REASON] || ""), missing: String(r[LD.MISSING] || ""),
      proposal: json(r[LD.PROPOSAL_JSON]), proposalNote: String(r[LD.PROPOSAL_NOTE] || ""),
      prUrl: String(r[LD.PR_URL] || ""), reviewNote: String(r[LD.REVIEW_NOTE] || ""),
    };
  }).filter(function (d) { return d.draftId; });
}

function _ldFind_(cfg, draftId) {
  const id = String(draftId || "").trim();
  return _ldRows_(cfg).filter(function (d) { return d.draftId === id; })[0] || null;
}

function _ldWrite_(sheet, row, values) {
  Object.keys(values).forEach(function (h) {
    const col = LD[h.toUpperCase()];
    if (col === undefined) return;
    sheet.getRange(row, col + 1).setValue(values[h]);
  });
}

function _ldView_(d, catalog) {
  if (!d) return null;
  const issues = d.kind === "NEW" || _ldLesson_(d.lessonKey)
    ? _ldCheckDraft_(d, catalog || _ldCatalog_(d.course), null).issues : [];
  return {
    draftId: d.draftId, kind: d.kind, lessonKey: d.lessonKey, course: d.course, status: d.status, fields: d.fields,
    original: d.original, reason: d.reason, issues: issues, proposal: d.proposal, proposalNote: d.proposalNote,
    prUrl: d.prUrl, reviewNote: d.reviewNote, updatedAt: d.updatedAt,
    canEdit: LD_EDITABLE.indexOf(d.status) !== -1, canSubmit: d.status === "DRAFT" && !issues.length,
    canReview: d.status === "PROPOSED" &&
      String(Session.getActiveUser().getEmail() || "").toLowerCase() === d.submittedBy.toLowerCase(),
  };
}

function _ldWithLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: "Another change is being saved; try again." };
  }
  try {
    return fn.call(null); // .call: gas-lint reads a bare fn() as an undefined global
  } finally {
    lock.releaseLock();
  }
}
