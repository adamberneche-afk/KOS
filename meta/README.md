# meta

Cross-cutting design/governance docs that don't belong to any single
system in this repo — including, notably, the actual design rationale for
why this repo exists at all.

## Contents

Older handoffs and finished plans are in `archive/` (`node tools/archive/search.js`,
or `archive/INDEX.md`); 4.4 of `AUDIT_STRUCTURE_2026-11-20.md` filed the last batch.

- **`CI_FLOOR.md`** — the CI checks copied from the Mothership hub's floor
  (doc-link-check, doc-placeholder-check, secrets-doctor) and how the hub
  reads this repo; moved out of the root README 2026-11-21.
- **`PLAN_2026-11.md`** — the plan of record from 2026-10-29 (proposed
  until confirmed the week of Nov 2): measure Flow 2 and warm-ups, Phase 4
  (Forms, Slides, Sheets as work files), and packaging CAS for more
  teachers; the next 14 days in detail, the rest of November and December
  in outline, and the decisions D8 to D12.
- **`PLAN_2026-10.md`** — October's plan of record, agreed on 2026-10-06; its order of work is replaced by `PLAN_2026-11.md`, its design still holds: which AI
  does what (Gemini runs the Google-side flows; a Claude Project is the
  thinking partner), CAS live by Oct 30 one feature a week, the kos-personal
  pipeline kept and repaired, and the RTP Gem frozen.
- **`HANDOFF_2026-11-19.md`** — the repo-wide session handoff: what merged
  11-18 to 11-19 (#486–#492: the doc-path warnings fixed, the nightly jobs
  tested, a reposted comment linked, turn-in codes in the teacher's demo,
  the Slides vision probe and each image's alt text in the snapshot, every
  Studio flow one row per run), what is live (KOS through #485; #486–#492
  merged, not pushed), the operator's queue in order (the push, the Studio
  Repeat for each with each flow's fixture, the flows-and-prompts audit),
  the decisions, and notes for an agent.
- **`RELEASE_AUDIT_2026-11-08.md`** — the first full-repo run of
  `tools/release-check` (plan item L1), before its CI gate turns on: counts
  per rule and per folder, the file list with every value redacted, git
  history in counts only, what each bucket needs, and the decisions the
  operator must make (deployment URLs, which folders are public, LICENSE,
  a history rewrite, turning the gate on).
- **`BACKLOG.md`** — ideas for future sprints, by system: offered small
  PRs, the CAS design threads, the second-user and KOS Lite concepts
  (deferred until after Oct 30), and repo chores. Nothing in it is
  committed work; `PLAN_2026-11.md` wins. Reviewed at each sprint boundary.
- **`FLOW2_VERSIONS_2026-11.md`** — what changed in Flow 2 and when it was
  live (the grader, students' behavior, Studio and its model), for reading a
  grading against the version that made it; `reportGradingByVersion` (69)
  groups the data the same way.
- **`TURN_IN_CODE_PLAN_2026-11.md`** — built (stages 1-5, the last 2026-11-20); the turn-in code's design, from the
  operator's decisions of 2026-11-07: a code in a Canvas text-entry box
  earns formative completion credit once the student has answered one
  question about their feedback (checked by an Apps Script screen and a
  Studio flow); no code for a broken check; the teacher's grant; a
  per-course switch; the standing rules that keep the grade from poisoning
  the competency measure; the per-lesson engagement-to-competency report;
  what to verify in a Canvas submissions ZIP; and the build stages.
- **`PRD_CAS_RESEARCH_PIVOT.md`** — the cas-ccps research-alignment PRD
  (revised 2026-10-10, checked against the code): a Phase 0 of live defects
  to fix before the warm-up week, then measurement, pedagogy and
  student-experience requirements, each with its secondary effects. It runs
  alongside `PLAN_2026-10.md`, which stays the plan of record.
- **`CLASP_AND_APPS_SCRIPT.md`** — supporting technical background on
  `clasp`, referenced by the PSD.
- **`Drive_Steward_Methodology_and_Prompt.md`** — cross-referenced here
  and from `kos-personal/rtp-core-router/protocols/` (same file, filed in
  both places) since its methodology applies across systems, not just to
  kos-personal's own governance.
- **Drive Steward, on hold (the operator, 2026-11-21):** the methodology doc
  and `drive-steward-deploy/` below are kept, not archived. Automated Drive
  maintenance will be needed; it waits until CAS and KOS are prepared for a
  second user's deployment (structure audit 4.12).
- **`drive-steward-deploy/`** — the methodology doc's Part 5: a
  ready-to-paste Apps Script package (scanner, weekly Wilson-score
  calibration, Sheet setup) plus a Studio Flow configuration spec, so
  Drive Steward actually runs on its own schedule instead of only when
  invoked in a Gem. Listed in `FLOW_INVENTORY.md` below as well, since
  its classification step is a human-built Flow dependency like the
  other three systems'.
- **`FLOW_INVENTORY.md`** — a single reference listing every "Flow"
  dependency (a human-built Google Workspace Studio/Flow or Gemini Gem
  conversation this repo's own code hands off to and cannot see or
  control) across all three systems, where to check whether each is
  actually built, and the shared three-state signal semantics ("no jobs
  yet" / "never completed a job" / "healthy") every system's own health
  panel renders to. Say/Do Ledger cross-portfolio Flow Health & Inventory
  extension.

- **`SMP_PROCESS.md`** — where System Modification Proposals are stored
  (the `SMP_REGISTER` tab and `01.3_SMP_PROPOSALS` in Drive, read by the
  KOS Project as `KOS_SMP_REGISTER`), how a new one is filed and numbered,
  and the 2026-10-12 renumbering table.
- **`PROCESS_HARDENING_SPRINT.md`** — a sprint plan from a retrospective on
  the `consolidation-review-fixes` fix pass: not what got fixed, but what
  should change about how this repo is built so the same bug *shapes*
  (live-vs-source drift, a convention established once but not enforced
  everywhere, an untested code path, retryable-vs-deterministic failure
  handling, cross-project constant duplication, checks that only run after
  an entire process finishes) get caught by tooling next time instead of
  needing another external review. Five phases, sequenced by dependency and
  risk; tracked with the same 🔲/🟡/✅ status convention as `README.md`'s
  own "Known gaps."
- **`FLOW_DOCTRINE.md`** — the seventeen rules this repo's Flow deployments
  produced, each with the incident behind it, a pointer to where the
  reasoning already lives, and an explicit statement of whether anything
  **enforces** it. That last part is why it exists: a practice that is only
  prose gets rediscovered, and six of the seventeen still have nothing
  behind them. It deliberately does not re-transcribe the file headers it
  points at — a rule restated in two places becomes two rules. Where
  `FLOW_INVENTORY.md` answers *what* the Flow dependencies are, this answers
  *how to build one*. Rules 4, 5, 7, 9 and 12 are enforced by `gas-lint`
  Checks H through K, configured in `tools/gas-lint/flow-map.json`; rule 15
  is now partly enforced too, by Check L
  (`checkPlausibilityGateDrift`).

- **`notebook-codebase/`** — the whole repo as Gemini notebook sources,
  generated by `tools/notebook-codebase/build.js`: 14 Markdown sources plus
  an index, for a separate "KOS Codebase" notebook. Only the README is
  committed; the sources are generated locally (gitignored). The README has
  the build and upload steps and suggested notebook instructions.
- **`notebook-context/`** — the "KOS Context" notebook, generated by
  `tools/notebook-context/build.js`: `GUIDE.md` (written for the notebook,
  committed, edited here) and copies of the North Star, value proposition,
  system and direction documents. The README lists the sources and when to
  rebuild.

- **`AUDIT_LESSON_DOC_2026-11-19.md`** — the teacher's lesson doc (66)
  against what a teacher needs to support students: twelve findings. Built:
  the due date and links, Parts (each part's task, Submit's checks, what
  opens it), What the feedback checks (with the teacher's grading notes),
  and Class status's Not started, To revise and Not shown yet. Not built:
  supports and extensions (curriculum to write).
- **`AUDIT_STRUCTURE_2026-11-20.md`** — structural debt across the repo: what to fold together, what is redundant, how navigable it is; ranked proposals with effort and risk (findings only)
- **`AUDIT_STUDENT_QUESTIONS_2026-11-17.md`** — every question a student
  can be shown (the reflection on Submit, the turn-in question: 2,179 of
  them) measured: a median of 44 words and up to 110, because each quoted a
  whole goal. Reworded so the goal sits on its own line above a short
  question (8 to 16 words); the goals themselves are still long.
- **`AUDIT_DEAD_ENDS_2026-11-17.md`** — the second dead-ends audit, at the
  sprint boundary: the 10-29 audit all closed; what's live is behind main
  (a push clears it); one quadratic function makes three tools slow;
  coverage-gaps can't see 12 trigger registrations; three editor functions
  undocumented; whether doc-currency should check file paths. Partial (the
  function-level sweep is for the next one).
- **`AGENT_NOTES.md`** — the notes for an agent session from every
  archived handoff (10-05 to 11-08), word for word and oldest first. The
  live handoffs keep their own.
- **Archived** — superseded handoffs, finished plans, sprints and audits
  are in [`archive/`](../archive/INDEX.md), filed by school quarter and
  kept at their old paths inside it, out of everyday search;
  `archive/INDEX.md` has a row per quarter and links each quarter's index.

## Why these are here and not under a system subtree

Everything else filed during this repo's reconciliation passes went under
`kos-personal/`, `cas-ccps/`, or a system-specific new top-level directory
(`leader-hub/`, `drive-curation/`) because it was clearly scoped to one
system. The documents listed above are explicitly about the relationship
between systems, or about the repo's own existence — putting them under
one system's directory would misfile them.
