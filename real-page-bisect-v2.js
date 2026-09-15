// Throwaway diagnostic script (round 2) — same idea as the archived
// leader-hub/archived/real-page-prefix-test.js, but using the CORRECT,
// comment-aware script-block boundary detector (tools/html-lint/check.js's
// findInlineScriptBlocks) instead of the naive indexOf('<script'...) scan
// every earlier bisection script used, which was off by 33,160 characters
// (it matched a "<script>" mention inside a real developer comment as if
// it were a real tag). That bug made every percentage/threshold quoted in
// the original investigation untrustworthy.
//
// Bisects against the CURRENT (already build-time-minified) real file,
// since a fresh live redeploy of that exact content still crashed --
// this finds how much FURTHER reduction is actually needed, using the
// real page (real head/CSP/other-scripts/markup intact) each time, not a
// synthetic shell.
//
// Usage: node real-page-bisect-v2.js [fraction]   (fraction defaults to 0.5)
// Produces real-page-project/ as a single HtmlService file named
// 'student-leader-hub' (matches the real file's own name), plus Code.gs
// and appsscript.json, ready for a throwaway Apps Script project.

const fs = require('fs');
const path = require('path');
const { findInlineScriptBlocks } = require('./tools/html-lint/check.js');

const fraction = parseFloat(process.argv[2] || '0.5');
if (!(fraction > 0 && fraction <= 1)) {
  console.error('fraction must be between 0 (exclusive) and 1 (inclusive), e.g. 0.5');
  process.exit(1);
}

const SRC = path.join(__dirname, 'leader-hub', 'student-leader-hub.html');
const content = fs.readFileSync(SRC, 'utf8');

const blocks = findInlineScriptBlocks(content);
const big = blocks.reduce((a, b) => (b.contentEnd - b.contentStart) > (a.contentEnd - a.contentStart) ? b : a);
const script = content.slice(big.contentStart, big.contentEnd);

console.log('Real (current, already-minified) giant script:', script.length, 'chars.');

const target = Math.floor(script.length * fraction);
let cut = fraction >= 1 ? script.length : script.lastIndexOf('\n', target);
if (cut === -1) cut = target;

const truncatedScript = script.slice(0, cut);
const spliced = content.slice(0, big.contentStart) + truncatedScript + content.slice(big.contentEnd);

console.log(`Truncated to ${truncatedScript.length} chars (${Math.round(fraction * 100)}% of the current script).`);
console.log(`Spliced output: ${spliced.length} chars (real head/CSP/other-scripts/markup all intact).`);

const appsscript = JSON.stringify({
  timeZone: 'America/New_York',
  dependencies: {},
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_ACCESSING', access: 'DOMAIN' }
}, null, 2);

const dir = path.join(__dirname, 'real-page-project');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'appsscript.json'), appsscript);
fs.writeFileSync(path.join(dir, 'Code.gs'), `function doGet() {\n  return HtmlService.createHtmlOutputFromFile('student-leader-hub');\n}\n`);
fs.writeFileSync(path.join(dir, 'student-leader-hub.html'), spliced);
console.log(`Wrote ${dir}/student-leader-hub.html`);
