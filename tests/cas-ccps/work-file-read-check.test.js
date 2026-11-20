'use strict';
// checkWorkFileReads (13, 2026-11-19): Submit's read of every live form,
// deck and sheet, run from the Student Dashboard's editor as the account the
// dashboard runs as, so a missing permission or an unreadable file shows up
// before a student presses Submit (a student's Slides Submit failed that
// day: the Slides permission had never been granted). Pins: only shared,
// unarchived form/deck/sheet rows; the same feedback-page lookup and reader
// Submit uses; failures grouped by kind with the fix; counts by type; a time
// budget; nothing written. Made-up data only.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadGasFiles } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const FILES = require('../../tools/gas-lint/project-map.json')['cas-ccps:student-dashboard'].files.map((f) => path.join(ROOT, f));
const OWNER = 'teacher@example.invalid';

function load() {
  const logs = [];
  const env = loadGasFiles(FILES, ['checkWorkFileReads', '_dashCheckWorkFileReads_', 'LEDGER', 'FORM_SNAPSHOTS_HEADERS'], {
    Logger: { log: (m) => logs.push(String(m)) },
    Session: { getActiveUser: () => ({ getEmail: () => OWNER }), getEffectiveUser: () => ({ getEmail: () => OWNER }),
      getScriptTimeZone: () => 'America/New_York' },
  });
  const sb = env.sandbox;
  const ss = sb.SpreadsheetApp.create('Central Ledger');
  sb.SpreadsheetApp._registry.set(ss.getId(), ss);
  const props = sb.PropertiesService.getScriptProperties();
  props.setProperty('CENTRAL_LEDGER_SS_ID', ss.getId());
  props.setProperty('ADMIN_SS_ID', ss.getId());
  props.setProperty('TEACHER_EMAIL', OWNER);
  const L = env.exported.LEDGER;
  const ledger = ss.insertSheet('Ledger');
  ledger.appendRow(new Array(27).fill('h'));
  const snaps = ss.insertSheet('FormSnapshots');
  snaps.appendRow(env.exported.FORM_SNAPSHOTS_HEADERS);
  const url = { form: 'https://docs.google.com/forms/d/', slides: 'https://docs.google.com/presentation/d/',
    sheet: 'https://docs.google.com/spreadsheets/d/', doc: 'https://docs.google.com/document/d/' };
  const add = (config, file, type, status, snapshot) => {
    const r = new Array(27).fill('');
    r[L.CONFIG_ID] = config; r[L.FILE_ID] = file; r[L.STATUS] = status; r[L.ADMIN_FILE_URL] = url[type] + file + '/edit';
    ledger.appendRow(r);
    if (snapshot) snaps.appendRow([new Date(), config, file, 'snap-' + file, 'PART', '{}', '']);
  };
  add('W-S1', 'deck-ok', 'slides', 'ACTIVE', true);
  add('W-S2', 'deck-denied', 'slides', 'SUBMITTED', true);
  add('W-F1', 'form-gone', 'form', 'ACTIVE', true);
  add('W-F2', 'form-ok', 'form', 'COMPLETE', true);
  add('W-H1', 'sheet-nopage', 'sheet', 'ACTIVE', false);
  add('W-D1', 'doc-1', 'doc', 'ACTIVE', false);
  add('W-S3', 'deck-later', 'slides', 'SCHEDULED', true);
  add('W-S4', 'deck-old', 'slides', 'ARCHIVED', true);
  const read = [];
  sb.readSlidesStructure_ = (id) => {
    read.push(id);
    if (id === 'deck-denied') throw new Error('You do not have permission to call SlidesApp.openById. Required permissions: https://www.googleapis.com/auth/presentations');
    return { slides: [] };
  };
  sb.readFormStructure_ = (id) => {
    read.push(id);
    if (id === 'form-gone') throw new Error('No item with the given ID could be found.');
    return { items: [] };
  };
  sb.readSheetStructure_ = (id) => { read.push(id); return { tabs: [] }; };
  return Object.assign(env, { ss, logs, read, sb });
}

test('reads each shared form, deck and sheet as Submit does; groups the failures with the fix; writes nothing', () => {
  const env = load();
  const before = env.ss.getSheets().map((s) => s.getName() + ':' + s.getLastRow()).join();
  const res = JSON.parse(JSON.stringify(env.exported.checkWorkFileReads()));
  assert.equal(res.checked, 5, 'two decks, two forms, one sheet; the doc, the scheduled and the archived left out');
  assert.equal(res.ok, 2);
  assert.deepEqual(res.byType, { slides: { checked: 2, ok: 1 }, form: { checked: 2, ok: 1 }, sheet: { checked: 1, ok: 0 } });
  assert.deepEqual(env.read.sort(), ['deck-denied', 'deck-ok', 'form-gone', 'form-ok'], 'the sheet with no feedback page isn\'t read');
  assert.deepEqual(res.failures.map((f) => [f.configId, f.why]).sort(),
    [['W-F1', 'NOT_FOUND'], ['W-H1', 'NO_FEEDBACK_PAGE'], ['W-S2', 'PERMISSION']]);
  const log = env.logs.join('\n');
  assert.match(log, /\[ReadCheck\] decks: 1 of 2 read; forms: 1 of 2 read; sheets: 0 of 1 read\./);
  assert.match(log, /1 can't be read: The dashboard's account hasn't been granted this permission\. Remove the project's access at myaccount\.google\.com\/connections/);
  assert.match(log, /slides for ConfigID W-S2/);
  assert.match(log, /1 can't be read: The file is gone, or the dashboard's account can't open it/);
  assert.match(log, /1 can't be read: No FormSnapshots row/);
  assert.equal(env.ss.getSheets().map((s) => s.getName() + ':' + s.getLastRow()).join(), before, 'nothing written (no SubmitFailures)');
});

test('all readable: says so; past the time budget: says how many it didn\'t reach', () => {
  const env = load();
  env.sb.readSlidesStructure_ = () => ({ slides: [] });
  env.sb.readFormStructure_ = () => ({ items: [] });
  env.ss.getSheetByName('FormSnapshots').appendRow([new Date(), 'W-H1', 'sheet-nopage', 'snap', 'P', '{}', '']);
  const ok = JSON.parse(JSON.stringify(env.exported._dashCheckWorkFileReads_(Date.now())));
  assert.equal(ok.failures.length, 0);
  assert.match(env.logs.join('\n'), /Every one read: Submit can check them\./);
  env.logs.length = 0;
  const late = JSON.parse(JSON.stringify(env.exported._dashCheckWorkFileReads_(Date.now() - 5 * 60 * 1000)));
  assert.equal(late.notReached, 5);
  assert.match(env.logs.join('\n'), /5 not reached \(time budget\): run it again/);
});

// A part's template from the Central Ledger's _CONFIG tab (2026-11-19): the
// operator keeps WORK_TEMPLATE_… rows there; until then only a Script
// Property counted, so a row there was silently ignored.
test('a WORK_TEMPLATE_… row of the _CONFIG tab resolves like the Script Property; the property still wins', () => {
  const env = load();
  const cfg = env.ss.insertSheet('_CONFIG');
  cfg.appendRow(['Key', 'Value']);
  cfg.appendRow(['WORK_TEMPLATE_8177_THE_BACK_ROOM_P2', 'sheet-template-from-tab']);
  cfg.appendRow(['WORK_TEMPLATE_8177_X_P1', 'tab-value']);
  cfg.appendRow(['NOT_A_TEMPLATE', 'ignored']);
  const props = env.sb.PropertiesService.getScriptProperties();
  props.setProperty('WORK_TEMPLATE_8177_X_P1', 'property-value');
  const r = env.sandbox._resolveConfigValues_();
  assert.equal(r.values.WORK_TEMPLATE_8177_THE_BACK_ROOM_P2, 'sheet-template-from-tab');
  assert.equal(r.sources.WORK_TEMPLATE_8177_THE_BACK_ROOM_P2, 'Central Ledger _CONFIG tab');
  assert.equal(r.values.WORK_TEMPLATE_8177_X_P1, 'property-value', 'the property wins');
  assert.equal(r.values.NOT_A_TEMPLATE, undefined);
});
