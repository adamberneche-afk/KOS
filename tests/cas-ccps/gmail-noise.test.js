'use strict';
// Plan L7 (2026-11-08), Gmail noise. Two parts:
//   1. The teacher's share of each student doc, form copy and snapshot doc
//      (02's shareToStudentDrive_, _intakeForm_, _makeFormSnapshotDoc_) and
//      the teacher's commenter share when a doc locks (04) go through
//      shareWithoutEmail_ (02): the Drive advanced service with
//      sendNotificationEmail false, DriveApp only when the service is off
//      or fails. A student's share is unchanged (DriveApp, with its email).
//   2. Every CAS mail goes through casMail_ (00): one subject prefix and
//      one sender name, the same recipient and body.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasFiles, makeDriveAdvancedMock } = require('../harness/gas-sandbox');

const ROOT = path.join(__dirname, '..', '..');
const S = (f) => path.join(ROOT, 'cas-ccps', 'scripts', f);
const FILES = [S('00_SharedConfig.js'), S('04_Form2_TurnInGate.js'), S('02_Form1_IntakeAndWorkspaceGenerator.js')];
const NAMES = ['casMail_', 'shareWithoutEmail_', 'shareToStudentDrive_', '_lockDocAfterSubmission_'];

function load(extra) {
  return loadGasFiles(FILES, NAMES, extra || {});
}

function newDoc(sandbox, title) {
  const doc = sandbox.DocumentApp.create(title || 'Unit 1 — doc');
  return sandbox.DriveApp.getFileById(doc.getId());
}

// ── Sharing ─────────────────────────────────────────────────────────────────

test('shareToStudentDrive_: the teacher is added without an email; the student is shared as before', () => {
  const Drive = makeDriveAdvancedMock();
  const { exported, sandbox } = load({ Drive });
  const file = newDoc(sandbox);

  exported.shareToStudentDrive_({}, file, '1234567@ccpsnet.net', 'teacher@ccpsnet.net');

  assert.equal(file._access('1234567@ccpsnet.net'), 'editor');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  assert.equal(Drive.__calls.length, 1, 'one quiet share: the teacher only');
  const c = Drive.__calls[0];
  assert.equal(c.fileId, file.getId());
  assert.deepEqual({ ...c.resource }, { type: 'user', role: 'commenter', emailAddress: 'teacher@ccpsnet.net' });
  assert.equal(c.optionalArgs.sendNotificationEmail, false);
});

test('shareToStudentDrive_ with a deferred share (a SCHEDULED doc): only the teacher, quietly', () => {
  const Drive = makeDriveAdvancedMock();
  const { exported, sandbox } = load({ Drive });
  const file = newDoc(sandbox);

  exported.shareToStudentDrive_({}, file, '', 'teacher@ccpsnet.net');

  assert.equal(file.getEditors().length, 0, 'the student gets it at release, not now');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  assert.equal(Drive.__calls.length, 1);
});

test('shareWithoutEmail_: without the advanced service it shares through DriveApp, same access', () => {
  const { exported, sandbox } = load();
  const file = newDoc(sandbox);
  assert.equal(exported.shareWithoutEmail_(file, 'teacher@ccpsnet.net', 'commenter'), 'email');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  const form = newDoc(sandbox, 'Unit 2 — form');
  assert.equal(exported.shareWithoutEmail_(form, 'teacher@ccpsnet.net', 'writer'), 'email');
  assert.equal(form._access('teacher@ccpsnet.net'), 'editor');
  const other = newDoc(sandbox, 'Unit 3');
  assert.equal(exported.shareWithoutEmail_(other, 'reader@ccpsnet.net', 'reader'), 'email');
  assert.equal(other._access('reader@ccpsnet.net'), 'viewer');
});

test('shareWithoutEmail_: a failing Drive call falls back to DriveApp, so access never depends on it', () => {
  const Drive = makeDriveAdvancedMock({ failWith: 'Drive API has not been used in project' });
  const { exported, sandbox } = load({ Drive });
  const file = newDoc(sandbox);
  assert.equal(exported.shareWithoutEmail_(file, 'teacher@ccpsnet.net', 'writer'), 'email');
  assert.equal(file._access('teacher@ccpsnet.net'), 'editor');
  assert.equal(Drive.__calls.length, 1);
});

test('shareWithoutEmail_: a blank address shares with no one', () => {
  const Drive = makeDriveAdvancedMock();
  const { exported, sandbox } = load({ Drive });
  const file = newDoc(sandbox);
  assert.equal(exported.shareWithoutEmail_(file, '  ', 'commenter'), '');
  assert.equal(Drive.__calls.length, 0);
  assert.equal(file.getEditors().length + file.getViewers().length, 0);
});

test('_lockDocAfterSubmission_: the teacher ends a commenter without an email; the student a viewer as before', () => {
  const Drive = makeDriveAdvancedMock();
  const { exported, sandbox } = load({ Drive });
  const file = newDoc(sandbox);
  file.addEditor('1234567@ccpsnet.net');
  file.addEditor('teacher@ccpsnet.net');

  const res = exported._lockDocAfterSubmission_(file.getId(), 'Teacher@ccpsnet.net');

  assert.equal(res.failed.length, 0);
  assert.equal(file._access('1234567@ccpsnet.net'), 'viewer');
  assert.equal(file._access('teacher@ccpsnet.net'), 'commenter');
  assert.ok(Drive.__calls.length >= 1);
  Drive.__calls.forEach((c) => {
    assert.equal(c.resource.emailAddress, 'teacher@ccpsnet.net', 'only the teacher is shared quietly');
    assert.equal(c.optionalArgs.sendNotificationEmail, false);
  });
});

test('every teacher share in intake goes through shareWithoutEmail_, and the Central Ledger has the Drive service', () => {
  const src = fs.readFileSync(S('02_Form1_IntakeAndWorkspaceGenerator.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//'));
  const direct = code.filter((l) => /\.(addEditor|addCommenter|addViewer)\(\s*teacherEmail\s*\)/.test(l));
  assert.deepEqual(direct, [], 'no DriveApp share with the teacher');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'cas-ccps', 'clasp', 'manifests', 'central-ledger.appsscript.json'), 'utf8'));
  const services = (manifest.dependencies && manifest.dependencies.enabledAdvancedServices) || [];
  assert.ok(services.some((s) => s.userSymbol === 'Drive' && s.serviceId === 'drive' && s.version === 'v3'),
    'shareWithoutEmail_ calls Drive.Permissions.create (v3)');
});

// ── One prefix, one sender name ─────────────────────────────────────────────

test('casMail_: positional form gets the prefix and the sender name; recipient and body unchanged', () => {
  const { exported } = load();
  const m = exported.casMail_('teacher@ccpsnet.net', 'Ready for students — Unit 1', 'Hello');
  assert.deepEqual(m, { to: 'teacher@ccpsnet.net', subject: '[CAS] Ready for students — Unit 1', body: 'Hello', name: 'CAS' });
});

test('casMail_: object form keeps its fields; a subject already prefixed is not prefixed twice', () => {
  const { exported } = load();
  const m = exported.casMail_({ to: 'a@ccpsnet.net', subject: '[CAS] Cron health warning — Stage 1', body: 'x', htmlBody: '<p>x</p>' });
  assert.equal(m.subject, '[CAS] Cron health warning — Stage 1');
  assert.equal(m.to, 'a@ccpsnet.net');
  assert.equal(m.htmlBody, '<p>x</p>');
  assert.equal(m.name, 'CAS');
  const own = exported.casMail_('a@ccpsnet.net', 'S', 'B', { name: 'Someone', cc: 'b@ccpsnet.net' });
  assert.equal(own.name, 'Someone', 'a caller that names the sender keeps it');
  assert.equal(own.cc, 'b@ccpsnet.net');
  assert.equal(own.subject, '[CAS] S');
});

test('casMail_ through MailApp: the recorded message carries the prefix and the name', () => {
  const { exported, sandbox } = load();
  sandbox.MailApp.sendEmail(exported.casMail_('t@ccpsnet.net', 'Hello', 'Body'));
  const sent = sandbox.MailApp.getSentMessages();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 't@ccpsnet.net');
  assert.equal(sent[0].subject, '[CAS] Hello');
  assert.equal(sent[0].name, 'CAS');
});

test('every MailApp/GmailApp send in cas-ccps/scripts goes through casMail_', () => {
  const dir = path.join(ROOT, 'cas-ccps', 'scripts');
  const misses = [];
  let count = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      if (line.trim().startsWith('//')) return;
      if (!/\b(MailApp|GmailApp)\.sendEmail\(/.test(line)) return;
      count++;
      if (!line.includes('.sendEmail(casMail_(')) misses.push(f + ':' + (i + 1));
    });
  }
  assert.deepEqual(misses, []);
  assert.ok(count >= 13, 'the sends found: ' + count);
});
