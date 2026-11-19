# Flow 2's versions, October–November 2026

What changed in how Flow 2 grades, and when it was **live** (pushed and,
where a switch applies, switched on), so a grading can be read against the
version that made it. Built 2026-11-16 from the handoffs, `cas-ccps/HISTORY.md`
and the operator's account of the Studio side. No student data.

`reportGradingByVersion({ beforeSsId })` (69) groups every grading by its
prompt version, read from the row's own PromptText rather than its date,
and by the platform it was graded on (`FLOW2_PLATFORM_EPOCHS`).

## Three kinds of change

- **The grader:** what Flow 2 is asked and what runs it (the prompt, the
  passing rule, the model, Studio's pipeline). It changes how the same work
  is graded.
- **Students' behavior:** what work arrives and why (lessons in parts, the
  turn-in code, the feedback reflection). It changes what is graded.
- **The platform under us:** Studio and Gemini releases, with no push of
  ours.

The 11-15 re-grade measures the grader only; week-to-week numbers mix all
three.

## Timeline

| Live | Kind | Change |
|---|---|---|
| 10-13/14 | — | First real student submissions (the first failed "didn't answer") |
| 10-16 | Grader (delivery) | Feedback lands in the doc's feedback zone |
| 10-17 | Grader (delivery) | Feedback as a comment, behind a switch |
| 10-20 (morning push) | Grader | **Competency tiers and the PASSING RULE** in every prompt (primary MET; secondaries at least PARTIALLY MET; tertiaries never count, ALSO SHOWN); the criteria rebuilt; live assignments refreshed; Flow 2 starts on its own (before, READY was retyped by hand) |
| 10-20 | Grader (task) | Assignment prompts reworked so the evidence is in the doc |
| 10-25 (push) | Grader | The "I can" objectives in the task (What your work needs to show) |
| 10-27, about 8 p.m. | Grader + behavior | **The process reflection on** for both courses (every ⚙ Settings feature on); the feedback reflection (a resubmission's question about the last feedback) |
| 10-29 (push through #337) | Behavior + grader | **Lessons in parts**; the **EARLIER PARTS** block in the prompt |
| 11-01 (push through #370) | Grader | Injection guards on student words entering the prompt |
| 11-09 (push through #417) | Behavior + grader | **The turn-in code on for every lesson** (Flow 6); Forms, Slides and Sheets parts, which Flow 2 reads as a snapshot doc |
| 11-13 | Platform | Studio's **hydrogen 4.1 release** (the operator's account): Studio ran nothing until new settings were chosen and permissions granted; submissions timed out and rows waited |
| 11-13, afternoon | Platform | **A new Gemini model** (the operator's account) |
| 11-14 | Platform | Flow 2 restarted in Studio |
| 11-15 | Platform | **Studio rebuild:** the Extract step rebuilt, the Ledger removed as a Drive source, Update rows matched on StagingRowRef, increased capacity |
| 11-15 (push through #445) | Grader (delivery) | Restarts of an unanswered row, parallel lanes, the not-answering email |
| 11-15, 2:33–2:44 p.m. | — | The "any" re-grade of every FlowInput row (new model, rebuilt Studio) |
| 11-15, 4:23 p.m. (push through #453) | Grader (delivery) | Malformed results and duplicate writes held back |
| The push after 11-19 (D19) | Grader (delivery) | An answer whose run line names another row's run (`RUN_KEY_MISMATCH`) held back, re-armed once |

## Recorded from 2026-11-16 on

This timeline was rebuilt by hand. From the next push on, each result
records its own versions (`EvaluationLog`: CodeVersion, PromptVersion,
PromptHash, RunCheck, ModelReported, ModelConfigured), the operator records
Studio changes in `StudioConfig`, and a daily probe (`Flow2Drift`) catches a
platform change no one recorded. Add a row to the table above for each
change all the same: it is the one place the three kinds are read together.

## Reading the data against it

- **The live FlowInput tab holds the re-grade for every row built before
  11-15, 2:33 p.m.** The originals are only in a copy of the Ledger from
  before it; the report reads both.
- **A row's grading time** is its ArmedAt when it was restarted, else its
  Timestamp. Rows stuck over 11-13/14 were graded later than they were built.
- **11-13 afternoon to 11-14:** the outage. Leave its timeouts out of any
  failure rate; they say nothing about grading.
- **Before 11-15's rebuild, one answer could land in several rows of a doc**
  (Update rows matched on StudentFileID/ConfigID). The report sets such
  copies apart.
- **The re-grade compares two platforms** for every original graded before
  11-13 (the model and the pipeline both changed); within one prompt
  version, original against re-grade is the platform's effect.
- **Student behavior changes** (parts, the turn-in code) move the mix of
  work, so a week's pass rate is not the grader's alone.
