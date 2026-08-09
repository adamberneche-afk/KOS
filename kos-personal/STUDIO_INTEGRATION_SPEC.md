# KOS v8.0 — Studio Integration Specification

This document defines the complete contract between KOS v8.0 and Workspace Studio (or any AI inference engine used as a drop-in replacement). It is written for the developer building the Studio side of the integration.

---

## The Problem This Solves

KOS creates session documents and queues them for AI inference. Studio is responsible for reading those documents, running inference, and writing structured output back. KOS then routes that structured output to the appropriate ledgers. Without Studio, rows sit at `STUDIO_ACTIVE` indefinitely. Without this spec, Studio cannot know what to read, what to produce, or how to signal completion.

---

## Overview of the Handshake

```
KOS Sensor 1         Creates chunk doc in Drive
KOS Turnstile        PENDING_FLOW → STUDIO_ACTIVE
Studio               Reads STUDIO_ACTIVE rows
Studio               Opens Drive doc at File_ID
Studio               Runs inference on doc text
Studio               Writes JSON back to doc body
Studio               Sets Status = FLOW_COMPLETE
KOS Queue Processor  Reads FLOW_COMPLETE rows
KOS Queue Processor  Parses JSON → fans out to ledgers
```

---

## Step 1 — Authentication

Studio must authenticate to Google with an account that has:
- **Read/Write access to BRAIN_TRUST_INDEX** (the STAGING_PIPELINE spreadsheet)
- **Read/Write access to the Drive docs** referenced in the File_ID column

The simplest approach: use the same Google account that owns the KOS deployment. If Studio runs as a different service account, that account must be granted explicit access to BRAIN_TRUST_INDEX and the relevant Drive folders.

BRAIN_TRUST_INDEX spreadsheet ID is stored in `PropertiesService` under the key `INDEX_ID`. For Studio to find it, you have two options:
1. Hard-code the spreadsheet ID in your Studio configuration after first deploy
2. Read it from a known configuration document in Drive (e.g., a doc named `KOS_CONFIG` in the root folder)

The spreadsheet URL is visible in the web app under Diagnostics → Sensor 2 webhook endpoint region, and directly accessible from the Diagnostics tab system state cards.

---

## Step 2 — Polling for STUDIO_ACTIVE Rows

Studio polls STAGING_PIPELINE on a schedule. Recommended polling interval: every 5 minutes, offset from the KOS Turnstile trigger to avoid collision.

**Spreadsheet:** BRAIN_TRUST_INDEX (ID from `INDEX_ID` property)
**Sheet tab:** `STAGING_PIPELINE`

**Column map (0-indexed):**

| Index | Column name | Description |
|---|---|---|
| 0 | Timestamp | ISO datetime when the row was created |
| 1 | Payload_UID | Unique identifier for this chunk |
| 2 | Payload_Type | `SESSION_LOG`, `EXTERNAL_DATA`, or `COG_STIMULUS` |
| 3 | Doc_URL | Full Google Drive URL of the chunk document |
| 4 | File_ID | Google Drive file ID of the chunk document |
| 5 | Status | Current pipeline status |
| 6 | Retry_Count | Number of processing attempts |

**Filter:** Fetch all rows where column index 5 (Status) = `STUDIO_ACTIVE`

**Concurrency:** KOS is configured with `TURNSTILE_CONCURRENCY = 1`. Under normal operation, there will be at most one `STUDIO_ACTIVE` row at a time. Studio should handle multiple rows gracefully but is not required to process them in parallel.

**Staleness guard:** KOS automatically resets `STUDIO_ACTIVE` rows that have been active for more than 30 minutes (configurable via `CFG.TURNSTILE_STALE_MINS`). If Studio takes longer than 25 minutes to process a document, it should write an in-progress marker to prevent the reset. A simple approach: overwrite the doc body with `{"status":"IN_PROGRESS","started_at":"..."}` as a provisional write, then replace with the full inference JSON when complete.

---

## Step 3 — Reading the Source Document

For each `STUDIO_ACTIVE` row, open the Drive document at `File_ID` (column index 4).

```javascript
// Google Apps Script example
const doc  = DocumentApp.openById(fileId);
const text = doc.getBody().getText();
```

```python
# Python example (Google Drive API)
from googleapiclient.discovery import build
service = build('docs', 'v1', credentials=creds)
document = service.documents().get(documentId=file_id).execute()
text = extract_text(document)  # flatten the structural elements
```

The document body contains the raw session text submitted by the user. For `SESSION_LOG` payload type, this is an AI session transcript. For `COG_STIMULUS` payload type, it is a pre-structured stimulus document with persona context prepended.

**Do not modify the source document before writing your output.** If inference fails mid-way, an empty or partial document body will cause a `NEEDS_CURATOR` status when the queue processor attempts to parse it.

---

## Step 4 — Running Inference

Studio runs inference on the document text according to the payload type.

### SESSION_LOG inference

Read the full session text. Produce structured JSON matching the schema defined in Step 5. The inference prompt should instruct the model to:

- Extract a session summary (2-3 sentences)
- Identify next steps from the session
- Identify deferred decisions with owners and blocking dependencies
- Extract pivots and lessons learned
- Score vector weights for each known domain (0.0 to 1.0)
- Produce cog verdicts from each of the 7 persona perspectives
- Extract action items with owners and protected time risk flags
- Note any SMP proposals filed
- Produce an alignment report with relational status
- Produce alignment observations with confidence deltas for the shadow matrix

### EXTERNAL_DATA inference

Read the external content. Produce a condensed summary and domain vector weights. The other sections (cog_registry, action_exhaust, etc.) may be empty arrays.

### COG_STIMULUS inference

The document body contains both the persona context and the stimulus. Read the persona section (marked with `─── YOUR PERSONA ───`) and act as that specific persona. Produce a verdict with `final_status: APPROVED | FLAG | VETO` in the `cog_verdicts` array. Include only the single cog verdict — not all seven. The `cog_name` in the verdict must match the persona name from the stimulus header.

---

## Step 5 — Output JSON Schema

Studio must write the complete inference output as JSON to the document body, replacing the source text entirely.

### Full schema

```json
{
  "session_uid": "LOG-1747392001-a3f2c891",
  "session_summary": "Two-to-three sentence summary of the session.",
  "session_metadata": {
    "session_type": "WORKING | PLANNING | REVIEW | DEBRIEF",
    "cold_start": false,
    "rtp_version": "v8.0"
  },
  "dynamic_state": {
    "next_steps": [
      "Specific actionable next step",
      "Another next step"
    ],
    "deferred_decisions": [
      {
        "decision": "Decision description",
        "owner": "Name or role",
        "blocking": "What this is blocking"
      }
    ],
    "pivots_and_lessons": [
      "Lesson or pivot learned this session"
    ]
  },
  "vector_weights": {
    "ARCHITECTURE":    0.82,
    "UI":              0.45,
    "SECURITY":        0.30,
    "PEDAGOGY":        0.60,
    "GAS_DEVELOPMENT": 0.75,
    "RELATIONAL":      0.55
  },
  "cog_registry": {
    "cog_verdicts": [
      {
        "cog": "ARCHITECT",
        "final_status": "APPROVED",
        "summary": "One sentence verdict summary."
      }
    ]
  },
  "action_exhaust": [
    {
      "type": "TASK | DECISION | COMMUNICATION | REVIEW",
      "item": "Description of the action",
      "owner": "Name or role",
      "protected_time_risk": false
    }
  ],
  "session_delta": {
    "smp_proposals_filed": [
      {
        "proposal_id": "SMP-003",
        "title": "Proposal title",
        "summary": "One sentence summary",
        "filed_by": "Persona or operator",
        "status": "PENDING"
      }
    ]
  },
  "alignment_report": {
    "relational_status_at_closeout": "GREEN | YELLOW | RED",
    "thresholds_crossed_this_session": [],
    "mandatory_pauses_issued": 0
  },
  "alignment_observations": {
    "admin_ghost_signal": "Evidence of admin ghost pattern, or null",
    "relational_signal": "Evidence of relational target protection, or null",
    "necessary_struggle_signal": "Evidence of necessary struggle, or null",
    "prime_directive_signal": "Evidence of core professional purpose, or null",
    "temporal_signal": "Evidence of time protection patterns, or null",
    "confidence_deltas": {
      "admin_ghost":          0.05,
      "relational_targets":   0.00,
      "necessary_struggle":   0.03,
      "prime_directive":      0.02,
      "temporal_constraints": 0.00
    }
  }
}
```

### Schema notes

**`session_uid`** — Use the Payload_UID from the STAGING_PIPELINE row if available. If not, generate one using the pattern `LOG-{unix_ms}-{8_char_hash}`.

**`vector_weights`** — All six domain keys must be present. Values must be 0.0 to 1.0. These are raw scores before KOS applies operator calibration. Do not apply calibration in Studio — KOS applies it during `_applyCalibration()` in the queue processor.

**`cog_verdicts`** — For `SESSION_LOG` payloads, include verdicts from all 7 personas if possible. For `COG_STIMULUS` payloads, include only the single cog specified in the stimulus document.

**`alignment_report.relational_status_at_closeout`** — Must be exactly one of: `GREEN`, `YELLOW`, `RED`. `GREEN` = no relational concerns. `YELLOW` = threshold approached, operator should review. `RED` = relational boundary concern, mandatory pause recommended.

**`confidence_deltas`** — Values of 0.0 mean no evidence observed this session for that shadow question. Positive values (typically 0.03–0.10 per session) indicate observed evidence. Do not use negative values — confidence only increases. Maximum delta per question per session: 0.15.

**Empty sections** — If a section has no data, use an empty array `[]` or `null`. Do not omit keys entirely — the queue processor checks for key existence in some branches.

**Known drift between this spec and the live Curator (found by diffing 5 real processed-log outputs against this doc):**
- `alignment_observations` is documented above and required by `_updateShadowMatrix()`, but the live Curator prompt was not producing it as of this writing — confirm your Curator's actual instructions include it verbatim, not just this spec.
- `session_uid` is documented here as a top-level `LOG-{unix_ms}-{8_char_hash}` field, but the live Curator instead nests the real session identifier at `session_metadata.session_id` in ISO-datetime form. `processIntakePayload()` now checks `session_metadata.session_id` first, then `session_uid`, so either convention works — but pick one and update whichever side (spec or prompt) is wrong, rather than leaving both alive indefinitely.
- Real output also carries `schema_version`, `build_state` (component-level health/status tracking), `session_delta.changes` (a change log distinct from `smp_proposals_filed`), and `cog_registry.cogs_active`/`apex_lead`/`inter_cog_disputes` — none of which are documented above. The queue processor currently ignores all of these safely (no crash, just unused). `build_state.components` in particular looks like a legitimate future write-target if KOS should ever track live code health, not just session history — not built, just flagged as real, structured data currently going nowhere.

---

## Step 6 — Writing Output Back to the Document

Replace the entire document body with the JSON string. The document body must contain only the JSON — no markdown code fences, no preamble, no explanation.

```javascript
// Google Apps Script example
const doc  = DocumentApp.openById(fileId);
const body = doc.getBody();
body.clear();
body.setText(JSON.stringify(inferenceOutput));
doc.saveAndClose();
```

```python
# Python example (Google Docs API)
requests = [
  {'insertText': {'location': {'index': 1}, 'text': json.dumps(inference_output)}}
]
# Clear existing content first, then insert
service.documents().batchUpdate(documentId=file_id, body={'requests': requests}).execute()
```

**Important:** The document body must be valid JSON. The KOS queue processor calls `JSON.parse()` on the document body. If the parse fails, the row becomes `NEEDS_CURATOR`. Common causes of parse failure:
- JSON wrapped in markdown code fences (` ```json ... ``` `)
- Trailing comma in the last array/object element
- Unescaped quote characters in string values
- Truncated output due to token limits

---

## Step 7 — Signalling Completion

After writing the JSON to the document, update the Status column in STAGING_PIPELINE to `FLOW_COMPLETE`.

```javascript
// Google Apps Script example
const ss      = SpreadsheetApp.openById(spreadsheetId);
const staging = ss.getSheetByName('STAGING_PIPELINE');
// Find the row by Payload_UID (column index 1)
const data = staging.getDataRange().getValues();
for (let i = 1; i < data.length; i++) {
  if (data[i][1] === payloadUid) {
    staging.getRange(i + 1, 6).setValue('FLOW_COMPLETE'); // column 6 = Status
    SpreadsheetApp.flush();
    break;
  }
}
```

**Do not set any other status.** Only `FLOW_COMPLETE` triggers the KOS queue processor. Setting any other value (e.g. `PROCESSED`, `DONE`) will leave the row stranded.

The KOS queue processor runs every 10 minutes and will pick up the `FLOW_COMPLETE` row on its next execution.

---

## Error Handling

### If inference fails

Do not write anything to the document body. Do not update the STAGING_PIPELINE row. KOS's staleness guard will reset the row to `PENDING_FLOW` after `TURNSTILE_STALE_MINS` (default 30 minutes), and the Turnstile will re-release it on its next run. The `Retry_Count` column will increment.

After 3 failed retries, the row becomes `FAILED_PARSE` and requires manual intervention.

### If the document cannot be opened

Log the error. Update the STAGING_PIPELINE row Status to `INTAKE_ERROR` with the error message appended. This prevents the row from cycling indefinitely.

### If the JSON output is truncated due to token limits

Split the session into smaller pieces before inference. The KOS `_semanticChunker` should have already chunked the session to under `CFG.MAX_CHUNK_SIZE` (default 25,000 characters). If Studio is consistently producing truncated output, check whether the session text is within this limit before inference.

---

## COG_STIMULUS Special Handling

Council stimulus documents (Payload_Type = `COG_STIMULUS`) require isolated processing. Each cog must be processed independently — the model must not be given the verdicts of other cogs as context.

The stimulus document structure:
```
=== SEQUESTERED COUNCIL STIMULUS ===
Council ID : COUNCIL_1747392001
Cog        : PERSONA_ARCHITECT (1 of 7)
...
BRIDGE_FIDELITY_001: You are operating in sequestered mode.
...
─── YOUR PERSONA ───
[Persona doc content]
─── CONTEXT (CURRENT STATE) ───
[Session state text]
─── LAWS (PIVOTS & LESSONS) ───
[Pivots text]
─── INSTRUCTION ───
[Inference instructions]
```

The output JSON for `COG_STIMULUS` should contain only the `cog_registry` section with a single verdict. All other sections (`vector_weights`, `action_exhaust`, etc.) may be empty or omitted.

```json
{
  "session_uid": "COUNCIL_1747392001_ARCHITECT",
  "cog_registry": {
    "cog_verdicts": [
      {
        "cog": "PERSONA_ARCHITECT",
        "final_status": "APPROVED",
        "summary": "The proposed architecture is sound. Concurrency model is correctly bounded."
      }
    ]
  }
}
```

---

## Testing the Integration

### Minimum viable test

1. Submit a short session log via the web app Ingest tab
2. Wait for Turnstile to set Status to `STUDIO_ACTIVE` (up to 5 minutes, or run `runMatrixTurnstile()` manually)
3. Open the linked document — it contains the raw session text
4. Replace the document body with the minimum valid JSON (see below)
5. Set the STAGING_PIPELINE row Status to `FLOW_COMPLETE`
6. Wait up to 10 minutes for `processInferenceQueue()` to run, or run it manually

**Minimum valid JSON for testing:**
```json
{
  "session_uid": "TEST-001",
  "session_summary": "Test session.",
  "session_metadata": {"session_type": "WORKING", "cold_start": false, "rtp_version": "v8.0"},
  "dynamic_state": {"next_steps": ["Review integration"], "deferred_decisions": [], "pivots_and_lessons": []},
  "vector_weights": {"ARCHITECTURE": 0.5, "UI": 0.5, "SECURITY": 0.5, "PEDAGOGY": 0.5, "GAS_DEVELOPMENT": 0.5, "RELATIONAL": 0.5},
  "cog_registry": {"cog_verdicts": []},
  "action_exhaust": [],
  "session_delta": {"smp_proposals_filed": []},
  "alignment_report": {"relational_status_at_closeout": "GREEN", "thresholds_crossed_this_session": [], "mandatory_pauses_issued": 0},
  "alignment_observations": {"confidence_deltas": {"admin_ghost": 0.0, "relational_targets": 0.0, "necessary_struggle": 0.0, "prime_directive": 0.0, "temporal_constraints": 0.0}}
}
```

### Verifying success

After `processInferenceQueue()` runs:
- The STAGING_PIPELINE row status should be `PROCESSED`
- A new row should appear in `SESSION_LOG`
- A new row should appear in `MATRIX_LEDGER`
- The `CURRENT_STATE` document should have been updated
- The web app Queue tab should show updated counts

If any ledger write failed, the `drip_failures` array in the queue processor log will name the branches that failed. Check the `ERROR_LOG` sheet in BRAIN_TRUST_INDEX for details.

---

## Quick Reference

| What KOS does | What Studio does |
|---|---|
| Creates chunk docs in Drive | Opens chunk docs by File_ID |
| Sets Status = STUDIO_ACTIVE | Polls STAGING_PIPELINE for STUDIO_ACTIVE |
| Waits | Runs inference on doc text |
| Waits | Writes JSON to doc body (replaces text entirely) |
| Waits | Sets Status = FLOW_COMPLETE in STAGING_PIPELINE |
| Parses JSON from doc | Done |
| Routes data to all ledgers | Done |
| Sets Status = PROCESSED | Done |
