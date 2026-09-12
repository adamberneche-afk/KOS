'use strict';
// Regression tests for tools/deploy-drift/check.js — evaluating a GAS
// project's self-reported version marker against what git expects, and the
// pinned-issue publish/close logic that reacts to the result.
//
// evaluateReport() takes an injectable expectedMarkerFn so these don't need
// a real git repo or real project-map.json entries; publishDriftStatus()
// takes an injectable fetchImpl (same convention tools/watchdog/check.js
// already uses) so these don't make real GitHub API calls.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateReport,
  buildDriftIssueBody,
  publishDriftStatus,
  issueTitle,
  SHA_RE,
} = require('../../tools/deploy-drift/check.js');

const REAL_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const fakeExpected = (sha) => () => ({ project: 'kos-personal', sha, committedAt: '2026-01-01T00:00:00Z', subject: 'a commit' });

// ── evaluateReport ───────────────────────────────────────────────────────

test('evaluateReport: match when reported sha equals what git expects', () => {
  const result = evaluateReport(
    { project: 'kos-personal', reportedSha: REAL_SHA, reportedAt: 'now' },
    fakeExpected(REAL_SHA)
  );
  assert.equal(result.status, 'match');
});

test('evaluateReport: drift when reported sha differs from what git expects', () => {
  const result = evaluateReport(
    { project: 'kos-personal', reportedSha: OTHER_SHA, reportedAt: 'now' },
    fakeExpected(REAL_SHA)
  );
  assert.equal(result.status, 'drift');
  assert.equal(result.expected.sha, REAL_SHA);
  assert.equal(result.reportedSha, OTHER_SHA);
});

test('evaluateReport: invalid — unknown project name is rejected, not silently trusted', () => {
  const result = evaluateReport(
    { project: 'not-a-real-project; rm -rf /', reportedSha: REAL_SHA, reportedAt: 'now' },
    fakeExpected(REAL_SHA)
  );
  assert.equal(result.status, 'invalid');
  assert.match(result.reason, /not a known project/);
});

test('evaluateReport: invalid — malformed sha is rejected before it reaches anything', () => {
  const result = evaluateReport(
    { project: 'kos-personal', reportedSha: 'not-a-sha', reportedAt: 'now' },
    fakeExpected(REAL_SHA)
  );
  assert.equal(result.status, 'invalid');
  assert.match(result.reason, /40-char hex/);
});

test('evaluateReport: invalid — a short (abbreviated) sha is rejected, full 40 chars required', () => {
  const result = evaluateReport(
    { project: 'kos-personal', reportedSha: REAL_SHA.slice(0, 7), reportedAt: 'now' },
    fakeExpected(REAL_SHA)
  );
  assert.equal(result.status, 'invalid');
});

test('evaluateReport: invalid — empty project or missing sha, not a crash', () => {
  assert.equal(evaluateReport({ project: '', reportedSha: REAL_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA)).status, 'invalid');
  assert.equal(evaluateReport({ project: 'kos-personal', reportedSha: '', reportedAt: 'now' }, fakeExpected(REAL_SHA)).status, 'invalid');
});

test('SHA_RE: sanity — matches exactly 40 lowercase hex chars, nothing else', () => {
  assert.ok(SHA_RE.test(REAL_SHA));
  assert.ok(!SHA_RE.test(REAL_SHA.toUpperCase()));
  assert.ok(!SHA_RE.test(REAL_SHA + 'a'));
});

// ── buildDriftIssueBody ──────────────────────────────────────────────────

test('buildDriftIssueBody: names both the expected and reported sha', () => {
  const body = buildDriftIssueBody({
    project: 'kos-personal',
    expected: { sha: REAL_SHA, committedAt: '2026-01-01T00:00:00Z', subject: 'a commit' },
    reportedSha: OTHER_SHA,
    reportedAt: '2026-01-02T00:00:00Z',
  });
  assert.match(body, new RegExp(REAL_SHA));
  assert.match(body, new RegExp(OTHER_SHA));
  assert.match(body, /clasp deploy/);
});

// ── publishDriftStatus (fake fetch — no real GitHub calls) ──────────────

function fakeIssuesApi({ existingIssue = null } = {}) {
  const calls = [];
  let issue = existingIssue;
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
    if (opts.method === undefined || opts.method === 'GET') {
      return { ok: true, json: async () => (issue ? [issue] : []) };
    }
    if (opts.method === 'POST' && url.endsWith('/issues')) {
      issue = { number: 1, state: 'open', html_url: 'https://github.com/x/y/issues/1', title: JSON.parse(opts.body).title };
      return { ok: true, json: async () => issue };
    }
    if (opts.method === 'POST' && url.endsWith('/comments')) {
      return { ok: true, json: async () => ({}) };
    }
    if (opts.method === 'PATCH') {
      const patch = JSON.parse(opts.body);
      issue = { ...issue, ...patch };
      return { ok: true, json: async () => issue };
    }
    throw new Error(`unexpected call: ${opts.method} ${url}`);
  };
  return { fetchImpl, calls, getIssue: () => issue };
}

test('publishDriftStatus: drift + no existing issue → creates one', async () => {
  const api = fakeIssuesApi();
  const result = evaluateReport({ project: 'kos-personal', reportedSha: OTHER_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'created');
  assert.equal(api.getIssue().title, issueTitle('kos-personal'));
});

test('publishDriftStatus: drift + existing OPEN issue → updates it, does not create a second one', async () => {
  const api = fakeIssuesApi({ existingIssue: { number: 1, state: 'open', html_url: 'u', title: issueTitle('kos-personal') } });
  const result = evaluateReport({ project: 'kos-personal', reportedSha: OTHER_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'updated');
  assert.ok(!api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/issues')));
});

test('publishDriftStatus: drift + existing CLOSED issue → reopens it', async () => {
  const api = fakeIssuesApi({ existingIssue: { number: 1, state: 'closed', html_url: 'u', title: issueTitle('kos-personal') } });
  const result = evaluateReport({ project: 'kos-personal', reportedSha: OTHER_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'reopened');
  assert.equal(api.getIssue().state, 'open');
});

test('publishDriftStatus: clean report + no existing issue → no-op, never creates a "clean" issue', async () => {
  const api = fakeIssuesApi();
  const result = evaluateReport({ project: 'kos-personal', reportedSha: REAL_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'none');
  assert.ok(!api.calls.some((c) => c.method === 'POST'));
});

test('publishDriftStatus: clean report + existing OPEN issue → closes it with a resolution comment', async () => {
  const api = fakeIssuesApi({ existingIssue: { number: 1, state: 'open', html_url: 'u', title: issueTitle('kos-personal') } });
  const result = evaluateReport({ project: 'kos-personal', reportedSha: REAL_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'closed');
  assert.equal(api.getIssue().state, 'closed');
  assert.ok(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/comments')));
});

test('publishDriftStatus: clean report + existing already-CLOSED issue → stays closed, no duplicate comment', async () => {
  const api = fakeIssuesApi({ existingIssue: { number: 1, state: 'closed', html_url: 'u', title: issueTitle('kos-personal') } });
  const result = evaluateReport({ project: 'kos-personal', reportedSha: REAL_SHA, reportedAt: 'now' }, fakeExpected(REAL_SHA));
  const pub = await publishDriftStatus('o', 'r', 'tok', result, { fetchImpl: api.fetchImpl });
  assert.equal(pub.action, 'none');
});
