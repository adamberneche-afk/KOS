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
  // Tracks the last non-whitespace character/token emitted, so a `/` can
  // be told apart from division: a `/` starts a regex literal only where
  // a value can't legally precede it (after an operator, `(`, `,`, `[`,
  // `{`, `;`, `return`, `typeof`, or at the very start of the file).
  // Without this, a regex containing `{`/`}` (e.g. a `{2,4}` quantifier)
  // is left un-stripped and its braces get counted as real code braces,
  // throwing off every top-level-declaration check for the rest of the
  // file — this is exactly what let a real duplicate `resetProperties()`
  // (1_Config_And_Deploy.gs vs. 5_Error_And_Utilities.gs) go undetected
  // on gas-lint's first release.
  let lastSig = '';
  const REGEX_CONTEXT = /[=(:,[!&|?{};\n]|return|typeof|^$/;
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
      lastSig = quote;
      continue;
    }
    if (c === '/' && REGEX_CONTEXT.test(lastSig)) {
      let j = i + 1, inClass = false, closed = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { closed = true; break; }
        j++;
      }
      if (closed) {
        let k = j + 1;
        while (k < n && /[a-z]/i.test(src[k])) k++; // flags (g, i, m, ...)
        for (let m = i; m < k; m++) out += ' ';
        i = k;
        lastSig = '/';
        continue;
      }
      // Not actually a regex (no closing `/` before end of line) — fall
      // through and treat `/` as an ordinary character (division).
    }
    out += c;
    if (!/\s/.test(c)) lastSig = c;
    i++;
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

// Same DECL_RE, but at ANY brace depth — used by Check F below to avoid
// flagging a local closure (e.g. `const emit = msg => {...}` inside a
// function) as an undefined cross-project call. Check A intentionally
// stays top-level-only (that's the real collision surface for GAS's
// shared-scope crash); Check F cares about "is this name callable from
// where it's used," which a same-file local declaration always answers
// yes to regardless of depth.
function findAnyDepthDeclNames(relPath) {
  const raw = readFile(relPath);
  const stripped = stripCommentsAndStrings(raw);
  const names = new Set();
  for (const line of stripped.split('\n')) {
    const m = line.match(DECL_RE);
    if (m) names.add(m[1] || m[2]);
  }
  return names;
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

  // FIXED: this used to be a hardcoded list of 4 specific addendum paths.
  // All 4 got merged and archived by a later commit, so the list quietly
  // went stale (`.filter(exists)` just silently dropped all 4 — no error,
  // no warning, the middle "cfg-key-pending-merge" tier simply stopped
  // being able to fire for anything). Discovered dynamically now instead,
  // so a *future* unmerged addendum is picked up automatically rather than
  // requiring this file to be hand-edited every time one appears or gets
  // merged.
  const scriptsDirForAddenda = path.join(REPO_ROOT, 'cas-ccps/scripts');
  const addendaFiles = fs.readdirSync(scriptsDirForAddenda)
    .filter(f => f.endsWith('.js') && f.includes('_ADDENDUM') &&
      (f.startsWith('00_SharedConfig') || f.startsWith('19_ClonedSheetConfig')))
    .map(f => `cas-ccps/scripts/${f}`);

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
//
// FIXED: this used to hardcode kos-personal/8_WebApp_UI.html as the only
// file ever scanned for google.script.run calls. cas-ccps's own web apps
// (07_TeacherDashboard.js, 13_StudentDashboard.js) embed google.script.run
// calls inline in plain .js files instead of a separate .html — a
// different structural pattern this check simply never looked at. Now
// iterates every PROJECT_MAP entry so any project's calls get checked
// against that same project's declared server functions, regardless of
// whether the client-side code lives in an .html file or inline in .js.
// -----------------------------------------------------------------------
function checkGoogleScriptRunCalls() {
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    const files = (def.files || []).concat(def.html || []);

    const called = new Map(); // fnName -> [{file, line}]
    const declared = new Set();

    for (const relPath of files) {
      if (!exists(relPath)) continue;
      const raw = readFile(relPath);
      const lines = raw.split('\n');
      lines.forEach((line, i) => {
        const re = /google\.script\.run(?:\.\w+\([^)]*\))*\.(\w+)\s*\(/g;
        let m;
        while ((m = re.exec(line))) {
          const name = m[1];
          if (['withSuccessHandler', 'withFailureHandler', 'withUserObject'].includes(name)) continue;
          if (!called.has(name)) called.set(name, []);
          called.get(name).push({ file: relPath, line: i + 1 });
        }
      });
      if (!relPath.endsWith('.html')) {
        for (const d of findTopLevelDecls(relPath)) declared.add(d.name);
      }
    }

    for (const [name, locs] of called.entries()) {
      if (!declared.has(name)) {
        err(
          'missing-server-function',
          `google.script.run.${name}(...) is called from ${locs[0].file}:${locs[0].line} (+${locs.length - 1} more) but no top-level function "${name}" exists anywhere in project "${projectName}"'s file set.`,
          locs[0].file
        );
      }
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
// Check F — cross-project undefined function calls.
//
// The exact bug class that shipped three times in cas-ccps before this
// check existed: a file bound to project A calls a bare function that's
// only defined in a file bound to project B. GAS's per-project global
// scope means that's a ReferenceError at runtime, and nothing before this
// caught it — Check A only flags the OPPOSITE problem (the same name
// declared twice in one project's scope), not a name called-but-undefined.
//
// This is inherently heuristic (dynamic dispatch, computed property
// access, and any built-in global not yet in the allowlist below can all
// look like a "possibly undefined" call that isn't really a bug), so
// findings are WARNINGS, not errors — this check should never fail a
// build on a false positive. Grow ALLOWLIST from real findings as they
// come up, the same way scope-map.json documents its own gaps, rather
// than trying to enumerate every legitimate global up front.
//
// Known residual false-positive class, not worth chasing: a callback
// passed as a function PARAMETER (e.g. `const tryInstall = (name, fn) =>
// { fn(); ... }`) isn't a `const`/`let`/`var`/`function` declaration, so
// findAnyDepthDeclNames won't see it and this check will flag the call.
// Real cases seen on this check's first run: `fn`/`createFn` in
// kos-personal/1_Config_And_Deploy.gs and cas-ccps/20_SetupCheckpoint.js.
// Tracking parameter names would need real scope analysis, not worth it
// for a heuristic warning-only check — read each new warning once and
// judge for yourself rather than expecting zero false positives.
// -----------------------------------------------------------------------
const ALLOWLIST = new Set([
  // GAS built-in globals/services
  'SpreadsheetApp', 'DriveApp', 'DocumentApp', 'FormApp', 'MailApp', 'GmailApp',
  'CalendarApp', 'ScriptApp', 'Session', 'PropertiesService', 'Utilities',
  'Logger', 'console', 'ContentService', 'HtmlService', 'LockService',
  'CacheService', 'UrlFetchApp', 'Drive',
  // JS/ECMAScript built-ins commonly called as bare identifiers
  'Array', 'Object', 'JSON', 'Math', 'Date', 'String', 'Number', 'Boolean',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'Set', 'Map', 'Promise', 'Symbol', 'RegExp', 'Error',
  // JS keywords the naive call-site regex below can mistake for a call
  // (e.g. `if (...)`, `function foo(...)`, `return (...)`)
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new',
]);

function checkUndefinedFunctionCalls() {
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    const files = (def.files || []).filter(f => !f.endsWith('.html'));

    const declared = new Set();
    for (const relPath of files) {
      if (!exists(relPath)) continue;
      // Top-level names (visible cross-file, within this project) plus
      // any-depth names (visible within their own file, e.g. a local
      // closure) — see findAnyDepthDeclNames's comment for why both.
      for (const d of findTopLevelDecls(relPath)) declared.add(d.name);
      for (const name of findAnyDepthDeclNames(relPath)) declared.add(name);
    }

    for (const relPath of files) {
      if (!exists(relPath)) continue;
      const stripped = stripCommentsAndStrings(readFile(relPath));
      const lines = stripped.split('\n');
      // Requires the identifier NOT be preceded by `.` (excludes method
      // calls like `sheet.getRange(...)`) — this check only cares about
      // bare, top-level-scope function calls, which is exactly the shape
      // of bug it exists to catch.
      const callRe = /(?<!\.)\b([A-Za-z_$][\w$]*)\s*\(/g;
      lines.forEach((line, i) => {
        let m;
        while ((m = callRe.exec(line))) {
          const name = m[1];
          if (declared.has(name) || ALLOWLIST.has(name)) continue;
          warn(
            'possibly-undefined-in-project',
            `"${name}(...)" is called at ${relPath}:${i + 1} but is not declared in any file of project "${projectName}" and is not in check.js's built-in allowlist. May be a cross-project call bug (the class of bug this check exists for), or a legitimate global/allowlist gap.`,
            relPath
          );
        }
      });
    }
  }
}

// -----------------------------------------------------------------------
// Reusable primitives
//
// stripCommentsAndStrings() is the piece other tools most need and most
// easily get wrong: a naive version that handles quotes but not regex
// literals desyncs on the first `/IDENTITY_KEY\s*[:=]\s*['"].+['"]/` it
// meets and silently mis-parses the entire rest of the file. Exporting it
// keeps one implementation rather than several that drift.
//
// Guarded on require.main so that `require()`ing this file gives you the
// helpers without running the checks or calling process.exit().
// -----------------------------------------------------------------------
module.exports = {
  stripCommentsAndStrings,
  findTopLevelDecls,
  findAnyDepthDeclNames,
  lineAt,
  ALLOWLIST,
  DECL_RE,
};

if (require.main !== module) return;

// -----------------------------------------------------------------------
// Run everything
// -----------------------------------------------------------------------
checkDuplicateDeclarations();
checkKosPersonalCfgKeys();
checkCasCcpsConfigKeys();
checkGoogleScriptRunCalls();
checkOAuthScopes();
checkUndefinedFunctionCalls();

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
