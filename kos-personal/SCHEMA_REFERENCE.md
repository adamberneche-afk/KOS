# KOS v8.0 — Schema Reference

Complete reference for all sheets in BRAIN_TRUST_INDEX, all Drive document roles, all valid status values, and the PropertiesService key registry.

---

## BRAIN_TRUST_INDEX Sheets

### STAGING_PIPELINE

The central queue. Every session chunk passes through this sheet.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Timestamp | DateTime | When the row was created by a sensor |
| B | Payload_UID | String | Unique identifier — `LOG-{ms}-{8char_hash}` |
| C | Payload_Type | Enum | See Payload Types below |
| D | Doc_URL | String | Full Google Drive URL of the chunk document |
| E | File_ID | String | Google Drive file ID (used to open the document) |
| F | Status | Enum | Current pipeline status — see Status Lifecycle below |
| G | Retry_Count | Integer | Number of processing attempts (resets on manual re-queue) |

**Payload Types**

| Value | Description |
|---|---|
| `SESSION_LOG` | Session transcript submitted via web app or Sensor 1 folder-drop |
| `EXTERNAL_DATA` | Research or context submitted via web app Research tab |
| `COG_STIMULUS` | Sequestered council stimulus doc (one per cog per council run) |
| `EXTERNAL_TELEMETRY` | Data from Sensor 3 (onChange on BRAIN_TRUST_INDEX) |
| `VECTOR_CLASSIFY` | Sentence-level vector classification flow, paired with a SESSION_LOG chunk — see STUDIO_INTEGRATION_SPEC.md's "Inference Flow — Sentence Classification" |

**Status Lifecycle**

| Status | Set by | Meaning |
|---|---|---|
| `PENDING_FLOW` | Sensors 1, 2, 3 | Chunk created, waiting for Turnstile |
| `STUDIO_ACTIVE` | Turnstile | Released to Studio for inference |
| `STUDIO_TIMEOUT` | Turnstile | Reset for staleness more than CFG.TURNSTILE_STUCK_THRESHOLD times with no Studio flow ever completing it — terminal, human review required |
| `FLOW_COMPLETE` | Studio | Inference complete, ready for queue processor |
| `NEEDS_CURATOR` | Queue Processor | JSON parse failed, retry 1 or 2 |
| `FAILED_PARSE` | Queue Processor | Retry cap hit, manual intervention required |
| `PROCESSED` | Queue Processor | Successfully routed to all ledgers |
| `MISSING_FILE_ID` | Queue Processor | Row has no File_ID — terminal, non-retryable, archives on next sweep |
| `PROCESSING_ERROR` | Queue Processor | Catch-all read/parse failure — retries like NEEDS_CURATOR, escalates to terminal after CFG.MAX_RETRIES |
| `INTAKE_PROCESSED` | Queue Processor (legacy) | Alias for PROCESSED, used in v5.4 migration |
| `INTAKE_ERROR` | Studio (error path) | Studio couldn't open or process the document |
| `PARTITIONED` | Legacy | v5.4 chunking status, not used in v8.0 |
| `CONSOLIDATED` | Legacy | v5.4 Phase 4 status, not used in v8.0 |
| `PHASE_2_ERROR` | Legacy | Pre-v8.0 catch-all processing error (`archived/legacy-pre-v8/`) — no current code writes this, but it's kept in `TERMINAL_FAILED_STATUSES` (`5_Error_And_Utilities.gs`) so an old row surviving from that era is still recognized as terminal rather than falling through as unrecognized (see `KNOWN_STAGING_STATUSES` / `_isKnownStagingStatus_()` below) |
| `AUDIT_REJECTED` | Queue Processor | The Curator's own output carried a nested `auditor_sign_off` (see `CURATOR_PROMPT.md`) that didn't clear the Auditor's verification pass, and this row exhausted `CFG.MAX_RETRIES` retries — terminal, human review required. The rejected payload and trace log are archived to `AUDIT_LOG` before this status is set (the Drive doc body itself gets overwritten by Studio's next attempt, so this is the only durable record). Below `MAX_RETRIES`, a failed audit instead reverts the row to `PENDING_FLOW` with priority re-release — see `KOS_AUDIT_RETRY_PRIORITY` in `10_Turnstile.gs`. |

**Recognized vs. unrecognized statuses:** `5_Error_And_Utilities.gs`'s
`_isKnownStagingStatus_()` is the single source of truth for whether a
Status value is any of the 15 above — an exact match, or (for
`PROCESSING_ERROR`/`INTAKE_ERROR`, which can carry a `: <message>`
suffix) a prefix match. Anything else is genuinely unrecognized: found in
production as a row stuck at `AUDITING _LOG`, a status no code in this
repo, current or archived, ever writes. `10_Turnstile.gs` alerts once per
row via `_sendChatAlert()`, and `getQueueMetrics()`/`getQueueStatus()`
count it as `unknown` rather than silently excluding it — see
`CHANGELOG.md` for the fix.

---

### SESSION_LOG

One row per processed session.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Payload_UID of the processed session |
| B | Timestamp | DateTime | When the session was processed |
| C | Session_Type | String | From inference: WORKING, PLANNING, REVIEW, DEBRIEF |
| D | Cold_Start | Boolean | Whether this was a cold-start session (no prior context) |
| E | RTP_Version | String | System version at time of processing |
| F | Session_Summary | String | 2-3 sentence summary from inference |

---

### MATRIX_LEDGER

Calibrated vector scores per session. Primary audit trail for domain weighting.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Payload_UID |
| B | Timestamp | DateTime | Processing timestamp |
| C | ARCHITECTURE | Float | 0.0–1.0, calibrated score |
| D | UI | Float | 0.0–1.0, calibrated score |
| E | SECURITY | Float | 0.0–1.0, calibrated score |
| F | PEDAGOGY | Float | 0.0–1.0, calibrated score |
| G | GAS_DEVELOPMENT | Float | 0.0–1.0, calibrated score |
| H | RELATIONAL | Float | 0.0–1.0, calibrated score |
| I | DOMAIN_COMPLIANCE | Float | 0.0–1.0, calibrated score — 7th known vector, added alongside RELATIONAL (CE-SMP Vector Weight Calculation Engine v1.0) |
| J | TOTAL | Float | Sum of all domain scores |

Note: v5.4 had 7 columns (no GAS_DEVELOPMENT or RELATIONAL). `runPhase0Migration()` adds these columns to existing sheets. DOMAIN_COMPLIANCE was added later still, as the 7th `CFG.KNOWN_VECTORS` entry.

---

### DYNAMIC_STATE_MATRIX

Long-format decayed scores per theme per session. Used by the vector router for incubator tracking.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Payload_UID |
| B | Timestamp | DateTime | Processing timestamp |
| C | Theme | String | Domain name (e.g. ARCHITECTURE) or incubator theme |
| D | Raw_Score | Float | Score before decay |
| E | Decayed_Score | Float | Score after time-based decay |
| F | Session_Count | Integer | Number of sessions this theme has appeared in |
| G | Promoted | Boolean | Whether this theme has been promoted to KNOWN_VECTORS |

---

### VECTOR_MATRIX

Wide-format living vector state. One row per session, one column per known vector.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Payload_UID |
| B | Timestamp | DateTime | Processing timestamp |
| C–I | [Known vectors] | Float | Decayed score per domain — 7 columns today (`CFG.KNOWN_VECTORS`: ARCHITECTURE, UI, SECURITY, PEDAGOGY, GAS_DEVELOPMENT, RELATIONAL, DOMAIN_COMPLIANCE); columns expand further on future promotion |
| Second-to-last | INCUBATOR_SIGNALS | String | Comma-separated emerging themes observed this session |
| Last | CHECKSUM | String | MD5 (default; `CFG.MATRIX_ROW_CHECKSUM_ALGO`) of the session UID + every theme score — corruption detection only, not a security control (Law 5, Matrix Row Integrity) |

---

### INCUBATOR

Tracks themes that appear consistently but haven't been promoted to known vectors. Cumulative-score + half-life-decay lifecycle (CE-SMP Vector Weight Calculation Engine v1.0) — replaces the earlier rolling-average design.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Theme | String | Emerging theme name |
| B | First_Detected | DateTime | First session where this theme appeared |
| C | Last_Touched | DateTime | Most recent session that scored this theme |
| D | Session_Count | Integer | Number of sessions this theme has appeared in |
| E | Cumulative_Score | Float | Running score, decayed by half every `CFG.INCUBATOR_HALF_LIFE_DAYS` if untouched; promotes at `CFG.INCUBATOR_PROMOTION_THRESHOLD` |
| F | Raw_Score_Log | String | JSON array of `{session_id, raw_score}` — migrated verbatim into VECTOR_MATRIX on promotion, never re-normalized |
| G | Status | String | INCUBATING, PROMOTED (crossed `CFG.INCUBATOR_PROMOTION_THRESHOLD` on its own), PROMOTED_MANUAL (pinned to Core by explicit operator/Council decision via `pinThemeToCore()` — bypasses the threshold; see `4_Vector_Router.gs`), DECAYED (below `CFG.INCUBATOR_DECAY_FLOOR` — kept for audit, not deleted) |

---

### REGISTRAR_LEDGER

Curriculum-drafts auditing pipeline ledger (`11_Registrar_CogRelay.gs`) — a second, independent pipeline from the session-log flow above. Created lazily on first use, not part of `deployFullSystem()`'s initial sheet provisioning.

| Col | Name | Type | Description |
|---|---|---|---|
| A | File_ID | String | Google Drive file ID of the curriculum draft |
| B | File_Name | String | Original filename |
| C | Current_State | String | State-machine status (e.g. AWAITING_COG1, AWAITING_COG2, AWAITING_CARBON, CRITICAL_FAILURE) |
| D | Cog_1_JSON_Output | String | Stage 1 "Auditor" Master Schema extraction |
| E | Cog_2_JSON_Output | String | Stage 2 "Curator" verification + dissonance score |
| F | Final_Human_Translation | String | Markdown briefing deposited into the Calibration Silo |
| G | Attempt_Tracker | Integer | Consecutive bounce-back count — 3 hits `CRITICAL_FAILURE` (`CFG.REGISTRAR_RETRY_LIMIT`) |
| H | Error_Log | String | Bounce-back / validation error detail |
| I | Timestamp_Intake | DateTime | When `runRegistrarIntake` picked up the file |
| J | Timestamp_Finalized | DateTime | When the file was routed or terminally failed |

Column order matches `CFG.REGISTRAR_COLS` exactly.

---

### ACTION_REGISTER

All action items extracted from sessions.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Source session |
| B | Timestamp | DateTime | When the action was filed |
| C | Type | String | TASK, DECISION, COMMUNICATION, REVIEW |
| D | Item | String | Description of the action |
| E | Owner | String | Assigned owner (name or role) |
| F | Protected_Time_Risk | String | YES or NO — whether this competes with protected time |
| G | Status | String | OPEN, IN_PROGRESS, COMPLETE, DEFERRED |

---

### COG_REGISTRY

Verdicts from all council sessions and individual cog responses.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Session_UID | String | Source session or council ID |
| B | Timestamp | DateTime | When the verdict was filed |
| C | Cog | String | Persona name (e.g. PERSONA_ARCHITECT) |
| D | Final_Status | String | APPROVED, FLAG, VETO |
| E | Summary | String | One-sentence verdict from the cog |

---

### Blackboard

Governance mutations waiting for or having received operator approval. Also
doubles as a general append-only audit log for filed decisions that aren't
document mutations at all — e.g. `3_Queue_Processor.gs`'s SMP-proposal rows
and `4_Vector_Router.gs`'s `pinThemeToCore()` audit rows both write here with
`Deploy_Trigger` left `FALSE` and `Status` already resolved, using
`Find_String`/`Replace_Payload` as an informational `[title]`/summary pair
rather than literal find-replace text — so `onGovernanceEdit` (which only
acts on an explicit `Deploy_Trigger` edit) never mistakes them for a pending
mutation.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Target_Doc_ID | String | Drive file ID of the document to be mutated |
| B | CE_Tag | String | CE-code identifier for the mutation |
| C | Doc_Title | String | Human-readable document title |
| D | Version | String | Version string for the mutation |
| E | Find_String | String | Exact text to find in the target document |
| F | Replace_Payload | String | Replacement text |
| G | Alt_Doc_ID | String | Optional second document to apply the same mutation |
| H | Notes | String | Context about why this mutation is proposed |
| I | Filed_By | String | Who filed the mutation (persona or operator) |
| J | Filed_Date | DateTime | When it was filed |
| K | Status | String | STAGED_FOR_REVIEW, DEPLOYED, FAILED |
| L | Deploy_Trigger | Boolean | Set to TRUE to execute the mutation (triggers onGovernanceEdit) |

**Deploy_Trigger behavior:** Setting column L to TRUE while the spreadsheet is open triggers the `onGovernanceEdit` installable trigger. KOS reads the row, runs `applyMutation()` on the target document, and sets Status to DEPLOYED. The checkbox resets to FALSE whether the mutation succeeds or fails.

---

### EXECUTION_LEDGER

Audit log of all files processed by the Semantic Sweeper.

| Col | Name | Type | Description |
|---|---|---|---|
| A | UID | String | Stamped UID added to the filename |
| B | TIMESTAMP | DateTime | When the file was routed |
| C | SEMANTIC_TAG | String | CE tag that matched (e.g. CE-CODE) |
| D | FILE_URL | String | Google Drive URL of the routed file |
| E | STATUS | String | ROUTED |

---

### ONBOARDING_TRACKER

Day-by-day log of onboarding milestones.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Day | Integer | Onboarding day number (1–21) |
| B | Date | DateTime | Calendar date |
| C | Event | String | Event type (e.g. SESSION_COMPLETE, WEB_ONBOARDING_COMPLETE) |
| D | Note | String | Optional context |
| E | Vision_90_Day | String | Operator's 90-day vision at time of logging |

---

### EXTERNAL_TELEMETRY

Data submitted via Sensor 3 (onChange on BRAIN_TRUST_INDEX).

| Col | Name | Type | Description |
|---|---|---|---|
| A | Timestamp | DateTime | When the data arrived |
| B | Title | String | Source title or description |
| C | Content | String | Raw content (first 10,000 chars) |
| D | Status | String | QUEUED, PROCESSED |
| E | Payload_UID | String | UID of the corresponding STAGING_PIPELINE row |

---

### ERROR_LOG

All errors reported by `_reportError()`.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Timestamp | DateTime | When the error occurred |
| B | Context | String | Function name or operation that failed |
| C | Message | String | Error message |
| D | Stack | String | First 800 chars of the stack trace |
| E | Reported_At | DateTime | When the daily digest included this error (blank = unreported) |

---

### AUDIT_LOG

Every Curator output rejected by the Auditor accountability check (`_archiveAuditFailure_()`, `5_Error_And_Utilities.gs`) — the only durable record of a rejection, since the Drive doc body itself gets overwritten the moment Studio reruns that row.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Timestamp | DateTime | When this rejection was recorded |
| B | Payload_UID | String | STAGING_PIPELINE row's Payload_UID |
| C | Staging_Row | Integer | STAGING_PIPELINE row number at time of rejection, for cross-reference |
| D | Retry_Count | Integer | This row's Retry_Count after this rejection |
| E | Audit_Status | String | The `auditor_sign_off.status` value that failed (e.g. anything not `PASSED`) |
| F | Unverified_Claims_Count | Integer | `auditor_sign_off.unverified_claims_count` at time of rejection |
| G | Trace_Log | JSON string | `auditor_sign_off.trace_log` — the claim-by-claim verification detail |
| H | Rejected_Payload | JSON string | The full Curator output that was rejected |

---

### STAGING_ARCHIVE

Completed STAGING_PIPELINE rows moved by `archiveStagingPipeline()`.

| Col | Name | Type | Description |
|---|---|---|---|
| A | Archived_At | DateTime | When the row was archived |
| B–H | [All STAGING_PIPELINE columns] | — | Exact copy of the original row |

---

## Drive Folder Structure

```
[KOS Root Folder]
├── 01_Canonical_Foundation
│   ├── 01.1_Scripts_And_Code
│   ├── 01.2_SOP_And_Flows
│   └── 01.3_SMP_Proposals
├── 02_Council_Alignments
│   ├── PERSONA_ARCHITECT_V5
│   ├── PERSONA_AUDITOR_V5
│   ├── PERSONA_MUSE_V5
│   ├── PERSONA_DEVELOPER_V5
│   ├── PERSONA_ALIGNER_V5
│   ├── PERSONA_CURATOR_V5
│   └── PERSONA_ALIGNMENT_V5
├── 03_Dynamic_State
│   ├── 03.1_Current_State         ← CURRENT_STATE doc, daily primers
│   ├── 03.2_Pivots_And_Lessons    ← PIVOTS_AND_LESSONS doc
│   ├── 03.3_Processed_Exhaust     ← Processed session docs
│   ├── 03.4_Raw_Exhaust           ← Unprocessed intake docs
│   └── 03.5_Inbound_Sessions      ← Folder-drop target for large payloads
├── 04_Council_Logs
│   ├── 04.1_Architect_Logs
│   ├── 04.2_Auditor_Logs
│   ├── 04.3_Muse_Logs
│   ├── 04.4_Developer_Logs
│   ├── 04.5_Aligner_Logs
│   ├── 04.6_Curator_Logs
│   ├── 04.7_RTP_Logs
│   └── 04.8_Graveyard
├── 05_Vector_Repository
├── 06_Production_Assets
│   ├── 06.1_Lesson_Plans
│   ├── 06.2_Student_Facing
│   ├── 06.3_Assessments
│   └── 06.4_Communications
├── 07_Memory_Vault
├── 08_Project_Autopsies
└── CCPS_Master_Templates
```

---

## Key Drive Documents

| Document name | Location | Purpose |
|---|---|---|
| `BRAIN_TRUST_INDEX` | Root folder | Central spreadsheet — all sheets live here |
| `CORE_THESIS` | 01_Canonical_Foundation | Sealed operator philosophy — seeded by onboarding |
| `CURRENT_STATE` | 03.1_Current_State | Rolling state document — next steps and deferred decisions |
| `PIVOTS_AND_LESSONS` | 03.2_Pivots_And_Lessons | Rolling lessons log — updated each session |
| `DAILY_PRIMER_YYYY-MM-DD` | 03.1_Current_State | Daily session starter (generated 06:00 each morning) — one new file per day, kept forever as an audit trail |
| `KOS_LATEST_PRIMER` | 03.1_Current_State | The same content as the dated primer above, but as one fixed-name doc overwritten in place every run instead of a new file each day — the integration point for anything external that watches a single Drive file for edits rather than a folder for new files (e.g. a NotebookLM source, which only auto-syncs an existing Drive-native file). Its doc ID is tracked in `CFG.PROP.LATEST_PRIMER_DOC_ID` so it's found by ID, not by name search, after the first run. |
| `PERSONA_[NAME]_V5` | 02_Council_Alignments | AI persona calibration docs (7 total) |

---

## PropertiesService Key Registry

All keys stored via `PropertiesService.getScriptProperties()`.

### Asset ID Pointers (routing cache)

| Key | Description |
|---|---|
| `INDEX_ID` | BRAIN_TRUST_INDEX spreadsheet ID |
| `ID_CURRENT_STATE` | CURRENT_STATE Google Doc ID |
| `ID_PIVOTS_AND_LESSONS` | PIVOTS_AND_LESSONS Google Doc ID |
| `ID_CORE_THESIS` | CORE_THESIS Google Doc ID |
| `ID_00_RAW_EXHAUST` | 03.4_Raw_Exhaust folder ID |
| `ID_01_1_SCRIPTS` | 01.1_Scripts_And_Code folder ID |
| `ID_01_2_SOP_AND_FLOWS` | 01.2_SOP_And_Flows folder ID |
| `ID_01_3_SMP_PROPOSALS` | 01.3_SMP_Proposals folder ID |
| `ID_02_COUNCIL_ALIGNMENTS` | 02_Council_Alignments folder ID |
| `ID_03_DYNAMIC_STATE` | 03_Dynamic_State folder ID |
| `ID_03_1_CURRENT_STATE` | 03.1_Current_State folder ID |
| `ID_03_2_PIVOTS` | 03.2_Pivots_And_Lessons folder ID |
| `ID_03_3_PROCESSED` | 03.3_Processed_Exhaust folder ID |
| `ID_03_5_INBOUND_SESSIONS` | 03.5_Inbound_Sessions folder ID |
| `ID_04_COUNCIL_LOGS` | 04_Council_Logs folder ID |
| `ID_05_VECTOR_REPOSITORY` | 05_Vector_Repository folder ID |

### Calibration Keys (PIVOT 008 — never logged)

| Key | Default | Description |
|---|---|---|
| `THEME_ARCHITECTURE` | `0.75` | Weighting multiplier for ARCHITECTURE domain |
| `THEME_PEDAGOGY` | `0.75` | Weighting multiplier for PEDAGOGY domain |
| `THEME_FAMILY_ALIGNMENT` | `0.75` | Weighting multiplier for RELATIONAL domain |
| `SOCRATIC_THRESHOLD` | `0.75` | Alignment check sensitivity (< 0.85 = YELLOW fires as error) |
| `IDENTITY_KEY_SALT` | — | Private passphrase used in Identity Key derivation |
| `IDENTITY_KEY` | — | Derived 16-char uppercase key (never exposed in logs) |

### Operator Properties (onboarding state)

| Key | CFG.PROP reference | Description |
|---|---|---|
| `KOS_OPERATOR_ROLE` | `CFG.PROP.OPERATOR_ROLE` | Primary role string |
| `KOS_OPERATOR_AUDIENCE` | `CFG.PROP.OPERATOR_AUDIENCE` | Who the operator serves |
| `KOS_ADMIN_GHOST` | `CFG.PROP.ADMIN_GHOST` | Administrative drag description |
| `KOS_NECESSARY_STRUGGLE` | `CFG.PROP.NECESSARY_STRUGGLE` | Friction the operator refuses to automate |
| `KOS_RELATIONAL_TARGETS` | `CFG.PROP.RELATIONAL_TARGETS` | Comma-separated relational target names |
| `KOS_VISION_90_DAY` | `CFG.PROP.VISION_90_DAY` | 90-day vision statement |
| `KOS_DEPLOYMENT_TYPE` | `CFG.PROP.DEPLOYMENT_TYPE` | INDIVIDUAL, EDUCATOR, or COMMERCIAL |
| `CORE_THESIS_VERIFIED` | `CFG.PROP.THESIS_VERIFIED` | `'true'` once onboarding is complete |
| `KOS_ONBOARDING_DAY` | `CFG.PROP.ONBOARDING_DAY` | Current day number (1–21) |
| `KOS_ONBOARDING_START` | `CFG.PROP.ONBOARDING_START` | ISO timestamp of onboarding completion |
| `KOS_ADMIN_EMAIL` | — | Email address for daily error digests |

### Optional Integration Keys (never hardcoded, unset by default)

| Key | CFG.PROP reference | Description |
|---|---|---|
| `KOS_MANAGED_SERVICE_BASE_URL` | `CFG.PROP.MANAGED_SERVICE_BASE_URL` | Base URL of the optional `inference-service/` deployment — only read when `CFG.INFERENCE_MODE = 'MANAGED_SERVICE'` |
| `KOS_MANAGED_SERVICE_API_KEY` | `CFG.PROP.MANAGED_SERVICE_API_KEY` | API key for the optional `inference-service/` deployment |
| `KOS_CHAT_WEBHOOK_URL` | `CFG.PROP.CHAT_WEBHOOK_URL` | Google Chat incoming webhook for `_sendChatAlert()` (Registrar Fail Loud Protocol, Apollo Kill-Switch). Degrades to a console.log no-op if unset |

### Runtime State

| Key | Description |
|---|---|
| `KOS_SHADOW_MATRIX` | JSON blob — shadow matrix confidence intervals |
| `KOS_PROMOTED_VECTORS` | JSON array — themes promoted from incubator |
| `COUNCIL_LAST_RUN` | Unix ms timestamp of last council execution |
| `COUNCIL_ACTIVE_ID` | ID string of the currently running council session |
| `COUNCIL_EXPECTED_VERDICTS` | Number of cog verdicts expected for active council |
| `COUNCIL_VERDICTS_RECEIVED` | Number received so far |

---

## Shadow Matrix JSON Shape

Stored under `KOS_SHADOW_MATRIX` in PropertiesService.

```json
{
  "admin_ghost": {
    "inferred_value": "Grading formatting 4hr/wk, parent email management 3hr/wk",
    "confidence": 0.72,
    "status": "HYPOTHESIZED",
    "evidence_count": 14,
    "last_updated": "2025-05-15T09:22:00.000Z"
  },
  "relational_targets": {
    "inferred_value": "Alice, Bob, Carol",
    "confidence": 0.81,
    "status": "VERIFIED",
    "evidence_count": 22,
    "last_updated": "2025-05-15T09:22:00.000Z"
  },
  "necessary_struggle": {
    "inferred_value": "",
    "confidence": 0.12,
    "status": "HYPOTHESIZED",
    "evidence_count": 3,
    "last_updated": "2025-05-10T14:10:00.000Z"
  },
  "prime_directive": {
    "inferred_value": "",
    "confidence": 0.0,
    "status": "UNKNOWN",
    "evidence_count": 0,
    "last_updated": ""
  },
  "temporal_constraints": {
    "inferred_value": "",
    "confidence": 0.0,
    "status": "UNKNOWN",
    "evidence_count": 0,
    "last_updated": ""
  }
}
```

Status values: `UNKNOWN` (0.0–0.09), `HYPOTHESIZED` (0.10–0.74), `VERIFIED` (0.75–1.0)

---

## CE Tag → Folder Routing Map

The Semantic Sweeper routes files in Drive root based on CE tag prefix. Full map:

| CE Tag | Target folder property |
|---|---|
| `CE-CODE` | `ID_01_1_SCRIPTS` |
| `CE-FLOW` | `ID_01_2_SOP_AND_FLOWS` |
| `CE-SMP` | `ID_01_3_SMP_PROPOSALS` |
| `CE-COG` | `ID_02_COUNCIL_ALIGNMENTS` |
| `CE-STATE` | `ID_03_DYNAMIC_STATE` |
| `CE-CURR` | `ID_03_1_CURRENT_STATE` |
| `CE-PIVOT` | `ID_03_2_PIVOTS` |
| `CE-PROC` | `ID_03_3_PROCESSED` |
| `CE-LOG` | `ID_04_COUNCIL_LOGS` |
| `CE-ARCH` | `ID_04_1_ARCHITECT` |
| `CE-AUD` | `ID_04_2_AUDITOR` |
| `CE-MUSE` | `ID_04_3_MUSE` |
| `CE-DEV` | `ID_04_4_DEVELOPER` |
| `CE-ALIGN` | `ID_04_5_ALIGNER` |
| `CE-CUR` | `ID_04_6_CURATOR` |
| `CE-RTP` | `ID_04_7_RTP` |
| `CE-GRAVE` | `ID_04_8_GRAVEYARD` |
| `CE-VECTOR` | `ID_05_VECTOR_REPOSITORY` |
| `CE-PRD` | `ID_06_1_LESSON_PLANS` |
| `CE-LESSON` | `ID_06_2_STUDENT_FACING` |
| `CE-RUBRIC` | `ID_06_3_ASSESSMENTS` |
| `CE-COMM` | `ID_06_4_COMMUNICATIONS` |
| `CE-VAULT` | `ID_07_MEMORY_VAULT` |
| `CE-AUTOPSY` | `ID_08_PROJECT_AUTOPSIES` |
| `CE-TEMPLATE` | `ID_CCPS_MASTER_TEMPLATES` |
| `CE` (catch-all) | `ID_00_RAW_EXHAUST` |
| `KOS` (catch-all) | `ID_00_RAW_EXHAUST` |
