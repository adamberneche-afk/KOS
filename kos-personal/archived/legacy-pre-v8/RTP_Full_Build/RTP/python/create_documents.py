"""
RTP Document Creator — v2.0
Generates the canonical local documentation scaffold.
Called by setup.py automatically.
"""

import os
from datetime import date

TODAY = date.today().isoformat()

DOCUMENTS = [
    {
        "name": "CLAUDE.md",
        "description": "Master Configuration File — Primary AI context anchor",
        "content": f"""# CLAUDE.md — Master Configuration
> **This is the primary truth file. All AI agents must read this first.**
> Generated: {TODAY}

---

## 1. Project Identity
- **Project Name:** [YOUR PROJECT NAME]
- **Version:** 0.1.0
- **Status:** Active Development
- **Primary Goal:** [One sentence describing what this project does]

---

## 2. Architectural Constraints (Non-Negotiable)
These decisions are locked. Do not propose alternatives without explicit discussion.

- [ ] Constraint 1: [e.g., "All data persistence via Google Drive. No external DB."]
- [ ] Constraint 2: [e.g., "No paid third-party APIs except Gemini"]
- [ ] Constraint 3: [Add your own]

---

## 3. Tech Stack
| Layer      | Technology         | Notes                          |
|------------|-------------------|-------------------------------|
| Automation | Google Apps Script | V8 Engine, ES2019 compatible   |
| AI/LLM     | Gemini 2.0 Flash   | Via AI Studio API key          |
| Storage    | Google Drive/Sheets| Drive-as-database pattern      |
| Interface  | Google Forms       | Session log intake             |
| Analysis   | NotebookLM         | External appraisal layer       |

---

## 4. The Council of Experts
When prompting an AI, invoke personas explicitly:
- **"As the Architect..."** — for structural and backend decisions
- **"As the Muse..."** — for creative and UX decisions  
- **"As the Auditor..."** — to stress-test assumptions

---

## 5. File Hierarchy (Authority Order)
```
CORE_THESIS.gdoc          ← Permanent law (highest authority)
  └── COUNCIL.md          ← Interaction protocols
      └── CURRENT_STATE   ← Active session state
          └── VECTOR_DOCS ← Thematic knowledge silos
              └── LOG_INDEX ← Raw session history
```

---

## 6. Known Anti-Patterns (DO NOT REPEAT)
See PIVOTS_AND_LESSONS.gdoc for full history.
- [Add lessons here as you discover them]

---

## 7. Session Protocol
At the **start** of every AI session, paste:
1. Relevant section of CURRENT_STATE
2. Latest COUNCIL_INTERJECTIONS
3. Any active CORE_THESIS constraints

At the **end** of every session:
1. Submit the full chat log via the RTP Google Form
2. The system handles the rest automatically
"""
    },
    {
        "name": "PRD.md",
        "description": "Product Requirements Document",
        "content": f"""# Product Requirements Document
> Generated: {TODAY} | Status: DRAFT

## 1. Problem Statement
[Describe the core problem this project solves]

## 2. Goals & Objectives
- **Primary Goal:** [What does success look like?]
- **Secondary Goal:** [What else should this achieve?]
- **Non-Goal:** [What is explicitly out of scope?]

## 3. Functional Requirements
### 3.1 Core Features
| ID    | Feature         | Priority | Status  |
|-------|----------------|----------|---------|
| F-001 | [Feature name] | HIGH     | PENDING |
| F-002 | [Feature name] | MEDIUM   | PENDING |

### 3.2 User Stories
- As a [user], I want to [action] so that [outcome]

## 4. Non-Functional Requirements
- **Performance:** [e.g., "Form submission processed within 30 seconds"]
- **Security:** [e.g., "All data within Google Workspace — no external egress"]
- **Reliability:** [e.g., "Exponential backoff on all API calls"]

## 5. Success Metrics
- [ ] Metric 1: [e.g., "Session logs processed without manual intervention"]
- [ ] Metric 2: [e.g., "Zero duplicate vector entries in INDEX sheet"]

**Next Phase:** TECH_STACK.md
"""
    },
    {
        "name": "APP_FLOW.md",
        "description": "Application Flow Document",
        "content": f"""# Application Flow
> Generated: {TODAY}

## Primary Flow: Session Log Ingestion
```
User finishes AI session
    → Copies chat log
    → Pastes into Google Form
    → Submits

onFormSubmit trigger fires
    → Intake_Pipeline.gs extracts response
    → Gemini analyzes: summary + vector weights + council flags
    → Writes to LOG_INDEX sheet (session ID generated)
    → Vector_Router.gs routes to VECTOR_[TOPIC] docs (weight > 0.7)
    → Council flags written to COUNCIL_INTERJECTIONS
    → If stability_score > 0.75: governance email sent
```

## Secondary Flow: Council Synthesis (Hourly)
```
Time trigger fires
    → Council_Simulator.gs reads last 5 logs (24h window)
    → Loads PERSONA_*.md rules
    → Loads CURRENT_STATE + PIVOTS_AND_LESSONS
    → Gemini runs 3-persona round
    → Interjections written to COUNCIL_INTERJECTIONS
    → CURRENT_STATE updated if council has recommendation
    → If persona evolution signal: email proposal sent
```

## Tertiary Flow: Governance (Every 4 Hours)
```
Time trigger fires
    → Governance_Engine.gs runs integrity audit
    → Checks VECTOR_MAP for source gaps (notebook parity)
    → Detects decayed vector docs (>7 days inactive)
    → Emails alerts if issues found
```

## Approval Flow (User-Initiated via Email)
```
User clicks link in governance email
    → doGet() Web App handler fires
    → action=promote  → insights moved to CORE_THESIS
    → action=create_vector → new VECTOR_doc created + seeded
    → action=create_persona → new PERSONA_*.md created
    → Confirmation page shown in browser
```
"""
    },
    {
        "name": "TECH_STACK.md",
        "description": "Technology Stack Document",
        "content": f"""# Tech Stack
> Generated: {TODAY}

## Core Architecture: Google-Native RAG

| Component        | Technology                    | Version/Notes              |
|-----------------|-------------------------------|---------------------------|
| Automation       | Google Apps Script (V8)       | ES2019, serverless         |
| AI Model         | Gemini 2.0 Flash               | Via generativelanguage API |
| Primary Storage  | Google Sheets                 | Relational-style index     |
| Document Storage | Google Docs / Drive           | Markdown-style content     |
| Form Intake      | Google Forms                  | onFormSubmit trigger       |
| External Analysis| NotebookLM                    | Manual source sync         |
| Notifications    | Gmail via MailApp              | Propose-Notify-Approve     |
| Web Endpoint     | Apps Script Web App (doGet)   | Approval click handler     |

## API Configuration
- **Gemini Endpoint:** `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash`
- **Response Format:** `application/json` (responseMimeType enforced)
- **Temperature:** 0.3 (intake), 0.4 (council), 0.2 (seeding)
- **Rate Limiting:** Exponential backoff, max 4 retries

## Script Properties Required
| Key                    | Description                        |
|------------------------|-----------------------------------|
| `GEMINI_API_KEY`        | From Google AI Studio              |
| `ROOT_FOLDER_ID`        | Set automatically by Genesis       |
| `INDEX_SHEET_ID`        | Set automatically by Genesis       |
| `GOVERNANCE_WEB_APP_URL`| Set manually after Web App deploy  |
"""
    },
    {
        "name": "IMPLEMENTATION_PLAN.md",
        "description": "Implementation Plan / Deployment Checklist",
        "content": f"""# Implementation Plan
> Generated: {TODAY} | See DEPLOYMENT_GUIDE.md for full step-by-step

## Phase 1: Foundation (Do This First)
- [ ] Get Gemini API key from https://aistudio.google.com/
- [ ] Open Google Apps Script at https://script.google.com
- [ ] Create new project named "RTP_System"
- [ ] Paste all 5 .gs files (Genesis, Intake, VectorRouter, Council, Governance)
- [ ] Add GEMINI_API_KEY to Script Properties
- [ ] Run `runGenesis()` → authorize permissions → check Drive for folders

## Phase 2: Intake Pipeline
- [ ] Create Google Form with single Paragraph field ("Session Log")
- [ ] Link Form responses to BRAIN_TRUST_INDEX sheet
- [ ] Set `onFormSubmit` trigger → `processNewLog` in Intake_Pipeline.gs
- [ ] Submit a test log (>50 chars) → verify LOG_INDEX sheet updates

## Phase 3: Automation
- [ ] Set hourly time trigger → `runCouncilSynthesis` in Council_Simulator.gs
- [ ] Set every-4-hours trigger → `runGovernanceCycle` in Governance_Engine.gs

## Phase 4: Web App
- [ ] Deploy Governance_Engine.gs as Web App
  - Execute as: Me | Who has access: Anyone with Google account
- [ ] Copy Web App URL
- [ ] Add it as `GOVERNANCE_WEB_APP_URL` in Script Properties

## Phase 5: NotebookLM Sync
- [ ] Open NotebookLM at https://notebooklm.google.com
- [ ] Add all VECTOR_*.gdoc files as sources
- [ ] Add CORE_THESIS, CURRENT_STATE as sources
- [ ] Set a weekly reminder to manually sync new Vector docs

## Verification Checklist
- [ ] Submit test log → LOG_INDEX row appears ✓
- [ ] Vector doc receives routed content ✓
- [ ] Council_Interjections doc updates within 1 hour ✓
- [ ] Governance email received ✓
- [ ] Approval link opens confirmation page ✓
"""
    },
    {
        "name": "progress.txt",
        "description": "Session Tracking Document",
        "content": f"""SESSION PROGRESS LOG
Generated: {TODAY}
====================

STATUS: INITIALIZING

COMPLETED:
- [x] Downloaded RTP system files
- [x] Ran setup.py — scaffold generated

IN PROGRESS:
- [ ] Creating Google Apps Script project
- [ ] Running Genesis module

NEXT STEPS:
1. Get Gemini API key: https://aistudio.google.com/
2. Create GAS project and paste .gs files
3. Run runGenesis() to build Drive structure
4. Create intake Google Form
5. Set triggers

BLOCKERS:
None

LAST SESSION:
[Paste your last AI session summary here before starting a new one]
"""
    },
    {
        "name": "lessons.md",
        "description": "Lessons Learned Document",
        "content": f"""# Lessons Learned
> Generated: {TODAY}
> Auto-synced to PIVOTS_AND_LESSONS.gdoc in Google Drive

| # | Date       | Mistake / Decision                    | Correction / Rule                                    |
|---|------------|---------------------------------------|-----------------------------------------------------|
| 1 | {TODAY}    | [Describe a mistake or rejected path] | [Describe the rule that prevents repeating it]      |

## Anti-Pattern Registry
These patterns have been explicitly rejected. Do not re-propose without new evidence.

### AP-001: [Anti-Pattern Name]
- **What it was:** [Description]
- **Why it was rejected:** [Reason]
- **Date:** {TODAY}
"""
    },
    {
        "name": "config.json",
        "description": "AI Coding Assistant Configuration",
        "content": """{
  "ai_coding_assistant": {
    "name": "Recursive Thought Partner",
    "role": "AI Knowledge Persistence System",
    "tone": "Professional, precise, and evidence-based",
    "behavior": "Proactive state management with Council-driven feedback",
    "setup_script": "create_documents.py",
    "gemini_model": "gemini-2.0-flash",
    "vector_threshold": 0.7,
    "stability_threshold": 0.75,
    "council_synthesis_interval_hours": 1,
    "governance_interval_hours": 4,
    "log_decay_days": 7,
    "documents": [
      { "name": "CLAUDE.md",              "description": "Master Configuration File",      "required": true },
      { "name": "PRD.md",                 "description": "Product Requirements Document",  "required": true },
      { "name": "APP_FLOW.md",            "description": "Application Flow Document",      "required": true },
      { "name": "TECH_STACK.md",          "description": "Technology Stack Document",      "required": true },
      { "name": "IMPLEMENTATION_PLAN.md", "description": "Implementation Plan",            "required": true },
      { "name": "progress.txt",           "description": "Session Tracking Document",      "required": true },
      { "name": "lessons.md",             "description": "Lessons Learned Document",       "required": true }
    ]
  }
}"""
    }
]


def create_docs():
    print("📄 Initializing canonical documents...\n")
    created = 0
    skipped = 0

    for doc in DOCUMENTS:
        name = doc["name"]
        if not os.path.exists(name):
            with open(name, "w", encoding="utf-8") as f:
                f.write(doc["content"])
            print(f"  ✅ Created  : {name:35s} — {doc['description']}")
            created += 1
        else:
            print(f"  ↩️  Skipped  : {name:35s} — already exists")
            skipped += 1

    print(f"\n{'─'*60}")
    print(f"  Created: {created} | Skipped: {skipped} | Total: {len(DOCUMENTS)}")
    print(f"{'─'*60}")


if __name__ == "__main__":
    create_docs()
