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
//             CompetencyEvidence, SCRDecisionLog, ParentReportLog,
//             EvaluationLog, ReflectionLog, PartUnlocks.
//   WORKING — queues, Flow inputs and profiles that feed the system but
//             are not the record: 1 year. WarmUpQueue and the rest below.
// A student's workspace Doc follows its Ledger row; a warm-up Doc follows
// its WarmUpQueue row.
//
// Past its period, a record is archived automatically where the tab has
// an archive marker (the five _archiveExpired*_ passes, run by the health
// checks) and is never deleted automatically. Deletion is a separate,
// operator-approved step (D3, 2026-10-28):
//   1. previewRetentionDisposition() reports, per record, what a
//      disposition would remove, saves that as the pending disposition and
//      logs an approval code.
//   2. The operator reads the report and sets the Script Property
//      RETENTION_DISPOSITION_APPROVE to that code.
//   3. applyRetentionDisposition() removes exactly that: refused whole if
//      the code doesn't match, the approval is over 7 days old, a period
//      changed, or any record has more rows to remove than were approved.
//      A row's Doc goes to the Drive trash first (recoverable for 30
//      days); a row whose Doc can't be trashed is kept. At most
//      RETENTION_DISPOSE_MAX_ROWS rows a run: run it again until it says
//      done, which clears the approval. Each run is a DispositionLog row,
//      counts only.
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
    // The student's own words about their work, kept as long as the work
    // itself (their Doc follows its Ledger row) and theirs to take in their
    // portfolio (the operator, 2026-10-24).
    { label: "ReflectionLog", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.reflectionLog || "ReflectionLog"; }), dateCol: "SubmittedAt" },
    { label: "EvaluationLog", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(function (cfg) { return cfg.tabs.evaluationLog || "EvaluationLog"; }), dateCol: "EvaluatedAt" },
    // What opened each part of a lesson for a student, their check or the
    // teacher (68), kept as long as the work it opened (2026-10-28).
    { label: "PartUnlocks", tier: RETENTION_TIER_RECORD, years: _ledgerRetentionYears_,
      where: ledger(LP_LOG_TAB), dateCol: "UnlockedAt" },
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
// With `targets` (an array), each removable row is pushed onto it as
// { sheet, sheetRow, docId } for applyRetentionDisposition.
function _retentionCountsFor_(entry, cfg, now, targets) {
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
    const docId = entry.docCol !== undefined ? String(row[entry.docCol] || "").trim() : "";
    if (docId) out.linkedDocs++;
    if (targets) targets.push({ sheet: sheet, sheetRow: i + 1, docId: docId });
  }
  return out;
}

// For 34c's overnight check: the records whose tab exists but has no date
// column, so none of their rows can be checked. Read-only.
function retentionMissingDateColumns_(cfg, now) {
  return _retentionSchedule_().map(function (e) { return _retentionCountsFor_(e, cfg, now); })
    .filter(function (r) { return r.found && r.missingDateColumn; });
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

// The dry run of a disposition. Per record, the rows a disposition would
// remove (past their period, and archived where the tab has an archive
// marker), the Docs that go with them (a Ledger row's workspace Doc, a
// StudentDocRegistry Doc, a warm-up Doc), and the rows it can't decide yet:
// past but not archived (the archive pass runs first), no readable date,
// or no date column. Deletes nothing. It saves what it found as the
// pending disposition (RETENTION_DISPOSITION_PENDING: per record its cutoff
// and counts, no row content) and logs the code that approves it.
const RETENTION_PENDING_KEY = "RETENTION_DISPOSITION_PENDING";
const RETENTION_APPROVE_KEY = "RETENTION_DISPOSITION_APPROVE";
const RETENTION_APPROVAL_DAYS = 7;
const RETENTION_DISPOSE_MAX_ROWS = 1500; // a run's cap, inside Apps Script's 6 minutes
const RETENTION_LOG_TAB = "DispositionLog";
const RETENTION_LOG_HEADERS = ["RanAt", "ApprovalCode", "Record", "Cutoff", "RowsRemoved", "DocsTrashed", "KeptDocFailed", "Done"];

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
  let code = "";
  if (totals.disposable) {
    const pending = {
      at: Utilities.formatDate(now, tz, "yyyy-MM-dd"),
      records: results.filter(function (r) { return r.found && r.disposable; }).map(function (r) {
        return { label: r.label, cutoff: Utilities.formatDate(r.cutoff, tz, "yyyy-MM-dd"), rows: r.disposable, docs: r.linkedDocs };
      }),
    };
    const props = PropertiesService.getScriptProperties();
    props.setProperty(RETENTION_PENDING_KEY, JSON.stringify(pending));
    code = _retentionApprovalCode_(JSON.stringify(pending));
    lines.push("To approve exactly this, set the Script Property " + RETENTION_APPROVE_KEY + " to " + code +
      " and run applyRetentionDisposition() within " + RETENTION_APPROVAL_DAYS + " days. Docs go to the Drive trash (recoverable for 30 days).");
  } else {
    lines.push("Nothing to remove; no approval needed.");
  }
  Logger.log(lines.join("\n"));
  return { results: results, totals: totals, approvalCode: code };
}

// A short code for a pending disposition, so an approval names one report.
function _retentionApprovalCode_(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return "D-" + ("00000000" + h.toString(16)).slice(-8).toUpperCase();
}

// The approved disposition. See the file header for what it checks. Returns
// { ok, error } or { ok: true, removed, docsTrashed, keptDocFailed, done }.
function applyRetentionDisposition() {
  const props = PropertiesService.getScriptProperties();
  const pendingText = props.getProperty(RETENTION_PENDING_KEY) || "";
  const refuse = function (msg) { Logger.log("Retention disposition refused: " + msg); return { ok: false, error: msg }; };
  if (!pendingText) return refuse("no pending disposition. Run previewRetentionDisposition() first.");
  const code = _retentionApprovalCode_(pendingText);
  if (String(props.getProperty(RETENTION_APPROVE_KEY) || "").trim() !== code) {
    return refuse("not approved. Set " + RETENTION_APPROVE_KEY + " to " + code + " after reading previewRetentionDisposition()'s report.");
  }
  const pending = JSON.parse(pendingText);
  const cfg = getConfig_();
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const at = new Date(pending.at + "T12:00:00");
  if ((now.getTime() - at.getTime()) / 86400000 > RETENTION_APPROVAL_DAYS + 0.5) {
    return refuse("the approval is over " + RETENTION_APPROVAL_DAYS + " days old. Run previewRetentionDisposition() again.");
  }
  const approved = {};
  pending.records.forEach(function (r) { approved[r.label] = r; });
  const plan = [];
  const schedule = _retentionSchedule_();
  for (let i = 0; i < schedule.length; i++) {
    const targets = [];
    const r = _retentionCountsFor_(schedule[i], cfg, now, targets);
    if (!r.disposable) continue;
    const a = approved[r.label];
    if (!a) return refuse(r.label + " has " + r.disposable + " row(s) to remove that were not in the approved report.");
    if (Utilities.formatDate(r.cutoff, tz, "yyyy-MM-dd") !== a.cutoff) return refuse(r.label + "'s period changed since the report.");
    if (r.disposable > a.rows) return refuse(r.label + " has more rows to remove (" + r.disposable + ") than were approved (" + a.rows + ").");
    plan.push({ label: r.label, cutoff: a.cutoff, targets: targets });
  }

  let budget = RETENTION_DISPOSE_MAX_ROWS;
  const log = [];
  const total = { removed: 0, docsTrashed: 0, keptDocFailed: 0 };
  plan.forEach(function (p) {
    // Bottom up, so the row numbers read above stay right.
    const rows = p.targets.slice().sort(function (x, y) { return y.sheetRow - x.sheetRow; }).slice(0, Math.max(0, budget));
    const c = { removed: 0, docsTrashed: 0, keptDocFailed: 0 };
    rows.forEach(function (t) {
      if (t.docId) {
        try {
          DriveApp.getFileById(t.docId).setTrashed(true);
          c.docsTrashed++;
        } catch (e) {
          c.keptDocFailed++;
          return;
        }
      }
      t.sheet.deleteRow(t.sheetRow);
      c.removed++;
    });
    budget -= rows.length;
    total.removed += c.removed; total.docsTrashed += c.docsTrashed; total.keptDocFailed += c.keptDocFailed;
    log.push([p.label, p.cutoff, c.removed, c.docsTrashed, c.keptDocFailed]);
  });
  const done = budget > 0 && total.keptDocFailed === 0;
  _retentionLogDisposition_(cfg, now, code, log, done);
  if (done) {
    props.deleteProperty(RETENTION_APPROVE_KEY);
    props.deleteProperty(RETENTION_PENDING_KEY);
  }
  Logger.log("Retention disposition: " + total.removed + " row(s) removed, " + total.docsTrashed + " Doc(s) trashed" +
    (total.keptDocFailed ? ", " + total.keptDocFailed + " row(s) kept: their Doc could not be trashed" : "") +
    (done ? ". Done; the approval is cleared." : ". Not done: run applyRetentionDisposition() again."));
  return { ok: true, removed: total.removed, docsTrashed: total.docsTrashed, keptDocFailed: total.keptDocFailed, done: done };
}

function _retentionLogDisposition_(cfg, now, code, rows, done) {
  if (!rows.length) return;
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let sheet = ss.getSheetByName(RETENTION_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(RETENTION_LOG_TAB);
    sheet.getRange(1, 1, 1, RETENTION_LOG_HEADERS.length).setValues([RETENTION_LOG_HEADERS]);
  }
  rows.forEach(function (r) { sheet.appendRow([now, code].concat(r, [done ? "yes" : "no"])); });
}
