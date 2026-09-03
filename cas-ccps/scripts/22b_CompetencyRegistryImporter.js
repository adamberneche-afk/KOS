// =============================================================================
// FILE: 22b_CompetencyRegistryImporter.js
// BOUND TO: Central Ledger spreadsheet (same project as Script 22)
// PURPOSE: One-time import of CompetencyRegistry data from a CSV file
//          in Google Drive into the CompetencyRegistry tab.
//
// USAGE:
//   1. Upload CompetencyRegistry.csv to your Google Drive teacher folder.
//   2. Set the CSV_FILE_NAME constant below (or leave as default).
//   3. Run importCompetencyRegistry() from the Script Editor.
//   4. Check the CompetencyRegistry tab — rows will be appended.
//   5. Safe to re-run: duplicate competency_ids are skipped, not overwritten.
//
// CSV FORMAT (must match exactly — headers on row 1):
//   competency_id, competency_text, subject, grade_band,
//   strand, teacher_email, active
//
// The CSV produced by the Python export script matches this format exactly.
//
// RE-IMPORT BEHAVIOR:
//   - Existing rows with the same competency_id are SKIPPED (not overwritten).
//   - New IDs are appended.
//   - To replace a competency, set active=FALSE on the old row manually,
//     then change the ID in the CSV and re-import.
//   - To do a full reset: delete all rows below the header in
//     CompetencyRegistry, then re-import.
//
// =============================================================================

// Name of the CSV file in Drive to import from.
// Script searches the teacher's folder (cfg.teacherFolderId) first,
// then falls back to searching all of Drive.
const REGISTRY_CSV_FILENAME = "CompetencyRegistry.csv";

// ---------------------------------------------------------------------------
// importCompetencyRegistry — primary entry point. Run from Script Editor.
// ---------------------------------------------------------------------------
function importCompetencyRegistry() {
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);

  // ── Find the CompetencyRegistry tab ──────────────────────────────────────
  const regSheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
  if (!regSheet) {
    Logger.log("[IMPORT] CompetencyRegistry tab not found. Run createModule2Tabs_() first.");
    return;
  }

  // ── Find the CSV file in Drive ────────────────────────────────────────────
  const csvFile = findCsvFile_(cfg);
  if (!csvFile) {
    Logger.log("[IMPORT] CSV file '" + REGISTRY_CSV_FILENAME + "' not found in Drive.");
    Logger.log("[IMPORT] Upload the file to your teacher folder and try again.");
    return;
  }
  Logger.log("[IMPORT] Found CSV: " + csvFile.getName() + " (" + csvFile.getId() + ")");

  // ── Parse CSV ─────────────────────────────────────────────────────────────
  const csvText = csvFile.getBlob().getDataAsString("UTF-8");
  const parsed  = parseCsv_(csvText);
  if (!parsed || parsed.length < 2) {
    Logger.log("[IMPORT] CSV appears empty or header-only.");
    return;
  }

  const headers = parsed[0].map(h => h.trim().toLowerCase());
  const iId      = headers.indexOf("competency_id");
  const iText    = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iGrade   = headers.indexOf("grade_band");
  const iStrand  = headers.indexOf("strand");
  const iEmail   = headers.indexOf("teacher_email");
  const iActive  = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    Logger.log("[IMPORT] CSV missing required columns: competency_id and/or competency_text.");
    Logger.log("[IMPORT] Found headers: " + parsed[0].join(", "));
    return;
  }

  // ── Build set of existing IDs (dedup) ────────────────────────────────────
  const existingData = regSheet.getDataRange().getValues();
  const existingIds  = new Set();
  // Find the competency_id column in the sheet by header name
  const sheetHeaders = existingData[0].map(h => String(h).trim().toLowerCase());
  const sheetIdCol   = sheetHeaders.indexOf("competency_id");

  if (sheetIdCol !== -1) {
    for (let i = 1; i < existingData.length; i++) {
      const id = String(existingData[i][sheetIdCol]).trim();
      if (id) existingIds.add(id);
    }
  }

  Logger.log("[IMPORT] Existing IDs in registry: " + existingIds.size);

  // ── Build rows to append ──────────────────────────────────────────────────
  const toAppend = [];
  let skipped    = 0;

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i];
    if (row.length < 2) continue; // empty/malformed row

    const id = iId !== -1 ? String(row[iId] || "").trim() : "";
    if (!id) continue;

    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    // Build sheet row in canonical column order
    // (matches createModule2Tabs_() header definition)
    toAppend.push([
      id,                                              // competency_id
      iText    !== -1 ? String(row[iText]    || "").trim() : "",  // competency_text
      iSubject !== -1 ? String(row[iSubject] || "").trim() : "",  // subject
      iGrade   !== -1 ? String(row[iGrade]   || "").trim() : "",  // grade_band
      iStrand  !== -1 ? String(row[iStrand]  || "").trim() : "",  // strand
      iEmail   !== -1 ? String(row[iEmail]   || "").trim() : "",  // teacher_email
      iActive  !== -1 ? String(row[iActive]  || "TRUE").trim() : "TRUE" // active
    ]);

    existingIds.add(id); // prevent dupes within this import batch
  }

  if (toAppend.length === 0) {
    Logger.log("[IMPORT] No new rows to import. " + skipped + " row(s) already present.");
    return;
  }

  // ── Batch write ───────────────────────────────────────────────────────────
  // Write all new rows in a single setValues() call for performance.
  const startRow = regSheet.getLastRow() + 1;
  regSheet.getRange(startRow, 1, toAppend.length, 7).setValues(toAppend);

  // Invalidate getCompetencyTextMap_()'s CacheService entry (00_SharedConfig.js)
  // — new competency_ids just landed on the sheet and must not be masked by
  // a cached map built before this import ran. Same "cache invalidated on
  // re-import" discipline as 31_PacingGuideManager.js's pacing-guide cache.
  // Non-fatal if CacheService itself is unavailable — the cache would only
  // otherwise self-correct after its own TTL.
  try {
    CacheService.getScriptCache().remove(COMPETENCY_REGISTRY_CACHE_KEY);
  } catch (e) { /* non-fatal — see comment above */ }

  Logger.log("[IMPORT] Import complete.");
  Logger.log("[IMPORT]   Imported: " + toAppend.length + " row(s)");
  Logger.log("[IMPORT]   Skipped (already present): " + skipped + " row(s)");
  Logger.log("[IMPORT]   Total in registry: " + (existingIds.size) + " competencies");
}

// ---------------------------------------------------------------------------
// findCsvFile_ — searches teacher folder first, then all of Drive
// ---------------------------------------------------------------------------
function findCsvFile_(cfg) {
  // Search teacher folder first (preferred — unambiguous)
  if (cfg.teacherFolderId) {
    try {
      const folder = DriveApp.getFolderById(cfg.teacherFolderId);
      const files  = folder.getFilesByName(REGISTRY_CSV_FILENAME);
      if (files.hasNext()) return files.next();
    } catch (e) {
      Logger.log("[IMPORT] Could not search teacher folder: " + e.message);
    }
  }

  // Fall back to Drive-wide search
  const files = DriveApp.getFilesByName(REGISTRY_CSV_FILENAME);
  if (files.hasNext()) return files.next();

  return null;
}

// ---------------------------------------------------------------------------
// parseCsv_ — parses a CSV string into a 2D array.
// Handles quoted fields with embedded commas and newlines.
// Standard RFC 4180 compliance.
// ---------------------------------------------------------------------------
function parseCsv_(text) {
  const rows   = [];
  let   row    = [];
  let   field  = "";
  let   inQuote = false;
  let   i = 0;

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < text.length) {
    const ch   = text[i];
    const next = text[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') {
        // Escaped quote
        field += '"';
        i += 2;
      } else if (ch === '"') {
        inQuote = false;
        i++;
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = "";
        i++;
      } else if (ch === '\n') {
        row.push(field.trim());
        field = "";
        if (row.some(f => f !== "")) rows.push(row); // skip blank lines
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Final field/row
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some(f => f !== "")) rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// validateRegistryImport — run after import to verify data integrity.
// Logs a summary and flags any rows with missing required fields.
// ---------------------------------------------------------------------------
function validateRegistryImport() {
  const cfg      = getConfig_();
  const ss       = SpreadsheetApp.openById(cfg.ledgerSsId);
  const regSheet = ss.getSheetByName(cfg.tabs.competencyRegistry);

  if (!regSheet) {
    Logger.log("[VALIDATE] CompetencyRegistry tab not found.");
    return;
  }

  const data    = regSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const iId     = headers.indexOf("competency_id");
  const iText   = headers.indexOf("competency_text");
  const iActive = headers.indexOf("active");

  let total    = 0;
  let active   = 0;
  let inactive = 0;
  let issues   = [];

  for (let i = 1; i < data.length; i++) {
    const id   = iId   !== -1 ? String(data[i][iId]).trim()   : "";
    const text = iText !== -1 ? String(data[i][iText]).trim() : "";
    const act  = iActive !== -1 ? String(data[i][iActive]).trim().toUpperCase() : "TRUE";

    if (!id && !text) continue; // blank row
    total++;

    if (act === "FALSE") inactive++;
    else active++;

    if (!id)   issues.push("Row " + (i+1) + ": missing competency_id");
    if (!text) issues.push("Row " + (i+1) + ": missing competency_text (id: " + id + ")");
  }

  Logger.log("[VALIDATE] CompetencyRegistry summary:");
  Logger.log("[VALIDATE]   Total rows: "    + total);
  Logger.log("[VALIDATE]   Active:     "    + active);
  Logger.log("[VALIDATE]   Inactive:   "    + inactive);

  // Group by subject
  const iSubject = headers.indexOf("subject");
  if (iSubject !== -1) {
    const subjects = {};
    for (let i = 1; i < data.length; i++) {
      const subj = String(data[i][iSubject] || "").trim() || "(no subject)";
      subjects[subj] = (subjects[subj] || 0) + 1;
    }
    Logger.log("[VALIDATE]   By subject:");
    Object.entries(subjects).forEach(([s, n]) =>
      Logger.log("[VALIDATE]     " + s + ": " + n)
    );
  }

  if (issues.length > 0) {
    Logger.log("[VALIDATE] ⚠ Issues found:");
    issues.forEach(msg => Logger.log("[VALIDATE]   " + msg));
  } else {
    Logger.log("[VALIDATE] ✓ No issues found.");
  }
}
