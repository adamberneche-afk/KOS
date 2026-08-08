# RTP Deployment Guide
## Recursive Thought Partner v2.0 — Full Build

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| Google Account | google.com |
| Gemini API Key | https://aistudio.google.com/ (free tier available) |
| Python 3.8+ | python.org (for local scaffold only) |
| Access to Google Drive, Docs, Sheets, Forms, Apps Script | Included with Google account |

---

## Phase 1 — Local Scaffold (Python)

Run this on your machine to generate your local documentation files.

```bash
# 1. Place these files in the same folder:
#    setup.py, create_documents.py, config.json

# 2. Run setup
python setup.py
```

This generates: `CLAUDE.md`, `PRD.md`, `APP_FLOW.md`, `TECH_STACK.md`,
`IMPLEMENTATION_PLAN.md`, `progress.txt`, `lessons.md`, `config.json`

**Fill these in before moving to Phase 2:**
- Open `CLAUDE.md` → add your project name, constraints, and tech stack
- Open `progress.txt` → set your current status

---

## Phase 2 — Google Apps Script Setup

### Step 2.1 — Create the GAS Project

1. Go to https://script.google.com
2. Click **New Project**
3. Rename it to `RTP_System`
4. Delete the default `function myFunction()` code

### Step 2.2 — Add All Five Script Files

For each `.gs` file in the `/gas` folder, create a new script file:

1. Click the **+** next to "Files" → select **Script**
2. Name it exactly as shown (without `.gs`):

| File to create | Content from |
|---|---|
| `Genesis_Module` | `gas/Genesis_Module.gs` |
| `Intake_Pipeline` | `gas/Intake_Pipeline.gs` |
| `Vector_Router` | `gas/Vector_Router.gs` |
| `Council_Simulator` | `gas/Council_Simulator.gs` |
| `Governance_Engine` | `gas/Governance_Engine.gs` |

Paste the full contents of each file into its corresponding script file.

> ⚠️ **Important:** `Vector_Router` must be in the same project as `Intake_Pipeline`
> because `Intake_Pipeline` calls `VectorRouter.route()` directly.

### Step 2.3 — Add Your Gemini API Key

1. In the GAS editor, click **Project Settings** (gear icon)
2. Scroll to **Script Properties**
3. Click **Add script property**
4. Add this property:

| Property | Value |
|---|---|
| `GEMINI_API_KEY` | Your key from aistudio.google.com |

---

## Phase 3 — Run Genesis (One Time Only)

1. In the GAS editor, select `Genesis_Module` from the file list
2. In the function dropdown at the top, select `runGenesis`
3. Click **▶ Run**
4. **Authorize permissions** when prompted:
   - Google Drive (read/write)
   - Google Docs (create/edit)
   - Google Sheets (create/edit)
   - Gmail (send emails)
5. Check the **Execution Log** — you should see:

```
✅ Created folder: [01_Canonical_Foundation]
✅ Created folder: [02_Council_Alignments]
✅ Created folder: [03_Dynamic_State]
✅ Created folder: [04_Council_Logs]
✅ Created folder: [05_Vector_Repository]
✅ Created doc: CORE_THESIS
✅ Created doc: COUNCIL
✅ Created doc: PERSONA_ARCHITECT
✅ Created doc: PERSONA_MUSE
✅ Created doc: PERSONA_AUDITOR
✅ Created doc: CURRENT_STATE
✅ Created doc: PIVOTS_AND_LESSONS
✅ Created doc: COUNCIL_INTERJECTIONS
✅ Created sheet: BRAIN_TRUST_INDEX
✅ System IDs stored in Script Properties.
✅ Genesis complete. All infrastructure is live.
```

6. Check your email — you should receive a **Genesis Complete** confirmation
7. Click the Drive link in the email to verify your folder structure

---

## Phase 4 — Create the Intake Form

1. Go to https://forms.google.com → **New Form**
2. Title it: `RTP Session Log`
3. Delete any default questions
4. Add **one question:**
   - Type: **Paragraph**
   - Question text: `Paste your full AI session log here`
   - Mark as **Required**
5. Click the **Google Sheets icon** (top right, "Link to Sheets")
   - Select: **Select existing spreadsheet**
   - Choose: `BRAIN_TRUST_INDEX` (in your `Active_Brain_Trust_System` folder)
   - A new tab `Form Responses 1` will appear in the sheet — this is normal

### Set the onFormSubmit Trigger

1. Back in the GAS editor, click **Triggers** (clock icon, left sidebar)
2. Click **+ Add Trigger**
3. Configure:

| Setting | Value |
|---|---|
| Function to run | `processNewLog` |
| Deployment | `Head` |
| Event source | `From spreadsheet` |
| Event type | `On form submit` |
| Spreadsheet | Select `BRAIN_TRUST_INDEX` |

4. Click **Save** → authorize if prompted

### Test the Intake Pipeline

1. Open your Google Form
2. Submit a test log (paste any text longer than 50 characters)
3. Wait ~30 seconds
4. Check `BRAIN_TRUST_INDEX` → `LOG_INDEX` tab — a new row should appear
5. Check `[05_Vector_Repository]` folder — a `VECTOR_*` doc may have been created

---

## Phase 5 — Set Automation Triggers

### Council Simulator (Hourly)

1. In GAS Triggers, click **+ Add Trigger**

| Setting | Value |
|---|---|
| Function | `runCouncilSynthesis` |
| Event source | `Time-driven` |
| Type | `Hour timer` |
| Interval | `Every hour` |

### Governance Engine (Every 4 Hours)

1. Add another trigger:

| Setting | Value |
|---|---|
| Function | `runGovernanceCycle` |
| Event source | `Time-driven` |
| Type | `Hour timer` |
| Interval | `Every 4 hours` |

---

## Phase 6 — Deploy the Governance Web App

The Web App enables one-click approvals from emails (promote to thesis, create vector, etc.)

1. In GAS editor, make sure `Governance_Engine` file is selected
2. Click **Deploy** → **New deployment**
3. Click the gear icon next to **Type** → select **Web app**
4. Configure:

| Setting | Value |
|---|---|
| Description | `RTP Governance Handler` |
| Execute as | `Me` |
| Who has access | `Anyone with Google Account` |

5. Click **Deploy** → authorize → copy the **Web App URL**

6. Back in **Script Properties**, add:

| Property | Value |
|---|---|
| `GOVERNANCE_WEB_APP_URL` | The URL you just copied |

> 🔒 **Security note:** The "Anyone with Google Account" setting means only
> people logged into a Google account can trigger actions. Your personal
> approvals are safe.

---

## Phase 7 — NotebookLM Setup

NotebookLM serves as the external appraisal layer — you query it to get
synthesized insights across all your Vector Docs.

1. Go to https://notebooklm.google.com
2. Create a new notebook: `RTP Brain Trust`
3. Click **+ Add sources**
4. Add all of the following from your Google Drive:
   - `CORE_THESIS`
   - `CURRENT_STATE`
   - `PIVOTS_AND_LESSONS`
   - `COUNCIL_INTERJECTIONS`
   - Any `VECTOR_*` docs that exist

5. **Repeat this step weekly** as new Vector Docs are created
   (the Governance Engine will email you when new ones need to be added)

### Recommended NotebookLM queries:
```
"What are my top 3 architectural decisions from the last month?"
"What patterns appear across my Auditor notes?"
"Compare my reflections from [Vector A] and [Vector B] — what conflicts exist?"
"What should I focus on next based on all my sessions?"
```

---

## Phase 8 — Daily Workflow

### Starting a Session
1. Open `COUNCIL_INTERJECTIONS` — read latest notes
2. Open `CURRENT_STATE` — review in-progress items
3. Copy relevant sections into your AI chat as context

### Ending a Session
1. Copy your full chat log
2. Open your RTP Google Form
3. Paste the log → Submit
4. Done — the system handles everything else

### Weekly Maintenance (~5 minutes)
- Check your email for governance proposals → approve/reject
- Add any new Vector Docs to your NotebookLM sources
- Review `COUNCIL_INTERJECTIONS` for the week's insights
- Move completed items in `CURRENT_STATE` to `PIVOTS_AND_LESSONS`

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Genesis fails on authorization | Re-run `runGenesis()` after approving all permission scopes |
| `GEMINI_API_KEY` error | Add the key to Script Properties (Project Settings → Script Properties) |
| Form submit doesn't trigger pipeline | Verify the trigger is set to "From spreadsheet" not "From form" |
| No Vector docs being created | Check that your log is >50 chars and Gemini is returning weight >0.7 for a topic |
| Web App returns error | Re-deploy with a new deployment version after any code changes |
| Council not synthesizing | Check SYSTEM_ERRORS tab in BRAIN_TRUST_INDEX for the error message |
| Emails not arriving | Check spam folder; verify `Session.getActiveUser().getEmail()` returns your address |

---

## Architecture Summary

```
Your AI Chat Session
        │
        ▼ (copy + paste log)
  Google Form
        │
        ▼ onFormSubmit
  Intake_Pipeline.gs
        │ Gemini: summarize + weight
        ├──────────────────────────────────────────┐
        ▼                                          ▼
  LOG_INDEX sheet                         Vector_Router.gs
                                                   │ weight > 0.7
                                                   ▼
                                          VECTOR_[TOPIC].gdoc
                                                   │
                                          COUNCIL_INTERJECTIONS
                                          (council flags written)
                                                   │
                                          ┌────────┴─────────┐
                                          ▼                   ▼
                                 stability > 0.75      new vector proposed
                                          │                   │
                                   Email: promote?    Email: create vector?
                                          │                   │
                                     User clicks         User clicks
                                       APPROVE             APPROVE
                                          │                   │
                                          ▼                   ▼
                                    CORE_THESIS       VECTOR_NEW.gdoc
                                    (permanent law)   (seeded + registered)

  ─ ─ ─ ─ ─ ─ ─ ─ Async Loops ─ ─ ─ ─ ─ ─ ─ ─

  Every 1 hour:  Council_Simulator → COUNCIL_INTERJECTIONS
  Every 4 hours: Governance_Engine → integrity audit + source gap alerts
```

---

## File Reference

| File | Location | Purpose |
|---|---|---|
| `Genesis_Module.gs` | GAS Project | One-time Drive scaffold builder |
| `Intake_Pipeline.gs` | GAS Project | Form submit handler + Gemini analysis |
| `Vector_Router.gs` | GAS Project | Semantic routing to Vector Docs |
| `Council_Simulator.gs` | GAS Project | Hourly 3-persona synthesis |
| `Governance_Engine.gs` | GAS Project | 4-hour audits + Web App handler |
| `setup.py` | Local | Generates local markdown scaffold |
| `create_documents.py` | Local | Creates individual doc files |
| `config.json` | Local | System configuration |
| `CLAUDE.md` | Local + AI context | Master AI instruction file |
| `BRAIN_TRUST_INDEX` | Google Sheets | Command center + all metadata |
| `CORE_THESIS` | Google Docs | Permanent project law |
| `COUNCIL_INTERJECTIONS` | Google Docs | Async persona notes |
| `CURRENT_STATE` | Google Docs | Live session state |
| `VECTOR_[TOPIC]` | Google Docs | Thematic knowledge silos |

---

*RTP v2.0 — Recursive Thought Partner | Full Build*
