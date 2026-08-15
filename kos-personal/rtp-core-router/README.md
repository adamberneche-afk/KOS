# rtp-core-router/

The 7 persona "cog" docs plus the Core Router spec itself — the prompt-level
specifications pasted into Workspace Studio flows for the sequestered
council review (`triggerCouncilSimulation()` / `sevenBridgesReview()` in
`kos-personal/6_Governance.gs` / `9_UI_Diagnostics.gs`). Nothing in this
directory is executable code — see `kos-personal/README.md`'s own
assessment of how much of the documented council design is actually wired
up versus still prose.

| File | Status |
|---|---|
| `PERSONA_ARCHITECT_V5.pdf` | Canonical — only version present |
| `PERSONA_AUDITOR_V5.md` | Canonical — only version present |
| `PERSONA_ALIGNMENT_V5.md` | Canonical — only version present |
| `PERSONA_MUSE_V5.pdf` | Canonical — only version present |
| `RTP_CORE_ROUTER_V5_5.pdf` | Canonical — only version present |
| `PERSONA_CURATOR_V5.md` | **Canonical, confirmed.** Its schema (`schema_version: "5.0"`, `dynamic_state.deferred_decisions`, `session_delta`, `build_state`) matches the live pipeline exactly — `3_Queue_Processor.gs` reads `pd.dynamic_state?.deferred_decisions` and `pd.session_delta?.smp_proposals_filed` verbatim, fields that only exist in this file. Previously `PERSONA_CURATOR_V5.pdf`; re-saved as Markdown after diffing a clean-source copy against the PDF's extracted text (98% raw match, 100% after normalizing PDF-extraction artifacts — curly quotes, dropped emoji, collapsed checkbox/code-fence syntax — zero substantive content differences). PDF retired; Markdown is more maintainable and matches `PERSONA_DEVELOPER_V5_3.md`'s format. |
| `archived/PERSONA_CURATOR_v5.3.pdf` | **Superseded — confirmed stale, despite the higher version number.** Extracted its text (via `pdfminer.six`) and compared schemas directly: it's a much shorter (2,395 vs. 17,293 chars), simplified draft with a different, smaller schema (`session_summary`/`vector_weights`/`dynamic_state.next_steps`/`dynamic_state.pivots_and_lessons`/`action_exhaust` — no `deferred_decisions`, no `session_delta`, no `build_state`). None of that matches what the live code actually reads. The naming (`v5.3` reading as newer than `V5`) is misleading here — don't infer canonicality from the version number alone; the schema-vs-code check is what actually settled it. Moved to `archived/` so it doesn't sit next to its canonical replacement one accidental copy-paste away from a live Studio flow. |
| `PERSONA_DEVELOPER_V5_3.md` | **Canonical, confirmed.** Its Section 14 ("Session Artifact Protocol") explicitly hands off `build_state`/`session_delta` to the Curator's schema — consistent with the confirmed-live `PERSONA_CURATOR_V5.md` above. |
| `archived/PERSONA_DEVELOPER_V5.pdf` | **Superseded, confirmed.** Its Section 14 ("README & Changelog Protocol") has the Developer producing independent `[README UPDATE]`/`[CHANGELOG ENTRY]` blocks — the older, pre-consolidation design the Curator's own canonical schema says no longer applies ("The Developer's CHANGELOG and Architect's README no longer exist as independent artifacts"). Same section number, same position in both documents, genuinely different content — not just a reformat. Moved to `archived/`, same reasoning as the Curator draft above. |

Both pairs were fully resolved (not guessed) by extracting PDF text with
`pdfminer.six` and cross-checking each candidate's internal schema
against what `kos-personal/*.gs` actually reads at runtime. The earlier
version of this table guessed canonicality from version numbers alone
and got the Curator pair backwards — `v5.3` looked newer but was
actually the abandoned draft. Both superseded files now live in
`archived/` alongside `PERSONA_ALIGNMENT_EARLY_DRAFT.pdf` — treat
anything in that folder as historical reference only; do not paste it
into a live Studio flow.
