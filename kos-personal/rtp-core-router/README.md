# rtp-core-router/

The 6 persona "cog" docs plus the Core Router spec itself (7 files total —
see the "V5.1" note below on why that's not "7 personas") — the
prompt-level specifications each persona's own Gemini Gem is configured
with for the real sequestered council review ("Seven Bridges," SMP-002).
`triggerSevenBridgesReview()`/`compileCouncilVerdict_()` (both in
`kos-personal/6_Governance.gs`) and `submitCogVerdict()`
(`kos-personal/2_Ingestion_Sensors.gs`) are the actual, current execution
layer this feeds — `9_UI_Diagnostics.gs`'s `sevenBridgesReview()` is only
the menu wrapper that compiles verdicts already submitted, not a stimulus
generator itself. `triggerCouncilSimulation()` (also in `6_Governance.gs`)
is a different, explicitly-**superseded** shared-context shortcut, kept
only for reference — not interchangeable with the real pipeline above.
Nothing in this directory is executable code — see `kos-personal/README.md`'s
"Architecture in Two Paragraphs" section for how the built pipeline
actually works today.

## A note on "V5.1" before reading the table below

**"V5.1" is a reissue-pass tag, not a sequence number that increases
monotonically from whatever came before it.** All six persona docs below
were reissued together at that tag as one pass (folded in from an
external review pass — Addendum 22 R6): duplicate JSON Execution Schema
sections removed (~20% average size reduction), plus document-specific
fixes (Auditor's duplicated RID rubric trimmed to a citation, Developer's
duplicate header and scrambled section numbering fixed, Curator's stale
`rtp_version` field updated, Alignment's `known_friction_points` field
salvaged into prose before its old schema section was removed). For five
of the six, "V5.1" is also numerically higher than what it replaces
("V5"), so nothing about the ordering looks surprising. **Developer is the
one exception, and reading it as "must be older" would be exactly wrong:**
the file it replaced was `PERSONA_DEVELOPER_V5_3.md` — a *higher* number
holding the *older*, less-correct content, once again the same "looks
newer, is actually the stale one" trap already documented below for the
original Curator pair. Don't infer canonicality from any of these version
numbers alone; the table's own verification notes are what actually
settled each one.

**`archived/` was removed from the working tree** (external product
review, Finding 3 / "this month" dead-code cleanup). Every "reissued
from"/"superseded by" claim in the table below is unchanged and still
true as history — it describes what was actually compared and why a file
was judged canonical or stale — but the archived file itself no longer
exists in this directory. Nothing is lost: the full pre-deletion tree,
including every file named below, is preserved on the
`pre-archive-cleanup` branch.

| File | Status |
|---|---|
| `PERSONA_ARCHITECT_V5_1.md` | Canonical — only version now current (reissued from `archived/PERSONA_ARCHITECT_V5_SUPERSEDED.pdf`) |
| `PERSONA_AUDITOR_V5_1.md` | Canonical — duplicated RID rubric table trimmed to a citation of Core Router V5.7 §3 (reissued from `archived/PERSONA_AUDITOR_V5_SUPERSEDED.md`) |
| `PERSONA_ALIGNMENT_V5_1.md` | Canonical — `known_friction_points` salvaged into new prose §3.3 before the old duplicate JSON schema section was removed (reissued from `archived/PERSONA_ALIGNMENT_V5_SUPERSEDED.md`) |
| `PERSONA_MUSE_V5_1.md` | Canonical — only version now current (reissued from `archived/PERSONA_MUSE_V5_SUPERSEDED.pdf`) |
| `RTP_CORE_ROUTER_V5_8.md` | Canonical. Three-revision chain from the prior canonical V5.5: **V5.6** consolidated a fragmented `@Startup` sequence into one section; **V5.7** flipped the Apex Lead default from always-live-fetch to cache-unless-stale (a persona issues a live fetch only if it hasn't responded within the last 10 turns); **V5.8** updated persona-doc citations to V5.1. Intermediate drafts kept for history: `archived/RTP_CORE_ROUTER_V5_6_SUPERSEDED.md`, `archived/RTP_CORE_ROUTER_V5_7_SUPERSEDED.md`, `archived/RTP_CORE_ROUTER_V5_5_SUPERSEDED.pdf`. |
| `PERSONA_CURATOR_V5_1.md` | **Canonical.** Its schema (`schema_version: "5.0"`, `dynamic_state.deferred_decisions`, `session_delta`, `build_state`) matches the live pipeline exactly — `3_Queue_Processor.gs` reads `pd.dynamic_state?.deferred_decisions` and `pd.session_delta?.smp_proposals_filed` verbatim, fields that only exist in this document's lineage. Stale `rtp_version` field ("5.3") updated to "5.8" to match the Core Router above. Reissued from `archived/PERSONA_CURATOR_V5_SUPERSEDED.md` (itself previously re-saved from a PDF — see that file's own history if needed). |
| `archived/PERSONA_CURATOR_v5.3.pdf` | **Superseded — confirmed stale, despite the higher version number.** Extracted its text (via `pdfminer.six`) and compared schemas directly: it's a much shorter (2,395 vs. 17,293 chars), simplified draft with a different, smaller schema (`session_summary`/`vector_weights`/`dynamic_state.next_steps`/`dynamic_state.pivots_and_lessons`/`action_exhaust` — no `deferred_decisions`, no `session_delta`, no `build_state`). None of that matches what the live code actually reads. The naming (`v5.3` reading as newer than `V5`) is misleading here — don't infer canonicality from the version number alone; the schema-vs-code check is what actually settled it. |
| `PERSONA_DEVELOPER_V5_1.md` | **Canonical** (see the note above the table — its version number is *lower* than what it replaces, on purpose). Duplicate "§4. THE CONFIDENCE INTERVAL ENGINE (CIE)" header removed; section numbering (which previously skipped §12 and stranded "Operating Principles Summary" as §15 after §16) corrected. Its Section 14 ("Session Artifact Protocol") still hands off `build_state`/`session_delta` to the Curator's schema — consistent with the confirmed-live `PERSONA_CURATOR_V5_1.md` above. Reissued from `archived/PERSONA_DEVELOPER_V5_3_SUPERSEDED.md`. |
| `archived/PERSONA_DEVELOPER_V5_3_SUPERSEDED.md` | Superseded by `PERSONA_DEVELOPER_V5_1.md` above — see the note at the top of this table for why the numbers run backwards. |
| `archived/PERSONA_DEVELOPER_V5.pdf` | **Superseded, confirmed** (this was already archived before the V5.1 reissue). Its Section 14 ("README & Changelog Protocol") has the Developer producing independent `[README UPDATE]`/`[CHANGELOG ENTRY]` blocks — the older, pre-consolidation design the Curator's own canonical schema says no longer applies ("The Developer's CHANGELOG and Architect's README no longer exist as independent artifacts"). Same section number, same position in both documents, genuinely different content — not just a reformat. |

The two persona pairs referenced above were fully resolved (not guessed)
by extracting PDF text with `pdfminer.six` and cross-checking each
candidate's internal schema against what `kos-personal/*.gs` actually
reads at runtime. The earlier version of this table guessed canonicality
from version numbers alone and got the Curator pair backwards — `v5.3`
looked newer but was actually the abandoned draft; the Developer
V5.1-vs-V5.3 situation above is the same trap in reverse (the lower
number is the correct one this time). Every superseded file, alongside
`PERSONA_ALIGNMENT_EARLY_DRAFT.pdf`, lived in `archived/` — removed now
per the note above the table; retrievable from the `pre-archive-cleanup`
branch, historical reference only, never something to paste into a live
Studio flow.
