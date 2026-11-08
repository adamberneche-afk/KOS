// =============================================================================
// FILE: 75_FormReader.js
// BOUND TO: Student Dashboard web app (cas-ccps:student-dashboard), where
//   Submit runs, as the deploying account (USER_DEPLOYING), an editor of
//   every student form copy since Phase 4a (02's _intakeForm_). The only
//   cas-ccps file that calls FormApp; the project's manifest has the forms
//   scope for it.
//
// Phase 4b (2026-11-08; meta/STUDENT_WORK_PLAN_2026-10.md §5): the Form
// reader at Submit. For a form part, 13's Submit:
//   1. reads the form's STRUCTURE (readFormStructure_): title, description,
//      each item's type, title, help text, choices, a scale's ends and
//      labels, the required flags, and the settings that matter (email
//      collection, one response per person, quiz). NEVER its responses:
//      no getResponses(), no response sheet (getDestinationId()), no
//      summary. Responses are answers from other people, often other
//      students. A test holds every FormApp call here to a fixed list.
//   2. runs the part's exact checks (formCheckReasons_, formChecks in
//      PARTS.json; default: at least one question, email collection off).
//      A failure is a plain-words "Not yet" on the card and goes nowhere
//      else: no queue row, no Flow 2 run.
//   3. on a pass, rewrites the form's snapshot doc (writeFormSnapshot_) with
//      a plain-text account of the form (formSnapshotText_), which Flow 2
//      reads the way it reads a student doc (37).
// What the probe found can't be read back (2026-11-01): a checkbox's
// "select up to two" limit (no getter for its validation). The task asks for
// it in the question's own wording, which the snapshot carries.
// =============================================================================

// FormApp item type -> how to read the typed item.
const FR_CAST = {
  TEXT: "asTextItem", PARAGRAPH_TEXT: "asParagraphTextItem",
  MULTIPLE_CHOICE: "asMultipleChoiceItem", CHECKBOX: "asCheckboxItem", LIST: "asListItem",
  SCALE: "asScaleItem", RATING: "asRatingItem", GRID: "asGridItem", CHECKBOX_GRID: "asCheckboxGridItem",
  DATE: "asDateItem", TIME: "asTimeItem", DATETIME: "asDateTimeItem", DURATION: "asDurationItem"
};
// Items that aren't questions: shown in the snapshot, never counted.
const FR_NOT_QUESTIONS = { SECTION_HEADER: "Section", PAGE_BREAK: "Page break", IMAGE: "Image", VIDEO: "Video" };
// A snapshot longer than this is cut (a form has no business being longer).
const FR_SNAPSHOT_MAX = 20000;

function _frTypeKey_(itemType) {
  const t = String(itemType);
  const keys = Object.keys(FORM_QUESTION_TYPES);
  for (let i = 0; i < keys.length; i++) if (FORM_QUESTION_TYPES[keys[i]].itemType === t) return keys[i];
  return "";
}

// The form's structure, as plain data. Throws if the form can't be opened.
// { title, description, collectsEmail, emailCollection, limitOneResponse,
//   quiz, items: [{ type, typeKey, question, title, helpText, required,
//   choices?, other?, rows?, columns?, scale? }] }
function readFormStructure_(formId) {
  const form = FormApp.openById(formId);
  const tryRead = function (fn, fallback) { try { return fn(); } catch (e) { return fallback; } };
  const out = {
    title: String(form.getTitle() || ""),
    description: String(form.getDescription() || ""),
    collectsEmail: form.collectsEmail() === true,
    // The newer setting (the probe's DO_NOT_COLLECT); "" where it isn't offered.
    emailCollection: tryRead(function () {
      return typeof form.getEmailCollectionType === "function" ? String(form.getEmailCollectionType()) : "";
    }, ""),
    limitOneResponse: tryRead(function () { return form.hasLimitOneResponsePerUser() === true; }, false),
    quiz: tryRead(function () { return form.isQuiz() === true; }, false),
    items: []
  };
  form.getItems().forEach(function (item) {
    const type = String(item.getType());
    const it = { type: type, typeKey: _frTypeKey_(type), question: !!FR_CAST[type],
      title: String(item.getTitle() || ""), helpText: String(item.getHelpText() || ""), required: false };
    const cast = FR_CAST[type];
    if (cast) {
      const q = item[cast]();
      it.required = tryRead(function () { return q.isRequired() === true; }, false);
      if (type === "MULTIPLE_CHOICE" || type === "CHECKBOX" || type === "LIST") {
        it.choices = q.getChoices().map(function (c) { return String(c.getValue()); });
        if (type !== "LIST") it.other = tryRead(function () { return q.hasOtherOption() === true; }, false);
      } else if (type === "GRID" || type === "CHECKBOX_GRID") {
        it.rows = q.getRows().map(String);
        it.columns = q.getColumns().map(String);
      } else if (type === "SCALE") {
        it.scale = { low: q.getLowerBound(), high: q.getUpperBound(),
          lowLabel: String(q.getLeftLabel() || ""), highLabel: String(q.getRightLabel() || "") };
      } else if (type === "RATING") {
        it.scale = { low: 1, high: tryRead(function () { return q.getRatingScaleLevel(); }, ""), lowLabel: "", highLabel: "" };
      }
    }
    out.items.push(it);
  });
  return out;
}

function _frEmailOn_(s) {
  return s.collectsEmail === true || (!!s.emailCollection && s.emailCollection !== "DO_NOT_COLLECT");
}

// The exact checks: [] on a pass, else one plain-words reason per failure,
// in the order a student would fix them.
function formCheckReasons_(structure, checks) {
  const c = normalizeFormChecks_(checks);
  const questions = (structure.items || []).filter(function (it) { return it.question; });
  const n = questions.length;
  const qs = function (k) { return k + " question" + (k === 1 ? "" : "s"); };
  const reasons = [];
  if (n < c.minQuestions) {
    reasons.push(n === 0
      ? "Your form has no questions yet. It needs at least " + qs(c.minQuestions) + "."
      : "Your form has " + qs(n) + ". It needs at least " + c.minQuestions + ".");
  }
  if (c.maxQuestions && n > c.maxQuestions) {
    reasons.push("Your form has " + qs(n) + ". This part asks for at most " + c.maxQuestions + ".");
  }
  (c.questionTypes || []).forEach(function (t) {
    if (!questions.some(function (q) { return q.typeKey === t; })) {
      reasons.push("Your form needs a " + FORM_QUESTION_TYPES[t].label + " question.");
    }
  });
  const emailOn = _frEmailOn_(structure);
  if (emailOn && c.collectsEmail === false) {
    reasons.push("Your form collects email addresses. Turn that off: in your form, open Settings, then Responses, " +
      "and set Collect email addresses to Do not collect.");
  }
  if (!emailOn && c.collectsEmail === true) {
    reasons.push("Your form needs to collect email addresses: in your form, open Settings, then Responses, " +
      "and choose how to Collect email addresses.");
  }
  return reasons;
}

// Every string the student wrote into the form.
function _frStudentStrings_(s) {
  const out = [s.title, s.description];
  (s.items || []).forEach(function (it) {
    out.push(it.title, it.helpText);
    (it.choices || []).concat(it.rows || [], it.columns || []).forEach(function (x) { out.push(x); });
    if (it.scale) out.push(it.scale.lowLabel, it.scale.highLabel);
  });
  return out;
}

// The first system-text token in the student's form ("[SYSTEM:", say), or
// "": refused at Submit as a doc's is (00's findSystemText_).
function formSystemText_(structure) {
  const all = _frStudentStrings_(structure);
  for (let i = 0; i < all.length; i++) {
    const found = findSystemText_(all[i]);
    if (found) return found;
  }
  return "";
}

// A student string made safe for the snapshot, which Flow 2 reads as
// untrusted student text between its <<<STUDENT_SUBMISSION>>> markers: one
// line, system tokens neutralized (00), no run of three angle brackets or
// two braces (the prompt's markers and placeholders), and none of the
// doc markers every reader stops at. Quoted, so its edges are visible.
function _frQuote_(text) {
  let s = neutralizeSystemText_(String(text === undefined || text === null ? "" : text))
    .replace(/\s+/g, " ").trim()
    .replace(/<{3,}/g, "<<").replace(/>{3,}/g, ">>")
    .replace(/\{{2,}/g, "{").replace(/\}{2,}/g, "}");
  ["── YOUR RESPONSE BEGINS HERE ──", "[CONFIG_ID:", "[SYS_LEDGER_SS_ID:"].forEach(function (m) {
    s = s.split(m).join("(system text removed)");
  });
  return "“" + s + "”";
}

function _frOnOff_(b) { return b ? "on" : "off"; }

// The plain-text account of the form Flow 2 reads and the teacher sees: the
// settings, then every item in order with its type, required flag, help
// text, choices or scale. Stable layout, one fact per line.
function formSnapshotText_(structure) {
  const s = structure;
  const questions = (s.items || []).filter(function (it) { return it.question; }).length;
  const lines = [
    "GOOGLE FORM, as it was when the student pressed Submit",
    "Form title: " + _frQuote_(s.title),
    "Form description: " + (String(s.description || "").trim() ? _frQuote_(s.description) : "(none)"),
    "Settings: collects email addresses: " + (_frEmailOn_(s) ? "yes" : "no") +
      " · one response per person: " + _frOnOff_(s.limitOneResponse) + " · quiz: " + _frOnOff_(s.quiz),
    "Questions: " + questions,
    ""
  ];
  let qn = 0;
  (s.items || []).forEach(function (it) {
    if (!it.question) {
      lines.push((FR_NOT_QUESTIONS[it.type] || "Item") + ": " + _frQuote_(it.title));
      if (String(it.helpText || "").trim()) lines.push("  Text: " + _frQuote_(it.helpText));
      return;
    }
    qn++;
    const label = it.typeKey ? FORM_QUESTION_TYPES[it.typeKey].label : it.type;
    lines.push("Question " + qn + " (" + label + (it.required ? ", required" : "") + "): " + _frQuote_(it.title));
    if (String(it.helpText || "").trim()) lines.push("  Help text: " + _frQuote_(it.helpText));
    if (it.choices) {
      lines.push("  Choices: " + (it.choices.length ? it.choices.map(_frQuote_).join(" | ") : "(none)") +
        (it.other ? " | Other (the person types their own)" : ""));
    }
    if (it.rows) lines.push("  Rows: " + it.rows.map(_frQuote_).join(" | "));
    if (it.columns) lines.push("  Columns: " + it.columns.map(_frQuote_).join(" | "));
    if (it.scale) {
      lines.push("  Scale: " + it.scale.low + (it.scale.lowLabel ? " (" + _frQuote_(it.scale.lowLabel) + ")" : "") +
        " to " + it.scale.high + (it.scale.highLabel ? " (" + _frQuote_(it.scale.highLabel) + ")" : ""));
    }
  });
  let text = lines.join("\n").trim();
  if (text.length > FR_SNAPSHOT_MAX) text = text.slice(0, FR_SNAPSHOT_MAX) + " […]";
  return text;
}

// Rewrites the snapshot doc's response zone: everything between the
// response marker and the "[CONFIG_ID:" line becomes the snapshot, one
// paragraph per line. The feedback zone, header and footer are kept.
// Throws when the doc has lost either marker (13 reports it as a system
// failure, and nothing is queued).
function writeFormSnapshot_(docId, text) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  let from = -1, to = -1;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const t = String(body.getChild(i).getText ? body.getChild(i).getText() : "").trim();
    if (from === -1 && t === "── YOUR RESPONSE BEGINS HERE ──") from = i;
    else if (from !== -1 && t.indexOf("[CONFIG_ID:") === 0) { to = i; break; }
  }
  if (from === -1 || to === -1) throw new Error("The snapshot doc has lost its response markers.");
  for (let i = to - 1; i > from; i--) body.removeChild(body.getChild(i));
  String(text).split("\n").forEach(function (line, k) {
    body.insertParagraph(from + 1 + k, line);
  });
  doc.saveAndClose();
}
