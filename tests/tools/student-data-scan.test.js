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
