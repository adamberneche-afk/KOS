// =============================================================================
// FILE: 30_SCRSuggestionEngine.js
// BOUND TO: Central Ledger spreadsheet
// NUMBERING NOTE (reconciliation decision 6, revised during implementation):
// this file's own comments below call it "Module 3." That collides with
// PLATFORM_DOCUMENTATION.html's Module 3 (Student Profile) and — more
// importantly — with the real, already-implemented Script 29's own
// documentation (CAS_Module4_Documentation_v1.1.docx), which explicitly
// reserves "Module 5" for exactly this kind of student-competency work
// ("If a future Module 5 builds a genuine student-competency junction...").
// This script is Module 5, not Module 3. Renumbering the label only —
// the file name and script number (30) are unaffected; see
// cas-ccps/README.md for the full module numbering table.
//
// PURPOSE: The Module 5 threshold script. Reads CompetencyEvidence (Flow 2's
//          output — see 15b_StudioFlowPrompts_Flow2_Revised.js), computes a
//          suggested SCR rating per student+competency using the locked
//          threshold rule, and manages the suggest -> confirm/override
//          lifecycle a teacher acts on. Also produces an Excel-workbook-
//          shaped export matching the official SCR record format.
//
// THE THRESHOLD RULE (locked design decision — restated here verbatim so
// this file is self-explanatory without needing the design conversation
// that produced it):
//   Given a student + competency_id, over all CompetencyEvidence rows:
//     metCount     = count where outcome = MET
//     notMetCount  = count where outcome = NOT_MET
//     partialCount = count where outcome = PARTIALLY_MET
//     totalCount   = metCount + notMetCount + partialCount
//
//   IF totalCount < 3                          -> INSUFFICIENT_EVIDENCE
//   ELSE IF notMetCount >= 3                    -> suggest 4
//   ELSE IF metCount >= 3 AND notMetCount == 0  -> suggest 2
//   ELSE                                         -> suggest 3
//
//   Ratings 1 ("can teach others") and 5 ("cannot perform") are NEVER
//   auto-suggested. These are the two most consequential claims on the
//   SCR scale and are reserved entirely for a teacher's deliberate,
//   unprompted judgment — this is a confirmed design decision, not an
//   oversight. A teacher can always enter 1 or 5 as an OVERRIDE; this
//   script will never propose either value.
//
// ENTRY POINTS:
//   runWeeklySCRSuggestionUpdate_()  — installed as a 7-day time trigger,
//                                       same cadence as Module 4's Script 29
//   recordConfirmation_(studentEmail, competencyId, confirmedRating)
//                                     — called by the Script 07 dashboard
//                                       addition when a teacher clicks
//                                       Confirm with the suggested value
//                                       unchanged
//   recordOverride_(studentEmail, competencyId, overrideRating)
//                                     — called by the same dashboard
//                                       addition when a teacher enters a
//                                       different rating than suggested
//   exportToWorkbookGrid_()          — MANUAL, run from the Script Editor
//                                       or a Teacher Dashboard button.
//                                       Produces a Google Sheet matching
//                                       the official SCR Excel workbook
//                                       shape: one tab per class, students
//                                       as rows, competency numbers as
//                                       the header row.
//   createSCRTabs_()                 — MANUAL, one-time setup
//   installSCRTrigger_()             — MANUAL, one-time setup
// =============================================================================

// SCRSuggestions column indices (0-based) — canonical order
// One row per student+competency_id PAIR. NOT append-only — this tab is
// overwritten in place by the weekly trigger UNTIL a row reaches CONFIRMED
// or OVERRIDDEN, at which point the weekly trigger skips it permanently.
// This is a deliberate departure from the append-only pattern used
// everywhere else in this codebase (AlignmentLog, CompetencyEvidence,
// ReportRegistry) — those are logs of events that already happened;
// this is a live, recomputed VALUE that should reflect current evidence
// right up until a human acts on it. See design rationale in the
// architectural notes at the bottom of this file.
const SCRS = {
  STUDENT_EMAIL: 0,
  COMPETENCY_ID: 1,
  SUGGESTED_RATING: 2,      // 2 | 3 | 4 | "" (blank if INSUFFICIENT_EVIDENCE)
  MET_COUNT: 3,
  NOT_MET_COUNT: 4,
  PARTIAL_COUNT: 5,
  STATUS: 6,                 // INSUFFICIENT_EVIDENCE | SUGGESTED | CONFIRMED | OVERRIDDEN
  LAST_COMPUTED_AT: 7,
  CONFIRMED_RATING: 8,       // blank until CONFIRMED or OVERRIDDEN
  CONFIRMED_AT: 9,
  CONFIRMED_BY: 10,
};

// SCRDecisionLog column indices (0-based) — canonical order
// Append-only. One row per confirm/override action ever taken. This is
// the actual legally-retained record — see 8VAC20-120-120 retention
// requirement noted in the original SCR specification. Never deleted.
const SCRDL = {
  DECISION_ID: 0,
  STUDENT_EMAIL: 1,
  COMPETENCY_ID: 2,
  SUGGESTED_RATING: 3,       // what the system proposed (blank if teacher
                             // entered cold, with no suggestion shown)
  FINAL_RATING: 4,           // what the teacher actually decided — 1-5
  DECISION_TYPE: 5,          // CONFIRMED | OVERRIDDEN
  DECIDED_AT: 6,
  DECIDED_BY: 7,             // teacher email
  EVIDENCE_SNAPSHOT: 8,      // met/notMet/partial counts at decision time,
                             // denormalized for audit — same rationale as
                             // AlignmentLog's denormalized competency_text
};

const VALID_OUTCOMES = ["MET", "PARTIALLY_MET", "NOT_MET"];
const EVIDENCE_THRESHOLD = 3; // N, locked design decision

// ---------------------------------------------------------------------------
// runWeeklySCRSuggestionUpdate_ — primary entry point, time-triggered
// ---------------------------------------------------------------------------
function runWeeklySCRSuggestionUpdate_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  const evidenceSheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");

  if (!evidenceSheet) {
    Logger.log("[S30] CompetencyEvidence tab not found. Aborting run.");
    return;
  }
  if (!suggestionsSheet) {
    Logger.log("[S30] SCRSuggestions tab not found. Run createSCRTabs_() first.");
    return;
  }

  const runTimestamp = new Date();
  Logger.log("[S30] Weekly SCR suggestion update starting.");

  // ── Step 1: aggregate ALL evidence by student+competency pair ──────────
  // Unlike Module 4's weekly trigger, this does NOT filter to a trailing
  // window — the threshold rule operates over ALL accumulated evidence
  // for a pair, not just this week's. The weekly CADENCE controls how
  // often we recompute, not what window of evidence we consider.
  const aggregates = aggregateEvidence_(evidenceSheet);
  Logger.log("[S30] Aggregated evidence for " + aggregates.size + " student+competency pair(s).");

  // ── Step 2: load existing SCRSuggestions rows, indexed by pair key ──────
  const existingRows = loadExistingSuggestions_(suggestionsSheet);

  // ── Step 3: for each aggregate, compute suggestion and write/skip ───────
  let updated = 0;
  let skippedFrozen = 0;
  let unchanged = 0;
  let newRows = 0;

  for (const [pairKey, counts] of aggregates.entries()) {
    const existing = existingRows.get(pairKey);

    // A pair already CONFIRMED or OVERRIDDEN is frozen — the weekly
    // trigger never recomputes or overwrites it. New evidence arriving
    // after a decision is intentionally not reflected here; surfacing
    // that as a fresh suggestion cycle is a real future feature, not
    // solved by this version (see architectural notes at end of file).
    if (existing && (existing.status === "CONFIRMED" || existing.status === "OVERRIDDEN")) {
      skippedFrozen++;
      continue;
    }

    const result = computeSuggestion_(counts);

    if (existing &&
        existing.suggestedRating === result.suggestedRating &&
        existing.metCount === counts.metCount &&
        existing.notMetCount === counts.notMetCount &&
        existing.partialCount === counts.partialCount) {
      // Nothing changed since last run — skip the write entirely rather
      // than touching LAST_COMPUTED_AT for no reason. Keeps the sheet's
      // edit history meaningful if anyone ever reviews it.
      unchanged++;
      continue;
    }

    writeSuggestionRow_(suggestionsSheet, existing, pairKey, counts, result, runTimestamp);
    if (existing) updated++; else newRows++;
  }

  Logger.log("[S30] Run complete. New: " + newRows +
    " | Updated: " + updated +
    " | Unchanged: " + unchanged +
    " | Skipped (frozen — already decided): " + skippedFrozen);
}

// ---------------------------------------------------------------------------
// aggregateEvidence_
// Returns Map<"email|||competencyId", { metCount, notMetCount, partialCount }>
// Scans the ENTIRE CompetencyEvidence tab — no time window. Skips rows
// with an outcome value outside the three valid tokens, logging each
// distinct bad value once rather than failing the whole aggregation.
// ---------------------------------------------------------------------------
function aggregateEvidence_(evidenceSheet) {
  const data = evidenceSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iEmail = headers.indexOf("student_email");
  const iCompId = headers.indexOf("competency_id");
  const iOutcome = headers.indexOf("outcome");

  const result = new Map();
  const badOutcomesSeen = new Set();

  if (iEmail === -1 || iCompId === -1 || iOutcome === -1) {
    Logger.log("[S30] CompetencyEvidence missing required columns " +
      "(student_email, competency_id, outcome). Cannot aggregate.");
    return result;
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[iEmail]).trim();
    const compId = String(row[iCompId]).trim();
    const outcome = String(row[iOutcome]).trim();

    if (!email || !compId) continue; // skip rows missing the join key

    if (!VALID_OUTCOMES.includes(outcome)) {
      if (!badOutcomesSeen.has(outcome)) {
        Logger.log("[S30] Skipping row with invalid outcome value: '" + outcome +
          "' (expected MET, PARTIALLY_MET, or NOT_MET) — student: " + email +
          ", competency: " + compId);
        badOutcomesSeen.add(outcome);
      }
      continue;
    }

    const pairKey = email + "|||" + compId;
    if (!result.has(pairKey)) {
      result.set(pairKey, { metCount: 0, notMetCount: 0, partialCount: 0 });
    }
    const counts = result.get(pairKey);
    if (outcome === "MET") counts.metCount++;
    else if (outcome === "NOT_MET") counts.notMetCount++;
    else if (outcome === "PARTIALLY_MET") counts.partialCount++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// computeSuggestion_ — THE THRESHOLD RULE, implemented exactly as locked.
// Input: { metCount, notMetCount, partialCount }
// Output: { suggestedRating: 2|3|4|null, status: string }
// ---------------------------------------------------------------------------
function computeSuggestion_(counts) {
  const totalCount = counts.metCount + counts.notMetCount + counts.partialCount;

  if (totalCount < EVIDENCE_THRESHOLD) {
    return { suggestedRating: null, status: "INSUFFICIENT_EVIDENCE" };
  }
  if (counts.notMetCount >= EVIDENCE_THRESHOLD) {
    return { suggestedRating: 4, status: "SUGGESTED" };
  }
  if (counts.metCount >= EVIDENCE_THRESHOLD && counts.notMetCount === 0) {
    return { suggestedRating: 2, status: "SUGGESTED" };
  }
  return { suggestedRating: 3, status: "SUGGESTED" };
}

// ---------------------------------------------------------------------------
// loadExistingSuggestions_
// Returns Map<pairKey, { rowIndex, status, suggestedRating, metCount,
// notMetCount, partialCount }>
// ---------------------------------------------------------------------------
function loadExistingSuggestions_(suggestionsSheet) {
  const data = suggestionsSheet.getDataRange().getValues();
  const result = new Map();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[SCRS.STUDENT_EMAIL]).trim();
    const compId = String(row[SCRS.COMPETENCY_ID]).trim();
    if (!email || !compId) continue;

    const pairKey = email + "|||" + compId;
    const rawRating = row[SCRS.SUGGESTED_RATING];
    result.set(pairKey, {
      rowIndex: i + 1, // 1-based sheet row
      status: String(row[SCRS.STATUS]).trim(),
      suggestedRating: rawRating === "" ? null : Number(rawRating),
      metCount: Number(row[SCRS.MET_COUNT]) || 0,
      notMetCount: Number(row[SCRS.NOT_MET_COUNT]) || 0,
      partialCount: Number(row[SCRS.PARTIAL_COUNT]) || 0,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// writeSuggestionRow_ — updates an existing row in place, or appends a new
// one. This is the one place in this file that deliberately overwrites
// rather than appends — see the architectural note at the column
// constants above for why this tab is exempt from the append-only
// convention used everywhere else.
// ---------------------------------------------------------------------------
function writeSuggestionRow_(sheet, existing, pairKey, counts, result, runTimestamp) {
  const [email, compId] = pairKey.split("|||");
  const rowValues = [
    email,
    compId,
    result.suggestedRating === null ? "" : result.suggestedRating,
    counts.metCount,
    counts.notMetCount,
    counts.partialCount,
    result.status,
    runTimestamp,
    "",  // CONFIRMED_RATING — blank until a teacher acts
    "",  // CONFIRMED_AT
    "",  // CONFIRMED_BY
  ];

  if (existing) {
    sheet.getRange(existing.rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

// ---------------------------------------------------------------------------
// recordConfirmation_ — ENTRY POINT, called by the Script 07 dashboard
// addition when a teacher confirms a suggestion AS-IS (no change to the
// suggested rating). Promotes SCRSuggestions row to CONFIRMED, writes the
// permanent record to SCRDecisionLog.
//
// Returns { success: true } or { success: false, error: "..." }
// ---------------------------------------------------------------------------
function recordConfirmation_(studentEmail, competencyId, teacherEmail) {
  return recordDecision_(studentEmail, competencyId, teacherEmail, null, "CONFIRMED");
}

// ---------------------------------------------------------------------------
// recordOverride_ — ENTRY POINT, called when a teacher enters a DIFFERENT
// rating than what was suggested (or enters one cold, when status was
// INSUFFICIENT_EVIDENCE — overrideRating can be any of 1-5 in that case,
// since the {2,3,4}-only restriction applies to what the SYSTEM may
// propose, never to what a teacher may decide).
//
// Returns { success: true } or { success: false, error: "..." }
// ---------------------------------------------------------------------------
function recordOverride_(studentEmail, competencyId, overrideRating, teacherEmail) {
  const rating = Number(overrideRating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be an integer from 1 to 5." };
  }
  return recordDecision_(studentEmail, competencyId, teacherEmail, rating, "OVERRIDDEN");
}

// ---------------------------------------------------------------------------
// recordDecision_ — shared logic for confirm and override
// ---------------------------------------------------------------------------
function recordDecision_(studentEmail, competencyId, teacherEmail, overrideRating, decisionType) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  const decisionLogSheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");

  if (!suggestionsSheet || !decisionLogSheet) {
    return { success: false, error: "SCRSuggestions or SCRDecisionLog tab not found." };
  }

  const data = suggestionsSheet.getDataRange().getValues();
  let rowIndex = -1;
  let row = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SCRS.STUDENT_EMAIL]).trim().toLowerCase() === studentEmail.toLowerCase() &&
        String(data[i][SCRS.COMPETENCY_ID]).trim() === competencyId) {
      rowIndex = i + 1;
      row = data[i];
      break;
    }
  }

  if (!row) {
    return { success: false, error: "No suggestion row found for " + studentEmail + " / " + competencyId + "." };
  }

  const currentStatus = String(row[SCRS.STATUS]).trim();
  if (currentStatus === "CONFIRMED" || currentStatus === "OVERRIDDEN") {
    return { success: false, error: "This competency has already been decided (" + currentStatus + "). " +
      "A new decision requires a process not yet built — see architectural notes." };
  }

  const suggestedRating = row[SCRS.SUGGESTED_RATING] === "" ? null : Number(row[SCRS.SUGGESTED_RATING]);

  if (decisionType === "CONFIRMED" && suggestedRating === null) {
    return { success: false, error: "Cannot confirm — there is no suggestion to confirm " +
      "(status is INSUFFICIENT_EVIDENCE). Use an override instead if you want to enter a rating now." };
  }

  const finalRating = decisionType === "CONFIRMED" ? suggestedRating : overrideRating;
  const now = new Date();

  // ── Update SCRSuggestions row — freeze it ──
  suggestionsSheet.getRange(rowIndex, SCRS.STATUS + 1).setValue(decisionType);
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_RATING + 1).setValue(finalRating);
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_AT + 1).setValue(now);
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_BY + 1).setValue(teacherEmail);

  // ── Append to SCRDecisionLog — the permanent record ──
  const evidenceSnapshot = "MET:" + row[SCRS.MET_COUNT] +
    " NOT_MET:" + row[SCRS.NOT_MET_COUNT] +
    " PARTIALLY_MET:" + row[SCRS.PARTIAL_COUNT];

  decisionLogSheet.appendRow([
    generateDecisionId_(),
    studentEmail,
    competencyId,
    suggestedRating === null ? "" : suggestedRating,
    finalRating,
    decisionType,
    now,
    teacherEmail,
    evidenceSnapshot,
  ]);

  Logger.log("[S30] Decision recorded — " + decisionType + " | " + studentEmail +
    " | " + competencyId + " | final rating: " + finalRating + " | by: " + teacherEmail);

  return { success: true, finalRating, decisionType };
}

// ---------------------------------------------------------------------------
// generateDecisionId_
// Format: SCD-YYYYMMDD-XXXX (4 hex chars) — same ID pattern as
// ALG-/LES-/RPT-/EVD- elsewhere in this codebase.
// ---------------------------------------------------------------------------
function generateDecisionId_() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
  return "SCD-" + yyyy + mm + dd + "-" + hex;
}

// ---------------------------------------------------------------------------
// getSCRDashboardData_ — ENTRY POINT for Script 07's teacher-facing view.
// Returns all NON-FROZEN suggestions (status = SUGGESTED or
// INSUFFICIENT_EVIDENCE) for the calling teacher's students, grouped by
// student, with competency text denormalized for readability — same
// rationale as every other denormalized log in this codebase.
// ---------------------------------------------------------------------------
function getSCRDashboardData_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  const registrySheet = ss.getSheetByName(cfg.tabs.competencyRegistry);

  if (!suggestionsSheet) return { error: "SCRSuggestions tab not found." };

  const compTextMap = {};
  if (registrySheet) {
    const regData = registrySheet.getDataRange().getValues();
    const regHeaders = regData[0].map(h => String(h).trim());
    const iId = regHeaders.indexOf("competency_id");
    const iText = regHeaders.indexOf("competency_text");
    if (iId !== -1 && iText !== -1) {
      for (let i = 1; i < regData.length; i++) {
        compTextMap[String(regData[i][iId]).trim()] = String(regData[i][iText]).trim();
      }
    }
  }

  const data = suggestionsSheet.getDataRange().getValues();
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[SCRS.STATUS]).trim();
    if (status !== "SUGGESTED" && status !== "INSUFFICIENT_EVIDENCE") continue;

    results.push({
      studentEmail: String(row[SCRS.STUDENT_EMAIL]).trim(),
      competencyId: String(row[SCRS.COMPETENCY_ID]).trim(),
      competencyText: compTextMap[String(row[SCRS.COMPETENCY_ID]).trim()] || "(text not found in registry)",
      suggestedRating: row[SCRS.SUGGESTED_RATING] === "" ? null : Number(row[SCRS.SUGGESTED_RATING]),
      metCount: Number(row[SCRS.MET_COUNT]) || 0,
      notMetCount: Number(row[SCRS.NOT_MET_COUNT]) || 0,
      partialCount: Number(row[SCRS.PARTIAL_COUNT]) || 0,
      status,
    });
  }

  results.sort((a, b) => a.studentEmail.localeCompare(b.studentEmail) ||
    a.competencyId.localeCompare(b.competencyId));

  return { suggestions: results, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// exportToWorkbookGrid_ — MANUAL. Produces a Google Sheet matching the
// official SCR Excel workbook shape described in the original
// specification: one tab per class, student names as rows, competency
// numbers (not full IDs — just the trailing -N) as the header row,
// confirmed/overridden ratings as cell values. Only CONFIRMED and
// OVERRIDDEN decisions appear — a suggestion that was never acted on by
// a teacher has no place in the official record, by design, since the
// SCR is fundamentally a record of teacher judgment, not system output.
//
// Groups by ClassName, sourced from the Ledger tab (joining on
// student_email = GoogleID) — the same Ledger Module 4 already reads
// for its student roster.
// ---------------------------------------------------------------------------
function exportToWorkbookGrid_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const decisionLogSheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");
  const ledgerSheet = ss.getSheetByName(cfg.tabs.ledger);

  if (!decisionLogSheet || !ledgerSheet) {
    Logger.log("[S30] SCRDecisionLog or Ledger tab not found. Cannot export.");
    return null;
  }

  // ── Build student_email -> {name, className} from Ledger ──
  const ledgerData = ledgerSheet.getDataRange().getValues();
  const studentInfo = new Map();
  for (let i = 1; i < ledgerData.length; i++) {
    const row = ledgerData[i];
    const email = String(row[1]).trim();   // GoogleID
    const name = String(row[4]).trim();    // StudentName
    const className = String(row[6]).trim(); // ClassName
    if (email && !studentInfo.has(email)) {
      studentInfo.set(email, { name, className });
    }
  }

  // ── Read only CONFIRMED / OVERRIDDEN decisions, most recent per pair ──
  const decisionData = decisionLogSheet.getDataRange().getValues();
  const latestDecision = new Map(); // pairKey -> { finalRating, decidedAt }
  for (let i = 1; i < decisionData.length; i++) {
    const row = decisionData[i];
    const email = String(row[SCRDL.STUDENT_EMAIL]).trim();
    const compId = String(row[SCRDL.COMPETENCY_ID]).trim();
    const finalRating = row[SCRDL.FINAL_RATING];
    const decidedAt = row[SCRDL.DECIDED_AT];
    const pairKey = email + "|||" + compId;

    const existing = latestDecision.get(pairKey);
    if (!existing || new Date(decidedAt) > new Date(existing.decidedAt)) {
      latestDecision.set(pairKey, { finalRating, decidedAt });
    }
  }

  // ── Group by class ──
  const byClass = new Map(); // className -> Set of student emails
  for (const [email, info] of studentInfo.entries()) {
    if (!info.className) continue;
    if (!byClass.has(info.className)) byClass.set(info.className, new Set());
    byClass.get(info.className).add(email);
  }

  // ── All competency IDs that appear anywhere in the decision log,
  //    reduced to just the trailing task number for the header row,
  //    matching the original workbook's "numbers in the top row" format ──
  const allCompIds = new Set();
  for (const pairKey of latestDecision.keys()) {
    allCompIds.add(pairKey.split("|||")[1]);
  }
  const sortedCompIds = [...allCompIds].sort((a, b) => {
    const taskA = parseInt(a.split("-").pop(), 10) || 0;
    const taskB = parseInt(b.split("-").pop(), 10) || 0;
    return taskA - taskB;
  });

  // ── Build the export spreadsheet ──
  const exportSs = SpreadsheetApp.create(
    "SCR Export — " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")
  );
  // Remove the default blank sheet once real ones exist
  const defaultSheet = exportSs.getActiveSheet();
  let firstClass = true;

  for (const [className, emails] of byClass.entries()) {
    const safeTabName = className.replace(/[\\/?*\[\]]/g, "_").slice(0, 100);
    const sheet = firstClass
      ? defaultSheet.setName(safeTabName)
      : exportSs.insertSheet(safeTabName);
    firstClass = false;

    const headerRow = ["Student Name", ...sortedCompIds.map(id => id.split("-").pop())];
    const rows = [headerRow];

    for (const email of emails) {
      const info = studentInfo.get(email);
      const row = [info.name];
      for (const compId of sortedCompIds) {
        const decision = latestDecision.get(email + "|||" + compId);
        row.push(decision ? decision.finalRating : "");
      }
      rows.push(row);
    }

    sheet.getRange(1, 1, rows.length, headerRow.length).setValues(rows);
    sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
  }

  Logger.log("[S30] Export complete: " + exportSs.getUrl());
  return { exportSsId: exportSs.getId(), exportSsUrl: exportSs.getUrl() };
}

// ---------------------------------------------------------------------------
// createSCRTabs_ — MANUAL, one-time setup. Creates SCRSuggestions and
// SCRDecisionLog with correct headers. Safe to re-run — skips tabs that
// already exist.
// ---------------------------------------------------------------------------
function createSCRTabs_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  _createTabIfMissingS30_(ss, cfg.tabs.scrSuggestions || "SCRSuggestions", [
    "student_email", "competency_id", "suggested_rating",
    "met_count", "not_met_count", "partial_count",
    "status", "last_computed_at",
    "confirmed_rating", "confirmed_at", "confirmed_by"
  ]);

  _createTabIfMissingS30_(ss, cfg.tabs.scrDecisionLog || "SCRDecisionLog", [
    "decision_id", "student_email", "competency_id", "suggested_rating",
    "final_rating", "decision_type", "decided_at", "decided_by",
    "evidence_snapshot"
  ]);

  Logger.log("[S30] SCR tab creation complete.");
}

function _createTabIfMissingS30_(ss, tabName, headers) {
  if (ss.getSheetByName(tabName)) {
    Logger.log("[S30] Tab '" + tabName + "' already exists — skipping.");
    return;
  }
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  Logger.log("[S30] Created tab: " + tabName);
}

// ---------------------------------------------------------------------------
// installSCRTrigger_ — MANUAL, one-time setup. Installs
// runWeeklySCRSuggestionUpdate_ as a 7-day time trigger, same cadence as
// Module 4's Script 29. Safe to re-run.
// ---------------------------------------------------------------------------
function installSCRTrigger_() {
  const existing = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runWeeklySCRSuggestionUpdate_");

  if (existing.length === 0) {
    ScriptApp.newTrigger("runWeeklySCRSuggestionUpdate_")
      .timeBased()
      .everyDays(7)
      .atHour(4) // one hour after Module 4's Script 29, to avoid both
                 // heavy aggregation jobs contending for execution time
                 // in the same window
      .create();
    Logger.log("[S30] Weekly trigger installed: runWeeklySCRSuggestionUpdate_ every 7 days, ~4am.");
  } else {
    Logger.log("[S30] Weekly trigger already installed — skipping.");
  }

  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  [
    cfg.tabs.competencyEvidence || "CompetencyEvidence",
    cfg.tabs.scrSuggestions || "SCRSuggestions",
    cfg.tabs.scrDecisionLog || "SCRDecisionLog",
  ].forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    Logger.log("[S30] Tab '" + tabName + "': " + (sheet ? "FOUND" : "MISSING — run createSCRTabs_() first, or confirm Flow 2 has been deployed for CompetencyEvidence."));
  });
}

// ---------------------------------------------------------------------------
// runSCRUpdateNow_ — MANUAL TESTING ONLY. Identical to the trigger entry
// point, callable directly for verification without waiting a week.
// ---------------------------------------------------------------------------
function runSCRUpdateNow_() {
  Logger.log("[S30] Manual test run invoked — identical logic to the weekly trigger.");
  runWeeklySCRSuggestionUpdate_();
}

// =============================================================================
// ARCHITECTURAL NOTES
// =============================================================================
//
// WHY SCRSuggestions IS OVERWRITTEN IN PLACE, NOT APPEND-ONLY:
// Every other log in this codebase (AlignmentLog, CompetencyEvidence,
// ReportRegistry, SCRDecisionLog itself) records something that already
// happened and should never change retroactively. SCRSuggestions records
// something fundamentally different: a live estimate that should track
// current evidence right up until a human commits to a decision. Treating
// it as append-only would mean either (a) growing unboundedly with a new
// row every week for every still-undecided pair, most of them identical
// to the prior week, or (b) building a "most recent row per pair" query
// everywhere this data is read — both worse than simply updating in place
// and switching to true append-only logging (SCRDecisionLog) the moment a
// human decision actually occurs.
//
// WHAT HAPPENS WHEN NEW EVIDENCE ARRIVES AFTER A CONFIRMED/OVERRIDDEN
// DECISION — NOT YET BUILT:
// This version freezes a pair permanently once decided. If a student
// produces new evidence for an already-decided competency (e.g. a later
// assignment also addresses it), that evidence accumulates in
// CompetencyEvidence but has no path back into a fresh suggestion cycle.
// A real future version likely needs an explicit "reopen" action — a
// teacher-initiated decision to un-freeze a pair, similar in spirit to
// Script 08's abandonStaleDrafts but inverted (here a human would choose
// to reopen, rather than the system automatically expiring something).
// Not built now because it wasn't asked for and guessing at the right
// reopening trigger (time-based? evidence-count-based? always manual?)
// would be exactly the kind of unrequested scope expansion this session
// has otherwise avoided throughout Module 5's design.
//
// WHY THE EXPORT IS MANUAL, NOT PART OF THE WEEKLY TRIGGER:
// Locked design decision, restated: exporting to the Excel-workbook shape
// is an as-needed admin/reporting action (e.g. before a compliance
// deadline, or at grading-period boundaries) — not a recurring background
// task. Matches the existing generateAlignmentReport() precedent in
// Module 2, which is also manual-run.
//
// CONFIG KEYS THIS FILE EXPECTS (add to Script 00, same pattern as M2/M4
// addenda — not written as a separate addendum file since this module's
// tab-name keys are read with inline fallback defaults throughout this
// file, e.g. cfg.tabs.scrSuggestions || "SCRSuggestions" — meaning this
// script runs correctly even before Script 00 is formally updated, then
// picks up the formal config the moment it's added):
//   tabs.competencyEvidence = "CompetencyEvidence"
//   tabs.scrSuggestions     = "SCRSuggestions"
//   tabs.scrDecisionLog     = "SCRDecisionLog"
//
// =============================================================================
