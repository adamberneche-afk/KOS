// =============================================================================
// FILE: 76_CoveredSoFar.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger), beside the
//   nightly lesson rollout (58) that calls it.
//
// PURPOSE (plan L6, decided 2026-11-02 and approved 2026-11-08): one
// "Covered So Far" Google Doc per course, for the teacher's course notebooks
// (Gemini, NotebookLM) to use as a source, so a notebook goes only as deep
// as what has been taught: the pacing sets the depth.
//
// WHAT IT HOLDS, per course, oldest first: each lesson taught so far, that
// is, each LessonSchedule row (55) with a start_date on or before today (the
// same rule the warm-up review uses for "taught so far"), with its start
// date, its number in teaching order (55b's LESSON_ORDER) and title, its
// objective, its "I can" goals, the competencies it assesses (with the
// state's wording where the lesson file has it) and those it also touches,
// its key concepts (vocabulary) and its parts (68). The lesson running now
// is marked as such. Then "Next up": the next dated lesson, or the next one
// in teaching order with no date yet. A held lesson (HOLD in LessonSchedule)
// is still taught on its dates, so it is listed like any other.
//
// WHERE IT COMES FROM. The LessonSchedule tab is the course's pacing guide
// since 2026-10-07 (the operator replaced the generated pacing-guide units,
// 31, with his own lessons and keeps their dates there). The RolloutLog tab
// (58) is not used: it starts when the rollout started, records docs made
// rather than lessons taught, and logs what a dry run would do. A lesson
// taught before its row had a date doesn't appear; the doc counts those
// (earlier lessons in teaching order with no start date) so they can be
// dated in LessonSchedule.
//
// WHEN. The nightly rollout (58) calls writeCoveredSoFar_() at the end of
// every run except a preview; the doc is rewritten only when its text
// changed (a lesson started, the next one was dated, a lesson file changed),
// so a notebook isn't told about a new version every night. The editor
// function refreshCoveredSoFar() rewrites both docs now.
//
// THE DOC. Made on the first run in the teacher folder (TEACHER_FOLDER_ID;
// My Drive without one), titled "Covered So Far — <course>", and rewritten in
// place after that: the same file ID every time, kept in the Script Property
// COVERED_SO_FAR_DOC_ID_<course> (never in the repo), like KOS_CAS_SIGNAL
// (34b). A doc in the trash is made again; one that can't be opened is an
// error (a PROBLEM row in the rollout), never silently replaced, since the
// notebook points at that file.
//
// FERPA: nothing about students. The only things read are the LessonSchedule
// tab (course, lesson, date, hold) and the lesson files in 55b.
// =============================================================================

const COVERED_TITLE_PREFIX = "Covered So Far — ";
const COVERED_DOC_PROP_PREFIX = "COVERED_SO_FAR_DOC_ID_";
const COVERED_HASH_PROP_PREFIX = "COVERED_SO_FAR_HASH_";
const COVERED_STEP = "COVERED_SO_FAR";

// Editor: rewrite every course's doc now, whether or not it changed.
function refreshCoveredSoFar() {
  const res = writeCoveredSoFar_({ force: true });
  res.forEach(function (r) {
    Logger.log("[S76] " + r.course + ": " + (r.error ? "not written: " + r.error :
      r.taught + " lesson(s) taught so far; doc " + (r.created ? "made" : "rewritten") + "."));
  });
  return res;
}

/**
 * Writes each course's Covered So Far doc when its text changed (or always,
 * with opts.force). opts.today (Date) for tests. One course failing doesn't
 * stop the other. Returns [{ course, taught, written, created, error }].
 */
function writeCoveredSoFar_(opts) {
  const o = opts || {};
  const today = formatDateYMD_(o.today || new Date());
  const props = PropertiesService.getScriptProperties();
  return schoolCourseCodes_().map(function (code) {
    const out = { course: code, taught: 0, written: false, created: false, error: "" };
    try {
      const content = coveredSoFarContent_(code, today);
      out.taught = content.taught;
      const text = content.lines.map(function (l) { return l.text; }).join("\n");
      const hash = String(_wupHash_(text));
      const hashKey = COVERED_HASH_PROP_PREFIX + code;
      const have = _covOpenDoc_(props, code);
      if (!o.force && have.doc && props.getProperty(hashKey) === hash) return out;
      const doc = have.doc || _covCreateDoc_(props, code, content.title);
      _covWriteBody_(doc, content.lines);
      doc.saveAndClose();
      props.setProperty(hashKey, hash);
      out.written = true;
      out.created = !have.doc;
    } catch (e) {
      out.error = e.message;
    }
    return out;
  });
}

/**
 * The doc's content for a course on a date (YYYY-MM-DD): { title, taught,
 * lines: [{ text, heading?, item? }] }. heading: 1 or 2; item: a bullet.
 */
function coveredSoFarContent_(code, today) {
  const order = (typeof LESSON_ORDER !== "undefined" && LESSON_ORDER[code]) || [];
  const rows = _lsRows_()[code] || [];
  const taught = rows.filter(function (r) { return r.start <= today; });
  const later = rows.filter(function (r) { return r.start > today; });
  const first = LESSON_ASSIGNMENTS[order[0]] || (taught[0] && LESSON_ASSIGNMENTS[taught[0].key]);
  const courseName = first && first.courseName ? first.courseName : code;
  const title = COVERED_TITLE_PREFIX + courseName;
  const lines = [{ text: title }];
  const add = function (text, extra) { lines.push(Object.assign({ text: text }, extra || {})); };

  add("What this course has taught so far, lesson by lesson, from the teacher's LessonSchedule (the course's " +
    "pacing) and the lesson files. Use it to keep explanations, examples and questions at the depth taught so " +
    "far: go no deeper than these lessons' goals and concepts, and treat \"Next up\" as not yet taught.");
  if (!taught.length) {
    add("Nothing yet: no lesson in LessonSchedule has a start date on or before " + today + ".");
  } else {
    add("Taught so far: " + taught.length + (taught.length === 1 ? " lesson" : " lessons") + ", the latest starting " +
      taught[taught.length - 1].start + ".");
  }
  // Lessons earlier in teaching order than the first dated one, with no date.
  const dated = {};
  rows.forEach(function (r) { dated[r.key] = true; });
  const firstAt = taught.length ? order.indexOf(taught[0].key) : -1;
  const undated = firstAt > 0 ? order.slice(0, firstAt).filter(function (k) { return !dated[k]; }).length : 0;
  if (undated) {
    add(undated + (undated === 1 ? " earlier lesson" : " earlier lessons") + " in teaching order " +
      (undated === 1 ? "has" : "have") + " no start date in LessonSchedule and " + (undated === 1 ? "is" : "are") +
      " not listed; date " + (undated === 1 ? "it" : "them") + " there to include " + (undated === 1 ? "it" : "them") + ".");
  }

  if (taught.length) add("Lessons taught", { heading: 1 });
  taught.forEach(function (r, i) {
    const a = LESSON_ASSIGNMENTS[r.key];
    const now = i === taught.length - 1;
    add(r.start + " · " + _covLessonName_(order, r.key) + (now ? " (being taught now)" : ""), { heading: 2 });
    _covLessonLines_(a).forEach(function (l) { lines.push(l); });
  });

  add("Next up", { heading: 1 });
  if (later.length) {
    add(later[0].start + " · " + _covLessonName_(order, later[0].key) + " (not taught yet)");
  } else {
    const lastAt = taught.length ? order.indexOf(taught[taught.length - 1].key) : -1;
    const next = order.slice(lastAt + 1).filter(function (k) { return !dated[k]; })[0];
    add(next ? _covLessonName_(order, next) + " (not dated yet; not taught yet)" : "No later lesson in the course.");
  }
  return { title: title, taught: taught.length, lines: lines };
}

// "Lesson 6: L06 SKILL DEVELOPMENT PLAN": its number in teaching order.
function _covLessonName_(order, key) {
  const a = LESSON_ASSIGNMENTS[key];
  const n = order.indexOf(key);
  return (n === -1 ? "" : "Lesson " + (n + 1) + ": ") + (a ? a.unitName : key);
}

// A lesson's goals, competencies, key concepts and parts, as the lesson file
// (55b) has them. A field the lesson doesn't have is left out.
function _covLessonLines_(a) {
  const out = [];
  if (!a) return out;
  const text = function (t, extra) { out.push(Object.assign({ text: t }, extra || {})); };
  const objective = String(a.objective || "").trim();
  if (objective) text("Objective: " + objective);
  const goals = a.objectives ? Object.keys(a.objectives).map(function (id) { return String(a.objectives[id] || "").trim(); })
    .filter(Boolean) : [];
  if (goals.length) {
    text("Learning goals:");
    goals.forEach(function (g) { text(g, { item: true }); });
  }
  const assessed = (a.milestones || []).filter(function (m, i) { return (a.milestoneCompetencyIds || [])[i]; });
  if (assessed.length) {
    text("Competencies assessed:");
    assessed.forEach(function (m) { text(m, { item: true }); });
  }
  const assessedIds = (a.milestoneCompetencyIds || []).filter(Boolean);
  const also = (a.competencyIds || []).filter(function (id) { return assessedIds.indexOf(id) === -1; });
  if (also.length) text("Also touches competencies: " + also.join(", "));
  const vocab = String(a.vocabulary || "").trim();
  if (vocab) text("Key concepts: " + vocab);
  const parts = typeof LESSON_PARTS !== "undefined" && LESSON_PARTS[a.key] ? LESSON_PARTS[a.key] : [];
  if (parts.length) {
    text("Parts: " + parts.map(function (p) {
      const name = String(p.unitName || "");
      const at = name.lastIndexOf(" — ");
      return at === -1 ? name : name.slice(at + 3);
    }).join("; "));
  }
  return out;
}

// { doc } for the course's doc, or { doc: null } when there is none yet or
// it is in the trash. A doc that can't be opened throws instead of being
// replaced: the notebook points at this file, and a passing Drive error must
// not leave it on a copy nobody rewrites. Deleting the Script Property
// starts the course's doc over.
function _covOpenDoc_(props, code) {
  const id = props.getProperty(COVERED_DOC_PROP_PREFIX + code);
  if (!id) return { doc: null };
  let file;
  try {
    file = DriveApp.getFileById(id);
  } catch (e) {
    throw new Error("the doc in " + COVERED_DOC_PROP_PREFIX + code + " can't be opened (" + e.message +
      "); delete that Script Property to make a new one");
  }
  if (file.isTrashed()) return { doc: null };
  return { doc: DocumentApp.openById(id) };
}

function _covCreateDoc_(props, code, title) {
  const doc = DocumentApp.create(title);
  const cfg = getConfig_();
  if (cfg.teacherFolderId) {
    try {
      DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(cfg.teacherFolderId));
    } catch (e) {
      Logger.log("[S76] The teacher folder couldn't be opened; the " + code + " doc stays in My Drive.");
    }
  }
  props.setProperty(COVERED_DOC_PROP_PREFIX + code, doc.getId());
  return doc;
}

function _covWriteBody_(doc, lines) {
  const body = doc.getBody();
  // A cleared body keeps one empty paragraph: the title goes into it.
  body.clear();
  body.setText(lines[0].text);
  lines.slice(1).forEach(function (l) {
    if (l.item) {
      body.appendListItem(l.text);
      return;
    }
    const p = body.appendParagraph(l.text);
    if (l.heading === 1) p.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    else if (l.heading === 2) p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
    else p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  });
}
