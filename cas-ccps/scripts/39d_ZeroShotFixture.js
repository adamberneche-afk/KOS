// =============================================================================
// FILE: 39d_ZeroShotFixture.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// PURPOSE: The zero-shot test: sends each lesson's cold answer (39c) through Flow 2 and records the result.
// TRIGGERS: none. Run from the editor:
//
//   installZeroShotFixture(count)   the next `count` lessons (default 10, at
//                                   most 25) as Flow 2 fixture rows, READY
//   checkZeroShotFixture()          records each answered row in the
//                                   ZeroShotResults tab and logs the tally
//   removeFlow2Fixture()            (39) clears the rows and scratch docs;
//                                   ZeroShotResults stays
//
// THE ZERO-SHOT TEST (2026-11-20, the operator's go): which lessons can a
// student pass by pasting the whole assignment into a chatbot? Each lesson's
// cold answer (39c, written from the student-facing prompt alone, never the
// rubric) goes through Flow 2 against that whole lesson's milestones and
// definition of done, as a fixture row like 39's. A lesson whose cold answer
// is APPROVED, or whose first goal comes back MET, measures pasting as much
// as learning; the lesson report (69c) shows it beside the lesson's numbers.
//
// One Studio run per lesson. Run it a batch at a time (the default 10) and
// check between batches; a lesson already in ZeroShotResults or waiting in
// FlowInput is skipped, so installZeroShotFixture() again picks up where the
// last batch left off. To test a lesson again, delete its ZeroShotResults row.
//
// The rows carry fixture competency IDs (FIXTURE-COMP-Z1…4), never the
// lesson's own, so the harvest's evidence and the Ledger's real records
// never count them. Lesson keys, outcomes and stamps only.
// =============================================================================

const ZS_CONFIG_PREFIX = "Z";       // ConfigIDs VDOE-FIXTURE-Z<n>
const ZS_REF_BASE = 300;            // StagingRowRefs FIXTURE-301, FIXTURE-302, …
const ZS_DEFAULT_BATCH = 10;
const ZS_MAX_BATCH = 25;
const ZS_RESULTS_TAB = "ZeroShotResults";
const ZS_HEADERS = ["LessonKey", "Course", "CheckedAt", "M1", "M2", "M3", "M4", "Stamp",
  "FirstGoalMet", "AllMet", "FilePart"];
const ZS = { KEY: 0, COURSE: 1, CHECKED_AT: 2, M1: 3, STAMP: 7, FIRST_MET: 8, ALL_MET: 9, FILE_PART: 10 };

// The lessons with a cold answer, in a fixed order: n in Z<n> is the index + 1.
function zeroShotKeys_() {
  if (typeof ZERO_SHOT_ANSWERS !== "object" || typeof LESSON_ASSIGNMENTS !== "object") return [];
  return Object.keys(ZERO_SHOT_ANSWERS).filter(function (k) { return !!LESSON_ASSIGNMENTS[k]; }).sort();
}

// The work-file type of a lesson's first part that isn't a doc ("form",
// "slides", "sheet"), or "": a pasted answer can't make that file, so the
// lesson's whole-lesson result is read with it in mind.
function zeroShotFilePart_(key) {
  const parts = (typeof LESSON_PARTS === "object" && LESSON_PARTS[key]) || [];
  const p = parts.filter(function (q) { return q && q.workFileNow && q.workFileNow !== "doc"; })[0];
  return p ? String(p.workFileNow) : "";
}

function _zsSpec_(key, n) {
  const a = LESSON_ASSIGNMENTS[key];
  return {
    ref: "FIXTURE-" + (ZS_REF_BASE + n), configSuffix: ZS_CONFIG_PREFIX + n,
    docTitle: "[FIXTURE] Zero-shot: " + a.unitName,
    unitName: a.unitName, tier: a.tier, persona: a.persona,
    milestones: a.milestones.slice(0, 4), dod: a.definitionOfDone,
    compPrefix: "FIXTURE-COMP-Z", response: ZERO_SHOT_ANSWERS[key],
  };
}

function _zsN_(configId) {
  const m = new RegExp("^" + FX_CONFIG_PREFIX + ZS_CONFIG_PREFIX + "(\\d+)$").exec(String(configId).trim());
  return m ? Number(m[1]) : 0;
}

function _zsResultsSheet_(ss) {
  let sh = ss.getSheetByName(ZS_RESULTS_TAB);
  if (!sh) {
    sh = ss.insertSheet(ZS_RESULTS_TAB);
    sh.appendRow(ZS_HEADERS);
  }
  return sh;
}

function _zsFlowInput_(ss, cfg) {
  return ss.getSheetByName(TABS.flowInput) || _fiEnsureTab_(ss, cfg);
}

/** The lesson keys already in ZeroShotResults. */
function zeroShotResultKeys_(ss) {
  const sh = ss.getSheetByName(ZS_RESULTS_TAB);
  if (!sh || sh.getLastRow() < 2) return {};
  const out = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
    const k = String(r[0]).trim();
    if (k) out[k] = true;
  });
  return out;
}

function installZeroShotFixture(count) {
  const n = Math.max(1, Math.min(ZS_MAX_BATCH, Math.floor(Number(count) || ZS_DEFAULT_BATCH)));
  const keys = zeroShotKeys_();
  if (!keys.length) {
    Logger.log("[ZeroShot] No cold answers loaded (39c_ZeroShotAnswers.js or 55b missing from this project).");
    return { seeded: 0, left: 0 };
  }
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = _zsFlowInput_(ss, cfg);
  const done = zeroShotResultKeys_(ss);
  const waiting = {};
  (sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues().slice(1) : []).forEach(function (r) {
    const i = _zsN_(r[FI.CONFIG_ID]);
    if (i) waiting[keys[i - 1]] = true;
  });
  const todo = keys.filter(function (k) { return !done[k] && !waiting[k]; });
  const batch = todo.slice(0, n);
  if (!batch.length) {
    Logger.log("[ZeroShot] Nothing to send: " + Object.keys(done).length + " lesson(s) have results, " +
      Object.keys(waiting).length + " are waiting for Studio. checkZeroShotFixture() records the waiting ones.");
    return { seeded: 0, left: 0, waiting: Object.keys(waiting).length };
  }
  const made = batch.map(function (k) { return _fxFlow2FixtureRow_(_zsSpec_(k, keys.indexOf(k) + 1)); });
  const width = Math.max(sheet.getLastColumn(), made[0].row.length);
  const rows = made.map(function (m) {
    const r = m.row.slice();
    while (r.length < width) r.push("");
    return r;
  });
  const first = sheet.getLastRow() + 1;
  sheet.getRange(first, 1, rows.length, width).setValues(rows);
  SpreadsheetApp.flush();
  const left = todo.length - batch.length;
  Logger.log("[ZeroShot] Sent " + batch.length + " lesson(s) to Flow 2 (FlowInput rows " + first + "–" +
    (first + rows.length - 1) + ", " + batch.length + " Studio runs): " + batch.join(", ") + ".");
  Logger.log("[ZeroShot] " + left + " lesson(s) left after this batch. Wait for Studio (a few minutes), " +
    "then checkZeroShotFixture(); then installZeroShotFixture() for the next batch.");
  return { seeded: batch.length, left: left, first: first, keys: batch };
}

/**
 * Records each answered zero-shot row in ZeroShotResults (one row per
 * lesson, replaced if it is there) and logs the tally so far. Rows still
 * waiting are counted. Read-only on FlowInput.
 */
function checkZeroShotFixture() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const keys = zeroShotKeys_();
  const sheet = _zsFlowInput_(ss, cfg);
  const data = sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues().slice(1) : [];
  const res = _zsResultsSheet_(ss);
  const have = res.getLastRow() >= 2 ? res.getRange(2, 1, res.getLastRow() - 1, ZS_HEADERS.length).getValues() : [];
  const rowOf = {};
  have.forEach(function (r, i) { rowOf[String(r[ZS.KEY]).trim()] = i + 2; });
  let recorded = 0, waiting = 0;
  data.forEach(function (r) {
    const n = _zsN_(r[FI.CONFIG_ID]);
    if (!n) return;
    const key = keys[n - 1];
    if (!key || String(r[FI.UNIT_NAME]).trim() !== String(LESSON_ASSIGNMENTS[key].unitName).trim()) {
      Logger.log("[ZeroShot] Row for Z" + n + " doesn't match its lesson (the answers changed since it was sent); skipped. " +
        "removeFlow2Fixture() clears it.");
      return;
    }
    const out = String(r[FI.GEMINI_FULL_OUTPUT] || "");
    if (!out.trim()) { waiting++; return; }
    const line = zeroShotResultRow_(key, out, new Date());
    if (rowOf[key]) res.getRange(rowOf[key], 1, 1, line.length).setValues([line]);
    else { res.appendRow(line); rowOf[key] = res.getLastRow(); }
    recorded++;
  });
  const all = res.getLastRow() >= 2 ? res.getRange(2, 1, res.getLastRow() - 1, ZS_HEADERS.length).getValues() : [];
  const t = zeroShotTally_(all);
  Logger.log("[ZeroShot] Recorded " + recorded + " answered row(s); " + waiting + " still waiting for Studio.");
  Logger.log("[ZeroShot] So far " + t.lessons + " of " + keys.length + " lessons: the cold answer was APPROVED in " +
    t.approved + ", its first goal MET in " + t.firstMet + ", every goal MET in " + t.allMet + ".");
  if (t.approvedKeys.length) Logger.log("[ZeroShot] Approved cold: " + t.approvedKeys.join(", ") + ".");
  if (t.lessons < keys.length && !waiting) Logger.log("[ZeroShot] Next: installZeroShotFixture() for the next batch.");
  if (t.lessons >= keys.length) Logger.log("[ZeroShot] Every lesson has a result. removeFlow2Fixture() clears the rows; the lesson report (69c) reads ZeroShotResults.");
  return { recorded: recorded, waiting: waiting, tally: t };
}

// One ZeroShotResults row from Flow 2's answer.
function zeroShotResultRow_(key, output, when) {
  const o = _parseFlow2MilestoneOutcomes_(output) || {};
  const stamp = scanCompliance_(output);
  const ms = ["1", "2", "3", "4"].map(function (k) { return o[k] || ""; });
  const firstMet = ms[0] === "MET";
  const allMet = ms.every(function (v) { return v === "MET"; });
  return [key, String(LESSON_ASSIGNMENTS[key].code || key.split("-")[0]), when].concat(ms)
    .concat([stamp, firstMet ? "YES" : "NO", allMet ? "YES" : "NO", zeroShotFilePart_(key)]);
}

// Counts over ZeroShotResults rows.
function zeroShotTally_(rows) {
  const t = { lessons: 0, approved: 0, firstMet: 0, allMet: 0, approvedKeys: [] };
  rows.forEach(function (r) {
    const k = String(r[ZS.KEY]).trim();
    if (!k) return;
    t.lessons++;
    if (String(r[ZS.STAMP]) === "APPROVED") { t.approved++; t.approvedKeys.push(k); }
    if (String(r[ZS.FIRST_MET]) === "YES") t.firstMet++;
    if (String(r[ZS.ALL_MET]) === "YES") t.allMet++;
  });
  return t;
}

/** ZeroShotResults as { lessonKey: { stamp, firstMet, allMet, filePart, checkedAt } } (69c). */
function zeroShotByLesson_(ss) {
  const sh = ss.getSheetByName(ZS_RESULTS_TAB);
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, ZS_HEADERS.length).getValues().forEach(function (r) {
    const k = String(r[ZS.KEY]).trim();
    if (!k) return;
    out[k] = { stamp: String(r[ZS.STAMP]), firstMet: String(r[ZS.FIRST_MET]) === "YES",
      allMet: String(r[ZS.ALL_MET]) === "YES", filePart: String(r[ZS.FILE_PART] || ""), checkedAt: r[ZS.CHECKED_AT] };
  });
  return out;
}
