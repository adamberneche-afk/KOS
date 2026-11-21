# Lessons in parts (script 68)

Moved from `cas-ccps/README.md` on 2026-11-21 (meta/AUDIT_STRUCTURE_2026-11-20.md,
4.2); the README's "Features" table links every file in this folder.

`68_LessonParts.js` (Central Ledger and Teacher Dashboard, 2026-10-27; the
student work plan's Phase 3). A lesson in `curriculum/lessons/PARTS.json`
runs as its parts, each its own assignment and doc (55b's `LESSON_PARTS`,
ConfigID "CAS-<LESSON>-P2"). The nightly rollout seeds and enrolls every
part when the lesson comes up: Part 1 is shared on its release night like
any lesson, the rest are made unshared (`SCHEDULED`). A part unlocks for a
student when their latest check of the part before found that part's
primary MET (`CompetencyEvidence`): `unlockReadyParts()`, a Ledger cycle job
every minute (every 5 before 2026-11-14) (`installPartUnlocks()`, in `64`, adds it), shares the next part and
sets it `ACTIVE`, the same as a release. The teacher can unlock a student's
next part from the Teacher Dashboard (`unlockStudentPart`). Each unlock is a
`PartUnlocks` row (the student's workspace ConfigID, the part, and
PRIMARY_MET or TEACHER). A lesson students already have as one whole doc is
never split under them. `previewPartUnlocks()` counts what would open now. A part never submitted whose next part is locked prompts the student (2026-11-17, D-P): its lock line says the next part is waiting on it and to press Submit for Feedback, and Do next lists it with "Submit to open Part n". `explainLockedParts()` (2026-11-16) says why each student's next locked part is still locked: `READY` (the job would open it), `PRIMARY_NOT_MET` (with whether an earlier check found it MET and whether the latest is the 11-15 re-grade's), `PRIMARY_NOT_IN_EVIDENCE` (an ID mismatch), `PREVIOUS_CHECK_FAILED`, `PREVIOUS_NOT_CHECKED`, or `NO_ROW` (the student's last open part has a next part in `PARTS.json` but no Ledger row for it, so nothing can unlock it), and whether the student holds a turn-in code for the part before. A part added after its lesson went out (the Buyer's Product Pitch's Part 6, #417) was never made: the nightly rollout makes a lesson's parts only while the lesson is current or starting soon. `previewLessonPartsCatchUp(lessonKey)` then `applyLessonPartsCatchUp(lessonKey)` (58, 2026-11-17) make Parts 2 and up of one lesson wherever it sits in the schedule: seeded into the TeacherMatrix if missing, then a locked (`SCHEDULED`, unshared) copy for each student in the course without one, then `unlockReadyParts()` opens those whose part before is MET. Part 1 is never made by it. Competency IDs ending in 1 to 12 were stored by Sheets as dates ("8177-7" as July 8177) until 2026-11-17: the evidence writer now formats them as text, the unlock reads either form (`competencyIdText_`, 32), and `repairCompetencyIdDates()` then `repairCompetencyIdDates(true)` (15c) rewrites the old cells. A Slides, Form or Sheet part needs its `WORK_TEMPLATE_<KEY>_P<n>` set first, a Script Property or a `_CONFIG` row (`NO_WORK_TEMPLATE` otherwise). Counts and reason codes only. A turn-in code is earned on any feedback, Revise included, so a code on Part 1 doesn't open Part 2. Ledger row numbers, lesson keys, parts and competency IDs only.
Since 2026-11-01 (dead-ends audit #5) a part **held by a failed check** is
flagged: when a student's furthest open part last ended in a timeout or an
unusable result (Ledger `ERROR_TIMEOUT` / `ERROR_EVALUATION`) and its next
part is still locked, the Teacher Dashboard row says so once a school day
has fully passed (weekdays, until the calendar is in configuration), above
its "Open Part n now" button, and the overnight email counts those students
(`partsHeldByFailure_`). The Canvas cartridges list a lesson's parts (audit
#6): still one assignment and grade per lesson, its page naming each part,
saying each opens in turn, and asking for the last part's link.

## Work types: checking Submit can read every form, deck and sheet (2026-11-19)

`checkWorkFileReads()`, run in the **Student Dashboard's** editor (as the
account the dashboard runs as), does for every student's form, deck and
sheet that is shared and not archived what Submit does before any feedback:
finds its feedback page (`FormSnapshots`) and reads it with its reader (75,
77, 78). The log gives counts by type ("decks: 41 of 42 read"), then each
failure grouped by kind with its fix and ConfigIDs: a permission the
dashboard's account hasn't been granted (remove the project's access at
myaccount.google.com/connections, run `reportDeployVersion`, approve); a
file gone or not shared with that account; no feedback page on record; or
anything else, with Google's message. It reads only and records nothing.
Run it after each push and before a lesson with a form, deck or sheet part
opens: on 2026-11-19 a student found the missing Slides permission by
pressing Submit.

## Work types: a part as a Google Form (Phase 4a, 2026-11-08)

A part's work file has a type (`meta/STUDENT_WORK_PLAN_2026-10.md` §5):
`doc` (the default) or `form`. It is the part's `workType` in
`curriculum/lessons/PARTS.json`; unset is `doc`, so a lesson nobody marks
builds exactly as before (55b, the cartridges and the demo file are
byte-identical, and a test holds it). The generator carries it to 55b as
the part's `workFileNow` and, for a form, `workTemplateKey`
(`WORK_TEMPLATE_<PART KEY>`, e.g.
`WORK_TEMPLATE_8177_MARKET_RESEARCH_SURVEY_DESIGN_P2`): the name of the
Central Ledger setting that holds the template form's file ID, as
`MASTER_STUDENT_TEMPLATE_ID` holds the doc's: a Script Property or (since
2026-11-19) a row of the Ledger's `_CONFIG` tab, the property winning if
both are set. The three marked parts (the survey form, the pitch deck, The
Back Room's sheet) have theirs as `_CONFIG` rows. No Drive ID is in the repo.
It refuses `form` on a part whose `workFile` isn't `form`, and a form
part whose task still says to paste a link into this document.

- **Made by the rollout like a doc.** Intake (02's `intakeStudent_`, via
  68's `partWorkFile_`) copies the template with `DriveApp.makeCopy` into
  the student's admin folder, shares it with the student as editor (or not
  yet: `SCHEDULED` until the part unlocks or its release night), adds the
  assigning teacher as editor (a form has no comment access), and writes
  the Ledger row as for a doc: `FileID` is the form's ID, `AdminFileURL`
  its `/forms/d/` link. That URL is how every reader tells a form from a
  doc (`workFileTypeOfUrl_`, 00), so the Ledger keeps its fixed width and
  the Student Dashboard needs no lesson data. A form part with no template
  set fails as `NO_WORK_TEMPLATE` (a RolloutLog PROBLEM row; the run stops
  that lesson at the first). Nothing is stamped into a form.
- **No FormApp at intake.** Copying and sharing are Drive calls; the
  Central Ledger keeps the Forms scope it has (decided 11-07), though the
  reader (4b) runs in the Student Dashboard, so gas-lint still reports the
  Ledger's as unused, as on main.
- **The template is a blank form**: the title only (e.g. "Venue Market
  Research — your survey"), no questions and no description to fill in.
  Building the form is the student's work (8177-18, technologies and
  tools), and 4b's reader checks its questions and that email collection
  is off. The task itself stays in Canvas, where the cartridge lists the
  parts. Make the template with no linked response sheet.
- **The Student Dashboard** shows a form part's card with **Open your
  form** (the primary-button rules are unchanged), **Submit for Feedback**
  (Phase 4b, below), a line saying what Submit reads, and a link to the
  form's feedback page. Demo mode shows the first lesson whose parts plan
  a form, Part 2 open as a form; its Submit answers with a sample "Not yet"
  and reads nothing.
- **The Teacher Dashboard** says "· Google Form" beside a form part's
  title, links to it ("Open form", "Part 2 (form)"), and unlocks it the same
  way. The teacher can comment on the feedback page, which is in the
  student's admin folder beside the form.

## The Form reader at Submit (Phase 4b, 2026-11-08)

The plan's §5 design, built: Submit reads the form, checks it exactly, and
Flow 2 reads a snapshot of it.

- **The reader** (`75_FormReader.js`, Student Dashboard project; the web
  app runs as the deploying account, an editor of every form copy since
  4a) opens the student's form with `FormApp.openById` and reads its
  **structure only**: title, description, each item's type, title and help
  text, choices (multiple choice, checkboxes, dropdown) and whether "Other"
  is on, a grid's rows and columns, a scale's ends and labels, the required
  flags, and the settings: email collection (`collectsEmail` and the
  newer email-collection setting), one response per person, quiz. It
  **never reads responses**: no `getResponses`, no response sheet
  (`getDestinationId`), no summary. A test holds every FormApp call to a
  list of structure getters. A checkbox's "select up to two" can't be read
  back (the 11-01 probe): the task asks for it in the question's wording,
  which the snapshot carries.
- **The exact checks**, before Flow 2: the part's `formChecks` in
  `PARTS.json` (below). A failure answers "Not yet. Fix this in your form,
  then submit again:" with one plain reason a line ("Your form has 2
  questions. It needs at least 3.", "Your form collects email addresses.
  Turn that off: …", "Your form needs a Linear scale question."), and goes
  nowhere else: no ReviewQueue row, no Flow 2 run, not counted as a system
  failure. System text in the form (`[SYSTEM:` and the rest) is refused as
  in a doc. A form part has no doc-menu path: `doPost` answers
  `USE_DASHBOARD`.
- **The snapshot doc**, the form's feedback page: a Google Doc made at
  intake beside the form (02's `_makeFormSnapshotDoc_`, "<lesson> — <student>
  — your form, as checked"), owned by the system account, shared as a
  **commenter** with the student (once the part opens: 58's release and
  68's `_lpShare_` share it with the form) and the assigning teacher. The
  student reads the form as checked and the feedback, and can't change
  what was judged. It is laid out like a doc's lower half: the page header
  (63), the feedback zone (unless feedback is a comment), the response
  marker, the snapshot, the `[CONFIG_ID:` line. On a pass, Submit rewrites
  the snapshot between the marker and that line (`writeFormSnapshot_`,
  every Submit, never appended) with a plain-text account in a fixed
  layout (`formSnapshotText_`): the title, description and settings, then
  each item in order with its type, "required", help text, choices or
  scale, every student string quoted on one line, system text
  neutralized, and the prompt's marker characters (`<<<`, `>>>`, `{{`,
  `}}`) and the doc markers taken out. Then it queues the form as usual.
- **Flow 2 reads the snapshot.** `FormSnapshots`, a Central Ledger tab
  (00: `MadeAt`, `StudentConfigID`, `FormFileID`, `SnapshotDocID`,
  `PartConfigID`, `FormChecks`, `LastWrittenAt`; IDs only), links each form
  copy to its snapshot doc. 37 points the FlowInput row's `StudentDocURL`
  at the snapshot doc, so Studio's Extract step reads it exactly as it
  reads a student doc and the snapshot sits inside `<<<STUDENT_SUBMISSION>>>`
  as untrusted student text; the harvest writes the feedback, the
  reflection comment and the header line there (the form's ID stays the
  key for the Ledger, the evidence and the logs), and 03 sends a timeout
  or a finished check's header there too. A later part's EARLIER PARTS
  block reads an earlier form part from its snapshot (before 4b it read
  as empty).
- **`formChecks`** (`curriculum/lessons/PARTS.json`, on a form part only;
  the builder refuses anything else):
  `{"minQuestions": 3, "maxQuestions": 5, "collectsEmail": false, "questionTypes": ["checkboxes", "scale", "short_answer"]}`.
  Every key is optional: `minQuestions` and `maxQuestions` whole numbers
  1–100 (max at least min), `collectsEmail` true or false (must be on, or
  off), `questionTypes` the types the form must each have at least one of
  (`short_answer`, `paragraph`, `multiple_choice`, `checkboxes`,
  `dropdown`, `scale`, `rating`, `grid`, `checkbox_grid`, `date`, `time`,
  `date_time`, `duration`; 00's `FORM_QUESTION_TYPES`, which a test holds
  equal to the builder's). A form part with no `formChecks` gets the
  defaults: at least one question, email collection off. The generator
  writes `formChecks` to 55b only when set, so the data is unchanged until
  a part is marked. Intake records the part's checks in `FormSnapshots`
  (the Student Dashboard has no lesson data); after changing a part's
  `formChecks` once its copies exist, run `refreshFormSnapshots()` from the
  Central Ledger's editor (it also makes a snapshot doc for any form copy
  missing one; counts only).
- **Scope.** The Student Dashboard's manifest adds
  `https://www.googleapis.com/auth/forms` (FormApp needs it; the Forms
  API's read-only scopes don't cover FormApp). The deploying account
  approves it once after the push (run any function from the editor, or
  open the dashboard as that account); until then a form's Submit fails
  as `FORM_UNREADABLE` ("Tell your teacher"), counted in `SubmitFailures`.

**Marking a part as a form (the operator, or an agent at the operator's
word):**
1. Make the template: a new blank Google Form in the admin account's Drive,
   titled for the part, no questions. Copy its file ID from its URL.
2. In the Central Ledger's Apps Script editor, Project Settings, Script
   Properties: add `WORK_TEMPLATE_` plus the part's key in capitals, `-`
   as `_` (for the first, `WORK_TEMPLATE_8177_MARKET_RESEARCH_SURVEY_DESIGN_P2`;
   55b's `workTemplateKey` after step 4 shows it) with that ID.
3. In `curriculum/lessons/PARTS.json`, on the part: `"workType": "form"`,
   and its exact checks, `"formChecks": {…}` (Phase 4b, above; for the
   survey part, `{"minQuestions": 3, "collectsEmail": false}`). Take the
   "paste the link into this document" sentence out of the part's
   paragraph in its prompt file (`8177/prompts/<slug>.md`).
4. `node tools/cas-ccps/build-lesson-assignments.js`, then
   `node tools/cas-ccps/build-canvas-cartridge.js`,
   `node tools/cas-ccps/build-dashboard-demo-lessons.js`, and each with
   `--check`; `npm test` (the tests that pin the unmarked state move with
   it). Merge and push; re-import the cartridge.
5. The next rollout makes the copies for that lesson. A student who already
   has the part as a doc keeps it.

The first: 8177 "Venue Market Research & Survey Design", Part 2 "Build the
Survey" (named by the operator 2026-11-08). **Marked 2026-11-09**, with
`formChecks` `{"minQuestions": 3, "collectsEmail": false, "questionTypes":
["checkboxes", "scale", "short_answer"]}` (the part's three question types,
as its criterion asks); its blank template, "Market Research — your
survey", is in the operator's Drive, its ID in
`WORK_TEMPLATE_8177_MARKET_RESEARCH_SURVEY_DESIGN_P2`. The pilot changes
the Canvas assignment's text by hand rather than re-importing the
cartridge (a re-import duplicates modules).

`69_EvaluationHealth.js` (Central Ledger, 2026-11-01) is the first reader of
`EvaluationLog`, and the numbers D8 waits on. `reportEvaluationHealth()`,
from the editor, logs per course and per week (Monday to Sunday, the last
eight): Flow 2's results by kind (`PASSED`, `NEEDS_REVISION`, the four
`ERROR_` kinds, `ERROR_MALFORMED_OUTPUT` since 2026-11-15, and any other), submissions that never got a result
(`STAGING_PIPELINE` rows still `ERROR_TIMEOUT`), the failure rate, minutes
from Submit to feedback (median and slowest tenth), drafts per student per
lesson, and the warm-up answer rate (`WarmUpQueue`'s `delivered_at` /
`answered_at`). It rewrites the `Measures` tab with the same rows. The
overnight email (34c) runs it once a day and adds one line: this week's
checks and failure rate against D8's bar of 1 in 20. Counts only.

`reportRegradeConsistency({ beforeSsId })` (2026-11-15) measures how
consistently Flow 2 grades the same work. When FlowInput's rows have been
graded twice (a Studio Test run re-graded every row that day), pass the ID
of a copy of the Ledger from before the re-grade (Version history → Make a
copy). It pairs each row with its earlier self and logs, for pairs whose two
gradings are both well formed: the stamp (same, or which way it changed),
each milestone's original against its re-grade (the 3×3 table, one level
apart, `MET` ↔ `NOT_MET`), and per unit the pairs and stamp changes; a
malformed grading is counted by reason, not compared. An original that is a newer submission's answer (the same text in two rows of a doc) is counted apart, not compared.

`reportGradingByVersion({ beforeSsId })` (2026-11-16) groups Flow 2's
gradings by the version that made them: the prompt version, read from each
row's own PromptText (the passing rule, the reflection block, earlier parts,
tertiaries, the injection guard), and the platform it was graded on
(`FLOW2_PLATFORM_EPOCHS`: model and Studio, by ArmedAt or Timestamp), and by
week. The originals come from the copy (the re-grade overwrote them in
FlowInput); the re-grade of the same rows is grouped by their prompt
version, so the platform's effect shows with the prompt held fixed. The
timeline is `meta/FLOW2_VERSIONS_2026-11.md`. Reads only; counts only. `cleanFrom` (an ISO
time) also counts on their own the pairs whose original row was built after
a fix. Reads only. Counts and unit names only.

`69b_FlowMeasures.js` (2026-11-08) does the same for every CAS Studio flow,
called by `reportEvaluationHealth()`, which logs it and rewrites a second
tab, `FlowMeasures` (the `Measures` tab keeps its layout). Per flow and
week: jobs sent, Studio runs and retries, returned, applied, set aside,
never returned past the flow's own timeout, still waiting, the failure
rate, and minutes from sent to returned (median, slowest tenth), from each
flow's own tabs: Flow 1 `RubricQueue`; Flow 2 `FlowInput` with
`EvaluationLog`; Flows 3 and 4 `Flow3Input`/`Flow4Input` with
`WarmUpFlowReturn` (Flow 3 also counts warm-ups sent as the teacher's own
question); Flow 6 `TurnInChecks`, `TurnInCodes`, `TurnInCheckInput` and
`TurnInCheckReturn` (ADDRESSES, NOT_YET, CHECK_FAILED, codes by check and by
grant, labelled engagement, never learning evidence). What a flow doesn't
record is `—`, not zero: Flow 1's applied and wait, Flow 2's return time (its
wait runs to the harvest), Flows 3, 4 and 6's returns older than 14 days,
Flow 6's screened answers. Studio's runs per day (every input row, the last
14 days) are logged and compared with `STUDIO_DAILY_RUN_LIMIT`, a shared
setting copied from Workspace Studio's quota page (blank: "limit not set").
The overnight email's second line names any other flow failing more than 1
in 20 or leaving a job unreturned this week, Flow 6's engagement counts, and
the busiest day's runs, with a warning once a day reaches 80% of the limit.
`showSetupStatus()` shows the setting. CAS flows only: kos-personal's and
leader-hub's flows are other projects.

`69c_LessonReport.js` (2026-11-20) is turn-in stage 5, the lesson report
(`meta/TURN_IN_CODE_PLAN_2026-11.md`): `buildLessonReport()` rewrites the
`LessonReport` tab, one row per lesson with students this school year, counts
only. Per lesson: students assigned and who submitted; files checked, their
first goal (the first milestone's competency, the one that opens the next
part; each part on its own) met on the first check and ever; reflections
and their median length in words; turn-in codes (only for a lesson whose
checks ran after the first code, else "codes off"); first and last check
dates; the zero-shot result (39d). Three patterns are looked for in each
section (Ledger period) of 5 or more students: A, many codes and few first
goals ever met (unclear or too hard); B, first goals met on the first check
with thin reflections (too easy or pasteable); C, few submissions and few
codes (friction). A pattern is flagged only when it holds in 2 sections;
HeldIn says where it held either way. The thresholds are the `LR_`
constants at the top of the file.

## Work types: a part as a Google Slides deck (Phase 4c, 2026-11-09)

The same pattern as a form (4a and 4b above), for Google Slides. A part's
`workType` may be `slides` where its planned `workFile` in `PARTS.json` is
`slides` (the Canva and Drawings parts were planned as Slides, §5); the
generator refuses it elsewhere, and refuses a Slides part whose task still
says to add the work, or its link, to this document. **The first Slides
part (2026-11-09):** a new Part 6, "The Pitch", on 8177 "The Venue Buyer's
Product Pitch", held to the operator's Rule of Six lesson (8175 L08):
`{"minSlides": 3, "maxSlides": 5, "notesOnEverySlide": true, "minImages":
1, "maxImagesPerSlide": 2, "maxLinesPerSlide": 6, "maxWordsPerLine": 6,
"minContrast": 4.5}`. Its blank template, "Product Pitch — your deck", is
in the operator's Drive, its ID in
`WORK_TEMPLATE_8177_PRODUCT_PITCH_FINANCIAL_ANALYSIS_P6`. Students already
in Parts 1–5 get it from the next rollout while the lesson is current; the
Canvas assignment gets the Part 6 paragraph by hand (no re-import). No
other Slides part is marked, and a test holds that.

- **Made by the rollout like a form.** Intake copies the part's template
  deck with Drive (02's `_intakeWorkFile_`, which now makes form and deck
  copies alike; no SlidesApp call), shares it with the student as editor
  (or `SCHEDULED` until the part unlocks), adds the assigning teacher as a
  **commenter** (a deck takes comments, as a doc does; a form's teacher
  stays an editor because a form has no comment access), and writes the
  Ledger row with `AdminFileURL` the deck's `/presentation/d/` link, which
  is how every reader tells a deck (`workFileTypeOfUrl_`, 00). Its template
  key is `WORK_TEMPLATE_<PART KEY>`, as for a form; unset, the part fails
  as `NO_WORK_TEMPLATE`.
- **The template is a blank deck**: one title slide, its placeholders
  empty (Slides' own "Title slide" layout), nothing else. Making the
  slides is the student's work; the task stays in Canvas.
- **The snapshot doc** is made beside the deck at intake ("<lesson> —
  <student> — your slides, as checked"), shared as for a form, and listed
  in the same `FormSnapshots` tab (00): since 4c its `FormFileID` column is
  the student's copy of either type and `FormChecks` the part's checks for
  its type. The tab, its headers and every reader stay as 4b left them; a
  second tab would have meant a second lookup in 37, 03, both dashboards
  and retention. `refreshFormSnapshots()` covers decks too.
- **The reader** (`77_SlidesReader.js`, Student Dashboard) opens the deck
  with `SlidesApp.openById` and reads, for each slide in order: its title
  (the Title or Centered title placeholder), the lines of every other text
  (text boxes, shapes, the subtitle, table cells, word art, text inside a
  group), its speaker notes, and how many images, charts linked from
  Google Sheets and videos it has, with each image's alt text (its title
  and description). Never the deck's name (the copy is named after the
  student) and never an image's content; a test holds every SlidesApp call
  to a list of getters. Probe (11-01): a chart pasted as a picture is an
  image.
- **Alt text, for context only** (2026-11-18): Flow 2 can't see a deck's
  pictures (a Studio probe on 11-18: Ask Gemini, given the deck itself as
  its source, said it could not see them), so the snapshot lists each
  image's alt text, or "(none)", marked as the student's own description,
  not checked. No `slideChecks` key reads it and Submit never stops for it;
  it is student text, so system text in it is refused at Submit like text
  anywhere else in the deck.
- **`slideChecks`** (`PARTS.json`, on a Slides part only; the builder
  refuses anything else; every key optional):
  - `minSlides`, `maxSlides`: whole numbers 1–100 (max at least min).
  - `notesOnEverySlide`: true: every slide, the first included, has
    speaker notes.
  - `minImages`: whole number, images in the whole deck.
  - `maxImagesPerSlide`: whole number, images on any one slide.
  - `maxLinesPerSlide`: whole number. A slide's **lines** are its body
    text: each non-empty paragraph or line break in every text box, shape,
    table cell or word art. **The title is not a line.** A paragraph that
    wraps on screen is still one line (the reader can't see wrapping);
    `maxWordsPerLine` catches a long one.
  - `maxWordsPerLine`: whole number. Applies to every line **and to the
    title's** lines. A word is a run of characters with a letter or digit
    in it (a lone dash is not a word).
  - `requireChart`: true: a chart linked from Google Sheets on some slide.
  - `titleSlide`: true: the first slide has a title.
  - `minContrast`: a number above 1, up to 21, the WCAG 2.x contrast ratio
    (4.5 is AA for body text) between each piece of text and what is
    behind it. Only when set does the reader read colors: each text run's
    color (an RGB color, or a theme color resolved through the slide's
    color scheme) against the slide's background (its own solid
    background, else its layout's, else its master's; none at all shows
    white; a part-clear fill is blended over white) or the text box's own
    solid fill (blended over the page). **Skipped, never failed:** a slide
    whose background is a picture or anything not one color (unless the
    box has its own solid fill), a text box with no fill placed over a
    picture that sits below it, and text whose color can't be resolved.
    Highlighted text is measured against the box or page, not its
    highlight. Dark on light and light on dark both pass. It is a floor:
    Flow 2 still judges whether the slides are easy to read.

  Defaults, with no `slideChecks`: at least one slide, and something on it
  (a title, text, a picture, a chart or a video). A second slide is not
  assumed: several planned Slides parts are a one-slide flyer or mockup.
  A failure is "Not yet. Fix this in your slides, then submit again:" with
  one reason a line, naming the slide and what to change ("Slide 2 has 8
  lines of text, not counting its title; this part allows 6. Cut 2.",
  "Slides 1 and 3 have no speaker notes. …", "Slide 2: some text is hard
  to read against the background (contrast 1.9 to 1; this part asks for at
  least 4.5 to 1). Pick colors with more contrast: …"). Not queued, not a
  system failure. Error codes start `SLIDES_` (`SLIDES_NOT_YET`,
  `SLIDES_UNREADABLE`, `SLIDES_SNAPSHOT_MISSING`,
  `SLIDES_SNAPSHOT_UNWRITABLE`).
- **The snapshot** (`slidesSnapshotText_`): the slide, image and chart
  counts, then each slide with its title, each line of text quoted, what
  else is on it ("1 image", "1 chart from Google Sheets"), its speaker
  notes, and with `minContrast` the lowest contrast measured. Student text
  is quoted and made safe as a form's is. Images are counted, not
  described; how the slides look is not in it. Flow 2 reads it through
  `StudentDocURL`, and a later part's EARLIER PARTS block reads it.
- **The feedback, as a comment (since 2026-11-17).** With
  `FEEDBACK_AS_COMMENT` on, the harvest (37) posts the feedback on the
  **deck itself**, where the student revises, not on the feedback page; the
  page stays the record of what was checked, and its header line reads
  "Read the comment on your slides", linked to the deck's `?disco=` link,
  which View feedback opens. A deck that won't take the comment falls back
  to the feedback page, then to its feedback zone. `repostMissingFeedback`
  looks on the deck and the page, and posts on the deck. (Forms and Sheets
  parts are unchanged: a form has no comments; no Sheets part is marked.)
- **The dashboards.** Student: **Open your slides**, Submit, a line saying
  what Submit reads, a link to "Your deck's feedback page". Teacher:
  "· Google Slides" beside the part, "Open slides" and "Part n (slides)"
  links. Demo mode adds the first lesson in teaching order with a planned
  Slides part (8177 "Venue Promotion & Flyer Design", Part 1 open as a
  deck); its Submit answers with a sample "Not yet" and reads nothing.
- **Scope.** The Student Dashboard's manifest adds
  `https://www.googleapis.com/auth/presentations`. Apps Script's SlidesApp
  lists only that scope (and `presentations.currentonly`, for a bound
  script) for `openById`; there is no read-only scope it accepts. The
  reader calls getters only (the test above). One re-consent after the
  push, as for Forms; until then a deck's Submit fails as
  `SLIDES_UNREADABLE` ("Tell your teacher"), counted in `SubmitFailures`.

**Marking a part as Slides:** as for a form (above), with a blank deck as
the template, `"workType": "slides"` and `"slideChecks": {…}` on the part,
and the "add it (or its link) to this document" sentence out of its prompt.
A part added to a lesson students are already in (a new Part 6 after Parts
1–5) is seeded and made by the rollout only while that lesson is the
current one or within the lead days in `LessonSchedule`, and the course is
in `APPLY` mode; each enrolled student then gets it `SCHEDULED`, and the
unlock job opens it at once for anyone whose latest check of the part
before already found its primary met. Set the template property before
that rollout, or every copy fails as `NO_WORK_TEMPLATE`.

## Work types: a part as a Google Sheet (Phase 4d, 2026-11-09)

The same pattern again, for Google Sheets. `workType: "sheet"` is allowed
where the part's planned `workFile` is `sheet`; the generator refuses it
elsewhere and refuses a Sheets part whose task still sends the work or its
link to this document. **One part is marked** (2026-11-19): 8177 "The Back
Room" Part 2, below.

- **Made by the rollout like a deck**: a Drive copy of the part's template
  (`WORK_TEMPLATE_<PART KEY>`), the student an editor (or `SCHEDULED`), the
  teacher a **commenter**, `AdminFileURL` a `/spreadsheets/d/` link (type
  `"sheet"`), a snapshot doc beside it ("your sheet, as checked") listed in
  `FormSnapshots`. Intake never opens the copy.
- **The template is a blank sheet**: one empty tab. A part whose checks
  name a tab (`requiredTabs`, `tab`) may get a template with that tab
  already named, or leave naming it to the student; the checks say which
  is missing either way.
- **The reader** (`78_SheetReader.js`, Student Dashboard) opens only the
  student's own copy (`SpreadsheetApp.openById` with the `FileID` of the
  student's own Ledger row; a test holds it to one open and a list of
  getters). For each tab: its name, the shown values and formulas of the
  range up to the last filled row and column (at most **1000 rows × 52
  columns** are read; past that the snapshot says the tab was cut), and each
  chart's type, title and source ranges. A cell is **filled** when it shows
  a value or holds a formula; a **formula** is a cell whose formula isn't
  blank, so a typed number never counts as one. Never the file's name, never
  a write.
- **`sheetChecks`** (`PARTS.json`, on a Sheets part only; every key
  optional):
  - `requiredTabs`: tab names the sheet must have (case and spaces at the
    ends ignored).
  - `tab`: the tab the counts below look at. Unset, they look at every
    tab: `minFilledRows` is met when some one tab has that many,
    `minFilledCells` and the formulas are counted over all tabs.
  - `minFilledRows` (1–1000): rows with at least one filled cell.
  - `minFilledCells` (1–10000).
  - `formulasRequired` (1–1000): cells holding a formula.
  - `formulasIn`: where those formulas must be, a column (`"D"`) or a
    range (`"D2:D20"`, `"B2:E"`), capitals, no tab name (it's `tab`, or any
    tab). Set alone, it asks for one formula there.
  - `requireChart`: true: a chart on some tab.

  Default, with no `sheetChecks`: one filled cell. A failure is "Not yet.
  Fix this in your sheet, then submit again:" with one reason a line ("Your
  sheet has 4 rows filled in on “Inventory”. It needs at least 5.", "Your
  sheet has 0 formulas in column D on “Inventory”. It needs at least 4: a
  cell that calculates starts with =, like =B2-C2. A number typed in is not
  a formula."). Codes start `SHEET_`.
- **The snapshot** (`sheetSnapshotText_`): each tab as a table, row by
  row, each filled cell with its column letter and its shown value quoted,
  a formula after its value in `[ ]`, empty cells left out, then the tab's
  charts ("column chart “Usable items” from “Inventory!A1:A5”"). **Capped**
  at the first **50 filled rows and 12 columns (A–L)** of each tab, 200
  characters a cell; what is left out is said ("10 more filled rows not
  shown", "more past column L"). Text explanations typed in cells are in
  it, so Flow 2 reads them.
- **Scope: none added.** The Student Dashboard already has `spreadsheets`
  (it reads the Ledger), which covers the reader; no re-consent.
- **Dashboards and demo**: "Open your sheet", "Your sheet's feedback page";
  the teacher's "· Google Sheets", "Open sheet", "Part n (sheet)". The demo
  adds the first lesson in teaching order with a Sheets part (8177 "The
  Back Room", Part 2, since 2026-11-19).

**Marking a part as a Sheet:** as for a deck, with a blank sheet as the
template, `"workType": "sheet"` and `"sheetChecks": {…}`.

**The first Sheets part** (the operator, 2026-11-19): 8177 "The Back Room"
Part 2, "The Inventory Update" (lesson 23 of 31). Its `workFile` and
`workType` are `sheet`, with `{"requiredTabs": ["Inventory"], "tab":
"Inventory", "minFilledRows": 5, "formulasRequired": 4, "formulasIn": "D"}`:
a header and the four items on the Inventory tab, and each usable count a
formula. Its task now says so: column A the item, B how many were ordered,
C how many are missing or can't be used, D the usable count as a formula
(`=B2-C2`), E why. Its template was made on 2026-11-19: "The Back Room —
your sheet" in the operator's Drive, one tab named **Inventory** and
nothing else (the students write the header; a header in the template
would count as one of their five rows), its ID in the Central Ledger's
`_CONFIG` tab as `WORK_TEMPLATE_8177_THE_BACK_ROOM_P2`. Without it each
copy fails as `NO_WORK_TEMPLATE` (a PROBLEM row). After the rollout,
`checkWorkFileReads()` in the Student Dashboard reads every copy.

**A part's template key** (`WORK_TEMPLATE_<PART KEY>`) is read from the
Central Ledger's Script Properties or, since 2026-11-19, a row of its
`_CONFIG` tab (00's `_resolveConfigValues_`; the property wins). Before
that a `_CONFIG` row was ignored.
