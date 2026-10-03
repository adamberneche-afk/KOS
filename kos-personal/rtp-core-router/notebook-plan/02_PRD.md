# RTP Notebook Ecosystem — Product Requirements

**Status:** Draft v0.4 (U7 and U10 answered; Phase 0 corrections 2026-10-03) · **Date:** 2026-10-03

> **Platform note (changes the plan):** Google is retiring Gems in favor of skills. Personal accounts transition in November 2026, Workspace business/enterprise no sooner than March 2027, Workspace education no sooner than June 2027 (see §10). "RTP Gem" in these documents therefore means "the RTP custom-instruction surface": a Gem now, a skill (or notebook instructions) after the transition. ADR-010 covers this. · **Companion docs:** 01_USER_STORIES, 03_ADRs, 04_MIGRATION_AND_TEST_PLAN

## 1. Problem

The RTP Core Router (V5.8) is about 17.5k characters of instructions. About 2.6k of that is version history. Several more kilobytes exist only to manage the "Morning Cache": the six-fetch `@Startup`, the Live Fetch Rule, the turn counter, and the Persona Activity Ledger. Those mechanisms exist because persona documents had to be fetched from Drive by hand and kept from going stale.

Consequences today:
- Instruction bulk competes with the work and is costly to maintain.
- The ledger and cache logic are prompt-level and can drift.
- The Gem's "Vector State" depends on `VECTOR_MATRIX`, which currently contains duplicate session rows and carried-forward ("ghost") values.
- The 9/29 tracker records that Curator output had persona prose in it, that the format problem was apparently fixed that evening, and that the mechanism (Gem instructions, Flow binding, or both) was not written down. Whether any Flow step is bound to the RTP Gem is not established.

## 2. Goals and non-goals

**Goals**
1. Cut the router instructions to the rules that must fire every turn (estimate: roughly 12k characters, down from about 17.5k; see §4).
2. Move reference material into a notebook whose Drive-synced sources update without edits to the Gem.
3. Make GAS the only writer of live context, and the Gem a reader.
4. Make staleness and data-quality limits visible to the Operator.
5. Keep the HITL firewall, truth hierarchy, and ALIGNMENT pause exactly as strong as today.

**Non-goals**
- Changing the persona laws or RID math.
- Letting the Gem write to Drive, send email, or act without verification.
- Fixing the INCUBATOR/promotion design (tracked separately; disclosed in the primer).
- Putting any student or district data into the system.

## 3. Architecture at a glance

```
  Operator ──(session)──► RTP Gem ◄─── Notebook (read-only sources)
     │                      │  ▲              ▲
     │              @Closeout JSON            │ synced from Drive
     ▼                      ▼  │              │
  ingest (paste) ───► GAS pipeline ──► briefing docs (overwritten in place)
                      staging → Curator → CURRENT_STATE, VECTOR_MATRIX
                                 └──► primer / recent sessions / open decisions / core facts

  Studio Flows ─► plain Gemini steps + contract prompts   (never the RTP Gem)
  Council Gems ─► own persona doc + COG_STIMULUS only      (never the RTP notebook)
```

The loop is closed, and the human gate stays at ingest and at every outbound action.

## 4. The split rule: instructions vs notebook

A rule **stays in the instructions** if it (a) applies on every turn regardless of topic, (b) is costly or irreversible to get wrong, or (c) must be reproduced in an exact format. Everything else may live in the notebook. Retrieval is probabilistic, so nothing that must fire every time may depend on it.

| Router content (V5.8) | Measured size | Decision |
|---|---|---|
| Version notes (V5.3 to V5.8) | 2.6k | Remove from the Gem; keep in the repo changelog. Keep out of the notebook (stale-version retrieval risk). |
| Morning Cache paragraph, Live Fetch Rule, Persona Activity Ledger lines (Pre-Flight, Execution, State Sync), Apex live-fetch sentences | ~2k, scattered (the Live Fetch Rule paragraph alone is 0.56k) | Delete. Cache-management only. |
| §7 Execution loop summary | 0.9k | Delete the loop diagram (duplicates §4). **Keep the SMP block (0.2k): the `@SMP` loop is not described anywhere else.** |
| `@Startup` (Phase 1, Morning Cache, Phase 2) | 1.5k | Replace with a stub: read the primer, run the three live fetches. (V5.8 already says Phase 2 should read today's primer when one exists.) |
| Genesis Protocol | 0.8k | Notebook. Keep `@GenesisOverride` in the command list. |
| WRITE_AUTHORITY block | 0.7k | Notebook. |
| Two-Tiered State Audit table | 0.4k | Table to the notebook; keep the one-line Protocol Law (AI = READ/Audit, Human = DICTATE/WRITE/Verify). |
| HITL three rules | 0.5k | **Stays.** |
| Verification Gate (Ghost Data Risk, Truncation Flag) | 0.57k | **Stays**, adapted for retrieved sources (ADR-009). |
| CURRENT_STATE staleness flag | 0.58k | Shorten to one line; details to the notebook. |
| ALIGNMENT interrupt rule | 0.2k | **Stays.** |
| Execution rules (Apex/Support, MUSE routing, CURATOR task, Math-Before-Muse) | 1.85k | **Stay**, trimmed; Math-Before-Muse stays whole. |
| Truth hierarchy and ALIGNMENT exception | 0.8k | **Stays.** |
| Cog registry and RID | 2.4k | **Stays**, trimmed. |
| `@Closeout` | 0.6k | **Stays.** |
| ALIGNMENT core: passive GREEN/YELLOW flag, hard thresholds A to D, pause block format | not in the router today (it lives in the persona doc) | **Add to the instructions** (estimate 1.2k to 1.5k). It runs every turn, so it cannot depend on retrieval. |

Removals (including shrinking `@Startup` and the CURRENT_STATE flag) total roughly 8k to 9k; additions (ALIGNMENT core, staleness and retrieval rules) are about 2k. The router lands around 11k to 12k (estimate), roughly a 30% to 35% cut, not 60%. The larger context saving is elsewhere: today the Morning Cache loads the baseline rules of every active persona at the start of each chat, and on-demand retrieval removes that load.

Measured sizes come from the V5.8 text. Everything marked "estimate" is to be confirmed during the build.

## 5. Notebook source inventory

All sources must be Google Docs (Drive-native) so they can sync. The repo's `.md` files are converted on deploy.

**Tier A — dynamic, written by GAS, overwritten in place under a stable ID**

| Source | Purpose |
|---|---|
| `KOS_LATEST_PRIMER` | Today: onboarding day, 90-day vision, a name: score Vector State, and shadow-matrix calibration status; the heading carries its date. Regenerated daily at 06:00 by `generateDailyPrimer()`. To add (Phase 1): Genesis status and the data-quality block. Doc ID must never change (the code notes the operator holds it by ID in a notebook and in the Gem). |
| `CURRENT_STATE` | Architect-owned structural state; flagged stale after 3 sessions without update. |
| `PIVOTS_AND_LESSONS_V1.0` | Supreme project law (truth hierarchy level 2). |
| `CORE_THESIS` | Sealed personal statement (role, who it serves, relational targets, 90-day vision). Verified: the code combines its text with a salt to generate the Identity Key, and re-running `generateIdentityKey()` after an edit overwrites that key. Reading it as a notebook source is safe; do not edit it casually. |
| Recent sessions (rolling doc) | Latest Curator JSON plus any session with open `deferred_decisions`. |

**Tier B — stable, changed only on version bumps**

- The six `PERSONA_*_V5_1` docs. Each gets a short self-contained "core" block at the top and the persona name in every section heading, so retrieved chunks stay attributable.
- Protocols (read 2026-10-03): `COLD_BOOT_PROTOCOL` (fires only when the Core Asset Record count is 0), `KILL_SWITCH_PROTOCOL` (manual emergency stop; add a one-line pointer in the instructions so it is retrievable on demand), `RULE_CONFLICT_RESOLUTION_PROTOCOL`.
- **Do not add:** `COLD_START_ORIENTATION` (a dated snapshot of one past Cold Boot run, not a living protocol), `HEREDITARY_WATCHLIST` (candidate rules held pending review and explicitly not merged into any live protocol; retrieval could resurrect them as if they were law), `ZONE_SPECIFICATION_MIRROR_MATRIX_FLOW` (planning-methodology reference; its own note says it does not specify anything implemented), and `Drive_Steward_Methodology_and_Prompt` (separate, on-request Gem).
- A "Turn Loop Reference" doc holding the explanatory rules moved out of the router.

**Related need:** ALIGNMENT Threshold D checks decisions against a "CORE FACTS (Operator-Pinned)" block in the session's context injection. The pinned-core-facts doc is the natural source for that block; confirm what supplies it today.

**Excluded:** Studio/Flow contract prompts; `CURRENT_STATE_DRAFT_v2` (sample output); raw session logs and staging sheets; `BRAIN_TRUST_INDEX` and `VECTOR_MATRIX` (until the data fixes in 04 Phase 0 land); anything with CAS, roster, or student data; `COG_STIMULUS`; the white paper and superseded files.

## 6. Requirements

**Functional**
- FR-1 `@Startup` completes in one reply from the primer plus three live fetches.
- FR-2 Every turn has the Pre-Flight and State Sync frame.
- FR-3 The Apex persona's doc is retrieved before it speaks; missing retrieval is stated, not improvised.
- FR-4 HITL, ALIGNMENT pause, and truth hierarchy behave as in V5.8.
- FR-5 Each briefing doc carries a generated-at stamp and the Gem flags staleness (`[PRIMER STALE]`).
- FR-6 `@Closeout` emits one canonical Curator JSON and nothing else.
- FR-7 The Verification Gate (Ghost Data Risk, Truncation Flag) still works when documents arrive as retrieved passages: claims name their source, and an unretrievable document is flagged, not filled in.
- FR-8 ALIGNMENT's passive monitor and hard thresholds A to D run every turn from the instructions.
- FR-9 The `@SMP` loop and `@GenesisOverride` remain available.

**Non-functional**
- NFR-1 No correctness path depends on a manual sync action.
- NFR-2 GAS generators are idempotent and log failures; a failed run must not advance the stamp.
- NFR-3 Repo is canonical; Drive copies are deploy outputs only.
- NFR-4 No student or district data is ever a notebook source; enforced by reviewing the source list. **U7 answered:** the school (district, `ccpsnet.net`) account hosts the notebook (Operator decision, 2026-10-03). SMP-004's separate personal account is not what exists; the primer and notebook live on the same account, so no cross-account sharing is needed.

## 7. Success metrics

| Metric | Target |
|---|---|
| Router instruction size | ≤ ~12k chars (from ~17.5k; estimate) |
| Safety conformance tests (HITL, ALIGNMENT, hierarchy) | 100% pass |
| Other conformance tests | ≥ 90% pass on first run, 100% before ship |
| `@Startup` completes in one reply | Yes, across 5 consecutive runs |
| Stale primer flagged when stale | 100% of test cases |
| Briefing doc age | ≤ 24 h |
| Duplicate session UIDs in `VECTOR_MATRIX` at launch | 0 |

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Retrieval fragments a multi-section persona rule | Persona misbehavior | Persona "core" blocks; attributable headings; conformance tests; fallback to Drive fetch for personas |
| Sync is manual or lags | Stale context | Stamp + `[PRIMER STALE]`; verify in U1 |
| Matrix quality (duplicates, ghost values) | Confidently wrong Vector State | Phase 0 fixes; data-quality block in primer |
| Safety rule moved by mistake | Firewall weakens | The split rule; safety tests are release gates |
| Notebook cannot coexist with extensions in a Gem | `@Startup` fails | Verify U2 before the router rewrite |
| Drive overwrite breaks sync | Silent freeze | Update-in-place only; verify U5 |
| ALIGNMENT's every-turn monitor depends on a retrieved doc | Missed welfare pause | Carry the ALIGNMENT core in the instructions (FR-8) |
| Verification Gate loses meaning with retrieval | Ghost data slips through | ADR-009; FR-7; CT-13 |
| Hosting account is the district account (decided, U7) | Data-boundary and admin-policy exposure; Gems, notebooks or extensions may be restricted | Reviewed source list (NFR-4); test notebooks and extensions on the account before Phase 2; ADR-008 |
| Flow-to-Gem binding (resolved, U10) | None remain: every Flow step is Ask Gemini reading FlowPrompts | Keep it that way; router changes cannot alter Flow output |

## 9. Open questions to verify before building

| ID | Question |
|---|---|
| U1 | Is notebook source sync automatic, or does it need a click? **Answered: automatic (every few minutes), with a manual sync button. See §10.** |
| U2 | Can one Gem use a notebook and the Workspace extensions together? |
| U3 | Source count and size limits; do Sheets sources sync? |
| U4 | Does retrieval preserve multi-section persona rules? |
| U5 | Does a GAS in-place Doc update sync cleanly? |
| U6 | Do tables and code blocks survive `.md` to Google Doc conversion? |
| U7 | Which Google account hosts the Gem and notebook (personal or the district `ccpsnet.net` account), and does that tenancy allow Gems, notebooks, and the extensions? **Answered: the school account; see §10.** |
| U8 | Under retrieval, what do "Active Files in Context" and the truncation check mean in practice? |
| U9 | Are the notebook and Gem already attached to `KOS_LATEST_PRIMER` as the code notes describe? |
| U10 | What changed for the 9/29 Curator format fix, and are any Flow steps bound to the RTP Gem? **Answered; see §10.** |

## 10. Verification results (2026-10-03)

Sources: Google's current Help Center and Workspace admin pages (cited in the conversation), the repo, and a read-only look at the Drive account connected to the assistant. Items marked **needs your test** cannot be settled from documentation.

| ID | Result |
|---|---|
| U1 sync | **Answered.** Drive-sourced notebook sources auto-update every few minutes; a manual "sync with Drive" control exists. Keep the `[PRIMER STALE]` check anyway. |
| U2 notebook + extensions in one Gem | **Not documented.** Gems can take a notebook as knowledge; Connected Apps (Gmail, Calendar, Tasks, Drive) are mention-driven per conversation; skills are documented as compatible with Connected Apps. **Needs your test** on the real surface. |
| U3 limits | **Answered.** Notebook: up to 50 sources per the education Classroom help (paid tiers reportedly higher, per secondary sources). Gem: about 10 knowledge files. Docs, Slides (up to 100 slides) and Sheets (up to 100k tokens) are supported; multi-tab Docs and Sheets import as one source; comments and footnotes are not imported. |
| U4 retrieval fidelity | **Needs your test** (CT-11, CT-13). Documentation says only that notebook sources are used as references. |
| U5 in-place update | **Likely, not documented for API writes.** Drive-backed sources re-sync from the Drive file; verify with one generator write. |
| U6 conversion | **Changes with the surface.** Skills accept `.md` directly (no `.docx`); notebooks take Google Docs from Drive. |
| U7 account | **Answered (Operator, 2026-10-03): the school account (`ccpsnet.net`) hosts the notebook**, the same account the pipeline and primer run on. Whether its admin policy allows notebooks and the extensions still **needs your test**. Earlier finding, for the record: The Drive connected to the assistant is the personal account: it holds a May 2026 KOS scaffold and older Gem-era documents, and only a code file shared from the district account. No V5.1 persona docs, router, primer, or `COG_STIMULUS` are in it, so the live pipeline (consistent with the code comment) runs on the district account. Which account hosts the Gem is not visible from here. |
| U8 Active Files under retrieval | **Needs your test.** |
| U9 primer attached? | **Cannot verify from here:** the primer is not in the connected Drive account. |
| U10 Flow bindings / 9/29 fix | **Answered.** Until about 20:30 on 9/29 the Curator flow's steps 3 and 5 were "Ask a Gem" steps; that Gem produced the old RTP layout (`schema_version 5.0`, `build_state`, numeric `vector_weights`). They were replaced with Ask Gemini steps that read their prompts from the FlowPrompts tab, and the Curator trigger, which had been bound to the `VectorClassifyInput` sheet, was rebound to `CuratorInput`. The classify flow already used Ask Gemini. No Flow step is bound to the RTP Gem now. Repo fixes from the same week: PRs #63–#66 (Curator payload normalising, Studio link unwrapping, prompt trailers). New Studio flows can no longer add an "Ask a Gem" step in any case. |

**Findings that change the plan**
1. **Gems are retiring** (ADR-010).
2. **The Drive copies of the two highest-ranked project documents are essentially empty** in the connected account: `PIVOTS_AND_LESSONS_V1.0` holds one active pivot and an archive stub, and `CURRENT_STATE` is the unfilled template, unmodified since 2026-05-12. If the Gem reads these (or copies of them), the truth hierarchy's level 2 and the CURRENT_STATE staleness flag are working from placeholders. Confirm which copies the Gem actually reads.
3. **Cross-account access:** resolved by U7. The notebook is on the school account with the primer, so nothing has to be shared across accounts.
4. **Ghost values in `VECTOR_MATRIX` had a specific cause** (see 04 Phase 0.3): a theme a session scored 0 was written as the previous row's value × 0.92, and the previous row was a different session in backfill order.
