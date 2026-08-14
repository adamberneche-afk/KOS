// =============================================================================
// FILE: 29_StudentContextAggregator.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Weekly aggregation of each student's completed assignments and
//          warm-up responses into a single living Google Doc, owned by the
//          student and visible to the teacher. Runs on a time trigger, not
//          on demand — growth is allowed to accumulate for a week before
//          being written.
//
// ENTRY POINT:
//   runWeeklyStudentAggregation_()  — installed as a 7-day time trigger
//   installStudentAggregatorTrigger_()  — run once manually to install it
//   createStudentAggregatorTabs_()  — run once manually before first use
//
// DOES NOT RUN ON DEMAND. There is no live-query path in this script by
// design — the per-student Doc reflects what existed as of the most recent
// weekly run, not the current instant. See CAS Module 2 docs, "NO QUEUE"
// and "APPEND-ONLY" architectural decisions for the precedent this follows.
//
// STUDENT IDENTIFIER FORMAT:
//   District-issued accounts: 7-digit numeric ID @ccpsnet.net
//   e.g. 7145839@ccpsnet.net
//   Validated against ID_PATTERN before any row is processed. Rows that
//   fail validation are skipped and logged — never silently included or
//   silently dropped without a trace.
//
// =============================================================================

// FIXED: the district email domain used to be hardcoded here as a regex
// literal (`/^\d{7}@ccpsnet\.net$/`) and again as a string literal further
// below (email normalization) — a domain change (district rebrand or
// migration) would have silently dropped every student from this module,
// with the only failure signal being an unread Logger.log line (see
// docsSkippedInvalidId in runWeeklyStudentAggregation_ below). Both now
// read cfg.studentEmailDomain (00_SharedConfig.js), defaulting to the
// same "ccpsnet.net" value so behavior is unchanged unless a project
// explicitly configures a different domain.
function _studentEmailDomain_() {
  return getConfig_().studentEmailDomain || "ccpsnet.net";
}
function _studentIdPattern_() {
  const escapedDomain = _studentEmailDomain_().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^\\d{7}@" + escapedDomain + "$");
}

// StudentDocRegistry column indices (0-based) — canonical order
const SDR_STUDENT_EMAIL = 0;
const SDR_STUDENT_NAME = 1;
const SDR_DOC_ID = 2;
const SDR_DOC_URL = 3;
const SDR_CREATED_AT = 4;
const SDR_LAST_UPDATED_AT = 5;
const SDR_LAST_RUN_HAD_CONTENT = 6;

// WarmUpResponses column indices (0-based) — canonical order
// This tab is the backing sheet for the student-facing Warm-Up Response form.
const WUR_TIMESTAMP = 0;
const WUR_STUDENT_EMAIL = 1;
const WUR_LESSON_UNIT_ID = 2;
const WUR_RESPONSE = 3;

// ---------------------------------------------------------------------------
// runWeeklyStudentAggregation_ — primary entry point, time-triggered
// ---------------------------------------------------------------------------
function runWeeklyStudentAggregation_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  const warmUpSheet = ss.getSheetByName(cfg.tabs.warmUpResponses);

  if (!ledgerSheet) {
    Logger.log("[S29] Ledger tab not found. Aborting run.");
    return;
  }
  if (!registrySheet) {
    Logger.log("[S29] StudentDocRegistry tab not found. Run createStudentAggregatorTabs_() first.");
    return;
  }

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 7);
  const runTimestamp = new Date();

  Logger.log("[S29] Weekly aggregation run starting. Window: " +
    windowStart.toISOString() + " → " + runTimestamp.toISOString());

  // ── Step 1: build the student roster for this run ──────────────────────
  // Roster is derived from Ledger — every unique, validly-formatted
  // GoogleID with a StudentName attached. This is intentionally NOT a
  // separate roster sheet; the Ledger already accumulates this as students
  // submit work, and duplicating it would create a second source of truth.
  const roster = buildValidatedStudentRoster_(ledgerSheet);
  Logger.log("[S29] Roster built: " + roster.size + " valid student(s) found in Ledger.");

  if (roster.size === 0) {
    Logger.log("[S29] No valid students found this run. Nothing to do.");
    return;
  }

  // ── Step 2: pull this week's data, grouped by student email ────────────
  const weeklyAssignments = getWeeklyAssignments_(ledgerSheet, windowStart);
  const weeklyWarmUps = warmUpSheet
    ? getWeeklyWarmUps_(warmUpSheet, windowStart)
    : new Map();

  if (!warmUpSheet) {
    Logger.log("[S29] WarmUpResponses tab not found — proceeding with assignments only.");
  }

  // ── Step 3: for each student, look up/create their Doc, append if needed ─
  let docsCreated = 0;
  let docsUpdated = 0;
  let docsSkippedNoContent = 0;
  let docsSkippedInvalidId = 0;

  for (const [email, name] of roster.entries()) {
    if (!_studentIdPattern_().test(email)) {
      // Defensive — buildValidatedStudentRoster_ already filters, but never
      // trust a single validation point when writing to permanent Docs.
      Logger.log("[S29] Skipping invalid student identifier at write stage: " + email);
      docsSkippedInvalidId++;
      continue;
    }

    const assignments = weeklyAssignments.get(email) || [];
    const warmUps = weeklyWarmUps.get(email) || [];

    if (assignments.length === 0 && warmUps.length === 0) {
      // No new content this week for this student — do not write an
      // empty section. A living document should only grow when there is
      // something to show; an empty "Week of ..." header every week for
      // a student who submitted nothing is noise, not signal.
      docsSkippedNoContent++;
      continue;
    }

    const docInfo = getOrCreateStudentDoc_(registrySheet, email, name, cfg);
    if (!docInfo) {
      Logger.log("[S29] Could not get or create doc for " + email + " — skipping this run.");
      continue;
    }

    const wasNewDoc = docInfo.isNew;
    try {
      appendWeeklySection_(docInfo.docId, runTimestamp, assignments, warmUps);
      updateRegistryTimestamp_(registrySheet, email, runTimestamp, true);
      if (wasNewDoc) {
        docsCreated++;
      } else {
        docsUpdated++;
      }
    } catch (err) {
      Logger.log("[S29] Failed to append section for " + email + ": " + err.message);
    }
  }

  Logger.log("[S29] Run complete. Created: " + docsCreated +
    " | Updated: " + docsUpdated +
    " | Skipped (no content): " + docsSkippedNoContent +
    " | Skipped (invalid ID): " + docsSkippedInvalidId);
}

// ---------------------------------------------------------------------------
// buildValidatedStudentRoster_
// Scans the Ledger for unique GoogleID + StudentName pairs. Validates every
// GoogleID against ID_PATTERN. Invalid IDs are logged and excluded — they
// never reach the registry or get a Doc created for them.
// Returns Map<email, name>
//
// Renamed from buildStudentRoster_ — that name collided with a genuinely
// different function of the same name in 23_StudentProfileManager.js
// (different signature, different return shape, different filtering
// logic; both files share the Central Ledger project's global scope).
// GAS's load order silently decided which implementation every caller
// actually got — caught by tools/gas-lint/check.js, fixed by renaming
// this one rather than 23's (23's version is the more general-purpose
// one: any future third caller wanting "the roster" almost certainly
// means 23's shape, not this file's validation-specific one).
// ---------------------------------------------------------------------------
function buildValidatedStudentRoster_(ledgerSheet) {
  const data = ledgerSheet.getDataRange().getValues();
  const roster = new Map();
  const invalidSeen = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[1] /* GoogleID */ || "").trim();
    const name = String(row[4] /* StudentName */ || "").trim();

    if (!email) continue; // blank row, skip silently — not an error

    if (!_studentIdPattern_().test(email)) {
      if (!invalidSeen.has(email)) {
        Logger.log("[S29] Invalid GoogleID format, excluded from roster: '" + email +
          "' (expected 7 digits @ccpsnet.net)");
        invalidSeen.add(email);
      }
      continue;
    }

    if (!roster.has(email)) {
      roster.set(email, name || "(name unknown)");
    }
  }

  if (invalidSeen.size > 0) {
    Logger.log("[S29] Total distinct invalid GoogleID values this run: " + invalidSeen.size);
  }

  return roster;
}

// ---------------------------------------------------------------------------
// getWeeklyAssignments_
// Returns Map<email, [{ status, courseName, configId, lastEval, studentFileURL }]>
// Filtered to rows where SubmissionTS or Timestamp falls inside the window.
// Uses SubmissionTS preferentially since that reflects actual student
// submission time; falls back to Timestamp if SubmissionTS is blank.
// ---------------------------------------------------------------------------
function getWeeklyAssignments_(ledgerSheet, windowStart) {
  const data = ledgerSheet.getDataRange().getValues();
  const result = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[1] || "").trim();
    if (!email || !_studentIdPattern_().test(email)) continue;

    const submissionTs = row[13]; // SubmissionTS
    const fallbackTs = row[0];    // Timestamp
    const effectiveTs = (submissionTs instanceof Date) ? submissionTs
      : (fallbackTs instanceof Date) ? fallbackTs : null;

    if (!effectiveTs || effectiveTs < windowStart) continue;

    const entry = {
      courseName: String(row[10] || "").trim(),
      configId: String(row[2] || "").trim(),
      status: String(row[12] || "").trim(),
      lastEval: row[15] || null,
      studentFileURL: String(row[17] || "").trim(),
      timestamp: effectiveTs,
    };

    if (!result.has(email)) result.set(email, []);
    result.get(email).push(entry);
  }

  // Sort each student's list chronologically
  for (const list of result.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  return result;
}

// ---------------------------------------------------------------------------
// getWeeklyWarmUps_
// Returns Map<email, [{ lessonUnitId, response, timestamp }]>
// Reads the WarmUpResponses tab, filtered to the trailing 7-day window.
// ---------------------------------------------------------------------------
function getWeeklyWarmUps_(warmUpSheet, windowStart) {
  const data = warmUpSheet.getDataRange().getValues();
  const result = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = row[WUR_TIMESTAMP];
    let email = String(row[WUR_STUDENT_EMAIL] || "").trim();

    // The Warm-Up Response form collects only the 7-digit student ID
    // (see WarmUpResponseForm_setup.md) to keep the form itself free of
    // any Apps Script. Normalize to the full school address here, before
    // validation, rather than requiring the form to produce it.
    if (/^\d{7}$/.test(email)) {
      email = email + "@" + _studentEmailDomain_();
    }

    if (!email || !_studentIdPattern_().test(email)) continue;
    if (!(ts instanceof Date) || ts < windowStart) continue;

    const entry = {
      lessonUnitId: String(row[WUR_LESSON_UNIT_ID] || "").trim(),
      response: String(row[WUR_RESPONSE] || "").trim(),
      timestamp: ts,
    };

    if (!result.has(email)) result.set(email, []);
    result.get(email).push(entry);
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  return result;
}

// ---------------------------------------------------------------------------
// getOrCreateStudentDoc_
// Looks up the student's Doc in StudentDocRegistry. Creates a new Doc and
// registry row if none exists. Returns { docId, isNew } or null on failure.
//
// SHARING: the Doc is shared with the student's school email at creation
// time, VIEW access only. The teacher does not need to be explicitly added
// — they own the Doc via the script's execution identity (Execute as: Me),
// same pattern as generateAlignmentReport() in Script 26.
// ---------------------------------------------------------------------------
function getOrCreateStudentDoc_(registrySheet, email, name, cfg) {
  const data = registrySheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase() === email.toLowerCase()) {
      return { docId: String(data[i][SDR_DOC_ID]).trim(), isNew: false };
    }
  }

  // No existing row — create a new Doc.
  try {
    const title = "Student Context — " + name + " (" + email + ")";
    const folder = cfg.teacherFolderId
      ? DriveApp.getFolderById(cfg.teacherFolderId)
      : DriveApp.getRootFolder();

    const doc = DocumentApp.create(title);
    const docId = doc.getId();
    DriveApp.getFileById(docId).moveTo(folder);

    const body = doc.getBody();
    body.appendParagraph("STUDENT CONTEXT RECORD")
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(name + "  ·  " + email);
    body.appendParagraph(
      "This document accumulates weekly. It shows completed assignments " +
      "and warm-up reflections as they happen across the year. Only weeks " +
      "with new activity are recorded — gaps in the timeline mean no new " +
      "submissions that week, not a missed entry."
    ).setItalic(true);
    body.appendParagraph("").appendHorizontalRule();
    doc.saveAndClose();

    // Share view-only with the student. Fails gracefully if the address
    // is not a valid Drive-recognized account — logged, not fatal, since
    // the Doc itself is still created and visible to the teacher either way.
    try {
      DriveApp.getFileById(docId).addViewer(email);
    } catch (shareErr) {
      Logger.log("[S29] Could not share doc with " + email + ": " + shareErr.message +
        " — doc created but student may not have access yet.");
    }

    const docUrl = "https://docs.google.com/document/d/" + docId + "/edit";
    const now = new Date();
    const newRow = new Array(7).fill("");
    newRow[SDR_STUDENT_EMAIL] = email;
    newRow[SDR_STUDENT_NAME] = name;
    newRow[SDR_DOC_ID] = docId;
    newRow[SDR_DOC_URL] = docUrl;
    newRow[SDR_CREATED_AT] = now;
    newRow[SDR_LAST_UPDATED_AT] = "";
    newRow[SDR_LAST_RUN_HAD_CONTENT] = "";
    registrySheet.appendRow(newRow);

    Logger.log("[S29] Created new student doc for " + email + " — " + docUrl);
    return { docId, isNew: true };

  } catch (err) {
    Logger.log("[S29] Doc creation failed for " + email + ": " + err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// appendWeeklySection_
// Appends one dated section to the student's Doc covering this week's
// assignments and warm-up responses. Never overwrites prior content —
// always appends at the end of the body.
// ---------------------------------------------------------------------------
function appendWeeklySection_(docId, runTimestamp, assignments, warmUps) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  const dateStr = Utilities.formatDate(
    runTimestamp, Session.getScriptTimeZone(), "MMMM d, yyyy"
  );

  body.appendParagraph("Week of " + dateStr)
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);

  if (assignments.length > 0) {
    body.appendParagraph("Completed Assignments")
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    assignments.forEach(a => {
      const line = "• " + (a.courseName || a.configId || "Assignment") +
        "  —  " + (a.status || "status unknown") +
        (a.lastEval ? "  ·  evaluated " + formatDateShort_(a.lastEval) : "");
      const p = body.appendParagraph(line);
      if (a.studentFileURL) {
        // Link the line to the student's file where available.
        try {
          p.editAsText().setLinkUrl(0, line.length - 1, a.studentFileURL);
        } catch (e) { /* non-fatal — link is a nicety, not a requirement */ }
      }
    });
  }

  if (warmUps.length > 0) {
    body.appendParagraph("Warm-Up Reflections")
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    warmUps.forEach(w => {
      body.appendParagraph(w.lessonUnitId + "  ·  " + formatDateShort_(w.timestamp))
        .setBold(true).setFontSize(10);
      body.appendParagraph(w.response).setItalic(true);
    });
  }

  body.appendParagraph("");
  doc.saveAndClose();
}

// ---------------------------------------------------------------------------
// updateRegistryTimestamp_
// ---------------------------------------------------------------------------
function updateRegistryTimestamp_(registrySheet, email, runTimestamp, hadContent) {
  const data = registrySheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase() === email.toLowerCase()) {
      registrySheet.getRange(i + 1, SDR_LAST_UPDATED_AT + 1).setValue(runTimestamp);
      registrySheet.getRange(i + 1, SDR_LAST_RUN_HAD_CONTENT + 1).setValue(hadContent ? "TRUE" : "FALSE");
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// formatDateShort_
// ---------------------------------------------------------------------------
function formatDateShort_(d) {
  try {
    if (!(d instanceof Date)) d = new Date(d);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d");
  } catch (e) { return String(d); }
}

// ---------------------------------------------------------------------------
// getStudentDocForViewer_
// Called by Script 07's new Student Context tab. Given a viewer email,
// returns their doc info if a match exists in the registry. Used to scope
// the student-facing view to "own data only" — no cross-student access,
// by design (see CAS M4 design notes).
// ---------------------------------------------------------------------------
function getStudentDocForViewer_(viewerEmail) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  if (!registrySheet) return null;

  const normalized = String(viewerEmail || "").trim().toLowerCase();
  const data = registrySheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase() === normalized) {
      return {
        docId: String(data[i][SDR_DOC_ID]).trim(),
        docUrl: String(data[i][SDR_DOC_URL]).trim(),
        lastUpdatedAt: data[i][SDR_LAST_UPDATED_AT] || null,
      };
    }
  }
  return null; // no doc yet — viewer has no recorded activity
}

// ---------------------------------------------------------------------------
// getAllStudentDocsForTeacher_
// Called by Script 07's new Student Context tab, teacher view only.
// Returns the full roster with doc links — this is the ONLY function that
// returns cross-student data, and it is gated by the caller being the
// configured teacher (Script 07 checks this before calling, same pattern
// as every other teacher-only function in this codebase).
// ---------------------------------------------------------------------------
function getAllStudentDocsForTeacher_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  if (!registrySheet) return [];

  const data = registrySheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    results.push({
      email: String(data[i][SDR_STUDENT_EMAIL]).trim(),
      name: String(data[i][SDR_STUDENT_NAME]).trim(),
      docUrl: String(data[i][SDR_DOC_URL]).trim(),
      createdAt: data[i][SDR_CREATED_AT] || null,
      lastUpdatedAt: data[i][SDR_LAST_UPDATED_AT] || null,
      lastRunHadContent: String(data[i][SDR_LAST_RUN_HAD_CONTENT]).trim() === "TRUE",
    });
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

// ---------------------------------------------------------------------------
// createStudentAggregatorTabs_
// Run once manually. Creates StudentDocRegistry and WarmUpResponses tabs.
// Safe to re-run — skips tabs that already exist.
// ---------------------------------------------------------------------------
function createStudentAggregatorTabs_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  _createTabIfMissingS29_(ss, cfg.tabs.studentDocRegistry, [
    "student_email", "student_name", "doc_id", "doc_url",
    "created_at", "last_updated_at", "last_run_had_content"
  ]);

  _createTabIfMissingS29_(ss, cfg.tabs.warmUpResponses, [
    "timestamp", "student_email", "lesson_unit_id", "response"
  ]);

  Logger.log("[S29] Student aggregator tab creation complete.");
}

function _createTabIfMissingS29_(ss, tabName, headers) {
  if (ss.getSheetByName(tabName)) {
    Logger.log("[S29] Tab '" + tabName + "' already exists — skipping.");
    return;
  }
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  Logger.log("[S29] Created tab: " + tabName);
}

// ---------------------------------------------------------------------------
// installStudentAggregatorTrigger_
// Run once manually. Installs runWeeklyStudentAggregation_ as a 7-day
// time-based trigger. Safe to re-run — checks for an existing trigger first.
// ---------------------------------------------------------------------------
function installStudentAggregatorTrigger_() {
  const existing = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runWeeklyStudentAggregation_");

  if (existing.length === 0) {
    ScriptApp.newTrigger("runWeeklyStudentAggregation_")
      .timeBased()
      .everyDays(7)
      .atHour(3) // run overnight — low contention, doesn't interrupt class use
      .create();
    Logger.log("[S29] Weekly trigger installed: runWeeklyStudentAggregation_ every 7 days, ~3am.");
  } else {
    Logger.log("[S29] Weekly trigger already installed — skipping.");
  }

  // Health check
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  [cfg.tabs.ledger, cfg.tabs.studentDocRegistry, cfg.tabs.warmUpResponses].forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    Logger.log("[S29] Tab '" + tabName + "': " + (sheet ? "FOUND" : "MISSING — run createStudentAggregatorTabs_() first."));
  });
}

// ---------------------------------------------------------------------------
// runStudentAggregationNow_ — MANUAL TESTING ONLY
// Identical to the trigger entry point but callable directly from the
// Script Editor for testing without waiting a week. Not wired to any
// trigger or client call — exists purely for verification during setup.
// ---------------------------------------------------------------------------
function runStudentAggregationNow_() {
  Logger.log("[S29] Manual test run invoked — identical logic to the weekly trigger.");
  runWeeklyStudentAggregation_();
}
