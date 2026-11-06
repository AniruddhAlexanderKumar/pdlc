import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';

/** The key must be provisioned externally; do not log or persist it in the DB. */
export function founderEncryptionKey(encoded: string): Buffer {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Invalid founder encryption key');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('Invalid founder encryption key');
  return key;
}

export function encryptFounderTotp(secret: string, founderId: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('Invalid founder encryption key');
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`sv-founder-totp-v1:${founderId}`, 'utf8'));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function decryptFounderTotp(value: string, founderId: string, key: Buffer): string {
  const parts = value.split('.');
  if (key.length !== 32 || parts.length !== 4 || parts[0] !== 'v1' || !parts.slice(1).every((s) => /^[A-Za-z0-9_-]+$/.test(s))) throw new Error('Invalid encrypted founder MFA secret');
  const nonce = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  if (nonce.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted founder MFA secret');
  const cipher = createDecipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`sv-founder-totp-v1:${founderId}`, 'utf8'));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(Buffer.from(parts[3], 'base64url')), cipher.final()]).toString('utf8');
}

export function newFounderTotp(email: string): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({ issuer: 'Solution Velocity', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: new OTPAuth.Secret({ size: 20 }) });
  return { secret: totp.secret.base32, uri: totp.toString() };
}

/** Returns the matched step for transactional replay protection, or null. */
export function verifyFounderTotp(secret: string, code: string, lastStep: number | null, timestamp = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token: code, window: 1, timestamp });
  if (delta === null) return null;
  const step = Math.floor(timestamp / 30_000) + delta;
  return lastStep !== null && step <= lastStep ? null : step;
}
