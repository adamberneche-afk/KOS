'use strict';
// Stage 4 of the turn-in code (meta/TURN_IN_CODE_PLAN_2026-11.md, D17): the
// cartridge builder's --turn-in option. Pins: without it the cartridges are
// the committed bytes; a selected lesson's assignment takes a text entry
// (Canvas's importer reads <format type="text"/> as online_text_entry) and
// opens with the turn-in instruction, linking the dashboard the page already
// links; every other assignment is unchanged and still takes a URL; the
// selector takes course codes and lesson ConfigIDs and refuses units, parts
// and unknown names with a message; --print lists exactly the selected
// assignments.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../../tools/cas-ccps/build-canvas-cartridge.js');
const { writeZip } = require('../../tools/cas-ccps/zip.js');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'cas-ccps', 'curriculum', 'canvas-cartridges');
const lessons = require('../../tools/cas-ccps/build-lesson-assignments.js').build();
const dashboardUrl = B.studentDashboardUrl();
const files = (c) => Object.fromEntries(c.entries.map(([p, v]) => [p, String(v)]));
const asg = (c, title) => Object.values(files(c)).find((x) => x.includes('<title>' + title + '</title>') && /<assignment /.test(x));
// The page is HTML inside XML: unescape once to read the HTML.
const html = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

const PILOT = 'CAS-8177-THE-HYPE-MACHINE';
const def = B.build();
const sel = B.build({ turnIn: PILOT + ',cas-8175-l05' });
const course = (built, code) => built.find((c) => c.name === code + '.imscc');

test('without --turn-in the cartridges are byte for byte the committed ones', () => {
  def.forEach((c) => assert.ok(fs.readFileSync(path.join(DIR, c.name)).equals(writeZip(c.entries)), c.name));
  B.build({}).forEach((c, i) => assert.ok(writeZip(c.entries).equals(writeZip(def[i].entries)), c.name));
  def.forEach((c) => Object.entries(files(c)).filter(([p]) => p.endsWith('assignment.xml')).forEach(([p, x]) => {
    assert.match(x, /<submission_formats>\n {4}<format type="url"\/>\n {2}<\/submission_formats>/, p);
    assert.doesNotMatch(x, /turn-in code/, p);
  }));
});

test('a selected lesson takes a text entry and opens with the turn-in instruction, linking the dashboard', () => {
  const title = lessons.assignments['8177-the-hype-machine'].unitName;
  const x = asg(course(sel, '8177'), title);
  assert.ok(x, title);
  assert.ok(x.includes('  <submission_formats>\n    <format type="text"/>\n  </submission_formats>\n'), 'text entry');
  assert.doesNotMatch(x, /format type="url"/);
  assert.match(x, /<gradable points_possible="100">true<\/gradable>/, 'points unchanged');
  const h = html(x);
  const body = h.slice(h.indexOf('<text texttype="text/html">') + '<text texttype="text/html">'.length);
  assert.ok(body.startsWith('<p><strong>To turn this in:</strong> open your <a href="' + dashboardUrl +
    '">assignment dashboard</a>, answer the question about your feedback, then copy your turn-in code and paste it here.</p>\n'),
  body.slice(0, 300));
  assert.equal(body.split('\n')[0].split(/<[^>]+>/).join(''), B.TURN_IN_INSTRUCTION, 'the instruction, word for word');
  // The existing instructions stay below it; only "How to submit" asks for the code.
  const plain = html(asg(course(def, '8177'), title));
  ['This lesson is in 5 parts', 'Where to do this work', 'Get feedback', 'Submit for Feedback'].forEach((t) => {
    assert.ok(plain.includes(t) && h.includes(t), t);
  });
  assert.doesNotMatch(h, /Website URL/);
  assert.match(h, /<h3>How to submit<\/h3>\n<p>When you have finished every part and have your turn-in code, choose <strong>Start Assignment<\/strong> → <strong>Text Entry<\/strong>/);
  // Without the dashboard link the instruction says the words, invents no link.
  const bare = html(B.assignmentXml('id1', 'T', 'Do it.', null, '', null, { turnIn: true }));
  assert.match(bare, /<p><strong>To turn this in:<\/strong> open your assignment dashboard, answer/);
  assert.doesNotMatch(bare, /<a href/);
  assert.match(bare, /When you have your turn-in code, choose/);
});

test('only the selected assignments change; the rest are the default bytes', () => {
  const changed = [];
  sel.forEach((c, i) => {
    const a = files(c);
    const b = files(def[i]);
    assert.deepEqual(Object.keys(a), Object.keys(b));
    Object.keys(a).forEach((p) => { if (a[p] !== b[p]) changed.push(c.name + ' ' + p); });
  });
  assert.equal(changed.length, 2, changed.join(', '));
  assert.ok(asg(course(sel, '8175'), lessons.assignments['8175-L05'].unitName).includes('format type="text"'));
  assert.ok(asg(course(sel, '8175'), lessons.assignments['8175-L06'].unitName).includes('format type="url"'));
});

test('a course code selects every lesson of that course and nothing of the other', () => {
  const keys = B.parseTurnIn('8177', lessons);
  assert.deepEqual([...keys], lessons.order['8177']);
  const built = B.build({ turnIn: '8177' });
  Object.entries(files(course(built, '8177'))).filter(([p]) => p.endsWith('assignment.xml'))
    .forEach(([p, x]) => assert.match(x, /format type="text"/, p));
  assert.ok(writeZip(course(built, '8175').entries).equals(writeZip(course(def, '8175').entries)));
});

test('the selector: ConfigIDs with or without CAS-, any case, commas or spaces; units, parts and unknowns refused', () => {
  assert.deepEqual([...B.parseTurnIn('CAS-8175-L05, 8175-l06 cas-8177-the-hype-machine', lessons)],
    ['8175-L05', '8175-L06', '8177-the-hype-machine']);
  const refused = (spec, re) => assert.throws(() => B.parseTurnIn(spec, lessons), re, JSON.stringify(spec));
  refused('', /needs a selector/);
  refused('8177:U3', /names a unit, and the lesson data has no unit field/);
  refused('9999', /no course 9999/);
  refused('CAS-8177-THE-HYPE-MACHINE-P2', /is a part of CAS-8177-THE-HYPE-MACHINE; .*name the lesson/);
  refused('CAS-8175-L99', /no lesson CAS-8175-L99/);
  assert.throws(() => B.build({ turnIn: 'nope' }), /no lesson nope/);
});

test('--print lists exactly the selected assignments and the text to paste', () => {
  const out = B.turnInSteps(PILOT + ',CAS-8175-L05', lessons);
  const rows = out.split('\n').filter((l) => /^ {2}\d{4} {2}CAS-/.test(l));
  assert.deepEqual(rows, [
    '  8175  CAS-8175-L05  ' + lessons.assignments['8175-L05'].unitName,
    '  8177  ' + PILOT + '  ' + lessons.assignments['8177-the-hype-machine'].unitName + '  [5 parts]',
  ]);
  assert.match(out, /2 assignment\(s\) to switch by hand \(no re-import\)/);
  assert.ok(out.includes('(A) ' + B.TURN_IN_INSTRUCTION + '\n'));
  assert.match(out, /\(B\) When you have your turn-in code/);
  assert.match(out, /\(C\) When you have finished every part/);
  assert.match(out, /Text Entry checked and Website URL unchecked/);
  assert.match(out, /the formative group/);
  assert.doesNotMatch(out, /https?:\/\//, 'no URL is printed');
  assert.doesNotMatch(B.turnInSteps('CAS-8175-L05', lessons), /\(C\)/, 'no parts, no (C)');
  assert.equal(B.turnInAssignments('8175', lessons).length, lessons.order['8175'].length);
});

test('the --turn-in output folder is git-ignored and is not the committed folder', () => {
  assert.match(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'), /^cas-ccps\/curriculum\/canvas-cartridges\/turn-in\/$/m);
});
