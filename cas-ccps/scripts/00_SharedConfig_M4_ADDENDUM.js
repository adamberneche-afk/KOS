// =============================================================================
// FILE: 00_SharedConfig_M4_ADDENDUM.js
// PURPOSE: Module 4 additions to paste into getConfig_() in 00_SharedConfig.js
//
// INSTRUCTIONS:
// 1. Open 00_SharedConfig.js in every project that needs M4 access.
//    (Central Ledger project and Script 07 project — same two projects
//    that needed the M2 addendum.)
// 2. In the `tabs` object inside getConfig_(), add the two new tab names.
// DO NOT replace 00_SharedConfig.js — add to it.
// =============================================================================

// ── PASTE INTO the `tabs` object inside getConfig_() ─────────────────────────
//
// studentDocRegistry: "StudentDocRegistry",
// warmUpResponses: "WarmUpResponses"
//
// Full tabs object after M2 + M4 additions:
//
// tabs: {
//   ledger: "Ledger",
//   reviewQueue: "ReviewQueue",
//   stagingPipeline: "STAGING_PIPELINE",
//   rubricQueue: "RubricQueue",
//   teacherMatrix: "TeacherMatrix",
//   draftUnits: "DraftUnits",
//   matrixRegistry: "MatrixRegistry",
//   // ── M2 ──
//   lessonContext: "LessonContext",
//   competencyRegistry: "CompetencyRegistry",
//   alignmentLog: "AlignmentLog",
//   reportRegistry: "ReportRegistry",
//   // ── M4 ──
//   studentDocRegistry: "StudentDocRegistry",
//   warmUpResponses: "WarmUpResponses"
// }
//
// No new config keys are needed in the main return object — M4 has no
// enable/disable flag analogous to M2_ENABLED. This is a deliberate choice:
// M4 only acts on data that already exists in Ledger and WarmUpResponses;
// if those tabs are absent, the functions degrade gracefully (logged,
// non-fatal) rather than requiring a kill switch. See 29_StudentContext-
// Aggregator.js — every tab-lookup is null-checked before use.
//
// ── SCRIPT PROPERTIES — none required beyond what M1/M2 already set ─────────
//
// M4 reads cfg.ledgerSsId, cfg.teacherFolderId, cfg.teacherEmail — all
// already established by Module 1 setup (Script 16). No new properties.
//
// =============================================================================
// DEPLOYMENT CHECKLIST — Module 4 (Student Context Aggregator)
// =============================================================================
//
// 1. TABS — add studentDocRegistry + warmUpResponses keys to Script 00
//    in both the Central Ledger project and the Script 07 project.
//
// 2. SCRIPT 29 — add to the Central Ledger project (same project as
//    Scripts 02–06, 22, 22b, 26, etc.)
//
// 3. CREATE TABS — run createStudentAggregatorTabs_() from Script 29.
//    Creates: StudentDocRegistry, WarmUpResponses.
//    Safe to re-run — skips existing tabs.
//
// 4. WARM-UP FORM — create the student-facing Google Form (see
//    WarmUpResponseForm_setup.md for field specification) and link its
//    response destination to the WarmUpResponses tab created in step 3.
//
// 5. INSTALL TRIGGER — run installStudentAggregatorTrigger_() from
//    Script 29. Installs the weekly trigger at ~3am. Safe to re-run.
//
// 6. SCRIPT 07 — replace with the updated version (adds the Student
//    Context tab to the dashboard UI). Redeploy as web app — manage
//    existing deployment, new version. URL does not change.
//
// 7. SMOKE TEST — before relying on the weekly trigger:
//    a. Confirm at least one row exists in Ledger with a valid
//       7-digit@ccpsnet.net GoogleID and a recent SubmissionTS.
//    b. Submit one test response through the Warm-Up Response form
//       using a valid-format test email.
//    c. Run runStudentAggregationNow_() manually from the Script Editor.
//    d. Check StudentDocRegistry — one new row should appear with a
//       doc_id and doc_url populated.
//    e. Open the doc_url — confirm a "Week of [date]" section exists
//       with the test assignment and/or warm-up response visible.
//    f. Open Script 07's Teacher Dashboard — confirm the new Student
//       Context tab lists the test student with a working doc link.
//
// =============================================================================
