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
// opts.keepStrings: emit string-literal CONTENTS verbatim instead of blanking
// them, while still blanking comments. Check G needs that distinction — an
// API endpoint written in live code sits inside a string literal, and one
// left behind in a commented-out reference implementation does not, so
// blanking both makes the two indistinguishable. Everything else here (the
// regex-vs-division machinery in particular) is shared rather than copied
// into a second, weaker stripper — see tests/tools/doc-currency-check.test.js
// on what that cost the last time.
function stripCommentsAndStrings(src, opts) {
  const keepStrings = !!(opts && opts.keepStrings);
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
      out += keepStrings ? c : ' '; i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out += keepStrings ? src.substr(i, 2) : '  ';
          i += 2; continue;
        }
        if (keepStrings) out += src[i];
        else out += (src[i] === '\n') ? '\n' : ' ';
        i++;
      }
      if (i < n) { out += keepStrings ? src[i] : ' '; i++; }
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
// A chain like
//
//   google.script.run
//     .withSuccessHandler(resolve)
//     .withFailureHandler(err => reject(new Error((err && err.message))))
//     .lhPullData_({ domain });
//
// cannot be matched by a per-line regex, and it is how leader-hub and both
// cas-ccps dashboards write every one of their calls. So this walks the
// chain instead: from each `google.script.run`, step through `.name(...)`
// links, skipping balanced parens, until the chain ends.
//
// WHY THE STRIPPING MODE MATTERS, both halves of it:
//   - Comments MUST be blanked. Eight .gs files in kos-personal carry
//     `*   google.script.run.withSuccessHandler(fn).executeBootstrap()` in
//     a doc comment. Scanning raw text made those the ONLY thing this check
//     ever found — it was cross-referencing its own documentation and
//     reporting success.
//   - Strings MUST be kept (keepStrings). cas-ccps's dashboards serve their
//     client code from template literals inside .js files, so blanking
//     string contents deletes every real call site in the repo's largest
//     client surface.
// Getting either half wrong makes this check silently vacuous, which is
// what it was.
//
// Returns { calls: [{name, line}], unresolved: [line, ...] }. `unresolved`
// is a `google.script.run` whose chain has no resolvable link — dynamic
// dispatch, e.g. kos-personal's `const gsr = ... google.script.run` plus
// `runner[fn].apply(runner, args)`, where the function name arrives as a
// string at runtime. Those cannot be cross-referenced by any static pass,
// and saying so is better than counting the file as covered.
const RUN_CHAIN_SKIP = new Set([
  'withSuccessHandler', 'withFailureHandler', 'withUserObject', 'withLogger',
]);

function findGoogleScriptRunCalls(relPath, src) {
  const s = stripCommentsAndStrings(src, { keepStrings: true });
  const calls = [];
  const unresolved = [];
  const anchor = /google\.script\.run/g;
  let a;
  while ((a = anchor.exec(s))) {
    let i = a.index + a[0].length;
    let resolvedHere = 0;
    for (;;) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] !== '.') break;
      i++;
      const m = /^([A-Za-z_$][\w$]*)/.exec(s.slice(i, i + 120));
      if (!m) break;
      const name = m[1];
      i += name.length;
      while (i < s.length && /\s/.test(s[i])) i++;
      if (s[i] !== '(') {
        // A bare `.name` with no call — a property read, not an invocation.
        break;
      }
      let depth = 0;
      for (; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') { depth--; if (depth === 0) { i++; break; } }
      }
      if (!RUN_CHAIN_SKIP.has(name)) {
        calls.push({ name, line: lineAt(s, a.index) });
        resolvedHere++;
      }
    }
    if (resolvedHere === 0) unresolved.push(lineAt(s, a.index));
  }
  return { calls, unresolved };
}

function checkGoogleScriptRunCalls() {
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    const files = (def.files || []).concat(def.html || []);

    const called = new Map(); // fnName -> [{file, line}]
    const declared = new Set();
    const dynamic = []; // [{file, line}]

    for (const relPath of files) {
      if (!exists(relPath)) continue;
      const { calls, unresolved } = findGoogleScriptRunCalls(relPath, readFile(relPath));
      for (const c of calls) {
        if (!called.has(c.name)) called.set(c.name, []);
        called.get(c.name).push({ file: relPath, line: c.line });
      }
      // Only worth reporting when NOTHING in the file resolved. A bare
      // `google.script.run` is usually a truthiness guard
      // (`if (google.script.run)`, `const sameOrigin = ... && google.script.run`)
      // rather than a dispatch, and leader-hub's HTML is full of those
      // alongside 8 chains this check does resolve. Flagging a file that
      // reached the bridge and yielded no names is the honest signal;
      // flagging every guard in a covered file is noise. Known limitation:
      // a file with resolvable chains AND a genuine dynamic dispatch stays
      // silent about the latter.
      if (calls.length === 0 && unresolved.length > 0) {
        dynamic.push({ file: relPath, line: unresolved[0], count: unresolved.length });
      }
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

    for (const d of dynamic) {
      warn(
        'dynamic-server-dispatch',
        `${d.file} reaches google.script.run ${d.count} time(s) (first at line ${d.line}) and never names a server function in the expression — the name arrives at runtime (e.g. \`runner[fn].apply(runner, args)\` fed by \`callServer('someFunction', ...)\`). No static check can cross-reference those, so project "${projectName}"'s client calls through this path are NOT covered by this check. Reported so the gap is visible rather than looking like coverage; a rename on either side of a dynamic dispatch is caught by nothing here.`,
        d.file
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
// Check G — undeclared GCP dependencies.
//
// Nothing in this repo's default architecture needs a Cloud project: every
// system reaches Gemini through a hand-built Workspace Flow using the
// account's own built-in access (the Walled Garden / Bifurcation Boundary).
// That is not a stylistic preference — GCP access is a Workspace-admin
// decision nobody here controls, and on the ccpsnet.net account it is
// switched off, which is what made all 2,113 lines of cas-ccps/studio-steps/
// permanently unreachable AFTER they were written, unit-tested, and pushed.
// The failure mode is what makes this worth a linter: a custom step that
// needs a project doesn't error, it just never appears in Studio's picker.
//
// So this check finds the technical surfaces that actually require a
// project and demands each one have an entry in gcp-map.json. A declaration
// is not approval — it records that the dependency exists, whether it
// currently works, and what happens if it doesn't. An undeclared LIVE
// surface is an ERROR because it's a capability requirement nobody wrote
// down; an undeclared LATENT one (present but commented out) is a WARNING.
//
// LIVE vs LATENT is decided positionally, not by guessing: the surface is
// live if it survives comment-stripping at the same offset in the source.
// That's the whole reason stripCommentsAndStrings grew a keepStrings option
// — an endpoint in live code sits inside a string literal, and one left in
// a commented-out reference implementation does not, so the default
// (blank both) can't tell them apart. 25_WarmUpWriter.js is the real case:
// its callFlow4_ deliberately keeps a commented-out direct-Gemini block so
// Check E stays able to see the script.external_request requirement.
//
// Known edge: an endpoint written inside a REGEX literal is blanked by the
// stripper in both modes, so it classifies as latent (a warning) rather
// than live. Nothing in the repo does that today; if something starts
// matching endpoints by regex, it earns a declaration either way.
// -----------------------------------------------------------------------
const GCP_STATUSES = ['live-blocked', 'live-unverified', 'live-ok', 'latent'];

const GCP_PATTERNS = [
  // A Workspace Add-on exposing custom Studio steps. Scoped to .json
  // manifests on purpose: several .gs headers discuss workflowElements in
  // prose, and prose about a wall is not a dependency on it.
  { name: 'studio-custom-step', source: '"workflowElements"', jsonOnly: true },
  { name: 'gemini-api-endpoint', source: 'generativelanguage\\.googleapis\\.com' },
  { name: 'vertex-endpoint', source: 'aiplatform\\.googleapis\\.com' },
];

// Pure and path-only-by-extension, so tests can drive it with literal
// source strings instead of the whole repo — see tests/tools/gas-lint-gcp.test.js.
// Returns at most one finding per (file, pattern), live winning over latent.
function findGcpSurfaces(relPath, src) {
  const isJson = /\.json$/i.test(relPath);
  // Same length as src, so a match offset means the same thing in both.
  const executable = stripCommentsAndStrings(src, { keepStrings: true });
  const byPattern = new Map();

  for (const p of GCP_PATTERNS) {
    if (p.jsonOnly && !isJson) continue;
    const re = new RegExp(p.source, 'g');
    let m;
    while ((m = re.exec(src))) {
      // JSON has no comment syntax, so a hit in a manifest is always real.
      const live = isJson || executable.substr(m.index, m[0].length) === m[0];
      const status = live ? 'live' : 'latent';
      const prev = byPattern.get(p.name);
      if (prev && (prev.status === 'live' || status !== 'live')) continue;
      byPattern.set(p.name, {
        pattern: p.name, status, line: lineAt(src, m.index), evidence: m[0],
      });
    }
  }
  return [...byPattern.values()].sort((a, b) => a.line - b.line);
}

function checkGcpSurfaces() {
  let map;
  try { map = JSON.parse(readFile('tools/gas-lint/gcp-map.json')); }
  catch (e) {
    err('gcp-map-unreadable',
      `Could not read tools/gas-lint/gcp-map.json: ${e.message}. Without it this check ` +
      `cannot tell a declared GCP dependency from an undeclared one, so it is failing loudly ` +
      `rather than passing silently.`,
      'tools/gas-lint/gcp-map.json');
    return;
  }
  const declared = map.surfaces || {};

  for (const [relPath, def] of Object.entries(declared)) {
    if (GCP_STATUSES.indexOf(def.status) === -1) {
      err('gcp-bad-status',
        `gcp-map.json declares ${relPath} with status "${def.status}", which is not one of ` +
        `${GCP_STATUSES.join(', ')}. The status is what tells a reader whether this dependency ` +
        `works today; an unrecognized one weakens the map without looking broken.`,
        'tools/gas-lint/gcp-map.json');
    }
  }

  // Every file gas-lint already knows about, deduped — a manifest is shared
  // between a project's entry and its own listing.
  const scanned = new Set();
  for (const [projectName, def] of Object.entries(PROJECT_MAP)) {
    if (projectName.startsWith('_')) continue;
    for (const relPath of (def.files || []).concat(def.html || [])) scanned.add(relPath);
    if (def.manifest) scanned.add(def.manifest);
  }

  const seen = new Set();
  for (const relPath of [...scanned].sort()) {
    if (!exists(relPath)) continue;
    for (const hit of findGcpSurfaces(relPath, readFile(relPath))) {
      const def = declared[relPath];
      if (!def) {
        const where = `${relPath}:${hit.line}`;
        if (hit.status === 'live') {
          err('undeclared-gcp-dependency',
            `${where} depends on GCP (${hit.pattern}: ${hit.evidence}) with no entry in ` +
            `tools/gas-lint/gcp-map.json. A standard Cloud project is not available on every ` +
            `account this repo deploys to — it is confirmed disabled on ccpsnet.net — and the ` +
            `failure mode is silent (a custom step never appears in the picker; an API call ` +
            `401s inside a try/catch). Add a surfaces entry recording the status, what breaks ` +
            `without it, and the fallback, or use a native Flow step instead ` +
            `(cas-ccps/scripts/37_FlowInputBuilder.js is the worked example).`,
            relPath);
        } else {
          warn('undeclared-latent-gcp-dependency',
            `${where} carries a commented-out GCP dependency (${hit.pattern}: ${hit.evidence}) ` +
            `with no entry in tools/gas-lint/gcp-map.json. Nothing executes it, so this is a ` +
            `warning — but uncommenting it would need a Cloud project, and that is a decision ` +
            `worth being written down before someone makes it by accident.`,
            relPath);
        }
        continue;
      }

      seen.add(relPath);
      if (def.pattern !== hit.pattern) {
        warn('gcp-pattern-mismatch',
          `gcp-map.json declares ${relPath} as "${def.pattern}" but the surface found at ` +
          `${relPath}:${hit.line} is "${hit.pattern}" (${hit.evidence}). Either the file grew a ` +
          `second kind of GCP dependency or the declaration is describing the wrong one.`,
          relPath);
      } else if (hit.status === 'live' && def.status === 'latent') {
        err('gcp-latent-now-live',
          `gcp-map.json declares ${relPath} as "latent" — present but not executed — but the ` +
          `surface at ${relPath}:${hit.line} is now in live code. Uncommenting a GCP dependency ` +
          `is a real decision: confirm a Cloud project is actually available on the target ` +
          `account, then change the status to live-ok/live-unverified/live-blocked to match.`,
          relPath);
      } else if (hit.status === 'latent' && def.status !== 'latent') {
        warn('gcp-live-now-latent',
          `gcp-map.json declares ${relPath} as "${def.status}" but the surface at ` +
          `${relPath}:${hit.line} is commented out. If it was retired, "latent" is the honest ` +
          `status; if it was commented out to work around the wall, say so in why/if_unavailable.`,
          relPath);
      }
    }
  }

  for (const [relPath, def] of Object.entries(declared)) {
    if (def.scanned === false) continue; // declared for completeness, not a GAS surface
    if (seen.has(relPath)) continue;
    if (!exists(relPath)) {
      warn('gcp-stale-declaration',
        `gcp-map.json declares ${relPath}, which no longer exists. If the dependency is gone, ` +
        `remove the entry; if the file moved, update the path so the check keeps watching it.`,
        'tools/gas-lint/gcp-map.json');
    } else if (!scanned.has(relPath)) {
      warn('gcp-unscanned-declaration',
        `gcp-map.json declares ${relPath}, but no project in project-map.json lists that file, ` +
        `so Check G never scans it and the declaration is unenforced. Add it to the owning ` +
        `project's file set, or mark the entry "scanned": false the way ` +
        `kos-personal/inference-service/ is.`,
        'tools/gas-lint/gcp-map.json');
    } else {
      warn('gcp-stale-declaration',
        `gcp-map.json declares ${relPath} as a ${def.pattern} surface, but scanning it found no ` +
        `such dependency. The dependency was probably removed — good news, but the entry now ` +
        `overstates what this repo needs, so delete it (git history keeps the record).`,
        'tools/gas-lint/gcp-map.json');
    }
  }
}

// -----------------------------------------------------------------------
// Checks H and I — the two machine-checkable rules from
// meta/FLOW_DOCTRINE.md, declared in flow-map.json.
//
// Most of that doctrine is not checkable: "a canary must say what it did
// not test" is a judgement. These two are, and the difference matters more
// than the rules do — a practice that is only prose gets rediscovered, a
// practice that is a check gets enforced. Rule 7 lived in exactly one
// comment before Check H existed.
// -----------------------------------------------------------------------
const FLOW_MAP_PATH = 'tools/gas-lint/flow-map.json';

/**
 * Reads a column map out of source. Two shapes, because this repo uses both:
 *
 *   object  — `const TM08 = { CONFIG_ID: 0, UNIT_NAME: 1, ... };`
 *   prefix  — `const WQ25_QUEUE_ID = 0;` repeated, keyed by the suffix
 *
 * Returns { KEY: index } or null when the declaration isn't found. Comments
 * are stripped first so a commented-out index can't be read as live — the
 * same reason Check D strips them.
 *
 * Pure and path-free, so tests can drive it with literal source.
 */
function parseColumnMap(src, spec) {
  const stripped = stripCommentsAndStrings(src);
  const exclude = (spec && spec.exclude) || [];
  const out = {};

  if (spec && spec.object) {
    // Find `NAME = {` then take to the matching brace. Brace-depth rather
    // than a regex, because these literals span lines and carry comments.
    const at = stripped.search(new RegExp('\\b' + spec.object + '\\s*=\\s*\\{'));
    if (at === -1) return null;
    const open = stripped.indexOf('{', at);
    let depth = 0, close = -1;
    for (let i = open; i < stripped.length; i++) {
      if (stripped[i] === '{') depth++;
      else if (stripped[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close === -1) return null;
    const body = stripped.substring(open + 1, close);
    const re = /([A-Za-z_$][\w$]*)\s*:\s*(\d+)/g;
    let m;
    while ((m = re.exec(body))) {
      if (exclude.indexOf(m[1]) !== -1) continue;
      out[m[1]] = Number(m[2]);
    }
    return Object.keys(out).length ? out : null;
  }

  if (spec && spec.prefix) {
    const re = new RegExp('^[ \\t]*(?:const|var|let)\\s+' + spec.prefix +
      '([A-Za-z_$][\\w$]*)\\s*=\\s*(\\d+)\\s*;', 'gm');
    let m;
    while ((m = re.exec(stripped))) {
      if (exclude.indexOf(m[1]) !== -1) continue;
      out[m[1]] = Number(m[2]);
    }
    return Object.keys(out).length ? out : null;
  }

  return null;
}

/** How a declared map is referred to in a finding. */
function columnMapLabel(spec) {
  return spec.object ? spec.object : spec.prefix + '*';
}

// -----------------------------------------------------------------------
// Check H — column-map agreement.
//
// Compares every declared duplicate map of the same sheet on the keys they
// share. Disagreement is an ERROR: it is the drift class that made
// LEDGER.TEACHER_EMAIL return a person's name and cost a live session, and
// it never announces itself at runtime.
//
// Keys present in only one map are NOT a finding. A reader can legitimately
// name fewer columns than the writer — 37_FlowInputBuilder.js's
// FI_TM_COLUMNS_ names 13 of TeacherMatrix's 20 because it reads 13.
// Requiring parity there would report a false conflict on every run, which
// is how a check gets muted.
// -----------------------------------------------------------------------
function checkColumnMapAgreement() {
  let flowMap;
  try { flowMap = JSON.parse(readFile(FLOW_MAP_PATH)); }
  catch (e) {
    err('flow-map-unreadable',
      `Could not read ${FLOW_MAP_PATH}: ${e.message}. Checks H and I cannot run, so they are ` +
      `failing loudly rather than passing silently.`, FLOW_MAP_PATH);
    return;
  }

  for (const [group, def] of Object.entries(flowMap.columnMaps || {})) {
    const parsed = [];
    for (const spec of def.maps || []) {
      if (!exists(spec.file)) {
        warn('flow-map-stale', `${group}: declares a map in ${spec.file}, which no longer ` +
          `exists. Update ${FLOW_MAP_PATH}.`, FLOW_MAP_PATH);
        continue;
      }
      const map = parseColumnMap(readFile(spec.file), spec);
      if (!map) {
        // A rename is the likely cause, and it silently un-checks the group.
        warn('column-map-not-found',
          `${group}: could not find ${columnMapLabel(spec)} in ${spec.file}. If it was renamed, ` +
          `update ${FLOW_MAP_PATH} — until then this group is not being compared.`, spec.file);
        continue;
      }
      parsed.push({ spec, map });
    }

    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const a = parsed[i], b = parsed[j];
        const shared = Object.keys(a.map).filter(k => Object.prototype.hasOwnProperty.call(b.map, k));
        const conflicts = shared.filter(k => a.map[k] !== b.map[k]);
        if (!conflicts.length) continue;
        err('column-map-disagreement',
          `${group}: ${columnMapLabel(a.spec)} (${a.spec.file}) and ${columnMapLabel(b.spec)} ` +
          `(${b.spec.file}) disagree on ${conflicts.length} column(s): ` +
          conflicts.map(k => `${k} is ${a.map[k]} vs ${b.map[k]}`).join('; ') +
          `. One of them is reading the wrong field, silently — this is the drift class that ` +
          `made LEDGER.TEACHER_EMAIL return a person's name. The authoritative order is ` +
          `${def.authoritative || 'the code that writes the rows'}; derive from the writer and ` +
          `fix whichever map disagrees with it.`,
          a.spec.file);
      }
    }
  }
}

// -----------------------------------------------------------------------
// Check I — flow surface completeness.
//
// FLOW_DOCTRINE.md rule 9: "nothing came back" is one answer covering four
// causes — never built, trigger matches nothing, wrong columns, model call
// errored — and the third looks exactly like the first. Each cause needs its
// own check, so a declared flow surface missing one of those roles is a
// WARNING naming which question can no longer be answered.
//
// Warning rather than error on purpose: a flow mid-construction legitimately
// lacks some of these, and an error would make the linter something to work
// around while building. The declaration is the commitment; this is the
// reminder.
// -----------------------------------------------------------------------
const FLOW_ROLE_QUESTIONS = {
  materialize: 'what hands the flow its input',
  harvest: 'what applies the result',
  canary: 'does the Apps Script half work (with the Flow stubbed)',
  binding: 'are the Flow output columns bound to the right cells',
  liveness: 'has this flow EVER answered',
  fixture: 'does the flow have something to match, so a green run means something',
};

function checkFlowSurfaces() {
  let flowMap;
  try { flowMap = JSON.parse(readFile(FLOW_MAP_PATH)); }
  catch (e) { return; } // Check H already reported it.

  for (const [surface, def] of Object.entries(flowMap.flowSurfaces || {})) {
    const projectName = def.project;
    const project = PROJECT_MAP[projectName];
    if (!project) {
      err('flow-surface-bad-project',
        `${surface}: declares project "${projectName}", which is not in project-map.json.`,
        FLOW_MAP_PATH);
      continue;
    }

    const declared = new Set();
    for (const relPath of (project.files || [])) {
      if (!exists(relPath) || relPath.endsWith('.html')) continue;
      for (const d of findTopLevelDecls(relPath)) declared.add(d.name);
    }

    const missingRoles = [];
    // A role a flow genuinely does not have is declared away in "_note" —
    // leader-hub and kos-personal both legitimately lack a materialize step.
    // The warning below tells the reader to do exactly that, so the check has
    // to honour it; otherwise it is instructing them to do something that
    // does not work, which is how a check earns being ignored.
    const note = String(def._note || '');
    for (const role of Object.keys(FLOW_ROLE_QUESTIONS)) {
      const fn = def[role];
      if (!fn) {
        if (!note.includes(role)) missingRoles.push(role);
        continue;
      }
      if (!declared.has(fn)) {
        // A named-but-absent function is worse than an unnamed role: the
        // declaration claims the question is answered when it is not.
        err('flow-surface-missing-function',
          `${surface}: declares ${role} = ${fn}(), but no top-level function of that name ` +
          `exists in project "${projectName}". Either it was renamed — in which case ` +
          `${FLOW_MAP_PATH} is now claiming a check exists that does not — or it was never ` +
          `written.`, FLOW_MAP_PATH);
      }
    }
    if (missingRoles.length) {
      warn('flow-surface-incomplete',
        `${surface}: no ${missingRoles.join(', ')} declared. Unanswerable question(s): ` +
        missingRoles.map(r => `"${FLOW_ROLE_QUESTIONS[r]}"`).join('; ') +
        `. See meta/FLOW_DOCTRINE.md rule 9 — if a role genuinely does not apply to this ` +
        `flow, say so in a "_note" on its entry the way leader-hub and kos-personal do for ` +
        `materialize.`, FLOW_MAP_PATH);
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
  parseColumnMap,
  columnMapLabel,
  FLOW_ROLE_QUESTIONS,
  findGoogleScriptRunCalls,
  findGcpSurfaces,
  GCP_PATTERNS,
  GCP_STATUSES,
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
checkGcpSurfaces();
checkColumnMapAgreement();
checkFlowSurfaces();

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
