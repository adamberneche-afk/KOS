// =============================================================================
// FILE: 32_CompetencyRubricImporter.js  (renumbered from 30 during
//       reconciliation — Module 2's own numbering collided with the
//       already-pushed Module 4/5 scripts 29/30/30b; Module 2 moved to
//       31/32/33 per repo reconciliation decision 1 (see cas-ccps/README.md).
// BOUND TO: Central Ledger spreadsheet (same project as the other
//          Module 2 scripts: 22, 22b, 23, 24, 26, 28, 31, 33) AND the
//          Teacher Dashboard standalone web app — added there when
//          27_LessonFrameGenerator.js needed getRubricsForLesson_() and
//          gas-lint's cross-project call check caught that this file
//          wasn't present in that project (Script 27 runs synchronously
//          inside Teacher Dashboard, called from Script 22's
//          onLessonContextSubmit_(), which itself runs there — see that
//          file's own header). Only depends on getConfig_()
//          (00_SharedConfig.js, present in every project) plus its own
//          internal functions/constants, so this dual placement is safe.
// PURPOSE: Imports CompetencyRubrics.json into the CompetencyRubrics tab,
//          and exports lookup functions used by Script 24 when building
//          WarmUpQueue lesson context snapshots, and by Script 27 when
//          compiling a Lesson Frame's competency-alignment section.
//
// ENTRY POINTS:
//   importCompetencyRubrics()          — run once manually from Script Editor
//   validateRubricImport()             — run after import to verify data
//   getRubricForCompetency_(compId)    — called by Script 24 per competency
//   getRubricsForLesson_(compIds)      — called by Script 24 for full lesson,
//                                        and by Script 27 for a Lesson Frame
//
// TAB SCHEMA (CompetencyRubrics):
//   competency_id | course | task_number | duty_area | competency_text
//   demonstration_standard | demonstration_indicators | skill_questions
//
//   demonstration_indicators — JSON array string
//   skill_questions          — JSON array string (min 1, avg ~5)
//
// ARCHETYPE → SKILL QUESTION MAPPING (heuristic, not a hard rule):
//   BRIDGE           → skill_questions[0]  — definitional/foundational
//   CONCRETE SCENARIO → skill_questions[1]  — application in work context
//   PARADOX          → skill_questions[2]  — improvement/problem-solving
//   PROVOCATION      → skill_questions[3]  — systems/resource thinking
//   (Flow 3 selects the best fit — this mapping is the default priority)
//
// CACHING:
//   Rubric data is cached per-competency in Script Properties after first
//   lookup. Cache key: M2_RUBRIC_{competency_id}. Cache is invalidated on
//   re-import. At ~300 bytes per rubric × 221 rubrics the full set exceeds
//   the Script Properties total limit — individual lookups are cached only.
//
// SNAPSHOT INTEGRATION (Script 24):
//   lessonContextSnapshot.competency_rubrics = getRubricsForLesson_(compIds)
//   Each element: { competency_id, skill_questions, demonstration_indicators,
//                   archetype_question_map }
//   Flow 3 reads archetype_question_map to select the best skill question
//   for the selected archetype without index arithmetic.
//
// =============================================================================

// ── CompetencyRubrics tab column indices (0-based) ────────────────────────────
const CR_COMPETENCY_ID            = 0;
const CR_COURSE                   = 1;
const CR_TASK_NUMBER              = 2;
const CR_DUTY_AREA                = 3;
const CR_COMPETENCY_TEXT          = 4;
const CR_DEMONSTRATION_STANDARD   = 5;
const CR_DEMONSTRATION_INDICATORS = 6;
const CR_SKILL_QUESTIONS          = 7;
const CR_COL_COUNT                = 8;

const CR_HEADERS = [
  "competency_id", "course", "task_number", "duty_area",
  "competency_text", "demonstration_standard",
  "demonstration_indicators", "skill_questions"
];

const RUBRIC_JSON_FILENAME = "CompetencyRubrics.json";
const RUBRIC_CACHE_PREFIX  = "M2_RUBRIC_";

// ---------------------------------------------------------------------------
// importCompetencyRubrics
// Run once manually from Script Editor.
// Reads CompetencyRubrics.json from teacher Drive folder.
// Clears and rewrites the CompetencyRubrics tab.
// Safe to re-run — clears existing data before writing.
// ---------------------------------------------------------------------------
function importCompetencyRubrics() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);

  // ── Ensure tab exists ─────────────────────────────────────────────────────
  let crSheet = ss.getSheetByName("CompetencyRubrics");
  if (!crSheet) {
    crSheet = ss.insertSheet("CompetencyRubrics");
    Logger.log("[S32] Created CompetencyRubrics tab.");
  }

  // ── Find JSON file ────────────────────────────────────────────────────────
  const jsonFile = _findRubricFile_(cfg);
  if (!jsonFile) {
    Logger.log("[S32] " + RUBRIC_JSON_FILENAME + " not found in Drive.");
    Logger.log("[S32] Upload to your teacher folder and try again.");
    return;
  }
  Logger.log("[S32] Found: " + jsonFile.getName() + " (" + jsonFile.getId() + ")");

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let rubricData;
  try {
    const raw = jsonFile.getBlob().getDataAsString("UTF-8");
    rubricData = JSON.parse(raw);
  } catch (e) {
    Logger.log("[S32] JSON parse error: " + e.message);
    return;
  }

  const rubrics = rubricData.competency_rubrics;
  if (!Array.isArray(rubrics) || rubrics.length === 0) {
    Logger.log("[S32] competency_rubrics array is empty or missing.");
    return;
  }

  // ── Write header row ──────────────────────────────────────────────────────
  crSheet.clearContents();
  crSheet.getRange(1, 1, 1, CR_COL_COUNT)
    .setValues([CR_HEADERS])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  crSheet.setFrozenRows(1);

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = rubrics.map(r => [
    String(r.competency_id          || "").trim(),
    String(r.course                  || "").trim(),
    r.task_number !== undefined ? r.task_number : "",
    String(r.duty_area               || "").trim(),
    String(r.competency_text         || "").trim(),
    String(r.demonstration_standard  || "").trim(),
    JSON.stringify(r.demonstration_indicators || []),
    JSON.stringify(r.skill_questions          || [])
  ]);

  // ── Batch write ────────────────────────────────────────────────────────────
  crSheet.getRange(2, 1, rows.length, CR_COL_COUNT).setValues(rows);

  // ── Invalidate cache ───────────────────────────────────────────────────────
  _invalidateRubricCache_();

  Logger.log("[S32] Import complete: " + rows.length + " rubrics written.");
  Logger.log("[S32] Cache invalidated.");

  validateRubricImport();
}

// ---------------------------------------------------------------------------
// validateRubricImport
// Run after import to verify data integrity.
// Logs summary by course and flags any rows with missing required data.
// ---------------------------------------------------------------------------
function validateRubricImport() {
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName("CompetencyRubrics");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("[S32-VALIDATE] CompetencyRubrics tab empty or missing.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  let total = 0;
  const byCourse  = {};
  const noQ       = [];
  const noI       = [];
  const noId      = [];

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const compId = String(row[CR_COMPETENCY_ID] || "").trim();
    const course  = String(row[CR_COURSE]        || "").trim();
    if (!compId && !course) continue;
    total++;

    if (!compId) { noId.push("row " + (i + 1)); continue; }
    if (!course)  byCourse["unknown"] = (byCourse["unknown"] || 0) + 1;
    else          byCourse[course]    = (byCourse[course]    || 0) + 1;

    // Validate JSON arrays
    let indicators = [], questions = [];
    try { indicators = JSON.parse(row[CR_DEMONSTRATION_INDICATORS] || "[]"); } catch(e) {}
    try { questions  = JSON.parse(row[CR_SKILL_QUESTIONS]          || "[]"); } catch(e) {}

    if (indicators.length === 0) noI.push(compId);
    if (questions.length  === 0) noQ.push(compId);
  }

  Logger.log("[S32-VALIDATE] CompetencyRubrics summary:");
  Logger.log("[S32-VALIDATE]   Total rows:           " + total);
  Object.entries(byCourse).sort().forEach(([course, n]) =>
    Logger.log("[S32-VALIDATE]   Course " + course + ":          " + n + " rubrics")
  );
  Logger.log("[S32-VALIDATE]   Missing competency_id: " + noId.length);
  Logger.log("[S32-VALIDATE]   Missing indicators:    " + noI.length +
             (noI.length > 0 ? " — " + noI.slice(0, 5).join(", ") : ""));
  Logger.log("[S32-VALIDATE]   Missing questions:     " + noQ.length +
             (noQ.length > 0 ? " — " + noQ.slice(0, 5).join(", ") : ""));

  if (noId.length === 0 && noI.length === 0 && noQ.length === 0) {
    Logger.log("[S32-VALIDATE] ✓ All rubrics valid.");
  } else {
    Logger.log("[S32-VALIDATE] ⚠ Issues found — check CompetencyRubrics.json.");
  }
}

// ---------------------------------------------------------------------------
// getRubricForCompetency_
// Returns the rubric object for a single competency ID.
// Used by Script 24 when building individual competency entries in the
// lesson context snapshot, and by Flow 3 pre-processing when building
// the archetype_question_map.
//
// Returns:
//   {
//     competency_id, course, task_number, duty_area,
//     competency_text, demonstration_standard,
//     demonstration_indicators: [],
//     skill_questions: [],
//     archetype_question_map: {
//       BRIDGE: "...",
//       CONCRETE_SCENARIO: "...",
//       PARADOX: "...",
//       PROVOCATION: "..."
//     }
//   }
//   or null if not found
// ---------------------------------------------------------------------------
function getRubricForCompetency_(compId) {
  if (!compId) return null;

  // ── Try cache ──────────────────────────────────────────────────────────────
  const cacheKey = RUBRIC_CACHE_PREFIX + compId.replace(/[^a-zA-Z0-9]/g, "_");
  const cached   = PropertiesService.getScriptProperties().getProperty(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); }
    catch(e) { /* cache miss — fall through to sheet read */ }
  }

  // ── Read from sheet ────────────────────────────────────────────────────────
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName("CompetencyRubrics");
  if (!sheet || sheet.getLastRow() < 2) return null;

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[CR_COMPETENCY_ID]).trim() !== compId) continue;

    let indicators = [], questions = [];
    try { indicators = JSON.parse(row[CR_DEMONSTRATION_INDICATORS] || "[]"); } catch(e) {}
    try { questions  = JSON.parse(row[CR_SKILL_QUESTIONS]          || "[]"); } catch(e) {}

    const result = {
      competency_id:             compId,
      course:                    String(row[CR_COURSE]                 || "").trim(),
      task_number:               row[CR_TASK_NUMBER] !== "" ? Number(row[CR_TASK_NUMBER]) : null,
      duty_area:                 String(row[CR_DUTY_AREA]              || "").trim(),
      competency_text:           String(row[CR_COMPETENCY_TEXT]        || "").trim(),
      demonstration_standard:    String(row[CR_DEMONSTRATION_STANDARD] || "").trim(),
      demonstration_indicators:  indicators,
      skill_questions:           questions,
      archetype_question_map:    _buildArchetypeQuestionMap_(questions)
    };

    // Cache the result
    try {
      PropertiesService.getScriptProperties()
        .setProperty(cacheKey, JSON.stringify(result));
    } catch(e) {
      // Cache write failure is non-fatal
    }

    return result;
  }

  Logger.log("[S32] Rubric not found for competency_id: " + compId);
  return null;
}

// ---------------------------------------------------------------------------
// getRubricsForLesson_
// Returns an array of rubric objects for all competency IDs in a lesson.
// Called by Script 24 when building lessonContextSnapshot.
// Missing competency IDs are skipped with a log warning.
//
// Parameters:
//   compIds — array of competency ID strings (e.g. ["8175-47", "8175-52"])
//
// Returns:
//   [{ competency_id, skill_questions, demonstration_indicators,
//      archetype_question_map, competency_text, duty_area }]
// ---------------------------------------------------------------------------
function getRubricsForLesson_(compIds) {
  if (!compIds || compIds.length === 0) return [];

  // Load all rubric data once to avoid per-ID sheet reads
  const allRubrics = _loadAllRubrics_();
  if (!allRubrics) return [];

  const results = [];
  for (const compId of compIds) {
    const r = allRubrics[compId.trim()];
    if (!r) {
      Logger.log("[S32] No rubric found for: " + compId);
      continue;
    }
    results.push(r);
  }

  Logger.log("[S32] getRubricsForLesson_: " + results.length +
             " of " + compIds.length + " found.");
  return results;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

// ---------------------------------------------------------------------------
// _buildArchetypeQuestionMap_
// Maps each archetype to the most appropriate skill question based on
// the VDOE framework's process/skill question ordering convention.
//
// Default mapping (heuristic — Flow 3 may override):
//   Position 0 → BRIDGE           (definitional — "What is X?")
//   Position 1 → CONCRETE_SCENARIO (application — "How does one...")
//   Position 2 → PARADOX          (improvement — "How might one improve...")
//   Position 3 → PROVOCATION      (systems — "What resources/factors...")
//
// If fewer than 4 questions exist, later archetypes reuse earlier questions.
// Flow 3 receives this map and uses it as a starting point, not a constraint.
// ---------------------------------------------------------------------------
function _buildArchetypeQuestionMap_(questions) {
  if (!questions || questions.length === 0) return {};
  const q = questions;
  return {
    BRIDGE:            q[0]                     || q[q.length - 1],
    CONCRETE_SCENARIO: q[1]  || q[0]            || q[q.length - 1],
    PARADOX:           q[2]  || q[1]  || q[0]   || q[q.length - 1],
    PROVOCATION:       q[3]  || q[2]  || q[1]   || q[q.length - 1]
  };
}

// ---------------------------------------------------------------------------
// _loadAllRubrics_
// Reads the entire CompetencyRubrics tab into a map keyed by competency_id.
// Used by getRubricsForLesson_ to avoid N sheet reads for N competencies.
// Not cached in Script Properties (too large) — reads from sheet each call.
// At ~150ms for a 220-row sheet read, this is acceptable for the
// nightly queue-build context.
// ---------------------------------------------------------------------------
function _loadAllRubrics_() {
  const cfg   = getConfig_();
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName("CompetencyRubrics");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("[S32] CompetencyRubrics tab empty — run importCompetencyRubrics() first.");
    return null;
  }

  const data = sheet.getDataRange().getValues();
  const map  = {};

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const compId = String(row[CR_COMPETENCY_ID] || "").trim();
    if (!compId) continue;

    let indicators = [], questions = [];
    try { indicators = JSON.parse(row[CR_DEMONSTRATION_INDICATORS] || "[]"); } catch(e) {}
    try { questions  = JSON.parse(row[CR_SKILL_QUESTIONS]          || "[]"); } catch(e) {}

    map[compId] = {
      competency_id:            compId,
      course:                   String(row[CR_COURSE]                 || "").trim(),
      task_number:              row[CR_TASK_NUMBER] !== "" ? Number(row[CR_TASK_NUMBER]) : null,
      duty_area:                String(row[CR_DUTY_AREA]              || "").trim(),
      competency_text:          String(row[CR_COMPETENCY_TEXT]        || "").trim(),
      demonstration_standard:   String(row[CR_DEMONSTRATION_STANDARD] || "").trim(),
      demonstration_indicators: indicators,
      skill_questions:          questions,
      archetype_question_map:   _buildArchetypeQuestionMap_(questions)
    };
  }

  return map;
}

// ---------------------------------------------------------------------------
// _findRubricFile_
// Searches teacher folder then all of Drive for CompetencyRubrics.json.
// ---------------------------------------------------------------------------
function _findRubricFile_(cfg) {
  if (cfg.teacherFolderId) {
    try {
      const folder = DriveApp.getFolderById(cfg.teacherFolderId);
      const files  = folder.getFilesByName(RUBRIC_JSON_FILENAME);
      if (files.hasNext()) return files.next();
    } catch(e) {
      Logger.log("[S32] Could not search teacher folder: " + e.message);
    }
  }
  const files = DriveApp.getFilesByName(RUBRIC_JSON_FILENAME);
  if (files.hasNext()) return files.next();
  return null;
}

// ---------------------------------------------------------------------------
// _invalidateRubricCache_
// Removes all cached rubric entries from Script Properties.
// Called on re-import to ensure stale data is not served.
// ---------------------------------------------------------------------------
function _invalidateRubricCache_() {
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const toDelete = Object.keys(all).filter(k => k.startsWith(RUBRIC_CACHE_PREFIX));
  if (toDelete.length > 0) {
    // deleteProperty one at a time — deleteProperties not available in all quotas
    toDelete.forEach(k => props.deleteProperty(k));
    Logger.log("[S32] Cache invalidated: " + toDelete.length + " entries removed.");
  }
}

// ---------------------------------------------------------------------------
// addRubricsToSnapshot_
// Convenience wrapper called by Script 24's buildWarmUpQueues() to add
// competency rubric data to the lesson context snapshot object before
// JSON.stringify(). Exported for use by Script 24 in the same project.
//
// Parameters:
//   snapshotObj — the plain JS object being built for JSON serialization
//   compIds     — array of competency ID strings from the lesson submission
//
// Mutates snapshotObj in place, adding:
//   snapshotObj.competency_rubrics = [{ competency_id, skill_questions,
//     demonstration_indicators, archetype_question_map, competency_text }]
//
// This is the function Script 24 calls. It replaces the simpler
// competency_texts array with a richer rubric payload.
// ---------------------------------------------------------------------------
function addRubricsToSnapshot_(snapshotObj, compIds) {
  if (!snapshotObj || !compIds || compIds.length === 0) return;

  const rubrics = getRubricsForLesson_(compIds);
  snapshotObj.competency_rubrics = rubrics;

  // Keep competency_texts for backward compatibility with existing Flow 3 prompts
  // that reference {competency_texts_formatted}
  if (!snapshotObj.competency_texts) {
    snapshotObj.competency_texts = rubrics.map(r => ({
      id:     r.competency_id,
      text:   r.competency_text,
      strand: r.duty_area
    }));
  }

  Logger.log("[S32] addRubricsToSnapshot_: " + rubrics.length +
             " rubric(s) added to snapshot.");
}
