// =============================================================================
// FILE: 80b_WarmUpPointsPanel.js
// BOUND TO: Teacher Dashboard (standalone web app, cas-ccps:teacher-dashboard)
// TRIGGERS: none.
//
// PURPOSE: The Teacher Dashboard's "Warm-up points" panel: each student's points by term, from 80's tally.
//
// The panel's markup and client code are 80b_WarmUpPointsPanel.html, placed
// in the page by 07's buildDashboardHtml_ (warmUpPointsPanel); More ▾ opens
// it. One row per student this school year: their course and period from
// the Ledger, and per term the points earned out of the possible (80's
// rule), the warm-ups scored out of those delivered, and extra credit.
//
// WHO CAN CALL: getWarmUpPoints checks _isAuthorizedTeacher_() first and
// answers { success: false, error: "Not authorized." } to anyone else.
// Reads only; logs counts only: no student name or email.
// =============================================================================

function getWarmUpPoints() {
  try {
    const cfg = getConfig_();
    if (!_isAuthorizedTeacher_(cfg)) return { success: false, error: "Not authorized." };
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    return warmUpPointsPayload_(ss, cfg, new Date());
  } catch (e) {
    Logger.log("[S80b] getWarmUpPoints failed: " + e.message);
    return { success: false, error: "Warm-up points could not be loaded. Try again in a minute." };
  }
}

// { success, currentTerm, terms: [{ term, label }], students: [{ name,
// courses, periods, terms: { term: 80's warmUpTermSummary_ } }] }, students
// by name. A student no longer on this year's Ledger keeps their points,
// with no course.
function warmUpPointsPayload_(ss, cfg, now) {
  const current = currentTerm_(now);
  const year = _schoolYearOfTerm_(current) || _currentSchoolYear_(now);
  const tally = warmUpPointsTally_(readWarmUpRegistryRows_(ss, cfg), {
    today: ymd_(now, "America/New_York"), teacherEmail: cfg.teacherEmail, schoolYear: year, termOf: warmUpTermOf_() });
  const roster = _wupRoster_(ss, cfg);
  const terms = tally.terms.slice();
  if (current && terms.indexOf(current) < 0) terms.push(current);
  terms.sort();
  const students = Object.keys(tally.students).map(function (email) {
    const st = tally.students[email];
    const r = roster[email] || { courses: [], periods: [] };
    const out = { name: st.name, courses: r.courses, periods: r.periods, terms: {} };
    Object.keys(st.terms).forEach(function (t) { out.terms[t] = warmUpTermSummary_(st.terms[t]); });
    return out;
  }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  Logger.log("[S80b] Warm-up points: " + students.length + " students, " + terms.length + " terms.");
  return { success: true, currentTerm: current, max: WUP_MAX,
    terms: terms.map(function (t) { return { term: t, label: t ? termLabel_(t) : "No term" }; }), students: students };
}

// email → { courses: [code], periods: [period] } from this school year's
// Ledger rows.
function _wupRoster_(ss, cfg) {
  const out = {};
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const year = _currentSchoolYear_();
  sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (row) {
    const email = String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase();
    if (!email || !_isCurrentSchoolYearRow_(row, year)) return;
    const r = out[email] || (out[email] = { courses: [], periods: [] });
    const code = ledgerRowCourseCode_(row);
    const period = String(row[LEDGER.PERIOD] || "").trim();
    if (code && r.courses.indexOf(code) < 0) r.courses.push(code);
    if (period && r.periods.indexOf(period) < 0) r.periods.push(period);
  });
  return out;
}

// The panel's markup and client code, for 07's page.
function warmUpPointsPanelHtml_() {
  return renderPageTemplate_("80b_WarmUpPointsPanel", {});
}
