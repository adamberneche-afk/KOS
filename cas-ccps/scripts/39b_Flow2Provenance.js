// =============================================================================
// FILE: 39b_Flow2Provenance.js
// BOUND TO: Central Ledger spreadsheet
// PURPOSE: Records what runs Flow 2 (the StudioConfig tab) and runs the daily drift probe.
//
// What runs Flow 2, recorded and watched (2026-11-16). Flow 2 changed under
// live use with no change of ours: Studio's hydrogen 4.1 release paused it on
// 11-13, a new Gemini model arrived that afternoon, and Studio was rebuilt on
// 11-15 (meta/FLOW2_VERSIONS_2026-11.md). Each result already records the
// code and prompt versions and the model it reports (37's _fiProvenance_).
// This file adds the two pieces Apps Script can't read from Studio:
//
// 1. StudioConfig, the operator's record of Studio. One row per change:
//    From (when it took effect), Flow, Step (Extract, Ask Gemini, Update
//    rows, Starter…), Model, Settings, Note, RecordedAt. Rows are only
//    added: recordStudioChange({...}) for a change, confirmStudioConfig()
//    when Studio was checked and nothing changed. The harvest stamps the
//    model in effect for Flow 2's Ask Gemini step on each EvaluationLog row
//    (ModelConfigured); showSetupStatus() warns when Flow 2's record is
//    missing or older than STUDIO_CONFIG_STALE_DAYS.
//
// 2. The daily drift probe. A model can change under Studio with nothing
//    recorded (11-13), so once a day Flow 2 grades the same fixed text: a
//    FlowInput row with StagingRowRef "PROBE" (a fixture row everywhere:
//    the harvest leaves it alone, the reports skip it). The next run reads
//    its answer, appends a Flow2Drift row (the stamp, the outcomes, the
//    answer's shape, its length in steps of 250 characters, the run check,
//    the reported model, the code and prompt versions) and seeds the next
//    probe. A change in the model or the shape with no change in our code
//    or prompt is a platform change: the overnight email and
//    showSetupStatus() say so for DRIFT_WINDOW_DAYS. Outcomes are compared
//    too but only noted, since the same work can grade differently run to
//    run (the 11-15 re-grade: 73% of milestones agreed).
//
// No student data: the probe's text is the fixture's, and the tabs hold
// dates, versions, model names and counts.
// =============================================================================

// STUDIO_CONFIG_TAB, STUDIO_CONFIG_HEADERS, studioConfigRows_ and
// studioModelAt_ are in 37, beside the harvest that reads them.
const STUDIO_CONFIG_STALE_DAYS = 14;

// The history from meta/FLOW2_VERSIONS_2026-11.md, seeded once by
// installStudioConfig(). Model names were not recorded at the time: fill in
// the Model cells by hand if they are known.
const STUDIO_CONFIG_HISTORY = [
  ["2026-11-13T08:00:00-05:00", "All", "Platform", "", "", "Studio hydrogen 4.1 release: no flow ran until new settings were chosen and permissions granted"],
  ["2026-11-13T13:00:00-05:00", "Flow 2", "Ask Gemini", "", "", "A new Gemini model (the operator's account; name not recorded)"],
  ["2026-11-14T08:00:00-05:00", "Flow 2", "Starter", "", "", "Flow 2 restarted after the release"],
  ["2026-11-15T12:00:00-05:00", "Flow 2", "Extract; Ask Gemini; Update rows", "", "No Drive sources; more capacity", "Rebuilt: the Extract step, the Ledger removed as a Drive source, Update rows on StagingRowRef"],
];

function installStudioConfig() {
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  const sheet = _scTab_(ss);
  if (sheet.getLastRow() > 1) {
    Logger.log("[StudioConfig] The tab already has " + (sheet.getLastRow() - 1) + " row(s); left as it is.");
    return { seeded: 0 };
  }
  const now = new Date();
  const rows = STUDIO_CONFIG_HISTORY.map(function (h) { return [new Date(h[0]), h[1], h[2], h[3], h[4], h[5], now]; });
  sheet.getRange(2, 1, rows.length, STUDIO_CONFIG_HEADERS.length).setValues(rows);
  Logger.log("[StudioConfig] Seeded " + rows.length + " row(s) from the 11-13 to 11-15 history. Add the model " +
             "names by hand if you know them; from now on recordStudioChange({...}) for each change.");
  return { seeded: rows.length };
}

// recordStudioChange({ flow: "Flow 2", step: "Ask Gemini", model: "…",
//   settings: "…", note: "…", from: "2026-11-20T09:00:00-05:00" })
// `from` defaults to now. Flow and step are required; a model belongs to an
// Ask Gemini step.
function recordStudioChange(change) {
  const c = change || {};
  const flow = String(c.flow || "").trim();
  const step = String(c.step || "").trim();
  if (!flow || !step) {
    throw new Error("recordStudioChange: give at least { flow, step }, e.g. " +
      "{ flow: \"Flow 2\", step: \"Ask Gemini\", model: \"…\", note: \"…\" }.");
  }
  const from = c.from ? new Date(Date.parse(c.from)) : new Date();
  if (isNaN(from.getTime())) throw new Error("recordStudioChange: `from` is not a time.");
  const ss = SpreadsheetApp.openById(getConfig_().ledgerSsId);
  _scTab_(ss).appendRow([from, flow, step, String(c.model || "").trim(), String(c.settings || "").trim(),
    String(c.note || "").trim(), new Date()]);
  Logger.log("[StudioConfig] Recorded: " + flow + " / " + step + (c.model ? ", model " + c.model : "") +
             ", from " + from.toISOString() + ".");
  return { flow: flow, step: step, from: from };
}

// Studio checked, nothing changed: a CONFIRMED row, which resets the
// staleness warning for that flow.
function confirmStudioConfig(flow) {
  return recordStudioChange({ flow: flow || "Flow 2", step: "CONFIRMED", note: "Checked in Studio; nothing changed" });
}

function _scTab_(ss) {
  let sheet = ss.getSheetByName(STUDIO_CONFIG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(STUDIO_CONFIG_TAB);
    sheet.appendRow(STUDIO_CONFIG_HEADERS);
  }
  return sheet;
}

// One line for showSetupStatus(): "" when Flow 2's record is fresh.
function studioConfigLine_(ss, now) {
  const rows = studioConfigRows_(ss).filter(function (r) { return /^flow\s*2$/i.test(r.flow); });
  const nowMs = (now || new Date()).getTime();
  if (!rows.length) {
    return "StudioConfig has no record of Flow 2: run installStudioConfig() once, then recordStudioChange({...}) " +
      "for each change in Studio (which model Ask Gemini runs above all).";
  }
  const last = Math.max.apply(null, rows.map(function (r) { return isNaN(r.recordedMs) ? r.fromMs : r.recordedMs; }));
  const days = Math.floor((nowMs - last) / 86400000);
  if (!studioModelAt_(rows, nowMs)) {
    return "StudioConfig names no model for Flow 2's Ask Gemini step: fill the Model cell, or " +
      "recordStudioChange({ flow: \"Flow 2\", step: \"Ask Gemini\", model: \"…\" }).";
  }
  if (days > STUDIO_CONFIG_STALE_DAYS) {
    return "StudioConfig's record of Flow 2 is " + days + " days old: check Studio, then confirmStudioConfig() " +
      "(or recordStudioChange({...}) if something changed).";
  }
  return "";
}

// =============================================================================
// The daily drift probe
// =============================================================================
const DRIFT_TAB = "Flow2Drift";
const DRIFT_HEADERS = ["SeededAt", "CheckedAt", "Status", "Stamp", "Outcomes", "Shape", "Length",
  "RunCheck", "ModelReported", "CodeVersion", "PromptVersion", "Changed"];
const DRIFT_REF = FI_DRIFT_PROBE_REF; // 37: the harvest leaves this row alone
const DRIFT_WINDOW_DAYS = 3; // how long a platform change keeps its warning up
const DRIFT_TRIGGER_FN = "runFlow2DriftProbe";
const DRIFT_HOUR = 6; // the probe runs once a day, about this hour

// The probe's assignment and text: the first Flow 2 fixture's, with its own
// ConfigID and student address so installFlow2Fixture() is not blocked.
// A function, so this file doesn't need 39 loaded before it.
function _drSpec_() {
  const f = FX_FLOW2_SPECS[0];
  return { ref: DRIFT_REF, configSuffix: "PROBE", docTitle: "[FIXTURE] Flow 2 drift probe",
    unitName: f.unitName, persona: f.persona, milestones: f.milestones, dod: f.dod,
    compPrefix: "FIXTURE-COMP-P", response: f.response, studentEmail: "fixture-probe@example.invalid" };
}

function installFlow2DriftProbe() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === DRIFT_TRIGGER_FN; });
  if (!exists) ScriptApp.newTrigger(DRIFT_TRIGGER_FN).timeBased().everyDays(1).atHour(DRIFT_HOUR).create();
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  const sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || TABS.flowInput) || _fiEnsureTab_(ss, cfg);
  const waiting = sheet.getLastRow() >= 2 && sheet.getDataRange().getValues().some(_drIsProbeRow_);
  if (!waiting) _drSeed_(sheet);
  Logger.log("[Drift] " + (exists ? "The daily probe was already installed" :
    "Installed the daily probe (about " + DRIFT_HOUR + " a.m.)") +
    (waiting ? "; a probe is already waiting." : "; seeded the first probe. Its answer is read on the next run."));
  return { installed: !exists, seeded: waiting ? 0 : 1 };
}

function removeFlow2DriftProbe() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === DRIFT_TRIGGER_FN) ScriptApp.deleteTrigger(t);
  });
  const cfg = getConfig_();
  const sheet = SpreadsheetApp.openById(cfg.ledgerSsId).getSheetByName((cfg.tabs && cfg.tabs.flowInput) || TABS.flowInput);
  const cleared = sheet ? _drClearProbes_(sheet).length : 0;
  Logger.log("[Drift] Removed the daily probe and " + cleared + " probe row(s).");
  return { cleared: cleared };
}

function _drIsProbeRow_(row) {
  return _fiIsDriftProbeRow_(row);
}

// Reads the waiting probe(s), records each, clears them, seeds the next.
function runFlow2DriftProbe() {
  const cfg = getConfig_();
  const ss = SpreadsheetApp.openById(cfg.ledgerSsId);
  let sheet = ss.getSheetByName((cfg.tabs && cfg.tabs.flowInput) || TABS.flowInput);
  if (!sheet) sheet = _fiEnsureTab_(ss, cfg);
  const now = new Date();
  const recorded = [];
  _drClearProbes_(sheet).forEach(function (p) {
    const m = _drMeasure_(p.row);
    const prev = _drLastAnswered_(ss);
    m.changed = m.status === "ANSWERED" && prev ? _drChanges_(prev, m) : "";
    _drTab_(ss).appendRow([p.row[FI.TIMESTAMP], now, m.status, m.stamp, m.outcomes, m.shape, m.length,
      m.runCheck, m.model, m.codeVersion, m.promptVersion, m.changed]);
    recorded.push(m);
    Logger.log("[Drift] Probe from " + p.row[FI.TIMESTAMP] + ": " + m.status +
      (m.status === "ANSWERED" ? " (" + m.stamp + ", " + m.outcomes + ", shape " + m.shape + ", model " +
        (m.model || "not reported") + ")" : "") + (m.changed ? "; CHANGED: " + m.changed : ""));
  });
  _drSeed_(sheet);
  return { recorded: recorded, seeded: 1 };
}

// Clears every probe row (trashing its doc); returns [{ row }] with each
// row's values as they were.
function _drClearProbes_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!_drIsProbeRow_(data[i])) continue;
    out.push({ row: data[i] });
    sheet.getRange(i + 1, 1, 1, sheet.getLastColumn()).clearContent();
    const id = String(data[i][FI.STUDENT_FILE_ID] || "").trim();
    if (id) {
      try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* already gone */ }
    }
  }
  return out;
}

// A new probe row: written blank, then READY as its own edit (Studio's
// starter fires on an edit, 37's note on appended rows).
function _drSeed_(sheet) {
  const spec = _drSpec_();
  const made = _fxFlow2FixtureRow_(spec);
  const row = made.row.slice();
  row[FI.STUDENT_EMAIL] = spec.studentEmail;
  row[FI.READY_STATUS] = "";
  const width = Math.max(sheet.getLastColumn(), row.length);
  while (row.length < width) row.push("");
  const at = sheet.getLastRow() + 1;
  sheet.getRange(at, 1, 1, width).setValues([row]);
  SpreadsheetApp.flush();
  sheet.getRange(at, FI.READY_STATUS + 1).setValue("READY");
  return at;
}

// What one probe answer looks like, with no text kept.
function _drMeasure_(row) {
  const output = String(row[FI.GEMINI_FULL_OUTPUT] || "");
  const prov = _fiProvenance_(row, output);
  const m = { status: "", stamp: "", outcomes: "", shape: "", length: "", runCheck: prov.runCheck,
    model: prov.model, codeVersion: prov.codeVersion, promptVersion: prov.promptVersion };
  if (!output.trim()) { m.status = "NO_ANSWER"; return m; }
  const shape = _fiCheckResultShape_(output, row);
  m.shape = _drShape_(output);
  m.length = Math.round(output.length / 250) * 250;
  if (!shape.ok) { m.status = "MALFORMED: " + shape.reason; return m; }
  m.status = "ANSWERED";
  m.stamp = shape.compliance;
  m.outcomes = ["1", "2", "3", "4"].map(function (k) { return shape.outcomes[k] || "-"; }).join(",");
  return m;
}

// The answer's shape: each section heading it has, in order, with the number
// it carries ("1 OVERALL ASSESSMENT" or "OVERALL ASSESSMENT"), then how it
// labels a milestone ("-- MET", "-- [MET]", ": MET", "-- MET."), then the
// machine lines it has.
function _drShape_(output) {
  const text = String(output || "");
  const heads = [["OVERALL ASSESSMENT", "OA"], ["MILESTONE BREAKDOWN", "MB"], ["REQUIRED REVISIONS", "RR"],
    ["YOUR PROCESS", "YP"], ["ALSO SHOWN", "AS"], ["COMPLIANCE STAMP", "CS"]];
  const parts = [];
  heads.forEach(function (h) {
    const m = new RegExp("^\\s*(\\d+[a-z]?\\.)?\\s*" + h[0] + "\\b", "mi").exec(text);
    if (m) parts.push((m[1] || "") + h[1]);
  });
  const label = /MILESTONE 1[ \t]*--[ \t]*\[/i.test(text) ? "--[]" :
    /MILESTONE 1[ \t]*--[ \t]*\w+([ \t]+\w+)?\./i.test(text) ? "--." :
    /MILESTONE 1[ \t]*--/i.test(text) ? "--" : /MILESTONE 1[ \t]*:/i.test(text) ? ":" : "?";
  const lines = [["[SYSTEM:", "S"], ["[SUGGESTED_SCORE:", "SC"], ["[ALSO_SHOWN:", "A"], ["[RUN_INFO:", "R"],
    ["[MILESTONE_OUTCOMES:", "O"]].filter(function (l) { return text.indexOf(l[0]) !== -1; })
    .map(function (l) { return l[1]; });
  return parts.join(" ") + " | " + label + " | " + lines.join(",");
}

// The last ANSWERED probe, as recorded; null when none.
function _drLastAnswered_(ss) {
  const sheet = ss.getSheetByName(DRIFT_TAB);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const v = sheet.getRange(2, 1, sheet.getLastRow() - 1, DRIFT_HEADERS.length).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (String(v[i][2]) === "ANSWERED") {
      return { stamp: String(v[i][3]), outcomes: String(v[i][4]), shape: String(v[i][5]), length: Number(v[i][6]),
        model: String(v[i][8]), codeVersion: String(v[i][9]), promptVersion: String(v[i][10]) };
    }
  }
  return null;
}

// What changed against the previous answer, and whose change it is likely
// to be: "ours" when our code or prompt changed too, else "platform".
function _drChanges_(prev, m) {
  const platform = [];
  if (prev.model !== m.model) platform.push("model");
  if (prev.shape !== m.shape) platform.push("shape");
  if (prev.length && m.length && Math.abs(m.length - prev.length) > Math.max(500, prev.length * 0.4)) platform.push("length");
  const noted = [];
  if (prev.stamp !== m.stamp) noted.push("stamp");
  if (prev.outcomes !== m.outcomes) noted.push("outcomes");
  if (!platform.length && !noted.length) return "";
  const ours = prev.codeVersion !== m.codeVersion || prev.promptVersion !== m.promptVersion;
  const parts = [];
  if (platform.length) parts.push(platform.join(", ") + (ours ? " (with our code or prompt)" : " (PLATFORM)"));
  if (noted.length) parts.push(noted.join(", ") + " (noted; grades vary run to run)");
  return parts.join("; ");
}

function _drTab_(ss) {
  let sheet = ss.getSheetByName(DRIFT_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(DRIFT_TAB);
    sheet.appendRow(DRIFT_HEADERS);
  }
  return sheet;
}

// One line for the overnight email and showSetupStatus(): "" unless the
// probe went unanswered on its last run, or a platform change showed in the
// last DRIFT_WINDOW_DAYS days.
function flow2DriftLine_(ss, now) {
  const sheet = ss.getSheetByName(DRIFT_TAB);
  if (!sheet || sheet.getLastRow() < 2) return "";
  const nowMs = (now || new Date()).getTime();
  const v = sheet.getRange(2, 1, sheet.getLastRow() - 1, DRIFT_HEADERS.length).getValues();
  const last = v[v.length - 1];
  const out = [];
  if (String(last[2]) === "NO_ANSWER") {
    out.push("Flow 2's daily probe got no answer on its last run: check Studio (a release can pause flows until " +
      "settings are chosen and permissions granted).");
  }
  const recent = v.filter(function (r) {
    return /PLATFORM/.test(String(r[11])) && nowMs - sheetTimestampMs_(r[1]) <= DRIFT_WINDOW_DAYS * 86400000;
  });
  if (recent.length) {
    const r = recent[recent.length - 1];
    out.push("Flow 2's daily probe changed with no change of ours (" + String(r[11]).replace(/;.*$/, "") +
      "; model reported: " + (String(r[8]) || "none") + "). Check Studio's Ask Gemini step, then " +
      "recordStudioChange({...}) or confirmStudioConfig().");
  }
  return out.join(" ");
}
