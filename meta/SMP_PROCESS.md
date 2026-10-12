# System Modification Proposals (SMPs): where they live and how they're processed

An SMP is a standing rule about how the KOS, CAS and LeaderHub systems
change or behave: who may write what, what a session may do, how a
pipeline works. This doc says where SMPs are stored, how a new one is
numbered and filed, and how the KOS Claude Project reads them. Set up on
2026-10-12, when the SMPs were found spread across two Drive folders, the
`Blackboard` tab, session logs and the repo, with numbers reused (sessions
had filed nine different proposals as "SMP-001").

## Where SMPs are stored

| What | Where | Who writes it |
|---|---|---|
| **The register** (the one list) | `SMP_REGISTER` tab in BRAIN_TRUST_INDEX | The operator |
| **Full text**, when an SMP has more than its one-line rule | `01.3_SMP_PROPOSALS` in Drive, one Google Doc per SMP, named `SMP-NNN_TITLE` | The operator (or the KOS Project, when directed under SMP-018) |
| **What the Project reads** | `KOS_SMP_REGISTER`, a Google Doc rewritten every morning from the tab by `generateBriefingDocs_()` (`kos-personal/22_BriefingDocs.gs`) | Apps Script only |
| **Proposals not yet filed** | `Blackboard` tab, rows tagged `SMP-NEW`, status `STAGED_FOR_REVIEW` | The pipeline (`3_Queue_Processor.gs`), from session logs |

An SMP that isn't in `SMP_REGISTER` is not in force, whatever a session,
persona doc or older document says. SMPs are **not** stored as files in the
Claude Project's knowledge or as copies in this repo: a partial copy reads
as the whole set. The repo cites SMPs by number and keeps only the code that
renders the register.

`SMP_REGISTER` columns: `SMP_ID`, `Title`, `Status` (`APPROVED`,
`PENDING`, `NEEDS_REVIEW`, `SUPERSEDED`, `DROPPED`), `Rule` (one or two
lines), `Filed_At`, `Decided_At`, `Doc_URL`, `Former_IDs` (numbers it went
by before), `Notes`. The header row is `CFG.SMP_REGISTER_HEADERS`
(`kos-personal/1_Config_And_Deploy.gs`).

## How an SMP is processed

1. **Proposed in a session.** RTP drafts it (the `@SMP` loop: the change,
   and an ALIGNMENT IMPACT ASSESSMENT when it touches protected time). The
   session log carries it; the Curator flow records it under
   `session_delta.smp_proposals_filed`.
2. **Staged, unnumbered.** The queue processor writes it to `Blackboard` as
   `SMP-NEW`. A number the session gave it is kept only as "proposed as" in
   the row's notes and is never used.
3. **Decided by the operator.** Verification for Release, in a session or
   by hand. Nothing is in force before this step.
4. **Numbered and filed.** The operator runs `nextSmpId()` (kos-personal
   Apps Script editor) for the next number, adds the row to
   `SMP_REGISTER`, and, if there is full text, files it in
   `01.3_SMP_PROPOSALS` as `SMP-NNN_TITLE` with its `Doc_URL` in the row.
   Under SMP-018 the KOS Project may make these writes when the operator
   directs them, through its show-then-confirm gate.
5. **Read.** The next morning's `KOS_SMP_REGISTER` lists it. The Project
   opens that doc by link (its instructions, section 2) and cites SMPs by
   register number.

To retire an SMP, set its status to `SUPERSEDED` (say by what in `Notes`)
or `DROPPED`. Never reuse a number.

## The renumbering of 2026-10-12

The four SMPs cited by number across the repo and Drive keep their numbers
(001–004). Every other proposal on record was numbered from 005 in the
order it was first filed. `Former_IDs` in the register keeps each old
number.

| Now | Title | Was |
|---|---|---|
| SMP-001 | CE Naming Convention | SMP-001 (doc `CE_NAMING_CONVENTION_SMP001`, moved into `01.3_SMP_PROPOSALS`) |
| SMP-002 | Seven Bridges Reconciliation Protocol | SMP-002 |
| SMP-003 | Cold Boot Protocol | SMP-003 |
| SMP-004 | Automation air-gap | SMP-004 |
| SMP-005 | Four-Bridge Master PRD as SOP | SMP-005 (2026-09-11) |
| SMP-006 | CCPS-Aligned KOS PRD Template | SMP-003 (2026-09-11) |
| SMP-007 | Master KOS PRD Template (Tri-Directional Bridge) | SMP-004 (2026-09-11) |
| SMP-008 | Vector Promotion Engine and Quantitative Matrix | SMP-001 (seven filings) |
| SMP-009 | Direct-Routing Taxonomy and Provenance Protocol | SMP-001 (2026-09-14) |
| SMP-010 | Recursive Startup Protocol v5.4 | SMP-002, CE-SMP-v5.4 |
| SMP-011 | Structural Gmail Refactor | SMP-002 (2026-09-15) |
| SMP-012 | Governance Engine CI/CD Pipeline | CE-SMP: Governance Engine v1.1, SMP-XXX |
| SMP-013 | Smart Drop Zone Intake | SMP-003 (2026-10-01) |
| SMP-014 | Enterprise Migration | SMP-006 (2026-10-01) |
| SMP-015 | The Supremacy of Law and Verification Mandate | SMP-002 (Revision 2, 2026-10-03) |
| SMP-016 | Core Router v5.4: Air-Gap and Sovereign Console Protocol | SMP-002 (2026-10-03) |
| SMP-017 | Display Envelope Isolation Protocol | SMP-004 (2026-10-04) |
| SMP-018 | RTP Directed Writes | SMP-005 (2026-10-12) |

Statuses are copied from the records (`Blackboard`, the docs), not
decided here. `NEEDS_REVIEW` marks two the operator should confirm:
SMP-001 (the doc has no approval line) and SMP-004 (its filed text wasn't
found; the rule in the register is reconstructed from how the repo cites
it). Several `PENDING` and Gem-era rows carry a note that they are likely
superseded by the Claude Project; marking them `SUPERSEDED` is the
operator's call.

Older docs in this repo that say "SMP-005" for directed writes, or
"`00_SMP_PROPOSALS`" for the folder, predate this; the register and this
doc win.
