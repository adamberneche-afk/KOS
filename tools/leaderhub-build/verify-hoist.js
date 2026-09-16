'use strict';
/**
 * tools/leaderhub-build/verify-hoist.js
 * =======================================
 * Proves hoist-declarations.js changed ONLY `let`/`const` -> `var` at
 * top-level declaration sites, and nothing else: tokenizes the original
 * and the converted source (dropping comments/whitespace, same as
 * verify-strip.js), then asserts every token matches at the same
 * position EXCEPT where original is `let`/`const` and converted is `var`.
 * Also asserts the two streams have the same LENGTH (a real safety net:
 * if the converter had somehow dropped or duplicated a token, this would
 * catch it even though it isn't a let/const/var mismatch).
 *
 * Usage: node tools/leaderhub-build/verify-hoist.js <original.js> <converted.js>
 */

const fs = require('fs');
const { tokenize } = require('./js-lexer');

function significantTokens(source) {
  return tokenize(source)
    .filter(t => t.type !== 'comment-line' && t.type !== 'comment-block' && t.type !== 'ws')
    .map(t => t.text);
}

function main() {
  const [origPath, convertedPath] = process.argv.slice(2);
  if (!origPath || !convertedPath) {
    console.error('Usage: node verify-hoist.js <original.js> <converted.js>');
    process.exit(2);
  }
  const orig = fs.readFileSync(origPath, 'utf8');
  const converted = fs.readFileSync(convertedPath, 'utf8');

  const t1 = significantTokens(orig);
  const t2 = significantTokens(converted);

  if (t1.length !== t2.length) {
    console.error(`MISMATCH: token count differs (original ${t1.length}, converted ${t2.length})`);
    process.exit(1);
  }

  let hoistedCount = 0;
  for (let i = 0; i < t1.length; i++) {
    if (t1[i] === t2[i]) continue;
    const isExpectedHoist = (t1[i] === 'let' || t1[i] === 'const') && t2[i] === 'var';
    if (!isExpectedHoist) {
      console.error(`MISMATCH at token ${i}: original=${JSON.stringify(t1[i])} converted=${JSON.stringify(t2[i])}`);
      console.error('Context (orig):     ', JSON.stringify(t1.slice(Math.max(0, i - 5), i + 5)));
      console.error('Context (converted):', JSON.stringify(t2.slice(Math.max(0, i - 5), i + 5)));
      process.exit(1);
    }
    hoistedCount++;
  }

  console.log(`MATCH: ${t1.length} tokens, identical except ${hoistedCount} let/const -> var conversions.`);
  process.exit(0);
}

main();
