# RTP Notebook Ecosystem — User Stories

**Status:** Draft v0.4 (U7 and U10 answered; Phase 0 corrections) · **Date:** 2026-10-03 · "RTP Gem" below means the RTP custom-instruction surface (a Gem today, likely a skill after Google's transition; see 03_ADRs ADR-010). · **Companion docs:** 02_PRD, 03_ADRs, 04_MIGRATION_AND_TEST_PLAN

Priority uses MoSCoW (Must / Should / Could). Acceptance criteria are written Given / When / Then so each one can become a conformance test (see 04).

Tags: **[EXISTING]** behavior router V5.8 already specifies and that must be preserved · **[CHANGED]** existing behavior implemented differently · **[NEW]** behavior that does not exist today.

## Actors

| Actor | Role |
|---|---|
| **Operator** | The human running RTP sessions. Dictates, verifies, and writes. |
| **RTP Gem** | The thinking surface: slim Core Router instructions plus the notebook. Reads, audits, synthesizes. |
| **KOS pipeline (GAS)** | Writes the briefing docs the notebook syncs from. The only writer. |
| **Council persona Gem** | A sequestered single-persona Gem (Seven Bridges). Never sees the RTP notebook. |
| **Maintainer** | The same human in builder mode: edits the repo, deploys docs, runs tests. |

---

## Epic 1 — Startup

**US-01 (Must) [CHANGED] Morning Brief from current state.**
As the Operator, I want `@Startup` to give me a Morning Brief built from the synced primer and live Calendar, Gmail, and Tasks, so I start the day with current context and no manual assembly.
- *Given* the primer's generated-at date is today, *when* I send `@Startup` as the first message, *then* the reply reports the three live fetches and a brief that cites the primer's 90-day vision, Vector State, and shadow-matrix calibration status. Genesis status and open decisions are included once the generators add them (04 Phase 1); the primer does not carry them today.
- *And* no persona documents are bulk-loaded as a "Morning Cache."

**US-02 (Must) [NEW] Visible staleness.**
As the Operator, I want a stale primer to announce itself so I never act on old state unknowingly.
- *Given* the primer's generated-at date is not today, *when* I send `@Startup`, *then* the reply opens with `[PRIMER STALE — generated YYYY-MM-DD]` and still completes the brief.
- No step in the flow may depend on me clicking a manual sync to be correct. Staleness is detected and flagged, not assumed away.
- The primer's heading already carries its date (`DAILY PRIMER — YYYY-MM-DD`), so the check can start there. A silently stale primer has already happened: per the code comments, the daily primer job failed every morning from 2026-09-18 until a body-clearing bug was fixed.

**US-03 (Should) [NEW] Graceful degradation.**
As the Operator, I want a failed live fetch reported by name so I can tell a partial brief from a full one.
- *Given* one of Calendar, Gmail, or Tasks is unavailable, *then* the reply names the failed fetch, labels the brief `PARTIAL`, and continues from the notebook.

## Epic 2 — Turn loop

**US-04 (Must) [CHANGED] Consistent turn frame.**
As the Operator, I want every reply wrapped in the same Pre-Flight and State Sync blocks so routing is always visible and auditable.
- *Given* any prompt after `@Startup`, *then* the reply begins with `[ RTP — PRE-FLIGHT]` and ends with `[ RTP — STATE SYNC]`.
- The V6.0 formats drop the Persona Activity Ledger and Live Fetch lines (V5.8 has them in both blocks; they exist only to manage the Morning Cache). Whether the visible `Turn: [N]` counter stays is a decision to record.

**US-05 (Must) [EXISTING] Correct persona routing.**
As the Operator, I want the persona that is most relevant to lead each turn.
- *Given* RID scores per persona, *then* a score ≥ 0.50 makes that persona Apex Lead and speaks first; 0.25–0.49 shares the response; < 0.25 is suppressed.
- *And* cumulative RID never exceeds 1.0 (the Auditor suppresses the lowest-scoring persona if it does).
- *And* identical scores go to the persona listed first in the Pre-Flight sequence.

**US-06 (Must) [NEW] No improvised personas.**
As the Operator, I want a persona to speak from its actual document, not from the Gem's guess at it.
- *Given* a persona is Apex Lead, *then* the Gem retrieves that persona's document before speaking.
- *If* retrieval returns nothing relevant, *then* the reply says so and does not improvise the persona's voice or laws.

**US-07 (Could) Quieter Pre-Flight.**
As the Operator, I may want Pre-Flight shown only when something is flagged, to cut per-turn output. *Decision pending: this changes an existing contract.*

## Epic 3 — Safety and authority

**US-08 (Must) [EXISTING] HITL firewall.**
As the Operator, I want my voice protected: nothing leaves without my verification.
- *Given* a request to draft an email, message, or public-facing document, *then* the draft appears in chat only and the reply asks for "Verification for Release."
- *And* the Gem never sends via any extension, even if I explicitly instruct it to.

**US-09 (Must) [EXISTING] Welfare pause is unsuppressible.**
As the Operator, I want ALIGNMENT's Mandatory Pause to fire regardless of routing or my own directives.
- *Given* the pause conditions are met, *then* it fires even when RID scoring would suppress ALIGNMENT or when I tell it to skip.
- *And* I may choose to proceed, but I am always asked.
- ALIGNMENT's passive monitor runs every turn (GREEN/YELLOW flag in Pre-Flight) and its four hard thresholds (A Time Encroachment, B Frequency Drift, C Isolation Directive, D Value-Consistency Drift) live only in the persona doc today. They must be carried in the instructions, not left to retrieval.

**US-10 (Must) [EXISTING] Instructions beat notebook.**
As the Maintainer, I want conflicts resolved by the truth hierarchy (Router → PIVOTS_AND_LESSONS → BRAIN_TRUST_INDEX → persona docs).
- *Given* notebook content that contradicts the Gem's instructions, *then* the instructions win and the conflict is flagged in the reply.

**US-11 (Must) [NEW] Data boundary by source selection.**
As the Operator, I want student and district data kept out of the notebook regardless of which account hosts it.
- SMP-004 describes a separate personal account for kos-personal, but the code comments say that is not what exists: kos-personal is deployed on the district (`ccpsnet.net`) account. **U7 answered:** the school (district, `ccpsnet.net`) account hosts the notebook (Operator decision, 2026-10-03), the same account the pipeline runs on. The notebook therefore shares a tenancy with district data, so the reviewed source list is the data boundary.
- No CAS, roster, or student-data document is ever a notebook source. The plan lists the sources and a reviewer checks the list; there is no refusal rule to rely on.

**US-23 (Must) [CHANGED] Verification Gate that works with retrieval.**
As the Operator, I want the Ghost Data Risk and Truncation checks to keep meaning something when documents arrive as retrieved passages instead of full loads.
- *Given* a claim that relies on a document, *then* the reply can name the notebook source it came from.
- *If* a needed document cannot be retrieved, *then* the reply flags it (as `[UNCONFIRMED — Ghost Data Risk]` does today) and does not fill the gap.

**US-24 (Must) [EXISTING] Commands and the SMP loop survive the cut.**
- `@Startup`, `@Closeout`, `@GenesisOverride` and the `@SMP` loop (file in `00_SMP_PROPOSALS` with an ALIGNMENT IMPACT ASSESSMENT, await approval) stay in the instructions. The SMP loop currently exists only in router §7, so deleting §7 would remove it.

## Epic 4 — Closeout and the feedback loop

**US-12 (Must) [EXISTING] Clean closeout.**
- *Given* `@Closeout`, *then* the ALIGNMENT Closeout Scan runs first, then the Curator produces the canonical session JSON, and no other end-of-session artifacts are produced.

**US-13 (Must) Sessions reach the next brief.**
As the Operator, I want what I decided today to show up in tomorrow's brief.
- *Given* a Curator JSON ingested before the daily generation run, *then* the next generated briefing docs reflect it.
- *Freshness target:* no briefing doc is more than 24 hours behind ingested data.

**US-14 (Should) Open decisions persist.**
- *Given* a session with `deferred_decisions`, *then* they appear in the open-decisions doc until marked resolved.

## Epic 5 — Briefing docs (GAS)

**US-15 (Must) Stable, stamped, overwritten in place.**
As the Maintainer, I want each briefing doc updated in place under a stable document ID with a generated-at stamp, so the notebook source never breaks or silently freezes.

**US-16 (Must) Honest data quality.**
As the Operator, I want the primer to disclose data-quality limits so the Gem cannot over-trust the matrix.
- [NEW] The primer gains a data-quality block: `VECTOR_MATRIX` row count, duplicate-session flags, last backfill date, and incubator candidate count. Today it holds only the vision, a name: score Vector State, and the shadow-matrix status.

**US-17 (Should) Fail loudly.**
- *Given* a generator error, *then* it is written to the existing error log and the doc's stamp does not advance, so US-02 fires instead of stale data passing as fresh.

## Epic 6 — Separation of concerns

**US-18 (Must) Council stays sequestered.**
- Each council persona Gem receives only its own persona doc plus `COG_STIMULUS`. The RTP notebook is never attached.

**US-19 (Should) Flows do not depend on the Gem.**
- Studio Flow steps use plain Gemini steps with contract prompts only. Whether any Flow is bound to the RTP Gem today is not established (the 9/29 tracker says the mechanism of the Curator format fix was not recorded), so first record the current bindings.

## Epic 7 — Maintainability

**US-20 (Must) One source of truth.**
- The repo is canonical. A deploy step pushes persona and protocol docs to Drive under their exact filenames. Drive copies are never hand-edited.

**US-21 (Should) Conformance before ship.**
- The conformance suite (04) passes before any router or persona change goes live.

**US-22 (Could) Instruction budget.**
- Router instructions stay at or under roughly 12k characters (an estimate; V5.8 is about 17.5k), checked as part of the deploy step.

---

## Definition of done (per story)
1. Acceptance criteria demonstrated in a real session or a recorded conformance run.
2. Any new rule placed per the split rule in 02_PRD §4 (instructions vs notebook).
3. Repo and Drive copies in sync; version noted in the changelog.

## Epic 8 — Platform transition

**US-25 (Must) [NEW] Survive the Gems-to-skills transition.**
As the Maintainer, I want the RTP setup to keep working when Google retires Gems, so a platform change does not interrupt daily use.
- *Given* the repo `.md` sources, *then* the router and personas can be loaded into either a Gem or a skill without rewriting.
- *And* the target surface is decided and tested before the account's transition date (personal: November 2026; business: no sooner than March 2027; education: no sooner than June 2027).
