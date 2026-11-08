// =============================================================================
// FILE: 74_TurnInCanvasCheck.js
// BOUND TO: Teacher Dashboard (standalone web app, cas-ccps:teacher-dashboard)
// TRIGGERS: none. From the Teacher Dashboard's Turn-in codes panel (07, 73),
//           or runTurnInCanvasCheck() from the editor.
//
// PURPOSE: the turn-in code, stage 3: the Canvas check
// (meta/TURN_IN_CODE_PLAN_2026-11.md, D17; the Canvas facts are T3, verified
// by the operator 2026-11-08). The teacher downloads an assignment's
// submissions ZIP and a fresh gradebook export from Canvas and drops both in
// the Drive folder 52's roster import reads exports from (TEACHER_FOLDER_ID,
// else the teacher's own Drive). This reads every text entry in the ZIP,
// finds the turn-in code in it, and checks the code belongs to that student
// and that assignment. Out: a report, and a CSV for Canvas's gradebook
// Upload page that gives full points for valid codes only.
//
// THE ZIP. One file per submission. A text entry is
// "<sortable name>_[LATE_]<SIS ID>_text.html" (tccParseFileName_): the SIS ID
// is read from the name and the LATE_ marker is ignored. Anything else is
// reported as NOT_TEXT_ENTRY. THE NAME IN A FILE NAME IS NEVER USED: not to
// match, not in a log, not in the report, not stored. The HTML holds a
// heading (the assignment title and the student's name) and the typed text
// in a box: tccHtmlText_ drops scripts, styles and headings, strips the
// tags and decodes entities; the heading is only compared with the chosen
// Canvas column's title, and a mismatch is a warning, never a block. The
// student's text is read for the code and kept nowhere.
//
// THE CODE (tccFindCodes_): each "CAS" in the text and the 60 characters
// after it, upper case, with spaces, dashes, dots, colons and underscores
// taken out, read as CAS + 4 course digits + L + 2 (then 3) lesson digits +
// 8 characters; O is read as 0 and I and L as 1 in the digits, and 71's
// turnInCodeValid_() checks the check character (and does the same for the
// random part). The first valid code is used; more than one code, or a valid
// one beside one that doesn't check out, is noted.
//
// THE MATCH, by ID only (tccMatchRoster_): the file's SIS ID is looked up in
// the export's "SIS User ID" column, then in Canvas's "ID" column if no row
// has it there. The matching rows' "SIS Login ID" must be one value: that is
// the student's account, built as 52 enrols students (00's
// canvasLoginAccount_). No row, rows that disagree, or a row with no login:
// NOT_ON_ROSTER, never a guess. Then the code's TurnInCodes row (71):
//   VALID               the code is this account's, for the chosen assignment
//                       (its ConfigID, or a part of it: CAS-8177-L05-P2
//                       counts for CAS-8177-L05)
//   WRONG_ASSIGNMENT    this account's code, for another assignment
//   OTHER_STUDENTS_CODE someone else's code
//   INVALID_CODE        something code-shaped whose check character fails,
//                       or a well-formed code TurnInCodes doesn't hold
//   NO_CODE             nothing code-shaped in the text
//   NOT_ON_ROSTER       above
//   NOT_TEXT_ENTRY      a file upload, URL or other non-text submission
//   UNREADABLE          a file that couldn't be read as text, or is empty
//
// THE UPLOAD FILE (tccUploadCsv_): the export's identity columns exactly as
// the export has them (Student, ID, SIS User ID, SIS Login ID, Section, in
// its order) and ONE assignment column, the chosen gradebook column's header
// verbatim. The export's "Points Possible" row is copied with the points.
// A student row gets full points (from that row, or the teacher's number when
// the export has none) when one of their files is VALID, and a BLANK cell
// otherwise: Canvas leaves a grade unchanged for a blank cell, so the file
// only ever adds completion for valid codes. Rows with no ID (Canvas's own
// notes) are left out.
//
// WHAT IS KEPT. The report (a Google Sheet: counts, then each submission's
// student as the Teacher Dashboard shows them, from the Ledger, never the
// file name) and the upload CSV are saved in the teacher's folder (or beside
// the export when TEACHER_FOLDER_ID isn't set). The Ledger gets one
// TurnInCanvasRuns row per run: who, when, which assignment and column, the
// counts. Nothing from the ZIP: no text, no names, no file names. The ZIP and
// the export stay where the teacher put them; the panel asks the teacher to
// delete the ZIP when done (it holds students' work and names).
//
// LIMITS. At most TCC_FILES_MAX files a run and TCC_TIME_BUDGET_MS of work
// (about 120 files take seconds); past either, the run stops, says so, and
// its upload file covers only the files read.
//
// WHO CAN CALL: the panel's functions check _isAuthorizedTeacher_() first;
// runTurnInCanvasCheck() calls requireScriptOwner_(). None is on
// webapp-public-allow.json. Logs counts only.
// =============================================================================

const TCC_RUNS_TAB = "TurnInCanvasRuns";
const TCC_RUN_HEADERS = ["RunAt", "RunBy", "AssignmentID", "CanvasColumn", "Files", "Valid", "NoCode",
  "OtherStudentsCode", "WrongAssignment", "InvalidCode", "NotOnRoster", "NotTextEntry", "Unreadable", "Stopped"];
const TCC_OUTCOMES = ["VALID", "NO_CODE", "OTHER_STUDENTS_CODE", "WRONG_ASSIGNMENT", "INVALID_CODE",
  "NOT_ON_ROSTER", "NOT_TEXT_ENTRY", "UNREADABLE"];
const TCC_LABELS = {
  VALID: "Valid code",
  NO_CODE: "No code",
  OTHER_STUDENTS_CODE: "Someone else's code",
  WRONG_ASSIGNMENT: "Their code, for another assignment",
  INVALID_CODE: "Code doesn't check out",
  NOT_ON_ROSTER: "Not on the gradebook export",
  NOT_TEXT_ENTRY: "Not a text entry",
  UNREADABLE: "Couldn't read the file",
};
const TCC_IDENTITY_COLUMNS = ["student", "id", "sis user id", "sis login id", "section"];
const TCC_FILES_MAX = 400;
const TCC_TIME_BUDGET_MS = 4 * 60 * 1000;
const TCC_SCAN_MAX = 500;      // Drive files looked at when listing the folder
const TCC_LIST_MAX = 8;        // ZIPs and exports offered in the panel
const TCC_CODE_WINDOW = 60;    // characters read after each "CAS"
const TCC_ASSIGNMENT_RE = /^CAS-\d{4}-L\d{1,3}(?:-P\d+)?$/;

// ---------------------------------------------------------------------------
// Reading one submission (pure)
// ---------------------------------------------------------------------------

// { text, sisId } from a ZIP entry's name. text: a text entry
// ("<name>_[LATE_]<SIS ID>_text.html"). Only the ID is returned: the name
// part is never read.
function tccParseFileName_(name) {
  const base = String(name || "").split("/").pop();
  const m = /_(?:LATE_)?([^_]+)_text\.html?$/i.exec(base);
  if (m) return { text: true, sisId: m[1] };
  const other = /^[^_]+_(?:LATE_)?([^_.]+)_/i.exec(base);
  return { text: false, sisId: other ? other[1] : "" };
}

// Whether a ZIP entry is a file worth reading (not a folder or a Mac's
// resource-fork copy).
function tccIsSubmissionEntry_(name) {
  const n = String(name || "");
  if (!n || /\/$/.test(n) || /(^|\/)__MACOSX\//.test(n)) return false;
  return !/^\./.test(n.split("/").pop());
}

const TCC_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hyphen: "-", minus: "−", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

function tccDecodeEntities_(s) {
  return String(s || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (all, e) {
    if (e.charAt(0) === "#") {
      const n = e.charAt(1).toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    const v = TCC_ENTITIES[e.toLowerCase()];
    return v === undefined ? all : v;
  });
}

function _tccPlain_(html) {
  return tccDecodeEntities_(String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim();
}

// { heading, body }: the first heading's text, and the rest of the page as
// plain text with every heading taken out (so a code is read from the box,
// never from the title line).
function tccHtmlText_(html) {
  const s = String(html || "").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const h = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i.exec(s);
  return {
    heading: h ? _tccPlain_(h[2]) : "",
    body: _tccPlain_(s.replace(/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1\s*>/gi, " ")),
  };
}

function _tccDigits_(s) {
  return s.replace(/O/g, "0").replace(/[IL]/g, "1");
}

// { codes: [the valid codes, canonical, in order, once each], invalid: n }
// from a submission's text. invalid counts the code-shaped runs (CAS and
// four digits) that didn't check out.
function tccFindCodes_(text) {
  const t = String(text || "").toUpperCase().replace(/[‐-―−]/g, "-");
  const codes = [];
  let invalid = 0;
  for (let i = t.indexOf("CAS"); i !== -1; i = t.indexOf("CAS", i + 3)) {
    if (i > 0 && /[A-Z0-9]/.test(t.charAt(i - 1))) continue;
    const compact = t.slice(i, i + TCC_CODE_WINDOW).replace(/[\s\-_.:]/g, "");
    const head = /^CAS([0-9OIL]{4})/.exec(compact);
    if (!head || !/\d/.test(head[1])) continue;
    let found = "";
    for (let len = 2; len <= 3 && !found && compact.charAt(head[0].length) === "L"; len++) {
      const lesson = compact.substr(head[0].length + 1, len);
      const tail = compact.substr(head[0].length + 1 + len, 8);
      if (!/^[0-9OIL]+$/.test(lesson) || lesson.length !== len || !/^[0-9A-Z]{8}$/.test(tail)) continue;
      found = turnInCodeValid_("CAS-" + _tccDigits_(head[1]) + "-L" + _tccDigits_(lesson) + "-" +
        tail.slice(0, 4) + "-" + tail.slice(4));
    }
    if (found) {
      if (codes.indexOf(found) === -1) codes.push(found);
    } else {
      invalid++;
    }
  }
  return { codes: codes, invalid: invalid };
}

// ---------------------------------------------------------------------------
// The gradebook export (pure)
// ---------------------------------------------------------------------------

function _tccPoints_(cell) {
  const s = String(cell === undefined || cell === null ? "" : cell).trim();
  const n = Number(s);
  return s && isFinite(n) && n > 0 ? n : null;
}

// The export, read once: { ok, rows, header, iStudent, iId, iSis, iLogin,
// identity: [column index, in the export's order], pointsRow (row index or
// -1), students: [row index], columns: [{ index, header, title, points }] }
// or { ok: false, error }.
function tccParseExport_(text) {
  const rows = canvasCsvRows_(text);
  if (!rows.length) return { ok: false, error: "The gradebook export is empty." };
  const header = rows[0].map(function (h) { return String(h); });
  const low = header.map(function (h) { return h.trim().toLowerCase(); });
  const col = function (n) { return low.indexOf(n); };
  const out = { ok: true, rows: rows, header: header, iStudent: col("student"), iId: col("id"),
    iSis: col("sis user id"), iLogin: col("sis login id"), pointsRow: -1, students: [], columns: [] };
  if (out.iLogin === -1 || (out.iSis === -1 && out.iId === -1)) {
    return { ok: false, error: "That file isn't a Canvas gradebook export: it has no SIS Login ID, SIS User ID or ID column." };
  }
  out.identity = low.map(function (h, i) { return TCC_IDENTITY_COLUMNS.indexOf(h) !== -1 ? i : -1; })
    .filter(function (i) { return i !== -1; });
  const cell = function (r, i) { return i === -1 ? "" : String(r[i] === undefined ? "" : r[i]).trim(); };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (/^points possible$/i.test(cell(r, out.iStudent))) {
      if (out.pointsRow === -1) out.pointsRow = i;
      continue;
    }
    if (cell(r, out.iId) || cell(r, out.iSis) || cell(r, out.iLogin)) out.students.push(i);
  }
  header.forEach(function (h, i) {
    if (out.identity.indexOf(i) !== -1) return;
    const m = /^(.*\S)\s*\((\d+)\)$/.exec(h.trim());
    if (!m) return;
    out.columns.push({ index: i, header: h, title: m[1].trim(),
      points: out.pointsRow === -1 ? null : _tccPoints_(rows[out.pointsRow][i]) });
  });
  return out;
}

// The export rows for a file's SIS ID: { ok, rows: [row index], login,
// account, via } or { ok: false, why }. SIS User ID first; Canvas's ID only
// when no row has the ID there. Never a guess: no row, rows whose logins
// differ (also across the two columns), or no login is no match.
function tccMatchRoster_(exp, sisId) {
  const id = String(sisId || "").trim();
  if (!id) return { ok: false, why: "NO_ID" };
  const at = function (r, i) { return i === -1 ? "" : String(exp.rows[r][i] === undefined ? "" : exp.rows[r][i]).trim(); };
  const bySis = exp.students.filter(function (r) { return at(r, exp.iSis) === id; });
  const byId = exp.students.filter(function (r) { return at(r, exp.iId) === id; });
  const rows = bySis.length ? bySis : byId;
  if (!rows.length) return { ok: false, why: "NOT_FOUND" };
  const logins = {};
  bySis.concat(byId).forEach(function (r) { logins[at(r, exp.iLogin).toLowerCase()] = true; });
  const list = Object.keys(logins);
  if (list.length !== 1) return { ok: false, why: "INCONSISTENT" };
  if (!list[0]) return { ok: false, why: "NO_LOGIN" };
  return { ok: true, rows: rows, login: list[0], account: canvasLoginAccount_(list[0]),
    via: bySis.length ? "SIS User ID" : "ID" };
}

// The gradebook column that best matches an assignment's name: the most
// words in common (three letters or more), then the lesson number. "" when
// nothing matches.
function tccBestColumn_(columns, assignmentName, assignmentId) {
  const words = function (s) {
    return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (w) {
      return w.length >= 3 && ["the", "and", "for", "with", "lesson", "part", "cas"].indexOf(w) === -1;
    });
  };
  const want = words(assignmentName);
  const lesson = /-L(\d{1,3})(?:-|$)/i.exec(String(assignmentId || ""));
  let best = "", bestScore = 0;
  (columns || []).forEach(function (c) {
    const have = words(c.title);
    let score = want.filter(function (w) { return have.indexOf(w) !== -1; }).length * 2;
    if (lesson && new RegExp("\\b(?:l|lesson\\s*)0*" + Number(lesson[1]) + "\\b", "i").test(c.title)) score += 1;
    if (score > bestScore) { best = c.header; bestScore = score; }
  });
  return best;
}

// ---------------------------------------------------------------------------
// The check (pure apart from reading each entry)
// ---------------------------------------------------------------------------

// ctx: { exp, column (from exp.columns), assignmentId, codeIndex: { code:
// { account, assignmentId } }, display(account) -> { student, period } }.
// entry: { name, read() -> text }. Returns { outcome, rowsMatched, who, note,
// titleMismatch }.
function tccCheckEntry_(entry, ctx) {
  const file = tccParseFileName_(entry.name);
  const match = file.sisId ? tccMatchRoster_(ctx.exp, file.sisId) : { ok: false, why: "NO_ID" };
  const who = match.ok ? ctx.display(match.account, file.sisId)
    : { student: file.sisId ? "SIS ID " + file.sisId : "A file with no SIS ID in its name", period: "" };
  const out = { outcome: "", rowsMatched: [], who: who, note: "", titleMismatch: false };
  if (!file.text) { out.outcome = "NOT_TEXT_ENTRY"; return out; }
  if (!match.ok) {
    out.outcome = "NOT_ON_ROSTER";
    out.note = match.why === "INCONSISTENT" ? "The ID matches gradebook rows for different students."
      : match.why === "NO_LOGIN" ? "That gradebook row has no SIS Login ID." : "No gradebook row has this ID.";
    return out;
  }
  let html = "";
  try { html = String(entry.read() || ""); } catch (e) { html = ""; }
  if (!html.trim()) { out.outcome = "UNREADABLE"; return out; }
  const page = tccHtmlText_(html);
  const title = String(ctx.column.title || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (page.heading && title && page.heading.toLowerCase().replace(/\s+/g, " ").indexOf(title) === -1) {
    out.titleMismatch = true;
  }
  const found = tccFindCodes_(page.body);
  if (found.codes.length + found.invalid > 1) {
    out.note = (found.codes.length + found.invalid) + " codes in the entry; the first valid one was read.";
  }
  if (!found.codes.length) {
    out.outcome = found.invalid ? "INVALID_CODE" : "NO_CODE";
    if (found.invalid) out.note = "A code was typed, but its check character doesn't match. Likely a typo.";
    return out;
  }
  const owner = ctx.codeIndex[found.codes[0]];
  if (!owner) {
    out.outcome = "INVALID_CODE";
    out.note = (out.note ? out.note + " " : "") + "No such code was issued.";
    return out;
  }
  if (owner.account !== match.account) { out.outcome = "OTHER_STUDENTS_CODE"; return out; }
  if (!turnInOverrideCovers_(ctx.assignmentId, owner.assignmentId)) {
    out.outcome = "WRONG_ASSIGNMENT";
    out.note = (out.note ? out.note + " " : "") + "The code is for " + owner.assignmentId + ".";
    return out;
  }
  out.outcome = "VALID";
  out.rowsMatched = match.rows;
  return out;
}

// Runs every entry: { results: [...], counts: { outcome: n }, valid: { row
// index: true }, titleMismatch: n, files, stopped }.
function tccEvaluate_(entries, ctx, deadline) {
  const counts = {};
  TCC_OUTCOMES.forEach(function (o) { counts[o] = 0; });
  const out = { results: [], counts: counts, valid: {}, titleMismatch: 0, files: 0, stopped: "" };
  for (let i = 0; i < entries.length; i++) {
    if (i >= TCC_FILES_MAX) { out.stopped = "More than " + TCC_FILES_MAX + " files: the first " + TCC_FILES_MAX + " were read."; break; }
    if (deadline && Date.now() > deadline) { out.stopped = "Out of time after " + i + " files: run it again on a smaller ZIP."; break; }
    const r = tccCheckEntry_(entries[i], ctx);
    out.files++;
    counts[r.outcome]++;
    if (r.titleMismatch) out.titleMismatch++;
    r.rowsMatched.forEach(function (row) { out.valid[row] = true; });
    out.results.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The upload file (pure)
// ---------------------------------------------------------------------------

function _tccCsvCell_(v) {
  const s = String(v === undefined || v === null ? "" : v);
  return /[",\r\n]/.test(s) ? "\"" + s.replace(/"/g, "\"\"") + "\"" : s;
}

// The CSV for Canvas's gradebook Upload page (see the header): identity
// columns verbatim, the chosen column's header verbatim, full points for a
// valid row, blank for every other row.
function tccUploadCsv_(exp, column, points, valid) {
  const line = function (r, value) {
    return exp.identity.map(function (i) { return exp.rows[r][i]; }).concat([value]).map(_tccCsvCell_).join(",");
  };
  const out = [exp.identity.map(function (i) { return exp.header[i]; }).concat([column.header]).map(_tccCsvCell_).join(",")];
  if (exp.pointsRow !== -1) out.push(line(exp.pointsRow, String(points)));
  exp.students.forEach(function (r) { out.push(line(r, valid[r] ? String(points) : "")); });
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Drive: the folder, the files, the outputs
// ---------------------------------------------------------------------------

function _tccFile_(f) {
  let updated = 0;
  try { updated = f.getLastUpdated ? f.getLastUpdated().getTime() : 0; } catch (e) { updated = 0; }
  return { id: f.getId(), name: String(f.getName()), updatedMs: updated,
    updated: updated ? Utilities.formatDate(new Date(updated), Session.getScriptTimeZone(), "MMM d, h:mm a") : "" };
}

// The newest ZIPs and gradebook exports: { zips, exports, files: { id: File },
// folderName }. From TEACHER_FOLDER_ID when set (52's folder), else the
// teacher's own Drive.
function _tccListFiles_(cfg) {
  const zips = [], exports = [], files = {};
  const take = function (f) {
    const name = String(f.getName());
    if (/\.zip$/i.test(name)) { zips.push(f); files[f.getId()] = f; }
    else if (/grades/i.test(name) && /\.csv$/i.test(name)) { exports.push(f); files[f.getId()] = f; }
  };
  const scan = function (it) {
    for (let n = 0; it.hasNext() && n < TCC_SCAN_MAX; n++) {
      const f = it.next();
      if (f.isTrashed && f.isTrashed()) continue;
      take(f);
    }
  };
  let folderName = "your Drive";
  if (cfg.teacherFolderId) {
    const folder = DriveApp.getFolderById(cfg.teacherFolderId);
    folderName = String(folder.getName());
    scan(folder.getFiles());
  } else {
    scan(DriveApp.searchFiles('title contains ".zip" and trashed = false and \'me\' in owners'));
    scan(DriveApp.searchFiles('title contains "Grades" and trashed = false and \'me\' in owners'));
  }
  const newest = function (list) {
    return list.map(_tccFile_).sort(function (a, b) { return b.updatedMs - a.updatedMs; }).slice(0, TCC_LIST_MAX);
  };
  return { zips: newest(zips), exports: newest(exports), files: files, folderName: folderName };
}

// Where the report and the upload file go: the teacher's folder, else the
// folder the export is in, else My Drive.
function _tccOutputFolder_(cfg, exportFile) {
  if (cfg.teacherFolderId) return DriveApp.getFolderById(cfg.teacherFolderId);
  try {
    const parents = exportFile.getParents();
    if (parents.hasNext()) return parents.next();
  } catch (e) { /* fall through */ }
  return DriveApp.getRootFolder();
}

function _tccStamp_(now) {
  return Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
}

// The report as a Google Sheet in the folder: counts, then each submission.
function _tccSaveReport_(folder, run, now) {
  const ss = SpreadsheetApp.create("Turn-in check — " + run.assignmentId + " — " + _tccStamp_(now));
  const values = [
    ["Turn-in check", run.assignmentId, "", ""],
    ["Canvas column", run.column, "", ""],
    ["Run", _tccStamp_(now), "", ""],
    ["Files read", String(run.files), run.stopped || "", ""],
    ["", "", "", ""],
    ["Result", "Count", "", ""],
  ];
  TCC_OUTCOMES.forEach(function (o) { values.push([TCC_LABELS[o], String(run.counts[o]), "", ""]); });
  values.push(["", "", "", ""], ["Student", "Period", "Result", "Note"]);
  run.rows.forEach(function (r) { values.push([r.student, r.period, r.label, r.note]); });
  const sheet = ss.getSheets()[0];
  const range = sheet.getRange(1, 1, values.length, 4);
  range.setNumberFormat("@");
  range.setValues(values.map(function (row) { return row.map(function (v) { return sheetSafeText_(String(v)); }); }));
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss.getUrl();
}

function _tccLogRun_(cfg, run, now) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = _turnInSheet_(ss, TCC_RUNS_TAB, TCC_RUN_HEADERS);
  const row = [now.toISOString(), String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase(),
    run.assignmentId, sheetSafeText_(run.column), String(run.files)]
    .concat(TCC_OUTCOMES.map(function (o) { return String(run.counts[o]); }))
    .concat([run.stopped ? "YES" : ""]);
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 1, 1, TCC_RUN_HEADERS.length).setNumberFormat("@");
  sheet.getRange(at, 1, 1, TCC_RUN_HEADERS.length).setValues([row]);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

// What the report shows for an account: this teacher's Ledger name and
// period, as the dashboard shows them.
function _tccDisplay_(cfg, ss) {
  const roster = {};
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data = sheet && sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  const year = _currentSchoolYear_();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher || !_isCurrentSchoolYearRow_(r, year)) continue;
    const who = String(r[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
    if (who && !roster[who]) {
      roster[who] = { student: String(r[LEDGER.STUDENT_NAME] || "").trim() || who, period: String(r[LEDGER.PERIOD] || "").trim() };
    }
  }
  return function (account, sisId) {
    return roster[account] || { student: "Not on your CAS roster (SIS ID " + sisId + ")", period: "" };
  };
}

function _tccCodeIndex_(ss) {
  const index = {};
  _turnInRows_(ss, TURN_IN_CODES_TAB, TURN_IN_CODE_HEADERS.length).forEach(function (r) {
    const code = String(r[TCODE.CODE] || "").trim();
    if (code) index[code] = { account: String(r[TCODE.GOOGLE_ID]).trim().toLowerCase(), assignmentId: String(r[TCODE.ASSIGNMENT_ID]).trim() };
  });
  return index;
}

// opts: { assignmentId, column (a header), points?, zipFile, exportFile, now? }.
// Returns what the panel shows (see runTurnInCanvasCheckFromPanel).
function _tccRun_(cfg, opts) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const started = Date.now();
  const assignmentId = String(opts.assignmentId || "").trim().toUpperCase();
  if (!TCC_ASSIGNMENT_RE.test(assignmentId)) return _tipRefuse_("Pick the CAS assignment (like CAS-8177-L05).");
  const exp = tccParseExport_(opts.exportFile.getBlob().getDataAsString("UTF-8"));
  if (!exp.ok) return _tipRefuse_(exp.error);
  const column = exp.columns.filter(function (c) { return c.header === opts.column; })[0];
  if (!column) return _tipRefuse_("Pick the gradebook column to fill: that one isn't in this export.");
  const points = column.points || _tccPoints_(opts.points);
  if (!points) {
    return Object.assign(_tipRefuse_("The export has no Points Possible for that column. Enter the full points."),
      { needPoints: true });
  }
  let entries;
  try {
    entries = Utilities.unzip(opts.zipFile.getBlob());
  } catch (e) {
    return _tipRefuse_("Couldn't open that ZIP: " + e.message);
  }
  const list = entries.filter(function (b) { return tccIsSubmissionEntry_(b.getName()); })
    .map(function (b) { return { name: b.getName(), read: function () { return b.getDataAsString("UTF-8"); } }; });
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ctx = { exp: exp, column: column, assignmentId: assignmentId, codeIndex: _tccCodeIndex_(ss),
    display: _tccDisplay_(cfg, ss) };
  const ev = tccEvaluate_(list, ctx, started + TCC_TIME_BUDGET_MS);

  const order = {};
  TCC_OUTCOMES.forEach(function (o, i) { order[o] = i; });
  const rows = ev.results.map(function (r) {
    return { student: r.who.student, period: r.who.period, outcome: r.outcome, label: TCC_LABELS[r.outcome], note: r.note };
  }).sort(function (a, b) { return (order[a.outcome] - order[b.outcome]) || a.student.localeCompare(b.student); });
  const warnings = [];
  if (ev.stopped) warnings.push(ev.stopped);
  if (ev.titleMismatch) {
    warnings.push(ev.titleMismatch + " file" + (ev.titleMismatch === 1 ? "'s heading names" : "s' headings name") +
      " a different assignment than “" + column.title + "”. Check you picked the right ZIP and column.");
  }
  const run = { assignmentId: assignmentId, column: column.header, points: points, files: ev.files,
    counts: ev.counts, rows: rows, stopped: ev.stopped, warnings: warnings };

  const folder = _tccOutputFolder_(cfg, opts.exportFile);
  const uploadName = "Turn-in upload — " + assignmentId + " — " + _tccStamp_(now) + ".csv";
  const upload = folder.createFile(uploadName, tccUploadCsv_(exp, column, points, ev.valid), MimeType.CSV);
  run.uploadName = uploadName;
  run.uploadUrl = upload.getUrl();
  run.reportUrl = _tccSaveReport_(folder, run, now);
  run.folderName = String(folder.getName());
  _tccLogRun_(cfg, run, now);
  Logger.log("[74] Turn-in check for " + assignmentId + ": " + ev.files + " file(s); " +
    TCC_OUTCOMES.map(function (o) { return o + " " + ev.counts[o]; }).join(", ") + (ev.stopped ? " (stopped early)" : ""));
  return Object.assign({ success: true }, run);
}

// ---------------------------------------------------------------------------
// The panel's server functions (teacher only) and the editor function
// ---------------------------------------------------------------------------

// The ZIPs and exports to pick from, and the teacher's CAS assignments.
function getTurnInCanvasFiles() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    const listed = _tccListFiles_(cfg);
    return { success: true, folderName: listed.folderName, inTeacherFolder: !!cfg.teacherFolderId,
      zips: listed.zips, exports: listed.exports, assignments: _tipData_(cfg).assignments };
  } catch (e) {
    Logger.log("[74] getTurnInCanvasFiles failed: " + e.message);
    return _tipRefuse_("Couldn't list the files: " + e.message);
  }
}

// One export's assignment columns, and the one that best matches the CAS
// assignment's name.
function getTurnInCanvasColumns(exportId, assignmentId) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    const file = _tccListFiles_(cfg).files[String(exportId || "")];
    if (!file) return _tipRefuse_("That export isn't in the folder any more. Press Find files again.");
    const exp = tccParseExport_(file.getBlob().getDataAsString("UTF-8"));
    if (!exp.ok) return _tipRefuse_(exp.error);
    const name = (_tipData_(cfg).assignments.filter(function (a) { return a.id === assignmentId; })[0] || {}).name || "";
    return { success: true, hasPointsRow: exp.pointsRow !== -1,
      columns: exp.columns.map(function (c) { return { header: c.header, title: c.title, points: c.points }; }),
      preselect: tccBestColumn_(exp.columns, name, assignmentId) };
  } catch (e) {
    Logger.log("[74] getTurnInCanvasColumns failed: " + e.message);
    return _tipRefuse_("Couldn't read that export: " + e.message);
  }
}

// opts: { assignmentId, column, zipId, exportId, points? }. Both files must
// be among the ones the folder offers.
function runTurnInCanvasCheckFromPanel(opts) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    opts = opts || {};
    const files = _tccListFiles_(cfg).files;
    const zipFile = files[String(opts.zipId || "")], exportFile = files[String(opts.exportId || "")];
    if (!zipFile || !/\.zip$/i.test(String(zipFile.getName()))) return _tipRefuse_("Pick the submissions ZIP.");
    if (!exportFile || /\.zip$/i.test(String(exportFile.getName()))) return _tipRefuse_("Pick the gradebook export.");
    return _tccRun_(cfg, { assignmentId: opts.assignmentId, column: opts.column, points: opts.points,
      zipFile: zipFile, exportFile: exportFile });
  } catch (e) {
    Logger.log("[74] runTurnInCanvasCheckFromPanel failed: " + e.message);
    return _tipRefuse_("The check didn't finish: " + e.message);
  }
}

// From the editor: the newest ZIP and export in the folder, for the CAS
// assignment in the Script Property TURN_IN_CANVAS_ASSIGNMENT
// ("CAS-8177-L05"), the column in TURN_IN_CANVAS_COLUMN (else the best
// match), and TURN_IN_CANVAS_POINTS when the export has no Points Possible.
// Logs the counts and the two files' links; the report has the students.
function runTurnInCanvasCheck() {
  requireScriptOwner_();
  const cfg = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const assignmentId = String(props.getProperty("TURN_IN_CANVAS_ASSIGNMENT") || "").trim();
  const listed = _tccListFiles_(cfg);
  if (!listed.zips.length || !listed.exports.length) {
    const msg = "Put the submissions ZIP and a gradebook export in " + listed.folderName + " first.";
    Logger.log("[74] " + msg);
    return _tipRefuse_(msg);
  }
  const exportFile = listed.files[listed.exports[0].id];
  let column = String(props.getProperty("TURN_IN_CANVAS_COLUMN") || "").trim();
  if (!column) {
    const exp = tccParseExport_(exportFile.getBlob().getDataAsString("UTF-8"));
    const name = (_tipData_(cfg).assignments.filter(function (a) { return a.id === assignmentId.toUpperCase(); })[0] || {}).name;
    column = exp.ok ? tccBestColumn_(exp.columns, name, assignmentId) : "";
  }
  const res = _tccRun_(cfg, { assignmentId: assignmentId, column: column,
    points: props.getProperty("TURN_IN_CANVAS_POINTS"), zipFile: listed.files[listed.zips[0].id], exportFile: exportFile });
  if (!res.success) Logger.log("[74] " + res.error);
  else Logger.log("[74] Report: " + res.reportUrl + " Upload file: " + res.uploadUrl + ". Delete the ZIP when you're done.");
  return res;
}
