# Capturing and Curating Cognitive Exhaust: Suggestions

> **Decided 2026-10-17:** assignment docs only (not warm-ups); no status or
> flag on the student's doc, results on the Teacher Dashboard only; the
> county's account monitoring covers the policy question in §4; no students
> to exclude. The collector still waits on the `revisionProbe`.
>
> **revisionProbe run 2026-10-18** (one student assignment doc, counts only):
> 6 revisions over 9 days. Drive merges a whole sitting into one revision
> (one revision added 2,858 characters), so typing and pasting can't be told
> apart: the paste and largest-jump metrics are dropped. The doc's creation
> from the template and system edits (header, feedback) appear as revisions,
> with 2 distinct editors, so a collector must filter them. Still measurable:
> editing days or sessions, first student edit to submission, length at each
> submission and the change since the last, and a non-student, non-system
> editor. The `text/plain` export of each revision works, but Drive returns
> HTTP 429 to rapid fetches, so a collector must space them. Finer detail
> would need forward snapshots (a length check on modified docs every few
> minutes), which still can't separate typing from pasting within the
> interval. Recommendation: build only the lean collector, after Oct 30, or
> drop it; the operator decides.
>
> **Filed 2026-10-17** from the operator's 2026-10-16 handoff package.
> Suggestions only; nothing here is built. Where it sits in the order of
> work: [`HANDOFF_2026-10-22.md`](./HANDOFF_2026-10-22.md).

Prepared 2026-10-16. Suggestions only; nothing here is built yet. "Cognitive exhaust" is read as the process traces students leave while producing work: drafts, revisions, attempts and pauses. It builds on the authenticity-review plan (log revision-history metrics for every submission, baseline across students and assignments, flag anomalies for review with the student). Student writing stays out of any log; only numbers and timestamps are kept.

## 1. Capture

1. **Start with what the pipeline already records.** The system already keeps a trajectory across attempts: `CHECK_COUNT`, `LAST_RESULT`, `FIRST_PASSED_AT`, the milestone outcomes per attempt in `CompetencyEvidence`, and the full evaluation output in `FlowInput`. A view such as "milestone 4 went from NOT_MET to MET on the third attempt" needs no new capture, and it is the most useful trace pedagogically.
2. **Capture at points already controlled.** Collect at submission and at harvest rather than watching continuously. Each submission triggers one incremental read of the doc's revisions since the last snapshot.
3. **Make intentional exhaust cheap.** On a resubmission, ask the student for a one-line note: what did you change and why? It is the strongest authenticity signal available, because the student explains their own process, and it can be compared with the revision metrics in a conversation.
4. **Keep an append-only event log** with a small fixed schema (event, timestamp, student key, assignment, a few numbers). Store derived features, not text. Append-only means baselines can be recomputed whenever a definition changes.
5. **Capture structure, not content.** Record which milestone's section changed between submissions, how large the change was, and whether the milestone outcome moved. That answers "did the student act on the feedback?", which is a growth question as well as an integrity one.
6. **Instrument the dashboard last.** Clicks and time on the page are low value for the effort and the most intrusive.

## 2. Curate

1. **Tier the retention.** Suggested: fine-grained traces (the per-revision word-count series) for about a term; per-submission features for the school year; per-student unit summaries after that. The only long-term records are the competency records, which fits the definition of academic records already in use. Confirm with the records officer that process data stays outside that definition, particularly if a flag ever leads to a concern outcome.
2. **Make every metric answer a decision.** If a number does not feed a flag, a student view or a calibration step, do not capture it.
3. **Version the features.** Add a `feature_version` column so a changed definition never silently mixes into old baselines.
4. **Treat review decisions as the most valuable data.** Every CLEARED or CONCERN outcome is a labeled example for tuning thresholds, so keep it with the flag.
5. **Use pseudonymous keys in analysis tabs.** Join to identity only on the Ledger side, which already holds those keys.
6. **Let teacher confirmation gate inference.** This matches the shadow-matrix rule: process signals surface to the teacher first and do not feed competency confidence unless confirmed.
7. **Give students their own view.** Show each student a plain-language summary (for example, "you revised 3 times, and milestone 4 moved to met") and a short page on what is recorded. This fits the principle that observations appear to students in context rather than as raw scores, and it makes the system a growth tool.

## 3. Suggested build order

1. The attempt-trajectory view, built from data that already exists.
2. The resubmission process note.
3. Revision-history metrics, after the revision probe shows how much detail Drive returns for these docs.
4. Baselines and flags.
5. The student-facing summary.

## 4. Open items

- **Revision detail (answered 2026-10-18 by the probe):** coarse, one revision per sitting or so. The paste and largest-jump metrics below can't be computed from history; see the note at the top.
- **District policy and disclosure.** Confirm what monitoring and AI-use policy applies, and tell students the check exists.
- **Accommodations.** Keep a teacher-set "do not flag" list, with no reason recorded, for students whose workflows (dictation, assistive technology) look like pastes or jumps.
- **FERPA map and retention.** Any new tab derived from student work belongs in the FERPA data map and the retention schedule.
- **Interpretation.** If "cognitive exhaust" was meant as the teacher's own working traces (chats, notes, decisions) rather than student process data, this document needs a different second half.

## Appendix: the authenticity-review plan this builds on

- **Ground rules:** metrics only, never revision text; a flag is a prompt for a conversation and never changes a grade or Ledger status; a per-student teacher-set exclusion list with no reason recorded; confirm district policy and tell students the check exists.
- **Logged per submission** (one row in an `AuthenticityLog` tab, every submission): revision count, active editing span, number of sessions (gaps over about 30 minutes), minutes from assignment start to first response text and from last edit to submission, a compact word-count series, the largest single-revision jump in words and its share of the final text, words added versus deleted, final word count, and whether anyone other than the student edited the response zone. The collector lives in the Central Ledger project, on a time trigger with capped loops.
- **Baselines:** the cohort for that assignment (and section) and the student's own history; robust statistics (medians and percentiles); no flag until the cohort has roughly 8 submissions and the student roughly 3; recomputed weekly into an `AuthenticityBaseline` tab.
- **Flags:** a soft flag when unusual against both the student's history and the cohort; a hard flag for a non-student editor in the response zone. Review workflow in `AuthenticityReview`: NEW, CONVERSATION SCHEDULED, CLEARED, CONCERN, plus a teacher note and a conversation prompt per flag type.
- **Rollout:** probe, collector in shadow mode, baselines and silent flags, flags on the Teacher Dashboard, monthly calibration.
