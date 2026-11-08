'use strict';
// tools/release-check (plan item L1): Drive IDs and Docs links, Apps Script
// URLs, exports, LICENSE, secrets and student-data patterns, reported
// without ever printing a value; warn-only by default, a flag turns the gate
// on. Every ID and token here is made up and assembled at run time, so this
// file doesn't trip the scan itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const rc = require('../../tools/release-check/check.js');

// A Drive-shaped ID: mixed case, digits, 44 characters.
const rnd = (n) => ('Zq9xK2mWv7Lp4Rt8Yb3Nc6Hd1Jf5Gs0' + 'aBcDeFgHiJkLmNoPqRsTuVwXyZ_-').repeat(4).slice(0, n);
const DRIVE_ID = rnd(44);
const FOLDER_ID = rnd(33);
const SCRIPT_ID = rnd(72);
const DOCS = 'https://docs.google' + '.com/';
const DRIVE = 'https://drive.google' + '.com/';
const SCRIPT = 'https://script.google' + '.com/';

const rules = (line) => rc.scanLine(line).map((f) => f.rule);
const shown = (line) => rc.scanLine(line).map((f) => f.shown).join(' | ');
const valueRe = (v) => new RegExp(v.slice(0, 20).replace(/[-]/g, '\\-'));

test('Docs, Sheets, Slides and Forms links are docs-link findings', () => {
  ['document', 'spreadsheets', 'presentation', 'forms'].forEach((kind) => {
    assert.deepEqual(rules('see ' + DOCS + kind + '/d/' + DRIVE_ID + '/edit'), ['docs-link'], kind);
  });
  assert.deepEqual(rules(DOCS + 'forms/d/e/' + DRIVE_ID + '/viewform'), ['docs-link'], 'a published form');
  assert.deepEqual(rules(DOCS + 'document/u/1/d/' + DRIVE_ID), ['docs-link'], 'an account-indexed link');
});

test('Drive file, folder and open?id= links are drive-link findings', () => {
  assert.deepEqual(rules(DRIVE + 'file/d/' + DRIVE_ID + '/view'), ['drive-link']);
  assert.deepEqual(rules(DRIVE + 'drive/folders/' + FOLDER_ID), ['drive-link']);
  assert.deepEqual(rules(DRIVE + 'drive/u/0/folders/' + FOLDER_ID), ['drive-link']);
  assert.deepEqual(rules(DRIVE + 'open?id=' + DRIVE_ID), ['drive-link']);
  assert.deepEqual(rules(DRIVE + 'uc?export=download&id=' + DRIVE_ID), ['drive-link']);
});

test('a placeholder link (no ID-shaped value) is not a finding', () => {
  assert.deepEqual(rules(DOCS + 'document/d/<id>/edit'), []);
  assert.deepEqual(rules(DOCS + 'spreadsheets/d/.../edit'), []);
  assert.deepEqual(rules(DRIVE + 'drive/folders/FOLDER_ID'), []);
  assert.deepEqual(rules(SCRIPT + 'macros/s/<id>/exec'), []);
});

test('an ID is a finding only where it is labelled as one', () => {
  assert.deepEqual(rules("const TEACHER_FOLDER_ID = '" + FOLDER_ID + "';"), ['drive-id-labelled']);
  assert.deepEqual(rules('{ "docId": "' + DRIVE_ID + '" }'), ['drive-id-labelled']);
  assert.deepEqual(rules("DriveApp.getFileById('" + DRIVE_ID + "')"), ['drive-id-call']);
  assert.deepEqual(rules("SpreadsheetApp.openById(\"" + FOLDER_ID + "\")"), ['drive-id-call']);
  assert.deepEqual(rules("getFolderById(props.getProperty('TEACHER_FOLDER_ID'))"), [], 'read from Script Properties');
});

test('look-alikes are not Drive IDs', () => {
  const hex44 = 'a3f9c0d17e5b2468'.repeat(3).slice(0, 44);
  assert.deepEqual(rules("const SESSION_ID = '" + hex44 + "';"), [], 'a hex hash, even labelled');
  assert.deepEqual(rules("fixture: '" + DRIVE_ID + "'"), [], 'an unlabelled 44-character token');
  assert.deepEqual(rules('"lessonId": "THE-4-PS-OF-THE-FAN-EXPERIENCE-X"'), [], 'a slug');
  assert.deepEqual(rules("const CONFIG_ID = 'teacher_dashboard_config_value_x';"), [], 'a snake_case word');
  assert.deepEqual(rules("const OTHER_ID = '" + rnd(60) + "';"), [], 'too long for Drive, not a script name');
});

test('Apps Script URLs and IDs are their own bucket; a domain web app is its own category', () => {
  const plain = rc.scanLine(SCRIPT + 'macros/s/' + SCRIPT_ID + '/exec');
  assert.deepEqual(plain.map((f) => [f.rule, f.bucket]), [['script-url', 'script']]);
  const dom = rc.scanLine(SCRIPT + 'a/macros/example.org/s/' + SCRIPT_ID + '/exec');
  assert.deepEqual(dom.map((f) => [f.rule, f.bucket]), [['script-url-domain', 'script']]);
  assert.doesNotMatch(dom[0].shown, /example/, 'the domain is redacted too');
  assert.deepEqual(rules(SCRIPT + 'home/projects/' + SCRIPT_ID + '/edit'), ['script-project-link']);
  assert.deepEqual(rules('{ "scriptId": "' + rnd(57) + '" }'), ['script-id-labelled']);
  assert.deepEqual(rules("const DEPLOYMENT_ID = '" + SCRIPT_ID + "';"), ['script-id-labelled']);
});

test('secret shapes are findings', () => {
  assert.deepEqual(rules('-----BEGIN RSA ' + 'PRIVATE KEY-----'), ['private-key']);
  assert.deepEqual(rules('key=' + 'AIza' + rnd(35)), ['google-api-key']);
  assert.deepEqual(rules('ghp_' + 'A1b2C3d4'.repeat(5)), ['github-token']);
  assert.deepEqual(rules('sk_live_' + 'A1b2C3d4'.repeat(3)), ['stripe-live-key']);
  assert.deepEqual(rules('sk_test_' + 'A1b2C3d4'.repeat(3)), [], 'a Stripe test key is not a live key');
});

test('redaction never prints a value, only its length', () => {
  const lines = [
    DOCS + 'document/d/' + DRIVE_ID + '/edit',
    DRIVE + 'drive/folders/' + FOLDER_ID,
    "const TEACHER_FOLDER_ID = '" + FOLDER_ID + "';",
    "getFileById('" + DRIVE_ID + "')",
    SCRIPT + 'a/macros/example.org/s/' + SCRIPT_ID + '/exec',
    'AIza' + rnd(35),
  ];
  lines.forEach((l) => {
    const s = shown(l);
    assert.doesNotMatch(s, valueRe(DRIVE_ID), l.slice(0, 30));
    assert.doesNotMatch(s, valueRe(FOLDER_ID));
    assert.doesNotMatch(s, valueRe(SCRIPT_ID));
    assert.match(s, /…\(\d+\)/);
  });
  assert.match(shown(DOCS + 'document/d/' + DRIVE_ID), /^docs\.google\.com\/document\/d\/…\(44\)$/);
});

test('exports and manifests: data files fail, appsscript.json is probably fine, documents are for review', () => {
  const c = (p, text = '') => rc.classifyFile(p, () => text);
  assert.deepEqual(c('cas-ccps/data/x.csv'), { rule: 'export-file', bucket: 'export' });
  assert.deepEqual(c('drive-curation/Catalog.xlsx'), { rule: 'export-file', bucket: 'export' });
  assert.deepEqual(c('cas-ccps/curriculum/canvas-cartridges/8175.imscc'), { rule: 'export-file', bucket: 'export' });
  assert.deepEqual(c('meta/gradebook_notes.txt'), { rule: 'export-named', bucket: 'export' });
  const listing = JSON.stringify([1, 2, 3].map((i) => ({ id: 'x' + i, mimeType: 'application/vnd.google-apps.document' })));
  assert.deepEqual(c('tools/x/files.json', listing), { rule: 'drive-listing-json', bucket: 'export' });
  assert.equal(c('tools/x/config.json', '{"a":1}'), null);
  assert.deepEqual(c('cas-ccps/clasp/manifests/central-ledger.appsscript.json'), { rule: 'apps-script-manifest', bucket: 'probably-fine' });
  assert.deepEqual(c('kos-personal/appsscript.json'), { rule: 'apps-script-manifest', bucket: 'probably-fine' });
  assert.deepEqual(c('cas-ccps/docs/Guide.docx'), { rule: 'office-document', bucket: 'review' });
});

test('LICENSE is checked per published unit', () => {
  const l = rc.licenseFindings(['README.md', 'cas-ccps/LICENSE', 'kos-personal/LICENSE.md', 'leader-hub/README.md']);
  assert.deepEqual(l.map((x) => [x.unit, x.has]), [['(root)', false], ['cas-ccps', true], ['leader-hub', false], ['kos-personal', true]]);
});

function fakeRun(argv, env = {}, extra = {}) {
  const files = Object.assign({
    'LICENSE': 'MIT', 'cas-ccps/LICENSE': 'MIT', 'leader-hub/LICENSE': 'MIT', 'kos-personal/LICENSE': 'MIT',
    'cas-ccps/scripts/a.js': "const TEACHER_FOLDER_ID = '" + FOLDER_ID + "';\n",
  }, extra);
  const lines = [];
  const r = rc.run({ argv, env, files: Object.keys(files), read: (f) => Buffer.from(files[f]), log: (s) => lines.push(s) });
  return { code: r.code, out: lines.join('\n'), findings: r.findings };
}

test('warn-only exits 0 with findings; the gate flag or env makes it exit 1', () => {
  const warn = fakeRun([]);
  assert.equal(warn.code, 0);
  assert.match(warn.out, /cas-ccps\/scripts\/a\.js:1 {2}drive-id-labelled {2}TEACHER_FOLDER_ID = …\(33\)/);
  assert.match(warn.out, /warn-only/);
  assert.doesNotMatch(warn.out, valueRe(FOLDER_ID));
  assert.equal(fakeRun(['--gate']).code, 1);
  assert.equal(fakeRun([], { RELEASE_CHECK_GATE: '1' }).code, 1);
  assert.equal(fakeRun([], { RELEASE_CHECK_GATE: '0' }).code, 0);
});

test('the gate passes a clean tree, and probably-fine or review items never fail it', () => {
  const clean = fakeRun(['--gate'], {}, {
    'cas-ccps/scripts/a.js': "const id = PropertiesService.getScriptProperties().getProperty('TEACHER_FOLDER_ID');\n",
    'kos-personal/appsscript.json': '{"timeZone":"America/New_York"}',
    'cas-ccps/docs/Guide.docx': 'not a zip',
  });
  assert.equal(clean.code, 0, clean.out);
});

test('a missing LICENSE and a student-shaped address fail the gate', () => {
  const files = ['LICENSE', 'cas-ccps/LICENSE', 'kos-personal/LICENSE'];
  const r2 = rc.run({ argv: ['--gate'], env: {}, files, read: () => Buffer.from('x'), log: () => {} });
  assert.equal(r2.code, 1);
  assert.ok(r2.findings.some((f) => f.rule === 'license-missing' && f.where === 'leader-hub/LICENSE'));
  const sd = rc.scanText('reach ' + '123456789' + '@example.org', 'f.md', []);
  assert.deepEqual(sd.map((f) => [f.rule, f.bucket]), [['id-shaped-email', 'student-data']]);
  assert.match(sd[0].shown, /^hash [0-9a-f]{12}$/);
});
