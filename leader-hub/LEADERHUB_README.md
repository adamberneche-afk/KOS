# LeaderHub — Student Leadership Command Center
### README & Project Reference

---

## What This Is

LeaderHub is a single standalone HTML file (`student-leader-hub.html`) built for a high school Business & Marketing teacher who also runs DECA, a school store, WBL, E-Sports, and field trips. It is a personal command center — not a web app, not a server, not a database. It runs by opening the file directly in a browser.

**File:** `student-leader-hub.html`
**Size:** 13,214 lines of HTML/CSS/JS in one file
**Storage:** All user data persists via `localStorage` (key prefix: `lh_`, 51 keys in use)
**AI:** Google Gemini API (`gemini-2.5-pro`) called directly from the browser

---

## How to Use

1. Open `student-leader-hub.html` in any modern browser (Chrome recommended)
2. On first use, click **🔑 Gemini API Key** in the sidebar (Dashboard section)
3. Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
4. Key is saved to localStorage — you only do this once per browser/machine
5. (Optional) Set up Email Bridge — see `LEADERHUB_EMAIL_SETUP.md`
6. All modules are accessible from the left sidebar accordion

---

## Architecture

### Layout
- **Sidebar** (220px): Accordion navigation organized by role — one section open at a time, all closed on startup
- **Main area**: Single-page view system — one `<div id="view-*">` visible at a time
- **Dashboard**: Special view — `height:100%; overflow:hidden` — strictly no scroll, all content fits viewport

### Dashboard Layout (4 rows, flex column)
```
ROW A │ Time clock · Date · Period badge · +Deadline · Cron badge
ROW B │ ⚡ Choose Your Next Move — 2 hero choice cards (HERO)
ROW C │ Pulse row — 5 role status cards (Teaching/Store/DECA/E-Sports/Trips)
ROW D │ 4-col grid:
       │  [Deadlines] [Brain Dump] [Horizon lists (3 stacked)] [Quick Log + Journal CTA]
```

### Sidebar Accordion (7 sections, exclusive open)
| Section | Items | Notes |
|---------|-------|-------|
| 🏠 Dashboard | Command Center, Observations, Journal, API Key | |
| 📐 Classroom | SCR Current Class, Lesson Plans, Pacing Calendar | Smart: auto-detects current course from odd/even + block time |
| 🚌 Field Trips | All Trips, Permission Slips, Form Center, Archive | 4 items |
| 🏆 DECA | DECA Hub, Events, Members, Goals | 4 items |
| 🏪 WBL / Store | Overview, Student Tracker, SBE Checklist, Procurement, Financials | |
| 🎮 E-Sports | Hub, Roster, Smash Bros, Mario Kart 8, Match Log | |
| 🔧 Tools | Trip Process Map, FT Permission Form, Leave Request, Email Composer, Print | |

---

## AI Engine

| Field | Value |
|-------|-------|
| Provider | Google Gemini |
| Model | `gemini-2.5-pro` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| Key source | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| Key storage | `lh_api_key` in localStorage |

All AI features route through a single `callAI(payload)` helper. The helper accepts Anthropic-style payloads (including `system:` prompts) and translates them to Gemini format internally — individual call sites don't need to know which provider is in use. Responses are normalized back to `{ content: [{ type:'text', text:... }] }`.

### AI Features

| Feature | Function | Trigger |
|---------|----------|---------|
| Email Composer | `aiComposeEmail()` | Compose button in email modal |
| Trip Archive — Glows & Grow | `archiveWithAI()` | Archive button on trip |
| Trip Archive — AI Insights | `generateAIInsights()` | Insights button |
| WBL AI Insights | `wblAIInsights()` | WBL module button |
| Lesson Plan Doc Fetch | `lpFetchDoc()` | Lesson plan link — shows Drive link + lesson details (Drive auth required for full content) |
| Lesson Plan AI Assist | `lpRunAI()` | AI assist button in lesson plans |
| SCR Competency Insights | `openAISCRInsights()` | SCR module AI button |
| Store Financial Analysis | `finAnalysis()` | Finance tab in WBL |
| E-Sports Scout Report | `esAIScout()` | Scout button in E-Sports |
| Brain Dump Auto-Sort | `organizeThought()` | ✨ Sort It button on dashboard |
| Journal Cron Adjustment | `runCronAdjustment()` | Automatic at 2am after journal |

---

## Email Bridge

The Email Bridge connects Gmail → Google Apps Script → Google Sheet → LeaderHub. It runs automatically in the background and surfaces actionable emails as items in your HORIZON lists and DEADLINES.

| Field | Value |
|-------|-------|
| Web App URL | `https://script.google.com/a/macros/ccpsnet.net/s/AKfycbz6Hx2vJbZJXv82WrvvXUBu-oXhGifcboQi_Il3jfu3HHov4WA5j6MJ8IZvZkb8dGyG/exec` |
| Apps Script | `EmailBridge.gs` |
| Sheet | `https://docs.google.com/spreadsheets/d/1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0/edit` |
| Trigger | `runAll` every 10 minutes |
| LeaderHub key | `lh_email_bridge_url` in localStorage |
| Setup guide | `LEADERHUB_EMAIL_SETUP.md` |
| Audit doc | `LH_04_EMAIL_AUDIT.md` |

### How it works
1. Apps Script runs `runAll()` every 10 minutes
2. `processInbox()` searches Gmail directly using `WATCHED_SENDERS` + `WATCHED_SUBJECTS` arrays (no Gmail filters or labels required)
3. Matching emails run through `extractFromEmail_()` — a 5-tier rule engine (named senders → suppressions → subject patterns → subject suppressions → catch-all)
4. Matched items are written to the **Inbox tab** of the Google Sheet
5. LeaderHub polls the web app endpoint on boot + every 10 minutes, pulls unconsumed items, writes to HORIZON + DEADLINES, and POSTs consumed IDs back to mark them done

### LH: Self-Email Shortcut
From any device, email yourself with subject `LH: [task text]`. Examples:
```
LH: call Arlington hotel re deposit
LH: deca send SLC roster by Friday
LH: canvas msg Aydin Main re missing assignment
LH: esports match Midlothian Feb 14
```
Role is inferred from keywords. Date is extracted if present.

---

## Data Storage (localStorage — 51 keys, all prefixed `lh_`)

**Core / AI**
| Key | Contents |
|-----|----------|
| `lh_api_key` | Gemini API key |
| `lh_email_bridge_url` | EmailBridge web app URL |
| `lh_cron_pending` / `lh_cron_result` | Journal cron state |
| `lh_journal_last` / `lh_journal_history` / `lh_journal_autoprompt_date` / `lh_journal_avoided` | Journal entries and scheduling |
| `lh_obs_history` / `lh_obs_prep` | Observation log |

**Trips**
| Key | Contents |
|-----|----------|
| `lh_trips` | Array of active trip objects |
| `lh_trip_archive` | Archived trips |
| `lh_trip_draft` | In-progress wizard draft |
| `lh_slip_rosters` / `lh_next_slip_id` | Permission slip tracking |
| `lh_conf_leave` | Conference leave form data |

**Dashboard / Planning**
| Key | Contents |
|-----|----------|
| `lh_deadlines` | `{id, title, date, role}` array |
| `lh_horizon` | `{short:[], mid:[], long[]}` — This Week / Month / Semester |
| `lh_snoozed` | Snoozed choice card items with expiry timestamps |
| `lh_tasks` | Dashboard checklist — `{id, text, done, status, resolvedAt}` |
| `lh_daily_log` | Quick log entries |
| `lh_acc_open` | Sidebar accordion open state (cleared to `null` on every boot) |

**Students / WBL**
| Key | Contents |
|-----|----------|
| `lh_students` | Student roster |
| `lh_wbl_students` | WBL student hours and status |
| `lh_purchase_orders` | Purchase orders |
| `lh_inventory` | School store inventory |
| `lh_inventory_transactions` | Inventory transaction log *(read only — write not yet implemented)* |
| `lh_sales_log` | Store sales log |
| `lh_sbe_status` | SBE checklist completion |

**DECA / E-Sports**
| Key | Contents |
|-----|----------|
| `lh_deca_approvals` / `lh_deca_results` | DECA event tracking |
| `lh_es_players` / `lh_es_matches` | E-Sports roster and match log |
| `lh_mk8_check` / `lh_ssbu_check` | Game-specific check states |

**SCR / Lessons**
| Key | Contents |
|-----|----------|
| `lh_scr_scores` / `lh_scr_active_course` / `lh_scr_active_period` | Competency tracker |
| `lh_lp_edits` / `lh_lp_filter` | Lesson plan notes and filter state |
| `lh_unit_expanded` / `lh_unit_notes` | Unit accordion state |

---

## Modules

| Module | View ID | Description |
|--------|---------|-------------|
| Dashboard | `view-dashboard` | Command center — no scroll, all info at a glance |
| Field Trip Process Map | `view-tripflow` | Phase timeline for running a field trip |
| DECA Hub | `view-deca` | Events, deadlines, chapter management |
| Email Composer | Modal | AI-powered email templates (24 templates) |
| Trip Archive | `view-archive` | Completed trips with Glows & Grow AI review |
| Member Management | `view-students` | Student roster view |
| Permission Slip Tracker | `view-slips` | Track permission slip status per trip |
| Forms Center | `view-forms` | FT permission form, leave requests |
| SCR Competency Tracking | `view-competency` | Score entry for courses 6115/8175/8177 |
| Lesson Plans Hub | `view-lessons` | 120 plans, Google Doc link + AI assist + Pacing Calendar |
| WBL & School Store | `view-wbl` | Hours tracking, SBE checklist, inventory, financials |
| E-Sports Hub | `view-esports` | Match log, roster, AI scout reports |
| Reflective Journal | Modal | End-of-day reflection, cron-based priority adjustment |
| Brain Dump | Dashboard widget | AI sorts freeform text → auto-distributes tasks to horizon lists |
| Priority Action Engine | Background | `buildActionQueue()` scores and ranks tasks across all roles |

---

## Key Design Decisions

- **No server, no backend** — intentional. File must be portable, openable on any machine without setup.
- **No scrolling on dashboard** — fixed-height viewport view. Every widget uses `overflow:hidden` or internal scroll. The outer dashboard never scrolls.
- **Accordion: one open at a time, all closed on boot** — `window._appBooting` flag prevents `showView()` from opening the accordion during initial render.
- **`callAI()` is provider-agnostic** — internal payload translation means swapping AI providers only requires changing `callAI()`, not any of the 11 call sites.
- **Brain Dump auto-distributes** — AI sorts tasks and pushes directly into horizon lists. `now`/`today` → This Week, `this week` → Month, `delegate` → Semester.
- **EmailBridge uses direct Gmail search** — no Gmail filters or labels required. `processInbox()` builds a query from `WATCHED_SENDERS` + `WATCHED_SUBJECTS` arrays and searches directly.
- **FERPA** — Student names are tokenized before any AI call. CSP meta tag enforces this at the browser level.
- **`dlNav()` for deadline nav** — maps role strings (`teach`, `meeting`) to valid view IDs since those roles have no direct DOM views.
- **`lpFetchDoc()` opens Drive** — Google Drive requires authentication; Gemini cannot fetch private Docs. The function shows a direct Drive link + lesson details panel. Paste content into the ✏️ Edit tab to cache locally.

---

## FERPA / Privacy

All AI calls that involve student data must anonymize before sending:
- Student names → `Student_01`, `Student_02`, etc.
- Player names → `Player_01`, `Player_02`, etc.
- Tokens translated back to real names locally after API response

The CSP meta tag restricts `connect-src` to `'self'`, `https://generativelanguage.googleapis.com`, `https://script.google.com`, and `https://script.googleusercontent.com` only — enforced by the browser, not bypassable by JS code in the page.

---

## Project Files

| File | Purpose |
|------|---------|
| `student-leader-hub.html` | The entire application — open this in a browser |
| `EmailBridge.gs` | Google Apps Script — Gmail → Sheet → LeaderHub pipeline (750 lines) |
| `LEADERHUB_README.md` | This file — project reference |
| `LEADERHUB_WIP.md` | Work-in-progress tracker — active bugs, backlog, session log |
| `LEADERHUB_EMAIL_SETUP.md` | Step-by-step guide for setting up the Email Bridge |
| `LEADERHUB_GEM_PROMPT.md` | Gemini Gem system prompt (Sheet ID pre-filled, ready to paste) |
| `LH_01_NAMING_CONVENTIONS.md` | Canonical naming reference — Canvas/DECA/LeaderHub conventions, CCPS calendar, lesson plan titles |
| `LH_02_INTEGRATION_GUIDE.md` | Technical integration guide — data schemas, endpoint contracts, localStorage keys |
| `LH_03_CANVAS_INTEGRATION_IDEAS.md` | 13 Canvas integration ideas across 3 tiers, priority matrix |
| `LH_04_EMAIL_AUDIT.md` | Gmail inbox audit — methodology, sender classifications, filter spec, annual re-audit checklist |
