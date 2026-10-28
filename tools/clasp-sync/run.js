#!/usr/bin/env node
'use strict';
/**
 * tools/clasp-sync/run.js
 * ========================
 * Drives the clasp CLI side of a full push across the in-scope KOS Apps
 * Script projects. A Node port of run.ps1 so it runs from plain cmd.exe
 * (or any shell) with nothing but Node and clasp installed: no PowerShell,
 * no execution-policy fights, no Expand-Archive. Node built-ins only.
 *
 * Out of scope (same as run.ps1): cas-ccps's studio-steps project (custom
 * Studio steps are blocked by the org-wide GCP restriction); kos-personal's
 * archived project.
 *
 * This script automates PROCESS, not JUDGMENT. Two decisions are made by a
 * human, once, and recorded in the registry directory; the script only ever
 * READS them and never falls back to `clasp create`:
 *
 *   1. Which real Apps Script project a name maps to
 *      -> <registry>\...\<name>\.clasp.json   (from `clasp clone <scriptId>`)
 *   2. For a web app, which deployments stay live
 *      -> <registry>\...\<name>\deployments.txt  (one deployment ID per
 *         line, # comments allowed)
 *
 * A project missing either file is skipped with a warning, not invented.
 *
 * Web apps are PROMOTED, never redeployed: push, cut one version, then
 * `clasp update-deployment` each registered deployment to it. Deployment
 * IDs -- and so every /exec URL, bookmark, Script Property and leader-hub
 * setting that holds one -- never change, and no deployments accumulate.
 * Rolling back is `--rollback-to <previous version>`.
 *
 * USAGE (cmd.exe)
 *   node run.js --zip %USERPROFILE%\Downloads\KOS-main.zip
 *   node run.js --latest --head-only --only leader-hub
 *   node run.js --rollback-to 6 --only leader-hub
 *   node run.js --latest --instructions
 *   node run.js --help
 *
 * Flags (run.ps1's spellings -Zip, -Latest, -HeadOnly, -RollbackTo,
 * -RepoRoot, -Registry, -SkipScriptCheck, -Only also work, in any case):
 *   --zip <path>          Replace the checkout from a GitHub "Download ZIP"
 *                         before anything else runs.
 *   --latest              Use the newest KOS-main*.zip in this folder or
 *                         ~\Downloads as --zip.
 *   --head-only           Push without cutting a version or moving any
 *                         deployment; test at the printed /dev link.
 *   --rollback-to <n>     Point every deployment in deployments.txt back to
 *                         version n. Pushes nothing. Needs exactly one
 *                         project in --only.
 *   --repo-root <dir>     The extracted checkout (default: KOS-main).
 *   --registry <dir>      Folder holding each project's real .clasp.json and
 *                         deployments.txt (default: clasp-registry). Must
 *                         live OUTSIDE the repo root.
 *   --only <a,b>          Run only the named project(s); the only way to run
 *                         a project marked onHold in the manifest.
 *   --skip-script-check   Run this copy even though it differs from the one
 *                         in the checkout.
 *   --instructions        Fill the KOS Claude Project instructions
 *                         (kos-personal/claude-project/PROJECT_INSTRUCTIONS.md)
 *                         with the doc links in <registry>\kos-project-links.txt,
 *                         copy the result to the clipboard and save it as
 *                         <registry>\PROJECT_INSTRUCTIONS.filled.md. Pushes
 *                         nothing. Combine with --latest to refresh first.
 *
 * Exit code: 0 when nothing failed, 1 otherwise.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const cp = require('child_process');

const IS_WIN = process.platform === 'win32';

// ---------------------------------------------------------------------------
// Manifest: structure only. No scriptIds or deployment IDs here -- those live
// only in the registry. Push-only projects run first.
//
//   push     no web app: HEAD is what runs (triggers, bound menus, library
//            HEAD for developmentMode consumers)
//   promote  web app: /exec serves a pinned version, so it must be moved
//
// A project with onHold: true runs only when named in --only (none are,
// today; central-ledger's hold was lifted once its intake fix went live).
// ---------------------------------------------------------------------------
const MANIFEST = [
  // central-ledger is also a library: unified-manual pins it at version 3
  // (developmentMode false), so pushing HEAD here does not change what
  // unified-manual runs until a new library version is cut and that pin
  // bumped in cas-ccps\clasp\manifests\unified-manual.appsscript.json.
  { name: 'central-ledger', type: 'cas-ccps', mode: 'push' },
  { name: 'unified-manual', type: 'cas-ccps', mode: 'push' },
  // makeCopy templates: new copies get this code, existing copies don't.
  { name: 'master-student-template', type: 'cas-ccps', mode: 'push' },
  { name: 'rubric-response-sheet', type: 'cas-ccps', mode: 'push' },
  { name: 'teacher-matrix-sheet', type: 'cas-ccps', mode: 'push' },
  // Container-bound to the private Family Mail Sentinel sheet; no web app.
  { name: 'family-sentinel', type: 'cas-ccps', mode: 'push' },

  { name: 'kos-personal', type: 'flat', mode: 'promote' },
  { name: 'leader-hub', type: 'flat', mode: 'promote' },
  { name: 'teacher-dashboard', type: 'cas-ccps', mode: 'promote' },
  { name: 'student-dashboard', type: 'cas-ccps', mode: 'promote' },
];
// cas-ccps:studio-steps is deliberately absent (kos-personal's was archived
// 2026-09-29) -- out of scope while the org-wide GCP block on custom Studio
// steps holds.

const SYNC_REL = path.join('tools', 'clasp-sync', 'sync.js');

// --instructions: the Project instructions template, and the two files it
// uses in the registry. The links are private doc URLs, so they live in the
// registry beside the .clasp.json files, never in the (public) repo.
const INSTRUCTIONS_REL = path.join('kos-personal', 'claude-project', 'PROJECT_INSTRUCTIONS.md');
const LINKS_FILE = 'kos-project-links.txt';
const FILLED_FILE = 'PROJECT_INSTRUCTIONS.filled.md';

/** A fatal, user-facing problem: printed as "ERROR: message", exit 1. */
class Fatal extends Error {}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const VALUE_FLAGS = new Set(['zip', 'rollbackto', 'reporoot', 'registry', 'only']);
const SWITCH_FLAGS = new Set(['latest', 'headonly', 'skipscriptcheck', 'instructions', 'help']);

/**
 * Accepts --zip x, --zip=x, -Zip x, --head-only, -HeadOnly, any case.
 * `--only a,b`, `--only a --only b` and `--only a b` are all the same.
 */
function parseArgs(argv) {
  const opts = {
    zip: '', latest: false, headOnly: false, rollbackTo: 0,
    repoRoot: 'KOS-main', registry: 'clasp-registry',
    skipScriptCheck: false, only: [], instructions: false, help: false,
  };
  let lastFlag = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '-?' || arg === '/?') { opts.help = true; continue; }
    const m = /^--?([A-Za-z][A-Za-z_-]*)(?:=(.*))?$/.exec(arg);
    if (!m) {
      // A bare word after --only continues the list (cmd users type `-Only a b`).
      if (lastFlag === 'only') { opts.only.push(...splitList(arg)); continue; }
      throw new Fatal(`Unexpected argument: ${arg}  (try --help)`);
    }
    const name = m[1].toLowerCase().replace(/[-_]/g, '');
    lastFlag = name;
    if (SWITCH_FLAGS.has(name)) {
      if (m[2] !== undefined) throw new Fatal(`--${m[1]} takes no value.`);
      if (name === 'latest') opts.latest = true;
      else if (name === 'headonly') opts.headOnly = true;
      else if (name === 'skipscriptcheck') opts.skipScriptCheck = true;
      else if (name === 'instructions') opts.instructions = true;
      else opts.help = true;
    } else if (VALUE_FLAGS.has(name)) {
      let value = m[2];
      if (value === undefined) {
        if (i + 1 >= argv.length) throw new Fatal(`--${m[1]} needs a value.`);
        value = argv[++i];
      }
      if (name === 'zip') opts.zip = value;
      else if (name === 'reporoot') opts.repoRoot = value;
      else if (name === 'registry') opts.registry = value;
      else if (name === 'only') opts.only.push(...splitList(value));
      else {
        const n = Number(value);
        // Versions start at 1. A 0 used to read as "no rollback", so
        // `--rollback-to 0 --only x` pushed and promoted x instead.
        if (!Number.isInteger(n) || n < 1) throw new Fatal(`--${m[1]} needs a version number of 1 or more, got: ${value}`);
        opts.rollbackTo = n;
      }
    } else {
      throw new Fatal(`Unknown option: ${arg}  (try --help)`);
    }
  }
  return opts;
}

function splitList(s) {
  return String(s).split(',').map((x) => x.trim()).filter(Boolean);
}

function usage() {
  return [
    'Usage: node run.js [options]',
    '',
    '  --zip <path>          replace the checkout from a GitHub "Download ZIP" first',
    '  --latest              use the newest KOS-main*.zip here or in ~\\Downloads',
    '  --head-only           push only; do not version or move any deployment',
    '  --rollback-to <n>     point every registered deployment back to version n',
    '  --repo-root <dir>     the extracted checkout (default: KOS-main)',
    '  --registry <dir>      folder of real .clasp.json files (default: clasp-registry)',
    '  --only <a,b>          run only the named project(s)',
    '  --skip-script-check   run this copy even if it differs from the checkout\'s',
    '  --instructions        fill the KOS Project instructions with the links in',
    `                        <registry>\\${LINKS_FILE} and copy them; pushes nothing`,
    '',
    'Projects: ' + MANIFEST.map((p) => p.name).join(', '),
    '',
    'run.ps1\'s spellings (-Zip, -Latest, -HeadOnly, -RollbackTo, -RepoRoot,',
    '-Registry, -SkipScriptCheck, -Only) are accepted too.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function resolveFull(p) {
  return path.resolve(process.cwd(), p);
}

function sameOrInside(child, parent) {
  const norm = (p) => {
    const withSep = path.resolve(p).replace(/[\\/]+$/, '') + path.sep;
    return IS_WIN ? withSep.toLowerCase() : withSep;
  };
  return norm(child).startsWith(norm(parent));
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function readText(file) {
  return stripBom(fs.readFileSync(file, 'utf8'));
}

function readJson(file) {
  return JSON.parse(readText(file));
}

/** Node's utf8 write adds no BOM, which is what sync.js's JSON.parse needs. */
function writeUtf8NoBom(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}

function splitLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * cmd.exe's default code page can't draw the box-drawing characters clasp
 * uses for its push file list, so they come out as mojibake. Show ASCII
 * instead on Windows (set KOS_RUN_UNICODE=1 after `chcp 65001` to keep them).
 */
function toConsole(line) {
  if (!IS_WIN || process.env.KOS_RUN_UNICODE === '1') return line;
  return line
    .replace(/[\u2514\u2570]/g, '\\')
    .replace(/[\u251c\u2502\u2503\u2523]/g, '|')
    .replace(/[\u2500\u2501]/g, '-');
}

function out(line = '') {
  console.log(toConsole(line));
}

function warn(line) {
  console.error('WARNING: ' + toConsole(line.replace(/^\s+/, '')));
}

/** 2026-10-13T06:07:08, local time (PowerShell's Get-Date -Format s). */
function isoLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Running clasp. On Windows, clasp is a clasp.cmd shim; Node refuses to spawn
// .cmd files without a shell (EINVAL since the 2024 security fix), so go via
// the shell there and quote each argument for cmd.exe.
// ---------------------------------------------------------------------------
function quoteForCmd(arg) {
  const a = String(arg);
  if (/^[A-Za-z0-9_@.:/\\+-]+$/.test(a)) return a;
  return '"' + a.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

function claspCommand() {
  return process.env.KOS_RUN_CLASP || 'clasp';
}

/** Returns { status, stdout, stderr } (lines, ANSI stripped). Never throws on a non-zero exit. */
function runClasp(args, cwd) {
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  const opts = { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 };
  let r;
  if (IS_WIN) {
    r = cp.spawnSync([claspCommand(), ...args].map(quoteForCmd).join(' '), { ...opts, shell: true });
  } else {
    r = cp.spawnSync(claspCommand(), args, opts);
  }
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      throw new Fatal('clasp was not found on PATH. Install it with: npm install -g @google/clasp');
    }
    throw r.error;
  }
  return {
    status: r.status === null ? 1 : r.status,
    stdout: splitLines(stripAnsi(r.stdout)),
    stderr: splitLines(stripAnsi(r.stderr)),
  };
}

// ---------------------------------------------------------------------------
// Parsing clasp's output and the registry files
// ---------------------------------------------------------------------------

/**
 * Lines of `clasp list-deployments` look like:
 *   - AKfycb...xyz @9 - description
 *   - AKfycb...abc @HEAD
 * Returns [{ id, version, description }], version "HEAD" for the test
 * deployment. Split on whitespace rather than a strict whole-line regex: a
 * strict one found no @HEAD line on a real Windows run.
 */
function parseDeploymentLines(lines) {
  const found = [];
  for (const raw of lines) {
    const line = stripAnsi(raw).trim();
    if (!line.startsWith('-')) continue;
    const m = /^(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/.exec(line.slice(1).trim());
    if (!m || !m[2].startsWith('@')) continue;
    const description = (m[3] || '').replace(/^-\s*/, '').trim();
    found.push({ id: m[1], version: m[2].slice(1), description });
  }
  return found;
}

/** Deployment IDs to keep live, from a registry deployments.txt; null if the file is missing. */
function getKeepList(file) {
  if (!fs.existsSync(file)) return null;
  return splitLines(readText(file))
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/**
 * The SHA this build will report from reportDeployVersion (7 characters).
 * stampBuild() writes it first when the checkout came from a GitHub zip.
 */
function getMarker(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /deployversionmarker/i.test(e.name))
    .map((e) => e.name)
    .sort();
  for (const name of files) {
    const m = /DEPLOY_VERSION_SHA = '([0-9a-f]{7})/.exec(readText(path.join(dir, name)));
    if (m) return m[1];
  }
  return '(none)';
}

// ---------------------------------------------------------------------------
// The deploy marker tracks the push (2026-10-28; BACKLOG, "A deploy marker
// that tracks the push"). A GitHub zip carries the commit it was cut from as
// its archive comment; --zip saves it beside the checkout (BUILD_COMMIT_FILE)
// and each build's marker file is stamped with it before the push, so
// reportDeployVersion says which commit is live. tools/deploy-drift/check.js
// accepts any commit that contains the project's latest change.
//
// A build whose code is the same as the last one pushed keeps that push's
// commit (the registry's last-build.json, per project), so its marker file
// doesn't change: the push stays "already up to date" and a web app cuts no
// new version. Apps Script caps versions per project.
// ---------------------------------------------------------------------------
const BUILD_COMMIT_FILE = '.kos-build-commit';
const LAST_BUILD_FILE = 'last-build.json';
const SHA40 = /^[0-9a-f]{40}$/;
const MARKER_CONST = /((?:const|var|let)\s+[A-Z_]*DEPLOY_VERSION_SHA\s*=\s*)'[0-9a-f]{40}'/;

/** The 40-hex commit in a zip's archive comment, or '' (not a GitHub zip). */
function zipCommit(zipPath) {
  const buf = fs.readFileSync(zipPath);
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const text = buf.toString('utf8', i + 22, i + 22 + buf.readUInt16LE(i + 20)).trim();
    return SHA40.test(text) ? text : '';
  }
  return '';
}

/** The commit the checkout was extracted from, or ''. */
function readBuildCommit(repoRoot) {
  try {
    const sha = readText(path.join(repoRoot, BUILD_COMMIT_FILE)).trim();
    return SHA40.test(sha) ? sha : '';
  } catch { return ''; }
}

function markerFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /deployversionmarker/i.test(e.name))
    .map((e) => e.name);
}

/** sha256 of the build's files, without its marker file(s) and .clasp.json. */
function buildHash(dir) {
  const skip = new Set([...markerFiles(dir), '.clasp.json']);
  const hash = crypto.createHash('sha256');
  const walk = (rel) => {
    const entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(r);
      else if (e.isFile() && !(rel === '' && skip.has(e.name))) {
        hash.update(r + '\0');
        hash.update(fs.readFileSync(path.join(dir, r)));
        hash.update('\0');
      }
    }
  };
  walk('');
  return hash.digest('hex');
}

/**
 * Stamps the build's marker file(s) for this push. Returns { sha, hash,
 * reused } or null when the checkout has no recorded commit (the marker
 * stays as committed).
 */
function stampBuild(workingDir, repoRoot, regDir) {
  const commit = readBuildCommit(repoRoot);
  if (!commit) return null;
  const hash = buildHash(workingDir);
  let last = null;
  try { last = readJson(path.join(regDir, LAST_BUILD_FILE)); } catch { /* none yet */ }
  const reused = !!(last && last.hash === hash && SHA40.test(String(last.commit)));
  const sha = reused ? last.commit : commit;
  for (const name of markerFiles(workingDir)) {
    const file = path.join(workingDir, name);
    const src = readText(file);
    if (MARKER_CONST.test(src)) writeUtf8NoBom(file, src.replace(MARKER_CONST, `$1'${sha}'`));
  }
  return { sha, hash, reused };
}

/** After a push lands: what was pushed, so an unchanged build keeps its commit. */
function recordBuild(regDir, stamp) {
  writeUtf8NoBom(path.join(regDir, LAST_BUILD_FILE),
    JSON.stringify({ hash: stamp.hash, commit: stamp.sha, at: new Date().toISOString() }, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Zip extraction (replaces Expand-Archive). Standard zips only (no zip64, no
// encryption), which is everything GitHub's "Download ZIP" produces. Each
// entry's CRC-32 is checked, and an entry that would land outside the
// destination (zip-slip) is refused.
// ---------------------------------------------------------------------------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** Extracts into destDir (created if needed). Returns the entry names written. */
function extractZip(zipPath, destDir) {
  const buf = fs.readFileSync(zipPath);

  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Fatal(`${zipPath} is not a zip file (no end-of-archive record).`);
  const total = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdOffset === 0xffffffff) throw new Fatal(`${zipPath} is a zip64 archive, which this script doesn't read.`);

  const root = path.resolve(destDir);
  fs.mkdirSync(root, { recursive: true });
  const written = [];
  let p = cdOffset;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Fatal(`${zipPath} has a damaged directory.`);
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;

    if (flags & 1) throw new Fatal(`${zipPath} is encrypted.`);
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Fatal(`${zipPath} has an entry that escapes the destination: ${name}`);
    }
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Fatal(`${zipPath} has a damaged entry: ${name}`);
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Fatal(`${zipPath}: unsupported compression method ${method} for ${name}`);
    if (data.length !== size || crc32(data) !== crc) throw new Fatal(`${zipPath}: ${name} is corrupt (size or CRC mismatch). Download the zip again.`);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    written.push(name);
  }
  return written;
}

function removeTree(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** rename, falling back to copy+delete when staging and target are on different drives. */
function moveTree(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV' && e.code !== 'EPERM' && e.code !== 'EBUSY') throw e;
    fs.cpSync(from, to, { recursive: true });
    removeTree(from);
  }
}

// ---------------------------------------------------------------------------
// The runner
// ---------------------------------------------------------------------------
function run(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { console.log(usage()); return 0; }

  if (opts.latest && opts.zip) throw new Fatal('Pass --zip or --latest, not both.');
  if (opts.rollbackTo && (opts.headOnly || opts.zip || opts.latest)) {
    throw new Fatal("--rollback-to pushes nothing, so it can't be combined with --head-only, --zip or --latest.");
  }
  if (opts.instructions && (opts.rollbackTo || opts.headOnly || opts.only.length)) {
    throw new Fatal('--instructions pushes nothing, so it only combines with --latest or --zip.');
  }
  if (opts.rollbackTo && opts.only.length !== 1) {
    throw new Fatal('--rollback-to needs exactly one project in --only: version numbers are per project.');
  }

  let zip = opts.zip;
  if (opts.latest) {
    const dirs = [process.cwd(), path.join(os.homedir(), 'Downloads')].filter((d) => fs.existsSync(d));
    const found = [];
    for (const d of dirs) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isFile() && /^KOS-main.*\.zip$/i.test(e.name)) {
          const full = path.join(d, e.name);
          found.push({ name: e.name, full, mtime: fs.statSync(full).mtime });
        }
      }
    }
    if (found.length === 0) throw new Fatal('--latest found no KOS-main*.zip here or in ~\\Downloads.');
    found.sort((a, b) => b.mtime - a.mtime);
    zip = found[0].full;
    out(`Using newest zip: ${found[0].name} (saved ${found[0].mtime.toLocaleString()})`);
  }

  // Resolve once, up front: a relative path would silently start meaning
  // something different if anything ever changed directory.
  const repoRoot = resolveFull(opts.repoRoot);
  const registry = resolveFull(opts.registry);

  if (!fs.existsSync(registry)) throw new Fatal(`Registry folder not found: ${registry}`);
  if (sameOrInside(registry, repoRoot)) {
    throw new Fatal(`Registry (${registry}) is inside the repo root (${repoRoot}) -- --zip would delete it. Move it out.`);
  }

  const names = MANIFEST.map((p) => p.name);
  const unknown = opts.only.filter((n) => !names.includes(n));
  if (unknown.length) throw new Fatal(`Not in the manifest: ${unknown.join(', ')}`);

  let targets;
  if (opts.only.length) {
    targets = MANIFEST.filter((p) => opts.only.includes(p.name));
  } else {
    const held = MANIFEST.filter((p) => p.onHold);
    if (held.length) out(`On hold, not run (name them in --only to run): ${held.map((p) => p.name).join(', ')}`);
    targets = MANIFEST.filter((p) => !p.onHold);
  }

  if (zip) updateCheckout(zip, repoRoot, registry);
  if (!fs.existsSync(path.join(repoRoot, SYNC_REL))) {
    throw new Fatal(`${repoRoot} doesn't look like a KOS checkout. Pass --zip or --repo-root.`);
  }

  // The copy of this script you run lives outside the checkout (--zip
  // replaces the checkout wholesale), so a new zip never updates it. An old
  // copy silently lacks whatever the new one fixes. So stop, before anything
  // is pushed, when this copy differs from the checkout's.
  const checkoutScript = path.join(repoRoot, 'tools', 'clasp-sync', 'run.js');
  if (!opts.skipScriptCheck && fs.existsSync(checkoutScript) && !isSameFile(__filename, checkoutScript)) {
    const norm = (f) => readText(f).replace(/\r\n/g, '\n');
    if (norm(__filename) !== norm(checkoutScript)) {
      console.error('');
      console.error('This run.js differs from the one in the checkout. Nothing was pushed.');
      console.error(`  running:  ${__filename}`);
      console.error(`  checkout: ${checkoutScript}`);
      console.error('Update it, then run the same command again:');
      console.error('');
      console.error(IS_WIN
        ? `  copy /Y "${checkoutScript}" "${__filename}"`
        : `  cp "${checkoutScript}" "${__filename}"`);
      console.error('');
      console.error('(--skip-script-check runs this copy anyway.)');
      return 1;
    }
  }

  if (opts.instructions) return writeInstructions(repoRoot, registry);

  // Fail early and plainly if clasp isn't installed, instead of once per project.
  const version = runClasp(['--version'], process.cwd());
  if (version.status !== 0) {
    throw new Fatal('clasp did not run. Install it with: npm install -g @google/clasp   (then: clasp login)');
  }

  const ctx = { opts, repoRoot, registry, markers: {}, links: {}, lastDeploymentLines: [] };
  const results = {};
  for (const project of targets) {
    // One project failing doesn't stop the rest; the summary says which.
    try {
      results[project.name] = invokeProject(ctx, project);
    } catch (e) {
      warn(`  ${project.name}: ${e.message}`);
      results[project.name] = `FAILED: ${e.message}`;
    }
  }

  out('');
  out('================ Summary ================');
  for (const name of Object.keys(results)) {
    const marker = ctx.markers[name] || '-';
    out(`  ${name.padEnd(24)} ${marker.padEnd(9)} ${results[name]}`);
  }
  if (Object.keys(ctx.links).length) {
    out('');
    out('================ Links ==================');
    for (const name of Object.keys(ctx.links)) {
      out(`  ${name}`);
      ctx.links[name].forEach((l) => out(`    ${l}`));
    }
  }
  out('');
  if (opts.rollbackTo) {
    out('Rolled back only -- nothing was pushed. Deployment IDs are unchanged.');
  } else {
    out("Next, by hand: reload each pushed project's editor tab and run reportDeployVersion.");
    out("It should report the marker above. (clasp run can't do this -- it needs a GCP project.)");
    if (opts.headOnly) {
      out("--head-only: web apps' live deployments were not moved. Test at the /dev links; run again without --head-only to release.");
    } else {
      out('Deployment IDs are unchanged, so no URLs need re-pasting anywhere.');
    }
  }

  const stale = instructionsChanged(repoRoot, registry);
  if (stale) {
    out('');
    out(`The KOS Project instructions changed since ${stale}. Run: node run.js --instructions`);
    out("then paste the result into the Project's Instructions.");
  }

  return Object.values(results).some((r) => r.startsWith('FAILED')) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// --instructions: the KOS Claude Project's instructions, links filled in.
// ---------------------------------------------------------------------------

/** KEY=https://... lines; # comments and blank lines skipped. */
function parseLinks(text) {
  const links = {};
  splitLines(text).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const m = /^([A-Z][A-Z0-9_]*)\s*=\s*(\S+)$/.exec(line);
    if (!m) throw new Fatal(`${LINKS_FILE} line ${i + 1} isn't NAME=https://...: ${line}`);
    if (!/^https:\/\//.test(m[2])) throw new Fatal(`${LINKS_FILE}: ${m[1]} isn't an https:// link.`);
    links[m[1]] = m[2];
  });
  return links;
}

/**
 * The part of PROJECT_INSTRUCTIONS.md meant for pasting (below its first
 * "---" line), with each `<link to NAME>` replaced from links. Throws, naming
 * them, if any placeholder has no link: a half-filled paste is worse than none.
 */
function fillInstructions(template, links) {
  const lines = splitLines(template.replace(/\r\n/g, '\n'));
  const cut = lines.findIndex((l) => l.trim() === '---');
  if (cut < 0) throw new Fatal(`${INSTRUCTIONS_REL} has no "---" line to paste below.`);
  const body = lines.slice(cut + 1).join('\n').replace(/^\n+/, '') + '\n';
  const missing = [];
  const filled = body.replace(/<link to ([A-Z][A-Z0-9_]*)>/g, (whole, name) => {
    if (links[name]) return links[name];
    if (!missing.includes(name)) missing.push(name);
    return whole;
  });
  if (missing.length) {
    throw new Fatal(`No link for ${missing.join(', ')}: add ${missing.map((n) => n + '=https://...').join(', ')} to ${LINKS_FILE}.`);
  }
  return filled;
}

function writeInstructions(repoRoot, registry) {
  const template = path.join(repoRoot, INSTRUCTIONS_REL);
  const linksFile = path.join(registry, LINKS_FILE);
  if (!fs.existsSync(template)) throw new Fatal(`Not found: ${template}`);
  if (!fs.existsSync(linksFile)) {
    throw new Fatal(`Not found: ${linksFile}. Create it with one NAME=https://... line per doc link ` +
      '(KOS_LATEST_PRIMER, KOS_OPEN_DECISIONS, KOS_CORE_FACTS, KOS_FAMILY_SIGNAL, KOS_SMP_REGISTER, KOS_CAS_SIGNAL).');
  }
  const links = parseLinks(readText(linksFile));
  const text = fillInstructions(readText(template), links);
  const used = new Set((readText(template).match(/<link to ([A-Z][A-Z0-9_]*)>/g) || [])
    .map((t) => t.slice(9, -1)));
  const unused = Object.keys(links).filter((k) => !used.has(k));
  if (unused.length) warn(`${LINKS_FILE} has links the instructions no longer use: ${unused.join(', ')}`);

  const filledFile = path.join(registry, FILLED_FILE);
  writeUtf8NoBom(filledFile, text);
  out(`Filled ${used.size} link(s); saved ${filledFile}`);
  if (copyToClipboard(text)) {
    out("Copied to the clipboard. In the KOS Project: Instructions, select all, paste, save.");
  } else {
    out(`Couldn't use the clipboard: open ${filledFile}, select all, copy, and paste it into the Project's Instructions.`);
  }
  return 0;
}

/**
 * Windows' clip.exe reads UTF-16LE with a BOM correctly (plain UTF-8 turns
 * the instructions' dashes and arrows into mojibake). KOS_RUN_NO_CLIPBOARD=1
 * skips it (tests).
 */
function copyToClipboard(text) {
  if (process.env.KOS_RUN_NO_CLIPBOARD === '1') return false;
  let cmd = null;
  let input = text;
  if (IS_WIN) {
    cmd = 'clip';
    input = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  } else if (process.platform === 'darwin') {
    cmd = 'pbcopy';
  }
  if (!cmd) return false;
  const r = cp.spawnSync(cmd, [], { input: input });
  return !r.error && r.status === 0;
}

/**
 * After a push: "your last filled copy" when the instructions in the checkout
 * fill differently from it, else "". Silent until kos-project-links.txt
 * exists, and on any read problem (this is only a reminder).
 */
function instructionsChanged(repoRoot, registry) {
  try {
    const linksFile = path.join(registry, LINKS_FILE);
    const template = path.join(repoRoot, INSTRUCTIONS_REL);
    if (!fs.existsSync(linksFile) || !fs.existsSync(template)) return '';
    const filledFile = path.join(registry, FILLED_FILE);
    if (!fs.existsSync(filledFile)) return 'you set up ' + LINKS_FILE;
    const now = fillInstructions(readText(template), parseLinks(readText(linksFile)));
    return now === readText(filledFile) ? '' : 'your last filled copy';
  } catch (e) {
    return '';
  }
}

function isSameFile(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// --zip: replace the checkout wholesale.
// ---------------------------------------------------------------------------
function updateCheckout(zipArg, repoRoot, registry) {
  const zipPath = resolveFull(zipArg);
  if (!fs.existsSync(zipPath)) throw new Fatal(`Zip not found: ${zipPath}`);

  if (fs.existsSync(repoRoot)) {
    // Windows won't delete a folder a shell is standing in, and a copy of
    // this script inside the checkout would be deleted with it.
    if (sameOrInside(process.cwd(), repoRoot)) {
      throw new Fatal(`Run this from outside ${repoRoot} (e.g. its parent folder) when using --zip.`);
    }
    // Refuse to delete anything that doesn't look like a KOS checkout.
    if (!fs.existsSync(path.join(repoRoot, SYNC_REL))) {
      throw new Fatal(`${repoRoot} exists but doesn't look like a KOS checkout (no ${SYNC_REL}). Not deleting it.`);
    }
    // Real configs are gitignored, so the zip never brings them back. Any
    // with no registry copy would be lost for good.
    const orphans = [];
    const localDir = path.join(repoRoot, 'cas-ccps', 'clasp', 'local');
    if (fs.existsSync(localDir)) {
      for (const f of fs.readdirSync(localDir)) {
        if (!f.endsWith('.clasp.json')) continue;
        const name = f.replace(/\.clasp\.json$/, '');
        const inReg = path.join(registry, 'cas-ccps', name, '.clasp.json');
        if (!fs.existsSync(inReg)) orphans.push(`${path.join(localDir, f)} -> ${inReg}`);
      }
    }
    for (const flat of MANIFEST.filter((p) => p.type === 'flat')) {
      const inRepo = path.join(repoRoot, flat.name, '.clasp.json');
      const inReg = path.join(registry, flat.name, '.clasp.json');
      if (fs.existsSync(inRepo) && !fs.existsSync(inReg)) orphans.push(`${inRepo} -> ${inReg}`);
    }
    if (orphans.length) {
      throw new Fatal('These real configs exist only inside the repo root and would be deleted. Copy each first:\n  ' + orphans.join('\n  '));
    }
  }

  const staging = path.join(os.tmpdir(), 'kos-zip-' + crypto.randomBytes(8).toString('hex'));
  try {
    extractZip(zipPath, staging);
    // A GitHub zip holds exactly one top-level folder (KOS-main).
    const top = fs.readdirSync(staging, { withFileTypes: true });
    if (top.length !== 1 || !top[0].isDirectory()) {
      throw new Fatal(`Expected one top-level folder in ${zipPath}, found: ${top.map((e) => e.name).join(', ')}`);
    }
    const topDir = path.join(staging, top[0].name);
    if (!fs.existsSync(path.join(topDir, SYNC_REL))) {
      throw new Fatal(`${zipPath} doesn't look like a KOS zip (no ${SYNC_REL}).`);
    }
    if (fs.existsSync(repoRoot)) removeTree(repoRoot);
    moveTree(topDir, repoRoot);
  } finally {
    if (fs.existsSync(staging)) removeTree(staging);
  }
  out(`Checkout replaced from ${zipPath}`);
  const commit = zipCommit(zipPath);
  if (commit) {
    writeUtf8NoBom(path.join(repoRoot, BUILD_COMMIT_FILE), commit + '\n');
    out(`  commit ${commit.slice(0, 7)} (from the zip): each build's deploy marker is stamped with it`);
  } else {
    warn('  this zip records no commit (not a GitHub "Download ZIP"?): deploy markers stay as committed');
  }
}

// ---------------------------------------------------------------------------
// Copy a project's real .clasp.json from the registry, or refuse. rootDir is
// forced to "." -- `clasp clone` can record an absolute rootDir pointing at
// the registry folder, and a push from the build folder would then upload the
// registry's stale cloned files instead of the build.
// ---------------------------------------------------------------------------
function getBoundConfig(registryConfigPath, targetConfigPath) {
  if (!fs.existsSync(registryConfigPath)) {
    warn(`  no established scriptId at ${registryConfigPath} -- skipping. Bind it by hand first: clasp clone <realScriptId> into that folder.`);
    return false;
  }
  const config = readJson(registryConfigPath);
  if (!config.scriptId || config.scriptId === 'REPLACE_WITH_REAL_SCRIPT_ID') {
    warn(`  ${registryConfigPath} has no real scriptId -- skipping.`);
    return false;
  }
  config.rootDir = '.';
  writeUtf8NoBom(targetConfigPath, JSON.stringify(config, null, 2) + '\n');
  return true;
}

function getDeployments(ctx, cwd) {
  const r = runClasp(['list-deployments'], cwd);
  ctx.lastDeploymentLines = r.stdout.map((l) => l.trim());
  return parseDeploymentLines(r.stdout);
}

function showDeploymentLines(ctx) {
  warn("  couldn't read the deployments -- clasp list-deployments printed:");
  ctx.lastDeploymentLines.forEach((l) => out(`      [${l}]`));
}

function addLink(ctx, project, label, url) {
  (ctx.links[project] = ctx.links[project] || []).push(`${label.padEnd(8)} ${url}`);
}

function echo(lines) {
  lines.forEach((l) => out(`    ${l}`));
}

function listDeploymentsEcho(ctx, cwd) {
  echo(runClasp(['list-deployments'], cwd).stdout);
}

/**
 * `clasp push`, echoing its output. Returns "failed", "unchanged" or
 * "pushed". --force answers clasp's "overwrite the remote manifest?" prompt:
 * with output captured that prompt would be invisible and the run would
 * hang. The repo's appsscript.json is the source of truth, so yes is the
 * answer.
 */
function claspPush(cwd) {
  const r = runClasp(['push', '--force'], cwd);
  echo(r.stdout);
  echo(r.stderr);
  if (r.status !== 0) return { state: 'failed', status: r.status };
  if ([...r.stdout, ...r.stderr].some((l) => /already up to date/i.test(l))) return { state: 'unchanged', status: 0 };
  return { state: 'pushed', status: 0 };
}

// ---------------------------------------------------------------------------
// Push-only projects: no deployment concept, HEAD is the whole job.
// ---------------------------------------------------------------------------
function invokePushOnly(ctx, workingDir) {
  const push = claspPush(workingDir);
  if (push.state === 'failed') {
    warn(`  clasp push failed (exit ${push.status})`);
    return 'FAILED: push';
  }
  return push.state === 'unchanged' ? 'unchanged (already up to date)' : 'pushed';
}

// ---------------------------------------------------------------------------
// Web apps: push, cut one version, point every registered deployment at it.
// ---------------------------------------------------------------------------
function invokePushAndPromote(ctx, workingDir, deploymentsFile, marker, projectName) {
  const keep = getKeepList(deploymentsFile);
  if (keep === null) {
    warn(`  no ${deploymentsFile} -- skipping. Put the deployment IDs to keep live in it, one per line. Currently live on this project:`);
    listDeploymentsEcho(ctx, workingDir);
    return 'SKIPPED: no deployments.txt';
  }
  if (keep.length === 0) {
    warn(`  ${deploymentsFile} lists no deployment IDs -- skipping.`);
    return 'SKIPPED: empty deployments.txt';
  }

  const push = claspPush(workingDir);
  if (push.state === 'failed') {
    warn(`  clasp push failed (exit ${push.status}) -- stopping before versioning.`);
    return 'FAILED: push';
  }
  if (push.state === 'unchanged') {
    // HEAD already has this code. That alone doesn't mean it's released: a
    // --head-only test push, or a push whose promote step never ran, leaves
    // HEAD ahead of the deployments. This script describes each deployment
    // it promotes as "<marker> v<n>", so a deployment already carrying this
    // build's marker is current. Apps Script caps versions per project, so
    // only cut one when something isn't.
    const current = getDeployments(ctx, workingDir).filter((d) => keep.includes(d.id));
    const behind = current.filter((d) => !d.description.toLowerCase().startsWith((marker + ' ').toLowerCase()));
    if (current.length === keep.length && behind.length === 0) {
      warn(`  nothing new pushed and every deployment is already on ${marker} -- nothing to do.`);
      return 'unchanged (already up to date)';
    }
    out(`    code already on HEAD, but not every deployment is on ${marker} yet -- cutting a version from HEAD`);
  }

  const ver = runClasp(['version', `${marker} ${isoLocal()}`], workingDir);
  const verOut = [...ver.stdout, ...ver.stderr].join('\n');
  const m = /Created version (\d+)/.exec(verOut);
  if (!m) {
    warn(`  couldn't read a version number from: ${verOut} -- deployments left where they are.`);
    return 'FAILED: version (code IS pushed to HEAD)';
  }
  const n = m[1];
  out(`    created version ${n}`);

  const all = getDeployments(ctx, workingDir).filter((d) => d.version !== 'HEAD');
  if (all.length === 0) showDeploymentLines(ctx);
  const live = all.map((d) => d.id);
  const was = [...new Set(all.filter((d) => keep.includes(d.id)).map((d) => d.version))]
    .sort((a, b) => Number(a) - Number(b));
  let promoted = 0;
  const problems = [];
  for (const id of keep) {
    if (!live.includes(id)) {
      warn(`  ${id} is in deployments.txt but not live on this project -- skipped`);
      problems.push(`not live: ${id}`);
      continue;
    }
    const r = runClasp(['update-deployment', id, '--versionNumber', n, '--description', `${marker} v${n}`], workingDir);
    echo(r.stdout);
    echo(r.stderr);
    if (r.status !== 0) {
      warn(`  update-deployment failed for ${id}`);
      problems.push(`update failed: ${id}`);
    } else {
      promoted++;
      addLink(ctx, projectName, '/exec', `https://script.google.com/macros/s/${id}/exec`);
    }
  }
  const unlisted = live.filter((id) => !keep.includes(id));
  if (unlisted.length) warn(`  live but not in deployments.txt, left as-is: ${unlisted.join(', ')}`);
  listDeploymentsEcho(ctx, workingDir);

  let result = `v${n} -> ${promoted}/${keep.length} deployment(s)`;
  if (was.length === 1) {
    result += ` (was v${was[0]}; undo: --rollback-to ${was[0]})`;
  } else if (was.length > 1) {
    // One --rollback-to can't restore deployments that started on different versions.
    result += ` (were on v${was.join('/v')}; to undo, update-deployment each back by hand)`;
  }
  return problems.length ? `FAILED: ${result}; ${problems.join('; ')}` : result;
}

// ---------------------------------------------------------------------------
// --head-only for a web app: push, then print the /dev link that serves HEAD.
// Nothing is versioned and no deployment moves, so users see no change.
// ---------------------------------------------------------------------------
function invokeHeadOnly(ctx, workingDir, projectName) {
  const push = claspPush(workingDir);
  if (push.state === 'failed') {
    warn(`  clasp push failed (exit ${push.status})`);
    return 'FAILED: push';
  }
  const head = getDeployments(ctx, workingDir).find((d) => d.version === 'HEAD');
  if (head) addLink(ctx, projectName, '/dev', `https://script.google.com/macros/s/${head.id}/dev`);
  else showDeploymentLines(ctx);
  const what = push.state === 'unchanged' ? 'unchanged (already up to date)' : 'pushed to HEAD';
  return `${what}; live deployments untouched, test at /dev`;
}

// ---------------------------------------------------------------------------
// --rollback-to: point every registered deployment at an existing version.
// Pushes nothing.
// ---------------------------------------------------------------------------
function invokeRollback(ctx, workingDir, deploymentsFile, version, projectName) {
  const keep = getKeepList(deploymentsFile);
  if (!keep || keep.length === 0) {
    warn(`  no deployment IDs in ${deploymentsFile} -- nothing to roll back.`);
    return 'SKIPPED: no deployments.txt';
  }
  const live = getDeployments(ctx, workingDir).filter((d) => d.version !== 'HEAD').map((d) => d.id);
  let moved = 0;
  const problems = [];
  for (const id of keep) {
    if (!live.includes(id)) {
      warn(`  ${id} is in deployments.txt but not live on this project -- skipped`);
      problems.push(`not live: ${id}`);
      continue;
    }
    const r = runClasp(['update-deployment', id, '--versionNumber', String(version), '--description', `rollback to v${version}`], workingDir);
    echo(r.stdout);
    echo(r.stderr);
    if (r.status !== 0) {
      problems.push(`update failed: ${id}`);
    } else {
      moved++;
      addLink(ctx, projectName, '/exec', `https://script.google.com/macros/s/${id}/exec`);
    }
  }
  listDeploymentsEcho(ctx, workingDir);
  const result = `rolled back to v${version} -> ${moved}/${keep.length} deployment(s)`;
  return problems.length ? `FAILED: ${result}; ${problems.join('; ')}` : result;
}

// ---------------------------------------------------------------------------
// Project types. "flat" = one folder, .clasp.json at its root. "cas-ccps" =
// shared-source project that tools/clasp-sync/sync.js builds into
// cas-ccps\.clasp-build\<name>\ (it wipes and rebuilds that folder each run,
// and copies cas-ccps\clasp\local\<name>.clasp.json into it).
// ---------------------------------------------------------------------------
function invokeProject(ctx, p) {
  const { opts, repoRoot, registry } = ctx;
  out('');
  out(`== ${p.name} (${p.type}, ${p.mode}) ==`);

  let regDir;
  let workingDir;
  if (p.type === 'flat') {
    regDir = path.join(registry, p.name);
    workingDir = path.join(repoRoot, p.name);
    if (!getBoundConfig(path.join(regDir, '.clasp.json'), path.join(workingDir, '.clasp.json'))) {
      return 'SKIPPED: not in registry';
    }
  } else {
    regDir = path.join(registry, 'cas-ccps', p.name);
    if (!getBoundConfig(path.join(regDir, '.clasp.json'), path.join(repoRoot, 'cas-ccps', 'clasp', 'local', `${p.name}.clasp.json`))) {
      return 'SKIPPED: not in registry';
    }
    const sync = cp.spawnSync(process.execPath, [SYNC_REL, p.name], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    echo(splitLines(sync.stdout));
    echo(splitLines(sync.stderr));
    if (sync.status !== 0) {
      warn(`  sync.js failed (exit ${sync.status})`);
      return 'FAILED: sync.js';
    }
    workingDir = path.join(repoRoot, 'cas-ccps', '.clasp-build', p.name);
  }

  try {
    const scriptId = readJson(path.join(regDir, '.clasp.json')).scriptId;
    addLink(ctx, p.name, 'editor', `https://script.google.com/d/${scriptId}/edit`);
  } catch { /* the link is only a convenience */ }

  const deploymentsFile = path.join(regDir, 'deployments.txt');
  if (opts.rollbackTo) {
    if (p.mode === 'push') {
      return 'SKIPPED: not a web app -- HEAD is what runs, so roll back by pushing the older code';
    }
    return invokeRollback(ctx, workingDir, deploymentsFile, opts.rollbackTo, p.name);
  }

  const stamp = stampBuild(workingDir, repoRoot, regDir);
  if (!stamp) warn('  no commit recorded for this checkout (use --zip or --latest): the marker is the committed one, which may be stale');
  else if (stamp.reused) out('  code unchanged since the last push: the marker keeps that push\'s commit');
  const marker = getMarker(workingDir);
  out(`  marker in this build: ${marker}  (reportDeployVersion should say the same after the push)`);
  ctx.markers[p.name] = marker;

  let result;
  if (p.mode === 'push') {
    if (opts.headOnly) out('  (--head-only: this project has no /dev buffer; its triggers run the pushed code)');
    result = invokePushOnly(ctx, workingDir);
  } else if (opts.headOnly) {
    result = invokeHeadOnly(ctx, workingDir, p.name);
  } else {
    result = invokePushAndPromote(ctx, workingDir, deploymentsFile, marker, p.name);
  }
  // Recorded once the code is on HEAD, whatever happened to the versions.
  if (stamp && !/^(FAILED: push|SKIPPED)/.test(result)) recordBuild(regDir, stamp);
  return result;
}

// ---------------------------------------------------------------------------
module.exports = {
  MANIFEST, Fatal, parseArgs, parseDeploymentLines, getKeepList, getMarker,
  quoteForCmd, crc32, extractZip, isoLocal, run, parseLinks, fillInstructions,
  zipCommit, readBuildCommit, buildHash, stampBuild, BUILD_COMMIT_FILE, LAST_BUILD_FILE,
};

if (require.main === module) {
  let code;
  try {
    code = run(process.argv.slice(2));
  } catch (e) {
    if (e instanceof Fatal) {
      console.error('ERROR: ' + e.message);
      code = 1;
    } else {
      console.error(e && e.stack ? e.stack : String(e));
      code = 1;
    }
  }
  process.exitCode = code;
}
