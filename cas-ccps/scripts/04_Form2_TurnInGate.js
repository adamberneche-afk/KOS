// =============================================================================
// FILE: 04_Form2_TurnInGate.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
//
// RETIRED TURN-IN GATE (P0-04, 2026-10-10, meta/PRD_CAS_RESEARCH_PIVOT.md).
// This file used to hold onTurnInSubmit(), the Turn-In Form (Form 2)
// handler. Students turn in on Canvas and never see that form, and its
// checks were weak: it trusted a "[SYSTEM: APPROVED]" stamp anywhere in a
// student-editable doc, matched an account the student typed, and its
// revision-timing "forensic" check passed on any two quick autosaves and
// passed outright when the Drive API failed. 18_FormSubmitDispatcher.js no
// longer calls it, and the handler, its rejection/notification helpers and
// runForensicCheck_() are gone (cas-ccps/HISTORY.md, P0-04).
//
// What stays here are helpers other files call, kept in place so no caller
// changes: findLedgerRow_ (37), scanCompliance_ (07, 15c),
// extractSuggestedScore_ (15b, 35, 37, 15c), _ensureTurnInReviewColumns_
// (many), _lockDocAfterSubmission_ (25) and extractFileId_ (05, 07).
// =============================================================================

// ---------------------------------------------------------------------------
// findLedgerRow_
// ---------------------------------------------------------------------------
function findLedgerRow_(cfg, googleId, fileId, configId) {
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (
      data[i][1].toString().toLowerCase() === googleId.toLowerCase() &&
      data[i][2].toString()               === configId               &&
      data[i][3].toString()               === fileId
    ) {
      return {
        rowIndex:     i + 1,
        googleId:     data[i][1],
        configId:     data[i][2],
        fileId:       data[i][3],
        studentName:  data[i][4],
        block:        data[i][5],
        className:    data[i][6],
        teacherName:  data[i][7],
        teacherEmail: data[i][8],
        period:       data[i][11],
        courseName:   data[i][10]
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// scanCompliance_
// ---------------------------------------------------------------------------
function scanCompliance_(docText) {
  if (docText.indexOf("[SYSTEM: APPROVED]")          !== -1) return "APPROVED";
  if (docText.indexOf("[SYSTEM: REVISION_REQUIRED]") !== -1) return "REVISION_REQUIRED";
  return "NONE";
}

// ---------------------------------------------------------------------------
// extractSuggestedScore_ (Say/Do Ledger cas-ccps finding #1)
//
// Reads Flow 2's new [SUGGESTED_SCORE: N] marker — a completeness/effort read
// adapted from the Warm-Up pipeline's 0-3 ENGAGEMENT band (25_WarmUpWriter.js),
// scoped to N ∈ {2,3,4} for an already-APPROVED submission (1 and 5 are
// reserved for a teacher's own judgment — see 30_SCRSuggestionEngine.js's
// identical reserved-tier convention for competency SCR ratings — Flow 2's
// prompt spec is written to never emit either).
//
// Returns the integer score, or null if the marker isn't present — which is
// the expected, handled case for every submission evaluated before this
// marker existed in the live Studio Flow (the prompt-text change in
// 15_StudioFlowPrompts.js/15b_StudioFlowPrompts_Flow2_Revised.js only takes
// effect once someone manually re-pastes it into the deployed Flow 2 — see
// those files' own "NOT A DEPLOYED SCRIPT" banners). A submission with no
// suggested score still lands in PENDING_TEACHER_REVIEW; the teacher just
// has no "accept as suggested" fast path and must enter a score directly via
// Override.
// ---------------------------------------------------------------------------
function extractSuggestedScore_(docText) {
  const m = docText.match(/\[SUGGESTED_SCORE:\s*([2-4])\]/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// _ensureTurnInReviewColumns_ (Say/Do Ledger cas-ccps finding #1)
//
// Idempotently adds the 4 columns the turn-in review flow needs (columns
// 20-23) if they aren't already there — self-heals an already-deployed
// Ledger created before this feature existed, rather than requiring every
// admin to manually re-run a migration step. Safe to call on every write;
// a no-op once the header row already has them.
// ---------------------------------------------------------------------------
function _ensureTurnInReviewColumns_(sheet) {
  const headerRange = sheet.getRange(1, 20, 1, 4);
  const existing     = headerRange.getValues()[0];
  if (existing[0] !== "SuggestedScore") {
    headerRange.setValues([["SuggestedScore", "FinalScore", "ScoreDecidedBy", "ScoreDecidedAt"]]);
  }
}

// =============================================================================
// _lockDocAfterSubmission_ (central-ledger only: it needs the Drive scope,
// which the student-run master-student-template project must not ask for) — student-data access policy, rule 2: only the
// student edits, and only before submission. Called once a submission is
// final (a passing turn-in, or a warm-up whose extra-credit window closed).
// Every editor other than the file's owner becomes a viewer, so the
// student keeps reading their work and its feedback but can't change it;
// the assigning teacher, if given, ends as a commenter (rule 3: feedback
// comes from the assigning teacher). Works from the file's own permission
// list, so it doesn't depend on which column holds the student's account.
//
// Returns { locked: [emails], failed: [{email, error}] }. Never throws:
// the submission itself has already been recorded, and a failure here is
// reported to the caller instead of undoing it.
// =============================================================================
function _lockDocAfterSubmission_(fileId, teacherEmail) {
  const out = { locked: [], failed: [] };
  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) {
    out.failed.push({ email: "", error: "could not open file " + fileId + ": " + e.message });
    return out;
  }
  let owner = "";
  try { owner = String(file.getOwner().getEmail() || "").toLowerCase(); } catch (e) { /* shared drive: no owner */ }
  const teacher = String(teacherEmail || "").trim().toLowerCase();

  file.getEditors().forEach(function (u) {
    const email = String(u.getEmail() || "").toLowerCase();
    if (!email || email === owner) return;
    try {
      file.removeEditor(email);
      if (email === teacher) file.addCommenter(email);
      else file.addViewer(email);
      out.locked.push(email);
    } catch (e) {
      out.failed.push({ email: email, error: e.message });
    }
  });
  if (teacher && teacher !== owner) {
    try { file.addCommenter(teacher); } catch (e) { out.failed.push({ email: teacher, error: e.message }); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// extractFileId_
// ---------------------------------------------------------------------------
function extractFileId_(url) {
  let m = url.match(/\/d\/([a-zA-Z0-9_-]{25,})/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
  return m ? m[1] : null;
}
