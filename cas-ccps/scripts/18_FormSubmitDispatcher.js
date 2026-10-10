// =============================================================================
// FILE: 18_FormSubmitDispatcher.js
// BOUND TO: Central Ledger spreadsheet
//           (same project as Scripts 00+02+03+04+06+10)
// PURPOSE: Single installable trigger entry point for the Ledger's form
//          submissions. Named dispatchFormSubmit (not onFormSubmit) to
//          avoid conflict with Apps Script's reserved simple trigger name.
//
// Only the intake form (Form 1) is handled. The Turn-In Form (Form 2) was
// retired on 2026-10-10 (P0-04): students turn in on Canvas, and its
// handler is gone from 04. A Form 2 submission now reaches only
// onFormSubmit_Intake, which skips it (no "Student Google Account" field).
//
// TRIGGER: Set installable trigger → onFormSubmit event → dispatchFormSubmit
//          Do NOT use the simple trigger onFormSubmit — it conflicts with
//          the installable trigger and both may fire unexpectedly.
// =============================================================================

function dispatchFormSubmit(e) {
  // Script 02 checks for "Student Google Account" — Form 1 (student intake)
  // — and exits on anything else.
  try {
    onFormSubmit_Intake(e);
  } catch (err) {
    Logger.log("[DISPATCH] Form1 handler error: " + err.message);
  }
}
