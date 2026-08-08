// =============================================================================
// ARCHIVED — Script 11 is no longer active.
// All rejection messages and flagRejection_() logic have been merged into
// Script 04 (04_Form2_TurnInGate.js) as of the fix pass addressing orphaned
// scripts. This file is retained for reference only. Do not bind or deploy.
// =============================================================================

// =============================================================================
// FILE: 11_StudentFriendlyRejections.js
// EXTENDS: Script 04 (Form 2 Turn-In Gate)
// PURPOSE: Replaces the flagRejection_() function in Script 04 with
//          human-readable, actionable rejection emails for every failure code.
//          No raw system codes sent to students.
//
// TO DEPLOY: Replace flagRejection_() in 04_Form2_TurnInGate.js with
//            this version, or paste both into the same script project.
// =============================================================================

// ---------------------------------------------------------------------------
// flagRejection_ — REPLACES the version in Script 04
// Maps every rejection code to a plain-language student email
// and a separate technical instructor alert
// ---------------------------------------------------------------------------
function flagRejection_(email, code, detail) {
  Logger.log("Turn-in REJECTED — " + email + " | Code: " + code + " | " + detail);

  const studentMessage = buildStudentRejectionMessage_(code, detail);
  const instructorMessage = buildInstructorAlertMessage_(email, code, detail);

  // Student email — plain language, no system codes
  try {
    MailApp.sendEmail(
      email,
      studentMessage.subject,
      studentMessage.body
    );
  } catch (mailErr) {
    Logger.log("Could not send rejection email to " + email + ": " + mailErr.message);
  }

  // Instructor alert — technical detail, for their records
  try {
    MailApp.sendEmail(
      ADMIN_EMAIL_NOTIFY,
      instructorMessage.subject,
      instructorMessage.body
    );
  } catch (mailErr) {
    Logger.log("Could not send instructor notification: " + mailErr.message);
  }
}

// ---------------------------------------------------------------------------
// buildStudentRejectionMessage_ — returns subject + body for the student
// Every message answers three questions:
//   1. What happened?
//   2. Why did it happen?
//   3. Exactly what do I do now?
// ---------------------------------------------------------------------------
function buildStudentRejectionMessage_(code, detail) {
  switch (code) {

    case "INVALID_URL":
      return {
        subject: "⚠️ Submission Issue — Please Check Your Document Link",
        body:
          "There was a problem with your assignment submission.\n\n" +
          "WHAT HAPPENED:\n" +
          "The document link you submitted doesn't appear to be a valid Google Docs link.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Open your assignment document in Google Docs.\n" +
          "  2. Copy the full URL from your browser's address bar.\n" +
          "     It should look like: https://docs.google.com/document/d/...\n" +
          "  3. Go back to the Turn-In Form and submit again with the correct link.\n\n" +
          "If you're still having trouble, contact your instructor.\n\n" +
          "— Assignment System"
      };

    case "MISSING_CONFIG_ID":
      return {
        subject: "⚠️ Submission Issue — Wrong Document Submitted",
        body:
          "There was a problem with your assignment submission.\n\n" +
          "WHAT HAPPENED:\n" +
          "The document you submitted does not appear to be your official assignment document. " +
          "It's missing the assignment tracking code that was placed at the top of your document.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Find the original document that was shared with you when you registered.\n" +
          "     Check the email you received from the Assignment System with the subject line\n" +
          "     \"Your Assignment Workspace Is Ready\".\n" +
          "  2. Make sure you are submitting THAT document, not a copy or a new document.\n" +
          "  3. The tracking code at the top should look like: [CONFIG_ID: VDOE-XXXX-XXXX]\n" +
          "     Do not delete or modify that section.\n\n" +
          "If you cannot find your original document, contact your instructor.\n\n" +
          "— Assignment System"
      };

    case "DOC_ACCESS_ERROR":
      return {
        subject: "⚠️ Submission Issue — Document Could Not Be Opened",
        body:
          "There was a problem with your assignment submission.\n\n" +
          "WHAT HAPPENED:\n" +
          "The system was unable to access your document. " +
          "This usually means the sharing settings on your document have changed.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Open your assignment document.\n" +
          "  2. Click the Share button (top right corner).\n" +
          "  3. Make sure the document is still shared with your teacher's email address.\n" +
          "  4. Submit the Turn-In Form again.\n\n" +
          "If you are not sure who to share it with, contact your instructor.\n\n" +
          "— Assignment System"
      };

    case "LEDGER_MISMATCH":
      return {
        subject: "⚠️ Submission Issue — Document Could Not Be Verified",
        body:
          "There was a problem with your assignment submission.\n\n" +
          "WHAT HAPPENED:\n" +
          "The system could not match your submission to your registered account. " +
          "This can happen if you submitted using a different Google account than the one " +
          "you used when you registered, or if you are submitting a document that was not " +
          "assigned to you.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Make sure you are signed into Google with your school account.\n" +
          "  2. Make sure you are submitting YOUR original assignment document — not a copy " +
          "     or a classmate's document.\n" +
          "  3. Try submitting the Turn-In Form again.\n\n" +
          "If the problem continues, contact your instructor and mention that you received " +
          "a \"verification\" error.\n\n" +
          "— Assignment System"
      };

    case "NO_EVALUATION_FOUND":
      return {
        subject: "⚠️ Submission Not Accepted — Evaluation Required First",
        body:
          "Your assignment was not accepted for submission yet.\n\n" +
          "WHAT HAPPENED:\n" +
          "Before you can submit your final assignment, you need to request at least one " +
          "evaluation from the AI coach and receive a passing result.\n\n" +
          "Your document doesn't show a passing evaluation yet.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Open your assignment document.\n" +
          "  2. Make sure your work is written in the document.\n" +
          "  3. Click: 📊 AI Evaluation Panel → Run Assignment System Check\n" +
          "  4. Wait 1–3 minutes for your feedback to appear at the bottom of the document.\n" +
          "  5. If your work passes, the document will show a green passing notice.\n" +
          "  6. Then return to the Turn-In Form and submit again.\n\n" +
          "— Assignment System"
      };

    case "REVISION_REQUIRED":
      return {
        subject: "⚠️ Submission Not Accepted — Revisions Still Needed",
        body:
          "Your assignment was not accepted for submission yet.\n\n" +
          "WHAT HAPPENED:\n" +
          "Your most recent evaluation showed that your work still needs some revisions. " +
          "You can only submit your final assignment after the AI coach confirms that your " +
          "work meets all the requirements.\n\n" +
          "WHAT TO DO:\n" +
          "  1. Open your assignment document.\n" +
          "  2. Scroll to the bottom — find the section called REQUIRED REVISIONS.\n" +
          "  3. Make the changes listed there.\n" +
          "  4. Run another evaluation: 📊 AI Evaluation Panel → Run Assignment System Check\n" +
          "  5. Once you receive a passing result, return here and submit again.\n\n" +
          "You can run as many evaluations as you need. There is no penalty for revising.\n\n" +
          "— Assignment System"
      };

    case "FORENSIC_FAILURE":
      return {
        subject: "⚠️ Submission Could Not Be Verified — Contact Your Instructor",
        body:
          "There was a problem verifying your assignment submission.\n\n" +
          "WHAT HAPPENED:\n" +
          "The system was unable to confirm that the evaluation report in your document " +
          "was generated by the official assignment system.\n\n" +
          "WHAT TO DO:\n" +
          "Please contact your instructor directly. They will review your document " +
          "and help resolve this.\n\n" +
          "When you contact them, let them know you received a \"verification\" error " +
          "on your final submission.\n\n" +
          "— Assignment System"
      };

    default:
      return {
        subject: "⚠️ Submission Issue — Please Contact Your Instructor",
        body:
          "There was an unexpected problem with your assignment submission.\n\n" +
          "Please contact your instructor for help.\n\n" +
          "— Assignment System"
      };
  }
}

// ---------------------------------------------------------------------------
// buildInstructorAlertMessage_ — technical detail email for the instructor
// Contains the raw code and detail that were stripped from the student email
// ---------------------------------------------------------------------------
function buildInstructorAlertMessage_(email, code, detail) {
  return {
    subject: "🚩 Flagged Submission — " + code + " | " + email,
    body:
      "A student submission was rejected by the automated gate.\n\n" +
      "Student:        " + email + "\n" +
      "Rejection Code: " + code + "\n\n" +
      "Technical Detail:\n" + detail + "\n\n" +
      "The student has been notified with plain-language instructions.\n" +
      "Review the Distribution Ledger for full context.\n\n" +
      "If manual intervention is needed, use the ⚙️ Admin Controls menu " +
      "in the admin spreadsheet.\n\n" +
      "— Assignment System"
  };
}
