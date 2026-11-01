// =============================================================================
// FILE: 30b_SCRRetryRemediation.js
// BOUND TO: Central Ledger spreadsheet (same project as Script 30)
// PURPOSE: The SCR retry from the central-ledger side: the bulk scan the CAS
//          attention signal counts (34b), and an editor-run confirm. The
//          rule itself, and the check both dashboards run, live in
//          00_SharedConfig.js ("THE SCR RULE AND THE SCR RETRY") since
//          2026-11-01 (D15), so the Teacher Dashboard's student page and the
//          Student Dashboard's Competencies tab apply the same one.
//
// THE GOAL THIS SERVES: every student should reach at least an SCR of 2 on
// every required competency. A student rated 3 or 4 on a competency isn't
// stuck there: enough evidence on it and on the competencies linked to it
// unlocks a re-rating; a better result becomes the official rating; the
// original rating is never erased, only superseded (an appended
// SCRDecisionLog row, RETRY_IMPROVED).
//
// WHAT CHANGED 2026-11-01 (D15, the operator's decisions):
//   - Primary and secondary come from each assignment's milestones
//     (milestone 1 primary, 2 and 3 secondary), not a LessonPrimarySecondary
//     tab and an evidence_role column. Neither was ever made or written, so
//     no student could become eligible and the attention signal's count was
//     always 0. data/LessonPrimarySecondary_Seed.csv is superseded.
//   - The re-rating is the rule's rating from ALL of the competency's
//     evidence, as 30's weekly run rates it ("all of it").
//   - The teacher confirms on the Teacher Dashboard's student page; the
//     student sees what still unlocks a re-rating on their Competencies tab.
//
// THE THRESHOLDS (provisional, unvalidated defaults; cas-ccps/README.md):
// 5 or more pieces MET across the primary and its linked secondaries, and 2
// secondary pieces MET for every primary piece NOT_MET (a ratio, so one miss
// doesn't block a student who has shown plenty elsewhere).
//
// ENTRY POINTS:
//   checkRetryEligibility_(studentEmail, competencyId, cache)
//       -- read-only; the rating from SCRSuggestions. cache ({}) shares one
//          read of the evidence and the matrices across many calls.
//   getAllRetryEligibleStudents_()   -- bulk scan of every rating of 3 or 4
//   attemptPrimaryRetry_(studentEmail, competencyId)
//       -- what a re-rating would give; changes nothing
//   confirmRetryImprovement_(studentEmail, competencyId, teacherEmail)
//       -- the re-rating, for the signed-in teacher who owns the rating
// =============================================================================

// The pairs a retry can apply to: a teacher-decided rating of 3 or 4.
// Shared with the CAS attention signal's daily retry scan (34b).
function retryCandidates_(data) {
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
  return candidates;
}

// The SCRSuggestions row for one pair: { rowIndex (1-based), row } or null.
function _retrySuggestionRow_(data, studentEmail, competencyId) {
  const email = String(studentEmail || "").trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][SCRS.STUDENT_EMAIL]).trim().toLowerCase() === email &&
        String(data[i][SCRS.COMPETENCY_ID]).trim() === competencyId) {
      return { rowIndex: i + 1, row: data[i] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// checkRetryEligibility_ -- read-only. { eligible, reason, ... } with
// scrRetryStatus_'s fields (00) when the pair has a decided rating.
// ---------------------------------------------------------------------------
function checkRetryEligibility_(studentEmail, competencyId, cache) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  if (!suggestionsSheet) return { eligible: false, reason: "SCRSuggestions tab not found." };
  const c = cache || {};
  if (!c.suggestions) c.suggestions = suggestionsSheet.getDataRange().getValues();
  const found = _retrySuggestionRow_(c.suggestions, studentEmail, competencyId);
  if (!found) return { eligible: false, reason: "No existing suggestion/decision record for this student and competency." };

  const status = String(found.row[SCRS.STATUS]).trim();
  if (status !== "CONFIRMED" && status !== "OVERRIDDEN") {
    return { eligible: false, reason: "This competency is not yet decided (status: " + status +
      "). A retry only applies to a confirmed or overridden rating." };
  }
  const rating = Number(found.row[SCRS.CONFIRMED_RATING]);
  if (!c.ctx) c.ctx = scrRetryContext_(ss, cfg);
  const st = scrRetryStatus_(c.ctx, studentEmail, competencyId, rating);
  if (!st.applies) {
    return { eligible: false, currentOfficialRating: rating,
      reason: "The rating is " + rating + "; a retry applies only to a rating of 3 or 4." };
  }
  return Object.assign({ currentOfficialRating: rating }, st);
}

// ---------------------------------------------------------------------------
// getAllRetryEligibleStudents_ -- every pair rated 3 or 4 that is eligible
// now. One read of the evidence and the matrices for the whole scan.
// ---------------------------------------------------------------------------
function getAllRetryEligibleStudents_() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
  if (!suggestionsSheet) return { error: "SCRSuggestions tab not found." };
  const cache = { suggestions: suggestionsSheet.getDataRange().getValues() };
  const candidates = retryCandidates_(cache.suggestions);
  const eligible = [];
  for (const c of candidates) {
    const result = checkRetryEligibility_(c.studentEmail, c.competencyId, cache);
    if (result.eligible) eligible.push(Object.assign({}, c, result));
  }
  Logger.log("[S30b] Retry eligibility scan: " + candidates.length +
    " candidate(s) at rating 3/4 checked, " + eligible.length + " eligible.");
  return { eligible: eligible, generatedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// attemptPrimaryRetry_ -- what a re-rating would give. Changes nothing: the
// rating changes only through confirmRetryImprovement_ (or the Teacher
// Dashboard's teacherConfirmScrRetry), a teacher's action.
// ---------------------------------------------------------------------------
function attemptPrimaryRetry_(studentEmail, competencyId, cache) {
  const eligibility = checkRetryEligibility_(studentEmail, competencyId, cache);
  if (!eligibility.eligible) return { retryPossible: false, reason: eligibility.reason };
  return {
    retryPossible: true,
    currentOfficialRating: eligibility.currentOfficialRating,
    newSuggestedRating: eligibility.newRating,
    improved: eligibility.improved,
    status: eligibility,
  };
}

// ---------------------------------------------------------------------------
// confirmRetryImprovement_ -- the re-rating. Rule 3 first (the signed-in
// teacher, who owns the rating); then, under the script lock, the check is
// run again and the SCRSuggestions row's current rating is updated and a
// RETRY_IMPROVED row appended to SCRDecisionLog (the permanent record; the
// original decision row stays).
// ---------------------------------------------------------------------------
function confirmRetryImprovement_(studentEmail, competencyId, teacherEmail) {
  const refusal = _scrDecisionRefusal_(getConfig_(), teacherEmail, studentEmail, competencyId);
  if (refusal) return { success: false, error: refusal };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { success: false, error: "Another change is being saved. Try again in a moment." };
  try {
    const retry = attemptPrimaryRetry_(studentEmail, competencyId);
    if (!retry.retryPossible) return { success: false, error: retry.reason };
    if (!retry.improved) {
      return { success: false, error: "The evidence does not give a better rating than the current one (" +
        retry.currentOfficialRating + "). Nothing to confirm." };
    }
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const suggestionsSheet = ss.getSheetByName(cfg.tabs.scrSuggestions || "SCRSuggestions");
    const decisionLogSheet = ss.getSheetByName(cfg.tabs.scrDecisionLog || "SCRDecisionLog");
    if (!decisionLogSheet) return { success: false, error: "SCRDecisionLog tab not found." };
    const found = _retrySuggestionRow_(suggestionsSheet.getDataRange().getValues(), studentEmail, competencyId);
    if (!found) return { success: false, error: "SCRSuggestions row not found -- cannot record the retry." };

    const now = new Date();
    // SCRSuggestions is the current view (exports, dashboards); the
    // permanent record is the appended decision row.
    suggestionsSheet.getRange(found.rowIndex, SCRS.CONFIRMED_RATING + 1).setValue(retry.newSuggestedRating);
    suggestionsSheet.getRange(found.rowIndex, SCRS.CONFIRMED_AT + 1).setValue(now);
    suggestionsSheet.getRange(found.rowIndex, SCRS.CONFIRMED_BY + 1).setValue(teacherEmail);
    scrAppendRetryDecision_(decisionLogSheet, generateDecisionId_(), studentEmail, competencyId, retry.status, teacherEmail, now);

    Logger.log("[S30b] Retry confirmed -- SCRDecisionLog row " + decisionLogSheet.getLastRow() +
      " | " + competencyId + " | " + retry.currentOfficialRating + " -> " + retry.newSuggestedRating);
    return { success: true, previousRating: retry.currentOfficialRating, newRating: retry.newSuggestedRating };
  } finally {
    lock.releaseLock();
  }
}
