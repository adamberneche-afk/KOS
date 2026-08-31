// =============================================================================
// FILE: 26_CompetencyAlignmentLog.js
// BOUND TO: Central Ledger spreadsheet AND the Teacher Dashboard standalone
//   web app — called synchronously from Script 22's onLessonContextSubmit_(),
//   which itself runs in the Teacher Dashboard project (see that file's
//   header). See tools/gas-lint/project-map.json's
//   cas-ccps:teacher-dashboard entry.
// PURPOSE: Reads LessonContext rows with status=RECEIVED and writes one
//          AlignmentLog row per competency. Denormalizes lesson fields into
//          each row so the log is self-contained for export.
//          Marks LessonContext row ALIGNMENT_LOGGED on completion.
//
// ENTRY POINT:
//   logAlignmentForLesson_(lessonId) — called directly by Script 22
//   runAlignmentLogBackfill_()       — called by Script 22's safety-net trigger
//   generateAlignmentReport()        — run manually to produce a term coverage doc
//
// RETURNS (logAlignmentForLesson_):
//   { success: true,  rowsWritten: N }
//   { success: false, error: "human-readable message" }
//
// APPEND-ONLY RULE:
//   This script NEVER updates or deletes AlignmentLog rows.
//   If a lesson is resubmitted, new rows are appended. The old rows
//   remain for audit integrity. Scripts and reports filter by logged_at
//   to use the most recent mapping per lesson_id.
//
// =============================================================================

// AlignmentLog column indices (0-based) — canonical order
const AL_LOG_ID            = 0;
const AL_LESSON_ID         = 1;
const AL_LOGGED_AT         = 2;
const AL_LESSON_DATE       = 3;
const AL_TEACHER_EMAIL     = 4;
const AL_LEARNING_OBJECTIVE = 5;
const AL_COMPETENCY_ID     = 6;
const AL_COMPETENCY_TEXT   = 7;
const AL_STRAND            = 8;

// ---------------------------------------------------------------------------
// logAlignmentForLesson_ — primary entry point
// Called by Script 22 immediately after a successful LessonContext write.
// Finds the row by lessonId, validates it, writes AlignmentLog rows,
// updates LessonContext status.
// ---------------------------------------------------------------------------
function logAlignmentForLesson_(lessonId) {
  if (!lessonId) {
    return { success: false, error: "No lessonId provided." };
  }

  // LOCKED: this is invoked two ways on the same LessonContext row —
  // synchronously from Script 22's onLessonContextSubmit_(), and every 5
  // minutes by runAlignmentLogBackfill_(). Neither took a lock, so a slow
  // direct call still in flight when the backfill trigger fires on the
  // same still-RECEIVED row could pass both guards below in both
  // executions and double-append AlignmentLog rows for the same lesson —
  // silently doubling the competency-coverage numbers a teacher's
  // alignment report shows. Same fix already applied to 03_QueueBridge.js's
  // bridgeQueue() for the identical race shape; standing down (rather than
  // blocking indefinitely) matches that precedent.
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[S26] Parallel run congestion for " + lessonId + " — standing down.");
    return { success: false, error: "System busy — try again in a moment." };
  }

  try {
  const cfg     = getConfig_();
  const ss      = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lcSheet = ss.getSheetByName(cfg.tabs.lessonContext);
  const alSheet = ss.getSheetByName(cfg.tabs.alignmentLog);

  if (!lcSheet) return { success: false, error: "LessonContext tab not found." };
  if (!alSheet) return { success: false, error: "AlignmentLog tab not found." };

  // ── Find the LessonContext row ────────────────────────────────────────────
  const lcData = lcSheet.getDataRange().getValues();
  let lessonRowIdx = -1;
  let lessonRow    = null;

  for (let i = 1; i < lcData.length; i++) {
    if (String(lcData[i][LC_LESSON_ID]).trim() === lessonId) {
      lessonRowIdx = i;
      lessonRow    = lcData[i];
      break;
    }
  }

  if (!lessonRow) {
    return { success: false, error: "LessonContext row not found for ID: " + lessonId };
  }

  // ── Guard: only process RECEIVED rows ────────────────────────────────────
  const currentStatus = String(lessonRow[LC_STATUS]).trim();
  if (currentStatus !== "RECEIVED") {
    Logger.log("[S26] Skipping " + lessonId + " — status is " + currentStatus);
    return { success: true, rowsWritten: 0 };  // Not an error — already processed
  }

  // ── Guard: skip if already logged ────────────────────────────────────────
  const alreadyLogged = String(lessonRow[LC_ALIGNMENT_LOGGED_AT]).trim();
  if (alreadyLogged) {
    Logger.log("[S26] Skipping " + lessonId + " — already logged at " + alreadyLogged);
    return { success: true, rowsWritten: 0 };
  }

  // ── Parse competency IDs ──────────────────────────────────────────────────
  const rawIds = String(lessonRow[LC_COMPETENCY_IDS]).trim();
  if (!rawIds) {
    return { success: false, error: "No competency_ids on LessonContext row " + lessonId };
  }

  const competencyIds = rawIds.split(",").map(id => id.trim()).filter(Boolean);
  if (competencyIds.length === 0) {
    return { success: false, error: "competency_ids parsed to empty list for " + lessonId };
  }

  // ── Look up competency text + strand from registry ────────────────────────
  const compMap = buildCompetencyMap_(ss, cfg);

  // ── Build AlignmentLog rows ───────────────────────────────────────────────
  const lessonDate       = String(lessonRow[LC_LESSON_DATE]).trim();
  const teacherEmail     = String(lessonRow[LC_TEACHER_EMAIL]).trim();
  const learningObjective = String(lessonRow[LC_LEARNING_OBJECTIVE]).trim();
  const loggedAt         = new Date();
  const rowsToAppend     = [];

  for (const compId of competencyIds) {
    const compData = compMap[compId];

    // If competency not found in registry, log it but don't block the whole write.
    // Alignment row is still written with empty text/strand.
    if (!compData) {
      Logger.log("[S26] Warning — competency_id not found in registry: " + compId +
                 " | LessonID: " + lessonId);
    }

    const logId = generateLogId_();
    const alRow = new Array(9).fill("");
    alRow[AL_LOG_ID]             = logId;
    alRow[AL_LESSON_ID]          = lessonId;
    alRow[AL_LOGGED_AT]          = loggedAt;
    alRow[AL_LESSON_DATE]        = lessonDate;
    alRow[AL_TEACHER_EMAIL]      = teacherEmail;
    alRow[AL_LEARNING_OBJECTIVE] = learningObjective;
    alRow[AL_COMPETENCY_ID]      = compId;
    alRow[AL_COMPETENCY_TEXT]    = compData ? compData.text   : "[not found in registry]";
    alRow[AL_STRAND]             = compData ? compData.strand : "";

    rowsToAppend.push(alRow);
  }

  // ── Write all AlignmentLog rows in a single batch ─────────────────────────
  // appendRow() is called per-row rather than setValues() because we're
  // appending to an existing sheet of unknown length. Acceptable at lesson
  // scale (typically 1–5 competencies per lesson).
  try {
    for (const alRow of rowsToAppend) {
      alSheet.appendRow(alRow);
    }
  } catch (err) {
    Logger.log("[S26] appendRow error for " + lessonId + ": " + err.message);
    return { success: false, error: "Could not write AlignmentLog rows: " + err.message };
  }

  // ── Update LessonContext status ───────────────────────────────────────────
  // Two writes: status column and alignment_logged_at column.
  // Using getRange() by row index (1-based) + column index (1-based).
  try {
    const sheetRow = lessonRowIdx + 1; // +1 for 1-based index
    lcSheet.getRange(sheetRow, LC_STATUS + 1)
      .setValue("ALIGNMENT_LOGGED");
    lcSheet.getRange(sheetRow, LC_ALIGNMENT_LOGGED_AT + 1)
      .setValue(loggedAt);
  } catch (err) {
    // AlignmentLog rows were written — this is a partial failure.
    // Log it but return success so S22 doesn't retry and double-write.
    Logger.log("[S26] Status update failed for " + lessonId + ": " + err.message);
  }

  Logger.log("[S26] Logged " + rowsToAppend.length + " alignment row(s) for " + lessonId);
  return { success: true, rowsWritten: rowsToAppend.length };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// buildCompetencyMap_
// Returns { competency_id: { text, strand } } from CompetencyRegistry.
// Only includes active rows. Built once per S26 call.
// ---------------------------------------------------------------------------
function buildCompetencyMap_(ss, cfg) {
  const sheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
  if (!sheet) {
    Logger.log("[S26] CompetencyRegistry not found — competency text will be empty in log.");
    return {};
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId     = headers.indexOf("competency_id");
  const iText   = headers.indexOf("competency_text");
  const iStrand = headers.indexOf("strand");
  const iActive = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    Logger.log("[S26] CompetencyRegistry missing required columns.");
    return {};
  }

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const id     = String(data[i][iId]).trim();
    const active = iActive === -1 ? true :
      String(data[i][iActive]).trim().toUpperCase() !== "FALSE";
    if (!id || !active) continue;
    map[id] = {
      text:   iText   !== -1 ? String(data[i][iText]).trim()   : "",
      strand: iStrand !== -1 ? String(data[i][iStrand]).trim() : ""
    };
  }

  return map;
}

// ---------------------------------------------------------------------------
// generateLogId_
// Format: ALG-YYYYMMDD-XXXX (4 hex chars)
// ---------------------------------------------------------------------------
function generateLogId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Math.floor(Math.random() * 0xffff)
    .toString(16).toUpperCase().padStart(4, "0");
  return "ALG-" + yyyy + mm + dd + "-" + hex;
}

// ReportRegistry column indices (0-based) — canonical order
const RR_REPORT_ID    = 0;
const RR_GENERATED_AT = 1;
const RR_TERM         = 2;
const RR_TEACHER_EMAIL = 3;
const RR_DOC_ID       = 4;
const RR_DOC_URL      = 5;
const RR_REPORT_TYPE  = 6;

// ---------------------------------------------------------------------------
// generateAlignmentReport
// Run manually (from Script Editor > Run) to produce a Google Doc showing
// competency coverage for the current term, grouped by course then duty area.
//
// OUTPUT:
//   Google Doc in teacher's Drive folder
//   titled "Competency Alignment — [term] — [teacher name] — [date]"
//
// REGISTRATION:
//   On success, the doc ID and URL are:
//   (a) Appended to the ReportRegistry tab on the Central Ledger
//   (b) Written to Script Properties as M2_LAST_REPORT_DOC_ID and
//       M2_LAST_REPORT_URL (overwritten each run — points to most recent)
//
// COURSE STRUCTURE:
//   Report sections are grouped first by course (subject), then by duty area
//   (strand) within each course, then by task number. Both 8175 and 8177
//   competencies are reported separately even when text is identical —
//   each course's coverage is independently tracked.
//
// RE-RUNNING:
//   Creates a new doc each time (does not overwrite). ReportRegistry
//   accumulates all past reports. Script Properties point to the most recent.
// ---------------------------------------------------------------------------
function generateAlignmentReport() {
  const cfg         = getConfig_();
  const props       = PropertiesService.getScriptProperties();
  const currentTerm = props.getProperty("CURRENT_TERM") || "All Terms";
  const teacherEmail = cfg.teacherEmail;
  const generatedAt  = new Date();

  const ss       = SpreadsheetApp.openById(cfg.ledgerSsId);
  const alSheet  = ss.getSheetByName(cfg.tabs.alignmentLog);
  const rrSheet  = ss.getSheetByName(cfg.tabs.reportRegistry);

  if (!alSheet) {
    Logger.log("[S26] AlignmentLog tab not found — cannot generate report.");
    return null;
  }

  // ── Read AlignmentLog — resolve columns by name ───────────────────────────
  const alData   = alSheet.getDataRange().getValues();
  const alHdrs   = alData[0].map(h => String(h).trim());
  const iTeacher = alHdrs.indexOf("teacher_email");
  const iCompId  = alHdrs.indexOf("competency_id");
  const iDate    = alHdrs.indexOf("lesson_date");
  const iObj     = alHdrs.indexOf("learning_objective");
  const iText    = alHdrs.indexOf("competency_text");
  const iStrand  = alHdrs.indexOf("strand");

  // Filter to this teacher's rows only
  const myRows = alData.slice(1).filter(row =>
    String(row[iTeacher]).trim().toLowerCase() === teacherEmail.toLowerCase()
  );

  if (myRows.length === 0) {
    Logger.log("[S26] No AlignmentLog rows found for " + teacherEmail +
               " — run some lessons first.");
    return null;
  }

  // ── Build coverage map: compId → { text, strand, lessons: [] } ───────────
  // Coverage is accumulated per competency_id across all log rows.
  // Duplicate lesson entries (from multiple lessons covering the same
  // competency) are intentionally kept — they show breadth of coverage.
  const coverage = {};
  for (const row of myRows) {
    const compId  = String(row[iCompId]).trim();
    const date    = String(row[iDate]).trim();
    const obj     = String(row[iObj]).trim();
    const text    = String(row[iText]).trim();
    const strand  = String(row[iStrand]).trim();
    if (!compId) continue;
    if (!coverage[compId]) {
      coverage[compId] = { text, strand, lessons: [] };
    }
    coverage[compId].lessons.push({ date, objective: obj });
  }

  // ── Load full CompetencyRegistry — grouped by course then strand ──────────
  // All active competencies appear in the report, addressed or not.
  // courseMap: { subject: { strand: [{ id, taskNum, text }] } }
  const regSheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
  const courseMap = buildCourseMap_(regSheet);

  // ── Build document ────────────────────────────────────────────────────────
  const dateStr = Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(generatedAt, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  const title   = "Competency Alignment — " + currentTerm +
                  " — " + (cfg.teacherName || teacherEmail) +
                  " — " + dateStr;

  const folder = cfg.teacherFolderId
    ? DriveApp.getFolderById(cfg.teacherFolderId)
    : DriveApp.getRootFolder();

  const doc  = DocumentApp.create(title);
  const body = doc.getBody();
  DriveApp.getFileById(doc.getId()).moveTo(folder);

  // ── Header ────────────────────────────────────────────────────────────────
  body.appendParagraph("COMPETENCY ALIGNMENT REPORT")
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Teacher:   " + (cfg.teacherName || teacherEmail));
  body.appendParagraph("Term:      " + currentTerm);
  body.appendParagraph("Generated: " + timeStr);
  body.appendParagraph("").appendHorizontalRule();

  // ── Summary across all courses ────────────────────────────────────────────
  const allCompIds    = Object.keys(courseMap).reduce((acc, subj) => {
    Object.values(courseMap[subj]).forEach(comps => comps.forEach(c => acc.add(c.id)));
    return acc;
  }, new Set());
  const totalComps   = allCompIds.size;
  const coveredComps = [...allCompIds].filter(id => coverage[id] && coverage[id].lessons.length > 0).length;

  body.appendParagraph(
    "Total coverage: " + coveredComps + " of " + totalComps +
    " competencies addressed this term across all courses."
  ).setBold(true);
  body.appendParagraph("");

  // ── Per-course sections ───────────────────────────────────────────────────
  // Courses sorted alphabetically by name. Within each course, strands
  // sorted alphabetically, competencies sorted by task number ascending.
  const courseNames = Object.keys(courseMap).sort();

  courseNames.forEach(courseName => {
    const strandMap    = courseMap[courseName];
    const courseIds    = Object.values(strandMap).reduce((a, c) => a.concat(c.map(x => x.id)), []);
    const courseCovered = courseIds.filter(id => coverage[id] && coverage[id].lessons.length > 0).length;

    // Course heading
    body.appendParagraph(courseName)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(
      courseCovered + " of " + courseIds.length + " competencies addressed"
    ).setItalic(true);
    body.appendParagraph("");

    // Strands within this course
    Object.keys(strandMap).sort().forEach(strand => {
      body.appendParagraph(strand)
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);

      // Competencies sorted by taskNum
      strandMap[strand]
        .sort((a, b) => a.taskNum - b.taskNum)
        .forEach(comp => {
          const data       = coverage[comp.id];
          const addressed  = data && data.lessons.length > 0;
          const prefix     = addressed ? "✓  " : "○  ";
          const label      = comp.id + "   " + comp.text;
          const compPara   = body.appendParagraph(prefix + label);

          if (!addressed) {
            compPara.editAsText().setForegroundColor("#999999");
          }

          if (addressed) {
            // List each lesson that addressed this competency, sorted by date
            data.lessons
              .sort((a, b) => a.date.localeCompare(b.date))
              .forEach(lesson => {
                body.appendParagraph("        " + lesson.date + "   " + lesson.objective)
                  .setIndentStart(36)
                  .editAsText()
                  .setFontSize(10)
                  .setForegroundColor("#555555");
              });
          }
        });

      body.appendParagraph("");
    });
  });

  doc.saveAndClose();

  const docId  = doc.getId();
  const docUrl = "https://docs.google.com/document/d/" + docId + "/edit";

  Logger.log("[S26] Report generated: " + docUrl);
  Logger.log("[S26] Coverage: " + coveredComps + "/" + totalComps);

  // ── Register in ReportRegistry tab ───────────────────────────────────────
  registerReport_(ss, cfg, generatedAt, currentTerm, teacherEmail, docId, docUrl);

  // ── Write to Script Properties ────────────────────────────────────────────
  // Overwrites on each run — always points to most recent report.
  // History preserved in ReportRegistry tab.
  try {
    props.setProperties({
      "M2_LAST_REPORT_DOC_ID": docId,
      "M2_LAST_REPORT_URL":    docUrl,
      "M2_LAST_REPORT_TERM":   currentTerm,
      "M2_LAST_REPORT_DATE":   dateStr
    });
    Logger.log("[S26] Script Properties updated with latest report ID.");
  } catch (err) {
    Logger.log("[S26] Could not write to Script Properties: " + err.message);
  }

  return { docId, docUrl, coveredComps, totalComps };
}

// ---------------------------------------------------------------------------
// registerReport_
// Appends one row to the ReportRegistry tab.
// Creates the tab if it doesn't exist (graceful degradation).
//
// reportType is optional, defaulting to "ALIGNMENT_TERM" so this function's
// one pre-existing call site (generateAlignmentReport() above, which passes
// 7 args) is unaffected. Widened rather than duplicated when
// 27_LessonFrameGenerator.js needed the identical registration mechanic
// under a different type ("LESSON_FRAME") — this file already sits in both
// cas-ccps:central-ledger and cas-ccps:teacher-dashboard (see the header
// above), and Script 27 is placed in the same two projects for the same
// reason, so calling this shared function directly is possible without
// cross-project risk. See 36_WeeklyParentReport.js's own header for why
// this codebase prefers one shared implementation over two that drift.
// ---------------------------------------------------------------------------
function registerReport_(ss, cfg, generatedAt, term, teacherEmail, docId, docUrl, reportType) {
  try {
    let rrSheet = ss.getSheetByName(cfg.tabs.reportRegistry);

    // Graceful tab creation if setup wizard missed it
    if (!rrSheet) {
      Logger.log("[S26] ReportRegistry tab not found — creating it now.");
      rrSheet = ss.insertSheet(cfg.tabs.reportRegistry);
      rrSheet.getRange(1, 1, 1, 7)
        .setValues([["report_id","generated_at","term","teacher_email",
                     "doc_id","doc_url","report_type"]])
        .setFontWeight("bold")
        .setBackground("#f3f3f3");
      rrSheet.setFrozenRows(1);
    }

    const reportId  = generateReportId_();
    const reportRow = new Array(7).fill("");
    reportRow[RR_REPORT_ID]     = reportId;
    reportRow[RR_GENERATED_AT]  = generatedAt;
    reportRow[RR_TERM]          = term;
    reportRow[RR_TEACHER_EMAIL] = teacherEmail;
    reportRow[RR_DOC_ID]        = docId;
    reportRow[RR_DOC_URL]       = docUrl;
    reportRow[RR_REPORT_TYPE]   = reportType || "ALIGNMENT_TERM";

    rrSheet.appendRow(reportRow);
    Logger.log("[S26] Registered in ReportRegistry: " + reportId);
  } catch (err) {
    // Registration failure is non-fatal — the doc was created successfully.
    Logger.log("[S26] ReportRegistry write failed: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// buildCourseMap_
// Reads CompetencyRegistry and returns:
//   { subjectName: { strandName: [{ id, taskNum, text }] } }
// Only active rows. Used by generateAlignmentReport() to build the
// per-course sections and surface unaddressed competencies.
// ---------------------------------------------------------------------------
function buildCourseMap_(regSheet) {
  if (!regSheet) {
    Logger.log("[S26] CompetencyRegistry not found — report will only show addressed competencies.");
    return {};
  }

  const data    = regSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId      = headers.indexOf("competency_id");
  const iText    = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand  = headers.indexOf("strand");
  const iActive  = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    Logger.log("[S26] CompetencyRegistry missing required columns.");
    return {};
  }

  const courseMap = {};

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const active = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;

    const id      = String(row[iId]).trim();
    const text    = iText    !== -1 ? String(row[iText]).trim()    : "";
    const subject = iSubject !== -1 ? String(row[iSubject]).trim() : "General";
    const strand  = iStrand  !== -1 ? String(row[iStrand]).trim()  : "General";
    if (!id) continue;

    // Extract task number from ID suffix for sort order
    const dashIdx = id.lastIndexOf("-");
    const taskNum = dashIdx !== -1
      ? parseInt(id.substring(dashIdx + 1), 10) || 9999
      : 9999;

    if (!courseMap[subject]) courseMap[subject] = {};
    if (!courseMap[subject][strand]) courseMap[subject][strand] = [];
    courseMap[subject][strand].push({ id, taskNum, text });
  }

  return courseMap;
}

// ---------------------------------------------------------------------------
// generateReportId_
// Format: RPT-YYYYMMDD-XXXX (4 hex chars)
// ---------------------------------------------------------------------------
function generateReportId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Math.floor(Math.random() * 0xffff)
    .toString(16).toUpperCase().padStart(4, "0");
  return "RPT-" + yyyy + mm + dd + "-" + hex;
}

// ---------------------------------------------------------------------------
// getLastReport
// Convenience function — returns the most recent report's doc URL and ID
// from Script Properties. Run from Script Editor or call from a menu.
// ---------------------------------------------------------------------------
function getLastReport() {
  const props = PropertiesService.getScriptProperties();
  const docId  = props.getProperty("M2_LAST_REPORT_DOC_ID") || "";
  const docUrl = props.getProperty("M2_LAST_REPORT_URL")    || "";
  const term   = props.getProperty("M2_LAST_REPORT_TERM")   || "";
  const date   = props.getProperty("M2_LAST_REPORT_DATE")   || "";

  if (!docId) {
    Logger.log("[S26] No report has been generated yet. Run generateAlignmentReport() first.");
    return null;
  }

  Logger.log("[S26] Most recent report:");
  Logger.log("[S26]   Term:  " + term);
  Logger.log("[S26]   Date:  " + date);
  Logger.log("[S26]   DocID: " + docId);
  Logger.log("[S26]   URL:   " + docUrl);
  return { docId, docUrl, term, date };
}
