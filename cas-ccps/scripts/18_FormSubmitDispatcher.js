// =============================================================================
// FILE: 18_FormSubmitDispatcher.js
// BOUND TO: Central Ledger spreadsheet
//           (same project as Scripts 00+02+03+04+06+10)
// PURPOSE: Single installable trigger entry point that dispatches to both
//          form handlers. Named dispatchFormSubmit (not onFormSubmit) to
//          avoid conflict with Apps Script's reserved simple trigger name.
//
// TRIGGER: Set installable trigger → onFormSubmit event → dispatchFormSubmit
//          Do NOT use the simple trigger onFormSubmit — it conflicts with
//          the installable trigger and both may fire unexpectedly.
// =============================================================================

function dispatchFormSubmit(e) {
  // Dispatch to both handlers. Each checks namedValues and exits if wrong form.
  // Script 02: checks for "Student Google Account" — Form 1 (student intake)
  // Script 04: checks for "Your Google Account"   — Form 2 (turn-in)
  try {
    onFormSubmit_Intake(e);
  } catch (err) {
    Logger.log("[DISPATCH] Form1 handler error: " + err.message);
  }
  try {
    onTurnInSubmit(e);
  } catch (err) {
    Logger.log("[DISPATCH] Form2 handler error: " + err.message);
  }
}
