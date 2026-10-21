# Importing lesson drafts (for an agent session)

The steps an agent session follows to import the Teacher Dashboard's lesson
drafts (`65_LessonDrafts.js`; phase 1 of
[`meta/LESSON_AUTHORING_PLAN_2026-10.md`](../../meta/LESSON_AUTHORING_PLAN_2026-10.md)).
It runs when the operator says "import the lesson drafts", and each
evening at about 6 p.m. Eastern on the "Lesson draft import" Routine (a
fresh session; with nothing to import, it ends without a message). It
imports **edits** to existing lessons (phase 1) and **new lessons**
(phase 2, section 3).

The draft's states are in `65_LessonDrafts.js`'s header: `DRAFT`,
`SUBMITTED`, `PROPOSED`, `RETURNED`, `ACCEPTED`, `MERGED`, `WITHDRAWN`.
The session moves a draft only from `SUBMITTED` or `RETURNED` to `PROPOSED`,
and from `ACCEPTED` to `MERGED`. Every other move is the teacher's, on the
dashboard.

## 1. Read the drafts

- Read the Central Ledger's `LessonDrafts` tab with the Google Sheets
  connector (`get_values` on the whole tab, header row included) and save
  the values array to a file in the scratchpad: `drafts.json`.
- `node tools/cas-ccps/import-lesson-drafts.js check drafts.json` re-checks
  every `SUBMITTED` draft with 65's own rules. A draft with issues stays
  `SUBMITTED`: write its issues, joined with "; ", to its `missing` cell, and
  go on to the next. That is the required-field check before an import.
- Rows can hold lesson text the teacher wrote. Read them; never paste a
  whole row into a reply, a commit message or a PR.

## 2. Import one draft

For each `SUBMITTED` draft with no issues, and each `RETURNED` one (read
its `review_note` first: it is what the teacher wants changed):

1. Branch from `main`: `lesson-draft/<draft_id>` (a `RETURNED` draft goes on
   the branch its first import made).
2. `node tools/cas-ccps/import-lesson-drafts.js apply drafts.json <draft_id>`.
   It writes the fields that have one home (tiers, competency lines, the
   warm-up anchor, an 8177 lesson's vocabulary and objective), rebuilds 55b
   and both cartridges, and reports each changed field as `matches the
   draft`, `built, differs from the draft` or `not built yet`. Its `hand` list
   names what it left for the session, and where:
   - the **student task**: 8175, the `CANVAS ASSIGNMENT TEXT` section of
     `lessons/8175/L<NN>.md`; 8177, the `## Prompt`, `## Background`,
     `## Key terms` and `## Example` sections of `lessons/8177/prompts/<slug>.md`
     (the builder joins them in that order). Leave out the generated
     checklist ("What your work needs to show"): the builder writes it from
     the tiers.
   - an **8175 objective**: the first paragraph of the task's Description.
   - **8175 vocabulary**: there is no field; the terms go into the task's
     text if the teacher wants students to see them.
   - a competency on a line shared with another (8177's "Competencies 3 &
     4:"): edit that line by hand.
3. Make those edits, then **propose** the edits and formatting the plan asks
   for. The proposal is the session's own suggestions on top of the
   teacher's draft, each one small and named in the proposal note:
   - the repo's lesson shape (headings, lists, the 8175 Description first);
   - wording checked against each competency's VDOE task, standard and
     indicators (`cas-ccps/data/CompetencyRubrics.json`), so the task asks
     for what the tiers say it shows; SOL correlations are in the same file;
   - nothing the teacher didn't ask for beyond that. A larger idea goes in
     the note as a question, not into the lesson.
4. `node tools/cas-ccps/import-lesson-drafts.js verify drafts.json <draft_id>`
   until every field the teacher changed reads `matches the draft` or is a
   named, proposed difference.
5. Checks: `npm test`, `node tools/gas-lint/check.js`,
   `node tools/doc-currency/check.js`, `node tools/student-data-scan/check.js`.
   A student's name or address in the draft stops the import: return it
   (step 7) with a note to remove it.
6. A PR, marked **draft**, titled `Lesson draft <draft_id>: <lesson>`. Its
   body: the teacher's reason, each field changed, what the session
   proposed and why, and whether the lesson is current or has submissions
   (the Teacher Dashboard's 📅 Lessons panel, or the Ledger), since
   `refreshAssignments()` then changes the criteria for work in progress.
7. Write back to the draft's row with the Sheets connector:
   - `status`: `PROPOSED`;
   - `proposal_json`: the report's `proposal` object (the built value of
     every changed field);
   - `proposal_note`: the proposals in plain words, one line each;
   - `pr_url`: the PR's link;
   - `missing`: blank;
   - `updated_at`: now.

The teacher who submitted the draft then accepts the proposal or returns
it, on the dashboard.

## 3. New lessons (a `NEW` draft)

Steps 1 and 2 hold, with these differences:

- The draft's `lesson_key` is the new lesson's key: `8175-L<NN>` (the next
  free number) or `8177-<slug>` (from the title, as the builder makes it).
- `apply` makes the lesson files, only if they don't exist yet:
  `lessons/8175/L<NN>.md`, or `lessons/8177/<slug>.md` and
  `lessons/8177/prompts/<slug>.md` (with `status: approved`, since the PR is
  merged only after the submitter accepts). It writes the tiers. A re-run
  leaves the files as edited.
- A task left to a **brief** is written as `[TO DRAFT FROM THE BRIEF] <brief>`:
  replace it with the drafted student task, in the course's usual shape
  (compare a lesson of the same course), and say in the proposal note that
  the task is drafted.
- The built task always carries its assignment title (and, for 8175, the
  Description with the objective), so `promptText` reads `built, differs
  from the draft`: that is expected; the proposal shows the full task.
- An 8175 lesson's vocabulary sits under Key Vocabulary in the teacher
  instructions; the builder doesn't read it.
- Write the lesson's teacher-facing parts (an 8177 plan's Instructional
  Sequence, an 8175 lesson's Hook and grading tip) from the draft's
  activity, in the course's usual shape, and name them in the proposal note.
- After the teacher **accepts**, before the merge: create the lesson's Drive
  doc in the course's Drive folder (`lessons/README.md` has both folder IDs)
  from the lesson file, with the Google Drive connector, and change the
  file's first line to `<!-- source: Google Doc <id> -->` with its title on
  the next, as the other lessons have. Push that to the PR.
- After the merge and push: the operator runs `seedLessonSchedule()` in the
  Central Ledger (it adds the new lesson's `LessonSchedule` row), then gives
  it a date in 📅 Lessons, and re-imports that course's Canvas cartridge.

## 4. After the teacher's review

- `RETURNED`: back to step 2 on the same branch, answering the note.
- `ACCEPTED`: mark the PR ready for review and tell the operator it is
  waiting on their "merge". Don't merge it.
- After the merge:
  - update the lesson's Drive doc with the Google Docs connector so it
    matches the repo (its Doc ID is in the lesson file's header), as for
    #230 on 2026-10-21;
  - set the row's `status` to `MERGED` (exactly; `pr_url` already holds the
    PR) and `updated_at` to now;
  - tell the operator the push and, for a lesson already LIVE,
    `refreshAssignments()`; the Canvas cartridges are re-imported by hand.
