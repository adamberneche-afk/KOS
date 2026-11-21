#!/usr/bin/env node
'use strict';
// =============================================================================
// coverage-gaps — finds a scheduled/triggered GAS function that no test in
// this repo ever actually CALLS, as opposed to gas-lint's checks (all pure
// static source analysis, no execution).
//
// WHY THIS IS ITS OWN TOOL, NOT A 13TH gas-lint CHECK. Every existing
// gas-lint check is synchronous regex/brace-depth analysis over source text
// — fast, deliberately never executes anything. This one has to actually
// run the real test suite under Node's built-in V8 coverage instrumentation
// to answer "was this function's body ever entered," a different
// (slower, execution-based) kind of check — the same reason doc-currency
// and html-lint are their own tools instead of folded in.
//
// WHY SCOPED TO ScriptApp.newTrigger() HANDLERS, NOT EVERY FUNCTION. An
// earlier version of this tool checked every top-level function in every
// project and found 400+ with zero coverage — almost all legitimate
// (one-off setup scripts, UI-dispatch callbacks, small formatting helpers)
// and a handful of real findings buried in noise nobody would ever read
// through. That's not what actually went wrong: sensor1_scanInboundSessions
// wasn't "an undertested helper" — it was a function running unattended on
// a 5-minute trigger, silently, for as long as this repo has existed, with
// nothing watching it and no human clicking a button that would notice it
// misbehaving. That's the specific class of risk this tool targets: an
// automatically-scheduled function is the one kind of function where a
// coverage gap can hide for the exact same duration a real incident already
// demonstrated (deployment drift, sensor 1's ingestion sensor, the Curator
// JSON parse failures) — every one of them a scheduled job nobody was
// watching. A manual-only or UI-triggered function fails in front of
// someone; a scheduled one fails silently. That difference is the entire
// point of this check's scope.
//
// WHY THIS EXISTS AT ALL (process-hardening sprint, Phase 0a — see
// meta/PROCESS_HARDENING_SPRINT.md). sensor1_scanInboundSessions() had ZERO
// test coverage of any kind for most of this repo's life, because the
// mocks it needed (MimeType, Folder.getFiles(), File.getMimeType(),
// DocumentApp.flush()) didn't exist yet. Nothing flagged that; it was found
// by accident, mid-incident-fix. This tool answers the specific question
// that would have surfaced it in advance: "which of this repo's scheduled
// jobs does the test suite never actually call," regardless of WHY
// (missing mock, or just never written).
//
// HOW IT SEES INSIDE THE vm SANDBOX. tests/harness/gas-sandbox.js loads
// each .gs/.js file's source into a vm context via vm.runInContext(source,
// context, { filename: absPath }). Node's V8 coverage instrumentation
// (NODE_V8_COVERAGE) turns out to still record per-function hit counts for
// that code, keyed by the real absolute file path passed as `filename` —
// confirmed empirically before building this tool, not assumed.
//
// WHAT THIS DOES NOT DO: line/branch coverage, or anything about whether a
// covered function's important branches were actually exercised — only
// "was this function's body entered at least once, anywhere in the suite."
// A deliberately low bar: this tool exists to catch the "literally never"
// case, not to be a coverage-percentage gate.
//
// Usage:
//   node tools/coverage-gaps/check.js            human-readable report
//   node tools/coverage-gaps/check.js --json      machine-readable report
// Exit code 1 if any non-allowlisted trigger handler has zero hits across
// the whole suite, or if a ScriptApp.newTrigger() call names its handler
// dynamically (can't be resolved statically — reported as its own finding
// rather than silently skipped, same "the gap is visible rather than
// looking like coverage" convention gas-lint's dynamic-server-dispatch
// warning already uses).
// =============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MAP = require('../lib/repo.js').projectMap();
const { stripCommentsAndStrings } = require('../lib/js-source.js');
const AS_JSON = process.argv.includes('--json');
// --coverage-dir <dir> (2026-11-20, audit 1.2): read the coverage a test run
// already wrote (NODE_V8_COVERAGE=<dir> npm test) instead of running the
// whole suite a second time. CI runs the suite once this way.
const COVERAGE_DIR = (function () {
  const i = process.argv.indexOf('--coverage-dir');
  return i !== -1 ? process.argv[i + 1] : '';
})();

// Handlers this repo already knows the test suite doesn't call directly —
// each entry documents why, same convention gas-lint's own ALLOWLIST uses.
const ALLOWLIST_PATH = path.join(__dirname, 'allowlist.json');

function loadAllowlist() {
  const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
  const set = new Set();
  for (const entry of raw) set.add(entry.file + '::' + entry.function);
  return set;
}

function productionFiles() {
  const files = [];
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    for (const f of def.files || []) {
      if (f.endsWith('.html')) continue; // client-side HTML, not GAS functions
      files.push({ project: projectName, relPath: f });
    }
  }
  return files;
}

// Finds every ScriptApp.newTrigger(...) call across production source and
// extracts the handler name when it's a literal string. A non-literal
// argument (a variable — cas-ccps's own trigger-table-driven setup files do
// this, e.g. `ScriptApp.newTrigger(h.fn)`) can't be resolved by regex, so
// it's reported as its own "unresolvable" finding rather than silently
// skipped.
const TRIGGER_CALL_RE = /ScriptApp\.newTrigger\(\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$.]*))\s*\)/g;

// A non-literal handler is resolved by two shapes the repo uses (2026-11-17,
// the dead-ends audit's item 3, which found 12 registrations this tool
// couldn't see):
//   - a name bound to a literal: `const WD_TRIGGER_FN = 'runQueueWatchdog'`,
//     or `const fn = "dispatchFormSubmit"` in the installing function: looked
//     up in the same file, then in the project's other files;
//   - a handler table: `ScriptApp.newTrigger(h.fn)` over a literal array of
//     `{ fn: "name", … }` (and lcInstallJob_(fn), which installs only an
//     LC_JOBS entry): every `fn: "<name>"` in the same file.
// Anything else stays unresolved, a warning as before.
// The name is escaped whole (every regex special, backslash included), as
// definesFunction does; only an identifier ever reaches here anyway.
const escapeRegExp = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BOUND_NAME_RE = (name) => new RegExp('\\b(?:const|let|var)\\s+' + escapeRegExp(name) + "\\s*=\\s*(['\"])([A-Za-z_$][\\w$]*)\\1");
const TABLE_ENTRY_RE = /\bfn\s*:\s*(['"])([A-Za-z_$][\w$]*)\1/g;

function boundLiteral(src, name) {
  const m = BOUND_NAME_RE(name).exec(src);
  return m ? m[2] : null;
}

function tableNames(src) {
  const out = [];
  let m;
  TABLE_ENTRY_RE.lastIndex = 0;
  while ((m = TABLE_ENTRY_RE.exec(src)) !== null) if (out.indexOf(m[2]) === -1) out.push(m[2]);
  return out;
}

// expr: the argument as written. srcs: { file: the registering file's source
// (comments stripped, strings kept), project: [the project's other files'] }.
// Returns [names] and how they were found, or null.
function resolveHandlerExpr(expr, srcs) {
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const bound = boundLiteral(srcs.file, expr) ||
      srcs.project.map((p) => boundLiteral(p, expr)).filter(Boolean)[0];
    if (bound) return { names: [bound], via: 'constant ' + expr };
  }
  if (/\.fn$/.test(expr) || expr === 'fn') {
    const names = tableNames(srcs.file);
    if (names.length) return { names, via: 'the handler table in its file' };
  }
  return null;
}

function findTriggerHandlers(absPath, relPath, projectSrcs) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const stripped = stripCommentsAndStrings(raw, { keepStrings: true });
  const lines = stripped.split('\n');
  const resolved = [];
  const unresolved = [];
  lines.forEach((line, idx) => {
    let m;
    TRIGGER_CALL_RE.lastIndex = 0;
    while ((m = TRIGGER_CALL_RE.exec(line)) !== null) {
      if (m[2]) { resolved.push({ name: m[2], line: idx + 1 }); continue; }
      const r = resolveHandlerExpr(m[3], { file: stripped, project: projectSrcs || [] });
      if (r) r.names.forEach((name) => resolved.push({ name, line: idx + 1, via: r.via }));
      else unresolved.push({ expr: m[3], line: idx + 1, file: relPath });
    }
  });
  return { resolved, unresolved };
}

// Finds a top-level `function name(...) {` declaration's presence in a
// file — used to locate which file actually defines a resolved trigger
// handler name (not necessarily the same file that registers it).
function definesFunction(absPath, name) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const stripped = stripCommentsAndStrings(raw);
  const re = new RegExp('^[ \\t]*function\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(', 'm');
  return re.test(stripped);
}

function runSuiteWithCoverage() {
  const covDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-gaps-'));
  try {
    execFileSync('npm', ['test'], {
      cwd: REPO_ROOT,
      env: { ...process.env, NODE_V8_COVERAGE: covDir },
      stdio: 'ignore', // this tool reports its own findings; npm test's own failures are its own job to report
    });
  } catch (e) {
    // A failing test suite still produces coverage data for whatever ran —
    // only a total inability to produce any file at all is this tool's
    // problem, and mergeCoverage() below tolerates an empty directory fine.
  }
  return covDir;
}

// Merges per-function hit counts across every coverage-*.json file (one per
// worker process node --test spawns) — a function is "hit" if ANY recorded
// instance, in ANY file, shows count > 0.
function mergeCoverage(covDir) {
  const hitsByFileFn = new Map(); // "absPath::fnName" -> total hit count
  for (const entry of fs.readdirSync(covDir)) {
    if (!entry.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(covDir, entry), 'utf8')); }
    catch (e) { continue; }
    for (const scriptCov of data.result || []) {
      if (!scriptCov.url || scriptCov.url.indexOf('file://') !== 0) continue;
      const absPath = decodeURIComponent(scriptCov.url.slice('file://'.length));
      for (const fn of scriptCov.functions || []) {
        if (!fn.functionName) continue; // the "" entry covers the whole script, not one function
        const hits = fn.ranges.reduce((sum, r) => sum + (r.count > 0 ? 1 : 0), 0);
        const key = absPath + '::' + fn.functionName;
        hitsByFileFn.set(key, (hitsByFileFn.get(key) || 0) + hits);
      }
    }
  }
  return hitsByFileFn;
}

function main() {
  const allowlist = loadAllowlist();
  const files = productionFiles();

  // Pass 1 (static, fast): collect every trigger handler this repo
  // registers, resolved and unresolved, before spending time running the
  // whole suite — no point paying for coverage if there's nothing to check
  // it against (an empty result here is itself worth reporting, not
  // silently passing).
  const resolvedHandlers = []; // { project, name, registeredIn }
  const unresolvedCalls = [];
  // Each project's sources, comments stripped and strings kept, so a handler
  // named by a constant in another file of the project resolves.
  const projectSrcs = {};
  for (const { project, relPath } of files) {
    const absPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(absPath) || relPath.endsWith('.html')) continue;
    (projectSrcs[project] = projectSrcs[project] || []).push(stripCommentsAndStrings(fs.readFileSync(absPath, 'utf8'), { keepStrings: true }));
  }
  const seenHandler = new Set();
  for (const { project, relPath } of files) {
    const absPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(absPath)) continue; // gas-lint's own checks already report a missing file
    const { resolved, unresolved } = findTriggerHandlers(absPath, relPath, projectSrcs[project]);
    resolved.forEach((r) => {
      const k = project + '::' + r.name;
      if (seenHandler.has(k)) return; // a handler installed from two places is checked once
      seenHandler.add(k);
      resolvedHandlers.push({ project, name: r.name, registeredIn: relPath, line: r.line, via: r.via });
    });
    unresolved.forEach((u) => unresolvedCalls.push({ project, ...u }));
  }

  const covDir = COVERAGE_DIR || runSuiteWithCoverage();
  if (COVERAGE_DIR && (!fs.existsSync(COVERAGE_DIR) || !fs.readdirSync(COVERAGE_DIR).length)) {
    throw new Error('--coverage-dir ' + COVERAGE_DIR + ' holds no coverage: run the suite with NODE_V8_COVERAGE set to it first.');
  }
  const hits = mergeCoverage(covDir);
  if (!COVERAGE_DIR) fs.rmSync(covDir, { recursive: true, force: true });

  const findings = [];
  const staleAllowlist = [];
  for (const handler of resolvedHandlers) {
    // Find which file in this SAME project actually defines the handler —
    // often (cas-ccps, mostly) the same file that registers it, but not
    // always: kos-personal centralizes every ScriptApp.newTrigger() call
    // into 1_Config_And_Deploy.gs's setupAllTriggers(), separate from
    // where each handler is actually implemented. The allowlist is keyed
    // on the DEFINING file, not the registering one — that's where the
    // logic (and whoever eventually adds a test) actually lives.
    const projectFiles = files.filter((f) => f.project === handler.project && !f.relPath.endsWith('.html'));
    const definingFile = projectFiles.find((f) => definesFunction(path.join(REPO_ROOT, f.relPath), handler.name));
    if (!definingFile) {
      findings.push({
        type: 'handler-not-found',
        project: handler.project, function: handler.name, registeredIn: handler.registeredIn,
      });
      continue;
    }

    const key = path.join(REPO_ROOT, definingFile.relPath) + '::' + handler.name;
    const total = hits.get(key) || 0;

    if (allowlist.has(definingFile.relPath + '::' + handler.name)) {
      // An allowlisted gap that a test now covers: the entry is stale and
      // would hide the handler if that test were later deleted.
      if (total > 0) staleAllowlist.push({ file: definingFile.relPath, function: handler.name });
      continue;
    }
    if (total > 0) continue;

    findings.push({
      type: 'zero-coverage',
      project: handler.project, function: handler.name, file: definingFile.relPath,
    });
  }

  // Deliberately never blocking, unlike zero-coverage/handler-not-found
  // above — a non-literal trigger name is a limit on what this tool CAN
  // verify, not something adding a test fixes. Same status
  // gas-lint's own dynamic-server-dispatch finding already has: always a
  // warning, reported so the gap is visible rather than looking like
  // coverage, never something to allowlist away.
  const warnings = [];
  for (const u of unresolvedCalls) {
    warnings.push({ type: 'unresolved-trigger-name', project: u.project, file: u.file, line: u.line, expr: u.expr });
  }
  const seenStale = new Set();
  for (const e of staleAllowlist) {
    const k = e.file + '::' + e.function;
    if (seenStale.has(k)) continue;
    seenStale.add(k);
    warnings.push({ type: 'stale-allowlist', file: e.file, function: e.function });
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ resolvedHandlerCount: resolvedHandlers.length, findings, warnings }, null, 2));
  } else {
    const line = '─'.repeat(78);
    console.log(line);
    console.log(`coverage-gaps — checked ${resolvedHandlers.length} scheduled trigger handler(s), ` +
      `${findings.length} error(s), ${warnings.length} warning(s)`);
    console.log(line);
    if (findings.length) {
      console.log('\nERRORS\n');
      findings.forEach((f, i) => {
        if (f.type === 'zero-coverage') {
          console.log(`${i + 1}. [zero-coverage] [${f.project}] ${f.function}() in ${f.file} runs on a ` +
            `ScriptApp trigger, and no test in this repo ever calls it. Either add coverage, or add ` +
            `{"file":"${f.file}","function":"${f.function}","reason":"..."} to ` +
            `tools/coverage-gaps/allowlist.json if this is a known, understood gap.\n`);
        } else {
          console.log(`${i + 1}. [handler-not-found] [${f.project}] ${f.function}() is registered as a ` +
            `trigger in ${f.registeredIn} but no file in project "${f.project}" declares a function by ` +
            `that name — likely renamed on one side and not the other.\n`);
        }
      });
    }
    if (warnings.length) {
      console.log('\nWARNINGS\n');
      warnings.forEach((f, i) => {
        if (f.type === 'stale-allowlist') {
          console.log(`${i + 1}. [stale-allowlist] ${f.function}() in ${f.file} is in ` +
            `tools/coverage-gaps/allowlist.json, but a test now calls it. Remove the entry so this ` +
            `check guards it again.\n`);
          return;
        }
        console.log(`${i + 1}. [unresolved-trigger-name] [${f.project}] ${f.file}:${f.line} registers a ` +
          `trigger with a non-literal handler name (\`${f.expr}\`) — this tool can't resolve which ` +
          `function that is statically, so it isn't covered by this check at all. Reported so the gap ` +
          `is visible rather than looking like coverage; confirm by hand which function(s) it resolves ` +
          `to and whether they're tested.\n`);
      });
    }
    if (!findings.length && !warnings.length) console.log('\nClean.\n');
  }

  process.exitCode = findings.length > 0 ? 1 : 0;
}

if (require.main === module) {
  main();
}

module.exports = { findTriggerHandlers, resolveHandlerExpr, mergeCoverage, productionFiles, loadAllowlist, definesFunction };
