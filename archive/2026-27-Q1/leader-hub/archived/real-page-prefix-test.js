// Throwaway diagnostic script — takes the REAL, complete leader-hub file
// and truncates ONLY the inside of the giant inline <script> block to a
// given fraction, while keeping everything else (real <head>/CSP, the
// other real <script> blocks, all real markup before/after) byte-identical
// to the actual file. This differs from prefix-test.js, which built a
// minimal synthetic shell around just the script content -- that version,
// even at 100% of the script's content, did NOT reproduce the live crash,
// while the real complete file does. So the trigger needs the real
// surrounding page, not just the one script block in isolation.
//
// Usage: node real-page-prefix-test.js [fraction]   (fraction defaults to 0.5)
// Produces real-page-project/ as a single HtmlService file named
// 'student-leader-hub' (matches the real file's own name), plus Code.gs
// and appsscript.json.

const fs = require('fs');
const path = require('path');

const fraction = parseFloat(process.argv[2] || '0.5');
if (!(fraction > 0 && fraction <= 1)) {
  console.error('fraction must be between 0 (exclusive) and 1 (inclusive), e.g. 0.5');
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
let cut = fraction >= 1 ? script.length : script.lastIndexOf('\n', target);
if (cut === -1) cut = target;

const truncatedScript = script.slice(0, cut);
const spliced = content.slice(0, big.tagEnd) + truncatedScript + content.slice(big.close);

console.log(`Real file: ${content.length} chars. Giant script: ${script.length} chars, truncated to ${truncatedScript.length} chars (${Math.round(fraction * 100)}%).`);
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
