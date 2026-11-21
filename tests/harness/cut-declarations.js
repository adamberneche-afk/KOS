'use strict';
// Cuts named declarations out of a source file, so a test can run a few
// functions or constants from a large file (a LeaderHub page, a dashboard)
// without loading the whole thing. Structure audit 3.11 (2026-11-21): tests
// used to cut by fixed line ranges (extract-lines.js, which broke twice in a
// week on unrelated edits above the range), by indexOf, and by three private
// helpers. This finds each declaration by name with the lexer the LeaderHub
// build already trusts (tools/leaderhub-build/js-lexer.js: strings, nested
// template literals, regex literals), so an edit elsewhere in the file can't
// move what a test runs.
//
//   cutDeclarations(file, ['escH', 'DECA_SEASON_DEFAULT'])  -> source text
//   declarationSource(code, 'escH')                         -> one declaration
//   cutSpan(file, 'MONTHS', 'parseCalendarText')            -> first's start to last's end
//   cutStatement(file, 'logEl.innerHTML = [...SALES_LOG]')  -> one statement, by its first text
//   listDeclarations(code)                                  -> [{ name, kind, start, end }]
//
// A declaration is `function NAME(`, `async function NAME(`, or
// `const|let|var NAME =` at any depth. Its text runs to the end of the
// function body, or to the statement's `;` (or the line end where a statement
// ends without one). For an .html file only the <script> blocks are read.
// A name that isn't declared, or is declared twice in the file, throws: a test
// should never silently run the wrong copy.

const fs = require('fs');
const { tokenize } = require('../../tools/leaderhub-build/js-lexer.js');

const OPEN = { '(': ')', '[': ']', '{': '}' };
const CLOSE = new Set([')', ']', '}']);
const CONTINUES = /^(?:[.?:,+\-*/%&|^=<>!]|=>|\?\?)/; // a next line starting with these continues the statement

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const LH_MANIFEST = path.join(ROOT, 'tools', 'leaderhub-build', 'manifest.json');

// The JavaScript to search in `file`. A LeaderHub fragment (leader-hub/src/)
// is part of one page whose <script> opens in one fragment and closes in a
// later one, so for those the whole page is assembled from the build's
// manifest, as tools/leaderhub-build/build.js does, and its scripts read.
function fileCode(file) {
  const rel = path.relative(ROOT, path.resolve(file)).split(path.sep).join('/');
  if (rel.startsWith('leader-hub/src/')) {
    const manifest = JSON.parse(fs.readFileSync(LH_MANIFEST, 'utf8'));
    if (!manifest.fragments.includes(rel)) throw new Error('cut-declarations: ' + rel + ' is not in the LeaderHub manifest');
    return scriptText(manifest.fragments.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(''), 'page.html');
  }
  return scriptText(fs.readFileSync(file, 'utf8'), file);
}

function scriptText(src, file) {
  if (!/\.html?$/i.test(file || '')) return src;
  const parts = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) parts.push(m[1]);
  return parts.join('\n;\n');
}

// Tokens with their offsets, whitespace and comments marked insignificant.
function lex(code) {
  let at = 0;
  return tokenize(code).map((t) => {
    const tok = { type: t.type, text: t.text, start: at, end: at + t.text.length };
    at = tok.end;
    tok.sig = !(t.type === 'ws' || t.type === 'comment-line' || t.type === 'comment-block');
    return tok;
  });
}

function nextSig(toks, i) {
  for (let k = i + 1; k < toks.length; k++) if (toks[k].sig) return k;
  return -1;
}

// Where the declaration starting at token i ends (an offset into the code).
function declEnd(toks, i, kind) {
  let depth = 0, enteredBody = false;
  for (let k = i; k < toks.length; k++) {
    const t = toks[k];
    if (t.type === 'punct' && OPEN[t.text]) {
      if (kind === 'function' && t.text === '{' && depth === 0) enteredBody = true;
      depth++;
      continue;
    }
    if (t.type === 'punct' && CLOSE.has(t.text)) {
      depth--;
      if (kind === 'function' && enteredBody && depth === 0) return t.end;
      continue;
    }
    if (kind !== 'function' && depth === 0) {
      if (t.type === 'punct' && t.text === ';') return t.end;
      if (t.type === 'ws' && t.text.includes('\n') && k > i + 2) {
        const n = nextSig(toks, k);
        if (n === -1) return t.start;
        if (!CONTINUES.test(toks[n].text)) {
          const prev = toks.slice(0, k).reverse().find((x) => x.sig);
          if (prev && !CONTINUES.test(prev.text) && !OPEN[prev.text]) return t.start;
        }
      }
    }
  }
  // A statement that runs to the end of the code ends there.
  if (kind !== 'function' && depth === 0 && toks.length) return toks[toks.length - 1].end;
  throw new Error('cut-declarations: a declaration never ends (unbalanced brackets?)');
}

function listDeclarations(code) {
  const toks = lex(code);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'ident') continue;
    let kind = null, nameAt = -1, start = t.start;
    if (t.text === 'function') {
      nameAt = nextSig(toks, i);
      const paren = nameAt === -1 ? -1 : nextSig(toks, nameAt);
      if (nameAt !== -1 && toks[nameAt].type === 'ident' && paren !== -1 && toks[paren].text === '(') kind = 'function';
      const prev = toks.slice(0, i).reverse().find((x) => x.sig);
      if (kind && prev && prev.text === 'async' && code.slice(prev.end, t.start).trim() === '') start = prev.start;
    } else if (t.text === 'const' || t.text === 'let' || t.text === 'var') {
      nameAt = nextSig(toks, i);
      const eq = nameAt === -1 ? -1 : nextSig(toks, nameAt);
      if (nameAt !== -1 && toks[nameAt].type === 'ident' && eq !== -1 && toks[eq].text === '=') kind = t.text;
    }
    if (!kind) continue;
    out.push({ name: toks[nameAt].text, kind, start, end: declEnd(toks, i, kind) });
  }
  return out;
}

function declarationSource(code, name, label) {
  const d = oneDecl(code, name, label);
  return code.slice(d.start, d.end);
}

function oneDecl(code, name, label) {
  const hits = listDeclarations(code).filter((d) => d.name === name);
  const where = label ? ' in ' + label : '';
  if (!hits.length) throw new Error(`cut-declarations: no declaration of ${name}${where}`);
  if (hits.length > 1) throw new Error(`cut-declarations: ${name} is declared ${hits.length} times${where}; cut it from a narrower source`);
  return hits[0];
}

// Everything from the start of declaration `first` to the end of `last`, for
// a test that runs a run of neighbouring declarations as one block. `first`
// may be { text: '...' } instead, text that appears once (for a span that
// starts with a bare block or a comment rather than a declaration).
function cutSpan(file, first, last) {
  const code = fileCode(file);
  let start;
  if (first && typeof first === 'object') {
    start = code.indexOf(first.text);
    if (start === -1 || code.indexOf(first.text, start + 1) !== -1) {
      throw new Error(`cut-declarations: "${first.text}" must appear exactly once in ${file}`);
    }
  } else {
    start = oneDecl(code, first, file).start;
  }
  const b = oneDecl(code, last, file);
  if (b.end <= start) throw new Error(`cut-declarations: ${last} comes before the span's start in ${file}`);
  return code.slice(start, b.end);
}

// The one statement that starts with `firstText` (which must appear exactly
// once), to its end: for a test that runs a sink inside a larger function.
function cutStatement(file, firstText) {
  const code = fileCode(file);
  const at = code.indexOf(firstText);
  if (at === -1) throw new Error(`cut-declarations: "${firstText}" is not in ${file}`);
  if (code.indexOf(firstText, at + 1) !== -1) throw new Error(`cut-declarations: "${firstText}" appears more than once in ${file}`);
  const toks = lex(code);
  const i = toks.findIndex((t) => t.start === at);
  if (i === -1) throw new Error(`cut-declarations: "${firstText}" does not start a token in ${file}`);
  return code.slice(at, declEnd(toks, i, 'statement'));
}

// The named declarations from a file, in the order asked, joined by newlines.
function cutDeclarations(file, names) {
  const code = fileCode(file);
  return names.map((n) => declarationSource(code, n, file)).join('\n');
}

module.exports = { cutDeclarations, cutSpan, cutStatement, declarationSource, listDeclarations, scriptText };
