// =============================================================================
// FILE: 19_ClonedSheetConfig.js
// INCLUDED IN: Both cloned sheet projects:
//   - Master Rubric Response Sheet (with Scripts 00 + 05)
//   - Master Teacher Matrix Sheet  (with Scripts 00 + 08)
//
// PURPOSE: Config persistence for cloned sheet projects.
//
// PROBLEM:
//   Script Properties are per-project and do NOT clone with makeCopy().
//   Scripts 05 and 08 run in cloned sheet projects that have no Script
//   Properties set. getConfig_() returns empty strings for everything,
//   causing silent failures on every execution.
//
// SOLUTION:
//   Script 16's setup wizard writes a _CONFIG tab into each cloned sheet
//   immediately after makeCopy(). Scripts 05 and 08 call getSheetConfig_()
//   instead of getConfig_() — it reads from _CONFIG on their own sheet
//   via SpreadsheetApp.getActiveSpreadsheet(), which is always available
//   to spreadsheet-bound scripts without needing any ID.
//
// CONFIG TAB SCHEMA (_CONFIG tab, two columns: Key | Value):
//   ADMIN_SS_ID
//   CENTRAL_LEDGER_SS_ID
//   TEACHER_NAME
//   TEACHER_EMAIL
//   TEACHER_MATRIX_SS_ID      (Rubric Response Sheet only)
//   RUBRIC_QUEUE_TAB          (Rubric Response Sheet only)
//   CONFIRM_REVIEW_FORM_ID    (Teacher Matrix Sheet only)
//   CONFIRM_ENTRY_*           (Teacher Matrix Sheet only)
// =============================================================================

// ---------------------------------------------------------------------------
// getSheetConfig_ — reads config from the _CONFIG tab of the active sheet
// Falls back to Script Properties for any key not found in the tab
// ---------------------------------------------------------------------------
function getSheetConfig_() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("_CONFIG");

    if (!sheet) {
      Logger.log("[CONFIG] _CONFIG tab not found — falling back to Script Properties.");
      return getConfig_(); // Script 00 fallback
    }

    const data = sheet.getDataRange().getValues();
    const map  = {};

    for (let i = 0; i < data.length; i++) {
      const key = String(data[i][0]).trim();
      const val = String(data[i][1]).trim();
      if (key) map[key] = val;
    }

    // Return structured config object matching getConfig_() shape
    // for the fields Scripts 05 and 08 actually need
    return {
      adminSsId:           map["ADMIN_SS_ID"]            || "",
      ledgerSsId:          map["CENTRAL_LEDGER_SS_ID"]   || "",
      teacherName:         map["TEACHER_NAME"]            || "",
      teacherEmail:        map["TEACHER_EMAIL"]           || "",
      teacherMatrixSsId:   map["TEACHER_MATRIX_SS_ID"]   || "",
      rubricQueueTab:      map["RUBRIC_QUEUE_TAB"]        || "",
      confirmFormId:       map["CONFIRM_REVIEW_FORM_ID"]  || "",
      adminNotifyEmail:    map["ADMIN_NOTIFY_EMAIL"]      || "",

      // Confirmation form entry IDs
      confirmEntryDraftId:  map["CONFIRM_ENTRY_DRAFT_ID"]    || "",
      confirmEntryUnitName: map["CONFIRM_ENTRY_UNIT_NAME"]   || "",
      confirmEntryPersona:  map["CONFIRM_ENTRY_PERSONA"]     || "",
      confirmEntryM1:       map["CONFIRM_ENTRY_MILESTONE_1"] || "",
      confirmEntryM2:       map["CONFIRM_ENTRY_MILESTONE_2"] || "",
      confirmEntryM3:       map["CONFIRM_ENTRY_MILESTONE_3"] || "",
      confirmEntryM4:       map["CONFIRM_ENTRY_MILESTONE_4"] || "",
      confirmEntryDod:      map["CONFIRM_ENTRY_DOD"]         || "",

      // Tab names — consistent across all projects
      tabs: {
        ledger:          "Ledger",
        reviewQueue:     "ReviewQueue",
        stagingPipeline: "STAGING_PIPELINE",
        rubricQueue:     "RubricQueue",
        teacherMatrix:   "TeacherMatrix",
        draftUnits:      "DraftUnits",
        matrixRegistry:  "MatrixRegistry"
      }
    };

  } catch (err) {
    Logger.log("[CONFIG] getSheetConfig_ error: " + err.message +
               " — falling back to Script Properties.");
    return getConfig_();
  }
}

// ---------------------------------------------------------------------------
// writeConfigTab_ — called by Script 16 immediately after makeCopy()
// Creates the _CONFIG tab on a cloned sheet and writes all required key-value pairs
//
// Parameters:
//   ssId    — the cloned spreadsheet ID
//   entries — object { KEY: "value", ... }
// ---------------------------------------------------------------------------
function writeConfigTab_(ssId, entries) {
  try {
    const ss = SpreadsheetApp.openById(ssId);

    // Remove existing _CONFIG tab if present (re-run safety)
    const existing = ss.getSheetByName("_CONFIG");
    if (existing) ss.deleteSheet(existing);

    const configSheet = ss.insertSheet("_CONFIG");

    // Write header row
    configSheet.getRange(1, 1, 1, 2)
      .setValues([["Key", "Value"]])
      .setFontWeight("bold")
      .setBackground("#f3f3f3");

    // Write key-value pairs
    const rows = Object.entries(entries).map(([k, v]) => [k, v]);
    if (rows.length > 0) {
      configSheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }

    // Make the tab hard to find accidentally — move to end
    ss.setActiveSheet(configSheet);
    ss.moveActiveSheet(ss.getNumSheets());

    // Protect the tab — prevent accidental edits
    try {
      const protection = configSheet.protect();
      protection.setDescription("System configuration — do not edit");
      protection.setWarningOnly(true); // Warning-only so admin can still edit if needed
    } catch (e) { /* protection is best-effort */ }

    configSheet.setColumnWidth(1, 240);
    configSheet.setColumnWidth(2, 400);

    Logger.log("[CONFIG] _CONFIG tab written to " + ssId +
               " with " + rows.length + " entries.");
    return true;

  } catch (err) {
    Logger.log("[CONFIG] writeConfigTab_ error for " + ssId + ": " + err.message);
    return false;
  }
}
