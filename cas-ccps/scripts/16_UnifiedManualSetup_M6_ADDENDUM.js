// =============================================================================
// FILE: 16_UnifiedManualSetup_M6_ADDENDUM.js
// PURPOSE: M6 additions to 16_UnifiedManualSetup.js — Known Gaps #2
//          (lesson_unit_id), Round 2 reconciliation decision C1.
//
// SCOPE: Builds on top of 16_UnifiedManualSetup_M5_ADDENDUM_v2.js's
// already-repaired Confirmation Form block — apply that addendum first,
// then apply this one. Adds one more dropdown item ("Lesson Unit"),
// sourced from the PacingGuide tab (Script 31's importPacingGuide()
// output — see 31_PacingGuideManager.js) on the Central Ledger, using the
// exact same options-builder / degrade-gracefully pattern the M5 addendum
// already established for the competency dropdowns.
//
// "M6" is a file-naming label only (matching the "_M6_ADDENDUM" suffix
// convention already used for M2/M4/M5), not a new pedagogical module —
// there is no CAS_Module6_Documentation and none is planned.
//
// KNOWN GAP CARRIED FORWARD FROM M5, UNCHANGED BY THIS ADDENDUM: neither
// this file nor the M5 addendum extends the TeacherMatrix/DraftUnits
// setHeaders_() calls in 16_UnifiedManualSetup.js's createTeacherAssets_()
// with the new column names (MILESTONE_*_COMPETENCY_ID, and now
// LessonUnitID) — those sheets' header ROW LABELS stay at their pre-M5
// column count even though 08_TeacherConfirmationStep.js's TM08/DU08
// index maps already read/write the additional columns by position.
// This is a cosmetic gap (missing header text on columns that are
// otherwise fully functional), not a functional one, and it predates
// this addendum — flagged here rather than silently fixed as part of an
// unrelated change.
// =============================================================================

// ---------------------------------------------------------------------------
// Paste this ONE line immediately after the M5 addendum's
// "addCompetencyDropdownItems_(confirmForm, centralSsId);" call, still
// inside createTeacherAssets_(), before "const matrixSs = ...":
// ---------------------------------------------------------------------------

/*
  addCompetencyDropdownItems_(confirmForm, centralSsId);
  // -- M6 -- one more dropdown, placed after the four M5 competency
  // dropdowns so the natural reading order is: review milestones, tag
  // competencies, then tag the lesson unit.
  addLessonUnitDropdownItem_(confirmForm, centralSsId);
*/

// ---------------------------------------------------------------------------
// Paste this REPLACEMENT over the M5 addendum's setHeaders_(confirmRespSheet, ...)
// call — adds one more trailing header, matching the one new form item:
// ---------------------------------------------------------------------------

/*
  setHeaders_(confirmRespSheet, [
    "Timestamp","Email Address","Draft ID","Assignment Name",
    "AI Coach Persona","Milestone 1","Milestone 2",
    "Milestone 3","Milestone 4","Passing Standard",
    "Competency — Milestone 1","Competency — Milestone 2",
    "Competency — Milestone 3","Competency — Milestone 4",
    // -- M6 -- one new trailing header, matching the one new form item --
    "Lesson Unit"
  ]);
*/

// ---------------------------------------------------------------------------
// -- M6 -- addLessonUnitDropdownItem_
// ---------------------------------------------------------------------------
function addLessonUnitDropdownItem_(confirmForm, centralSsId) {
  const options = buildLessonUnitDropdownOptions_(centralSsId);

  if (options.length === 0) {
    Logger.log("[M6] WARNING — PacingGuide returned zero options. The " +
      "Lesson Unit dropdown will be created EMPTY. Run importPacingGuide() " +
      "(Script 31) before teacher setup, or this field will block every " +
      "future confirmation submission since it is required and has " +
      "nothing to select.");
  }

  confirmForm.addListItem()
    .setTitle("Lesson Unit")
    .setChoiceValues(options)
    .setRequired(true)
    .setHelpText(
      "Select the pacing-guide lesson unit this assignment belongs to. " +
      "Never guessed by the system — always your call."
    );
}

// ---------------------------------------------------------------------------
// -- M6 -- buildLessonUnitDropdownOptions_
// Mirrors buildCompetencyDropdownOptions_() (M5 addendum) exactly, reading
// the "PacingGuide" tab instead of "CompetencyRegistry". See
// 31_PacingGuideManager.js for that tab's schema (PG_HEADERS) and the
// importPacingGuide() function that populates it.
// ---------------------------------------------------------------------------
function buildLessonUnitDropdownOptions_(centralSsId) {
  const ss = SpreadsheetApp.openById(centralSsId);
  const sheet = ss.getSheetByName("PacingGuide");
  if (!sheet) {
    Logger.log("[M6] PacingGuide tab not found on Central Ledger — cannot " +
      "build dropdown options. Run importPacingGuide() (Script 31) first.");
    return [];
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId = headers.indexOf("lesson_unit_id");
  const iName = headers.indexOf("lesson_unit_name");
  const iStage = headers.indexOf("stage");

  if (iId === -1 || iName === -1) {
    Logger.log("[M6] PacingGuide missing required columns " +
      "(lesson_unit_id, lesson_unit_name).");
    return [];
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const id = String(row[iId]).trim();
    if (!id) continue;

    const name = String(row[iName]).trim();
    const stage = iStage !== -1 ? row[iStage] : "";

    rows.push({ id, name, stage: Number(stage) || 0, sheetOrder: i });
  }

  // PacingGuide is written in stage/unit order by importPacingGuide()
  // already — sort defensively by stage then original sheet order rather
  // than assuming that ordering is preserved forever.
  rows.sort((a, b) => a.stage - b.stage || a.sheetOrder - b.sheetOrder);

  return rows.map(r => r.id + " — " + r.name);
}

// ---------------------------------------------------------------------------
// -- M6 -- extractFormEntryIds_ titleToKey extension.
// Add this ONE line to the M5 addendum's titleToKey map (which itself
// extends the base file's map) — no other change to that function.
// ---------------------------------------------------------------------------

/*
  const titleToKey = {
    ...
    "Competency — Milestone 4": "CONFIRM_ENTRY_COMP_4",
    // -- M6 --
    "Lesson Unit": "CONFIRM_ENTRY_LESSON_UNIT",
  };
*/
