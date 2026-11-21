'use strict';
// The dashboards' pages as .html templates (structure audit 4.5, 2026-11-21):
// 07's and 13's pages were one template literal each inside their .js files.
// Apps Script throws at evaluate() on a <?!= name ?> nobody set, which would
// take the whole page down, so the names each template uses must equal the
// values its build function passes; and every page must render, with each
// inline script still valid JavaScript.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGasFiles } = require('../harness/gas-sandbox');
const projectMap = require('../../tools/gas-lint/project-map.json');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, 'cas-ccps', 'scripts');
const PAGES = [
  { page: '07_TeacherDashboardPage', js: '07_TeacherDashboard.js', project: 'cas-ccps:teacher-dashboard', build: (x) => x.buildDashboardHtml_({}), fn: 'buildDashboardHtml_' },
  { page: '07_MyContextPage', js: '07_TeacherDashboard.js', project: 'cas-ccps:teacher-dashboard', build: (x) => x.buildMyContextHtml_(), fn: 'buildMyContextHtml_' },
  { page: '13_StudentDashboardPage', js: '13_StudentDashboard.js', project: 'cas-ccps:student-dashboard', build: (x) => x.buildStudentDashboardHtml_({ demo: false }), fn: 'buildStudentDashboardHtml_' },
];

function templateNames(text) {
  const names = new Set();
  const re = /<\?([\s\S]*?)\?>/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[1].match(/^!=\s*([A-Za-z_$][\w$]*)\s*$/);
    assert.ok(s, 'only <?!= name ?> scriptlets: ' + m[0].slice(0, 40));
    names.add(s[1]);
  }
  return names;
}

function passedNames(js, page) {
  const src = fs.readFileSync(path.join(SCRIPTS, js), 'utf8');
  const at = src.indexOf('renderPageTemplate_("' + page + '", {');
  assert.ok(at !== -1, js + ' renders ' + page);
  const body = src.slice(at, src.indexOf('\n  });', at));
  return new Set([...body.matchAll(/^\s{4}([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]));
}

for (const p of PAGES) {
  test(p.page + ': the names the template prints are exactly the values ' + p.fn + ' passes', () => {
    const html = fs.readFileSync(path.join(SCRIPTS, p.page + '.html'), 'utf8');
    assert.deepEqual([...templateNames(html)].sort(), [...passedNames(p.js, p.page)].sort());
  });

  test(p.page + ': is in its project, renders whole, and every inline script parses', () => {
    assert.ok((projectMap[p.project].html || []).includes('cas-ccps/scripts/' + p.page + '.html'), 'listed in project-map html');
    const { exported } = loadGasFiles(projectMap[p.project].files.map((f) => path.join(ROOT, f)), [p.fn]);
    const out = p.build(exported);
    assert.match(out, /^<!DOCTYPE html>/);
    assert.match(out, /<\/html>$/);
    assert.doesNotMatch(out, /<\?/, 'no scriptlet left unrendered');
    const scripts = [...out.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script[^>]*>/gi)].map((m) => m[1]);
    assert.ok(scripts.length >= 1);
    scripts.forEach((s, i) => assert.doesNotThrow(() => new vm.Script(s), p.page + ' script ' + i));
  });
}

test('no dashboard .js still builds its page as a template literal', () => {
  ['07_TeacherDashboard.js', '13_StudentDashboard.js'].forEach((f) => {
    assert.doesNotMatch(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'), /return `<!DOCTYPE html>/, f);
  });
});
