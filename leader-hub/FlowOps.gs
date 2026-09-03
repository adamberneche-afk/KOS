/**
 * FlowOps.gs — leader-hub
 *
 * The reliability layer for leader-hub's six AI Flows: a schema guard, a
 * preflight, fixtures, and a canary. Entry points (run from the Apps Script
 * editor's Run dropdown — none take arguments, and none end in an
 * underscore, because GAS hides underscore-suffixed functions from it):
 *
 *   runLeaderHubPreflight()   — is this deployment sane? one report, no writes
 *   checkAiQueueSchema()      — has the AI_Queue header row drifted?
 *   repairAiQueueSchema()     — rewrite the header row, when that is safe
 *   installAiFlowFixtures()   — one PENDING row per job type, so every Flow
 *                               has something to match
 *   checkAiFlowFixtures()     — which fixtures moved off PENDING (i.e. which
 *                               Flows are actually live)
 *   removeAiFlowFixtures()    — take them back out
 *   checkAiFlowBinding()      — are the Flow's write-back columns bound
 *                               right? also logs the binding to copy
 *   runAiFlowCanary()         — end-to-end test of the Apps Script half,
 *                               with the Flow deliberately stubbed out
 *   cleanUpAiFlowCanary()     — drop the canary's stats key
 *
 * WHY THIS FILE EXISTS. leader-hub was one of the first builds in this repo
 * and never got the operational scaffolding the later ones did. cas-ccps has
 * a schema guard, a preflight, fixtures, and a canary; kos-personal has a
 * turnstile and a queue watchdog; leader-hub had none of the four, and its
 * AI Flow surface has exactly the failure modes those exist to catch. Three
 * are worth naming, because each already cost real time elsewhere here:
 *
 * 1. POSITIONAL SCHEMA DRIFT, silent and bidirectional. AIQ_COL in
 *    EmailBridge.gs maps names to column *indices*, and the Workspace Flow
 *    writes Status and Result back by column position too. So a reordered or
 *    inserted column breaks reading AND writing, with no error on either
 *    side — a Flow writes its result into the wrong cell and GAS reads
 *    PENDING forever. Not hypothetical: the same class of drift on cas-ccps's
 *    Central Ledger made LEDGER.TEACHER_EMAIL return a person's *name*,
 *    which silently killed every downstream lookup and took a live session
 *    to find. _getAiQueueSheet_() writes headers only when it creates the
 *    tab, so nothing has ever verified them after that.
 *
 * 2. A FLOW WITH NOTHING TO MATCH REPORTS SUCCESS. A Workspace Flow whose
 *    trigger finds zero rows says "Run Completed" in green. That is
 *    indistinguishable from working, and it is how a long stretch of a
 *    cas-ccps session got spent. Six Flows here have never had a row to
 *    match unless someone drove the UI by hand, so installAiFlowFixtures()
 *    plants one per type and checkAiFlowFixtures() reads back which ones a
 *    Flow actually touched. That read-back is the real diagnostic: a Status
 *    that moved off PENDING is proof that that specific Flow is live.
 *
 * 3. NO WAY TO TEST THE GAS HALF WITHOUT THE FLOW. runAiFlowCanary() closes
 *    that: it queues a job, asserts it reads back PENDING, simulates the
 *    Flow by writing COMPLETE plus a result into the row, then asserts the
 *    hand-back-once-and-delete path returns that result and removes the row.
 *    Same discipline as cas-ccps's runFlow2Canary() — verify our half
 *    completely, stub the part we do not control, and never report a pass
 *    for something that was not actually exercised.
 *
 * NO GCP SURFACE HERE, AND THAT IS THE POINT. Nothing in this file, or
 * anywhere in leader-hub, needs a Cloud project: the Flows call Gemini with
 * the Workspace account's own built-in access, which is the Bifurcation
 * Boundary EmailBridge.gs describes at its line 160. leader-hub is the
 * cleanest example of that pattern in this repo — no custom Studio steps, no
 * API key, nothing for an operator to provision — which is why it has no
 * entry in tools/gas-lint/gcp-map.json and should never acquire one.
 *
 * SAFETY — WHY A FIXTURE ROW CANNOT SEND ANYTHING. A row in AI_Queue causes a
 * Flow to generate text and write it back into that row. It does not cause
 * GAS to act: the only outbound side effect in this project,
 * createBragDraft_()'s GmailApp.createDraft(), is reachable only from an
 * explicit bragEmail client action and never from a queue row. So a
 * fixture's result is written, read by nobody, and removed by the existing
 * 2-hour sweep in checkAiJob_. Verified before this file was written; do not
 * wire a queue result into a send path without revisiting it.
 *
 * STATS HYGIENE. Fixtures write their rows directly rather than through
 * queueAiJob_(), so they never touch _bumpFlowStat_ and never inflate the
 * Settings AI Flow Health panel with traffic nobody generated. The canary
 * takes the opposite route on purpose — it goes through the real
 * queueAiJob_/checkAiJob_ path, because exercising that path is the whole
 * point — so it uses the job type CANARY, deliberately absent from
 * AI_FLOW_TYPES. getFlowHealth_() reports only AI_FLOW_TYPES entries, so
 * canary traffic is recorded but invisible in the panel.
 */

// A different namespace from anything a real job uses, so a fixture can
// always be told from a genuine queued job by its JobId alone — the same
// separation cas-ccps/scripts/39_FlowFixtures.js keeps between its
// VDOE-FIXTURE-* rows and the canaries' VDOE-CANARY-* ones.
const AI_FIXTURE_JOB_PREFIX = 'FIXTURE-';
const AI_CANARY_JOB_TYPE = 'CANARY';

// FIXTURE PAYLOADS — SHAPES TAKEN FROM THE PROMPTS, NOT INVENTED.
//
// Every key below comes from the fenced json example in the matching
// *_FLOW_PROMPT.md, which is also what the client actually sends (checked
// against the six callGAS('aiDraft', ...) sites in
// leader-hub/src/10-command-engine-ai-and-widgets.html). Only the VALUES are
// fixture stand-ins; the structure is the real contract.
//
// THIS FILE'S FIRST VERSION GOT ALL SIX WRONG, and it is worth recording why
// that mattered. They were plausible-looking inventions — EMAIL_COMPOSE as
// {to, intent, tone}, FIN_ANALYSIS as {account, transactions} — none of whose
// keys exist. Nothing would have errored: the Flow would have triggered, read
// a payload with no field it recognized, and produced confident nonsense.
// That is the same class of bug as cas-ccps's fixture profile carrying
// evaluation_signals as plain strings instead of objects, found the same way
// (reading the consumer instead of trusting the fixture), and it is the
// specific failure a fixture is supposed to rule out rather than introduce.
//
// tests/leaderhub/flow-ops.test.js re-reads the six markdown files and
// asserts key-for-key shape parity, so a prompt that grows a payload field
// fails a test here rather than silently leaving fixtures behind.
//
// Nothing real: .invalid addresses (the reserved TLD), synthetic figures, and
// no student or staff name anywhere. attentionDetails keeps its
// "<id>: <detail>" sentence shape because the prompt's rules read across those
// strings, so an entry that is only an address exercises nothing.
const AI_FIXTURE_PAYLOADS = {
  EMAIL_COMPOSE: {
    prompt: "FIXTURE — confirm this Flow triggers and returns a draft.",
    audience: "students",
    audienceLabel: "Students",
    trip: {
      name: "FIXTURE Trip",
      date: "April 25, 2026",
      returnDate: "April 29, 2026",
      destination: "FIXTURE City, VA",
      costPerStudent: 100,
      transportation: "Bus",
      chaperones: "FIXTURE Chaperone",
    },
  },
  ARCHIVE_INSIGHTS: {
    totalTrips: 6,
    totalStudents: 214,
    avgCostPerStudent: 38,
    tripTypes: [{ type: "FIXTURE Competition", count: 2 }],
    glows: ["FIXTURE_1: handled the registration table without being asked."],
    grows: ["FIXTURE_1: needs a earlier reminder about the packing list."],
  },
  WBL_INSIGHTS: {
    totalStudents: 12,
    onTrack: 8,
    notStarted: 1,
    sbeDone: 6,
    sbeTotal: 10,
    avgHours: "22.4",
    totalHours: "269.0",
    attentionDetails: [
      "fixture-student@example.invalid: 18 of 30 required hours logged; no reflections logged yet",
    ],
    sbeNotes: ["FIXTURE SBE note: waiting on a confirmed cart storage spot."],
  },
  LP_ASSIST: {
    prompt: "FIXTURE — confirm this Flow triggers and returns lesson-planning help.",
    lessonTitle: "FIXTURE Lesson",
    course: "FIXTURE Sports Marketing",
    quarter: 2,
    competencies: [58],
    planBody: "FIXTURE plan body — a short synthetic lesson outline.",
  },
  FIN_ANALYSIS: {
    reportType: "roi",
    totalRev: 4820.50,
    totalCOGS: 2910.15,
    profit: 1910.35,
    margin: 40,
    shifts: 22,
    totalInv: 1340.00,
    totalOrderedCost: 3600.00,
    lowStockCount: 3,
  },
  BRAG_EMAIL: {
    audience: "green",
    audienceLabel: "FIXTURE Administrator",
    tone: "warm and brief, leading with the student outcome",
    weekLabel: "August 11",
    sections: [
      "FIXTURE Section\n• FIXTURE_1 placed at a district event.\n• FIXTURE_2 logged 30 WBL hours.",
    ],
  },
};

// ── Schema guard ─────────────────────────────────────────────────────────────

/**
 * Compares the AI_Queue and AI_Prompts header rows against the constants the
 * code indexes by position. Read-only — it never writes.
 */
function checkAiQueueSchema() {
  const report = { ok: true, tabs: [] };

  const specs = [
    { tab: AI_QUEUE_SHEET_NAME, expected: AI_QUEUE_HEADERS, sheet: _getAiQueueSheet_() },
    { tab: AI_PROMPT_TAB, expected: AI_PROMPT_HEADERS, sheet: _getAiPromptSheet_() },
  ];

  specs.forEach(function (spec) {
    const entry = { tab: spec.tab, status: 'OK', expected: spec.expected, actual: [], dataRows: 0 };
    const lastCol = spec.sheet.getLastColumn();
    const lastRow = spec.sheet.getLastRow();
    entry.dataRows = Math.max(0, lastRow - 1);
    entry.actual = lastCol > 0
      ? spec.sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); })
      : [];

    if (entry.actual.length === 0 || entry.actual.join('') === '') {
      entry.status = 'MISSING_HEADERS';
    } else if (entry.actual.length !== spec.expected.length ||
               entry.actual.join(' ') !== spec.expected.join(' ')) {
      entry.status = 'DRIFTED';
      // Naming the shape of the drift matters more than naming the fact of
      // it: a reorder silently mis-maps existing rows, appended columns are
      // harmless, and inserted ones shift everything after them.
      const sortedActual = entry.actual.slice().sort().join(' ');
      const sortedExpected = spec.expected.slice().sort().join(' ');
      entry.drift = (sortedActual === sortedExpected) ? 'REORDERED'
        : (entry.actual.length > spec.expected.length) ? 'EXTRA_COLUMNS'
        : 'MISSING_OR_RENAMED_COLUMNS';
    }
    if (entry.status !== 'OK') report.ok = false;
    report.tabs.push(entry);
  });

  Logger.log('[FlowOps] checkAiQueueSchema: ' + (report.ok ? 'both tabs OK' : 'DRIFT FOUND'));
  report.tabs.forEach(function (t) {
    Logger.log('[FlowOps]   ' + t.tab + ': ' + t.status + (t.drift ? ' (' + t.drift + ')' : '') +
      ', ' + t.dataRows + ' data row(s)');
    if (t.status !== 'OK') {
      Logger.log('[FlowOps]     expected: ' + t.expected.join(' | '));
      Logger.log('[FlowOps]     actual:   ' + t.actual.join(' | '));
    }
  });
  if (!report.ok) {
    Logger.log('[FlowOps] Next: repairAiQueueSchema(). It refuses while data rows are present, ' +
      'because rewriting headers over rows laid out the old way mis-maps them.');
  }
  return report;
}

/**
 * Rewrites a drifted header row — but only when doing so cannot corrupt
 * anything. Refuses while data rows exist, because a header rewrite over
 * rows written under the old layout relabels their columns without moving
 * their values, which is worse than the drift: it makes the mismatch
 * invisible. Queue rows are transient (checkAiJob_ sweeps everything older
 * than two hours), so waiting is a real option here in a way it was not for
 * cas-ccps's Ledger — which is why this refuses rather than backing up and
 * rebuilding the way 38_LedgerSchemaGuard.js does.
 */
function repairAiQueueSchema() {
  const before = checkAiQueueSchema();
  const result = { repaired: [], refused: [], alreadyOk: [] };

  before.tabs.forEach(function (entry) {
    if (entry.status === 'OK') { result.alreadyOk.push(entry.tab); return; }
    if (entry.dataRows > 0) {
      result.refused.push({ tab: entry.tab, reason: entry.dataRows + ' data row(s) present' });
      return;
    }
    const sheet = (entry.tab === AI_QUEUE_SHEET_NAME) ? _getAiQueueSheet_() : _getAiPromptSheet_();
    const width = Math.max(entry.actual.length, entry.expected.length);
    if (width > 0) sheet.getRange(1, 1, 1, width).clearContent();
    sheet.getRange(1, 1, 1, entry.expected.length).setValues([entry.expected]);
    sheet.setFrozenRows(1);
    result.repaired.push(entry.tab);
  });

  Logger.log('[FlowOps] repairAiQueueSchema: repaired ' + result.repaired.length +
    ', refused ' + result.refused.length + ', already OK ' + result.alreadyOk.length);
  result.refused.forEach(function (r) {
    Logger.log('[FlowOps]   REFUSED ' + r.tab + ': ' + r.reason + '. For AI_Queue, either wait for ' +
      'the two-hour sweep in checkAiJob_ to clear them, or run removeAiFlowFixtures() if they are ' +
      'fixtures. For AI_Prompts, syncAiPromptsToSheet() rewrites the whole tab including headers.');
  });
  return result;
}

// ── Preflight ────────────────────────────────────────────────────────────────

/**
 * One read-only report answering "would the AI Flows work right now?".
 * Deliberately makes no writes at all, so it is safe to run against a live
 * deployment at any time.
 */
function runLeaderHubPreflight() {
  const checks = [];
  function record(name, pass, detail) { checks.push({ name: name, pass: !!pass, detail: detail || '' }); }

  const prop = PropertiesService.getScriptProperties();
  const queueId = prop.getProperty(AI_QUEUE_SHEET_PROP);
  record('AI queue spreadsheet ID property is set', !!queueId,
    queueId ? AI_QUEUE_SHEET_PROP + ' = ' + queueId : AI_QUEUE_SHEET_PROP + ' is unset — ' +
    '_getAiQueueSheet_() will create the spreadsheet on first use, which is fine, but until then ' +
    'no Flow has a file to point its trigger at');

  if (queueId) {
    let queueOpens = false;
    try { SpreadsheetApp.openById(queueId); queueOpens = true; } catch (e) { queueOpens = false; }
    record('AI queue spreadsheet opens', queueOpens,
      queueOpens ? '' : 'openById failed — the file was deleted, or moved somewhere this script ' +
      'cannot read. _getAiQueueSheet_() would silently create a NEW one while every Flow trigger ' +
      'stayed pointed at the old file');
  }

  const schema = checkAiQueueSchema();
  schema.tabs.forEach(function (t) {
    record('Tab "' + t.tab + '" header row matches the code', t.status === 'OK',
      t.status === 'OK' ? t.expected.length + ' columns' :
      t.status + (t.drift ? ' (' + t.drift + ')' : '') + ' — the code reads these columns by ' +
      'position and the Flow writes them back by position, so both directions are affected. Run ' +
      'checkAiQueueSchema() for the diff');
  });

  const prompts = checkAiPrompts();
  record('Every prompt in the sheet matches the code', prompts.drifted === 0 && prompts.missing === 0,
    'inSync ' + prompts.inSync + ', drifted ' + prompts.drifted + ', missing ' + prompts.missing +
    ', unregistered ' + prompts.unregistered +
    ((prompts.drifted || prompts.missing) ? ' — run syncAiPromptsToSheet()' : ''));

  const emptyPrompts = [];
  AI_FLOW_TYPES.forEach(function (type) {
    if (!aiPromptText_(type)) emptyPrompts.push(type);
  });
  record('Every job type has a prompt in code', emptyPrompts.length === 0,
    emptyPrompts.length ? 'no prompt for: ' + emptyPrompts.join(', ') +
    ' — a Flow for that type has nothing to read' : AI_FLOW_TYPES.length + ' types covered');

  const fixtures = _flowOpsFindFixtureRows_();
  record('Fixtures installed (informational, not required)', true,
    fixtures.length ? fixtures.length + ' fixture row(s) present — checkAiFlowFixtures() shows ' +
    'which Flows have touched them' : 'none — installAiFlowFixtures() gives each Flow a row to ' +
    'match, so a green "Run Completed" over zero rows stops looking like success');

  const passed = checks.filter(function (c) { return c.pass; }).length;
  const result = { ok: passed === checks.length, passed: passed, total: checks.length, checks: checks };

  Logger.log('[FlowOps] runLeaderHubPreflight: ' + passed + '/' + checks.length + ' passed');
  checks.forEach(function (c) {
    Logger.log('[FlowOps]   ' + (c.pass ? 'PASS' : 'FAIL') + '  ' + c.name +
      (c.detail ? ' — ' + c.detail : ''));
  });
  return result;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Row matching is expressed as data rather than as a callback passed into a
// helper. That is deliberate and load-bearing for the linter: gas-lint's
// Check F cannot see a function that arrives as a parameter, so a
// predicate(row) shape here would add a false "possibly undefined" warning to
// a baseline that is currently down to real findings only. Same reason
// cas-ccps/scripts/39_FlowFixtures.js is structured this way.
function _flowOpsFindFixtureRows_() {
  const sheet = _getAiQueueSheet_();
  const data = sheet.getDataRange().getValues();
  const found = [];
  for (let i = 1; i < data.length; i++) {
    const jobId = String(data[i][AIQ_COL.JOB_ID] || '');
    if (jobId.indexOf(AI_FIXTURE_JOB_PREFIX) === 0) {
      found.push({
        rowNumber: i + 1,
        jobId: jobId,
        type: String(data[i][AIQ_COL.TYPE] || ''),
        status: String(data[i][AIQ_COL.STATUS] || 'PENDING'),
        result: String(data[i][AIQ_COL.RESULT] || ''),
        error: String(data[i][AIQ_COL.ERROR] || ''),
      });
    }
  }
  return found;
}

/**
 * Plants one PENDING row per job type so every Flow has something its trigger
 * can match. Idempotent: existing fixtures are removed first, so running this
 * twice leaves six rows, not twelve.
 *
 * Writes rows directly instead of calling queueAiJob_() — see the file
 * header's STATS HYGIENE note. A fixture is not traffic and must not show up
 * as traffic in the AI Flow Health panel.
 */
function installAiFlowFixtures() {
  removeAiFlowFixtures();
  const sheet = _getAiQueueSheet_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const installed = [];

  AI_FLOW_TYPES.forEach(function (type) {
    const jobId = AI_FIXTURE_JOB_PREFIX + type + '-' + stamp;
    const payload = AI_FIXTURE_PAYLOADS[type] || { note: 'Fixture row — confirm this Flow triggers.' };
    sheet.appendRow([new Date(), jobId, type, JSON.stringify(payload), 'PENDING', '', '']);
    installed.push({ type: type, jobId: jobId });
  });

  Logger.log('[FlowOps] installAiFlowFixtures: installed ' + installed.length + ' row(s), all PENDING');
  Logger.log('[FlowOps] Next: wait for the Flows to run, then checkAiFlowFixtures(). A Status that ' +
    'moved off PENDING is proof that that specific Flow is live — a green "Run Completed" in the ' +
    'Flow UI is not, because a Flow that matched zero rows reports exactly the same thing.');
  Logger.log('[FlowOps] These rows are also swept automatically by checkAiJob_ after two hours, so ' +
    'forgetting removeAiFlowFixtures() leaks nothing.');
  return { installed: installed };
}

/**
 * Reads back every fixture's current Status. This is the actual test: PENDING
 * means no Flow has touched that type yet, anything else means one has.
 */
function checkAiFlowFixtures() {
  const rows = _flowOpsFindFixtureRows_();
  const byStatus = { PENDING: [], COMPLETE: [], ERROR: [], OTHER: [] };
  rows.forEach(function (r) {
    const bucket = byStatus[r.status] ? r.status : 'OTHER';
    byStatus[bucket].push(r.type);
  });
  const missing = AI_FLOW_TYPES.filter(function (type) {
    return !rows.some(function (r) { return r.type === type; });
  });

  const report = {
    total: rows.length,
    pending: byStatus.PENDING,
    complete: byStatus.COMPLETE,
    errored: byStatus.ERROR,
    other: byStatus.OTHER,
    missingTypes: missing,
    rows: rows,
  };

  Logger.log('[FlowOps] checkAiFlowFixtures: ' + rows.length + ' fixture row(s)');
  Logger.log('[FlowOps]   still PENDING (no Flow has touched these): ' +
    (byStatus.PENDING.length ? byStatus.PENDING.join(', ') : 'none'));
  Logger.log('[FlowOps]   COMPLETE (Flow confirmed live): ' +
    (byStatus.COMPLETE.length ? byStatus.COMPLETE.join(', ') : 'none'));
  if (byStatus.ERROR.length) {
    Logger.log('[FlowOps]   ERROR (Flow ran and failed): ' + byStatus.ERROR.join(', '));
  }
  if (byStatus.OTHER.length) {
    Logger.log('[FlowOps]   unexpected Status values: ' + byStatus.OTHER.join(', '));
  }
  if (missing.length) {
    Logger.log('[FlowOps]   no fixture row for: ' + missing.join(', ') + ' — run installAiFlowFixtures()');
  }
  return report;
}

/** Removes every fixture row, bottom-up so deletions never shift later indices. */
function removeAiFlowFixtures() {
  const sheet = _getAiQueueSheet_();
  const rows = _flowOpsFindFixtureRows_();
  for (let i = rows.length - 1; i >= 0; i--) sheet.deleteRow(rows[i].rowNumber);
  Logger.log('[FlowOps] removeAiFlowFixtures: removed ' + rows.length + ' row(s)');
  return { removed: rows.length };
}

// ── Binding probe ────────────────────────────────────────────────────────────

// Statuses checkAiJob_ actually recognizes, and the exact strings it compares
// against. Case-sensitive and exact — see _aiDiagnoseQueueRow_ for why that
// matters more here than it looks.
const AI_TERMINAL_STATUSES = ['COMPLETE', 'ERROR'];

/**
 * Diagnoses whether a Flow's write-back step is bound to the right columns.
 *
 * WHY THIS EXISTS. Every other check in this file verifies the Apps Script
 * side. The Studio side is built by hand in a UI, and the only signal about
 * it was checkAiFlowFixtures()'s "still PENDING" — one answer covering four
 * causes: the Flow was never built, its trigger matches no rows, it runs and
 * writes into the wrong columns, or it runs and Gemini errors. The third
 * looks exactly like the first.
 *
 * LEADER-HUB'S SHAPE IS DIFFERENT FROM cas-ccps's. There the Flow appends a
 * new row, so a mis-binding shows up as a shifted arrival. Here the Flow
 * updates an EXISTING AI_Queue row in place, writing Status and Result by
 * column position, which produces its own failure modes — the most common
 * being a result written without the status flipped, which leaves the job
 * PENDING forever and then swept.
 *
 * TIMING. Rows are deleted the instant their outcome is handed back, and
 * swept after two hours regardless. So this is only informative while a row
 * is in flight: install fixtures, let a Flow run, then run this. On an empty
 * queue it says so rather than implying health.
 *
 * Read-only. Also logs the binding to copy, generated from AI_QUEUE_HEADERS
 * rather than transcribed, so it cannot drift from what the code reads.
 */
function checkAiFlowBinding() {
  const report = { rows: 0, ok: 0, problems: [], expected: [] };

  AI_QUEUE_HEADERS.forEach(function (name, idx) {
    let owner;
    if (idx === AIQ_COL.STATUS || idx === AIQ_COL.RESULT || idx === AIQ_COL.ERROR) {
      owner = 'the Flow writes this';
    } else {
      owner = 'set by queueAiJob_ — the Flow must NOT change it';
    }
    report.expected.push({ column: idx + 1, header: name, owner: owner });
  });
  Logger.log('[FlowOps] Expected binding for the Flow\'s write-back step, updating the ' +
    AI_QUEUE_SHEET_NAME + ' row it was triggered by:');
  report.expected.forEach(function (e) {
    Logger.log('[FlowOps]   col ' + e.column + '  ' + e.header + '  — ' + e.owner);
  });
  Logger.log('[FlowOps]   Status must become the literal COMPLETE (or ERROR). Result carries ' +
    'the generated text. Match the row on JobId, never on a row number — the sweep in ' +
    'checkAiJob_ deletes rows and shifts every position below them.');

  const sheet = _getAiQueueSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('[FlowOps] ' + AI_QUEUE_SHEET_NAME + ' is empty, so there is no binding to ' +
      'diagnose — and an empty queue is the NORMAL resting state, since a row is deleted the ' +
      'moment its outcome is handed back. Run installAiFlowFixtures(), give the Flows a ' +
      'moment, then run this again.');
    return report;
  }

  const width = AI_QUEUE_HEADERS.length;
  const data = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (let i = 0; i < data.length; i++) {
    report.rows++;
    const issues = _aiDiagnoseQueueRow_(data[i]);
    if (!issues.length) { report.ok++; continue; }
    report.problems.push({ row: i + 2, jobId: String(data[i][AIQ_COL.JOB_ID] || ''), issues: issues });
  }

  Logger.log('[FlowOps] checkAiFlowBinding: ' + report.ok + '/' + report.rows +
    ' queue row(s) in a state the code can act on');
  report.problems.forEach(function (p) {
    Logger.log('[FlowOps]   row ' + p.row + ' (' + p.jobId + '):');
    p.issues.forEach(function (msg) { Logger.log('[FlowOps]     - ' + msg); });
  });
  return report;
}

/**
 * Per-row diagnosis. Returns a list of problems; empty means the row is in a
 * state checkAiJob_ can act on correctly.
 *
 * A row still cleanly PENDING with nothing written is NOT a problem — that is
 * a job waiting for its Flow, which is what checkAiFlowFixtures() reports on.
 * This function is about rows the Flow has touched and touched wrongly.
 */
function _aiDiagnoseQueueRow_(row) {
  const issues = [];
  const cell = function (idx) { return String(row[idx] === undefined ? '' : row[idx]).trim(); };
  const status = cell(AIQ_COL.STATUS);
  const result = cell(AIQ_COL.RESULT);
  const error = cell(AIQ_COL.ERROR);

  // The single most likely mis-binding: Result bound, Status not. checkAiJob_
  // compares status === 'PENDING' and returns early, so the generated text
  // sits there until the two-hour sweep deletes it. The client polls, times
  // out, and falls back to a local draft — indistinguishable from "no Flow".
  if (status === 'PENDING' && result) {
    issues.push('Result is filled but Status is still PENDING. The Flow wrote its output and ' +
      'never flipped the status, so checkAiJob_ returns PENDING forever and the sweep deletes ' +
      'the row after two hours. Bind Status to the literal COMPLETE in the same step.');
  }

  // Status flipped, nothing to hand back.
  if (AI_TERMINAL_STATUSES.indexOf(status) !== -1 && status !== 'ERROR' && !result) {
    issues.push('Status is COMPLETE but Result is empty. Either the Result binding is missing, ' +
      'or it is pointed at another column — the client will receive an empty draft and treat ' +
      'it as a failure.');
  }

  // A shift right by one puts the generated text in Error and leaves Result
  // empty. checkAiJob_ would hand back an empty COMPLETE, or an ERROR whose
  // message is actually the draft.
  if (!result && error && error.length > 40) {
    issues.push('Error (column ' + (AIQ_COL.ERROR + 1) + ') holds ' + error.length +
      ' characters while Result (column ' + (AIQ_COL.RESULT + 1) + ') is empty — that is the ' +
      'signature of a binding shifted one column right. The generated text is landing in the ' +
      'error field.');
  }

  // CASE SENSITIVITY, and it is worse than untidy. checkAiJob_ tests
  // `status === 'PENDING'` exactly, then treats everything else as terminal.
  // So a Flow that writes "pending" while it is still working causes the row
  // to be DELETED and whatever is in Result — possibly nothing — handed back
  // as a completed job.
  if (status && status !== 'PENDING' && AI_TERMINAL_STATUSES.indexOf(status) === -1) {
    issues.push('Status is "' + status + '", which is neither PENDING nor ' +
      AI_TERMINAL_STATUSES.join('/') + '. The comparison is exact and case-sensitive, and ' +
      'anything that is not exactly PENDING is treated as a finished job: this row will be ' +
      'handed back and DELETED on the next poll. A lowercase "pending" is the dangerous ' +
      'version of this.');
  }

  // Columns queueAiJob_ owns. The Flow updating a row should touch Status,
  // Result and Error only; a write into Type or Payload means the whole
  // binding is off, and it also destroys the job's own identity.
  if (!cell(AIQ_COL.JOB_ID)) {
    issues.push('JobId is empty. checkAiJob_ finds rows by JobId, so this row can never be ' +
      'handed back — if the Flow cleared it, its update is bound one column left.');
  }
  if (!cell(AIQ_COL.TYPE)) {
    issues.push('Type is empty, so _bumpFlowStat_ has nothing to record against and the AI ' +
      'Flow Health panel will never show this job.');
  }
  const payload = cell(AIQ_COL.PAYLOAD);
  if (payload && result && payload === result) {
    issues.push('Payload and Result are identical — the Flow is writing its output back over ' +
      'the input. Bind Result to column ' + (AIQ_COL.RESULT + 1) + ', not ' +
      (AIQ_COL.PAYLOAD + 1) + '.');
  }

  return issues;
}

// ── Canary ───────────────────────────────────────────────────────────────────

/**
 * Exercises the Apps Script half of the AI Flow path end to end, with the
 * Flow itself deliberately stubbed: queue a job, confirm it reads back
 * PENDING, write COMPLETE plus a result into its row the way a Flow would,
 * then confirm the hand-back-once-and-delete path returns that result and
 * removes the row.
 *
 * What this proves: queueAiJob_, checkAiJob_'s lookup, the sweep's
 * skip-the-target rule, the fresh-read row re-resolution after sweeping, the
 * hand-back, the row deletion, and the stats bump. What it deliberately does
 * NOT prove: that any Workspace Flow exists or works — that is what
 * installAiFlowFixtures() plus checkAiFlowFixtures() are for. Reporting a
 * pass here as "the AI Flows work" would be exactly the false green this
 * whole file exists to eliminate.
 */
function runAiFlowCanary() {
  const steps = [];
  function step(name, pass, detail) { steps.push({ name: name, pass: !!pass, detail: detail || '' }); }

  const marker = 'canary-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  const queued = queueAiJob_({ type: AI_CANARY_JOB_TYPE, payload: { marker: marker } });
  step('queueAiJob_ returns a jobId', queued.ok && !!queued.jobId, JSON.stringify(queued));
  if (!queued.ok || !queued.jobId) {
    Logger.log('[FlowOps] runAiFlowCanary: ABORTED — could not queue');
    return { ok: false, passed: 0, total: steps.length, steps: steps };
  }
  const jobId = queued.jobId;

  const pending = checkAiJob_({ jobId: jobId });
  step('a fresh job reads back as PENDING', pending.ok && pending.status === 'PENDING',
    JSON.stringify(pending));

  // Stand in for the Flow: find the row and write Status + Result by column
  // position, exactly as a Workspace Sheets connector step would.
  const sheet = _getAiQueueSheet_();
  const data = sheet.getDataRange().getValues();
  let rowNumber = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][AIQ_COL.JOB_ID]) === jobId) { rowNumber = i + 1; break; }
  }
  step('the queued row is findable by JobId', rowNumber > 1, 'row ' + rowNumber);
  if (rowNumber < 2) {
    Logger.log('[FlowOps] runAiFlowCanary: ABORTED — queued row not found');
    return { ok: false, passed: 0, total: steps.length, steps: steps };
  }
  const expectedResult = 'CANARY RESULT ' + marker;
  sheet.getRange(rowNumber, AIQ_COL.STATUS + 1).setValue('COMPLETE');
  sheet.getRange(rowNumber, AIQ_COL.RESULT + 1).setValue(expectedResult);

  const handed = checkAiJob_({ jobId: jobId });
  step('a COMPLETE job hands back its result',
    handed.ok && handed.status === 'COMPLETE' && handed.result === expectedResult,
    JSON.stringify(handed));

  const after = checkAiJob_({ jobId: jobId });
  step('the row is gone after being handed back once',
    after.ok && after.status === 'NOT_FOUND', JSON.stringify(after));

  const stats = _getFlowStats_()[AI_CANARY_JOB_TYPE] || {};
  step('stats recorded the submit and the completion',
    (stats.submitted || 0) >= 1 && (stats.completed || 0) >= 1, JSON.stringify(stats));
  step('canary traffic stays out of the AI Flow Health panel',
    AI_FLOW_TYPES.indexOf(AI_CANARY_JOB_TYPE) === -1 && !getFlowHealth_().stats[AI_CANARY_JOB_TYPE],
    'job type "' + AI_CANARY_JOB_TYPE + '" is deliberately not in AI_FLOW_TYPES');

  const passed = steps.filter(function (s) { return s.pass; }).length;
  const ok = passed === steps.length;
  Logger.log('[FlowOps] runAiFlowCanary: ' + passed + '/' + steps.length + ' step(s) passed');
  steps.forEach(function (s) {
    Logger.log('[FlowOps]   ' + (s.pass ? 'PASS' : 'FAIL') + '  ' + s.name +
      (s.detail ? ' — ' + s.detail : ''));
  });
  Logger.log('[FlowOps] This exercised the Apps Script half ONLY — the Flow was stubbed. Use ' +
    'installAiFlowFixtures() plus checkAiFlowFixtures() to find out whether the real Flows run.');
  if (ok) Logger.log('[FlowOps] Optional: cleanUpAiFlowCanary() drops the CANARY stats key.');
  return { ok: ok, passed: passed, total: steps.length, steps: steps };
}

/** Drops the canary's stats key. Purely cosmetic — nothing reads it. */
function cleanUpAiFlowCanary() {
  const stats = _getFlowStats_();
  const had = !!stats[AI_CANARY_JOB_TYPE];
  delete stats[AI_CANARY_JOB_TYPE];
  _saveFlowStats_(stats);
  Logger.log('[FlowOps] cleanUpAiFlowCanary: ' +
    (had ? 'removed the CANARY stats key' : 'nothing to remove'));
  return { removed: had };
}
