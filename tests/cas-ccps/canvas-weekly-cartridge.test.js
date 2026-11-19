'use strict';
// The week's Canvas assignments with due dates (79, 2026-11-19, the
// operator: lessons opened before they were on Canvas; no Canvas API). Pins:
// 79b is the builder's output, each assignment byte for byte the full
// cartridge's with the same identifiers; the due date is 11:59 p.m. on the
// school day before the course's next lesson, in UTC; a run puts each
// upcoming lesson in its course's cartridge with Canvas's settings block
// (due date, published, submission type, points), leaves out one already in
// the course's Canvas export (its due date listed to set by hand), a held one
// and the course's last dated lesson's due date; a preview writes nothing.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles, FakeDriveFolder } = require('../harness/gas-sandbox');
const cartridge = require('../../tools/cas-ccps/build-canvas-cartridge.js');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = require('../../tools/gas-lint/project-map.json')['cas-ccps:central-ledger'];
const FILES = PROJECT.files.map((f) => path.join(ROOT, f));
const plain = (o) => JSON.parse(JSON.stringify(o));

function load(opts = {}) {
  const env = loadGasFiles(FILES, ['weeklyCanvasCartridge_', 'previewWeeklyCanvasCartridge', 'buildWeeklyCanvasCartridge',
    'installWeeklyCanvasCartridge', 'cwcDueDay_', 'cwcUtcStamp_', 'cwcAssignmentXml_', 'CANVAS_CARTRIDGE_LESSONS',
    'LESSON_ORDER']);
  const { sandbox } = env;
  const ss = sandbox.SpreadsheetApp.create('Central Ledger');
  sandbox.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sandbox.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', 'teacher@ccpsnet.net');
  const folder = new FakeDriveFolder('Teacher', 'teacher-folder-1');
  sandbox.DriveApp._registerFolder(folder);
  props.setProperty('TEACHER_FOLDER_ID', folder.getId());
  if (opts.turnIn !== undefined) props.setProperty('TURN_IN_CODE_COURSES', opts.turnIn);
  if (opts.schedule) sandbox._lsRows_ = () => opts.schedule;
  sandbox._criFindExports_ = () => opts.exports || [];
  return Object.assign(env, { ss, folder, props });
}

const exportOf = (course, titles) => ({ getName: () => '2026-11-19_Grades-' + course + '.csv',
  getLastUpdated: () => new Date('2026-11-19T12:00:00Z'),
  getBlob: () => ({ getDataAsString: () => '"Student","ID","SIS User ID","SIS Login ID","Section",' +
    titles.map((t, i) => '"' + t.replace(/"/g, '""') + ' (' + (100 + i) + ')"').join(',') + '\n' }) });

test('79b is the builder\'s output; each assignment is the full cartridge\'s, with the same identifiers', () => {
  assert.equal(fs.readFileSync(cartridge.GAS_DATA_PATH, 'utf8'), cartridge.gasData(),
    'run: node tools/cas-ccps/build-canvas-cartridge.js');
  const { exported } = load();
  const L = exported.CANVAS_CARTRIDGE_LESSONS;
  const full = {};
  cartridge.build().forEach((c) => c.entries.forEach(([p, v]) => { full[p] = String(v); }));
  const keys = Object.keys(L);
  assert.ok(keys.length > 50);
  keys.forEach((k) => assert.equal(L[k].url, full[L[k].assignmentId + '/assignment.xml'], k + ': the full cartridge\'s XML'));
  const k = keys[0];
  assert.match(L[k].text, /<format type="text"\/>/);
  assert.match(L[k].text, /To turn this in:/);
  assert.match(L[k].url, /<format type="url"\/>/);
});

test('the due date: 11:59 p.m. on the school day before the next lesson; none for the last; UTC for Canvas', () => {
  const { exported, props } = load();
  // Read once per run (00's schoolDaysOff_), so set before the first call.
  props.setProperty('SCHOOL_DAYS_OFF', '2026-11-30,2026-11-27,2026-11-26,2026-11-25');
  const rows = [{ key: 'a', start: '2026-11-16' }, { key: 'b', start: '2026-11-23' }, { key: 'c', start: '2026-12-01' }];
  assert.equal(exported.cwcDueDay_(rows, rows[0]), '2026-11-20', 'Monday the 23rd: due the Friday before');
  assert.equal(exported.cwcDueDay_(rows, rows[1]), '2026-11-24', 'days off skipped back to Tuesday');
  assert.equal(exported.cwcDueDay_(rows, rows[2]), '', 'the course\'s last dated lesson');
  assert.equal(exported.cwcUtcStamp_('2026-11-20', '23:59', 'America/New_York'), '2026-11-21T04:59:00', 'EST is UTC-5');
  assert.equal(exported.cwcUtcStamp_('2026-09-18', '23:59', 'America/New_York'), '2026-09-19T03:59:00', 'EDT is UTC-4');
});

test('a run: upcoming lessons in their course\'s cartridge with Canvas\'s settings; on-Canvas and held ones left out', () => {
  const probe = load();
  const order = probe.exported.LESSON_ORDER;
  const L = probe.exported.CANVAS_CARTRIDGE_LESSONS;
  const [a, b, c, d] = order['8177'].filter((k) => L[k]).slice(0, 4);
  const [e] = order['8175'].filter((k) => L[k]);
  // Run on Thu Nov 19: the next 7 days are Nov 20-26.
  const schedule = {
    '8177': [{ key: a, start: '2026-11-16' }, { key: b, start: '2026-11-20' }, { key: c, start: '2026-11-23' },
      { key: d, start: '2026-11-25', hold: true }],
    '8175': [{ key: e, start: '2026-11-24' }],
  };
  const env = load({ schedule, turnIn: '8177', exports: [exportOf('8177', ['L00 ' + L[c].title])] });
  const now = new Date('2026-11-19T15:00:00-05:00');
  const res = plain(env.exported.weeklyCanvasCartridge_({ apply: true, now }));
  assert.equal(res.from, '2026-11-20');
  assert.equal(res.to, '2026-11-26');
  const s77 = Object.fromEntries(res.courses['8177'].lessons.map((l) => [l.key, l]));
  assert.equal(s77[b].status, 'IN');
  assert.equal(s77[b].due, '2026-11-20', 'due the school day before the next lesson (Mon 23rd): Friday');
  assert.equal(s77[c].status, 'ON_CANVAS', 'already in the export: left out');
  assert.equal(s77[d].status, 'HELD');
  assert.ok(!(a in s77), 'started before the week');
  assert.equal(res.courses['8175'].lessons[0].due, '', 'its last dated lesson: no due date');

  const files = env.folder.files.filter((f) => /\.imscc$/.test(f.getName()));
  assert.deepEqual(files.map((f) => f.getName()).sort(), ['Canvas 8175 week of 2026-11-20.imscc', 'Canvas 8177 week of 2026-11-20.imscc']);
  const entries = Object.fromEntries(files.find((f) => /8177/.test(f.getName()))._zipEntries.map((x) => [x.name, x.text]));
  assert.deepEqual(Object.keys(entries).sort(), [L[b].assignmentId + '/assignment.xml', 'imsmanifest.xml'].sort(),
    'only the lesson that goes in');
  const xml = entries[L[b].assignmentId + '/assignment.xml'];
  assert.ok(xml.startsWith(L[b].text.replace(/<\/assignment>\s*$/, '')), 'the full cartridge\'s turn-in XML, unchanged');
  assert.match(xml, /<extensions>\n {4}<assignment identifier="g[0-9a-f]{32}_canvas" xmlns="http:\/\/canvas\.instructure\.com\/xsd\/cccv1p0">/);
  assert.match(xml, /<due_at>2026-11-21T04:59:00<\/due_at>/, 'Fri Nov 20, 11:59 p.m. Eastern, in UTC');
  assert.match(xml, /<workflow_state>published<\/workflow_state>/);
  assert.match(xml, /<submission_types>online_text_entry<\/submission_types>/, 'the turn-in switch covers 8177');
  assert.match(xml, /<points_possible>100<\/points_possible>/);
  assert.match(xml, /<\/extensions>\n<\/assignment>\n$/);
  const manifest = entries['imsmanifest.xml'];
  assert.match(manifest, new RegExp('identifierref="' + L[b].assignmentId + '"'));
  assert.doesNotMatch(manifest, new RegExp(L[c].assignmentId), 'the on-Canvas lesson is not in it');
  // 8175 isn't covered by the switch: the Website URL, and no due date for its last lesson.
  const e75 = files.find((f) => /8175/.test(f.getName()))._zipEntries.find((x) => /assignment\.xml$/.test(x.name)).text;
  assert.match(e75, /<submission_types>online_url<\/submission_types>/);
  assert.doesNotMatch(e75, /<due_at>/);
});

test('a preview writes nothing; a week with no lesson says so; the Friday trigger installs once', () => {
  const probe = load();
  const L = probe.exported.CANVAS_CARTRIDGE_LESSONS;
  const k = probe.exported.LESSON_ORDER['8177'].filter((x) => L[x])[0];
  const env = load({ schedule: { '8177': [{ key: k, start: '2026-11-20' }], '8175': [] } });
  const res = plain(env.exported.weeklyCanvasCartridge_({ apply: false, now: new Date('2026-11-19T15:00:00-05:00') }));
  assert.equal(res.courses['8177'].lessons[0].status, 'IN');
  assert.equal(env.folder.files.length, 0, 'nothing written');
  assert.match(res.message, /would go in a cartridge/);
  const none = load({ schedule: { '8177': [{ key: k, start: '2026-10-01' }], '8175': [] } });
  assert.match(plain(none.exported.weeklyCanvasCartridge_({ apply: true, now: new Date('2026-11-19T15:00:00-05:00') })).message,
    /^No lesson from 2026-11-20 to 2026-11-26 needs a cartridge\./);
  // The trigger's handler, run as the Friday trigger runs it (today's date).
  const friday = plain(none.exported.buildWeeklyCanvasCartridge());
  assert.equal(friday.apply, true);
  assert.match(friday.message, /^No lesson from /);
  assert.equal(env.exported.installWeeklyCanvasCartridge(), true);
  assert.equal(env.exported.installWeeklyCanvasCartridge(), false);
});
