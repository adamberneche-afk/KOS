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

**Retention policy — partially defined: `SCRDecisionLog`, `Ledger`,
`CompetencyEvidence`, and `ParentReportLog`.** Every other tab in this document still persists
indefinitely, with no deletion/archival mechanism at all. `SCRDecisionLog` — the one tab with an
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
Never deletes anything, same as SCRDecisionLog's archival. A new
`♻️ Reactivate an Archived Term` menu item (`reactivateArchivedTerm()`) is
the genuinely missing half this extension had lacked until now: it sets a
matching term's `ARCHIVED` rows back to `ACTIVE` (the original
`COMPLIANT`/`ACTIVE`/`COMPLETE` distinction is not recoverable through the
round trip — every reactivated row becomes `ACTIVE`).

**`CompetencyEvidence`** (KOS/CAS roadmap synthesis 2.2, "explicit
archive/hibernate state") got the same retention treatment as the two tabs
above, closing the one gap this document used to flag as having no
mechanism at all: a configurable `COMPETENCY_EVIDENCE_RETENTION_YEARS`
Script Property (default 5 years, **also unconfirmed against any real
district/legal retention schedule** — same open question as the two
defaults above) drives `_archiveExpiredCompetencyEvidence_()`
(`30_SCRSuggestionEngine.js`), run on the same daily/on-demand triggers as
the other two. It adds a new `archive_status` column (self-healing on a
tab created before this extension existed) rather than reusing `Ledger`'s
`Status`-column pattern, since CompetencyEvidence has no existing status
lifecycle of its own to overload — same reasoning `SCRDecisionLog`'s own
dedicated `archive_status` column already established. `aggregateEvidence_()`
excludes archived rows from SCR suggestion computation, the same way
archived Ledger/SCRDecisionLog rows are already excluded from their own
live reads. Never deletes anything.

Deliberately plain `"ARCHIVED"`, not SCRDecisionLog's `"ARCHIVED — pending
disposition review"` — that wording is a legal-hold state for the actual
retained SCR decision record, intentionally not meant to be casually
reversed. CompetencyEvidence is upstream working evidence, not the
retained decision itself, so it gets a real way back: a new
`♻️ Reactivate Competency Evidence` menu item
(`reactivateCompetencyEvidence()`) clears `archive_status` back to blank
for a given student's rows, for a reopened case (an appeal, a corrected
record). SCRDecisionLog deliberately has no equivalent reactivate action —
its archived state is a disposition hold, not a hibernate state.

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
| **Visible to** | Studio Flow 3/4/5 — the native Sheets/Ask-Gemini connector steps still read/write this tab directly with no gate in this repo's own code, but the pre/post-processing steps around them are now this repo's own code (`cas-ccps/studio-steps/`: `SelectWarmUpArchetypeStep.gs`/`CreateWarmUpDocStep.gs` for Flow 3, `ExtractWarmUpPromptTextStep.gs`/`FinalizeWarmUpScoreStep.gs` for Flow 4, `ExtractBridgeInputsStep.gs` for Flow 5 — not yet pushed to a live Studio deployment); the student, indirectly, via the generated warm-up doc |
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
outcome, ConfigID, evaluated-at timestamp, student file ID, archive status
(added by roadmap 2.2 — see the retention note above). Written by two
code paths that share this exact 9-column schema (confirmed the reader below
resolves columns by header name, not position, so both writers must keep
matching headers in matching order): `cas-ccps/studio-steps/CommitStudentEvaluationStep.gs`
(the real Studio Flow 2 write step, once deployed) and
`15c_Flow2DirectEvaluationService.js`'s `writeCompetencyEvidenceFromFlow2_()`
(the manual/dev-testing DIRECT_GEMINI bridge). The Studio step creates the
tab itself if missing (both writers seed its header row on an otherwise-empty
tab). Read by Script 30's evidence aggregation and Script 30b.
**Retention:** `COMPETENCY_EVIDENCE_RETENTION_YEARS` (Script Property,
default 5 — see the retention note above) via
`_archiveExpiredCompetencyEvidence_()`, run automatically on every daily
health check and every on-demand admin health check. A row past the window
gets `archive_status` set to `"ARCHIVED"`, excluded from SCR suggestion
aggregation; actual deletion is never automatic. Reversible via the
`♻️ Reactivate Competency Evidence` menu item
(`reactivateCompetencyEvidence()`), unlike SCRDecisionLog's archival below.

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
| **Read by** | `exportToWorkbookGrid_()` (Script 30), via the admin-facing `exportScrDecisionLogForAudit()` menu item. The export is a pivoted grid — one tab per class, one row per student, one column per competency holding that student's latest final rating — **not** a dump of this tab's own columns; `decision_type`, `decided_by`, `suggested_rating` and `evidence_snapshot` do not appear in it. It now also carries a **Student Doc** column joined from `StudentDocRegistry`, so an auditor reading a rating can reach the work behind it. That link implies no new sharing: the doc is already shared with its own student via `addViewer()`, and the workbook is already domain-restricted at creation. |
| **Visible to** | Admin (via export, now shared directly with specific central-office accounts on the same domain — see Extension 3 note above) |
| **Retention** | `SCR_RETENTION_YEARS` (Script Property, default 5 — see the Extension 3 note above) via `_archiveExpiredScrDecisions_()`, run automatically on every daily health check and every on-demand admin health check. A row past the window gets `archive_status` set to "ARCHIVED — pending disposition review"; actual deletion is never automatic. Deliberately has no reactivate action, unlike Ledger and CompetencyEvidence below — this status is a disposition hold on the legally-retained record itself, not a hibernate state meant to be casually reversed. |

### ParentReportLog
| | |
|---|---|
| **Fields** | Report ID, student email, student name, week start, week end, **recipient address**, generated-at, sent-at, sent-by (teacher email), confirmed item count, pending item count, archive status |
| **Why collected** | **This is the disclosure log.** It is the only record in cas-ccps of student data leaving the school's Workspace domain — what was sent, about whom, to which address, by which teacher, and when. Written by `36_WeeklyParentReport.js`: `runWeeklyParentReportPrep()` creates a row with no recipient and no sent-at; `sendWeeklyParentReport()` fills both in at the moment it sends. |
| **Read by** | `36_WeeklyParentReport.js` (its own dedup check, so a parent never receives the same week twice), and the Teacher Dashboard's Parent Reports panel |
| **Visible to** | The authorized teacher only, via `_isAuthorizedTeacher_()` — the same gate as every other Teacher Dashboard surface |
| **Retention** | `PARENT_REPORT_RETENTION_YEARS` (Script Property, default 5 — the same unconfirmed default as the three tabs above, and see the note below on why it matters more here) via `_archiveExpiredParentReports_()`, run on every daily and on-demand health check. Uses SCRDecisionLog's `"ARCHIVED — pending disposition review"` marker rather than the reversible `"ARCHIVED"`, and has no reactivate action: a record of what was disclosed to whom is closer to the legally-retained record than to a hibernate state. |

**Why `recipient_address` is stored at all.** Parent contact details exist
nowhere else in cas-ccps, and this document's default posture is that
cas-ccps should hold as little as it can. This field is a deliberate
exception. The alternative design — the teacher addressing a mail draft by
hand — stores nothing, and in exchange makes the most likely FERPA incident
this feature can produce undetectable: one child's scores reaching another
child's parent, with no record afterwards of where anything actually went.
The address is captured because the app, not the teacher's mail client,
performs the send.

**The retention default is more pressing here than elsewhere.** The five-year
default is inherited from the three tabs above and is equally unconfirmed
against a district or state schedule. But this is the tab that exists
specifically to answer "what did we tell whom," which is the question a
records request asks — so the gap between a placeholder default and a real
retention decision matters more for this tab than for any other.

### RubricQueue
Teacher-authored rubric text only — no student PII. Included for completeness
since it's a central, shared tab.

---

## Trust surfaces and access boundaries

- **Teacher Dashboard** — gated by `_isAuthorizedTeacher_(cfg)`; a teacher only ever sees their own students' rows (Ledger's `TeacherEmail` column, StudentProfiles' `SP_TEACHER_EMAIL`).
- **Student Dashboard** — a student only ever sees their own row.
- **Admin Recovery Panel** — full read access to Ledger, StudentProfiles, and (via export) SCRDecisionLog. This is the one surface with the broadest reach into student data, and the one place a health-check gap (see below) mattered most.
- **Studio Flows 1–5** — the native Sheets/Docs/Ask-Gemini connector steps in every flow are still outside this repo's own access-control code; the custom pre/post-processing steps around them (`cas-ccps/studio-steps/`, one per flow — see the table above) are this repo's own code, but carry no additional access gating beyond what each step's own input mapping already scopes it to. Flows 1, 2, 4, 5 never receive a real student name (opaque IDs/content only, already true before this document). **Flow 3 is the one exception** — see below.
- **leader-hub JSON API** (`07_TeacherDashboard.js`'s `doPost()`, D1/Addendum 24) — a separate, machine-to-machine trust surface, not a browser session: gated by a Google ID token verified server-side against `oauth2.googleapis.com/tokeninfo`, checked against this deployment's own `TEACHER_EMAIL` (same identity boundary as `_isAuthorizedTeacher_()`, re-implemented for an HTTP caller instead of `Session.getActiveUser()`). Two of its three actions (`getPacingGuide`, `getCompetencyRegistry`) carry no student PII. The third, **`getRoster`** (Addendum 26), does — name, email, and a free-text period field, per-teacher-scoped the same way as everything else in this table. Once returned, this data is out of cas-ccps's control; leader-hub's own handling of it is documented in `leader-hub/README.md`, not here.

- **Weekly parent report** (`36_WeeklyParentReport.js`, reached from the Teacher Dashboard's Parent Reports panel) — **the only surface in cas-ccps that sends student data outside the school's Workspace domain.** Gated by `_isAuthorizedTeacher_()` like every other dashboard surface, and additionally by the disclosure rules in the section below. Every send is recorded in `ParentReportLog` with the recipient address.

## Disclosure to parents — a deliberate exception to the Walled Garden

Everything else in this document describes a system whose data does not leave
the organization's domain. That posture is enforced in code, not just
described: `exportScrDecisionLogForAudit()` rejects any recipient not on the
caller's own domain and says so to the user in those terms,
`exportToWorkbookGrid_()` applies `DriveApp.Access.DOMAIN` at creation, and
health check (c) audits the result.

The weekly parent report is an exception to that, and it is the first one.
It is written down here because a boundary this system enforces everywhere
else should not be crossed as a side effect of an implementation choice.

**Why it is permitted.** FERPA gives a parent a right of access to their own
child's education record. A disclosure to the parent of that student is not
a third-party disclosure; withholding it is the harder position to defend.

**What keeps the exception narrow.** Four constraints, each enforced in code
rather than by convention:

1. **Only a teacher can send.** The weekly trigger
   (`runWeeklyParentReportPrep()`) prepares rows and sends nothing. Nothing
   on a timer ever emails a parent.
2. **Only teacher-decided values leave.** A confirmed score prints a number;
   anything still awaiting review prints no number and is counted instead.
   The report reads Ledger `TURN_IN_FINAL_SCORE` and `SCRDecisionLog`, and
   never `TURN_IN_SUGGESTED_SCORE` or `SCRSuggestions`. This follows the
   decision the system already made for students in
   `01_StudentDoc_ContainerScript.js`'s `PENDING_TEACHER_REVIEW` state, which
   shows no score because "nothing is final until the teacher confirms or
   overrides it" — a parent is further from the work than the student, so the
   rule applies with more force, not less.
3. **One student at a time.** There is no "send all" action. Each send is one
   disclosure of one child's record, and a bulk control would make the most
   consequential action the easiest one to take by accident.
4. **Every send is logged with its recipient.** See `ParentReportLog` above.

**What this does NOT extend to.** Nothing else in this document becomes
sendable off-domain. The SCR audit export's domain check stays; so does
`DriveApp.Access.DOMAIN` on generated workbooks. This exception covers one
report, to one parent, containing only values a teacher decided.

**Known limitation, surfaced rather than hidden.** Report assembly reuses
`getWeeklyAssignments_()`, which filters on `_studentIdPattern_()`
(`^\d{7}@ccpsnet\.net$`) and skips anything else. In the aggregator that is
a skipped row; here it is a family that would never hear from the school. The
dashboard panel therefore displays the count of excluded students rather than
inheriting the silent drop, but the underlying accounts still need fixing —
the system cannot do that for itself.

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

## Health checks (Bonus 1 — added; items 4-7 added later)

`10_AdminRecoveryPanel.js`'s `_ferpaHealthChecks_()` (shared by both
`autoHealthAlert()`'s daily email and `runSystemHealthCheck()`'s on-demand
dialog) now checks seven things — one per retention policy above, plus the
three original safety-property checks:

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
5. **No `Ledger` rows are past the `LEDGER_RETENTION_YEARS` window without
   being marked `ARCHIVED`** — same shape as check 4, via
   `_countLedgerRowsPastRetentionUnarchived_()`, with
   `_archiveExpiredLedgerRows_()` run immediately before it (external
   product review, Finding 6).
6. **No `CompetencyEvidence` rows are past the
   `COMPETENCY_EVIDENCE_RETENTION_YEARS` window without being marked
   `ARCHIVED`** — same shape again, via
   `_countCompetencyEvidencePastRetentionUnarchived_()`, with
   `_archiveExpiredCompetencyEvidence_()` run immediately before it
   (roadmap 2.2). This closed the last FERPA-scoped tab with no retention
   mechanism at all — until `ParentReportLog` was added, which is why item 7
   exists.
7. **No `ParentReportLog` rows are past the `PARENT_REPORT_RETENTION_YEARS`
   window without being archived** — same counter-after-archiver shape as
   4-6, via `_countParentReportsPastRetentionUnarchived_()`, with
   `_archiveExpiredParentReports_()` run immediately before it. This is the
   disclosure log (see "Disclosure to parents" above), so of the four
   retention checks it is the one whose window a records request is most
   likely to ask about.

## Newly-discovered gap (fixed alongside this document)

`exportToWorkbookGrid_()` (`scripts/30_SCRSuggestionEngine.js`) creates a
standalone spreadsheet of student names + competency ratings on every export
and, until this fix, applied no sharing restriction at creation — the one
real "could leave the org via ordinary Drive sharing" vector found anywhere
in cas-ccps. Now restricted to the file owner's own Workspace domain
(`DriveApp.Access.DOMAIN`) at the moment it's created.
