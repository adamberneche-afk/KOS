// Throwaway diagnostic script — takes a fraction of leader-hub's real
// ~1.24M-char inline <script> block (from the start) and builds one
// standalone Apps Script test project (prefix-project/), to binary-search
// the size threshold between 620K chars (confirmed clean, see half1/half2)
// and 1.24M chars (confirmed to crash, the real full page).
//
// Usage: node prefix-test.js [fraction]   (fraction defaults to 0.75)
// Then follow the printed clasp instructions.

const fs = require('fs');
const path = require('path');

const fraction = parseFloat(process.argv[2] || '0.75');
if (!(fraction > 0 && fraction < 1)) {
  console.error('fraction must be between 0 and 1, e.g. 0.75');
  process.exit(1);
}

const SRC = path.join(__dirname, 'leader-hub', 'student-leader-hub.html');
const content = fs.readFileSync(SRC, 'utf8');

function findScriptBlocks(html) {
  const blocks = [];
  let i = 0;
  while (true) {
    const start = html.indexOf('<script', i);
    if (start === -1) break;
    const tagEnd = html.indexOf('>', start) + 1;
    const close = html.indexOf('</script>', tagEnd);
    if (close === -1) break;
    blocks.push({ start, tagEnd, close, len: close - tagEnd });
    i = close + '</script>'.length;
  }
  return blocks;
}

const blocks = findScriptBlocks(content);
const big = blocks.reduce((a, b) => (b.len > a.len ? b : a));
const script = content.slice(big.tagEnd, big.close);

const target = Math.floor(script.length * fraction);
let cut = script.lastIndexOf('\n', target);
if (cut === -1) cut = target;

const chunk = script.slice(0, cut);
console.log(`Full script: ${script.length} chars. Prefix at ${Math.round(fraction * 100)}%: ${chunk.length} chars.`);

const shellHead = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prefix Test</title>
</head>
<body>
<div>prefix test (${chunk.length} chars)</div>
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

const dir = path.join(__dirname, 'prefix-project');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'appsscript.json'), appsscript);
fs.writeFileSync(path.join(dir, 'Code.gs'), `function doGet() {\n  return HtmlService.createHtmlOutputFromFile('prefix');\n}\n`);
fs.writeFileSync(path.join(dir, 'prefix.html'), shellHead + chunk + shellTail);
console.log(`Wrote ${dir}/ (prefix.html is ${chunk.length} chars)`);
