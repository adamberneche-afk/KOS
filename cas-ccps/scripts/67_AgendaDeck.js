// =============================================================================
// FILE: 67_AgendaDeck.js
// BOUND TO: Central Ledger (cas-ccps:central-ledger, the nightly rollout) AND
//   the Teacher Dashboard (cas-ccps:teacher-dashboard, 📅 Lessons' button).
//
// The daily agenda, to project in class. Since 2026-11-19 (the operator: one
// slide a day, everything readable on it; no new file a day; a living record
// for future pacing guides) each course has ONE deck per school year,
// "Agenda — 8175 — 2026–27", in the Agendas folder, and each school day is
// one slide in it, newest first. The slide (agendaSlideSpec_, drawn by
// _agDraw_):
//
//   header      the lesson (number and name), the course, the date, the
//               schedule, and "Day 2 of 3" / "last day"
//   Today's plan  each itinerary block: its mode, its title and its minutes
//               for each period meeting that day; "Before you go" under it
//               when there is room
//   Bell schedule  the day's block times in order, the course's blocks
//               marked, and the lunch waves when the 3rd block meets
//   Announcements  what is due (00's lessonDueDay_: 11:59 p.m. the school
//               day before the next lesson), then the AgendaAnnouncements
//               tab's rows for the day (from, to, course or "all", text)
//   Learning targets  up to three of the lesson's "I can" goals
//
// The speaker notes hold each block's detail (the teacher's script) and a
// "YOUR NOTES" section for how the day went: kept when the slide is remade,
// so the deck becomes the record of what each day really took.
//
// The blocks come from the lesson doc's itinerary (66) when it has been
// made, so the teacher's edits there carry into every slide; otherwise from
// the lesson's drafted plan (55b). Minutes are the doc's column for that
// block and schedule (A or B); any other day (activity, delay, early
// release) fits the A column to the period's minutes (00's itineraryFor_).
// A lesson that runs several days uses the plan's day for that meeting.
//
// Made by the nightly rollout for the next school day (courses with it on)
// and by "Today's agenda" in 📅 Lessons. Remaking a day replaces its slide in
// place. The AgendaDecks tab records each day's slide (course, date, deck,
// slide). Rows from before 2026-11-19 (one deck a day, no slide_id) are left
// alone; those decks stay where they are.
//
// tools/cas-ccps/render-agenda-slide.js draws the same spec as a picture,
// to check the layout without Google.
//
// FERPA: curriculum only. No student data.
// =============================================================================

const AGENDA_TAB = "AgendaDecks";
const AGENDA_HEADERS = ["course", "date", "deck_id", "deck_url", "made_at", "slide_id"];
const AGENDA_FOLDER = "Agendas";
const AGENDA_ANNOUNCE_TAB = "AgendaAnnouncements";
const AGENDA_ANNOUNCE_HEADERS = ["from", "to", "course", "text"];
const AGENDA_NOTES_MARK = "YOUR NOTES (kept when this slide is remade):";
const AGENDA_NOTES_PROMPT = "How did today go? What took longer or shorter than planned? What would you change next time?";
// The slide, in points (16:9).
const AG_W = 720, AG_H = 405;
const AG_GREEN = "#0d652d", AG_INK = "#202124", AG_MUTED = "#5f6368", AG_TINT = "#e6f4ea", AG_ROW = "#f4f8f5";

// Makes the course's slide for a school day ("yyyy-MM-dd"), or remakes it.
// Returns { success, created, deckUrl, date } or { success: false, error }.
// created: a new slide for the day (false when the day's slide was remade).
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
  const label = _agLessonLabel_(a);
  const data = {
    lessonNo: label.no, unitName: label.name, courseName: a.courseName || code,
    dateLabel: _ldocFmt_(ymd, "EEEE, MMMM d"), scheduleLabel: bellScheduleLabel_(meeting.schedule),
    day: { n: at + 1, of: lesson.end ? meetings.length : 0 }, lastDay: lastDay,
    rows: rows.map(function (r) { return { mode: r.mode, title: r.title }; }),
    periods: periods,
    bell: _agBellLines_(meeting.schedule, meeting.periods),
    announcements: _agAnnouncements_(ss, code, ymd),
    due: _agDueLines_(ss, code, ymd, lesson),
    goals: _agGoals_(a),
  };
  const spec = agendaSlideSpec_(data);

  const reg = _agRegistry_(ss);
  const year = _agSchoolYear_(ymd);
  const deckRow = _agYearDeck_(reg, code, year);
  const have = _agFind_(reg, code, ymd);
  let pres, fresh = false;
  if (deckRow) {
    pres = SlidesApp.openById(deckRow.deckId);
  } else {
    pres = SlidesApp.create("Agenda — " + code + " — " + year);
    DriveApp.getFileById(pres.getId()).moveTo(_agFolder_(cfg));
    fresh = true;
  }
  const before = pres.getSlides();
  const ids = before.map(function (s) { return s.getObjectId(); });
  let old = null, kept = "", index = 0;
  if (have) {
    const i = ids.indexOf(have.slideId);
    if (i !== -1) { old = before[i]; index = i; kept = _agOwnNotes_(old); }
  }
  if (!old && !fresh) index = Math.min(before.length, _agNewerDays_(reg, code, deckRow ? deckRow.deckId : "", ymd));
  const slide = pres.insertSlide(fresh ? 0 : index, SlidesApp.PredefinedLayout.BLANK);
  _agDraw_(slide, spec);
  _agWriteNotes_(slide, rows, periods, kept);
  if (old) old.remove();
  if (fresh) before.forEach(function (s) { s.remove(); }); // a new deck's own blank slide
  pres.saveAndClose();

  const slideId = slide.getObjectId();
  const deckUrl = "https://docs.google.com/presentation/d/" + pres.getId() + "/edit#slide=id." + slideId;
  const now = new Date();
  if (have) reg.getRange(have.row, 3, 1, 4).setValues([[pres.getId(), deckUrl, now, slideId]]);
  else reg.appendRow([code, ymd, pres.getId(), deckUrl, now, slideId]);
  Logger.log("[S67] Agenda slide " + (have ? "remade" : "made") + " for " + code + " on " + ymd + ".");
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
  } else if (String(sheet.getRange(1, AGENDA_HEADERS.length).getValue()).trim() !== "slide_id") {
    sheet.getRange(1, AGENDA_HEADERS.length).setValue("slide_id"); // a tab from before 2026-11-19
  }
  return sheet;
}

function _agRegRows_(reg) {
  if (reg.getLastRow() < 2) return [];
  return reg.getRange(2, 1, reg.getLastRow() - 1, AGENDA_HEADERS.length).getValues().map(function (r, i) {
    return { row: i + 2, code: String(r[0]).trim(), date: _normalizeLessonDateCell_(r[1]), deckId: String(r[2]).trim(),
      deckUrl: String(r[3]).trim(), slideId: String(r[5] || "").trim() };
  }).filter(function (r) { return r.deckId && r.slideId; }); // one-deck-a-day rows (no slide) are left alone
}

// The day's slide row, or null.
function _agFind_(reg, code, ymd) {
  return _agRegRows_(reg).filter(function (r) { return r.code === code && r.date === ymd; })[0] || null;
}

// The course's deck for a school year ("2026–27"), from any of its days' rows.
function _agYearDeck_(reg, code, year) {
  return _agRegRows_(reg).filter(function (r) { return r.code === code && r.date && _agSchoolYear_(r.date) === year; })[0] || null;
}

// How many of the deck's days come after ymd: where a new day's slide goes
// (newest first).
function _agNewerDays_(reg, code, deckId, ymd) {
  return _agRegRows_(reg).filter(function (r) { return r.code === code && r.deckId === deckId && r.date > ymd; }).length;
}

// The school year a day falls in: August on starts the next one ("2026–27").
function _agSchoolYear_(ymd) {
  const p = String(ymd).split("-").map(Number);
  const start = p[1] >= 8 ? p[0] : p[0] - 1;
  return start + "–" + String((start + 1) % 100).padStart(2, "0");
}

// "L06" and the lesson's name: 8175's unit names start with their number;
// 8177's place comes from the course's teaching order (55b).
function _agLessonLabel_(a) {
  const m = /^(L\d+)\s+(.*)$/.exec(String(a.unitName || ""));
  if (m) return { no: m[1], name: m[2] };
  const order = typeof LESSON_ORDER !== "undefined" ? (LESSON_ORDER[a.code] || []) : [];
  const i = order.indexOf(a.key);
  return { no: i === -1 ? "" : "L" + String(i + 1).padStart(2, "0"), name: String(a.unitName || "") };
}

// The bell schedule's lines for a day: [{ text, mine }], the course's
// blocks marked; then what falls between blocks, and the lunch waves when
// the 3rd block meets. [] when the schedule's times aren't known.
function _agBellLines_(schedule, periods) {
  const t = bellTimes_(schedule);
  if (!t) return [];
  const mine = {};
  (periods || []).forEach(function (p) {
    const b = bellBlockOf_(p);
    if (b) (mine[b] = mine[b] || []).push(p);
  });
  const out = t.blocks.map(function (time, i) {
    const b = i + 1;
    return { text: (LDOC_BLOCK_NAMES[i] || "Block " + b) + "  " + time + (mine[b] ? "  · P" + mine[b].join(", P") : ""), mine: !!mine[b] };
  });
  if (t.extra) out.push({ text: t.extra, mine: false });
  // In the day's order: CM/HR falls between the 1st and 2nd blocks.
  const startOf = function (line) {
    const m = /(\d{1,2}):(\d{2})/.exec(line.text);
    if (!m) return 9999;
    const h = Number(m[1]);
    return (h < 7 ? h + 12 : h) * 60 + Number(m[2]);
  };
  out.sort(function (x, y) { return startOf(x) - startOf(y); });
  if (mine[3] && t.lunch) out.push({ text: t.lunch, mine: false });
  return out;
}

// The AgendaAnnouncements tab's text for a course on a day: rows whose from
// (to the to, or that day alone) covers it, for "all", blank or the course.
function _agAnnouncements_(ss, code, ymd) {
  let sheet = ss.getSheetByName(AGENDA_ANNOUNCE_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(AGENDA_ANNOUNCE_TAB);
    sheet.getRange(1, 1, 1, AGENDA_ANNOUNCE_HEADERS.length).setValues([AGENDA_ANNOUNCE_HEADERS]);
    sheet.setFrozenRows(1);
    return [];
  }
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, AGENDA_ANNOUNCE_HEADERS.length).getValues().filter(function (r) {
    const from = _normalizeLessonDateCell_(r[0]);
    const to = _normalizeLessonDateCell_(r[1]) || from;
    const course = String(r[2] || "").trim().toLowerCase();
    return from && from <= ymd && ymd <= to && String(r[3] || "").trim() &&
      (!course || course === "all" || course === String(code).toLowerCase());
  }).map(function (r) { return String(r[3]).trim(); });
}

// What is due, as the Student Dashboard's cards say it (00's lessonDueDay_):
// a lesson due that night, and the current lesson's due day when later.
function _agDueLines_(ss, code, ymd, lesson) {
  const rows = (lessonScheduleRows_(ss, Session.getScriptTimeZone())[code] || []).filter(function (r) { return !r.hold; });
  const name = function (key) {
    const a = typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS[key] : null;
    if (!a) return key;
    const l = _agLessonLabel_(a);
    return (l.no ? l.no + " " : "") + l.name;
  };
  const out = [];
  rows.forEach(function (r) {
    if (lessonDueDay_(rows, r) === ymd) out.push("Due tonight, 11:59 p.m.: " + name(r.key));
  });
  const due = lessonDueDay_(rows, { start: lesson.start });
  if (due && due > ymd) out.push(name(lesson.key) + " is due " + _ldocFmt_(due, "EEE, MMM d") + ", 11:59 p.m.");
  return out;
}

// ── The slide ────────────────────────────────────────────────────────────────
// agendaSlideSpec_(data) lays the slide out as plain data, so the same
// layout is drawn by _agDraw_ (Slides) and by the renderer (a picture):
//   { width, height, background, elements: [
//     { kind: "rect", x, y, w, h, fill },
//     { kind: "text", x, y, w, h, align, valign, paras: [[{ t, size, bold, italic, color }]] } ] }
// in points. Text sizes are chosen to fit (_agFitSize_: an estimate from
// Arial's average glyph width; the renderer flags any box that overflows).
const AG_INSET = 7.2; // a Slides text box's own padding, each side
const AG_CHAR_EM = 0.52; // Arial's average glyph width in mixed text, in ems
const AG_LINE = 1.2;
const AG_COL_BOTTOM = 290; // where the plan and the right column end; the learning targets below

// Lines a paragraph takes at a size in a width.
function _agLines_(text, size, width) {
  const per = Math.max(1, Math.floor((width - 2 * AG_INSET) / (size * AG_CHAR_EM)));
  const words = String(text).split(/\s+/);
  let lines = 1, col = 0;
  words.forEach(function (w) {
    const len = w.length;
    if (col && col + 1 + len > per) { lines++; col = 0; }
    col += (col ? 1 : 0) + len;
    while (col > per) { lines++; col -= per; }
  });
  return lines;
}
function _agHeight_(paras, size, width) {
  return paras.reduce(function (h, t) { return h + _agLines_(t, size, width) * size * AG_LINE; }, 0) + 2 * AG_INSET;
}
// The largest size (in steps of 0.5) from max down to min at which the
// paragraphs fit the box; min when none does.
function _agFitSize_(paras, width, height, max, min) {
  for (let s = max; s >= min; s -= 0.5) if (_agHeight_(paras, s, width) <= height) return s;
  return min;
}
// The paragraphs that fit at a size, the last cut with "…" when they don't.
function _agClip_(paras, size, width, height) {
  const out = [];
  for (let i = 0; i < paras.length; i++) {
    const next = out.concat([paras[i]]);
    if (_agHeight_(next, size, width) <= height) { out.push(paras[i]); continue; }
    let t = String(paras[i]).trim();
    while (t.length > 1 && _agHeight_(out.concat([t + "…"]), size, width) > height) {
      const cut = t.replace(/\s*\S+$/, "");
      t = cut === t ? t.slice(0, -1) : cut; // a single long word: a letter at a time
    }
    if (t.length > 1) out.push(t + "…");
    break;
  }
  return out;
}

function agendaSlideSpec_(d) {
  const el = [];
  const rect = function (x, y, w, h, fill) { el.push({ kind: "rect", x: x, y: y, w: w, h: h, fill: fill }); };
  const text = function (x, y, w, h, paras, o) {
    el.push(Object.assign({ kind: "text", x: x, y: y, w: w, h: h, align: "left", valign: "top", paras: paras }, o || {}));
  };
  const run = function (t, size, more) { return Object.assign({ t: t, size: size, color: AG_INK }, more || {}); };

  // Header: the lesson, the course and the day.
  rect(0, 0, AG_W, 66, AG_GREEN);
  const title = (d.lessonNo ? d.lessonNo + " · " : "") + d.unitName;
  const tSize = _agFitSize_([title], 520, 38, 22, 15);
  text(18, 4, 520, 38, [[run(_agClip_([title], tSize, 520, 38)[0] || title, tSize, { bold: true, color: "#ffffff" })]], { valign: "middle" });
  text(18, 34, 520, 30, [[run(d.courseName + "  ·  " + d.dateLabel, 12, { color: "#d2eadb" })]], { valign: "middle" });
  const dayOf = d.day && d.day.of ? "Day " + d.day.n + " of " + d.day.of : d.day ? "Day " + d.day.n : "";
  const dayLine = d.lastDay ? (dayOf ? dayOf + " · " : "") + "last day" : dayOf;
  text(540, 4, 162, 34, [[run(d.scheduleLabel, 15, { bold: true, color: "#ffffff" })]], { align: "right", valign: "middle" });
  if (dayLine) text(540, 34, 162, 30, [[run(dayLine, 12, { bold: d.lastDay, color: d.lastDay ? "#fde68a" : "#d2eadb" })]], { align: "right", valign: "middle" });

  // Today's plan: a row per block, a minutes column per period meeting.
  const L = { x: 18, y: 76, w: 432 };
  const periods = (d.periods || []).filter(function (p) { return p.minutes && p.minutes.some(function (m) { return m; }); });
  const colW = 58, cols = periods.length;
  const planHead = [run("Today's plan", 14, { bold: true, color: AG_GREEN })];
  if (cols > 1) planHead.push(run("   minutes, by period", 10, { color: AG_MUTED }));
  text(L.x, L.y - 4, L.w - cols * colW, 32, [planHead], { valign: "middle" });
  periods.forEach(function (p, ci) {
    text(L.x + L.w - (cols - ci) * colW, L.y - 4, colW, 32, [[run(cols === 1 ? "minutes" : "P" + p.period, 10, { bold: true, color: AG_MUTED })]],
      { align: "right", valign: "middle" });
  });
  const rows = d.rows || [];
  const top = L.y + 26, bottom = AG_COL_BOTTOM;
  const rowH = rows.length ? Math.min(38, (bottom - top) / rows.length) : 0;
  const baseSize = Math.max(11, Math.min(16, rowH * 0.42));
  rows.forEach(function (r, i) {
    const y = top + i * rowH;
    if (i % 2 === 0) rect(L.x, y, L.w, rowH, AG_ROW);
    const mode = ITINERARY_MODES[r.mode] || "";
    const icon = mode.split(" ")[0] || "•";
    let word = mode.split(" ").slice(1).join(" ");
    if (word.toLowerCase() === String(r.title).toLowerCase()) word = "";
    text(L.x, y, 30, rowH, [[run(icon, baseSize, {})]], { align: "center", valign: "middle" });
    const tw = L.w - 30 - cols * colW;
    // The title on one line at the row's size, or a little smaller; a long
    // one on two lines, without the mode under it. Bold runs ~8% wider.
    const oneLine = function (sz) { return _agLines_(r.title, sz * 1.08, tw) === 1; };
    let titleSize = baseSize;
    while (titleSize > 13 && !oneLine(titleSize)) titleSize -= 0.5;
    const single = oneLine(titleSize);
    if (!single) titleSize = Math.max(10, Math.min(baseSize, rowH / (2 * AG_LINE * 1.08) - 0.5));
    const showWord = word && rowH >= 26 && single;
    // A middle-anchored box shows text up to its own height, padding included.
    const room = rowH + 2 * AG_INSET - (showWord ? baseSize * 0.62 * AG_LINE : 0);
    const paras = [[run(_agClip_([r.title], titleSize * 1.08, tw, room)[0] || r.title, titleSize, { bold: true })]];
    if (showWord) paras.push([run(word, Math.max(8.5, baseSize * 0.62), { color: AG_MUTED })]);
    text(L.x + 30, y, tw, rowH, paras, { valign: "middle" });
    periods.forEach(function (p, ci) {
      const m = p.minutes[i];
      text(L.x + L.w - (cols - ci) * colW, y, colW, rowH, [[run(m ? String(m) : "–", baseSize, { bold: true, color: AG_GREEN })]],
        { align: "right", valign: "middle" });
    });
  });

  // Before you go: under the plan when there is room.
  const after = top + rows.length * rowH;
  if (AG_COL_BOTTOM - after >= 24) {
    text(L.x, after, L.w, 26, [[run("Before you go: submit on the Student Dashboard, and revise until it passes.", 11,
      { italic: true, color: AG_MUTED })]], { valign: "middle" });
  }

  // The right column: the bell schedule, then announcements and what's due.
  const R = { x: 466, y: 76, w: 236 };
  let y = R.y;
  const bell = d.bell || [];
  if (bell.length) {
    text(R.x, y - 4, R.w, 30, [[run("Bell schedule", 13, { bold: true, color: AG_GREEN })]], { valign: "middle" });
    y += 22;
    const bSize = 10;
    const h = _agHeight_(bell.map(function (b) { return b.text; }), bSize * 1.1, R.w); // room for the bold lines
    text(R.x, y, R.w, h, bell.map(function (b) { return [run(b.text, bSize, { bold: b.mine, color: b.mine ? AG_GREEN : AG_INK })]; }));
    y += h + 4;
  }
  const due = d.due || [];
  // What's due first (the class's own deadlines), then the teacher's.
  const notes = due.concat(d.announcements || []);
  text(R.x, y - 4, R.w, 30, [[run("Announcements", 13, { bold: true, color: AG_GREEN })]], { valign: "middle" });
  y += 22;
  const lines = notes.length ? notes : ["None today."];
  const room = AG_COL_BOTTOM - y;
  const aSize = _agFitSize_(lines, R.w, room, 11.5, 9);
  const shown = _agClip_(lines, aSize, R.w, room);
  rect(R.x, y, R.w, room, AG_TINT);
  text(R.x, y, R.w, room, shown.map(function (t) {
    return [run((notes.length ? "• " : "") + t, aSize, { bold: /^Due tonight/.test(t), color: notes.length ? AG_INK : AG_MUTED })];
  }));

  // Learning targets: up to three "I can" goals, side by side.
  const B = { x: 18, y: AG_COL_BOTTOM + 10, w: 684, h: AG_H - AG_COL_BOTTOM - 18 };
  rect(B.x, B.y, B.w, B.h, AG_TINT);
  text(B.x + 4, B.y, 300, 30, [[run("Learning targets", 13, { bold: true, color: AG_GREEN })]], { valign: "middle" });
  const goals = (d.goals || []).slice(0, 3);
  if (goals.length) {
    const gap = 10, gw = (B.w - 8 - gap * (goals.length - 1)) / goals.length, gy = B.y + 24, gh = B.h - 28;
    const gSize = Math.min.apply(null, goals.map(function (g) { return _agFitSize_([g], gw, gh, 13, 9); }));
    goals.forEach(function (g, i) {
      text(B.x + 4 + i * (gw + gap), gy, gw, gh, [[run(_agClip_([g], gSize, gw, gh)[0] || g, gSize, {})]]);
    });
  }
  return { width: AG_W, height: AG_H, background: "#ffffff", elements: el };
}

// ── Writes ───────────────────────────────────────────────────────────────────

function _agFolder_(cfg) {
  const parent = cfg.teacherFolderId ? DriveApp.getFolderById(cfg.teacherFolderId) : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(AGENDA_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(AGENDA_FOLDER);
}

// Draws a spec on a blank slide: rectangles, then text boxes with each run
// styled. Autofit is turned off so the sizes chosen above hold.
function _agDraw_(slide, spec) {
  spec.elements.forEach(function (e) {
    if (e.kind === "rect") {
      const r = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, e.x, e.y, e.w, e.h);
      r.getFill().setSolidFill(e.fill);
      r.getBorder().setTransparent();
      return;
    }
    const full = e.paras.map(function (p) { return p.map(function (r) { return r.t; }).join(""); }).join("\n");
    const box = slide.insertTextBox(full, e.x, e.y, e.w, e.h);
    try { box.getAutofit().disableAutofit(); } catch (err) { /* older Slides service: no autofit control */ }
    box.setContentAlignment(e.valign === "middle" ? SlidesApp.ContentAlignment.MIDDLE : SlidesApp.ContentAlignment.TOP);
    const tr = box.getText();
    let at = 0;
    e.paras.forEach(function (p, pi) {
      p.forEach(function (r) {
        if (r.t.length) {
          const st = tr.getRange(at, at + r.t.length).getTextStyle();
          st.setFontFamily("Arial").setFontSize(r.size).setBold(!!r.bold).setItalic(!!r.italic).setForegroundColor(r.color || AG_INK);
        }
        at += r.t.length;
      });
      if (pi < e.paras.length - 1) at += 1; // the newline
    });
    const align = e.align === "right" ? SlidesApp.ParagraphAlignment.END
      : e.align === "center" ? SlidesApp.ParagraphAlignment.CENTER : SlidesApp.ParagraphAlignment.START;
    tr.getParagraphStyle().setParagraphAlignment(align);
  });
}

// The teacher's own notes from a slide's speaker notes: what follows the mark.
function _agOwnNotes_(slide) {
  try {
    const t = String(slide.getNotesPage().getSpeakerNotesShape().getText().asString());
    const i = t.indexOf(AGENDA_NOTES_MARK);
    return i === -1 ? "" : t.slice(i + AGENDA_NOTES_MARK.length).trim();
  } catch (e) {
    return "";
  }
}

// Speaker notes: each block's detail (the teacher's script), then the
// teacher's own notes on how the day went, kept across remakes.
function _agWriteNotes_(slide, rows, periods, kept) {
  const lines = ["Today's plan, in detail:"];
  rows.forEach(function (r, i) {
    const mins = periods.filter(function (p) { return p.minutes[i]; }).map(function (p) { return "P" + p.period + " " + p.minutes[i] + " min"; });
    lines.push("• " + r.title + (ITINERARY_MODES[r.mode] ? " (" + ITINERARY_MODES[r.mode] + ")" : "") +
      (mins.length ? " — " + mins.join(", ") : "") + (r.detail ? ": " + String(r.detail).replace(/\s+/g, " ").trim() : ""));
  });
  lines.push("", AGENDA_NOTES_MARK, kept || AGENDA_NOTES_PROMPT);
  try {
    slide.getNotesPage().getSpeakerNotesShape().getText().setText(lines.join("\n"));
  } catch (e) {
    Logger.log("[S67] Speaker notes not written: " + e.message);
  }
}
