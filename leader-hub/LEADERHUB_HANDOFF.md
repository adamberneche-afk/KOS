# LeaderHub — Instance Handoff Document
## For the next Claude instance continuing this project

**Generated:** April 9, 2026  
**DSP end date:** May 15, 2026 — **36 days remaining**  
**Handoff reason:** Context window bloated after long multi-session build  

> **Read this entire document before touching any file.** Everything the previous instance learned through trial and error is captured here. Do not infer — use the exact strings, patterns, and rules below.

> **⚠ HISTORICAL — this is a point-in-time session handoff from April 9,
> 2026, not living documentation.** The current architecture reference
> is `README.md` in this same directory. In particular, every DSP-era
> claim here is stale: the DSP framework content (`openDSP`,
> `generateDSPReport()`, the DSP countdown pill, and related
> DSP-specific framing) was deliberately removed from the shipped app —
> see `README.md`'s "DSP framework content — removed" section. Treat
> this file as a record of build decisions made at the time, not a
> description of what ships today.

---

## Who This Is For

**Adam Berneche** — CTE Business & Marketing teacher, Clover Hill High School, Chesterfield County Public Schools (CCPS), Virginia. Five simultaneous roles:

| Role | System | Evidence standard |
|------|--------|------------------|
| Classroom instructor | Canvas + Synergy + LeaderHub | DSP Standard 1 |
| DECA chapter advisor | LeaderHub trips + DECA events | DSP Standard 2 |
| Field trip coordinator | LeaderHub trip wizard | DSP Standard 2 |
| WBL / school store manager | LeaderHub WBL tracker | DSP Standard 2 |
| E-sports coach | LeaderHub e-sports view | DSP Standard 2 |

Adam is under a **Directed Support Plan (DSP)** ending May 15, 2026. Standard 1 = lesson planning/differentiation. Standard 2 = professional responsiveness. Everything in the app generates evidence for one of these two standards.

---

## The Files

All files live at `/mnt/user-data/outputs/`. The app is a **single HTML file** — no build step, no server, no npm.

| File | Purpose | Touch? |
|------|---------|--------|
| `student-leader-hub.html` | **THE APP** — 15,149 lines, ~1MB | Primary work target |
| `EmailBridge.gs` | Google Apps Script — sub plan docs + Gmail drafts | Update when adding GAS endpoints |
| `LEADERHUB_PRINCIPLES.md` | Six guiding principles — the constitution | Read before every session |
| `LEADERHUB_WIP.md` | Historical work log | Reference only |
| `LEADERHUB_README.md` | Architecture overview | Reference only |
| `LH_01_NAMING_CONVENTIONS.md` | Three-system naming (Canvas·Synergy·LeaderHub) v3.0 | Reference + update |
| `LH_02_INTEGRATION_GUIDE.md` | Data schemas and integration architecture | Reference only |
| `LH_03_CANVAS_INTEGRATION_IDEAS.md` | Future build roadmap | Reference only |
| `LH_05_GRADING_STRUCTURE.md` | Formative/summative weighting, all 12 quarters | Reference + update |

---

## The App Architecture

### Single file rules — NEVER VIOLATE

1. **One `.html` file** — everything: HTML, CSS, JS, data, seed content. No imports, no CDN (except Google Fonts in `<head>`).
2. **All persistence is `localStorage`** with `lh_` prefix. Always use `LS.get()` / `LS.set()` — never raw `localStorage`.
3. **No AI/API calls** — all Gemini infrastructure was removed. All 12 former AI functions are now deterministic local replacements or optional Apps Script calls via `callGAS()`.
4. **No `alert()` or `prompt()`** — zero of both. All validation uses `_showToast()`.
5. **No scrolling on `#view-dashboard`** — `overflow:hidden` is intentional.
6. **No `console.group()` or `%c` logging** — CCPS browser blocks these. Plain `console.log()` only.
7. **FERPA** — no student names or IDs ever leave the browser.
8. **`LESSON_PLANS` and `SCR_COURSES`** are hardcoded in JS source, not in localStorage.

### The script block

The app has **two `<script>` blocks**. The second one (`opens[1]`) contains all application JS. Always extract JS using:
```python
opens  = [i for i,l in enumerate(lines) if l.strip() == '<script>']
closes = [i for i,l in enumerate(lines) if l.strip() == '</script>']
js = '\n'.join(lines[opens[1]+1:closes[1]])
```

### Function extraction — always use brace counting

```python
def get_fn(name):
    for pre in ['async function ', 'function ']:
        s = js.find(pre + name + '(')
        if s >= 0:
            depth = 0
            for i in range(s, len(js)):
                if js[i] == '{': depth += 1
                elif js[i] == '}':
                    depth -= 1
                    if depth == 0: return js[s:i+1]
    return ''
```

Never use the naive `get_fn` that stops at the next `\nfunction` — it breaks on large functions with nested functions inside.

### Syntax verification — always run before saving

```python
import subprocess
with open('/tmp/v.js','w') as f: f.write(js)
r = subprocess.run(['node','--check','/tmp/v.js'], capture_output=True, text=True)
print(f"Syntax: {'✅ PASS' if r.returncode==0 else '❌ FAIL — '+r.stderr[:200]}")
```

---

## Current App State

**Lines:** 15,149  
**Syntax:** ✅ Clean  
**alert() calls:** 0  
**prompt() calls:** 0  
**callAI() calls:** 0  
**Gemini refs:** 0  

### Key constants present (all required at runtime)

```
CCPS_NO_SCHOOL          — Set of no-school dates, used by isSchoolDay()
CCPS_SCHEDULE_OVERRIDES — Date-keyed schedule type overrides
DB_ROLES                — Role metadata (icon, label, color)
BELL_SCHEDULES          — Period times for A/B/EARLY3 schedule types
SCHOOL_PERIODS          — Runtime period array
GRADING_STRUCTURE       — 12-quarter formative/summative compliance map
LP_Q_COLORS             — Lesson plan quarter color palette
LP_C_COLORS / LP_C_LABELS — Course color palette and labels
```

**CRITICAL:** These constants must be defined **before** `getTodayScheduleType()` in the JS source. In a previous session, they were accidentally removed during an AI refactor and had to be restored. The constant `CCPS_NO_SCHOOL` is referenced at line ~10489 (`getTodayScheduleType`). If it's missing, the entire app fails to initialize.

### Apps Script bridge

`callGAS(action, payload)` — calls the EmailBridge URL stored in `LS.get('lh_email_bridge_url')`. Endpoints:
- `action: 'subPlan'` → creates Google Doc, returns `{ok, docUrl}`
- `action: 'bragEmail'` → creates Gmail draft, returns `{ok}`
- `action: 'markConsumed'` → marks horizon email items consumed
- GET (no action) → scans Gmail label "LeaderHub" for horizon items

---

## The Priority Engine

`buildActionQueue()` — the heart of the app. Produces the two choice cards. **17 signals**, sorted descending:

| Priority | Signal | Nav | Action |
|----------|--------|-----|--------|
| P100 | OVERDUE deadlines (`_isActionable` filter) | role-based | — |
| P95 | Obs follow-up (excludes `outcome='resolved'`) | lessons | — |
| P90 | Due ≤3d deadlines (`_isActionable`) | role-based | — |
| P88 | Green meeting TODAY | dashboard | `openDSP` |
| P87 | Trip incomplete + submit deadline ≤7d | trips | — |
| P85 | Low stock inventory | wbl | — |
| P84 | Slips not returned + trip ≤7d | slips | — |
| P82 | PLC meeting TODAY | dashboard | `logPLC` |
| P80 | Synergy grades overdue (>14d stale) | lessons | — |
| P75 | WBL unsigned agreements | wbl | — |
| P72 | Green meeting in 1–5d | dashboard | `openDSP` |
| P72 | Canvas staleness (>7d) | lessons | — |
| P70 | Due ≤7d deadlines (`_isActionable`) | role-based | — |
| P65 | Yesterday's avoided task (from journal cron) | dashboard | — |
| P62 | DSP Goal stalled (<60%, past-date guard) | goals | — |
| P60 | SBE checklist items | wbl | — |
| P55 | Journal not done (`isSchoolDay` gated) | dashboard | — |
| P0 | All caught up | lessons | — |

**`_isActionable`** filter: excludes `cal_*` (calendar info), `dl_green` (Green meetings), `dl_plc` (PLC meetings) from P100/P90/P70 signals. These are tracked separately and never fire as "overdue."

**Snooze:** `choiceSnooze(idx, encodedText)` — 4-hour snooze via `CHOICE_SNOOZED` array in LS.

### refreshNextAction() callers (35 total)

Every function that mutates data which affects the choice cards must call `refreshNextAction()`. Currently wired: `showView, resolveTask, pauseTask, toggleTask, addDecaResult, updGoal, delGoal, saveGoal, confirmArchive, wblLogHoursConfirm, lpSaveEdit, cycleScore, saveMatch, organizeThought, generateSubPlan, generateBragEmail, saveDeadline, deleteDeadline, choicePick, choiceSnooze, renderQuickLog, qlLogHours, horizonToggle, horizonDelete, saveJournalEntry, checkCron, markDepositDone, markWorkdayDone, markCommsDone, logPLCAttended, logGreenMeetingAttended, toggleObsPanel, toggleObsCheck, resolveObsAction, initCockpit`

When adding any new data-mutating function, **always add `refreshNextAction()` at the end**.

---

## The Evidence Pipeline

17 functions write DSP evidence. All route through either `_logDaily()` (for `lh_daily_log`) or direct writes to named LS keys:

| Function | Evidence key | Type |
|----------|-------------|------|
| `markCommsDone` | `_logDaily` | `comms` |
| `saveJournalEntry` | `lh_journal_history`, `lh_journal_last` | — |
| `toggleObsCheck` | `_logDaily` | `obs_prep_complete/ready` |
| `logGreenMeetingAttended` | `_logDaily` | `green_meeting` |
| `logPLCAttended` | `_logDaily` | `plc_meeting` |
| `markWorkdayDone` | `_logDaily` | `workday_submit` |
| `lpSaveEdit` | `lh_lp_edit_meta` | — |
| `cycleScore` | `lh_scr_session_log` | — |
| `wblLogHoursConfirm` | `lh_wbl_hours_log` | — |
| `qlLogHours` | `lh_wbl_hours_log` | — |
| `confirmArchive` | `lh_trip_archive` | — |
| `saveMatch` | `_logDaily` | `esports_match` |
| `toggleTask` | `_logDaily` | `task_complete` |
| `generateBragEmail` | `lh_brag_log` | — |
| `generateSubPlan` | `lh_sub_plan_log` | — |
| `addDecaResult` | `lh_deca_results` | — |
| `choicePick` | `_logDaily` | `choice_picked` |

`_logDaily(entry)` — caps at 500 entries (`slice(-500)`).  
`generateDSPReport()` — 17 stats, 314+ lines, reads all evidence keys. Never break this function.

---

## The Cron System

**Journal → 2am cron → morning briefing:**

1. `saveJournalEntry()` — saves entry, schedules cron at `02:00`, writes `lh_cron_pending`
2. `checkCron()` — fires in `dbTick()` every 15s, checks if 2am window hit
3. `runCronAdjustment(entry)` — **deterministic** (no AI). Reads mood, avoided task, live DEADLINES, stalled goals. Produces `{loadTier, tomorrowMessage, priorities, avoidedFollowUp, energyNote, kindnessNote}`. Returns `Promise.resolve(plan)` so `.then()` chain in `checkCron` still works.
4. Pinned avoided task injected into `HORIZON.short` with `{pinned:true}`
5. `showCronMorningBriefing(plan, entry)` — renders the morning banner on next load

**Pinned horizon items** render with yellow highlight, 📌 prefix, and bold amber text.

---

## School Day Guards

`isSchoolDay(date)` — checks weekends AND `CCPS_NO_SCHOOL` set.

**9 of 10 dbTick checks use `isSchoolDay()`:**
`checkCommsTriage, checkDepositReminder, checkWorkdayReminder, checkBragBoardPrompt, checkJournalAutoPrompt, checkGreenCheckinToday, checkPLCToday, checkEsportsMatchToday, checkDECAEventTomorrow`

**`checkCron` intentionally skips `isSchoolDay()`** — runs at 2am regardless of school calendar.

---

## The Task System

`renderTasks()` — three-section layout: open → paused ("Pushed to Later") → completed.

**Three inline buttons per task:**
- ✓ green — `resolveTask(id,'ontime')` — marks done, logs evidence, triggers undo toast on deletion
- ⏸ blue/grey — `pauseTask(id)` — toggles paused; paused tasks excluded from `d-tasks` counter
- ✕ red — `resolveTask(id,'missed')` — marks blocked

**Counter rule:** `tasks.filter(t=>!t.done && t.status!=='paused').length` — paused tasks excluded everywhere: `renderTasks`, `renderDashboard` (`safeSet('d-tasks'...)`), `toggleTask`, `addTask`, `resolveTask`, `pauseTask`.

---

## LESSON_PLANS

**119 entries** (including `lp_8177_05` The Millionaire's Strike and `lp_8175_00` Rebranding the Washington Football Team).

**`assess` arrays:** 70 of 119 lessons have an `assess` field — array of `{label, type, pct}` items where `type` is `'summative'` or `'formative'`. 39 summative items, 35 formative items.

**GRADING_STRUCTURE constant** — captures all 12 course-quarter compliance data:
- Formative: 40% | Summative: 60% | Max single assignment: 25% | Min 3 summative/quarter
- Three quarters were non-compliant and were fixed: `6115_Q1`, `8177_Q1`, `8177_Q4`

**Grading UI:** LP cards show `▲ Summative N%` and `◆ Formative` badges. LP modal shows full grading strip with Canvas title strings to copy.

### Drive doc structure

| Status | Course/Quarter | Doc ID | Count |
|--------|---------------|--------|-------|
| **PLACEHOLDER** | 6115 Q1 | `1mgCxSsH6xIVgd77PmCTsZhtkuR4C1N99p1wmey5WSDA` | 10 lessons, no real file |
| **COMPILATION** | 6115 Q2 | `1W1kLhBMS_LL5c8HD6egWLmyvlACIldsMkN6qYDdA8x4` | 16 lessons in 1 doc |
| **COMPILATION** | 6115 Q3 | `1_VsWWDxsmiiuOWGtEI8f_1W2gu8abvP1pq4CzO8efl4` | 15 lessons in 1 doc |
| **COMPILATION** | 6115 Q4 | `1GiKW9EzEs6TFsq-0ePvpOyPbUIQd-oFa5ZQQbecAVtE` | 12 lessons in 1 doc |
| **COMPILATION** | 8175 all | `1WstjEnXFT_YUVisi8Q7kE_NpFYhG4RKr9yqhixmuKUE` | 36 lessons in 1 doc |
| **individual** | 8177 all | (28 unique doc IDs) | 1 doc per lesson ✅ |
| **individual** | 8175 Q1 bonus | `1c8hvDwgCzintcdtjKAe1ULYuijbnk21SfSDXoGgm2m8` | lp_8175_00 only |

**Pending work (Drive):** Adam asked about splitting compilation docs into individual files. The recommended approach is an Apps Script splitter — it reads the compilation doc, splits on lesson heading patterns, creates individual docs with naming convention titles, and returns new doc IDs for updating `LESSON_PLANS` in the app. This has NOT been built yet. It is the next major task.

**8177 individual docs** are also pending a rename from current titles to naming convention format (`8177 | Q1 | TEACH | The Business of the Game`). This was discussed but not yet executed.

---

## The Naming Convention System (v3.0)

**Format:** `[COURSE] | [QUARTER] | [TYPE] | [Title]`  
**Courses:** `8177` `8175` `6115` `DECA`  
**Types:** `TEACH` `DUE` `ASSESS` `PRESENT` `REVIEW` `INTRO`  

| TYPE | Synergy category | Grading |
|------|-----------------|---------|
| `TEACH`, `REVIEW`, `INTRO` | Not graded | Formative if scored |
| `DUE` (major product) | Major Assignments | Summative |
| `DUE` (classwork) | Minor Assignments | Formative |
| `ASSESS` | Tests & Quizzes | Summative |
| `PRESENT` | Major Assignments | Summative |

**Synergy update schedule (Q4):** Apr 4 ✓, Apr 18 +9d, May 2 +23d, May 16 (after DSP end)

---

## Active Deadlines (as of April 9, 2026)

| Days | ID | Title |
|------|----|-------|
| +2d | `dl_green3` | Meeting w/ Ms. Green (DSP check-in) |
| +6d | `dl4` | SBE Business Plan — Principal Sign-Off |
| +7d | `dl_plc_apr` | CTE PLC — Monthly Meeting |
| +9d | `dl_syn3` | Synergy Grades — 2-Week Update Due |
| +13d | `dl5` | Field Trip Form Submission Deadline |
| +16d | `dl_green4` | Meeting w/ Ms. Green (DSP check-in) |
| +16d | `dl6` | DECA ICDC Atlanta |
| +23d | `dl_syn4` | Synergy Grades — 2-Week Update Due |
| +30d | `dl_green5` | Meeting w/ Ms. Green (DSP check-in) |
| +36d | `dl_dsp_end` | **DSP End Date — All Standards Must Be Met** |

---

## The Principles Scorecard

Run this at the start of every session and after every edit. All checks must pass before delivering.

```python
import re, subprocess
from datetime import date

with open('/mnt/user-data/outputs/student-leader-hub.html', 'r') as f:
    content = f.read()
lines = content.split('\n')
opens  = [i for i,l in enumerate(lines) if l.strip() == '<script>']
closes = [i for i,l in enumerate(lines) if l.strip() == '</script>']
js = '\n'.join(lines[opens[1]+1:closes[1]])

def get_fn(name):
    for pre in ['async function ', 'function ']:
        s = js.find(pre + name + '(')
        if s >= 0:
            depth = 0
            for i in range(s, len(js)):
                if js[i] == '{': depth += 1
                elif js[i] == '}':
                    depth -= 1
                    if depth == 0: return js[s:i+1]
    return ''

baq = get_fn('buildActionQueue')
dsp = get_fn('generateDSPReport')
sv  = get_fn('showView')
ev_keys = {'lh_obs_history','lh_brag_log','lh_sub_plan_log','lh_trip_archive',
           'lh_journal_history','lh_scr_session_log','lh_wbl_hours_log',
           'lh_lp_edit_meta','lh_deca_results'}
evidence_fns = ['markCommsDone','saveJournalEntry','toggleObsCheck','logGreenMeetingAttended',
    'logPLCAttended','markWorkdayDone','lpSaveEdit','cycleScore','wblLogHoursConfirm',
    'qlLogHours','confirmArchive','saveMatch','toggleTask','generateBragEmail',
    'generateSubPlan','addDecaResult','choicePick']
isd_fns = ['CommsTriage','DepositReminder','WorkdayReminder','BragBoardPrompt',
           'JournalAutoPrompt','GreenCheckinToday','PLCToday','EsportsMatchToday','DECAEventTomorrow']

with open('/tmp/v.js','w') as f: f.write(js)
r = subprocess.run(['node','--check','/tmp/v.js'], capture_output=True, text=True)
checks = [
    ("Syntax clean",                r.returncode == 0),
    ("AI: 0 callAI()",              'callAI(' not in js),
    ("AI: 0 Gemini refs",           'generativelanguage' not in content),
    ("AI: 0 lh_api_key refs",       'lh_api_key' not in content),
    ("P5: 0 alert()",               'alert(' not in js),
    ("P5: 0 prompt()",              'prompt(' not in js),
    ("Data: CCPS_NO_SCHOOL",        'const CCPS_NO_SCHOOL' in js),
    ("Data: DB_ROLES",              'const DB_ROLES' in js),
    ("Data: GRADING_STRUCTURE",     'const GRADING_STRUCTURE' in js),
    ("P1: 17 signals",              len(list(re.finditer(r'q\.push\(', baq))) == 17),
    ("P1: sorted",                  'active.sort((a,b)=>b.priority-a.priority)' in baq),
    ("P1: showView→refreshNA",      'refreshNextAction' in sv[sv.find('dashboard'):sv.find('dashboard')+80]),
    ("P2: 17/17 evidence",          all('_logDaily(' in get_fn(f) or any(k in get_fn(f) for k in ev_keys)
                                        for f in evidence_fns)),
    ("P2: _logDaily cap 500",       'slice(-500)' in get_fn('_logDaily')),
    ("P3: 9 isSchoolDay guards",    all('isSchoolDay' in get_fn(f'check{n}') for n in isd_fns)),
    ("P3: cron skips isSchoolDay",  'isSchoolDay' not in get_fn('checkCron')),
    ("P4: cron deterministic",      'callAI' not in get_fn('runCronAdjustment') and
                                    'Promise.resolve' in get_fn('runCronAdjustment')),
    ("P6: 17 DSP stats",            all(k in dsp for k in ['greenMeetings.length','plcMeetings.length',
        'workdayDone.length','bragCount','subCount','goalRows','wblHoursAdded'])),
    ("Task: pauseTask defined",     'function pauseTask(' in js),
    ("Task: counter excl paused",   "status!=='paused'" in get_fn('addTask')),
    ("LP: assess arrays",           'assess:[' in js),
    ("LP: 39+ summative items",     js.count("type:'summative'") >= 39),
]
passed = sum(1 for _,v in checks if v)
for label, ok in checks:
    print(f"  {'✅' if ok else '❌'} {label}")
print(f"\n{passed}/{len(checks)}")
```

---

## Known Issues / Not Yet Done

### High priority
1. **Drive compilation doc splitter** — 63 lessons across 4 compilation docs need splitting into individual files. Agreed approach: Apps Script that reads each doc, splits on heading patterns, creates individual named files, returns new doc IDs. `LESSON_PLANS` array then needs doc IDs updated. **This is the work that was interrupted when the handoff was requested.**

2. **8177 individual doc renames** — 28 docs exist individually but have old title formats. Need renaming to `8177 | Q[N] | TEACH | [Title]` via Apps Script. Simple once compilation split is done.

3. **6115 Q1 placeholder** — 10 lessons point to doc ID `1mgCxSsH6xIVgd77PmCTsZhtkuR4C1N99p1wmey5WSDA` which is not a real individual file. These need new docs created.

### Medium priority
4. **DSP Report grading section** — `GRADING_STRUCTURE` constant exists but `generateDSPReport()` doesn't yet read it. A "Grading Compliance" section in the DSP report would show the 12-quarter summative counts and confirm the 25% rule is met. Good evidence for Standard 1.

5. **Canvas assignment titles** — The naming convention format is documented and the LP modal generates the Canvas title string, but Canvas itself hasn't been updated with the new naming convention yet. This requires Adam to manually rename or a Canvas API script.

### Low priority
6. **lp_8177_05** (The Millionaire's Strike) — exists in `LESSON_PLANS` but has no Drive doc yet. Grouped in 8177 Q1 but no individual file was ever created.

---

## Session Startup Checklist

1. Read `LEADERHUB_PRINCIPLES.md` — every decision flows from the six principles
2. Run the scorecard above — confirm current state before touching anything
3. Make a backup: `cp /mnt/user-data/outputs/student-leader-hub.html /home/claude/hub-backup-HHMM.html`
4. Read the relevant function bodies before editing — never infer from function names
5. After each edit: run Node syntax check, run the relevant scorecard checks
6. After completing work: run full scorecard, present the file

---

## What Not to Do

- **Never use the naive get_fn** that stops at the next `\nfunction` — use brace counting
- **Never replace the entire AI region** in a single operation — it will sweep up adjacent utility functions (`_logDaily`, `_showToast`, `_undoToast`, `CCPS_NO_SCHOOL`, `DB_ROLES`, `BELL_SCHEDULES`). This happened once and caused a full app crash.
- **Never add new scrollable sections to `#view-dashboard`** — overflow:hidden is structural
- **Never add direct `localStorage` calls** — always `LS.get()` / `LS.set()`
- **Never assume a function name matches its behavior** — read it first
- **Never deliver without running the full scorecard** — partial fixes leave hidden regressions

---

*This document is the complete institutional memory of this project as of April 9, 2026. The app file is the ground truth. When in doubt, read the file.*
