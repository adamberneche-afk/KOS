# kos-personal — Studio Rebind Handoff

> ## ⛔ OPEN: both Gemini steps in the Curator Flow are bound to the wrong prompt
>
> **Written:** 2026-09-21, from a live `BRAIN_TRUST_INDEX` export taken
> 2026-09-20.
>
> This is a point-in-time handoff for one specific operator action: rebinding
> the Curator Flow's two Ask Gemini steps in Google Workspace Studio. It is
> not living documentation. `DEPLOYMENT_GUIDE.md` is the guide for deploying
> this system; `STUDIO_INTEGRATION_SPEC.md` is the reference for how the Flows
> are shaped. **When the rebind is done and verified, this file's job is over
> — say so at the top of it or delete it.**
>
> **The one sentence:** the Curator step and the Auditor step are both bound
> to `rtp-core-router/PERSONA_*_V5_1.md` — the interactive chat personas —
> instead of `CURATOR_PROMPT.md` / `CURATOR_AUDITOR_PROMPT.md`, the machine
> contracts the harvest and the audit gate actually read. Nothing downstream
> is broken. Everything downstream is correctly rejecting non-conforming
> output, which is why this looked like four separate failures for ten days.

---

## Why you are here

At the 2026-09-20 export, `STAGING_PIPELINE` held 244 rows: **71 PROCESSED,
87 STUDIO_TIMEOUT, 85 PENDING_FLOW, 1 STUDIO_ACTIVE.** `STUDIO_RETURN` held
233: **118 HARVESTED, 114 FAILED.** That reads like a broken pipeline. It
isn't one.

Both symptoms trace to the same cause, in two different places:

**1. The Auditor returns prose, so the harvest cannot parse it.**
113 of the 114 harvest failures are `*_JSON_PARSE_FAILED`. The discriminator
is clean:

| `Auditor_JSON` shape | HARVESTED | FAILED |
|---|---|---|
| JSON object | 117 | 18 |
| `[🛡 THE AUDITOR]:` prose | 1 | 95 |

`CURATOR_AUDITOR_PROMPT.md` §2 rule 1 requires *"exactly one JSON object …
Raw JSON only — starts with `{`, ends with `}`"*. `PERSONA_AUDITOR_V5_1.md`
§9 ("MANDATORY OUTPUT SYNTAX") requires a prose report containing no JSON at
all. The step is bound to the second one.

**2. The Curator emits the wrong schema, so the audit gate rejects it.**
`AUDIT_LOG` holds exactly 55 rejections, all `Audit_Status: FAILED`, and all
55 are self-consistent (every `unverified_claims_count` matches its own
`trace_log`). All **132** UNVERIFIED claims across them are *format-rule*
violations — zero are accuracy problems:

| Rejection | Count | Contract it breaks |
|---|---|---|
| `[🧹 THE CURATOR — VERIFICATION GATE]` preamble in the output | 55 | `CURATOR_PROMPT.md` — raw JSON only |
| `alignment_observations` key omitted entirely | 39 | `CURATOR_PROMPT.md` rule 2 — required in full |
| `vector_weights` populated with floats | 38 | `CURATOR_PROMPT.md` rule 1 — must always be `null` |

`PERSONA_CURATOR_V5_1.md` mandates the preamble (line 325), populates
`vector_weights` as floats (§5.2), omits `alignment_observations`, and stamps
`schema_version: "5.0"`. It requires precisely what the contract forbids, on
every count. **The Auditor, when it manages to return JSON at all, is the one
component behaving correctly** — its rejections are right.

### How that produced 172 stalled rows

The audit gate (`3_Queue_Processor.gs`) reverts a rejected row to
`PENDING_FLOW` with `Retry_Count 1`, expecting a re-inference. The Turnstile
releases it, it goes stale, and retries 2..N get spent on *staleness* rather
than on further audit attempts — so the row dies at the Turnstile's ceiling,
and `AUDIT_REJECTED` was never once reached. All 55 `AUDIT_LOG` rows are
still at `Retry_Count 1`, which is that whole story in one column.

Commit `a7682ac` fixes the mislabelling. It does **not** fix the cause — only
this rebind does.

---

## Prerequisite: push the code first

Four fixes are committed and pushed to
`claude/kos-handoff-documents-s6f2hj`, but **none of them are live in Apps
Script.** Two of them matter to this rebind directly.

| Commit | What it does | Matters here? |
|---|---|---|
| `7cdbede` | Adds the Auditor's own row to the generated `FlowBuildSpec` | **Yes** — step 2 below reads it |
| `1eabd0d` | `_archiveRawLog_` called `DocumentApp.flush()`, which does not exist | No |
| `a7682ac` | An audit-rejected row no longer dies labelled `STUDIO_TIMEOUT` | **Yes** — step 6 reads the status |
| `00106df` | ERROR_LOG: stops one steady state being recorded 15,000 times | No |

Merge the branch, then push at your own keyboard (SMP-004 — no agent session
touches production). `DEPLOYMENT_GUIDE.md` has the clasp mechanics, including
the v3 command renames and the `--force` requirement; do not re-derive them
from here.

> **Before this particular push**, re-read `DEPLOYMENT_GUIDE.md`'s banner on
> the Round 24 incident: `clasp push` fully mirrors local → remote, so any
> file `.claspignore` does not match is **deleted from the live project,
> silently**. Confirm `clasp push`'s own output lists every numbered file
> plus `appsscript.json` before trusting it.

---

## The rebind

Everything below happens in the Apps Script editor's **Run** dropdown and in
Studio's Flow builder, at your keyboard.

### 1. Regenerate both source-of-truth tabs

```
syncFlowPrompts()          → writes the FlowPrompts tab
syncStudioFlowBuildSpec()  → writes the FlowBuildSpec tab
```

Both are idempotent and touch only their own tab. `FlowBuildSpec` will report
**STALE** until you re-run it, because `7cdbede` added a row — that is the
intended nudge, not a fault.

### 2. Read the spec, then build from it — not from prose

`FlowBuildSpec` now carries a **`Curator | prompt (auditor)`** row it never
had before. Between them, the two prompt rows say exactly what each Gemini
step binds to. Build from that tab, not from this document and not from
`STUDIO_INTEGRATION_SPEC.md`'s prose — generated beats hand-copied
(`meta/FLOW_DOCTRINE.md` rule 11). That rule is the entire reason this
happened: the Auditor had no generated row, so the only written-down binding
for it was prose, and the build reached for the nearest plausible document
instead.

### 3. Rebind the Curator step

In the Curator Flow's **first** Ask Gemini step, set the System Prompt field
to exactly two chips, back to back, **with nothing typed between them**:

1. the `PromptText` output of a Sheets *"Get row"/"Look up row"* step filtered
   on `PromptName = CURATOR_SYSTEM_PROMPT`
2. `@trigger.SourceText`

### 4. Rebind the Auditor step

The **second** Ask Gemini step, the one writing `Auditor_JSON`. This is the
only place in either Flow where you type anything by hand, because it takes
**two** variables rather than one:

1. the `PromptText` chip for `PromptName = CURATOR_AUDITOR_SYSTEM_PROMPT`
2. `@trigger.SourceText` — the transcript
3. then **type this label yourself**, exactly:

   ```
   CURATOR'S OUTPUT TO AUDIT (check this for accuracy and format compliance):
   ```

4. then the **Curator step's own output chip**

`syncFlowPrompts()` prints this same sequence to the execution log when you
run it — if the two ever disagree, the log is right and this file is stale.

### 5. Verify before letting real rows through

Run these in order. Each answers a question the next one would otherwise
confuse:

| # | Run | What a pass means |
|---|---|---|
| 1 | `runKosPersonalPreflight()` | Tabs, triggers and script properties are structurally sound |
| 2 | `checkFlowPrompts()` | The `FlowPrompts` tab matches what the code would generate now |
| 3 | `checkStudioFlowBuildSpec()` | Same for `FlowBuildSpec` — reports STALE if a column moved |
| 4 | `checkStudioFlowBinding()` | Returned rows land in the right columns **and** `Auditor_JSON` actually holds JSON |
| 5 | `checkStudioFlowLiveness()` | A Flow has *ever* written back |
| 6 | `checkStudioReturns()` | Per-row harvest outcomes |

Step 4 is the one that closes this handoff. `checkStudioFlowBinding()` gained
a check in `7cdbede` that flags an `Auditor_JSON` holding no JSON object at
all and names this exact mis-binding. Replayed against the 2026-09-20 export
it caught **70 of 70** real `AUDITOR_JSON_PARSE_FAILED` rows with **zero**
false positives across all 118 harvested ones. If it stays quiet on fresh
returns, the Auditor is bound correctly.

### 6. Then, and only then, deal with the backlog

**Do not requeue anything before steps 3–5 pass.** The 55 rejections are
correct. Requeuing into the same mis-bound Flow reproduces them exactly, and
spends each row's retry budget doing it.

Once fresh returns are harvesting clean:

- **85 `PENDING_FLOW`** rows need nothing — they re-infer on their own against
  the corrected Flow.
- **87 `STUDIO_TIMEOUT`** rows are terminal and will not retry themselves. 13
  of them are audit rejections mislabelled by the bug `a7682ac` fixes; the
  other 74 never completed. Both need a deliberate requeue.
- There is **no requeue helper in the repo yet.** Ask for one rather than
  hand-editing 87 statuses in the sheet — the retry counters and the
  release map both have to agree with whatever you set.

---

## What this does not fix

- **The 1,807 `sensor1` "Service Documents failed" errors.** Different cause
  entirely (transient Drive rate-limiting while draining a large inbound
  backlog), already tailed off on its own by 2026-09-16.
- **The 15,000 dead ERROR_LOG rows.** `00106df` stops them recurring and adds
  `archiveErrorLog()`; one run at the 30-day default moves 9,645 rows aside.
  Unrelated to Studio.
- **Anything about the classification Flow.** `VectorClassifyInput` held 1
  row against the Curator's 241. It is not implicated in any of this, and its
  prompt binding was not examined.

---

## If you only read one thing

Both Gemini steps in the Curator Flow are pointed at the RTP chat personas.
Point them at the `FlowPrompts` chips instead — `CURATOR_SYSTEM_PROMPT` and
`CURATOR_AUDITOR_SYSTEM_PROMPT` — then run `checkStudioFlowBinding()`. If it
reports nothing, this is closed.
