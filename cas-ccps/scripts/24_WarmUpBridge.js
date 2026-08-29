// =============================================================================
// FILE: 24_WarmUpBridge.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Stage 3 of the 3am cron — builds WarmUpQueue rows for all
//          students in classes meeting tomorrow. Runs at 3:30am, after
//          Script 23 (3:00am) has updated StudentProfiles.
//
// ENTRY POINT:
//   buildWarmUpQueues() — called by 3:30am time trigger
//
// WHAT IT DOES:
//   1. Determines tomorrow's date and day type (ODD / EVEN)
//   2. Reads ClassSchedule for periods meeting tomorrow (day_type match + DAILY)
//   3. For each matching period:
//      a. Finds LessonContext row for teacher + period + tomorrow's date
//      b. Reads full competency texts from CompetencyRegistry
//      c. Reads enrolled students from Ledger for this teacher + period
//      d. Calls getStudentProfileSnapshot_() per student (from Script 23)
//         — computes competency_gaps against today's lesson at snapshot time
//      e. Builds all queue rows in memory
//      f. Writes in a single setValues() batch (not appendRow())
//      g. Updates LessonContext warm_up_generated to "QUEUED"
//   4. Deduplication: skips lesson_id + student_email pairs already in queue
//
// TRIGGER:
//   Time-based · every day at 3:30am · installed by installWarmUpTriggers_()
//   in Script 23. Must run AFTER Script 23 (3:00am) completes.
//
// CONFIG KEYS:
//   CENTRAL_LEDGER_SS_ID  — Central Ledger spreadsheet ID
//   TEACHER_EMAIL         — filters to this teacher's classes
//   CURRENT_TERM          — for Ledger filtering
//   M2_ENABLED            — guard; skips if "false"
//
// TAB NAMES (via cfg.tabs):
//   cfg.tabs.classSchedule        — "ClassSchedule"
//   cfg.tabs.lessonContext        — "LessonContext"
//   cfg.tabs.competencyRegistry   — "CompetencyRegistry"
//   cfg.tabs.ledger               — "Ledger"
//   cfg.tabs.studentProfiles      — "StudentProfiles"
//   cfg.tabs.warmUpQueue          — "WarmUpQueue"
//
// PERFORMANCE NOTES:
//   All WarmUpQueue rows for a period are written in a single setValues() call.
//   At 40 students per period × 4 periods = 160 rows total, written in 4 batches.
//   No appendRow() calls — batch writes keep execution time under 60 seconds.
//
// =============================================================================

// ── WarmUpQueue column indices (0-based) — canonical order ───────────────────
// Must match createWarmUpTabs_() header definition in Script 23
// and WR_ constants in Script 25.
const WQ24_QUEUE_ID             = 0;
const WQ24_LESSON_ID            = 1;
const WQ24_STUDENT_EMAIL        = 2;
const WQ24_STUDENT_NAME         = 3;
const WQ24_GOOGLE_ID            = 4;
const WQ24_LESSON_DATE          = 5;
const WQ24_LESSON_CTX_SNAP      = 6;
const WQ24_STUDENT_PROFILE_SNAP = 7;
const WQ24_STATUS               = 8;
const WQ24_DOC_ID               = 9;
const WQ24_DOC_URL              = 10;
const WQ24_WORD_COUNT           = 11;
const WQ24_WORD_COUNT_SCORE     = 12;
const WQ24_GRAMMAR_SCORE        = 13;
const WQ24_ENGAGEMENT_SCORE     = 14;
const WQ24_EXTRA_CREDIT         = 15;
const WQ24_TOTAL_SCORE          = 16;
const WQ24_FLOW4_FEEDBACK       = 17;
const WQ24_RESPONSE_TEXT        = 18; // Script 25 writes extracted response
const WQ24_ARCHETYPE            = 19; // Flow 3 writes selected archetype back to queue row
const WQ24_BRIDGE_OUTPUT        = 20; // Flow 5 writes bridge paragraph (prior → today)

// Total column count for WarmUpQueue — update if schema changes
const WQ24_COL_COUNT = 21;

// ── LessonContext column indices (0-based) — from Script 22 ──────────────────
const LC24_LESSON_ID        = 0;
const LC24_TEACHER_EMAIL    = 1;
const LC24_LESSON_DATE      = 3;
const LC24_PERIOD_OR_CLASS  = 4;
const LC24_ACTIVITY_DESC    = 5;
const LC24_LEARNING_OBJ     = 6;
const LC24_KEY_VOCAB        = 7;
const LC24_PRIOR_CONNECTION = 8;
const LC24_COMPETENCY_IDS   = 9;
const LC24_STATUS           = 10;
const LC24_WARM_UP_GENERATED = 14; // new column added to LessonContext for warm-up status

// ── ClassSchedule column indices (0-based) ───────────────────────────────────
const CS_TEACHER_EMAIL = 0;
const CS_PERIOD        = 1;
const CS_DAY_TYPE      = 2;
const CS_COURSE_NAME   = 3;
const CS_ACTIVE        = 4;

// ── Ledger column indices (0-based) — from Module 1 ──────────────────────────
const LD24_GOOGLE_ID     = 1;
const LD24_STUDENT_NAME  = 4;
const LD24_TEACHER_EMAIL = 8;
const LD24_PERIOD        = 11;
const LD24_STATUS        = 12;
const LD24_TERM          = 18;

// ---------------------------------------------------------------------------
// buildWarmUpQueues — primary entry point
// Called by 3:30am time trigger. Processes all periods meeting tomorrow.
// ---------------------------------------------------------------------------
function buildWarmUpQueues() {
  const cfg = getConfig_();

  // ── M2 guard ──────────────────────────────────────────────────────────────
  // FIXED: unified to strict opt-in (`=== "true"`) — see
  // 22_LessonContextHandler.js's onLessonContextSubmit_() for the full
  // rationale (matches 07_TeacherDashboard.js's gate instead of silently
  // running when M2_ENABLED was never set).
  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled !== "true") {
    Logger.log("[S24] M2_ENABLED is not \"true\" — skipping queue build.");
    return;
  }

  const ss           = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacherEmail = cfg.teacherEmail;
  const currentTerm  = PropertiesService.getScriptProperties()
    .getProperty("CURRENT_TERM") || "";

  // ── Determine tomorrow ────────────────────────────────────────────────────
  const tomorrow    = getTomorrow_();
  const tomorrowStr = formatDateYMD_(tomorrow);
  const dayType     = getDayType_(tomorrow);

  Logger.log("[S24] Building warm-up queues for " + tomorrowStr +
             " (" + dayType + " day) | Teacher: " + teacherEmail);

  // ── Cron health check — verify Stage 2 (Script 25) ran recently ─────────
  // Stage 2 runs at 3:15am, Stage 3 (this script) at 3:30am.
  // If Stage 2 stamp is older than 45 minutes, evaluations may be incomplete.
  _checkCronHealth_("M2_STAGE2_LAST_RUN", "Script 25 (runWarmUpEvaluation)",
                    45, cfg.adminNotifyEmail || cfg.teacherEmail);

  // ── Load all required tabs in bulk ────────────────────────────────────────
  const scheduleSheet = ss.getSheetByName(cfg.tabs.classSchedule);
  const lcSheet       = ss.getSheetByName(cfg.tabs.lessonContext);
  const regSheet      = ss.getSheetByName(cfg.tabs.competencyRegistry);
  const ledgerSheet   = ss.getSheetByName(cfg.tabs.ledger);
  const wqSheet       = ss.getSheetByName(cfg.tabs.warmUpQueue);

  if (!scheduleSheet) { Logger.log("[S24] ClassSchedule tab not found — aborting."); return; }
  if (!lcSheet)       { Logger.log("[S24] LessonContext tab not found — aborting.");  return; }
  if (!ledgerSheet)   { Logger.log("[S24] Ledger tab not found — aborting.");          return; }
  if (!wqSheet)       { Logger.log("[S24] WarmUpQueue tab not found — aborting.");     return; }

  const scheduleData = scheduleSheet.getDataRange().getValues();
  const lcData       = lcSheet.getDataRange().getValues();
  const ledgerData   = ledgerSheet.getDataRange().getValues();
  const wqData       = wqSheet.getDataRange().getValues();

  // ── Build competency lookup map ───────────────────────────────────────────
  // { competency_id: { text, strand, subject } }
  const compMap = buildCompetencyLookup_(regSheet);

  // ── Build existing queue dedup set ────────────────────────────────────────
  // Key: lesson_id + "|" + student_email
  const existingQueueKeys = buildExistingQueueKeys_(wqData);

  // ── Find periods meeting tomorrow ─────────────────────────────────────────
  const meetingPeriods = getPeriodsForDay_(scheduleData, teacherEmail, dayType);

  if (meetingPeriods.length === 0) {
    Logger.log("[S24] No periods meet tomorrow (" + dayType + "). Nothing to queue.");
    return;
  }

  Logger.log("[S24] Periods meeting tomorrow: " + meetingPeriods.map(p => p.period).join(", "));

  let totalQueued = 0;
  let totalSkipped = 0;

  // ── Process each period ───────────────────────────────────────────────────
  for (const periodInfo of meetingPeriods) {
    const { period, courseName } = periodInfo;

    // ── Find LessonContext for this teacher + period + tomorrow ──────────
    const lesson = findLesson_(lcData, teacherEmail, period, tomorrowStr);
    if (!lesson) {
      Logger.log("[S24] No LessonContext found for period " + period +
                 " on " + tomorrowStr + " — skipping.");
      continue;
    }

    Logger.log("[S24] Period " + period + " | LessonID: " + lesson.lessonId +
               " | Objective: " + lesson.objective.substring(0, 60) + "…");

    // ── Build lesson context snapshot ────────────────────────────────────
    // Resolve competency IDs to full texts for Flow 3
    const compIds    = lesson.competencyIds
      .split(",").map(id => id.trim()).filter(Boolean);
    const compTexts  = compIds.map(id => ({
      id:     id,
      text:   compMap[id] ? compMap[id].text   : "[not found]",
      strand: compMap[id] ? compMap[id].strand : ""
    }));

    // ── Resolve pacing guide unit + warmup anchor for this lesson ────────
    // Script 31 (PacingGuideManager) resolves by lesson date.
    // warmup_anchor is the teacher-authored seed prompt for this unit.
    // Flow 3 personalizes the anchor rather than generating from scratch.
    const anchorData = getWarmUpAnchor_(tomorrowStr, courseName); // Script 31
    // Say/Do Ledger cas-ccps Extension 1 (SCR-to-warmup bridge): today's
    // resolved pacing-unit's own competency IDs (a different signal from
    // compIds above, which is what the TEACHER checked off for this lesson —
    // see getWarmUpAnchor_()'s own comment on this distinction). Used below,
    // per student, to look up SCR standing via Script 30 (same
    // central-ledger project — see the cross-project note on
    // getStudentScrStandingForCompetencies_() in 30_SCRSuggestionEngine.js).
    const pacingCompIds = (anchorData && anchorData.pacing_competency_ids) || [];

    // ── Build lesson context snapshot object ──────────────────────────────
    // Rubric data added by addRubricsToSnapshot_() from Script 32.
    // competency_rubrics replaces the simpler competency_texts array —
    // each entry includes skill_questions and archetype_question_map
    // so Flow 3 can select the best question per archetype without
    // needing to index into a flat array.
    const snapshotObj = {
      lesson_id:            lesson.lessonId,
      lesson_date:          tomorrowStr,
      objective:            lesson.objective,
      activity:             lesson.activity,
      vocabulary:           lesson.vocabulary,
      prior_connection:     lesson.priorConnection,
      competency_ids:       compIds,
      course_name:          courseName,
      period:               period,
      // ── Drive config — sourced from Script Properties via getConfig_() ──
      admin_root_folder_id: cfg.adminRootFolderId,
      teacher_name:         cfg.teacherName,
      teacher_email:        cfg.teacherEmail,
      // ── Pacing guide — sourced from Script 31 ─────────────────────────
      pacing_unit_id:          anchorData ? anchorData.unit_id          : null,
      pacing_unit_name:        anchorData ? anchorData.unit_name        : null,
      pacing_stage:            anchorData ? anchorData.stage            : null,
      warmup_anchor:           anchorData ? anchorData.anchor           : null,
      pacing_prior_connection: anchorData ? anchorData.prior_connection : null,
      pacing_key_vocabulary:   anchorData ? anchorData.key_vocabulary   : null,
      course_objective:        anchorData ? anchorData.course_objective : null,
      // ── Flow 5 bridge data ──────────────────────────────────────────────
      // flow5_prior_response: the student's most recent warm-up response.
      // Embedded here so Flow 5 can read it from the snapshot without
      // opening a separate doc or making additional Sheets reads.
      // null when student has no prior warm-up history.
      flow5_prior_response:    null  // populated per-student below in queue row
    };

    // ── Add competency rubrics — Script 32 ───────────────────────────────
    // Mutates snapshotObj in place. Adds competency_rubrics array and
    // keeps competency_texts for backward compatibility.
    // If CompetencyRubrics tab is empty (import not yet run), falls back
    // to the simple competency_texts array already built above.
    try {
      addRubricsToSnapshot_(snapshotObj, compIds); // Script 32
    } catch (rubricErr) {
      Logger.log("[S24] Rubric lookup failed — using basic competency texts: " +
                 rubricErr.message);
      snapshotObj.competency_texts = compTexts; // fallback
    }

    // snapshotObj is serialized per-student below as JSON.stringify(studentSnapshot)
    // studentSnapshot = snapshotObj (no prior response) or Object.assign clone (with bridge)

    // ── Get enrolled students for this period ────────────────────────────
    const students = getEnrolledStudents_(
      ledgerData, teacherEmail, period, currentTerm
    );

    if (students.length === 0) {
      Logger.log("[S24] No students enrolled in period " + period + " — skipping.");
      continue;
    }

    Logger.log("[S24] Period " + period + ": " + students.length + " students.");

    // ── Build queue rows in memory ────────────────────────────────────────
    const rowsToWrite = [];

    for (const student of students) {
      // Deduplication check
      const key = lesson.lessonId + "|" + student.email.toLowerCase();
      if (existingQueueKeys.has(key)) {
        totalSkipped++;
        Logger.log("[S24] Skipping duplicate: " + key);
        continue;
      }

      // Say/Do Ledger cas-ccps Extension 1: this student's current SCR
      // standing on today's pacing-unit competencies, computed fresh per
      // student (Script 30, same central-ledger project) — a soft
      // signal/tie-breaker only, folded into the profile snapshot below,
      // never overriding the evaluation-signals/shadow-archetype logic
      // getStudentProfileSnapshot_() already does.
      const scrStanding = getStudentScrStandingForCompetencies_(
        student.email, pacingCompIds
      );

      // Get student profile snapshot (computes gaps for today's lesson)
      const profileSnapshot = getStudentProfileSnapshot_(
        ss, cfg, student.email, compIds, scrStanding
      );

      const queueId = generateQueueId_();

      // ── Look up prior warm-up response for Flow 5 bridging ────────────────
      // Flow 5 takes the student's most recent scored response and the
      // current lesson's pacing_prior_connection to generate a bridge
      // paragraph. The bridge is written to WQ24_BRIDGE_OUTPUT by Flow 5
      // and can be prepended to the student's warm-up doc by Flow 3.
      const priorResponse = getPriorWarmUpResponse_(
        wqData, student.email, lesson.lessonId
      );

      const row     = new Array(WQ24_COL_COUNT).fill("");

      row[WQ24_QUEUE_ID]             = queueId;
      row[WQ24_LESSON_ID]            = lesson.lessonId;
      row[WQ24_STUDENT_EMAIL]        = student.email;
      row[WQ24_STUDENT_NAME]         = student.name;
      row[WQ24_GOOGLE_ID]            = student.email; // same in this system
      row[WQ24_LESSON_DATE]          = tomorrowStr;
      // Per-student snapshot: embed prior warm-up response for Flow 5
      let studentSnapshot = snapshotObj;
      if (priorResponse) {
        studentSnapshot = Object.assign({}, snapshotObj, {
          flow5_prior_response: priorResponse.responseText,
          flow5_prior_date:     priorResponse.lessonDate,
          flow5_prior_score:    priorResponse.totalScore
        });
      }

      row[WQ24_LESSON_CTX_SNAP]      = JSON.stringify(studentSnapshot);
      row[WQ24_STUDENT_PROFILE_SNAP] = JSON.stringify(profileSnapshot || {});
      // Rows with a prior response start at PENDING_BRIDGE, not PENDING —
      // Flow 5's Studio trigger listens for PENDING_BRIDGE specifically and
      // promotes the row to PENDING itself once bridge_output is written.
      // This is what actually enforces "Flow 5 runs before Flow 3": the two
      // flows now key off different status values instead of both listening
      // on the same "Status = PENDING" condition and racing on whichever
      // fires first. See cas-ccps/studio-steps/README.md's Flow 5 section
      // for the full reasoning — this two-status design replaces the single
      // "flow5_prior_response != null" trigger condition originally
      // documented in CAS_Flow3_Flow4_Specification.html, which depended on
      // a native trigger inspecting a nested field inside a JSON-blob
      // column — never confirmed as something Studio's condition builder
      // can actually do, and no longer needed either way.
      row[WQ24_STATUS]               = priorResponse ? "PENDING_BRIDGE" : "PENDING";
      // Scoring columns default to "" — written by S25 and Flow 4

      rowsToWrite.push(row);

      // Track in dedup set to prevent intra-batch duplicates
      existingQueueKeys.add(key);
    }

    if (rowsToWrite.length === 0) {
      Logger.log("[S24] No new rows to write for period " + period + ".");
      continue;
    }

    // ── Batch write all rows for this period ──────────────────────────────
    const startRow = wqSheet.getLastRow() + 1;
    wqSheet.getRange(startRow, 1, rowsToWrite.length, WQ24_COL_COUNT)
      .setValues(rowsToWrite);

    totalQueued += rowsToWrite.length;
    Logger.log("[S24] Written " + rowsToWrite.length + " queue rows for period " + period);

    // ── Mark LessonContext as QUEUED ──────────────────────────────────────
    markLessonQueued_(lcSheet, lcData, lesson.lessonId);
  }

  Logger.log("[S24] Queue build complete. Queued: " + totalQueued +
             " | Skipped (dupes): " + totalSkipped);

  // ── Cron health stamp ────────────────────────────────────────────────────
  PropertiesService.getScriptProperties().setProperties({
    "M2_STAGE3_LAST_RUN": new Date().toISOString(),
    "M2_STAGE3_STATUS":   totalQueued > 0 ? "OK_" + totalQueued : "OK_NONE"
  });
}

// ---------------------------------------------------------------------------
// getTomorrow_
// Returns a Date object representing tomorrow at midnight in script timezone.
// ---------------------------------------------------------------------------
function getTomorrow_() {
  const tz       = Session.getScriptTimeZone();
  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Normalize to midnight to avoid time-of-day issues in date comparisons
  return new Date(
    tomorrow.getFullYear(),
    tomorrow.getMonth(),
    tomorrow.getDate(),
    0, 0, 0, 0
  );
}

// ---------------------------------------------------------------------------
// getDayType_
// Returns "ODD", "EVEN", or "DAILY" based on the calendar day of the month.
// ODD  = date is an odd number (1, 3, 5...)
// EVEN = date is an even number (2, 4, 6...)
// First period always meets regardless — handled by ClassSchedule DAILY tag.
// ---------------------------------------------------------------------------
function getDayType_(date) {
  const dayOfMonth = date.getDate();
  return dayOfMonth % 2 === 1 ? "ODD" : "EVEN";
}

// ---------------------------------------------------------------------------
// formatDateYMD_
// Returns "YYYY-MM-DD" string for a Date object.
// Used for LessonContext lesson_date comparison.
// ---------------------------------------------------------------------------
// formatDateYMD_(date) is defined in 23_StudentProfileManager.js — both
// files are bound to the Central Ledger project, so it's already in
// scope here. A second copy used to live in this file (and a third in
// 25_WarmUpWriter.js) — same behavior, just duplicated; removed as a
// duplicate-declaration fix (tools/gas-lint/check.js), not a behavior change.

// ---------------------------------------------------------------------------
// getPeriodsForDay_
// Reads ClassSchedule and returns all periods for this teacher that meet
// on a given day type (ODD, EVEN, or DAILY).
// Returns: [{ period, courseName }]
// ---------------------------------------------------------------------------
function getPeriodsForDay_(scheduleData, teacherEmail, dayType) {
  const periods = [];

  for (let i = 1; i < scheduleData.length; i++) {
    const row      = scheduleData[i];
    const tEmail   = String(row[CS_TEACHER_EMAIL] || "").trim().toLowerCase();
    const period   = String(row[CS_PERIOD]        || "").trim();
    const dType    = String(row[CS_DAY_TYPE]      || "").trim().toUpperCase();
    const course   = String(row[CS_COURSE_NAME]   || "").trim();
    const active   = String(row[CS_ACTIVE]        || "TRUE").trim().toUpperCase();

    if (tEmail !== teacherEmail.toLowerCase()) continue;
    if (active === "FALSE") continue;

    // DAILY always meets; ODD/EVEN match the computed day type
    if (dType === "DAILY" || dType === dayType) {
      periods.push({ period, courseName: course });
    }
  }

  return periods;
}

// ---------------------------------------------------------------------------
// findLesson_
// Searches LessonContext for a row matching teacher + period + date.
// Returns a structured lesson object or null if not found.
// Skips SUPERSEDED rows — only uses the most recent RECEIVED or ALIGNMENT_LOGGED row.
// ---------------------------------------------------------------------------
function findLesson_(lcData, teacherEmail, period, dateStr) {
  // Scan in reverse — most recent submission wins if multiple exist
  for (let i = lcData.length - 1; i >= 1; i--) {
    const row = lcData[i];
    const tEmail  = String(row[LC24_TEACHER_EMAIL]   || "").trim().toLowerCase();
    // _normalizeLessonDateCell_ (22_LessonContextHandler.js) — the
    // lesson_date column can silently hold a real Date object (Sheets
    // auto-coerces ISO date strings on write) instead of the plain
    // "YYYY-MM-DD" string this was written as, which used to make this
    // comparison fail for every such row and silently stop the nightly
    // warm-up queue from ever finding tomorrow's lesson.
    const lDate   = _normalizeLessonDateCell_(row[LC24_LESSON_DATE]);
    const lPeriod = String(row[LC24_PERIOD_OR_CLASS] || "").trim();
    const status  = String(row[LC24_STATUS]          || "").trim();

    if (tEmail  !== teacherEmail.toLowerCase()) continue;
    if (lDate   !== dateStr)                    continue;
    if (lPeriod !== period)                     continue;
    if (status  === "SUPERSEDED")               continue;

    return {
      lessonId:        String(row[LC24_LESSON_ID]        || "").trim(),
      objective:       String(row[LC24_LEARNING_OBJ]     || "").trim(),
      activity:        String(row[LC24_ACTIVITY_DESC]    || "").trim(),
      vocabulary:      String(row[LC24_KEY_VOCAB]        || "").trim(),
      priorConnection: String(row[LC24_PRIOR_CONNECTION] || "").trim(),
      competencyIds:   String(row[LC24_COMPETENCY_IDS]   || "").trim(),
      rowIndex:        i + 1  // 1-based for range writes
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// getEnrolledStudents_
// Returns all active students for this teacher + period from the Ledger.
// Deduplicates by email — a student with multiple assignments in the same
// period appears once.
// Returns: [{ email, name }]
// ---------------------------------------------------------------------------
function getEnrolledStudents_(ledgerData, teacherEmail, period, currentTerm) {
  const seen     = new Set();
  const students = [];

  for (let i = 1; i < ledgerData.length; i++) {
    const row    = ledgerData[i];
    const tEmail = String(row[LD24_TEACHER_EMAIL] || "").trim().toLowerCase();
    const lPeriod = String(row[LD24_PERIOD]       || "").trim();
    const status = String(row[LD24_STATUS]        || "").trim();
    const term   = String(row[LD24_TERM]          || "").trim();
    const email  = String(row[LD24_GOOGLE_ID]     || "").trim().toLowerCase();

    if (tEmail  !== teacherEmail.toLowerCase()) continue;
    if (lPeriod !== period)                     continue;
    if (status  === "ARCHIVED")                 continue;
    if (currentTerm && term && term !== currentTerm) continue;
    if (!email || seen.has(email))              continue;

    seen.add(email);
    students.push({
      email: email,
      name:  String(row[LD24_STUDENT_NAME] || "").trim()
    });
  }

  return students;
}

// ---------------------------------------------------------------------------
// buildCompetencyLookup_
// Reads CompetencyRegistry and returns:
//   { competency_id: { text, strand, subject } }
// Only active rows. Used to resolve IDs to full text for lesson snapshots.
// ---------------------------------------------------------------------------
function buildCompetencyLookup_(regSheet) {
  if (!regSheet) return {};

  const data    = regSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId      = headers.indexOf("competency_id");
  const iText    = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand  = headers.indexOf("strand");
  const iActive  = headers.indexOf("active");

  if (iId === -1 || iText === -1) return {};

  const map = {};
  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const active = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;
    const id = String(row[iId]).trim();
    if (!id) continue;
    map[id] = {
      text:    iText    !== -1 ? String(row[iText]).trim()    : "",
      strand:  iStrand  !== -1 ? String(row[iStrand]).trim()  : "",
      subject: iSubject !== -1 ? String(row[iSubject]).trim() : ""
    };
  }

  return map;
}

// ---------------------------------------------------------------------------
// buildExistingQueueKeys_
// Reads current WarmUpQueue data and returns a Set of
// "lesson_id|student_email" keys for deduplication.
// ---------------------------------------------------------------------------
function buildExistingQueueKeys_(wqData) {
  const keys = new Set();
  if (wqData.length < 2) return keys;

  for (let i = 1; i < wqData.length; i++) {
    const lessonId = String(wqData[i][WQ24_LESSON_ID]     || "").trim();
    const email    = String(wqData[i][WQ24_STUDENT_EMAIL] || "").trim().toLowerCase();
    if (lessonId && email) keys.add(lessonId + "|" + email);
  }

  return keys;
}

// ---------------------------------------------------------------------------
// markLessonQueued_
// Updates the warm_up_generated column on the LessonContext row to "QUEUED".
// Signals to Script 22 and the dashboard that warm-ups have been queued
// for this lesson. Uses the row index stored in the lesson object.
//
// NOTE: LC24_WARM_UP_GENERATED (column index 14) is a new column appended
// to LessonContext beyond the original 14 columns (indices 0–13).
// createLessonContextWarmUpColumn_() adds it if missing.
// ---------------------------------------------------------------------------
function markLessonQueued_(lcSheet, lcData, lessonId) {
  for (let i = 1; i < lcData.length; i++) {
    if (String(lcData[i][LC24_LESSON_ID]).trim() === lessonId) {
      const sheetRow = i + 1;
      // Column 15 (1-based) = index 14 (0-based) = warm_up_generated
      lcSheet.getRange(sheetRow, LC24_WARM_UP_GENERATED + 1).setValue("QUEUED");
      Logger.log("[S24] Marked LessonContext QUEUED: " + lessonId);
      return;
    }
  }
  Logger.log("[S24] Could not find LessonContext row for " + lessonId + " to mark QUEUED.");
}

// ---------------------------------------------------------------------------
// getPriorWarmUpResponse_
// Finds the most recent SCORED warm-up response for a student, excluding
// the current lesson. Used to populate flow5_prior_response in the snapshot
// so Flow 5 can generate a bridge paragraph without additional Sheets reads.
//
// Parameters:
//   wqData       — full WarmUpQueue data array (pre-loaded)
//   studentEmail — student's email address
//   currentLessonId — exclude rows from today's lesson
//
// Returns:
//   { responseText, lessonDate, totalScore, queueId } or null
// ---------------------------------------------------------------------------
function getPriorWarmUpResponse_(wqData, studentEmail, currentLessonId) {
  if (!wqData || wqData.length < 2) return null;

  const emailLower = studentEmail.toLowerCase();
  let best = null;

  for (let i = 1; i < wqData.length; i++) {
    const row = wqData[i];
    const rowEmail    = String(row[WQ24_STUDENT_EMAIL] || "").trim().toLowerCase();
    const rowStatus   = String(row[WQ24_STATUS]        || "").trim();
    const rowLessonId = String(row[WQ24_LESSON_ID]     || "").trim();
    // _normalizeLessonDateCell_ — see 22_LessonContextHandler.js. The
    // "most recent" comparison below (`rowDate > best.lessonDate`) relies
    // on lexicographic YYYY-MM-DD ordering also being chronological
    // ordering, which breaks if this cell got silently coerced to a Date.
    const rowDate     = _normalizeLessonDateCell_(row[WQ24_LESSON_DATE]);
    const rowResponse = String(row[WQ24_RESPONSE_TEXT] || "").trim();

    if (rowEmail    !== emailLower)    continue;
    if (rowLessonId === currentLessonId) continue; // skip today's lesson
    if (rowStatus   !== "SCORED")      continue; // only use scored responses
    if (!rowResponse || rowResponse.length < 10) continue; // skip empty

    // Keep most recent (latest lesson date)
    if (!best || rowDate > best.lessonDate) {
      best = {
        responseText: rowResponse.substring(0, 800), // cap at 800 chars for snapshot
        lessonDate:   rowDate,
        totalScore:   Number(row[WQ24_TOTAL_SCORE] || 0),
        queueId:      String(row[WQ24_QUEUE_ID]    || "").trim()
      };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// generateQueueId_
// Format: WUQ-YYYYMMDD-XXXX (4 hex chars)
// ---------------------------------------------------------------------------
function generateQueueId_() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, "0");
  const dd   = String(now.getDate()).padStart(2, "0");
  const hex  = Math.floor(Math.random() * 0xffff)
    .toString(16).toUpperCase().padStart(4, "0");
  return "WUQ-" + yyyy + mm + dd + "-" + hex;
}

// ---------------------------------------------------------------------------
// createLessonContextWarmUpColumn_
// Run once manually to add the warm_up_generated column to the
// existing LessonContext tab. Safe to re-run — checks if column exists first.
//
// This column extends LessonContext from 14 to 15 columns.
// warm_up_generated values:
//   ""        — not yet queued
//   "QUEUED"  — Script 24 has written WarmUpQueue rows
//   "DELIVERED" — Flow 3 has created all warm-up docs for this lesson
// ---------------------------------------------------------------------------
function createLessonContextWarmUpColumn_() {
  const cfg    = getConfig_();
  const ss     = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet  = ss.getSheetByName(cfg.tabs.lessonContext);

  if (!sheet) {
    Logger.log("[S24] LessonContext tab not found.");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.includes("warm_up_generated")) {
    Logger.log("[S24] warm_up_generated column already exists — skipping.");
    return;
  }

  const newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol).setValue("warm_up_generated").setFontWeight("bold");
  Logger.log("[S24] Added warm_up_generated column at position " + newCol);
}

// ---------------------------------------------------------------------------
// validateQueueBuild — run manually to verify last queue build
// Summarizes WarmUpQueue rows written in the last 24 hours.
// ---------------------------------------------------------------------------
function validateQueueBuild() {
  const cfg     = getConfig_();
  const ss      = SpreadsheetApp.openById(cfg.ledgerSsId);
  const wqSheet = ss.getSheetByName(cfg.tabs.warmUpQueue);

  if (!wqSheet) {
    Logger.log("[VALIDATE] WarmUpQueue tab not found.");
    return;
  }

  const data    = wqSheet.getDataRange().getValues();
  const now     = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const teacherEmail = getConfig_().teacherEmail.toLowerCase();

  let recent  = 0;
  let pending = 0;
  let pendingBridge = 0;
  const periodCounts = {};

  for (let i = 1; i < data.length; i++) {
    const row         = data[i];
    const studentEmail = String(row[WQ24_STUDENT_EMAIL] || "").trim();
    const status       = String(row[WQ24_STATUS]        || "").trim();
    // _normalizeLessonDateCell_ — see 22_LessonContextHandler.js.
    const lessonDate   = _normalizeLessonDateCell_(row[WQ24_LESSON_DATE]);

    // Check if this row's lesson_date is tomorrow
    const tomorrow = formatDateYMD_(getTomorrow_());
    if (lessonDate !== tomorrow) continue;
    recent++;
    if (status === "PENDING") pending++;
    if (status === "PENDING_BRIDGE") pendingBridge++;

    // Count by period — extract from lesson context snapshot
    try {
      const snap = JSON.parse(String(row[WQ24_LESSON_CTX_SNAP] || "{}"));
      const p = snap.period || "unknown";
      periodCounts[p] = (periodCounts[p] || 0) + 1;
    } catch (e) {}
  }

  Logger.log("[VALIDATE] WarmUpQueue build summary for " + formatDateYMD_(getTomorrow_()) + ":");
  Logger.log("[VALIDATE]   Total rows queued: " + recent);
  Logger.log("[VALIDATE]   Status PENDING:        " + pending + " (routes straight to Flow 3)");
  Logger.log("[VALIDATE]   Status PENDING_BRIDGE: " + pendingBridge + " (routes to Flow 5 first)");
  Logger.log("[VALIDATE]   By period:");
  Object.entries(periodCounts).sort().forEach(([p, n]) =>
    Logger.log("[VALIDATE]     Period " + p + ": " + n + " students")
  );

  if (recent === 0) {
    Logger.log("[VALIDATE] ⚠ No rows queued for tomorrow. Check LessonContext submissions and ClassSchedule.");
  } else {
    Logger.log("[VALIDATE] ✓ Queue build verified.");
  }
}
