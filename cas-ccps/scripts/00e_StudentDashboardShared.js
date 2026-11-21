// =============================================================================
// FILE: 00e_StudentDashboardShared.js
// BOUND TO: Student Dashboard web app (cas-ccps:student-dashboard)
// PURPOSE: The Student Dashboard's share of what 00 held: the reflection questions on Submit, the student's terms panel, the Context doc and form snapshot lookups.
// Moved out of 00_SharedConfig.js on 2026-11-21 (structure audit 4.6): 00 is
// in all eight cas-ccps projects, and nothing outside this one calls these.
// Named 00c/00d/00e so it sits right after 00 and 00b; every reference to
// these is inside a function body, so load order does not matter.
// =============================================================================

const OUTSIDE_LESSONS_NOTE = {
  DECA: "You show this through DECA (meetings, events and competitions), not class lessons. Your teacher rates it.",
  WBL: "You show this through work-based learning (a job, internship or job shadow), not class lessons. Your teacher rates it.",
};

// A student's doc from StudentDocRegistry: { docId, docUrl, lastUpdatedAt }
// or null.
function studentContextDocFor_(ss, cfg, email) {
  const sheet = ss.getSheetByName(TABS.studentDocRegistry);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const want = String(email || "").trim().toLowerCase();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase() !== want) continue;
    return { docId: String(data[i][SDR_DOC_ID]).trim(), docUrl: String(data[i][SDR_DOC_URL]).trim(),
      lastUpdatedAt: data[i][SDR_LAST_UPDATED_AT] || null };
  }
  return null;
}

// What each dashboard's Terms panel explains: [word on screen, meaning].
const CAS_STUDENT_TERMS = [
  ["Competencies done", "Competencies in your course that your teacher has rated you able to do with limited supervision or better (1 to 3 on the state's 5-point scale), out of every competency in the course."],
  ["Competency rating", "Your teacher's rating of a competency on Virginia's 1 to 5 scale, where 1 is the highest: 1 Can teach others, 2 Without supervision, 3 Limited supervision, 4 With supervision, 5 Cannot perform. “Not rated yet” until your teacher decides."],
  ["Evidence", "What a checked piece of your work showed for a competency: Shown, Partly shown or Not shown yet. Each assignment counts once, at its best result, so an early draft doesn't count against you."],
  ["My Context", "What the system has gathered about your work, week by week: your checked assignments and your warm-up answers. The same document your teacher sees."],
  ["Submit for Feedback", "Sends what you wrote under “Your response” to be checked. Press it when you’re ready; you can submit again after you revise."],
  ["Do next", "The list at the top of your assignments: the ones waiting on you. Click one to jump to it."],
  ["Not started", "You haven’t submitted this one yet. Open your document, write under “Your response”, then press Submit for Feedback."],
  ["Waiting for feedback", "Your work is in line to be checked. Nothing to do yet: the card shows where it is, and this page shows your feedback when it's ready."],
  ["Being checked", "Your work is being read right now."],
  ["Passed ✓", "Your work meets the standard for this assignment. You can still improve it and submit again."],
  ["Revise", "Read the feedback, change your work, then press Submit for Feedback again."],
  ["Not yet", "The part of the assignment your last check didn’t find in your work yet. Start your revision there."],
  ["Turned in", "Your teacher is reviewing your work. Nothing to do yet."],
  ["Done ✓", "Your teacher confirmed this assignment."],
  ["Check stopped", "The check took too long and was stopped. Your work is saved. Press Try again on the card to put it back in line."],
  ["Couldn’t be checked", "Something went wrong on our side, not with your work. Tell your teacher."],
  ["Comments", "Your feedback appears as a comment on your document. Open the document and click the Comments button (top right). Resolving a comment doesn’t delete it."],
  ["Last submitted", "When you last pressed Submit for Feedback on this assignment."],
  ["Last checked", "When your work was last checked and given feedback."],
  ["Warm-up", "A short question at the start of class. Type your answer here and save it before the end of the day. Missed one? You can answer it late until the end of your next class day, for points but no feedback or extra credit."],
  ["Extra credit", "After a warm-up is checked, reply to its feedback in at least 10 words by the date shown (the end of your next class day) for an extra point."],
  ["Marking period", "Part of the school year. Use the menu at the top to see one marking period or the whole year."],
  ["Block and period", "When your class meets. 3-Odd and 3-Even are the two halves of period 3 that meet on alternate days."],
  ["My Info", "What the system has on file for you: your name, class, period and teacher. Tell your teacher if something is wrong."]
];

// formFileId -> snapshotDocId for every row (the dashboards' one read).
function formSnapshotDocIds_(ledgerSs) {
  const out = {};
  const sheet = ledgerSs ? ledgerSs.getSheetByName(FORM_SNAPSHOTS_TAB) : null;
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, FORM_SNAPSHOTS_HEADERS.length).getValues().forEach(function (r) {
    const f = String(r[FS.FORM_FILE_ID]).trim(), d = String(r[FS.SNAPSHOT_DOC_ID]).trim();
    if (f && d) out[f] = d;
  });
  return out;
}

// Plain words (2026-11-17): a frame no longer quotes its goal. The goal, a
// whole "I can" objective of about 25 words, sat inside the question, so a
// question ran 40 to 70 words and students stumbled on the wording, not the
// idea. Now the dashboard shows the goal on its own line ({goalLabel}:
// {goal}) and the question is one short ask. A frame with goal: true is
// about the question's competency; the rest have no goal line.
const REFLECTION_FRAMES = [
  { id: "E1", kind: "EVIDENCE", goal: true, text: "Which sentence or part of your work best shows this goal?" },
  { id: "E2", kind: "EVIDENCE", goal: true, text: "What in your work shows this goal? What would make it stronger?" },
  { id: "E3", kind: "EVIDENCE", goal: true, text: "Which one part of your work should your teacher check for this goal? Why?" },
  { id: "A1", kind: "APPROACH", text: "What did you do first in this assignment? Why start there?" },
  { id: "A2", kind: "APPROACH", text: "What did you leave out or cut? Why?" },
  { id: "A3", kind: "APPROACH", text: "What did you look back at in the lesson while you worked? How did it help?" },
  { id: "C1", kind: "CHOICE",   text: "What was the hardest choice in this assignment? What did you pick?" },
  { id: "C2", kind: "CHOICE",   text: "What would someone who disagrees with your work say? What would you tell them?" },
  { id: "C3", kind: "CHOICE",   text: "What is another way you could have done this? Why didn't you?" },
  // Phase 2 (archive/2026-27-Q2/meta/STUDENT_WORK_PLAN_2026-10.md, Appendix A, approved
  // 2026-10-24): a resubmission after the primary wasn't met.
  { id: "F1", kind: "FEEDBACK", goal: true, goalLabel: "Not shown yet", text: "What will you change to show this goal?" },
  { id: "F2", kind: "FEEDBACK", text: "What part of the feedback do you agree with most? What are you doing about it?" },
  { id: "F3", kind: "FEEDBACK", text: "Is there anything in the feedback you disagree with? What are you doing about the rest?" }
];

// A question as one line of text, its goal included, for where it is
// stored or read without the dashboard's layout: ReflectionLog's Question,
// Flow 2's prompt (37) and the reflection comment on the doc.
function reflectionQuestionText_(q) {
  return q && q.goal ? (q.goalLabel || "Goal") + ": " + q.goal + ". " + q.question : String((q && q.question) || "");
}

// The assignment's competencies from its TeacherMatrix row, primary first:
// [{ id, text }] for milestones 1 to 3 that carry a competency ID. The text
// is the student's own "I can" objective for it (approved 2026-10-24, the
// row's StudentObjectives), or the competency's title where there is none.
function reflectionCriteria_(matrixRow) {
  const out = [];
  if (!matrixRow) return out;
  const objectives = matrixRow.objectives || {};
  [1, 2, 3].forEach(function (n) {
    const id = String(matrixRow["milestone" + n + "CompetencyId"] || "").trim();
    const text = reflectionCriterionText_(objectives[id] || matrixRow["milestone" + n]);
    if (id && text) out.push({ id: id, text: text });
  });
  return out;
}

// A small, stable number from a string, so which Approach or Choice frame a
// first Submit gets varies by assignment but never between two calls.
function _reflectionHash_(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 100003;
  return h;
}

// The questions for this Submit. criteria: reflectionCriteria_(); prior:
// this student's earlier ReflectionLog rows for this assignment, as
// [{ frameId, kind, competencyId, submittedAt }]; key: the assignment's
// ConfigID (seeds the variety); shortfall: reflectionShortfall_(), the
// primary criterion when the last check found it not met yet, else null.
// Returns [{ frameId, kind, competencyId, question, goal, goalLabel }], one
// or two of them (goal "" when the frame has none):
// an Evidence question every time, plus an Approach or Choice question on a
// first Submit, or a Feedback question on a resubmission with a shortfall.
function chooseReflectionQuestions_(criteria, prior, key, shortfall) {
  criteria = criteria || [];
  prior = prior || [];
  const used = {};
  const submits = {};
  let evidenceAsked = 0;
  prior.forEach(function (p) {
    used[p.frameId] = (used[p.frameId] || 0) + 1;
    submits[String(p.submittedAt)] = true;
    if (p.kind === "EVIDENCE") evidenceAsked++;
  });
  const firstSubmit = Object.keys(submits).length === 0;
  const seed = _reflectionHash_(key);
  const pick = function (kind, offset) {
    const frames = REFLECTION_FRAMES.filter(function (f) { return f.kind === kind; });
    const start = (seed + offset) % frames.length;
    let best = null;
    for (let i = 0; i < frames.length; i++) {
      const f = frames[(start + i) % frames.length];
      if (!best || (used[f.id] || 0) < (used[best.id] || 0)) best = f;
    }
    return best;
  };
  const out = [];
  if (criteria.length) {
    const c = criteria[evidenceAsked % criteria.length];
    const f = pick("EVIDENCE", evidenceAsked);
    out.push({ frameId: f.id, kind: f.kind, competencyId: c.id, question: f.text, goal: c.text, goalLabel: f.goalLabel || "Goal" });
  }
  if (!firstSubmit && shortfall && criteria.length) {
    // F1 first (it names what fell short), then the least answered, in order.
    const f = REFLECTION_FRAMES.filter(function (x) { return x.kind === "FEEDBACK"; })
      .reduce(function (b, x) { return (used[x.id] || 0) < (used[b.id] || 0) ? x : b; });
    out.push({ frameId: f.id, kind: f.kind, competencyId: shortfall.id, question: f.text,
               goal: f.goal ? shortfall.text : "", goalLabel: f.goal ? (f.goalLabel || "Goal") : "" });
    return out;
  }
  if (firstSubmit || !criteria.length) {
    const kinds = seed % 2 === 0 ? ["APPROACH", "CHOICE"] : ["CHOICE", "APPROACH"];
    const wanted = criteria.length ? 1 : 2;
    for (let k = 0; k < wanted; k++) {
      const f = pick(kinds[k], 0);
      out.push({ frameId: f.id, kind: f.kind, competencyId: "", question: f.text, goal: "", goalLabel: "" });
    }
  }
  return out;
}

// The primary criterion ({ id, text }) when this student file's last check
// found it not met yet (MET is the only outcome that isn't a shortfall), or
// null: no check yet, the primary met, or the evidence unreadable. Read from
// CompetencyEvidence by header; the latest evaluated_at is the last check.
function reflectionShortfall_(ss, cfg, fileId, criteria) {
  if (!criteria || !criteria.length) return null;
  const sheet = ss.getSheetByName(TABS.competencyEvidence);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getDataRange().getValues();
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1 || iAt === -1) return null;
  const mine = rows.slice(1).filter(function (r) {
    return String(r[iFile]).trim() === fileId && (iArch === -1 || !String(r[iArch]).trim());
  });
  if (!mine.length) return null;
  const latest = Math.max.apply(null, mine.map(function (r) { return sheetTimestampMs_(r[iAt]) || 0; }));
  const primary = criteria[0];
  const last = mine.filter(function (r) {
    return (sheetTimestampMs_(r[iAt]) || 0) === latest && String(r[iComp]).trim() === primary.id;
  })[0];
  if (!last) return null;
  return String(last[iOut]).trim().toUpperCase() === "MET" ? null : primary;
}

// The TeacherMatrix row a student's workspace belongs to, read the way 37
// does (StudentAssignments, then MatrixRegistry by the teacher's email):
// { milestone1..3, milestone1CompetencyId..3 } or null. Here, not in 37,
// because the Student Dashboard project holds only 00, 13, 49 and 63.
function reflectionMatrixRow_(cfg, studentConfigId, teacherEmail) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let assignmentId = studentConfigId;
  const sa = ss.getSheetByName(TABS.studentAssignments); // 54's tab
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (String(r[0] || "").trim() === studentConfigId && String(r[2] || "").trim()) {
        assignmentId = String(r[2]).trim();
      }
    });
  }
  const reg = ss.getSheetByName(cfg.tabs.matrixRegistry);
  if (!reg) return null;
  const lower = String(teacherEmail || "").trim().toLowerCase();
  const regRow = reg.getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[1] || "").trim().toLowerCase() === lower && String(r[2] || "").trim();
  })[0];
  if (!regRow) return null;
  const tm = SpreadsheetApp.openById(String(regRow[2]).trim()).getSheetByName(TABS.teacherMatrix);
  if (!tm) return null;
  // TeacherMatrix columns: TM above.
  const row = tm.getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[TM.CONFIG_ID] || "").trim() === assignmentId;
  })[0];
  if (!row) return null;
  const at = function (n) { return String(row[n] || "").trim(); };
  let objectives = {};
  try { objectives = at(TM.STUDENT_OBJECTIVES) ? JSON.parse(at(TM.STUDENT_OBJECTIVES)) : {}; } catch (e) { objectives = {}; }
  return { milestone1: at(TM.MILESTONE_1), milestone2: at(TM.MILESTONE_2), milestone3: at(TM.MILESTONE_3),
           milestone1CompetencyId: at(TM.MILESTONE_1_COMPETENCY_ID),
           milestone2CompetencyId: at(TM.MILESTONE_2_COMPETENCY_ID),
           milestone3CompetencyId: at(TM.MILESTONE_3_COMPETENCY_ID),
           objectives: objectives };
}

// Appends one Submit's answers. Written as plain text, so an answer that
// starts with "=" stays words and never becomes a formula.
function appendReflections_(ss, cfg, rows) {
  if (!rows.length) return;
  const name = TABS.reflectionLog;
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, REFLECTION_LOG_HEADERS.length).setValues([REFLECTION_LOG_HEADERS]);
    sheet.setFrozenRows(1);
  }
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 2, rows.length, REFLECTION_LOG_HEADERS.length - 1).setNumberFormat("@");
  sheet.getRange(at, 1, rows.length, REFLECTION_LOG_HEADERS.length).setValues(rows);
}
