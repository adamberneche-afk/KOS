// ================================================================
// KOS_GAPS_AND_FIXES.gs — REFERENCE DOCUMENT ONLY
// ================================================================
// ⚠ DO NOT ADD THIS FILE TO THE GAS PROJECT.
//
// This file was a temporary gap-tracking document. All fixes it
// described have been applied directly to the source files:
//
//   FIX-01  resetProperties duplicate
//           → removed from 1_Config_And_Deploy.gs
//
//   FIX-02  onGovernanceEdit trigger not installed
//           → added to setupAllTriggers() in 1_Config_And_Deploy.gs
//
//   FIX-03  processInferenceQueue TIER_2 → TIER_1
//           → applied in 3_Queue_Processor.gs line 71
//
//   FIX-04  _semanticChunker plain-text fallback
//           → _semanticChunker() + _splitAtWordBoundary()
//             replaced in 5_Error_And_Utilities.gs
//
//   FIX-05  KOS_ADMIN_EMAIL capture during onboarding
//           → handled by completeOnboarding() in 7_WebApp.gs
//
//   FIX-06  generateSessionVectorPrimer() alias
//           → added to 9_UI_Diagnostics.gs
//
//   FIX-07  MATRIX_LEDGER 7→9 col migration
//           → runPhase0Migration() updated in KOS_PHASE0_PATCHES.gs
//
// STUDIO INTEGRATION CONTRACT (still requires external work)
// ─────────────────────────────────────────────────────────────
// KOS creates STAGING_PIPELINE rows with Status = PENDING_FLOW
// and a File_ID pointing to a chunk doc containing raw text.
//
// Workspace Studio must:
//   1. Poll STAGING_PIPELINE for PENDING_FLOW rows
//      (col map: 0=Timestamp, 1=Payload_UID, 2=Payload_Type,
//       3=Doc_URL, 4=File_ID, 5=Status, 6=Retry_Count)
//   2. Open the Drive doc at File_ID, read raw text, run inference
//   3. Replace doc content with inference JSON
//   4. Set Status cell in STAGING_PIPELINE to FLOW_COMPLETE
//
// JSON schema Studio must produce — see processIntakePayload()
// in 3_Queue_Processor.gs for the full pd.* property map.
//
// Until Studio integration is live, use devSetFlowComplete(rowNum)
// in 3_Queue_Processor.gs to manually advance rows for testing.
// ================================================================
