'use strict';
// tools/student-data-scan: the staff-email kind. A name-shaped address at
// the district domain is a finding unless staff-allow.json lists it.
// Every address here is made up, and assembled at run time so this file
// doesn't trip the scan itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const scan = require('../../tools/student-data-scan/check.js');

const DOMAIN = 'ccpsnet.net';
const at = (local) => local + '@' + DOMAIN;
const STAFF = at('zzfirst_qqlast');
const DOTTED = at('zzfirst.qqlast');

function kinds(text, allow = new Set()) {
  const out = [];
  scan.scanText(text, 'f.md', scan.KINDS, allow, out);
  return out.map((f) => f.kind);
}

test('a seeded staff address is a staff-email finding, by hash, never by text', () => {
  const out = [];
  scan.scanText('Contact: ' + STAFF + ', (000) 000-0000', 'f.md', scan.KINDS, new Set(), out);
  assert.deepEqual(out.map((f) => [f.where, f.kind]), [['f.md:1', 'staff-email']]);
  assert.match(out[0].hash, /^[0-9a-f]{12}$/);
  assert.doesNotMatch(JSON.stringify(out), /zzfirst|qqlast/);
  assert.deepEqual(kinds(DOTTED), ['staff-email'], 'first.last is name-shaped too');
  assert.deepEqual(kinds(STAFF.toUpperCase()), ['staff-email'], 'case does not matter');
});

test('role, test and student addresses are not staff-email findings', () => {
  assert.deepEqual(kinds([at('teacher'), at('admin'), at('noreply'), at('other-student')].join(' ')), []);
  assert.deepEqual(kinds('zz_top@student.' + DOMAIN), ['student-email'], 'a student address stays a student finding');
  assert.deepEqual(kinds(at('1234567')), ['id-shaped-email'], 'an ID-shaped address stays ID-shaped');
  assert.deepEqual(kinds('zzfirst_qqlast@example.org'), [], 'another domain is not district staff');
});

test('an allowlisted staff address passes; the allowlist is read by address', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sds-staff-'));
  const file = path.join(dir, 'staff-allow.json');
  fs.writeFileSync(file, JSON.stringify({ addresses: [{ address: STAFF, why: 'test' }, { why: 'no address' }] }));
  const hashes = scan.loadStaffAllow(file);
  assert.deepEqual(hashes, [scan.hash(STAFF)]);
  assert.deepEqual(kinds(STAFF + ' and ' + DOTTED, new Set(hashes)), ['staff-email'],
    'only the listed address is allowed');
  assert.deepEqual(scan.loadStaffAllow(path.join(dir, 'missing.json')), []);
});

test('the repo allowlist lists only name-shaped district addresses, each with a reason', () => {
  const file = path.join(__dirname, '..', '..', 'tools', 'student-data-scan', 'staff-allow.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8')).addresses;
  assert.ok(list.length > 0);
  list.forEach((x) => {
    assert.deepEqual(kinds(x.address), ['staff-email'], 'an entry the rule would never flag is dead weight');
    assert.ok(x.why && x.why.length > 10, 'each entry says why it may stay');
  });
  const allow = scan.loadAllow();
  list.forEach((x) => assert.ok(allow.has(scan.hash(x.address)), 'loadAllow() includes the staff list'));
});
