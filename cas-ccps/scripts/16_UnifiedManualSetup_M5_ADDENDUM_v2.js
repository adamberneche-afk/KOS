// =============================================================================
// FILE: 16_UnifiedManualSetup_M5_ADDENDUM_v2.js  (v2 -- reconciled; renamed
//       from _M3_ADDENDUM -- reconciliation decision 6: this addendum
//       belongs to the SCR Suggestion & Remediation Engine, renumbered
//       Module 3 -> Module 5)
// PURPOSE: Module 5 additions to 16_UnifiedManualSetup.js
//
// v2 CHANGES FROM v1:
//   This version additionally repairs the pre-existing Confirmation Form
//   item-building block, which v1 deliberately left untouched because the
//   pasted source was too damaged to safely reconstruct at the time. On
//   closer, character-by-character review, the damage breaks into three
//   distinct, separately-confident repairs rather than one large unknown
//   -- see the three numbered notes inline below. This is reconstruction
//   of a NEVER-DEPLOYED script (confirmed: zero Forms exist in Drive,
//   runTeacherSetup_() has never completed), not a guess about a live
//   system's current behavior -- there is nothing running today that this
//   could be inconsistent with.
//
// SCOPE: Same two integration points as v1 -- the Confirmation Form's
// item-building step, and extractFormEntryIds_() -- PLUS the repair of
// the pre-existing 8-item block those two points sit alongside.
// =============================================================================

// ---------------------------------------------------------------------------
// REPAIR NOTE 1 -- setDescription / setCollectEmail
// As pasted, the description string's closing quote+paren were missing
// and a stray ");" appeared on its own line after setCollectEmail(true).
// HIGH CONFIDENCE repair: this is two complete, ordinary statements whose
// closing tokens were separated by whatever process produced the paste
// (most likely line-wrapping from a narrow-column source). Both methods
// (setDescription, setCollectEmail) appear correctly elsewhere in this
// same file on other Form objects, and the description text itself reads
// as a complete, grammatical sentence with nothing missing -- only its
// syntax needed closing.
//
// REPAIR NOTE 2 -- missing comma after the "AI Coach Persona" object
// As pasted, no comma separated the "AI Coach Persona" object from
// "Milestone 1" in the array literal. HIGH CONFIDENCE repair, mechanical:
// the same defect category as Script 08's missing comma after
// COURSE_NAME: 14. The intent (eight sequential object literals forming
// one array) is unambiguous from the surrounding structure.
//
// REPAIR NOTE 3 -- "Passing Standard" help text, LOWER CONFIDENCE
// As pasted, this help string was cut off mid-sentence ("Used as the")
// and the array's closing bracket plus the .forEach call appeared to
// land inside the unclosed string. The SYNTAX repair below (closing the
// string, the object, and the array correctly) is mechanical and
// confident. The WORDS completing the sentence are NOT recovered from
// anything -- "final passing standard for evaluation." below is a
// reasonable placeholder, not a reconstruction of lost text. Replace
// this help string with whatever the actual intended wording was before
// treating this file as final; it is flagged here, not silently
// invented as fact.
// ---------------------------------------------------------------------------

// =============================================================================
// REPAIRED + EXTENDED -- full createTeacherAssets_() Confirmation Form block
// Paste this entire block over the corresponding section of
// createTeacherAssets_() in 16_UnifiedManualSetup.js -- from
// "const confirmForm = FormApp.create(...)" through
// "DriveApp.getFileById(confirmForm.getId()).moveTo(teacherFolder);"
// inclusive. Everything before and after this block in that function is
// unchanged.
// =============================================================================

/*
  const confirmForm = FormApp.create(safeName + " -- Assignment Review & Confirm");
  confirmForm.setDescription(
    "Review what the system extracted from your rubric. Edit anything " +
    "incorrect, then submit."
  );
  confirmForm.setCollectEmail(true);

  [
    { title: "Draft ID", para: false, help: "Auto-filled -- do not edit." },
    { title: "Assignment Name", para: false, help: "The name students will see." },
    { title: "AI Coach Persona", para: true, help: "e.g. 'rigorous science writing coach'" },
    { title: "Milestone 1", para: true, help: "First major evaluation criterion." },
    { title: "Milestone 2", para: true, help: "" },
    { title: "Milestone 3", para: true, help: "" },
    { title: "Milestone 4", para: true, help: "" },
    // -- REPAIR NOTE 3 -- placeholder wording, see note above. Replace
    // before treating this file as final. --
    { title: "Passing Standard", para: true, help: "Hidden from students. Used as the final passing standard for evaluation." },
  ].forEach(f => {
    const item = (f.para ? confirmForm.addParagraphTextItem() : confirmForm.addTextItem())
      .setTitle(f.title).setRequired(true);
    if (f.help) item.setHelpText(f.help);
  });

  // -- M5 -- four new competency dropdown items, added after the eight
  // pre-existing items above. Item order on a Form determines display
  // order -- placing this call here means the dropdowns appear after
  // Milestone 4 and Passing Standard, matching the natural reading order
  // a teacher would expect: review each milestone's text, then tag it. --
  addCompetencyDropdownItems_(confirmForm, centralSsId);

  const matrixSs = SpreadsheetApp.openById(matrixSsId);
  const confirmRespSheet = matrixSs.insertSheet("ConfirmationResponses");
  setHeaders_(confirmRespSheet, [
    "Timestamp","Email Address","Draft ID","Assignment Name",
    "AI Coach Persona","Milestone 1","Milestone 2",
    "Milestone 3","Milestone 4","Passing Standard",
    // -- M5 -- four new trailing headers, matching the four new form items --
    "Competency — Milestone 1","Competency — Milestone 2",
    "Competency — Milestone 3","Competency — Milestone 4"
  ]);
  confirmForm.setDestination(FormApp.DestinationType.SPREADSHEET, matrixSsId);
  DriveApp.getFileById(confirmForm.getId()).moveTo(teacherFolder);
*/

// ---------------------------------------------------------------------------
// -- M5 -- addCompetencyDropdownItems_
// Unchanged from v1. Reproduced here so this file is a complete,
// self-contained addendum rather than requiring v1 alongside it.
// ---------------------------------------------------------------------------
function addCompetencyDropdownItems_(confirmForm, centralSsId) {
  const options = buildCompetencyDropdownOptions_(centralSsId);

  if (options.length === 0) {
    Logger.log("[M5] WARNING -- CompetencyRegistry returned zero options. " +
      "Competency dropdowns will be created EMPTY. Run " +
      "importCompetencyRegistry() (Script 22b) before teacher setup, or " +
      "these four fields will block every future confirmation submission " +
      "since they are required and have nothing to select.");
  }

  [
    { title: "Competency — Milestone 1" },
    { title: "Competency — Milestone 2" },
    { title: "Competency — Milestone 3" },
    { title: "Competency — Milestone 4" },
  ].forEach(f => {
    confirmForm.addListItem()
      .setTitle(f.title)
      .setChoiceValues(options)
      .setRequired(true)
      .setHelpText(
        "Select the Student Competency Record (SCR) competency this " +
        "milestone evidences. Every milestone must map to exactly one " +
        "competency -- pick the closest match if a milestone touches " +
        "more than one."
      );
  });
}

// ---------------------------------------------------------------------------
// -- M5 -- buildCompetencyDropdownOptions_
// Unchanged from v1.
// ---------------------------------------------------------------------------
function buildCompetencyDropdownOptions_(centralSsId) {
  const ss = SpreadsheetApp.openById(centralSsId);
  const sheet = ss.getSheetByName("CompetencyRegistry");
  if (!sheet) {
    Logger.log("[M5] CompetencyRegistry tab not found on Central Ledger -- " +
      "cannot build dropdown options.");
    return [];
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());
  const iId = headers.indexOf("competency_id");
  const iText = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand = headers.indexOf("strand");
  const iActive = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    Logger.log("[M5] CompetencyRegistry missing required columns " +
      "(competency_id, competency_text).");
    return [];
  }

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const active = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;

    const id = String(row[iId]).trim();
    if (!id) continue;

    const text = String(row[iText]).trim();
    const subject = iSubject !== -1 ? String(row[iSubject]).trim() : "";
    const strand = iStrand !== -1 ? String(row[iStrand]).trim() : "";

    const dashIdx = id.lastIndexOf("-");
    const taskNum = dashIdx !== -1
      ? parseInt(id.substring(dashIdx + 1), 10) || 9999
      : 9999;
    const courseCode = dashIdx !== -1 ? id.substring(0, dashIdx) : id;

    rows.push({ id, text, subject, strand, courseCode, taskNum });
  }

  rows.sort((a, b) => {
    if (a.courseCode !== b.courseCode) return a.courseCode.localeCompare(b.courseCode);
    if (a.strand !== b.strand) return a.strand.localeCompare(b.strand);
    return a.taskNum - b.taskNum;
  });

  return rows.map(r => {
    const label = r.text.length > 90 ? r.text.slice(0, 87) + "..." : r.text;
    return r.id + " — " + label;
  });
}

// ---------------------------------------------------------------------------
// -- M5 -- extractFormEntryIds_ -- EXTENDED. Unchanged from v1.
//
// APPLIED — this replacement has now actually been merged into
// 16_UnifiedManualSetup.js (plus the M6 addendum's one-line Lesson Unit
// extension on top). This block is kept as a comment for the historical
// record only; it is NOT live code — as an uncommented top-level function
// it collided with the real, merged version, since both files share this
// project's global scope (caught by tools/gas-lint/check.js).
//
// function extractFormEntryIds_(form) {
//   const titleToKey = {
//     "Draft ID": "CONFIRM_ENTRY_DRAFT_ID",
//     "Assignment Name": "CONFIRM_ENTRY_UNIT_NAME",
//     "AI Coach Persona": "CONFIRM_ENTRY_PERSONA",
//     "Milestone 1": "CONFIRM_ENTRY_MILESTONE_1",
//     "Milestone 2": "CONFIRM_ENTRY_MILESTONE_2",
//     "Milestone 3": "CONFIRM_ENTRY_MILESTONE_3",
//     "Milestone 4": "CONFIRM_ENTRY_MILESTONE_4",
//     "Passing Standard": "CONFIRM_ENTRY_DOD",
//     // -- M5 --
//     "Competency — Milestone 1": "CONFIRM_ENTRY_COMP_1",
//     "Competency — Milestone 2": "CONFIRM_ENTRY_COMP_2",
//     "Competency — Milestone 3": "CONFIRM_ENTRY_COMP_3",
//     "Competency — Milestone 4": "CONFIRM_ENTRY_COMP_4",
//   };
//
//   const map = {};
//   for (const item of form.getItems()) {
//     const key = titleToKey[item.getTitle()];
//     if (!key) continue;
//     try {
//       const type = item.getType();
//       const id = type === FormApp.ItemType.TEXT
//         ? item.asTextItem().getId()
//         : type === FormApp.ItemType.PARAGRAPH_TEXT
//         ? item.asParagraphTextItem().getId()
//         // -- M5 -- new branch for the competency dropdowns
//         : type === FormApp.ItemType.LIST
//         ? item.asListItem().getId()
//         : null;
//       if (id) map[key] = "entry." + id;
//     } catch (e) { /* skip */ }
//   }
//   return map;
// }
// ---------------------------------------------------------------------------

// =============================================================================
// REMAINING OPEN ITEM -- unchanged from v1
// =============================================================================
//
// Script 08's getConfig_08() reads these as cfg.confirmEntryComp1..4
// (camelCase, per that file's existing naming convention -- e.g.
// CONFIRM_ENTRY_MILESTONE_1 becomes cfg.confirmEntryM1). The exact
// property-to-cfg-field transform lives inside getSheetConfig_()
// (19_ClonedSheetConfig.js -- not yet seen). The CONFIRM_ENTRY_COMP_1..4
// names above follow the existing pattern exactly, so whatever transform
// applies to the other eight should apply identically to these four --
// this is the one remaining unverified link in the chain.
//
// =============================================================================
