// =============================================================================
// FILE: 13_StudentDashboard.js
// STANDALONE APPS SCRIPT PROJECT — deployed as Web App
// PURPOSE: Student-facing dashboard. Authenticated by Google account (any domain).
//          Shows only the active student's own assignments, grouped by
//          [Block - Class - Teacher] folder label.
// DEPLOY: Execute as: Me (the admin) · Access: anyone in the district domain.
//         The page and doPost() identify the student by their signed-in account.
// =============================================================================

function doGet() {
  return HtmlService
    .createHtmlOutput(buildStudentDashboardHtml_())
    .setTitle("My Assignments")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------------------------------------------------------------------------
// getStudentDashboardData — called client-side via google.script.run
// ---------------------------------------------------------------------------
function getStudentDashboardData(termFilter) {
  const googleId = Session.getActiveUser().getEmail();

  if (!googleId) {
    return {
      error: "Could not identify your Google account.\n" +
             "Make sure you are signed into Google and try again."
    };
  }

  const cfg        = getConfig_();
  // No filter means the whole current school year (see 07's
  // getDashboardData): a term is one marking period of a year-long course.
  const activeTerm = termFilter || "ALL";
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();

  // Same staging-pipeline lookup the teacher dashboard already uses —
  // without it, a student whose work is actively mid-evaluation looked
  // identical to one who hadn't entered the queue at all ("Queued for
  // evaluation…" the whole time), even though the teacher's own dashboard
  // already shows that difference live.
  const staging        = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const stagingData    = staging ? staging.getDataRange().getValues() : [];
  const pipelineStatus = {};
  const stagingHeaders = stagingData[0] ? stagingData[0].map(h => String(h).trim()) : [];
  const spFileIdx      = stagingHeaders.indexOf("StudentFileID");
  const spStatusIdx    = stagingHeaders.indexOf("Status");
  for (let i = 1; i < stagingData.length; i++) {
    const fid = spFileIdx   !== -1 ? String(stagingData[i][spFileIdx]).trim()   : "";
    const st  = spStatusIdx !== -1 ? String(stagingData[i][spStatusIdx]).trim() : "";
    if (fid) pipelineStatus[fid] = st;
  }

  // Work waiting for its evaluation (walk-through finding 2, 2026-10-22).
  // The Ledger stays ACTIVE (or COMPLETE, on a resubmission) until an
  // evaluation lands, so the open ReviewQueue row (PENDING, then STAGED once
  // the bridge takes it) or a staging row waiting for the turnstile is what
  // says the student's work is in line.
  const queuedFiles = dashQueuedFileIds_(cfg);
  Object.keys(pipelineStatus).forEach(fid => {
    if (pipelineStatus[fid] === "PENDING_INFERENCE") queuedFiles[fid] = true;
  });

  const assignments    = [];
  const availableTerms = new Set();

  const year = _currentSchoolYear_();
  const feedbackAsComment = feedbackAsCommentChecker_();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[LEDGER.GOOGLE_ID]).toLowerCase() !== googleId.toLowerCase()) continue;
    // Access policy: only this school year's work is visible, whatever term
    // the page asks for.
    if (!_isCurrentSchoolYearRow_(row, year)) continue;

    // Collect all terms for this student regardless of filter
    const rowTerm = String(row[LEDGER.ACADEMIC_YEAR] || "").trim();
    if (rowTerm) availableTerms.add(rowTerm);

    // Skip ARCHIVED rows, and SCHEDULED ones: a doc made ahead of its lesson
    // (58's nightly rollout) isn't shared with the student until the night
    // before, so its card would open a doc they can't reach.
    const rowStatus = String(row[LEDGER.STATUS]).trim();
    if (rowStatus === "SCHEDULED") continue;
    if (rowStatus === "ARCHIVED") {
      // Still count the term for dropdown, just don't show in assignments
      continue;
    }

    // Apply term filter
    if (activeTerm !== "ALL" && rowTerm && rowTerm !== activeTerm) continue;

    const fileId      = String(row[LEDGER.FILE_ID]).trim();
    const status      = String(row[LEDGER.STATUS]).trim();
    const lastEval    = row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : null;
    const submittedAt = row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : null;

    // NEW (Say/Do Ledger cas-ccps finding #7): a student previously had no
    // way to see what's actually on file for them (name, class, period,
    // teacher) or to know a registration just happened at all — the only
    // notice was a one-time email, easy to miss. registeredAt/isNew feed
    // an in-app "just registered" notice; studentName feeds the persistent
    // "My Info" view below.
    const registeredAtRaw = row[LEDGER.TIMESTAMP] || null;
    const isNewRegistration = registeredAtRaw
      ? (Date.now() - new Date(registeredAtRaw).getTime()) < (3 * 24 * 60 * 60 * 1000)
      : false;

    const configId = String(row[LEDGER.CONFIG_ID]).trim();
    const feedbackInComments = feedbackAsComment(configId, ledgerRowCourseCode_(row));
    // "QUEUED" stands in for a pipeline stage when the work is in line but
    // not yet being evaluated; IN_PROCESS (evaluating now) wins.
    const pipeline = pipelineStatus[fileId] === "IN_PROCESS" ? "IN_PROCESS"
      : queuedFiles[fileId] ? "QUEUED" : pipelineStatus[fileId];
    const lastResult = String(row[LEDGER.LAST_RESULT] || "").trim();
    const inLine = pipeline === "IN_PROCESS" || pipeline === "QUEUED";

    assignments.push({
      configId:      configId,
      studentName:   String(row[LEDGER.STUDENT_NAME]).trim(),
      // Same fallback wording as the teacher dashboard's identical gap
      // (blank column 10) — a teacher and student comparing notes about a
      // "missing unit" record should recognize it as the same thing.
      unitName:      String(row[LEDGER.COURSE_NAME]).trim() || "Unassigned unit",
      block:         String(row[LEDGER.BLOCK]).trim(),
      className:     String(row[LEDGER.CLASS_NAME]).trim(),
      teacherName:   String(row[LEDGER.TEACHER_NAME]).trim(),
      teacherEmail:  String(row[LEDGER.TEACHER_EMAIL] || "").trim(),
      period:        String(row[LEDGER.PERIOD]).trim(),
      subject:       String(row[LEDGER.SUBJECT]).trim(),
      term:          rowTerm,
      registeredAt:      registeredAtRaw ? formatDate_(registeredAtRaw) : null,
      isNewRegistration: isNewRegistration,
      status:        status,
      displayStatus: resolveStudentStatus_(status, pipeline, feedbackInComments, lastResult),
      statusClass:   resolveStudentClass_(status, pipeline, lastResult),
      lastEval:      lastEval     || "",
      submittedAt:   submittedAt  || null,
      docUrl:        fileId
        ? "https://docs.google.com/document/d/" + fileId + "/edit"
        : null,
      // For the Submit for Feedback button (submitMyWork). The student's
      // own doc, which docUrl already carries.
      fileId:        fileId,
      canSubmit:     !!fileId && !DASH_NO_SUBMIT_STATUSES[status] && !inLine,
      folderLabel:   String(row[LEDGER.BLOCK]).trim() + " - " +
                     String(row[LEDGER.CLASS_NAME]).trim() + " - " +
                     String(row[LEDGER.TEACHER_NAME]).trim()
    });
  }

  // Sort: ISSUE first (a student needs to see "talk to your teacher" before
  // anything else, including already-finished work), then needs-action,
  // then by block order, then by class.
  // Block sort order — uses system default, gracefully handles unknown values
  // Admins can customize this via the BLOCK_ORDER Script Property
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  const priority   = { "ISSUE": 0, "NEEDS_ACTION": 1, "IN_PROGRESS": 2,
                        "NOT_STARTED": 3, "DONE": 4 };

  assignments.sort((a, b) => {
    const pa = priority[a.statusClass] ?? 5;
    const pb = priority[b.statusClass] ?? 5;
    if (pa !== pb) return pa - pb;
    const ia = blockOrder.indexOf(a.block);
    const ib = blockOrder.indexOf(b.block);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.className.localeCompare(b.className);
  });

  // Warm-ups aren't Ledger rows, and they don't follow the term filter: the
  // card always shows the last two weeks.
  const warmUps = getStudentWarmUps_(ss, cfg, googleId, new Date());

  // Empty state with helpful context. "No results" from picking a term
  // with nothing in it is a completely different situation from "not
  // registered at all" — the account-troubleshooting copy below used to
  // show for both, actively misleading the moment term filtering is used
  // for anything other than "All Terms."
  if (assignments.length === 0) {
    const filteredByTerm = activeTerm !== "ALL" && availableTerms.size > 0;
    return {
      googleId:    googleId,
      assignments: [],
      warmUps:     warmUps,
      emptyReason: filteredByTerm
        ? "No assignments for " + activeTerm + ".\n\nChoose \"Whole school year\" at the top to see the rest of the year."
        : "No assignments found for " + googleId + ".\n\n" +
          "If you expect to see assignments here:\n" +
          "• Make sure you are signed in with the correct Google account\n" +
          "• Check with your teacher that they have registered you\n" +
          "• Wait a few minutes if you were just registered",
      activeTerm:     activeTerm,
      availableTerms: [...availableTerms].sort().reverse(),
      generatedAt: formatDate_(new Date())
    };
  }

  return {
    googleId:       googleId,
    assignments:    assignments,
    warmUps:        warmUps,
    activeTerm:     activeTerm,
    availableTerms: [...availableTerms].sort().reverse(),
    generatedAt:    formatDate_(new Date())
  };
}

// ---------------------------------------------------------------------------
// Warm-ups card: the last warm-up's feedback (and its extra-credit reply
// while that window is open) and the current warm-up. Older warm-ups stay
// in the Ledger; the card doesn't list them.
//
// WarmUpQueue (25_WarmUpWriter.js's WQ25_*; 25 isn't in this project, so
// the columns are repeated here): google_id 4, lesson_date 5,
// lesson_context_snapshot 6, status 8, doc_id 9, word_count_score 12,
// grammar_score 13, engagement_score 14, extra_credit 15, total_score 16
// (the total includes extra credit once it is earned), flow4_feedback 17. A warm-up answered here (WARMUP_TEXT_BOX) has a
// WarmUpTextBox row (00's WTB) and no doc. The student answers on the
// lesson day; the 3:15am run after it (runWarmUpEvaluation) scores it, and
// replies are checked each night for EXTRA_CREDIT_RECHECK_WINDOW_DAYS (7)
// with at least EXTRA_CREDIT_MIN_WORDS (10) words.
// ---------------------------------------------------------------------------
const DASH_WQ_GOOGLE_ID    = 4;
const DASH_WQ_LESSON_DATE  = 5;
const DASH_WQ_LESSON_SNAP  = 6;
const DASH_WQ_STATUS       = 8;
const DASH_WQ_DOC_ID       = 9;
const DASH_WQ_LENGTH       = 12;
const DASH_WQ_GRAMMAR      = 13;
const DASH_WQ_ENGAGEMENT   = 14;
const DASH_WQ_EXTRA_CREDIT = 15;
const DASH_WQ_TOTAL        = 16;
const DASH_SCORE_MAX       = 10; // length 6 + grammar 1 + engagement 3 (25's thresholds, 41's ranges)
const DASH_WQ_FEEDBACK     = 17;
const DASH_WQ_WIDTH        = 18;
const DASH_EC_DAYS         = 7;
const DASH_EC_MIN_WORDS    = 10;
const DASH_ANSWER_MAX      = 5000;
const DASH_REPLY_MAX       = 2000;

// The student's own warm-ups, oldest first, each with its WarmUpTextBox row.
function _dashOwnWarmUps_(ss, cfg, googleId, tz) {
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const me = String(googleId).trim().toLowerCase();
  const textBox = readWarmUpTextBox_(ss);
  const out = [];
  sheet.getRange(2, 1, sheet.getLastRow() - 1, DASH_WQ_WIDTH).getValues().forEach(function (row, i) {
    if (String(row[DASH_WQ_GOOGLE_ID] || "").trim().toLowerCase() !== me) return;
    const queueId = String(row[0] || "").trim();
    const docId = String(row[DASH_WQ_DOC_ID] || "").trim();
    const tb = textBox[queueId] || null;
    if (!queueId || (!docId && !tb)) return; // not delivered yet
    // NOT_MEETING (24): queued for a day the student's period doesn't meet.
    if (String(row[DASH_WQ_STATUS] || "").trim() === "NOT_MEETING") return;
    const lessonDate = dashIsoDate_(row[DASH_WQ_LESSON_DATE], tz);
    if (!lessonDate) return;
    out.push({ queueId: queueId, sheetRow: i + 2, row: row, tb: tb, docId: docId, lessonDate: lessonDate });
  });
  out.sort(function (a, b) { return a.lessonDate < b.lessonDate ? -1 : a.lessonDate > b.lessonDate ? 1 : 0; });
  return out;
}

function getStudentWarmUps_(ss, cfg, googleId, now) {
  const tz    = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const ecFrom = Utilities.formatDate(new Date(now.getTime() - DASH_EC_DAYS * 86400000), tz, "yyyy-MM-dd");
  const own = _dashOwnWarmUps_(ss, cfg, googleId, tz);
  const upcoming = own.filter(function (w) { return w.lessonDate >= today; });
  const past = own.filter(function (w) { return w.lessonDate < today; });
  const cur = upcoming.length ? upcoming[0] : null;
  const prev = past.length ? past[past.length - 1] : null;
  return {
    current:  cur ? _dashWarmUpView_(cur, tz, today, ecFrom) : null,
    previous: prev ? _dashWarmUpView_(prev, tz, today, ecFrom) : null
  };
}

function _dashWarmUpView_(w, tz, today, ecFrom) {
  const status = String(w.row[DASH_WQ_STATUS] || "").trim();
  const tbRow = w.tb ? w.tb.row : null;
  let course = "";
  try { course = String(JSON.parse(String(w.row[DASH_WQ_LESSON_SNAP] || "{}")).course_name || ""); }
  catch (e) { /* a snapshot that doesn't parse just leaves the course off */ }
  const [y, m, d] = w.lessonDate.split("-").map(Number);
  const st = resolveWarmUpStatus_(status, w.lessonDate, today, !!tbRow);
  const credited = Number(w.row[DASH_WQ_EXTRA_CREDIT] || 0) === 1;
  const ecOpen = status === "SCORED" && !credited && w.lessonDate >= ecFrom;
  const deadline = new Date(y, m - 1, d + DASH_EC_DAYS, 12);
  return {
    queueId:       w.queueId,
    dateLabel:     Utilities.formatDate(new Date(y, m - 1, d, 12), tz, "EEE, MMM d"),
    isToday:       w.lessonDate === today,
    course:        course,
    textBox:       !!tbRow,
    docUrl:        w.docId ? "https://docs.google.com/document/d/" + w.docId + "/edit" : null,
    displayStatus: st.displayStatus,
    statusClass:   st.statusClass,
    bridge:        tbRow ? String(tbRow[WTB.BRIDGE] || "") : "",
    warmup:        tbRow ? String(tbRow[WTB.WARMUP] || "") : "",
    answer:        tbRow ? String(tbRow[WTB.RESPONSE] || "") : "",
    savedAt:       tbRow && tbRow[WTB.SUBMITTED_AT] ? formatDate_(tbRow[WTB.SUBMITTED_AT]) : null,
    canAnswer:     !!tbRow && status === "DELIVERED" && w.lessonDate >= today,
    feedback:      status === "SCORED" ? String(w.row[DASH_WQ_FEEDBACK] || "") : "",
    // Shown with the feedback, by the operator's choice (2026-10-17): the
    // score out of 10 and its parts, extra credit added on top.
    score: status === "SCORED" ? {
      points:     Number(w.row[DASH_WQ_TOTAL] || 0) - (credited ? 1 : 0),
      max:        DASH_SCORE_MAX,
      length:     Number(w.row[DASH_WQ_LENGTH] || 0),
      grammar:    Number(w.row[DASH_WQ_GRAMMAR] || 0),
      engagement: Number(w.row[DASH_WQ_ENGAGEMENT] || 0),
      extra:      credited ? 1 : 0
    } : null,
    extraCredit: {
      credited:  credited,
      open:      ecOpen,
      byLabel:   Utilities.formatDate(deadline, tz, "EEE, MMM d"),
      minWords:  DASH_EC_MIN_WORDS,
      reply:     tbRow ? String(tbRow[WTB.REPLY] || "") : "",
      canReply:  ecOpen && !!tbRow
    }
  };
}

// A lesson date read from the sheet is a Date or "YYYY-MM-DD" text.
function dashIsoDate_(v, tz) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, tz, "yyyy-MM-dd");
  }
  const m = String(v || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}

// Same statusClass names (and colors) as the assignment cards.
function resolveWarmUpStatus_(status, lessonDate, today, textBox) {
  const where = textBox ? "below" : "in your doc";
  switch (status) {
    case "DELIVERED":
      return lessonDate >= today
        ? { displayStatus: "Ready — answer today", statusClass: "NEEDS_ACTION" }
        : { displayStatus: "Waiting to be checked", statusClass: "IN_PROGRESS" };
    case "PENDING_EVAL":
    case "EVAL_ERROR":
      return { displayStatus: "Being checked — your work is saved", statusClass: "IN_PROGRESS" };
    case "SCORED":
      return { displayStatus: "Checked — feedback is " + where, statusClass: "DONE" };
    case "INCOMPLETE":
      return { displayStatus: "No response was written", statusClass: "NOT_STARTED" };
    default:
      return { displayStatus: "Open your warm-up", statusClass: "NOT_STARTED" };
  }
}

// Called from the page: save the answer to a warm-up, or the extra-credit
// reply to its feedback. Only the signed-in student's own warm-up, only a
// text-box one, and only while it is open. Saving again replaces the text.
function submitWarmUpAnswer(queueId, text) {
  return _dashWarmUpSave_(queueId, text, "answer");
}

function submitWarmUpReply(queueId, text) {
  return _dashWarmUpSave_(queueId, text, "reply");
}

function _dashWarmUpSave_(queueId, text, kind) {
  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) return { ok: false, error: "Could not identify your Google account. Sign in and try again." };
  const max = kind === "answer" ? DASH_ANSWER_MAX : DASH_REPLY_MAX;
  const t = String(text || "").trim();
  if (!t) return { ok: false, error: kind === "answer" ? "Write your answer first." : "Write your reply first." };
  if (t.length > max) return { ok: false, error: "That's too long: keep it under " + max + " characters." };

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "The system is busy. Try again in a minute." };
  try {
    const cfg = getConfig_();
    const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
    const tz  = Session.getScriptTimeZone();
    const now = new Date();
    const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
    const w = _dashOwnWarmUps_(ss, cfg, googleId, tz).filter(function (x) { return x.queueId === String(queueId); })[0];
    if (!w || !w.tb) return { ok: false, error: "That warm-up wasn't found. Refresh the page." };
    const view = _dashWarmUpView_(w, tz, today,
      Utilities.formatDate(new Date(now.getTime() - DASH_EC_DAYS * 86400000), tz, "yyyy-MM-dd"));
    const sheet = ss.getSheetByName(cfg.tabs.warmUpTextBox);
    if (kind === "answer") {
      if (!view.canAnswer) return { ok: false, error: "This warm-up is closed. It is checked overnight after its day." };
      sheet.getRange(w.tb.sheetRow, WTB.RESPONSE + 1, 1, 2).setValues([[sheetSafeText_(t), now]]);
    } else {
      if (!view.extraCredit.canReply) return { ok: false, error: "The extra-credit window for this warm-up has closed." };
      sheet.getRange(w.tb.sheetRow, WTB.REPLY + 1, 1, 2).setValues([[sheetSafeText_(t), now]]);
    }
    return { ok: true, savedAt: formatDate_(now) };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// doPost — the student doc's menu (01_StudentDoc_ContainerScript.js) calls
// this instead of opening the Ledger itself.
//
// Access policy: the doc's menu runs as the student, so it used to read the
// whole Ledger and append to the Admin sheet's ReviewQueue with the
// student's own permissions. That only worked if every student could read
// the Ledger (every student's rows) and edit the Admin spreadsheet. This
// project runs as the admin (appsscript.json: executeAs USER_DEPLOYING,
// access DOMAIN), so the Ledger can stay admin-only. The caller is whoever
// Google says is signed in, never an email in the request, and they only
// get back or act on the one Ledger row for their own doc.
//
// Request body (JSON): { action: "status" | "submit", fileId, configId, hasText? }
//
// A submit never carries or stores the student's writing: Flow 2 reads it
// from the student's own Doc, and nothing reads ReviewQueue's StudentText
// column. Docs made before this send `text` instead of `hasText`; it is
// checked for being non-empty and then dropped, never written.
// Response (JSON): { ok: true, info } | { ok: true } | { ok: false, error }
// ---------------------------------------------------------------------------
function doPost(e) {
  const googleId = Session.getActiveUser().getEmail();
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (_) {}
  const result = handleStudentDocRequest_(googleId, req);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleStudentDocRequest_(googleId, req) {
  if (!googleId) return { ok: false, error: "NO_USER" };
  const fileId   = String((req && req.fileId)   || "").trim();
  const configId = String((req && req.configId) || "").trim();
  const action   = String((req && req.action)   || "");
  if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };
  if (action !== "status" && action !== "submit") return { ok: false, error: "BAD_ACTION" };

  const cfg = getConfig_();
  const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
  if (!row) return { ok: false, error: "NOT_REGISTERED" };

  if (action === "status") {
    return {
      ok: true,
      info: {
        status:      String(row[LEDGER.STATUS]).trim(),
        // Dates and the term in words the doc can show as is (2026-10-22):
        // the doc menu printed the raw Date string and "2627_MP1".
        submittedAt: row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : null,
        lastEval:    row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : null,
        lastResult:  String(row[LEDGER.LAST_RESULT] || "").trim(),
        unitCode:    String(row[LEDGER.COURSE_NAME]).trim(),
        teacherName: String(row[LEDGER.TEACHER_NAME] || "").trim(),
        term:        termLabel_(row[LEDGER.ACADEMIC_YEAR])
      }
    };
  }

  const hasText = (req && req.hasText === true) || !!String((req && req.text) || "").trim();
  if (!hasText) return { ok: false, error: "EMPTY" };
  return queueSubmission_(cfg, googleId, fileId, configId);
}

// The signed-in student's Ledger row for this doc, or null. All three must
// match, so a student can only ever reach their own row.
function findOwnLedgerRow_(cfg, googleId, fileId, configId) {
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.GOOGLE_ID]).toLowerCase() === googleId.toLowerCase() &&
        String(data[i][LEDGER.CONFIG_ID]) === configId &&
        String(data[i][LEDGER.FILE_ID])   === fileId) return data[i];
  }
  return null;
}

function queueSubmission_(cfg, googleId, fileId, configId) {
  const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
  if (!queue) return { ok: false, error: "NO_QUEUE" };
  // Column 5 (StudentText) stays empty; see the header comment above.
  const now = new Date();
  queue.appendRow([now, googleId, fileId, configId, "", "PENDING", ""]);
  stampSubmissionTs_(cfg, googleId, fileId, configId, now);
  setDocFeedbackStatus_(fileId, "CHECKING", { when: now }); // the doc's header (00)
  return { ok: true };
}

// The Ledger's SubmissionTS: when the student last submitted this work. Both
// dashboards show it. Best effort: the queued row is what counts, so a
// failure here is logged and the submit still succeeds.
function stampSubmissionTs_(cfg, googleId, fileId, configId, when) {
  try {
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][LEDGER.GOOGLE_ID]).toLowerCase() === googleId.toLowerCase() &&
          String(data[i][LEDGER.CONFIG_ID]) === configId &&
          String(data[i][LEDGER.FILE_ID])   === fileId) {
        sheet.getRange(i + 1, LEDGER.SUBMISSION_TS + 1).setValue(when);
        return;
      }
    }
  } catch (e) {
    Logger.log("[S13] SubmissionTS not written for " + configId + ": " + e.message);
  }
}

// ---------------------------------------------------------------------------
// submitMyWork — the dashboard's "Submit for Feedback" button
//
// The doc's own menu (01) runs as the student, and the district turns Apps
// Script off for student accounts: on 2026-10-08 the teacher saw the menu
// on a student's doc and the student didn't. This page runs as the admin,
// so it can do the menu's check-and-submit itself: it reads the student's
// doc, applies the menu's minimums, and queues the same ReviewQueue row.
// The writing is read only to count it. It is never returned or stored.
// Returns { ok: true, aiFlowsLive, feedbackInComments } or
// { ok: false, error, words?, found? }.
// ---------------------------------------------------------------------------
const DASH_RESPONSE_MARKER    = "── YOUR RESPONSE BEGINS HERE ──"; // 01's RESPONSE_MARKER
const DASH_MIN_RESPONSE_CHARS = 150; // 01's MIN_RESPONSE_CHARS
const DASH_MIN_RESPONSE_WORDS = 25;  // 01's MIN_RESPONSE_WORDS
// Ledger statuses with nothing to submit: already queued, already turned in,
// or retired.
// A ReviewQueue row in these states is a submission not yet evaluated.
const DASH_OPEN_QUEUE_STATUSES = { PENDING: true, STAGED: true };

// fileId -> true for every student file with an open ReviewQueue row. The
// queue lives in the admin spreadsheet; if it can't be read the dashboard
// shows statuses from the Ledger alone, as before.
function dashQueuedFileIds_(cfg) {
  const out = {};
  try {
    const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
    if (!queue) return out;
    queue.getDataRange().getValues().slice(1).forEach(r => {
      const fid = String(r[2]).trim();
      if (fid && DASH_OPEN_QUEUE_STATUSES[String(r[5]).trim()]) out[fid] = true;
    });
  } catch (e) {
    Logger.log("[Dashboard] ReviewQueue unreadable: " + e.message);
  }
  return out;
}

const DASH_NO_SUBMIT_STATUSES = {
  PENDING: "ALREADY_QUEUED", STAGED: "ALREADY_QUEUED",
  PENDING_TEACHER_REVIEW: "ALREADY_TURNED_IN", COMPLIANT: "ALREADY_TURNED_IN",
  ARCHIVED: "NOT_REGISTERED", SCHEDULED: "NOT_OPEN_YET"
};

function submitMyWork(fileId, configId) {
  // Anything thrown used to reach the page as a failed call, which shows
  // "didn't answer… try again" and was recorded nowhere but Executions
  // (the second failed submission, 2026-10-15). Caught here, it is counted
  // in SubmitFailures like the other system-side failures and the student
  // is told to tell the teacher.
  try {
    return _dashSubmit_(fileId, configId);
  } catch (e) {
    Logger.log("submitMyWork: unexpected error for ConfigID " + String(configId || "").trim() + ": " + e.message);
    let cfg = null;
    try { cfg = getConfig_(); } catch (e2) { /* no config: nothing to record it in */ }
    if (cfg) dashRecordFailure_(cfg, "SERVER_ERROR");
    return { ok: false, error: "SERVER_ERROR" };
  }
}

function _dashSubmit_(fileId, configId) {
  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) return { ok: false, error: "NO_USER" };
  fileId   = String(fileId   || "").trim();
  configId = String(configId || "").trim();
  if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };

  const cfg = getConfig_();
  const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
  if (!row) return { ok: false, error: "NOT_REGISTERED" };
  const blocked = DASH_NO_SUBMIT_STATUSES[String(row[LEDGER.STATUS]).trim()];
  if (blocked) return { ok: false, error: blocked };

  // A second click before the queue bridge picks up the first: the bridge
  // would mark it DUPLICATE anyway, but the student should hear why.
  const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
  if (!queue) {
    Logger.log("submitMyWork: ReviewQueue tab not found in ADMIN_SS_ID for ConfigID " + configId);
    dashRecordFailure_(cfg, "NO_QUEUE");
    return { ok: false, error: "NO_QUEUE" };
  }
  // Columns 2 and 5 are 03's RQ_FILE_ID and RQ_STATUS. STAGED is still in
  // line: the bridge has taken it but no evaluation has landed. A second
  // submit then used to pass and stamp a new SubmissionTS.
  const pending = queue.getDataRange().getValues().slice(1).some(r =>
    String(r[2]).trim() === fileId && DASH_OPEN_QUEUE_STATUSES[String(r[5]).trim()]);
  if (pending) return { ok: false, error: "ALREADY_QUEUED" };

  let fullText;
  try {
    fullText = DocumentApp.openById(fileId).getBody().getText();
  } catch (e) {
    // A permission message here means the deploying account hasn't approved
    // the manifest's documents scope (2026-10-15): every student fails the
    // same way until the admin runs a function from the editor and approves.
    Logger.log("submitMyWork: couldn't open doc for ConfigID " + configId + ": " + e.message);
    dashRecordFailure_(cfg, "DOC_UNREADABLE");
    return { ok: false, error: "DOC_UNREADABLE" };
  }
  if (fullText.indexOf(DASH_RESPONSE_MARKER) === -1) return { ok: false, error: "NO_RESPONSE_SECTION" };
  const text  = dashExtractResponse_(fullText);
  const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
  if (text.length < DASH_MIN_RESPONSE_CHARS || words < DASH_MIN_RESPONSE_WORDS) {
    return { ok: false, error: "TOO_SHORT", words: words };
  }
  // P0-03: a pasted feedback stamp or submission delimiter would reach
  // Flow 2's prompt as system text. Only the matched token goes back, never
  // the student's writing.
  const systemText = findSystemText_(text);
  if (systemText) return { ok: false, error: "SYSTEM_TEXT_IN_RESPONSE", found: systemText };

  const res = queueSubmission_(cfg, googleId, fileId, configId);
  if (!res.ok) return res;
  Logger.log("Dashboard submission — ConfigID: " + configId);
  return { ok: true, aiFlowsLive: !!cfg.aiFlowsLive, feedbackInComments: feedbackAsCommentFor_(configId) };
}

// One row per system-side failure (a doc the admin account can't open, a
// missing ReviewQueue tab): timestamp and error code, nothing about the
// student or the doc. The CAS attention signal (34b) counts these so a
// failure that hits every student shows up in the teacher's start brief, not
// only in this project's Executions log. A failure here is swallowed: it must
// never change what the student is told.
function dashRecordFailure_(cfg, code) {
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const name = cfg.tabs.submitFailures || "SubmitFailures";
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(["Timestamp", "Code"]);
    sheet.appendRow([new Date(), code]);
  } catch (e) {
    Logger.log("submitMyWork: couldn't record failure " + code + ": " + e.message);
  }
}

// Same span as 01's extractStudentResponse_(): from the line after the
// response marker to the first system marker. 01 isn't in this project,
// and a test holds the two to the same answers.
function dashExtractResponse_(fullText) {
  const start = fullText.indexOf(DASH_RESPONSE_MARKER);
  if (start === -1) return "";
  const from = fullText.indexOf("\n", start);
  if (from === -1) return "";
  const ends = [fullText.indexOf("[CONFIG_ID:"), fullText.indexOf("[SYS_LEDGER_SS_ID:")]
    .filter(n => n !== -1);
  const to = ends.length > 0 ? Math.min(...ends) : fullText.length;
  return fullText.substring(from, to).trim();
}

function resolveStudentStatus_(status, pipeline, feedbackInComments, lastResult) {
  // Plain words (2026-10-22), paired with the teacher dashboard's badges so
  // a student and teacher comparing notes mean the same stage: "Waiting for
  // feedback" / "Waiting to be checked", "Being checked now" on both, and
  // "Couldn't be checked" on both for an ERROR_* status (the system's
  // failure, not the student's work). The Terms panel explains each.
  // `pipeline` (from StagingPipeline, same lookup the teacher dashboard
  // uses) distinguishes actively-processing from merely-queued — without
  // it a student's work looked "Queued for evaluation…" the entire time
  // it was in the pipeline, even while the teacher's own dashboard already
  // showed EVALUATING NOW.
  if (pipeline === "IN_PROCESS") return "Being checked now…";
  // In line for its evaluation (submitted, not yet taken up): see
  // getStudentDashboardData's queuedFiles. Before 2026-10-22 a submitted
  // assignment read "Not started yet" here (walk-through finding 2).
  if (pipeline === "QUEUED" || pipeline === "PENDING_INFERENCE") return "Waiting for feedback…";
  switch (status) {
    case "ACTIVE":              return "Not started yet";
    case "PENDING": case "STAGED": return "Waiting for feedback…";
    case "COMPLETE": {
      // The latest evaluation's result (LEDGER.LAST_RESULT, written by 37)
      // says whether the work passed; until 2026-10-22 a passed assignment
      // read the same as one needing revision (finding 8).
      const where = feedbackInComments ? "open your document and click Comments" : "check your document";
      if (lastResult === "PASSED") return "Passed ✓ — feedback is ready: " + where;
      if (lastResult === "NEEDS_REVISION") return "Feedback ready — revise, then submit again: " + where;
      return "Feedback is ready: " + where;
    }
    // Where every passing turn-in lands (04_Form2_TurnInGate.js) until the
    // teacher confirms its score. It used to fall through to "Status
    // unavailable", flagged as an issue, on every submitted assignment.
    case "PENDING_TEACHER_REVIEW": return "Turned in — waiting for your teacher";
    case "COMPLIANT":           return "Done ✓ — your teacher confirmed it";
    default:
      // Never show a raw Ledger status string to a student — a blank cell
      // or an unrecognized/future status code both land here. ERROR-
      // prefixed statuses are real pipeline failures; anything else is
      // just unexpected/blank data, worded distinctly so a teacher can
      // tell the two apart when a student reports it.
      // FIXED: the teacher side keeps its ⚠ icon on FLAGGED (the one status
      // that most needs an attention-grabber); this dropped it.
      return status.startsWith("ERROR")
        ? "Couldn't be checked ⚠ — tell your teacher"
        : "Status unavailable — check with your teacher";
  }
}

function resolveStudentClass_(status, pipeline, lastResult) {
  // Evaluating-now shares IN_PROGRESS's visual bucket (same pill/border
  // color) — the distinction is carried by displayStatus's text, not a
  // separate color, since it's still fundamentally "in progress" to a
  // student with no action to take.
  if (pipeline === "IN_PROCESS" || pipeline === "QUEUED" || pipeline === "PENDING_INFERENCE") return "IN_PROGRESS";
  switch (status) {
    case "ACTIVE":              return "NOT_STARTED";
    case "PENDING": case "STAGED": return "IN_PROGRESS";
    case "COMPLETE":            return lastResult === "PASSED" ? "DONE" : "NEEDS_ACTION";
    case "PENDING_TEACHER_REVIEW": return "IN_PROGRESS";
    case "COMPLIANT":           return "DONE";
    default:                    return "ISSUE";
  }
}

function formatDate_(d) {
  try {
    if (!(d instanceof Date)) d = new Date(d);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  } catch (e) { return String(d); }
}

// ---------------------------------------------------------------------------
// buildStudentDashboardHtml_
// ---------------------------------------------------------------------------
function buildStudentDashboardHtml_() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Assignments</title>
<style>
  /* FIXED (Say/Do Ledger cas-ccps finding #14): #80868b (used for
     secondary/meta text) is ~3.68:1 against white — below WCAG AA's
     4.5:1 minimum for normal text. #5f6368 (already used elsewhere in
     this file for the identical "muted meta text" role) is ~6.05:1 —
     verified passing — so both are consolidated into this one token,
     matching the same fix in 07_TeacherDashboard.js. */
  :root{--text-secondary:#5f6368}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Google Sans",Roboto,Arial,sans-serif;background:#f8f9fa;color:#202124;font-size:15px;min-height:100vh}
  header{background:#0d652d;color:white;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  header h1{font-size:19px;font-weight:500}
  #account-label{font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .refresh-btn{background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.7);color:white;border-radius:6px;padding:7px 12px;font-size:13px;min-height:36px;cursor:pointer;font-family:inherit}
  .refresh-btn:hover{background:rgba(0,0,0,0.35)}
  .refresh-btn:focus-visible,#term-filter:focus-visible{outline:2px solid white;outline-offset:2px}
  #term-filter option{color:#202124;background:#fff}
  @media (max-width:480px){
    header{padding:14px 16px}
    .pill{max-width:none;text-align:left}
    .refresh-btn{min-height:44px}
    #account-label{max-width:100%}
    header h1{font-size:17px}
    .main{padding:16px}
    .card{padding:14px 16px}
    /* FIXED (external UX audit): this breakpoint used to only adjust
       padding/font-size, never reflowing actual layout — unlike
       07_TeacherDashboard.js's own max-width:600px breakpoint, which
       genuinely reflows its field-row grid to one column. .card-top's
       flex-shrink:0 status pill never shrinks, so a long assignment name
       on a narrow phone screen got squeezed into a cramped remainder
       instead of stacking, same reflow-need the teacher side's grid had. */
    .card-top{flex-direction:column;align-items:flex-start}
  }
  #loading{text-align:center;padding:80px 24px;color:var(--text-secondary)}
  /* FIXED: was 40px vs the teacher dashboard's 36px — same border weight,
     same animation, same purpose, just a needless 4px drift between the
     two "app shells." Border color intentionally stays green (this
     dashboard's own accent) vs the teacher side's blue. */
  .spinner{width:36px;height:36px;border:3px solid #e8eaed;border-top-color:#137333;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .main{padding:24px;max-width:700px;margin:0 auto}
  /* NEW (finding #7): "just registered" notice + My Info panel */
  .new-reg-notice{background:#e6f4ea;border:1px solid #b7e1c4;color:#0d652d;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;line-height:1.5}
  .new-reg-notice strong{font-weight:600}
  .info-card{background:white;border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:5px solid #1a73e8}
  .info-card .info-row{font-size:13.5px;color:#3c4043;margin-bottom:4px}
  .info-card .info-row b{color:#202124;font-weight:600}
  .info-card .correction-link{display:inline-block;margin-top:8px;font-size:13px;color:#1557b0;text-decoration:none;font-weight:500}
  .info-card .correction-link:hover{text-decoration:underline}
  .group-header{font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-secondary);padding:4px 0 10px;border-bottom:2px solid #e8eaed;margin:28px 0 14px}
  .group-header:first-child{margin-top:0}
  .card{background:white;border-radius:12px;padding:18px 20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:5px solid #dadce0;transition:box-shadow .15s,transform .1s}
  .card:hover{box-shadow:0 3px 10px rgba(0,0,0,.15);transform:translateY(-1px)}
  /* Colors match the teacher dashboard's equivalent statusClass exactly
     (not-started/compliant/flagged already coincided; queued and evaluated
     were swapped here, so "orange" meant two different pipeline stages
     depending on which dashboard you were looking at). */
  .card.NOT_STARTED{border-left-color:#dadce0}
  .card.IN_PROGRESS{border-left-color:#e37400}
  .card.NEEDS_ACTION{border-left-color:#9334e6}
  .card.DONE{border-left-color:#1e8e3e}
  .card.ISSUE{border-left-color:#d93025}
  .card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
  .unit-name{font-size:16px;font-weight:600}
  /* FIXED: matches 07_TeacherDashboard.js's .status-badge geometry exactly
     (font-size/padding/border-radius) — this renders the identical
     "current status" chip concept, but used to be a fully-rounded pill at
     a different size, a visible seam between the two dashboards. */
  .pill{font-size:12px;font-weight:600;padding:4px 10px;border-radius:12px;max-width:55%;text-align:right;line-height:1.35}
  .pill-NOT_STARTED{background:#f1f3f4;color:var(--text-secondary)}
  .pill-IN_PROGRESS{background:#fef3e2;color:#9c5000}
  .pill-NEEDS_ACTION{background:#f3e8fd;color:#7627bb}
  .pill-DONE{background:#e6f4ea;color:#137333}
  .pill-ISSUE{background:#fce8e6;color:#b3261e}
  .card-meta{font-size:13px;color:var(--text-secondary);margin-bottom:10px}
  .eval-line{font-size:13px;color:var(--text-secondary);margin-bottom:12px}
  .open-btn{display:inline-block;background:#1967d2;color:white;text-decoration:none;padding:9px 20px;border-radius:6px;font-size:14px;font-weight:500;transition:background .15s}
  .open-btn:hover{background:#1557b0}
  .open-btn.done-btn{background:#137333}
  .open-btn.done-btn:hover{background:#0d652d}
  .submitted-note{font-size:13px;color:#137333;margin-top:8px;font-weight:500}
  .card-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .submit-btn{background:white;color:#137333;border:1px solid #137333;padding:8px 18px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
  .submit-btn:hover{background:#e6f4ea}
  .submit-btn:disabled{opacity:.6;cursor:default}
  .submit-msg{font-size:13px;margin-top:8px;line-height:1.45;white-space:pre-line}
  .submit-msg.ok{color:#137333}
  .submit-msg.err{color:#c5221f}
  /* Warm-ups card: the last warm-up's feedback, then the current one. */
  .warmup-card{border-left-color:#1a73e8}
  .warmup-card:hover{transform:none}
  .wu-section{padding:12px 0;border-top:1px solid #e8eaed}
  .wu-section:first-child{border-top:none;padding-top:0}
  .wu-section:last-child{padding-bottom:0}
  .wu-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;flex-wrap:wrap}
  .wu-label{font-size:14px;font-weight:600}
  .wu-course{font-weight:400;color:var(--text-secondary);font-size:13px}
  .wu-bridge{font-size:13.5px;font-style:italic;color:var(--text-secondary);margin-bottom:8px;white-space:pre-line;line-height:1.5}
  .wu-prompt{font-size:15px;line-height:1.55;margin-bottom:10px;white-space:pre-line}
  .wu-score{font-size:14px;margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
  .wu-score b{font-size:18px}
  .wu-plus{color:#137333;font-weight:600;font-size:13px}
  .wu-parts{color:var(--text-secondary);font-size:13px}
  .wu-feedback{font-size:14px;line-height:1.55;background:#f1f3f4;border-radius:8px;padding:10px 12px;margin-bottom:10px;white-space:pre-line}
  .wu-answer{font-size:14px;line-height:1.5;white-space:pre-line;color:#3c4043}
  .wu-ec{font-size:13px;color:#7627bb;font-weight:500;margin-bottom:6px}
  .wu-ec.done{color:#137333}
  .wu-note{font-size:13px;color:var(--text-secondary);margin-top:6px}
  .wu-text{width:100%;font-family:inherit;font-size:15px;line-height:1.5;padding:10px 12px;border:1px solid #dadce0;border-radius:8px;margin-bottom:8px;resize:vertical}
  .wu-text:focus{outline:2px solid #1a73e8;outline-offset:1px;border-color:#1a73e8}
  .wu-open{padding:6px 14px;font-size:13px}
  .wu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
  .empty-state{text-align:center;padding:60px 24px;color:var(--text-secondary);white-space:pre-line}
  .empty-state .icon{font-size:48px;margin-bottom:16px}
  footer{text-align:center;padding:20px;font-size:13px;color:var(--text-secondary);border-top:1px solid #e8eaed;margin-top:32px}
</style>
</head>
<body>
<header>
  <h1>📚 My Assignments</h1>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <label for="term-filter" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Filter by term</label>
    <select id="term-filter" onchange="loadData()" aria-label="Filter by term" style="padding:7px 10px;min-height:36px;border-radius:6px;border:1px solid rgba(255,255,255,0.7);background:rgba(0,0,0,0.22);color:white;font-size:13px;">
      <option value="ALL">Whole school year</option>
    </select>
    <button id="my-info-btn" class="refresh-btn" onclick="toggleMyInfo()" aria-expanded="false" aria-controls="my-info-panel">ℹ️ My Info</button>
    <button id="refresh-btn" class="refresh-btn" onclick="loadData()" aria-label="Refresh assignments">↻ Refresh</button>
    <button id="cas-terms-btn" class="refresh-btn" onclick="casOpenTerms()" aria-haspopup="dialog">❓ What do these mean?</button>
    <div id="account-label">Loading…</div>
  </div>
</header>
<div id="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading your assignments…</p></div>
<!-- NEW (finding #7): persistent "My Info" view — what's actually on file
     for this student (name, class, period, teacher), available any time
     via the header button, not just a one-time notice. -->
<!-- FIXED (external UX audit): my-info-btn already had aria-expanded/
     aria-controls pointing here (the correct disclosure-widget half), but
     this panel itself had no role/label — the other half 07_TeacherDashboard.js's
     own role="tabpanel" aria-labelledby="tab-..." pattern establishes for
     every button-controlled region in that file. role="region" +
     aria-labelledby (pointing back at the button) is the matching pattern
     for a show/hide disclosure rather than a tab. -->
<div id="my-info-panel" class="main" role="region" aria-labelledby="my-info-btn" style="display:none;padding-bottom:0"></div>
<!-- NEW (finding #7): in-app notice for a recent registration, replacing
     the easy-to-miss one-time email — visible for a few days after a new
     registration is recorded, then fades out on its own as it ages past
     the "recent" window computed server-side (isNewRegistration). -->
<!-- FIXED (external UX audit): matches the role="status" aria-live="polite"
     convention 07_TeacherDashboard.js already uses for its own dynamically
     shown/hidden notice regions (lesson-payoff-hint, draft-stale-hint) —
     this banner is the same shape (server-driven, appears without any
     user action) and had none. -->
<div id="new-registration-banner" class="main" role="status" aria-live="polite" style="display:none;padding-bottom:0"></div>
<div id="main" class="main" style="display:none"></div>
<footer id="footer"></footer>
<script>
// Per-term client cache — switching the term filter back and forth used to
// refetch and rebuild the whole assignment list from scratch every time,
// even though the previous term's data was still sitting in memory. A cache
// hit renders instantly and still revalidates in the background, so stale
// data never lingers past the next successful fetch.
let _dashCache = {};
let _loadGen = 0;
let _isFirstLoad = true;
// NEW (finding #7): cached from the last successful render() so
// toggleMyInfo() can rebuild the panel without a fresh round-trip, and so
// a term-filter change doesn't need to re-derive "what's on file."
let _lastDashData = null;
let _myInfoOpen = false;
// fileId -> { ok, text } from this visit's Submit clicks, so a refresh or
// term change that rebuilds the cards doesn't wipe the student's answer.
let _submitMsgs = {};

// A round-trip that happens to finish in well under this many ms would
// otherwise flash the spinner on and off almost instantly, which reads as
// a glitch rather than "fast." Holding it up for a floor of MIN_SPINNER_MS
// makes quick responses feel deliberate instead of jarring.
const MIN_SPINNER_MS = 400;
function _afterMinSpinnerDelay(shownAt, myGen, fn) {
  const run = function() { if (myGen === _loadGen) fn(); };
  if (!shownAt) { run(); return; }
  const remaining = MIN_SPINNER_MS - (Date.now() - shownAt);
  if (remaining > 0) { setTimeout(run, remaining); } else { run(); }
}

function loadData() {
  const refreshBtn = document.getElementById("refresh-btn");
  // The generation counter already prevents a stale response from ever
  // rendering, so rapid re-clicks never glitch the UI — but they still fire
  // redundant concurrent Apps Script executions that are immediately
  // thrown away. Disabling for the duration of this call's own round-trip
  // avoids that waste.
  if (refreshBtn) refreshBtn.disabled = true;
  const sel     = document.getElementById("term-filter");
  const rawTerm = sel ? sel.value : "ALL";
  // The dropdown only ever has the hardcoded "Whole school year" option until this
  // very first response fills in the real list, so the very first call
  // would otherwise send the literal string "ALL" — which is truthy, so
  // the server's termFilter-or-CURRENT_TERM-or-"ALL" fallback never
  // actually consulted the admin-configured CURRENT_TERM. Sending "" only
  // on this one automatic first call lets that fallback do its job; any
  // later call (refresh, or the student genuinely picking "Whole school year")
  // still sends the real selected value.
  const term    = (_isFirstLoad && rawTerm === "ALL") ? "" : (rawTerm || "ALL");
  _isFirstLoad  = false;
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  const myGen   = ++_loadGen;
  const cached  = _dashCache[term];
  let shownSpinnerAt = 0;

  if (cached) {
    render(cached);
  } else {
    // Reset to the spinner state on every fresh (uncached) call — including
    // a retry after a failure — so the error screen never lingers behind it.
    loading.innerHTML = '<div class="spinner"></div><p>Loading your assignments…</p>';
    loading.style.display = "block";
    main.style.display = "none";
    shownSpinnerAt = Date.now();
  }

  google.script.run
    .withSuccessHandler(function(data) {
      if (myGen !== _loadGen) return; // a newer request already superseded this one
      // The first automatic call sends term === "" so the server's
      // CURRENT_TERM fallback resolves it, but render() below then syncs the
      // dropdown to that resolved data.activeTerm — so a manual Refresh right
      // after page load sends that resolved term, not "", and always missed
      // the cache stored under the "" key. Cache under the resolved
      // activeTerm instead so that first response is actually reusable.
      const cacheKey = (data && data.activeTerm) ? data.activeTerm : term;
      if (!data || !data.error) _dashCache[cacheKey] = data;
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() { render(data); if (refreshBtn) refreshBtn.disabled = false; });
    })
    .withFailureHandler(function(e) {
      if (myGen !== _loadGen) return;
      if (cached) { if (refreshBtn) refreshBtn.disabled = false; return; } // still showing valid (if slightly stale) cached data
      // Plain-language message for the student; the real e.message is
      // already logged server-side by whatever threw it, so it isn't
      // repeated here — a stack-trace fragment isn't actionable for them.
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() {
        loading.innerHTML =
          '<p style="color:#b3261e;padding:24px 24px 8px;">⚠ Something went wrong loading your assignments. Try refreshing.</p>' +
          '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1967d2;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
        if (refreshBtn) refreshBtn.disabled = false;
      });
    })
    .getStudentDashboardData(term);
}

function render(data) {
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  // Any refresh (manual, term change, or a cache revalidation) rebuilds the
  // whole card list via innerHTML — preserve scroll position instead of
  // dumping the student back to the top of the list.
  const _scrollTop = main.scrollTop;

  if (data.error) {
    // This is an application-level error (e.g. identity not found) — a
    // separate path from the network-failure branch in loadData(), which
    // already gets both of these. Without them, the header's account
    // label stayed stuck on "Loading…" forever, and there was no way to
    // retry without a full page refresh.
    document.getElementById("account-label").textContent = "—";
    loading.innerHTML =
      '<p style="color:#b3261e;padding:24px 24px 8px;">' + esc(data.error) + '</p>' +
      '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1967d2;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
    return;
  }

  document.getElementById("account-label").textContent = data.googleId || "";

  // NEW (finding #7): cache for toggleMyInfo(), then render the "just
  // registered" notice and (if already open) refresh the My Info panel.
  _lastDashData = data;
  renderNewRegistrationBanner(data);
  if (_myInfoOpen) renderMyInfo(data);

  if (!data.assignments || data.assignments.length === 0) {
    main.innerHTML = renderWarmUps(data) + \`<div class="empty-state">
      <div class="icon">📋</div>
      <p>\${esc(data.emptyReason || "No assignments found.")}</p>
    </div>\`;
    loading.style.display = "none";
    main.style.display    = "block";
    _populateTermDropdown(data);
    return;
  }

  // Block sort order — uses system default, gracefully handles unknown values
  // Admins can customize this via the BLOCK_ORDER Script Property
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  const groups = {};
  data.assignments.forEach(a => {
    if (!groups[a.folderLabel]) groups[a.folderLabel] = [];
    groups[a.folderLabel].push(a);
  });

  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ba = a.split(" - ")[0], bb = b.split(" - ")[0];
    const ia = blockOrder.indexOf(ba), ib = blockOrder.indexOf(bb);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return a.localeCompare(b);
  });

  let html = renderWarmUps(data);
  sortedGroups.forEach(gk => {
    html += \`<div class="group-header">Block \${esc(gk)}</div>\`;
    groups[gk].forEach(a => {
      const isDone = a.statusClass === "DONE";
      html += \`<div class="card \${a.statusClass}">
        <div class="card-top">
          <div class="unit-name">\${esc(a.unitName)}</div>
          <div class="pill pill-\${a.statusClass}">\${esc(a.displayStatus)}</div>
        </div>
        <!-- FIXED: was a fixed "Period X · Subject" template — a blank
             period rendered as a dangling "Period  ·" (empty label, double
             space). Mirrors the teacher dashboard's conditional-join
             pattern (07_TeacherDashboard.js's student-meta line). -->
        <div class="card-meta">\${[a.period && "Period "+esc(a.period), esc(a.subject)].filter(Boolean).join(" &nbsp;·&nbsp; ") || "No class info on file"}</div>
        <div class="eval-line">\${a.lastEval ? "Last checked: " + esc(a.lastEval) : "Not checked yet"}</div>
        <div class="card-actions">
        \${safeDocUrl(a.docUrl)
          ? \`<a href="\${esc(safeDocUrl(a.docUrl))}" target="_blank" class="open-btn \${isDone?"done-btn":""}">Open My Document ↗</a>\`
          : '<span style="color:var(--text-secondary);font-size:13px;">Document not yet available</span>'
        }
        \${a.canSubmit
          ? \`<button class="submit-btn" data-file="\${esc(a.fileId)}" data-config="\${esc(a.configId)}" onclick="submitWork(this)">Submit for Feedback</button>\`
          : ""
        }
        </div>
        \${_submitMsgs[a.fileId]
          ? \`<div class="submit-msg \${_submitMsgs[a.fileId].ok ? "ok" : "err"}" role="status">\${esc(_submitMsgs[a.fileId].text)}</div>\`
          : ""
        }
        \${a.submittedAt
          ? \`<div class="submitted-note">Last submitted \${esc(a.submittedAt)}</div>\`
          : ""
        }
        \${a.statusClass === "ISSUE" && a.teacherEmail
          ? \`<div style="margin-top:8px"><a href="mailto:\${esc(a.teacherEmail)}?subject=\${encodeURIComponent("Question about: " + a.unitName)}" style="font-size:13px;color:#1557b0;text-decoration:none;font-weight:500">✉ Email \${esc(a.teacherName || "your teacher")}</a></div>\`
          : ""
        }
      </div>\`;
    });
  });

  main.innerHTML = html;
  loading.style.display = "none";
  main.style.display    = "block";
  main.scrollTop = _scrollTop;
  document.getElementById("footer").textContent =
    "Last refreshed: " + data.generatedAt + "  ·  " + data.googleId;

  _populateTermDropdown(data);
}

// Warm-ups card, above the assignments: the last warm-up's feedback (with
// the extra-credit reply while it's open) and the current warm-up. Nothing
// is shown until a student has a warm-up.
let _wuDrafts = {}; // "answer:QUEUE" / "reply:QUEUE" -> text typed, kept across re-renders
let _wuMsgs = {};   // same keys -> { ok, text } from this visit's saves

function renderWarmUps(data) {
  const wu = data.warmUps || {};
  if (!wu.current && !wu.previous) return "";
  let html = '<div class="group-header">Warm-ups</div><div class="card warmup-card" role="region" aria-label="Warm-ups">';
  if (wu.previous) html += _wuPrevious(wu.previous);
  if (wu.current) html += _wuCurrent(wu.current);
  return html + '</div>';
}

function _wuHead(label, w) {
  return '<div class="wu-head"><div class="wu-label">' + esc(label) + ' · ' + esc(w.dateLabel) +
    (w.course ? ' <span class="wu-course">' + esc(w.course) + '</span>' : '') + '</div>' +
    '<div class="pill pill-' + esc(w.statusClass) + '">' + esc(w.displayStatus) + '</div></div>';
}

function _wuOpenLink(w) {
  const url = safeDocUrl(w.docUrl);
  return url ? '<a href="' + esc(url) + '" target="_blank" class="open-btn wu-open">Open warm-up ↗</a>' : '';
}

function _wuBox(kind, w, saved, label, rows) {
  const key = kind + ":" + w.queueId;
  const value = Object.prototype.hasOwnProperty.call(_wuDrafts, key) ? _wuDrafts[key] : saved;
  const msg = _wuMsgs[key];
  return '<label class="wu-sr" for="wu-' + kind + '-' + esc(w.queueId) + '">' + esc(label) + '</label>' +
    '<textarea id="wu-' + kind + '-' + esc(w.queueId) + '" class="wu-text" rows="' + rows + '" data-key="' + esc(key) + '" oninput="wuDraft(this)">' + esc(value || "") + '</textarea>' +
    '<div class="card-actions"><button class="submit-btn" data-kind="' + kind + '" data-queue="' + esc(w.queueId) + '" onclick="saveWarmUp(this)">' +
    (kind === "answer" ? (saved ? "Update answer" : "Save answer") : (saved ? "Update reply" : "Save reply")) + '</button></div>' +
    '<div id="wu-msg-' + kind + '-' + esc(w.queueId) + '" class="submit-msg ' + (msg ? (msg.ok ? "ok" : "err") : "") + '" role="status">' + (msg ? esc(msg.text) : "") + '</div>';
}

function _wuPrevious(w) {
  let h = '<div class="wu-section">' + _wuHead("Last warm-up", w);
  if (w.score) {
    h += '<div class="wu-score"><b>' + esc(w.score.points) + '/' + esc(w.score.max) + '</b>' +
      (w.score.extra ? ' <span class="wu-plus">+' + esc(w.score.extra) + ' extra credit</span>' : '') +
      '<span class="wu-parts">Length ' + esc(w.score.length) + ' · Grammar ' + esc(w.score.grammar) +
      ' · Engagement ' + esc(w.score.engagement) + '</span></div>';
  }
  if (w.feedback) h += '<div class="wu-feedback">' + esc(w.feedback) + '</div>';
  if (!w.textBox) h += _wuOpenLink(w);
  const ec = w.extraCredit || {};
  if (ec.credited) {
    h += '<div class="wu-ec done">✓ Extra credit earned</div>';
  } else if (ec.open && ec.canReply) {
    h += '<div class="wu-ec">Extra credit: reply to this feedback in at least ' + esc(ec.minWords) + ' words by ' + esc(ec.byLabel) + '.</div>' +
      _wuBox("reply", w, ec.reply, "Your reply to the feedback", 3) +
      (ec.reply ? '<div class="wu-note">Your reply is saved and checked overnight.</div>' : '');
  } else if (ec.open) {
    h += '<div class="wu-ec">Extra credit: reply under the feedback in your doc (at least ' + esc(ec.minWords) + ' words) by ' + esc(ec.byLabel) + '.</div>';
  }
  return h + '</div>';
}

function _wuCurrent(w) {
  let h = '<div class="wu-section">' + _wuHead(w.isToday ? "Today's warm-up" : "Next warm-up", w);
  if (!w.textBox) return h + _wuOpenLink(w) + '</div>';
  if (w.bridge) h += '<div class="wu-bridge">' + esc(w.bridge) + '</div>';
  h += '<div class="wu-prompt">' + esc(w.warmup) + '</div>';
  if (w.canAnswer) {
    h += _wuBox("answer", w, w.answer, "Your answer", 5);
    if (w.answer && !_wuMsgs["answer:" + w.queueId]) {
      h += '<div class="wu-note">Saved ' + esc(w.savedAt || "") + '. You can change it until the end of the day.</div>';
    }
  } else if (w.answer) {
    h += '<div class="wu-answer"><b>Your answer</b><br>' + esc(w.answer) + '</div>';
  }
  return h + '</div>';
}

function wuDraft(el) {
  _wuDrafts[el.getAttribute("data-key")] = el.value;
}

function saveWarmUp(btn) {
  const kind = btn.getAttribute("data-kind");
  const id = btn.getAttribute("data-queue");
  const key = kind + ":" + id;
  const box = document.getElementById("wu-" + kind + "-" + id);
  const text = box ? box.value : "";
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  const finish = function (res) {
    btn.disabled = false;
    btn.textContent = label;
    const msgEl = document.getElementById("wu-msg-" + kind + "-" + id);
    if (res && res.ok) {
      _wuMsgs[key] = { ok: true, text: "Saved " + res.savedAt + "." +
        (kind === "answer" ? " You can change it until the end of the day." : " It's checked overnight.") };
      delete _wuDrafts[key];
      _dashCache = {}; // the next refresh fetches the saved text
      const wu = (_lastDashData && _lastDashData.warmUps) || {};
      if (kind === "answer" && wu.current && wu.current.queueId === id) wu.current.answer = text;
      if (kind === "reply" && wu.previous && wu.previous.queueId === id) wu.previous.extraCredit.reply = text;
    } else {
      _wuMsgs[key] = { ok: false, text: (res && res.error) ||
        "Couldn't save. Your writing is still in the box: try again in a minute." };
    }
    if (msgEl) {
      msgEl.className = "submit-msg " + (_wuMsgs[key].ok ? "ok" : "err");
      msgEl.textContent = _wuMsgs[key].text;
    }
  };
  google.script.run
    .withSuccessHandler(finish)
    .withFailureHandler(function () { finish(null); })
    [kind === "answer" ? "submitWarmUpAnswer" : "submitWarmUpReply"](id, text);
}

// Submit for Feedback: the doc's own menu can't run for student accounts
// (district setting), so the dashboard submits instead. The server reads
// the doc and checks it; this only shows the answer under the card.
const SUBMIT_ERRORS = {
  TOO_SHORT: null, // worded below with the word count
  NO_RESPONSE_SECTION: "Your document is missing its \\"── YOUR RESPONSE BEGINS HERE ──\\" line, so there's nothing to check. Ask your teacher.",
  ALREADY_QUEUED: "This is already waiting for feedback. Check back in a few minutes.",
  ALREADY_TURNED_IN: "You've already turned this in.",
  NOT_REGISTERED: "This assignment isn't open for you any more. Ask your teacher.",
  NOT_OPEN_YET: "This assignment opens the evening before its lesson. Check back then.",
  NO_USER: "Sign into your school Google account and refresh this page.",
  // System-side problems only the teacher can fix: retrying won't help.
  DOC_UNREADABLE: "The system can't open your document right now. Your work is safe. Tell your teacher.",
  NO_QUEUE: "The system can't take submissions right now. Your work is safe. Tell your teacher.",
  SERVER_ERROR: "Something went wrong on the system's side. Your work is safe. Tell your teacher."
};
const SUBMIT_FALLBACK = "The assignment system didn't answer. Your work is safe in your document.\\nTry again in a minute. If it keeps happening, tell your teacher.";

function submitWork(btn) {
  const fileId = btn.getAttribute("data-file");
  const configId = btn.getAttribute("data-config");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  const done = function(msg) {
    _submitMsgs[fileId] = msg;
    _dashCache = {};
    if (_lastDashData) render(_lastDashData);
  };
  google.script.run
    .withSuccessHandler(function(res) {
      if (res && res.ok) {
        done({ ok: true, text: !res.aiFlowsLive
          ? "✅ Submitted. Your teacher can see your work and will review it directly."
          : res.feedbackInComments
            ? "✅ Submitted. In a few minutes your feedback will be a comment on your document: open it and click Comments (top right)."
            : "✅ Submitted. Your feedback will appear near the top of your document in a few minutes. Refresh the document to see it." });
        return;
      }
      const code = res && res.error;
      if (code === "TOO_SHORT") {
        const w = res.words || 0;
        done({ ok: false, text: "Not enough to evaluate yet. " +
          (w > 0 ? "You've written about " + w + " word" + (w === 1 ? "" : "s") + "." : "You haven't written anything in the response section yet.") +
          "\\nAim for at least 25 words below the \\"── YOUR RESPONSE BEGINS HERE ──\\" line." });
        return;
      }
      if (code === "SYSTEM_TEXT_IN_RESPONSE") {
        done({ ok: false, text: "Your response has text copied from a feedback block: " +
          (res.found || "[SYSTEM:") + "\\nDelete that line from your response and submit again." });
        return;
      }
      done({ ok: false, text: SUBMIT_ERRORS[code] || SUBMIT_FALLBACK });
    })
    .withFailureHandler(function() { done({ ok: false, text: SUBMIT_FALLBACK }); })
    .submitMyWork(fileId, configId);
}

// NEW (finding #7): an immediate, in-app "just registered" notice —
// replacing the original easy-to-miss one-time email — for every
// registration flagged isNewRegistration by the server (within the last
// few days). Naturally stops showing once that window passes; no
// separate "seen it" state to track.
function renderNewRegistrationBanner(data) {
  const el = document.getElementById("new-registration-banner");
  const fresh = (data.assignments || []).filter(a => a.isNewRegistration);
  if (!fresh.length) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "block";
  el.innerHTML = fresh.map(a =>
    \`<div class="new-reg-notice">🎉 You were just registered for <strong>\${esc(a.className)}</strong> with <strong>\${esc(a.teacherName || "your teacher")}</strong>\${a.registeredAt ? " on " + esc(a.registeredAt) : ""}. Check <strong>My Info</strong> above to confirm what's on file.</div>\`
  ).join("");
}

// NEW (finding #7): a persistent "My Info" view — every registration on
// file for this student (name, class, period, teacher), with a way to
// flag a correction, available any time via the header button rather
// than only appearing once.
function toggleMyInfo() {
  _myInfoOpen = !_myInfoOpen;
  const btn   = document.getElementById("my-info-btn");
  const panel = document.getElementById("my-info-panel");
  btn.setAttribute("aria-expanded", String(_myInfoOpen));
  panel.style.display = _myInfoOpen ? "block" : "none";
  if (_myInfoOpen && _lastDashData) renderMyInfo(_lastDashData);
}

function renderMyInfo(data) {
  const panel = document.getElementById("my-info-panel");
  const regs  = data.assignments || [];
  if (!regs.length) {
    panel.innerHTML = '<div class="empty-state"><p>No registration on file yet.</p></div>';
    return;
  }
  panel.innerHTML =
    '<div class="group-header">My Info — What Is On File</div>' +
    regs.map(a => {
      const correctionSubject = encodeURIComponent("Correction request: my info on file");
      const correctionBody = encodeURIComponent(
        "Hi " + (a.teacherName || "") + ",\\n\\n" +
        "I'd like to flag something that may be incorrect in what's on file for me:\\n\\n" +
        "Name: " + a.studentName + "\\n" +
        "Class: " + a.className + "\\n" +
        "Period: " + (a.period || "(not on file)") + "\\n\\n" +
        "What should be corrected: \\n"
      );
      return \`<div class="info-card">
        <div class="info-row"><b>Name:</b> \${esc(a.studentName || "(not on file)")}</div>
        <div class="info-row"><b>Class:</b> \${esc(a.className)}</div>
        <div class="info-row"><b>Period:</b> \${esc(a.period || "(not on file)")}</div>
        <div class="info-row"><b>Teacher:</b> \${esc(a.teacherName || "(not on file)")}</div>
        \${a.teacherEmail
          ? \`<a class="correction-link" href="mailto:\${esc(a.teacherEmail)}?subject=\${correctionSubject}&body=\${correctionBody}">✉ Request a correction</a>\`
          : ""
        }
      </div>\`;
    }).join("");
}

// Was only ever called from the end of the full-render path, so the term
// dropdown never got populated with real options when a filtered view came
// back empty — factored out so both branches can call it.
function _populateTermDropdown(data) {
  const sel = document.getElementById("term-filter");
  if (sel && data.availableTerms) {
    const existing = [...sel.options].map(o => o.value);
    data.availableTerms.forEach(t => {
      if (!existing.includes(t)) {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = termLabel(t);
        sel.appendChild(opt);
      }
    });
    if (data.activeTerm && data.activeTerm !== "ALL") sel.value = data.activeTerm;
  }
}

${CLIENT_ESC_JS}
${CLIENT_SAFE_DOC_URL_JS}
${CLIENT_WORDS_JS}

loadData();
</script>
${casTermsPanelHtml_("What these words mean", "The words you see on this page and in your assignment documents.", CAS_STUDENT_TERMS)}
</body>
</html>`;
}
