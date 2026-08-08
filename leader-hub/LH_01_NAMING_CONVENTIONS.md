# LeaderHub Naming Conventions
## Three-System Reference — Canvas · Synergy · LeaderHub

**Version:** 3.0 (2025–26 school year, Q4 active)
**Teacher:** Adam Berneche · Clover Hill High School · CCPS
**Courses:** 8177 (3rd Odd) · 8175 (2nd/3rd/4th Even) · 6115 (4th Odd)
**Companion docs:** `LH_02_INTEGRATION_GUIDE.md` · `LH_03_CANVAS_INTEGRATION_IDEAS.md`

> **Purpose:** One naming system that works across all three platforms so you don't have to translate between them. Use these exact strings everywhere — Canvas assignment titles, Synergy grade categories, LeaderHub lesson IDs, and Google Calendar events all speak the same language.

---

## The Three Systems and What Each One Does

| System | Your job there | What it produces |
|--------|---------------|-----------------|
| **Canvas** | Build assignments, modules, rubrics, feedback | Student-facing: instructions, submissions, grades students see |
| **Synergy** | Enter final grades, attendance, official records | Admin-facing: report cards, parent portal, state reporting |
| **LeaderHub** | Plan pacing, track evidence, manage the DSP | You-facing: what to do next, proof you did it |

**The problem they solve together:** Canvas knows what you assigned. Synergy knows what students earned. LeaderHub knows what you planned. Without a shared naming system, you're manually translating between all three every time you grade.

---

## The Universal Format

Every Canvas assignment title, Google Calendar event, and LeaderHub lesson ID uses the same pipe-delimited structure:

```
[COURSE] | [QUARTER] | [TYPE] | [Title]
```

**Examples:**
```
8177 | Q4 | TEACH | The Stadium Economy
8175 | Q4 | DUE   | The Paper Trail
6115 | Q4 | ASSESS | Full Business Plan
DECA | ICDC | PAYMENT | Student Installment Due
```

### Field rules

| Field | Format | Valid values |
|-------|--------|-------------|
| COURSE | 4-digit code or DECA | `8177` `8175` `6115` `DECA` |
| QUARTER | Q + number | `Q1` `Q2` `Q3` `Q4` |
| TYPE | All caps | See TYPE table below |
| Title | Exact match to lesson plan title | Copy from Section 4 — no paraphrasing |

### TYPE codes

| TYPE | What it means | Synergy category | LeaderHub action |
|------|--------------|-----------------|-----------------|
| `TEACH` | Instruction day | (no grade) | Pacing entry; lesson-plan link |
| `DUE` | Student submission deadline | **Major** or **Minor** | Deadline item in horizon |
| `ASSESS` | Quiz, test, or scored evaluation | **Test/Quiz** | Assessment milestone |
| `PRESENT` | Oral presentation or live demo | **Major** | Presentation milestone |
| `REVIEW` | In-class review day | (no grade) | Review marker in pacing |
| `INTRO` | First day of a new unit | (no grade) | Unit-launch marker |

---

## Synergy Grade Category Mapping

Synergy requires every assignment to be in a grade category. Use these consistently so your gradebook weights are always correct and parent-portal labels match what students see in Canvas.

| Canvas TYPE | Synergy Category | Weight (suggested) |
|-------------|-----------------|-------------------|
| `DUE` (major project) | **Major Assignments** | 50% |
| `DUE` (classwork/exit) | **Minor Assignments** | 20% |
| `ASSESS` | **Tests & Quizzes** | 30% |
| `PRESENT` | **Major Assignments** | 50% |
| `TEACH` / `REVIEW` / `INTRO` | Not graded — no Synergy entry needed | — |

**Practical rule:** If the Canvas assignment title starts with a 4-digit course code and is TYPE `DUE` or `ASSESS` or `PRESENT`, it needs a Synergy entry. TYPE `TEACH`, `REVIEW`, and `INTRO` do not.

### Synergy assignment title format

Match the Canvas title exactly — copy-paste the `[COURSE] | [QUARTER] | [TYPE] | [Title]` string into Synergy's assignment name field. This makes it searchable and unmistakable when parents ask "what is this grade for."

```
Canvas:  8177 | Q4 | DUE | "What is Branding?" Reflection Essay
Synergy: 8177 | Q4 | DUE | "What is Branding?" Reflection Essay   ← exact copy
```

---

## Synergy Grade Update Schedule

LeaderHub tracks four Synergy grade update deadlines in Q4. Missing these is a DSP Standard 2 concern.

| Deadline | Date | What to enter |
|---------|------|--------------|
| Synergy Update 1 | March 21 | All graded work through March 20 |
| Synergy Update 2 | April 4 | All graded work through April 3 |
| Synergy Update 3 | April 18 | All graded work through April 17 |
| Synergy Update 4 | May 2 | All graded work through May 1 |

**LeaderHub reminder:** The P80 Synergy signal fires when `lh_sync_tracker.synergy` is more than 14 days stale. Tap "Done" in the sync tracker after each update to reset the clock.

---

## Canvas Module Structure

Canvas modules should mirror LeaderHub's quarter/unit structure so students can find things and you can navigate between the two systems without hunting.

### Module naming format

```
[COURSE] | [QUARTER] | [Unit Name]
```

**Examples:**
```
8177 | Q4 | Global Expansion & Career Readiness
8175 | Q4 | Career Readiness & Course Capstone
6115 | Q4 | Career Readiness & Business Capstone
```

### Module setup checklist (beginning of each quarter)

- [ ] Create module named `[COURSE] | Q[N] | [Unit Name]`
- [ ] Add a Module Overview page (unpublished or published)
- [ ] Add all TEACH assignments in order (published on delivery date)
- [ ] Add all DUE assignments with due dates matching the calendar
- [ ] Verify module order matches LeaderHub pacing order

---

## The Daily Workflow — Three Systems in Practice

### Morning (before students arrive)

1. **Canvas** — Check for late submissions overnight. Grade anything due yesterday.
2. **LeaderHub** — Check choice cards. If Synergy is flagged, open Synergy. If a lesson plan is due for editing, open Drive.
3. **Synergy** — Enter grades from yesterday's graded work before today's class.

### During class

1. **Canvas** — Students work in Canvas. You don't need to do anything in real time.
2. **LeaderHub** — SCR cockpit: cycle scores in the competency view as you observe students.
3. **Synergy** — Attendance only. No grading during class.

### End of day

1. **Canvas** — Publish next day's assignment if it wasn't already. Leave feedback on any submissions you reviewed.
2. **Synergy** — Check the 14-day update clock in LeaderHub. If a sync deadline is within 3 days, do the grade entry now.
3. **LeaderHub** — Journal reflection. The 2am cron will build tomorrow's priority list from your mood + today's avoided task + deadlines.

### End of quarter

1. **Canvas** — Close out the module. Make sure all rubrics are finalized.
2. **Synergy** — Final grade entry must be complete before the report card deadline. LeaderHub will show the Synergy deadline as P90 (overdue if missed).
3. **LeaderHub** — Update DSP goal progress for the quarter. Generate a Brag Board email for Ms. Green before the final Green meeting.

---

## Q4 Lesson Plans — What's Active Right Now

*Q4 runs March 23 – May 29, 2026. 49 days remaining as of March 27.*

### 8177 — Sports, Entertainment & Event Management (3rd Odd)

| ID | Title | Canvas assignment name |
|----|-------|----------------------|
| lp_8177_26 | The Stadium Economy | `8177 \| Q4 \| TEACH \| The Stadium Economy` |
| lp_8177_27 | The Global Expansion | `8177 \| Q4 \| TEACH \| The Global Expansion` |
| lp_8177_28 | "What is Branding?" Reflection Essay | `8177 \| Q4 \| DUE \| "What is Branding?" Reflection Essay` |
| lp_8177_29 | The Final Whistle | `8177 \| Q4 \| ASSESS \| The Final Whistle` |

### 8175 — Sports, Entertainment & Event Marketing (2nd/3rd/4th Even)

| ID | Title | Canvas assignment name |
|----|-------|----------------------|
| lp_8175_32 | AI and the Future of Work | `8175 \| Q4 \| TEACH \| AI and the Future of Work` |
| lp_8175_33 | The Paper Trail | `8175 \| Q4 \| DUE \| The Paper Trail` |
| lp_8175_34 | Interview Skills Practice Plan | `8175 \| Q4 \| TEACH \| Interview Skills Practice Plan` |
| lp_8175_35 | Google Interview Simulation | `8175 \| Q4 \| ASSESS \| Google Interview Simulation` |
| lp_8175_36 | Course Evaluation Brochure | `8175 \| Q4 \| DUE \| Course Evaluation Brochure` |

### 6115 — Principles of Business & Marketing (4th Odd)

| ID | Title | Canvas assignment name |
|----|-------|----------------------|
| lp_6115_42 | The Time Traveler | `6115 \| Q4 \| TEACH \| The Time Traveler` |
| lp_6115_43 | You, Inc. | `6115 \| Q4 \| DUE \| You, Inc.` |
| lp_6115_44 | The Architecture of You | `6115 \| Q4 \| TEACH \| The Architecture of You` |
| lp_6115_45 | The Hype Man | `6115 \| Q4 \| DUE \| The Hype Man` |
| lp_6115_46 | The Professional Breakup | `6115 \| Q4 \| TEACH \| The Professional Breakup` |
| lp_6115_47 | The "Adulting" Crash Course | `6115 \| Q4 \| TEACH \| The "Adulting" Crash Course` |
| lp_6115_48 | The Big Idea | `6115 \| Q4 \| PRESENT \| The Big Idea` |
| lp_6115_49 | Know Your Enemy | `6115 \| Q4 \| TEACH \| Know Your Enemy` |
| lp_6115_50 | The Structure | `6115 \| Q4 \| TEACH \| The Structure` |
| lp_6115_51 | Show Me the Money | `6115 \| Q4 \| TEACH \| Show Me the Money` |
| lp_6115_52 | The Final Sell | `6115 \| Q4 \| PRESENT \| The Final Sell` |
| lp_6115_53 | Protecting the Empire | `6115 \| Q4 \| TEACH \| Protecting the Empire` |

---

## Canvas Setup Checklist — Each Lesson

When you add a lesson to Canvas, do all four of these:

```
[ ] 1. TEACH assignment
        Title:      [COURSE] | Q4 | TEACH | [Lesson Title]
        Type:       No Submission (or Discussion/File depending on the lesson)
        Due date:   The instruction day (when YOU deliver the lesson)
        Published:  Yes, on or before instruction day
        Points:     0 (not graded)

[ ] 2. DUE assignment (if the lesson has a student product)
        Title:      [COURSE] | Q4 | DUE | [Lesson Title]
        Type:       File Upload or Text Entry
        Due date:   The student submission deadline
        Published:  Yes, on instruction day
        Points:     Per rubric
        Synergy:    Add matching entry to Synergy gradebook, same title

[ ] 3. Rubric (if graded)
        Attach the rubric to the DUE/ASSESS/PRESENT assignment in Canvas
        Criteria names should match the SCR competency descriptions exactly
        (This makes SCR score transfer to Canvas rubric a one-look comparison)

[ ] 4. Module placement
        Add both TEACH and DUE to the correct [COURSE] | Q4 | [Unit] module
        Order: TEACH before DUE — students see instruction before deadline
```

---

## Troubleshooting — When Things Don't Match

### "LeaderHub shows a lesson as unedited but I updated it in Drive"

LeaderHub doesn't sync from Drive automatically. After editing a Google Doc lesson plan, open it in LeaderHub (Lessons view → click the lesson → Edit tab), paste your updated content, and hit Save. This creates the DSP evidence timestamp.

### "Synergy has a grade but Canvas doesn't show it"

Canvas and Synergy are not connected. You entered the grade manually in Synergy but didn't create a Canvas assignment. Create the Canvas assignment with the matching title format and enter the grade there too. Parent-portal visibility comes from Canvas; state reporting comes from Synergy.

### "The pacing indicator shows ▲ ahead but I haven't finished the unit"

The pacing tracker in LeaderHub counts the number of TEACH events consumed for the course this quarter and compares it to the expected pace (total lessons ÷ instructional days remaining). If you've been delivering lessons at a normal rate but haven't logged them via the SCR tracker or the lesson plan edit, the count is stale. Cycle at least one SCR score per lesson to keep the tracker current.

### "Canvas shows a DUE date but it's not in LeaderHub's deadline list"

LeaderHub's deadline list is populated from `DEADLINES` array (seeded) and Gmail-parsed items (via EmailBridge). Canvas deadlines only appear if you've also added them to Google Calendar using the naming convention format, or manually added them to LeaderHub's deadline list.

---

## Quick Reference Card

```
CREATING A NEW LESSON IN CANVAS
┌─────────────────────────────────────────────────┐
│ 1. Canvas TEACH assignment                       │
│    [COURSE] | Q4 | TEACH | [Exact Title]         │
│    Due: instruction day · Points: 0              │
│                                                  │
│ 2. Canvas DUE assignment (if graded)             │
│    [COURSE] | Q4 | DUE | [Exact Title]           │
│    Due: submission deadline · Points: per rubric │
│                                                  │
│ 3. Synergy entry (copy-paste Canvas DUE title)   │
│    Category: Major / Minor / Test                │
│                                                  │
│ 4. LeaderHub: edit lesson plan → Save            │
│    Creates DSP evidence timestamp                │
└─────────────────────────────────────────────────┘

GRADING CYCLE (every 2 weeks)
┌─────────────────────────────────────────────────┐
│ Canvas → grade submissions, leave feedback       │
│ Synergy → enter matching grades (same title)     │
│ LeaderHub → mark Synergy sync done               │
│           → update DSP goal progress             │
└─────────────────────────────────────────────────┘

VALID TYPE CODES
  TEACH   instruction day      (Canvas only, not Synergy)
  DUE     student submission   (Canvas + Synergy)
  ASSESS  quiz/test            (Canvas + Synergy)
  PRESENT oral presentation    (Canvas + Synergy)
  REVIEW  review day           (Canvas only, not Synergy)
  INTRO   unit launch          (Canvas only, not Synergy)
```

---

## Full Historical Lesson Plan Reference

For the complete listing of all 118 lessons across Q1–Q4 for all three courses, see **Version 2.0** of this document (archived) or the `LESSON_PLANS` array in `student-leader-hub.html`. The Q4 lessons active right now are listed in Section 5 above.

DECA season events use a separate format — see the **DECA Season Events** section in Version 2.0 or `LH_02_INTEGRATION_GUIDE.md`.

---

*Last updated: March 2026 — Q4 active, 49 days to DSP end*
