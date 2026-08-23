// =============================================================================
// FILE: 30b_SCRRetryRemediation.js
// BOUND TO: Central Ledger spreadsheet (same project as Script 30)
// PURPOSE: Extends Script 30 with primary/secondary competency linkage and
//          a controlled retry mechanism. Closes the "reopen" gap explicitly
//          flagged as unbuilt in 30_SCRSuggestionEngine.js's architectural
//          notes.
//
// THE GOAL THIS SERVES: every student should reach at least an SCR of 2 on
// every required competency. A student who scores a 3 or 4 on a primary
// competency isn't stuck there -- secondary competencies linked to that
// same lesson give them a remediation path. Enough secondary evidence
// unlocks a primary retry; a higher retry result becomes the new official
// rating; the original lower rating is never erased, only superseded.
//
// THREE DEFAULTS LOCKED FOR THIS BUILD (stated explicitly -- each is a
// reasonable choice made in the absence of a direct answer, not a
// silently-assumed fact; revisit any of them freely):
//   1. "Overwritten" = APPEND a new SCRDecisionLog row. Never edit
//      history in place. Official rating = most recent decision row.
//      This is the one default with no real alternative -- every other
//      log in this codebase is append-only for the same retention
//      reason (8VAC20-120-120).
//   2. "Enough improvement" to unlock a retry = the SAME threshold rule
//      already used for primary suggestions (3+ MET, zero NOT_MET),
//      applied to secondary evidence instead. Reused rather than
//      invented. Most likely default to need adjustment with real data.
//   3. Primary/secondary linkage is defined per LESSON UNIT, not per
//      milestone -- matches "linked for each lesson" as stated.
//
// ENTRY POINTS:
//   checkRetryEligibility_(studentEmail, primaryCompetencyId)
//                                -- read-only check, callable from a
//                                  dashboard or run in bulk
//   getAllRetryEligibleStudents_()
//                                -- bulk scan, surfaces every student+
//                                  primary-competency pair currently
//                                  eligible for a retry, for a teacher-
//                                  facing dashboard view
//   attemptPrimaryRetry_(studentEmail, primaryCompetencyId, teacherEmail)
//                                -- the actual reopen action. Computes a
//                                  fresh suggestion from NEW primary
//                                  evidence only, compares to the
//                                  existing official rating, and -- only
//                                  on teacher confirmation -- appends the
//                                  improved rating to SCRDecisionLog.
//   createLessonPrimarySecondaryTab_()
//                                -- MANUAL, one-time setup
// =============================================================================

// LessonPrimarySecondary column indices (0-based)
// One row per lesson_unit_id. Authored once per lesson -- by the teacher,
// or seeded from the pacing guide's lesson_unit_id list -- not generated
// per-student. This is reference data, same category as
// CompetencyRegistry: set up once, read often, rarely rewritten.
const LPS = {
  LESSON_UNIT_ID: 0,
  PRIMARY_COMPETENCY_ID: 1,
  SECONDARY_COMPETENCY_IDS: 2, // comma-separated, same convention as
                                // LessonContext.competency_ids
};

// ---------------------------------------------------------------------------
// getPrimarySecondaryMap_
// Returns Map<lesson_unit_id, { primaryCompetencyId, secondaryCompetencyIds: [] }>
// ---------------------------------------------------------------------------
function getPrimarySecondaryMap_(lpsSheet) {
  const data = lpsSheet.getDataRange().getValues();
  const map = new Map();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lessonUnitId = String(row[LPS.LESSON_UNIT_ID]).trim();
    if (!lessonUnitId) continue;
    const primary = String(row[LPS.PRIMARY_COMPETENCY_ID]).trim();
    const secondaries = String(row[LPS.SECONDARY_COMPETENCY_IDS]).trim()
      .split(",").map(s => s.trim()).filter(Boolean);
    map.set(lessonUnitId, { primaryCompetencyId: primary, secondaryCompetencyIds: secondaries });
  }
  return map;
}

// ---------------------------------------------------------------------------
// getSecondariesForPrimary_
// Given a primary competency_id, returns every secondary competency_id
// linked to it across ALL lessons that name it as primary (a primary
// competency could plausibly be the target of more than one lesson over
// the course of a year -- this returns the union across all of them,
// since remediation evidence for that primary could come from any
// lesson that supports it).
// ---------------------------------------------------------------------------
function getSecondariesForPrimary_(lpsSheet, primaryCompetencyId) {
  const map = getPrimarySecondaryMap_(lpsSheet);
  const secondarySet = new Set();
  for (const entry of map.values()) {
    if (entry.primaryCompetencyId === primaryCompetencyId) {
      entry.secondaryCompetencyIds.forEach(id => secondarySet.add(id));
    }
  }
  return [...secondarySet];
}

// ---------------------------------------------------------------------------
// checkRetryEligibility_ -- ENTRY POINT, read-only
// Returns { eligible: boolean, reason: string, secondaryEvidence: {...} }
//
// Eligibility requires:
//   1. The primary competency's current SCRSuggestions status is
//      CONFIRMED or OVERRIDDEN (i.e. it's frozen -- retry only makes
//      sense for something already decided; an un-decided pair should
//      go through the normal suggestion flow, not a retry).
//   2. The official rating is 3 or 4 (a 2 is already at or below the
//      "at least a 2" goal -- no retry needed; a 1 or 5 would only ever
//      result from a teacher's deliberate override, and retrying toward
//      a value the system itself can't suggest is out of scope here).
//   3. Secondary evidence linked to this primary meets the SAME
//      threshold rule used for primary suggestions (Default #2 above).
// ---------------------------------------------------------------------------
function checkRetryEligibility_(studentEmail, primaryCompetencyId) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  const evidenceSheet = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
  const lpsSheet = ss.getSheetByName(cfg.tabs.lessonPrimarySecondary || "LessonPrimarySecondary");

  if (!suggestionsSheet || !evidenceSheet || !lpsSheet) {
    return { eligible: false, reason: "Required tab missing (SCRSuggestions, CompetencyEvidence, or LessonPrimarySecondary)." };
  }

  // -- Step 1 + 2: find the current official state for this pair --
  const suggData = suggestionsSheet.getDataRange().getValues();
  let officialRow = null;
  for (let i = 1; i < suggData.length; i++) {
    if (String(suggData[i][SCRS.STUDENT_EMAIL]).trim().toLowerCase() === studentEmail.toLowerCase() &&
        String(suggData[i][SCRS.COMPETENCY_ID]).trim() === primaryCompetencyId) {
      officialRow = suggData[i];
      break;
    }
  }

  if (!officialRow) {
    return { eligible: false, reason: "No existing suggestion/decision record for this student and competency." };
  }

  const status = String(officialRow[SCRS.STATUS]).trim();
  if (status !== "CONFIRMED" && status !== "OVERRIDDEN") {
    return { eligible: false, reason: "This competency is not yet decided (status: " + status +
      "). A retry only applies to an already-confirmed or overridden rating -- use the normal suggestion flow instead." };
  }

  const officialRating = Number(officialRow[SCRS.CONFIRMED_RATING]);
  if (!officialRating || officialRating <= 2) {
    return { eligible: false, reason: "Current official rating is " + officialRating +
      " -- already at or better than the goal of 2. No retry needed." };
  }
  if (officialRating >= 5 || officialRating === 1) {
    return { eligible: false, reason: "Current official rating (" + officialRating +
      ") was set by direct teacher override outside the system's suggestible range. " +
      "Retry logic in this version only applies to ratings of 3 or 4." };
  }

  // -- Step 3: check evidence against the REVISED two-clause rule --
  // REPLACES the original zero-tolerance rule (3+ secondary MET, ZERO
  // secondary NOT_MET allowed at all), which was flagged as a real
  // blocker -- students rarely produce a perfectly clean evidence
  // streak, so a zero-tolerance gate made the retry path nearly
  // unreachable for the very students it exists to help.
  //
  // NEW RULE (two clauses, both required, joined by AND):
  //   Clause A: totalMetCount >= 5
  //     "5 or more total competency assignments met" -- combining BOTH
  //     primary and secondary MET evidence linked to this retry
  //     attempt. Counts EVIDENCE ROWS, not distinct competencies --
  //     consistent with how every other threshold in this system counts
  //     (Script 30's primary suggestion rule counts rows, never distinct
  //     competency_ids). This is the one place this convention was an
  //     explicit choice rather than an unambiguous reading of the
  //     instruction -- flagged here rather than silently assumed.
  //   Clause B: secondaryMetCount >= 2 * primaryNotMetCount
  //     "2 secondary assignments met for every primary assignment not
  //     met" -- a RATIO, not a flat bar. Scales the secondary
  //     requirement to how many times the primary was actually missed,
  //     rather than demanding zero tolerance regardless of how much
  //     other strong evidence exists. This is the actual fix for the
  //     blocker: a student with one primary NOT_MET needs only 2
  //     secondary MET to qualify; a student who struggled more needs
  //     proportionally more secondary evidence, rather than being
  //     blocked outright by a single miss.
  const secondaryCompIds = getSecondariesForPrimary_(lpsSheet, primaryCompetencyId);
  if (secondaryCompIds.length === 0) {
    return { eligible: false, reason: "No secondary competencies are linked to this primary competency in LessonPrimarySecondary." };
  }

  const primaryCounts = aggregateEvidenceForStudentAcrossCompetencies_(
    evidenceSheet, studentEmail, [primaryCompetencyId], "PRIMARY"
  );
  const secondaryCounts = aggregateEvidenceForStudentAcrossCompetencies_(
    evidenceSheet, studentEmail, secondaryCompIds, "SECONDARY"
  );

  const totalMetCount = primaryCounts.metCount + secondaryCounts.metCount;
  const primaryNotMetCount = primaryCounts.notMetCount;

  const clauseA = totalMetCount >= 5;
  // Guard against a primary with zero recorded NOT_MET despite a 3/4
  // rating (e.g. all PARTIALLY_MET evidence). The ratio requirement has
  // nothing to scale against in that case -- treat clause B as
  // automatically satisfied rather than dividing by zero or blocking on
  // a technicality the student didn't cause.
  const clauseB = primaryNotMetCount === 0
    ? true
    : secondaryCounts.metCount >= 2 * primaryNotMetCount;

  const eligible = clauseA && clauseB;

  return {
    eligible,
    reason: eligible
      ? "Eligibility met -- " + totalMetCount + " total MET (primary + secondary) and " +
        secondaryCounts.metCount + " secondary MET against " + primaryNotMetCount + " primary NOT_MET."
      : "Eligibility not yet met. Need " + clauseAReasonText_(totalMetCount) +
        " and " + clauseBReasonText_(secondaryCounts.metCount, primaryNotMetCount) + ".",
    currentOfficialRating: officialRating,
    totalMetCount,
    primaryEvidence: primaryCounts,
    secondaryEvidence: secondaryCounts,
    secondaryCompetencyIds: secondaryCompIds,
  };
}

// ---------------------------------------------------------------------------
// clauseAReasonText_ / clauseBReasonText_ -- small helpers producing a
// human-readable explanation of which clause is unmet, for the dashboard
// view. Separated out so checkRetryEligibility_'s main body stays
// readable.
// ---------------------------------------------------------------------------
function clauseAReasonText_(totalMetCount) {
  if (totalMetCount >= 5) return "5+ total MET (currently " + totalMetCount + ", already satisfied)";
  return "5+ total MET evidence (primary + secondary combined) -- currently " + totalMetCount;
}

function clauseBReasonText_(secondaryMetCount, primaryNotMetCount) {
  const required = 2 * primaryNotMetCount;
  if (secondaryMetCount >= required) {
    return "2x secondary MET per primary NOT_MET (currently " + secondaryMetCount +
      " secondary MET vs. " + required + " required, already satisfied)";
  }
  return "2 secondary MET for every primary NOT_MET (" + primaryNotMetCount +
    " primary NOT_MET requires " + required + " secondary MET -- currently " + secondaryMetCount + ")";
}


// ---------------------------------------------------------------------------
// aggregateEvidenceForStudentAcrossCompetencies_
// Like Script 30's aggregateEvidence_(), but scoped to ONE student and a
// SET of competency_ids (the linked secondaries), filtered by
// evidence_role. Pools counts across all matching competency_ids into a
// single combined tally -- see pooling rationale in checkRetryEligibility_.
// ---------------------------------------------------------------------------
function aggregateEvidenceForStudentAcrossCompetencies_(evidenceSheet, studentEmail, competencyIds, requiredRole) {
  const data = evidenceSheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iEmail = headers.indexOf("student_email");
  const iCompId = headers.indexOf("competency_id");
  const iOutcome = headers.indexOf("outcome");
  const iRole = headers.indexOf("evidence_role");

  const counts = { metCount: 0, notMetCount: 0, partialCount: 0 };
  const compIdSet = new Set(competencyIds);

  if (iEmail === -1 || iCompId === -1 || iOutcome === -1) return counts;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const email = String(row[iEmail]).trim();
    const compId = String(row[iCompId]).trim();
    const outcome = String(row[iOutcome]).trim();
    const role = iRole !== -1 ? String(row[iRole]).trim() : "";

    if (email.toLowerCase() !== studentEmail.toLowerCase()) continue;
    if (!compIdSet.has(compId)) continue;
    // If evidence_role column doesn't exist yet (older rows written
    // before this column was added -- see CompetencyEvidence schema
    // note below), treat rows with no role as PRIMARY by default,
    // matching the system's original behavior before this extension
    // existed. Rows explicitly marked SECONDARY only count toward
    // secondary aggregation.
    const effectiveRole = role || "PRIMARY";
    if (effectiveRole !== requiredRole) continue;

    if (!VALID_OUTCOMES.includes(outcome)) continue;
    if (outcome === "MET") counts.metCount++;
    else if (outcome === "NOT_MET") counts.notMetCount++;
    else if (outcome === "PARTIALLY_MET") counts.partialCount++;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// getAllRetryEligibleStudents_ -- ENTRY POINT for a teacher dashboard view.
// Bulk version of checkRetryEligibility_ -- scans every CONFIRMED/
// OVERRIDDEN pair with a rating of 3 or 4, checks each for retry
// eligibility, returns only the eligible ones.
//
// NOTE ON COST: this re-reads CompetencyEvidence once per candidate pair
// via checkRetryEligibility_'s internal call to
// aggregateEvidenceForStudentAcrossCompetencies_. At the scale this
// system operates at (one teacher, two courses, a few hundred students
// at most), this is acceptable. If this is ever run across many
// teachers' combined data, this function should be rewritten to read
// CompetencyEvidence once and aggregate in memory rather than
// re-scanning per pair -- flagged here rather than prematurely optimized
// for a scale this system doesn't yet operate at.
// ---------------------------------------------------------------------------
function getAllRetryEligibleStudents_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  if (!suggestionsSheet) return { error: "SCRSuggestions tab not found." };

  const data = suggestionsSheet.getDataRange().getValues();
  const candidates = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = String(row[SCRS.STATUS]).trim();
    if (status !== "CONFIRMED" && status !== "OVERRIDDEN") continue;
    const rating = Number(row[SCRS.CONFIRMED_RATING]);
    if (rating !== 3 && rating !== 4) continue;
    candidates.push({
      studentEmail: String(row[SCRS.STUDENT_EMAIL]).trim(),
      competencyId: String(row[SCRS.COMPETENCY_ID]).trim(),
    });
  }

  const eligible = [];
  for (const c of candidates) {
    const result = checkRetryEligibility_(c.studentEmail, c.competencyId);
    if (result.eligible) {
      eligible.push({ ...c, ...result });
    }
  }

  Logger.log("[S30b] Retry eligibility scan: " + candidates.length +
    " candidate(s) at rating 3/4 checked, " + eligible.length + " eligible.");

  return { eligible, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// attemptPrimaryRetry_ -- ENTRY POINT, the actual reopen action.
//
// IMPORTANT -- this does NOT automatically improve a rating. It computes
// what the suggestion WOULD be from new primary evidence accumulated
// since the original decision, and returns that comparison for a
// teacher to act on. The actual SCRDecisionLog append only happens if
// the teacher explicitly calls confirmRetryImprovement_() afterward
// (separate function below) -- consistent with every other decision
// point in this system never auto-committing without a human action.
//
// Returns one of:
//   { retryPossible: false, reason: "..." }
//   { retryPossible: true, currentOfficialRating, newSuggestedRating,
//     improved: boolean, newEvidence: {...} }
// ---------------------------------------------------------------------------
function attemptPrimaryRetry_(studentEmail, primaryCompetencyId) {
  const eligibility = checkRetryEligibility_(studentEmail, primaryCompetencyId);
  if (!eligibility.eligible) {
    return { retryPossible: false, reason: eligibility.reason };
  }

  // Reuse the primary evidence counts checkRetryEligibility_ already
  // computed -- no need to re-read and re-aggregate CompetencyEvidence
  // a second time for the same student+competency pair in the same call.
  const primaryCounts = eligibility.primaryEvidence;
  const newResult = computeSuggestion_(primaryCounts);

  const currentOfficialRating = eligibility.currentOfficialRating;
  // Lower is better on this scale -- "improved" means the new suggested
  // rating is a SMALLER number than the current official one, and is
  // not null (INSUFFICIENT_EVIDENCE can't be an improvement over a real
  // rating, even though it's not technically comparable as a number).
  const improved = newResult.suggestedRating !== null &&
    newResult.suggestedRating < currentOfficialRating;

  return {
    retryPossible: true,
    currentOfficialRating,
    newSuggestedRating: newResult.suggestedRating,
    improved,
    newEvidence: primaryCounts,
  };
}

// ---------------------------------------------------------------------------
// confirmRetryImprovement_ -- ENTRY POINT. Called by the teacher-facing
// surface AFTER reviewing attemptPrimaryRetry_'s result, only when
// improved === true and the teacher chooses to accept it.
//
// This is the actual "gets overwritten" moment (Default #1): appends a
// NEW row to SCRDecisionLog with decision_type RETRY_IMPROVED. Does NOT
// touch the original decision row -- that row remains, permanently, as
// the historical record that the student's first attempt resulted in
// the original rating. The SCRSuggestions row's CONFIRMED_RATING is
// updated to the new value so exports and dashboard views reflect the
// improved rating as current -- but SCRDecisionLog's full history is
// what a compliance audit would actually read if it ever needed to see
// that a retry occurred at all.
// ---------------------------------------------------------------------------
function confirmRetryImprovement_(studentEmail, primaryCompetencyId, teacherEmail) {
  const retryResult = attemptPrimaryRetry_(studentEmail, primaryCompetencyId);
  if (!retryResult.retryPossible) {
    return { success: false, error: retryResult.reason };
  }
  if (!retryResult.improved) {
    return { success: false, error: "New evidence does not show improvement over the current official rating (" +
      retryResult.currentOfficialRating + "). Nothing to confirm." };
  }

  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  const decisionLogSheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");

  const data = suggestionsSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SCRS.STUDENT_EMAIL]).trim().toLowerCase() === studentEmail.toLowerCase() &&
        String(data[i][SCRS.COMPETENCY_ID]).trim() === primaryCompetencyId) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) {
    return { success: false, error: "SCRSuggestions row not found -- cannot record retry result." };
  }

  const now = new Date();

  // -- Update the CURRENT-VIEW row -- this is the only place in this
  // extension that overwrites a cell in place, and it's deliberate: the
  // SCRSuggestions row represents CURRENT STATE for dashboard/export
  // purposes, the same role it has always played. The append-only
  // PERMANENT record is SCRDecisionLog, appended right below. --
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_RATING + 1).setValue(retryResult.newSuggestedRating);
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_AT + 1).setValue(now);
  suggestionsSheet.getRange(rowIndex, SCRS.CONFIRMED_BY + 1).setValue(teacherEmail);

  // -- Append the permanent retry record --
  const evidenceSnapshot = "MET:" + retryResult.newEvidence.metCount +
    " NOT_MET:" + retryResult.newEvidence.notMetCount +
    " PARTIALLY_MET:" + retryResult.newEvidence.partialCount +
    " (retry -- previous official rating: " + retryResult.currentOfficialRating + ")";

  decisionLogSheet.appendRow([
    generateDecisionId_(),
    studentEmail,
    primaryCompetencyId,
    retryResult.newSuggestedRating, // what the retry suggested
    retryResult.newSuggestedRating, // final -- teacher accepted it as-is
    "RETRY_IMPROVED",
    now,
    teacherEmail,
    evidenceSnapshot,
    "", // archive_status (Say/Do Ledger cas-ccps Extension 3) -- blank until aged out
  ]);

  Logger.log("[S30b] Retry confirmed -- " + studentEmail + " | " + primaryCompetencyId +
    " | " + retryResult.currentOfficialRating + " -> " + retryResult.newSuggestedRating +
    " | by: " + teacherEmail);

  return { success: true, previousRating: retryResult.currentOfficialRating, newRating: retryResult.newSuggestedRating };
}

// ---------------------------------------------------------------------------
// createLessonPrimarySecondaryTab_ -- MANUAL, one-time setup.
// ---------------------------------------------------------------------------
function createLessonPrimarySecondaryTab_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const tabName = cfg.tabs.lessonPrimarySecondary || "LessonPrimarySecondary";

  if (ss.getSheetByName(tabName)) {
    Logger.log("[S30b] Tab '" + tabName + "' already exists -- skipping.");
    return;
  }
  const sheet = ss.insertSheet(tabName);
  sheet.getRange(1, 1, 1, 3)
    .setValues([["lesson_unit_id", "primary_competency_id", "secondary_competency_ids"]])
    .setFontWeight("bold")
    .setBackground("#f3f3f3");
  sheet.setFrozenRows(1);
  Logger.log("[S30b] Created tab: " + tabName);
}

// =============================================================================
// REQUIRED CHANGE TO FLOW 2 (15b_StudioFlowPrompts_Flow2_Revised.js)
// =============================================================================
//
// CompetencyEvidence needs ONE new column: evidence_role (PRIMARY |
// SECONDARY). Flow 2's Step 5b, when writing each evidence row, must
// look up the assignment's lesson_unit_id (this needs to be threaded
// through -- currently Step 2's TeacherMatrix lookup does not carry a
// lesson_unit_id; ConfigID identifies the ASSIGNMENT, and the
// assignment's relationship to a pacing-guide lesson_unit_id is not
// currently captured anywhere in TeacherMatrix). To know whether a given
// milestone's competency_id is PRIMARY or SECONDARY for this lesson,
// Flow 2 needs to look it up in LessonPrimarySecondary by lesson_unit_id
// -- which means TeacherMatrix needs a lesson_unit_id column added at
// confirmation time (a teacher selecting which pacing-guide lesson this
// assignment belongs to), the same way it gained four competency-ID
// columns in Module 5's first build pass (reconciliation decision 6 —
// this script's module label was Module 3, renumbered to Module 5).
//
// THIS IS A REAL, NOT-YET-CLOSED DEPENDENCY -- naming it explicitly
// rather than assuming Flow 2's existing widened lookup already covers
// it, because it does not. Flagged here as the next concrete gap, the
// same way the Step 3b relay connector and the getSheetConfig_() gap
// were each flagged and then closed in turn earlier in this session.
//
// =============================================================================
