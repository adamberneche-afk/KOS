// =============================================================================
// FILE: 71b_TurnInStudent.js
// BOUND TO: Student Dashboard (standalone web app) and Central Ledger
//           spreadsheet (cas-ccps:student-dashboard, cas-ccps:central-ledger)
// TRIGGERS: none.
//
// PURPOSE: the turn-in code's student side (meta/TURN_IN_CODE_PLAN_2026-11.md,
// D17), split out of 71_TurnInCodes.js on 2026-11-08 (stage 3) without a
// change: what the card shows (turnInView_), the two functions a student
// calls through google.script.run (getMyTurnInState, submitTurnInAnswer,
// each acting only on the caller's own Ledger row; listed in
// tools/gas-lint/webapp-public-allow.json), the dashboard's data
// (turnInAttach_, called by 13) and the client half pasted into the Student
// Dashboard page. 71 keeps the codes, the checks, the term rule, the
// overrides and the grant; it is also part of the Teacher Dashboard project
// (stage 3's panel, 73), which must not serve these student functions: that
// project's public functions are all teacher-only. Everything here reads
// 71's constants and helpers, so this file is always loaded with 71.
// =============================================================================

// What the card shows for one assignment, or null for nothing:
//   { state: "READY", code }               the code, with Copy
//   { state: "PENDING_CHECK" }             "Checking your answer…"
//   { state: "NOT_YET", reason, question } the reason, and the form again
//   { state: "CHECK_FAILED", question }    the check couldn't run; the form again
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
  if (!turnInTermOpen_(ss, row, now, cache)) return { state: "TERM_CLOSED" };
  const view = { state: "ANSWER", kind: prompt.kind, question: prompt.question, minWords: REFLECTION_MIN_WORDS };
  if (check && String(check[TCHK.STATUS]).trim() === TURN_IN_NOT_YET) {
    view.state = TURN_IN_NOT_YET;
    view.reason = String(check[TCHK.REASON] || "").trim();
  } else if (check && String(check[TCHK.STATUS]).trim() === TURN_IN_CHECK_FAILED) {
    // Reason holds the system's note for the teacher, never shown here.
    view.state = TURN_IN_CHECK_FAILED;
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
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    if (!turnInSwitchCoversRow_(ss, row)) return _turnInRefuse_("OFF");
    return { ok: true, turnIn: turnInView_(ss, cfg, row) };
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
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  if (!turnInSwitchCoversRow_(ss, row)) return _turnInRefuse_("OFF");
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

// Adds a.turnIn to each card the switch covers (its course, or its lesson:
// 71's turnInSwitchCovers_) that has something to show. With the switch off everywhere it returns at once and adds nothing,
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
    if (!row || !turnInSwitchCoversRow_(ss, row, raw, cache)) return;
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
    } else if (t.state === "CHECK_FAILED") {
      h += '<p class="ti-notyet">We couldn\\u2019t check your answer. Your teacher can see it. You can also send it again.</p>';
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
  // scriptRun (13): google.script.run on the real page, the demo's stubs in
  // demo mode, so a demo never reaches the server.
  scriptRun()
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
