#!/usr/bin/env node
// =============================================================================
// doc-currency — catches documentation claims that have stopped being true.
//
// This repo has now run two full documentation-currency sweeps in as many
// sessions. The first fixed a comparable batch and still left a deployment
// guide instructing operators to run two functions that exist nowhere, a
// directory README whose opening paragraph was false in three separate
// clauses, and a live teacher-facing dialog promising an action couldn't be
// undone two menu items above the button that undoes it. Nothing in the repo
// noticed, because nothing in the repo was looking: drift was only ever found
// by a human being asked to go find it.
//
// The existing CI docs-check job doesn't close this. It is PR-only and asks
// whether a README was *touched*, with a [skip-docs-check] escape hatch — a
// question about diffs, not about truth. Every finding above passed it.
//
// Usage:
//   node tools/doc-currency/check.js            human-readable report
//   node tools/doc-currency/check.js --json     machine-readable report
// Exit code is 1 if any ERROR-level finding exists, 0 otherwise (warnings
// don't fail the run).
//
// WHAT THIS IS NOT: a reader. It checks claims that are mechanically
// checkable — a named function that no longer exists, a cited test count
// that no longer matches — and nothing else. A paragraph that is fluent,
// well-cited and wrong will pass every check here. See README.md in this
// directory for the explicit non-goals.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG = require('./config.json');
const AS_JSON = process.argv.includes('--json');

const findings = { errors: [], warnings: [] };
function err(check, message, where) { findings.errors.push({ check, message, where }); }
function warn(check, message, where) { findings.warnings.push({ check, message, where }); }

function readFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

// -----------------------------------------------------------------------
// Shared helpers — reused from tools/gas-lint/check.js rather than
// reimplemented.
//
// This was not the first instinct, and the first instinct was wrong. A
// hand-rolled stripper written for this tool handled comments and quotes
// but not regex literals, so the first `/IDENTITY_KEY\s*[:=]\s*['"].+['"]/`
// in 5_Error_And_Utilities.gs read as an opening quote and desynced every
// line after it — which made the tool report 82 missing functions, nearly
// all of which exist. gas-lint already solved this properly. Requiring it
// gives one implementation instead of two that drift apart.
// -----------------------------------------------------------------------
const gasLint = require('../gas-lint/check.js');
const { stripCommentsAndStrings, lineAt } = gasLint;

// gas-lint's own DECL_RE deliberately does not match `async function` —
// its checks are about GAS's shared global scope, where async declarations
// don't appear. leader-hub's browser-side code is full of them
// (`async function callGAS(...)`), and a doc naming one is making a true
// claim, so this tool needs the wider form. Kept local rather than widened
// in gas-lint, which would change what that tool reports.
const DECL_RE = /^[ \t]*(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/;

// Declarations at any brace depth. Unlike gas-lint's Check A, which cares
// about GAS's shared-global collision surface, this tool only asks "does
// this name exist in the source at all" — so depth is irrelevant, and a
// helper nested inside an IIFE still counts as existing.
function declaredNamesIn(relPath) {
  return declaredNamesFromSource(readFile(relPath));
}

function declaredNamesFromSource(src) {
  const names = new Set();
  const stripped = stripCommentsAndStrings(src);
  for (const line of stripped.split('\n')) {
    const m = line.match(DECL_RE);
    if (m) names.add(m[1] || m[2]);
  }
  // Object-literal method shorthand and `name: function(...)` members, which
  // is how several of this repo's exported surfaces are actually written.
  const memberRe = /^[ \t]*([A-Za-z_$][\w$]*)\s*(?:\(\s*[^)]*\)\s*\{|:\s*(?:async\s+)?function\b|:\s*\([^)]*\)\s*=>)/;
  for (const line of stripped.split('\n')) {
    const m = line.match(memberRe);
    if (m) names.add(m[1]);
  }
  return names;
}

function walk(dirRel, out) {
  const abs = path.join(REPO_ROOT, dirRel);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dirRel, entry.name);
    if (CONFIG.excludeDirs.some(d => rel === d || rel.startsWith(d + '/'))) continue;
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

const ALL_FILES = walk('.', []).map(f => f.replace(/^\.\//, ''));
const SOURCE_FILES = ALL_FILES.filter(f => CONFIG.sourceExtensions.some(e => f.endsWith(e)));
const DOC_FILES = ALL_FILES.filter(f =>
  CONFIG.docExtensions.some(e => f.endsWith(e)) &&
  !CONFIG.excludeDocs.some(d => f === d || f.endsWith('/' + d)));

// Every function-ish name declared anywhere in the repo's own source. A
// documented name is "real" if it appears here — this tool deliberately does
// not care *which* file declares it, because a doc naming a function that
// moved between files is still telling the truth about the system.
let ALL_DECLARED = null;
function allDeclaredNames() {
  if (ALL_DECLARED) return ALL_DECLARED;
  ALL_DECLARED = new Set();
  for (const f of SOURCE_FILES) {
    try {
      for (const n of declaredNamesIn(f)) ALL_DECLARED.add(n);
    } catch (e) { /* unreadable file — not this tool's problem to report */ }
  }
  return ALL_DECLARED;
}

// A backticked identifier with call parens: `foo()` or `foo(a, b)`. The
// parens are what make it a claim about a function rather than a mention of
// a word, which is what keeps the false-positive rate low enough for this to
// be an error-level check rather than a warning.
const DOC_TOKEN_RE = /`([A-Za-z_$][\w$]*)\s*\([^`]*\)`/g;

// -----------------------------------------------------------------------
// Check 1 — a doc names a function that does not exist
//
// This is the check that would have caught DEPLOYMENT_GUIDE.md's
// runPhase0Migration()/runPhase0Verify() instructions, 6_Governance.gs's
// banner asserting the renamed generateCouncilInputPayload() as live code,
// and STUDIO_INTEGRATION_SPEC.md's _applyCalibration().
//
// Two exclusions are load-bearing. Without them the tool's first act is to
// flag documentation that is doing its job correctly:
//
//   - CHANGELOG.md and HISTORY.md are excluded wholesale (see config.json).
//     Naming a function that was deleted is precisely what a changelog is
//     for. Round 14's entry exists to record that triggerCouncilSimulation()
//     was removed; flagging it would be flagging the record for being a
//     record.
//   - A mention adjacent to deleted/removed/renamed/superseded language is
//     treated as historical wherever it appears. All eleven surviving
//     mentions of triggerCouncilSimulation() in this repo are one of these
//     two cases, and every one of them is correct prose.
// -----------------------------------------------------------------------
// The blank-line-delimited block containing `lineNo` (1-indexed). Markdown
// list items are treated as part of the surrounding block, which is what a
// reader would do — a bullet explaining a removal is not separated from the
// bullet naming the removed function by anything but a newline.
function paragraphAround(lines, lineNo) {
  let from = lineNo - 1;
  while (from > 0 && lines[from - 1].trim() !== '') from--;
  let to = lineNo - 1;
  while (to < lines.length - 1 && lines[to + 1].trim() !== '') to++;
  return lines.slice(from, to + 1).join('\n');
}

// externalSurfaceDocs is a map of doc path -> the function names that live in
// the operator's Script editor rather than in this repo. It used to be a flat
// array of paths, which marked a whole FILE unverifiable — and that is how a
// genuinely stale reference hid in plain sight for a while:
// LH_02_INTEGRATION_GUIDE.md's "all AI calls go through callAI()" survived as
// a soft "cannot verify" warning even though callAI was deleted from
// leader-hub's own HTML (see its line 14466, "Removed: Gemini AI
// infrastructure"). It was never an out-of-repo function at all.
//
// Per-name is the honest granularity: a doc can legitimately describe an
// external Gmail watcher AND make a stale claim about in-repo code in the
// same paragraph. Only the names actually declared external get the soft
// treatment; anything else in the same file is checked normally.
//
// Returns the name list for a declared external-surface doc, or null if the
// doc isn't one. An array value is still accepted (treated as the name list),
// so the config can't silently regress to whole-file semantics.
function externalNamesFor(relPath) {
  const cfg = CONFIG.externalSurfaceDocs;
  if (Array.isArray(cfg)) return cfg.includes(relPath) ? [] : null;
  if (!cfg || !Object.prototype.hasOwnProperty.call(cfg, relPath)) return null;
  const names = cfg[relPath];
  return Array.isArray(names) ? names : [];
}

function docLevelStatus(relPath, raw) {
  // A file-level banner speaks for the whole document. This repo already
  // uses them heavily — "⚠ SUPERSEDED — kept for historical reference
  // only", "⚠ OUTDATED — predates Module 2/4/5", "every integration that
  // doesn't exist yet" — and every one is a correct, deliberate act of
  // documentation. Without this the tool reports 20 errors against
  // LEADERHUB_README.md, whose own third line already says the thing it
  // would be reporting.
  const head = raw.split('\n').slice(0, CONFIG.bannerScanLines).join('\n');
  if (new RegExp(CONFIG.supersededMarkers.join('|'), 'i').test(head)) return 'superseded';
  if (externalNamesFor(relPath) !== null) return 'external';
  return 'live';
}

function checkDocumentedFunctionsExist() {
  const declared = allDeclaredNames();
  const historicalRe = new RegExp(CONFIG.historicalMarkers.join('|'), 'i');
  const tokenRe = DOC_TOKEN_RE;

  for (const relPath of DOC_FILES) {
    let raw;
    try { raw = readFile(relPath); } catch (e) { continue; }
    const status = docLevelStatus(relPath, raw);
    if (status === 'superseded') continue;

    const lines = raw.split('\n');
    let m;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(raw))) {
      const name = m[1];
      if (declared.has(name)) continue;
      if (CONFIG.allowlistedNames.includes(name)) continue;
      if (gasLint.ALLOWLIST.has(name)) continue;

      const lineNo = lineAt(raw, m.index);
      // Historical framing is judged on the enclosing paragraph — the
      // blank-line-delimited block the mention sits in — not a fixed line
      // window. A ±6-line window was tried first and was too loose to
      // trust: USER_GUIDE.md's "The deploy function only creates what
      // doesn't exist" sits three lines above unrelated text and silently
      // suppressed a genuine finding, because "doesn't exist" is ordinary
      // English before it is a marker. A paragraph is the unit this repo
      // actually writes these explanations in, so it is the unit to read
      // them in.
      if (historicalRe.test(paragraphAround(lines, lineNo))) continue;

      // A doc that describes an Apps Script project living in someone's
      // editor rather than in this repo is making a claim this tool has no
      // way to check. Saying "this function does not exist" there would be
      // asserting something the tool does not know, so it reports what it
      // actually knows instead, at warning level.
      if (status === 'external') {
        const externalNames = externalNamesFor(relPath) || [];
        if (externalNames.includes(name)) {
          warn(
            'documented-function-unverifiable',
            `${relPath}:${lineNo} documents \`${name}()\`, which is not in this repo's source. config.json's externalSurfaceDocs lists this name for this doc as living in an Apps Script project that was never committed here, so the tool cannot tell a stale reference from a correct one — worth an occasional human check, not a build failure.`,
            relPath
          );
          continue;
        }
        err(
          'documented-function-missing',
          `${relPath}:${lineNo} documents \`${name}()\`, which is not declared anywhere in this repo's source. This doc IS an externalSurfaceDocs entry, but \`${name}\` is not on its list of out-of-repo names (${externalNames.length ? externalNames.join(', ') : 'the list is empty'}) — so this is an ordinary stale reference, not an unverifiable one. Either the function was renamed or deleted and this doc still instructs a reader to call it, or it really does live in the external project and belongs on that list. Do not add a name to the list just to silence this: that is how a deleted function keeps being documented as current.`,
          relPath
        );
        continue;
      }

      err(
        'documented-function-missing',
        `${relPath}:${lineNo} documents \`${name}()\`, which is not declared anywhere in this repo's source. Either the function was renamed or deleted and this doc still instructs a reader to call it, or the doc is describing history — if the latter, say so in the surrounding text (this check treats "${CONFIG.historicalMarkers.join('", "')}" nearby as historical framing, and a file-level "superseded"/"outdated" banner as covering the whole document).`,
        relPath
      );
    }
  }
}

// -----------------------------------------------------------------------
// Check 2 — a cited test count no longer matches
//
// "286 passing" appeared in three files and was wrong in all three. A count
// is the most mechanically checkable claim a doc can make and the fastest
// to rot, so this is an error, not a warning.
//
// The count is measured, never assumed: this shells out to the repo's own
// `npm test` and reads the TAP plan line. If that fails for any reason
// (no node_modules, a genuinely failing suite), the check reports that it
// could not measure and returns — it must never invent a number and then
// "correct" the docs to match it.
// -----------------------------------------------------------------------
function measuredTestCount() {
  try {
    const out = execFileSync('npm', ['test'], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CONFIG.testTimeoutMs,
    });
    const m = out.match(/^# tests (\d+)$/m);
    return m ? parseInt(m[1], 10) : null;
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const m = out.match(/^# tests (\d+)$/m);
    return m ? parseInt(m[1], 10) : null;
  }
}

// Markdown blockquotes wrap one logical paragraph across several literal
// lines, each starting with `>`. A count and "passing" split exactly like
// that ("...gas-sandbox.js\` — 346\n> passing tests...") once slipped past
// checkCitedTestCounts below: \s+ could not cross the `>` sitting between
// the two newline characters. Replacing "\n>" (or a leading ">") with a
// same-length blank first — so every index into the result still lines up
// with the real file for lineAt() — treats a blockquote as the one logical
// line it actually renders as, for this check's purposes only.
//
// Pulled out as its own pure function (rather than inlined in the check)
// so it can be pinned by a test without re-running the check against the
// whole repo, matching this file's existing pattern for declaredNamesFromSource
// and paragraphAround.
function normalizeBlockquotes(raw) {
  return raw.replace(/(^|\n)>/g, '$1 ');
}

function checkCitedTestCounts() {
  // Only look for the claim shape first — measuring costs a full test run,
  // so don't pay for it if no doc makes the claim.
  const claimRe = /(\d[\d,]*)\s+passing\b/gi;
  const sites = [];
  for (const relPath of DOC_FILES) {
    let raw;
    try { raw = readFile(relPath); } catch (e) { continue; }
    const normalized = normalizeBlockquotes(raw);
    let m;
    claimRe.lastIndex = 0;
    while ((m = claimRe.exec(normalized))) {
      sites.push({
        relPath,
        line: lineAt(raw, m.index),
        claimed: parseInt(m[1].replace(/,/g, ''), 10),
        text: m[0].replace(/\s+/g, ' '),
      });
    }
  }
  if (!sites.length) return;

  const actual = measuredTestCount();
  if (actual === null) {
    warn(
      'test-count-unmeasurable',
      `${sites.length} doc site(s) cite a passing-test count, but this check could not measure the real one (\`npm test\` did not produce a "# tests N" line). Not reporting the citations either way — a checker that guesses is worse than one that abstains.`,
      sites[0].relPath
    );
    return;
  }
  for (const s of sites) {
    if (s.claimed === actual) continue;
    err(
      'stale-test-count',
      `${s.relPath}:${s.line} says "${s.text}" but \`npm test\` reports ${actual}. If the number is deliberately historical ("N passing as of the X adoption"), prefer naming the command instead of the number — see leader-hub/README.md, which tells the reader to run \`wc -l\` rather than asserting a line count that will rot.`,
      s.relPath
    );
  }
}

// -----------------------------------------------------------------------
// Check 3 — a documented sheet column or property key that no code touches
//
// Warning, not error, and deliberately so: a key can legitimately be
// documented before it is wired, and SCHEMA_REFERENCE.md's whole job is to
// describe a live spreadsheet whose tabs this repo does not exclusively own.
//
// The exclusion here is the one that decides whether this check is useful
// or actively counterproductive. Prototyped against the live repo, of 70
// ALL-CAPS keys in SCHEMA_REFERENCE.md exactly 3 were dead — and all 3 were
// the rows already labelled "Aspirational". So a row that admits its own
// status is acknowledged, not re-reported: otherwise the tool's first
// output is a complaint about the three rows that are documented correctly.
// -----------------------------------------------------------------------
function checkDocumentedKeysAreLive() {
  const sourceText = SOURCE_FILES.map(f => {
    try { return readFile(f); } catch (e) { return ''; }
  }).join('\n');
  const ackRe = new RegExp(CONFIG.acknowledgedMarkers.join('|'), 'i');
  const keyRe = /`([A-Z][A-Z0-9_]{3,})`/g;

  for (const relPath of CONFIG.keyRegistryDocs) {
    let raw;
    try { raw = readFile(relPath); } catch (e) { continue; }
    const lines = raw.split('\n');
    const seen = new Set();
    let m;
    keyRe.lastIndex = 0;
    while ((m = keyRe.exec(raw))) {
      const key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      if (CONFIG.allowlistedKeys.includes(key)) continue;
      if (sourceText.includes(key)) continue;

      const lineNo = lineAt(raw, m.index);
      // Same-line only: these registries are one key per table row, so the
      // row that names the key is the row that must own its status.
      if (ackRe.test(lines[lineNo - 1] || '')) continue;

      warn(
        'documented-key-not-in-code',
        `${relPath}:${lineNo} documents \`${key}\`, which appears nowhere in this repo's source. If it is real but unwired, mark the row (this check treats "${CONFIG.acknowledgedMarkers.join('", "')}" on the same line as acknowledged); if it is gone, the row should say so.`,
        relPath
      );
    }
  }
}

// -----------------------------------------------------------------------
// Check 5 — a behavior doc presents a blocked capability as live
//
// The gap this closes is the one every other check in this tool is blind to.
// Check 1 verifies that a documented function EXISTS; nothing verified that
// a documented path can RUN. On the ccpsnet.net account it often cannot: a
// custom Studio step is a Workspace Add-on and needs a standard, non-default
// Cloud project, and GCP is disabled org-wide, so 2,113 lines of tested
// custom-step code push successfully and never appear in Studio's picker.
// Every function those docs named existed. The instructions were still
// impossible to follow.
//
// Three real cases, all of which were found by hand and none of which any
// check could see: kos-personal/STUDIO_INTEGRATION_SPEC.md told a Flow
// builder to write the document body and set FLOW_COMPLETE from Studio (the
// half that moved into Apps Script); IMPACT_DASHBOARD.html's badges read
// "Built, Not Deployed," which reads as "someone just needs to push it";
// and three separate documents described Flows 2-5 as waiting on a push.
//
// WHAT IS DECLARED AND WHY. gcp-map.json owns each blocked surface's
// doc_tokens: `mentions` (what a doc says when it means this surface) and
// `fallback` (what replaced it). It has to be declared — the tool cannot
// infer from "cas-ccps/studio-steps" that "37_FlowInputBuilder" is the
// answer — and it belongs beside the status it describes rather than in this
// tool's config, so there is one place to update when a surface changes.
//
// WHICH DOCS. Only those in config.json's blockedSurfaceDocs, following the
// keyRegistryDocs idiom already used by Check 3: a check that applies to
// every doc in the repo would report 12 findings, 8 of them layout
// inventories ("kos-personal has 2 clasp projects", a table of step files)
// that are true whatever the surface's status. Measured before shipping,
// because a check at that signal ratio gets muted, and a muted check is
// worse than an absent one. The declared list is the set of documents that
// make behavioral claims about the pipeline — the ones where a blocked path
// read as live sends someone to spend a session on it.
//
// A mention is fine if its own paragraph (or the doc's banner region) either
// acknowledges the block — config.json's blockedMarkers, the same idea as
// Check 1's historicalMarkers — or names the fallback. Unacknowledged is an
// ERROR. Acknowledged everywhere but with the fallback named nowhere in the
// document is a WARNING: the reader knows it is broken and still does not
// know what to do instead.
// -----------------------------------------------------------------------
function blockedSurfaces() {
  let gcpMap;
  try { gcpMap = JSON.parse(readFile('tools/gas-lint/gcp-map.json')); }
  catch (e) {
    err('gcp-map-unreadable',
      `Could not read tools/gas-lint/gcp-map.json: ${e.message}. Check 5 cannot run, so it is ` +
      `failing loudly rather than passing silently.`, 'tools/gas-lint/gcp-map.json');
    return [];
  }
  const out = [];
  for (const [key, def] of Object.entries(gcpMap.surfaces || {})) {
    if (def.status !== 'live-blocked') continue;
    const tokens = def.doc_tokens;
    if (!tokens || !Array.isArray(tokens.mentions) || !tokens.mentions.length) {
      // A blocked surface with no doc_tokens is invisible to this check, and
      // silence there would look like coverage.
      warn('blocked-surface-undeclared-tokens',
        `gcp-map.json's "${key}" is live-blocked but declares no doc_tokens.mentions, so no ` +
        `document is being checked against it. Add the strings a doc uses when it means this ` +
        `surface, and the ones that name its fallback.`, 'tools/gas-lint/gcp-map.json');
      continue;
    }
    out.push({ key, mentions: tokens.mentions, fallback: tokens.fallback || [] });
  }
  return out;
}

/**
 * Audits one document against one blocked surface. Returns
 * { bare, acknowledged, docNamesFallback } — `bare` is the first mention
 * whose own paragraph (and the doc's banner) neither acknowledges the block
 * nor names the fallback.
 *
 * Paragraph scope, not a line window, for the reason this tool already
 * learned once: USER_GUIDE.md's "only creates what doesn't exist" sat three
 * lines from an unrelated paragraph and suppressed a real finding, because
 * these markers are ordinary English before they are markers.
 *
 * Pure apart from CONFIG, so a test can drive it with literal doc text.
 */
function auditBlockedMentions(raw, surface) {
  const blockedRe = new RegExp(CONFIG.blockedMarkers.join('|'), 'i');
  const lines = raw.split('\n');
  const banner = lines.slice(0, CONFIG.bannerScanLines).join('\n');
  const fallback = surface.fallback || [];
  const out = {
    bare: null,
    acknowledged: null,
    docNamesFallback: fallback.some(t => raw.includes(t)),
  };
  for (let i = 0; i < lines.length; i++) {
    const hit = surface.mentions.find(m => lines[i].includes(m));
    if (!hit) continue;
    // The banner counts only for a mention BELOW it. Without that guard a
    // document shorter than bannerScanLines is entirely "banner," so any
    // marker word anywhere in it launders every mention — caught by
    // tests/tools/doc-currency-blocked-surfaces.test.js's different-paragraph
    // test, which is a 3-line document.
    const inBannerRegion = i + 1 <= CONFIG.bannerScanLines;
    const context = paragraphAround(lines, i + 1) + (inBannerRegion ? '' : '\n' + banner);
    const ok = blockedRe.test(context) || fallback.some(t => context.includes(t));
    if (ok) { if (!out.acknowledged) out.acknowledged = { line: i + 1, hit }; }
    else if (!out.bare) out.bare = { line: i + 1, hit, text: lines[i].trim() };
  }
  return out;
}

function checkBlockedSurfacesNotPresentedAsLive() {
  const surfaces = blockedSurfaces();
  if (!surfaces.length) return;

  for (const relPath of (CONFIG.blockedSurfaceDocs || [])) {
    let raw;
    try { raw = readFile(relPath); }
    catch (e) {
      warn('blocked-surface-doc-missing',
        `config.json's blockedSurfaceDocs names ${relPath}, which does not exist. A stale list ` +
        `here silently un-checks a document.`, 'tools/doc-currency/config.json');
      continue;
    }
    // A file-level superseded banner speaks for the whole document, same as
    // everywhere else in this tool.
    if (docLevelStatus(relPath, raw) === 'superseded') continue;

    for (const surface of surfaces) {
      const { bare, acknowledged, docNamesFallback } = auditBlockedMentions(raw, surface);

      if (bare) {
        err('blocked-surface-presented-as-live',
          `${relPath}:${bare.line} names "${bare.hit}" without saying, anywhere near it, that ` +
          `the surface is blocked or what replaced it. gcp-map.json has "${surface.key}" as ` +
          `live-blocked: it cannot run on the account this repo deploys to, so a reader takes ` +
          `this as a live path and spends a session on it. Either acknowledge the status (this ` +
          `check accepts "${CONFIG.blockedMarkers.slice(0, 4).join('", "')}", … in the ` +
          `enclosing paragraph or the doc's banner) or name the fallback ` +
          `(${surface.fallback.join(', ') || 'none declared'}).`,
          relPath);
      } else if (acknowledged && surface.fallback.length && !docNamesFallback) {
        warn('blocked-surface-fallback-unnamed',
          `${relPath}:${acknowledged.line} correctly says "${acknowledged.hit}" is blocked, but ` +
          `this document never names what replaced it (${surface.fallback.join(', ')}). A ` +
          `reader learns the path is dead and not what to do instead.`,
          relPath);
      }
    }
  }
}

// -----------------------------------------------------------------------
// Check 4 — a doc cites file:line that is past the end of that file
//
// meta/CODEBASE_REVIEW.md carried 16 file:line citations; 4 pointed past
// EOF (one cited cas-ccps/README.md:616-617 against a 450-line file) and
// several more had drifted onto unrelated lines. Only the past-EOF case is
// mechanically decidable — "this line exists but no longer says what the
// citation claims" needs a reader — so that is all this checks. Warning,
// because the fix is usually to convert the citation to a function-name
// anchor rather than to re-guess the number, and that is a judgment call.
// -----------------------------------------------------------------------
function checkCitationsInRange() {
  const citeRe = /`([A-Za-z0-9_./-]+\.(?:gs|js|jsx|md|html|json))(?::(\d+)(?:-(\d+))?)`/g;
  for (const relPath of DOC_FILES) {
    let raw;
    try { raw = readFile(relPath); } catch (e) { continue; }
    const dir = path.posix.dirname(relPath);
    let m;
    citeRe.lastIndex = 0;
    while ((m = citeRe.exec(raw))) {
      const cited = m[1];
      const hi = parseInt(m[3] || m[2], 10);
      if (!hi) continue;
      // Resolve relative to the citing doc first, then from the repo root —
      // both forms are used in this repo and both are legitimate.
      const candidates = [path.posix.join(dir, cited), cited];
      const hit = candidates.find(c => fs.existsSync(path.join(REPO_ROOT, c)));
      if (!hit) continue;  // unresolvable path is a different problem
      const total = readFile(hit).split('\n').length;
      if (hi <= total) continue;
      warn(
        'citation-past-eof',
        `${relPath}:${lineAt(raw, m.index)} cites \`${m[0].replace(/`/g, '')}\` but ${hit} has only ${total} lines. Line-number citations rot on every edit — prefer a \`functionName()\` or named-section anchor, which survives.`,
        relPath
      );
    }
  }
}

// -----------------------------------------------------------------------
// Exported for tests/tools/doc-currency-check.test.js. Only the pure pieces
// are exported: the checks themselves read the whole repo, so testing them
// directly would mean a test that fails whenever a doc legitimately changes.
// The bugs this tool actually shipped with — a stripper that desynced on a
// regex literal, a historical-marker window loose enough to suppress a real
// finding, and a test-count regex that couldn't cross a markdown blockquote
// line-wrap — all live in these functions, which is the argument for
// testing exactly them.
// -----------------------------------------------------------------------
module.exports = {
  declaredNamesFromSource,
  paragraphAround,
  docLevelStatus,
  normalizeBlockquotes,
  DOC_TOKEN_RE,
  blockedSurfaces,
  auditBlockedMentions,
  CONFIG,
};

if (require.main !== module) return;

// -----------------------------------------------------------------------
// Run everything
// -----------------------------------------------------------------------
checkDocumentedFunctionsExist();
checkCitedTestCounts();
checkDocumentedKeysAreLive();
checkCitationsInRange();
checkBlockedSurfacesNotPresentedAsLive();

if (AS_JSON) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const line = '─'.repeat(78);
  console.log(line);
  console.log(`doc-currency — ${findings.errors.length} error(s), ${findings.warnings.length} warning(s)`);
  console.log(line);
  if (findings.errors.length) {
    console.log('\nERRORS\n');
    findings.errors.forEach((f, i) => console.log(`${i + 1}. [${f.check}] ${f.message}\n`));
  }
  if (findings.warnings.length) {
    console.log('\nWARNINGS\n');
    findings.warnings.forEach((f, i) => console.log(`${i + 1}. [${f.check}] ${f.message}\n`));
  }
  if (!findings.errors.length && !findings.warnings.length) {
    console.log('\nClean.\n');
  }
}

process.exit(findings.errors.length > 0 ? 1 : 0);
