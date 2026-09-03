'use strict';
// Regression tests for leader-hub/FlowOps.gs — the schema guard, preflight,
// fixtures and canary that leader-hub was missing.
//
// leader-hub was one of the first builds in this repo, and it never got the
// operational scaffolding the later ones did. What these tests pin is not
// "the helpers run" but the three specific failure modes the file exists for,
// each of which has already cost real time somewhere in this repo:
//
//   1. Positional schema drift. AIQ_COL indexes AI_Queue by column position
//      and the Workspace Flow writes Status/Result back by position too, so
//      drift breaks both directions silently. The same class of drift on
//      cas-ccps's Central Ledger made LEDGER.TEACHER_EMAIL return a person's
//      name and took a live session to find.
//   2. A Flow with nothing to match reports a green "Run Completed". The
//      fixtures exist so that green means something, and the read-back of a
//      fixture's Status is the only real evidence a given Flow is live.
//   3. No way to test the GAS half without the Flow. The canary stubs the
//      Flow deliberately, and the test below asserts it does NOT claim more
//      than that.
//
// Two invariants here are quiet but load-bearing, and a plausible-looking
// refactor would break either one:
//   - fixtures must not touch _bumpFlowStat_, or the AI Flow Health panel
//     shows traffic nobody generated;
//   - removeAiFlowFixtures() must leave a real queued job alone, or a
//     cleanup step eats someone's in-flight work.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { loadGasFiles } = require('../harness/gas-sandbox');

const LH = path.join(__dirname, '..', '..', 'leader-hub');
// Same list EmailBridge.gs's AI_FLOW_TYPES holds; ai-prompts.test.js asserts
// the two agree, so hardcoding it here is a check, not a duplication.
const JOB_TYPES = ['EMAIL_COMPOSE', 'ARCHIVE_INSIGHTS', 'WBL_INSIGHTS',
                   'LP_ASSIST', 'FIN_ANALYSIS', 'BRAG_EMAIL'];
const FILES = [
  path.join(LH, 'EmailBridge.gs'),
  path.join(LH, 'AiPrompts.gs'),
  path.join(LH, 'FlowOps.gs'),
];

const EXPOSE = [
  // FlowOps entry points
  'checkAiQueueSchema', 'repairAiQueueSchema', 'runLeaderHubPreflight',
  'installAiFlowFixtures', 'checkAiFlowFixtures', 'removeAiFlowFixtures',
  'runAiFlowCanary', 'cleanUpAiFlowCanary',
  'AI_FIXTURE_JOB_PREFIX', 'AI_CANARY_JOB_TYPE', 'AI_FIXTURE_PAYLOADS',
  // EmailBridge collaborators
  'queueAiJob_', 'checkAiJob_', 'getFlowHealth_', '_getFlowStats_',
  'AI_FLOW_TYPES', 'AI_QUEUE_HEADERS', 'AI_QUEUE_SHEET_NAME', 'AI_QUEUE_SHEET_PROP',
  'AIQ_COL',
  // AiPrompts collaborators
  'syncAiPromptsToSheet', 'AI_PROMPT_TAB', 'AI_PROMPT_HEADERS',
];

function load() {
  return loadGasFiles(FILES, EXPOSE);
}

function queueSheet(exported, sandbox) {
  const id = sandbox.PropertiesService.getScriptProperties()
    .getProperty(exported.AI_QUEUE_SHEET_PROP);
  return sandbox.SpreadsheetApp.openById(id).getSheetByName(exported.AI_QUEUE_SHEET_NAME);
}

// ── Schema guard ─────────────────────────────────────────────────────────────

test('checkAiQueueSchema: clean on a freshly provisioned deployment', () => {
  const { exported } = load();
  exported.syncAiPromptsToSheet(); // creates the AI_Prompts tab with its headers
  const report = exported.checkAiQueueSchema();
  assert.equal(report.ok, true);
  assert.deepEqual(report.tabs.map((t) => t.status), ['OK', 'OK']);
});

test('checkAiQueueSchema: a REORDERED header row is the dangerous case and is named as such', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);

  // Swap Status and Result. Every existing row's data stays where it was, so
  // GAS would read a result as a status and the Flow would write a status
  // into the result cell. Nothing errors — this is the whole problem.
  const swapped = exported.AI_QUEUE_HEADERS.slice();
  const s = swapped.indexOf('Status');
  const r = swapped.indexOf('Result');
  swapped[s] = 'Result'; swapped[r] = 'Status';
  sheet.getRange(1, 1, 1, swapped.length).setValues([swapped]);

  const report = exported.checkAiQueueSchema();
  assert.equal(report.ok, false);
  const queue = report.tabs.find((t) => t.tab === exported.AI_QUEUE_SHEET_NAME);
  assert.equal(queue.status, 'DRIFTED');
  assert.equal(queue.drift, 'REORDERED');
});

test('checkAiQueueSchema: an appended column reports as EXTRA_COLUMNS', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);
  const wider = exported.AI_QUEUE_HEADERS.concat(['SomethingNew']);
  sheet.getRange(1, 1, 1, wider.length).setValues([wider]);

  const queue = exported.checkAiQueueSchema().tabs
    .find((t) => t.tab === exported.AI_QUEUE_SHEET_NAME);
  assert.equal(queue.drift, 'EXTRA_COLUMNS');
});

test('checkAiQueueSchema: a blank header row reports as MISSING_HEADERS, not as drift', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);
  sheet.getRange(1, 1, 1, exported.AI_QUEUE_HEADERS.length).clearContent();

  const queue = exported.checkAiQueueSchema().tabs
    .find((t) => t.tab === exported.AI_QUEUE_SHEET_NAME);
  assert.equal(queue.status, 'MISSING_HEADERS');
});

test('checkAiQueueSchema: read-only — it never writes a fix of its own', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);
  const broken = ['a', 'b', 'c'];
  sheet.getRange(1, 1, 1, 3).setValues([broken]);

  exported.checkAiQueueSchema();
  assert.deepEqual(sheet.getRange(1, 1, 1, 3).getValues()[0], broken,
    'checking must not silently repair — repair is a separate, refusable step');
});

test('repairAiQueueSchema: rewrites headers when there are no data rows', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);
  sheet.getRange(1, 1, 1, 3).setValues([['wrong', 'wrong', 'wrong']]);

  const result = exported.repairAiQueueSchema();
  assert.ok(result.repaired.includes(exported.AI_QUEUE_SHEET_NAME));
  assert.equal(exported.checkAiQueueSchema().ok, true);
});

test('repairAiQueueSchema: REFUSES while data rows are present', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  // A real queued job, mid-flight.
  exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: { x: 1 } });

  const sheet = queueSheet(exported, sandbox);
  const swapped = exported.AI_QUEUE_HEADERS.slice().reverse();
  sheet.getRange(1, 1, 1, swapped.length).setValues([swapped]);

  const result = exported.repairAiQueueSchema();
  // Rewriting headers over rows written under the old layout relabels their
  // columns without moving their values — that hides the mismatch instead of
  // fixing it, so refusing is the correct behaviour, not a limitation.
  assert.equal(result.repaired.length, 0);
  assert.ok(result.refused.some((r) => r.tab === exported.AI_QUEUE_SHEET_NAME));
  assert.deepEqual(sheet.getRange(1, 1, 1, swapped.length).getValues()[0], swapped,
    'the drifted headers must be left exactly as they were');
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

test('installAiFlowFixtures: one PENDING row per job type', () => {
  const { exported } = load();
  const result = exported.installAiFlowFixtures();
  assert.equal(result.installed.length, exported.AI_FLOW_TYPES.length);

  const report = exported.checkAiFlowFixtures();
  assert.equal(report.total, exported.AI_FLOW_TYPES.length);
  assert.deepEqual(report.pending.sort(), [...exported.AI_FLOW_TYPES].sort());
  assert.deepEqual(report.missingTypes, []);
});

test('installAiFlowFixtures: idempotent — twice leaves six rows, not twelve', () => {
  const { exported } = load();
  exported.installAiFlowFixtures();
  exported.installAiFlowFixtures();
  assert.equal(exported.checkAiFlowFixtures().total, exported.AI_FLOW_TYPES.length);
});

test('installAiFlowFixtures: every job type has a payload of its own', () => {
  const { exported } = load();
  // A missing payload silently falls back to a generic note, which would give
  // that Flow's prompt the wrong shape and make a real failure look like a
  // prompt bug. Adding a job type means adding a payload here.
  exported.AI_FLOW_TYPES.forEach((type) => {
    assert.ok(exported.AI_FIXTURE_PAYLOADS[type],
      type + ' has no entry in AI_FIXTURE_PAYLOADS');
  });
});

test('fixtures carry no real data — every string is synthetic', () => {
  const { exported } = load();
  // FERPA: a fixture row's payload cell is as visible as any other. Anything
  // resembling a real address must be an .invalid one.
  const blob = JSON.stringify(exported.AI_FIXTURE_PAYLOADS);
  const emails = blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) || [];
  emails.forEach((e) => {
    assert.ok(e.endsWith('.invalid'), e + ' is not an .invalid address');
  });
  assert.ok(!/ccpsnet\.net/.test(blob), 'no real domain in fixture payloads');
});

test('fixtures do NOT inflate the AI Flow Health panel', () => {
  const { exported } = load();
  exported.installAiFlowFixtures();
  // The reason they are written directly instead of through queueAiJob_():
  // six planted rows are diagnostics, not traffic, and a health panel that
  // counts them is lying about usage.
  const health = exported.getFlowHealth_();
  exported.AI_FLOW_TYPES.forEach((type) => {
    assert.equal(health.stats[type].submitted, 0,
      type + ' shows submitted traffic from a fixture install');
  });
});

test('checkAiFlowFixtures: a Status that moved off PENDING is what proves a Flow is live', () => {
  const { exported, sandbox } = load();
  exported.installAiFlowFixtures();
  const sheet = queueSheet(exported, sandbox);

  // Simulate one Flow (and only one) picking up its row.
  const data = sheet.getDataRange().getValues();
  const idx = data.findIndex((r) => String(r[exported.AIQ_COL.TYPE]) === 'LP_ASSIST');
  sheet.getRange(idx + 1, exported.AIQ_COL.STATUS + 1).setValue('COMPLETE');

  const report = exported.checkAiFlowFixtures();
  assert.deepEqual(report.complete, ['LP_ASSIST']);
  assert.ok(!report.pending.includes('LP_ASSIST'));
  assert.equal(report.pending.length, exported.AI_FLOW_TYPES.length - 1);
});

test('checkAiFlowFixtures: an ERROR status is reported separately from PENDING', () => {
  const { exported, sandbox } = load();
  exported.installAiFlowFixtures();
  const sheet = queueSheet(exported, sandbox);
  const data = sheet.getDataRange().getValues();
  const idx = data.findIndex((r) => String(r[exported.AIQ_COL.TYPE]) === 'FIN_ANALYSIS');
  sheet.getRange(idx + 1, exported.AIQ_COL.STATUS + 1).setValue('ERROR');

  const report = exported.checkAiFlowFixtures();
  assert.deepEqual(report.errored, ['FIN_ANALYSIS']);
  assert.deepEqual(report.complete, []);
});

test('removeAiFlowFixtures: leaves a real queued job completely alone', () => {
  const { exported } = load();
  const real = exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: { keep: true } });
  exported.installAiFlowFixtures();
  exported.removeAiFlowFixtures();

  assert.equal(exported.checkAiFlowFixtures().total, 0);
  // The invariant that makes cleanup safe to run at any time: fixtures live
  // in their own JobId namespace, so removing them can never eat in-flight
  // work. A prefix-free match here would.
  const still = exported.checkAiJob_({ jobId: real.jobId });
  assert.equal(still.status, 'PENDING', 'the genuine job must survive fixture cleanup');
});

test('removeAiFlowFixtures: safe to run when nothing is installed', () => {
  const { exported } = load();
  assert.equal(exported.removeAiFlowFixtures().removed, 0);
});

// ── Canary ───────────────────────────────────────────────────────────────────

test('runAiFlowCanary: every step passes on a healthy deployment', () => {
  const { exported } = load();
  const result = exported.runAiFlowCanary();
  assert.equal(result.ok, true,
    'failing steps: ' + JSON.stringify(result.steps.filter((s) => !s.pass), null, 2));
  assert.equal(result.passed, result.total);
  assert.ok(result.total >= 7, 'expected the canary to assert at least 7 things');
});

test('runAiFlowCanary: hands the result back exactly once, then the row is gone', () => {
  const { exported, sandbox } = load();
  exported.runAiFlowCanary();
  const rows = queueSheet(exported, sandbox).getDataRange().getValues();
  const leftovers = rows.slice(1).filter((r) => String(r[exported.AIQ_COL.TYPE]) === exported.AI_CANARY_JOB_TYPE);
  assert.deepEqual(leftovers, [], 'the canary must not leave a row behind');
});

test('runAiFlowCanary: its traffic stays invisible in the AI Flow Health panel', () => {
  const { exported } = load();
  exported.runAiFlowCanary();
  // The canary deliberately goes through the REAL queueAiJob_/checkAiJob_
  // path — that is what it is testing — so it does bump stats. Using a job
  // type outside AI_FLOW_TYPES is what keeps those bumps out of the panel.
  assert.equal(exported.AI_FLOW_TYPES.indexOf(exported.AI_CANARY_JOB_TYPE), -1);
  assert.ok(!exported.getFlowHealth_().stats[exported.AI_CANARY_JOB_TYPE]);
  assert.ok(exported._getFlowStats_()[exported.AI_CANARY_JOB_TYPE].submitted >= 1,
    'the stats themselves should still record it');
});

test('cleanUpAiFlowCanary: removes the CANARY key, and is safe to re-run', () => {
  const { exported } = load();
  exported.runAiFlowCanary();
  assert.equal(exported.cleanUpAiFlowCanary().removed, true);
  assert.equal(exported.cleanUpAiFlowCanary().removed, false);
  assert.ok(!exported._getFlowStats_()[exported.AI_CANARY_JOB_TYPE]);
});

test('runAiFlowCanary: passing does not depend on any Workspace Flow existing', () => {
  const { exported } = load();
  // The canary stubs the Flow on purpose. This asserts the premise rather
  // than the mechanics: nothing in the sandbox provides a Flow, and the
  // canary still passes — which is exactly why a pass here must never be
  // read as "the AI Flows work". Fixtures answer that question.
  const result = exported.runAiFlowCanary();
  assert.equal(result.ok, true);
  assert.equal(exported.checkAiFlowFixtures().total, 0,
    'no fixtures were installed, so nothing here says anything about real Flows');
});

// ── Preflight ────────────────────────────────────────────────────────────────

test('runLeaderHubPreflight: passes on a provisioned, synced deployment', () => {
  const { exported } = load();
  exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: {} }); // forces the queue into existence
  exported.syncAiPromptsToSheet();

  const result = exported.runLeaderHubPreflight();
  assert.equal(result.ok, true,
    'failing checks: ' + JSON.stringify(result.checks.filter((c) => !c.pass), null, 2));
  assert.equal(result.passed, result.total);
});

test('runLeaderHubPreflight: fails loudly when prompts were never synced', () => {
  const { exported } = load();
  exported.queueAiJob_({ type: 'BRAG_EMAIL', payload: {} });
  // No syncAiPromptsToSheet() — the Flows would have no chip to read.
  const result = exported.runLeaderHubPreflight();
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((c) => !c.pass && /prompt/i.test(c.name)));
});

test('runLeaderHubPreflight: fails when the queue header row has drifted', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const sheet = queueSheet(exported, sandbox);
  sheet.getRange(1, 1, 1, 3).setValues([['nope', 'nope', 'nope']]);

  const result = exported.runLeaderHubPreflight();
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((c) => !c.pass && c.name.indexOf(exported.AI_QUEUE_SHEET_NAME) !== -1));
});

test('runLeaderHubPreflight: makes no writes, so it is safe against a live deployment', () => {
  const { exported, sandbox } = load();
  exported.syncAiPromptsToSheet();
  const real = exported.queueAiJob_({ type: 'WBL_INSIGHTS', payload: { x: 1 } });
  const before = queueSheet(exported, sandbox).getDataRange().getValues();

  exported.runLeaderHubPreflight();

  const after = queueSheet(exported, sandbox).getDataRange().getValues();
  assert.equal(after.length, before.length, 'preflight must not add or remove rows');
  assert.equal(exported.checkAiJob_({ jobId: real.jobId }).status, 'PENDING',
    'and must not consume an in-flight job');
});

// ── Fixture payload shapes vs. the prompts that read them ────────────────────
//
// THE LOAD-BEARING TEST IN THIS FILE, alongside the provenance ones in
// ai-prompts.test.js. The first version of AI_FIXTURE_PAYLOADS invented all
// six shapes — EMAIL_COMPOSE as {to, intent, tone}, FIN_ANALYSIS as
// {account, transactions} — and not one of those keys exists. Nothing would
// have errored: each Flow would have triggered, read a payload with no field
// it recognized, and produced confident nonsense. A fixture whose job is to
// prove a Flow works cannot be the thing that makes it look like it does.
//
// So this re-reads the fenced json example out of each *_FLOW_PROMPT.md — the
// same file the Flow's own prompt text comes from, and the shape the client
// actually sends — and demands key-for-key parity, recursively. A prompt that
// grows a payload field now fails here instead of quietly leaving the
// fixtures a version behind.

function documentedPayload(jobType) {
  const raw = fs.readFileSync(path.join(LH, jobType + '_FLOW_PROMPT.md'), 'utf8');
  const blocks = raw.match(/```json\s*\n[\s\S]*?\n```/g) || [];
  for (const block of blocks) {
    const body = block.replace(/^```json\s*\n/, '').replace(/\n```$/, '');
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (e) { /* a fenced block describing OUTPUT, not the payload */ }
  }
  return null;
}

// Compares structure only — key names, and object/array/scalar kind — never
// values, since the fixture's whole point is to carry synthetic ones.
function assertSameShape(actual, expected, trail) {
  const where = trail || 'payload';
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), where + ' should be an array');
    if (expected.length && actual.length) {
      assertSameShape(actual[0], expected[0], where + '[0]');
    }
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual),
      where + ' should be an object');
    Object.keys(expected).forEach((key) => {
      assert.ok(Object.prototype.hasOwnProperty.call(actual, key),
        where + '.' + key + ' is in the prompt example but missing from the fixture');
      assertSameShape(actual[key], expected[key], where + '.' + key);
    });
    Object.keys(actual).forEach((key) => {
      assert.ok(Object.prototype.hasOwnProperty.call(expected, key),
        where + '.' + key + ' is in the fixture but not in the prompt example — ' +
        'either the prompt grew and this is stale, or the key was invented');
    });
    return;
  }
  assert.equal(typeof actual, typeof expected,
    where + ' should be a ' + typeof expected + ', not a ' + typeof actual);
}

test('every prompt documents a payload example to check fixtures against', () => {
  JOB_TYPES.forEach((jobType) => {
    assert.ok(documentedPayload(jobType),
      jobType + '_FLOW_PROMPT.md has no parseable json payload example — without one ' +
      'nothing can verify this fixture, so add the example rather than deleting this test');
  });
});

test('each fixture payload matches its prompt example key for key', () => {
  const { exported } = load();
  JOB_TYPES.forEach((jobType) => {
    assertSameShape(exported.AI_FIXTURE_PAYLOADS[jobType], documentedPayload(jobType),
      jobType);
  });
});

test('fixture values are synthetic even where the prompt example is not', () => {
  const { exported } = load();
  // The prompt examples carry a real staff name and a real @ccpsnet.net
  // student id, because they are illustrating a live payload. The fixtures
  // copy the shape and must not copy those.
  const blob = JSON.stringify(exported.AI_FIXTURE_PAYLOADS);
  assert.ok(!/ccpsnet\.net/.test(blob), 'no real domain');
  assert.ok(!/Berneche/i.test(blob), 'no real name');
  (blob.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) || []).forEach((e) => {
    assert.ok(e.endsWith('.invalid'), e + ' is not an .invalid address');
  });
});

test('attentionDetails keeps its "<id>: <detail>" sentence shape', () => {
  const { exported } = load();
  // WBL_INSIGHTS_FLOW_PROMPT.md's rules read ACROSS these strings looking for
  // patterns, so an entry that is only an address gives the Flow nothing to
  // find and the fixture would prove nothing.
  const details = exported.AI_FIXTURE_PAYLOADS.WBL_INSIGHTS.attentionDetails;
  assert.ok(details.length >= 1);
  assert.match(details[0], /^\S+@\S+: .+/);
});
