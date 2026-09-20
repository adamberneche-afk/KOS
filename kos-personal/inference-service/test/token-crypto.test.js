'use strict';
// Regression tests for token-crypto.js and db.js's decryptUserRow — the
// at-rest encryption for users.access_token / users.refresh_token.
//
// WHY THIS FILE EXISTS: these columns held plaintext OAuth tokens. A
// refresh token is a long-lived bearer credential for the full Drive
// scope this service requests, so anyone with a database dump had
// indefinite read/write access to every connected user's entire Drive.
// The properties worth pinning here are the ones whose silent failure
// would be worst: that a tampered ciphertext throws instead of
// decrypting to garbage that then gets sent to Google as a credential,
// that a missing key fails loudly rather than storing plaintext, and
// that pre-encryption rows keep working instead of locking out existing
// users on deploy day.
//
// Everything below is a pure unit — no Postgres, no fake pool. db.js's
// decryptUserRow operates on a plain row object, and the encrypt-on-write
// path (upsertUser/updateUserTokens) is a one-line call to the same
// encryptToken covered here.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const tc = require(path.join(__dirname, '..', 'src', 'token-crypto.js'));

const KEY_A = 'a'.repeat(64);                     // 32 bytes, hex
const KEY_B = 'b'.repeat(64);                     // a different 32 bytes
const KEY_A_BASE64 = Buffer.from(KEY_A, 'hex').toString('base64');

// The key is cached on first use, so any test that changes it has to drop
// the cache on both sides — otherwise a later test inherits an earlier
// test's key and passes for the wrong reason.
function withKey(value, fn) {
  const previous = process.env.TOKEN_ENCRYPTION_KEY;
  if (value === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = value;
  tc._resetKeyCacheForTests();
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = previous;
    tc._resetKeyCacheForTests();
  }
}

// ── Round trip ───────────────────────────────────────────────────

test('a token round-trips through encrypt/decrypt unchanged', () => {
  withKey(KEY_A, () => {
    const token = '1//0abcDEF-refresh-token_value.with~punctuation';
    assert.equal(tc.decryptToken(tc.encryptToken(token)), token);
  });
});

test('the stored form is not the plaintext, and is recognisable as encrypted', () => {
  withKey(KEY_A, () => {
    const stored = tc.encryptToken('secret-token');
    assert.ok(!stored.includes('secret-token'), 'plaintext must not survive in the stored value');
    assert.ok(stored.startsWith('v1:'), 'stored form must carry the version prefix');
    assert.equal(stored.split(':').length, 4, 'expected v1:<iv>:<tag>:<ciphertext>');
    assert.equal(tc.isEncrypted(stored), true);
  });
});

test('encrypting the same token twice produces different ciphertext (fresh IV per call)', () => {
  withKey(KEY_A, () => {
    const a = tc.encryptToken('same-token');
    const b = tc.encryptToken('same-token');
    assert.notEqual(a, b, 'a reused IV would leak that two users hold the same token');
    assert.equal(tc.decryptToken(a), 'same-token');
    assert.equal(tc.decryptToken(b), 'same-token');
  });
});

test('a base64 key works as well as a hex key', () => {
  const stored = withKey(KEY_A, () => tc.encryptToken('token-under-hex-key'));
  withKey(KEY_A_BASE64, () => {
    assert.equal(tc.decryptToken(stored), 'token-under-hex-key',
      'the same 32 bytes must decode identically whether given as hex or base64');
  });
});

// ── Tamper detection ─────────────────────────────────────────────

test('a tampered ciphertext throws rather than decrypting to garbage', () => {
  withKey(KEY_A, () => {
    const parts = tc.encryptToken('real-token').split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0xff;                                  // flip a bit
    parts[3] = ct.toString('base64');
    assert.throws(() => tc.decryptToken(parts.join(':')));
  });
});

test('a tampered auth tag throws', () => {
  withKey(KEY_A, () => {
    const parts = tc.encryptToken('real-token').split(':');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] ^= 0xff;
    parts[2] = tag.toString('base64');
    assert.throws(() => tc.decryptToken(parts.join(':')));
  });
});

test('a truncated/malformed encrypted value throws with a clear message', () => {
  withKey(KEY_A, () => {
    assert.throws(() => tc.decryptToken('v1:only:three'), /malformed/i);
  });
});

test('a value encrypted under a different key throws instead of returning something usable', () => {
  const stored = withKey(KEY_A, () => tc.encryptToken('token-under-key-a'));
  withKey(KEY_B, () => {
    assert.throws(() => tc.decryptToken(stored),
      'decrypting under the wrong key must fail loudly - a silently wrong token would be sent to Google');
  });
});

// ── Fail closed on a missing/bad key ─────────────────────────────

test('encrypting with no key configured throws an actionable error, never stores plaintext', () => {
  withKey(undefined, () => {
    assert.throws(() => tc.encryptToken('token'), /TOKEN_ENCRYPTION_KEY is not set/);
  });
});

test('a key of the wrong length is rejected, not silently padded or truncated', () => {
  withKey('abcd', () => {
    assert.throws(() => tc.encryptToken('token'), /must decode to exactly 32 bytes/);
  });
});

test('assertKeyConfigured throws when the key is missing and is silent when it is valid', () => {
  withKey(undefined, () => assert.throws(() => tc.assertKeyConfigured()));
  withKey(KEY_A, () => assert.doesNotThrow(() => tc.assertKeyConfigured()));
});

// ── Null / empty handling ────────────────────────────────────────
// users.access_token is nullable; null and '' must round-trip as
// themselves rather than becoming ciphertext of the empty string.

test('null, undefined and empty string pass through both directions unchanged', () => {
  withKey(KEY_A, () => {
    for (const value of [null, undefined, '']) {
      assert.equal(tc.encryptToken(value), value);
      assert.equal(tc.decryptToken(value), value);
    }
  });
});

// ── Legacy plaintext rows ────────────────────────────────────────

test('a pre-encryption plaintext value is returned as-is rather than throwing', () => {
  withKey(KEY_A, () => {
    const legacy = '1//0legacy-plaintext-refresh-token';
    assert.equal(tc.isEncrypted(legacy), false);
    assert.equal(tc.decryptToken(legacy), legacy,
      'locking existing users out of their own account on deploy day is worse than reading one more plaintext row');
  });
});

// ── db.decryptUserRow ────────────────────────────────────────────
// The single seam where encryption is undone. Required here because the
// worker hands the row it returns straight to google.js, which reads
// access_token/refresh_token off it.

const db = require(path.join(__dirname, '..', 'src', 'db.js'));

test('decryptUserRow decrypts both token fields and leaves every other column alone', () => {
  withKey(KEY_A, () => {
    const row = {
      id: 'user-1',
      email: 'someone@example.com',
      credit_balance: 42,
      access_token: tc.encryptToken('access-abc'),
      refresh_token: tc.encryptToken('refresh-xyz'),
    };
    const out = db.decryptUserRow(row);
    assert.equal(out.access_token, 'access-abc');
    assert.equal(out.refresh_token, 'refresh-xyz');
    assert.equal(out.email, 'someone@example.com');
    assert.equal(out.credit_balance, 42);
    assert.equal(out.id, 'user-1');
  });
});

test('decryptUserRow handles a null access_token (the column is nullable)', () => {
  withKey(KEY_A, () => {
    const out = db.decryptUserRow({
      id: 'user-2',
      access_token: null,
      refresh_token: tc.encryptToken('refresh-only'),
    });
    assert.equal(out.access_token, null);
    assert.equal(out.refresh_token, 'refresh-only');
  });
});

test('decryptUserRow passes a legacy plaintext row through without throwing', () => {
  withKey(KEY_A, () => {
    const out = db.decryptUserRow({
      id: 'user-3',
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
    });
    assert.equal(out.access_token, 'legacy-access');
    assert.equal(out.refresh_token, 'legacy-refresh');
  });
});

test('decryptUserRow passes null/undefined straight through (no user found)', () => {
  withKey(KEY_A, () => {
    assert.equal(db.decryptUserRow(null), null);
    assert.equal(db.decryptUserRow(undefined), undefined);
  });
});
