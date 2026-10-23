<!-- Generated from ../USER_EXPERIENCE_REFERENCE.html by tools/cas-ccps/build-guide-notebook-sources.js. Edit the HTML guide, then re-run it. -->

**Current as of 2026-10-10:** students submit for feedback from the Student Dashboard (*Submit for Feedback*), because the district turns Apps Script off for student accounts and the doc's 📊 menu never appears for them. They turn in on Canvas (their document's link), where grades are given; the Turn-In Form is retired, and on 2026-10-10 so were Script 04's turn-in checks (three-point match, approval-stamp check and forensic version-history check): none of them runs, the setup wizard no longer creates the form, and the Drive Advanced Service is no longer needed for them. Each evaluation is added at the end of the student's document. Where this page describes the doc menu, the Turn-In Form or the turn-in gate, that part is out of date. The Student Quick Start and the Teacher Reference Guide are current.

Classroom Agency System · Module 1

# User Experience & Reference Guide

Notebook source: USER_EXPERIENCE_REFERENCE.

The role-by-role walkthroughs and structural reference material for Module 1 — extracted from an earlier deployment guide during the CAS/KOS reconciliation pass, and added as a fifth endorsed document alongside ADMIN_DEPLOYMENT_WALKTHROUGH.html, SYSTEM_ARCHITECTURE.html, STUDIO_FLOW_REFERENCE.html, and REGISTRY_SHEET_SETUP.md.

> **Provenance note:** this content originally lived in `DEPLOYMENT_AND_UX_GUIDE.html` alongside a deployment walkthrough that had drifted out of date and internally self-contradicted on which script is the live setup wizard. That deployment content has been marked superseded in the original file (archived, not deleted); the four sections below were confirmed unique — absent from every other doc in this set — and consistent with the rest of this repo, so they were kept and promoted here. For deployment, see `tools/clasp-sync/run.js` and `cas-ccps/DEPLOYMENT_HANDOFF.md` (`ADMIN_DEPLOYMENT_WALKTHROUGH.html` is retired).

## The Admin Experience

🔧

### System Administrator

Sets up once. Distributes teacher manuals. Monitors and recovers via the Admin Controls menu.

#### One-time central setup ~2 hours

Creates central spreadsheet, folders, deploys all shared scripts, configures two Studio Flows, deploys both web apps, creates master Teacher Manual with six Script Properties pre-set. Done once for the whole school.

#### Per-teacher onboarding ~5 minutes per teacher

Makes a copy of the master Teacher Manual, shares it with the teacher. After the teacher runs the setup wizard, the admin opens the teacher's two response sheets and sets Scripts 05 and 08 with their triggers. That's the full per-teacher admin workload.

#### Ongoing monitoring On demand

The ⚙️ Admin Controls menu in the central spreadsheet provides a System Health Check showing pipeline status, stuck rows, error counts, and flagged students in one alert. Twelve recovery operations are available without touching any script.

## The Teacher Experience

👩‍🏫

### Instructor

Opens manual, runs wizard once, then uses the manual's menu for everything. No spreadsheets, no scripts, no technical knowledge needed.

#### First open — run the setup wizard ~2 minutes

Opens their Teacher Manual, sees the ⚙️ Assignment System menu, clicks "Run First-Time Setup". Answers three prompts (name, email, subject). Everything is created automatically. The manual updates itself with a setup summary page containing all personal links.

#### Creating an assignment ~5 minutes

Uses the menu → "Create New Assignment" to open their Rubric Upload Form. Pastes their evaluation rubric text and the Google Doc link of their student-facing prompt template. Submits.

#### Studio extracts the rubric automatically Studio Flow 1

Workspace Studio reads the rubric, calls Gemini natively, extracts the structured config (unit name, persona, four milestones, passing standard), and writes a DRAFT row to the teacher's Teacher Matrix. Script 08 detects the DRAFT and emails the teacher a pre-filled review form.

#### Review and confirm extraction ~2 minutes

Teacher receives an email with what the system extracted. Clicks the link — a form pre-filled with every extracted field. Edits anything wrong, clicks Submit. Assignment goes LIVE instantly.

#### Registering students Per student

Uses the menu → "Register a Student" to open their Student Intake Form. Fills in student Google account, name, block, period, and the assignment Config ID. Script 02 creates the student's document and folder hierarchy automatically, shares the document into the student's Drive. Or, for a whole class at once, enroll from Canvas gradebook exports with `52_CanvasRosterImport.js` (see README, "Canvas roster import").

#### Monitoring progress Live

Opens the Teacher Dashboard from the menu. Sees every student's status grouped by unit — color-coded rows, evaluation timestamps, direct document links. Flagged submissions surface at the top.

#### Receiving verified submissions Automatic

Email notification for every submission that passes all three checks. Contains student name, block, period, class, and a direct document link. Ready to grade — no manual verification needed.

## The Student Experience

🎒

### Student

No email. No setup. No account creation. Works entirely inside their Google Doc and a bookmarked dashboard URL.

#### Document appears in their Drive Automatic

When the teacher registers them, Script 02 creates their document inside a shared class folder named **[Block] - [Class] - [Teacher]** — e.g. *2O - AP Biology - Ms. Carter*. The document appears in their Shared With Me. One right-click to add it to My Drive under **Assignments → 2O - AP Biology - Ms. Carter**.

#### One-time authorization First use only

The first time they click the 📊 AI Evaluation Panel menu, Google shows a one-time authorization dialog. Click Allow. Never shown again. This is the only technical moment in the student's entire experience.

#### Reading and writing the assignment Student

The document opens with a feedback zone at the top (initially showing "No feedback yet"), then the teacher's assignment prompt, then a clear divider: *── YOUR RESPONSE BEGINS HERE ──*. Student writes below it. The CONFIG_ID tracking token is at the bottom, out of the way.

#### Requesting feedback Student

Clicks **📊 AI Evaluation Panel → Run Assignment Check**. Confirmation dialog tells them feedback arrives in 1–3 minutes.

#### Feedback appears at the top of the document Studio Flow 2

The evaluation report is prepended into the feedback zone — above the assignment prompt, immediately visible on open. Each report shows: result status, milestone-by-milestone breakdown, required revisions list, and a plain-language **WHAT TO DO NEXT** block. No system codes. No jargon. The most recent feedback is always first.

#### Revising and re-checking Student

Revises in the response zone, runs another check. No limit on evaluations. Each one adds a new block at the top. Full feedback history preserved in the document. The status menu item shows current standing without scrolling.

#### Submitting Student

Once the top of the document shows ✅ passing, opens the Turn-In Form (link shared by teacher), types their Google account identifier, pastes the document URL, submits. If validation fails for any reason, a plain-language notice is written directly into their document's feedback zone — they see it immediately on next open. No email needed at any point.

#### Student Dashboard Any time

Bookmarked URL shows all assignments across all teachers, grouped by block and class. Each card shows status, last feedback time, and a direct document link. Submitted assignments show confirmation in green.

## Document Anatomy

Four zones. Created once by Script 02. Maintained throughout the assignment lifecycle.

**Zone 1 — Feedback Header Written by Studio Flow 2 Read by student**

Evaluation reports prepend here — most recent always first. Starts with a placeholder. After first evaluation each block shows: result, milestone breakdown, required revisions, next-steps instructions, and a compliance stamp. Rejection notices from Form 2 also appear here. Maximum visibility on open.

**Zone 2 — Assignment Prompt Copied from teacher template Read by student**

Exact copy of the teacher's uploaded prompt template document. Untouched after initial creation. Students read this — it is the assignment instructions. Studio Flow 2 does not read this zone; it reads only Zone 3.

**Zone 3 — Student Response Written by student Extracted for evaluation**

Begins at `── YOUR RESPONSE BEGINS HERE ──`. Everything between this line and the CONFIG_ID footer is the student's work. Scripts 01 and Studio Flow 2 extract from this zone exclusively by marker position.

**Zone 4 — CONFIG_ID Footer Tamper-evident**

Contains `[CONFIG_ID: VDOE-XXXXXX-YYYY]`. Placed below all student work. Scripts 01 and 04 scan for it here. If altered or missing, all validation fails. Students are instructed not to modify this section.

## Folder Structure

Admin Drive

📁 Assignments/ 📁 Science/ 📁 Ms. Carter/ 📁 AP Biology — Teacher Matrix ← teacher's personal spreadsheet 📁 Period 3/ 📁 Emma Rodriguez/ 📄 Research Essay — Emma Rodriguez 📁 James Okafor/ 📄 Research Essay — James Okafor 📁 _Student Shared Folders/ 📁 2O - AP Biology - Ms. Carter/ ← older work only; no longer shared with the class 📄 Research Essay — Emma Rodriguez 📄 Research Essay — James Okafor

Student Drive (Emma's view)

📁 My Drive/ 📁 Assignments/ ← added from Shared With Me with one right-click 📁 2O - AP Biology - Ms. Carter/ 📄 Research Essay — Emma Rodriguez 📁 3E - US History - Mr. Patel/ 📄 Primary Source Analysis — Emma Rodriguez

## Full Pipeline

Assignment Creation

📤

**Teacher**

Uploads rubric + prompt template

📥

**Script 05**

Validates, writes to RubricQueue

⚡

**Flow 1**

Gemini extracts config → DRAFT row

📧

**Script 08**

Detects DRAFT, emails pre-filled review

✅

**Teacher**

Confirms → unit goes LIVE

Student Registration

📋

**Admin/Teacher**

Submits Form 1

📁

**Script 02**

Creates 5-level folder hierarchy

📄

**Script 02**

Stamps doc, shares to student Drive

🎒

**Student**

Doc in Shared With Me

Evaluation Cycle

✍️

**Student**

Writes, clicks Run Check

📥

**Script 01**

Roster validation → ReviewQueue

🌉

**Script 03**

Bridges to STAGING_PIPELINE

🚦

**Script 06**

Turnstile → IN_PROCESS

⚡

**Flow 2**

Gemini evaluates → writes feedback

📊

**Student**

Feedback at top of doc

Final Submission

📬

**Student**

Submits Form 2

🔍

**Script 04**

3-point + stamp + forensic checks

✅

**Ledger**

Row → COMPLIANT

📧

**Teacher**

Verified submission notification
