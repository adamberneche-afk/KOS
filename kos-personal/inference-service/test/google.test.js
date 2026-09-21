'use strict';
// Regression test for google.js's getAuthUrl — specifically the OAuth
// scope list (Open Items #6).
//
// WHY THIS EXISTS: getAuthUrl used to request 'auth/drive', full
// read/write access to a user's entire Google Drive, even though nothing
// in this service ever calls the Drive API — every real call is
// google.docs() (readDocumentText/writeDocumentContent) or google.sheets()
// (setFlowComplete/readOperatorContext), both fully authorized by the
// 'documents'/'spreadsheets' scopes already requested. Fixed by dropping
// Drive access entirely rather than narrowing to 'auth/drive.file' (this
// item's original proposed fix) — drive.file only grants access to files
// this app created or the user picked through an app-scoped picker,
// neither of which ever happens here (session docs are created by a
// separate Apps Script project this service never touches via Drive), so
// it would have added a scope that grants nothing real, same as 'drive'
// does today. This test pins the scope list so a future change can't
// silently reintroduce Drive access (or any other scope) without a
// deliberate, reviewed decision to do so.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// getAuthUrl only builds a URL — no real network call, no DB, no
// credentials required to exist for this to run.
process.env.GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || 'https://example.com/auth/callback';

const google = require(path.join(__dirname, '..', 'src', 'google.js'));

function scopesFromAuthUrl(url) {
  const parsed = new URL(url);
  const raw = parsed.searchParams.get('scope') || '';
  return raw.split(' ').filter(Boolean);
}

test('getAuthUrl requests Docs, Sheets and userinfo scopes, and nothing else', () => {
  const url = google.getAuthUrl('some-csrf-state');
  const scopes = scopesFromAuthUrl(url);

  assert.deepEqual(new Set(scopes), new Set([
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ]));
});

test('getAuthUrl never requests Drive access, in any form', () => {
  const url = google.getAuthUrl('some-csrf-state');
  const scopes = scopesFromAuthUrl(url);
  // Both the original over-broad scope and the narrower alternative this
  // item considered and rejected (see this file's own header) — pinned
  // separately so either one reappearing fails this test specifically,
  // not just the exact-set check above.
  assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive'));
  assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive.file'));
});

test('getAuthUrl passes the CSRF state through unchanged', () => {
  const url = google.getAuthUrl('csrf-token-abc123');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('state'), 'csrf-token-abc123');
});

test('getAuthUrl requests offline access and forces consent, so a refresh_token always comes back', () => {
  const url = google.getAuthUrl('some-csrf-state');
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('access_type'), 'offline');
  assert.equal(parsed.searchParams.get('prompt'), 'consent');
});
