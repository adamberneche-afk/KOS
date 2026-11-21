// =============================================================================
// FILE: 00c_CentralLedgerShared.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// PURPOSE: The Central Ledger's share of what 00 held: helpers only its own scripts call (the run-slot claim, the warm-up text box, Canvas title matching, Studio full-list notes, a work file's snapshot text).
// Moved out of 00_SharedConfig.js on 2026-11-21 (structure audit 4.6): 00 is
// in all eight cas-ccps projects, and nothing outside this one calls these.
// Named 00c/00d/00e so it sits right after 00 and 00b; every reference to
// these is inside a function body, so load order does not matter.
// =============================================================================

// Claims a run slot: true, and the Script Property `key` set to now + ms,
// when no other run holds it; false when one does. The read and the write
// happen under the script lock, so two runs that start together can't both
// see the slot free (KOS Audit Docket IV, Low: the rollout's and the Ledger
// cycle's guards were a plain check-then-set). The lock is held only for
// that, not for the run: the jobs a run calls take their own locks. A run
// that can't get the lock in 5 seconds treats the slot as taken.
function claimRunSlot_(key, ms) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return false;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = Date.now();
    if (Number(props.getProperty(key) || 0) > now) return false;
    props.setProperty(key, String(now + ms));
    return true;
  } finally {
    lock.releaseLock();
  }
}

// The settings the Teacher Dashboard's ⚙ Settings panel changes (07's
// TD_SETTINGS, plus the marking period end dates). The Central Ledger's
// nightly signal names any of them set as a Script Property there (34c),
// since that would override the panel without it knowing.
const DASHBOARD_SETTING_KEYS = ["FEEDBACK_AS_COMMENT", "WARMUP_TEXT_BOX", "ROLLOUT_AUTO_APPLY",
  "REFLECTION_ON_SUBMIT", "PIVOT_ARCHETYPE_LOCK", "PARENT_REPORT_PREP", "MARKING_PERIOD_ENDS", "SCHEDULE_DAYS"];

// Whether a course's warm-ups are answered in a text box on the Student
// Dashboard instead of in a doc (WARMUP_TEXT_BOX, read like a pivot flag).
// On, Flow 3's harvest (41) writes the warm-up to the WarmUpTextBox tab and
// makes no doc; the dashboard (13) saves the answer and the extra-credit
// reply there; the nightly scoring (25) reads them from it. A warm-up keeps
// the form it was delivered in if the flag changes later.
function warmUpTextBoxFor_(courseName) {
  return pivotFlagFor_("WARMUP_TEXT_BOX", warmUpCourseCode_(courseName));
}

// The assignment columns of a Canvas gradebook export, by title: every
// header written "<title> (<Canvas ID>)", the title only (2026-11-19).
function canvasExportAssignmentTitles_(rows) {
  const header = (rows && rows[0]) || [];
  const out = [];
  header.forEach(function (h) {
    const m = /^(.*\S)\s*\((\d+)\)$/.exec(String(h || "").trim());
    if (m) out.push(m[1].trim());
  });
  return out;
}

// The words that identify a lesson's name: three letters or more, without
// the filler every title shares.
function _canvasTitleWords_(s) {
  return String(s || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(function (w) {
    return w.length >= 3 && ["the", "and", "for", "with", "lesson", "part", "cas", "your", "from"].indexOf(w) === -1;
  });
}

// The Canvas assignment title that is this lesson's, or "": a title that
// holds at least CANVAS_TITLE_MATCH of the lesson name's words (a teacher
// may shorten or prefix it: "L08 Market Research & Survey Design" for "Venue
// Market Research & Survey Design"), the most words first. Used by the rollout's check that
// a lesson is on Canvas before it opens (58).
const CANVAS_TITLE_MATCH = 0.6;

function canvasAssignmentFor_(titles, lessonName) {
  const want = _canvasTitleWords_(lessonName);
  if (!want.length) return "";
  let best = "", bestShare = 0;
  (titles || []).forEach(function (t) {
    const have = _canvasTitleWords_(t);
    const share = want.filter(function (w) { return have.indexOf(w) !== -1; }).length / want.length;
    if (share > bestShare) { best = t; bestShare = share; }
  });
  return bestShare >= CANVAS_TITLE_MATCH ? best : "";
}

function warmUpTextBoxSheet_(ss) {
  let sheet = ss.getSheetByName(getConfig_().tabs.warmUpTextBox);
  if (!sheet) {
    sheet = ss.insertSheet(getConfig_().tabs.warmUpTextBox);
    sheet.getRange(1, 1, 1, WTB_HEADERS.length).setValues([WTB_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.getRange("B:B").setNumberFormat("@"); // lesson_date stays YYYY-MM-DD text
  }
  return sheet;
}

// Headers fill themselves in on first use, archive_status's too if it's
// still blank, so the header row has no gap.
function stampWarmUpTiming_(wqSheet, sheetRow, col, when) {
  const later = WQ_HEADERS.slice(WQ.ARCHIVE_STATUS);
  const head = wqSheet.getRange(1, WQ.ARCHIVE_STATUS + 1, 1, later.length);
  const have = head.getValues()[0];
  if (have.some(function (h, i) { return String(h).trim() !== later[i]; })) {
    head.setValues([later.map(function (h, i) { return String(have[i] || "").trim() || h; })]);
  }
  const cell = wqSheet.getRange(sheetRow, col + 1);
  if (String(cell.getValue()).trim() === "" || col === WQ.ANSWERED_AT) cell.setValue(when);
}

// ---------------------------------------------------------------------------
// A Studio flow's key cell holding several rows' keys (2026-11-19). Studio's
// sheet starter can hand a run several changed rows, and a chip bound as a
// "Full list" then holds all of them: one Ask Gemini answer for several
// prompts, written back under a key like "WUQ-a, WUQ-b". The fix is in Studio:
// Ask Gemini and the write step inside a Repeat for each, each chip the
// looped row's own value. The harvests (41, 72) set such a return aside with
// FLOW_FULL_LIST_NOTE instead of retrying it as an unknown key, and 34c counts
// it. A key here (QueueID, CheckID) never has spaces, commas or brackets.
// Returns the keys found when there are two or more, else [].
// ---------------------------------------------------------------------------
const FLOW_FULL_LIST_NOTE = "FULL_LIST";

function flowKeyList_(value) {
  const t = String(value === null || value === undefined ? "" : value).trim();
  if (!/[\s,;"'\[\]]/.test(t)) return [];
  const keys = t.split(/[\s,;"'\[\]]+/).filter(Boolean);
  return keys.length > 1 ? keys : [];
}

// The note a harvest writes on such a return.
function flowFullListNote_(keys, what) {
  return FLOW_FULL_LIST_NOTE + ": one answer for " + keys.length + " " + what + "s (the flow bound a Full list). " +
    "In Studio, put Ask Gemini and its write step inside a Repeat for each, every chip the looped row's own value.";
}

// Where a work file's feedback and header line go: a form, deck or sheet copy's
// snapshot doc, or the file itself (a doc, or a copy whose snapshot isn't
// recorded).
function workFeedbackDocId_(ledgerSs, fileId) {
  try {
    const snap = formSnapshotFor_(ledgerSs, fileId);
    return snap ? snap.snapshotDocId : String(fileId || "").trim();
  } catch (e) {
    return String(fileId || "").trim();
  }
}

// The snapshot doc's fixed text (02 writes it, 13 rewrites between the
// response marker and the "[CONFIG_ID:" line, which every reader stops at).
const FORM_SNAPSHOT_NOT_SUBMITTED = "(Not submitted yet. Build your form, then press Submit for Feedback on your dashboard.)";

const SLIDES_SNAPSHOT_NOT_SUBMITTED = "(Not submitted yet. Make your slides, then press Submit for Feedback on your dashboard.)";

const SHEET_SNAPSHOT_NOT_SUBMITTED = "(Not submitted yet. Build your sheet, then press Submit for Feedback on your dashboard.)";

function workSnapshotNotSubmitted_(type) {
  return type === "slides" ? SLIDES_SNAPSHOT_NOT_SUBMITTED : type === "sheet" ? SHEET_SNAPSHOT_NOT_SUBMITTED
    : FORM_SNAPSHOT_NOT_SUBMITTED;
}

// Whether a snapshot zone's text is still the "not submitted" line, of any type.
function isWorkSnapshotNotSubmitted_(text) {
  const t = String(text || "").trim();
  return t === FORM_SNAPSHOT_NOT_SUBMITTED || t === SLIDES_SNAPSHOT_NOT_SUBMITTED || t === SHEET_SNAPSHOT_NOT_SUBMITTED;
}

function _ensureEvaluationResultColumns_(sheet) {
  const first = LEDGER.TURN_IN_SUGGESTED_SCORE + 1;
  const range = sheet.getRange(1, first, 1, LEDGER_LATER_HEADERS.length);
  const have = range.getValues()[0];
  if (have.every((h, i) => String(h).trim() === LEDGER_LATER_HEADERS[i])) return;
  range.setValues([LEDGER_LATER_HEADERS.map((h, i) => String(have[i] || "").trim() || h)]);
}
