// =============================================================================
// FILE: 20_SetupCheckpoint.js
// INCLUDED IN: Unified Manual project (same project as Script 16)
// PURPOSE: Transaction-safe checkpoint system for the setup wizard.
//          Tracks which asset creation steps have completed successfully.
//          If setup fails mid-run, re-running resumes from the last
//          successful checkpoint rather than re-creating assets.
//
// CHECKPOINT KEYS (stored in Script Properties):
//   CHECKPOINT_ADMIN_FOLDER     — Assignments root folder created
//   CHECKPOINT_ADMIN_LEDGER     — Central ledger spreadsheet created
//   CHECKPOINT_ADMIN_TEMPLATES  — Master template sheets created
//   CHECKPOINT_ADMIN_TURNIN     — Turn-in form created
//   CHECKPOINT_TEACHER_FOLDER   — Teacher folder created
//   CHECKPOINT_TEACHER_RUBRIC   — Rubric response sheet cloned
//   CHECKPOINT_TEACHER_MATRIX   — Teacher matrix sheet cloned
//   CHECKPOINT_TEACHER_FORMS    — Teacher forms created
//   CHECKPOINT_TEACHER_REGISTRY — MatrixRegistry entry written
// =============================================================================

// ---------------------------------------------------------------------------
// checkpoint_ — marks a step as complete, storing the result value
// ---------------------------------------------------------------------------
function checkpoint_(key, value) {
  PropertiesService.getScriptProperties().setProperty(
    "CHECKPOINT_" + key,
    JSON.stringify({ value: value, ts: new Date().toISOString() })
  );
  Logger.log("[CHECKPOINT] " + key + " = " + (typeof value === "string" ? value : JSON.stringify(value)));
}

// ---------------------------------------------------------------------------
// getCheckpoint_ — retrieves a previously stored checkpoint value
// Returns null if the checkpoint hasn't been set
// ---------------------------------------------------------------------------
function getCheckpoint_(key) {
  const raw = PropertiesService.getScriptProperties().getProperty("CHECKPOINT_" + key);
  if (!raw) return null;
  try {
    return JSON.parse(raw).value;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// clearCheckpoints_ — wipes all checkpoint state
// Called at the start of a fresh setup run or after successful completion
// ---------------------------------------------------------------------------
function clearCheckpoints_(prefix) {
  const props = PropertiesService.getScriptProperties().getProperties();
  const toDelete = Object.keys(props).filter(k => k.startsWith("CHECKPOINT_" + (prefix || "")));
  toDelete.forEach(k => PropertiesService.getScriptProperties().deleteProperty(k));
  Logger.log("[CHECKPOINT] Cleared " + toDelete.length + " checkpoint(s).");
}

// ---------------------------------------------------------------------------
// hasPartialSetup_ — returns true if any checkpoints exist, indicating
// a previous setup run that didn't complete
// ---------------------------------------------------------------------------
function hasPartialSetup_(prefix) {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).some(k => k.startsWith("CHECKPOINT_" + (prefix || "")));
}

// ---------------------------------------------------------------------------
// resumeOrCreate_ — checkpoint-aware asset creation helper
// If the checkpoint exists, returns the stored value without re-creating.
// Otherwise, calls createFn(), stores the result, and returns it.
//
// Usage:
//   const folderId = resumeOrCreate_("ADMIN_FOLDER", () => {
//     return DriveApp.createFolder("Assignments").getId();
//   });
// ---------------------------------------------------------------------------
function resumeOrCreate_(key, createFn) {
  const existing = getCheckpoint_(key);
  if (existing) {
    Logger.log("[CHECKPOINT] Resuming from checkpoint: " + key + " = " + existing);
    return existing;
  }
  const result = createFn();
  checkpoint_(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// verifyCheckpoints_ — validates that checkpointed assets still exist
// Returns list of keys whose assets are now missing (e.g. manually deleted)
// ---------------------------------------------------------------------------
function verifyCheckpoints_() {
  const issues = [];

  const ledgerId = getCheckpoint_("ADMIN_LEDGER");
  if (ledgerId) {
    try { SpreadsheetApp.openById(ledgerId); }
    catch (e) { issues.push("Central Ledger (ADMIN_LEDGER)"); }
  }

  const folderId = getCheckpoint_("ADMIN_FOLDER");
  if (folderId) {
    try { DriveApp.getFolderById(folderId); }
    catch (e) { issues.push("Assignments Folder (ADMIN_FOLDER)"); }
  }

  return issues;
}
