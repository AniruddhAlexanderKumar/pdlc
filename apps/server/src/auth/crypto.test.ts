import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, hashToken, newToken, verifyPassword } from './crypto.js';

test('scrypt uses independent salts, stored parameters, normalization and constant-time comparison', async () => {
  const password = 'Synthetic-fullwidth-Ａ-123!';
  const [a, b] = await Promise.all([hashPassword(password), hashPassword(password)]);
  assert.notEqual(a, b);
  const [algorithm, n, r, p, salt, key] = a.split('$');
  assert.deepEqual([algorithm, n, r, p], ['scrypt', '32768', '8', '1']);
  assert.equal(Buffer.from(salt, 'base64').length, 16); assert.equal(Buffer.from(key, 'base64').length, 64);
  assert(!a.includes(password));
  assert(await verifyPassword('Synthetic-fullwidth-A-123!', a));
  assert.equal(await verifyPassword('Synthetic-fullwidth-A-123?', a), false);
  assert.equal(await verifyPassword(password, 'not-a-hash'), false);
});
test('session token hashing uses random 32-byte values and does not store plaintext', () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a.token, b.token); assert.equal(Buffer.from(a.token, 'base64url').length, 32);
  assert.match(a.hash, /^[0-9a-f]{64}$/); assert.equal(a.hash, hashToken(a.token)); assert(!a.hash.includes(a.token));
});
