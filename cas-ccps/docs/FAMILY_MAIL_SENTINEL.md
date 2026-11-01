# Family Mail Sentinel

Student and parent mail is the most urgent mail the teacher gets, and the one
kind Claude must not read. The sentinel lets the KOS Claude Project's
`start` brief say how urgent that mail is, without names or wording.

- **Code:** `cas-ccps/scripts/60_FamilyMailSentinel.js` (Apps Script project
  `cas-ccps:family-sentinel`). Its file header is the full design.
- **Prompt:** [`FAMILY_MAIL_TRIAGE_PROMPT.md`](./FAMILY_MAIL_TRIAGE_PROMPT.md),
  generated into `61_FamilyMailPrompt.js`.
- **Tests:** `tests/cas-ccps/family-mail-sentinel.test.js`.
- **Status:** live since 2026-10-12. The Flow answered its fixture on the
  first run and the safety push was tested end to end.

## How it works

```
 Gmail (school account)          Apps Script, every 15 min        Workspace Flow
 ─────────────────────           ─────────────────────────        ──────────────
 new mail ──────────────────▶  is it family mail?
                                 yes → label KOS/Family
                                       safety words? → KOS/Family/Now
                                       redact names, numbers ──────▶ Gemini: category,
                                                                     urgency, safety,
                                 harvest ◀────────────────────────── one-line ask
                                 check the ask names nobody
                                 delete the mail text
                                 rewrite KOS_FAMILY_SIGNAL ──▶ read by the KOS Claude Project
```

**Family mail** is mail from a student (`@student.ccpsnet.net`), from an
address in the sheet's `FamilyContacts` tab or the Central Ledger's
`ParentReportLog`, a colleague's or Canvas's mail that names a rostered
student, an outside sender naming a rostered student, or any reply in a
thread that is already family mail. The roster is the Central Ledger's
`Ledger` tab; a full name matches with a hyphenated or several-word surname
too ("Smith-Jones", "De La Cruz"), in either order. **Never family mail:**
Google's system notices (`FMS_SYSTEM_SENDERS`: Drive shares, Docs
comments, Classroom), even when they name a student. When Gemini says an
outside sender's message is not family mail, `KOS/Family` comes off its
thread only if no other message in the thread is family mail, flagged, or
still waiting on Gemini.

**The signal doc** (`KOS_FAMILY_SIGNAL`, the same file every run) looks like:

```
KOS_FAMILY_SIGNAL
Generated at: 2026-10-14 06:45 (America/New_York)
...
NEEDS YOU NOW: 1 message, not summarized.
Needs you now · waiting 2 h · open

WAITING ON YOU: 3, oldest 26 h.
#1 · 8175 P4 · from a parent · grade question · The parent asks to explain the rubric score · waiting 26 h · 2nd contact this week · urgent · open
#2 · sensitive · waiting 30 h · open

FOR YOUR EYES: 2, oldest 9 h.
#3 · 8177 P6 · thanks · The parent thanks the class for the event · waiting 9 h · open
#4 · 8175 P3 · other · The student shares a link to the finished poster · waiting 4 h · open

ANSWERED IN THE LAST 7 DAYS: 9, median reply 6 h.
```

Each "open" links to the Gmail thread. Numbers are reassigned every run, so
`#1` never follows a family from one day to the next.

**Two tiers.** WAITING ON YOU (with NEEDS YOU NOW, counted in it) is the
mail that needs a reply; FOR YOUR EYES is the rest, with course, category,
ask and wait, never "urgent". Gemini says `needs_reply`; a missing or
unreadable answer counts as true, and it is forced true by any of:

- a safety flag (the tripwire or Gemini's);
- a sensitive category;
- urgency 4 or more;
- a due date;
- the family's 2nd or later contact this week;
- no classification (the Flow down, or an unusable answer).

A thread is WAITING when any message since the teacher's last reply needs
one, so a needs-reply message in a FOR YOUR EYES thread moves it up.
**Archived means handled:** a thread with no message left in the inbox is
in neither list (it still counts toward the reply times).

## What reaches whom

| | Sees |
|---|---|
| Gmail, the sentinel sheet, Gemini (all inside the school's Google account) | The mail, as today. Gemini gets it with rostered names (two letters or more, in quotes or with a possessive too), nicknames from the `Nicknames` tab, the sender's name, addresses, phone numbers and long numbers redacted. |
| `FamilyMailInput` tab | The redacted text, only until Gemini answers (or 48 hours from when it was first queued), then deleted. A row Studio drops is written again after 30 minutes, at most twice; the old row is marked `RETRIED`. |
| `FamilyMailLog` tab | Message and thread IDs, course, period, category, urgency, the one-line ask, whether it needs a reply. No names, no text. Kept 30 days. |
| `KOS_FAMILY_SIGNAL` doc, and so Claude | Course, period, source, category, ask, hours waiting, repeat-contact count. Sensitive categories (accommodation, health, discipline, family situation, safety) show none of those, only "sensitive" and the wait. |
| The KOS Project's own mail search | Nothing labeled `KOS/Family`, nothing from `student.ccpsnet.net` or Canvas. |
| ntfy (safety pushes only) | "A family message needs you now. Open Gmail, label KOS/Family/Now." and a count. Nothing else. |

The ask is withheld when it names a rostered student or the sender, uses a
title or a capitalized name the roster doesn't hold, or shares no content
word with the message (it was made up).

**What's left:** mail that arrives between two scans (up to 15 minutes) isn't
labeled yet. After an outage, or on the first run, one scan reads at most
300 messages (5 list pages, 2 minutes); it then leaves the scan mark
(`FAMILY_SENTINEL_LAST_SCAN_AT`) where it was and records
`FAMILY_SENTINEL_SCAN_PENDING` (two timestamps), and the next runs read new
mail first, then the rest. The KOS Project still excludes `student.ccpsnet.net` and Canvas
by sender, and is told to count, not read, anything else about a student.
A Gmail filter can close the gap for students: `from:student.ccpsnet.net` →
apply label `KOS/Family`.

## Safety

A message with any sign that a student may be unsafe is never summarized.
Two checks set it independently: a keyword tripwire that runs before Gemini
(`FMS_SAFETY_TERMS`; a Flow that is down can't hide one), and Gemini's own
safety flag. Either one adds `KOS/Family/Now` and puts the thread first in
the signal doc as "needs you now".

**A push to the phone, through ntfy.** ntfy is a free notification app, no
account needed. The phone subscribes to a private topic the sentinel makes,
and `sendFamilySafetyAlerts()` posts to it right after the scan (so the
tripwire alone is enough) and again after the harvest (for Gemini's flag).
Nothing else ever posts to that topic, so the app is silent except for
these. The whole push is:

```
KOS
A family message needs you now. Open Gmail, label KOS/Family/Now.
```

or "2 family messages need you now", at ntfy's urgent priority (on iPhone a
time-sensitive notification, which Focus can be set to let through). No
name, course, sender or word of the message reaches ntfy. One push per run
however many threads; each thread once; at any hour, since only safety
messages push; nothing older than 24 hours; at most 10 a day. A failed push
is retried on the next run.

**What to know about ntfy.** Anyone who learned the topic name could read
the pushes, which is why they carry only that sentence. The topic is a long
random name (`kos-` and 32 hex characters), kept only in the Script
Property `FAMILY_ALERT_NTFY_TOPIC`, never in the repo. `makeFamilyAlertTopic(true)`
makes a new one if it ever leaks. (Email-to-text was the first plan; AT&T
shut its gateway in 2025.)

## Setting it up (operator, once)

1. **Make the sheet.** In Drive, create a Google Sheet named *Family Mail
   Sentinel*. Keep it private. Open Extensions → Apps Script.
2. **Push the code.** With `run.js` (`tools/clasp-sync/run.js`, which
   replaced `run.ps1` on 2026-10-17; the first push was done with
   `run.ps1`): bind the project once with `clasp clone <Script ID>` into
   `clasp-registry\cas-ccps\family-sentinel\`, then
   `node run.js --latest --only family-sentinel`. By hand instead: `node
   tools/clasp-sync/sync.js family-sentinel`, copy
   `cas-ccps/clasp/templates/family-sentinel.clasp.json.template` to
   `cas-ccps/clasp/local/family-sentinel.clasp.json` with the Script ID, and
   `clasp push` from `cas-ccps/.clasp-build/family-sentinel/`. Push the repo's
   manifest, not one the editor wrote: it turns on the advanced Gmail service
   and limits Gmail to `gmail.modify`. Without its scope list Apps Script asks
   for full mailbox access.
3. **Script Properties:** `CENTRAL_LEDGER_SS_ID` (the Central Ledger's ID,
   for the roster). Optional: `DEPLOY_DRIFT_GITHUB_TOKEN`. The signal doc
   is made in My Drive; move it to a folder by hand if you like (it keeps
   its ID). Since 2026-10-31 the script has no Drive scope, so it can't
   move it, and `FAMILY_SIGNAL_FOLDER_ID` is no longer read.
4. **Run `setupFamilySentinel()`** and approve the scopes (Gmail modify,
   Sheets, Docs, external requests; no Drive since 2026-10-31). It makes the tabs, both labels,
   the signal doc and the `FamilyMailBuildSpec` tab.
4a. **Phone alerts:** install the free ntfy app on the iPhone and allow its
   notifications (and Time Sensitive). Run `makeFamilyAlertTopic()`; its log
   shows the topic. In ntfy, tap + and subscribe to that topic on ntfy.sh.
   Run `sendFamilyAlertTest()` and check the phone (proves ntfy reaches it),
   then `runFamilySafetyAlertFixture()` (proves the sentinel pushes for a
   flagged message: a synthetic safety row goes through the real alert
   path, and the phone shows "KOS TEST / Test: A family message needs you
   now..."; the row is removed afterwards).
5. **Optional:** add parent addresses to `FamilyContacts` (parent email,
   student email), and the names students go by to `Nicknames` (student
   email, nicknames comma-separated: "Bobby, Rob"). A nickname is redacted
   before Gemini sees the mail, checked for in Gemini's answer, and matched
   like a first name. Nothing makes nicknames automatically: a rule that
   guesses them (Andrew → "and") redacts ordinary words.
6. **Build the Flow** in Workspace Studio from the `FamilyMailBuildSpec` tab:
   starter = a row in `FamilyMailInput` with `Status` = `READY`; Ask Gemini
   with instructions `@trigger.PromptText`; add a row to `FamilyMailReturn`
   (`Returned_At` = now, `Item_ID` = `@trigger.Item_ID`, `Primary_JSON` =
   Gemini's output). Run `installFamilyMailFixture()` so it has a row to
   match.
7. **Check it**, in order: `runFamilySentinelPreflight()`,
   `runFamilyMailCanary()`, `checkFamilyMailFlowBinding()`, then, after the
   Flow has answered the fixture, `runFamilySentinel()` once and
   `checkFamilyMailFlowLiveness()`.
8. **Run `installFamilySentinelTrigger()`** (every 15 minutes).
9. **Give the KOS Project the doc:** paste the `KOS_FAMILY_SIGNAL` link into
   the Project instructions (`kos-personal/claude-project/README.md`).

To pause it: Script Property `FAMILY_SENTINEL_ENABLED` = `false`.

**Once, after the 2026-10-20 push (the two tiers):** the scan stops logging
system notices, but ones logged before it are still listed. Run
`reclassifySystemSenderThreads()` (a dry run: counts only, nothing changes),
read its log, then `reclassifySystemSenderThreadsNow()`. It marks those
messages `NOT_FAMILY` and takes `KOS/Family` off their threads. It leaves
alone, and counts, a thread with a safety flag (look at it yourself) and a
thread that also holds a real family message (the label stays). The log
tab gains its `Needs_Reply` column by itself on the first run.

## Checks

| Question (`meta/FLOW_DOCTRINE.md` rule 9) | Function |
|---|---|
| Is the structure sound? | `runFamilySentinelPreflight()` |
| Does the script half work? | `runFamilyMailCanary()` (Flow and Gmail stubbed) |
| Are the columns bound right? | `checkFamilyMailFlowBinding()` |
| Has the Flow ever answered? | `checkFamilyMailFlowLiveness()` |
| Does a flagged message reach the phone? | `runFamilySafetyAlertFixture()` (a real push, marked TEST) |
