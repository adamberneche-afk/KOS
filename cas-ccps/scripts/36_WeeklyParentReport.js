// =============================================================================
// FILE: 36_WeeklyParentReport.js
// BOUND TO: Central Ledger spreadsheet
// INCLUDE IN: cas-ccps:central-ledger, cas-ccps:teacher-dashboard
// PURPOSE: Assembles a weekly, per-student progress report the teacher
//          copies and emails to a family from their own account, and
//          records when each was copied. KOS writes the report; it never
//          sends it (decision D1, the operator, 2026-10-23).
//
// ── WHY THIS FILE IS IN TWO PROJECTS ────────────────────────────────────────
// The data lives on the Central Ledger; the review-and-send UI lives in the
// Teacher Dashboard, which is a separate Apps Script project. Rather than
// duplicate the assembly logic, this file is listed under both projects in
// tools/gas-lint/project-map.json — the same arrangement 00_SharedConfig.js,
// 22_LessonContextHandler.js, 23_StudentProfileManager.js,
// 26_CompetencyAlignmentLog.js, 29_StudentContextAggregator.js and
// 31_PacingGuideManager.js already use.
//
// The consequence, and it is a hard constraint: this file may call only
// functions that exist in BOTH projects. In practice that means
// 00_SharedConfig.js and 29_StudentContextAggregator.js. It must NOT call
// anything in 30_SCRSuggestionEngine.js, which is bound to central-ledger
// only — that file's own header calls such a call "a real, silent
// cross-project bug." Reading a *sheet* across projects is fine (it's the
// same spreadsheet, opened by ID); calling a *function* is not.
//
// ── THE DISCLOSURE BOUNDARY ─────────────────────────────────────────────────
// Nothing in cas-ccps sends student data outside the school's Workspace
// domain: the SCR audit export rejects off-domain recipients outright,
// exportToWorkbookGrid_ applies DriveApp.Access.DOMAIN at creation, and
// _ferpaHealthChecks_ audits both.
//
// A family is the one legitimate audience off the domain (FERPA gives a
// parent the right to their own child's record), and D1 (2026-10-23) put
// that disclosure in the teacher's hands: the teacher copies the report
// from the dashboard and emails it from their own account, to the guardians
// they know. Until 2026-10-23 this file sent it (MailApp) to an address the
// teacher typed; that path is gone, and with it the need for a verified
// guardian list, 18+ and opt-out checks here (the audit's precondition 6):
// the teacher chooses the recipients, as for any email they write. Two rules
// still hold:
//
//   1. Nothing on a timer reaches a family. generateWeeklyParentReports()
//      prepares; recordParentReportCopied() logs that the teacher copied one.
//   2. Only teacher-decided values appear. See the next section.
//
// ── NO UNREVIEWED AI VALUE REACHES A PARENT ─────────────────────────────────
// This system already answered the narrower version of this question and
// answered it no: 01_StudentDoc_ContainerScript.js's PENDING_TEACHER_REVIEW
// state shows the *student* "Submitted — Awaiting Teacher Review" and no
// number, because "nothing is final until the teacher confirms or overrides
// it." 30_SCRSuggestionEngine.js puts it harder still: "a suggestion that
// was never acted on by a teacher has no place in the official record, by
// design." A parent is further from the work than the student is, so the
// same rule applies with more force, not less.
//
// So: a confirmed score prints a number. Everything else prints no number at
// all; the item says where the work stands instead (passed, revising,
// waiting for feedback, not turned in). Concretely, this file reads Ledger TURN_IN_FINAL_SCORE and
// SCRDecisionLog, and never reads TURN_IN_SUGGESTED_SCORE or SCRSuggestions
// for output. SCRSuggestions' column map (SCRS) isn't even in scope in the
// dashboard project, which makes that structural rather than a promise.
//
// ── TWO GRAINS, LABELLED AS SUCH ────────────────────────────────────────────
// The report has two sections because the underlying data has two grains and
// conflating them would mislead:
//
//   "This week"          — Ledger rows inside a 7-day window. Genuinely weekly.
//   "Progress so far"    — SCRDecisionLog competency decisions to date.
//                          Cumulative, and labelled cumulative, because
//                          Script 30 deliberately never windows ("the
//                          threshold rule operates over ALL accumulated
//                          evidence") — a competency rating is a statement
//                          about the whole term, not about this week.
//
// ── WHAT THE REPORT SAYS (2026-10-23, the UX audit's preconditions) ─────────
//   - Every rostered student gets one, "nothing due or turned in" included.
//   - Each item is the lesson's title and where the work stands, in words
//     (passed, revising, waiting for feedback, not turned in yet).
//   - "What to do this week" names the work still open.
//   - Progress covers the current marking period only, with each
//     competency's text and the 1-5 scale in words (1 is the highest).
//   - The student's first name, never their account; the teacher's name and
//     address at the end.
//
// PUBLIC ENTRY POINTS
//   generateWeeklyParentReports()   weekly trigger + dashboard refresh;
//                                   prepares reports, sends nothing
//   recordParentReportCopied()      the teacher copied ONE report to send
//   installWeeklyParentReportTrigger()  one-time manual setup
//   archiveExpiredParentReports()   retention, admin menu
// =============================================================================

// ParentReportLog column indices (0-based) — canonical order.
// Append-only, one row per student per week.
const PRL = {
  REPORT_ID: 0,
  STUDENT_EMAIL: 1,
  STUDENT_NAME: 2,
  WEEK_START: 3,
  WEEK_END: 4,
  RECIPIENT_ADDRESS: 5,   // blank: the teacher emails it from their own account
                          // (since 2026-10-23), so the system never knows who
  GENERATED_AT: 6,
  COPIED_AT: 7,           // when the teacher copied it to send; blank = not yet
  COPIED_BY: 8,           // teacher email
  CONFIRMED_ITEM_COUNT: 9,
  PENDING_ITEM_COUNT: 10,
  ARCHIVE_STATUS: 11,
};

const PARENT_REPORT_LOG_HEADERS = [
  "report_id", "student_email", "student_name", "week_start", "week_end",
  "recipient_address", "generated_at", "copied_at", "copied_by",
  "confirmed_item_count", "pending_item_count", "archive_status",
];

// The retention marker. Deliberately SCRDecisionLog's legal-hold wording
// rather than the reversible "ARCHIVED" that Ledger and CompetencyEvidence
// use. A record of what was disclosed, to whom, and when is the kind of
// thing a district gets asked to produce; making it un-reactivatable by an
// ordinary admin action is the safer default of the two, and matches how
// SCRDecisionLog — the other record that exists to prove what a teacher
// decided — is already treated.
const PARENT_REPORT_ARCHIVED = "ARCHIVED — pending disposition review";

// ---------------------------------------------------------------------------
// _parentReportRetentionYears_
// Same shape as _scrRetentionYears_ / _ledgerRetentionYears_ /
// _competencyEvidenceRetentionYears_ in 30_SCRSuggestionEngine.js: Script
// Property with a conservative default.
//
// 5 years matches the other three, and carries the same caveat
// FERPA_DATA_MAP.md already records about them — it is NOT confirmed against
// a district or state retention schedule. For a disclosure log that question
// is if anything more pressing than for the others, since this record exists
// precisely to answer "what did we tell whom." Treat the default as a
// placeholder awaiting a real answer, not as policy.
// ---------------------------------------------------------------------------
function _parentReportRetentionYears_() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty("PARENT_REPORT_RETENTION_YEARS");
  const n = parseInt(raw, 10);
  return (n && n > 0) ? n : 5;
}

// ---------------------------------------------------------------------------
// _getParentReportLogSheet_
// Get-or-create, header-seeding. Same self-healing convention as
// createSCRTabs_() and _ensureTurnInReviewColumns_().
// ---------------------------------------------------------------------------
function _getParentReportLogSheet_(cfg) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const tabName = cfg.tabs.parentReportLog;
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, PARENT_REPORT_LOG_HEADERS.length)
      .setValues([PARENT_REPORT_LOG_HEADERS]);
    Logger.log("[S36] Created " + tabName + " tab.");
  }
  return sheet;
}

// ---------------------------------------------------------------------------
// _ensureParentReportArchiveColumn_
// Idempotent header add, matching _ensureScrDecisionLogArchiveColumn_.
// Needed for a tab created before this column existed.
// ---------------------------------------------------------------------------
function _ensureParentReportArchiveColumn_(sheet) {
  const col = PRL.ARCHIVE_STATUS + 1;
  const cell = sheet.getRange(1, col);
  if (String(cell.getValue()).trim() !== "archive_status") {
    cell.setValue("archive_status");
  }
}

// ---------------------------------------------------------------------------
// _weekWindow_
// The Monday-to-Sunday week containing `now`, as { start, end }.
//
// Anchored to a real calendar week rather than "the last 7 days" because a
// parent report is read against a school week — "week of the 3rd" has to
// mean the same thing whichever day the teacher gets to it, and two teachers
// sending on different days must not produce overlapping windows for the
// same child.
// ---------------------------------------------------------------------------
function _weekWindow_(now) {
  const ref = now || new Date();
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  // getDay(): 0=Sunday. Shift back to Monday; Sunday counts as day 7 of the
  // week that began the previous Monday, not the start of a new one.
  const dayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
  return { start: start, end: end };
}

// ---------------------------------------------------------------------------
// _readConfirmedCompetencyDecisions_
// Map<student_email, [{ competencyId, rating, decidedAt }]> — latest decision
// per student+competency, from SCRDecisionLog only.
//
// Reads the sheet directly rather than calling Script 30's helpers, because
// Script 30 isn't in the dashboard project (see this file's header). Uses
// SCRDL from 00_SharedConfig.js, which is.
//
// Archived rows are excluded, matching how aggregateEvidence_() treats them:
// past the retention window a row is restricted pending disposition, and
// putting it in front of a parent is exactly the use it's restricted from.
// ---------------------------------------------------------------------------
function _readConfirmedCompetencyDecisions_(cfg, decidedBy) {
  const onlyBy = decidedBy ? String(decidedBy).trim().toLowerCase() : "";
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.scrDecisionLog);
  const byStudent = new Map();
  if (!sheet || sheet.getLastRow() < 2) return byStudent;

  // One past SCRDL's highest index — the decision log's own width, NOT
  // ParentReportLog's. Bounded rather than getDataRange() for the reason
  // LEDGER_COL_COUNT documents: one stray far-right value can widen a
  // sheet's used range permanently.
  const SCRDL_COL_COUNT = SCRDL.ARCHIVE_STATUS + 1;
  const data = sheet.getRange(1, 1, sheet.getLastRow(), SCRDL_COL_COUNT).getValues();

  // Keyed by email + U+0000 + competencyId — a separator neither an email
  // address nor a competency ID can contain, so two different (email,
  // competency) pairs cannot collide into one key.
  const latest = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[SCRDL.STUDENT_EMAIL] || "").trim().toLowerCase();
    const compId = String(row[SCRDL.COMPETENCY_ID] || "").trim();
    if (!email || !compId) continue;

    if (String(row[SCRDL.ARCHIVE_STATUS] || "").trim() !== "") continue;
    if (onlyBy && String(row[SCRDL.DECIDED_BY] || "").trim().toLowerCase() !== onlyBy) continue;

    const rating = row[SCRDL.FINAL_RATING];
    if (rating === "" || rating === null || rating === undefined) continue;

    const decidedAt = (row[SCRDL.DECIDED_AT] instanceof Date) ? row[SCRDL.DECIDED_AT] : null;
    const key = email + "\u0000" + compId;
    const prior = latest.get(key);
    // No decidedAt sorts oldest, so a row with a real timestamp always wins
    // over one missing it rather than depending on sheet order.
    if (!prior || (decidedAt && (!prior.decidedAt || decidedAt > prior.decidedAt))) {
      latest.set(key, { email: email, competencyId: compId, rating: rating, decidedAt: decidedAt });
    }
  }

  for (const entry of latest.values()) {
    if (!byStudent.has(entry.email)) byStudent.set(entry.email, []);
    byStudent.get(entry.email).push({
      competencyId: entry.competencyId,
      rating: entry.rating,
      decidedAt: entry.decidedAt,
    });
  }
  for (const list of byStudent.values()) {
    list.sort((a, b) => String(a.competencyId).localeCompare(String(b.competencyId)));
  }
  return byStudent;
}

// ---------------------------------------------------------------------------
// _prLessonTitles_
// { assignmentConfigId: title } from 55b's lessons (in both projects): the
// title the assignment itself carries ("Title: Assignment: ..." in its
// student task), else the lesson's unit name. "CAS-8175-L06" is lesson key
// "8175-L06" (55's configIdForLesson_ rule).
// ---------------------------------------------------------------------------
function _prLessonTitles_() {
  const out = {};
  Object.keys(LESSON_ASSIGNMENTS).forEach(function (key) {
    const l = LESSON_ASSIGNMENTS[key];
    const m = /^Title:\s*(?:Assignment:\s*)?(.+)$/m.exec(String(l.promptText || ""));
    out["CAS-" + String(key).toUpperCase()] = (m ? m[1] : String(l.unitName || "")).trim();
  });
  return out;
}

// { competencyId: text }, from the lessons' milestones ("8175-39 Explain
// ..."), which quote each competency's VDOE wording.
function _prCompetencyText_() {
  const out = {};
  Object.keys(LESSON_ASSIGNMENTS).forEach(function (key) {
    (LESSON_ASSIGNMENTS[key].milestones || []).forEach(function (m) {
      const hit = /^(\d{4}-\d+)\s+(.+)$/.exec(String(m).trim());
      if (hit && !out[hit[1]]) out[hit[1]] = hit[2].replace(/\.\s*$/, "");
    });
  });
  return out;
}

// { studentWorkspaceConfigId: assignmentConfigId } from the StudentAssignments
// tab (54 writes it; read by name here because 54 isn't in the dashboard
// project). The Ledger's ConfigID is the student's workspace, not the lesson.
const PR_STUDENT_ASSIGNMENTS_TAB = "StudentAssignments";
function _prAssignmentOfWorkspace_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(PR_STUDENT_ASSIGNMENTS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
    const ws = String(r[0] || "").trim();
    if (ws) out[ws] = String(r[2] || "").trim();
  });
  return out;
}

// The current marking period as { term, start, end } (00's table and
// currentTerm_), or null when the date isn't in the table: then progress
// isn't windowed by term, only by school year as before.
function _prCurrentTermWindow_(now) {
  const term = currentTerm_(now);
  let raw = PropertiesService.getScriptProperties().getProperty("MARKING_PERIOD_ENDS");
  if (!raw) {
    try { raw = _resolveConfigValues_().values.MARKING_PERIOD_ENDS; } catch (e) { raw = ""; }
  }
  let table = _markingPeriodEnds_(raw);
  if (!table.length) table = _markingPeriodEnds_(DEFAULT_MARKING_PERIOD_ENDS);
  for (let i = 0; i < table.length; i++) {
    if (table[i].term !== term) continue;
    const ymd = function (s) { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); };
    let start;
    if (i > 0 && _schoolYearOfTerm_(table[i - 1].term) === _schoolYearOfTerm_(term)) {
      start = ymd(table[i - 1].end);
      start.setDate(start.getDate() + 1);
    } else {
      const y = Number(String(_schoolYearOfTerm_(term)).slice(0, 4));
      start = new Date(y, 7, 1); // the school year starts in August (00's rule)
    }
    const end = ymd(table[i].end);
    end.setHours(23, 59, 59);
    return { term: term, start: start, end: end };
  }
  return null;
}

// Where one item stands, in words a family reads. Same stages the student
// card shows (13's resolveStudentStatus_), from the Ledger's result columns.
function _prItemStatus_(a) {
  if (a.lastResult === "PASSED") return { key: "PASSED", words: "Passed: met the standard" };
  if (a.lastResult === "NEEDS_REVISION") {
    return a.firstPassedAt
      ? { key: "REVISING", words: "Passed before; now improving it", open: false }
      : { key: "REVISING", words: "Revising: feedback given, not passing yet", open: true };
  }
  if (a.submittedAt) return { key: "SUBMITTED", words: "Turned in; waiting for feedback" };
  return { key: "NOT_SUBMITTED", words: "Not turned in yet", open: true };
}

function _prFirstName_(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first;
}

// ---------------------------------------------------------------------------
// buildWeeklyParentReport_
// Assembles ONE student's report into a plain object. No I/O, no sending —
// which is what makes the disclosure rules testable in isolation.
//
// ctx: { titles, competencyText, assignmentOf, term } (generateWeeklyParentReports
// fills it; each part may be missing, and the label falls back to the
// course name).
//
// thisWeek entries carry `score: number|null`. A null score means "no number
// may be printed for this item" — the renderer must not fall back to the
// suggested value, and there is deliberately no suggested value on the entry
// to fall back to.
// ---------------------------------------------------------------------------
function buildWeeklyParentReport_(studentEmail, studentName, assignments, decisions, window, ctx) {
  const c = ctx || {};
  const titles = c.titles || {};
  const assignmentOf = c.assignmentOf || {};
  const competencyText = c.competencyText || {};
  const thisWeek = [];
  let confirmedCount = 0;
  let pendingCount = 0;

  (assignments || []).forEach(function (a) {
    // finalScore is the ONLY score that may reach a parent. See the header.
    const hasConfirmedScore = (a.finalScore !== null && a.finalScore !== undefined);
    if (hasConfirmedScore) confirmedCount++; else pendingCount++;
    const status = _prItemStatus_(a);
    const title = titles[assignmentOf[a.configId] || ""] || "";

    thisWeek.push({
      courseName: a.courseName || "",
      configId: a.configId || "",
      status: a.status || "",
      date: a.timestamp || null,
      label: title || a.courseName || "Coursework",
      stage: status.key,
      stageWords: status.words,
      open: !!status.open,
      score: hasConfirmedScore ? a.finalScore : null,
    });
  });

  const progress = (decisions || []).filter(function (d) {
    // The current marking period only (precondition 4); a decision with no
    // date can't be placed in one.
    if (!c.term) return true;
    return d.decidedAt instanceof Date && d.decidedAt >= c.term.start && d.decidedAt <= c.term.end;
  }).map(function (d) {
    return { competencyId: d.competencyId, text: competencyText[d.competencyId] || "",
      rating: d.rating, decidedAt: d.decidedAt };
  });

  return {
    studentEmail: studentEmail,
    studentName: studentName || "",
    firstName: _prFirstName_(studentName),
    weekStart: window.start,
    weekEnd: window.end,
    termLabel: c.term ? termLabel_(c.term.term) : "",
    thisWeek: thisWeek,
    progress: progress,
    confirmedCount: confirmedCount,
    pendingCount: pendingCount,
    teacherName: c.teacherName || "",
    teacherEmail: c.teacherEmail || "",
  };
}

// The email's subject line. The first name only: a subject shows on a
// phone's lock screen, and the student's account address is an ID.
function weeklyParentReportSubject_(report) {
  return "Weekly progress" + (report.firstName ? " for " + report.firstName : "") +
    ", week of " + Utilities.formatDate(report.weekStart, Session.getScriptTimeZone(), "MMMM d");
}

// ---------------------------------------------------------------------------
// renderWeeklyParentReportText_
// Turns a report object into the plain-text body the teacher copies.
//
// Plain text on purpose: it pastes the same into any mail client, it
// cannot carry a tracking pixel or a remote image, and there is nothing in
// this report that formatting would clarify.
// ---------------------------------------------------------------------------
function renderWeeklyParentReportText_(report) {
  const tz = Session.getScriptTimeZone();
  // Full month name, not "MMM": this is read by a parent on a phone, where
  // "March 2, 2026" is unambiguous and "Mar 2, 2026" is just terser.
  const fmt = function (d) {
    return (d instanceof Date) ? Utilities.formatDate(d, tz, "MMMM d, yyyy") : "";
  };
  const who = report.firstName || "your student";

  const lines = [];
  lines.push("Weekly progress for " + who);
  lines.push("Week of " + fmt(report.weekStart) + " – " + fmt(report.weekEnd));
  lines.push("");

  lines.push("THIS WEEK");
  if (report.thisWeek.length === 0) {
    lines.push("  Nothing was due or turned in this week.");
  } else {
    report.thisWeek.forEach(function (item) {
      const when = item.date ? " (" + fmt(item.date) + ")" : "";
      let line = "  • " + item.label + when + ": " + (item.stageWords || "with your teacher");
      if (item.score !== null && item.score !== undefined) {
        // Only a score the teacher decided. See this file's header.
        line += ". Teacher's score: " + item.score + " out of 5";
      }
      lines.push(line);
    });
  }

  lines.push("");
  lines.push("WHAT TO DO THIS WEEK");
  const open = report.thisWeek.filter(function (i) { return i.open; });
  if (!open.length) {
    lines.push("  Nothing is outstanding. Ask " + who + " what they worked on this week.");
  } else {
    lines.push("  Ask " + who + " to finish: " + open.map(function (i) { return i.label; }).join("; ") + ".");
    lines.push("  Feedback is a comment on each assignment's Google Doc, and " + who +
      " can submit again as often as they like.");
  }

  lines.push("");
  lines.push("PROGRESS SO FAR" + (report.termLabel ? ", " + report.termLabel.toUpperCase() : " THIS TERM"));
  lines.push("  Cumulative: these reflect all work this marking period, not just this week.");
  lines.push("  Ratings use Virginia's 1 to 5 competency scale, where 1 is the highest.");
  if (report.progress.length === 0) {
    lines.push("  No competency ratings confirmed yet.");
  } else {
    report.progress.forEach(function (p) {
      const words = SCR_RATING_LABELS[p.rating] ? p.rating + " (" + SCR_RATING_LABELS[p.rating].toLowerCase() + ")" : String(p.rating);
      lines.push("  • " + (p.text ? p.text + " [" + p.competencyId + "]" : p.competencyId) + ": " + words);
    });
  }

  lines.push("");
  lines.push("Questions about anything here? Reply to this email.");
  if (report.teacherName || report.teacherEmail) {
    lines.push("");
    lines.push((report.teacherName || "") +
      (report.teacherName && report.teacherEmail ? ", " : "") + (report.teacherEmail || ""));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// generateWeeklyParentReports
// Builds this week's reports for every student the teacher has this school
// year, including those with nothing due or turned in this week
// (precondition 3).
//
// PREPARES ONLY. This is what the weekly trigger calls and what the
// dashboard calls to populate its panel. The report reaches a family only
// when the teacher copies it and emails it themselves.
//
// Returns { weekStart, weekEnd, reports: [...], excludedStudentCount }
//
// excludedStudentCount is not incidental. getWeeklyAssignments_ filters on
// _studentIdPattern_() (^\d{7}@ccpsnet\.net$) and silently skips anything
// else. In an aggregator a skipped row is a cosmetic gap; here it is a family
// that never hears from the school, so the count is surfaced for the
// dashboard to display rather than swallowed.
// ---------------------------------------------------------------------------
function generateWeeklyParentReports(now) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledgerSheet) {
    Logger.log("[S36] No Ledger tab — nothing to report.");
    return { weekStart: null, weekEnd: null, reports: [], excludedStudentCount: 0 };
  }

  // Access policy: a teacher reports only on their own students, this
  // school year, and only their own courses and decisions. This runs in the
  // teacher's own dashboard project, so cfg.teacherEmail is that teacher;
  // with none configured there is nobody to scope to, so report nothing.
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  if (!teacher) {
    Logger.log("[S36] TEACHER_EMAIL is not set — no reports prepared.");
    return { weekStart: null, weekEnd: null, reports: [], excludedStudentCount: 0 };
  }
  const asOf = now instanceof Date ? now : undefined;
  const schoolYear = _currentSchoolYear_(asOf);

  const window = _weekWindow_(now);
  const assignmentsByStudent = getWeeklyAssignments_(ledgerSheet, window.start,
    { teacherEmail: teacher, schoolYear: schoolYear });
  const decisionsByStudent = _readConfirmedCompetencyDecisions_(cfg, teacher);
  const ctx = {
    titles: _prLessonTitles_(),
    competencyText: _prCompetencyText_(),
    assignmentOf: _prAssignmentOfWorkspace_(ss),
    term: _prCurrentTermWindow_(asOf),
    teacherName: String(cfg.teacherName || "").trim(),
    teacherEmail: String(cfg.teacherEmail || "").trim(),
  };

  // The roster (this teacher's students this school year), names and the
  // excluded count all come from the Ledger directly: getWeeklyAssignments_
  // drops the name, students with nothing this week, and the excluded rows.
  const names = new Map();
  let excludedStudentCount = 0;
  const excludedSeen = new Set();
  const rows = ledgerSheet
    .getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT)
    .getValues();
  for (let i = 1; i < rows.length; i++) {
    const email = String(rows[i][LEDGER.GOOGLE_ID] || "").trim();
    if (!email) continue;
    if (String(rows[i][LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) continue;
    if (!_isCurrentSchoolYearRow_(rows[i], schoolYear)) continue;
    if (!_studentIdPattern_().test(email)) {
      if (!excludedSeen.has(email.toLowerCase())) {
        excludedSeen.add(email.toLowerCase());
        excludedStudentCount++;
      }
      continue;
    }
    if (!names.has(email)) {
      names.set(email, String(rows[i][LEDGER.STUDENT_NAME] || "").trim());
    }
  }

  const reports = [];
  names.forEach(function (name, email) {
    reports.push(buildWeeklyParentReport_(
      email,
      name,
      assignmentsByStudent.get(email) || [],
      decisionsByStudent.get(String(email).toLowerCase()) || [],
      window,
      ctx
    ));
  });
  reports.sort((a, b) => String(a.studentName || a.studentEmail)
    .localeCompare(String(b.studentName || b.studentEmail)));

  Logger.log("[S36] Prepared " + reports.length + " report(s) for week of " +
    window.start + "; " + excludedStudentCount + " student(s) excluded by ID pattern.");

  return {
    weekStart: window.start,
    weekEnd: window.end,
    reports: reports,
    excludedStudentCount: excludedStudentCount,
  };
}

// ---------------------------------------------------------------------------
// _findParentReportRow_
// Row index (1-based) of this student's log row for the week, or -1.
//
// The key is (student_email, week_start): one row per student per week,
// whether the weekly prep or a copy wrote it first.
// ---------------------------------------------------------------------------
function _findParentReportRow_(sheet, studentEmail, weekStart) {
  if (sheet.getLastRow() < 2) return -1;
  const data = sheet.getRange(1, 1, sheet.getLastRow(), PARENT_REPORT_LOG_HEADERS.length).getValues();
  const targetEmail = String(studentEmail || "").trim().toLowerCase();
  const targetWeek = (weekStart instanceof Date) ? weekStart.getTime() : null;
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][PRL.STUDENT_EMAIL] || "").trim().toLowerCase();
    if (email !== targetEmail) continue;
    const ws = data[i][PRL.WEEK_START];
    const wsTime = (ws instanceof Date) ? ws.getTime() : null;
    if (wsTime !== null && targetWeek !== null && wsTime === targetWeek) return i + 1;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// recordParentReportCopied
// The teacher copied ONE student's report to email it from their own
// account (D1, 2026-10-23). Records when and by whom, so the dashboard can
// show "Copied" and the log says which reports went home; the recipients
// are the teacher's choice and aren't recorded. Copying again updates the
// time: a teacher may need to resend.
// ---------------------------------------------------------------------------
function recordParentReportCopied(studentEmail, now) {
  const cfg = getConfig_();
  const generated = generateWeeklyParentReports(now);
  const report = generated.reports.filter(function (r) {
    return String(r.studentEmail).toLowerCase() === String(studentEmail || "").toLowerCase();
  })[0];
  if (!report) return { success: false, error: "No report for this student this week." };

  const sheet = _getParentReportLogSheet_(cfg);
  _ensureParentReportArchiveColumn_(sheet);
  const stamp = now || new Date();
  const teacherEmail = Session.getActiveUser().getEmail();
  const existingRow = _findParentReportRow_(sheet, report.studentEmail, report.weekStart);
  if (existingRow > 0) {
    sheet.getRange(existingRow, PRL.COPIED_AT + 1, 1, 4)
      .setValues([[stamp, teacherEmail, report.confirmedCount, report.pendingCount]]);
  } else {
    sheet.appendRow([
      Utilities.getUuid(), report.studentEmail, report.studentName, report.weekStart, report.weekEnd,
      "", stamp, stamp, teacherEmail, report.confirmedCount, report.pendingCount, "",
    ]);
  }
  Logger.log("[S36] A weekly report was copied to send (ParentReportLog).");
  return { success: true, copiedAt: Utilities.formatDate(stamp, Session.getScriptTimeZone(), "MMM d, h:mm a") };
}

// When each of this week's reports was copied: { studentEmail: Date }.
function _parentReportsCopiedThisWeek_(cfg, weekStart) {
  const out = {};
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.parentReportLog);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const target = (weekStart instanceof Date) ? weekStart.getTime() : null;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, PARENT_REPORT_LOG_HEADERS.length).getValues().forEach(function (r) {
    const ws = r[PRL.WEEK_START];
    if (!(ws instanceof Date) || ws.getTime() !== target || !(r[PRL.COPIED_AT] instanceof Date)) return;
    out[String(r[PRL.STUDENT_EMAIL] || "").trim().toLowerCase()] = r[PRL.COPIED_AT];
  });
  return out;
}

// ---------------------------------------------------------------------------
// _archiveExpiredParentReports_
// Marks rows past the retention window. Never deletes — permanent deletion
// stays a human decision made outside any script, same as the other three
// retention mechanisms.
// ---------------------------------------------------------------------------
function _archiveExpiredParentReports_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.parentReportLog);
  if (!sheet || sheet.getLastRow() < 2) return { archived: 0, checked: 0 };
  _ensureParentReportArchiveColumn_(sheet);

  const cutoff = _retentionCutoff_(_parentReportRetentionYears_());

  const data = sheet.getRange(1, 1, sheet.getLastRow(), PARENT_REPORT_LOG_HEADERS.length).getValues();
  let archived = 0;
  let checked = 0;
  for (let i = 1; i < data.length; i++) {
    checked++;
    if (String(data[i][PRL.ARCHIVE_STATUS] || "").trim() !== "") continue;
    const generatedAt = data[i][PRL.GENERATED_AT];
    if (!(generatedAt instanceof Date) || generatedAt >= cutoff) continue;
    sheet.getRange(i + 1, PRL.ARCHIVE_STATUS + 1).setValue(PARENT_REPORT_ARCHIVED);
    archived++;
  }
  if (archived > 0) Logger.log("[S36] Archived " + archived + " parent-report row(s).");
  return { archived: archived, checked: checked };
}

// ---------------------------------------------------------------------------
// _countParentReportsPastRetentionUnarchived_
// Read-only companion for _ferpaHealthChecks_(). Callers run the archiver
// immediately before this, so a nonzero result means archival itself failed
// — a real signal, not a tautology. Same shape as the SCRDecisionLog,
// Ledger and CompetencyEvidence counters.
// ---------------------------------------------------------------------------
function _countParentReportsPastRetentionUnarchived_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.parentReportLog);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const cutoff = _retentionCutoff_(_parentReportRetentionYears_());

  const data = sheet.getRange(1, 1, sheet.getLastRow(), PARENT_REPORT_LOG_HEADERS.length).getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][PRL.ARCHIVE_STATUS] || "").trim() !== "") continue;
    const generatedAt = data[i][PRL.GENERATED_AT];
    if (generatedAt instanceof Date && generatedAt < cutoff) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// archiveExpiredParentReports
// Public wrapper for the admin menu. Public (no trailing underscore) because
// an underscore-suffixed function cannot be picked from the Apps Script Run
// dropdown or wired to a menu item — the trap installSCRTrigger_() and
// installStudentAggregatorTrigger_() both fall into while their own headers
// tell the operator to "run once manually from the Script Editor."
// ---------------------------------------------------------------------------
function archiveExpiredParentReports() {
  const result = _archiveExpiredParentReports_();
  Logger.log("[S36] Archive run: " + result.archived + " of " + result.checked + " row(s).");
  return result;
}

// ---------------------------------------------------------------------------
// runWeeklyParentReportPrep
// Weekly trigger handler. Prepares the week's rows so the teacher opens the
// dashboard to a ready list; SENDS NOTHING.
//
// Public name, unlike the two existing weekly handlers — 8 of the 10
// ScriptApp.newTrigger call sites in cas-ccps already use public names, and
// a public one can be run by hand from the editor when someone needs to
// check what it does.
// ---------------------------------------------------------------------------
function runWeeklyParentReportPrep(now) {
  const cfg = getConfig_();
  // `now` is optional and normally absent — a trigger passes an event
  // object, not a date, and the default is the current week. It exists so a
  // teacher who needs last week's rows rebuilt can ask for that week
  // explicitly, and so this function is testable against a fixed week
  // rather than only against whatever week the suite happens to run in.
  const asOf = (now instanceof Date) ? now : null;
  const generated = generateWeeklyParentReports(asOf);
  if (!generated.reports.length) {
    Logger.log("[S36] Weekly prep: nothing to prepare.");
    return { prepared: 0 };
  }

  const sheet = _getParentReportLogSheet_(cfg);
  _ensureParentReportArchiveColumn_(sheet);

  let prepared = 0;
  generated.reports.forEach(function (report) {
    if (_findParentReportRow_(sheet, report.studentEmail, report.weekStart) > 0) return;
    sheet.appendRow([
      Utilities.getUuid(),
      report.studentEmail,
      report.studentName,
      report.weekStart,
      report.weekEnd,
      "",                 // recipient_address — the teacher's choice, never recorded
      asOf || new Date(),
      "",                 // copied_at — blank until the teacher copies it
      "",
      report.confirmedCount,
      report.pendingCount,
      "",
    ]);
    prepared++;
  });

  Logger.log("[S36] Weekly prep: " + prepared + " row(s) prepared.");
  return { prepared: prepared };
}

// ---------------------------------------------------------------------------
// installWeeklyParentReportTrigger
// One-time manual setup. Run from the Script Editor.
//
// onWeekDay(FRIDAY), not everyDays(7). The two existing weekly triggers use
// everyDays(7), which is a rolling interval anchored to whenever it happened
// to be installed — fine for an overnight recompute nobody sees, wrong for
// something a person expects on a particular day. A report that arrives on a
// drifting weekday is a report nobody learns to look for.
//
// Public name for the same reason as archiveExpiredParentReports() above.
// ---------------------------------------------------------------------------
function installWeeklyParentReportTrigger() {
  const existing = ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "runWeeklyParentReportPrep"; });
  if (existing.length > 0) {
    Logger.log("[S36] Trigger already installed — nothing to do.");
    return { installed: false, reason: "already installed" };
  }
  ScriptApp.newTrigger("runWeeklyParentReportPrep")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(5)   // after Script 29 (3am) and Script 30 (4am), so the week's
                 // aggregation and SCR recompute are already done
    .create();
  Logger.log("[S36] Trigger installed: runWeeklyParentReportPrep, Fridays ~5am.");
  return { installed: true };
}
