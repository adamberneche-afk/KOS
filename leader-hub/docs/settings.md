# Settings

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

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
(`lh_profile`, a server config key since 2026-10-22) that every one of those templates reads from
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
`lh_schedule_config` (a server config key since 2026-10-22):
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
School Store, E-Sports — backed by `lh_modules` (a server config key)
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

Six collections used to ship with real seed content baked into the
file — Field Trips, DECA Members, DECA/Leadership Events, Goals, WBL
Roster, and Store Inventory — and until this button the only way for a new teacher
to start clean was deleting every record one at a time through its own UI.

**No real people in the seed (2026-11-07).** Field Trips, Events, Goals,
the Trip Archive and the permission-slip rosters now start empty: last
season's built-in trips and events named colleagues and family members,
carried a phone number and PO numbers, and on a fresh start read as
OVERDUE. DECA Members, WBL Roster and Store Inventory keep their made-up
placeholder rows. Profile defaults name roles, not people (Supervisor,
Administration, a blank attendance contact, so the sub-plan email opens
"Hi there,"); the observation and Brag Board labels read Supervisor /
Administrator A / B, with the stored observer and tab keys
unchanged so saved observations still match. The bookkeeper, WBL
coordinator, transportation and district DECA contacts are named by role.
The 2026-27 DECA and CCPS calendar deadlines are unchanged.
The sub-plan email function is now `emailSubPlanToAttendance()`. A saved copy
in the store (`lh_trips`, `lh_events`, `lh_goals`, `lh_trip_archive`)
is untouched: what the operator saved stays. `LH_04_EMAIL_AUDIT.md` lists
senders by role. `tools/student-data-scan` now fails on a name-shaped
district staff address (see its README).

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

- **`CUSTOM_COURSES`** (`lh_custom_courses`, then localStorage, now a
  server config key) is a new
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
