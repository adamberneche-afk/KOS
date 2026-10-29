'use strict';
// tools/clasp-sync/run.js (the Node port of the retired run.ps1) drives clasp across
// the in-scope projects, and it is the last step before code reaches a live
// web app, so its decisions are tested rather than trusted. Pure helpers are
// tested directly; everything that touches clasp is tested end to end against
// a fake `clasp` that records each call (KOS_RUN_CLASP points run.js at it).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const RUN_JS = path.join(ROOT, 'tools', 'clasp-sync', 'run.js');
const run = require(RUN_JS);

// ── pure helpers ─────────────────────────────────────────────────────────────

test('parseArgs accepts run.ps1 spellings, GNU spellings and = forms', () => {
  const a = run.parseArgs(['-Latest', '-HeadOnly', '-Only', 'leader-hub,kos-personal', '-RollbackTo', '6']);
  assert.equal(a.latest, true);
  assert.equal(a.headOnly, true);
  assert.deepEqual(a.only, ['leader-hub', 'kos-personal']);
  assert.equal(a.rollbackTo, 6);

  const b = run.parseArgs(['--zip=C:\\x\\KOS-main.zip', '--repo-root', 'kos', '--registry=reg', '--skip-script-check']);
  assert.equal(b.zip, 'C:\\x\\KOS-main.zip');
  assert.equal(b.repoRoot, 'kos');
  assert.equal(b.registry, 'reg');
  assert.equal(b.skipScriptCheck, true);
});

test('parseArgs reads --only given as repeats or as bare words after it', () => {
  assert.deepEqual(run.parseArgs(['--only', 'a', '--only', 'b']).only, ['a', 'b']);
  assert.deepEqual(run.parseArgs(['-Only', 'a', 'b', 'c']).only, ['a', 'b', 'c']);
});

test('parseArgs refuses unknown options, missing values and non-numeric versions', () => {
  assert.throws(() => run.parseArgs(['--nope']), /Unknown option/);
  assert.throws(() => run.parseArgs(['--zip']), /needs a value/);
  assert.throws(() => run.parseArgs(['--rollback-to', 'six']), /version number of 1 or more/);
  assert.throws(() => run.parseArgs(['stray']), /Unexpected argument/);
  assert.throws(() => run.parseArgs(['--latest=1']), /takes no value/);
});

test('parseArgs refuses --rollback-to 0, which would otherwise push and promote', () => {
  assert.throws(() => run.parseArgs(['--rollback-to', '0', '--only', 'leader-hub']), /1 or more/);
  assert.throws(() => run.parseArgs(['-RollbackTo=0']), /1 or more/);
  assert.equal(run.parseArgs(['--rollback-to', '1', '--only', 'leader-hub']).rollbackTo, 1);
});

test('parseDeploymentLines reads ids, versions, HEAD and descriptions, ignoring colour codes and headers', () => {
  const esc = String.fromCharCode(27);
  const lines = [
    '3 Deployments.',
    `${esc}[32m- AKfycbAAA @9 - abc1234 v9${esc}[0m`,
    '- AKfycbBBB @HEAD',
    '  - AKfycbCCC @4 - rollback to v4 - extra dash',
    '- notadeployment',
  ];
  const d = run.parseDeploymentLines(lines);
  assert.deepEqual(d.map((x) => [x.id, x.version, x.description]), [
    ['AKfycbAAA', '9', 'abc1234 v9'],
    ['AKfycbBBB', 'HEAD', ''],
    ['AKfycbCCC', '4', 'rollback to v4 - extra dash'],
  ]);
});

test('getKeepList skips blanks and # comments, tolerates a BOM, and is null when the file is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-'));
  const f = path.join(dir, 'deployments.txt');
  assert.equal(run.getKeepList(f), null);
  fs.writeFileSync(f, '\uFEFF# live ones\nAAA\n\n  BBB  \n#CCC\r\n');
  assert.deepEqual(run.getKeepList(f), ['AAA', 'BBB']);
  fs.writeFileSync(f, '# nothing\n');
  assert.deepEqual(run.getKeepList(f), []);
});

test('getMarker finds the SHA in a DeployVersionMarker file, else (none)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-'));
  assert.equal(run.getMarker(dir), '(none)');
  fs.writeFileSync(path.join(dir, 'Code.gs'), "const DEPLOY_VERSION_SHA = 'deadbee';\n");
  assert.equal(run.getMarker(dir), '(none)', 'only DeployVersionMarker files count');
  fs.writeFileSync(path.join(dir, '48_DeployVersionMarker_X.js'), "const DEPLOY_VERSION_SHA = '1a2b3c4d5e';\n");
  assert.equal(run.getMarker(dir), '1a2b3c4');
});

test('quoteForCmd leaves plain arguments alone and quotes spaces and shell characters', () => {
  assert.equal(run.quoteForCmd('update-deployment'), 'update-deployment');
  assert.equal(run.quoteForCmd('--versionNumber'), '--versionNumber');
  assert.equal(run.quoteForCmd('abc1234 v9'), '"abc1234 v9"');
  assert.equal(run.quoteForCmd('a&b'), '"a&b"');
  assert.equal(run.quoteForCmd('say "hi"'), '"say \\"hi\\""');
  assert.equal(run.quoteForCmd('C:\\Program Files\\'), '"C:\\Program Files\\\\"');
});

// ── zip extraction ───────────────────────────────────────────────────────────

/** A minimal zip writer: [{ name, data?, method? }]; a name ending in / is a directory. comment: the archive comment. */
function makeZip(entries, comment) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.name.endsWith('/') ? Buffer.alloc(0) : Buffer.from(e.data || '', 'utf8');
    const method = e.method === 0 ? 0 : 8;
    const comp = method === 0 ? data : zlib.deflateRawSync(data);
    const crc = e.badCrc ? 1234 : run.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp);
    central.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  const note = Buffer.from(comment || '', 'utf8');
  eocd.writeUInt16LE(note.length, 20);
  return Buffer.concat([...locals, cd, eocd, note]);
}

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('extractZip writes directories, deflated and stored files, and verifies content', () => {
  const dir = tmp('zip-');
  const zip = path.join(dir, 'a.zip');
  fs.writeFileSync(zip, makeZip([
    { name: 'top/' },
    { name: 'top/a.txt', data: 'hello\n'.repeat(50) },
    { name: 'top/sub/b.txt', data: 'stored', method: 0 },
    { name: 'top/empty.txt', data: '' },
  ]));
  const dest = path.join(dir, 'out');
  run.extractZip(zip, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'top', 'a.txt'), 'utf8'), 'hello\n'.repeat(50));
  assert.equal(fs.readFileSync(path.join(dest, 'top', 'sub', 'b.txt'), 'utf8'), 'stored');
  assert.equal(fs.readFileSync(path.join(dest, 'top', 'empty.txt'), 'utf8'), '');
});

test('extractZip refuses path-escaping entries and corrupt data', () => {
  const dir = tmp('zip-');
  const evil = path.join(dir, 'evil.zip');
  fs.writeFileSync(evil, makeZip([{ name: '../escaped.txt', data: 'x' }]));
  assert.throws(() => run.extractZip(evil, path.join(dir, 'o1')), /escapes the destination/);
  assert.equal(fs.existsSync(path.join(dir, 'escaped.txt')), false);

  const bad = path.join(dir, 'bad.zip');
  fs.writeFileSync(bad, makeZip([{ name: 'a.txt', data: 'content', badCrc: true }]));
  assert.throws(() => run.extractZip(bad, path.join(dir, 'o2')), /corrupt/);

  const junk = path.join(dir, 'junk.zip');
  fs.writeFileSync(junk, 'this is not a zip file at all');
  assert.throws(() => run.extractZip(junk, path.join(dir, 'o3')), /not a zip/);
});

// ── end to end against a fake clasp ─────────────────────────────────────────

const FAKE_CLASP = `
const fs = require('fs');
const f = process.env.FAKE_CLASP_STATE;
const s = JSON.parse(fs.readFileSync(f, 'utf8'));
const a = process.argv.slice(2);
s.log.push({ args: a, cwd: process.cwd() });
let code = 0;
if (a[0] === '--version') console.log('3.0.0');
else if (a[0] === 'push') {
  if (s.pushMode === 'fail') { console.error('push exploded'); code = 1; }
  else if (s.pushMode === 'unchanged') console.log('Script is already up to date.');
  else console.log('\\u2514\\u2500 Pushed 3 files.');
} else if (a[0] === 'list-deployments') {
  console.log(s.deployments.length + ' Deployments.');
  s.deployments.forEach((d) => console.log('- ' + d.id + ' @' + d.version + (d.desc ? ' - ' + d.desc : '')));
} else if (a[0] === 'version') {
  console.log('Created version ' + s.next + '.'); s.next++;
} else if (a[0] === 'update-deployment') {
  const d = s.deployments.find((x) => x.id === a[1]);
  if (!d) { console.error('no such deployment'); code = 1; }
  else { d.version = a[a.indexOf('--versionNumber') + 1]; d.desc = a[a.indexOf('--description') + 1]; }
}
fs.writeFileSync(f, JSON.stringify(s));
process.exit(code);
`;

const SYNC_STUB = `
const fs = require('fs'); const path = require('path');
const d = path.join('cas-ccps', '.clasp-build', process.argv[2]);
fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(d, '43_DeployVersionMarker_X.js'), "const DEPLOY_VERSION_SHA = 'abc1234';\\n");
console.log('built ' + process.argv[2]);
`;

/** A work folder with a fake checkout, a registry, a fake clasp and its state. */
function world(opts = {}) {
  const work = tmp('runjs-');
  const repo = path.join(work, 'KOS-main');
  const registry = path.join(work, 'clasp-registry');
  fs.mkdirSync(path.join(repo, 'tools', 'clasp-sync'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tools', 'clasp-sync', 'sync.js'), SYNC_STUB);
  fs.mkdirSync(path.join(repo, 'leader-hub'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'leader-hub', 'DeployVersionMarker.gs'), "var DEPLOY_VERSION_SHA = 'abc1234deadbeef';\n");

  const reg = (rel, files) => {
    const d = path.join(registry, ...rel);
    fs.mkdirSync(d, { recursive: true });
    for (const [n, text] of Object.entries(files)) fs.writeFileSync(path.join(d, n), text);
  };
  if (opts.registerLeaderHub !== false) {
    reg(['leader-hub'], {
      // A stale absolute rootDir, written with a BOM, as a real `clasp clone` run on Windows can.
      '.clasp.json': '\uFEFF' + JSON.stringify({ scriptId: 'SCRIPT-LH', rootDir: 'C:\\registry\\leader-hub' }),
      'deployments.txt': '# live\nDEPA\nDEPB\n',
    });
  }
  reg(['cas-ccps', 'central-ledger'], { '.clasp.json': JSON.stringify({ scriptId: 'SCRIPT-CL' }) });

  const stateFile = path.join(work, 'state.json');
  const state = {
    pushMode: 'pushed', next: 4, log: [],
    deployments: [
      { id: 'HEADID', version: 'HEAD', desc: '' },
      { id: 'DEPA', version: '3', desc: 'old v3' },
      { id: 'DEPB', version: '3', desc: 'old v3' },
    ],
    ...(opts.state || {}),
  };
  fs.writeFileSync(stateFile, JSON.stringify(state));

  const fakeJs = path.join(work, 'fake-clasp.js');
  fs.writeFileSync(fakeJs, FAKE_CLASP);
  const launcher = path.join(work, process.platform === 'win32' ? 'clasp.cmd' : 'clasp');
  if (process.platform === 'win32') {
    fs.writeFileSync(launcher, `@"${process.execPath}" "${fakeJs}" %*\r\n`);
  } else {
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${fakeJs}" "$@"\n`, { mode: 0o755 });
  }

  const w = { work, repo, registry, stateFile, launcher };
  w.state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  w.calls = (cmd) => w.state().log.filter((c) => c.args[0] === cmd);
  w.run = (args, env = {}, cwd = work) => {
    const r = cp.spawnSync(process.execPath, [RUN_JS, ...args], {
      cwd, encoding: 'utf8',
      env: { ...process.env, KOS_RUN_CLASP: launcher, FAKE_CLASP_STATE: stateFile, ...env },
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  return w;
}

test('promote: pushes, cuts one version, moves each registered deployment, prints undo and links', () => {
  const w = world();
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);

  assert.equal(w.calls('push').length, 1);
  assert.deepEqual(w.calls('push')[0].args, ['push', '--force']);
  assert.equal(w.calls('push')[0].cwd, fs.realpathSync(path.join(w.repo, 'leader-hub')));
  const ver = w.calls('version');
  assert.equal(ver.length, 1);
  assert.match(ver[0].args[1], /^abc1234 \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/);

  const updates = w.calls('update-deployment');
  assert.deepEqual(updates.map((c) => c.args[1]), ['DEPA', 'DEPB']);
  for (const u of updates) {
    assert.equal(u.args[u.args.indexOf('--versionNumber') + 1], '4');
    assert.equal(u.args[u.args.indexOf('--description') + 1], 'abc1234 v4');
  }
  assert.match(r.out, /leader-hub\s+abc1234\s+v4 -> 2\/2 deployment\(s\) \(was v3; undo: --rollback-to 3\)/);
  assert.match(r.out, /\/exec\s+https:\/\/script\.google\.com\/macros\/s\/DEPA\/exec/);
  assert.match(r.out, /editor\s+https:\/\/script\.google\.com\/d\/SCRIPT-LH\/edit/);
  assert.match(r.out, /Deployment IDs are unchanged/);

  // The bound config: BOM tolerated on the way in, rootDir forced to ".", no BOM on the way out.
  const written = fs.readFileSync(path.join(w.repo, 'leader-hub', '.clasp.json'));
  assert.notEqual(written[0], 0xef, 'no BOM');
  const cfg = JSON.parse(written.toString('utf8'));
  assert.equal(cfg.scriptId, 'SCRIPT-LH');
  assert.equal(cfg.rootDir, '.');
});

test('promote: an unchanged push with every deployment already on this marker cuts no version', () => {
  const w = world({
    state: {
      pushMode: 'unchanged',
      deployments: [
        { id: 'HEADID', version: 'HEAD', desc: '' },
        { id: 'DEPA', version: '7', desc: 'abc1234 v7' },
        { id: 'DEPB', version: '7', desc: 'abc1234 v7' },
      ],
    },
  });
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls('version').length, 0);
  assert.equal(w.calls('update-deployment').length, 0);
  assert.match(r.out, /unchanged \(already up to date\)/);
});

test('promote: an unchanged push still releases when a deployment is behind HEAD', () => {
  const w = world({ state: { pushMode: 'unchanged' } });
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls('version').length, 1);
  assert.equal(w.calls('update-deployment').length, 2);
});

test('promote: a failed push stops before versioning and exits 1', () => {
  const w = world({ state: { pushMode: 'fail' } });
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 1);
  assert.match(r.out, /FAILED: push/);
  assert.equal(w.calls('version').length, 0);
  assert.equal(w.calls('update-deployment').length, 0);
});

test('promote: a registered id that is not live is reported, skipped, and fails the run', () => {
  const w = world();
  fs.writeFileSync(path.join(w.registry, 'leader-hub', 'deployments.txt'), 'DEPA\nGONE\n');
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 1);
  assert.match(r.out, /GONE is in deployments\.txt but not live/);
  assert.match(r.out, /FAILED: v4 -> 1\/2 deployment\(s\).*not live: GONE/);
});

test('--head-only pushes, prints the /dev link, and moves nothing', () => {
  const w = world();
  const r = w.run(['--head-only', '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls('push').length, 1);
  assert.equal(w.calls('version').length, 0);
  assert.equal(w.calls('update-deployment').length, 0);
  assert.match(r.out, /\/dev\s+https:\/\/script\.google\.com\/macros\/s\/HEADID\/dev/);
  assert.match(r.out, /live deployments untouched, test at \/dev/);
});

test('--rollback-to moves registered deployments to that version and pushes nothing', () => {
  const w = world();
  const r = w.run(['--rollback-to', '2', '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.equal(w.calls('push').length, 0);
  assert.equal(w.calls('version').length, 0);
  const updates = w.calls('update-deployment');
  assert.deepEqual(updates.map((c) => c.args[1]), ['DEPA', 'DEPB']);
  assert.equal(updates[0].args[updates[0].args.indexOf('--versionNumber') + 1], '2');
  assert.match(r.out, /rolled back to v2 -> 2\/2 deployment\(s\)/);
  assert.match(r.out, /Rolled back only -- nothing was pushed/);
});

test('--rollback-to needs exactly one project and cannot be combined with pushing flags', () => {
  const w = world();
  assert.match(w.run(['--rollback-to', '2']).out, /exactly one project/);
  assert.match(w.run(['--rollback-to', '2', '--only', 'leader-hub', '--head-only']).out, /pushes nothing/);
  assert.equal(w.calls('push').length, 0);
});

test('a push-only cas-ccps project builds through sync.js and pushes from .clasp-build', () => {
  const w = world();
  const r = w.run(['--only', 'central-ledger']);
  assert.equal(r.status, 0, r.out);
  const push = w.calls('push')[0];
  assert.equal(push.cwd, fs.realpathSync(path.join(w.repo, 'cas-ccps', '.clasp-build', 'central-ledger')));
  const local = JSON.parse(fs.readFileSync(path.join(w.repo, 'cas-ccps', 'clasp', 'local', 'central-ledger.clasp.json'), 'utf8'));
  assert.equal(local.scriptId, 'SCRIPT-CL');
  assert.equal(local.rootDir, '.');
  assert.match(r.out, /central-ledger\s+abc1234\s+pushed/);
  assert.equal(w.calls('version').length, 0, 'push-only projects have no versions');
});

test('a project with no registry entry is skipped with a warning, never invented', () => {
  const w = world({ registerLeaderHub: false });
  const r = w.run(['--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /SKIPPED: not in registry/);
  assert.match(r.out, /Bind it by hand first/);
  assert.equal(w.calls('push').length, 0);
});

test('a web app with no deployments.txt is skipped before anything is pushed', () => {
  const w = world();
  fs.unlinkSync(path.join(w.registry, 'leader-hub', 'deployments.txt'));
  const r = w.run(['--only', 'leader-hub']);
  assert.match(r.out, /SKIPPED: no deployments\.txt/);
  assert.equal(w.calls('push').length, 0);
});

test('guards: unknown project, registry inside the repo, missing registry, both --zip and --latest', () => {
  const w = world();
  assert.match(w.run(['--only', 'nope']).out, /Not in the manifest: nope/);
  assert.match(w.run(['--registry', path.join(w.repo, 'reg')]).out, /Registry folder not found/);
  fs.mkdirSync(path.join(w.repo, 'reg'));
  assert.match(w.run(['--registry', path.join(w.repo, 'reg')]).out, /inside the repo root/);
  assert.match(w.run(['--zip', 'a.zip', '--latest']).out, /not both/);
  assert.equal(w.calls('push').length, 0);
});

test('a missing clasp fails once, early and plainly', () => {
  const w = world();
  const r = w.run(['--only', 'leader-hub'], { KOS_RUN_CLASP: path.join(w.work, 'no-such-clasp') });
  assert.equal(r.status, 1);
  assert.match(r.out, /clasp/i);
  assert.match(r.out, /npm install -g @google\/clasp/);
});

test('a stale copy of run.js stops the run before anything is pushed', () => {
  const w = world();
  fs.writeFileSync(path.join(w.repo, 'tools', 'clasp-sync', 'run.js'), '// a different, newer run.js\n');
  const stale = path.join(w.work, 'run.js'); // the copy being "run" lives outside the checkout
  fs.copyFileSync(RUN_JS, stale);
  const r = cp.spawnSync(process.execPath, [stale, '--only', 'leader-hub'], {
    cwd: w.work, encoding: 'utf8',
    env: { ...process.env, KOS_RUN_CLASP: w.launcher, FAKE_CLASP_STATE: w.stateFile },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /differs from the one in the checkout\. Nothing was pushed/);
  assert.equal(w.calls('push').length, 0);

  const ok = cp.spawnSync(process.execPath, [stale, '--skip-script-check', '--only', 'leader-hub'], {
    cwd: w.work, encoding: 'utf8',
    env: { ...process.env, KOS_RUN_CLASP: w.launcher, FAKE_CLASP_STATE: w.stateFile },
  });
  assert.equal(ok.status, 0, ok.stderr);
});

// ── --zip ────────────────────────────────────────────────────────────────────

function kosZip(w, files, commit) {
  const entries = [{ name: 'KOS-main/' }];
  for (const [name, data] of Object.entries(files)) entries.push({ name: `KOS-main/${name}`, data });
  const zip = path.join(w.work, 'KOS-main.zip');
  fs.writeFileSync(zip, makeZip(entries, commit));
  return zip;
}

test('--zip replaces the checkout wholesale: new files arrive and files deleted upstream do not linger', () => {
  const w = world();
  fs.writeFileSync(path.join(w.repo, 'leader-hub', 'DeletedUpstream.gs'), 'old');
  const zip = kosZip(w, {
    'tools/clasp-sync/sync.js': SYNC_STUB,
    'leader-hub/DeployVersionMarker.gs': "var DEPLOY_VERSION_SHA = 'fffffff1234567';\n",
    'leader-hub/NewFile.gs': 'new',
  });
  const r = w.run(['--zip', zip, '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Checkout replaced from/);
  assert.equal(fs.existsSync(path.join(w.repo, 'leader-hub', 'DeletedUpstream.gs')), false);
  assert.equal(fs.readFileSync(path.join(w.repo, 'leader-hub', 'NewFile.gs'), 'utf8'), 'new');
  assert.match(r.out, /leader-hub\s+fffffff/, 'the marker comes from the NEW checkout');
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('kos-zip-') && fs.statSync(path.join(os.tmpdir(), n)).mtimeMs > Date.now() - 60000), [], 'staging is cleaned up');
});

test('--zip creates the checkout when none exists', () => {
  const w = world();
  fs.rmSync(w.repo, { recursive: true, force: true });
  const zip = kosZip(w, { 'tools/clasp-sync/sync.js': SYNC_STUB, 'leader-hub/DeployVersionMarker.gs': "var DEPLOY_VERSION_SHA = 'abcdef0';\n" });
  const r = w.run(['--zip', zip, '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.ok(fs.existsSync(path.join(w.repo, 'tools', 'clasp-sync', 'sync.js')));
});

test('--zip refuses to delete a checkout that holds real configs the registry lacks', () => {
  const w = world();
  fs.mkdirSync(path.join(w.repo, 'cas-ccps', 'clasp', 'local'), { recursive: true });
  fs.writeFileSync(path.join(w.repo, 'cas-ccps', 'clasp', 'local', 'student-dashboard.clasp.json'), '{"scriptId":"X"}');
  fs.mkdirSync(path.join(w.repo, 'kos-personal'), { recursive: true });
  fs.writeFileSync(path.join(w.repo, 'kos-personal', '.clasp.json'), '{"scriptId":"Y"}');
  const zip = kosZip(w, { 'tools/clasp-sync/sync.js': SYNC_STUB });
  const r = w.run(['--zip', zip, '--only', 'leader-hub']);
  assert.equal(r.status, 1);
  assert.match(r.out, /would be deleted/);
  assert.match(r.out, /student-dashboard\.clasp\.json/);
  assert.match(r.out, /kos-personal/);
  assert.ok(fs.existsSync(path.join(w.repo, 'cas-ccps', 'clasp', 'local', 'student-dashboard.clasp.json')), 'nothing was deleted');
});

test('--zip refuses to run from inside the checkout, to delete a non-KOS folder, or to read a non-KOS zip', () => {
  const w = world();
  const zip = kosZip(w, { 'tools/clasp-sync/sync.js': SYNC_STUB });
  assert.match(w.run(['--zip', zip, '--registry', w.registry, '--repo-root', w.repo], {}, w.repo).out, /Run this from outside/);

  const w2 = world();
  fs.unlinkSync(path.join(w2.repo, 'tools', 'clasp-sync', 'sync.js'));
  assert.match(w2.run(['--zip', kosZip(w2, { 'tools/clasp-sync/sync.js': SYNC_STUB })]).out, /doesn't look like a KOS checkout/);
  assert.ok(fs.existsSync(w2.repo), 'the folder was left alone');

  const w3 = world();
  assert.match(w3.run(['--zip', kosZip(w3, { 'README.md': 'not kos' })]).out, /doesn't look like a KOS zip/);
  assert.ok(fs.existsSync(path.join(w3.repo, 'tools', 'clasp-sync', 'sync.js')), 'the old checkout survived a bad zip');
});

test('the real repo zip layout works: extractZip reproduces this checkout\'s clasp-sync tooling', () => {
  // Zip the real tools/clasp-sync folder the way GitHub would (one top folder) and extract it.
  const dir = path.join(ROOT, 'tools', 'clasp-sync');
  const entries = [{ name: 'KOS-main/' }, { name: 'KOS-main/tools/' }, { name: 'KOS-main/tools/clasp-sync/' }];
  for (const f of fs.readdirSync(dir)) {
    entries.push({ name: `KOS-main/tools/clasp-sync/${f}`, data: fs.readFileSync(path.join(dir, f), 'utf8') });
  }
  const w = tmp('realzip-');
  const zip = path.join(w, 'z.zip');
  fs.writeFileSync(zip, makeZip(entries));
  run.extractZip(zip, path.join(w, 'out'));
  for (const f of fs.readdirSync(dir)) {
    assert.equal(
      fs.readFileSync(path.join(w, 'out', 'KOS-main', 'tools', 'clasp-sync', f), 'utf8'),
      fs.readFileSync(path.join(dir, f), 'utf8'),
      f,
    );
  }
});

test('every non-held project in the manifest has a project-map entry; run.ps1 is gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'tools', 'clasp-sync', 'run.ps1')), false, 'retired 2026-10-29');
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'gas-lint', 'project-map.json'), 'utf8'));
  for (const p of run.MANIFEST) {
    const key = p.type === 'flat' ? (p.name === 'leader-hub' ? 'leader-hub:app' : p.name) : `cas-ccps:${p.name}`;
    assert.ok(map[key], `${p.name} has no project-map.json entry (${key})`);
  }
});

// ── --instructions: the KOS Project instructions, links filled ───────────────

const TEMPLATE = '# KOS — instructions\n\nPaste below the line.\n\n---\n\n# KOS THINKING PARTNER\n' +
  '- Primer: `<link to KOS_LATEST_PRIMER>`\n- CAS: `<link to KOS_CAS_SIGNAL>` → read LAST NIGHT first\n';
const LINKS = '# private doc links\nKOS_LATEST_PRIMER=https://docs.google.com/document/d/P/edit\n\n' +
  'KOS_CAS_SIGNAL = https://docs.google.com/document/d/C/edit\n';

test('fillInstructions pastes only what is below the line, every placeholder filled', () => {
  const t = run.fillInstructions(TEMPLATE, run.parseLinks(LINKS));
  assert.match(t, /^# KOS THINKING PARTNER\n/);
  assert.doesNotMatch(t, /Paste below the line|<link to/);
  assert.match(t, /Primer: `https:\/\/docs\.google\.com\/document\/d\/P\/edit`/);
  assert.match(t, /CAS: `https:\/\/docs\.google\.com\/document\/d\/C\/edit` → read LAST NIGHT first/);
});

test('a missing link stops the fill and names it; a bad links line is refused', () => {
  assert.throws(() => run.fillInstructions(TEMPLATE, { KOS_LATEST_PRIMER: 'https://x' }),
    /No link for KOS_CAS_SIGNAL: add KOS_CAS_SIGNAL=https:\/\/\.\.\./);
  assert.throws(() => run.parseLinks('KOS_CAS_SIGNAL=http://x'), /isn't an https:\/\/ link/);
  assert.throws(() => run.parseLinks('just a line'), /line 1 isn't NAME=https/);
});

function instructionsWorld() {
  const w = world();
  const dir = path.join(w.repo, 'kos-personal', 'claude-project');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'PROJECT_INSTRUCTIONS.md'), TEMPLATE);
  return w;
}

test('--instructions saves the filled copy in the registry, pushes nothing, and needs the links file', () => {
  const w = instructionsWorld();
  const env = { KOS_RUN_NO_CLIPBOARD: '1' };
  const missing = w.run(['--instructions'], env);
  assert.equal(missing.status, 1);
  assert.match(missing.out, /kos-project-links\.txt\. Create it/);

  fs.writeFileSync(path.join(w.registry, 'kos-project-links.txt'), LINKS);
  const r = w.run(['--instructions'], env);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /Filled 2 link\(s\)/);
  assert.match(r.out, /open .*PROJECT_INSTRUCTIONS\.filled\.md/);
  const filled = fs.readFileSync(path.join(w.registry, 'PROJECT_INSTRUCTIONS.filled.md'), 'utf8');
  assert.match(filled, /d\/C\/edit/);
  assert.equal(w.state().log.length, 0, 'no clasp call at all');
  assert.match(w.run(['--instructions', '--only', 'leader-hub'], env).out, /only combines with --latest or --zip/);
});

test('after a push, a changed template is a reminder to run --instructions; an unchanged one is quiet', () => {
  const w = instructionsWorld();
  const env = { KOS_RUN_NO_CLIPBOARD: '1' };
  assert.doesNotMatch(w.run(['--only', 'leader-hub'], env).out, /--instructions/, 'quiet before the links file exists');
  fs.writeFileSync(path.join(w.registry, 'kos-project-links.txt'), LINKS);
  w.run(['--instructions'], env);
  assert.doesNotMatch(w.run(['--only', 'leader-hub'], env).out, /instructions changed/);
  fs.appendFileSync(path.join(w.repo, 'kos-personal', 'claude-project', 'PROJECT_INSTRUCTIONS.md'), '- a new rule\n');
  assert.match(w.run(['--only', 'leader-hub'], env).out,
    /instructions changed since your last filled copy\. Run: node run\.js --instructions/);
});

// ── The deploy marker tracks the push (2026-10-28) ───────────────────────────
// A GitHub zip's archive comment is the commit it was cut from; each build's
// marker is stamped with it, and an unchanged build keeps its last commit so
// a web app cuts no new version.

const C1 = '1'.repeat(40);
const C2 = '2'.repeat(40);
const LH_MARKER = (sha) => `const LH_DEPLOY_VERSION_SHA = '${sha}';\n`;

test('zipCommit reads a GitHub zip\'s commit from its archive comment, else empty', () => {
  const dir = tmp('zipc-');
  const z = (name, comment) => { const f = path.join(dir, name); fs.writeFileSync(f, makeZip([{ name: 'a.txt', data: 'x' }], comment)); return f; };
  assert.equal(run.zipCommit(z('a.zip', C1)), C1);
  assert.equal(run.zipCommit(z('b.zip', 'not a commit')), '');
  assert.equal(run.zipCommit(z('c.zip')), '');
});

test('stampBuild stamps every marker form; an unchanged build keeps the last commit; no commit leaves it alone', () => {
  const dir = tmp('stamp-');
  const repo = path.join(dir, 'repo');
  const build = path.join(dir, 'build');
  const reg = path.join(dir, 'reg');
  [repo, build, reg].forEach((d) => fs.mkdirSync(d));
  fs.writeFileSync(path.join(build, '43_DeployVersionMarker_X.js'), "const DEPLOY_VERSION_SHA = '" + 'a'.repeat(40) + "'; // stamped\n");
  fs.writeFileSync(path.join(build, 'Code.js'), 'v1');
  assert.equal(run.stampBuild(build, repo, reg), null, 'no recorded commit: nothing stamped');
  assert.match(fs.readFileSync(path.join(build, '43_DeployVersionMarker_X.js'), 'utf8'), /'a{40}'/);

  fs.writeFileSync(path.join(repo, run.BUILD_COMMIT_FILE), C1 + '\n');
  const first = run.stampBuild(build, repo, reg);
  assert.deepEqual([first.sha, first.reused], [C1, false]);
  assert.equal(fs.readFileSync(path.join(build, '43_DeployVersionMarker_X.js'), 'utf8'), `const DEPLOY_VERSION_SHA = '${C1}'; // stamped\n`);
  fs.writeFileSync(path.join(reg, run.LAST_BUILD_FILE), JSON.stringify({ hash: first.hash, commit: first.sha }));

  fs.writeFileSync(path.join(repo, run.BUILD_COMMIT_FILE), C2 + '\n');
  const same = run.stampBuild(build, repo, reg);
  assert.deepEqual([same.sha, same.reused], [C1, true], 'same code, a newer zip: the marker keeps C1');
  fs.writeFileSync(path.join(build, 'Code.js'), 'v2');
  const changed = run.stampBuild(build, repo, reg);
  assert.deepEqual([changed.sha, changed.reused], [C2, false]);
  assert.notEqual(changed.hash, first.hash);
});

test('--zip with a commit: the push carries it, and a later zip with the same code keeps it', () => {
  const w = world();
  const files = { 'tools/clasp-sync/sync.js': SYNC_STUB, 'leader-hub/DeployVersionMarker.gs': LH_MARKER('0'.repeat(40)), 'leader-hub/Code.gs': 'v1' };
  const r = w.run(['--zip', kosZip(w, files, C1), '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.equal(fs.readFileSync(path.join(w.repo, run.BUILD_COMMIT_FILE), 'utf8').trim(), C1);
  assert.equal(fs.readFileSync(path.join(w.repo, 'leader-hub', 'DeployVersionMarker.gs'), 'utf8'), LH_MARKER(C1));
  assert.match(r.out, /commit 1111111 \(from the zip\)/);
  assert.match(r.out, /leader-hub\s+1111111\s+v4 -> 2\/2/);
  const last = JSON.parse(fs.readFileSync(path.join(w.registry, 'leader-hub', run.LAST_BUILD_FILE), 'utf8'));
  assert.equal(last.commit, C1);

  const again = w.run(['--zip', kosZip(w, files, C2), '--only', 'leader-hub']);
  assert.equal(again.status, 0, again.out);
  assert.match(again.out, /code unchanged since the last push: the marker keeps that push's commit/);
  assert.equal(fs.readFileSync(path.join(w.repo, 'leader-hub', 'DeployVersionMarker.gs'), 'utf8'), LH_MARKER(C1));

  const changed = w.run(['--zip', kosZip(w, Object.assign({}, files, { 'leader-hub/Code.gs': 'v2' }), C2), '--only', 'leader-hub']);
  assert.equal(changed.status, 0, changed.out);
  assert.equal(fs.readFileSync(path.join(w.repo, 'leader-hub', 'DeployVersionMarker.gs'), 'utf8'), LH_MARKER(C2));
});

test('a failed push records nothing, so the next run stamps afresh', () => {
  const w = world({ state: { pushMode: 'fail' } });
  const files = { 'tools/clasp-sync/sync.js': SYNC_STUB, 'leader-hub/DeployVersionMarker.gs': LH_MARKER('0'.repeat(40)) };
  const r = w.run(['--zip', kosZip(w, files, C1), '--only', 'leader-hub']);
  assert.equal(r.status, 1);
  assert.equal(fs.existsSync(path.join(w.registry, 'leader-hub', run.LAST_BUILD_FILE)), false);
});

test('a zip with no commit says so and leaves the marker as committed', () => {
  const w = world();
  const r = w.run(['--zip', kosZip(w, { 'tools/clasp-sync/sync.js': SYNC_STUB, 'leader-hub/DeployVersionMarker.gs': LH_MARKER('3'.repeat(40)) }), '--only', 'leader-hub']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /records no commit/);
  assert.match(r.out, /no commit recorded for this checkout/);
  assert.equal(fs.readFileSync(path.join(w.repo, 'leader-hub', 'DeployVersionMarker.gs'), 'utf8'), LH_MARKER('3'.repeat(40)));
});

