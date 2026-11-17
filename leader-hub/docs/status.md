# Status

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

Actively developed (~20 sessions per its own `LEADERHUB_WIP.md`). The
`drive-tools/` scripts are flagged in their own filenames' origin as
**not yet run against real data** — treat them as drafts pending a
deliberate execution decision, not as already-applied changes.

**2026-10-31 (KOS Audit Docket IV; pushed 2026-11-01, v70):** the web app runs
as the owner with domain access, so every public server function now
checks its caller: the read-only setup checks (`checkAiPrompts`,
`checkAiQueueSchema`, `runLeaderHubPreflight`, `checkAiFlowFixtures`,
`checkAiFlowBinding`) call `_lhRequireOwner_`, and `reportDeployVersion`,
which a trigger runs, calls the trigger-safe `requireScriptOwner_` (Code.gs).
gas-lint's `web-app-public-function` check enforces it; the `?diag=1`
page's `lhDiagPing` and `lhDiagReport` are listed as open by design in
`tools/gas-lint/webapp-public-allow.json`. Personal phone numbers were
removed from the trip data and from the repo's history; the AI email
signature now gives the address only (run `syncAiPromptsToSheet()` after
the push).

**2026-10-03: the built-in school calendar is CCPS 2026-27**, and the
importer reads the district's published calendar. The `_DEFAULT` consts
(`src/10-command-engine-ai-and-widgets.html`, `QUARTERS_DEFAULT` in `src/12`)
held Clover Hill's 2025-26 dates; they now hold 2026-27 (`SCHOOL_CALENDAR_YEAR`):
quarters Aug 24–Oct 30, Nov 4–Jan 22, Jan 25–Mar 25, Apr 5–Jun 4, every
weekday holiday and break, and the seven three-hour early releases. The CCPS
entries in Deadlines (ids `cal_*`) are `CCPS_CALENDAR_DEADLINES_DEFAULT`.
A saved calendar (`lh_schedule_config`) still wins over the defaults, so
Settings → School Calendar has a **"Use the built-in 2026-27 CCPS calendar"**
button: it replaces the saved quarters, no-school and early-release dates
(the importer only adds, so last year's dates would stay) and swaps the
`cal_*` deadlines, keeping bell times, the day-of-week map and hand-entered
deadlines. Pasting the district's calendar into the importer gave no
quarters and 2 of 7 early releases: `Aug.`/`Oct.`/`Nov.` weren't months,
"December 2026" read as December 20, "Nov. 25, to Friday, Nov. 27" wasn't a
range, and an early release on a quarter's last day was dropped. All four
are fixed, and the published text is a test fixture
(`tests/leaderhub/fixtures/ccps-2026-27-calendar.txt`); the consistency of
the built-in dates is `tests/leaderhub/school-calendar-defaults.test.js`.

**2026-10-06: last spring's sample deadlines are retired.** Eight built-in
deadlines from spring 2026 (four "Synergy Grades — 2-Week Update Due", the
field-trip form, WBL agreements, SBE sign-off and the E-Sports roster lock)
never rolled forward and sat at the top of the dashboard as "198d OVERDUE".
They are no longer defaults, and `dropRetiredDefaultDeadlines()` (`src/10`)
removes a saved copy on load and on server sync, but only while it still has
its original date, so one you re-dated stays. Synergy's 2-week cadence is
still tracked in Settings as a 14-day recurring check. PLC meetings are
attendance records and stay.

The DECA season is Virginia DECA's 2026-27 calendar too: the season
pipeline (`DECA_SEASON_DEFAULT`, `src/07`: Camp DECA, Power Trip, DLC, SLC
registration/testing/conference, ICDC registration/payment, ICDC Anaheim
Apr 17–20; every stage `statusAuto`) and its deadlines from October on
(`DECA_DEADLINES_DEFAULT`, ids `deca_*`, `src/10`). A season saved in an
earlier year wins over the default, so the season editor has **"Use the
built-in 2026-27 season"**, which replaces the season and the `deca_*`
deadlines (plus last season's two built-in DECA deadlines) and keeps
hand-entered ones. The dashboard's hard-coded 2026 ICDC alert stopped
showing after 2026-04-30 and is left as it was.

**Fixed 2026-09-29: the Settings school-calendar importer misread real
calendars** (seen live 2026-09-28: 0 no-school dates, 22 early-release dates
and no quarters). In `parseCountyCalendarText()`
(`src/11-journal-cron-settings-and-sync.html`):

1. Any short line mentioning early release switched the importer into
   early-release mode for the rest of the document, and that mode outranked
   holiday names. Now only a heading (a short line with no date) sets the
   mode, and what a dated line says wins: early release or dismissal is
   early release, and a named holiday or "closed"/"no school"/"break" is
   no-school. First-day, last-day and report-card lines are never days off.
2. Quarters were only recognized as "Quarter N" or "Nth Nine Weeks" with two
   dates. Now "Q1", "Qtr 1", "MP1", "Marking Period 1" and "First Quarter"
   count too. A quarter given only as "End of First Quarter – Oct 30" gets
   its start from the first day of school, or the next school day after the
   previous quarter ends.

Tests: `tests/leaderhub/pacing-and-calendar.test.js`, built from calendar
lines in the shapes described above. The real district calendar hasn't been
run through it yet: paste it into the importer, review the preview before
saving, and send the text if anything is still misfiled so it can become a
fixture.
