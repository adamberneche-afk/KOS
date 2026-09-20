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
const { findMissingOAuthScopes, findUnusedOAuthScopes, stripCommentsAndStrings } = require('../../tools/gas-lint/check.js');

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

// ── findUnusedOAuthScopes — the opposite direction ───────────────────────
//
// Rollout item #1 in the account's own audit ledger ("audit OAuth/API
// scopes against what the code actually calls") asked for over-broad-scope
// detection. findMissingOAuthScopes above catches under-declaration
// (needed but not granted); it does NOT catch a scope granted but never
// actually needed. This is that other half — deliberately narrower than
// "narrowest sufficient scope" (see this function's own header comment):
// it only flags a scope with ZERO matching service usage anywhere in the
// project, not a broader-than-strictly-needed one that's still genuinely
// in use (e.g. `drive` when `drive.file` would cover the real usage).

test('a declared scope backed by a real call anywhere in the project: no findings', () => {
  const files = [file('p.gs', 'function f() { DriveApp.getRootFolder(); }')];
  const declared = new Set(['https://www.googleapis.com/auth/drive']);
  assert.deepEqual(findUnusedOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('a declared scope with no matching service call anywhere: one finding naming the scope and the service(s) that would use it', () => {
  const files = [file('p.gs', 'function f() { DriveApp.getRootFolder(); }')]; // no GmailApp anywhere
  const declared = new Set([
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.readonly',
  ]);
  const findings = findUnusedOAuthScopes(files, declared, SERVICE_MAP);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].scope, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.deepEqual(findings[0].services, ['GmailApp']);
});

test('a scope only mentioned in a comment/string does not count as used — still flagged unused', () => {
  const files = [file('p.gs', '// GmailApp.createDraft() used to be called here\nfunction f() {}')];
  const declared = new Set(['https://www.googleapis.com/auth/gmail.readonly']);
  const findings = findUnusedOAuthScopes(files, declared, SERVICE_MAP);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].scope, 'https://www.googleapis.com/auth/gmail.readonly');
});

test('a scope with no matching entry in serviceMap at all is never flagged — unknown, stay silent', () => {
  // scope-map.json documents itself as "NOT exhaustive." A declared scope
  // this tool has no service mapping for must not be guessed at either way.
  const files = [file('p.gs', 'function f() {}')];
  const declared = new Set(['https://www.googleapis.com/auth/calendar.readonly']); // not in SERVICE_MAP
  assert.deepEqual(findUnusedOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('checked across ALL files in the project, not just one — a call in a different file still counts as used', () => {
  const files = [
    file('a.gs', 'function f() {}'),
    file('b.gs', 'function g() { GmailApp.getUserLabelByName("x"); }'),
  ];
  const declared = new Set(['https://www.googleapis.com/auth/gmail.readonly']);
  assert.deepEqual(findUnusedOAuthScopes(files, declared, SERVICE_MAP), []);
});

test('two services sharing one scope: the scope is used if EITHER service is called, not only the first one checked', () => {
  const map = { DriveApp: ['scope/drive'], Drive: ['scope/drive'] };
  const files = [file('p.gs', 'function f() { Drive.Files.get("x"); }')]; // only the Advanced Service, not DriveApp
  const declared = new Set(['scope/drive']);
  assert.deepEqual(findUnusedOAuthScopes(files, declared, map), []);
});

test('two services sharing one scope, neither called: one finding listing both service names', () => {
  const map = { DriveApp: ['scope/drive'], Drive: ['scope/drive'] };
  const files = [file('p.gs', 'function f() {}')];
  const declared = new Set(['scope/drive']);
  const findings = findUnusedOAuthScopes(files, declared, map);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].services, ['DriveApp', 'Drive']);
});

test('an empty declared-scopes set: no findings (nothing to judge as unused)', () => {
  const files = [file('p.gs', 'function f() {}')];
  assert.deepEqual(findUnusedOAuthScopes(files, new Set(), SERVICE_MAP), []);
});
