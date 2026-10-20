# KOS backlog: ideas for future sprints

**Status:** started 2026-10-17. Nothing here is committed work.
[`PLAN_2026-10.md`](./PLAN_2026-10.md) is the plan of record and wins
whenever the two disagree. [`HANDOFF_2026-10-21.md`](./HANDOFF_2026-10-21.md)
holds the operator's current queue and the decisions waiting on the
operator. This file holds what comes after them.

## How to use this file

- **Adding an item costs one line and commits no work.** Give the idea, the
  date, where it came from, and a link if a longer doc exists. Link to that
  doc rather than copying it here.
- **Review at each sprint boundary.** The first is 2026-10-30. Promote each
  item into the plan, drop it with a reason in the "Dropped" section at the
  bottom, or leave it.
- **Write planned function names without parentheses.** `doc-currency`
  reports any function name followed by `()` that does not exist in the
  code.
- **No student data.** Keep out names, emails, file IDs and ConfigIDs, the
  same rule as in the handoffs.
- leader-hub keeps its own ranked backlog in
  [`../leader-hub/LEADERHUB_WIP.md`](../leader-hub/LEADERHUB_WIP.md)
  (BACKLOG section). Put only items that cross systems here.

## cas-ccps

### Assignment prompts the tiers turned up (2026-10-20)

Each lesson's competency tiers (`curriculum/lessons/COMPETENCY_TIERS.json`)
are drafted from its task; drafting showed tasks whose evidence Flow 2
can't see. Fix each before the lesson is taught; the tier's `why` names
the part of the task.
- **Only a link:** L28 and L30 (a Forms URL, no explanation); 8177
  Promotional Flyer, Hype Machine, Global Expansion (a PDF, Canva or Slides
  link); The Bottom Line and The Sponsorship Negotiation (a linked Sheet).
  Ask students to paste or describe the work in the doc.
- **Half a SWOT:** L04 and L29 ask only for strengths and weaknesses, so
  105 (SWOT) can only be partly met.
- **Work done aloud or in person:** roleplays (L24, The Front Lines, The
  Sponsorship Negotiation), the in-class negotiation (The Millionaire's
  Strike), the live event and a handwritten note (Game Day Takeover), the
  interview tool (L35). Only a written reflection reaches the doc.
- **No branding competency** on the three 8177 branding assignments
  (Brand Board, Company Description, Branding Essay); 93 and 97 are about
  events. L01's primary (45) is about the industry's history, which the
  task doesn't ask; L05's 109 is industry networking, the task personal
  support.

### Warm-up scoring and Flow 3 output (2026-10-20)

- **Word count penalises list answers.** A warm-up that asks students to
  "list as many ways as you can" gets 0 of 6 for word count from a correct
  list (`WORD_COUNT_THRESHOLDS`, 25). Either seed list prompts differently
  or score lists by item count. A grading rule, so the teacher decides;
  after Oct 30.
- **Flow 3 output quality.** About 1 in 5 of Studio's warm-ups is turned
  down by the shape gate (over 900 characters; the prompt's own wording,
  "adaptation constraints", "teacher's anchor prompt"). Tighten the Flow 3
  prompt (40) and watch the nightly fallback count. With D6.
- **33 finds the matrix like 53.** `syncArtifactCompetencies` stops with
  `NO_MATRIX_ID` unless `TEACHER_MATRIX_SS_ID` is set; fall back to
  `MatrixRegistry` (`_asTeacherMatrix_`, 53).

### Offered, small, ready to build

- **Retention disposition.** A dry-run report of records past their cutoff,
  then deletion only after the operator approves it. The schedule is
  confirmed (2026-10-17), so this is ready when wanted. 2026-10-13, after #174.
- **Retention check: report a missing date column.** When a tab's date
  header has been renamed, `checkRetentionSchedule` counts every row as
  "no readable date" and never says the column is missing. It should
  name the header it looked for. 2026-10-17.

- **Assignments that aren't a document.** Some of the week's assignments
  are on paper or don't fit a doc, so CAS has no record of them; L07 is the
  last doc assignment of the week of Oct 19. Come back to these if time
  allows (operator, 2026-10-19).

### Design threads (suggestions; nothing built)

- **Thread A: cross-course mastery map, remediation and anchors.** Start
  with the competency graph file and a teacher-approval tool.
  [`CAS_DESIGN_THREADS_2026-10-16.md`](./CAS_DESIGN_THREADS_2026-10-16.md) §1.
- **Thread B: student-owned portfolio.** Start by hand-building the
  manifest for one or two volunteer students. Waits on district policy for
  exporting student work. Same doc, §2.
- **Thread C, what's left.** The nightly rollout is built (2026-10-17,
  `58_LessonRollout.js`, shadow first). Still open: a per-lesson `release`
  hold column in `LessonSchedule`, student-requested doc creation, and
  persistent per-course docs. Same doc, §5.
- **Cognitive exhaust and authenticity review.** Student process traces,
  for assignment docs (not warm-ups). Decided 2026-10-17: nothing on the
  student's doc, results on the Teacher Dashboard only; the county's account
  monitoring covers policy; no students excluded. Waits on a
  `revisionProbe` result.
  [`CAS_COGNITIVE_EXHAUST_2026-10-16.md`](./CAS_COGNITIVE_EXHAUST_2026-10-16.md).
- **PRD research-pivot requirements past Phase 0.** Measurement, pedagogy
  and student experience. [`PRD_CAS_RESEARCH_PIVOT.md`](./PRD_CAS_RESEARCH_PIVOT.md).

### Waiting on another piece of work

- **Setup wizard installs two Ledger triggers in the wrong project.**
  `28_Module2Setup.js` (Unified Manual) installs `registerDeliveredWarmUps`
  and `runAlignmentLogBackfill_` in its own project; their installers in 25
  and 22 end in `_`, so they can't be run from the Ledger's menu. Make
  `installLedgerCycle()` always include `registerDeliveredWarmUps`, give
  both installers public names, and fix 28 (2026-10-19).
- **Teacher timeout email (03 `notifyTimeoutToTeacher_`)** still tells the
  student to use the doc's AI Evaluation Panel menu, which doesn't run for
  student accounts: say to start Flow 2 by hand (a late result still lands)
  or have the student resubmit from the Student Dashboard (2026-10-19).

- **Family Mail Sentinel: retry a dropped Studio run**, as #193 does for
  warm-ups. One run failed with "Couldn't access the spreadsheet" on 10-19,
  and `60` never writes the input again (2026-10-19).

- **Parent reports (`36_WeeklyParentReport.js`) turned on.** Built, not
  enabled; the only off-domain disclosure. Waits until the student and
  teacher dashboards are tightened (decided 2026-10-18; `PLAN_2026-10.md`,
  "The next two weeks", D1), then a dry run: one report reviewed, none sent.

- **Family Mail Sentinel redaction rework.** Keep the patch's new phrases
  (restrict "kms"), its quote-safe possessive handling and its two-letter
  names. Replace the automatic nickname prefixes with a nickname list the
  teacher keeps, and add tests for curly quotes and roster-name
  collisions. 2026-10-13, from the review in the 10-17 handoff.

## Second teachers and adoption

Two concept sets exist from outside the repo; neither is filed yet. Both
wait until after 2026-10-30.

- **Second-user build (`SU_*`, reviewed 2026-10-13).** The order of work is
  sound, but some of its premises are wrong:
  - Parent reports would send from the admin's mailbox.
  - Consolidating the dashboards breaks every other teacher's `/exec` URL.
  - The installer can't set properties or triggers in other projects
    without the Apps Script API.
  - Course numbers are hardcoded into `31`.
  - cas-ccps and leader-hub have no license files.
- **KOS Lite (`LT_*`, reviewed 2026-10-17).** Signed pull-only releases,
  `kos verify` and `kos apply`, and reuse of `run.js`. Before any of it
  is built:
  - Settle per-adopter config. The Unified Manual manifest hardcodes the
    operator's Central Ledger library ID. The code hardcodes the domain
    patterns and the course numbers. Deploy versions report to the
    operator's repo.
  - Decide which files a release may contain. A zip of the repo would
    publish staff addresses and the meta docs.
  - Decide whether the repo goes private.
  - Validate scriptIds and deployment IDs with strict patterns before they
    reach cmd.exe.
  - Correct the docs' factual errors: markers are full 40-character SHAs;
    the cas-ccps registry path is `<registry>\cas-ccps\<project>`; clasp
    3.x uses `create-script` and `show-authorized-user`.
- **Marker-level verify, which works today.** `clasp list-deployments`
  shows each deployment's `<marker> v<n>` description, so a read-only
  check can compare it with the repo's markers. One gap: a rollback
  writes "rollback to v<n>" with no marker.
- **Windows CI job for `run.js`.** Cheap, and independent of the rest.
  The test already builds a `.cmd` launcher on win32.

## kos-personal

- **The Registrar's Studio flows (2026-10-20).** Stage 1 (Auditor) and
  Stage 2 (Curator) were never built (`11_Registrar_CogRelay.gs`). When they
  are, serve their prompts from the `FlowPrompts` tab like the other three:
  add both `.md` files to `generate-flow-prompts.js` and `16_FlowPrompts.gs`,
  rather than a hand-pasted system prompt.
- **Ingestion hardening, steps C and A.** These come after the §4
  diagnosis. [`KOS_INGESTION_HARDENING_PLAN.md`](./KOS_INGESTION_HARDENING_PLAN.md).

## leader-hub

- **D1 link to CAS.** Blocked until there is a Google Cloud OAuth client.
  [`../cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md`](../cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md).
- **New features.** Frozen until CAS is live (PLAN_2026-10). Use
  `LEADERHUB_WIP.md` for these.

## Repo and tooling

- **A deploy marker that tracks the push.** `reportDeployVersion` reported
  `965b94d` after every push on 2026-10-17/18 because the marker files are
  stamped separately; have `run.js` (or the push) stamp the zip's commit, so
  the report confirms what is live. Raised 2026-10-18.
- **Retire `run.ps1`.** Remove it once `run.js` has run live, and change
  the manifest-agreement test to check `run.js` only.
- **Fix `SANDBOX_CI_SETUP.md`.** It still says `clasp login --status`,
  which clasp 3.x removed. Use `clasp show-authorized-user`.
- **Regenerate the 2026-10-13 product guides** (outside the repo) with an
  "as of" line per system. The errors to fix are listed in the 10-17
  handoff.

## Dropped

_(None yet. Each entry: the item, the date, and why.)_
