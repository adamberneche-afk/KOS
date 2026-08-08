# Canvas ↔ LeaderHub — Integration Ideas
## Unexplored Territory & Future Build Roadmap

**Version:** 1.0 · 2025–26  
**Companion docs:** `LH_01_NAMING_CONVENTIONS.md` · `LH_02_INTEGRATION_GUIDE.md`

> This document catalogs every interesting integration between Canvas and LeaderHub that doesn't exist yet — organized by complexity, from things buildable in an afternoon to multi-semester projects. Each idea includes how data flows, what triggers it, and what the payoff is.

---

## What Already Works

Before exploring what's possible, here's what the current system does automatically:

- Canvas assignments → Google Calendar → Apps Script → Sheet → LeaderHub (pacing deadlines, lesson matching)
- DECA Google Calendar events → Trip records + slip roster seeds
- Gmail → Sheet → LeaderHub (urgent flagging, self-email shortcuts)
- LeaderHub slip tracker cross-referenced to DECA member roster and class rosters

Everything below builds on or extends that foundation.

---

## Tier 1 — Low Complexity, High Value
*Buildable with Apps Script + existing naming convention. No new infrastructure.*

---

### 1A · Canvas Due Date → LeaderHub Countdown Timer

**The problem:** You know a major project is due but the only place that date lives is Canvas. You have to check Canvas to see how much runway students have — and so do they.

**The integration:** When `syncCalendar()` sees a `DUE` event, it writes a `deadline_date` to the Inbox. LeaderHub already uses this to populate the horizon tracker. The extension: for `DUE` events with a matching lesson plan, LeaderHub could display a **live countdown** on the lesson plan card in the Pacing Calendar view — "Tournament Sponsorship Proposal · due in 8 days."

**What it takes:**
- Nothing new in Apps Script — the date already comes through
- One render change in `renderPacingCalendar()`: compare today to `lp_deadline_date` stored in `LP_EDITS[docId]` and show a pill if within 14 days
- Store the due date when a `DUE` event is consumed: `LP_EDITS[docId].dueDate = item.deadline_date`

**Payoff:** You can look at the pacing calendar and immediately see which lessons have upcoming submission deadlines without opening Canvas.

---

### 1B · Missing TEACH Event Alert

**The problem:** You create a `DUE` assignment in Canvas but forget to create the corresponding `TEACH` calendar event. Students get a grade but no lesson is ever scheduled in LeaderHub's pacing calendar.

**The integration:** When LeaderHub consumes a `DUE` item, check whether a `TEACH` event exists for the same course + title in the current quarter's pacing data. If not, surface a warning on the Lesson Plans view: "⚠ No TEACH event found for 'Tournament Sponsorship Proposal' in Q3. Was instruction logged?"

**What it takes:**
- Track consumed items by `[course, label, type]` in a small index in localStorage
- Add a validation sweep in `renderPacingCalendar()` or `renderLessonPlans()` that flags lessons with a `DUE` but no `TEACH`

**Payoff:** Closes the loop on pacing — you'll know immediately if you assigned something without a matching instruction day logged, which matters enormously for DSP Standard 1 documentation.

---

### 1C · Canvas Module Name → Unit Plan Sync

**The problem:** Canvas modules are named things like "Q2 Unit 2 — Operations, Revenue & the Fan Experience." LeaderHub has a parallel `UNIT_PLANS` array with identical unit structure. They're disconnected.

**The integration:** Add module names to the naming convention. When a module contains any assignment with the naming-convention format, extract the quarter from the first assignment and match it to the `UNIT_PLANS` array. Update `lh_unit_notes[unitId]` with the Canvas module URL so the teacher can click directly from LeaderHub's unit card into Canvas.

**Naming addition for modules (no LLM processing needed — purely structural):**
```
Canvas Module name:  8177 | Q2 | Operations, Revenue & the Fan Experience
```

**What it takes:**
- Apps Script: use the Canvas API (or just iCal) to detect when the first assignment in a new quarter appears — treat that as a module boundary
- LeaderHub: store `canvasModuleUrl` in `LP_EDITS` or `lh_unit_notes`
- Render: add a "📎 Open in Canvas" link on unit plan cards

**Payoff:** One-click jump from LeaderHub's unit view into the matching Canvas module. The unit cards become a command center instead of just a mirror.

---

### 1D · LH: Shortcut for Canvas Gradebook Flags

**The problem:** You're grading in Canvas and you notice a student who hasn't turned in three things. You want to flag that in LeaderHub's task list so you can follow up, but switching apps breaks your flow.

**The integration:** Extend the existing `LH:` self-email shortcut with a `canvas:` prefix to indicate the task originated in gradebook review.

**Example emails you'd send yourself:**
```
Subject: LH: canvas: follow up Rivera missing Unit 2 submission
Subject: LH: canvas: 4 missing submissions Ticket Office — contact parents
Subject: LH: canvas: check in with 3rd period re survey analysis scores
```

**What it takes:**
- Apps Script: add a `canvas:` keyword to `processLHShortcuts()` that tags items with `role:'teach'` and a `source:'canvas-grade'` flag
- LeaderHub: show a 📊 icon on tasks that originated from Canvas gradebook review
- No changes needed to the naming convention

**Payoff:** Zero-friction capture from Canvas grading sessions. You're already in email to send absence notifications — one more message to yourself takes five seconds.

---

### 1E · DECA Results → Member Status Auto-Update Prompt

**The problem:** After SLC results are released, you manually update each qualifying student's `memberStatus` from `'slc'` to `'icdc'` in LeaderHub's Members tab. It's a 15-minute task you do once, but it's easy to forget.

**The integration:** When `syncCalendar()` sees a `DECA | SLC | RESULTS` event, write a high-urgency item to the Inbox: "SLC results released — update qualifying students to ICDC status in Members tab." When LeaderHub consumes this item, surface a modal: "SLC results are out. Tap to review your member list and mark ICDC qualifiers."

**What it takes:**
- Apps Script: handle `RESULTS` type for SLC and ICDC (already in the TYPE table — just needs the Inbox write)
- LeaderHub: detect `DECA | SLC | RESULTS` channel items and surface a "Review Members" CTA that opens Members tab pre-filtered to `memberStatus: 'slc'`

**Payoff:** The system reminds you at the right moment instead of you having to remember. Students don't get missed.

---

## Tier 2 — Medium Complexity, Strategic Value
*Requires Apps Script + a new LeaderHub view or significant render change.*

---

### 2A · Pacing Heat Map — Canvas Submission Volume vs. Instruction Days

**The problem:** You don't have a clear picture of whether the pacing is right. Are students being asked to submit too many things in a short window? Is there a two-week stretch with no deliverables where engagement might drop?

**The integration:** In the Pacing Calendar view, add a **weekly heat map row** at the top of each course's calendar. Each week shows:
- Number of `TEACH` events that week (blue dots)
- Number of `DUE`/`ASSESS`/`PRESENT` events (orange dots)
- A ratio indicator: if due/teach > 1.0 that week, flag it yellow; if due/teach > 2.0, flag it red

**Data source:** All the TEACH and DUE events are already being consumed from Calendar into LeaderHub. The calendar just needs to aggregate by week.

**What it takes:**
- New function `buildPacingHeatMap(course, quarter)` that groups consumed events by ISO week number
- New HTML row above the pacing calendar grid — week labels across the top, dots per day, ratio indicators per week
- Uses existing `LP_EDITS[docId].taughtDate` and `deadline_date` data

**Payoff:** At a glance, you can see when students are being overloaded and redistribute due dates before the quarter starts — a direct DSP Standard 1 evidence item.

---

### 2B · Canvas Announcement → LeaderHub News Feed Widget

**The problem:** You send Canvas announcements for class news, but there's no record in LeaderHub that you communicated something. During DSP evidence collection, you want a timeline of communication.

**The integration:** Use the `LH:` shortcut as a lightweight announcement logger:
```
Subject: LH: announce: 8177 — Q3 project rubric updated, resubmissions open until Friday
Subject: LH: announce: 6115 — class rescheduled to library lab on Thursday (4th Odd)
```

Apps Script creates an `'announcement'` channel item. LeaderHub stores these in a `lh_announcements` array. A new mini-widget on the Cockpit tab shows the last 5 announcements with timestamps — essentially a class communication log.

**What it takes:**
- Apps Script: add `announce:` keyword handler to `processLHShortcuts()`
- New `lh_announcements` localStorage array with `{id, date, course, text}` schema
- Cockpit widget: last 5 announcements, copy-to-clipboard for DSP evidence binder

**Payoff:** You're already writing Canvas announcements — copying the subject line to an LH: email takes 10 seconds. The log builds itself. At DSP review time, you have a timestamped communication record.

---

### 2C · Rubric Competency Cross-Reference

**The problem:** Canvas rubrics have criteria. LeaderHub has a competency list (108 items per course, all mapped to lesson plans). They're completely disconnected — but they describe the same things.

**The integration:** Name Canvas rubric criteria to match SCR competency numbers:

```
Rubric criterion name format:
COMP [number]: [short description]

Examples:
COMP 7: Listening & Speaking Skills
COMP 21: Reading & Writing Skills
COMP 46: Supply, Demand & Equilibrium
```

When you use the `LH:` shortcut after grading:
```
Subject: LH: scores: 8177 | Q3 | Tournament Sponsorship Proposal | comps 7,21,66,67,68
```

Apps Script writes a scored-competencies entry to the Inbox. LeaderHub matches it to `lp_8177_23` (which already has `comps: [15, 21, 66, 67, 68]`) and marks those competencies as recently assessed in the SCR tracker.

**What it takes:**
- Apps Script: parse `scores:` shortcut prefix; extract course, lesson title, and comp numbers
- LeaderHub: write assessment dates to `SCR_COURSES[course].competencies[n].lastAssessed`
- SCR view: show a "recently assessed" indicator on competency rows

**Payoff:** Your Canvas rubric grading automatically advances your SCR competency coverage map. You can see at a glance which competencies haven't been formally assessed yet this quarter.

---

### 2D · Canvas Late Submission Rate → LeaderHub Deadline Risk Flag

**The problem:** You set a due date in Canvas but based on experience with certain lessons, you know students consistently submit late. You'd like LeaderHub to proactively flag high-risk deadlines for parent contact prep.

**The integration:** Track submission pattern history in `lh_lp_edits`. When you mark a lesson as "taught" in LeaderHub and there's an associated `DUE` event, LeaderHub logs the due date. After the due date passes, use the `LH:` shortcut to log actual submission rate:

```
Subject: LH: rate: 8177 | Q3 | Tournament Sponsorship Proposal | 18/22
```

LeaderHub stores this in `LP_EDITS[docId].submissionHistory`. After two or more data points, the lesson plan card shows a trend indicator: "📉 Historically ~80% on-time — consider sending a reminder 3 days before."

**What it takes:**
- Apps Script: parse `rate:` shortcut prefix; write to Inbox with `channel:'rate-log'`
- LeaderHub: accumulate `submissionHistory[]` in `LP_EDITS[docId]`; compute average rate
- Lesson plan card: show submission rate badge and proactive suggestion

**Payoff:** Your lesson plans learn from themselves. The system gets smarter each time the same lesson is taught, and it tells you when to act before students miss the deadline.

---

## Tier 3 — High Complexity, High Ceiling
*Requires Canvas API integration or significant new LeaderHub architecture. Worth building over the summer.*

---

### 3A · Canvas API Gradebook → LeaderHub SCR Score Importer

**The problem:** You enter scores in Canvas. You also want SCR competency scores in LeaderHub. Right now these are two separate data entry processes for the same underlying student performance.

**The integration:** Use Canvas's REST API via Apps Script to read assignment scores for a specific assignment group. Map the Canvas assignment name (via the naming convention) to a lesson plan ID, then to competency numbers. Write aggregated scores to the Inbox as structured data.

**Canvas API endpoint:**
```
GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions
Authorization: Bearer [Canvas API token]
```

**Apps Script function (weekly, Sunday midnight):**
```javascript
function syncCanvasGrades() {
  const assignments = [
    { canvasId: 12345, lpId: 'lp_8177_23', comps: [15, 21, 66, 67, 68] },
    // ... built from naming convention matches
  ];
  
  assignments.forEach(a => {
    const submissions = fetchCanvasSubmissions(a.canvasId);
    submissions.forEach(s => {
      writeScoreToInbox({
        studentId: matchStudentByEmail(s.user.email),
        lpId: a.lpId,
        comps: a.comps,
        score: s.score,
        maxScore: s.assignment.points_possible,
        submittedAt: s.submitted_at,
      });
    });
  });
}
```

**LeaderHub side:** New "Import Scores" button on the SCR view that processes pending score items from the Inbox, maps them to the correct student row, and populates `scores[comp]` values.

**What it takes:**
- Canvas API token stored in Script Properties (never in LeaderHub)
- FERPA note: scores are matched by student email — never stored in AI calls
- One-time setup: map Canvas course IDs to LeaderHub course codes
- Medium-complexity LeaderHub render update to SCR score grid

**Payoff:** Grade once in Canvas. Scores appear in LeaderHub's competency tracker automatically. Your SCR documentation writes itself.

---

### 3B · Canvas Module Completion → Pacing Calendar Auto-Advance

**The problem:** LeaderHub's pacing calendar shows what's planned. It doesn't know what's actually been delivered. A lesson planned for October 15 might have actually been taught October 17 due to a fire drill. The planned vs. actual gap is invisible.

**The integration:** When Canvas marks a module as "completed" (all items published), treat that as an actual delivery signal. Apps Script detects this via the Canvas API and writes a `TEACH-ACTUAL` confirmation to the Inbox. LeaderHub uses this to:
- Mark the lesson as "delivered" on its actual date
- Flag the delta if planned date ≠ actual date (e.g., "Planned Oct 15 · Delivered Oct 17")
- Roll forward the pacing estimate for subsequent lessons

**What it takes:**
- Canvas API: `GET /api/v1/courses/:id/modules` — check `completed_at` field
- LeaderHub: new `taughtActualDate` field in `LP_EDITS[docId]`
- Pacing calendar: show planned vs. actual as a two-row display per lesson; accumulate drift

**Payoff:** Your pacing calendar becomes a live record of what actually happened, not just what was planned. This is extraordinarily valuable for year-end reflection and next-year planning — and for DSP Standard 1 evidence showing you monitor and adjust instruction.

---

### 3C · Absence Blackout → Canvas "Not Available" Auto-Flag

**The problem:** When a DECA trip is approved, specific students will miss specific Canvas assignments. You have to manually track which students are affected and coordinate with teachers. There's no system that connects the trip dates to the academic calendar.

**The integration:** When LeaderHub's slip roster for a `CONF` trip is marked "all returned" (trip approved), automatically generate a Canvas API call that:
1. Identifies assignments due on the trip dates for the relevant course sections
2. Creates an extended due date (trip date + 5 days) for attending students
3. Generates the standard absent-student email template with student names pre-populated from the slip roster

**What it takes:**
- Canvas API: `PUT /api/v1/courses/:id/assignments/:id` with `due_at` override per student
- LeaderHub: new "Request Canvas Extensions" button in the TripTracker slip view — appears only when all slips are returned
- Apps Script: receive the extension request from LeaderHub via a POST to the Web App, execute Canvas API calls

**Payoff:** Zero manual work after the slips are collected. The system handles Canvas housekeeping. You send one email instead of coordinating twelve separate accommodation requests.

---

### 3D · Competency Coverage Gap → Canvas Assignment Auto-Generator

**The problem:** End of quarter, you look at the SCR competency grid and see five required competencies that haven't been assessed yet. You need to create Canvas assignments to cover them before the quarter ends.

**The integration:** LeaderHub scans `LESSON_PLANS` for lessons taught this quarter and builds a list of competencies covered. It compares against the full SCR competency list. For any required competency not yet assessed, it drafts a suggested Canvas assignment via Gemini:

**LeaderHub prompt (via `callAI()`):**
```
Course: 8177 — Sports, Entertainment, and Event Management
Quarter: Q3 ends 2026-03-19. Today is 2026-03-05. 14 school days remain.
Unassessed required competencies:
  #63: Identify ethical issues related to sports, entertainment, and event industries
  #64: Investigate how social and environmental concerns affect decisions
  #65: Examine the effect of media bias on public perception

Generate 1-2 Canvas assignment ideas that would cover all three competencies 
in the remaining time. Include: assignment title (in naming convention format), 
brief description, estimated time, and suggested due date. Do not suggest 
anything that would require new materials.
```

**What it takes:**
- `callAI()` already works — this is a new use case for it
- New "Coverage Audit" button on the SCR view → modal showing unassessed comps + Gemini suggestions
- Output: suggested event titles ready to paste into Canvas

**Payoff:** You never end a quarter with required competencies unaddressed. The system identifies the gap and proposes solutions — you evaluate and act, but you don't have to do the analysis yourself.

---

## Integration Priority Matrix

| Idea | Impact | Effort | Do it when |
|------|--------|--------|-----------|
| 1A · Due Date Countdown | High | Low | Next session |
| 1B · Missing TEACH Alert | High | Low | Next session |
| 1D · LH: Canvas flag shortcut | Medium | Low | Next session |
| 1E · DECA Results Status Prompt | High | Low | Before SLC 25-26 |
| 1C · Module Name Sync | Medium | Low | Summer setup |
| 2A · Pacing Heat Map | High | Medium | Q4 build |
| 2C · Rubric Competency X-Ref | High | Medium | Summer build |
| 2B · Announcement Log | Medium | Medium | Q4 build |
| 2D · Late Submission Tracker | Medium | Medium | Next year |
| 3A · Canvas Gradebook Import | Very High | High | Summer project |
| 3B · Module Completion → Actual Date | High | High | Summer project |
| 3C · Absence → Canvas Extensions | High | High | Summer project |
| 3D · Coverage Gap Generator | Very High | Medium | Summer project |

---

## Data That Flows in Each Direction

### Canvas → LeaderHub (all current + proposed)

| Signal | Mechanism | LeaderHub Action |
|--------|-----------|-----------------|
| Assignment due date | Calendar sync | Deadline item + horizon entry |
| Instruction day | Calendar TEACH event | Pacing entry + lesson link |
| Assessment day | Calendar ASSESS event | Assessment milestone |
| Module published | Canvas API (future) | Unit plan activation |
| Submission scores | Canvas API (future) | SCR score population |
| Module completed | Canvas API (future) | Pacing actual-date record |

### LeaderHub → Canvas (all proposed — nothing flows this way yet)

| Signal | Mechanism | Canvas Action |
|--------|-----------|--------------|
| Trip slip roster complete | Apps Script POST → Canvas API | Extended due dates for traveling students |
| Coverage gap identified | Teacher action + Canvas API | New assignment creation |
| Pacing drift detected | Teacher action | Due date shift suggestions |

### LeaderHub → Other Systems (current)

| Signal | Mechanism | Destination |
|--------|-----------|------------|
| Absent-student email | Forms Center template | Gmail compose |
| Parent contact list | Copy to clipboard | Gmail / phone |
| TripTracker packet | Print dialog | Physical forms |
| DSP evidence | Journal / notes export | Observation binder |

---

## The Bigger Picture

The current architecture was designed for **inward-only data flow** — that's the right call for a no-server, single-file system. It keeps the app stable, avoids authentication complexity, and respects FERPA by never sending data outward through unpredictable channels.

The Tier 3 ideas introduce outward flow for the first time. When you're ready to pursue them, consider this constraint: **LeaderHub itself should never hold Canvas API credentials.** Those live in Script Properties in Apps Script, which runs as your authenticated Google account. LeaderHub makes requests to your Apps Script Web App, which proxies to Canvas. The security boundary stays clean.

The naming convention is the keystone of everything. Every integration in this document — current and future — works because event names are structured. The five seconds it takes to name a Canvas assignment correctly is the investment that makes the entire system pay off.
