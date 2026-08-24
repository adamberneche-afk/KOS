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
| Turn-In Form | Students submit their final work here — shared across all teachers | Link in your Teacher Setup Details page — share this with students |
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
  📁 _Student Shared Folders/                ← student docs live here
    📁 [Block - Class - Teacher]/            ← per-class folder
      📄 [Assignment] — [Student Name]
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
4. **Tell the student to check Shared with me** — Send the student a quick message that their document is ready. They find it in Google Drive → Shared with me. Their Turn-In Form link is already in the document footer.

> 💡 **Register students in groups of 20–30.** Large batches can occasionally time out. If a student doesn't receive their document within 5 minutes, submit the registration form again — re-submission is safe. Check your dashboard to confirm the student appears.

> 📋 **Course name must match exactly.** The course name in the registration form must match exactly what you used when creating the assignment. Case and spacing matter.

## Your Dashboard

Your teacher dashboard shows all your students and their current assignment status. Open it from `⚙️ Assignment System → Open My Dashboard`.

- **Term filter:** Use the dropdown at the top to filter by academic term. The current term is selected by default. Select "All Terms" to see every student across all terms.
- **Sorting:** Flagged students appear first. Within each assignment group, students are sorted alphabetically. Students with flagged submissions (turn-in errors, processing failures) appear at the very top.
- **Refresh:** The dashboard doesn't update automatically — click the ↻ Refresh button to see the latest status.

> 💡 Click a student's "Open document ↗" link to go directly to their assignment document. You can read their response, see their full evaluation history, and check the compliance stamps from there.

## Understanding Student Status

| Status | Meaning |
|---|---|
| **NOT STARTED** | Document was created, student hasn't run their first evaluation yet. Normal for the first few days after registration. |
| **QUEUED** | Student clicked "Run Assignment Check" — work is queued for evaluation. Should resolve to EVALUATED within 3 minutes. |
| **EVALUATING** | Evaluation is actively running right now. Normal — this resolves within 1–2 minutes. |
| **EVALUATED** | Feedback has been delivered. Student either passed or needs to revise. Open their document to see the result. |
| **PENDING REVIEW** | Student submitted via the Turn-In Form and passed all automated checks — but this is no longer the final step. Your dashboard's **Pending Review** card shows every submission waiting here, each with an AI-suggested score. Click a student's "Review Submission →" button to accept the suggested score as-is, or enter your own — either action is what finally makes it COMPLIANT. Nothing becomes final without you. |
| **COMPLIANT ✓** | You've reviewed and confirmed (or overridden) the submission's final score. Work is complete. |
| **ARCHIVED** | Archived at end of term by the admin. No longer visible in the default dashboard view — select "All Terms" to see archived students. |
| **FLAGGED ⚠** | Something went wrong — submission error, processing failure, or a turn-in rejection that needs investigation. Open the student's document to read the error notice. |

## What Module 2 Does and Why

Module 2 is the one part of this system that gets more useful the more you use it — it's what lets warm-up questions and feedback personalize to each student over time, instead of treating every student identically. Three pieces work together:

**Competency checkboxes.** Every time you log Lesson Context, you check off which state competencies that lesson addressed. This is the only place that connects a specific day's teaching to a specific competency — checking these is what feeds a student's SCR (Student Competency Record) evidence and, downstream, the warm-up personalization below.

> 💡 If you skip the checkboxes for a lesson, that lesson simply doesn't count toward any competency's evidence — there's no way to recover it later. Logging Lesson Context without checking competencies still works for the roster/context features below, just not for SCR evidence.

**"My Context" tab.** A roster view of every student's document, aggregating their lesson history, evaluation activity, and warm-up responses in one place — regenerated weekly, not live. Use it to see what a student's document actually contains without opening each one individually.

**Warm-up readiness.** The panel at the top of your dashboard shows how many students have enough history (evaluation results, warm-up responses, logged lesson context) for the system to generate a genuinely personalized warm-up question, versus a generic one. Click any of those numbers to filter your roster to exactly those students — the "building a personalized learning profile" group's next step is always the same: log more Lesson Context for that class.

> 🔗 The throughline: Lesson Context + competency checkboxes → SCR evidence and warm-up readiness → more personalized questions and feedback for that class. Skipping the checkboxes doesn't break anything today, but it's the one habit that determines how much value Module 2 actually delivers later.

## When Students Have Problems

| Student says… | What's happening | What to do |
|---|---|---|
| "I don't see the 📊 menu in my document" | Wrong Google account, or they opened a copy/new doc instead of their shared original | Ask them to sign out and sign into the correct account, then find the document in "Shared with me" in Drive |
| "I submitted for feedback but nothing appeared" | Evaluation may still be running, or a pipeline issue | Ask them to check status via the menu and wait another 2 minutes. If nothing after 5 min, check the dashboard — if still QUEUED, contact admin to check the pipeline |
| "The system says I haven't written enough" | Response is under 25 words | Ask them to write more — the system needs enough content to evaluate meaningfully |
| "I accidentally deleted something in the document" | Student edited a protected zone (feedback, footer, prompt) | Ask them to use File → Version history → See version history to restore. If they deleted the CONFIG_ID footer, contact admin — the document may need to be re-created |
| "I can't find my document" | Looking in the wrong place or wrong account | Tell them to go to drive.google.com → "Shared with me". If still missing, check your dashboard — if the student doesn't appear, their registration may have failed. Re-register them |
| "The Turn-In Form gave me an error" | Various — see Turn-In Rejections below | Ask them to open their document — a notice has been written in the feedback zone explaining exactly what to do |

## Turn-In Rejections

When a turn-in submission is rejected, a plain-language notice is written directly into the student's document explaining what happened and what to do. You receive a notification email for each rejection. Here's what each code means:

| Rejection Code | Cause | Resolution |
|---|---|---|
| `NO_EVALUATION_FOUND` | No evaluation has been run yet, or the evaluation stamp is missing | Student needs to run an evaluation first via the 📊 menu |
| `REVISION_REQUIRED` | Most recent evaluation showed revisions needed | Student needs to revise and pass another evaluation before submitting |
| `MISSING_CONFIG_ID` | Student submitted the wrong document — one without the assignment tracking code | Student needs to find their original assignment document in "Shared with me" |
| `LEDGER_MISMATCH` | Google account signed into the Turn-In Form doesn't match the registered account | Student needs to sign into the correct Google account before opening the Turn-In Form link |
| `FORENSIC_FAILURE` | System couldn't verify the evaluation report's authenticity | You need to manually review the student's document. Use Admin Controls → Manually Mark Student Compliant if you're satisfied the work is genuine |

> 💡 Most turn-in rejections are self-resolving — the notice in the student's document tells them exactly what to do. You only need to take action for **FORENSIC_FAILURE** cases.

## Term Management

The system tracks which academic term each student registration belongs to. This allows dashboards to filter by term and allows completed terms to be archived cleanly.

> 📋 **Term management is handled by the admin** — not by teachers. This section explains what happens so you understand what you'll see at the start and end of each term.

**Start of term.** The admin sets the current term (e.g. "2025-26 S2") before new students are registered. Your dashboard will automatically show the current term by default when you open it.

**During the term.** Your dashboard shows all students from the current term. Use the term filter dropdown to switch between terms — for example, to check whether a student completed work in a previous term.

**End of term.** The admin archives completed terms via Admin Controls. Archived students disappear from the default dashboard view. Their records are preserved for academic integrity purposes — they're hidden, not deleted. To see archived students, select "All Terms" from the filter dropdown.

> 💡 **Before the term ends:** make sure all student statuses are resolved. Students still showing EVALUATED or NOT STARTED at term-end won't be automatically handled — reach out to them directly before the admin archives the term.

## What Teachers Can and Can't Edit

| Item | Can edit? | Notes |
|---|---|---|
| Prompt template document | ✅ Yes | Edit it anytime. Changes affect students registered after the edit — already-registered students have the prompt injected at creation time |
| Assignment criteria (milestones, persona) | ⚠️ Create new assignment | Use the rubric upload flow to create a new assignment with updated criteria. Don't edit the Teacher Matrix directly |
| Student registration details | ❌ Contact admin | Student name, email, class, period — these are locked in the Ledger. Admin can correct them |
| Student's assignment document | ⚠️ With care | You have editor access to every student doc. Only edit the response zone if absolutely necessary — do not touch the footer or compliance stamps |
| Student compliant status | ✅ Via admin | Ask admin to use "Manually Mark Student Compliant" if you've personally reviewed a FORENSIC_FAILURE case |
| Turn-In Form | ❌ Do not edit | Shared across all teachers and managed by admin |
| Teacher Matrix spreadsheet | ❌ Do not edit | System-managed. Editing rows directly can corrupt the evaluation pipeline |

---
*Assignment System — Teacher Reference Guide. Contact your system admin for anything not covered here.*
