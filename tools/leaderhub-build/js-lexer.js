'use strict';
/**
 * tools/leaderhub-build/js-lexer.js
 * ==================================
 * A minimal, recursive-descent JS tokenizer -- NOT a full parser, just
 * enough to correctly walk comments/strings/template-literals/regex
 * literals without corrupting arbitrarily-nested template expressions
 * (a template's `${...}` can contain another whole template, which can
 * itself contain another `${...}`, to any depth -- this codebase
 * actually does this three levels deep, e.g. a ternary of two templates
 * where one branch's `${...}` calls `.map(x => \`...\`)`).
 *
 * Emits a flat list of {type, text} tokens covering the ENTIRE input
 * with no gaps, where type is one of:
 *   'comment-line' | 'comment-block' | 'string' | 'template' | 'regex' |
 *   'ident' | 'number' | 'punct' | 'ws'
 * ('ws' covers any run of whitespace between real tokens, including
 * newlines -- callers that care about newlines vs spaces inspect
 * `text.includes('\n')` themselves rather than this module picking a
 * policy for them.)
 *
 * Used by both strip-comments.js (removes comment tokens, collapses ws)
 * and verify-strip.js (removes comment+ws tokens entirely, compares the
 * remaining token text against another file's) -- one tokenizer, so a
 * bug can't quietly agree with itself across two reimplementations the
 * way the first version of this tool did.
 */

const KEYWORDS_BEFORE_REGEX = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'do', 'else', 'yield', 'case', 'await', 'if', 'while', 'for',
]);

function tokenize(source) {
  const tokens = [];
  let i = 0;
  const n = source.length;
  let regexAllowed = true; // whether the next bare `/` starts a regex vs division

  function isIdentStart(ch) { return /[A-Za-z_$]/.test(ch); }
  function isIdentPart(ch) { return /[A-Za-z0-9_$]/.test(ch); }

  function scanString(quote) {
    let s = quote; i++;
    while (i < n && source[i] !== quote) {
      if (source[i] === '\\') { s += source[i] + (source[i + 1] || ''); i += 2; continue; }
      s += source[i]; i++;
    }
    s += source[i] || ''; i++;
    return s;
  }

  function scanLineComment() {
    let s = ''; // caller already knows it's a comment; content only
    while (i < n && source[i] !== '\n') { s += source[i]; i++; }
    return s;
  }

  function scanBlockComment() {
    let s = '/*'; i += 2;
    while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { s += source[i]; i++; }
    s += '*/'; i += 2;
    return s;
  }

  function scanRegex() {
    let s = '/'; i++;
    let inClass = false;
    while (i < n) {
      if (source[i] === '\\') { s += source[i] + (source[i + 1] || ''); i += 2; continue; }
      if (source[i] === '[') inClass = true;
      if (source[i] === ']') inClass = false;
      if (!inClass && source[i] === '/') { s += '/'; i++; break; }
      if (source[i] === '\n') break; // malformed / not actually a regex -- bail conservatively
      s += source[i]; i++;
    }
    while (i < n && /[a-zA-Z]/.test(source[i])) { s += source[i]; i++; }
    return s;
  }

  // Scans one full template literal starting AT the opening backtick.
  // Recurses into scanExprUntilBraceClose() for each ${...}, which
  // itself recurses back into scanTemplateBody() for any template
  // nested inside that expression -- this mutual recursion is what
  // handles arbitrary nesting depth correctly.
  function scanTemplateBody() {
    let s = '`'; i++;
    while (i < n) {
      if (source[i] === '\\') { s += source[i] + (source[i + 1] || ''); i += 2; continue; }
      if (source[i] === '`') { s += '`'; i++; break; }
      if (source[i] === '$' && source[i + 1] === '{') {
        s += '${'; i += 2;
        s += scanExprUntilBraceClose();
        continue;
      }
      s += source[i]; i++;
    }
    return s;
  }

  // Scans real JS code starting right after a `${`, up to and including
  // the matching `}` (brace depth back to 0). Fully recursive: nested
  // `{`/`}` (object literals, blocks), nested templates, strings,
  // comments, and regexes are all handled by re-entering the same
  // scanning logic, not a fixed nesting-depth counter.
  function scanExprUntilBraceClose() {
    let s = '';
    let depth = 0;
    let localRegexAllowed = true;
    while (i < n) {
      const ch = source[i];
      if (ch === '}' && depth === 0) { s += '}'; i++; return s; }
      if (ch === '{') { depth++; s += ch; i++; localRegexAllowed = true; continue; }
      if (ch === '}') { depth--; s += ch; i++; localRegexAllowed = false; continue; }
      if (/\s/.test(ch)) {
        // Whitespace must NOT touch localRegexAllowed -- it needs to carry
        // over from the last real token (e.g. `a / 1000` is division: the
        // space between `a` and `/` must not reset the ident's `false`
        // back to `true`, or `/` gets misread as a regex literal's start
        // and scanRegex() runs away consuming the rest of the input).
        while (i < n && /\s/.test(source[i])) { s += source[i]; i++; }
        continue;
      }
      if (ch === '/' && source[i + 1] === '/') { i += 2; s += '//' + scanLineComment(); continue; }
      if (ch === '/' && source[i + 1] === '*') { s += scanBlockComment(); continue; }
      if (ch === '"' || ch === "'") { s += scanString(ch); localRegexAllowed = false; continue; }
      if (ch === '`') { s += scanTemplateBody(); localRegexAllowed = false; continue; }
      if (ch === '/' && localRegexAllowed) { s += scanRegex(); localRegexAllowed = false; continue; }
      if (isIdentStart(ch)) {
        let id = ''; while (i < n && isIdentPart(source[i])) { id += source[i]; i++; }
        s += id;
        localRegexAllowed = KEYWORDS_BEFORE_REGEX.has(id);
        continue;
      }
      if (/[0-9]/.test(ch)) {
        let num = ''; while (i < n && /[0-9a-fA-FxXeE.]/.test(source[i])) { num += source[i]; i++; }
        s += num; localRegexAllowed = false; continue;
      }
      s += ch; i++;
      localRegexAllowed = !(ch === ')' || ch === ']');
    }
    return s; // malformed input (shouldn't happen for valid JS)
  }

  while (i < n) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      let s = '';
      while (i < n && /\s/.test(source[i])) { s += source[i]; i++; }
      tokens.push({ type: 'ws', text: s });
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      i += 2;
      tokens.push({ type: 'comment-line', text: '//' + scanLineComment() });
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      tokens.push({ type: 'comment-block', text: scanBlockComment() });
      continue;
    }

    if (ch === '"' || ch === "'") {
      tokens.push({ type: 'string', text: scanString(ch) });
      regexAllowed = false;
      continue;
    }

    if (ch === '`') {
      tokens.push({ type: 'template', text: scanTemplateBody() });
      regexAllowed = false;
      continue;
    }

    if (ch === '/' && regexAllowed) {
      tokens.push({ type: 'regex', text: scanRegex() });
      regexAllowed = false;
      continue;
    }

    if (isIdentStart(ch)) {
      let id = ''; while (i < n && isIdentPart(source[i])) { id += source[i]; i++; }
      tokens.push({ type: 'ident', text: id });
      regexAllowed = KEYWORDS_BEFORE_REGEX.has(id);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let num = ''; while (i < n && /[0-9a-fA-FxXeE.]/.test(source[i])) { num += source[i]; i++; }
      tokens.push({ type: 'number', text: num });
      regexAllowed = false;
      continue;
    }

    tokens.push({ type: 'punct', text: ch });
    regexAllowed = !(ch === ')' || ch === ']');
    i++;
  }

  return tokens;
}

module.exports = { tokenize, KEYWORDS_BEFORE_REGEX };
