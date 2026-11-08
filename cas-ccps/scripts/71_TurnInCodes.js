// =============================================================================
// FILE: 71_TurnInCodes.js
// BOUND TO: Student Dashboard (standalone web app), Central Ledger
//           spreadsheet and Teacher Dashboard (standalone web app)
//           (cas-ccps:student-dashboard, cas-ccps:central-ledger,
//           cas-ccps:teacher-dashboard)
// TRIGGERS: none.
//
// PURPOSE: the turn-in code, stage 1 (meta/TURN_IN_CODE_PLAN_2026-11.md, D17).
// Once feedback has arrived, a card on the Student Dashboard asks one
// question built from the student's own feedback. The answer is screened
// here, in Apps Script, at once; an answer that passes waits as
// PENDING_CHECK in the TurnInChecks tab for the Studio flow's verdict (stage
// 2, Flow 6: 72_TurnInCheckFlow.js materializes it, harvests the verdict and
// retries). applyTurnInVerdict_() applies that verdict: ADDRESSES issues the
// student's code for the assignment, NOT_YET stores the one-line reason the
// student sees. A check that never answers becomes CHECK_FAILED
// (markTurnInCheckFailed_, from 72's retry): no code, and the student can
// send the answer again. A failed or missing verdict never issues a code,
// and the screen alone never does. The teacher's grant (grantTurnInCode
// from the editor, or the Teacher Dashboard's Turn-in codes panel, 73) is
// the one way around the check, with its reason logged.
//
// THE STUDENT SIDE is in 71b_TurnInStudent.js (split out 2026-11-08): the
// card's view, getMyTurnInState, submitTurnInAnswer, turnInAttach_ and the
// client half. This file is also in the Teacher Dashboard project, whose
// public functions must all be teacher-only, so it declares no function a
// student calls.
//
// THE SWITCH: TURN_IN_CODE_COURSES (Script Property or the Ledger's _CONFIG
// tab, SHARED_CONFIG_KEYS in 00). Blank or "off" (the default) is off
// everywhere; "all" alone is every course. Otherwise a list, comma- or
// space-separated, of course codes ("8177") and lessons, named the way the
// cartridge builder's --turn-in selector names them: the assignment ID
// StudentAssignments records ("CAS-8177-THE-HYPE-MACHINE", "CAS-8175-L05";
// case doesn't matter, "CAS-" is optional). A lesson covers its parts
// ("CAS-8175-L05-P2"). So "8175, CAS-8177-THE-HYPE-MACHINE" is every 8175
// card and that one 8177 lesson. The pilot puts the same list here as in
// `build-canvas-cartridge.js --turn-in <list> --print`, so the question
// shows only on cards whose Canvas assignment takes a code. An entry that is
// neither (a typo, "all" inside a list) is logged and ignored, and a lesson
// the lesson data doesn't know is logged and matches nothing: an unknown
// entry never turns codes on more widely. The key keeps its name (2026-11-08)
// so the _CONFIG row, the preflight line and the docs stay one switch; a
// second key would leave two values to reconcile. turnInSwitchCovers_() is
// the one reading of it: the card's question and the student functions
// (71b), the flow's materializer (72) and the panel's banner (73) all go
// through it. Off, the dashboard is exactly as before: no field is added to
// its data, nothing is read or written here, and the student functions
// answer OFF.
//
// THE TERM RULE (decision 6): a code is issued only while the assignment is
// in the current term. A Ledger row's term is its AcademicYear column when
// that is a marking period ("2627_MP2"; 02 and 52 stamp currentTerm_() when
// the row is made). A row with no marking period there (blank, or an older
// school-year value like "2026-27") takes the marking period its Timestamp
// falls in, by the same MARKING_PERIOD_ENDS table (currentTerm_(timestamp)).
// The row is in the current term when that marking period equals
// currentTerm_() today. A row with neither, or a currentTerm_() that is not
// a marking period (summer, a CURRENT_TERM set to another year), is not in
// the current term. Outside it, a code comes only from the teacher: an
// override that opens the whole assignment (openTurnInForAssignment, below),
// then the usual check, or the per-student grant.
//
// THE CODE: CAS-<course>-L<lesson>-XXXX-XXXC. Course: the Ledger row's
// course code (ledgerRowCourseCode_), else the one in the assignment's
// ConfigID, else 0000. Lesson: the lesson's number in its course, two digits
// (three past 99): the "L<n>" of a numbered ConfigID ("CAS-8175-L05",
// "CAS-8175-L05-P2"), else the lesson's place in its course's LESSON_ORDER
// (55b, the teaching order LessonSchedule is seeded in), so an 8177 slug
// ("CAS-8177-THE-HYPE-MACHINE") reads L12, not L00. A part has its lesson's
// number. L00 only when neither gives one (a unit assignment, or a project
// without 55b), and that is logged. Every project that issues a code loads
// 55b: the Central Ledger (the verdict) and the Teacher Dashboard (the
// grant); the Student Dashboard issues none (tests pin both). The number is
// a label: a code is checked by looking it up in TurnInCodes, never by
// matching its number to the ConfigID, so a code issued before 2026-11-08
// with L00 stays valid and nothing needs migrating. Then seven
// random characters from Crockford's base32 alphabet (0-9 and A-Z without
// I, L, O, U, so nothing reads as 1 or 0), from Utilities.getUuid(), and a
// check character at the end. The check character is Luhn mod N with N = 32
// over the course digits, the lesson digits and the seven random characters,
// each read as its place in the alphabet: it catches any one mistyped
// character and most swaps of two neighbours. turnInCodeValid_() reads a
// typed code back (case-insensitive; O read as 0, I and L as 1 in the random
// part). One code per student per assignment, stable across resubmissions,
// unique in TurnInCodes.
//
// WHO CAN DO WHAT: the student functions (71b) take the student from the
// session, act only on a Ledger row whose GoogleID is the caller, and return
// only that student's own question, state and code
// (tools/gas-lint/webapp-public-allow.json). grantTurnInCode(),
// openTurnInForAssignment() and closeTurnInForAssignment() call
// requireScriptOwner_(); the Teacher Dashboard panel (73) reaches the same
// internals (_turnInGrant_, _turnInOpenAssignment_, _turnInCloseAssignment_)
// behind _isAuthorizedTeacher_(). Everything else is private.
//
// WHERE THE WORDS GO: the answer is kept in TurnInChecks (Ledger), not in
// ReflectionLog. ReflectionLog rows count as Submits when the next
// reflection questions are chosen (chooseReflectionQuestions_), and 37 and
// 29 read them; an answer there would change both. TurnInCodes holds the
// code, its owner and how it was issued, and no student text.
//
// The client half (TURN_IN_CLIENT_CSS, turnInClientJs_(), in 71b) is pasted
// into the Student Dashboard page by 13. Its render function,
// turnInCardHtml(a), takes only the card's data (a.turnIn) and calls no
// server, so a demo page can render it from fixture data.
// =============================================================================

const TURN_IN_SWITCH_KEY = "TURN_IN_CODE_COURSES";
const TURN_IN_CODES_TAB = "TurnInCodes";
const TURN_IN_CHECKS_TAB = "TurnInChecks";

// The column maps. Each tab is written only here; stage 2's materializer and
// harvest read these same constants (FLOW_DOCTRINE 7: one map per sheet).
const TURN_IN_CODE_HEADERS = ["Code", "GoogleID", "AssignmentID", "StudentConfigID", "Course", "Lesson",
  "IssuedAt", "How", "GrantReason"];
const TCODE = { CODE: 0, GOOGLE_ID: 1, ASSIGNMENT_ID: 2, STUDENT_CONFIG_ID: 3, COURSE: 4, LESSON: 5,
  ISSUED_AT: 6, HOW: 7, GRANT_REASON: 8 };
const TURN_IN_CHECK_HEADERS = ["CheckID", "SubmittedAt", "GoogleID", "StudentConfigID", "StudentFileID",
  "AssignmentID", "Course", "Kind", "Milestone", "Question", "Answer", "Status", "Reason", "DecidedAt"];
const TCHK = { CHECK_ID: 0, SUBMITTED_AT: 1, GOOGLE_ID: 2, STUDENT_CONFIG_ID: 3, FILE_ID: 4,
  ASSIGNMENT_ID: 5, COURSE: 6, KIND: 7, MILESTONE: 8, QUESTION: 9, ANSWER: 10, STATUS: 11, REASON: 12,
  DECIDED_AT: 13 };

// A check's Status: waiting for the flow's verdict, then the verdict, or
// CHECK_FAILED when the flow never gave one (72's retries ran out). A failed
// check issues nothing; it waits for the teacher (stage 3's review queue
// reads these rows) and the student can send the answer again.
const TURN_IN_PENDING = "PENDING_CHECK";
const TURN_IN_ADDRESSES = "ADDRESSES";
const TURN_IN_NOT_YET = "NOT_YET";
const TURN_IN_CHECK_FAILED = "CHECK_FAILED";

// The screen. An answer at least half of whose 4-word runs appear in the
// feedback line or the question is mostly pasted back. Counted on the
// answer's own 4-word runs, so quoting the milestone inside a real answer
// stays well under it.
const TURN_IN_NGRAM = 4;
const TURN_IN_PASTE_MAX_SHARE = 0.5;
const TURN_IN_ANSWER_MAX = 2000;
const TURN_IN_REASON_MAX = 300;
const TURN_IN_GRANT_REASON_MIN = 3;

// Crockford's base32 alphabet: no I, L, O or U.
const TURN_IN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TURN_IN_RANDOM_CHARS = 7;
const TURN_IN_CODE_RE = /^CAS-(\d{4})-L(\d{2,3})-([0-9A-Z]{4})-([0-9A-Z]{4})$/;

// What the student reads for each answer the server turns down.
const TURN_IN_REASONS = {
  OFF: "Turn-in codes aren't on for this class.",
  NO_USER: "Sign into your school Google account and refresh this page.",
  NOT_REGISTERED: "This assignment isn't open for you. Ask your teacher.",
  NO_FEEDBACK: "Your feedback isn't ready yet. Check back after it comes.",
  TERM_CLOSED: "This marking period has ended, so this page can't give a code for it. Ask your teacher.",
  ALREADY_CHECKING: "Your answer is already being checked. Refresh in a few minutes.",
  HAS_CODE: "You already have a code for this assignment.",
  SHORT: null, // worded with the number of words
  TOO_LONG: "That's longer than this needs. Keep it to a few sentences.",
  PASTED: "Most of your answer repeats the feedback or the question. Say it in your own words: what you will do, and where.",
  SYSTEM_TEXT: null, // worded with the text found
  SERVER_ERROR: "Something went wrong on the system's side. Your answer wasn't saved. Try again in a minute."
};

function _turnInReason_(code, extra) {
  if (code === "SHORT") return "Write at least " + REFLECTION_MIN_WORDS + " words, in your own words.";
  if (code === "SYSTEM_TEXT") return "Your answer has text copied from a feedback block: " + (extra || "[SYSTEM:") +
    ". Take it out and send it again.";
  return TURN_IN_REASONS[code] || TURN_IN_REASONS.SERVER_ERROR;
}

function _turnInRefuse_(code, extra) {
  return { ok: false, error: code, reason: _turnInReason_(code, extra) };
}

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

// The raw switch value, "" when unset or unreadable.
function _turnInSwitchRaw_() {
  try {
    const raw = _resolveConfigValues_().values[TURN_IN_SWITCH_KEY];
    return String(raw === undefined || raw === null ? "" : raw).trim();
  } catch (e) {
    return "";
  }
}

// The last value parsed, so a dashboard load with many cards parses (and
// logs) it once.
let _turnInSwitchMemo_ = null;

// The switch, read: { all, courses: { "8177": true }, lessons: ["CAS-…"],
// unknown: [entries ignored], unlisted: [lessons the lesson data doesn't
// have] }. See the header for the syntax.
function turnInSwitchParse_(raw) {
  const value = String(raw === undefined || raw === null ? "" : raw).trim();
  if (_turnInSwitchMemo_ && _turnInSwitchMemo_.raw === value) return _turnInSwitchMemo_.parsed;
  const out = { all: false, courses: {}, lessons: [], unknown: [], unlisted: [] };
  const lower = value.toLowerCase();
  if (lower === "all") {
    out.all = true;
  } else if (lower !== "" && lower !== "off") {
    value.split(/[\s,]+/).filter(Boolean).forEach(function (t) {
      const u = t.toUpperCase().replace(/^CAS-/, "");
      if (/^\d{4}$/.test(u)) { out.courses[u] = true; return; }
      if (/^\d{4}-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(u)) {
        const id = "CAS-" + u;
        if (out.lessons.indexOf(id) === -1) out.lessons.push(id);
        return;
      }
      out.unknown.push(t);
    });
  }
  const known = _turnInKnownLessons_();
  if (known) out.unlisted = out.lessons.filter(function (id) { return !known[id]; });
  if (out.unknown.length) {
    Logger.log("[71] " + TURN_IN_SWITCH_KEY + ": ignored " + out.unknown.join(", ") +
      " (not a course code or a lesson ID; \"all\" and \"off\" work only alone)");
  }
  if (out.unlisted.length) {
    Logger.log("[71] " + TURN_IN_SWITCH_KEY + ": no lesson " + out.unlisted.join(", ") +
      " in the lesson data; it matches nothing");
  }
  _turnInSwitchMemo_ = { raw: value, parsed: out };
  return out;
}

// { "CAS-8175-L05": true, "CAS-8175-L05-P2": true, … } from 55b, or null in
// a project without it (the Student Dashboard).
function _turnInKnownLessons_() {
  if (typeof LESSON_ASSIGNMENTS === "undefined") return null;
  const out = {};
  Object.keys(LESSON_ASSIGNMENTS).forEach(function (k) { out["CAS-" + k.toUpperCase()] = true; });
  if (typeof LESSON_PARTS !== "undefined") {
    Object.keys(LESSON_PARTS).forEach(function (k) {
      (LESSON_PARTS[k] || []).forEach(function (p) { out["CAS-" + String(p.key).toUpperCase()] = true; });
    });
  }
  return out;
}

// Whether the switch is off for every course and lesson: then nothing here
// runs. A value whose every entry is ignored is off too.
function turnInOffEverywhere_(raw) {
  const p = turnInSwitchParse_(raw === undefined ? _turnInSwitchRaw_() : raw);
  return !p.all && !Object.keys(p.courses).length && !p.lessons.length;
}

// THE reading of the switch: whether turn-in codes are on for an assignment
// of this course (a course code, "8177") with this assignment ID (the one
// StudentAssignments records, turnInAssignmentId_). On when the value is
// "all", lists the course, or lists the lesson or the lesson this part
// belongs to.
function turnInSwitchCovers_(courseCode, assignmentId, raw) {
  const p = turnInSwitchParse_(raw === undefined ? _turnInSwitchRaw_() : raw);
  if (p.all) return true;
  const course = String(courseCode === undefined || courseCode === null ? "" : courseCode).trim();
  if (course && p.courses[course]) return true;
  return p.lessons.some(function (id) { return turnInOverrideCovers_(id, assignmentId); });
}

// The switch for a Ledger row: its course, and the assignment its workspace
// belongs to.
function turnInSwitchCoversRow_(ss, row, raw, cache) {
  const assignmentId = turnInAssignmentId_(ss, String(row[LEDGER.CONFIG_ID] || "").trim(), cache);
  return turnInSwitchCovers_(ledgerRowCourseCode_(row), assignmentId, raw);
}

// ---------------------------------------------------------------------------
// The question, from the student's own feedback
// ---------------------------------------------------------------------------

// The latest check's milestones for one student file, from
// CompetencyEvidence (read by header, as 13's _dashNotYet_ and 00's
// reflectionShortfall_ read it): { primary, notYet }. primary is the first
// row of the latest check (Flow 2 writes them in milestone order, primary
// first); notYet is the first one not MET, the same text as the card's
// "Not yet:" line. Each is the milestone as the student reads it, or the
// competency's title. "" when there is no check on file.
function turnInMilestones_(ss, cfg, fileId, cache) {
  const out = { primary: "", notYet: "" };
  const rows = _turnInRead_(cache, "evidence", function () {
    const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence");
    return sheet && sheet.getLastRow() >= 2 ? sheet.getDataRange().getValues() : [];
  });
  if (rows.length < 2) return out;
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"), iText = h.indexOf("milestone_text"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iOut === -1 || iAt === -1) return out;
  const mine = rows.slice(1).filter(function (r) {
    return String(r[iFile]).trim() === fileId && (iArch === -1 || !String(r[iArch]).trim());
  });
  if (!mine.length) return out;
  const latest = Math.max.apply(null, mine.map(function (r) { return sheetTimestampMs_(r[iAt]) || 0; }));
  const last = mine.filter(function (r) { return (sheetTimestampMs_(r[iAt]) || 0) === latest; });
  let names = null;
  const textOf = function (r) {
    if (!r) return "";
    let text = iText === -1 ? "" : reflectionCriterionText_(r[iText]);
    if (!text && iComp !== -1) {
      if (!names) names = getCompetencyTextMap_(ss.getSheetByName(cfg.tabs.competencyRegistry || "CompetencyRegistry"));
      text = names[String(r[iComp]).trim()] || "";
    }
    return text;
  };
  out.primary = textOf(last[0]);
  out.notYet = textOf(last.filter(function (r) { return String(r[iOut]).trim().toUpperCase() !== "MET"; })[0]);
  return out;
}

// What the feedback says, from the Ledger row's LastResult: "NOT_YET"
// (Revise), "PASSED", or "" (no feedback yet).
function turnInFeedbackKind_(row) {
  const last = String(row[LEDGER.LAST_RESULT] || "").trim();
  if (last === "NEEDS_REVISION") return "NOT_YET";
  if (last === "PASSED") return "PASSED";
  return "";
}

// The one question (decision 5: one question, not a stack of them).
function turnInQuestion_(kind, milestone) {
  const m = String(milestone || "").trim();
  if (!m) return "";
  if (kind === "NOT_YET") {
    return "Your feedback says Not yet: “" + m + "”. What will you change, and where in your document?";
  }
  if (kind === "PASSED") {
    return "Your feedback says you showed “" + m + "”. Point to the part of your work that shows it, and say why it does.";
  }
  return "";
}

// { kind, milestone, question } for a Ledger row, or null when there is no
// feedback to ask about.
function turnInPrompt_(ss, cfg, row, cache) {
  const kind = turnInFeedbackKind_(row);
  if (!kind) return null;
  const m = turnInMilestones_(ss, cfg, String(row[LEDGER.FILE_ID] || "").trim(), cache);
  const milestone = kind === "NOT_YET" ? (m.notYet || m.primary) : m.primary;
  const question = turnInQuestion_(kind, milestone);
  return question ? { kind: kind, milestone: milestone, question: question } : null;
}

// ---------------------------------------------------------------------------
// The screen: instant, no AI
// ---------------------------------------------------------------------------

function _turnInWords_(s) {
  return String(s || "").toLowerCase().replace(/[’']/g, "").split(/[^a-z0-9]+/).filter(Boolean);
}

function _turnInGrams_(words) {
  const out = [];
  for (let i = 0; i + TURN_IN_NGRAM <= words.length; i++) out.push(words.slice(i, i + TURN_IN_NGRAM).join(" "));
  return out;
}

// The share (0 to 1) of the answer's 4-word runs found in the reference text.
function turnInPastedShare_(answer, reference) {
  const grams = _turnInGrams_(_turnInWords_(answer));
  if (!grams.length) return 0;
  const ref = {};
  _turnInGrams_(_turnInWords_(reference)).forEach(function (g) { ref[g] = true; });
  return grams.filter(function (g) { return ref[g]; }).length / grams.length;
}

// { ok: true } or { ok: false, error, reason }. prompt: { milestone, question }.
function turnInScreen_(text, prompt) {
  const t = String(text === undefined || text === null ? "" : text).trim();
  if (t.length > TURN_IN_ANSWER_MAX) return _turnInRefuse_("TOO_LONG");
  if (reflectionWordCount_(t) < REFLECTION_MIN_WORDS) return _turnInRefuse_("SHORT");
  const found = findSystemText_(t);
  if (found) return _turnInRefuse_("SYSTEM_TEXT", found);
  const reference = [prompt && prompt.question, prompt && prompt.milestone, "Not yet"].join(" \n ");
  if (turnInPastedShare_(t, reference) >= TURN_IN_PASTE_MAX_SHARE) return _turnInRefuse_("PASTED");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The term rule (see the header)
// ---------------------------------------------------------------------------

function turnInRowTerm_(row) {
  const t = String(row[LEDGER.ACADEMIC_YEAR] || "").trim().toUpperCase();
  if (MP_TERM_RE_.test(t)) return t;
  const ms = sheetTimestampMs_(row[LEDGER.TIMESTAMP]);
  if (!ms) return "";
  const byDate = String(currentTerm_(new Date(ms)) || "").trim().toUpperCase();
  return MP_TERM_RE_.test(byDate) ? byDate : "";
}

function turnInInCurrentTerm_(row, now) {
  const current = String(currentTerm_(now) || "").trim().toUpperCase();
  if (!MP_TERM_RE_.test(current)) return false;
  return turnInRowTerm_(row) === current;
}

// ---------------------------------------------------------------------------
// The teacher's override for one assignment (the operator, 2026-11-08)
// ---------------------------------------------------------------------------
// A row made in one marking period and answered in the next (or a lesson
// that ran across the boundary) fails the term rule. The teacher can open
// one assignment for every student on it, from the editor:
//   openTurnInForAssignment("CAS-8177-L05", "why", "2026-12-18")
//   closeTurnInForAssignment("CAS-8177-L05", "why")
// The key is the assignment's ConfigID as StudentAssignments records it
// (54: "CAS-8177-L05"), the same for every section and every student, so
// one call covers the whole lesson. A lesson's key also covers its parts
// ("CAS-8177-L05-P2"). A row with no StudentAssignments entry is its own
// assignment: its key is the student's workspace ConfigID. until is a date
// (yyyy-MM-dd or a Date), open through that day in New York; blank is open
// until closed. Each open or close is a TurnInOverrides row (a close fills
// in every open row for the key). The override only widens the term rule:
// the screen, the check and the verdict are unchanged, and no code is
// issued by opening one. The per-student grant stays.

const TURN_IN_OVERRIDES_TAB = "TurnInOverrides";
const TURN_IN_OVERRIDE_HEADERS = ["AssignmentKey", "OpenedBy", "OpenedAt", "Reason", "Until", "ClosedAt",
  "ClosedReason"];
const TOVR = { KEY: 0, OPENED_BY: 1, OPENED_AT: 2, REASON: 3, UNTIL: 4, CLOSED_AT: 5, CLOSED_REASON: 6 };

function _turnInOverrideKey_(key) {
  return String(key === undefined || key === null ? "" : key).trim().toUpperCase();
}

// Whether an override for `key` covers this assignment ID.
function turnInOverrideCovers_(key, assignmentId) {
  const k = _turnInOverrideKey_(key);
  const a = _turnInOverrideKey_(assignmentId);
  if (!k || !a) return false;
  return a === k || new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-P\\d+$").test(a);
}

function _turnInYmd_(d) {
  return Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd");
}

// An open override row covering the assignment, or null.
function _turnInOpenOverride_(ss, assignmentId, now, cache) {
  const today = _turnInYmd_(now ? new Date(now) : new Date());
  return _turnInRows_(ss, TURN_IN_OVERRIDES_TAB, TURN_IN_OVERRIDE_HEADERS.length, cache).filter(function (r) {
    if (String(r[TOVR.CLOSED_AT] || "").trim()) return false;
    const until = String(r[TOVR.UNTIL] || "").trim();
    if (until && today > until) return false;
    return turnInOverrideCovers_(r[TOVR.KEY], assignmentId);
  })[0] || null;
}

// The term rule with the teacher's override: the row's marking period is
// current, or an open override covers its assignment.
function turnInTermOpen_(ss, row, now, cache) {
  if (turnInInCurrentTerm_(row, now)) return true;
  const assignmentId = turnInAssignmentId_(ss, String(row[LEDGER.CONFIG_ID] || "").trim(), cache);
  return !!_turnInOpenOverride_(ss, assignmentId, now, cache);
}

function _turnInOverrideUntil_(until) {
  if (until === undefined || until === null || String(until).trim() === "") return "";
  let ymd = "";
  if (until instanceof Date || Object.prototype.toString.call(until) === "[object Date]") {
    if (isNaN(until.getTime())) throw new Error("until isn't a date.");
    ymd = _turnInYmd_(until);
  } else {
    ymd = String(until).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || isNaN(new Date(ymd + "T12:00:00").getTime())) {
      throw new Error("until must be a date like 2026-12-18, or blank.");
    }
  }
  if (ymd < _turnInYmd_(new Date())) throw new Error("until is in the past.");
  return ymd;
}

// From the editor. Opens one assignment for turn-in codes outside its
// marking period, for every student on it. Returns { key, until }.
function openTurnInForAssignment(assignmentKey, reason, until) {
  requireScriptOwner_();
  return _turnInOpenAssignment_(assignmentKey, reason, until);
}

// The open, for the editor function above and the Teacher Dashboard's panel
// (73, behind _isAuthorizedTeacher_). OpenedBy is the account the script
// runs as: the teacher, from either.
function _turnInOpenAssignment_(assignmentKey, reason, until) {
  const key = _turnInOverrideKey_(assignmentKey);
  if (!key) throw new Error("Name the assignment, e.g. CAS-8177-L05.");
  const why = String(reason === undefined || reason === null ? "" : reason).trim();
  if (why.length < TURN_IN_GRANT_REASON_MIN) throw new Error("Opening an assignment needs a reason.");
  const ymd = _turnInOverrideUntil_(until);
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = _turnInSheet_(ss, TURN_IN_OVERRIDES_TAB, TURN_IN_OVERRIDE_HEADERS);
    const out = new Array(TURN_IN_OVERRIDE_HEADERS.length).fill("");
    out[TOVR.KEY] = key;
    out[TOVR.OPENED_BY] = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase();
    out[TOVR.OPENED_AT] = new Date().toISOString();
    out[TOVR.REASON] = sheetSafeText_(why);
    out[TOVR.UNTIL] = ymd;
    const at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, 1, TURN_IN_OVERRIDE_HEADERS.length).setNumberFormat("@");
    sheet.getRange(at, 1, 1, TURN_IN_OVERRIDE_HEADERS.length).setValues([out]);
  } finally {
    lock.releaseLock();
  }
  Logger.log("[71] Turn-in codes opened for " + key + (ymd ? " until " + ymd : " until closed") +
    " (reason recorded in " + TURN_IN_OVERRIDES_TAB + ")");
  return { key: key, until: ymd };
}

// From the editor. Closes every open override for the key. Returns
// { key, closed: n }.
function closeTurnInForAssignment(assignmentKey, reason) {
  requireScriptOwner_();
  return _turnInCloseAssignment_(assignmentKey, reason);
}

function _turnInCloseAssignment_(assignmentKey, reason) {
  const key = _turnInOverrideKey_(assignmentKey);
  if (!key) throw new Error("Name the assignment, e.g. CAS-8177-L05.");
  const why = String(reason === undefined || reason === null ? "" : reason).trim();
  if (why.length < TURN_IN_GRANT_REASON_MIN) throw new Error("Closing an assignment needs a reason.");
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let closed = 0;
  try {
    const sheet = ss.getSheetByName(TURN_IN_OVERRIDES_TAB);
    const rows = _turnInRows_(ss, TURN_IN_OVERRIDES_TAB, TURN_IN_OVERRIDE_HEADERS.length);
    rows.forEach(function (r, i) {
      if (_turnInOverrideKey_(r[TOVR.KEY]) !== key || String(r[TOVR.CLOSED_AT] || "").trim()) return;
      sheet.getRange(i + 2, TOVR.CLOSED_AT + 1).setValue(new Date().toISOString());
      sheet.getRange(i + 2, TOVR.CLOSED_REASON + 1).setNumberFormat("@").setValue(sheetSafeText_(why));
      closed++;
    });
  } finally {
    lock.releaseLock();
  }
  Logger.log("[71] Turn-in codes closed for " + key + ": " + closed + " override(s)");
  return { key: key, closed: closed };
}

// ---------------------------------------------------------------------------
// The code
// ---------------------------------------------------------------------------

function _turnInLuhnSum_(chars, startFactor) {
  const n = TURN_IN_ALPHABET.length;
  let factor = startFactor, sum = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    let addend = factor * TURN_IN_ALPHABET.indexOf(chars.charAt(i));
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / n) + (addend % n);
    sum += addend;
  }
  return sum;
}

// Luhn mod 32: the character that makes the whole run check out.
function turnInCheckChar_(payload) {
  const n = TURN_IN_ALPHABET.length;
  return TURN_IN_ALPHABET.charAt((n - (_turnInLuhnSum_(payload, 2) % n)) % n);
}

function _turnInCourseOf_(row, assignmentId) {
  const fromRow = row ? ledgerRowCourseCode_(row) : "";
  if (/^\d{4}$/.test(fromRow)) return fromRow;
  const m = /^CAS-(\d{4})-/i.exec(String(assignmentId || ""));
  return m ? m[1] : "0000";
}

// The lesson's number for the code, two digits (three past 99), or "00"
// when it has none (see the header).
function turnInLessonOf_(assignmentId) {
  const id = String(assignmentId || "").trim().toUpperCase();
  const m = /^CAS-\d{4}-L(\d{1,3})(-P\d+)?$/.exec(id);
  const n = m ? Number(m[1]) : _turnInLessonPosition_(id);
  return n > 0 && n <= 999 ? String(n).padStart(2, "0") : "00";
}

// The lesson's place (1-based) in its course's LESSON_ORDER (55b), the
// lesson itself or the one a part belongs to; 0 when it isn't there or the
// project has no 55b.
function _turnInLessonPosition_(id) {
  if (typeof LESSON_ORDER === "undefined") return 0;
  const m = /^CAS-(\d{4})-(.+)$/.exec(id);
  if (!m) return 0;
  const order = (LESSON_ORDER[m[1]] || []).map(function (k) { return String(k).toUpperCase(); });
  const at = function (key) { return order.indexOf(key) + 1; };
  return at(m[1] + "-" + m[2]) || at(m[1] + "-" + m[2].replace(/-P\d+$/, ""));
}

// Seven characters from 36 random bits of a UUID (its first nine hex digits
// are random in a version-4 UUID). 2^36 is a multiple of 32^7, so every
// string is equally likely.
function _turnInRandomPart_() {
  let n = parseInt(String(Utilities.getUuid()).replace(/-/g, "").slice(0, 9), 16);
  let s = "";
  for (let i = 0; i < TURN_IN_RANDOM_CHARS; i++) {
    s += TURN_IN_ALPHABET.charAt(n % 32);
    n = Math.floor(n / 32);
  }
  return s;
}

function turnInMakeCode_(course, lesson, random) {
  const payload = course + lesson + random;
  const tail = random + turnInCheckChar_(payload);
  return "CAS-" + course + "-L" + lesson + "-" + tail.slice(0, 4) + "-" + tail.slice(4);
}

// A typed code, made canonical, or "" when it isn't a well-formed code with
// a matching check character.
function turnInCodeValid_(typed) {
  const m = TURN_IN_CODE_RE.exec(String(typed || "").trim().toUpperCase());
  if (!m) return "";
  const tail = (m[3] + m[4]).replace(/O/g, "0").replace(/[IL]/g, "1");
  for (let i = 0; i < tail.length; i++) if (TURN_IN_ALPHABET.indexOf(tail.charAt(i)) === -1) return "";
  if (_turnInLuhnSum_(m[1] + m[2] + tail, 1) % TURN_IN_ALPHABET.length !== 0) return "";
  return "CAS-" + m[1] + "-L" + m[2] + "-" + tail.slice(0, 4) + "-" + tail.slice(4);
}

// ---------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------

function _turnInSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _turnInRows_(ss, name, width, cache) {
  return _turnInRead_(cache, name + ":" + width, function () {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  });
}

// One read of a tab per dashboard load: turnInAttach_ passes a cache object
// for all its cards; every other caller passes none and reads fresh.
function _turnInRead_(cache, key, read) {
  if (!cache) return read();
  if (!Object.prototype.hasOwnProperty.call(cache, key)) cache[key] = read();
  return cache[key];
}

// The student's code row for an assignment, or null.
function _turnInCodeFor_(ss, googleId, assignmentId, cache) {
  const who = String(googleId || "").trim().toLowerCase();
  return _turnInRows_(ss, TURN_IN_CODES_TAB, TURN_IN_CODE_HEADERS.length, cache).filter(function (r) {
    return String(r[TCODE.GOOGLE_ID]).trim().toLowerCase() === who &&
           String(r[TCODE.ASSIGNMENT_ID]).trim() === assignmentId;
  })[0] || null;
}

// The student's latest check row for this workspace, or null.
function _turnInLatestCheck_(ss, googleId, studentConfigId, cache) {
  const who = String(googleId || "").trim().toLowerCase();
  const mine = _turnInRows_(ss, TURN_IN_CHECKS_TAB, TURN_IN_CHECK_HEADERS.length, cache).filter(function (r) {
    return String(r[TCHK.GOOGLE_ID]).trim().toLowerCase() === who &&
           String(r[TCHK.STUDENT_CONFIG_ID]).trim() === studentConfigId;
  });
  return mine.length ? mine[mine.length - 1] : null;
}

// The assignment a student workspace belongs to (54's StudentAssignments),
// or the workspace's own ConfigID when it isn't recorded.
function turnInAssignmentId_(ss, studentConfigId, cache) {
  let out = studentConfigId;
  _turnInRows_(ss, "StudentAssignments", 3, cache).forEach(function (r) {
    if (String(r[0] || "").trim() === studentConfigId && String(r[2] || "").trim()) out = String(r[2]).trim();
  });
  return out;
}

// Issues (or returns) the one code for this student and assignment. Under
// the script lock, so two calls can't both make one. how: "CHECK" or
// "GRANT". Returns the code.
function _turnInIssueCode_(ss, row, how, grantReason) {
  const googleId = String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
  const studentConfigId = String(row[LEDGER.CONFIG_ID] || "").trim();
  const assignmentId = turnInAssignmentId_(ss, studentConfigId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const have = _turnInCodeFor_(ss, googleId, assignmentId);
    if (have) return String(have[TCODE.CODE]);
    const course = _turnInCourseOf_(row, assignmentId);
    const lesson = turnInLessonOf_(assignmentId);
    if (lesson === "00") {
      Logger.log("[71] No lesson number for " + assignmentId + " (no L<n> in it, and not in LESSON_ORDER): " +
        "its code reads L00");
    }
    const taken = {};
    _turnInRows_(ss, TURN_IN_CODES_TAB, 1).forEach(function (r) { taken[String(r[0]).trim()] = true; });
    let code = "";
    for (let tries = 0; tries < 20 && (!code || taken[code]); tries++) {
      code = turnInMakeCode_(course, lesson, _turnInRandomPart_());
    }
    if (!code || taken[code]) throw new Error("Couldn't make a unique turn-in code.");
    const sheet = _turnInSheet_(ss, TURN_IN_CODES_TAB, TURN_IN_CODE_HEADERS);
    const at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, 1, TURN_IN_CODE_HEADERS.length).setNumberFormat("@");
    const out = new Array(TURN_IN_CODE_HEADERS.length).fill("");
    out[TCODE.CODE] = code;
    out[TCODE.GOOGLE_ID] = googleId;
    out[TCODE.ASSIGNMENT_ID] = assignmentId;
    out[TCODE.STUDENT_CONFIG_ID] = studentConfigId;
    out[TCODE.COURSE] = course;
    out[TCODE.LESSON] = "L" + lesson;
    out[TCODE.ISSUED_AT] = new Date().toISOString();
    out[TCODE.HOW] = how;
    out[TCODE.GRANT_REASON] = how === "GRANT" ? sheetSafeText_(String(grantReason || "").trim()) : "";
    sheet.getRange(at, 1, 1, TURN_IN_CODE_HEADERS.length).setValues([out]);
    return code;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Applying the flow's verdict (stage 2's harvest calls this; stage 1 tests it)
// ---------------------------------------------------------------------------

// verdict: "ADDRESSES" or "NOT_YET"; reason: the flow's one line. Only a
// PENDING_CHECK row takes a verdict. ADDRESSES issues the code while the
// assignment is in the current term; past it the row says ADDRESSES and
// only the teacher's grant issues one. NOT_YET stores the reason for the
// student. Anything else (a failed or empty run) changes nothing and issues
// nothing. Returns { ok, status, code?, issued?, error? }.
function applyTurnInVerdict_(checkId, verdict, reason, now) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const v = String(verdict || "").trim().toUpperCase();
  if (v !== TURN_IN_ADDRESSES && v !== TURN_IN_NOT_YET) return { ok: false, error: "BAD_VERDICT" };
  const sheet = ss.getSheetByName(TURN_IN_CHECKS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, error: "NO_CHECK" };
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TURN_IN_CHECK_HEADERS.length).getValues();
  const i = rows.findIndex(function (r) { return String(r[TCHK.CHECK_ID]).trim() === String(checkId || "").trim(); });
  if (i === -1) return { ok: false, error: "NO_CHECK" };
  const check = rows[i];
  if (String(check[TCHK.STATUS]).trim() !== TURN_IN_PENDING) return { ok: false, error: "ALREADY_DECIDED" };
  const sheetRow = i + 2;
  const why = sheetSafeText_(neutralizeSystemText_(String(reason || "").trim()).slice(0, TURN_IN_REASON_MAX));
  sheet.getRange(sheetRow, TCHK.STATUS + 1).setValue(v);
  sheet.getRange(sheetRow, TCHK.REASON + 1).setNumberFormat("@").setValue(why);
  sheet.getRange(sheetRow, TCHK.DECIDED_AT + 1).setValue(new Date().toISOString());
  if (v === TURN_IN_NOT_YET) return { ok: true, status: v };

  const row = _turnInLedgerRow_(cfg, String(check[TCHK.GOOGLE_ID]), String(check[TCHK.STUDENT_CONFIG_ID]));
  if (!row) return { ok: true, status: v, issued: false, error: "NOT_REGISTERED" };
  if (!turnInTermOpen_(ss, row, now)) return { ok: true, status: v, issued: false, error: "TERM_CLOSED" };
  return { ok: true, status: v, issued: true, code: _turnInIssueCode_(ss, row, "CHECK", "") };
}

// A PENDING_CHECK row the flow never answered (72's retries ran out) becomes
// CHECK_FAILED, with why in Reason (the system's words, not the student's).
// It issues nothing, ever: the operator's rule that a broken check never
// issues a code. Returns { ok } or { ok: false, error }.
function markTurnInCheckFailed_(checkId, why) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(TURN_IN_CHECKS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return { ok: false, error: "NO_CHECK" };
  const ids = sheet.getRange(2, TCHK.CHECK_ID + 1, sheet.getLastRow() - 1, 1).getValues();
  const i = ids.findIndex(function (r) { return String(r[0]).trim() === String(checkId || "").trim(); });
  if (i === -1) return { ok: false, error: "NO_CHECK" };
  const sheetRow = i + 2;
  if (String(sheet.getRange(sheetRow, TCHK.STATUS + 1).getValue()).trim() !== TURN_IN_PENDING) {
    return { ok: false, error: "ALREADY_DECIDED" };
  }
  sheet.getRange(sheetRow, TCHK.STATUS + 1).setValue(TURN_IN_CHECK_FAILED);
  sheet.getRange(sheetRow, TCHK.REASON + 1).setNumberFormat("@")
    .setValue(sheetSafeText_(String(why || "").slice(0, TURN_IN_REASON_MAX)));
  sheet.getRange(sheetRow, TCHK.DECIDED_AT + 1).setValue(new Date().toISOString());
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The teacher's grant (the editor, or the Teacher Dashboard's panel, 73)
// ---------------------------------------------------------------------------

// From the editor: grantTurnInCode("student@…", "<their workspace ConfigID>",
// "why"). The only way around the check; works after the term too. The
// reason is required and kept in the code's row. Returns the code (the
// student's existing one, if they have one).
function grantTurnInCode(studentEmail, configId, reason) {
  requireScriptOwner_();
  _turnInGrantReason_(reason);
  const cfg = getConfig_();
  const row = _turnInLedgerRow_(cfg, studentEmail, configId);
  if (!row) throw new Error("No Ledger row for that student and ConfigID.");
  return _turnInGrant_(cfg, row, reason);
}

// The reason, trimmed, or an error when it is too short to say anything.
function _turnInGrantReason_(reason) {
  const why = String(reason === undefined || reason === null ? "" : reason).trim();
  if (why.length < TURN_IN_GRANT_REASON_MIN) throw new Error("A turn-in code grant needs a reason.");
  return why;
}

// The grant itself, for a Ledger row the caller has already found and
// checked: grantTurnInCode() above, and the Teacher Dashboard's panel (73),
// which also checks the row is the teacher's own student. Issues (or
// returns) the code with How = GRANT and the reason. The switch and the term
// rule don't apply: the grant is the escape hatch.
function _turnInGrant_(cfg, row, reason) {
  const why = _turnInGrantReason_(reason);
  const code = _turnInIssueCode_(SpreadsheetApp.openById(cfg.ledgerSsId), row, "GRANT", why);
  Logger.log("[71] Turn-in code granted for ConfigID " + String(row[LEDGER.CONFIG_ID]).trim() +
    " (reason recorded in " + TURN_IN_CODES_TAB + ")");
  return code;
}

// ---------------------------------------------------------------------------
// The Ledger row (the student functions in 71b and the teacher's grant)
// ---------------------------------------------------------------------------

// The student's own Ledger row for a workspace ConfigID, this school year,
// open to them (not ARCHIVED or SCHEDULED), or null.
function _turnInLedgerRow_(cfg, googleId, configId) {
  const who = String(googleId || "").trim().toLowerCase();
  const id = String(configId || "").trim();
  if (!who || !id) return null;
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const year = _currentSchoolYear_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[LEDGER.GOOGLE_ID]).trim().toLowerCase() !== who || String(r[LEDGER.CONFIG_ID]).trim() !== id) continue;
    const status = String(r[LEDGER.STATUS]).trim();
    if (status === "ARCHIVED" || status === "SCHEDULED" || !_isCurrentSchoolYearRow_(r, year)) continue;
    return r;
  }
  return null;
}
