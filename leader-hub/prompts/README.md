# LeaderHub prompts

Every prompt LeaderHub runs, one `.md` each. Moved here from the system's
root on 2026-11-21 (structure audit 3.12).

The six AI flow prompts are the source of truth for `AiPrompts.gs`: edit the
`.md`, then run `node tools/leader-hub/generate-ai-prompts.js` (`--check`
reports drift), which copies everything after each file's first `---` line.

| Prompt | Constant in `AiPrompts.gs` |
|---|---|
| `EMAIL_COMPOSE_FLOW_PROMPT.md` | `AI_PROMPT_EMAIL_COMPOSE` |
| `ARCHIVE_INSIGHTS_FLOW_PROMPT.md` | `AI_PROMPT_ARCHIVE_INSIGHTS` |
| `WBL_INSIGHTS_FLOW_PROMPT.md` | `AI_PROMPT_WBL_INSIGHTS` |
| `LP_ASSIST_FLOW_PROMPT.md` | `AI_PROMPT_LP_ASSIST` |
| `FIN_ANALYSIS_FLOW_PROMPT.md` | `AI_PROMPT_FIN_ANALYSIS` |
| `BRAG_EMAIL_FLOW_PROMPT.md` | `AI_PROMPT_BRAG_EMAIL` |

`LEADERHUB_GEM_PROMPT.md` is not generated into code: the operator pastes it
into the LeaderHub Gem's Instructions field, as the file says.
