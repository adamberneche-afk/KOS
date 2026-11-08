// =============================================================================
// FILE: 73_TurnInTeacherPanel.js
// BOUND TO: Teacher Dashboard (standalone web app, cas-ccps:teacher-dashboard)
// TRIGGERS: none.
//
// PURPOSE: the turn-in code, stage 3, the teacher's side
// (meta/TURN_IN_CODE_PLAN_2026-11.md, D17). The server half of the Teacher
// Dashboard's "Turn-in codes" panel (its markup and client JS are in 07,
// beside the other panels):
//   - the review queue: answers whose check failed (CHECK_FAILED, from
//     Flow 6's retries in 72) and, when the teacher asks, answers the check
//     called NOT_YET, each with the student, the assignment, the milestone,
//     the student's answer and the check's reason. "Issue code" grants the
//     code with a required reason (How = GRANT, the reason in TurnInCodes):
//     the teacher's overrule of a verdict is exactly that. "Leave it"
//     changes nothing. There is no "issue all".
//   - the grant for one student and one assignment, with a required
//     reason, for exceptions and outages.
//   - the per-assignment overrides: the open ones, open one (reason
//     required, optional until date), close one (reason required).
// The Canvas check (the fourth part of the panel) is 74_TurnInCanvasCheck.js.
//
// REUSE: every write goes through 71's internals, the same ones the editor
// functions use: _turnInGrant_ (grantTurnInCode), _turnInOpenAssignment_
// (openTurnInForAssignment) and _turnInCloseAssignment_
// (closeTurnInForAssignment). Nothing here writes a tab itself.
//
// WHO CAN CALL: every public function here checks _isAuthorizedTeacher_()
// first and answers { success: false, error: "Not authorized." } to anyone
// else; none is on tools/gas-lint/webapp-public-allow.json. A grant or an
// overrule also checks that the Ledger row is this teacher's own student
// this school year (_turnInLedgerRow_ and TEACHER_EMAIL).
//
// THE SWITCH: TURN_IN_CODE_COURSES (courses and lessons, 71's
// turnInSwitchCovers_) decides what students see, not what the teacher can
// do. The panel works with it off: the grant is the escape hatch (decision
// 4). Its banner says when students don't see codes yet, and otherwise which
// courses and lessons they see them on, and any entry the setting ignored.
//
// Logs counts and ConfigIDs only: no student name, email or answer.
// =============================================================================

// TurnInChecks statuses the review queue lists (71's TURN_IN_CHECK_FAILED and
// TURN_IN_NOT_YET, written out: a top-level constant can't read another
// file's, whose load order isn't fixed).
const TIP_QUEUE_STATUSES = ["CHECK_FAILED", "NOT_YET"];

function _tipRefuse_(error) {
  return { success: false, error: String(error || "Something went wrong.") };
}

// This teacher's students this school year, from the Ledger: { rows: [row],
// byKey: { "<account>|<workspace ConfigID>": row } }. Archived and scheduled
// rows are left out (a code is for work a student can see).
function _tipRoster_(cfg, ss) {
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data = sheet && sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  const year = _currentSchoolYear_();
  const out = { rows: [], byKey: {} };
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) continue;
    const who = String(r[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
    const id = String(r[LEDGER.CONFIG_ID] || "").trim();
    const status = String(r[LEDGER.STATUS] || "").trim();
    if (!who || !id || status === "ARCHIVED" || status === "SCHEDULED" || !_isCurrentSchoolYearRow_(r, year)) continue;
    out.rows.push(r);
    out.byKey[who + "|" + id] = r;
  }
  return out;
}

// How the dashboard shows a student: the Ledger's name, period and course.
function _tipWho_(row) {
  return {
    key: String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase(),
    name: String(row[LEDGER.STUDENT_NAME] || "").trim() || "—",
    period: String(row[LEDGER.PERIOD] || "").trim(),
    course: ledgerRowCourseCode_(row),
  };
}

function _tipAssignmentName_(lessonCtx, assignmentId) {
  const lesson = lessonCtx.lessons[assignmentId];
  if (lesson) return lesson.name;
  const part = /^(.*)-P(\d+)$/i.exec(String(assignmentId || ""));
  if (part && lessonCtx.lessons[part[1]]) return lessonCtx.lessons[part[1]].name + ", part " + Number(part[2]);
  return assignmentId || "Unassigned";
}

function _tipWhen_(value) {
  const ms = sheetTimestampMs_(value);
  return ms ? Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), "MMM d, h:mm a") : "";
}

function _tipYmd_(value) {
  if (value instanceof Date || Object.prototype.toString.call(value) === "[object Date]") return _turnInYmd_(value);
  return String(value || "").trim();
}

// Everything the panel shows. now: for tests.
function _tipData_(cfg, now) {
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const roster = _tipRoster_(cfg, ss);
  const lessonCtx = _tdLessonContext_(ss);
  const cache = {};
  const assignmentOf = function (configId) { return turnInAssignmentId_(ss, configId, cache); };

  const codes = {};
  _turnInRows_(ss, TURN_IN_CODES_TAB, TURN_IN_CODE_HEADERS.length, cache).forEach(function (r) {
    codes[String(r[TCODE.GOOGLE_ID]).trim().toLowerCase() + "|" + String(r[TCODE.ASSIGNMENT_ID]).trim()] = r;
  });

  // The students, each with their assignments and any code.
  const students = {};
  roster.rows.forEach(function (r) {
    const who = _tipWho_(r);
    const configId = String(r[LEDGER.CONFIG_ID]).trim();
    const assignmentId = assignmentOf(configId);
    const code = codes[who.key + "|" + assignmentId];
    const s = students[who.key] = students[who.key] || Object.assign(who, { items: [] });
    s.items.push({ configId: configId, assignmentId: assignmentId,
      assignmentName: _tipAssignmentName_(lessonCtx, assignmentId),
      code: code ? String(code[TCODE.CODE]) : "", how: code ? String(code[TCODE.HOW]) : "" });
  });

  // The review queue: each student's latest answer for a workspace, when
  // its check failed or said not yet and they have no code for it.
  const latest = {};
  _turnInRows_(ss, TURN_IN_CHECKS_TAB, TURN_IN_CHECK_HEADERS.length, cache).forEach(function (r) {
    if (!String(r[TCHK.CHECK_ID]).trim()) return;
    latest[String(r[TCHK.GOOGLE_ID]).trim().toLowerCase() + "|" + String(r[TCHK.STUDENT_CONFIG_ID]).trim()] = r;
  });
  const queue = [];
  Object.keys(latest).forEach(function (key) {
    const c = latest[key];
    const status = String(c[TCHK.STATUS]).trim();
    if (TIP_QUEUE_STATUSES.indexOf(status) === -1) return;
    const row = roster.byKey[key];
    if (!row) return;
    const who = _tipWho_(row);
    const assignmentId = assignmentOf(String(row[LEDGER.CONFIG_ID]).trim());
    if (codes[who.key + "|" + assignmentId]) return;
    queue.push({
      checkId: String(c[TCHK.CHECK_ID]).trim(),
      key: who.key, name: who.name, period: who.period, course: who.course,
      assignmentId: assignmentId, assignmentName: _tipAssignmentName_(lessonCtx, assignmentId),
      milestone: String(c[TCHK.MILESTONE] || "").trim(),
      question: String(c[TCHK.QUESTION] || "").trim(),
      answer: String(c[TCHK.ANSWER] || "").trim(),
      status: status,
      reason: String(c[TCHK.REASON] || "").trim(),
      submittedAt: _tipWhen_(c[TCHK.SUBMITTED_AT]),
    });
  });
  queue.sort(function (a, b) {
    return (a.status === b.status ? 0 : a.status === "CHECK_FAILED" ? -1 : 1) || a.name.localeCompare(b.name);
  });

  // The open overrides (not closed, not past their until date).
  const today = _turnInYmd_(now ? new Date(now) : new Date());
  const overrides = _turnInRows_(ss, TURN_IN_OVERRIDES_TAB, TURN_IN_OVERRIDE_HEADERS.length, cache)
    .filter(function (r) {
      const until = _tipYmd_(r[TOVR.UNTIL]);
      return String(r[TOVR.KEY] || "").trim() && !String(r[TOVR.CLOSED_AT] || "").trim() && !(until && today > until);
    })
    .map(function (r) {
      const key = _turnInOverrideKey_(r[TOVR.KEY]);
      return { key: key, name: _tipAssignmentName_(lessonCtx, key), reason: String(r[TOVR.REASON] || "").trim(),
        openedAt: _tipWhen_(r[TOVR.OPENED_AT]), until: _tipYmd_(r[TOVR.UNTIL]) };
    });

  // The assignments the teacher's students are on, and their lessons (an
  // override on a lesson covers its parts).
  const assignments = {};
  Object.keys(students).forEach(function (k) {
    students[k].items.forEach(function (it) {
      if (!/^CAS-/i.test(it.assignmentId)) return;
      assignments[it.assignmentId] = it.assignmentName;
      const part = /^(.*)-P\d+$/i.exec(it.assignmentId);
      if (part) assignments[part[1]] = _tipAssignmentName_(lessonCtx, part[1]);
    });
  });

  // The banner: what the switch turns on, through 71's one reading of it.
  const raw = _turnInSwitchRaw_();
  const sw = turnInSwitchParse_(raw);
  return {
    studentsSeeCodes: !turnInOffEverywhere_(raw),
    switchValue: raw,
    switchOn: sw.all ? ["every course"] : Object.keys(sw.courses).sort().concat(sw.lessons),
    switchIgnored: sw.unknown.concat(sw.unlisted),
    queue: queue,
    students: Object.keys(students).map(function (k) { return students[k]; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); }),
    overrides: overrides,
    assignments: Object.keys(assignments).sort().map(function (id) { return { id: id, name: assignments[id] }; }),
  };
}

// ---------------------------------------------------------------------------
// The panel's server functions (google.script.run, teacher only)
// ---------------------------------------------------------------------------

function getTurnInPanelData() {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    return Object.assign({ success: true }, _tipData_(cfg));
  } catch (e) {
    Logger.log("[73] getTurnInPanelData failed: " + e.message);
    return _tipRefuse_("Couldn't load turn-in codes: " + e.message);
  }
}

// The grant for a Ledger row of this teacher's: the code (the one the
// student already has, if any) and whether it was new.
function _tipGrant_(cfg, row, reason) {
  _turnInGrantReason_(reason);
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const configId = String(row[LEDGER.CONFIG_ID]).trim();
  const have = _turnInCodeFor_(ss, String(row[LEDGER.GOOGLE_ID]).trim(), turnInAssignmentId_(ss, configId));
  if (have) return { success: true, code: String(have[TCODE.CODE]), already: true, how: String(have[TCODE.HOW]) };
  return { success: true, code: _turnInGrant_(cfg, row, reason), already: false, how: "GRANT" };
}

// The Ledger row for a student and workspace, when it is this teacher's.
function _tipOwnRow_(cfg, studentEmail, configId) {
  const row = _turnInLedgerRow_(cfg, studentEmail, configId);
  if (!row) return null;
  const teacher = String(cfg.teacherEmail || "").trim().toLowerCase();
  return String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase() === teacher ? row : null;
}

// "Issue code" on a review-queue answer: the teacher's grant (and overrule
// of the check), with a reason. The check row itself is left as it was.
function turnInPanelIssueForCheck(checkId, reason) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    _turnInGrantReason_(reason);
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const id = String(checkId || "").trim();
    const check = _turnInRows_(ss, TURN_IN_CHECKS_TAB, TURN_IN_CHECK_HEADERS.length).filter(function (r) {
      return id && String(r[TCHK.CHECK_ID]).trim() === id;
    })[0];
    if (!check) return _tipRefuse_("That answer isn't in the TurnInChecks tab any more. Refresh the panel.");
    const row = _tipOwnRow_(cfg, String(check[TCHK.GOOGLE_ID]), String(check[TCHK.STUDENT_CONFIG_ID]));
    if (!row) return _tipRefuse_("That answer isn't from one of your students this school year.");
    return _tipGrant_(cfg, row, reason);
  } catch (e) {
    Logger.log("[73] turnInPanelIssueForCheck failed: " + e.message);
    return _tipRefuse_(e.message);
  }
}

// "Give a code": one student, one of their assignments (the workspace
// ConfigID), with a reason.
function turnInPanelGrant(studentEmail, configId, reason) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    _turnInGrantReason_(reason);
    const row = _tipOwnRow_(cfg, studentEmail, configId);
    if (!row) return _tipRefuse_("That isn't one of your students' assignments this school year.");
    return _tipGrant_(cfg, row, reason);
  } catch (e) {
    Logger.log("[73] turnInPanelGrant failed for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return _tipRefuse_(e.message);
  }
}

// Whether an assignment key is one of this teacher's (or a lesson whose
// part is), so a typo can't open an assignment nobody is on.
function _tipKnownKey_(cfg, key) {
  const data = _tipData_(cfg);
  return data.assignments.some(function (a) { return turnInOverrideCovers_(key, a.id); });
}

function turnInPanelOpenAssignment(assignmentKey, reason, until) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    const key = _turnInOverrideKey_(assignmentKey);
    if (!key || !_tipKnownKey_(cfg, key)) return _tipRefuse_("Pick one of your assignments.");
    return Object.assign({ success: true }, _turnInOpenAssignment_(key, reason, until));
  } catch (e) {
    Logger.log("[73] turnInPanelOpenAssignment failed: " + e.message);
    return _tipRefuse_(e.message);
  }
}

function turnInPanelCloseAssignment(assignmentKey, reason) {
  const cfg = getConfig_();
  if (!_isAuthorizedTeacher_(cfg)) return _tipRefuse_("Not authorized.");
  try {
    return Object.assign({ success: true }, _turnInCloseAssignment_(assignmentKey, reason));
  } catch (e) {
    Logger.log("[73] turnInPanelCloseAssignment failed: " + e.message);
    return _tipRefuse_(e.message);
  }
}
