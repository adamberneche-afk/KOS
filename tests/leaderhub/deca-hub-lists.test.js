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

// Each school year has its own conferences (the operator, 2026-11-23): the
// results board and the approval checklist read them from DECA_SEASON, keyed
// "<year>:<name>", so a new season brings a new set and last season's
// results stay under "Earlier seasons".
function seasonHelpers() {
  const cut = (a, b) => { const i = SRC.indexOf(a), j = SRC.indexOf(b, i + 1); assert.ok(i >= 0 && j > i, a); return SRC.slice(i, j); };
  const ctx = {};
  vm.runInNewContext(cut('const DECA_SEASON_YEAR =', 'let DECA_SEASON =') + 'var DECA_SEASON = DECA_SEASON_DEFAULT;\n' +
    cut('function decaSeasonConferences_(', '// The season notice is the one') +
    cut('function decaTripForConference_(', 'function renderDecaApprovalChecklist(') +
    'this.confs = decaSeasonConferences_; this.tripFor = decaTripForConference_; this.label = decaEventLabel_;', ctx);
  return ctx;
}

test('the season\'s conferences come from DECA_SEASON, keyed by year; a season without a year has none', () => {
  const { confs } = seasonHelpers();
  const all = JSON.parse(JSON.stringify(confs()));
  assert.deepEqual(all.map((c) => c.id), ['2026-27:Power Trip', '2026-27:DLC', '2026-27:SLC', '2026-27:ICDC']);
  assert.deepEqual(all.filter((c) => c.competitive).map((c) => c.short), ['DLC', 'SLC', 'ICDC']);
  assert.equal(all[3].label, 'ICDC Anaheim — Apr 17–20');
  assert.deepEqual(JSON.parse(JSON.stringify(confs({ title: 'old', stages: [{ label: 'DLC', date: '2025-12-03', conference: 'DLC' }] }))), [],
    'a saved season from before years has none, and the cards say how to fix it');
  const next = confs({ year: '2027-28', stages: [{ label: 'DLC', date: '2027-12-10', conference: 'DLC', competitive: true }] });
  assert.equal(next[0].id, '2027-28:DLC', 'next year\'s DLC is a new event');
});

test('a conference\'s trip is the one departing from two days before it through its last day', () => {
  const { confs, tripFor } = seasonHelpers();
  const icdc = confs().find((c) => c.short === 'ICDC');
  const trips = [{ id: 1, date: '2027-04-14' }, { id: 2, date: '2027-04-16' }];
  assert.equal(tripFor(icdc, trips).id, 2);
  assert.equal(tripFor(icdc, [{ id: 1, date: '2027-04-14' }]), null);
});

test('earlier seasons\' results keep a readable label', () => {
  const { label } = seasonHelpers();
  assert.equal(label('slc26'), 'SLC 2025–26');
  assert.equal(label('2026-27:DLC'), 'DLC 2026-27');
});

test('no fixed list of conferences is left on the hub', () => {
  assert.doesNotMatch(SRC, /DECA_RESULT_EVENTS|DECA_APPROVAL_EVENTS|tripId:\d/);
});

test('the hub\'s subtitle and the registration email name the season\'s own year, not 25–26', () => {
  const f05 = fs.readFileSync(path.join(__dirname, '..', '..', 'leader-hub', 'src', '05-data-helpers-dashboard.html'), 'utf8');
  assert.match(f05, /decaSub\.textContent = `\$\{PROFILE\.school\} · \$\{\(typeof DECA_SEASON !== 'undefined' && DECA_SEASON\.year\) \|\| DECA_SEASON_YEAR\} Season/);
  assert.match(SRC, /registration finalized for the \$\{\(DECA_SEASON && DECA_SEASON\.year\) \|\| DECA_SEASON_YEAR\} season!/);
  assert.match(SRC, /persistDecaSeason\(\); _applyProfileToStaticDOM\(\);[\s\S]*persistDecaSeason\(\); _applyProfileToStaticDOM\(\);/, 'a season change retitles the hub');
});
