// =============================================================================
// FILE: 36_WeeklyParentReport.js
// BOUND TO: Central Ledger spreadsheet
// INCLUDE IN: cas-ccps:central-ledger, cas-ccps:teacher-dashboard
// PURPOSE: Assembles a weekly, per-student progress report a teacher can
//          review and send to a parent, and records what was actually sent.
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
// This is the first thing in cas-ccps that sends student data to an address
// outside the school's Workspace domain. Everything else is walled: the SCR
// audit export rejects off-domain recipients outright, exportToWorkbookGrid_
// applies DriveApp.Access.DOMAIN at creation, and _ferpaHealthChecks_ audits
// both. That wall is deliberate and worth keeping for everything it covers.
//
// A parent is the one legitimate exception — FERPA gives them a right to
// their own child's education record — but the exception is narrow, and two
// rules keep it narrow here:
//
//   1. Only a teacher can send. Nothing on a timer ever emails a parent.
//      generateWeeklyParentReports() prepares; sendWeeklyParentReport()
//      sends, and only in response to a teacher action in the dashboard.
//   2. Only teacher-decided values leave. See the next section.
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
// all and is counted into one honest line — "N items are with your teacher
// for review." Concretely, this file reads Ledger TURN_IN_FINAL_SCORE and
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
// PUBLIC ENTRY POINTS
//   generateWeeklyParentReports()   weekly trigger + dashboard refresh;
//                                   prepares reports, sends nothing
//   sendWeeklyParentReport()        teacher-initiated send of ONE report
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
  RECIPIENT_ADDRESS: 5,   // blank until sent — see the note on this below
  GENERATED_AT: 6,
  SENT_AT: 7,             // blank = prepared but not sent
  SENT_BY: 8,             // teacher email
  CONFIRMED_ITEM_COUNT: 9,
  PENDING_ITEM_COUNT: 10,
  ARCHIVE_STATUS: 11,
};

const PARENT_REPORT_LOG_HEADERS = [
  "report_id", "student_email", "student_name", "week_start", "week_end",
  "recipient_address", "generated_at", "sent_at", "sent_by",
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
function _readConfirmedCompetencyDecisions_(cfg) {
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
// buildWeeklyParentReport_
// Assembles ONE student's report into a plain object. No I/O, no sending —
// which is what makes the disclosure rules testable in isolation.
//
// Returns { studentEmail, studentName, weekStart, weekEnd, thisWeek[],
//           progress[], confirmedCount, pendingCount }
//
// thisWeek entries carry `score: number|null`. A null score means "no number
// may be printed for this item" — the renderer must not fall back to the
// suggested value, and there is deliberately no suggested value on the entry
// to fall back to.
// ---------------------------------------------------------------------------
function buildWeeklyParentReport_(studentEmail, studentName, assignments, decisions, window) {
  const thisWeek = [];
  let confirmedCount = 0;
  let pendingCount = 0;

  (assignments || []).forEach(function (a) {
    // finalScore is the ONLY score that may reach a parent. See the header.
    const hasConfirmedScore = (a.finalScore !== null && a.finalScore !== undefined);
    if (hasConfirmedScore) confirmedCount++; else pendingCount++;

    thisWeek.push({
      courseName: a.courseName || "",
      configId: a.configId || "",
      status: a.status || "",
      date: a.timestamp || null,
      // Course name, not an assignment title: cas-ccps has no
      // assignment-title field anywhere, and printing a raw ConfigID
      // ("VDOE-XK4M2P-2025") at a parent tells them nothing. The date
      // disambiguates two items in the same course.
      label: a.courseName || "Coursework",
      score: hasConfirmedScore ? a.finalScore : null,
    });
  });

  const progress = (decisions || []).map(function (d) {
    return { competencyId: d.competencyId, rating: d.rating, decidedAt: d.decidedAt };
  });

  return {
    studentEmail: studentEmail,
    studentName: studentName || "",
    weekStart: window.start,
    weekEnd: window.end,
    thisWeek: thisWeek,
    progress: progress,
    confirmedCount: confirmedCount,
    pendingCount: pendingCount,
  };
}

// ---------------------------------------------------------------------------
// renderWeeklyParentReportText_
// Turns a report object into the plain-text email body.
//
// Plain text on purpose: it renders identically in every mail client, it
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

  const lines = [];
  lines.push("Weekly progress for " + (report.studentName || report.studentEmail));
  lines.push("Week of " + fmt(report.weekStart) + " – " + fmt(report.weekEnd));
  lines.push("");

  lines.push("THIS WEEK");
  if (report.thisWeek.length === 0) {
    lines.push("  No coursework recorded this week.");
  } else {
    report.thisWeek.forEach(function (item) {
      const when = item.date ? " (" + fmt(item.date) + ")" : "";
      if (item.score !== null && item.score !== undefined) {
        lines.push("  • " + item.label + when + " — score: " + item.score);
      } else {
        // No number, by design. See this file's header.
        lines.push("  • " + item.label + when + " — with your teacher for review");
      }
    });
  }
  if (report.pendingCount > 0) {
    lines.push("");
    lines.push("  " + report.pendingCount + " item" + (report.pendingCount === 1 ? " is" : "s are") +
      " with your teacher for review. Scores appear here once your teacher has" +
      " reviewed them — the system does not report a score your teacher hasn't" +
      " confirmed.");
  }

  lines.push("");
  lines.push("PROGRESS SO FAR THIS TERM");
  lines.push("  Cumulative — these reflect all work to date, not just this week.");
  if (report.progress.length === 0) {
    lines.push("  No competency ratings confirmed yet.");
  } else {
    report.progress.forEach(function (p) {
      lines.push("  • " + p.competencyId + ": " + p.rating);
    });
  }

  lines.push("");
  lines.push("Questions about anything here should go to your child's teacher,");
  lines.push("who sent this and can explain any of it in context.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// generateWeeklyParentReports
// Builds this week's reports for every student the teacher can see.
//
// PREPARES ONLY — never sends. This is what the weekly trigger calls and
// what the dashboard calls to populate its panel. The decision to disclose
// anything to a parent belongs to a teacher looking at the report, so it
// lives in sendWeeklyParentReport() and nowhere else.
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

  const window = _weekWindow_(now);
  const assignmentsByStudent = getWeeklyAssignments_(ledgerSheet, window.start);
  const decisionsByStudent = _readConfirmedCompetencyDecisions_(cfg);

  // Names and the excluded count both come from the Ledger directly rather
  // than from getWeeklyAssignments_, which drops the name and, by design,
  // drops the excluded rows entirely.
  const names = new Map();
  let excludedStudentCount = 0;
  const excludedSeen = new Set();
  const rows = ledgerSheet
    .getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT)
    .getValues();
  for (let i = 1; i < rows.length; i++) {
    const email = String(rows[i][LEDGER.GOOGLE_ID] || "").trim();
    if (!email) continue;
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
  assignmentsByStudent.forEach(function (assignments, email) {
    reports.push(buildWeeklyParentReport_(
      email,
      names.get(email) || "",
      assignments,
      decisionsByStudent.get(String(email).toLowerCase()) || [],
      window
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
// Row index (1-based) of an existing, unsent-or-sent log row for this
// student and week, or -1.
//
// The dedup key is (student_email, week_start). Without it a teacher who
// reloads the dashboard and clicks send again sends a parent a second copy —
// the kind of thing that reads as a system fault to the person receiving it.
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
// sendWeeklyParentReport
// Sends ONE student's report to ONE address, and records what it did.
//
// This is the only function in cas-ccps that sends student data off-domain,
// and it is reachable only from a teacher action. Two things follow from
// that and are enforced here rather than in the UI:
//
//   - It refuses to send twice for the same student and week. A parent
//     receiving the same report twice reads it as a system fault.
//   - It writes the recipient address it actually used into the log BEFORE
//     reporting success. That address is the whole reason delivery goes
//     through the app instead of a Gmail draft: a draft the teacher addresses
//     by hand leaves no record of where a child's scores went, and the most
//     likely FERPA incident this feature can produce is one child's report
//     reaching another child's parent.
//
// MailApp, not GmailApp: MailApp needs script.send_mail, which the
// central-ledger manifest already declares, where GmailApp would require
// https://mail.google.com/ — full read/modify/delete on the teacher's whole
// mailbox — for no gain over sending directly.
// ---------------------------------------------------------------------------
function sendWeeklyParentReport(studentEmail, recipientAddress, now) {
  const cfg = getConfig_();
  const recipient = String(recipientAddress || "").trim();
  if (!recipient) return { success: false, error: "Enter the parent's email address." };
  // Deliberately a shape check, not a domain check: the recipient is
  // expected to be off-domain, which is the entire point of this function.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return { success: false, error: "\"" + recipient + "\" is not a valid email address." };
  }

  const generated = generateWeeklyParentReports(now);
  const report = generated.reports.filter(function (r) {
    return String(r.studentEmail).toLowerCase() === String(studentEmail || "").toLowerCase();
  })[0];
  if (!report) {
    return { success: false, error: "No report for " + studentEmail + " this week." };
  }

  const sheet = _getParentReportLogSheet_(cfg);
  _ensureParentReportArchiveColumn_(sheet);

  const existingRow = _findParentReportRow_(sheet, report.studentEmail, report.weekStart);
  if (existingRow > 0) {
    const sentAt = sheet.getRange(existingRow, PRL.SENT_AT + 1).getValue();
    if (sentAt) {
      return {
        success: false,
        error: "A report for this student was already sent this week (" +
          sheet.getRange(existingRow, PRL.RECIPIENT_ADDRESS + 1).getValue() + ").",
      };
    }
  }

  const teacherEmail = Session.getActiveUser().getEmail();
  const subject = "Weekly progress — " + (report.studentName || report.studentEmail);
  const body = renderWeeklyParentReportText_(report);

  // Record first, then send. If the send throws, the row is left with no
  // sent_at and the teacher can retry; the reverse order risks a delivered
  // email with no record of it, which is the failure that matters here.
  const stamp = now || new Date();
  const row = [
    Utilities.getUuid(),
    report.studentEmail,
    report.studentName,
    report.weekStart,
    report.weekEnd,
    recipient,
    stamp,
    "",             // sent_at — filled in below, only on success
    teacherEmail,
    report.confirmedCount,
    report.pendingCount,
    "",
  ];
  let targetRow;
  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    targetRow = existingRow;
  } else {
    sheet.appendRow(row);
    targetRow = sheet.getLastRow();
  }

  try {
    MailApp.sendEmail({ to: recipient, subject: subject, body: body });
  } catch (e) {
    Logger.log("[S36] Send failed for " + report.studentEmail + ": " + e.message);
    return { success: false, error: "Could not send: " + e.message };
  }

  sheet.getRange(targetRow, PRL.SENT_AT + 1).setValue(stamp);
  Logger.log("[S36] Sent weekly report for " + report.studentEmail + " to " + recipient);
  return {
    success: true,
    studentEmail: report.studentEmail,
    recipient: recipient,
    confirmedCount: report.confirmedCount,
    pendingCount: report.pendingCount,
  };
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

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _parentReportRetentionYears_());

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

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _parentReportRetentionYears_());

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
      "",                 // recipient_address — unknown until a teacher sends
      asOf || new Date(),
      "",                 // sent_at — this function never sends
      "",
      report.confirmedCount,
      report.pendingCount,
      "",
    ]);
    prepared++;
  });

  Logger.log("[S36] Weekly prep: " + prepared + " row(s) prepared, 0 sent.");
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
