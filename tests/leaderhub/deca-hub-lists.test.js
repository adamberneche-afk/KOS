'use strict';
// The DECA hub's key contacts and chapter reference (the operator,
// 2026-11-23): edited on the page, one line each, saved to the server's copy
// like every setting. The 25–26 season's typed-in trip cards, fees and ICDC
// alert are gone; the timeline comes from DECA_SEASON.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'src', '07-events-email-members-goals.html'), 'utf8');

function listHelpers() {
  const start = SRC.indexOf('const DECA_LIST_KINDS = {');
  const end = SRC.indexOf('function openDecaListEditor(');
  assert.ok(start !== -1 && end > start, 'the list helpers are found');
  const ctx = {};
  vm.runInNewContext(SRC.slice(start, end) + '\nthis.toText = decaListToText_; this.fromText = decaListFromText_;', ctx);
  return ctx;
}

test('a contact line splits on "|" into name, role, phone and email, and writes back the same way', () => {
  const { toText, fromText } = listHelpers();
  const list = fromText('contacts', ' Pat Doe | Co-advisor | (555) 010-0000 | pat@example.org \n\n  Sam Roe | Principal ');
  assert.deepEqual(JSON.parse(JSON.stringify(list)), [
    { name: 'Pat Doe', role: 'Co-advisor', phone: '(555) 010-0000', email: 'pat@example.org' },
    { name: 'Sam Roe', role: 'Principal', phone: '', email: '' },
  ]);
  assert.equal(toText('contacts', list), 'Pat Doe | Co-advisor | (555) 010-0000 | pat@example.org\nSam Roe | Principal |  | ');
});

test('a reference line keeps any further "|" in its value; an empty box clears the list', () => {
  const { fromText } = listHelpers();
  assert.deepEqual(JSON.parse(JSON.stringify(fromText('reference', 'SLC | $350 | with dinner'))),
    [{ label: 'SLC', value: '$350 | with dinner' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(fromText('reference', '  \n '))), []);
});

test('the hub has no typed-in season: no 25–26 cards, fees or ICDC alert, and the timeline is titled from DECA_SEASON', () => {
  const hub = SRC.slice(SRC.indexOf('function renderDECAHub()'), SRC.indexOf('const DECA_LIST_KINDS = {'));
  assert.doesNotMatch(hub, /25–26|RESULTS PENDING|icdcAlert|seasonCards|Fee Schedule/);
  assert.match(hub, /card\(escH\(DECA_SEASON\.title \|\| 'Season Timeline'\)/);
  assert.match(hub, /openDecaListEditor\('\$\{kind\}'\)/);
});

test('the chapter reference is saved to the server like the key contacts', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'src', '05-data-helpers-dashboard.html'), 'utf8');
  const config = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'Config.gs'), 'utf8');
  assert.match(page, /'lh_keyContacts', 'lh_chapter_reference'/);
  assert.match(config, /'lh_chapter_reference',/);
});
