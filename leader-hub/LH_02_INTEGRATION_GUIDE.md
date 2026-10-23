# LeaderHub Integration Guide
## For LLMs, Apps Scripts, and Cross-Platform Automation

**Version:** 2.0 · 2025–26  
**Companion docs:** `LH_01_NAMING_CONVENTIONS.md` · `LH_03_CANVAS_INTEGRATION_IDEAS.md`

> **For LLMs:** This document tells you what every piece of LeaderHub data looks like, where it lives, and how events flow from Canvas into the app. Read this before generating Apps Script code, writing pacing calendar entries, or building any integration.

> ### ⚠️ CORRECTIONS — three of the Core Constraints below were true in v2.0 and are not true now
>
> This doc is addressed to LLMs and tells them to read it before generating
> code, so a stale constraint here doesn't just misinform — it gets built.
> Both corrections are marked inline in the table as well.
>
> 1. **LeaderHub is no longer a single client-side `.html` file.** It is
>    server-backed: `leader-hub:app` is a real Apps Script project — every
>    `.gs` file in this folder, listed authoritatively in
>    `tools/gas-lint/project-map.json` — with a Web App deployment, `doGet`/`doPost`, and a `_lhDispatchAction_` action
>    dispatch. The HTML no longer runs standalone: since 2026-10-22 it runs
>    only as that web app, and opened from disk it shows "LeaderHub now runs
>    as a web app" and stops (`src/00-shell-head.html`). It is built from
>    `src/` by `node tools/leaderhub-build/build.js`.
>
> 2. **`callAI()` does not exist, and there is no API key anywhere.** It was
>    deleted from the HTML along with `getAPIKey()`/`setAPIKey()` — see the
>    `// ── Removed: Gemini AI infrastructure` marker in
>    `student-leader-hub.html`. `lh_api_key` is not read or written by any
>    current code. **Do not generate code that reads a Gemini key from
>    `localStorage`, or from anywhere else.** AI work now crosses the
>    *Bifurcation Boundary*: `EmailBridge.gs` writes a job row to the
>    `AI_Queue` tab, and a hand-built Google Workspace Flow picks it up and
>    calls Gemini using the Workspace account's own built-in access, then
>    writes the result back. `EmailBridge.gs` says so in its AI queue
>    section: "It never calls Gemini itself and never holds an API key." A
>    developer-key path is not merely unused here — it would need a standard
>    Cloud project, which nothing in this repo has (see
>    `tools/gas-lint/gcp-map.json`). Start from `LEADERHUB_AI_FLOW_SETUP.md`.
>
> 3. **Nothing is persisted in `localStorage`** (since 2026-10-22,
>    `meta/LEADERHUB_NO_BROWSER_STORAGE_PLAN_2026-10.md`). `doGet()` writes
>    the server's data into the page (`window.__LH_BOOT__`, `lhBootData_` in
>    `Data.gs`); `LS.get()`/`LS.set()` read and write page memory
>    (`_lhStore`) and save every change to the server: config keys
>    (`LH_CONFIG_KEYS`, `Config.gs`) as Script Properties, record lists
>    (`LH_DATA_TABS`, `Data.gs`) as tabs in the private "LeaderHub Data"
>    spreadsheet, SCR scores per cell in its `scr_scores` tab (`SCR.gs`). The `lh_*` key names are
>    still the keys. **Do not generate code that reads or writes browser
>    storage**; `tests/leaderhub/no-browser-storage.test.js` fails on it.
>    There is also no Email Bridge URL: `callGAS()` uses
>    `google.script.run` only.

---

## System Architecture

```
┌─────────────────────┐  naming convention  ┌──────────────────────┐
│     Canvas LMS      │ ──────────────────▶ │   Google Calendar    │
│  (assignments,      │   iCal / sync       │  (schedule source    │
│   modules,          │                     │   of truth)          │
│   rubrics, pages)   │                     │                      │
└─────────────────────┘                     └──────────┬───────────┘
                                                       │
                                            Apps Script syncCalendar()
                                            nightly 11 PM — reads all
                                            calendars user has access to
                                                       │
                                            ┌──────────▼───────────┐
                                            │  Google Sheet        │
                                            │  "Inbox" tab         │
                                            │  (relay buffer)      │
                                            └──────────┬───────────┘
                                                       │
                                            Apps Script Web App
                                            polled on LeaderHub load
                                            + every 10 minutes
                                                       │
                                            ┌──────────▼───────────┐
                                            │     LeaderHub        │
                                            │  (the same web app;  │
                                            │  data on the server, │
                                            │  see correction 3)   │
                                            └──────────────────────┘
```

**Data flows in one direction only.** LeaderHub reads; it never writes back to Canvas or Calendar.

---

## Core Constraints — Never Violate These

| # | Constraint | Why |
|---|-----------|-----|
| 1 | ~~LeaderHub is a single `.html` file~~ **— NO LONGER TRUE, see corrections above.** `leader-hub:app` is a real Apps Script project (file list: `tools/gas-lint/project-map.json`) and the HTML runs only as its Web App | Built from `src/` by `tools/leaderhub-build/build.js`; still no npm dependencies |
| 2 | ~~All persistence is `localStorage`~~ **— NO LONGER TRUE, see correction 3.** Keys keep the `lh_` prefix and go through `LS.get()` / `LS.set()`, which save to the server | Never touch `localStorage`, `sessionStorage` or IndexedDB |
| 3 | ~~All AI calls go through `callAI()`~~ **— REMOVED, see corrections above.** AI jobs are queued to the `AI_Queue` tab by `EmailBridge.gs` and generated by a Workspace Flow | **No API key exists or should be introduced.** The Flow uses the Workspace account's built-in Gemini access |
| 4 | No `console.group()` or `%c` logging | School browser blocks these; plain `console.log()` only |
| 5 | FERPA — no student names in AI prompts | Anonymize with tokens (e.g., `STUDENT_1`) before sending |
| 6 | Dashboard is `overflow:hidden` | Never add scrollable content to `#view-dashboard` |
| 7 | `LESSON_PLANS` and `SCR_COURSES` are hardcoded | They live in the JS source, not in saved data |

---

## Data Schema Reference

### `trips` — Field trip records (`lh_trips`)

```javascript
{
  id:        3,                           // int, auto-increment via nextId.trip
  name:      'DECA State Leadership Conference (SLC)',
  sub:       'overnight',                 // 'same-day' | 'overnight' | 'out-of-state'
  date:      '2026-02-27',               // YYYY-MM-DD departure
  retDate:   '2026-03-01',               // YYYY-MM-DD return (same as date if day trip)
  dest1:     'Virginia Beach Convention Center',
  dest2:     '',
  grade:     '9-12',
  classMem:  'DECA Members',
  invited:   30,
  stuAtt:    15,
  adultAtt:  2,
  stuMF:     '8F/7M',
  adultMF:   '1M/1F',
  costStu:   350,
  costAdult: 350,
  chap:      '1/1',                      // chaperones M/F
  wc:        0,                          // wheelchair count
  depTime:   '9:00 AM',
  retTime:   '5:00 PM',
  transport: 'Charter Bus — Winn Transportation',
  parentTx:  'NO',                       // 'YES' | 'NO'
  fund:      '4280',
  po:        '26-0368-2559',
  sponsor:   'Adam Berneche',
  cell:      '[phone removed]',
  coord:     'Adam Berneche',
  acctNotes: 'DECA Account 4280',
  why:       'CTSO competition...',
  pre:       'Preparation activities...',
  post:      'Follow-up activities...',
  status:    'complete',                 // 'upcoming' | 'active' | 'complete' | 'cancelled'
  reason:    'DECA CTSO — Student Competition Conference',
  acttype:   'Student Conference',
  housing:   'Hampton Inn...',
  notes:     '',
}
```

### `students` — DECA member roster (`lh_students`)

```javascript
{
  id:           1,
  first:        'Jordan',
  last:         'Rivera',
  grade:        12,
  position:     'President',
  competEvent:  'Business Management',
  memberStatus: 'active',    // 'active' | 'unpaid' | 'slc' | 'icdc' | 'alumni'
  paid:         true,
  duesDate:     '2025-10-15',
  email:        'jrivera@student.ccpsnet.net',
  phone:        '(804) 555-0101',
  parentEmail:  'mrivera@email.com',
  parentPhone:  '(804) 555-0100',
  address:      '1234 Oak St, Midlothian VA 23114',
  shirtSize:    'M',
  dietaryNeeds: '',
  ev:           5,           // linked otherEvent id (null if none)
  notes:        '',
  alumniYear:   null,        // graduation year — alumni only
  alumniPref:   null,        // 'mentoring' | 'newsletter' — alumni only
}
```

**`memberStatus` progression:**
```
unpaid → active → slc (DLC qualifier) → icdc (SLC Top 8) → alumni
```

### `slipRosters` — Permission slip tracker (`lh_slip_rosters`)

```javascript
// Object keyed by tripId (int). Each value is an array:
[
  // DECA member — resolved via students.find(s => s.id === slip.studentId)
  { id: 101, studentId: 1, source: 'deca',   tx: 'ccps',   status: 'returned', notes: '' },

  // Class roster — resolved via SCR_COURSES[code].periods[period]
  { id: 102, classRef: { code: '8177', period: '3rd Odd', name: 'Gonzalez Torres, Erik' },
    source: 'class', tx: 'ccps', status: 'pending', notes: '' },

  // Manual entry — name/phone stored directly on the slip
  { id: 103, first: 'Taylor', last: 'Brooks', phone: '(804) 555-0000',
    source: 'manual', tx: 'parent', status: 'returned', notes: 'Parent driving' },
]
```

`tx`: `'ccps'` = school bus, `'parent'` = parent-provided transport  
`status`: `'pending'` | `'returned'` | `'missing'`

### `otherEvents` — DECA/leadership/community events (`lh_events`)

```javascript
{
  id:         13,
  name:       'DECA State Leadership Conference (SLC)',
  type:       'deca',          // 'deca' | 'leadership' | 'community'
  date:       '2026-02-27',
  endDate:    '2026-03-01',    // empty string if single day
  loc:        'Virginia Beach Convention Center, VA',
  stu:        15,
  adults:     2,
  stuMF:      '8F/7M',
  adultMF:    '1M/1F',
  status:     'active',        // 'upcoming' | 'urgent' | 'active' | 'complete' | 'planned'
  cost:       '~$350/student',
  transport:  'Charter Bus...',
  chaperones: 'Adam Berneche · Amanda Berneche',
  po:         '26-0368-2559',
  account:    'DECA 4280',
  contact:    'Shannon Tual (703) 860-5000',
  housing:    'Hampton Inn...',
  notes:      '',
}
```

### `DEADLINES` — Deadline items (`lh_deadlines`)

```javascript
{
  id:    'dl_8',
  title: 'Tournament Sponsorship Proposal — 8177 Q3',
  date:  '2026-03-14',    // YYYY-MM-DD due date
  role:  'teach',         // see role codes below
}
```

**Role codes:**

| Role | Assigned when |
|------|--------------|
| `teach` | Canvas classroom event (TEACH / DUE / ASSESS) |
| `deca` | DECA event (REG / PAYMENT / CONF) |
| `trips` | Field trip deadline or blackout date |
| `store` | School store / inventory item |
| `esports` | Esports match or tournament |
| `general` | Everything else |

### `LESSON_PLANS` — Hardcoded in JS source (not in saved data)

```javascript
{
  id:       'lp_8177_16',
  course:   '8177',
  q:        3,                   // 1 | 2 | 3 | 4
  title:    'Market Research & Survey Design',
  subtitle: 'Target Market, Bias & Google Forms',
  comps:    [2, 18, 42, 46, 93], // competency numbers — see SCR_COURSES
  docId:    '1r5NOu0wy8oTicILis_Ycvc3z20hVzw_dzM6mWbaDm7c', // Google Doc ID
}
```

### `SCR_COURSES` — Class rosters + competencies (hardcoded in JS source)

```javascript
{
  '8177': {
    code:   '8177',
    name:   'Sports, Entertainment, and Event Management',
    competencies: [
      { num: 1, req: 'Required', text: 'Demonstrate creativity and innovation.',
        duty: 'Demonstrating Personal Qualities and Abilities' },
      // ... 108 total competencies
    ],
    periods: {
      '3rd Odd': [
        { name: 'Gonzalez Torres, Erik', scores: {} },
        // ... 22 students; format is always "Last, First"
      ]
    }
  },
  '8175': { periods: { '2nd Even': [...], '3rd Even': [...], '4th Even': [...] } },
  '6115': { periods: { '4th Odd': [...] } },
}
```

---

## Google Sheet Relay — Schema

**Sheet ID:** `1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0`  
**Tab:** `Inbox`

| Col | Field | Type | Notes |
|-----|-------|------|-------|
| A | `id` | string | Deterministic hash — see below |
| B | `source` | string | Human-readable label ("My Calendar", "LeaderHub") |
| C | `received_at` | ISO 8601 | When written to sheet |
| D | `urgency` | string | `high` \| `medium` \| `low` |
| E | `horizon` | string | `short` \| `mid` \| `long` |
| F | `text` | string | The event title (full naming-convention string) |
| G | `deadline_date` | YYYY-MM-DD | Empty string if no date |
| H | `role` | string | See role codes above |
| I | `consumed` | boolean | `TRUE` once LeaderHub has processed |
| J | `channel` | string | `calendar` \| `email` \| `lh-shortcut` |

**Deterministic ID generation** (prevents duplicate rows on re-sync):
```javascript
function makeId(prefix, seed) {
  let hash = 0;
  const s = String(seed).slice(0, 200);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0; // 32-bit int
  }
  return prefix + '_' + Math.abs(hash).toString(36);
}
// Calendar events:   cal_[hash of calendarId + eventId]
// Emails:            em_[hash of messageId]
// LH shortcuts:      lh_[hash of messageId]
```

---

## Apps Script — EmailBridge.gs Function Reference

### `runAll()` — Every 10 minutes via time-driven trigger
Calls `processInbox()` then `processLHShortcuts()`.

### `syncCalendar()` — Nightly at 11 PM via time-driven trigger
Reads all Google Calendars the authenticated user can access. For each event in the next 30 days:
1. Skips birthday and holiday calendars
2. Parses event title with naming convention regex
3. Infers `urgency`, `horizon`, and `role` from title and event date
4. Writes one row to Inbox tab (skips if deterministic ID already exists and is unconsumed)

### `processInbox()` — Gmail label "LeaderHub"
Watches for emails with the label `LeaderHub` (applied via Gmail filters). Applies 8 keyword rules to determine role and urgency. Extracts dates with regex from body text.

### `processLHShortcuts()` — Self-email shortcut
Watches for emails FROM your address TO your address with subject beginning `LH:`. The text after `LH:` becomes the task. Example:
```
Subject: LH: deca icdc hotel deposit by Friday
```

---

## Processing Logic — How LeaderHub Handles Incoming Items

When `EMAIL_BRIDGE.poll()` fetches items from the Sheet Web App:

```
for each item in items:

  if item.channel === 'calendar':
    
    parsed = parseConvention(item.text)
    // { system: 'classroom'|'deca', course, quarter, level, type, label }
    
    if parsed.system === 'classroom':
      
      lesson = LESSON_PLANS.find(lp =>
        lp.course === parsed.course &&
        normalize(lp.title) === normalize(parsed.label)
      )
      
      if lesson && parsed.type === 'TEACH':
        write pacing calendar entry for lesson on item.deadline_date
        mark lesson as "scheduled"
      
      if parsed.type in ['DUE', 'ASSESS', 'PRESENT', 'REVIEW', 'INTRO']:
        write to DEADLINES[] with role='teach'
        show in horizon tracker
    
    if parsed.system === 'deca':
      
      if parsed.type === 'CONF':
        trip = trips.find by LEVEL keyword (B-first)
        if trip:
          update trip.date, trip.status
        else:
          create new trip record (A-fallback)
          preloadSlipRoster(newTrip.id, parsed.level)
          // seeds from students filtered by memberStatus
      
      if parsed.type in ['REG', 'PAYMENT']:
        write to DEADLINES[] with role='deca', urgency='high'
      
      if parsed.type === 'TEST':
        write multi-day marker to otherEvents[]
      
      if parsed.type === 'RESULTS':
        write pending horizon item
  
  if item.channel in ['email', 'lh-shortcut']:
    write to tasks[] or DEADLINES[] based on urgency and horizon
  
  POST consumed IDs back to Sheet Web App
```

---

## Urgency and Horizon Calculation

Scripts must compute these values consistently with LeaderHub's internal logic:

```javascript
function calcUrgencyHorizon(eventDate) {
  const daysUntil = Math.ceil((new Date(eventDate) - new Date()) / 86400000);
  const urgency = daysUntil <= 2 ? 'high' : daysUntil <= 7 ? 'medium' : 'low';
  const horizon  = daysUntil <= 7 ? 'short' : daysUntil <= 30 ? 'mid' : 'long';
  return { urgency, horizon };
}
```

---

## Role Inference — Keyword Matching

When a script must assign a `role` without an explicit naming-convention parse:

```javascript
function inferRole(text) {
  const t = text.toLowerCase();
  if (/deca|competition|slc|icdc|chapter|officer/.test(t))   return 'deca';
  if (/field trip|triptracker|excursion|bus|chaperone|permission slip|blackout/.test(t)) return 'trips';
  if (/store|inventory|purchase order|procurement|reorder|wbl|sbe/.test(t)) return 'store';
  if (/esports|smash|mario kart|gaming|match|tournament/.test(t)) return 'esports';
  if (/lesson|competency|scr|curriculum|pacing|grade|gradebook|synergy|sub plan|observation|dsp/.test(t)) return 'teach';
  return 'general';
}
```

---

## Title Normalization — Fuzzy Matching

Used when comparing Calendar event labels to `LESSON_PLANS[].title`:

```javascript
function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[""'']/g, '"')     // smart quotes → straight
    .replace(/[^a-z0-9 &]/g, '') // strip punctuation except & 
    .replace(/\s+/g, ' ')
    .trim();
}

function findLesson(course, label) {
  const norm = normalize(label);
  return LESSON_PLANS.find(lp =>
    lp.course === course && normalize(lp.title) === norm
  ) || null;
}
```

---

## Apps Script Web App Endpoints

**URL stored in:** nowhere in LeaderHub any more. This section describes
the v2 relay design; the `EmailBridge.gs` in this repo has no `SHEET_URL`
property. In this repo the page reaches the server through
`google.script.run` (`lhGetHorizonItems()`, and `lhApiCall('markConsumed',
{ids})` for the POST below); `doGet()`'s `?api=horizon` GET remains for
external callers. The horizon scan itself currently returns an empty list
(`scanHorizonLabel_()`, no Gmail scope).
**Script Properties key (v2 design):** `SHEET_URL`

### GET / — Fetch unconsumed items
```json
{
  "ok": true,
  "items": [
    {
      "id": "cal_1abc23",
      "source": "My Calendar",
      "received_at": "2026-03-12T00:00:00.000Z",
      "urgency": "medium",
      "horizon": "mid",
      "text": "8177 | Q3 | DUE | Tournament Sponsorship Proposal",
      "deadline_date": "2026-03-20",
      "role": "teach",
      "channel": "calendar"
    }
  ]
}
```

### POST / — Mark items consumed
```json
// Request body:
{ "consumed": ["cal_1abc23", "cal_def456"] }

// Response:
{ "ok": true }
```

---

## Trigger Setup Reference

| Trigger | Function | Schedule |
|---------|----------|---------|
| Time-driven | `runAll()` | Every 10 minutes |
| Time-driven | `syncCalendar()` | Day timer, 11 PM–midnight |

Both triggers are created once in the Apps Script editor under **Triggers → Add Trigger**.

---

## Gmail Filter Setup

Create these one-time filters in Gmail to auto-label relevant emails with `LeaderHub`:

| From / Contains | Condition | Action |
|----------------|-----------|--------|
| Your supervisor's email address | any message | Apply label: LeaderHub |
| `@ccpsnet.net` (if not you) | subject/body contains: `deadline` OR `field trip` OR `please submit` OR `please sign` OR `action required` OR `DECA` OR `TripTracker` | Apply label: LeaderHub |
| Any sender | subject contains: `field trip` OR `TripTracker` OR `excursion` | Apply label: LeaderHub |
| Any sender | subject contains: `DocuSign` OR `please sign` | Apply label: LeaderHub |

---

## `lh_*` Keys — Reference (where each one lives now)

These were `localStorage` keys in v2.0. Since 2026-10-22 none is kept in
the browser: "data tab" is a tab in the "LeaderHub Data" spreadsheet
(`LH_SERVER_SYNCED_DATA_KEYS` in `src/05`, `LH_DATA_TABS` in `Data.gs`),
"config" is a Script Property (`LH_CONFIG_KEYS` in `Config.gs`), and "page
memory" is lost on reload (`LH_PAGE_MEMORY_KEYS` in `src/05`). This is a
selection; `tests/leaderhub/no-browser-storage.test.js` checks every key.

| Key | Type | Contents | Lives in |
|-----|------|----------|----------|
| `lh_trips` | array | Field trip records | data tab `trips` |
| `lh_events` | array | DECA/leadership/community events | data tab `events` |
| `lh_students` | array | DECA member roster | data tab `members` |
| `lh_slip_rosters` | object | `{tripId: slipEntry[]}` | config |
| `lh_next_slip_id` | int | Auto-increment ID for slip entries | config |
| `lh_next_id` | object | `{trip, ev, st, gl, tk}` — next IDs per type | config |
| `lh_deadlines` | array | Deadline items | data tab `deadlines` |
| `lh_horizon` | object | `{short:[], mid:[], long:[]}` | config |
| `lh_tasks` | array | Dashboard task checklist | data tab `tasks` |
| `lh_goals` | array | Goals tracker | data tab `goals` |
| `lh_lp_edits` | object | Teacher notes on lesson plans (keyed by docId) | config |
| `lh_unit_notes` | object | Notes on unit plans (keyed by unit id) | config |
| `lh_unit_expanded` | array | Which unit plan cards are expanded | page memory |
| `lh_journal_history` | array | Journal entries | data tab `journal_entries` |
| `lh_wbl_students` | array | WBL student records | data tab `wbl_roster` |
| `lh_inventory` | array | School store product catalog | data tab `store_inventory` |
| `lh_inventory_transactions` | array | School store transaction log | read in one place, never written |
| ~~`lh_api_key`~~ | — | **Dead key.** The app deletes any leftover copy from the browser at every load (`LH_RETIRED_SECRET_KEYS`, `src/05`). Do not reintroduce | — |
| ~~`lh_bridge_url`~~ / ~~`lh_email_bridge_url`~~ | — | **Removed 2026-10-22.** The web app calls its own server; only the retired-file page reads an old `lh_email_bridge_url` to offer an "Open the web app" link | — |
