// =============================================================================
// FILE: 07_TeacherDashboard_M4_ADDENDUM.js
// PURPOSE: Additions to 07_TeacherDashboard.js for Module 4 — adds a
//          "Student Context" tab to the existing dashboard shell.
//          Paste these functions and markup into the existing Script 07
//          file. Do not replace the file — these are additive, same
//          pattern as the M2 modal additions.
//
// WHAT THIS ADDS:
//   - getMyStudentContext()       — server fn, student-facing (own data only)
//   - getStudentContextRoster()   — server fn, teacher-facing (full roster)
//   - "Student Context" nav tab in the dashboard header
//   - Two render paths in the client JS, gated by viewer identity
//
// ACCESS MODEL — this is the part that matters most:
//   The dashboard is deployed as "Execute as: Me" (the teacher), which
//   means every server function currently runs with the TEACHER's
//   permissions regardless of who opened the URL. That is correct for
//   the existing dashboard, which is teacher-only.
//
//   Module 4 introduces the first STUDENT-facing surface in this system.
//   Students opening the same dashboard URL must only ever see their own
//   data. This is enforced by reading Session.getActiveUser().getEmail()
//   — the email of the person who actually opened the page — and using
//   THAT to scope getMyStudentContext(), never the teacher's identity.
//
//   getStudentContextRoster() (the full-roster, teacher-only function) is
//   gated by comparing Session.getActiveUser().getEmail() against
//   cfg.teacherEmail. If they don't match, it returns an error rather
//   than data. A student who somehow calls the teacher-only function
//   gets nothing — never a partial or full roster.
//
//   This requires the web app deployment's "Who has access" setting to
//   allow both the teacher and students to open the URL (e.g. "Anyone
//   in [school domain]"), while "Execute as" remains "Me" so the script
//   can still read/write the Central Ledger which students do not have
//   direct access to.
// =============================================================================

// ── M4 ────────────────────────────────────────────────────────────────────
// getMyStudentContext — student-facing. Returns ONLY the calling user's
// own doc info. Identity is taken from the active session, never from a
// client-supplied parameter — a student cannot pass someone else's email
// and see their data.
// ── M4 ────────────────────────────────────────────────────────────────────
function getMyStudentContext() {
  const viewerEmail = Session.getActiveUser().getEmail();
  if (!viewerEmail) {
    return { error: "Could not determine your identity. Make sure you're signed in with your school account." };
  }

  const docInfo = getStudentDocForViewer_(viewerEmail); // from Script 29
  if (!docInfo) {
    return {
      hasContent: false,
      viewerEmail: viewerEmail,
      message: "No context recorded yet. This updates weekly — check back after your first graded assignment or warm-up response."
    };
  }

  return {
    hasContent: true,
    viewerEmail: viewerEmail,
    docUrl: docInfo.docUrl,
    lastUpdatedAt: docInfo.lastUpdatedAt ? formatDate_(docInfo.lastUpdatedAt) : "Not yet updated"
  };
}

// ── M4 ────────────────────────────────────────────────────────────────────
// getStudentContextRoster — teacher-facing. Returns the full student
// roster with doc links. Gated: only returns data if the active session's
// email matches cfg.teacherEmail. Anyone else gets an error, not a
// truncated or empty list — the distinction matters for debugging vs.
// security, and this is a security boundary.
// ── M4 ────────────────────────────────────────────────────────────────────
function getStudentContextRoster() {
  const cfg = getConfig_();
  const viewerEmail = Session.getActiveUser().getEmail();

  if (!viewerEmail || viewerEmail.toLowerCase() !== cfg.teacherEmail.toLowerCase()) {
    Logger.log("[M4] getStudentContextRoster denied — caller was " + (viewerEmail || "unknown") +
      ", expected " + cfg.teacherEmail);
    return { error: "This view is only available to the teacher." };
  }

  const roster = getAllStudentDocsForTeacher_(); // from Script 29
  return {
    roster: roster.map(r => ({
      name: r.name,
      email: r.email,
      docUrl: r.docUrl,
      lastUpdatedAt: r.lastUpdatedAt ? formatDate_(r.lastUpdatedAt) : "Never",
      hasRecentActivity: r.lastRunHadContent
    })),
    generatedAt: formatDate_(new Date())
  };
}

// =============================================================================
// HTML/CSS/JS additions — insert into buildDashboardHtml_()
// =============================================================================
//
// 1. Add a nav tab button to the <header>, alongside the existing
//    "New Lesson" / "Refresh" buttons:
//
//      <button id="context-tab-btn" onclick="showStudentContext()">My Context</button>
//
//    (Label reads "My Context" for students, but the SAME button and
//    function serve both audiences — the function below auto-detects
//    which view to render based on what the server returns.)
//
// 2. Add a container div near #main:
//
//      <div id="student-context-view" style="display:none"></div>
//
// 3. Add this client-side function:
/*
function showStudentContext() {
  document.getElementById("main").style.display = "none";
  document.getElementById("loading").style.display = "none";
  const view = document.getElementById("student-context-view");
  view.style.display = "block";
  view.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:#5f6368">Loading your context…</p>';

  // Try the teacher roster path first. If the server denies it (because
  // the caller isn't the teacher), fall back to the student's own view.
  // This lets ONE button serve both roles without the client needing to
  // know in advance who's looking at it.
  google.script.run
    .withSuccessHandler(function(result) {
      if (result.error) {
        // Not the teacher — render the student's own context instead.
        renderOwnContext();
        return;
      }
      renderTeacherRoster(result);
    })
    .withFailureHandler(function(e) {
      renderOwnContext();
    })
    .getStudentContextRoster();
}

function renderTeacherRoster(result) {
  const view = document.getElementById("student-context-view");
  let html = '<h2 style="font-size:16px;margin-bottom:12px;">Student Context — Full Roster</h2>';
  html += '<p style="font-size:12px;color:#5f6368;margin-bottom:16px;">Generated ' + esc(result.generatedAt) + ' · Updates weekly via time trigger, not live.</p>';
  if (result.roster.length === 0) {
    html += '<p style="color:#5f6368;">No student docs yet. They are created automatically the first week a student has a completed assignment or warm-up response.</p>';
  } else {
    result.roster.forEach(function(s) {
      const dotColor = s.hasRecentActivity ? '#1e8e3e' : '#dadce0';
      html += '<div style="background:white;border-radius:8px;padding:12px 16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 1px 2px rgba(0,0,0,0.08);">';
      html += '<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + dotColor + ';margin-right:8px;"></span>';
      html += '<strong>' + esc(s.name) + '</strong><div style="font-size:11px;color:#80868b;margin-left:16px;">' + esc(s.email) + ' · last updated ' + esc(s.lastUpdatedAt) + '</div></div>';
      html += '<a href="' + s.docUrl + '" target="_blank" style="font-size:12px;color:#1a73e8;text-decoration:none;">Open doc ↗</a>';
      html += '</div>';
    });
  }
  view.innerHTML = html;
}

function renderOwnContext() {
  google.script.run
    .withSuccessHandler(function(result) {
      const view = document.getElementById("student-context-view");
      if (result.error) {
        view.innerHTML = '<p style="color:#d93025;padding:24px;">' + esc(result.error) + '</p>';
        return;
      }
      if (!result.hasContent) {
        view.innerHTML = '<div style="text-align:center;padding:40px;color:#5f6368;">' +
          '<p style="font-size:14px;">' + esc(result.message) + '</p></div>';
        return;
      }
      view.innerHTML =
        '<div style="text-align:center;padding:40px;">' +
        '<p style="font-size:14px;color:#3c4043;margin-bottom:6px;">Your context record was last updated:</p>' +
        '<p style="font-size:16px;font-weight:500;color:#202124;margin-bottom:20px;">' + esc(result.lastUpdatedAt) + '</p>' +
        '<a href="' + result.docUrl + '" target="_blank" style="background:#1a73e8;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open my context doc ↗</a>' +
        '</div>';
    })
    .withFailureHandler(function(e) {
      document.getElementById("student-context-view").innerHTML =
        '<p style="color:#d93025;padding:24px;">Could not load your context: ' + esc(e.message || e) + '</p>';
    })
    .getMyStudentContext();
}
*/
//
// 4. IMPORTANT — deployment access setting:
//    Deploy → Manage deployments → Edit → "Who has access" must be set
//    to allow students to open the URL (e.g. "Anyone within [domain]").
//    Previously this may have been restricted to the teacher only, since
//    the dashboard was teacher-only before Module 4. Verify this setting
//    explicitly during deployment — see step 6 in the M4 deployment
//    checklist in 00_SharedConfig_M4_ADDENDUM.js.
//
// =============================================================================
