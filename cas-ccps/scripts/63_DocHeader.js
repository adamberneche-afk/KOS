// =============================================================================
// FILE: 63_DocHeader.js
// PROJECTS: cas-ccps:central-ledger (02 stamps the header, 37 sets results)
//           and cas-ccps:student-dashboard (13 sets "being checked")
// Not in 00: it calls DocumentApp, and not every project that loads 00 has
// the documents scope.
// =============================================================================

// ---------------------------------------------------------------------------
// The assignment doc's page header: 02 stamps it, 13 (on submit) and 37 (on
// a result) update its feedback line. Line 1 says who and what, with a link
// to the dashboard; line 2 is "Feedback: …". Small grey text; once there is a
// result the feedback line takes its color. The header is not part of the
// body text, so nothing that reads the doc's markers sees it. Docs made
// before 2026-10-17 have no header and are left as they are.
// ---------------------------------------------------------------------------
const DOC_HEADER_FONT_SIZE = 8;
const DOC_HEADER_GREY      = "#5f6368";
const DOC_FEEDBACK_PREFIX  = "Feedback: ";
const DOC_FEEDBACK_STATES  = {
  NOT_SUBMITTED: { text: "not submitted yet. When you're ready, use Submit for Feedback on your dashboard.",
                   color: DOC_HEADER_GREY, bold: false },
  // The dashboards' words (2026-10-22): Waiting for feedback, Passed,
  // Revise then submit again.
  CHECKING:      { text: "submitted {when}, waiting for feedback.", color: DOC_HEADER_GREY, bold: false },
  PASSED:        { text: "✅ Passed ({when}). See {where}.", color: "#137333", bold: true },
  REVISE:        { text: "✏️ Revise, then submit again ({when}). Read {where} first.",
                   color: "#b06000", bold: true }
};

// Builds the header on a doc being stamped (02). identity is line 1's text.
function writeDocHeader_(doc, identity, dashboardUrl) {
  const header = doc.getHeader() || doc.addHeader();
  header.clear();
  const linkText = "Your dashboard";
  const line1 = header.appendParagraph(identity + (dashboardUrl ? "  ·  " + linkText : ""));
  line1.editAsText().setFontSize(DOC_HEADER_FONT_SIZE).setForegroundColor(DOC_HEADER_GREY);
  if (dashboardUrl) {
    const t = line1.editAsText();
    const at = identity.length + 5;
    t.setLinkUrl(at, at + linkText.length - 1, dashboardUrl);
  }
  _styleDocFeedbackLine_(header.appendParagraph(""), "NOT_SUBMITTED", {});
  // clear() leaves one empty paragraph ahead of the two just added.
  const first = header.getChild(0);
  if (header.getNumChildren() > 2 && String(first.asText().getText()) === "") header.removeChild(first);
}

// Sets the feedback line on an existing doc. state is a DOC_FEEDBACK_STATES
// key; opts.inComments says where the feedback is. Best effort: true when
// the line was found and set; a doc without a header (made before this) or
// one that can't be opened is logged and left alone.
function setDocFeedbackStatus_(fileId, state, opts) {
  try {
    const doc = DocumentApp.openById(fileId);
    const header = doc.getHeader();
    if (!header) return false;
    for (let i = 0; i < header.getNumChildren(); i++) {
      const p = header.getChild(i);
      if (String(p.asText().getText()).indexOf(DOC_FEEDBACK_PREFIX) !== 0) continue;
      _styleDocFeedbackLine_(p, state, opts || {});
      doc.saveAndClose();
      return true;
    }
    return false;
  } catch (e) {
    Logger.log("[S00] Feedback status not set on the doc (" + state + "): " + e.message);
    return false;
  }
}

function _styleDocFeedbackLine_(paragraph, state, opts) {
  const st = DOC_FEEDBACK_STATES[state];
  const when = Utilities.formatDate(opts.when || new Date(), Session.getScriptTimeZone(), "MMM d, h:mm a");
  const where = opts.inComments ? "the comment on this doc" : "the Feedback section below";
  paragraph.setText(DOC_FEEDBACK_PREFIX + st.text.replace("{when}", when).replace("{where}", where));
  paragraph.editAsText().setFontSize(DOC_HEADER_FONT_SIZE).setForegroundColor(st.color).setBold(st.bold);
}
