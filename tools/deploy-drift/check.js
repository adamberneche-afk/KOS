#!/usr/bin/env node
// =============================================================================
// deploy-drift/check — reacts to one GAS project's self-reported version
// marker (delivered as a `repository_dispatch` payload,
// `.github/workflows/deploy-drift.yml`) by comparing it against what git
// currently expects (`tools/deploy-drift/expected-marker.js`), then opening,
// updating, or closing a single pinned per-project tracking issue.
//
// Why a GAS project reports itself instead of this repo polling it: see
// meta/PROCESS_HARDENING_SPRINT.md's Phase 3 "Decision reached" section.
// The short version — `access: MYSELF`/`DOMAIN` web apps sit behind
// Google's own sign-in wall, so an external poll never even reaches their
// code, and 6 of the 9 GAS projects have no web app at all to poll. GAS
// already runs as a trusted context for itself, so it can call OUT with no
// credential beyond a narrowly-scoped GitHub token it holds — flipping the
// direction avoids the wall entirely instead of trying to get a login
// past it.
//
// The payload driving this is UNTRUSTED input the moment the reporting
// token could ever leak (see the threat-model discussion in the sprint
// doc) — `project` is validated against the real project list and `sha`
// against a strict hex-40 pattern before either is used for anything,
// including being written into an issue body.
//
// Same "pinned issue, update in place, reopen if a human closed it"
// pattern tools/watchdog/check.js already uses (which itself notes that
// shape already exists a third time in the hub's own
// health-report.js/watchdog.js) — a fourth small instance of a
// well-understood pattern, not a new one; not extracted into a shared
// helper here to avoid touching an already-shipped, separately-tested tool
// for a ~20-line saving.
// =============================================================================

const { expectedMarkerForProject, knownProjectNames } = require('./expected-marker.js');

const GITHUB_API = 'https://api.github.com';
const SHA_RE = /^[0-9a-f]{40}$/;

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function issueLabel() {
  return 'kos-deploy-drift';
}
function issueTitle(project) {
  return `Deploy drift: ${project}`;
}

// Pure — no network, no git. Given a self-report and a way to look up what
// git expects, decides what happened. Split out from main() so this is
// testable with a fake `expectedMarkerFn` instead of the real git-backed one.
function evaluateReport({ project, reportedSha, reportedAt }, expectedMarkerFn = expectedMarkerForProject) {
  if (!project || !knownProjectNames().includes(project)) {
    return { status: 'invalid', reason: `"${project}" is not a known project (see tools/gas-lint/project-map.json)` };
  }
  if (!reportedSha || !SHA_RE.test(reportedSha)) {
    return { status: 'invalid', reason: `reported sha "${reportedSha}" is not a 40-char hex commit SHA` };
  }

  const expected = expectedMarkerFn(project);
  if (!expected.sha) {
    return { status: 'invalid', reason: `git has no commit history for project "${project}"'s files` };
  }

  return expected.sha === reportedSha
    ? { status: 'match', project, expected, reportedSha, reportedAt }
    : { status: 'drift', project, expected, reportedSha, reportedAt };
}

function buildDriftIssueBody({ project, expected, reportedSha, reportedAt }) {
  return [
    `**${project}** self-reported a version that doesn't match what git expects.`,
    '',
    `- Git expects: \`${expected.sha}\` (${expected.subject}, ${expected.committedAt})`,
    `- Live project reported: \`${reportedSha}\` as of ${reportedAt}`,
    '',
    'This usually means either a `clasp push` didn\'t fully land, or the code was ' +
      'pushed but never promoted to the live deployment (`clasp deploy -i <id> -V <n>` ' +
      '— see tools/clasp-sync/DEPLOYMENT_RUNBOOK.md §3.5-3.6). Push and/or promote the ' +
      'deployment, then this closes itself on the project\'s next scheduled report.',
    '',
    `_Last checked: ${new Date().toISOString()}_`,
  ].join('\n');
}

async function findExistingIssue(owner, repo, token, project, fetchImpl) {
  const res = await fetchImpl(
    `${GITHUB_API}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(issueLabel())}&state=all&per_page=10`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) throw new Error(`could not list issues: HTTP ${res.status}`);
  const issues = await res.json();
  return issues.find((issue) => issue.title === issueTitle(project)) || null;
}

// Opens/updates the pinned issue on drift; closes it (with a resolution
// comment) if it's currently open and this report is clean. Never creates
// an issue for a clean report — a project that has never drifted should
// never have a tracking issue at all.
async function publishDriftStatus(owner, repo, token, result, { fetchImpl = fetch } = {}) {
  const existing = await findExistingIssue(owner, repo, token, result.project, fetchImpl);

  if (result.status === 'drift') {
    const body = buildDriftIssueBody(result);
    if (existing) {
      const wasClosed = existing.state === 'closed';
      const patch = { body };
      if (wasClosed) patch.state = 'open';
      const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues/${existing.number}`, {
        method: 'PATCH',
        headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`could not update issue #${existing.number}: HTTP ${res.status}`);
      return { action: wasClosed ? 'reopened' : 'updated', issueUrl: existing.html_url };
    }
    const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: issueTitle(result.project), body, labels: [issueLabel()] }),
    });
    if (!res.ok) throw new Error(`could not create issue: HTTP ${res.status}`);
    const created = await res.json();
    return { action: 'created', issueUrl: created.html_url };
  }

  // Clean report — only act if there's an OPEN issue to close.
  if (existing && existing.state === 'open') {
    const body = `Resolved: \`${result.expected.sha}\` reported as live as of ${result.reportedAt}.`;
    await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues/${existing.number}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'closed' }),
    });
    if (!res.ok) throw new Error(`could not close issue #${existing.number}: HTTP ${res.status}`);
    return { action: 'closed', issueUrl: existing.html_url };
  }
  return { action: 'none', issueUrl: existing ? existing.html_url : null };
}

async function main() {
  const report = {
    project: process.env.DEPLOY_DRIFT_PROJECT || '',
    reportedSha: process.env.DEPLOY_DRIFT_SHA || '',
    reportedAt: process.env.DEPLOY_DRIFT_REPORTED_AT || new Date().toISOString(),
  };

  const result = evaluateReport(report);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === 'invalid') {
    console.error(`Rejected report: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    console.log('GITHUB_REPOSITORY/GITHUB_TOKEN not set — skipping issue publish (local run).');
    process.exitCode = result.status === 'drift' ? 1 : 0;
    return;
  }

  const publishResult = await publishDriftStatus(owner, repo, token, result);
  console.log(`Issue ${publishResult.action}${publishResult.issueUrl ? ': ' + publishResult.issueUrl : ''}`);
  process.exitCode = result.status === 'drift' ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('deploy-drift check failed:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateReport,
  buildDriftIssueBody,
  publishDriftStatus,
  issueTitle,
  issueLabel,
  SHA_RE,
};
