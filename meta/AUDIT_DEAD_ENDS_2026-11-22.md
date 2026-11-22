# Audit: discussed but not fully built (2026-11-22)

**Status:** the third dead-ends audit, after
[`AUDIT_DEAD_ENDS_2026-11-17.md`](./AUDIT_DEAD_ENDS_2026-11-17.md) (whose
unfinished function-level sweep this one completes) and the 10-29 one.
Asked by the operator: "an audit of functions and functionality that have
been discussed but not built out entirely." Three read-only reviews (the
plans and docs; the cas-ccps code; kos-personal, LeaderHub, tools and CI),
each claim checked against the code by grep or by reading it; the main
ones re-checked in the session (marked **checked**). Code and docs only: no
Google file was opened for this audit. No student names, emails, file IDs
or ConfigIDs appear here.

## The short answer

- **The wiring is sound.** Every trigger handler, menu item,
  `google.script.run` call and prompt placeholder resolves, in every
  system. Nothing points at a function that doesn't exist.
- **What's half-built is mostly deliberate and written down:** G1's next
  steps, Phase 4's lessons moving to Forms/Slides/Sheets as they are
  taught, and the parked research PRD, packaging and course builder.
- **What isn't written down** is small and fixable in one or two PRs:
  public functions nothing calls (left from retired menus), a duplicated
  admin menu, a setup sheet that names a property nothing reads, a kos-personal
  write path closed on purpose but never deleted, a retired inference mode
  still in config, and a daily briefing doc the RTP never opens.
- **Three switches** have a live state no doc records (`CAS_WATCHDOG_DRY_RUN`,
  `AI_FLOWS_LIVE`, `M2_ENABLED`): the operator's to confirm.

## Status by item

One row per item. **Kind:** *fix* (a small code or doc change, no decision),
*retire* (delete, per "retiring is deleting"), *decide* (the operator's call),
*operator* (a live step the code waits on), *held* (on hold or parked by the
operator), *proposed* (suggested, never approved).

### 1. Approved, partly built

| # | Item | Built | Missing | Kind |
|---|---|---|---|---|
| 1.1 | **G1, the Gemini harness** | PR 1: `28_GeminiBrief.gs` (#552) | End lines on the other live docs; the ingestion alarms (brief read, brief held, claimed writes, harness named); PR 2, the Stage 1 harness. Waits for the first brief test, as planned | operator, then build |
| 1.2 | **Phase 4: lessons onto Forms, Slides, Sheets** | The readers (4a–4d) | `PARTS.json` marks 2 form, 1 slides, 1 sheet part; the plan counted 5, 11 (+10 Canva) and 3. Converted "as their parts are taught". Drawings and paper work have no path (BACKLOG) | ongoing |
| 1.3 | **D18, what opens the next part** | `explainLockedParts()` (68) | Setting the 11-15 re-grade's evidence aside for unlocking: waits on that function's log | operator, then decide |
| 1.4 | **Structure audit 4.3, `DEPLOYMENT_HANDOFF` status-only** | — | 384 lines; banner "updated 2026-11-01" | fix |
| 1.5 | **`FLOW_INVENTORY.md`** | — | No Flow 6 section; still names `autoHealthAlert` (folded into 34c, 11-20); says two kos-personal statuses have no signal yet (8_WebApp_UI now labels them) | fix |
| 1.6 | **The Vector Item Labeler and `VECTOR_*` docs** | Apps Script half (25) | The labeler flow was turned off 11-01 before labelling anything; no later record it is on. D14 calls the docs empty templates; `FLOWS_BRIEFING` says they are compiled. One is wrong | operator (`checkVectorDocs()`), then a doc fix |
| 1.7 | **The 11-17 audit's function-level sweep** | Done here (sections 3–5) | — | closed by this audit |

### 2. Wired wrong, or written and never used

| # | Item | Evidence | Kind |
|---|---|---|---|
| 2.1 | **Admin menu items added twice** **(checked)** | `16_UnifiedManualSetup.js` `onOpen`: "Open Admin Health Check" and "View Admin Setup Details" in two identical blocks, left from removing script 21's item | fix |
| 2.2 | **The setup wizard's SETUP INSTRUCTIONS sheet** **(checked)** | 16 l.453–480 tells the admin to set `ID_ADMIN_SPREADSHEET`, which nothing reads (the keys are `CENTRAL_LEDGER_SS_ID`/`ADMIN_SS_ID`), and lists triggers the Ledger cycle now owns; l.440–446 promises a placeholder property no code inserts | fix |
| 2.3 | **The Module 2 menu was never wired** | 28's header holds a paste-in menu (`runModule2ImportOnly`, `showModule2Status`, `openLessonDashboard`) never added to 16's `onOpen`; the functions are reachable only from the editor | decide: wire or retire |
| 2.4 | **The "M3 scaffolding" hook** **(checked)** | `scaffolding: []` on every Teacher Dashboard student (07 l.2222, page l.3858); `getStudentScaffoldingData()` exists nowhere | retire (or decide) |
| 2.5 | **kos-personal's intake vector path** **(checked)** | `_srNormalizeCuratorPayload_` (12) sets `vector_weights = null` on purpose (scores come only from `VECTOR_CLASSIFY`), so the intake's `MATRIX_LEDGER` write (3 l.460), `_routeVectorWeightsInternal` and the `DYNAMIC_STATE_MATRIX` writes never run. The dead writer also appends 9 values under a 10-column header. `SCHEMA_REFERENCE` still describes the matrix as used | retire |
| 2.6 | **The retired inference service's mode** | `CFG.INFERENCE_MODE` (1), the Turnstile's MANAGED_SERVICE branch (10), `_submitManagedServiceJob_`, the credits panel, three `KOS_MANAGED_SERVICE_*` properties; the service was archived 11-17 (D16). The plan still lists its Dependabot bumps | retire |
| 2.7 | **`KOS_RECENT_SESSIONS`** **(checked)** | Written every morning (22); the RTP's instructions link six docs and not this one | decide: link it or stop writing it |
| 2.8 | **ALIGNMENT threshold B has no data** | B is "three sessions in a row with no relational check-in"; the log's relational line is never parsed and the primer carries no streak (moral debt, by contrast, is counted) | decide: count it, or drop B |
| 2.9 | **The Calibration Silo folders** (`ID_04_*`) | Written by the Registrar and the CE-tag router; read by nothing, code or RTP | decide |
| 2.10 | **Registrar routing** | Every routed draft lands in `06_CLASSROOM_ASSETS`' root; "pending a real per-type routing rule" | proposed |
| 2.11 | **LeaderHub key contacts** | `saveKeyContacts` (src/05) is never called: the list can be filled only from the console; the empty state still says "in this browser" | decide: a form, or retire |
| 2.12 | **LeaderHub horizon items** **(checked)** | `scanHorizonLabel_()` returns `[]`; the page polls it and shows "temporarily off" | decide |
| 2.13 | **LeaderHub's "5 Ideas per Work Area" modal** | 25 idea cards from Settings, some now built; `surveyAnswers` unused | retire |
| 2.14 | **LeaderHub's Trips "Chapter Reference"** | Last season's trips typed into the page, "RESULTS PENDING" | fix or retire |

### 3. Public functions nothing calls

No trigger, menu, page, Ledger cycle job or doc reaches these; each is a
leftover of a retired menu or a superseded call (section 2.3's three are
there).

| # | Function | Why it's left | Kind |
|---|---|---|---|
| 3.1 | `markQueueRowComplete` (03) **(checked)** | No caller, doc or test | retire |
| 3.2 | `markInstallerComplete` (16) and the `INSTALLER_COMPLETE` it writes | "called by Script 21", archived 11-17; nothing reads the property | retire |
| 3.3 | `runQueueWatchdogNow` (34) **(checked)** | "callable from Health > Run Watchdog Now", a menu that doesn't exist; tests only | wire or retire |
| 3.4 | `archiveExpiredParentReports` (36) **(checked)** | "for the admin menu"; not in it. 34c calls the private `_archiveExpiredParentReports_` | retire the wrapper |
| 3.5 | `setSettingForCourse`, `setMarkingPeriodEnds` (07) | Superseded by `saveSettings`; still callable from the page (teacher-gated) | retire |
| 3.6 | `getFlowPrompt` (40), `removeWeeklyCanvasCartridge` (79) | A test-only resolver; an undocumented remove half | fix (document) or retire |
| 3.7 | kos-personal `installStudioInputTrigger` (13), `checkFidelitySamples` (27) | Named in no doc | fix (document) |

Editor tools that are fine but hard to find (named only in their own
header, `AGENT_NOTES.md` or the archive): 41's repair set, 35's Flow 1
canary pair, 38's `repairLedgerSchemaDryRun`, eight kos-personal checks
missing from `docs/runtime-reference.md`'s editor-only table, and six
`validate*` functions named only in the legacy Module 2 HTML doc. **fix:**
one table each.

### 4. Switches built but off

| # | Switch | State | Kind |
|---|---|---|---|
| 4.1 | `CAS_WATCHDOG_DRY_RUN` | Dry run unless `false`; SETUP_GUIDE says set it when the watchdog should release stuck rows. No doc records it was | operator: confirm |
| 4.2 | `AI_FLOWS_LIVE` | Off: students read wording for flows that aren't live, though Flow 2 is. Read in two projects | operator: confirm |
| 4.3 | `M2_ENABLED` | Off by default; set per the deployment handoff. Live state not recorded | operator: confirm |
| 4.4 | `PARENT_REPORT_PREP` | Off, kept off (the operator, 11-19) | held |
| 4.5 | `PIVOT_ARCHETYPE_LOCK` | Off by design until the PRD's P2-04 (parked) | held |
| 4.6 | `EVALUATION_MODE` / `runFlow2DirectGemini_` (15c) | Parked under D16; nothing calls it | held |

`FEEDBACK_AS_COMMENT`, `WARMUP_TEXT_BOX`, `ROLLOUT_AUTO_APPLY`,
`REFLECTION_ON_SUBMIT` and `TURN_IN_CODE_COURSES` default off in code and
are on live (feature-switches doc and handoffs): not gaps.

### 5. Docs and properties out of step with the code

| # | Item | Kind |
|---|---|---|
| 5.1 | Script Properties read but in no properties doc: kos-personal `VECTOR_ITEM_LABELER_LAST_RUN`, `VECTOR_DOCS_LAST_RUN`, `FIDELITY_LOGS_SEEN`, `ID_03_6_SESSION_TRANSCRIPTS`; cas-ccps `ORG_NAME`, `CONFIRM_ENTRY_COMP_1..4`, `CONFIRM_ENTRY_LESSON_UNIT` | fix |
| 5.2 | Stale comments: kos-personal 1 ("all 10 documented triggers": 18), 9 (names `generateSessionVectorPrimer()`), 1 ("ACTION_REGISTER never read"); cas-ccps 00 l.2712 (the feedback reflection "not built"), 08 l.53–63, 34b l.170 and 71 l.128 (grant "from the editor until the review queue"); LeaderHub Config.gs and src/05 (`lh_wbl_hours_log` "not synced") | fix |
| 5.3 | `FERPA_DATA_MAP.md` says 29 writes `WarmUpResponses`; it only reads it (the tab is legacy, its form retired) | fix |
| 5.4 | `claude-project/README.md` "six doc links" (seven placeholders) | fix |
| 5.5 | `DEPLOYMENT_GUIDE.md:75` points at a moved archive path (doc-currency's one warning) | fix |
| 5.6 | `meta/AGENT_NOTES.md`, due for pruning after 11-21, is 909 lines | fix |

### 6. Checks that still only warn

| # | Check | Why it warns | Kind |
|---|---|---|---|
| 6.1 | gas-lint `bounded-loop-convention` | Four kos-personal loops (1:1325, 5:775, 5:962, 6:1033) have no cap; process hardening 2b left them | fix, then make it an error |
| 6.2 | gas-lint `unused-oauth-scope` | Central Ledger declares `forms` with no FormApp call (4a said it would move with the reader) | fix |
| 6.3 | gas-lint `dynamic-server-dispatch` | kos-personal's `callServer('name')` isn't cross-checked (all 24 names exist today) | proposed |
| 6.4 | coverage-gaps allowlist | Nine scheduled handlers "flagged for follow-up" since the check began (four kos-personal, five cas-ccps) | fix over time |

### 7. Waiting on the operator (no code to write)

The first lesson report and zero-shot rounds (then the `LR_` thresholds);
the warm-up context A/B run and its ratings (D21); every Studio flow to one
row per run (then the pipeline's limits: `WFB_INPUTS_PER_RUN = 10`,
`FLOW2_PARALLEL_LANES = 3`); cheaper Ledger checks only if `showSetupStatus()`
still projects over 80%; the warm-up answer rate (8% on 11-19); the
"Lesson draft import" task's connectors; SMP-020's register row; the
`KOS_CAS_SIGNAL` relink and the instructions re-paste; the onboarding
close-out; L4 and L5's answers in a closeout.

### 8. Proposed, never approved

The ingestion guard comparing a log's header as well as its hash; intake
counting pastes with no closeout; the quarterly re-measurement as a
scheduled task; D4's authenticity collector; a draft-it-for-me lesson
button; student-requested docs (Thread C); shorter competency goals;
summative results against CAS ratings; the measurement gaps the plan calls
"not known" (Flow 6's screened answers, Flow 1's wait, kos-personal's and
LeaderHub's flows); supports and extensions in the lesson doc (curriculum
to write); KOS ingestion hardening C and A (only if a backlog returns).

### 9. On hold or parked (by the operator)

Packaging steps 3–5 with D10 and D11 (repo visibility, a history rewrite)
and KOS Lite; the course builder's Phases 0 (the run menu, `run.js`'s
confirm) through F, with D20 (Marketing Explorations); 4.12 Drive
maintenance (`drive-curation/`, the Drive Steward, LeaderHub's
`drive-tools/`); LeaderHub tightening, and its CAS link (until
`checkCasServerSignIn()` passes); D12, the mastery map and portfolio; the
research PRD past Phase 0 (P1-01 to P5-07, the pre-registration doc, the 14
`PIVOT_*` flags never made); process hardening Phase 4 (dropped under D16).

## Pushback on the reviews

- **"Org Sync allowlist is warn-only, untracked":** it has enforced since
  the operator set `ORG_SYNC_CO_ADVISORS` (reported 11-20,
  `archive/2026-27-Q2/meta/HANDOFF_2026-11-19.md`). Not a gap.
- **"MATRIX_LEDGER column mismatch" as a bug:** the writer can't run (2.5),
  so the mismatch is a symptom of dead code, not a live fault.
- **TODO/FIXME older than 10-29** (the 11-17 sweep's last part): none in
  any script folder.

## Proposed order

1. **One "fix" PR**: 1.4, 1.5, 2.1, 2.2, 3.6–3.7, section 5 and the
   editor-tool tables. Docs and comments, two menu lines; no behavior change.
2. **One "retire" PR**: 2.4–2.6, 3.1–3.5, 2.13, per "retiring is deleting"
   (code, tests, mentions; one HISTORY entry each system).
3. **6.1 and 6.2**, then `bounded-loop-convention` becomes an error.
4. **The operator's decisions**: 2.3, 2.7–2.9, 2.11–2.12, 2.14 and the
   three switches in 4.1–4.3.
