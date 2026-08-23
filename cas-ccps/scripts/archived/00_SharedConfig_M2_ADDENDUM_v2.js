// =============================================================================
// ARCHIVED — Sections A and B (the tabs object additions and the
// m2Enabled/shadowMatrix* config keys) are merged into 00_SharedConfig.js's
// getConfig_() return object. Do not paste from here; those are live.
// Sections C-E (Script Properties reference, deployment checklist, tab
// summary) remain useful reference documentation and are why this file is
// kept rather than deleted.
// =============================================================================
// FILE: 00_SharedConfig_M2_ADDENDUM.js
// VERSION: 2.0 — covers Module 2 Lightweight + Module 2 Full (Warm-Ups)
//
// PURPOSE: Complete set of additions to paste into 00_SharedConfig.js.
//          Replaces all previous addendum versions. One file, one source of truth.
//
// INSTRUCTIONS:
//   1. Open 00_SharedConfig.js in every project that needs M2 access:
//      — Central Ledger project (Scripts 22, 22b, 23, 24, 25, 26)
//      — Script 07 project (Teacher Dashboard)
//   2. In getConfig_(), replace the existing tabs object with the complete
//      version below (section A).
//   3. In getConfig_(), add the M2 config key to the main return object
//      (section B).
//   4. Set Script Properties as listed in section C.
//   DO NOT replace 00_SharedConfig.js — only the tabs object and return
//   object receive additions. Everything else in getConfig_() is unchanged.
//
// =============================================================================

// =============================================================================
// SECTION A — Complete tabs object for getConfig_()
// Replace the existing tabs: { ... } block with this entire object.
// =============================================================================
//
//   tabs: {
//     // ── Module 1 (unchanged) ──
//     ledger:             "Ledger",
//     reviewQueue:        "ReviewQueue",
//     stagingPipeline:    "STAGING_PIPELINE",
//     rubricQueue:        "RubricQueue",
//     teacherMatrix:      "TeacherMatrix",
//     draftUnits:         "DraftUnits",
//     matrixRegistry:     "MatrixRegistry",
//
//     // ── Module 2 Lightweight ──
//     lessonContext:      "LessonContext",
//     competencyRegistry: "CompetencyRegistry",
//     alignmentLog:       "AlignmentLog",
//     reportRegistry:     "ReportRegistry",
//
//     // ── Module 2 Full (Warm-Ups) ──
//     studentProfiles:    "StudentProfiles",
//     warmUpQueue:        "WarmUpQueue",
//     warmUpRegistry:     "WarmUpRegistry",
//     classSchedule:      "ClassSchedule",
//     pacingGuide:        "PacingGuide",
//     competencyRubrics:  "CompetencyRubrics"
//   }

// =============================================================================
// SECTION B — Addition to the main return object of getConfig_()
// Add this block anywhere in the return { ... } object.
// =============================================================================
//
//   // ── Module 2 ──
//   m2Enabled:                    p.M2_ENABLED || "false",
//   shadowMatrixConfidenceThreshold: 0.75,  // threshold for email interrupt
//   shadowMatrixDecayFactor:         0.85,  // KOS-derived cross-unit decay
//
// NOTE: Default is "false" — explicit opt-in required per installation.
//       Set M2_ENABLED = true in Script Properties to activate.
//       A cloned ledger without this property will skip all M2 handlers.

// =============================================================================
// SECTION C — Script Properties
// Set these in the Central Ledger project:
// Script Editor → Project Settings → Script Properties
// =============================================================================
//
// ── Required before any M2 handler runs ──────────────────────────────────────
//
//   M2_ENABLED          → "true"
//                         Default is "false" when absent. Must be set explicitly.
//                         Set to "false" to disable all M2 handlers without
//                         removing scripts — useful for staged rollout or
//                         temporarily suspending warm-up generation.
//
// ── Already set by Module 1 setup (no action needed) ─────────────────────────
//
//   TEACHER_MATRIX_SS_ID → written by Script 16 during M1 teacher setup
//                          Required by Script 33 to read competency tags
//
//   TEACHER_EMAIL       → written by Script 16 during M1 setup
//   TEACHER_NAME        → written by Script 16 during M1 setup
//   TEACHER_SUBJECT     → written by Script 16 during M1 setup
//   TEACHER_FOLDER_ID   → written by Script 16 during M1 setup
//   CURRENT_TERM        → set by admin before each term (e.g. "2025-26 S2")
//   CENTRAL_LEDGER_SS_ID → set by admin during M1 setup
//
// ── Written automatically — never set manually ────────────────────────────────
//
//   Script 26 writes these on each alignment report run:
//   M2_LAST_REPORT_DOC_ID   → Drive file ID of most recent alignment report
//   M2_LAST_REPORT_URL      → Edit URL of most recent alignment report
//   M2_LAST_REPORT_TERM     → Term string at generation time
//   M2_LAST_REPORT_DATE     → Date string at generation time (YYYY-MM-DD)
//
//   Script 25 writes these on each warm-up grade report run:
//   M2_LAST_WARMUP_REPORT_DOC_ID  → Drive file ID of most recent warm-up report
//   M2_LAST_WARMUP_REPORT_URL     → Edit URL of most recent warm-up report
//   M2_LAST_WARMUP_REPORT_TERM    → Term string at generation time
//   M2_LAST_WARMUP_REPORT_DATE    → Date string at generation time (YYYY-MM-DD)
//
// ── Retrieve most recent report URLs ─────────────────────────────────────────
//
//   Alignment report:  run getLastReport()       from Script 26 in Script Editor
//   Warm-up report:    run getLastWarmUpReport_() from Script 25 (or check
//                      Script Properties directly in Project Settings)

// =============================================================================
// SECTION D — Deployment Checklist
// Complete sequence for both builds. Steps 1-9 are the lightweight build.
// Steps 10-17 add the full warm-up build on top.
// =============================================================================
//
// ── MODULE 2 LIGHTWEIGHT ─────────────────────────────────────────────────────
//
// 1. ADD SCRIPTS to Central Ledger project
//    Scripts 22, 22b, 26 (same project as Scripts 02-06 etc.)
//
// 2. UPDATE SCRIPT 00 in Central Ledger project AND Script 07 project
//    Replace tabs object with Section A above.
//    Add m2Enabled key from Section B above.
//
// 3. SET SCRIPT PROPERTIES on Central Ledger project
//    M2_ENABLED = true
//
// 4. CREATE LIGHTWEIGHT TABS — run createModule2Tabs_() from Script 22
//    Creates: LessonContext · CompetencyRegistry · AlignmentLog · ReportRegistry
//    Safe to re-run — skips existing tabs.
//
// 5. IMPORT COMPETENCY DATA
//    a. Upload CompetencyRegistry.csv to teacher Drive folder
//    b. Run importCompetencyRegistry() from Script 22b
//    c. Run validateRegistryImport() from Script 22b — expect 221 rows
//
// 6. POPULATE CLASS SCHEDULE (lightweight only — Lesson Context form)
//    No ClassSchedule tab yet — that's warm-up build step 14.
//
// 7. INSTALL LIGHTWEIGHT TRIGGER — run installModule2Triggers_() from Script 22
//    Installs: runAlignmentLogBackfill_ every 5 minutes (safety net)
//
// 8. DEPLOY SCRIPT 07 — replace existing file, redeploy web app
//    Manage deployments → existing deployment → Edit → New version → Deploy
//    URL does not change. Teachers do not need a new link.
//
// 9. SMOKE TEST — Lightweight
//    a. Open Teacher Dashboard URL · click "New Lesson"
//    b. Confirm both course tabs load (8175 · 8177) with competencies in order
//    c. Fill required fields · select 2-3 competencies · click "Log lesson"
//    d. Confirm toast: "Lesson logged. Alignment will be recorded automatically."
//    e. Check LessonContext tab → one row, status = ALIGNMENT_LOGGED
//    f. Check AlignmentLog tab → one row per competency, competency_text populated
//    g. Check ReportRegistry tab → empty (no report generated yet)
//    h. Run generateAlignmentReport() from Script 26 → confirm doc created in
//       teacher folder · check ReportRegistry row written · check Script Properties
//       M2_LAST_REPORT_DOC_ID populated
//
// ── MODULE 2 FULL (WARM-UPS) — builds on top of lightweight ──────────────────
//
// 10. ADD SCRIPTS to Central Ledger project
//     Scripts 23, 24, 25 (same project)
//
// 11. EXTEND LESSONCONTEXT TAB
//     Run createLessonContextWarmUpColumn_() from Script 24
//     Adds warm_up_generated column (col 15) to existing LessonContext tab.
//
// 12. CREATE WARM-UP TABS — run createWarmUpTabs_() from Script 23
//     Creates: StudentProfiles · WarmUpQueue · WarmUpRegistry · ClassSchedule
//     Safe to re-run — skips existing tabs.
//
// NUMBERING NOTE (reconciliation decision 7, revised during implementation):
// this section originally claimed scripts 29, 30, and 31 for the three
// items below. Scripts 29 (StudentContextAggregator, Module 4) and 30
// (SCRSuggestionEngine, Module 5) are real, already-implemented files with
// no relation to Module 2 — this addendum's claim on those numbers was
// unbuilt and lost the collision. Renumbered to 31/32/33, the next free
// slots. importPacingGuide()/importCompetencyRubrics() are not implemented
// anywhere in this repo yet — treat 31 and 32 as reserved numbers for
// whoever builds them, not as existing files.
//
// 12b. IMPORT PACING GUIDE — run importPacingGuide() from Script 31
//      Upload PacingGuide_CAS_Context.json to teacher Drive folder first.
//      Creates PacingGuide tab with 20 units. Run validatePacingGuide() to confirm.
//      Enables warmup_anchor seeds in WarmUpQueue snapshots and unit-level
//      shadow matrix tracking. Safe to re-run — clears and rewrites.
//
// 12c. IMPORT COMPETENCY RUBRICS — run importCompetencyRubrics() from Script 32
//      Upload CompetencyRubrics.json to teacher Drive folder first.
//      Creates CompetencyRubrics tab with 220 rubrics (113 × 8175, 107 × 8177).
//      Run validateRubricImport() to confirm. Enables skill_questions and
//      archetype_question_map in WarmUpQueue lesson context snapshots.
//      Safe to re-run — clears and rewrites.
//
// 12d. ADD SCRIPT 33 — ArtifactCompetencyBridge
//      Add 33_ArtifactCompetencyBridge.js to the Central Ledger project.
//      Run addCompetencyIdsColumn_() from Script 33 — adds competency_ids
//      column to TeacherMatrix sheet. Safe to re-run.
//      Run installArtifactSyncTrigger_() from Script 33 — installs 3:05am
//      nightly trigger. Completes the full cron sequence:
//        3:00am S23 → 3:05am S33 → 3:15am S25 → 3:30am S24
//      Tag assignments with competency IDs in the Teacher Matrix
//      (competency_ids column, comma-separated, e.g. "8177-47,8177-52").
//      Run validateArtifactSync() to verify coverage is being tracked.
//
// 13. INSTALL WARM-UP TRIGGERS — run installWarmUpTriggers_() from Script 23
//     Installs three nightly triggers:
//       3:00am — updateAllStudentProfiles()  (Script 23)
//       3:15am — runWarmUpEvaluation()       (Script 25)
//       3:30am — buildWarmUpQueues()         (Script 24)
//
// 14. INSTALL REGISTRATION TRIGGER — run installRegistrationTrigger_() from Script 25
//     Installs: registerDeliveredWarmUps() every 5 minutes
//
// 15. POPULATE CLASS SCHEDULE
//     Manually fill ClassSchedule tab with period day types:
//     Columns: teacher_email | period | day_type | course_name | active
//     day_type values: DAILY (Period 1) · ODD · EVEN
//     Example rows:
//       your@email.com | 1 | DAILY | Sports Entertainment and Event Management | TRUE
//       your@email.com | 2 | ODD   | Sports Entertainment and Event Marketing  | TRUE
//       your@email.com | 3 | EVEN  | Sports Entertainment and Event Management | TRUE
//       your@email.com | 4 | ODD   | Sports Entertainment and Event Marketing  | TRUE
//
// 16. CONFIGURE STUDIO FLOWS
//     Flow 3 — Warm-Up Generation
//       Trigger: WarmUpQueue row status = PENDING
//       Reads: lesson_context_snapshot + student_profile_snapshot from queue row
//       Writes: generated doc to student Drive folder, doc_id + status DELIVERED to queue row
//     Flow 4 — Warm-Up Evaluation
//       Trigger: WarmUpQueue row status = PENDING_EVAL
//       Reads: response_text + flow prompt from queue row
//       Writes: grammar_score + engagement_score + flow4_feedback to queue row
//               Sets status = SCORED
//
// 17. SMOKE TEST — Full Warm-Up Build
//     a. Submit a lesson context for tomorrow's date via the dashboard
//     b. Check LessonContext tab → warm_up_generated = "" (not yet queued)
//     c. Manually run buildWarmUpQueues() from Script 24
//        → WarmUpQueue tab should have one row per student in that period
//        → Each row status = PENDING, lesson_context_snapshot populated
//     d. Manually run updateAllStudentProfiles() from Script 23
//        → StudentProfiles tab should have one row per student
//     e. Manually trigger Flow 3 (or wait for 6am trigger)
//        → WarmUpQueue rows → status = DELIVERED, doc_id populated
//        → Warm-up docs appear in student Drive folders
//     f. Check WarmUpRegistry → one row per student, total_score empty
//     g. Write a test response (30+ words) in one warm-up doc
//     h. Manually run runWarmUpEvaluation() from Script 25
//        → WarmUpQueue row → status = SCORED, scores populated
//        → WarmUpRegistry → total_score populated
//        → Warm-up doc → feedback written below response
//     i. Run generateWarmUpReport() from Script 25
//        → Grade report doc created in teacher folder
//        → ReportRegistry row written (type: WARMUP_TERM)
//        → Script Properties M2_LAST_WARMUP_REPORT_DOC_ID populated

// =============================================================================
// SECTION E — Tab Summary
// Complete tab inventory across all modules for reference.
// =============================================================================
//
//   TAB                  MODULE           WRITER(S)            APPEND-ONLY
//   ──────────────────── ──────────────── ──────────────────── ───────────
//   Ledger               M1               S02                  No (updates)
//   ReviewQueue          M1               S01, S03             No
//   STAGING_PIPELINE     M1               S03, Flow 2          No  (read by S31)
//   RubricQueue          M1               S05                  Yes
//   TeacherMatrix        M1               Flow 1, S08          No  (+ competency_ids col via S31)
//   MatrixRegistry       M1               S16                  Yes
//   LessonContext        M2 Lightweight   S22                  No (status updates)
//   CompetencyRegistry   M2 Lightweight   S22b / Manual        No (active flag)
//   AlignmentLog         M2 Lightweight   S26                  Yes
//   ReportRegistry       M2 Lightweight   S26, S25             Yes
//   StudentProfiles      M2 Full          S23                  No (upsert)
//   WarmUpQueue          M2 Full          S24, Flow 3, S25     No (status updates)
//   WarmUpRegistry       M2 Full          S25                  Mostly (scores updated)
//   ClassSchedule        M2 Full          Manual / S28         No
//   PacingGuide          M2 Full          S29 (import)         No (read-only)
//   CompetencyRubrics    M2 Full          S30 (import)         No (read-only)
//
// =============================================================================
