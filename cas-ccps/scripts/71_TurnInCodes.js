// =============================================================================
// FILE: 71_TurnInCodes.js
// BOUND TO: Student Dashboard (standalone web app) and Central Ledger
//           spreadsheet (cas-ccps:student-dashboard, cas-ccps:central-ledger)
// TRIGGERS: none.
//
// PURPOSE: the turn-in code, stage 1 (meta/TURN_IN_CODE_PLAN_2026-11.md, D17).
// Once feedback has arrived, a card on the Student Dashboard asks one
// question built from the student's own feedback. The answer is screened
// here, in Apps Script, at once; an answer that passes waits as
// PENDING_CHECK in the TurnInChecks tab for the Studio flow's verdict (stage
// 2). applyTurnInVerdict_() applies that verdict: ADDRESSES issues the
// student's code for the assignment, NOT_YET stores the one-line reason the
// student sees. A failed or missing verdict never issues a code, and the
// screen alone never does. The teacher's grant (grantTurnInCode, editor
// only) is the one way around the check, with its reason logged.
//
// THE SWITCH: TURN_IN_CODE_COURSES (Script Property or the Ledger's _CONFIG
// tab, SHARED_CONFIG_KEYS in 00), read like a pivot flag: blank or "off"
// (the default) is off everywhere, a course code ("8177") or a list
// ("8175,8177") turns it on for those, "all" for every course. Off, the
// dashboard is exactly as before: no field is added to its data, nothing is
// read or written here, and the student functions answer OFF.
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
// the current term. Outside it, only the teacher's grant issues a code.
//
// THE CODE: CAS-<course>-L<lesson>-XXXX-XXXC. Course: the Ledger row's
// course code (ledgerRowCourseCode_), else the one in the assignment's
// ConfigID, else 0000. Lesson: the "L<n>" in the assignment's ConfigID
// ("CAS-8177-L05", "CAS-8177-L05-P2"), two digits, else L00. Then seven
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
// WHO CAN DO WHAT: the student functions (getMyTurnInState,
// submitTurnInAnswer) take the student from the session, act only on a
// Ledger row whose GoogleID is the caller, and return only that student's
// own question, state and code (tools/gas-lint/webapp-public-allow.json).
// grantTurnInCode() calls requireScriptOwner_(). Everything else is private.
//
// WHERE THE WORDS GO: the answer is kept in TurnInChecks (Ledger), not in
// ReflectionLog. ReflectionLog rows count as Submits when the next
// reflection questions are chosen (chooseReflectionQuestions_), and 37 and
// 29 read them; an answer there would change both. TurnInCodes holds the
// code, its owner and how it was issued, and no student text.
//
// The client half (TURN_IN_CLIENT_CSS, turnInClientJs_()) is pasted into the
// Student Dashboard page by 13. Its render function, turnInCardHtml(a),
// takes only the card's data (a.turnIn) and calls no server, so a demo page
// can render it from fixture data.
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

// A check's Status: waiting for the flow's verdict, then the verdict.
const TURN_IN_PENDING = "PENDING_CHECK";
const TURN_IN_ADDRESSES = "ADDRESSES";
const TURN_IN_NOT_YET = "NOT_YET";

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

// Whether the switch is off for every course: then nothing here runs.
function turnInOffEverywhere_(raw) {
  const v = String(raw === undefined ? _turnInSwitchRaw_() : raw).trim().toLowerCase();
  return v === "" || v === "off";
}

function turnInOnForCourse_(courseCode, raw) {
  return _pivotValueOn_(raw === undefined ? _turnInSwitchRaw_() : raw, courseCode);
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

function turnInLessonOf_(assignmentId) {
  const m = /-L(\d{1,3})(?=-|$)/i.exec(String(assignmentId || "").trim());
  return m ? String(Number(m[1])).padStart(2, "0") : "00";
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
  if (!turnInInCurrentTerm_(row, now)) return { ok: true, status: v, issued: false, error: "TERM_CLOSED" };
  return { ok: true, status: v, issued: true, code: _turnInIssueCode_(ss, row, "CHECK", "") };
}

// ---------------------------------------------------------------------------
// The teacher's grant (stage 3 adds the dashboard's button)
// ---------------------------------------------------------------------------

// From the editor: grantTurnInCode("student@…", "<their workspace ConfigID>",
// "why"). The only way around the check; works after the term too. The
// reason is required and kept in the code's row. Returns the code (the
// student's existing one, if they have one).
function grantTurnInCode(studentEmail, configId, reason) {
  requireScriptOwner_();
  const why = String(reason === undefined || reason === null ? "" : reason).trim();
  if (why.length < TURN_IN_GRANT_REASON_MIN) throw new Error("A turn-in code grant needs a reason.");
  const cfg = getConfig_();
  const row = _turnInLedgerRow_(cfg, studentEmail, configId);
  if (!row) throw new Error("No Ledger row for that student and ConfigID.");
  const code = _turnInIssueCode_(SpreadsheetApp.openById(cfg.ledgerSsId), row, "GRANT", why);
  Logger.log("[71] Turn-in code granted for ConfigID " + String(configId).trim() + " (reason recorded in " +
    TURN_IN_CODES_TAB + ")");
  return code;
}

// ---------------------------------------------------------------------------
// The student's side (google.script.run from the Student Dashboard)
// ---------------------------------------------------------------------------

// The caller's own Ledger row for a workspace ConfigID, this school year,
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

// What the card shows for one assignment, or null for nothing:
//   { state: "READY", code }               the code, with Copy
//   { state: "PENDING_CHECK" }             "Checking your answer…"
//   { state: "NOT_YET", reason, question } the reason, and the form again
//   { state: "ANSWER", question }          the form
//   { state: "TERM_CLOSED" }               ask the teacher
// The question shows only once feedback has arrived; a code shows whenever
// the student has one.
function turnInView_(ss, cfg, row, now, cache) {
  const googleId = String(row[LEDGER.GOOGLE_ID] || "").trim();
  const studentConfigId = String(row[LEDGER.CONFIG_ID] || "").trim();
  const have = _turnInCodeFor_(ss, googleId, turnInAssignmentId_(ss, studentConfigId, cache), cache);
  if (have) return { state: "READY", code: String(have[TCODE.CODE]) };
  const check = _turnInLatestCheck_(ss, googleId, studentConfigId, cache);
  if (check && String(check[TCHK.STATUS]).trim() === TURN_IN_PENDING) return { state: TURN_IN_PENDING };
  const prompt = turnInPrompt_(ss, cfg, row, cache);
  if (!prompt) return null;
  if (!turnInInCurrentTerm_(row, now)) return { state: "TERM_CLOSED" };
  const view = { state: "ANSWER", kind: prompt.kind, question: prompt.question, minWords: REFLECTION_MIN_WORDS };
  if (check && String(check[TCHK.STATUS]).trim() === TURN_IN_NOT_YET) {
    view.state = TURN_IN_NOT_YET;
    view.reason = String(check[TCHK.REASON] || "").trim();
  }
  return view;
}

// The student's turn-in state for one of their assignments.
// { ok: true, turnIn: view|null } or { ok: false, error, reason }.
function getMyTurnInState(configId) {
  try {
    const googleId = String(Session.getActiveUser().getEmail() || "").trim();
    if (!googleId) return _turnInRefuse_("NO_USER");
    if (turnInOffEverywhere_()) return _turnInRefuse_("OFF");
    const cfg = getConfig_();
    const row = _turnInLedgerRow_(cfg, googleId, configId);
    if (!row) return _turnInRefuse_("NOT_REGISTERED");
    if (!turnInOnForCourse_(ledgerRowCourseCode_(row))) return _turnInRefuse_("OFF");
    return { ok: true, turnIn: turnInView_(SpreadsheetApp.openById(cfg.ledgerSsId), cfg, row) };
  } catch (e) {
    Logger.log("[71] getMyTurnInState failed for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return _turnInRefuse_("SERVER_ERROR");
  }
}

// The student's answer to the feedback question. Screened at once; one that
// passes is kept as PENDING_CHECK for the flow (stage 2). No code is issued
// here. { ok: true, turnIn: view } or { ok: false, error, reason }.
function submitTurnInAnswer(configId, text) {
  try {
    return _turnInSubmit_(configId, text);
  } catch (e) {
    Logger.log("[71] submitTurnInAnswer failed for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return _turnInRefuse_("SERVER_ERROR");
  }
}

function _turnInSubmit_(configId, text, now) {
  const googleId = String(Session.getActiveUser().getEmail() || "").trim();
  if (!googleId) return _turnInRefuse_("NO_USER");
  if (turnInOffEverywhere_()) return _turnInRefuse_("OFF");
  const cfg = getConfig_();
  const row = _turnInLedgerRow_(cfg, googleId, configId);
  if (!row) return _turnInRefuse_("NOT_REGISTERED");
  if (!turnInOnForCourse_(ledgerRowCourseCode_(row))) return _turnInRefuse_("OFF");
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const before = turnInView_(ss, cfg, row, now);
  if (!before) return _turnInRefuse_("NO_FEEDBACK");
  if (before.state === "READY") return Object.assign(_turnInRefuse_("HAS_CODE"), { turnIn: before });
  if (before.state === TURN_IN_PENDING) return Object.assign(_turnInRefuse_("ALREADY_CHECKING"), { turnIn: before });
  if (before.state === "TERM_CLOSED") return _turnInRefuse_("TERM_CLOSED");

  const prompt = turnInPrompt_(ss, cfg, row);
  const screened = turnInScreen_(text, prompt);
  if (!screened.ok) return screened;

  const studentConfigId = String(row[LEDGER.CONFIG_ID]).trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // A second click while the first was being saved.
    const latest = _turnInLatestCheck_(ss, googleId, studentConfigId);
    if (latest && String(latest[TCHK.STATUS]).trim() === TURN_IN_PENDING) {
      return Object.assign(_turnInRefuse_("ALREADY_CHECKING"), { turnIn: { state: TURN_IN_PENDING } });
    }
    const out = new Array(TURN_IN_CHECK_HEADERS.length).fill("");
    out[TCHK.CHECK_ID] = "TIC-" + String(Utilities.getUuid()).replace(/-/g, "").slice(0, 12);
    out[TCHK.SUBMITTED_AT] = new Date().toISOString();
    out[TCHK.GOOGLE_ID] = googleId.toLowerCase();
    out[TCHK.STUDENT_CONFIG_ID] = studentConfigId;
    out[TCHK.FILE_ID] = String(row[LEDGER.FILE_ID] || "").trim();
    out[TCHK.ASSIGNMENT_ID] = turnInAssignmentId_(ss, studentConfigId);
    out[TCHK.COURSE] = ledgerRowCourseCode_(row);
    out[TCHK.KIND] = prompt.kind;
    out[TCHK.MILESTONE] = sheetSafeText_(prompt.milestone);
    out[TCHK.QUESTION] = sheetSafeText_(prompt.question);
    // The student's words, made safe for the flow's prompt and the sheet.
    out[TCHK.ANSWER] = sheetSafeText_(neutralizeSystemText_(String(text).trim()));
    out[TCHK.STATUS] = TURN_IN_PENDING;
    const sheet = _turnInSheet_(ss, TURN_IN_CHECKS_TAB, TURN_IN_CHECK_HEADERS);
    const at = sheet.getLastRow() + 1;
    sheet.getRange(at, 1, 1, TURN_IN_CHECK_HEADERS.length).setNumberFormat("@");
    sheet.getRange(at, 1, 1, TURN_IN_CHECK_HEADERS.length).setValues([out]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, turnIn: { state: TURN_IN_PENDING } };
}

// ---------------------------------------------------------------------------
// The dashboard's data (13's getStudentDashboardData calls this)
// ---------------------------------------------------------------------------

// Adds a.turnIn to each card in a switched-on course that has something to
// show. With the switch off everywhere it returns at once and adds nothing,
// so the data is exactly as before. ledgerData: the Ledger's values, as 13
// read them. A card still in line for its next check shows a code it has,
// or a check under way, but not the question.
function turnInAttach_(ss, cfg, googleId, ledgerData, assignments) {
  const raw = _turnInSwitchRaw_();
  if (turnInOffEverywhere_(raw)) return;
  const who = String(googleId || "").trim().toLowerCase();
  const cache = {};
  const rows = {};
  for (let i = 1; i < ledgerData.length; i++) {
    const r = ledgerData[i];
    if (String(r[LEDGER.GOOGLE_ID]).trim().toLowerCase() === who) rows[String(r[LEDGER.CONFIG_ID]).trim()] = r;
  }
  assignments.forEach(function (a) {
    const row = rows[a.configId];
    if (!row || !turnInOnForCourse_(ledgerRowCourseCode_(row), raw)) return;
    const view = turnInView_(ss, cfg, row, undefined, cache);
    if (!view) return;
    const feedbackShown = a.statusClass === "NEEDS_ACTION" || a.statusClass === "DONE";
    if (view.state !== "READY" && view.state !== TURN_IN_PENDING && !feedbackShown) return;
    a.turnIn = view;
  });
}

// ---------------------------------------------------------------------------
// The client half, pasted into the Student Dashboard page by 13
// ---------------------------------------------------------------------------

const TURN_IN_CLIENT_CSS = `
  /* The turn-in code (71): the feedback question, then the code. */
  .ti{margin-top:12px;padding:12px;border:1px solid #c6dafc;border-radius:8px;background:#f8fbff}
  .ti-h{font-size:14px;font-weight:600;margin-bottom:6px}
  .ti-p{font-size:14px;line-height:1.45;margin:0 0 8px}
  .ti-notyet{font-size:14px;line-height:1.45;margin:0 0 8px}
  .ti-notyet b{color:#7627bb}
  .ti-q{display:block;font-size:14px;font-weight:500;margin:4px 0 6px;line-height:1.4}
  .ti-a{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;padding:8px;border:1px solid #9aa0a6;border-radius:6px;resize:vertical}
  .ti-count{font-size:12px;color:var(--text-secondary);margin:2px 0 8px}
  .ti-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .ti-code{font-family:"Roboto Mono",Consolas,monospace;font-size:16px;letter-spacing:.5px;padding:8px 10px;border:1px solid #9aa0a6;border-radius:6px;background:#fff;min-width:16ch}
  .ti-msg{font-size:13px;margin-top:8px;line-height:1.45}
  .ti-msg.err{color:#c5221f}
  .ti-msg.ok{color:#137333}
`;

// The client functions. turnInCardHtml(a) renders from a.turnIn alone; the
// handlers are the only code that calls the server. Uses the page's esc()
// and countWords(), and, when present, _lastDashData, render() and
// _dashCache.
function turnInClientJs_() {
  return "var TI_MIN_WORDS = " + JSON.stringify(REFLECTION_MIN_WORDS) + ";\n" + TURN_IN_CLIENT_JS_BODY;
}

const TURN_IN_CLIENT_JS_BODY = `
var _tiDrafts = {}; // configId -> the answer typed, kept across re-renders
var _tiMsgs = {};   // configId -> { ok, text } from this visit

function tiId(a) {
  return "ti-" + String(a.configId || "").replace(/[^A-Za-z0-9_-]/g, "_");
}

function turnInCardHtml(a) {
  var t = a && a.turnIn;
  if (!t || !t.state) return "";
  var id = tiId(a);
  var msg = _tiMsgs[a.configId];
  var h = '<div class="ti" role="group" aria-labelledby="' + id + '-h"><div class="ti-h" id="' + id + '-h">Turn-in code</div>';
  if (t.state === "READY") {
    h += '<p class="ti-p">Paste this code into the assignment in Canvas. You can copy it again any time.</p>' +
      '<div class="ti-row"><label class="wu-sr" for="' + id + '-code">Your turn-in code</label>' +
      '<input id="' + id + '-code" class="ti-code" type="text" readonly value="' + esc(t.code) + '" onfocus="this.select()">' +
      '<button type="button" class="act act-secondary" data-ti="' + id + '" data-code="' + esc(t.code) + '" onclick="turnInCopy(this)">Copy turn-in code</button></div>';
  } else if (t.state === "PENDING_CHECK") {
    h += '<p class="ti-p">Checking your answer\\u2026 This takes a few minutes. Press Refresh to see your code.</p>';
  } else if (t.state === "TERM_CLOSED") {
    h += '<p class="ti-p">This marking period has ended, so this page can\\u2019t give a code for it. Ask your teacher.</p>';
  } else {
    if (t.state === "NOT_YET") {
      h += '<p class="ti-notyet"><b>Not yet:</b> ' + esc(t.reason || "Your answer doesn\\u2019t answer the question yet.") + ' Rewrite it and send it again.</p>';
    }
    var draft = _tiDrafts[a.configId] || "";
    var min = t.minWords || TI_MIN_WORDS;
    h += '<label class="ti-q" for="' + id + '-a">' + esc(t.question) + '</label>' +
      '<textarea id="' + id + '-a" class="ti-a" rows="3" data-config="' + esc(a.configId) + '" data-min="' + min + '" oninput="turnInInput(this)">' + esc(draft) + '</textarea>' +
      '<div class="ti-count" id="' + id + '-a-n">' + countWords(draft) + ' of ' + min + ' words</div>' +
      '<button type="button" class="act act-secondary" data-config="' + esc(a.configId) + '" data-min="' + min + '" onclick="turnInSend(this)">Send answer</button>';
  }
  h += '<div class="ti-msg' + (msg ? (msg.ok ? " ok" : " err") : "") + '" id="' + id + '-msg" role="status" aria-live="polite">' + (msg ? esc(msg.text) : "") + '</div>';
  return h + '</div>';
}

// Typing updates page memory and the count only, so the box keeps focus.
function turnInInput(el) {
  var configId = el.getAttribute("data-config");
  _tiDrafts[configId] = el.value;
  var n = document.getElementById(el.id + "-n");
  if (n) n.textContent = countWords(el.value) + " of " + el.getAttribute("data-min") + " words";
}

function _tiRerender() {
  if (typeof _lastDashData !== "undefined" && _lastDashData && typeof render === "function") render(_lastDashData);
}

function turnInSend(btn) {
  var configId = btn.getAttribute("data-config");
  var min = Number(btn.getAttribute("data-min")) || TI_MIN_WORDS;
  var text = _tiDrafts[configId] || "";
  if (countWords(text) < min) {
    _tiMsgs[configId] = { ok: false, text: "Write at least " + min + " words, in your own words." };
    _tiRerender();
    return;
  }
  btn.disabled = true;
  btn.textContent = "Sending\\u2026";
  google.script.run
    .withSuccessHandler(function (res) { turnInDone(configId, res); })
    .withFailureHandler(function () { turnInDone(configId, null); })
    .submitTurnInAnswer(configId, text);
}

// After a send: the card shows what the server now holds. A turned-down
// answer keeps what was typed, with the reason.
function turnInDone(configId, res) {
  if (res && res.ok) {
    delete _tiDrafts[configId];
    _tiMsgs[configId] = { ok: true, text: "Sent. Your answer is being checked." };
  } else {
    _tiMsgs[configId] = { ok: false, text: (res && res.reason) ||
      "The page didn\\u2019t answer. Your answer is still here. Try again in a minute." };
  }
  if (res && res.turnIn && typeof _lastDashData !== "undefined" && _lastDashData) {
    (_lastDashData.assignments || []).forEach(function (a) { if (a.configId === configId) a.turnIn = res.turnIn; });
  }
  if (typeof _dashCache !== "undefined") _dashCache = {};
  _tiRerender();
}

// Copy uses the clipboard API, then execCommand on the code's own box
// (selected), then asks for Ctrl+C with the code still selected: Apps
// Script's frame can refuse the clipboard (07's _prCopy). The code is
// already in the page, so the click needs no server call.
function turnInCopy(btn) {
  var id = btn.getAttribute("data-ti");
  var code = btn.getAttribute("data-code");
  var box = document.getElementById(id + "-code");
  var msg = document.getElementById(id + "-msg");
  var say = function (ok) {
    if (!msg) return;
    msg.className = "ti-msg " + (ok ? "ok" : "err");
    msg.textContent = ok ? "Copied. Paste it into the assignment in Canvas."
      : "Couldn\\u2019t copy here. The code is selected: press Ctrl+C (\\u2318C on a Mac), then paste it into Canvas.";
  };
  var fallback = function () {
    var ok = false;
    if (box) {
      box.focus();
      box.select();
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    }
    say(ok);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(function () { say(true); }, fallback);
  } else {
    fallback();
  }
}
`;
