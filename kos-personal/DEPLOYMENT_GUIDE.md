# KOS v8.0 — Deployment Guide

> ## 🔄 STATUS (2026-09-05): CODE LIVE, INFRA VERIFIED — Studio flow build paused for rework
>
> Phases 1-3 and 5-10 of this guide are done: the project already existed
> (a real `scriptId` in `.clasp.json` from an earlier partial attempt, same
> pattern leader-hub turned out to have — check there before assuming
> Phase 1's browser-based project creation is actually needed), 13 files
> pushed via `clasp push` (matches `tools/gas-lint/project-map.json`'s
> `kos-personal` list exactly — see the corrected Phase 3 file list below,
> which had been missing `12_StudioReturnHarvest.gs`), two fresh Web App
> deployments created, `KOS_ADMIN_EMAIL` set, all 14 triggers confirmed
> installed and several already firing cleanly, and a real Phase 10 Ingest
> test correctly advanced through `PENDING_FLOW` → `STUDIO_ACTIVE`.
>
> **Studio Integration (the section below) is NOT done.** A first build of
> the Curator flow surfaced real problems — wrong trigger scope, and Studio
> proceeding with a "Workspace sources is turned off" warning instead of
> actually reading the source document, producing fabricated output that
> looked plausible but wasn't grounded in anything real. That output was
> deleted before it could reach `harvestStudioReturns()` (which would have
> overwritten the real document body with it). See
> `CHANGELOG.md`'s most recent Round for the full incident and the
> corrected build approach to use next time — don't repeat the same Flow
> configuration.
>
> **Since that incident, `harvestStudioReturns()` runs an automated
> defense against this exact failure mode: the groundedness gate.** A
> Curator-type return whose output shares none of its own source
> document's distinguishing vocabulary is now marked `SUSPECT_FABRICATION`
> instead of applied — the doc is left untouched, exactly like every other
> failure path in that file. This is a smoke test, not a fact-checker, and
> it does not replace reading the Flow's own run log for the
> "Workspace sources is turned off" warning before trusting a first build —
> see `STUDIO_INTEGRATION_SPEC.md`'s banner for the full rebuild checklist
> (verify the `Status` trigger condition in isolation first, check the run
> log, then try an "Ask a Gem" step in place of a generic "Ask Gemini"
> step). That checklist, not this paragraph, is what to follow when
> actually rebuilding the Flow — nothing here can do that rebuild itself
> (SMP-004: only the operator's own authenticated Studio session can).
>
> **A pre-existing project is not automatically a live-in-use one — verify
> before trusting the label.** `clasp deployments` showed an old deployment
> literally named "V5.4 Core Router Initial Deployment" here, which reads
> like a live-migration red flag per this guide's own "Migrating from
> v5.4" section. Opening the actual web app resolved it in under a
> minute: it showed v8.0's own already-bootstrapped UI (not the "Build My
> Studio" screen), with a "Not started" status and an empty session log —
> meaning a prior session got through Bootstrap under v8.0 itself and
> never used it, and the "V5.4" label was older, unrelated history. Don't
> skip this check on a system with any ambiguous deployment history, but
> also don't let it block progress once actually checked.

This guide takes you from zero to a fully deployed KOS instance with your first session processed. It assumes you have a Google account and basic familiarity with Google Drive.

Estimated time: 20–30 minutes for first deploy. 5 minutes for subsequent deploys.

---

## Before You Start

You need:
- A Google account (personal Gmail or Google Workspace)
- The 13 project files (1–12 numbered .gs files + appsscript.json + 8_WebApp_UI.html) — see the corrected Phase 3 list, `tools/gas-lint/project-map.json` is authoritative
- A Workspace Studio subscription or equivalent AI inference tool for the processing step

You do not need:
- Any coding experience to deploy
- Any special Google Cloud permissions (the default setup handles authorization)
- Any additional paid software beyond what you already use for AI sessions

---

## Phase 1 — Google Cloud Project Setup (One Time)

This step controls what users see on the OAuth consent screen when they first visit your web app. Without it, they see "Unknown app" requesting access to everything in their Drive, which kills trust immediately.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select your existing Apps Script project
3. Navigate to **APIs & Services → OAuth consent screen**
4. Set **App name** to `Knowledge Operating System`
5. Set **User support email** to your email address
6. Set **App logo** (optional — any square image works)
7. Under **Authorized domains**, add `script.google.com`
8. Save

This is a one-time step. Every future deploy uses the same GCP project.

> **What this step is not.** It configures the consent screen of the project
> Apps Script already created for this script — step 2 above says as much.
> It does not create or link a *standard* (non-default) Cloud project, and
> neither does enabling the Drive API in Troubleshooting below. Some
> capabilities do need a standard project: publishing a Workspace Add-on,
> which is what `studio-steps/`'s two custom Studio steps are, and calling
> the Gemini API or Vertex directly with a key. Before building on any of
> those, read the linked project in **Project Settings** rather than
> assuming this phase covered it, and declare what you find in
> [`tools/gas-lint/gcp-map.json`](../tools/gas-lint/gcp-map.json). Getting
> this backwards is a mistake this repo has already made once, on the
> district account, at a cost of 2,113 unreachable lines.

---

## Phase 2 — Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New project**
3. Name it `KOS v8.0` (the name is internal only)
4. In the editor, click the gear icon (**Project Settings**)
5. Check **Show "appsscript.json" manifest file in editor**
6. Click **Editor** to return to the file list

---

## Phase 3 — Add All Files

Add the following files in this order. Order matters for readability; GAS loads all files into one scope at runtime regardless.

**Replace the default `Code.gs`:**
Rename `Code.gs` to `1_Config_And_Deploy` (click the three dots → Rename). Paste the contents of `1_Config_And_Deploy.gs`.

**Add each remaining file:**
For each file, click **+** (Add a file) → **Script**, name it exactly as listed below, paste the contents.

```
1_Config_And_Deploy      ← renamed from Code.gs
2_Ingestion_Sensors
3_Queue_Processor
4_Vector_Router
5_Error_And_Utilities
6_Governance
7_WebApp
9_UI_Diagnostics
10_Turnstile
11_Registrar_CogRelay
12_StudioReturnHarvest   ← ported the write-back around the blocked custom
                           steps (see Studio Integration below); this file
                           was missing from this list until 2026-09-05,
                           confirmed against tools/gas-lint/project-map.json,
                           the authoritative 13-file list for this project
```

**Add the HTML file:**
Click **+** → **HTML**, name it exactly `8_WebApp_UI` (no extension — GAS adds .html automatically). Paste the contents of `8_WebApp_UI.html`.

**Replace appsscript.json:**
Click `appsscript.json` in the file list. Replace the entire contents with the provided `appsscript.json`. This sets the OAuth scopes and web app configuration.

**Do NOT add:**
- `KOS_PHASE0_PATCHES.gs` — this is for migrating from v5.4 only
- `KOS_GAPS_AND_FIXES.gs` — this is a reference document, not project code

---

## Phase 4 — Check for Duplicate Functions

This phase used to require manually deleting a duplicate `_getOrCreateSheet` from `1_Config_And_Deploy.gs` — that duplicate no longer exists in the current codebase; the function is defined once, in `5_Error_And_Utilities.gs`, and `1_Config_And_Deploy.gs` only calls it. Nothing to do here for a fresh checkout.

This class of error (duplicate top-level function/variable declarations across files sharing one Apps Script project) is now caught automatically by `node tools/gas-lint/check.js` before you ever open the Script Editor — run it from the repo root if you want to double-check before saving.

To verify inside the Script Editor anyway: press **Ctrl+S** (or **Cmd+S**). If GAS shows a red error about a duplicate identifier, search all files for that function name and remove the duplicate.

---

## Phase 5 — First Deploy as Web App

**Two separate deployments, both restricted to yourself** (reconciliation
decision 4). Earlier guidance suggested one deployment doubling as both
the dashboard UI and the Sensor 2 webhook, opened to "Anyone with Google
account" if you wanted the webhook reachable. That's no longer the
recommendation: **`appsscript.json`'s `webapp.access` stays `"MYSELF"` for
both deployments — no anonymous endpoint is opened at all.** Whatever
originates a `COG_EXHAUST` payload must authenticate as the same Google
account that deployed the script (an OAuth-authenticated call, a
same-account trigger, or a Gemini/Apps Script integration running as that
identity) — this isn't compatible with a generic public third-party
webhook source, but it means no shared-secret validation is needed either:
Google's own OAuth layer enforces the identity check for you.

**Deployment A — Dashboard (Ingest/Queue/Diagnostics UI):**
1. Click **Deploy** → **New deployment**
2. Click the gear icon next to **Type** → select **Web app**
3. Set **Description** to `KOS v8.0 — Dashboard`
4. Set **Execute as** to `Me`
5. Set **Who has access** to `Only myself`
6. Click **Deploy**
7. **Copy this URL** — this is the one you open in your own browser day to day.

**Deployment B — Sensor 2 webhook (COG_EXHAUST):**
1. Click **Deploy** → **New deployment** again (same project, second deployment)
2. Type: **Web app** · Description: `KOS v8.0 — Webhook` · Execute as: `Me` · Access: `Only myself`
3. Click **Deploy**
4. **Copy this second URL** — this is the one whatever authenticated caller sends `COG_EXHAUST` POSTs to.

Both deployments run the exact same `doGet`/`doPost` code — they differ
only in which URL you hand to which caller. If you don't have anything
that needs to POST to Sensor 2 yet, Deployment B can wait; nothing else
in the system depends on it existing.

---

## Phase 6 — Authorize and Bootstrap

1. Open the web app URL in a browser
2. Google shows an authorization screen listing the permissions the app needs — these match what's declared in `appsscript.json` and should all appear at once
3. Click **Allow**
4. The Bootstrap screen appears: "Build My Studio"
5. Click the button
6. Watch the five progress steps animate — this takes 30–60 seconds
7. When complete, the screen shows "Your studio is ready"
8. The page reloads automatically to the three-tab operational UI

If the progress steps freeze and an error appears: check the technical detail (click "Show technical detail"), look for a red line, and see the Troubleshooting section at the end of this guide.

---

## Phase 7 — Configure Calibration

The system runs immediately after Bootstrap but with default calibration weights. For meaningful vector routing, set your operator-specific values.

**Option A — Fast path (recommended for most users):**
In the web app, go to **Diagnostics** → click **Personalise your advisor**. Complete the 4-step form. This sets your calibration weights, seeds your CORE_THESIS document, and generates your Identity Key. Takes 5 minutes.

**Option B — Editor path (for developers):**
Open `5_Error_And_Utilities.gs` in the Apps Script editor. Find `setupCalibration()`. Fill in your values, run the function once, then immediately clear the values from the function body. The values are now stored in PropertiesService and never appear in code again.

---

## Phase 8 — Set Admin Email

The daily error digest sends to the email address stored as `KOS_ADMIN_EMAIL` in PropertiesService. Without this, error digests silently fail.

1. In the Apps Script editor, go to **Project Settings** → **Script Properties**
2. Add a property: Key = `KOS_ADMIN_EMAIL`, Value = `your@email.com`
3. Save

---

## Phase 9 — Verify Triggers

1. In the editor, open `1_Config_And_Deploy.gs`
2. Run `setupAllTriggers()` (select it from the function dropdown → click Run)
3. Authorize any new permission prompts
4. Go to **Triggers** (clock icon in the left sidebar)
5. Confirm you see 14 triggers installed

Expected trigger list:
- sensor1_scanInboundSessions (every 5 min)
- runMatrixTurnstile (every 5 min)
- harvestStudioReturns (every 5 min)
- processInferenceQueue (every 10 min)
- runSemanticSweeper (hourly)
- sweepRootForExhaust (hourly)
- sendDailyErrorReport (daily)
- generateDailyPrimer (daily)
- autoCouncilCheck (every 2 hours)
- sensor3_externalTelemetry (onChange on BRAIN_TRUST_INDEX)
- onGovernanceEdit (onEdit on BRAIN_TRUST_INDEX)
- runRegistrarIntake (daily 01:00)
- runRegistrarMicrobatch (every 15 min)
- runRegistrarProcessor (every 10 min)

---

## Phase 10 — First Session Test

1. Open the web app
2. Go to the **Ingest** tab
3. Paste any session text (minimum 20 characters — use a real session or a test paragraph)
4. Click **Queue Payload**
5. The success toast says "1 chunk queued. The AI engine will process it within 5 minutes."
6. Switch to the **Queue** tab
7. You should see **Pending: 1** and the metric subtitle "waiting for AI engine"

At this point the row is at `PENDING_FLOW`. The Turnstile will advance it to `STUDIO_ACTIVE` within 5 minutes. Studio then needs to process it — see the **Studio Integration** section below.

**For testing without Studio:** In the Apps Script editor, run `devSetFlowComplete(2)` (row 2 = first data row). This manually advances the row to `FLOW_COMPLETE`. Then run `processInferenceQueue()` manually. The row will process and the ledgers will update.

---

## Studio Integration

> **⚠ The custom-step path is blocked on this account.** Publishing a
> Workspace Add-on needs a standard, non-default Cloud project, and GCP is
> switched off org-wide for `ccpsnet.net` — which is the account this is
> deployed on, despite SMP-004 describing a separate personal one. So
> `kos-personal/studio-steps/`'s two steps cannot run, and the flow is not
> live.
>
> **Build the Flow with native steps and let Apps Script harvest the result.**
> The trigger, the Docs read and both Gemini passes were always native and are
> unaffected; only the write-back moves. Make the Flow's last step a native
> **"add row to sheet"** into the `STUDIO_RETURN` tab of the BRAIN_TRUST_INDEX
> spreadsheet, writing:
>
> | Column | Value |
> |---|---|
> | `Returned_At` | now |
> | `Payload_UID` | the trigger row's `Payload_UID` |
> | `Payload_Type` | the trigger row's `Payload_Type` |
> | `Primary_JSON` | the Curator (or Classification) step's raw output |
> | `Auditor_JSON` | the optional Auditor step's raw output, or blank |
>
> Leave `Harvest_Status`, `Attempts` and `Error` empty — `harvestStudioReturns()`
> owns those. It then strips the markdown fence, merges the Auditor pass under
> `auditor_sign_off`, overwrites the source doc's body, and sets the staging
> row to `FLOW_COMPLETE`. Do **not** have the Flow write `FLOW_COMPLETE`
> itself: on any failure this design deliberately touches nothing, so the
> staleness guard can retry.
>
> While wiring that step, run **`checkStudioFlowBinding()`** — it logs the
> exact binding to copy, generated from the harvest's own column constants,
> and once rows arrive it diagnoses them. It catches one thing no other check
> can: `Payload_Type` doesn't label the row, it **selects a contract**. A
> Curator type gets a merge and re-serialization; anything else gets "write
> verbatim, must parse as an Array". So a *valid* type name that isn't the one
> queued applies the wrong treatment silently, and the probe compares what
> came back against what the pipeline queued for that UID.
>
> Verify with `runStudioReturnCanary()` (proves the Apps Script half with the
> Flow stubbed), then `checkStudioFlowLiveness()` — the only thing that can
> tell you whether a Flow has ever actually written back. A green "Run
> Completed" in the Studio UI cannot: a Flow that matched zero rows reports
> exactly the same thing.
>
> **Rebuilding after the Round 17 pause?** Read
> `STUDIO_INTEGRATION_SPEC.md`'s banner in full before wiring the trigger —
> it has the corrected, numbered rebuild order (verify `Status` alone
> before adding `Payload_Type`, check the run log for a Workspace-sources
> warning before trusting output, try an "Ask a Gem" step). Also watch
> `checkStudioReturns()`'s `suspectFabrication` count once the Flow is
> live: the groundedness gate added since that incident will flag (not
> apply) a return that never actually read its source document, so a
> non-zero count there means look at the Flow, not the harvest.


This is the critical unbuilt piece. Until the Studio integration is live, every session row requires a manual `devSetFlowComplete()` to advance.

See `STUDIO_INTEGRATION_SPEC.md` for the complete specification of what Studio must implement, and `CURATOR_PROMPT.md` (Rule 8) for the optional Auditor accountability pass. The short version: Studio polls for `STUDIO_ACTIVE` rows in STAGING_PIPELINE, reads the Drive document at the `File_ID` column, runs inference, optionally runs a second Auditor step verifying the Curator's own claims against the transcript (merged into the same JSON as `auditor_sign_off` — never written as a second document), writes the JSON back to that document, and sets the `Status` column to `FLOW_COMPLETE`. A row whose `auditor_sign_off` fails verification never reaches the ledgers — it's archived to `AUDIT_LOG` and either retried or, past `CFG.MAX_RETRIES`, escalated to the terminal `AUDIT_REJECTED` status.

---

## Migrating from v5.4

If you have a live v5.4 system, do not deploy v8.0 into the same Apps Script project.

1. **Recover `KOS_PHASE0_PATCHES.gs` first — it is no longer in this repo's working
   tree.** Round 13's dead-code cleanup (`45ad8c8`) deleted `archived/` repo-wide,
   including this file. It is preserved on the `pre-archive-cleanup` branch. A fresh
   clone does not have that branch locally, so fetch it first — without the fetch,
   `git show pre-archive-cleanup:...` fails with "invalid object name" and reads as
   though the branch doesn't exist:

   ```bash
   git fetch origin pre-archive-cleanup
   git show origin/pre-archive-cleanup:kos-personal/archived/legacy-pre-v8/files_37_38_predraft/KOS_PHASE0_PATCHES.gs > KOS_PHASE0_PATCHES.gs
   ```

   `runPhase0Migration()` and `runPhase0Verify()` — steps 3 and 4 below — are defined in
   that file and **nowhere else in the repo**, which is why this step comes first.

   (This step used to read simply "add `KOS_PHASE0_PATCHES.gs`", which stopped being
   followable the moment that cleanup landed — the file it names had no source. The
   `git fetch` line was added after the two-line form was tried in a fresh clone and
   failed for want of it.)
2. Add that recovered file to your existing **v5.4** project. Never add it to the v8.0
   project — see the file list earlier in this guide.
3. Run `runPhase0Migration()` — this migrates the STAGING_PIPELINE schema and MATRIX_LEDGER column structure
4. Run `runPhase0Verify()` — confirm all five checks show ✅
5. Create a new standalone Apps Script project and deploy v8.0 there
6. Your existing BRAIN_TRUST_INDEX spreadsheet works with v8.0 — just ensure `INDEX_ID` in PropertiesService points to it

---

## Troubleshooting

**"Something went wrong" on Bootstrap**
Click "Show technical detail" and look for the first red line. Common causes:
- Drive API not enabled: go to GCP Console → APIs & Services → Enable APIs → search "Drive API" → enable
- Insufficient permissions: check `appsscript.json` has all seven OAuth scopes
- Timeout: click "Try again" — large folder trees occasionally time out on first run

**"Could not acquire lock" in triggers**
Normal if two triggers fire within milliseconds of each other. The next trigger run will process successfully. Check the Queue tab — if rows are stuck at PENDING_FLOW for more than 10 minutes, run `runMatrixTurnstile()` manually from the editor.

**Triggers showing as installed but not firing**
Re-run `setupAllTriggers()`. Installable triggers occasionally become orphaned after a GAS quota reset. The function cleans and reinstalls all triggers.

**ERROR_LOG filling up with TIER_1 cold gate warnings**
Normal before calibration is complete. The system logs "engine cold, skipping" for TIER_1 gated functions. These stop once you complete the "Personalise your advisor" setup in the Diagnostics tab.

**NEEDS_CURATOR rows appearing**
The inference JSON from Studio couldn't be parsed. Open the linked document, check if the body is valid JSON (not a mix of natural language and JSON, not truncated). Replace the body with clean JSON and the queue processor will retry automatically within 10 minutes.

**Web app shows BOOTSTRAP after already deploying**
PropertiesService lost the `INDEX_ID` property. Open the editor → `1_Config_And_Deploy.gs` → run `setupRoutingProperties()`. This re-scans Drive by name and repopulates all ID pointers.

**"Deploy" button in web app takes longer than 60 seconds**
Normal on large Drive accounts where folder searches take time. The progress steps will catch up. If the browser tab closes during deploy, run `setupAllTriggers()` from the editor to ensure triggers are installed — the folder structure will be intact.
