// Throwaway diagnostic script — splits leader-hub's real ~1.24M-char inline
// <script> block in half and builds two standalone Apps Script test
// projects (half1-project/, half2-project/) so each half can be deployed
// and hit with the OAuth consent flow on its own, to bisect which half of
// the REAL content triggers the "Unexpected identifier 'style'" crash.
//
// Run from the repo root: node bisect-split.js
// Then follow the printed clasp instructions for each half.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'leader-hub', 'student-leader-hub.html');
const content = fs.readFileSync(SRC, 'utf8');

const openTag = '<script>';
const closeTag = '</script>';

// Locate the one big inline script block by scanning literal <script>/</script>
// tag boundaries (not a regex over the whole file, since the JS content
// itself contains the literal substring "<script>" inside string/template
// literals — this walks tag-by-tag instead).
function findScriptBlocks(html) {
  const blocks = [];
  let i = 0;
  while (true) {
    const start = html.indexOf('<script', i);
    if (start === -1) break;
    const tagEnd = html.indexOf('>', start) + 1;
    const close = html.indexOf(closeTag, tagEnd);
    if (close === -1) break;
    blocks.push({ start, tagEnd, close, len: close - tagEnd });
    i = close + closeTag.length;
  }
  return blocks;
}

const blocks = findScriptBlocks(content);
const big = blocks.reduce((a, b) => (b.len > a.len ? b : a));
console.log('Found', blocks.length, 'script blocks; biggest is', big.len, 'chars at offset', big.tagEnd);

const script = content.slice(big.tagEnd, big.close);
const mid = Math.floor(script.length / 2);
let splitAt = script.lastIndexOf('\n', mid);
if (splitAt === -1) splitAt = mid;

const chunk1 = script.slice(0, splitAt);
const chunk2 = script.slice(splitAt);

console.log('chunk1:', chunk1.length, 'chars, chunk2:', chunk2.length, 'chars');

const shellHead = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bisect Test</title>
</head>
<body>
<div>bisect test</div>
<script>
`;
const shellTail = `
</script>
</body>
</html>
`;

const appsscript = JSON.stringify({
  timeZone: 'America/New_York',
  dependencies: {},
  exceptionLogging: 'STACKDRIVER',
  runtimeVersion: 'V8',
  webapp: { executeAs: 'USER_ACCESSING', access: 'DOMAIN' }
}, null, 2);

for (const [n, chunk] of [[1, chunk1], [2, chunk2]]) {
  const dir = path.join(__dirname, `half${n}-project`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'appsscript.json'), appsscript);
  fs.writeFileSync(path.join(dir, 'Code.gs'), `function doGet() {\n  return HtmlService.createHtmlOutputFromFile('half${n}');\n}\n`);
  fs.writeFileSync(path.join(dir, `half${n}.html`), shellHead + chunk + shellTail);
  console.log(`Wrote ${dir}/ (half${n}.html is ${chunk.length} chars)`);
}

console.log(`
Next, for EACH of half1-project/ and half2-project/:
  cd half<N>-project
  clasp create --type webapp --title "LH-Bisect-Half<N>"
  clasp push
  clasp deploy --description "bisect half<N>"
Then open the /exec URL (Extensions > Apps Script > Deploy > Manage deployments
to grab it, or 'clasp open --webapp') and report whether the OAuth consent /
authorization step crashes with the same "Unexpected identifier" error.
`);
