// =============================================================================
// FILE: 07_TeacherDashboard.js
// STANDALONE APPS SCRIPT PROJECT — deployed as Web App
// PURPOSE: Teacher-facing dashboard. Reads from the central Ledger,
//          filtered to show only students assigned to the requesting teacher.
//          Also provides the Lesson Context submission form (modal) and
//          the submitLessonContext() handler called by it.
//          All IDs from getConfig_() / Script Properties.
// DEPLOY:  Execute as: Me · Access: Anyone in organization
//
// MODULE 2 ADDITIONS (marked ── M2 ──):
//   submitLessonContext()    — server-side handler called by modal form
//   getCompetencies()        — returns filtered competency list for dropdown
//   buildModalHtml_()        — modal markup injected into dashboard shell
//   All existing functions unchanged.
// =============================================================================

function doGet() {
  return HtmlService
    .createHtmlOutput(buildDashboardHtml_())
    .setTitle("Assignment Dashboard")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------------------------------------------------------------------------
// getDashboardData — called client-side via google.script.run
// Filters Ledger to the requesting teacher's email and optionally by term
// ---------------------------------------------------------------------------
function getDashboardData(termFilter) {
  const cfg = getConfig_();
  const teacherEmail = cfg.teacherEmail;

  const activeTerm = termFilter ||
    PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "ALL";

  const ss          = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledger      = ss.getSheetByName(cfg.tabs.ledger);
  const staging     = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const ledgerData  = ledger.getDataRange().getValues();
  const stagingData = staging ? staging.getDataRange().getValues() : [];

  // Build pipeline status lookup by FileID
  const pipelineStatus  = {};
  const stagingHeaders  = stagingData[0] ? stagingData[0].map(h => String(h).trim()) : [];
  const spFileIdx       = stagingHeaders.indexOf("StudentFileID");
  const spStatusIdx     = stagingHeaders.indexOf("Status");
  for (let i = 1; i < stagingData.length; i++) {
    const fid = spFileIdx   !== -1 ? String(stagingData[i][spFileIdx]).trim()   : "";
    const st  = spStatusIdx !== -1 ? String(stagingData[i][spStatusIdx]).trim() : "";
    if (fid) pipelineStatus[fid] = st;
  }

  const students  = [];
  const unitMap   = {};
  const allTerms  = new Set();

  for (let i = 1; i < ledgerData.length; i++) {
    const row = ledgerData[i];
    if (String(row[8]).toLowerCase() !== teacherEmail.toLowerCase()) continue;
    if (!row[1]) continue;

    const rowTerm    = String(row[18] || "").trim();
    const ledgerStatus = String(row[12]).trim();

    if (rowTerm) allTerms.add(rowTerm);
    if (ledgerStatus === "ARCHIVED") continue;
    if (activeTerm !== "ALL" && rowTerm && rowTerm !== activeTerm) continue;

    const fileId       = String(row[3]).trim();
    const unitCode     = String(row[10]).trim();
    const displayStatus = resolveDisplay_(ledgerStatus, pipelineStatus[fileId]);
    const statusClass  = resolveClass_(displayStatus);

    students.push({
      name:        String(row[4]).trim()  || "—",
      googleId:    String(row[1]).trim(),
      block:       String(row[5]).trim(),
      className:   String(row[6]).trim(),
      period:      String(row[11]).trim(),
      subject:     String(row[9]).trim(),
      unitCode:    unitCode,
      configId:    String(row[2]).trim(),
      status:      displayStatus,
      statusClass: statusClass,
      lastEval:    row[15] ? formatDate_(row[15]) : "Never",
      submittedAt: row[13] ? formatDate_(row[13]) : "—",
      docUrl:      fileId
        ? "https://docs.google.com/document/d/" + fileId + "/edit"
        : null
    });

    if (!unitMap[unitCode]) unitMap[unitCode] = { total:0, compliant:0, pending:0, flagged:0 };
    unitMap[unitCode].total++;
    // These three buckets must exactly partition every statusClass so the
    // unit header's displayed sum always matches `total` — the previous
    // version only recognized "QUEUED"/"EVALUATING NOW" as pending, so
    // "NOT STARTED" and "EVALUATED" rows (both real, common states) fell
    // into no bucket at all and the numbers silently didn't add up.
    if (statusClass === "compliant")    unitMap[unitCode].compliant++;
    else if (statusClass === "flagged") unitMap[unitCode].flagged++;
    else                                 unitMap[unitCode].pending++;
  }

  students.sort((a, b) => {
    if (a.statusClass === "flagged" && b.statusClass !== "flagged") return -1;
    if (b.statusClass === "flagged" && a.statusClass !== "flagged") return 1;
    if (a.unitCode < b.unitCode) return -1;
    if (a.unitCode > b.unitCode) return 1;
    return a.name.localeCompare(b.name);
  });

  // ── M2 warm-up readiness indicator ──────────────────────────────────────
  // Reads StudentProfiles to build the dashboard readiness panel.
  // Shows: students with eval history / warm-up history / shadow confidence.
  // buildShadowMatrixSummary_() is defined in Script 23 (same project).
  let warmUpReadiness = null;
  const m2Enabled = PropertiesService.getScriptProperties().getProperty("M2_ENABLED");
  if (m2Enabled === "true") {
    try {
      warmUpReadiness = buildShadowMatrixSummary_(ss, cfg);
    } catch(e) {
      Logger.log("[S07] Could not build warm-up readiness: " + e.message);
    }
  }

  return {
    students:       students,
    unitSummary:    unitMap,
    teacherEmail:   teacherEmail,
    activeTerm:     activeTerm,
    availableTerms: [...allTerms].sort().reverse(),
    generatedAt:    formatDate_(new Date()),
    warmUpReadiness: warmUpReadiness,  // null if M2 not enabled
    m2Enabled:      m2Enabled === "true"
  };
}

// ── M2 ──────────────────────────────────────────────────────────────────────
// getCompetencies — discovers all courses for this teacher from the registry,
// returns competencies grouped by course, sorted by task number within each.
//
// Course discovery: a row belongs to this teacher if:
//   (a) teacher_email matches this teacher's email, OR
//   (b) teacher_email is blank (shared row available to all teachers)
// All unique subject values across matching rows become course tabs.
//
// Returns:
//   { courses: [{ code, name, competencies: [{ id, taskNum, text, strand }] }] }
//   courses sorted by code (8175 before 8177 etc.)
//   competencies within each course sorted by taskNum ascending
//
// ── M3 HOOK ──
//   Each competency carries a scaffolding placeholder populated by
//   getStudentScaffoldingData() when Module 3 student profiles exist.
//   For now scaffolding is always an empty array — zero UI cost.
// ── M2 ──────────────────────────────────────────────────────────────────────
function getCompetencies() {
  const cfg   = getConfig_();
  const email = cfg.teacherEmail || "";

  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.competencyRegistry);

  if (!sheet) {
    Logger.log("[M2] CompetencyRegistry tab not found.");
    return { error: "CompetencyRegistry tab not found. Run Module 2 setup." };
  }

  const data    = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim());

  // Column indices — resolved by name, not position
  const iId      = headers.indexOf("competency_id");
  const iText    = headers.indexOf("competency_text");
  const iSubject = headers.indexOf("subject");
  const iStrand  = headers.indexOf("strand");
  const iEmail   = headers.indexOf("teacher_email");
  const iActive  = headers.indexOf("active");

  if (iId === -1 || iText === -1) {
    return { error: "CompetencyRegistry missing required columns (competency_id, competency_text)." };
  }

  // ── Pass 1: collect all rows visible to this teacher ─────────────────────
  // A row is visible if: teacher_email matches OR teacher_email is blank.
  // Rows scoped to a different teacher are excluded.
  const visibleRows = [];
  for (let i = 1; i < data.length; i++) {
    const row      = data[i];
    const active   = iActive === -1 ? true
      : String(row[iActive]).trim().toUpperCase() !== "FALSE";
    if (!active) continue;

    const rowEmail = iEmail !== -1 ? String(row[iEmail]).trim() : "";
    const isShared = !rowEmail;
    const isOwned  = rowEmail.toLowerCase() === email.toLowerCase();
    if (!isShared && !isOwned) continue;

    const compId  = String(row[iId]).trim();
    const subject = iSubject !== -1 ? String(row[iSubject]).trim() : "";
    if (!compId) continue;

    // Extract task number from ID for sort — format is "COURSECODE-N"
    // e.g. "8177-15" → taskNum 15. Falls back to 9999 if unparseable.
    const dashIdx = compId.lastIndexOf("-");
    const taskNum = dashIdx !== -1
      ? parseInt(compId.substring(dashIdx + 1), 10) || 9999
      : 9999;

    // Extract course code — everything before the last dash
    const courseCode = dashIdx !== -1 ? compId.substring(0, dashIdx) : compId;

    visibleRows.push({
      id:         compId,
      courseCode: courseCode,
      subject:    subject,
      taskNum:    taskNum,
      text:       String(row[iText]).trim(),
      strand:     iStrand !== -1 ? String(row[iStrand]).trim() : "",
      scaffolding: []  // ── M3 hook: populated by getStudentScaffoldingData() ──
    });
  }

  if (visibleRows.length === 0) {
    return { error: "No competencies found. Check the CompetencyRegistry tab." };
  }

  // ── Pass 2: group by course, sort by taskNum within each ─────────────────
  // courseMap: { courseCode: { name, competencies[] } }
  const courseMap = {};
  for (const comp of visibleRows) {
    const code = comp.courseCode;
    if (!courseMap[code]) {
      courseMap[code] = {
        code:          code,
        name:          comp.subject || code,  // subject column as display name
        competencies:  []
      };
    }
    courseMap[code].competencies.push({
      id:          comp.id,
      taskNum:     comp.taskNum,
      text:        comp.text,
      strand:      comp.strand,
      scaffolding: comp.scaffolding
    });
  }

  // Sort competencies within each course by taskNum ascending
  for (const code of Object.keys(courseMap)) {
    courseMap[code].competencies.sort((a, b) => a.taskNum - b.taskNum);
  }

  // Sort courses by code ascending (8175 before 8177)
  const courses = Object.values(courseMap)
    .sort((a, b) => a.code.localeCompare(b.code));

  Logger.log("[M2] getCompetencies: " + courses.length + " course(s), " +
    visibleRows.length + " total competencies for " + email);

  return { courses: courses };
}

// ── M2 ──────────────────────────────────────────────────────────────────────
// submitLessonContext — server-side handler for the modal form submit.
// Validates input, delegates to Script 22 handler, returns result to client.
//
// Params (from client):
//   payload {
//     lessonDate, periodOrClass, activityDescription,
//     learningObjective, keyVocabulary, priorLessonConnection,
//     competencyIds   // comma-separated string
//   }
//
// Returns:
//   { success: true,  lessonId: "LES-...", frameDocUrl: null }  — on success
//   { success: false, error: "human-readable message" }          — on failure
// ── M2 ──────────────────────────────────────────────────────────────────────
function submitLessonContext(payload) {
  try {
    // Attach teacher identity from Script Properties — not from client payload
    const cfg = getConfig_();
    payload.teacherEmail = cfg.teacherEmail;
    payload.teacherName  = cfg.teacherName;

    // Delegate to Script 22
    const result = onLessonContextSubmit_(payload);
    return result;

  } catch (err) {
    Logger.log("[M2] submitLessonContext error: " + err.message);
    return { success: false, error: "Submission failed: " + err.message };
  }
}

// ---------------------------------------------------------------------------
// Existing helper functions — unchanged
// ---------------------------------------------------------------------------
function resolveDisplay_(ledger, pipeline) {
  if (pipeline === "IN_PROCESS")        return "EVALUATING NOW";
  if (pipeline === "PENDING_INFERENCE") return "QUEUED";
  switch (ledger) {
    case "ACTIVE":    return "NOT STARTED";
    case "STAGED":    return "QUEUED";
    case "COMPLETE":  return "EVALUATED";
    case "COMPLIANT": return "COMPLIANT ✓";
    default:          return ledger.startsWith("ERROR") ? "FLAGGED ⚠" : (ledger || "UNKNOWN");
  }
}

function resolveClass_(display) {
  if (display === "COMPLIANT ✓")    return "compliant";
  if (display === "EVALUATING NOW") return "active";
  if (display === "QUEUED")         return "queued";
  if (display === "EVALUATED")      return "evaluated";
  if (display === "NOT STARTED")    return "not-started";
  if (display.includes("FLAGGED"))  return "flagged";
  return "unknown";
}

function formatDate_(d) {
  try {
    if (!(d instanceof Date)) d = new Date(d);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  } catch (e) { return String(d); }
}

// ---------------------------------------------------------------------------
// buildDashboardHtml_ — self-contained single-page UI
// M2 additions: "New Lesson" button in header, modal markup, modal JS
// ---------------------------------------------------------------------------
function buildDashboardHtml_() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Assignment Dashboard</title>
<style>
/* ── RESET + BASE ── */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Google Sans",Roboto,Arial,sans-serif;background:#f8f9fa;color:#202124;font-size:14px}

/* ── HEADER ── */
header{background:#1a73e8;color:white;padding:16px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header h1{font-size:18px;font-weight:500;flex:1}
#refresh-btn{background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:white;padding:7px 14px;border-radius:4px;cursor:pointer;font-size:13px}
#refresh-btn:hover{background:rgba(255,255,255,0.3)}
#term-filter{padding:6px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15);color:white;font-size:13px;margin-left:0}
#term-filter option{color:#202124;background:white}

/* ── M2: NEW LESSON BUTTON ── */
#new-lesson-btn{background:white;color:#1a73e8;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;letter-spacing:.2px;transition:background 0.15s}
#new-lesson-btn:hover{background:#e8f0fe}

/* ── LOADING ── */
#loading{text-align:center;padding:60px 24px;color:#5f6368}
.spinner{width:36px;height:36px;border:3px solid #e8eaed;border-top-color:#1a73e8;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── MAIN ── */
.main{padding:20px 24px}
.summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.summary-card{background:white;border-radius:8px;padding:16px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.summary-card .count{font-size:32px;font-weight:600;line-height:1;margin-bottom:6px}
.summary-card .label{font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:.5px}
.card-compliant .count{color:#1e8e3e}.card-pending .count{color:#e37400}
.card-flagged .count{color:#d93025}.card-total .count{color:#1a73e8}
.unit-section{margin-bottom:28px}
.unit-header{font-size:13px;font-weight:600;color:#5f6368;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e8eaed}
.student-row{background:white;border-radius:8px;padding:14px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;box-shadow:0 1px 2px rgba(0,0,0,.08);border-left:4px solid #dadce0;transition:box-shadow .15s,transform .1s}
.student-row:hover{box-shadow:0 3px 10px rgba(0,0,0,.15);transform:translateY(-1px)}
.student-row.compliant{border-left-color:#1e8e3e}
.student-row.active{border-left-color:#1a73e8}
.student-row.queued{border-left-color:#e37400}
.student-row.evaluated{border-left-color:#9334e6}
.student-row.not-started{border-left-color:#dadce0}
.student-row.flagged{border-left-color:#d93025;background:#fef7f7}
.student-name{font-weight:500;font-size:14px;margin-bottom:3px}
.student-meta{font-size:12px;color:#5f6368}
.last-eval{font-size:11px;color:#80868b;margin-top:2px}
.doc-link{display:block;font-size:11px;color:#1a73e8;margin-top:4px;text-decoration:none}
.doc-link:hover{text-decoration:underline}
.status-badge{font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;white-space:nowrap}
.badge-compliant{background:#e6f4ea;color:#1e8e3e}
.badge-active{background:#e8f0fe;color:#1a73e8}
.badge-queued{background:#fef3e2;color:#9c5000}
.badge-evaluated{background:#f3e8fd;color:#9334e6}
.badge-not-started{background:#f1f3f4;color:#5f6368}
.badge-flagged{background:#fce8e6;color:#d93025}
.badge-unknown{background:#f1f3f4;color:#5f6368}
footer{text-align:center;padding:16px;font-size:11px;color:#80868b}

/* ── M2: MODAL ── */
.modal-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:200;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.modal-backdrop.open{display:flex;animation:modalBackdropIn .18s ease}
.modal-backdrop.open .modal{animation:modalPopIn .18s ease}
@keyframes modalBackdropIn{from{opacity:0}to{opacity:1}}
@keyframes modalPopIn{from{opacity:.6;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(prefers-reduced-motion:reduce){.modal-backdrop.open,.modal-backdrop.open .modal{animation:none}}
.modal{background:white;border-radius:12px;width:100%;max-width:640px;box-shadow:0 8px 32px rgba(0,0,0,0.22);overflow:hidden;margin:auto}
.modal-header{background:#1a73e8;color:white;padding:18px 24px;display:flex;align-items:center;justify-content:space-between}
.modal-header h2{font-size:16px;font-weight:500}
.modal-close{background:none;border:none;color:white;font-size:22px;cursor:pointer;line-height:1;padding:0 4px;opacity:.8}
.modal-close:hover{opacity:1}
.modal-body{padding:24px}
.modal-footer{padding:16px 24px;border-top:1px solid #e8eaed;display:flex;justify-content:flex-end;gap:10px;align-items:center}

/* ── M2: FORM ELEMENTS ── */
.field{margin-bottom:18px}
.field label{display:block;font-size:13px;font-weight:500;color:#3c4043;margin-bottom:6px}
.field label .req{color:#d93025;margin-left:2px}
.field input[type="date"],
.field input[type="text"],
.field textarea,
.field select{width:100%;padding:9px 12px;border:1px solid #dadce0;border-radius:6px;font-size:14px;font-family:inherit;color:#202124;background:white;transition:border-color 0.15s}
.field input:focus,.field textarea:focus,.field select:focus{outline:none;border-color:#1a73e8;box-shadow:0 0 0 2px rgba(26,115,232,0.15)}
.field textarea{resize:vertical;min-height:80px;line-height:1.5}
.field .hint{font-size:11px;color:#80868b;margin-top:4px}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}

/* ── M2: COURSE TABS ── */
.course-tabs{display:flex;gap:0;border-bottom:2px solid #e8eaed;margin-bottom:16px}
.course-tab{font-size:13px;font-weight:500;color:#5f6368;padding:10px 16px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.15s;white-space:nowrap;display:flex;align-items:center;gap:6px;background:none;border-top:none;border-left:none;border-right:none}
.course-tab:hover{color:#202124;background:#f8f9fa}
.course-tab.active{color:#1a73e8;border-bottom-color:#1a73e8;font-weight:600}
.course-tab .tab-badge{font-size:11px;background:#1a73e8;color:white;border-radius:10px;padding:1px 6px;font-weight:600;display:none}
.course-tab.active .tab-badge{background:#1a73e8}
.course-tab .tab-badge.has-checks{display:inline-block}
.course-panel{display:none}
.course-panel.active{display:block}

/* ── M2: COMPETENCY CHECKLIST ── */
.competency-loading{color:#80868b;font-size:13px;padding:8px 0}
.strand-group{margin-bottom:14px}
.strand-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#80868b;margin-bottom:6px;padding:4px 0;border-bottom:1px solid #f1f3f4}
.competency-item{display:flex;align-items:flex-start;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background 0.1s}
.competency-item:hover{background:#f8f9fa}
.competency-item input[type="checkbox"]{margin-top:2px;flex-shrink:0;accent-color:#1a73e8;width:15px;height:15px;cursor:pointer}
.competency-item .c-num{font-family:monospace;font-size:11px;color:#1a73e8;font-weight:700;white-space:nowrap;min-width:32px}
.competency-item .c-text{font-size:13px;color:#3c4043;line-height:1.45}
.competency-item .c-scaffold{font-size:10px;color:#1e8e3e;margin-top:2px}
.competency-empty{font-size:13px;color:#80868b;padding:8px 0}
.comp-container{max-height:260px;overflow-y:auto;border:1px solid #e8eaed;border-radius:6px;padding:8px 4px}

/* ── M2: SUBMIT BUTTON ── */
#submit-btn{background:#1a73e8;color:white;border:none;padding:9px 22px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:background 0.15s}
#submit-btn:hover{background:#1557b0}
#submit-btn:disabled{background:#dadce0;color:#80868b;cursor:not-allowed}
#cancel-btn{background:none;border:none;color:#5f6368;font-size:14px;cursor:pointer;padding:9px 14px}
#cancel-btn:hover{color:#202124}

/* ── M2: TOAST ── */
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#202124;color:white;padding:12px 20px;border-radius:8px;font-size:14px;z-index:400;opacity:0;transition:opacity 0.2s;pointer-events:none}
.toast.show{opacity:1}
.toast.error{background:#d93025}

/* ── M2: FORM ERROR ── */
.form-error{background:#fce8e6;color:#c5221f;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;display:none}

@media(max-width:600px){
  .field-row{grid-template-columns:1fr}
  .modal{border-radius:0}
  .modal-backdrop{padding:0}
}
</style>
</head>
<body>

<header>
  <h1>📊 Assignment Dashboard</h1>
  <!-- ── M2: New Lesson button ── -->
  <!-- Hidden until loadData() confirms M2_ENABLED — see the m2Enabled toggle below. -->
  <button id="new-lesson-btn" onclick="openModal()" style="display:none">+ New Lesson</button>
  <button id="refresh-btn" onclick="loadData()">↻ Refresh</button>
  <label for="term-filter" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Filter by term</label>
  <select id="term-filter" onchange="loadData()" aria-label="Filter by term">
    <option value="ALL">All Terms</option>
  </select>
</header>

<!-- ── M2: Warm-Up Readiness Panel ── -->
<div id="warmup-readiness-panel" style="display:none;background:#f8f9fa;border-bottom:1px solid #e8eaed;padding:10px 24px;font-size:12.5px;color:#5f6368;display:flex;gap:24px;align-items:center;flex-wrap:wrap">
  <span id="wr-unit" style="font-weight:600;color:#1a73e8"></span>
  <span id="wr-eval"></span>
  <span id="wr-warmup"></span>
  <span id="wr-confidence"></span>
  <span id="wr-locked"></span>
</div>
<div id="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading class data…</p></div>
<div id="main" class="main" style="display:none"></div>
<footer id="footer"></footer>

<!-- ── M2: LESSON CONTEXT MODAL ── -->
<div class="modal-backdrop" id="modal-backdrop" onclick="handleBackdropClick(event)">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">

    <div class="modal-header">
      <h2 id="modal-title">Log a Lesson</h2>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">×</button>
    </div>

    <div class="modal-body">
      <div class="form-error" id="form-error" role="alert" aria-live="assertive"></div>
      <div id="draft-stale-hint" role="status" aria-live="polite" style="display:none;background:#e8f0fe;color:#1a73e8;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px"></div>

      <!-- Row 1: Date + Period -->
      <div class="field-row">
        <div class="field">
          <label for="f-date">Lesson date <span class="req">*</span></label>
          <input type="date" id="f-date">
        </div>
        <div class="field">
          <label for="f-period">Period / class</label>
          <input type="text" id="f-period" placeholder="e.g. Period 3  (optional)">
        </div>
      </div>

      <!-- Learning objective -->
      <div class="field">
        <label for="f-objective">Learning objective <span class="req">*</span></label>
        <textarea id="f-objective" rows="2" placeholder="What can students do by the end of this lesson that they couldn't at the start?"></textarea>
      </div>

      <!-- Activity description -->
      <div class="field">
        <label for="f-activity">What students are doing <span class="req">*</span></label>
        <textarea id="f-activity" rows="2" placeholder="Describe the activity, task, or experience."></textarea>
      </div>

      <!-- Prior lesson connection -->
      <div class="field">
        <label for="f-prior">Connection to prior lesson</label>
        <textarea id="f-prior" rows="2" placeholder="What did last lesson cover that this one builds on? (optional)"></textarea>
      </div>

      <!-- Key vocabulary -->
      <div class="field">
        <label for="f-vocab">Key vocabulary</label>
        <input type="text" id="f-vocab" placeholder="irony, dramatic irony, situational irony  (comma-separated, optional)">
        <div class="hint">Separate terms with commas.</div>
      </div>

      <!-- Competencies — course tabs -->
      <div class="field">
        <label>Competencies addressed <span class="req">*</span></label>
        <div id="competency-tabs-shell">
          <div class="competency-loading" id="comp-loading">Loading competencies…</div>
          <!-- Course tabs injected here by loadCompetencies() -->
        </div>
        <div class="hint" id="comp-hint" style="margin-top:6px"></div>
      </div>
    </div>

    <div class="modal-footer">
      <button id="cancel-btn" onclick="closeModal()">Cancel</button>
      <button id="submit-btn" onclick="submitLesson()" disabled>Log lesson</button>
    </div>

  </div>
</div>

<!-- Discard-confirm dialog — replaces a native confirm() so an unsaved-work
     warning looks and behaves like the rest of the app instead of a
     browser-chrome popup. Sits above the lesson modal (higher z-index),
     since it's confirming whether to close that modal. -->
<div class="modal-backdrop" id="discard-confirm-backdrop" style="z-index:300" onclick="if(event.target===this)_cancelDiscardConfirm()">
  <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-confirm-title" style="max-width:380px">
    <div class="modal-header">
      <h2 id="discard-confirm-title" style="font-size:16px">Discard this lesson log entry?</h2>
    </div>
    <div class="modal-body" style="padding-top:0">
      <p style="font-size:13px;color:#5f6368;margin:0">What you've entered hasn't been saved.</p>
    </div>
    <div class="modal-footer">
      <button id="discard-cancel-btn" onclick="_cancelDiscardConfirm()">Keep editing</button>
      <button id="discard-confirm-btn" onclick="_confirmDiscard()" style="background:#d93025;color:white;border:none;padding:9px 22px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer">Discard</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast" role="status" aria-live="polite"></div>

<script>
// ── DASHBOARD ───────────────────────────────────────────────────────────────

// ── renderWarmUpReadiness ────────────────────────────────────────────────
// Populates the warm-up readiness panel in the dashboard header.
// Called after loadData() receives warmUpReadiness from getDashboardData().
// Panel is hidden if warmUpReadiness is null (M2 not enabled or no data yet).
function renderWarmUpReadiness(r) {
  const panel = document.getElementById("warmup-readiness-panel");
  if (!panel) return;

  if (!r) { panel.style.display = "none"; return; }

  panel.style.display = "flex";

  // Current unit
  const unitEl = document.getElementById("wr-unit");
  if (unitEl) unitEl.textContent = r.currentUnit
    ? "📅 " + r.currentUnit
    : "📅 No active unit";

  // Eval history
  const evalEl = document.getElementById("wr-eval");
  if (evalEl) evalEl.textContent =
    r.withEvalHistory + " of " + r.total + " students have evaluation history";

  // Warm-up history
  const wuEl = document.getElementById("wr-warmup");
  if (wuEl) wuEl.textContent = r.withWarmUpHistory + " with warm-up responses";

  // Was "building archetype confidence" / "ready for personalized
  // archetype" — internal engine vocabulary ("archetype", "shadow
  // confidence") a teacher has no context for. Reworded to describe what
  // it actually means for their students.
  const confEl = document.getElementById("wr-confidence");
  if (confEl) confEl.textContent = r.withShadowConfidence
    ? r.withShadowConfidence + " building a personalized learning profile"
    : "";

  // Locked (high confidence)
  const lockEl = document.getElementById("wr-locked");
  if (lockEl) lockEl.textContent = r.locked
    ? r.locked + " ready for fully personalized feedback"
    : "";
}

// Per-term client cache — switching the term filter back and forth used to
// refetch and rebuild the whole dashboard from scratch every time, even
// though the previous term's data was still sitting in memory. A cache hit
// renders instantly and still revalidates in the background, so stale data
// never lingers past the next successful fetch.
let _dashCache = {};
let _loadGen = 0;
let _isFirstLoad = true;

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
  const loading = document.getElementById("loading");
  const main = document.getElementById("main");
  const refreshBtn = document.getElementById("refresh-btn");
  // The generation counter already prevents a stale response from ever
  // rendering, so rapid re-clicks never glitch the UI — but they still fire
  // redundant concurrent Apps Script executions that are immediately
  // thrown away. Disabling for the duration of this call's own round-trip
  // avoids that waste.
  if (refreshBtn) refreshBtn.disabled = true;
  const rawTerm = document.getElementById("term-filter").value || "ALL";
  // The dropdown only ever has the hardcoded "All Terms" option until this
  // very first response fills in the real list, so the very first call
  // would otherwise send the literal string "ALL" — which is truthy, so
  // the server's termFilter-or-CURRENT_TERM-or-"ALL" fallback never
  // actually consulted the admin-configured CURRENT_TERM. Sending "" only
  // on this one automatic first call lets that fallback do its job; any
  // later call (refresh, or the user genuinely picking "All Terms") still
  // sends the real selected value.
  const term = (_isFirstLoad && rawTerm === "ALL") ? "" : rawTerm;
  _isFirstLoad = false;
  const myGen = ++_loadGen;
  const cached = _dashCache[term];
  let shownSpinnerAt = 0;

  if (cached) {
    render(cached);
  } else {
    // Reset to the spinner state on every fresh (uncached) call — including
    // a retry after a failure — so the error screen never lingers behind it.
    loading.innerHTML = '<div class="spinner"></div><p>Loading class data…</p>';
    loading.style.display = "block";
    main.style.display = "none";
    shownSpinnerAt = Date.now();
  }

  google.script.run
    .withSuccessHandler(function(data) {
      if (myGen !== _loadGen) return; // a newer request already superseded this one
      _dashCache[term] = data;
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() { render(data); if (refreshBtn) refreshBtn.disabled = false; });
    })
    .withFailureHandler(function(e) {
      if (myGen !== _loadGen) return;
      if (cached) { if (refreshBtn) refreshBtn.disabled = false; return; } // still showing valid (if slightly stale) cached data
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() {
        loading.innerHTML =
          '<p style="color:#d93025;padding:24px 24px 8px;">⚠ Something went wrong loading your class data. Try refreshing.</p>' +
          '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
        if (refreshBtn) refreshBtn.disabled = false;
      });
    })
    .getDashboardData(term);
}

function render(data) {
  const main = document.getElementById("main");
  // Any refresh (manual, term change, or a cache revalidation) rebuilds the
  // whole list via innerHTML — preserve where the teacher was scrolled to
  // instead of dumping them back to the top of a long roster.
  const _scrollTop = main.scrollTop;
  if (!data || !data.students || data.students.length === 0) {
    // "No results" from picking a term with nothing in it is a completely
    // different situation from "this class genuinely has no roster yet" —
    // the setup-troubleshooting copy below used to show for both, which is
    // actively misleading the moment term filtering is used for anything
    // other than "All Terms."
    const filteredByTerm = data && data.activeTerm && data.activeTerm !== "ALL" && (data.availableTerms || []).length > 0;
    main.innerHTML = filteredByTerm
      ? \`<div style="text-align:center;padding:60px 24px;color:#5f6368">
        <div style="font-size:48px;margin-bottom:16px">📋</div>
        <p>No students for \${esc(data.activeTerm)}.<br>Try "All Terms" to see records from other terms.</p>
      </div>\`
      : \`<div style="text-align:center;padding:60px 24px;color:#5f6368;white-space:pre-line">
      <div style="font-size:48px;margin-bottom:16px">📋</div>
      <p>No students registered yet.

If you expect to see students here:
• Confirm the Turn-In/Confirmation form has been set up for this class
• Check the TeacherMatrix sheet for this class's roster
• Give it a few minutes if students were just registered</p>
    </div>\`;
    document.getElementById("loading").style.display = "none";
    main.style.display = "block";
    return;
  }

  const total     = data.students.length;
  const compliant = data.students.filter(s => s.statusClass === "compliant").length;
  const flagged   = data.students.filter(s => s.statusClass === "flagged").length;
  // "In progress" is everything not yet compliant or flagged (queued,
  // evaluating now, evaluated, not started, unknown) — computed as the
  // remainder rather than an explicit allowlist so it can never silently
  // exclude a real status and leave the three cards short of the total,
  // the exact bug that made "NOT STARTED"/"EVALUATED" students vanish before.
  const pending   = total - compliant - flagged;

  let html = \`<div class="summary-grid">
    <div class="summary-card card-total"><div class="count">\${total}</div><div class="label">Students</div></div>
    <div class="summary-card card-compliant"><div class="count">\${compliant}</div><div class="label">Submitted</div></div>
    <div class="summary-card card-pending"><div class="count">\${pending}</div><div class="label">In progress</div></div>
    <div class="summary-card card-flagged"><div class="count">\${flagged}</div><div class="label">Needs attention</div></div>
  </div>\`;

  const units = {};
  data.students.forEach(s => {
    if (!units[s.unitCode]) units[s.unitCode] = [];
    units[s.unitCode].push(s);
  });

  const badgeMap = {
    compliant:"badge-compliant", active:"badge-active", queued:"badge-queued",
    evaluated:"badge-evaluated", "not-started":"badge-not-started",
    flagged:"badge-flagged", unknown:"badge-unknown"
  };

  Object.keys(units).sort().forEach(unit => {
    const u = data.unitSummary[unit] || {};
    html += \`<div class="unit-section">
      <div class="unit-header">\${esc(unit) || "Unassigned unit"} <span style="font-weight:400;margin-left:8px;">\${u.total||0} students · \${u.compliant||0} submitted · \${u.pending||0} in progress\${u.flagged ? ' · <span style="color:#d93025">'+u.flagged+' flagged</span>' : ''}</span></div>\`;
    units[unit].forEach(s => {
      html += \`<div class="student-row \${s.statusClass}">
        <div>
          <div class="student-name">\${esc(s.name)}</div>
          <div class="student-meta">\${[s.block && "Block "+esc(s.block), s.period && "Period "+esc(s.period), esc(s.subject)].filter(Boolean).join(" · ") || "No class info on file"}</div>
          <div class="last-eval">Last evaluation: \${esc(s.lastEval)}</div>
          \${s.submittedAt && s.submittedAt !== "—" ? \`<div class="last-eval">Submitted: \${esc(s.submittedAt)}</div>\` : ""}
          \${s.docUrl
            ? \`<a class="doc-link" href="\${s.docUrl}" target="_blank">Open document ↗</a>\`
            : '<span style="color:#80868b;font-size:13px;">Document not yet available</span>'
          }
        </div>
        <div><div class="status-badge \${badgeMap[s.statusClass]||'badge-unknown'}">\${esc(s.status)}</div></div>
      </div>\`;
    });
    html += "</div>";
  });

  main.innerHTML = html;
  document.getElementById("loading").style.display = "none";
  main.style.display = "block";
  main.scrollTop = _scrollTop;
  document.getElementById("footer").textContent = "Last refreshed: " + data.generatedAt;

  // ── M2: Render warm-up readiness panel ───────────────────────────────────
  renderWarmUpReadiness(data.warmUpReadiness || null);

  // "+ New Lesson" opens a form that posts to submitLessonContext(), which
  // is entirely a Module 2 feature — previously always rendered, so a
  // teacher without M2 enabled could fill out the whole form and only find
  // out it doesn't work from an internal "Module 2 is not enabled" error
  // at submit time.
  const newLessonBtn = document.getElementById("new-lesson-btn");
  if (newLessonBtn) newLessonBtn.style.display = data.m2Enabled ? "" : "none";

  const sel = document.getElementById("term-filter");
  const currentOptions = [...sel.options].map(o => o.value);
  (data.availableTerms || []).forEach(t => {
    if (!currentOptions.includes(t)) {
      const opt = document.createElement("option");
      opt.value = t; opt.textContent = t;
      sel.appendChild(opt);
    }
  });
  if (data.activeTerm && data.activeTerm !== "ALL") sel.value = data.activeTerm;
}

function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── M2: MODAL ───────────────────────────────────────────────────────────────

let competenciesLoaded = false;
let activeCourseTab    = null; // tracks which course tab is currently visible
let _modalReturnFocus  = null; // element to restore focus to when the modal closes
let _pendingDiscardConfirm = null; // callback to run if the discard-confirm dialog is accepted

function _modalFocusableEls() {
  const modal = document.querySelector(".modal");
  if (!modal) return [];
  return Array.from(modal.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}

function _modalTrapKeydown(e) {
  if (e.key !== "Tab") return;
  const focusable = _modalFocusableEls();
  if (!focusable.length) return;
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Remembers the period/class from the last logged lesson (a teacher logging
// several lessons in a row for the same class shouldn't have to retype it
// every time), and keeps a debounced draft of the open form so an accidental
// refresh or tab close doesn't lose a typed-out objective/activity.
let lastUsedPeriod = _safeSessionGet_("casLastPeriod") || "";
const LESSON_DRAFT_KEY = "casLessonDraft";

function _safeSessionGet_(key) {
  try { return sessionStorage.getItem(key); } catch (e) { return null; }
}
function _safeSessionSet_(key, val) {
  try { sessionStorage.setItem(key, val); } catch (e) {}
}
function _safeSessionRemove_(key) {
  try { sessionStorage.removeItem(key); } catch (e) {}
}

function saveLessonDraft() {
  const get = id => { const el = document.getElementById(id); return el ? el.value : ""; };
  const draft = {
    date: get("f-date"), period: get("f-period"), objective: get("f-objective"),
    activity: get("f-activity"), prior: get("f-prior"), vocab: get("f-vocab"),
  };
  _safeSessionSet_(LESSON_DRAFT_KEY, JSON.stringify(draft));
}

let _lessonDraftTimer = null;
function scheduleLessonDraftSave() {
  clearTimeout(_lessonDraftTimer);
  _lessonDraftTimer = setTimeout(saveLessonDraft, 500);
}

function restoreLessonDraft() {
  const empty = { restored: false, stale: false, draftDate: null };
  const raw = _safeSessionGet_(LESSON_DRAFT_KEY);
  if (!raw) return empty;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return empty; }
  const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  // sessionStorage drafts survive for the life of the tab, not just until
  // the next reopen the same day. Restoring a stale date here would
  // silently backdate today's log (e.g. a Monday draft resumed on Tuesday)
  // with no indication it happened — openModal() already set f-date to
  // today before calling this, so only restore the draft's date when it
  // actually still matches today.
  const dateEl = document.getElementById("f-date");
  const dateMatches = !!(d.date && dateEl && d.date === dateEl.value);
  if (dateMatches) set("f-date", d.date);
  set("f-period", d.period); set("f-objective", d.objective);
  set("f-activity", d.activity); set("f-prior", d.prior); set("f-vocab", d.vocab);
  const restored = !!(d.objective || d.activity || d.prior || d.vocab);
  // The date field was already guarded against staleness, but the text
  // fields weren't — a draft from a previous day silently repopulated the
  // form with zero indication it wasn't what was just typed. Surface it
  // instead so the teacher can tell "restored" from "carried over."
  return { restored, stale: restored && !dateMatches, draftDate: d.date || null };
}

function clearLessonDraft() { _safeSessionRemove_(LESSON_DRAFT_KEY); }

function openModal() {
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth()+1).padStart(2,"0");
  const dd    = String(today.getDate()).padStart(2,"0");
  document.getElementById("f-date").value = yyyy+"-"+mm+"-"+dd;
  if (lastUsedPeriod) document.getElementById("f-period").value = lastUsedPeriod;

  // A restored draft (real, unsaved typing) takes priority over the date/
  // period defaults just set above — restoreLessonDraft() only overwrites
  // fields it actually has a saved value for.
  const draftResult = restoreLessonDraft();
  const staleHint = document.getElementById("draft-stale-hint");
  if (staleHint) {
    if (draftResult.stale) {
      staleHint.textContent = "Restored unsaved text from " + (draftResult.draftDate || "an earlier session") + " — review before logging, or clear the fields to start fresh.";
      staleHint.style.display = "block";
    } else {
      staleHint.style.display = "none";
    }
  }

  document.getElementById("form-error").style.display = "none";
  _modalReturnFocus = document.activeElement;
  document.getElementById("modal-backdrop").classList.add("open");
  document.getElementById("f-objective").focus();
  document.addEventListener("keydown", _modalTrapKeydown);

  if (!competenciesLoaded) loadCompetencies();
}

function _hasUnsavedLessonForm() {
  const filled = ["f-period","f-objective","f-activity","f-prior","f-vocab"].some(id => {
    const el = document.getElementById(id);
    return el && el.value.trim();
  });
  const checked = document.querySelectorAll('.course-panel input[type="checkbox"]:checked').length > 0;
  return filled || checked;
}

function closeModal(skipConfirm) {
  // A backdrop click or Escape used to discard a fully-filled-in, multi-
  // field lesson log with no warning. skipConfirm is passed true only
  // from the post-submit-success path, where the form's own data has
  // already been saved and clearing it here is expected, not a loss.
  // Uses the in-app discard-confirm dialog instead of a native confirm() —
  // matches the rest of the app's modal styling and doesn't block the tab
  // with browser chrome.
  if (!skipConfirm && _hasUnsavedLessonForm()) {
    _showDiscardConfirm(_reallyCloseModal);
    return;
  }
  _reallyCloseModal();
}

function _reallyCloseModal() {
  document.getElementById("modal-backdrop").classList.remove("open");
  document.removeEventListener("keydown", _modalTrapKeydown);
  if (_modalReturnFocus && typeof _modalReturnFocus.focus === "function") _modalReturnFocus.focus();
  _modalReturnFocus = null;
  clearForm();
}

function _showDiscardConfirm(onConfirm) {
  _pendingDiscardConfirm = onConfirm;
  document.getElementById("discard-confirm-backdrop").classList.add("open");
  document.getElementById("discard-cancel-btn").focus();
}

function _cancelDiscardConfirm() {
  _pendingDiscardConfirm = null;
  document.getElementById("discard-confirm-backdrop").classList.remove("open");
}

function _confirmDiscard() {
  const fn = _pendingDiscardConfirm;
  _pendingDiscardConfirm = null;
  document.getElementById("discard-confirm-backdrop").classList.remove("open");
  if (fn) fn();
}

function handleBackdropClick(e) {
  if (e.target === document.getElementById("modal-backdrop")) closeModal();
}

function clearForm() {
  ["f-date","f-period","f-objective","f-activity","f-prior","f-vocab"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  clearLessonDraft();
  // Uncheck all competencies across all course panels
  document.querySelectorAll('.course-panel input[type="checkbox"]')
    .forEach(cb => cb.checked = false);
  updateAllTabBadges();
  document.getElementById("form-error").style.display = "none";
  updateSubmitBtn();
}

// ── loadCompetencies ──────────────────────────────────────────────────────
// Calls server, receives { courses: [{ code, name, competencies: [...] }] },
// renders a tab bar + scrollable panel per course.
// Competencies within each course are already sorted by taskNum server-side.
function loadCompetencies() {
  document.getElementById("comp-loading").style.display = "block";

  google.script.run
    .withSuccessHandler(function(result) {
      document.getElementById("comp-loading").style.display = "none";

      if (result.error) {
        document.getElementById("competency-tabs-shell").innerHTML =
          '<div class="competency-empty">' + esc(result.error) + '</div>';
        return;
      }

      const courses = result.courses || [];
      if (courses.length === 0) {
        document.getElementById("competency-tabs-shell").innerHTML =
          '<div class="competency-empty">No competencies found. Check the CompetencyRegistry tab.</div>';
        return;
      }

      // ── Build tab bar ──
      // role="tablist"/"tab"/"tabpanel" + aria-selected/aria-controls below:
      // these were plain buttons with only a CSS .active class — functional
      // for mouse/keyboard Tab-through, but a screen reader had no way to
      // know this was a tabbed interface or which tab was selected.
      let tabBarHtml = '<div class="course-tabs" id="course-tab-bar" role="tablist">';
      courses.forEach((course, idx) => {
        const isFirst = idx === 0;
        tabBarHtml += \`<button
          class="course-tab\${isFirst ? " active" : ""}"
          id="tab-\${esc(course.code)}"
          role="tab"
          aria-selected="\${isFirst ? "true" : "false"}"
          aria-controls="panel-\${esc(course.code)}"
          onclick="switchCourseTab('\${esc(course.code)}')"
          onkeydown="courseTabKeydown(event,'\${esc(course.code)}')"
          title="\${esc(course.name)}"
        >
          \${esc(course.code)}
          <span class="tab-badge" id="badge-\${esc(course.code)}">0</span>
        </button>\`;
      });
      tabBarHtml += '</div>';

      // ── Build one panel per course ──
      let panelsHtml = "";
      courses.forEach((course, idx) => {
        const isFirst = idx === 0;
        panelsHtml += \`<div class="course-panel\${isFirst ? " active" : ""}"
          id="panel-\${esc(course.code)}" role="tabpanel" aria-labelledby="tab-\${esc(course.code)}"\>\`;

        // Group competencies by strand — preserve taskNum order within strand
        const strands = {};
        const strandOrder = [];
        course.competencies.forEach(c => {
          const s = c.strand || "General";
          if (!strands[s]) { strands[s] = []; strandOrder.push(s); }
          strands[s].push(c);
        });

        panelsHtml += '<div class="comp-container">';
        strandOrder.forEach(strand => {
          panelsHtml += \`<div class="strand-group">
            <div class="strand-label">\${esc(strand)}</div>\`;
          strands[strand].forEach(c => {
            panelsHtml += \`<label class="competency-item">
              <input type="checkbox"
                value="\${esc(c.id)}"
                data-course="\${esc(course.code)}"
                data-comp-id="\${esc(c.id)}"
                onchange="onCompetencyChange('\${esc(course.code)}')">
              <span class="c-num">\${esc(String(c.taskNum))}</span>
              <span class="c-text">
                \${esc(c.text)}
                <span class="c-scaffold" id="scaffold-\${esc(c.id)}"></span>
              </span>
            </label>\`;
            // ── M3 hook: scaffold-{id} span populated by
            //    getStudentScaffoldingData() when profiles exist ──
          });
          panelsHtml += '</div>';
        });
        panelsHtml += '</div>'; // .comp-container

        panelsHtml += '</div>'; // .course-panel
      });

      // Inject into shell (replace loading indicator)
      document.getElementById("competency-tabs-shell").innerHTML =
        tabBarHtml + panelsHtml;

      // Set active tab state
      activeCourseTab = courses[0].code;

      // Hint line
      document.getElementById("comp-hint").textContent =
        courses.map(c => c.code + " — " + c.name).join("  ·  ");

      competenciesLoaded = true;
      updateSubmitBtn();
    })
    .withFailureHandler(function(e) {
      document.getElementById("comp-loading").style.display = "none";
      document.getElementById("competency-tabs-shell").innerHTML =
        '<div class="competency-empty">Something went wrong loading competencies. ' +
        '<button onclick="this.disabled=true;loadCompetencies()" style="margin-left:8px;padding:6px 14px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-size:13px;cursor:pointer;">Try Again</button></div>';
    })
    .getCompetencies();
}

// ── switchCourseTab ───────────────────────────────────────────────────────
function switchCourseTab(code) {
  // Deactivate all tabs and panels
  document.querySelectorAll(".course-tab").forEach(t => { t.classList.remove("active"); t.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".course-panel").forEach(p => p.classList.remove("active"));

  // Activate selected
  const tab   = document.getElementById("tab-"   + code);
  const panel = document.getElementById("panel-" + code);
  if (tab)   { tab.classList.add("active"); tab.setAttribute("aria-selected", "true"); }
  if (panel) panel.classList.add("active");

  activeCourseTab = code;
}

// Standard tabs pattern: Left/Right (or Home/End) move both focus and
// selection between tabs, matching what a screen reader user expects once
// role="tab" is present — without this, arrow keys did nothing here.
function courseTabKeydown(e, code) {
  if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
  e.preventDefault();
  const tabs = Array.from(document.querySelectorAll(".course-tab"));
  const i = tabs.findIndex(t => t.id === "tab-" + code);
  if (i === -1) return;
  let next;
  if (e.key === "Home") next = 0;
  else if (e.key === "End") next = tabs.length - 1;
  else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
  else next = (i + 1) % tabs.length;
  const nextCode = tabs[next].id.replace(/^tab-/, "");
  switchCourseTab(nextCode);
  tabs[next].focus();
}

// ── onCompetencyChange ────────────────────────────────────────────────────
// Fires on every checkbox change. Updates the badge for the affected course
// and re-evaluates the submit button gate.
function onCompetencyChange(courseCode) {
  updateTabBadge(courseCode);
  updateSubmitBtn();
}

// ── updateTabBadge ────────────────────────────────────────────────────────
function updateTabBadge(courseCode) {
  const panel = document.getElementById("panel-" + courseCode);
  if (!panel) return;
  const count  = panel.querySelectorAll('input[type="checkbox"]:checked').length;
  const badge  = document.getElementById("badge-" + courseCode);
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle("has-checks", count > 0);
}

// ── updateAllTabBadges ────────────────────────────────────────────────────
function updateAllTabBadges() {
  document.querySelectorAll(".course-panel").forEach(panel => {
    const code = panel.id.replace("panel-", "");
    updateTabBadge(code);
  });
}

// ── updateSubmitBtn ───────────────────────────────────────────────────────
function updateSubmitBtn() {
  const hasDate      = !!document.getElementById("f-date").value;
  const hasObjective = !!document.getElementById("f-objective").value.trim();
  const hasActivity  = !!document.getElementById("f-activity").value.trim();
  // Collect checked boxes across ALL course panels
  const hasComp = document.querySelectorAll(
    '.course-panel input[type="checkbox"]:checked'
  ).length > 0;
  document.getElementById("submit-btn").disabled =
    !(hasDate && hasObjective && hasActivity && hasComp);
}

// Wire up live validation for required text fields
document.addEventListener("DOMContentLoaded", function() {
  ["f-objective","f-activity"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", updateSubmitBtn);
  });
  document.getElementById("f-date").addEventListener("change", updateSubmitBtn);

  // Debounced draft persistence — see saveLessonDraft()/restoreLessonDraft()
  ["f-date","f-period","f-objective","f-activity","f-prior","f-vocab"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", scheduleLessonDraftSave);
  });
});

// ── submitLesson ──────────────────────────────────────────────────────────
function submitLesson() {
  const btn = document.getElementById("submit-btn");
  btn.disabled    = true;
  btn.textContent = "Logging…";
  hideFormError();

  // Collect checked competency IDs across ALL course panels
  const checkedBoxes  = document.querySelectorAll(
    '.course-panel input[type="checkbox"]:checked'
  );
  const competencyIds = [...checkedBoxes].map(cb => cb.value).join(",");

  const payload = {
    lessonDate:            document.getElementById("f-date").value,
    periodOrClass:         document.getElementById("f-period").value.trim(),
    learningObjective:     document.getElementById("f-objective").value.trim(),
    activityDescription:   document.getElementById("f-activity").value.trim(),
    priorLessonConnection: document.getElementById("f-prior").value.trim(),
    keyVocabulary:         document.getElementById("f-vocab").value.trim(),
    competencyIds:         competencyIds
  };

  google.script.run
    .withSuccessHandler(function(result) {
      btn.textContent = "Log lesson";

      if (!result.success) {
        showFormError(result.error || "Submission failed. Please try again.");
        btn.disabled = false;
        return;
      }

      lastUsedPeriod = payload.periodOrClass;
      _safeSessionSet_("casLastPeriod", lastUsedPeriod);
      closeModal(true); // already saved — nothing to confirm discarding
      showToast("Lesson logged. Alignment will be recorded automatically.");

      // ── S27 hook: open Lesson Frame doc when Script 27 exists ──
      if (result.frameDocUrl) {
        // Popup blockers silently swallow this in most browsers rather than
        // erroring — window.open returns null/undefined when that happens,
        // so fall back to a dismissible link instead of losing the doc.
        const opened = window.open(result.frameDocUrl, "_blank");
        if (!opened) {
          _showFrameLinkFallback(result.frameDocUrl);
        }
      }
    })
    .withFailureHandler(function(e) {
      btn.textContent = "Log lesson";
      btn.disabled    = false;
      showFormError("Something went wrong submitting this lesson. Your entries are still filled in above — try again.");
    })
    .submitLessonContext(payload);
}

function showFormError(msg) {
  const el = document.getElementById("form-error");
  el.textContent    = msg;
  el.style.display  = "block";
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hideFormError() {
  document.getElementById("form-error").style.display = "none";
}

let _toastTimer = null;
function showToast(msg, isError) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = "toast" + (isError ? " error" : "");
  t.classList.add("show");
  // Without clearing the prior timer, a second toast within 4s of the
  // first (easy to hit — the modal auto-closes on save, so logging two
  // lessons back to back is a normal flow) got hidden early by the first
  // call's own timeout instead of showing its own full duration.
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 4000);
}

// Sits above the toast (which auto-dismisses at 4s) and stays until the
// teacher dismisses it — the whole point is giving them time to notice a
// silently-blocked popup and still get to the doc it was trying to open.
function _showFrameLinkFallback(url) {
  let el = document.getElementById("frame-link-fallback");
  if (!el) {
    el = document.createElement("div");
    el.id = "frame-link-fallback";
    el.style.cssText = "position:fixed;bottom:84px;left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:401;display:flex;align-items:center;gap:12px;box-shadow:0 4px 16px rgba(0,0,0,0.25)";
    document.body.appendChild(el);
  }
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = "Pop-up blocked —";
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "open the Lesson Frame doc";
  link.style.cssText = "color:#8ab4f8;font-weight:600;text-decoration:underline";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.style.cssText = "background:none;border:none;color:#fff;opacity:.7;cursor:pointer;font-size:14px;padding:0 2px";
  closeBtn.onclick = function() { el.remove(); };
  el.appendChild(span);
  el.appendChild(link);
  el.appendChild(closeBtn);
}

// Escape key closes modal (only when it's actually open) — checked first
// against the discard-confirm dialog, since it can be showing on top of the
// lesson modal and should back out of just itself, not re-trigger closeModal().
document.addEventListener("keydown", function(e) {
  if (e.key !== "Escape") return;
  if (document.getElementById("discard-confirm-backdrop").classList.contains("open")) {
    _cancelDiscardConfirm();
  } else if (document.getElementById("modal-backdrop").classList.contains("open")) {
    closeModal();
  }
});

loadData();
</script>
</body>
</html>`;
}
