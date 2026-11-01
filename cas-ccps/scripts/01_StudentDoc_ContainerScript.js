// =============================================================================
// FILE: 01_StudentDoc_ContainerScript.js
// BOUND TO: Master Student Template Google Doc (container-bound)
//
// STATUS (D16, 2026-11-01): UNREACHABLE FOR STUDENTS. The district doesn't
// let students run Apps Script, so this doc menu never works for them; they
// submit from the Student Dashboard (13). Kept because each student doc is a
// copy of the template this is bound to, and its menu still works for the
// teacher. Don't build student features here.
// =============================================================================

// Document zone markers
const RESPONSE_MARKER  = "── YOUR RESPONSE BEGINS HERE ──";
const CONFIG_ID_MARKER = "[CONFIG_ID:";
const SYS_ID_MARKER    = "[SYS_LEDGER_SS_ID:";
const SYS_SERVICE_MARKER_RE = /\[SYS_DASHBOARD_URL:(https:\/\/[^\]\s]+)\]/;

// Cooldown: prevent duplicate queue submissions within this window (ms)
const SUBMISSION_COOLDOWN_MS = 90000; // 90 seconds

// Minimum response length with a human-readable explanation
const MIN_RESPONSE_CHARS = 150;
const MIN_RESPONSE_WORDS = 25;

// Where feedback lands: a comment on this doc, or written into it, depending
// on the class's setting (00's FEEDBACK_AS_COMMENT). The menu can't read
// that setting as a student, so it names both.
const FEEDBACK_WHERE_TEXT =
  "Find it in this doc: click the Comments button (top right), or look " +
  "just above “Your response”.";
const FEEDBACK_ARRIVES_TEXT =
  "Feedback usually arrives within a few minutes. " + FEEDBACK_WHERE_TEXT + "\n\n" +
  "Your assignment dashboard shows when it's ready.";

const SERVICE_DOWN_MESSAGE =
  "Your assignment dashboard didn't answer. Your work is safe in this document.\n\n" +
  "Try again in a minute. If it keeps happening, tell your teacher.";

// ---------------------------------------------------------------------------
// _aiFlowsLive_ (external UX audit) — reads the same AI_FLOWS_LIVE Script
// Property 00_SharedConfig.js's getConfig_() exposes as cfg.aiFlowsLive,
// but directly via PropertiesService rather than through getConfig_()
// itself — that function throws if ADMIN_SS_ID/CENTRAL_LEDGER_SS_ID aren't
// set, which readSystemIds() above is specifically built to tolerate (its
// own fallback reads IDs embedded in the doc body instead). This flag
// needs neither of those IDs to be meaningful, so it's read the same
// direct-property way readSystemIds() reads its own fallback-optional
// properties, rather than introducing a new crash path into a function
// that's designed to degrade gracefully without them.
// ---------------------------------------------------------------------------
function _aiFlowsLive_() {
  return String(PropertiesService.getScriptProperties().getProperty("AI_FLOWS_LIVE")).toLowerCase() === "true";
}

// ---------------------------------------------------------------------------
// openStudentDashboard (external UX audit) — the Student Dashboard web app
// was fully built (Script 13) but had no menu item, no link in the doc, and
// no email pointing to it anywhere in the repo, so no student could ever
// find it. Reads STUDENT_DASHBOARD_URL directly rather than through
// getConfig_(), same reasoning as _aiFlowsLive_() above: this menu item
// should degrade to "not configured yet" rather than throwing if
// ADMIN_SS_ID/CENTRAL_LEDGER_SS_ID haven't been set on this deployment.
// ---------------------------------------------------------------------------
// It finds the URL the way readSystemIds() does (2026-10-22): a student's
// copy of the doc has no Script Properties, only the link 02 stamps.
function openStudentDashboard() {
  const ids = readSystemIds();
  DocumentApp.getUi().alert(
    "Your assignment dashboard",
    ids ? "Open this link and bookmark it:\n\n" + ids.serviceUrl
        : "Your dashboard isn't set up yet. Tell your teacher.",
    DocumentApp.getUi().ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// readSystemIds — self-contained, no Script 17 dependency
// ---------------------------------------------------------------------------
// Returns { serviceUrl } or null. serviceUrl is the Student Dashboard web
// app (13_StudentDashboard.js), which runs as the admin: this menu runs as
// the student, so it asks that app for the student's own Ledger row and to
// queue their work, instead of opening the Ledger and the Admin sheet
// itself (which needed every student to have access to both).
// Script Properties don't copy with the doc, so a student's copy finds the
// URL in the invisible system block 02 stamps, or failing that in the
// "Your assignment dashboard:" line.
function readSystemIds() {
  const prop = PropertiesService.getScriptProperties().getProperty("STUDENT_DASHBOARD_URL");
  if (prop) return { serviceUrl: prop };

  try {
    const text = DocumentApp.getActiveDocument().getBody().getText();
    const sm   = text.match(SYS_SERVICE_MARKER_RE);
    if (sm) return { serviceUrl: sm[1] };
    const dm   = text.match(/Your assignment dashboard: (https:\/\/\S+)/);
    if (dm) return { serviceUrl: dm[1] };
  } catch (e) {
    Logger.log("readSystemIds fallback error: " + e.message);
  }
  return null;
}

// POSTs one request to the Student Dashboard web app as the signed-in
// student. The app identifies them from this token, never from the body.
// Returns the app's JSON reply, or { ok: false, error } on any failure.
function callStudentService_(ids, body) {
  try {
    const res = UrlFetchApp.fetch(ids.serviceUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      followRedirects: true,
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      return { ok: false, error: "HTTP_" + res.getResponseCode() };
    }
    return JSON.parse(res.getContentText());
  } catch (e) {
    Logger.log("callStudentService_ error: " + e.message);
    return { ok: false, error: "UNREACHABLE" };
  }
}

// ---------------------------------------------------------------------------
// onOpen
// ---------------------------------------------------------------------------
function onOpen() {
  DocumentApp.getUi()
    .createMenu("📊 Feedback")
    .addItem("Submit for Feedback",   "runSystemCheck")
    .addSeparator()
    .addItem("📬 Where is my work?",  "checkSubmissionStatus")
    .addSeparator()
    .addItem("📈 Open my dashboard",  "openStudentDashboard")
    .addToUi();
}

// ---------------------------------------------------------------------------
// runSystemCheck
// ---------------------------------------------------------------------------
function runSystemCheck() {
  const ui  = DocumentApp.getUi();

  const ids = readSystemIds();
  if (!ids) {
    ui.alert(
      "This doc isn't set up",
      "This doc is missing the link to your assignment dashboard. Tell your teacher.",
      ui.ButtonSet.OK
    );
    return;
  }

  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) {
    ui.alert(
      "Not signed in",
      "Please sign into a Google account and reopen this document.",
      ui.ButtonSet.OK
    );
    return;
  }

  const doc      = DocumentApp.getActiveDocument();
  const fileId   = doc.getId();
  const fullText = doc.getBody().getText();
  const configId = extractConfigId_(fullText);

  if (!configId) {
    ui.alert(
      "This doc can't be matched to its assignment",
      "The assignment code at the end of this doc is missing or changed.\n\n" +
      "Tell your teacher. Please don't try to fix it yourself.",
      ui.ButtonSet.OK
    );
    return;
  }

  // Cooldown check — prevent rapid duplicate submissions
  const cooldownKey = "LAST_SUBMIT_" + fileId;
  const lastSubmit  = PropertiesService.getScriptProperties().getProperty(cooldownKey);
  if (lastSubmit) {
    const elapsed = Date.now() - parseInt(lastSubmit, 10);
    if (elapsed < SUBMISSION_COOLDOWN_MS) {
      const remaining = Math.ceil((SUBMISSION_COOLDOWN_MS - elapsed) / 1000);
      ui.alert(
        "Already submitted ⏳",
        "Your work was just submitted for feedback.\n\n" +
        "Please wait " + remaining + " more second" + (remaining === 1 ? "" : "s") +
        " before submitting again.\n\n" +
        (_aiFlowsLive_()
          ? FEEDBACK_ARRIVES_TEXT
          : "Your work is saved and your teacher can see it. Automatic feedback isn't switched on for your class yet — your teacher will review this directly."),
        ui.ButtonSet.OK
      );
      return;
    }
  }

  const roster = validateRoster_(ids, googleId, fileId, configId);
  if (roster.error && roster.error !== "NOT_REGISTERED") {
    ui.alert("Couldn't reach your dashboard", SERVICE_DOWN_MESSAGE, ui.ButtonSet.OK);
    return;
  }
  if (!roster.ok) {
    ui.alert(
      "This account isn't on this assignment",
      "The Google account you're using (" + googleId + ") isn't on the class list for this assignment.\n\n" +
      "Make sure you opened this document while signed into the correct Google account.\n\n" +
      "If you're not sure which account to use, ask your teacher.",
      ui.ButtonSet.OK
    );
    return;
  }

  const studentText = extractStudentResponse_(fullText);
  const wordCount   = countWords_(studentText);
  const charCount   = studentText.length;

  if (!studentText || charCount < MIN_RESPONSE_CHARS || wordCount < MIN_RESPONSE_WORDS) {
    const current = wordCount > 0
      ? "You've written about " + wordCount + " word" + (wordCount === 1 ? "" : "s") + " so far."
      : "You haven't written anything under “Your response” yet.";

    ui.alert(
      "Write a little more first",
      "Your response needs a bit more before it can get useful feedback.\n\n" +
      current + "\n\n" +
      "Aim for at least " + MIN_RESPONSE_WORDS + " words under “Your response”.\n\n" +
      "The more you write, the more specific your feedback will be.",
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    submitToQueue_(ids, googleId, fileId, configId);
  } catch (e) {
    ui.alert("Couldn't submit", SERVICE_DOWN_MESSAGE, ui.ButtonSet.OK);
    return;
  }

  // Record submission timestamp for cooldown
  PropertiesService.getScriptProperties().setProperty(cooldownKey, Date.now().toString());

  ui.alert(
    "✅ Submitted for feedback",
    _aiFlowsLive_()
      ? "Your work is waiting for feedback.\n\n" + FEEDBACK_ARRIVES_TEXT
      : "Your work is saved and your teacher can see it.\n\n" +
        "Automatic feedback isn't switched on for your class yet — your teacher will review this directly.",
    ui.ButtonSet.OK
  );
}

// ---------------------------------------------------------------------------
// countWords_ — rough word count for student response
// ---------------------------------------------------------------------------
function countWords_(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// validateRoster_
// ---------------------------------------------------------------------------
// Returns the service reply: { ok: true, info } when this account owns this
// doc's Ledger row, { ok: false, error: "NOT_REGISTERED" } when it doesn't,
// any other error when the service couldn't answer. googleId is unused: the
// web app reads who is signed in itself.
function validateRoster_(ids, googleId, fileId, configId) {
  return callStudentService_(ids, { action: "status", fileId: fileId, configId: configId });
}

// ---------------------------------------------------------------------------
// extractConfigId_
// ---------------------------------------------------------------------------
function extractConfigId_(fullText) {
  const m = fullText.match(/\[CONFIG_ID:\s*([A-Z0-9\-]+)\]/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// extractStudentResponse_
// ---------------------------------------------------------------------------
function extractStudentResponse_(fullText) {
  const start = fullText.indexOf(RESPONSE_MARKER);
  if (start === -1) return "";
  const from       = fullText.indexOf("\n", start);
  const configEnd  = fullText.indexOf(CONFIG_ID_MARKER);
  const sysEnd     = fullText.indexOf(SYS_ID_MARKER);
  const candidates = [configEnd, sysEnd].filter(n => n !== -1);
  const to         = candidates.length > 0 ? Math.min(...candidates) : fullText.length;
  return fullText.substring(from, to).trim();
}

// ---------------------------------------------------------------------------
// submitToQueue_
// ---------------------------------------------------------------------------
// Sends only that there is writing to evaluate (checked just above), never
// the writing itself: Flow 2 reads it from this Doc.
function submitToQueue_(ids, googleId, fileId, configId) {
  const res = callStudentService_(ids, {
    action: "submit", fileId: fileId, configId: configId, hasText: true
  });
  if (!res.ok) throw new Error("Could not submit (" + res.error + ").");
  Logger.log("Queue submission — ConfigID: " + configId);
}

// ---------------------------------------------------------------------------
// checkSubmissionStatus
// ---------------------------------------------------------------------------
function checkSubmissionStatus() {
  const ui       = DocumentApp.getUi();
  const ids      = readSystemIds();
  if (!ids) {
    ui.alert("Can't check right now", "This doc is missing the link to your assignment dashboard. Tell your teacher.", ui.ButtonSet.OK);
    return;
  }

  const googleId = Session.getActiveUser().getEmail();
  const doc      = DocumentApp.getActiveDocument();
  const fileId   = doc.getId();
  const fullText = doc.getBody().getText();
  const configId = extractConfigId_(fullText);

  if (!configId) {
    ui.alert("Can't check right now", "The assignment code at the end of this doc is missing. Tell your teacher.", ui.ButtonSet.OK);
    return;
  }

  const res = validateRoster_(ids, googleId, fileId, configId);
  if (res.error && res.error !== "NOT_REGISTERED") {
    ui.alert("Can't check right now", SERVICE_DOWN_MESSAGE, ui.ButtonSet.OK);
    return;
  }
  const info = res.ok ? res.info : null;
  if (!info) {
    ui.alert(
      "This account isn't on this assignment",
      "Your Google account (" + googleId + ") isn't on the class list for this assignment yet.\n\n" +
      "If you just got access to this document, your teacher may still be setting things up.\n\n" +
      "Try again in a few minutes, or ask your teacher.",
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert("📬 Where your work is", buildStatusMessage_(info, configId), ui.ButtonSet.OK);
}


// ---------------------------------------------------------------------------
// buildStatusMessage_ — plain language, meets students where they are
// ---------------------------------------------------------------------------
function buildStatusMessage_(info, configId) {
  // The Student Dashboard's words for each stage (13's resolveStudentStatus_),
  // so the doc and the dashboard never disagree (2026-10-22).
  const lines = [];
  if (info.unitCode)    lines.push("Assignment: " + info.unitCode);
  if (info.teacherName) lines.push("Teacher: " + info.teacherName);
  if (info.term)        lines.push(info.term);
  const header   = lines.join("\n");
  const evalLine = info.lastEval
    ? "Last checked: " + info.lastEval
    : "Not checked yet.";

  switch (info.status) {
    case "ACTIVE":
      return header + "\n\n" +
        "📝  Not submitted yet\n\n" +
        evalLine + "\n\n" +
        "When you're ready for feedback, click:\n" +
        "📊 Feedback → Submit for Feedback";

    case "STAGED": case "PENDING":
      return header + "\n\n" +
        (_aiFlowsLive_()
          ? "⏳  Waiting for feedback\n\n" + FEEDBACK_ARRIVES_TEXT
          : "✅  Saved, and your teacher can see it\n\n" +
            "Automatic feedback isn't switched on for your class yet. " +
            "Your teacher will review this directly.");

    case "COMPLETE":
      return header + "\n\n" +
        (info.lastResult === "PASSED" ? "✅  Passed. Your feedback is ready."
          : info.lastResult === "NEEDS_REVISION" ? "✏️  Feedback is ready. Revise, then submit again."
          : "📋  Your feedback is ready.") + "\n\n" +
        evalLine + "\n\n" +
        FEEDBACK_WHERE_TEXT + "\n\n" +
        "Passed? Turn it in on Canvas when you're ready.\n" +
        "Need to revise? Fix your work, then submit for feedback again.";

    // NEW (Say/Do Ledger cas-ccps finding #1): a genuine-complete submission
    // no longer jumps straight to COMPLIANT — it waits here for the teacher's
    // own review first. Deliberately doesn't mention a score at all (matching
    // the Warm-Up pipeline's "never mention points/scores" convention), since
    // nothing is final until the teacher confirms or overrides it.
    case "PENDING_TEACHER_REVIEW":
      return header + "\n\n" +
        "✅  Turned in — waiting for your teacher\n\n" +
        "Turned in: " + (info.submittedAt || "—") + "\n\n" +
        "Your work is in, and your teacher will look at it next. " +
        "You'll hear back once they've reviewed it.";

    case "COMPLIANT":
      return header + "\n\n" +
        "✅  Done — your teacher confirmed it\n\n" +
        "Turned in: " + (info.submittedAt || "—") + "\n\n" +
        "You're all done with this one!";

    default:
      if (String(info.status).startsWith("ERROR")) {
        return header + "\n\n" +
          "⚠️  Couldn't be checked\n\n" +
          "Something went wrong on our side, not with your work. " +
          "Tell your teacher, and show them this code: " + configId;
      }
      return header + "\n\n" +
        "Status unavailable — check with your teacher.\n\n" + evalLine;
  }
}
