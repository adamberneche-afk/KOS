# Sprint: one teacher doc per lesson, and a daily agenda deck

**Status:** decided with the operator on 2026-10-27, and built the same
night at the operator's word: #309 (each lesson's plan and the bell
schedule), #310 (the lesson doc, `66_LessonDoc.js`) and #311 (the agenda
deck, `67_AgendaDeck.js`). Not built yet: the ⚙ Settings field for
activity and delay days (until then they run as their weekday's A or B). No student names, emails,
file IDs or ConfigIDs appear here, by design.

## Why

Each lesson today makes a **Lesson Frame** doc (27,
`generateLessonFrame_`) for every lesson log row: one per lesson, per day,
per period ("Lesson Frame — 2026-10-28 (Period 3-Odd) — …"), because the
lesson builder (51) logs each class meeting. They pile up in the teacher
folder. The operator wants one teacher doc per lesson, and a companion
agenda to project each day.

## Decisions (2026-10-27)

| # | Question | Decided |
|---|---|---|
| 1 | Which docs become one per lesson | The Lesson Frames. The lesson log rows behind them stay (warm-up personalization reads them); only the per-row doc stops |
| 2 | What the lesson doc holds | The plan; each day it runs; a class status snapshot; look-fors; and an **itinerary for the lesson**: warm-up prompts, when Chromebooks are out, when students listen to a lecture, self-paced work, and so on |
| 3 | The itinerary's source | Drafted the same way every time from the lesson's own sections, then adjusted by the teacher in the doc |
| 4 | The agenda | Google Slides, one deck per course per day |
| 5 | When they're made | Both: by the nightly rollout (for courses with it on) and from a button in 📅 Lessons |
| 6 | Period lengths | From the school's bell schedule (below), by that day's schedule and each class's block |

## The design

**The lesson doc**, one per lesson ("Lesson Plan — 8175 L06 …"), in a
*Lesson Plans* folder:
- **Plan:** objective and "I can" statements (`STUDENT_CRITERIA.json`), the
  student task, competencies by tier, vocabulary, prior-lesson connection,
  video links (`VIDEO_LINKS.json`).
- **Itinerary:** a table of timed blocks, each marked 💻 Chromebooks out,
  🎧 listening / lecture, ✏️ warm-up or written work, 💬 discussion.
  Drafted from the lesson file: Bell Ringer (the Do Now) → warm-up; Hook →
  lecture or discussion; the task → Chromebooks out, self-paced; Checkout
  Slip → exit ticket. Minutes are scaled to the block's length on
  Schedule A and on Schedule B. The teacher edits times and wording in
  the doc.
- **Look-fors:** per competency in the lesson, its "I can" statement and
  the state's demonstration indicators (`CompetencyRubrics.json`).
- **Each day it runs:** a section per class meeting (date, periods), with
  room for notes.
- **Class status:** per period, docs made, submitted, passed, waiting:
  a snapshot, refreshed by the button.

**The agenda deck**, one per course per school day ("Agenda — 8175 — Wed
Oct 28"), in an *Agendas* folder: a title slide (date, lesson, today's "I
can" goals), one slide per itinerary block in student words with its mark
and minutes for that day's schedule, and a "Due" slide. It reads the
itinerary from the lesson doc, so the teacher's edits carry into the next
deck. In 3rd block the lunch shows as "Lunch (your wave)".

**Made** by the nightly rollout (the lesson doc once, and the next school
day's decks), and by a "Lesson doc and agenda" button in 📅 Lessons that
makes them or refreshes the class status and remakes the deck, never
overwriting the teacher's edits.

**Cost:** Google Slides needs the presentations permission on the Central
Ledger and Teacher Dashboard (a one-time approval on the push). About
three PRs.

## The bell schedule (Clover Hill, 2026-27)

From the operator's PDF of the school's bell schedule page, checked
2026-10-27 (LeaderHub corrected to match in #302). Class minutes; 3rd
block is shown minus its lunch wave.

| Schedule | 1st | 2nd | 3rd (lunch waves) | 4th |
|---|---|---|---|---|
| A: 8:30–9:20, 9:25–11:05, 11:10–1:15, 1:20–3:00 | 50 | 100 | 100 (A 11:20, B 11:50, C 12:20, D 12:50; 25 min) | 100 |
| B: 8:30–9:15, CM/HR 9:20–9:45, 9:50–11:20, 11:25–1:25, 1:30–3:00 | 45 | 90 | 95 (A 11:30, B 12:00, C 12:30, D 1:00; 25 min) | 90 |
| Activity: 8:30–9:10, 9:15–10:35, 10:40–12:20, 12:25–1:55, activity 2–3 | 40 | 80 | 79 (21-min waves from 10:44) | 90 |
| 2-Hour Delay: 10:30–11:00, 11:05–12:10, 12:15–1:50, 1:55–3:00 | 30 | 65 | 75 (20-min waves from 12:18) | 65 |
| 3-Hour Early Release: 8:30–9:00, 9:05–10:00, 10:05–11:00, 11:05–12:00 | 30 | 55 | 55 (grab-and-go) | 55 |

**Which days:** A every day Aug. 24–Sept. 4; Mon/Tue A and Wed/Thu B,
Fridays B (Homeroom) Sept. 8–Nov. 20; from Nov. 23 Mon/Tue/Fri A to May 14
and Wed/Thu B to May 6. CM is Wednesday and Thursday; Homeroom is every
Friday Sept. 11–Nov. 6. Exams: TBD. Early release: Oct. 30, Nov. 13,
Jan. 22, Feb. 5, Apr. 23, June 3–4. No school: the CCPS 2026-27 calendar
(already in 51's `CYB_NO_SCHOOL_2026_27` and LeaderHub). Activity and
delay days are called as they come: a ⚙ Settings field sets them.

Periods map to blocks: period 1 → 1st (it meets daily for half the
time), 3-Odd and 3-Even → 3rd on alternate dates, and so on.

## Open

- The ⚙ Settings field for activity and delay days: 00's `bellScheduleFor_`
  already takes them as overrides; nothing sets them yet.
- Exam days, once the school publishes them.
- Any other day that changes the schedule (testing, assemblies): set it in
  ⚙ Settings when it's called.
