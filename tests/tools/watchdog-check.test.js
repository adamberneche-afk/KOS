'use strict';
// Regression tests for tools/watchdog/check.js — no real actionlint binary
// or network access needed; execFn/fetchImpl are both injectable, same
// convention as this account's other dependency-injected test harnesses.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listWorkflowFiles,
  hasScheduleTrigger,
  runActionlint,
  checkScheduledWorkflowRuns,
  checkStalePullRequests,
  buildWatchdogReport,
  publishWatchdogReport,
  STALE_PR_MAX_AGE_DAYS
} = require('../../tools/watchdog/check.js');

const SIMPLE_WORKFLOW = 'name: Simple\non:\n  push:\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps: []\n';
const SCHEDULED_WORKFLOW = "name: Scheduled\non:\n  schedule:\n    - cron: '15 20 * * 1'\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps: []\n";

function makeWorkflowsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kos-watchdog-test-'));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function fakeFetchJson(status, body) {
  return async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
}

test('listWorkflowFiles finds .yml/.yaml files, sorted, ignores everything else', () => {
  const dir = makeWorkflowsDir({ 'z.yml': SIMPLE_WORKFLOW, 'a.yaml': SIMPLE_WORKFLOW, 'notes.txt': 'x' });
  assert.deepEqual(listWorkflowFiles(dir), ['a.yaml', 'z.yml']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('listWorkflowFiles returns [] rather than throwing when the dir does not exist', () => {
  assert.deepEqual(listWorkflowFiles('/no/such/dir'), []);
});

test('hasScheduleTrigger detects a real schedule: block, not a false positive elsewhere', () => {
  assert.equal(hasScheduleTrigger(SCHEDULED_WORKFLOW), true);
  assert.equal(hasScheduleTrigger(SIMPLE_WORKFLOW), false);
  assert.equal(hasScheduleTrigger('# a schedule change\non:\n  push:\n'), false);
});

test('runActionlint: every file reports clean when actionlint exits 0', () => {
  const dir = makeWorkflowsDir({ 'a.yml': SIMPLE_WORKFLOW, 'b.yml': SIMPLE_WORKFLOW });
  const results = runActionlint(dir, { execFn: () => '' });
  assert.equal(results['a.yml'].length, 0);
  assert.equal(results['b.yml'].length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runActionlint: findings are attributed to the specific file actionlint named, not every file', () => {
  const dir = makeWorkflowsDir({ 'good.yml': SIMPLE_WORKFLOW, 'bad.yml': SIMPLE_WORKFLOW });
  const fakeExec = () => {
    const err = new Error('exit 1');
    err.stdout = '.github/workflows/bad.yml:3:5: unexpected key "foo"\n';
    err.stderr = '';
    throw err;
  };
  const results = runActionlint(dir, { execFn: fakeExec });
  assert.equal(results['bad.yml'].length, 1);
  assert.ok(results['bad.yml'][0].includes('unexpected key'));
  assert.equal(results['good.yml'].length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runActionlint: a missing/unspawnable binary is a finding on every file, never silently reported clean', () => {
  const dir = makeWorkflowsDir({ 'a.yml': SIMPLE_WORKFLOW, 'b.yml': SIMPLE_WORKFLOW });
  const fakeExec = () => {
    const err = new Error('spawnSync actionlint ENOENT');
    err.code = 'ENOENT';
    throw err;
  };
  const results = runActionlint(dir, { execFn: fakeExec });
  assert.equal(results['a.yml'].length, 1);
  assert.equal(results['b.yml'].length, 1);
  assert.ok(results['a.yml'][0].includes('could not run actionlint'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkScheduledWorkflowRuns only queries workflows that actually declare a schedule trigger', async () => {
  const dir = makeWorkflowsDir({ 'push-only.yml': SIMPLE_WORKFLOW, 'scheduled.yml': SCHEDULED_WORKFLOW });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ workflow_runs: [{ conclusion: 'success', html_url: 'https://x/1' }] }) };
  };
  const findings = await checkScheduledWorkflowRuns('o', 'r', 'tok', { dir, fetchImpl });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('scheduled.yml'));
  assert.equal(findings.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkScheduledWorkflowRuns flags a scheduled workflow whose last run concluded failure', async () => {
  const dir = makeWorkflowsDir({ 'scheduled.yml': SCHEDULED_WORKFLOW });
  const fetchImpl = fakeFetchJson(200, { workflow_runs: [{ conclusion: 'failure', html_url: 'https://x/2' }] });
  const findings = await checkScheduledWorkflowRuns('o', 'r', 'tok', { dir, fetchImpl });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'scheduled.yml');
  assert.ok(findings[0].issue.includes('https://x/2'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkScheduledWorkflowRuns flags a schedule trigger with zero recorded runs, not treating "no data" as success', async () => {
  const dir = makeWorkflowsDir({ 'scheduled.yml': SCHEDULED_WORKFLOW });
  const fetchImpl = fakeFetchJson(200, { workflow_runs: [] });
  const findings = await checkScheduledWorkflowRuns('o', 'r', 'tok', { dir, fetchImpl });
  assert.equal(findings.length, 1);
  assert.ok(findings[0].issue.includes('never had a scheduled run'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkScheduledWorkflowRuns judges only the most recent run\'s conclusion, never how long ago it ran', async () => {
  const dir = makeWorkflowsDir({ 'weekly.yml': SCHEDULED_WORKFLOW });
  const fetchImpl = fakeFetchJson(200, { workflow_runs: [{ conclusion: 'success', html_url: 'https://x/3' }] });
  const findings = await checkScheduledWorkflowRuns('o', 'r', 'tok', { dir, fetchImpl });
  assert.equal(findings.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('checkScheduledWorkflowRuns reports a non-2xx API response as a finding rather than throwing', async () => {
  const dir = makeWorkflowsDir({ 'scheduled.yml': SCHEDULED_WORKFLOW });
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const findings = await checkScheduledWorkflowRuns('o', 'r', 'bad-token', { dir, fetchImpl });
  assert.equal(findings.length, 1);
  assert.ok(findings[0].issue.includes('401'));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── checkStalePullRequests ──────────────────────────────────────────────
// Check 3 exists because six dependabot PRs sat open for three weeks while
// every signal this repo had said everything was fine: each was mergeable,
// CI had gone green on all six, and a green PR nobody merges is
// indistinguishable from a merged one on every dashboard here.

const NOW = Date.parse('2026-09-21T00:00:00.000Z');
const daysBefore = (n) => new Date(NOW - n * 86400000).toISOString();

function prPage(prs) {
  return async () => ({ ok: true, status: 200, json: async () => prs });
}

test('checkStalePullRequests flags a PR past the age threshold', async () => {
  const fetchImpl = prPage([
    { number: 14, title: 'bump express', created_at: daysBefore(22), user: { login: 'dependabot[bot]' }, html_url: 'https://x/14' }
  ]);
  const found = await checkStalePullRequests('o', 'r', 't', { now: NOW, fetchImpl });
  assert.equal(found.length, 1);
  assert.equal(found[0].number, 14);
  assert.equal(found[0].ageDays, 22);
  assert.equal(found[0].author, 'dependabot[bot]');
  assert.equal(found[0].draft, false);
});

test('checkStalePullRequests leaves a fresh PR alone', async () => {
  const fetchImpl = prPage([
    { number: 28, title: 'today', created_at: daysBefore(1), user: { login: 'someone' }, html_url: 'https://x/28' }
  ]);
  assert.deepEqual(await checkStalePullRequests('o', 'r', 't', { now: NOW, fetchImpl }), []);
});

test('checkStalePullRequests measures age from creation, not last update', async () => {
  // Dependabot rebases bump updated_at without anyone having looked at the
  // PR. Keying off that would have hidden the exact six that motivated
  // this check — one of them was "updated" the day before it was found.
  const fetchImpl = prPage([
    {
      number: 6, title: 'rebased yesterday, opened a month ago',
      created_at: daysBefore(29), updated_at: daysBefore(1),
      user: { login: 'dependabot[bot]' }, html_url: 'https://x/6'
    }
  ]);
  const found = await checkStalePullRequests('o', 'r', 't', { now: NOW, fetchImpl });
  assert.equal(found.length, 1, 'a recent rebase must not reset the clock');
  assert.equal(found[0].ageDays, 29);
});

test('checkStalePullRequests reports drafts, marked rather than hidden', async () => {
  const fetchImpl = prPage([
    { number: 3, title: 'wip', created_at: daysBefore(60), draft: true, user: { login: 'a' }, html_url: 'https://x/3' }
  ]);
  const found = await checkStalePullRequests('o', 'r', 't', { now: NOW, fetchImpl });
  assert.equal(found.length, 1, 'a forgotten draft is exactly what rots invisibly');
  assert.equal(found[0].draft, true);
});

test('checkStalePullRequests honours an explicit maxAgeDays', async () => {
  const fetchImpl = prPage([
    { number: 1, title: 'x', created_at: daysBefore(20), user: { login: 'a' }, html_url: 'https://x/1' }
  ]);
  assert.equal((await checkStalePullRequests('o', 'r', 't', { now: NOW, maxAgeDays: 30, fetchImpl })).length, 0);
  assert.equal((await checkStalePullRequests('o', 'r', 't', { now: NOW, maxAgeDays: 7, fetchImpl })).length, 1);
});

test('checkStalePullRequests reports a non-2xx response as a finding rather than throwing', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const found = await checkStalePullRequests('o', 'r', 't', { now: NOW, fetchImpl });
  assert.equal(found.length, 1);
  assert.match(found[0].issue, /HTTP 403/);
});

test('checkStalePullRequests survives a thrown fetch and malformed rows', async () => {
  const threw = await checkStalePullRequests('o', 'r', 't', {
    now: NOW, fetchImpl: async () => { throw new Error('socket hang up'); }
  });
  assert.match(threw[0].issue, /socket hang up/);

  const junk = await checkStalePullRequests('o', 'r', 't', {
    now: NOW,
    fetchImpl: prPage([null, { number: 2 }, { number: 3, created_at: 'not-a-date' }])
  });
  assert.deepEqual(junk, [], 'rows with no usable created_at are skipped, not crashed on');
});

test('STALE_PR_MAX_AGE_DAYS is shorter than the three weeks that went unnoticed', () => {
  assert.ok(STALE_PR_MAX_AGE_DAYS < 21, `got ${STALE_PR_MAX_AGE_DAYS}`);
});

test('buildWatchdogReport reports both sections clean when there is nothing to flag', () => {
  const body = buildWatchdogReport({ yamlFindings: { 'a.yml': [] }, runFindings: [], checkedAt: '2026-01-01T00:00:00.000Z' });
  assert.ok(body.includes('Every `.github/workflows/*.yml` file is valid'));
  assert.ok(body.includes("Every scheduled workflow's most recent run concluded successfully"));
});

test('buildWatchdogReport lists a specific bad file and a specific bad run when both are present', () => {
  const body = buildWatchdogReport({
    yamlFindings: { 'bad.yml': ['bad.yml:1: some error'], 'good.yml': [] },
    runFindings: [{ file: 'sched.yml', issue: "last scheduled run concluded 'failure'" }],
    checkedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.ok(body.includes('bad.yml') && body.includes('some error'));
  assert.ok(!body.includes('good.yml'));
  assert.ok(body.includes('sched.yml') && body.includes('failure'));
});

test('buildWatchdogReport says so explicitly when no PR is stale', () => {
  const body = buildWatchdogReport({ yamlFindings: {}, runFindings: [], prFindings: [], checkedAt: 'now' });
  assert.match(body, /No open pull request has been waiting more than \d+ days/);
});

test('buildWatchdogReport lists each stale PR with its number, age and author', () => {
  const body = buildWatchdogReport({
    yamlFindings: {},
    runFindings: [],
    prFindings: [
      { number: 14, title: 'bump express', ageDays: 22, author: 'dependabot[bot]', draft: false, url: 'https://x/14' },
      { number: 3, title: 'wip thing', ageDays: 60, author: 'adam', draft: true, url: 'https://x/3' }
    ],
    checkedAt: 'now'
  });
  assert.ok(body.includes('#14') && body.includes('bump express') && body.includes('22 days old'));
  assert.ok(body.includes('dependabot[bot]'));
  assert.ok(body.includes('_(draft)_'), 'a draft is marked, so a reader can dismiss it at a glance');
  assert.ok(body.includes('60 days old'));
});

test('buildWatchdogReport surfaces a PR-listing API error in the PR section', () => {
  const body = buildWatchdogReport({
    yamlFindings: {}, runFindings: [],
    prFindings: [{ issue: 'could not list pull requests: HTTP 403' }],
    checkedAt: 'now'
  });
  assert.ok(body.includes('could not list pull requests: HTTP 403'));
});

test('buildWatchdogReport keeps the PR section independent of the other two', () => {
  // The three checks answer different questions; a stale PR must not read
  // as a broken workflow, and vice versa.
  const body = buildWatchdogReport({
    yamlFindings: { 'a.yml': [] },
    runFindings: [],
    prFindings: [{ number: 9, title: 't', ageDays: 30, author: 'a', draft: false, url: 'u' }],
    checkedAt: 'now'
  });
  assert.ok(body.includes('Every `.github/workflows/*.yml` file is valid'));
  assert.ok(body.includes("Every scheduled workflow's most recent run concluded successfully"));
  assert.ok(body.includes('#9'));
});

test('publishWatchdogReport creates the pinned issue on the very first run', async () => {
  const calls = { list: [], create: [], update: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (!opts.method) { calls.list.push(url); return { ok: true, json: async () => [] }; }
    if (opts.method === 'POST') {
      calls.create.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ number: 1, html_url: 'https://github.com/fake/fake/issues/1' }) };
    }
    calls.update.push(opts.body);
    return { ok: true, json: async () => ({}) };
  };
  const result = await publishWatchdogReport('o', 'r', 'tok', 'body v1', { fetchImpl });
  assert.equal(result.action, 'created');
  assert.ok(calls.create[0].labels.includes('kos-watchdog'));
});

test('publishWatchdogReport updates the same pinned issue in place, never creating a second one', async () => {
  const existing = { number: 7, html_url: 'https://github.com/fake/fake/issues/7', state: 'open', title: 'KOS Scheduled-Job Watchdog' };
  const calls = { create: [], update: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (!opts.method) return { ok: true, json: async () => [existing] };
    if (opts.method === 'POST') { calls.create.push(opts); return { ok: true, json: async () => ({}) }; }
    calls.update.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, json: async () => ({}) };
  };
  const result = await publishWatchdogReport('o', 'r', 'tok', 'body v2', { fetchImpl });
  assert.equal(result.action, 'updated');
  assert.equal(calls.create.length, 0);
  assert.ok(calls.update[0].url.endsWith('/issues/7'));
});

test('publishWatchdogReport reopens the pinned issue if a human closed it', async () => {
  const existing = { number: 9, html_url: 'https://github.com/fake/fake/issues/9', state: 'closed', title: 'KOS Scheduled-Job Watchdog' };
  const calls = { update: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (!opts.method) return { ok: true, json: async () => [existing] };
    calls.update.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({}) };
  };
  const result = await publishWatchdogReport('o', 'r', 'tok', 'body v3', { fetchImpl });
  assert.equal(result.action, 'reopened');
  assert.equal(calls.update[0].state, 'open');
});
