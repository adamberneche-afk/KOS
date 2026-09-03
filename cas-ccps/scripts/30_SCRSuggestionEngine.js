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

// SCRDecisionLog column indices (SCRDL) now live in 00_SharedConfig.js.
// They were moved there when 36_WeeklyParentReport.js needed them: that
// file runs in BOTH cas-ccps:central-ledger and cas-ccps:teacher-dashboard,
// and this file exists only in the former, so a constant declared here is
// simply not defined in the dashboard project. 00_SharedConfig.js is in
// every project, which is the same reason LEDGER lives there.
//
// SCRS (above) deliberately did NOT move. Nothing outside this project has
// any business reading SCRSuggestions — it holds AI values no teacher has
// acted on — so leaving its column map here means a dashboard-project file
// that tried would fail loudly at load rather than quietly render an
// unreviewed rating to someone.

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
  // -1 on a sheet created before roadmap 2.2 added this column — treated
  // as "nothing is archived" below (row[-1] is always undefined), not a
  // required column, so an old sheet still aggregates exactly as before.
  const iArchiveStatus = headers.indexOf("archive_status");

  const result = new Map();
  const badOutcomesSeen = new Set();

  if (iEmail === -1 || iCompId === -1 || iOutcome === -1) {
    Logger.log("[S30] CompetencyEvidence missing required columns " +
      "(student_email, competency_id, outcome). Cannot aggregate.");
    return result;
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Archived evidence is cold storage, not deleted — SCR suggestions
    // should reflect only active evidence, the same way archived Ledger/
    // SCRDecisionLog rows are already excluded from their own live reads.
    if (iArchiveStatus !== -1 && String(row[iArchiveStatus] || "").trim()) continue;

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
    "", // archive_status — blank until _archiveExpiredScrDecisions_() ages it out
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

  // getCompetencyTextMap_() (00_SharedConfig.js) — CacheService-backed,
  // external product review Finding 6. Replaces a getDataRange() +
  // header-lookup block that used to run fresh on every single dashboard
  // load.
  const compTextMap = getCompetencyTextMap_(registrySheet);

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
// getStudentScrStandingForCompetencies_ — NEW (Say/Do Ledger cas-ccps
// Extension 1: SCR-to-warmup bridge). Feeds a student's current SCR
// standing into warm-up generation as a soft signal/tie-breaker — called by
// 24_WarmUpBridge.js (also central-ledger-only — see the cross-project note
// below) right before it calls getStudentProfileSnapshot_() in Script 23,
// which is what actually threads this into the student_profile_snapshot
// Flow 3 reads. Deliberately does NOT touch or reference the "reopen a
// frozen CONFIRMED/OVERRIDDEN decision" gap documented above in this same
// file (lines ~703-733) — consumed as-is, stale or not, per this
// extension's own scoping.
//
// Unlike getSCRDashboardData_() above (which exists to show a teacher what
// still needs a decision, so it deliberately EXCLUDES CONFIRMED/OVERRIDDEN
// rows), this function's job is "what does the record actually say about
// this student on these competencies right now" — so a teacher's already-
// confirmed rating counts here, not just an unconfirmed AI suggestion.
//
// CROSS-PROJECT NOTE: this function (and the SCRS column-index constants it
// reads) is bound only to cas-ccps:central-ledger — NOT to
// cas-ccps:teacher-dashboard (see tools/gas-lint/project-map.json). It must
// only ever be called from a central-ledger-bound file (24_WarmUpBridge.js
// qualifies); never reference this from 23_StudentProfileManager.js or
// 07_TeacherDashboard.js directly, since Script 30 isn't present in the
// teacher-dashboard project and a call from there would be a real, silent
// cross-project bug of exactly the kind tools/gas-lint/check.js's
// possibly-undefined-in-project rule exists to catch.
//
// Returns an array of { competencyId, competencyText, rating, decided }
// — one entry per competency in competencyIds that has a real rating on
// record (SUGGESTED with a non-blank suggestedRating, or CONFIRMED/
// OVERRIDDEN), skipping INSUFFICIENT_EVIDENCE rows (nothing to report) and
// any competency with no SCRSuggestions row at all. Returns [] (never null)
// if suggestionsSheet is missing or competencyIds is empty, so callers never
// need a null-check.
// ---------------------------------------------------------------------------
// Memoized across calls within the same script execution — 24_WarmUpBridge.js
// calls this once PER STUDENT (its own loop structure, already established
// for other per-student lookups like getPriorWarmUpResponse_ against a
// pre-loaded dataset), and a full SCRSuggestions + CompetencyRegistry sheet
// read on every single student in a roster would be a real, avoidable
// performance cost in the nightly batch run. Reset naturally on every fresh
// execution since GAS reinitializes top-level state each run — this is not
// a persistent cache across separate trigger firings.
let _scrStandingRawCache_ = null;

function getStudentScrStandingForCompetencies_(studentEmail, competencyIds) {
  if (!competencyIds || !competencyIds.length) return [];

  if (!_scrStandingRawCache_) {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
    if (!suggestionsSheet) { _scrStandingRawCache_ = { data: [], compTextMap: {} }; }
    else {
      const registrySheet = ss.getSheetByName(cfg.tabs.competencyRegistry);
      // getCompetencyTextMap_() (00_SharedConfig.js) — CacheService-backed,
      // external product review Finding 6. Same replacement as
      // getSCRDashboardData_() above.
      const compTextMap = getCompetencyTextMap_(registrySheet);
      _scrStandingRawCache_ = { data: suggestionsSheet.getDataRange().getValues(), compTextMap: compTextMap };
    }
  }

  const idSet = new Set(competencyIds.map(id => String(id).trim()));
  const email = String(studentEmail || "").trim().toLowerCase();
  const data         = _scrStandingRawCache_.data;
  const compTextMap  = _scrStandingRawCache_.compTextMap;
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[SCRS.STUDENT_EMAIL]).trim().toLowerCase() !== email) continue;
    const competencyId = String(row[SCRS.COMPETENCY_ID]).trim();
    if (!idSet.has(competencyId)) continue;

    const status  = String(row[SCRS.STATUS]).trim();
    const decided = status === "CONFIRMED" || status === "OVERRIDDEN";
    const rating  = decided
      ? Number(row[SCRS.CONFIRMED_RATING])
      : (row[SCRS.SUGGESTED_RATING] === "" ? null : Number(row[SCRS.SUGGESTED_RATING]));
    if (rating == null || !Number.isFinite(rating)) continue; // INSUFFICIENT_EVIDENCE or blank — nothing to report

    results.push({
      competencyId:   competencyId,
      competencyText: compTextMap[competencyId] || "(text not found in registry)",
      rating:         rating,
      decided:        decided // true = teacher-confirmed/overridden; false = AI suggestion only, not yet reviewed
    });
  }

  results.sort((a, b) => a.competencyId.localeCompare(b.competencyId));
  return results;
}

// =============================================================================
// RETENTION + ARCHIVAL (Say/Do Ledger cas-ccps Extension 3)
//
// SCR_RETENTION_YEARS (Script Property, default 5) is UNCONFIRMED against a
// primary source — VDOE/central-office records staff have not yet directly
// confirmed the real retention period for these records (see
// docs/FERPA_DATA_MAP.md's own note on this same open question). It ships
// as a configurable property, not a hardcoded number, specifically so it's
// correctable the moment that confirmation comes in, without a code change.
//
// Archival never deletes anything — it only flips ARCHIVE_STATUS on a row
// past the retention window to a restricted "pending disposition review"
// state. Actual permanent deletion is a decision this codebase deliberately
// never automates; it always requires a human to look at the archived rows
// and decide, by hand, outside of any script here.
// =============================================================================

// ---------------------------------------------------------------------------
// _scrRetentionYears_ — reads SCR_RETENTION_YEARS, defaulting to 5.
// Same direct-PropertiesService-read style as CURRENT_TERM elsewhere in this
// codebase (10_AdminRecoveryPanel.js), just numeric instead of a display
// string — this is the first numeric Script-Property-driven config value
// in cas-ccps, so there's no exact prior convention to match beyond that.
// ---------------------------------------------------------------------------
function _scrRetentionYears_() {
  const raw = PropertiesService.getScriptProperties().getProperty("SCR_RETENTION_YEARS");
  const n = Number(raw);
  return (n && n > 0) ? n : 5;
}

// ---------------------------------------------------------------------------
// _ensureScrDecisionLogArchiveColumn_ — idempotently adds the
// "archive_status" header (column 10) if it's missing, same self-healing
// pattern already established for the turn-in review columns in
// 04_Form2_TurnInGate.js/07_TeacherDashboard.js (Say/Do Ledger cas-ccps
// finding #1) — an already-deployed SCRDecisionLog created before this
// extension existed gets the column added on first use, no separate
// migration step required.
// ---------------------------------------------------------------------------
function _ensureScrDecisionLogArchiveColumn_(sheet) {
  const headerCell = sheet.getRange(1, SCRDL.ARCHIVE_STATUS + 1);
  if (String(headerCell.getValue()).trim() !== "archive_status") {
    headerCell.setValue("archive_status");
  }
}

// ---------------------------------------------------------------------------
// _archiveExpiredScrDecisions_ — scans SCRDecisionLog for rows whose
// DECIDED_AT is older than _scrRetentionYears_() and whose ARCHIVE_STATUS
// is still blank, and marks them archived. Called from both
// autoHealthAlert() and runSystemHealthCheck() (10_AdminRecoveryPanel.js,
// same central-ledger project) immediately before they compute
// _ferpaHealthChecks_(), so archival runs automatically on both the daily
// trigger and any on-demand check — never something an admin has to
// remember to click.
//
// Returns { archived, checked } — checked is total rows scanned (excluding
// header), archived is how many were newly archived this run. Safe to call
// with SCRDecisionLog missing (returns zeros) or already fully archived
// (returns archived: 0).
// ---------------------------------------------------------------------------
function _archiveExpiredScrDecisions_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");
  if (!sheet) return { archived: 0, checked: 0 };

  _ensureScrDecisionLogArchiveColumn_(sheet);

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _scrRetentionYears_());

  const data = sheet.getDataRange().getValues();
  let archived = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[SCRDL.ARCHIVE_STATUS] || "").trim()) continue; // already archived

    const decidedAt = row[SCRDL.DECIDED_AT];
    if (!decidedAt) continue;
    const decidedDate = new Date(decidedAt);
    if (isNaN(decidedDate.getTime())) continue;

    if (decidedDate < cutoff) {
      sheet.getRange(i + 1, SCRDL.ARCHIVE_STATUS + 1).setValue("ARCHIVED — pending disposition review");
      archived++;
    }
  }

  if (archived > 0) {
    SpreadsheetApp.flush();
    Logger.log("[S30] Archived " + archived + " SCRDecisionLog row(s) past the " +
      _scrRetentionYears_() + "-year retention window.");
  }

  return { archived: archived, checked: data.length - 1 };
}

// ---------------------------------------------------------------------------
// _countScrDecisionsPastRetentionUnarchived_ — read-only companion to
// _archiveExpiredScrDecisions_(), used by _ferpaHealthChecks_()
// (10_AdminRecoveryPanel.js) as a pure check with no side effects of its
// own. Since both callers of that function already run
// _archiveExpiredScrDecisions_() first, this should almost always return 0
// — a nonzero result means archival itself failed or the daily trigger
// isn't actually firing, which is the real thing worth alerting on.
// ---------------------------------------------------------------------------
function _countScrDecisionsPastRetentionUnarchived_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");
  if (!sheet) return 0;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _scrRetentionYears_());

  const data = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[SCRDL.ARCHIVE_STATUS] || "").trim()) continue; // already archived
    const decidedAt = row[SCRDL.DECIDED_AT];
    if (!decidedAt) continue;
    const decidedDate = new Date(decidedAt);
    if (isNaN(decidedDate.getTime())) continue;
    if (decidedDate < cutoff) count++;
  }
  return count;
}

// =============================================================================
// COMPETENCY EVIDENCE RETENTION + REACTIVATE (KOS/CAS roadmap synthesis 2.2 —
// "explicit archive/hibernate state")
//
// CompetencyEvidence was the one FERPA-scoped tab in this file's own
// retention story (docs/FERPA_DATA_MAP.md) with no archival mechanism at
// all — SCRDecisionLog and the Ledger (10_AdminRecoveryPanel.js) already
// had this exact pattern; this extends it here, unconfirmed retention
// default and all, for the same reason theirs shipped unconfirmed: correct
// the number the moment a real district/legal schedule is known, via
// COMPETENCY_EVIDENCE_RETENTION_YEARS, no code change required.
//
// Deliberately plain "ARCHIVED", not SCRDecisionLog's "ARCHIVED — pending
// disposition review" — that wording is a legal-hold state for the actual
// retained SCR decision record, intentionally not meant to be casually
// reversed (see reactivateCompetencyEvidence's own note on why it has no
// SCRDecisionLog counterpart). CompetencyEvidence is upstream working
// evidence, not the retained decision itself, so plain ARCHIVED — and a
// real way back — is the better fit, matching the Ledger's own ARCHIVED
// status exactly.
//
// Never deletes anything; actual permanent deletion still always requires
// a human decision outside any script here.
// =============================================================================

function _competencyEvidenceRetentionYears_() {
  const raw = PropertiesService.getScriptProperties().getProperty("COMPETENCY_EVIDENCE_RETENTION_YEARS");
  const n = Number(raw);
  return (n && n > 0) ? n : 5;
}

// Idempotently adds the "archive_status" header (column 9) if it's
// missing — same self-healing pattern as
// _ensureScrDecisionLogArchiveColumn_() above, for a CompetencyEvidence
// tab created before this extension existed.
function _ensureCompetencyEvidenceArchiveColumn_(sheet) {
  const headerCell = sheet.getRange(1, 9);
  if (String(headerCell.getValue()).trim() !== "archive_status") {
    headerCell.setValue("archive_status");
  }
}

// Returns { archived, checked }. Safe to call with CompetencyEvidence
// missing (returns zeros) or already fully archived (returns archived: 0).
// Anchors "how old is this record" on evaluated_at, the same "age of the
// record itself" anchor the Ledger (TIMESTAMP) and SCRDecisionLog
// (DECIDED_AT) archival both use. Resolves columns by header name, not
// position — same convention aggregateEvidence_() above already
// established for this specific tab (unlike LEDGER/SCRDL's positional
// constants), since this file has no CE.* column-index constant to match.
function _archiveExpiredCompetencyEvidence_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!sheet) return { archived: 0, checked: 0 };

  _ensureCompetencyEvidenceArchiveColumn_(sheet);

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iEvaluatedAt = headers.indexOf("evaluated_at");
  const iArchiveStatus = headers.indexOf("archive_status");
  if (iEvaluatedAt === -1 || iArchiveStatus === -1) {
    Logger.log("[S30] CompetencyEvidence missing evaluated_at/archive_status columns. Cannot run retention archival.");
    return { archived: 0, checked: Math.max(0, data.length - 1) };
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _competencyEvidenceRetentionYears_());

  let archived = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[iArchiveStatus] || "").trim()) continue; // already archived

    const evaluatedAt = row[iEvaluatedAt];
    if (!evaluatedAt) continue;
    const evaluatedDate = new Date(evaluatedAt);
    if (isNaN(evaluatedDate.getTime())) continue;

    if (evaluatedDate < cutoff) {
      sheet.getRange(i + 1, iArchiveStatus + 1).setValue("ARCHIVED");
      archived++;
    }
  }

  if (archived > 0) {
    SpreadsheetApp.flush();
    Logger.log("[S30] Archived " + archived + " CompetencyEvidence row(s) past the " +
      _competencyEvidenceRetentionYears_() + "-year retention window.");
  }

  return { archived: archived, checked: data.length - 1 };
}

// Read-only companion to _archiveExpiredCompetencyEvidence_(), used by
// _ferpaHealthChecks_() (10_AdminRecoveryPanel.js) — same pairing as the
// Ledger/SCRDecisionLog checks above. Both callers of
// _ferpaHealthChecks_() already run _archiveExpiredCompetencyEvidence_()
// first, so a nonzero result here means archival itself failed or didn't
// run, not a tautology.
function _countCompetencyEvidencePastRetentionUnarchived_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!sheet) return 0;

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iEvaluatedAt = headers.indexOf("evaluated_at");
  const iArchiveStatus = headers.indexOf("archive_status");
  if (iEvaluatedAt === -1 || iArchiveStatus === -1) return 0;

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - _competencyEvidenceRetentionYears_());

  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[iArchiveStatus] || "").trim()) continue;
    const evaluatedAt = row[iEvaluatedAt];
    if (!evaluatedAt) continue;
    const evaluatedDate = new Date(evaluatedAt);
    if (isNaN(evaluatedDate.getTime())) continue;
    if (evaluatedDate < cutoff) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// reactivateCompetencyEvidence — admin menu item (wired into
// 10_AdminRecoveryPanel.js's onOpen(), same central-ledger project as
// exportScrDecisionLogForAudit() above). The genuinely missing half of
// "archive/hibernate state": until this, nothing in cas-ccps had a way
// back from ARCHIVED at all — archiveCompletedTerm()'s own confirm dialog
// says so explicitly ("This cannot be undone automatically — contact your
// admin to restore"). This clears archive_status back to blank for every
// row matching a given student email, so evidence for a reopened case
// (an appeal, a corrected record) can feed back into aggregateEvidence_()
// and SCR suggestions again. No SCRDecisionLog counterpart, deliberately —
// see this file's retention-block header comment on why that tab's
// "ARCHIVED — pending disposition review" is a legal-hold state, not a
// hibernate state.
// ---------------------------------------------------------------------------
function reactivateCompetencyEvidence() {
  const ui = SpreadsheetApp.getUi();
  const cfg = getConfig_();

  const emailRes = ui.prompt(
    "Reactivate Competency Evidence",
    "Enter the student's email address to reactivate archived evidence for.\n\n" +
    "This clears the archived status on every matching CompetencyEvidence row " +
    "so it counts toward SCR suggestions again.",
    ui.ButtonSet.OK_CANCEL
  );
  if (emailRes.getSelectedButton() !== ui.Button.OK) return;

  const email = emailRes.getResponseText().trim().toLowerCase();
  if (!email) { ui.alert("Email cannot be blank."); return; }

  const confirm = ui.alert(
    "Reactivate evidence for \"" + email + "\"?",
    "This will clear the archived status on all of this student's CompetencyEvidence rows.\n\n" +
    "Are you sure?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  if (!sheet) { ui.alert("⚠️ CompetencyEvidence tab not found."); return; }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iEmail = headers.indexOf("student_email");
  const iArchiveStatus = headers.indexOf("archive_status");
  if (iEmail === -1 || iArchiveStatus === -1) {
    ui.alert("⚠️ CompetencyEvidence is missing student_email/archive_status columns.");
    return;
  }

  let reactivated = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[iEmail]).trim().toLowerCase() !== email) continue;
    if (!String(row[iArchiveStatus] || "").trim()) continue; // wasn't archived
    sheet.getRange(i + 1, iArchiveStatus + 1).setValue("");
    reactivated++;
  }

  if (reactivated > 0) SpreadsheetApp.flush();

  ui.alert(
    "✅ Reactivate Complete",
    reactivated > 0
      ? reactivated + " row(s) reactivated for " + email + "."
      : "No archived CompetencyEvidence rows found for " + email + ".",
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// exportToWorkbookGrid_ — produces a Google Sheet matching the official SCR
// Excel workbook shape described in the original specification: one tab per
// class, student names as rows, competency numbers (not full IDs — just the
// trailing -N) as the header row, confirmed/overridden ratings as cell
// values. Only CONFIRMED and OVERRIDDEN decisions appear — a suggestion
// that was never acted on by a teacher has no place in the official
// record, by design, since the SCR is fundamentally a record of teacher
// judgment, not system output. Includes archived rows (archival restricts
// sharing/visibility going forward — see the RETENTION + ARCHIVAL section
// above — it does not remove a decision from the official record an audit
// export exists to produce).
//
// Groups by ClassName, sourced from the Ledger tab (joining on
// student_email = GoogleID) — the same Ledger Module 4 already reads
// for its student roster.
//
// FIXED (Say/Do Ledger cas-ccps Extension 3): this used to be reachable
// only by opening the Script Editor and running it directly — no menu item
// called it at all. exportScrDecisionLogForAudit() below is the real,
// menu-driven entry point now; this function stays the core builder either
// way (still callable directly for a script-editor run, unchanged).
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
  // Bounded to LEDGER_COL_COUNT (00_SharedConfig.js), not getDataRange() —
  // external product review Finding 6. Math.max(1, ...) matches
  // getDataRange()'s own guarantee of at least one row even on an
  // otherwise-empty sheet (getRange throws on a zero-row request).
  const ledgerData = ledgerSheet.getRange(1, 1, Math.max(1, ledgerSheet.getLastRow()), LEDGER_COL_COUNT).getValues();
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

  // ── Join in each student's assignment-doc link ──
  // An auditor reading a competency rating has, until now, had no route from
  // the rating to the work it was based on — the evidence snapshot on the
  // decision row is text, and this grid doesn't carry even that. A link
  // closes that gap using data already collected.
  //
  // Sourced from StudentDocRegistry rather than the Ledger's StudentFileURL:
  // the registry holds one row per student, which matches this grid's grain,
  // where the Ledger holds one row per submission and would need a
  // "which one" rule this export has no basis to pick.
  //
  // No sharing change is implied. These docs are already shared with their
  // own student via addViewer(), and this workbook is already restricted to
  // the owner's Workspace domain at creation (below) — a link is only
  // followable by someone who could already open the file.
  const docUrlByEmail = new Map();
  const registrySheet = ss.getSheetByName(cfg.tabs.studentDocRegistry);
  if (registrySheet && registrySheet.getLastRow() > 1) {
    const SDR_EMAIL = 0;
    const SDR_DOC_URL = 3;
    const registryData = registrySheet
      .getRange(1, 1, registrySheet.getLastRow(), SDR_DOC_URL + 1)
      .getValues();
    for (let i = 1; i < registryData.length; i++) {
      const email = String(registryData[i][SDR_EMAIL] || "").trim();
      const url = String(registryData[i][SDR_DOC_URL] || "").trim();
      if (email && url && !docUrlByEmail.has(email)) docUrlByEmail.set(email, url);
    }
  } else {
    Logger.log("[S30] No StudentDocRegistry rows — export will have no doc links.");
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
  // FIXED (Say/Do Ledger cas-ccps finding #5 — newly-discovered gap): this
  // spreadsheet holds real student names + competency ratings and used to
  // land with Sheets' default (private-to-creator) sharing — meaning
  // ordinary Drive sharing (a well-meaning "share with the whole team"
  // click) was the one place student data could actually leave the org,
  // with nothing in this codebase stopping it. Restricted at creation time
  // instead of trusting whoever exports it to remember to restrict it by
  // hand; DriveApp.Access.DOMAIN scopes to the file owner's own Workspace
  // domain automatically, so there's no domain string to hardcode or drift.
  try {
    DriveApp.getFileById(exportSs.getId())
      .setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log("[S30] Could not restrict SCR export sharing: " + e.message);
  }
  // Remove the default blank sheet once real ones exist
  const defaultSheet = exportSs.getActiveSheet();
  let firstClass = true;

  for (const [className, emails] of byClass.entries()) {
    const safeTabName = className.replace(/[\\/?*\[\]]/g, "_").slice(0, 100);
    const sheet = firstClass
      ? defaultSheet.setName(safeTabName)
      : exportSs.insertSheet(safeTabName);
    firstClass = false;

    // "Student Doc" sits second so both identifying columns stay inside the
    // frozen pane; the competency numbers keep their original order after it.
    const headerRow = [
      "Student Name", "Student Doc",
      ...sortedCompIds.map(id => id.split("-").pop()),
    ];
    const rows = [headerRow];

    for (const email of emails) {
      const info = studentInfo.get(email);
      // Blank, not a placeholder: a student with no registry row has no doc
      // to link, and "N/A" in an audit export invites reading it as a
      // finding about the student rather than a gap in the data.
      const row = [info.name, docUrlByEmail.get(email) || ""];
      for (const compId of sortedCompIds) {
        const decision = latestDecision.get(email + "|||" + compId);
        row.push(decision ? decision.finalRating : "");
      }
      rows.push(row);
    }

    sheet.getRange(1, 1, rows.length, headerRow.length).setValues(rows);
    sheet.getRange(1, 1, 1, headerRow.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);   // Student Name + Student Doc
  }

  Logger.log("[S30] Export complete: " + exportSs.getUrl());
  return { exportSsId: exportSs.getId(), exportSsUrl: exportSs.getUrl() };
}

// ---------------------------------------------------------------------------
// exportScrDecisionLogForAudit — Say/Do Ledger cas-ccps Extension 3. The
// real, menu-driven entry point for exportToWorkbookGrid_() above (wired
// into ⚙️ Admin Controls in 10_AdminRecoveryPanel.js's onOpen(), same
// central-ledger project). Prompts for the central-office recipient
// address(es), builds the export (unchanged core logic), then shares it
// with each recipient directly — on top of, not instead of, the existing
// org-domain VIEW restriction exportToWorkbookGrid_() already applies at
// creation. Only addresses on the admin's own school domain are accepted,
// so this can never become the "leaves the org via ordinary Drive sharing"
// vector the domain-restriction fix (Say/Do Ledger finding #5) was built to
// close in the first place.
// ---------------------------------------------------------------------------
function exportScrDecisionLogForAudit() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "Export SCRDecisionLog for Audit",
    "Enter the central-office email address(es) to share this export with, " +
    "separated by commas.\n\n" +
    "Only addresses on your own school domain are accepted — this keeps the " +
    "export inside the Walled Garden the same way every other FERPA-sensitive " +
    "surface in this system does.",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const rawEmails = res.getResponseText().split(",")
    .map(function(s) { return s.trim().toLowerCase(); })
    .filter(Boolean);
  if (!rawEmails.length) { ui.alert("Enter at least one email address."); return; }

  const myEmail  = Session.getActiveUser().getEmail();
  const myDomain = (myEmail.split("@")[1] || "").toLowerCase();
  const validEmails = [];
  const rejected    = [];
  rawEmails.forEach(function(e) {
    const domain = (e.split("@")[1] || "").toLowerCase();
    if (domain && myDomain && domain === myDomain) validEmails.push(e);
    else rejected.push(e);
  });

  if (!validEmails.length) {
    ui.alert("None of the entered addresses are on your organization's domain (" +
      (myDomain || "unknown") + ") — nothing was shared, and no export was created.");
    return;
  }

  const result = exportToWorkbookGrid_();
  if (!result) {
    ui.alert("⚠️ Export failed — SCRDecisionLog or Ledger tab not found. See the Executions log for detail.");
    return;
  }

  const failedShares = [];
  validEmails.forEach(function(email) {
    try {
      DriveApp.getFileById(result.exportSsId).addViewer(email);
    } catch (e) {
      failedShares.push(email);
      Logger.log("[S30] Could not share SCR export with " + email + ": " + e.message);
    }
  });
  const sharedOk = validEmails.filter(function(e) { return failedShares.indexOf(e) === -1; });

  ui.alert(
    "✅ Export Complete",
    "Export created: " + result.exportSsUrl + "\n\n" +
    "Shared with: " + (sharedOk.length ? sharedOk.join(", ") : "(no one)") + "\n" +
    (rejected.length ? "\nNot shared (outside your organization's domain): " + rejected.join(", ") + "\n" : "") +
    (failedShares.length ? "\n⚠️ Could not share with: " + failedShares.join(", ") + " — share manually if needed.\n" : ""),
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// createSCRTabs_ — MANUAL, one-time setup. Creates CompetencyEvidence,
// SCRSuggestions, and SCRDecisionLog with correct headers. Safe to
// re-run — skips tabs that already exist.
//
// CompetencyEvidence's header matches
// cas-ccps/studio-steps/CommitStudentEvaluationStep.gs's own writer
// exactly (evidence_id/student_email/competency_id/milestone_text/
// outcome/config_id/evaluated_at/student_file_id) — that step and
// 15c_Flow2DirectEvaluationService.js's writeCompetencyEvidenceFromFlow2_
// both self-create this tab lazily on their own first write if it's
// still missing at that point, so creating it here up front isn't
// strictly required for correctness, only for aggregateEvidence_()
// below and runFlowPreflightCheck() (35_FlowPreflightAndCanary.js) to
// stop reporting it missing before Flow 2 has ever actually run once.
//
// INTEGRATION WITH SCRIPT 16 (same convention as
// 28_Module2Setup.js's own "INTEGRATION WITH SCRIPT 16" note):
// createSCRTabs_() and installSCRTrigger_() have no menu entry today —
// an admin following only the normal setup wizard would never discover
// Module 5 needs a separate step, which is exactly how "the entire
// competency-evidence -> SCR-suggestion subsystem is silently dead on
// a fresh deployment" (this file's own "[S30] Aborting run" log line)
// happens in practice. To wire this in the same way Module 2's own
// menu items are documented to be wired (paste into onOpen(), after
// the Module 2 block):
//
//   menu.addSeparator();
//   if (!ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions")) {
//     menu.addItem("📐 Set Up Student Competency Records (Module 5)", "createSCRTabs_");
//   } else {
//     menu.addItem("📐 Module 5 Status", "installSCRTrigger_");
//   }
// ---------------------------------------------------------------------------
function createSCRTabs_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  // archive_status added (roadmap 2.2 — explicit archive/hibernate state):
  // "" = active; "ARCHIVED" once past COMPETENCY_EVIDENCE_RETENTION_YEARS
  // or manually reactivated back to blank — see
  // _archiveExpiredCompetencyEvidence_()/reactivateCompetencyEvidence()
  // below. Both real writers (this function and
  // cas-ccps/studio-steps/CommitStudentEvaluationStep.gs /
  // 15c_Flow2DirectEvaluationService.js) must stay byte-identical here —
  // see tests/cas-ccps/competency-evidence-schema-compat.test.js.
  _createTabIfMissingS30_(ss, cfg.tabs.competencyEvidence || "CompetencyEvidence", [
    "evidence_id", "student_email", "competency_id", "milestone_text",
    "outcome", "config_id", "evaluated_at", "student_file_id", "archive_status"
  ]);

  _createTabIfMissingS30_(ss, cfg.tabs.scrSuggestions || "SCRSuggestions", [
    "student_email", "competency_id", "suggested_rating",
    "met_count", "not_met_count", "partial_count",
    "status", "last_computed_at",
    "confirmed_rating", "confirmed_at", "confirmed_by"
  ]);

  _createTabIfMissingS30_(ss, cfg.tabs.scrDecisionLog || "SCRDecisionLog", [
    "decision_id", "student_email", "competency_id", "suggested_rating",
    "final_rating", "decision_type", "decided_at", "decided_by",
    "evidence_snapshot", "archive_status"
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
