// ⚠️ CONSOLIDATION NOTE (added when filing this into the repo, not part
// of the original upload): This file is stylistically and functionally
// inconsistent with the other 8 numbered v8.0 files. See kos-personal's
// README/known-gaps section for the full explanation before deploying
// this alongside 1-9. Preserved byte-for-byte below the line.
//
// ⚠️ SUPERSEDED (reconciliation decision 2): rebuilt from scratch as
// ../10_Turnstile.gs against CFG.STAGING_COLS and the PENDING_FLOW /
// STUDIO_ACTIVE / FLOW_COMPLETE lifecycle the other 9 files actually use.
// This version's schema (Status/Payload columns, PENDING_INFERENCE/
// IN_PROCESS values, ID_BRAIN_TRUST_INDEX property key) does not match
// the real STAGING_PIPELINE sheet and must not be deployed. Archived
// here for history only.
// ================================================================

/**
 * ============================================================
 * CE-CODE: Matrix_Turnstile_Engine v1.5
 * * DESCRIPTION:
 * Pure State-Machine. No external trigger cells.
 * Monitors Column E (Payload) for congestion.
 * Releases exactly one PENDING_INFERENCE to IN_PROCESS.
 * ============================================================
 */

function runMatrixTurnstile() {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return; }

  try {
    const props = PropertiesService.getScriptProperties();
    const matrixId = props.getProperty('ID_BRAIN_TRUST_INDEX');
    if (!matrixId) throw new Error("ID_BRAIN_TRUST_INDEX not found.");

    const ss = SpreadsheetApp.openById(matrixId);
    const sheet = ss.getSheetByName('STAGING_PIPELINE');
    if (!sheet) throw new Error("STAGING_PIPELINE sheet not found.");

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return;

    const cleanHeaders = data[0].map(h => String(h).trim());
    const fileIdColIdx = cleanHeaders.indexOf('Status'); // Column D
    const stateStringColIdx = cleanHeaders.indexOf('Payload'); // Column E

    if (fileIdColIdx === -1 || stateStringColIdx === -1) {
      throw new Error("Columns 'Status' or 'Payload' missing from Row 1.");
    }

    // 1. CONGESTION CHECK
    let isSystemBusy = data.some(row => String(row[stateStringColIdx]).trim() === 'IN_PROCESS');

    if (isSystemBusy) {
      console.log("[CONGESTION] System is currently processing a task. Standing by.");
      return;
    }

    // 2. TURNSTILE RELEASE
    let targetRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][stateStringColIdx]).trim() === 'PENDING_INFERENCE') {
        targetRowIndex = i + 1;
        break;
      }
    }

    // 3. THE FLIP
    if (targetRowIndex !== -1) {
      sheet.getRange(targetRowIndex, stateStringColIdx + 1).setValue('IN_PROCESS');

      // Flush is mandatory to ensure Workspace Studio sees the change
      SpreadsheetApp.flush();

      console.log(`[RELEASE] Row ${targetRowIndex} flipped to IN_PROCESS. Matrix handoff initialized.`);
    } else {
      console.log("Queue Clear: No pending tasks.");
    }

  } catch (error) {
    console.error(`[CRITICAL] Turnstile Failure: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}
