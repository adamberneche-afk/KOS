# kos-personal prompts

Every Studio flow prompt kos-personal runs, one `.md` each: the source of
truth (`meta/FLOW_DOCTRINE.md` rule 16). Moved here from the system's root
on 2026-11-21 (structure audit 3.12). Edit the `.md`, then run
`node tools/kos-personal/generate-flow-prompts.js`, which writes
`16_FlowPrompts.gs`; push, and paste nothing into Studio by hand.

| Prompt | Constant in `16_FlowPrompts.gs` |
|---|---|
| `CURATOR_PROMPT.md` | `CURATOR_SYSTEM_PROMPT` |
| `VECTOR_CLASSIFY_PROMPT.md` | `VECTOR_CLASSIFY_SYSTEM_PROMPT` |
| `CURATOR_AUDITOR_PROMPT.md` | `CURATOR_AUDITOR_SYSTEM_PROMPT` |
| `REGISTRAR_STAGE1_AUDITOR_PROMPT.md` | `REGISTRAR_STAGE1_SYSTEM_PROMPT` |
| `REGISTRAR_STAGE2_CURATOR_PROMPT.md` | `REGISTRAR_STAGE2_SYSTEM_PROMPT` |
| `VECTOR_ITEM_LABEL_PROMPT.md` | `VECTOR_ITEM_LABEL_SYSTEM_PROMPT` |
