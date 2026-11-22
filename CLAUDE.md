# Instructions for Claude Code in this repo

Start with the newest handoff in `meta/` (`HANDOFF_<date>.md`) and the plan
it points to (`meta/PLAN_<month>.md`). Where they disagree with a README
or the code, the code wins.

## Repo map and commands

- `cas-ccps/` (the classroom system), `kos-personal/`, `leader-hub/`: each
  system's README is its map, its `HISTORY.md` the why. `cas-ccps/scripts/00_SharedConfig.js`
  is in every CAS project: tab names (`TABS`), each tab's columns, shared helpers.
- `tools/` ([README](./tools/README.md)): checks and generators; `tests/`
  ([README](./tests/README.md)); `meta/`: plans, handoffs, audits; `archive/`: old records.
- Before a PR: `npm run check` (every check CI runs, in its order; `npm run check:fast`
  skips the test suite). A stale `--check` is fixed by running the same command without it.
- A new file needs its folder's README touched (docs-check): a system's,
  `tests/README.md`, `tools/README.md`, or the root's.
- The traps earlier sessions hit: [`meta/AGENT_NOTES.md`](./meta/AGENT_NOTES.md).

## Reading the RTP's session logs (the build handoff)

The operator's thinking partner (the RTP, a Claude Project) closes each
session with a log. Since 2026-11-02, build work reaches Claude Code
through those logs rather than through a hand-kept queue (decided in the
11-02 session; code-side, so no SMP).

**Where they are.** Google Drive, through the Drive connector, in the
operator's KOS folder tree:
- `03.4_RAW_EXHAUST`: the raw copy ingestion keeps of each paste,
  `[RAW]_LOG-<hash>`, untouched. **Read these.** Each is the whole paste:
  the chat, then the RTP's log, which starts at the paste's last line
  beginning `KOS SESSION LOG —` (a chat can quote an earlier draft).
  Ignore the `[CHUNK_` and `[VC_` docs beside them.
- `03.5_INBOUND_SESSIONS/_PROCESSED`: the inbound copy, as the operator
  saved it. It is usually titled "Untitled document", so it can't be
  found by title.
- A log the operator pastes into the conversation counts the same.

Find them by searching Drive for documents titled `[RAW]_LOG-` created
after the last log read (a title search for `KOS SESSION LOG` finds
nothing: checked 2026-11-08). Never record a Drive file ID in the repo.

**Which ones are read.** `meta/PLAN_<month>.md`, section "From the RTP
session logs", says "Logs read through: <date>". Read every log dated
after it, oldest first, then move the date forward in the same PR.

**What counts as a build item, and what may be built.** Closeout lines
for Claude Code come in two kinds, and only the first is built:
- `DECISION (Claude Code): …`: the operator approved it in the session.
  It goes to Accepted.
- `Proposed (Claude Code): …`: the RTP suggested it and the operator did
  not approve it. It goes to Needs you, never to Accepted, however good it
  looks, until the operator says build it (in a session log as a
  DECISION, or to Claude Code directly). A log from before 2026-11-07
  that has neither label: treat its items as Proposed unless the
  exchanges show the operator approving them.
Read the exchanges behind each item too: the reasoning is why the logs
are the handoff. Operator-owned steps, personal items and anything about
students or families are not build items.

**What to write.** One row per item in that plan section: the item in
your own words, where it came from (date and #), your take, and when.
**Push back there** when the code says otherwise, the item rests on a
wrong premise, or a smaller change does the job; check the code before
agreeing. A closed item says where it went (a PR, a decision, dropped and
why).

**What never goes in the repo.** Log text beyond an item's name; names of
students, family members or colleagues; family or conference details;
Drive IDs or links; anything from the operator's private life. The logs
are personal records and this repo may be public.

## Answering the RTP: `KOS_CODE_REPLY`

After reading new logs, rewrite the Google Doc `KOS_CODE_REPLY` in the
operator's Drive (one doc, rewritten in place; find it by name, never
record its ID). It is a view of the plan section, never edited by hand:

    Generated at: <yyyy-MM-dd HH:mm> (America/New_York) by Claude Code
    Claude Code's reply — logs read through <date>
    Accepted <n> · Pushback <n> · Needs you <n>
    PUSHBACK
    - L3 (11-02 rollout count): <one sentence, citing the code>
    NEEDS YOU
    - L9 (#19): <the decision, as a question>
    ACCEPTED
    - L1 (11-03 #8 release checks): <what will be built; PR when there is one>

The RTP reads the counts at `start`, opens Pushback and Needs you only,
and answers each once in its closeout's `Code review:`. Read those answers
with the next log. **One round per item:** if the RTP still disagrees,
the item moves to Needs you with both positions, **each in its own
author's words**: Claude Code's sentence, and the RTP's `Code review:`
sentence quoted verbatim and marked as the RTP's. Never rephrase the
other side's position; never argue a second round. Only a disputed item
waits; the rest proceeds. (The verbatim quote lives in this Drive doc
and the weekly review, not in the repo, which keeps no log text.)

The `Generated at:` line is what the RTP checks: it can't read the repo,
so it treats a missing stamp as `[UNCONFIRMED — KOS_CODE_REPLY]`, and
compares "logs read through" with its own latest log to see whether a
reply is still pending. Never write the doc without the stamp.

## The weekly review (Sundays)

A scheduled Claude Code run on Sunday evening rewrites the Google Doc
`KOS_WEEKLY_REVIEW`; `sendWeeklyReview()` (kos-personal, 26) mails it on
Monday at 06:00, or mails that it is missing. It exists so the loop is
never silent: accepted items are listed too. One page, plain text:

    KOS weekly review — week of <Monday's date>
    THE LOOP: logs read <n> (<dates>); items Accepted <n>, Pushback <n>, Needs you <n>
    NEEDS YOU (each as a question)
    DECIDED WITHOUT YOU THIS WEEK (each accepted item, one line)
    BUILT: PRs merged this week, one line each; what is merged but not pushed
    PUSHBACK STILL OPEN, with both positions
    RTP HARNESS NOTES added this week
    FIDELITY: (a) findings this week; (b) drawn / compared / overdue, from the primer's Fidelity line
    NEXT WEEK: the plan's window for the coming week, from the plan

Same rules as the plan: no log text, no names, no Drive IDs. If no log
arrived this week, say so in THE LOOP line.

- **A pushback stays open until the RTP answers it** in a closeout's
  `Code review:`. Building a smaller change does not close it. List every
  item `KOS_CODE_REPLY` shows under PUSHBACK with Claude Code's sentence,
  and "the RTP has not answered yet" until a log carries its answer.
- **What is live** comes from the newest handoff's "What is live"
  section (the operator reports pushes there), not from older plan text.
- **Items on hold are not questions.** A decision the plan marks paused or
  with no date (packaging, D10, D11, L1's gate) goes on one "On hold:"
  line under NEEDS YOU, not as a question for the week.

**The Sunday run has no one watching, so its limits are fixed** (and
written into the scheduled task's prompt, which the operator reads before
saving it): the repo is read-only (no commits, branches, PRs or pushes);
in Drive it writes only `KOS_WEEKLY_REVIEW`; it never opens CAS or
LeaderHub files (the Central Ledger, the dashboards' sheets, student
docs), the same boundary the RTP works under. Building stays in sessions
the operator starts.

## Closeout fidelity (decided 2026-11-07)

A log is the RTP's own distillation, so it can't be checked against
itself; the chat the operator pastes ahead of it can. Two checks:

- **(a) Every log.** Check the closeout against the log's own exchanges:
  every `DECISION:` line appears under "Decisions made"; no
  Claude Code item labelled `DECISION` lacks an exchange where the operator
  approved it; thresholds and pauses in the exchanges appear under
  Alignment; nothing in the closeout is stronger, softer or newer than
  the exchanges behind it.
- **(b) A random 10%, drawn by Apps Script** (`27_FidelitySample.gs`) when
  the log is ingested, after the RTP wrote it. A drawn log is a
  `FIDELITY_AUDIT` row in BRAIN_TRUST_INDEX. The operator pastes the whole
  chat with the log at its end, so the transcript is the raw copy,
  `[RAW]_<Session_UID>` in `03.4_RAW_EXHAUST` (the row's
  `Transcript_Name`), and the row starts RECEIVED. Only a log pasted
  without its chat asks for a Doc named `TRANSCRIPT — <Session_UID>` in
  `03.6_SESSION_TRANSCRIPTS`, and turns RECEIVED when it arrives. For each
  RECEIVED row, first list the log's exchanges with no chat behind them
  (a paste can skip the middle of a chat), then compare the rest: what the
  log omits, softens or gets wrong. Then, through the Sheets connector,
  write only that row's `Compared_At`, `Result` (`MATCHES`,
  `DIFFERS: <n>`, and `PARTIAL: <k> of <n> exchanges covered` when chat
  is missing, e.g. `PARTIAL: 6 of 48 exchanges covered; MATCHES`) and
  Status `COMPARED`. Never write any other cell, row or tab. A partial
  copy is a finding too: the closeout for the uncovered exchanges went
  unchecked.

Findings from either go under "RTP harness notes" (no log or transcript
text in the repo); a material one is also a Needs-you line. The daily
primer reports what waits on whom and what's overdue; the weekly review
carries the counts.

## The logs as data about the RTP itself

The logs also show how the RTP harness behaves
(`kos-personal/claude-project/`): what it got wrong, what it couldn't
see, and where it guessed. When a log shows a harness problem (a wrong
citation, a claimed permission it didn't have, a fact it couldn't read
from the repo), note it under "RTP harness notes" in the same plan
section, without log text, and propose the instruction or briefing-doc
change that would have prevented it.

## The archive

Superseded docs and the history logs' older entries are in `archive/`,
filed by school quarter, out of everyday search (the root `.ignore`).
To find something there, use `node tools/archive/search.js` (filters by
quarter, kind, system, dates, a `#N` cited, then a pattern; see
`tools/archive/README.md`), not a grep of `archive/` whole. Archive a
doc or a folder with `node tools/archive/file.js <path> --summary "…"`
and review the references it rewrites; when a plan of record is
replaced, roll the history logs over with `--rollover-logs --before
<the new plan's start>` in the same PR. CI checks the catalog and
indexes.

## Working agreements (from the plan)

One PR per change, CI green, merged on the operator's "merge". The
operator runs everything live and pastes the logs; don't assume a run
happened. FERPA: student data stays in Google; counts only.

## Keeping debt down (from the 2026-11-20 structure audit)

What built the debt the audit found, and the rule each led to. A rule
marked "check" is held by CI; the rest are how a session works.

- **Copies drift.** Apps Script has no imports, so the smallest change was
  always a local copy: one tab's columns in five files, three zip readers,
  three deploy reports. The second time code is copied, it moves to one
  place: 00 (cas-ccps), `tools/lib/`, or `shared/` with a sync script and a
  test. gas-lint's `second-copy` check fails on an identical function body
  in two files of one system; a pair that must stay is named, with why, in
  `tools/gas-lint/second-copy-allow.json`.
- **Retiring is deleting.** A retired file stayed deployed "for reference",
  and comments, tests and docs kept citing it. The PR that retires a
  feature deletes its code, tests and mentions, and leaves one HISTORY.md
  entry; `tools/archive/file.js` keeps a doc that matters. gas-lint's
  `unused-file` check fails on a deployed file nothing in its project uses
  (no public function, no declaration another file names).
- **Files grow where adding is easiest.** 63% of the Teacher Dashboard was
  one string. gas-lint's `size-budget` check is a ratchet: a deployed file
  over 1,500 lines, a string literal over 100 or a README over 250 fails
  unless `tools/gas-lint/size-budgets.json` lists it with its size and why,
  and a listed one may not grow.
- **Comments describe the present.** Dates and "used to" belong in
  HISTORY.md; a header gives purpose, triggers and the data boundary.
- **A check is accurate before it gates.** A new check runs over the repo
  first and its false positives are fixed (the stale-ref warning reported
  107 lines, none truly stale). It then fails CI, with a named exceptions
  list for what predates it (`*Data.js`, `flowCheckNames.exceptions`),
  rather than warning forever.
- **Measure before building on a claim.** An audit, review or plan item is
  checked against the code first, as a log item is; record the pushback.
  (3.7 asked for a registry that existed; 4.6 estimated 943 lines, the
  count was ~400.)
- **Mechanical edits prove they changed nothing.** A refactor across many
  files shows equivalence first: a byte-identical render, a generator's
  `--check`, the same test count. A bulk edit matches narrowly and is read
  line by line; never blanket-replace across tests.
- **Status is generated or tabulated.** Counts and indexes come from the
  repo (`SCRIPT_INDEX.md`, the setup guide reference). A status a person
  keeps is a table, one row per item, never a growing sentence.
- **One branch per PR.** After a squash merge, start the next PR's branch
  from main. A merge approval names the PR or the series.
- **Each quarter,** rerun the audit's measurements (file and literal sizes,
  copies, stale references, checks that disagree) so the counts are a trend,
  not a surprise.
