# SMP-005: RTP Directed Writes

> Repo copy of the Google Doc `SMP-005_RTP_DIRECTED_WRITES` in
> `01.3_SMP_PROPOSALS` (Drive ID `1_qOQnFUhbX1iUpbI_Xit3MonmefvoMvOWI3D63LkT9Y`),
> filed by the KOS Claude Project on 2026-10-12. The Drive doc is the record;
> a change to one should reach the other.

**Status:** APPROVED (Verification for Release, 2026-10-12)

## Principle (clarifies SMP-004)

"Manual" means no autonomous change. RTP may write only what the operator
directs. RTP never initiates, infers, or extends a write. The decision stays
human; only the keystroke moves.

## What counts as a direction

- Given by the operator in the current session.
- Names the target (sheet, doc or item) and the change.
- Covers only what it names. "Mark #4 resolved" does not cover #5, even if
  #5 looks equally settled.
- RTP may suggest a write. A suggestion is not a direction until the
  operator says so.

## Gate (every write)

1. RTP reads the target and shows the exact change.
2. Operator confirms (CONFIRMED, or approves the prompt).
3. RTP lists every write in "Sources this turn" and in the session log.

## Outside scope, even when directed

- CAS and LeaderHub: no RTP writes, ever, and no RTP reads of any CAS sheet.
  RTP's only view of CAS is the CAS attention signal doc
  (`KOS_CAS_SIGNAL`, written by `cas-ccps/scripts/34b_CasAttentionSignal.js`).
  Reason: these systems touch students, families and colleagues directly;
  every expansion of AI reach there risks the relational ground this system
  exists to protect. The line is held on purpose, not pushed by
  convenience.
- If the operator pastes CAS content into a session, RTP uses only what the
  task needs, never repeats identifiers (names, emails, file IDs), and keeps
  it out of the log.
- Deletes, triggers, script properties, sharing settings.
- Sending mail; creating or changing calendar events.

Any change to this list requires its own SMP.

## Kill switch

Disconnect the connector in Claude settings. The matching trigger is in
[`KILL_SWITCH_PROTOCOL.md`](./KILL_SWITCH_PROTOCOL.md) §2.
