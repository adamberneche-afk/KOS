/**
 * Drive Steward — Intake Scanner
 * ================================================
 * Mechanical only — no AI, no judgment calls. Finds files created or
 * modified since the last scan and appends bare rows to the
 * Drive_Steward_Intake tab. The Studio Flow (see ../STUDIO_FLOW_SETUP.md)
 * watches that tab for status='new' rows and does the actual
 * classification against Part 1's patterns and the File Registry schema.
 *
 * This mirrors cas-ccps's own Script → Studio Flow bridge (Script 05
 * writes to RubricQueue → Flow 1 reads and classifies) — same shape,
 * different domain: a plain script detects and records, a Flow judges.
 *
 * SETUP:
 *   1. Paste into the same Apps Script project as
 *      DriveSteward_SheetsSetup.gs (run that script's
 *      setupDriveStewardSheets() first if you haven't).
 *   2. Leave TARGET_SPREADSHEET_ID blank if bound to that Sheet.
 *   3. (Optional) Set WATCH_FOLDER_IDS to limit scope to specific Drive
 *      folders. Leave empty to scan all of My Drive — slower, but
 *      matches Pattern 6 ("no personal/professional boundary at
 *      root") — loose root files need triaging too, not just files
 *      already inside a project folder.
 *   4. Run runDriveStewardScan() once manually and check the log.
 *   5. Install a time-driven trigger: Triggers (clock icon in the
 *      Apps Script editor) → Add Trigger → function
 *      runDriveStewardScan → Time-driven → Day timer. Once daily
 *      matches Part 2's documented cadence ("run at the end of any
 *      active build session, or on request").
 *
 * KNOWN LIMITATION:
 *   Apps Script execution caps out at 6 minutes per run. A single scan
 *   across a very large, very active Drive could in principle exceed
 *   that. If runs start failing with a timeout, narrow WATCH_FOLDER_IDS
 *   rather than trying to page across multiple executions — this
 *   script intentionally stays simple (see LH_DriveDocSplitter.gs in
 *   leader-hub/drive-tools for the same trade-off made the same way).
 *
 * WHAT IT NEVER DOES:
 *   Never moves, renames, copies, or deletes a file. Never writes to
 *   File_Registry (that's the Flow's job, after classification) or to
 *   Pattern_Tiers. Purely detects and records "this file exists and
 *   changed" — the same Fluffy-approval boundary as every other script
 *   in this repo that touches Drive.
 */

const TARGET_SPREADSHEET_ID = ''; // same Sheet as DriveSteward_SheetsSetup.gs
const WATCH_FOLDER_IDS = [];      // empty = scan all of My Drive
const LAST_SCAN_PROP = 'DRIVE_STEWARD_LAST_SCAN_ISO';
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function runDriveStewardScan() {
  const ss = TARGET_SPREADSHEET_ID
    ? SpreadsheetApp.openById(TARGET_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log('❌ Set TARGET_SPREADSHEET_ID or bind this script to a Sheet.');
    return;
  }
  const intakeSheet = ss.getSheetByName('Drive_Steward_Intake');
  const registrySheet = ss.getSheetByName('File_Registry');
  if (!intakeSheet || !registrySheet) {
    Logger.log('❌ Missing tabs — run setupDriveStewardSheets() first.');
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const lastScanIso = props.getProperty(LAST_SCAN_PROP);
  // First-ever run looks back 30 days, not to the epoch — an unscoped
  // "everything since 1970" first scan would flood Drive_Steward_Intake
  // and defeat the cold-start "surface a little, earn trust" design
  // this whole system is built around.
  const sinceDate = lastScanIso
    ? new Date(lastScanIso)
    : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
  const scanStartedAt = new Date();

  Logger.log('Scanning for files modified since ' + sinceDate.toISOString());

  const alreadyKnown = _collectKnownFileIds_(intakeSheet, registrySheet);
  const query = 'modifiedDate > \'' + _formatDriveDate_(sinceDate) + '\' and trashed = false';

  let iterator;
  try {
    iterator = DriveApp.searchFiles(query);
  } catch (e) {
    Logger.log('❌ Drive search failed: ' + e.message);
    return;
  }

  const newRows = [];
  let seen = 0, skippedKnown = 0, skippedScope = 0;

  while (iterator.hasNext()) {
    const file = iterator.next();
    seen++;
    const fileId = file.getId();
    if (alreadyKnown.has(fileId)) { skippedKnown++; continue; }

    if (WATCH_FOLDER_IDS.length > 0 && !_pathUnderWatchedFolder_(file, WATCH_FOLDER_IDS)) {
      skippedScope++;
      continue;
    }

    newRows.push([
      fileId,
      file.getName(),
      _resolveFilePath_(file),
      file.getMimeType(),
      new Date().toISOString(),
      'new'
    ]);
    alreadyKnown.add(fileId); // guard against dupes within this same run
  }

  if (newRows.length > 0) {
    intakeSheet.getRange(intakeSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length)
      .setValues(newRows);
  }

  props.setProperty(LAST_SCAN_PROP, scanStartedAt.toISOString());

  Logger.log('Scanned ' + seen + ' candidate file(s): '
    + newRows.length + ' new, ' + skippedKnown + ' already known, '
    + skippedScope + ' outside watched folders.');
}

/**
 * Build the set of file_ids already present in either tab, so a file
 * already classified (in File_Registry) or already queued (in
 * Drive_Steward_Intake, any status) never gets a duplicate row.
 */
function _collectKnownFileIds_(intakeSheet, registrySheet) {
  const known = new Set();
  [intakeSheet, registrySheet].forEach(sheet => {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    ids.forEach(row => { if (row[0]) known.add(String(row[0])); });
  });
  return known;
}

/**
 * Walk the file's first parent chain up to root and join with '/'.
 * Files can technically have multiple parents in classic Drive; this
 * follows only the first one returned by getParents() — documented
 * here rather than silently assumed, since a file living in two
 * folders would otherwise get an arbitrary-looking path.
 */
function _resolveFilePath_(file) {
  const segments = [];
  let parents = file.getParents();
  let guard = 0;
  while (parents.hasNext() && guard < 50) {
    const folder = parents.next();
    segments.unshift(folder.getName());
    parents = folder.getParents();
    guard++;
  }
  return segments.length ? segments.join('/') : '(My Drive root)';
}

function _pathUnderWatchedFolder_(file, watchFolderIds) {
  let parents = file.getParents();
  let guard = 0;
  while (parents.hasNext() && guard < 50) {
    const folder = parents.next();
    if (watchFolderIds.indexOf(folder.getId()) !== -1) return true;
    parents = folder.getParents();
    guard++;
  }
  return false;
}

/**
 * Drive API v2 query date literal — a single-quoted, unzoned
 * "YYYY-MM-DDTHH:MM:SS" string (interpreted as UTC), matching the
 * documented DriveApp.searchFiles() query syntax used elsewhere in
 * this repo (see LH_8177_Rename.gs's findDocsByTitle() for the same
 * single-quoted-literal convention applied to a string field instead
 * of a date field).
 */
function _formatDriveDate_(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}
