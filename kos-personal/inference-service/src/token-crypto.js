'use strict';
// ================================================================
// token-crypto.js — AES-256-GCM encryption for OAuth tokens at rest
// ================================================================
//
// WHY THIS EXISTS: users.refresh_token / users.access_token were stored
// as plaintext TEXT (see sql/schema.sql). A refresh token is a
// long-lived bearer credential for the FULL Drive scope this service
// asks every user to grant (google.js's getAuthUrl requests
// auth/drive, not auth/drive.file) — anyone holding a database dump, a
// backup, or a leaked log line carrying one can read and write that
// user's entire Drive indefinitely, with no password prompt, no 2FA
// challenge, and no further action from the user. Encrypting at rest
// means a stolen dump alone is not enough: the attacker also needs
// TOKEN_ENCRYPTION_KEY, which lives in the process environment or a
// secret manager, never in the database.
//
// AES-256-GCM with a fresh random 12-byte IV per encryption. The GCM
// auth tag is stored alongside the ciphertext, so a tampered value
// fails loudly at decrypt instead of silently yielding garbage that
// would then be handed to Google as a credential.
//
// Stored format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>". The version
// prefix is what makes a future key rotation or algorithm change
// possible without guessing at what an existing row contains, and it is
// also how decryptToken() recognises a pre-encryption plaintext row.
// ':' is safe as a separator — it is not in the base64 alphabet.

const crypto = require('crypto');

const VERSION   = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12;   // GCM's standard nonce length
const KEY_BYTES = 32;   // AES-256

// Parsed lazily and cached rather than at module load: requiring this
// file must not crash a process that never touches tokens (the test
// suite, a `npm run migrate` run). assertKeyConfigured() below is what
// makes a misconfigured *server* fail at boot instead of at the first
// user's OAuth callback.
let cachedKey = null;

// Accepts the documented hex form (openssl rand -hex 32 -> 64 chars) or
// base64. Buffer.from() silently truncates on malformed input for both
// encodings, so the byte-length check in loadKey() is what actually
// rejects a bad value — never assume a parse "succeeded" here.
function decodeKey(raw) {
  const trimmed = String(raw).trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex');
  }
  return Buffer.from(trimmed, 'base64');
}

function loadKey() {
  if (cachedKey) return cachedKey;

  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set — OAuth tokens cannot be stored or read ' +
      'without it. Generate one with: openssl rand -hex 32'
    );
  }

  const key = decodeKey(raw);
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes, got ${key.length}. ` +
      'Generate one with: openssl rand -hex 32'
    );
  }

  cachedKey = key;
  return cachedKey;
}

/**
 * Fails closed at server boot if the key is missing or malformed, so a
 * misconfigured deployment is caught on startup rather than when the
 * first user tries to connect their Drive. Called from server.js.
 */
function assertKeyConfigured() {
  loadKey();
}

/**
 * True if `stored` is a value this module wrote (as opposed to a
 * pre-encryption plaintext row). Exported so db.js can warn about
 * legacy rows without having to know the storage format.
 */
function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(VERSION + ':');
}

/**
 * @param  {string|null|undefined} plaintext
 * @returns {string|null|undefined} The encrypted form, or the input
 *   unchanged when there is nothing to encrypt — users.access_token is
 *   nullable, and null/'' must round-trip as themselves rather than
 *   becoming ciphertext of the empty string.
 */
function encryptToken(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;

  const key    = loadKey();
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct     = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

/**
 * @param  {string|null|undefined} stored  Value as held in the database.
 * @returns {string|null|undefined} The plaintext token.
 * @throws  If the value is encrypted but tampered with, truncated, or
 *   encrypted under a different key — all of which must fail loudly
 *   rather than return something that gets sent to Google as a credential.
 */
function decryptToken(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;

  // Pre-encryption rows: this service stored tokens as plaintext before
  // TOKEN_ENCRYPTION_KEY existed. Returning them as-is keeps an
  // already-connected user working instead of locking them out of their
  // own account on deploy day. db.js warns on each one, and the next
  // write of that row (any OAuth reconnect, any access-token refresh)
  // stores it encrypted. A deployment that has never stored a plaintext
  // token never reaches this branch.
  if (!isEncrypted(stored)) return stored;

  const parts = String(stored).split(':');
  if (parts.length !== 4) {
    throw new Error('Encrypted token is malformed — expected v1:<iv>:<tag>:<ciphertext>.');
  }

  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, loadKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),   // throws if the auth tag does not verify
  ]).toString('utf8');
}

// Test seam, same rationale as db.js exporting its `pool` (see
// test/credits.test.js's header): the key is cached on first use, so a
// test that changes TOKEN_ENCRYPTION_KEY between cases needs a way to
// drop the cache. Nothing in src/ calls this.
function _resetKeyCacheForTests() {
  cachedKey = null;
}

module.exports = {
  encryptToken,
  decryptToken,
  isEncrypted,
  assertKeyConfigured,
  _resetKeyCacheForTests,
};
