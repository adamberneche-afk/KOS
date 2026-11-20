// =============================================================================
// FILE: 13_StudentDashboard.js
// STANDALONE APPS SCRIPT PROJECT — deployed as Web App
// PURPOSE: Student-facing dashboard. Authenticated by Google account (any domain).
//          Shows only the active student's own assignments, grouped by
//          [Block - Class - Teacher] folder label.
// DEPLOY: Execute as: Me (the admin) · Access: anyone in the district domain.
//         The page and doPost() identify the student by their signed-in account.
// DEMO:   ?demo=1 shows a teacher the page with a made-up student (below,
//         "Demo mode"); anyone else gets their own page.
// =============================================================================

function doGet(e) {
  const demo = _dashWantsDemo_(e) && _dashDemoAllowed_();
  return HtmlService
    .createHtmlOutput(buildStudentDashboardHtml_({ demo: demo }))
    .setTitle(demo ? "My Assignments (demo)" : "My Assignments")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Demo mode (operator's decisions, 2026-11-07) ──────────────────────────
// A teacher reviewing the page, or showing colleagues how it works, sees it
// as a made-up student: "Demo Student", ID 0000000 (no real ID is all
// zeros), on the teacher's real lessons (13b, generated from 55b), with
// made-up work and results in every card state. A staff account can't be a
// student (rollouts would make docs for it, it would be counted, student
// accounts need a 7-digit ID), and a real student's page can't be shown to
// others (FERPA).
//
// Who: the account this web app runs as (requireScriptOwner_: the teacher
// who deployed it, and under the per-teacher install each teacher reaches
// only their own), or the TEACHER_EMAIL set on this project, never from the
// shared _CONFIG tab (00's SHARED_CONFIG_KEYS leaves it out). Anyone else
// asking for ?demo=1 gets their own page, and getDemoDashboardData refuses
// them.
//
// Isolation: the demo page makes one server call, getDemoDashboardData,
// which opens no spreadsheet, doc or file (the check reads the session and
// one Script Property) and returns the whole fixture. Every other call the page would make (the record tabs,
// Submit for Feedback, warm-up saves) goes to a local stub in the page
// (DEMO_STUBS); a call with no stub fails in the page and never reaches the
// server. Nothing is written anywhere.
const DASH_DEMO_STUDENT = { name: "Demo Student", id: "0000000", account: "demo" };

function _dashWantsDemo_(e) {
  const v = e && e.parameter ? String(e.parameter.demo || "").trim().toLowerCase() : "";
  return v === "1" || v === "true" || v === "yes";
}

// True only for the teacher this deployment recognizes; fails closed (no
// signed-in address, no config, a different account: false).
function _dashDemoAllowed_() {
  let active = "";
  try { active = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase(); } catch (e) { active = ""; }
  if (!active) return false;
  let teacher = "";
  // getConfig_()'s teacherEmail, read straight from this project's
  // properties so the check opens no spreadsheet.
  try { teacher = String(PropertiesService.getScriptProperties().getProperty("TEACHER_EMAIL") || "").trim().toLowerCase(); } catch (e) { teacher = ""; }
  if (teacher && active === teacher) return true;
  try { requireScriptOwner_(); } catch (e) { return false; }
  // requireScriptOwner_ lets a blank effective user through (some triggers);
  // demo mode needs the two to be the same account.
  let effective = "";
  try { effective = String(Session.getEffectiveUser().getEmail() || "").trim().toLowerCase(); } catch (e) { effective = ""; }
  return !!effective && active === effective;
}

// The demo page's one server call: the whole fixture, or a refusal.
function getDemoDashboardData() {
  if (!_dashDemoAllowed_()) {
    return { error: "Demo mode is for teachers. Open the dashboard without ?demo=1 to see your own assignments." };
  }
  return dashDemoFixture_(new Date());
}

// Each course's lessons in order get these states (13b holds five each),
// so the two courses together show every card state.
const DASH_DEMO_PLAN = {
  "8175": ["PASSED", "PASSED", "REVISE", "BEING_CHECKED", "NOT_STARTED"],
  "8177": ["TURNED_IN", "PASSED", "COULDNT_CHECK", "REVISE", "NOT_STARTED"]
};
// A state as the Ledger and the staging pipeline would hold it. Days ago:
// when it was last submitted and last checked.
const DASH_DEMO_STATES = {
  NOT_STARTED:   { status: "ACTIVE" },
  BEING_CHECKED: { status: "ACTIVE", pipeline: "IN_PROCESS", submitted: 0 },
  REVISE:        { status: "COMPLETE", lastResult: "NEEDS_REVISION", submitted: 2, checked: 2 },
  COULDNT_CHECK: { status: "ERROR_EVALUATION", submitted: 3 },
  PASSED:        { status: "COMPLETE", lastResult: "PASSED", submitted: 8, checked: 8 },
  TURNED_IN:     { status: "PENDING_TEACHER_REVIEW", lastResult: "PASSED", submitted: 6, checked: 6 }
};

function _dashDemoDaysAgo_(now, n) {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

// A lesson's milestones that name a competency, as the reflection reads
// them (00's reflectionCriteria_): [{ id, text }], primary first.
function _dashDemoCriteria_(lesson) {
  const out = [];
  (lesson.milestones || []).forEach(function (m, i) {
    const id = String((lesson.milestoneCompetencyIds || [])[i] || "").trim();
    const text = reflectionCriterionText_(m);
    if (id && text && out.length < 3) out.push({ id: id, text: text });
  });
  return out;
}

// The demo's LessonSchedule, as 00's lessonScheduleRows_ gives it: each
// course's demo lessons by teaching order, three days apart, so the second
// one in each course started yesterday.
function _dashDemoSchedule_(assignments, now, tz) {
  const out = {};
  const seen = {};
  assignments.slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function (a) {
    const key = String(a.lessonKey || "");
    if (!key || seen[key]) return;
    seen[key] = true;
    const course = key.split("-")[0];
    const list = out[course] = out[course] || [];
    const start = new Date(now.getTime() + (list.length - 1) * 3 * 86400000 - 86400000);
    list.push({ key: key, start: Utilities.formatDate(start, tz, "yyyy-MM-dd"), hold: false });
  });
  return out;
}

// One card, built with the same status functions as a real Ledger row.
function _dashDemoCard_(course, lesson, state, block, period, now) {
  const s = DASH_DEMO_STATES[state];
  const pipeline = s.pipeline || "";
  const lastResult = s.lastResult || "";
  const inLine = pipeline === "IN_PROCESS" || pipeline === "QUEUED";
  const configId = "DEMO-" + lesson.key;
  const className = course.courseName;
  const teacherName = "Your teacher";
  const criteria = _dashDemoCriteria_(lesson);
  const primary = criteria[0] || null;
  const displayStatus = resolveStudentStatus_(s.status, pipeline, false, lastResult);
  const revise = state === "REVISE";
  // The questions Submit for Feedback would ask (00's chooser): a first
  // submit, or a resubmit after the primary wasn't met.
  const prior = revise ? [{ frameId: "", kind: "", submittedAt: "earlier" }] : [];
  const questions = chooseReflectionQuestions_(criteria, prior, configId, revise ? primary : null)
    .map(function (q) { return { frameId: q.frameId, kind: q.kind, competencyId: q.competencyId, question: q.question, goal: q.goal || "", goalLabel: q.goalLabel || "" }; });
  return {
    configId:      configId,
    studentName:   DASH_DEMO_STUDENT.name,
    studentId:     DASH_DEMO_STUDENT.id,
    unitName:      lesson.unitName,
    block:         block,
    className:     className,
    teacherName:   teacherName,
    teacherEmail:  "",
    period:        period,
    subject:       lesson.subject || "",
    term:          "",
    status:        s.status,
    displayStatus: displayStatus,
    statusClass:   resolveStudentClass_(s.status, pipeline, lastResult),
    statusPill:    resolveStudentPill_(s.status, pipeline, lastResult),
    statusNote:    studentStatusNote_(displayStatus),
    notYet:        revise && primary ? primary.text : "",
    lastEval:      s.checked !== undefined ? formatDate_(_dashDemoDaysAgo_(now, s.checked)) : "",
    lastEvalAt:    s.checked !== undefined ? _dashDemoDaysAgo_(now, s.checked).getTime() : 0,
    submittedAt:   s.submitted !== undefined ? formatDate_(_dashDemoDaysAgo_(now, s.submitted)) : null,
    docUrl:        null, // no document: the page shows a note instead
    workType:      "doc",
    fileId:        "demo-" + lesson.key,
    canSubmit:     !DASH_NO_SUBMIT_STATUSES[s.status] && !inLine,
    waiting:       dashWaiting_(s.status, pipeline),
    // A made-up stage line: submitted 3 minutes ago, being checked since 1.
    stages:        dashWaiting_(s.status, pipeline) ? { current: pipeline === "IN_PROCESS" ? "CHECKING" : "IN_LINE",
      submitted: Utilities.formatDate(new Date(now.getTime() - 3 * 60000), Session.getScriptTimeZone(), "h:mm a"),
      inLine: "", checking: pipeline === "IN_PROCESS"
        ? Utilities.formatDate(new Date(now.getTime() - 60000), Session.getScriptTimeZone(), "h:mm a") : "",
      since: now.getTime() - 60000, usualMin: null } : null,
    canRetry:      false,
    part:          null,
    folderLabel:   block + " - " + className + " - " + teacherName,
    demoQuestions: questions,
    // What the check "finds" after a demo Submit: the primary, not yet.
    demoNotYet:    primary ? primary.text : "",
    // The goals the turn-in question names (_dashDemoTurnIns_): the
    // primary, and another this check measured.
    demoGoals:     criteria.map(function (c) { return c.text; }).slice(0, 2),
    demoLastResult: lastResult
  };
}

// The turn-in code (71) in the demo (2026-11-18: a teacher's "View as a
// student" showed no turn-in card, so the steps the tutorial teaches weren't
// there to try). Codes are on for every card, as where a teacher turns them
// on; a card whose feedback shows gets the card the real page would give it
// (71b's turnInAttach_ rule), its goals and question made by 71's own
// functions. The first passed card already has its code, so both halves
// show; the rest ask the question. Send answer goes to the page's stub
// (DEMO_STUBS), never the server; the code is a well-formed sample.
const DASH_DEMO_TURN_IN_RANDOM = "DEM0K1T";
function _dashDemoTurnIns_(assignments) {
  let codeShown = false;
  assignments.forEach(function (a) {
    a.turnInOn = true;
    const kind = a.demoLastResult === "NEEDS_REVISION" ? "NOT_YET" : a.demoLastResult === "PASSED" ? "PASSED" : "";
    const feedbackShown = a.statusClass === "NEEDS_ACTION" || a.statusClass === "DONE";
    const goals = a.demoGoals || [];
    if (!kind || !feedbackShown || !goals.length) return;
    // The code this card's answer "earns" (the stub hands it back).
    const m = /^DEMO-(\d{4})-/.exec(a.configId);
    const n = /^L(\d{2,3})$/.exec(a.lessonNo || "");
    const code = m && n ? turnInMakeCode_(m[1], n[1], DASH_DEMO_TURN_IN_RANDOM) : "";
    if (kind === "PASSED" && !codeShown && code) {
      a.turnIn = { state: "READY", code: code, kind: kind };
      codeShown = true;
      return;
    }
    if (code) a.demoTurnInCode = code;
    let link = null;
    if (kind === "PASSED") {
      link = turnInNextPartGoal_(a.configId.replace(/^DEMO-/, "CAS-")) || (goals[1] ? { text: goals[1], part: 0 } : null);
    }
    const question = turnInQuestion_(kind, goals[0], link);
    if (!question) return;
    a.turnIn = { state: "ANSWER", kind: kind, question: question, goals: turnInGoals_(kind, goals[0], link),
      minWords: REFLECTION_MIN_WORDS };
  });
}

// A warm-up as _dashOwnWarmUps_ reads it: a WarmUpQueue row and its
// WarmUpTextBox row, so the card goes through _dashWarmUpView_.
function _dashDemoWarmUp_(id, lessonDate, status, course, f) {
  f = f || {};
  const row = new Array(DASH_WQ_WIDTH).fill("");
  row[0] = id;
  row[DASH_WQ_LESSON_DATE] = lessonDate;
  row[DASH_WQ_LESSON_SNAP] = JSON.stringify({ course_name: course });
  row[DASH_WQ_STATUS] = status;
  if (status === "SCORED") {
    row[DASH_WQ_LENGTH] = f.length; row[DASH_WQ_GRAMMAR] = 1; row[DASH_WQ_ENGAGEMENT] = f.engagement;
    row[DASH_WQ_EXTRA_CREDIT] = f.credited ? 1 : 0;
    row[DASH_WQ_TOTAL] = f.length + 1 + f.engagement + (f.credited ? 1 : 0);
    row[DASH_WQ_FEEDBACK] = f.feedback || "";
  }
  const tb = new Array(8).fill("");
  tb[WTB.QUEUE_ID] = id; tb[WTB.LESSON_DATE] = lessonDate;
  tb[WTB.BRIDGE] = f.bridge || ""; tb[WTB.WARMUP] = f.warmup || "";
  tb[WTB.RESPONSE] = f.answer || ""; tb[WTB.SUBMITTED_AT] = f.answer ? _dashDayNoon_(lessonDate) : "";
  tb[WTB.REPLY] = f.reply || "";
  return { queueId: id, row: row, tb: { row: tb }, docId: "", lessonDate: lessonDate };
}

// The whole demo: the Assignments page's data, the three record tabs, and
// the card states a demo Submit walks through.
// The demo form part's Submit: what the reader says of a form with two
// questions and email collection on (75's formCheckReasons_ wording).
const DASH_DEMO_FORM_NOT_YET = [
  "Your form has 2 questions. It needs at least 3.",
  "Your form collects email addresses. Turn that off: in your form, open Settings, then Responses, " +
    "and set Collect email addresses to Do not collect."
];
// The demo Slides part's Submit (Phase 4c): what the reader says of a deck
// with too many lines on a slide and two slides without notes (77's
// slidesCheckReasons_ wording; a test holds it to the reader's own).
const DASH_DEMO_SLIDES_NOT_YET = [
  "Slides 1 and 3 have no speaker notes. Every slide needs its notes (the box under the slide, \"Click to add speaker notes\").",
  "Slide 2 has 8 lines of text, not counting its title; this part allows 6. Cut 2."
];
// The demo Sheets part's Submit (Phase 4d): a table one row short, with
// typed numbers where a formula is asked for (78's sheetCheckReasons_
// wording; a test holds it to the reader's own).
const DASH_DEMO_SHEET_NOT_YET = [
  "Your sheet has 4 rows filled in. It needs at least 5.",
  "Your sheet has 0 formulas in column C. It needs at least 3: a cell that calculates starts with =, like =B2-C2. " +
    "A number typed in is not a formula."
];

// The demo's marking period, from the dates alone: MARKING_PERIOD_ENDS on
// this project or the district calendar, never the Ledger's _CONFIG (the demo
// opens no spreadsheet). Outside the table, its last marking period.
function _dashDemoTerm_(now) {
  let table = [];
  try { table = _markingPeriodEnds_(PropertiesService.getScriptProperties().getProperty("MARKING_PERIOD_ENDS")); } catch (e) { table = []; }
  if (!table.length) table = _markingPeriodEnds_(DEFAULT_MARKING_PERIOD_ENDS);
  return _termForDate_(table, Utilities.formatDate(now, "America/New_York", "yyyy-MM-dd")) || table[table.length - 1].term;
}

// The marking period before one: "2627_MP2" -> "2627_MP1", "2627_MP1" -> "2526_MP4".
function _dashPrevTerm_(term) {
  const m = MP_TERM_RE_.exec(term);
  if (!m) return "";
  if (Number(m[3]) > 1) return m[1] + m[2] + "_MP" + (Number(m[3]) - 1);
  const pad = function (n) { return String((n + 100) % 100).padStart(2, "0"); };
  return pad(Number(m[1]) - 1) + pad(Number(m[2]) - 1) + "_MP4";
}

function dashDemoFixture_(now) {
  const tz = Session.getScriptTimeZone();
  const iso = function (n) { return Utilities.formatDate(_dashDemoDaysAgo_(now, n), tz, "yyyy-MM-dd"); };
  const today = iso(0);
  const blocks = { "8175": ["1", "1"], "8177": ["3O", "3"] };
  const assignments = [];
  const ratings = [];
  const evidence = {};
  const assignmentOf = {};
  DASH_DEMO_LESSONS.forEach(function (course) {
    const plan = DASH_DEMO_PLAN[course.code] || [];
    const where = blocks[course.code] || ["1", "1"];
    course.lessons.forEach(function (lesson, i) {
      const state = plan[i] || "NOT_STARTED";
      const card = _dashDemoCard_(course, lesson, state, where[0], where[1], now);
      assignments.push(card);
      assignmentOf[card.configId] = lesson.unitName;
      const criteria = _dashDemoCriteria_(lesson);
      const checked = DASH_DEMO_STATES[state].checked;
      if (checked === undefined) return;
      // A check's evidence: everything shown on a pass; on a revise, the
      // primary not shown yet and the rest partly shown.
      criteria.forEach(function (c, k) {
        const outcome = state === "REVISE" ? (k === 0 ? "NOT_MET" : "PARTIALLY_MET") : "MET";
        (evidence[c.id] = evidence[c.id] || []).push({ configId: card.configId, milestone: c.text, outcome: outcome,
          at: _dashDemoDaysAgo_(now, checked) });
      });
      if (state === "PASSED" && criteria[0]) {
        ratings.push({ competencyId: criteria[0].id, rating: i === 0 ? 2 : 3, decidedAt: _dashDemoDaysAgo_(now, checked - 1) });
      }
    });
  });
  // A lesson in parts with a form part (Phase 4a), and one with a Slides
  // part (4c): the parts before it passed, the form, Slides or Sheets part open and
  // not started ("Open your form", "Open your slides"), the later parts
  // locked. The demo shows each part as its planned work file. Its Submit
  // (Phase 4b/4c/4d) answers with a sample of the reader's exact checks: the
  // demo has no form or deck, so it reads nothing.
  const lockedParts = [];
  [DASH_DEMO_PARTS_LESSON, DASH_DEMO_SLIDES_LESSON, DASH_DEMO_SHEET_LESSON]
    .forEach(function (pl) {
      const plCourse = pl ? DASH_DEMO_LESSONS.filter(function (c) { return c.code === pl.code; })[0] : null;
      if (!pl || !plCourse) return;
      const where = blocks[pl.code] || ["1", "1"];
      const lessonId = "DEMO-" + String(pl.key).toUpperCase();
      const workAt = pl.parts.findIndex(function (p) { return p.workType !== "doc"; });
      pl.parts.forEach(function (p, i) {
        const part = { lesson: lessonId, n: p.n, count: pl.parts.length, lessonName: pl.lessonName, title: p.title };
        if (i > workAt) { lockedParts.push({ lesson: lessonId, n: p.n, title: p.title }); return; }
        const card = _dashDemoCard_(plCourse, p, i < workAt ? "PASSED" : "NOT_STARTED", where[0], where[1], now);
        card.part = part;
        card.workType = p.workType;
        if (p.workType === "form") card.demoFormNotYet = DASH_DEMO_FORM_NOT_YET.slice();
        if (p.workType === "slides") card.demoSlidesNotYet = DASH_DEMO_SLIDES_NOT_YET.slice();
        if (p.workType === "sheet") card.demoSheetNotYet = DASH_DEMO_SHEET_NOT_YET.slice();
        assignments.push(card);
        assignmentOf[card.configId] = p.unitName;
        // A part that passed: its milestones shown.
        if (i < workAt) {
          _dashDemoCriteria_(p).forEach(function (c) {
            (evidence[c.id] = evidence[c.id] || []).push({ configId: card.configId, milestone: c.text, outcome: "MET",
              at: _dashDemoDaysAgo_(now, DASH_DEMO_STATES.PASSED.checked) });
          });
        }
      });
    });
  // The term boundary (F16): every card is this marking period's but two
  // from the one before. 8175's second lesson (a passed one; the first is
  // passed too) is closed and goes through the real page's rule, so it never
  // shows; the teacher reopened 8177's revise card's assignment, so that one
  // stays and says so.
  const term = _dashDemoTerm_(now);
  const before = _dashPrevTerm_(term);
  const lessonOfCourse = function (code, i) {
    const c = DASH_DEMO_LESSONS.filter(function (x) { return x.code === code; })[0];
    return c && c.lessons[i] ? "DEMO-" + c.lessons[i].key : "";
  };
  const closedId = lessonOfCourse("8175", 1), reopenedId = lessonOfCourse("8177", 3);
  assignments.forEach(function (a) {
    a.term = a.configId === closedId || a.configId === reopenedId ? before : term;
    if (a.configId === reopenedId) a.demoReopened = true;
  });
  const shown = assignments.filter(function (a) {
    const d = _dashTermDecision_(a.term, term, function () { return !!a.demoReopened; });
    a.openPastTerm = d === "reopened";
    return d !== "closed";
  });
  assignments.length = 0;
  Array.prototype.push.apply(assignments, shown);
  // Assigned order: each demo lesson's place in its course (13c).
  assignments.forEach(function (a) {
    a.lessonKey = _dashLessonKeyOf_(a.configId.replace(/^DEMO-/, "CAS-"));
    a.seq = _dashLessonSeq_(a.lessonKey);
    a.assignedAt = 0;
  });
  _dashAddLessonInfo_(assignments);
  // Due dates (2026-11-19) from a made-up schedule: each course's demo
  // lessons in teaching order, three days apart, the one being revised
  // current, so the cards and Coming up show past, near and later ones.
  _dashAddDueDates_(assignments, _dashDemoSchedule_(assignments, now, tz), now, function (ymd) {
    const d = new Date(ymd + "T12:00:00Z").getUTCDay();
    return d !== 0 && d !== 6; // weekdays: the demo opens no calendar
  });
  _dashSortCards_(assignments);
  // Milestone marks: the demo's evidence as CompetencyEvidence rows, through
  // the same functions as the real page.
  const evRows = [["student_file_id", "competency_id", "outcome", "archive_status"]];
  const fileOf = {};
  assignments.forEach(function (a) { fileOf[a.configId] = a.fileId; });
  Object.keys(evidence).forEach(function (comp) {
    evidence[comp].forEach(function (e) { evRows.push([fileOf[e.configId] || "", comp, e.outcome, ""]); });
  });
  _dashAddMilestoneMarks_(assignments, _dashBestOutcomes_(evRows, assignments));
  _dashDemoTurnIns_(assignments);

  const codes = DASH_DEMO_LESSONS.map(function (c) { return c.code; }).sort();
  const totals = {};
  const names = {};
  DASH_DEMO_LESSONS.forEach(function (c) { totals[c.code] = c.competencyTotal; names[c.code] = c.courseName; });
  const done = {};
  competencyCompletionFor_(ratings, totals, codes).forEach(function (c) { done[c.course] = c; });
  const ratingOf = {};
  ratings.forEach(function (r) { ratingOf[r.competencyId] = r; });

  // Competencies tab: getMyCompetencies's shape, for the competencies the
  // demo lessons name.
  const compCourses = DASH_DEMO_LESSONS.map(function (course) {
    const areas = [];
    const areaOf = {};
    course.competencies.forEach(function (c) {
      const r = ratingOf[c.id];
      const item = {
        id: c.id, task: c.task, text: c.text,
        rating: r ? r.rating : null,
        ratedAt: r ? Utilities.formatDate(r.decidedAt, tz, "MMM d, yyyy") : "",
        retry: null,
        evidence: (evidence[c.id] || []).map(function (e) {
          return { assignment: assignmentOf[e.configId] || "An assignment", milestone: e.milestone,
            outcome: DASH_EVIDENCE_WORDS[e.outcome], outcomeKey: e.outcome,
            date: Utilities.formatDate(e.at, tz, "MMM d"), counts: true,
            atMs: e.at.getTime(), lessonKey: _dashLessonKeyOf_(String(e.configId).replace(/^DEMO-/, "CAS-")) };
        }),
        lessons: _dashCompetencyLessons_(c.id)
      };
      const area = c.area || "Other";
      if (!areaOf[area]) { areaOf[area] = { name: area, items: [] }; areas.push(areaOf[area]); }
      areaOf[area].items.push(item);
    });
    const d = done[course.code] || { done: 0, total: course.competencyTotal };
    return { code: course.code, className: course.courseName, done: d.done, total: d.total, areas: areas };
  });

  // Warm-ups: today's to answer, the last one scored with its extra-credit
  // reply open, and two older ones for the Warm-ups tab.
  const lessonOf = function (code, i) {
    const c = DASH_DEMO_LESSONS.filter(function (x) { return x.code === code; })[0];
    return c && c.lessons[i] ? c.lessons[i] : { warmupAnchor: "" };
  };
  const c8175 = names["8175"] || "8175";
  const current = _dashDemoWarmUp_("DEMO-WU-4", today, "DELIVERED", c8175,
    { warmup: lessonOf("8175", 3).warmupAnchor,
      bridge: "Last time you explained how your brand stands out. Today, think about who helps you keep going." });
  const previous = _dashDemoWarmUp_("DEMO-WU-3", iso(2), "SCORED", c8175,
    { warmup: lessonOf("8175", 2).warmupAnchor, length: 6, engagement: 2,
      answer: "My friends would say I am loyal, funny and organized. I think organized fits best because I plan our team's practice schedule every week and people count on it.",
      feedback: "Good start: you picked one word and backed it up with something you actually do. Push further next time: how would a stranger see that quality in your first five minutes with them?" });
  const older = [
    _dashDemoWarmUp_("DEMO-WU-2", iso(5), "SCORED", c8175,
      { warmup: lessonOf("8175", 1).warmupAnchor, length: 6, engagement: 3, credited: true,
        answer: "I would coach younger kids at the rec center for free. I like seeing them get better at something they thought they could not do.",
        feedback: "Clear and specific. You named the task and why it matters to you, which is exactly what intrinsic motivation means.",
        reply: "Thanks. I think it matters to me because someone did the same thing for me when I started playing." }),
    _dashDemoWarmUp_("DEMO-WU-1", iso(8), "SCORED", c8175,
      { warmup: lessonOf("8175", 0).warmupAnchor, length: 4, engagement: 2,
        answer: "My grandparents went to the store every week. We order food on an app.",
        feedback: "You named the change. Add the why: was it the product or the process that changed, and what made it possible?" })
  ];
  const closesOn = iso(-1);
  const warmUps = {
    current: _dashWarmUpView_(current, tz, today, null),
    previous: _dashWarmUpView_(previous, tz, today, closesOn)
  };
  const history = [previous].concat(older).map(function (w) { return _dashWarmUpView_(w, tz, today, null); });

  // My Context: two weeks, laid out as 29 writes them (00's
  // contextWeekLines_ and contextWeekLabel_), read back as 13 reads the doc.
  const asItems = function (lines) {
    return lines.map(function (l) {
      const it = { heading: l.kind === "h", text: l.text };
      if (l.kind === "item" || l.kind === "part") it.level = l.kind === "part" ? 1 : 0;
      return it;
    });
  };
  const ledgerLike = function (a) {
    const name = a.part ? a.part.lessonName + " \u2014 Part " + a.part.n + ": " + a.part.title : a.unitName;
    return { courseName: name, configId: a.configId, status: a.status,
      lastResult: DASH_DEMO_STATES[a.statusPill === "Revise" ? "REVISE" : "PASSED"].lastResult,
      lastEval: a.lastEvalAt ? new Date(a.lastEvalAt) : null };
  };
  const done1 = assignments.filter(function (a) { return a.lastEvalAt; }).map(ledgerLike);
  const warm = function (w) { return { lessonUnitId: "Warm-up", baseline: "", question: w.tb.row[WTB.WARMUP] || "",
    response: w.tb.row[WTB.RESPONSE], timestamp: _dashDayNoon_(w.lessonDate) }; };
  const contextWeeks = [
    { label: contextWeekLabel_(_dashDemoDaysAgo_(now, 7), _dashDemoDaysAgo_(now, 1), tz), bookmark: "",
      items: asItems(contextWeekLines_(done1, [warm(previous)], [], tz)) },
    { label: contextWeekLabel_(_dashDemoDaysAgo_(now, 14), _dashDemoDaysAgo_(now, 8), tz), bookmark: "",
      items: asItems(contextWeekLines_([], [warm(older[1])], [], tz)) }
  ];

  // The states a demo Submit walks the card through, from the same
  // functions: being checked, then revise.
  const step = function (status, pipeline, lastResult) {
    const display = resolveStudentStatus_(status, pipeline, false, lastResult);
    return { status: status, displayStatus: display, statusClass: resolveStudentClass_(status, pipeline, lastResult),
      statusPill: resolveStudentPill_(status, pipeline, lastResult), statusNote: studentStatusNote_(display),
      waiting: dashWaiting_(status, pipeline) };
  };

  return {
    demo: true,
    student: DASH_DEMO_STUDENT,
    dashboard: {
      googleId:         DASH_DEMO_STUDENT.account,
      demo:             true,
      assignments:      assignments,
      lockedParts:      lockedParts,
      warmUps:          warmUps,
      competencies:     competencyCompletionFor_(ratings, totals, codes)
        .map(function (c) { return Object.assign({ className: names[c.course] }, c); }),
      newRegistrations: [],
      term:             term,
      termLabel:        termLabel_(term),
      generatedAt:      formatDate_(now)
    },
    tabs: {
      competencies: { success: true, courses: compCourses, term: term, termLabel: termLabel_(term),
        termStart: _dashTermStartMs_(term, (function () {
          try { return PropertiesService.getScriptProperties().getProperty("MARKING_PERIOD_ENDS") || ""; } catch (e) { return ""; }
        })()) },
      warmups:      { success: true, warmUps: history },
      context:      { success: true, context: { docUrl: "", lastUpdatedAt: formatDate_(_dashDemoDaysAgo_(now, 1)), weeks: contextWeeks } }
    },
    walkthrough: {
      inLine:       Object.assign(step("ACTIVE", "QUEUED", ""), { stages: { current: "IN_LINE", submitted: "just now",
        inLine: "", checking: "", since: now.getTime(), usualMin: null } }),
      beingChecked: Object.assign(step("ACTIVE", "IN_PROCESS", ""), { stages: { current: "CHECKING", submitted: "just now",
        inLine: "", checking: "just now", since: now.getTime(), usualMin: null } }),
      revise:       step("COMPLETE", "", "NEEDS_REVISION")
    }
  };
}

// ---------------------------------------------------------------------------
// getStudentDashboardData — called client-side via google.script.run
// ---------------------------------------------------------------------------
// The page shows the current marking period only (F16, approved
// 2026-11-14): a row whose term (the Ledger's AcademicYear, "2627_MP2")
// is another marking period is left out, so the term selector is gone and
// termFilter is ignored (kept so an old page's call still works). A row with
// no marking period there (blank, or an older "2026-27") still shows, and
// so does a closed-term row whose assignment the teacher opened past its
// marking period (71's TurnInOverrides, openTurnInForAssignment) or whose
// turn-in code the teacher granted this student (grantTurnInCode). Outside a
// marking period (summer, a CURRENT_TERM set to another year) nothing is
// left out. Closed-term work keeps its evidence in the Competencies tab.
function getStudentDashboardData(termFilter) {
  const googleId = Session.getActiveUser().getEmail();

  if (!googleId) {
    return {
      error: "Could not identify your Google account.\n" +
             "Make sure you are signed into Google and try again."
    };
  }

  const cfg   = getConfig_();
  const now   = new Date();
  const scope = _dashTermScope_(now);
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
  // When the staging row was last stamped: by the bridge when it went in
  // line, by the turnstile when its check started (06). The card's stage
  // line shows it (2026-11-14).
  const spTsIdx        = stagingHeaders.indexOf("Timestamp");
  const pipelineAt     = {};
  for (let i = 1; i < stagingData.length; i++) {
    const fid = spFileIdx   !== -1 ? String(stagingData[i][spFileIdx]).trim()   : "";
    const st  = spStatusIdx !== -1 ? String(stagingData[i][spStatusIdx]).trim() : "";
    if (fid) {
      pipelineStatus[fid] = st;
      pipelineAt[fid] = spTsIdx !== -1 ? sheetTimestampMs_(stagingData[i][spTsIdx]) || 0 : 0;
    }
  }

  // Work waiting for its evaluation (walk-through finding 2, 2026-10-22).
  // The Ledger stays ACTIVE (or COMPLETE, on a resubmission) until an
  // evaluation lands, so the open ReviewQueue row (PENDING, then STAGED once
  // the bridge takes it) or a staging row waiting for the turnstile is what
  // says the student's work is in line.
  const queuedFiles = dashQueuedFileIds_(cfg);
  Object.keys(pipelineStatus).forEach(fid => {
    if (pipelineStatus[fid] === "PENDING_INFERENCE") queuedFiles[fid] = true;
  });

  const assignments    = [];
  let closedTermRows   = 0; // left out: another marking period, not reopened
  let ownRows          = 0; // this school year, any status: "nothing yet" vs "not registered"
  // Walk-through finding 11: every lesson's doc is a new Ledger row with a
  // fresh Timestamp, so "just registered" fired for each new assignment.
  // A class counts as new only when its earliest row is (any term, any
  // status, this school year).
  const firstRegistered = {}; // class + teacher -> { className, teacherName, at }
  const courseNames = {}; // course code -> a class name, for the competency counter

  const year = _currentSchoolYear_();
  const feedbackAsComment = feedbackAsCommentChecker_();
  const assignmentOf = _dashStudentAssignments_(ss);
  const partsOf = _dashPartsOf_(ss, assignmentOf);
  const overrideCache = {};
  // Reopened: the teacher opened the assignment past its marking period
  // (an open TurnInOverrides row), or granted this student its turn-in code
  // (grantTurnInCode, "GRANT" in TurnInCodes), which the card must still show.
  const reopened = function (configId) {
    const aid = assignmentOf[configId] || configId;
    try {
      if (_turnInOpenOverride_(ss, aid, now, overrideCache)) return true;
      const code = _turnInCodeFor_(ss, googleId, aid, overrideCache);
      return !!code && String(code[TCODE.HOW] || "").trim().toUpperCase() === "GRANT";
    } catch (e) {
      Logger.log("[S13] turn-in overrides not read: " + e.message);
      return false;
    }
  };
  // Each row's assignment name, from its teacher's TeacherMatrix (2026-11-14):
  // the Ledger's CourseName column holds the Canvas course name for every row
  // the roster import (52) made, so cards read "Sports Entertainment and
  // Event Management" instead of the assignment.
  const unitNames = _dashUnitNames_(ss, cfg, data, googleId);
  // A form, deck or sheet copy's snapshot doc, its feedback page (Phase 4b/4c, 00).
  let snapshotDocs = {};
  try { snapshotDocs = formSnapshotDocIds_(ss); } catch (e) { Logger.log("[Dashboard] FormSnapshots unreadable: " + e.message); }
  const locked = []; // parts made but not open yet (68)
  let usualCheck; // FlowMeasures' Flow 2 median, read only when a card is being checked
  const retryAt = _dashRetryState_();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[LEDGER.GOOGLE_ID]).toLowerCase() !== googleId.toLowerCase()) continue;
    // Access policy: only this school year's work is visible, whatever term
    // the page asks for.
    if (!_isCurrentSchoolYearRow_(row, year)) continue;
    ownRows++;

    const regAt = row[LEDGER.TIMESTAMP] ? new Date(row[LEDGER.TIMESTAMP]) : null;
    if (regAt && !isNaN(regAt.getTime())) {
      const cls = String(row[LEDGER.CLASS_NAME]).trim();
      const tch = String(row[LEDGER.TEACHER_NAME]).trim();
      const key = (cls + "|" + tch).toLowerCase();
      if (!firstRegistered[key] || regAt < firstRegistered[key].at) {
        firstRegistered[key] = { className: cls, teacherName: tch, at: regAt };
      }
    }

    const courseCode = ledgerRowCourseCode_(row);
    if (courseCode && !courseNames[courseCode]) courseNames[courseCode] = String(row[LEDGER.CLASS_NAME]).trim();

    const rowTerm = String(row[LEDGER.ACADEMIC_YEAR] || "").trim();

    // Skip ARCHIVED rows, and SCHEDULED ones: a doc made ahead of its lesson
    // (58's nightly rollout) isn't shared with the student until the night
    // before, so its card would open a doc they can't reach.
    const rowStatus = String(row[LEDGER.STATUS]).trim();
    const part = partsOf[String(row[LEDGER.CONFIG_ID]).trim()];
    if (rowStatus === "SCHEDULED") {
      // A locked part still shows, as a line under the parts already open.
      // Its title from the TeacherMatrix name, as an open part's card (the
      // roster import's rows hold the course name in CourseName, which has
      // no part title, so a locked part read blank; 2026-11-15).
      const lockedName = unitNames[String(row[LEDGER.CONFIG_ID]).trim()] || row[LEDGER.COURSE_NAME];
      if (part) locked.push(Object.assign({ title: _dashPartNames_(lockedName).title }, part));
      continue;
    }
    if (rowStatus === "ARCHIVED") continue;

    // The current marking period only (see above).
    const inTerm = _dashTermDecision_(rowTerm, scope, function () { return reopened(String(row[LEDGER.CONFIG_ID]).trim()); });
    if (inTerm === "closed") { closedTermRows++; continue; }

    const fileId      = String(row[LEDGER.FILE_ID]).trim();
    // A form, Slides or Sheets part's copy (Phase 4a/4c/4d): its Ledger URL says so (00).
    const workType    = workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL]);
    const status      = String(row[LEDGER.STATUS]).trim();
    const lastEval    = row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : null;
    const submittedAt = row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : null;

    // NEW (Say/Do Ledger cas-ccps finding #7): a student previously had no
    // way to see what's actually on file for them (name, class, period,
    // teacher) or to know a registration just happened at all — the only
    // notice was a one-time email, easy to miss. newRegistrations (below)
    // feeds an in-app "just registered" notice; studentName feeds the
    // persistent "My Info" view.

    const configId = String(row[LEDGER.CONFIG_ID]).trim();
    const feedbackInComments = feedbackAsComment(configId, ledgerRowCourseCode_(row));
    // "QUEUED" stands in for a pipeline stage when the work is in line but
    // not yet being evaluated; IN_PROCESS (evaluating now) wins.
    const pipeline = pipelineStatus[fileId] === "IN_PROCESS" ? "IN_PROCESS"
      : queuedFiles[fileId] ? "QUEUED" : pipelineStatus[fileId];
    const lastResult = String(row[LEDGER.LAST_RESULT] || "").trim();
    const inLine = pipeline === "IN_PROCESS" || pipeline === "QUEUED";
    const displayStatus = resolveStudentStatus_(status, pipeline, feedbackInComments, lastResult);

    assignments.push({
      configId:      configId,
      studentName:   String(row[LEDGER.STUDENT_NAME]).trim(),
      // Same fallback wording as the teacher dashboard's identical gap
      // (blank column 10) — a teacher and student comparing notes about a
      // "missing unit" record should recognize it as the same thing.
      unitName:      unitNames[configId] || String(row[LEDGER.COURSE_NAME]).trim() || "Unassigned unit",
      block:         String(row[LEDGER.BLOCK]).trim(),
      className:     String(row[LEDGER.CLASS_NAME]).trim(),
      teacherName:   String(row[LEDGER.TEACHER_NAME]).trim(),
      teacherEmail:  String(row[LEDGER.TEACHER_EMAIL] || "").trim(),
      period:        String(row[LEDGER.PERIOD]).trim(),
      subject:       String(row[LEDGER.SUBJECT]).trim(),
      term:          rowTerm,
      status:        status,
      displayStatus: displayStatus,
      statusClass:   resolveStudentClass_(status, pipeline, lastResult),
      // The card's short pill and the line under the title (UX audit,
      // "Status pills: short pills"): displayStatus split in two.
      statusPill:    resolveStudentPill_(status, pipeline, lastResult),
      statusNote:    studentStatusNote_(displayStatus),
      // "Not yet: <what the last check didn't find>", filled below for a
      // card that needs revising (_dashNotYet_).
      notYet:        "",
      lastEval:      lastEval     || "",
      // For the page's "Recently checked" sort (F16 item 3).
      lastEvalAt:    sheetTimestampMs_(row[LEDGER.LAST_EVAL]) || 0,
      submittedAt:   submittedAt  || null,
      docUrl:        workFileUrl_(fileId, workType),
      // "doc", "form" or "slides": the card's "Open My Document", "Open
      // your form" or "Open your slides".
      workType:      workType,
      // For the Submit for Feedback button (submitMyWork). The student's
      // own doc, which docUrl already carries.
      fileId:        fileId,
      // A form, Slides or Sheets part's Submit reads the file (Phase 4b/4c, 75/77): on, as a doc's.
      canSubmit:     !!fileId && !DASH_NO_SUBMIT_STATUSES[status] && !inLine,
      // In line or being checked: the page checks for news while any card
      // is (getMyWaitingStatus, 2026-11-14).
      waiting:       dashWaiting_(status, pipeline),
      // Where the work is (2026-11-14): Submitted, In line, Being checked,
      // with the times the sheets hold.
      stages:        dashWaiting_(status, pipeline)
        ? dashStages_(row, pipeline, pipelineStatus[fileId], pipelineAt[fileId], function () {
            if (usualCheck === undefined) usualCheck = dashUsualCheckMinutes_(ss);
            return usualCheck;
          }, now) : null,
      // A timed-out check the student can put back in line (retryMyCheck).
      canRetry:      status === "ERROR_TIMEOUT" && !inLine,
      retryWaitMin:  status === "ERROR_TIMEOUT" ? _dashRetryWaitMin_(retryAt, googleId, fileId, now) : 0,
      // A form, Slides or Sheets part's feedback page: its snapshot doc (00), where
      // the check reads the file as submitted and the feedback goes. null
      // for a doc.
      feedbackUrl:   workFileHasSnapshot_(workType) && snapshotDocs[fileId] ? workFileUrl_(snapshotDocs[fileId], "doc") : null,
      // A part of a lesson (68): { lesson, n, count, lessonName, title }.
      part:          part ? Object.assign(_dashPartNames_(unitNames[configId] || row[LEDGER.COURSE_NAME]), part) : null,
      // Assigned order (F16): the lesson's key and its place in the course's
      // teaching order (13c), or null for a lesson not in it (a teacher's own
      // task), which goes after the listed ones in the order assigned.
      lessonKey:     _dashLessonKeyOf_(assignmentOf[configId]),
      seq:           _dashLessonSeq_(_dashLessonKeyOf_(assignmentOf[configId])),
      assignedAt:    sheetTimestampMs_(row[LEDGER.TIMESTAMP]) || 0,
      // A closed-term row the teacher reopened: it stays, and says so.
      openPastTerm:  inTerm === "reopened",
      folderLabel:   String(row[LEDGER.BLOCK]).trim() + " - " +
                     String(row[LEDGER.CLASS_NAME]).trim() + " - " +
                     String(row[LEDGER.TEACHER_NAME]).trim()
    });
  }

  // Assigned order within each class (F16); "Do next" on the page still
  // lists what needs the student first.
  _dashAddLessonInfo_(assignments);
  try { _dashAddDueDates_(assignments, lessonScheduleRows_(ss, Session.getScriptTimeZone()), now); }
  catch (e) { Logger.log("[S13] Due dates not read: " + e.message); }
  _dashSortCards_(assignments);

  // CompetencyEvidence, already in this Ledger, read once (no other
  // spreadsheet): the next-step line on a card to revise (F3) and every
  // card's milestone marks (F16 item 5).
  let evidenceRows = null;
  try {
    evidenceRows = _dashEvidenceRows_(ss, cfg);
  } catch (e) {
    Logger.log("[S13] CompetencyEvidence not read: " + e.message);
  }
  const toRevise = assignments.filter(function (a) { return a.statusClass === "NEEDS_ACTION" && a.fileId; });
  if (toRevise.length && evidenceRows) {
    try {
      const notYet = _dashNotYet_(ss, cfg, toRevise.map(function (a) { return a.fileId; }), evidenceRows);
      toRevise.forEach(function (a) { a.notYet = notYet[a.fileId] || ""; });
    } catch (e) {
      Logger.log("[S13] next-step line not read: " + e.message);
    }
  }
  _dashAddMilestoneMarks_(assignments, _dashBestOutcomes_(evidenceRows, assignments));

  // The turn-in code (71): a.turnIn on cards whose course or lesson
  // TURN_IN_CODE_COURSES covers. Off (the default), nothing is added.
  try {
    turnInAttach_(ss, cfg, googleId, data, assignments);
  } catch (e) {
    Logger.log("[S13] turn-in code not read: " + e.message);
  }

  // Each lesson's part count (the student has every part, open or not),
  // and the locked parts of the lessons with a part open.
  const partCount = {};
  assignments.concat(locked).forEach(function (a) {
    const p = a.part || a;
    if (p.lesson) partCount[p.lesson] = Math.max(partCount[p.lesson] || 0, p.n);
  });
  assignments.forEach(function (a) { if (a.part) a.part.count = partCount[a.part.lesson]; });
  const lockedParts = locked.filter(function (l) {
    return assignments.some(function (a) { return a.part && a.part.lesson === l.lesson; });
  });

  // One line per class first registered in the last 3 days.
  const newRegistrations = Object.keys(firstRegistered).map(function (k) { return firstRegistered[k]; })
    .filter(function (r) { return Date.now() - r.at.getTime() < DASH_NEW_REG_MS; })
    .sort(function (a, b) { return a.at - b.at; })
    .map(function (r) { return { className: r.className, teacherName: r.teacherName, registeredAt: formatDate_(r.at) }; });

  // Warm-ups aren't Ledger rows, and they don't follow the term filter: the
  // card shows the last warm-up and the current one.
  const warmUps = getStudentWarmUps_(ss, cfg, googleId, now);

  // Competencies done per course (00, 2026-10-27): every teacher's
  // confirmed ratings for this student, 1–3 counting.
  let competencies = [];
  try {
    competencies = competencyCompletionFor_(
      readLatestScrRatings_(ss, cfg, "").get(googleId.toLowerCase()),
      competencyCourseTotals_(ss, cfg), Object.keys(courseNames))
      .map(function (c) { return Object.assign({ className: courseNames[c.course] }, c); });
  } catch (e) {
    Logger.log("[S13] competency counts failed: " + e.message);
  }

  // Empty: the start of a marking period (the student has rows this year,
  // none in this term yet) is a plain message, not the account
  // troubleshooting meant for a student with no rows at all.
  if (assignments.length === 0) {
    return {
      googleId:    googleId,
      assignments: [],
      lockedParts: [],
      warmUps:     warmUps,
      competencies: competencies,
      newRegistrations: newRegistrations,
      emptyReason: ownRows > 0 && scope
        ? _dashEmptyTermText_(scope)
        : "No assignments found for " + googleId + ".\n\n" +
          "If you expect to see assignments here:\n" +
          "• Make sure you are signed in with the correct Google account\n" +
          "• Check with your teacher that they have registered you\n" +
          "• Wait a few minutes if you were just registered",
      term:        scope,
      termLabel:   scope ? termLabel_(scope) : "",
      closedTermRows: closedTermRows,
      generatedAt: formatDate_(now)
    };
  }

  return {
    googleId:       googleId,
    assignments:    assignments,
    lockedParts:    lockedParts,
    warmUps:        warmUps,
    competencies:   competencies,
    newRegistrations: newRegistrations,
    term:           scope,
    termLabel:      scope ? termLabel_(scope) : "",
    closedTermRows: closedTermRows,
    tourSeen:       dashTourSeen_(googleId),
    generatedAt:    formatDate_(now)
  };
}

// ---------------------------------------------------------------------------
// Whether this student has finished or closed "Show me around" (2026-11-17),
// so it starts by itself only on a first visit. Kept on the server, not in
// the browser (the operator, 2026-10-22: nothing stored in the browser):
// one Script Property holding a short hash of each account that has seen
// it, never the account itself, as the retry limit does (_dashRetryKey_).
// ---------------------------------------------------------------------------
const DASH_TOUR_PROP = "DASH_TOUR_SEEN";

function _dashTourKey_(googleId) {
  return _dashRetryKey_(String(googleId || "").toLowerCase(), "tour");
}

function dashTourSeen_(googleId) {
  try {
    const seen = String(PropertiesService.getScriptProperties().getProperty(DASH_TOUR_PROP) || "");
    return seen.split(",").indexOf(_dashTourKey_(googleId)) !== -1;
  } catch (e) {
    return true; // unreadable: don't start it by itself
  }
}

// The page's call when the tour ends. Only the signed-in account.
function markMyTourSeen() {
  try {
    const googleId = String(Session.getActiveUser().getEmail() || "").trim();
    if (!googleId) return { ok: false, error: "NO_USER" };
    if (dashTourSeen_(googleId)) return { ok: true };
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try {
      const props = PropertiesService.getScriptProperties();
      const seen = String(props.getProperty(DASH_TOUR_PROP) || "").split(",").filter(Boolean);
      seen.push(_dashTourKey_(googleId));
      props.setProperty(DASH_TOUR_PROP, seen.join(","));
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  } catch (e) {
    Logger.log("markMyTourSeen: " + e.message);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

// ── The current marking period (F16) ──────────────────────────────────────
// The marking period the page shows ("2627_MP2"), or "" outside one (then
// nothing is left out).
function _dashTermScope_(now) {
  const t = String(currentTerm_(now) || "").trim().toUpperCase();
  return MP_TERM_RE_.test(t) ? t : "";
}

// "show" (this term, or no marking period on the row), "reopened" (another
// term, but the teacher opened its assignment past its marking period) or
// "closed". reopened() is asked only for a row from another term.
function _dashTermDecision_(rowTerm, scope, reopened) {
  if (!scope) return "show";
  const t = String(rowTerm || "").trim().toUpperCase();
  if (!MP_TERM_RE_.test(t) || t === scope) return "show";
  return reopened && reopened() ? "reopened" : "closed";
}

function _dashEmptyTermText_(scope) {
  return "Nothing is assigned yet in " + termLabel_(scope) + ".\n\n" +
    "Your work from earlier marking periods isn't listed here any more. What it showed is still in the Competencies tab.";
}

// ── Assigned order (F16) ──────────────────────────────────────────────────
// StudentAssignments (54): { studentConfigId: assignmentConfigId }, read once.
function _dashStudentAssignments_(ss) {
  const out = {};
  const sa = ss.getSheetByName("StudentAssignments");
  if (!sa || sa.getLastRow() < 2) return out;
  sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
    const sid = String(r[0] || "").trim();
    const aid = String(r[2] || "").trim();
    if (sid && aid) out[sid] = aid;
  });
  return out;
}

// "CAS-8175-L05-P2" -> "8175-L05", the lesson's key in 13c, or "" when 13c
// doesn't know it (a teacher's own task, a unit assignment).
let _dashLessonIndex_ = null;
function _dashLessonKeyOf_(assignmentId) {
  // 13c is in the Student Dashboard project; a project or test without it
  // gets no assigned order, never an error.
  if (typeof DASH_LESSON_INFO === "undefined") return "";
  if (!_dashLessonIndex_) {
    _dashLessonIndex_ = {};
    Object.keys(DASH_LESSON_INFO).forEach(function (k) { _dashLessonIndex_[k.toUpperCase()] = k; });
  }
  const m = /^CAS-(.+?)(-P\d+)?$/i.exec(String(assignmentId || "").trim());
  return m ? (_dashLessonIndex_[m[1].toUpperCase()] || "") : "";
}

// Each card's lesson number chip ("L05": its place in its course's teaching
// order, which 8175's names carry and 8177's don't) and one line on what the
// student will do: a part's task (its objective in 13c), or the
// assignment's short title. "" when 13c doesn't know the lesson.
// Each card's due day (2026-11-19, the operator: "tighten up the due dates"):
// 00's lessonDueDay_, the school day before the course's next lesson starts
// in LessonSchedule, the rule the weekly Canvas cartridge (79) gives Canvas.
// a.dueOn "YYYY-MM-DD", or "" (a lesson not in the schedule, or its
// course's last dated one); a.dueText what the card says, "" once the card
// is done or turned in: "Due today", "Due Fri, Nov 20", "Was due Fri, Nov 13".
// isDay: passed on to lessonDueDay_ (the demo's weekdays).
function _dashAddDueDates_(assignments, schedule, now, isDay) {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  assignments.forEach(function (a) {
    a.dueOn = "";
    a.dueText = "";
    const key = String(a.lessonKey || "");
    if (!key) return;
    const rows = schedule[key.split("-")[0]] || [];
    const lesson = rows.filter(function (r) { return r.key.toLowerCase() === key.toLowerCase(); })[0];
    const due = lesson ? lessonDueDay_(rows, lesson, isDay) : "";
    if (!due) return;
    a.dueOn = due;
    if (a.statusClass === "DONE" || a.statusPill === "Turned in") return;
    const p = due.split("-").map(Number);
    const label = Utilities.formatDate(new Date(Date.UTC(p[0], p[1] - 1, p[2], 17)), tz, "EEE, MMM d");
    a.dueText = due === today ? "Due today" : due > today ? "Due " + label : "Was due " + label;
  });
}

function _dashAddLessonInfo_(assignments) {
  assignments.forEach(function (a) {
    const info = a.lessonKey && typeof DASH_LESSON_INFO !== "undefined" ? DASH_LESSON_INFO[a.lessonKey] : null;
    a.lessonNo = info ? "L" + String(info.n).padStart(2, "0") : "";
    let line = "";
    if (info && a.part && info.parts) line = info.parts[a.part.n - 1] || "";
    else if (info) line = info.task || "";
    a.taskLine = line;
  });
  return assignments;
}

// ── The Competencies tab's lesson facts (F17) ───────────────────────────
// Every lesson that names a competency (13c, STUDENT_CRITERIA.json), in
// teaching order, with the student's "I can" words there:
// [{ key, no: "L05", task, text }]. [] for a competency no lesson names:
// student organization and work-based learning (8175: 31-33, 35-38; 8177:
// 31, 33, 35-38; 00's COMPETENCIES_OUTSIDE_LESSONS). Since Q26 (2026-11-20)
// each carries `outside` ("DECA" or "WBL"): the tab labels it "Through
// DECA" or "Through work-based learning" until rated, with a line saying
// the teacher rates it; nothing for them goes into "Next to practice".
let _dashCompLessons_ = null;
function _dashCompetencyLessons_(competencyId) {
  if (typeof DASH_LESSON_INFO === "undefined" || typeof DASH_LESSON_ORDER === "undefined") return [];
  if (!_dashCompLessons_) {
    _dashCompLessons_ = {};
    Object.keys(DASH_LESSON_ORDER).forEach(function (code) {
      DASH_LESSON_ORDER[code].forEach(function (key) {
        const info = DASH_LESSON_INFO[key];
        if (!info) return;
        // The Review panel (F17, SDV-N8; 13d): the lesson plan's one-line
        // recap of this competency there, the lesson's key terms and its
        // linked videos, where they exist.
        const review = typeof DASH_REVIEW !== "undefined" ? DASH_REVIEW[key] || {} : {};
        info.iCan.forEach(function (m) {
          const l = { key: key, no: "L" + String(info.n).padStart(2, "0"), task: info.task, text: m.text };
          if (review.recap && review.recap[m.id]) l.recap = review.recap[m.id];
          if (review.terms) l.terms = review.terms;
          if (review.watch) l.watch = review.watch;
          (_dashCompLessons_[m.id] = _dashCompLessons_[m.id] || []).push(l);
        });
      });
    });
  }
  return (_dashCompLessons_[competencyId] || []).map(function (l) { return Object.assign({}, l); });
}

// The course's Covered So Far doc (76), only when the operator has set its
// ID on this project too (COVERED_SO_FAR_DOC_ID_<course>, as on the Central
// Ledger; never in the repo) and shared it with students: "" otherwise.
function _dashCoveredUrl_(code) {
  let id = "";
  try { id = String(PropertiesService.getScriptProperties().getProperty("COVERED_SO_FAR_DOC_ID_" + code) || "").trim(); } catch (e) { id = ""; }
  return /^[A-Za-z0-9_-]{20,}$/.test(id) ? workFileUrl_(id, "doc") : "";
}

// When the current marking period began (ms), for "this term" on the
// Competencies tab: the day after the one before it ends, by the same
// MARKING_PERIOD_ENDS table currentTerm_ reads (00); 0 when unknown.
function _dashTermStartMs_(term, raw) {
  let table = _markingPeriodEnds_(raw);
  if (!table.length) table = _markingPeriodEnds_(DEFAULT_MARKING_PERIOD_ENDS);
  const i = table.map(function (t) { return t.term; }).indexOf(String(term || "").toUpperCase());
  if (i <= 0) return 0;
  const p = table[i - 1].end.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2] + 1).getTime();
}
function _dashMarkingPeriodRaw_() {
  let raw = "";
  try { raw = PropertiesService.getScriptProperties().getProperty("MARKING_PERIOD_ENDS") || ""; } catch (e) { raw = ""; }
  if (!raw) { try { raw = _resolveConfigValues_().values.MARKING_PERIOD_ENDS || ""; } catch (e) { raw = ""; } }
  return raw;
}

// ── Milestone marks (F16 item 5) ─────────────────────────────────────────
// Each lesson's best outcome per competency across all its files (a lesson
// in parts: every part's), and the parts it came from (2026-11-19: a card
// on Part 6 said "Shown" for what Parts 1-5 had shown, and read as if Part 6
// had been checked): { lessonKey: { competencyId: { outcome: "MET" | ...,
// parts: [n, ...] } } }, parts ascending, [] for a lesson not in parts. An
// assignment counts once, at its best result (30's aggregateEvidence_),
// archived rows don't count. rows: CompetencyEvidence with its header.
function _dashBestOutcomes_(rows, assignments) {
  const out = {};
  if (!rows || rows.length < 2) return out;
  const lessonOfFile = {}, partOfFile = {};
  assignments.forEach(function (a) {
    if (!a.fileId || !a.lessonKey) return;
    lessonOfFile[a.fileId] = a.lessonKey;
    if (a.part && a.part.n) partOfFile[a.fileId] = Number(a.part.n);
  });
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"), iOut = h.indexOf("outcome"),
    iArch = h.indexOf("archive_status");
  if (iFile === -1 || iComp === -1 || iOut === -1) return out;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const lesson = lessonOfFile[String(r[iFile]).trim()];
    if (!lesson || (iArch !== -1 && String(r[iArch]).trim())) continue;
    const comp = String(r[iComp]).trim();
    const o = String(r[iOut]).trim().toUpperCase();
    if (!comp || !DASH_EVIDENCE_RANK[o]) continue;
    const mine = out[lesson] = out[lesson] || {};
    const n = partOfFile[String(r[iFile]).trim()];
    const had = mine[comp];
    if (!had || DASH_EVIDENCE_RANK[o] > DASH_EVIDENCE_RANK[had.outcome]) mine[comp] = { outcome: o, parts: n ? [n] : [] };
    else if (o === had.outcome && n && had.parts.indexOf(n) === -1) {
      had.parts.push(n);
      had.parts.sort(function (x, y) { return x - y; });
    }
  }
  return out;
}

// Where a mark came from, for a lesson in parts: "in Part 2", "in Parts 2
// and 4", "in Parts 1, 2 and 4"; "" with no part, or for "Not shown yet"
// (the best across every part: not shown in any).
function _dashMarkWhere_(outcome, parts) {
  if (!parts || !parts.length || outcome === "NOT_MET") return "";
  if (parts.length === 1) return "in Part " + parts[0];
  return "in Parts " + parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// a.milestones: the lesson's measured milestones (up to three, primary
// first, 13c), each in the student's "I can" words with its mark: Shown,
// Partly shown or Not shown yet (the Competencies tab's words), or "Not
// checked yet" before a check found anything for it; for a lesson in parts,
// where: "in Part 2" (_dashMarkWhere_). No totals or targets (D17). [] for a
// lesson 13c doesn't know.
function _dashAddMilestoneMarks_(assignments, best) {
  assignments.forEach(function (a) {
    const info = a.lessonKey && typeof DASH_LESSON_INFO !== "undefined" ? DASH_LESSON_INFO[a.lessonKey] : null;
    const got = (best && best[a.lessonKey]) || {};
    a.milestones = info ? info.iCan.slice(0, info.m).filter(function (m) { return m.text; }).map(function (m) {
      const b = got[m.id] || null;
      const o = b ? b.outcome : "";
      return { id: m.id, text: m.text, markKey: o || "UNCHECKED", mark: o ? DASH_EVIDENCE_WORDS[o] : "Not checked yet",
        where: b ? _dashMarkWhere_(o, b.parts) : "" };
    }) : [];
  });
  return assignments;
}

// The lesson's place (1-based) in its course's teaching order, or null.
function _dashLessonSeq_(lessonKey) {
  const info = lessonKey && typeof DASH_LESSON_INFO !== "undefined" ? DASH_LESSON_INFO[lessonKey] : null;
  return info ? info.n : null;
}

// The cards' order (the real page's and the demo's), F16: by block, then
// class, then within each class the order the lessons were assigned: a
// lesson in the course's teaching order (seq) by its place there, then the
// lessons not in it (a teacher's own task) in the order they were assigned
// (the Ledger's Timestamp), a lesson's parts in order. The old order (what
// needs the student first) is the page's "Needs attention first" sort.
function _dashSortCards_(assignments) {
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  const big = Number.MAX_SAFE_INTEGER;
  assignments.sort((a, b) => {
    const ia = blockOrder.indexOf(a.block);
    const ib = blockOrder.indexOf(b.block);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const c = String(a.className || "").localeCompare(String(b.className || ""));
    if (c) return c;
    const sa = a.seq == null ? big : a.seq, sb = b.seq == null ? big : b.seq;
    if (sa !== sb) return sa - sb;
    if (a.seq == null && (a.assignedAt || 0) !== (b.assignedAt || 0)) return (a.assignedAt || 0) - (b.assignedAt || 0);
    return (a.part ? a.part.n : 0) - (b.part ? b.part.n : 0);
  });
  return assignments;
}

// The next step on a card to revise: the first milestone the file's last
// check found not met yet ({ fileId: text }). Flow 2 writes a check's
// evidence rows in milestone order (15c's writeCompetencyEvidenceFromFlow2_),
// so the first row is the primary milestone; when the primary was met, the
// next one that wasn't. The text is the milestone as the student reads it
// (00's reflectionCriterionText_), or the competency's title. Read by
// header, like reflectionShortfall_ (00); no new column (FLOW_DOCTRINE 6).
// CompetencyEvidence's rows (header first), or null when there are none.
function _dashEvidenceRows_(ss, cfg) {
  const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.competencyEvidence) || "CompetencyEvidence");
  if (!sheet || sheet.getLastRow() < 2) return null;
  return sheet.getDataRange().getValues();
}

function _dashNotYet_(ss, cfg, fileIds, preread) {
  const out = {};
  const want = {};
  fileIds.forEach(function (f) { want[f] = true; });
  const rows = preread || _dashEvidenceRows_(ss, cfg);
  if (!rows) return out;
  const h = rows[0].map(function (x) { return String(x).trim(); });
  const iFile = h.indexOf("student_file_id"), iComp = h.indexOf("competency_id"), iText = h.indexOf("milestone_text"),
    iOut = h.indexOf("outcome"), iAt = h.indexOf("evaluated_at"), iArch = h.indexOf("archive_status");
  if (iFile === -1 || iOut === -1 || iAt === -1) return out;
  const byFile = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const f = String(r[iFile]).trim();
    if (!want[f] || (iArch !== -1 && String(r[iArch]).trim())) continue;
    (byFile[f] = byFile[f] || []).push(r);
  }
  let names = null;
  Object.keys(byFile).forEach(function (f) {
    const mine = byFile[f];
    const latest = Math.max.apply(null, mine.map(function (r) { return sheetTimestampMs_(r[iAt]) || 0; }));
    const short = mine.filter(function (r) {
      return (sheetTimestampMs_(r[iAt]) || 0) === latest && String(r[iOut]).trim().toUpperCase() !== "MET";
    })[0];
    if (!short) return;
    let text = iText === -1 ? "" : reflectionCriterionText_(short[iText]);
    if (!text && iComp !== -1) {
      if (!names) names = getCompetencyTextMap_(ss.getSheetByName(cfg.tabs.competencyRegistry || "CompetencyRegistry"));
      text = names[String(short[iComp]).trim()] || "";
    }
    if (text) out[f] = text;
  });
  return out;
}

// Lessons in parts (68): each part row's lesson and place, from
// StudentAssignments (a part's assignment ConfigID ends "-P<n>"; 68 and 55b
// aren't in this project). { studentConfigId: { lesson, n } }.
function _dashPartsOf_(ss, assignmentOf) {
  const out = {};
  const map = assignmentOf || _dashStudentAssignments_(ss);
  Object.keys(map).forEach(function (sid) {
    const m = /^(.+)-P(\d+)$/i.exec(map[sid]);
    if (m) out[sid] = { lesson: m[1].toUpperCase(), n: Number(m[2]) };
  });
  return out;
}

// The assignment name for each of this student's workspaces, from the
// TeacherMatrix of each teacher on their rows: { studentConfigId: UnitName }.
// The Ledger's CourseName column can't be trusted for it (the roster import
// writes the Canvas course name there; 60 and 29 read that column as the
// course, so it stays as it is). StudentAssignments maps a workspace to its
// assignment; MatrixRegistry finds the teacher's TeacherMatrix, whose rows are
// ConfigID (col 0) and UnitName (col 1), "<lesson> — Part 2: <title>" for a
// part (53). Each teacher's names are cached ten minutes (lesson names, no
// student data). Anything unreadable gives {}: the card keeps the Ledger's
// name rather than fail the page.
const DASH_UNIT_NAMES_CACHE_SECONDS = 10 * 60;
function _dashUnitNames_(ss, cfg, data, googleId) {
  const out = {};
  try {
    const me = String(googleId || "").toLowerCase();
    const mine = {};      // studentConfigId -> teacher email
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (String(r[LEDGER.GOOGLE_ID]).toLowerCase() !== me) continue;
      const sid = String(r[LEDGER.CONFIG_ID] || "").trim();
      if (sid) mine[sid] = String(r[LEDGER.TEACHER_EMAIL] || "").trim().toLowerCase();
    }
    if (!Object.keys(mine).length) return out;
    const assignmentOf = {};
    const sa = ss.getSheetByName("StudentAssignments"); // 54's tab
    if (sa && sa.getLastRow() > 1) {
      sa.getRange(2, 1, sa.getLastRow() - 1, 3).getValues().forEach(function (r) {
        const sid = String(r[0] || "").trim();
        if (mine[sid] !== undefined && String(r[2] || "").trim()) assignmentOf[sid] = String(r[2]).trim();
      });
    }
    const namesByTeacher = {};
    Object.keys(assignmentOf).forEach(function (sid) {
      const t = mine[sid];
      if (!(t in namesByTeacher)) namesByTeacher[t] = _dashMatrixUnitNames_(ss, cfg, t);
      const name = namesByTeacher[t][assignmentOf[sid]];
      if (name) out[sid] = name;
    });
  } catch (e) {
    Logger.log("[Dashboard] assignment names unavailable: " + e.message);
  }
  return out;
}

// { assignmentConfigId: UnitName } from one teacher's TeacherMatrix.
function _dashMatrixUnitNames_(ss, cfg, teacherEmail) {
  if (!teacherEmail) return {};
  const key = "dash_unit_names_v1:" + teacherEmail;
  try {
    const hit = CacheService.getScriptCache().get(key);
    if (hit) return JSON.parse(hit);
  } catch (e) { /* no cache: read the sheet */ }
  const names = {};
  const reg = ss.getSheetByName(cfg.tabs.matrixRegistry || "MatrixRegistry");
  if (!reg || reg.getLastRow() < 2) return names;
  const regRow = reg.getDataRange().getValues().slice(1).filter(function (r) {
    return String(r[1] || "").trim().toLowerCase() === teacherEmail && String(r[2] || "").trim();
  })[0];
  if (!regRow) return names;
  const tm = SpreadsheetApp.openById(String(regRow[2]).trim()).getSheetByName(cfg.tabs.teacherMatrix || "TeacherMatrix");
  if (!tm || tm.getLastRow() < 2) return names;
  tm.getRange(2, 1, tm.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const id = String(r[0] || "").trim(), name = String(r[1] || "").trim();
    if (id && name) names[id] = name;
  });
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(names), DASH_UNIT_NAMES_CACHE_SECONDS);
  } catch (e) { /* too large or no cache: uncached is only slower */ }
  return names;
}

// A part's Ledger name, "<lesson> — Part 2: <title>", in its two halves.
function _dashPartNames_(unitName) {
  const m = /^(.*?) — Part \d+: (.*)$/.exec(String(unitName || "").trim());
  return m ? { lessonName: m[1], title: m[2] } : { lessonName: String(unitName || "").trim(), title: "" };
}

// ---------------------------------------------------------------------------
// Warm-ups card: the student's last warm-up and the current one (the
// operator's rule, 2026-10-24). The current warm-up is answered on its own
// day. The last one stays open until the end of the student's next class
// day: a student who answered it replies to its feedback for extra credit;
// one who didn't can answer it late, and the late answer is scored without
// feedback or extra credit (25 scores it the night after). Older warm-ups
// stay in the Ledger; the card doesn't list them.
//
// WarmUpQueue (25_WarmUpWriter.js's WQ25_*; 25 isn't in this project, so
// the columns are repeated here): google_id 4, lesson_date 5,
// lesson_context_snapshot 6, status 8, doc_id 9, word_count_score 12,
// grammar_score 13, engagement_score 14, extra_credit 15, total_score 16
// (the total includes extra credit once it is earned), flow4_feedback 17. A warm-up answered here (WARMUP_TEXT_BOX) has a
// WarmUpTextBox row (00's WTB) and no doc. The 3:15am run after the lesson
// day (runWarmUpEvaluation) scores it, and replies are checked each night
// for EXTRA_CREDIT_RECHECK_WINDOW_DAYS (7) with at least
// EXTRA_CREDIT_MIN_WORDS (10) words. 25's last check is the 3:15am run on
// lesson day + 7 (it reads the lesson date as UTC midnight, the evening
// before here), so the window never runs past day + 6 (walk-through finding
// 4), even when the next class is further off or not queued yet.
// ---------------------------------------------------------------------------
const DASH_WQ_GOOGLE_ID    = 4;
const DASH_WQ_LESSON_DATE  = 5;
const DASH_WQ_LESSON_SNAP  = 6;
const DASH_WQ_STATUS       = 8;
const DASH_WQ_DOC_ID       = 9;
const DASH_WQ_LENGTH       = 12;
const DASH_WQ_GRAMMAR      = 13;
const DASH_WQ_ENGAGEMENT   = 14;
const DASH_WQ_EXTRA_CREDIT = 15;
const DASH_WQ_TOTAL        = 16;
const DASH_SCORE_MAX       = 10; // length 6 + grammar 1 + engagement 3 (25's thresholds, 41's ranges)
const DASH_WQ_FEEDBACK     = 17;
const DASH_WQ_WIDTH        = 18;
const DASH_NEW_REG_MS      = 3 * 24 * 60 * 60 * 1000; // "just registered" for 3 days
const DASH_EC_DAYS         = 6; // the latest day the last warm-up stays open; 25's window is 7 nights
const DASH_EC_MIN_WORDS    = 10;
const DASH_ANSWER_MAX      = 5000;
const DASH_REPLY_MAX       = 2000;

// The student's own delivered warm-ups, oldest first, each with its
// WarmUpTextBox row, and every date they have a warm-up queued for
// (delivered or not), which says when their next class is.
function _dashOwnWarmUps_(ss, cfg, googleId, tz) {
  const sheet = ss.getSheetByName(cfg.tabs.warmUpQueue);
  const out = { list: [], classDates: [] };
  if (!sheet || sheet.getLastRow() < 2) return out;
  const me = String(googleId).trim().toLowerCase();
  const textBox = readWarmUpTextBox_(ss);
  sheet.getRange(2, 1, sheet.getLastRow() - 1, DASH_WQ_WIDTH).getValues().forEach(function (row, i) {
    if (String(row[DASH_WQ_GOOGLE_ID] || "").trim().toLowerCase() !== me) return;
    // NOT_MEETING (24): queued for a day the student's period doesn't meet.
    if (String(row[DASH_WQ_STATUS] || "").trim() === "NOT_MEETING") return;
    const lessonDate = dashIsoDate_(row[DASH_WQ_LESSON_DATE], tz);
    if (!lessonDate) return;
    out.classDates.push(lessonDate);
    const queueId = String(row[0] || "").trim();
    const docId = String(row[DASH_WQ_DOC_ID] || "").trim();
    const tb = textBox[queueId] || null;
    if (!queueId || (!docId && !tb)) return; // not delivered yet
    out.list.push({ queueId: queueId, sheetRow: i + 2, row: row, tb: tb, docId: docId, lessonDate: lessonDate });
  });
  out.list.sort(function (a, b) { return a.lessonDate < b.lessonDate ? -1 : a.lessonDate > b.lessonDate ? 1 : 0; });
  return out;
}

// "YYYY-MM-DD" plus n days, and its noon as a Date for formatting.
function _dashDayNoon_(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + (n || 0), 12);
}

// The current and last warm-ups, each { w, view }. The last one's window
// closes at the end of the student's next class day, or day + 6 if that is
// sooner or no later warm-up is queued yet.
function _dashWarmUpPair_(ss, cfg, googleId, now) {
  const tz    = Session.getScriptTimeZone();
  const today = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  const own = _dashOwnWarmUps_(ss, cfg, googleId, tz);
  const upcoming = own.list.filter(function (w) { return w.lessonDate >= today; });
  const past = own.list.filter(function (w) { return w.lessonDate < today; });
  const cur = upcoming.length ? upcoming[0] : null;
  const prev = past.length ? past[past.length - 1] : null;
  let prevView = null;
  if (prev) {
    const cap = Utilities.formatDate(_dashDayNoon_(prev.lessonDate, DASH_EC_DAYS), tz, "yyyy-MM-dd");
    const next = own.classDates.filter(function (d) { return d > prev.lessonDate; }).sort()[0];
    const closesOn = next && next < cap ? next : cap;
    prevView = _dashWarmUpView_(prev, tz, today, closesOn);
  }
  return {
    own: own.list,
    current:  cur ? { w: cur, view: _dashWarmUpView_(cur, tz, today, null) } : null,
    previous: prev ? { w: prev, view: prevView } : null
  };
}

function getStudentWarmUps_(ss, cfg, googleId, now) {
  const pair = _dashWarmUpPair_(ss, cfg, googleId, now);
  return {
    current:  pair.current ? pair.current.view : null,
    previous: pair.previous ? pair.previous.view : null
  };
}

// ── The student's own record (2026-10-27) ─────────────────────────────────
// Three tabs beside Assignments, each loaded when first opened, each only
// the signed-in student's own data (identity from the session, never a
// parameter): their competencies with the teacher's confirmed rating and
// the evidence behind it, every past warm-up with its feedback, and their
// Student Context doc by week. The AI's suggested ratings stay
// teacher-only (decided 2026-10-27).

// The student's courses this school year, and each workspace's assignment
// name, from their own Ledger rows. The name is the TeacherMatrix's, as on
// the cards (_dashUnitNames_, #424), with the Ledger's CourseName column only
// as the fallback: the roster import writes the Canvas course name there, so
// every piece of evidence on the Competencies tab read as the course
// (2026-11-15).
function _dashOwnCourses_(ss, cfg, email) {
  const out = { courses: {}, assignmentOf: {} };
  const sheet = ss.getSheetByName(cfg.tabs.ledger);
  if (!sheet || sheet.getLastRow() < 2) return out;
  const year = _currentSchoolYear_();
  const mine = [null]; // _dashUnitNames_ skips a header row
  sheet.getRange(2, 1, sheet.getLastRow() - 1, LEDGER_COL_COUNT).getValues().forEach(function (row) {
    if (String(row[LEDGER.GOOGLE_ID] || "").trim().toLowerCase() !== email) return;
    if (!_isCurrentSchoolYearRow_(row, year)) return;
    mine.push(row);
  });
  const names = mine.length > 1 ? _dashUnitNames_(ss, cfg, mine, email) : {};
  mine.slice(1).forEach(function (row) {
    const code = ledgerRowCourseCode_(row);
    if (code && !out.courses[code]) out.courses[code] = String(row[LEDGER.CLASS_NAME] || "").trim();
    const id = String(row[LEDGER.CONFIG_ID] || "").trim();
    if (id) out.assignmentOf[id] = names[id] || String(row[LEDGER.COURSE_NAME] || "").trim();
  });
  return out;
}

// The SCR retry (D15, 2026-11-01), as the student reads it: for each
// competency rated 3 or 4, either that it is ready for the teacher to
// re-rate, or what more work would unlock a re-rating (00's
// scrRetryStatus_). The re-rating's number is never shown here: it is the
// rule's suggestion until the teacher confirms it, and SCRSuggestions'
// unreviewed values stay teacher-side. Competencies with no linked ones
// (no assignment has them as its primary with secondaries) get nothing.
// { competencyId: { ready, text } }.
function _dashRetryFor_(ss, cfg, email, ratingList) {
  const out = {};
  const candidates = (ratingList || []).filter(function (r) { return Number(r.rating) === 3 || Number(r.rating) === 4; });
  if (!candidates.length) return out;
  const ctx = scrRetryContext_(ss, cfg, email);
  const texts = getCompetencyTextMap_(ss.getSheetByName(cfg.tabs.competencyRegistry || "CompetencyRegistry"));
  const name = function (id) { return texts[id] ? "“" + texts[id] + "”" : id; };
  candidates.forEach(function (r) {
    const st = scrRetryStatus_(ctx, email, r.competencyId, r.rating);
    if (!st.applies || !st.secondaryIds.length) return;
    if (st.eligible && st.improved) {
      out[r.competencyId] = { ready: true, text: "Your work since this rating is enough for your teacher to re-rate it. Your teacher decides." };
      return;
    }
    const parts = [];
    if (st.needSecondary) {
      parts.push("show " + st.needSecondary + " more time" + (st.needSecondary === 1 ? "" : "s") + " one of the skills that go with it: " +
        st.secondaryIds.map(name).join("; "));
    }
    const moreMet = Math.max(0, st.needMet - st.needSecondary);
    if (moreMet) parts.push("show this skill or one that goes with it in " + moreMet + " more assignment" + (moreMet === 1 ? "" : "s"));
    if (st.needPrimaryMet) parts.push("show this skill itself in " + st.needPrimaryMet + " more assignment" + (st.needPrimaryMet === 1 ? "" : "s"));
    if (!parts.length) return;
    out[r.competencyId] = { ready: false, text: "To be re-rated: " + parts.join("; and ") + ". Work that is checked as “Shown” counts." };
  });
  return out;
}

const DASH_EVIDENCE_WORDS = { MET: "Shown", PARTIALLY_MET: "Partly shown", NOT_MET: "Not shown yet" };
const DASH_EVIDENCE_RANK = { MET: 3, PARTIALLY_MET: 2, NOT_MET: 1 };

// Every competency in each of the student's courses, by duty area in task
// order: the teacher's latest confirmed rating (or none) and each piece of
// evidence, newest first. One assignment counts once, at its best result
// (30's aggregateEvidence_), so each piece says whether it counts.
function getMyCompetencies() {
  const email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!email) return { success: false, error: "Could not identify your Google account." };
  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const tz = Session.getScriptTimeZone();
    const own = _dashOwnCourses_(ss, cfg, email);
    const codes = Object.keys(own.courses).sort();
    // Each workspace's lesson (F17: evidence on the lesson it came from).
    const assignmentOf = _dashStudentAssignments_(ss);
    const ratingList = readLatestScrRatings_(ss, cfg, "").get(email) || [];
    const ratings = {};
    ratingList.forEach(function (r) { ratings[r.competencyId] = r; });
    let retryFor = {};
    try {
      retryFor = _dashRetryFor_(ss, cfg, email, ratingList);
    } catch (e) {
      Logger.log("[S13] Retry status not read: " + e.message);
    }

    const evidence = {};
    const ev = ss.getSheetByName(cfg.tabs.competencyEvidence || "CompetencyEvidence");
    if (ev && ev.getLastRow() > 1) {
      const data = ev.getDataRange().getValues();
      const h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
      const col = function (n) { return h.indexOf(n); };
      const E = { email: col("student_email"), comp: col("competency_id"), milestone: col("milestone_text"),
        outcome: col("outcome"), config: col("config_id"), at: col("evaluated_at"), archive: col("archive_status") };
      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (String(r[E.email] || "").trim().toLowerCase() !== email) continue;
        if (E.archive !== -1 && String(r[E.archive] || "").trim() !== "") continue;
        const outcome = String(r[E.outcome] || "").trim().toUpperCase();
        if (!DASH_EVIDENCE_WORDS[outcome]) continue;
        String(r[E.comp] || "").split(",").map(function (c) { return c.trim(); }).filter(Boolean).forEach(function (comp) {
          (evidence[comp] = evidence[comp] || []).push({ outcome: outcome, configId: String(r[E.config] || "").trim(),
            milestone: String(r[E.milestone] || "").trim(),
            at: Object.prototype.toString.call(r[E.at]) === "[object Date]" ? r[E.at] : null });
        });
      }
    }

    const reg = ss.getSheetByName(cfg.tabs.competencyRegistry || "CompetencyRegistry");
    const byCourse = {};
    codes.forEach(function (c) { byCourse[c] = []; });
    if (reg && reg.getLastRow() > 1) {
      const data = reg.getDataRange().getValues();
      const h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
      const idC = h.indexOf("competency_id"), textC = h.indexOf("competency_text"),
        areaC = h.indexOf("strand"), activeC = h.indexOf("active");
      const seen = {};
      for (let i = 1; i < data.length; i++) {
        const id = String(data[i][idC] || "").trim();
        const course = id.split("-")[0];
        if (!id || seen[id] || !byCourse[course]) continue;
        if (activeC !== -1 && String(data[i][activeC]).trim().toUpperCase() === "FALSE") continue;
        seen[id] = true;
        byCourse[course].push({ id: id, task: Number(id.split("-")[1]) || 0,
          text: String(data[i][textC] || "").trim(), area: areaC === -1 ? "" : String(data[i][areaC] || "").trim() });
      }
    }
    const totals = competencyCourseTotals_(ss, cfg);
    const done = {};
    competencyCompletionFor_(ratingList, totals, codes)
      .forEach(function (c) { done[c.course] = c; });

    const courses = codes.map(function (code) {
      const areas = [];
      const areaOf = {};
      byCourse[code].sort(function (a, b) { return a.task - b.task; }).forEach(function (c) {
        const list = (evidence[c.id] || []).slice().sort(function (a, b) {
          return (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0);
        });
        const best = {};
        list.forEach(function (e) {
          const k = e.configId || "?";
          if (!best[k] || DASH_EVIDENCE_RANK[e.outcome] > DASH_EVIDENCE_RANK[best[k].outcome]) best[k] = e;
        });
        const rated = ratings[c.id];
        const item = {
          id: c.id, task: c.task, text: c.text,
          rating: rated ? Number(rated.rating) : null,
          ratedAt: rated && rated.decidedAt ? Utilities.formatDate(rated.decidedAt, tz, "MMM d, yyyy") : "",
          retry: retryFor[c.id] || null,
          evidence: list.map(function (e) {
            return { assignment: own.assignmentOf[e.configId] || "An assignment", milestone: e.milestone,
              outcome: DASH_EVIDENCE_WORDS[e.outcome], outcomeKey: e.outcome,
              date: e.at ? Utilities.formatDate(e.at, tz, "MMM d") : "", counts: best[e.configId || "?"] === e,
              atMs: e.at ? e.at.getTime() : 0, lessonKey: _dashLessonKeyOf_(assignmentOf[e.configId]) };
          }),
          // F17: the lessons that practice it, with the student's words there.
          lessons: _dashCompetencyLessons_(c.id),
          // Q26: shown through DECA or work-based learning, not lessons.
          outside: competencyOutsideLessons_(c.id),
          outsideLabel: OUTSIDE_LESSONS_LABEL[competencyOutsideLessons_(c.id)] || "",
          outsideNote: OUTSIDE_LESSONS_NOTE[competencyOutsideLessons_(c.id)] || "",
        };
        const area = c.area || "Other";
        if (!areaOf[area]) { areaOf[area] = { name: area, items: [] }; areas.push(areaOf[area]); }
        areaOf[area].items.push(item);
      });
      const d = done[code] || { done: 0, total: totals[code] || 0 };
      return { code: code, className: own.courses[code], done: d.done, total: d.total, areas: areas,
        coveredUrl: _dashCoveredUrl_(code) };
    });
    const term = _dashTermScope_(new Date());
    return { success: true, courses: courses, term: term, termLabel: term ? termLabel_(term) : "",
      termStart: term ? _dashTermStartMs_(term, _dashMarkingPeriodRaw_()) : 0 };
  } catch (e) {
    Logger.log("[S13] getMyCompetencies failed: " + e.message);
    return { success: false, error: "Your competencies could not be loaded. Try again in a minute." };
  }
}

// Every warm-up before today, newest first, as the card shows it (score,
// feedback, the question and the answer), with nothing left to answer.
const DASH_WARMUP_HISTORY_MAX = 200;
function getMyWarmUpHistory() {
  const email = String(Session.getActiveUser().getEmail() || "").trim();
  if (!email) return { success: false, error: "Could not identify your Google account." };
  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const tz = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    const past = _dashOwnWarmUps_(ss, cfg, email, tz).list
      .filter(function (w) { return w.lessonDate < today; })
      .reverse().slice(0, DASH_WARMUP_HISTORY_MAX);
    return { success: true, warmUps: past.map(function (w) { return _dashWarmUpView_(w, tz, today, null); }) };
  } catch (e) {
    Logger.log("[S13] getMyWarmUpHistory failed: " + e.message);
    return { success: false, error: "Your warm-ups could not be loaded. Try again in a minute." };
  }
}

// A Student Context doc's weeks, newest first: the twin of 07's
// _tdContextWeeks_ (a test keeps the two the same). each "Week of <date>" Heading 2
// (29's appendWeeklySection_) starts one; its Heading 3 sections and lines
// follow as items. Anything before the first week is left out. bookmark:
// the week's bookmark id, for a link straight to it ("" for none).
const DASH_CONTEXT_MAX_WEEKS = 60;
function _dashContextWeeks_(docId) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  // Each week's bookmark (29), by its heading's text: the link to that week.
  const marks = {};
  doc.getBookmarks().forEach(function (b) {
    let el = b.getPosition().getElement();
    if (el.getType() === DocumentApp.ElementType.TEXT) el = el.getParent();
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) return;
    const label = String(el.asParagraph().getText() || "").trim();
    if (label.indexOf("Week of ") === 0 && !marks[label]) marks[label] = b.getId();
  });
  const weeks = [];
  let week = null;
  for (let i = 0; i < body.getNumChildren(); i++) {
    const el = body.getChild(i);
    const type = el.getType();
    let p = null;
    if (type === DocumentApp.ElementType.PARAGRAPH) p = el.asParagraph();
    else if (type === DocumentApp.ElementType.LIST_ITEM) p = el.asListItem();
    if (!p) continue;
    const text = String(p.getText() || "").trim();
    const heading = p.getHeading();
    if (heading === DocumentApp.ParagraphHeading.HEADING2 && text.indexOf("Week of ") === 0) {
      week = { label: text, bookmark: marks[text] || "", items: [] };
      weeks.push(week);
      continue;
    }
    if (!week || !text) continue;
    // A list item (weeks from 2026-11-19 on: an assignment, a part nested
    // under its lesson) carries its level; a paragraph has none.
    const item = { text: text, heading: heading === DocumentApp.ParagraphHeading.HEADING3 };
    if (type === DocumentApp.ElementType.LIST_ITEM) item.level = p.getNestingLevel ? p.getNestingLevel() : 0;
    week.items.push(item);
  }
  return weeks.reverse().slice(0, DASH_CONTEXT_MAX_WEEKS);
}

// The student's Student Context doc (29, weekly) by week, newest first.
function getMyContext() {
  const email = String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!email) return { success: false, error: "Could not identify your Google account." };
  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const doc = studentContextDocFor_(ss, cfg, email);
    if (!doc || !doc.docId) return { success: true, context: null };
    return { success: true, context: { docUrl: doc.docUrl,
      lastUpdatedAt: doc.lastUpdatedAt ? formatDate_(doc.lastUpdatedAt) : "", weeks: _dashContextWeeks_(doc.docId) } };
  } catch (e) {
    Logger.log("[S13] getMyContext failed: " + e.message);
    return { success: false, error: "Your Student Context could not be loaded. Try again in a minute." };
  }
}

// closesOn: "YYYY-MM-DD", the last day the student's last warm-up stays
// open; null for any other warm-up.
function _dashWarmUpView_(w, tz, today, closesOn) {
  const status = String(w.row[DASH_WQ_STATUS] || "").trim();
  const tbRow = w.tb ? w.tb.row : null;
  let course = "";
  try { course = String(JSON.parse(String(w.row[DASH_WQ_LESSON_SNAP] || "{}")).course_name || ""); }
  catch (e) { /* a snapshot that doesn't parse just leaves the course off */ }
  const answer = tbRow ? String(tbRow[WTB.RESPONSE] || "") : "";
  const answered = answer.trim() !== "";
  const open = !!closesOn && today <= closesOn;
  // Late: answered after its lesson day (the save time says so), or not
  // answered on its day and still open for a late answer. A late answer is
  // scored, but its feedback isn't shown and it earns no extra credit.
  const savedLate = !!tbRow && !!tbRow[WTB.SUBMITTED_AT] &&
    dashIsoDate_(tbRow[WTB.SUBMITTED_AT], tz) > w.lessonDate;
  const missed = !!tbRow && w.lessonDate < today &&
    (status === "INCOMPLETE" || (status === "DELIVERED" && (!answered || savedLate)));
  const late = savedLate || missed;
  const st = resolveWarmUpStatus_(status, w.lessonDate, today, !!tbRow, tbRow ? answered : null,
    Utilities.formatDate(_dashDayNoon_(w.lessonDate), tz, "EEE, MMM d"),
    { late: late, lateOpen: missed && open });
  const credited = Number(w.row[DASH_WQ_EXTRA_CREDIT] || 0) === 1;
  const ecOpen = open && status === "SCORED" && !credited && !late;
  const closesLabel = closesOn ? Utilities.formatDate(_dashDayNoon_(closesOn), tz, "EEE, MMM d") : "";
  return {
    queueId:       w.queueId,
    dateLabel:     Utilities.formatDate(_dashDayNoon_(w.lessonDate), tz, "EEE, MMM d"),
    isToday:       w.lessonDate === today,
    // When the answer box closes: the end of the lesson day, or of the
    // last day a late answer is taken.
    openUntil:     missed ? Utilities.formatDate(_dashDayNoon_(closesOn || w.lessonDate), tz, "EEE") : "the day",
    late:          late,
    course:        course,
    textBox:       !!tbRow,
    docUrl:        w.docId ? "https://docs.google.com/document/d/" + w.docId + "/edit" : null,
    displayStatus: st.displayStatus,
    statusClass:   st.statusClass,
    bridge:        tbRow ? String(tbRow[WTB.BRIDGE] || "") : "",
    warmup:        tbRow ? String(tbRow[WTB.WARMUP] || "") : "",
    answer:        answer,
    savedAt:       tbRow && tbRow[WTB.SUBMITTED_AT] ? formatDate_(tbRow[WTB.SUBMITTED_AT]) : null,
    canAnswer:     !!tbRow && ((status === "DELIVERED" && w.lessonDate === today) || (missed && open)),
    feedback:      status === "SCORED" && !late ? String(w.row[DASH_WQ_FEEDBACK] || "") : "",
    // Shown with the feedback, by the operator's choice (2026-10-17): the
    // score out of 10 and its parts, extra credit added on top.
    score: status === "SCORED" ? {
      points:     Number(w.row[DASH_WQ_TOTAL] || 0) - (credited ? 1 : 0),
      max:        DASH_SCORE_MAX,
      // Each part's maximum (finding 13): 25's word-count thresholds (30+
      // words for 6) and 41's grammar and engagement ranges.
      lengthMax:     6,
      grammarMax:    1,
      engagementMax: 3,
      length:     Number(w.row[DASH_WQ_LENGTH] || 0),
      grammar:    Number(w.row[DASH_WQ_GRAMMAR] || 0),
      engagement: Number(w.row[DASH_WQ_ENGAGEMENT] || 0),
      extra:      credited ? 1 : 0
    } : null,
    extraCredit: {
      credited:  credited,
      open:      ecOpen,
      byLabel:   closesLabel,
      minWords:  DASH_EC_MIN_WORDS,
      reply:     tbRow ? String(tbRow[WTB.REPLY] || "") : "",
      canReply:  ecOpen && !!tbRow
    }
  };
}

// A lesson date read from the sheet is a Date or "YYYY-MM-DD" text.
function dashIsoDate_(v, tz) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, tz, "yyyy-MM-dd");
  }
  const m = String(v || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : "";
}

// Same statusClass names (and colors) as the assignment cards. `answered` is
// true or false for a text-box warm-up and null for a doc one, whose text
// the dashboard doesn't read; `dateLabel` names a later day's warm-up.
// opts.late: answered (or still answerable) after its day; opts.lateOpen:
// not answered on its day and still open for a late answer.
function resolveWarmUpStatus_(status, lessonDate, today, textBox, answered, dateLabel, opts) {
  const where = textBox ? "below" : "in your doc";
  const late = !!(opts && opts.late);
  const lateOpen = !!(opts && opts.lateOpen);
  if (lateOpen && !answered) {
    return { displayStatus: "Not answered — you can still answer it", statusClass: "NEEDS_ACTION" };
  }
  if (late && answered && (status === "DELIVERED" || status === "INCOMPLETE")) {
    return { displayStatus: "Answered late — checked overnight", statusClass: "IN_PROGRESS" };
  }
  switch (status) {
    case "DELIVERED":
      // Walk-through finding 9: a later day's warm-up isn't due today, and
      // it opens on its own day (2026-10-24).
      if (lessonDate > today) {
        return { displayStatus: "Opens " + (dateLabel || lessonDate), statusClass: "NOT_STARTED" };
      }
      if (lessonDate === today) return { displayStatus: "Ready — answer today", statusClass: "NEEDS_ACTION" };
      // Finding 15: a blank past answer isn't waiting for anything.
      return answered === false
        ? { displayStatus: "Not answered", statusClass: "NOT_STARTED" }
        : { displayStatus: "Waiting to be checked", statusClass: "IN_PROGRESS" };
    case "PENDING_EVAL":
    case "EVAL_ERROR":
      return { displayStatus: "Being checked — your work is saved", statusClass: "IN_PROGRESS" };
    case "SCORED":
      return late
        ? { displayStatus: "Checked — answered late, so no feedback", statusClass: "DONE" }
        : { displayStatus: "Checked — feedback is " + where, statusClass: "DONE" };
    case "INCOMPLETE":
      return { displayStatus: "No response was written", statusClass: "NOT_STARTED" };
    default:
      return { displayStatus: "Open your warm-up", statusClass: "NOT_STARTED" };
  }
}

// Called from the page: save the answer to a warm-up, or the extra-credit
// reply to its feedback. Only the signed-in student's own warm-up, only a
// text-box one, and only while it is open. Saving again replaces the text.
function submitWarmUpAnswer(queueId, text) {
  return _dashWarmUpSave_(queueId, text, "answer");
}

function submitWarmUpReply(queueId, text) {
  return _dashWarmUpSave_(queueId, text, "reply");
}

function _dashWarmUpSave_(queueId, text, kind) {
  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) return { ok: false, error: "Could not identify your Google account. Sign in and try again." };
  const max = kind === "answer" ? DASH_ANSWER_MAX : DASH_REPLY_MAX;
  const t = String(text || "").trim();
  if (!t) return { ok: false, error: kind === "answer" ? "Write your answer first." : "Write your reply first." };
  if (t.length > max) return { ok: false, error: "That's too long: keep it under " + max + " characters." };
  // The same check as Submit (P0-03): text the system writes would reach
  // Flow 4's prompt as its own. Only the matched token goes back.
  const systemText = findSystemText_(t);
  if (systemText) return { ok: false, error: "Your text includes \"" + systemText + "\", which the system writes. Delete it and save again." };

  // Which warm-up, and whether it is open, are read before the lock: the
  // whole WarmUpQueue and WarmUpTextBox reads took the lock with them, so a
  // class saving at once queued behind each other (walk-through finding 20,
  // 2026-10-28). The lock covers only the one row's check and write.
  const cfg = getConfig_();
  const ss  = SpreadsheetApp.openById(cfg.ledgerSsId);
  const now = new Date();
  const pair = _dashWarmUpPair_(ss, cfg, googleId, now);
  const w = pair.own.filter(function (x) { return x.queueId === String(queueId); })[0];
  if (!w || !w.tb) return { ok: false, error: "That warm-up wasn't found. Refresh the page." };
  // Only the current warm-up and the last one can be open.
  const hit = [pair.current, pair.previous].filter(function (p) { return p && p.w.queueId === w.queueId; })[0];
  const view = hit ? hit.view : { canAnswer: false, extraCredit: { canReply: false } };
  if (kind === "answer" && !view.canAnswer) return { ok: false, error: "This warm-up is closed." };
  if (kind !== "answer" && !view.extraCredit.canReply) {
    return { ok: false, error: "The extra-credit window for this warm-up has closed." };
  }
  const sheet = ss.getSheetByName(cfg.tabs.warmUpTextBox);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "The system is busy. Try again in a minute." };
  try {
    // The row read above is still this warm-up's (a nightly job may have
    // added or moved rows since).
    if (String(sheet.getRange(w.tb.sheetRow, WTB.QUEUE_ID + 1).getValue()).trim() !== w.queueId) {
      return { ok: false, error: "That warm-up moved while you were writing. Refresh the page; your text is still in the box." };
    }
    const col = kind === "answer" ? WTB.RESPONSE : WTB.REPLY;
    sheet.getRange(w.tb.sheetRow, col + 1, 1, 2).setValues([[sheetSafeText_(t), now]]);
    return { ok: true, savedAt: formatDate_(now) };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// doPost — the student doc's menu (01_StudentDoc_ContainerScript.js) calls
// this instead of opening the Ledger itself.
//
// Access policy: the doc's menu runs as the student, so it used to read the
// whole Ledger and append to the Admin sheet's ReviewQueue with the
// student's own permissions. That only worked if every student could read
// the Ledger (every student's rows) and edit the Admin spreadsheet. This
// project runs as the admin (appsscript.json: executeAs USER_DEPLOYING,
// access DOMAIN), so the Ledger can stay admin-only. The caller is whoever
// Google says is signed in, never an email in the request, and they only
// get back or act on the one Ledger row for their own doc.
//
// Request body (JSON): { action: "status" | "submit", fileId, configId, hasText? }
//
// A submit never carries or stores the student's writing: Flow 2 reads it
// from the student's own Doc, and nothing reads ReviewQueue's StudentText
// column. Docs made before this send `text` instead of `hasText`; it is
// checked for being non-empty and then dropped, never written.
// Response (JSON): { ok: true, info } | { ok: true } | { ok: false, error }
// ---------------------------------------------------------------------------
function doPost(e) {
  const googleId = Session.getActiveUser().getEmail();
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (_) {}
  const result = handleStudentDocRequest_(googleId, req);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleStudentDocRequest_(googleId, req) {
  if (!googleId) return { ok: false, error: "NO_USER" };
  const fileId   = String((req && req.fileId)   || "").trim();
  const configId = String((req && req.configId) || "").trim();
  const action   = String((req && req.action)   || "");
  if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };
  if (action !== "status" && action !== "submit") return { ok: false, error: "BAD_ACTION" };

  const cfg = getConfig_();
  const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
  if (!row) return { ok: false, error: "NOT_REGISTERED" };

  if (action === "status") {
    return {
      ok: true,
      info: {
        status:      String(row[LEDGER.STATUS]).trim(),
        // Dates and the term in words the doc can show as is (2026-10-22):
        // the doc menu printed the raw Date string and "2627_MP1".
        submittedAt: row[LEDGER.SUBMISSION_TS] ? formatDate_(row[LEDGER.SUBMISSION_TS]) : null,
        lastEval:    row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : null,
        lastResult:  String(row[LEDGER.LAST_RESULT] || "").trim(),
        unitCode:    String(row[LEDGER.COURSE_NAME]).trim(),
        teacherName: String(row[LEDGER.TEACHER_NAME] || "").trim(),
        term:        termLabel_(row[LEDGER.ACADEMIC_YEAR])
      }
    };
  }

  // A form, Slides or Sheets part is checked only by the dashboard's Submit (Phase
  // 4b/4c, 75/77): it has no doc menu, and this path doesn't read the work.
  if (workFileHasSnapshot_(workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL]))) return { ok: false, error: "USE_DASHBOARD" };
  const hasText = (req && req.hasText === true) || !!String((req && req.text) || "").trim();
  if (!hasText) return { ok: false, error: "EMPTY" };
  // The doc menu can't ask the reflection questions, so with them on the
  // student submits from the dashboard (2026-10-24).
  if (pivotFlagFor_("REFLECTION_ON_SUBMIT", ledgerRowCourseCode_(row))) {
    return { ok: false, error: "USE_DASHBOARD" };
  }
  const queued = queueSubmission_(cfg, googleId, fileId, configId);
  return queued.ok ? { ok: true } : queued;
}

// The signed-in student's Ledger row for this doc, or null. All three must
// match, so a student can only ever reach their own row.
function findOwnLedgerRow_(cfg, googleId, fileId, configId) {
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][LEDGER.GOOGLE_ID]).toLowerCase() === googleId.toLowerCase() &&
        String(data[i][LEDGER.CONFIG_ID]) === configId &&
        String(data[i][LEDGER.FILE_ID])   === fileId) return data[i];
  }
  return null;
}

// feedbackDocId: where the header's "waiting for feedback" goes when it
// isn't the work file itself (a form, deck or sheet's snapshot doc, Phase 4b/4c).
function queueSubmission_(cfg, googleId, fileId, configId, feedbackDocId) {
  const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
  if (!queue) return { ok: false, error: "NO_QUEUE" };
  // Column 5 (StudentText) stays empty; see the header comment above.
  const now = new Date();
  queue.appendRow([now, googleId, fileId, configId, "", "PENDING", ""]);
  stampSubmissionTs_(cfg, googleId, fileId, configId, now);
  setDocFeedbackStatus_(feedbackDocId || fileId, "CHECKING", { when: now }); // the doc's header (63)
  return { ok: true, at: now };
}

// The Ledger's SubmissionTS: when the student last submitted this work. Both
// dashboards show it. Best effort: the queued row is what counts, so a
// failure here is logged and the submit still succeeds.
function stampSubmissionTs_(cfg, googleId, fileId, configId, when) {
  try {
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(cfg.tabs.ledger);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][LEDGER.GOOGLE_ID]).toLowerCase() === googleId.toLowerCase() &&
          String(data[i][LEDGER.CONFIG_ID]) === configId &&
          String(data[i][LEDGER.FILE_ID])   === fileId) {
        sheet.getRange(i + 1, LEDGER.SUBMISSION_TS + 1).setValue(when);
        return;
      }
    }
  } catch (e) {
    Logger.log("[S13] SubmissionTS not written for " + configId + ": " + e.message);
  }
}

// ---------------------------------------------------------------------------
// submitMyWork — the dashboard's "Submit for Feedback" button
//
// The doc's own menu (01) runs as the student, and the district turns Apps
// Script off for student accounts: on 2026-10-08 the teacher saw the menu
// on a student's doc and the student didn't. This page runs as the admin,
// so it can do the menu's check-and-submit itself: it reads the student's
// doc, applies the menu's minimums, and queues the same ReviewQueue row.
// The writing is read only to count it. It is never returned or stored.
// Returns { ok: true, aiFlowsLive, feedbackInComments } or
// { ok: false, error, words?, found? }.
// ---------------------------------------------------------------------------
const DASH_RESPONSE_MARKER    = "── YOUR RESPONSE BEGINS HERE ──"; // 01's RESPONSE_MARKER
const DASH_MIN_RESPONSE_CHARS = 150; // 01's MIN_RESPONSE_CHARS
const DASH_MIN_RESPONSE_WORDS = 25;  // 01's MIN_RESPONSE_WORDS
// Ledger statuses with nothing to submit: already queued, already turned in,
// or retired.
// A ReviewQueue row in these states is a submission not yet evaluated.
const DASH_OPEN_QUEUE_STATUSES = { PENDING: true, STAGED: true };

// fileId -> true for every student file with an open ReviewQueue row. The
// queue lives in the admin spreadsheet; if it can't be read the dashboard
// shows statuses from the Ledger alone, as before.
function dashQueuedFileIds_(cfg) {
  const out = {};
  try {
    const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
    if (!queue) return out;
    queue.getDataRange().getValues().slice(1).forEach(r => {
      const fid = String(r[2]).trim();
      if (fid && DASH_OPEN_QUEUE_STATUSES[String(r[5]).trim()]) out[fid] = true;
    });
  } catch (e) {
    Logger.log("[Dashboard] ReviewQueue unreadable: " + e.message);
  }
  return out;
}

const DASH_NO_SUBMIT_STATUSES = {
  PENDING: "ALREADY_QUEUED", STAGED: "ALREADY_QUEUED",
  PENDING_TEACHER_REVIEW: "ALREADY_TURNED_IN", COMPLIANT: "ALREADY_TURNED_IN",
  ARCHIVED: "NOT_REGISTERED", SCHEDULED: "NOT_OPEN_YET"
};

function submitMyWork(fileId, configId, answers) {
  // Anything thrown used to reach the page as a failed call, which shows
  // "didn't answer… try again" and was recorded nowhere but Executions
  // (the second failed submission, 2026-10-15). Caught here, it is counted
  // in SubmitFailures like the other system-side failures and the student
  // is told to tell the teacher.
  try {
    return _dashSubmit_(fileId, configId, answers);
  } catch (e) {
    Logger.log("submitMyWork: unexpected error for ConfigID " + String(configId || "").trim() + ": " + e.message);
    let cfg = null;
    try { cfg = getConfig_(); } catch (e2) { /* no config: nothing to record it in */ }
    if (cfg) dashRecordFailure_(cfg, "SERVER_ERROR");
    return { ok: false, error: "SERVER_ERROR" };
  }
}

// The process reflection (00, REFLECTION_ON_SUBMIT): the dashboard asks
// for the questions first (getSubmitReflection), shows them on the card, and
// sends the answers with the submit. The server chooses the questions again
// and checks the answers against them, so a page can't pick its own. The
// answers go to ReflectionLog before the work is queued; if that write
// fails the work still goes in (the failure is counted in SubmitFailures).
function getSubmitReflection(fileId, configId) {
  try {
    const checked = _dashSubmitChecks_(fileId, configId);
    if (!checked.ok) return checked;
    return { ok: true, questions: _dashReflectionQuestions_(checked) };
  } catch (e) {
    Logger.log("getSubmitReflection: unexpected error for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

// [] when the reflection is off for this student's course.
function _dashReflectionQuestions_(checked) {
  if (!pivotFlagFor_("REFLECTION_ON_SUBMIT", ledgerRowCourseCode_(checked.row))) return [];
  const cfg = checked.cfg;
  let criteria = [];
  try {
    criteria = reflectionCriteria_(reflectionMatrixRow_(cfg, checked.configId,
      String(checked.row[LEDGER.TEACHER_EMAIL] || "")));
  } catch (e) {
    // Without the assignment's competencies the questions are still asked,
    // just without one that names a competency.
    Logger.log("[Reflection] TeacherMatrix not read for ConfigID " + checked.configId + ": " + e.message);
  }
  const ledgerSs = SpreadsheetApp.openById(cfg.ledgerSsId);
  const prior = readReflections_(ledgerSs, cfg, checked.configId, checked.fileId);
  // A resubmission after the primary wasn't met gets a Feedback question
  // (Phase 2, 2026-10-27).
  let shortfall = null;
  try {
    shortfall = prior.length ? reflectionShortfall_(ledgerSs, cfg, checked.fileId, criteria) : null;
  } catch (e) {
    Logger.log("[Reflection] CompetencyEvidence not read for ConfigID " + checked.configId + ": " + e.message);
  }
  return chooseReflectionQuestions_(criteria, prior, checked.configId, shortfall).map(function (q) {
    return { frameId: q.frameId, kind: q.kind, competencyId: q.competencyId, question: q.question, goal: q.goal || "", goalLabel: q.goalLabel || "" };
  });
}

function _dashSubmit_(fileId, configId, answers) {
  const checked = _dashSubmitChecks_(fileId, configId);
  if (!checked.ok) return checked;
  const cfg = checked.cfg, googleId = checked.googleId;
  fileId = checked.fileId;
  configId = checked.configId;

  const questions = _dashReflectionQuestions_(checked);
  let reflectionRows = [];
  if (questions.length) {
    const given = Array.isArray(answers) ? answers : [];
    const matches = given.length === questions.length && questions.every(function (q, i) {
      return given[i] && String(given[i].frameId) === q.frameId &&
             String(given[i].competencyId || "") === q.competencyId;
    });
    if (!matches) return { ok: false, error: "REFLECTION_NEEDED", questions: questions };
    const texts = given.map(function (g) { return String(g.answer || "").trim(); });
    if (texts.some(function (t) { return reflectionWordCount_(t) < REFLECTION_MIN_WORDS; })) {
      return { ok: false, error: "REFLECTION_SHORT", minWords: REFLECTION_MIN_WORDS };
    }
    const found = texts.map(findSystemText_).filter(Boolean)[0];
    if (found) return { ok: false, error: "SYSTEM_TEXT_IN_REFLECTION", found: found };
    reflectionRows = questions.map(function (q, i) {
      return [null, googleId, configId, fileId, q.kind, q.frameId, q.competencyId, reflectionQuestionText_(q), texts[i]];
    });
  }

  // The answers go in before the queue row, so 37 finds them when it builds
  // the Flow 2 input a minute later. Their time is the submission's.
  const now = new Date();
  // A form, Slides or Sheets part (Phase 4b/4c/4d): the snapshot of the file as
  // checked goes into its snapshot doc before the reflection and the queue
  // row, so Flow 2 reads what passed the exact checks. If it can't be
  // written, nothing is saved or queued.
  const work = checked.work;
  if (work) {
    try {
      writeFormSnapshot_(work.snapshotDocId, work.reader.text(work.structure));
      _dashStampSnapshot_(cfg, work.snapshotRow, now);
    } catch (e) {
      Logger.log("submitMyWork: " + work.type + " snapshot not written for ConfigID " + configId + ": " + e.message);
      dashRecordFailure_(cfg, work.reader.code + "_SNAPSHOT_UNWRITABLE");
      return { ok: false, error: work.reader.code + "_SNAPSHOT_UNWRITABLE" };
    }
  }

  if (reflectionRows.length) {
    try {
      reflectionRows.forEach(function (r) { r[0] = now; });
      appendReflections_(SpreadsheetApp.openById(cfg.ledgerSsId), cfg, reflectionRows);
    } catch (e) {
      Logger.log("submitMyWork: reflection not saved for ConfigID " + configId + ": " + e.message);
      dashRecordFailure_(cfg, "REFLECTION_NOT_SAVED");
    }
  }

  const res = queueSubmission_(cfg, googleId, fileId, configId, work ? work.snapshotDocId : "");
  if (!res.ok) return res;
  Logger.log("Dashboard submission — ConfigID: " + configId + (work ? " | " + work.type : "") +
             (reflectionRows.length ? " | reflection: " + reflectionRows.length + " answer(s)" : ""));
  return { ok: true, aiFlowsLive: !!cfg.aiFlowsLive, feedbackInComments: feedbackAsCommentFor_(configId),
           reflected: reflectionRows.length > 0, workType: work ? work.type : "doc" };
}

// Everything Submit checks before anything is asked or written: the
// student, their row, an open queue row, and enough writing in the doc, or
// for a form, Slides or Sheets part (Phase 4b/4c/4d) its exact checks (_dashWorkChecks_).
// { ok: true, cfg, googleId, row, fileId, configId } or { ok: false, error }.
function _dashSubmitChecks_(fileId, configId) {
  const googleId = Session.getActiveUser().getEmail();
  if (!googleId) return { ok: false, error: "NO_USER" };
  fileId   = String(fileId   || "").trim();
  configId = String(configId || "").trim();
  if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };

  const cfg = getConfig_();
  const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
  if (!row) return { ok: false, error: "NOT_REGISTERED" };
  const blocked = DASH_NO_SUBMIT_STATUSES[String(row[LEDGER.STATUS]).trim()];
  if (blocked) return { ok: false, error: blocked };

  // A second click before the queue bridge picks up the first: the bridge
  // would mark it DUPLICATE anyway, but the student should hear why.
  const queue = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.reviewQueue);
  if (!queue) {
    Logger.log("submitMyWork: ReviewQueue tab not found in ADMIN_SS_ID for ConfigID " + configId);
    dashRecordFailure_(cfg, "NO_QUEUE");
    return { ok: false, error: "NO_QUEUE" };
  }
  // Columns 2 and 5 are 03's RQ_FILE_ID and RQ_STATUS. STAGED is still in
  // line: the bridge has taken it but no evaluation has landed. A second
  // submit then used to pass and stamp a new SubmissionTS.
  const pending = queue.getDataRange().getValues().slice(1).some(r =>
    String(r[2]).trim() === fileId && DASH_OPEN_QUEUE_STATUSES[String(r[5]).trim()]);
  if (pending) return { ok: false, error: "ALREADY_QUEUED" };

  // A form, Slides or Sheets part (Phase 4b/4c/4d): the file's structure, read and
  // checked (75, 77).
  const workType = workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL]);
  if (workFileHasSnapshot_(workType)) {
    const work = _dashWorkChecks_(cfg, fileId, configId, workType);
    if (!work.ok) return work;
    return { ok: true, cfg: cfg, googleId: googleId, row: row, fileId: fileId, configId: configId, work: work };
  }

  let fullText;
  try {
    fullText = DocumentApp.openById(fileId).getBody().getText();
  } catch (e) {
    // A permission message here means the deploying account hasn't approved
    // the manifest's documents scope (2026-10-15): every student fails the
    // same way until the admin runs a function from the editor and approves.
    Logger.log("submitMyWork: couldn't open doc for ConfigID " + configId + ": " + e.message);
    dashRecordFailure_(cfg, "DOC_UNREADABLE");
    return { ok: false, error: "DOC_UNREADABLE" };
  }
  if (fullText.indexOf(DASH_RESPONSE_MARKER) === -1) return { ok: false, error: "NO_RESPONSE_SECTION" };
  const text  = dashExtractResponse_(fullText);
  const words = text ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
  if (text.length < DASH_MIN_RESPONSE_CHARS || words < DASH_MIN_RESPONSE_WORDS) {
    return { ok: false, error: "TOO_SHORT", words: words };
  }
  // P0-03: a pasted feedback stamp or submission delimiter would reach
  // Flow 2's prompt as system text. Only the matched token goes back, never
  // the student's writing.
  const systemText = findSystemText_(text);
  if (systemText) return { ok: false, error: "SYSTEM_TEXT_IN_RESPONSE", found: systemText };

  return { ok: true, cfg: cfg, googleId: googleId, row: row, fileId: fileId, configId: configId };
}

// The reader for each work file type with a snapshot: its error-code prefix
// and its four steps (read the structure, the exact checks' reasons, system
// text, the snapshot text). A form's in 75 (Phase 4b), a deck's in 77 (4c),
// a sheet's in 78 (4d).
function _dashWorkReader_(type) {
  if (type === "form") {
    return { code: "FORM", read: readFormStructure_, reasons: formCheckReasons_,
      systemText: formSystemText_, text: formSnapshotText_ };
  }
  if (type === "slides") {
    return { code: "SLIDES", read: readSlidesStructure_, reasons: slidesCheckReasons_,
      systemText: slidesSystemText_, text: slidesSnapshotText_ };
  }
  if (type === "sheet") {
    return { code: "SHEET", read: readSheetStructure_, reasons: sheetCheckReasons_,
      systemText: sheetSystemText_, text: sheetSnapshotText_ };
  }
  return null;
}

// A form, Slides or Sheets part's Submit checks (Phase 4b/4c/4d): its snapshot doc on
// record (00's FormSnapshots), the file's structure read (75/77; a form's
// never its responses), the part's exact checks, and no system text.
// { ok: true, type, reader, snapshotDocId, snapshotRow, structure } or
// { ok: false, error, reasons? / found? }. Error codes start with the
// type's ("FORM_NOT_YET", "SLIDES_UNREADABLE"). The exact checks' failure
// is the student's to fix ("Not yet", with reasons) and is not a system
// failure; the others are counted as one.
function _dashWorkChecks_(cfg, fileId, configId, type) {
  const reader = _dashWorkReader_(type);
  let snap;
  try {
    snap = formSnapshotFor_(SpreadsheetApp.openById(cfg.ledgerSsId), fileId);
  } catch (e) {
    snap = null;
  }
  if (!snap) {
    Logger.log("submitMyWork: no FormSnapshots row for the " + type + " of ConfigID " + configId);
    dashRecordFailure_(cfg, reader.code + "_SNAPSHOT_MISSING");
    return { ok: false, error: reader.code + "_SNAPSHOT_MISSING" };
  }
  let structure;
  try {
    structure = reader.read(fileId, snap.checksRaw); // a deck's reader reads colors only when a check needs them
  } catch (e) {
    // A permission message here means the deploying account hasn't approved
    // the forms or presentations scope since it was pushed (cas-ccps/README.md,
    // work types). reportDeployVersion (49) names a missing one (11-19).
    Logger.log("submitMyWork: couldn't open the " + type + " for ConfigID " + configId + ": " + e.message);
    dashRecordFailure_(cfg, reader.code + "_UNREADABLE");
    return { ok: false, error: reader.code + "_UNREADABLE" };
  }
  const reasons = reader.reasons(structure, snap.checksRaw);
  if (reasons.length) return { ok: false, error: reader.code + "_NOT_YET", reasons: reasons };
  const found = reader.systemText(structure);
  if (found) return { ok: false, error: "SYSTEM_TEXT_IN_RESPONSE", found: found };
  return { ok: true, type: type, reader: reader, snapshotDocId: snap.snapshotDocId, snapshotRow: snap.rowNumber,
    structure: structure };
}

// FormSnapshots' LastWrittenAt: when the snapshot was last rewritten. Best
// effort, like SubmissionTS.
function _dashStampSnapshot_(cfg, rowNumber, when) {
  try {
    const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName(FORM_SNAPSHOTS_TAB);
    if (sheet && rowNumber >= 2) sheet.getRange(rowNumber, FS.LAST_WRITTEN_AT + 1).setValue(when);
  } catch (e) {
    Logger.log("[S13] FormSnapshots LastWrittenAt not written: " + e.message);
  }
}

// One row per system-side failure (a doc the admin account can't open, a
// missing ReviewQueue tab): timestamp and error code, nothing about the
// student or the doc. The CAS attention signal (34b) counts these so a
// failure that hits every student shows up in the teacher's start brief, not
// only in this project's Executions log. A failure here is swallowed: it must
// never change what the student is told.
function dashRecordFailure_(cfg, code) {
  try {
    const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
    const name = cfg.tabs.submitFailures || "SubmitFailures";
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(["Timestamp", "Code"]);
    sheet.appendRow([new Date(), code]);
  } catch (e) {
    Logger.log("submitMyWork: couldn't record failure " + code + ": " + e.message);
  }
}

// Editor: Submit's read of every live form, deck and sheet (2026-11-19, the
// operator, after a student's Slides Submit failed: the dashboard's account
// had never been granted the Slides permission, and nothing said so until a
// student pressed Submit). Run it in the Student Dashboard's editor, as the
// account the dashboard runs as. For each student's form, deck or sheet that
// is shared and not archived, it does what Submit does before any feedback:
// finds the file's feedback page (FormSnapshots) and reads the file with its
// reader (75/77/78). Logs counts by type, then each failure's reason with
// its ConfigID (this log is the teacher's own) and the fix. Reads only;
// writes nothing, records no SubmitFailures row. Stops at a time budget and
// says how many it didn't reach.
const DASH_READ_CHECK_BUDGET_MS = 4.5 * 60 * 1000;
function checkWorkFileReads() {
  requireScriptOwner_();
  return _dashCheckWorkFileReads_(Date.now());
}

function _dashCheckWorkFileReads_(started) {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const ledger = ss.getSheetByName(cfg.tabs.ledger);
  const rows = ledger && ledger.getLastRow() > 1 ? ledger.getRange(2, 1, ledger.getLastRow() - 1, LEDGER_COL_COUNT).getValues() : [];
  const res = { checked: 0, ok: 0, notReached: 0, byType: {}, failures: [] };
  rows.forEach(function (r) {
    const status = String(r[LEDGER.STATUS]).trim();
    if (status === "ARCHIVED" || status === "SCHEDULED") return; // not shared with the student yet, or gone
    const type = workFileTypeOfUrl_(r[LEDGER.ADMIN_FILE_URL]);
    if (!workFileHasSnapshot_(type)) return;
    if (Date.now() - started > DASH_READ_CHECK_BUDGET_MS) { res.notReached++; return; }
    const fileId = String(r[LEDGER.FILE_ID]).trim();
    const configId = String(r[LEDGER.CONFIG_ID]).trim();
    const t = res.byType[type] = res.byType[type] || { checked: 0, ok: 0 };
    t.checked++;
    res.checked++;
    let snap = null;
    try { snap = formSnapshotFor_(ss, fileId); } catch (e) { snap = null; }
    if (!snap) {
      res.failures.push({ type: type, configId: configId, why: "NO_FEEDBACK_PAGE" });
      return;
    }
    try {
      _dashWorkReader_(type).read(fileId, snap.checksRaw);
      t.ok++;
      res.ok++;
    } catch (e) {
      res.failures.push({ type: type, configId: configId, why: _dashReadWhy_(e && e.message), message: String(e && e.message || e).slice(0, 160) });
    }
  });
  const label = { form: "forms", slides: "decks", sheet: "sheets" };
  Logger.log("[ReadCheck] " + (res.checked ? Object.keys(res.byType).map(function (k) {
    return label[k] + ": " + res.byType[k].ok + " of " + res.byType[k].checked + " read";
  }).join("; ") : "No shared form, deck or sheet to read.") + (res.notReached ? "; " + res.notReached + " not reached (time budget): run it again" : "") + ".");
  const fix = {
    PERMISSION: "The dashboard's account hasn't been granted this permission. Remove the project's access at " +
      "myaccount.google.com/connections, then run reportDeployVersion here and approve every permission.",
    NOT_FOUND: "The file is gone, or the dashboard's account can't open it: check it exists and is shared with that account.",
    NO_FEEDBACK_PAGE: "No FormSnapshots row (the feedback page made at intake): Submit says the file isn't set up. Repair it from the Central Ledger.",
    OTHER: "Something else: the message below says what.",
  };
  const groups = {};
  res.failures.forEach(function (f) { (groups[f.why] = groups[f.why] || []).push(f); });
  Object.keys(groups).forEach(function (why) {
    const g = groups[why];
    Logger.log("[ReadCheck] " + g.length + " can't be read: " + fix[why]);
    g.slice(0, 20).forEach(function (f) {
      Logger.log("[ReadCheck]   " + f.type + " for ConfigID " + f.configId + (f.message && why === "OTHER" ? ": " + f.message : ""));
    });
    if (g.length > 20) Logger.log("[ReadCheck]   … and " + (g.length - 20) + " more.");
  });
  if (res.checked && !res.failures.length) Logger.log("[ReadCheck] Every one read: Submit can check them.");
  return res;
}

// Why a read failed, in the four kinds the log groups.
function _dashReadWhy_(message) {
  const m = String(message || "");
  if (/do not have permission to call|Required permissions/i.test(m)) return "PERMISSION";
  if (/not found|Requested entity|no item with the given id|does not exist|You do not have permission to access|access denied/i.test(m)) return "NOT_FOUND";
  return "OTHER";
}

// Same span as 01's extractStudentResponse_(): from the line after the
// response marker to the first system marker. 01 isn't in this project,
// and a test holds the two to the same answers.
function dashExtractResponse_(fullText) {
  const start = fullText.indexOf(DASH_RESPONSE_MARKER);
  if (start === -1) return "";
  const from = fullText.indexOf("\n", start);
  if (from === -1) return "";
  const ends = [fullText.indexOf("[CONFIG_ID:"), fullText.indexOf("[SYS_LEDGER_SS_ID:")]
    .filter(n => n !== -1);
  const to = ends.length > 0 ? Math.min(...ends) : fullText.length;
  return fullText.substring(from, to).trim();
}

function resolveStudentStatus_(status, pipeline, feedbackInComments, lastResult) {
  // Plain words (2026-10-22), paired with the teacher dashboard's badges so
  // a student and teacher comparing notes mean the same stage: "Waiting for
  // feedback" / "Waiting to be checked", "Being checked now" on both, and
  // "Couldn't be checked" on both for an ERROR_* status (the system's
  // failure, not the student's work). The Terms panel explains each.
  // `pipeline` (from StagingPipeline, same lookup the teacher dashboard
  // uses) distinguishes actively-processing from merely-queued — without
  // it a student's work looked "Queued for evaluation…" the entire time
  // it was in the pipeline, even while the teacher's own dashboard already
  // showed EVALUATING NOW.
  if (pipeline === "IN_PROCESS") return "Being checked now…";
  // In line for its evaluation (submitted, not yet taken up): see
  // getStudentDashboardData's queuedFiles. Before 2026-10-22 a submitted
  // assignment read "Not started yet" here (walk-through finding 2).
  if (pipeline === "QUEUED" || pipeline === "PENDING_INFERENCE") return "Waiting for feedback…";
  switch (status) {
    case "ACTIVE":              return "Not started yet";
    case "PENDING": case "STAGED": return "Waiting for feedback…";
    case "COMPLETE": {
      // The latest evaluation's result (LEDGER.LAST_RESULT, written by 37)
      // says whether the work passed; until 2026-10-22 a passed assignment
      // read the same as one needing revision (finding 8).
      const where = feedbackInComments ? "open your document and click Comments" : "check your document";
      if (lastResult === "PASSED") return "Passed ✓ — feedback is ready: " + where;
      if (lastResult === "NEEDS_REVISION") return "Feedback ready — revise, then submit again: " + where;
      return "Feedback is ready: " + where;
    }
    // Where every passing turn-in lands (04_Form2_TurnInGate.js) until the
    // teacher confirms its score. It used to fall through to "Status
    // unavailable", flagged as an issue, on every submitted assignment.
    case "PENDING_TEACHER_REVIEW": return "Turned in — waiting for your teacher";
    case "COMPLIANT":           return "Done ✓ — your teacher confirmed it";
    // 03 emails the teacher for both (2026-10-22, UX audit fix-first 4), so
    // the student isn't told to report what the teacher already knows, and
    // a timeout isn't worded as the student's fault.
    // Plain words and a next step (2026-11-14): the card's Try again puts
    // it back in line (retryMyCheck).
    case "ERROR_TIMEOUT":       return "Check stopped ⚠ — it took too long. Your work is saved. Press Try again to put it back in line";
    case "ERROR_EVALUATION":    return "Couldn't be checked this time ⚠ — your teacher knows. You can submit again";
    default:
      // Never show a raw Ledger status string to a student — a blank cell
      // or an unrecognized/future status code both land here. ERROR-
      // prefixed statuses are real pipeline failures; anything else is
      // just unexpected/blank data, worded distinctly so a teacher can
      // tell the two apart when a student reports it.
      // FIXED: the teacher side keeps its ⚠ icon on FLAGGED (the one status
      // that most needs an attention-grabber); this dropped it.
      return status.startsWith("ERROR")
        ? "Couldn't be checked ⚠ — tell your teacher"
        : "Status unavailable — check with your teacher";
  }
}

// The line under the title: what displayStatus says after its " — ", or
// the whole of a status that is an instruction ("Feedback is ready: …").
// "" when the pill says it all ("Not started yet", "Being checked now…").
function studentStatusNote_(displayStatus) {
  const s = String(displayStatus || "");
  const i = s.indexOf(" — ");
  if (i !== -1) {
    const note = s.slice(i + 3);
    return note.charAt(0).toUpperCase() + note.slice(1);
  }
  return /^Feedback is ready/.test(s) ? s : "";
}

function resolveStudentClass_(status, pipeline, lastResult) {
  // Evaluating-now shares IN_PROGRESS's visual bucket (same pill/border
  // color) — the distinction is carried by displayStatus's text, not a
  // separate color, since it's still fundamentally "in progress" to a
  // student with no action to take.
  if (pipeline === "IN_PROCESS" || pipeline === "QUEUED" || pipeline === "PENDING_INFERENCE") return "IN_PROGRESS";
  switch (status) {
    case "ACTIVE":              return "NOT_STARTED";
    case "PENDING": case "STAGED": return "IN_PROGRESS";
    case "COMPLETE":            return lastResult === "PASSED" ? "DONE" : "NEEDS_ACTION";
    case "PENDING_TEACHER_REVIEW": return "IN_PROGRESS";
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
// getMyWaitingStatus — the page checks for news (2026-11-14, the operator's
// "Build 1-4", item 2)
//
// While at least one card waits (in line, being checked, or a turn-in
// answer being checked), the page asks this every 20 to 40 seconds, only
// while it is in view, and stops when nothing waits (the client half is
// below, "Checking for news"). It answers only for the caller's own cards:
// a card counts only when its Ledger row has the caller's account, its
// ConfigID and its file, the three findOwnLedgerRow_ (the submit path)
// matches; anything else is left out of the answer, never reported on.
//
// Much cheaper than getStudentDashboardData: one read of the Ledger, the
// staging and queue states every caller shares (one read of each, kept in
// the script cache DASH_WAIT_CACHE_SECONDS, so a class polling together
// reads them once), and the two turn-in tabs only when a turn-in answer
// waits. No TeacherMatrix, evidence, warm-ups or other spreadsheet, and
// nothing per card. When a card is done the page loads the dashboard once
// to show its feedback.
//
// [{ fileId, configId, turnIn }] (at most DASH_POLL_MAX_CARDS) ->
// { ok: true, cards: [{ fileId, configId, waiting, status, statusPill,
//   statusClass, displayStatus, statusNote, canSubmit, lastEval,
//   turnIn? }] } or { ok: false, error }. turnIn: { state: "READY", code },
// { state: "PENDING_CHECK" }, or { state: "CHANGED" } (load the card).
// ---------------------------------------------------------------------------
const DASH_POLL_MAX_CARDS = 20;
const DASH_WAIT_CACHE_KEY = "dashWaitSnapshot";
const DASH_WAIT_CACHE_SECONDS = 15;
// The script cache takes up to 100 KB a value; a bigger snapshot isn't kept.
const DASH_WAIT_CACHE_MAX_CHARS = 90000;

// In line or being checked: what the page waits on.
function dashWaiting_(status, pipeline) {
  return pipeline === "IN_PROCESS" || pipeline === "QUEUED" || pipeline === "PENDING_INFERENCE" ||
    status === "PENDING" || status === "STAGED";
}

function getMyWaitingStatus(cards) {
  try {
    return _dashWaitingStatus_(cards);
  } catch (e) {
    Logger.log("getMyWaitingStatus: unexpected error: " + e.message);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

function _dashWaitingStatus_(cards) {
  const googleId = String(Session.getActiveUser().getEmail() || "").trim();
  if (!googleId) return { ok: false, error: "NO_USER" };
  const asked = (Array.isArray(cards) ? cards : []).slice(0, DASH_POLL_MAX_CARDS).map(function (c) {
    return { fileId: String((c && c.fileId) || "").trim(), configId: String((c && c.configId) || "").trim(),
      turnIn: !!(c && c.turnIn) };
  }).filter(function (c) { return c.fileId && c.configId; });
  if (!asked.length) return { ok: true, cards: [] };

  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const data = ss.getSheetByName(cfg.tabs.ledger).getDataRange().getValues();
  const who = googleId.toLowerCase();
  const own = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (String(r[LEDGER.GOOGLE_ID]).toLowerCase() !== who) continue;
    own[String(r[LEDGER.FILE_ID]) + "|" + String(r[LEDGER.CONFIG_ID])] = r;
  }
  const snap = _dashWaitSnapshot_(ss, cfg);
  const tiCache = {};
  let inComments = null; // the feedback-as-comment flag, read only for a finished card
  let usualCheck;
  const out = [];
  asked.forEach(function (c) {
    const row = own[c.fileId + "|" + c.configId];
    if (!row) return; // not the caller's: nothing about it
    const status = String(row[LEDGER.STATUS]).trim();
    const lastResult = String(row[LEDGER.LAST_RESULT] || "").trim();
    const pipeline = snap.pipeline[c.fileId] === "IN_PROCESS" ? "IN_PROCESS"
      : snap.queued[c.fileId] ? "QUEUED" : snap.pipeline[c.fileId];
    if (!inComments && status === "COMPLETE") inComments = feedbackAsCommentChecker_();
    const display = resolveStudentStatus_(status, pipeline,
      status === "COMPLETE" ? inComments(c.configId, ledgerRowCourseCode_(row)) : false, lastResult);
    const card = {
      fileId: c.fileId, configId: c.configId, waiting: dashWaiting_(status, pipeline), status: status,
      statusPill: resolveStudentPill_(status, pipeline, lastResult),
      statusClass: resolveStudentClass_(status, pipeline, lastResult),
      displayStatus: display, statusNote: studentStatusNote_(display),
      canSubmit: !DASH_NO_SUBMIT_STATUSES[status] && !(pipeline === "IN_PROCESS" || pipeline === "QUEUED"),
      lastEval: row[LEDGER.LAST_EVAL] ? formatDate_(row[LEDGER.LAST_EVAL]) : "",
      canRetry: status === "ERROR_TIMEOUT" && !dashWaiting_(status, pipeline)
    };
    card.stages = card.waiting ? dashStages_(row, pipeline, snap.pipeline[c.fileId], (snap.at || {})[c.fileId], function () {
      if (usualCheck === undefined) usualCheck = dashUsualCheckMinutes_(ss);
      return usualCheck;
    }, new Date()) : null;
    if (c.turnIn) card.turnIn = _dashTurnInNews_(ss, googleId, c.configId, tiCache);
    out.push(card);
  });
  return { ok: true, cards: out };
}

// A turn-in answer being checked (71): its code once issued, still being
// checked, or CHANGED (a verdict without a code: the page loads the card).
function _dashTurnInNews_(ss, googleId, configId, cache) {
  try {
    if (turnInOffEverywhere_()) return { state: "CHANGED" };
    const have = _turnInCodeFor_(ss, googleId, turnInAssignmentId_(ss, configId, cache), cache);
    if (have) return { state: "READY", code: String(have[TCODE.CODE]) };
    const check = _turnInLatestCheck_(ss, googleId, configId, cache);
    if (check && String(check[TCHK.STATUS]).trim() === TURN_IN_PENDING) return { state: TURN_IN_PENDING };
  } catch (e) {
    Logger.log("[S13] turn-in news not read: " + e.message);
    return { state: TURN_IN_PENDING };
  }
  return { state: "CHANGED" };
}

// What every caller's poll shares: { pipeline: { fileId: "IN_PROCESS" |
// "PENDING_INFERENCE" }, at: { fileId: ms the staging row was stamped },
// queued: { fileId: true } }, read as
// getStudentDashboardData reads them (the staging row last listed for a
// file wins; an open ReviewQueue row is in line), kept in the script cache
// for DASH_WAIT_CACHE_SECONDS.
function _dashWaitSnapshot_(ss, cfg) {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  if (cache) {
    try {
      const hit = cache.get(DASH_WAIT_CACHE_KEY);
      if (hit) return JSON.parse(hit);
    } catch (e) { /* read it fresh */ }
  }
  const snap = { pipeline: {}, queued: dashQueuedFileIds_(cfg) };
  const staging = ss.getSheetByName(cfg.tabs.stagingPipeline);
  const rows = staging ? staging.getDataRange().getValues() : [];
  const h = rows[0] ? rows[0].map(function (x) { return String(x).trim(); }) : [];
  const fi = h.indexOf("StudentFileID"), si = h.indexOf("Status"), ti = h.indexOf("Timestamp");
  const last = {}, lastAt = {};
  snap.at = {};
  for (let i = 1; i < rows.length && fi !== -1 && si !== -1; i++) {
    const fid = String(rows[i][fi]).trim();
    if (fid) {
      last[fid] = String(rows[i][si]).trim();
      lastAt[fid] = ti !== -1 ? sheetTimestampMs_(rows[i][ti]) || 0 : 0;
    }
  }
  Object.keys(last).forEach(function (fid) {
    if (last[fid] === "IN_PROCESS" || last[fid] === "PENDING_INFERENCE") {
      snap.pipeline[fid] = last[fid];
      if (lastAt[fid]) snap.at[fid] = lastAt[fid];
    }
  });
  if (cache) {
    try {
      const json = JSON.stringify(snap);
      if (json.length <= DASH_WAIT_CACHE_MAX_CHARS) cache.put(DASH_WAIT_CACHE_KEY, json, DASH_WAIT_CACHE_SECONDS);
    } catch (e) { /* the next poll reads it fresh */ }
  }
  return snap;
}


// ---------------------------------------------------------------------------
// Where the work is (2026-11-14, the operator's "Build 1-4", item 3)
//
// A waiting card's stage line: Submitted → In line → Being checked →
// Feedback ready, with only the times the sheets already hold:
//   Submitted      the Ledger's SubmissionTS (13 stamps it at Submit)
//   In line        the staging row's Timestamp while it is
//                  PENDING_INFERENCE (03's bridge stamps it); a ReviewQueue
//                  row the bridge hasn't taken yet is in line with no time
//   Being checked  the staging row's Timestamp once IN_PROCESS (06's
//                  turnstile stamps it when it releases the row)
// No ETA is made up. "Usually about N min" goes on Being checked only when
// FlowMeasures (69b) has a measured Flow 2 median (sent to harvested) for
// a recent week with at least DASH_USUAL_MIN_SENT checks; it is read once an
// hour (script cache). In line has no measure, so it has no estimate.
// ---------------------------------------------------------------------------
// getMyFeedbackLink — View feedback opens the doc with the feedback comment
// open (2026-11-17). Docs keeps a comment that isn't attached to text behind
// its Comments button, and students didn't find it. 37 puts the comment's
// link on the doc's feedback line (63); this reads it back for the signed-in
// student's own doc, or for a form, Slides or Sheets part its feedback page.
// { ok: true, url } ("" when there is none: the page then opens the doc or
// the feedback page as before) or { ok: false, error }.
// ---------------------------------------------------------------------------
function getMyFeedbackLink(fileId, configId) {
  try {
    const googleId = Session.getActiveUser().getEmail();
    if (!googleId) return { ok: false, error: "NO_USER" };
    fileId = String(fileId || "").trim();
    configId = String(configId || "").trim();
    if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };
    const cfg = getConfig_();
    const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
    if (!row) return { ok: false, error: "NOT_REGISTERED" };
    // A form, Slides or Sheets part (2026-11-17): its feedback is on its
    // feedback page, the snapshot doc beside the file (02), whose header
    // carries the link the same way.
    let docId = fileId;
    if (workFileHasSnapshot_(workFileTypeOfUrl_(row[LEDGER.ADMIN_FILE_URL]))) {
      const snap = formSnapshotFor_(SpreadsheetApp.openById(cfg.ledgerSsId), fileId);
      if (!snap) return { ok: true, url: "" };
      docId = snap.snapshotDocId;
    }
    return { ok: true, url: docFeedbackCommentUrl_(docId) };
  } catch (e) {
    Logger.log("getMyFeedbackLink: unexpected error for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

// ---------------------------------------------------------------------------
const DASH_USUAL_MIN_SENT = 5;
const DASH_USUAL_CACHE_KEY = "dashUsualCheckMinutes";
const DASH_USUAL_CACHE_SECONDS = 60 * 60;
const DASH_FM_FLOW2_LABEL = "Flow 2 evaluation"; // 69b's FM_FLOWS label (69b isn't in this project)

// { current: "IN_LINE" | "CHECKING", submitted, inLine, checking (time
// labels, "" when not recorded), since (ms the current stage began, 0 when
// not recorded), usualMin (number or null) }.
function dashStages_(row, pipeline, stagingStatus, stagingAt, usual, now) {
  const tz = Session.getScriptTimeZone();
  const label = function (ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const sameDay = Utilities.formatDate(d, tz, "yyyy-MM-dd") === Utilities.formatDate(now, tz, "yyyy-MM-dd");
    return Utilities.formatDate(d, tz, sameDay ? "h:mm a" : "MMM d, h:mm a");
  };
  const sub = sheetTimestampMs_(row[LEDGER.SUBMISSION_TS]) || 0;
  const checking = pipeline === "IN_PROCESS";
  const inLineAt = stagingStatus === "PENDING_INFERENCE" ? stagingAt || 0 : 0;
  const checkingAt = checking ? stagingAt || 0 : 0;
  return {
    current: checking ? "CHECKING" : "IN_LINE",
    submitted: label(sub),
    inLine: label(inLineAt),
    checking: label(checkingAt),
    since: checking ? checkingAt : (inLineAt || sub),
    usualMin: checking ? usual() : null
  };
}

// FlowMeasures' latest Flow 2 median (minutes, sent to harvested) for a
// week with at least DASH_USUAL_MIN_SENT checks, or null.
function dashUsualCheckMinutes_(ss) {
  let cache = null;
  try { cache = CacheService.getScriptCache(); } catch (e) { cache = null; }
  try {
    const hit = cache ? cache.get(DASH_USUAL_CACHE_KEY) : null;
    if (hit !== null && hit !== undefined) return hit === "" ? null : Number(hit);
  } catch (e) { /* read it */ }
  let out = null;
  try {
    const sheet = ss.getSheetByName("FlowMeasures");
    const rows = sheet && sheet.getLastRow() > 1 ? sheet.getDataRange().getValues() : [];
    const h = rows.length ? rows[0].map(function (x) { return String(x).trim(); }) : [];
    const iWeek = h.indexOf("WeekOf"), iFlow = h.indexOf("Flow"), iSent = h.indexOf("Sent"), iMed = h.indexOf("WaitMedianMin");
    if (iWeek !== -1 && iFlow !== -1 && iSent !== -1 && iMed !== -1) {
      const flow2 = rows.slice(1).filter(function (r) {
        return String(r[iFlow]).trim() === DASH_FM_FLOW2_LABEL && Number(r[iSent]) >= DASH_USUAL_MIN_SENT &&
          r[iMed] !== "" && !isNaN(Number(r[iMed]));
      }).sort(function (a, b) { return String(b[iWeek]) < String(a[iWeek]) ? -1 : String(b[iWeek]) > String(a[iWeek]) ? 1 : 0; });
      if (flow2.length) out = Math.max(1, Math.round(Number(flow2[0][iMed])));
    }
  } catch (e) {
    Logger.log("[S13] FlowMeasures not read: " + e.message);
  }
  try { if (cache) cache.put(DASH_USUAL_CACHE_KEY, out === null ? "" : String(out), DASH_USUAL_CACHE_SECONDS); } catch (e) { /* fine */ }
  return out;
}

// ---------------------------------------------------------------------------
// retryMyCheck — "Try again" on a check that timed out (2026-11-14)
//
// The re-queue the admin's Reset Stuck Pipeline Row (10's resetStuckRow)
// already does for an ERROR_TIMEOUT row, for one row: the student's own
// staging row goes from ERROR_TIMEOUT back to PENDING_INFERENCE, so the
// turnstile releases it and stamps it, and 37's builder re-arms the
// submission's FlowInput row (or builds a fresh one after ERROR_NO_ANSWER)
// exactly as for an admin re-queue: no new ReviewQueue row, no new staging
// row, so no duplicate FlowInput row (37's existingKeys) and the re-arm
// counter starts again only as it does for an admin re-queue or a resubmit.
// A late answer still lands as before (03's backprop finishes a queue row
// at ERROR_TIMEOUT). The teacher is not emailed again (03 emails only when it
// closes a STAGED queue row).
// Safe only when:
//   - the row is the caller's (account, ConfigID and file: findOwnLedgerRow_)
//   - its Ledger status is ERROR_TIMEOUT (03 sets it after the lane gave up)
//   - its latest staging row is ERROR_TIMEOUT and none for the file is in
//     line or in process
//   - this card wasn't retried in the last DASH_RETRY_EVERY_MIN minutes
//     (server-side, in a Script Property holding a hash of account and
//     file, never either, pruned as it goes)
// { ok: true, card } or { ok: false, error, waitMin? }.
// ---------------------------------------------------------------------------
const DASH_RETRY_EVERY_MIN = 10;
const DASH_RETRY_PROP = "DASH_RETRY_AT";

function retryMyCheck(fileId, configId) {
  try {
    return _dashRetry_(fileId, configId, new Date());
  } catch (e) {
    Logger.log("retryMyCheck: unexpected error for ConfigID " + String(configId || "").trim() + ": " + e.message);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

function _dashRetryKey_(googleId, fileId) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(googleId).toLowerCase() + "|" + String(fileId));
  return bytes.slice(0, 12).map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}

function _dashRetryState_() {
  try {
    const v = JSON.parse(PropertiesService.getScriptProperties().getProperty(DASH_RETRY_PROP) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch (e) {
    return {};
  }
}

// Minutes until this card may be retried again; 0 when it may now.
function _dashRetryWaitMin_(state, googleId, fileId, now) {
  const at = Number(state[_dashRetryKey_(googleId, fileId)]) || 0;
  const left = at + DASH_RETRY_EVERY_MIN * 60000 - now.getTime();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function _dashRetry_(fileId, configId, now) {
  const googleId = String(Session.getActiveUser().getEmail() || "").trim();
  if (!googleId) return { ok: false, error: "NO_USER" };
  fileId = String(fileId || "").trim();
  configId = String(configId || "").trim();
  if (!fileId || !configId) return { ok: false, error: "BAD_REQUEST" };
  const cfg = getConfig_();
  const row = findOwnLedgerRow_(cfg, googleId, fileId, configId);
  if (!row) return { ok: false, error: "NOT_REGISTERED" };
  if (String(row[LEDGER.STATUS]).trim() !== "ERROR_TIMEOUT") return { ok: false, error: "NOT_TIMED_OUT" };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.openById(cfg.adminSsId).getSheetByName(cfg.tabs.stagingPipeline);
    const rows = sheet ? sheet.getDataRange().getValues() : [];
    const h = rows.length ? rows[0].map(function (x) { return String(x).trim(); }) : [];
    const fi = h.indexOf("StudentFileID"), si = h.indexOf("Status");
    if (fi === -1 || si === -1) return { ok: false, error: "NO_QUEUE" };
    let latest = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][fi]).trim() !== fileId) continue;
      const st = String(rows[i][si]).trim();
      if (st === "IN_PROCESS" || st === "PENDING_INFERENCE") return { ok: false, error: "ALREADY_QUEUED" };
      latest = i;
    }
    if (latest === -1 || String(rows[latest][si]).trim() !== "ERROR_TIMEOUT") return { ok: false, error: "NOT_TIMED_OUT" };
    const state = _dashRetryState_();
    const wait = _dashRetryWaitMin_(state, googleId, fileId, now);
    if (wait) return { ok: false, error: "TOO_SOON", waitMin: wait };
    sheet.getRange(latest + 1, si + 1).setValue("PENDING_INFERENCE");

    // The rate limit: this card now; entries past the window dropped.
    const keep = {};
    Object.keys(state).forEach(function (k) {
      if (now.getTime() - Number(state[k]) < DASH_RETRY_EVERY_MIN * 60000) keep[k] = state[k];
    });
    keep[_dashRetryKey_(googleId, fileId)] = now.getTime();
    PropertiesService.getScriptProperties().setProperty(DASH_RETRY_PROP, JSON.stringify(keep));
  } finally {
    lock.releaseLock();
  }
  try { CacheService.getScriptCache().remove(DASH_WAIT_CACHE_KEY); } catch (e) { /* the next read is 15 s away at most */ }
  Logger.log("retryMyCheck: a timed-out check was put back in line — ConfigID " + configId);
  const display = resolveStudentStatus_("ERROR_TIMEOUT", "QUEUED", false, "");
  return { ok: true, card: { fileId: fileId, configId: configId, waiting: true, status: "ERROR_TIMEOUT",
    statusPill: resolveStudentPill_("ERROR_TIMEOUT", "QUEUED", ""), statusClass: resolveStudentClass_("ERROR_TIMEOUT", "QUEUED", ""),
    displayStatus: display, statusNote: studentStatusNote_(display), canSubmit: false, canRetry: false,
    stages: { current: "IN_LINE", submitted: "", inLine: Utilities.formatDate(now, Session.getScriptTimeZone(), "h:mm a"),
      checking: "", since: now.getTime(), usualMin: null } } };
}

// ---------------------------------------------------------------------------
// Canvas button (2026-11-15, the operator's ask): the header's "Canvas ↗"
// and the turn-in card's "Open Canvas ↗" open Canvas in a new tab, so a
// student can paste the code without hunting for the tab. The district's
// Canvas by default; CANVAS_URL (Script Property on this project) changes
// it without a push. Only an https URL with no quotes, spaces or angle
// brackets is used; anything else falls back to the default.
// ---------------------------------------------------------------------------
const DASH_CANVAS_URL_DEFAULT = "https://mychesterfieldschools.instructure.com";
const DASH_CANVAS_URL_PROP = "CANVAS_URL";

function dashCanvasUrl_() {
  let v = "";
  try { v = String(PropertiesService.getScriptProperties().getProperty(DASH_CANVAS_URL_PROP) || "").trim(); } catch (e) { v = ""; }
  return /^https:\/\/[^\s"'<>`\\]+$/.test(v) ? v : DASH_CANVAS_URL_DEFAULT;
}

// ---------------------------------------------------------------------------
// "Show me around" (2026-11-17): a short walkthrough of the page, the
// operator's ask after students missed the feedback and the document's
// left-hand outline: things they love once found but don't reach in their
// normal work. It highlights each part of the page in turn (a dimmed page
// with a lit box around the part, a card with Back and Next), then shows
// the two places inside the document a student needs: Comments and the
// outline, then, where turn-in codes are on, how to earn one and turn in
// with it on Canvas. It starts by itself on a student's first visit (dashTourSeen_,
// on the server) and is in More any time. Nothing is sent to the server. A step whose part
// isn't on the page (no card to submit yet) is skipped.
// ---------------------------------------------------------------------------
const DASH_TOUR_CSS = `
  #tour-spot{position:fixed;z-index:300;border-radius:10px;box-shadow:0 0 0 9999px rgba(32,33,36,0.62);pointer-events:none;transition:all .2s ease}
  #tour-spot.center{width:0;height:0;left:50%;top:40%}
  #tour-card{position:fixed;z-index:301;width:min(360px,calc(100vw - 32px));background:#fff;color:#202124;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.3);padding:18px 18px 14px}
  #tour-card h2{font-size:17px;margin:0 0 6px}
  #tour-card p{font-size:14px;line-height:1.5;margin:0 0 10px}
  #tour-card .tour-n{font-size:12px;color:var(--text-secondary)}
  #tour-card .tour-actions{display:flex;align-items:center;gap:8px;margin-top:6px}
  #tour-card .tour-actions .tour-gap{flex:1}
  #tour-card button{min-height:36px;padding:6px 14px;border-radius:6px;font-size:14px;font-family:inherit;cursor:pointer}
  #tour-card .tour-next{background:#0b5f2e;color:#fff;border:0}
  #tour-card .tour-back,#tour-card .tour-skip{background:#fff;color:#1967d2;border:1px solid #dadce0}
  #tour-card .tour-skip{border:0;padding:6px 4px}
  #tour-card svg{display:block;width:100%;height:auto;margin:4px 0 10px}
`;

const DASH_TOUR_JS = `
var _tour = null; // { i, steps, back }

function _tourQ(sel) { return document.querySelector ? document.querySelector(sel) : null; }
function _tourButton(words) {
  var all = document.querySelectorAll ? document.querySelectorAll(".card .act") : [];
  for (var i = 0; i < all.length; i++) {
    var t = String(all[i].textContent || "");
    if (t.indexOf(words) === 0) return all[i];
  }
  return null;
}

// The document, drawn: its top bar with Comments, the outline on the left.
var TOUR_DOC_ART = '<svg viewBox="0 0 320 170" role="img" aria-label="A Google Doc: Comments at the top right, the outline on the left">' +
  '<rect x="1" y="1" width="318" height="168" rx="8" fill="#f8f9fa" stroke="#dadce0"/>' +
  '<rect x="1" y="1" width="318" height="30" rx="8" fill="#fff" stroke="#dadce0"/>' +
  '<rect x="10" y="9" width="14" height="14" rx="2" fill="#4285f4"/>' +
  '<text x="30" y="20" font-size="10" fill="#5f6368">Your assignment</text>' +
  '<rect x="246" y="6" width="66" height="20" rx="10" fill="#fef7e0" stroke="#f9ab00" stroke-width="2"/>' +
  '<text x="279" y="20" font-size="10" text-anchor="middle" fill="#202124">💬 Comments</text>' +
  '<rect x="8" y="38" width="80" height="124" rx="4" fill="#e8f0fe" stroke="#1a73e8" stroke-width="2"/>' +
  '<text x="14" y="52" font-size="9" font-weight="bold" fill="#1967d2">Outline</text>' +
  '<text x="14" y="68" font-size="9" fill="#202124">The assignment</text>' +
  '<text x="14" y="82" font-size="9" fill="#202124">Your response</text>' +
  '<rect x="100" y="38" width="210" height="124" rx="4" fill="#fff" stroke="#dadce0"/>' +
  '<rect x="114" y="52" width="150" height="6" rx="3" fill="#dadce0"/><rect x="114" y="66" width="180" height="6" rx="3" fill="#dadce0"/>' +
  '<rect x="114" y="80" width="120" height="6" rx="3" fill="#dadce0"/><rect x="114" y="104" width="170" height="6" rx="3" fill="#dadce0"/>' +
  '<rect x="114" y="118" width="140" height="6" rx="3" fill="#dadce0"/></svg>';

// Turning in with a code (2026-11-17, the operator: the step most unlike
// usual classroom habits): the code on the card, drawn going into Canvas.
var TOUR_CANVAS_ART = '<svg viewBox="0 0 320 150" role="img" aria-label="The code on your dashboard, pasted into the assignment in Canvas">' +
  '<rect x="1" y="1" width="140" height="148" rx="8" fill="#fff" stroke="#dadce0"/>' +
  '<text x="10" y="20" font-size="10" font-weight="bold" fill="#202124">Turn-in code</text>' +
  '<rect x="10" y="30" width="122" height="22" rx="4" fill="#f1f3f4" stroke="#dadce0"/>' +
  '<text x="16" y="45" font-size="8.5" fill="#202124" font-family="monospace">CAS-8175-L03-7KQ3-M9TX</text>' +
  '<rect x="10" y="60" width="44" height="20" rx="4" fill="#fff" stroke="#f9ab00" stroke-width="2"/>' +
  '<text x="32" y="74" font-size="10" text-anchor="middle" fill="#1967d2">Copy</text>' +
  '<text x="10" y="102" font-size="9" fill="#5f6368">On your dashboard,</text>' +
  '<text x="10" y="114" font-size="9" fill="#5f6368">on the card</text>' +
  '<path d="M146 75 L172 75" stroke="#f9ab00" stroke-width="4"/><path d="M170 66 L182 75 L170 84 Z" fill="#f9ab00"/>' +
  '<rect x="186" y="1" width="133" height="148" rx="8" fill="#fff" stroke="#dadce0"/>' +
  '<rect x="186" y="1" width="133" height="18" rx="8" fill="#e66000"/>' +
  '<text x="194" y="14" font-size="9" fill="#fff" font-weight="bold">Canvas</text>' +
  '<text x="194" y="34" font-size="9" fill="#202124" font-weight="bold">L03 Personal branding</text>' +
  '<text x="194" y="50" font-size="8.5" fill="#5f6368">Text Entry</text>' +
  '<rect x="194" y="56" width="117" height="40" rx="3" fill="#fff" stroke="#f9ab00" stroke-width="2"/>' +
  '<text x="199" y="72" font-size="7.5" fill="#202124" font-family="monospace">CAS-8175-L03-7KQ3-M9TX</text>' +
  '<rect x="252" y="106" width="58" height="20" rx="4" fill="#0b5f2e"/>' +
  '<text x="281" y="120" font-size="9" text-anchor="middle" fill="#fff">Submit</text></svg>';

// Whether any card's work is a Slides deck.
function _tourHasSlides() {
  var list = (_lastDashData && _lastDashData.assignments) || [];
  for (var i = 0; i < list.length; i++) if (list[i].workType === "slides") return true;
  return false;
}

// Whether turn-in codes are on for any card on the page (71b's turnInOn).
function _tourTurnInOn() {
  var list = (_lastDashData && _lastDashData.assignments) || [];
  for (var i = 0; i < list.length; i++) if (list[i].turnInOn || list[i].turnIn) return true;
  return false;
}

function _tourSteps() {
  return [
    { title: "Welcome to your dashboard", text: "This is where you find your work, send it for feedback, and read what comes back. This tour takes about a minute." },
    { title: "Your record", text: "Assignments is your work. Competencies shows the skills you have shown so far. Warm-ups has your warm-up feedback. My Context is your week-by-week record.", el: function () { return _tourQ(".dash-tabs"); } },
    { title: "Start here", text: "Do next lists the work that needs you now. Click a name to jump to its card.", el: function () { return _tourQ(".do-next"); } },
    { title: "Open your work", text: "Each card opens your own work: a document, or for some parts a Slides deck. Work there. It saves as you type.", el: function () { return _tourButton("Open"); } },
    { title: "A Slides part", when: _tourHasSlides, el: function () { return _tourButton("Open your slides"); }, center: true, text: "When the work is a deck, Submit checks it first: the number of slides, lines per slide, speaker notes. If something is off, the card says what to fix. Your feedback comes back as a comment on your deck." },
    { title: "Send it for feedback", text: "When you are ready, press Submit for Feedback. Your feedback comes back in a few minutes.", el: function () { return _tourButton("Submit for Feedback"); } },
    { title: "Read your feedback", text: "When feedback is ready, View feedback opens your document or your deck with the feedback already open.", el: function () { return _tourButton("View feedback"); } },
    { title: "Inside your document", art: TOUR_DOC_ART, text: "Your feedback is a comment. If it is closed, click Comments at the top right. The outline on the left lists the parts of your document: click one to jump there. If you do not see it, click the outline icon at the top left." },
    { title: "Earn your turn-in code", when: _tourTurnInOn, center: true, el: function () { var q = _tourQ(".ti .ti-a"); return (q && q.closest && q.closest(".ti")) || _tourQ(".ti"); }, text: "Once your feedback is back, answer one short question about it on the card. A check reads your answer. In a few minutes your turn-in code shows on the card." },
    { title: "Turn it in on Canvas", when: _tourTurnInOn, art: TOUR_CANVAS_ART, text: "Copy the code. In Canvas, open the same assignment, paste the code in the text box, and submit. The code is how you turn in, not a file or a link. You can still revise after." },
    { title: "Come back any time", text: "This tour is under More, in Show me around.", el: function () { return _tourQ("#more-btn"); } }
  ];
}

function startTour() {
  if (_tour) return;
  // when: a step only for some pages; el: the part it lights, skipped when
  // it isn't on the page unless center (then it shows in the middle).
  var steps = _tourSteps().filter(function (s) { return (!s.when || s.when()) && (!s.el || s.center || s.el()); });
  _tour = { i: 0, steps: steps, back: document.activeElement };
  var spot = document.createElement("div");
  spot.id = "tour-spot";
  var card = document.createElement("div");
  card.id = "tour-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "tour-h");
  card.addEventListener("keydown", _tourKeydown);
  document.body.appendChild(spot);
  document.body.appendChild(card);
  window.addEventListener("resize", _tourPlace);
  window.addEventListener("scroll", _tourPlace, true);
  _tourShow();
}

function _tourShow() {
  var t = _tour, s = t.steps[t.i], last = t.i === t.steps.length - 1;
  var card = document.getElementById("tour-card");
  card.innerHTML = '<div class="tour-n">' + (t.i + 1) + ' of ' + t.steps.length + '</div>' +
    '<h2 id="tour-h">' + esc(s.title) + '</h2>' + (s.art || '') + '<p>' + esc(s.text) + '</p>' +
    '<div class="tour-actions">' +
    (last ? '' : '<button type="button" class="tour-skip">Skip tour</button>') +
    '<span class="tour-gap"></span>' +
    (t.i ? '<button type="button" class="tour-back">Back</button>' : '') +
    '<button type="button" class="tour-next">' + (last ? 'Done' : 'Next') + '</button></div>';
  var on = function (cls, f) { var b = card.querySelector(cls); if (b) b.addEventListener("click", f); };
  on(".tour-skip", endTour);
  on(".tour-back", function () { tourGo(-1); });
  on(".tour-next", last ? endTour : function () { tourGo(1); });
  var el = s.el ? s.el() : null;
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" });
  _tourPlace();
  var next = card.querySelector(".tour-next");
  if (next && next.focus) next.focus();
}

function _tourPlace() {
  if (!_tour) return;
  var s = _tour.steps[_tour.i];
  var el = s.el ? s.el() : null;
  var spot = document.getElementById("tour-spot"), card = document.getElementById("tour-card");
  var vw = window.innerWidth, vh = window.innerHeight, cw = card.offsetWidth, ch = card.offsetHeight;
  if (!el) {
    spot.className = "center";
    spot.style.left = "50%"; spot.style.top = "40%"; spot.style.width = "0"; spot.style.height = "0";
    card.style.left = Math.max(16, (vw - cw) / 2) + "px";
    card.style.top = Math.max(16, (vh - ch) / 2) + "px";
    return;
  }
  var r = el.getBoundingClientRect(), pad = 6;
  spot.className = "";
  spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
  spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
  var below = r.bottom + pad + 12, above = r.top - pad - 12 - ch;
  var top = below + ch <= vh - 8 ? below : above >= 8 ? above : Math.max(8, vh - ch - 8);
  var left = Math.min(Math.max(16, r.left), vw - cw - 16);
  card.style.left = left + "px"; card.style.top = top + "px";
}

function tourGo(d) {
  if (!_tour) return;
  _tour.i = Math.max(0, Math.min(_tour.steps.length - 1, _tour.i + d));
  _tourShow();
}

function endTour() {
  if (!_tour) return;
  var back = _tour.back;
  _tour = null;
  ["tour-spot", "tour-card"].forEach(function (id) { var el = document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); });
  window.removeEventListener("resize", _tourPlace);
  window.removeEventListener("scroll", _tourPlace, true);
  if (!DEMO && _lastDashData && !_lastDashData.tourSeen) {
    _lastDashData.tourSeen = true;
    google.script.run.withFailureHandler(function () {}).markMyTourSeen();
  }
  if (back && back.focus) back.focus();
}

function _tourKeydown(e) {
  if (e.key === "Escape") { e.preventDefault(); endTour(); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); tourGo(1); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); tourGo(-1); return; }
  if (e.key !== "Tab") return;
  var b = Array.prototype.slice.call(document.getElementById("tour-card").querySelectorAll("button"));
  if (!b.length) return;
  var i = b.indexOf(document.activeElement);
  e.preventDefault();
  b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
}

(function wireTourButton() {
  var b = document.getElementById("tour-btn");
  if (b && b.addEventListener) b.addEventListener("click", function () { startTour(); });
})();

// A student's first visit (the server says whether they've seen it): once
// the page has their cards. A teacher's demo waits to be asked.
var _tourChecked = false;
function tourMaybeStart(data) {
  if (_tourChecked || DEMO || !data || !data.assignments || !data.assignments.length) return;
  _tourChecked = true;
  // A moment after the page draws, so the cards it points at are there.
  if (data.tourSeen === false) setTimeout(function () { startTour(); }, 600);
}
`;

// ---------------------------------------------------------------------------
// buildStudentDashboardHtml_
// ---------------------------------------------------------------------------
// opts.demo: the demo page (doGet decides who gets it): the banner, and
// every call routed to the page's own stubs but getDemoDashboardData.
function buildStudentDashboardHtml_(opts) {
  const demo = !!(opts && opts.demo);
  const canvasUrl = dashCanvasUrl_();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Assignments</title>
<style>
.dash-tabs{display:flex;gap:4px;flex-wrap:wrap;padding:10px 24px 0;border-bottom:1px solid #e8eaed;background:#fff}
.dash-tabs button{background:none;border:none;border-bottom:3px solid transparent;padding:10px 14px;font-size:14px;cursor:pointer;color:var(--text-secondary)}
.dash-tabs button[aria-selected="true"]{border-bottom-color:#0d652d;color:#0d652d;font-weight:600}
.rec-course{margin:6px 0 18px}
.rec-course h2{font-size:17px;margin:0 0 4px}
.rec-sub{font-size:13px;color:var(--text-secondary);margin-bottom:10px}
.rec-area{background:#fff;border:1px solid #e8eaed;border-radius:8px;margin:0 0 10px;padding:4px 12px}
.rec-area > summary{font-weight:600;font-size:14px;padding:8px 0;cursor:pointer}
.rec-comp{border-top:1px solid #f1f3f4;padding:6px 0}
.rec-comp > summary{cursor:pointer;font-size:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
.rec-chip{font-size:12px;border-radius:10px;padding:1px 8px;background:#f1f3f4;color:#3c4043;white-space:nowrap}
.rec-chip.done{background:#e6f4ea;color:#0d652d}
.rec-ev{font-size:13px;margin:6px 0 6px 18px;line-height:1.5}
.rec-ev .rec-milestone{color:var(--text-secondary)}
.rec-empty{font-size:13px;color:var(--text-secondary)}
.rec-outside{font-size:13px;color:var(--text-secondary);font-style:italic}
.rec-latest{font-size:12px;color:var(--text-secondary);white-space:nowrap}
.rec-progress{font-size:12px;font-weight:400;color:var(--text-secondary);margin-left:8px}
.rec-progress .nw{white-space:nowrap}
.rec-ican,.rec-where{list-style:none;margin:4px 0 0;padding:0}
.rec-ican li,.rec-where li{margin:3px 0}
.rec-lists{display:flex;flex-wrap:wrap;gap:8px 28px;background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:8px 14px;margin:0 0 10px;font-size:13.5px}
.rec-lists h3{font-size:13.5px;margin:4px 0}
.rec-lists ul{margin:0 0 4px;padding-left:18px}
.rec-flat{padding:4px 12px}
.rv{margin-top:6px;padding:8px 10px;background:#f8f9fa;border-radius:6px}
.rv-lesson{margin:0 0 8px;line-height:1.5}
.rv-lesson:last-child{margin-bottom:0}
.ctx-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;font-size:14px}
.ctx-nav button{background:#fff;border:1px solid #5f6368;color:#3c4043;border-radius:4px;padding:4px 10px;font-size:13px;cursor:pointer}
.ctx-nav button[disabled]{opacity:.45;cursor:not-allowed}
.ctx-week{background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:12px 16px;font-size:14px;line-height:1.55}
.ctx-week p{margin:0 0 6px}
.ctx-week .ctx-h{font-weight:600;margin-top:10px}
/* 2026-11-19: an assignment as a list item, a part nested under its lesson,
   a question in a smaller grey line; "Coming up" with due dates on top. */
.ctx-week .ctx-li{margin:0 0 4px 18px;position:relative}
.ctx-week .ctx-li::before{content:"\\2022";position:absolute;left:-14px}
.ctx-week .ctx-li.l1{margin-left:38px}
.ctx-week .ctx-li.l1::before{content:"\\25E6"}
.ctx-week .ctx-asked{font-size:13px;color:var(--text-secondary);margin-bottom:2px}
.ctx-up{background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:10px 16px;margin-bottom:12px;font-size:14px}
.ctx-up h3{font-size:15px;margin:0 0 6px}
.ctx-up ul{margin:0;padding-left:18px}
.ctx-up li{margin:0 0 4px}
.due-line{font-size:13px;color:#3c4043;font-weight:500;margin-bottom:6px}
.due-line.past{color:var(--text-secondary);font-weight:400}

.demo-banner{background:#fef7e0;color:#202124;border-bottom:1px solid #f2d27a;padding:10px 24px;font-size:14px;font-weight:600}
.demo-note{font-size:13px;margin-top:8px;color:#3c4043;background:#f1f3f4;border-radius:6px;padding:6px 10px}
.competency-strip{display:flex;flex-wrap:wrap;gap:8px 20px;background:#fff;border:1px solid #e8eaed;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:14px}

  /* FIXED (Say/Do Ledger cas-ccps finding #14): #80868b (used for
     secondary/meta text) is ~3.68:1 against white — below WCAG AA's
     4.5:1 minimum for normal text. #5f6368 (already used elsewhere in
     this file for the identical "muted meta text" role) is ~6.05:1 —
     verified passing — so both are consolidated into this one token,
     matching the same fix in 07_TeacherDashboard.js. */
  :root{--text-secondary:#5f6368}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Google Sans",Roboto,Arial,sans-serif;background:#f8f9fa;color:#202124;font-size:15px;min-height:100vh}
  header{background:#0d652d;color:white;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
  header h1{font-size:19px;font-weight:500}
  #account-label{font-size:13px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .refresh-btn{background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.7);color:white;border-radius:6px;padding:7px 12px;font-size:13px;min-height:36px;cursor:pointer;font-family:inherit}
  .refresh-btn:hover{background:rgba(0,0,0,0.35)}
  .refresh-btn:focus-visible{outline:2px solid white;outline-offset:2px}
  a.canvas-btn{display:inline-flex;align-items:center;gap:4px;text-decoration:none;box-sizing:border-box}
  .term-line{font-size:13px;color:var(--text-secondary);margin:0 0 12px}
  .past-term-note{font-size:13px;color:#3c4043;margin:0 0 8px}
  @media (max-width:480px){
    header{padding:14px 16px}
    .refresh-btn{min-height:44px}
    #account-label{max-width:100%}
    header h1{font-size:17px}
    .main{padding:16px}
    .card{padding:14px 16px}
    /* FIXED (external UX audit): this breakpoint used to only adjust
       padding/font-size, never reflowing actual layout — unlike
       07_TeacherDashboard.js's own max-width:600px breakpoint, which
       genuinely reflows its field-row grid to one column. .card-top's
       flex-shrink:0 status pill never shrinks, so a long assignment name
       on a narrow phone screen got squeezed into a cramped remainder
       instead of stacking, same reflow-need the teacher side's grid had. */
    .card-top{flex-direction:column;align-items:flex-start}
  }
  #loading{text-align:center;padding:80px 24px;color:var(--text-secondary)}
  /* FIXED: was 40px vs the teacher dashboard's 36px — same border weight,
     same animation, same purpose, just a needless 4px drift between the
     two "app shells." Border color intentionally stays green (this
     dashboard's own accent) vs the teacher side's blue. */
  .spinner{width:36px;height:36px;border:3px solid #e8eaed;border-top-color:#137333;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
  @keyframes spin{to{transform:rotate(360deg)}}
  .main{padding:24px;max-width:700px;margin:0 auto}
  /* NEW (finding #7): "just registered" notice + My Info panel */
  .new-reg-notice{background:#e6f4ea;border:1px solid #b7e1c4;color:#0d652d;border-radius:10px;padding:14px 18px;margin-bottom:16px;font-size:13.5px;line-height:1.5}
  .new-reg-notice strong{font-weight:600}
  .info-card{background:white;border-radius:12px;padding:16px 20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);border-left:5px solid #1a73e8}
  .info-card .info-row{font-size:13.5px;color:#3c4043;margin-bottom:4px}
  .info-card .info-row b{color:#202124;font-weight:600}
  .info-card .correction-link{display:inline-block;margin-top:8px;font-size:13px;color:#1557b0;text-decoration:none;font-weight:500}
  .info-card .correction-link:hover{text-decoration:underline}
  .group-header{font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text-secondary);padding:4px 0 10px;border-bottom:2px solid #e8eaed;margin:28px 0 14px}
  .group-header:first-child{margin-top:0}
  .parts-head{font-size:15px;font-weight:600;margin:4px 0 8px}
  .parts-head span{font-size:12px;font-weight:400;color:var(--text-secondary);margin-left:6px}
  .part-locked{background:#f8f9fa;border:1px dashed #dadce0;border-radius:12px;padding:12px 20px;margin-bottom:12px;font-size:14px;color:var(--text-secondary)}
  .part-locked div{font-size:12px;margin-top:2px}
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
  /* F16: the lesson number chip, the part under the name, the task line. */
  .lesson-chip{display:inline-block;font-size:12px;font-weight:600;color:#3c4043;background:#f1f3f4;border-radius:6px;padding:1px 7px;margin-right:6px;vertical-align:2px}
  .part-sub{font-size:13.5px;color:#3c4043;margin-top:2px}
  .task-line{font-size:13.5px;color:#3c4043;margin:-4px 0 8px;line-height:1.45}
  .do-next .dn-meta{font-size:13px;color:var(--text-secondary)}
  /* F16 items 4 and 5: one card per lesson, its part stepper, the
     milestone marks. */
  .stepper{font-size:13.5px;color:#3c4043;margin-top:2px}
  .stepper .dots{color:#137333;margin-right:6px;display:inline-flex;gap:2px;vertical-align:middle}
  .stepper .dot{background:none;border:0;padding:2px 3px;margin:0;font:inherit;font-size:15px;line-height:1;color:#137333;cursor:pointer;border-radius:4px;min-width:24px;min-height:24px}
  .stepper .dot:hover{background:#e6f4ea}
  .stepper .dot:focus-visible{outline:2px solid #1a73e8;outline-offset:1px}
  .stepper .dot-shown{text-decoration:underline;text-underline-offset:3px}
  .stepper .dot-locked{color:#9aa0a6}
  .marks{list-style:none;margin:0 0 10px;padding:0;font-size:13.5px;line-height:1.45}
  .marks li{margin:3px 0}
  .marks-cap{font-size:12px;color:var(--text-secondary);margin:2px 0 2px}
  .marks-box{margin:2px 0 10px}
  .marks-box > summary{cursor:pointer;padding:2px 0;font-size:13px;font-weight:500;color:#1557b0}
  .marks-box .marks{margin:4px 0 0}
  .mark{display:inline-block;font-size:12px;font-weight:600;border-radius:10px;padding:1px 8px;margin-right:6px;white-space:nowrap}
  .mark-MET{background:#e6f4ea;color:#137333}
  .mark-PARTIALLY_MET{background:#fef3e2;color:#9c5000}
  .mark-NOT_MET{background:#f3e8fd;color:#7627bb}
  .mark-UNCHECKED{background:#f1f3f4;color:#3c4043}
  .lock-line{font-size:13px;color:var(--text-secondary);margin-top:8px}
  .lock-line.lock-submit{color:#202124;background:#e6f4ea;border-left:3px solid #0b5f2e;padding:6px 10px;border-radius:4px}
  .pill-submit{background:#e6f4ea;color:#0b5f2e}
  .parts-toggle{margin-top:10px;background:white;border:1px solid #5f6368;color:#3c4043;border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;font-family:inherit}
  .parts-toggle:focus-visible{outline:2px solid #1557b0;outline-offset:2px}
  .parts-list{margin-top:10px}
  /* F16 item 3: the sort control and the filter chips, above the classes. */
  .list-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:6px 0 4px;font-size:14px}
  .list-controls select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid #5f6368;border-radius:6px;background:white;color:#202124}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{font:inherit;font-size:13px;border:1px solid #5f6368;background:white;color:#3c4043;border-radius:16px;padding:5px 12px;cursor:pointer}
  .chip[aria-pressed="true"]{background:#e8f0fe;border-color:#1557b0;color:#1557b0;font-weight:600}
  .chip:focus-visible,.list-controls select:focus-visible{outline:2px solid #1557b0;outline-offset:2px}
  .filter-empty{font-size:14px;color:var(--text-secondary);padding:16px 0}
  .parts-list .card{box-shadow:none;border:1px solid #e8eaed;border-left-width:5px}
  /* The header's menu (F16 item 7): Refresh in view, the rest in More ▾. */
  .hdr-more{position:relative}
  #more-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:150;min-width:230px;background:white;border:1px solid #dadce0;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,0.22);padding:6px 0;display:flex;flex-direction:column}
  #more-menu[hidden]{display:none}
  #more-menu [role="menuitem"]{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:8px 16px;background:white;color:#202124;border:0;font-size:14px;font-family:inherit;text-align:left;cursor:pointer}
  #more-menu [role="menuitem"]:hover,#more-menu [role="menuitem"]:focus{background:#e8f0fe;color:#1557b0;outline:none}
  #more-menu [role="menuitem"]:focus-visible{outline:2px solid #1557b0;outline-offset:-2px}
  #more-menu .menu-account{font-size:12px;color:var(--text-secondary);padding:4px 16px 8px;border-bottom:1px solid #e8eaed;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
  /* FIXED: matches 07_TeacherDashboard.js's .status-badge geometry exactly
     (font-size/padding/border-radius) — this renders the identical
     "current status" chip concept, but used to be a fully-rounded pill at
     a different size, a visible seam between the two dashboards. */
  .pill{font-size:12px;font-weight:600;padding:4px 10px;border-radius:12px;line-height:1.35}
  /* A card's pill is one or two words (statusPill), so it stays on one
     line beside the title; the rest of the status is .status-note. */
  .card-top .pill{white-space:nowrap;flex-shrink:0}
  .status-note{font-size:13.5px;color:#3c4043;margin:-4px 0 8px;line-height:1.45}
  .form-note{font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.45}
  .next-step{font-size:14px;margin:0 0 8px;line-height:1.45}
  .next-step b{color:#7627bb}
  .pill-NOT_STARTED{background:#f1f3f4;color:var(--text-secondary)}
  .pill-IN_PROGRESS{background:#fef3e2;color:#9c5000}
  .pill-NEEDS_ACTION{background:#f3e8fd;color:#7627bb}
  .pill-DONE{background:#e6f4ea;color:#137333}
  .pill-ISSUE{background:#fce8e6;color:#b3261e}
  .eval-line{font-size:13px;color:var(--text-secondary);margin-bottom:12px}
  /* A card's actions (2026-11-07): one filled primary, chosen by the
     card's status (primaryActionFor), the others outlined. */
  .act{display:inline-flex;align-items:center;padding:8px 18px;border-radius:6px;font-size:14px;font-weight:500;font-family:inherit;text-decoration:none;cursor:pointer;border:1px solid #1967d2;transition:background .15s}
  .act-primary{background:#1967d2;color:white}
  .act-primary:hover{background:#1557b0}
  .act-primary.act-done{background:#137333;border-color:#137333}
  .act-primary.act-done:hover{background:#0d652d}
  .act-secondary{background:white;color:#1557b0;border-color:#1557b0}
  .act-secondary:hover{background:#e8f0fe}
  .act:disabled{opacity:.6;cursor:default}
  .act:focus-visible{outline:2px solid #1557b0;outline-offset:2px}
  /* "Do next": the cards that need the student, across every class. */
  .do-next{background:white;border:1px solid #d7c1f5;border-left:5px solid #9334e6;border-radius:12px;padding:12px 18px;margin-bottom:16px}
  .do-next h2{font-size:15px;font-weight:600;margin:0 0 6px}
  .do-next ul{list-style:none;margin:0;padding:0}
  .do-next li{padding:4px 0;font-size:14px;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}
  .do-next a{color:#1557b0;font-weight:500}
  .card:focus{outline:2px solid #1557b0;outline-offset:2px}
  .submitted-note{font-size:13px;color:#137333;margin-top:8px;font-weight:500}
  .card-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  /* The reflection form's own Submit (reflectFormHtml). */
  .submit-btn{background:white;color:#137333;border:1px solid #137333;padding:8px 18px;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit}
  .submit-btn:hover{background:#e6f4ea}
  .submit-btn:disabled{opacity:.6;cursor:default}
  .submit-msg{font-size:13px;margin-top:8px;line-height:1.45;white-space:pre-line}
  .submit-msg.ok{color:#137333}
  .submit-msg.err{color:#c5221f}
  /* The process reflection on Submit (2026-10-24): questions on the card. */
  .reflect{margin-top:12px;padding:12px;border:1px solid #c6dafc;border-radius:8px;background:#f8fbff}
  .reflect-intro{font-size:13px;color:var(--text-secondary);margin-bottom:10px;line-height:1.45}
  .reflect-q{display:block;font-size:14px;font-weight:500;margin:10px 0 4px;line-height:1.4}
  .reflect-goal{font-size:13px;color:var(--text-secondary);margin:10px 0 2px;line-height:1.4;padding-left:8px;border-left:3px solid #dadce0}
  .reflect-goal + .reflect-q{margin-top:4px}
  .reflect-a{width:100%;box-sizing:border-box;font-family:inherit;font-size:14px;padding:8px;border:1px solid #9aa0a6;border-radius:6px;resize:vertical}
  .reflect-count{font-size:12px;color:var(--text-secondary);margin-top:2px}
  .reflect-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .reflect-cancel{background:white;color:#3c4043;border:1px solid #80868b;padding:8px 18px;border-radius:6px;font-size:14px;cursor:pointer;font-family:inherit}
  .reflect-cancel:hover{background:#f1f3f4}
  /* Warm-ups card: the last warm-up's feedback, then the current one. */
  .warmup-card{border-left-color:#1a73e8}
  .warmup-card:hover{transform:none}
  .wu-section{padding:12px 0;border-top:1px solid #e8eaed}
  .wu-section:first-child{border-top:none;padding-top:0}
  .wu-section:last-child{padding-bottom:0}
  .wu-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;flex-wrap:wrap}
  .wu-label{font-size:14px;font-weight:600}
  .wu-course{font-weight:400;color:var(--text-secondary);font-size:13px}
  .wu-bridge{font-size:13.5px;font-style:italic;color:var(--text-secondary);margin-bottom:8px;white-space:pre-line;line-height:1.5}
  .wu-prompt{font-size:15px;line-height:1.55;margin-bottom:10px;white-space:pre-line}
  .wu-score{font-size:14px;margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}
  .wu-score b{font-size:18px}
  .wu-plus{color:#137333;font-weight:600;font-size:13px}
  .wu-parts{color:var(--text-secondary);font-size:13px}
  .wu-feedback{font-size:14px;line-height:1.55;background:#f1f3f4;border-radius:8px;padding:10px 12px;margin-bottom:10px;white-space:pre-line}
  .wu-answer{font-size:14px;line-height:1.5;white-space:pre-line;color:#3c4043}
  .wu-recall{margin-bottom:10px;font-size:14px}
  .refresh-note{color:#b3261e;font-size:13px;padding-bottom:0}
  /* Where the work is (2026-11-14): a waiting card's stages, with the times the sheets hold. */
  .stages{list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;margin:8px 0 2px;padding:0;font-size:13px;color:var(--text-secondary)}
  .stages li{white-space:nowrap}
  .stages li.done{color:#137333}
  .stages li.now{color:#202124;font-weight:600}
  .stages .st-time{font-weight:400;color:var(--text-secondary);margin-left:4px}
  .slow-note{font-size:13px;color:#3c4043;margin-top:6px}
  /* News while the page is open (2026-11-14): a card's feedback or code is ready. */
  .news-banner{background:#e6f4ea;color:#0d652d;font-size:14px;font-weight:500;padding-top:10px;padding-bottom:10px;border-bottom:1px solid #ceead6}
  .wu-recall summary{cursor:pointer;color:#1557b0;font-weight:500;padding:4px 0}
  .wu-recall .wu-prompt{margin:6px 0}
  .wu-ec{font-size:13px;color:#7627bb;font-weight:500;margin-bottom:6px}
  .wu-ec.done{color:#137333}
  .wu-note{font-size:13px;color:var(--text-secondary);margin-top:6px}
  .wu-text{width:100%;font-family:inherit;font-size:15px;line-height:1.5;padding:10px 12px;border:1px solid #dadce0;border-radius:8px;margin-bottom:8px;resize:vertical}
  .wu-text:focus{outline:2px solid #1a73e8;outline-offset:1px;border-color:#1a73e8}
  .wu-open{padding:6px 14px;font-size:13px}
  .wu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
  .empty-state{text-align:center;padding:60px 24px;color:var(--text-secondary);white-space:pre-line}
  .empty-state .icon{font-size:48px;margin-bottom:16px}
  footer{text-align:center;padding:20px;font-size:13px;color:var(--text-secondary);border-top:1px solid #e8eaed;margin-top:32px}
  /* Touch screens (2026-11-07): every button, select and button-like link
     at least 44px tall; card buttons were about 37px. !important because
     the header's buttons and term menu set their own height. */
${TURN_IN_CLIENT_CSS}
${DASH_TOUR_CSS}
  @media (pointer: coarse){
    button,select,.act{min-height:44px !important}
    .do-next a{display:inline-flex;align-items:center;min-height:44px}
  }
</style>
</head>
<body>
<header>
  <h1>📚 My Assignments</h1>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <button id="refresh-btn" class="refresh-btn" onclick="refreshAll()" aria-label="Refresh">↻ Refresh</button>
    <a id="canvas-btn" class="refresh-btn canvas-btn" href="${canvasUrl}" target="_blank" rel="noopener">Canvas <span aria-hidden="true">↗</span><span class="wu-sr"> (opens in a new tab)</span></a>
    <!-- F16 item 7 (2026-11-14): with the term selector gone, the other
         controls are in a menu button, as on the Teacher Dashboard: Enter,
         Space or ArrowDown opens it on the first item, ArrowUp on the last;
         arrows, Home and End move; Escape or a click outside closes it and
         puts focus back on More; Tab closes it. Each item keeps its id and
         handler. -->
    <div class="hdr-more" id="hdr-more">
      <button id="more-btn" class="refresh-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="more-menu">More <span aria-hidden="true">▾</span></button>
      <div id="more-menu" role="menu" aria-labelledby="more-btn" hidden>
        <div class="menu-account" role="presentation">Signed in as <span id="account-label">Loading…</span></div>
        <button id="my-info-btn" type="button" role="menuitem" tabindex="-1" onclick="toggleMyInfo()" aria-expanded="false" aria-controls="my-info-panel"><span aria-hidden="true">ℹ️</span> My Info</button>
        <button id="tour-btn" type="button" role="menuitem" tabindex="-1" aria-haspopup="dialog"><span aria-hidden="true">🧭</span> Show me around</button>
        <button id="cas-terms-btn" type="button" role="menuitem" tabindex="-1" onclick="casOpenTerms()" aria-haspopup="dialog"><span aria-hidden="true">❓</span> What do these mean?</button>
      </div>
    </div>
  </div>
</header>
${demo ? '<div class="demo-banner" id="demo-banner" role="note">Demo: a made-up student. Nothing here is saved.</div>' : ''}
<!-- The student's record (2026-10-27): Assignments, then three tabs each
     loaded when first opened. Only the signed-in student's own data. -->
<nav class="dash-tabs" role="tablist" aria-label="Your record">
  <button type="button" role="tab" id="tab-assignments" data-tab="assignments" aria-selected="true" aria-controls="panel-assignments">📋 Assignments</button>
  <button type="button" role="tab" id="tab-competencies" data-tab="competencies" aria-selected="false" aria-controls="panel-competencies">🎓 Competencies</button>
  <button type="button" role="tab" id="tab-warmups" data-tab="warmups" aria-selected="false" aria-controls="panel-warmups">✏️ Warm-ups</button>
  <button type="button" role="tab" id="tab-context" data-tab="context" aria-selected="false" aria-controls="panel-context">🗂️ My Context</button>
</nav>
<div id="panel-competencies" class="main" role="tabpanel" aria-labelledby="tab-competencies" style="display:none"></div>
<div id="panel-warmups" class="main" role="tabpanel" aria-labelledby="tab-warmups" style="display:none"></div>
<div id="panel-context" class="main" role="tabpanel" aria-labelledby="tab-context" style="display:none"></div>
<div id="panel-assignments" role="tabpanel" aria-labelledby="tab-assignments">
<div id="loading" role="status" aria-live="polite"><div class="spinner"></div><p>Loading your assignments…</p></div>
<!-- NEW (finding #7): persistent "My Info" view — what's actually on file
     for this student (name, class, period, teacher), available any time
     via the header button, not just a one-time notice. -->
<!-- FIXED (external UX audit): my-info-btn already had aria-expanded/
     aria-controls pointing here (the correct disclosure-widget half), but
     this panel itself had no role/label — the other half 07_TeacherDashboard.js's
     own role="tabpanel" aria-labelledby="tab-..." pattern establishes for
     every button-controlled region in that file. role="region" +
     aria-labelledby (pointing back at the button) is the matching pattern
     for a show/hide disclosure rather than a tab. -->
<div id="my-info-panel" class="main" role="region" aria-labelledby="my-info-btn" style="display:none;padding-bottom:0"></div>
<!-- NEW (finding #7): in-app notice for a recent registration, replacing
     the easy-to-miss one-time email — visible for a few days after a new
     registration is recorded, then fades out on its own as it ages past
     the "recent" window computed server-side (newRegistrations). -->
<!-- FIXED (external UX audit): matches the role="status" aria-live="polite"
     convention 07_TeacherDashboard.js already uses for its own dynamically
     shown/hidden notice regions (lesson-payoff-hint, draft-stale-hint) —
     this banner is the same shape (server-driven, appears without any
     user action) and had none. -->
<div id="new-registration-banner" class="main" role="status" aria-live="polite" style="display:none;padding-bottom:0"></div>
<div id="refresh-note" class="main refresh-note" role="status" aria-live="polite" style="display:none"></div>
<div id="news-banner" class="main news-banner" role="status" aria-live="polite" style="display:none"></div>
<div id="main" class="main" style="display:none"></div>
</div>
<footer id="footer"></footer>
<script>
// The last good load: a refresh renders it at once and revalidates in the
// background, so stale data never lingers past the next successful fetch.
// One page, the current marking period (F16): no term key any more.
let _dashCache = null;
let _loadGen = 0;
// NEW (finding #7): cached from the last successful render() so
// toggleMyInfo() can rebuild the panel without a fresh round-trip, and so
// a refresh doesn't need to re-derive "what's on file."
let _lastDashData = null;
let _myInfoOpen = false;
// fileId -> { ok, text } from this visit's Submit clicks, so a refresh or
// term change that rebuilds the cards doesn't wipe the student's answer.
let _submitMsgs = {};
// fileId -> { configId, questions, answers, msg } while a card shows the
// reflection questions. Page memory only: a reload starts them again.
let _reflect = {};
const REFLECT_MIN_WORDS = ${REFLECTION_MIN_WORDS};
const EC_MIN_WORDS = ${DASH_EC_MIN_WORDS};

// ── Demo mode (13's "Demo mode"): set by the server, never by the page ──
// The demo page asks the server for one thing, getDemoDashboardData (the
// whole fixture). Every other call goes through scriptRun() to DEMO_STUBS,
// in the page; a function with no stub fails here and never reaches the
// server. The turn-in code has its own stub (2026-11-18).
const DEMO = ${demo ? "true" : "false"};
// The turn-in card Open Canvas button: none in the demo, whose cards
// link nowhere real (the Canvas button in the header stays).
const CANVAS_URL = ${JSON.stringify(demo ? "" : canvasUrl)};
const DEMO_DELAY_MS = 300;
let _demoData = null;
let _demoNotes = {}; // fileId -> a note under the card ("this opens the document")
function _demoCard(fileId) {
  return ((_demoData && _demoData.dashboard.assignments) || []).filter(function (a) { return a.fileId === fileId; })[0] || null;
}
const DEMO_STUBS = {
  getStudentDashboardData: function () { return _demoData.dashboard; },
  getMyCompetencies:  function () { return _demoData.tabs.competencies; },
  getMyWarmUpHistory: function () { return _demoData.tabs.warmups; },
  getMyContext:       function () { return _demoData.tabs.context; },
  submitWarmUpAnswer: function () { return { ok: true, savedAt: "just now (demo: nothing was saved)" }; },
  submitWarmUpReply:  function () { return { ok: true, savedAt: "just now (demo: nothing was saved)" }; },
  getSubmitReflection: function (fileId) {
    const a = _demoCard(fileId);
    // A form, Slides or Sheets part: the reader's exact checks say "not yet" (a sample).
    if (a && a.demoFormNotYet) return { ok: false, error: "FORM_NOT_YET", reasons: a.demoFormNotYet };
    if (a && a.demoSlidesNotYet) return { ok: false, error: "SLIDES_NOT_YET", reasons: a.demoSlidesNotYet };
    if (a && a.demoSheetNotYet) return { ok: false, error: "SHEET_NOT_YET", reasons: a.demoSheetNotYet };
    return { ok: true, questions: (a && a.demoQuestions) || [] };
  },
  submitMyWork: function (fileId, configId, answers) {
    _demoWalkThrough(fileId);
    return { ok: true, aiFlowsLive: true, feedbackInComments: false, reflected: !!(answers && answers.length) };
  },
  retryMyCheck: function (fileId) {
    const a = _demoCard(fileId);
    if (!a) return { ok: false, error: "NOT_REGISTERED" };
    _demoWalkThrough(fileId);
    return { ok: true, card: Object.assign({}, (_demoData.walkthrough || {}).inLine || {}, { fileId: a.fileId, configId: a.configId,
      waiting: true, canRetry: false, canSubmit: false }) };
  },
  // The turn-in answer (71b's submitTurnInAnswer): taken as written, then
  // "checked"; the next check for news hands back the card's sample code.
  // Nothing is saved or sent.
  submitTurnInAnswer: function (configId) {
    const a = ((_demoData && _demoData.dashboard.assignments) || []).filter(function (x) { return x.configId === configId; })[0];
    if (!a || !a.turnIn) return { ok: false, reason: "Turn-in codes aren\u2019t on for this assignment." };
    return { ok: true, turnIn: { state: "PENDING_CHECK" } };
  },
  // The page's check for news: a card's state as the "server" now holds it
  // (_demoNext: the walk-through's next state, once it is due).
  getMyWaitingStatus: function (cards) {
    return { ok: true, cards: (cards || []).map(function (c) {
      const a = _demoCard(c.fileId);
      if (!a) return null;
      if (_demoNext[c.fileId]) { Object.assign(a, _demoNext[c.fileId]); delete _demoNext[c.fileId]; }
      const out = { fileId: a.fileId, configId: a.configId, waiting: !!a.waiting, status: a.status, statusPill: a.statusPill,
        statusClass: a.statusClass, displayStatus: a.displayStatus, statusNote: a.statusNote, canSubmit: a.canSubmit,
        lastEval: a.lastEval };
      if (c.turnIn && a.demoTurnInCode) out.turnIn = { state: "READY", code: a.demoTurnInCode };
      return out;
    }).filter(Boolean) };
  }
};
let _demoNext = {}; // fileId -> the state the next check for news finds
// A google.script.run look-alike that answers from DEMO_STUBS.
function demoRunner() {
  let ok = function () {}, fail = function () {};
  const r = {
    withSuccessHandler: function (f) { ok = f; return r; },
    withFailureHandler: function (f) { fail = f; return r; }
  };
  Object.keys(DEMO_STUBS).forEach(function (name) {
    r[name] = function () {
      const args = Array.prototype.slice.call(arguments);
      setTimeout(function () {
        let res;
        try { res = DEMO_STUBS[name].apply(null, args); } catch (e) { fail(e); return; }
        ok(res);
      }, DEMO_DELAY_MS);
    };
  });
  return r;
}
function scriptRun() { return DEMO ? demoRunner() : google.script.run; }
// ── Checking for news (2026-11-14, the operator's "Build 1-4", item 2) ──
// While a card waits (in line, being checked, or a turn-in answer being
// checked), the page asks getMyWaitingStatus about those cards only, every
// 20 to 40 seconds (with jitter, so a class doesn't ask at once), only
// while the page is in view, longer apart after a failed call, and at most
// POLL_MAX_PER_VISIT times a visit. It stops when nothing waits. When a card
// is done: that card is loaded again and re-rendered (focus and scroll kept),
// a polite banner says so, the tab's title says so until the page is
// used again, and the card is scrolled into view unless the student is
// typing. Page memory only; nothing is stored in the browser.
const POLL_MIN_MS = DEMO ? 1000 : 20000;
const POLL_JITTER_MS = DEMO ? 0 : 20000;
const POLL_MAX_PER_VISIT = 60;
const POLL_BACKOFF_MAX_MS = 5 * 60 * 1000;
let _poll = { timer: null, busy: false, count: 0, errors: 0, stopped: "" };
let _newsTitle = null; // the title before the news changed it

function _cardKey(a) { return a.fileId + "|" + a.configId; }
function _turnInWaiting(a) { return !!(a && a.turnIn && a.turnIn.state === "PENDING_CHECK"); }
function waitingCards(data) {
  return ((data && data.assignments) || []).filter(a => a.fileId && a.configId && (a.waiting || _turnInWaiting(a)));
}
function _pageVisible() {
  return typeof document === "undefined" || !document.visibilityState || document.visibilityState === "visible";
}
function _pollDelay() {
  const base = POLL_MIN_MS + Math.floor(Math.random() * POLL_JITTER_MS);
  return Math.min(POLL_BACKOFF_MAX_MS, base * Math.pow(2, _poll.errors));
}
function _cancelPoll() {
  if (_poll.timer && typeof clearTimeout === "function") clearTimeout(_poll.timer);
  _poll.timer = null;
}
function schedulePoll() {
  if (_poll.timer || _poll.busy) return;
  if (!waitingCards(_lastDashData).length) { _poll.stopped = "nothing waits"; return; }
  if (_poll.count >= POLL_MAX_PER_VISIT) {
    if (_poll.stopped !== "cap") _newsSay("This page has stopped checking for news. Press Refresh to see what’s ready.");
    _poll.stopped = "cap";
    return;
  }
  if (!_pageVisible()) { _poll.stopped = "hidden"; return; }
  _poll.stopped = "";
  _poll.timer = setTimeout(pollNow, _pollDelay());
}
function pollNow() {
  _poll.timer = null;
  if (!_pageVisible()) { _poll.stopped = "hidden"; return; }
  const list = waitingCards(_lastDashData);
  if (!list.length) { _poll.stopped = "nothing waits"; return; }
  _poll.count++;
  _poll.busy = true;
  const sent = list.map(a => ({ fileId: a.fileId, configId: a.configId, turnIn: _turnInWaiting(a), waiting: !!a.waiting }));
  scriptRun()
    .withSuccessHandler(function (res) { _poll.busy = false; onPollResult(sent, res); })
    .withFailureHandler(function () { _poll.busy = false; _poll.errors++; schedulePoll(); })
    .getMyWaitingStatus(sent.map(c => ({ fileId: c.fileId, configId: c.configId, turnIn: c.turnIn })));
}
function _findCard(fileId, configId) {
  return ((_lastDashData && _lastDashData.assignments) || []).filter(a => a.fileId === fileId && a.configId === configId)[0] || null;
}
const NEWS_FIELDS = ["status", "statusPill", "statusClass", "displayStatus", "statusNote", "canSubmit", "canRetry", "stages"];
function onPollResult(sent, res) {
  if (!res || !res.ok || !Array.isArray(res.cards)) { _poll.errors++; schedulePoll(); return; }
  _poll.errors = 0;
  const byKey = {};
  res.cards.forEach(c => { byKey[c.fileId + "|" + c.configId] = c; });
  const finished = [];
  let reload = false, changed = false;
  sent.forEach(s => {
    const c = byKey[s.fileId + "|" + s.configId];
    const a = _findCard(s.fileId, s.configId);
    if (!c || !a) return;
    if (s.waiting && !c.waiting) {
      finished.push({ a: a, c: c, kind: "feedback" });
      reload = true;
    } else if (s.waiting && (c.statusPill !== a.statusPill || JSON.stringify(c.stages) !== JSON.stringify(a.stages))) {
      // In line, then being checked: the pill moves on.
      NEWS_FIELDS.forEach(k => { a[k] = c[k]; });
      changed = true;
    }
    if (s.turnIn && c.turnIn && c.turnIn.state === "READY") {
      a.turnIn = { state: "READY", code: c.turnIn.code };
      finished.push({ a: a, c: c, kind: "code" });
      changed = true;
    } else if (s.turnIn && c.turnIn && c.turnIn.state !== "PENDING_CHECK") {
      finished.push({ a: a, c: c, kind: "answer" });
      reload = true;
    }
  });
  if (reload) { _reloadFinished(finished); return; }
  if (changed && _lastDashData) render(_lastDashData);
  _announce(finished);
  schedulePoll();
}
// A card is done: the dashboard once, and only the finished cards taken
// from it, so the rest of the page stays as the student left it.
function _reloadFinished(finished) {
  _poll.busy = true;
  const applyLight = function () {
    finished.forEach(f => {
      if (f.kind !== "feedback") return;
      NEWS_FIELDS.forEach(k => { f.a[k] = f.c[k]; });
      f.a.waiting = false;
      if (f.c.lastEval) f.a.lastEval = f.c.lastEval;
    });
  };
  scriptRun()
    .withSuccessHandler(function (data) {
      _poll.busy = false;
      if (data && !data.error && _lastDashData) {
        const fresh = {};
        (data.assignments || []).forEach(x => { fresh[_cardKey(x)] = x; });
        finished.forEach(f => {
          const list = _lastDashData.assignments || [];
          const i = list.indexOf(f.a);
          const k = _cardKey(f.a);
          if (fresh[k] && i !== -1) { list[i] = fresh[k]; f.a = fresh[k]; }
        });
        applyLight(); // a card the load left out still stops waiting
        _dashCache = _lastDashData;
      } else {
        applyLight();
      }
      if (_lastDashData) render(_lastDashData);
      _announce(finished);
      schedulePoll();
    })
    .withFailureHandler(function () {
      _poll.busy = false;
      applyLight();
      if (_lastDashData) render(_lastDashData);
      _announce(finished);
      schedulePoll();
    })
    .getStudentDashboardData();
}
function _newsSay(text) {
  const el = document.getElementById("news-banner");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}
// Typing in a box (a reflection, a warm-up, a turn-in answer): the page
// doesn't move under the student.
function _studentTyping() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const t = String(el.tagName || "").toUpperCase();
  return t === "TEXTAREA" || (t === "INPUT" && !el.readOnly) || !!el.isContentEditable;
}
function _announce(finished) {
  if (!finished || !finished.length) return;
  const said = finished.map(f => (f.kind === "code" ? "Your turn-in code is ready: "
    : f.kind === "answer" ? "Your answer was checked: " : "Feedback is ready: ") + cardName(f.a) + ".");
  _newsSay(said.join(" "));
  if (typeof document !== "undefined") {
    if (_newsTitle === null) _newsTitle = document.title;
    const feedback = finished.some(f => f.kind === "feedback");
    document.title = "(" + finished.length + ") " + (feedback ? "Feedback ready" : "Ready") + " · " + _newsTitle;
  }
  if (!_studentTyping()) {
    const el = document.getElementById(cardId(finished[0].a));
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
// ── Where the work is (2026-11-14, "Build 1-4", item 3) ──
// A waiting card's stages, with only the times the server found (the
// Ledger's SubmissionTS, the staging row's stamps); "usually about N min" on
// Being checked only from FlowMeasures' measured median. After SLOW_MS in
// one stage the card offers "Check again": a status check now (the same
// getMyWaitingStatus), at most once a minute; it changes nothing.
const SLOW_MS = 8 * 60 * 1000;
const CHECK_AGAIN_EVERY_MS = 60 * 1000;
let _lastCheckAgain = 0;
const STAGE_ORDER = [["SUBMITTED", "Submitted", "submitted"], ["IN_LINE", "In line", "inLine"],
  ["CHECKING", "Being checked", "checking"], ["READY", "Feedback ready", ""]];
function stageLineHtml(a) {
  const st = a && a.waiting && a.stages;
  if (!st) return "";
  const at = STAGE_ORDER.map(x => x[0]).indexOf(st.current);
  let h = '<ol class="stages" aria-label="Where your work is">';
  STAGE_ORDER.forEach((x, i) => {
    if (x[0] === "SUBMITTED" && !st.submitted) return; // no stamp: not shown
    const cls = i < at ? "done" : i === at ? "now" : "";
    const time = x[2] && st[x[2]] ? st[x[2]] : "";
    const usual = x[0] === "CHECKING" && st.usualMin ? "usually about " + st.usualMin + " min" : "";
    h += '<li' + (cls ? ' class="' + cls + '"' : '') + (i === at ? ' aria-current="step"' : '') + '>' +
      (i < at ? "✓ " : "") + esc(x[1]) +
      (time ? '<span class="st-time">' + esc(time) + '</span>' : usual ? '<span class="st-time">' + esc(usual) + '</span>' : '') +
      '</li>';
  });
  h += '</ol>';
  if (st.since && Date.now() - st.since > SLOW_MS) {
    h += '<div class="slow-note">Taking a while. Your work is saved. ' +
      '<button type="button" class="chip" data-file="' + esc(a.fileId) + '" onclick="checkAgain(this)">Check again</button></div>';
  }
  return h;
}
function checkAgain(btn) {
  if (Date.now() - _lastCheckAgain < CHECK_AGAIN_EVERY_MS || _poll.busy) {
    _newsSay("Checked a moment ago. This page keeps checking for you.");
    return;
  }
  _lastCheckAgain = Date.now();
  _cancelPoll();
  pollNow();
}
// Try again on a check that timed out: the server puts the student's own
// row back in line (retryMyCheck: its own row only, only after a timeout,
// once per 10 minutes per card).
let _retryMsgs = {};
function retryCheck(btn) {
  const fileId = btn.getAttribute("data-file"), configId = btn.getAttribute("data-config");
  btn.disabled = true;
  btn.textContent = "Putting it back in line…";
  scriptRun()
    .withSuccessHandler(function (res) { retryDone(fileId, configId, res); })
    .withFailureHandler(function () { retryDone(fileId, configId, null); })
    .retryMyCheck(fileId, configId);
}
function retryDone(fileId, configId, res) {
  const a = _findCard(fileId, configId);
  if (res && res.ok && res.card && a) {
    Object.assign(a, res.card);
    _submitMsgs[fileId] = { ok: true, text: "Back in line. This page shows your feedback when it’s ready." };
  } else {
    _submitMsgs[fileId] = { ok: false, text: res && res.error === "TOO_SOON"
      ? "You tried a moment ago. You can try again in " + res.waitMin + " min."
      : res && res.error === "ALREADY_QUEUED" ? "It’s already back in line."
      : res && res.error === "NOT_TIMED_OUT" ? "This check isn’t stopped any more. Press Refresh to see where it is."
      : "The page didn’t answer. Try again in a minute." };
  }
  _dashCache = null;
  if (_lastDashData) render(_lastDashData);
}

// The title goes back once the student is on the page again.
function _clearNewsTitle() {
  if (_newsTitle === null || typeof document === "undefined") return;
  document.title = _newsTitle;
  _newsTitle = null;
}
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("visibilitychange", function () {
    if (_pageVisible()) schedulePoll();
    else { _cancelPoll(); _poll.stopped = "hidden"; }
  });
  document.addEventListener("keydown", _clearNewsTitle);
  document.addEventListener("pointerdown", _clearNewsTitle);
}
if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("focus", _clearNewsTitle);

// The demo's one server call.
function _loadDemo() {
  google.script.run
    .withSuccessHandler(function (d) {
      if (!d || d.error || !d.dashboard) { render({ error: (d && d.error) || "The demo could not be loaded." }); return; }
      _demoData = d;
      loadData();
    })
    .withFailureHandler(function () { render({ error: "The demo could not be loaded. Try refreshing." }); })
    .getDemoDashboardData();
}
// After a demo Submit: waiting (submitDone), then being checked, then the
// check's result: revise, with its "Not yet:" line. Page memory only.
function _demoWalkThrough(fileId) {
  const steps = (_demoData && _demoData.walkthrough) || {};
  const apply = function (st, extra) {
    const a = _demoCard(fileId);
    if (!a || !st) return;
    Object.assign(a, st, extra || {});
    if (_lastDashData) render(_lastDashData);
  };
  setTimeout(function () {
    delete _submitMsgs[fileId];
    apply(steps.beingChecked, { canSubmit: false });
  }, 1500);
  // The result reaches the card the way a real one does: the page's next
  // check for news finds it (getMyWaitingStatus's stub, above).
  setTimeout(function () {
    const a = _demoCard(fileId);
    _submitMsgs[fileId] = { ok: true, text: "Demo: the check is done. In the real dashboard the feedback is now in the student's document." };
    _demoNext[fileId] = Object.assign({}, steps.revise, { canSubmit: true, lastEval: "just now", notYet: (a && a.demoNotYet) || "" });
  }, 4500);
}
// View feedback (2026-11-17): opens the doc with its feedback comment open.
// The tab opens at once, on the click (a tab opened after the server answers
// would be blocked as a pop-up), then goes to the comment's link, or to the
// doc as before when there is none. With pop-ups blocked the link opens the
// doc as it always did.
function openFeedback(link) {
  const w = window.open("", "_blank");
  if (!w) return true;
  const docUrl = link.href;
  try { w.document.title = "Opening your feedback…"; w.document.body.textContent = "Opening your feedback…"; } catch (e) {}
  const go = function(url) { try { w.location.replace(url || docUrl); } catch (e) { w.location = url || docUrl; } };
  google.script.run
    .withSuccessHandler(function(res) { go(res && res.ok && /^https:\\/\\/docs\\.google\\.com\\//.test(res.url || "") ? res.url : ""); })
    .withFailureHandler(function() { go(""); })
    .getMyFeedbackLink(link.getAttribute("data-file"), link.getAttribute("data-config"));
  return false;
}

function demoOpenDoc(btn) {
  const a = _demoCard(btn.getAttribute("data-file"));
  _demoNotes[btn.getAttribute("data-file")] = "In the real dashboard this opens the student's " +
    (a && a.workType === "form" ? "own copy of the form, to build in Google Forms."
      : a && a.workType === "slides" ? "own copy of the slides, to make in Google Slides."
      : a && a.workType === "sheet" ? "own copy of the sheet, to build in Google Sheets." : "document.");
  if (_lastDashData) render(_lastDashData);
}

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
  if (DEMO && !_demoData) { _loadDemo(); return; }
  const refreshBtn = document.getElementById("refresh-btn");
  // The generation counter already prevents a stale response from ever
  // rendering, so rapid re-clicks never glitch the UI — but they still fire
  // redundant concurrent Apps Script executions that are immediately
  // thrown away. Disabling for the duration of this call's own round-trip
  // avoids that waste.
  if (refreshBtn) refreshBtn.disabled = true;
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  const myGen   = ++_loadGen;
  const cached  = _dashCache;
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

  scriptRun()
    .withSuccessHandler(function(data) {
      if (myGen !== _loadGen) return; // a newer request already superseded this one
      if (data && !data.error) _dashCache = data;
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() { render(data); if (refreshBtn) refreshBtn.disabled = false; });
    })
    .withFailureHandler(function(e) {
      if (myGen !== _loadGen) return;
      if (cached) {
        // Still showing the cached data, but say so: a failed refresh used to
        // look exactly like one that found nothing new (UX audit, 2026-10-22).
        _showRefreshNote(cached);
        if (refreshBtn) refreshBtn.disabled = false;
        return;
      }
      // Plain-language message for the student; the real e.message is
      // already logged server-side by whatever threw it, so it isn't
      // repeated here — a stack-trace fragment isn't actionable for them.
      _afterMinSpinnerDelay(shownSpinnerAt, myGen, function() {
        loading.innerHTML =
          '<p style="color:#b3261e;padding:24px 24px 8px;">⚠ Something went wrong loading your assignments. Try refreshing.</p>' +
          '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1967d2;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
        if (refreshBtn) refreshBtn.disabled = false;
      });
    })
    .getStudentDashboardData();
}

function _showRefreshNote(data) {
  const el = document.getElementById("refresh-note");
  if (!el) return;
  el.textContent = "Couldn't refresh. Showing what loaded at " + ((data && data.generatedAt) || "an earlier time") +
    ". Check your connection and press Refresh.";
  el.style.display = "block";
}

function render(data) {
  const note = document.getElementById("refresh-note");
  if (note) { note.style.display = "none"; note.textContent = ""; }
  const loading = document.getElementById("loading");
  const main    = document.getElementById("main");
  // Any refresh (manual, term change, or a cache revalidation) rebuilds the
  // whole card list via innerHTML — preserve scroll position instead of
  // dumping the student back to the top of the list.
  const _scrollTop = main.scrollTop;
  const _winY = typeof window !== "undefined" && typeof window.scrollY === "number" ? window.scrollY : null;
  const _focus = _focusKey();

  if (data.error) {
    // This is an application-level error (e.g. identity not found) — a
    // separate path from the network-failure branch in loadData(), which
    // already gets both of these. Without them, the header's account
    // label stayed stuck on "Loading…" forever, and there was no way to
    // retry without a full page refresh.
    document.getElementById("account-label").textContent = "—";
    loading.innerHTML =
      '<p style="color:#b3261e;padding:24px 24px 8px;">' + esc(data.error) + '</p>' +
      '<button onclick="this.disabled=true;loadData()" style="padding:9px 22px;border-radius:6px;border:none;background:#1967d2;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Try Again</button>';
    return;
  }

  document.getElementById("account-label").textContent = data.googleId || "";

  // NEW (finding #7): cache for toggleMyInfo(), then render the "just
  // registered" notice and (if already open) refresh the My Info panel.
  _lastDashData = data;
  renderNewRegistrationBanner(data);
  if (_myInfoOpen) renderMyInfo(data);

  if (!data.assignments || data.assignments.length === 0) {
    main.innerHTML = termLineHtml(data) + renderWarmUps(data) + \`<div class="empty-state">
      <div class="icon">📋</div>
      <p>\${esc(data.emptyReason || "No assignments found.")}</p>
    </div>\` + renderCompetencies(data);
    loading.style.display = "none";
    main.style.display    = "block";
    _setFooter(data); // walk-through finding 17: it stayed blank here
    return;
  }

  // Block sort order — uses system default, gracefully handles unknown values
  // Admins can customize this via the BLOCK_ORDER Script Property
  const blockOrder = ["1","2O","2E","3O","3E","4O","4E"];
  // The sort and the filters (F16 item 3) change only the classes' lists;
  // Do next always lists everything that needs the student.
  const listed = sortCards(filterCards(data.assignments, _listView.filters), _listView.sort);
  const groups = {};
  listed.forEach(a => {
    if (!groups[a.folderLabel]) groups[a.folderLabel] = [];
    groups[a.folderLabel].push(a);
  });

  const sortedGroups = Object.keys(groups).sort((a, b) => {
    const ba = a.split(" - ")[0], bb = b.split(" - ")[0];
    const ia = blockOrder.indexOf(ba), ib = blockOrder.indexOf(bb);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return a.localeCompare(b);
  });

  // This week's work first (F16 item 7): Do next, the warm-ups, the
  // classes; the competency counts after them.
  let html = termLineHtml(data) + doNextHtml(data.assignments, data.lockedParts) + renderWarmUps(data) + listControlsHtml();
  if (!listed.length) {
    html += '<p class="filter-empty" role="status">Nothing here with these filters. <button type="button" class="chip" onclick="clearFilters()">Show all</button></p>';
  }
  sortedGroups.forEach(gk => {
    html += \`<div class="group-header">Block \${esc(gk)}</div>\`;
    // A lesson in parts (68) is one card (F16 item 4), where its first part
    // would be: the part to work on now, a stepper, and the rest on tap.
    const shownLessons = {};
    groups[gk].forEach(a => {
      if (!a.part) { html += cardHtml(a); return; }
      if (shownLessons[a.part.lesson]) return;
      shownLessons[a.part.lesson] = true;
      html += lessonCardHtml(a.part, groups[gk], data.lockedParts || []);
    });
  });

  html += renderCompetencies(data);
  main.innerHTML = html;
  loading.style.display = "none";
  main.style.display    = "block";
  main.scrollTop = _scrollTop;
  // A refresh or a submit keeps the page where it was and the focus where
  // the student left it (or on its card, when that button is gone).
  if (_winY !== null && window.scrollTo) window.scrollTo(0, _winY);
  _restoreFocus(_focus);
  _setFooter(data);
  schedulePoll(); // a card waits: check for news (no-op when one is pending)
  tourMaybeStart(data);
}

function _focusKey() {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el || !el.getAttribute) return null;
  return { id: el.id || "", file: el.getAttribute("data-file") || "" };
}
function _restoreFocus(k) {
  if (!k || (!k.id && !k.file)) return;
  let el = k.id ? document.getElementById(k.id) : null;
  if ((!el || el.hidden) && k.file) {
    const a = ((_lastDashData && _lastDashData.assignments) || []).filter(x => x.fileId === k.file)[0];
    el = a ? document.getElementById(cardId(a)) : null;
  }
  if (el && el.focus) el.focus({ preventScroll: true });
}

// What a card's filled (primary) button is, by its status. The other
// actions on the card are outlined (secondary). The statuses are the ones
// resolveStudentClass_ and resolveStudentPill_ already use:
//
//   statusClass   pill                                    primary
//   NOT_STARTED   Not started                             Open My Document
//   IN_PROGRESS   Waiting for feedback / Being checked /  Open My Document
//                 Turned in
//   NEEDS_ACTION  Revise / Feedback ready                 Open My Document (read the
//                                                         feedback, revise; Submit
//                                                         beside it, outlined)
//   DONE          Passed ✓ / Done ✓                       View feedback (the doc)
//   ISSUE         Check stopped                           Try again (retryMyCheck)
//   ISSUE         Couldn't be checked                     Open My Document
//
// Since 2026-11-16 (UX audit item 3) a Revise card's filled button is the
// document, not Submit: the first step after feedback is reading it and
// revising, and a filled Submit invited sending the same work again. Submit
// stays on the card, outlined.
function primaryActionFor(a) {
  if (a.canRetry && !a.waiting) return "retry";
  if (a.statusClass === "DONE") return "view";
  return "open";
}

// The "Last checked" line, from the status: nothing while the work is
// being checked (it used to say "Not checked yet" beside "Being checked
// now…"), before it was ever started, or on a check that failed or timed
// out (ISSUE): its own line already says what happened, and "Not checked
// yet" beside "Couldn't be checked" read as a contradiction.
function evalLine(a) {
  if (a.statusPill === "Being checked" || a.statusClass === "NOT_STARTED" || a.statusClass === "ISSUE") return "";
  return a.lastEval ? "Last checked: " + a.lastEval : "Not checked yet";
}

// The assignment's name as the card shows it (F16 item 6): the name
// students see in Canvas, without a leading "L05 " the chip already shows,
// and in sentence case when it is all capitals (8175's names): display only,
// the source data is unchanged. A few words keep their own capitals.
// The word list is 00's LESSON_NAME_CASE (2026-11-19), which the Student
// Context doc uses too (lessonNameReadable_).
const NAME_CASE = ${JSON.stringify(LESSON_NAME_CASE)};
function sentenceCase(text) {
  const t = String(text || "").trim();
  if (!t || /[a-z]/.test(t) || !/[A-Z]/.test(t)) return t;
  let out = t.toLowerCase().replace(/[a-z]+/g, function (w) { return NAME_CASE[w] || w; });
  out = out.replace(/my cause my cleats/g, "My Cause My Cleats");
  return out.charAt(0).toUpperCase() + out.slice(1);
}
function cardName(a) {
  let name = String((a.part && a.part.lessonName) || a.unitName || "").trim();
  if (a.lessonNo) name = name.replace(/^L\\d{1,3}\\s+/, "");
  return sentenceCase(name);
}
function partLabel(a) {
  return a.part ? "Part " + a.part.n + " of " + a.part.count + (a.part.title ? ": " + a.part.title : "") : "";
}
// The name, then the part ("Do next", the Email link): says which
// assignment a part belongs to.
function cardTitle(a) {
  return cardName(a) + (a.part ? " \u2014 " + partLabel(a) : "");
}
function chipHtml(a) {
  return a.lessonNo ? '<span class="lesson-chip">' + esc(a.lessonNo) + '</span>' : "";
}

function cardId(a) {
  return "card-" + String(a.configId || a.fileId || "").replace(/[^A-Za-z0-9_-]/g, "_");
}

// ── Sort and filters (F16 item 3) ─────────────────────────────────────────
// Sort: Assigned order (the server's order, the default), Needs attention
// first (the order before F16: couldn't be checked, revise, in progress,
// not started, done), Recently checked, Not yet shown first (by the
// primary milestone's mark). Filters: chips, any number on; none on shows
// everything. A lesson in parts goes by the part on its card. Kept in page
// memory for the visit: Refresh, the tabs and every re-render keep it, and
// a new visit starts at Assigned order with no filter. Not the browser's session storage,
// as F16 proposed: the operator's standing rule (2026-10-22) is that no
// cas-ccps page stores anything in the browser
// (tests/tools/no-browser-storage.test.js); that choice is the operator's.
const SORTS = [["assigned", "Assigned order"], ["attention", "Needs attention first"],
  ["recent", "Recently checked"], ["notshown", "Not yet shown first"]];
const FILTERS = [["NEEDS_ACTION", "Needs action"], ["IN_PROGRESS", "In progress"], ["NOT_STARTED", "Not started"], ["DONE", "Done"]];
let _listView = { sort: "assigned", filters: [] };
function setSort(v) {
  if (!SORTS.some(s => s[0] === v)) return;
  _listView.sort = v;
  if (_lastDashData) render(_lastDashData);
}
function toggleFilter(btn) {
  const f = btn.getAttribute("data-filter");
  const on = _listView.filters.indexOf(f) !== -1;
  _listView.filters = on ? _listView.filters.filter(x => x !== f) : _listView.filters.concat([f]);
  if (_lastDashData) render(_lastDashData);
}
function clearFilters() {
  _listView.filters = [];
  if (_lastDashData) render(_lastDashData);
}
function listControlsHtml() {
  return '<div class="list-controls"><label for="sort-sel">Sort</label><select id="sort-sel" onchange="setSort(this.value)">' +
    SORTS.map(s => '<option value="' + s[0] + '"' + (s[0] === _listView.sort ? " selected" : "") + '>' + esc(s[1]) + '</option>').join("") +
    '</select><div class="chips" role="group" aria-label="Show only">' +
    FILTERS.map(f => '<button type="button" class="chip" id="chip-' + f[0] + '" data-filter="' + f[0] + '" aria-pressed="' +
      (_listView.filters.indexOf(f[0]) !== -1) + '" onclick="toggleFilter(this)">' + esc(f[1]) + '</button>').join("") +
    '</div></div>';
}
// The card a lesson in parts shows (lessonCardHtml's rule): its parts here.
function _shownPart(parts) {
  const open = parts.slice().sort((x, y) => x.part.n - y.part.n);
  return open.filter(a => a.statusClass !== "DONE")[0] || open[open.length - 1];
}
function _byLesson(list) {
  const out = {};
  list.forEach(a => { if (a.part) (out[a.part.lesson] = out[a.part.lesson] || []).push(a); });
  return out;
}
// The status a filter reads: a lesson in parts by the part on its card;
// "Needs action" includes a check that couldn't be done.
function filterCards(list, filters) {
  if (!filters || !filters.length) return list.slice();
  const lessons = _byLesson(list);
  const want = {};
  filters.forEach(f => { want[f] = true; if (f === "NEEDS_ACTION") want.ISSUE = true; });
  return list.filter(a => want[(a.part ? _shownPart(lessons[a.part.lesson]) : a).statusClass]);
}
const ATTENTION = { ISSUE: 0, NEEDS_ACTION: 1, IN_PROGRESS: 2, NOT_STARTED: 3, DONE: 4 };
const NOT_SHOWN_RANK = { NOT_MET: 0, PARTIALLY_MET: 1, UNCHECKED: 2, MET: 3 };
function sortCards(list, mode) {
  const out = list.slice();
  if (!mode || mode === "assigned") return out;
  const lessons = _byLesson(out);
  const rep = (a) => (a.part ? _shownPart(lessons[a.part.lesson]) : a);
  const at = new Map(out.map((a, i) => [a, i]));
  const key = mode === "attention" ? (a => ATTENTION[rep(a).statusClass] ?? 5)
    : mode === "recent" ? (a => -Math.max.apply(null, (a.part ? lessons[a.part.lesson] : [a]).map(x => x.lastEvalAt || 0)) || 0)
    : (a => { const m = (rep(a).milestones || [])[0]; return m ? NOT_SHOWN_RANK[m.markKey] ?? 4 : 4; });
  // Stable: ties keep the assigned order.
  out.sort((a, b) => (key(a) - key(b)) || (at.get(a) - at.get(b)));
  return out;
}

// The marking period the page shows (F16): the term selector is gone.
function termLineHtml(data) {
  return data && data.termLabel ? '<p class="term-line">' + esc(data.termLabel) + '</p>' : "";
}

// "Do next", above the classes: every card that needs the student, a
// couldn't-be-checked one first, then the ones to revise, each in the
// cards' order. A timeout is left out: the student has nothing to do
// ("your teacher knows"). Nothing when empty.
function doNextHtml(list, locked) {
  const items = (list || []).filter(a => a.statusClass === "ISSUE" && a.status !== "ERROR_TIMEOUT")
    .concat((list || []).filter(a => a.statusClass === "NEEDS_ACTION"))
    // Then a part never submitted whose next part waits on it (2026-11-17,
    // D-P: 114 of 124 locked parts were waiting on a part never checked).
    .concat((list || []).filter(a => waitsOnSubmit(a, locked)));
  if (!items.length) return "";
  return '<section class="do-next" aria-labelledby="do-next-h"><h2 id="do-next-h">Do next</h2><ul>' +
    items.map(a => '<li>' + chipHtml(a) + '<a href="#' + esc(cardId(a)) + '" onclick="return goToCard(\\'' + esc(cardId(a)) + '\\')">' +
      esc(cardName(a)) + '</a><span class="dn-meta">' + [a.part ? "Part " + a.part.n + " of " + a.part.count : "", a.className]
        .filter(Boolean).map(esc).join(" · ") + '</span>' + (waitsOnSubmit(a, locked)
        ? '<span class="pill pill-submit">Submit to open Part ' + (a.part.n + 1) + '</span>'
        : '<span class="pill pill-' + esc(a.statusClass) + '">' + esc(a.statusPill || a.displayStatus) + '</span>') + '</li>').join("") +
    '</ul></section>';
}

// An open part not submitted yet whose next part is locked waiting on it.
function waitsOnSubmit(a, locked) {
  return !!(a && a.part && a.statusClass === "NOT_STARTED" && a.canSubmit &&
    (locked || []).some(l => l.lesson === a.part.lesson && l.n === a.part.n + 1));
}

// Scrolls to a card and moves focus there (the card has tabindex="-1").
function goToCard(id) {
  // A part shown under its lesson's "All parts" opens it first.
  const lesson = _partInList[id];
  if (lesson && !_partsOpen[lesson] && _lastDashData) { _partsOpen[lesson] = true; render(_lastDashData); }
  const el = document.getElementById(id);
  if (el) {
    if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (el.focus) el.focus({ preventScroll: true });
  }
  return false;
}

// One assignment's card.
// opts.lesson: the lesson card of a lesson in parts (lessonCardHtml): its
// stepper under the name, and its other parts after the actions.
// opts.inList: a part under its lesson's "All parts" (no marks; the lesson
// card has them).
function cardHtml(a, opts) {
  opts = opts || {};
  const primary = primaryActionFor(a);
  const cls = (p) => "act " + (p ? "act-primary" : "act-secondary");
  // A form, Slides or Sheets part (4b/4c): its feedback is on its feedback page
  // (its snapshot doc).
  const noun = WORK_NOUN[a.workType] || "";
  const feedbackPage = noun ? safeDocUrl(a.feedbackUrl) : null;
  const doc = primary === "view" && feedbackPage ? feedbackPage : safeDocUrl(a.docUrl);
  const openLabel = primary === "view" ? "View feedback" : noun ? "Open your " + (a.workType === "slides" ? "slides" : noun) : "Open My Document";
  // The demo has no document: its button shows a note instead.
  const docBtn = DEMO
    ? \`<button type="button" class="\${cls(primary !== "submit" && primary !== "retry" && !_reflect[a.fileId])}\${primary === "view" ? " act-done" : ""}" data-file="\${esc(a.fileId)}" onclick="demoOpenDoc(this)">\${openLabel}</button>\`
    : doc
    ? \`<a href="\${esc(doc)}" target="_blank" class="\${cls(primary !== "submit" && primary !== "retry" && !_reflect[a.fileId])}\${primary === "view" ? " act-done" : ""}"\${primary === "view" ? \` data-file="\${esc(a.fileId)}" data-config="\${esc(a.configId)}" onclick="return openFeedback(this)"\` : ""}>\${openLabel} ↗</a>\`
    : \`<span style="color:var(--text-secondary);font-size:13px;">\${a.workType === "form" ? "Form" : a.workType === "slides" ? "Slides" : a.workType === "sheet" ? "Sheet" : "Document"} not yet available</span>\`;
  // A form, Slides or Sheets part (Phase 4b/4c/4d): Submit as for a doc; the server reads the file.
  const submitBtn = a.canSubmit && !_reflect[a.fileId]
    ? \`<button type="button" id="sub-\${esc(cardId(a))}" class="\${cls(primary === "submit")}" data-file="\${esc(a.fileId)}" data-config="\${esc(a.configId)}" onclick="submitWork(this)">Submit for Feedback</button>\`
    : "";
  // A check that timed out (2026-11-14): Try again puts it back in line.
  const retryBtn = a.canRetry && !a.waiting
    ? \`<button type="button" id="retry-\${esc(cardId(a))}" class="act act-primary" data-file="\${esc(a.fileId)}" data-config="\${esc(a.configId)}" onclick="retryCheck(this)">Try again</button>\`
    : "";
  const ev = evalLine(a);
  return \`<div class="card \${a.statusClass}\${opts.lesson ? " lesson-card" : ""}" id="\${esc(cardId(a))}" tabindex="-1">
    <div class="card-top">
      <div><div class="unit-name">\${chipHtml(a)}\${esc(cardName(a))}</div>\${opts.lesson ? opts.lesson.stepper : ""}\${a.part ? \`<div class="part-sub">\${esc(partLabel(a))}</div>\` : ""}</div>
      <div class="pill pill-\${a.statusClass}">\${esc((opts.lesson && a.part ? "Part " + a.part.n + ": " : "") + (a.statusPill || a.displayStatus))}</div>
    </div>
    \${a.taskLine ? \`<div class="task-line">\${esc(a.taskLine)}</div>\` : ""}
    \${opts.inList ? "" : marksHtml(a, !!opts.lesson)}
    \${a.statusNote ? \`<div class="status-note">\${esc(a.statusNote)}</div>\` : ""}
    \${a.openPastTerm ? \`<div class="past-term-note">Your teacher kept this open after its marking period ended.</div>\` : ""}
    \${a.statusClass === "NEEDS_ACTION" && a.notYet ? \`<div class="next-step"><b>Not yet:</b> \${esc(a.notYet)}</div>\` : ""}
    <!-- F16 item 6: no "Period · Subject" line; the block header above
         the class says it. -->
    \${a.dueText ? \`<div class="due-line\${/^Was due/.test(a.dueText) ? " past" : ""}">\${esc(a.dueText)}</div>\` : ""}
    \${ev ? \`<div class="eval-line">\${esc(ev)}</div>\` : ""}
    \${stageLineHtml(a)}
    <div class="card-actions">
    \${retryBtn}\${primary === "submit" ? submitBtn + docBtn : docBtn + submitBtn}
    </div>
    \${noun ? \`<div class="form-note">\${esc(WORK_SUBMIT_NOTE[a.workType])}\${feedbackPage && primary !== "view" ? \` <a href="\${esc(feedbackPage)}" target="_blank">Your \${esc(noun)}'s feedback page ↗</a>\` : ""}</div>\` : ""}
    \${DEMO && _demoNotes[a.fileId] ? \`<div class="demo-note" role="status">\${esc(_demoNotes[a.fileId])}</div>\` : ""}
    \${a.canSubmit && _reflect[a.fileId] ? reflectFormHtml(a) : ""}
    \${_submitMsgs[a.fileId]
      ? \`<div class="submit-msg \${_submitMsgs[a.fileId].ok ? "ok" : "err"}" role="status">\${esc(_submitMsgs[a.fileId].text)}</div>\`
      : ""
    }
    \${turnInCardHtml(a)}
    \${a.submittedAt
      ? \`<div class="submitted-note">Last submitted \${esc(a.submittedAt)}</div>\`
      : ""
    }
    \${a.statusClass === "ISSUE" && a.teacherEmail
      ? \`<div style="margin-top:8px"><a href="mailto:\${esc(a.teacherEmail)}?subject=\${encodeURIComponent("Question about: " + a.unitName)}" style="font-size:13px;color:#1557b0;text-decoration:none;font-weight:500">✉ Email \${esc(a.teacherName || "your teacher")}</a></div>\`
      : ""
    }
    \${opts.lesson ? opts.lesson.after : ""}
  </div>\`;
}

// The lesson's measured milestones (up to three, primary first) in the
// student's "I can" words, each with what the checks found so far: Shown,
// Partly shown, Not shown yet, or Not checked yet. Evidence, not a rating:
// no totals, scores or targets (D17). Folded under their caption since
// 2026-11-19 (the operator: show them without cluttering the card): a
// <details> the student opens, its state kept for the page (_marksOpen).
let _marksOpen = {}; // card id -> true while its marks are open (page memory)
function marksToggled(el) { _marksOpen[el.getAttribute("data-key")] = el.open; }
function marksHtml(a, acrossParts) {
  const list = a.milestones || [];
  if (!list.length) return "";
  // While a check runs, a milestone it hasn't found yet shows no tag (2026-11-15):
  // "Being checked" on each line repeated the card's label, and "Not checked
  // yet" beside it read as a contradiction. A caption says it instead.
  const checking = a.statusPill === "Being checked";
  // A lesson in parts (2026-11-15): the marks are the lesson's best results
  // across every part so far, so a card on a part not started yet can show
  // Shown from earlier parts. The caption says so, and since 2026-11-19 each
  // mark says which part showed it ("Shown in Part 2").
  const cap = checking ? "Checking these now" : acrossParts ? "What this lesson checks, across its parts so far" : "What this lesson checks";
  const key = cardId(a);
  return '<details class="marks-box" data-key="' + esc(key) + '" ontoggle="marksToggled(this)"' + (_marksOpen[key] ? ' open' : '') + '>' +
    '<summary class="marks-cap">' + esc(cap) + '</summary>' +
    '<ul class="marks" aria-label="' + esc(cap) + '">' + list.map(m =>
    '<li>' + (m.markKey === "UNCHECKED" && checking ? '' : '<span class="mark mark-' + esc(m.markKey) + '">' + esc(m.mark) +
      (acrossParts && m.where ? ' ' + esc(m.where) : '') + '</span>') +
    esc(m.text) + '</li>').join("") + '</ul></details>';
}

// A lesson in parts, one card (F16 item 4): the part to work on now (the
// first open part not done, else the last open one) with its one next
// action, a stepper (● done, ◉ now, ○ to do, ○ dimmed when locked), the line
// saying what opens the next locked part, and a button that shows every
// part: the other open parts' cards and each locked part's line.
// The stepper's dots are buttons (2026-11-16): an open part's dot shows that
// part in the card (the one shown is underlined, aria-current); a locked
// part's dot opens "All parts", where its line says what opens it.
let _partsOpen = {};   // lesson -> true while its parts are shown (page memory)
let _partShown = {};   // lesson -> the part number its dots chose (page memory)
let _partInList = {};  // a part card's id -> its lesson, when it is under "All parts"
function lessonDomId(lesson) { return String(lesson || "").replace(/[^A-Za-z0-9_-]/g, "_"); }
function lessonCardHtml(part, list, locked) {
  const open = list.filter(a => a.part && a.part.lesson === part.lesson).sort((x, y) => x.part.n - y.part.n);
  const shut = locked.filter(l => l.lesson === part.lesson).sort((x, y) => x.n - y.n);
  const count = Math.max(part.count || 0, open.length + shut.length);
  const current = open.filter(a => a.statusClass !== "DONE")[0] || open[open.length - 1];
  const shown = open.filter(a => a.part.n === _partShown[part.lesson])[0] || current;
  const doneN = open.filter(a => a.statusClass === "DONE").length;
  let dots = "";
  for (let n = 1; n <= count; n++) {
    const a = open.filter(x => x.part.n === n)[0];
    const l = shut.filter(x => x.n === n)[0];
    const sym = a && a.statusClass === "DONE" ? "●" : a && a === current ? "◉" : "○";
    const state = a ? (a.statusClass === "DONE" ? "done" : a === current ? "to work on now" : "open") : l ? "locked" : "not open yet";
    const title = a ? (a.part.title || "") : l ? (l.title || "") : "";
    const label = "Part " + n + " of " + count + (title ? ": " + title : "") + ", " + state +
      (a && a === shown ? ", shown" : "");
    dots += '<button type="button" class="dot' + (a ? "" : " dot-locked") + (a && a === shown ? " dot-shown" : "") +
      '" data-lesson="' + esc(part.lesson) + '" data-n="' + n + '" aria-label="' + esc(label) + '"' +
      (a && a === shown ? ' aria-current="true"' : "") + ' onclick="showPart(this)">' + sym + '</button>';
  }
  const stepper = '<div class="stepper"><span class="dots" role="group" aria-label="' + esc("Parts: " + doneN + " of " + count + " done") +
    '">' + dots + '</span>' + esc(doneN + " of " + count + " parts done") + '</div>';
  const id = lessonDomId(part.lesson);
  const isOpen = !!_partsOpen[part.lesson];
  // The goal named (2026-11-16, UX audit item 5): the part before's own
  // one-line task, as its card shows it.
  const opensWhen = function (n) {
    const prev = open.filter(x => x.part.n === n - 1)[0];
    return 'opens when Part ' + (n - 1) + ' meets its goal' +
      (prev && prev.taskLine ? ': \u201c' + esc(prev.taskLine) + '\u201d' : '') + ', or when your teacher opens it.';
  };
  // When the part before was never submitted, the line says what to do
  // (2026-11-17, D-P): nothing can open the next part until it is checked.
  const before = shut.length ? open.filter(x => x.part.n === shut[0].n - 1)[0] : null;
  let after = !shut.length ? ""
    : before && waitsOnSubmit(before, locked)
      ? '<div class="lock-line lock-submit">🔒 Part ' + shut[0].n + ' is waiting on Part ' + before.part.n +
        ', which hasn\\u2019t been submitted. When it\\u2019s ready, press Submit for Feedback. Part ' + shut[0].n +
        ' opens once its check finds Part ' + before.part.n + ' meets its goal.</div>'
      : '<div class="lock-line">🔒 Part ' + shut[0].n + ' ' + opensWhen(shut[0].n) + '</div>';
  if (count > 1) {
    let rest = "";
    open.forEach(a => {
      if (a === shown) return;
      _partInList[cardId(a)] = part.lesson;
      rest += cardHtml(a, { inList: true });
    });
    shut.forEach(l => {
      rest += '<div class="part-locked" id="locked-' + esc(id) + '-' + l.n + '" tabindex="-1">🔒 Part ' + l.n + ' of ' + count + (l.title ? ": " + esc(l.title) : "") +
        '<div>' + (function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(opensWhen(l.n)) + '</div></div>';
    });
    after += '<button type="button" class="parts-toggle" id="pt-' + esc(id) + '" data-lesson="' + esc(part.lesson) +
      '" aria-expanded="' + isOpen + '" aria-controls="parts-' + esc(id) + '" onclick="toggleParts(this)">' +
      (isOpen ? "Hide the other parts" : "All " + count + " parts") + '</button>' +
      '<div class="parts-list" id="parts-' + esc(id) + '" role="region" aria-label="' + esc("All parts of " + cardName(shown)) + '"' +
      (isOpen ? "" : " hidden") + '>' + rest + '</div>';
  }
  return cardHtml(shown, { lesson: { stepper: stepper, after: after } });
}
// The "All parts" button: shows or hides them; focus stays on it.
function toggleParts(btn) {
  const lesson = btn.getAttribute("data-lesson");
  _partsOpen[lesson] = !_partsOpen[lesson];
  if (_lastDashData) render(_lastDashData);
}
// A stepper dot: an open part is shown in the card; a locked one opens "All
// parts" at its line. Focus goes to the same dot after the redraw.
function showPart(btn) {
  const lesson = btn.getAttribute("data-lesson");
  const n = Number(btn.getAttribute("data-n"));
  const locked = String(btn.className || "").indexOf("dot-locked") !== -1;
  if (locked) _partsOpen[lesson] = true;
  else _partShown[lesson] = n;
  if (_lastDashData) render(_lastDashData);
  const sel = 'button.dot[data-n="' + n + '"]';
  const dots = document.querySelectorAll ? document.querySelectorAll(sel) : [];
  for (let i = 0; i < dots.length; i++) {
    if (dots[i].getAttribute("data-lesson") === lesson) { if (dots[i].focus) dots[i].focus(); break; }
  }
  if (locked) {
    const line = document.getElementById("locked-" + lessonDomId(lesson) + "-" + n);
    if (line && line.scrollIntoView) line.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function _setFooter(data) {
  document.getElementById("footer").textContent =
    "Last refreshed: " + data.generatedAt + "  ·  " + data.googleId;
}

// Warm-ups card, above the assignments: the last warm-up's feedback (with
// the extra-credit reply while it's open) and the current warm-up. Nothing
// is shown until a student has a warm-up.
let _wuDrafts = {}; // "answer:QUEUE" / "reply:QUEUE" -> text typed, kept across re-renders
let _wuMsgs = {};   // same keys -> { ok, text } from this visit's saves

// "12 of 113 competencies done" per course (00's competencyCompletionFor_:
// a teacher's confirmed rating of 1 to 3).
function renderCompetencies(data) {
  const list = (data && data.competencies) || [];
  if (!list.length) return "";
  return '<div class="competency-strip" title="Competencies your teacher has rated you able to do with limited supervision or better">' +
    list.map(c => '<div class="competency-item">🎓 <span>' + esc(c.className || c.course) + ':</span> <strong>' +
      esc(String(c.done)) + '</strong>' + (c.total ? ' of ' + esc(String(c.total)) : '') + ' competencies done</div>').join("") +
    '</div>';
}

// ── The record tabs (2026-10-27) ─────────────────────────────────────────
// Each tab loads once, the first time it opens; ↻ Refresh reloads the
// assignments and the open tab. Page memory only.
let _activeTab = "assignments";
const _tabData = {};
let _compOnlyEvidence = false;
let _ctxWeekI = 0;
const TAB_LOADERS = { competencies: "getMyCompetencies", warmups: "getMyWarmUpHistory", context: "getMyContext" };

function showTab(tab) {
  _activeTab = tab;
  ["assignments", "competencies", "warmups", "context"].forEach(function (t) {
    const b = document.getElementById("tab-" + t);
    if (b) b.setAttribute("aria-selected", String(t === tab));
    const p = document.getElementById("panel-" + t);
    if (p) p.style.display = t === tab ? "block" : "none";
  });
  if (tab !== "assignments" && !_tabData[tab]) _loadTab(tab);
}
function _loadTab(tab) {
  const panel = document.getElementById("panel-" + tab);
  panel.innerHTML = '<div class="spinner"></div><p style="text-align:center;color:var(--text-secondary)">Loading…</p>';
  scriptRun()
    .withSuccessHandler(function (d) { _tabData[tab] = d; renderTab(tab); })
    .withFailureHandler(function (e) {
      panel.innerHTML = '<p style="color:#b3261e;padding:16px 0">Could not load this. ' + esc((e && e.message) || "") + '</p>';
    })[TAB_LOADERS[tab]]();
}
function refreshAll() {
  Object.keys(_tabData).forEach(function (k) { delete _tabData[k]; });
  loadData();
  if (_activeTab !== "assignments") _loadTab(_activeTab);
}
function renderTab(tab) {
  const panel = document.getElementById("panel-" + tab);
  const d = _tabData[tab];
  if (!d || !d.success) {
    panel.innerHTML = '<p style="color:#b3261e;padding:16px 0">' + esc((d && d.error) || "Could not load this.") + '</p>';
    return;
  }
  panel.innerHTML = tab === "competencies" ? renderCompetencyTab(d)
    : tab === "warmups" ? renderWarmUpHistory(d) : renderContextTab(d);
}

// Every competency in each course (F17): the teacher's latest confirmed
// rating as its number and words ("2 — Without supervision"; 1 is the
// highest), or "Not rated yet"; beside it, in a lighter style, the latest
// evidence in the cards' words (Shown, Partly shown, Not shown yet). Open
// one: the student's own "I can" words for it in each lesson, where it is
// practiced (this term's lessons with their status and a jump to the card;
// any other lesson a plain reference), the re-rating line, and every piece
// of evidence. Sorted by area (the default, by duty area), by rating, or by
// the most recent evidence. Per area: how many are rated, and how many were
// shown this marking period and this year. Per course: "Recently shown" and
// "Next to practice" (the measured milestones not shown yet of the lessons
// on the Assignments tab still to finish, in assigned order). Only the
// student's own: no class comparison, no ranking. "Done" stays a rating of
// 1 to 3. The whole year by default: ratings don't reset each term (Q20).
// A competency no lesson names (student organization, work-based
// learning; Q26, 2026-11-20) reads "Through DECA" or "Through work-based
// learning" until the teacher rates it, never "Not rated yet", with a line
// inside saying where it is shown and that the teacher rates it.
let _compSort = "area";
const COMP_SORTS = [["area", "By area"], ["rating", "By rating"], ["recent", "Most recent evidence"]];
function setCompSort(v) {
  if (!COMP_SORTS.some(x => x[0] === v)) return;
  _compSort = v;
  renderTab("competencies");
}
function _compLatest(it) {
  return (it.evidence || []).slice().sort((a, b) => (b.atMs || 0) - (a.atMs || 0))[0] || null;
}
function _compShownIn(it, from) {
  return (it.evidence || []).some(e => e.outcomeKey === "MET" && (!from || (e.atMs || 0) >= from));
}
// This term's card for a lesson, if the Assignments tab has one.
function _lessonCard(key) {
  const list = ((_lastDashData && _lastDashData.assignments) || []).filter(a => a.lessonKey === key);
  if (!list.length) return null;
  return list[0].part ? _shownPart(list.filter(a => a.part)) : list[0];
}
function jumpToCard(id) {
  showTab("assignments");
  return goToCard(id);
}
// The Review panel (F17, SDV-N8): per lesson that practices it, the
// lesson plan's one-line recap, the key terms and any linked video; the
// course's Covered So Far doc when it is set up. A button with
// aria-expanded; open or shut in page memory. No practice question.
let _reviewOpen = {};
function toggleReview(btn) {
  const id = btn.getAttribute("data-comp");
  _reviewOpen[id] = !_reviewOpen[id];
  renderTab("competencies");
}
function _reviewHtml(it, course) {
  const lessons = (it.lessons || []).filter(l => l.recap || l.terms || (l.watch && l.watch.length));
  const covered = course && safeDocUrl(course.coveredUrl);
  if (!lessons.length && !covered) return "";
  const id = "rv-" + String(it.id).replace(/[^A-Za-z0-9_-]/g, "_");
  const open = !!_reviewOpen[it.id];
  let body = lessons.map(l => '<div class="rv-lesson"><div><span class="lesson-chip">' + esc(l.no) + '</span><strong>' + esc(l.task) + '</strong></div>' +
    (l.recap ? '<div>' + esc(l.recap) + '</div>' : '') +
    (l.terms ? '<div><strong>Key terms:</strong> ' + esc(l.terms) + '</div>' : '') +
    (l.watch || []).map(v => {
      const u = /^https:\\/\\//.test(String(v.url || "")) ? v.url : "";
      return u ? '<div><a href="' + esc(u) + '" target="_blank" rel="noopener">Watch: ' + esc(v.title) + ' ↗</a></div>' : '';
    }).join("") + '</div>').join("");
  if (covered) body += '<div class="rv-lesson"><a href="' + esc(covered) + '" target="_blank" rel="noopener">What your class has covered so far ↗</a></div>';
  return '<div class="rec-ev"><button type="button" class="parts-toggle" id="' + esc(id) + '-b" data-comp="' + esc(it.id) +
    '" aria-expanded="' + open + '" aria-controls="' + esc(id) + '" onclick="toggleReview(this)">Review</button>' +
    '<div class="rv" id="' + esc(id) + '" role="region" aria-label="Review"' + (open ? '' : ' hidden') + '>' + body + '</div></div>';
}
// Q26: "Through DECA" or "Through work-based learning" for a competency
// no lesson measures, "" otherwise.
function _outsideLabel(it) {
  return (it && it.outsideLabel) || "";
}
function _compItemHtml(it, course) {
  const done = it.rating && it.rating <= 3;
  const latest = _compLatest(it);
  let h = '<details class="rec-comp"><summary><span>' + esc(String(it.task)) + '. ' + esc(it.text) + '</span>' +
    '<span class="rec-chip' + (done ? ' done' : '') + '">' + (it.rating ? esc(scrLabel(it.rating)) : esc(_outsideLabel(it) || 'Not rated yet')) + '</span>' +
    (latest ? '<span class="rec-latest">Latest: ' + esc(latest.outcome) + '</span>' : '') +
    (it.evidence.length || !it.outsideNote ? '<span class="rec-chip">' + (it.evidence.length ? esc(String(it.evidence.length)) + ' piece' + (it.evidence.length === 1 ? '' : 's') + ' of evidence' : 'No evidence yet') + '</span>' : '') + '</summary>';
  if (it.outsideNote) h += '<div class="rec-ev rec-outside">' + esc(it.outsideNote) + '</div>';
  const lessons = it.lessons || [];
  const words = lessons.filter(l => l.text);
  if (words.length) {
    h += '<div class="rec-ev"><strong>In your words:</strong><ul class="rec-ican">' +
      words.map(l => '<li><span class="lesson-chip">' + esc(l.no) + '</span>' + esc(l.text) + '</li>').join("") + '</ul></div>';
  }
  if (lessons.length) {
    h += '<div class="rec-ev"><strong>Where it is practiced:</strong><ul class="rec-where">' + lessons.map(l => {
      const card = _lessonCard(l.key);
      const name = '<span class="lesson-chip">' + esc(l.no) + '</span>' + esc(l.task);
      if (card) {
        return '<li><a href="#' + esc(cardId(card)) + '" onclick="return jumpToCard(\\'' + esc(cardId(card)) + '\\')">' + name +
          '</a> · ' + esc(card.statusPill || card.displayStatus || "") + '</li>';
      }
      const had = (it.evidence || []).some(e => e.lessonKey === l.key);
      return '<li>' + name + ' · ' + (had ? 'an earlier marking period' : 'not assigned to you this marking period') + '</li>';
    }).join("") + '</ul></div>';
  }
  h += _reviewHtml(it, course);
  if (it.rating && it.ratedAt) h += '<div class="rec-ev">Rated ' + esc(it.ratedAt) + '.</div>';
  if (it.retry) h += '<div class="rec-ev"><strong>' + (it.retry.ready ? 'Ready for a re-rating' : 'Re-rating') + ':</strong> ' + esc(it.retry.text) + '</div>';
  h += it.evidence.length ? it.evidence.map(function (e) {
    return '<div class="rec-ev">' + (e.date ? esc(e.date) + ' · ' : '') + esc(e.assignment) + ': <strong>' + esc(e.outcome) + '</strong>' +
      (e.counts ? ' (counts)' : ' (an earlier check; your best one counts)') +
      (e.milestone ? '<br><span class="rec-milestone">' + esc(e.milestone) + '</span>' : '') + '</div>';
  }).join("") : (it.outsideNote ? '' : '<div class="rec-ev rec-empty">No evidence yet.</div>');
  return h + '</details>';
}
// "Next to practice": the course's lessons still to finish on the
// Assignments tab, in assigned order, and their measured milestones not
// shown yet (a competency no lesson names never appears here).
function _compNext(code) {
  const out = [];
  const seen = {};
  ((_lastDashData && _lastDashData.assignments) || []).forEach(a => {
    if (!a.lessonKey || a.lessonKey.split("-")[0] !== code || seen[a.lessonKey]) return;
    seen[a.lessonKey] = true;
    const card = _lessonCard(a.lessonKey);
    if (!card || card.statusClass === "DONE") return;
    (card.milestones || []).forEach(m => {
      if (m.markKey !== "MET" && out.length < 5) out.push({ no: card.lessonNo, text: m.text, id: cardId(card) });
    });
  });
  return out;
}
function renderCompetencyTab(d) {
  if (!d.courses.length) return '<p class="rec-empty">No courses on file yet.</p>';
  const from = d.termStart || 0;
  let h = '<p class="rec-sub">Every competency in your course. Your teacher rates each one on the state\\'s 1 to 5 scale, where 1 is the highest; ' +
    '1 to 3 count as done. Evidence is what your checked work showed. An assignment counts once, at its best result.</p>' +
    '<div class="list-controls"><label for="comp-sort">Sort</label><select id="comp-sort" onchange="setCompSort(this.value)">' +
    COMP_SORTS.map(x => '<option value="' + x[0] + '"' + (x[0] === _compSort ? ' selected' : '') + '>' + esc(x[1]) + '</option>').join("") +
    '</select><label class="rec-sub" style="margin:0"><input type="checkbox" onchange="toggleCompEvidence(this.checked)"' +
    (_compOnlyEvidence ? ' checked' : '') + '> Show only competencies with evidence or a rating</label></div>';
  d.courses.forEach(function (c) {
    h += '<section class="rec-course"><h2>' + esc(c.className || c.code) + '</h2>' +
      '<div class="rec-sub">🎓 <strong>' + esc(String(c.done)) + '</strong>' + (c.total ? ' of ' + esc(String(c.total)) : '') + ' competencies done</div>';
    const all = [];
    c.areas.forEach(a => a.items.forEach(it => all.push(it)));
    const recent = all.filter(it => _compShownIn(it, 0))
      .sort((a, b) => (_compLatest(b).atMs || 0) - (_compLatest(a).atMs || 0)).slice(0, 5);
    const next = _compNext(c.code);
    if (recent.length || next.length) {
      h += '<div class="rec-lists">';
      if (recent.length) h += '<div><h3>Recently shown</h3><ul>' + recent.map(it => '<li>' + esc(String(it.task)) + '. ' + esc(it.text) + '</li>').join("") + '</ul></div>';
      if (next.length) h += '<div><h3>Next to practice</h3><ul>' + next.map(n => '<li><a href="#' + esc(n.id) + '" onclick="return jumpToCard(\\'' + esc(n.id) + '\\')"><span class="lesson-chip">' +
        esc(n.no) + '</span></a>' + esc(n.text) + '</li>').join("") + '</ul></div>';
      h += '</div>';
    }
    const keep = it => !_compOnlyEvidence || it.rating || it.evidence.length;
    let shown = 0;
    if (_compSort === "area") {
      c.areas.forEach(function (a) {
        const items = a.items.filter(keep);
        if (!items.length) return;
        shown += items.length;
        const rated = a.items.filter(function (it) { return it.rating; }).length;
        const termN = a.items.filter(it => from && _compShownIn(it, from)).length;
        const yearN = a.items.filter(it => _compShownIn(it, 0)).length;
        h += '<details class="rec-area"' + (_compOnlyEvidence ? ' open' : '') + '><summary>' + esc(a.name) +
          ' <span class="rec-chip">' + esc(String(rated)) + ' of ' + esc(String(a.items.length)) + ' rated</span>' +
          '<span class="rec-progress">Shown' + (from ? ' <span class="nw">this marking period ' + esc(String(termN)) + '</span> ·' : '') + ' <span class="nw">this year ' + esc(String(yearN)) + '</span></span></summary>';
        items.forEach(it => { h += _compItemHtml(it, c); });
        h += '</details>';
      });
    } else {
      const items = all.filter(keep).sort(_compSort === "rating"
        ? (a, b) => (a.rating || 9) - (b.rating || 9) || a.task - b.task
        : (a, b) => ((_compLatest(b) || {}).atMs || 0) - ((_compLatest(a) || {}).atMs || 0) || a.task - b.task);
      shown = items.length;
      h += '<div class="rec-area rec-flat">' + items.map(it => _compItemHtml(it, c)).join("") + '</div>';
    }
    if (!shown) h += '<p class="rec-empty">No evidence or ratings yet.</p>';
    h += '</section>';
  });
  return h;
}
function toggleCompEvidence(on) {
  _compOnlyEvidence = !!on;
  renderTab("competencies");
}

// Every past warm-up, newest first, as the card shows it.
function renderWarmUpHistory(d) {
  if (!d.warmUps.length) return '<p class="rec-empty">No past warm-ups yet.</p>';
  return '<p class="rec-sub">Your warm-ups before today, newest first. Today\\'s, and the last one while it is still open, are on the Assignments tab.</p>' +
    '<div class="card warmup-card">' + d.warmUps.map(function (w) { return _wuPrevious(w, "Warm-up"); }).join("") + '</div>';
}

// The Student Context doc one week at a time, with its link on every week.
// A link straight to one week of the context doc (29's bookmark), or the
// doc itself when the week has none.
function weekDocUrl(url, bookmark) {
  if (!url) return "";
  return /^[A-Za-z0-9._-]+$/.test(String(bookmark || "")) ? url.split("#")[0] + "#bookmark=" + bookmark : url;
}
// Coming up (2026-11-19): the student's assignments still to do with a due
// date today or later, soonest first, from the cards already on the page.
const COMING_UP_MAX = 8;
function comingUp() {
  return ((_lastDashData && _lastDashData.assignments) || [])
    .filter(function (a) { return a.dueText && !/^Was due/.test(a.dueText); })
    .sort(function (a, b) { return a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0; })
    .slice(0, COMING_UP_MAX);
}
function comingUpHtml() {
  const up = comingUp();
  if (!up.length) return "";
  return '<section class="ctx-up" aria-labelledby="ctx-up-h"><h3 id="ctx-up-h">Coming up</h3><ul>' +
    up.map(function (a) {
      return '<li><b>' + esc(a.dueText) + '</b> · <a href="#' + esc(cardId(a)) + '" onclick="return goToCardFromContext(\\'' +
        esc(cardId(a)) + '\\')">' + esc(cardTitle(a)) + '</a></li>';
    }).join("") + '</ul></section>';
}
function goToCardFromContext(id) {
  showTab("assignments");
  return goToCard(id);
}
function contextItemHtml(it) {
  if (it.heading) return '<p class="ctx-h">' + esc(it.text) + '</p>';
  if (typeof it.level === "number") return '<p class="ctx-li' + (it.level > 0 ? " l1" : "") + '">' + esc(it.text) + '</p>';
  if (/^Asked( \\(about the feedback\\))?:/.test(it.text)) return '<p class="ctx-asked">' + esc(it.text) + '</p>';
  return '<p>' + esc(it.text) + '</p>';
}
function renderContextTab(d) {
  const c = d.context;
  const up = comingUpHtml();
  if (!c) return up + '<p class="rec-empty">No Student Context yet. It is made the first week you have a checked assignment or a warm-up answer, and updated each week.</p>';
  const url = safeDocUrl(c.docUrl);
  let link = url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Open the doc ↗</a>' : '';
  const weeks = c.weeks || [];
  if (!weeks.length) return up + '<p class="rec-empty">Your doc has no weeks yet. ' + link + '</p>';
  if (_ctxWeekI > weeks.length - 1) _ctxWeekI = weeks.length - 1;
  const w = weeks[_ctxWeekI];
  if (url && w.bookmark) link = '<a href="' + esc(weekDocUrl(url, w.bookmark)) + '" target="_blank" rel="noopener">Open this week ↗</a>';
  return up + '<p class="rec-sub">Your work week by week, updated each week' + (c.lastUpdatedAt ? ' (last ' + esc(c.lastUpdatedAt) + ')' : '') + '.</p>' +
    '<div class="ctx-nav"><button type="button" onclick="stepMyContext(1)"' + (_ctxWeekI >= weeks.length - 1 ? ' disabled' : '') + ' aria-label="Older week">‹ Older</button>' +
    '<strong>' + esc(w.label) + '</strong> <span style="color:var(--text-secondary)">(' + esc(String(_ctxWeekI + 1)) + ' of ' + esc(String(weeks.length)) + ')</span>' +
    '<button type="button" onclick="stepMyContext(-1)"' + (_ctxWeekI === 0 ? ' disabled' : '') + ' aria-label="Newer week">Newer ›</button>' +
    '<span style="margin-left:auto">' + link + '</span></div>' +
    '<div class="ctx-week">' + (w.items.length ? w.items.map(contextItemHtml).join("") :
      '<p class="rec-empty">Nothing recorded this week.</p>') + '</div>';
}
function stepMyContext(delta) {
  _ctxWeekI = Math.max(0, _ctxWeekI + delta);
  renderTab("context");
}
document.addEventListener("click", function (ev) {
  const b = ev.target && ev.target.closest ? ev.target.closest("[data-tab]") : null;
  if (b) showTab(b.getAttribute("data-tab"));
});

function renderWarmUps(data) {
  const wu = data.warmUps || {};
  if (!wu.current && !wu.previous) return "";
  let html = '<div class="group-header">Warm-ups</div><div class="card warmup-card" role="region" aria-label="Warm-ups">';
  if (wu.previous) html += _wuPrevious(wu.previous);
  if (wu.current) html += _wuCurrent(wu.current);
  return html + '</div>';
}

function _wuHead(label, w) {
  return '<div class="wu-head"><div class="wu-label">' + esc(label) + ' · ' + esc(w.dateLabel) +
    (w.course ? ' <span class="wu-course">' + esc(w.course) + '</span>' : '') + '</div>' +
    '<div class="pill pill-' + esc(w.statusClass) + '">' + esc(w.displayStatus) + '</div></div>';
}

function _wuOpenLink(w) {
  const url = safeDocUrl(w.docUrl);
  return url ? '<a href="' + esc(url) + '" target="_blank" class="open-btn wu-open">Open warm-up ↗</a>' : '';
}

function _wuBox(kind, w, saved, label, rows) {
  const key = kind + ":" + w.queueId;
  const value = Object.prototype.hasOwnProperty.call(_wuDrafts, key) ? _wuDrafts[key] : saved;
  const msg = _wuMsgs[key];
  return '<label class="wu-sr" for="wu-' + kind + '-' + esc(w.queueId) + '">' + esc(label) + '</label>' +
    '<textarea id="wu-' + kind + '-' + esc(w.queueId) + '" class="wu-text" rows="' + rows + '" data-key="' + esc(key) + '" oninput="wuDraft(this)">' + esc(value || "") + '</textarea>' +
    '<div class="card-actions"><button class="submit-btn" data-kind="' + kind + '" data-queue="' + esc(w.queueId) + '" onclick="saveWarmUp(this)">' +
    (kind === "answer" ? (saved ? "Update answer" : "Save answer") : (saved ? "Update reply" : "Save reply")) + '</button></div>' +
    (kind === "reply"
      ? '<div id="wu-n-' + esc(w.queueId) + '" class="wu-note">' + _wuReplyCount(value) + '</div>'
      : '') +
    '<div id="wu-msg-' + kind + '-' + esc(w.queueId) + '" class="submit-msg ' + (msg ? (msg.ok ? "ok" : "err") : "") + '" role="status">' + (msg ? esc(msg.text) : "") + '</div>';
}

// The answer box, and the saved note under it.
function _wuAnswer(w) {
  let h = _wuBox("answer", w, w.answer, "Your answer", 5);
  if (w.answer && !_wuMsgs["answer:" + w.queueId]) {
    h += '<div class="wu-note">Saved ' + esc(w.savedAt || "") + '. You can change it until the end of ' + esc(w.openUntil || "the day") + '.</div>';
  }
  return h;
}

function _wuPrevious(w, label) {
  let h = '<div class="wu-section">' + _wuHead(label || "Last warm-up", w);
  if (w.canAnswer) {
    // Missed on its day: answer it late, scored without feedback.
    h += '<div class="wu-prompt">' + esc(w.warmup) + '</div>' +
      '<div class="wu-ec">You missed this one. Answer it by the end of ' + esc(w.openUntil) +
      ' for points. A late answer gets no feedback and no extra credit.</div>' + _wuAnswer(w);
    return h + '</div>';
  }
  if (w.late && w.answer) h += '<div class="wu-note">Answered late: scored, with no feedback or extra credit.</div>';
  // The question and what the student wrote, collapsed, so the feedback
  // (and a reply to it) can be read against them (walk-through finding 10).
  if (w.textBox && (w.warmup || w.answer)) {
    h += '<details class="wu-recall"><summary>Show the question and your answer</summary>' +
      (w.warmup ? '<div class="wu-prompt">' + esc(w.warmup) + '</div>' : '') +
      '<div class="wu-answer"><b>Your answer</b><br>' + (w.answer ? esc(w.answer) : '<i>No answer was saved.</i>') + '</div>' +
      '</details>';
  }
  if (w.score) {
    h += '<div class="wu-score"><b>' + esc(w.score.points) + '/' + esc(w.score.max) + '</b>' +
      (w.score.extra ? ' <span class="wu-plus">+' + esc(w.score.extra) + ' extra credit</span>' : '') +
      '<span class="wu-parts">Length ' + esc(w.score.length) + '/' + esc(w.score.lengthMax) +
      ' · Grammar ' + esc(w.score.grammar) + '/' + esc(w.score.grammarMax) +
      ' · Engagement ' + esc(w.score.engagement) + '/' + esc(w.score.engagementMax) +
      ' (30+ words for full length)</span></div>';
  }
  if (w.feedback) h += '<div class="wu-feedback">' + esc(w.feedback) + '</div>';
  if (!w.textBox) h += _wuOpenLink(w);
  const ec = w.extraCredit || {};
  if (label && ec.reply) h += '<div class="wu-answer"><b>Your reply</b><br>' + esc(ec.reply) + '</div>';
  if (ec.credited) {
    h += '<div class="wu-ec done">✓ Extra credit earned</div>';
  } else if (ec.open && ec.canReply) {
    h += '<div class="wu-ec">Extra credit: reply to this feedback in at least ' + esc(ec.minWords) + ' words by ' + esc(ec.byLabel) + '.</div>' +
      _wuBox("reply", w, ec.reply, "Your reply to the feedback", 3) +
      (ec.reply && wuWords(ec.reply) >= EC_MIN_WORDS ? '<div class="wu-note">Your reply is saved and checked overnight.</div>' : '');
  } else if (ec.open) {
    h += '<div class="wu-ec">Extra credit: reply under the feedback in your doc (at least ' + esc(ec.minWords) + ' words) by ' + esc(ec.byLabel) + '.</div>';
  }
  return h + '</div>';
}

function _wuCurrent(w) {
  let h = '<div class="wu-section">' + _wuHead(w.isToday ? "Today's warm-up" : "Next warm-up", w);
  if (!w.textBox) return h + _wuOpenLink(w) + '</div>';
  if (w.bridge) h += '<div class="wu-bridge">' + esc(w.bridge) + '</div>';
  h += '<div class="wu-prompt">' + esc(w.warmup) + '</div>';
  if (w.canAnswer) {
    h += _wuAnswer(w);
  } else if (w.answer) {
    h += '<div class="wu-answer"><b>Your answer</b><br>' + esc(w.answer) + '</div>';
  }
  return h + '</div>';
}

// Counted as 25 counts a reply (_warmUpWordCount_: split on spaces), so
// the number here is the number the nightly check uses. A reply under 10
// words is still saved, but used to read as if it would count (UX audit).
function wuWords(text) {
  const t = String(text || "").trim();
  return t ? t.split(/\\s+/).length : 0;
}

function _wuReplyCount(text) {
  const n = wuWords(text);
  return n >= EC_MIN_WORDS ? n + " words ✓" : n + " of " + EC_MIN_WORDS + " words needed for extra credit";
}

function wuDraft(el) {
  const key = el.getAttribute("data-key");
  _wuDrafts[key] = el.value;
  if (key.indexOf("reply:") === 0) {
    const n = document.getElementById("wu-n-" + key.slice(6));
    if (n) n.textContent = _wuReplyCount(el.value);
  }
}

function saveWarmUp(btn) {
  const kind = btn.getAttribute("data-kind");
  const id = btn.getAttribute("data-queue");
  const key = kind + ":" + id;
  const box = document.getElementById("wu-" + kind + "-" + id);
  const text = box ? box.value : "";
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Saving…";
  const finish = function (res) {
    btn.disabled = false;
    btn.textContent = label;
    const msgEl = document.getElementById("wu-msg-" + kind + "-" + id);
    if (res && res.ok) {
      const wu = (_lastDashData && _lastDashData.warmUps) || {};
      const w = [wu.current, wu.previous].filter(function (x) { return x && x.queueId === id; })[0];
      const short = kind === "reply" && wuWords(text) < EC_MIN_WORDS;
      _wuMsgs[key] = { ok: !short, text: "Saved " + res.savedAt + "." +
        (kind === "answer" ? " You can change it until the end of " + ((w && w.openUntil) || "the day") + "."
          : short ? " It has " + wuWords(text) + " words: it needs at least " + EC_MIN_WORDS + " to earn extra credit."
          : " It's checked overnight.") };
      delete _wuDrafts[key];
      _dashCache = {}; // the next refresh fetches the saved text
      if (w && kind === "answer") w.answer = text;
      if (w && kind === "reply") w.extraCredit.reply = text;
    } else {
      _wuMsgs[key] = { ok: false, text: (res && res.error) ||
        "Couldn't save. Your writing is still in the box: try again in a minute." };
    }
    if (msgEl) {
      msgEl.className = "submit-msg " + (_wuMsgs[key].ok ? "ok" : "err");
      msgEl.textContent = _wuMsgs[key].text;
    }
  };
  scriptRun()
    .withSuccessHandler(finish)
    .withFailureHandler(function () { finish(null); })
    [kind === "answer" ? "submitWarmUpAnswer" : "submitWarmUpReply"](id, text);
}

// Submit for Feedback: the doc's own menu can't run for student accounts
// (district setting), so the dashboard submits instead. The server reads
// the doc and checks it; this only shows the answer under the card.
// A form part's card (Phase 4b): what Submit does with a form.
const FORM_SUBMIT_NOTE = "Submit for Feedback reads your form's questions and settings (never anyone's answers), " +
  "checks them, and puts your feedback on your form's feedback page.";
// A Slides part (Phase 4c).
const SLIDES_SUBMIT_NOTE = "Submit for Feedback reads the words on your slides and your speaker notes, counts your " +
  "pictures, checks them, and sends them for feedback.";
// A Sheets part (Phase 4d).
const SHEET_SUBMIT_NOTE = "Submit for Feedback reads your sheet's tabs, what you filled in, your formulas and " +
  "charts, checks them, and puts your feedback on your sheet's feedback page.";
const WORK_SUBMIT_NOTE = { form: FORM_SUBMIT_NOTE, slides: SLIDES_SUBMIT_NOTE, sheet: SHEET_SUBMIT_NOTE };
// What a work file with a feedback page is called on the card.
const WORK_NOUN = { form: "form", slides: "deck", sheet: "sheet" };
const SUBMIT_ERRORS = {
  TOO_SHORT: null, // worded below with the word count
  NO_RESPONSE_SECTION: "Your document is missing the line under “Your response” that marks where your writing starts, so there's nothing to check. Ask your teacher.",
  ALREADY_QUEUED: "This is already waiting for feedback. Check back in a few minutes.",
  ALREADY_TURNED_IN: "You've already turned this in.",
  NOT_REGISTERED: "This assignment isn't open for you any more. Ask your teacher.",
  NOT_OPEN_YET: "This assignment opens the evening before its lesson. Check back then.",
  NO_USER: "Sign into your school Google account and refresh this page.",
  // System-side problems only the teacher can fix: retrying won't help.
  DOC_UNREADABLE: "The system can't open your document right now. Your work is safe. Tell your teacher.",
  NO_QUEUE: "The system can't take submissions right now. Your work is safe. Tell your teacher.",
  SERVER_ERROR: "Something went wrong on the system's side. Your work is safe. Tell your teacher.",
  // A form part (Phase 4b). FORM_NOT_YET is worded below with its reasons.
  FORM_NOT_YET: null,
  FORM_UNREADABLE: "The system can't open your form right now. Your work is safe. Tell your teacher.",
  FORM_SNAPSHOT_MISSING: "Your form has no feedback page set up yet, so it can't be checked. Your work is safe. Tell your teacher.",
  FORM_SNAPSHOT_UNWRITABLE: "The system can't write your form's feedback page right now. Your work is safe. Tell your teacher.",
  // A Slides part (Phase 4c). SLIDES_NOT_YET is worded below with its reasons.
  SLIDES_NOT_YET: null,
  SLIDES_UNREADABLE: "The system can't open your slides right now. Your work is safe. Tell your teacher.",
  SLIDES_SNAPSHOT_MISSING: "Your slides have no feedback page set up yet, so they can't be checked. Your work is safe. Tell your teacher.",
  SLIDES_SNAPSHOT_UNWRITABLE: "The system can't write your deck's feedback page right now. Your work is safe. Tell your teacher.",
  // A Sheets part (Phase 4d). SHEET_NOT_YET is worded below with its reasons.
  SHEET_NOT_YET: null,
  SHEET_UNREADABLE: "The system can't open your sheet right now. Your work is safe. Tell your teacher.",
  SHEET_SNAPSHOT_MISSING: "Your sheet has no feedback page set up yet, so it can't be checked. Your work is safe. Tell your teacher.",
  SHEET_SNAPSHOT_UNWRITABLE: "The system can't write your sheet's feedback page right now. Your work is safe. Tell your teacher."
};
const SUBMIT_FALLBACK = "The assignment system didn't answer. Your work is safe in your document.\\nTry again in a minute. If it keeps happening, tell your teacher.";

function submitWork(btn) {
  const fileId = btn.getAttribute("data-file");
  const configId = btn.getAttribute("data-config");
  btn.disabled = true;
  btn.textContent = "Checking…";
  // First ask whether this submit needs the reflection questions. The
  // server runs the same checks as a submit, so a doc with too little
  // writing says so before any question is asked.
  scriptRun()
    .withSuccessHandler(function(res) {
      if (res && res.ok && res.questions && res.questions.length) {
        _reflect[fileId] = { configId: configId, questions: res.questions, answers: [], msg: "" };
        if (_lastDashData) render(_lastDashData);
        return;
      }
      if (res && res.ok) { sendSubmit(fileId, configId, null); return; }
      submitDone(fileId, configId, res);
    })
    .withFailureHandler(function() { submitDone(fileId, configId, null); })
    .getSubmitReflection(fileId, configId);
}

function reflectFormHtml(a) {
  const r = _reflect[a.fileId];
  const one = r.questions.length === 1;
  let h = '<div class="reflect" role="group" aria-label="Before you submit">' +
    '<div class="reflect-intro">Before you submit, answer ' + (one ? "this question" : "these questions") +
    " about how you worked: a sentence or two, at least " + REFLECT_MIN_WORDS + " words" + (one ? "" : " each") +
    ". Your answers are not part of your work. You will see them as a comment on your document.</div>";
  r.questions.forEach(function(q, i) {
    const id = "rf-" + i + "-" + a.fileId;
    const n = countWords(r.answers[i]);
    // The goal on its own line, then the short question (2026-11-17).
    if (q.goal) h += '<div class="reflect-goal"><b>' + esc(q.goalLabel || "Goal") + ':</b> ' + esc(q.goal) + "</div>";
    h += '<label class="reflect-q" for="' + esc(id) + '">' + esc(q.question) + "</label>" +
      '<textarea id="' + esc(id) + '" class="reflect-a" rows="3" data-file="' + esc(a.fileId) +
      '" data-i="' + i + '" oninput="reflectInput(this)">' + esc(r.answers[i] || "") + "</textarea>" +
      '<div class="reflect-count" id="' + esc(id) + '-n">' + n + " of " + REFLECT_MIN_WORDS + " words</div>";
  });
  h += '<div class="reflect-actions">' +
    // The card's own buttons (2026-11-17, UX audit item 7): while the
    // questions are open, their Submit is the card's one filled button.
    '<button type="button" class="act act-primary" data-file="' + esc(a.fileId) + '" data-config="' + esc(a.configId) +
    '" onclick="sendReflection(this)">Submit for Feedback</button>' +
    '<button type="button" class="act act-secondary" data-file="' + esc(a.fileId) + '" onclick="cancelReflection(this)">Cancel</button></div>';
  if (r.msg) h += '<div class="submit-msg err" role="status">' + esc(r.msg) + "</div>";
  return h + "</div>";
}

function countWords(text) {
  return String(text || "").split(/\\s+/).filter(function(w) { return /[A-Za-z0-9]/.test(w); }).length;
}

// Typing only updates page memory and the word count, so the box keeps
// its focus; nothing re-renders.
function reflectInput(el) {
  const r = _reflect[el.getAttribute("data-file")];
  if (!r) return;
  const i = Number(el.getAttribute("data-i"));
  r.answers[i] = el.value;
  const n = document.getElementById(el.id + "-n");
  if (n) n.textContent = countWords(el.value) + " of " + REFLECT_MIN_WORDS + " words";
}

function cancelReflection(btn) {
  delete _reflect[btn.getAttribute("data-file")];
  if (_lastDashData) render(_lastDashData);
}

function sendReflection(btn) {
  const fileId = btn.getAttribute("data-file");
  const configId = btn.getAttribute("data-config");
  const r = _reflect[fileId];
  if (!r) return;
  const short = r.questions.some(function(q, i) { return countWords(r.answers[i]) < REFLECT_MIN_WORDS; });
  if (short) {
    r.msg = "Answer each question in at least " + REFLECT_MIN_WORDS + " words.";
    if (_lastDashData) render(_lastDashData);
    return;
  }
  btn.disabled = true;
  btn.textContent = "Submitting…";
  sendSubmit(fileId, configId, r.questions.map(function(q, i) {
    return { frameId: q.frameId, competencyId: q.competencyId, answer: r.answers[i] || "" };
  }));
}

function sendSubmit(fileId, configId, answers) {
  scriptRun()
    .withSuccessHandler(function(res) { submitDone(fileId, configId, res); })
    .withFailureHandler(function() { submitDone(fileId, configId, null); })
    .submitMyWork(fileId, configId, answers);
}

function submitDone(fileId, configId, res) {
  const r = _reflect[fileId];
  // Problems with the answers stay on the open questions, with what was
  // typed kept.
  if (r && res && (res.error === "REFLECTION_SHORT" || res.error === "SYSTEM_TEXT_IN_REFLECTION" ||
                   res.error === "REFLECTION_NEEDED")) {
    if (res.error === "REFLECTION_NEEDED" && res.questions) { r.questions = res.questions; r.answers = []; }
    r.msg = res.error === "REFLECTION_SHORT"
      ? "Answer each question in at least " + (res.minWords || REFLECT_MIN_WORDS) + " words."
      : res.error === "SYSTEM_TEXT_IN_REFLECTION"
        ? "An answer has text copied from a feedback block: " + (res.found || "[SYSTEM:") + ". Take it out and submit again."
        : "The questions changed since this page loaded. Answer these, then submit.";
    if (_lastDashData) render(_lastDashData);
    return;
  }
  if (res && res.ok) delete _reflect[fileId];
  const done = function(msg) {
    _submitMsgs[fileId] = msg;
    _dashCache = {};
    // After a successful submit the card shows what the server now holds
    // (2026-10-22, UX audit fix-first 2): it used to re-render the old data,
    // so it still read "Not started yet" with Submit active, and a second
    // click got "already waiting".
    if (msg.ok && _lastDashData) {
      (_lastDashData.assignments || []).forEach(function(a) {
        if (a.fileId !== fileId || a.configId !== configId) return;
        a.displayStatus = "Waiting for feedback…";
        a.statusPill = "Waiting for feedback";
        a.statusNote = "";
        a.statusClass = "IN_PROGRESS";
        a.canSubmit = false;
        a.submittedAt = "just now";
        // The check runs by itself only with the flows on; the page then
        // checks for news (schedulePoll, from render).
        a.waiting = !!(res && res.aiFlowsLive);
        // Where it is: submitted just now, in line (the next check for news
        // brings the sheets' own times).
        a.stages = a.waiting ? { current: "IN_LINE", submitted: "just now", inLine: "", checking: "",
          since: Date.now(), usualMin: null } : null;
      });
    }
    if (_lastDashData) render(_lastDashData);
  };
  if (res && res.ok) {
    done({ ok: true, text: (!res.aiFlowsLive
      ? "✅ Submitted. Your teacher can see your work and will review it directly."
      // A Slides part's feedback as a comment is on the deck itself (2026-11-17, 37).
      : res.workType === "slides" && res.feedbackInComments
        ? "✅ Submitted. In a few minutes your feedback will be a comment on your slides: View feedback opens it, or click Comments (top right) in your deck."
      : res.workType === "form" || res.workType === "slides" || res.workType === "sheet"
        ? "✅ Submitted. In a few minutes your feedback will be on your " + (res.workType === "slides" ? "deck" : res.workType) + "'s feedback page (the link on this card)" +
          (res.feedbackInComments ? ", as a comment: open it and click Comments (top right)." : ".")
      : res.feedbackInComments
        ? "✅ Submitted. In a few minutes your feedback will be a comment on your document: open it and click Comments (top right)."
        : "✅ Submitted. In a few minutes your feedback will appear in your document, just above “Your response”. Refresh the document to see it.") +
      (res.reflected ? " Your answers about how you worked will be a comment on your document too." : "") });
    return;
  }
  const code = res && res.error;
  if (code === "TOO_SHORT") {
    const w = res.words || 0;
    done({ ok: false, text: "Write a little more first. " +
      (w > 0 ? "You've written about " + w + " word" + (w === 1 ? "" : "s") + "." : "You haven't written anything under “Your response” yet.") +
      "\\nAim for at least 25 words under “Your response” in your document." });
    return;
  }
  // A form, Slides or Sheets part's exact checks (Phase 4b/4c/4d): each reason on its own line.
  if (code === "FORM_NOT_YET" || code === "SLIDES_NOT_YET" || code === "SHEET_NOT_YET") {
    done({ ok: false, text: "Not yet. Fix this in your " + (code === "FORM_NOT_YET" ? "form" : code === "SHEET_NOT_YET" ? "sheet" : "slides") + ", then submit again:\\n" +
      (res.reasons || []).map(function(r) { return "• " + r; }).join("\\n") });
    return;
  }
  if (code === "SYSTEM_TEXT_IN_RESPONSE") {
    done({ ok: false, text: "Your response has text copied from a feedback block: " +
      (res.found || "[SYSTEM:") + "\\nDelete that line from your response and submit again." });
    return;
  }
  done({ ok: false, text: SUBMIT_ERRORS[code] || SUBMIT_FALLBACK });
}

// NEW (finding #7): an immediate, in-app "just registered" notice —
// replacing the original easy-to-miss one-time email — one line per class
// the server lists in newRegistrations (first registered within the last
// few days; walk-through finding 11). Naturally stops showing once that
// window passes; no separate "seen it" state to track.
function renderNewRegistrationBanner(data) {
  const el = document.getElementById("new-registration-banner");
  const fresh = data.newRegistrations || [];
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
  // One card per class, period and teacher, not one per assignment
  // (walk-through finding 12).
  const seen = {};
  const regs = (data.assignments || []).filter(a => {
    const key = [a.className, a.period, a.teacherName].join("|").toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
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
        \${a.studentId ? \`<div class="info-row"><b>Student ID:</b> \${esc(a.studentId)}</div>\` : ""}
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

${CLIENT_ESC_JS}
${CLIENT_SAFE_DOC_URL_JS}
${CLIENT_WORDS_JS}
${turnInClientJs_()}
${DASH_TOUR_JS}

// ── More ▾ (F16 item 7): the header's menu button, the Teacher Dashboard's
// pattern (07). A capture-phase click on an item closes the menu and puts
// focus on More first, so the Terms dialog and My Info return focus there.
function _moreItems() {
  const menu = document.getElementById("more-menu");
  return menu && menu.querySelectorAll ? Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]')) : [];
}
function _moreIsOpen() {
  const btn = document.getElementById("more-btn");
  return !!btn && btn.getAttribute("aria-expanded") === "true";
}
function _moreFocus(items, i) {
  items.forEach(function (el, j) { el.setAttribute("tabindex", j === i ? "0" : "-1"); });
  if (items[i] && items[i].focus) items[i].focus();
}
function openMoreMenu(focusIndex) {
  const btn = document.getElementById("more-btn");
  const menu = document.getElementById("more-menu");
  if (!btn || !menu) return;
  menu.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  const items = _moreItems();
  if (!items.length) return;
  _moreFocus(items, focusIndex === -1 ? items.length - 1 : Math.max(0, Math.min(items.length - 1, focusIndex || 0)));
}
function closeMoreMenu(returnFocus) {
  const btn = document.getElementById("more-btn");
  const menu = document.getElementById("more-menu");
  if (!btn || !menu) return;
  menu.hidden = true;
  btn.setAttribute("aria-expanded", "false");
  if (returnFocus && btn.focus) btn.focus();
}
function _moreButtonKeydown(e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (_moreIsOpen()) closeMoreMenu(true); else openMoreMenu(0);
  } else if (e.key === "ArrowDown") { e.preventDefault(); openMoreMenu(0); }
  else if (e.key === "ArrowUp") { e.preventDefault(); openMoreMenu(-1); }
  else if (e.key === "Escape" && _moreIsOpen()) { e.preventDefault(); closeMoreMenu(true); }
}
function _moreMenuKeydown(e) {
  const items = _moreItems();
  if (!items.length) return;
  let i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") i = (i + 1) % items.length;
  else if (e.key === "ArrowUp") i = (i <= 0 ? items.length : i) - 1;
  else if (e.key === "Home") i = 0;
  else if (e.key === "End") i = items.length - 1;
  else if (e.key === "Escape" || e.key === "Tab") {
    if (e.key === "Escape") e.preventDefault();
    closeMoreMenu(e.key === "Escape");
    return;
  } else return;
  e.preventDefault();
  _moreFocus(items, i);
}
(function wireMoreMenu() {
  const btn = document.getElementById("more-btn");
  const menu = document.getElementById("more-menu");
  const wrap = document.getElementById("hdr-more");
  if (!btn || !menu || !wrap || !btn.addEventListener) return;
  btn.addEventListener("click", function () { if (_moreIsOpen()) closeMoreMenu(true); else openMoreMenu(0); });
  btn.addEventListener("keydown", _moreButtonKeydown);
  menu.addEventListener("keydown", _moreMenuKeydown);
  menu.addEventListener("click", function (e) {
    const item = e.target && e.target.closest ? e.target.closest('[role="menuitem"]') : null;
    if (item) closeMoreMenu(true);
  }, true);
  document.addEventListener("click", function (e) {
    if (!_moreIsOpen() || (wrap.contains && wrap.contains(e.target))) return;
    closeMoreMenu(wrap.contains && wrap.contains(document.activeElement));
  });
  // The Terms dialog puts focus back on its button, now inside the closed
  // menu: send it to More instead.
  document.addEventListener("close", function (e) {
    if (e.target && e.target.id === "cas-terms" && btn.focus) btn.focus();
  }, true);
})();

loadData();
</script>
${casTermsPanelHtml_("What these words mean", "The words you see on this page and in your assignment documents.", CAS_STUDENT_TERMS)}
</body>
</html>`;
}
