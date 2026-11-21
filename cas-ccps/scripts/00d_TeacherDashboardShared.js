// =============================================================================
// FILE: 00d_TeacherDashboardShared.js
// BOUND TO: Teacher Dashboard web app (cas-ccps:teacher-dashboard)
// PURPOSE: The Teacher Dashboard's share of what 00 held: shared-config writes, SCR suggestion ownership, the teacher's terms panel.
// Moved out of 00_SharedConfig.js on 2026-11-21 (structure audit 4.6): 00 is
// in all eight cas-ccps projects, and nothing outside this one calls these.
// Named 00c/00d/00e so it sits right after 00 and 00b; every reference to
// these is inside a function body, so load order does not matter.
// =============================================================================

// Sets one SHARED_CONFIG_KEYS value in the Ledger's _CONFIG tab, replacing
// the row if there is one, and clears this project's cache so the change
// shows here at once (other projects see it within the cache TTL). For
// settings a dashboard control changes, such as FEEDBACK_AS_COMMENT; callers
// check who may change it.
function setSharedConfigValue_(key, value) {
  if (SHARED_CONFIG_KEYS.indexOf(key) === -1) throw new Error(key + " is not a shared setting.");
  const ledgerId = _resolveConfigValues_().values.CENTRAL_LEDGER_SS_ID;
  const ss = SpreadsheetApp.openById(ledgerId);
  let sheet = ss.getSheetByName(CONFIG_TAB_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_TAB_NAME);
    sheet.appendRow(["Key", "Value"]);
  }
  const rows = sheet.getDataRange().getValues();
  let written = false;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== key) continue;
    sheet.getRange(i + 1, 2).setValue(value);
    written = true;
    break;
  }
  if (!written) sheet.appendRow([key, value]);
  try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  _sharedConfigMemo_ = null;
}

// The config as the Ledger's _CONFIG tab has it now, not this project's
// cached copy (up to 10 minutes old): for a read-modify-write of a shared
// setting, under the caller's lock (07's ⚙ Settings, Docket IV).
function freshConfigValues_() {
  const ledgerId = _resolveConfigValues_().values.CENTRAL_LEDGER_SS_ID;
  if (ledgerId) {
    try { CacheService.getScriptCache().remove(SHARED_CONFIG_CACHE_PREFIX + ledgerId); } catch (e) { /* ignore */ }
  }
  _sharedConfigMemo_ = null;
  return _resolveConfigValues_().values;
}

// ---------------------------------------------------------------------------
// _scrOwnership_ — student-data access policy, rule 3: only the teacher who
// assigned the work rates it. A competency rating is built from
// CompetencyEvidence rows, and each carries the config_id of the Ledger
// row (the assignment) it came from, which names the assigning teacher. A
// student+competency pair is this teacher's when any of its evidence comes
// from their own assignment this school year.
//
// Evidence written before config_id existed can't be traced; for a pair
// with no traceable evidence at all, the current-year roster decides, as it
// did before this check.
//
// Returns { owned: Set<pairKey>, traced: Set<pairKey> }; pairKey is
// lowercased student email + "|" + competency id.
// ---------------------------------------------------------------------------
function _scrPairKey_(email, competencyId) {
  return String(email || "").trim().toLowerCase() + "|" + String(competencyId || "").trim();
}

function _scrOwnership_(cfg, teacherEmail) {
  const out = { owned: new Set(), traced: new Set() };
  const teacher = String(teacherEmail || "").trim().toLowerCase();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);

  const year = _currentSchoolYear_();
  const teacherByConfig = {};
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  if (ledger && ledger.getLastRow() > 1) {
    ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER.ACADEMIC_YEAR + 1).getValues().forEach(function (row) {
      const configId = String(row[LEDGER.CONFIG_ID] || "").trim();
      if (!configId || !_isCurrentSchoolYearRow_(row, year)) return;
      teacherByConfig[configId] = String(row[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase();
    });
  }

  const evidence = ss.getSheetByName(TABS.competencyEvidence);
  if (!evidence || evidence.getLastRow() < 2) return out;
  const data = evidence.getDataRange().getValues();
  const h = data[0].map(function (x) { return String(x).trim(); });
  const iEmail = h.indexOf("student_email"), iComp = h.indexOf("competency_id");
  const iConfig = h.indexOf("config_id"), iArchive = h.indexOf("archive_status");
  if (iEmail === -1 || iComp === -1 || iConfig === -1) return out;
  for (let i = 1; i < data.length; i++) {
    if (iArchive !== -1 && String(data[i][iArchive] || "").trim() !== "") continue;
    const configId = String(data[i][iConfig] || "").trim();
    if (!configId) continue;
    const key = _scrPairKey_(data[i][iEmail], data[i][iComp]);
    out.traced.add(key);
    if (teacher && teacherByConfig[configId] === teacher) out.owned.add(key);
  }
  return out;
}

function _scrIsMine_(ownership, rosterEmails, email, competencyId) {
  const key = _scrPairKey_(email, competencyId);
  if (ownership.traced.has(key)) return ownership.owned.has(key);
  return rosterEmails.has(String(email || "").trim().toLowerCase());
}

// The permanent record of a confirmed retry: one SCRDecisionLog row,
// RETRY_IMPROVED, the old rating named in its snapshot. The caller has
// checked the teacher and re-run scrRetryStatus_ under the script lock, and
// updates SCRSuggestions with its own column map (SCRS stays in 30).
function scrAppendRetryDecision_(decisionLogSheet, decisionId, studentEmail, competencyId, status, teacherEmail, now) {
  const snapshot = "MET:" + status.all.metCount + " NOT_MET:" + status.all.notMetCount +
    " PARTIALLY_MET:" + status.all.partialCount + " (retry -- previous official rating: " + status.currentRating +
    "; secondary MET:" + status.secondary.metCount + ")";
  decisionLogSheet.appendRow([decisionId, studentEmail, competencyId, status.newRating, status.newRating,
    "RETRY_IMPROVED", now, teacherEmail, snapshot, ""]);
}

const CAS_TEACHER_TERMS = [
  ["Competencies done", "For each course, the competencies you have rated 1 to 3 (limited supervision or better) in Competency ratings, out of every competency in the course (the CompetencyRegistry tab). Only your own confirmed ratings count."],
  ["Check", "One AI evaluation of a submission against the assignment’s criteria (Flow 2). A student can be checked many times."],
  ["Passed / Not passing yet", "Whether the latest check met the assignment’s criteria. “Passed before” means an earlier check passed and the latest needs revision."],
  ["Waiting to be checked", "Submitted and in line for its check."],
  ["Being checked now", "The check is running."],
  ["Couldn’t be checked", "The check failed or timed out, not the student’s work. The timeout email says what to do."],
  ["AI’s suggested score", "On a passing check, the AI suggests 2 (Adequate), 3 (Solid) or 4 (Exceptional). Higher is better. It never suggests 1 or 5."],
  ["Competency rating (SCR)", "The Virginia CTE Student Competency Record, 1 to 5, where 1 is the highest: 1 Can teach others, 2 Without supervision, 3 Limited supervision, 4 With supervision, 5 Cannot perform. The AI suggests 2 to 4 once there are 3 pieces of evidence; 1 and 5 are yours alone."],
  ["Competency tiers", "Each assignment’s competencies are primary (must be shown to pass), secondary or tertiary (credited when shown)."],
  ["Warm-up readiness", "How much the system knows about each student, from checks and warm-up answers. Click a number to see those students."],
  ["Personalized learning profile", "The system’s growing guess of what kind of warm-up works for a student; “ready for fully personalized feedback” means it’s confident."],
  ["Student Context", "One document per student that gathers their lessons, checks and warm-ups, updated weekly."],
  ["More ▾", "The header’s menu of the tools used less often: ✉ Parent Reports, 🎓 Competency ratings, 📅 Lessons, ⚙ Settings, 👁 View as a student and ❓ Terms. Student Context, 🎟 Turn-in codes, ↻ Refresh and the year menu stay in the header."],
  ["Current lesson", "The lesson whose start date in 📅 Lessons is the latest on or before today, per course."],
  ["Rollout", "The nightly job that makes and shares each lesson’s student documents from its start date (2 days ahead)."],
  ["Feedback as a comment", "Where a student’s feedback goes: a comment on the document, or written into it. Set per course in ⚙ Settings."],
  ["⚙ Settings", "Turns each feature on or off per course (feedback as a comment, warm-ups on the Student Dashboard, the nightly lesson rollout, the reflection on Submit, the warm-up style lock, parent reports ready on Fridays) and sets the marking period end dates. Changes wait for Save changes, closing with unsaved changes asks first, and each saved change is kept in the SettingsLog tab."],
  ["3-Odd / 3-Even", "The two halves of period 3, which meet on alternate (odd or even) calendar dates."],
  ["Marking period", "A term code like 2627_MP1 is marking period 1 of 2026–27."],
  ["Turn-in code", "The code a student pastes into the Canvas assignment for completion credit. The Student Dashboard gives it once they answer one question about their feedback and the check says the answer addresses it. In 🎟 Turn-in codes you can give one yourself (with a reason), open an assignment after its marking period, and check the codes in a Canvas submissions download."]
];
