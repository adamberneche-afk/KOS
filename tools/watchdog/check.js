#!/usr/bin/env node
// =============================================================================
// watchdog — scheduled-job watchdog for this repo.
//
// codeql.yml runs on a weekly schedule (Monday 20:15 UTC) with nothing
// checking whether that run actually succeeded, or whether the workflow
// file itself is even valid — the second, more dangerous failure mode: an
// unparseable workflow file produces no run at all, not even a failing
// one, so there's no red X to eventually notice. A companion audit found
// exactly this in another repo in this account (four workflow files
// silently invalid for five months, from one bad batch edit).
//
// Three checks, one pinned issue (updated in place on every run, never a
// fresh issue each time):
//   1. actionlint against every .github/workflows/*.yml file — catches
//      both plain YAML errors and GitHub-Actions-expression-context
//      errors a generic YAML parser would miss (this repo's gas-lint.yml
//      already uses actionlint for the same reason).
//   2. For every workflow file with an `on.schedule` trigger, the most
//      recent scheduled run's conclusion via the Actions REST API —
//      flagged only if that run's conclusion isn't 'success', never based
//      on how long ago it ran.
//   3. Open pull requests older than STALE_PR_MAX_AGE_DAYS. Added after
//      six dependabot PRs sat open for three weeks — all mergeable, all
//      green, and therefore invisible: nothing in this repo distinguishes
//      a green PR nobody merged from one that landed. Unlike 1 and 2 this
//      never fails the run; see the note in main().
//
// No dependencies beyond Node's own built-ins + global fetch (Node 20+),
// matching every other tool in tools/ — GitHub API calls go through plain
// fetch rather than a client library.
//
// Usage:
//   node tools/watchdog/check.js            human-readable report
//   node tools/watchdog/check.js --json     machine-readable report
// Exit code is 1 if any finding exists, 0 otherwise. In CI, also publishes
// a pinned "KOS Scheduled-Job Watchdog" issue (needs GITHUB_TOKEN,
// GITHUB_REPOSITORY — both auto-provided by GitHub Actions).
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORKFLOWS_DIR = path.join(__dirname, '..', '..', '.github', 'workflows');
const WATCHDOG_ISSUE_LABEL = 'kos-watchdog';
const WATCHDOG_ISSUE_TITLE = 'KOS Scheduled-Job Watchdog';
const GITHUB_API = 'https://api.github.com';
// Chosen against the incident that added check 3: six dependabot PRs sat
// open for three weeks. Two weeks is comfortably longer than anything this
// repo normally takes to merge (same-day is typical) and short enough to
// catch that class before it compounds into a conflicting pile.
const STALE_PR_MAX_AGE_DAYS = 14;

function listWorkflowFiles(dir = WORKFLOWS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort();
}

// True if the file's own `on:` block declares a `schedule:` trigger — a
// plain string check, not a YAML parse, deliberately: this needs to keep
// working even for a workflow file actionlint has already flagged as
// invalid, so an already-broken file isn't silently skipped by the
// run-conclusion check too (it just won't have a run history to report on).
function hasScheduleTrigger(fileContent) {
  return /^\s*schedule:\s*$/m.test(fileContent);
}

// Runs actionlint against every workflow file in one pass. Returns a map of
// filename -> array of finding strings (empty array = clean). `execFn` is
// injectable so tests don't need the real actionlint binary on the test
// runner's PATH — the CI workflow that actually runs this installs it,
// same as gas-lint.yml already does.
function runActionlint(dir = WORKFLOWS_DIR, { actionlintBin = 'actionlint', execFn = execFileSync } = {}) {
  const results = {};
  for (const f of listWorkflowFiles(dir)) results[f] = [];
  try {
    execFn(actionlintBin, [], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return results; // exit 0 — every file clean
  } catch (e) {
    // A failure to even spawn actionlint (binary missing from PATH, no
    // exec permission, etc) has no stdout/stderr in actionlint's own
    // "file:line: message" shape - treating that silence as "every file
    // is clean" would be a false negative exactly as dangerous as the
    // invalid-workflow-file gap this tool exists to catch. Surface it as
    // a finding on every file instead of swallowing it. Found while
    // porting this same file to TSO - not caught here originally.
    if (e.code === 'ENOENT' || (!e.stdout && !e.stderr)) {
      const reason = `could not run actionlint (${e.code || e.message}) - is it installed and on PATH?`;
      for (const f of Object.keys(results)) results[f].push(reason);
      return results;
    }
    const output = `${e.stdout || ''}${e.stderr || ''}`;
    for (const line of output.split('\n')) {
      const m = line.match(/^\.github\/workflows\/([^:]+):/);
      if (m && results[m[1]] !== undefined) results[m[1]].push(line.trim());
    }
    return results;
  }
}

function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

// `fetchImpl` is injectable (same convention as octokitFactory/fetchImpl
// elsewhere in this account) so tests never make a real network call.
async function checkScheduledWorkflowRuns(owner, repo, token, { dir = WORKFLOWS_DIR, fetchImpl = fetch } = {}) {
  const findings = [];
  for (const f of listWorkflowFiles(dir)) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!hasScheduleTrigger(content)) continue;
    try {
      const res = await fetchImpl(
        `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${f}/runs?event=schedule&per_page=1`,
        { headers: githubHeaders(token) }
      );
      if (!res.ok) {
        findings.push({ file: f, issue: `could not check run history: HTTP ${res.status}` });
        continue;
      }
      const data = await res.json();
      const run = (data.workflow_runs || [])[0];
      if (!run) {
        findings.push({ file: f, issue: 'has a schedule trigger but has never had a scheduled run recorded' });
      } else if (run.conclusion && run.conclusion !== 'success') {
        findings.push({ file: f, issue: `last scheduled run concluded '${run.conclusion}' (${run.html_url})` });
      }
    } catch (e) {
      findings.push({ file: f, issue: `could not check run history: ${e.message}` });
    }
  }
  return findings;
}

/**
 * Open pull requests that have gone quiet — older than `maxAgeDays` with
 * nothing having closed them.
 *
 * Added after six dependabot PRs sat open for three weeks. Nothing was
 * wrong with any of them: each was individually mergeable and CI had gone
 * green on all six. They simply produced no signal after that first day —
 * a green PR nobody merges looks exactly like a merged one from every
 * dashboard this repo had. Meanwhile their CI aged into meaninglessness
 * (those runs were against a base main had long since moved past) and,
 * because all five npm ones touched the same package-lock.json, they
 * silently became a pile that could only be landed one rebase at a time.
 *
 * Age is measured from creation, deliberately, not from the last update:
 * dependabot rebases bump `updated_at` without anyone having looked at
 * the PR, so "recently updated" would have hidden exactly these six.
 *
 * Drafts are reported, marked as such. A draft is a weaker call to action,
 * not an exemption — a forgotten one is precisely the thing that rots
 * invisibly, and the report updates one pinned issue in place, so a
 * deliberately-parked draft costs a line rather than a notification.
 */
async function checkStalePullRequests(
  owner,
  repo,
  token,
  { maxAgeDays = STALE_PR_MAX_AGE_DAYS, now = Date.now(), fetchImpl = fetch } = {}
) {
  try {
    // Oldest first, and one page: a repo with more than 100 open PRs has a
    // different problem than this check is for, and paginating would bury
    // the oldest few under the noise anyway.
    const res = await fetchImpl(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=open&sort=created&direction=asc&per_page=100`,
      { headers: githubHeaders(token) }
    );
    if (!res.ok) return [{ issue: `could not list pull requests: HTTP ${res.status}` }];
    const prs = await res.json();
    const findings = [];
    for (const pr of Array.isArray(prs) ? prs : []) {
      if (!pr) continue;
      const created = Date.parse(pr.created_at);
      if (Number.isNaN(created)) continue;
      const ageDays = Math.floor((now - created) / 86400000);
      if (ageDays < maxAgeDays) continue;
      findings.push({
        number: pr.number,
        title: pr.title,
        author: (pr.user && pr.user.login) || 'unknown',
        ageDays,
        draft: !!pr.draft,
        url: pr.html_url
      });
    }
    return findings;
  } catch (e) {
    return [{ issue: `could not list pull requests: ${e.message}` }];
  }
}

function buildWatchdogReport({ yamlFindings, runFindings, prFindings = [], checkedAt }) {
  const lines = [];
  lines.push(`_Last checked: ${checkedAt}_`, '');

  const yamlBad = Object.entries(yamlFindings).filter(([, errs]) => errs.length > 0);
  lines.push('## Workflow file validity (actionlint)');
  if (yamlBad.length === 0) {
    lines.push('✅ Every `.github/workflows/*.yml` file is valid.');
  } else {
    for (const [file, errs] of yamlBad) {
      lines.push(`- ❌ **${file}**`);
      for (const e of errs) lines.push(`  - \`${e}\``);
    }
  }
  lines.push('');

  lines.push('## Scheduled-run status');
  if (runFindings.length === 0) {
    lines.push("✅ Every scheduled workflow's most recent run concluded successfully.");
  } else {
    for (const f of runFindings) lines.push(`- ❌ **${f.file}** — ${f.issue}`);
  }
  lines.push('');

  lines.push(`## Open pull requests older than ${STALE_PR_MAX_AGE_DAYS} days`);
  if (prFindings.length === 0) {
    lines.push(`✅ No open pull request has been waiting more than ${STALE_PR_MAX_AGE_DAYS} days.`);
  } else {
    for (const f of prFindings) {
      if (f.issue) {
        lines.push(`- ❌ ${f.issue}`);
        continue;
      }
      const draft = f.draft ? ' _(draft)_' : '';
      lines.push(`- ⏳ [#${f.number}](${f.url}) **${f.title}** — ${f.ageDays} days old, by \`${f.author}\`${draft}`);
    }
    lines.push('');
    lines.push('_A green PR nobody merges looks exactly like a merged one from every other ' +
      'dashboard here. Its CI also ages out: a check that passed against a base `main` has ' +
      'since moved past says nothing about merging it today._');
  }

  return lines.join('\n');
}

async function findExistingWatchdogIssue(owner, repo, token, fetchImpl) {
  const res = await fetchImpl(
    `${GITHUB_API}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(WATCHDOG_ISSUE_LABEL)}&state=all&per_page=10`,
    { headers: githubHeaders(token) }
  );
  if (!res.ok) throw new Error(`could not list issues: HTTP ${res.status}`);
  const issues = await res.json();
  return issues.find((issue) => issue.title === WATCHDOG_ISSUE_TITLE) || null;
}

// Same update-in-place pattern the hub's own health-report.js/watchdog.js
// use — one pinned issue, reopened if a human closed it, never a fresh
// issue per run.
async function publishWatchdogReport(owner, repo, token, body, { fetchImpl = fetch } = {}) {
  const existing = await findExistingWatchdogIssue(owner, repo, token, fetchImpl);
  if (existing) {
    const wasClosed = existing.state === 'closed';
    const patch = { body };
    if (wasClosed) patch.state = 'open';
    const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues/${existing.number}`, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error(`could not update issue #${existing.number}: HTTP ${res.status}`);
    return { action: wasClosed ? 'reopened' : 'updated', issueUrl: existing.html_url };
  }
  const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: WATCHDOG_ISSUE_TITLE, body, labels: [WATCHDOG_ISSUE_LABEL] })
  });
  if (!res.ok) throw new Error(`could not create issue: HTTP ${res.status}`);
  const created = await res.json();
  return { action: 'created', issueUrl: created.html_url };
}

async function main() {
  const asJson = process.argv.includes('--json');
  const yamlFindings = runActionlint();

  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.GITHUB_TOKEN;

  let runFindings = [];
  let prFindings = [];
  let publishResult = null;
  if (owner && repo && token) {
    runFindings = await checkScheduledWorkflowRuns(owner, repo, token);
    prFindings = await checkStalePullRequests(owner, repo, token);
    const body = buildWatchdogReport({ yamlFindings, runFindings, prFindings, checkedAt: new Date().toISOString() });
    publishResult = await publishWatchdogReport(owner, repo, token, body);
  } else {
    console.log('GITHUB_REPOSITORY/GITHUB_TOKEN not set — skipping the run-history and stale-PR checks and the issue publish (local run).');
  }

  // A stale PR is deliberately NOT a failure. Nothing is broken — someone
  // just has a decision to make — and exiting 1 on it would turn a weekly
  // green tick into a permanent red one that stops being read, taking the
  // two checks that DO mean something down with it. It reports, loudly, in
  // the pinned issue.
  const hasFailures = Object.values(yamlFindings).some((e) => e.length > 0) || runFindings.length > 0;

  if (asJson) {
    console.log(JSON.stringify({ yamlFindings, runFindings, prFindings, publishResult }, null, 2));
  } else {
    console.log(buildWatchdogReport({ yamlFindings, runFindings, prFindings, checkedAt: new Date().toISOString() }));
    if (publishResult) console.log(`\nWatchdog report ${publishResult.action}: ${publishResult.issueUrl}`);
  }

  process.exitCode = hasFailures ? 1 : 0;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Watchdog run failed:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  listWorkflowFiles,
  hasScheduleTrigger,
  runActionlint,
  checkScheduledWorkflowRuns,
  checkStalePullRequests,
  buildWatchdogReport,
  publishWatchdogReport,
  STALE_PR_MAX_AGE_DAYS
};
