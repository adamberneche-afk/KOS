# FERPA Data Map

**What this document is:** a complete inventory of every sheet/tab in cas-ccps
that holds student-identifiable information — what fields it holds, why it's
collected, who/what can access it, and (where decided) how long it's kept.

**Why it exists:** cas-ccps's own README states the system is FERPA-scoped,
but until this document, no single place inventoried what student data
actually lives where. This closes that gap (Say/Do Ledger cas-ccps finding
#5). It is a companion to, not a replacement for, the general compliance
statement in `docs/SYSTEM_ARCHITECTURE.html`'s Security Model section —
the two are now the canonical compliance-reference pair. (This document
used to describe itself as a companion to `docs/KOS_Guide_IT__Admin_Security.pdf`
instead — that PDF was later investigated and confirmed to describe an
entirely different, abandoned pre-v8 architecture never carried into the
live system, and has been archived; see `README.md`'s note on this.)

**Retention policy — partially defined, `SCRDecisionLog` and `Ledger` only.**
Every other tab in this document still persists indefinitely, with no
deletion/archival mechanism at all. `SCRDecisionLog` — the one tab with an
actual VDOE/Perkins legal retention obligation — was the first exception,
built as Say/Do Ledger cas-ccps Extension 3: a configurable
`SCR_RETENTION_YEARS` Script Property (default 5 years, **still unconfirmed
against a primary source** — direct confirmation with VDOE/central-office
records staff remains outstanding) drives an automated archival routine
(`_archiveExpiredScrDecisions_()` in `30_SCRSuggestionEngine.js`) that flips
a row's `archive_status` column to "ARCHIVED — pending disposition review"
once it's older than the configured window — run automatically every time
`autoHealthAlert()`'s daily trigger fires or an admin runs
`runSystemHealthCheck()` on demand. This never deletes anything — actual
permanent deletion still always requires a human to look at the archived
rows and decide by hand; no script here automates that step. A new
admin-triggered "📤 Export SCRDecisionLog for Audit" menu item
(`exportScrDecisionLogForAudit()`) shares an audit export directly with
specific central-office accounts, restricted to the admin's own school domain.

**`Ledger`** (external product review, Finding 6, "this quarter" scaling
fix) got the same treatment, extended: a configurable
`LEDGER_RETENTION_YEARS` Script Property (default 5 years, **also
unconfirmed against any real district/legal retention schedule for
assignment records specifically** — no primary source has been checked for
this any more than one had been checked for SCR ratings when that default
first shipped) drives `_archiveExpiredLedgerRows_()`
(`10_AdminRecoveryPanel.js`), run on the same daily/on-demand triggers as
the SCRDecisionLog archival above. It reuses the Ledger's own pre-existing
`Status` column value "ARCHIVED" — the same value the manual, admin-triggered
"📦 Archive Completed Term" menu item (`archiveCompletedTerm()`) already
writes, and the same value `13_StudentDashboard.js` already excludes from
a student's own dashboard — rather than adding a second, parallel
archive-flag column. Only rows already in a terminal status
(`COMPLIANT`/`ACTIVE`/`COMPLETE`) are eligible; an `ERROR`-prefixed row is
left alone for admin review, same as `archiveCompletedTerm()`'s own rule.
Never deletes anything, same as SCRDecisionLog's archival.

For every other tab, treat "retention: indefinite, no policy" as the honest
answer — this document does not assert a retention period that isn't actually
enforced anywhere.

---

## Student-identifiable tabs

### Ledger
*Central spreadsheet, all teachers*

| | |
|---|---|
| **Fields** | Timestamp, GoogleID (student's district **email**, not a Google account ID — see note below), ConfigID, FileID, StudentName, Block, ClassName, TeacherName, TeacherEmail, Subject, CourseName, Period, Status, SubmissionTS, Notes, LastEval, AdminFileURL, StudentFileURL, AcademicYear |
| **Why collected** | The system-of-record for every assignment: who submitted what, when, to which teacher, with what evaluation outcome. Every other tab in cas-ccps traces back to a Ledger row. |
| **Written by** | Scripts 02 (intake), 04 (turn-in gate), 10 (manual `archiveCompletedTerm()` and automatic `_archiveExpiredLedgerRows_()` — both only ever set `Status` to `ARCHIVED`, never any other field) |
| **Read by** | Scripts 03, 07 (Teacher Dashboard), 10 (Admin Recovery Panel), 13 (Student Dashboard), 23, 24, 29, 30, 33 |
| **Visible to** | The student's own teacher (Teacher Dashboard, gated by `_isAuthorizedTeacher_()`); the student themselves (Student Dashboard, own row only); admin (Admin Recovery Panel) |
| **Retention** | `LEDGER_RETENTION_YEARS` (Script Property, default 5, unconfirmed — see above) via `_archiveExpiredLedgerRows_()`, run automatically on every daily health check and every on-demand admin health check. A `COMPLIANT`/`ACTIVE`/`COMPLETE` row past the window gets `Status` set to `ARCHIVED`; `ERROR`-prefixed rows are left for admin review. Actual deletion is never automatic. |

> **Naming note:** the column labeled `GoogleID` throughout this codebase (here and in every tab below) is populated with the student's district **email address**, not a separate Google account identifier. There is no non-PII stable student ID anywhere in cas-ccps today — a fact that matters for the Bonus-2 fix below.

### StudentProfiles
*Teacher-scoped, one row per student per teacher*

| | |
|---|---|
| **Fields** | Student email, student name, "GoogleID" (= email), teacher email, period, competencies addressed, competency gaps, evaluation signals (extracted strengths/gaps + a plain-language note), warm-up scores, extra-credit count, average engagement score, last-updated, shadow matrix (per-unit confidence/archetype model), current unit |
| **Why collected** | Powers warm-up personalization (Flow 3) and the Teacher Dashboard's warm-up-readiness panel — the system's one real "gets smarter about this student over time" mechanism. |
| **Written by** | `updateAllStudentProfiles()` (Script 23), nightly 3am |
| **Read by** | `getStudentProfileSnapshot_()` and `buildShadowMatrixSummary_()` (Script 23), Script 25, Script 33 |
| **Visible to** | The student's own teacher (Teacher Dashboard warm-up-readiness panel and per-student shadow-profile view); Studio Flow 3 (via a redacted snapshot — see Bonus 2 below) |
| **Retention** | Indefinite — not yet defined |

### LessonContext / AlignmentLog
*Teacher-authored, class-level — no student PII*

Lesson plans and competency-coverage logs. Included here only to confirm they
were checked and contain no student-identifiable fields — teacher email is
the only person-identifying column in either tab.

### WarmUpQueue
*Per-lesson, per-student — the primary Studio Flow exposure surface*

| | |
|---|---|
| **Fields** | Queue ID, lesson ID, student email, student name, "GoogleID" (= email), lesson date, **lesson-context snapshot** and **student-profile snapshot** (both full JSON payloads sent to Studio Flows 3/5), status, generated doc ID/URL, word count, grammar/engagement/total scores, extra credit, Flow 4 feedback, response text, archetype, bridge output |
| **Why collected** | The working table for warm-up generation, scoring, and feedback — Studio Flows 3, 4, and 5 all read/write directly against this tab via the Sheets connector. |
| **Written by** | Script 24 (build), Script 25 (scoring), Studio Flow 3 (doc creation, archetype write-back), Studio Flow 5 (bridge output) |
| **Read by** | Script 23 (nightly), Script 25 |
| **Visible to** | Studio Flow 3/4/5 (external — reads/writes directly, no gate in this repo's own code); the student, indirectly, via the generated warm-up doc |
| **Retention** | Indefinite — not yet defined |

> This is the tab the Bonus-2 fix below actually touches — see "Flow 3 name exposure" section.

### WarmUpRegistry
Per-warm-up record (student email/name, teacher, doc ID/URL, generated-at,
scores, term). Read by Script 23 only; not surfaced to any teacher/student
UI directly.

### WarmUpResponses
Raw student-written warm-up response text, keyed by student email + lesson
unit. Read/written entirely within Script 29; not currently surfaced outside
that script.

### StudentDocRegistry
Student email/name + their assignment doc's ID/URL/creation and update
timestamps. The doc itself is shared with the student via `addViewer(email)`
— standard per-student Drive sharing, not a broad-access grant.

### CompetencyEvidence
Evidence ID, student email, competency ID, milestone text, MET/NOT MET/PARTIAL
outcome, ConfigID, evaluated-at timestamp, student file ID. Written by two
code paths that share this exact 8-column schema (confirmed the reader below
resolves columns by header name, not position, so both writers must keep
matching headers in matching order): `cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`
(the real Studio Flow 2 write step, once deployed) and
`15c_Flow2DirectEvaluationService.js`'s `writeCompetencyEvidenceFromFlow2_()`
(the manual/dev-testing DIRECT_GEMINI bridge). The Studio step creates the
tab itself if missing (both writers seed its header row on an otherwise-empty
tab). Read by Script 30's evidence aggregation and Script 30b.

### SCRSuggestions
Student email, competency ID, AI-suggested rating (1–5), MET/NOT MET/PARTIAL
counts, status, confirmed rating, confirmed-at, confirmed-by (the teacher who
accepted/overrode the suggestion). The working table — superseded by
SCRDecisionLog once a teacher actually confirms a rating.

### SCRDecisionLog
| | |
|---|---|
| **Fields** | Decision ID, student email, competency ID, suggested rating, final rating, decision type, decided-at, decided-by, evidence snapshot, archive status |
| **Why collected** | **The actual legally-retained record** — this is the one tab in cas-ccps whose retention obligation is named in a code comment already (VDOE's General Schedule GS-21 / 8VAC20-120-120), append-only — rows are never deleted by any code path, though a row can now be marked archived (see Retention below). |
| **Read by** | `exportToWorkbookGrid_()` (Script 30), via the admin-facing `exportScrDecisionLogForAudit()` menu item |
| **Visible to** | Admin (via export, now shared directly with specific central-office accounts on the same domain — see Extension 3 note above) |
| **Retention** | `SCR_RETENTION_YEARS` (Script Property, default 5 — see the Extension 3 note above) via `_archiveExpiredScrDecisions_()`, run automatically on every daily health check and every on-demand admin health check. A row past the window gets `archive_status` set to "ARCHIVED — pending disposition review"; actual deletion is never automatic. |

### RubricQueue
Teacher-authored rubric text only — no student PII. Included for completeness
since it's a central, shared tab.

---

## Trust surfaces and access boundaries

- **Teacher Dashboard** — gated by `_isAuthorizedTeacher_(cfg)`; a teacher only ever sees their own students' rows (Ledger's `TeacherEmail` column, StudentProfiles' `SP_TEACHER_EMAIL`).
- **Student Dashboard** — a student only ever sees their own row.
- **Admin Recovery Panel** — full read access to Ledger, StudentProfiles, and (via export) SCRDecisionLog. This is the one surface with the broadest reach into student data, and the one place a health-check gap (see below) mattered most.
- **Studio Flows 1–5** — external, outside this repo's own access-control code. Flows 1, 2, 4, 5 never receive a real student name (opaque IDs/content only, already true before this document). **Flow 3 is the one exception** — see below.
- **leader-hub JSON API** (`07_TeacherDashboard.js`'s `doPost()`, D1/Addendum 24) — a separate, machine-to-machine trust surface, not a browser session: gated by a Google ID token verified server-side against `oauth2.googleapis.com/tokeninfo`, checked against this deployment's own `TEACHER_EMAIL` (same identity boundary as `_isAuthorizedTeacher_()`, re-implemented for an HTTP caller instead of `Session.getActiveUser()`). Two of its three actions (`getPacingGuide`, `getCompetencyRegistry`) carry no student PII. The third, **`getRoster`** (Addendum 26), does — name, email, and a free-text period field, per-teacher-scoped the same way as everything else in this table. Once returned, this data is out of cas-ccps's control; leader-hub's own handling of it is documented in `leader-hub/README.md`, not here.

## Flow 3 name exposure (Bonus 2 — fixed)

`getStudentProfileSnapshot_()` (`scripts/23_StudentProfileManager.js`) is the
only place in cas-ccps that ever wrote a real student name into a Studio Flow
payload. Investigated options:

- **A full stable-ID substitution** (send an opaque ID instead of a name,
  restore the real name server-side after Gemini responds) — the originally
  proposed design. **Doesn't fit these mechanics**: Flow 3 needs the
  student's name *during* generation, to address them by name inside the
  warm-up question text it writes — that happens entirely inside the
  external Studio Flow, so there is no "after Gemini" step this repo's own
  code could intercept to restore anything.
- **First-name-only redaction** (what's actually built): Flow 3's own prompt
  templates only ever use `{first_name}` for personalization — the full last
  name was never actually needed by the feature. `getStudentProfileSnapshot_()`
  now sends only the first word of the student's name by default, closing
  almost all of the real exposure (no last name ever leaves the `WarmUpQueue`
  cell) while preserving what the personalization feature is for.
- **`FERPA_FLOW3_FULL_NAME_OVERRIDE`** — a Script Property, unset/off by
  default, that reverts to sending the full name if explicitly set to
  `"true"`. An intentional, auditable escape hatch, not a silent gap — the
  admin health check (below) alerts if it's ever turned on.

## Health checks (Bonus 1 — added; item 4 added later, Extension 3)

`10_AdminRecoveryPanel.js`'s `_ferpaHealthChecks_()` (shared by both
`autoHealthAlert()`'s daily email and `runSystemHealthCheck()`'s on-demand
dialog) now checks four things:

1. **`GEMINI_API_KEY` is not set** — this property existing would mean the
   dead direct-Gemini-API code path in `25_WarmUpWriter.js`'s `callFlow4_()`
   could go live, bypassing the Studio Flow boundary entirely.
2. **`FERPA_FLOW3_FULL_NAME_OVERRIDE` is not set to `"true"`** — see above.
3. **No file matching `exportToWorkbookGrid_()`'s "SCR Export — " naming
   pattern is shared broader than the organization's domain** — a spot-check
   against ordinary Drive sharing being changed by hand after export.
4. **No `SCRDecisionLog` rows are past the `SCR_RETENTION_YEARS` window
   without being archived** — both callers already run
   `_archiveExpiredScrDecisions_()` immediately before this check, so a
   nonzero result here means automated archival itself failed to run, not
   just that it hasn't happened yet (Say/Do Ledger cas-ccps Extension 3).

## Newly-discovered gap (fixed alongside this document)

`exportToWorkbookGrid_()` (`scripts/30_SCRSuggestionEngine.js`) creates a
standalone spreadsheet of student names + competency ratings on every export
and, until this fix, applied no sharing restriction at creation — the one
real "could leave the org via ordinary Drive sharing" vector found anywhere
in cas-ccps. Now restricted to the file owner's own Workspace domain
(`DriveApp.Access.DOMAIN`) at the moment it's created.
