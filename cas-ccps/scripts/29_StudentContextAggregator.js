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
//   setupStudentContextDocs()  — run once from the editor: makes the tabs
//     and installs the trigger (the two underscore functions it calls are
//     hidden from the Run dropdown, so until 2026-10-27 neither had been run
//     and no doc existed)
//   previewStudentContextDocs()  — what a run would do; changes nothing
//   buildStudentContextDocsNow()  — a run now, instead of waiting a week
//   addContextWeekBookmarks()  — once: bookmarks the weeks written before
//     each week had one (the dashboards' link to one week)
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
//
// Read once per execution (2026-10-28): getConfig_() reads every Script
// Property, and these are called per Ledger row and per student. A
// preview of 92 students spent its whole time budget here and reached 44.
let _studentEmailDomainMemo_ = "";
let _studentIdPatternMemo_ = null;
function _studentEmailDomain_() {
  if (!_studentEmailDomainMemo_) _studentEmailDomainMemo_ = getConfig_().studentEmailDomain || "ccpsnet.net";
  return _studentEmailDomainMemo_;
}
function _studentIdPattern_() {
  if (!_studentIdPatternMemo_) {
    const escapedDomain = _studentEmailDomain_().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    _studentIdPatternMemo_ = new RegExp("^\\d{7}@" + escapedDomain + "$");
  }
  return _studentIdPatternMemo_;
}

// StudentDocRegistry column indices (SDR_*) live in 00_SharedConfig.js
// (2026-10-27), so the Student Dashboard can find a student's doc too.

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
  return _s29Run_({});
}

// Stops starting new students after this long, inside Apps Script's 6-minute
// limit: the first run makes a doc for every student, a few seconds each.
const S29_BUDGET_MS = 4.5 * 60 * 1000;

// The run. opts.dryRun counts what would happen and changes nothing.
// Each student's window starts at the later of 7 days ago and their doc's
// last update, so a second run (a budget stop, a manual run before the
// trigger) adds only what is new and never repeats a week.
function _s29Run_(opts) {
  const o = opts || {};
  const dryRun = !!o.dryRun;
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  const warmUpSheet = ss.getSheetByName(cfg.tabs.warmUpResponses);
  const summary = { dryRun: dryRun, roster: 0, created: 0, updated: 0, noContent: 0,
    invalidId: 0, failed: 0, notReached: 0 };

  if (!ledgerSheet) {
    Logger.log("[S29] Ledger tab not found. Aborting run.");
    summary.error = "Ledger tab not found";
    return summary;
  }
  if (!registrySheet) {
    Logger.log("[S29] StudentDocRegistry tab not found. Run setupStudentContextDocs() first.");
    summary.error = "StudentDocRegistry tab not found: run setupStudentContextDocs()";
    return summary;
  }

  const started = Date.now();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 7);
  const runTimestamp = new Date();

  Logger.log("[S29] " + (dryRun ? "Preview" : "Weekly aggregation run") + " starting. Window: " +
    windowStart.toISOString() + " → " + runTimestamp.toISOString());

  // ── Step 1: build the student roster for this run ──────────────────────
  // Roster is derived from Ledger — every unique, validly-formatted
  // GoogleID with a StudentName attached. This is intentionally NOT a
  // separate roster sheet; the Ledger already accumulates this as students
  // submit work, and duplicating it would create a second source of truth.
  const roster = buildValidatedStudentRoster_(ledgerSheet);
  summary.roster = roster.size;
  Logger.log("[S29] Roster built: " + roster.size + " valid student(s) found in Ledger.");

  if (roster.size === 0) {
    Logger.log("[S29] No valid students found this run. Nothing to do.");
    return summary;
  }

  // ── Step 2: pull this week's data, grouped by student email ────────────
  const weeklyAssignments = getWeeklyAssignments_(ledgerSheet, windowStart);
  const weeklyWarmUps = warmUpSheet
    ? getWeeklyWarmUps_(warmUpSheet, windowStart)
    : new Map();
  // Every warm-up since 2026-10-19 is answered in the Student Dashboard's
  // text box, not the old form, so this record showed none of them; the
  // baseline answers (D6) are the student's own account of how they work.
  mergeWarmUpMaps_(weeklyWarmUps, getWeeklyTextBoxWarmUps_(ss, cfg, windowStart));
  const lastUpdated = _s29LastUpdatedByEmail_(registrySheet);

  // ── Step 3: for each student, look up/create their Doc, append if needed ─
  // Logs name a student by their place in this run's roster, never by
  // address or name (the operator pastes these logs into sessions).
  let rosterPos = 0;
  for (const [email, name] of roster.entries()) {
    rosterPos++;
    const who = "roster entry " + rosterPos + " of " + roster.size;
    if (Date.now() - started > S29_BUDGET_MS) {
      summary.notReached = roster.size - rosterPos + 1;
      Logger.log("[S29] Time budget reached; " + summary.notReached + " student(s) not reached. " +
        "Run buildStudentContextDocsNow() again to finish them.");
      break;
    }
    if (!_studentIdPattern_().test(email)) {
      // Defensive — buildValidatedStudentRoster_ already filters, but never
      // trust a single validation point when writing to permanent Docs.
      Logger.log("[S29] Skipping invalid student identifier at write stage: " + who);
      summary.invalidId++;
      continue;
    }

    const since = lastUpdated.get(email.toLowerCase());
    const isNewer = function (e) { return !since || e.timestamp > since; };
    const assignments = (weeklyAssignments.get(email) || []).filter(isNewer);
    const warmUps = (weeklyWarmUps.get(email) || []).filter(isNewer);

    if (assignments.length === 0 && warmUps.length === 0) {
      // No new content this week for this student — do not write an
      // empty section. A living document should only grow when there is
      // something to show; an empty "Week of ..." header every week for
      // a student who submitted nothing is noise, not signal.
      summary.noContent++;
      continue;
    }

    if (dryRun) {
      if (lastUpdated.has(email.toLowerCase())) summary.updated++; else summary.created++;
      continue;
    }

    const docInfo = getOrCreateStudentDoc_(registrySheet, email, name, cfg);
    if (!docInfo) {
      Logger.log("[S29] Could not get or create doc for " + who + " — skipping this run.");
      summary.failed++;
      continue;
    }

    try {
      appendWeeklySection_(docInfo.docId, runTimestamp, assignments, warmUps);
      updateRegistryTimestamp_(registrySheet, email, runTimestamp, true);
      if (docInfo.isNew) summary.created++; else summary.updated++;
    } catch (err) {
      summary.failed++;
      Logger.log("[S29] Failed to append section to doc " + docInfo.docId + " (" + who + "): " + err.message);
    }
  }

  Logger.log("[S29] " + (dryRun ? "Preview (nothing changed). Would create: " : "Run complete. Created: ") +
    summary.created + " | " + (dryRun ? "Would update: " : "Updated: ") + summary.updated +
    " | Skipped (no content): " + summary.noContent +
    " | Skipped (invalid ID): " + summary.invalidId +
    " | Failed: " + summary.failed +
    " | Not reached: " + summary.notReached);
  return summary;
}

// Map<lower-case email, Date> of each registry row's last_updated_at.
// A row with a doc but no update yet (a failed first append) has no date,
// so its first section still gets the whole week.
function _s29LastUpdatedByEmail_(registrySheet) {
  const out = new Map();
  const data = registrySheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][SDR_STUDENT_EMAIL] || "").trim().toLowerCase();
    if (!email) continue;
    const at = data[i][SDR_LAST_UPDATED_AT];
    out.set(email, Object.prototype.toString.call(at) === "[object Date]" ? at : null);
  }
  return out;
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
  // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange() —
  // external product review Finding 6.
  const data = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();
  const roster = new Map();
  const invalidSeen = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[1] /* GoogleID */ || "").trim();
    const name = String(row[4] /* StudentName */ || "").trim();

    if (!email) continue; // blank row, skip silently — not an error

    if (!_studentIdPattern_().test(email)) {
      if (!invalidSeen.has(email)) {
        Logger.log("[S29] Invalid GoogleID format, excluded from roster: Ledger row " + (i + 1) +
          " (expected 7 digits @ccpsnet.net)");
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
// _turnInScoreOrNull_
// Normalizes one Ledger turn-in score cell to a number or null.
//
// Exists because `cell || null` is wrong here in a way that matters: a
// student who genuinely scored 0 would come back as null, i.e. as "not yet
// scored". In the aggregator that is a cosmetic slip; in a parent-facing
// report it is the difference between "your child scored 0" and "awaiting
// teacher review", so the distinction is worth a named function rather than
// an inline truthiness check each caller has to remember to get right.
//
// Empty string, null and undefined all mean the same thing — no score. The
// undefined case is real, not defensive: on a Ledger created before
// _ensureTurnInReviewColumns_() (07_TeacherDashboard.js) added columns
// 20-23, those cells don't exist at all.
// ---------------------------------------------------------------------------
function _turnInScoreOrNull_(cell) {
  if (cell === null || cell === undefined || cell === "") return null;
  const n = Number(cell);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// getWeeklyAssignments_
// Returns Map<email, [{ status, courseName, configId, lastEval,
//   studentFileURL, timestamp, suggestedScore, finalScore, scoreDecidedBy,
//   scoreDecidedAt }]>
// Filtered to rows where SubmissionTS or Timestamp falls inside the window.
// Uses SubmissionTS preferentially since that reflects actual student
// submission time; falls back to Timestamp if SubmissionTS is blank.
//
// The fallback is load-bearing beyond convenience: a row created this week
// but never submitted still lands in the window on its Timestamp, carrying
// its Status. That is what lets a caller report work that was assigned and
// NOT turned in — which for 36_WeeklyParentReport.js is the single thing a
// parent most wants to know, and would be invisible if this filtered on
// SubmissionTS alone.
// ---------------------------------------------------------------------------
// opts.teacherEmail / opts.schoolYear, when given, keep only that teacher's
// rows from that school year (student-data access policy: a teacher sees
// only their own students' work, this year's only).
function getWeeklyAssignments_(ledgerSheet, windowStart, opts) {
  const o = opts || {};
  const onlyTeacher = o.teacherEmail ? String(o.teacherEmail).trim().toLowerCase() : "";
  // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange() —
  // external product review Finding 6.
  const data = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();
  const result = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[1] || "").trim();
    if (!email || !_studentIdPattern_().test(email)) continue;
    if (onlyTeacher && String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== onlyTeacher) continue;
    if (o.schoolYear && !_isCurrentSchoolYearRow_(row, o.schoolYear)) continue;

    const submissionTs = row[LEDGER.SUBMISSION_TS];
    const fallbackTs = row[LEDGER.TIMESTAMP];
    const effectiveTs = (submissionTs instanceof Date) ? submissionTs
      : (fallbackTs instanceof Date) ? fallbackTs : null;

    if (!effectiveTs || effectiveTs < windowStart) continue;

    const entry = {
      courseName: String(row[LEDGER.COURSE_NAME] || "").trim(),
      configId: String(row[LEDGER.CONFIG_ID] || "").trim(),
      status: String(row[LEDGER.STATUS] || "").trim(),
      lastEval: row[LEDGER.LAST_EVAL] || null,
      studentFileURL: String(row[LEDGER.STUDENT_FILE_URL] || "").trim(),
      timestamp: effectiveTs,

      // Turn-in review scores (Ledger cols 20-23, LEDGER.TURN_IN_*).
      //
      // Read through _turnInScoreOrNull_ rather than `|| null`, because a
      // legitimately-zero score must survive: `0 || null` is null, which
      // would silently promote a real "scored 0" to "not yet scored". On a
      // Ledger created before _ensureTurnInReviewColumns_() existed these
      // cells are undefined, which the helper reports as null — genuinely
      // "no score", the same answer as an empty cell.
      //
      // suggestedScore is carried but is NOT for parent-facing output: it
      // is an AI value no teacher has acted on. Callers that render to
      // anyone other than the teacher must use finalScore only. See
      // 36_WeeklyParentReport.js, which is why these four are here.
      suggestedScore: _turnInScoreOrNull_(row[LEDGER.TURN_IN_SUGGESTED_SCORE]),
      finalScore: _turnInScoreOrNull_(row[LEDGER.TURN_IN_FINAL_SCORE]),
      scoreDecidedBy: String(row[LEDGER.TURN_IN_SCORE_DECIDED_BY] || "").trim(),
      scoreDecidedAt: row[LEDGER.TURN_IN_SCORE_DECIDED_AT] || null,

      // Where the work stands (37's recordEvaluationResult_), for the
      // parent report's plain-words status (2026-10-23). Undefined on a
      // Ledger no check has reached yet, read as "not checked".
      submittedAt: (submissionTs instanceof Date) ? submissionTs : null,
      checkCount: Number(row[LEDGER.CHECK_COUNT]) || 0,
      lastResult: String(row[LEDGER.LAST_RESULT] || "").trim(),
      firstPassedAt: (row[LEDGER.FIRST_PASSED_AT] instanceof Date) ? row[LEDGER.FIRST_PASSED_AT] : null,
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
// getWeeklyTextBoxWarmUps_
// Returns Map<email, [{ lessonUnitId, response, timestamp, question,
// baseline }]> for warm-ups answered in the Student Dashboard's text box
// (WarmUpTextBox, joined to WarmUpQueue by queue_id) and saved in the
// trailing 7-day window. baseline is the skill's wording for a baseline
// warm-up (41, D6), or "". Keyed by lower-case email; mergeWarmUpMaps_
// matches them to the roster's spelling.
// ---------------------------------------------------------------------------
function getWeeklyTextBoxWarmUps_(ss, cfg, windowStart) {
  const result = new Map();
  const wq = ss.getSheetByName(cfg.tabs.warmUpQueue);
  if (!wq || wq.getLastRow() < 2 || typeof readWarmUpTextBox_ !== "function") return result;
  const textBox = readWarmUpTextBox_(ss);
  const tz = Session.getScriptTimeZone();
  wq.getRange(2, 1, wq.getLastRow() - 1, 20).getValues().forEach(function (row) {
    const tb = textBox[String(row[0] || "").trim()];
    if (!tb) return;
    const response = String(tb.row[WTB.RESPONSE] || "").trim();
    const savedAt = tb.row[WTB.SUBMITTED_AT];
    const isDate = function (v) { return Object.prototype.toString.call(v) === "[object Date]"; };
    if (!response || !isDate(savedAt) || savedAt < windowStart) return;
    const email = String(row[4] || "").trim();
    if (!_studentIdPattern_().test(email.toLowerCase())) return;
    const parsed = typeof wfbParseBaseline_ === "function" ? wfbParseBaseline_(row[19]) : null;
    const lessonDate = isDate(row[5]) ? Utilities.formatDate(row[5], tz, "yyyy-MM-dd") : String(row[5] || "").trim();
    const entry = {
      lessonUnitId: "Warm-up for " + lessonDate,
      response: response,
      timestamp: savedAt,
      question: String(tb.row[WTB.WARMUP] || "").trim(),
      baseline: parsed && typeof WFB_BASELINE_SKILLS !== "undefined" ? WFB_BASELINE_SKILLS[parsed.n].text : "",
    };
    const key = email.toLowerCase();
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(entry);
  });
  return result;
}

// Adds `extra`'s entries (keyed by lower-case email) to `into` (keyed by the
// roster's spelling), oldest first.
function mergeWarmUpMaps_(into, extra) {
  const byLower = {};
  for (const k of into.keys()) byLower[k.toLowerCase()] = k;
  for (const [k, list] of extra.entries()) {
    const key = byLower[k] || k;
    if (!into.has(key)) into.set(key, []);
    into.get(key).push.apply(into.get(key), list);
    into.get(key).sort(function (a, b) { return a.timestamp - b.timestamp; });
  }
  return into;
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
      Logger.log("[S29] Could not share doc " + docId + " with its student: " + shareErr.message +
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

    Logger.log("[S29] Created new student doc " + docId + " (StudentDocRegistry row " +
      registrySheet.getLastRow() + ")");
    return { docId, isNew: true };

  } catch (err) {
    Logger.log("[S29] Doc creation failed for one student: " + err.message);
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

  const heading = body.appendParagraph("Week of " + dateStr)
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  _s29BookmarkWeek_(doc, heading);

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

  // Baseline warm-ups (D6) first, under their own heading: what the
  // student says about how they work and what helps them, by skill.
  const baseline = warmUps.filter(w => w.baseline);
  const lessonWarmUps = warmUps.filter(w => !w.baseline);
  if (baseline.length > 0) {
    body.appendParagraph("How They Work (baseline warm-ups)")
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    baseline.forEach(w => {
      body.appendParagraph(w.baseline + "  ·  " + formatDateShort_(w.timestamp))
        .setBold(true).setFontSize(10);
      if (w.question) body.appendParagraph("Asked: " + w.question).setFontSize(9);
      body.appendParagraph(w.response).setItalic(true);
    });
  }

  if (lessonWarmUps.length > 0) {
    body.appendParagraph("Warm-Up Reflections")
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    lessonWarmUps.forEach(w => {
      body.appendParagraph(w.lessonUnitId + "  ·  " + formatDateShort_(w.timestamp))
        .setBold(true).setFontSize(10);
      if (w.question) body.appendParagraph("Asked: " + w.question).setFontSize(9);
      body.appendParagraph(w.response).setItalic(true);
    });
  }

  body.appendParagraph("");
  doc.saveAndClose();
}

// A bookmark at the start of a week's heading, so the dashboards can link
// straight to that week ("<doc url>#bookmark=<id>"; 07 and 13 find it by
// the heading's text). Docs gives a heading no stable link of its own from
// Apps Script. Best effort: a week without one still opens with the doc.
function _s29BookmarkWeek_(doc, heading) {
  try {
    doc.addBookmark(doc.newPosition(heading, 0));
  } catch (e) {
    Logger.log("[S29] Week bookmark not added: " + e.message);
  }
}

// Editor, once (2026-10-28): adds the week bookmark to the weeks written
// before weeks had one, in every doc in StudentDocRegistry. A week that
// has one is left alone, so it is safe to run again, and it stops at the
// time budget: run it again to finish.
function addContextWeekBookmarks() {
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.studentDocRegistry);
  const out = { docs: 0, added: 0, failed: 0, notReached: 0 };
  if (!sheet || sheet.getLastRow() < 2) return out;
  const started = Date.now();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, SDR_DOC_ID + 1).getValues().forEach(function (r) {
    const docId = String(r[SDR_DOC_ID] || "").trim();
    if (!docId) return;
    if (Date.now() - started > S29_BUDGET_MS) { out.notReached++; return; }
    try {
      const doc = DocumentApp.openById(docId);
      const marked = {};
      doc.getBookmarks().forEach(function (b) {
        let el = b.getPosition().getElement();
        if (el.getType() === DocumentApp.ElementType.TEXT) el = el.getParent();
        if (el.getType() === DocumentApp.ElementType.PARAGRAPH) marked[String(el.asParagraph().getText()).trim()] = true;
      });
      const body = doc.getBody();
      for (let i = 0; i < body.getNumChildren(); i++) {
        const el = body.getChild(i);
        if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
        const p = el.asParagraph();
        const text = String(p.getText() || "").trim();
        if (p.getHeading() !== DocumentApp.ParagraphHeading.HEADING2 || text.indexOf("Week of ") !== 0 || marked[text]) continue;
        doc.addBookmark(doc.newPosition(p, 0));
        marked[text] = true;
        out.added++;
      }
      doc.saveAndClose();
      out.docs++;
    } catch (e) {
      out.failed++;
      Logger.log("[S29] Week bookmarks not added to a doc: " + e.message);
    }
  });
  Logger.log("[S29] Week bookmarks: " + out.added + " added in " + out.docs + " doc(s); " + out.failed + " failed" +
    (out.notReached ? "; " + out.notReached + " not reached (time budget): run addContextWeekBookmarks() again" : "") + ".");
  return out;
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
// FIXED (FERPA leak): this function used to return every row in
// StudentDocRegistry with no teacher filter at all — any authorized
// teacher saw every student in the district. StudentDocRegistry itself
// has no teacher-identity column (it's a flat student->doc index), so
// the per-teacher scoping has to come from a join against the Ledger
// tab, which does carry a real-time TeacherEmail column (index 8,
// populated at Form-1 intake — see 02_Form1_IntakeAndWorkspaceGenerator.js)
// and is the same tab this file already treats as its roster source of
// truth elsewhere (buildValidatedStudentRoster_ above). This mirrors
// 23_StudentProfileManager.js's buildShadowMatrixSummary_(), which
// filters the same way against its own teacher-scoped tab.
function getAllStudentDocsForTeacher_(teacherEmail) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  if (!registrySheet) return [];

  const normalizedTeacherEmail = String(teacherEmail || "").trim().toLowerCase();
  if (!normalizedTeacherEmail) return []; // no teacher identity — no roster

  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);
  const allowedStudentEmails = new Set();
  if (ledgerSheet) {
    // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange()
    // — external product review Finding 6.
    const ledgerData = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();
    for (let i = 1; i < ledgerData.length; i++) {
      const rowStudentEmail = String(ledgerData[i][1] /* GoogleID */ || "").trim().toLowerCase();
      const rowTeacherEmail = String(ledgerData[i][8] /* TeacherEmail */ || "").trim().toLowerCase();
      if (rowStudentEmail && rowTeacherEmail === normalizedTeacherEmail) {
        allowedStudentEmails.add(rowStudentEmail);
      }
    }
  }

  const data = registrySheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][SDR_STUDENT_EMAIL]).trim().toLowerCase();
    if (!allowedStudentEmails.has(rowEmail)) continue; // not this teacher's student
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
// setupStudentContextDocs / previewStudentContextDocs /
// buildStudentContextDocsNow — the Run-menu entry points (2026-10-27).
// The setup steps above end in "_", so the editor's Run dropdown hides them
// and the weekly trigger was never installed. Safe to re-run: each step
// checks what exists first, and a run adds only what is new since a
// student's last section.
// ---------------------------------------------------------------------------
function setupStudentContextDocs() {
  createStudentAggregatorTabs_();
  installStudentAggregatorTrigger_();
  const installed = ScriptApp.getProjectTriggers()
    .some(function (t) { return t.getHandlerFunction() === "runWeeklyStudentAggregation_"; });
  Logger.log("[S29] Setup done. Weekly trigger " + (installed ? "installed" : "NOT installed") +
    ". Next: previewStudentContextDocs(), then buildStudentContextDocsNow() to make this week's docs now.");
  return { triggerInstalled: installed };
}

function previewStudentContextDocs() {
  return _s29Run_({ dryRun: true });
}

function buildStudentContextDocsNow() {
  return _s29Run_({});
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
