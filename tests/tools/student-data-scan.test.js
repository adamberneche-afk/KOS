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
