'use strict';
// cas-ccps/docs/notebooklm-sources/ holds the Markdown copies of the four
// user guides uploaded to the user-guide notebook, generated from the HTML
// guides by tools/cas-ccps/build-guide-notebook-sources.js (2026-10-23; they
// were hand conversions before and went stale when #254 rewrote the guides).
// Pins: the committed copies match the generator; each names its source
// under its first heading; no page chrome (styles, scripts, markup) gets
// through; and the converter keeps steps, callouts, tables and glossaries.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, convert, GUIDES } = require('../../tools/cas-ccps/build-guide-notebook-sources.js');

const OUT = path.join(__dirname, '..', '..', 'cas-ccps', 'docs', 'notebooklm-sources');
const copies = build();

test('the committed guide copies match the generator', () => {
  const onDisk = fs.readdirSync(OUT).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
  assert.deepEqual(onDisk, GUIDES.map((g) => g + '.md').sort());
  copies.forEach((c) => assert.equal(fs.readFileSync(path.join(OUT, c.file), 'utf8'), c.text,
    c.file + ' is out of date; run: node tools/cas-ccps/build-guide-notebook-sources.js'));
});

test('each copy names its source under its first heading, and carries no page markup', () => {
  copies.forEach((c) => {
    const name = c.file.replace(/\.md$/, '');
    assert.match(c.text, new RegExp('^# .+\\n\\nNotebook source: ' + name + '\\.', 'm'), c.file);
    const body = c.text.replace(/^<!--[^\n]*-->\n/, '');
    // "<date>" in a guide is a placeholder the guide itself writes, so only real tags count.
    assert.doesNotMatch(body, /<\/?(div|span|p|a|em|strong|code|style|script|table|tr|td|th|ul|ol|li|dl|dt|dd|h[1-6]|br|nav|details|summary)\b[^>]*>|\{[^}]*:[^}]*;[^}]*\}|function\s*\(/i,
      c.file + ': markup, CSS or script got through');
    assert.ok(body.split(/\s+/).length > 500, c.file + ': too short to be the guide');
  });
});

test('the converter keeps steps, callouts, tables, glossaries and FAQ answers', () => {
  const html = '<html><head><style>.x{color:red}</style></head><body>' +
    '<nav class="sidebar"><a class="sb-link">Jump</a></nav>' +
    '<h1>Guide <em>title</em></h1><p>Intro &amp; more.</p>' +
    '<div class="steps"><div class="step"><div class="step-n">1</div><div class="step-body"><strong>Open it</strong><p>From the menu.</p></div></div>' +
    '<div class="step"><div class="step-n">2</div><div class="step-body"><strong>Press Submit</strong><p>Wait.</p></div></div></div>' +
    '<div class="callout callout-gold"><span class="callout-icon">⚠️</span><div class="callout-body"><strong>Careful.</strong> Read this.</div></div>' +
    '<table><tr><th>What</th><th>Where</th></tr><tr><td>Grade</td><td>Canvas | SpeedGrader</td></tr><tr><td>Path</td><td>C:\\</td></tr></table>' +
    '<dl class="terms"><div><dt>Check</dt><dd>One evaluation.</dd></div></dl>' +
    '<details><summary>Where is my feedback?</summary><div class="faq-a"><p>In the comments.</p></div></details>' +
    '<script>alert(1)</script></body></html>';
  const md = convert(html, 'X', 'x.html');
  assert.match(md, /^# Guide \*title\*\n\nNotebook source: X\./m);
  assert.match(md, /Intro & more\./);
  assert.match(md, /1\. \*\*Open it\*\*: From the menu\.\n2\. \*\*Press Submit\*\*: Wait\./);
  assert.match(md, /> ⚠️ \*\*Careful\.\*\* Read this\./);
  assert.match(md, /\| What \| Where \|\n\| --- \| --- \|\n\| Grade \| Canvas \\\| SpeedGrader \|/);
  assert.ok(md.includes('| Path | C:\\\\ |'), 'a backslash is escaped too, so it cannot escape the cell divider');
  assert.match(md, /- \*\*Check\*\*: One evaluation\./);
  assert.match(md, /### Where is my feedback\?\n\nIn the comments\./);
  assert.doesNotMatch(md, /Jump|alert|color:red/);
});
