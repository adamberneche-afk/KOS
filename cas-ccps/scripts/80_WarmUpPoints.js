// =============================================================================
// FILE: 80_WarmUpPoints.js
// BOUND TO: cas-ccps:central-ledger, cas-ccps:teacher-dashboard,
//           cas-ccps:student-dashboard
// TRIGGERS: none.
//
// PURPOSE: Warm-up points by student and term, from WarmUpRegistry: the one tally behind the term report, the Teacher Dashboard and the Student Dashboard.
//
// THE RULE: every warm-up delivered to a student (its WarmUpRegistry row, 25's
// Job 1) is worth WUP_MAX points once its lesson day has passed; one not
// answered, or answered but not yet scored, counts 0 of its WUP_MAX. Earned is
// the score without extra credit; extra credit (+1, 25's recheck) is counted
// apart and is not part of the percentage. A row's term is the one recorded
// at delivery, or its lesson date's marking period when the row has none.
//
// WHO SEES WHAT: the teacher sees every student's points by term (80b's
// getWarmUpPoints). A student sees only their own total per term, earned
// plus extra credit (studentWarmUpPoints_, through 13's getMyWarmUpHistory);
// one warm-up's score shows only on its card, with its feedback.
//
// WarmUpRegistry's columns live here because every project that reads the tab
// loads this file. Logs counts only: no student name or email.
// =============================================================================

// ── WarmUpRegistry column indices (0-based) ──────────────────────────────────
const WR_WARMUP_ID     = 0;
const WR_QUEUE_ID      = 1;
const WR_LESSON_ID     = 2;
const WR_LESSON_DATE   = 3;
const WR_STUDENT_EMAIL = 4;
const WR_STUDENT_NAME  = 5;
const WR_TEACHER_EMAIL = 6;
const WR_DOC_ID        = 7;
const WR_DOC_URL       = 8;
const WR_GENERATED_AT  = 9;
const WR_TOTAL_SCORE   = 10;
const WR_EXTRA_CREDIT  = 11;
const WR_TERM          = 12;
// extra_credit_checked: self-healing (25's _ensureWarmUpRegistryExtraCreditColumn_);
// _recheckExtraCredit_()'s header says why it exists.
const WR_EXTRA_CREDIT_CHECKED = 13;
const WR_COL_COUNT     = 14;

const WUP_MAX = 10; // points a warm-up is worth, before extra credit

// The tally. rows: WarmUpRegistry values without the header. opts:
//   today:        "YYYY-MM-DD"; a warm-up counts once its lesson day is before it
//   teacherEmail: only this teacher's rows (optional)
//   studentEmail: only this student's rows (optional)
//   schoolYear:   only terms of this school year, "2026-27" (optional)
//   termOf:       "YYYY-MM-DD" → term, for a row with no term (optional)
// Returns { terms: [term, ...] sorted, students: { email: { name, terms: {
//   term: { delivered, scored, earned, extra } } } } }.
function warmUpPointsTally_(rows, opts) {
  const o = opts || {};
  const teacher = String(o.teacherEmail || "").trim().toLowerCase();
  const only = String(o.studentEmail || "").trim().toLowerCase();
  const termSeen = {};
  const students = {};
  (rows || []).forEach(function (row) {
    const email = String(row[WR_STUDENT_EMAIL] || "").trim().toLowerCase();
    if (!email || (only && email !== only)) return;
    if (teacher && String(row[WR_TEACHER_EMAIL] || "").trim().toLowerCase() !== teacher) return;
    const day = cellYmd_(row[WR_LESSON_DATE], "America/New_York");
    if (day && o.today && day >= o.today) return;
    const term = String(row[WR_TERM] || "").trim().toUpperCase() || (day && o.termOf ? String(o.termOf(day) || "") : "");
    if (o.schoolYear && term && _schoolYearOfTerm_(term) !== o.schoolYear) return;
    const s = students[email] || (students[email] = { name: String(row[WR_STUDENT_NAME] || "").trim() || email, terms: {} });
    const t = s.terms[term] || (s.terms[term] = { delivered: 0, scored: 0, earned: 0, extra: 0 });
    termSeen[term] = true;
    t.delivered++;
    const total = row[WR_TOTAL_SCORE];
    if (total === "" || total === null || total === undefined || isNaN(Number(total))) return;
    const extra = Number(row[WR_EXTRA_CREDIT] || 0) === 1 ? 1 : 0;
    t.scored++;
    t.extra += extra;
    t.earned += Math.max(0, Math.min(WUP_MAX, Number(total) - extra));
  });
  return { terms: Object.keys(termSeen).sort(), students: students };
}

// A lesson date's marking period, the way currentTerm_ (00) reads it, each
// date looked up once.
function warmUpTermOf_() {
  const seen = {};
  return function (ymd) {
    if (!(ymd in seen)) seen[ymd] = currentTerm_(new Date(ymd + "T12:00:00"));
    return seen[ymd];
  };
}

// WarmUpRegistry's rows, without the header; [] when the tab is missing.
function readWarmUpRegistryRows_(ss, cfg) {
  const sheet = ss.getSheetByName(cfg.tabs.warmUpRegistry);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(WR_COL_COUNT, sheet.getLastColumn())).getValues();
}

// One term's points, out of the possible. tt: a tally's term entry.
function warmUpTermSummary_(tt) {
  const possible = tt.delivered * WUP_MAX;
  return { delivered: tt.delivered, scored: tt.scored, earned: tt.earned, extra: tt.extra, possible: possible,
    percent: possible ? Math.round(100 * tt.earned / possible) : null };
}

// The signed-in student's own points this school year: one entry per term,
// the current one first, each the points earned plus extra credit. Read
// through 13's getMyWarmUpHistory, whose caller is the student.
function studentWarmUpPoints_(ss, cfg, email, now) {
  const when = now || new Date();
  const current = currentTerm_(when);
  const tally = warmUpPointsTally_(readWarmUpRegistryRows_(ss, cfg), {
    today: ymd_(when, "America/New_York"), studentEmail: email,
    schoolYear: _schoolYearOfTerm_(current) || _currentSchoolYear_(when), termOf: warmUpTermOf_() });
  const mine = tally.students[String(email || "").trim().toLowerCase()];
  const terms = mine ? Object.keys(mine.terms).filter(function (t) { return t; }) : [];
  if (current && terms.indexOf(current) < 0) terms.push(current);
  terms.sort().reverse();
  if (current) terms.sort(function (a, b) { return (b === current) - (a === current); });
  return terms.map(function (t) {
    const tt = mine && mine.terms[t];
    return { term: t, label: termLabel_(t), current: t === current, points: tt ? tt.earned + tt.extra : 0 };
  });
}
