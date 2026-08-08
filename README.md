# KOS

This repository is a consolidation point for **three genuinely separate
systems, plus reference/governance material that doesn't belong to any
one of them**. `kos-personal/` and `cas-ccps/` were built independently,
use the same underlying platform pattern (Google Apps Script + native
Gemini inference, no external hosting or API keys by default), and are
kept as **separate concerns** in this repo rather than merged.
`leader-hub/` is a third, unrelated system, confirmed distinct during a
later reconciliation pass — see below.

Files arrive here piecemeal as they're uploaded across sessions — this
README and the per-system READMEs below are the index of what's been
consolidated so far and what's still missing. When new files show up, they
get filed into the matching subtree, not left loose at the root. See
`meta/PSD_Version_Controlled_CAS_Workspace.md` for the actual design
rationale behind moving to this git-based structure in the first place.

## [`kos-personal/`](./kos-personal/) — Knowledge Operating System v8.0

A personal AI-session knowledge pipeline: ingests one operator's AI working
sessions, extracts structured knowledge (decisions, action items, vector
weights, persona council verdicts), and routes it into a `BRAIN_TRUST_INDEX`
spreadsheet. Governed by an external orchestration layer (`RTP_CORE_ROUTER`)
that runs a 7-persona council with RID-weighted routing and a human-in-the-loop
firewall.

**Status:** reconciled — the code, the docs, and the HTML client now agree.
Every gap the docs previously described (missing server functions,
`STUDIO_ACTIVE` turnstile gating, the shadow matrix, the daily primer, the
auto-council trigger) has been implemented, `10_Turnstile.gs` was rebuilt
against the real schema (original archived), and all 7 `PERSONA_*` cog
docs are now filed under `rtp-core-router/`. A later reupload batch added
two backported fixes, ten governance/protocol docs, and a real optional
managed-inference-service alternative to native Studio (opt-in, gated
behind `CFG.INFERENCE_MODE`, off by default). See
[`kos-personal/README.md`](./kos-personal/README.md) for the full
before/after record.

## [`cas-ccps/`](./cas-ccps/) — Classroom Agency System (CCPS)

A district-deployed (ccpsnet.net), FERPA-scoped, student-facing platform for
a CCPS Sports/Entertainment/Event Marketing course pair (courses 8175 &
8177). Students work inside a simulated student-run "conglomerate" business
across a 10-stage, 20-unit curriculum; the software layer logs lesson intent,
runs AI evaluation of student work, converts evidence into Student
Competency Record (SCR) rating suggestions, and aggregates each student's
activity into a living context document.

**Status:** reconciled — all 7 flagged conflicts resolved, including the
most significant one: confirming Studio (not GAS) writes student feedback
into the doc, with the outlier design archived. Both confirmed bugs (a
Turn-In Form field mismatch, a `ReferenceError` in the setup wizard) are
fixed, along with a wider class of unescaped-string syntax bugs found
while verifying that fix. Module numbering is now internally consistent
across every doc in the set — including a correction, caught mid-implementation,
to the originally-approved renumbering (the Student Context Aggregator was
always correctly "Module 4"; the SCR engine moved to "Module 5," not "Module 4").
A later reupload batch closed most of the remaining Known Gaps (the two
missing data files, the `lesson_unit_id` column, and 6 of 7 missing Module
2 scripts) and resolved a second, genuine numbering collision inside
Module 2 itself. See [`cas-ccps/README.md`](./cas-ccps/README.md) for the
full record.

## [`leader-hub/`](./leader-hub/) — LeaderHub

A third, unrelated system — confirmed genuinely distinct from both of the
above during Round 3 reconciliation, not a cas-ccps companion despite
covering the same course numbers. A personal, single-file HTML command
center for one teacher's full multi-role workload (classroom, DECA,
school store, E-Sports, field trips). Client-side only — no server, no
shared data model with `kos-personal/` or `cas-ccps/`. See
[`leader-hub/README.md`](./leader-hub/README.md).

## [`drive-curation/`](./drive-curation/) — filed for reference, not a system

Personal Google Drive housekeeping/audit material, plus curriculum
content for a different, unrelated course ("Marketing Exploration," not
cas-ccps's 8175/8177 pair). Explicitly **not** part of either software
system — filed here at the user's request so nothing uploaded is lost,
clearly labeled to prevent future confusion. See
[`drive-curation/README.md`](./drive-curation/README.md).

## [`meta/`](./meta/) — cross-cutting design docs

Governance/design material that spans systems, including the actual
Product Specification Document proposing this repo's git-based structure
in the first place. See [`meta/README.md`](./meta/README.md).

## Still pending

Module 1 (`cas-ccps`) still needs Flow 2 built in Studio before it can run
end-to-end, and a handful of named-but-not-yet-uploaded files remain across
systems (`27_LessonFrameGenerator` in cas-ccps; two `PERSONA_*` version
duplicates and `sql/migrate.js` in kos-personal's optional inference
service) — see each system's README for the specific list. Reconciliation
work (resolving contradictions between what's here) is done twice over now
(original pass + Round 3); filling remaining gaps (uploading what's still
missing) is the open work.
