# DSP framework content — removed

Split out of `leader-hub/README.md` on 2026-11-17; the README maps where everything is.

Earlier versions of this app cited Adam's personal CCPS teacher-evaluation
cycle ("Directed Support Plan," or "DSP") throughout — a hardcoded
May 15, 2026 due date, "Standard 1"/"Standard 2" citations, a dedicated
"DSP Evidence Report" export, a supervisor check-in countdown pill, and
DSP-specific goals/deadlines/action-queue signals. None of that is
portable to another teacher's evaluation framework (most districts don't
use CCPS's DSP model at all, and the ones that do won't share Adam's dates
or supervisor), so it's been removed rather than made configurable:

- **Deleted outright**: the DSP countdown pill and its `updateDSPCountdown()`
  function, the "DSP Evidence Report" modal and its `generateDSPReport()`/
  `closeDSPReport()` functions (~300 lines), the supervisor check-in day-of
  banner and its `checkGreenCheckinToday()`/`showGreenCheckinBanner()`/
  `logGreenMeetingAttended()` functions, the seeded DSP goals (`Leadership
  Development` category, ids 8–13) and DSP-specific deadlines (`dl_dsp_end`,
  `dl_green2`–`dl_green5`), the action-queue "supervisor check-in" signals, and
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
