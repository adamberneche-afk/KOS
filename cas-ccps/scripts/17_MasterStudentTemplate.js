// =============================================================================
// FILE: 17_MasterStudentTemplate.js
// BOUND TO: Master Student Template Google Doc (container-bound)
//           Same project as Scripts 00 + 01 + 09
//
// PURPOSE: Architecture documentation and admin setup reference.
//          No operational functions are defined here — all active code
//          lives in Scripts 00, 01, and 09.
//
// ARCHITECTURE:
//   One master student template doc exists, owned by admin, with Scripts
//   00 + 01 + 09 + 17 pre-bound. Script 02 copies this doc for every student
//   then injects the teacher's prompt content into Zone 2 of the copy.
//   The teacher's prompt doc is read as source text only — never copied directly.
//   This ensures Script 01 is pre-bound on every student doc automatically.
//
// SYSTEM ID RESOLUTION:
//   Script Properties do NOT clone with makeCopy(). Script 02 stamps system IDs
//   as invisible text (white, 1pt) below the CONFIG_ID footer during doc creation.
//   Script 01 contains readSystemIds() directly (self-contained — no Script 17
//   dependency) which tries Script Properties first, then the embedded block.
//   stampSystemIds() was previously here but is now merged into Script 02's
//   stampDocument_() for a single open/close cycle. It is no longer needed here.
//
// ADMIN SETUP:
//   1. Create one Google Doc — the Master Student Template
//   2. Leave body empty
//   3. Extensions → Apps Script → create four files:
//        00_SharedConfig.js
//        01_StudentDoc_ContainerScript.js
//        09_StudentRevisionGuidance.js  (reference copy — operative code in Script 03)
//        17_MasterStudentTemplate.js    (this file)
//   4. In Project Settings → Script Properties, set:
//        CENTRAL_LEDGER_SS_ID = [central ledger spreadsheet ID]
//        ADMIN_SS_ID          = [same value]
//   5. Record this doc's ID — set as MASTER_STUDENT_TEMPLATE_ID in admin
//      Script Properties (on the unified manual doc) via the setup wizard
//      or manually after admin setup completes
//   6. Never share this doc with students or teachers — admin-only
// =============================================================================

// This file is intentionally empty of function definitions.
// See Scripts 00, 01, 03, and 09 for all operational code.
