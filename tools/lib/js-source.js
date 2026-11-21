'use strict';
// JavaScript source helpers shared by the checks (structure audit 3.9,
// 2026-11-21; moved here from tools/gas-lint/check.js, which still exports
// them). One implementation, tested once: doc-currency's first version
// hand-rolled its own stripper, and without regex-literal handling it reported
// 82 missing functions, nearly all of which exist (tools/doc-currency/README.md).

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

// The platform globals and keywords that are never a missing function: Apps
// Script's services, the JavaScript built-ins called as bare names, and the
// keywords a naive call-site regex mistakes for a call.
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

module.exports = { stripCommentsAndStrings, lineAt, ALLOWLIST };
