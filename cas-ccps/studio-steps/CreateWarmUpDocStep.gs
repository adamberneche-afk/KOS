// =============================================================================
// FILE: CreateWarmUpDocStep.gs
// PROJECT: cas-ccps:studio-steps (standalone; see tools/gas-lint/project-map.json)
// PURPOSE: Flow 3's (Warm-Up Generation) post-processing step: resolves
//          the student's warm-up folder, creates the doc, stamps Zone 1
//          (Prompt) and Zone 2 (Response — left blank) with the exact
//          markers and formatting CAS_Flow3_Flow4_Specification.html
//          specifies, shares it with the student, and writes doc_id /
//          doc_url / status back to WarmUpQueue.
//
//          Zone 3 (Feedback) is NOT written here — the spec is explicit
//          that zone is "written by Script 25 after Flow 4 evaluates the
//          response — not by Flow 3." This step only ever produces a
//          2-zone doc.
//
// ERROR HANDLING: Flow 3 is the one flow among everything built in this
// conversation so far with its own EXPLICIT stated philosophy, different
// from both other cas-ccps flows and kos-personal's flows: "On any
// connector failure: set WarmUpQueue status = ERROR" (quoted directly
// from the spec's own configuration table). This step follows that:
// every failure path below writes status = ERROR rather than leaving
// the row untouched (unlike kos-personal's flows) or always marking
// success (unlike cas-ccps's commitStudentEvaluation).
//
// ARCHETYPE WRITE-BACK STAYS NATIVE, NOT PART OF THIS STEP: the spec
// requires the selected archetype be written to WarmUpQueue col 19
// right after selection. That's a single-field write to the row that
// started this flow, and @trigger.row addressing is still fresh at that
// point in the flow (unlike the write this step performs, several
// steps and one Gemini call later) — a native "Sheets - update row"
// step using @trigger.row right after SelectWarmUpArchetypeStep is
// simpler and no less correct than folding it in here. This step
// re-finds its row by Queue_ID instead (see findWarmUpQueueRow_ below),
// the same reasoning ReadInstructorConfigStep.gs applies elsewhere in
// this project.
//
// FOLDER PATH FIELDS COME FROM THIS STEP'S OWN RE-PARSE OF
// lesson_context_snapshot, NOT FROM SelectWarmUpArchetypeStep: teacher_name,
// period, and admin_root_folder_id are all confirmed present in the
// snapshot (24_WarmUpBridge.js lines ~239, ~738, ~238) but aren't
// needed for archetype selection, so they were left out of that step's
// already-large output list. Each step in this project re-parses the
// trigger row for exactly what it needs, rather than one step passing
// through fields another step doesn't otherwise use.
//
// FOLDER PATH — A KNOWN, FLAGGED GAP, NOT SILENTLY FIXED: the original
// drop of this file called its top-level folder segment "subject" while
// actually sourcing it from lesson.course_name — genuinely wrong, since
// resolveAdminPath_() in 02_Form1_IntakeAndWorkspaceGenerator.js builds
// the student's real workspace tree as
// [Subject]/[CourseName]/[TeacherName]/[Period N]/[StudentName] — five
// segments, with Subject and CourseName as two DISTINCT levels. This
// step's variable is renamed courseName here to stop misrepresenting
// what it holds, but a genuine fix — nesting warm-ups inside the
// student's actual folder rather than a same-course-name-first,
// differently-shaped tree — is NOT fully possible from this step alone:
// confirmed directly against 24_WarmUpBridge.js's snapshotObj (the only
// source this step has for folder-path fields), lesson_context_snapshot
// carries course_name but has no independent subject field at all, so
// there is nothing here to put in a genuine "Subject" folder level.
// Closing this gap for real needs snapshotObj in 24_WarmUpBridge.js to
// start carrying subject through — that's a change to a live, already-
// deployed cas-ccps script outside this Studio-steps project, and is
// out of scope for this drop. Flagged here rather than silently
// shipped as "fixed."
//
// FLOW 5 (BRIDGING FLOW) INTEGRATION: bridgeOutput is an OPTIONAL input,
// empty string whenever Flow 5 didn't produce one — either because the
// student had no prior response (Flow 5's own trigger condition already
// filters this out) or, in principle, because Flow 5 hasn't finished
// writing bridge_output yet by the time this flow reads the row (see
// this project's README for the honest state of that ordering question
// -- CAS_M2_DeploymentGuide.html only documents MANUAL sequential
// triggering during setup testing, not an enforced production
// guarantee). Either way, an empty bridgeOutput here is designed to be
// indistinguishable from "no prior response" -- the spec's own words:
// "Strictly additive... no student ever sees a gap where a bridge
// should be." This step doesn't need to know WHY bridgeOutput is
// empty, only that empty means "generate without one," which was
// already this step's behavior before Flow 5 existed.
//
// SEPARATOR TEXT IS MY OWN CHOICE, FLAGGED AS SUCH: the spec says Flow 3
// "prepends with a separator line" but doesn't give exact text. Used a
// plain dashed rule here, deliberately distinct from all four real zone
// markers ("── WARM-UP PROMPT ──" etc.) so Script 25's marker-matching
// logic — which only ever searches for those four specific strings —
// can't confuse this for one of them.
//
// TIMEZONE: uses Session.getScriptTimeZone(), not a hardcoded zone
// string — matches every other Utilities.formatDate() call in this
// repo (the original drop hardcoded "America/New_York").
//
// INPUT READING / ERROR HANDLING: every input is read through
// StepsShared.gs's inStr_() rather than the raw
// inputs["x"].stringValues[0] pattern, and the whole execute function
// body is wrapped in an outer try/catch on top of its existing
// per-operation try/catches — see inStr_()'s own header for why.
// =============================================================================

// =============================================================================
// onCreateWarmUpDocConfig
// Same confidence note on return/Save-button wiring as this project's
// other steps.
// =============================================================================
function onCreateWarmUpDocConfig() {
  var section = CardService.newCardSection()
    .addWidget(variableTextInput_("ledgerSsId", "Central Ledger spreadsheet ID"))
    .addWidget(variableTextInput_("queueId", "Queue_ID (trigger row)"))
    .addWidget(variableTextInput_("lessonContextSnapshotJson", "lesson_context_snapshot (trigger row)"))
    .addWidget(variableTextInput_("studentGoogleId", "Google_ID (trigger row)"))
    .addWidget(variableTextInput_("studentName", "Student_Name (trigger row)"))
    .addWidget(variableTextInput_("firstName", "First name (from Select Warm-Up Archetype step's output)"))
    .addWidget(variableTextInput_("lessonDate", "Lesson_Date (trigger row)"))
    .addWidget(variableTextInput_("generatedPromptText", "Generated warm-up text (native Ask Gemini step's output)"))
    .addWidget(variableTextInput_("bridgeOutput", "bridge_output (col 21, trigger row) — leave unmapped or map to empty string if Flow 5 isn't wired in, or for students with no prior response"));

  var saveAction = CardService.newAction().setFunctionName("onCreateWarmUpDocConfig");
  var saveButton = CardService.newTextButton()
    .setText("Save")
    .setOnClickAction(saveAction);

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Create Warm-Up Doc"))
    .addSection(section)
    .setFixedFooter(CardService.newFixedFooter().setPrimaryButton(saveButton))
    .build();
}

// =============================================================================
// onCreateWarmUpDocExecute
// Never throws uncaught. Every failure path attempts to write status =
// ERROR to the row (per Flow 3's own stated error philosophy) before
// returning — the one exception is if the row itself can't be found,
// in which case there's nothing to write and writeStatus reports that
// directly.
// =============================================================================
function onCreateWarmUpDocExecute(event) {
  // Logs only that the step ran, not the event payload — the payload
  // carries the student's name, Google ID, and full lesson snapshot;
  // see this project's README for the general PII-logging policy every
  // step in this project follows.
  Logger.log("[CreateWarmUpDocStep] execute start");

  var ledgerSsId, queueId;
  try {
    var inputs = event.workflow.actionInvocation.inputs;
    ledgerSsId = inStr_(inputs, "ledgerSsId");
    queueId = inStr_(inputs, "queueId");
    var lessonJsonText = inStr_(inputs, "lessonContextSnapshotJson");
    var studentGoogleId = inStr_(inputs, "studentGoogleId");
    var studentName = inStr_(inputs, "studentName");
    var firstName = inStr_(inputs, "firstName");
    var lessonDateRaw = inStr_(inputs, "lessonDate");
    var generatedPromptText = inStr_(inputs, "generatedPromptText");
    var bridgeOutput = inStr_(inputs, "bridgeOutput");

    var lesson;
    try {
      lesson = JSON.parse(lessonJsonText);
    } catch (e) {
      return finishWithError_(ledgerSsId, queueId, "LESSON_SNAPSHOT_PARSE_FAILED");
    }

    var adminRootFolderId = lesson.admin_root_folder_id;
    // Renamed from "subject" — this actually holds course_name; see this
    // file's header note on why a genuine Subject-level folder isn't
    // available to this step.
    var courseName = lesson.course_name || "";
    var teacherName = lesson.teacher_name || "";
    var period = lesson.period != null ? String(lesson.period) : "";

    if (!adminRootFolderId || !courseName || !teacherName || !period) {
      return finishWithError_(ledgerSsId, queueId, "FOLDER_PATH_FIELDS_MISSING");
    }

    var dateIso = normalizeDateIso_(lessonDateRaw);
    var dateReadable = formatReadableDate_(dateIso) || lessonDateRaw;

    var doc;
    try {
      var studentFolder = resolveWarmUpFolderPath_(adminRootFolderId, courseName, teacherName, period, studentName);
      doc = createWarmUpDoc_(studentFolder, dateIso, firstName, dateReadable, generatedPromptText, bridgeOutput);
    } catch (e) {
      return finishWithError_(ledgerSsId, queueId, "DOC_CREATE_FAILED: " + e.message);
    }

    try {
      doc.file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      doc.file.addEditor(studentGoogleId);
    } catch (e) {
      return finishWithError_(ledgerSsId, queueId, "DOC_SHARE_FAILED: " + e.message);
    }

    try {
      writeWarmUpQueueResult_(ledgerSsId, queueId, {
        status: "DELIVERED",
        docId: doc.file.getId(),
        docUrl: doc.file.getUrl(),
      });
    } catch (e) {
      // The doc exists and is shared at this point -- a genuinely awkward
      // partial state, same category as the doc-write-but-sheet-write-fails
      // case in kos-personal's WriteCuratorOutputStep.gs. Reported
      // distinctly rather than folded into a generic failure, since a
      // human needs to notice a delivered-but-unrecorded doc, not have it
      // silently retried (retrying would create a SECOND doc for the same
      // student).
      return buildOutputRenderAction_({ writeStatus: stringVar_("QUEUE_ROW_NOT_FOUND_AFTER_DOC_CREATE") });
    }

    return buildOutputRenderAction_({ writeStatus: stringVar_("SUCCESS") });
  } catch (e) {
    return finishWithError_(ledgerSsId, queueId, "UNEXPECTED_ERROR: " + e.message);
  }
}

function finishWithError_(ledgerSsId, queueId, reason) {
  try {
    writeWarmUpQueueResult_(ledgerSsId, queueId, { status: "ERROR" });
  } catch (e) {
    // Row not found at all -- nothing more this step can do.
  }
  return buildOutputRenderAction_({ writeStatus: stringVar_(reason) });
}

// Folder chain: [Admin Root] / [Course Name] / [Teacher Name] / [Period N] /
// Warm-Ups / [Student Name] / — see this file's header note on why this
// doesn't fully match resolveAdminPath_'s 5-segment tree (that one also
// has a distinct Subject level, which this step has no data for). Uses
// the same getOrCreate pattern as resolveFolder_() in
// 02_Form1_IntakeAndWorkspaceGenerator.js (confirmed directly from that
// function's own two-line body: getFoldersByName, else createFolder).
function resolveWarmUpFolderPath_(adminRootFolderId, courseName, teacherName, period, studentName) {
  var folder = DriveApp.getFolderById(adminRootFolderId);
  folder = getOrCreateFolder_(folder, courseName);
  folder = getOrCreateFolder_(folder, teacherName);
  folder = getOrCreateFolder_(folder, "Period " + period);
  folder = getOrCreateFolder_(folder, "Warm-Ups");
  folder = getOrCreateFolder_(folder, studentName);
  return folder;
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// Creates the doc and stamps Zones 1-2 exactly per the spec's
// "Document structure" section: title, first identification line, then
// -- when bridgeOutput is non-empty -- the Flow 5 bridge paragraph and
// a separator, then Zone 1 (marker, generated text, end marker, 12pt
// #333333), then Zone 2's opening marker only (11pt #202124) -- left
// blank for the student. Returns { file } (DriveApp File, for
// sharing/URL/ID access).
function createWarmUpDoc_(parentFolder, dateIso, firstName, dateReadable, promptText, bridgeOutput) {
  var title = "Warm-Up " + dateIso + " — " + firstName;
  var doc = DocumentApp.create(title);
  var file = DriveApp.getFileById(doc.getId());
  parentFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file); // DocumentApp.create() always lands in root first

  var body = doc.getBody();
  body.clear();

  body.appendParagraph("Warm-Up — " + dateReadable + " — " + firstName);

  if (bridgeOutput && String(bridgeOutput).trim() !== "") {
    var bridgePara = body.appendParagraph(String(bridgeOutput).trim());
    bridgePara.editAsText().setFontSize(11).setForegroundColor("#5f6368").setItalic(true);
    var separator = body.appendParagraph("──────────");
    separator.editAsText().setFontSize(9).setForegroundColor("#9aa0a6");
  }

  var zone1 = body.appendParagraph("── WARM-UP PROMPT ──");
  zone1.editAsText().setFontSize(12).setForegroundColor("#333333");

  var promptPara = body.appendParagraph(promptText);
  promptPara.editAsText().setFontSize(12).setForegroundColor("#333333");

  var zone1End = body.appendParagraph("── END PROMPT ──");
  zone1End.editAsText().setFontSize(12).setForegroundColor("#333333");

  body.appendParagraph("");

  var zone2 = body.appendParagraph("── YOUR RESPONSE ──");
  zone2.editAsText().setFontSize(11).setForegroundColor("#202124");

  doc.saveAndClose();
  return { file: file };
}

// Accepts either an ISO-ish string or whatever Studio hands back for a
// Sheets Date cell mapped to a STRING variable -- format isn't
// confirmed, so this degrades gracefully to the raw string rather than
// throwing if Date parsing fails.
function normalizeDateIso_(raw) {
  var d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatReadableDate_(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMMM d, yyyy");
}

// WarmUpQueue column indices (0-based) -- from 25_WarmUpWriter.js's own
// WQ25_* constants, confirmed directly against that file, not inferred.
var WARMUP_QUEUE_COLUMNS_ = {
  QUEUE_ID: 0, STATUS: 8, DOC_ID: 9, DOC_URL: 10,
};

function findWarmUpQueueRow_(sheet, queueId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][WARMUP_QUEUE_COLUMNS_.QUEUE_ID]).trim() === queueId) {
      return i + 1; // 1-indexed row number for getRange
    }
  }
  return -1;
}

function writeWarmUpQueueResult_(ledgerSsId, queueId, fields) {
  var ss = SpreadsheetApp.openById(ledgerSsId);
  var sheet = ss.getSheetByName("WarmUpQueue");
  if (!sheet) {
    throw new Error("No tab named \"WarmUpQueue\" in spreadsheet " + ledgerSsId);
  }
  var rowNum = findWarmUpQueueRow_(sheet, queueId);
  if (rowNum === -1) {
    throw new Error("No WarmUpQueue row found for Queue_ID " + queueId);
  }
  sheet.getRange(rowNum, WARMUP_QUEUE_COLUMNS_.STATUS + 1).setValue(fields.status);
  if (fields.docId) sheet.getRange(rowNum, WARMUP_QUEUE_COLUMNS_.DOC_ID + 1).setValue(fields.docId);
  if (fields.docUrl) sheet.getRange(rowNum, WARMUP_QUEUE_COLUMNS_.DOC_URL + 1).setValue(fields.docUrl);
  SpreadsheetApp.flush();
}
