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
  buildWatchdogReport,
  publishWatchdogReport
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
