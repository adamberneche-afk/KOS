'use strict';
// tools/archive: the catalog's rules (quarters, records, generated indexes)
// and the search, on a small fixture archive, then the real one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lib = require('../../tools/archive/lib');
const build = require('../../tools/archive/build');
const search = require('../../tools/archive/search');

const QUARTERS = { quarters: [
  { id: 'summer-2026', title: 'Summer 2026', start: '2026-05-30', end: '2026-08-23', prs: null, plan: null, summary: 'Summer.' },
  { id: '2026-27-Q1', title: '2026-27, 1st quarter', start: '2026-08-24', end: '2026-10-30', prs: 'through #345', plan: 'meta/PLAN_2026-10.md (live)', summary: 'Q1.' },
] };

const LOG = [
  '# CAS: entries before 2026-10-29 (archived)', '',
  '## UI/UX Hardening — Rounds 1–9', 'early work', '### A subsection', 'inside it',
  '## Late evaluations finish their rows, 2026-10-17', 'the 12-minute timeout (#179)',
  '## A note with no date', 'still about #179',
  '## UI/UX Hardening — Rounds 1–9', 'a repeated heading',
].join('\n');

function rec(id, extra) {
  const [quarter, ...rest] = id.split('/');
  return Object.assign({ id, original_path: rest.join('/'), quarter, kind: 'handoff', system: rest[0],
    date: null, filed_on: null, filed_by: 'its own date', archived: '2026-11-17', summary: 'A doc' }, extra);
}

function fixture(catalog, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w('archive/quarters.json', JSON.stringify(QUARTERS));
  w('archive/catalog.jsonl', catalog.map((r) => JSON.stringify(r)).join('\n') + '\n');
  Object.entries(files).forEach(([rel, text]) => w(rel, text));
  return root;
}

const GOOD = [
  rec('2026-27-Q1/meta/HANDOFF_2026-10-18.md', { date: '2026-10-18', filed_on: '2026-10-18', filed_by: 'the date in its name' }),
  rec('2026-27-Q1/cas-ccps/HISTORY.md', { kind: 'history', continues_in: 'cas-ccps/HISTORY.md', summary: 'CAS history' }),
];
const GOOD_FILES = {
  'archive/2026-27-Q1/meta/HANDOFF_2026-10-18.md': '# Handoff\n#179 is live; the turnstile timeout.\n',
  'archive/2026-27-Q1/cas-ccps/HISTORY.md': LOG,
};

test('entries: top-level headings only, GitHub anchors, undated ones dated by the entry above', () => {
  const e = lib.parseEntries(LOG);
  assert.deepEqual(e.map((x) => x.anchor), ['uiux-hardening--rounds-19', 'late-evaluations-finish-their-rows-2026-10-17',
    'a-note-with-no-date', 'uiux-hardening--rounds-19-1']);
  assert.equal(e[0].lines, 4, 'the ### subsection stays inside its entry');
  assert.equal(e[2].date, null);
  assert.equal(e[2].near, '2026-10-17');
  assert.deepEqual(lib.prRefs(e[1].body), [179]);
});

test('entries: a changelog whose first entries are ### and later ones ## counts both', () => {
  const e = lib.parseEntries('# Log\n### New one (2026-10-23)\nx\n## Round 3\ny\n### inside round 3\nz\n');
  assert.deepEqual(e.map((x) => x.title), ['New one (2026-10-23)', 'Round 3']);
});

test('quarters: a full date falls in one; a month overlaps the quarters it spans', () => {
  const q = QUARTERS.quarters;
  assert.deepEqual(lib.quartersFor('2026-08-24', q), ['2026-27-Q1']);
  assert.deepEqual(lib.quartersFor('2026-08', q), ['summer-2026', '2026-27-Q1']);
  assert.deepEqual(lib.quartersFor('2027-03-01', q), []);
});

test('check: a current fixture passes once built, and a stale index fails', () => {
  const root = fixture(GOOD, GOOD_FILES);
  assert.equal(build.main([], root), 0);
  assert.equal(build.main(['--check'], root), 0);
  fs.appendFileSync(path.join(root, 'archive/INDEX.md'), 'hand edit\n');
  assert.equal(build.main(['--check'], root), 1);
});

test('check: an uncatalogued file, a missing file and a wrong quarter are each an error', () => {
  const root = fixture(GOOD.concat([
    rec('2026-27-Q1/meta/GONE.md', { filed_by: 'x' }),
    rec('2026-27-Q1/meta/HANDOFF_2026-07-01.md', { date: '2026-07-01', filed_on: '2026-07-01' }),
  ]), Object.assign({ 'archive/2026-27-Q1/meta/STRAY.md': 'x', 'archive/2026-27-Q1/meta/HANDOFF_2026-07-01.md': 'x' }, GOOD_FILES));
  const errors = build.validate(lib.loadCatalog(root), lib.loadQuarters(root), root);
  assert.ok(errors.some((e) => /STRAY\.md: no catalog record/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /GONE\.md\): no such file/.test(e)));
  assert.ok(errors.some((e) => /filed_on 2026-07-01 is not in 2026-27-Q1/.test(e)));
});

test('check: a record without a date needs its filing note; a history record needs its live file', () => {
  const bad = [rec('2026-27-Q1/meta/HANDOFF_2026-10-18.md', { filed_by: '' }),
    rec('2026-27-Q1/cas-ccps/HISTORY.md', { kind: 'history' })];
  const root = fixture(bad, GOOD_FILES);
  const errors = build.validate(lib.loadCatalog(root), lib.loadQuarters(root), root);
  assert.ok(errors.some((e) => /missing filed_by/.test(e)));
  assert.ok(errors.some((e) => /needs continues_in/.test(e)));
});

test('search: filters first, then the text; a log is searched entry by entry', () => {
  const root = fixture(GOOD, GOOD_FILES);
  build.main([], root);
  const byPr = search.search(search.parseArgs(['--pr', '179']), root).map((h) => h.id);
  assert.deepEqual(byPr.sort(), ['2026-27-Q1/cas-ccps/HISTORY.md#a-note-with-no-date',
    '2026-27-Q1/cas-ccps/HISTORY.md#late-evaluations-finish-their-rows-2026-10-17',
    '2026-27-Q1/meta/HANDOFF_2026-10-18.md']);
  const timeout = search.search(search.parseArgs(['--entries', 'timeout']), root);
  assert.deepEqual(timeout.map((h) => h.id), ['2026-27-Q1/cas-ccps/HISTORY.md#late-evaluations-finish-their-rows-2026-10-17']);
  assert.equal(timeout[0].lines[0].line, 8, 'line numbers are the file\'s');
  const ranged = search.search(search.parseArgs(['--from', '2026-10-17', '--to', '2026-10-17', '--entries']), root);
  assert.equal(ranged.length, 3, 'the two undated entries below it take its date');
  assert.throws(() => search.parseArgs(['--kind', 'nope']));
});

test('the repo\'s own archive: catalog complete and indexes current', () => {
  const errors = build.validate(lib.loadCatalog(), lib.loadQuarters());
  assert.deepEqual(errors, []);
  const { out } = build.outputs();
  Object.entries(out).forEach(([rel, text]) => {
    assert.equal(fs.readFileSync(path.join(lib.REPO_ROOT, rel), 'utf8'), text, rel + ' is stale: run node tools/archive/build.js');
  });
});
