#!/usr/bin/env node
'use strict';
// Student-data scan. Fails when the repo holds something shaped like
// student data, and says where without ever printing what: each finding is
// a path, a line, a kind and a short hash of the match, so the run's own
// output (CI logs, an agent session) never carries the data.
//
//   node tools/student-data-scan/check.js              the working tree (CI)
//   node tools/student-data-scan/check.js --history    every blob in git history
//   node tools/student-data-scan/check.js --roster <file>
//       also matches the full names in a roster CSV kept outside the repo
//       (a Canvas export: a "Student" column, "Last, First"). Run this on the
//       operator's own machine only; the names are never printed or stored.
//
// Office and zip files (.xlsx .docx .pptx .od* .imscc .zip ...) are
// unpacked in memory and their text members scanned the same way, reported
// as path!member:line. A container that can't be opened is a finding. Any
// other file the scan doesn't read is counted in a closing "not read" line.
//
// A finding that is a deliberate placeholder goes in allow.json by its hash,
// after a person has looked at the line. Decision on 2026-10-19: the repo
// stays public, after a scrub of the tree and its history and this check.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.clasp-build']);
const TEXT_EXT = /\.(js|gs|md|json|html|txt|csv|yml|yaml|ps1|py|sh|tsv|xml)$/i;
// Zip containers: unpacked in memory, their text members scanned.
const ZIP_EXT = /\.(xlsx|xlsm|docx|pptx|odt|ods|odp|imscc|zip)$/i;
// Members of a container that are read as text (as well as TEXT_EXT).
const MEMBER_TEXT_EXT = /\.(xml|html|htm|txt|csv|json|md|rels)$/i;
const MEMBER_CAP = 20 * 1024 * 1024; // bytes uncompressed; a larger member is skipped with a warning
const MAX_DEPTH = 3; // zips inside zips

const KINDS = [
  // A student account: anything @ the student domain.
  { kind: 'student-email', re: /[A-Za-z0-9._%+-]+@student\.ccpsnet\.net/gi },
  // An ID-shaped address (six or more digits before the @), any domain.
  { kind: 'id-shaped-email', re: /\b\d{6,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

const hash = (s) => crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex').slice(0, 12);

function loadAllow() {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, 'allow.json'), 'utf8'));
    return new Set((a.allow || []).map((x) => x.hash));
  } catch (e) {
    return new Set();
  }
}

function loadRoster(file) {
  if (!file) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const col = header.indexOf('student');
  if (col === -1) throw new Error('roster: no "Student" column');
  const names = new Set();
  lines.slice(1).forEach((line) => {
    const m = line.match(/^"([^"]*)"/) || [null, line.split(',')[col]];
    const raw = String(m[1] || '').trim();
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    const full = parts.length === 2 ? parts[1] + ' ' + parts[0] : raw;
    if (!raw || /^test student$|points possible/i.test(full)) return;
    if (full.split(/\s+/).length >= 2) names.add(full.toLowerCase());
  });
  return [...names].map((n) => ({
    kind: 'roster-name',
    re: new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'gi'),
  }));
}

// `seen`, when given, collects every match (lowercased, allowlisted or not)
// and suppresses a match that contains one already seen: the tag-stripped
// pass over a container member then adds only what the raw pass could not
// see. Matched text stays in memory and is never printed.
function scanText(text, label, kinds, allow, out, seen) {
  const lines = text.split(/\r?\n/);
  const found = [];
  lines.forEach((line, i) => {
    kinds.forEach((k) => {
      k.re.lastIndex = 0;
      let m;
      while ((m = k.re.exec(line)) !== null) {
        const t = m[0].toLowerCase();
        found.push(t);
        if (seen && [...seen].some((x) => t.includes(x))) continue;
        const h = hash(m[0]);
        if (!allow.has(h)) out.push({ where: label + ':' + (i + 1), kind: k.kind, hash: h });
      }
    });
  });
  if (seen) found.forEach((t) => seen.add(t));
}

// ---- zip containers ---------------------------------------------------------
// A minimal reader of the zip central directory (zip64 included), Node
// built-ins only: method 0 (stored) and 8 (deflate). It throws ZipError with
// a short reason, never file content, when a container can't be opened.

class ZipError extends Error {}

let CRC_TABLE = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u64(buf, off) {
  const v = buf.readBigUInt64LE(off);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('zip64 size out of range');
  return Number(v);
}

// The member list: [{ name, flags, method, crc, csize, usize, offset }].
function zipEntries(buf) {
  if (buf.length < 22) throw new ZipError('too short to be a zip');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new ZipError('no zip directory: not a zip, or encrypted');
  let count = buf.readUInt16LE(eocd + 10);
  let cdSize = buf.readUInt32LE(eocd + 12);
  let cdOff = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
    const loc = eocd - 20;
    if (loc < 0 || buf.readUInt32LE(loc) !== 0x07064b50) throw new ZipError('zip64 locator missing');
    const z = u64(buf, loc + 8);
    if (z + 56 > buf.length || buf.readUInt32LE(z) !== 0x06064b50) throw new ZipError('zip64 directory missing');
    count = u64(buf, z + 32);
    cdSize = u64(buf, z + 40);
    cdOff = u64(buf, z + 48);
  }
  if (cdOff + cdSize > buf.length) throw new ZipError('directory past end of file');
  const out = [];
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('bad directory entry');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const e = {
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      csize: buf.readUInt32LE(p + 20),
      usize: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    };
    // zip64 extra field: the fields set to 0xffffffff, in order usize, csize, offset.
    let x = p + 46 + nameLen;
    const xEnd = Math.min(x + extraLen, buf.length);
    while (x + 4 <= xEnd) {
      const id = buf.readUInt16LE(x);
      const len = buf.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        ['usize', 'csize', 'offset'].forEach((f) => {
          if (e[f] === 0xffffffff && q + 8 <= Math.min(x + 4 + len, xEnd)) { e[f] = u64(buf, q); q += 8; }
        });
      }
      x += 4 + len;
    }
    out.push(e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// One member's bytes; null when it is over `cap` uncompressed. Throws
// ZipError when it can't be read.
function zipRead(buf, e, cap) {
  if (e.flags & 1) throw new ZipError('encrypted member');
  if (e.usize > cap) return null;
  const h = e.offset;
  if (h + 30 > buf.length || buf.readUInt32LE(h) !== 0x04034b50) throw new ZipError('bad local header');
  const start = h + 30 + buf.readUInt16LE(h + 26) + buf.readUInt16LE(h + 28);
  if (start + e.csize > buf.length) throw new ZipError('member past end of file');
  const raw = buf.subarray(start, start + e.csize);
  let data;
  if (e.method === 0) data = raw;
  else if (e.method === 8) {
    try {
      data = zlib.inflateRawSync(raw, { maxOutputLength: cap + 1 });
    } catch (err) {
      if (err.code === 'ERR_BUFFER_TOO_LARGE') return null;
      throw new ZipError('deflate data corrupt');
    }
  } else throw new ZipError('unsupported compression method ' + e.method);
  if (data.length > cap) return null;
  if (data.length !== e.usize || crc32(data) !== e.crc) throw new ZipError('checksum mismatch');
  return data;
}

// Block-level tags become line breaks; every other tag is dropped, so text
// split across runs (<w:r>, <a:r>, <text:span>, a shared string's <r>) is
// joined again.
const BLOCK_TAG = /^(?:p|si|c|row|tr|td|th|li|div|br|h[1-6]?|title|tc|table-cell|cell|line-break)$/i;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function stripTags(xml) {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<\/?([A-Za-z_][\w.:-]*)[^>]*>/g, (_, name) => (BLOCK_TAG.test(name.replace(/^.*:/, '')) ? '\n' : ''))
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, d, x, n) => {
      if (d || x) { try { return String.fromCodePoint(parseInt(d || x, d ? 10 : 16)); } catch (e) { return m; } }
      const v = ENTITIES[n.toLowerCase()];
      return v === undefined ? m : v;
    });
}

const bytesHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);

// Scans one zip container. Findings go to `out`. A container (or a text
// member of one) that can't be opened is a finding, kind
// unreadable-container, hashed by the container's bytes so a person can
// allowlist a known one. An over-cap member goes to `warnings`.
function scanContainer(buf, label, kinds, allow, out, warnings, depth = 0) {
  const unreadable = (where, err) => {
    if (!(err instanceof ZipError) && !(err instanceof RangeError)) throw err;
    const h = bytesHash(buf);
    if (!allow.has(h)) out.push({ where, kind: 'unreadable-container', hash: h, note: err.message });
  };
  let entries;
  try {
    entries = zipEntries(buf);
  } catch (err) {
    return unreadable(label, err);
  }
  entries.forEach((e) => {
    if (e.name.endsWith('/')) return;
    const isText = MEMBER_TEXT_EXT.test(e.name) || TEXT_EXT.test(e.name);
    const isZip = !isText && ZIP_EXT.test(e.name) && depth < MAX_DEPTH;
    if (!isText && !isZip) return;
    const where = label + '!' + e.name;
    let data;
    try {
      data = zipRead(buf, e, MEMBER_CAP);
    } catch (err) {
      return unreadable(where, err);
    }
    if (data === null) return warnings.push({ where, kind: 'member-over-20MB' });
    if (isZip) return scanContainer(data, where, kinds, allow, out, warnings, depth + 1);
    const text = data.toString('utf8');
    const seen = new Set();
    scanText(text, where, kinds, allow, out, seen);
    if (/\.(xml|rels|html?)$/i.test(e.name)) scanText(stripTags(text), where + '#text', kinds, allow, out, seen);
  });
}

// Files the scan neither reads nor unpacks, counted by extension.
function extOf(name) {
  const b = path.basename(name);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i).toLowerCase() : '(no extension)';
}

function formatNotRead(counts) {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return 'not read: ' + (e.length ? e.map(([k, v]) => k + ' ' + v).join(', ') : 'nothing');
}

function walk(dir, files) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    if (SKIP_DIRS.has(d.name)) return;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, files);
    else if (d.isFile()) files.push(p);
  });
  return files;
}

function scanTree(kinds, allow, root = ROOT) {
  const out = [];
  const warnings = [];
  const notRead = {};
  walk(root, []).forEach((f) => {
    if (path.resolve(f) === path.resolve(__filename)) return;
    const label = path.relative(root, f).split(path.sep).join('/');
    if (TEXT_EXT.test(f)) scanText(fs.readFileSync(f, 'utf8'), label, kinds, allow, out);
    else if (ZIP_EXT.test(f)) scanContainer(fs.readFileSync(f), label, kinds, allow, out, warnings);
    else notRead[extOf(f)] = (notRead[extOf(f)] || 0) + 1;
  });
  return { findings: out, warnings, notRead };
}

function scanHistory(kinds, allow) {
  const git = (args, input) => execFileSync('git', args, { cwd: ROOT, input, maxBuffer: 1 << 30 }).toString();
  const seen = new Map(); // blob -> first path
  git(['rev-list', '--all', '--objects']).split('\n').forEach((l) => {
    const sp = l.indexOf(' ');
    if (sp > 0 && !seen.has(l.slice(0, sp))) seen.set(l.slice(0, sp), l.slice(sp + 1));
  });
  const blobs = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], [...seen.keys()].join('\n'))
    .split('\n').filter((l) => l.endsWith(' blob')).map((l) => l.split(' ')[0])
    .filter((b) => !/student-data-scan\/check\.js$/.test(seen.get(b)));
  const out = [];
  const warnings = [];
  const notRead = {};
  blobs.forEach((b) => {
    const name = seen.get(b);
    const isText = TEXT_EXT.test(name);
    if (!isText && !ZIP_EXT.test(name)) {
      notRead[extOf(name)] = (notRead[extOf(name)] || 0) + 1;
      return;
    }
    const buf = execFileSync('git', ['cat-file', 'blob', b], { cwd: ROOT, maxBuffer: 1 << 30 });
    const label = name + '@' + b.slice(0, 8);
    if (isText) scanText(buf.toString(), label, kinds, allow, out);
    else scanContainer(buf, label, kinds, allow, out, warnings);
  });
  return { findings: out, warnings, notRead };
}

// Log lines that print a student identifier. The operator pastes Apps
// Script logs into sessions, so a Logger.log / console.* call in
// cas-ccps/scripts must not pass a student's address, Google ID, SIS login
// or name. Only these unambiguous variable names count: a plain `email`
// is as often a teacher's, so it is not matched (a known gap; read the
// call). String literals are blanked first, so wording never matches.
// Warnings only: they do not change the exit status.
const LOG_IDENT_RE = /(?:^|[^\w$.])(?:studentEmail|studentName|studentGoogleId|googleId|sisLogin)\b|\.(?:studentEmail|studentName|googleId|sisLogin)\b|\bstudent\.(?:email|name)\b/;
const LOG_CALL_RE = /\b(?:Logger\.log|console\.(?:log|warn|error|info))\s*\(/g;

function scanLogCalls(src, label, out) {
  LOG_CALL_RE.lastIndex = 0;
  let m;
  while ((m = LOG_CALL_RE.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    let quote = null;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const args = src.slice(m.index + m[0].length, i - 1)
      .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    if (LOG_IDENT_RE.test(args)) {
      out.push({ where: label + ':' + (src.slice(0, m.index).split('\n').length), kind: 'log-identifier' });
    }
  }
  return out;
}

function scanLogs() {
  const dir = path.join(ROOT, 'cas-ccps', 'scripts');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).filter((f) => /\.(js|gs)$/.test(f)).sort().forEach((f) => {
    scanLogCalls(fs.readFileSync(path.join(dir, f), 'utf8'), path.join('cas-ccps', 'scripts', f), out);
  });
  return out;
}

function main(argv) {
  const ri = argv.indexOf('--roster');
  const kinds = KINDS.concat(loadRoster(ri !== -1 ? argv[ri + 1] : ''));
  const allow = loadAllow();
  const history = argv.includes('--history');
  const { findings, warnings, notRead } = history ? scanHistory(kinds, allow) : scanTree(kinds, allow);
  const counts = {};
  findings.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  findings.forEach((f) => console.log(f.where + '  ' + f.kind + '  ' + f.hash + (f.note ? '  (' + f.note + ')' : '')));
  warnings.forEach((w) => console.log(w.where + '  ' + w.kind + '  (warning: not read)'));
  if (!history) {
    const logs = scanLogs();
    logs.forEach((f) => console.log(f.where + '  ' + f.kind + '  (warning)'));
    if (logs.length) console.log(logs.length + ' log call(s) print a student identifier (warnings; see README).');
  }
  console.log('student-data-scan (' + (history ? 'history' : 'working tree') + ') — ' + findings.length +
    ' finding(s)' + (findings.length ? ': ' + Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ') : ''));
  console.log(formatNotRead(notRead) + (history ? ' (blobs)' : ''));
  return findings.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = {
  scanText, hash, KINDS, loadRoster, scanLogCalls,
  scanContainer, zipEntries, stripTags, scanTree, formatNotRead, crc32, MEMBER_CAP,
};
