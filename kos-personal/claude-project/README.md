# claude-project/

The KOS thinking partner as a **Claude Project**, replacing the RTP Gem as
the place where the operator plans, decides and builds
(`meta/PLAN_2026-10.md`). The Gem and `RTP_CORE_ROUTER_V6_0.md` are frozen.

| File | What it is |
|---|---|
| `PROJECT_INSTRUCTIONS.md` | Paste into the Project's Instructions, after filling in the three doc links |
| `SESSION_LOG_FORMAT.md` | Upload as Project knowledge. The shape `log this` produces, matched to what the pipeline's intake reads |

## What changed from the Gem, and why

- **State is read by link, not retrieved.** The Gem's notebook search
  returned passages, often missed the primer and dropped the Data Quality
  block (`rtp-core-router/notebook-plan/05_TEST_LOG.md`). The Project opens
  `KOS_LATEST_PRIMER`, `KOS_OPEN_DECISIONS` and `KOS_CORE_FACTS` whole,
  through Claude's Google Drive connector (school account, approved
  2026-10-06; none of the three holds student data).
- **No app chips, no first-message resend, no 10,000-character cap.** Those
  were Gemini workarounds.
- **No school mail or calendar.** Mail can carry student information, so it
  stays in Google. `start` gives the KOS state and open decisions, then
  asks what the session is for.
- **Same council and guardrails.** The six personas, ALIGNMENT's A–D
  thresholds and pause, and the HITL firewall carry over from V6.0, made
  lighter: personas speak when they sharpen the thinking, without a
  Pre-Flight and State Sync block on every turn.
- **Sessions still feed the pipeline.** `log this` writes a session log in
  the intake's format. The operator pastes it into a Google Doc in
  `03.5_INBOUND_SESSIONS`, and the existing intake, Curator and classify
  flows turn it into decisions, Vector State and the next primer.

## Setting it up (operator, once)

1. On claude.ai, create a Project named **KOS**.
2. Get the three doc links. In Drive, open each Google Doc and copy its
   URL:
   - `KOS_LATEST_PRIMER`
   - `KOS_OPEN_DECISIONS`
   - `KOS_CORE_FACTS`

   They keep the same file ID every day; Apps Script rewrites them in
   place.
3. Paste `PROJECT_INSTRUCTIONS.md` (everything below its line) into the
   Project's Instructions, with the three links filled in.
4. Add to the Project's knowledge:
   - `SESSION_LOG_FORMAT.md`;
   - the six `rtp-core-router/notebook-sources/PERSONA_*_V5_1.md` (the
     notebook editions, each opening with a core block);
   - `rtp-core-router/notebook-sources/TURN_LOOP_REFERENCE.md`;
   - `rtp-core-router/protocols/COLD_BOOT_PROTOCOL.md`,
     `KILL_SWITCH_PROTOCOL.md` and `RULE_CONFLICT_RESOLUTION_PROTOCOL.md`.
5. Connect the **Google Drive** connector on the school account, and allow
   it in the Project.
6. Test it: start a chat and say `start`. Pass means:
   - the primer's date is today's;
   - the vision is quoted exactly;
   - Vector State opens with the Data Quality status;
   - five open decisions are listed with their IDs.

## Daily use

- **Start:** `start`, by voice or typing.
- **Work:** plan, decide, draft. Drafts stay drafts until you verify them.
- **End:** `log this`. Copy the code block into a new Google Doc in
  `03.5_INBOUND_SESSIONS`. The pipeline picks it up within 5 minutes, and
  the next morning's primer and decisions reflect it.

## Commute trial (one week from setup)

Use Claude voice in this Project on some days, and Gemini Live with the RTP
Gem as it is on others. Note which gave a consistent brief and a useful
conversation. Report the result; it decides whether the Gem retires early.
