// =============================================================================
// FILE: 67_AgendaDeck.js
// BOUND TO: Central Ledger (cas-ccps:central-ledger, the nightly rollout) AND
//   the Teacher Dashboard (cas-ccps:teacher-dashboard, 📅 Lessons' button).
//
// The daily agenda (meta/SPRINT_LESSON_DOCS_2026-11.md): one Google Slides
// deck per course per school day, "Agenda — 8175 — Wed Oct 28", in an
// Agendas folder, to project in class:
//
//   1. The day: the date, the schedule, the lesson and today's "I can" goals.
//   2. A slide per itinerary block: what it is, its mode (💻 Chromebooks out,
//      🎧 listening, 💬 discussion, ✏️ writing) and its minutes for each
//      period meeting that day.
//   3. Before you go: submitting on the Student Dashboard, and whether the
//      lesson ends today.
//
// The blocks come from the lesson doc's itinerary (66) when it has been
// made, so the teacher's edits there carry into every deck; otherwise from
// the lesson's drafted plan (55b). Minutes are the doc's column for that
// block and schedule (A or B); any other day (activity, delay, early
// release) fits the A column to the period's minutes (00's itineraryFor_).
// A lesson that runs several days uses the plan's day for that meeting.
//
// Made by the nightly rollout for the next school day (courses with it on)
// and by "Today's agenda" in 📅 Lessons. Remaking a day's deck replaces its
// slides; the AgendaDecks tab records each deck by course and date.
//
// FERPA: curriculum only. No student data.
// =============================================================================

const AGENDA_TAB = "AgendaDecks";
const AGENDA_HEADERS = ["course", "date", "deck_id", "deck_url", "made_at"];
const AGENDA_FOLDER = "Agendas";
const AGENDA_DETAIL_CHARS = 320;

// Makes the course's deck for a school day ("yyyy-MM-dd"), or remakes it.
// Returns { success, created, deckUrl, date } or { success: false, error }.
function makeAgendaDeck_(code, ymd) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lesson = _agLessonOn_(ss, code, ymd);
  if (!lesson) return { success: false, error: "No " + code + " lesson is dated on or before " + ymd + " in LessonSchedule." };
  const a = typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS[lesson.key] : null;
  if (!a) return { success: false, error: "No lesson " + lesson.key + "." };
  const meetings = _ldocMeetings_(ss, cfg, code, lesson.start, lesson.end);
  const at = meetings.map(function (m) { return m.date; }).indexOf(ymd);
  if (at === -1) return { success: false, error: ymd + " is not a class day for " + code + " (a weekend, a day off, or after the lesson)." };
  const meeting = meetings[at];
  const days = (a.plan && a.plan.days) || [];
  const dayIndex = Math.min(at, Math.max(0, days.length - 1));
  const rows = _agItinerary_(ss, lesson.key, dayIndex, days[dayIndex] ? days[dayIndex].blocks : []);
  const periods = meeting.periods.map(function (p) {
    return { period: p, minutes: _agMinutesFor_(rows, ymd, meeting.schedule, p) };
  });
  const lastDay = at === meetings.length - 1 && !!lesson.end;

  const reg = _agRegistry_(ss);
  const have = _agFind_(reg, code, ymd);
  const title = "Agenda — " + code + " — " + _ldocFmt_(ymd, "EEE MMM d");
  let pres;
  if (have) {
    pres = SlidesApp.openById(have.deckId);
  } else {
    pres = SlidesApp.create(title);
    DriveApp.getFileById(pres.getId()).moveTo(_agFolder_(cfg));
  }
  const old = pres.getSlides();
  _agSlide_(pres, _ldocFmt_(ymd, "EEEE, MMMM d") + " · " + BELL_SCHEDULE_LABELS[meeting.schedule],
    [a.unitName].concat(_agGoals_(a).map(function (g) { return "• " + g; }),
      periods.some(function (p) { return bellBlockOf_(p.period) === 3; }) ? ["3rd block: Lunch (your wave)."] : []).join("\n"));
  rows.forEach(function (r, i) {
    const mins = periods.filter(function (p) { return p.minutes[i]; }).map(function (p) {
      return "Period " + p.period + ": " + p.minutes[i] + " min";
    });
    _agSlide_(pres, (ITINERARY_MODES[r.mode] ? ITINERARY_MODES[r.mode] + " · " : "") + r.title,
      [mins.join(" · ")].concat(r.detail ? [String(r.detail).slice(0, AGENDA_DETAIL_CHARS)] : []).filter(Boolean).join("\n\n"));
  });
  _agSlide_(pres, "Before you go",
    "Submit your work on the Student Dashboard. It is checked within about 15 minutes; revise until it passes." +
    (lastDay ? "\n\nToday is the last day for this lesson." : ""));
  old.forEach(function (s) { s.remove(); });
  pres.saveAndClose();

  const deckUrl = "https://docs.google.com/presentation/d/" + pres.getId() + "/edit";
  const now = new Date();
  if (have) reg.getRange(have.row, 5).setValue(now);
  else reg.appendRow([code, ymd, pres.getId(), deckUrl, now]);
  Logger.log("[S67] Agenda " + (have ? "remade" : "made") + " for " + code + " on " + ymd + ".");
  return { success: true, created: !have, deckUrl: deckUrl, date: ymd };
}

// The next school day after ymd for a course: the first day with a meeting
// in its current lesson (or the next lesson's), up to two weeks out; or "".
function nextAgendaDay_(code, ymd) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const p = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  for (let n = 0; n < 14; n++) {
    day.setUTCDate(day.getUTCDate() + 1);
    const d = day.toISOString().slice(0, 10);
    const lesson = _agLessonOn_(ss, code, d);
    if (!lesson) continue;
    const meetings = _ldocMeetings_(ss, cfg, code, lesson.start, lesson.end);
    if (meetings.some(function (m) { return m.date === d; })) return d;
  }
  return "";
}

// ── Reads ────────────────────────────────────────────────────────────────────

// The course's lesson on a date: the latest start on or before it.
function _agLessonOn_(ss, code, ymd) {
  const rows = _ldocScheduleRows_(ss)[code] || [];
  let at = -1;
  rows.forEach(function (r, i) { if (r.start <= ymd) at = i; });
  if (at === -1) return null;
  return { key: rows[at].key, start: rows[at].start, end: rows[at + 1] ? rows[at + 1].start : "" };
}

// The day's blocks: [{ title, mode, detail, cols: { "1st A": 5, ... }, fixed }].
// From the lesson doc's itinerary table for that day when the doc exists,
// else from the plan (with its own minutes as the "plan" column).
function _agItinerary_(ss, key, dayIndex, planBlocks) {
  const found = _ldocFind_(_ldocRegistry_(ss), key);
  if (found) {
    try {
      const tables = _agDocTables_(DocumentApp.openById(found.docId).getBody());
      const t = tables[Math.min(dayIndex, tables.length - 1)];
      if (t && t.length > 1) {
        const head = t[0];
        const byLabel = {};
        Object.keys(ITINERARY_MODES).forEach(function (k) { byLabel[ITINERARY_MODES[k]] = k; });
        return t.slice(1).map(function (cells) {
          const cols = {};
          for (let c = 2; c < head.length - 1; c++) {
            const label = head[c].replace(/\s*\(\d+\)\s*$/, "");
            const n = parseInt(cells[c], 10);
            if (!isNaN(n)) cols[label] = n;
          }
          const mode = byLabel[cells[1]] || "";
          return { title: cells[0], mode: mode, detail: cells[head.length - 1] || "", cols: cols,
            fixed: mode === "warmup" || /^checkout slip$/i.test(cells[0]) };
        });
      }
    } catch (e) {
      Logger.log("[S67] The lesson doc's itinerary could not be read (" + e.message + "); using the plan.");
    }
  }
  return (planBlocks || []).map(function (b) {
    return { title: b.title, mode: b.mode, detail: b.detail, cols: {}, fixed: !!b.fixed, planMinutes: b.minutes };
  });
}

// The itinerary tables under the doc's "Itinerary" heading, as rows of cell text.
function _agDocTables_(body) {
  const out = [];
  let inItinerary = false;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const c = body.getChild(i);
    const type = String(c.getType());
    if (type === "PARAGRAPH") {
      const text = c.getText();
      if (text === LDOC_ITINERARY_HEADING) inItinerary = true;
      else if (text === "Look-fors") break;
    } else if (type === "TABLE" && inItinerary) {
      const rows = [];
      for (let r = 0; r < c.getNumRows(); r++) {
        const row = c.getRow(r);
        const cells = [];
        for (let k = 0; k < row.getNumCells(); k++) cells.push(String(row.getCell(k).getText()).trim());
        rows.push(cells);
      }
      out.push(rows);
    }
  }
  return out;
}

// Minutes per block for one period: the doc's column for its block on A or
// B; otherwise the A column (or the plan's minutes) fitted to the period.
function _agMinutesFor_(rows, ymd, schedule, period) {
  const block = bellBlockOf_(period);
  if (!block) return rows.map(function () { return 0; });
  const name = LDOC_BLOCK_NAMES[block - 1];
  const exact = name + " " + schedule;
  if ((schedule === "A" || schedule === "B") && rows.every(function (r) { return r.cols[exact] != null; })) {
    return rows.map(function (r) { return r.cols[exact]; });
  }
  const anyA = rows.length && Object.keys(rows[0].cols).filter(function (k) { return / A$/.test(k); })[0];
  const base = rows.map(function (r) {
    return { minutes: anyA ? r.cols[anyA] : r.planMinutes, fixed: r.fixed };
  });
  return itineraryFor_(base, classMinutesFor_(ymd, period)).map(function (b) { return b.minutes; });
}

function _agGoals_(a) {
  const goals = a.objectives || {};
  const tiers = _ldocTiers_(a);
  return tiers.primary.concat(tiers.secondary).filter(function (id) { return goals[id]; })
    .slice(0, 3).map(function (id) { return goals[id]; });
}

function _agRegistry_(ss) {
  let sheet = ss.getSheetByName(AGENDA_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(AGENDA_TAB);
    sheet.getRange(1, 1, 1, AGENDA_HEADERS.length).setValues([AGENDA_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _agFind_(reg, code, ymd) {
  if (reg.getLastRow() < 2) return null;
  const rows = reg.getRange(2, 1, reg.getLastRow() - 1, 4).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === code && _normalizeLessonDateCell_(rows[i][1]) === ymd && String(rows[i][2]).trim()) {
      return { row: i + 2, deckId: String(rows[i][2]).trim(), deckUrl: String(rows[i][3]).trim() };
    }
  }
  return null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

function _agFolder_(cfg) {
  const parent = cfg.teacherFolderId ? DriveApp.getFolderById(cfg.teacherFolderId) : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(AGENDA_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(AGENDA_FOLDER);
}

function _agSlide_(pres, title, body) {
  const slide = pres.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  slide.getPlaceholder(SlidesApp.PlaceholderType.TITLE).asShape().getText().setText(title);
  slide.getPlaceholder(SlidesApp.PlaceholderType.BODY).asShape().getText().setText(body || " ");
  return slide;
}
