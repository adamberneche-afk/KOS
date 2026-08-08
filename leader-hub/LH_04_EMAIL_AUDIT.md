# LeaderHub Email Audit
## Inbox Scrape Methodology, Filter Spec & Rule Registry

**Audited:** March 2026 · 180-day lookback · ~500 threads  
**Account:** adam_berneche@ccpsnet.net  
**Companion docs:** `LH_02_INTEGRATION_GUIDE.md` · `EmailBridge.gs`

> **Re-run this audit annually** — ideally in August before the school year starts, and again in January after DECA season picks up. Run `auditInbox()` in Apps Script, paste `Audit_Senders` here, and update the three sections below.

---

## How to Run the Audit

```javascript
// Paste into EmailBridge Apps Script project and run once.
// Outputs two tabs to your LeaderHub Sheet: Audit_Senders and Audit_Subjects.

function auditInbox() {
  const LOOKBACK_DAYS = 180; // change to 365 for full year
  const after = new Date();
  after.setDate(after.getDate() - LOOKBACK_DAYS);
  const query = 'after:' + Utilities.formatDate(after, 'UTC', 'yyyy/MM/dd');
  const threads = GmailApp.search(query, 0, 500);

  const senderMap = {}, subjectMap = {};

  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const from    = msg.getFrom().replace(/<.*>/, '').trim();
      const email   = (msg.getFrom().match(/<(.+)>/) || [,''])[1].toLowerCase();
      const subject = msg.getSubject().replace(/^(re|fwd?):\s*/i, '').trim();
      const domain  = email.split('@')[1] || 'unknown';

      const skey = email || from;
      if (!senderMap[skey]) senderMap[skey] = { name: from, email, domain, count: 0, subjects: [] };
      senderMap[skey].count++;
      if (!senderMap[skey].subjects.includes(subject)) senderMap[skey].subjects.push(subject);

      const norm = subject.toLowerCase()
        .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '[DATE]')
        .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d+/gi, '[DATE]')
        .replace(/20\d\d/g, '[YEAR]')
        .replace(/q[1-4]/gi, '[QTR]')
        .replace(/(monday|tuesday|wednesday|thursday|friday)/gi, '[DAY]')
        .trim();
      if (!subjectMap[norm]) subjectMap[norm] = { count: 0, froms: [], raw: subject };
      subjectMap[norm].count++;
      if (!subjectMap[norm].froms.includes(domain)) subjectMap[norm].froms.push(domain);
    });
  });

  const ss = SpreadsheetApp.openById('1iTit6ygtvyl9mAVYE5ZhpdM4CRNoJq-paEIiM3vKwc0');

  let sheet = ss.getSheetByName('Audit_Senders') || ss.insertSheet('Audit_Senders');
  sheet.clearContents();
  sheet.appendRow(['Email', 'Name', 'Domain', 'Count', 'Sample Subjects (first 3)']);
  Object.values(senderMap).sort((a,b) => b.count - a.count).slice(0,150)
    .forEach(s => sheet.appendRow([s.email, s.name, s.domain, s.count, s.subjects.slice(0,3).join(' | ')]));

  sheet = ss.getSheetByName('Audit_Subjects') || ss.insertSheet('Audit_Subjects');
  sheet.clearContents();
  sheet.appendRow(['Normalized Pattern', 'Count', 'Domains', 'Sample Raw Subject']);
  Object.entries(subjectMap).sort((a,b) => b[1].count - a[1].count).slice(0,200)
    .forEach(([pat, v]) => sheet.appendRow([pat, v.count, v.froms.join(', '), v.raw]));

  Logger.log('Audit complete: ' + Object.keys(senderMap).length + ' senders, ' + Object.keys(subjectMap).length + ' patterns.');
}
```

---

## Sender Classification Table — March 2026

Every sender with 3+ emails in the 180-day window. Updated from live audit data.

### 🟢 CAPTURE — Active rules in EmailBridge.gs

| Sender | Email | Vol | Rule | Role | Urgency |
|--------|-------|-----|------|------|---------|
| Ms. Green (supervisor) | renee_green@ccpsnet.net | 8 | `green` — always capture | inferred | high (always) |
| David Altizer (AP) | david_altizer@ccpsnet.net | 35 | `admin` — always capture | inferred | high |
| Katherine White (principal) | katherine_swhite@ccpsnet.net | 12 | `admin` — always capture *(fixed: was `cwhite`, now `k_swhite`)* | inferred | high |
| Canvas student messages | notifications@instructure.com | 70 | `canvas-msg` — "just sent you a message" only | teach | medium |
| Shannon Tual / DECA VA | stateadvisor@vadeca.org | 7 | `vadeca` — always capture | deca | high |
| DECA judge coordinator | judge@vadeca.org | 3 | `vadeca` — always capture | deca | high |
| PlayVS (esports) | hello@playvs.com + hello@email.playvs.com | 10 | `playvs` — match/settled/upcoming only | esports | medium |
| WBL coordinator | tisa_fagan@ccpsnet.net | 9 | `wbl` — always capture | store | medium |
| Finance / bookkeeper | teri_evans@ccpsnet.net | 3 | `finance` — always capture | deca | medium |
| CTE / PLC coordinator | anne_moore@ccpsnet.net | 3 | `plc` — always capture | teach | medium |
| SOL test coordinator | marquita_winiecki@ccpsnet.net | 17 | `sol` — **date-bearing emails only** | teach | medium |
| DECA Inc. / membership | communications@deca.org + registermychapter.com | 10 | `deca-nat` — action/payment keywords only | deca | medium |

### 🔴 SUPPRESS — Explicitly blocked in EmailBridge.gs

| Sender | Email | Vol | Reason |
|--------|-------|-----|--------|
| SmartFind Express (sub system) | noreply_chesterfield@sfesubsystem.com | 8 | You check sub system directly; auto-notices are noise |
| Workday / payroll | chesterfield@myworkday.com | 12 | No actionable date; you get a separate reminder from Jayla Ford |
| IT helpdesk | tickets@ccps.incidentiq.com | 10 | Tickets are self-service; not LeaderHub relevant |
| Amanda Berneche (wife/colleague) | amanda_berneche@ccpsnet.net | 5 | Personal/family — should not mix with work tracking |
| Lillymay's teacher | kara_gallagher@ccpsnet.net | 5 | Personal/family |
| Calder's teacher | anthony_taylor@ccpsnet.net | 3 | Personal/family |
| OrthoVirginia MyChart | mychartnotify.orthovirginia.com | 6 | Personal medical |
| Anthem insurance | email.anthem.com | 6 | Personal insurance |
| Claude onboarding | email.claude.com | 5 | Noise |

### ⚪ FALLBACK — Caught by @ccpsnet.net catch-all if no rule matches

These hit the generic `📌` rule. Volume is low enough that false positives are acceptable. Review periodically and promote to named rules if they become frequent or consistently actionable.

| Sender | Email | Vol | Notes |
|--------|-------|-----|-------|
| Nykia Ward (secretary) | nykia_ward@ccpsnet.net | 21 | Late buses / reminders. Actionable but inconsistent — stays in fallback for now |
| Jayla Ford (payroll) | jayla_ford@ccpsnet.net | 17 | "Submit Workday" reminders — redundant with Workday suppress; let fallback catch if needed |
| Kimberly Sylvester (attendance) | kimberly_sylvester@ccpsnet.net | 17 | Attendance reports — informational, not action items |
| Eric Garcia (security) | eric_garcia@ccpsnet.net | 7 | Tornado drill, lockdown — safety info, not pacing-relevant |
| School-wide blasts | arthur_thompson@, victoria_kirtley@, etc. | 3–10 | General school news — caught by fallback, low noise |

### 🚫 IGNORE — No rule needed (not @ccpsnet.net, not actionable)

| Sender | Email | Vol | Notes |
|--------|-------|-----|-------|
| Sports Career Consulting | chris@sportscareerconsulting.com | 15 | Curriculum newsletter — useful content, but you read it in Gmail, not LeaderHub |
| Everfi K-12 | k12team@everfi.com | 6 | Ed-tech marketing — ignore |
| AI/training vendors | vsandadi@inspiritai-hs.org, etc. | 4 | Ignore |
| CCPS family newsletter | ccpsinfo@ccpsnet.net | 7 | District PR blast — ignore |
| College Board | myaccount.collegeboard.org | 4 | Not course-relevant — ignore |
| The Marketing Teacher | reachme@themarketingteacher.com | 4 | Sales email — ignore |

---

## Gmail Filter Spec

Create these filters in **Gmail Settings → Filters and Blocked Addresses → Create new filter**. These are one-time setup — they apply the `LeaderHub` label so EmailBridge picks up the emails automatically.

**Filter 9 — Synergy missing attendance alert**
```
From: noreply@ccpsnet.net
Subject: Missing Attendance
Action: Apply label "LeaderHub"
```
*This is the only noreply@ccpsnet.net email worth capturing. Dismissal notices and other system emails from the same address are noise — the subject filter keeps them out.*

### Priority Filters (create these first)

**Filter 1 — DECA Virginia state advisor**
```
From: stateadvisor@vadeca.org OR judge@vadeca.org
Action: Apply label "LeaderHub", Never send to Spam
```

**Filter 2 — Canvas student messages only**
```
From: notifications@instructure.com
Subject: just sent you a message
Action: Apply label "LeaderHub"
```
*Note: Do NOT label all Canvas notifications — only those with this subject pattern.*

**Filter 3 — PlayVS esports**
```
From: playvs.com
Action: Apply label "LeaderHub"
```
*(Gmail filter matches any @playvs.com address, covering both hello@ and email.playvs.com)*

**Filter 4 — WBL coordinator**
```
From: tisa_fagan@ccpsnet.net
Action: Apply label "LeaderHub"
```

**Filter 5 — Finance / bookkeeper**
```
From: teri_evans@ccpsnet.net
Action: Apply label "LeaderHub"
```

**Filter 6 — CTE / PLC coordinator**
```
From: anne_moore@ccpsnet.net
Action: Apply label "LeaderHub"
```

**Filter 7 — SOL testing coordinator (date-bearing only)**
```
From: marquita_winiecki@ccpsnet.net
Has the words: today OR tomorrow OR Monday OR Tuesday OR Wednesday OR Thursday OR Friday OR this week OR [date pattern]
Action: Apply label "LeaderHub"
```
*This is the only filter where we pre-filter by content rather than labeling everything. Bathroom duty and generic reminders don't get labeled.*

**Filter 8 — DECA national / membership portal**
```
From: communications@deca.org OR registermychapter.com
Has the words: payment OR deadline OR action required OR registration
Action: Apply label "LeaderHub"
```

### Existing Filters (verify these are already in place)

```
From: renee_green@ccpsnet.net            → Label: LeaderHub  ✓
From: david_altizer@ccpsnet.net          → Label: LeaderHub  ✓
From: katherine_swhite@ccpsnet.net       → Label: LeaderHub  ✓ (confirm email is k_swhite, not cwhite)
*@ccpsnet.net + "deadline"               → Label: LeaderHub  ✓
*@ccpsnet.net + "field trip"             → Label: LeaderHub  ✓
*@ccpsnet.net + "DECA"                   → Label: LeaderHub  ✓
*@ccpsnet.net + "please submit"          → Label: LeaderHub  ✓
*@ccpsnet.net + "action required"        → Label: LeaderHub  ✓
```

**⚠ Fix required:** If you have a filter for `cwhite@ccpsnet.net`, delete it — her real address is `katherine_swhite@ccpsnet.net`. The EmailBridge rule has been patched but the Gmail filter may still be wrong.

---

## New LH: Shortcut Conventions

These are patterns that appeared in the audit that don't flow automatically but you likely type/reference frequently. Standardizing them makes EmailBridge smarter over time.

### Current shortcuts (already working)
```
LH: [any task text]              → general task, role inferred from keywords
LH: deca [task]                  → role:deca
LH: trips [task]                 → role:trips
```

### Proposed new conventions (send these to yourself from any device)

**Canvas student message follow-up**
```
LH: canvas msg [student name] re [topic]
Example: LH: canvas msg Aydin Main re missing assignment
```
→ Creates a `role:teach` task so you don't lose the thread after marking Canvas read.

**PlayVS match setup**
```
LH: esports match [opponent] [date]
Example: LH: esports match Midlothian Feb 14
```
→ Role `esports`, date extracted automatically.

**DECA payment / finance**
```
LH: deca payment [what] [amount] by [date]
Example: LH: deca payment ICDC installment 2 $350 by April 1
```
→ Role `deca`, high urgency, amount in text for reference.

**WBL student issue**
```
LH: wbl [student name] [issue]
Example: LH: wbl Delvin Walker hours not logged
```
→ Role `store`, creates follow-up task.

**Workday time submission reminder**
```
LH: workday due [date]
Example: LH: workday due Friday
```
→ Role `general`, short-horizon deadline so it appears on dashboard.

**PLC / professional development**
```
LH: plc [what] by [date]
Example: LH: plc submit summer PD registration by Feb 21
```
→ Role `teach`, captures the deadline from Anne Moore emails you'd otherwise miss.

---

## Subject Pattern Findings — March 2026

Key patterns extracted from `Audit_Subjects` (180-day lookback, top patterns by count).

### Patterns that generated new rules

| Pattern | Count | Source | Action taken |
|---------|-------|--------|-------------|
| `missing attendance on [DATE]` | 18 | noreply@ccpsnet.net | New `attend` rule — **high urgency**, role:teach, `🔴` flag. Must act same period. |
| `student health update-concussion` | 3 | School nurse (ccpsnet) | New `health` rule — role:teach, concussion protocol requires teacher acknowledgment |
| `[sport/activity] excusal` | 3+ | Various @ccpsnet | New `excusal` subject keyword — any excusal notice captured as role:teach |

### Patterns confirmed as noise — suppressed via BLAST_SENDERS list

| Pattern | Count | Sender | Disposition |
|---------|-------|--------|-------------|
| `congratulations` | 8 | arthur_thompson, others | School blast — suppressed |
| `your february teacher of the month!` | 7 | Multiple | School blast — suppressed |
| `black history presentations / door contest` | 9 | cherel_white, denise_flanagan | School blast — suppressed |
| `green & gold - our new lit mag` | 4 | Multiple | School blast — suppressed |
| `recycling today` | 3 | cynthia_gay | Operational blast — suppressed |
| `vhsl / state championship results` | 6 | kwame_mcfadden, victoria_kirtley | Athletics news — not your dept, suppressed |
| `show choir competition` | 3 | nicole_whitby | Performing arts blast — suppressed |
| `math/sci opportunities night` | 3 | nathanial_henry | School event blast — suppressed |

### Patterns already handled correctly

| Pattern | Count | Verdict |
|---------|-------|---------|
| `recent canvas notifications` | 28 | ✅ Suppressed by Canvas rule (not "just sent you a message") |
| `attendance reports` | 16 | ✅ Informational — hits @ccpsnet fallback at most |
| `assignment notice / absence creation \| smartfind express` | 8 | ✅ Suppressed by sfesubsystem.com rule |
| `enter time / request time off - successfully completed` | 8 | ✅ Suppressed by myworkday.com rule |
| `ticket #169854 has been updated` | 4 | ✅ Suppressed by incidentiq.com rule |
| `deca direct weekly` | 4 | ✅ Keyword-gated by DECA national rule |
| `[student name] just sent you a message in canvas` | 10+ | ✅ Captured by Canvas student message rule |
| `wbl student mentor` | 10 | ✅ Captured by tisa_fagan rule; sara_anderson (gmail) hits meeting rule |
| `fundraiser account` | 3 | ✅ Captured by teri_evans finance rule |

### Notable one-off patterns (watch list for next audit)

| Pattern | Count | Notes |
|---------|-------|-------|
| `duty swap?` | 12 | Peer coverage request — hits @ccpsnet fallback as `general`. Frequent enough to consider a named rule next year. |
| `sick leave` / `if you have to be out` | 6 | Sub coverage protocol from Brian DeLeon — currently fallback. If volume grows, add rule. |
| `please reach out to ms. bell` | 3 | Guidance counselor referral about a specific student — ad hoc, no rule needed |
| `jalen` / `t. richards` | 3 | One-word student name subjects from colleagues — peer flags, ad hoc |
| `esports/playvs` | 6 | Anne Judy (esports coordinator) asking about matches — currently fallback; could add anne_judy@ rule if esports expands |
| `deca?` | 3 | Marcia Edmundson asking informal DECA questions — hits fallback as general, fine |

---

## EmailBridge Rule Changelog

| Date | Change | Source | Reason |
|------|--------|--------|--------|
| Mar 2026 | Fixed C. White rule: `cwhite` → `katherine_swhite` | Sender audit | Her actual email is k_swhite@ — old rule never fired |
| Mar 2026 | Added `stateadvisor@vadeca.org` + `judge@vadeca.org` rules | Sender audit | Shannon Tual / DECA VA — 7 high-value emails uncaptured |
| Mar 2026 | Added Canvas student message rule (subject: "just sent you a message") | Sender audit | 70 Canvas emails; only student messages are actionable |
| Mar 2026 | Added PlayVS rules (both playvs.com domains) | Sender audit | 10 esports emails uncaptured; match alerts are time-sensitive |
| Mar 2026 | Added tisa_fagan@ WBL rule | Sender audit | WBL coordinator — student mentors and meetings need tracking |
| Mar 2026 | Added teri_evans@ finance rule | Sender audit | Deposits and fundraiser account — role:deca |
| Mar 2026 | Added anne_moore@ CTE/PLC rule | Sender audit | PLC meetings and VDOE deadlines — role:teach |
| Mar 2026 | Added marquita_winiecki@ SOL rule (date-bearing only) | Sender audit | Bathroom duty = noise; testing schedule dates = actionable |
| Mar 2026 | Added DECA Inc. / registermychapter.com rule (keyword-gated) | Sender audit | Payment confirmations are actionable; newsletters are not |
| Mar 2026 | Added explicit suppression: sfesubsystem, myworkday, incidentiq | Sender audit | Prevented ~30 noisy emails/month hitting @ccpsnet fallback |
| Mar 2026 | Added family/personal suppressions | Sender audit | Kept personal life out of work task tracker |
| Mar 2026 | Added `missing attendance` rule — HIGH urgency 🔴 | Subject audit | 18 occurrences; must act same period or mark absent in Synergy |
| Mar 2026 | Added `student health update / concussion` rule | Subject audit | 3 occurrences; CCPS concussion protocol requires teacher ack |
| Mar 2026 | Added `excusal` subject keyword rule | Subject audit | Captures all department excusal notices (athletics, arts, etc.) |
| Mar 2026 | Added BLAST_SENDERS suppression list (17 senders) | Subject audit | School-wide blast senders polluting @ccpsnet fallback |
| Mar 2026 | Expanded inferRole_: added `attendance`, `excusal`, `health update`, `concussion`, `vadeca`, `registermychapter`, `playvs`, `mentor`, `deposit`, `fundraiser`, `sol`, `testing`, `plc` | Both audits | Better role tagging across all new rules |

---

## Annual Re-Audit Checklist

Run every August (before school) and January (DECA season ramp-up).

- [ ] Run `auditInbox()` with `LOOKBACK_DAYS = 365`
- [ ] Sort `Audit_Senders` by Count descending
- [ ] For every sender with Count > 5: is it captured, suppressed, or falling through?
- [ ] Check for new DECA contacts (new state advisor, new national staff)
- [ ] Check PlayVS domains — they occasionally change sending addresses
- [ ] Verify Katherine White / principal email hasn't changed (new AP, new principal)
- [ ] Check `Audit_Subjects` for recurring patterns with Count > 8 that have no matching rule
- [ ] Update this document's changelog with any new rules added
- [ ] Re-verify Gmail filters match current EmailBridge rules (they can drift)

---

## Signal Quality by Channel

After this audit, the expected capture rates are:

| Channel | Before audit | After audit | Notes |
|---------|-------------|-------------|-------|
| Ms. Green emails | 100% | 100% | Was working |
| D. Altizer / K. White emails | 100% / 0% | 100% / 100% | White rule was broken — now fixed |
| DECA Virginia (Shannon Tual) | 0% | 100% | New rule |
| PlayVS match alerts | 0% | ~90% | Subject-keyword gated |
| Canvas student messages | 0% | ~100% | Subject-exact match |
| WBL coordinator | 0% | 100% | New rule |
| SOL schedule emails | 0% | ~60% | Date-bearing only by design |
| Noisy system emails hitting fallback | ~25/month | ~0/month | Explicit suppressions |
| Personal/family emails hitting fallback | ~19/month | ~0/month | Explicit suppressions |
| Synergy attendance alerts | 0% | ~100% | Subject pattern: "missing attendance" → urgency HIGH, date = today |
| Student health / concussion notices | 0% | ~100% | Subject pattern: "student health update / concussion" |
| Duty swaps (non-Green senders) | 0% | ~100% | Subject pattern: "duty swap" catches any sender |
| Athletic excusals | 0% | ~90% | Excusal keyword added to field trip rule |
| School-wide blast noise hitting fallback | ~30/month | ~0/month | BLAST_SENDERS array + subject suppressions |

---

## Subject Pattern Rules — March 2026

From `Audit_Subjects` tab. Patterns with Count ≥ 3 evaluated for rule creation.

| Pattern | Count | Decision | Rule added |
|---------|-------|----------|-----------|
| recent canvas notifications | 28 | Suppress | Canvas sender rule returns immediately for non-message emails |
| missing attendance on [DATE] | 18 | **CAPTURE HIGH** | Synergy alert rule — urgency forced high, date = today |
| attendance reports | 16 | Ignore | Informational only — Kimberly Sylvester, stays in fallback |
| duty swap? | 12 | **CAPTURE** | Subject pattern rule — any sender |
| wbl student mentor | 10 | Capture (Tisa only) | tisa_fagan sender rule; Sara Anderson gmail excluded |
| enter/request time workday | 8 | Suppress | myworkday.com domain suppression |
| assignment notice \| smartfind | 4 | Suppress | sfesubsystem.com domain suppression |
| absence creation \| smartfind | 4 | Suppress | sfesubsystem.com domain suppression |
| student health update-concussion | 3 | **CAPTURE** | Subject pattern rule → role:teach |
| track team excusal | 3 | **CAPTURE** | Excusal keyword added to field trip rule |
| sick leave | 3 | Suppress | Subject suppression — handled in moment |
| late bus | 3 | Suppress | Subject suppression — handled in moment |
| please reach out to ms. bell | 3 | Suppress | Student referral — handled in moment |
| t. richards / jalen (single names) | 3 each | Suppress | Student referral — handled in moment |
| if you have to be out | 3 | Suppress | Subject suppression — sub plan handled directly |
| show choir competition | 3 | Suppress | Subject suppression — school event noise |
| state championship results | 3 | Suppress | Subject suppression — school news noise |
| congratulations | 8 | Suppress | Subject suppression — school-wide blast |
| teacher of the month | 7 | Suppress | Subject suppression — school-wide blast |
| black history [month] door | 6 | Suppress | Subject suppression — school-wide blast |
| green & gold lit mag | 4 | Suppress | Subject suppression — school newsletter |
| recycling today | 3 | Suppress | Subject suppression — school announcement |
| vhsl / debate champs | 3 | Suppress | Subject suppression — school sports news |
