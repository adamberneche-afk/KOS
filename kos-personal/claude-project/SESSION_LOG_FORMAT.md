# SESSION_LOG_FORMAT

How a Claude session becomes a KOS session log. Upload this file to the
Claude Project's knowledge; the Project instructions point to it.

## How the pipeline reads it

- **Drop point.** The operator pastes the log into a new **Google Doc** in
  the Drive folder `03.5_INBOUND_SESSIONS`. `sensor1_scanInboundSessions()`
  (`kos-personal/2_Ingestion_Sensors.gs`) reads only Google Docs there,
  every 5 minutes, and skips anything under 50 characters.
- **Duplicates.** The session ID is a hash of the text, so dropping the same
  log twice is skipped. Any edit makes it a new session.
- **Chunks.** The text is split at every `[🧠 RTP` marker
  (`CFG.DELIMITER`), so **every exchange starts with that marker**. Each
  chunk goes to the Curator flow (decisions, next steps, alignment
  observations) and the classify flow (Vector State).
- **No JSON.** The Curator writes its own JSON. A JSON block in the log is
  ignored or misread (Curator rule 9), so the closeout below is plain text.

## The format

```
KOS SESSION LOG — {YYYY-MM-DD} — {one-line topic}
Source: Claude Project (KOS Thinking Partner)

[🧠 RTP — EXCHANGE 1]
OPERATOR: {what the operator asked or said, faithfully; condense long
pastes to what mattered}
RTP: {the substance of the answer: reasoning, options weighed, what was
recommended. Name the persona when one led, e.g. "ARCHITECT: …".}
DECISION: {a binding decision made in this exchange, or "none"}

[🧠 RTP — EXCHANGE 2]
…

[🧠 RTP — CLOSEOUT]
Decisions made:
- {decision} (owner: operator | {persona})
Deferred decisions:
- {question still open} (owner: {who}; blocking: {what it blocks})
Next steps:
- {action} (owner: {who}; by: {date or "unscheduled"})
Alignment:
- Status at close: {GREEN | YELLOW | RED}
- Thresholds crossed: {A/B/C/D and the operator's answer, or "none"}
- Relational check-in this session: {yes: who | no}
```

## Rules

- **One exchange per real turn.** Don't merge the whole session into one
  block, and don't invent turns. The classify flow scores each exchange.
- **Decisions are explicit.** A decision the operator approved is written
  as `DECISION:`. A suggestion that wasn't approved is not a decision.
- **No student data.** No student names, grades, rosters or student
  messages, even when they came up. Write "a student matter" instead.
- **No email addresses, account IDs or passwords.**
- **Plain text only.** No JSON, no tables; markdown bullets are fine.
