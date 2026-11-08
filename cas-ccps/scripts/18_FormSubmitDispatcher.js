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
// TRIGGER: installFormSubmitTrigger() installs it: on form submit, on the
//          Central Ledger (the intake form's response sheet), handler
//          dispatchFormSubmit. Before 2026-11-08 it was added by hand in the
//          Triggers panel. Do NOT use the simple trigger onFormSubmit — it
//          conflicts with the installable trigger and both may fire
//          unexpectedly.
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

/**
 * Installs dispatchFormSubmit on the Central Ledger's form submissions, once.
 * Only needed when students use the intake form. Safe to run again.
 */
function installFormSubmitTrigger() {
  const fn = "dispatchFormSubmit";
  const have = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === fn && String(t.getEventType()) === String(ScriptApp.EventType.ON_FORM_SUBMIT);
  });
  let message;
  if (have) {
    message = fn + " already runs on form submit.";
  } else {
    // The bound Ledger when run from its editor; by ID otherwise.
    let ss = null;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
    if (!ss) ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
    ScriptApp.newTrigger(fn).forSpreadsheet(ss).onFormSubmit().create();
    message = fn + " installed: on form submit, on the Central Ledger.";
  }
  Logger.log("[DISPATCH] " + message);
  return { installed: !have, message: message };
}
