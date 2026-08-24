// =============================================================================
// FILE: 13_StudentDashboard.js
// STANDALONE APPS SCRIPT PROJECT — deployed as Web App
// PURPOSE: Student-facing dashboard. Authenticated by Google account (any domain).
//          Shows only the active student's own assignments, grouped by
//          [Block - Class - Teacher] folder label.
// DEPLOY: Execute as: User accessing the web app · Access: Anyone with Google account
// =============================================================================

function doGet() {
  return HtmlService
    .createHtmlOutput(buildStudentDashboardHtml_())
    .setTitle("My Assignments")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ---------------------------------------------------------------------------
// getStudentDashboardData — called client-side via google.script.run
// ---------------------------------------------------------------------------
function getStudentDashboardData(termFilter) {
  const googleId = Session.getActiveUser().getEmail();

  if (!googleId) {
    return {
      error: "Could not identify your Google account.\n" +
             "Make sure you are signed into Google and try again."
    };
  }

  const cfg        = getConfig_();
  const activeTerm = termFilter ||
    PropertiesService.getScriptProperties().getProperty("CURRENT_TERM") || "ALL";
  const ss    = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();

  // Same staging-pipeline lookup the teacher dashboard already uses —
  // without it, a student whose work is actively mid-evaluation looked
  // identical to one who hadn't entered the queue at all ("Queued for
  // evaluation…" the whole time), even though the teacher's own dashboard
  // already shows that difference live.
  const staging        = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const stagingData    = staging ? staging.getDataRange().getValues() : [];
  const pipelineStatus = {};
  const stagingHeaders = stagingData[0] ? stagingData[0].map(h => String(h).trim()) : [];
  const spFileIdx      = stagingHeaders.indexOf("StudentFileID");
  const spStatusIdx    = stagingHeaders.indexOf("Status");
  for (let i = 1; i < stagingData.length; i++) {
    const fid = spFileIdx   !== -1 ? String(stagingData[i][spFileIdx]).trim()   : "";
    const st  = spStatusIdx !== -1 ? String(stagingData[i][spStatusIdx]).trim() : "";
    if (fid) pipelineStatus[fid] = st;
  }

  const assignments    = [];
  const availableTerms = new Set();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[LEDGER.GOOGLE_ID]).toLowerCase() !== googleId.toLowerCase()) continue;

    // Collect all terms for this student regardless of filter
    const rowTerm = String(row[LEDGER.ACADEMIC_YEAR] || "").trim();
    if (rowTerm) availableTerms.add(rowTerm);

    // Skip ARCHIVED rows
    const rowStatus = String(row[LEDGER.STATUS]).trim();
    if (rowStatus === "ARCHIVED") {
      // Still count the term for dropdown, just don't show in assignments
      continue;
    }

    // Apply term filter
    if (activeTerm !== "ALL" && rowTerm && rowTerm !== activeTerm) continue;

    const fileId      = String(row[LEDGER.FILE_ID]).trim();
    const status      = String(row[LEDGER.STATUS]).trim();
    const lastEval    = row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : null;
    const submittedAt = row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : null;

    // NEW (Say/Do Ledger cas-ccps finding #7): a student previously had no
    // way to see what's actually on file for them (name, class, period,
    // teacher) or to know a registration just happened at all — the only
    // notice was a one-time email, easy to miss. registeredAt/isNew feed
    // an in-app "just registered" notice; studentName feeds the persistent
    // "My Info" view below.
    const registeredAtRaw = row[LEDGER.TIMESTAMP] || null;
    const isNewRegistration = registeredAtRaw
      ? (Date.now() - new Date(registeredAtRaw).getTime()) < (3 * 24 * 60 * 60 * 1000)
      : false;

    assignments.push({
      configId:      String(row[LEDGER.CONFIG_ID]).trim(),
      studentName:   String(row[LEDGER.STUDENT_NAME]).trim(),
      // Same fallback wording as the teacher dashboard's identical gap
      // (blank column 10) — a teacher and student comparing notes about a
      // "missing unit" record should recognize it as the same thing.
      unitName:      String(row[LEDGER.COURSE_NAME]).trim() || "Unassigned unit",
      block:         String(row[LEDGER.BLOCK]).trim(),
      className:     String(row[LEDGER.CLASS_NAME]).trim(),
      teacherName:   String(row[LEDGER.TEACHER_NAME]).trim(),
      teacherEmail:  String(row[LEDGER.TEACHER_EMAIL] || "").trim(),
      period:        String(row[LEDGER.PERIOD]).trim(),
      subject:       String(row[LEDGER.SUBJECT]).trim(),
      term:          rowTerm,
      registeredAt:      registeredAtRaw ? formatDate_(registeredAtRaw) : null,
      isNewRegistration: isNewRegistration,
      status:        status,
      displayStatus: resolveStudentStatus_(status, pipelineStatus[fileId]),
      statusClass:   resolveStudentClass_(status, pipelineStatus[fileId]),
      lastEval:      lastEval     || "No evaluations yet",
      submittedAt:   submittedAt  || null,
      docUrl:        fileId
        ? "https://docs.google.com/document/d/" + fileId + "/edit"
        : null,
      folderLabel:   String(row[LEDGER.BLOCK]).trim() + " - " +
                     String(row[LEDGER.CLASS_NAME]).trim() + " - " +
                     String(row[LEDGER.TEACHER_NAME]).trim()
    });
  }

  // Sort: ISSUE first (a student needs to see "talk to your teacher" before
  // anything else, including already-finished work), then needs-action,
  // then by block order, then by class.
  // Block sort order — uses system default, gracefully handles unknown values
  // Admins can customize this via the BLOCK_ORDER Script Property
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  const priority   = { "ISSUE": 0, "NEEDS_ACTION": 1, "IN_PROGRESS": 2,
                        "NOT_STARTED": 3, "DONE": 4 };

  assignments.sort((a, b) => {
    const pa = priority[a.statusClass] ?? 5;
    const pb = priority[b.statusClass] ?? 5;
    if (pa !== pb) return pa - pb;
    const ia = blockOrder.indexOf(a.block);
    const ib = blockOrder.indexOf(b.block);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.className.localeCompare(b.className);
  });

  // Empty state with helpful context. "No results" from picking a term
  // with nothing in it is a completely different situation from "not
  // registered at all" — the account-troubleshooting copy below used to
  // show for both, actively misleading the moment term filtering is used
  // for anything other than "All Terms."
  if (assignments.length === 0) {
    const filteredByTerm = activeTerm !== "ALL" && availableTerms.size > 0;
    return {
      googleId:    googleId,
      assignments: [],
      emptyReason: filteredByTerm
        ? "No assignments for " + activeTerm + ".\n\nTry \"All Terms\" to see records from other terms."
        : "No assignments found for " + googleId + ".\n\n" +
          "If you expect to see assignments here:\n" +
          "• Make sure you are signed in with the correct Google account\n" +
          "• Check with your teacher that they have registered you\n" +
          "• Wait a few minutes if you were just registered",
      activeTerm:     activeTerm,
      availableTerms: [...availableTerms].sort().reverse(),
      generatedAt: formatDate_(new Date())
    };
  }

  return {
    googleId:       googleId,
    assignments:    assignments,
    activeTerm:     activeTerm,
    availableTerms: [...availableTerms].sort().reverse(),
    generatedAt:    formatDate_(new Date())
  };
}

function resolveStudentStatus_(status, pipeline) {
  // Wording here deliberately echoes the teacher dashboard's status labels
  // (Queued/Evaluating/Evaluated/Compliant/Flagged) so the same underlying
  // pipeline stage reads as the same word on both sides of a conversation —
  // a student saying "it's flagged" should mean the same thing a teacher
  // sees as FLAGGED, not require translation.
  // `pipeline` (from StagingPipeline, same lookup the teacher dashboard
  // uses) distinguishes actively-processing from merely-queued — without
  // it a student's work looked "Queued for evaluation…" the entire time
  // it was in the pipeline, even while the teacher's own dashboard already
  // showed EVALUATING NOW.
  if (pipeline === "IN_PROCESS") return "Evaluating now…";
  switch (status) {
    case "ACTIVE":              return "Not started yet";
    case "PENDING": case "STAGED": return "Queued for evaluation…";
    case "COMPLETE":            return "Evaluated — feedback ready, check your document";
    case "COMPLIANT":           return "Submitted — compliant ✓";
    default:
      // Never show a raw Ledger status string to a student — a blank cell
      // or an unrecognized/future status code both land here. ERROR-
      // prefixed statuses are real pipeline failures; anything else is
      // just unexpected/blank data, worded distinctly so a teacher can
      // tell the two apart when a student reports it.
      // FIXED: the teacher side keeps its ⚠ icon on FLAGGED (the one status
      // that most needs an attention-grabber); this dropped it.
      return status.startsWith("ERROR")
        ? "Flagged ⚠ — see your teacher"
        : "Status unavailable — check with your teacher";
  }
}

function resolveStudentClass_(status, pipeline) {
  // Evaluating-now shares IN_PROGRESS's visual bucket (same pill/border
  // color) — the distinction is carried by displayStatus's text, not a
  // separate color, since it's still fundamentally "in progress" to a
  // student with no action to take.
  if (pipeline === "IN_PROCESS") return "IN_PROGRESS";
  switch (status) {
    case "ACTIVE":              return "NOT_STARTED";
    case "PENDING": case "STAGED": return "IN_PROGRESS";
    case "COMPLETE":            return "NEEDS_ACTION";
    case "COMPLIANT":           return "DONE";
    default:                    return "ISSUE";
  }
}

function formatDate_(d) {
  try {
    if (!(d instanceof Date)) d = new Date(d);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d, yyyy h:mm a");
  } catch (e) { return String(d); }
}

// ---------------------------------------------------------------------------
// buildStudentDashboardHtml_
// ---------------------------------------------------------------------------
function buildStudentDashboardHtml_() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Assignments</title>
<style>
  /* FIXED (Say/Do Ledger cas-ccps finding #14): #80868b (used for
     secondary/meta text) is ~3.68:1 against white — below WCAG AA's
     4.5:1 minimum for normal text. #5f6368 (already used elsewhere in
     this file for the identical "muted meta text" role) is ~6.05:1 —
     verified passing — so both are consolidated into this one token,
     matching the same fix in 07_TeacherDashboard.js. */
  :root{--text-secondary:#5f6368}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Google Sans",Roboto,Arial,sans-serif;background:#f8f9fa;color:#202124;font-size:15px;min-height:100vh}
  header{background:linear-gradient(135deg,#1e8e3e,#137333);color:white;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  header h1{font-size:19px;font-weight:500}
  #account-label{font-size:12px;opacity:.85;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .refresh-btn{background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);color:white;border-radius:4px;padding:5px 10px;font-size:12px;cursor:pointer}
  .refresh-btn:hover{background:rgba(255,255,255,0.25)}
  @media (max-width:480px){
    header{padding:14px 16px}
    header h1{font-size:17px}
    .main{padding:16px}
    .card{padding:14px 16px}
  }
  #loading{text-align:center;padding:80px 24px;color:var(--text-secondary)}
  /* FIXED: was 40px vs the teacher dashboard's 36px — same border weight,
     same animation, same purpose, just a needless 4px drift between the
     two "app shells." Border color intentionally stays green (this
     dashboard's own accent) vs the teacher side's blue. */
  .spinner{width:36px;height:36px;border:3px solid #e8eaed;border-top-color:#1e8e3e;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .main{padding:24px;max-width:700px;margin:0 auto}
  /* NEW (finding #7): "just registered" notice + My Info panel */
  .new-reg-notice{background:#e6f4ea;border:1px solid #b7e1c4;color:#0d652d;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;line-height:1.5}
  .new-reg-notice strong{font-weight:600}
  .info-card{background:white;border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:5px solid #1a73e8}
  .info-card .info-row{font-size:13.5px;color:#3c4043;margin-bottom:4px}
  .info-card .info-row b{color:#202124;font-weight:600}
  .info-card .correction-link{display:inline-block;margin-top:8px;font-size:12.5px;color:#1a73e8;text-decoration:none;font-weight:500}
  .info-card .correction-link:hover{text-decoration:underline}
  .group-header{font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-secondary);padding:4px 0 10px;border-bottom:2px solid #e8eaed;margin:28px 0 14px}
  .group-header:first-child{margin-top:0}
  .card{background:white;border-radius:12px;padding:18px 20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:5px solid #dadce0;transition:box-shadow .15s,transform .1s}
  .card:hover{box-shadow:0 3px 10px rgba(0,0,0,.15);transform:translateY(-1px)}
  /* Colors match the teacher dashboard's equivalent statusClass exactly
     (not-started/compliant/flagged already coincided; queued and evaluated
     were swapped here, so "orange" meant two different pipeline stages
     depending on which dashboard you were looking at). */
  .card.NOT_STARTED{border-left-color:#dadce0}
  .card.IN_PROGRESS{border-left-color:#e37400}
  .card.NEEDS_ACTION{border-left-color:#9334e6}
  .card.DONE{border-left-color:#1e8e3e}
  .card.ISSUE{border-left-color:#d93025}
  .card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
  .unit-name{font-size:16px;font-weight:600}
  /* FIXED: matches 07_TeacherDashboard.js's .status-badge geometry exactly
     (font-size/padding/border-radius) — this renders the identical
     "current status" chip concept, but used to be a fully-rounded pill at
     a different size, a visible seam between the two dashboards. */
  .pill{font-size:11px;font-weight:600;padding:4px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0}
  .pill-NOT_STARTED{background:#f1f3f4;color:var(--text-secondary)}
  .pill-IN_PROGRESS{background:#fef3e2;color:#9c5000}
  .pill-NEEDS_ACTION{background:#f3e8fd;color:#9334e6}
  .pill-DONE{background:#e6f4ea;color:#1e8e3e}
  .pill-ISSUE{background:#fce8e6;color:#d93025}
  .card-meta{font-size:13px;color:var(--text-secondary);margin-bottom:10px}
  .eval-line{font-size:12px;color:var(--text-secondary);margin-bottom:12px}
  .open-btn{display:inline-block;background:#1a73e8;color:white;text-decoration:none;padding:9px 20px;border-radius:6px;font-size:14px;font-weight:500;transition:background .15s}
  .open-btn:hover{background:#1557b0}
  .open-btn.done-btn{background:#1e8e3e}
  .open-btn.done-btn:hover{background:#137333}
  .submitted-note{font-size:12px;color:#1e8e3e;margin-top:8px;font-weight:500}
  .empty-state{text-align:center;padding:60px 24px;color:var(--text-secondary);white-space:pre-line}
  .empty-state .icon{font-size:48px;margin-bottom:16px}
  footer{text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);border-top:1px solid #e8eaed;margin-top:32px}
</style>
</head>
<body>
<header>
  <h1>📚 My Assignments</h1>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <label for="term-filter" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Filter by term</label>
    <select id="term-filter" onchange="loadData()" aria-label="Filter by term" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.15);color:white;font-size:12px;">
      <option value="ALL">All Terms</option>
    </select>
    <button id="my-info-btn" class="refresh-btn" onclick="toggleMyInfo()" aria-expanded="false" aria-controls="my-info-panel">ℹ️ My Info</button>
    <button id="refresh-btn" class="refresh-btn" onclick="loadData()" aria-label="Refresh assignments">↻ Refresh</button>
    <div id="account-label">Loading…</div>
  </div>
</header>
<div id="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading your assignments…</p></div>
<!-- NEW (finding #7): persistent "My Info" view — what's actually on file
     for this student (name, class, period, teacher), available any time
     via the header button, not just a one-time notice. -->
<div id="my-info-panel" class="main" style="display:none;padding-bottom:0"></div>
<!-- NEW (finding #7): in-app notice for a recent registration, replacing
     the easy-to-miss one-time email — visible for a few days after a new
     registration is recorded, then fades out on its own as it ages past
     the "recent" window computed server-side (isNewRegistration). -->
<div id="new-registration-banner" class="main" style="display:none;padding-bottom:0"></div>
<div id="main" class="main" style="display:none"></div>
<footer id="footer"></footer>
<script>
// Per-term client cache — switching the term filter back and forth used to
// refetch and rebuild the whole assignment list from scratch every time,
// even though the previous term's data was still sitting in memory. A cache
// hit renders instantly and still revalidates in the background, so stale
// data never lingers past the next successful fetch.
let _dashCache = {};
let _loadGen = 0;
let _isFirstLoad = true;
// NEW (finding #7): cached from the last successful render() so
// toggleMyInfo() can rebuild the panel without a fresh round-trip, and so
// a term-filter change doesn't need to re-derive "what's on file."
let _lastDashData = null;
let _myInfoOpen = false;

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
  const refreshBtn = document.getElementById("refresh-btn");
  // The generation counter already prevents a stale response from ever
  // rendering, so rapid re-clicks never glitch the UI — but they still fire
  // redundant concurrent Apps Script executions that are immediately
  // thrown away. Disabling for the duration of this call's own round-trip
  // avoids that waste.
  if (refreshBtn) refreshBtn.disabled = true;
  const sel     = document.getElementById("term-filter");
  const rawTerm = sel ? sel.value : "ALL";
  // The dropdown only ever has the hardcoded "All Terms" option until this
  // very first response fills in the real list, so the very first call
  // would otherwise send the literal string "ALL" — which is truthy, so
  // the server's termFilter-or-CURRENT_TERM-or-"ALL" fallback never
  // actually consulted the admin-configured CURRENT_TERM. Sending "" only
  // on this one automatic first call lets that fallback do its job; any
  // later call (refresh, or the student genuinely picking "All Terms")
  // still sends the real selected value.
  const term    = (_isFirstLoad && rawTerm === "ALL") ? "" : (rawTerm || "ALL");
  _isFirstLoad  = false;
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  const myGen   = ++_loadGen;
  const cached  = _dashCache[term];
  let shownSpinnerAt = 0;

  if (cached) {
    render(cached);
  } else {
    // Reset to the spinner state on every fresh (uncached) call — including
    // a retry after a failure — so the error screen never lingers behind it.
    loading.innerHTML = '<div class="spinner"></div><p>Loading your assignments…</p>';
    loading.style.display = "block";
    main.style.display = "none";
    shownSpinnerAt = Date.now();
  }

  google.script.run
    .withSuccessHandler(function(data) {
      if (myGen !== _loadGen) return; // a newer request already superseded this one
      // The first automatic call sends term === "" so the server's
      // CURRENT_TERM fallback resolves it, but render() below then syncs the
      // dropdown to that resolved data.activeTerm — so a manual Refresh right
      // after page load sends that resolved term, not "", and always missed
      // the cache stored under the "" key. Cache under the resolved
      // activeTerm instead so that first response is actually reusable.
      const cacheKey = (data && data.activeTerm) ? data.activeTerm : term;
      if (!data || !data.error) _dashCache[cacheKey] = data;
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() { render(data); if (refreshBtn) refreshBtn.disabled = false; });
    })
    .withFailureHandler(function(e) {
      if (myGen !== _loadGen) return;
      if (cached) { if (refreshBtn) refreshBtn.disabled = false; return; } // still showing valid (if slightly stale) cached data
      // Plain-language message for the student; the real e.message is
      // already logged server-side by whatever threw it, so it isn't
      // repeated here — a stack-trace fragment isn't actionable for them.
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() {
        loading.innerHTML =
          '<p style="color:#d93025;padding:24px 24px 8px;">⚠ Something went wrong loading your assignments. Try refreshing.</p>' +
          '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
        if (refreshBtn) refreshBtn.disabled = false;
      });
    })
    .getStudentDashboardData(term);
}

function render(data) {
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  // Any refresh (manual, term change, or a cache revalidation) rebuilds the
  // whole card list via innerHTML — preserve scroll position instead of
  // dumping the student back to the top of the list.
  const _scrollTop = main.scrollTop;

  if (data.error) {
    // This is an application-level error (e.g. identity not found) — a
    // separate path from the network-failure branch in loadData(), which
    // already gets both of these. Without them, the header's account
    // label stayed stuck on "Loading…" forever, and there was no way to
    // retry without a full page refresh.
    document.getElementById("account-label").textContent = "—";
    loading.innerHTML =
      '<p style="color:#d93025;padding:24px 24px 8px;">' + esc(data.error) + '</p>' +
      '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
    return;
  }

  document.getElementById("account-label").textContent = data.googleId || "";

  // NEW (finding #7): cache for toggleMyInfo(), then render the "just
  // registered" notice and (if already open) refresh the My Info panel.
  _lastDashData = data;
  renderNewRegistrationBanner(data);
  if (_myInfoOpen) renderMyInfo(data);

  if (!data.assignments || data.assignments.length === 0) {
    main.innerHTML = \`<div class="empty-state">
      <div class="icon">📋</div>
      <p>\${esc(data.emptyReason || "No assignments found.")}</p>
    </div>\`;
    loading.style.display = "none";
    main.style.display    = "block";
    _populateTermDropdown(data);
    return;
  }

  // Block sort order — uses system default, gracefully handles unknown values
  // Admins can customize this via the BLOCK_ORDER Script Property
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  const groups = {};
  data.assignments.forEach(a => {
    if (!groups[a.folderLabel]) groups[a.folderLabel] = [];
    groups[a.folderLabel].push(a);
  });

  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ba = a.split(" - ")[0], bb = b.split(" - ")[0];
    const ia = blockOrder.indexOf(ba), ib = blockOrder.indexOf(bb);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return a.localeCompare(b);
  });

  let html = "";
  sortedGroups.forEach(gk => {
    html += \`<div class="group-header">Block \${esc(gk)}</div>\`;
    groups[gk].forEach(a => {
      const isDone = a.statusClass === "DONE";
      html += \`<div class="card \${a.statusClass}">
        <div class="card-top">
          <div class="unit-name">\${esc(a.unitName)}</div>
          <div class="pill pill-\${a.statusClass}">\${esc(a.displayStatus)}</div>
        </div>
        <!-- FIXED: was a fixed "Period X · Subject" template — a blank
             period rendered as a dangling "Period  ·" (empty label, double
             space). Mirrors the teacher dashboard's conditional-join
             pattern (07_TeacherDashboard.js's student-meta line). -->
        <div class="card-meta">\${[a.period && "Period "+esc(a.period), esc(a.subject)].filter(Boolean).join(" &nbsp;·&nbsp; ") || "No class info on file"}</div>
        <div class="eval-line">Last evaluation: \${esc(a.lastEval)}</div>
        \${a.docUrl
          ? \`<a href="\${a.docUrl}" target="_blank" class="open-btn \${isDone?"done-btn":""}">Open My Document ↗</a>\`
          : '<span style="color:var(--text-secondary);font-size:13px;">Document not yet available</span>'
        }
        \${isDone && a.submittedAt
          ? \`<div class="submitted-note">Submitted \${esc(a.submittedAt)}</div>\`
          : ""
        }
        \${a.statusClass === "ISSUE" && a.teacherEmail
          ? \`<div style="margin-top:8px"><a href="mailto:\${esc(a.teacherEmail)}?subject=\${encodeURIComponent("Question about: " + a.unitName)}" style="font-size:13px;color:#1a73e8;text-decoration:none;font-weight:500">✉ Email \${esc(a.teacherName || "your teacher")}</a></div>\`
          : ""
        }
      </div>\`;
    });
  });

  main.innerHTML = html;
  loading.style.display = "none";
  main.style.display    = "block";
  main.scrollTop = _scrollTop;
  document.getElementById("footer").textContent =
    "Last refreshed: " + data.generatedAt + "  ·  " + data.googleId;

  _populateTermDropdown(data);
}

// NEW (finding #7): an immediate, in-app "just registered" notice —
// replacing the original easy-to-miss one-time email — for every
// registration flagged isNewRegistration by the server (within the last
// few days). Naturally stops showing once that window passes; no
// separate "seen it" state to track.
function renderNewRegistrationBanner(data) {
  const el = document.getElementById("new-registration-banner");
  const fresh = (data.assignments || []).filter(a => a.isNewRegistration);
  if (!fresh.length) { el.style.display = "none"; el.innerHTML = ""; return; }
  el.style.display = "block";
  el.innerHTML = fresh.map(a =>
    \`<div class="new-reg-notice">🎉 You were just registered for <strong>\${esc(a.className)}</strong> with <strong>\${esc(a.teacherName || "your teacher")}</strong>\${a.registeredAt ? " on " + esc(a.registeredAt) : ""}. Check <strong>My Info</strong> above to confirm what's on file.</div>\`
  ).join("");
}

// NEW (finding #7): a persistent "My Info" view — every registration on
// file for this student (name, class, period, teacher), with a way to
// flag a correction, available any time via the header button rather
// than only appearing once.
function toggleMyInfo() {
  _myInfoOpen = !_myInfoOpen;
  const btn   = document.getElementById("my-info-btn");
  const panel = document.getElementById("my-info-panel");
  btn.setAttribute("aria-expanded", String(_myInfoOpen));
  panel.style.display = _myInfoOpen ? "block" : "none";
  if (_myInfoOpen && _lastDashData) renderMyInfo(_lastDashData);
}

function renderMyInfo(data) {
  const panel = document.getElementById("my-info-panel");
  const regs  = data.assignments || [];
  if (!regs.length) {
    panel.innerHTML = '<div class="empty-state"><p>No registration on file yet.</p></div>';
    return;
  }
  panel.innerHTML =
    '<div class="group-header">My Info — What Is On File</div>' +
    regs.map(a => {
      const correctionSubject = encodeURIComponent("Correction request: my info on file");
      const correctionBody = encodeURIComponent(
        "Hi " + (a.teacherName || "") + ",\\n\\n" +
        "I'd like to flag something that may be incorrect in what's on file for me:\\n\\n" +
        "Name: " + a.studentName + "\\n" +
        "Class: " + a.className + "\\n" +
        "Period: " + (a.period || "(not on file)") + "\\n\\n" +
        "What should be corrected: \\n"
      );
      return \`<div class="info-card">
        <div class="info-row"><b>Name:</b> \${esc(a.studentName || "(not on file)")}</div>
        <div class="info-row"><b>Class:</b> \${esc(a.className)}</div>
        <div class="info-row"><b>Period:</b> \${esc(a.period || "(not on file)")}</div>
        <div class="info-row"><b>Teacher:</b> \${esc(a.teacherName || "(not on file)")}</div>
        \${a.teacherEmail
          ? \`<a class="correction-link" href="mailto:\${esc(a.teacherEmail)}?subject=\${correctionSubject}&body=\${correctionBody}">✉ Request a correction</a>\`
          : ""
        }
      </div>\`;
    }).join("");
}

// Was only ever called from the end of the full-render path, so the term
// dropdown never got populated with real options when a filtered view came
// back empty — factored out so both branches can call it.
function _populateTermDropdown(data) {
  const sel = document.getElementById("term-filter");
  if (sel && data.availableTerms) {
    const existing = [...sel.options].map(o => o.value);
    data.availableTerms.forEach(t => {
      if (!existing.includes(t)) {
        const opt = document.createElement("option");
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
      }
    });
    if (data.activeTerm && data.activeTerm !== "ALL") sel.value = data.activeTerm;
  }
}

${CLIENT_ESC_JS}

loadData();
</script>
</body>
</html>`;
}
