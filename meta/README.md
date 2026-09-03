# meta

Cross-cutting design/governance docs that don't belong to any single
system in this repo — including, notably, the actual design rationale for
why this repo exists at all.

## Contents

- **`PSD_Version_Controlled_CAS_Workspace.md`** — a Product Specification
  Document proposing exactly what this repo now is: moving both CAS
  (Classroom Agency System) and KOS off dated-Drive-folder-copy versioning
  onto `clasp` + git + GitHub. "CAS" here is Classroom Agency System, not
  a version-control abbreviation — confirmed by content. This is the
  origin document for this whole consolidation effort, filed here because
  neither `kos-personal/` nor `cas-ccps/` alone is the right home for a
  doc explaining the repo's reason for existing.
- **`VERSION_CONTROL_CONCEPTS.md`** — supporting conceptual background for
  the PSD above.
- **`CLASP_AND_APPS_SCRIPT.md`** — supporting technical background on
  `clasp`, referenced by the PSD.
- **`Drive_Steward_Methodology_and_Prompt.md`** — cross-referenced here
  and from `kos-personal/rtp-core-router/protocols/` (same file, filed in
  both places) since its methodology applies across systems, not just to
  kos-personal's own governance.
- **`drive-steward-deploy/`** — the methodology doc's Part 5: a
  ready-to-paste Apps Script package (scanner, weekly Wilson-score
  calibration, Sheet setup) plus a Studio Flow configuration spec, so
  Drive Steward actually runs on its own schedule instead of only when
  invoked in a Gem. Listed in `FLOW_INVENTORY.md` below as well, since
  its classification step is a human-built Flow dependency like the
  other three systems'.
- **`CODEBASE_REVIEW.md`** — the largest document here: an outside review of
  all three systems against their own stated promises, plus a prioritized
  recommendation list. Several of its findings have since been acted on; it
  carries inline `⚠ Stale` / **Done** annotations rather than being rewritten,
  matching this repo's convention of correcting a record in place instead of
  silently editing it.
- **`FLOW_INVENTORY.md`** — a single reference listing every "Flow"
  dependency (a human-built Google Workspace Studio/Flow or Gemini Gem
  conversation this repo's own code hands off to and cannot see or
  control) across all three systems, where to check whether each is
  actually built, and the shared three-state signal semantics ("no jobs
  yet" / "never completed a job" / "healthy") every system's own health
  panel renders to. Say/Do Ledger cross-portfolio Flow Health & Inventory
  extension.

- **`FLOW_DOCTRINE.md`** — the thirteen rules this repo's Flow deployments
  produced, each with the incident behind it, a pointer to where the
  reasoning already lives, and an explicit statement of whether anything
  **enforces** it. That last part is why it exists: a practice that is only
  prose gets rediscovered, and four of the thirteen still have nothing behind
  them. It deliberately does not re-transcribe the file headers it points at
  — a rule restated in two places becomes two rules. Where
  `FLOW_INVENTORY.md` answers *what* the Flow dependencies are, this answers
  *how to build one*. Rules 4, 5, 7, 9 and 12 are enforced by `gas-lint`
  Checks H through K, configured in `tools/gas-lint/flow-map.json`.

## Why these are here and not under a system subtree

Everything else filed during this repo's reconciliation passes went under
`kos-personal/`, `cas-ccps/`, or a system-specific new top-level directory
(`leader-hub/`, `drive-curation/`) because it was clearly scoped to one
system. The documents listed above are explicitly about the relationship
between systems, or about the repo's own existence — putting them under
one system's directory would misfile them.
