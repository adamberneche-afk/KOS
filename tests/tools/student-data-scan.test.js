'use strict';
// tools/student-data-scan: finds student-shaped data and reports where,
// never what. Synthetic strings only.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const scan = require('../../tools/student-data-scan/check.js');

test('both kinds are found; a finding carries a hash, never the text', () => {
  const out = [];
  scan.scanText('reach 7654321@example.org or zz.top@student.ccpsnet.net\nnone here',
    'f.md', scan.KINDS, new Set(), out);
  assert.deepEqual(out.map((f) => [f.where, f.kind]),
    [['f.md:1', 'student-email'], ['f.md:1', 'id-shaped-email']]);
  assert.ok(out.every((f) => /^[0-9a-f]{12}$/.test(f.hash)));
  assert.doesNotMatch(JSON.stringify(out), /7654321|zz\.top/);
});

test('an allowlisted hash is skipped; a domain with no account is not a finding', () => {
  const out = [];
  scan.scanText('-from:student.ccpsnet.net 7654321@example.org', 'f.md', scan.KINDS,
    new Set([scan.hash('7654321@example.org')]), out);
  assert.deepEqual(out, []);
});

test('roster names match as full names, either order in the export', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sds-'));
  const csv = path.join(dir, 'roster.csv');
  fs.writeFileSync(csv, 'Student,ID,Section\n"Zyx, Quorra",1,P1\n"Student, Test",2,P1\n    Points Possible,,\n');
  const kinds = scan.loadRoster(csv);
  assert.equal(kinds.length, 1, 'the test student and the points row are skipped');
  const out = [];
  scan.scanText('Quorra  Zyx was here; Quorra alone is not', 'n.md', kinds, new Set(), out);
  assert.deepEqual(out.map((f) => f.kind), ['roster-name']);
});

test('log calls: a student identifier is flagged by line; wording and teacher addresses are not', () => {
  const src = [
    'Logger.log("[X] studentEmail missing for row " + row);',
    'Logger.log("[X] decided " + studentEmail +',
    '  " | " + rating);',
    'console.error("skipped " + s.sisLogin);',
    'Logger.log("[X] sent to " + teacherEmail + " for " + report.studentName);',
    'Logger.log("[X] sent to " + teacherEmail);',
    'const studentEmail = x; Logger.log("row " + n);',
  ].join('\n');
  const out = scan.scanLogCalls(src, 's.js', []);
  assert.deepEqual(out.map((f) => f.where), ['s.js:2', 's.js:4', 's.js:5']);
  assert.ok(out.every((f) => f.kind === 'log-identifier'));
});

// ---- zip containers (.xlsx, .docx, .imscc, ...) ----------------------------
// A tiny zip writer: each member is [name, text or Buffer, method], method 8
// (deflate, the default) or 0 (stored).
const zlib = require('zlib');
// A made-up student address, assembled at run time so this file itself
// doesn't need an allowlist entry.
const FAKE = ['1234567', 'student.ccpsnet.net'].join('@');

function zip(members) {
  const locals = [];
  const central = [];
  let offset = 0;
  members.forEach(([name, content, method = 8]) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const n = Buffer.from(name);
    const crc = scan.crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, body);
    central.push(ch, n);
    offset += 30 + n.length + body.length;
  });
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function runContainer(buf, label = 'book.xlsx', allow = new Set()) {
  const out = [];
  const warnings = [];
  scan.scanContainer(buf, label, scan.KINDS, allow, out, warnings);
  return { out, warnings };
}

const at = (out) => out.map((f) => [f.where, f.kind]);

test('the CRC-32 the zips are built with is the standard one', () => {
  assert.equal(scan.crc32(Buffer.from('123456789')), 0xcbf43926);
});

test('xlsx: an address in xl/sharedStrings.xml is found as path!member:line, hash only', () => {
  const buf = zip([
    ['[Content_Types].xml', '<Types/>'],
    ['xl/sharedStrings.xml', '<?xml version="1.0"?>\n<sst><si><t>Name</t></si><si><t>' + FAKE + '</t></si></sst>'],
    ['xl/media/image1.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ]);
  const { out, warnings } = runContainer(buf);
  assert.deepEqual(at(out), [
    ['book.xlsx!xl/sharedStrings.xml:2', 'student-email'],
    ['book.xlsx!xl/sharedStrings.xml:2', 'id-shaped-email'],
  ]);
  assert.deepEqual(warnings, []);
  assert.ok(out.every((f) => /^[0-9a-f]{12}$/.test(f.hash)));
  assert.doesNotMatch(JSON.stringify(out), /1234567/);
});

test('docx: an address split across runs is found in the tag-stripped text, and only once', () => {
  const buf = zip([['word/document.xml',
    '<w:document><w:body><w:p><w:r><w:t>Contact</w:t></w:r></w:p><w:p><w:r><w:t>zz.top</w:t></w:r>' +
    '<w:r><w:rPr><w:b/></w:rPr><w:t>@student.ccpsnet.net</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>7654321@example.org</w:t></w:r></w:p></w:body></w:document>']]);
  assert.deepEqual(at(runContainer(buf, 'cards.docx').out), [
    ['cards.docx!word/document.xml:1', 'id-shaped-email'],
    ['cards.docx!word/document.xml#text:4', 'student-email'],
  ], 'the whole address is matched raw; the split one only once its tags are stripped');
});

test('a stored (method 0) member is read; a zip inside a zip is read; the allowlist still applies', () => {
  const stored = zip([['web_resources/a.html', '<p>x ' + FAKE + '</p>', 0]]);
  assert.deepEqual(at(runContainer(stored, 'c.imscc').out), [
    ['c.imscc!web_resources/a.html:1', 'student-email'],
    ['c.imscc!web_resources/a.html:1', 'id-shaped-email'],
  ]);
  const outer = zip([['inner.zip', zip([['notes.txt', 'mail 7654321@example.org', 0]]), 0]]);
  assert.deepEqual(at(runContainer(outer, 'o.zip').out), [['o.zip!inner.zip!notes.txt:1', 'id-shaped-email']]);
  assert.deepEqual(runContainer(outer, 'o.zip', new Set([scan.hash('7654321@example.org')])).out, []);
});

test('a container that cannot be opened is a finding, not a skip', () => {
  const name = 'xl/sharedStrings.xml';
  const good = zip([[name, '<sst><si><t>fine but long enough to deflate into several bytes</t></si></sst>']]);
  const cdAt = good.indexOf(Buffer.from([0x50, 0x4b, 1, 2]));
  const patched = (fn) => { const b = Buffer.from(good); fn(b); return b; };
  const cases = {
    'not a zip': Buffer.from('an encrypted Office file is not a zip either; this is just bytes'),
    'truncated': good.subarray(0, good.length - 10),
    'corrupt member data': patched((b) => { b[30 + name.length + 2] ^= 0xff; }),
    'encrypted member': patched((b) => b.writeUInt16LE(1, cdAt + 8)),
    'unsupported method': patched((b) => b.writeUInt16LE(14, cdAt + 10)),
  };
  assert.deepEqual(runContainer(good).out, []);
  Object.entries(cases).forEach(([why, buf]) => {
    const { out } = runContainer(buf);
    assert.deepEqual(at(out).map((x) => x[1]), ['unreadable-container'], why);
    assert.match(out[0].hash, /^[0-9a-f]{12}$/, why);
  });
});

test('a member over the 20 MB cap is skipped with a warning', () => {
  const big = Buffer.alloc(scan.MEMBER_CAP + 1, 0x61);
  const { out, warnings } = runContainer(zip([['xl/worksheets/sheet1.xml', big]]));
  assert.deepEqual(out, []);
  assert.deepEqual(at(warnings), [['book.xlsx!xl/worksheets/sheet1.xml', 'member-over-20MB']]);
});

test('working tree: containers are unpacked, other files are counted as not read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sds-tree-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'roster.xlsx'),
    zip([['xl/sharedStrings.xml', '<sst><si><t>' + FAKE + '</t></si></sst>']]));
  fs.writeFileSync(path.join(dir, 'broken.docx'), 'not a zip');
  ['a.png', 'b.png', 'c.PNG', 'd.pdf', 'Makefile'].forEach((f) => fs.writeFileSync(path.join(dir, f), 'x'));
  fs.writeFileSync(path.join(dir, 'ok.md'), 'nothing here');
  const r = scan.scanTree(scan.KINDS, new Set(), dir);
  assert.deepEqual(at(r.findings).sort(), [
    ['broken.docx', 'unreadable-container'],
    ['sub/roster.xlsx!xl/sharedStrings.xml:1', 'id-shaped-email'],
    ['sub/roster.xlsx!xl/sharedStrings.xml:1', 'student-email'],
  ]);
  assert.deepEqual(r.notRead, { '.png': 3, '.pdf': 1, '(no extension)': 1 });
  assert.equal(scan.formatNotRead(r.notRead), 'not read: .png 3, (no extension) 1, .pdf 1');
  assert.equal(scan.formatNotRead({}), 'not read: nothing');
});
