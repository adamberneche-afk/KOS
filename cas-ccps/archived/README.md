# cas-ccps archived scripts

Scripts no longer in any Apps Script project: out of
`tools/gas-lint/project-map.json`, so gas-lint and clasp-sync ignore them and
a push removes them. Kept for reference.

- `70_WorkFileProbe.js`: Phase 4's one-shot design check, run 2026-11-01;
  answers in `meta/STUDENT_WORK_PLAN_2026-10.md` §5. Archived 2026-11-07.
  Test: `tests/cas-ccps/archived/work-file-probe.test.js` (by hand).
- `studio-steps/`: the 8 custom Workspace Studio steps behind Flows 1-5 and
  their shared file, with the project's manifest and clasp template under
  `studio-steps/clasp/`. Never reachable on this account: the district's GCP
  block keeps a custom step out of Studio's picker, and 37 and 41 replaced
  every one. Archived 2026-11-17 (clean-up C1). Tests:
  `tests/cas-ccps/archived/*-step.test.js` and `studio-steps-shared.test.js`
  (by hand: `node --test tests/cas-ccps/archived/*.test.js`);
  `competency-evidence-schema-compat.test.js` still reads
  `CommitStudentEvaluationStep.gs` as the writer of record.
- `21_AutoInstaller.js`: the Apps Script API installer (`runAutoInstaller`),
  with `docs/REGISTRY_SHEET_SETUP.md`. The API needs a Cloud project, off
  for the district, and `tools/clasp-sync/run.js` installs every project.
  Archived 2026-11-17 (clean-up C2): out of the Unified Manual, its menu
  item and its two Apps Script API scopes removed.

kos-personal's managed inference service was archived the same day
(clean-up C3) to `kos-personal/archive/inference-service/`.
