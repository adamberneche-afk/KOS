# LeaderHub

A third, genuinely separate system from `kos-personal/` and `cas-ccps/` —
filed here during Round 3 reconciliation after being confirmed distinct
from both. See the repo root `README.md` for how all three relate.

## What it is

Adam Berneche's personal, single-file HTML command center for his own
multi-role teaching workload: classroom instructor (courses 8175, 8177,
and 6115), DECA advisor, school-store/WBL manager, E-Sports coach, and
field-trip coordinator. Despite the name and its coverage of courses
8175/8177, this is **not** a cas-ccps companion tool — it's teacher-facing
only, covers a materially wider scope than cas-ccps's two-course pair
(DECA, E-Sports, trips, a third course), and has no code-level integration
with cas-ccps beyond referencing the same course numbers. It began as a
100% client-side single file — local HTML, all state in `localStorage`, no
server, no build step — and **none of that is true any more**: the app is
now generated from 14 fragments in `src/` by `tools/leaderhub-build/build.js`,
deployed as a real Apps Script Web App (`Code.gs`, `Data.gs`, `SCR.gs`,
`Config.gs`), with most domains round-tripping to a private Spreadsheet.
See "Server migration" below for what moved and what deliberately stayed
in `localStorage`. The app's original design called for AI features
calling Gemini directly from the browser with a user-supplied API key —
that key was never obtainable, so every "AI"-branded feature shipped as
deterministic local logic instead (see "AI drafting" below for the one
feature that now has a real backend, added later via the same
GAS+Workspace-Flow bifurcation kos-personal/cas-ccps use, requiring no API
key at all).

## Layout

| Path | Contents |
|---|---|
| `student-leader-hub.html` | The live app (single file, over 20,000 lines and still growing — run `wc -l student-leader-hub.html` for the exact current count rather than trusting a number here, since a prior version of this table went stale mid-project) — open directly in a browser. **Generated** (external product review, Finding 4 / "this quarter" maintainability fix) from `src/*.html` via `tools/leaderhub-build/build.js` — stays committed at this path so opening it needs no build step, but **never hand-edit it directly**; edit the relevant fragment under `src/` and rebuild. See `tools/leaderhub-build/README.md`. |
| `src/` | The 14 fragments `student-leader-hub.html` is generated from, in file order — `00-shell-head.html` through `13-markup-modals-tail.html`. This is where you actually make edits. |
| `EmailBridge.gs` | Optional companion Apps Script (Gmail → Sheet → app polling, sub-plan/brag-email creation, and — see below — the AI-drafting job queue) — see `LEADERHUB_EMAIL_SETUP.md` and `LEADERHUB_AI_FLOW_SETUP.md` |
| `LEADERHUB_*.md` | Project reference docs (README, principles, handoff notes, WIP, Gem prompt, email setup, AI drafting Flow setup) |
| `BRAG_EMAIL_FLOW_PROMPT.md`, `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`, `LP_ASSIST_FLOW_PROMPT.md`, `EMAIL_COMPOSE_FLOW_PROMPT.md` | Exact Gemini system prompts for each AI job type — see `LEADERHUB_AI_FLOW_SETUP.md` |
| `LH_0*.md` | Numbered reference docs — naming conventions, integration guide, Canvas ideas, email audit, and 3 grading/pacing structure iterations (`LH_04_GRADING_STRUCTURE.md`, `LH_05_GRADING_STRUCTURE.md`, `LH_05_PACING_AND_GRADING.md` — successive dated drafts of the same working document, not conflicting versions to reconcile; kept as-is per this tool's own iterative working style) |
| `drive-tools/` | Later, **not-yet-executed** Drive-cleanup tooling (`LH_DriveDocSplitter.gs`, `LH_8177_Rename.gs`, `LH_AppManifestUpdater.py`) for splitting/renaming 8177 lesson docs |

`archived/` (external product review, Finding 3 / "this month" dead-code
cleanup) was removed from the working tree — nothing here is lost, the
full pre-deletion tree is preserved on the `pre-archive-cleanup` branch.
It held `studentleaderhub_EARLY_PROTOTYPE.html` (a much earlier prototype,
2,155 lines, 8 views — dashboard, lessons, tasks, journal, brag board,
SCR, trips, settings — with a working trips module already present, but
no dedicated DECA/WBL/E-Sports modules and no Gemini integration —
genuinely different from the live app, not a duplicate, kept for history)
and `studentleaderhub_REACT_EXPLORATORY_DRAFT.jsx` (a React/JSX
exploration draft, not the deployed artifact, referenced in HISTORY.md's
"Fixed: two more narrow-blast-radius bugs").

## Status

Actively developed (~20 sessions per its own `LEADERHUB_WIP.md`). The
`drive-tools/` scripts are flagged in their own filenames' origin as
**not yet run against real data** — treat them as drafts pending a
deliberate execution decision, not as already-applied changes.

## Process history

Bug-fix narration for closed items — the Apps Script bridge's two
independent silent-failure bugs, and the "found two more narrow-blast-
radius bugs" pass, plus the nine-round UI/UX hardening log — now lives in
`HISTORY.md`, not here (external product review, Finding 10 /
"structural" tier). Read `HISTORY.md` when you need to know *why*
something is the way it is; this file stays focused on what the system
currently does and how to work with it.

---

## AI drafting — bifurcated GAS + Workspace Flow backend

The app's original design called for direct browser→Gemini calls with a
user-supplied API key — never obtainable, so every "AI"-branded feature
(`aiComposeEmail`, `generateAIInsights`, `wblAIInsights`, `lpRunAI`,
`generateBragEmail`) shipped as deterministic local logic instead, with no
model call anywhere (see the "Removed: Gemini AI infrastructure" comment
in `student-leader-hub.html`).

**Real AI drafting is now built for all five** — Brag Board's "✨
Generate" (`BRAG_EMAIL`), the Trip Archive's "✨ Generate Insights from
Archive" narrative (`ARCHIVE_INSIGHTS`), the WBL Program Summary's "✨
Generate AI Summary" (`WBL_INSIGHTS`), the Lesson Plan Helper's
quick-prompt buttons and custom-question box (`LP_ASSIST`), and the
Email Composer's "✨ Generate with AI" button (`EMAIL_COMPOSE`) — using
the same **Bifurcation Boundary** architecture kos-personal/cas-ccps
already use for their own AI integrations: GAS does 100% of the
deterministic work (assembling the payload, queuing a job, polling for
the result, cleaning up old rows), and a separate **Google Workspace
Flow** — a no-code automation built in the Workspace UI, using its own
"Gemini — Generate content" connector — does 100% of the actual
generation. That connector runs on the Workspace account's own built-in
Gemini access, not a developer API key, which is exactly what solves the
original "can't get an API" blocker. The job queue is generic to job
`type`, so none of `ARCHIVE_INSIGHTS`/`WBL_INSIGHTS`/`LP_ASSIST`/
`EMAIL_COMPOSE` needed any change to `EmailBridge.gs` — only a new
client-side payload and another Flow watching the same sheet, each time.

For Archive Insights and WBL Program Summary specifically, the split
follows the Bifurcation Boundary the other direction too: each feature's
stats grid (trip counts/cost/type breakdown; student counts/hours/SBE
progress) is pure arithmetic, computed locally, always — too
correctness-critical to ever hand to a model — and only the qualitative
half (a short narrative surfacing real patterns across free-text content:
trip glows/grows, or WBL attention reasons and SBE checklist notes)
optionally routes through the Flow, additively, below the always-present
stats. Lesson Plan Helper, Brag Board, and Email Composer have no such
arithmetic half — their whole point is a real written answer to a
prompt — so they follow a simpler shape: the Flow's output *is* the
result shown (or the existing deterministic fallback, on any failure).

**What's new:**
- `EmailBridge.gs` gained two actions — `aiDraft` (queues a job into a
  lazily-created "LeaderHub AI Queue" spreadsheet) and `checkAiJob` (polls
  for and returns a completed result, sweeping stale rows on every call so
  an unbuilt or broken Flow can't leak rows forever).
- `student-leader-hub.html`'s `_generateBragEmailInner()`,
  `generateAIInsights()`, `_wblGenerateNarrative()`, `lpRunAI()`, and
  `aiComposeEmail()` all try the AI path first (when an Apps Script
  bridge URL is configured), polling for up to ~90 seconds via a shared
  `pollAiJob_()` helper, and **always fall back to the existing
  deterministic result** on any failure, timeout, or when no bridge is
  configured at all — all five are purely additive; each keeps working
  exactly as it always has if its Flow is never built. `lpRunAI()` and
  `aiComposeEmail()` additionally guard against a slower, stale request's
  result overwriting a newer request's (a monotonic request-id check
  each), since both have multiple ways to fire overlapping requests
  (8 quick-prompt buttons plus a custom-question input for the former; a
  re-clickable "Generate with AI" button with no disabled state for the
  latter, before this change).
- `leader-hub/appsscript.json` gained the `spreadsheets` OAuth scope
  (caught by `tools/gas-lint/check.js` before it could become a silent
  runtime authorization failure).
- Six docs: `LEADERHUB_AI_FLOW_SETUP.md` (the full handshake spec — sheet
  schema, one-Flow-per-job-type trigger/connector configuration, all five
  payload shapes — same convention as
  `kos-personal/STUDIO_INTEGRATION_SPEC.md`), `BRAG_EMAIL_FLOW_PROMPT.md`,
  `ARCHIVE_INSIGHTS_FLOW_PROMPT.md`, `WBL_INSIGHTS_FLOW_PROMPT.md`,
  `LP_ASSIST_FLOW_PROMPT.md`, and `EMAIL_COMPOSE_FLOW_PROMPT.md` (the
  exact system prompts to paste into each Flow's Gemini step).
- **Found and fixed while wiring up `WBL_INSIGHTS`:** `wblAIInsights()`'s
  stat tile and per-student badge checked
  `wblStudentStatus(s)==='at-risk'`, a status string that function never
  actually returns (it returns `'not-started'`, `'needs-attention'`, or
  `'on-track'`) — so the "At Risk" tile always read 0 and every
  non-on-track student showed a ❌ regardless of which real status
  applied. Fixed to match the real status values and to build a specific
  reason per flagged student (`_wblAttentionReason()`: missing agreement,
  hours short of the 30 required, no reflections logged) instead of just
  a pass/fail badge.
- **Found and fixed while wiring up `EMAIL_COMPOSE`:** `aiComposeEmail()`
  wrote its result to `document.getElementById('email-output')`, an
  element that doesn't exist anywhere in this file — the real compose
  textarea is `#email-body`. `out` was therefore always `null` and the
  function returned immediately, every time — clicking "✨ Generate with
  AI" (and `generateRegEmail()`'s programmatic call into the same
  function) silently did nothing at all, since before this feature
  existed. Fixed the id, so the deterministic fallback template is now
  actually reachable regardless of whether AI drafting is ever
  configured.

**What this doesn't include yet:** none of the five Workspace Flows are
built — building a no-code Flow happens in the live Google Workspace UI,
not a file this repo can contain, same limitation kos-personal/cas-ccps's
own unbuilt Studio flows already live with. `LEADERHUB_AI_FLOW_SETUP.md`
is the complete spec to build all five against. No "AI"-branded feature
remains deterministic-only now.

**Names by default, with an opt-in substitution path:** unlike
kos-personal/cas-ccps (which anonymize before any AI call, per their
FERPA-scoped design), all five features send free-text content to Gemini
as-is by default, which may include real student names (e.g. a DECA
placement, a student named in a trip reflection, a student named in a WBL
attention item, a student named in a typed Lesson Plan Helper question,
or a student named in an Email Composer instruction) — Brag Board's whole
point is naming real achievements, and this is Adam's personal
professional-communications tool, not a student-education-record system.
Settings → "Student ID Lookup — AI Privacy" adds an optional layer on
top: upload a roster CSV (Name + CCPS ID/login) and **all five** features
substitute each matched student's name for `{7-digit ID}@{your email
domain}` before the request leaves the browser, then restore the real name
once the result comes back — a client-side, two-way text substitution, not
a schema change. Names not on the uploaded roster still go through as-is
(fail-open, disclosed in the UI, not a silent gap). See
`LEADERHUB_AI_FLOW_SETUP.md`'s "What data this sends through Gemini"
section for the full rationale.

## Settings → My Profile & School

Per `LEADERHUB_PRINCIPLES.md`, this was never designed to scale to other
teachers — but every outbound string in it (email-template signatures,
sub-plan headers, Brag Board recipients, the AI-privacy email domain) used
to be a name/phone/email/school literal baked into the source, meaning a
colleague who wanted to fork this for themselves had to hand-edit dozens of
strings across a 17,000-line file before a single email went out under
their own name instead of Adam's.

Settings now has a "My Profile & School" panel — name, title(s), school,
phone, email, email domain, and the DECA-specific Brag Board recipients
(supervisor/admin/attendance-coordinator) — backed by a `PROFILE` object
(`lh_profile` in localStorage) that every one of those templates reads from
instead. Fields save as you leave them and take effect immediately, no
reload required. This closes the identity/signature gap specifically.

The seed data in `SCR_COURSES` also had a real-looking student roster (121
names in "Last, First" format) hardcoded into its per-period arrays, with
no UI to clear it — confirmed as dummy/placeholder data and removed; the
period-slot structure and full Virginia CTE competency framework are
untouched.

## Settings → School Calendar & Bell Schedule

The bell-schedule times, the day-of-week → schedule-type rotation, the
school-year quarters, and the no-school/early-release calendars were all
Clover Hill's actual 2025-26 values hardcoded into four consts
(`BELL_SCHEDULES`, `CCPS_SCHEDULE_OVERRIDES`, `CCPS_NO_SCHOOL`,
`LP_QUARTERS`) with no settings path — every one of them expires at the
end of a school year.

Settings now has a "School Calendar & Bell Schedule" panel backed by
`lh_schedule_config` in localStorage:
- **Day-of-Week Default Schedule** — 7 dropdowns (Sun–Sat), each picking a
  configured bell-schedule type or "No School".
- **Quarter Dates** — 4 start/end date pairs (Q1–Q4).
- **No-School Dates** and **Early-Release Dates** — one date per line,
  parsed and validated against `YYYY-MM-DD` before saving.
- **Advanced: Bell Schedule Times (JSON)** — the actual period start/end
  times, exposed as a raw JSON textarea rather than a bespoke visual
  builder (a full drag-and-drop period editor is a bigger project than
  this round covers; this still means no source edits are required, just
  editing JSON instead of a form).

All four consts are now `let` bindings populated by `_applyScheduleConfig()`
(and `_applyQuartersConfig()` for quarters, kept separate to avoid a
temporal-dead-zone crash — quarters are declared ~4,000 lines after the
bell-schedule section) from `_DEFAULT` fallbacks, so nothing changes for
Adam unless a field is edited. `getTodayScheduleType()`'s hardcoded
"Wed/Thu/Fri → B" weekday logic is now a lookup against the same
`DAY_SCHEDULE_MAP` the Settings panel edits.

## Settings → Modules

The nav (7 buttons) and sidebar (7 accordion sections) showed every module
unconditionally — a teacher with no DECA program, no school store, or no
e-sports team got the full set regardless, with no toggle anywhere in the
codebase.

Settings now has a "Modules" panel with three checkboxes — DECA, WBL /
School Store, E-Sports — backed by `lh_modules` in localStorage
(`MODULES`/`getModules()`/`saveModules()`, same pattern as `PROFILE`).
Unchecking one immediately hides its nav button, its whole sidebar section
(header + body + the one separator between it and its neighbors — the
three sections are each wrapped in a `side-sec-<key>` div carrying its own
trailing separator, so hiding any subset never leaves a doubled or missing
divider), and its card in the Dashboard pulse row. Dashboard, Classroom,
Field Trips, and Tools always stay on — every teacher using this app
presumably wants those regardless of which extras they run.

Not gated by this toggle: deep links into a disabled module (e.g. a
dashboard banner's "DECA Hub" button) still navigate there directly if
something else triggers them — this hides the module from browsing, not
from every code path that can call `showView()`. The Virginia-CTE-specific
`SCR_COURSES` course catalog (course codes/competency lists) is still
hardcoded and not covered by any settings layer.

## Settings → Clear Sample Data

Six collections ship with real Adam-specific seed content baked into the
file — Field Trips, DECA Members, DECA/Leadership Events, Goals, WBL
Roster, and Store Inventory — and until now the only way for a new teacher
to start clean was deleting every record one at a time through its own UI.

Settings → Your Data has a "🧹 Clear Sample Data" button (behind the
shared `_showConfirm()` danger dialog, matching every other destructive
action in the app) that empties `lh_trips`/`lh_students`/`lh_events`/
`lh_goals`/`lh_wbl_students`/`lh_inventory` and reloads — Profile, School
Calendar, and Module settings are untouched.

Building this surfaced a real pre-existing bug, fixed alongside it: the
reload-time overlay for `lh_trips`, `lh_wbl_students`, and `lh_inventory`
checked `saved.length` (truthy = non-empty) instead of `Array.isArray(saved)`
before trusting localStorage over the hardcoded seed. That meant deleting
every trip (or WBL student, or inventory item) by hand and refreshing the
browser would silently resurrect the seed data — not just a blocker for
this button, a real data-integrity bug on its own. `lh_students`/
`lh_events`/`lh_goals` already used the correct check.

## Settings → Course Catalog (customizable course data)

The Student Competency Records (SCR) tracker's course catalog was the last
hardcoded piece of the portability story: `SCR_COURSES` held Adam's own 3
courses (6115/8175/8177) — name, competency list, class periods — as a
single hand-written object literal, and the course tab bar was 3 static
`<button>` elements wired to those exact codes. Adding a course meant
editing this file directly.

Adam's own 3 courses are unchanged — this is purely additive:

- **`CUSTOM_COURSES`** (`lh_custom_courses`) is a new localStorage-backed
  overlay merged into `SCR_COURSES` at boot via `Object.assign()`. It can
  only ever add new course codes — `_parseCourseJson()` refuses to import
  a code that already exists (built-in or previously imported), so this
  can never overwrite anything.
- **Settings → Course Catalog** lists every course (built-in courses
  marked "built-in," no delete control; imported ones get a ✕ to remove)
  and an "⬆️ Import Course (JSON)" button, plus a "Download a blank
  template" link (`lhDownloadCourseTemplate()`) showing the expected
  shape: `code`, `name`, `icon`, `standardsLabel`, `periods` (class period
  names), and a `competencies` array of `{num, code, text, duty, req}`.
  `code` on a competency is optional and free-text — it's meant for a
  Virginia Standards of Learning identifier (e.g. `"11.1"`) or any other
  district's standard code, displayed in place of the bare `#1` numbering
  wherever competencies are listed; `num` still drives internal scoring
  and stays a private implementation detail. `standardsLabel` lets an
  imported course call its list "Standards of Learning" or anything else
  instead of "Competencies" throughout its own UI.
- **Course tabs are now data-driven.** The 3 static buttons in the SCR
  view were replaced with an empty `<div id="scr-course-tabs">` that
  `renderScrCourseTabs()` populates from `SCR_COURSES` — called once at
  boot and again after any import/removal — so a new course gets a tab
  automatically.
- **Fixed a related latent bug while wiring this up**: the Pacing Guide
  sub-view resolved its per-course lesson content via a 3-way ternary
  (`scrActiveCourse==='8177' ? PACING_8177 : scrActiveCourse==='8175' ?
  PACING_8175 : PACING_6115`) whose final `:` branch matched *any* other
  course code — meaning a 4th course would have silently rendered 6115's
  pacing guide instead of its own (harmless today since no 4th course
  existed, but exactly the bug this feature would have hit immediately).
  Replaced with `PACING_REGISTRY`/`getPacingForCourse()`, which returns
  `null` for an unregistered course and now correctly falls through to
  the pacing view's existing (previously dead) "No pacing data available"
  empty state.

**Deliberately out of scope**: the hand-authored day-by-day pacing guides
(`PACING_8175`/`8177`/`6115` — objectives, materials, assessment, and
"connections" prose per lesson) are original lesson-planning content, not
catalog data, and aren't something a JSON import can reasonably stand in
for. An imported course uses the Grid and Cards views normally (both are
already fully data-driven off `SCR_COURSES`) and shows the empty state
in the Pacing Guide sub-view. Class-period rosters are also unaffected —
`SCR_COURSES[code].periods` has always been populated by hand (there's no
in-app "add a student to a class roster" flow for any course, imported or
built-in), so an imported course starts with the period names you specify
and empty rosters, same as Adam's own courses today.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), parsing the `SCR_COURSES` literal back out of the
file to confirm the icon-field edits didn't corrupt it, and a Node harness
covering the import validator (malformed JSON, duplicate course code,
missing name/competencies, auto-numbering, duplicate `num` within one
import, a SOL-style course with explicit standard codes) and the
`getPacingForCourse()` null-fallback.

## DSP framework content — removed

Earlier versions of this app cited Adam's personal CCPS teacher-evaluation
cycle ("Directed Support Plan," or "DSP") throughout — a hardcoded
May 15, 2026 due date, "Standard 1"/"Standard 2" citations, a dedicated
"DSP Evidence Report" export, a Green check-in countdown pill, and
DSP-specific goals/deadlines/action-queue signals. None of that is
portable to another teacher's evaluation framework (most districts don't
use CCPS's DSP model at all, and the ones that do won't share Adam's dates
or supervisor), so it's been removed rather than made configurable:

- **Deleted outright**: the DSP countdown pill and its `updateDSPCountdown()`
  function, the "DSP Evidence Report" modal and its `generateDSPReport()`/
  `closeDSPReport()` functions (~300 lines), the Green check-in day-of
  banner and its `checkGreenCheckinToday()`/`showGreenCheckinBanner()`/
  `logGreenMeetingAttended()` functions, the seeded DSP goals (`Leadership
  Development` category, ids 8–13) and DSP-specific deadlines (`dl_dsp_end`,
  `dl_green2`–`dl_green5`), the action-queue "Green check-in" signals, and
  the `green_meeting` entry in the Brag Board win-log and audience-type set.
- **Generalized, kept the underlying feature**: the Observation Prep
  Checklist (now grouped by "Instructional Readiness" / "Professionalism &
  Records" instead of "DSP Standard 1/2," badges dropped), the Communications
  Triage reminder (banner/toast text no longer cites "DSP Standard 2"), the
  CTE PLC check-in banner and logging (kept — PLC meetings aren't DSP-specific
  — just stripped of "DSP Standard 2 evidence" framing), the Synergy/Canvas
  currency tracker (badge and comment simplified), the stalled-goal
  action-queue signal (no longer keyed to the DSP due date or a "Leadership
  Development" priority bump — now a flat 40% threshold across all goal
  categories, always showing the category tag), and the Brag Board
  supervisor-update tone (still evidence-oriented, no longer cites DSP
  standard numbers).
- **Comment/label-only simplifications**: dozens of code comments and small
  UI strings (lesson-plan AI hint tips, differentiation button subtext,
  DECA admin checklist callout, unit-plan callout, role-dropdown labels,
  toast text) had "DSP"/"Standard N" language stripped with no behavior
  change.

A teacher using their own district's evaluation framework can still use
Observation Prep, Comms Triage, PLC check-ins, Synergy tracking, and Goals
— none of it is tied to a specific framework's name or citation numbers
anymore. Verified with `node --check` on the extracted script block,
`node tools/gas-lint/check.js` (clean except the two pre-existing
cas-ccps `cfg-key-pending-merge` warnings), and a small Node harness
re-checking the checklist grouping and stalled-goal logic against the
restructured data shapes.

## Settings → Organizations (DECA generalized to any club/CTSO)

DECA was the last hardcoded "extracurricular" concept in the app — a
dedicated nav button, a fixed 12-title officer list, a hardcoded 3-conference
(DLC/SLC/ICDC) results/qualification structure, and a `students` roster
array that assumed every row was a DECA member. Adam's own DECA chapter is
**completely unchanged** — same officer titles, same 3 conferences, same
Hub content (season pipeline, approval checklist tied to real trips, chapter
reference/contacts/email templates), same data. This round makes the
underlying system generic so another teacher's club, CTSO, or student
organization can be added the same way a Course Catalog course is:

- **`ORGANIZATIONS`** (built-in `deca` + a `CUSTOM_ORGS` localStorage
  overlay, same additive pattern as the Course Catalog) holds each
  organization's name/icon, its own **officer position list**, its own
  **competition/achievement levels** (DECA's are `DLC`/`SLC`/`ICDC`; a
  differently-tiered CTSO or a non-competitive club can define its own, or
  none at all), and its own placement vocabulary.
- **Settings → Organizations**: lists every organization (built-in vs.
  imported), an "Import Organization (JSON)" upload with a
  preview-before-add confirmation, a downloadable blank template, and a
  remove control for imported organizations only.
- **The roster is now organization-scoped.** Every `students[]` row gained
  an `org` field (existing rows silently backfilled to `'deca'` — nothing
  to migrate by hand); the Members page grew an organization tab bar
  (mirrors the SCR course tabs) and all its CRUD (add/edit/delete, officer
  grid, stats strip, CSV export) filters by whichever organization tab is
  active. The Add/Edit Member modal repopulates its Position and
  Membership Status dropdowns from the active organization's own config —
  DECA's exact original dropdowns (officer titles + competitive
  categories, all 6 statuses including SLC/ICDC qualifier) are restored
  byte-for-byte when DECA is active; another organization gets its own
  officer titles, a plain "Member" option, and the 5 non-competition
  statuses, with the DECA-specific Competitive Event field hidden.
- **A new, separate, simpler Results Board** (`renderOrgResults()`,
  storing to its own `lh_org_results` key) exists for organizations
  besides DECA — a flat "Results Logged"/"Top Finishes" summary, then
  either one table per configured level or a single flat table for a
  non-competitive club. This is a parallel implementation, not a
  refactor of DECA's own results board (`renderDecaResults()`/
  `lh_deca_results`, still exactly as before) — keeping the two separate
  means nothing about DECA's results/qualification tracking could
  possibly be affected by this change.
- **DECA's own Hub page (season pipeline, approval checklist, chapter
  reference) is unchanged and still DECA-only** — that content is
  hand-authored, CCPS/trip-specific material, not something a generic
  config can stand in for. Any other organization gets a simpler
  auto-generated hub (its officers + its results board), with a pointer
  to the Members page for full roster management.
- **The module toggle is renamed generically**: `MODULES.deca` →
  `MODULES.orgs` (an existing on/off preference is carried over
  automatically, not reset), and the nav button/sidebar accordion header
  now show the one configured organization's own name, or "Organizations"
  once more than one exists.
- **Fixed a real bug found while wiring this up**: the "DECA event
  tomorrow" banner fired unconditionally regardless of the module
  toggle — even with Organizations turned off (nav/sidebar hidden), the
  banner would still appear and its button would navigate to a hidden
  view. Now gated behind `MODULES.orgs`.

**Deliberately out of scope for this round** — a genuinely different,
much larger undertaking, discussed with Adam and intentionally deferred:
**sharing an organization between co-advisors.** Everything in LeaderHub
today is single-browser localStorage; making an organization's roster/
results genuinely shared means introducing a real synced datastore (a
Google Sheet via an extended `EmailBridge.gs`, in the direction agreed
on) with actual conflict-handling for simultaneous edits — a separate,
substantial round on its own, not a corner of this one. **Built in the
very next round — see "Settings → Organizations — Co-advisor sharing
(EE2)" below.** Also deferred,
narrower and lower-value: the long tail of hardcoded "DECA" references
outside the Hub/Members/Results core — Brag Board's DECA-specific
audience tone and win-source, the sub-plan absence-reason enum, the
quick-thought keyword classifier, the permission-slip roster-source
label, and the trip-archive name-matching filter all still say "DECA"
specifically rather than reading the active organization's name.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), parsing the new `ORGANIZATIONS` config back out of
the file to confirm it's intact, and a Node harness covering the
organization-import validator (malformed JSON, duplicate id, missing
fields, id sanitization, level-key derivation), roster organization-
scoping (legacy-row backfill, per-org filtering), and the `MODULES.deca`
→ `MODULES.orgs` migration.

## Settings → Organizations — Co-advisor sharing (EE2)

The "deliberately out of scope" item from the round above — sharing an
organization's roster/results between co-advisors — is now built. It
reuses `EmailBridge.gs`, the same optional Apps Script companion that
already backs the Email Bridge and AI drafting features, extended with
three new POST actions and a **second, independent Spreadsheet**
("LeaderHub Org Sync" — never the AI Queue one) that acts as the shared
datastore.

**Access model.** Because the Web App is deployed "Execute as Me,"
whichever teacher deploys it owns the backing Spreadsheet — a co-advisor
never needs their own Google Drive sharing permissions on it. They only
need the same `/exec` URL, pasted into their own Settings → Email Bridge,
exactly like every other Email Bridge feature. Sharing one organization
does not expose the AI Queue's data or vice versa — they're two separate
Spreadsheets behind the same URL.

**Layout on the Sheet side.** A `_org_meta` tab (one row per shared org:
`OrgId, OrgName, ConfigJSON, UpdatedAt, UpdatedBy`) plus per-org
`roster_<orgId>` / `results_<orgId>` tabs, written as **real spreadsheet
rows**, not a JSON blob in one cell — a 60–100+ member roster as a single
JSON cell risks Sheets' ~50,000-character cell limit, and real rows let a
co-advisor open the Sheet directly and read (or, in a pinch, hand-edit)
data without LeaderHub at all. The client sends its own header row
alongside the data on every push, so `EmailBridge.gs` never needs to know
student/result field shapes — a future schema change on the client side
never requires touching the `.gs` file.

**Conflict model: optimistic concurrency (compare-and-swap) on
`UpdatedAt`, not field-level merging.** Every push carries
`expectedUpdatedAt` — the pusher's last-known remote state for that org.
If the Sheet's actual current `UpdatedAt` doesn't match, someone else
pushed in between: the server rejects the push with `{conflict:true,
remoteUpdatedAt, remoteUpdatedBy}` and writes nothing, and LeaderHub shows
a conflict dialog with two explicit choices — **Pull Latest First**
(recommended) or **Push Anyway** (overwrite the other advisor's change).
There is no silent auto-merge in either direction. This is
last-full-snapshot-wins-with-a-warning — sufficient for the low-
concurrency, two-or-three-advisor case this is built for, not a
substitute for real-time collaboration. Two advisors editing the *same*
org at the literal same instant can still race past the check (the
window between "read the current UpdatedAt" and "write the new one" is
small but nonzero) — the compare-and-swap catches the much more common
"someone pushed since your last pull" case, not every theoretically
possible interleaving.

**Client-side additions:**
- `lh_org_sync` localStorage — per org, `{enabled, lastKnownRemoteUpdatedAt,
  lastSyncedAt, lastSyncedBy}`.
- Settings → Organizations gained, per org: a **Share with a co-advisor**
  button (first push) when not yet shared, or **Pull** / **Push** /
  **Stop sharing** controls once it is — deliberately separate Pull and
  Push actions rather than one merged "Sync," so a teacher always knows
  which direction data is about to move before it moves.
- **Join a Shared Organization** — calls the new `listOrgSyncs` endpoint
  and lists every org shared on that bridge deployment, with a Join (new
  locally) or Pull Latest (already have it) button per row. A co-advisor
  doesn't need to already know an org's exact id.
- A conflict dialog (`_showOrgSyncConflictModal`) for the rejected-push
  case described above.
- Pulling a **non-DECA** org also adopts its shared config (officer
  positions, levels, placement options) as local — that's the point of
  sharing a custom org. **DECA's own hardcoded config is never touched**
  by a pull, matching the guarantee the rest of this app makes about
  Adam's built-in DECA experience; only DECA's roster/results sync.
- Local roster/result IDs are never trusted back in from a pull — they're
  per-browser bookkeeping, not a cross-device key, so a pulled roster row
  gets a fresh local id from the existing `nextId.st` counter instead.

**Not covered, by design:** true real-time collaboration (this is
pull/push, not a live multiplayer document), and automatic background
sync (nothing pushes or pulls without a teacher clicking a button —
avoids a surprise overwrite from a stale tab left open in the
background).

Verified with `node --check` on `EmailBridge.gs` and both `<script>`
blocks of the HTML file, `node tools/gas-lint/check.js` (clean except the
2 pre-existing unrelated cas-ccps warnings), and a Node harness
(`verify_ee2.js`) that loads the real `EmailBridge.gs` source into a
sandboxed VM context with an in-memory Spreadsheet/PropertiesService mock
and exercises the actual shipped `pushOrgSync_`/`pullOrgSync_`/
`listOrgSyncs_` functions — first push, list, pull, in-sync push, stale-
push rejection (conflict:true, and confirming the rejected push wrote
nothing), pull-then-push recovery, two independent orgs not colliding on
each other's tabs, ragged/mismatched row widths normalizing instead of
throwing, and repeated pushes updating one meta row instead of appending
duplicates (21 checks, all passing).

## FF1 — the long tail of hardcoded "DECA" references, closed out

EE1's own "deliberately out of scope" list named five narrower,
lower-value spots outside the Hub/Members/Results core that still said
"DECA" literally instead of reading it from `ORGANIZATIONS`. All five are
now fixed — plus one real bug found while fixing them:

- **Brag Board win-source.** `gatherBragData()` only ever read
  `lh_deca_results` — any results logged for a non-DECA organization
  (via `ORG_RESULTS`, EE1's generic results board) never showed up in a
  weekly wins email at all. Now gathers an additional `orgResults` section
  from every non-DECA organization, additive to (never replacing) DECA's
  own "DECA results:" section.
- **Sub-plan absence-reason enum.** The "Reason for Absence" dropdown had
  a literal `🏆 DECA Trip` option and mailto subject line. Both now read
  `ORGANIZATIONS.deca.name`/`.icon` — unchanged text for Adam today, but a
  fork that renames its own org config has this follow automatically
  instead of needing to be hunted down by hand.
- **Quick-thought keyword classifier.** `organizeThought()`'s rule-based
  role classifier had a `deca` keyword list hardcoded to DECA-specific
  terms (`ICDC`/`SLC`/`DLC`/`chapter`/`membership`/...) — a teacher whose
  only organization is FBLA typing "FBLA fundraiser" never classified into
  that bucket. The internal role key stays `deca` (it's a stable
  identifier shared with `DEADLINES`/`HORIZON` role tagging and
  `EmailBridge.gs`'s `#role:` hashtag convention — renaming it would be a
  real migration, not a hardcoding cleanup), but the keyword *list* now
  folds in every configured organization's own name and achievement-level
  labels, additive to the original DECA terms.
- **Permission-slip roster-source label — plus a real latent bug.** The
  "Add Student to Slip Tracker" panel's "🏆 DECA Members" button is now
  driven by `ORGANIZATIONS.deca`. While fixing the label, found that
  `renderDecaPicklist()` never actually scoped to `s.org === 'deca'` —
  once EE1 gave every organization its own roster, adding a second club
  silently mixed its members into a picker still labeled "DECA Members,"
  offered against DECA-only status filters (SLC/ICDC Qualifier) that don't
  even apply to them. Fixed by scoping the picklist to DECA specifically
  (this panel's filter vocabulary is DECA-only by design, unlike the
  fully generic `ORG_RESULTS` system).
- **Trip-archive name-matching filter.** The Archive view's "🏆 DECA"
  quick filter matched the literal substring `'deca'` against a trip's
  name — fragile even for Adam (a trip named "SLC Weekend" wouldn't have
  matched) and completely dead for any other org. Now matches against
  `ORGANIZATIONS.deca.name` (case-insensitive), with the filter button's
  own label following the same config.

All five fixes read `ORGANIZATIONS.deca` rather than hardcoding a second
"generic org" system for this narrow tail — DECA's own filter vocabulary
(SLC/ICDC statuses, its season pipeline) stays DECA-specific by design,
same as the Hub/Members/Results core EE1 already locked in. None of this
changes what a custom imported organization can do; it only stops a
handful of DECA-only conveniences from silently breaking (or leaking
data) once a second organization exists.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), and a Node harness (`verify_ff1.js`, 18 checks) that
re-exercises each fix's logic directly — the Brag Board org-results
gather (in-range filtering, DECA never double-counted), the label-lookup
fallback to `ORGANIZATIONS.deca`, the archive filter's config-driven
match against both the real DECA config and a simulated renamed fork, the
classifier's keyword generalization, and the slip-tracker picklist's
org-scoping (confirming a non-DECA member no longer leaks into the "DECA
Members" list).

## GG1 — Weekly Schedule auto-populated from the real pacing guide + a CCPS/VDOE lesson template

Two long-standing gaps closed together, since fixing one exposed the other:
the Pacing Calendar (the real school-day weekly grid under Lesson Plan →
Calendar) was already auto-populating a course's schedule from *something*
— just not from real, current curriculum data, and 8175/8177 had no
lesson-writing template that reflected actual VDOE/CCPS requirements.

**What "the pacing guide" turned out to mean.** This file already had two
separate, hand-authored lesson datasets per course (`PACING_8175`/
`PACING_8177`/`PACING_6115`, feeding the SCR "Pacing Guide" sub-view; and
`LESSON_PLANS`/`UNIT_PLANS`, feeding the Lesson Plan module's Units/Lessons
views and — via even distribution across meeting days, not real dates —
the Pacing Calendar) — and neither matched the actual, current 2026-27
curriculum. Meanwhile `cas-ccps/curriculum/PacingGuide_CAS_Context.json`
already existed as the real, currently-maintained pacing guide behind the
CAS system's own weekly context pipeline, covering these exact same two
courses (8175/8177) with real dates, VDOE/CCPS competency numbers, key
vocabulary, warm-up anchors, and lesson-to-lesson connections. That's the
real source this round imports — not a new dataset invented for this app.

- **`CAS_PACING_UNITS`** — all 20 real units imported verbatim from that
  file (competency-id strings like `"8177-23"` converted to the bare
  numbers `SCR_COURSES` already uses; every other field name preserved).
  **`PACING_8175`/`PACING_8177`/`LESSON_PLANS`/`UNIT_PLANS` are completely
  untouched** — this is a parallel system, not a replacement, so the SCR
  Pacing Guide sub-view and the Lesson Plan Units/Lessons views behave
  exactly as before.
- **The Pacing Calendar now places 8175/8177 units on their real
  calendar dates** instead of guessing an even distribution across
  meeting days — a unit's actual `startDate`/`endDate` from the imported
  guide decides which days it covers, so "what am I teaching this week"
  finally reflects the real schedule instead of an approximation. **6115
  has no equivalent real external source** — its calendar keeps the
  original even-distribution logic, byte-for-byte unchanged.
- **Click any 8175/8177 calendar cell** to open a Lesson Unit detail
  view: the real objective, VDOE/CCPS competency numbers with their real
  text (looked up from `SCR_COURSES[code].competencies`, the same real
  registry DD1 already established — never re-derived or guessed), key
  vocabulary with definitions, the warm-up/bell-ringer anchor, and the
  prior-lesson connection — all read-only, since it's real imported
  content. Below that, an editable **CCPS-format delivery section**
  (Materials / Assessment / Evidence of Learning / Differentiation /
  Notes) a teacher fills in per course, saved via the same seed-then-
  overlay pattern as everything else in this file (`lh_cas_pacing_notes`,
  independent per unit *and* course — a shared CAS unit can carry
  different delivery notes for 8175 vs 8177).
- **The template this round asked for** is this same shape, offered two
  ways for authoring outside the real CAS dataset (6115, or any future
  lesson): **Settings → Course Catalog → "Weekly Schedule / Lesson Unit
  Template"** has a downloadable blank JSON template (same field names —
  id/name/dates/objective/competencyIds/vocabulary/warmupAnchor/
  priorConnection/materials/assessment/differentiation) and a printable
  blank paper template covering the same CCPS/VDOE-format fields. The
  print button inside a real unit's detail modal prefills that same
  template with the unit's real content instead of a blank one.
- **Quarter boundaries are never hardcoded to a school year.**
  `getQuarterForDate()` looks up whichever quarters are currently
  configured (Settings → School Calendar) and falls back to the nearest
  edge quarter for a date outside every configured range — so this stays
  correct once a teacher updates the calendar for a new year, rather than
  silently misfiling every unit into the wrong quarter. (Note: `LP_QUARTERS`
  /`QUARTERS_DEFAULT` itself still needs updating in Settings for the
  2026-27 year once CCPS publishes it — official calendar dates aren't
  something this round fabricates.)

**Deliberately not done:** authoring real 6115 curriculum content — there's
no equivalent external real source for it in this repo, and inventing one
would mean fabricating curriculum, not importing it. 6115 keeps its
existing Lesson Plan/Pacing Guide content exactly as it was; the new
template exists so it (or anything new) can be authored by hand in the
same CCPS/VDOE-aligned shape once real content is ready. **Update:** at
the time this was written, a filled-in template still had no way back
into the app — see II1 below, which closes that gap.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), and a Node harness (`verify_gg1.js`, 26 checks) that
loads the real embedded `CAS_PACING_UNITS` data and helper functions into
a sandboxed VM and checks: all 20 real units present with correct
first/last ids and dates; `getPacingUnitsForCourse` scoping (20 for
8175/8177, 0 for 6115 — the legacy-path fallback); competency resolution
against the real `SCR_COURSES` registry, including a unit with zero
compIds for a course resolving to an empty list rather than erroring (the
"no formal competency requirement" cross-division case); `getQuarterForDate`
against real quarter ranges plus before/after-range fallbacks; the
delivery-notes overlay's save/get round-trip staying independent per
course; and the calendar's real-date placement logic (a unit's actual
date range, not an even-distribution guess, decides which days belong to
it, including the boundary into the next real unit).

## HH1 — Import a county calendar document into School Calendar settings

Closes the other half of the "stale school-year dates" gap GG1 flagged:
Settings → School Calendar already had quarter-date inputs (added in an
earlier round, `lhSaveQuarters()`) but nothing helped a teacher fill them
in each year besides typing four date pairs by hand from the official
county calendar. This adds an import path — paste or upload text from
that document and get the quarter dates, no-school dates, and
early-release dates pre-filled for review.

**Why this is text-paste/upload, not a PDF-upload button.** This app has
no PDF-parsing library and a strict CSP — no PDF-parsing script would be
allowed to load regardless (the CSP's one exception, Google Identity
Services for the optional cas-ccps OAuth connection, is a Google-hosted
identity script, not a PDF library, and `connect-src` only extends as far
as `script.google.com`/`script.googleusercontent.com`/`accounts.google.com`,
still no general-purpose network access) — there's no way to read a
PDF's content client-side without violating both. The honest, buildable
version: open the county's calendar (PDF or webpage), select-all, copy,
and paste the text into Settings — or upload a `.txt`/`.csv` file with
the same content. The Settings copy says this explicitly rather than
implying PDF support that doesn't exist.

**The parser** (`parseCountyCalendarText()` + `extractDatesFromText()`/
`extractDateRangeBounds()`) is a best-effort, regex-based reader for
common district-calendar phrasing:
- Quarter/nine-weeks date ranges ("Quarter 1: August 25 - October 23,
  2026", "1st Nine Weeks", numeric `M/D/YYYY` ranges) — resolved via
  `extractDateRangeBounds()`, which finds just the two boundary dates
  without expanding every day in between. This matters: a real 9-week
  quarter spans ~85-95 calendar days including weekends, and the
  day-by-day expander used for holiday ranges caps at 25 days specifically
  to catch parsing mistakes — reusing it for quarters would have silently
  truncated every one of them.
- No-school and early-release dates, pulled from lines under a
  recognizable section header ("Holidays", "No School", "Early Release")
  *or* any line naming a common holiday (Labor Day, Thanksgiving, Winter
  Break, MLK Day, Presidents Day, Spring Break, Memorial Day, Teacher
  Workday, and a dozen others) — catches named holidays even in a
  document with no explicit section structure.
- A running "year context" tracked line-by-line, since real calendars
  state a year once per section and omit it on the next several entries
  ("MLK Day — January 18" right after a line that said "...2027") — a
  single constant reference year would get every undated entry in the
  second half of a school-year-spanning document wrong.

**Nothing is ever silently applied.** `lhParseCountyCalendar()` shows a
`_showConfirm()` preview — exactly which quarter dates were found (or
"not found — existing value kept" for ones it couldn't), how many
no-school/early-release dates were found, and a warning for anything
ambiguous — before `_lhApplyCountyCalendarParse()` touches a single
Settings field. Quarters found are applied as a **replacement** (a stale
date range isn't worth keeping); no-school and early-release dates are
**merged** into whatever's already saved, never removing an entry a
teacher already added by hand.

Verified with `node --check` on both `<script>` blocks, `node
tools/gas-lint/check.js` (clean except the 2 pre-existing unrelated
cas-ccps warnings), and two Node harnesses: a standalone prototype test
(27 checks) developed before transplanting the parser into the app, and
`verify_hh1.js` (16 checks) that loads the real embedded parser functions
out of the actual file and re-runs the same fixture-based checks —
confirming the transplant matches exactly, not a second drifted
implementation. Covers: full-document parsing against a structurally
representative sample calendar (all 4 quarters, cross-year winter break,
named holidays, early-release days — not a real official CCPS document,
which wasn't available to this session), partial/degraded input recovering
whatever it can find while warning about what it couldn't, and the
early-release/no-school distinction never double-counting a day.

**Deliberately not done:** the 2026-27 official quarter dates themselves
still need to come from a real CCPS-published document via this import
(or manual entry) — this round builds the tool, not the data; and true
PDF parsing, for the reasons above.

## II1 — 6115's pacing-guide import: a filled-in template now actually reaches the calendar

Closes the gap GG1's own "Deliberately not done" note left open: the
Weekly Schedule / Lesson Unit Template gave 6115 (or any course with no
real external source like 8175/8177's CAS import) a place to download a
blank CCPS/VDOE-format template and print it — but nothing ever fed a
*filled-in* one back into the app. A teacher who did the work of writing
real 6115 units in that template's shape had no way to get them onto the
Pacing Calendar; the course was permanently stuck on the legacy
even-distribution guess.

- **New "⬆️ Import Filled-In Units (JSON)" control**, right next to the
  existing download/print buttons in Settings → Weekly Schedule / Lesson
  Unit Template, with a course selector scoped to `_customPacingImportCourses()`
  — every course except 8175/8177 (which keep using the real CAS import,
  untouched). Accepts either one unit object or a whole term as an array,
  same flat field shape `lhDownloadLessonUnitTemplate()` already hands out
  — no new format to learn.
- **`CUSTOM_PACING_UNITS`** (new, `lh_custom_pacing_units` in localStorage)
  holds the imported units per course. Each is wrapped into the exact same
  shape `CAS_PACING_UNITS` already uses (`courses[course].objective/compIds`,
  `vocabulary`, `warmupAnchor`, `priorConnection`) so every existing
  consumer — the unit detail modal, competency resolution, the print
  template — works unchanged for an imported unit; no CAS-vs-custom
  branching needed anywhere except at the point of generalizing
  `getPacingUnitsForCourse(course)` itself (CAS courses still read
  `CAS_PACING_UNITS`; everything else now reads its own imported list
  instead of always returning empty).
- **The Pacing Calendar now places 6115 (or any imported course) on real
  dates** too, the same way GG1 did for 8175/8177 — `renderPacingCalendar()`'s
  branch condition is `hasRealDatedUnits` (CAS **or** has any imported
  units) instead of CAS-only; a course with nothing imported still falls
  back to the legacy even-distribution path exactly as before.
- **Import is additive and non-destructive**: importing a unit whose id
  already exists replaces it in place (so re-importing an edited file
  updates the unit rather than duplicating it); a different id appends.
  `materials`/`assessment`/`differentiation` from the file seed the same
  delivery-notes overlay CAS units use (`CAS_PACING_NOTES`) — but **only**
  when a teacher hasn't already typed something in-app for that unit, so
  a later re-import never clobbers notes added since the last import.
  Competency numbers are coerced to integers (a template author can type
  `"3"` or `3`, both resolve) to match `getPacingUnitCompetencies()`'s
  existing strict-equality lookup against the course's registry.
- **Removing a course** (Settings → Course Catalog) now also clears its
  imported units, so nothing orphaned lingers under a deleted course code.
  **Clearing imported units for a course** is its own explicit action
  (Settings → Weekly Schedule → the per-course list's ✕) — the calendar
  falls back to the legacy path for that course again; delivery notes
  already typed aren't deleted, so re-importing later finds them again.

Verified with `node --check` on the real `<script>` block (the file's
regex-based script-block splitter also matches a stray `<script>` inside
an *HTML comment*'s prose text from an earlier round — confirmed
pre-existing via `git show HEAD`, not something this round introduced;
the actual script block containing all real code parses cleanly), `node
tools/gas-lint/check.js` (clean, same pre-existing warnings), the
existing `verify_gg1.js` re-run unchanged (26 checks, confirms no
regression to the CAS-side pacing logic), and a new `verify_6115_pacing_import.js`
(29 checks) that loads the real parsing/import/clear functions into a
sandboxed VM and checks: `_parsePacingUnitsJson` validation (bad JSON,
missing id, malformed dates, end-before-start, duplicate ids within one
file all rejected with specific messages); a real template-shaped fixture
parses correctly with competency-id coercion and the CAS-compatible
wrapped shape; the full `lhImportPacingUnitsJson` flow via a stubbed
`FileReader` — confirmation shown before anything's written, the imported
unit retrievable afterward, a success toast, and delivery notes seeded
from the file; re-importing the same unit id replaces rather than
duplicates, and never overwrites delivery notes already edited in-app; a
second distinct unit id appends and stays date-sorted; and
`lhClearCustomPacingUnits` removes everything for a course and is a
silent no-op on an already-empty one.

**Deliberately not done:** authoring real 6115 curriculum content —
still the same call GG1 made. This round builds the missing half of the
pipeline (import), not the content; 6115's real units still need to come
from a teacher filling in the template, same as it always would have.

---

## cas-ccps↔leader-hub integration (D1 + Addendum 26)

leader-hub's SCR grading grid and Pacing Calendar are now optional live
clients of a connected cas-ccps Teacher Dashboard, instead of always
relying on the frozen local copies (`CAS_PACING_UNITS`, the hand-typed
`SCR_COURSES` roster) — a Settings → "Connect to cas-ccps" flow, deliberately
separate from the existing Email Bridge connection since cas-ccps requires
a real verified identity per request rather than trusting a bare URL.

- **`CAS_CCPS_BRIDGE`** (`867d6f4`) — Google Identity Services
  ("Sign In With Google") client-side, a short-lived ID token kept in
  memory only (never localStorage), sent to cas-ccps's `doPost()` in a
  `text/plain` POST body (same CORS-preflight-avoidance trick
  `EMAIL_BRIDGE` already uses) rather than an `Authorization` header.
  `refreshCasCcpsPacingGuide()` is a deliberate, button-triggered pull —
  nothing syncs automatically, same convention as Org Sync's push/pull.
- **Student-email link** (`e1221d5`) — the SCR grading grid had no
  student-email field at all before this; a new `syncCasCcpsRoster()`
  pulls cas-ccps's real per-teacher roster (via a new `getRoster` API
  action) and matches it against the existing hand-placed period rosters
  by name (cas-ccps's own `period` field used only as a tiebreaker when a
  name collides across periods — never a hard join key, since the two
  systems use different period vocabularies). `_scrStudentKey(stu)` is
  the one place every `scrScores` read/write now resolves its key from —
  a matched student's scores are non-destructively rekeyed from name to
  email; anyone unmatched stays exactly as name-keyed as before. A
  reconciliation report after each sync shows what matched, what's
  already synced, and what needs manual review — nothing is added,
  removed, or guessed automatically on either side.
- **Scoped out on purpose, not silently dropped:** SCR read/write-back to
  cas-ccps. cas-ccps's own SCR functions still lack per-teacher/ownership
  gating, and this is a read-only, one-directional integration for now.

---

## Hardcoded-credentials cleanup (external product review, Finding 9)

Three real-PII surfaces in `student-leader-hub.html` got scrubbed to blank
defaults, matching the same "fresh adopter fills in Settings" pattern
`PROFILE_DEFAULTS` already used for `name`/`school`/`title`:

- **`decaChapterInfo`** — deleted outright. Confirmed dead: nothing in the
  app read it (its own comment already said so), and its identity fields
  duplicated `PROFILE` below it.
- **`PROFILE_DEFAULTS`** — `email`/`phone`/`supervisorEmail`/`adminEmail`/
  `attendanceCoordEmail` blanked to `''`. These are genuine reach-this-
  person credentials (not just a display name/title, which are left as
  illustrative defaults) — Settings → My Profile & School already has an
  input for each, unaffected by this change.
- **The Trips → Chapter Reference "Key Contacts" list** — used to be a
  hardcoded array of ~8 real people's names/phones/emails. Now reads from
  `getKeyContacts()`/`saveKeyContacts()` (localStorage, same convention as
  `PROFILE`), shipping empty by default. Populate your own list once,
  locally, via the browser console — see that function's own comment in
  source for the exact call. Never committed, never sent anywhere.

`EmailBridge.gs`'s `CONFIG.defaultBragTo` and `drive-tools/LH_DriveDocSplitter.gs`'s
four `sourceDocId` values got the same treatment — blanked/placeholder'd
with a fill-in-locally comment, matching `TARGET_FOLDER_ID`'s existing
convention in that same file.

Deliberately NOT touched: real names/phone numbers embedded in free-text
historical trip and event records (e.g. `row('Chaperones', 'Adam Berneche
· Amanda Berneche')`, trip notes) — that's the app's actual archived
content, not a hardcoded credential, and scrubbing it would mean altering
real historical records rather than removing a secret.

---

## `student-leader-hub.html` split into `src/` (external product review, Finding 4)

The single ~22,000-line file is now generated from 14 fragments under
`src/` (`00-shell-head.html` through `13-markup-modals-tail.html`) via
`tools/leaderhub-build/build.js` — see that tool's own README.md for the
full design rationale (why a pure textual concatenation is safe here
despite 189+ scattered top-level declarations and no central config
object) and one region flagged honestly as tangled, not cleanly modular
(`12-integrations-pacing-subplan-brag.html`, ~3,600 lines mixing several
genuinely unrelated features).

**The assembled file stays committed at its current path — never
gitignored, never hand-edited directly.** Edit the fragment under `src/`
that holds the section you're changing, then run
`node tools/leaderhub-build/build.js` and commit both. `npm test`
(`tests/tools/leaderhub-build.test.js`) fails if the assembled file and
its fragments ever drift apart, same enforced-not-manual pattern
`tools/html-lint/check.js` and `tools/gas-lint/check.js` already use.

`tests/leaderhub/escaping.test.js` and `pacing-and-calendar.test.js`
(which use `extractLines()` against specific line ranges) now point at
the relevant fragment file instead of the monolith, with fresh,
much-smaller re-grepped line numbers local to that fragment — a real
robustness win: only an edit inside that one fragment can shift these
ranges now, not an edit anywhere in the full file.
`emailbridge-orgsync.test.js` targets `EmailBridge.gs` directly and
needed no changes.

---

## Version control (clasp) — scaffolded, not yet connected

> **Deploying it?** [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) is the
> step-by-step runbook — clasp connection, the `.claspignore` allowlist
> gotcha that fails silently, the Web App deploy, and the `FlowOps.gs`
> verification sequence. This section describes the *layout*; that document
> is the sequence.


The Apps Script project (now `EmailBridge.gs` + `Code.gs` + `Config.gs` +
`Data.gs` + `SCR.gs` + `AiPrompts.gs` + `FlowOps.gs` — see "Server-deployed
web app" below; this is the one place this list is spelled out in prose, and
`tools/gas-lint/project-map.json` is what the tooling actually reads) is laid out
exactly the way [clasp](https://github.com/google/clasp) wants — a flat
folder. It has a committed `appsscript.json` (derived from actual service
usage: `GmailApp`, `DriveApp`, `DocumentApp`, `SpreadsheetApp`, plus the
`webapp` `executeAs`/`access` block — "Execute as: Me · Access: Anyone in
your domain"), a `.claspignore` that allowlists exactly those `.gs`
files plus `appsscript.json` and `student-leader-hub.html` (everything
else here — the `LEADERHUB_*`/`LH_0*` docs, `student-leader-hub.jsx`,
`archived/`, and `drive-tools/`'s one-off paste-and-run utilities — is
excluded), and a `.clasp.json.template` to fill in with a real
`scriptId` once you've run `clasp login` + `clasp clone`/`create` against
the live project. See
[`meta/CLASP_AND_APPS_SCRIPT.md`](../meta/CLASP_AND_APPS_SCRIPT.md) for
the full workflow.

---

## JJ1 — Server-deployed web app: leader-hub becomes a real Apps Script deployment

Closes the gap a "handoff doc" one session assumed was already true —
`EmailBridge.gs` being deployed was mistaken for the whole app being
deployed, when in fact `student-leader-hub.html` had no server behind it
at all and `EmailBridge.gs` had zero `HtmlService` code, so its `/exec`
URL could never have shown the hub UI regardless of configuration. This
round makes leader-hub genuinely operate the way `cas-ccps/teacher-
dashboard` does: a real Apps Script Web App reachable at a `/exec` URL,
sign-in-gated to one owner, with most data domains synced to a private
Spreadsheet — while `student-leader-hub.html` keeps working as a fully
local, no-network file for as long as anyone wants it. There is no forced
cutover date; the deployed app is purely additive.

**New files, one merged Apps Script project** (not two): `Code.gs`
(`doGet()` serves the hub UI via `HtmlService.createHtmlOutputFromFile()`
— zero changes needed to `student-leader-hub.html` or
`tools/leaderhub-build/build.js` to make that work, since the build
already produces one complete, valid, standalone document), `Config.gs`
(singleton settings-object domains → Script Properties), `Data.gs`
(growing record-list domains with a real `id` field → a private
"LeaderHub Data" Spreadsheet, one tab per domain), `SCR.gs` (grading
scores — a different shape from everything else, see below).
`EmailBridge.gs` is unchanged in behavior; its `doPost()` JSON API still
answers external callers directly, and its action dispatch
(`_lhDispatchAction_()`) is now shared with the same-origin
`google.script.run` path the deployed app's own client uses instead of
`fetch()`.

**Auth**: a single owner, fail-closed, matching
`_isAuthorizedTeacher_()`'s shape in `cas-ccps/00_SharedConfig.js` — a new
`OWNER_EMAIL` Script Property compared against
`Session.getActiveUser().getEmail()`. leader-hub has no second legitimate
viewer role the way teacher-dashboard has a student "My Context" view, so
there's nothing to branch `doGet()` toward besides "the owner" or "not
authorized." A colleague forking this repo deploys their own copy with
their own `OWNER_EMAIL` — no multi-tenant logic needed, matching how
Organization Sync already treats a co-advisor as a second, wholly
separate deployment.

**Two sync mechanisms, chosen per domain's actual shape** (not per the
original plan's guess — several domains turned out map-shaped rather than
row-shaped once actually read, and were placed accordingly):

- **`Config.gs`** — a JSON-stringified Script Property per key, namespaced
  `LH_CONFIG__<key>`. For small, singleton, or map-shaped domains: Profile,
  Modules, Schedule Config, Key Contacts, Custom Organizations/Courses,
  AI Privacy student-ID map, cas-ccps bridge config, Sub Plan
  settings/period assignments, SBE checklist, DECA Season/Approvals, Field
  Trip Permission overrides, Conference Leave, E-Sports checklists,
  Observation Prep, Synergy tracker, Sub-plan student notes, Permission
  Slips (`slipRosters`, keyed by tripId), DECA/generic Org Results (keyed
  by orgId), Course Catalog pacing imports/delivery notes, SCR
  student-email link, Receiving Status (keyed by PO id), the Horizon
  system's own `{short,mid,long}` buckets, and Lesson Plan content edits.
- **`Data.gs`** — one private Spreadsheet ("LeaderHub Data"), one real tab
  per domain, each record pushed/pulled as a `[Id, RecordJSON]` row rather
  than a fixed column-per-field schema (deliberate — this domain list
  spans records as different as a ~50-field trip with a nested `ap`
  approvals object and a 6-field DECA result; schema-agnostic rows mean a
  field added to a record's own object literal never needs a matching
  server change). Covers Trips, Trip Archive, DECA Results, WBL roster,
  Store inventory/sales/purchase-orders, E-Sports roster/matches, Goals,
  Events, Tasks, Deadlines, Journal History, Observation History, and Brag
  Board manual wins. Conflict model: optimistic concurrency
  (compare-and-swap on an `UpdatedAt` meta row per domain), same shape
  Organization Sync already proved out — a stale push is rejected with
  `{conflict:true}` and writes nothing.

**Not migrated, on purpose**:
- **Organizations' own roster (`students[]`) and DECA-shared results** —
  the existing "Share with a co-advisor" opt-in (Organization Sync) stays
  exactly as it was. Auto-enabling that for every organization would mean
  publishing real student PII (names, emails, phone numbers, parent
  contacts, addresses) to a Spreadsheet reachable by anyone holding the
  deployed `/exec` URL, without ever asking — a real data-exposure
  regression, not a neutral architecture change. Every other student-data
  domain in this round (trips, WBL, grades, ...) syncs automatically
  instead, specifically *because* its Spreadsheet is private to this
  deployment's one `OWNER_EMAIL`-gated owner, with no analogous
  "hand someone else this URL" sharing path at all.
- **Per-browser UI/ephemeral state** — last-open view, active tab/filter
  selections, one-time reminder-dedup date flags, and similar: no durable
  value in round-tripping these to a server.
- **A handful of append-only logs whose entries have no `id` field**
  (`lh_daily_log`, `lh_sub_plan_log`, `lh_brag_log`, `lh_wbl_hours_log`,
  `lh_scr_session_log`) — a synthetic id derived from a timestamp was
  judged more fragile (a same-millisecond double action could silently
  dedupe two real entries into one) than leaving these already-capped,
  supplementary display/aggregation logs local-only. Nothing else depends
  on them as a source of truth — e.g. a WBL student's real total hours
  live in the (synced) roster row, not the hours log.
- **`lh_inventory_transactions`** — read in one place, never written
  anywhere in the file; left alone as apparently-dead data rather than
  building sync infrastructure for it.

**SCR grading scores get a third, dedicated shape** (`SCR.gs`), because
`scrScores` is a sparse course × period × student × competency matrix
that can span thousands of cells and is edited one cell at a time, very
fast, during a live grading pass — orders of magnitude past a Script
Property's ~9KB limit if pushed whole, and a wholesale-tab-rewrite per
click would both be slow and rewrite the entire gradebook for a one-cell
change. Instead: one real row per `(Course, Period, StudentKey,
CompetencyNum)` cell, upserted by that composite key, with the client
debouncing and batching changes (2s pause, or the batch's final value if
the same cell changes again before flushing) into one call instead of one
round trip per click. Conflict model is per-cell last-write-wins — the
same granularity editing one Sheet cell from two tabs would already give
— deliberately simpler than `Data.gs`'s whole-domain compare-and-swap.
`lhGetScrScores_()`'s `found:false` (this deployment has never had a
score pushed) vs. `found:true` with an empty result (synced, then
cleared) is what protects a fresh deployment's first pull from wiping out
a teacher's real, already-graded local scores.

**ID generation stays client-side.** Every record already carries its own
`id` (`Date.now()`, an incrementing counter, or a seed value) from
existing, untouched client code. `Data.gs` never mints or rewrites one —
a same-id collision from two browser tabs surfaces as a rejected
compare-and-swap push (safe, caught) rather than silent corruption, so
server-side id generation would add real complexity to close a gap that's
already closed by the conflict model.

**One-time-setup for a fresh deployment**: `clasp push`, then Deploy →
New deployment → Web App (Execute as: Me, Access: Anyone in your domain —
same access `EmailBridge.gs` already needed), then Project Settings →
Script Properties → add `OWNER_EMAIL` (the deploying Google account).
Until that property is set, `doGet()` fails closed for everyone,
including the person who deployed it, by design.

Verified with `node --check` on every `.gs` file, `node
tools/gas-lint/check.js` (clean — Check D now also verifies every
`google.script.run.*` call from the assembled HTML resolves to a real
server function, and Check E confirms OAuth scope coverage across all
five `.gs` files that existed at that round — the project has grown since;
`tools/gas-lint/project-map.json` has the current list), `node tools/leaderhub-build/build.js --check`, and a
Node-VM-sandboxed test per new server file (`tests/leaderhub/config-sync
.test.js`, `data-sync.test.js`, `scr-sync.test.js`, extending
`tests/harness/gas-sandbox.js` with a `LockService` mock for `SCR.gs`) —
round-trips, conflict rejection writing nothing, ragged-row/malformed
handling, unknown-key/domain rejection, and (config/data) a guardrail
test that fails if the client's and server's whitelists of synced keys
ever drift apart. All existing tests continue passing unchanged.
