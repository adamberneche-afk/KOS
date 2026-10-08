# Teacher Reference Guide

Everything you need to know for day-to-day use of the Assignment System. This is a reference document — consult it when you have a question, not just during setup.

Topics: creating assignments · registering students · reading your dashboard · handling problems · end of term.

## Your Setup

You received an Admin Manual Google Doc with your name on it. When you first ran the setup wizard, it created your personal workspace automatically. Here's what was created and where to find it.

| Asset | What it does | Where to find it |
|---|---|---|
| Teacher Manual Doc | Your operational hub — contains all your links and the ⚙️ Assignment System menu | In your Google Drive — the document you ran setup from |
| Rubric Upload Form | Submit a new rubric to create an assignment | Link in your Teacher Setup Details page (end of manual) |
| Student Registration Form | Register a student for an assignment | Link in your Teacher Setup Details page |
| Canvas assignment | Where students turn in (their document's link) and where you grade | Your Canvas course (imported from the CAS cartridges) |
| Student Dashboard | Where students submit for feedback and see where each assignment stands | The link near the top of every student document |
| Teacher Matrix Sheet | Your assignment configurations — do not edit directly | Link in your Teacher Setup Details page |
| Teacher Dashboard | Live view of all your students' progress | ⚙️ Assignment System → Open My Dashboard |

> 💡 **Keep your Teacher Manual bookmarked.** It's the starting point for every action — creating assignments, registering students, and opening your dashboard are all one click from the ⚙️ menu.

## Your Workspace at a Glance

Your workspace lives entirely within Google Drive. The folder structure is organized like this:

```
📁 Assignments/
  📁 [Your Subject]/
    📁 [Your Name]/                          ← your personal folder
      📋 [Name] — Rubric Responses           ← rubric uploads land here
      📊 [Name] — Teacher Matrix             ← your assignment configs
      📬 [Name] — Rubric Upload Form
      📬 [Name] — Assignment Review Form
      📬 [Name] — Student Registration Form
  📁 _Student Shared Folders/                ← no longer used for new work: each
                                             student's doc is shared with that
                                             student and you only, and appears in
                                             their "Shared with me"
```

> 🚫 **Don't edit the Teacher Matrix directly.** It's managed by the system. Editing rows there can break the evaluation pipeline for your students.

## Creating an Assignment

Creating an assignment is a two-step process: upload your rubric, then confirm what the system extracted from it. Once confirmed, the assignment is live for students.

1. **Create your prompt template document** — Write the student-facing assignment instructions in a Google Doc. This is what students will see in their document. Make it as clear as possible — the AI uses this context when evaluating responses. Share the doc as "Anyone with the link can view."
2. **Prepare your rubric** — Write your evaluation rubric. The more specific and detailed it is, the better the AI evaluation will be. Include measurable criteria — "demonstrates understanding of X" is better than "understands X." You'll paste the full rubric text directly into the upload form.
3. **Open the Rubric Upload Form** — Click `⚙️ Assignment System → Create New Assignment` in your manual. Fill in: your name, subject, course name, paste the rubric text, paste the prompt template Google Doc link, and select the academic tier.
4. **Wait for the review email (1–5 min)** — The system processes your rubric and extracts the assignment criteria using AI. You'll receive an email with a pre-filled review link. This usually arrives within 5 minutes.
5. **Review and confirm the extracted criteria** — Click the link in the email. You'll see a form pre-filled with what the system extracted: assignment name, AI coach persona, four milestones, and the passing standard. Review each field. Edit anything that's wrong. Submit when it looks right.
6. **Receive your Config ID** — After confirming, the assignment status changes to LIVE and you receive a confirmation email containing your **Config ID** (format: `VDOE-XXXXXX-YYYY`). Record this — you need it when registering students.

> 💡 **If the review email doesn't arrive after 10 minutes:** check with your admin. The system may have encountered a processing issue with your rubric file. The admin can re-queue it from the Admin Controls panel.

> ⚠️ **Once confirmed, the assignment criteria are fixed.** There is no edit path for a live assignment — changes would invalidate evaluations already delivered. If you need to update the criteria significantly, create a new assignment and use the new Config ID for any remaining students.

## Registering Students

Each student needs to be individually registered for each assignment. Registration creates their personal document and shares it to their Google Drive automatically.

1. **Open the Student Registration Form** — Click `⚙️ Assignment System → Register a Student` in your manual.
2. **Fill in the student's details** — Required: student's Google account email, full name, class name, subject, course name, period, your name and email, the assignment Config ID, and the student's block.

   > ⚠️ **The student's Google account email must be exact.** It's used to match the student to their document when they submit evaluations. A typo here means the student can't use the evaluation system. Double-check it before submitting.
3. **Wait 1–2 minutes for the document to be created** — The system copies the master student template, injects your assignment prompt, and shares the document to the student's Google Drive. The student will find it in their "Shared with me" folder.
4. **Tell the student to check Shared with me** — Send the student a quick message that their document is ready. They find it in Google Drive → Shared with me. The link to their assignment dashboard, where they submit for feedback, is near the top of the document.

> 💡 **Register students in groups of 20–30.** Large batches can occasionally time out. If a student doesn't receive their document within 5 minutes, submit the registration form again — re-submission is safe. Check your dashboard to confirm the student appears.

> 📋 **Course name must match exactly.** The course name in the registration form must match exactly what you used when creating the assignment. Case and spacing matter.

## Your Dashboard

Your teacher dashboard shows where each student's work stands. Open it from `⚙️ Assignment System → Open My Dashboard`.

- **Lesson picker:** the dashboard opens on the **current lesson** for each course: the lesson in the LessonSchedule tab with the latest start date on or before today. The dropdown at the top switches to any other lesson, or to **All assignments**.
- **Summary cards:** at the top, a count for each state (below). Click a card to show only those students; click it again to clear the filter.
- **Order:** one section per lesson, students by period, then name, which is easiest to follow alongside SpeedGrader.
- **Each student:** their state, how many checks they've run, the date of the last one, when they first passed, and the **suggested score** from their latest check (a reference only; you grade in Canvas).
- **Term filter:** filters by academic term. The current term is selected by default.
- **Refresh:** the dashboard doesn't update by itself. Click ↻ Refresh to see the latest.

> 💡 Click a student's "Open document ↗" link to open their document. Their evaluations are at the end of it, newest last, so it is the same view you get when you open their Canvas submission.

## Understanding Student Status

Every student's work for a lesson is in one of four states:

| State | Meaning |
|---|---|
| **⚪ Not checked yet** | No evaluation has come back. The student hasn't clicked Submit for Feedback, or their first check is still running. |
| **✏️ Checked, not passing yet** | One or more checks have come back and none passed. This is different from not checked: the student is working on it. |
| **✅ Passed** | The latest check meets the standard. The student may turn it in on Canvas, or keep improving it. |
| **↩️ Passed before, now revising** | An earlier check passed, and the latest one needs revision. |

A second badge appears while a check is in progress or needs attention:

| Badge | Meaning |
|---|---|
| **QUEUED** | The student clicked Submit for Feedback; the work is waiting to be evaluated. It should move on within a few minutes. |
| **EVALUATING NOW** | The evaluation is running. |
| **FLAGGED ⚠** | Something went wrong (a processing failure or timeout). Open the student's document; contact the admin if it doesn't clear. |

Passing isn't required before a student turns in on Canvas. If a submission arrives in Canvas from a student who is ⚪ or ✏️ here, that's your flag that it hasn't passed a check.

## What Module 2 Does and Why

Module 2 is the one part of this system that gets more useful the more you use it — it's what lets warm-up questions and feedback personalize to each student over time, instead of treating every student identically. Three pieces work together:

**Competency checkboxes.** Every time you log Lesson Context, you check off which state competencies that lesson addressed. This is the only place that connects a specific day's teaching to a specific competency — checking these is what feeds a student's SCR (Student Competency Record) evidence and, downstream, the warm-up personalization below.

> 💡 If you skip the checkboxes for a lesson, that lesson simply doesn't count toward any competency's evidence — there's no way to recover it later. Logging Lesson Context without checking competencies still works for the roster/context features below, just not for SCR evidence.

**"My Context" tab.** A roster view of every student's document, aggregating their lesson history, evaluation activity, and warm-up responses in one place — regenerated weekly, not live. Use it to see what a student's document actually contains without opening each one individually.

**Warm-up readiness.** The panel at the top of your dashboard shows how many students have enough history (evaluation results, warm-up responses, logged lesson context) for the system to generate a genuinely personalized warm-up question, versus a generic one. Click any of those numbers to filter your roster to exactly those students — the "building a personalized learning profile" group's next step is always the same: log more Lesson Context for that class (lessons drafted nightly from the pacing guide count too; adjusting a drafted lesson's competencies improves them).

> 🔗 The throughline: Lesson Context + competency checkboxes → SCR evidence and warm-up readiness → more personalized questions and feedback for that class. Skipping the checkboxes doesn't break anything today, but it's the one habit that determines how much value Module 2 actually delivers later.

## When Students Have Problems

| Student says… | What's happening | What to do |
|---|---|---|
| "I don't see the 📊 menu in my document" | Expected: the district turns Apps Script off for student accounts, so the menu never appears for them | Send them to their assignment dashboard (link near the top of their document) and have them click **Submit for Feedback** |
| "I submitted for feedback but nothing appeared" | The evaluation may still be running, or a pipeline issue | Feedback is added at the **end** of the document. Ask them to refresh it. If nothing after 10 minutes, check your dashboard: if they're still QUEUED, contact the admin to check the pipeline |
| "The dashboard says I haven't written enough" | Fewer than 25 words below the response line | Ask them to write more below "── YOUR RESPONSE BEGINS HERE ──" |
| "My assignment isn't on my dashboard" | Signed into the wrong Google account, or not registered | Have them sign into their school account. If they still don't appear on your dashboard, their registration may have failed |
| "I accidentally deleted something in the document" | Student edited a protected zone (feedback, footer, prompt) | Ask them to use File → Version history → See version history to restore. If they deleted the CONFIG_ID footer, contact admin — the document may need to be re-created |
| "I can't find my document" | Looking in the wrong place or wrong account | Tell them to go to drive.google.com → "Shared with me", or open it from their dashboard |
| "How do I turn it in?" | They turn in on Canvas | Copy the document's link, open the Canvas assignment, Start Assignment → Website URL, paste, Submit |

## Turning In, Grading and the SCR

**Turning in happens in Canvas.** Each Canvas assignment asks students for their CAS document's link (Website URL). You grade there; CAS doesn't send grades to Canvas. The CAS Turn-In Form is retired and was never given to students.

**CAS keeps the SCR current.** Every check writes competency evidence for the competencies its milestones are tied to. The weekly SCR suggestion counts **one piece of evidence per assignment**, using that assignment's best result, so drafts don't count against a student. It averages the student's **three best pieces** (Met = 2, Partially met = 3, Not met = 4) and rounds to the nearest rating. With fewer than three assignments the competency shows "insufficient evidence". Ratings 1 and 5 are never suggested; they're yours to enter as an override. Confirm or override each suggestion in the dashboard's SCR review.

## Term Management

The system tracks which academic term each student registration belongs to. This allows dashboards to filter by term and allows completed terms to be archived cleanly.

> 📋 **Term management is handled by the admin** — not by teachers. This section explains what happens so you understand what you'll see at the start and end of each term.

**Start of term.** The admin sets the current term (e.g. "2025-26 S2") before new students are registered. Your dashboard will automatically show the current term by default when you open it.

**During the term.** Your dashboard shows all students from the current term. Use the term filter dropdown to switch between terms — for example, to check whether a student completed work in a previous term.

**End of term.** The admin archives completed terms via Admin Controls. Archived students disappear from the default dashboard view. Their records are preserved for academic integrity purposes — they're hidden, not deleted. To see archived students, select "All Terms" from the filter dropdown.

> 💡 **Before the term ends:** check for students still ⚪ Not checked or ✏️ Not passing on assignments you expect to be finished, and reach out to them before the admin archives the term.

## What Teachers Can and Can't Edit

| Item | Can edit? | Notes |
|---|---|---|
| Prompt template document | ✅ Yes | Edit it anytime. Changes affect students registered after the edit — already-registered students have the prompt injected at creation time |
| Assignment criteria (milestones, persona) | ⚠️ Create new assignment | Use the rubric upload flow to create a new assignment with updated criteria. Don't edit the Teacher Matrix directly |
| Student registration details | ❌ Contact admin | Student name, email, class, period — these are locked in the Ledger. Admin can correct them |
| Student's assignment document | 🚫 No | You have comment access to your own students' docs, for feedback. Only the student edits, and only until they turn it in; after that it's read-only for them too. Other teachers and classmates have no access |
| Grades | ✅ In Canvas | CAS shows a suggested score as a reference; the grade is yours, in Canvas |
| SCR ratings | ✅ In your dashboard | Confirm or override each suggestion in SCR review |
| Teacher Matrix spreadsheet | ❌ Do not edit | System-managed. Editing rows directly can corrupt the evaluation pipeline |

---
*Assignment System — Teacher Reference Guide. Contact your system admin for anything not covered here.*
