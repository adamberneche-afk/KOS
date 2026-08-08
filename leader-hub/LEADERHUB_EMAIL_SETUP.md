# LeaderHub Email Bridge v2 — Setup Guide
### Three automatic intake channels. Zero API key required.

**Time required:** ~20 minutes, one time only.  
**What you'll need:** Your ccpsnet.net Google account and the `EmailBridge.gs` file.  
**No Gemini or Anthropic API key needed for any of this.**

---

## How It Works

```
CHANNEL 1 — CALENDAR SYNC (nightly, automatic)
  Your Google Calendar → Apps Script reads it every night at 11pm
    → Any event in the next 30 days → written to Sheet
      → LeaderHub picks it up on next load

CHANNEL 2 — EMAIL RULES (every 10 min, automatic after one-time filter setup)
  Email arrives → Gmail filter applies "LeaderHub" label
    → Apps Script scans for keywords (deadline, field trip, DECA, sign, submit…)
      → Matches extracted → written to Sheet
        → LeaderHub picks it up

CHANNEL 3 — LH: SHORTCUT (works from any device, any time)
  You email yourself: Subject "LH: call hotel re deposit"
    → Apps Script sees it within 10 minutes
      → Task appears on dashboard
```

Everything runs in Google's cloud. Nothing needs to be open on your school PC.

---

## Step 1 — Google Sheet ✅ Already Created

Your **LeaderHub Inbox** sheet is ready:

**URL:** https://docs.google.com/spreadsheets/d/1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0/edit  
**Sheet ID:** `1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0`

---

## Step 2 — Create the Apps Script (5 min)

1. Go to [script.google.com](https://script.google.com)
2. Click **New project** → Name it **LeaderHub Email Bridge**
3. Delete the default `function myFunction() {}` placeholder
4. Copy all contents of `EmailBridge.gs` and paste into the editor
5. Click **Save** (Ctrl+S)

---

## Step 3 — Add the Sheet URL (2 min)

1. Click the **⚙️ Project Settings** gear (left sidebar)
2. Scroll to **Script Properties** → **Add script property**
3. Add this one property:

| Property Name | Value |
|---------------|-------|
| `SHEET_URL` | `https://docs.google.com/spreadsheets/d/1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0/edit` |

4. Click **Save script properties**

> That's the only property needed. No API keys required.

---

## Step 4 — Run First-Time Setup (1 min)

1. Select `firstTimeSetup` from the function dropdown at the top
2. Click ▶ **Run**
3. Authorize when prompted → **Review permissions → Allow**
4. Check the **Execution log** — you should see:
   - ✅ SHEET_URL set
   - ✅ Sheet tabs ready
   - ✅ Self-email address confirmed
   - ✅ Gmail label "LeaderHub" created
   - ✅ Calendar access OK — X calendars listed

The log also prints the exact Gmail filters to create (copy them from there).

---

## Step 5 — Deploy as Web App (3 min)

1. Click **Deploy → New deployment**
2. Click ⚙️ gear → **Web app**
3. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy** → copy the Web App URL

> ⚠️ Keep this URL private — anyone with it can read your dashboard items.

---

## Step 6 — Create the Two Triggers (2 min)

1. Click **⏰ Triggers** (clock icon, left sidebar)
2. Click **+ Add Trigger** → create these two:

**Trigger 1 — Every 10 minutes (emails + LH: shortcuts)**
| Setting | Value |
|---------|-------|
| Function | `runAll` |
| Event source | Time-driven |
| Type | Minutes timer |
| Interval | Every 10 minutes |

**Trigger 2 — Nightly calendar sync**
| Setting | Value |
|---------|-------|
| Function | `syncCalendar` |
| Event source | Time-driven |
| Type | Day timer |
| Time | 11pm–midnight |

---

## Step 7 — Connect LeaderHub (1 min)

1. Open `student-leader-hub.html`
2. Click **📧 Email Bridge** in the sidebar
3. Paste the Web App URL from Step 5
4. Click **✅ Save & Connect**

The sidebar badge changes from ⚠️ Off to ✅ On.

---

## Step 8 — Set Up Gmail Filters (5 min, one-time)

This is what makes Channel 2 zero-effort. You create filters once and emails route themselves forever.

In Gmail: **⚙️ Settings → See all settings → Filters and Blocked Addresses → Create a new filter**

Create these filters (repeat for each):

| From / Subject contains | Action |
|------------------------|--------|
| From: `ms.green@ccpsnet.net` (or your supervisor's address) | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `deadline` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `field trip` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `DECA` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `please submit` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `please sign` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `action required` | Apply label: LeaderHub |
| From: `@ccpsnet.net` + Subject: `TripTracker` | Apply label: LeaderHub |

Check **Also apply filter to matching conversations** when creating each filter to catch existing emails.

---

## Using the LH: Shortcut (Channel 3)

From your phone, any device, or any browser — email yourself:

**To:** your-email@ccpsnet.net  
**Subject:** `LH: whatever you need to remember`

Examples:
- `LH: call Arlington hotel re deposit`
- `LH: deca submit updated roster by Friday`
- `LH: trips permission slips due March 20`
- `LH: store reorder poster board`
- `LH: ms green wants lesson plans by end of week`

The text after `LH:` becomes the task. If a date is mentioned, it becomes a deadline. The role (deca / trips / store / etc.) is inferred from keywords automatically.

**This is the fastest possible intake method.** On iPhone: tap Mail → Compose → type your address → subject `LH: ...` → send. 15 seconds.

---

## How Channel 1 (Calendar Sync) Works

The script reads **all Google Calendars you have access to** — including any CCPS school calendars you've subscribed to. Every event in the next 30 days is automatically written as a deadline item in LeaderHub by midnight.

This means:
- Anything you put on your Google Calendar appears in LeaderHub by morning
- CCPS calendar events (if you're subscribed) flow in automatically
- No manual entry for calendar-based deadlines

Birthday and holiday calendars are skipped automatically.

---

## How Channel 2 (Email Rules) Works

The script uses pattern matching — no AI. When an email with the LeaderHub label arrives, it checks for:

| Pattern | What it creates |
|---------|----------------|
| From Ms. Green | 👩‍💼 high-urgency task, always |
| From admin/principal | 🏫 admin task |
| Subject: field trip / blackout / TripTracker | 🚌 trips role |
| Subject: deadline / due by / action required | ⏰ with extracted date |
| Subject: DECA / competition / SLC | 🏆 deca role |
| Subject: form / please sign / DocuSign | 📋 high urgency |
| Subject: meeting / walkthrough / observation | 📅 teach role |
| Any @ccpsnet.net email (fallback) | 📌 general |

Dates are extracted automatically from the email body — "by Friday", "March 15", "3/20/26" all work.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Items not appearing | Click "Poll Now" in the Email Bridge modal |
| Calendar not syncing | Run `testRun()` manually in Apps Script and check Execution log |
| LH: emails not working | Make sure you're sending from and to the same address Apps Script detected |
| "HTTP 403" | Re-deploy with "Who has access: Anyone" |
| SHEET_URL error | Re-check Script Properties |
| Duplicate items | Already handled — deterministic IDs prevent re-adding the same item |

---

## Updating the Script

1. Paste updated `EmailBridge.gs` into the editor
2. **Deploy → Manage deployments → Edit → New version → Deploy**
3. URL stays the same — no changes in LeaderHub needed
