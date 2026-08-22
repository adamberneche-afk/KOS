// =============================================================================
// FILE: 01_StudentDoc_ContainerScript.js
// BOUND TO: Master Student Template Google Doc (container-bound)
// =============================================================================

// Document zone markers
const RESPONSE_MARKER  = "── YOUR RESPONSE BEGINS HERE ──";
const CONFIG_ID_MARKER = "[CONFIG_ID:";
const SYS_ID_MARKER    = "[SYS_LEDGER_SS_ID:";

// Cooldown: prevent duplicate queue submissions within this window (ms)
const SUBMISSION_COOLDOWN_MS = 90000; // 90 seconds

// Minimum response length with a human-readable explanation
const MIN_RESPONSE_CHARS = 150;
const MIN_RESPONSE_WORDS = 25;

// ---------------------------------------------------------------------------
// readSystemIds — self-contained, no Script 17 dependency
// ---------------------------------------------------------------------------
function readSystemIds() {
  const props = PropertiesService.getScriptProperties();
  const lp    = props.getProperty("CENTRAL_LEDGER_SS_ID");
  const ap    = props.getProperty("ADMIN_SS_ID");
  if (lp && ap) return { ledgerSsId: lp, adminSsId: ap };

  try {
    const text = DocumentApp.getActiveDocument().getBody().getText();
    const lm   = text.match(/\[SYS_LEDGER_SS_ID:([a-zA-Z0-9_-]+)\]/);
    const am   = text.match(/\[SYS_ADMIN_SS_ID:([a-zA-Z0-9_-]+)\]/);
    if (lm && am) return { ledgerSsId: lm[1], adminSsId: am[1] };
  } catch (e) {
    Logger.log("readSystemIds fallback error: " + e.message);
  }
  return null;
}

// ---------------------------------------------------------------------------
// onOpen
// ---------------------------------------------------------------------------
function onOpen() {
  DocumentApp.getUi()
    .createMenu("📊 AI Evaluation Panel")
    .addItem("Run Assignment Check",  "runSystemCheck")
    .addSeparator()
    .addItem("📬 Check My Status",    "checkSubmissionStatus")
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
      "Document Not Configured",
      "This document is missing its system setup. Contact your teacher.",
      ui.ButtonSet.OK
    );
    return;
  }

  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) {
    ui.alert(
      "Not Signed In",
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
      "Assignment Token Missing",
      "The tracking code at the bottom of your document is missing or damaged.\n\n" +
      "Please contact your teacher — do not try to fix this yourself.",
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
        "Already Submitted ⏳",
        "Your work was just submitted for evaluation.\n\n" +
        "Please wait " + remaining + " more second" + (remaining === 1 ? "" : "s") +
        " before submitting again.\n\n" +
        "Your feedback will appear at the top of this document within 1–3 minutes.",
        ui.ButtonSet.OK
      );
      return;
    }
  }

  if (!validateRoster_(ids, googleId, fileId, configId)) {
    ui.alert(
      "Account Not Recognized",
      "The Google account you're using (" + googleId + ") isn't registered for this assignment.\n\n" +
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
      : "You haven't written anything in the response section yet.";

    ui.alert(
      "Not Enough to Evaluate Yet",
      "Your response needs a bit more before the system can give you useful feedback.\n\n" +
      current + "\n\n" +
      "Aim for at least " + MIN_RESPONSE_WORDS + " words in the\n" +
      "── YOUR RESPONSE BEGINS HERE ── section.\n\n" +
      "The more you write, the more specific your feedback will be.",
      ui.ButtonSet.OK
    );
    return;
  }

  submitToQueue_(ids, googleId, fileId, configId, studentText);

  // Record submission timestamp for cooldown
  PropertiesService.getScriptProperties().setProperty(cooldownKey, Date.now().toString());

  ui.alert(
    "✅ Submitted for Feedback",
    "Your work is being evaluated now.\n\n" +
    "Your feedback will appear at the top of this document within 1–3 minutes.\n\n" +
    "You can keep this tab open and refresh the page to see it when it arrives.",
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
function validateRoster_(ids, googleId, fileId, configId) {
  try {
    const ss    = SpreadsheetApp.openById(ids.ledgerSsId);
    const sheet = ss.getSheetByName("Ledger");
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (
        data[i][1].toString().toLowerCase() === googleId.toLowerCase() &&
        data[i][2].toString()               === configId               &&
        data[i][3].toString()               === fileId
      ) return true;
    }
    return false;
  } catch (e) {
    Logger.log("validateRoster_ error: " + e.message);
    return false;
  }
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
function submitToQueue_(ids, googleId, fileId, configId, studentText) {
  const ss    = SpreadsheetApp.openById(ids.adminSsId);
  const sheet = ss.getSheetByName("ReviewQueue");
  if (!sheet) throw new Error("ReviewQueue tab not found.");
  sheet.appendRow([new Date(), googleId, fileId, configId, studentText, "PENDING", ""]);
  Logger.log("Queue submission — ConfigID: " + configId);
}

// ---------------------------------------------------------------------------
// checkSubmissionStatus
// ---------------------------------------------------------------------------
function checkSubmissionStatus() {
  const ui       = DocumentApp.getUi();
  const ids      = readSystemIds();
  if (!ids) {
    ui.alert("Status Unavailable", "Document configuration is missing. Contact your teacher.", ui.ButtonSet.OK);
    return;
  }

  const googleId = Session.getActiveUser().getEmail();
  const doc      = DocumentApp.getActiveDocument();
  const fileId   = doc.getId();
  const fullText = doc.getBody().getText();
  const configId = extractConfigId_(fullText);

  if (!configId) {
    ui.alert("Status Unavailable", "Assignment token not found. Contact your teacher.", ui.ButtonSet.OK);
    return;
  }

  const info = fetchStatus_(ids, googleId, fileId, configId);
  if (!info) {
    ui.alert(
      "Not Registered",
      "Your Google account (" + googleId + ") isn't registered for this assignment.\n\n" +
      "If you just got access to this document, your teacher may still be setting things up.\n\n" +
      "Try again in a few minutes, or ask your teacher.",
      ui.ButtonSet.OK
    );
    return;
  }

  ui.alert("📬 Your Status", buildStatusMessage_(info, configId), ui.ButtonSet.OK);
}

// ---------------------------------------------------------------------------
// fetchStatus_
// ---------------------------------------------------------------------------
function fetchStatus_(ids, googleId, fileId, configId) {
  try {
    const ss    = SpreadsheetApp.openById(ids.ledgerSsId);
    const sheet = ss.getSheetByName("Ledger");
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (
        data[i][1].toString().toLowerCase() === googleId.toLowerCase() &&
        data[i][2].toString()               === configId               &&
        data[i][3].toString()               === fileId
      ) {
        return {
          status:      String(data[i][12]).trim(),
          submittedAt: data[i][13] ? String(data[i][13]) : null,
          lastEval:    data[i][15] ? String(data[i][15]) : null,
          unitCode:    String(data[i][10]).trim(),
          teacherName: String(data[i][7]  || "").trim(),
          term:        String(data[i][18] || "").trim()
        };
      }
    }
    return null;
  } catch (e) {
    Logger.log("fetchStatus_ error: " + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// buildStatusMessage_ — plain language, meets students where they are
// ---------------------------------------------------------------------------
function buildStatusMessage_(info, configId) {
  const lines = [];
  if (info.unitCode)    lines.push("Assignment: " + info.unitCode);
  if (info.teacherName) lines.push("Teacher:    " + info.teacherName);
  if (info.term)        lines.push("Term:       " + info.term);
  const header   = lines.join("\n");
  const evalLine = info.lastEval
    ? "Last feedback: " + info.lastEval
    : "No feedback yet.";

  switch (info.status) {
    case "ACTIVE":
      return header + "\n\n" +
        "📝  In Progress\n\n" +
        evalLine + "\n\n" +
        "When you're ready for feedback, click:\n" +
        "📊 AI Evaluation Panel → Run Assignment Check";

    case "STAGED": case "PENDING":
      return header + "\n\n" +
        "⏳  Being Evaluated Right Now\n\n" +
        "Your feedback should appear at the top of this document\n" +
        "within the next 1–3 minutes.\n\n" +
        "Keep this tab open — you can refresh to see it.";

    case "COMPLETE":
      return header + "\n\n" +
        "📋  Feedback Has Been Delivered\n\n" +
        evalLine + "\n\n" +
        "Scroll to the top of this document to read your feedback.\n\n" +
        "If it says your work passed → use the Turn-In Form to submit.\n" +
        "If it says revisions are needed → fix your work and run another check.";

    // NEW (Say/Do Ledger cas-ccps finding #1): a genuine-complete submission
    // no longer jumps straight to COMPLIANT — it waits here for the teacher's
    // own review first. Deliberately doesn't mention a score at all (matching
    // the Warm-Up pipeline's "never mention points/scores" convention), since
    // nothing is final until the teacher confirms or overrides it.
    case "PENDING_TEACHER_REVIEW":
      return header + "\n\n" +
        "✅  Submitted — Awaiting Teacher Review\n\n" +
        "Submitted: " + (info.submittedAt || "—") + "\n\n" +
        "Your submission passed all automated checks and is now waiting for " +
        "your teacher to take a look. You'll hear back once they've reviewed it.";

    case "COMPLIANT":
      return header + "\n\n" +
        "✅  Submitted and Verified\n\n" +
        "Submitted: " + (info.submittedAt || "—") + "\n\n" +
        "Your final submission has been received. You're all done!";

    default:
      if (info.status.startsWith("ERROR")) {
        return header + "\n\n" +
          "⚠️  Something Needs Attention\n\n" +
          "There's a problem with your submission that your teacher needs to look at.\n\n" +
          "Show your teacher this code: " + configId;
      }
      return header + "\n\nStatus: " + info.status + "\n\n" + evalLine;
  }
}
