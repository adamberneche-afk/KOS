#!/usr/bin/env node
'use strict';
/**
 * tools/setup-guide/build.js
 * ===========================
 * Writes cas-ccps/docs/SETUP_GUIDE_REFERENCE.md, the reference half of the
 * CAS setup guide (packaging step 2, meta/PLAN_2026-11.md), from the code:
 *
 *   - the cas-ccps Apps Script projects: what each is bound to, how many
 *     files it holds, how run.js pushes it (tools/gas-lint/project-map.json,
 *     tools/clasp-sync/run.js's MANIFEST);
 *   - each project's manifest: OAuth scopes, advanced services, libraries,
 *     web app settings, add-on (cas-ccps/clasp/manifests/);
 *   - the Script Properties each project reads, with the default at the
 *     read where there is one, whether code writes it, and whether the
 *     Central Ledger's _CONFIG tab can supply it;
 *   - the triggers each project installs: handler, installer, schedule;
 *   - the Studio Flows and their checks (tools/gas-lint/flow-map.json, the
 *     sync*BuildSpec functions, the docs that name them).
 *
 * The hand-written half, the steps in order, is cas-ccps/docs/SETUP_GUIDE.md.
 *
 * Honest by design: anything it cannot resolve statically (a property key
 * built at run time, a trigger handler passed in as a parameter) is listed
 * under "Not resolved", never guessed. No Drive or library IDs are printed.
 *
 * USAGE
 *   node tools/setup-guide/build.js            # rewrite the reference
 *   node tools/setup-guide/build.js --check    # exit 1 if the committed file is stale
 *   node tools/setup-guide/build.js --out <p>  # write (or --check) another path
 *
 * Node built-ins only.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_REL = 'cas-ccps/docs/SETUP_GUIDE_REFERENCE.md';
const PREFIX = 'cas-ccps:';

const { stripCommentsAndStrings } = require('../gas-lint/check.js');

// ---------------------------------------------------------------------------
// Source parsing
// ---------------------------------------------------------------------------

/**
 * One source file, parsed once. `code` has comments blanked and strings
 * kept; `bare` has both blanked (for brace matching). Same length as the
 * source, so an index means the same place in all three.
 */
function parseSource(rel, src) {
  const code = stripCommentsAndStrings(src, { keepStrings: true });
  const bare = stripCommentsAndStrings(src);
  return { rel, base: path.basename(rel), src, code, bare, functions: findFunctions(code, bare), consts: findTopConsts(code, bare) };
}

function matchClose(bare, openIdx) {
  const open = bare[openIdx];
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 0;
  for (let k = openIdx; k < bare.length; k++) {
    const c = bare[k];
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/** Every `function name(params) { ... }` declaration, nested ones included. */
function findFunctions(code, bare) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(bare)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(bare, open);
    if (close === -1) continue;
    const params = code.slice(m.index, open).replace(/^[^(]*\(/, '').replace(/\)\s*$/, '')
      .split(',').map((p) => p.replace(/=.*$/, '').trim()).filter(Boolean);
    out.push({ name: m[1], params, start: m.index, open, end: close });
  }
  return out;
}

/** Top-level `const|let|var NAME = <string|array|object>` values, as raw text. */
function findTopConsts(code, bare) {
  const out = {};
  const re = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/gm;
  let m;
  // Matched on `code` (strings kept), since in `bare` the `\s*` after `=`
  // would run on through a blanked string; a match inside a string is skipped.
  while ((m = re.exec(code)) !== null) {
    if (bare[m.index] !== code[m.index]) continue;
    const v = m.index + m[0].length;
    out[m[1]] = readValue(code, bare, v);
  }
  return out;
}

/** The literal starting at `i`: a string, an array or object (raw), a number, or null. */
function readValue(code, bare, i) {
  const c = code[i];
  if (c === '"' || c === "'") {
    const end = code.indexOf(c, i + 1);
    if (end === -1) return null;
    // Only a whole literal: `"PREFIX_" + day` is an expression, not a key.
    if (!/^[ \t]*(?:[;,)\]}\n]|$)/.test(code.slice(end + 1, end + 40))) return { kind: 'expr' };
    return { kind: 'string', value: code.slice(i + 1, end) };
  }
  if (c === '[' || c === '{') {
    const end = matchClose(bare, i);
    return end === -1 ? null : { kind: c === '[' ? 'array' : 'object', raw: code.slice(i, end + 1), bareRaw: bare.slice(i, end + 1) };
  }
  const num = /^-?\d+(?:\.\d+)?/.exec(code.slice(i, i + 20));
  if (num) return { kind: 'number', value: num[0] };
  return null;
}

/** The innermost function containing index `i`, or null for top level. */
function enclosingFunction(file, i) {
  let best = null;
  for (const f of file.functions) {
    if (f.open < i && i < f.end && (!best || f.open > best.open)) best = f;
  }
  return best;
}

/** String elements of an array literal, or objects' `key: literal` maps. */
function arrayElements(value) {
  if (!value || value.kind !== 'array') return null;
  const inner = value.raw.slice(1, -1);
  const bareInner = value.bareRaw.slice(1, -1);
  if (bareInner.indexOf('{') === -1) {
    const strings = [];
    const re = /"([^"]*)"|'([^']*)'/g;
    let m;
    while ((m = re.exec(inner)) !== null) strings.push(m[1] !== undefined ? m[1] : m[2]);
    return { strings };
  }
  const objects = [];
  for (let k = 0; k < bareInner.length; k++) {
    if (bareInner[k] !== '{') continue;
    const end = matchClose(bareInner, k);
    if (end === -1) break;
    objects.push(objectFields(inner.slice(k, end + 1)));
    k = end;
  }
  return { objects };
}

function objectFields(raw) {
  const fields = {};
  const re = /([A-Za-z_$][\w$]*)\s*:\s*("([^"]*)"|'([^']*)'|-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    fields[m[1]] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[2];
  }
  return fields;
}

/** A project's files, parsed, plus a merged view of its top-level constants. */
function loadProject(rels, readFile) {
  const files = rels.map((rel) => parseSource(rel, readFile(rel)));
  const consts = {};
  const functions = {};
  files.forEach((f) => {
    Object.keys(f.consts).forEach((k) => { if (!(k in consts)) consts[k] = f.consts[k]; });
    f.functions.forEach((fn) => { if (!(fn.name in functions)) functions[fn.name] = { file: f, fn }; });
  });
  return { files, consts, functions };
}

/**
 * What an identifier inside function `fn` can stand for: a string constant
 * (top level or local), or the elements of an array it loops over.
 * Returns { strings: [...] } or { objects: [...] } or null.
 */
function resolveIdentifier(project, file, fn, ident) {
  const body = fn ? file.code.slice(fn.open, fn.end) : '';
  const bareBody = fn ? file.bare.slice(fn.open, fn.end) : '';
  const local = findDecl(body, bareBody, ident);
  if (local) {
    const v = readValue(body, bareBody, local.index + local[0].length);
    if (v && v.kind === 'string') return { strings: [v.value], via: 'a local constant' };
    if (v && v.kind === 'array') return Object.assign({ via: 'a local list' }, arrayElements(v));
  }
  const top = project.consts[ident];
  if (top && top.kind === 'string') return { strings: [top.value], via: 'the constant ' + ident };
  // A loop variable: for (const v of LIST) / LIST.forEach(function (v) / LIST.forEach((v) =>
  const loopRes = [
    new RegExp('for\\s*\\(\\s*(?:const|let|var)\\s+' + escapeRe(ident) + '\\s+of\\s+([A-Za-z_$][\\w$]*)\\s*\\)'),
    new RegExp('([A-Za-z_$][\\w$]*)\\s*\\.\\s*forEach\\s*\\(\\s*function\\s*\\(\\s*' + escapeRe(ident) + '\\b'),
    new RegExp('([A-Za-z_$][\\w$]*)\\s*\\.\\s*forEach\\s*\\(\\s*\\(?\\s*' + escapeRe(ident) + '\\s*\\)?\\s*=>'),
  ];
  for (const re of loopRes) {
    const m = re.exec(bareBody.length ? body : '');
    if (!m) continue;
    const listName = m[1];
    const listLocal = findDecl(body, bareBody, listName);
    let list = null;
    let via = '';
    if (listLocal) { list = readValue(body, bareBody, listLocal.index + listLocal[0].length); via = 'a local list'; }
    else if (project.consts[listName]) { list = project.consts[listName]; via = 'the list ' + listName; }
    const els = arrayElements(list);
    if (els) return Object.assign({ via }, els);
  }
  return null;
}

/** A `const|let|var NAME =` declaration in code (not inside a string). */
function findDecl(code, bare, name) {
  const re = new RegExp('(?:const|let|var)\\s+' + escapeRe(name) + '\\s*=\\s*', 'g');
  let m;
  while ((m = re.exec(code)) !== null) if (bare[m.index] === code[m.index]) return m;
  return null;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/** The argument text of the call whose `(` is at `openIdx`. */
function callArgs(file, openIdx) {
  const close = matchClose(file.bare, openIdx);
  if (close === -1) return null;
  return { text: file.code.slice(openIdx + 1, close).trim(), close };
}

function splitArgs(text) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (const c of text) {
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const STRING_LIT = /^(?:"([^"]*)"|'([^']*)')$/;
function literalString(expr) {
  const m = STRING_LIT.exec(String(expr).trim());
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}

// ---------------------------------------------------------------------------
// Script Properties
// ---------------------------------------------------------------------------

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

/** The default written right after a read: `getProperty("X") || <literal>`. */
function defaultAfter(file, closeIdx) {
  const m = /^\s*\|\|\s*("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?|[A-Za-z_$][\w$.]*)(\s*\()?/.exec(file.code.slice(closeIdx + 1, closeIdx + 120));
  if (!m) return '';
  const lit = literalString(m[1]);
  if (lit === '') return '';
  if (lit !== null) return quote(lit);
  return m[2] ? 'computed: `' + m[1] + '(…)`' : '`' + m[1] + '`';
}

/**
 * Functions that read a Script Property named by one of their parameters
 * (`function _fmsProp_(key) { return ...getProperty(key); }`). A call with a
 * literal first argument is then a read of that key.
 */
function findPropertyHelpers(project) {
  const helpers = {};
  project.files.forEach((file) => {
    file.functions.forEach((fn) => {
      const body = file.code.slice(fn.open, fn.end);
      fn.params.forEach((p, idx) => {
        if (new RegExp('\\.getProperty\\(\\s*' + escapeRe(p) + '\\s*\\)').test(body)) {
          const fallbackIdx = fn.params.findIndex((q) => /^(fallback|def|dflt|defaultValue)$/i.test(q));
          const writes = new RegExp('\\.setProperty\\(\\s*' + escapeRe(p) + '\\s*,').test(body);
          helpers[fn.name] = { keyIdx: idx, fallbackIdx, writes, file: file.base };
        }
      });
    });
  });
  return helpers;
}

/**
 * Every Script Property read in a project. Returns
 * { keys: Map<key, {reads:Set, defaults:Set, files:Set}>, unresolved: [], writes: Map<key, Set<file>> }.
 */
function scanProperties(project) {
  const keys = new Map();
  const unresolved = [];
  const writes = new Map();
  const add = (key, how, file, dflt) => {
    if (!keys.has(key)) keys.set(key, { reads: new Set(), defaults: new Set(), files: new Set() });
    const e = keys.get(key);
    e.reads.add(how);
    e.files.add(file);
    if (dflt) e.defaults.add(dflt);
  };
  const addWrite = (key, file) => {
    if (!writes.has(key)) writes.set(key, new Set());
    writes.get(key).add(file);
  };
  const helpers = findPropertyHelpers(project);

  project.files.forEach((file) => {
    // Direct reads.
    const re = /\.getProperty\s*\(/g;
    let m;
    while ((m = re.exec(file.code)) !== null) {
      const args = callArgs(file, m.index + m[0].length - 1);
      if (!args) continue;
      const fn = enclosingFunction(file, m.index);
      // A helper's own read of its parameter is counted at its call sites.
      if (fn && helpers[fn.name] && fn.params[helpers[fn.name].keyIdx] === args.text) continue;
      const lit = literalString(args.text);
      if (lit !== null) { add(lit, 'direct', file.base, defaultAfter(file, args.close)); continue; }
      if (args.text === '') continue; // getProperties()-style no-arg call: not a key
      resolveKeyExpr(project, file, fn, args.text, (key, via) => add(key, via, file.base, defaultAfter(file, args.close)),
        () => unresolved.push({ file: file.base, fn: fn ? fn.name : '(top level)', expr: 'getProperty(' + args.text + ')' }));
    }
    // Reads through a helper.
    Object.keys(helpers).forEach((h) => {
      const hre = new RegExp('(?<![\\w$.])' + escapeRe(h) + '\\s*\\(', 'g');
      let hm;
      while ((hm = hre.exec(file.code)) !== null) {
        const before = file.code.slice(Math.max(0, hm.index - 9), hm.index);
        if (/function\s*$/.test(before)) continue;
        const args = callArgs(file, hm.index + hm[0].length - 1);
        if (!args) continue;
        const parts = splitArgs(args.text);
        const keyExpr = parts[helpers[h].keyIdx];
        if (keyExpr === undefined) continue;
        const fb = helpers[h].fallbackIdx >= 0 ? (parts[helpers[h].fallbackIdx] || '') : '';
        const fn = enclosingFunction(file, hm.index);
        if (fn && fn.name === h) continue;
        const lit = literalString(keyExpr);
        if (lit !== null) {
          add(lit, 'via ' + h + '()', file.base, fb);
          if (helpers[h].writes) addWrite(lit, file.base);
          continue;
        }
        resolveKeyExpr(project, file, fn, keyExpr, (key) => {
          add(key, 'via ' + h + '()', file.base, fb);
          if (helpers[h].writes) addWrite(key, file.base);
        },
          () => unresolved.push({ file: file.base, fn: fn ? fn.name : '(top level)', expr: h + '(' + keyExpr + ')' }));
      }
    });
    // Writes: setProperty("X", ...), setProperty(CONST, ...), setProperties({ X: ... }).
    const wre = /\.setProperty\s*\(/g;
    while ((m = wre.exec(file.code)) !== null) {
      const args = callArgs(file, m.index + m[0].length - 1);
      if (!args) continue;
      const keyExpr = splitArgs(args.text)[0] || '';
      const lit = literalString(keyExpr);
      if (lit !== null) { addWrite(lit, file.base); continue; }
      const fn = enclosingFunction(file, m.index);
      resolveKeyExpr(project, file, fn, keyExpr, (key) => addWrite(key, file.base), () => {});
    }
    const pre = /\.setProperties\s*\(\s*\{/g;
    while ((m = pre.exec(file.code)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchClose(file.bare, open);
      if (close === -1) continue;
      const raw = file.code.slice(open, close + 1);
      const kre = /(?:^|[{,\s])(?:"([A-Z][A-Z0-9_]*)"|'([A-Z][A-Z0-9_]*)'|([A-Z][A-Z0-9_]*))\s*:/g;
      let km;
      while ((km = kre.exec(raw)) !== null) addWrite(km[1] || km[2] || km[3], file.base);
    }
  });
  return { keys, unresolved, writes };
}

/** Resolves a key expression to one or more keys, or calls onFail. */
function resolveKeyExpr(project, file, fn, expr, onKey, onFail) {
  const ident = /^[A-Za-z_$][\w$]*$/.exec(expr);
  const member = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(expr);
  let resolved = null;
  if (ident) {
    const r = resolveIdentifier(project, file, fn, expr);
    if (r && r.strings) resolved = r.strings.map((s) => [s, 'via ' + r.via]);
  } else if (member) {
    const r = resolveIdentifier(project, file, fn, member[1]);
    if (r && r.objects) {
      const vals = r.objects.map((o) => o[member[2]]).filter((v) => v !== undefined);
      if (vals.length) resolved = vals.map((s) => [s, 'via ' + r.via]);
    }
  }
  const good = resolved && resolved.filter(([k]) => KEY_RE.test(k));
  if (good && good.length) good.forEach(([k, via]) => onKey(k, via));
  else onFail();
}

/**
 * Keys read through 00_SharedConfig.js's resolver (Script Property, then the
 * attached sheet, then the Ledger's _CONFIG tab): getConfig_()'s fields with
 * their defaults, SCHOOL_DEFAULTS, `.values.X`, pivotFlagFor_("X"), and the
 * SHARED_CONFIG_KEYS a _CONFIG row may supply.
 */
function scanResolverKeys(sharedFile, allFiles) {
  const keys = new Map();
  const add = (key, how, dflt) => {
    if (!KEY_RE.test(key)) return;
    if (!keys.has(key)) keys.set(key, { how: new Set(), defaults: new Set(), files: new Set() });
    keys.get(key).how.add(how);
    if (dflt) keys.get(key).defaults.add(dflt);
  };
  const getConfig = sharedFile.functions.find((f) => f.name === 'getConfig_');
  if (getConfig) {
    const body = sharedFile.code.slice(getConfig.open, getConfig.end);
    const re = /\bp\.([A-Z][A-Z0-9_]*)\b(\s*\)?\s*\|\|\s*("[^"]*"|'[^']*'|[A-Za-z_$][\w$.]*))?/g;
    let m;
    while ((m = re.exec(body)) !== null) {
      let d = '';
      if (m[3]) { const lit = literalString(m[3]); d = lit === null ? m[3] : lit === '' ? '' : quote(lit); }
      add(m[1], 'getConfig_()', d);
    }
  }
  const school = sharedFile.consts.SCHOOL_DEFAULTS;
  if (school && school.kind === 'object') {
    Object.entries(objectFields(school.raw)).forEach(([k, v]) => add(k, 'schoolProfile_()', 'SCHOOL_DEFAULTS: ' + quote(shorten(v, 48))));
  }
  const shared = sharedFile.consts.SHARED_CONFIG_KEYS;
  const sharedKeys = new Set((arrayElements(shared) || {}).strings || []);
  allFiles.forEach((file) => {
    let m;
    const vre = /\.values\s*(?:\.\s*([A-Z][A-Z0-9_]*)\b|\[\s*(?:"([A-Z][A-Z0-9_]*)"|'([A-Z][A-Z0-9_]*)')\s*\])/g;
    while ((m = vre.exec(file.code)) !== null) {
      add(m[1] || m[2] || m[3], 'resolved settings', '');
      keys.get(m[1] || m[2] || m[3]).files.add(file.base);
    }
    const pre = /\bpivotFlagFor_\s*\(\s*(?:"([A-Z][A-Z0-9_]*)"|'([A-Z][A-Z0-9_]*)')/g;
    while ((m = pre.exec(file.code)) !== null) {
      add(m[1] || m[2], 'pivotFlagFor_()', 'off');
      keys.get(m[1] || m[2]).files.add(file.base);
    }
  });
  sharedKeys.forEach((k) => { if (!keys.has(k)) add(k, 'resolved settings', ''); });
  return { keys, sharedKeys };
}

/** A string literal as the source spells it (escapes untouched). */
function quote(s) {
  return '"' + s + '"';
}

function shorten(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

const WEEKDAY = { MONDAY: 'Mondays', TUESDAY: 'Tuesdays', WEDNESDAY: 'Wednesdays', THURSDAY: 'Thursdays', FRIDAY: 'Fridays', SATURDAY: 'Saturdays', SUNDAY: 'Sundays' };

/** A readable schedule from a builder chain, with per-entry values substituted. */
function describeSchedule(chain, entry, project) {
  const calls = [];
  const re = /\.\s*([A-Za-z]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let m;
  while ((m = re.exec(chain)) !== null) calls.push({ name: m[1], arg: m[2].trim() });
  const unresolved = [];
  const val = (expr) => {
    if (expr === '') return '';
    if (/^-?\d+$/.test(expr)) return Number(expr);
    const mem = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(expr);
    if (mem && entry && entry[mem[2]] !== undefined) return Number(entry[mem[2]]);
    const c = project.consts[expr];
    if (c && c.kind === 'number') return Number(c.value);
    unresolved.push(expr);
    return '`' + expr + '` (computed)';
  };
  let kind = '', every = '', at = '', minute = '', day = '', once = '';
  calls.forEach((c) => {
    switch (c.name) {
      case 'timeBased': kind = 'time'; break;
      case 'everyMinutes': every = 'every ' + val(c.arg) + ' min'; break;
      case 'everyHours': every = 'every ' + val(c.arg) + ' h'; break;
      case 'everyDays': { const n = val(c.arg); every = n === 1 ? 'daily' : 'every ' + n + ' days'; break; }
      case 'everyWeeks': { const n = val(c.arg); every = n === 1 ? 'weekly' : 'every ' + n + ' weeks'; break; }
      case 'onWeekDay': { const d = /WeekDay\.([A-Z]+)/.exec(c.arg); day = d ? WEEKDAY[d[1]] : '(' + c.arg + ')'; if (!d) unresolved.push(c.arg); break; }
      case 'atHour': at = val(c.arg); break;
      case 'nearMinute': minute = val(c.arg); break;
      case 'after': once = 'once, after ' + (/^\d+$/.test(c.arg) ? c.arg + ' ms' : c.arg); break;
      case 'at': once = 'once, at a set time'; break;
      case 'forSpreadsheet': kind = 'spreadsheet'; break;
      case 'forForm': kind = 'form'; break;
      case 'forDocument': kind = 'document'; break;
      case 'onFormSubmit': every = 'on form submit'; break;
      case 'onEdit': every = 'on edit'; break;
      case 'onOpen': every = 'on open'; break;
      case 'onChange': every = 'on change'; break;
      default: break;
    }
  });
  const parts = [];
  if (once) parts.push(once);
  if (day) parts.push(day);
  if (every && !(day && every === 'weekly')) parts.push(every);
  if (at !== '') parts.push('about ' + clock(at, minute));
  if (kind && kind !== 'time') parts.push('(' + kind + ')');
  return { text: parts.join(', ') || 'see the code', unresolved };
}

function clock(h, m) {
  if (typeof h !== 'number') return String(h);
  const mm = typeof m === 'number' ? String(m).padStart(2, '0') : '00';
  return String(h).padStart(2, '0') + ':' + mm;
}

/** Every ScriptApp.newTrigger(...) in a project, resolved where it can be. */
function scanTriggers(project) {
  const out = [];
  const unresolved = [];
  project.files.forEach((file) => {
    const re = /ScriptApp\s*\.\s*newTrigger\s*\(/g;
    let m;
    while ((m = re.exec(file.code)) !== null) {
      const args = callArgs(file, m.index + m[0].length - 1);
      if (!args) continue;
      const rest = file.code.slice(args.close + 1, args.close + 600);
      const end = rest.search(/\.\s*create\s*\(\s*\)/);
      const chain = end === -1 ? rest : rest.slice(0, end);
      const fn = enclosingFunction(file, m.index);
      const installer = fn ? fn.name : '(top level)';
      const lit = literalString(args.text);
      const handlers = [];
      if (lit !== null) handlers.push({ name: lit, entry: null });
      else {
        const ident = /^[A-Za-z_$][\w$]*$/.test(args.text);
        const member = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(args.text);
        if (ident) {
          const r = resolveIdentifier(project, file, fn, args.text);
          if (r && r.strings) r.strings.forEach((s) => handlers.push({ name: s, entry: null }));
        } else if (member) {
          const r = resolveIdentifier(project, file, fn, member[1]);
          if (r && r.objects) r.objects.forEach((o) => { if (o[member[2]]) handlers.push({ name: o[member[2]], entry: o }); });
        }
      }
      if (!handlers.length) {
        unresolved.push({ file: file.base, fn: installer, expr: 'newTrigger(' + args.text + ')', schedule: describeSchedule(chain, null, project).text });
        continue;
      }
      handlers.forEach((h) => {
        const s = describeSchedule(chain, h.entry, project);
        out.push({ handler: h.name, installer, file: file.base, schedule: s.text, unresolved: s.unresolved });
      });
    }
  });
  return { triggers: out, unresolved };
}

/** For an installer hidden from the Run dropdown (trailing _), the public functions that call it. */
function publicCallers(project, name) {
  if (!/_$/.test(name)) return [];
  const callers = [];
  project.files.forEach((file) => {
    const re = new RegExp('(?<![\\w$.])' + escapeRe(name) + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(file.code)) !== null) {
      const fn = enclosingFunction(file, m.index);
      if (fn && fn.name !== name && !/_$/.test(fn.name) && callers.indexOf(fn.name) === -1) callers.push(fn.name);
    }
  });
  return callers.sort();
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

function cell(s) {
  // Backslashes first, so an escape this adds is never itself re-escaped
  // (Markdown would otherwise read `\|` in the text as an escaped pipe).
  return String(s === undefined || s === null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function table(headers, rows) {
  const out = ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|'];
  rows.forEach((r) => out.push('| ' + r.map(cell).join(' | ') + ' |'));
  return out.join('\n');
}

function claspType(boundTo) {
  const b = String(boundTo || '');
  if (/web app|standalone/i.test(b)) return 'standalone';
  if (/spreadsheet|sheet/i.test(b)) return 'sheets';
  if (/\bdoc\b|google doc/i.test(b)) return 'docs';
  return '(not resolved)';
}

function scopeName(s) {
  return String(s).replace(/^https:\/\/www\.googleapis\.com\/auth\//, '');
}

function defaultReadFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

/**
 * Builds the whole reference from the repo. `opts.readFile`, `opts.projectMap`,
 * `opts.runManifest`, `opts.flowMap`, `opts.readManifest`, `opts.listDocs` let
 * tests drive it with fixtures.
 */
function buildReference(opts) {
  opts = opts || {};
  const readFile = opts.readFile || defaultReadFile;
  const projectMap = opts.projectMap || JSON.parse(readFile('tools/gas-lint/project-map.json'));
  const runManifest = opts.runManifest || require('../clasp-sync/run.js').MANIFEST;
  const flowMap = opts.flowMap || JSON.parse(readFile('tools/gas-lint/flow-map.json'));
  const readManifest = opts.readManifest || ((rel) => JSON.parse(readFile(rel)));
  const exists = opts.exists || ((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
  const listDocs = opts.listDocs || (() => fs.readdirSync(path.join(REPO_ROOT, 'cas-ccps/docs'))
    .filter((f) => /\.(md|html)$/.test(f) && !/^SETUP_GUIDE_REFERENCE\.md$/.test(f)).sort()
    .map((f) => 'cas-ccps/docs/' + f));

  const names = Object.keys(projectMap).filter((k) => k.startsWith(PREFIX)).sort();
  const projects = {};
  names.forEach((k) => {
    const def = projectMap[k];
    const rels = [...(def.files || []), ...(def.html || [])].filter((r) => /\.(js|gs)$/.test(r));
    projects[k] = Object.assign({ key: k, short: k.slice(PREFIX.length), def }, loadProject(rels, readFile));
  });

  const L = [];
  L.push('# CAS setup guide: the reference (generated)');
  L.push('');
  L.push('> **Generated by `node tools/setup-guide/build.js` from the code. Do not edit by hand.**');
  L.push('> Regenerate after a change to `cas-ccps/scripts/`, `cas-ccps/studio-steps/`,');
  L.push('> `cas-ccps/clasp/manifests/`, `tools/gas-lint/project-map.json`,');
  L.push('> `tools/gas-lint/flow-map.json` or `tools/clasp-sync/run.js`; CI runs');
  L.push('> `node tools/setup-guide/build.js --check` and fails when this file is stale.');
  L.push('>');
  L.push('> The steps, in order, are in [`SETUP_GUIDE.md`](./SETUP_GUIDE.md). This page is what');
  L.push('> each step refers to. Anything the generator could not resolve from the code is listed');
  L.push('> under "Not resolved" in its section, never guessed. No Drive, script or library IDs');
  L.push('> are printed: they belong to one install, never to the repo.');
  L.push('');
  L.push('Contents: [1. Projects](#1-projects) · [2. Manifests](#2-manifests) · ' +
    '[3. Script Properties](#3-script-properties) · [4. Triggers](#4-triggers) · [5. Studio Flows](#5-studio-flows)');
  L.push('');

  // 1. Projects
  const runByName = {};
  (runManifest || []).forEach((p) => { runByName[p.name] = p; });
  L.push('## 1. Projects');
  L.push('');
  L.push('From `tools/gas-lint/project-map.json` (which files share one Apps Script project) and');
  L.push('`tools/clasp-sync/run.js` (how a push treats each one). `clasp create --type` is read from');
  L.push('what the project is bound to (`tools/clasp-sync/DEPLOYMENT_RUNBOOK.md` §3.2b).');
  L.push('');
  L.push(table(['Project', 'Bound to', 'clasp create --type', 'Script files', 'run.js', '.clasp.json template'],
    names.map((k) => {
      const p = projects[k];
      const run = runByName[p.short];
      const runText = run ? (run.mode === 'promote' ? 'promote (web app: push, version, move each listed deployment)' : 'push (HEAD is what runs)') +
        (run.onHold ? ', on hold' : '') : 'not pushed by run.js';
      const tmpl = 'cas-ccps/clasp/templates/' + p.short + '.clasp.json.template';
      return ['`' + p.short + '`', p.def._bound_to || '(not stated)', claspType(p.def._bound_to), p.files.length,
        runText, exists(tmpl) ? 'yes' : 'MISSING'];
    })));
  L.push('');
  L.push('Files per project (a file listed under more than one project is pasted into each):');
  L.push('');
  names.forEach((k) => {
    const p = projects[k];
    L.push('- `' + p.short + '`: ' + p.files.map((f) => '`' + f.base + '`').join(', '));
  });
  L.push('');

  // 2. Manifests
  L.push('## 2. Manifests');
  L.push('');
  L.push('From `cas-ccps/clasp/manifests/<project>.appsscript.json`, which `sync.js` copies into each');
  L.push('push folder. A new scope means every user of that project approves again after the push.');
  L.push('');
  const manifestNotes = [];
  names.forEach((k) => {
    const p = projects[k];
    const rel = p.def.manifest || ('cas-ccps/clasp/manifests/' + p.short + '.appsscript.json');
    L.push('### `' + p.short + '`');
    L.push('');
    let man = null;
    try { man = readManifest(rel); } catch (e) { man = null; }
    if (!man) {
      L.push('- No manifest at `' + rel + '` (not resolved).');
      L.push('');
      return;
    }
    L.push('- Time zone: ' + (man.timeZone || '(not set)') + '; runtime: ' + (man.runtimeVersion || '(not set)'));
    L.push('- OAuth scopes: ' + ((man.oauthScopes || []).map((s) => '`' + scopeName(s) + '`').join(', ') || 'none listed'));
    const deps = man.dependencies || {};
    const adv = (deps.enabledAdvancedServices || []).map((s) => '`' + s.userSymbol + '` (' + s.serviceId + ' ' + s.version + ')');
    L.push('- Advanced services: ' + (adv.join(', ') || 'none'));
    const libs = deps.libraries || [];
    if (libs.length) {
      libs.forEach((l) => {
        L.push('- Library: `' + l.userSymbol + '`, version ' + l.version + ', development mode ' + (l.developmentMode ? 'on' : 'off') +
          '. Its library ID is pinned in the manifest to one install\'s project (not printed here).');
        manifestNotes.push('`' + p.short + '` depends on the library `' + l.userSymbol + '` pinned to one install\'s project: a new install' +
          ' publishes its own library version and puts that ID and version in its local copy of the manifest before pushing.');
      });
    } else {
      L.push('- Libraries: none');
    }
    if (man.webapp) L.push('- Web app: executes as `' + man.webapp.executeAs + '`, access `' + man.webapp.access + '`');
    else L.push('- Web app: no');
    if (man.addOns) {
      const els = ((man.addOns.flows || {}).workflowElements || []).map((e) => e.id);
      L.push('- Workspace add-on: ' + (els.length ? els.length + ' Studio step(s): ' + els.map((e) => '`' + e + '`').join(', ') : 'yes'));
    }
    L.push('');
  });
  if (manifestNotes.length) {
    L.push('**Per-install values in the manifests:**');
    L.push('');
    manifestNotes.forEach((n) => L.push('- ' + n));
    L.push('');
  }

  // 3. Script Properties
  L.push('## 3. Script Properties');
  L.push('');
  L.push('Every key a project reads with `getProperty`, directly, through a helper that takes the key,');
  L.push('or through a constant or a list the generator could follow. "Default at the read" is a value');
  L.push('written beside the read (`|| "x"`, or a helper\'s fallback argument); "—" means none there,');
  L.push('so the caller sees blank when the key is unset. "Written by code" names the files that set the');
  L.push('key (a wizard, or the job\'s own state): a key no code writes is one a person sets.');
  L.push('Internal state keys (cursors, last-run stamps) are listed too, since the code reads them the same way.');
  L.push('');
  const shared = projects[PREFIX + 'central-ledger'] && projects[PREFIX + 'central-ledger'].files.find((f) => f.base === '00_SharedConfig.js');
  const withShared = names.filter((k) => projects[k].files.some((f) => f.base === '00_SharedConfig.js'));
  let resolver = null;
  if (shared) {
    const allFiles = [];
    const seen = new Set();
    names.forEach((k) => projects[k].files.forEach((f) => { if (!seen.has(f.base)) { seen.add(f.base); allFiles.push(f); } }));
    resolver = scanResolverKeys(shared, allFiles);
    L.push('### 3.0 Settings read through `00_SharedConfig.js`');
    L.push('');
    L.push('In every project that includes `00_SharedConfig.js` (' + withShared.map((k) => '`' + projects[k].short + '`').join(', ') + '),');
    L.push('these are resolved in order: the project\'s own Script Property, then (for the Ledger ID) the attached');
    L.push('sheet, then the Central Ledger\'s `_CONFIG` tab for the keys in `SHARED_CONFIG_KEYS`. `showConfigSources()`,');
    L.push('run in a project, says where each value came from. `CENTRAL_LEDGER_SS_ID` is the one key without which');
    L.push('`getConfig_()` throws; `ADMIN_SS_ID` defaults to it.');
    L.push('');
    const rows = [...resolver.keys.keys()].sort().map((k) => {
      const e = resolver.keys.get(k);
      return ['`' + k + '`', [...e.how].sort().join(', '), [...e.defaults].sort().join('; ') || '—',
        resolver.sharedKeys.has(k) ? 'yes' : 'no'];
    });
    L.push(table(['Key', 'Read through', 'Default in code', '`_CONFIG` row can supply it'], rows));
    L.push('');
  }
  const allUnresolvedProps = [];
  names.forEach((k, i) => {
    const p = projects[k];
    const scan = scanProperties(p);
    L.push('### 3.' + (i + 1) + ' `' + p.short + '`');
    L.push('');
    if (!scan.keys.size) {
      L.push('Reads no Script Property by name.');
      L.push('');
    } else {
      const rows = [...scan.keys.keys()].sort().map((key) => {
        const e = scan.keys.get(key);
        const w = scan.writes.get(key);
        return ['`' + key + '`', [...e.reads].sort().join(', '), [...e.defaults].sort().join('; ') || '—',
          w ? [...w].sort().join(', ') : 'no', [...e.files].sort().join(', ')];
      });
      L.push(table(['Key', 'Read', 'Default at the read', 'Written by code', 'Read in'], rows));
      L.push('');
    }
    if (scan.unresolved.length) {
      L.push('Not resolved (the key is built at run time or passed in; read the code):');
      L.push('');
      dedupe(scan.unresolved.map((u) => '`' + u.file + '`, `' + u.fn + '()`: `' + u.expr + '`')).forEach((s) => L.push('- ' + s));
      L.push('');
      allUnresolvedProps.push(...scan.unresolved);
    }
  });

  // 4. Triggers
  L.push('## 4. Triggers');
  L.push('');
  L.push('Every `ScriptApp.newTrigger(...)` call, by project: the handler it runs, the function that');
  L.push('installs it (run that one from the editor; one ending in `_` is hidden from the Run dropdown,');
  L.push('so the public function that calls it is named), and the schedule. Times are the project\'s time zone.');
  L.push('A file pasted into several projects carries its installers into each: run an installer in the');
  L.push('project `SETUP_GUIDE.md` names, which for the nightly jobs is the Central Ledger.');
  L.push('');
  names.forEach((k) => {
    const p = projects[k];
    const t = scanTriggers(p);
    if (!t.triggers.length && !t.unresolved.length) return;
    L.push('### `' + p.short + '`');
    L.push('');
    if (t.triggers.length) {
      const rows = t.triggers.slice().sort((a, b) => a.handler.localeCompare(b.handler) || a.installer.localeCompare(b.installer))
        .map((tr) => {
          const pub = publicCallers(p, tr.installer);
          return ['`' + tr.handler + '`', '`' + tr.installer + '()`' + (pub.length ? ' (run via ' + pub.map((c) => '`' + c + '()`').join(', ') + ')' : ''),
            tr.schedule, tr.file];
        });
      L.push(table(['Handler', 'Installed by', 'Schedule', 'File'], dedupeRows(rows)));
      L.push('');
    }
    if (t.unresolved.length) {
      L.push('Not resolved (the handler is a parameter or computed; read the code):');
      L.push('');
      dedupe(t.unresolved.map((u) => '`' + u.file + '`, `' + u.fn + '()`: `' + u.expr + '`, ' + u.schedule)).forEach((s) => L.push('- ' + s));
      L.push('');
    }
    const lc = p.consts.LC_JOBS;
    const lcEls = arrayElements(lc);
    if (lcEls && lcEls.objects) {
      L.push('**The Ledger cycle** (`LC_JOBS`): `installLedgerCycle()` replaces these jobs\' own triggers with one');
      L.push('`runLedgerCycle` trigger every minute, which runs each job at its cadence. `showSetupStatus()` shows which run there.');
      L.push('');
      L.push(table(['Job', 'Every (min)'], lcEls.objects.map((o) => ['`' + o.fn + '`', o.every])));
      L.push('');
    }
  });

  // 5. Studio Flows
  L.push('## 5. Studio Flows');
  L.push('');
  L.push('Each Flow is built by hand in Workspace Studio. The Apps Script half and its checks, from');
  L.push('`tools/gas-lint/flow-map.json` (gas-lint Check I holds every flow to having all four questions');
  L.push('answered). A check named here but missing from its project is marked MISSING.');
  L.push('');
  const surfaces = Object.entries((flowMap && flowMap.flowSurfaces) || {}).filter(([k]) => k.startsWith(PREFIX)).sort();
  const docs = listDocs();
  const docText = {};
  docs.forEach((d) => { try { docText[d] = readFile(d); } catch (e) { docText[d] = ''; } });
  const has = (proj, fn) => proj && Object.prototype.hasOwnProperty.call(proj.functions, fn);
  const roleCell = (proj, fn) => fn ? '`' + fn + '()`' + (has(proj, fn) ? '' : ' MISSING') : '(none declared)';
  const flowRows = surfaces.map(([key, s]) => {
    const proj = projects[s.project];
    const fns = [s.materialize, s.harvest, s.canary, s.binding, s.liveness, s.fixture].filter(Boolean);
    const docHits = docs.filter((d) => fns.some((fn) => new RegExp('\\b' + escapeRe(fn) + '\\b').test(docText[d])))
      .map((d) => '`' + path.basename(d) + '`');
    return ['`' + key.slice(PREFIX.length) + '`', '`' + String(s.project).slice(PREFIX.length) + '`',
      roleCell(proj, s.fixture), roleCell(proj, s.canary), roleCell(proj, s.binding), roleCell(proj, s.liveness),
      docHits.join(', ') || '(none found)'];
  });
  L.push(table(['Flow', 'Project', 'Fixture (gives it a row)', 'Canary (script half)', 'Binding (columns)', 'Liveness (ever answered)', 'Docs that name these'], flowRows));
  L.push('');
  // Build specs and preflights, per project.
  const specRows = [];
  names.forEach((k) => {
    const p = projects[k];
    const fns = Object.keys(p.functions).filter((n) => !/_$/.test(n));
    const specs = fns.filter((n) => /^(sync|check)\w*BuildSpec$/.test(n)).sort();
    const pre = fns.filter((n) => /^run\w*Preflight\w*$/.test(n) && !/Now$/.test(n)).sort();
    if (specs.length || pre.length) specRows.push(['`' + p.short + '`', specs.map((n) => '`' + n + '()`').join(', ') || '—', pre.map((n) => '`' + n + '()`').join(', ') || '—']);
  });
  L.push('Build specs (write the tab you build a Flow from, and check it is current) and preflights (structure: tabs, triggers, settings), by project:');
  L.push('');
  L.push(table(['Project', 'Build spec', 'Preflight'], specRows));
  L.push('');
  // Flows written into the FlowBuildSpec tab.
  const fbsOwner = names.map((k) => projects[k]).find((p) => has(p, 'syncFlowBuildSpec'));
  if (fbsOwner) {
    const { file, fn } = fbsOwner.functions.syncFlowBuildSpec;
    const appenders = [];
    const re = /\b(_fbsAppend\w*_)\s*\(/g;
    const body = file.code.slice(fn.open, fn.end);
    let m;
    while ((m = re.exec(body)) !== null) appenders.push(m[1]);
    const labels = [];
    appenders.forEach((a) => {
      const af = fbsOwner.functions[a];
      if (!af) return;
      const ab = af.file.code.slice(af.fn.open, af.fn.end);
      const lre = /\[\s*"(Flows? [^"]+)"/g;
      let lm;
      while ((lm = lre.exec(ab)) !== null) if (labels.indexOf(lm[1]) === -1) labels.push(lm[1]);
    });
    L.push('`syncFlowBuildSpec()` (`' + fbsOwner.short + '`) writes the `FlowBuildSpec` tab for: ' +
      (labels.length ? labels.map((l) => l).join(', ') : '(not resolved)') + '.');
    const declared = new Set(surfaces.map(([k]) => k));
    if (labels.indexOf('Flow 1') !== -1 && ![...declared].some((k) => /flow-1\b/.test(k))) {
      L.push('Flow 1 (rubric extraction) has no entry in `flow-map.json`, so no canary, binding or liveness check is declared for it.');
    }
    L.push('');
  }

  return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

function dedupe(list) {
  return [...new Set(list)].sort();
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((r) => { const k = r.join('\u0000'); if (seen.has(k)) return false; seen.add(k); return true; });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const check = argv.includes('--check');
  const outIdx = argv.indexOf('--out');
  const outRel = outIdx !== -1 ? argv[outIdx + 1] : OUT_REL;
  if (!outRel) { console.error('--out needs a path'); return 2; }
  const outAbs = path.isAbsolute(outRel) ? outRel : path.join(REPO_ROOT, outRel);
  const text = buildReference();
  if (check) {
    const current = fs.existsSync(outAbs) ? fs.readFileSync(outAbs, 'utf8') : null;
    if (current === text) {
      console.log('setup-guide: ' + path.relative(REPO_ROOT, outAbs) + ' is current.');
      return 0;
    }
    console.error('setup-guide: ' + path.relative(REPO_ROOT, outAbs) + (current === null ? ' is missing.' : ' is stale: the code changed since it was generated.') +
      ' Run `node tools/setup-guide/build.js` and commit the result.');
    return 1;
  }
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, text);
  console.log('setup-guide: wrote ' + path.relative(REPO_ROOT, outAbs) + ' (' + text.split('\n').length + ' lines).');
  return 0;
}

module.exports = {
  buildReference, parseSource, loadProject, scanProperties, scanTriggers, scanResolverKeys,
  describeSchedule, findPropertyHelpers, resolveIdentifier, claspType, OUT_REL,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
