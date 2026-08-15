# LeaderHub — Guiding Principles
*Committed Session 19 — March 2026*

---

## The One-Line Version

**Out of sight, out of mind.**
This dashboard exists to keep everything in sight so that everything stays in mind.

---

## What This Is

LeaderHub is a **single-file, offline-first command center** built for one specific person: a CTE business teacher at Clover Hill High School who is simultaneously managing five distinct professional roles, navigating a high-stakes performance plan, and doing it all without institutional software support.

It is not a general-purpose tool. Every decision — from the data structures to the banner timing to the AI prompts — is made in service of one user's actual daily reality.

---

## The Core Problem It Solves

A teacher in this position doesn't lack information. They lack **organized attention**. On any given day they are a:

- Classroom instructor accountable to a formal improvement plan (DSP, ends May 15 2026)
- DECA chapter advisor with competition deadlines
- Field trip coordinator managing CCPS bureaucratic paperwork
- School store / WBL manager with CCPS financial compliance obligations
- E-sports coach running two active PlayVS rosters

Each role has its own deadlines, its own paperwork, its own evidence requirements, and its own emotional weight. The system fails a person in this position not through malice but through **fragmentation** — each role lives in a different place, nothing talks to anything else, and the cognitive load of context-switching is invisible and exhausting.

The moment any piece of this falls out of daily view, it falls out of daily mind — and then it falls behind.

**LeaderHub's job is to hold all of it in one place and surface the right thing at the right time.**

---

## Guiding Principles

### 1. The dashboard is a decision, not a display

The home screen does not show everything. It shows the **two most important things right now**, plus the scaffolding needed to act on them immediately. Every widget on the dashboard — the dual choice cards, the next action banner, the horizon lists, the pulse row — exists to answer one question: *what should I do next?*

If something on the dashboard doesn't help answer that question, it doesn't belong there.

### 2. Evidence is a byproduct of doing the work

Adam should never have to do extra work just to create DSP documentation. When he completes a task, it timestamps. When he archives a trip, it logs. When he checks off morning comms, it writes to the daily log. When he saves a journal entry, it feeds the cron engine.

The DSP Evidence Report is a snapshot of data that was already being generated as a natural result of using the app to do his job. **Documentation is downstream of action, not a parallel track.**

### 3. Reminders fire at the moment of maximum utility

Every time-triggered banner is placed at a specific moment in the school day for a specific reason:

| Time | Banner | Why |
|------|--------|-----|
| 7:30 AM | Comms triage | Before students arrive |
| 12:00 PM Fri | Workday payroll | During lunch, a moment to breathe |
| 1:45 PM | Deposit reminder | Before the 2 PM CCPS policy deadline |
| 2:00 PM Fri | Brag Board prompt | End of week while wins are fresh |
| 2:30 PM | Journal reflection | End of school day — locks until complete |

These are not arbitrary. They reflect the actual shape of a school day and the CCPS-specific constraints that govern it. The system should feel like a good colleague who taps you on the shoulder at the right moment — not a task manager that nags.

### 4. AI is a force multiplier, not a crutch

Every AI feature has a clear, bounded purpose: draft a sub plan, generate a differentiation section, surface an insight from SCR data, write a weekly wins email. The AI is called only when the user explicitly asks, or when doing so would save meaningful time on a clearly defined task.

It is never called speculatively. It never makes decisions for the user. It handles the **writing and synthesis** so the user can stay focused on the **judgment and action**.

The FERPA boundary is non-negotiable: student names never leave the browser. Anonymization happens before every AI call. This is not a setting — it is structural.

### 5. The system trusts the user's professional judgment

There are no confirmation dialogs before every action. There is no "are you sure?" on most deletions. The app is built for an adult professional who knows what they're doing and needs the tool to move at the speed of their thinking.

Where irreversible actions exist, a single confirm is enough. Where data is critical, it is protected through architecture — localStorage persistence, log keeping, automatic timestamping — not through friction.

### 6. The DSP is a first-class context, not a background concern

> **⚠ Stale as a description of the shipped app** — the DSP-specific
> features described in this principle (the countdown pill,
> `generateDSPReport()`, DSP Standard 1/2 framing) were deliberately
> removed; see `README.md`'s "DSP framework content — removed" section.
> The underlying idea — that evidence generation should be a
> first-class design concern, not an afterthought — still holds; only
> the DSP-specific implementation described below is gone.

The DSP end date is May 15, 2026. Standard 1 requires documented lesson planning, pacing alignment, and differentiation. Standard 2 requires professional responsiveness.

**Every major feature in the app generates evidence for one of these two standards.** The DSP Report exists to make that evidence visible and portable at any moment.

---

## The Primary User Experiences

### Experience 1 — Morning Orientation
Adam opens the app at 7:30 AM. The comms triage banner fires, prompting him to clear email and voicemail before students arrive. He marks it done — that action writes a timestamped entry to his daily log (DSP Standard 2 evidence). He glances at the dashboard: the dual choice cards show his two most pressing priorities, weighted overnight by the cron engine based on his mood score from the previous journal entry. He knows exactly what today's focus is before the first bell.

### Experience 2 — Active Teaching Day
During the school day, the app runs quietly. The bell schedule tracker shows current period and schedule type on the dashboard clock. If he needs to check a lesson plan, he opens the SCR view and sees which competency he's targeting today and how his classes are tracking against the pacing calendar. The observation prep checklist is a single tap away when an unannounced walkthrough happens — critical Standard 1 items pre-checked means the observation starts from readiness, not scramble.

### Experience 3 — Trip Management
A field trip is a multi-week paperwork process with a non-negotiable approval chain. The trip wizard walks through all 62 required fields across six steps, auto-calculates bus costs, cross-references blackout dates, generates the permission request preview, tracks readiness percentage, and fires a deadline reminder when the submission window approaches. A trip that used to require multiple separate documents and manual tracking is managed end-to-end in one place.

### Experience 4 — End-of-Day Reflection
At 2:30 PM, the journal modal opens automatically and locks until completed — this is the one moment of gentle coercion in the app, because the reflection data feeds the cron engine that adjusts tomorrow's priority stack. The six-step guided journal takes about two minutes. Mood is captured. The avoided task is surfaced for tomorrow's queue. The entry stores and feeds the Brag Board's weekly data gathering.

### Experience 5 — Friday Close
Two banners stack on Friday afternoon — Workday payroll at noon, Brag Board prompt at 2:00. The Brag Board auto-gathers the week's completed tasks, DECA results, archived trips, and resolved email items, then offers four pre-addressed audience tabs: Ms. Green (DSP framing), Admin (formal concise), DECA Parents (newsletter energy), Self (honest log). AI drafts the email in each tone. One click opens it in the mail client. Communicating your wins for DSP purposes should feel easy, not performative.

### Experience 6 — DSP Evidence Snapshot

> **⚠ Removed from the shipped app** — the DSP Evidence Report modal and
> its `generateDSPReport()`/`closeDSPReport()` functions were deleted;
> see `README.md`'s "DSP framework content — removed" section. This
> experience walkthrough is kept as a record of what the app used to
> do, not what it does now.

At any point — before a meeting with Ms. Green, before a check-in with administration — Adam can open the DSP Evidence Report. It pulls from every data source in the app: lesson plans edited, SCR coverage percentage, observation log entries, comms triage completions, journal entries, trip counts, WBL hours, SBE checklist progress. It requires no extra input. It is a real-time snapshot of what the app already knows.

---

## What This Is Not

LeaderHub is not a gradebook. It does not replace Synergy or Canvas — it tracks whether those systems are current. It is not a communication platform — it drafts emails and opens the mail client. It is not a student-facing tool. It is not designed to scale to other teachers or other schools.

Every shortcut in its architecture — single HTML file, localStorage persistence, no server, no auth — is a deliberate choice made in service of the specific constraint that this tool needs to work immediately, with zero IT involvement, in a CCPS browser, for one person.

**The goal is not to build impressive software. The goal is to help Adam finish the year strong.**

---

*See also: LEADERHUB_README.md, LEADERHUB_WIP.md, LH_01_NAMING_CONVENTIONS.md*
