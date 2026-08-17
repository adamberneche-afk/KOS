// =============================================================================
// FILE: 23_StudentProfileManager.js
// BOUND TO: Central Ledger spreadsheet AND the Teacher Dashboard standalone
//   web app — Script 07's getDashboardData() calls
//   buildShadowMatrixSummary_() below directly for the Module 2
//   warm-up-readiness panel, so this file (and its Script 31 dependency)
//   must be physically present in the Teacher Dashboard project too.
//   See tools/gas-lint/project-map.json's cas-ccps:teacher-dashboard entry.
// PURPOSE: Nightly batch update of the StudentProfiles tab.
//          Runs as Stage 1 of the 3am cron, before Script 24 (3:30am)
//          builds WarmUpQueue rows. Profiles must be current before
//          snapshots are taken — this ordering is mandatory.
//
// ENTRY POINT:
//   updateAllStudentProfiles() — called by 3:00am time trigger
//
// WHAT IT DOES:
//   For each student in the Ledger (filtered to this teacher):
//   1. Reads AlignmentLog for competencies addressed this term (class-level)
//   2. Reads STAGING_PIPELINE + ReviewQueue for last 3 evaluation outcomes.
//      Extracts structured analytic indicators from Flow 2 feedback text.
//      Stores as { strengths: [], gaps: [] } + one plain-language note.
//   3. Reads WarmUpQueue for last 10 warm-up scores + extra credit totals.
//      Extra credit flags are set by Script 25 during the 3:15am evaluation
//      cron. Script 23 reads those flags here — no doc opens required.
//   4. Computes avg_engagement_score from warm-up history.
//   5. Upserts one row per student in StudentProfiles.
//
// EXTRA CREDIT DETECTION:
//   Script 23 does NOT open warm-up docs. Extra credit detection (scanning
//   for student replies after the Flow 4 feedback stamp) is Script 25's
//   responsibility. Script 25 sets the extra_credit flag on WarmUpQueue rows
//   during the 3:15am evaluation pass. Script 23 reads those flags here at
//   3:00am the following night — one night of lag, which is correct:
//   extra credit detected tonight feeds into tomorrow's warm-up personalization.
//
// EVALUATION INDICATOR EXTRACTION:
//   Script 23 opens student assignment docs (not warm-up docs) to extract
//   structured indicators from Flow 2's feedback text. This is capped at
//   MAX_EVAL_DOC_OPENS per run to stay within the 6-minute execution limit.
//   At 2 seconds per doc × 50 docs = 100 seconds — well within the limit.
//
// TRIGGER:
//   Time-based · every day at 3:00am · installed by installWarmUpTriggers_()
//   Must complete before Script 24 runs (Script 24 trigger: 3:30am)
//   Must complete before Script 25 runs (Script 25 trigger: 3:15am)
//   NOTE: Script 25's extra credit detection from TONIGHT runs at 3:15am.
//         Script 23 at 3:00am reads extra credit flags from LAST NIGHT.
//         This one-night lag is intentional and correct.
//
// CONFIG KEYS:
//   CENTRAL_LEDGER_SS_ID  — Central Ledger spreadsheet ID
//   TEACHER_EMAIL         — filters Ledger to this teacher's students
//   CURRENT_TERM          — term string for filtering
//   M2_ENABLED            — guard; skips if "false"
//
// TAB NAMES (via cfg.tabs):
//   cfg.tabs.ledger               — "Ledger"
//   cfg.tabs.alignmentLog         — "AlignmentLog"
//   cfg.tabs.stagingPipeline      — "STAGING_PIPELINE"
//   cfg.tabs.reviewQueue          — "ReviewQueue"
//   cfg.tabs.warmUpQueue          — "WarmUpQueue"
//   cfg.tabs.studentProfiles      — "StudentProfiles"
//   cfg.tabs.competencyRegistry   — "CompetencyRegistry"
//
// =============================================================================

// ── StudentProfiles column indices (0-based) — canonical order ───────────────
const SP_STUDENT_EMAIL          = 0;
const SP_STUDENT_NAME           = 1;
const SP_GOOGLE_ID              = 2;
const SP_TEACHER_EMAIL          = 3;
const SP_PERIOD                 = 4;
const SP_COMPETENCIES_ADDRESSED = 5;
const SP_COMPETENCY_GAPS        = 6;  // populated by getStudentProfileSnapshot_()
const SP_EVALUATION_SIGNALS     = 7;
const SP_WARMUP_SCORES          = 8;
const SP_EXTRA_CREDIT_COUNT     = 9;
const SP_AVG_ENGAGEMENT         = 10;
const SP_LAST_UPDATED           = 11;
const SP_SHADOW_MATRIX          = 12; // JSON — per-student × per-unit archetype confidence
const SP_UNIT_CURRENT           = 13; // current pacing guide unit_id as of last update
const SP_COL_COUNT              = 14;

// ── Ledger column indices (0-based) — Module 1 ───────────────────────────────
const LD_GOOGLE_ID     = 1;
const LD_FILE_ID       = 3;
const LD_STUDENT_NAME  = 4;
const LD_TEACHER_EMAIL = 8;
const LD_PERIOD        = 11;
const LD_STATUS        = 12;
const LD_TERM          = 18;

// ── WarmUpQueue column indices (0-based) — must match Script 24 + 25 ─────────
const WQ23_QUEUE_ID        = 0;
const WQ23_LESSON_ID       = 1;
const WQ23_STUDENT_EMAIL   = 2;
const WQ23_LESSON_DATE     = 5;
const WQ23_STATUS          = 8;
const WQ23_ENGAGEMENT_SCORE = 14;
const WQ23_EXTRA_CREDIT    = 15;  // set by Script 25 — Script 23 reads this
const WQ23_TOTAL_SCORE     = 16;
const WQ23_WORD_COUNT_SCORE = 12;
const WQ23_GRAMMAR_SCORE   = 13;
const WQ23_ARCHETYPE       = 19; // written by Flow 3 — read by shadow matrix update

// ── AlignmentLog column indices (0-based) — from Script 26 ───────────────────
const AL_TEACHER_EMAIL_23  = 4;
const AL_COMPETENCY_ID_23  = 6;

// ── STAGING_PIPELINE column indices (0-based) — from Module 1 ────────────────
// Headers resolved dynamically — tab uses string headers, not fixed positions.
// Constants defined here for documentation; actual reads use header lookup.

// ── Evaluation indicator taxonomy ────────────────────────────────────────────
// Structured tags extracted from Flow 2 feedback text.
// Stored in evaluation_signals as { strengths: [], gaps: [] }.
// Extend this list as additional competency domains are added.
const INDICATOR_TAXONOMY = [
  "analysis", "application", "industry_terminology", "supporting_evidence",
  "critical_thinking", "written_communication", "content_knowledge",
  "problem_solving", "research_skills", "professional_standards",
  "customer_service", "financial_literacy", "marketing_concepts",
  "event_management", "legal_compliance", "entrepreneurship"
];

// Maximum assignment doc opens per Script 23 run.
// At ~2 seconds per doc open: 50 × 2s = 100 seconds.
// Well within the 6-minute execution limit.
const MAX_EVAL_DOC_OPENS = 50;

// ---------------------------------------------------------------------------
// updateAllStudentProfiles — primary entry point
// Called by 3:00am time trigger. Runs Stage 1 of the nightly cron sequence.
// ---------------------------------------------------------------------------
function updateAllStudentProfiles() {
  const cfg = getConfig_();

  // ── M2 guard ──────────────────────────────────────────────────────────────
  // FIXED: unified to strict opt-in (`=== "true"`), matching
  // 07_TeacherDashboard.js's gate on the UI surfaces that depend on this
  // nightly job having actually run. The previous opt-out check
  // (`=== "false"`) let this run on an installation that never explicitly
  // set M2_ENABLED at all — see the identical fix in
  // 22_LessonContextHandler.js's onLessonContextSubmit_() for the full
  // rationale.
  const m2Enabled = PropertiesService.getScriptProperties()
    .getProperty("M2_ENABLED");
  if (m2Enabled !== "true") {
    Logger.log("[S23] M2_ENABLED is not \"true\" — skipping profile update.");
    return;
  }

  const ss           = SpreadsheetApp.openById(cfg.ledgerSsId);
  const teacherEmail = cfg.teacherEmail;
  const currentTerm  = PropertiesService.getScriptProperties()
    .getProperty("CURRENT_TERM") || "";

  Logger.log("[S23] Starting profile update | Teacher: " + teacherEmail +
             " | Term: " + currentTerm);

  // ── Load all required tabs in bulk — one API call per tab ─────────────────
  const ledgerSheet  = ss.getSheetByName(cfg.tabs.ledger);
  const alSheet      = ss.getSheetByName(cfg.tabs.alignmentLog);
  const wqSheet      = ss.getSheetByName(cfg.tabs.warmUpQueue);
  const spSheet      = ss.getSheetByName(cfg.tabs.studentProfiles);
  const stagingSheet = ss.getSheetByName(cfg.tabs.stagingPipeline);

  if (!ledgerSheet) { Logger.log("[S23] Ledger tab not found — aborting.");          return; }
  if (!spSheet)     { Logger.log("[S23] StudentProfiles tab not found — run createWarmUpTabs_()."); return; }

  const ledgerData  = ledgerSheet.getDataRange().getValues();
  const alData      = alSheet      ? alSheet.getDataRange().getValues()     : [[]];
  const wqData      = wqSheet      ? wqSheet.getDataRange().getValues()     : [[]];
  const spData      = spSheet.getDataRange().getValues();
  const stagingData = stagingSheet ? stagingSheet.getDataRange().getValues() : [[]];

  // ── Build lookup structures from in-memory data ───────────────────────────
  // All reads from Sheets are done above. Everything below is pure computation.
  const classCompetencies    = buildClassCompetencies_(alData, teacherEmail);
  const evalSignalsByStudent = buildEvalSignals_(stagingData, ledgerData, teacherEmail);
  const warmupDataByStudent  = buildWarmupData_(wqData);

  // ── Build existing profile index for upsert ───────────────────────────────
  // Map: email (lowercase) → 1-based sheet row number
  const existingProfiles = {};
  for (let i = 1; i < spData.length; i++) {
    const email = String(spData[i][SP_STUDENT_EMAIL]).trim().toLowerCase();
    if (email) existingProfiles[email] = i + 1;
  }

  // ── Build student roster for this teacher ─────────────────────────────────
  const students = buildStudentRoster_(ledgerData, teacherEmail, currentTerm);
  Logger.log("[S23] Processing " + students.length + " students.");

  // ── Upsert profiles — batch collect then write ────────────────────────────
  // Build all updated rows in memory, then write each upsert individually.
  // Cannot use a single setValues() for upserts because existing rows are
  // at different positions in the sheet. New rows are collected and
  // appended in one batch at the end.
  const newRows = [];
  let updated   = 0;

  for (const student of students) {
    try {
      const email = student.email.toLowerCase();

      const evalSignals    = evalSignalsByStudent[email] || [];
      const warmupHistory  = warmupDataByStudent[email]  || { scores: [], extraCreditCount: 0 };
      const warmupScores   = warmupHistory.scores;
      const extraCreditTotal = warmupHistory.extraCreditCount;

      // Compute rolling average engagement score from warm-up history
      const engagementScores = warmupScores
        .map(w => w.engagement)
        .filter(s => typeof s === "number" && !isNaN(s));
      const avgEngagement = engagementScores.length > 0
        ? Math.round(
            (engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length)
            * 100
          ) / 100
        : null;

      // ── Shadow matrix update ───────────────────────────────────────────────
      // Read existing shadow matrix from current profile row (if exists)
      let existingShadowMatrix = {};
      if (existingProfiles[email]) {
        const rowNum = existingProfiles[email];
        try {
          existingShadowMatrix = JSON.parse(
            spData[rowNum - 1][SP_SHADOW_MATRIX] || "{}"
          );
        } catch(e) { existingShadowMatrix = {}; }
      }

      // Resolve today's unit from pacing guide
      const todayStr   = formatDateYMD_(new Date());
      const currentUnit = resolveUnitForDate_(todayStr); // Script 31
      const unitCurrent = currentUnit ? currentUnit.unit_id : "";

      // Update shadow matrix with new scored warm-up data
      const updatedShadowMatrix = updateShadowMatrix_(
        email, existingShadowMatrix, warmupScores, wqData
      );

      const profileRow = buildProfileRow_(
        student, teacherEmail, classCompetencies,
        evalSignals, warmupScores, extraCreditTotal, avgEngagement,
        updatedShadowMatrix, unitCurrent
      );

      if (existingProfiles[email]) {
        // Update existing row in place — targeted range write
        const rowNum = existingProfiles[email];
        spSheet.getRange(rowNum, 1, 1, SP_COL_COUNT).setValues([profileRow]);
        updated++;
      } else {
        // Collect for batch append
        newRows.push(profileRow);
        existingProfiles[email] = -1; // prevent duplicate appends in this run
      }

    } catch (err) {
      Logger.log("[S23] Error processing " + student.email + ": " + err.message);
    }
  }

  // ── Batch append new student rows ─────────────────────────────────────────
  if (newRows.length > 0) {
    const startRow = spSheet.getLastRow() + 1;
    spSheet.getRange(startRow, 1, newRows.length, SP_COL_COUNT).setValues(newRows);
  }

  Logger.log("[S23] Profile update complete." +
             " Updated: " + updated +
             " | Inserted: " + newRows.length +
             " | Total: " + students.length);

  // ── Cron health stamp — read by Scripts 24 and 25 ─────────────────────
  PropertiesService.getScriptProperties().setProperties({
    "M2_STAGE1_LAST_RUN": new Date().toISOString(),
    "M2_STAGE1_STATUS":   "OK"
  });
}

// ---------------------------------------------------------------------------
// buildProfileRow_
// Constructs the full 12-column StudentProfiles row array for one student.
// competency_gaps is left empty — computed at snapshot time by
// getStudentProfileSnapshot_() when Script 24 builds queue rows.
// ---------------------------------------------------------------------------
function buildProfileRow_(student, teacherEmail, classCompetencies,
                          evalSignals, warmupScores, extraCreditTotal,
                          avgEngagement, shadowMatrix, unitCurrent) {
  const row = new Array(SP_COL_COUNT).fill("");
  row[SP_STUDENT_EMAIL]          = student.email;
  row[SP_STUDENT_NAME]           = student.name;
  row[SP_GOOGLE_ID]              = student.email;
  row[SP_TEACHER_EMAIL]          = teacherEmail;
  row[SP_PERIOD]                 = student.period;
  row[SP_COMPETENCIES_ADDRESSED] = JSON.stringify(classCompetencies);
  row[SP_COMPETENCY_GAPS]        = "[]"; // populated at queue-build time by S24
  row[SP_EVALUATION_SIGNALS]     = JSON.stringify(evalSignals);
  row[SP_WARMUP_SCORES]          = JSON.stringify(warmupScores);
  row[SP_EXTRA_CREDIT_COUNT]     = extraCreditTotal;
  row[SP_AVG_ENGAGEMENT]         = avgEngagement !== null ? avgEngagement : "";
  row[SP_LAST_UPDATED]           = new Date();
  row[SP_SHADOW_MATRIX]          = JSON.stringify(shadowMatrix || {});
  row[SP_UNIT_CURRENT]           = unitCurrent || "";
  return row;
}

// ---------------------------------------------------------------------------
// buildStudentRoster_
// Returns unique students for this teacher from the Ledger, filtered to
// the current term. Deduplicates by email.
// Returns: [{ email, name, period }]
// ---------------------------------------------------------------------------
function buildStudentRoster_(ledgerData, teacherEmail, currentTerm) {
  const seen     = new Set();
  const students = [];

  for (let i = 1; i < ledgerData.length; i++) {
    const row    = ledgerData[i];
    const tEmail = String(row[LD_TEACHER_EMAIL] || "").trim().toLowerCase();
    const status = String(row[LD_STATUS]        || "").trim();
    const term   = String(row[LD_TERM]          || "").trim();
    const email  = String(row[LD_GOOGLE_ID]     || "").trim().toLowerCase();

    if (tEmail !== teacherEmail.toLowerCase()) continue;
    if (status === "ARCHIVED")                 continue;
    if (currentTerm && term && term !== currentTerm) continue;
    if (!email || seen.has(email))             continue;

    seen.add(email);
    students.push({
      email:  email,
      name:   String(row[LD_STUDENT_NAME] || "").trim(),
      period: String(row[LD_PERIOD]       || "").trim()
    });
  }

  return students;
}

// ---------------------------------------------------------------------------
// buildClassCompetencies_
// Reads AlignmentLog and returns the array of competency IDs addressed by
// this teacher this term. This is class-level, not per-student — all
// students in the class are assumed to have encountered every lesson.
//
// Per-student competency gaps are computed at queue-build time in
// getStudentProfileSnapshot_() by diffing today's lesson's competency IDs
// against this class-level addressed set.
//
// Returns: [competency_id, ...]
// ---------------------------------------------------------------------------
function buildClassCompetencies_(alData, teacherEmail) {
  if (alData.length < 2) return [];

  const addressedIds = new Set();
  for (let i = 1; i < alData.length; i++) {
    const row    = alData[i];
    const tEmail = String(row[AL_TEACHER_EMAIL_23] || "").trim().toLowerCase();
    const compId = String(row[AL_COMPETENCY_ID_23] || "").trim();
    if (tEmail === teacherEmail.toLowerCase() && compId) {
      addressedIds.add(compId);
    }
  }

  return [...addressedIds];
}

// ---------------------------------------------------------------------------
// buildEvalSignals_
// Reads STAGING_PIPELINE for completed evaluation rows, then opens the
// student assignment doc to extract structured indicators from Flow 2
// feedback text. Capped at MAX_EVAL_DOC_OPENS per run.
//
// Returns: { student_email: [{ assignment_id, date, indicators, note }] }
// Each student keeps last 3 evaluations, most recent first.
// ---------------------------------------------------------------------------
function buildEvalSignals_(stagingData, ledgerData, teacherEmail) {
  const signals    = {};
  const docsOpened = { count: 0 };

  if (stagingData.length < 2) return signals;

  // Resolve STAGING_PIPELINE column indices from headers
  const stagingHeaders = stagingData[0].map(h => String(h).trim());
  const sFileIdx    = stagingHeaders.indexOf("StudentFileID");
  const sStatusIdx  = stagingHeaders.indexOf("Status");
  const sConfigIdx  = stagingHeaders.indexOf("ConfigID");

  if (sFileIdx === -1 || sStatusIdx === -1) {
    Logger.log("[S23] STAGING_PIPELINE missing expected headers — skipping eval signals.");
    return signals;
  }

  // Build file_id → { email, configId } map from Ledger
  const fileToStudent = {};
  for (let i = 1; i < ledgerData.length; i++) {
    const row    = ledgerData[i];
    const tEmail = String(row[LD_TEACHER_EMAIL] || "").trim().toLowerCase();
    if (tEmail !== teacherEmail.toLowerCase()) continue;
    const fileId   = String(row[LD_FILE_ID]     || "").trim();
    const email    = String(row[LD_GOOGLE_ID]   || "").trim().toLowerCase();
    const configId = String(row[LD_FILE_ID]     || "").trim(); // used as fallback key
    if (fileId && email) fileToStudent[fileId] = { email, configId };
  }

  // Collect COMPLETE staging rows for this teacher's students
  const completedEvals = [];
  for (let i = 1; i < stagingData.length; i++) {
    const row      = stagingData[i];
    const status   = sStatusIdx !== -1 ? String(row[sStatusIdx]).trim() : "";
    const fileId   = sFileIdx   !== -1 ? String(row[sFileIdx]).trim()   : "";
    const configId = sConfigIdx !== -1 ? String(row[sConfigIdx]).trim() : "";

    if (status !== "COMPLETE") continue;
    if (!fileId || !fileToStudent[fileId]) continue;

    completedEvals.push({
      fileId,
      configId,
      email: fileToStudent[fileId].email
    });
  }

  // Extract indicators — cap total doc opens across all students
  for (const eval_ of completedEvals) {
    if (docsOpened.count >= MAX_EVAL_DOC_OPENS) break;

    const email = eval_.email;
    if (!signals[email]) signals[email] = [];
    if (signals[email].length >= 3) continue; // already have 3 for this student

    try {
      const indicators = extractIndicatorsFromDoc_(eval_.fileId, docsOpened);
      if (indicators) {
        signals[email].push({
          assignment_id: eval_.configId,
          date:          Utilities.formatDate(
            new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"
          ),
          indicators:    indicators.structured,
          note:          indicators.note
        });
      }
    } catch (err) {
      Logger.log("[S23] Could not extract indicators from doc " +
                 eval_.fileId + ": " + err.message);
    }
  }

  // Trim to last 3 per student, most recent first
  for (const email of Object.keys(signals)) {
    signals[email] = signals[email].slice(-3).reverse();
  }

  Logger.log("[S23] Eval signal extraction: " + docsOpened.count +
             " doc(s) opened | " + Object.keys(signals).length + " students with signals.");
  return signals;
}

// ---------------------------------------------------------------------------
// extractIndicatorsFromDoc_
// Opens the student assignment doc and scans the feedback zone for
// indicator keywords from INDICATOR_TAXONOMY.
// Uses a pass-by-reference counter object to track total opens across calls.
//
// Returns: { structured: { strengths: [], gaps: [] }, note: "..." } or null
// ---------------------------------------------------------------------------
function extractIndicatorsFromDoc_(fileId, docsOpened) {
  const doc  = DocumentApp.openById(fileId);
  docsOpened.count++;

  const text = doc.getBody().getText();

  // Locate feedback zone — Flow 2 writes between [SYSTEM:] markers
  const systemIdx = text.indexOf("[SYSTEM:");
  if (systemIdx === -1) return null;

  const feedbackZone  = text.substring(systemIdx);
  const lowerFeedback = feedbackZone.toLowerCase();

  // Positive and gap signal words for heuristic indicator classification
  const positiveSignals = [
    "strong", "excellent", "demonstrates", "clear", "effective",
    "well", "good", "shows", "solid", "accurate"
  ];
  const gapSignals = [
    "needs", "improve", "unclear", "missing", "weak", "lacks",
    "consider", "revision", "develop", "strengthen"
  ];

  const strengths = [];
  const gaps      = [];

  for (const indicator of INDICATOR_TAXONOMY) {
    const term = indicator.replace(/_/g, " ");
    const idx  = lowerFeedback.indexOf(term);
    if (idx === -1) continue;

    // Check 80-character window around the indicator for signal words
    const window  = lowerFeedback.substring(Math.max(0, idx - 80), idx + 80);
    const isPos   = positiveSignals.some(s => window.includes(s));
    const isGap   = gapSignals.some(s => window.includes(s));

    if (isPos && !isGap) strengths.push(indicator);
    else if (isGap)      gaps.push(indicator);
  }

  // Extract plain-language note: first substantive sentence after [SYSTEM:]
  let note = "";
  const sentences = feedbackZone.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (sentence.startsWith("[SYSTEM:")) continue;
    if (sentence.length > 20) {
      note = sentence.substring(0, 150);
      break;
    }
  }

  return {
    structured: { strengths, gaps },
    note:       note || "No evaluative note extracted."
  };
}

// ---------------------------------------------------------------------------
// buildWarmupData_
// Reads WarmUpQueue and returns warm-up scores and extra credit totals
// for every student. Only reads SCORED and INCOMPLETE rows.
// Extra credit flags (set by Script 25) are read here — no doc opens.
//
// Returns: {
//   student_email: {
//     scores: [{ lesson_id, date, word_count_score, grammar,
//                engagement, extra_credit, total }],  // last 10
//     extraCreditCount: N  // running total this term
//   }
// }
// ---------------------------------------------------------------------------
function buildWarmupData_(wqData) {
  if (wqData.length < 2) return {};

  const result = {};

  for (let i = 1; i < wqData.length; i++) {
    const row    = wqData[i];
    const status = String(row[WQ23_STATUS] || "").trim();

    // Only include rows where scoring is complete
    if (status !== "SCORED" && status !== "INCOMPLETE") continue;

    const email      = String(row[WQ23_STUDENT_EMAIL]  || "").trim().toLowerCase();
    const lessonId   = String(row[WQ23_LESSON_ID]      || "").trim();
    // _normalizeLessonDateCell_ (22_LessonContextHandler.js) — WarmUpQueue's
    // lesson_date column has the same Sheets auto-coercion risk as
    // LessonContext's; String() on a coerced Date value would produce a
    // non-"YYYY-MM-DD" string that breaks the .localeCompare() chronological
    // sort below and resolveUnitForDate_()'s lookup further down.
    const date       = _normalizeLessonDateCell_(row[WQ23_LESSON_DATE]);
    const wcScore    = Number(row[WQ23_WORD_COUNT_SCORE]  || 0);
    const grammar    = Number(row[WQ23_GRAMMAR_SCORE]     || 0);
    const engagement = Number(row[WQ23_ENGAGEMENT_SCORE]  || 0);
    const ec         = Number(row[WQ23_EXTRA_CREDIT]      || 0);
    const total      = Number(row[WQ23_TOTAL_SCORE]       || 0);

    if (!email || !lessonId) continue;

    if (!result[email]) result[email] = { scores: [], extraCreditCount: 0 };

    result[email].scores.push({
      lesson_id:        lessonId,
      date:             date,
      word_count_score: wcScore,
      grammar:          grammar,
      engagement:       engagement,
      extra_credit:     ec,
      total:            total
    });

    // Accumulate extra credit — Script 25 sets this flag, we read it
    result[email].extraCreditCount += ec;
  }

  // Trim warm-up scores to last 10, chronological ascending
  for (const email of Object.keys(result)) {
    result[email].scores = result[email].scores
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);
  }

  return result;
}

// ---------------------------------------------------------------------------
// updateShadowMatrix_
// Updates the per-student × per-unit archetype confidence model.
// Called during the nightly profile update for each student.
//
// Shadow matrix structure (stored as JSON in SP_SHADOW_MATRIX):
//   {
//     "S1-U2": {
//       "archetype_history": [
//         { "warmup_id": "WUP-...", "archetype": "PARADOX", "engagement": 3,
//           "date": "2026-10-12" }
//       ],
//       "best_archetype":    "PARADOX",   // archetype with highest avg engagement
//       "within_confidence": 0.6,         // warm-ups scored / warm-ups expected
//       "cross_confidence":  0.72,        // decayed cross-unit average
//       "trend":             "rising"     // rising / flat / falling
//     }
//   }
//
// Parameters:
//   studentEmail    — lowercase student email
//   existing        — current shadow matrix object (may be empty)
//   warmupScores    — last 10 warm-up score objects from buildWarmupData_
//   wqData          — full WarmUpQueue data (to read archetype from snapshot)
//
// Returns: updated shadow matrix object
// ---------------------------------------------------------------------------
function updateShadowMatrix_(studentEmail, existing, warmupScores, wqData) {
  const DECAY_FACTOR         = 0.85; // KOS-derived decay for cross-unit confidence
  const CONFIDENCE_THRESHOLD = 0.75; // threshold for email interrupt

  const matrix = existing || {};

  // Build a lookup of warmup_id → archetype from WarmUpQueue
  // The archetype is stored in the student_profile_snapshot JSON
  // under the key "selected_archetype" — Flow 3 writes this back
  // to the queue row when it selects the archetype during generation.
  // Column index WQ23_ARCHETYPE is read here.
  const archetypeByWarmUpId = {};
  for (let i = 1; i < wqData.length; i++) {
    const row    = wqData[i];
    const email  = String(row[WQ23_STUDENT_EMAIL] || "").trim().toLowerCase();
    if (email !== studentEmail) continue;
    const queueId   = String(row[WQ23_QUEUE_ID]    || "").trim();
    const archetype = String(row[WQ23_ARCHETYPE]   || "").trim(); // col 19 — added below
    if (queueId && archetype) archetypeByWarmUpId[queueId] = archetype;
  }

  // Process each scored warm-up — assign to its unit via pacing guide
  for (const score of warmupScores) {
    if (score.engagement === undefined || score.engagement === null) continue;

    const unitObj = resolveUnitForDate_(score.date); // Script 31
    if (!unitObj) continue;
    const unitId = unitObj.unit_id;

    const archetype = archetypeByWarmUpId[score.lesson_id] || "UNKNOWN";

    if (!matrix[unitId]) {
      matrix[unitId] = {
        archetype_history: [],
        best_archetype:    null,
        within_confidence: 0,
        cross_confidence:  0,
        trend:             "flat"
      };
    }

    const unitData = matrix[unitId];

    // Add to history if not already present (idempotent)
    const alreadyLogged = unitData.archetype_history
      .some(h => h.warmup_id === score.lesson_id);

    if (!alreadyLogged && archetype !== "UNKNOWN") {
      unitData.archetype_history.push({
        warmup_id:  score.lesson_id,
        archetype:  archetype,
        engagement: score.engagement,
        date:       score.date
      });
    }

    // Recompute best_archetype — highest average engagement by archetype
    const byArchetype = {};
    for (const h of unitData.archetype_history) {
      if (!byArchetype[h.archetype]) byArchetype[h.archetype] = [];
      byArchetype[h.archetype].push(h.engagement);
    }
    let bestArchetype = null, bestAvg = -1;
    for (const [arch, scores] of Object.entries(byArchetype)) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg > bestAvg) { bestAvg = avg; bestArchetype = arch; }
    }
    unitData.best_archetype = bestArchetype;

    // Within-unit confidence: scored warm-ups / expected warm-ups in unit
    // Expected = unit duration in days / average class meeting frequency
    // Approximate: 3-week unit on block schedule ≈ 8 warm-ups
    // Use history length / 8 as proxy, cap at 1.0
    unitData.within_confidence = Math.min(
      unitData.archetype_history.length / 8, 1.0
    );

    // Trend: compare last 3 vs previous 3 engagement scores
    const history = unitData.archetype_history
      .sort((a, b) => a.date.localeCompare(b.date));
    if (history.length >= 4) {
      const mid   = Math.floor(history.length / 2);
      const early = history.slice(0, mid).map(h => h.engagement);
      const late  = history.slice(mid).map(h => h.engagement);
      const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
      const lateAvg  = late.reduce((a, b) => a + b, 0) / late.length;
      unitData.trend = lateAvg > earlyAvg + 0.3 ? "rising"
                     : lateAvg < earlyAvg - 0.3 ? "falling"
                     : "flat";
    }
  }

  // Compute cross-unit confidence with decay
  // Cross-unit confidence = decayed average of within_confidence across all units
  // More recent units weighted higher via DECAY_FACTOR
  const allUnitIds = Object.keys(matrix)
    .sort(); // sort by unit ID (S0-U1, S0-U2, etc.)

  if (allUnitIds.length > 0) {
    let weightedSum = 0, weightSum = 0, weight = 1;
    for (const uid of allUnitIds.reverse()) { // most recent first
      weightedSum += matrix[uid].within_confidence * weight;
      weightSum   += weight;
      weight      *= DECAY_FACTOR;
    }
    const crossConf = weightSum > 0 ? weightedSum / weightSum : 0;

    // Write cross_confidence to each unit
    for (const uid of allUnitIds) {
      matrix[uid].cross_confidence = Math.round(crossConf * 100) / 100;
    }
  }

  return matrix;
}

// ---------------------------------------------------------------------------
// buildShadowMatrixSummary_
// Reads all student profiles and returns a summary for the dashboard
// readiness panel. Called by getDashboardData() in Script 07.
//
// Returns:
//   {
//     total:                N,  // total students
//     withEvalHistory:      N,  // have M1 evaluation signals
//     withWarmUpHistory:    N,  // have scored warm-ups
//     withShadowConfidence: N,  // have cross_confidence > 0.5 in any unit,
//                                  but not yet locked (see below) — the two
//                                  buckets are mutually exclusive so the
//                                  dashboard's two stat lines never double-
//                                  count the same student
//     locked:               N,  // have cross_confidence >= 0.75 (email sent)
//     currentUnit:          "S1-U2 — Business Structure & Organization"
//   }
// ---------------------------------------------------------------------------
function buildShadowMatrixSummary_(ss, cfg) {
  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet || spSheet.getLastRow() < 2) {
    // null, not a zeroed-out object — the caller (renderWarmUpReadiness on
    // the client) treats any truthy return as "there's real data, show the
    // panel," so a {total:0,...} stand-in used to render a fake "0 of 0
    // students" panel instead of hiding it like the no-data case should.
    return null;
  }

  const data         = spSheet.getDataRange().getValues();
  const teacherEmail = cfg.teacherEmail.toLowerCase();
  const todayStr     = formatDateYMD_(new Date());
  const currentUnit  = resolveUnitForDate_(todayStr); // Script 31

  let total = 0, withEval = 0, withWarmup = 0, withConf = 0, locked = 0;
  // NEW (Say/Do Ledger cas-ccps finding #13): per-bucket student emails,
  // not just counts — this is what lets the dashboard turn these stats
  // into clickable filters into the roster instead of static numbers.
  const withEvalEmails = [], withWarmupEmails = [], withConfEmails = [], lockedEmails = [];

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][SP_STUDENT_EMAIL] || "").trim().toLowerCase();
    const rowTeacher = String(data[i][SP_TEACHER_EMAIL] || "").trim().toLowerCase();

    // Skip teacher row and rows not belonging to this teacher
    if (rowEmail === teacherEmail) continue;
    if (rowTeacher !== teacherEmail) continue;

    total++;

    // Has eval history?
    try {
      const signals = JSON.parse(data[i][SP_EVALUATION_SIGNALS] || "[]");
      if (signals.length > 0) { withEval++; withEvalEmails.push(rowEmail); }
    } catch(e) {}

    // Has warm-up history?
    try {
      const scores = JSON.parse(data[i][SP_WARMUP_SCORES] || "[]");
      if (scores.length > 0) { withWarmup++; withWarmupEmails.push(rowEmail); }
    } catch(e) {}

    // Has shadow matrix confidence?
    try {
      const matrix = JSON.parse(data[i][SP_SHADOW_MATRIX] || "{}");
      const unitIds = Object.keys(matrix);
      if (unitIds.length > 0) {
        const maxConf = Math.max(...unitIds.map(uid =>
          matrix[uid].cross_confidence || 0
        ));
        // FIXED: these used to be independent checks, so every "locked"
        // student (>=0.75) was also counted in withConf (>0.5) — the
        // dashboard's two stat lines ("N building a personalized learning
        // profile" / "M ready for fully personalized feedback") showed the
        // same student in both buckets with no way for a teacher to tell
        // they overlapped. Made mutually exclusive: withConf now means
        // "building confidence but not yet locked."
        if (maxConf >= 0.75)      { locked++;   lockedEmails.push(rowEmail); }
        else if (maxConf > 0.5)  { withConf++; withConfEmails.push(rowEmail); }
      }
    } catch(e) {}
  }

  // Same null-vs-zeroed-object fix as the sheet-missing/near-empty branch
  // above, for the other way this can be legitimately empty: a
  // StudentProfiles sheet with real rows, just none belonging to this
  // teacher (e.g. right after M2_ENABLED is flipped on for them, while
  // other teachers already have profiled students). That case fell
  // through to here and returned a truthy {total:0,...} object, so
  // renderWarmUpReadiness() still rendered a fake "0 of 0 students" panel.
  if (total === 0) return null;

  return {
    total,
    withEvalHistory:      withEval,
    withWarmUpHistory:    withWarmup,
    withShadowConfidence: withConf,
    locked,
    // NEW (finding #13): per-bucket email lists — lets the dashboard
    // filter the roster to exactly these students when a stat is clicked.
    withEvalEmails:   withEvalEmails,
    withWarmupEmails: withWarmupEmails,
    withConfEmails:   withConfEmails,
    lockedEmails:     lockedEmails,
    currentUnit: currentUnit
      ? (currentUnit.unit_id + " — " + currentUnit.unit_name)
      : ""
  };
}

// ---------------------------------------------------------------------------
// getStudentShadowProfile_ — NEW (Say/Do Ledger cas-ccps finding #13).
// Read-only per-student detail for the dashboard's new profile view — the
// destination for the warm-up readiness panel's "ready for personalized
// feedback" (locked) students. Presents the same signals
// buildShadowMatrixSummary_() already aggregates, but for one student,
// with per-unit confidence resolved to a real unit name via Script 31's
// getUnitById_() where possible.
// ---------------------------------------------------------------------------
function getStudentShadowProfile_(ss, cfg, studentEmail) {
  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet) return null;

  const data  = spSheet.getDataRange().getValues();
  const email = String(studentEmail || "").trim().toLowerCase();
  const teacherEmail = cfg.teacherEmail.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowEmail   = String(data[i][SP_STUDENT_EMAIL] || "").trim().toLowerCase();
    const rowTeacher = String(data[i][SP_TEACHER_EMAIL] || "").trim().toLowerCase();
    if (rowEmail !== email) continue;
    // Same ownership check every other per-student read in this file
    // applies — a teacher can only view profiles for their own students.
    if (rowTeacher !== teacherEmail) return null;

    let evalSignals = [], warmupScores = [], shadowMatrix = {};
    try { evalSignals   = JSON.parse(data[i][SP_EVALUATION_SIGNALS] || "[]"); } catch(e) {}
    try { warmupScores  = JSON.parse(data[i][SP_WARMUP_SCORES]      || "[]"); } catch(e) {}
    try { shadowMatrix  = JSON.parse(data[i][SP_SHADOW_MATRIX]      || "{}"); } catch(e) {}

    const unitConfidence = Object.keys(shadowMatrix).map(unitId => {
      let unitLabel = unitId;
      try {
        const unit = getUnitById_(unitId);
        if (unit && unit.unit_name) unitLabel = unitId + " — " + unit.unit_name;
      } catch (e) { /* Script 31 not bound in this project — fall back to raw ID */ }
      const conf = shadowMatrix[unitId].cross_confidence || 0;
      return {
        unitLabel: unitLabel,
        confidence: conf,
        // Same 0.75/0.5 thresholds buildShadowMatrixSummary_() uses, so a
        // unit's status here always agrees with which bucket got this
        // student onto this view in the first place.
        status: conf >= 0.75 ? "Ready for personalized feedback"
              : conf > 0.5   ? "Building confidence"
              : "Not yet enough data"
      };
    }).sort((a, b) => b.confidence - a.confidence);

    // Utilities.formatDate() directly, not the shared formatDate_() helper
    // — that helper only exists in 07_TeacherDashboard.js/13_StudentDashboard.js,
    // neither of which is bound to the Central Ledger project this file is
    // also part of, so calling it here would be undefined in that context.
    let lastUpdated = "Never";
    if (data[i][SP_LAST_UPDATED]) {
      try {
        lastUpdated = Utilities.formatDate(
          new Date(data[i][SP_LAST_UPDATED]), Session.getScriptTimeZone(), "MMM d, yyyy h:mm a"
        );
      } catch (e) { lastUpdated = String(data[i][SP_LAST_UPDATED]); }
    }

    return {
      name:  String(data[i][SP_STUDENT_NAME] || "").trim() || studentEmail,
      email: studentEmail,
      evalHistoryCount:   evalSignals.length,
      warmupHistoryCount: warmupScores.length,
      lastUpdated: lastUpdated,
      unitConfidence: unitConfidence
    };
  }

  return null; // no profile row for this student yet
}

// ---------------------------------------------------------------------------
// formatDateYMD_ — helper: returns "YYYY-MM-DD" for a Date object
// (Defined here so Script 23 can call it independently of Script 24)
// ---------------------------------------------------------------------------
function formatDateYMD_(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Called by Script 24 (WarmUpBridge) when building WarmUpQueue rows.
// Returns the current StudentProfile for a given student as a plain object
// ready for JSON.stringify() into the queue row snapshot.
//
// Also computes competency_gaps for today's lesson at snapshot time:
//   gaps = lessonCompIds NOT IN classCompetencies_addressed
//
// Parameters:
//   ss              — SpreadsheetApp spreadsheet object (already open)
//   cfg             — getConfig_() result
//   studentEmail    — student Google account email
//   lessonCompIds   — array of competency IDs addressed in today's lesson
//
// Returns: profile object, or a minimal default if student not found.
// ---------------------------------------------------------------------------
function getStudentProfileSnapshot_(ss, cfg, studentEmail, lessonCompIds) {
  const spSheet = ss.getSheetByName(cfg.tabs.studentProfiles);
  if (!spSheet) {
    Logger.log("[S23] StudentProfiles tab not found in getStudentProfileSnapshot_.");
    return buildDefaultSnapshot_(studentEmail, lessonCompIds);
  }

  const data  = spSheet.getDataRange().getValues();
  const email = studentEmail.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = String(data[i][SP_STUDENT_EMAIL]).trim().toLowerCase();
    if (rowEmail !== email) continue;

    // Parse JSON fields safely
    let competenciesAddressed = [];
    let evalSignals           = [];
    let warmupScores          = [];

    try { competenciesAddressed = JSON.parse(data[i][SP_COMPETENCIES_ADDRESSED] || "[]"); }
    catch(e) { competenciesAddressed = []; }

    try { evalSignals = JSON.parse(data[i][SP_EVALUATION_SIGNALS] || "[]"); }
    catch(e) { evalSignals = []; }

    try { warmupScores = JSON.parse(data[i][SP_WARMUP_SCORES] || "[]"); }
    catch(e) { warmupScores = []; }

    // Compute competency gaps for today's lesson
    const addressedSet = new Set(competenciesAddressed);
    const gaps         = (lessonCompIds || []).filter(id => !addressedSet.has(id));

    // Parse shadow matrix for snapshot inclusion
    let shadowMatrix = {};
    try { shadowMatrix = JSON.parse(data[i][SP_SHADOW_MATRIX] || "{}"); }
    catch(e) { shadowMatrix = {}; }

    // Build shadow archetype note for Flow 3 Mode A prompt
    // Finds the current unit's best archetype and confidence if above threshold
    const unitCurrent     = String(data[i][SP_UNIT_CURRENT] || "").trim();
    const unitMatrixEntry = unitCurrent ? shadowMatrix[unitCurrent] : null;
    let shadowArchetypeNote = null;
    if (unitMatrixEntry && unitMatrixEntry.cross_confidence >= 0.75) {
      shadowArchetypeNote =
        "Shadow matrix suggests " + unitMatrixEntry.best_archetype +
        " (" + Math.round(unitMatrixEntry.cross_confidence * 100) + "% confidence, " +
        (unitMatrixEntry.archetype_history || []).length + " warm-ups in unit " +
        unitCurrent + ", trend: " + (unitMatrixEntry.trend || "flat") + ").";
    }

    return {
      student_email:          studentEmail,
      student_name:           String(data[i][SP_STUDENT_NAME]).trim(),
      period:                 String(data[i][SP_PERIOD]).trim(),
      competencies_addressed: competenciesAddressed,
      competency_gaps:        gaps,
      evaluation_signals:     evalSignals,
      warmup_scores:          warmupScores,
      extra_credit_count:     Number(data[i][SP_EXTRA_CREDIT_COUNT] || 0),
      avg_engagement_score:   Number(data[i][SP_AVG_ENGAGEMENT]     || 0),
      last_updated:           String(data[i][SP_LAST_UPDATED]).trim(),
      // ── Shadow matrix — drives archetype selection in Flow 3 ─────────────
      shadow_matrix:          shadowMatrix,
      unit_current:           unitCurrent,
      shadow_archetype_note:  shadowArchetypeNote  // null when below threshold
    };
  }

  // No profile found — student registered after last 3am run
  Logger.log("[S23] No profile found for " + studentEmail +
             " — using default snapshot. Profile will exist after tonight's 3am run.");
  return buildDefaultSnapshot_(studentEmail, lessonCompIds);
}

// ---------------------------------------------------------------------------
// buildDefaultSnapshot_
// Returns a minimal valid snapshot for students with no profile yet.
// All gaps default to all of today's lesson competencies (nothing addressed).
// Flow 3 will treat this student as a new learner with no prior history.
// ---------------------------------------------------------------------------
function buildDefaultSnapshot_(studentEmail, lessonCompIds) {
  return {
    student_email:          studentEmail,
    student_name:           "",
    period:                 "",
    competencies_addressed: [],
    competency_gaps:        lessonCompIds || [],
    evaluation_signals:     [],
    warmup_scores:          [],
    extra_credit_count:     0,
    avg_engagement_score:   0,
    last_updated:           "",
    // FIXED: the full snapshot above always carries these three shadow-matrix
    // fields, but this default (returned for both "no StudentProfiles tab"
    // and "no row for this student yet") previously omitted them entirely —
    // so a brand-new student's very first warm-up snapshot handed Flow 3 an
    // object missing keys every other snapshot has, instead of the "no
    // history yet" values a new learner should actually carry.
    shadow_matrix:          {},
    unit_current:           "",
    shadow_archetype_note:  null
  };
}

// ---------------------------------------------------------------------------
// installWarmUpTriggers_
// Run once manually from Script Editor.
// Installs all three nightly warm-up cron triggers.
// Sequence: S23 at 3:00am → S25 eval at 3:15am → S24 at 3:30am
// Safe to re-run — checks for existing triggers before installing.
// ---------------------------------------------------------------------------
function installWarmUpTriggers_() {
  const handlers = [
    { fn: "updateAllStudentProfiles", hour: 3, minute: 0,  label: "3:00am — Stage 1: Profile update"    },
    { fn: "runWarmUpEvaluation",      hour: 3, minute: 15, label: "3:15am — Stage 2: Warm-up evaluation" },
    { fn: "buildWarmUpQueues",        hour: 3, minute: 30, label: "3:30am — Stage 3: Queue builder"      }
  ];

  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());

  for (const h of handlers) {
    if (existing.includes(h.fn)) {
      Logger.log("[S23] Trigger already installed: " + h.fn + " — skipping.");
      continue;
    }
    ScriptApp.newTrigger(h.fn)
      .timeBased()
      .atHour(h.hour)
      .nearMinute(h.minute)
      .everyDays(1)
      .create();
    Logger.log("[S23] Installed: " + h.fn + " (" + h.label + ")");
  }

  // Verify all warm-up tabs exist
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const requiredTabs = [
    cfg.tabs.studentProfiles,
    cfg.tabs.warmUpQueue,
    cfg.tabs.warmUpRegistry,
    cfg.tabs.classSchedule
  ];
  requiredTabs.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    Logger.log("[S23] Tab '" + tabName + "': " +
               (sheet ? "FOUND ✓" : "MISSING — run createWarmUpTabs_()"));
  });

  // ── Stage 1B trigger (Script 33) ─────────────────────────────────────────
  // installArtifactSyncTrigger_() in Script 33 installs the 3:05am trigger.
  // It is a separate entry point because Script 33 is bound to the same
  // project and can install its own trigger.
  // Run installArtifactSyncTrigger_() from Script 33 after adding S33 to project.
  Logger.log("[S23] Trigger installation complete.");
  Logger.log("[S23] Also run installArtifactSyncTrigger_() from Script 33 " +
             "to install the 3:05am artifact sync trigger.");
}

// ---------------------------------------------------------------------------
// createWarmUpTabs_
// Run once manually if Script 28 setup wizard doesn't yet exist.
// Creates all four warm-up tabs with correct headers and frozen rows.
// Safe to re-run — skips tabs that already exist.
//
// NOTE: Also adds warm_up_generated column to LessonContext if missing.
// Run Script 24's createLessonContextWarmUpColumn_() separately for that.
// ---------------------------------------------------------------------------
function createWarmUpTabs_() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);

  _createTabIfAbsent_(ss, cfg.tabs.studentProfiles, [
    "student_email", "student_name", "google_id", "teacher_email", "period",
    "competencies_addressed", "competency_gaps", "evaluation_signals",
    "warmup_scores", "extra_credit_count", "avg_engagement_score", "last_updated",
    "shadow_matrix", "unit_current"
  ]);

  // lesson_date (col 6) forced to text format — see the textColumns comment
  // on _createTabIfAbsent_ below. This is a documented fallback tab-creation
  // path (run manually when Script 28's setup wizard hasn't run yet) that
  // otherwise reintroduces the exact Sheets-auto-coercion bug already fixed
  // for 22_LessonContextHandler.js's and 28_Module2Setup.js's tab creators.
  _createTabIfAbsent_(ss, cfg.tabs.warmUpQueue, [
    "queue_id", "lesson_id", "student_email", "student_name", "google_id",
    "lesson_date", "lesson_context_snapshot", "student_profile_snapshot",
    "status", "doc_id", "doc_url", "word_count", "word_count_score",
    "grammar_score", "engagement_score", "extra_credit", "total_score",
    "flow4_feedback", "response_text", "archetype", "bridge_output"
  ], [6]);

  // lesson_date (col 4) — same reasoning as above.
  _createTabIfAbsent_(ss, cfg.tabs.warmUpRegistry, [
    "warmup_id", "queue_id", "lesson_id", "lesson_date", "student_email",
    "student_name", "teacher_email", "doc_id", "doc_url", "generated_at",
    "total_score", "extra_credit", "term"
  ], [4]);

  _createTabIfAbsent_(ss, cfg.tabs.classSchedule, [
    "teacher_email", "period", "day_type", "course_name", "active"
  ]);

  // ── Pacing guide + competency rubric tabs ─────────────────────────────────
  // Created here so they exist before the import scripts run.
  // Content populated by importPacingGuide() (S29) and
  // importCompetencyRubrics() (S30) — read-only after import.
  _createTabIfAbsent_(ss, "PacingGuide", [
    "lesson_unit_id","stage","stage_name","lesson_unit_name",
    "approx_start","approx_end","weeks","overlap_type",
    "division_context","objective_8175","objective_8177",
    "competency_ids_8175","competency_ids_8177",
    "key_vocabulary","prior_lesson_connection","warmup_anchor"
  ]);

  _createTabIfAbsent_(ss, "CompetencyRubrics", [
    "competency_id","course","task_number","duty_area",
    "competency_text","demonstration_standard",
    "demonstration_indicators","skill_questions"
  ]);

  Logger.log("[S23] Warm-up tab creation complete.");
}

// textColumns: optional array of 1-based column indices to force to plain
// text format, so ISO-date-shaped strings ("YYYY-MM-DD") written into them
// later never get silently auto-converted to a real Date value by Sheets —
// mirrors 22_LessonContextHandler.js's _createTabIfMissing_ and
// 28_Module2Setup.js's _createTabIfMissing28_. This function previously had
// no such parameter at all, so tabs created through this fallback path
// (used when Script 28's setup wizard hasn't run yet) had zero protection
// against the exact lesson_date coercion bug fixed everywhere else.
function _createTabIfAbsent_(ss, tabName, headers, textColumns) {
  if (ss.getSheetByName(tabName)) {
    Logger.log("[S23] Tab '" + tabName + "' already exists — skipping.");
    return;
  }
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  (textColumns || []).forEach(col => {
    sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
  });
  Logger.log("[S23] Created tab: " + tabName);
}

// ---------------------------------------------------------------------------
// validateStudentProfiles — run manually to check data integrity
// ---------------------------------------------------------------------------
function validateStudentProfiles() {
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.studentProfiles);

  if (!sheet) { Logger.log("[VALIDATE] StudentProfiles tab not found."); return; }

  const data       = sheet.getDataRange().getValues();
  let total        = 0;
  let hasSignals   = 0;
  let hasScores    = 0;
  let hasComps     = 0;
  let stale        = 0;
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][SP_STUDENT_EMAIL]).trim();
    if (!email) continue;
    total++;

    try { if (JSON.parse(data[i][SP_EVALUATION_SIGNALS]     || "[]").length > 0) hasSignals++; } catch(e) {}
    try { if (JSON.parse(data[i][SP_WARMUP_SCORES]          || "[]").length > 0) hasScores++;  } catch(e) {}
    try { if (JSON.parse(data[i][SP_COMPETENCIES_ADDRESSED] || "[]").length > 0) hasComps++;   } catch(e) {}

    const updated = data[i][SP_LAST_UPDATED];
    if (updated && new Date(updated) < twoDaysAgo) stale++;
  }

  Logger.log("[VALIDATE] StudentProfiles:");
  Logger.log("[VALIDATE]   Total profiles:              " + total);
  Logger.log("[VALIDATE]   With competency history:     " + hasComps);
  Logger.log("[VALIDATE]   With evaluation signals:     " + hasSignals);
  Logger.log("[VALIDATE]   With warm-up score history:  " + hasScores);
  Logger.log("[VALIDATE]   Stale (>2 days old):         " + stale);
  if (stale > 0) Logger.log("[VALIDATE] ⚠ Stale profiles — verify 3am trigger is running.");
  else            Logger.log("[VALIDATE] ✓ All profiles current.");
}
