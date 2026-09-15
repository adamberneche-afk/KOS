'use strict';
/**
 * tools/leaderhub-build/verify-strip.js
 * ======================================
 * Proves strip-comments.js only removed comments/whitespace and changed
 * nothing else: tokenizes both the original and the stripped source
 * with js-lexer.js's tokenizer, drops comment and whitespace tokens from
 * both, and asserts the remaining token text is identical in the same
 * order. A bug that dropped/altered real code, or misidentified a
 * string/template/regex boundary, shows up here as a mismatch even
 * though both versions might independently pass `node --check`
 * (syntactic validity alone doesn't prove semantic equivalence).
 *
 * Usage: node tools/leaderhub-build/verify-strip.js <original.js> <stripped.js>
 */

const fs = require('fs');
const { tokenize } = require('./js-lexer');

function significantTokens(source) {
  return tokenize(source)
    .filter(t => t.type !== 'comment-line' && t.type !== 'comment-block' && t.type !== 'ws')
    .map(t => t.text);
}

function main() {
  const [origPath, strippedPath] = process.argv.slice(2);
  if (!origPath || !strippedPath) {
    console.error('Usage: node verify-strip.js <original.js> <stripped.js>');
    process.exit(2);
  }
  const orig = fs.readFileSync(origPath, 'utf8');
  const stripped = fs.readFileSync(strippedPath, 'utf8');

  const t1 = significantTokens(orig);
  const t2 = significantTokens(stripped);

  const minLen = Math.min(t1.length, t2.length);
  for (let i = 0; i < minLen; i++) {
    if (t1[i] !== t2[i]) {
      console.error(`MISMATCH at token ${i}: original=${JSON.stringify(t1[i])} stripped=${JSON.stringify(t2[i])}`);
      console.error('Context (orig):  ', JSON.stringify(t1.slice(Math.max(0, i - 5), i + 5)));
      console.error('Context (strip): ', JSON.stringify(t2.slice(Math.max(0, i - 5), i + 5)));
      process.exit(1);
    }
  }
  if (t1.length !== t2.length) {
    console.error(`MISMATCH: token count differs (original ${t1.length}, stripped ${t2.length}) despite ${minLen} matching tokens`);
    const extra = t1.length > t2.length ? t1.slice(minLen) : t2.slice(minLen);
    console.error('Extra tokens in the longer one:', JSON.stringify(extra.slice(0, 10)));
    process.exit(1);
  }

  console.log(`MATCH: ${t1.length} significant tokens, identical between original and stripped.`);
  process.exit(0);
}

main();
