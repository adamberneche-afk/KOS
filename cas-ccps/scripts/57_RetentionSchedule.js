// =============================================================================
// FILE: 57_RetentionSchedule.js
// BOUND TO: Central Ledger spreadsheet
// TRIGGERS: none. checkRetentionSchedule() and previewRetentionDisposition()
//           run by hand from the editor.
//
// PURPOSE: the one statement of how long each kind of student record is
// kept, and a read-only check that says, per record, how many rows are
// past it. Adopted by the operator 2026-10-13 against the Library of
// Virginia's General Schedule GS-21 (public school divisions), and treated
// as confirmed from 2026-10-17: the operator has as much confirmation as
// the district will give. Every period here is a Script Property, so a
// period the district later changes is set without a code change.
//
// Two tiers, counted in whole school years after the year ends
// (_retentionCutoff_() in 00, August start):
//   RECORD  — what a grade, a rating decision or a disclosure rests on:
//             5 years. Ledger, StudentAssignments, StudentDocRegistry,
//             CompetencyEvidence, SCRDecisionLog, ParentReportLog.
//   WORKING — queues, Flow inputs and profiles that feed the system but
//             are not the record: 1 year. WarmUpQueue and the rest below.
// A student's workspace Doc follows its Ledger row; a warm-up Doc follows
// its WarmUpQueue row.
//
// Past its period, a record is archived automatically where the tab has
// an archive marker (the five _archiveExpired*_ passes, run by the health
// checks) and is never deleted automatically. Deletion is a separate,
// operator-approved step; previewRetentionDisposition() is its dry run
// (2026-10-21), and the step itself is not built.
//
// Not in the schedule: WarmUpFlowReturn (41 deletes harvested rows after
// 14 days), the Family Mail Sentinel tabs (60's own rules, FERPA_DATA_MAP),
// PeriodOverride (52: no date column; cleared when the school year ends),
// and tabs with no student data (RubricQueue, LessonContext, AlignmentLog,
// LessonDrafts).
// =============================================================================

const RETENTION_TIER_RECORD = "RECORD";
const RETENTION_TIER_WORKING = "WORKING";
const RETENTION_ADOPTED = "operator-adopted 2026-10-13 against GS-21; confirmed by the operator 2026-10-17";

// One entry per tab. years(): the Script Property that sets the period.
// dateCol: 0-based index, or a header name for tabs read by header.
// docCol: 0-based index of a Doc ID the row's disposition takes with it.
// archived(row): true when the row already carries its archive marker.
// where: which spreadsheet, and the tab name (a string, or cfg => name).
function _retentionSchedule_() {
  // A tab on the Central Ledger, or (ReviewQueue, STAGING_PIPELINE) on the
  // Admin spreadsheet, which is the same spreadsheet in a standard install.
  const ledger = function (name) { return { ss: "ledger", tabName: name }; };
  const admin = function (name) { return { ss: "admin", tabName: name }; };
  const working = function () { return _retentionYearsFromProperty_("WORKING_DATA_RETENTION_YEARS", 1); };
  const archivedIn = function (col, value) {
    return function (row) { return value ? String(row[col] || "").trim() === value : String(row[col] || "").trim() !== ""; };
  };
  return [
    { label: "Ledger", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.ledger; }), dateCol: LEDGER.TIMESTAMP,
      docCol: LEDGER.FILE_ID, archived: archivedIn(LEDGER.STATUS, "ARCHIVED") },
    { label: "StudentAssignments", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(STUDENT_ASSIGNMENTS_TAB), dateCol: "RecordedAt" },
    { label: "StudentDocRegistry", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.studentDocRegistry; }), dateCol: SDR_CREATED_AT,
      docCol: SDR_DOC_ID },
    { label: "CompetencyEvidence", tier: RETENTION_TIER_RECORD, years: _competencyEvidenceRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.competencyEvidence || "CompetencyEvidence"; }),
      dateCol: "evaluated_at", archiveHeader: "archive_status" },
    { label: "SCRDecisionLog", tier: RETENTION_TIER_RECORD, years: _scrRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.scrDecisionLog || "SCRDecisionLog"; }),
      dateCol: SCRDL.DECIDED_AT, archived: archivedIn(SCRDL.ARCHIVE_STATUS) },
    { label: "ParentReportLog", tier: RETENTION_TIER_RECORD, years: _parentReportRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.parentReportLog; }),
      dateCol: PRL.GENERATED_AT, archived: archivedIn(PRL.ARCHIVE_STATUS) },

    { label: "WarmUpQueue", tier: RETENTION_TIER_WORKING, years: _warmUpQueueRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.warmUpQueue || "WarmUpQueue"; }),
      dateCol: WD_WARMUP_QUEUE_COLUMNS.LESSON_DATE, docCol: WQ25_DOC_ID,
      archived: archivedIn(WD_WARMUP_QUEUE_COLUMNS.ARCHIVE_STATUS) },
    { label: "StudentProfiles", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.studentProfiles; }), dateCol: SP_LAST_UPDATED },
    { label: "WarmUpRegistry", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.warmUpRegistry; }), dateCol: WR_GENERATED_AT },
    { label: "WarmUpTextBox", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.warmUpTextBox; }), dateCol: WTB.LESSON_DATE },
    { label: "WarmUpResponses", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.warmUpResponses; }), dateCol: WUR_TIMESTAMP },
    { label: "SCRSuggestions", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.scrSuggestions; }), dateCol: SCRS.LAST_COMPUTED_AT },
    { label: "FlowInput", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(function (cfg) { return cfg.tabs.flowInput || FI_TAB_NAME; }), dateCol: FI.TIMESTAMP },
    { label: "Flow3Input", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(WFB_INPUT_TABS[3]), dateCol: "Timestamp" },
    { label: "Flow4Input", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(WFB_INPUT_TABS[4]), dateCol: "Timestamp" },
    { label: "Flow5Input", tier: RETENTION_TIER_WORKING, years: working,
      where: ledger(WFB_INPUT_TABS[5]), dateCol: "Timestamp" },
    { label: "ReviewQueue", tier: RETENTION_TIER_WORKING, years: working,
      where: admin(function (cfg) { return cfg.tabs.reviewQueue; }), dateCol: "Timestamp" },
    { label: "STAGING_PIPELINE", tier: RETENTION_TIER_WORKING, years: working,
      where: admin(function (cfg) { return cfg.tabs.stagingPipeline; }), dateCol: STG_TIMESTAMP },
  ];
}

function _retentionYearsFromProperty_(key, fallback) {
  const n = Number(PropertiesService.getScriptProperties().getProperty(key));
  return (n && n > 0) ? n : fallback;
}

function _retentionDate_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Counts for one schedule entry: rows, rows past the period, rows past it
// that already carry their archive marker, and rows with no readable date.
// missingDateColumn names the date header (or column) when the tab has
// none, so a renamed header isn't read as every row undated (2026-10-21).
// For the disposition preview: disposable (past, and archived where the
// tab has a marker), awaitingArchive (past, not yet marked) and
// linkedDocs (Doc IDs on the disposable rows). Counts only: no row
// content leaves the sheet.
function _retentionCountsFor_(entry, cfg, now) {
  const years = entry.years();
  const cutoff = _retentionCutoff_(years, now);
  const out = { label: entry.label, tier: entry.tier, years: years, cutoff: cutoff,
    found: false, rows: 0, past: 0, pastArchived: 0, undated: 0, missingDateColumn: "",
    hasArchiveMarker: !!(entry.archived || entry.archiveHeader),
    disposable: 0, awaitingArchive: 0, linkedDocs: 0 };
  let sheet = null;
  try {
    const name = typeof entry.where.tabName === "function" ? entry.where.tabName(cfg) : entry.where.tabName;
    const ssId = entry.where.ss === "admin" ? cfg.adminSsId : cfg.ledgerSsId;
    sheet = name ? SpreadsheetApp.openById(ssId).getSheetByName(name) : null;
  } catch (e) { sheet = null; }
  if (!sheet) return out;
  out.found = true;
  if (sheet.getLastRow() < 2) return out;

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  const dateCol = typeof entry.dateCol === "number" ? entry.dateCol : headers.indexOf(entry.dateCol);
  if (dateCol < 0 || dateCol >= headers.length) {
    out.missingDateColumn = typeof entry.dateCol === "number" ? "column " + (entry.dateCol + 1) : entry.dateCol;
  }
  const archiveCol = entry.archiveHeader ? headers.indexOf(entry.archiveHeader) : -1;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(function (c) { return String(c).trim() === ""; })) continue;
    out.rows++;
    if (out.missingDateColumn) continue;
    const d = _retentionDate_(row[dateCol]);
    if (!d) { out.undated++; continue; }
    if (d >= cutoff) continue;
    out.past++;
    const isArchived = entry.archived ? entry.archived(row)
      : (archiveCol >= 0 && String(row[archiveCol] || "").trim() !== "");
    if (isArchived) out.pastArchived++;
    if (out.hasArchiveMarker && !isArchived) { out.awaitingArchive++; continue; }
    out.disposable++;
    if (entry.docCol !== undefined && String(row[entry.docCol] || "").trim()) out.linkedDocs++;
  }
  return out;
}

// Read-only. Logs the schedule and, per record, how many rows are past
// their period and how many of those are archived. Changes nothing.
function checkRetentionSchedule() {
  const cfg = getConfig_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const results = _retentionSchedule_().map(function (e) { return _retentionCountsFor_(e, cfg, now); });
  const lines = ["Retention schedule (" + RETENTION_ADOPTED + "):"];
  results.forEach(function (r) {
    const head = "- " + r.label + " [" + r.tier + ", " + r.years + " yr after the school year ends; past = before " +
      Utilities.formatDate(r.cutoff, tz, "yyyy-MM-dd") + "]: ";
    lines.push(head + (!r.found ? "tab not found" :
      r.missingDateColumn ? r.rows + " row(s); date column \"" + r.missingDateColumn + "\" not found, so none checked" :
      r.rows + " row(s), " + r.past + " past (" + r.pastArchived + " archived)" +
      (r.undated ? ", " + r.undated + " with no readable date" : "")));
  });
  Logger.log(lines.join("\n"));
  return results;
}

// Read-only: the dry run of a disposition. Per record, the rows a
// disposition would remove (past their period, and archived where the tab
// has an archive marker), the Docs that go with them (a Ledger row's
// workspace Doc, a StudentDocRegistry Doc, a warm-up Doc), and the rows it
// can't decide yet: past but not archived (the archive pass runs first),
// no readable date, or no date column. Deletes nothing; the disposition
// itself is a separate step, run only on the operator's approval of this
// report, and not built.
function previewRetentionDisposition() {
  const cfg = getConfig_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const results = _retentionSchedule_().map(function (e) { return _retentionCountsFor_(e, cfg, now); });
  const totals = { disposable: 0, linkedDocs: 0, awaitingArchive: 0, undecided: 0 };
  const lines = ["Retention disposition, dry run: nothing is deleted (" + RETENTION_ADOPTED + ")."];
  results.forEach(function (r) {
    const head = "- " + r.label + " [before " + Utilities.formatDate(r.cutoff, tz, "yyyy-MM-dd") + "]: ";
    if (!r.found) { lines.push(head + "tab not found"); return; }
    if (r.missingDateColumn) {
      totals.undecided += r.rows;
      lines.push(head + "date column \"" + r.missingDateColumn + "\" not found; " + r.rows + " row(s) undecided");
      return;
    }
    totals.disposable += r.disposable;
    totals.linkedDocs += r.linkedDocs;
    totals.awaitingArchive += r.awaitingArchive;
    totals.undecided += r.undated;
    lines.push(head + r.disposable + " row(s) would be removed" +
      (r.linkedDocs ? " with " + r.linkedDocs + " Doc(s)" : "") +
      (r.awaitingArchive ? "; " + r.awaitingArchive + " past but not archived yet" : "") +
      (r.undated ? "; " + r.undated + " with no readable date" : ""));
  });
  lines.push("Total: " + totals.disposable + " row(s) and " + totals.linkedDocs + " Doc(s) would be removed; " +
    totals.awaitingArchive + " wait on the archive pass; " + totals.undecided + " can't be decided.");
  Logger.log(lines.join("\n"));
  return { results: results, totals: totals };
}
