# KOS v8.0 — Deployment Guide

This guide takes you from zero to a fully deployed KOS instance with your first session processed. It assumes you have a Google account and basic familiarity with Google Drive.

Estimated time: 20–30 minutes for first deploy. 5 minutes for subsequent deploys.

---

## Before You Start

You need:
- A Google account (personal Gmail or Google Workspace)
- The 11 project files (1–10 numbered .gs files + appsscript.json + 8_WebApp_UI.html)
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
```

**Add the HTML file:**
Click **+** → **HTML**, name it exactly `8_WebApp_UI` (no extension — GAS adds .html automatically). Paste the contents of `8_WebApp_UI.html`.

**Replace appsscript.json:**
Click `appsscript.json` in the file list. Replace the entire contents with the provided `appsscript.json`. This sets the OAuth scopes and web app configuration.

**Do NOT add:**
- `KOS_PHASE0_PATCHES.gs` — this is for migrating from v5.4 only
- `KOS_GAPS_AND_FIXES.gs` — this is a reference document, not project code

---

## Phase 4 — Remove the Duplicate Function

Before saving, you must remove one duplicate function that would cause a compile error.

In `1_Config_And_Deploy.gs`, search for `function _getOrCreateSheet` and delete the entire function body if it exists. The canonical version lives in `5_Error_And_Utilities.gs`. Having it in both files prevents the project from saving.

To verify: press **Ctrl+S** (or **Cmd+S**). If GAS shows a red error about a duplicate identifier, search all files for any function name it names and remove the duplicate.

---

## Phase 5 — First Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon next to **Type** → select **Web app**
3. Set **Description** to `KOS v8.0 initial`
4. Set **Execute as** to `Me`
5. Set **Who has access** to `Only myself` (change to `Anyone with Google account` if you want to share the URL)
6. Click **Deploy**
7. **Copy the web app URL** — this is your permanent entry point and your Sensor 2 webhook endpoint. Save it somewhere.

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
5. Confirm you see 10 triggers installed

Expected trigger list:
- sensor1_scanInboundSessions (every 5 min)
- runMatrixTurnstile (every 5 min)
- processInferenceQueue (every 10 min)
- runSemanticSweeper (hourly)
- sweepRootForExhaust (hourly)
- sendDailyErrorReport (daily)
- generateDailyPrimer (daily)
- autoCouncilCheck (every 2 hours)
- sensor3_externalTelemetry (onChange on BRAIN_TRUST_INDEX)
- onGovernanceEdit (onEdit on BRAIN_TRUST_INDEX)

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

This is the critical unbuilt piece. Until the Studio integration is live, every session row requires a manual `devSetFlowComplete()` to advance.

See `STUDIO_INTEGRATION_SPEC.md` for the complete specification of what Studio must implement. The short version: Studio polls for `STUDIO_ACTIVE` rows in STAGING_PIPELINE, reads the Drive document at the `File_ID` column, runs inference, writes JSON back to that document, and sets the `Status` column to `FLOW_COMPLETE`.

---

## Migrating from v5.4

If you have a live v5.4 system, do not deploy v8.0 into the same Apps Script project.

1. In your existing v5.4 project, add `KOS_PHASE0_PATCHES.gs`
2. Run `runPhase0Migration()` — this migrates the STAGING_PIPELINE schema and MATRIX_LEDGER column structure
3. Run `runPhase0Verify()` — confirm all five checks show ✅
4. Create a new standalone Apps Script project and deploy v8.0 there
5. Your existing BRAIN_TRUST_INDEX spreadsheet works with v8.0 — just ensure `INDEX_ID` in PropertiesService points to it

---

## Troubleshooting

**"Something went wrong" on Bootstrap**
Click "Show technical detail" and look for the first red line. Common causes:
- Drive API not enabled: go to GCP Console → APIs & Services → Enable APIs → search "Drive API" → enable
- Insufficient permissions: check `appsscript.json` has all six OAuth scopes
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
