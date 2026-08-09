#!/usr/bin/env node
// =============================================================================
// gas-lint — static checks for the GAS-based systems in this repo.
//
// Apps Script concatenates every file bound to one project into a single
// global scope. Nothing in the normal edit/commit workflow here (no clasp,
// no CI, no live GAS session) ever verifies that two files sharing a
// project don't redeclare the same name, that a CFG key read somewhere is
// actually defined somewhere, that every google.script.run call from the
// web app has a real server function behind it, or that every GAS service
// actually used is covered by the project's declared OAuth scopes. Every
// one of those has been a real, shipped bug in this repo. This script
// exists to catch that whole class going forward instead of relying on
// another full manual read-through.
//
// Usage:
//   node tools/gas-lint/check.js            human-readable report
//   node tools/gas-lint/check.js --json     machine-readable report
// Exit code is 1 if any ERROR-level finding exists, 0 otherwise (warnings
// don't fail the run).
//
// WHAT THIS IS NOT: a JS parser. It strips comments/strings with a small
// state machine and finds top-level declarations via brace-depth tracking
// on the stripped source — good enough for this codebase's consistent,
// unminified, un-transpiled style, not a substitute for actually loading
// the code. Treat findings as "worth a look," not as certified truth —
// especially the config-key checks, which are regex-heuristic by nature
// because the addendum-file pattern doesn't parse as normal JS at all
// (see the cas-ccps section below).
// =============================================================================

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_MAP = require('./project-map.json');
const SCOPE_MAP = require('./scope-map.json');
const AS_JSON = process.argv.includes('--json');

const findings = { errors: [], warnings: [] };
function err(check, message, where) { findings.errors.push({ check, message, where }); }
function warn(check, message, where) { findings.warnings.push({ check, message, where }); }

function readFile(relPath) {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}
function exists(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

// -----------------------------------------------------------------------
// Comment/string stripping — same length as input, so line numbers of
// whatever survives still line up with the original file.
// -----------------------------------------------------------------------
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += (src[i] === '\n') ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += ' '; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += (src[i] === '\n') ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += ' '; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}

function lineAt(src, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (src[k] === '\n') line++;
  return line;
}

// -----------------------------------------------------------------------
// Check A — duplicate top-level declarations within a shared GAS project
// -----------------------------------------------------------------------
const DECL_RE = /^[ \t]*(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/;

function findTopLevelDecls(relPath) {
  const raw = readFile(relPath);
  const stripped = stripCommentsAndStrings(raw);
  const lines = stripped.split('\n');
  const decls = [];
  let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const atTopBeforeThisLine = depth === 0;
    if (atTopBeforeThisLine) {
      const m = line.match(DECL_RE);
      if (m) decls.push({ name: m[1] || m[2], line: li + 1 });
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  }
  return decls;
}

function checkDuplicateDeclarations() {
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    const files = (def.files || []).concat(def.html || []);
    const seen = new Map(); // name -> [{file, line}]
    for (const relPath of files) {
      if (!exists(relPath)) {
        warn('missing-file', `${relPath} is listed in project "${projectName}" but does not exist — project-map.json is stale.`, relPath);
        continue;
      }
      if (relPath.endsWith('.html')) continue; // HTML client code isn't in GAS's server global scope
      for (const d of findTopLevelDecls(relPath)) {
        if (!seen.has(d.name)) seen.set(d.name, []);
        seen.get(d.name).push({ file: relPath, line: d.line });
      }
    }
    for (const [name, locs] of seen.entries()) {
      const distinctFiles = new Set(locs.map(l => l.file));
      if (distinctFiles.size > 1) {
        err(
          'duplicate-declaration',
          `"${name}" is declared at top level in ${locs.length} places across files sharing project "${projectName}" (${def._bound_to || 'see project-map.json'}). ` +
          `GAS merges these into one global scope — this is a parse-time crash (or a silent last-definition-wins shadow) the moment all these files are loaded together: ` +
          locs.map(l => `${l.file}:${l.line}`).join(', '),
          projectName
        );
      }
    }
  }
}

// -----------------------------------------------------------------------
// Check B — kos-personal CFG key usage vs. definition
// -----------------------------------------------------------------------
function checkKosPersonalCfgKeys() {
  const cfgFile = 'kos-personal/1_Config_And_Deploy.gs';
  if (!exists(cfgFile)) return;
  const src = readFile(cfgFile);

  // Top-level CFG.* keys: lines indented by exactly 2 spaces inside the
  // `const CFG = { ... };` block, of the shape `  KEY_NAME:`.
  const topKeys = new Set();
  const propKeys = new Set();
  let inCfg = false, inProp = false, propDepth = 0;
  for (const line of src.split('\n')) {
    if (/^const CFG = \{/.test(line)) { inCfg = true; continue; }
    if (!inCfg) continue;
    if (/^  PROP: \{/.test(line)) { inProp = true; propDepth = 1; continue; }
    if (inProp) {
      if (/\{/.test(line)) propDepth += (line.match(/\{/g) || []).length;
      if (/\}/.test(line)) propDepth -= (line.match(/\}/g) || []).length;
      const pm = line.match(/^    ([A-Za-z_][A-Za-z0-9_]*):/);
      if (pm) propKeys.add(pm[1]);
      if (propDepth <= 0) inProp = false;
      continue;
    }
    const m = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*):/);
    if (m) topKeys.add(m[1]);
    if (/^\};/.test(line)) break;
  }

  if (topKeys.size === 0) {
    warn('cfg-parse', `Could not find "const CFG = {" in ${cfgFile} — CFG key check skipped. The parser here expects that exact literal opening; if the file's style changed, update tools/gas-lint/check.js.`, cfgFile);
    return;
  }

  const filesToScan = fs.readdirSync(path.join(REPO_ROOT, 'kos-personal'), { withFileTypes: true })
    .filter(d => d.isFile() && (d.name.endsWith('.gs') || d.name.endsWith('.html')))
    .map(d => `kos-personal/${d.name}`);

  const usedTop = new Map();  // key -> [{file, line}]
  const usedProp = new Map();

  for (const relPath of filesToScan) {
    const raw = readFile(relPath);
    const lines = raw.split('\n');
    lines.forEach((line, i) => {
      let m;
      const propRe = /CFG\.PROP\.([A-Za-z_][A-Za-z0-9_]*)/g;
      while ((m = propRe.exec(line))) {
        if (!usedProp.has(m[1])) usedProp.set(m[1], []);
        usedProp.get(m[1]).push({ file: relPath, line: i + 1 });
      }
      const topRe = /CFG\.(?!PROP\.)([A-Za-z_][A-Za-z0-9_]*)/g;
      while ((m = topRe.exec(line))) {
        if (!usedTop.has(m[1])) usedTop.set(m[1], []);
        usedTop.get(m[1]).push({ file: relPath, line: i + 1 });
      }
    });
  }

  for (const [key, locs] of usedTop.entries()) {
    if (key === 'PROP') continue; // CFG.PROP itself, not a leaf key
    if (!topKeys.has(key)) {
      err('undefined-cfg-key', `CFG.${key} is used at ${locs[0].file}:${locs[0].line} (and ${locs.length - 1} more place(s)) but is not a top-level key in ${cfgFile}'s CFG object.`, locs[0].file);
    }
  }
  for (const [key, locs] of usedProp.entries()) {
    if (!propKeys.has(key)) {
      err('undefined-cfg-prop-key', `CFG.PROP.${key} is used at ${locs[0].file}:${locs[0].line} (and ${locs.length - 1} more place(s)) but is not defined in ${cfgFile}'s CFG.PROP object.`, locs[0].file);
    }
  }
}

// -----------------------------------------------------------------------
// Check C — cas-ccps getConfig_()/getSheetConfig_() key usage, three-tier:
// defined live / documented-only-in-an-unmerged-addendum / genuinely missing.
//
// The addendum files are, by this repo's own documented convention,
// patch notes (often literal "paste this over that function" instructions
// inside /* */ blocks) rather than mergeable source — so this check reads
// their RAW text (not comment-stripped) for `key:` patterns, since for
// these files the useful content IS inside the comments.
// -----------------------------------------------------------------------
function extractObjectKeys(src, startMarkerRe) {
  const keys = new Set();
  const startMatch = src.match(startMarkerRe);
  if (!startMatch) return keys;
  const from = startMatch.index + startMatch[0].length;
  // naive brace-matched slice from the opening `{` already consumed by the marker
  let depth = 1, i = from;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  const block = src.slice(from, i);
  const keyRe = /(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m;
  while ((m = keyRe.exec(block))) keys.add(m[1]);
  return keys;
}

function checkCasCcpsConfigKeys() {
  const baseFile = 'cas-ccps/scripts/00_SharedConfig.js';
  const clonedFile = 'cas-ccps/scripts/19_ClonedSheetConfig.js';
  if (!exists(baseFile) || !exists(clonedFile)) return;

  const liveGetConfig = extractObjectKeys(readFile(baseFile), /function getConfig_\s*\([^)]*\)\s*\{[\s\S]*?return\s*\{/);
  const liveGetSheetConfig = extractObjectKeys(readFile(clonedFile), /function getSheetConfig_\s*\([^)]*\)\s*\{[\s\S]*?return\s*\{/);
  const liveKeys = new Set([...liveGetConfig, ...liveGetSheetConfig]);

  const addendaFiles = [
    'cas-ccps/scripts/00_SharedConfig_M2_ADDENDUM_v2.js',
    'cas-ccps/scripts/00_SharedConfig_M4_ADDENDUM.js',
    'cas-ccps/scripts/19_ClonedSheetConfig_M5_ADDENDUM.js',
    'cas-ccps/scripts/19_ClonedSheetConfig_M6_ADDENDUM.js',
  ].filter(exists);

  const addendumKeys = new Map(); // key -> addendum file that documents it
  for (const f of addendaFiles) {
    const raw = readFile(f);
    const keyRe = /(?:^|[\s,{*])([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
    let m;
    while ((m = keyRe.exec(raw))) {
      if (!addendumKeys.has(m[1])) addendumKeys.set(m[1], f);
    }
  }

  // Collect cfg.* / cfg.tabs.* usages across every live (non-addendum,
  // non-archived) cas-ccps script.
  const scriptsDir = path.join(REPO_ROOT, 'cas-ccps/scripts');
  const allScripts = fs.readdirSync(scriptsDir)
    .filter(f => f.endsWith('.js') && !f.includes('_ADDENDUM'))
    .map(f => `cas-ccps/scripts/${f}`);

  const used = new Map(); // key -> [{file, line}]
  for (const relPath of allScripts) {
    const lines = readFile(relPath).split('\n');
    lines.forEach((line, i) => {
      const re = /\bcfg\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
      let m;
      while ((m = re.exec(line))) {
        if (m[1] === 'tabs') continue;
        if (!used.has(m[1])) used.set(m[1], []);
        used.get(m[1]).push({ file: relPath, line: i + 1 });
      }
    });
  }

  for (const [key, locs] of used.entries()) {
    if (liveKeys.has(key)) continue;
    if (addendumKeys.has(key)) {
      warn(
        'cfg-key-pending-merge',
        `cfg.${key} is read at ${locs[0].file}:${locs[0].line} (+${locs.length - 1} more) but is only documented in ${addendumKeys.get(key)}, not yet merged into ${baseFile}/${clonedFile}'s live return object. Deploying today without hand-merging that addendum first means this reads undefined.`,
        locs[0].file
      );
    } else {
      err(
        'undefined-cfg-key',
        `cfg.${key} is read at ${locs[0].file}:${locs[0].line} (+${locs.length - 1} more) but is not defined anywhere — not in the live getConfig_/getSheetConfig_ object, not documented in any addendum. Likely a typo or a removed key.`,
        locs[0].file
      );
    }
  }
}

// -----------------------------------------------------------------------
// Check D — google.script.run <-> server function cross-reference
// (kos-personal's 8_WebApp_UI.html is the only HTML in this repo that
// calls google.script.run; see tools/gas-lint/README.md)
// -----------------------------------------------------------------------
function checkGoogleScriptRunCalls() {
  const htmlFile = 'kos-personal/8_WebApp_UI.html';
  if (!exists(htmlFile)) return;
  const html = readFile(htmlFile);
  const called = new Map(); // fnName -> [{line}]
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    const re = /google\.script\.run(?:\.\w+\([^)]*\))*\.(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(line))) {
      const name = m[1];
      if (['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(name)) continue;
      if (!called.has(name)) called.set(name, []);
      called.get(name).push(i + 1);
    }
  });

  const gsFiles = fs.readdirSync(path.join(REPO_ROOT, 'kos-personal'))
    .filter(f => f.endsWith('.gs'))
    .map(f => `kos-personal/${f}`);
  const declared = new Set();
  for (const relPath of gsFiles) {
    for (const d of findTopLevelDecls(relPath)) declared.add(d.name);
  }

  for (const [name, callLines] of called.entries()) {
    if (!declared.has(name)) {
      err(
        'missing-server-function',
        `google.script.run.${name}(...) is called from ${htmlFile}:${callLines[0]} but no top-level function "${name}" exists in any kos-personal .gs file.`,
        htmlFile
      );
    }
  }
}

// -----------------------------------------------------------------------
// Check E — OAuth scope coverage (only for projects with a checked-in
// manifest that declares an explicit oauthScopes list)
// -----------------------------------------------------------------------
function checkOAuthScopes() {
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    if (!def.manifest || !exists(def.manifest)) continue;
    let manifest;
    try { manifest = JSON.parse(readFile(def.manifest)); }
    catch (e) { warn('manifest-parse', `Could not parse ${def.manifest}: ${e.message}`, def.manifest); continue; }
    if (!Array.isArray(manifest.oauthScopes)) continue; // no explicit list => GAS auto-detects, nothing to check

    const declaredScopes = new Set(manifest.oauthScopes);
    const files = (def.files || []).concat(def.html || []);
    for (const relPath of files) {
      if (!exists(relPath)) continue;
      const src = readFile(relPath);
      for (const [service, scopes] of Object.entries(SCOPE_MAP.services)) {
        const re = new RegExp(`\\b${service}\\.`);
        if (!re.test(src)) continue;
        const missing = scopes.filter(s => !declaredScopes.has(s));
        if (missing.length > 0) {
          err(
            'missing-oauth-scope',
            `${relPath} calls ${service}.* but project "${projectName}"'s manifest (${def.manifest}) does not declare: ${missing.join(', ')}. ` +
            `Once a manifest lists oauthScopes explicitly, GAS stops auto-detecting — this call will fail authorization at runtime, typically silently if it's wrapped in a try/catch.` +
            (service === 'Session' ? ' (Session note: this tool flags any Session.* call conservatively — see scope-map.json._notes.Session.)' : ''),
            relPath
          );
        }
      }
    }
  }
}

// -----------------------------------------------------------------------
// Run everything
// -----------------------------------------------------------------------
checkDuplicateDeclarations();
checkKosPersonalCfgKeys();
checkCasCcpsConfigKeys();
checkGoogleScriptRunCalls();
checkOAuthScopes();

if (AS_JSON) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const line = '─'.repeat(78);
  console.log(line);
  console.log(`gas-lint — ${findings.errors.length} error(s), ${findings.warnings.length} warning(s)`);
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
