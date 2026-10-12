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
`Ledger` tab.

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

ANSWERED IN THE LAST 7 DAYS: 9, median reply 6 h.
```

Each "open" links to the Gmail thread. Numbers are reassigned every run, so
`#1` never follows a family from one day to the next.

## What reaches whom

| | Sees |
|---|---|
| Gmail, the sentinel sheet, Gemini (all inside the school's Google account) | The mail, as today. Gemini gets it with rostered names, the sender's name, addresses, phone numbers and long numbers redacted. |
| `FamilyMailInput` tab | The redacted text, only until Gemini answers (or 48 hours), then deleted. |
| `FamilyMailLog` tab | Message and thread IDs, course, period, category, urgency, the one-line ask. No names, no text. Kept 30 days. |
| `KOS_FAMILY_SIGNAL` doc, and so Claude | Course, period, source, category, ask, hours waiting, repeat-contact count. Sensitive categories (accommodation, health, discipline, family situation, safety) show none of those, only "sensitive" and the wait. |
| The KOS Project's own mail search | Nothing labeled `KOS/Family`, nothing from `student.ccpsnet.net` or Canvas. |
| ntfy (safety pushes only) | "A family message needs you now. Open Gmail, label KOS/Family/Now." and a count. Nothing else. |

The ask is withheld when it names a rostered student or the sender, uses a
title or a capitalized name the roster doesn't hold, or shares no content
word with the message (it was made up).

**What's left:** mail that arrives between two scans (up to 15 minutes) isn't
labeled yet. The KOS Project still excludes `student.ccpsnet.net` and Canvas
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
2. **Push the code.** With `run.ps1` (how it was done): bind the project once
   with `clasp clone <Script ID>` into `clasp-registry\cas-ccps\family-sentinel\`,
   then `run.ps1 -Only family-sentinel`. By hand instead: `node
   tools/clasp-sync/sync.js family-sentinel`, copy
   `cas-ccps/clasp/templates/family-sentinel.clasp.json.template` to
   `cas-ccps/clasp/local/family-sentinel.clasp.json` with the Script ID, and
   `clasp push` from `cas-ccps/.clasp-build/family-sentinel/`. Push the repo's
   manifest, not one the editor wrote: it turns on the advanced Gmail service
   and limits Gmail to `gmail.modify`. Without its scope list Apps Script asks
   for full mailbox access.
3. **Script Properties:** `CENTRAL_LEDGER_SS_ID` (the Central Ledger's ID,
   for the roster). Optional: `FAMILY_SIGNAL_FOLDER_ID` (where the
   signal doc goes), `DEPLOY_DRIFT_GITHUB_TOKEN`.
4. **Run `setupFamilySentinel()`** and approve the scopes (Gmail modify,
   Sheets, Docs, Drive, external requests). It makes the tabs, both labels,
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
   student email).
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

## Checks

| Question (`meta/FLOW_DOCTRINE.md` rule 9) | Function |
|---|---|
| Is the structure sound? | `runFamilySentinelPreflight()` |
| Does the script half work? | `runFamilyMailCanary()` (Flow and Gmail stubbed) |
| Are the columns bound right? | `checkFamilyMailFlowBinding()` |
| Has the Flow ever answered? | `checkFamilyMailFlowLiveness()` |
| Does a flagged message reach the phone? | `runFamilySafetyAlertFixture()` (a real push, marked TEST) |
