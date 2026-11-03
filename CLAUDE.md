# Instructions for Claude Code in this repo

Start with the newest handoff in `meta/` (`HANDOFF_<date>.md`) and the plan
it points to (`meta/PLAN_<month>.md`). Where they disagree with a README
or the code, the code wins.

## Reading the RTP's session logs (the build handoff)

The operator's thinking partner (the RTP, a Claude Project) closes each
session with a log. Since 2026-11-02, build work reaches Claude Code
through those logs rather than through a hand-kept queue (decided in the
11-02 session; code-side, so no SMP).

**Where they are.** Google Drive, through the Drive connector, in the
operator's KOS folder tree:
- `03.5_INBOUND_SESSIONS/_PROCESSED`: each session log after ingestion,
  as the operator saved it. Read these.
- `03.4_RAW_EXHAUST`: the raw copy, `[RAW]_LOG-<hash>`. Only if the
  processed copy is missing.
- A log the operator pastes into the conversation counts the same.

Find them by searching Drive for documents titled `KOS SESSION LOG` and
modified after the last log read. Never record a Drive file ID in the repo.

**Which ones are read.** `meta/PLAN_<month>.md`, section "From the RTP
session logs", says "Logs read through: <date>". Read every log dated
after it, oldest first, then move the date forward in the same PR.

**What counts as a build item.** A closeout "Next steps" line with owner
Claude Code, and a deferred decision Claude Code is asked to verify. Read
the exchanges behind it too: the reasoning is why the logs are the
handoff. Operator-owned steps, personal items and anything about students
or families are not build items.

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

## The logs as data about the RTP itself

The logs also show how the RTP harness behaves
(`kos-personal/claude-project/`): what it got wrong, what it couldn't
see, and where it guessed. When a log shows a harness problem (a wrong
citation, a claimed permission it didn't have, a fact it couldn't read
from the repo), note it under "RTP harness notes" in the same plan
section, without log text, and propose the instruction or briefing-doc
change that would have prevented it.

## Working agreements (from the plan)

One PR per change, CI green, merged on the operator's "merge". The
operator runs everything live and pastes the logs; don't assume a run
happened. FERPA: student data stays in Google; counts only.
