# Script Properties reference

Split out of `cas-ccps/DEPLOYMENT_HANDOFF.md` on 2026-11-17; the handoff maps where everything is.

**Where `getConfig_()` looks, in order** (`00_SharedConfig.js`):
1. The project's own Script Properties. These always win, so anything set
   today keeps working unchanged.
2. For the Central Ledger ID only: the spreadsheet the project is attached
   to. The Ledger's `_CONFIG` tab carries `SYSTEM_ROLE = CENTRAL_LEDGER`, so
   central-ledger uses its own ID. A teacher's cloned Matrix or Rubric sheet
   uses the `CENTRAL_LEDGER_SS_ID` row the setup wizard wrote into its own
   `_CONFIG` tab.
3. District-wide settings from the Central Ledger's `_CONFIG` tab:
   `ADMIN_ROOT_FOLDER_ID`, `ADMIN_NOTIFY_EMAIL`, `STUDENT_DASHBOARD_URL`,
   `STUDENT_EMAIL_DOMAIN`, `LEADER_HUB_OAUTH_CLIENT_ID`, the three
   `MASTER_*` template IDs, `MARKING_PERIOD_ENDS`, and the per-course
   switches `FEEDBACK_AS_COMMENT`, `WARMUP_TEXT_BOX`, `ROLLOUT_AUTO_APPLY`
   and the research-pivot flag `PIVOT_ARCHETYPE_LOCK`
   (`meta/PRD_CAS_RESEARCH_PIVOT.md`). Nothing else is read from that tab
   (`SHARED_CONFIG_KEYS` in `00`). Each switch is off unless its row says
   `all` or a course code (`8175` / `8177`); add the row by hand when a
   feature is turned on. `PIVOT_ARCHETYPE_LOCK`: off, warm-up archetypes are recorded but
   never locked and the lock digest email is not sent. Per-teacher
   values and secrets stay in Script Properties: `TEACHER_EMAIL` is the
   Teacher Dashboard's access gate, so a shared value would let that one
   address into every dashboard that hadn't set its own.

**Setting it up, once:**
- Run `seedLedgerConfigTab()` from the Unified Manual's Apps Script editor.
  The setup wizard wrote the district-wide values there. It creates the
  Ledger's `_CONFIG` tab, adds the `SYSTEM_ROLE` row and copies in each
  value the tab doesn't already have. It never overwrites a row; a
  mismatch is logged for you to settle by hand. Running it again from
  central-ledger fills any gaps.
- In each project, run `showConfigSources()` to see where every setting now
  comes from. Once a value shows as coming from the `_CONFIG` tab, you can
  delete the duplicate Script Property from that project. Edits to the tab
  reach every project within 10 minutes. To use an edit in a project now,
  run `refreshSharedConfig()` there; it clears only that project's cache.
- Keep the properties in three places: the Unified Manual, whose setup
  wizard and installer read them directly; the master student template,
  whose student-doc copies run as the student and can't open the Ledger;
  and `M2_ENABLED` wherever it's set, since several files read it directly.

**Hard-required:** only the Central Ledger ID, found by step 1 or 2 above.
Without it `getConfig_()` throws. `ADMIN_SS_ID` defaults to the same
spreadsheet (every installer sets the two equal). `teacher-dashboard` and
`student-dashboard` aren't attached to a spreadsheet, so they still need
`CENTRAL_LEDGER_SS_ID` as a Script Property.

**Set by hand when you need it:** `ROSTER_CONFIG_ID` (central-ledger), the
LIVE assignment the Canvas roster import enrolls into (script 52).

**Written automatically, don't set by hand:**
- `76_CoveredSoFar.js` writes `COVERED_SO_FAR_DOC_ID_<course>` (each course's
  Covered So Far doc) and `COVERED_SO_FAR_HASH_<course>` (its last text, so
  an unchanged doc isn't rewritten). Delete the doc ID to start a course's doc
  over.
- Script 16 (teacher setup wizard) writes `TEACHER_*`, `ORG_NAME` (its summary page's school name), `*_RESPONSE_SS_ID`,
  `*_FORM_URL`, `CONFIRM_ENTRY_*` (with `CONFIRM_ENTRY_LESSON_UNIT`; 19 copies them to a teacher sheet's `_CONFIG`), `MASTER_*` — all default to `""` (degraded,
  not broken) if somehow missed.
- `28_Module2Setup.js` writes `M2_ENABLED`, `M2_COURSES`,
  `M2_SETUP_PHASE_A_COMPLETE`, `M2_REGISTRY_IMPORTED`,
  `M2_PACING_GUIDE_IMPORTED`, `M2_RUBRICS_IMPORTED`, `M2_SETUP_COMPLETE`,
  `M2_SETUP_PHASE_B`.

**Set manually before running the wizards:**
- `MARKING_PERIOD_ENDS` — when each marking period ends (`2627_MP1=2026-10-30,2627_MP2=2027-01-22,...`); the 2026-27 district calendar is the code default. Add next year's four ends before August (a `_CONFIG` row reaches every project).
- `CURRENT_TERM` — the school year plus marking period (`2627_MP1`). During a
  school year `MARKING_PERIOD_ENDS` covers, `currentTerm_()` picks the
  marking period by date; outside it (summer, or a year the table lacks)
  `CURRENT_TERM` is used as set, and unset falls back to `""`/`"All Terms"`/
  `"ALL"` per call site (degraded, not fatal, but set it). Set it from the
  Central Ledger's **⚙️ Admin Controls → 📅 Set Current Term** menu
  (`setCurrentTerm()`).
- `ADMIN_ROOT_FOLDER_ID`, `ADMIN_NOTIFY_EMAIL` — admin-tier, no wizard sets these.
  Set them once on the Ledger's `_CONFIG` tab (see above) rather than in
  every project.

**Optional, all default-safe:** the 6 retention properties
(`SCR_RETENTION_YEARS`, `LEDGER_RETENTION_YEARS`,
`COMPETENCY_EVIDENCE_RETENTION_YEARS`, `PARENT_REPORT_RETENTION_YEARS`, all
default 5 years; `WARMUP_QUEUE_RETENTION_YEARS` and
`WORKING_DATA_RETENTION_YEARS`, default 1 year). The operator adopted these
periods as the retention schedule on 2026-10-13, **pending the district
records officer's confirmation** against the Library of Virginia's GS-21
(`cas-ccps/docs/FERPA_DATA_MAP.md`, `57_RetentionSchedule.js`); a confirmed
period is set as a property, with no code change.

**Must never be set:** `GEMINI_API_KEY`. It was read only by a commented-out
direct-Gemini call in `25_WarmUpWriter.js` (removed 2026-09-29) that would have
bypassed the "Walled Garden" Studio-Flow-only boundary. Nothing reads it now,
and a deployment that sets it is misconfigured.
`10_AdminRecoveryPanel.js`'s daily health check alerts loudly if it's ever set;
don't set it during deployment troubleshooting even temporarily. Same caution
for `FERPA_FLOW3_FULL_NAME_OVERRIDE` — must stay unset/false.
