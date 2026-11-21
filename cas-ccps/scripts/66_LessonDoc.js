// =============================================================================
// FILE: 66_LessonDoc.js
// BOUND TO: Central Ledger (cas-ccps:central-ledger, the nightly rollout) AND
//   the Teacher Dashboard (cas-ccps:teacher-dashboard, 📅 Lessons' button).
//
// One teacher doc per lesson (archive/2026-27-Q1/meta/SPRINT_LESSON_DOCS_2026-11.md), in place of
// the per-period Lesson Frames (27) the lesson builder (51) used to make for
// every class meeting. "Lesson Plan — 8175 L06 …", in a Lesson Plans folder:
//
//   The plan        when it runs and when it is due, links (the Teacher
//                   Dashboard, the agenda deck), the objective, the "I can"
//                   goals, the competencies by tier, vocabulary and the
//                   student task (55b).
//   Itinerary       a table per day of the lesson, drafted from the lesson's
//                   own sections (55b's plan) with minutes for each of the
//                   course's blocks on Schedule A and B (00's itineraryFor_).
//                   The teacher edits minutes, words and modes here; the
//                   daily agenda deck reads this table.
//   Look-fors       each competency's "I can" goal and the state's
//                   demonstration indicators (CompetencyRubrics, 32).
//   Parts           a lesson in parts (68): each part's task, its work type
//                   and the checks Submit makes on it, what opens it, and
//                   what its work needs to show (2026-11-19).
//   What the feedback checks  what Flow 2 grades against (the lesson's
//                   definition of done): what the work needs to show, the
//                   teacher's grading notes and the passing rule
//                   (2026-11-19).
//   Each day it runs  a heading per class meeting (date, schedule, periods)
//                   with room for notes.
//   Class status    per period: docs made, shared, not started, submitted,
//                   waiting for feedback, to revise, passed; then each goal's
//                   count of students whose work hasn't shown it yet (their
//                   best check so far), so the teacher sees what to reteach.
//                   A snapshot; the button refreshes it.
//
// Made once; a second call only refreshes Class status, so the teacher's
// edits stay. A doc made before 2026-11-19 gets Parts and What the feedback
// checks on its next refresh (added before Class status). LessonDocs (Central Ledger) records each doc by lesson key.
//
//   makeOrRefreshLessonDoc_(key, opts)  the one entry point (rollout, button)
//   previewLessonDocs() / makeLessonDocsNow()  editor: this week's lessons
//
// FERPA: class-level counts only. No student name, account or file appears in
// the doc or the log.
// =============================================================================

const LDOC_TAB = "LessonDocs";
const LDOC_HEADERS = ["lesson_key", "doc_id", "doc_url", "created_at", "status_refreshed_at"];
const LDOC_FOLDER = "Lesson Plans";
const LDOC_STATUS_HEADING = "Class status";
const LDOC_PARTS_HEADING = "Parts";
const LDOC_CHECKS_HEADING = "What the feedback checks";
const LDOC_ITINERARY_HEADING = "Itinerary";
// A lesson with no next lesson dated shows this many school days.
const LDOC_OPEN_END_DAYS = 5;
const LDOC_MAX_MEETING_DAYS = 15;
const LDOC_BLOCK_NAMES = ["1st", "2nd", "3rd", "4th"];

// Makes the lesson's doc, or refreshes its Class status when it exists.
// opts.today (Date) for tests. Returns { success, created, docUrl, docId }
// or { success: false, error }.
function makeOrRefreshLessonDoc_(key, opts) {
  const o = opts || {};
  const a = typeof LESSON_ASSIGNMENTS !== "undefined" ? LESSON_ASSIGNMENTS[key] : null;
  if (!a) return { success: false, error: "No lesson " + key + "." };
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const reg = _ldocRegistry_(ss);
  const have = _ldocFind_(reg, key);
  const now = o.today || new Date();
  if (have) {
    const doc = DocumentApp.openById(have.docId);
    _ldocAddGuideSections_(doc.getBody(), a, key);
    _ldocWriteStatus_(doc.getBody(), _ldocClassStatus_(ss, cfg, key), now, _ldocNotShownYet_(ss, cfg, key, a));
    doc.saveAndClose();
    reg.getRange(have.row, 5).setValue(now);
    return { success: true, created: false, docId: have.docId, docUrl: have.docUrl };
  }
  const win = _ldocWindow_(ss, key);
  const meetings = win ? _ldocMeetings_(ss, cfg, a.code, win.start, win.end) : [];
  const blocks = _ldocCourseBlocks_(ss, cfg, a.code);
  const title = "Lesson Plan — " + a.code + " " + a.unitName;
  const doc = DocumentApp.create(title);
  const docId = doc.getId();
  DriveApp.getFileById(docId).moveTo(_ldocFolder_(cfg));
  const body = doc.getBody();
  _ldocWritePlan_(body, a, title, win, _ldocLinks_(ss, cfg, a.code), _ldocDueDay_(ss, a.code, win));
  _ldocWriteItinerary_(body, a, blocks);
  _ldocWriteLookFors_(body, a);
  _ldocWriteParts_(body, key);
  _ldocWriteChecks_(body, a, !!(lessonPartsOf_(key) || []).length);
  _ldocWriteMeetings_(body, meetings);
  _ldocWriteStatus_(body, _ldocClassStatus_(ss, cfg, key), now, _ldocNotShownYet_(ss, cfg, key, a));
  doc.saveAndClose();
  const docUrl = "https://docs.google.com/document/d/" + docId + "/edit";
  reg.appendRow([key, docId, docUrl, now, now]);
  Logger.log("[S66] Lesson doc made for " + key + ".");
  return { success: true, created: true, docId: docId, docUrl: docUrl };
}

// Editor: which lessons this week would get a doc (the current lesson and
// any starting within the rollout's lead days), changing nothing.
function previewLessonDocs() {
  requireScriptOwner_();
  return _ldocThisWeek_(false);
}
// Editor: make them now (or refresh their Class status).
function makeLessonDocsNow() {
  requireScriptOwner_();
  return _ldocThisWeek_(true);
}

function _ldocThisWeek_(apply) {
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  const reg = _ldocRegistry_(ss);
  const today = ymd_(new Date(), Session.getScriptTimeZone());
  const lead = ymd_(new Date(Date.now() + 2 * 86400000), Session.getScriptTimeZone());
  const out = [];
  const rows = _ldocScheduleRows_(ss);
  Object.keys(rows).forEach(function (code) {
    let current = null;
    rows[code].forEach(function (r) { if (r.start <= today) current = r; });
    rows[code].forEach(function (r) {
      if (r !== current && !(r.start > today && r.start <= lead)) return;
      const exists = !!_ldocFind_(reg, r.key);
      out.push({ key: r.key, start: r.start, action: exists ? "refresh class status" : "make" });
    });
  });
  out.forEach(function (x) {
    if (apply) {
      const res = makeOrRefreshLessonDoc_(x.key);
      x.result = res.success ? (res.created ? "made" : "refreshed") : res.error;
    }
    Logger.log("[S66] " + x.key + " (starts " + x.start + "): " + (x.result || ("would " + x.action)));
  });
  if (!out.length) Logger.log("[S66] No current or upcoming dated lesson.");
  return out;
}

// ── Reads ────────────────────────────────────────────────────────────────────

function _ldocRegistry_(ss) {
  let sheet = ss.getSheetByName(LDOC_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LDOC_TAB);
    sheet.getRange(1, 1, 1, LDOC_HEADERS.length).setValues([LDOC_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _ldocFind_(reg, key) {
  if (reg.getLastRow() < 2) return null;
  const rows = reg.getRange(2, 1, reg.getLastRow() - 1, 3).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key && String(rows[i][1]).trim()) {
      return { row: i + 2, docId: String(rows[i][1]).trim(), docUrl: String(rows[i][2]).trim() };
    }
  }
  return null;
}

// LessonSchedule's dated rows by course, in start order: { "8175": [{ key, start }] }.
// Read here, not through 55, which is not in the Teacher Dashboard.
function _ldocScheduleRows_(ss) {
  const out = {};
  const sheet = ss.getSheetByName(TABS.lessonSchedule);
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const code = String(r[0]).trim(), key = String(r[1]).trim();
    const start = _normalizeLessonDateCell_(r[3]);
    if (!code || !key || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
    (out[code] = out[code] || []).push({ key: key, start: start });
  });
  Object.keys(out).forEach(function (c) { out[c].sort(function (x, y) { return x.start < y.start ? -1 : x.start > y.start ? 1 : 0; }); });
  return out;
}

// { start, end } for a lesson: end is the next lesson's start (not taught on
// it), or "" when none is dated. null when the lesson has no date.
function _ldocWindow_(ss, key) {
  const code = String(key).split("-")[0];
  const rows = _ldocScheduleRows_(ss)[code] || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return { start: rows[i].start, end: rows[i + 1] ? rows[i + 1].start : "" };
  }
  return null;
}

// The teacher's ClassSchedule rows for a course: [{ period, dayType }].
function _ldocCoursePeriods_(ss, cfg, code) {
  const sheet = ss.getSheetByName(TABS.classSchedule);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues().filter(function (r) {
    const active = r[4] === "" || r[4] == null ? "TRUE" : String(r[4]).trim().toUpperCase();
    return (!teacher || String(r[0]).trim().toLowerCase() === teacher) && active !== "FALSE" &&
      warmUpCourseCode_(r[3]) === code;
  }).map(function (r) { return { period: String(r[1]).trim(), dayType: String(r[2]).trim().toUpperCase() }; });
}

// The blocks a course meets in (1-4), for the itinerary's minute columns.
// The 2nd block (100 / 90 minutes) when ClassSchedule names none.
function _ldocCourseBlocks_(ss, cfg, code) {
  const blocks = [];
  _ldocCoursePeriods_(ss, cfg, code).forEach(function (p) {
    const b = bellBlockOf_(p.period);
    if (b && blocks.indexOf(b) === -1) blocks.push(b);
  });
  return blocks.length ? blocks.sort() : [2];
}

// The class meetings from start up to end (or LDOC_OPEN_END_DAYS school days):
// [{ date, schedule, periods: [period] }], skipping weekends and NoSchoolDays.
// ODD/EVEN periods follow the day of the month, as the warm-ups do (24).
function _ldocMeetings_(ss, cfg, code, start, end) {
  const periods = _ldocCoursePeriods_(ss, cfg, code);
  const off = {};
  const ns = ss.getSheetByName(TABS.noSchoolDays);
  if (ns && ns.getLastRow() > 1) {
    ns.getRange(2, 1, ns.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const d = _normalizeLessonDateCell_(r[0]);
      if (d) off[d] = true;
    });
  }
  const out = [];
  const p = start.split("-").map(Number);
  const day = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  let schoolDays = 0;
  for (let n = 0; n < 60 && out.length < LDOC_MAX_MEETING_DAYS; n++, day.setUTCDate(day.getUTCDate() + 1)) {
    const ymd = day.toISOString().slice(0, 10);
    if (end && ymd >= end) break;
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6 || off[ymd]) continue;
    if (!end && schoolDays >= LDOC_OPEN_END_DAYS) break;
    schoolDays++;
    const parity = day.getUTCDate() % 2 === 1 ? "ODD" : "EVEN";
    const meet = periods.filter(function (x) {
      return x.dayType === "DAILY" || x.dayType === "DAILY_HALF" || x.dayType === parity;
    }).map(function (x) { return x.period; });
    out.push({ date: ymd, schedule: bellScheduleFor_(ymd), periods: meet });
  }
  return out;
}

// Per period, from the Ledger rows whose workspace belongs to this lesson
// (StudentAssignments). Counts only. A lesson in parts (68) counts each part
// on its own row: "3 · Part 2".
function _ldocClassStatus_(ss, cfg, key) {
  const label = {}; // assignment ConfigID -> "" (the whole lesson) or " · Part n"
  label[casConfigId_(key)] = "";
  (lessonPartsOf_(key) || []).forEach(function (p) { label[p.configId] = " · Part " + p.n; });
  const mine = {};
  const sa = ss.getSheetByName(TABS.studentAssignments);
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      const aid = String(r[2] || "").trim().toUpperCase();
      if (label[aid] !== undefined) mine[String(r[0] || "").trim()] = label[aid];
    });
  }
  const byPeriod = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (!ledger || ledger.getLastRow() < 2) return byPeriod;
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  const isDate = function (v) { return Object.prototype.toString.call(v) === "[object Date]"; };
  ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (row) {
    const part = mine[String(row[LEDGER.CONFIG_ID] || "").trim()];
    if (part === undefined) return;
    if (teacher && String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) return;
    const status = String(row[LEDGER.STATUS] || "").trim();
    if (status === "ARCHIVED") return;
    const period = (String(row[LEDGER.PERIOD] || "").trim() || "—") + part;
    const c = byPeriod[period] = byPeriod[period] || { docs: 0, shared: 0, notStarted: 0, submitted: 0, waiting: 0, revise: 0, passed: 0 };
    const result = String(row[LEDGER.LAST_RESULT] || "").trim();
    const passed = result === "PASSED" || isDate(row[LEDGER.FIRST_PASSED_AT]);
    c.docs++;
    if (status !== "SCHEDULED") c.shared++;
    if (isDate(row[LEDGER.SUBMISSION_TS])) {
      c.submitted++;
      if (!result && !passed) c.waiting++;
      else if (!passed && result === "NEEDS_REVISION") c.revise++;
    } else if (status !== "SCHEDULED") {
      c.notStarted++;
    }
    if (passed) c.passed++;
  });
  return byPeriod;
}

// Where the class is stuck (2026-11-19): for each of the lesson's goals,
// how many of its checked student files haven't shown it yet, by their best
// check so far (CompetencyEvidence, as the Student Dashboard's marks read
// it). [{ id, text, notYet, checked }], the most not-yet first; counts only.
function _ldocNotShownYet_(ss, cfg, key, a) {
  const files = {};
  const configs = {};
  configs[casConfigId_(key)] = true;
  (lessonPartsOf_(key) || []).forEach(function (p) { configs[p.configId] = true; });
  const sa = ss.getSheetByName(TABS.studentAssignments);
  const mine = {};
  if (sa && sa.getLastRow() > 1) {
    sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (configs[String(r[2] || "").trim().toUpperCase()]) mine[String(r[0] || "").trim()] = true;
    });
  }
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (row) {
      if (mine[String(row[LEDGER.CONFIG_ID] || "").trim()] && String(row[LEDGER.STATUS] || "").trim() !== "ARCHIVED") {
        files[String(row[LEDGER.FILE_ID] || "").trim()] = true;
      }
    });
  }
  const ev = ss.getSheetByName(TABS.competencyEvidence);
  if (!ev || ev.getLastRow() < 2) return [];
  const rows = ev.getDataRange().getValues();
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"), iOut = h.indexOf("outcome"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1) return [];
  const best = {}; // comp -> file -> met
  for (let i = 1; i < rows.length; i++) {
    const f = String(rows[i][iFile]).trim();
    if (!files[f] || (iArch !== -1 && String(rows[i][iArch]).trim())) continue;
    const comp = String(rows[i][iComp]).trim();
    const o = String(rows[i][iOut]).trim().toUpperCase();
    if (!comp || ["MET", "PARTIALLY_MET", "NOT_MET"].indexOf(o) === -1) continue;
    const m = best[comp] = best[comp] || {};
    m[f] = m[f] === true || o === "MET";
  }
  const goals = a.objectives || {};
  const tiers = _ldocTiers_(a);
  return tiers.primary.concat(tiers.secondary).filter(function (id) { return best[id]; }).map(function (id) {
    const per = best[id];
    const checked = Object.keys(per).length;
    return { id: id, text: goals[id] || _ldocCompetencyText_(a, id), checked: checked,
      notYet: Object.keys(per).filter(function (f) { return !per[f]; }).length };
  }).sort(function (x, y) { return y.notYet - x.notYet; });
}

// ── Writes ───────────────────────────────────────────────────────────────────

function _ldocFolder_(cfg) {
  const parent = cfg.teacherFolderId ? DriveApp.getFolderById(cfg.teacherFolderId) : DriveApp.getRootFolder();
  const it = parent.getFoldersByName(LDOC_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(LDOC_FOLDER);
}

function _ldocH_(body, text, level) {
  return body.appendParagraph(text).setHeading(level === 1 ? DocumentApp.ParagraphHeading.HEADING1 :
    level === 2 ? DocumentApp.ParagraphHeading.HEADING2 : DocumentApp.ParagraphHeading.HEADING3);
}

function _ldocFmt_(ymd, pattern) {
  const p = ymd.split("-").map(Number);
  return Utilities.formatDate(new Date(p[0], p[1] - 1, p[2], 12), Session.getScriptTimeZone(), pattern);
}

// The competencies by tier: primary (milestone 1), secondary (the rest of
// the milestones), tertiary.
function _ldocTiers_(a) {
  const ids = (a.milestoneCompetencyIds || []).filter(Boolean);
  return { primary: ids.slice(0, 1), secondary: ids.slice(1), tertiary: (a.tertiaryCompetencyIds || []).slice() };
}

function _ldocCompetencyText_(a, id) {
  const m = (a.milestones || []).filter(function (t) { return t.indexOf(id + " ") === 0; })[0];
  return m ? m.slice(id.length + 1) : "";
}

function _ldocWritePlan_(body, a, title, win, links, due) {
  // A new doc starts with one empty paragraph: the title goes in it.
  const first = body.getNumChildren() ? body.getChild(0) : null;
  if (first && String(first.getType()) === "PARAGRAPH" && !first.getText()) {
    first.setText(title);
    first.setHeading(DocumentApp.ParagraphHeading.HEADING1);
  } else {
    _ldocH_(body, title, 1);
  }
  const runs = win ? "Starts " + _ldocFmt_(win.start, "EEE MMM d") +
    (win.end ? "; the next lesson starts " + _ldocFmt_(win.end, "EEE MMM d") : "; no next lesson dated yet") : "Not dated in LessonSchedule yet";
  body.appendParagraph(a.courseName + ". " + runs + "." + (a.plan && a.plan.duration ? " The lesson plans " + a.plan.duration.toLowerCase() + "." : "") +
    (due ? " Due " + _ldocFmt_(due, "EEE MMM d") + ", 11:59 p.m. (the school day before the next lesson; the Student Dashboard's cards and the agenda say the same)." : ""));
  if (links && links.length) {
    const p = body.appendParagraph("Open: " + links.map(function (l) { return l.label; }).join(" · "));
    let at = "Open: ".length;
    links.forEach(function (l) {
      try { p.editAsText().setLinkUrl(at, at + l.label.length - 1, l.url); } catch (e) { /* plain text */ }
      at += l.label.length + 3;
    });
  }
  _ldocH_(body, "The plan", 2);
  if (a.objective) body.appendParagraph(a.objective);
  const goals = a.objectives || {};
  const tiers = _ldocTiers_(a);
  const order = tiers.primary.concat(tiers.secondary, tiers.tertiary);
  if (order.some(function (id) { return goals[id]; })) {
    _ldocH_(body, "The goals (\"I can\")", 3);
    order.forEach(function (id) { if (goals[id]) body.appendListItem(goals[id]); });
  }
  _ldocH_(body, "Competencies", 3);
  [["Primary", tiers.primary], ["Secondary", tiers.secondary], ["Tertiary", tiers.tertiary]].forEach(function (t) {
    if (!t[1].length) return;
    body.appendParagraph(t[0] + ": " + t[1].map(function (id) {
      const text = _ldocCompetencyText_(a, id);
      return id + (text ? " " + text : "");
    }).join("; "));
  });
  if (a.vocabulary) {
    _ldocH_(body, "Vocabulary", 3);
    body.appendParagraph(String(a.vocabulary));
  }
  _ldocH_(body, "The student task", 3);
  String(a.promptText || "").split(/\n{2,}/).forEach(function (para) {
    if (para.trim()) body.appendParagraph(para.trim());
  });
}

// One table per day of the lesson: what happens, its mode, and minutes for
// each of the course's blocks on Schedule A and B, fitted by itineraryFor_.
function _ldocWriteItinerary_(body, a, blocks) {
  _ldocH_(body, LDOC_ITINERARY_HEADING, 2);
  body.appendParagraph("Drafted from the lesson. Change any minutes, words or modes here: the daily agenda " +
    "reads this table. Modes: " + Object.keys(ITINERARY_MODES).filter(function (k) { return k !== "warmup"; })
    .map(function (k) { return ITINERARY_MODES[k]; }).join(", ") + ".");
  const cols = [];
  blocks.forEach(function (b) {
    bellRegularSchedules_().forEach(function (s) {
      const minutes = bellClassMinutes_()[s][b - 1] || 0;
      cols.push({ label: (LDOC_BLOCK_NAMES[b - 1] || "Block " + b) + " " + s + " (" + minutes + ")",
        minutes: minutes });
    });
  });
  const days = (a.plan && a.plan.days) || [];
  days.forEach(function (d, di) {
    if (days.length > 1) _ldocH_(body, d.label || ("Day " + (di + 1)), 3);
    const fitted = cols.map(function (c) { return itineraryFor_(d.blocks, c.minutes); });
    const table = body.appendTable();
    const head = table.appendTableRow();
    ["Block", "Mode"].concat(cols.map(function (c) { return c.label; }), ["What happens"]).forEach(function (h) {
      head.appendTableCell(h);
    });
    d.blocks.forEach(function (b, bi) {
      const row = table.appendTableRow();
      row.appendTableCell(b.title);
      row.appendTableCell(ITINERARY_MODES[b.mode] || b.mode);
      fitted.forEach(function (f) { row.appendTableCell(String(f[bi].minutes)); });
      row.appendTableCell(String(b.detail || ""));
    });
  });
}

function _ldocWriteLookFors_(body, a) {
  _ldocH_(body, "Look-fors", 2);
  const tiers = _ldocTiers_(a);
  const ids = tiers.primary.concat(tiers.secondary, tiers.tertiary);
  let rubrics = {};
  try {
    getRubricsForLesson_(ids).forEach(function (r) { rubrics[r.competency_id] = r; });
  } catch (e) {
    rubrics = {};
  }
  const goals = a.objectives || {};
  ids.forEach(function (id) {
    const r = rubrics[id];
    _ldocH_(body, id + " " + ((r && r.competency_text) || _ldocCompetencyText_(a, id)), 3);
    if (goals[id]) body.appendParagraph(goals[id]);
    ((r && r.demonstration_indicators) || []).forEach(function (ind) { body.appendListItem(String(ind)); });
  });
}

function _ldocWriteMeetings_(body, meetings) {
  _ldocH_(body, "Each day it runs", 2);
  if (!meetings.length) {
    body.appendParagraph("No class meetings found: the lesson has no date in LessonSchedule, or ClassSchedule names no period for this course.");
    return;
  }
  meetings.forEach(function (m) {
    _ldocH_(body, _ldocFmt_(m.date, "EEE MMM d") + " · " + bellScheduleLabel_(m.schedule) +
      (m.periods.length ? " · period " + m.periods.join(", ") : " · no period meets"), 3);
    body.appendParagraph("Notes:");
  });
}

// The doc's links: the Teacher Dashboard and the course's agenda deck (67)
// when one is recorded. [{ label, url }].
function _ldocLinks_(ss, cfg, code) {
  const out = [];
  if (cfg.teacherDashboardUrl) out.push({ label: "Teacher Dashboard (who needs what)", url: cfg.teacherDashboardUrl });
  try {
    const reg = ss.getSheetByName("AgendaDecks");
    if (reg && reg.getLastRow() > 1) {
      const rows = reg.getRange(2, 1, reg.getLastRow() - 1, 4).getValues()
        .filter(function (r) { return String(r[0]).trim() === code && String(r[2]).trim(); });
      const last = rows[rows.length - 1];
      if (last) out.push({ label: "the agenda deck", url: "https://docs.google.com/presentation/d/" + String(last[2]).trim() + "/edit" });
    }
  } catch (e) { /* no agenda yet */ }
  return out;
}

// The lesson's due day (00's lessonDueDay_), or "" (no next lesson dated).
function _ldocDueDay_(ss, code, win) {
  if (!win) return "";
  try {
    const rows = (lessonScheduleRows_(ss, Session.getScriptTimeZone())[code] || []).filter(function (r) { return !r.hold; });
    return lessonDueDay_(rows, { start: win.start });
  } catch (e) {
    return "";
  }
}

// A part's Submit checks, in words: what the reader enforces before a form,
// deck or sheet goes to Flow 2 (75/77/78). [] for a doc part.
function _ldocChecksWords_(part) {
  const out = [];
  if (part.slideChecks) {
    const c = normalizeSlideChecks_(part.slideChecks);
    if (c.maxSlides) out.push(c.minSlides + " to " + c.maxSlides + " slides");
    else out.push("at least " + c.minSlides + " slide" + (c.minSlides === 1 ? "" : "s"));
    if (c.titleSlide) out.push("a title on slide 1");
    if (c.minImages) out.push("at least " + c.minImages + " picture" + (c.minImages === 1 ? "" : "s"));
    if (c.maxImagesPerSlide) out.push("no more than " + c.maxImagesPerSlide + " pictures on a slide");
    if (c.maxLinesPerSlide || c.maxWordsPerLine) {
      out.push("the Rule of Six (at most " + (c.maxLinesPerSlide || "any number of") + " lines a slide" +
        (c.maxWordsPerLine ? ", " + c.maxWordsPerLine + " words a line" : "") + ")");
    }
    if (c.notesOnEverySlide) out.push("speaker notes on every slide");
    if (c.requireChart) out.push("a chart from Google Sheets");
    if (c.minContrast) out.push("text contrast of at least " + c.minContrast + ":1");
  } else if (part.formChecks) {
    const c = normalizeFormChecks_(part.formChecks);
    out.push(c.maxQuestions ? c.minQuestions + " to " + c.maxQuestions + " questions" : "at least " + c.minQuestions + " question" + (c.minQuestions === 1 ? "" : "s"));
    if (c.questionTypes) out.push("question types: " + c.questionTypes.map(function (t) { return (FORM_QUESTION_TYPES[t] || { label: t }).label; }).join(", "));
    out.push(c.collectsEmail ? "email collection on" : "email collection off");
  } else if (part.sheetChecks) {
    const c = part.sheetChecks;
    if (c.requiredTabs && c.requiredTabs.length) out.push("tabs named " + c.requiredTabs.join(", "));
    if (c.minFilledRows) out.push("at least " + c.minFilledRows + " filled rows" + (c.tab ? " on " + c.tab : ""));
    if (c.minFilledCells) out.push("at least " + c.minFilledCells + " filled cells" + (c.tab ? " on " + c.tab : ""));
    if (c.formulasRequired) out.push("at least " + c.formulasRequired + " formulas" + (c.formulasIn ? " in " + c.formulasIn : ""));
    if (c.requireChart) out.push("a chart");
  }
  return out;
}

// The definition of done's lists, as the teacher reads them: what the work
// needs to show, what it can also show, the teacher's grading notes, the
// passing rule. { needs, also, notes, rule }, each "" when absent.
function _ldocDodParts_(dod) {
  const t = String(dod || "");
  const between = function (start, ends) {
    const i = t.indexOf(start);
    if (i === -1) return "";
    let j = t.length;
    ends.forEach(function (e) { const k = t.indexOf(e, i + start.length); if (k !== -1 && k < j) j = k; });
    return t.slice(i + start.length, j).trim();
  };
  return {
    needs: between("What your work needs to show:", ["You can also show:", "Submission:", "PRIMARY COMPETENCY"]),
    also: between("You can also show:", ["Submission:", "PRIMARY COMPETENCY"]),
    notes: between("TEACHER GRADING NOTES", ["PASSING RULE", "PASSING STANDARD"]),
    rule: between("PASSING RULE:", ["\n\n", "PASSING STANDARD"]),
  };
}

function _ldocListLines_(body, text) {
  String(text || "").split("\n").map(function (l) { return l.replace(/^\s*[-*•]\s*/, "").trim(); })
    .filter(Boolean).forEach(function (l) { body.appendListItem(l); });
}

// A lesson in parts: each part, what Submit checks, what opens it, and what
// its work needs to show.
function _ldocWriteParts_(body, key) {
  const parts = lessonPartsOf_(key);
  if (!parts || !parts.length) return;
  _ldocH_(body, LDOC_PARTS_HEADING, 2);
  body.appendParagraph("Students see one part at a time. A part opens when the check finds the part before it meets " +
    "its main goal, or when you open it for a student on the Teacher Dashboard.");
  parts.forEach(function (p) {
    const a = p.a || {};
    const type = a.workFile === "slides" ? "Google Slides deck" : a.workFile === "form" ? "Google Form" :
      a.workFile === "sheet" ? "Google Sheet" : "their doc";
    _ldocH_(body, "Part " + p.n + ": " + (a.partTitle || "") + " (" + type + ")", 3);
    if (a.objective) body.appendParagraph(a.objective);
    const checks = _ldocChecksWords_(a);
    if (checks.length) body.appendParagraph("Submit checks first: " + checks.join("; ") + ". Work that misses one comes back to the student with what to fix, before any feedback.");
    body.appendParagraph(p.n === 1 ? "Open from the start." : "Opens when Part " + (p.n - 1) + "'s main goal is met, or when you open it.");
    // What its work needs to show, past the task line above it.
    const same = function (x) { return String(x || "").replace(/\s*\(required\)\s*$/, "").replace(/[.\s]+$/, "").trim(); };
    const more = String(_ldocDodParts_(a.definitionOfDone).needs).split("\n")
      .map(function (l) { return l.replace(/^\s*[-*•]\s*/, "").trim(); })
      .filter(function (l) { return l && same(l) !== same(a.objective); });
    if (more.length) {
      body.appendParagraph("Also needs to show:");
      more.forEach(function (l) { body.appendListItem(l); });
    }
  });
}

// What Flow 2 grades against, from the lesson's definition of done.
function _ldocWriteChecks_(body, a, inParts) {
  const dod = _ldocDodParts_(a.definitionOfDone);
  if (!dod.needs && !dod.notes && !dod.rule) return;
  _ldocH_(body, LDOC_CHECKS_HEADING, 2);
  if (inParts) {
    body.appendParagraph("Each part is graded on its own list (Parts, above): the automatic feedback reads only " +
      "that part's work, with the earlier parts for context.");
  } else {
    body.appendParagraph("What the automatic feedback grades against (the lesson's definition of done). " +
      "Students see the same \"needs to show\" list in their task.");
    if (dod.needs) { _ldocH_(body, "The work needs to show", 3); _ldocListLines_(body, dod.needs); }
    if (dod.also) { _ldocH_(body, "It can also show", 3); _ldocListLines_(body, dod.also); }
  }
  if (dod.notes) { _ldocH_(body, "Your grading notes", 3); _ldocListLines_(body, dod.notes); }
  if (dod.rule) {
    body.appendParagraph("Passing: " + (/Milestone 1/.test(dod.rule)
      ? "the first goal listed must be fully shown, and every other required goal at least partly shown. " +
        "The goals it can also show never count against the student."
      : dod.rule));
  }
}

// A doc made before Parts and What the feedback checks existed: they go in
// before Class status (which is removed here and rewritten after).
function _ldocAddGuideSections_(body, a, key) {
  const has = function (text) {
    for (let i = 0; i < body.getNumChildren(); i++) {
      const c = body.getChild(i);
      if (String(c.getType()) === "PARAGRAPH" && c.getText() === text) return true;
    }
    return false;
  };
  const parts = lessonPartsOf_(key);
  const needParts = !!(parts && parts.length) && !has(LDOC_PARTS_HEADING);
  const needChecks = !has(LDOC_CHECKS_HEADING) && !!_ldocDodParts_(a.definitionOfDone).needs;
  if (!needParts && !needChecks) return;
  let at = -1;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const c = body.getChild(i);
    if (String(c.getType()) === "PARAGRAPH" && c.getText() === LDOC_STATUS_HEADING) at = i;
  }
  if (at !== -1) {
    body.appendParagraph("");
    for (let i = body.getNumChildren() - 2; i >= at; i--) body.removeChild(body.getChild(i));
  }
  if (needParts) _ldocWriteParts_(body, key);
  if (needChecks) _ldocWriteChecks_(body, a, !!(parts && parts.length));
}

// Class status is the doc's last section: rewritten from its heading down.
function _ldocWriteStatus_(body, byPeriod, now, goals) {
  let at = -1;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const c = body.getChild(i);
    if (c.getType && String(c.getType()) === "PARAGRAPH" && c.getText && c.getText() === LDOC_STATUS_HEADING) at = i;
  }
  if (at !== -1) {
    // Docs won't remove a body's last element, so an empty paragraph goes on
    // the end first and everything between it and the heading is removed.
    body.appendParagraph("");
    for (let i = body.getNumChildren() - 2; i > at; i--) body.removeChild(body.getChild(i));
  } else {
    _ldocH_(body, LDOC_STATUS_HEADING, 2);
  }
  const periods = Object.keys(byPeriod).sort();
  body.appendParagraph("As of " + Utilities.formatDate(now, Session.getScriptTimeZone(), "EEE MMM d, h:mm a") +
    ". Refresh it from 📅 Lessons.");
  if (!periods.length) {
    body.appendParagraph("No student documents for this lesson yet.");
    return;
  }
  const table = body.appendTable();
  const head = table.appendTableRow();
  ["Period", "Docs made", "Shared", "Not started", "Submitted", "Waiting for feedback", "To revise", "Passed"].forEach(function (h) { head.appendTableCell(h); });
  periods.forEach(function (p) {
    const c = byPeriod[p];
    const row = table.appendTableRow();
    [p, c.docs, c.shared, c.notStarted || 0, c.submitted, c.waiting, c.revise || 0, c.passed].forEach(function (v) { row.appendTableCell(String(v)); });
  });
  const stuck = (goals || []).filter(function (g) { return g.notYet > 0; });
  if (stuck.length) {
    _ldocH_(body, "Not shown yet", 3);
    body.appendParagraph("Each goal, with how many checked student files haven't shown it yet (their best check so far). " +
      "The most first: where to reteach or confer. The Teacher Dashboard says who.");
    stuck.forEach(function (g) { body.appendListItem(g.notYet + " of " + g.checked + ": " + g.text); });
  }
}
