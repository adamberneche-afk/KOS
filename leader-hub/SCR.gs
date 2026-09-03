/**
 * LeaderHub — SCR grading scores (server-migration Phase 6)
 *
 * Unlike every row-shaped domain in Data.gs, `scrScores` is a sparse
 * course × period × student × competency matrix that can span thousands
 * of cells and is edited one cell at a time, very fast, during a live
 * grading pass (setScore() fires on every grid click,
 * leader-hub/src/09-wbl-lessonplans-procurement-finance-esports.html). A
 * whole-blob Script Property (Config.gs's model) can't hold it past a few
 * dozen cells before hitting the ~9KB per-property limit, and a
 * wholesale-tab-rewrite (Data.gs's model) would mean rewriting the entire
 * gradebook on every single click — both infeasible and a far bigger
 * blast radius than the one cell that actually changed. This file
 * instead keeps one real Spreadsheet row per (Course, Period, StudentKey,
 * CompetencyNum) cell in long format, in the same private "LeaderHub
 * Data" Spreadsheet Data.gs already creates (_getLhDataSpreadsheet_()),
 * upserted by that composite key rather than rewritten wholesale.
 *
 * CONFLICT MODEL — deliberately simpler than Data.gs's whole-domain
 * compare-and-swap: last-write-wins PER CELL, not per whole gradebook. A
 * cell is the natural unit of a grade; two devices/tabs racing to set the
 * exact same (course, period, student, competency) cell at the literal
 * same moment is the only real collision, and "the most recent write wins
 * that one cell" is the same behavior editing the same Google Sheet cell
 * from two tabs would already give — not a compromise specific to this
 * migration, just this domain's natural granularity.
 *
 * Client side queues each change and flushes a batch after a short pause
 * in clicking rather than one round trip per click — see
 * _lhQueueScrScoreSync_()/_lhFlushScrScoreSync_() in
 * leader-hub/src/09-wbl-lessonplans-procurement-finance-esports.html.
 */

const SCR_SCORES_TAB = 'scr_scores';
const SCR_SCORES_HEADERS = ['Course', 'Period', 'StudentKey', 'CompetencyNum', 'Score', 'UpdatedAt'];
const SCR_COL = { COURSE: 0, PERIOD: 1, STUDENT_KEY: 2, COMP_NUM: 3, SCORE: 4, UPDATED_AT: 5 };

// Only the SAVE path creates the tab — GET must be able to tell "never
// synced from this deployment yet" (no tab at all) apart from "synced,
// but every cell has since been cleared" (a real, empty tab), the same
// found:false/found:true distinction Data.gs's lhPullData_ makes. Getting
// this wrong would mean a fresh deployment's first-ever pull sees an
// empty result and wipes out a teacher's real, already-graded local
// scores before they've ever synced once — exactly the kind of
// first-sync data-loss bug the migration plan's safety section warns
// about.
function _getScrScoresSheetForSave_() {
  const ss = _getLhDataSpreadsheet_(); // Data.gs
  let sheet = ss.getSheetByName(SCR_SCORES_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(SCR_SCORES_TAB);
    sheet.appendRow(SCR_SCORES_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _scrRowKey_(row) {
  return row[SCR_COL.COURSE] + '\u0001' + row[SCR_COL.PERIOD] + '\u0001' + row[SCR_COL.STUDENT_KEY] + '\u0001' + row[SCR_COL.COMP_NUM];
}

/**
 * Upserts a batch of {course, period, studentKey, compNum, score} changes.
 * A `score` of 0 or null (setScore()'s own "no evidence yet" convention,
 * not "an evidence level of zero") deletes that cell's row entirely rather
 * than storing a zero — same convention the client already keeps for
 * scrScores itself. Wrapped in a script lock so two overlapping flushes
 * (two browser tabs, say) can't interleave their read-modify-write of the
 * same sheet and corrupt the row index they're each working from.
 */
function lhSaveScrScores_(changes) {
  if (!Array.isArray(changes) || !changes.length) return { ok: true, saved: 0 };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _getScrScoresSheetForSave_();
    const data = sheet.getDataRange().getValues();
    const rowByKey = {};
    for (let i = 1; i < data.length; i++) {
      rowByKey[_scrRowKey_(data[i])] = i + 1; // 1-based sheet row
    }

    const now = new Date();
    const toDelete = [];
    changes.forEach(function (c) {
      const key = c.course + '\u0001' + c.period + '\u0001' + c.studentKey + '\u0001' + c.compNum;
      const existingRow = rowByKey[key];
      const hasScore = c.score !== null && c.score !== undefined && c.score !== 0;
      if (!hasScore) {
        if (existingRow) toDelete.push(existingRow);
        return;
      }
      if (existingRow) {
        sheet.getRange(existingRow, SCR_COL.SCORE + 1).setValue(c.score);
        sheet.getRange(existingRow, SCR_COL.UPDATED_AT + 1).setValue(now);
      } else {
        sheet.appendRow([c.course, c.period, c.studentKey, c.compNum, c.score, now]);
        rowByKey[key] = sheet.getLastRow(); // so a later change in this same batch to the same cell finds it
      }
    });
    // Bottom-up so an earlier deletion never shifts a later row's index
    // out from under it.
    toDelete.sort(function (a, b) { return b - a; }).forEach(function (rowNum) { sheet.deleteRow(rowNum); });

    return { ok: true, saved: changes.length };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Returns every scored cell, reshaped into the same
 * {course:{period:{studentKey:{compNum:score}}}} nested object the client
 * already keeps as `scrScores` in memory — so applying a pull is one
 * assignment, not a client-side reshape. found:false (no `scores` key at
 * all) means this deployment has never had a score pushed to it yet;
 * found:true with an empty `scores` object means it has, and every cell
 * has since been cleared — callers must tell these apart, never treat
 * found:false the same as "confirmed empty."
 */
function lhGetScrScores_() {
  const ss = _getLhDataSpreadsheet_(); // Data.gs
  const sheet = ss.getSheetByName(SCR_SCORES_TAB);
  if (!sheet) return { ok: true, found: false };

  const data = sheet.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const course = row[SCR_COL.COURSE];
    const period = row[SCR_COL.PERIOD];
    const studentKey = row[SCR_COL.STUDENT_KEY];
    const compNum = row[SCR_COL.COMP_NUM];
    if (!out[course]) out[course] = {};
    if (!out[course][period]) out[course][period] = {};
    if (!out[course][period][studentKey]) out[course][period][studentKey] = {};
    out[course][period][studentKey][compNum] = row[SCR_COL.SCORE];
  }
  return { ok: true, found: true, scores: out };
}
