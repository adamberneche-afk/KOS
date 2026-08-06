# Warm-Up Response Form — Setup Specification

## Purpose
Backs the WarmUpResponses tab that Script 29 (Student Context Aggregator)
reads from. This is the student-facing capture point for warm-up answers
referenced in the pacing guide (`warmup_anchor` field, one per lesson unit).

## Why a Form instead of a script-built UI
Zero code. A Google Form writes directly to a linked Sheet, which IS the
WarmUpResponses tab Script 29 expects — no Apps Script needed to capture
the data, only to read it afterward. This was scoped as a Tier 1 (zero-code)
addition in the original agency/value analysis, and that scoping holds even
though it now feeds a scripted aggregator downstream.

## Fields — exact order matters for the linked Sheet's column positions

| # | Field | Type | Required | Notes |
|---|-------|------|----------|-------|
| 1 | Student ID | Short answer, **number validation** | Yes | 7 digits only. See validation note below. |
| 2 | Lesson Unit | Dropdown | Yes | Populated from pacing guide `lesson_unit_id` values: S0-U1 through S9-U1 (20 options). |
| 3 | Your Response | Paragraph | Yes | The warm-up answer itself. No length cap — let students write as much as they want. |

## Student ID field — validation setup
Google Forms' built-in "Response validation" on a Short Answer field:
- Validation type: **Number**
- Condition: **Number** → between → `1000000` and `9999999`
- Custom error text: "Enter your 7-digit student ID only — no @ccpsnet.net needed."

This catches the most common error (typing the full email, or a wrong
digit count) at submission time rather than downstream in Script 29's
validation gate. The gate in Script 29 still exists as a second line of
defense — defense in depth, not a replacement for form-level validation.

## Constructing the full email before it reaches the Sheet
The raw Sheet column will contain only the 7-digit number if the form
field is built as described above. Script 29 expects the FULL email
(`7145839@ccpsnet.net`) in the `student_email` column of WarmUpResponses.

Two ways to close this gap — pick one:

**Option A (recommended): Form-side concatenation via a second hidden step**
Not natively supported by Google Forms without Apps Script. Skip this
unless you're comfortable adding a small onFormSubmit trigger.

**Option B (implemented): collect the number, transform on read**
Keep the form exactly as specified (number only). Script 29's
`getWeeklyWarmUps_()` normalizes the raw 7-digit value to the full
`@ccpsnet.net` address before running it through `ID_PATTERN` validation.
This is already in the current build — no further code change needed.
The form stays a plain Google Form with zero Apps Script attached to it;
all the normalization logic lives in Script 29, in one place.

## Linking the form to WarmUpResponses
When creating the form, do NOT let Google Forms create its own response
spreadsheet. Instead:
1. Run `createStudentAggregatorTabs_()` first so WarmUpResponses already
   exists with the correct headers (timestamp, student_email,
   lesson_unit_id, response).
2. In the Form's Responses tab, click the Sheets icon → "Select existing
   spreadsheet" → choose the Central Ledger.
3. Google Forms will create its OWN new tab inside that spreadsheet
   rather than writing into an existing tab by name — this is a Google
   Forms limitation, not something we can configure around. After
   linking, rename the tab Forms created to `WarmUpResponses` (or rename
   the tab Script 00 expects to match whatever Forms actually names it),
   and delete the empty `WarmUpResponses` tab `createStudentAggregatorTabs_()`
   made, OR re-point Script 00's `warmUpResponses` config key to the
   Forms-created tab name. Either works — pick whichever is less
   confusing to maintain. Confirm the four header names match exactly
   (timestamp, student_email, lesson_unit_id, response) before the first
   trigger run, since Forms will use its own header labels by default
   and those need to be renamed to match what Script 29 reads by index.

## Why no onFormSubmit trigger
An earlier draft of this spec considered adding a small `onFormSubmit_`
trigger on the form itself to handle the email transform and tab linking
in one place. That was dropped in favor of keeping the form completely
script-free: Script 29 already owns the normalization logic, and the tab
linking is a one-time manual step (see above) rather than an ongoing
runtime concern. Fewer moving parts, one clear owner for the transform.
