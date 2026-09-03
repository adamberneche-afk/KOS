/**
 * Drive Steward — Sheets Setup
 * ================================================
 * One-time, idempotent: creates the 5 tabs the rest of the Drive
 * Steward deployment reads and writes, with header rows matching the
 * schemas in ../Drive_Steward_Methodology_and_Prompt.md (Parts 1.5,
 * 2.5, and 2.6). Safe to run more than once — never touches or
 * clears a tab that already exists.
 *
 * SETUP:
 *   1. Create (or pick) the Google Sheet that will hold all 5 tabs —
 *      this becomes "the Drive Steward Sheet" the other two scripts
 *      and the Studio Flow (see ../STUDIO_FLOW_SETUP.md) all point at.
 *   2. Open it → Extensions → Apps Script → paste this file (and,
 *      into the same project, DriveSteward_Scanner.gs and
 *      DriveSteward_Calibration.gs — one project, three files, they
 *      only share the Sheet, not any function names).
 *   3. Leave TARGET_SPREADSHEET_ID blank if this script is bound to
 *      the Sheet via Extensions → Apps Script (the normal case). Set
 *      it explicitly only if running from a standalone script project
 *      pointed at a Sheet elsewhere.
 *   4. Run setupDriveStewardSheets() once. Check the execution log for
 *      what it created vs. what already existed.
 *   5. Add one row per Part 1 pattern to Pattern_Tiers by hand before
 *      the first real classification run — see the note at the bottom
 *      of the log output and PATTERN CATALOG below.
 *
 * TABS CREATED:
 *   - Drive_Steward_Intake — bare rows DriveSteward_Scanner.gs writes;
 *                            the Studio Flow reads status='new' rows
 *                            here and classifies them.
 *   - File_Registry        — the classified rows the Flow writes back,
 *                            per Part 1.5's schema plus three fields
 *                            added to make Part 2.5 mechanically
 *                            computable (pattern_id, created_date,
 *                            human_corrected — see the methodology
 *                            doc's Part 1.5 note on why these exist).
 *   - Calibration_Log      — the weekly Wilson-score rollup, written
 *                            by DriveSteward_Calibration.gs. Per
 *                            Part 2.5's schema.
 *   - Batch_Queue          — flagged/low-confidence items, grouped
 *                            into batches per Part 2.6's governor.
 *   - Pattern_Tiers        — Fluffy-owned config: current_tier and
 *                            target_band_low/high per pattern_id.
 *                            EVERY script and the Studio Flow in this
 *                            package only ever READS this tab —
 *                            Fluffy is the sole writer, by design.
 *                            This isn't just a documented convention;
 *                            no function in DriveSteward_Scanner.gs or
 *                            DriveSteward_Calibration.gs calls any
 *                            write method on this sheet — the "no
 *                            threshold changes without Fluffy" rule
 *                            (Part 2.5 step 5 / Part 2.6) is enforced
 *                            structurally, not just by instruction.
 */

const TARGET_SPREADSHEET_ID = ''; // leave blank to use the bound spreadsheet

// PATTERN CATALOG — the pattern_id slugs used across Pattern_Tiers,
// File_Registry, and Calibration_Log. Kept here as the one place that
// defines the set, mirroring Part 1's pattern table 1:1 so a slug never
// drifts out of sync with the methodology doc's own pattern numbering.
const PATTERN_CATALOG = [
  { id: 'P1-session-dated-folder',    description: 'Session-dated dump folders (e.g. "CAS 7.8.26") — land as-is, no deep filing yet' },
  { id: 'P2-designed-empty-folder',   description: 'Empty folders in a designed taxonomy are intentional future homes, not clutter' },
  { id: 'P3-filename-metadata',       description: 'Numeric prefix / version suffix / subsystem tag in the filename is the primary classification signal' },
  { id: 'P4-vector-language-lineage', description: 'Persona/vector/confidence-threshold language belongs to the KOS→CAS conceptual lineage regardless of folder' },
  { id: 'P5-staging-zone-sort-pass',  description: 'Staging folders (RAW_EXHAUST, DROP_ZONE, Pending_Tagging) need periodic sorting passes — they will not self-clear' },
  { id: 'P6-root-triage',             description: 'Loose root-level files get triaged professional/curriculum vs. personal before anything else' },
  { id: 'P7-supersession-check',      description: 'A new version/date-named folder triggers a check on whether the prior generation should be archived' }
];

const SHEET_SCHEMAS = {
  Drive_Steward_Intake: [
    'file_id', 'file_name', 'current_path', 'mime_type',
    'discovered_date', 'status'
  ],
  File_Registry: [
    'file_id', 'file_name', 'current_path', 'subsystem', 'module_component',
    'file_type', 'sequence_version', 'status', 'supersedes', 'superseded_by',
    'purpose_summary', 'parsing_hint', 'depends_on', 'audience_scope',
    'vector_priority', 'confidence_score', 'last_reviewed',
    'pattern_id', 'created_date', 'human_corrected'
  ],
  Calibration_Log: [
    'pattern_id', 'week_of', 'n_applied', 'n_flagged', 'n_corrected',
    'observed_divergence', 'z_used', 'wilson_lower', 'wilson_upper',
    'current_tier', 'target_band_low', 'target_band_high', 'proposed_action'
  ],
  Batch_Queue: [
    'batch_id', 'file_id', 'pattern_id', 'reason_flagged', 'proposed_path',
    'status', 'created_date', 'resolved_date'
  ],
  Pattern_Tiers: [
    'pattern_id', 'pattern_description', 'current_tier',
    'target_band_low', 'target_band_high', 'last_updated_by_fluffy'
  ]
};

function setupDriveStewardSheets() {
  const ss = TARGET_SPREADSHEET_ID
    ? SpreadsheetApp.openById(TARGET_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    Logger.log('❌ No spreadsheet found. Set TARGET_SPREADSHEET_ID or bind this script to a Sheet.');
    return;
  }

  Object.keys(SHEET_SCHEMAS).forEach(tabName => {
    const headers = SHEET_SCHEMAS[tabName];
    let sheet = ss.getSheetByName(tabName);
    if (sheet) {
      Logger.log('✓  ' + tabName + ' already exists — leaving it untouched.');
      return;
    }
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    Logger.log('✅ Created ' + tabName + ' with ' + headers.length + ' columns: ' + headers.join(', '));
  });

  _seedPatternTiersIfEmpty_(ss);

  Logger.log('');
  Logger.log('Done. Every pattern in Pattern_Tiers starts at current_tier =');
  Logger.log('"low" with target bands blank, per the cold-start rule in Part');
  Logger.log('1.5 and Part 2.5\'s "on setting target_band" note — that\'s');
  Logger.log('correct, not something to fix by hand.');
}

/** Seed Pattern_Tiers with one row per PATTERN_CATALOG entry, but only
 * if the tab is currently empty (header row only) — never overwrites
 * rows Fluffy has already started tuning. */
function _seedPatternTiersIfEmpty_(ss) {
  const sheet = ss.getSheetByName('Pattern_Tiers');
  if (!sheet) return;
  if (sheet.getLastRow() > 1) {
    Logger.log('✓  Pattern_Tiers already has data — not re-seeding.');
    return;
  }
  const rows = PATTERN_CATALOG.map(p => [p.id, p.description, 'low', '', '', '']);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  Logger.log('✅ Seeded Pattern_Tiers with ' + rows.length + ' pattern(s), all starting at current_tier="low".');
}
