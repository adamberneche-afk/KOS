// =============================================================================
// FILE: 04_Form2_TurnInGate.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// PURPOSE: Three helpers left from the retired turn-in gate: scanCompliance_, extractSuggestedScore_ and _lockDocAfterSubmission_.
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
// What stays here are three helpers other files call: scanCompliance_ (15c,
// 39, 39d), extractSuggestedScore_ (15c, 35, 37) and _lockDocAfterSubmission_
// (25). findLedgerRow_, _ensureTurnInReviewColumns_ and extractFileId_ were
// deleted 2026-11-20 (meta/AUDIT_STRUCTURE_2026-11-20.md, 2.1): nothing in
// this project called them (07 and 05 keep their own copies, in other
// projects).
// =============================================================================

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
// archive/2026-27-Q2/cas-ccps/scripts/15_StudioFlowPrompts.js/15b_StudioFlowPrompts_Flow2_Revised.js only takes
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
      // The teacher's new share sends no email (plan L7, shareWithoutEmail_
      // in 02); a student's stays as it was.
      if (email === teacher) shareWithoutEmail_(file, email, "commenter");
      else file.addViewer(email);
      out.locked.push(email);
    } catch (e) {
      out.failed.push({ email: email, error: e.message });
    }
  });
  if (teacher && teacher !== owner) {
    try { shareWithoutEmail_(file, teacher, "commenter"); } catch (e) { out.failed.push({ email: teacher, error: e.message }); }
  }
  return out;
}

