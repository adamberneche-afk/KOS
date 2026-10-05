'use strict';
// tools/notebook-codebase/build.js writes the repo as Gemini notebook
// sources (meta/notebook-codebase/). These checks run the generator in
// memory against the real repo: every source names itself, stays under the
// notebook's per-source cap, attributes every section to its source and
// file, leaves out what it says it leaves out, and is deterministic.
//
// The committed output is not held to staleness here on purpose (see the
// generator's header); `node tools/notebook-codebase/build.js --check`
// reports it.

const test = require('node:test');
const assert = require('node:assert/strict');
const { build, demote, fence, htmlToText, WORD_CAP } = require('../../tools/notebook-codebase/build.js');

const result = build();

test('every source names itself and stays under the per-source cap', () => {
  for (const [file, text] of Object.entries(result.outputs)) {
    const name = file.replace(/\.md$/, '');
    assert.ok(text.includes('Notebook source: ' + name + '.'), file + ' needs its source line');
    const words = (text.match(/\S+/g) || []).length;
    assert.ok(words <= WORD_CAP, file + ' has ' + words + ' words; the cap is ' + WORD_CAP);
  }
});

test('every section heading names its source, so a retrieved passage is attributable', () => {
  for (const [file, text] of Object.entries(result.outputs)) {
    const name = file.replace(/\.md$/, '');
    let open = null;
    for (const line of text.split('\n')) {
      const f = /^(`{3,})/.exec(line);
      if (f) { if (!open) open = f[1]; else if (f[1].length >= open.length) open = null; continue; }
      if (!open && /^## /.test(line)) assert.match(line, new RegExp('^## ' + name + ' · '), file + ': ' + line);
    }
  }
});

test('every included file is in exactly one source, and the exclusions hold', () => {
  assert.deepEqual(result.unassigned, [], 'every tracked text file is assigned to a source');
  const all = result.summary.flatMap((s) => s.files);
  assert.equal(new Set(all).size, all.length, 'no file appears in two sources');
  for (const p of all) {
    assert.doesNotMatch(p, /(^|\/)(archive|archived)\//, 'archived: ' + p);
    assert.notEqual(p, 'leader-hub/student-leader-hub.html', 'the built page is left out');
    assert.doesNotMatch(p, /PERSONA_.*\.md$/, 'persona docs live in the RTP notebook: ' + p);
    assert.doesNotMatch(p, /^meta\/notebook-codebase\//, 'the output never includes itself');
    assert.doesNotMatch(p, /\.(json|csv|docx|xlsx)$/, 'data files are left out: ' + p);
  }
  assert.ok(all.includes('kos-personal/22_BriefingDocs.gs'));
  assert.ok(all.includes('cas-ccps/docs/SYSTEM_ARCHITECTURE.html'), 'HTML guides are converted, not dropped');
  assert.ok(!all.includes('cas-ccps/docs/TEACHER_REFERENCE_GUIDE.html'), 'its Markdown version is used instead');
});

test('the build is deterministic', () => {
  assert.deepEqual(build().outputs, result.outputs);
});

test('helpers: headings demoted outside fences, fences longer than any inner run, HTML to text', () => {
  assert.equal(demote('# Title\n```\n# not a heading\n```\n## Sub'), '### Title\n```\n# not a heading\n```\n#### Sub');
  assert.equal(fence('a ```` b'), '`````');
  assert.equal(fence('plain'), '```');
  const t = htmlToText('<style>x{}</style><h2>Steps</h2><ul><li>One &amp; two</li></ul><script>bad()</script><p>Done&nbsp;now</p>');
  assert.equal(t, '## Steps\n\n- One & two\n\nDone now');
});
