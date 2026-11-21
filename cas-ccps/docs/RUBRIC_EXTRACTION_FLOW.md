# Flow 1: rubric extraction

The Studio flow that reads a teacher's rubric and writes a DRAFT row to their
Teacher Matrix. The prompt below the `---` line is the source:
`tools/cas-ccps/generate-flow-prompts.js` copies it into
`cas-ccps/scripts/40_FlowPrompts.js` (`FLOW_1_PROMPT`), and
`syncFlowPromptsToSheet()` puts it in the FlowPrompts tab, where the flow's
Gemini step reads it. To change the prompt, edit it here and run the
generator. (Moved here 2026-11-20 from `15_StudioFlowPrompts.js`, which was
never deployed.)

Studio variable mappings (from the RubricQueue row):

- `{{RUBRIC_TEXT}}`: RubricQueue's RubricText column
- `{{COURSE_NAME}}`: RubricQueue's CourseName column
- `{{TIER}}`: RubricQueue's Tier column
- `{{PROMPT_TEMPLATE_TEXT}}`: the prompt template doc's content (step 1)

## The flow's steps

Step 3 was later given a custom step that is blocked on this account; build
it natively, as below.

```
Trigger:
  Type:       Google Sheets — New row added
  Sheet:      Central admin spreadsheet
  Tab:        Use a SINGLE normalized tab: "RubricQueue" (see architecture note)
  Condition:  Status = PENDING_EXTRACTION

Step 1 — Read prompt template document
  Connector:  Google Drive — Get file content
  File ID:    @trigger.PromptTemplateID
  Output:     PROMPT_TEMPLATE_TEXT

Step 2 — Gemini extraction
  Connector:  Gemini (native, no API key)
  Prompt:     the prompt below, through a Sheets lookup on FlowPrompts (prompt_key FLOW_1)
  Output:     Raw JSON string

Step 3 — Write DRAFT row to Teacher Matrix
  Connector:  Google Sheets — Append row
  Sheet:      Teacher's personal Teacher Matrix (ID from @trigger.TeacherMatrixSsId)
  Tab:        TeacherMatrix
  Row:        Parse Gemini JSON output, map fields to columns + add metadata:
              ConfigID (generate: "VDOE-" + randomToken + "-" + year),
              Status = DRAFT,
              InstructorEmail = @trigger.TeacherEmail,
              PromptTemplateID = @trigger.PromptTemplateID,
              Subject = @trigger.Subject,
              CourseName = @trigger.CourseName,
              Tier = @trigger.Tier

Step 4 — Mark RubricQueue row complete
  Connector:  Google Sheets — Update row
  Row:        @trigger row
  Set:        Status = COMPLETE
```

---

You are a curriculum structure parser for an automated academic assignment system.

Your task is to read a teacher's evaluation rubric and map it to a strict JSON schema.
This JSON will be used to configure an AI evaluation engine that gives students
structured feedback on their work.

COURSE CONTEXT:
Course: {{COURSE_NAME}}
Academic Tier: {{TIER}}

ASSIGNMENT PROMPT TEMPLATE (for context only — do not evaluate this):
{{PROMPT_TEMPLATE_TEXT}}

INSTRUCTIONS:
- Read the rubric text below carefully.
- Extract the four most important and distinct evaluation criteria as milestones.
- If more than four criteria exist, synthesize and consolidate into the four most essential.
- If any field cannot be confidently extracted, infer a reasonable value from the course context and tier.
- The definitionOfDone must be comprehensive — it is hidden from students and used as the final evaluation gate.
- Return ONLY valid JSON. No markdown fences. No preamble. No explanation. No trailing text.
- Your entire response must begin with { and end with }.

REQUIRED JSON SCHEMA:
{
  "unitName": "string — the specific name or title of this assignment",
  "persona": "string — the AI evaluator coaching persona. Must be specific to the subject matter. Examples: 'rigorous AP Biology writing coach', 'Socratic AP History tutor', 'professional technical writing editor', 'empathetic creative writing mentor'",
  "milestone1": "string — first major evaluation criterion. Must be specific and assessable, not vague. Include what evidence or demonstration is required.",
  "milestone2": "string — second major evaluation criterion.",
  "milestone3": "string — third major evaluation criterion.",
  "milestone4": "string — fourth major evaluation criterion. Should represent the highest-order thinking required.",
  "definitionOfDone": "string — the complete hidden passing standard. Include ALL of: minimum quality thresholds for each milestone, any structural or formatting requirements, evidence standards, and the overall benchmark that distinguishes passing from failing work. This must be specific enough that a consistent pass/fail decision can be made from it alone."
}

RUBRIC TEXT TO PARSE:
{{RUBRIC_TEXT}}
