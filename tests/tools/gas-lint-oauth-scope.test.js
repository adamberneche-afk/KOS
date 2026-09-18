'use strict';
// Regression tests for gas-lint's Check E — OAuth scope coverage.
//
// findMissingOAuthScopes() is the pure unit — it takes already-stripped
// source (same convention as evaluateWebAppAuthForProject(), see
// gas-lint-webapp-auth.test.js), not real file paths, so no repo I/O is
// involved here.
//
// WHY THIS FILE EXISTS: checkOAuthScopes() used to regex each file's RAW,
// un-stripped source, so a comment merely narrating history (e.g.
// "GmailApp.createDraft()") false-positived as real usage — found live
// when leader-hub/EmailBridge.gs's own header comment about a since-
// reverted GmailApp.createDraft() call tripped a missing-oauth-scope error
// after GmailApp's last real call site was removed. There was no test
// coverage for this check at all before that; this pins the fix (comment
// stripping) and the check's basic AND-of-scopes behavior so both can't
// silently regress again.

const test = require('node:test');
const assert = require('node:assert/strict');
const { findMissingOAuthScopes, stripCommentsAndStrings } = require('../../tools/gas-lint/check.js');

// Build a { path, stripped } fixture the way the real checker does.
function file(path, src) {
  return { path, stripped: stripCommentsAndStrings(src) };
}

const SERVICE_MAP = {
  GmailApp: ['https://www.googleapis.com/auth/gmail.readonly'],
  DriveApp: ['https://www.googleapis.com/auth/drive'],
};

test('a real call to a service whose scope is declared: no findings', () => {
  const files = [file('p.gs', 'function f() { GmailApp.getUserLabelByName("x"); }')];
  const declared = new Set(['https://www.googleapis.com/auth/gmail.readonly']);
  assert.deepEqual(findMissingOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('a real call to a service whose scope is NOT declared: one finding naming the missing scope', () => {
  const files = [file('p.gs', 'function f() { GmailApp.getUserLabelByName("x"); }')];
  const declared = new Set(); // no scopes declared at all
  const findings = findMissingOAuthScopes(files, declared, SERVICE_MAP);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].service, 'GmailApp');
  assert.deepEqual(findings[0].missing, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.equal(findings[0].file, 'p.gs');
});

test('a service mentioned only in a comment is not a real call: no findings', () => {
  // Regression case: leader-hub/EmailBridge.gs's own header narrates its
  // GmailApp history ("...reverted back to GmailApp.createDraft()...")
  // in a comment, with no live GmailApp.* call anywhere in the file once
  // that call site itself was removed.
  const files = [file('EmailBridge.gs', [
    '// HISTORY: this reverted back to GmailApp.createDraft(). Then later',
    '// it moved to MailApp.sendEmail() instead.',
    'function createBragDraft_(body) {',
    '  MailApp.sendEmail(body.to, body.subject, body.body);',
    '}',
  ].join('\n'))];
  const declared = new Set(); // gmail.readonly intentionally absent
  assert.deepEqual(findMissingOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('a service string appearing only inside a string literal is not a real call: no findings', () => {
  const files = [file('p.gs', 'const msg = "ask about GmailApp.createDraft() in review";')];
  const declared = new Set();
  assert.deepEqual(findMissingOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('multiple services, only one missing its scope: exactly one finding', () => {
  const files = [file('p.gs', [
    'function f() {',
    '  GmailApp.getUserLabelByName("x");',
    '  DriveApp.getRootFolder();',
    '}',
  ].join('\n'))];
  const declared = new Set(['https://www.googleapis.com/auth/drive']); // only DriveApp's
  const findings = findMissingOAuthScopes(files, declared, SERVICE_MAP);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].service, 'GmailApp');
});

test('a service requiring multiple scopes: AND semantics — missing lists every undeclared one', () => {
  const map = { X: ['scope/a', 'scope/b', 'scope/c'] };
  const files = [file('p.gs', 'X.doThing();')];
  const declared = new Set(['scope/a']); // only one of three
  const findings = findMissingOAuthScopes(files, declared, map);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].missing, ['scope/b', 'scope/c']);
});

test('no service usage at all across any file: no findings', () => {
  const files = [file('p.gs', 'function helper_() { return 1; }')];
  assert.deepEqual(findMissingOAuthScopes(files, new Set(), SERVICE_MAP), []);
});
