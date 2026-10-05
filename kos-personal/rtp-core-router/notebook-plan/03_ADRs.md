# RTP Notebook Ecosystem — Architecture Decision Records

**Status of all records:** Proposed · **Version:** v0.5 (ADR-010 Instructions limit) · **Date:** 2026-10-05

Each record: context, decision, consequences. Change the status to Accepted or Rejected as you decide.

---

## ADR-001 — GAS writes, the Gem reads

**Context.** Today the Gem fetches live Drive documents inside its own turn loop and keeps a Morning Cache and a Persona Activity Ledger in the prompt. Prompt-level lifecycle logic has already caused inconsistency once: V5.6 consolidated it because `@Startup` ran unevenly when its procedure was split across about 250 lines.

**Decision.** GAS is the only writer of live context. It regenerates a small set of briefing docs in place; the notebook syncs them; the Gem only reads.

**Consequences.**
- (+) Deterministic work stays in code (Math-Before-Muse).
- (+) Fetch, cache, and ledger logic leaves the instructions.
- (−) Freshness now depends on generator reliability, so US-17 (fail loudly) and the staleness stamp are required.
- (−) Gem-side changes can no longer be "corrected" by the Gem rewriting a doc; the write path stays human, via ingest.

---

## ADR-002 — The split rule for instructions vs notebook

**Context.** Moving rules into a retrieved notebook saves instruction space, but retrieval is probabilistic.

**Decision.** A rule stays in instructions if it applies every turn, is costly or irreversible to get wrong, or needs an exact format. Everything else may move.

**Consequences.**
- (+) Gives a repeatable test for every future rule, not a one-off cut.
- (+) The HITL core, the Verification Gate, ALIGNMENT's passive monitor and hard thresholds (they run every turn, and today live only in the persona doc, so they move into the instructions), the truth hierarchy, the RID formula, the turn-frame formats, the `@SMP` loop, and `@Closeout` remain guaranteed.
- (−) Some borderline rules (for example Genesis details) will need judgment; record the call in the changelog.

---

## ADR-003 — Flows do not depend on the RTP Gem

**Context.** The 9/29 tracker records persona prose in Curator output, an apparent fix that evening, and no record of the mechanism. It notes the 9/28 view that the prose may come from the RTP Gem's own instructions. Whether any Flow step is bound to the RTP Gem is not established.

**Decision.** First record the current bindings. Then, as a precaution, Flow steps use plain Gemini steps (or a dedicated contract-only Gem) with the contract prompt alone.

**Consequences.**
- (+) Removes a plausible cause of non-JSON output.
- (+) Flow behavior no longer changes when the router changes.
- (−) Some Flows may need prompt adjustments once the router's influence is removed; re-baseline their outputs.
- (−) If no Flow is bound to the Gem today, this ADR only formalizes the status quo.

---

## ADR-004 — Council Gems stay sequestered

**Context.** The Seven Bridges review depends on personas judging independently against a shared stimulus.

**Decision.** Each council persona Gem receives only its own persona document plus `COG_STIMULUS`. The RTP notebook is never attached to them.

**Consequences.**
- (+) Preserves independence; prevents cross-persona contamination.
- (−) Sequestration is operator discipline, not code. Add a checklist item to each council run.

---

## ADR-005 — Repo is the single source of truth

**Context.** Persona and protocol docs are Drive documents by exact filename (the deploy step copies them by name), and notebook sources must be Drive-native docs to sync.

**Decision.** Edit in the repo. A deploy step converts and pushes docs to Drive under their exact filenames. Drive copies are never hand-edited.

**Consequences.**
- (+) Version control and review for every persona or protocol change.
- (+) The slim router's size can be checked at deploy time.
- (−) Needs a reliable `.md`-to-Doc conversion (U6) and a defined step for first-time source creation, since sync only follows existing files.

---

## ADR-005b — Stable-ID, overwrite-in-place for briefing docs

**Context.** A notebook source only follows an existing Drive document. A new dated file each day would never be picked up. `KOS_LATEST_PRIMER` already follows this pattern.

**Decision.** Every Tier A briefing doc keeps one stable document ID and is rewritten in place, with a generated-at stamp at the top.

**Consequences.**
- (+) Sync continuity.
- (−) No history inside the doc; keep history in the repo or an archive folder, never in the notebook.
- (−) Must verify an in-place API update syncs cleanly (U5).

---

## ADR-006 — Staleness is detected, not assumed away

**Context.** Notebook sync behavior is unverified, and a silent stale primer has already happened: per the code comments, the daily primer job failed every morning from 2026-09-18 until a body-clearing bug was fixed. A design that works only if someone remembers to sync, or only if the generator never fails, will fail silently.

**Decision.** The primer carries a generated-at stamp. The instructions require the Gem to compare it with today's date and print `[PRIMER STALE — generated YYYY-MM-DD]` when they differ. A failed generator run must not advance the stamp.

**Consequences.**
- (+) Correct whether sync is automatic, delayed, or manual.
- (+) Turns a silent failure into a visible one.
- (−) Slightly more instruction text and one more generator responsibility.

---

## ADR-007 — Briefing docs disclose data quality

**Context.** The Gem's Vector State is derived from `VECTOR_MATRIX`. A review found duplicate rows (the same content classified under two session UIDs), carried-forward values that look like real scores, and an incubator signal that cannot be non-zero in practice.

**Decision.** The primer includes a data-quality block: matrix row count, duplicate-session flags, last backfill date, and incubator candidate count. The Gem must qualify Vector State when flags are present.

**Consequences.**
- (+) The Gem cannot confidently brief on data the system itself knows is shaky.
- (−) Requires generator work; the underlying fixes (04 Phase 0) are still the real remedy.

---

## ADR-008 — Host on the school account; enforce the data boundary by source selection

**Status:** Accepted (2026-10-03). U7 answered: the school (`ccpsnet.net`) account hosts the notebook.

**Context.** SMP-004 describes kos-personal on a separate personal Google account. A code comment says that is not what exists: kos-personal is deployed on the district (`ccpsnet.net`) account, where GCP access is disabled org-wide. If the Gem and notebook live there, they share a tenancy with district data, and district admin policy may restrict Gems, notebooks, or extensions.

**Decision.** The notebook is hosted on the school account, alongside the pipeline and the primer. Keep student and district data out of the notebook by maintaining an explicit source list that is reviewed before any source is added.

**Consequences.**
- (+) The data boundary does not depend on which account is correct.
- (+) The primer and briefing docs need no cross-account sharing.
- (−) The notebook shares a tenancy with district data; the reviewed source list is the only boundary.
- (−) If the district account blocks notebooks or extensions, the design needs a different host or a reduced scope.

---

## ADR-009 — Adapt the Verification Gate for retrieved sources

**Context.** V5.8's Verification Gate has two checks: flag any Active File not confirmed in the context window (`[UNCONFIRMED — Ghost Data Risk]`), and flag a loaded document that ends mid-sentence (`[TRUNCATION SUSPECTED]`). Both assume whole documents are loaded. A notebook returns passages, so "ends mid-sentence" no longer detects anything meaningful.

**Decision.** Keep the Gate in the instructions. Reword it for retrieval: claims that rely on a document must name the notebook source; if a needed document or section cannot be retrieved, flag it as unconfirmed and do not fill the gap. Retire the mid-sentence truncation check for notebook sources.

**Consequences.**
- (+) The integrity rule survives the move instead of silently becoming a no-op.
- (−) The exact wording needs a test (CT-13) and a decision on what "Active Files in Context" lists under retrieval (U8).

---

## ADR-010 — Build for skills, not Gems

**Context.** Google's current Help pages say Gems are being replaced by skills: personal accounts transition in November 2026, Workspace business, enterprise, and non-profit accounts in March 2027 (no sooner than March 1), and education accounts in June 2027 (no sooner than June 1). Remaining Gems auto-migrate to draft skills. Skills are currently available only to people 18+ on a personal Google account with Keep Activity on (work and school accounts "soon"). Reference files are added only by uploading them with the skill; Drive files and Gemini Notebook notebooks are promised "in the coming weeks." Editing a skill's files means re-uploading the whole skill. `.md` is accepted, `.docx` is not. Skills work with Connected Apps; Canvas and Deep Research do not work with skills yet.

**Decision.** Treat the RTP Gem as a short-lived container. Keep the router, personas, and protocols as repo `.md` files so they can be pasted into a Gem today and uploaded as a skill later. Do not invest in Gem-specific structure. Re-run the Phase 0 verifications against the surface actually chosen (Gem, skill, or Gemini-app notebook with its own Instructions field).

**Consequences.**
- (+) The repo-as-source-of-truth decision (ADR-005) already fits: `.md` uploads to skills without conversion.
- (+) The slim router (ADR-002) fits a skill's "keep it concise" guidance better than 17.5k of instructions.
- (−) Notebook-in-skill is not available yet; the notebook-backed design may need to wait for it, or use the Gemini-app notebook's own Instructions field (capped at 10,000 characters; 02_PRD §10 finding 5).
- (−) A skill's reference files are static uploads until Drive/notebook sources arrive, which weakens the "dynamic data" goal; the primer would need to be attached via notebook, not file.
- (−) Education accounts keep Gems longest (June 2027) but get skills last; account choice (ADR-008) now drives which surface is available.
