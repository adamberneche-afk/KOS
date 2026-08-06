// =============================================================================
// FILE: 19_ClonedSheetConfig_M3_ADDENDUM.js
// PURPOSE: Module 3 addition to 19_ClonedSheetConfig.js
//
// THE GAP THIS CLOSES:
// getSheetConfig_() is a hardcoded, explicit return object -- not a
// generic key-transform loop. Adding new CONFIG keys anywhere upstream
// (Script 16 writing them, Script 08 reading them) does nothing on its
// own; this function must be told about each new key by name, in this
// exact spot, or the corresponding cfg.* field is silently undefined.
// This was flagged as an open assumption in the Module 3 work on Scripts
// 08 and 16, then verified against the real source: there is no
// transform to inherit, only this explicit list to extend.
//
// THIS REPLACES the return statement inside getSheetConfig_() in
// 19_ClonedSheetConfig.js. Everything else in that function -- the
// try/catch, the _CONFIG tab read loop, the getConfig_() fallback -- is
// unchanged. Only four new lines are added to the returned object,
// following the exact shape of the eight CONFIRM_ENTRY_* lines already
// there.
// =============================================================================

/*
  // -- inside getSheetConfig_(), the returned object becomes: --
  return {
    adminNotifyEmail: map["ADMIN_NOTIFY_EMAIL"] || "",
    adminSsId: map["ADMIN_SS_ID"] || "",
    ledgerSsId: map["CENTRAL_LEDGER_SS_ID"] || "",
    teacherName: map["TEACHER_NAME"] || "",
    teacherEmail: map["TEACHER_EMAIL"] || "",
    teacherMatrixSsId: map["TEACHER_MATRIX_SS_ID"] || "",
    rubricQueueTab: map["RUBRIC_QUEUE_TAB"] || "",
    confirmFormId: map["CONFIRM_REVIEW_FORM_ID"] || "",

    // Confirmation form entry IDs
    confirmEntryDraftId: map["CONFIRM_ENTRY_DRAFT_ID"] || "",
    confirmEntryUnitName: map["CONFIRM_ENTRY_UNIT_NAME"] || "",
    confirmEntryPersona: map["CONFIRM_ENTRY_PERSONA"] || "",
    confirmEntryM1: map["CONFIRM_ENTRY_MILESTONE_1"] || "",
    confirmEntryM2: map["CONFIRM_ENTRY_MILESTONE_2"] || "",
    confirmEntryM3: map["CONFIRM_ENTRY_MILESTONE_3"] || "",
    confirmEntryM4: map["CONFIRM_ENTRY_MILESTONE_4"] || "",
    confirmEntryDod: map["CONFIRM_ENTRY_DOD"] || "",

    // -- M3 -- four new competency dropdown entry IDs. Same hardcoded
    // shape as the eight lines above -- there is no shortcut here by
    // design; this function does not generalize over key names, so
    // every new CONFIG key needs its own explicit line, permanently.
    confirmEntryComp1: map["CONFIRM_ENTRY_COMP_1"] || "",
    confirmEntryComp2: map["CONFIRM_ENTRY_COMP_2"] || "",
    confirmEntryComp3: map["CONFIRM_ENTRY_COMP_3"] || "",
    confirmEntryComp4: map["CONFIRM_ENTRY_COMP_4"] || "",

    // Tab names -- consistent across all projects
    tabs: {
      ledger: "Ledger",
      reviewQueue: "ReviewQueue",
      stagingPipeline: "STAGING_PIPELINE",
      rubricQueue: "RubricQueue",
      teacherMatrix: "TeacherMatrix",
      draftUnits: "DraftUnits",
      matrixRegistry: "MatrixRegistry"
      // -- M3 -- competencyRegistry is intentionally NOT added here.
      // This tabs object is scoped to what Scripts 05 and 08 need inside
      // a CLONED per-teacher sheet project. CompetencyRegistry lives on
      // the shared Central Ledger, not on a cloned sheet, and is read
      // directly by ssId in buildCompetencyDropdownOptions_() (Script 16
      // addendum) rather than through this tabs lookup. Adding it here
      // would imply it's reachable the same way the other six tabs are
      // -- via the active cloned spreadsheet -- which it is not.
    }
  };
*/

// =============================================================================
// WHY THIS GAP EXISTED AND WHY IT WON'T RECUR SILENTLY NEXT TIME
// =============================================================================
//
// getSheetConfig_() and Script 00's getConfig_() (used by Scripts 22, 26,
// and 29 -- Modules 2 and 4) are TWO SEPARATE config mechanisms serving
// two different deployment contexts:
//
//   getConfig_()        -- Central Ledger project (one shared project,
//                          Script Properties work natively, no cloning)
//   getSheetConfig_()    -- cloned per-teacher sheet projects (Script
//                          Properties do NOT survive makeCopy(), so this
//                          function exists specifically to work around
//                          that by reading a _CONFIG tab instead)
//
// Any FUTURE Module 3 work that adds a new field to a CLONED sheet's
// config (anything touching the Rubric Response Sheet or Teacher Matrix
// Sheet specifically) must extend THIS function explicitly -- there is no
// way to make it generic without rewriting it, and rewriting a working,
// narrowly-scoped function to be generic "just in case" is not a fix
// this addendum makes, since it wasn't asked for and would touch more
// of the file than the actual gap requires.
//
// =============================================================================
