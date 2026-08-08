// =============================================================================
// FILE: 19_ClonedSheetConfig_M6_ADDENDUM.js
// PURPOSE: M6 addition to 19_ClonedSheetConfig.js — Known Gaps #2
//          (lesson_unit_id), Round 2 reconciliation decision C1.
//
// Same unmerged-patch convention as 19_ClonedSheetConfig_M5_ADDENDUM.js:
// this file documents one more line added to the object returned inside
// getSheetConfig_(), layered on top of that M5 addendum's four
// confirmEntryComp1..4 lines. Nothing else in that function changes.
//
// "M6" is a file-naming label only (matching the "_M6_ADDENDUM" suffix
// convention already used for M2/M4/M5), not a new pedagogical module —
// there is no CAS_Module6_Documentation and none is planned.
// =============================================================================

/*
  // -- inside getSheetConfig_(), immediately after the four M5
  // confirmEntryComp1..4 lines, the returned object gains one more line: --
    confirmEntryComp1: map["CONFIRM_ENTRY_COMP_1"] || "",
    confirmEntryComp2: map["CONFIRM_ENTRY_COMP_2"] || "",
    confirmEntryComp3: map["CONFIRM_ENTRY_COMP_3"] || "",
    confirmEntryComp4: map["CONFIRM_ENTRY_COMP_4"] || "",

    // -- M6 -- lesson-unit dropdown entry ID. Same hardcoded-line
    // requirement as every other entry in this function — see the M5
    // addendum's header note on why this function does not generalize
    // over key names.
    confirmEntryLessonUnit: map["CONFIRM_ENTRY_LESSON_UNIT"] || "",
*/
