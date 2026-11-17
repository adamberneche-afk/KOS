'use strict';
// tools/archive/file.js: filing a doc or a folder into archive/, and the
// history logs' rollover, each run in a scratch git repository.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const lib = require('../../tools/archive/lib');
const build = require('../../tools/archive/build');
const file = require('../../tools/archive/file');

const QUARTERS = { quarters: [
  { id: 'summer-2026', title: 'Summer 2026', start: '2026-05-30', end: '2026-08-23', prs: null, plan: null, summary: 'Summer.' },
  { id: '2026-27-Q1', title: '2026-27, 1st quarter', start: '2026-08-24', end: '2026-10-30', prs: null, plan: null, summary: 'Q1.' },
  { id: '2026-27-Q2', title: '2026-27, 2nd quarter', start: '2026-10-31', end: '2027-01-22', prs: null, plan: null, summary: 'Q2.' },
] };

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-file-'));
  const w = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  w('archive/quarters.json', JSON.stringify(QUARTERS));
  w('archive/catalog.jsonl', '');
  Object.entries(files).forEach(([rel, text]) => w(rel, text));
  const git = (...a) => execFileSync('git', a, { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  git('add', '-A');
  return { root, read: (rel) => fs.readFileSync(path.join(root, rel), 'utf8'), exists: (rel) => fs.existsSync(path.join(root, rel)) };
}

const quiet = (fn) => {
  const [log, warn, err] = [console.log, console.warn, console.error];
  const out = [];
  console.log = console.warn = console.error = (...a) => out.push(a.join(' '));
  try { return { code: fn(), out }; } finally { [console.log, console.warn, console.error] = [log, warn, err]; }
};

test('plan: the date in the name decides the quarter; a month across two quarters, or no date, asks', () => {
  const r = repo({ 'meta/HANDOFF_2026-10-22.md': '# H\n', 'meta/NOTES.md': '# Notes, 2026-08\n' });
  const quarters = QUARTERS.quarters;
  const p = file.plan(file.parseArgs(['meta/HANDOFF_2026-10-22.md', '--summary', 'x']), r.root, quarters);
  assert.equal(p.rec.quarter, '2026-27-Q1');
  assert.equal(p.rec.kind, 'handoff');
  assert.equal(p.rec.filed_by, 'the date in its name');
  assert.throws(() => file.plan(file.parseArgs(['meta/NOTES.md', '--summary', 'x', '--date', '2026-08']), r.root, quarters), /falls in summer-2026 and 2026-27-Q1/);
  const ok = file.plan(file.parseArgs(['meta/NOTES.md', '--summary', 'x', '--date', '2026-08', '--quarter', 'summer-2026', '--filed-by', 'before school started']), r.root, quarters);
  assert.equal(ok.rec.quarter, 'summer-2026');
  const noted = repo({ 'drive/INDEX.md': '# Index\n*(2026-11-15: links removed.)*\n' });
  const q = file.plan(file.parseArgs(['drive/INDEX.md', '--summary', 'x', '--quarter', 'summer-2026', '--filed-by', 'part of the summer overhaul']), noted.root, quarters);
  assert.equal(q.rec.quarter, 'summer-2026', '--quarter wins over an edit note near the top');
  assert.equal(q.rec.date, null);
  assert.throws(() => file.parseArgs(['x.md', '--summary', 'x', '--filed-on', '2026-10-01']), /--filed-on needs --filed-by/);
  assert.throws(() => file.parseArgs(['x.md']), /--summary is required/);
});

test('filing a doc: moved, live links and path mentions repointed, record added, check passes', () => {
  const r = repo({
    'meta/HANDOFF_2026-10-22.md': '# Handoff\n',
    'meta/README.md': 'See [the handoff](./HANDOFF_2026-10-22.md#queue) and `meta/HANDOFF_2026-10-22.md`.\n',
    'tools/x.js': "// from meta/HANDOFF_2026-10-22.md\nconst p = path.join('meta', 'HANDOFF_2026-10-22.md');\n",
  });
  const res = quiet(() => file.main(['meta/HANDOFF_2026-10-22.md', '--summary', 'Session handoff, 10-22'], r.root));
  assert.equal(res.code, 0, res.out.join('\n'));
  assert.ok(r.exists('archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md'));
  assert.ok(!r.exists('meta/HANDOFF_2026-10-22.md'));
  assert.equal(r.read('meta/README.md'), 'See [the handoff](../archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md#queue) and `archive/2026-27-Q1/meta/HANDOFF_2026-10-22.md`.\n');
  assert.match(r.read('tools/x.js'), /from archive\/2026-27-Q1\/meta\/HANDOFF_2026-10-22\.md/);
  assert.ok(res.out.some((l) => /tools\/x\.js: builds the path from quoted segments/.test(l)), 'the segment form is a warning, not a rewrite');
  const rec = lib.loadCatalog(r.root)[0];
  assert.equal(rec.id, '2026-27-Q1/meta/HANDOFF_2026-10-22.md');
  assert.equal(quiet(() => build.main(['--check'], r.root)).code, 0);
});

test('filing a folder: one record covers every file under it', () => {
  const r = repo({
    'cas-ccps/archived/README.md': '# Retired\n',
    'cas-ccps/archived/steps/Step.gs': 'function f() {}\n',
    'tools/map.json': '{"archived": "cas-ccps/archived/steps/"}\n',
  });
  const res = quiet(() => file.main(['cas-ccps/archived', '--summary', 'Retired scripts', '--filed-on', '2026-11-17',
    '--filed-by', 'retired 2026-11-17'], r.root));
  assert.equal(res.code, 0, res.out.join('\n'));
  assert.ok(r.exists('archive/2026-27-Q2/cas-ccps/archived/steps/Step.gs'));
  assert.equal(r.read('tools/map.json'), '{"archived": "archive/2026-27-Q2/cas-ccps/archived/steps/"}\n');
  const cat = lib.loadCatalog(r.root);
  assert.equal(cat.length, 1);
  assert.equal(cat[0].id, '2026-27-Q2/cas-ccps/archived/');
  assert.equal(quiet(() => build.main(['--check'], r.root)).code, 0);
});

test('filing: a folder with no date asks for one, and nothing moves', () => {
  const r = repo({ 'old/a.js': 'x\n' });
  const res = quiet(() => file.main(['old', '--summary', 'x'], r.root));
  assert.equal(res.code, 1);
  assert.ok(res.out.some((l) => /no date found/.test(l)));
  assert.ok(r.exists('old/a.js'));
});

const CAS = ['# CAS — Process History', '', 'Intro.', '',
  '## Round 1', 'undated, oldest', '',
  '## Two, 2026-10-12', 'q1', '',
  '## Three, 2026-11-02', 'q2 early', '',
  '## Four, 2026-11-20', 'stays live', ''].join('\n');
const KOS = ['# KOS Changelog', '',
  '### Newest (2026-11-20)', 'stays', '',
  '### Older (2026-11-02)', 'q2', '',
  '### Oldest (2026-10-12)', 'q1', ''].join('\n');

test('rollover: entries before the date move to their quarter\'s part, in the log\'s own order; the pointer follows', () => {
  const r = repo({ 'cas-ccps/HISTORY.md': CAS, 'kos-personal/CHANGELOG.md': KOS });
  const res = quiet(() => file.main(['--rollover-logs', '--before', '2026-11-15'], r.root));
  assert.equal(res.code, 0, res.out.join('\n'));
  const live = r.read('cas-ccps/HISTORY.md');
  assert.match(live, /## Four, 2026-11-20/);
  assert.doesNotMatch(live, /## Round 1|## Two|## Three/);
  assert.match(live, /archive:pointer[\s\S]*Entries before 2026-11-15[\s\S]*2026-27, 1st quarter[\s\S]*2026-27, 2nd quarter/);
  const q1 = r.read('archive/2026-27-Q1/cas-ccps/HISTORY.md');
  assert.ok(q1.indexOf('## Round 1') !== -1 && q1.indexOf('## Round 1') < q1.indexOf('## Two'),
    'an undated entry at the top of an oldest-first log is older than all: it goes with the first dated one below');
  assert.match(r.read('archive/2026-27-Q2/cas-ccps/HISTORY.md'), /## Three, 2026-11-02/);
  const kos = r.read('kos-personal/CHANGELOG.md');
  assert.match(kos, /### Newest/);
  assert.doesNotMatch(kos, /### Older|### Oldest/);
  assert.match(r.read('archive/2026-27-Q2/kos-personal/CHANGELOG.md'), /### Older \(2026-11-02\)/);
  const ids = lib.loadCatalog(r.root).map((x) => x.id).sort();
  assert.deepEqual(ids, ['2026-27-Q1/cas-ccps/HISTORY.md', '2026-27-Q1/kos-personal/CHANGELOG.md',
    '2026-27-Q2/cas-ccps/HISTORY.md', '2026-27-Q2/kos-personal/CHANGELOG.md']);
  assert.equal(quiet(() => build.main(['--check'], r.root)).code, 0);

  // A later rollover adds to an existing part: after it for an oldest-first
  // log, before its first entry for a newest-first one.
  fs.writeFileSync(path.join(r.root, 'cas-ccps/HISTORY.md'), r.read('cas-ccps/HISTORY.md') + '\n## Five, 2026-11-21\nlater\n');
  fs.writeFileSync(path.join(r.root, 'kos-personal/CHANGELOG.md'),
    r.read('kos-personal/CHANGELOG.md').replace('### Newest', '### Newer still (2026-11-21)\nx\n\n### Newest'));
  assert.equal(quiet(() => file.main(['--rollover-logs', '--before', '2027-01-01'], r.root)).code, 0);
  const q2 = r.read('archive/2026-27-Q2/cas-ccps/HISTORY.md');
  assert.ok(q2.indexOf('## Three') < q2.indexOf('## Four') && q2.indexOf('## Four') < q2.indexOf('## Five'));
  const k2 = r.read('archive/2026-27-Q2/kos-personal/CHANGELOG.md');
  assert.ok(k2.indexOf('### Newer still') < k2.indexOf('### Newest') && k2.indexOf('### Newest') < k2.indexOf('### Older'));
  assert.equal(lib.loadCatalog(r.root).length, 4, 'no second record for an existing part');
});

test('rollover: nothing before the date changes nothing', () => {
  const r = repo({ 'cas-ccps/HISTORY.md': CAS });
  const before = r.read('cas-ccps/HISTORY.md');
  assert.equal(quiet(() => file.main(['--rollover-logs', '--before', '2026-08-01'], r.root)).code, 0);
  assert.equal(r.read('cas-ccps/HISTORY.md'), before);
});
