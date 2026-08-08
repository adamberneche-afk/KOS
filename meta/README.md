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

## Why these are here and not under a system subtree

Everything else filed during this repo's reconciliation passes went under
`kos-personal/`, `cas-ccps/`, or a system-specific new top-level directory
(`leader-hub/`, `drive-curation/`) because it was clearly scoped to one
system. These four documents are explicitly about the relationship
between systems, or about the repo's own existence — putting them under
one system's directory would misfile them.
