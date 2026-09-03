// =============================================================================
// FILE: 27_LessonFrameGenerator.js
// BOUND TO: Central Ledger spreadsheet AND the Teacher Dashboard standalone
//   web app — called synchronously from Script 22's onLessonContextSubmit_(),
//   which itself runs in the Teacher Dashboard project (see that file's
//   header). Same dual placement as 26_CompetencyAlignmentLog.js, for the
//   same reason. See tools/gas-lint/project-map.json's
//   cas-ccps:teacher-dashboard entry.
//
// PURPOSE: Compiles a formatted "Lesson Frame" Google Doc from a
//          LessonContext row — the objective, activity, prior-lesson
//          connection, and competency alignment a teacher already entered —
//          for the teacher to review and approve before class. This is
//          27_LessonFrameGenerator, the script two other files have been
//          quietly waiting on: 22_LessonContextHandler.js's
//          onLessonContextSubmit_() has returned frameDocUrl: null since it
//          was written, and 07_TeacherDashboard.js's client already opens
//          that URL the moment it's non-null. Both needed no change beyond
//          this file existing and being called.
//
// WHY SYNCHRONOUS, NOT AN ASYNC/QUEUED FLOW: one internal doc floated this
// as "Studio Flow 5," matching the nightly WarmUpQueue/Flow-3/4 pattern —
// but that's incompatible with the hooks that actually exist. S22 and S07
// both assume a URL is ready in the same request/response cycle as the
// lesson submission; an async flow would leave frameDocUrl null every time
// and the already-built window.open() hook would simply never fire. It also
// isn't needed: every piece of content below (objective, activity, prior-
// lesson connection, competency text) is already-collected structured or
// free-text data — none of it requires an LLM call, exactly like
// 26_CompetencyAlignmentLog.js's generateAlignmentReport(), whose Doc-
// building idiom this file reuses directly.
//
// WHAT THIS DOES NOT INCLUDE: a real "suggested warm-up question."
// PLATFORM_DOCUMENTATION.html describes one, but LessonContext and
// WarmUpQueue are unrelated subsystems — 24_WarmUpBridge.js's findLesson_()
// reads LessonContext only to feed Flow 3's *future* nightly generation,
// never the reverse. At the moment a frame is generated (synchronously, at
// submission time), no warm-up exists yet for that lesson in the ordinary
// case. Rather than fabricate one or build a lookup that would almost
// always come up empty, the frame doc carries a labeled placeholder section
// instead — honest about what isn't wired yet rather than silent about it.
//
// ENTRY POINT:
//   generateLessonFrame_(lessonId) — called by
//   22_LessonContextHandler.js's onLessonContextSubmit_(), only after
//   logAlignmentForLesson_() (Script 26) has succeeded for the same lessonId
//   — the competency alignment section below depends on that having run.
//
// DEPENDENCY NOTE: calls getRubricsForLesson_() from
// 32_CompetencyRubricImporter.js, which is why that file is now also in
// the cas-ccps:teacher-dashboard project (gas-lint's cross-project call
// check caught the gap — it wasn't there before this file needed it).
//
// RETURNS:
//   { success: true, docId, docUrl }
//   { success: true, skipped: true, reason }   // row not ready, or already done
//   { success: false, error: "human-readable message" }
// =============================================================================

// ---------------------------------------------------------------------------
// generateLessonFrame_
// ---------------------------------------------------------------------------
function generateLessonFrame_(lessonId) {
  if (!lessonId) {
    return { success: false, error: "No lessonId provided." };
  }

  const cfg     = getConfig_();
  const ss      = SpreadsheetApp.openById(cfg.ledgerSsId);
  const lcSheet = ss.getSheetByName(cfg.tabs.lessonContext);
  if (!lcSheet) {
    return { success: false, error: "LessonContext tab not found." };
  }

  // Self-heal columns 15-17 before reading or writing them — safe on every
  // call, a no-op once the headers already exist. See its own comment in
  // 22_LessonContextHandler.js for why this is self-healing rather than
  // only written once at tab-creation time.
  _ensureFrameColumns_(lcSheet);

  // ── Find the LessonContext row ────────────────────────────────────────────
  // Same re-locate-by-lessonId idiom as logAlignmentForLesson_() (Script 26)
  // and writeErrorNote_() (Script 22) — the row was already appended before
  // this function runs, so it's found by ID rather than passed in directly.
  const lcData = lcSheet.getDataRange().getValues();
  let lessonRowIdx = -1;
  let lessonRow    = null;
  for (let i = 1; i < lcData.length; i++) {
    if (String(lcData[i][LC_LESSON_ID]).trim() === lessonId) {
      lessonRowIdx = i;
      lessonRow    = lcData[i];
      break;
    }
  }
  if (!lessonRow) {
    return { success: false, error: "LessonContext row not found for ID: " + lessonId };
  }

  // ── Idempotency guards ────────────────────────────────────────────────────
  // Mirrors logAlignmentForLesson_()'s own two guards: "already done" returns
  // the existing result rather than regenerating (a teacher's popup-blocked
  // fallback click, or any accidental re-call, shouldn't mint a second doc
  // for the same lesson); "not ready yet" skips without erroring, since a
  // status other than ALIGNMENT_LOGGED just means S26 hasn't finished for
  // this row (or it's already SUPERSEDED/ERROR) — not a fault in this
  // function.
  const currentStatus = String(lessonRow[LC_STATUS]).trim();
  const existingUrl    = String(lessonRow[LC_FRAME_DOC_URL] || "").trim();
  if (currentStatus === LC_STATUS_FRAME_GENERATED && existingUrl) {
    Logger.log("[S27] Skipping " + lessonId + " — frame already generated.");
    return {
      success: true,
      docId:   String(lessonRow[LC_FRAME_DOC_ID] || "").trim(),
      docUrl:  existingUrl,
    };
  }
  if (currentStatus !== LC_STATUS_ALIGNMENT_LOGGED) {
    Logger.log("[S27] Skipping " + lessonId + " — status is " + currentStatus + ", not ALIGNMENT_LOGGED.");
    return { success: true, skipped: true, reason: "status is " + currentStatus };
  }

  // ── Gather lesson fields ──────────────────────────────────────────────────
  const teacherEmail     = String(lessonRow[LC_TEACHER_EMAIL]           || "").trim();
  const lessonDate       = String(lessonRow[LC_LESSON_DATE]             || "").trim();
  const periodOrClass    = String(lessonRow[LC_PERIOD_OR_CLASS]         || "").trim();
  const activity         = String(lessonRow[LC_ACTIVITY_DESCRIPTION]    || "").trim();
  const objective        = String(lessonRow[LC_LEARNING_OBJECTIVE]      || "").trim();
  const priorConnection  = String(lessonRow[LC_PRIOR_LESSON_CONNECTION] || "").trim();
  const rawCompIds       = String(lessonRow[LC_COMPETENCY_IDS]          || "").trim();
  const term             = String(lessonRow[LC_TERM]                   || "").trim();
  const compIds = rawCompIds ? rawCompIds.split(",").map(id => id.trim()).filter(Boolean) : [];

  // ── Competency alignment — Script 32's rubric lookup ──────────────────────
  // Same call 24_WarmUpBridge.js already makes for the identical purpose
  // (per-lesson competency detail), wrapped the same way: a lookup failure
  // (e.g. CompetencyRubrics tab not yet imported) degrades to an empty list
  // rather than failing the whole frame.
  let rubrics = [];
  try {
    rubrics = getRubricsForLesson_(compIds);
  } catch (rubricErr) {
    Logger.log("[S27] getRubricsForLesson_ failed for " + lessonId + ": " + rubricErr.message);
  }
  // getRubricsForLesson_() silently omits any ID it can't find (only a
  // Logger.log warning) — surfaced here rather than left invisible, since a
  // frame that quietly shows fewer competencies than the teacher actually
  // selected would misrepresent what the lesson covers.
  const foundIds = new Set(rubrics.map(r => r.competency_id));
  const missingIds = compIds.filter(id => !foundIds.has(id));

  // ── Build the Doc ──────────────────────────────────────────────────────────
  // Same idiom as generateAlignmentReport() (26_CompetencyAlignmentLog.js):
  // DocumentApp.create() always lands in Drive root; move it to the
  // teacher's folder (or leave it in root if unset) immediately after.
  const generatedAt = new Date();
  const tz           = Session.getScriptTimeZone();
  const dateStr       = Utilities.formatDate(generatedAt, tz, "yyyy-MM-dd");
  const teacherLabel  = cfg.teacherName || teacherEmail;
  const title = "Lesson Frame — " + lessonDate +
    (periodOrClass ? " (" + periodOrClass + ")" : "") +
    " — " + teacherLabel + " — " + dateStr;

  const folder = cfg.teacherFolderId
    ? DriveApp.getFolderById(cfg.teacherFolderId)
    : DriveApp.getRootFolder();

  const doc  = DocumentApp.create(title);
  const body = doc.getBody();
  DriveApp.getFileById(doc.getId()).moveTo(folder);

  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);

  body.appendParagraph("Learning Objective").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(objective || "(not provided)");

  body.appendParagraph("Today's Activity").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(activity || "(not provided)");

  // Nullable field — first lesson of a unit may leave this blank, and this
  // section is omitted entirely rather than shown empty, matching how the
  // rest of this codebase treats a genuinely absent field (e.g.
  // getWeeklyAssignments_() omitting a score rather than printing a zero).
  if (priorConnection) {
    body.appendParagraph("Connection to Prior Lesson").setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(priorConnection);
  }

  body.appendParagraph("Competency Alignment").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  if (rubrics.length === 0 && missingIds.length === 0) {
    body.appendParagraph("(no competencies selected for this lesson)");
  } else {
    rubrics.forEach(r => {
      body.appendParagraph(
        "•  " + r.competency_id + (r.duty_area ? " (" + r.duty_area + ")" : "")
      ).setBold(true);
      if (r.competency_text) {
        body.appendParagraph("    " + r.competency_text)
          .editAsText().setFontSize(10).setForegroundColor("#555555");
      }
    });
    // Not silently dropped — see the comment above missingIds' definition.
    missingIds.forEach(id => {
      body.appendParagraph("•  " + id + " — not found in the competency registry")
        .editAsText().setForegroundColor("#999999");
    });
  }

  // Labeled placeholder — see this file's header for why a real value isn't
  // available here.
  body.appendParagraph("Suggested Warm-Up").setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(
    "Generated separately by the nightly warm-up flow, not at lesson-submission " +
    "time — check WarmUpQueue for this lesson once that run has completed."
  ).editAsText().setItalic(true);

  doc.saveAndClose();

  const docId  = doc.getId();
  const docUrl = "https://docs.google.com/document/d/" + docId + "/edit";
  Logger.log("[S27] Lesson frame generated for " + lessonId + ": " + docUrl);

  // ── Register in ReportRegistry ─────────────────────────────────────────────
  // Reuses 26_CompetencyAlignmentLog.js's registerReport_() directly rather
  // than duplicating it — see that function's own comment on why this is
  // safe (this file sits in the same two GAS projects Script 26 does).
  registerReport_(ss, cfg, generatedAt, term, teacherEmail, docId, docUrl, "LESSON_FRAME");

  // ── Write back to the LessonContext row ────────────────────────────────────
  const sheetRow = lessonRowIdx + 1; // +1 for 1-based index, same as Script 26
  lcSheet.getRange(sheetRow, LC_FRAME_DOC_ID + 1).setValue(docId);
  lcSheet.getRange(sheetRow, LC_FRAME_DOC_URL + 1).setValue(docUrl);
  lcSheet.getRange(sheetRow, LC_FRAME_GENERATED_AT + 1).setValue(generatedAt);
  lcSheet.getRange(sheetRow, LC_STATUS + 1).setValue(LC_STATUS_FRAME_GENERATED);

  return { success: true, docId: docId, docUrl: docUrl };
}
