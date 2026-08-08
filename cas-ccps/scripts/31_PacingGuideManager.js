// =============================================================================
// FILE: 31_PacingGuideManager.js  (renumbered from 29 during reconciliation
//       — Module 2's own numbering collided with the already-pushed
//       Module 4/5 scripts 29/30/30b; Module 2 moved to 31/32/33 per
//       repo reconciliation decision 1 (see cas-ccps/README.md).
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Manages the PacingGuide tab — imports the JSON pacing guide,
//          resolves lesson dates to unit IDs, and supplies warmup_anchor
//          seeds to Script 24 for inclusion in WarmUpQueue snapshots.
//
// ENTRY POINTS:
//   importPacingGuide()          — run once manually from Script Editor
//   resolveUnitForDate_(dateStr) — called by Script 23 (shadow matrix)
//   getWarmUpAnchor_(dateStr, courseName) — called by Script 24 (snapshot)
//
// PACING GUIDE TAB SCHEMA (PacingGuide):
//   lesson_unit_id | stage | stage_name | lesson_unit_name
//   approx_start   | approx_end | weeks | overlap_type
//   division_context | objective_8175 | objective_8177
//   competency_ids_8175 | competency_ids_8177
//   key_vocabulary | prior_lesson_connection | warmup_anchor
//
// DATE RESOLUTION:
//   A lesson date is matched to the unit whose approx_start ≤ date ≤ approx_end.
//   If a date falls between units (e.g. holiday gap), the nearest preceding
//   unit is returned. If no unit matches, null is returned.
//
// WARMUP_ANCHOR SELECTION:
//   Each unit has one warmup_anchor — a teacher-authored seed prompt.
//   Flow 3 personalizes this anchor for each student rather than
//   generating a warm-up from scratch. The anchor guarantees
//   pedagogical grounding; Flow 3 applies the archetype angle.
//
// COURSE FILTERING:
//   Units with overlap_type "Identical" apply to both courses.
//   Units with overlap_type "8175 only" or "8177 only" filter by
//   courseName. Units with overlap_type "Parallel" or "Complementary"
//   apply to both but have course-specific objectives.
//
// CACHING:
//   Pacing guide data is cached in Script Properties as a JSON string
//   (M2_PACING_GUIDE_CACHE) after the first read. Cache is invalidated
//   on re-import. Reduces Sheets API reads on nightly cron runs.
//
// =============================================================================

// ── PacingGuide tab column indices (0-based) ─────────────────────────────────
const PG_UNIT_ID           = 0;
const PG_STAGE             = 1;
const PG_STAGE_NAME        = 2;
const PG_UNIT_NAME         = 3;
const PG_APPROX_START      = 4;
const PG_APPROX_END        = 5;
const PG_WEEKS             = 6;
const PG_OVERLAP_TYPE      = 7;
const PG_DIVISION_CONTEXT  = 8;
const PG_OBJ_8175          = 9;
const PG_OBJ_8177          = 10;
const PG_COMP_IDS_8175     = 11;
const PG_COMP_IDS_8177     = 12;
const PG_KEY_VOCAB         = 13;
const PG_PRIOR_CONNECTION  = 14;
const PG_WARMUP_ANCHOR     = 15;
const PG_COL_COUNT         = 16;

const PG_HEADERS = [
  "lesson_unit_id", "stage", "stage_name", "lesson_unit_name",
  "approx_start", "approx_end", "weeks", "overlap_type",
  "division_context", "objective_8175", "objective_8177",
  "competency_ids_8175", "competency_ids_8177",
  "key_vocabulary", "prior_lesson_connection", "warmup_anchor"
];

const PACING_CACHE_KEY = "M2_PACING_GUIDE_CACHE";

// ---------------------------------------------------------------------------
// importPacingGuide
// Run once manually from Script Editor.
// Reads PacingGuide_CAS_Context.json from teacher Drive folder.
// Writes all units to the PacingGuide tab on the Central Ledger.
// Safe to re-run — clears existing data and rewrites from JSON.
// ---------------------------------------------------------------------------
function importPacingGuide() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);

  // ── Ensure PacingGuide tab exists ─────────────────────────────────────────
  let pgSheet = ss.getSheetByName("PacingGuide");
  if (!pgSheet) {
    pgSheet = ss.insertSheet("PacingGuide");
    Logger.log("[S31] Created PacingGuide tab.");
  }

  // ── Find JSON file in Drive ────────────────────────────────────────────────
  const jsonFile = _findPacingGuideFile_(cfg);
  if (!jsonFile) {
    Logger.log("[S31] PacingGuide_CAS_Context.json not found in Drive.");
    Logger.log("[S31] Upload the file to your teacher folder and try again.");
    return;
  }
  Logger.log("[S31] Found pacing guide: " + jsonFile.getName());

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let guide;
  try {
    const raw = jsonFile.getBlob().getDataAsString("UTF-8");
    guide = JSON.parse(raw);
  } catch (e) {
    Logger.log("[S31] JSON parse error: " + e.message);
    return;
  }

  const units = guide.pacing_guide;
  if (!Array.isArray(units) || units.length === 0) {
    Logger.log("[S31] pacing_guide array is empty or missing.");
    return;
  }

  // ── Write header row ──────────────────────────────────────────────────────
  pgSheet.clearContents();
  pgSheet.getRange(1, 1, 1, PG_COL_COUNT)
    .setValues([PG_HEADERS])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  pgSheet.setFrozenRows(1);

  // ── Build rows ────────────────────────────────────────────────────────────
  const rows = units.map(u => [
    String(u.lesson_unit_id         || "").trim(),
    u.stage !== undefined ? u.stage : "",
    String(u.stage_name             || "").trim(),
    String(u.lesson_unit_name       || "").trim(),
    String(u.approx_start           || "").trim(),
    String(u.approx_end             || "").trim(),
    String(u.weeks                  || "").trim(),
    String(u.overlap_type           || "").trim(),
    String(u.division_context       || "").trim(),
    String(u.objective_8175         || "").trim(),
    String(u.objective_8177         || "").trim(),
    String(u.competency_ids_8175    || "").trim(),
    String(u.competency_ids_8177    || "").trim(),
    String(u.key_vocabulary         || "").trim(),
    String(u.prior_lesson_connection || "").trim(),
    String(u.warmup_anchor          || "").trim()
  ]);

  // ── Batch write ────────────────────────────────────────────────────────────
  pgSheet.getRange(2, 1, rows.length, PG_COL_COUNT).setValues(rows);

  // ── Invalidate cache ──────────────────────────────────────────────────────
  PropertiesService.getScriptProperties().deleteProperty(PACING_CACHE_KEY);

  Logger.log("[S31] Pacing guide imported: " + rows.length + " units.");
  Logger.log("[S31] Cache invalidated.");

  // ── Validate ──────────────────────────────────────────────────────────────
  validatePacingGuide();
}

// ---------------------------------------------------------------------------
// validatePacingGuide — run after import to verify data integrity
// ---------------------------------------------------------------------------
function validatePacingGuide() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName("PacingGuide");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("[S31-VALIDATE] PacingGuide tab empty or missing.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  let total = 0, noAnchor = 0, noStart = 0, noEnd = 0;
  const units8175 = [], units8177 = [], unitsBoth = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[PG_UNIT_ID]) continue;
    total++;

    if (!row[PG_WARMUP_ANCHOR]) noAnchor++;
    if (!row[PG_APPROX_START])  noStart++;
    if (!row[PG_APPROX_END])    noEnd++;

    const overlap = String(row[PG_OVERLAP_TYPE] || "").trim();
    if (overlap === "8175 only")  units8175.push(row[PG_UNIT_ID]);
    else if (overlap === "8177 only") units8177.push(row[PG_UNIT_ID]);
    else                           unitsBoth.push(row[PG_UNIT_ID]);
  }

  Logger.log("[S31-VALIDATE] PacingGuide summary:");
  Logger.log("[S31-VALIDATE]   Total units:         " + total);
  Logger.log("[S31-VALIDATE]   Both courses:        " + unitsBoth.length);
  Logger.log("[S31-VALIDATE]   8175 only:           " + units8175.length);
  Logger.log("[S31-VALIDATE]   8177 only:           " + units8177.length);
  Logger.log("[S31-VALIDATE]   Missing anchor:      " + noAnchor);
  Logger.log("[S31-VALIDATE]   Missing start date:  " + noStart);
  Logger.log("[S31-VALIDATE]   Missing end date:    " + noEnd);

  if (noAnchor > 0 || noStart > 0 || noEnd > 0) {
    Logger.log("[S31-VALIDATE] ⚠ Issues found — check pacing guide JSON.");
  } else {
    Logger.log("[S31-VALIDATE] ✓ All units valid.");
  }
}

// ---------------------------------------------------------------------------
// resolveUnitForDate_
// Returns the pacing guide unit object for a given date string (YYYY-MM-DD).
// Called by Script 23 (shadow matrix update) and Script 24 (snapshot build).
//
// Returns:
//   { unit_id, stage, stage_name, unit_name, start, end, warmup_anchor,
//     key_vocabulary, prior_connection, objective_8175, objective_8177,
//     competency_ids_8175, competency_ids_8177, overlap_type } or null
// ---------------------------------------------------------------------------
function resolveUnitForDate_(dateStr) {
  if (!dateStr) return null;

  const units = _loadPacingGuide_();
  if (!units || units.length === 0) return null;

  const targetDate = new Date(dateStr + "T00:00:00");

  // Find units whose date range contains the target date
  let match    = null;
  let fallback = null; // nearest preceding unit

  for (const unit of units) {
    const start = unit.approx_start ? new Date(unit.approx_start + "T00:00:00") : null;
    const end   = unit.approx_end   ? new Date(unit.approx_end   + "T23:59:59") : null;

    if (!start || !end) continue;

    if (targetDate >= start && targetDate <= end) {
      match = unit;
      break;
    }

    // Track nearest preceding unit as fallback (for gaps between units)
    if (targetDate > end) {
      if (!fallback || start > new Date(fallback.approx_start + "T00:00:00")) {
        fallback = unit;
      }
    }
  }

  const result = match || fallback;
  if (!result) return null;

  return {
    unit_id:               result.lesson_unit_id,
    stage:                 result.stage,
    stage_name:            result.stage_name,
    unit_name:             result.lesson_unit_name,
    start:                 result.approx_start,
    end:                   result.approx_end,
    overlap_type:          result.overlap_type,
    warmup_anchor:         result.warmup_anchor,
    key_vocabulary:        result.key_vocabulary,
    prior_connection:      result.prior_lesson_connection,
    objective_8175:        result.objective_8175,
    objective_8177:        result.objective_8177,
    competency_ids_8175:   result.competency_ids_8175,
    competency_ids_8177:   result.competency_ids_8177
  };
}

// ---------------------------------------------------------------------------
// getWarmUpAnchor_
// Returns the warmup_anchor string for a given date and course name.
// Called by Script 24 when building the lessonContextSnapshot.
//
// If courseName contains "8175" → uses objective_8175
// If courseName contains "8177" → uses objective_8177
// warmup_anchor is the same for both courses within a unit.
//
// Returns: { anchor, unit_id, unit_name, stage, prior_connection,
//            key_vocabulary, course_objective } or null
// ---------------------------------------------------------------------------
function getWarmUpAnchor_(dateStr, courseName) {
  const unit = resolveUnitForDate_(dateStr);
  if (!unit) return null;

  // Select course-specific objective
  const is8175 = courseName && courseName.includes("8175") ||
                 (courseName && courseName.toLowerCase().includes("marketing"));
  const is8177 = courseName && courseName.includes("8177") ||
                 (courseName && courseName.toLowerCase().includes("management"));

  let courseObjective = "";
  if (is8175)      courseObjective = unit.objective_8175;
  else if (is8177) courseObjective = unit.objective_8177;
  else             courseObjective = unit.objective_8175 || unit.objective_8177;

  // Check course-specific unit availability
  const overlap = String(unit.overlap_type || "").trim();
  if (overlap === "8175 only" && is8177) {
    Logger.log("[S31] Unit " + unit.unit_id + " is 8175-only — no anchor for 8177.");
    return null;
  }
  if (overlap === "8177 only" && is8175) {
    Logger.log("[S31] Unit " + unit.unit_id + " is 8177-only — no anchor for 8175.");
    return null;
  }

  return {
    anchor:           unit.warmup_anchor,
    unit_id:          unit.unit_id,
    unit_name:        unit.unit_name,
    stage:            unit.stage,
    stage_name:       unit.stage_name,
    prior_connection: unit.prior_connection,
    key_vocabulary:   unit.key_vocabulary,
    course_objective: courseObjective
  };
}

// ---------------------------------------------------------------------------
// getAllUnits_
// Returns all pacing guide units as an array.
// Used by Script 23 when building the shadow matrix — needs all units
// to compute unit membership for historical warm-up rows.
// ---------------------------------------------------------------------------
function getAllUnits_() {
  return _loadPacingGuide_() || [];
}

// ---------------------------------------------------------------------------
// getUnitById_
// Returns one unit by lesson_unit_id.
// Used by Script 23 shadow matrix when processing historical warm-up rows.
// ---------------------------------------------------------------------------
function getUnitById_(unitId) {
  const units = _loadPacingGuide_();
  if (!units) return null;
  return units.find(u => u.lesson_unit_id === unitId) || null;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

// ---------------------------------------------------------------------------
// _loadPacingGuide_
// Reads the PacingGuide tab and returns an array of unit objects.
// Uses Script Properties cache to avoid repeated Sheets reads.
// Cache is invalidated on re-import.
// ---------------------------------------------------------------------------
function _loadPacingGuide_() {
  const props = PropertiesService.getScriptProperties();

  // ── Try cache first ────────────────────────────────────────────────────────
  const cached = props.getProperty(PACING_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      Logger.log("[S31] Cache parse error — re-reading from sheet.");
      props.deleteProperty(PACING_CACHE_KEY);
    }
  }

  // ── Read from sheet ────────────────────────────────────────────────────────
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName("PacingGuide");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("[S31] PacingGuide tab empty — run importPacingGuide() first.");
    return null;
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  // Resolve column indices by name — resilient to column additions
  const idx = {};
  PG_HEADERS.forEach((h, i) => { idx[h] = headers.indexOf(h); });

  const units = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const unitId = idx.lesson_unit_id !== -1
      ? String(row[idx.lesson_unit_id] || "").trim() : "";
    if (!unitId) continue;

    units.push({
      lesson_unit_id:        unitId,
      stage:                 row[idx.stage] !== undefined ? row[idx.stage] : "",
      stage_name:            String(row[idx.stage_name]             || "").trim(),
      lesson_unit_name:      String(row[idx.lesson_unit_name]       || "").trim(),
      approx_start:          String(row[idx.approx_start]           || "").trim(),
      approx_end:            String(row[idx.approx_end]             || "").trim(),
      overlap_type:          String(row[idx.overlap_type]           || "").trim(),
      objective_8175:        String(row[idx.objective_8175]         || "").trim(),
      objective_8177:        String(row[idx.objective_8177]         || "").trim(),
      competency_ids_8175:   String(row[idx.competency_ids_8175]    || "").trim(),
      competency_ids_8177:   String(row[idx.competency_ids_8177]    || "").trim(),
      key_vocabulary:        String(row[idx.key_vocabulary]         || "").trim(),
      prior_lesson_connection: String(row[idx.prior_lesson_connection] || "").trim(),
      warmup_anchor:         String(row[idx.warmup_anchor]          || "").trim()
    });
  }

  // ── Write to cache ────────────────────────────────────────────────────────
  // Script Properties has a 9KB limit per property.
  // At ~500 bytes per unit × 20 units = ~10KB — at the limit.
  // Truncate warmup_anchor to 200 chars for cache storage;
  // full text is read from sheet when needed for Flow 3 payloads.
  const cacheUnits = units.map(u => ({
    ...u,
    warmup_anchor: u.warmup_anchor.substring(0, 200)
  }));

  try {
    props.setProperty(PACING_CACHE_KEY, JSON.stringify(cacheUnits));
    Logger.log("[S31] Pacing guide cached (" + units.length + " units).");
  } catch (e) {
    Logger.log("[S31] Could not cache pacing guide (size limit): " + e.message);
    // Non-fatal — will re-read from sheet next time
  }

  return units;
}

// ---------------------------------------------------------------------------
// _findPacingGuideFile_
// Searches teacher folder then all of Drive for the pacing guide JSON.
// ---------------------------------------------------------------------------
function _findPacingGuideFile_(cfg) {
  const FILENAME = "PacingGuide_CAS_Context.json";

  if (cfg.teacherFolderId) {
    try {
      const folder = DriveApp.getFolderById(cfg.teacherFolderId);
      const files  = folder.getFilesByName(FILENAME);
      if (files.hasNext()) return files.next();
    } catch (e) {
      Logger.log("[S31] Could not search teacher folder: " + e.message);
    }
  }

  const files = DriveApp.getFilesByName(FILENAME);
  if (files.hasNext()) return files.next();
  return null;
}
