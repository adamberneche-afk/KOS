# claude-project/

The KOS thinking partner as a **Claude Project**, replacing the RTP Gem as
the place where the operator plans, decides and builds
(`meta/PLAN_2026-10.md`). The Gem and `RTP_CORE_ROUTER_V6_0.md` are frozen.

**Status:** set up 2026-10-11 with the knowledge files; `start` passed.
Gmail and Google Calendar connectors added 2026-10-11, with sending turned
off; `start` now reads them, and student and parent mail through the
`KOS_FAMILY_SIGNAL` doc (2026-10-12). Later on 2026-10-12 the operator
edited the instructions by hand for directed writes (SMP-018, filed as
SMP-005), the CAS attention signal and students-and-families first;
`PROJECT_INSTRUCTIONS.md` matches them, and adds the SMP register link
(`meta/SMP_PROCESS.md`). Later still (reported 2026-10-12): the
family-signal link now opens the `KOS_FAMILY_SIGNAL` doc, the
`KOS_CAS_SIGNAL` and `KOS_SMP_REGISTER` docs exist and the instructions
were updated, and `KILL_SWITCH_PROTOCOL.md` was re-synced in knowledge.
Left: re-test `start`. No SMP goes into knowledge.

| File | What it is |
|---|---|
| `PROJECT_INSTRUCTIONS.md` | Paste into the Project's Instructions, after filling in the doc links |
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
- **Mail and calendar, read-only.** The operator connected Gmail and Google
  Calendar on 2026-10-11 and turned off sending. `start` adds today's
  calendar (school, Canvas due dates and a personal calendar if one is
  subscribed) and the mail that needs the operator. Mail can carry student
  information, so every mail search excludes the `KOS/Family` label,
  `student.ccpsnet.net` and Canvas, and anything about a student that still
  turns up is counted, never read or quoted.
- **Student and parent mail, without the mail.** It is the most urgent mail,
  so `start` gives it first, from the `KOS_FAMILY_SIGNAL` doc: one line per
  thread waiting on the operator (course, period, category, a one-line ask,
  hours waiting), no names or text. cas-ccps's Family Mail Sentinel writes
  it and labels the threads `KOS/Family`; Gemini, in a Workspace Flow, does
  the triage (`cas-ccps/docs/FAMILY_MAIL_SENTINEL.md`). Mail arriving
  between two 15-minute scans is the remaining gap.
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
2. Get the six doc links. In Drive, open each Google Doc and copy its
   URL (each is a Google **Doc**, never a spreadsheet):
   - `KOS_LATEST_PRIMER`
   - `KOS_OPEN_DECISIONS`
   - `KOS_CORE_FACTS`
   - `KOS_FAMILY_SIGNAL` (once the Family Mail Sentinel is set up; until
     then leave the placeholder, and `start` reports it as unconfirmed).
     Not the *Family Mail Sentinel* spreadsheet: that sheet holds student
     emails and family contacts, which the Project must never read.
   - `KOS_CAS_SIGNAL` (created by the first Central Ledger watchdog run
     after `34b_CasAttentionSignal.js` is pushed; its ID is in the Script
     Property `CAS_SIGNAL_DOC_ID`)
   - `KOS_SMP_REGISTER` (created by the first kos-personal morning run,
     or `generateBriefingDocs()`, after the SMP register code is pushed)

   They keep the same file ID every day; Apps Script rewrites them in
   place.
3. Paste `PROJECT_INSTRUCTIONS.md` (everything below its line) into the
   Project's Instructions, with the links filled in. The easy way: put the
   six links in `clasp-registry\kos-project-links.txt`, one
   `NAME=https://...` per line (`KOS_CAS_SIGNAL=https://docs.google.com/...`),
   then run `node run.js --latest --instructions` where you run pushes
   (`tools/clasp-sync/README.md`). It fills the placeholders, keeps
   only the text below the line and copies it to the clipboard. Do the
   same after any change to the instructions; a push run reminds you.
4. Add to the Project's knowledge:
   - `SESSION_LOG_FORMAT.md`;
   - the six `rtp-core-router/notebook-sources/PERSONA_*_V5_1.md` (the
     notebook editions, each opening with a core block);
   - `rtp-core-router/notebook-sources/TURN_LOOP_REFERENCE.md`;
   - `rtp-core-router/protocols/COLD_BOOT_PROTOCOL.md`,
     `KILL_SWITCH_PROTOCOL.md` and `RULE_CONFLICT_RESOLUTION_PROTOCOL.md`
     (re-sync `KILL_SWITCH_PROTOCOL.md` after 2026-10-12: it gained the
     SMP-018 trigger). SMPs are not knowledge files: the Project reads them
     from `KOS_SMP_REGISTER` (`meta/SMP_PROCESS.md`).
5. Connect the **Google Drive**, **Gmail** and **Google Calendar**
   connectors on the school account, and allow them in the Project. In
   Gmail's connector settings, turn off sending (done 2026-10-11).
   Optional, for personal events: see "Personal calendar" below.
6. Test it: start a chat and say `start`. Pass means:
   - the primer's date is today's;
   - the vision is quoted exactly;
   - Vector State opens with the Data Quality status;
   - five open decisions are listed with their IDs;
   - family mail comes next, read from `KOS_FAMILY_SIGNAL` as written;
   - "Today" lists today's events from the school calendar and Canvas,
     and personal ones marked `(personal)` if that calendar is subscribed;
   - "Other mail" lists up to five messages from the last day, with no
     student, parent or Canvas mail.

## Daily use

- **Start:** `start`, by voice or typing.
- **Work:** plan, decide, draft. Drafts stay drafts until you verify them.
- **End:** `log this`. Copy the code block into a new Google Doc in
  `03.5_INBOUND_SESSIONS`. The pipeline picks it up within 5 minutes, and
  the next morning's primer and decisions reflect it.

## Personal calendar (iPhone)

Claude reads calendars through the school Google account, so a personal
calendar shows up only if that account subscribes to it. Its events then sit
in the school account, which the district can see; subscribe only a
calendar you're comfortable having there.

- **iCloud calendar** (the iPhone default): on the iPhone, open Calendar,
  tap **Calendars**, tap ⓘ next to the calendar, turn on **Public
  Calendar** and share the link to yourself. Anyone with the link can see
  the events. In Google Calendar on the web (school account), choose
  **Other calendars → + → From URL** and paste it. The Canvas calendar was
  added the same way, so the school account allows it.
- **Personal Google calendar:** share it with `adam_berneche@ccpsnet.net`
  from the personal account (Settings → Share with specific people). The
  district may block sharing from outside it; if so, use the iCloud route.

Google refreshes a URL subscription every few hours, so a personal event
added this morning may not appear in today's `start`.

## Commute trial (one week from setup)

**Result, 2026-10-17: Claude.** Gemini Live with the RTP Gem was not
consistent enough to use; Claude voice in this Project is the commute
assistant. The section below is kept as the trial's record.

Use Claude voice in this Project on some days, and Gemini Live with the RTP
Gem as it is on others. Note which gave a consistent brief and a useful
conversation. Report the result; it decides whether the Gem retires early.
Both now read mail and calendar (the Gem through its app chips), so compare
the whole brief: state, decisions, today's calendar and mail.
