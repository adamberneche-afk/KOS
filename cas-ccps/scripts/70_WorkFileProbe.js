// =============================================================================
// FILE: 70_WorkFileProbe.js
// BOUND TO: Central Ledger spreadsheet (cas-ccps:central-ledger)
// TRIGGERS: none. Run probeWorkFileTypes() from the editor, once.
//
// PURPOSE: the design check for Phase 4, work files by type
// (meta/STUDENT_WORK_PLAN_2026-10.md §5; meta/PLAN_2026-11.md, the week of
// Nov 2). Before a Form, Slides or Sheets reader is built, find out what
// Apps Script can actually read back from each, on this account:
//   Forms:  each question's type, choices, a scale's ends and labels, the
//           description, whether email collection is off, and whether a
//           checkbox's "select up to two" validation can be read back at all
//   Slides: each slide's title, text, speaker notes, images and charts
//   Sheets: tabs, the filled range, formulas against typed numbers, charts'
//           titles and ranges
//   All:    whether Drive lists the file's revisions (the authenticity
//           collector, D4), whether a Drive copy keeps what the template set
//           (the rollout copies a template per student), and how long a read
//           takes (it runs at Submit).
//
// HOW: each probe makes a scratch file shaped like a lesson's task (8177's
// survey: checkboxes "select up to two", a 1-5 scale, a short answer, email
// collection off), in a "CAS work file probe (delete me)" folder in the
// runner's Drive, reads it back with the calls a reader would use, and
// records one row per question. Then the scratch files go to the trash
// (probeWorkFileTypes({ keep: true }) leaves them, to look at by hand).
//
// OUTPUT: "[S70]" log lines, and the WorkFileProbe tab on the Ledger
// (rewritten each run): Type, Question, Answer, Detail, RanAt. Paste the
// log; the answers go into the student work plan.
//
// DATA BOUNDARY: the probe makes and reads only its own scratch files. It
// never opens a student's file, a form's responses or the roster.
// =============================================================================

const WFP_TAB = "WorkFileProbe";
const WFP_HEADERS = ["Type", "Question", "Answer", "Detail", "RanAt"];
const WFP_FOLDER = "CAS work file probe (delete me)";

// Editor entry point: all three probes, one tab, one log.
function probeWorkFileTypes(opts) {
  const o = opts || {};
  const folder = _wfpFolder_();
  const rows = []
    .concat(_wfpRun_("Form", function () { return probeFormsWorkFile_(folder, o); }))
    .concat(_wfpRun_("Slides", function () { return probeSlidesWorkFile_(folder, o); }))
    .concat(_wfpRun_("Sheet", function () { return probeSheetsWorkFile_(folder, o); }));
  if (!o.keep) {
    try { folder.setTrashed(true); } catch (e) { Logger.log("[S70] Folder not trashed: " + e.message); }
  }
  _wfpWrite_(rows);
  rows.forEach(function (r) { Logger.log("[S70] " + r[0] + " | " + r[1] + " | " + r[2] + (r[3] ? " | " + r[3] : "")); });
  Logger.log("[S70] " + rows.length + " answers written to the " + WFP_TAB + " tab." +
    (o.keep ? " Scratch files kept in \"" + WFP_FOLDER + "\"." : " Scratch files trashed."));
  return rows;
}

// One probe; a probe that throws is one row saying where, not a stopped run.
function _wfpRun_(type, fn) {
  try { return fn(); } catch (e) {
    return [[type, "Probe ran", "NO", "Stopped: " + e.message]];
  }
}

function _wfpRow_(type, question, answer, detail) {
  return [type, question, answer === true ? "YES" : answer === false ? "NO" : String(answer), detail || ""];
}

// ── Forms ────────────────────────────────────────────────────────────────────
function probeFormsWorkFile_(folder, opts) {
  const rows = [];
  const R = function (q, a, d) { rows.push(_wfpRow_("Form", q, a, d)); };

  const form = FormApp.create("CAS probe form (delete me)");
  form.setDescription("Probe: a survey on the fan experience.");
  try { form.setCollectEmail(false); } catch (e) { R("setCollectEmail(false) works", false, e.message); }
  const cb = form.addCheckboxItem().setTitle("Which two matter most?").setChoiceValues(["Price", "Seats", "Food", "Parking"]);
  let validationSet = true;
  try {
    cb.setValidation(FormApp.createCheckboxValidation().requireSelectAtMost(2).build());
  } catch (e) { validationSet = false; R("A checkbox's \"select up to two\" can be set", false, e.message); }
  if (validationSet) R("A checkbox's \"select up to two\" can be set", true);
  form.addScaleItem().setTitle("How likely are you to come back?").setBounds(1, 5).setLabels("Not likely", "Very likely");
  form.addTextItem().setTitle("What one change would bring you back?");
  const file = DriveApp.getFileById(form.getId());
  file.moveTo(folder);

  const t0 = Date.now();
  const read = _wfpReadForm_(FormApp.openById(form.getId()));
  R("Read time (ms) for 3 questions", Date.now() - t0);
  R("Questions, types and choices read back", read.items.length === 3,
    read.items.map(function (i) { return i.type + (i.choices ? "[" + i.choices.join("/") + "]" : "") +
      (i.scale ? "[" + i.scale.join("/") + "]" : ""); }).join("; "));
  const scale = read.items.filter(function (i) { return i.type === "SCALE"; })[0];
  R("A scale's ends and labels read back", !!(scale && scale.scale && scale.scale.join("/") === "1/5/Not likely/Very likely"),
    scale && scale.scale ? scale.scale.join("/") : "");
  R("The description reads back", read.description === "Probe: a survey on the fan experience.");
  R("Email collection reads back (collectsEmail)", read.collectsEmail === false ? true : read.collectsEmail,
    "collectsEmail() = " + read.collectsEmail + (read.emailCollectionType ? "; getEmailCollectionType() = " + read.emailCollectionType : ""));
  R("A checkbox's \"select up to two\" reads back", read.checkboxValidation.readable, read.checkboxValidation.detail);
  R("The form says whether it is published", read.published !== "n/a", "isPublished() = " + read.published);

  rows.push.apply(rows, _wfpRevisions_("Form", form.getId(), function () { form.setTitle("CAS probe form, edited (delete me)"); }));
  rows.push.apply(rows, _wfpCopy_("Form", file, folder, function (id) { return JSON.stringify(_wfpReadForm_(FormApp.openById(id)).items); },
    JSON.stringify(read.items)));
  R("Responses read", "NEVER", "the reader reads questions and settings only (work plan §5, \"Care needed\")");
  return rows;
}

// What a Form reader would capture. Never the responses.
function _wfpReadForm_(form) {
  const out = { description: form.getDescription(), items: [], collectsEmail: "n/a", emailCollectionType: "",
    published: "n/a", checkboxValidation: { readable: false, detail: "" } };
  try { out.collectsEmail = form.collectsEmail(); } catch (e) { out.collectsEmail = "error: " + e.message; }
  try { if (typeof form.getEmailCollectionType === "function") out.emailCollectionType = String(form.getEmailCollectionType()); } catch (e) { /* older API */ }
  try { if (typeof form.isPublished === "function") out.published = form.isPublished(); } catch (e) { out.published = "error: " + e.message; }
  form.getItems().forEach(function (it) {
    const type = String(it.getType());
    const item = { type: type, title: it.getTitle() };
    if (type === "CHECKBOX") {
      const c = it.asCheckboxItem();
      item.choices = c.getChoices().map(function (ch) { return ch.getValue(); });
      if (typeof c.getValidation === "function") {
        try {
          const v = c.getValidation();
          out.checkboxValidation = { readable: !!v, detail: "getValidation() returned " + (v ? JSON.stringify(v) : "nothing") };
        } catch (e) { out.checkboxValidation = { readable: false, detail: "getValidation() threw: " + e.message }; }
      } else {
        out.checkboxValidation = { readable: false, detail: "CheckboxItem has no getValidation(); FormApp can set it but not read it" };
      }
    } else if (type === "MULTIPLE_CHOICE") {
      item.choices = it.asMultipleChoiceItem().getChoices().map(function (ch) { return ch.getValue(); });
    } else if (type === "LIST") {
      item.choices = it.asListItem().getChoices().map(function (ch) { return ch.getValue(); });
    } else if (type === "SCALE") {
      const s = it.asScaleItem();
      item.scale = [s.getLowerBound(), s.getUpperBound(), s.getLeftLabel(), s.getRightLabel()];
    }
    out.items.push(item);
  });
  return out;
}

// ── Slides ───────────────────────────────────────────────────────────────────
function probeSlidesWorkFile_(folder, opts) {
  const rows = [];
  const R = function (q, a, d) { rows.push(_wfpRow_("Slides", q, a, d)); };

  const deck = SlidesApp.create("CAS probe deck (delete me)");
  const first = deck.getSlides()[0];
  _wfpFillPlaceholder_(first, SlidesApp.PlaceholderType.CENTERED_TITLE, "Our Brand Board");
  const s2 = deck.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  _wfpFillPlaceholder_(s2, SlidesApp.PlaceholderType.TITLE, "Target customer");
  _wfpFillPlaceholder_(s2, SlidesApp.PlaceholderType.BODY, "Families within 20 minutes of the stadium.");
  s2.getNotesPage().getSpeakerNotesShape().getText().setText("Say why families, not students.");
  const s3 = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  let imageAdded = true;
  try {
    // A 1x1 PNG: the probe needs an image on the slide, not a picture.
    s3.insertImage(Utilities.newBlob(Utilities.base64Decode(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), "image/png", "dot.png"));
  } catch (e) { imageAdded = false; R("An image can be put on a slide", false, e.message); }
  deck.saveAndClose();
  const file = DriveApp.getFileById(deck.getId());
  file.moveTo(folder);

  const t0 = Date.now();
  const read = _wfpReadSlides_(SlidesApp.openById(deck.getId()));
  R("Read time (ms) for 3 slides", Date.now() - t0);
  R("Slide count reads back", read.length === 3, read.length + " slides");
  R("Each slide's title reads back", read[0] && read[0].title === "Our Brand Board" && read[1] && read[1].title === "Target customer",
    read.map(function (s) { return s.title || "(none)"; }).join(" / "));
  R("Body text reads back", !!(read[1] && read[1].text.indexOf("Families within 20 minutes") !== -1));
  R("Speaker notes read back", !!(read[1] && read[1].notes === "Say why families, not students."), read[1] ? read[1].notes : "");
  if (imageAdded) R("An image is detected", !!(read[2] && read[2].images === 1), read[2] ? read[2].images + " image(s)" : "");
  R("Charts can be counted (getSheetsCharts)", read.every(function (s) { return typeof s.charts === "number"; }),
    "linked Sheets charts only; a chart pasted as a picture counts as an image");

  rows.push.apply(rows, _wfpRevisions_("Slides", deck.getId(), function () {
    const d = SlidesApp.openById(deck.getId());
    d.getSlides()[1].getNotesPage().getSpeakerNotesShape().getText().appendText(" Edited.");
    d.saveAndClose();
  }));
  rows.push.apply(rows, _wfpCopy_("Slides", file, folder, function (id) {
    return JSON.stringify(_wfpReadSlides_(SlidesApp.openById(id)).map(function (s) { return [s.title, s.images]; }));
  }, JSON.stringify(read.map(function (s) { return [s.title, s.images]; }))));
  return rows;
}

function _wfpFillPlaceholder_(slide, type, text) {
  const p = slide.getPlaceholder(type);
  if (p) p.asShape().getText().setText(text);
  else slide.insertTextBox(text);
}

// What a Slides reader would capture, slide by slide.
function _wfpReadSlides_(deck) {
  return deck.getSlides().map(function (slide) {
    let title = "";
    [SlidesApp.PlaceholderType.CENTERED_TITLE, SlidesApp.PlaceholderType.TITLE].forEach(function (t) {
      const p = slide.getPlaceholder(t);
      if (!title && p) title = p.asShape().getText().asString().trim();
    });
    const text = slide.getShapes().map(function (sh) {
      try { return sh.getText().asString().trim(); } catch (e) { return ""; }
    }).filter(Boolean).join("\n");
    let notes = "";
    try { notes = slide.getNotesPage().getSpeakerNotesShape().getText().asString().trim(); } catch (e) { notes = ""; }
    return { title: title, text: text, notes: notes, images: slide.getImages().length, charts: slide.getSheetsCharts().length };
  });
}

// ── Sheets ───────────────────────────────────────────────────────────────────
function probeSheetsWorkFile_(folder, opts) {
  const rows = [];
  const R = function (q, a, d) { rows.push(_wfpRow_("Sheet", q, a, d)); };

  const ss = SpreadsheetApp.create("CAS probe sheet (delete me)");
  const budget = ss.getSheets()[0].setName("Budget");
  budget.getRange(1, 1, 4, 2).setValues([["Item", "Cost"], ["Tickets", 40], ["Food", 25], ["Parking", 15]]);
  budget.getRange(5, 1).setValue("Total");
  budget.getRange(5, 2).setFormula("=SUM(B2:B4)");
  budget.getRange(6, 1, 1, 2).setValues([["Typed total", 80]]);
  const chart = budget.newChart().setChartType(Charts.ChartType.COLUMN).addRange(budget.getRange("A1:B4"))
    .setPosition(1, 4, 0, 0).setOption("title", "Cost by item").build();
  budget.insertChart(chart);
  ss.insertSheet("Notes").getRange(1, 1).setValue("Prices from the team site.");
  SpreadsheetApp.flush();
  const file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);

  const t0 = Date.now();
  const read = _wfpReadSheet_(SpreadsheetApp.openById(ss.getId()));
  R("Read time (ms) for 2 tabs", Date.now() - t0);
  R("Tab names read back", read.map(function (t) { return t.name; }).join(",") === "Budget,Notes",
    read.map(function (t) { return t.name; }).join(", "));
  const b = read[0];
  R("The filled range reads back as a table", !!(b && b.range === "A1:B6"), b ? b.range : "");
  R("A formula is told from a typed number", !!(b && b.formulas.length === 1 && b.formulas[0] === "B5: =SUM(B2:B4)"),
    b ? "formulas: " + b.formulas.join(", ") + " (B6's typed 80 is not one)" : "");
  R("A chart's title and range read back", !!(b && b.charts.length === 1 && b.charts[0].title === "Cost by item" && b.charts[0].ranges === "A1:B4"),
    b && b.charts.length ? b.charts.map(function (c) { return c.type + " \"" + c.title + "\" " + c.ranges; }).join("; ") : "no chart");

  rows.push.apply(rows, _wfpRevisions_("Sheet", ss.getId(), function () {
    SpreadsheetApp.openById(ss.getId()).getSheetByName("Notes").getRange(2, 1).setValue("Edited.");
    SpreadsheetApp.flush();
  }));
  rows.push.apply(rows, _wfpCopy_("Sheet", file, folder, function (id) {
    return JSON.stringify(_wfpReadSheet_(SpreadsheetApp.openById(id)).map(function (t) { return [t.name, t.formulas, t.charts.length]; }));
  }, JSON.stringify(read.map(function (t) { return [t.name, t.formulas, t.charts.length]; }))));
  return rows;
}

// What a Sheets reader would capture, tab by tab.
function _wfpReadSheet_(ss) {
  return ss.getSheets().map(function (sh) {
    const range = sh.getDataRange();
    const formulas = [];
    range.getFormulas().forEach(function (row, r) {
      row.forEach(function (f, c) { if (f) formulas.push(sh.getRange(r + 1, c + 1).getA1Notation() + ": " + f); });
    });
    const charts = sh.getCharts().map(function (ch) {
      let title = "";
      try { title = String(ch.getOptions().get("title") || ""); } catch (e) { title = ""; }
      let type = "";
      try { type = String(ch.modify().getChartType()); } catch (e) { type = "?"; }
      return { title: title, type: type, ranges: ch.getRanges().map(function (r) { return r.getA1Notation(); }).join(",") };
    });
    return { name: sh.getName(), range: range.getA1Notation(), formulas: formulas, charts: charts };
  });
}

// ── Shared: revisions and copies ─────────────────────────────────────────────
// Whether Drive lists the file's revisions, and whether an edit adds one.
function _wfpRevisions_(type, id, edit) {
  const rows = [];
  const count = function () {
    const res = Drive.Revisions.list(id, { fields: "revisions(id,modifiedTime)" });
    return (res.revisions || []).length;
  };
  let before;
  try { before = count(); } catch (e) {
    rows.push(_wfpRow_(type, "Drive lists its revisions", false, e.message));
    return rows;
  }
  rows.push(_wfpRow_(type, "Drive lists its revisions", before > 0, before + " revision(s) after it was made"));
  try {
    edit();
    Utilities.sleep(2000);
    const after = count();
    rows.push(_wfpRow_(type, "An edit shows as a new revision", after > before,
      before + " -> " + after + " (Drive can merge close edits into one revision)"));
  } catch (e) {
    rows.push(_wfpRow_(type, "An edit shows as a new revision", false, e.message));
  }
  return rows;
}

// Whether a Drive copy (how the rollout makes each student's file) keeps what
// the template set: `readKey` of the copy against `expected`.
function _wfpCopy_(type, file, folder, readKey, expected) {
  try {
    const copy = file.makeCopy(file.getName() + " (copy)", folder);
    const got = readKey(copy.getId());
    return [_wfpRow_(type, "A Drive copy keeps what the template set", got === expected,
      got === expected ? "" : "copy differs: " + got.slice(0, 200))];
  } catch (e) {
    return [_wfpRow_(type, "A Drive copy keeps what the template set", false, e.message)];
  }
}

function _wfpFolder_() {
  const it = DriveApp.getFoldersByName(WFP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(WFP_FOLDER);
}

// Rewrites the WorkFileProbe tab on the Ledger.
function _wfpWrite_(rows) {
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  let sheet = ss.getSheetByName(WFP_TAB);
  if (!sheet) sheet = ss.insertSheet(WFP_TAB);
  sheet.clear();
  sheet.getRange(1, 1, 1, WFP_HEADERS.length).setValues([WFP_HEADERS]);
  const now = new Date();
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, WFP_HEADERS.length).setValues(rows.map(function (r) { return r.concat([now]); }));
  }
  sheet.setFrozenRows(1);
}
