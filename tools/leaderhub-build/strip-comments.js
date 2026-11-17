'use strict';
/**
 * tools/leaderhub-build/strip-comments.js
 * ========================================
 * Strips comments and dead whitespace from a JS source string using
 * js-lexer.js's tokenizer, without touching string/template/regex
 * literal content and without merging any two lines that had a real
 * newline between them (a whitespace run that contained a newline
 * becomes exactly one newline; a run that didn't becomes exactly one
 * space) -- collapsing a newline to nothing can change what JS's
 * automatic-semicolon-insertion does (`return\n(x)` != `return (x)` on
 * one line), so newline PRESENCE is always preserved even though blank
 * lines and indentation are not.
 *
 * Intentionally not a general minifier: no renaming, no compression, no
 * line-joining -- only bytes a JS parser would discard anyway. See
 * js-lexer.js's header for why this is hand-rolled rather than using a
 * real minifier package.
 */

const { tokenize } = require('./js-lexer');

function stripCommentsAndWhitespace(source) {
  const tokens = tokenize(source);
  // Pieces joined once at the end, and the last character emitted kept in
  // a variable. Reading `out[out.length - 1]` from a string built with
  // `+=` flattens the whole string on every whitespace token, which made
  // this quadratic: 17 s on the 2 MB 55b_LessonAssignmentData.js, 0.2 s
  // this way, byte-identical output (dead-ends audit, 2026-11-17).
  const parts = [];
  let last; // the last character emitted; undefined at the start of output

  // IMPORTANT: every whitespace-collapsing decision below is made
  // per-token, looking only at the single last character already
  // emitted -- never via a global regex over the assembled output.
  // A global regex pass would be unable to tell a real newline
  // that came from a 'ws' token apart from one that's part of an actual
  // string/template literal's VALUE (this codebase has multi-line
  // template literals whose embedded whitespace is semantically real,
  // e.g. `\n    <div>...`), and would corrupt them.
  for (const tok of tokens) {
    if (tok.type === 'comment-line' || tok.type === 'comment-block') continue;

    if (tok.type === 'ws') {
      if (tok.text.includes('\n')) {
        // Collapses any run of blank lines to a single newline, and
        // drops a newline entirely at the very start of output or right
        // after another newline (dead indentation before it already
        // collapsed to nothing).
        if (last !== undefined && last !== '\n') { parts.push('\n'); last = '\n'; }
      } else {
        // A single inline separator space, but never a leading space at
        // the very start of a line or of the file (last is undefined,
        // a newline, or already a space).
        if (last !== undefined && last !== '\n' && last !== ' ') { parts.push(' '); last = ' '; }
      }
      continue;
    }

    if (tok.text.length) {
      parts.push(tok.text);
      last = tok.text[tok.text.length - 1];
    }
  }

  return parts.join('');
}

module.exports = { stripCommentsAndWhitespace };
