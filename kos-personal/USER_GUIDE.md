# KOS v8.0 — User Guide

This guide explains how to use KOS once it has been deployed. It assumes the system is running and you can open the web app in a browser.

---

## What KOS Does for You

KOS processes your AI working sessions and extracts persistent value from them. Without KOS, a three-hour session where you made important decisions, learned things, and identified actions essentially disappears — you might save a few notes, but most of what was generated is gone by the next session.

KOS routes everything that matters from a session to the right place automatically:
- Decisions and next steps go to your CURRENT_STATE document
- Pivots and lessons go to your PIVOTS_AND_LESSONS document
- Action items go to your ACTION_REGISTER sheet
- Theme scores go to your MATRIX_LEDGER and build up a vector model of your expertise
- The system quietly learns your values from session patterns, building a model of what you protect and what you refuse to automate

Over time, KOS builds a calibrated picture of how you work that makes each new session more grounded than the last.

---

## The Three Tabs

### Ingest — Where You Submit Sessions

This is where you paste session content. There are two types:

**Session Log** — A transcript or summary of an AI working session. This is your primary input. The more complete and structured the session log, the better the extraction. A session log should typically be between 5,000 and 25,000 characters. Longer sessions are automatically split into multiple chunks.

**Research / Context** — An article, document, report, or dataset you want the system to file for pattern matching. Give it a descriptive title. The system processes it differently from session logs — it extracts domain signals but doesn't look for action items or decisions.

After submitting, a hint card appears explaining what happens next. The yellow card is not an error — it's confirmation that your session is in the queue and tells you where to check progress.

### Queue — Where You Monitor Progress

The four metric cards show the current state of your queue:

- **Pending (waiting for AI engine)** — Sessions that have been submitted and are waiting for the AI to pick them up. This number goes up when you submit and down when the AI starts processing. If it stays high for more than 15 minutes, check that your Studio integration is running.
- **Processing (AI running now)** — Sessions the AI engine is actively working on. Under normal operation this is 0 or 1 — the system processes one at a time to avoid interference.
- **Needs your help (action required)** — Sessions where the AI's output couldn't be read automatically. This requires a specific action from you — see the NEEDS YOUR HELP section below.
- **Processed (complete)** — Sessions fully processed and routed to your ledgers.

**What to do on the Queue tab most of the time: nothing.** Check it after submitting a session to confirm it was received. If all numbers are 0 and you just submitted, wait 5 minutes and refresh.

### Diagnostics — Where You See What the System Has Learned

This tab shows the system's internal state. You'll visit it most often to:
- See your ambient calibration progress (shadow matrix)
- Check what themes are currently weighted in your work
- Run a council review when you want structured advice on a decision
- Trigger a daily primer when you want a session starter

---

## Submitting Your First Session Log

A session log is the primary content type. Here's what works well:

**Good session logs to submit:**
- A full AI session transcript where you made decisions, planned work, or processed a problem
- A debrief you wrote after a working session (even without AI involvement)
- A project retrospective
- A long planning session with an AI assistant

**Session log format:**
KOS works best with session logs that use the `[🧠 RTP` delimiter to mark section boundaries, but it handles plain text too. If your session logs don't use delimiters, KOS splits them at paragraph breaks. You don't need to reformat anything — paste as-is.

**What not to submit as a session log:**
- Single questions and answers ("What's the capital of France?")
- Raw data exports without context
- Code files (use Research / Context instead if you want to file them)

**Size guidance:**
- Under 150,000 characters: paste directly into the Ingest tab
- Over 150,000 characters: the app automatically shows the folder-drop path. Follow the instructions to create a Google Doc in your 03.5_INBOUND_SESSIONS folder instead.

---

## The Folder-Drop Path (Large Payloads)

If your session is too large to paste directly (over ~150,000 characters), the Ingest tab will detect this and show a yellow panel with instructions. The reason is technical — Google's web app infrastructure has a size limit for direct text transfers.

The folder-drop path:
1. Tap the **03.5_INBOUND_SESSIONS** link in the yellow panel — it opens your Drive folder
2. Create a new Google Doc inside that folder (any name works)
3. Paste your full session text into the doc
4. Close the tab
5. The system picks it up automatically within 5 minutes — no further action needed

The folder-drop path and the direct-paste path produce identical results. Use whichever is appropriate for your session size.

---

## When You See "Needs Your Help"

This appears when the AI's inference output couldn't be read automatically. It happens when:
- The AI produced output that wasn't valid structured JSON
- The session contained unusual formatting that confused the parser
- The AI session was too long and the output was truncated

**What to do:**

1. Tap **Open doc** next to the flagged item
2. The document contains either the original session text (if Studio never processed it) or a partial/malformed JSON response
3. If Studio hasn't processed it yet: leave it. The system will retry automatically. Wait 10 minutes and check the Queue tab again.
4. If Studio processed it but produced malformed output: you need to re-run the session manually and paste the correct JSON into the document body. The JSON schema is in the Studio Integration Spec — most users won't need to do this.
5. After fixing the document, the system retries within 10 minutes. You'll see the row move from "Needs your help" to "Processed" once complete.

If a row has retried 3 times and is still failing, it becomes permanently flagged as `FAILED_PARSE`. At that point, archive it (Diagnostics → Archive completed queue rows) and resubmit the session as a fresh submission.

---

## What the Shadow Matrix Means

The shadow matrix is the system's model of your values. It tracks five questions:

| Question | What it's learning |
|---|---|
| **Admin Ghost** | What administrative tasks steal your time regularly |
| **Relational Targets** | Who this system is protecting time for in your life |
| **Necessary Struggle** | What friction you deliberately refuse to automate |
| **Prime Directive** | The singular outcome your work is building toward |
| **Temporal Constraints** | When your time is protected and non-negotiable |

**UNKNOWN** — The system hasn't seen enough evidence yet. This is the starting state for all questions.

**HYPOTHESIZED** — The system has seen patterns suggesting an answer but isn't confident enough to act on it.

**VERIFIED** — The system has seen consistent evidence and has a working model of this value. At this point, it auto-populates the corresponding operator property if you haven't set it manually.

The confidence percentages show how close each question is to VERIFIED (75% = threshold). A new deployment will show 0% on all questions. After 10-15 well-structured sessions, you'll typically start seeing HYPOTHESIZED status on the questions most visible in your work.

**You don't have to wait for ambient calibration.** If you want to set your values explicitly and get the system calibrated immediately, go to Diagnostics → Personalise your advisor. The 4-step form populates all five shadow questions at 100% confidence, generates your Identity Key, and calibrates the vector routing weights to your specific role.

---

## The Daily Primer

Every morning at 06:00, KOS generates a session starter document in your 03.1_CURRENT_STATE folder. It contains:
- Your current vector weights (what themes are most active in your work)
- Your shadow matrix calibration status
- Your 90-Day Vision (once set)
- Your Relational Targets (once set)

To use it: find the document named `DAILY_PRIMER_[today's date]` in your Drive, open it, and paste its contents at the top of a new AI session. This gives your AI assistant instant context about who you are and what you're working on, without you having to re-explain it every session.

You can also generate a fresh primer on demand from the Diagnostics tab: **Generate today's session starter**.

---

## The Council Review

The system ships six AI personas (a 7th, ALIGNMENT, is always active rather than convened on demand):
- **ARCHITECT** — Systems thinking, structural decisions, long-term planning
- **AUDITOR** — Verification, consistency, risk identification
- **MUSE** — Creative connections, unexpected approaches
- **DEVELOPER** — Implementation, technical execution
- **CURATOR** — Organisation, synthesis, information retrieval
- **ALIGNMENT** — Always active, monitors for boundary drift (also the cog behind the `04.5_ALIGNER_SILO` Calibration Silo folder and `CE-ALIGN` tag — same cog, older folder-naming convention)

**What "Run full council review" does today:** it assembles current state + pivots into one shared review document instructing the model to act as **ARCHITECT, AUDITOR, and MUSE together** and return a verdict from each — not a fully sequestered, independent-per-persona review. The verdicts appear in the COG_REGISTRY sheet of your BRAIN_TRUST_INDEX once Studio processes the document. A fuller sequestered design — all personas isolated from each other's verdicts ("Seven Bridges," SMP-002) — is specified but not yet built.

**When to use it:**
- Before a major decision that affects multiple stakeholders
- When you've been working on something for several sessions and want a structured review
- When you're in a planning loop and want external challenge

**How to trigger it:**
Go to Diagnostics → **Run full council review**. The button asks for a second tap (with a countdown) to prevent accidental triggers. After confirmation, the shared review document above is routed to RAW_EXHAUST for Studio to pick up.

The council runs automatically every 5 sessions (configurable). You'll see the button pulse in Diagnostics when an auto-trigger fires.

---

## The Vector Weights

The vector weights in the Diagnostics tab show how strongly each knowledge domain featured in your last processed session. Seven domains are tracked by default:

| Domain | What it captures |
|---|---|
| ARCHITECTURE | Systems design, structural decisions, scalability thinking |
| UI | User experience, interface design, interaction patterns |
| SECURITY | Risk, compliance, access control, hardening |
| PEDAGOGY | Teaching, learning design, student outcomes |
| GAS_DEVELOPMENT | Google Apps Script, automation, technical implementation |
| RELATIONAL | Relationships, communication, interpersonal dynamics |
| DOMAIN_COMPLIANCE | Regulatory/domain-specific compliance signals |

Scores run from 0.0 to 1.0. A score of 0.82 in ARCHITECTURE means that domain was strongly present in your last session. Scores decay over time if a domain isn't mentioned — the system models where your current attention actually is, not just your career history.

New domains can be promoted from the incubator as your work evolves. If the same new theme appears consistently across sessions, it starts building up in the incubator and can be promoted to a tracked domain (Diagnostics → Check for new themes to promote).

---

## The Diagnostics Tab Actions

| Action | When to use it |
|---|---|
| **Personalise your advisor** | First setup, or when your role/context has changed significantly |
| **Generate today's session starter** | On demand — replaces waiting for the 06:00 trigger |
| **Run full council review** | Before major decisions, after significant project phases |
| **Check for new themes to promote** | When you notice your work has shifted domains |
| **Archive completed queue rows** | Periodically, when STAGING_PIPELINE has many processed rows |
| **Send error digest now** | When you want to check the error log immediately |
| **Re-run full deploy** | Only when something is broken and you need to rebuild infrastructure |

The **Re-run full deploy** button asks for two taps with a visible countdown. It's safe to use — it's idempotent (it finds or creates, never duplicates) — but it takes 30–60 seconds and should only be needed when a folder or sheet is missing.

---

## What to Expect Over Time

**Sessions 1–5:** Everything works, but the system doesn't know much about you yet. Vector weights are present but not calibrated. Shadow matrix shows UNKNOWN or early HYPOTHESIZED.

**Sessions 10–20:** Shadow matrix starts showing HYPOTHESIZED on your most-visible values. Vector weights begin to show a clear pattern — you'll see the same 2-3 domains consistently high. The daily primer becomes genuinely useful.

**Sessions 30–50:** Shadow matrix transitions some values to VERIFIED, or you've completed the "Personalise your advisor" form. Vector routing is well-calibrated. The system starts auto-promoting new themes from the incubator if your work has expanded.

**Sessions 50+:** The system is fully calibrated. Council reviews produce verdicts that surprise you in useful ways. The daily primer is a genuine accelerator for session quality. The ACTION_REGISTER has accumulated enough history to show patterns in what you repeatedly defer versus complete.

---

## Finding Things in BRAIN_TRUST_INDEX

Your BRAIN_TRUST_INDEX spreadsheet contains all the system's structured outputs. If you want to go directly to source data:

| Sheet | What it contains |
|---|---|
| STAGING_PIPELINE | Current and recent queue status |
| SESSION_LOG | One row per processed session with summary |
| MATRIX_LEDGER | Calibrated vector scores per session |
| ACTION_REGISTER | All action items extracted from sessions |
| COG_REGISTRY | Council verdicts from all sessions |
| Blackboard | System modification proposals (SMP governance) |
| ERROR_LOG | All errors with timestamps and context |
| STAGING_ARCHIVE | Completed queue rows (after archiving) |

The session documents themselves (CURRENT_STATE, PIVOTS_AND_LESSONS, daily primers) live in the Drive folder hierarchy under your root KOS folder.

---

## Frequently Asked Questions

**My session is processing but nothing appears in the sheets after an hour.**
The queue processor runs every 10 minutes. If nothing has appeared after an hour, open STAGING_PIPELINE and check the Status column. If it shows FLOW_COMPLETE with nothing processed, run `processInferenceQueue()` manually from the Apps Script editor. If it shows NEEDS_CURATOR, see the NEEDS YOUR HELP section above.

**I submitted a session but the Queue tab still shows 0 pending.**
Refresh the Queue tab — it doesn't auto-refresh. If it still shows 0 after refresh, check STAGING_PIPELINE directly. It's possible the session was chunked into multiple rows.

**The shadow matrix shows 0% on everything after 5 sessions.**
The shadow matrix updates from `alignment_observations` in the inference JSON. If Studio isn't producing these observations, or is producing them with all-zero confidence deltas, the matrix won't update. Check whether your Studio configuration includes the `alignment_observations` section in its output prompt. Alternatively, use "Personalise your advisor" to set your values directly.

**The vector weights look wrong for my session.**
Vector weights are modulated by your operator calibration. If you haven't set calibration values, defaults are used (0.75 for all domains). Complete "Personalise your advisor" to get calibration values matched to your role.

**I accidentally clicked "Re-run full deploy" and it ran.**
No data was lost. The deploy function only creates what doesn't exist — it won't overwrite your CURRENT_STATE or PIVOTS_AND_LESSONS documents, won't clear your SESSION_LOG, and won't reset your PropertiesService values. The only effect is that any missing folders or sheets get recreated.
