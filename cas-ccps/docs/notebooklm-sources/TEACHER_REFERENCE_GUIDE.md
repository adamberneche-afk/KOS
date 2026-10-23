<!-- Generated from ../TEACHER_REFERENCE_GUIDE.html by tools/cas-ccps/build-guide-notebook-sources.js. Edit the HTML guide, then re-run it. -->

# Your guide to the *Assignment System*

Notebook source: TEACHER_REFERENCE_GUIDE.

Look things up here when you have a question. Each section starts with what to do. The words match the Teacher Dashboard and its ❓ Terms panel.

⚙️

## What's Where

Work from the Teacher Dashboard. You rarely need anything else.

| Thing | What it's for | Where to find it |
| --- | --- | --- |
| Teacher Dashboard | Your students' progress, lessons, feedback setting and competency ratings | The link your admin gave you, or ⚙️ Assignment System → 📊 Open My Dashboard in your Teacher Manual |
| Student Dashboard | Where students press Submit for Feedback, answer warm-ups and see where each assignment stands | The “Your dashboard” link in every student document's page header, and in each Canvas assignment |
| Student documents | One Google Doc per student per lesson, where the student writes | “Open document ↗” on the student's row |
| Canvas assignment | Where students turn in (their document's link) and where you grade | Your Canvas course |
| Teacher Manual | The ⚙️ Assignment System menu and your setup details | Your Google Drive |

> **Don't edit the system's spreadsheets by hand** (the Central Ledger, the Teacher Matrix). The dashboard changes what you need. The one exception is a step a timeout email asks for.

📁

## Student Documents

Open a student's document from their row. Each document is shared with that student (they can edit) and with you (you can comment). Classmates have no access.

**What the student sees, top to bottom:**

- A small grey page header: who and what (name, class, teacher, block, period, lesson), a “Your dashboard” link, and a “Feedback:” line that says where the work stands.
- The lesson title, a “↓ Go to your response” link, and the assignment in small (8 pt) text.
- A “Your response” heading, “Write your answer under the grey line below.” and “↑ Back to the assignment”.
- The grey “── YOUR RESPONSE BEGINS HERE ──” line, then the student's writing space (10 pt).
- A small grey “[CONFIG_ID: …] Do not delete this line.” at the bottom. Only the text between the grey line and this line is checked.

> **Feedback is a comment, not text in the document.** With feedback as a comment (the setting is on for every course), each check adds a new comment. Click Comments (top right) to read them. A student who presses Resolve doesn't delete it.

📊

## Your Dashboard

Open it, read the summary cards, act on Needs attention. Press **↻ Refresh** to see the latest: it doesn't update by itself.

**Showing (the lesson picker).** It opens on the **current lesson** for each course: the lesson whose start date in 📅 Lessons is the latest on or before today. Pick another lesson, or **All assignments** at the bottom.

**Summary cards.** Students, ✅ Passed, ↩️ Passed before, now revising, ✏️ Checked, not passing yet, ⚪ Not checked yet, and Needs attention. Click a card to show only those students; **Clear filter** shows everyone again. In All assignments the first card counts assignments, since a student has one row per assignment.

**Each student's row.** Name; block, period and course; “N checks · last <date>” or “No checks yet”, with “· submitted <time>” once they've submitted; “First passed <date>”; the AI's suggested score from the last check (“3 — Solid (2–4, higher is better)”); **Open document ↗**; and badges on the right. Rows are grouped by lesson, then ordered by period and name, which follows SpeedGrader.

**Warm-up readiness strip** (under the header, when warm-ups are on). The pacing guide unit, then “x of N students have had work checked”, “y answered a warm-up”, “building a personalized learning profile” and “ready for fully personalized feedback”. Click a number to show those students.

### Header buttons

| Button | What it does |
| --- | --- |
| + New Lesson | Opens “Log a lesson”: the day's objective, activity, vocabulary and the competencies taught, for one or more periods. Shown only when warm-ups (Module 2) are on. Not the same as 📅 Lessons' “+ New lesson” |
| Student Context | One document per student that gathers their lessons, checks and warm-ups, updated weekly. “← Back to dashboard” returns to the roster |
| ✉ Parent Reports | Not in use yet. See Parent Reports |
| 🎓 Competency ratings | Confirm or set each student's SCR rating. See Grading and Competency Ratings |
| 💬 Feedback | Where feedback goes, per course. See Where Feedback Goes |
| 📅 Lessons | Start dates, rollout status, and lesson edits. See Lessons and Start Dates |
| ❓ Terms | What each word and number on the dashboard means. Escape closes it |
| ↻ Refresh | Loads the latest |
| Whole school year | The year menu. Pick a marking period to see only that part of the year |

🔍

## Understanding Status

Each student's work for a lesson is in one of four states:

- **⚪ Not checked yet**: No check has come back. The student hasn't pressed Submit for Feedback, or the first check is still running.

- **✏️ Checked · not passing yet**: One or more checks came back, and none passed. The student is working on it.

- **✅ Passed**: The latest check met the assignment's criteria. The student can turn it in on Canvas, or keep improving it.

- **↩️ Passed before · latest needs revision**: An earlier check passed, and the latest one needs revision.

A second badge shows while a check is on its way, or when it failed:

- **Waiting to be checked**: Submitted and in line for its check. The student's card says “Waiting for feedback…”.

- **Being checked now**: The check is running. The student sees the same words.

- **Couldn't be checked ⚠**: The check failed or timed out. This isn't the student's work. A check still running after 12 minutes is stopped and lands here. These rows are counted under Needs attention. See When Students Have Problems.

> Passing isn't required before a student turns in on Canvas. A Canvas submission from a student who is ⚪ or ✏️ here hasn't passed a check yet.

📅

## Lessons and Start Dates

Give each lesson a start date in 📅 Lessons. To change what a lesson says, or add one, write a draft there. You don't upload rubrics or forms to make assignments.

1. **Open 📅 Lessons**: One table per course: Lesson, Status (Current, Upcoming, Taught or No date), Starts, and Last rollout. Next to each course name: whether the rollout is on, or “in shadow (changes nothing)”.
2. **Set a start date**: Pick a date in Starts. It saves when you change it. **Clear** removes it. A lesson runs from its start date until the next one starts.
3. **Edit a lesson, or add one**: **Edit** opens the lesson's fields as a draft. **+ New lesson** (next to the course name) starts an empty one: title, objective, activity, the student task or a brief for it, a warm-up anchor, vocabulary, and competencies with a tier each.
4. **Save draft, then Submit for import**: Submit only works once every required field is filled. The draft is imported that evening and comes back as a proposal.
5. **Review the proposal**: Open it under Lesson drafts. Choose **Accept the proposal**, or **Return with my note** to send it back. An accepted lesson goes live once the change is reviewed and published (the screen calls this a PR: a reviewed change to the system's files).

> **Competency tiers.** Each lesson's competencies are primary (must be shown to pass), secondary or tertiary (credited when shown). The draft won't submit unless the tiers follow those rules.

👥

## How Students Get Their Documents

Nothing to do. You don't register students one at a time. The nightly rollout (about 9 p.m.) does it from the Canvas roster.

1. **Enroll**: For the current lesson and any lesson starting within 2 days, the rollout enrolls every student on the Canvas roster export.
2. **Make the documents**: Each student gets their own document for the lesson. Until the lesson's release night, it isn't shared yet.
3. **Share them the night before**: The night before a lesson starts, each document is shared with its student and appears on their dashboard. A student who joins late gets theirs after the next run.

> **A student is missing?** Check they're in the Canvas section. A late joiner only appears once a fresh Canvas roster export is in place; an old export shows as a ⚠ line in 📅 Lessons' Last rollout column. Tell your admin.

💬

## Where Feedback Goes

Open **💬 Feedback** and choose, per course, *as a comment* on the document or *in the document*. The **Now:** line shows the live setting. Today it's “as a comment, for every course”.

A comment keeps the document to the assignment and the student's work, and new documents are made without a feedback section. A change reaches students within about 10 minutes.

**What a feedback comment says.** “Feedback, <date and time>”, then “✅ RESULT: YOUR WORK MEETS THE STANDARD” or “✏️ RESULT: REVISIONS REQUIRED”, then the report (overall assessment, each milestone MET / PARTIALLY MET / NOT MET, required revisions) and what to do next.

🧭

## Warm-ups and Lesson Logs

Log the lessons you teach. That's what lets warm-ups fit each student over time. This part of the system is Module 2.

**Log a lesson** (the header's **+ New Lesson**). Enter the date, one or more periods, the objective, what students did, vocabulary, and tick the competencies you taught. Teaching the same lesson to several periods? List them with commas: one log is made for each. Each log records which competencies you taught, for coverage reports, and feeds warm-up personalization.

> Competency ratings come from checks of student work, not from lesson logs. A lesson you don't log just isn't counted toward coverage or personalization.

**Warm-ups.** A short question at the start of class. Students answer it on their dashboard, and it's scored overnight out of 10 (length, grammar and engagement). Students can earn an extra point by replying to the feedback in at least 10 words by the date shown.

**Warm-up readiness** (the strip under the header) shows how much the system knows about each student, from checks and warm-up answers. Click a number to see those students. “Building a personalized learning profile” means the system is still learning what kind of warm-up works for them; “ready for fully personalized feedback” means it's confident.

✉️

## Parent Reports

> **Not in use yet. Don't send reports.** Weekly parent reports stay off until the school decides to start them. The ✉ Parent Reports button is there, but its wording and recipient checks are still being fixed.

How it works, for when it starts: the panel lists this week's report for each student. Nothing is sent until you type an address and press Send for one student, and there's no “send all”. A second send for the same student and week is refused. Every send is recorded.

🙋

## When Students Have Problems

| Student says… | What's happening | What to do |
| --- | --- | --- |
| “My card says Couldn't be checked ⚠” | The check failed or timed out. Not their fault; their work is safe | Follow the timeout email you got: it says whether to restart the check or ask the student to press Submit for Feedback again. Contact your admin if it keeps happening |
| “I submitted but there's no feedback” | The check may still be in line or running | Feedback is a comment: have them open the document and click Comments. Their card says “Waiting for feedback…” or “Being checked now…” while it's on its way |
| “It says Not enough to evaluate yet” | Fewer than 25 words below the grey line | Ask them to write more under “── YOUR RESPONSE BEGINS HERE ──”, above the “Do not delete this line” line |
| “My assignment isn't on my dashboard” | Wrong Google account, the lesson hasn't been released, or they're not enrolled | Have them sign into their school account. Check the lesson has a start date in 📅 Lessons. If they're not on your roster either, see How Students Get Their Documents |
| “I don't see the 📊 menu in my document” | Expected: that menu doesn't run for student accounts | Send them to their dashboard to press **Submit for Feedback** |
| “I deleted part of my document” | They changed the assignment, the grey line or the bottom line | File → Version history → See version history to restore. If the grey line or the CONFIG_ID line is gone for good, contact your admin |
| “My Info is wrong” | Their name, class, period or teacher is wrong on file | They can press ✉ Request a correction in My Info, which opens an email to you. Ask your admin to fix it |
| “How do I turn it in?” | They turn in on Canvas | Copy the document's link, open the Canvas assignment, Start Assignment → Website URL, paste, Submit Assignment |

🎓

## Grading and Competency Ratings

**Grade in Canvas.** Each Canvas assignment asks for the student's document link (Website URL). The system doesn't send grades to Canvas. The AI's suggested score on a passing check, 2 (Adequate), 3 (Solid) or 4 (Exceptional), is a reference only. Higher is better.

**Rate competencies in 🎓 Competency ratings.** Each item shows the student, the competency, “Evidence so far: n met, n not met, n partially met”, and the AI-suggested rating. Press **Confirm** to accept it, or type 1–5 under “Or enter 1–5” and press **Submit**. Items with too little evidence say so; you can still enter a rating.

| Rating | Meaning (1 is the highest) |
| --- | --- |
| 1 | Can teach others |
| 2 | Without supervision |
| 3 | Limited supervision |
| 4 | With supervision |
| 5 | Cannot perform |

> **The two scales run in opposite directions.** On a competency rating, 1 is the highest. On the AI's suggested score, 4 is the highest. Changing a suggested rating from 2 to 4 lowers it.

**How the AI suggests a rating** (updated weekly). Every check records evidence for the competencies its milestones cover. One assignment counts once, at its best result, so drafts don't count against a student. With 3 or more assignments, it averages the 3 best (Met = 2, Partially met = 3, Not met = 4) and rounds. With fewer than 3, there's no suggestion yet. It only ever suggests 2, 3 or 4: 1 and 5 are yours alone.

📅

## Marking Periods and the School Year

Use the year menu in the header. It starts on **Whole school year**. Pick a marking period, such as “Marking period 1, 2026–27”, to see only that part. A student's work belongs to the marking period it was made in.

> **Archiving is your admin's job.** At the end of a school year, the admin archives it. Archived work no longer shows on the dashboard. It's kept, not deleted, and the admin can bring a year back.

> **Before a marking period ends:** click ⚪ Not checked yet and ✏️ Checked, not passing yet, and reach out to those students.

🔒

## What You Can Change

| Item | Can you change it? | How |
| --- | --- | --- |
| Lesson start dates | ✅ Yes | 📅 Lessons → Starts. Saves when you change it |
| A lesson's text, task and competencies | ✅ Through a draft | 📅 Lessons → Edit. The draft is reviewed before students see it |
| A new lesson | ✅ Through a draft | 📅 Lessons → + New lesson |
| Where feedback goes | ✅ Yes | 💬 Feedback, per course |
| Student details (name, class, period) | ❌ Ask your admin | They come from the Canvas roster |
| A student's document | 💬 Comment only | The student edits; you can comment |
| Grades | ✅ In Canvas | The suggested score is a reference; the grade is yours |
| Competency ratings | ✅ Yes | 🎓 Competency ratings: confirm, or enter 1–5 |
| The system's spreadsheets | ❌ Don't edit | Except a step a timeout email asks for |

❓

## Words You'll See

The same list as **❓ Terms** on your dashboard.

- **Check**: One AI evaluation of a submission against the assignment’s criteria (Flow 2). A student can be checked many times.
- **Passed / Not passing yet**: Whether the latest check met the assignment’s criteria. “Passed before” means an earlier check passed and the latest needs revision.
- **Waiting to be checked**: Submitted and in line for its check.
- **Being checked now**: The check is running.
- **Couldn’t be checked**: The check failed or timed out, not the student’s work. The timeout email says what to do.
- **AI’s suggested score**: On a passing check, the AI suggests 2 (Adequate), 3 (Solid) or 4 (Exceptional). Higher is better. It never suggests 1 or 5.
- **Competency rating (SCR)**: The Virginia CTE Student Competency Record, 1 to 5, where 1 is the highest: 1 Can teach others, 2 Without supervision, 3 Limited supervision, 4 With supervision, 5 Cannot perform. The AI suggests 2 to 4 once there are 3 pieces of evidence; 1 and 5 are yours alone.
- **Competency tiers**: Each assignment’s competencies are primary (must be shown to pass), secondary or tertiary (credited when shown).
- **Warm-up readiness**: How much the system knows about each student, from checks and warm-up answers. Click a number to see those students.
- **Personalized learning profile**: The system’s growing guess of what kind of warm-up works for a student; “ready for fully personalized feedback” means it’s confident.
- **Student Context**: One document per student that gathers their lessons, checks and warm-ups, updated weekly.
- **Current lesson**: The lesson whose start date in 📅 Lessons is the latest on or before today, per course.
- **Rollout**: The nightly job that makes and shares each lesson’s student documents from its start date (2 days ahead).
- **Feedback as a comment**: Where a student’s feedback goes: a comment on the document, or written into it. Set per course in 💬 Feedback.
- **3-Odd / 3-Even**: The two halves of period 3, which meet on alternate (odd or even) calendar dates.
- **Marking period**: A term code like 2627_MP1 is marking period 1 of 2026–27.

Assignment System — Teacher Reference Guide · Contact your system admin for anything not covered here.
