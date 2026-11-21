# cas-ccps prompts: where each one comes from

Created 2026-11-21 (structure audit 3.12). The audit asked for one `prompts/`
folder per system with the `.md` as the source. In cas-ccps only the Family
Mail Sentinel's prompt is a standalone `.md`, so it lives here. The Studio flow
prompts are sections of the design doc each flow is built from, and Flow 2's
is a constant in a deployed file. Moving those would split a design from its
prompt, or rewrite a deployed source, for tidiness. So they stay where they
are, and this table is the one place that says where each one is.

| Prompt | Source of truth | Generator | Deployed as |
|---|---|---|---|
| Family Mail triage | `FAMILY_MAIL_TRIAGE_PROMPT.md` (here) | `tools/cas-ccps/generate-family-mail-prompt.js` | `61_FamilyMailPrompt.js`, `FAMILY_MAIL_TRIAGE_PROMPT` |
| Flow 1 (rubric extraction) | `cas-ccps/docs/RUBRIC_EXTRACTION_FLOW.md` | `tools/cas-ccps/generate-flow-prompts.js` | `40_FlowPrompts.js`, `FLOW_1_PROMPT` |
| Flow 2 (student evaluation) | `cas-ccps/scripts/15b_StudioFlowPrompts_Flow2_Revised.js`, `FLOW_2_SYSTEM_PROMPT` | none: it is the deployed constant | read by 15c and 40 |
| Flow 3 (warm-ups, modes A, B, C) | `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html` | `tools/cas-ccps/generate-flow-prompts.js` | `40_FlowPrompts.js`, `FLOW_3_PROMPT_MODE_*` |
| Flow 4 (warm-up scoring) | `cas-ccps/docs/CAS_Flow3_Flow4_Specification.html` | `tools/cas-ccps/generate-flow-prompts.js` | `40_FlowPrompts.js`, `FLOW_4_PROMPT` |
| Flow 6 (turn-in check) | `cas-ccps/docs/TURN_IN_CHECK_FLOW.md` | `tools/cas-ccps/generate-flow-prompts.js` | `40_FlowPrompts.js`, `FLOW_6_PROMPT` |

Edit the source, run its generator (`--check` reports drift), push, then run
`syncFlowPromptsToSheet()` so Studio reads the new text (`meta/FLOW_DOCTRINE.md`
rule 16).
