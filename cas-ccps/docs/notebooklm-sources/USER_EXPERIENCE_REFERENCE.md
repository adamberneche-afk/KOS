<!-- Generated from ../USER_EXPERIENCE_REFERENCE.html by tools/cas-ccps/build-guide-notebook-sources.js. Edit the HTML guide, then re-run it. -->

**Note, 2026-10-23: the Admin, Teacher and Student Experience sections, Document Anatomy and Folder Structure below describe the original Module 1 design.** The Full Pipeline at the end is current. What students and teachers do now:

- **Students** open their document from the Student Dashboard (📚 My Assignments), write under the grey line, press *Submit for Feedback* on the dashboard (the district turns Apps Script off for student accounts, so the doc’s 📊 Feedback menu never appears for them), read the feedback as a comment on the document, answer warm-ups in the dashboard’s text box, and turn in on Canvas with the document’s link. There is no Turn-In Form (retired 2026-10-10) and no one-time authorization. See `STUDENT_QUICK_START.html`.
- **Teachers** work from the Teacher Dashboard: course, period and student filters and one student’s page (their parent report, Student Context by week and competencies done), lesson start dates and lesson drafts in 📅 Lessons, each feature on or off per course in ⚙ Settings, competency ratings in 🎓 Competency ratings, the ❓ Terms list. They do not upload rubrics or register students one at a time: the nightly lesson rollout (`58_LessonRollout.js`, about 9 p.m.) enrolls students from the Canvas roster and makes and shares each lesson’s documents. Grading is in Canvas. See `TEACHER_REFERENCE_GUIDE.html`.
- **The student document** now has its who-and-what, the “Your dashboard” link and a “Feedback:” status line in the page header; then the title, the assignment in small text, a “Your response” heading, the grey response line, the writing space and the CONFIG_ID line (`stampDocument_` in `02_Form1_IntakeAndWorkspaceGenerator.js`). With feedback as comments it has no feedback zone.
- **Admins** deploy with `tools/clasp-sync/run.js` and follow `cas-ccps/DEPLOYMENT_HANDOFF.md`; `ADMIN_DEPLOYMENT_WALKTHROUGH.html` is retired. The morning check is the CAS signal’s LAST NIGHT section and the daily email (`34c_OvernightHealth.js`).

Classroom Agency System · Module 1

# User Experience & Reference Guide

Notebook source: USER_EXPERIENCE_REFERENCE.

The role-by-role walkthroughs and structural reference material for Module 1 — extracted from an earlier deployment guide during the CAS/KOS reconciliation pass, and added as a fifth endorsed document alongside ADMIN_DEPLOYMENT_WALKTHROUGH.html, SYSTEM_ARCHITECTURE.html, STUDIO_FLOW_REFERENCE.html, and REGISTRY_SHEET_SETUP.md.

> **Provenance note:** this content originally lived in `DEPLOYMENT_AND_UX_GUIDE.html` alongside a deployment walkthrough that had drifted out of date and internally self-contradicted on which script is the live setup wizard. That deployment content has been marked superseded in the original file (archived, not deleted); the four sections below were confirmed unique — absent from every other doc in this set — and consistent with the rest of this repo, so they were kept and promoted here. For deployment, see `tools/clasp-sync/run.js` and `cas-ccps/DEPLOYMENT_HANDOFF.md` (`ADMIN_DEPLOYMENT_WALKTHROUGH.html` is retired).

## The Admin Experience (original Module 1 design)

🔧

### System Administrator

Sets up once. Distributes teacher manuals. Monitors and recovers via the Admin Controls menu.

#### One-time central setup ~2 hours

Creates central spreadsheet, folders, deploys all shared scripts, configures two Studio Flows, deploys both web apps, creates master Teacher Manual with six Script Properties pre-set. Done once for the whole school.

#### Per-teacher onboarding ~5 minutes per teacher

Makes a copy of the master Teacher Manual, shares it with the teacher. After the teacher runs the setup wizard, the admin opens the teacher's two response sheets and sets Scripts 05 and 08 with their triggers. That's the full per-teacher admin workload.

#### Ongoing monitoring On demand

The ⚙️ Admin Controls menu in the central spreadsheet provides a System Health Check showing pipeline status, stuck rows, error counts, and flagged students in one alert. Twelve recovery operations are available without touching any script.

## The Teacher Experience (original Module 1 design)

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

## The Student Experience (original Module 1 design)

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

## Document Anatomy (original Module 1 design)

Four zones. Created once by Script 02. Maintained throughout the assignment lifecycle.

**Zone 1 — Feedback Header Written by Studio Flow 2 Read by student**

Evaluation reports prepend here — most recent always first. Starts with a placeholder. After first evaluation each block shows: result, milestone breakdown, required revisions, next-steps instructions, and a compliance stamp. Rejection notices from Form 2 also appear here. Maximum visibility on open.

**Zone 2 — Assignment Prompt Copied from teacher template Read by student**

Exact copy of the teacher's uploaded prompt template document. Untouched after initial creation. Students read this — it is the assignment instructions. Studio Flow 2 does not read this zone; it reads only Zone 3.

**Zone 3 — Student Response Written by student Extracted for evaluation**

Begins at `── YOUR RESPONSE BEGINS HERE ──`. Everything between this line and the CONFIG_ID footer is the student's work. Scripts 01 and Studio Flow 2 extract from this zone exclusively by marker position.

**Zone 4 — CONFIG_ID Footer Tamper-evident**

Contains `[CONFIG_ID: VDOE-XXXXXX-YYYY]`. Placed below all student work. Scripts 01 and 04 scan for it here. If altered or missing, all validation fails. Students are instructed not to modify this section.

## Folder Structure (original Module 1 design)

Admin Drive

📁 Assignments/ 📁 Science/ 📁 Ms. Carter/ 📁 AP Biology — Teacher Matrix ← teacher's personal spreadsheet 📁 Period 3/ 📁 Emma Rodriguez/ 📄 Research Essay — Emma Rodriguez 📁 James Okafor/ 📄 Research Essay — James Okafor 📁 _Student Shared Folders/ 📁 2O - AP Biology - Ms. Carter/ ← older work only; no longer shared with the class 📄 Research Essay — Emma Rodriguez 📄 Research Essay — James Okafor

Student Drive (Emma's view)

📁 My Drive/ 📁 Assignments/ ← added from Shared With Me with one right-click 📁 2O - AP Biology - Ms. Carter/ 📄 Research Essay — Emma Rodriguez 📁 3E - US History - Mr. Patel/ 📄 Primary Source Analysis — Emma Rodriguez

## Full Pipeline

As the code runs it on 2026-10-23. The Central Ledger’s frequent jobs run from one every-minute trigger, `runLedgerCycle()`, each at its own cadence.

Lessons and Assignments

📅

**Teacher**

Sets start dates in 📅 Lessons; edits or writes lessons as drafts

📥

**Script 65**

Saves the draft to LessonDrafts; an evening import makes it a reviewed change

🗂️

**Script 55**

LessonSchedule tab: each lesson’s start date

🌙

**Script 58**

Nightly rollout seeds each lesson in the TeacherMatrix as LIVE

Students and Documents

👥

**Scripts 58 + 52**

Enroll the Canvas roster for lessons starting within 2 days

📄

**Script 02**

Makes and stamps each student’s document

🔓

**Script 58**

Shares it with the student the night before the lesson

🎒

**Student**

Opens it from the Student Dashboard

Evaluation Cycle

✍️

**Student**

Writes, presses Submit for Feedback on the dashboard

📥

**Script 13**

Checks the account, document and length → ReviewQueue

🌉

**Script 03**

Bridges to STAGING_PIPELINE

🚦

**Script 06**

One row per teacher lane → IN_PROCESS

🧾

**Script 37**

Writes a resolved FlowInput row (READY)

⚡

**Flow 2**

Gemini evaluates → GeminiFullOutput, EVALUATED

📝

**Script 37**

Checks it; posts the comment; Ledger result, EvaluationLog

💬

**Student**

Feedback as a comment on the doc

Warm-ups

🌙

**Script 24**

3:30 a.m.: builds the WarmUpQueue

⚡

**Flows 5 + 3**

Bridge and warm-up text, through Flow5Input / Flow3Input (Script 41)

✍️

**Student**

Answers in the dashboard’s text box

⚡

**Flow 4**

Scores it overnight, through Flow4Input (Script 41)

Turning In

📬

**Student**

Submits the document’s link in Canvas

✅

**Teacher**

Grades in Canvas (no CAS step; the Turn-In Form is retired)
