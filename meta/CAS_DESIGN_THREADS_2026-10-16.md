# CAS Design Threads: Mastery Map, Anchors and Student Portfolio

> **Filed 2026-10-17** from the operator's 2026-10-16 handoff package.
> Suggestions only; nothing here is built. Where it sits in the order of
> work: [`HANDOFF_2026-10-17.md`](./HANDOFF_2026-10-17.md).

Prepared 2026-10-16. Suggestions only; nothing here is built. These threads come from questions about aggregating student data across curriculum and courses, about a portable personal knowledge portfolio, and about rolling out lessons and distributing documents. They sit on top of the authenticity and process-trace suggestions in the Cognitive Exhaust document. Student data stays out of any analysis shared with Claude: only structure, counts and metrics.

## 1. Thread A: cross-course mastery map, remediation and anchors

**Goal.** For each student, map base knowledge, what needs remediation, and where to place anchors to expand understanding, across the 8175 and 8177 curriculum.

### What the system already has

- **Per-student, per-competency evidence.** Flow 2 writes `CompetencyEvidence`. `30_SCRSuggestionEngine` turns it into a suggested rating (2, 3 or 4) from at least three pieces, counting each assignment at its best outcome. Ratings 1 and 5 are teacher-only.
- **Cross-course links at unit level.** `LessonPrimarySecondary_Seed.csv` links each lesson unit's primary competency to secondary ones across both courses. The SOL transitive mapping ties 8177 tasks to the 8175 tasks they parallel and to inherited SOLs.
- **A remediation path.** `30b_SCRRetryRemediation` uses secondary-competency evidence to unlock a retry on a primary competency. Original ratings are never erased.
- **Per-unit confidence.** The shadow matrix in `23_StudentProfileManager` holds student-by-unit confidence with cross-unit decay (0.85). `29_StudentContextAggregator` writes a weekly per-student doc.
- **A registry** of 221 competencies across the two courses, each with a strand and subject.

### What is missing

1. **A competency graph.** The registry has no prerequisites, no "extends" or "parallel" relationships between individual competencies, and no difficulty. Existing links are lesson-level scaffolds. Without a graph there is nothing to anchor to.
2. **A baseline.** Nothing records what a student knew before the course. All evidence is after the fact.
3. **A per-competency, cross-course student view.** The Teacher Dashboard shows per-unit confidence; a per-competency cross-course map was not found (the dashboard was not run to check).
4. **Data from outside the two courses.** Prior courses, SOL scores and other teachers' records are not in the system, so "across curriculum" currently means 8175, 8177 and their SOL correlations unless a data source is added, which would need its own approval.

### Suggested design

1. **Build the graph.** A data file of edges typed `PREREQUISITE`, `PARALLEL` or `EXTENDS`, seeded from the existing seed and SOL mapping, with AI-proposed additions that the teacher approves one by one.
2. **Estimate mastery per student and competency** in four states: `STRONG`, `DEVELOPING`, `GAP` and `UNKNOWN`. Keep `UNKNOWN` separate from `GAP`; early on most cells will be unknown and treating them as gaps would mislabel students. Reuse the 0.85 decay for older evidence.
3. **Add a baseline** from early warm-ups or a short unit-start diagnostic, recorded as a lower-weight source. A student self-rating on the SCR scale is cheap and useful to compare against.
4. **Target remediation.** For each upcoming lesson, flag students with `GAP` or `UNKNOWN` on its prerequisites, ranked by how many upcoming lessons depend on that competency, and group students for small-group work.
5. **Place anchors.** For each new competency, find the student's strongest linked competencies via graph edges, the parallel-course unit or SOL overlap, and write a teacher-facing note such as "introduce Y by connecting to X, which this student has shown." Class-level anchors (the strongest competency shared by most of the class) serve whole-group instruction.
6. **Show it where it is usable.** A class heatmap with confidence on the Teacher Dashboard, and an "anchors and remediation" note in the lesson frame. Students see strengths-based framing in context, never "needs remediation."

### Guardrails

- Suggestions only, teacher-confirmed; ratings 1 and 5 never auto-assigned.
- The map drives what is offered to a student, not labels or tracking.
- Compute these views from the evidence rather than storing them, to avoid new long-lived derived student records (relevant to the retention design). If anything is cached, make it regenerable with short retention, and add it to the FERPA data map either way.
- State confidence everywhere: show how many pieces sit behind each cell.

### Build order

1. The graph file and its teacher-approval tool, reviewed before any code.
2. A read-only class heatmap.
3. Anchor and remediation notes in the lesson frame.
4. The baseline diagnostic.
5. The student-facing view.

## 2. Thread B: student-owned personal knowledge portfolio

**Concept.** A repo holding each student's work, competency records and certifications from this point forward, building a personal knowledge portfolio concentrated into the student's context. The student could take it after school and use it to add context to KOS or a similar harness.

### What already helps

- `29_StudentContextAggregator` already writes a weekly per-student living doc.
- Teacher-confirmed SCR ratings are the kind of verified claim a portfolio needs.
- Competency IDs, SOL correlations and evidence rows provide stable identifiers.

### Three problems to solve first

1. **Ownership.** Intake creates each student doc with `makeCopy` from the admin account and adds the student as an editor, so the admin account owns the doc today. A truly student-owned portfolio needs a deliberate design.
2. **District accounts end.** District accounts and their Drive content typically go away after graduation, so the portfolio cannot live only in district Drive. The realistic model: the school keeps its own records and the student receives a copy through an export they trigger, with a prompt each spring and at graduation.
3. **Minors and consent.** Most students are under 18. Include only what the student opts into, keep it revocable, and treat the portfolio as a copy given to the student rather than a removal from school records. Check with the records officer and the district's data-privacy rules before any pilot.

### Suggested shape: four layers

1. **Artifacts.** Final work, plus drafts the student chooses to keep, each with a short student-written note on why it matters. Student curation is what makes it a portfolio and not an archive.
2. **Records.** Teacher-confirmed ratings and evidence keyed by competency ID and registry version, with dates, course and unit.
3. **Credentials.** Certifications, ideally in a recognized format. Open Badges 3.0 and the 1EdTech Comprehensive Learner Record are worth a look; what the district can issue or accept has not been checked.
4. **A concentrated context layer.** A one- or two-page `profile.md` with strengths, interests, goals and a summary of what the student can do, written or approved by the student, with AI-drafted parts labeled as such.

### Format for taking it along

A zip of plain files: Markdown for narrative, JSON or CSV for records, an artifacts folder, and a `manifest.json` with a schema version, IDs and file hashes. A KOS-style harness would load `profile.md` by default and pull deeper layers only when needed. It should work fully locally, since sending a minor's portfolio to a third-party AI service is a separate decision for the student and guardians.

### What stays out

Authenticity metrics, flags, review notes and baselines are school-side evaluative records, not the student's portfolio. Design them on the assumption that a student or parent could request them under FERPA.

### Build order

1. Hand-build the schema and manifest for one or two volunteer students and check whether a harness finds it useful before automating anything.
2. Add an "add to my portfolio" step on the dashboard so students choose what goes in.
3. Sync teacher-confirmed ratings into the records layer.
4. Add a student-triggered export and a spring reminder.
5. Add the context-pack builder, then credentials.

## 3. How the two threads connect

The mastery map is the school-side, evolving view used for instruction. The portfolio is the student-side, curated record they carry out. The competency graph helps both: it gives the map its anchors and gives the portfolio's records layer meaningful structure. Keep the map's inferences (gaps, unknowns, anchors) out of the portfolio unless the student chooses to include a summary.

## 4. Open items

- District policy on exporting student work and records, and on third-party AI tools for minors.
- Whether to begin with the graph file or the portfolio manifest draft.
- Which outside data sources, if any, are acceptable and approved.
- Who owns the portfolio during the school years, given that the admin account owns the docs today.

## 5. Thread C: lesson rollout and document distribution (added 2026-10-16)

**Goal.** A better way to roll out planned lessons and distribute documents to students, with less manual running of functions and with failures visible before class.

### What the code already gives

- Only the lesson-frame build is automated (a 2 a.m. trigger in `51_CourseYearBuilder`). Seeding assignments (`seedAssignments()`) and enrolling the roster (`applyRosterEnrollment()`) are run by hand from the editor, with no trigger and no menu entry.
- `seedAssignments()` can be re-run safely and skips lessons already in the matrix. Its window is lessons starting within 7 days.
- `enrollCanvasRoster_` takes the assignment's Config ID as an argument and has a built-in time budget; when it times out, a re-run resumes and skips students already enrolled.
- The Student Dashboard shows a card for every non-archived Ledger row a student has, with no date check, so distribution is simply the creation of the Ledger row.

### Suggested design: a nightly rollout job

One time-driven function around 4 a.m. that:
1. Seeds lessons starting within a chosen window (suggested 2 days out rather than 7).
2. Enrolls each newly seeded lesson, looping across runs until nothing times out.
3. Writes a counts-only line per course and lesson to a `RolloutLog` tab.
4. Feeds failures and stalls into the CAS signal's admin section so they reach the morning brief.

### Safeguards

- **Shadow first.** A script property such as `ROLLOUT_AUTO_APPLY` starts off; while off, the job only logs what it would do. It also serves as the kill switch.
- **Hold per lesson.** A `release` column in `LessonSchedule` (`AUTO` or `HOLD`).
- **Keep the human gates.** The 8177 prompt approval stays manual.
- **No new permissions** are needed, because the job calls functions that already exist in the Central Ledger project.

### The input that stays manual

The roster comes from Canvas gradebook CSVs exported into Drive. Assume Canvas API access is not available. The job can warn when the newest export is older than a threshold (suggested 7 days) so late joiners and section changes are not missed.

### Larger options, for later

- **Student-requested creation.** The dashboard lists upcoming lessons with a Start button that writes a request row; a trigger in the Central Ledger project creates the doc within about a minute. This handles absences, late joiners and section changes without waiting on a CSV, and keeps the Student Dashboard's permissions minimal. It is a larger change.
- **Fewer, persistent docs.** One doc per student per course, with lessons added as sections. This reduces Drive sprawl and suits the portfolio concept, but extractors and gates assume one doc per assignment with a ConfigID in the hidden system block, so it is a real refactor.

### How it connects to the other threads

- The rollout log and its CAS-signal line follow the same pattern as the `SubmitFailures` count: counts only, surfaced in the start brief.
- Persistent docs would line up with Thread B (the portfolio) and with paring down text on student documents.
- Student-requested creation pairs naturally with the mastery map: the dashboard could later suggest a lesson based on anchors and gaps.

### Not yet checked

- Whether Drive sends share-notification emails for each doc, which affects how many students can be enrolled at once.
- How long one doc takes to create, and so how many students fit in a single run.
- How `55_LessonSchedule` handles no-school days.

### Build order

1. The nightly job in shadow mode, with tests, as a second patch.
2. The `release` hold column and the stale-CSV warning.
3. The CAS-signal rollout line.
4. After a few weeks of clean logs, turn on auto-apply.
5. Consider student-requested creation or persistent docs once the portfolio design is settled.
