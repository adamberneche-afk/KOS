# Sprint: the Teacher Dashboard's filters, one student's page, and Settings

**Status:** decided with the operator on 2026-10-27; **all four PRs merged the same day** (#297 filters, #298 the student's page and competencies done, #299 ⚙ Settings, #300 docs). Runs the rest of the
week of Oct 26 and the week of Nov 2, inside `PLAN_2026-10.md`'s
"tighten the student and teacher dashboards" window. Grades are due Oct 30,
so the first PR is the small one. No student names, emails, file IDs or
ConfigIDs appear here, by design.

## Why

From the operator's walk of the Teacher Dashboard (2026-10-26):

- The features turned on and off so far (feedback as a comment, warm-ups in
  the text box, the nightly rollout, the reflection on Submit) are set by
  editing the Central Ledger's `_CONFIG` tab or a Script Property. Only one
  of them, feedback placement, has a control on the dashboard (💬 Feedback).
- ✉ Parent Reports lists every student's report, and Student Context lists
  every student's weekly doc. There is no way to look at one student.
- The home page filters by lesson, term and status, but not by course,
  period or student.

## What exists to build on

- **One store for shared settings.** `setSharedConfigValue_` (00) writes a
  row in the Ledger's `_CONFIG` tab; every project reads it through
  `_resolveConfigValues_` within `SHARED_CONFIG_CACHE_TTL_SECONDS` (10
  minutes), at once in the project that wrote it. 💬 Feedback already uses
  it (`setFeedbackPlacement`, 07).
- **The catch.** A Script Property of the same name in a project overrides
  the tab there, and the Teacher Dashboard can see only its own project's
  properties. A Central Ledger Script Property would make a dashboard
  switch look on while the Ledger ignores it.
- **The roster rows already carry** the student, period and class
  (`getDashboardData`, 07); the course code comes from
  `ledgerRowCourseCode_` (00).
- **A student's context doc** (29's `appendWeeklySection_`) is one
  "Week of <date>" Heading 2 per weekly run, so its weeks can be read
  apart.

## Decisions (2026-10-27)

| # | Question | Decided |
|---|---|---|
| 1 | Which features go in Settings | The shared ones: feedback as a comment, warm-ups in the text box, the nightly rollout, the reflection on Submit, the archetype lock, and the marking period end dates. Not the one-time setup switches (`M2_ENABLED`, `AI_FLOWS_LIVE`, the watchdog's dry run): they are Central Ledger Script Properties set once |
| 2 | A change log | Yes: a `SettingsLog` tab (when, which setting, from, to) |
| 3 | Student Context on the student's page | Cycle through the weeks, newest first, with the link to the doc shown on every week |
| 4 | Filters | Course, Period, Student. Not remembered between visits: each load starts unfiltered |
| 5 | Settings per course | Per course, for any number of courses. The stored value becomes a list ("8175,8177"); "off", "all" and one code keep working |
| 6 | Order | Either; filters first (smallest, most used) |
| 7 | A competency counter (added 2026-10-27) | "n of the course total" per course: a competency counts once the teacher's latest confirmed rating is 1–3 (limited supervision or better); the total is every active competency in the course (113 for 8175, 108 for 8177). Shown on the student's page, in the Student Context list (the teacher's own ratings) and on the Student Dashboard (every teacher's). Part of PR 2 |

## The work, in order

| # | PR | What | Push | Size |
|---|---|---|---|---|
| 1 | Home filters | A filter bar: Course, then Period (the course's periods), then Student (that course and period's students). The lesson picker lists the course's lessons; the summary cards, their counts and the list follow the filters; the warm-up readiness numbers count only the filtered students. Filters live in page memory (no browser storage, by the repo's rule) and reset on a reload. The server adds each row's course code; nothing else changes on the server. | Teacher Dashboard | Small |
| 2 | One student's page | Picking a student (in the filter, or their name in the list) opens their page: their assignments with status; this week's parent report with Copy subject, Copy report and when it was copied; their Student Context by week (‹ older, newer ›), each week with the doc's link. ✉ Parent Reports and Student Context get the same Course → Student picker. Server: a new teacher-gated call builds one student's report and reads their doc's weeks. | Teacher Dashboard | Medium |
| 3 | ⚙ Settings | One panel replaces 💬 Feedback: each feature in plain words with a switch per course, and the marking period end dates. A change is confirmed first, then says where it applies: here at once, the Central Ledger and Student Dashboard within 10 minutes. Each change is a `SettingsLog` row. The panel says when a Script Property here overrides a setting. The values become per-course lists (00's `_pivotValueOn_` and `feedbackAsCommentChecker_`), so any course can be on with any other. The Central Ledger's nightly signal gets a setup-check line naming a Script Property there that overrides a setting. | Teacher Dashboard, Central Ledger, Student Dashboard (00) | Medium |
| 4 | Docs | The Terms panel and guide, the user-guide notebook sources, the handoff. | None | Small |

**Before PR 3, from the operator:** run `showConfigSources()` (00) in the
Central Ledger and the Student Dashboard editors and paste the logs: they
show whether any of these flags is a Script Property today.

## Not in this sprint

- ~~A link straight to one week inside the context doc.~~ Built 2026-10-28:
  29 bookmarks each week's heading; both dashboards link to it
  (`addContextWeekBookmarks()` once for older weeks).
- ~~Past weeks' parent reports.~~ Built 2026-10-28: Copy report keeps the
  subject and text in `ParentReportLog`, and the student's page shows past
  copied weeks.
- The one-time setup switches in Settings (decision 1).
