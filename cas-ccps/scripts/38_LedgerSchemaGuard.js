// =============================================================================
// FILE: 38_LedgerSchemaGuard.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: none — three manual entry points, run from the Apps Script
//           editor's Run dropdown:
//             checkLedgerSchema()        — read-only report, changes nothing
//             repairLedgerSchemaDryRun() — says exactly what a repair would do
//             repairLedgerSchema()       — performs it, after backing the tab up
//
//           None of the three has a trailing underscore, deliberately: GAS
//           hides trailing-underscore functions from that dropdown, which
//           this repo has already been bitten by once
//           (oneTimeCreateModule1Tabs).
//
// PURPOSE: Detect and safely repair positional drift in the Ledger tab's
// column schema.
//
// WHY THIS EXISTS: the Ledger is read positionally by nearly every file in
// this project — 00_SharedConfig.js's LEDGER constant, 03_QueueBridge.js's
// L_* constants, 07_TeacherDashboard.js, 13_StudentDashboard.js,
// 29_StudentContextAggregator.js, 30_SCRSuggestionEngine.js — and written
// positionally by 02_Form1_IntakeAndWorkspaceGenerator.js's
// registerLedger_(), which appendRow()s 19 values in canonical order with
// no header lookup at all. A single column inserted anywhere left of the
// end therefore shifts every field after it, silently, with no error:
// exactly the failure 00_SharedConfig.js's own LEDGER comment warns about
// ("a real header-shift... would silently corrupt every one of those, with
// no error, just wrong data rendered to a student or teacher").
//
// This was not hypothetical. A live deployment had a helper "FileURL"
// column inserted at index 4 (column E), which moved TeacherEmail from
// index 8 to 9 — so every reader using LEDGER.TEACHER_EMAIL got the
// TeacherName instead. 37_FlowInputBuilder.js's own MatrixRegistry hop
// then searched for a teacher whose email equalled a person's NAME,
// matched nothing, and skipped every row forever with a single log line.
// (The inserted column was also redundant: index 16, AdminFileURL,
// already holds the student doc's full URL, written by registerLedger_ at
// registration time.)
//
// WHY A SCRIPT AND NOT "JUST DELETE THE COLUMN BY HAND": the decision of
// whether deleting a column is safe is genuinely per-row, not eyeballable.
// Two cases look identical in the header row but need opposite handling:
//
//   A. The column was inserted BEFORE any registerLedger_ write. Existing
//      rows hold canonical values in canonical positions and only the
//      HEADERS are shifted — deleting the column realigns everything.
//   B. The column was inserted BEFORE rows were written, and
//      registerLedger_ then appended 19 values positionally into A..S.
//      Those rows have real data in the inserted column's slot (a student
//      name, say, not a URL) and deleting it destroys a field.
//
// So this file never decides from the header row alone. It simulates the
// removal against every data row and validates the result against the
// known shape of six canonical fields (see LSG_FIELD_SHAPES_ below)
// before it will touch anything. If any row would come out wrong, it
// refuses and names the rows.
// =============================================================================

// Canonical header row, byte-identical to what 16_UnifiedManualSetup.js's
// setHeaders_() call writes when it creates this tab. Columns 20-23 are
// added later, on first use, by 04_Form2_TurnInGate.js's
// _ensureTurnInReviewColumns_() — so a Ledger that predates the turn-in
// review flow is legitimately 19 wide, not broken, and both widths (and
// anything between) count as canonical here.
const LEDGER_CANONICAL_HEADERS = [
  "Timestamp", "GoogleID", "ConfigID", "FileID", "StudentName",
  "Block", "ClassName", "TeacherName", "TeacherEmail", "Subject",
  "CourseName", "Period", "Status", "SubmissionTS", "Notes",
  "LastEval", "AdminFileURL", "StudentFileURL", "AcademicYear",
  "SuggestedScore", "FinalScore", "ScoreDecidedBy", "ScoreDecidedAt",
];

const LEDGER_MIN_CANONICAL_WIDTH = 19;

// The shapes that make a post-repair row verifiable. Only fields with a
// genuinely recognizable format are listed — Status, Notes, Block and the
// rest are free text, so a wrong value there is indistinguishable from a
// right one and including them would produce false confidence, not more
// safety. Indices come from 00_SharedConfig.js's LEDGER (same project,
// reused rather than redeclared).
//
// TEACHER_EMAIL is the load-bearing one: it's the field the real incident
// corrupted, and the field 37_FlowInputBuilder.js depends on.
var LSG_FIELD_SHAPES_ = [
  { index: LEDGER.TIMESTAMP, name: "Timestamp",
    test: function (v) { return v instanceof Date; } },
  { index: LEDGER.GOOGLE_ID, name: "GoogleID",
    test: function (v) { return String(v).indexOf("@") !== -1; } },
  { index: LEDGER.CONFIG_ID, name: "ConfigID",
    // "VDOE-" per generateConfigId_(); "ERROR-" per registerLedger_'s own
    // MASTER_TEMPLATE_NOT_CONFIGURED path, which prefixes a real ConfigID.
    test: function (v) { return /^(VDOE|ERROR)-/.test(String(v).trim()); } },
  { index: LEDGER.FILE_ID, name: "FileID",
    test: function (v) { return /^[A-Za-z0-9_-]{25,}$/.test(String(v).trim()); } },
  { index: LEDGER.TEACHER_EMAIL, name: "TeacherEmail",
    test: function (v) { return String(v).indexOf("@") !== -1; } },
  { index: LEDGER.ADMIN_FILE_URL, name: "AdminFileURL",
    test: function (v) { return /^https?:\/\//.test(String(v).trim()); } },
];

// ---------------------------------------------------------------------------
// checkLedgerSchema — read-only. Safe to run any time, on any deployment.
// ---------------------------------------------------------------------------
function checkLedgerSchema() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet) {
    Logger.log("[LedgerGuard] No tab named \"" + cfg.tabs.ledger + "\" in this spreadsheet.");
    return { ok: false, repairable: false, detail: "Ledger tab not found." };
  }

  const result = _lsgAnalyze_(sheet);
  _lsgLogReport_(result);
  return result;
}

// ---------------------------------------------------------------------------
// repairLedgerSchemaDryRun — identical analysis, framed as what a repair
// would do. Changes nothing. Exists so the decision and the action are two
// separate deliberate steps rather than one.
// ---------------------------------------------------------------------------
function repairLedgerSchemaDryRun() {
  const result = checkLedgerSchema();

  if (result.ok) {
    Logger.log("[LedgerGuard] DRY RUN: nothing to do — schema is already canonical.");
    return result;
  }
  if (!result.repairable) {
    Logger.log("[LedgerGuard] DRY RUN: would REFUSE to repair. See the report above.");
    return result;
  }
  Logger.log(
    "[LedgerGuard] DRY RUN: would back up the Ledger tab, then delete column " +
    result.extraColumnLetter + " (\"" + result.extraHeader + "\"), " +
    "restoring all " + result.rowCount + " data row(s) to canonical alignment. " +
    "Run repairLedgerSchema() to do it."
  );
  return result;
}

// ---------------------------------------------------------------------------
// repairLedgerSchema — performs the repair. Backs the whole tab up first,
// refuses on anything it can't verify, and re-analyzes afterwards to
// confirm the result rather than assuming it.
// ---------------------------------------------------------------------------
function repairLedgerSchema() {
  const lock = LockService.getDocumentLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    Logger.log("[LedgerGuard] Could not acquire the document lock — another " +
               "process is writing to this spreadsheet. Try again in a moment.");
    return { ok: false, repairable: false, detail: "Lock unavailable." };
  }

  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const sheet = ss.getSheetByName(cfg.tabs.ledger);
    if (!sheet) {
      Logger.log("[LedgerGuard] No tab named \"" + cfg.tabs.ledger + "\".");
      return { ok: false, repairable: false, detail: "Ledger tab not found." };
    }

    const before = _lsgAnalyze_(sheet);
    _lsgLogReport_(before);

    if (before.ok) {
      Logger.log("[LedgerGuard] Nothing to repair.");
      return before;
    }
    if (!before.repairable) {
      Logger.log("[LedgerGuard] REFUSING to repair — the analysis above could not " +
                 "verify that deleting a column would leave every row correct. " +
                 "Nothing was changed.");
      return before;
    }

    const backupName = _lsgBackupTab_(ss, sheet);
    Logger.log("[LedgerGuard] Backed the tab up as \"" + backupName + "\".");

    sheet.deleteColumns(before.extraIndex + 1, 1);
    SpreadsheetApp.flush();

    const after = _lsgAnalyze_(sheet);
    if (after.ok) {
      Logger.log("[LedgerGuard] ✅ Repaired. Deleted column " + before.extraColumnLetter +
                 " (\"" + before.extraHeader + "\"). Schema is now canonical at " +
                 after.width + " columns. Backup kept as \"" + backupName + "\" — " +
                 "delete it by hand once you've confirmed the data looks right.");
    } else {
      Logger.log("[LedgerGuard] ⚠️ Deleted column " + before.extraColumnLetter +
                 " but the schema still isn't canonical. The backup \"" + backupName +
                 "\" holds the pre-repair state. Report follows:");
      _lsgLogReport_(after);
    }
    return after;

  } catch (err) {
    Logger.log("[LedgerGuard] Repair failed: " + err.message);
    return { ok: false, repairable: false, detail: err.message };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// _lsgAnalyze_ — the one analysis both the check and the repair share, so a
// dry run can never disagree with what the repair actually decides.
// ---------------------------------------------------------------------------
function _lsgAnalyze_(sheet) {
  const lastCol = sheet.getLastColumn();
  const rawHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  // Trim trailing blanks. One stray far-right value — ever entered, even
  // since deleted — permanently inflates getLastColumn(), the same GAS
  // gotcha 00_SharedConfig.js's LEDGER_COL_COUNT comment describes.
  const headers = rawHeaders.map(function (h) {
    return String(h === null || h === undefined ? "" : h).trim();
  });
  while (headers.length > 0 && headers[headers.length - 1] === "") headers.pop();

  if (_lsgMatchesCanonical_(headers)) {
    return { ok: true, repairable: false, width: headers.length, headers: headers };
  }

  // Is there exactly one column whose removal restores canonical order?
  const candidates = [];
  for (let i = 0; i < headers.length; i++) {
    const without = headers.slice(0, i).concat(headers.slice(i + 1));
    if (_lsgMatchesCanonical_(without)) candidates.push(i);
  }

  if (candidates.length !== 1) {
    return {
      ok: false, repairable: false, headers: headers, candidates: candidates,
      detail: candidates.length === 0
        ? "The header row doesn't match the canonical schema, and no single-column " +
          "removal restores it. This needs a human look — it's more than one " +
          "inserted column, a rename, or a reorder."
        : "Ambiguous: " + candidates.length + " different single-column removals would " +
          "each restore canonical order, so there's no single safe answer.",
    };
  }

  const extraIndex = candidates[0];
  const lastRow = sheet.getLastRow();
  const data = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    : [];

  const valueProfile = { blank: 0, url: 0, email: 0, date: 0, driveId: 0, other: 0 };
  const rowProblems = [];

  data.forEach(function (row, idx) {
    valueProfile[_lsgClassifyValue_(row[extraIndex])]++;
    const repaired = row.slice(0, extraIndex).concat(row.slice(extraIndex + 1));
    const problems = _lsgValidateRow_(repaired);
    if (problems.length > 0) rowProblems.push({ row: idx + 2, problems: problems });
  });

  return {
    ok: false,
    repairable: rowProblems.length === 0,
    headers: headers,
    extraIndex: extraIndex,
    extraHeader: headers[extraIndex],
    extraColumnLetter: _lsgColumnLetter_(extraIndex + 1),
    rowCount: data.length,
    valueProfile: valueProfile,
    rowProblems: rowProblems,
  };
}

function _lsgMatchesCanonical_(arr) {
  if (arr.length < LEDGER_MIN_CANONICAL_WIDTH) return false;
  if (arr.length > LEDGER_CANONICAL_HEADERS.length) return false;
  return arr.every(function (h, i) { return h === LEDGER_CANONICAL_HEADERS[i]; });
}

// Blank values are always allowed: registerLedger_ itself writes "" into
// SubmissionTS, Notes, LastEval and StudentFileURL at registration time, and
// a genuinely empty optional field must never read as corruption.
function _lsgValidateRow_(repairedRow) {
  const problems = [];
  LSG_FIELD_SHAPES_.forEach(function (field) {
    const value = repairedRow[field.index];
    const isBlank = value === null || value === undefined || String(value).trim() === "";
    if (isBlank) return;
    if (!field.test(value)) {
      problems.push(field.name + " would hold " + _lsgPreview_(value));
    }
  });
  return problems;
}

function _lsgClassifyValue_(v) {
  if (v === null || v === undefined || String(v).trim() === "") return "blank";
  if (v instanceof Date) return "date";
  const s = String(v).trim();
  if (/^https?:\/\//.test(s)) return "url";
  if (s.indexOf("@") !== -1) return "email";
  if (/^[A-Za-z0-9_-]{25,}$/.test(s)) return "driveId";
  return "other";
}

function _lsgPreview_(v) {
  const s = v instanceof Date ? "a date (" + v + ")" : String(v);
  return s.length > 40 ? "\"" + s.substring(0, 40) + "…\"" : "\"" + s + "\"";
}

function _lsgColumnLetter_(col1Based) {
  let n = col1Based;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Copies every value to a new timestamped tab. Deliberately a value copy
// via insertSheet + setValues rather than Sheet.copyTo(): this repo never
// auto-deletes anything (see docs/FERPA_DATA_MAP.md's retention sections —
// every archival path marks rather than removes), and a repair that
// mutates column positions is the one operation here that genuinely can't
// be undone by re-running something.
function _lsgBackupTab_(ss, sheet) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const name = "Ledger_BACKUP_" + stamp;
  const backup = ss.insertSheet(name);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow > 0 && lastCol > 0) {
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    backup.getRange(1, 1, lastRow, lastCol).setValues(values);
  }
  return name;
}

function _lsgLogReport_(result) {
  if (result.ok) {
    Logger.log("[LedgerGuard] ✅ Schema is canonical — " + result.width + " columns, " +
               "every header in the expected position.");
    return;
  }

  if (!result.repairable && !result.extraHeader) {
    Logger.log("[LedgerGuard] ❌ " + result.detail);
    Logger.log("[LedgerGuard] Found headers: " + JSON.stringify(result.headers));
    Logger.log("[LedgerGuard] Expected (first " + LEDGER_MIN_CANONICAL_WIDTH + "): " +
               JSON.stringify(LEDGER_CANONICAL_HEADERS.slice(0, LEDGER_MIN_CANONICAL_WIDTH)));
    return;
  }

  Logger.log("[LedgerGuard] ⚠️ SCHEMA DRIFT — one extra column at " +
             result.extraColumnLetter + ", header \"" + result.extraHeader + "\".");
  Logger.log("[LedgerGuard] Every field to its right is shifted by one. Notably, " +
             "readers using LEDGER.TEACHER_EMAIL are currently getting the column " +
             "one to its left.");
  Logger.log("[LedgerGuard] That column's " + result.rowCount + " data value(s): " +
             JSON.stringify(result.valueProfile));

  if (result.repairable) {
    Logger.log("[LedgerGuard] ✅ SAFE TO REPAIR — simulated the deletion against all " +
               result.rowCount + " row(s); every canonical field with a checkable " +
               "shape comes out correct. Run repairLedgerSchema().");
  } else {
    Logger.log("[LedgerGuard] ❌ NOT SAFE TO REPAIR — deleting that column would " +
               "leave " + result.rowProblems.length + " row(s) holding wrong values. " +
               "Those rows were most likely written positionally by registerLedger_ " +
               "AFTER the column was inserted, so the column holds real data rather " +
               "than a helper value. Fix those rows by hand first:");
    result.rowProblems.slice(0, 20).forEach(function (rp) {
      Logger.log("[LedgerGuard]   Row " + rp.row + ": " + rp.problems.join("; "));
    });
    if (result.rowProblems.length > 20) {
      Logger.log("[LedgerGuard]   …and " + (result.rowProblems.length - 20) + " more.");
    }
  }
}
