# KOS backlog: ideas for future sprints

**Status:** started 2026-10-17. Nothing here is committed work.
[`PLAN_2026-10.md`](./PLAN_2026-10.md) is the plan of record and wins
whenever the two disagree. [`HANDOFF_2026-10-17.md`](./HANDOFF_2026-10-17.md)
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

### Offered, small, ready to build

- **Late-completion fix (bug 3).** Let the COMPLETE branch of
  `backPropagateCompletions` also finish `ERROR_TIMEOUT` queue rows, with a
  test. 2026-10-16, [`CAS_BUG_HANDOFF_2026-10-16.md`](./CAS_BUG_HANDOFF_2026-10-16.md).
- **Retention disposition.** A dry-run report of records past their cutoff,
  then deletion only after the operator approves it. This follows the
  records officer's confirmation of the schedule. 2026-10-13, after #174.
- **Retention check: report a missing date column.** When a tab's date
  header has been renamed, `checkRetentionSchedule` counts every row as
  "no readable date" and never says the column is missing. It should
  name the header it looked for. 2026-10-17.

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
- **Cognitive exhaust and authenticity review.** Student process traces;
  flags on the Teacher Dashboard only at first. Waits on district policy
  and on a `revisionProbe` result.
  [`CAS_COGNITIVE_EXHAUST_2026-10-16.md`](./CAS_COGNITIVE_EXHAUST_2026-10-16.md).
- **PRD research-pivot requirements past Phase 0.** Measurement, pedagogy
  and student experience. [`PRD_CAS_RESEARCH_PIVOT.md`](./PRD_CAS_RESEARCH_PIVOT.md).

### Waiting on another piece of work

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

- **Ingestion hardening, steps C and A.** These come after the §4
  diagnosis. [`KOS_INGESTION_HARDENING_PLAN.md`](./KOS_INGESTION_HARDENING_PLAN.md).

## leader-hub

- **D1 link to CAS.** Blocked until there is a Google Cloud OAuth client.
  [`../cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md`](../cas-ccps/docs/LEADERHUB_CONNECTION_SETUP.md).
- **New features.** Frozen until CAS is live (PLAN_2026-10). Use
  `LEADERHUB_WIP.md` for these.

## Repo and tooling

- **Retire `run.ps1`.** Remove it once `run.js` has run live, and change
  the manifest-agreement test to check `run.js` only.
- **Fix `SANDBOX_CI_SETUP.md`.** It still says `clasp login --status`,
  which clasp 3.x removed. Use `clasp show-authorized-user`.
- **Regenerate the 2026-10-13 product guides** (outside the repo) with an
  "as of" line per system. The errors to fix are listed in the 10-17
  handoff.

## Dropped

_(None yet. Each entry: the item, the date, and why.)_
