# Pacing guide and county calendar import (GG1, HH1, II1)

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

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
  silently misfiling every unit into the wrong quarter. (`QUARTERS_DEFAULT`
  holds the published CCPS 2026-27 quarters as of 2026-10-03; see Status.)

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
- **`CUSTOM_PACING_UNITS`** (new, `lh_custom_pacing_units`, then localStorage, now a server config key)
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
