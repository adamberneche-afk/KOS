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
//   chain_node | esports_connection | vocabulary_with_definitions
//   studio_flow_hooks
//   (last 4 columns added when PacingGuide_CAS_Context.json moved to its
//   v2 schema — see cas-ccps/README.md item 8. vocabulary_with_definitions
//   and studio_flow_hooks are structured data (array / object) stored in
//   the sheet as a JSON string and parsed back out on read.)
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
//   Pacing guide data is cached in Script Properties, one property per
//   unit (M2_PACING_UNIT_<lesson_unit_id>, full row, JSON-encoded) plus
//   a small index property (M2_PACING_GUIDE_INDEX, just the ordered list
//   of unit IDs currently cached). This is a per-unit split, not one
//   big blob — a single PropertiesService property is capped at 9216
//   bytes, and with real 2026-27 data a single all-units blob (even with
//   only the original 16 fields) runs to ~28-70KB depending on which
//   fields are included, well over that cap; every unit's *own* row,
//   individually, comes in well under the cap (largest observed unit is
//   ~5.2KB). Splitting the cache this way means no field needs blanket
//   truncation for real data. A defensive per-unit safety valve still
//   exists (see _loadPacingGuide_) in case a future unit's content alone
//   ever exceeds the per-property cap. Cache is invalidated on re-import.
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
// ── v2 pacing guide fields (appended — see cas-ccps/README.md item 8) ────────
const PG_CHAIN_NODE            = 16;
const PG_ESPORTS_CONNECTION    = 17;
const PG_VOCAB_WITH_DEFS       = 18;
const PG_STUDIO_FLOW_HOOKS     = 19;
const PG_COL_COUNT             = 20;

const PG_HEADERS = [
  "lesson_unit_id", "stage", "stage_name", "lesson_unit_name",
  "approx_start", "approx_end", "weeks", "overlap_type",
  "division_context", "objective_8175", "objective_8177",
  "competency_ids_8175", "competency_ids_8177",
  "key_vocabulary", "prior_lesson_connection", "warmup_anchor",
  "chain_node", "esports_connection", "vocabulary_with_definitions",
  "studio_flow_hooks"
];

// JSON-structured fields (arrays/objects), stored in the sheet as a JSON
// string rather than a scalar — parsed back out on read, with a
// defensive fallback if a cell was hand-edited into invalid JSON.
const PG_JSON_FIELDS = {
  vocabulary_with_definitions: [],
  studio_flow_hooks: {}
};

// Per-unit cache property prefix — see CACHING note above.
const PACING_CACHE_KEY        = "M2_PACING_GUIDE_INDEX";
const PACING_UNIT_CACHE_PREFIX = "M2_PACING_UNIT_";
// Safety margin under PropertiesService's real 9216-byte-per-property
// cap. If a single unit's full JSON ever exceeds this (not the case for
// any real 2026-27 unit — max observed is ~5.2KB), _loadPacingGuide_
// truncates that one unit's warmup_anchor for caching purposes only and
// flags it, reusing the same truncated-flag + lazy-refetch mechanism
// getWarmUpAnchor_ already relies on.
const PACING_UNIT_CACHE_SAFE_BYTES = 9000;

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
    String(u.warmup_anchor          || "").trim(),
    String(u.chain_node             || "").trim(),
    String(u.esports_connection     || "").trim(),
    _stringifyPacingJsonField_(u.vocabulary_with_definitions, PG_JSON_FIELDS.vocabulary_with_definitions),
    _stringifyPacingJsonField_(u.studio_flow_hooks, PG_JSON_FIELDS.studio_flow_hooks)
  ]);

  // ── Batch write ────────────────────────────────────────────────────────────
  pgSheet.getRange(2, 1, rows.length, PG_COL_COUNT).setValues(rows);

  // ── Invalidate cache ──────────────────────────────────────────────────────
  _clearPacingGuideCache_();

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
  let noChainNode = 0, noEsports = 0, noVocabDefs = 0;
  const units8175 = [], units8177 = [], unitsBoth = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[PG_UNIT_ID]) continue;
    total++;

    if (!row[PG_WARMUP_ANCHOR]) noAnchor++;
    if (!row[PG_APPROX_START])  noStart++;
    if (!row[PG_APPROX_END])    noEnd++;
    if (!row[PG_CHAIN_NODE])         noChainNode++;
    if (!row[PG_ESPORTS_CONNECTION]) noEsports++;
    if (!_parsePacingJsonField_(row[PG_VOCAB_WITH_DEFS], []).length) noVocabDefs++;

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
  Logger.log("[S31-VALIDATE]   Missing chain_node:  " + noChainNode + " (v2 field — informational, not required)");
  Logger.log("[S31-VALIDATE]   Missing esports_connection: " + noEsports + " (v2 field — informational, not required)");
  Logger.log("[S31-VALIDATE]   Missing vocabulary_with_definitions: " + noVocabDefs + " (v2 field — informational, not required)");

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
//     competency_ids_8175, competency_ids_8177, overlap_type,
//     chain_node, esports_connection, vocabulary_with_definitions,
//     studio_flow_hooks } or null
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
    // Present (true) only on a cache-hit unit whose anchor was actually
    // cut to fit the cache — see _loadPacingGuide_. Absent/undefined on
    // a fresh sheet read, which is already full text.
    warmup_anchor_truncated: result.warmup_anchor_truncated || false,
    key_vocabulary:        result.key_vocabulary,
    prior_connection:      result.prior_lesson_connection,
    objective_8175:        result.objective_8175,
    objective_8177:        result.objective_8177,
    competency_ids_8175:   result.competency_ids_8175,
    competency_ids_8177:   result.competency_ids_8177,
    // v2 pacing guide fields — see cas-ccps/README.md item 8.
    chain_node:                  result.chain_node || "",
    esports_connection:          result.esports_connection || "",
    vocabulary_with_definitions: result.vocabulary_with_definitions || [],
    studio_flow_hooks:           result.studio_flow_hooks || {}
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
//            key_vocabulary, course_objective, chain_node,
//            esports_connection, vocabulary_with_definitions,
//            studio_flow_hooks } or null
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

  // If this unit's anchor came from the cache truncated, fetch the real
  // full text before handing it to Flow 3 — this is the one caller that
  // actually needs it (per this function's own docstring: "Called by
  // Script 24 when building the lessonContextSnapshot"). getAllUnits_()/
  // getUnitById_() callers that only need metadata (stage, dates, etc.)
  // are unaffected and keep the fast cached path.
  let anchorText = unit.warmup_anchor;
  if (unit.warmup_anchor_truncated) {
    const full = _getFullPacingField_(unit.unit_id, "warmup_anchor");
    if (full) anchorText = full;
  }

  return {
    anchor:           anchorText,
    unit_id:          unit.unit_id,
    unit_name:        unit.unit_name,
    stage:            unit.stage,
    stage_name:       unit.stage_name,
    prior_connection: unit.prior_connection,
    key_vocabulary:   unit.key_vocabulary,
    course_objective: courseObjective,
    // v2 pacing guide fields — see cas-ccps/README.md item 8. Not yet
    // consumed by any Flow 3 prompt template; passed through so a future
    // prompt-template change can use them without another Script 31 edit.
    chain_node:                  unit.chain_node || "",
    esports_connection:          unit.esports_connection || "",
    vocabulary_with_definitions: unit.vocabulary_with_definitions || [],
    studio_flow_hooks:           unit.studio_flow_hooks || {}
  };
}

// ---------------------------------------------------------------------------
// _getFullPacingField_
// Targeted re-read of one unit's full-text value for one column, straight
// from the PacingGuide sheet, bypassing the (possibly-truncated) cache.
// Generalized from the warmup_anchor-only version of this helper so any
// column can be safety-valve-truncated in the cache (see
// PACING_UNIT_CACHE_SAFE_BYTES) without needing its own bespoke re-fetch
// function. Only called when _loadPacingGuide_ flagged that column
// truncated for a given unit — not needed for any real 2026-27 unit today.
// ---------------------------------------------------------------------------
function _getFullPacingField_(unitId, fieldName) {
  try {
    const cfg   = getConfig_();
    const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
    const sheet = ss.getSheetByName("PacingGuide");
    if (!sheet || sheet.getLastRow() < 2) return "";

    const data    = sheet.getDataRange().getValues();
    const headers = data[0].map(h => String(h).trim());
    const idIdx    = headers.indexOf("lesson_unit_id");
    const fieldIdx = headers.indexOf(fieldName);
    if (idIdx === -1 || fieldIdx === -1) return "";

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx] || "").trim() === unitId) {
        return String(data[i][fieldIdx] || "").trim();
      }
    }
    return "";
  } catch (e) {
    Logger.log("[S31] _getFullPacingField_ failed for " + unitId + "." + fieldName + ": " + e.message);
    return "";
  }
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
// Uses a per-unit Script Properties cache (see CACHING note at the top of
// this file) to avoid repeated Sheets reads. Cache is invalidated on
// re-import.
// ---------------------------------------------------------------------------
function _loadPacingGuide_() {
  const props = PropertiesService.getScriptProperties();

  // ── Try cache first ────────────────────────────────────────────────────────
  const cachedUnits = _readPacingGuideCache_(props);
  if (cachedUnits) return cachedUnits;

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
      warmup_anchor:         String(row[idx.warmup_anchor]          || "").trim(),
      // v2 pacing guide fields — see cas-ccps/README.md item 8. idx.<name>
      // is -1 (falls through to "") for a PacingGuide tab that predates
      // the v2 import, so this is safe against not-yet-reimported sheets.
      chain_node:                  idx.chain_node !== -1 ? String(row[idx.chain_node] || "").trim() : "",
      esports_connection:          idx.esports_connection !== -1 ? String(row[idx.esports_connection] || "").trim() : "",
      vocabulary_with_definitions: idx.vocabulary_with_definitions !== -1
        ? _parsePacingJsonField_(row[idx.vocabulary_with_definitions], PG_JSON_FIELDS.vocabulary_with_definitions)
        : PG_JSON_FIELDS.vocabulary_with_definitions,
      studio_flow_hooks: idx.studio_flow_hooks !== -1
        ? _parsePacingJsonField_(row[idx.studio_flow_hooks], PG_JSON_FIELDS.studio_flow_hooks)
        : PG_JSON_FIELDS.studio_flow_hooks
    });
  }

  _writePacingGuideCache_(props, units);
  return units;
}

// ---------------------------------------------------------------------------
// _readPacingGuideCache_
// Reads the per-unit cache (index + one M2_PACING_UNIT_<id> property per
// unit) and reassembles the units array in original order. Returns null on
// any miss/mismatch so the caller falls back to a fresh sheet read — a
// partial or stale cache is treated as no cache at all, never as a partial
// result, so callers never see some units cached and others missing.
// ---------------------------------------------------------------------------
function _readPacingGuideCache_(props) {
  const indexRaw = props.getProperty(PACING_CACHE_KEY);
  if (!indexRaw) return null;

  let unitIds;
  try {
    unitIds = JSON.parse(indexRaw);
    if (!Array.isArray(unitIds) || unitIds.length === 0) return null;
  } catch (e) {
    Logger.log("[S31] Cache index parse error — re-reading from sheet.");
    return null;
  }

  // One bulk read for every property, not N individual getProperty() calls.
  const allProps = props.getProperties();
  const units = [];
  for (const unitId of unitIds) {
    const raw = allProps[PACING_UNIT_CACHE_PREFIX + unitId];
    if (!raw) {
      Logger.log("[S31] Cache miss for unit " + unitId + " — re-reading from sheet.");
      return null;
    }
    try {
      units.push(JSON.parse(raw));
    } catch (e) {
      Logger.log("[S31] Cache parse error for unit " + unitId + " — re-reading from sheet.");
      return null;
    }
  }
  return units;
}

// ---------------------------------------------------------------------------
// _writePacingGuideCache_
// Writes one Script Properties entry per unit (full row, JSON-encoded)
// plus a small index of unit IDs. Each unit is its own property, so no
// field needs blanket truncation for real data (max observed unit is
// ~5.2KB against a 9216-byte cap) — see the CACHING note at the top of
// this file for why a single all-units blob doesn't fit. Non-fatal on
// failure: logs and returns, leaving the next call to re-read from sheet.
// ---------------------------------------------------------------------------
function _writePacingGuideCache_(props, units) {
  const unitIds = [];
  for (const u of units) {
    let cacheUnit = u;
    let json = JSON.stringify(cacheUnit);

    // Defensive safety valve — not needed for any real 2026-27 unit today
    // (max observed ~5.2KB), but if a future unit's own content alone
    // exceeds the per-property cap, truncate its warmup_anchor (the
    // field this repo has already established as safe to cut, with a
    // matching lazy full-text re-fetch in getWarmUpAnchor_) rather than
    // silently failing to cache that unit at all.
    if (json.length > PACING_UNIT_CACHE_SAFE_BYTES) {
      const overBy = json.length - PACING_UNIT_CACHE_SAFE_BYTES;
      const keepLen = Math.max(0, u.warmup_anchor.length - overBy - 50);
      cacheUnit = {
        ...u,
        warmup_anchor: u.warmup_anchor.substring(0, keepLen),
        warmup_anchor_truncated: true
      };
      json = JSON.stringify(cacheUnit);
      Logger.log("[S31] Unit " + u.lesson_unit_id + " cache row truncated warmup_anchor to fit the " +
        PACING_UNIT_CACHE_SAFE_BYTES + "-byte safety margin (full text: " + u.warmup_anchor.length + " chars).");
    }

    if (json.length > 9216) {
      // Still too big even after truncating the one field we know how to
      // cut — skip caching this unit rather than risk a hard setProperty
      // failure; it'll be read straight from the sheet every time until
      // fixed at the data source.
      Logger.log("[S31] Unit " + u.lesson_unit_id + " could not be cached (over 9216 bytes even truncated) — will always read fresh from sheet.");
      continue;
    }

    try {
      props.setProperty(PACING_UNIT_CACHE_PREFIX + u.lesson_unit_id, json);
      unitIds.push(u.lesson_unit_id);
    } catch (e) {
      Logger.log("[S31] Could not cache unit " + u.lesson_unit_id + ": " + e.message);
    }
  }

  try {
    props.setProperty(PACING_CACHE_KEY, JSON.stringify(unitIds));
    Logger.log("[S31] Pacing guide cached (" + unitIds.length + " of " + units.length + " units).");
  } catch (e) {
    Logger.log("[S31] Could not write cache index: " + e.message);
  }
}

// ---------------------------------------------------------------------------
// _clearPacingGuideCache_
// Deletes the index property and every per-unit property it references.
// Called on re-import so stale per-unit rows never survive across an
// import that removes or renumbers units.
// ---------------------------------------------------------------------------
function _clearPacingGuideCache_() {
  const props = PropertiesService.getScriptProperties();
  const indexRaw = props.getProperty(PACING_CACHE_KEY);
  if (indexRaw) {
    try {
      const unitIds = JSON.parse(indexRaw);
      if (Array.isArray(unitIds)) {
        unitIds.forEach(id => props.deleteProperty(PACING_UNIT_CACHE_PREFIX + id));
      }
    } catch (e) {
      // Index was corrupt — fall through and still clear it below.
    }
  }
  props.deleteProperty(PACING_CACHE_KEY);
}

// ---------------------------------------------------------------------------
// _stringifyPacingJsonField_
// Serializes a structured pacing-guide field (array/object) to a JSON
// string for storage in a flat PacingGuide sheet cell. Falls back to the
// field's default (e.g. "[]"/"{}") if the source value is missing or
// can't be serialized.
// ---------------------------------------------------------------------------
function _stringifyPacingJsonField_(value, defaultValue) {
  try {
    return JSON.stringify(value !== undefined && value !== null ? value : defaultValue);
  } catch (e) {
    return JSON.stringify(defaultValue);
  }
}

// ---------------------------------------------------------------------------
// _parsePacingJsonField_
// Parses a structured pacing-guide field back out of its sheet-cell JSON
// string. Falls back to defaultValue if the cell is empty or was
// hand-edited into invalid JSON, rather than throwing and breaking the
// whole pacing guide load for one bad cell.
// ---------------------------------------------------------------------------
function _parsePacingJsonField_(cellValue, defaultValue) {
  const raw = String(cellValue || "").trim();
  if (!raw) return defaultValue;
  try {
    return JSON.parse(raw);
  } catch (e) {
    Logger.log("[S31] Could not parse JSON field cell (\"" + raw.substring(0, 40) + "...\") — using default.");
    return defaultValue;
  }
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
