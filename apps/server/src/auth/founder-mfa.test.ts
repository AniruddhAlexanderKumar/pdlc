import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptFounderTotp, encryptFounderTotp, founderEncryptionKey, verifyFounderTotp } from './founder-mfa.js';

test('TOTP matches RFC 6238 vector and rejects replay', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(verifyFounderTotp(secret, '287082', null, 59_000), 1);
  assert.equal(verifyFounderTotp(secret, '287082', 1, 59_000), null);
  assert.equal(verifyFounderTotp(secret, '000000', null, 59_000), null);
});

test('MFA secret encryption authenticates ciphertext, identity and key', () => {
  const key = founderEncryptionKey(randomBytes(32).toString('base64'));
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const value = encryptFounderTotp(secret, 'founder-one', key);
  assert(!value.includes(secret));
  assert.equal(decryptFounderTotp(value, 'founder-one', key), secret);
  assert.throws(() => decryptFounderTotp(value, 'founder-two', key));
  assert.throws(() => decryptFounderTotp(value, 'founder-one', randomBytes(32)));
  const pieces = value.split('.'); pieces[2] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => decryptFounderTotp(pieces.join('.'), 'founder-one', key));
  assert.throws(() => founderEncryptionKey('invalid'));
});
